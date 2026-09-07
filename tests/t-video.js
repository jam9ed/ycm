const { JSDOM } = require('jsdom');
const fs = require('fs');
const code = fs.readFileSync(require('path').join(__dirname,'..','assets/js/lazy-video.js'), 'utf8');

// Controllable observers so we can simulate scrolling.
const obs = { poster: null, keep: null };
const dom = new JSDOM('<!doctype html><body></body>', { url:'http://x/', runScripts:'dangerously', pretendToBeVisual:true,
  beforeParse(w) {
    let i = 0;
    w.IntersectionObserver = class {
      constructor(cb, o) { this.cb = cb; this.els = new Set(); (i++ === 0 ? obs : obs).x = null;
        if (!obs.poster) obs.poster = this; else if (!obs.keep) obs.keep = this; }
      observe(el) { this.els.add(el); }
      unobserve(el) { this.els.delete(el); }
      fire(el, isIntersecting) { this.cb([{ target: el, isIntersecting }]); }
    };
    w.matchMedia = () => ({ matches:false });
    w.HTMLMediaElement.prototype.play = function () { this.dispatchEvent(new w.Event('playing')); return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () { this.dispatchEvent(new w.Event('pause')); };
    w.HTMLMediaElement.prototype.load = function () {};
    w.HTMLMediaElement.prototype.canPlayType = () => '';
  }});
const w = dom.window;
w.eval(code);

const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);
const d = w.document;
const V = () => d.querySelectorAll('video').length;

// Build a page of 94 players — exactly what the live home page does today.
d.body.innerHTML = Array.from({ length: 94 }, (_, i) =>
  `<ycm-video poster="p${i}.jpg" src="v${i}.mp4" duration="1:0${i%10}" label="Boat ${i}"></ycm-video>`).join('');

const els = [...d.querySelectorAll('ycm-video')];
chk('94 players declared', els.length === 94);
chk('stats see them all', w.ycmVideoStats.get().total === 94, w.ycmVideoStats.get().total);
chk('ZERO <video> elements before scroll', V() === 0, V() + ' mounted');
chk('no posters fetched before scroll', els.every(e => !e.querySelector('.v-poster').getAttribute('src')));

// Scroll three into view.
[0,1,2].forEach(i => obs.poster.fire(els[i], true));
chk('posters load only for visible players', els.slice(0,3).every(e => e.querySelector('.v-poster').src.endsWith('.jpg')));
chk('offscreen posters still unfetched', !els[50].querySelector('.v-poster').getAttribute('src'));
chk('still ZERO <video> after scrolling', V() === 0, V() + ' mounted');

// Intent.
els[0].play();
chk('click mounts exactly one <video>', V() === 1, V() + ' mounted');
chk('state = playing', els[0].dataset.state === 'playing', els[0].dataset.state);
chk('src attached', els[0].querySelector('video').src.endsWith('v0.mp4'));

// Second video -> first must stop.
els[1].play();
chk('single playback: only one is playing',
    els[0].dataset.state !== 'playing' && els[1].dataset.state === 'playing',
    `[0]=${els[0].dataset.state} [1]=${els[1].dataset.state}`);
chk('both decoders live while paused-but-near', V() === 2, V() + ' mounted');

// Scroll far away -> teardown.
obs.keep.fire(els[0], false);
chk('scrolling away frees the decoder', V() === 1, V() + ' mounted');
chk('torn-down player returns to idle', els[0].dataset.state === 'idle', els[0].dataset.state);
chk('poster survives teardown', els[0].querySelector('.v-poster').src.endsWith('p0.jpg'));
chk('stats.mounted tracks reality', w.ycmVideoStats.get().mounted === 1, JSON.stringify(w.ycmVideoStats.get()));

// Tab hidden -> stop decoding.
Object.defineProperty(w.document, 'hidden', { value: true, configurable: true });
w.document.dispatchEvent(new w.Event('visibilitychange'));
chk('hidden tab pauses playback', els[1].dataset.state !== 'playing', els[1].dataset.state);

// Replay after teardown.
els[0].play();
chk('replays cleanly after teardown', els[0].dataset.state === 'playing' && V() === 2, `${els[0].dataset.state}, ${V()} mounted`);

// A player with no source must not pretend.
d.body.insertAdjacentHTML('beforeend', '<ycm-video poster="x.jpg" label="No source"></ycm-video>');
const ns = d.body.lastElementChild;
chk('sourceless player reports nosrc', ns.dataset.state === 'nosrc', ns.dataset.state);
ns.play();
chk('sourceless player mounts nothing on click', ns.querySelectorAll('video').length === 0);

console.log(out.join('\n'));
const f = out.filter(l => l.startsWith('**')).length;
console.log(`\n${f} failures of ${out.length}`);
process.exit(f ? 1 : 0);
