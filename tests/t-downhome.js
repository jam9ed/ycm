/* The second design direction shares all the JS and data — only the markup and
   the skin differ. So the thing worth testing is that the shared app still
   finds everything it needs, and that the two versions stay reachable. */
process.env.PAGE = 'downhome.html';
const { window, errs, ready } = require('./smoke.js');
const $  = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);

(async () => {
  try {
    await ready('#home-featured .card');
    chk('no script errors', errs.length === 0, errs.join(' ;; '));

    // it must run the same app, not a copy of it
    chk('home renders four boats', $$('#home-featured .card').length === 4);
    chk('home renders four notes', $$('#home-posts .card').length === 4);
    chk('the featured boat box is filled', !!$('#featured') && $('#featured').children.length > 0);
    chk('partners are present', $$('.partner').length === 5);
    chk('no stat counters — that is the point', !$('#stat-listings'));
    chk('it is signed by a person', /Dave/.test($('.signoff').textContent), $('.signoff').textContent.trim());

    // the shared inventory view still works
    window.location.hash = '#/inventory';
    window.dispatchEvent(new window.Event('hashchange'));
    await ready('#grid .card');
    chk('inventory renders every listing',
        $$('#grid .card').length === window.YCM.boats.length, $$('#grid .card').length);
    chk('the filter rail is built', $$('#rail .fgroup').length >= 5);
    chk('presets are built', $$('#presets .preset').length === 8);
    chk('titles follow the route', window.document.title === 'Inventory', window.document.title);

    window.location.hash = '#/blog';
    window.dispatchEvent(new window.Event('hashchange'));
    chk('blog renders every post',
        $$('#blog-grid .card').length === window.YCM_POSTS.length, $$('#blog-grid .card').length);

    // the two versions must reach each other
    chk('it links back to the other design',
        $$('a[href="index.html"]').length >= 1);
    chk('it loads its own skin on top of the shared one', (() => {
      const hrefs = $$('link[rel="stylesheet"]').map(l => l.getAttribute('href'));
      return hrefs[0].endsWith('ycm.css') && hrefs[1].endsWith('downhome.css');
    })(), $$('link[rel="stylesheet"]').map(l => l.getAttribute('href')).join(' then '));
  } catch (e) {
    chk('downhome suite ran', false, e.message);
  }
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f ? 1 : 0);
})();
