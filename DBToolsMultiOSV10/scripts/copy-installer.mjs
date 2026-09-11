// Copy the installers electron-builder produced in release/ up to the project
// root, so the finished artifact sits next to the source instead of buried in
// a nested output directory.
//
// Run automatically by `npm run build:win` / `build:mac` / `build:linux`, or on
// its own with `npm run copy:installer`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');

/** Installer bundles, not the loose unpacked trees or update metadata. */
const INSTALLER_PATTERN = /\.(exe|msi|dmg|pkg|AppImage|deb|rpm|snap|zip)$/i;

function collectInstallers(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      // `*-unpacked` and `mac*` hold the raw app tree, not a distributable.
      if (name.endsWith('-unpacked') || name.startsWith('mac')) continue;
      collectInstallers(full, out);
      continue;
    }
    if (INSTALLER_PATTERN.test(name) && !name.endsWith('.blockmap')) out.push(full);
  }
  return out;
}

const installers = collectInstallers(releaseDir);

if (installers.length === 0) {
  console.warn('[dbtools] no installer found in release/ — nothing to copy.');
  console.warn('[dbtools] run `npm run build:win` (or build:mac / build:linux) first.');
  process.exit(0);
}

for (const source of installers) {
  const destination = path.join(root, path.basename(source));
  fs.copyFileSync(source, destination);
  const size = (fs.statSync(destination).size / (1024 * 1024)).toFixed(1);
  console.log(`[dbtools] copied ${path.basename(destination)} (${size} MB) -> project root`);
}
