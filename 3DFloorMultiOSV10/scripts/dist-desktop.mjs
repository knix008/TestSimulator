import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const stagingDir = path.join(os.tmpdir(), `fp3d-installers-${process.pid}`);

const target = (process.argv[2] || 'auto').toLowerCase();

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`);
  const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    throw new Error(`Failed: ${cmd} ${args.join(' ')}`);
  }
}

function copyArtifacts() {
  fs.mkdirSync(releaseDir, { recursive: true });
  const entries = fs.readdirSync(stagingDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (entry.name.endsWith('.blockmap') || entry.name.endsWith('.yml') || entry.name === 'builder-debug.yml') {
      continue;
    }
    const from = path.join(stagingDir, entry.name);
    const to = path.join(releaseDir, entry.name);
    fs.copyFileSync(from, to);
    console.log(`Copied ${entry.name} -> release/`);
  }
}

function builderArgsFor(targetName) {
  switch (targetName) {
    case 'win':
      return ['--win', 'nsis', 'portable'];
    case 'mac':
      return ['--mac', 'dmg', 'zip'];
    case 'linux':
      // AppImage/deb need Linux (or symlink privileges). tar.gz works cross-host.
      if (process.platform === 'linux') return ['--linux', 'AppImage', 'deb', 'tar.gz'];
      return ['--linux', 'tar.gz'];
    case 'auto':
      if (process.platform === 'win32') return ['--win', 'nsis', 'portable'];
      if (process.platform === 'darwin') return ['--mac', 'dmg', 'zip'];
      return ['--linux', 'AppImage', 'deb', 'tar.gz'];
    default:
      throw new Error(`Unknown target: ${targetName}`);
  }
}

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

run('npm', ['run', 'icons']);
run('npm', ['run', 'build']);

const args = [
  'electron-builder',
  ...builderArgsFor(target),
  `--config.directories.output=${stagingDir}`,
];
run('npx', args);
copyArtifacts();

console.log(`\nDesktop package(s) ready in ${releaseDir}`);
