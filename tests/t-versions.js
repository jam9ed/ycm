/* The landing page: four directions and the tools behind them. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { c ? (pass++, console.log('PASS  ' + m + (x ? '  — ' + x : '')))
                            : (fail++, console.log('FAIL  ' + m + (x ? '  — ' + x : ''))); };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('versions.html');
const d = new JSDOM(html, { url: 'http://localhost/versions.html' }).window.document;
const $$ = s => [...d.querySelectorAll(s)];

// --- the four versions -----------------------------------------------------
const VERSIONS = ['index.html', 'downhome.html', 'v3.html', 'v4.html'];
const cards = $$('.vx-card');
ok('all four versions are on the page', cards.length === 4, cards.length + '');
ok('and each links to a version that exists',
   VERSIONS.every(v => cards.some(c => c.getAttribute('href') === v) && fs.existsSync(path.join(root, v))));
ok('they run newest last', cards[3].getAttribute('href') === 'v4.html', cards[3].getAttribute('href'));
ok('the newest is marked as such', /newest/i.test(cards[3].querySelector('.vx-tag').textContent));
ok('every version is described, not just named',
   cards.every(c => (c.querySelector('p').textContent || '').trim().length > 90),
   cards.map(c => c.querySelector('p').textContent.trim().length).join(','));
ok('each carries a short summary of what it does',
   cards.every(c => c.querySelectorAll('.vx-meta li').length >= 3));

// --- the tools -------------------------------------------------------------
const TOOLS = ['admin.html', 'videos.html', 'images.html'];
const tools = $$('.vx-tool');
ok('the working pages are listed too', tools.length === TOOLS.length, tools.length + '');
ok('and each of those exists',
   TOOLS.every(t => tools.some(x => x.getAttribute('href') === t) && fs.existsSync(path.join(root, t))));
ok('tools are kept apart from the designs',
   tools.every(t => !t.classList.contains('vx-card')));

// --- pictures --------------------------------------------------------------
const shots = $$('img[src]');
ok('every version shows a screenshot', shots.length >= 7, shots.length + ' images');
ok('and every screenshot is on disk',
   shots.every(i => fs.existsSync(path.join(root, i.getAttribute('src')))),
   shots.map(i => i.getAttribute('src')).filter(s => !fs.existsSync(path.join(root, s))).join(', '));
ok('each is described for anyone who cannot see it',
   shots.every(i => (i.getAttribute('alt') || '').length > 0));
{
  const dir = path.join(root, 'assets/img/versions');
  const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  ok('the screenshots stay small', bytes < 1024 * 1024, (bytes / 1024).toFixed(0) + 'KB for 7');
}

// --- it stands on its own --------------------------------------------------
// ycm.css defines .sheet as a fixed modal overlay, which is how the photo
// library first rendered as a pile on top of its own header. This page loads
// no shared stylesheet, and prefixes everything regardless.
ok('it loads no shared stylesheet', !/<link[^>]+stylesheet/i.test(html));
{
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
  const own = [...style.matchAll(/(?:^|[\s,>])\.([A-Za-z][\w-]*)/g)].map(m => m[1]);
  ok('and prefixes every class it defines',
     own.every(c => c.startsWith('vx-')), [...new Set(own.filter(c => !c.startsWith('vx-')))].join(' '));
}
ok('it is behind the same preview gate as the rest', /assets\/js\/gate\.js/.test(html));
ok('it says plainly that none of this is public', /nothing here is public/i.test(d.body.textContent));

console.log('\n' + fail + ' failures of ' + (pass + fail));
process.exit(fail ? 1 : 0);
