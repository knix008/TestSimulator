/**
 * copy-installer.js — electron-builder 산출물을 프로젝트 루트로 복사
 *
 * electron-builder afterAllArtifactBuild 훅 또는
 *   node scripts/copy-installer.js
 * 로 실행합니다.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const INSTALLER_EXTS = new Set(['.exe', '.dmg', '.appimage']);

function isInstallerFile(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.appimage')) return true;
  const ext = path.extname(lower);
  if (!INSTALLER_EXTS.has(ext)) return false;
  if (ext === '.exe') return /^mykanban-setup-/i.test(name);
  return true;
}

function findInstallersInDist() {
  if (!fs.existsSync(DIST)) return [];
  return fs.readdirSync(DIST)
    .filter(isInstallerFile)
    .map((name) => path.join(DIST, name));
}

function copyInstallers(files) {
  if (!files.length) {
    console.warn('[copy-installer] No installer files found in dist/.');
    return [];
  }

  const copied = [];
  for (const src of files) {
    const base = path.basename(src);
    const dest = path.join(ROOT, base);
    fs.copyFileSync(src, dest);
    copied.push(dest);
    console.log(`[copy-installer] Copied to project root: ${base}`);
  }
  return copied;
}

async function afterAllArtifactBuild(context) {
  const files = (context?.artifactPaths || []).filter((p) => isInstallerFile(path.basename(p)));
  copyInstallers(files.length ? files : findInstallersInDist());
}

module.exports = afterAllArtifactBuild;
module.exports.default = afterAllArtifactBuild;

if (require.main === module) {
  afterAllArtifactBuild({ artifactPaths: findInstallersInDist() }).catch((err) => {
    console.error('[copy-installer] Failed:', err.message);
    process.exit(1);
  });
}
