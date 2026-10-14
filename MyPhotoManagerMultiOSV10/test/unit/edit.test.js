// Editor algorithms and geometry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAdjustments, autoLevels, boxBlur, curveTable, DEFAULT_ADJUST, gaussianBlur, heal, histogram, isNeutral, redEye, toneTables, unsharpMask, vignette } from '../../src/edit/adjust.js';
import { apply, cropForAspect, fitSize, invert, layout, multiply, straightenScale } from '../../src/edit/geometry.js';
import { defaultEdit, isEmptyEdit } from '../../src/edit/pipeline.js';

const image = (w, h, fill) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const [r, g, b] = fill(i % w, Math.floor(i / w)); data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
  return { width: w, height: h, data };
};
const mean = (img, c = 0) => { let s = 0; for (let i = c; i < img.data.length; i += 4) s += img.data[i]; return s / (img.data.length / 4); };

test('neutral settings change nothing', () => {
  const img = image(16, 16, (x, y) => [x * 15, y * 15, 128]);
  const before = Array.from(img.data);
  applyAdjustments(img, DEFAULT_ADJUST);
  assert.deepEqual(Array.from(img.data), before);
  assert.ok(isNeutral({ ...DEFAULT_ADJUST }));
  assert.ok(!isNeutral({ ...DEFAULT_ADJUST, exposure: 0.5 }));
  assert.ok(isNeutral({ ...DEFAULT_ADJUST, curves: { rgb: [[0, 0], [255, 255]] } }));
  const tables = toneTables({});
  for (let i = 0; i < 256; i += 17) assert.equal(tables[0][i], i);
});

// features: EDIT-LIGHT EDIT-COLOR EDIT-EFFECTS
test('exposure, contrast, saturation, white balance, effects move pixels the right way', () => {
  const grey = () => image(8, 8, () => [100, 100, 100]);
  assert.ok(mean(applyAdjustments(grey(), { exposure: 1 })) > 190);
  assert.ok(mean(applyAdjustments(grey(), { brightness: -50 })) < 100);
  const ramp = image(64, 1, (x) => [x * 4, x * 4, x * 4]);
  const contrasted = applyAdjustments({ ...ramp, data: new Uint8ClampedArray(ramp.data) }, { contrast: 60 });
  assert.ok(contrasted.data[4 * 8] < ramp.data[4 * 8] && contrasted.data[4 * 56] > ramp.data[4 * 56], 'darks darker, lights lighter');
  const colour = () => image(4, 4, () => [200, 100, 50]);
  const desat = applyAdjustments(colour(), { saturation: -100 });
  assert.ok(Math.abs(desat.data[0] - desat.data[2]) < 2, 'saturation -100 = grey');
  const warm = applyAdjustments(grey(), { temperature: 100 });
  assert.ok(warm.data[0] > warm.data[2]);
  const bw = applyAdjustments(colour(), { effect: 'grayscale' });
  assert.equal(bw.data[0], bw.data[1]);
  const inverted = applyAdjustments(grey(), { effect: 'invert' });
  assert.equal(inverted.data[0], 155);
  const half = applyAdjustments(grey(), { effect: 'invert', effectAmount: 50 });
  assert.ok(Math.abs(half.data[0] - 127.5) <= 1);
  const lifted = applyAdjustments(image(2, 1, () => [30, 30, 30]), { shadows: 80 });
  assert.ok(lifted.data[0] > 40);
});

// features: EDIT-LEVELS
test('curves and levels', () => {
  const identity = curveTable([[0, 0], [255, 255]]);
  assert.equal(Math.round(identity[128]), 128);
  const brighten = curveTable([[0, 0], [128, 180], [255, 255]]);
  assert.equal(Math.round(brighten[128]), 180);
  for (let i = 1; i < 256; i++) assert.ok(brighten[i] >= brighten[i - 1] - 1e-9, 'monotone');
  const dark = image(32, 32, (x) => [40 + x * 2, 40 + x * 2, 40 + x * 2]);
  const levels = autoLevels(dark, 0);
  assert.ok(levels.black >= 39 && levels.black <= 41 && levels.white >= 99 && levels.white <= 103);
  const stretched = applyAdjustments(dark, { levels });
  assert.ok(Math.min(...Array.from(stretched.data).filter((_, i) => i % 4 === 0)) <= 2);
  const h = histogram(stretched);
  assert.equal(h.r.reduce((a, b) => a + b, 0), 32 * 32);
});

