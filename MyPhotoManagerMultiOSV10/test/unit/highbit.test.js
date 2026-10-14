// 16-bit pictures: 16-bit PNG / TIFF read and written without losing
// precision, tone edits on the precise copy band far less than on 8-bit
// pixels, and give the same result where 8 bits suffice; dithering and scaling.
// features: EDIT-16BIT
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { applyAdjustments } from '../../src/edit/adjust.js';
import { decodePng16, dither, encodePng16, encodeTiff16, readTiff16, scaleHigh } from '../../src/formats/highbit.js';

const UTIF = createRequire(import.meta.url)('utif2');

function ramp(width, height, from, to) {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = from + ((to - from) * x) / (width - 1);
    const i = (y * width + x) * 4;
    data[i] = v; data[i + 1] = v * 0.8; data[i + 2] = v * 0.5; data[i + 3] = 255;
  }
  return { width, height, data };
}

test('16-bit PNG round trip keeps 16-bit precision', () => {
  const high = ramp(300, 4, 0, 255);
  const back = decodePng16(encodePng16(high));
  assert.equal(back.width, 300);
  for (let i = 0; i < high.data.length; i++) assert.ok(Math.abs(back.data[i] - high.data[i]) <= 255 / 65535 + 1e-6, `sample ${i}`);
  assert.equal(decodePng16(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])), null, '8-bit PNG: no precise copy');
});

test('16-bit TIFF round trip (written by us, read by UTIF)', () => {
  const high = ramp(64, 8, 3.25, 200.75);
  const bytes = encodeTiff16(high);
  const ifds = UTIF.decode(bytes.buffer);
  UTIF.decodeImage(bytes.buffer, ifds[0]);
  assert.equal(ifds[0].t258[0], 16);
  const back = readTiff16(ifds[0]);
  for (let i = 0; i < high.data.length; i++) assert.ok(Math.abs(back.data[i] - high.data[i]) <= 255 / 65535 + 1e-6);
});

test('a strong exposure push on a dark gradient: 8 bits band, the precise copy does not', () => {
  const dark = ramp(1024, 1, 0, 16); // a dark 16-bit gradient
  const eight = { width: 1024, height: 1, data: new Uint8ClampedArray(dark.data.map((v) => Math.round(v))) };
  const precise = { width: 1024, height: 1, data: new Float32Array(dark.data) };
  applyAdjustments(eight, { exposure: 3 });
  applyAdjustments(precise, { exposure: 3 });
  const levels = (arr) => new Set(Array.from({ length: 1024 }, (_, x) => Math.round(arr[x * 4] * 4) / 4)).size;
  assert.ok(levels(eight.data) <= 20, `8-bit: ${levels(eight.data)} steps`);
  assert.ok(levels(precise.data) > 300, `16-bit: ${levels(precise.data)} levels`);
  // The largest jump between neighbours: one big band step in 8 bits, tiny in 16.
  const maxStep = (arr) => Math.max(...Array.from({ length: 1023 }, (_, x) => Math.abs(arr[(x + 1) * 4] - arr[x * 4])));
  assert.ok(maxStep(eight.data) >= 7 && maxStep(precise.data) < 1, `steps ${maxStep(eight.data)} vs ${maxStep(precise.data)}`);
});

test('where 8 bits are enough both paths agree', () => {
  const values = [0, 12, 37, 64, 99, 128, 160, 201, 230, 255];
  const eight = { width: values.length, height: 1, data: new Uint8ClampedArray(values.flatMap((v) => [v, 255 - v, (v * 7) % 256, 255])) };
  const precise = { width: values.length, height: 1, data: Float32Array.from(eight.data) };
  const adjust = { exposure: 0.4, contrast: 30, saturation: 20, temperature: 15, highlights: -20, shadows: 25, levels: { black: 5, white: 245, gamma: 1.1 }, curves: { rgb: [[0, 0], [128, 140], [255, 255]] } };
  applyAdjustments(eight, adjust);
  applyAdjustments(precise, adjust);
  for (let i = 0; i < eight.data.length; i++) assert.ok(Math.abs(eight.data[i] - precise.data[i]) <= 2.5, `value ${i}: ${eight.data[i]} vs ${precise.data[i]}`);
});

test('dithering keeps the average; scaling averages areas', () => {
  const flat = { width: 16, height: 16, data: new Float32Array(16 * 16 * 4).fill(100.3) };
  const out = dither(flat);
  let sum = 0;
  for (let i = 0; i < out.length; i += 4) sum += out[i];
  assert.ok(Math.abs(sum / 256 - 100.3) < 0.1, `mean ${sum / 256}`);
  assert.ok(new Set(Array.from({ length: 256 }, (_, i) => out[i * 4])).size === 2, 'two neighbouring levels mixed');
  const half = scaleHigh(ramp(4, 2, 0, 30), 2, 1);
  assert.ok(Math.abs(half.data[0] - 5) < 1e-4 && Math.abs(half.data[4] - 25) < 1e-4, `${half.data[0]}, ${half.data[4]}`);
});
