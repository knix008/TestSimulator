/**
 * build-web.js — copy everything the browser version needs into dist-web/ so it can be
 * hosted on any static web server (no Node required at runtime).
 *
 *   node scripts/build-web.js      → dist-web/index.html + dist-web/node_modules/<codecs>
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-web');
const VENDOR = {
  'dicom-parser': ['dist/dicomParser.min.js'],
  '@cornerstonejs/codec-openjpeg': ['dist/openjpegjs_decode.js'],
  '@cornerstonejs/codec-charls': ['dist/charlsjs_decode.js'],
  '@cornerstonejs/codec-libjpeg-turbo-8bit': ['dist/libjpegturbojs_decode.js'],
  '@cornerstonejs/codec-libjpeg-turbo-12bit': ['dist/libjpegturbo12js.js'],
  'jpeg-lossless-decoder-js': ['release/cjs/lossless.cjs'],
  'pako': ['dist/pako.min.js'],
  'utif': ['UTIF.js'],
  'libheif-js': ['libheif-wasm/libheif-bundle.js'],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'src'), OUT, { recursive: true, filter: (p) => !p.endsWith('.svg') || p.includes('assets') });
for (const [pkg, files] of Object.entries(VENDOR)) {
  for (const f of files) {
    const src = path.join(ROOT, 'node_modules', pkg, f);
    if (!fs.existsSync(src)) { console.warn(`[build-web] missing ${pkg}/${f}`); continue; }
    const dest = path.join(OUT, 'node_modules', pkg, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}
if (fs.existsSync(path.join(ROOT, 'samples'))) fs.cpSync(path.join(ROOT, 'samples'), path.join(OUT, 'samples'), { recursive: true, filter: (p) => !/converted_/.test(p) });
console.log(`web build written to ${OUT}`);
