/**
 * copy-installer.js — copy the installer a `build:*` just made to the project root.
 *
 *   node scripts/copy-installer.js nsis   (Windows .exe)
 *   node scripts/copy-installer.js dmg    (macOS .dmg)
 *   node scripts/copy-installer.js deb    (Linux .deb)
 *
 * Takes the newest file of that kind from src-tauri/target/release/bundle/<kind>/ and
 * replaces any older copy of the same name at the root (those are gitignored).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const EXT = { nsis: '.exe', msi: '.msi', dmg: '.dmg', deb: '.deb', rpm: '.rpm', appimage: '.AppImage' };

const kind = String(process.argv[2] || 'nsis').toLowerCase();
const ext = EXT[kind];
if (!ext) {
  console.error(`[copy-installer] unknown bundle kind "${kind}" (${Object.keys(EXT).join(', ')})`);
  process.exit(1);
}

const dir = path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', kind);
let files = [];
try {
  files = fs.readdirSync(dir)
    .filter((n) => n.endsWith(ext))
    .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
} catch { /* no bundle folder */ }
if (!files.length) {
  console.error(`[copy-installer] no ${ext} in ${path.relative(ROOT, dir)} — did the build succeed?`);
  process.exit(1);
}

const name = files[0].n;
const dest = path.join(ROOT, name);
fs.copyFileSync(path.join(dir, name), dest);
const mb = (fs.statSync(dest).size / 1048576).toFixed(1);
console.log(`[copy-installer] ${name} (${mb} MB) → project root`);
