// Removes everything a build produces, leaving sources and node_modules alone:
//
//   dist/                 renderer bundle           (npm run build)
//   build/icons/          generated platform icons  (npm run generate:icons)
//   src/build-info.json   build stamp               (npm run generate:build-info)
//
//   npm run clean          — the above
//   npm run clean -- --all — also node_modules/ and src-tauri/target/
//                            (then `npm install` again; the next start recompiles Rust)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = process.argv.includes('--all');

const targets = ['dist', path.join('build', 'icons'), path.join('src', 'build-info.json')];
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
