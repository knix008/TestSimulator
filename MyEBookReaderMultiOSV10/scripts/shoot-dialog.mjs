// Screenshots one dialog window, for looking at a layout that has gone wrong.
//
//   node scripts/shoot-dialog.mjs settings out.png [tab-index]
//
// It starts the app the way `npm run smoke` does, opens the named dialog from
// the toolbar, waits for it to settle and captures that window — not the main
// one — so what lands in the file is exactly what the reader would see.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const [name = 'settings', out = 'dialog.png', tab = '0'] = process.argv.slice(2);
const electron = require('electron');
const env = { ...process.env, EBK_SHOOT: `${name}|${path.resolve(out)}|${tab}` };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.'], { cwd: root, stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error('[shoot] Could not start Electron:', err.message);
  process.exit(1);
});
