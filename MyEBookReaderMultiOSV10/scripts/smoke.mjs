// Runs the GUI smoke test: the built app, in a real Electron window.
//
// The checks themselves live in electron/smoke.js, which main.js loads when
// EBK_SMOKE=1. This script only makes sure there is something to run — a built
// renderer and the sample books — and reports the exit code.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function run(script, args = []) {
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], { cwd: root, stdio: 'inherit' });
}

if (!fs.existsSync(path.join(root, 'samples', 'sample.epub'))) {
  run('make-samples.mjs');
}

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.log('[smoke] dist/ is missing — building the renderer first.');
  execFileSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
    cwd: root,
    stdio: 'inherit',
  });
}

const electron = require('electron');
const env = { ...process.env, EBK_SMOKE: '1' };
// Presence-based: some machines set this globally, and it makes Electron behave
// like plain Node, so `app` would be undefined.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env });

child.on('close', (code) => {
  console.log(code === 0 ? '[smoke] All checks passed.' : `[smoke] Failed (exit ${code}).`);
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('[smoke] Could not start Electron:', err.message);
  process.exit(1);
});
