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