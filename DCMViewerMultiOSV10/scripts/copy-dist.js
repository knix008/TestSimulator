/** copy-dist.js — copy one installer from dist/ to the project root (Setup.exe, not portable). */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(DIST)) process.exit(0);

const names = fs.readdirSync(DIST).filter((name) => !/blockmap|unpacked/i.test(name));
const pickers = [
  (n) => /^DCMViewer-Setup-.*\.exe$/i.test(n),
  (n) => /^DCMViewer.*\.dmg$/i.test(n),
  (n) => /^DCMViewer.*\.pkg$/i.test(n),
  (n) => /^DCMViewer.*\.msi$/i.test(n),
  (n) => /^DCMViewer.*\.deb$/i.test(n),
  (n) => /^DCMViewer.*\.rpm$/i.test(n)
];

let chosen = null;
for (const pick of pickers) {
  chosen = names.find(pick);
  if (chosen) break;
}
if (!chosen) process.exit(0);

fs.copyFileSync(path.join(DIST, chosen), path.join(ROOT, chosen));
console.log(`copied ${chosen}`);
