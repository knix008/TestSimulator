// npm start — `tauri dev` on a free dev-server port (5230 or the next port
// free on both 127.0.0.1 and ::1; nothing another program runs is reused or
// stopped). Vite starts here first and tauri dev only once the page answers.
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freeDevPort } from './dev-port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort(5230);
if (port !== 5230) console.log(`[start] Port 5230 is in use by another program; using ${port}.`);

execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-icons.mjs'), '--if-needed'], { cwd: root, stdio: 'inherit' });

// 127.0.0.1 on both sides: Vite on 'localhost' may listen on ::1 only.
const devUrl = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let tauri = null;
const stopVite = () => { try { vite.kill(); } catch { /* gone */ } };
vite.on('exit', (code) => {
  if (tauri) return;
  console.error(`[start] Vite stopped before the app started (exit ${code}).`);
  process.exit(code || 1);
});
process.on('exit', stopVite);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stopVite(); process.exit(130); });

const deadline = Date.now() + 60000;
for (;;) {
  try { if ((await fetch(devUrl)).ok) break; } catch { /* not listening yet */ }
  if (Date.now() > deadline) {
    console.error(`[start] Vite did not answer on ${devUrl} within 60 s.`);
    stopVite();
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
}

// null removes tauri.conf.json's beforeDevCommand (--config is a JSON merge patch).
const config = { build: { devUrl, beforeDevCommand: null } };
tauri = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(config), ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, MSM_DEV_PORT: String(port) },
});
tauri.on('exit', (code) => { stopVite(); process.exit(code ?? 0); });
