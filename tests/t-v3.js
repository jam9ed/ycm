process.env.PAGE = 'v3.html';
const { window, errs, ready } = require('./smoke.js');
const $  = s => window.document.querySelector(s);
const $$ = s => [...window.document.querySelectorAll(s)];
const fs = require('fs'), path = require('path');
const out = []; const chk = (n,c,x='') => out.push(`${c?'PASS':'**FAIL**'}  ${n}${x?'  — '+x:''}`);

(async () => {
  try {
    await ready('#home-posts .card');
    chk('no script errors', errs.length === 0, errs.join(' ;; '));

    // the brief: sharing before selling. Notes must come before stock.
    const order = $$('#view-home section, #view-home figure.v3-hero').map(el =>
      (el.querySelector('h1,h2') || {}).textContent?.trim() || 'hero');
    const iNotes = order.findIndex(t => /Notes/i.test(t));
    const iStock = order.findIndex(t => /Here right now/i.test(t));
    chk('writing is placed above the inventory', iNotes > -1 && iStock > -1 && iNotes < iStock,
        order.join(' | '));

    chk('the hero leads with Dave, not a boat', !!$('.v3-hero img[src*="dave-helm"]'));
    chk('the primary call to action is a phone call',
        /talk boats/i.test($('.v3-hero .btn-primary').textContent), $('.v3-hero .btn-primary').textContent);

    // video is the closest thing to being aboard, and must still be lazy
    chk('sea trial video is on the home page', $$('.reels ycm-video').length === 3);
    chk('every reel has a local poster and a playback url', $$('.reels ycm-video').every(v =>
      /^assets\/img\/posters\//.test(v.getAttribute('poster')) && /^https:\/\//.test(v.getAttribute('src'))));
    chk('no video element mounts before intent', $$('.reels video').length === 0);

    chk('the 1974 photo is used', !!$('.origin img[src*="dave-1974"]'));
    chk('and its file exists', fs.existsSync(path.join(__dirname,'..','assets/img/dave-1974.jpg')));
    chk('the mechanic gets his own section', /Ron goes over every boat/.test($('#view-home').textContent));
    chk('and his missing photo is marked as missing, not faked',
        /Photo of Ron needed/.test($('#view-home').textContent));

    // shared machinery still works
    window.location.hash = '#/inventory';
    window.dispatchEvent(new window.Event('hashchange'));
    await ready('#grid .card');
    chk('inventory still renders', $$('#grid .card').length === window.YCM.boats.length);
    chk('every image on the page resolves', (() => {
      const bad = $$('img[src]').map(i => i.getAttribute('src'))
        .filter(s => s && !/^(data:|https?:)/.test(s))
        .filter(s => !fs.existsSync(path.join(__dirname, '..', s)));
      return bad.length === 0 || (globalThis.__bad = bad, false);
    })(), (globalThis.__bad || []).join(', '));
  } catch (e) { chk('v3 suite ran', false, e.message); }
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f ? 1 : 0);
})();
