'use strict';

/**
 * Reduce rcedit "Unable to commit changes" failures by releasing locks on
 * dist\win-unpacked\MyVideoPlayer.exe before electron-builder runs.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const unpacked = path.join(root, 'dist', 'win-unpacked');

function taskkill(imageName) {
  const result = spawnSync(
    'taskkill',
    ['/F', '/IM', imageName, '/T'],
    { encoding: 'utf8', windowsHide: true }
  );
  // 128 = process not found — ignore
  if (result.status === 0) {
    console.log(`[prepare-win-build] stopped ${imageName}`);
  }
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log(`[prepare-win-build] removed ${path.relative(root, dir)}`);
  } catch (err) {
    console.warn(`[prepare-win-build] could not remove ${dir}: ${err.message}`);
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (process.platform !== 'win32') {
  process.exit(0);
}

taskkill('MyVideoPlayer.exe');
// Dev runs of `electron .` can also lock packaging output if paths overlap.
taskkill('electron.exe');
sleep(400);
rmDir(unpacked);
console.log('[prepare-win-build] ready');
