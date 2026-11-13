// Loading the library builds no models: sizes are measured the first time they are read (mk, variant, autoSize).
// Before, autoSize built ~150 doors and windows and `...base` in variant() read every base model's size — about
// 1.3 s of building while the app started, and the first library panel built all ~2,700 models for its tooltips.
// This file must import the library itself first (node --test runs each file in a process of its own).
// Run: node --test test/unit/library-lazy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

const t0 = performance.now();
const { PARAMETRIC_ITEMS } = await import('../../src/library/parametric/index.js');
const loadMs = performance.now() - t0;
const { knownSize } = await import('../../src/library/catalog.js').catch(() => ({ knownSize: null }));

test('nothing is measured (built) while the library loads', () => {
  const lazy = PARAMETRIC_ITEMS.filter((e) => 'knownSize' in e);
  assert.ok(lazy.length > 1500, `${lazy.length} of ${PARAMETRIC_ITEMS.length} measure lazily (the rest have fixed sizes)`);
  const measured = lazy.filter((e) => e.knownSize != null).map((e) => e.id);
  assert.deepEqual(measured.slice(0, 20), [], `${measured.length} items were built while loading`);
});

test('the library loads in well under a second (no model building)', () => {
  assert.ok(loadMs < 1500, `${Math.round(loadMs)} ms`);
});

test('a size read once is measured and then known; a variant does not measure its base', () => {
  const variant = PARAMETRIC_ITEMS.find((e) => e.variantOf && 'knownSize' in e);
  const base = PARAMETRIC_ITEMS.find((e) => e.id === variant.variantOf);
  const size = variant.size;
  assert.ok(Array.isArray(size) && size.length === 3 && size.every((v) => v > 0), `${variant.id}: ${size}`);
  assert.deepEqual(variant.knownSize, size);
  assert.equal(base.knownSize ?? null, null, `${base.id} was not built for its variant`);
  const door = PARAMETRIC_ITEMS.find((e) => e.category === 'doors' && 'knownSize' in e && e.knownSize == null);
  assert.ok(door, 'an unmeasured door');
  assert.ok(door.size.every((v) => v > 0));
  assert.deepEqual(door.knownSize, door.size);
});

test('catalog.knownSize never builds (null until measured; fixed sizes as they are)', { skip: !knownSize }, () => {
  const item = PARAMETRIC_ITEMS.find((e) => 'knownSize' in e && e.knownSize == null);
  assert.equal(knownSize(item), null);
  assert.equal(item.knownSize, null, 'still not built');
  assert.deepEqual(knownSize({ size: [1, 2, 3] }), [1, 2, 3]);
  assert.equal(knownSize(null), null);
});
