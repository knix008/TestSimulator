/**
 * start-dev.js — launch the Electron app for development.
 *
 * Strips ELECTRON_RUN_AS_NODE from the environment (IDE terminals often set it, which makes
 * Electron start as plain Node) and forwards extra arguments (a file or folder to open).
 */
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, ['.', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code == null ? 1 : code));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (!child.killed) child.kill(sig); });
