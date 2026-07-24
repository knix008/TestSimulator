/**
 * electron-builder 산출물(release/) 중 설치용 파일을 프로젝트 루트로 복사
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');
const installerExt = /\.(exe|dmg|AppImage|deb|rpm)$/i;

if (!fs.existsSync(releaseDir)) {
  console.warn('release/ 폴더가 없습니다. 복사할 설치 파일이 없습니다.');
  process.exit(0);
}

let copied = 0;
for (const name of fs.readdirSync(releaseDir)) {
  if (!installerExt.test(name)) continue;
  const src = path.join(releaseDir, name);
  if (!fs.statSync(src).isFile()) continue;
  const dest = path.join(rootDir, name);
  fs.copyFileSync(src, dest);
  console.log(`설치 파일 복사: ${name}`);
  copied++;
}

if (copied === 0) {
  console.warn('복사할 설치 파일을 찾지 못했습니다.');
} else {
  console.log(`총 ${copied}개 파일을 프로젝트 루트에 복사했습니다.`);
}
