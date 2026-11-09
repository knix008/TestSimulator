import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { avifEncoderFor, avifOptions, encodeAvifPixels, imageFormats } from '../../src/io/imageformats.js';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('@jsquash/avif/package.json'));
const codec = async (kind) => {
  const { default: factory } = await import(pathToFileURL(path.join(pkgDir, 'codec', kind, `avif_${kind}.js`)).href);
  return factory({ noInitialRun: true, wasmBinary: readFileSync(path.join(pkgDir, 'codec', kind, `avif_${kind}.wasm`)) });
};

test('AVIF is always offered; the canvas writes it where it can, else the bundled encoder', () => {
  assert.ok(imageFormats().some((f) => f.id === 'avif' && f.ext === 'avif' && f.quality && f.alpha));
  assert.equal(avifEncoderFor(true), 'canvas');
  assert.equal(avifEncoderFor(false), 'wasm');
  assert.equal(avifEncoderFor(true, 'wasm'), 'wasm');
  assert.equal(avifEncoderFor(false, 'canvas'), 'canvas');
  assert.equal(avifEncoderFor(false, 'bogus'), 'wasm');
});

test('AVIF settings: quality 0..1 → 1..100, faster on big pictures', () => {
  assert.equal(avifOptions(0.92).quality, 92);
  assert.equal(avifOptions(0).quality, 1);
  assert.equal(avifOptions(5).quality, 100);
  assert.equal(avifOptions(0.8, 1920 * 1080).speed, 7);
  assert.equal(avifOptions(0.8, 3840 * 2160).speed, 8);
  assert.equal(avifOptions(0.8, 640 * 480).speed, 6);
});

test('the bundled AVIF encoder writes a picture that decodes back (size and colours)', async () => {
  // The .wasm the app ships (single-threaded build), kept small enough to bundle.
  assert.ok(statSync(path.join(pkgDir, 'codec/enc/avif_enc.wasm')).size < 5e6);
  const enc = await codec('enc');
  const w = 40; const h = 24;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    rgba[i] = x < w / 2 ? 220 : 20; rgba[i + 1] = 90; rgba[i + 2] = x < w / 2 ? 30 : 200; rgba[i + 3] = 255;
  }
  const bytes = encodeAvifPixels(enc, rgba, w, h, 0.9);
  assert.equal(new TextDecoder('latin1').decode(bytes.slice(4, 12)), 'ftypavif');
  const dec = await codec('dec');
  const img = dec.decode(bytes, 8);
  assert.equal(img.width, w);
  assert.equal(img.height, h);
  const at = (x, y) => Array.from(img.data.slice((y * w + x) * 4, (y * w + x) * 4 + 3));
  const close = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 24);
  assert.ok(close(at(5, 12), [220, 90, 30]), String(at(5, 12)));
  assert.ok(close(at(34, 12), [20, 90, 200]), String(at(34, 12)));
});
