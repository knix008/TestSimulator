// Copies the newest NSIS setup produced by `tauri build` to the project root.
import { readdirSync, copyFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')];
if (process.env.CARGO_TARGET_DIR) {
  dirs.push(path.join(path.resolve(process.env.CARGO_TARGET_DIR), 'release', 'bundle', 'nsis'));
}

const found = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('-setup.exe')) continue;
    const file = path.join(dir, name);
    found.push({ file, name, mtime: statSync(file).mtimeMs });
  }
}

if (!found.length) {
  console.error('[installer] No NSIS setup was found to copy.');
  process.exit(1);
}

found.sort((a, b) => b.mtime - a.mtime);
const newest = found[0];
const dest = path.join(root, newest.name);
copyFileSync(newest.file, dest);
console.log(`[installer] ${newest.name} → ${dest}`);
