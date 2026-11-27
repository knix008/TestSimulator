// Builds the Rust core for the web build: crates/hexwasm (hexcore + a JSON ABI) → public/hexcore.wasm.
// Needs the wasm32-unknown-unknown target (`rustup target add wasm32-unknown-unknown`). Skips the build
// when the .wasm is newer than every Rust source (pass --force to build anyway).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'public', 'hexcore.wasm');
const crates = path.join(root, 'crates');
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
  if (e.name === 'target') return t;
  const p = path.join(dir, e.name);
  return Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
}, 0);
if (!process.argv.includes('--force') && existsSync(out) && statSync(out).mtimeMs > newest(crates)) {
  console.log('[wasm] public/hexcore.wasm is up to date');
  process.exit(0);
}
console.log('[wasm] cargo build --release --target wasm32-unknown-unknown (crates/hexwasm)');
execFileSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: path.join(crates, 'hexwasm'), stdio: 'inherit' });
mkdirSync(path.dirname(out), { recursive: true });
copyFileSync(path.join(crates, 'hexwasm', 'target', 'wasm32-unknown-unknown', 'release', 'hexwasm.wasm'), out);
console.log(`[wasm] ${path.relative(root, out)} ${(statSync(out).size / 1024).toFixed(0)} KB`);
