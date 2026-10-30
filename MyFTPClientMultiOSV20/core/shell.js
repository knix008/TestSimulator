// Desktop-only helpers the Tauri host hands to the core: open a file with its
// default application, and show a file or folder in the OS file manager
// ("탐색기에서 열기"). The web host has neither — the files are on the server.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function launch(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false, ...options });
    } catch (err) { reject(err); return; }
    child.once('error', reject);
    // The launcher hands off and keeps running (or exits with a meaningless code:
    // explorer.exe returns 1). Spawning without an error is success.
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function checkExists(p) {
  if (!p || !fs.existsSync(p)) {
    const err = new Error(`No such file or folder: ${p}`);
    err.code = 'ENOENT';
    err.path = p;
    throw err;
  }
}

// The command that opens / reveals `p` on `platform`, without running it (tests).
function commandFor(action, p, platform = process.platform, isDir = false) {
  if (platform === 'win32') {
    if (action === 'reveal' && !isDir) return { command: 'explorer.exe', args: [`/select,"${p}"`], options: { windowsVerbatimArguments: true } };
    return { command: 'explorer.exe', args: [`"${p}"`], options: { windowsVerbatimArguments: true } };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: action === 'reveal' && !isDir ? ['-R', p] : [p], options: {} };
  }
  return { command: 'xdg-open', args: [action === 'reveal' && !isDir ? path.dirname(p) : p], options: {} };
}

async function openPath(p) {
  checkExists(p);
  const { command, args, options } = commandFor('open', p);
  await launch(command, args, options);
  return '';
}

// A folder opens in the file manager; a file is shown selected in its folder.
async function revealPath(p) {
  checkExists(p);
  let isDir = false;
  try { isDir = fs.statSync(p).isDirectory(); } catch { /* treat as file */ }
  const { command, args, options } = commandFor('reveal', p, process.platform, isDir);
  await launch(command, args, options);
}

module.exports = { openPath, revealPath, commandFor };
