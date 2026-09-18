/**
 * build-report.js — what the last Windows build weighs and why.
 *
 *   node scripts/build-report.js [dist/win-unpacked]
 *
 * Prints the installer sizes in dist/, the unpacked app size split into Electron runtime /
 * locales / app.asar, and the biggest packages inside app.asar — handy for checking that
 * the `files` excludes in package.json still bite after a dependency update.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const unpacked = path.resolve(process.argv[2] || path.join(DIST, 'win-unpacked'));
const mb = (n) => `${(n / 1048576).toFixed(1).padStart(7)} MB`;

function du(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  let s = 0;
  for (const e of fs.readdirSync(p)) s += du(path.join(p, e));
  return s;
}

if (fs.existsSync(DIST)) {
  console.log('Installers:');
  for (const f of fs.readdirSync(DIST)) {
    if (/\.(exe|dmg|AppImage|deb)$/i.test(f)) console.log(`  ${mb(fs.statSync(path.join(DIST, f)).size)}  ${f}`);
  }
}
if (!fs.existsSync(unpacked)) { console.log(`\n${unpacked} not found — run a build first.`); process.exit(0); }

const total = du(unpacked);
const locales = fs.existsSync(path.join(unpacked, 'locales')) ? du(path.join(unpacked, 'locales')) : 0;
const resources = path.join(unpacked, 'resources');
const asarFile = path.join(resources, 'app.asar');
const asarSize = fs.existsSync(asarFile) ? fs.statSync(asarFile).size : 0;
const unpackedDir = path.join(resources, 'app.asar.unpacked');
const asarUnpacked = fs.existsSync(unpackedDir) ? du(unpackedDir) : 0;
console.log(`\nUnpacked app: ${mb(total)}  (${path.relative(ROOT, unpacked)})`);
console.log(`  ${mb(total - locales - asarSize - asarUnpacked)}  Electron runtime`);
console.log(`  ${mb(locales)}  locales (${fs.existsSync(path.join(unpacked, 'locales')) ? fs.readdirSync(path.join(unpacked, 'locales')).length : 0})`);
console.log(`  ${mb(asarSize)}  app.asar`);
console.log(`  ${mb(asarUnpacked)}  app.asar.unpacked (native modules)`);

let asar = null;
try { asar = require('@electron/asar'); } catch { /* not installed standalone */ }
if (asar && asarSize) {
  const sizes = {};
  for (const entry of asar.listPackage(asarFile)) {
    const rel = entry.replace(/^[\\/]/, '');
    let st;
    try { st = asar.statFile(asarFile, rel); } catch { continue; }
    if (!st || !st.size) continue;
    const n = rel.replace(/\\/g, '/');
    const m = n.match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
    const key = m ? `node_modules/${m[1]}` : n.split('/')[0];
    sizes[key] = (sizes[key] || 0) + Number(st.size);
  }
  console.log('\nBiggest entries in app.asar:');
  Object.entries(sizes).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${mb(v)}  ${k}`));
}
