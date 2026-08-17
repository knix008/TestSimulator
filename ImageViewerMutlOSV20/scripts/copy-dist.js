/**
 * copy-dist.js — 현재 버전 설치 파일 하나만 프로젝트 루트로 복사
 *
 * electron-builder afterAllArtifactBuild 훅 또는
 *   node scripts/copy-dist.js [win|mac|linux]
 * 로 실행합니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const VERSION = require('../package.json').version;

const INSTALLER_EXTS = new Set([
  '.exe', '.msi',
  '.dmg', '.pkg',
  '.appimage', '.deb', '.rpm',
]);

function isInstallerFile(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.appimage')) return true;
  const ext = path.extname(lower);
  if (!INSTALLER_EXTS.has(ext)) return false;
  if (ext === '.exe' && /elevate|unpacked|blockmap/i.test(name)) return false;
  return /^ImageViewer/i.test(name);
}

function findInstallersInDist() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isFile() && isInstallerFile(e.name))
    .map((e) => path.join(DIST, e.name));
}

function pickFinalInstaller(files) {
  const current = files.filter((p) => path.basename(p).includes(VERSION));
  const pool = current.length ? current : files;
  if (!pool.length) return [];

  const rank = (p) => {
    const n = path.basename(p).toLowerCase();
    if (n.includes('setup')) return 0;
    if (n.endsWith('.dmg') || n.endsWith('.pkg')) return 1;
    if (n.endsWith('.appimage') || n.endsWith('.deb')) return 2;
    if (n.includes('portable')) return 9;
    return 5;
  };
  pool.sort((a, b) => rank(a) - rank(b) || path.basename(a).localeCompare(path.basename(b)));
  return [pool[0]];
}

function removeStaleRootCopies(keepName) {
  if (!fs.existsSync(ROOT)) return;
  for (const name of fs.readdirSync(ROOT)) {
    if (!isInstallerFile(name) || name === keepName) continue;
    fs.unlinkSync(path.join(ROOT, name));
    console.log(`[copy-dist] Removed stale: ${name}`);
  }
}

function copyInstallers(files) {
  const chosen = pickFinalInstaller(files);
  if (!chosen.length) {
    console.warn('[copy-dist] No installer files found in dist/.');
    return [];
  }

  const src = chosen[0];
  const base = path.basename(src);
  const dest = path.join(ROOT, base);
  fs.copyFileSync(src, dest);
  removeStaleRootCopies(base);
  console.log(`[copy-dist] Copied to project root: ${base}`);
  return [dest];
}

async function afterAllArtifactBuild(context) {
  const fromContext = (context?.artifactPaths || [])
    .filter((p) => isInstallerFile(path.basename(p)));
  copyInstallers(fromContext.length ? fromContext : findInstallersInDist());
}

module.exports = afterAllArtifactBuild;
module.exports.default = afterAllArtifactBuild;

if (require.main === module) {
  const platform = (process.argv[2] || '').toLowerCase();
  let files = findInstallersInDist();
  if (platform === 'win') {
    files = files.filter((p) => /\.(exe|msi)$/i.test(p));
  } else if (platform === 'mac') {
    files = files.filter((p) => /\.(dmg|pkg)$/i.test(p));
  } else if (platform === 'linux') {
    files = files.filter((p) => /\.(appimage|deb|rpm)$/i.test(p));
  }
  try {
    copyInstallers(files);
  } catch (err) {
    console.error('[copy-dist] Failed:', err.message);
    process.exit(1);
  }
}
