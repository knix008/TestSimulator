/**
 * Copies electron-builder installer artifacts from release/ to the project root.
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const installerExt = /\.(exe|dmg|AppImage|deb|rpm|zip|snap)$/i;

if (!fs.existsSync(releaseDir)) {
  console.warn('[copy-installer] release/ not found — nothing to copy.');
  process.exit(0);
}

let copied = 0;
for (const name of fs.readdirSync(releaseDir)) {
  if (!installerExt.test(name)) continue;
  const src = path.join(releaseDir, name);
  if (!fs.statSync(src).isFile()) continue;
  fs.copyFileSync(src, path.join(rootDir, name));
  console.log(`[copy-installer] Copied: ${name}`);
  copied++;
}

console.log(copied
  ? `[copy-installer] Copied ${copied} installer file(s) to project root.`
  : '[copy-installer] No installer files found to copy.');
