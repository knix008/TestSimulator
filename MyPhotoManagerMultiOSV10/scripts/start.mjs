// npm start — `tauri dev` on a port no other program is listening on.
//
// The preferred port is 1440 (tauri.conf.json → devUrl). When that port, or the
// next one, is already taken, the next free port is used and both Vite and
// Tauri are pointed at it. Nothing already running is stopped.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PREFERRED = 1440;
const ATTEMPTS = 100;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** True when nothing is listening on `port` (IPv4 and IPv6, when that family exists). */
function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', (error) => resolve(error.code !== 'EADDRINUSE'));
    server.listen({ port, host }, () => server.close(() => resolve(true)));
  });
}

export async function portFree(port) {
  return (await canBind(port, '127.0.0.1')) && (await canBind(port, '::1'));
}

/** The first port from `preferred` that is not in use. */
export async function choosePort(preferred = PREFERRED, attempts = ATTEMPTS) {
  for (let port = preferred; port < preferred + attempts; port++) {
    if (await portFree(port)) return port;
  }
  return null;
}

async function main() {
  const port = await choosePort();
  if (port == null) {
    console.error(`포트 ${PREFERRED}–${PREFERRED + ATTEMPTS - 1} 이 모두 사용 중입니다. 다른 프로그램을 끈 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  if (port !== PREFERRED) console.log(`포트 ${PREFERRED} 이 사용 중이라 ${port} 번에서 실행합니다.`);
  const child = spawn(process.execPath, [
    path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'dev',
    '--config', JSON.stringify({ build: { devUrl: `http://localhost:${port}` } }),
    ...process.argv.slice(2),
  ], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, MYPHOTO_DEV_PORT: String(port) },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
