// Silhouette Entities (sketch-silhouette.js): the outline of a body seen square to the sketch plane as exact sketch
// curves — a lying cylinder's outline as four lines (its round ends seen edge on merged), a sphere as one circle,
// a through hole kept only by the internal silhouette, and the silhouette on a plane that is not the XY plane.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createSketchGeometry, profiles } from '../../src/cad/sketch.js';
import { silhouetteEntities } from '../../src/cad/sketch-silhouette.js';

await loadKernel();
const R = rep();
const XY = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };
const areas = (s) => profiles(s).map((p) => [Math.round(p.outer.area * 1000) / 1000, p.holes.length]).sort((a, b) => a[0] - b[0]);

test('a lying cylinder and a plate with a through hole: external and internal silhouettes', () => {
  const body = R.makeCylinder(5, 30, [0, 0, 10], [1, 0, 0]).fuse(R.makeBox([40, -10, 0], [60, 10, 5]).cut(R.makeCylinder(3, 20, [50, 0, -5], [0, 0, 1])));
  const ext = createSketchGeometry(); const m1 = silhouetteEntities(ext, XY, body, { mode: 'external' });
  assert.equal(m1.length, 8); assert.ok(m1.every((e) => e.type === 'line'));
  assert.deepEqual(areas(ext), [[300, 0], [400, 0]]);
  const int = createSketchGeometry(); const m2 = silhouetteEntities(int, XY, body, { mode: 'internal' });
  assert.equal(m2.filter((e) => e.type === 'circle').length, 1);
  assert.deepEqual(areas(int), [[300, 0], [400, 1]]);
});

test('a sphere is one circle; a standing cylinder seen from its side is a rectangle', () => {
  const s = createSketchGeometry();
  const m = silhouetteEntities(s, XY, R.makeSphere(8));
  assert.equal(m.length, 1); assert.equal(m[0].type, 'circle'); assert.ok(Math.abs(m[0].r - 8) < 1e-6);
  const side = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, 1], normal: [0, -1, 0] };
  const c = createSketchGeometry();
  const made = silhouetteEntities(c, side, R.makeCylinder(6, 12, [0, 0, 0], [0, 0, 1]));
  assert.equal(made.length, 4);
  assert.deepEqual(areas(c), [[144, 0]]);
});

test('the silhouette on a sloped plane is the body seen square to it', () => {
  const box = R.makeBox([0, 0, 0], [10, 20, 30]);
  const n = [0, -Math.SQRT1_2, Math.SQRT1_2];
  const fr = { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, Math.SQRT1_2, Math.SQRT1_2], normal: n };
  const s = createSketchGeometry();
  silhouetteEntities(s, fr, box);
  // Seen along (0, -1, 1)/√2 the box's outline: x 10 wide by the projected y–z extent (20 + 30)/√2.
  const [[a]] = areas(s);
  assert.ok(Math.abs(a - 10 * (20 + 30) * Math.SQRT1_2) < 1e-3, String(a));
});
