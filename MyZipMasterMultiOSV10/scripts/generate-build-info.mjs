// Writes src/build-info.json for the About window.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safe = (cmd) => {
  try {
    return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const info = {
  productName: 'MyZipMaster',
  version: pkg.version,
  author: { name: 'SHKWON', email: 'knix008@naver.com' },
  license: pkg.license,
  buildTime: new Date().toISOString(),
  gitCommit: safe('git rev-parse --short HEAD'),
  gitBranch: safe('git rev-parse --abbrev-ref HEAD'),
  gitCommitCount: safe('git rev-list --count HEAD'),
  rustc: safe('rustc --version'),
  node: process.version,
  buildHost: `${os.platform()} ${os.arch()}`,
};
fs.writeFileSync(path.join(root, 'src', 'build-info.json'), JSON.stringify(info, null, 2));
console.log(`[build-info] v${info.version} ${info.gitCommit || 'no-git'}`);
