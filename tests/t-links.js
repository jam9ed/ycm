/* Footer links are only useful if a cold load at that URL lands somewhere real. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const out = []; const chk = (n,c,x='') => out.push(`${c?'PASS':'**FAIL**'}  ${n}${x?'  — '+x:''}`);

function load(url) {
  const dom = new JSDOM(fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), {
    url, runScripts:'dangerously', pretendToBeVisual:true,
    beforeParse(w){
      w.IntersectionObserver=class{constructor(cb){this.cb=cb}observe(el){this.cb([{target:el,isIntersecting:true}])}unobserve(){}disconnect(){}};
      w.matchMedia=()=>({matches:false}); w.scrollTo=()=>{};
      w.fetch=async()=>({ok:false,status:404,json:async()=>({})});
    }});
  const w = dom.window;
  for (const src of [...w.document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')))
    w.eval(fs.readFileSync(path.join(ROOT,src),'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded',{bubbles:true}));
  return w;
}
const wait = () => new Promise(r => setTimeout(r, 220));

(async () => {
  const base = 'http://localhost:8899/index.html';

  // gather the footer's own links and walk them
  let w = load(base); await wait();
  const links = [...w.document.querySelectorAll('.ftr a')].map(a => a.getAttribute('href'));
  chk('no footer link is a dead placeholder', !links.includes('#/'), links.filter(h=>h==='#/').join());
  chk('every footer link has a destination', links.every(h => h && h !== '#'), links.length + ' links');

  for (const [href, test] of [
    ['?status=project#/inventory',  b => b.status === 'project'],
    ['?status=arriving#/inventory', b => b.status === 'arriving'],
    ['?priceMax=15000#/inventory',  b => b.price == null || b.price <= 15000],
    ['?drops=1#/inventory',         b => b.wasPrice && b.price < b.wasPrice],
  ]) {
    w = load(base + href); await wait();
    const $$ = s => [...w.document.querySelectorAll(s)];
    const shown = $$('#grid .card').map(c => w.YCM.boats.find(b => b.id === c.dataset.id)).filter(Boolean);
    chk(`${href} opens the inventory`, !w.document.querySelector('#view-browse').hidden && shown.length > 0,
        shown.length + ' boats');
    chk(`${href} actually filters`, shown.length > 0 && shown.every(test),
        shown.filter(b => !test(b)).map(b => b.title.slice(0,28)).join(' | ') || 'all match');
  }

  // and the two plain routes
  for (const [href, view] of [['#/inventory','view-browse'], ['#/blog','view-blog']]) {
    w = load(base + href); await wait();
    chk(`${href} shows ${view}`, !w.document.querySelector('#'+view).hidden);
  }

  console.log(out.join('\n'));
  const f = out.filter(l=>l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f?1:0);
})();
