/** copy-dist.js — copy the installers electron-builder produced in dist/ to the project root. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(DIST)) process.exit(0);
const wanted = /^DCMViewer.*\.(exe|msi|dmg|pkg|AppImage|deb|rpm)$/i;
for (const name of fs.readdirSync(DIST)) {
  if (!wanted.test(name) || /blockmap|unpacked/i.test(name)) continue;
  fs.copyFileSync(path.join(DIST, name), path.join(ROOT, name));
  console.log(`copied ${name}`);
}
