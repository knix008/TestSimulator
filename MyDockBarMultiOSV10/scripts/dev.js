'use strict';

/**
 * `npm start` / `npm run dev` - run the dock from the source tree (tauri dev).
 *
 * Tauri serves src/ from a small static server, on port 1430 unless told
 * otherwise. Other projects on the same machine use that port too, so a free
 * one is found and passed along. Anything after `--` goes to tauri dev.
 */

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function freePort(from) {
  for (let port = from; port < from + 200; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error(`no free port in ${from}-${from + 199}`);
}

async function main() {
  const port = await freePort(1490);
  console.log(`MyDockBar dev server: http://127.0.0.1:${port}`);
  const cli = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const env = { ...process.env };
  // An editor terminal can hand this down, and it makes Electron-era tooling
  // misbehave; nothing here wants it.
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, [cli, 'dev', '--port', String(port), ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit',
    env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
