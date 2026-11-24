// npm run clean      build output: dist/, src-tauri/target/, src-tauri/gen/, the
//                    document copies in public/doc/, test scratch folders
// npm run clean:all  all of that, plus node_modules/ and the installers copied to
//                    the project root (npm install brings node_modules back)
//
// Only paths inside the project are touched, each named here; nothing is found by
// pattern outside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

const targets = [
  'dist',
  'src-tauri/target',
  'src-tauri/gen',
  'public/doc/images',
  '.web-test',
  'shots',
  'coverage',
  'node_modules/.vite',
];
// The documents copied from doc/ by build:docs (the viewer itself stays).
for (const name of fs.existsSync(path.join(root, 'public/doc')) ? fs.readdirSync(path.join(root, 'public/doc')) : []) {
  if (name.endsWith('.md')) targets.push(`public/doc/${name}`);
}
if (all) {
  targets.push('node_modules');
  // Installers the build scripts copied to the root (DBTools_<version>_…).
  for (const name of fs.readdirSync(root)) {
    if (/^DBTools_.*\.(exe|msi|dmg|deb|rpm|AppImage)$/i.test(name)) targets.push(name);
  }
}

let removed = 0;
for (const relative of targets) {
  const full = path.join(root, relative);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) continue;
  try {
    fs.rmSync(full, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[clean] removed ${relative}`);
    removed += 1;
  } catch (error) {
    console.error(`[clean] could not remove ${relative}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(removed ? `[clean] ${removed} item(s) removed.` : '[clean] nothing to remove.');
