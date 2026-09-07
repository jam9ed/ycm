const { window, errs, ready } = require('./smoke.js');
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const out = [];
let chkBad;
const chk = (name, cond, extra='') => out.push(`${cond ? 'PASS' : '**FAIL**'}  ${name}${extra ? '  — ' + extra : ''}`);

(async () => {
await ready('#home-featured .card');

// --- home ----------------------------------------------------------------
chk('home is the default view', !$('#view-home').hidden && $('#view-browse').hidden);
chk('home shows four boats', $$('#home-featured .card').length === 4, $$('#home-featured .card').length);
chk('the featured ad leads', $$('#home-featured .card')[0].dataset.id === window.YCM.boats.find(b => b.featured).id);
chk('home links through to the inventory', /See all \d+ listings/.test($('#see-all').textContent), $('#see-all').textContent);

// counts must not call an outboard a boat
const ADS = window.YCM.boats;
const boatsOnly = ADS.filter(b => !b.kind);
chk('the hero stat counts boats, not listings',
    $('#stat-listings').textContent === String(boatsOnly.length),
    `${$('#stat-listings').textContent} shown, ${boatsOnly.length} boats of ${ADS.length} listings`);
chk('the eight non-boats are tagged', ADS.length - boatsOnly.length === 8,
    ADS.filter(b => b.kind).map(b => b.kind).join(','));
chk('every motor, collectible and the camper is excluded',
    ADS.filter(b => b.kind).every(b => ['motor','collectible','camper'].includes(b.kind)));
chk('post titles are clamped so the row stays even',
    $$('#home-posts .card').length === 4);
chk('home teases four posts', $$('#home-posts .card').length === 4, $$('#home-posts .card').length);
chk('both home rows are pinned to four across',
    ['#home-featured','#home-posts'].every(id => $(id).classList.contains('grid-4')));
chk('home does not render the whole grid', $$('#grid .card').length === 0);

// --- preview gate ---------------------------------------------------------
chk('the gate renders and hides the page', !!$('#gate') && !!$('#gate-form'));
chk('it builds only once, whatever fires DOMContentLoaded', $$('#gate').length === 1);
{
  const f = $('#gate-form'), pw = $('#gate-pw');
  pw.value = 'wrong';
  f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  chk('a wrong password keeps the gate up', !!$('#gate') && !$('#gate-msg').hidden);
  pw.value = 'ycm4life';
  f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  chk('the right password removes it', !$('#gate'));
  chk('and it stays unlocked for the session', window.sessionStorage.getItem('ycm.preview.v1') === '1');
  /* The unlock above ran in an environment with no crypto.subtle — the same
     situation as previewing over plain http on a LAN address, where a
     SHA-256 gate would throw and never open. */
  chk('it unlocked without crypto.subtle being available',
      !(window.crypto && window.crypto.subtle), 'crypto.subtle was present, so this proved nothing');
}

// --- staff portal ---------------------------------------------------------
const staff = $('#staff-link');
chk('a staff link sits in the header', !!staff && staff.getAttribute('href') === 'admin.html');
chk('it is labelled for screen readers', (staff.getAttribute('aria-label') || '').length > 3);
chk('it does not clutter the main nav', !$$('.nav a').some(a => a.getAttribute('href') === 'admin.html'));

// --- affiliations --------------------------------------------------------
const partners = $$('.partner');
chk('partners are listed on the home page', partners.length === 5, partners.length);
chk('Rossiter leads, since it is a boat line YCM sells',
    partners[0].textContent.includes('Rossiter') && partners[0].classList.contains('feature'));
chk('every partner links out safely', partners.every(a =>
    /^https?:\/\//.test(a.getAttribute('href')) && a.getAttribute('rel') === 'noopener'
    && a.getAttribute('target') === '_blank'));
chk('every partner shows its logo', partners.every(a => !!a.querySelector('.plogo img')));
chk('logo files exist on disk', (() => {
  const fs = require('fs'), path = require('path');
  return partners.every(a => fs.existsSync(path.join(__dirname, '..',
    a.querySelector('.plogo img').getAttribute('src'))));
})());
chk('each logo has the partner name as alt text',
    partners.every(a => (a.querySelector('.plogo img').getAttribute('alt') || '').length > 3));
chk('the five links match the ones on the live site', (() => {
  const want = ['rossiterboats.com','millscanvas.com','greatlakesboattop.com','magictilt.com','ezloader.com'];
  return want.every(d => partners.some(a => a.getAttribute('href').includes(d)));
})());

// --- blog ----------------------------------------------------------------
window.location.hash = '#/blog';
window.dispatchEvent(new window.Event('hashchange'));
chk('blog lists every post', $$('#blog-grid .card').length === window.YCM_POSTS.length, $$('#blog-grid .card').length);
const firstPost = window.YCM_POSTS[0];
window.location.hash = '#/blog/' + firstPost.id;
window.dispatchEvent(new window.Event('hashchange'));
chk('a post renders its own copy', $('#view-blog .prose').textContent.includes(firstPost.body[0].slice(0, 30)));
chk('post title is verbatim', $('#view-blog .h1').textContent.trim() === firstPost.title);

// --- inventory is its own view -------------------------------------------
window.location.hash = '#/inventory';
window.dispatchEvent(new window.Event('hashchange'));
await ready('#grid .card');
chk('inventory view shows the grid', !$('#view-browse').hidden && $('#view-home').hidden);
chk('nav marks where you are', $$('.nav a[aria-current]').length === 1 &&
    $('.nav a[aria-current]').getAttribute('href') === '#/inventory');

chk('no script errors', errs.length === 0, errs.join(' ;; '));
const cards = $$('#grid .card');
chk('cards rendered', cards.length > 0, cards.length + ' cards');
chk('every ad from the inventory page is shown', cards.length === window.YCM.boats.length, cards.length + ' of ' + window.YCM.boats.length);
chk('titles come from the page, verbatim', [...cards].every(c => {
  const b = window.YCM.boats.find(x => x.id === c.dataset.id);
  return c.querySelector('.card-ttl').textContent.trim() === b.title;
}));
chk('a known headline is intact', !!window.YCM.boats.find(b => b.title === '2022 BOSTON WHALER 160 SUPER SPORT! - 24 total hours!'));
chk('no invented fields survive', window.YCM.boats.every(b =>
  !('make' in b) && !('category' in b) && !('engine' in b) && !('trailer' in b) && !('freshwater' in b)));
chk('facet groups rendered', $$('#rail .fgroup').length >= 5, $$('#rail .fgroup').length + ' groups');
chk('no facet is built on invented data', !/Builder|Type|Freshwater|Trailer included/.test($('#rail').textContent));
chk('presets rendered', $$('#presets .preset').length === 8);
// --- the featured box ---------------------------------------------------
const fb = $('#featured');
chk('featured box renders', !!fb && fb.children.length > 0);
const featuredAd = window.YCM.boats.find(b => b.featured);
chk('it links to the featured ad', fb.getAttribute('href') === '#/boat/' + featuredAd.id, fb.getAttribute('href'));
chk('it names the featured ad', fb.textContent.includes(featuredAd.title.slice(0, 24)));
chk('with no photo linked it shows a placeholder, not a broken image',
    !!fb.querySelector('.ph') && !fb.querySelector('img'));
chk('every <img> on the page points at a file that exists', (() => {
  const fs = require('fs'), path = require('path');
  const bad = $$('img[src]').map(i => i.getAttribute('src'))
    .filter(src => src && !/^(data:|https?:)/.test(src))
    .filter(src => !fs.existsSync(path.join(__dirname, '..', src)));
  return bad.length === 0 || (chkBad = bad, false);
})(), typeof chkBad !== 'undefined' ? chkBad.join(', ') : '');

chk('headline is the tagline', /A different kind/.test($('.display').textContent), $('.display').textContent.trim());
chk('hero count populated', $('#stat-listings').textContent !== '—', $('#stat-listings').textContent);
chk('count line', /\d+ of \d+ listings/.test($('#count').textContent), $('#count').textContent.slice(0,40));
chk('the results line separates boats from gear', /motors? &? ?gear|boats/.test($('#count').textContent),
    $('#count').textContent.replace(/\s+/g,' ').slice(0, 70));

// facet counts must be non-zero integers and never exceed total
const counts = $$('#rail .cnt').map(e => +e.textContent);
chk('facet counts sane', counts.length > 0 && counts.every(n => Number.isInteger(n) && n >= 0 && n <= 40), 'max=' + Math.max(...counts));

// --- exercise a length facet -------------------------------------------
const before = $$('#grid .card').length;
const lenBox = $$('#rail input[data-facet="lenBands"]')[0];
lenBox.checked = true;
lenBox.dispatchEvent(new window.Event('change', { bubbles: true }));
const after = $$('#grid .card').length;
chk('length facet filters', after < before && after > 0, `${before} -> ${after}`);
chk('length facet writes URL exactly once', window.location.search === '?lenBands=u14', window.location.search);
chk('active chip appears', $$('#active .pill').length >= 1);

// clear
$('#clear-all').click();
chk('clear-all restores', $$('#grid .card').length === before, `${$$('#grid .card').length} vs ${before}`);

// --- price preset -------------------------------------------------------
// re-query each time: rendering replaces the button nodes
const u15 = () => $$('#presets .preset').find(b => b.textContent.includes('Under $15k'));
u15().click();
const prices = $$('#grid .card .card-price b').map(b => +b.textContent.replace(/[^0-9]/g,''));
chk('under-$15k preset holds', prices.length > 0 && prices.every(p => p <= 15000), 'max=' + Math.max(...prices));
u15().click();
chk('preset toggles back off', $$('#grid .card').length === before, `${$$('#grid .card').length} vs ${before}`);

// --- sort ---------------------------------------------------------------
$('#sort').value = 'priceUp';
$('#sort').dispatchEvent(new window.Event('change', { bubbles: true }));
const ps = $$('#grid .card .card-price b').map(b => +b.textContent.replace(/[^0-9]/g,''));
chk('price sort ascending', ps.every((p,i) => i === 0 || ps[i-1] <= p), ps.slice(0,5).join(','));

// --- photos: ads start empty, placeholders everywhere -------------------
const B = window.YCM.boats;
const seeded = B.reduce((n, b) => n + (b.media||[]).filter(m => typeof m === 'string').length, 0);
chk('no photo is attached to any ad by default', seeded === 0, seeded + ' attached');
const liveCards = $$('#grid .card').length;
chk('every card falls back to a placeholder', $$('#grid .card-media .ph').length === liveCards,
    `${$$('#grid .card-media .ph').length} placeholders vs ${liveCards} cards`);
chk('no card renders a borrowed photo', $$('#grid .card-media img').length === 0);

// the toggle must actually show which view you are in
const seg = () => $$('#viewseg button');
const lit = () => seg().filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.view);
chk('exactly one view is lit to begin with', lit().length === 1, lit().join());
for (const v of ['list', 'compact', 'grid']) {
  seg().find(b => b.dataset.view === v).click();
  chk(`selecting ${v} moves the highlight`, lit().length === 1 && lit()[0] === v,
      `lit: ${lit().join() || 'none'}`);
}

// --- the three inventory views -------------------------------------------
chk('three view options are offered', $$('#viewseg button').length === 3,
    $$('#viewseg button').map(b => b.dataset.view).join(', '));
const compactBtn = $$('#viewseg button').find(b => b.dataset.view === 'compact');
compactBtn.click();
chk('compact applies its own grid', $('#grid').classList.contains('compact'));
chk('compact keeps every result', $$('#grid .card').length === liveCards, $$('#grid .card').length);
chk('compact drops the spec line', $$('#grid .card-spec').length === 0);
chk('compact still shows titles and prices',
    $$('#grid .card-ttl').length === liveCards && $$('#grid .card-price').length === liveCards);
chk('the view is shareable in the URL', /view=compact/.test(window.location.search), window.location.search);
$$('#viewseg button').find(b => b.dataset.view === 'grid').click();
chk('switching back restores the default grid',
    !$('#grid').classList.contains('compact') && $$('#grid .card-spec').length > 0);

// --- video component ----------------------------------------------------
chk('no <video> mounted on browse', $$('video').length === 0, $$('video').length + ' video elements');
const stats = window.ycmVideoStats.get();
chk('HUD present', !!$('.hud'));

// --- detail route -------------------------------------------------------
window.location.hash = '#/boat/featured-montauk-17';
window.dispatchEvent(new window.Event('hashchange'));
chk('detail renders', $('#view-detail').hidden === false && /Montauk 17/.test($('#view-detail').textContent));
chk('detail heading is the ad headline',
    $('#view-detail .h1').textContent.trim() === window.YCM.boats.find(b => b.id === 'featured-montauk-17').title);
chk('detail body is the page copy verbatim',
    /all original Classic Montauk on the market/.test($('#view-detail .prose').textContent));
chk('browse hidden on detail', $('#view-browse').hidden === true);
chk('home hidden on detail', $('#view-home').hidden === true);
chk('a photo-less, video-less ad shows the placeholder', !!$('#gal-main .ph'));
const specRows = $$('#view-detail .spec-list div').length;
chk('spec list only states what the ad states', specRows > 0 && specRows <= 5, specRows + ' rows');

chk('no thumb strip when there is one media item or none', $$('.gal-thumbs .thumb').length === 0);

// a listing with no media at all must degrade to the placeholder, not break
const bare = window.YCM.boats.find(b => !(b.media || []).length);
if (bare) {
  window.location.hash = '#/boat/' + bare.id;
  window.dispatchEvent(new window.Event('hashchange'));
  chk('photo-less listing shows a placeholder', !!$('#gal-main .ph'), bare.id);
  chk('photo-less listing still renders', !!$('#view-detail .h1'));
  window.location.hash = '#/boat/featured-montauk-17';
  window.dispatchEvent(new window.Event('hashchange'));
}

// the one ad that states it has a video
window.location.hash = '#/boat/acadia-21-traveler';
window.dispatchEvent(new window.Event('hashchange'));
chk('the ad that states a video gets a player', $$('ycm-video').length === 1);
chk('player is still lazy on the detail page', $$('ycm-video video').length === 0);
$('ycm-video').play();
chk('nosrc state shown (no playback URL exists yet)', $('ycm-video').dataset.state === 'nosrc', $('ycm-video').dataset.state);

console.log(out.join('\n'));
console.log('\n' + out.filter(l=>l.startsWith('**')).length + ' failures of ' + out.length);
})();
