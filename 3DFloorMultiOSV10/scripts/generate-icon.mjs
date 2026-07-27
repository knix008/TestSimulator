/**
 * Sync the master app icon (assets/icon.png) into packaging / web locations.
 * Master: bright isometric 3D floor-plan icon at assets/icon.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'assets', 'icon.png');

const targets = [
  path.join(root, 'build', 'icon.png'),
  path.join(root, 'public', 'icon.png'),
  path.join(root, 'electron', 'icon.png'),
];

if (!fs.existsSync(source)) {
  console.error(`Missing master icon: ${source}`);
  process.exit(1);
}

const buf = fs.readFileSync(source);
if (buf.length < 100 || buf[0] !== 0x89 || buf[1] !== 0x50) {
  console.error(`Invalid PNG: ${source}`);
  process.exit(1);
}

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  console.log(`Wrote ${target}`);
}
