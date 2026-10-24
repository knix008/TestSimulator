// Build the MyHeatManager engine for the web: engine/heat-wasm → public/heat.wasm
// Usage: node engine/build-wasm.mjs   (needs Rust with the wasm32-unknown-unknown target)
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const crate = join(here, 'heat-wasm');
const root = dirname(here);

const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], {
  cwd: crate,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) {
  console.error('cargo build failed' + (r.error ? `: ${r.error.message}` : ''));
  process.exit(r.status || 1);
}

const src = join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'heat_wasm.wasm');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });
const dst = join(outDir, 'heat.wasm');
copyFileSync(src, dst);
console.log(`heat.wasm → ${dst} (${(statSync(dst).size / 1024).toFixed(0)} KiB)`);
