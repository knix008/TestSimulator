import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const stagingReleaseDir = path.join(root, 'release-build');
const electronDistDir = path.join(root, 'build', 'electron-dist', 'win32-x64');
const installerExts = new Set(['.exe', '.dmg', '.pkg', '.zip', '.AppImage', '.deb', '.rpm', '.snap']);

function run(command) {
  return spawnSync(command, {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  }).status ?? 1;
}

function runPowerShell(command) {
  return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: root,
    shell: false,
    stdio: 'inherit',
  }).status ?? 1;
}

function removeDir(pathToRemove) {
  fs.rmSync(pathToRemove, { recursive: true, force: true });
}

function getElectronVersion() {
  const electronPackagePath = path.join(root, 'node_modules', 'electron', 'package.json');
  const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath, 'utf8'));
  return electronPackage.version;
}

function ensureElectronDist() {
  const electronExe = path.join(electronDistDir, 'electron.exe');
  if (fs.existsSync(electronExe)) return;

  const electronVersion = getElectronVersion();
  const electronZip = path.join(
    process.env.LOCALAPPDATA ?? '',
    'electron',
    'Cache',
    `electron-v${electronVersion}-win32-x64.zip`
  );

  if (!fs.existsSync(electronZip)) {
    throw new Error(`Electron cache zip not found: ${electronZip}`);
  }

  fs.rmSync(electronDistDir, { recursive: true, force: true });
  fs.mkdirSync(electronDistDir, { recursive: true });

  const zip = electronZip.replace(/'/g, "''");
  const destination = electronDistDir.replace(/'/g, "''");
  const status = runPowerShell(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destination}' -Force`);
  if (status !== 0 || !fs.existsSync(electronExe)) {
    throw new Error(`Failed to prepare unpacked Electron distribution: ${electronDistDir}`);
  }
}

function isInstaller(fileName) {
  if (fileName.includes('blockmap')) return false;
  return installerExts.has(path.extname(fileName));
}

function copyInstallerArtifactsToRelease() {
  fs.mkdirSync(releaseDir, { recursive: true });
  const installers = fs.readdirSync(stagingReleaseDir).filter(isInstaller);

  if (installers.length === 0) {
    throw new Error(`No installer files were generated in ${stagingReleaseDir}`);
  }

  for (const installer of installers) {
    fs.copyFileSync(path.join(stagingReleaseDir, installer), path.join(releaseDir, installer));
  }
}

async function main() {
  removeDir(stagingReleaseDir);
  ensureElectronDist();

  let status = run('npm run build:electron');
  if (status !== 0) process.exit(status);

  status = run('npx electron-builder --win -c.electronDist=build/electron-dist/win32-x64 -c.directories.output=release-build');

  if (status !== 0) process.exit(status);

  copyInstallerArtifactsToRelease();

  process.exit(run('npm run copy:installers'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});