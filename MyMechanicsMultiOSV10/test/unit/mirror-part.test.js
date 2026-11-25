// Mirror Part (Insert Part with a mirror plane): the opposite-hand part has the same volume, its box mirrored, and it
// follows the original when that changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createSketchGeometry, addRectangle } from '../../src/cad/sketch.js';

await loadKernel();
const R = rep();

test('an L block mirrored about the Right plane: same volume, box mirrored in x; it follows the original', () => {
  const src = { id: 'a', name: 'A', features: [] };
  const sk = createFeature(src, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  addRectangle(sk, 5, 0, 30, 10); src.features.push(sk);
  const ex = createFeature(src, 'extrude', { sketch: sk.id, depth: 8 }); src.features.push(ex);
  const mir = { id: 'b', name: 'B', features: [] };
  mir.features.push(createFeature(mir, 'insertPart', { part: 'a', mirror: 'right' }));
  const project = { parts: [src, mir] };
  const b = regenerate(mir, { project }).body;
  assert.ok(Math.abs(R.measureVolume(b) - 25 * 10 * 8) < 1e-6);
  const [lo, hi] = b.boundingBox.bounds;
  assert.ok(Math.abs(lo[0] + 30) < 1e-6 && Math.abs(hi[0] + 5) < 1e-6, JSON.stringify([lo, hi]));
  ex.depth = 12;
  assert.ok(Math.abs(R.measureVolume(regenerate(mir, { project }).body) - 25 * 10 * 12) < 1e-6);
});
