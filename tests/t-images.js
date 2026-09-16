/* The photo library: one contact sheet of every photograph off the old site. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { c ? (pass++, console.log('PASS  ' + m + (x ? '  — ' + x : '')))
                            : (fail++, console.log('FAIL  ' + m + (x ? '  — ' + x : ''))); };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'images.html'), 'utf8'), {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/images.html',
});
const w = dom.window, d = w.document;
w.fetch = () => Promise.resolve({ ok: false });          // no saved config in this run
w.eval(fs.readFileSync(path.join(root, 'assets/js/media-library.js'), 'utf8'));
w.eval([...d.querySelectorAll('script')].filter(s => !s.src).map(s => s.textContent).join('\n'));

const POOL = w.YCM_POOL;
const shots = () => [...d.querySelectorAll('.shot')];

ok('every photo gets a tile', shots().length === POOL.length, shots().length + ' of ' + POOL.length);
ok('tiles load a thumbnail, not the original',
   shots().every(s => /^assets\/img\/thumbs\//.test(s.querySelector('img').getAttribute('src'))));
ok('every thumbnail exists on disk',
   shots().every(s => fs.existsSync(path.join(root, s.querySelector('img').getAttribute('src')))),
   shots().filter(s => !fs.existsSync(path.join(root, s.querySelector('img').getAttribute('src')))).length + ' missing');
ok('thumbnails are lazy', shots().every(s => s.querySelector('img').getAttribute('loading') === 'lazy'));

// thumbnails must be genuinely smaller than what they stand in for
{
  const sample = POOL.slice(0, 40);
  const bigger = sample.filter(p => {
    const t = path.join(root, p.file.replace(/^assets\/img\//, 'assets/img/thumbs/').replace(/\.[a-z]+$/i, '.jpg'));
    return fs.existsSync(t) && fs.statSync(t).size >= fs.statSync(path.join(root, p.file)).size;
  });
  ok('a thumbnail weighs less than its original', bigger.length === 0, bigger.length + ' of 40 did not');
}

// --- origin filters --------------------------------------------------------
const origins = {};
POOL.forEach(p => origins[p.origin] = (origins[p.origin] || 0) + 1);
const btns = [...d.querySelectorAll('#bar button[data-og]')].map(b => b.dataset.og);
ok('a filter per origin, plus All', btns.length === Object.keys(origins).length + 1, btns.join(','));
ok('the biggest group is offered first', btns[1] === 'site', btns[1]);

const site = d.querySelector('#bar button[data-og="site"]');
site.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('filtering by origin narrows the sheet', shots().length === origins.site, shots().length + '');
ok('and only shows that origin',
   shots().every(s => s.querySelector('.og').textContent === 'site'));

d.querySelector('#bar button[data-og="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('All puts them back', shots().length === POOL.length);

// --- search ----------------------------------------------------------------
const q = d.getElementById('q');
q.value = 'live_0';
q.dispatchEvent(new w.Event('input'));
ok('filename search works', shots().length > 0 && shots().every(s => s.querySelector('.nm').textContent.includes('live_0')),
   shots().length + ' hits');
q.value = 'zzz-nothing';
q.dispatchEvent(new w.Event('input'));
ok('a search with no hits says so', shots().length === 0 && !d.getElementById('empty').hidden);
q.value = '';
q.dispatchEvent(new w.Event('input'));

// --- use filter ------------------------------------------------------------
const suggested = POOL.filter(p => p.suggest).length;
d.querySelector('#bar2 button[data-use="suggested"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('photos carrying a suggestion can be isolated', shots().length === suggested, shots().length + ' of ' + suggested);
ok('those tiles are badged', shots().every(s => !!s.querySelector('.tag.sug')));
d.querySelector('#bar2 button[data-use="loose"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('so can the ones never used', shots().length === POOL.length - suggested, shots().length + '');
d.querySelector('#bar2 button[data-use="all"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

// --- lightbox --------------------------------------------------------------
const box = d.getElementById('box');
ok('the lightbox starts closed', box.hidden === true);
shots()[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('clicking a tile opens it', box.hidden === false);
ok('it reaches for the full-size original',
   d.getElementById('boximg').getAttribute('src') === POOL[3].file, d.getElementById('boximg').getAttribute('src'));
ok('and names the file', d.getElementById('boxmeta').textContent.includes(POOL[3].file.split('/').pop()));
d.dispatchEvent(Object.assign(new w.KeyboardEvent('keydown', { key: 'ArrowRight' })));
ok('arrow keys step through', d.getElementById('boximg').getAttribute('src') === POOL[4].file);
d.dispatchEvent(Object.assign(new w.KeyboardEvent('keydown', { key: 'Escape' })));
ok('escape closes it', box.hidden === true);

console.log('\n' + fail + ' failures of ' + (pass + fail));
process.exit(fail ? 1 : 0);
