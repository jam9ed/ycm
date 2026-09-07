/* ==========================================================================
   Staff portal. Prototype persistence is localStorage — swap the `store`
   object for fetch() calls and nothing above it changes.
   ========================================================================== */
(() => {
'use strict';
const { boats: SEED, STATUS } = window.YCM;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const money = n => n == null ? '—' : '$' + n.toLocaleString('en-US');
const KEY = 'ycm.inventory.v1';
const DKEY = 'ycm.pool.dismissed.v1';
const RKEY = 'ycm.pool.removed.v1';

/* --- the only thing that talks to storage -------------------------------- */
const store = {
  read()  { try { return JSON.parse(localStorage.getItem(KEY)) || structuredClone(SEED); } catch { return structuredClone(SEED); } },
  write(v){ try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { toast('Could not save: ' + e.message); } },
  reset() { try { localStorage.removeItem(KEY); } catch {} },
  // photos deliberately set aside: not a listing photo, not still to be triaged
  readAside()  { try { return new Set(JSON.parse(localStorage.getItem(DKEY)) || []); } catch { return new Set(); } },
  writeAside(v){ try { localStorage.setItem(DKEY, JSON.stringify([...v])); } catch (e) { toast('Could not save: ' + e.message); } },
  // pulled out of the library altogether — junk, duplicates, someone's cat
  readRemoved()  { try { return new Set(JSON.parse(localStorage.getItem(RKEY)) || []); } catch { return new Set(); } },
  writeRemoved(v){ try { localStorage.setItem(RKEY, JSON.stringify([...v])); } catch (e) { toast('Could not save: ' + e.message); } },
};
const CFG = window.YCM_CONFIG;

/* saved  = what is on disk (assets/data/ads-config.json), or the seed
   rows   = what you are working on; the localStorage draft if there is one
   dirty  = the two differ, so there is something worth saving              */
let savedRows = structuredClone(SEED), savedAside = new Set();
let rows = reconcileRows(store.read());
let canWrite = false;

const save = () => { store.write(rows); paintDirty(); };

/* A draft can outlive the ad ids it was written against — regenerating the
   listings from the source page renamed most of them once. Rather than let
   those photo links silently vanish, remap them onto the ads that exist now.
   Only runs when something is actually orphaned, so a healthy draft is left
   completely alone. */
function reconcileRows(input) {
  const known = new Set(SEED.map(r => r.id));
  const stray = input.filter(r => !known.has(r.id) && (r.media || []).some(m => typeof m === 'string'));
  if (!stray.length) return input;

  const links = {}, titles = {};
  input.forEach(r => {
    const pics = (r.media || []).filter(m => typeof m === 'string');
    if (!pics.length) return;
    links[r.id] = pics;
    if (r.title) titles[r.id] = r.title;
  });
  const { links: fixed, moved, orphans } = CFG.reconcile(links, titles, SEED);
  const out = structuredClone(SEED);
  out.forEach(r => {
    if (fixed[r.id]) r.media = [...(r.media || []).filter(m => typeof m !== 'string'), ...fixed[r.id]];
  });
  const n = moved.reduce((t, m) => t + m.n, 0);
  if (n || orphans.length) {
    setTimeout(() => toast(
      `Recovered ${n} photo link${n === 1 ? '' : 's'} from renamed ads` +
      (orphans.length ? `; ${orphans.reduce((t, o) => t + o.files.length, 0)} had no ad left` : '')), 500);
  }
  return out;
}

function isDirty() {
  return !CFG.same(CFG.build(rows, store.readAside()), CFG.build(savedRows, savedAside));
}
function paintDirty() {
  const b = document.getElementById('savebar');
  if (b) b.hidden = !isDirty();
  const n = document.getElementById('dirtydot');
  if (n) n.hidden = !isDirty();
}

let tab = 'list', editing = null, sel = new Set(), listQuery = '';

/* ---------------- shell -------------------------------------------------- */
const TABS = [
  ['list',  'Inventory', '<path d="M2 3h12M2 8h12M2 13h12"/>'],
  ['new',   'New ad','<path d="M8 3v10M3 8h10"/>'],
  ['media', 'Photos',     '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m5 10 2.2-2.6L9 9.4l1.6-1.8L13 11"/>'],
  ['ship',  'Delivery',  '<path d="M1 10h14M3 10V5h6v5M9 7h3l2 3"/>'],
];
/* Always try to write first, and only fall back to a download if there is
   genuinely nowhere to write. Deciding this at boot was wrong: a page opened
   before the writable server started would offer a download forever, even
   though saving would have worked. */
async function saveToDisk() {
  const payload = CFG.build(rows, store.readAside());
  try {
    const r = await CFG.save(payload);
    savedRows = structuredClone(rows);
    savedAside = store.readAside();
    canWrite = true;
    toast(`Saved to assets/data/ads-config.json — ${r.photos} photo${r.photos === 1 ? '' : 's'} across ${r.listings} ad${r.listings === 1 ? '' : 's'}`);
    paintDirty();
  } catch (e) {
    canWrite = false;
    CFG.download(payload);
    toast('No writable server (run: npm start). Downloaded ads-config.json — put it in assets/data/');
  }
}

function revertToSaved() {
  if (!confirm('Discard unsaved changes and go back to the last saved config?')) return;
  rows = structuredClone(savedRows);
  store.write(rows); store.writeAside(savedAside);
  toast('Reverted to the saved config');
  render();
}

function renderNav() {
  $('#anav').innerHTML = `<div>${TABS.map(([id, label, path]) =>
    `<a href="#" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
      ${label}</a>`).join('')}</div>`;
  $$('#anav a').forEach(a => a.onclick = e => { e.preventDefault(); tab = a.dataset.tab; editing = null; render(); });

  let bar = document.getElementById('savebar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'savebar'; bar.className = 'savebar'; bar.hidden = true;
    bar.innerHTML = `<span>Unsaved changes</span>
      <button class="btn btn-ghost btn-sm" id="revert">Revert</button>
      <button class="btn btn-primary btn-sm" id="savedisk"></button>`;
    document.body.appendChild(bar);
  }
  bar.querySelector('#savedisk').textContent = 'Save';
  bar.querySelector('#savedisk').onclick = saveToDisk;
  bar.querySelector('#revert').onclick = revertToSaved;
  paintDirty();
}

/* ---------------- inventory table ---------------------------------------- */
function renderList() {
  const live = rows.filter(r => r.status !== 'sold');
  const valued = live.filter(r => r.price != null);
  const total = valued.reduce((s, r) => s + r.price, 0);
  const noVideo = live.filter(r => !(r.media || []).some(m => m.label)).length;
  const noPrice = live.filter(r => r.price == null).length;
  const soldYtd = rows.filter(r => r.status === 'sold');

  $('#amain').innerHTML = `
  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px">
    <h1 class="h1" style="flex:1">Inventory</h1>
    <button class="btn btn-ghost btn-sm" id="export">Export config</button>
    <label class="btn btn-ghost btn-sm" style="cursor:pointer">Import config
      <input type="file" id="importfile" accept="application/json,.json" hidden></label>
    <button class="btn btn-ghost btn-sm" id="reset">Discard draft</button>
    <button class="btn btn-primary btn-sm" id="add">New ad</button>
  </div>

  <div class="kpis">
    <div class="kpi"><span class="label">Live ads</span><b class="num">${live.length}</b><div class="delta">${rows.length} total</div></div>
    <div class="kpi"><span class="label">Inventory value</span><b class="num">${money(total)}</b><div class="delta">across ${valued.length} priced boats</div></div>
    <div class="kpi"><span class="label">Missing video</span><b class="num">${noVideo}</b><div class="delta">boats sell on video — fix these first</div></div>
    <div class="kpi"><span class="label">Priced “call”</span><b class="num">${noPrice}</b><div class="delta">no number on the page</div></div>
    <div class="kpi"><span class="label">Sold</span><b class="num">${soldYtd.length}</b><div class="delta">${money(soldYtd.reduce((s, r) => s + (r.price || 0), 0))} delivered</div></div>
  </div>

  <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <div class="search" style="max-width:280px">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>
      <input id="asearch" type="search" placeholder="Search inventory…" autocomplete="off">
    </div>
    <select class="sel" id="bulk" ${sel.size ? '' : 'disabled'}>
      <option value="">Bulk change status…</option>
      ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">Mark as ${v.label.toLowerCase()}</option>`).join('')}
    </select>
    <span class="muted" style="font-size:13px">${sel.size ? sel.size + ' selected' : ''}</span>
  </div>

  <div style="overflow-x:auto">
  <table class="tbl">
    <thead><tr>
      <th style="width:34px"><input type="checkbox" id="selall" aria-label="Select all"></th>
      <th style="width:70px"></th><th>Listing</th><th>Status</th><th>Length</th>
      <th>Hours</th><th>Price</th><th>Media</th><th>Listed</th><th></th>
    </tr></thead>
    <tbody id="tbody"></tbody>
  </table></div>`;

  const draw = (q = '') => {
    const f = rows.filter(r => !q || r.title.toLowerCase().includes(q.toLowerCase()));
    $('#tbody').innerHTML = f.map(r => {
      const st = STATUS[r.status];
      const vids = (r.media || []).filter(m => m.label).length;
      const pics = (r.media || []).filter(m => typeof m === 'string').length;
      return `<tr data-id="${r.id}">
        <td><input type="checkbox" class="rowsel" ${sel.has(r.id) ? 'checked' : ''} aria-label="Select"></td>
        <td><img class="thumb-sm" src="${(r.media || []).find(m => typeof m === 'string') || ''}" alt="" loading="lazy"></td>
        <td><div class="row-ttl">${esc(r.title)}</div>
          <div class="row-sub">${st.label}${pics ? ` · ${pics} photo${pics === 1 ? '' : 's'}` : ''}${vids ? ' · video' : ''}${r.featured ? ' · Featured' : ''}</div></td>
        <td class="num" style="color:var(--ink-3)">${r.year ?? '—'}</td>
        <td class="num">${r.length != null ? r.length + "'" : '—'}</td>
        <td class="num">${money(r.price)}${r.wasPrice ? `<div class="row-sub"><s>${money(r.wasPrice)}</s></div>` : ''}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-photos="${r.id}">Add photos</button>
          <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Edit</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7" style="padding:40px;text-align:center;color:var(--ink-3)">No matches.</td></tr>`;

    $$('[data-edit]').forEach(b => b.onclick = () => { editing = b.dataset.edit; tab = 'new'; render(); });
    $$('[data-photos]').forEach(b => b.onclick = () => { tab = 'media'; render(); openPicker(b.dataset.photos); });
    $$('.rowsel').forEach(c => c.onchange = () => {
      const id = c.closest('tr').dataset.id;
      c.checked ? sel.add(id) : sel.delete(id);
      renderList(); $('#asearch').focus();
    });
  };
  draw(listQuery);
  const sb = $('#asearch'); sb.value = listQuery;

  sb.oninput = e => { listQuery = e.target.value; draw(listQuery); };
  $('#add').onclick = () => { editing = null; tab = 'new'; render(); };
  $('#selall').onchange = e => { sel = e.target.checked ? new Set(rows.map(r => r.id)) : new Set(); renderList(); };
  $('#bulk').onchange = e => {
    if (!e.target.value) return;
    rows.forEach(r => { if (sel.has(r.id)) r.status = e.target.value; });
    save(); toast(`${sel.size} listing${sel.size === 1 ? '' : 's'} updated`); sel = new Set(); renderList();
  };
  $('#export').onclick = () => {
    CFG.download(CFG.build(rows, store.readAside()));   // listings + links + set-aside
    toast('Exported ads-config.json');
  };
  $('#importfile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      let cfg; try { cfg = JSON.parse(rd.result); } catch (err) { return toast('Not valid JSON'); }
      const applied = CFG.apply(SEED, cfg);
      rows = applied.rows; store.write(rows); store.writeAside(applied.aside);
      toast(`Imported — ${Object.keys(cfg.links || {}).length} listings with photos`);
      render();
    };
    rd.readAsText(f);
  };
  $('#reset').onclick = () => {
    if (!confirm('Discard the unsaved local draft and go back to the saved config?')) return;
    store.reset(); store.writeAside(new Set());
    rows = store.read(); sel = new Set();
    toast('Local draft cleared — showing the saved config'); render();
  };
}

