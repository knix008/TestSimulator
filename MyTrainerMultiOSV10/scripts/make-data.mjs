// Writes data/: real files to import and to run trained models on (npm run data).
//   data/csv/            student-pass.csv (classification), house-prices.csv (regression)
//   data/images/<set>/<class>/*.png   objects (colour), digits, letters, hangul — "Import picture folder"
//   data/audio/speech/<word>/*.wav    spoken keywords — "Import sound folder"
//   data/predict/        new inputs for the Test tab's "Run on data you choose": pictures written black on
//                        white (like a scan), WAV files, CSV rows without the answer, sentences
// Everything comes from the same generators as the built-in samples (fixed seeds), with no dependencies:
// PNG and WAV are encoded here.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { DIGIT_STROKES, generate, rasterize, rng, SENTIMENT_VOCAB } from '../src/domain/datasets.js';
import { HANGUL_STROKES, LETTER_STROKES, OBJECT_NAMES, SPEECH_WORDS, synthesizeWord } from '../src/domain/datasets-media.js';
import { houseCsv, studentCsv } from '../src/domain/tables.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'data');
fs.rmSync(out, { recursive: true, force: true });
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };

// ───────────────────────── PNG and WAV encoders

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** values: height × width × channels (1 or 3) in 0…1 → PNG bytes. */
function png(values, width, height, channels) {
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * channels + 1)] = 0;
    for (let i = 0; i < width * channels; i++) raw[y * (width * channels + 1) + 1 + i] = Math.round(Math.min(1, Math.max(0, values[y * width * channels + i])) * 255);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = channels === 3 ? 2 : 0; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** A mono 16-bit PCM WAV file. */
function wav(samples, rate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
const invert = (values) => values.map((v) => 1 - v);

// ───────────────────────── CSV tables

write(path.join(out, 'csv', 'student-pass.csv'), studentCsv());
write(path.join(out, 'csv', 'house-prices.csv'), houseCsv());
const dropTarget = (text) => text.trim().split('\n').map((line) => line.split(',').slice(0, -1).join(',')).slice(0, 13).join('\n');
write(path.join(out, 'predict', 'new-students.csv'), `${dropTarget(studentCsv(40, 77))}\n`);
write(path.join(out, 'predict', 'new-houses.csv'), `${dropTarget(houseCsv(40, 78))}\n`);

// ───────────────────────── picture folders

const objects = generate('objects', { n: 180, size: 32, seed: 91 });
objects.labels.forEach((label, c) => {
  let k = 0;
  for (let i = 0; i < objects.n; i++) if (objects.y[i] === c) write(path.join(out, 'images', 'objects', label, `${label}_${String(++k).padStart(2, '0')}.png`), png(objects.x.subarray(i * 32 * 32 * 3, (i + 1) * 32 * 32 * 3), 32, 32, 3));
});
const strokeSet = (name, table, perClass, size, seed) => {
  const r = rng(seed);
  for (const [label, strokes] of Object.entries(table)) {
    for (let k = 1; k <= perClass; k++) write(path.join(out, 'images', name, label, `${name}_${label}_${String(k).padStart(2, '0')}.png`), png(rasterize(strokes, size, r, { noise: 0.03, thickness: 1.3 }), size, size, 1));
  }
};
strokeSet('digits', Object.fromEntries(DIGIT_STROKES.map((s, d) => [String(d), s])), 25, 28, 92);
strokeSet('letters', LETTER_STROKES, 15, 28, 93);
strokeSet('hangul', HANGUL_STROKES, 20, 28, 94);

// New pictures to predict: written black on white, as a scan or a photo of paper would be.
const pr = rng(95);
for (const d of [0, 3, 7, 9]) write(path.join(out, 'predict', 'images', `digit_${d}.png`), png(invert(rasterize(DIGIT_STROKES[d], 64, pr, { noise: 0.02, thickness: 1.2 })), 64, 64, 1));
for (const c of ['A', 'K', 'R', 'Z']) write(path.join(out, 'predict', 'images', `letter_${c}.png`), png(invert(rasterize(LETTER_STROKES[c], 64, pr, { noise: 0.02, thickness: 1.2 })), 64, 64, 1));
for (const c of ['ㄱ', 'ㅂ', 'ㅊ', 'ㅎ']) write(path.join(out, 'predict', 'images', `hangul_${c}.png`), png(invert(rasterize(HANGUL_STROKES[c], 64, pr, { noise: 0.02, thickness: 1.2 })), 64, 64, 1));
const newObjects = generate('objects', { n: 6, size: 32, seed: 96 });
for (let i = 0; i < newObjects.n; i++) write(path.join(out, 'predict', 'images', `object_${OBJECT_NAMES[newObjects.y[i]]}.png`), png(newObjects.x.subarray(i * 3072, (i + 1) * 3072), 32, 32, 3));

// ───────────────────────── sound folders

const sr = rng(97);
for (const word of SPEECH_WORDS) {
  for (let k = 1; k <= 20; k++) write(path.join(out, 'audio', 'speech', word, `${word}_${String(k).padStart(2, '0')}.wav`), wav(synthesizeWord(word, sr), 8000));
  write(path.join(out, 'predict', 'audio', `say_${word}.wav`), wav(synthesizeWord(word, sr), 8000));
}

// ───────────────────────── sentences

write(path.join(out, 'predict', 'sentences.txt'), ['the movie was great', 'the story was not good', 'the acting was really boring', 'the music is lovely and fun', 'the ending was not bad', 'the cast is very poor'].join('\n') + '\n');
void SENTIMENT_VOCAB;

write(path.join(out, 'README.md'), `# data

MyTrainer 에서 가져오거나 학습된 모델로 실행해 볼 수 있는 파일입니다 (\`npm run data\` 로 다시 만듭니다).
Files to import into MyTrainer or to run trained models on (rebuilt with \`npm run data\`).

| 폴더 / Folder | 내용 / Contents | 쓰는 곳 / Use |
|---|---|---|
| \`csv/\` | student-pass.csv (분류 / classification), house-prices.csv (회귀 / regression) | 데이터 › CSV 가져오기 / Data › Import CSV |
| \`images/objects/\` | 집·나무·자동차·해·배·물고기 컬러 그림 / colour pictures | 데이터 › 그림 폴더 가져오기 / Import picture folder |
| \`images/digits/\`, \`images/letters/\`, \`images/hangul/\` | 숫자·영문자·한글 자음 손글씨풍 그림 / hand-drawn-style characters | 그림 폴더 가져오기 / Import picture folder |
| \`audio/speech/\` | yes·no·up·down·left·right 음성(WAV) / spoken keywords | 데이터 › 음성 폴더 가져오기 / Import sound folder |
| \`predict/\` | 새 입력: 흰 바탕 그림, WAV, 정답 없는 CSV, 문장 / new inputs | 테스트 › 입력 데이터 선택해서 실행 / Test › Run on data you choose |

하위 폴더 이름이 클래스(정답)입니다. / Sub-folder names are the classes.
`);

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log(`data/: ${count(out)} files`);
