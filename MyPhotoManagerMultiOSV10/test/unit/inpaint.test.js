// Content-aware fill: holes in pictures with a known answer (stripes, a smooth
// gradient, a checkerboard) are rebuilt close to it, better than a plain blur,
// outside pixels never change, and the result is the same every time.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inpaint, strokeMask } from '../../src/edit/inpaint.js';

function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: w, height: h, data };
}
const square = (w, h, x0, y0, size) => { const m = new Uint8Array(w * h); for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) m[y * w + x] = 1; return m; };
function error(a, b, mask) {
  let e = 0; let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { for (let c = 0; c < 3; c++) e += Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c]); n += 3; }
  return e / n;
}
/** What a blur-only fill would give: the mean colour of the hole's border. */
function borderMean(img, mask) {
  const out = { ...img, data: new Uint8ClampedArray(img.data) };
  const s = [0, 0, 0]; let n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const i = y * img.width + x;
    if (mask[i]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => mask[(y + dy) * img.width + x + dx])) { for (let c = 0; c < 3; c++) s[c] += img.data[i * 4 + c]; n++; }
  }
  for (let i = 0; i < mask.length; i++) if (mask[i]) for (let c = 0; c < 3; c++) out.data[i * 4 + c] = s[c] / n;
  return out;
}

test('vertical stripes are continued through the hole', () => {
  const truth = picture(160, 120, (x) => (x % 10 < 5 ? [230, 60, 40] : [30, 70, 200]));
  const mask = square(160, 120, 60, 40, 30);
  const img = { ...truth, data: new Uint8ClampedArray(truth.data) };
  for (let i = 0; i < mask.length; i++) if (mask[i]) { img.data[i * 4] = 0; img.data[i * 4 + 1] = 0; img.data[i * 4 + 2] = 0; }
  const blur = error(borderMean(img, mask), truth, mask);
  const start = performance.now();
  inpaint(img, mask);
  const ms = performance.now() - start;
  const filled = error(img, truth, mask);
  assert.ok(filled < blur * 0.5, `stripes: fill error ${filled.toFixed(1)} vs blur ${blur.toFixed(1)}`);
  assert.ok(ms < 8000, `took ${ms.toFixed(0)} ms`);
});

test('a smooth gradient is filled smoothly', () => {
  const truth = picture(120, 100, (x, y) => [x * 2, y * 2, 128]);
  const mask = square(120, 100, 45, 35, 24);
  const img = { ...truth, data: new Uint8ClampedArray(truth.data) };
  inpaint(img, mask);
  assert.ok(error(img, truth, mask) < 12, `gradient error ${error(img, truth, mask).toFixed(1)}`);
});

test('a checkerboard keeps its squares', () => {
  const truth = picture(128, 128, (x, y) => (((x >> 3) + (y >> 3)) % 2 ? [250, 250, 250] : [20, 20, 20]));
  const mask = square(128, 128, 52, 52, 22);
  const img = { ...truth, data: new Uint8ClampedArray(truth.data) };
  for (let i = 0; i < mask.length; i++) if (mask[i]) img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 128;
  const blur = error(borderMean(img, mask), truth, mask);
  inpaint(img, mask);
  assert.ok(error(img, truth, mask) < blur * 0.6, `checker: ${error(img, truth, mask).toFixed(1)} vs blur ${blur.toFixed(1)}`);
});

test('pixels outside the hole never change; the same input gives the same output', () => {
  const truth = picture(90, 70, (x, y) => [(x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256]);
  const mask = square(90, 70, 30, 20, 15);
  const a = { ...truth, data: new Uint8ClampedArray(truth.data) };
  const b = { ...truth, data: new Uint8ClampedArray(truth.data) };
  inpaint(a, mask);
  inpaint(b, mask);
  for (let i = 0; i < mask.length; i++) if (!mask[i]) for (let c = 0; c < 4; c++) assert.equal(a.data[i * 4 + c], truth.data[i * 4 + c]);
  assert.deepEqual([...a.data], [...b.data], 'deterministic');
  const empty = { ...truth, data: new Uint8ClampedArray(truth.data) };
  inpaint(empty, new Uint8Array(90 * 70));
  assert.deepEqual([...empty.data], [...truth.data], 'no hole, no change');
});

test('brush strokes become a mask at any scale', () => {
  const strokes = [{ points: [[10, 10], [50, 10]], radius: 4 }];
  const full = strokeMask(64, 32, strokes, 1);
  const half = strokeMask(32, 16, strokes, 0.5);
  assert.ok(full[10 * 64 + 30] && full[10 * 64 + 10] && full[10 * 64 + 50], 'along the line');
  assert.ok(!full[25 * 64 + 30], 'not far from it');
  assert.ok(half[5 * 32 + 15], 'scaled');
  const n = (m) => m.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(n(half) * 4 - n(full)) / n(full) < 0.35, 'about a quarter of the pixels at half scale');
});
