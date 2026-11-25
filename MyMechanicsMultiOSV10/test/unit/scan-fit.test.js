// Scan to solid (cad/scan-fit.js): a noisy fine mesh of a block with a through hole, a blind hole and a boss comes
// back as 8 exact planes and 3 exact cylinders of the right radii and the volume; fitting helpers on their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { scanToSolid, weld, segmentMesh, snapVertices } from '../../src/cad/scan-fit.js';

await loadKernel();
const R = rep();

/** A mesh of `shape` with every position moved by up to ±amp in each axis (the same move for coincident corners). */
function noisy(shape, amp, tol = 0.01) {
  const mesh = shape.mesh({ tolerance: tol, angularTolerance: 0.05 });
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  const moved = new Map(), V = Float32Array.from(mesh.vertices);
  for (let i = 0; i < V.length; i += 3) {
    const k = `${Math.round(V[i] * 1e4)},${Math.round(V[i + 1] * 1e4)},${Math.round(V[i + 2] * 1e4)}`;
    let d = moved.get(k); if (!d) { d = [rnd() * 2 * amp, rnd() * 2 * amp, rnd() * 2 * amp]; moved.set(k, d); }
    V[i] += d[0]; V[i + 1] += d[1]; V[i + 2] += d[2];
  }
  return { vertices: V, triangles: mesh.triangles };
}

const block = () => {
  let b = R.makeBox([0, 0, 0], [80, 50, 20]);
  b = b.cut(R.makeCylinder(8, 30, [20, 25, -5], [0, 0, 1]));     // through hole Ø16
  b = b.cut(R.makeCylinder(5, 8, [40, 25, 12], [0, 0, 1]));      // blind hole Ø10 × 8
  return b.fuse(R.makeCylinder(6, 10, [62, 25, 20], [0, 0, 1])); // boss Ø12 × 10
};

test('a noisy scan of a block with holes and a boss: 8 planes and 3 exact cylinders, the volume kept', () => {
  const body = block();
  const r = scanToSolid(noisy(body, 0.01), { tol: 0.03 });
  assert.equal(r.report.planes, 8);
  assert.equal(r.report.cylinders, 3);
  assert.equal(r.report.exactCylinders, 3);
  const radii = r.report.regions.filter((x) => x.kind === 'cylinder').map((x) => x.radius).sort((a, b) => a - b);
  [5, 6, 8].forEach((want, i) => assert.ok(Math.abs(radii[i] - want) < 0.01, `${radii}`));
  const kinds = {}; for (const f of r.shape.faces) kinds[f.geomType] = (kinds[f.geomType] ?? 0) + 1;
  assert.deepEqual(kinds, { PLANE: 8, CYLINDRE: 3 });
  const v0 = R.measureVolume(body), v1 = R.measureVolume(r.shape);
  assert.ok(Math.abs(v1 / v0 - 1) < 5e-4, `${v0} → ${v1}`);
  // The blind hole keeps its bottom (8 deep): the solid is closed there.
  const bottom = r.shape.faces.filter((f) => f.geomType === 'PLANE').some((f) => Math.abs(f.center.z - 12) < 0.05 && Math.abs(f.center.x - 40) < 0.05);
  assert.ok(bottom, 'the blind hole’s floor');
});

test('segmentation and snapping: a plain noisy box gives 6 planes, its corners snapped to the planes’ meeting points', () => {
  const box = R.makeBox([0, 0, 0], [40, 30, 10]);
  const W = weld(noisy(box, 0.02, 0.05));
  const seg = segmentMesh(W, { tol: 0.06 });
  assert.equal(seg.regions.filter((x) => x.kind === 'plane').length, 6);
  const P = snapVertices(W, seg);
  const corner = P.reduce((best, p) => (Math.hypot(...p) < Math.hypot(...best) ? p : best));
  assert.ok(Math.hypot(...corner) < 0.03, `${corner}`);
});

test('a free-form part (a torus) stays as it is, faceted, when nothing analytic fits', () => {
  const torus = R.drawCircle(5).translate(20, 0).sketchOnPlane('XZ').revolve();
  const r = scanToSolid(torus.mesh({ tolerance: 0.05, angularTolerance: 0.2 }), {});
  assert.ok(r.report.freeform >= 1 && r.report.exactCylinders === 0);
  assert.ok(Math.abs(R.measureVolume(r.shape) / R.measureVolume(torus) - 1) < 0.02);
});
