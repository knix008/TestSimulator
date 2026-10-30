// Removes everything that a build reproduces:
//   dist/ release/ build/icons/ public/icon.svg src/build-info.json .smoke/
//   and the installers copied to the project root.
// `--all` also removes node_modules/ (then `npm install` again).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const all = process.argv.includes('--all');

const targets = ['dist', 'release', path.join('build', 'icons'), path.join('public', 'icon.svg'), path.join('src', 'build-info.json'), '.smoke', '.icons-preview.png', '.npm-install.log'];
if (all) targets.push('node_modules');
for (const name of fs.readdirSync(root)) {
  if (/\.(exe|dmg|AppImage|deb|rpm|snap|blockmap)$/i.test(name)) targets.push(name);
}

let removed = 0;
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  fs.rmSync(p, { recursive: true, force: true });
  console.log(`[clean] removed ${rel}`);
  removed++;
}
console.log(removed ? `[clean] ${removed} item(s) removed.` : '[clean] nothing to remove.');
