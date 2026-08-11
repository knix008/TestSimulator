'use strict';

/**
 * Clean Windows installer build:
 * - release file locks
 * - ensure rcedit cache
 * - skip code-sign discovery warnings
 * - fail the process on any non-zero child exit
 */
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function buildEnv() {
  const env = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  };
  // Cursor/npm injects unknown npm_config_devdir → warning noise
  delete env.npm_config_devdir;
  delete env.NPM_CONFIG_DEVDIR;
  return env;
}

function run(label, command, args) {
  console.log(`[build-win] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: buildEnv(),
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.status !== 0) {
    console.error(`[build-win] failed: ${label} (exit ${result.status ?? 1})`);
    process.exit(result.status ?? 1);
  }
}

run('prepare', process.execPath, [path.join('scripts', 'prepare-win-build.js')]);
run('ensure-wincodesign', process.execPath, [path.join('scripts', 'ensure-wincodesign.js')]);
run('electron-builder', process.execPath, [
  path.join('scripts', 'run-electron-builder-win.js')
]);
run('copy-installer', process.execPath, [path.join('scripts', 'copy-installer-to-root.js')]);
console.log('[build-win] done');
