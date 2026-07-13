'use strict';
// Launches Electron with ELECTRON_RUN_AS_NODE removed from the environment.
// This is necessary when running from inside Claude Code or other Electron-based
// environments where ELECTRON_RUN_AS_NODE=1 is inherited.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Ensure window/taskbar icons exist for development runs
const iconPng = path.join(__dirname, '..', 'assets', 'icons', 'icon.png');
const iconIco = path.join(__dirname, '..', 'assets', 'icons', 'icon.ico');
if (!fs.existsSync(iconPng) || !fs.existsSync(iconIco)) {
  console.log('[start] Generating app icons…');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'generate-icons.js')], {
    stdio: 'inherit',
    env,
  });
  if (result.status !== 0) {
    console.warn('[start] Icon generation failed — Electron default icon may be used.');
  }
}

// Whisper STT: sync browser build beside index.html (file:// cannot load CDN modules)
{
  const sync = spawnSync(process.execPath, [path.join(__dirname, 'sync-transformers-vendor.js')], {
    stdio: 'inherit',
    env,
  });
  if (sync.status !== 0) {
    console.warn('[start] Transformers vendor sync failed — subtitle generation may not work.');
  }
}

// resolve path to the electron binary installed in node_modules
let electronBin;
try {
  electronBin = require('electron');
} catch {
  electronBin = path.join(__dirname, '..', 'node_modules', '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron');
}

const args = [path.join(__dirname, '..'), ...process.argv.slice(2)];
const child = spawn(String(electronBin), args, { env, stdio: 'inherit', shell: false });
child.on('exit', (code) => process.exit(code ?? 0));
