'use strict';

// tauri build 가 src-tauri/target/release/bundle 아래에 만든 설치 파일을 프로젝트 루트로 복사한다.
//   Windows : bundle/nsis/MyDeskBox_1.0.0_x64-setup.exe  → MyDeskBox-Setup-1.0.0-x64.exe (Electron 판과 같은 이름)
//   macOS   : bundle/dmg/MyDeskBox_1.0.0_aarch64.dmg     → 그대로
//   Linux   : bundle/deb/*.deb, bundle/appimage/*.AppImage → 그대로
// 압축 풀린 .app 폴더나 서명 파일(.sig)은 설치 파일이 아니므로 고르지 않는다.

const fs = require('fs');
const path = require('path');

const KINDS = {
  win32: [['nsis', '.exe']],
  darwin: [['dmg', '.dmg']],
  linux: [['deb', '.deb'], ['appimage', '.AppImage']],
};

// Tauri 가 지은 이름을 루트에 둘 이름으로 바꾼다.
function installerName(name) {
  const setup = name.match(/^(.+)_([\d.]+)_([\w-]+)-setup\.exe$/i);
  if (setup) return `${setup[1]}-Setup-${setup[2]}-${setup[3]}.exe`;
  return name;
}

// 한 폴더의 이름들 가운데 설치 파일만 고른다. 판이 여럿이면 이름 순으로 마지막 하나.
function pickInstaller(names, extension) {
  const found = names.filter((name) => name.toLowerCase().endsWith(extension.toLowerCase()));
  if (!found.length) return null;
  return found.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
}

// target/release/bundle 과, 대상을 정해 만든 target/<triple>/release/bundle 을 모두 본다.
function bundleDirs(target) {
  const dirs = [path.join(target, 'release', 'bundle')];
  if (fs.existsSync(target)) {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.includes('-')) dirs.push(path.join(target, entry.name, 'release', 'bundle'));
    }
  }
  return dirs.filter((dir) => fs.existsSync(dir));
}

function copyInstallers({ target, root, platform }) {
  const copied = [];
  for (const bundle of bundleDirs(target)) {
    for (const [kind, extension] of KINDS[platform] || KINDS.win32) {
      const dir = path.join(bundle, kind);
      if (!fs.existsSync(dir)) continue;
      const names = fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
      const name = pickInstaller(names, extension);
      if (!name) continue;
      const to = path.join(root, installerName(name));
      fs.copyFileSync(path.join(dir, name), to);
      copied.push({ name: path.basename(to), from: path.join(dir, name), to });
    }
  }
  if (!copied.length) throw new Error('src-tauri/target 에서 설치 파일을 찾지 못했습니다.');
  return copied;
}

function main() {
  const root = path.join(__dirname, '..');
  try {
    const copied = copyInstallers({ target: path.join(root, 'src-tauri', 'target'), root, platform: process.platform });
    for (const item of copied) console.log(`설치 파일을 루트로 복사했습니다. ${item.name}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { installerName, pickInstaller, copyInstallers };
