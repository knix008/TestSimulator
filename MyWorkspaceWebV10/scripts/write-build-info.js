const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');

function tryGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return '';
  }
}

function resolveElectronVersion() {
  const pkg = require(path.join(repoRoot, 'package.json'));
  const fromPkg = pkg.devDependencies?.electron || '';
  const normalized = fromPkg.replace(/^[^\d]*/, '');
  if (normalized) {
    return normalized;
  }
  return process.versions.electron || '';
}

function writeBuildInfo() {
  const pkg = require(path.join(repoRoot, 'package.json'));
  const info = {
    version: pkg.version || '0.1.0',
    buildDate: new Date().toISOString(),
    commit: tryGit('rev-parse --short HEAD'),
    branch: tryGit('rev-parse --abbrev-ref HEAD'),
    builtOnPlatform: process.platform,
    builtOnArch: process.arch,
    electronVersion: resolveElectronVersion()
  };

  const outPath = path.join(repoRoot, 'config', 'build-info.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[write-build-info] ${outPath}`);
  return info;
}

if (require.main === module) {
  writeBuildInfo();
}

module.exports = { writeBuildInfo };
