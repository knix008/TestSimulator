/**
 * copy-installer.js — electron-builder 산출물을 프로젝트 루트로 복사
 *
 * electron-builder afterAllArtifactBuild 훅 또는
 *   node scripts/copy-installer.js
 * 로 실행합니다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ICON_PATH = path.join(ROOT, 'assets', 'icon.ico');
const RCEDIT_BIN = path.join(ROOT, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

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

function applySetupIcon(exePath) {
  if (!exePath.toLowerCase().endsWith('.exe')) return;
  if (!fs.existsSync(ICON_PATH)) {
    console.warn('[copy-installer] Icon not found:', ICON_PATH);
    return;
  }
  if (!fs.existsSync(RCEDIT_BIN)) {
    console.warn('[copy-installer] rcedit not found:', RCEDIT_BIN);
    return;
  }
  execFileSync(RCEDIT_BIN, [exePath, '--set-icon', ICON_PATH], { stdio: 'inherit' });
  console.log(`[copy-installer] Applied icon to ${path.basename(exePath)}`);
}

function copyInstallers(files) {
  if (!files.length) {
    console.warn('[copy-installer] No installer files found in dist/.');
    return [];
  }

  const copied = [];
  for (const src of files) {
    applySetupIcon(src);
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
