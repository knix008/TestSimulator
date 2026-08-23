'use strict';

const path = require('path');
const { runRcedit } = require('./win-rcedit');

/**
 * electron-builder afterPack hook — set Windows exe metadata without the
 * flaky in-place rcedit step (signAndEditExecutable=false).
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const packager = context.packager;
  const appInfo = packager.appInfo;
  const productName = appInfo.productFilename || appInfo.productName || 'MyMemoPad';
  const exePath = path.join(context.appOutDir, `${productName}.exe`);
  const icon = path.join(packager.projectDir, 'asset', 'icon.ico');

  const author = appInfo.companyName || 'SHKWON';
  runRcedit(exePath, {
    icon,
    productName,
    description: appInfo.description || productName,
    copyright: appInfo.copyright || '',
    company: author,
    version: appInfo.version || '1.0.0'
  });
  console.log(`[after-pack-win] metadata applied: ${productName}.exe`);
};
