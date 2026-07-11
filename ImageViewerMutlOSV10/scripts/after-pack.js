/**
 * after-pack.js — embed app icon into Windows .exe without winCodeSign
 * (signAndEditExecutable: false avoids symlink privilege errors on Windows).
 */
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(projectDir, 'src', 'assets', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    throw new Error(`[after-pack] Executable not found: ${exePath}`);
  }
  if (!fs.existsSync(iconPath)) {
    throw new Error(`[after-pack] Icon not found: ${iconPath}`);
  }

  const mod = require('rcedit');
  const rceditFn = typeof mod === 'function' ? mod : mod.rcedit;
  if (typeof rceditFn !== 'function') {
    throw new Error('[after-pack] rcedit API not found');
  }

  const version = context.packager.appInfo.shortVersion || context.packager.appInfo.buildVersion;
  let productVersion = version;
  try {
    productVersion = context.packager.appInfo.shortVersionWindows
      || context.packager.appInfo.getVersionInWeirdWindowsForm()
      || version;
  } catch {}

  await rceditFn(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: context.packager.appInfo.productName,
      FileDescription: context.packager.appInfo.productName,
      CompanyName: 'SHKWON',
      LegalCopyright: context.packager.appInfo.copyright || '',
      InternalName: context.packager.appInfo.productFilename,
      OriginalFilename: exeName,
    },
    'file-version': version,
    'product-version': productVersion,
  });

  console.log(`[after-pack] Applied icon to ${exeName}`);
};

module.exports.default = module.exports;
