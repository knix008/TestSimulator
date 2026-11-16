'use strict';

// 빌드가 만든 것을 지운다. 소스와 assets/ 는 건드리지 않는다.
//
//   npm run clean      dist/            창에 실을 파일을 모은 폴더 (tools/stage.js)
//                      src-tauri/gen/   tauri 가 만드는 스키마 따위
//                      coverage/, .nyc_output/
//   npm run clean:all  위에 더해
//                      src-tauri/target/                 Rust 빌드 결과 (실행 파일·설치 파일)
//                      node_modules/                     다시 npm install 해야 한다
//                      루트로 복사한 설치 파일             MyDeskBox-Setup-*.exe, MyDeskBox_*.dmg 따위
//
// 지울 것만 보려면 --dry-run 을 붙인다 (npm run clean:all -- --dry-run).

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const all = process.argv.includes('--all');
const dry = process.argv.includes('--dry-run');

// .gitignore 에 적힌 설치 파일 이름과 같다 (tools/copy-installer.js 가 만든다).
const INSTALLER = /^(MyDeskBox-Setup-.*\.exe|MyDeskBox_.*\.(exe|dmg|deb|AppImage|rpm))$/;

function targets() {
  const list = ['dist', path.join('src-tauri', 'gen'), 'coverage', '.nyc_output'];
  if (all) {
    list.push(path.join('src-tauri', 'target'), 'node_modules');
    for (const name of fs.readdirSync(ROOT)) {
      if (INSTALLER.test(name)) list.push(name);
    }
  }
  return list;
}

let removed = 0;
for (const rel of targets()) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const shown = rel.replace(/\\/g, '/');
  if (dry) {
    console.log(`[clean] 지울 것: ${shown}`);
    removed += 1;
    continue;
  }
  try {
    fs.rmSync(full, { recursive: true, force: true, maxRetries: 3 });
    console.log(`[clean] 지움: ${shown}`);
    removed += 1;
  } catch (err) {
    // 실행 중인 앱이나 편집기가 잡고 있으면 못 지운다.
    console.error(`[clean] 지우지 못함: ${shown} (${err.message})`);
    process.exitCode = 1;
  }
}

if (!removed) console.log('[clean] 지울 것이 없습니다.');
else console.log(`[clean] ${removed}개 ${dry ? '지울 예정' : '지웠습니다'}.`);
if (all && !dry && removed) console.log('[clean] 다시 쓰려면 npm install 부터 하세요.');
