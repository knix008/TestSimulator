/**
 * after-pack.js — embed app icon into Windows .exe without winCodeSign
 * (signAndEditExecutable: false avoids symlink privilege errors on Windows).
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(projectDir, 'assets', 'icons', 'icon.ico');
  const rceditBin = path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

  if (!fs.existsSync(exePath)) {
    throw new Error(`[after-pack] Executable not found: ${exePath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[after-pack] Icon not found: ${iconPath}`);
  }
  if (!fs.existsSync(rceditBin)) {
    throw new Error(`[after-pack] rcedit not found: ${rceditBin}`);
  }

  const version = context.packager.appInfo.shortVersion || context.packager.appInfo.buildVersion;
  let productVersion = version;
  try {
    productVersion = context.packager.appInfo.shortVersionWindows
      || context.packager.appInfo.getVersionInWeirdWindowsForm()
      || version;
  } catch {}

  execFileSync(rceditBin, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'ProductName', context.packager.appInfo.productName,
    '--set-version-string', 'FileDescription', context.packager.appInfo.productName,
    '--set-version-string', 'CompanyName', 'SHKWON',
    '--set-version-string', 'LegalCopyright', context.packager.appInfo.copyright || '',
    '--set-version-string', 'InternalName', context.packager.appInfo.productFilename,
    '--set-version-string', 'OriginalFilename', exeName,
    '--set-file-version', version,
    '--set-product-version', productVersion,
  ], { stdio: 'inherit' });

  console.log(`[after-pack] Applied icon to ${exeName}`);
};

module.exports.default = module.exports;
