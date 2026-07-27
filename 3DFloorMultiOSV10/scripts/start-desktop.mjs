/**
 * Start Vite + Electron for desktop development.
 * Picks a free port when 5173 is busy, and points Electron at that URL.
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const preferredPort = Number(process.env.PORT) || 5173;

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findPort(start) {
  for (let port = start; port < start + 40; port += 1) {
    // Check both IPv4 and typical dual-stack bind cases
    const freeV4 = await isPortFree(port, '127.0.0.1');
    if (!freeV4) continue;
    return port;
  }
  throw new Error(`No free port found from ${start}`);
}

function waitForUrl(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.ok || res.status === 404) {
          resolve();
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

const port = await findPort(preferredPort);
const url = `http://127.0.0.1:${port}/`;
if (port !== preferredPort) {
  console.log(`Port ${preferredPort} is busy — using ${port} instead.`);
}

const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: root, stdio: 'inherit', shell: true, env: process.env },
);

let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill('SIGTERM');
  if (vite && !vite.killed) vite.kill('SIGTERM');
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

try {
  await waitForUrl(url);
  electron = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['electron', '.'],
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: url,
      },
    },
  );
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (err) {
  console.error(err.message || err);
  shutdown(1);
}
