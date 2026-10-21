/**
 * build-web.js — copy everything the page needs into dist/: src/ plus the codec files from
 * node_modules into dist/vendor/ (the page loads them from vendor/ on first use; Tauri refuses a
 * frontend folder that contains a directory named node_modules).
 *
 *   node scripts/build-web.js          → dist/ for a static web server, with samples/ and samples.json
 *   node scripts/build-web.js --app    → dist/ for the Tauri bundle (frontendDist), without samples
 *                                        (the desktop app ships a few through scripts/stage-samples.mjs)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const APP = process.argv.includes('--app');
const VENDOR = {
  'dicom-parser': ['dist/dicomParser.min.js'],
  '@cornerstonejs/codec-openjpeg': ['dist/openjpegjs_decode.js', 'dist/openjpegjs.js'],   // full build: JPEG 2000 export
  '@cornerstonejs/codec-charls': ['dist/charlsjs_decode.js', 'dist/charlsjs.js'],   // full build: JPEG-LS export
  '@cornerstonejs/codec-libjpeg-turbo-8bit': ['dist/libjpegturbojs_decode.js'],
  '@cornerstonejs/codec-libjpeg-turbo-12bit': ['dist/libjpegturbo12js.js'],
  'jpeg-lossless-decoder-js': ['release/cjs/lossless.cjs'],
  'pako': ['dist/pako.min.js'],
  'utif': ['UTIF.js'],
  'libheif-js': ['libheif-wasm/libheif-bundle.js'],
  // image export (src/js/imageExport.js): ES-module encoders + their wasm, loaded with import() on first use
  '@jsquash/avif': ['codec/enc/avif_enc.js', 'codec/enc/avif_enc.wasm'],
  '@jsquash/jxl': ['codec/enc/jxl_enc.js', 'codec/enc/jxl_enc.wasm'],
  '@jsquash/webp': ['codec/enc/webp_enc.js', 'codec/enc/webp_enc.wasm'],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'src'), OUT, { recursive: true, filter: (p) => !p.endsWith('.svg') || p.includes('assets') });
for (const [pkg, files] of Object.entries(VENDOR)) {
  for (const f of files) {
    const src = path.join(ROOT, 'node_modules', pkg, f);
    if (!fs.existsSync(src)) { console.warn(`[build-web] missing ${pkg}/${f} — run npm install`); continue; }
    const dest = path.join(OUT, 'vendor', pkg, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
if (!APP && fs.existsSync(path.join(ROOT, 'samples'))) {
  fs.cpSync(path.join(ROOT, 'samples'), path.join(OUT, 'samples'), { recursive: true, filter: (p) => !/converted_/.test(p) });
  // server.js answers /samples.json itself; a static host needs the file.
  const top = fs.readdirSync(path.join(ROOT, 'samples')).filter((f) => /\.(dcm|dicm|dicom)$/i.test(f));
  fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify(top));
}
console.log(`${APP ? 'app' : 'web'} build written to ${path.relative(ROOT, OUT)}/`);
