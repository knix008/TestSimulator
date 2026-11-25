// Spline on Surface (surface-spline.js): the curve lies on the face everywhere (a cylinder: radius constant along
// it), ends on the picked points, follows a periodic face across its seam, and a closed one returns to its start.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { faceSignature } from '../../src/cad/refs.js';
import { buildSurfaceSpline, uvBeziers } from '../../src/cad/surface-spline.js';

await loadKernel();
const R = rep();
const xyz = (p) => [p.x, p.y, p.z];

test('uvBeziers: Catmull-Rom pieces through the points (the sketch spline\'s)', () => {
  const bz = uvBeziers([[0, 0], [10, 5], [20, 0]]);
  assert.equal(bz.length, 2);
  assert.deepEqual(bz[0][0], [0, 0]); assert.deepEqual(bz[1][3], [20, 0]);
  assert.deepEqual(bz[0][2], [10 - 20 / 6, 5]); // the middle tangent (20, 0)/2 over 3
  assert.equal(uvBeziers([[0, 0], [10, 0], [10, 10]], true).length, 3);
});

test('on a cylinder: every point of the curve on the surface, across the seam, ends on the picks', () => {
  const body = R.makeCylinder(10, 40, [0, 0, 0], [0, 0, 1]);
  const face = body.faces.find((f) => f.geomType === 'CYLINDRE');
  // From 300° round through 0° to 60°: across the seam of the periodic surface.
  const at = (deg, z) => [10 * Math.cos((deg * Math.PI) / 180), 10 * Math.sin((deg * Math.PI) / 180), z];
  const pts = [at(300, 5), at(340, 12), at(20, 20), at(60, 30)];
  const r = buildSurfaceSpline({ face: faceSignature(face), points: pts }, { body });
  let worst = 0; let maxAngle = 0;
  for (const e of r.curve.edges) for (let i = 0; i <= 40; i++) { const p = e.pointAt(i / 40); worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.y) - 10)); maxAngle = Math.max(maxAngle, Math.abs(Math.atan2(p.y, p.x))); }
  assert.ok(worst < 1e-5, String(worst));
  // The short way across the seam (never round the back: |angle| stays within 60°).
  assert.ok(maxAngle < (65 * Math.PI) / 180, String(maxAngle));
  const s = xyz(r.curve.startPoint); const e = xyz(r.curve.endPoint);
  pts[0].forEach((v, i) => assert.ok(Math.abs(v - s[i]) < 1e-6));
  pts.at(-1).forEach((v, i) => assert.ok(Math.abs(v - e[i]) < 1e-6));
});

test('a closed spline on a sphere returns to its start and stays on the sphere', () => {
  const body = R.makeSphere(15);
  const face = body.faces[0];
  const pts = [[15, 0, 0], [0, 15, 0], [0, 0, 15].map((v, i) => (i === 2 ? 15 * Math.SQRT1_2 : i === 0 ? -15 * Math.SQRT1_2 : 0))];
  const r = buildSurfaceSpline({ face: faceSignature(face), points: pts, closed: true }, { body });
  let worst = 0;
  for (const e of r.curve.edges) for (let i = 0; i <= 30; i++) { const p = e.pointAt(i / 30); worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.y, p.z) - 15)); }
  assert.ok(worst < 1e-5, String(worst));
  const s = xyz(r.curve.startPoint); const e = xyz(r.curve.endPoint);
  assert.ok(Math.hypot(s[0] - e[0], s[1] - e[1], s[2] - e[2]) < 1e-6);
});
