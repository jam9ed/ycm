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

console.log(out.join('\n'));
const f = out.filter(l => l.startsWith('**')).length;
console.log(`\n${f} failures of ${out.length}`);
process.exit(f ? 1 : 0);
