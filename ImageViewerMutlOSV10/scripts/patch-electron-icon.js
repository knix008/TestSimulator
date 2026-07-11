/**
 * patch-electron-icon.js
 *
 * Windows caches icons by executable *name*. Patching electron.exe often has no
 * visible effect on the taskbar. This script:
 *   1. Copies electron.exe → ImageViewer.exe
 *   2. Embeds src/assets/icon.ico into ImageViewer.exe via rcedit
 *   3. Leaves a stamp so we skip work when already current
 *
 * start-dev.js launches ImageViewer.exe instead of electron.exe.
 */
const fs = require('fs');
const path = require('path');

const FORCE = process.argv.includes('--force');

async function patch() {
  if (process.platform !== 'win32') {
    return { skipped: true, reason: 'not-windows' };
  }

  const projectRoot = path.join(__dirname, '..');
  const iconPath = path.join(projectRoot, 'src', 'assets', 'icon.ico');
  const distDir = path.join(projectRoot, 'node_modules', 'electron', 'dist');
  const electronExe = path.join(distDir, 'electron.exe');
  const brandedExe = path.join(distDir, 'ImageViewer.exe');
  const stampPath = path.join(distDir, '.icon-patched');

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icon not found: ${iconPath}`);
  }
  if (!fs.existsSync(electronExe)) {
    throw new Error(`electron.exe not found: ${electronExe}`);
  }

  const iconStat = fs.statSync(iconPath);
  const electronStat = fs.statSync(electronExe);
  const stampPayload = JSON.stringify({
    iconMtime: iconStat.mtimeMs,
    iconSize: iconStat.size,
    electronMtime: electronStat.mtimeMs,
    electronSize: electronStat.size,
    branded: 'ImageViewer.exe',
  });

  if (
    !FORCE &&
    fs.existsSync(brandedExe) &&
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, 'utf8') === stampPayload
  ) {
    console.log('[patch-electron-icon] ImageViewer.exe already up to date');
    return { exe: brandedExe, skipped: true };
  }

  const mod = require('rcedit');
  const rceditFn = typeof mod === 'function' ? mod : mod.rcedit;
  if (typeof rceditFn !== 'function') {
    throw new Error('rcedit API not found — run: npm install -D rcedit');
  }

  // Copy fresh electron.exe → ImageViewer.exe (overwrite)
  fs.copyFileSync(electronExe, brandedExe);

  try {
    await rceditFn(brandedExe, {
      icon: iconPath,
      'version-string': {
        ProductName: 'Image Viewer',
        FileDescription: 'Image Viewer',
        CompanyName: 'SHKWON',
        InternalName: 'ImageViewer',
        OriginalFilename: 'ImageViewer.exe',
        LegalCopyright: 'Copyright © 2024–2026 SHKWON',
      },
    });
  } catch (err) {
    try { fs.unlinkSync(brandedExe); } catch {}
    throw new Error(
      `rcedit failed: ${err.message}\n` +
      '  Close any running Image Viewer / Electron windows and retry.'
    );
  }

  fs.writeFileSync(stampPath, stampPayload, 'utf8');
  console.log('[patch-electron-icon] Built ImageViewer.exe with src/assets/icon.ico');
  return { exe: brandedExe, skipped: false };
}

if (require.main === module) {
  patch()
    .then((r) => {
      if (r.skipped && r.reason === 'not-windows') {
        console.log('[patch-electron-icon] Skipping (Windows only)');
      }
    })
    .catch((err) => {
      console.warn(`[patch-electron-icon] ${err.message}`);
      process.exitCode = 0; // don't block npm start hard; start-dev will fall back
    });
}

module.exports = { patch };