// features: EDIT-DETAIL
test('blur, sharpen, vignette', () => {
  const dot = image(21, 21, (x, y) => (x === 10 && y === 10 ? [255, 255, 255] : [0, 0, 0]));
  boxBlur(dot, 1);
  assert.ok(Math.abs(dot.data[(10 * 21 + 10) * 4] - 255 / 9) < 1.5);
  const edge = image(20, 1, (x) => (x < 10 ? [50, 50, 50] : [200, 200, 200]));
  const sharp = unsharpMask({ ...edge, data: new Uint8ClampedArray(edge.data) }, { amount: 150, radius: 1 });
  assert.ok(sharp.data[9 * 4] < 50 && sharp.data[10 * 4] > 200, 'overshoot at the edge');
  const flat = image(30, 30, () => [128, 128, 128]);
  gaussianBlur(flat, 3);
  assert.equal(flat.data[0], 128);
  const v = vignette(image(41, 41, () => [200, 200, 200]), -100);
  assert.ok(v.data[0] < 50 && v.data[(20 * 41 + 20) * 4] === 200);
});

// features: EDIT-REDEYE EDIT-HEAL
test('red-eye and healing', () => {
  const eye = image(20, 20, (x, y) => ((x - 10) ** 2 + (y - 10) ** 2 < 16 ? [220, 30, 30] : [120, 110, 100]));
  redEye(eye, 10, 10, 5);
  const centre = (10 * 20 + 10) * 4;
  assert.ok(eye.data[centre] < 60, 'red removed');
  assert.equal(eye.data[0], 120, 'outside untouched');
  const spot = image(40, 40, (x, y) => ((x - 20) ** 2 + (y - 20) ** 2 < 9 ? [0, 0, 0] : [150, 160, 170]));
  heal(spot, 20, 20, 5);
  const c = (20 * 40 + 20) * 4;
  assert.ok(Math.abs(spot.data[c] - 150) < 10 && Math.abs(spot.data[c + 2] - 170) < 10, 'spot filled from surroundings');
});

// features: EDIT-CROP EDIT-RESIZE
test('geometry: quarter turns, flips, straighten, crop, resize; inverse maps back', () => {
  const r90 = layout(400, 300, { rotate: 90 });
  assert.deepEqual([r90.width, r90.height], [300, 400]);
  assert.deepEqual(apply(r90.matrix, 0, 0), [300, 0], 'top-left → top-right');
  const flipped = layout(400, 300, { flipH: true });
  assert.deepEqual(apply(flipped.matrix, 0, 0), [400, 0]);
  const cropped = layout(400, 300, { crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } });
  assert.deepEqual([cropped.width, cropped.height], [200, 150]);
  assert.deepEqual(apply(cropped.matrix, 100, 150), [0, 0]);
  const resized = layout(400, 300, { resize: { width: 200, height: 150 } }, { sourceScale: 0.5 });
  assert.deepEqual([resized.width, resized.height], [100, 75]);
  const tilted = layout(400, 300, { straighten: 10 });
  const k = straightenScale(400, 300, 10);
  assert.ok(k < 1 && k > 0.7);
  assert.deepEqual([tilted.width, tilted.height], [Math.round(400 * k), Math.round(300 * k)]);
  // Every output corner comes from inside the source (no empty corners).
  const inverse = invert(tilted.matrix);
  for (const [x, y] of [[0, 0], [tilted.width, 0], [0, tilted.height], [tilted.width, tilted.height]]) {
    const [sx, sy] = apply(inverse, x, y);
    assert.ok(sx >= -0.5 && sy >= -0.5 && sx <= 400.5 && sy <= 300.5, `${x},${y} → ${sx},${sy}`);
  }
  const all = layout(400, 300, { rotate: 270, flipV: true, straighten: -5, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
  const back = multiply(invert(all.matrix), all.matrix);
  assert.ok(Math.abs(back[0] - 1) < 1e-9 && Math.abs(back[3] - 1) < 1e-9 && Math.abs(back[4]) < 1e-9);
  assert.deepEqual(cropForAspect(400, 300, 1), { x: 0.125, y: 0, w: 0.75, h: 1 });
  assert.deepEqual(fitSize(4000, 3000, 1920, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(fitSize(400, 300, 1920, 1920), { width: 400, height: 300 });
});

test('empty edit detection', () => {
  const edit = defaultEdit();
  assert.ok(isEmptyEdit(edit));
  edit.geometry.rotate = 90;
  assert.ok(!isEmptyEdit(edit));
  const text = defaultEdit();
  text.overlay.texts.push({ text: 'x' });
  assert.ok(!isEmptyEdit(text));
});
