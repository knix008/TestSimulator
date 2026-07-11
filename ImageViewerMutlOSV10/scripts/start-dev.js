/**
 * start-dev.js — launch desktop app with branded ImageViewer.exe (Windows)
 * so the taskbar / Alt-Tab icon is the app icon, not Electron's default.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function main() {
  const projectRoot = path.join(__dirname, '..');
  const args = process.argv.slice(2);
  if (!args.length) args.push('.');

  let exe = null;

  if (process.platform === 'win32') {
    try {
      const { patch } = require('./patch-electron-icon');
      const result = await patch();
      if (result && result.exe && fs.existsSync(result.exe)) {
        exe = result.exe;
      }
    } catch (err) {
      console.warn('[start-dev]', err.message);
    }
  }

  if (!exe) {
    // Fallback: stock electron package entry
    exe = require('electron');
  }

  console.log(`[start-dev] ${path.basename(exe)}`);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(exe, args, {
    stdio: 'inherit',
    windowsHide: false,
    cwd: projectRoot,
    env,
  });

  const forward = (signal) => {
    process.on(signal, () => {
      if (!child.killed) child.kill(signal);
    });
  };
  forward('SIGINT');
  forward('SIGTERM');

  child.on('close', (code, signal) => {
    if (code === null) {
      console.error(exe, 'exited with signal', signal);
      process.exit(1);
    }
    process.exit(code);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
