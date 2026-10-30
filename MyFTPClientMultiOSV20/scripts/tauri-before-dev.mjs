// Starts the Vite dev server for `tauri dev` (and `npm run dev`) on the port
// scripts/dev.mjs found free. Resolved from this file so it works whether the
// Tauri CLI's working directory is the project root or src-tauri.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const port = process.argv[2] || '5187';
const steps = ['sync-public-svgs.mjs', 'generate-build-info.mjs'];
// tauri-build wants the bundled resources to exist; a debug build runs the source tree.
if (!fs.existsSync(path.join(root, 'src-tauri', 'runtime', 'server', 'server.js'))) steps.push('stage-runtime.mjs');
for (const script of steps) {
  const r = spawnSync(node, [path.join(root, 'scripts', script)], { cwd: root, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(node, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { child.kill(); process.exit(0); });
