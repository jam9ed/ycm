#!/usr/bin/env node
/* ==========================================================================
   Dev server: static files + one writable endpoint.

   `python -m http.server` cannot accept a write, so the admin had nowhere to
   put its work but localStorage — one browser profile away from being lost.
   This serves the same files and additionally accepts:

     GET  /api/health      -> { writable: true }
     GET  /api/ads-config  -> the saved config (404 if never saved)
     PUT  /api/ads-config  -> writes assets/data/ads-config.json

   The write is deliberately narrow: exactly one path, JSON only, size-capped,
   and it keeps a timestamped backup of whatever it replaces.
   ========================================================================== */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT    = __dirname;
const PORT    = Number(process.env.PORT) || 8899;
const DATADIR = path.join(ROOT, 'assets', 'data');
const CONFIG  = path.join(DATADIR, 'ads-config.json');
const BACKUPS = path.join(DATADIR, 'backups');
const MAX     = 8 * 1024 * 1024;

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
  '.webp':'image/webp', '.avif':'image/avif', '.mp4':'video/mp4', '.m3u8':'application/vnd.apple.mpegurl',
  '.woff2':'font/woff2', '.ico':'image/x-icon', '.md':'text/markdown; charset=utf-8',
};
const json = (res, code, obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':b.length, 'Cache-Control':'no-store' });
  res.end(b);
};

function writeConfig(req, res) {
  let size = 0; const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > MAX) { json(res, 413, { error:'Config too large' }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let parsed;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch (e) { return json(res, 400, { error:'Not valid JSON: ' + e.message }); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return json(res, 400, { error:'Expected a JSON object' });
    try {
      fs.mkdirSync(DATADIR, { recursive: true });
      if (fs.existsSync(CONFIG)) {                     // never overwrite without a copy
        fs.mkdirSync(BACKUPS, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(CONFIG, path.join(BACKUPS, `ads-config.${stamp}.json`));
      }
      const tmp = CONFIG + '.tmp';                     // atomic-ish: write then rename
      fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2));
      fs.renameSync(tmp, CONFIG);
    } catch (e) { return json(res, 500, { error: e.message }); }
    const links = parsed.links || {};
    const photos = Object.values(links).reduce((n, a) => n + (Array.isArray(a) ? a.length : 0), 0);
    console.log(`saved ads-config.json — ${Object.keys(links).length} listings, ${photos} photos, ${(parsed.setAside||[]).length} set aside`);
    json(res, 200, { ok:true, path:'assets/data/ads-config.json', listings:Object.keys(links).length, photos });
  });
}

function serveStatic(req, res) {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      // Images are content-addressed enough to cache; code and data are not.
      // `no-cache` still permits a browser to reuse a stale copy in some
      // paths, which made "I hard-refreshed and nothing changed" a real and
      // very confusing failure mode. `no-store` removes the possibility.
      'Cache-Control': rel.startsWith('assets/img/') ? 'public, max-age=86400' : 'no-store, must-revalidate',
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* Real HTTP Basic Auth, checked here on the server, unlike the client-side
   gate in the browser. Off unless YCM_PASSWORD is set:
     YCM_PASSWORD=ycm4life npm start
   Pair it with a tunnel (cloudflared / ngrok) to show the site to someone
   without publishing it. */
const PASSWORD = process.env.YCM_PASSWORD || '';
const USER     = process.env.YCM_USER || 'ycm';
function authed(req) {
  if (!PASSWORD) return true;
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const [u, p] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':');
  // constant-time-ish: compare full strings, never short-circuit on length
  const want = `${USER}:${PASSWORD}`, got = `${u}:${p}`;
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

http.createServer((req, res) => {
  if (!authed(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="York County Marine", charset="UTF-8"' });
    return res.end('Authentication required');
  }
  const url = req.url.split('?')[0];
  if (url === '/api/health')      return json(res, 200, { writable:true, config:fs.existsSync(CONFIG) });
  if (url === '/api/ads-config') {
    if (req.method === 'PUT')  return writeConfig(req, res);
    if (req.method === 'GET')  {
      if (!fs.existsSync(CONFIG)) return json(res, 404, { error:'No config saved yet' });
      return serveStatic({ url:'/assets/data/ads-config.json' }, res);
    }
    res.writeHead(405); return res.end('Method not allowed');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`York County Marine portal  →  http://localhost:${PORT}`);
  console.log(`saving to                  →  ${path.relative(ROOT, CONFIG)}`);
  console.log(PASSWORD ? `auth                       →  Basic, user "${USER}"`
                       : `auth                       →  off (set YCM_PASSWORD to enable)`);
});
