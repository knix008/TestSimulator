// Writes src/build-info.json consumed by the About dialog.
// Captures version, build time, git commit and the toolchain versions.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function safe(cmd) {
  try {
    return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

const info = {
  name: pkg.name,
  productName: (pkg.build && pkg.build.productName) || pkg.name,
  version: pkg.version,
  author: pkg.author,
  license: pkg.license,
  buildTime: new Date().toISOString(),
  gitCommit: safe('git rev-parse --short HEAD'),
  gitBranch: safe('git rev-parse --abbrev-ref HEAD'),
  gitCommitCount: safe('git rev-list --count HEAD'),
  node: process.version,
  buildHost: `${os.platform()} ${os.arch()}`,
  electronBuilder: (pkg.devDependencies && pkg.devDependencies['electron-builder']) || '',
};

const out = path.join(root, 'src', 'build-info.json');
fs.writeFileSync(out, JSON.stringify(info, null, 2));
console.log(`[build-info] Wrote ${path.relative(root, out)} (v${info.version}, ${info.gitCommit || 'no-git'})`);
