// Runs the Electron UI smoke test and prints its result.
//
//   npm run smoke
//
// Launches Electron with .smoke/electron-smoke.js as the app entry point (not
// as an argument to the real app), waits for it to write .smoke/result.json,
// and reports pass/fail.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const entry = path.join(root, '.smoke', 'electron-smoke.js');
const resultFile = path.join(root, '.smoke', 'result.json');

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ not built. Run: npm run build');
  process.exit(1);
}

fs.rmSync(resultFile, { force: true });

const electronPath = require('electron');
// Some machines set ELECTRON_RUN_AS_NODE globally, which makes Electron behave
// like plain Node — `app` would be undefined. It is presence-based, so delete it.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [entry], { stdio: 'inherit', env, cwd: root });
// The run drives every view at two window widths against a 47K-line project,
// so it takes minutes, not seconds.
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 420_000);
const timer = setTimeout(() => {
  console.error('[smoke] timed out after ' + Math.round(TIMEOUT_MS / 1000) + 's');
  child.kill();
}, TIMEOUT_MS);

child.on('close', () => {
  clearTimeout(timer);
  if (!fs.existsSync(resultFile)) {
    console.error('[smoke] no result written — the renderer never reported back.');
    process.exit(1);
  }

  const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
});
