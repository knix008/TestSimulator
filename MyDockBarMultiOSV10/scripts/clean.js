'use strict';

/**
 * `npm run clean` - delete build output.
 *
 * Removes: src-tauri/target (the Rust build, several GB), src-tauri/gen, the
 * Electron build's old dist/ folder, and installers copied to the project
 * root. Keeps: node_modules, the sources, and build/ (the generated artwork,
 * which `npm run icons` redraws anyway). `--dry-run` only lists.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-n');

const DIRS = ['src-tauri/target', 'src-tauri/gen', 'dist', 'out'];
const INSTALLERS = [/^MyDockBar-.*\.(exe|dmg|AppImage|deb|rpm|zip|blockmap)$/i];

function size(at) {
  let total = 0;
  const stack = [at];
  while (stack.length) {
    const next = stack.pop();
    let stat;
    try { stat = fs.lstatSync(next); } catch { continue; }
    if (stat.isDirectory()) for (const name of fs.readdirSync(next)) stack.push(path.join(next, name));
    else total += stat.size;
  }
  return total;
}

const human = (b) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(1)}GB`
  : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`);

const targets = DIRS.filter((rel) => fs.existsSync(path.join(ROOT, rel)));
for (const name of fs.readdirSync(ROOT)) {
  if (INSTALLERS.some((re) => re.test(name))) targets.push(name);
}

if (!targets.length) {
  console.log('Nothing to clean.');
} else {
  let freed = 0;
  for (const rel of targets) {
    const at = path.join(ROOT, rel);
    if (!at.startsWith(ROOT + path.sep)) throw new Error(`outside the project: ${rel}`);
    const bytes = size(at);
    freed += bytes;
    if (!dryRun) fs.rmSync(at, { recursive: true, force: true });
    console.log(`  ${dryRun ? '-' : 'x'} ${rel} ${human(bytes)}`);
  }
  console.log(`${targets.length} item(s), ${human(freed)}${dryRun ? ' (dry run, nothing deleted)' : ' freed'}`);
}
