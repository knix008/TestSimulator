'use strict';
/* Image fusion (src/js/fusion.js): resampling through patient space, and the stretch fallback. */
const test = require('node:test');
const assert = require('node:assert');
const F = require('../src/js/fusion.js');

// a 4×4 single-frame image at `pos` (axial, 1 mm pixels) whose rendering is uniformly `grey`
const image = (pos, grey = 200) => ({
  width: 4, height: 4, frames: 1,
  frameInfo: () => (pos ? { position: pos, orientation: [1, 0, 0, 0, 1, 0], pixelSpacing: [1, 1] } : {}),
  render: async () => ({ width: 4, height: 4, rgba: new Uint8ClampedArray(64).fill(grey) }),
});

test('mapper: base pixel → overlay pixel through patient coordinates', () => {
  const map = F.mapper(F.geometry(image([0, 0, 0]), 0), F.geometry(image([2, 1, 0]), 0));
  assert.deepStrictEqual(map(3, 3), [1, 2]);
});

test('compose: overlapping images are resampled, a shifted overlay covers only the overlap', async () => {
  const same = await F.compose({ base: image([0, 0, 0]), baseRgba: new Uint8ClampedArray(64), overlay: image([0, 0, 0]), opacity: 1 });
  assert.strictEqual(same.resampled, true);
  assert.strictEqual(same.matched, 16);
  const half = await F.compose({ base: image([0, 0, 0]), baseRgba: new Uint8ClampedArray(64), overlay: image([2, 0, 0]), opacity: 1 });
  assert.strictEqual(half.matched, 8);
});

test('compose: no overlap in patient space or no geometry → stretched over the base', async () => {
  const apart = await F.compose({ base: image([0, 0, 0]), baseRgba: new Uint8ClampedArray(64), overlay: image([500, 500, 0]) });
  assert.strictEqual(apart.noOverlap, true);
  assert.strictEqual(apart.resampled, false);
  assert.strictEqual(apart.matched, 16);
  const flat = await F.compose({ base: image(null), baseRgba: new Uint8ClampedArray(64), overlay: image(null) });
  assert.strictEqual(flat.matched, 16);
  assert.strictEqual(flat.noOverlap, false);
});

test('compose: values under the threshold stay transparent', async () => {
  const r = await F.compose({ base: image([0, 0, 0]), baseRgba: new Uint8ClampedArray(64), overlay: image([0, 0, 0], 5), threshold: 0.05 });
  assert.strictEqual(r.matched, 0);
});
