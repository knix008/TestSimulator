import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const electronDir = join(rootDir, 'node_modules', 'electron');
const installScript = join(electronDir, 'install.js');
const packageJson = join(electronDir, 'package.json');
const pathFile = join(electronDir, 'path.txt');
const distDir = join(electronDir, 'dist');
const versionFile = join(distDir, 'version');

function getPlatformExecutable() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Electron builds are not available on platform: ${process.platform}`);
  }
}

function readElectronVersion() {
  if (!existsSync(packageJson)) return null;
  return JSON.parse(readFileSync(packageJson, 'utf8')).version;
}

function isElectronReady() {
  const version = readElectronVersion();
  if (!version || !existsSync(pathFile) || !existsSync(versionFile)) return false;

  const executablePath = readFileSync(pathFile, 'utf8');
  const installedVersion = readFileSync(versionFile, 'utf8').replace(/^v/, '').trim();

  return (
    executablePath === getPlatformExecutable() &&
    installedVersion === version &&
    existsSync(join(distDir, executablePath))
  );
}

if (isElectronReady()) {
  process.exit(0);
}

if (!existsSync(installScript)) {
  console.error('Electron package is missing. Run npm install and try again.');
  process.exit(1);
}

console.log('Electron artifacts are missing. Running electron/install.js...');
const result = spawnSync(process.execPath, [installScript], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '' },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!isElectronReady()) {
  console.error('Electron artifacts were not created correctly.');
  process.exit(1);
}
