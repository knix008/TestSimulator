const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const build = process.platform === 'win32'
  ? spawnSync('npm run build', { cwd: root, stdio: 'inherit', shell: true })
  : spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

if (build.error) {
  console.error(build.error.message);
  process.exit(1);
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// Close a previously running source-run window so the rebuilt UI is always loaded.
if (process.platform === 'win32') {
  spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name = 'electron.exe'\" | Where-Object { $_.CommandLine -like '*MyUMLMultiOSV10*' -or $_.CommandLine -like '*my-uml-multi-os*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    ],
    { stdio: 'ignore' }
  );
}

let electronPath;
try {
  electronPath = require('electron');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const appProcess = spawn(electronPath, ['.'], {
  cwd: root,
  detached: true,
  env: { ...process.env, MY_UML_SOURCE_RUN: '1' },
  stdio: 'ignore'
});

appProcess.unref();
