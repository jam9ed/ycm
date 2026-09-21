process.env.PAGE = 'admin.html';
const { window, errs, ready } = require('./smoke.js');
const $ = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);

// jsdom has no confirm(); the portal asks before discarding work, so say yes.
window.confirm = () => true;

(async () => {
await ready('#tbody tr');

chk('no script errors', errs.length === 0, errs.join(' ;; '));
chk('nav rendered', $$('#anav a').length === 6, $$('#anav a').map(a => a.dataset.tab).join(','));
const goto = t => $(`#anav a[data-tab="${t}"]`).click();
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
// a sale with no date sits outside every total on the Sold page, so marking one
// sold dates it — today, and editable
chk('marking sold stamps the date', /^\d{4}-\d{2}-\d{2}$/.test(stored.find(r => r.id === targetId).soldOn || ''),
    stored.find(r => r.id === targetId).soldOn);

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
goto('media');
chk('photos tab renders', /Add photos/.test($('#amain').textContent));
const liveRows = () => JSON.parse(window.localStorage.getItem('ycm.inventory.v1')) || window.YCM.boats;
chk('every ad is listed', $$('#adlist .adcard').length === liveRows().length, $$('#adlist .adcard').length);
chk('ads with no photo say so', $$('#adlist .adcard-count.zero').length > 0);

const seededPhotos = window.YCM.boats.reduce((n, b) => n + (b.media||[]).filter(m => typeof m === 'string').length, 0);
chk('no photo ships attached to any ad', seededPhotos === 0, seededPhotos + ' attached in data.js');

// the live page's own layout, offered as a suggestion
const byOrigin = o => window.YCM_POOL.filter(p => p.origin === o);
chk('inventory-page photos carry a suggested ad',
    byOrigin('live').filter(p => p.suggest).length === 72, byOrigin('live').filter(p => p.suggest).length);
// Blog photographs used to carry a guessed post id. They no longer need to:
// the posts were re-parsed from the archive and carry their own photographs,
// so the guess has nothing left to do.
chk('blog photos no longer carry a guessed post',
    byOrigin('blog').filter(p => p.suggest).length === 0,
    byOrigin('blog').filter(p => p.suggest).length + ' still do');
chk('posts carry their own photographs instead',
    window.YCM_POSTS.filter(p => (p.wix || []).length).length > 100,
    window.YCM_POSTS.filter(p => (p.wix || []).length).length + ' of ' + window.YCM_POSTS.length);
const camper = window.YCM_POOL.filter(p => /camper_\d/.test(p.file));
chk('the camper photos recovered from the re-archive are in the pool', camper.length === 5, camper.length);
chk('and every one is suggested to the camper ad',
    camper.every(p => p.suggest === 'nucamp-tab-2018'));
chk('camper files exist on disk', (() => {
  const fs = require('fs'), path = require('path');
  return camper.every(p => fs.existsSync(path.join(__dirname, '..', p.file)));
})());
chk('archive photos carry no suggestion — nothing locates them',
    window.YCM_POOL.filter(p => !['live','blog'].includes(p.origin)).every(p => !p.suggest));
chk('bulk fill is offered', !!$('#fillempty'), ($('#fillempty')||{}).textContent);

// open the picker from a specific ad
const adEl = $$('#adlist .adcard')[0];
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

// --- blog posts get their photos the same way listings do -----------------
chk('no post ships with an image', window.YCM_POSTS.every(p => !(p.images || []).length));
chk('posts are listed for attaching', $$('#postlist .adcard').length === window.YCM_POSTS.length,
    $$('#postlist .adcard').length + ' of ' + window.YCM_POSTS.length);

{
  const pid = $$('#postlist .adcard')[0].dataset.pid;
  $(`[data-addpost="${pid}"]`).click();
  chk('the picker names the post it is filling', /Add photos to post/.test($('.sheet-head').textContent));
  const picked = $$('.sheet .pcard').slice(0, 2).map(c => (c.click(), c.dataset.f));
  $('#savepick').click();
  const links = JSON.parse(window.localStorage.getItem('ycm.postlinks.v1'));
  chk('photos save against the post', picked.every(f => (links[pid] || []).includes(f)),
      JSON.stringify(links[pid] || []));
  chk('the post card shows them', $$(`#postlist .adcard[data-pid="${pid}"] .ad-thumb`).length === 2);

  // a photograph belongs to one thing only
  const f = picked[0];
  const onAnAd = JSON.parse(window.localStorage.getItem('ycm.inventory.v1'))
    .some(r => (r.media || []).includes(f));
  chk('and come off any listing they were on', !onAnAd);

  $(`[data-prm="${f}"]`).click();
  const after = JSON.parse(window.localStorage.getItem('ycm.postlinks.v1'));
  chk('removing one takes it off the post', !(after[pid] || []).includes(f));
}

goto('list');
chk('back to inventory', !!$('#tbody'));

// --- notes: the archive, edited by exception ------------------------------
goto('notes');
const NOTES = window.YCM_POSTS;
const edits = () => JSON.parse(window.localStorage.getItem('ycm.postedits.v1') || '{}');
chk('notes tab lists every note', $$('#notelist .notecard').length === NOTES.length,
    $$('#notelist .notecard').length + ' of ' + NOTES.length);
chk('nothing is edited to begin with', Object.keys(edits()).length === 0, JSON.stringify(edits()).slice(0, 80));
chk('notes read newest first', $$('#notelist .notecard')[0].dataset.nid === NOTES[0].id,
    $$('#notelist .notecard')[0].dataset.nid);

{
  const q = $('#notesearch');
  q.value = 'Montauk'; q.dispatchEvent(new window.Event('input', { bubbles: true }));
  const found = $$('#notelist .notecard').length;
  chk('note search narrows', found > 0 && found < NOTES.length, `${NOTES.length} -> ${found}`);
  chk('search hides the reorder arrows — the list is no longer the running order',
      $$('#notelist [data-up]').length === 0);
  q.value = ''; q.dispatchEvent(new window.Event('input', { bubbles: true }));
}

// hide: off the site, still in the list
{
  const id = NOTES[3].id;
  $(`[data-hide="${id}"]`).click();
  chk('hiding a note is recorded', edits()[id] && edits()[id].hidden === true, JSON.stringify(edits()[id]));
  chk('and it is still listed, marked', !!$(`.notecard[data-nid="${id}"].off`));
  chk('the public view drops it',
      !window.YCM_CONFIG.mergePosts(NOTES, edits()).some(p => p.id === id));
  chk('the portal still sees it',
      window.YCM_CONFIG.mergePosts(NOTES, edits(), true).some(p => p.id === id));
  $(`[data-hide="${id}"]`).click();
  chk('showing it again clears the record entirely', !edits()[id], JSON.stringify(edits()[id]));
}

// edit: only the changed field is saved, and the transcription is kept
{
  const seedNote = NOTES[1];
  $(`[data-note="${seedNote.id}"]`).click();
  chk('note editor opens on the right note', $('#n-title').value === seedNote.title, $('#n-title').value);
  chk('the body comes back paragraph per line',
      $('#n-body').value.split('\n').length === seedNote.body.length);
  chk('and the transcription is shown beside it', /As transcribed/.test($('#amain').textContent));
  $('#n-title').value = 'In the YCM pipeline — updated';
  $('#n-tag').value = 'Owners';
  $('#notesave').click();
  const patch = edits()[seedNote.id];
  chk('the edit is saved', patch && patch.title === 'In the YCM pipeline — updated', JSON.stringify(patch));
  chk('only what changed is saved — not the whole note',
      patch && !('body' in patch), Object.keys(patch || {}).join(','));
  chk('the list shows the new title',
      $(`.notecard[data-nid="${seedNote.id}"]`).textContent.includes('updated'));
  chk('the tag is carried through to the public view',
      window.YCM_CONFIG.mergePosts(NOTES, edits()).find(p => p.id === seedNote.id).tag === 'Owners');

  // and it can be put back
  $(`[data-note="${seedNote.id}"]`).click();
  $('#noterevert').click();
  chk('reverting drops the patch', !edits()[seedNote.id]);
  chk('and the note reads as transcribed again',
      window.YCM_CONFIG.mergePosts(NOTES, edits()).find(p => p.id === seedNote.id).title === seedNote.title);
}

// a note written here, rather than transcribed
{
  $('#newnote').click();
  $('#n-title').value = 'Two Montauks went out this morning';
  $('#n-body').value = 'Both to the same family.\nThey have been waiting since March.';
  $('#notesave').click();
  const mine = window.YCM_CONFIG.mergePosts(NOTES, edits())[0];
  chk('a new note leads the list', mine.title === 'Two Montauks went out this morning', mine.title);
  chk('it carries its paragraphs', mine.body.length === 2, JSON.stringify(mine.body));
  chk('and it is marked as written here',
      /Written here/.test($('#notelist .notecard').textContent));
  chk('the count of notes grew by exactly one',
      window.YCM_CONFIG.mergePosts(NOTES, edits()).length === NOTES.length + 1);

  // reordering swaps two notes' places and nothing else
  const before = $$('#notelist .notecard').map(c => c.dataset.nid);
  $(`[data-down="${before[0]}"]`).click();
  const after = $$('#notelist .notecard').map(c => c.dataset.nid);
  chk('moving a note down swaps it with the one below',
      after[0] === before[1] && after[1] === before[0], after.slice(0, 2).join(' / '));
  chk('and leaves the rest alone',
      after.slice(2).join() === before.slice(2).join());
  $(`[data-up="${before[0]}"]`).click();
  chk('moving it back restores the order',
      $$('#notelist .notecard').map(c => c.dataset.nid).join() === before.join());
}

// --- sold: worked out from the records, never estimated -------------------
goto('sold');
chk('the boat marked sold earlier is here', $$('#soldbody tr').length === 1, $$('#soldbody tr').length + ' rows');
chk('sold KPIs render', $$('.kpi').length === 5, $$('.kpi').length);
chk('an incomplete record is reported, not hidden',
    /no figure/.test($$('.kpi .delta')[0].textContent), $$('.kpi .delta')[0].textContent);
chk('a dated sale is plotted', !!$('.chart .col-bar'));
chk('the run is twelve months', $$('.chart .col-tick').length === 12, $$('.chart .col-tick').length);
chk('the chart is labelled for a screen reader', /Boats sold per month/.test($('.chart').getAttribute('aria-label')));
chk('no figure yet, so no median', $$('.kpi b')[2].textContent === '—', $$('.kpi b')[2].textContent);

{
  const row = $('#soldbody tr');
  const ask = JSON.parse(window.localStorage.getItem('ycm.inventory.v1')).find(r => r.id === row.dataset.sid).price;
  const set = (f, v) => { const i = $(`#soldbody [data-f="${f}"]`); i.value = v;
                          i.dispatchEvent(new window.Event('change', { bubbles: true })); };
  set('soldPrice', String(ask - 1000));
  set('listedOn', '2026-01-01');
  set('soldOn', '2026-03-02');
  const rec = JSON.parse(window.localStorage.getItem('ycm.inventory.v1')).find(r => r.id === row.dataset.sid);
  chk('the sale record persists', rec.soldPrice === ask - 1000 && rec.soldOn === '2026-03-02',
      `${rec.soldPrice} on ${rec.soldOn}`);
  chk('days on the market are counted from the two dates',
      $('#soldbody tr td:nth-child(6)').textContent.trim() === '60',
      $('#soldbody tr td:nth-child(6)').textContent);
  // signed the way a discount reads: under the asking price is a minus
  const off = '\u2212' + (1000 / ask * 100).toFixed(1) + '%';
  chk('and the movement against the asking price',
      $('#soldbody tr td:nth-child(7)').textContent.trim() === off,
      $('#soldbody tr td:nth-child(7)').textContent + ' vs ' + off);
  chk('a sale under the ask is flagged', !!$('#soldbody .off-ask'));
  chk('the money KPIs fill in once there is a figure', $$('.kpi b')[2].textContent !== '—',
      $$('.kpi b')[2].textContent);
  chk('length bands appear', $$('.bandrow').length >= 1, $$('.bandrow').length + ' bands');
}

// nothing sold -> say so, rather than draw a trend out of nothing
{
  goto('list');
  $$('.rowsel').forEach(c => { c.checked = false; });
  const sold = JSON.parse(window.localStorage.getItem('ycm.inventory.v1')).filter(r => r.status === 'sold');
  const cb = $(`#tbody tr[data-id="${sold[0].id}"] .rowsel`);
  cb.checked = true; cb.dispatchEvent(new window.Event('change', { bubbles: true }));
  $('#bulk').value = 'available';
  $('#bulk').dispatchEvent(new window.Event('change', { bubbles: true }));
  goto('sold');
  chk('with nothing sold the page says so, and draws no chart',
      /Nothing sold yet/.test($('#amain').textContent) && !$('.chart'));
}

console.log(out.join('\n'));
const failed = out.filter(l => l.startsWith('**')).length;
console.log('\n' + failed + ' failures of ' + out.length);
process.exit(failed ? 1 : 0);   // otherwise run.sh never hears about it
})();
