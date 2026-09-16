const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = '/Users/joel/Documents/coding/ycm';
let pass = 0, fail = 0;
const ok = (m, c, x) => { c ? (pass++, console.log('PASS  ' + m + (x ? '  — ' + x : ''))) : (fail++, console.log('FAIL  ' + m + (x ? '  — ' + x : ''))); };

const dom = new JSDOM(fs.readFileSync(path.join(root, 'videos.html'), 'utf8'), {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/videos.html',
});
const w = dom.window, d = w.document;
w.HTMLMediaElement.prototype.load = function () {};
w.HTMLMediaElement.prototype.pause = function () {};
w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
w.eval(fs.readFileSync(path.join(root, 'assets/js/media-library.js'), 'utf8'));
w.eval([...d.querySelectorAll('script')].filter(s => !s.src).map(s => s.textContent).join('\n'));

const total = w.YCM_VIDEOS.length;
const cards = d.querySelectorAll('.clip');
ok('every video gets a card', cards.length === total, cards.length + ' of ' + total);
ok('every card shows its poster', [...cards].every(c => /^assets\/img\/posters\/.+\.jpg$/.test(c.querySelector('img').getAttribute('src'))));
ok('every card links the wix source', [...cards].every(c => /^https:\/\/video\.wixstatic\.com\//.test(c.querySelector('a.src').href)));
ok('no <video> mounts before a click', d.querySelectorAll('video').length === 0);

const first = cards[0], second = cards[1];
first.querySelector('.play').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
let v = first.querySelector('video');
ok('clicking a frame mounts a player', !!v);
ok('the player gets the wix src', v && /video\.wixstatic\.com/.test(v.getAttribute('src')));
ok('the player keeps the poster', v && v.getAttribute('poster') === w.YCM_VIDEOS[0].file);
ok('the play button steps aside', first.querySelector('.play').hidden === true);

second.querySelector('.play').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('only one plays at a time', d.querySelectorAll('video').length === 1);
ok('the first is torn down', !first.querySelector('video') && first.querySelector('.play').hidden === false);

const qs = [...d.querySelectorAll('#bar button[data-q]')].map(b => b.dataset.q);
ok('a filter per quality present', qs.join(',') === 'all,360p,480p,720p', qs.join(','));
const btn720 = d.querySelector('#bar button[data-q="720p"]');
btn720.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('filtering narrows the sheet', d.querySelectorAll('.clip').length === w.YCM_VIDEOS.filter(x => x.quality === '720p').length, d.querySelectorAll('.clip').length + '');
ok('filtering stops playback', d.querySelectorAll('video').length === 0);
ok('the count reads out', /^\d+ of \d+$/.test(d.getElementById('count').textContent), d.getElementById('count').textContent);

console.log('\n' + fail + ' failures of ' + (pass + fail));
process.exit(fail ? 1 : 0);
