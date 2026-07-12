/**
 * patch-electron-icon.js
 *
 * Windows caches taskbar icons by AppUserModelID + shortcut.
 * An installed Start Menu shortcut with the same AUMID as npm start
 * forces the OLD install icon onto the taskbar.
 *
 * This script:
 *   1. Hashes src/assets/icon.ico
 *   2. Copies electron.exe → ImageViewer-<hash>.exe (cache-bust name)
 *   3. Embeds the ICO via rcedit
 *   4. Also refreshes any installed "Image Viewer.exe" + Start Menu .lnk
 *   5. Removes stale ImageViewer*.exe copies
 *
 * start-dev.js launches the hashed exe.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const FORCE = process.argv.includes('--force');

function iconHash(iconPath) {
  const buf = fs.readFileSync(iconPath);
  return crypto.createHash('md5').update(buf).digest('hex').slice(0, 10);
}

function cleanupOldBranded(distDir, keepName) {
  for (const name of fs.readdirSync(distDir)) {
    if (!/^ImageViewer.*\.exe$/i.test(name)) continue;
    if (name === keepName) continue;
    try {
      fs.unlinkSync(path.join(distDir, name));
      console.log(`[patch-electron-icon] Removed stale ${name}`);
    } catch (err) {
      console.warn(`[patch-electron-icon] Could not remove ${name}: ${err.message}`);
    }
  }
}

function getRceditBin(projectRoot) {
  return path.join(projectRoot, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
}

function applyIconToExe(rceditBin, exePath, iconPath, versionStrings = {}) {
  if (!fs.existsSync(rceditBin)) {
    throw new Error(`rcedit not found: ${rceditBin}`);
  }
  const args = [exePath, '--set-icon', iconPath];
  for (const [k, v] of Object.entries(versionStrings)) {
    args.push('--set-version-string', k, v);
  }
  execFileSync(rceditBin, args, { stdio: 'inherit' });
}

/** Update installed app + Start Menu shortcut so they match the latest icon. */
function refreshInstalledAppIcon(projectRoot, iconPath) {
  const localApp = process.env.LOCALAPPDATA;
  if (!localApp) return;

  const installDir = path.join(localApp, 'Programs', 'Image Viewer');
  const installedExe = path.join(installDir, 'Image Viewer.exe');
  if (!fs.existsSync(installedExe)) return;

  const rceditBin = getRceditBin(projectRoot);
  try {
    const installedIco = path.join(installDir, 'app-icon.ico');
    fs.copyFileSync(iconPath, installedIco);

    applyIconToExe(rceditBin, installedExe, iconPath, {
      ProductName: 'Image Viewer',
      FileDescription: 'Image Viewer',
    });
    console.log(`[patch-electron-icon] Updated installed exe icon: ${installedExe}`);

    const lnk = path.join(
      process.env.APPDATA || '',
      'Microsoft', 'Windows', 'Start Menu', 'Programs',
      'Image Tools', 'Image Viewer.lnk'
    );
    if (fs.existsSync(lnk)) {
      const ps = `
        $sh = New-Object -ComObject WScript.Shell
        $l = $sh.CreateShortcut(${JSON.stringify(lnk)})
        $l.IconLocation = ${JSON.stringify(installedIco + ',0')}
        $l.Save()
        Write-Output "lnk-updated"
      `;
      execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit', windowsHide: true });
      console.log('[patch-electron-icon] Updated Start Menu shortcut icon');
    }
  } catch (err) {
    console.warn(`[patch-electron-icon] Could not refresh installed icon: ${err.message}`);
    console.warn('  Close the installed Image Viewer if it is running, then: npm run patch:icon');
  }

  try {
    const ie4 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe');
    if (fs.existsSync(ie4)) {
      execFileSync(ie4, ['-show'], { stdio: 'ignore', windowsHide: true });
    }
  } catch {}
}

async function patch() {
  if (process.platform !== 'win32') {
    return { skipped: true, reason: 'not-windows' };
  }

  const projectRoot = path.join(__dirname, '..');
  const iconPath = path.join(projectRoot, 'src', 'assets', 'icon.ico');
  const distDir = path.join(projectRoot, 'node_modules', 'electron', 'dist');
  const electronExe = path.join(distDir, 'electron.exe');
  const stampPath = path.join(distDir, '.icon-patched');

  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icon not found: ${iconPath}`);
  }
  if (!fs.existsSync(electronExe)) {
    throw new Error(`electron.exe not found: ${electronExe}`);
  }

  const hash = iconHash(iconPath);
  const brandedName = `ImageViewer-${hash}.exe`;
  const brandedExe = path.join(distDir, brandedName);

  const iconStat = fs.statSync(iconPath);
  const electronStat = fs.statSync(electronExe);
  const stampPayload = JSON.stringify({
    hash,
    branded: brandedName,
    iconMtime: iconStat.mtimeMs,
    iconSize: iconStat.size,
    electronMtime: electronStat.mtimeMs,
    electronSize: electronStat.size,
  });

  if (
    !FORCE &&
    fs.existsSync(brandedExe) &&
    fs.existsSync(stampPath) &&
    fs.readFileSync(stampPath, 'utf8') === stampPayload
  ) {
    cleanupOldBranded(distDir, brandedName);
    refreshInstalledAppIcon(projectRoot, iconPath);
    console.log(`[patch-electron-icon] ${brandedName} already up to date`);
    return { exe: brandedExe, hash, skipped: true };
  }

  const tmpExe = path.join(distDir, `ImageViewer-build-${process.pid}.exe`);
  try { fs.unlinkSync(tmpExe); } catch {}
  fs.copyFileSync(electronExe, tmpExe);

  const rceditBin = getRceditBin(projectRoot);
  try {
    applyIconToExe(rceditBin, tmpExe, iconPath, {
      ProductName: 'Image Viewer',
      FileDescription: 'Image Viewer',
      CompanyName: 'SHKWON',
      InternalName: 'ImageViewer',
      OriginalFilename: brandedName,
      LegalCopyright: 'Copyright © 2024–2026 SHKWON',
    });
  } catch (err) {
    try { fs.unlinkSync(tmpExe); } catch {}
    throw new Error(
      `rcedit failed: ${err.message}\n` +
      '  Close any running Image Viewer / Electron windows and retry.'
    );
  }

  try {
    if (fs.existsSync(brandedExe)) fs.unlinkSync(brandedExe);
    fs.renameSync(tmpExe, brandedExe);
  } catch (err) {
    fs.copyFileSync(tmpExe, brandedExe);
    try { fs.unlinkSync(tmpExe); } catch {}
  }

  fs.writeFileSync(stampPath, stampPayload, 'utf8');
  cleanupOldBranded(distDir, brandedName);
  refreshInstalledAppIcon(projectRoot, iconPath);
  console.log(`[patch-electron-icon] Built ${brandedName} with src/assets/icon.ico`);
  return { exe: brandedExe, hash, skipped: false };
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
      process.exitCode = 0;
    });
}

module.exports = { patch };
