// npm run build:wasm — compiles the Rust solver core to WebAssembly for the web build:
//   crates/sim-wasm (cargo, target wasm32-unknown-unknown) → wasm-bindgen → src/sim/pkg/
// Needs the wasm32 target (`rustup target add wasm32-unknown-unknown`) and the wasm-bindgen CLI
// of the same version as the crate (`cargo install wasm-bindgen-cli --version 0.2.128`).
//   --if-missing   only when src/sim/pkg/ is not there yet (npm start, npm run dev)
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(root, 'src', 'sim', 'pkg', 'sim_wasm_bg.wasm');
const crate = path.join(root, 'crates', 'sim-wasm');
const wasm = path.join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'sim_wasm.wasm');

// Newest source change of the solver (both crates): rebuild when it is newer than the package.
const newest = (dir) => {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'target') continue;
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
};

if (process.argv.includes('--if-missing') && existsSync(pkg) && statSync(pkg).mtimeMs >= newest(path.join(root, 'crates'))) process.exit(0);

const run = (cmd, args, cwd) => {
  console.log(`[wasm] ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`[wasm] ${cmd} failed (exit ${r.status}).`); process.exit(r.status || 1); }
};

run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], crate);
run('wasm-bindgen', ['--target', 'web', '--no-typescript', '--out-dir', path.join(root, 'src', 'sim', 'pkg'), wasm], root);
console.log(`[wasm] ${path.relative(root, pkg)} (${(statSync(pkg).size / 1024 / 1024).toFixed(2)} MB)`);
