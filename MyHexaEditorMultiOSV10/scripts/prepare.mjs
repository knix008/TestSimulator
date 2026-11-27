// Makes the generated files the app needs but git does not keep (they are rebuilt from the sources):
//   public/hexcore.wasm  ← crates/mdwasm (the Rust core as WebAssembly; skipped when newer than every Rust source)
//   public/doc/         ← doc/*.md and the tutorial (user's guide and tutorial HTML; made when missing, or with --docs)
// Run by npm run dev / build:web / start / test (scripts/test.mjs) — a fresh clone or `npm run clean` needs nothing else.
//
// Usage: node scripts/prepare.mjs [--docs]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (script) => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run('build-wasm.mjs');
if (process.argv.includes('--docs') || !existsSync(path.join(root, 'public', 'doc', 'UsersGuide.html'))) run('build-docs.mjs');
