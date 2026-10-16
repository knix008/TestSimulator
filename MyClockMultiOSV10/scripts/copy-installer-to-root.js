'use strict';

/**
 * Tauri 가 만든 설치 파일을 프로젝트 루트로 복사한다.
 *
 *   src-tauri/target/release/bundle/nsis/MyClock_1.0.0_x64-setup.exe → MyClock-Setup-1.0.0.exe
 *   src-tauri/target/release/bundle/dmg/MyClock_1.0.0_*.dmg          → MyClock-1.0.0.dmg
 *   src-tauri/target/release/bundle/appimage/MyClock_1.0.0_*.AppImage → MyClock-1.0.0.AppImage
 *   src-tauri/target/release/bundle/deb/MyClock_1.0.0_amd64.deb      → MyClock_1.0.0_amd64.deb
 *
 * 루트의 이름은 Electron 판과 같게 둔다 (안내 문서·.gitignore 가 그대로 맞는다).
 * 같은 종류의 옛 설치 파일은 지우고 새것 하나만 남긴다.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, 'src-tauri', process.env.CARGO_TARGET_DIR)
  : path.join(root, 'src-tauri', 'target');
const bundleDir = path.resolve(process.argv[2] || path.join(target, 'release', 'bundle'));
const { version } = require(path.join(root, 'package.json'));

/** 종류마다 — 번들 안에서 찾을 꼴, 루트에 둘 이름, 루트에서 지울 옛 이름 */
const KINDS = [
  { match: /^MyClock_.*-setup\.exe$/i, name: `MyClock-Setup-${version}.exe`, old: /^MyClock-Setup-.*\.exe$/i },
  { match: /^MyClock_.*\.dmg$/i, name: `MyClock-${version}.dmg`, old: /^MyClock-.*\.dmg$/i },
  { match: /^MyClock_.*\.AppImage$/i, name: `MyClock-${version}.AppImage`, old: /^MyClock-.*\.AppImage$/i },
  { match: /^MyClock_.*\.deb$/i, name: null, old: /^MyClock_.*\.deb$/i }
];

function walk(dir, found = []) {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // macOS 의 .app 은 폴더다 — 그 안은 볼 필요가 없다.
    if (entry.isDirectory()) {
      if (!entry.name.endsWith('.app')) walk(full, found);
    } else {
      found.push({ full, name: entry.name, time: fs.statSync(full).mtimeMs });
    }
  }
  return found;
}

function main() {
  const files = walk(bundleDir);
  let copied = 0;
  for (const kind of KINDS) {
    const newest = files.filter((f) => kind.match.test(f.name)).sort((a, b) => b.time - a.time)[0];
    if (!newest) continue;
    for (const name of fs.readdirSync(root)) {
      if (kind.old.test(name)) fs.rmSync(path.join(root, name), { force: true });
    }
    const dest = path.join(root, kind.name || newest.name);
    fs.copyFileSync(newest.full, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(1);
    console.log(`[copy-installer] ${path.basename(dest)} → ./ (${sizeMb} MB)`);
    copied += 1;
  }
  if (!copied) {
    console.error(`[copy-installer] ${path.relative(root, bundleDir)} 에 설치 파일이 없습니다. 먼저 npm run build:win 등을 실행하세요.`);
    process.exit(1);
  }
}

main();
