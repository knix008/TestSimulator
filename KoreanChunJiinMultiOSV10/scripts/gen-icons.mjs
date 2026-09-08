/*
 * gen-icons.mjs - 리눅스 패키지용 아이콘 묶음 만들기
 *
 * build/icon.ico 는 크기별 PNG 를 여러 장 품고 있다(원본 프로젝트에서 가져온 것).
 * electron-builder 의 리눅스 대상은 build/icons/<가로>x<세로>.png 를 찾으므로
 * 그 PNG 들을 꺼내 그대로 풀어 놓는다. 외부 이미지 라이브러리가 필요 없다.
 *
 *   node scripts/gen-icons.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const icoPath = path.join(root, 'build', 'icon.ico');
const outDir = path.join(root, 'build', 'icons');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const ico = await readFile(icoPath);
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1) {
  throw new Error(`${icoPath} 는 ICO 파일이 아닙니다`);
}

await mkdir(outDir, { recursive: true });

const count = ico.readUInt16LE(4);
const written = [];

for (let i = 0; i < count; i++) {
  const entry = 6 + i * 16;
  const size = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  const image = ico.subarray(offset, offset + size);

  /* PNG 로 담긴 항목만 그대로 꺼낸다. BMP 항목은 건너뛴다. */
  if (!image.subarray(0, 4).equals(PNG_MAGIC)) continue;

  const w = image.readUInt32BE(16);
  const h = image.readUInt32BE(20);
  const name = `${w}x${h}.png`;

  await writeFile(path.join(outDir, name), image);
  written.push(name);
}

if (written.length === 0) {
  throw new Error('ICO 안에 PNG 항목이 없습니다. build/icons 를 직접 채워 주세요.');
}

console.log(`build/icons 에 ${written.length}개를 만들었습니다: ${written.join(', ')}`);
