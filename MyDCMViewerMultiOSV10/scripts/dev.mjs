// npm start — the desktop app in development: stage the bundled samples, then `tauri dev`
// (which starts scripts/dev-server.mjs and builds src-tauri in debug mode).
// Extra arguments go to the app: npm start -- C:\images\CT.dcm
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const node = process.execPath;
spawnSync(node, [path.join(ROOT, 'scripts', 'stage-samples.mjs')], { stdio: 'inherit', cwd: ROOT });
const cli = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const extra = process.argv.slice(2);
const args = [cli, 'dev', ...(extra.length ? ['--', '--', ...extra] : [])];
const child = spawn(node, args, { stdio: 'inherit', cwd: ROOT, env: process.env });
child.on('close', (code) => process.exit(code == null ? 1 : code));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (!child.killed) child.kill(sig); });
