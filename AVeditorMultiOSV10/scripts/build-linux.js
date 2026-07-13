'use strict';
/**
 * Cross-platform Linux packaging helper.
 *
 * - Windows/macOS host: produces tar.gz (AppImage/deb need a Linux host or Docker)
 * - Linux host: AppImage + deb + tar.gz
 *
 * Usage: node scripts/build-linux.js
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function main() {
  run('node', [path.join('scripts', 'generate-icons.js')]);

  const targets = process.platform === 'linux'
    ? ['AppImage', 'deb', 'tar.gz']
    : ['tar.gz'];

  if (process.platform !== 'linux') {
    console.log('[build:linux] Host is not Linux — building tar.gz only.');
    console.log('[build:linux] AppImage/deb require a Linux machine or Docker (electronuserland/builder).');
  }

  run('npx', ['electron-builder', '--linux', ...targets]);
  run('node', [path.join('scripts', 'copy-artifacts-to-root.js')]);
}

main();
