// npm run clean: removes what building made, so the next build starts fresh.
// npm run clean:all also removes node_modules. `--dry` only says what would go.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');

const targets = [
  'dist', 'dist-web', 'target', 'test-results',
  'src/engine', 'src/build-info.json',
  'src-tauri/gen', 'src-tauri/resources/sfx',
];
if (all) targets.push('node_modules');

// Installers copied to the project root.
for (const name of fs.readdirSync(root)) {
  if (/\.(exe|dmg|AppImage|deb)$/.test(name)) targets.push(name);
}

let removed = 0;
for (const rel of targets) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) continue;
  console.log(`${dry ? 'would remove' : 'remove'}  ${rel}`);
  removed += 1;
  if (!dry) fs.rmSync(full, { recursive: true, force: true });
}
console.log(removed ? `${dry ? 'Would remove' : 'Removed'} ${removed} item(s).` : 'Nothing to clean.');
