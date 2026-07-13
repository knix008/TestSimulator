'use strict';
/**
 * Copy @xenova/transformers browser build next to index.html so Electron
 * (file://) can load Whisper without CDN/CORS, and web builds can ship it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', '@xenova', 'transformers', 'dist');
const DST = path.join(ROOT, 'src', 'renderer', 'vendor', 'transformers');

const FILES = [
  'transformers.min.js',
  'ort-wasm.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd-threaded.wasm',
];

function main() {
  if (!fs.existsSync(path.join(SRC, 'transformers.min.js'))) {
    console.warn('[sync-transformers-vendor] @xenova/transformers not installed — skip');
    return 0;
  }
  fs.mkdirSync(DST, { recursive: true });
  for (const name of FILES) {
    const from = path.join(SRC, name);
    const to = path.join(DST, name);
    if (!fs.existsSync(from)) {
      console.warn(`[sync-transformers-vendor] missing ${name}`);
      continue;
    }
    fs.copyFileSync(from, to);
  }
  console.log('[sync-transformers-vendor] synced → src/renderer/vendor/transformers');
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, DST, SRC };
