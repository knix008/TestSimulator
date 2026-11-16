// Removes build and test leftovers.
//
//   node scripts/clean.mjs        → dist/, test-results/, root logs
//   node scripts/clean.mjs all    → also build products (release/, root installers),
//                                   Rust target/gen, vendored public assets, node_modules/
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

/** Installers and web zips that build.mjs writes to release/ and the project root. */
const BUILD_PRODUCT = /^MyPhotoManager-.*\.(exe|msi|dmg|deb|rpm|AppImage|zip)$/i;

// Always: Vite output, test runs, stray logs.
rm('dist');
rm('test-results');
rmMatching('.', /.*\.log$/i);

if (all) {
  // Build products from npm run build:* (release/ + copies at the project root).
  rm('release');
  rmMatching('.', BUILD_PRODUCT);
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
