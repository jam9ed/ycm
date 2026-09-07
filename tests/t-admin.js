process.env.PAGE = 'admin.html';
const { window, errs, ready } = require('./smoke.js');
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);

(async () => {
await ready('#tbody tr');

chk('no script errors', errs.length === 0, errs.join(' ;; '));
chk('nav rendered', $$('#anav a').length === 4);
chk('KPI tiles', $$('.kpi').length === 5, $$('.kpi').length);
const rowCount = $$('#tbody tr').length;
chk('table rows = all ads', rowCount === window.YCM.boats.length, `${rowCount} vs ${window.YCM.boats.length}`);
chk('inventory value computed', /\$[\d,]+/.test($$('.kpi b')[1].textContent), $$('.kpi b')[1].textContent);

// --- search -------------------------------------------------------------
const sb = $('#asearch');
sb.value = 'Montauk'; sb.dispatchEvent(new window.Event('input', { bubbles: true }));
const n = $$('#tbody tr').length;
chk('admin search narrows', n > 0 && n < rowCount, `${rowCount} -> ${n}`);
chk('admin search box keeps its value', $('#asearch').value === 'Montauk', $('#asearch').value);

// select a row while a query is active — this used to wipe the search
$$('.rowsel')[0].checked = true;
$$('.rowsel')[0].dispatchEvent(new window.Event('change', { bubbles: true }));
chk('selection preserves query', $('#asearch').value === 'Montauk' && $$('#tbody tr').length === n, $('#asearch').value);
chk('bulk control enabled by selection', !$('#bulk').disabled);

// --- bulk status --------------------------------------------------------
const targetId = $$('#tbody tr')[0].dataset.id;
$('#bulk').value = 'sold';
$('#bulk').dispatchEvent(new window.Event('change', { bubbles: true }));
const stored = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
chk('bulk status persisted', stored.find(r => r.id === targetId).status === 'sold', stored.find(r => r.id === targetId).status);

// --- create a listing ---------------------------------------------------
$('#asearch').value = ''; $('#asearch').dispatchEvent(new window.Event('input', { bubbles: true }));
$('#add').click();
chk('editor opens', !!$('#bf'));
$('#i-title').value = '1966 Boston Whaler Nauset 16';
$('#i-year').value = '1966';
$('#i-length').value = '16';
$('#i-price').value = '19500';
$('#i-body').value = 'One owner\nFreshwater';
$('#savebtn').click();
const after = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
const made = after.find(r => r.title === '1966 Boston Whaler Nauset 16');
chk('listing created', !!made, made && made.id);
chk('created listing typed correctly', made && made.price === 19500 && made.year === 1966 && made.length === 16,
    made && `price=${made.price} year=${made.year} len=${made.length} (${typeof made.price})`);
chk('copy splits into paragraphs', made && Array.isArray(made.body) && made.body.length === 2, JSON.stringify(made && made.body));
chk('returns to list after save', !!$('#tbody'));
chk('row count grew', $$('#tbody tr').length === rowCount + 1, $$('#tbody tr').length);

// --- edit round-trip ----------------------------------------------------
$(`[data-edit="${made.id}"]`).click();
chk('edit loads values', $('#i-title').value === '1966 Boston Whaler Nauset 16' && $('#i-price').value === '19500', $('#i-price').value);
$('#i-price').value = '17500';
$('#savebtn').click();
const after2 = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
chk('edit persists', after2.find(r => r.id === made.id).price === 17500);
chk('edit did not duplicate', after2.filter(r => r.id === made.id).length === 1);

// --- photos: pick some, save them to an ad -------------------------------
$$('#anav a')[2].click();
chk('photos tab renders', /Add photos/.test($('#amain').textContent));
const liveRows = () => JSON.parse(window.localStorage.getItem('ycm.inventory.v1')) || window.YCM.boats;
chk('every ad is listed', $$('.adcard').length === liveRows().length, $$('.adcard').length);
chk('ads with no photo say so', $$('.adcard-count.zero').length > 0);

const seededPhotos = window.YCM.boats.reduce((n, b) => n + (b.media||[]).filter(m => typeof m === 'string').length, 0);
chk('no photo ships attached to any ad', seededPhotos === 0, seededPhotos + ' attached in data.js');

// the live page's own layout, offered as a suggestion
chk('suggestions exist for the live-page photos',
    window.YCM_POOL.filter(p => p.suggest).length === 72, window.YCM_POOL.filter(p => p.suggest).length);
const camper = window.YCM_POOL.filter(p => /camper_\d/.test(p.file));
chk('the camper photos recovered from the re-archive are in the pool', camper.length === 5, camper.length);
chk('and every one is suggested to the camper ad',
    camper.every(p => p.suggest === 'nucamp-tab-2018'));
chk('camper files exist on disk', (() => {
  const fs = require('fs'), path = require('path');
  return camper.every(p => fs.existsSync(path.join(__dirname, '..', p.file)));
})());
chk('archive photos carry no suggestion',
    window.YCM_POOL.filter(p => p.origin !== 'live').every(p => !p.suggest));
chk('bulk fill is offered', !!$('#fillempty'), ($('#fillempty')||{}).textContent);

// open the picker from a specific ad
const adEl = $$('.adcard')[0];
const lid = adEl.dataset.lid;
$(`[data-add="${lid}"]`).click();
chk('picker opens as a sheet', !!$('.sheet-box'));
const adTitle = liveRows().find(b => b.id === lid).title;
chk('picker names the ad it is filling', $('.sheet-head').textContent.includes(adTitle.slice(0, 20)), adTitle.slice(0, 30));
const LIB = window.YCM_POOL.length + window.YCM_VIDEOS.length;
chk('picker offers photos and video together', $$('.sheet .pcard').length === LIB,
    `${$$('.sheet .pcard').length} of ${LIB}`);
chk('videos are badged as video', $$('.sheet .pcard[data-kind="video"]').length === window.YCM_VIDEOS.length,
    $$('.sheet .pcard[data-kind="video"]').length + ' video items');
chk('every video shows a poster frame',
    $$('.sheet .pcard[data-kind="video"]').every(c => !!c.querySelector('img[src]')));
{
  const sugAd = window.YCM.boats.find(b => window.YCM_POOL.some(p => p.suggest === b.id));
  $('#sheet-x').click();
  $(`[data-add="${sugAd.id}"]`).click();
  const n = window.YCM_POOL.filter(p => p.suggest === sugAd.id).length;
  chk('picker groups the photos that sat under this ad', /Sat under this ad/.test($('.sheet').textContent));
  chk('and offers a select-all for that group', !!$('#pickall'));
  $('#pickall').click();
  chk('select-all ticks exactly that group and nothing else', $$('.sheet .pcard.sel').length === n,
      `${$$('.sheet .pcard.sel').length} of ${n}`);
  $('#sheet-x').click();
  $(`[data-add="${lid}"]`).click();
}
chk('save starts disabled', $('#savepick').disabled);

// pick two
const picked = $$('.sheet .pcard').slice(0, 2);
picked.forEach(c => c.click());
const pickedFiles = picked.map(c => c.dataset.f);
chk('selection is counted', /2 selected/.test($('#picked').textContent), $('#picked').textContent);
chk('save enables once something is picked', !$('#savepick').disabled);
chk('selected cards are marked', $$('.sheet .pcard.sel').length === 2);

$('#savepick').click();
chk('picker closes on save', !$('.sheet-box'));
let st = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
const got = st.find(r => r.id === lid).media.filter(m => typeof m === 'string');
chk('both photos are saved to that ad', pickedFiles.every(f => got.includes(f)), got.length + ' on the ad');
chk('the ad now shows its thumbnails', $$(`.adcard[data-lid="${lid}"] .ad-thumb`).length === 2);
chk('ad card count updates', /2 photos/.test($(`.adcard[data-lid="${lid}"]`).textContent));

// used photos leave the pool
$(`[data-add="${lid}"]`).click();
chk('saved items are no longer offered', $$('.sheet .pcard').length === LIB - 2,
    $$('.sheet .pcard').length + ' left');

// set aside from inside the picker
const junk = $$('.sheet .pcard')[0].dataset.f;
$$('.sheet .pcard')[0].click();
$('#setaside').click();
chk('set aside persists', JSON.parse(window.localStorage.getItem('ycm.pool.dismissed.v1')).includes(junk));
chk('set-aside photo leaves the picker', !$$('.sheet .pcard').some(c => c.dataset.f === junk));
$('#sheet-x').click();
chk('close button dismisses the sheet', !$('.sheet-box'));

// the set-aside pile is reviewable and reversible
$('#showaside').click();
chk('set-aside pile opens', /set aside/i.test($('.sheet-head').textContent));
chk('it holds the photo we parked', $$('.sheet .pcard').some(c => c.dataset.f === junk));
$$('.sheet .pcard').find(c => c.dataset.f === junk).click();
$('#restore').click();
chk('restore empties it back to the pool',
    !JSON.parse(window.localStorage.getItem('ycm.pool.dismissed.v1')).includes(junk));
$('#sheet-x').click();

// lead image + remove, straight from the ad card
const thumbs = $$(`.adcard[data-lid="${lid}"] .ad-thumb`);
const secondFile = thumbs[1].dataset.lead;
thumbs[1].click();
st = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
chk('clicking a thumbnail makes it the lead image',
    st.find(r => r.id === lid).media.filter(m => typeof m === 'string')[0] === secondFile);
$(`[data-rm="${secondFile}"]`).click();
st = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'));
chk('remove takes it off the ad', !st.some(r => (r.media||[]).includes(secondFile)));

// video slots are never touched by any of this
chk('video slots survive', st.filter(r => (r.media||[]).some(m => m && m.label)).length ===
    window.YCM.boats.filter(b => (b.media||[]).some(m => m && m.label)).length, 'video slots intact');

$$('#anav a')[0].click();
chk('back to inventory', !!$('#tbody'));

console.log(out.join('\n'));
console.log('\n' + out.filter(l => l.startsWith('**')).length + ' failures of ' + out.length);
})();
