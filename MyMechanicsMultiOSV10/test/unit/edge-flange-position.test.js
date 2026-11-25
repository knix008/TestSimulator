// Edge flange position (bend outside / material inside / material outside / virtual sharp), length reference and
// width offsets (advanced.js buildEdgeFlange).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

function flange(opts, flat = false) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, 0, 0, 100, 50); part.features.push(s);
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 3, kFactor: 0.4 }));
  const r0 = regenerate(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.99 && e.endPoint.z > 1.99);
  part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90, ...opts }));
  const r = regenerate({ ...part, flat });
  for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`);
  return opts.__volume ? R.measureVolume(r.body) : r.body.boundingBox.bounds;
}
const volumeOf = (opts) => flange({ ...opts, __volume: true });

test('flange positions put the flange outside, on, or inside the edge', () => {
  near(flange({})[1][0], 105);
  near(flange({ position: 'materialOutside' })[1][0], 102);
  near(flange({ position: 'materialInside' })[1][0], 100);
  near(flange({ position: 'virtualSharp' })[1][0], 100);
});

test('length measured from the outer virtual sharp; width offsets from the edge ends; the flat pattern agrees', () => {
  const tangent = flange({})[1][2]; const sharp = flange({ lengthRef: 'outerSharp' })[1][2];
  near(tangent - sharp, 5);
  // Outer virtual sharp to the flange's top: the base's bottom (z = 0) to its top is the length.
  near(sharp, 30);
  const [lo, hi] = flange({ offsetStart: 10, offsetEnd: 5, position: 'materialInside' });
  near(hi[0], 100); near(lo[1], 0); near(hi[1], 50); // the base keeps its width
  const flat = flange({ position: 'materialInside' }, true);
  // Flat: the base shortened by r + t, then the bend allowance and the flange.
  near(flat[1][0] - flat[0][0], 100 - 5 + (Math.PI / 2) * (3 + 0.4 * 2) + 30, 1e-6);
});

test('an edited flange profile: a trapezoid tab narrowing from the full width at the bend to 20 at its end', () => {
  const pts = [{ u: 0, v: 0 }, { u: 50, v: 0 }, { u: 35, v: 30 }, { u: 15, v: 30 }];
  const [, hi] = flange({ profilePts: pts });
  near(hi[2], 2 + 3 + 30); near(hi[0], 105);
  // Sheet + the bend (full width) + the trapezoid (area (50 + 20) / 2 · 30), all 2 thick.
  near(volumeOf({ profilePts: pts }), 100 * 50 * 2 + (Math.PI / 4) * (25 - 9) * 50 + 35 * 30 * 2, 1e-6);
  // The flat pattern carries the same tab, laid flat past the bend allowance.
  const flat = flange({ profilePts: pts }, true);
  near(flat[1][0] - flat[0][0], 100 + (Math.PI / 2) * (3 + 0.4 * 2) + 30, 1e-6);
});
