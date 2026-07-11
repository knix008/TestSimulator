/**
 * copy-dist.js — electron-builder 설치 산출물을 프로젝트 루트로 복사
 *
 * electron-builder afterAllArtifactBuild 훅 또는
 *   node scripts/copy-dist.js [win|mac|linux]
 * 로 실행합니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

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
  // Skip nested helpers (e.g. elevate.exe under win-unpacked)
  if (ext === '.exe' && /elevate/i.test(name)) return false;
  return true;
}

function findInstallersInDist() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST, { withFileTypes: true })
    .filter((e) => e.isFile() && isInstallerFile(e.name))
    .map((e) => path.join(DIST, e.name));
}

function copyInstallers(files) {
  if (!files.length) {
    console.warn('[copy-dist] No installer files found in dist/.');
    return [];
  }

  const copied = [];
  for (const src of files) {
    const base = path.basename(src);
    const dest = path.join(ROOT, base);
    fs.copyFileSync(src, dest);
    copied.push(dest);
    console.log(`[copy-dist] Copied to project root: ${base}`);
  }
  console.log(`[copy-dist] Copied ${copied.length} file(s) to project root.`);
  return copied;
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
