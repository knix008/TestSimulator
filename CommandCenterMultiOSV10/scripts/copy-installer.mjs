// After `npm run build:win`, put the NSIS setup exe in the project root.
// The bundle stays under src-tauri/target (or CARGO_TARGET_DIR). The root
// copy is the file to hand out: Command Center_<version>_<arch>-setup.exe.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function nsisDirs() {
  const dirs = [path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')];
  if (process.env.CARGO_TARGET_DIR) {
    dirs.push(path.join(process.env.CARGO_TARGET_DIR, 'release', 'bundle', 'nsis'));
  }
  return dirs;
}

const newest = new Map();
for (const dir of nsisDirs()) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('-setup.exe')) continue;
    const full = path.join(dir, name);
    const mtime = fs.statSync(full).mtimeMs;
    const prev = newest.get(name);
    if (!prev || mtime > prev.mtime) newest.set(name, { full, mtime });
  }
}

if (!newest.size) {
  console.error('[installer] No NSIS setup exe was found.');
  process.exit(1);
}

for (const [name, { full }] of newest) {
  const dest = path.join(root, name);
  fs.copyFileSync(full, dest);
  const size = fs.statSync(dest).size;
  console.log(`[installer] ${name} → ${root} (${size} bytes)`);
}
