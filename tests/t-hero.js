/* The hero reel: four clips of boats going past, muted, on a loop — and a
   still poster for everyone who should not be served video at all. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { c ? (pass++, console.log('PASS  ' + m + (x ? '  — ' + x : '')))
                            : (fail++, console.log('FAIL  ' + m + (x ? '  — ' + x : ''))); };

const REEL = fs.readFileSync(path.join(root, 'assets/js/hero-reel.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'v3.html'), 'utf8');

function boot({ reduced = false, conn = {} } = {}) {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'http://localhost/v3.html' });
  const w = dom.window;
  w.matchMedia = q => ({ matches: reduced && /reduce/.test(q), addListener(){}, removeListener(){} });
  Object.defineProperty(w.navigator, 'connection', { value: conn, configurable: true });
  // jsdom has no rendered browsing context, so it reports the tab as hidden;
  // the reel quite rightly refuses to play into a hidden tab.
  Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
  w.HTMLMediaElement.prototype.load = function () {};
  w.HTMLMediaElement.prototype.pause = function () {};
  w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  const seen = [];
  w.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; seen.push(this); }
    observe(el) { this.el = el; }
    disconnect() {}
    trigger(on) { this.cb([{ isIntersecting: on, target: this.el }]); }
  };
  w.eval(REEL);
  return { w, d: w.document, io: () => seen[0] };
}

// ---- the markup the page ships -------------------------------------------
{
  const { d } = boot();
  const host = d.querySelector('[data-hero-reel]');
  ok('the hero has a reel host', !!host);
  const clips = JSON.parse(host.dataset.heroReel);
  ok('it carries six clips', clips.length === 6, clips.length + '');
  ok('the first clip is the one Dave picked', /880c1eaf79/.test(clips[0].src), clips[0].src);
  ok('every clip file is on disk',
     clips.every(c => fs.existsSync(path.join(root, c.src))));
  ok('every poster is on disk',
     clips.every(c => fs.existsSync(path.join(root, c.poster))));
  const still = d.querySelector('.hero-still');
  ok('a still paints before any video', !!still && /hero\/880c1eaf79\.jpg$/.test(still.getAttribute('src')));
  ok('the still is described for screen readers', !!still.getAttribute('alt'));
  ok('Dave’s portrait is out of the hero', !/dave-helm/.test(d.querySelector('.v3-hero').outerHTML));
}

// ---- what it builds -------------------------------------------------------
{
  const { d, io } = boot();
  const vids = () => [...d.querySelectorAll('.hero-media video')];
  ok('two layers, for crossfading', vids().length === 2, vids().length + '');
  ok('nothing plays until it is on screen', vids().every(v => !v.getAttribute('src')));
  ok('the layers are muted', vids().every(v => v.muted === true));
  ok('the layers are inline and silent', vids().every(v => v.playsInline === true && !v.controls));
  ok('the layers are hidden from screen readers',
     vids().every(v => v.getAttribute('aria-hidden') === 'true' && v.tabIndex === -1));

  io().trigger(true);
  const on = vids().filter(v => v.classList.contains('on'));
  ok('coming into view starts one layer', on.length === 1);
  ok('it starts on the first clip', /880c1eaf79/.test(on[0].getAttribute('src')), on[0].getAttribute('src'));
  const idle = vids().find(v => !v.classList.contains('on'));
  ok('the next clip is queued behind it', /24999e112b/.test(idle.getAttribute('src') || ''), idle.getAttribute('src'));

  // hand over: the queued layer takes the front, the next-next gets queued
  Object.defineProperty(on[0], 'duration', { value: 2.5, configurable: true });
  Object.defineProperty(on[0], 'currentTime', { value: 2.0, writable: true, configurable: true });
  on[0].dispatchEvent(new d.defaultView.Event('timeupdate'));
  ok('it hands over before the clip ends', idle.classList.contains('on') && !on[0].classList.contains('on'));
  ok('and queues the one after', /01e8472eaf/.test(on[0].getAttribute('src')), on[0].getAttribute('src'));

  io().trigger(false);
  ok('scrolling away stops it', vids().every(v => !v.classList.contains('on')));
}

// ---- when video would be the wrong thing to send --------------------------
{
  const { d } = boot({ reduced: true });
  ok('reduced motion gets the still only', d.querySelectorAll('.hero-media video').length === 0);
}
{
  const { d } = boot({ conn: { saveData: true } });
  ok('data saver gets the still only', d.querySelectorAll('.hero-media video').length === 0);
}
{
  const { d } = boot({ conn: { effectiveType: '2g' } });
  ok('a slow connection gets the still only', d.querySelectorAll('.hero-media video').length === 0);
}

// ---- weight ---------------------------------------------------------------
{
  const dir = path.join(root, 'assets/video/hero');
  const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  ok('the whole loop stays within budget', bytes < 24 * 1024 * 1024,
     (bytes / 1048576).toFixed(1) + 'MB across ' + fs.readdirSync(dir).length + ' clips');
}

// Dave pulled this one: an aluminium skiff, not a Whaler.
{
  const html = fs.readFileSync(path.join(root, 'v3.html'), 'utf8');
  ok('the boat that was not a Whaler is gone', !/acc9102c95/.test(html));
}

console.log('\n' + fail + ' failures of ' + (pass + fail));
process.exit(fail ? 1 : 0);
