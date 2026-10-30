// `npm start`      the desktop app in development: `tauri dev` with the Vite
//                  dev server on a free port (live reload; the Rust shell runs
//                  the core from the source tree, so core edits show on the
//                  next start).
// `npm run dev`    the web version in development: the API server and Vite on
//                  free ports, Vite proxying /api to it.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './free-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
const web = process.argv.includes('--web');
const rest = process.argv.slice(2).filter((a) => a !== '--web');

const children = [];
const run = (args, env = {}) => {
  const child = spawn(node, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  children.push(child);
  child.on('exit', (code) => { for (const c of children) if (c !== child && !c.killed) c.kill(); process.exit(code ?? 0); });
  return child;
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const c of children) if (!c.killed) c.kill(); process.exit(0); });

const port = await freePort(5187);
if (web) {
  const api = await freePort(5188, [port]);
  console.log(`[dev] web UI http://127.0.0.1:${port}/ → API http://127.0.0.1:${api}/`);
  run([path.join(root, 'server', 'server.js'), '--port', String(api), '--no-open']);
  run([path.join(root, 'scripts', 'tauri-before-dev.mjs'), String(port)], { MFC_API_PORT: String(api) });
} else {
  console.log(`[dev] Vite dev server http://127.0.0.1:${port}/`);
  const config = JSON.stringify({ build: { devUrl: `http://127.0.0.1:${port}`, beforeDevCommand: `node scripts/tauri-before-dev.mjs ${port}` } });
  run([path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', config, ...rest]);
}
