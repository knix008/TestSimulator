// Copies MyHeatManager's numerical engine (heat-core, pure Rust) into engine/heat-core, so the
// MyHeatManager heat study node runs inside MySimulator with nothing else installed (web too).
//   node scripts/vendor-heat-core.mjs [path to MyHeatManagerMuiltiOSV10]
// The copy is not edited by hand: run this again after MyHeatManager changes its engine.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.resolve(process.argv[2] ?? path.join(root, '..', 'MyHeatManagerMuiltiOSV10'), 'engine', 'heat-core');
const target = path.join(root, 'engine', 'heat-core');

fs.rmSync(path.join(target, 'src'), { recursive: true, force: true });
fs.mkdirSync(path.join(target, 'src'), { recursive: true });
let files = 0;
for (const name of fs.readdirSync(path.join(source, 'src'))) {
  if (!name.endsWith('.rs')) continue;
  fs.copyFileSync(path.join(source, 'src', name), path.join(target, 'src', name));
  files++;
}
// Cargo.toml without its [profile.*] sections (only the root package's profiles apply).
const toml = fs.readFileSync(path.join(source, 'Cargo.toml'), 'utf8');
const kept = toml.split(/\r?\n(?=\[)/).filter((section) => !/^\s*(#.*\n)*\s*\[profile\./.test(section) && !section.startsWith('[profile.')).join('\n');
fs.writeFileSync(path.join(target, 'Cargo.toml'), `# Copied from MyHeatManager (engine/heat-core) by scripts/vendor-heat-core.mjs. Do not edit.\n${kept.replace(/\n# The physics tests are numerically heavy; keep debug\/test builds optimised\.\s*$/, '\n')}`);
fs.writeFileSync(path.join(target, 'README.md'), 'MyHeatManager\'s numerical engine, copied by `scripts/vendor-heat-core.mjs` (do not edit here).\n');
console.log(`vendored heat-core: ${files} source files from ${source}`);
