// Removes build and test leftovers.
//
//   node scripts/clean.mjs        → dist/, test-results/, root logs and installers
//   node scripts/clean.mjs all    → also release/, Rust target/gen, vendored public assets, node_modules/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] ?? '';
if (arg && arg !== 'all') {
  console.error(`알 수 없는 대상: ${arg} (없음 | all)`);
  process.exit(1);
}
const all = arg === 'all';

const removed = [];

function rm(rel) {
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
  removed.push(rel.replace(/\\/g, '/'));
}

function rmMatching(dirRel, pattern) {
  const dir = path.join(root, dirRel);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!pattern.test(name)) continue;
    const rel = path.join(dirRel, name);
    fs.rmSync(path.join(root, rel), { recursive: true, force: true });
    removed.push(rel.replace(/\\/g, '/'));
  }
}

// Always: Vite output, test runs, stray logs and installers at the project root.
rm('dist');
rm('test-results');
rmMatching('.', /^MyPhotoManager-.*\.(exe|msi|dmg|deb|rpm|AppImage|zip)$/i);
rmMatching('.', /.*\.log$/i);

if (all) {
  rm('release');
  rm(path.join('src-tauri', 'target'));
  rm(path.join('src-tauri', 'gen'));
  rm(path.join('public', 'models'));
  rm(path.join('public', 'vendor'));
  rm(path.join('public', 'doc', 'img'));
  rm('node_modules');
}

if (removed.length) {
  console.log(`${all ? 'clean:all' : 'clean'}: ${removed.length}개 지움`);
  for (const item of removed) console.log(`  - ${item}`);
} else {
  console.log(`${all ? 'clean:all' : 'clean'}: 지울 것 없음`);
}
