import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function tryGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolveElectronVersion(pkg) {
  const fromPkg = pkg.devDependencies?.electron ?? '';
  const normalized = fromPkg.replace(/^[^\d]*/, '');
  return normalized || process.versions.electron || '';
}

export function writeBuildInfo() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const info = {
    version: pkg.version || '0.1.0',
    buildDate: new Date().toISOString(),
    commit: tryGit('rev-parse --short HEAD'),
    branch: tryGit('rev-parse --abbrev-ref HEAD'),
    builtOnPlatform: process.platform,
    builtOnArch: process.arch,
    electronVersion: resolveElectronVersion(pkg),
  };

  const outPath = path.join(repoRoot, 'config', 'build-info.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(info, null, 2)}\n`);
  console.log(`[write-build-info] ${outPath}`);
  return info;
}

const isDirectRun =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  writeBuildInfo();
}