/* ---------------- editor ------------------------------------------------- */
function renderForm() {
  const r = editing ? rows.find(x => x.id === editing) : {
    id:'', status:'available', title:'', body:[], media:[],
    year:null, price:null, wasPrice:null, length:null, hours:null, order:rows.length,
  };
  const f = (name, label, value, attrs = '', hint = '') => `
    <div class="field"><label class="label" for="i-${name}">${label}</label>
      <input class="inp" id="i-${name}" name="${name}" value="${esc(value ?? '')}" ${attrs}>
      ${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;

  $('#amain').innerHTML = `
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px">
    <h1 class="h1" style="flex:1">${editing ? 'Edit ad' : 'New ad'}</h1>
    ${editing ? `<button class="btn btn-ghost btn-sm" id="del">Delete</button>` : ''}
    <button class="btn btn-ghost btn-sm" id="cancel">Cancel</button>
    <button class="btn btn-primary btn-sm" id="savebtn">${editing ? 'Save changes' : 'Create ad'}</button>
  </div>

  <form id="bf" style="max-width:760px" onsubmit="return false">
    <div class="panel" style="margin-bottom:18px">
      <span class="label">The ad</span>
      <div style="height:14px"></div>
      <div class="field"><label class="label" for="i-title">Headline</label>
        <input class="inp" id="i-title" name="title" value="${esc(r.title)}">
        <div class="hint">Exactly as it reads on the page — this is what buyers and the gallery see.</div></div>
      <div class="field"><label class="label" for="i-body">Copy</label>
        <textarea class="inp" id="i-body" name="body" style="min-height:190px">${esc((r.body || []).join('\n'))}</textarea>
        <div class="hint">One paragraph per line. Lines starting with “-” render as bullets.</div></div>
      <div class="field" style="margin:0"><label class="label" for="i-status">Status</label>
        <select class="inp" id="i-status" name="status" style="max-width:220px">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select></div>
    </div>

    <div class="panel">
      <span class="label">What the ad states</span>
      <div class="hint" style="margin:6px 0 14px">Leave anything the listing does not actually say blank —
      a blank field shows nothing rather than a guess.</div>
      <div class="field-row">
        ${f('year', 'Year', r.year, 'type="number" min="1958" max="2027"')}
        ${f('length', 'Length (ft)', r.length, 'type="number" step="0.1" min="6" max="40"')}
        ${f('hours', 'Engine hours', r.hours, 'type="number" min="0"')}
      </div>
      <div class="field-row">
        ${f('price', 'Asking price ($)', r.price, 'type="number" min="0" step="100"', 'Blank shows “Call for price”')}
        ${f('wasPrice', 'Was ($)', r.wasPrice, 'type="number" min="0" step="100"', 'Shows a strike-through and a “Reduced” badge')}
      </div>
      <label class="chk" style="margin-top:4px"><input type="checkbox" name="featured" ${r.featured ? 'checked' : ''}><span>Feature at the top of the grid</span></label>
    </div>
  </form>

  <div class="panel" style="max-width:760px;margin-top:18px">
    <span class="label">Photos</span>
    <div class="hint" style="margin:6px 0 12px">Linked in the Gallery, not here.</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${(r.media || []).filter(m => typeof m === 'string').map(m =>
        `<img src="${m}" style="width:74px;height:56px;object-fit:cover;border-radius:5px;border:1px solid var(--line)">`).join('')
        || '<p class="muted" style="font-size:13px;margin:0">None linked yet.</p>'}
    </div>
    <button class="btn btn-ghost btn-sm" id="togallery" style="margin-top:12px">Add photos</button>
  </div>`;

  $('#cancel').onclick = () => { tab = 'list'; editing = null; render(); };
  $('#togallery').onclick = () => { tab = 'media'; render(); setTimeout(() => openPicker(r.id), 0); };
  if ($('#del')) $('#del').onclick = () => {
    if (!confirm('Delete this ad?')) return;
    rows = rows.filter(x => x.id !== editing); save(); toast('Ad deleted'); tab = 'list'; editing = null; render();
  };

  $('#savebtn').onclick = () => {
    const fd = new FormData($('#bf'));
    const num = k => { const v = fd.get(k); return v === '' || v == null ? null : +v; };
    const rec = {
      ...r,
      title: (fd.get('title') || '').trim(),
      body: (fd.get('body') || '').split('\n').map(x => x.trim()).filter(Boolean),
      status: fd.get('status'),
      year: num('year'), length: num('length'), hours: num('hours'),
      price: num('price'), wasPrice: num('wasPrice'),
      featured: fd.get('featured') === 'on',
    };
    if (!rec.title) return toast('A headline is required');
    if (!editing) {
      rec.id = rec.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
             + '-' + Math.random().toString(36).slice(2, 6);
      rec.order = rows.length; rec.media = [];
      rows.unshift(rec);
    } else {
      rows[rows.findIndex(x => x.id === editing)] = rec;
    }
    save(); toast(editing ? 'Ad saved' : 'Ad created'); tab = 'list'; editing = null; render();
  };
}

/* ---------------- media + delivery stubs --------------------------------- */
/* ==========================================================================
   Photos: pick some, save them to an ad. That is the whole workflow.

   This replaced a drag-and-drop rail with focus modes and caption filters. It
   was clever and nobody could use it. Now: an ad has an "Add photos" button, it
   opens a grid of everything unmatched, you click the ones that are it, you
   press Save.
   ========================================================================== */

/* Media comes in two shapes: a photo is a path string, a video is an object
   carrying its poster and a playback URL. `keyOf` reduces either to the one
   thing that identifies it in the library — the image you actually see. */
const isPic = m => typeof m === 'string';
const isVid = m => !!(m && typeof m === 'object' && m.src);
const keyOf = m => isPic(m) ? m : (m && m.poster) || '';

/* The whole library — photos and videos together — minus anything removed. */
function livePool() {
  const gone = store.readRemoved();
  return [
    ...(window.YCM_POOL   || []).map(p => ({ ...p, kind: 'photo' })),
    ...(window.YCM_VIDEOS || []).map(v => ({ ...v, kind: 'video', origin: 'video' })),
  ].filter(p => !gone.has(p.file));
}
const picsOf  = r => (r.media || []).filter(isPic);
const mediaOf = r => (r.media || []).filter(m => isPic(m) || isVid(m));

function renderMedia() {
  const POOL = livePool();
  const aside = store.readAside();
  const used = new Set(rows.flatMap(r => mediaOf(r).map(keyOf)));
  const todo = POOL.filter(p => !used.has(p.file) && !aside.has(p.file)).length;
  const withPhotos = rows.filter(r => mediaOf(r).length).length;
  const removed = store.readRemoved();

  /* Ads with no photo that have photos waiting which sat under them on the live
     page. Only these are touched by "fill" — anything matched by hand is left. */
  const free = p => !used.has(p.file) && !aside.has(p.file);
  const emptyWithSuggestions = rows.filter(r => !mediaOf(r).length &&
    POOL.some(p => p.suggest === r.id && free(p)));

  $('#amain').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <h1 class="h1" style="flex:1">Photos</h1>
      ${emptyWithSuggestions.length ? `<button class="btn btn-primary btn-sm" id="fillempty">Fill ${emptyWithSuggestions.length} empty ad${emptyWithSuggestions.length === 1 ? '' : 's'} from the live page</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="browseall">Browse all photos</button>
      <button class="btn btn-ghost btn-sm" id="showaside">Set aside (${aside.size})</button>
      ${removed.size ? `<button class="btn btn-ghost btn-sm" id="showremoved">Removed (${removed.size})</button>` : ''}
    </div>
    <p class="muted" style="margin:0 0 20px;max-width:72ch">Each ad has an <b>Add photos</b> button that opens
    everything unused. <b>Browse all photos</b> opens the whole library, where you can set photos aside or remove
    them from it entirely. Nothing is guessed for you.</p>

    <div class="kpis" style="margin-bottom:22px">
      <div class="kpi"><span class="label">Unused photos</span><b class="num">${todo}</b><div class="delta">of ${POOL.length} in the library</div></div>
      <div class="kpi"><span class="label">Ads with photos</span><b class="num">${withPhotos}</b><div class="delta">of ${rows.length}</div></div>
      <div class="kpi"><span class="label">Set aside</span><b class="num">${aside.size}</b><div class="delta">kept, not offered</div></div>
      <div class="kpi"><span class="label">Removed</span><b class="num">${removed.size}</b><div class="delta">out of the library</div></div>
    </div>

    <div class="search" style="max-width:320px;margin-bottom:16px">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>
      <input id="adq" type="search" placeholder="Find an ad…" autocomplete="off">
    </div>
    <div id="adlist"></div>`;

  const drawAds = () => {
    const q = ($('#adq').value || '').toLowerCase().trim();
    const list = rows.filter(r => !q || r.title.toLowerCase().includes(q));
    $('#adlist').innerHTML = list.map(r => {
      const pics = mediaOf(r);
      return `<section class="adcard" data-lid="${r.id}">
        <header>
          <div>
            <h3 class="h3">${esc(r.title)}</h3>
            <div class="adcard-sub">${[r.year, r.length != null ? r.length + "'" : null,
              r.price != null ? '$' + r.price.toLocaleString('en-US') : 'Call',
              STATUS[r.status].label].filter(Boolean).join(' · ')}</div>
          </div>
          <span class="adcard-count ${pics.length ? '' : 'zero'}">${pics.length || 'No'} photo${pics.length === 1 ? '' : 's'}</span>
          <button class="btn btn-primary btn-sm" data-add="${r.id}">Add photos</button>
        </header>
        ${pics.length ? `<div class="adcard-strip">${pics.map((m, i) => {
          const f = keyOf(m);
          return `<span class="ad-thumb ${i === 0 ? 'lead' : ''}" data-lead="${f}" data-lid="${r.id}"
                title="${i === 0 ? 'Leads the listing' : 'Click to make this lead'}">
            <img src="${f}" alt="">
            ${isVid(m) ? `<span class="vbadge">${PLAY}</span>` : ''}
            <button class="rm" data-rm="${f}" title="Take off this ad">${X}</button>
          </span>`; }).join('')}</div>` : ''}
      </section>`;
    }).join('') || `<p class="muted" style="padding:36px;text-align:center">No ad matches.</p>`;

    $$('[data-add]').forEach(b => b.onclick = () => openPicker(b.dataset.add));
    $$('[data-rm]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      rows.forEach(r => { if (r.media) r.media = r.media.filter(m => keyOf(m) !== b.dataset.rm); });
      save(); toast('Taken off the ad'); renderMedia();
    });
    $$('[data-lead]').forEach(t => t.onclick = e => {
      if (e.target.closest('.rm')) return;
      const r = rows.find(x => x.id === t.dataset.lid), f = t.dataset.lead;
      const item = (r.media || []).find(m => keyOf(m) === f);
      r.media = [item, ...(r.media || []).filter(m => m !== item)];
      save(); toast('Now leads the listing'); renderMedia();
    });
  };
  drawAds();
  $('#adq').oninput = drawAds;
  $('#browseall').onclick = () => openPicker(null, 'all');
  if ($('#fillempty')) $('#fillempty').onclick = () => {
    const n = emptyWithSuggestions.length;
    if (!confirm(`Add the photos that sat under each of these ${n} ads on the live inventory page?\n\n`
      + `Ads you have already filled in are not touched. You can remove anything that looks wrong.`)) return;
    let count = 0;
    emptyWithSuggestions.forEach(r => {
      const mine = POOL.filter(p => p.suggest === r.id && free(p));
      r.media = [...(r.media || []), ...mine.map(p => p.file)];
      count += mine.length;
    });
    save();
    toast(`${count} photos added across ${n} ads — check them and remove any that are wrong`);
    renderMedia();
  };
  $('#showaside').onclick = () => openPicker(null, 'aside');
  if ($('#showremoved')) $('#showremoved').onclick = () => openPicker(null, 'removed');
}

/* ---- the picker ---------------------------------------------------------- */
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z"/></svg>';
const X = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"/></svg>';
const TICK = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.2 4.6 8.8 10 3.4"/></svg>';

function openPicker(lid, view = 'add') {
  const aside   = store.readAside();
  const removed = store.readRemoved();
  const ad      = lid ? rows.find(r => r.id === lid) : null;
  const used    = new Set(rows.flatMap(r => mediaOf(r).map(keyOf)));
  const byFile  = new Map(livePool().map(p => [p.file, p]));
  const pick    = new Set();
  let filter = 'unused', kind = 'any';

  const stateOf = f => removed.has(f) ? 'removed' : aside.has(f) ? 'aside'
                     : used.has(f)    ? 'used'    : 'unused';

  const ALL = () => [
    ...(window.YCM_POOL   || []).map(p => ({ ...p, kind: 'photo' })),
    ...(window.YCM_VIDEOS || []).map(v => ({ ...v, kind: 'video' })),
  ];
  const available = () => {
    const all = ALL().filter(p => kind === 'any' || p.kind === kind);
    if (view === 'aside')   return all.filter(p => stateOf(p.file) === 'aside');
    if (view === 'removed') return all.filter(p => stateOf(p.file) === 'removed');
    if (view === 'all') {
      const live = all.filter(p => stateOf(p.file) !== 'removed');
      return filter === 'any' ? live : live.filter(p => stateOf(p.file) === filter);
    }
    return all.filter(p => stateOf(p.file) === 'unused');
  };

  const TITLE  = { add: ad ? esc(ad.title) : '', aside: 'Media you set aside',
                   removed: 'Removed from the library', all: 'The whole library' }[view];
  const KICKER = { add: 'Add media to', aside: 'Set aside', removed: 'Removed', all: 'Library' }[view];

  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet-box" role="dialog" aria-modal="true" aria-label="Media">
      <header class="sheet-head">
        <div><span class="label">${KICKER}</span>
          <h2 class="h2" style="margin-top:5px">${TITLE}</h2></div>
        <select class="sel" id="kindf">
          <option value="any">Photos and video</option>
          <option value="photo">Photos only</option>
          <option value="video">Video only</option></select>
        ${view === 'all' ? `<select class="sel" id="statef">
          <option value="unused">Not on an ad</option>
          <option value="used">On an ad</option>
          <option value="aside">Set aside</option>
          <option value="any">Everything</option></select>` : ''}
        <button class="icon-btn" id="sheet-x" aria-label="Close">${X}</button>
      </header>
      <div class="sheet-body"><div id="pickgrid"></div></div>
      <footer class="sheet-foot">
        <span id="picked" class="muted">Nothing selected</span>
        <span style="flex:1"></span>
        ${view === 'add' ? `
          <button class="btn btn-ghost" id="setaside" disabled>Not this boat</button>
          <button class="btn btn-primary" id="savepick" disabled>Save to this ad</button>` : ''}
        ${view === 'aside' ? `
          <button class="btn btn-ghost" id="remove" disabled>Remove from library</button>
          <button class="btn btn-primary" id="restore" disabled>Put back in the pool</button>` : ''}
        ${view === 'removed' ? `
          <button class="btn btn-primary" id="unremove" disabled>Put back in the library</button>` : ''}
        ${view === 'all' ? `
          <button class="btn btn-ghost" id="remove" disabled>Remove from library</button>
          <button class="btn btn-ghost" id="restore" disabled>Put back</button>
          <button class="btn btn-primary" id="setaside" disabled>Set aside</button>` : ''}
      </footer>
    </div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  const close = () => { el.remove(); document.body.style.overflow = ''; };

  const BADGE = { used: 'On an ad', aside: 'Set aside', removed: 'Removed' };
  const card = p => {
    const st = stateOf(p.file);
    return `<figure class="pcard ${pick.has(p.file) ? 'sel' : ''}" data-f="${p.file}"
                    data-state="${st}" data-kind="${p.kind}">
      <span class="tick">${TICK}</span>
      ${p.kind === 'video' ? `<span class="vbadge">${PLAY}</span>` : ''}
      ${st !== 'unused' && view === 'all' ? `<span class="pstate">${BADGE[st]}</span>` : ''}
      <img src="${p.file}" alt="" loading="lazy" decoding="async">
    </figure>`;
  };

  const paint = () => {
    const list = available();
    const mine = view === 'add' ? list.filter(p => p.suggest === lid) : [];
    const rest = list.filter(p => !mine.includes(p));
    $('#pickgrid', el).innerHTML = !list.length
      ? `<p class="muted" style="padding:48px;text-align:center">Nothing here.</p>`
      : (mine.length
        ? `<div class="pickgroup"><div class="pickgroup-h">
             <span class="label">Sat under this ad on the live site &mdash; ${mine.length}</span>
             <button class="link-btn" id="pickall">Select all ${mine.length}</button></div>
             <div class="pool">${mine.map(card).join('')}</div></div>
           <div class="pickgroup"><div class="pickgroup-h">
             <span class="label">Everything else &mdash; ${rest.length}</span></div>
             <div class="pool">${rest.map(card).join('')}</div></div>`
        : `<div class="pool">${list.map(card).join('')}</div>`);

    $$('.pcard', el).forEach(c => c.onclick = () => {
      const f = c.dataset.f;
      pick.has(f) ? pick.delete(f) : pick.add(f);
      paint();
    });
    const all = $('#pickall', el);
    if (all) all.onclick = () => { mine.forEach(p => pick.add(p.file)); paint(); };
    const v = [...pick].filter(f => (byFile.get(f) || {}).kind === 'video').length;
    $('#picked', el).textContent = pick.size
      ? `${pick.size} selected${v ? ` (${v} video)` : ''}` : 'Nothing selected';
    ['savepick','setaside','restore','remove','unremove'].forEach(id => {
      const b = $('#' + id, el); if (b) b.disabled = !pick.size;
    });
  };
  paint();

  $('#sheet-x', el).onclick = close;
  el.addEventListener('click', e => { if (e.target === el) close(); });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  $('#kindf', el).onchange = e => { kind = e.target.value; pick.clear(); paint(); };
  if ($('#statef', el)) $('#statef', el).onchange = e => { filter = e.target.value; pick.clear(); paint(); };

  const persist = msg => { save(); store.writeAside(aside); store.writeRemoved(removed);
                           toast(msg); pick.clear(); paint(); };

  if ($('#savepick', el)) $('#savepick', el).onclick = () => {
    ad.media = ad.media || [];
    const n = pick.size;
    pick.forEach(f => {
      rows.forEach(o => { if (o.media) o.media = o.media.filter(m => keyOf(m) !== f); });
      aside.delete(f); removed.delete(f);
      const item = byFile.get(f);
      /* A video carries its poster and playback URL. Hosting stays on Wix for
         now, so only `src` changes if that ever moves. */
      ad.media.push(item && item.kind === 'video'
        ? { label: 'Walkaround video', ratio: '16:9', src: item.src, poster: item.file }
        : f);
    });
    save(); store.writeAside(aside); store.writeRemoved(removed);
    toast(`${n} added to ${ad.title.slice(0, 34)}`);
    close(); renderMedia();
  };
  if ($('#setaside', el)) $('#setaside', el).onclick = () => {
    const n = pick.size; pick.forEach(f => { aside.add(f); removed.delete(f); });
    persist(`${n} set aside`);
  };
  if ($('#restore', el)) $('#restore', el).onclick = () => {
    const n = pick.size; pick.forEach(f => { aside.delete(f); removed.delete(f); });
    persist(`${n} back in the pool`);
  };
  if ($('#unremove', el)) $('#unremove', el).onclick = () => {
    const n = pick.size; pick.forEach(f => removed.delete(f));
    persist(`${n} back in the library`);
  };
  if ($('#remove', el)) $('#remove', el).onclick = () => {
    const n = pick.size;
    if (!confirm(`Remove ${n} item${n === 1 ? '' : 's'} from the library?\n\n`
      + `They come off any ad they are on and stop being offered. Files stay on disk `
      + `and you can put them back from the Removed view.`)) return;
    pick.forEach(f => {
      removed.add(f); aside.delete(f);
      rows.forEach(o => { if (o.media) o.media = o.media.filter(m => keyOf(m) !== f); });
    });
    persist(`${n} removed from the library`);
  };
}

function renderShip() {
  const live = rows.filter(r => r.status !== 'sold');
  $('#amain').innerHTML = `
    <h1 class="h1" style="margin-bottom:8px">Delivery</h1>
    <p class="muted" style="margin:0 0 22px;max-width:60ch">Every YCM boat is professionally delivered. This is where the
    transport board would live — carrier, pickup, ETA, and the buyer's phone number, so "where's my boat" answers itself.</p>
    <div class="panel"><span class="label">Placeholder</span>
      <p class="prose" style="margin-top:12px">Not built in this prototype. ${live.length} live listings would feed it.</p></div>`;
}

/* ---------------- ------------------------------------------------------- */
let toastT;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
function render() {
  renderNav();
  ({ list: renderList, new: renderForm, media: renderMedia, ship: renderShip })[tab]();
  scrollTo(0, 0);
}
(async () => {
  canWrite = await CFG.writable();
  const cfg = await CFG.load();
  if (cfg) {
    const applied = CFG.apply(SEED, cfg);
    savedRows = applied.rows; savedAside = applied.aside;
    // no local draft yet -> run on exactly what is saved
    if (!localStorage.getItem(KEY)) { rows = structuredClone(savedRows); store.writeAside(savedAside); }
  }
  render();
})();
})();
