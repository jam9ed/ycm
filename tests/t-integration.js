/* The whole point: what the admin saves is what the public site shows. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, 'assets/data/ads-config.json');

const existed = fs.existsSync(CONFIG);
const backup  = existed ? fs.readFileSync(CONFIG) : null;

// stand in for an afternoon of triage in the Gallery
const LINKS = {
  'featured-montauk-17': ['assets/img/inv/live_004.jpg', 'assets/img/inv/live_005.jpg'],
  'portland-pudgy':      ['assets/img/inv/live_048.jpg'],
};
fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
fs.writeFileSync(CONFIG, JSON.stringify({
  version: 1, savedAt: new Date().toISOString(),
  links: LINKS, setAside: ['assets/img/boats/src_012dfbd305.jpg'], listings: [],
}, null, 2));

process.env.PAGE = 'index.html';
process.env.WITH_CONFIG = '1';        // this suite is specifically about the config
const { window, errs, ready } = require('./smoke.js');
const $  = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);

(async () => {
  try {
    window.location.hash = '#/inventory';
    window.dispatchEvent(new window.Event('hashchange'));
    await ready('#grid .card');
    chk('no script errors', errs.length === 0, errs.join(' ;; '));

    const card = $('.card[data-id="featured-montauk-17"]');
    chk('a linked listing renders its photo, not a placeholder',
        !!card.querySelector('.card-media img') && !card.querySelector('.card-media .ph'));
    chk('and it is the photo the config named',
        card.querySelector('.card-media img').getAttribute('src') === LINKS['featured-montauk-17'][0],
        card.querySelector('.card-media img').getAttribute('src'));

    const pudgy = $('.card[data-id="portland-pudgy"]');
    chk('a second linked listing picks up its own photo',
        pudgy.querySelector('.card-media img').getAttribute('src') === LINKS['portland-pudgy'][0]);

    const unlinked = $$('#grid .card').filter(c => !LINKS[c.dataset.id]);
    chk('every unlinked listing still shows a placeholder',
        unlinked.every(c => !!c.querySelector('.card-media .ph')),
        unlinked.filter(c => !c.querySelector('.card-media .ph')).map(c => c.dataset.id).join(', '));

    chk('the page carries no build-time banner', !$('.staff-note'));
    chk('but it still records where the data came from',
        window.YCM_SOURCE.source === 'config', JSON.stringify(window.YCM_SOURCE));

    // detail view: photos follow the same linkage, video keeps the lead slot
    window.location.hash = '#/boat/featured-montauk-17';
    window.dispatchEvent(new window.Event('hashchange'));
    chk('detail shows both linked photos as thumbnails', $$('.gal-thumbs .thumb').length === 2,
        $$('.gal-thumbs .thumb').length);

    // and the video is still lazy — no decoder until asked
    chk('linking photos did not make video eager', $$('video').length === 0);
  } catch (e) {
    chk('integration suite ran', false, e.message);
  } finally {
    if (existed) fs.writeFileSync(CONFIG, backup); else fs.rmSync(CONFIG, { force: true });
  }
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f ? 1 : 0);
})();
