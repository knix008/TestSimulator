// Removes everything a build produces, leaving sources and node_modules alone:
//
//   dist/                 renderer bundle           (npm run build)
//   release/              packaged app + installers (npm run build:<os>)
//   build/icons/          generated platform icons  (npm run generate:icons)
//   src/build-info.json   build stamp               (npm run generate:build-info)
//   .smoke/               smoke-test output         (npm run smoke)
//   *.exe *.dmg *.AppImage *.deb *.rpm *.snap *.zip *.blockmap in the root
//                         installers copied by scripts/copy-installer.js
//
//   npm run clean          — the above
//   npm run clean -- --all — also node_modules/ (then `npm install` again)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

const targets = ['dist', 'release', path.join('build', 'icons'), path.join('src', 'build-info.json'), '.smoke'];
if (all) targets.push('node_modules');

const installerExt = /\.(exe|dmg|AppImage|deb|rpm|snap|zip|blockmap)$/i;
for (const name of fs.readdirSync(root)) {
  if (installerExt.test(name) && fs.statSync(path.join(root, name)).isFile()) targets.push(name);
}

let removed = 0;
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[clean] removed ${rel}`);
    removed += 1;
  } catch (err) {
    console.error(`[clean] could not remove ${rel}: ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(removed ? `[clean] ${removed} item(s) removed.` : '[clean] Nothing to remove.');
