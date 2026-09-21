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
const PKEY = 'ycm.postlinks.v1';
const EKEY = 'ycm.postedits.v1';
const today = () => new Date().toISOString().slice(0, 10);

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
  // which photographs have been attached to which blog post
  readPostLinks()  { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { return {}; } },
  writePostLinks(v){ try { localStorage.setItem(PKEY, JSON.stringify(v)); } catch (e) { toast('Could not save: ' + e.message); } },
  // corrections to the notes: only the fields somebody actually changed
  readPostEdits()  { try { return JSON.parse(localStorage.getItem(EKEY)) || {}; } catch { return {}; } },
  writePostEdits(v){ try { localStorage.setItem(EKEY, JSON.stringify(v)); } catch (e) { toast('Could not save: ' + e.message); } },
};
const CFG = window.YCM_CONFIG;

/* saved  = what is on disk (assets/data/ads-config.json), or the seed
   rows   = what you are working on; the localStorage draft if there is one
   dirty  = the two differ, so there is something worth saving              */
let savedRows = structuredClone(SEED), savedAside = new Set(), savedPostLinks = {}, savedPostEdits = {};
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
  return !CFG.same(CFG.build(rows, store.readAside(), store.readPostLinks(), store.readPostEdits()),
                   CFG.build(savedRows, savedAside, savedPostLinks, savedPostEdits));
}
function paintDirty() {
  const b = document.getElementById('savebar');
  if (b) b.hidden = !isDirty();
  const n = document.getElementById('dirtydot');
  if (n) n.hidden = !isDirty();
}

let tab = 'list', editing = null, sel = new Set(), listQuery = '';
let editingPost = null, noteQuery = '';

/* ---------------- shell -------------------------------------------------- */
const TABS = [
  ['list',  'Inventory', '<path d="M2 3h12M2 8h12M2 13h12"/>'],
  ['new',   'New ad','<path d="M8 3v10M3 8h10"/>'],
  ['notes', 'Notes',     '<path d="M3.5 2h6l3 3v9h-9z"/><path d="M9.5 2v3h3M5.5 8h5M5.5 11h3.5"/>'],
  ['media', 'Photos',     '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m5 10 2.2-2.6L9 9.4l1.6-1.8L13 11"/>'],
  ['sold',  'Sold',      '<path d="M2 12.5 6 8l3 2.6L14 4"/><path d="M14 7.5V4h-3.5"/>'],
  ['ship',  'Delivery',  '<path d="M1 10h14M3 10V5h6v5M9 7h3l2 3"/>'],
];
/* Always try to write first, and only fall back to a download if there is
   genuinely nowhere to write. Deciding this at boot was wrong: a page opened
   before the writable server started would offer a download forever, even
   though saving would have worked. */
