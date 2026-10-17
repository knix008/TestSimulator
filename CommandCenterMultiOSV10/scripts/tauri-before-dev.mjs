// Starts the Vite dev server for `tauri dev`. Resolved from this file so it
// works whether the Tauri CLI's working directory is the project root or src-tauri.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
for (const script of ['free-port.mjs', 'sync-public-svgs.mjs', 'generate-build-info.mjs']) {
  const args = [path.join(root, 'scripts', script)];
  if (script.startsWith('free-port')) args.push('5185');
  const r = spawnSync(node, args, { cwd: root, stdio: 'inherit' });
  if (r.status) process.exit(r.status);
}
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(node, [vite, '--port', '5185', '--strictPort'], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
