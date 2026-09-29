// Installs the dependencies when node_modules/ is missing or incomplete.
//
// Every entry point that needs the toolchain (`prebuild:win` / `:mac` /
// `:linux`, `prebuild`, `prestart`, `predev`, `preweb`, `pretest`) runs this
// first, so `npm run build:win` works on a fresh clone without the user having
// to remember `npm install`.
//
// It deliberately uses nothing but Node built-ins: at the moment it runs there
// may be no node_modules/ at all.
//
// Usage: node scripts/ensure-deps.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(rootDir, 'node_modules');

// `npm install` runs this package's own postinstall; if that ever leads back
// here, stop rather than install in a loop.
if (process.env.MYPDFVIEWER_INSTALLING === '1') process.exit(0);

const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });

// An interrupted install (Ctrl+C, full disk) leaves node_modules/ behind with
// packages missing, so check each declared package instead of just the folder.
const absent = existsSync(modulesDir)
  ? declared.filter((name) => !existsSync(join(modulesDir, ...name.split('/'))))
  : declared;

if (!absent.length) process.exit(0);

const shown = absent.slice(0, 3).join(', ') + (absent.length > 3 ? ', ...' : '');
console.log(existsSync(modulesDir)
  ? `[ensure-deps] ${absent.length} package(s) missing (${shown}) - running npm install ...`
  : '[ensure-deps] node_modules/ not found - running npm install ...');

// Prefer the npm that started this script (npm_execpath) and run it through the
// current Node binary: that avoids depending on npm/npm.cmd being on PATH and
// on shell quoting rules, which differ on Windows.
const env = { ...process.env, MYPDFVIEWER_INSTALLING: '1' };
const npmExec = process.env.npm_execpath;
const result = npmExec
  ? spawnSync(process.execPath, [npmExec, 'install'], { cwd: rootDir, stdio: 'inherit', env })
  : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install'],
      { cwd: rootDir, stdio: 'inherit', env, shell: process.platform === 'win32' });

if (result.error) {
  console.error(`[ensure-deps] Could not start npm: ${result.error.message}`);
  console.error('[ensure-deps] Run "npm install" manually and try again.');
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[ensure-deps] npm install failed - run it manually and try again.');
  process.exit(result.status ?? 1);
}
console.log('[ensure-deps] Dependencies installed.');
