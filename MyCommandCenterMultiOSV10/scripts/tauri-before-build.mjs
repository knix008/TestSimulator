// `tauri build` frontend step. Same path rule as tauri-before-dev.mjs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
for (const script of ['sync-public-svgs.mjs', 'generate-build-info.mjs', 'stage-runtime.mjs']) {
  const r = spawnSync(node, [path.join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const r = spawnSync(node, [vite, 'build'], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
