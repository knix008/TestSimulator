// Launches Electron with a clean environment.
//
// Some machines set ELECTRON_RUN_AS_NODE=1 globally (it makes Electron behave
// like plain Node, so `require('electron')` returns a path string instead of
// the API and `app` is undefined). The variable is presence-based, so it must
// be deleted — not merely emptied — before spawning Electron.
//
// In development (ELECTRON_DEV=1, `npm start`) Vite hot-reloads the UI, but
// the main process — core/ and electron/ — only changes when Electron is
// started again. So in that mode this script watches those folders and
// relaunches Electron when a file in them changes; otherwise an edit to the
// terminal backend, the IPC bridge or the preload script looks like it has no
// effect until the next `npm start`.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron'); // resolves to the electron.exe path
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = ['.', ...process.argv.slice(2)];
const dev = env.ELECTRON_DEV === '1' && !process.argv.some((a) => a.startsWith('--smoke-'));

let child = null;
let restarting = false;

function launch() {
  child = spawn(electronPath, args, { stdio: 'inherit', env });
  child.on('close', (code) => {
    if (restarting) { restarting = false; launch(); return; }
    process.exit(code ?? 0);
  });
  child.on('error', (err) => {
    console.error('[start-electron] Failed to launch Electron:', err.message);
    process.exit(1);
  });
}

function watchMainProcess() {
  let timer = null;
  const onChange = (dir) => (_event, file) => {
    if (!file || !/\.(js|cjs|mjs|json)$/.test(String(file))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`[start-electron] ${dir}/${String(file).replace(/\\/g, '/')} changed — restarting Electron`);
      restarting = true;
      try { child.kill(); } catch { /* already gone */ }
    }, 300);
  };
  for (const dir of ['core', 'electron']) {
    try { fs.watch(path.join(root, dir), { recursive: true }, onChange(dir)); } catch { /* recursive watch unsupported: skip */ }
  }
}

launch();
if (dev) watchMainProcess();
