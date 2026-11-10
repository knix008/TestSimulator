// npm start — `tauri dev` on a free dev-server port. If another program (or another
// project's Vite) listens on 5530, the next port free on both 127.0.0.1 and ::1 is
// used instead; nothing is stopped. Vite starts first and tauri dev once the page answers.
//
// Several copies may run at once (MYPHOTOCUT_MULTI=1: the development build is not
// counted against an installed MyPhotoCut that is open).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(5530);
if (port !== 5530) console.log(`[start] 포트 5530 을 다른 프로그램이 쓰고 있어 ${port} 를 씁니다.`);

// 127.0.0.1 on both sides: Vite on 'localhost' may listen on ::1 only, and tauri dev would wait for IPv4.
const devUrl = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let tauri = null;
const stopVite = () => { try { vite.kill(); } catch { /* gone */ } };
vite.on('exit', (code) => {
  if (tauri) return;
  console.error(`[start] Vite 가 앱보다 먼저 끝났습니다 (exit ${code}).`);
  process.exit(code || 1);
});
process.on('exit', stopVite);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopVite(); process.exit(130); });

const deadline = Date.now() + 90000;
for (;;) {
  try { if ((await fetch(devUrl)).ok) break; } catch { /* not listening yet */ }
  if (Date.now() > deadline) { console.error(`[start] ${devUrl} 가 90초 안에 응답하지 않았습니다.`); stopVite(); process.exit(1); }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

// null removes tauri.conf.json's beforeDevCommand (--config is a JSON merge patch).
const config = { build: { devUrl, beforeDevCommand: null } };
tauri = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(config), ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, MYPHOTOCUT_MULTI: '1' },
});
tauri.on('exit', (code) => { stopVite(); process.exit(code ?? 0); });
