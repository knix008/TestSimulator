// After `npm run build:win`, put the NSIS setup exe in the project root.
// The bundle stays under src-tauri/target (or CARGO_TARGET_DIR). The root
// copy is the file to hand out: MyCommandCenter_<version>_<arch>-setup.exe.
// Only the installer of the version being built (tauri.conf.json) is copied, and any
// other *-setup.exe in the root (an older version or name) is removed, so the root
// always holds exactly one installer. Older files left in the bundle folder are ignored.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const prefix = `${conf.productName}_${conf.version}_`;
const isSetup = (name) => name.toLowerCase().endsWith('-setup.exe');

function nsisDirs() {
  const dirs = [path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')];
  if (process.env.CARGO_TARGET_DIR) {
    dirs.push(path.join(process.env.CARGO_TARGET_DIR, 'release', 'bundle', 'nsis'));
  }
  return dirs;
}

let newest = null;
for (const dir of nsisDirs()) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    if (!isSetup(name) || !name.startsWith(prefix)) continue;
    const full = path.join(dir, name);
    const mtime = fs.statSync(full).mtimeMs;
    if (!newest || mtime > newest.mtime) newest = { name, full, mtime };
  }
}

if (!newest) {
  console.error(`[installer] No NSIS setup exe for ${prefix}*-setup.exe was found.`);
  process.exit(1);
}

for (const name of fs.readdirSync(root)) {
  if (isSetup(name) && name !== newest.name) {
    fs.rmSync(path.join(root, name), { force: true });
    console.log(`[installer] removed the older ${name} from ${root}`);
  }
}

const dest = path.join(root, newest.name);
fs.copyFileSync(newest.full, dest);
console.log(`[installer] ${newest.name} → ${root} (${fs.statSync(dest).size} bytes)`);
