'use strict';

// 창(웹뷰)에 실을 파일을 dist/ 에 모은다.
//   src/renderer, src/shared → dist/renderer, dist/shared
//   assets/                  → dist/assets
// 그림은 프로젝트 루트의 assets/ 에 두고, 창과 Rust(asset_resolver) 는 여전히 'assets/...' 로 읽는다.
// tauri dev·build 가 시작하기 전(beforeDevCommand/beforeBuildCommand)과 cargo test 앞에서 돈다.
//   node tools/stage.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function stage() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  for (const name of fs.readdirSync(path.join(ROOT, 'src'))) {
    fs.cpSync(path.join(ROOT, 'src', name), path.join(DIST, name), { recursive: true });
  }
  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
}

if (require.main === module) stage();

module.exports = { stage, DIST };
