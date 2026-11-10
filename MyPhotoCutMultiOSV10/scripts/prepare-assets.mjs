// Puts the face landmark model and its WebAssembly runtime in public/mediapipe/ (served with the
// page and embedded in the desktop app, so face finding works offline):
//   public/mediapipe/wasm/vision_wasm_internal.{js,wasm}   ← node_modules/@mediapipe/tasks-vision
//   public/mediapipe/face_landmarker.task                  ← downloaded once (Apache-2.0, Google)
//   public/mediapipe/selfie_segmenter.tflite               ← downloaded once (Apache-2.0, Google): the person mask
// Runs after `npm install`; `npm run assets` fetches everything again. Without the model the app
// still works: it finds the face with its own skin-colour method (src/engine/face.js).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'mediapipe');
const force = process.argv.includes('--force');
const MODELS = [
  ['face_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', 1_000_000],
  ['selfie_segmenter.tflite', 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', 100_000],
];

fs.mkdirSync(path.join(out, 'wasm'), { recursive: true });

const wasmSource = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
let copied = 0;
if (fs.existsSync(wasmSource)) {
  for (const file of fs.readdirSync(wasmSource)) {
    // The SIMD build only: every browser and WebView this app supports has WebAssembly SIMD.
    if (!/^vision_wasm_internal\.(js|wasm)$/.test(file)) continue;
    const target = path.join(out, 'wasm', file);
    if (!force && fs.existsSync(target) && fs.statSync(target).size === fs.statSync(path.join(wasmSource, file)).size) continue;
    fs.copyFileSync(path.join(wasmSource, file), target);
    copied += 1;
  }
} else {
  console.warn('[assets] @mediapipe/tasks-vision is not installed: the app will use its own face finder.');
}

for (const [file, url, minSize] of MODELS) {
  const model = path.join(out, file);
  if (!force && fs.existsSync(model) && fs.statSync(model).size >= minSize) continue;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    fs.writeFileSync(model, Buffer.from(await response.arrayBuffer()));
    console.log(`[assets] ${file}: ${(fs.statSync(model).size / 1048576).toFixed(2)} MB`);
  } catch (error) {
    console.warn(`[assets] ${file} could not be downloaded (${error.message}); the app uses its own method instead.`);
  }
}
if (copied) console.log(`[assets] ${copied} runtime file(s) → public/mediapipe/wasm`);
