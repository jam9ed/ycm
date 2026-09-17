/* v4 — the list first. Craigslist's one good idea, set properly. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (m, c, x) => { c ? (pass++, console.log('PASS  ' + m + (x ? '  — ' + x : '')))
                            : (fail++, console.log('FAIL  ' + m + (x ? '  — ' + x : ''))); };
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const dom = new JSDOM(read('v4.html'), {
  runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/v4.html',
});
const w = dom.window, d = w.document;
w.fetch = () => Promise.resolve({ ok: false, status: 404 });   // nothing saved: seed data
w.scrollTo = () => {};
['assets/js/config.js', 'assets/js/data.js', 'assets/js/posts.js', 'assets/js/v4.js']
  .forEach(f => w.eval(read(f)));

const $  = s => d.querySelector(s);
const $$ = s => [...d.querySelectorAll(s)];
const rows = () => $$('#list .row');

(async () => {
  for (let i = 0; i < 60 && !d.body.dataset.ready; i++) await new Promise(r => setTimeout(r, 25));
  ok('the page boots', d.body.dataset.ready === '1');

  const ALL = w.YCM.boats, BOATS = ALL.filter(b => !b.kind);

  // --- the writing leads, the boats follow --------------------------------
  {
    const html = read('v4.html');
    const notesAt = html.indexOf('id="notes-sec"');
    const boatsAt = html.indexOf('id="list-home"');
    ok('the writing comes before the boats on the front page',
       notesAt > 0 && boatsAt > 0 && notesAt < boatsAt, `notes@${notesAt} boats@${boatsAt}`);
    ok('the nav leads with the writing too',
       $$('.top nav a')[0].textContent.trim() === 'Notes', $$('.top nav a')[0].textContent.trim());
    ok('nothing autoplays at the top', !$('video, .carousel'));
  }
  ok('a note leads the front page', !!$('#note-lead .lead-t') &&
     $('#note-lead .lead-t').textContent === w.YCM_POSTS[0].title);
  ok('with more of them underneath', $$('#notes-list li').length === 10, $$('#notes-list li').length + '');
  ok('the front page shows only a few boats', $$('#list-home .row').length === 6,
     $$('#list-home .row').length + '');
  ok('and says how many there are in total',
     /28 listings/.test($('#count-home').textContent), $('#count-home').textContent);
  ok('there is a way through to all of them', !!$('a[href="#/boats"]'));

  // --- the setup: there is more here than the list shows -------------------
  {
    const t = $('.split-note').textContent.replace(/\s+/g, ' ');
    ok('the page says the list is not everything', /Not everything is on the list/.test(t));
    ok('and invites people to say what they are after',
       /tell me and I will keep an eye out/.test(t));
    ok('with the phone number right there', !!$('.split-note a[href^="tel:"]'));
  }

  // --- the full list lives on its own page --------------------------------
  w.location.hash = '#/boats';
  w.dispatchEvent(new w.Event('hashchange'));
  ok('boats for sale is its own page', $('#view-boats').hidden === false && $('#view-home').hidden === true);
  ok('every boat is listed there', rows().length === BOATS.length, rows().length + ' of ' + BOATS.length);
  ok('non-boats are not called boats by default',
     rows().length === ALL.length - 8, ALL.length - rows().length + ' held back');

  // --- what a row states, and nothing more --------------------------------
  {
    const first = BOATS[0];
    const r = rows()[0];
    ok('a row states the title verbatim', r.querySelector('.ttl').textContent === first.title);
    const facts = [...r.querySelectorAll('.facts i')].map(i => i.textContent);
    const expect = [first.year, first.length && first.length + ' ft', first.hours && first.hours + ' hrs']
      .filter(Boolean).map(String);
    ok('and only the facts the ad actually carries', JSON.stringify(facts) === JSON.stringify(expect),
       facts.join('|') + ' vs ' + expect.join('|'));
    const priced = rows().filter(x => x.querySelector('.price')).length;
    const asked  = rows().filter(x => x.querySelector('.ask')).length;
    ok('every row shows a price or says to call', priced + asked === rows().length,
       priced + ' priced, ' + asked + ' on request');
    ok('the count says how many are priced on request', /priced on request/.test($('#count').textContent),
       $('#count').textContent);
  }

  // --- filters -------------------------------------------------------------
  const click = s => $(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  click('#f-show button[data-show="other"]');
  ok('the motors and oddments can be seen on their own', rows().length === 8, rows().length + '');
  click('#f-show button[data-show="all"]');
  ok('or everything together', rows().length === ALL.length, rows().length + '');
  click('#f-show button[data-show="boats"]');

  click('#f-status button[data-status="project"]');
  const projects = BOATS.filter(b => b.status === 'project').length;
  ok('projects can be isolated', rows().length === projects, rows().length + ' of ' + projects);
  ok('the filter state is in the URL, so a list can be sent to someone',
     /status=project/.test(w.location.search), w.location.search);
  click('#f-status button[data-status="all"]');

  // --- sorting -------------------------------------------------------------
  const sort = $('#sort');
  sort.value = 'priceAsc'; sort.dispatchEvent(new w.Event('change'));
  const prices = rows().map(r => {
    const p = r.querySelector('.price');
    return p ? Number(p.textContent.replace(/[^0-9]/g, '')) : Infinity;
  });
  ok('price sort actually sorts', prices.every((v, i) => i === 0 || prices[i - 1] <= v), prices.slice(0, 5).join(','));
  ok('unpriced boats sink to the bottom rather than reading as free',
     prices.filter(p => p === Infinity).every((_, i, a) => prices.slice(-a.length).every(x => x === Infinity)));
  sort.value = 'yearDsc'; sort.dispatchEvent(new w.Event('change'));
  const years = rows().map(r => {
    const f = [...r.querySelectorAll('.facts i')].map(i => i.textContent);
    const y = f.find(t => /^\d{4}$/.test(t));
    return y ? Number(y) : -Infinity;
  });
  ok('year sort actually sorts', years.every((v, i) => i === 0 || years[i - 1] >= v), years.slice(0, 5).join(','));
  sort.value = 'order'; sort.dispatchEvent(new w.Event('change'));

  // --- photographs ---------------------------------------------------------
  ok('rows with a photo use the thumbnail, not the original',
     rows().every(r => { const i = r.querySelector('.shotwrap img');
                         return !i || /^assets\/img\/thumbs\//.test(i.getAttribute('src')); }));
  ok('rows without one say so plainly rather than showing a broken frame',
     rows().every(r => !!r.querySelector('.shotwrap img') || !!r.querySelector('.noshot')));

  // --- notes ---------------------------------------------------------------
  ok('the notes page shows all of them',
     $$('#notes-all li').length === w.YCM_POSTS.length, $$('#notes-all li').length + '');
  ok('the lead note is not repeated in the list underneath',
     !$$('#notes-list li .nt').some(n => n.textContent === w.YCM_POSTS[0].title));

  // --- one listing ---------------------------------------------------------
  const target = BOATS[2];
  w.location.hash = '#/boat/' + encodeURIComponent(target.id);
  w.dispatchEvent(new w.Event('hashchange'));
  ok('a listing opens on its own', $('#view-detail').hidden === false && $('#view-home').hidden === true);
  ok('and carries the copy verbatim',
     $('#detail .prose').textContent.includes(target.body[0].slice(0, 30)));
  ok('with the phone number on it', /757/.test($('#detail .callout').textContent));

  // --- the things this version is deliberately not -------------------------
  const html = read('v4.html');
  ok('no webfonts: it renders the moment the HTML lands',
     !/fonts\.googleapis|fonts\.gstatic|@font-face/.test(html + read('assets/css/v4.css')));
  ok('it does not load the other versions’ stylesheet',
     !/ycm\.css/.test(html));
  ok('no marketing furniture', !/schedule a consultation|request a quote|newsletter|subscribe/i.test(html));
  ok('the old site’s blue is carried through', /#2B328C/i.test(read('assets/css/v4.css')));
  ok('every image on the page exists',
     $$('img[src]').every(i => fs.existsSync(path.join(root, i.getAttribute('src')))),
     $$('img[src]').map(i => i.getAttribute('src')).filter(s => !fs.existsSync(path.join(root, s))).join(', '));

  // The <img> width/height attributes reserve layout space, but they also act as
  // presentational hints. A concrete height:720px beats aspect-ratio, which only
  // applies when one axis is auto — the intro photograph rendered 411x720 from a
  // 1280x720 source until height:auto handed the axis back. jsdom cannot see
  // this; only a rendered page can. So: any rule that sizes an image by width
  // and a ratio has to say what the other axis does.
  {
    const css = read('assets/css/v4.css');
    const bad = [...css.matchAll(/([.#][\w-]+[^{}]*)\{([^}]*aspect-ratio[^}]*)\}/g)]
      .filter(m => /width\s*:\s*100%/.test(m[2]) && !/height\s*:/.test(m[2]))
      .map(m => m[1].trim());
    ok('an image sized by width and ratio also states its height', bad.length === 0, bad.join(' | '));
  }
  {
    const withAttrs = $$('img[width][height]').map(i => i.getAttribute('src'));
    ok('the photographs reserve their space so the page does not jump',
       withAttrs.length >= 2, withAttrs.length + ' with width/height');
  }

  // --- the drawings --------------------------------------------------------
  {
    const html = read('v4.html');
    const defined = [...html.matchAll(/<symbol id="(sp-[a-z]+)"/g)].map(m => m[1]);
    const used    = [...html.matchAll(/<use href="#(sp-[a-z]+)"/g)].map(m => m[1]);
    ok('the spot drawings are inline, costing no request', defined.length >= 6, defined.join(' '));
    ok('every drawing used is one that exists',
       used.every(u => defined.includes(u)), used.filter(u => !defined.includes(u)).join(' '));
    ok('Tilly gets a cat', used.includes('sp-cat'));
    ok('and the anchor is back, as the old site had it', used.includes('sp-anchor'));
  }

  // --- the old site's colours ----------------------------------------------
  {
    const css = read('assets/css/v4.css');
    ok('the red the old site actually used', /--red:\s*#FF4F4F/i.test(css));
    ok('its deeper red too', /--red-deep:\s*#C52800/i.test(css));
    ok('the sign blue', /--navy:\s*#2B328C/i.test(css));
    ok('the theme sky blue', /--sky:\s*#54A0EA/i.test(css));
    ok('on white, as it was', /--paper:\s*#FFFFFF/i.test(css));
  }

  console.log('\n' + fail + ' failures of ' + (pass + fail));
  process.exit(fail ? 1 : 0);
})();
