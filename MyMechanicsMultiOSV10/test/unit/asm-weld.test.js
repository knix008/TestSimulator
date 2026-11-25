// Assembly weld beads: a fillet bead where an edge of one component stands on a face of another; its volume is the
// triangle (legs = weld size) times the length (straight) or times the path of its centroid (round).
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { weldBeads } from '../../src/cad/asm-weld.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
before(async () => { await loadKernel(); });

test('a plate standing on a plate: one straight bead along the outer foot edge', () => {
  const R = rep();
  const base = R.makeBox([0, 0, 0], [100, 100, 10]);
  const wall = R.makeBox([20, 20, 10], [30, 80, 50]);
  const top = base.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6);
  const edge = wall.edges.find((e) => e.geomType === 'LINE' && Math.abs(e.startPoint.z - 10) < 1e-6 && Math.abs(e.endPoint.z - 10) < 1e-6 && Math.abs(e.startPoint.x - 30) < 1e-6 && Math.abs(e.endPoint.x - 30) < 1e-6);
  const w = weldBeads(wall, [edge], top, 5);
  near(w.length, 60, 1e-6);
  near(w.volume, 0.5 * 5 * 5 * 60, 1e-6);
  // Outside both plates: it touches them only.
  near(R.measureVolume(w.bead.clone().intersect(wall)), 0, 1e-6);
  near(R.measureVolume(w.bead.clone().intersect(base)), 0, 1e-6);
  const bb = w.bead.boundingBox.bounds;
  near(bb[0][0], 30, 1e-6); near(bb[1][0], 35, 1e-6); near(bb[1][2], 15, 1e-6);
});

test('a tube on a flange: a round bead all the way round', () => {
  const R = rep();
  const base = R.makeBox([-50, -50, 0], [50, 50, 10]);
  const tube = R.makeCylinder(10, 30, [0, 0, 10], [0, 0, 1]);
  const top = base.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6);
  const edge = tube.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 10) < 1e-6);
  const w = weldBeads(tube, [edge], top, 3);
  near(w.volume, 0.5 * 3 * 3 * 2 * Math.PI * (10 + 1), 1e-3);
  near(R.measureVolume(w.bead.clone().intersect(tube)), 0, 1e-6);
});

test('an edge that is not on the face is refused', () => {
  const R = rep();
  const base = R.makeBox([0, 0, 0], [100, 100, 10]);
  const wall = R.makeBox([20, 20, 12], [30, 80, 50]);
  const top = base.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6);
  const edge = wall.edges.find((e) => Math.abs(e.startPoint.z - 12) < 1e-6 && Math.abs(e.endPoint.z - 12) < 1e-6);
  assert.throws(() => weldBeads(wall, [edge], top, 5), /weld-not-on-face/);
});
