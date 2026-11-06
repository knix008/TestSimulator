// Copies the finished installers to the project root.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'target', 'release', 'bundle');
let copied = 0;
for (const kind of ['nsis', 'dmg', 'appimage', 'deb']) {
  const dir = path.join(bundle, kind);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(exe|dmg|AppImage|deb)$/.test(name)) continue;
    fs.copyFileSync(path.join(dir, name), path.join(root, name));
    console.log(`installer  ${name}`);
    copied++;
  }
}
if (!copied) console.log('no installer found');
