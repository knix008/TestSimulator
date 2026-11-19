// Removes everything a build produces, leaving sources, samples and node_modules alone:
//
//   dist/                      web bundle                 (npm run build:web)
//   docs/, public/docs/        HTML documents from doc/   (npm run build:docs)
//   release/, ./MyNetManager-*  installers                 (npm run build:win / build:mac / build:linux)
//   test-results/              test reports and pictures  (npm test)
//   src-tauri/gen/             Tauri's generated schemas
//
//   npm run clean      — the above
//   npm run clean:all  — also node_modules/ and src-tauri/target/
//                        (then `npm install` again; the next build recompiles Rust)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

const targets = ['dist', 'docs', path.join('public', 'docs'), 'release', 'test-results', path.join('src-tauri', 'gen')];
// Installers copied to the project root by scripts/build.mjs.
for (const name of fs.readdirSync(root)) if (/^MyNetManager-.*\.(exe|msi|dmg|deb|rpm|AppImage)$/.test(name)) targets.push(name);
if (all) targets.push('node_modules', path.join('src-tauri', 'target'));

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
