/* Copies the decoder bundles MyPaint loads at run time out of node_modules and into
 * src/vendor/, so the packaged application carries them without node_modules.
 * Every file listed here is a single self-contained script with its WebAssembly
 * embedded as base64, which keeps the loader a plain <script> tag. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "src", "vendor");

const FILES = [
  ["dicom-parser/dist/dicomParser.min.js", "dicomParser.min.js"],
  ["utif/UTIF.js", "UTIF.js"],
  ["pako/dist/pako.min.js", "pako.min.js"],
  ["libheif-js/libheif-wasm/libheif-bundle.js", "libheif-bundle.js"],
  ["@cornerstonejs/codec-openjpeg/dist/openjpegjs.js", "openjpegjs.js"],
  ["@cornerstonejs/codec-charls/dist/charlsjs_decode.js", "charlsjs_decode.js"],
  ["@cornerstonejs/codec-libjpeg-turbo-8bit/dist/libjpegturbojs_decode.js", "libjpegturbojs_decode.js"],
  ["@cornerstonejs/codec-libjpeg-turbo-12bit/dist/libjpegturbo12js.js", "libjpegturbo12js.js"],
  ["jpeg-lossless-decoder-js/release/cjs/lossless.cjs", "lossless.cjs.js"],
];

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
const missing = [];
FILES.forEach(([from, to]) => {
  const source = path.join(root, "node_modules", from);
  if (!fs.existsSync(source)) {
    missing.push(from);
    return;
  }
  fs.copyFileSync(source, path.join(dest, to));
  copied += 1;
});

if (missing.length) {
  console.error("missing vendor files (run npm install first):");
  missing.forEach((name) => console.error("  " + name));
  process.exit(1);
}
console.log("vendor ready: " + copied + " files in src/vendor");
