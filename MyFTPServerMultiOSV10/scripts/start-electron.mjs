// Launches Electron with a clean environment.
//
// Some machines set ELECTRON_RUN_AS_NODE=1 globally (it makes Electron behave
// like plain Node, so `require('electron')` returns a path string instead of
// the API and `app` is undefined). The variable is presence-based, so it must
// be deleted — not merely emptied — before spawning Electron.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron'); // resolves to the electron.exe path

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('close', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[start-electron] Failed to launch Electron:', err.message);
  process.exit(1);
});
