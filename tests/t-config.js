/* Persistence adapter + the dev server's write endpoint. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..');

const out = [];
const chk = (n, c, x='') => out.push(`${c ? 'PASS' : '**FAIL**'}  ${n}${x ? '  — ' + x : ''}`);

// --- adapter, in isolation ------------------------------------------------
const dom = new JSDOM('<!doctype html><body>', { runScripts: 'dangerously' });
dom.window.eval(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'));
const CFG = dom.window.YCM_CONFIG;

const seed = [
  { id:'a', year:1998, model:'Montauk 17', media:[{ label:'walkaround', duration:'3:42' }] },
  { id:'b', year:2022, model:'160 Super Sport', media:[] },
];
const rows = JSON.parse(JSON.stringify(seed));
rows[0].media.push('assets/img/inv/live_004.jpg', 'assets/img/inv/live_005.jpg');
rows[1].media.push('assets/img/inv/live_029.jpg');
const aside = new Set(['assets/img/boats/src_012dfbd305.jpg']);

const built = CFG.build(rows, aside);
chk('build records photos under links', JSON.stringify(built.links.a) === JSON.stringify(['assets/img/inv/live_004.jpg','assets/img/inv/live_005.jpg']));
chk('build keeps the set-aside pile', built.setAside.length === 1);
chk('photos are recorded in exactly one place',
    built.listings.every(l => (l.media||[]).every(m => typeof m !== 'string')),
    'listings still carry photo strings');
chk('video slots survive the round trip', built.listings[0].media.length === 1 && built.listings[0].media[0].label === 'walkaround');

const back = CFG.apply(seed, built);
chk('apply restores the exact photo linkage',
    JSON.stringify(back.rows[0].media.filter(m => typeof m === 'string')) === JSON.stringify(built.links.a));
chk('apply puts video before photos', back.rows[0].media[0].label === 'walkaround');
chk('apply restores the set-aside pile', back.aside.has('assets/img/boats/src_012dfbd305.jpg'));
chk('round trip is lossless', CFG.same(CFG.build(back.rows, back.aside), built));

chk('a listing with no link stays photo-less', CFG.apply(seed, { links:{}, setAside:[], listings:[] }).rows.every(r => (r.media||[]).every(m => typeof m !== 'string')));
// content-equal states must compare equal regardless of key order
const shuffled = JSON.parse(JSON.stringify(built));
shuffled.listings = shuffled.listings.map(l => Object.keys(l).reverse()
  .reduce((o, k) => { o[k] = l[k]; return o; }, {}));
chk('key order does not make a saved config look dirty', CFG.same(shuffled, built));

chk('same() spots a difference', !CFG.same(built, CFG.build(seed.map(r => ({...r})), new Set())));
const noFetch = CFG.load();   // jsdom window has no fetch; must resolve to null, not throw
chk('load() is thenable without fetch', typeof noFetch.then === 'function');

// --- against the real server ---------------------------------------------
const CONFIG = path.join(ROOT, 'assets/data/ads-config.json');
const existed = fs.existsSync(CONFIG);
const backup  = existed ? fs.readFileSync(CONFIG) : null;

const srv = require('child_process').spawn('node', [path.join(ROOT, 'server.js')],
  { env: { ...process.env, PORT: '8912' }, stdio: 'ignore' });

const req = (method, p, body) => new Promise((res, rej) => {
  const r = http.request({ host:'localhost', port:8912, path:p, method,
    headers: body ? { 'Content-Type':'application/json' } : {} }, x => {
    let d = ''; x.on('data', c => d += c); x.on('end', () => res({ status:x.statusCode, body:d }));
  });
  r.on('error', rej); if (body) r.write(body); r.end();
});

(async () => {
  chk('load() resolves to null when there is no config to read', (await noFetch) === null);
  await new Promise(r => setTimeout(r, 700));
  try {
    const h = await req('GET', '/api/health');
    chk('server reports it is writable', JSON.parse(h.body).writable === true);

    const payload = JSON.stringify(built);
    const w = await req('PUT', '/api/ads-config', payload);
    chk('PUT writes the config', w.status === 200 && JSON.parse(w.body).ok === true, w.body.slice(0,80));
    chk('file landed on disk', fs.existsSync(CONFIG));

    const read = await req('GET', '/assets/data/ads-config.json');
    chk('config is then served back', read.status === 200 && CFG.same(JSON.parse(read.body), built));

    const w2 = await req('PUT', '/api/ads-config', JSON.stringify({ version:1, links:{}, setAside:[], listings:[] }));
    chk('overwrite keeps a backup', w2.status === 200 && fs.existsSync(path.join(ROOT,'assets/data/backups')));

    chk('malformed JSON is refused', (await req('PUT','/api/ads-config','{oops')).status === 400);
    chk('a bare array is refused', (await req('PUT','/api/ads-config','[1,2]')).status === 400);
    chk('traversal is refused', (await req('GET','/%2e%2e%2fpackage.json')).status === 403);
    chk('writes are confined to the one endpoint', (await req('PUT','/index.html','{}')).status === 405);
  } catch (e) {
    chk('server suite ran', false, e.message);
  } finally {
    srv.kill();
    fs.rmSync(path.join(ROOT,'assets/data/backups'), { recursive:true, force:true });
    if (existed) fs.writeFileSync(CONFIG, backup); else fs.rmSync(CONFIG, { force:true });
  }
  console.log(out.join('\n'));
  const f = out.filter(l => l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f ? 1 : 0);
})();
