/* A structural check, not a visual one.

   .wrap supplies the page gutter via padding-inline. Any class used on the
   same element that sets the `padding` shorthand silently resets that to 0,
   and the section goes flush to the viewport edge. It happened to .band,
   .strip-in and .detail at once, and it is invisible until someone looks at
   the page on a wide screen. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const out = []; const chk = (n,c,x='') => out.push(`${c?'PASS':'**FAIL**'}  ${n}${x?'  — '+x:''}`);

const html = ['index.html','downhome.html','admin.html','identity.html']
  .map(f => fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n')
  + fs.readFileSync(path.join(ROOT,'assets/js/app.js'),'utf8');
const css = ['assets/css/ycm.css','assets/css/downhome.css']
  .map(f => fs.readFileSync(path.join(ROOT,f),'utf8')).join('\n');

// every class that ever shares an element with .wrap
const companions = new Set();
for (const m of html.matchAll(/class="([^"]*\bwrap\b[^"]*)"/g))
  m[1].split(/\s+/).filter(c => c && c !== 'wrap').forEach(c => companions.add(c));

chk('found the classes that sit alongside .wrap', companions.size > 0,
    [...companions].join(', '));

const offenders = [];
for (const c of companions) {
  for (const m of css.matchAll(new RegExp('^\\.' + c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\{([^}]*)\\}', 'gm'))) {
    if (/(?<!-)\bpadding:/.test(m[1])) offenders.push(`.${c} { ${m[1].match(/(?<!-)\bpadding:[^;]*/)[0]} }`);
  }
}
chk('none of them resets the page gutter with a padding shorthand',
    offenders.length === 0, offenders.join(' | '));

chk('.wrap still supplies a gutter', /\.wrap\{[^}]*padding-inline:/.test(css));

// The standalone preview pages (videos.html, images.html) load the site
// stylesheet and then define their own classes in a <style> block. A name used
// by both wins from whichever loads last, which is how the photo grid ended up
// inside a fixed modal overlay: ycm.css already defines .sheet as exactly that,
// and jsdom does no layout, so nothing in this suite could see it. Standalone
// pages namespace their own classes; this makes that a rule rather than a hope.
{
  const siteClasses = new Set([...css.matchAll(/^\.([A-Za-z][\w-]*)/gm)].map(m => m[1]));
  for (const page of ['videos.html', 'images.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1];
    const own = new Set([...style.matchAll(/(?:^|[\s,>])\.([A-Za-z][\w-]*)/g)].map(m => m[1]));
    const clash = [...own].filter(c => siteClasses.has(c)).sort();
    chk(`${page} does not reuse a class name ycm.css already defines`,
        clash.length === 0, clash.join(', '));
  }
}

/* Every local asset reference is stamped with a hash of the file's contents, so
   a reviewer can never be served a stale copy. GitHub Pages sends max-age=600
   with no version in the URL, and a stale posts.js has no `fromSite`, so the
   note rows fall back to drawings and it reads as broken images. If this fails,
   run: node tools/stamp.js */
{
  const crypto = require('crypto');
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && !f.startsWith('_'));
  const stale = [], bare = [];
  for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="(assets\/(?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))(\?v=([0-9a-f]+))?"/g)];
    for (const [, asset, , stamp] of refs) {
      const target = path.join(ROOT, asset);
      if (!fs.existsSync(target)) continue;
      const want = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 8);
      if (!stamp) bare.push(`${page} -> ${asset}`);
      else if (stamp !== want) stale.push(`${page} -> ${asset} (${stamp} != ${want})`);
    }
  }
  chk('every asset reference carries a content stamp', bare.length === 0, bare.slice(0, 4).join(', '));
  chk('and every stamp matches the file it points at', stale.length === 0, stale.slice(0, 4).join(', '));
}

console.log(out.join('\n'));
const f = out.filter(l => l.startsWith('**')).length;
console.log(`\n${f} failures of ${out.length}`);
process.exit(f ? 1 : 0);
