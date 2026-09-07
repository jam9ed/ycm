const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const errs = [];
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, (process.env.PAGE || 'index.html')), 'utf8'), {
  url: 'http://localhost:8899/' + (process.env.PAGE || 'index.html'),
  runScripts: 'dangerously',
  resources: undefined,
  pretendToBeVisual: true,
  beforeParse(w) {
    w.IntersectionObserver = class { constructor(cb){this.cb=cb} observe(el){ this.cb([{target:el,isIntersecting:true}]) } unobserve(){} disconnect(){} };
    w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
    w.scrollTo = () => {};
    w.structuredClone = o => JSON.parse(JSON.stringify(o));
    w.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function(){};
    w.HTMLMediaElement.prototype.load = function(){};
    w.HTMLMediaElement.prototype.canPlayType = () => '';
    // Serve fetches straight off disk so the config adapter can be exercised.
    // The saved config is hidden unless a suite explicitly asks for it, so the
    // tests never depend on — or disturb — whatever real work is on disk.
    w.fetch = async (u) => {
      // the adapter now resolves to an absolute URL, so take the pathname
      let p0 = String(u);
      try { p0 = new URL(p0, 'http://localhost:8899/').pathname; } catch (_) { p0 = p0.split('?')[0]; }
      const rel = p0.split('?')[0].replace(/^\/+/, '');
      if (rel.endsWith('ads-config.json') && !process.env.WITH_CONFIG)
        return { ok:false, status:404, json: async () => ({}) };
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file))
        return { ok:false, status:404, json: async () => ({}) };
      const text = fs.readFileSync(file, 'utf8');
      return { ok:true, status:200, text: async () => text, json: async () => JSON.parse(text) };
    };
    w.onerror = (m) => errs.push('window.onerror: ' + m);
    w.addEventListener('error', e => errs.push('error event: ' + (e.error?.stack || e.message)));
  },
});
const { window } = dom;
// inline the three local scripts by hand (jsdom won't fetch without a server)
for (const src of [...window.document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'))) {
  try {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    window.eval(code);
  } catch (e) { errs.push(`SCRIPT ${src}: ${e.stack.split('\n').slice(0,3).join(' | ')}`); }
}
window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
/* Both pages now boot asynchronously — they await the config adapter before
   rendering — so tests must wait for first paint rather than assume it. */
function ready(selector, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window.document.querySelector(selector)) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error(`timed out waiting for ${selector}`));
      setTimeout(poll, 10);
    })();
  });
}

module.exports = { window, errs, dom, ready };
