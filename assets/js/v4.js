/* v4 — the list first.

   Everything here serves one idea: you land on the page and you are already
   looking at the boats. Filters are buttons that do one thing, sorting is a
   real <select>, and there is no state worth losing. Photographs come from the
   same saved file the staff portal writes, so a boat shows a picture once
   somebody has attached one and a plain marker until then.

   The list uses the 400px thumbnails generated for the photo library rather
   than the originals; 28 full-size photographs to draw an index would be silly.
*/
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const STATUS = {
    available: 'Available', arriving: 'Just arriving',
    project:   'Project',   sold:     'Sold',
  };
  const KINDS = { motor:'Outboard', collectible:'Collectible', camper:'Camper' };

  let BOATS = [];
  let POSTS = [];

  const isBoat = b => !b.kind;
  const thumb  = f => f.replace(/^assets\/img\//, 'assets/img/thumbs/').replace(/\.[a-z]+$/i, '.jpg');
  const pics   = b => (b.media || []).filter(m => typeof m === 'string');
  const money  = n => '$' + n.toLocaleString('en-US');

  /* ---- state, kept in the querystring so a filtered list can be sent to
         somebody without them landing on something else ---------------- */
  const state = { show: 'boats', status: 'all', sort: 'order' };

  function readURL() {
    const q = new URLSearchParams(location.search);
    if (q.get('show'))   state.show   = q.get('show');
    if (q.get('status')) state.status = q.get('status');
    if (q.get('sort'))   state.sort   = q.get('sort');
  }
  function writeURL() {
    const q = new URLSearchParams();
    if (state.show   !== 'boats') q.set('show', state.show);
    if (state.status !== 'all')   q.set('status', state.status);
    if (state.sort   !== 'order') q.set('sort', state.sort);
    const s = q.toString();
    history.replaceState(null, '', (s ? '?' + s : location.pathname) + location.hash);
  }

  function selected() {
    let rows = BOATS.filter(b =>
      state.show === 'all'   ? true :
      state.show === 'other' ? !isBoat(b) : isBoat(b));
    if (state.status !== 'all') rows = rows.filter(b => b.status === state.status);
    const by = {
      order:    (a, b) => a.order - b.order,
      priceAsc: (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
      priceDsc: (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity),
      yearDsc:  (a, b) => (b.year ?? -Infinity) - (a.year ?? -Infinity),
      lenDsc:   (a, b) => (b.length ?? -Infinity) - (a.length ?? -Infinity),
    }[state.sort] || ((a, b) => a.order - b.order);
    return rows.slice().sort(by);
  }

  function factsOf(b) {
    const f = [];
    if (b.year)   f.push(b.year);
    if (b.length) f.push(b.length + " ft");
    if (b.hours)  f.push(b.hours + ' hrs');
    if (b.kind)   f.push(KINDS[b.kind] || b.kind);
    return f;
  }

  function rowHTML(b) {
    const p = pics(b)[0];
    const facts = factsOf(b);
    return `<li class="row"><a href="#/boat/${encodeURIComponent(b.id)}">
      <div class="shotwrap">${p
        ? `<img src="${esc(thumb(p))}" alt="" loading="lazy" decoding="async">`
        : '<div class="noshot">Photos<br>on request</div>'}</div>
      <div>
        <div class="ttl">${esc(b.title)}</div>
        ${facts.length ? `<div class="facts">${facts.map(x => `<i>${esc(x)}</i>`).join('')}</div>` : ''}
        ${b.body && b.body[0] ? `<p class="blurb">${esc(b.body[0])}</p>` : ''}
      </div>
      <div class="pricecol">
        ${b.wasPrice ? `<s class="was">${money(b.wasPrice)}</s>` : ''}
        ${b.price ? `<div class="price">${money(b.price)}</div>`
                  : '<div class="ask">Call for price</div>'}
        <span class="pill pill-${b.status}">${STATUS[b.status] || b.status}</span>
      </div></a></li>`;
  }

  const tally = rows => {
    const unpriced = rows.filter(b => !b.price).length;
    return rows.length + (rows.length === 1 ? ' listing' : ' listings') +
      (unpriced ? ` · ${unpriced} priced on request` : '');
  };

  function paintList() {
    const rows = selected();
    $('#list').innerHTML = rows.map(rowHTML).join('');
    $('#none').hidden = rows.length > 0;
    $('#count').textContent = tally(rows);
    $$('#f-show button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.show === state.show)));
    $$('#f-status button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.status === state.status)));
    $('#sort').value = state.sort;
  }

  /* The front page is about the writing, so it shows a handful of boats rather
     than all of them — unfiltered, in the order Dave lists them. */
  const FRONT = 6;
  function paintFront() {
    const boats = BOATS.filter(isBoat).slice().sort((a, b) => a.order - b.order);
    $('#list-home').innerHTML = boats.slice(0, FRONT).map(rowHTML).join('');
    $('#count-home').textContent = tally(boats);
  }

  /* A note shows its photograph when somebody has attached one in the portal.
     Most have not, and an empty frame on forty-three rows is the "awaiting
     photography" problem again — so the ones without get a drawing instead,
     picked from the id so it stays put between visits rather than reshuffling. */
  const NOTE_SPOTS = ['sp-anchor', 'sp-wave', 'sp-ring', 'sp-prop', 'sp-cleat', 'sp-compass'];
  const hashOf = str => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  };

  /* Photographs stay on Wix. `wix` holds a media identifier and Wix's own
     transform path gives us both sizes from it, so nothing is downloaded and
     no local thumbnail has to be generated. Anything attached in the staff
     portal is a local file and takes precedence. */
  const WIX = 'https://static.wixstatic.com/media/';
  const shotOf = p => {
    const local = (p.images || [])[0];
    if (local) return { thumb: thumb(local), full: local };
    const m = (p.wix || [])[0];
    return m ? { thumb: WIX + m + '/v1/fill/w_400,h_300,al_c,q_80/file.jpg', full: WIX + m } : null;
  };
  const allShots = p => (p.images || []).length
    ? p.images.map(f => ({ full: f }))
    : (p.wix || []).map(m => ({ full: WIX + m }));

  /* Three things a row can show, in order of how much they can be trusted:
     the photograph somebody attached in the portal; failing that, the one the
     post carried on the live site; failing that, a drawing. */
  const noteHTML = p => {
    const shot = shotOf(p);
    const h = hashOf(p.id);
    const face = shot
      ? `<img src="${esc(shot.thumb)}" alt="" loading="lazy" decoding="async">`
      : `<svg class="nspot" aria-hidden="true"><use href="#${NOTE_SPOTS[h % NOTE_SPOTS.length]}"></use></svg>`;
    return `<li><a href="#/note/${encodeURIComponent(p.id)}">
      <div class="nthumb${shot ? '' : ' tint-' + (h % 4)}">${face}</div>
      <div>
        <div class="nt">${esc(p.title)}</div>
        ${p.body && p.body[0] ? `<div class="nb">${esc(p.body[0])}</div>` : ''}
      </div></a></li>`;
  };

  // The newest note leads the page; the rest sit under it as a plain index.
  function paintNotes() {
    const lead = POSTS[0];
    const leadShot = lead && shotOf(lead);
    $('#note-lead').innerHTML = lead ? `<a class="lead${leadShot ? ' lead-has' : ''}" href="#/note/${encodeURIComponent(lead.id)}">
        ${leadShot ? `<div class="lead-shot"><img src="${esc(leadShot.thumb)}" alt=""
             width="400" height="300" decoding="async"></div>` : ''}
        <div>
          <div class="lead-k">Latest</div>
          <div class="lead-t">${esc(lead.title)}</div>
          ${lead.body && lead.body[0] ? `<p class="lead-b">${esc(lead.body.slice(0, 2).join(' '))}</p>` : ''}
          <div class="lead-m">Read it &rarr;</div>
        </div></a>` : '';
    $('#notes-list').innerHTML = POSTS.slice(1, 11).map(noteHTML).join('');
    $('#notes-all').innerHTML  = POSTS.map(noteHTML).join('');
  }

  /* ---- views ------------------------------------------------------------ */
  // Which nav item owns which view: anything about a boat belongs to Boats,
  // everything else belongs to the writing.
  const OWNER = { home:'home', notes:'home', note:'home', boats:'boats', detail:'boats' };

  function show(view) {
    ['home', 'boats', 'detail', 'notes', 'note']
      .forEach(v => $('#view-' + v).hidden = v !== view);
    $$('.top nav a').forEach(a =>
      a.dataset.v === OWNER[view] ? a.setAttribute('aria-current', 'page')
                                  : a.removeAttribute('aria-current'));
    window.scrollTo(0, 0);
  }

  function openBoat(id) {
    const b = BOATS.find(x => x.id === id);
    if (!b) return route('#/');
    const ps = pics(b), facts = factsOf(b);
    $('#detail').innerHTML = `
      <a class="back" href="#/">&larr; All listings</a>
      <h1>${esc(b.title)}</h1>
      <div class="facts">${facts.map(x => `<i>${esc(x)}</i>`).join('')}</div>
      <div class="pricecol" style="text-align:left;margin-bottom:18px">
        ${b.wasPrice ? `<s class="was">${money(b.wasPrice)}</s>` : ''}
        ${b.price ? `<div class="price">${money(b.price)}</div>`
                  : '<div class="ask">Call for price</div>'}
        <span class="pill pill-${b.status}">${STATUS[b.status] || b.status}</span>
      </div>
      ${ps.length ? `<div class="gal">${ps.map(f =>
        `<img src="${esc(f)}" alt="" loading="lazy" decoding="async">`).join('')}</div>` : ''}
      <div class="prose">${(b.body || []).map(t => `<p>${esc(t)}</p>`).join('')}</div>
      <div class="callout">
        <p>Want to see it, or ask whether it suits what you actually do on the water?</p>
        <p><a href="tel:+17573299979">(757) 329-9979</a> &mdash; ten until seven, every day but Christmas.</p>
      </div>`;
    show('detail');
  }

  function openNote(id) {
    const p = POSTS.find(x => x.id === id);
    if (!p) return route('#/notes');
    /* Whatever the portal attached, or failing that what the post showed on the
       live site. Full size and uncropped here — the note index crops to a
       thumbnail, but on the post itself you want the whole photograph. */
    const shots = allShots(p);
    $('#note').innerHTML = `
      <a class="back" href="#/notes">&larr; All notes</a>
      <h1>${esc(p.title)}</h1>
      <div class="prose" style="margin-top:16px">${(p.body || []).map(t => `<p>${esc(t)}</p>`).join('')}</div>
      ${shots.length ? `<div class="gal-full">${shots.map((x, i) =>
        `<figure><img src="${esc(x.full)}" alt="" ${i ? 'loading="lazy"' : ''} decoding="async"></figure>`
        ).join('')}</div>` : ''}`;
    show('note');
  }

  function route(h) { if (h) location.hash = h; else render(); }

  function render() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/(boat|note)\/(.+)$/);
    if (m && m[1] === 'boat') return openBoat(decodeURIComponent(m[2]));
    if (m && m[1] === 'note') return openNote(decodeURIComponent(m[2]));
    if (h.startsWith('#/notes')) return show('notes');
    if (h.startsWith('#/boats')) return show('boats');
    show('home');
  }

  /* ---- wiring ----------------------------------------------------------- */
  function wire() {
    $('#f-show').addEventListener('click', e => {
      const b = e.target.closest('button[data-show]'); if (!b) return;
      state.show = b.dataset.show; writeURL(); paintList();
    });
    $('#f-status').addEventListener('click', e => {
      const b = e.target.closest('button[data-status]'); if (!b) return;
      state.status = b.dataset.status; writeURL(); paintList();
    });
    $('#sort').addEventListener('change', () => {
      state.sort = $('#sort').value; writeURL(); paintList();
    });
    addEventListener('hashchange', render);
  }

  async function boot() {
    const seed = (window.YCM && window.YCM.boats) || [];
    const seedPosts = window.YCM_POSTS || [];
    BOATS = seed.map(b => ({ ...b, media: [] }));
    POSTS = seedPosts.map(p => ({ ...p, images: [] }));

    const CFG = window.YCM_CONFIG;
    try {
      const cfg = CFG && await CFG.load();
      if (cfg) {
        const applied = CFG.apply(seed, cfg, seedPosts);
        BOATS = applied.rows; POSTS = applied.posts;
      } else {
        // nothing saved yet: fall back to whatever the portal has in progress
        const draft = JSON.parse(localStorage.getItem('ycm.inventory.v1') || 'null');
        if (Array.isArray(draft) && draft.length) BOATS = draft;
        const pl = JSON.parse(localStorage.getItem('ycm.postlinks.v1') || '{}');
        if (Object.keys(pl).length) POSTS = POSTS.map(p => ({ ...p, images: pl[p.id] || [] }));
      }
    } catch (e) {
      console.warn('[YCM v4] config:', e.message);
    }

    readURL(); wire(); paintList(); paintFront(); paintNotes(); render();
    document.body.dataset.ready = '1';
  }

  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', boot) : boot();
})();
