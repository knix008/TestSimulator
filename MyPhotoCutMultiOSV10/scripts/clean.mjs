// Removes what builds and test runs produce, leaving sources alone:
//
//   dist/               web bundle                 (npm run build:web / build:*)
//   release/            collected installers       (npm run build:win / mac / linux / all)
//   src-tauri/gen/      Tauri generated schemas    (any tauri build)
//   test-results/       test run output            (npm test)
//
//   npm run clean      — the above
//   npm run clean:all  — also node_modules/, public/mediapipe/ (face model, made by
//                        npm install) and src-tauri/target/ (Rust build, several GB);
//                        run `npm install` again afterwards, the next start recompiles Rust
//
// Installers copied to the project root (MyPhotoCut-Setup-*.exe and so on) are kept.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

const targets = ['dist', 'release', path.join('src-tauri', 'gen'), 'test-results'];
if (all) targets.push(path.join('public', 'mediapipe'), path.join('src-tauri', 'target'), 'node_modules');

let removed = 0;
for (const rel of targets) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  try {
    fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[clean] removed ${rel}`);
    removed += 1;
  } catch (err) {
    console.error(`[clean] could not remove ${rel}: ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(removed ? `[clean] ${removed} item(s) removed.` : '[clean] Nothing to remove.');
