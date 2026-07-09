/**
 * after-pack.js — Windows 실행 파일에 앱 아이콘 임베드
 *
 * signAndEditExecutable: false 환경에서도 바로가기/시작 메뉴 아이콘이
 * 올바르게 표시되도록 rcedit으로 MyKanban.exe에 icon.ico를 적용합니다.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(projectDir, 'assets', 'icon.ico');
  const rceditBin = path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

  if (!fs.existsSync(exePath)) throw new Error(`[after-pack] Executable not found: ${exePath}`);
  if (!fs.existsSync(iconPath)) throw new Error(`[after-pack] Icon not found: ${iconPath}`);
  if (!fs.existsSync(rceditBin)) throw new Error(`[after-pack] rcedit not found: ${rceditBin}`);

  const version = context.packager.appInfo.shortVersion || context.packager.appInfo.buildVersion;
  const productVersion = context.packager.appInfo.shortVersionWindows
    || context.packager.appInfo.getVersionInWeirdWindowsForm();

  execFileSync(rceditBin, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'ProductName', context.packager.appInfo.productName,
    '--set-version-string', 'FileDescription', context.packager.appInfo.productName,
    '--set-file-version', version,
    '--set-product-version', productVersion,
  ], { stdio: 'inherit' });

  console.log(`[after-pack] Applied icon to ${exeName}`);
};

module.exports.default = module.exports;
