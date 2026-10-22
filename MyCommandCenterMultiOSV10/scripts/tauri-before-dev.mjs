// Starts the Vite dev server for `tauri dev`. Resolved from this file so it
// works whether the Tauri CLI's working directory is the project root or src-tauri.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
for (const script of ['free-port.mjs', 'sync-public-svgs.mjs', 'generate-build-info.mjs']) {
  const ports = script.startsWith('free-port') ? ['5185', '5186'] : [null];
  for (const port of ports) {
    const args = [path.join(root, 'scripts', script)];
    if (port) args.push(port);
    const r = spawnSync(node, args, { cwd: root, stdio: 'inherit' });
    if (r.status) process.exit(r.status);
  }
}
// Vite proxies /api to 5186. A page open on the dev server (the browser, or the
// window before the shell's own core is up) otherwise logs a proxy error on every poll.
const api = spawn(node, [path.join(root, 'server', 'server.js'), '--port', '5186', '--host', '127.0.0.1', '--no-open'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CC_NO_OPEN: '1' },
});
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(node, [vite, '--host', '127.0.0.1', '--port', '5185', '--strictPort'], { cwd: root, stdio: 'inherit' });
let shuttingDown = false;
const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!api.killed) api.kill();
  if (!child.killed) child.kill();
  process.exit(code ?? 0);
};
child.on('exit', (code) => shutdown(code ?? 0));
api.on('exit', (code) => { if (!shuttingDown) shutdown(code ?? 1); });
