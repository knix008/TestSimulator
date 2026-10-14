// Selection masks for local adjustments: lasso polygon, magic wand, colour
// range (pixel targeting), feathering, and their use in the edit pipeline.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorRangeMask, featherMask, polygonMask, wandMask } from '../../src/edit/advanced.js';

function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; }
  return { width: w, height: h, data };
}
const sum = (m) => m.reduce((s, v) => s + v, 0);

test('lasso: the inside of the polygon, area right, feather softens the edge', () => {
  const hard = polygonMask(40, 30, [[10, 5], [30, 5], [30, 25], [10, 25]], 0);
  assert.equal(sum(hard), 20 * 20, 'a 20 × 20 square');
  assert.equal(hard[15 * 40 + 20], 1);
  assert.equal(hard[2 * 40 + 2], 0);
  const soft = polygonMask(40, 30, [[10, 5], [30, 5], [30, 25], [10, 25]], 3);
  assert.ok(soft[15 * 40 + 20] > 0.95, 'centre still selected');
  assert.ok(soft[15 * 40 + 9] > 0 && soft[15 * 40 + 9] < 0.6, 'edge soft');
  assert.ok(Math.abs(sum(soft) - 400) < 25, 'feathering keeps about the same area');
  // A triangle (even–odd fill).
  const tri = polygonMask(20, 20, [[0, 0], [20, 0], [0, 20]], 0);
  assert.ok(Math.abs(sum(tri) - 200) < 15, `triangle ${sum(tri)}`);
  assert.equal(sum(polygonMask(10, 10, [[1, 1], [5, 5]], 0)), 0, 'two points are no polygon');
});

test('magic wand: the connected area of similar colour only', () => {
  // Left half red, right half blue, plus a separate red square on the right.
  const img = picture(40, 20, (x, y) => (x < 20 || (x >= 30 && x < 35 && y >= 5 && y < 10) ? [220, 30, 30] : [30, 40, 210]));
  const m = wandMask(img, 5, 5, 40, 0);
  assert.equal(sum(m), 20 * 20, 'the left half');
  assert.equal(m[7 * 40 + 32], 0, 'the separate red square is not connected');
  const wide = wandMask(img, 5, 5, 255, 0);
  assert.equal(sum(wide), 40 * 20, 'tolerance 255 takes everything');
  assert.equal(sum(wandMask(img, -5, 5, 40, 0)), 0, 'outside the picture');
});

test('colour range: hue, saturation and lightness limits with soft edges', () => {
  const img = picture(5, 1, (x) => [[255, 0, 0], [255, 120, 0], [0, 0, 255], [128, 128, 128], [40, 0, 0]][x]);
  const red = colorRangeMask(img, { hue: 0, range: 20, soft: 10 });
  assert.equal(red[0], 1, 'pure red');
  assert.ok(red[1] > 0 && red[1] < 0.5, `orange (28°) is in the soft edge of ±20°: ${red[1]}`);
  assert.equal(red[2], 0, 'blue');
  assert.equal(red[3], 0, 'grey has no hue');
  assert.equal(red[4], 1, 'dark red is still red');
  const bright = colorRangeMask(img, { hue: 0, range: 20, lumMin: 30, soft: 10 });
  assert.equal(bright[4], 0, 'too dark for lumMin 30');
  const tones = colorRangeMask(img, { hue: null, lumMin: 40, lumMax: 60, soft: 1 });
  assert.equal(tones[3], 1, 'mid grey is in the tonal range');
  assert.equal(tones[4], 0, 'dark red is not');
  const sat = colorRangeMask(img, { hue: null, satMin: 50, soft: 1 });
  assert.equal(sat[3], 0, 'grey fails the saturation limit');
  assert.equal(sat[0], 1);
});

test('feathering a single pixel spreads it without changing the total much', () => {
  const m = new Float32Array(21 * 21);
  m[10 * 21 + 10] = 1;
  featherMask(m, 21, 21, 2);
  assert.ok(Math.abs(sum(m) - 1) < 1e-3, `total ${sum(m)}`);
  assert.ok(m[10 * 21 + 10] < 1 && m[10 * 21 + 12] > 0, 'spread');
});

test('layer masks: gradient presets, ellipse, painted brush (reveal / hide), invert', async () => {
  const { layerMask } = await import('../../src/edit/pipeline.js');
  const top = layerMask({ kind: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 0.6 }, 10, 100);
  assert.ok(top[0] > 0.99 && top[99 * 10] === 0, 'top shows, bottom hidden');
  const inv = layerMask({ kind: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 0.6, invert: true }, 10, 100);
  assert.ok(inv[0] < 0.01 && inv[99 * 10] === 1, 'inverted');
  const ellipse = layerMask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, feather: 0 }, 100, 100);
  assert.equal(ellipse[50 * 100 + 50], 1);
  assert.equal(ellipse[2 * 100 + 2], 0);
  const painted = layerMask({ kind: 'brush', base: 0, strokes: [{ points: [[0.2, 0.5], [0.8, 0.5]], radius: 0.1, hardness: 0.9 }] }, 100, 100);
  assert.ok(painted[50 * 100 + 50] > 0.9 && painted[5 * 100 + 50] === 0, 'painted band only');
  const hidden = layerMask({ kind: 'brush', base: 1, strokes: [{ points: [[0.5, 0.5]], radius: 0.1, hardness: 0.9, erase: true }] }, 100, 100);
  assert.ok(hidden[50 * 100 + 50] < 0.1 && hidden[5 * 100 + 5] === 1, 'starts revealed, erase hides');
});

// features: EDIT-WHEELS
test('colour balance wheels: each range tints its tones, the others stay put', async () => {
  const { colorBalance } = await import('../../src/edit/advanced.js');
  const make = () => ({ width: 3, height: 1, data: new Uint8ClampedArray([20, 20, 20, 255, 128, 128, 128, 255, 235, 235, 235, 255]) });
  const blueHighlights = colorBalance(make(), { highlights: { hue: 240, amount: 100 } });
  const [dark, mid, bright] = [0, 4, 8].map((i) => [...blueHighlights.data.subarray(i, i + 3)]);
  assert.ok(bright[2] > bright[0] + 40, `bright pixel turns blue ${bright}`);
  assert.ok(Math.abs(dark[2] - dark[0]) < 3, `dark pixel nearly untouched ${dark}`);
  assert.ok(mid[2] > mid[0], 'some blue in the middle');
  const warmShadows = colorBalance(make(), { shadows: { hue: 30, amount: 80 } });
  assert.ok(warmShadows.data[0] > warmShadows.data[2] + 20, 'shadows warm');
  assert.ok(Math.abs(warmShadows.data[8] - warmShadows.data[10]) < 4, 'highlights untouched');
  const none = colorBalance(make(), { midtones: { hue: 100, amount: 0 } });
  assert.deepEqual([...none.data], [...make().data], 'amount 0 = no change');
});
