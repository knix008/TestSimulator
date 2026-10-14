// Copies runtime assets that live in node_modules into public/ so the web
// build and the desktop app ship them (they are loaded at run time by URL):
//   public/models/face/  face detection, landmark and recognition weights (@vladmandic/face-api)
//   public/models/mobilenet, cocossd/  image analysis models (downloaded once, see below)
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

// Image analysis (src/analysis/worker.js): MobileNet v2 (ImageNet) and SSDLite MobileNet v2
// (COCO) TensorFlow.js graph models from Google's tfjs-models bucket (Apache 2.0), fetched
// once into public/models/. Without a network the build goes on and analysis reports the
// models as missing.
const ANALYSIS_MODELS = {
  mobilenet: 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json',
  cocossd: 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json',
};
for (const [name, url] of Object.entries(ANALYSIS_MODELS)) {
  const dir = path.join(root, 'public', 'models', name);
  const modelFile = path.join(dir, 'model.json');
  try {
    if (fs.existsSync(modelFile)) {
      const json = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
      if (json.weightsManifest.every((group) => group.paths.every((p) => fs.existsSync(path.join(dir, p))))) continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const json = await response.json();
    let bytes = 0;
    for (const group of json.weightsManifest) {
      for (const p of group.paths) {
        const shard = await fetch(new URL(p, url));
        if (!shard.ok) throw new Error(`${p}: ${shard.status}`);
        const data = Buffer.from(await shard.arrayBuffer());
        fs.writeFileSync(path.join(dir, p), data);
        bytes += data.length;
      }
    }
    fs.writeFileSync(modelFile, JSON.stringify(json)); // last: a model.json means the shards are there
    console.log(`public/models/${name}: 내려받음 (${(bytes / 1e6).toFixed(1)} MB)`);
  } catch (error) {
    console.warn(`경고: 이미지 분석 모델 ${name} 을 받지 못했습니다 — ${error.message}`);
  }
}
