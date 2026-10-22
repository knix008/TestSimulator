/**
 * vendor.js — copy the browser builds the desktop page loads on demand into src/vendor/,
 * which Tauri serves with the page (src/ is its frontendDist):
 *
 *   node scripts/vendor.js        (run by `tauri dev` / `tauri build`, see tauri.conf.json)
 *
 *   DICOM   dicom-parser + the @cornerstonejs codecs + jpeg-lossless-decoder-js (dicomDecoder.js)
 *   HEIC    libheif-js (wasm built into the script; js/heicWorker.js)
 *   EXIF    exifr (Info panel tags; tauriAPI.js)
 *
 * Paths keep their node_modules layout (src/vendor/node_modules/<package>/…), so
 * dicomDecoder.js's VENDOR table works for the desktop and for web mode (../node_modules/)
 * alike. src/vendor/node_modules/ is generated — it is not in git (src/vendor/ is ignored).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'vendor', 'node_modules');

const FILES = [
  'dicom-parser/dist/dicomParser.min.js',
  '@cornerstonejs/codec-openjpeg/dist/openjpegjs_decode.js',
  '@cornerstonejs/codec-charls/dist/charlsjs_decode.js',
  '@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbojs_decode.js',
  '@cornerstonejs/codec-libjpeg-turbo-12bit/dist/libjpegturbo12js.js',
  'jpeg-lossless-decoder-js/release/cjs/lossless.cjs',
  'libheif-js/libheif-wasm/libheif-bundle.js',
  'exifr/dist/full.umd.js',
];

// Only our own copy: src/vendor/ may also hold the optional web-mode scripts (UTIF.js, heic2any)
fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const rel of FILES) {
  const from = path.join(ROOT, 'node_modules', rel);
  if (!fs.existsSync(from)) {
    console.error(`[vendor] missing node_modules/${rel} — run npm install`);
    process.exit(1);
  }
  const to = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  bytes += fs.statSync(to).size;
}
console.log(`[vendor] ${FILES.length} files → src/vendor (${(bytes / 1048576).toFixed(1)} MB)`);
