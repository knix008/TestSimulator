/*
 * clean-release.mjs - 배포판 폴더를 지운다
 *
 * 앞선 빌드가 남긴 release/ 가 있으면 electron-builder 가 electron 압축을
 * release/win-unpacked.tmp 에 푼 뒤 win-unpacked 로 이름을 바꾸는데,
 * 이때 EPERM(operation not permitted, rename) 으로 넘어진다.
 *
 *   ⨯ EPERM: operation not permitted, rename
 *     'release\win-unpacked.tmp' -> 'release\win-unpacked'
 *
 * 그래서 빌드 전에 아예 비우고 시작한다. 바이러스 검사기나 탐색기가 잠깐
 * 붙잡고 있을 수 있으므로 몇 번 다시 시도한다.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'release');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    await rm(target, { recursive: true, force: true });
    console.log('release/ 를 비웠습니다.');
    process.exit(0);
  } catch (e) {
    if (attempt === 5) {
      console.error(`release/ 를 지우지 못했습니다: ${e.message}`);
      console.error('그 폴더를 열어 둔 탐색기나 터미널, 실행 중인 Chunjiin.exe 가 있는지 보세요.');
      process.exit(1);
    }
    await sleep(400 * attempt);
  }
}
