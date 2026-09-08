/*
 * copy-installer.mjs - 만들어진 설치 파일을 프로젝트 루트로 복사한다
 *
 * electron-builder 는 release/ 아래에 결과물을 놓는데, 원본 C 판이
 * chunjiin-setup.exe 를 저장소 루트에 두었던 것처럼 손 닿는 자리에 둔다.
 *
 *   release/Chunjiin Setup 1.0.0.exe  ->  ./Chunjiin Setup 1.0.0.exe
 *
 * 풀어 놓은 폴더(win-unpacked, mac 등)와 blockmap 은 건너뛴다.
 * 루트 사본은 .gitignore 가 걸러 내므로 저장소에는 들어가지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');

const INSTALLER = /\.(exe|dmg|AppImage|deb|rpm|snap|zip)$/i;

function collect(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);

    if (fs.statSync(full).isDirectory()) {
      /* 풀어 놓은 앱 폴더 안까지 뒤지지 않는다 */
      if (name.endsWith('-unpacked') || name === 'mac' || name === 'mac-arm64') continue;
      collect(full, out);
      continue;
    }
    if (INSTALLER.test(name) && !name.endsWith('.blockmap')) out.push(full);
  }
  return out;
}

const found = collect(releaseDir);

if (found.length === 0) {
  console.warn('release/ 에 설치 파일이 없습니다. 복사할 것이 없습니다.');
  process.exit(0);
}

for (const src of found) {
  const dest = path.join(root, path.basename(src));
  fs.copyFileSync(src, dest);
  console.log(`복사함 -> ${path.basename(dest)}`);
}
