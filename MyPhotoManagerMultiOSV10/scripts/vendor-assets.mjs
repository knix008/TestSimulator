// Copies runtime assets that live in node_modules into public/ so the web
// build and the desktop app ship them (they are loaded at run time by URL):
//   public/models/face/  face detection, landmark and recognition weights (@vladmandic/face-api)
// Runs before `npm run dev` and `npm run build:web`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const faceSource = path.join(root, 'node_modules', '@vladmandic', 'face-api', 'model');
const faceTarget = path.join(root, 'public', 'models', 'face');
const FACE_MODELS = ['ssd_mobilenetv1_model', 'face_landmark_68_model', 'face_recognition_model'];

fs.mkdirSync(faceTarget, { recursive: true });
let copied = 0;
for (const model of FACE_MODELS) {
  for (const file of [`${model}-weights_manifest.json`, `${model}.bin`]) {
    const from = path.join(faceSource, file);
    const to = path.join(faceTarget, file);
    if (!fs.existsSync(from)) { console.error(`없음: ${from} (npm install 을 먼저 실행하세요)`); process.exit(1); }
    if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
    fs.copyFileSync(from, to);
    copied += 1;
  }
}
if (copied) console.log(`public/models/face: ${copied}개 파일 복사`);

// DICOM: dicom-parser and the codecs the decoder loads by <script> (src/formats/dicomDecoder.js),
// under public/vendor/ with their node_modules paths.
const DICOM_FILES = [
  'dicom-parser/dist/dicomParser.min.js',
  '@cornerstonejs/codec-openjpeg/dist/openjpegjs_decode.js',
  '@cornerstonejs/codec-charls/dist/charlsjs_decode.js',
  '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbojs_decode.js',
  '@cornerstonejs/codec-libjpeg-turbo-12bit/dist/libjpegturbo12js.js',
  'jpeg-lossless-decoder-js/release/cjs/lossless.cjs',
];
let dicomCopied = 0;
for (const file of DICOM_FILES) {
  const from = path.join(root, 'node_modules', file);
  const to = path.join(root, 'public', 'vendor', file);
  if (!fs.existsSync(from)) { console.error(`없음: ${from} (npm install 을 먼저 실행하세요)`); process.exit(1); }
  if (fs.existsSync(to) && fs.statSync(to).size === fs.statSync(from).size) continue;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  dicomCopied += 1;
}
if (dicomCopied) console.log(`public/vendor: DICOM 코덱 ${dicomCopied}개 파일 복사`);