async function saveToDisk() {
  const payload = CFG.build(rows, store.readAside(), store.readPostLinks(), store.readPostEdits());
  try {
    const r = await CFG.save(payload);
    savedRows = structuredClone(rows);
    savedAside = store.readAside();
    savedPostLinks = store.readPostLinks();
    savedPostEdits = store.readPostEdits();
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
  store.write(rows); store.writeAside(savedAside); store.writePostEdits(savedPostEdits);
  toast('Reverted to the saved config');
  render();
}

function renderNav() {
  $('#anav').innerHTML = `<div>${TABS.map(([id, label, path]) =>
    `<a href="#" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
      ${label}</a>`).join('')}</div>`;
  $$('#anav a').forEach(a => a.onclick = e => {
    e.preventDefault(); tab = a.dataset.tab; editing = null; editingPost = null; render(); });

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
    const st = e.target.value, n = sel.size;
    rows.forEach(r => {
      if (!sel.has(r.id)) return;
      r.status = st;
      // Dated here rather than left blank, so the sale is in the totals from the
      // moment it is marked; the date and the figure are both editable on Sold.
      if (st === 'sold' && !r.soldOn) r.soldOn = today();
    });
    save();
    toast(st === 'sold'
      ? `${n} marked sold today — add what ${n === 1 ? 'it' : 'they'} fetched on the Sold page`
      : `${n} listing${n === 1 ? '' : 's'} updated`);
    sel = new Set(); renderList();
  };
  $('#export').onclick = () => {
    CFG.download(CFG.build(rows, store.readAside(), store.readPostLinks(), store.readPostEdits()));
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

    <div class="panel" id="soldpanel" style="margin-top:18px" ${r.status === 'sold' ? '' : 'hidden'}>
      <span class="label">The sale</span>
      <div class="hint" style="margin:6px 0 14px">Kept for the Sold page, and nowhere on the public site.
      Fill in what you know — every figure there is worked out from these, so a blank one
      is left out of the averages rather than guessed at.</div>
      <div class="field-row">
        ${f('listedOn', 'First listed', r.listedOn, 'type="date"', 'Gives days on the market')}
        ${f('soldOn', 'Sold on', r.soldOn, 'type="date"', 'Defaults to today when you mark one sold')}
        ${f('soldPrice', 'Sold for ($)', r.soldPrice, 'type="number" min="0" step="100"', 'What it actually fetched')}
      </div>
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

  $('#i-status').onchange = e => { $('#soldpanel').hidden = e.target.value !== 'sold'; };
  $('#cancel').onclick = () => { tab = 'list'; editing = null; render(); };
  $('#togallery').onclick = () => { tab = 'media'; render(); setTimeout(() => openPicker(r.id), 0); };
  if ($('#del')) $('#del').onclick = () => {
    if (!confirm('Delete this ad?')) return;
    rows = rows.filter(x => x.id !== editing); save(); toast('Ad deleted'); tab = 'list'; editing = null; render();
  };

  $('#savebtn').onclick = () => {
    const fd = new FormData($('#bf'));
    const num = k => { const v = fd.get(k); return v === '' || v == null ? null : +v; };
    const str = k => { const v = (fd.get(k) || '').trim(); return v || null; };
    const rec = {
      ...r,
      title: (fd.get('title') || '').trim(),
      body: (fd.get('body') || '').split('\n').map(x => x.trim()).filter(Boolean),
      status: fd.get('status'),
      year: num('year'), length: num('length'), hours: num('hours'),
      price: num('price'), wasPrice: num('wasPrice'),
      listedOn: str('listedOn'), soldOn: str('soldOn'), soldPrice: num('soldPrice'),
      featured: fd.get('featured') === 'on',
    };
    if (!rec.title) return toast('A headline is required');
    // A boat marked sold with no date would sit outside every total on the Sold
    // page and look like a bug. Today is the honest default and it is editable.
    if (rec.status === 'sold' && !rec.soldOn) rec.soldOn = today();
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
/* The portal reads the archive and lays the saved corrections over it, hidden
   notes included — the public pages drop those, this is the one place you can
   still get at them to put one back. */
const POSTS   = () => CFG.mergePosts(window.YCM_POSTS || [], store.readPostEdits(), true);
const postPics = () => Object.values(store.readPostLinks()).flat();
const mediaOf = r => (r.media || []).filter(m => isPic(m) || isVid(m));

function renderMedia() {
  const POOL = livePool();
  const aside = store.readAside();
  const used = new Set([...rows.flatMap(r => mediaOf(r).map(keyOf)), ...postPics()]);
  const todo = POOL.filter(p => !used.has(p.file) && !aside.has(p.file)).length;
  const plinks = store.readPostLinks();
  const postsWith = POSTS().filter(p => (plinks[p.id] || []).length).length;
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
      <div class="kpi"><span class="label">Posts with photos</span><b class="num">${postsWith}</b><div class="delta">of ${POSTS().length}</div></div>
    </div>

    <div class="search" style="max-width:320px;margin-bottom:16px">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>
      <input id="adq" type="search" placeholder="Find an ad…" autocomplete="off">
    </div>
    <div id="adlist"></div>

    <div class="band-h" style="margin:38px 0 10px">
      <div><span class="label">Blog</span>
        <h2 class="h1" style="margin-top:6px;font-size:20px">Posts</h2></div>
    </div>
    <p class="muted" style="margin:0 0 14px;max-width:70ch">Posts carry the photographs they had on
    the live page, read straight off the archive. Attach one here to override it.</p>
    <div class="search" style="max-width:320px;margin-bottom:14px">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>
      <input id="postq" type="search" placeholder="Find a post…" autocomplete="off">
    </div>
    <div id="postlist"></div>`;

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
  const drawPosts = () => {
    const q = ($('#postq').value || '').toLowerCase().trim();
    const links = store.readPostLinks();
    const list = POSTS().filter(p => !q || p.title.toLowerCase().includes(q));
    $('#postlist').innerHTML = list.map(p => {
      const pics = links[p.id] || [];
      return `<section class="adcard" data-pid="${p.id}">
        <header>
          <div><h3 class="h3">${esc(p.title)}${p.hidden ? '<span class="nflag">Hidden</span>' : ''}</h3>
            <div class="adcard-sub">${p.body.length} paragraph${p.body.length === 1 ? '' : 's'}</div></div>
          <span class="adcard-count ${pics.length ? '' : 'zero'}">${pics.length || 'No'} photo${pics.length === 1 ? '' : 's'}</span>
          <button class="btn btn-primary btn-sm" data-addpost="${p.id}">Add photos</button>
        </header>
        ${pics.length ? `<div class="adcard-strip">${pics.map((f, i) => `
          <span class="ad-thumb ${i === 0 ? 'lead' : ''}" data-plead="${f}" data-pid="${p.id}"
                title="${i === 0 ? 'Leads the post' : 'Click to make this lead'}">
            <img src="${f}" alt="">
            <button class="rm" data-prm="${f}" data-pid="${p.id}" title="Take off this post">${X}</button>
          </span>`).join('')}</div>` : ''}
      </section>`;
    }).join('') || `<p class="muted" style="padding:30px;text-align:center">No post matches.</p>`;

    $$('[data-addpost]').forEach(b => b.onclick = () => openPicker(b.dataset.addpost, 'add', 'post'));
    $$('[data-prm]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const l = store.readPostLinks(); const id = b.dataset.pid;
      l[id] = (l[id] || []).filter(f => f !== b.dataset.prm);
      if (!l[id].length) delete l[id];
      store.writePostLinks(l); paintDirty(); toast('Taken off the post'); renderMedia();
    });
    $$('[data-plead]').forEach(t => t.onclick = e => {
      if (e.target.closest('.rm')) return;
      const l = store.readPostLinks(); const id = t.dataset.pid, f = t.dataset.plead;
      l[id] = [f, ...(l[id] || []).filter(x => x !== f)];
      store.writePostLinks(l); paintDirty(); toast('Now leads the post'); renderMedia();
    });
  };

  drawAds(); drawPosts();
  $('#postq').oninput = drawPosts;
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

function openPicker(lid, view = 'add', target = 'ad') {
  const aside   = store.readAside();
  const removed = store.readRemoved();
  const plinks  = store.readPostLinks();
  /* A photograph can belong to a listing or to a blog post. Both are targets;
     only where the result gets written differs. */
  const ad      = lid ? (target === 'post' ? POSTS().find(p => p.id === lid)
                                           : rows.find(r => r.id === lid)) : null;
  const used    = new Set([...rows.flatMap(r => mediaOf(r).map(keyOf)),
                           ...Object.values(plinks).flat()]);
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
  const KICKER = { add: target === 'post' ? 'Add photos to post' : 'Add media to',
                   aside: 'Set aside', removed: 'Removed', all: 'Library' }[view];

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
             <span class="label">${target === 'post' ? 'Sat inside this post' : 'Sat under this ad'} on the live site &mdash; ${mine.length}</span>
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
    const n = pick.size;
    if (target === 'post') {
      const l = store.readPostLinks();
      pick.forEach(f => {
        // a photograph lives in one place: take it off any listing or other post
        rows.forEach(o => { if (o.media) o.media = o.media.filter(m => keyOf(m) !== f); });
        Object.keys(l).forEach(k => { l[k] = l[k].filter(x => x !== f); if (!l[k].length) delete l[k]; });
        aside.delete(f); removed.delete(f);
        l[lid] = [...(l[lid] || []), f];
      });
      save(); store.writePostLinks(l); store.writeAside(aside); store.writeRemoved(removed);
    } else {
      ad.media = ad.media || [];
      const l = store.readPostLinks();
      pick.forEach(f => {
        rows.forEach(o => { if (o.media) o.media = o.media.filter(m => keyOf(m) !== f); });
        Object.keys(l).forEach(k => { l[k] = l[k].filter(x => x !== f); if (!l[k].length) delete l[k]; });
        aside.delete(f); removed.delete(f);
        const item = byFile.get(f);
        /* A video carries its poster and playback URL. Hosting stays on Wix for
           now, so only `src` changes if that ever moves. */
        ad.media.push(item && item.kind === 'video'
          ? { label: 'Walkaround video', ratio: '16:9', src: item.src, poster: item.file }
          : f);
      });
      save(); store.writePostLinks(l); store.writeAside(aside); store.writeRemoved(removed);
    }
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
    const l = store.readPostLinks();
    pick.forEach(f => {
      removed.add(f); aside.delete(f);
      rows.forEach(o => { if (o.media) o.media = o.media.filter(m => keyOf(m) !== f); });
      Object.keys(l).forEach(k => { l[k] = l[k].filter(x => x !== f); if (!l[k].length) delete l[k]; });
    });
    store.writePostLinks(l);
    persist(`${n} removed from the library`);
  };
}

/* ==========================================================================
   Notes. The 181 notes are a transcription of the archived home page, so this
   edits them by exception: a patch per note holding only the fields somebody
   actually changed. Nothing is ever deleted — "hide" takes a note off the
   public pages and leaves it here, where it can be put back.

   A patch written against an id the archive does not have is a note written
   here rather than a correction to one, and joins the list on the same terms.
   ========================================================================== */
const seedPost = id => (window.YCM_POSTS || []).find(p => p.id === id);

function patchPost(id, patch) {
  const all = store.readPostEdits();
  const next = { ...(all[id] || {}), ...patch };
  const seed = seedPost(id);
  const empty = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length);
  Object.keys(next).forEach(k => {
    // a field put back to what the archive says is no longer an edit
    if (empty(next[k])) delete next[k];
    else if (seed && JSON.stringify(seed[k]) === JSON.stringify(next[k])) delete next[k];
  });
  // a note of our own is its patch: emptying it would delete the note itself
  if (Object.keys(next).length || !seed) all[id] = next; else delete all[id];
  store.writePostEdits(all);
  paintDirty();
}

/* Reordering swaps two notes' `order`. Effective order is the one on the note
   or, for anything that has never carried one, its place in the file. */
function moveNote(id, dir) {
  const list = POSTS();
  const i = list.findIndex(p => p.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const ord = p => p.order ?? list.indexOf(p);
  const a = ord(list[i]), b = ord(list[j]);
  patchPost(list[i].id, { order: b });
  patchPost(list[j].id, { order: a });
  renderNotes();
}

function renderNotes() {
  if (editingPost !== null) return renderNoteForm();
  const all    = POSTS();
  const links  = store.readPostLinks();
  const edits  = store.readPostEdits();
  const shown  = all.filter(p => !p.hidden);
  const hidden = all.length - shown.length;
  const tagged = all.filter(p => p.tag).length;
  const shot   = p => (links[p.id] || []).length || (p.wix || []).length;
  const withPic = all.filter(shot).length;

  $('#amain').innerHTML = `
  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px">
    <h1 class="h1" style="flex:1">Notes</h1>
    <button class="btn btn-primary btn-sm" id="newnote">Write a note</button>
  </div>
  <p class="muted" style="margin:0 0 22px;max-width:74ch">What the site calls
  <b>Notes from the yard</b>. The wording came off the old site word for word, so only what you
  change here is saved — everything else keeps reading as it was written. Hiding a note takes it
  off the public pages and leaves it in this list.</p>

  <div class="kpis">
    <div class="kpi"><span class="label">On the site</span><b class="num">${shown.length}</b><div class="delta">of ${all.length} in the archive</div></div>
    <div class="kpi"><span class="label">With a photograph</span><b class="num">${withPic}</b><div class="delta">the rest run as text</div></div>
    <div class="kpi"><span class="label">Tagged</span><b class="num">${tagged}</b><div class="delta">${tagged ? 'filterable on the site' : 'no tags yet'}</div></div>
    <div class="kpi"><span class="label">Hidden</span><b class="num">${hidden}</b><div class="delta">kept, not published</div></div>
    <div class="kpi"><span class="label">Edited here</span><b class="num">${Object.keys(edits).length}</b><div class="delta">the rest are as transcribed</div></div>
  </div>

  <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <div class="search" style="max-width:320px">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>
      <input id="notesearch" type="search" placeholder="Search the notes…" autocomplete="off">
    </div>
    <span class="muted" style="font-size:12.5px" id="notecount"></span>
  </div>
  <div id="notelist"></div>`;

  const draw = () => {
    const q = noteQuery.toLowerCase().trim();
    const list = q ? all.filter(p => (p.title + ' ' + (p.body || []).join(' ')).toLowerCase().includes(q)) : all;
    $('#notecount').textContent = q ? `${list.length} of ${all.length}` : `${all.length} notes, newest first`;
    $('#notelist').innerHTML = list.map((p, i) => {
      const pics = (links[p.id] || []).length || (p.wix || []).length;
      return `<section class="notecard${p.hidden ? ' off' : ''}" data-nid="${p.id}">
        <div class="notecard-txt">
          <div class="notecard-ttl">
            ${p.tag ? `<span class="ntag">${esc(p.tag)}</span>` : ''}${esc(p.title) || '<i>Untitled</i>'}
            ${p.hidden ? '<span class="nflag">Hidden</span>' : ''}
            ${!seedPost(p.id) ? '<span class="nflag nflag-new">Written here</span>' : ''}
          </div>
          ${(p.body || [])[0] ? `<p class="notecard-b">${esc(p.body[0])}</p>` : ''}
          <div class="notecard-m">${(p.body || []).length} paragraph${(p.body || []).length === 1 ? '' : 's'}
            · ${pics ? pics + ' photo' + (pics === 1 ? '' : 's') : 'no photograph'}
            ${edits[p.id] ? ' · edited' : ''}</div>
        </div>
        <div class="notecard-acts">
          ${q ? '' : `<button class="icon-btn" data-up="${p.id}" title="Move up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
          <button class="icon-btn" data-down="${p.id}" title="Move down" ${i === list.length - 1 ? 'disabled' : ''}>&darr;</button>`}
          <button class="btn btn-ghost btn-sm" data-hide="${p.id}">${p.hidden ? 'Show' : 'Hide'}</button>
          <button class="btn btn-ghost btn-sm" data-note="${p.id}">Edit</button>
        </div>
      </section>`;
    }).join('') || `<p class="muted" style="padding:40px;text-align:center">No note matches.</p>`;

    $$('[data-note]').forEach(b => b.onclick = () => { editingPost = b.dataset.note; render(); });
    $$('[data-hide]').forEach(b => b.onclick = () => {
      const p = all.find(x => x.id === b.dataset.hide);
      patchPost(p.id, { hidden: !p.hidden });
      toast(p.hidden ? 'Back on the site' : 'Hidden — it stays in this list');
      renderNotes();
    });
    $$('[data-up]').forEach(b => b.onclick = () => moveNote(b.dataset.up, -1));
    $$('[data-down]').forEach(b => b.onclick = () => moveNote(b.dataset.down, 1));
  };
  draw();
  const sb = $('#notesearch'); sb.value = noteQuery;
  sb.oninput = e => { noteQuery = e.target.value; draw(); };
  $('#newnote').onclick = () => { editingPost = 'new'; render(); };
}

function renderNoteForm() {
  const isNew = editingPost === 'new';
  const p = isNew ? { id:'', title:'', body:[], tag:'', hidden:false }
                  : POSTS().find(x => x.id === editingPost);
  if (!p) { editingPost = null; return renderNotes(); }
  const seed = seedPost(p.id);
  const links = store.readPostLinks()[p.id] || [];
  const tags = [...new Set(POSTS().map(x => x.tag).filter(Boolean))];

  $('#amain').innerHTML = `
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;flex-wrap:wrap">
    <h1 class="h1" style="flex:1">${isNew ? 'Write a note' : 'Edit note'}</h1>
    ${isNew ? '' : `<button class="btn btn-ghost btn-sm" id="noterevert" ${seed && store.readPostEdits()[p.id] ? '' : 'disabled'}>Back to the original</button>`}
    <button class="btn btn-ghost btn-sm" id="notecancel">Cancel</button>
    <button class="btn btn-primary btn-sm" id="notesave">${isNew ? 'Publish note' : 'Save changes'}</button>
  </div>

  <form id="nf" style="max-width:760px" onsubmit="return false">
    <div class="panel">
      <span class="label">The note</span>
      <div style="height:14px"></div>
      <div class="field"><label class="label" for="n-title">Title</label>
        <input class="inp" id="n-title" name="title" value="${esc(p.title)}"></div>
      <div class="field"><label class="label" for="n-body">Writing</label>
        <textarea class="inp" id="n-body" name="body" style="min-height:240px">${esc((p.body || []).join('\n'))}</textarea>
        <div class="hint">One paragraph per line, exactly as it should read.</div></div>
      <div class="field-row" style="margin:0">
        <div class="field" style="margin:0"><label class="label" for="n-tag">Tag</label>
          <input class="inp" id="n-tag" name="tag" value="${esc(p.tag || '')}" list="taglist" placeholder="None">
          <datalist id="taglist">${tags.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
          <div class="hint">Groups the note on the site. “Owners” is the happy-pics tag.</div></div>
        <div class="field" style="margin:0"><span class="label">Publishing</span>
          <label class="chk" style="margin-top:9px"><input type="checkbox" name="hidden" ${p.hidden ? 'checked' : ''}><span>Hide this note from the site</span></label></div>
      </div>
    </div>
  </form>

  <div class="panel" style="max-width:760px;margin-top:18px">
    <span class="label">Photographs</span>
    <div class="hint" style="margin:6px 0 12px">${links.length
      ? 'Attached in the portal. These override whatever the note carried on the old site.'
      : (p.wix || []).length
        ? `This note still shows the ${(p.wix || []).length} photograph${(p.wix || []).length === 1 ? '' : 's'} it had on the old site. Attaching one here replaces them.`
        : 'Nothing attached, and the note carried none. It runs as a text card.'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${links.map(f => `<img src="${f}" style="width:74px;height:56px;object-fit:cover;border-radius:5px;border:1px solid var(--line)">`).join('')
        || '<p class="muted" style="font-size:13px;margin:0">None attached here.</p>'}
    </div>
    <button class="btn btn-ghost btn-sm" id="notepics" style="margin-top:12px" ${isNew ? 'disabled' : ''}>Add photos</button>
    ${isNew ? '<div class="hint" style="margin-top:8px">Publish the note first, then you can attach photographs to it.</div>' : ''}
  </div>

  ${seed ? `<div class="panel" style="max-width:760px;margin-top:18px">
    <span class="label">As transcribed</span>
    <div class="hint" style="margin:6px 0 12px">What the old site said, kept for comparison. It is never overwritten.</div>
    <div class="prose orig"><b>${esc(seed.title)}</b>${(seed.body || []).map(t => `<p>${esc(t)}</p>`).join('')}</div>
  </div>` : ''}`;

  $('#notecancel').onclick = () => { editingPost = null; render(); };
  if ($('#notepics')) $('#notepics').onclick = () => { tab = 'media'; render(); setTimeout(() => openPicker(p.id, 'add', 'post'), 0); };
  if ($('#noterevert')) $('#noterevert').onclick = () => {
    if (!confirm('Put this note back exactly as it was transcribed?')) return;
    const all = store.readPostEdits(); delete all[p.id]; store.writePostEdits(all);
    paintDirty(); toast('Back to the original wording'); editingPost = null; render();
  };
  $('#notesave').onclick = () => {
    const fd = new FormData($('#nf'));
    const title = (fd.get('title') || '').trim();
    const body  = (fd.get('body') || '').split('\n').map(x => x.trim()).filter(Boolean);
    const tag   = (fd.get('tag') || '').trim();
    const hidden = fd.get('hidden') === 'on';
    if (!title) return toast('A title is required');
    if (isNew) {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44)
               + '-' + Math.random().toString(36).slice(2, 6);
      // notes read newest first, so a new one goes in front of the front one
      const first = POSTS()[0];
      patchPost(id, { title, body, tag, hidden, order: ((first && first.order) ?? 0) - 1 });
      toast('Note published');
    } else {
      patchPost(p.id, { title, body, tag, hidden });
      toast('Note saved');
    }
    editingPost = null; render();
  };
}

/* ==========================================================================
   Sold. Everything on this page is worked out from the sale records on the
   listings themselves — a date and a figure, typed by whoever made the sale.
   Nothing is estimated and nothing is carried over from the old site, which
   never recorded a sale at all. A boat with no date is left out of the months
   rather than dropped into the current one; a boat with no figure is left out
   of the money rather than counted as zero. Both are reported as missing, so a
   thin-looking month is always either a thin month or a record to finish.
   ========================================================================== */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const median = ns => {
  if (!ns.length) return null;
  const a = [...ns].sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const monthKey = d => String(d).slice(0, 7);
/* Signed against the asking price, the way a discount reads: a boat that went
   for less than it was advertised at is a minus. An unsigned figure had to be
   read twice to know which way it went. */
const pct = f => f == null ? '—' : (f > 0 ? '+' : f < 0 ? '\u2212' : '') + Math.abs(f * 100).toFixed(1) + '%';
const monthName = k => MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(2, 4);

/* A run of months with no gaps, so an empty month reads as a month with no
   sales rather than disappearing and making the run look continuous. */
function monthRun(keys, span = 12) {
  // ending the run at the last sale would date the whole chart: a yard that has
  // sold nothing since spring should see the empty months, not a chart that
  // stops in spring and reads as if it were current.
  const last = [monthKey(today()), ...keys].sort().slice(-1)[0];
  const out = [];
  let [y, m] = last.split('-').map(Number);
  for (let i = 0; i < span; i++) { out.unshift(`${y}-${String(m).padStart(2, '0')}`); if (--m === 0) { m = 12; y--; } }
  return out;
}

/* One column per month. A single series, so a single hue and no legend — the
   heading says what is plotted. 24px is the cap, not the slot: the leftover is
   air. Values sit on the caps that have one; the empty months are the axis. */
function monthChart(months, counts, values) {
  const SLOT = 52, CAP = 24, PLOT = 132, PAD = 22, BASE = PLOT - 1;
  const W = Math.max(months.length * SLOT, 1), H = PLOT + 26;
  const top = Math.max(...counts, 1);
  const bar = (x, y, w, h, r) => {
    const rr = Math.min(r, w / 2, h);
    return `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z`;
  };
  const cols = months.map((k, i) => {
    const n = counts[i], x = i * SLOT + (SLOT - CAP) / 2;
    const h = n ? Math.max(3, Math.round((n / top) * (PLOT - PAD))) : 0;
    const y = BASE - h;
    const title = `${monthName(k)} — ${n} sold${values[i] ? ', ' + money(values[i]) : ''}`;
    return `<g class="col"><title>${title}</title>
      ${n ? `<path class="col-bar" d="${bar(x, y, CAP, h, 4)}"/>
             <text class="col-cap" x="${x + CAP / 2}" y="${y - 6}">${n}</text>` : ''}
      <rect class="col-hit" x="${i * SLOT}" y="0" width="${SLOT}" height="${BASE}"/>
      <text class="col-tick" x="${i * SLOT + SLOT / 2}" y="${PLOT + 15}">${monthName(k)}</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMax meet" role="img"
      aria-label="Boats sold per month: ${months.map((k, i) => `${monthName(k)} ${counts[i]}`).join(', ')}">
    <line class="chart-base" x1="0" y1="${BASE}" x2="${W}" y2="${BASE}"/>${cols}</svg>`;
}

const BANDS = [
  ['Under 14 ft', l => l != null && l < 14],
  ['14 to 16 ft', l => l != null && l >= 14 && l < 17],
  ['17 to 18 ft', l => l != null && l >= 17 && l < 19],
  ['19 ft and up', l => l != null && l >= 19],
  ['Length not stated', l => l == null],
];

function renderSold() {
  const sold   = rows.filter(r => r.status === 'sold');
  const dated  = sold.filter(r => r.soldOn);
  const priced = sold.filter(r => r.soldPrice != null);
  const live   = rows.filter(r => r.status !== 'sold');
  const took   = sold.filter(r => r.listedOn && r.soldOn).map(r => days(r.listedOn, r.soldOn)).filter(n => n >= 0);
  const cut    = priced.filter(r => r.price).map(r => (r.soldPrice - r.price) / r.price);
  const gross  = priced.reduce((s, r) => s + r.soldPrice, 0);
  const midCut = median(cut);
  const midDays = median(took);

  const months = monthRun(dated.map(r => monthKey(r.soldOn)));
  const counts = months.map(k => dated.filter(r => monthKey(r.soldOn) === k).length);
  const values = months.map(k => dated.filter(r => monthKey(r.soldOn) === k)
                                      .reduce((s, r) => s + (r.soldPrice || 0), 0));
  const inRun  = counts.reduce((a, b) => a + b, 0);
  const bands  = BANDS.map(([label, test]) => {
    const hit = sold.filter(r => test(r.length));
    return { label, n: hit.length, mid: median(hit.filter(r => r.soldPrice != null).map(r => r.soldPrice)) };
  }).filter(b => b.n);
  const widest = Math.max(...bands.map(b => b.n), 1);

  const missing = [
    sold.length - dated.length  ? `${sold.length - dated.length} with no date` : '',
    sold.length - priced.length ? `${sold.length - priced.length} with no figure` : '',
  ].filter(Boolean).join(' · ');

  $('#amain').innerHTML = `
  <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px">
    <h1 class="h1" style="flex:1">Sold</h1>
    ${sold.length ? `<button class="btn btn-ghost btn-sm" id="soldcsv">Export as CSV</button>` : ''}
  </div>
  <p class="muted" style="margin:0 0 22px;max-width:74ch">Every figure here comes from the sale records below,
  and nothing else. Mark a boat sold on the Inventory page and it appears here for its date and price to be filled in.</p>

  ${!sold.length ? `
    <div class="panel" style="max-width:74ch">
      <span class="label">Nothing sold yet</span>
      <p class="prose" style="margin-top:12px">No listing is marked sold, so there is nothing to work out —
      and a trend drawn from no sales would be a drawing, not a trend.</p>
      <p class="prose">Tick the boats that have gone on the <b>Inventory</b> page and choose
      <b>Mark as sold</b>. Each one lands here with today's date on it; correct the date and add
      what it fetched, and the months, the time on the market and the movement against the asking
      price all follow from that.</p>
      <p class="prose" style="color:var(--ink-3)">${live.length} live listings are waiting.</p>
    </div>` : `

  <div class="kpis">
    <div class="kpi"><span class="label">Boats sold</span><b class="num">${sold.length}</b>
      <div class="delta">${missing || 'every record complete'}</div></div>
    <div class="kpi"><span class="label">Delivered</span><b class="num">${money(gross)}</b>
      <div class="delta">across ${priced.length} with a figure</div></div>
    <div class="kpi"><span class="label">Median sale</span><b class="num">${priced.length ? money(median(priced.map(r => r.soldPrice))) : '—'}</b>
      <div class="delta">${priced.length ? 'half went for more' : 'no figures yet'}</div></div>
    <div class="kpi"><span class="label">Days on the market</span><b class="num">${midDays == null ? '—' : Math.round(midDays)}</b>
      <div class="delta">${took.length ? `median of ${took.length} with both dates` : 'needs a listed date'}</div></div>
    <div class="kpi"><span class="label">Against the ask</span><b class="num">${pct(midCut)}</b>
      <div class="delta">${cut.length ? `median of ${cut.length} sales` : 'needs a sold figure'}</div></div>
  </div>

  <section class="panel" style="margin-bottom:18px">
    <div class="band-h" style="align-items:baseline">
      <div><span class="label">Last twelve months</span>
        <h2 class="h1" style="margin-top:6px;font-size:20px">Boats sold per month</h2></div>
      <span class="muted" style="font-size:12.5px">${inRun} of ${sold.length} sales fall in this run</span>
    </div>
    ${dated.length
      ? `<div class="chart-wrap">${monthChart(months, counts, values)}</div>`
      : `<p class="muted" style="margin:16px 0 0">No sale carries a date yet, so there is nothing to plot.
         Add one below and the months fill in.</p>`}
  </section>

  ${bands.length ? `<section class="panel" style="margin-bottom:18px">
    <span class="label">What is selling</span>
    <h2 class="h1" style="margin:6px 0 16px;font-size:20px">By length</h2>
    <div class="bandbars">
      ${bands.map(b => `<div class="bandrow">
        <span class="bandrow-l">${b.label}</span>
        <span class="bandrow-t"><i style="width:${Math.max(2, (b.n / widest) * 100)}%"></i></span>
        <span class="bandrow-n num">${b.n}</span>
        <span class="bandrow-v num">${b.mid == null ? '—' : money(b.mid)}</span>
      </div>`).join('')}
    </div>
    <div class="hint" style="margin-top:12px">Count, then the median sale price of the ones with a figure.</div>
  </section>` : ''}

  <section class="panel">
    <div class="band-h" style="align-items:baseline">
      <div><span class="label">The records</span>
        <h2 class="h1" style="margin-top:6px;font-size:20px">Every boat sold</h2></div>
      <span class="muted" style="font-size:12.5px">Type straight into the table</span>
    </div>
    <div style="overflow-x:auto;margin-top:14px">
    <table class="tbl soldtbl">
      <thead><tr>
        <th>Listing</th><th>First listed</th><th>Sold on</th>
        <th class="num">Asked</th><th class="num">Sold for</th><th class="num">Days</th><th class="num">vs ask</th>
      </tr></thead>
      <tbody id="soldbody"></tbody>
    </table></div>
  </section>`}`;

  if (!sold.length) return;

  const drawRows = () => {
    $('#soldbody').innerHTML = rows.filter(r => r.status === 'sold')
      .sort((a, b) => String(b.soldOn || '').localeCompare(String(a.soldOn || '')))
      .map(r => {
        const d = r.listedOn && r.soldOn ? days(r.listedOn, r.soldOn) : null;
        const c = r.price && r.soldPrice != null ? (r.soldPrice - r.price) / r.price : null;
        return `<tr data-sid="${r.id}">
          <td><div class="row-ttl">${esc(r.title)}</div>
            <div class="row-sub">${[r.year, r.length != null ? r.length + "'" : null].filter(Boolean).join(' · ') || '—'}</div></td>
          <td><input class="inp inp-sm" type="date" data-f="listedOn" value="${r.listedOn || ''}"></td>
          <td><input class="inp inp-sm" type="date" data-f="soldOn" value="${r.soldOn || ''}"></td>
          <td class="num">${money(r.price)}</td>
          <td><input class="inp inp-sm num" type="number" min="0" step="100" data-f="soldPrice"
                     placeholder="—" value="${r.soldPrice ?? ''}"></td>
          <td class="num">${d == null ? '—' : d}</td>
          <td class="num ${c != null && c < 0 ? 'off-ask' : ''}">${pct(c)}</td>
        </tr>`;
      }).join('');

    $$('#soldbody input').forEach(i => i.onchange = () => {
      const r = rows.find(x => x.id === i.closest('tr').dataset.sid);
      const v = i.value.trim();
      r[i.dataset.f] = v === '' ? null : (i.dataset.f === 'soldPrice' ? +v : v);
      save(); renderSold();
    });
  };
  drawRows();

  $('#soldcsv').onclick = () => {
    const head = ['id','title','year','length','listedOn','soldOn','asked','soldFor'];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...sold.map(r => [r.id, r.title, r.year, r.length,
      r.listedOn, r.soldOn, r.price, r.soldPrice].map(cell).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'ycm-sold.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast(`Exported ${sold.length} sale${sold.length === 1 ? '' : 's'}`);
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
  ({ list: renderList, new: renderForm, notes: renderNotes, media: renderMedia,
     sold: renderSold, ship: renderShip })[tab]();
  scrollTo(0, 0);
}
(async () => {
  canWrite = await CFG.writable();
  const cfg = await CFG.load();
  if (cfg) {
    const applied = CFG.apply(SEED, cfg, POSTS());
    savedRows = applied.rows; savedAside = applied.aside; savedPostLinks = applied.postLinks || {};
    savedPostEdits = applied.postEdits || {};
    if (!localStorage.getItem(PKEY)) store.writePostLinks(savedPostLinks);
    if (!localStorage.getItem(EKEY)) store.writePostEdits(savedPostEdits);
    // no local draft yet -> run on exactly what is saved
    if (!localStorage.getItem(KEY)) { rows = structuredClone(savedRows); store.writeAside(savedAside); }
  }
  render();
})();
})();
