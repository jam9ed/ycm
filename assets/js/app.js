/* ==========================================================================
   Public inventory portal.
   Filter state lives in the URL, so every view is a link Dave can text to a
   buyer: "everything under 15k, 17 foot and down" is a URL.
   ========================================================================== */
(() => {
'use strict';
const { STATUS } = window.YCM;

/* Where the inventory comes from, in order of authority:
     1. assets/data/ads-config.json — what the staff portal saved to disk
     2. the staff portal's unsaved localStorage draft, on this browser only
     3. the seed in data.js
   Set at boot; see the async init at the bottom of this file. */
let boats = window.YCM.boats, source = 'seed', loadError = null;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- domain helpers ---------------------------------------------- */
const YEAR_NOW = new Date().getFullYear();
const money = n => n == null ? null : '$' + n.toLocaleString('en-US');
const feet  = n => n == null ? null : (Number.isInteger(n) ? n + "'" : Math.floor(n) + "' " + Math.round((n % 1) * 12) + '"');
const age   = b => YEAR_NOW - b.year;
const hasVideo = b => (b.media || []).some(m => m && m.label);
/* The image that represents a listing: its first photograph, or failing that
   the poster frame of its first video. */
const photo = b => (b.media || []).find(m => typeof m === 'string')
  || ((b.media || []).find(m => m && m.poster) || {}).poster || null;
const isDrop = b => b.wasPrice && b.price && b.wasPrice > b.price;
/* Eight of the listings are outboards, collectibles or Dave's camper. Calling
   all thirty-six "boats" was just wrong, so counts distinguish them. */
const isBoat = b => !b.kind;

/* Filter facets. `test` decides membership; counts are computed live so the
   rail never offers a filter that returns nothing. */
const LENGTH_BANDS = [
  { id:'u14',   label:"Under 14'",   test:b => b.length != null && b.length < 14 },
  { id:'14-16', label:"14' – 16'",   test:b => b.length >= 14 && b.length < 17 },
  { id:'17-19', label:"17' – 19'",   test:b => b.length >= 17 && b.length < 20 },
  { id:'20-23', label:"20' – 23'",   test:b => b.length >= 20 && b.length < 24 },
  { id:'24up',  label:"24' and up",  test:b => b.length >= 24 },
];
const PRICE_BANDS = [
  { id:'u5',    label:'Under $5,000',       test:b => b.price != null && b.price < 5000 },
  { id:'5-10',  label:'$5,000 – $10,000',   test:b => b.price >= 5000 && b.price < 10000 },
  { id:'10-20', label:'$10,000 – $20,000',  test:b => b.price >= 10000 && b.price < 20000 },
  { id:'20-30', label:'$20,000 – $30,000',  test:b => b.price >= 20000 && b.price < 30000 },
  { id:'30up',  label:'$30,000 and up',     test:b => b.price >= 30000 },
  { id:'call',  label:'Call for price',     test:b => b.price == null },
];
const AGE_BANDS = [
  { id:'a0',   label:'2015 and newer', sub:'Late model', test:b => b.year >= 2015 },
  { id:'a1',   label:'2000 – 2014',    sub:'Modern',     test:b => b.year >= 2000 && b.year < 2015 },
  { id:'a2',   label:'1990 – 1999',    sub:'',           test:b => b.year >= 1990 && b.year < 2000 },
  { id:'a3',   label:'1980 – 1989',    sub:'Classic',    test:b => b.year >= 1980 && b.year < 1990 },
  { id:'a4',   label:'1979 and older', sub:'Vintage',    test:b => b.year != null && b.year < 1980 },
];
const HOURS_BANDS = [
  { id:'h100', label:'Under 100 hours', test:b => b.hours != null && b.hours < 100 },
  { id:'h250', label:'Under 250 hours', test:b => b.hours != null && b.hours < 250 },
];

const years = boats.map(b => b.year).filter(Boolean);
const PRICE_MIN = 0, PRICE_MAX = 50000, LEN_MIN = 7, LEN_MAX = 26,
      YEAR_MIN = Math.min(...years), YEAR_MAX = Math.max(...years);

/* One-tap starting points. These are the questions people actually call and
   ask, turned into buttons. */
const PRESETS = [
  { id:'ready',   label:'Available now',       apply:{ status:['available'] } },
  { id:'lowhrs',  label:'Under 100 hours',     apply:{ hoursBands:['h100'] } },
  { id:'u15k',    label:'Under $15k',          apply:{ priceMax:15000 } },
  { id:'small',   label:"17' and under",       apply:{ lenMax:17 } },
  { id:'classic', label:'Classics (pre-1990)', apply:{ yearMax:1989 } },
  { id:'arriving',label:'Just arriving',       apply:{ status:['arriving'] } },
  { id:'drops',   label:'Price drops',         apply:{ drops:true } },
  { id:'project', label:'Project boats',       apply:{ status:['project'] } },
];

/* ---------- state ------------------------------------------------------- */
const blank = () => ({
  q:'', status:['available','arriving','project'], lenBands:[], priceBands:[],
  ageBands:[], hoursBands:[], video:false, drops:false,
  priceMin:PRICE_MIN, priceMax:PRICE_MAX, lenMin:LEN_MIN, lenMax:LEN_MAX,
  yearMin:YEAR_MIN, yearMax:YEAR_MAX, sort:'page', view:'grid',
});
let S = blank();

/* ---------- url sync ---------------------------------------------------- */
const ARRAYS = ['status','lenBands','priceBands','ageBands','hoursBands'];
const BOOLS  = ['video','drops'];
const NUMS   = ['priceMin','priceMax','lenMin','lenMax','yearMin','yearMax'];

function toURL(push) {
  const p = new URLSearchParams(), d = blank();
  if (S.q) p.set('q', S.q);
  ARRAYS.forEach(k => { if (S[k].join() !== d[k].join()) p.set(k, S[k].join(',')); });
  BOOLS.forEach(k => { if (S[k]) p.set(k, '1'); });
  NUMS.forEach(k => { if (S[k] !== d[k]) p.set(k, S[k]); });
  if (S.sort !== d.sort) p.set('sort', S.sort);
  if (S.view !== d.view) p.set('view', S.view);
  const url = location.pathname + (p.toString() ? '?' + p : '') + location.hash;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}
function fromURL() {
  const p = new URLSearchParams(location.search);
  S = blank();
  if (p.has('q')) S.q = p.get('q');
  ARRAYS.forEach(k => { if (p.has(k)) S[k] = p.get(k) ? p.get(k).split(',') : []; });
  BOOLS.forEach(k => { if (p.get(k) === '1') S[k] = true; });
  NUMS.forEach(k => { if (p.has(k)) S[k] = +p.get(k); });
  if (p.has('sort')) S.sort = p.get('sort');
  if (p.has('view')) S.view = p.get('view');
}

/* ---------- filtering --------------------------------------------------- */
const bandsPass = (bands, ids, b) => !ids.length || ids.some(id => (bands.find(x => x.id === id) || {}).test?.(b));

function matches(b, s = S, skip = null) {
  if (s.q) {
    const hay = [b.title, ...(b.body || [])].join(' ').toLowerCase();
    if (!s.q.toLowerCase().split(/\s+/).every(t => hay.includes(t))) return false;
  }
  if (skip !== 'status' && s.status.length && !s.status.includes(b.status)) return false;
  if (skip !== 'lenBands'   && !bandsPass(LENGTH_BANDS, s.lenBands, b)) return false;
  if (skip !== 'priceBands' && !bandsPass(PRICE_BANDS, s.priceBands, b)) return false;
  if (skip !== 'ageBands'   && !bandsPass(AGE_BANDS, s.ageBands, b)) return false;
  if (skip !== 'hoursBands' && !bandsPass(HOURS_BANDS, s.hoursBands, b)) return false;
  if (s.video && !hasVideo(b)) return false;
  if (s.drops      && !isDrop(b)) return false;
  // Ranges: a "call for price" boat is never excluded by a price range unless
  // the range has actually been narrowed — otherwise they'd vanish silently.
  const pNarrow = s.priceMin > PRICE_MIN || s.priceMax < PRICE_MAX;
  if (pNarrow && (b.price == null || b.price < s.priceMin || b.price > s.priceMax)) return false;
  const lNarrow = s.lenMin > LEN_MIN || s.lenMax < LEN_MAX;
  if (lNarrow && (b.length == null || b.length < s.lenMin || b.length > s.lenMax)) return false;
  const yNarrow = s.yearMin > YEAR_MIN || s.yearMax < YEAR_MAX;
  if (yNarrow && (b.year == null || b.year < s.yearMin || b.year > s.yearMax)) return false;
  return true;
}

const SORTS = {
  page:    (a, b) => a.order - b.order,          // the order Dave put them in
  priceUp: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  priceDn: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
  yearDn:  (a, b) => (b.year ?? -1) - (a.year ?? -1),
  yearUp:  (a, b) => (a.year ?? 9999) - (b.year ?? 9999),
  lenDn:   (a, b) => (b.length ?? -1) - (a.length ?? -1),
  lenUp:   (a, b) => (a.length ?? Infinity) - (b.length ?? Infinity),
  hours:   (a, b) => (a.hours ?? Infinity) - (b.hours ?? Infinity),
};
const results = () => {
  const r = boats.filter(b => matches(b));
  r.sort(SORTS[S.sort] || SORTS.page);
  return r;
};
/* Count for a facet option = how many results there'd be if you ticked it,
   holding every other filter. Stops the rail offering dead ends. */
const countFor = (key, test) => boats.filter(b => matches(b, S, key) && test(b)).length;

/* ---------- icons ------------------------------------------------------- */
const I = {
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z"/></svg>',
  chev:'<svg class="chev" width="12" height="8" viewBox="0 0 12 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1.5 6 6.5 11 1.5"/></svg>',
  x:'<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5"/></svg>',
  search:'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m12.8 12.8 4 4"/></svg>',
  grid:'<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.2"/><rect x="9" y="1" width="6" height="6" rx="1.2"/><rect x="1" y="9" width="6" height="6" rx="1.2"/><rect x="9" y="9" width="6" height="6" rx="1.2"/></svg>',
  rows:'<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="3" rx="1.2"/><rect x="1" y="6.5" width="14" height="3" rx="1.2"/><rect x="1" y="11" width="14" height="3" rx="1.2"/></svg>',
  boat:'<svg viewBox="0 0 48 26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="miter"><path d="M4 9 H44"/><path d="M4.8 9.4 L8.9 18.1 Q15.2 12.9 24 21.4 Q32.8 12.9 39.1 18.1 L43.2 9.4"/></svg>',
};
const PH = (sub = 'Photos and walkaround video on request') => `
  <div class="ph">${I.boat}<b>Awaiting photography</b><span>${esc(sub)}</span></div>`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/* ---------- render: rail ------------------------------------------------ */
function group(title, id, bodyHTML, open = true) {
  return `<details class="fgroup" id="fg-${id}" ${open ? 'open' : ''}>
    <summary><span class="label">${title}</span>${I.chev}</summary>
    <div class="fgroup-body">${bodyHTML}</div></details>`;
}
function checks(key, opts) {
  return opts.map(o => {
    const n = countFor(key, o.test);
    const on = S[key].includes(o.id);
    if (!n && !on) return '';
    return `<label class="chk"><input type="checkbox" data-facet="${key}" value="${o.id}" ${on ? 'checked' : ''}>
      <span>${esc(o.label)}${o.sub ? ` <span style="color:var(--ink-3);font-size:12px">· ${esc(o.sub)}</span>` : ''}</span>
      <span class="cnt">${n}</span></label>`;
  }).join('');
}
function dualRange(key, min, max, lo, hi, fmt) {
  const pc = v => ((v - min) / (max - min)) * 100;
  return `<div class="range" data-range="${key}">
    <div class="range-out"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div>
    <div class="range-track">
      <div class="rail-bg"></div>
      <div class="rail-fill" style="left:${pc(lo)}%;right:${100 - pc(hi)}%"></div>
      <input type="range" min="${min}" max="${max}" value="${lo}" data-side="lo" aria-label="Minimum">
      <input type="range" min="${min}" max="${max}" value="${hi}" data-side="hi" aria-label="Maximum">
    </div></div>`;
}
function renderRail() {
  $('#rail').innerHTML =
    group('Status', 'status', checks('status', Object.entries(STATUS).map(([id, v]) => ({ id, label: v.label, test: b => b.status === id })))) +
    group('Length', 'len',
      checks('lenBands', LENGTH_BANDS) +
      `<div style="margin-top:6px">${dualRange('len', LEN_MIN, LEN_MAX, S.lenMin, S.lenMax, v => v + "'")}</div>`) +
    group('Price', 'price',
      checks('priceBands', PRICE_BANDS) +
      `<div style="margin-top:6px">${dualRange('price', PRICE_MIN, PRICE_MAX, S.priceMin, S.priceMax,
        v => v >= 50000 ? '$50k+' : '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k')}</div>`) +
    group('Age', 'age',
      checks('ageBands', AGE_BANDS) +
      `<div style="margin-top:6px">${dualRange('year', YEAR_MIN, YEAR_MAX, S.yearMin, S.yearMax, v => v)}</div>`) +
    group('Engine hours', 'hours', checks('hoursBands', HOURS_BANDS), false) +
    group('Listing', 'feat', ['video','drops'].map(k => {
      const meta = { video:'Has walkaround video', drops:'Price reduced' }[k];
      const test = { video:hasVideo, drops:isDrop }[k];
      const probe = { ...S, [k]:false };
      const n = boats.filter(b => matches(b, probe) && test(b)).length;
      if (!n && !S[k]) return '';
      return `<label class="chk"><input type="checkbox" data-bool="${k}" ${S[k] ? 'checked' : ''}><span>${meta}</span><span class="cnt">${n}</span></label>`;
    }).join(''));
}

/* ---------- render: cards ----------------------------------------------- */
function card(b) {
  const st = STATUS[b.status];
  const badges = [
    b.featured ? `<span class="badge badge-feat">Featured</span>` : '',
    `<span class="badge ${st.cls}">${st.label}</span>`,
    isDrop(b) ? `<span class="badge badge-drop">Reduced</span>` : '',
  ].join('');
  const specs = [
    b.year != null ? String(b.year) : null,
    b.length != null ? feet(b.length) : null,
    b.hours != null ? b.hours + ' hrs' : null,
  ].filter(Boolean).map(s => `<i>${esc(s)}</i>`).join('');
  const price = b.price != null
    ? `<b class="num">${money(b.price)}</b>${b.wasPrice ? `<s class="num">${money(b.wasPrice)}</s>` : ''}`
    : `<span class="tba">${esc(b.priceNote || 'Call for price')}</span>`;
  return `<article class="card" data-id="${b.id}" tabindex="0" role="link" aria-label="${esc(b.title)}">
    <div class="card-media">
      ${photo(b)
        ? `<img src="${photo(b)}" alt="${esc(b.title)}" loading="lazy" decoding="async">`
        : PH('Call (757) 329-9979')}
      <div class="card-badges">${badges}</div>
      ${hasVideo(b) ? `<div class="card-top-r"><span class="badge badge-video">${I.play}Video</span></div>` : ''}
    </div>
    <div class="card-body">
      <h3 class="card-ttl">${esc(b.title)}</h3>
      ${S.view === 'compact' ? '' : `<div class="card-spec">${specs}</div>`}
      ${S.view === 'list' && b.body.length ? `<p class="card-blurb">${esc(b.body[0])}</p>` : ''}
      <div class="card-price">${price}</div>
    </div></article>`;
}

function renderActive() {
  const chips = [];
  const chip = (txt, undo) => chips.push({ txt, undo });
  if (S.q) chip(`“${S.q}”`, () => S.q = '');
  const d = blank();
  if (S.status.join() !== d.status.join())
    chip('Status: ' + (S.status.length ? S.status.map(s => STATUS[s].label).join(', ') : 'any'), () => S.status = d.status);
  const named = { lenBands:LENGTH_BANDS, priceBands:PRICE_BANDS, ageBands:AGE_BANDS, hoursBands:HOURS_BANDS };
  for (const [k, bands] of Object.entries(named))
    S[k].forEach(id => chip(bands.find(x => x.id === id).label, () => S[k] = S[k].filter(x => x !== id)));
  [['video','Has video'],['drops','Price reduced']]
    .forEach(([k, l]) => { if (S[k]) chip(l, () => S[k] = false); });
  if (S.priceMin > PRICE_MIN || S.priceMax < PRICE_MAX)
    chip(`${money(S.priceMin)} – ${S.priceMax >= PRICE_MAX ? '$50k+' : money(S.priceMax)}`, () => { S.priceMin = PRICE_MIN; S.priceMax = PRICE_MAX; });
  if (S.lenMin > LEN_MIN || S.lenMax < LEN_MAX)
    chip(`${S.lenMin}' – ${S.lenMax}'`, () => { S.lenMin = LEN_MIN; S.lenMax = LEN_MAX; });
  if (S.yearMin > YEAR_MIN || S.yearMax < YEAR_MAX)
    chip(`${S.yearMin} – ${S.yearMax}`, () => { S.yearMin = YEAR_MIN; S.yearMax = YEAR_MAX; });

  const el = $('#active');
  el.innerHTML = chips.map((c, i) => `<span class="pill">${esc(c.txt)}<button data-chip="${i}" aria-label="Remove">${I.x}</button></span>`).join('')
    + (chips.length ? `<button class="link-btn" id="clear-all">Clear all</button>` : '');
  $$('[data-chip]', el).forEach(btn => btn.onclick = () => { chips[+btn.dataset.chip].undo(); commit(); });
  const ca = $('#clear-all'); if (ca) ca.onclick = () => { S = blank(); commit(); };
}

function renderPresets() {
  $('#presets').innerHTML = PRESETS.map(p => {
    const on = Object.entries(p.apply).every(([k, v]) =>
      Array.isArray(v) ? v.join() === S[k].join() : S[k] === v);
    return `<button class="preset" data-preset="${p.id}" aria-pressed="${on}">${esc(p.label)}</button>`;
  }).join('');
}

function renderResults() {
  const r = results();
  const grid = $('#grid');
  grid.className = 'grid' + (S.view === 'list' ? ' list' : S.view === 'compact' ? ' compact' : '');
  grid.innerHTML = r.length ? r.map(card).join('')
    : `<div class="empty" style="grid-column:1/-1">${I.boat}
        <p class="h2" style="margin-bottom:6px">Nothing matches that yet</p>
        <p class="muted" style="margin:0 0 18px">Many boats sell before they are posted. Widen the filters, or just call — we usually have more than is listed.</p>
        <a class="btn btn-primary" href="tel:+17573299979">Call (757) 329-9979</a></div>`;
  const avail = boats.filter(b => b.status !== 'sold').length;
  const nBoats = r.filter(isBoat).length, nOther = r.length - nBoats;
  $('#count').innerHTML = `<b>${r.length}</b> of ${avail} listings`
    + (nOther ? ` <span class="muted">(${nBoats} boat${nBoats === 1 ? '' : 's'}, ${nOther} motor${nOther === 1 ? '' : 's'} &amp; gear)</span>` : '')
    + (r.some(b => b.status === 'sold') ? '' : '')
    + ` <span class="muted">· inventory changes fast; many boats sell before they are posted</span>`;
  wireCards(grid);
}

/* Which of grid / compact / list is lit. This used to be set once at init, so
   clicking a view changed the layout but never moved the highlight. */
function paintViewSeg() {
  $$('#viewseg button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
}

function commit(push = true) { browseBuilt = true; paintViewSeg(); toURL(push); renderRail(); renderActive(); renderPresets(); renderResults(); }

/* ---------- detail ------------------------------------------------------ */
function openDetail(id) { location.hash = '#/boat/' + id; }

function renderDetail(b) {
  const st = STATUS[b.status];
  const spec = [
    ['Year', b.year], ['Length', b.length != null ? feet(b.length) : null],
    ['Engine hours', b.hours != null ? b.hours.toLocaleString() : null],
    ['Asking', b.price != null ? money(b.price) : 'Call'],
    ['Status', st.label],
  ].filter(([, v]) => v != null && v !== '');
  const media = b.media || [];

  $('#view-detail').innerHTML = `
  <div class="wrap detail">
    <nav class="crumb"><a href="#/">Inventory</a> <span>/</span> <span>${esc(b.title)}</span></nav>
    <div class="detail-grid">
      <div>
        <div class="gallery">
          <div class="gal-main" id="gal-main"></div>
          ${media.length > 1 ? `<div class="gal-thumbs">${media.map((m, i) => `
            <button class="thumb" data-i="${i}" aria-current="${i === 0}">
              ${(typeof m === 'string' ? m : (m.poster || photo(b)))
                ? `<img src="${typeof m === 'string' ? m : (m.poster || photo(b))}" alt="" loading="lazy" decoding="async">` : ''}
              ${m.label ? `<span class="tv">${I.play}</span>` : ''}
            </button>`).join('')}</div>` : ''}
        </div>

        ${b.body.length ? `<div class="section-h"><h2 class="h2">From the listing</h2></div>
        <div class="prose">${b.body.map(p => p.trim().startsWith('-')
            ? `<ul><li>${esc(p.replace(/^-\s*/, ''))}</li></ul>`
            : `<p>${esc(p)}</p>`).join('')}</div>` : ''}

        ${spec.length ? `<div class="section-h"><h2 class="h2">What the listing states</h2></div>
        <dl class="spec-list">${spec.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <p class="muted" style="font-size:12.5px;margin-top:12px">Only what the listing says is shown here.
        For anything else — hours, power, trailer, history — give Dave a call.</p>` : ''}
      </div>

      <aside>
        <div class="panel">
          <span class="badge ${st.cls}" style="backdrop-filter:none">${st.label}</span>
          <h1 class="h1" style="margin-top:12px;font-size:24px">${esc(b.title)}</h1>
          <div class="price-row">
            ${b.price != null
              ? `<b class="num">${money(b.price)}</b>${b.wasPrice ? `<s class="num">${money(b.wasPrice)}</s>` : ''}`
              : `<b style="font-size:22px">Call for price</b>`}
          </div>
          ${isDrop(b) ? `<div class="saving">Reduced ${money(b.wasPrice - b.price)}</div>` : ''}
          <div style="display:flex;flex-direction:column;gap:9px;margin-top:20px">
            <a class="btn btn-primary btn-block" href="tel:+17573299979">Call (757) 329-9979</a>
            <button class="btn btn-ghost btn-block" id="ft-btn">Schedule a FaceTime walkaround</button>
            <a class="btn btn-ghost btn-block" href="mailto:yorkcountymarine@gmail.com?subject=${encodeURIComponent(b.title)}">Email about this boat</a>
          </div>
          <p class="muted" style="font-size:12.5px;margin:14px 0 0;line-height:1.5">Available every day 10am – 7pm EST.
          Professionally delivered anywhere in the United States; international shipping possible.</p>
        </div>

        <div class="panel">
          <span class="label">Every YCM boat</span>
          <ul style="margin:12px 0 0;padding-left:18px;font-size:13.5px;line-height:1.65;color:var(--ink-2)">
            <li style="margin-bottom:6px">Checked over by a marine mechanic before delivery</li>
            <li style="margin-bottom:6px">Thoroughly sea trialled before delivery</li>
            <li>Professionally delivered — we do not ship freight</li></ul></div>
      </aside>
    </div>
  </div>`;

  const main = $('#gal-main');
  const show = i => {
    const m = media[i];
    if (!m) { main.innerHTML = PH('No photos linked yet. Call and Dave will walk you round it live on FaceTime.'); return; }
    const poster = m.poster || photo(b);
    main.innerHTML = m.label
      ? `<ycm-video ${poster ? `poster="${poster}"` : ''} ${m.src ? `src="${m.src}"` : ''} ${m.hls ? `hls="${m.hls}"` : ''}
           duration="${esc(m.duration || '')}" label="${esc(m.label)}" data-ratio="${m.ratio || '16:9'}"></ycm-video>`
      : `<img src="${m}" alt="${esc(b.title)}" decoding="async">`;
    $$('.thumb').forEach(t => t.setAttribute('aria-current', String(+t.dataset.i === i)));
  };
  show(0);
  $$('.thumb').forEach(t => t.onclick = () => show(+t.dataset.i));
  $('#ft-btn').onclick = () => toast('Dave will ring you back to set up the walkaround. Call (757) 329-9979 to book now.');
}

/* ---------- home ---------------------------------------------------------- */
const POSTS = window.YCM_POSTS || [];

function wireCards(root) {
  $$('.card', root).forEach(c => {
    const go = () => { location.hash = (c.dataset.post ? '#/blog/' : '#/boat/') + (c.dataset.post || c.dataset.id); };
    c.onclick = go;
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

function postCard(p) {
  return `<article class="card" data-post="${p.id}" tabindex="0" role="link" aria-label="${esc(p.title)}">
    <div class="card-media">
      ${p.images[0] ? `<img src="${p.images[0]}" alt="" loading="lazy" decoding="async">` : PH('')}
    </div>
    <div class="card-body">
      <h3 class="card-ttl">${esc(p.title)}</h3>
      ${p.body[0] ? `<p class="card-blurb">${esc(p.body[0])}</p>` : ''}
    </div></article>`;
}

function renderHome() {
  renderFeatured();
  const pick = [
    ...boats.filter(b => b.featured && b.status !== 'sold'),
    ...boats.filter(b => !b.featured && b.status !== 'sold' && photo(b)),
    ...boats.filter(b => !b.featured && b.status !== 'sold'),
  ];
  const seen = new Set(), lead = [];
  for (const b of pick) { if (!seen.has(b.id)) { seen.add(b.id); lead.push(b); } if (lead.length === 4) break; }
  const g = $('#home-featured');
  if (g) { g.innerHTML = lead.map(card).join(''); wireCards(g); }

  const live = boats.filter(b => b.status !== 'sold').length;
  const all = $('#see-all');
  if (all) all.textContent = `See all ${live} listings`;

  const pg = $('#home-posts');
  if (pg) { pg.innerHTML = POSTS.slice(0, 4).map(postCard).join(''); wireCards(pg); }
}

/* ---------- blog ---------------------------------------------------------- */
function renderBlog() {
  const el = $('#view-blog');
  el.innerHTML = `<div class="wrap band">
    <span class="label">Dave's blog</span>
    <h1 class="h1" style="margin:8px 0 6px">Write-ups, sea trials and digressions</h1>
    <p class="muted" style="margin:0 0 26px;max-width:64ch">${POSTS.length} posts lifted off the home page, where
    they had been stacked into one very long scroll. Boats arriving, boats leaving, and the occasional detour.</p>
    <div class="grid" id="blog-grid"></div></div>`;
  $('#blog-grid').innerHTML = POSTS.map(postCard).join('');
  wireCards($('#blog-grid'));
}

function renderPost(p) {
  const more = POSTS.filter(x => x.id !== p.id).slice(0, 3);
  $('#view-blog').innerHTML = `<div class="wrap detail">
    <nav class="crumb"><a href="#/blog">Blog</a> <span>/</span> <span>${esc(p.title)}</span></nav>
    <article style="max-width:720px;margin-inline:auto">
      <h1 class="h1" style="margin:0 0 20px">${esc(p.title)}</h1>
      ${p.images[0] ? `<img src="${p.images[0]}" alt="" style="width:100%;border-radius:var(--r-lg);margin-bottom:22px" decoding="async">` : ''}
      <div class="prose">${p.body.map(x => `<p>${esc(x)}</p>`).join('')}</div>
      ${p.images.slice(1).map(f => `<img src="${f}" alt="" loading="lazy" decoding="async"
          style="width:100%;border-radius:var(--r);margin-top:14px">`).join('')}
      <div style="display:flex;gap:10px;margin:30px 0 0">
        <a class="btn btn-primary" href="tel:+17573299979">Call (757) 329-9979</a>
        <a class="btn btn-ghost" href="#/inventory">See the inventory</a>
      </div>
    </article>
    <div class="section-h" style="margin-top:52px"><h2 class="h2">More from the blog</h2></div>
    <div class="grid" id="more-posts"></div></div>`;
  $('#more-posts').innerHTML = more.map(postCard).join('');
  wireCards($('#more-posts'));
}

/* ---------- routing ----------------------------------------------------- */
/* The inventory grid is built the first time it is asked for, not on page
   load — the home page has no use for 36 rendered cards. */
let browseBuilt = false;
function ensureBrowse() { if (!browseBuilt) { browseBuilt = true; commit(false); } }

const VIEWS = ['view-home', 'view-browse', 'view-blog', 'view-detail'];
function show(id) { VIEWS.forEach(v => { const el = $('#' + v); if (el) el.hidden = (v !== id); }); }

function route() {
  const h = location.hash || '#/';
  $$('.nav a').forEach(a => {
    const on = (a.getAttribute('href') === '#/inventory' && /^#\/(inventory|boat)/.test(h))
            || (a.getAttribute('href') === '#/blog' && /^#\/blog/.test(h))
            || (a.getAttribute('href') === '#/' && !/^#\/(inventory|boat|blog)/.test(h));
    on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  });

  /* One page serves four views, so the tab title has to follow the route. */
  const title = t => { document.title = t; };

  let m;
  if ((m = h.match(/^#\/boat\/(.+)$/))) {
    const b = boats.find(x => x.id === m[1]);
    if (b) { show('view-detail'); renderDetail(b); title(b.title); scrollTo(0, 0); return; }
  }
  if ((m = h.match(/^#\/blog\/(.+)$/))) {
    const p = POSTS.find(x => x.id === m[1]);
    if (p) { show('view-blog'); renderPost(p); title(p.title); scrollTo(0, 0); return; }
  }
  if (/^#\/blog/.test(h)) { show('view-blog'); renderBlog(); title('Blog'); scrollTo(0, 0); return; }
  if (/^#\/inventory/.test(h)) { show('view-browse'); ensureBrowse(); title('Inventory'); return; }
  show('view-home'); renderHome(); title('YCM Home');
}

/* ---------- the featured box -------------------------------------------
   Driven by whichever ad carries `featured`, so it cannot rot: the photo comes
   from whatever is linked to that ad, and if nothing is linked it degrades to
   the same placeholder the cards use rather than a broken image. (It used to
   be a hardcoded filename, which 404'd the moment the photos were renamed.) */
function renderFeatured() {
  const el = $('#featured');
  if (!el) return;
  const b = boats.find(x => x.featured && x.status !== 'sold')
         || boats.find(x => photo(x) && x.status !== 'sold')
         || boats[0];
  if (!b) { el.remove(); return; }

  const src = photo(b);
  const st = STATUS[b.status];
  el.href = '#/boat/' + b.id;
  el.setAttribute('aria-label', b.title);
  el.innerHTML = `
    ${src
      ? `<img src="${src}" alt="${esc(b.title)}" fetchpriority="high" decoding="async">`
      : PH('No photo linked to the featured ad yet')}
    <div class="hero-cap">
      <span class="badge ${st.cls}">${b.featured ? 'Featured' : st.label}</span>
      <strong>${esc(b.title)}</strong>
      <span class="hero-cap-meta">${[
        b.year, b.length != null ? feet(b.length) : null,
        b.price != null ? money(b.price) : 'Call for price',
      ].filter(Boolean).join(' · ')}</span>
    </div>`;
}

/* ---------- misc ui ----------------------------------------------------- */
let toastT;
function toast(msg) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3600);
}

function wireRail() {
  const rail = $('#rail');
  rail.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.facet) {
      const k = t.dataset.facet;
      S[k] = t.checked ? [...S[k], t.value] : S[k].filter(v => v !== t.value);
      commit();
    } else if (t.dataset.bool) { S[t.dataset.bool] = t.checked; commit(); }
  });
  // Dual ranges: live visual feedback on input, commit on release.
  rail.addEventListener('input', e => {
    const inp = e.target.closest('input[type=range]'); if (!inp) return;
    const box = inp.closest('[data-range]'), key = box.dataset.range;
    const [lo, hi] = $$('input[type=range]', box);
    if (+lo.value > +hi.value) (inp.dataset.side === 'lo' ? lo : hi).value = inp.dataset.side === 'lo' ? hi.value : lo.value;
    const min = +lo.min, max = +lo.max, pc = v => ((v - min) / (max - min)) * 100;
    $('.rail-fill', box).style.left = pc(+lo.value) + '%';
    $('.rail-fill', box).style.right = (100 - pc(+hi.value)) + '%';
    const fmt = key === 'price' ? v => (v >= 50000 ? '$50k+' : '$' + (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k')
              : key === 'len' ? v => v + "'" : v => v;
    $$('.range-out span', box)[0].textContent = fmt(+lo.value);
    $$('.range-out span', box)[1].textContent = fmt(+hi.value);
    const map = { price:['priceMin','priceMax'], len:['lenMin','lenMax'], year:['yearMin','yearMax'] }[key];
    S[map[0]] = +lo.value; S[map[1]] = +hi.value;
  });
  rail.addEventListener('change', e => { if (e.target.type === 'range') { toURL(true); renderActive(); renderPresets(); renderResults(); } });
}

function init() {
  fromURL();
  $('#presets').addEventListener('click', e => {
    const btn = e.target.closest('[data-preset]'); if (!btn) return;
    const p = PRESETS.find(x => x.id === btn.dataset.preset);
    const on = btn.getAttribute('aria-pressed') === 'true';
    if (on) { const d = blank(); Object.keys(p.apply).forEach(k => S[k] = d[k]); }
    else Object.assign(S, structuredClone(p.apply));
    commit();
  });
  const si = $('#q'); si.value = S.q;
  let qT; si.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { S.q = si.value.trim(); commit(); }, 180); });
  $('#sort').value = S.sort;
  $('#sort').onchange = e => { S.sort = e.target.value; commit(); };
  $$('#viewseg button').forEach(b => b.onclick = () => { S.view = b.dataset.view; commit(); });
  $('#rail-open').onclick = () => document.body.classList.add('rail-open');
  $('#scrim').onclick = () => document.body.classList.remove('rail-open');

  wireRail();
  addEventListener('hashchange', route);
  addEventListener('popstate', () => { fromURL(); commit(false); route(); });

  const listed = boats.filter(b => b.status !== 'sold');
  const stat = $('#stat-listings'); if (stat) stat.textContent = listed.filter(isBoat).length;
  /* No banner. Where the inventory came from is a thing we need while building,
     not a thing to tell a buyer about on the page. It stays in the console and
     on window.YCM_SOURCE. */

  if (/^#\/(inventory|boat)/.test(location.hash) || location.search) ensureBrowse();
  paintViewSeg();
  route();
}

/* Guard: DOMContentLoaded can reach us more than once (a second dispatch, a
   re-entrant host). Booting twice would bind every rail listener twice, and a
   single click would then apply a filter twice over. */
let booted = false;
async function boot() {
  if (booted) return;
  booted = true;
  const CFG = window.YCM_CONFIG;
  try {
    const cfg = CFG && await CFG.load();
    if (cfg) { boats = CFG.apply(window.YCM.boats, cfg).rows; source = 'config'; }
    else {
      loadError = CFG ? CFG.lastError : 'config.js did not load';
      const draft = JSON.parse(localStorage.getItem('ycm.inventory.v1'));
      if (Array.isArray(draft) && draft.length) { boats = draft; source = 'draft'; }
    }
  } catch (e) {
    loadError = e.message;
    console.warn('[YCM] boot failed:', e);
  }
  window.YCM_SOURCE = { source, loadError, photos: boats.reduce((t, b) => t + (b.media || []).filter(m => typeof m === 'string').length, 0) };
  init();
}
document.readyState === 'loading' ? addEventListener('DOMContentLoaded', boot) : boot();
window.YCM_APP = { toast };
})();
