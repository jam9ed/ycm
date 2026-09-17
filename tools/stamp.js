#!/usr/bin/env node
/* Stamp every local asset reference with a hash of the file's contents.
 *
 * GitHub Pages serves assets with cache-control: max-age=600 and no version in
 * the URL, so a reviewer who has opened the site before can sit on a stale
 * posts.js or v4.js for as long as their browser feels like it — and a stale
 * posts.js has no `fromSite`, so the note rows quietly fall back to drawings
 * and it looks like the images are broken. Someone reported exactly that.
 *
 * Content hashing means the URL changes whenever the file does, so a stale copy
 * is never reachable, and nothing changes when a file has not.
 *
 * Run: node tools/stamp.js        (idempotent; run it before committing)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const PAGES = fs.readdirSync(root).filter(f => f.endsWith('.html') && !f.startsWith('_'));
const REF = /(src|href)="(assets\/(?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))(\?v=[0-9a-f]+)?"/g;

let touched = 0, stamped = 0;
for (const page of PAGES) {
  const file = path.join(root, page);
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(REF, (whole, attr, asset) => {
    const target = path.join(root, asset);
    if (!fs.existsSync(target)) {
      console.warn(`  ! ${page}: ${asset} does not exist`);
      return whole;
    }
    const h = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex').slice(0, 8);
    stamped++;
    return `${attr}="${asset}?v=${h}"`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after);
    touched++;
    console.log(`  stamped ${page}`);
  }
}
console.log(`${stamped} references across ${PAGES.length} pages; ${touched} file(s) changed`);
