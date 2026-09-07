/* ==========================================================================
   Persistence adapter.

   One seam for "where does saved state live". Today it is a JSON file on disk
   written through the dev server, with localStorage holding the unsaved draft.
   Tomorrow it is a database: replace load() and save() and nothing above this
   file changes. The on-disk shape is already row-shaped for exactly that —
   `links` is a join table, `listings` is a table, and both are keyed by id.

   Shape of assets/data/ads-config.json:

     {
       "version": 1,
       "savedAt": "2026-09-05T15:12:00.000Z",
       "links":    { "<listing-id>": ["assets/img/inv/live_004.jpg", ...] },
       "setAside": ["assets/img/boats/src_012dfbd305.jpg", ...],
       "listings": [ { id, year, make, model, price, ... } ]
     }

   `links` is authoritative for photographs and is meant to be read and edited
   by a human. Listing records carry their video slots but no photographs, so
   there is exactly one place a photo-to-boat claim is recorded.
   ========================================================================== */
(() => {
'use strict';
const FILE = 'assets/data/ads-config.json';
const API  = 'api/ads-config';
const clone = o => JSON.parse(JSON.stringify(o));
const isPhoto = m => typeof m === 'string';

const Config = {
  file: FILE,

  /* ---- read ----------------------------------------------------------
     Never fails silently. Swallowing the reason here once cost an afternoon of
     "why does it still say unsaved draft" — the answer is now in the console
     and on `YCM_CONFIG.lastError`. */
  lastError: null,
  async load() {
    this.lastError = null;
    if (typeof fetch !== 'function') { this.lastError = 'no fetch in this environment'; return null; }
    const url = new URL(FILE + '?t=' + Date.now(), location.href).href;
    let r;
    try {
      r = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      this.lastError = `could not reach ${url} — ${e.message}`;
      console.warn('[YCM] config:', this.lastError);
      return null;
    }
    if (!r.ok) {
      this.lastError = `${url} returned ${r.status}`;
      console.info('[YCM] config:', this.lastError, r.status === 404 ? '(nothing saved yet)' : '');
      return null;
    }
    let j;
    try { j = await r.json(); }
    catch (e) { this.lastError = `${url} is not valid JSON — ${e.message}`; console.warn('[YCM] config:', this.lastError); return null; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      this.lastError = `${url} is ${Array.isArray(j) ? 'an array' : typeof j}, expected an object`;
      console.warn('[YCM] config:', this.lastError);
      return null;
    }
    const n = Object.values(j.links || {}).reduce((t, a) => t + (a || []).length, 0);
    console.info(`[YCM] config: loaded ${url} — ${Object.keys(j.links || {}).length} ads, ${n} photos`);
    return j;
  },

  /* Is there somewhere to write to? */
  async writable() {
    if (typeof fetch !== 'function') return false;
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      if (!r.ok) return false;
      return !!(await r.json()).writable;
    } catch (_) { return false; }
  },

  /* ---- shape ---------------------------------------------------------- */
  /* seed + config -> the state the app runs on */
  apply(seed, cfg) {
    const rows = (cfg && Array.isArray(cfg.listings) && cfg.listings.length)
      ? clone(cfg.listings) : clone(seed);
    if (cfg && cfg.links) {
      rows.forEach(r => {
        const files = cfg.links[r.id];
        if (!Array.isArray(files)) return;
        const videos = (r.media || []).filter(m => m && !isPhoto(m));
        r.media = [...videos, ...files];
      });
    }
    return { rows, aside: new Set((cfg && cfg.setAside) || []) };
  },

  /* the state the app runs on -> the file */
  build(rows, aside) {
    const links = {};
    rows.forEach(r => {
      const photos = (r.media || []).filter(isPhoto);
      if (photos.length) links[r.id] = photos;
    });
    const titles = {};
    Object.keys(links).forEach(id => {
      const r = rows.find(x => x.id === id);
      if (r && r.title) titles[id] = r.title;
    });
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      links,
      titles,                       // lets a later rename be reconciled by headline
      setAside: [...aside].sort(),
      // photographs live in `links` only, so they are recorded in one place
      listings: rows.map(r => ({ ...r, media: (r.media || []).filter(m => !isPhoto(m)) })),
    };
  },

  /* ---- reconciliation --------------------------------------------------
     Ad ids are not stable forever — regenerating the listings from the source
     page renamed most of them once, and silently orphaned every photo link
     that pointed at the old name. This maps stale links back onto real ads so
     that never costs anyone their work again.

     Two passes, both exact: the id itself, then a known rename, then an
     identical headline. There is deliberately no fuzzy matching — a scored
     title match confidently mapped "1961 Boston Whaler 13 Sport" onto the
     Danbury Mint 1/24 scale model of one, which is the precise failure this
     project has already paid for twice. Anything it cannot place exactly is
     reported as an orphan for a person to decide. --------------------- */
  ALIASES: {
    'bw-montauk-17-1998':'featured-montauk-17', 'bw-montauk-1976-project':'montauk-1976-project',
    'bw-11-standard-1978':'standard-11-1978',   'bw-170-montauk-2005':'montauk-170-2005',
    'bw-130-sport-2008':'sport-130-2008',       'bw-160ss-2019':'supersport-160-2019',
    'bw-15-sport-1984':'sport-15-1984',         'bw-150ss-2015':'supersport-150-2015',
    'bw-impact-2001':'impact-2001',             'bw-160ss-2022':'supersport-160-2022',
    'bw-23-outrage-g2':'outrage-23-g2',         'atlas-acadia-21-2003':'acadia-21-traveler',
    'bw-170-montauk-2003':'montauk-170-2003',   'nucamp-tab-320s-2018':'nucamp-tab-2018',
    'bw-17-supersport-1984':'supersport-17-1984','bw-outrage-17-1991':'outrage-17-1991',
    'bw-revenge-25-1985':'revenge-25-1985',     'bw-outrage-19ii-1993':'outrage-19ii-1993',
    'arima-sea-ranger-17-2000':'arima-sea-ranger-17', 'bw-23-outrage-suzuki':'outrage-23-suzuki',
    'grady-180-sportsman-2000':'grady-180-2000','bw-15-sport-1975-hull25':'sport-15-1975-hull25',
    'bw-outrage-18-1985':'outrage-18-1985',     'bw-outrage-18-1987-project':'outrage-18-1987-project',
    'bw-15-sport-1985-project':'sport-15-1985-project', 'bw-newport-1975-project':'newport-1975-project',
    'bw-rigid-raider-1989':'rigid-raider-1989-project', 'bw-ventura-16-1999':'ventura-16-1999-project',
  },

  /* Photos whose ad vanished entirely (the three sold boats that came off the
     home page, say) have nowhere to go; they are returned as orphans rather
     than dropped silently. */
  reconcile(links, titles, seedRows) {
    const byId = new Map(seedRows.map(r => [r.id, r]));
    const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const out = {}, moved = [], orphans = [];
    for (const [oldId, files] of Object.entries(links || {})) {
      if (!Array.isArray(files) || !files.length) continue;
      let id = null;
      if (byId.has(oldId)) id = oldId;
      else if (this.ALIASES[oldId] && byId.has(this.ALIASES[oldId])) id = this.ALIASES[oldId];
      else {
        // last resort: an ad whose headline is character-for-character the same
        const want = norm((titles || {})[oldId]);
        if (want) {
          const hit = seedRows.find(r => norm(r.title) === want);
          if (hit) id = hit.id;
        }
      }
      if (!id) { orphans.push({ from: oldId, files }); continue; }
      out[id] = [...(out[id] || []), ...files];
      if (id !== oldId) moved.push({ from: oldId, to: id, n: files.length });
    }
    return { links: out, moved, orphans };
  },

  /* ---- write ---------------------------------------------------------- */
  async save(payload) {
    const r = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `Save failed (${r.status})`);
    return body;
  },

  /* Fallback when nothing can be written to: hand the file to the browser. */
  download(payload, name = 'ads-config.json') {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  },

  /* Two states equal? Used to decide whether there is anything to save.

     Compared canonically. A record that came back from the JSON file and the
     same record held in localStorage carry identical content but can serialise
     their keys in a different order, and a raw JSON.stringify comparison then
     reports "unsaved changes" forever with nothing to actually save. */
  same(a, b) {
    const stable = v => {
      if (Array.isArray(v)) return v.map(stable);
      if (v && typeof v === 'object') {
        return Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o; }, {});
      }
      return v;
    };
    const norm = c => JSON.stringify(stable({ links: c.links, setAside: c.setAside, listings: c.listings }));
    return norm(a) === norm(b);
  },
};

window.YCM_CONFIG = Config;
})();
