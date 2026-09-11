// Launch Electron with a clean environment.
//
// If ELECTRON_RUN_AS_NODE is set in the shell (some tooling exports it
// globally), the electron binary runs as plain Node: `require('electron')`
// returns a path string instead of the API, and the app dies with
// "Cannot read properties of undefined (reading 'isPackaged')" — or, worse,
// starts without ever opening a window. Strip it before spawning.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

if (typeof electronBinary !== 'string') {
  console.error('[dbtools] could not resolve the electron binary path');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});

child.on('error', (err) => {
  console.error('[dbtools] failed to start electron:', err.message);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
