// `npm run build:all`: the web build, plus the installers this operating system can make.
// Tauri does not cross-compile installers, so macOS and Linux packages are built on those systems.
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const desktop = { win32: 'build:win', darwin: 'build:mac', linux: 'build:linux' }[process.platform];
for (const script of ['build:web', desktop]) {
  const r = spawnSync(npm, ['run', script], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
