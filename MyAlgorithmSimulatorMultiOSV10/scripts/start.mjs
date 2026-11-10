// npm start — the dev server on a free port, then `tauri dev`. If something else
// already listens on 5490, the next free port is used; nothing is stopped.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(5490);
if (port !== 5490) console.log(`[start] 포트 5490 을 다른 프로그램이 쓰고 있어 ${port} 를 씁니다.`);

const devUrl = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let tauri = null;
const stopVite = () => { try { vite.kill(); } catch { /* already gone */ } };
vite.on('exit', (code) => { if (!tauri) process.exit(code || 1); });
process.on('exit', stopVite);

const deadline = Date.now() + 90000;
for (;;) {
  try { if ((await fetch(devUrl)).ok) break; } catch { /* not listening yet */ }
  if (Date.now() > deadline) { console.error(`[start] ${devUrl} 가 90초 안에 응답하지 않았습니다.`); stopVite(); process.exit(1); }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

const config = { build: { devUrl, beforeDevCommand: null } };
tauri = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(config)], {
  cwd: root, stdio: 'inherit',
});
tauri.on('exit', (code) => { stopVite(); process.exit(code ?? 0); });
