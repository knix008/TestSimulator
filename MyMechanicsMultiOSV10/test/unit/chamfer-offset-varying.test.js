// Offset-face chamfer where the cross-section changes along the edge (dressup-more.js variableOffsetChamfer): the
// elliptical rim where a cylinder meets a tilted plane — the angle between the faces changes all the way round.
// Every point of the chamfer's boundary on the cylinder, moved 1 mm into the material, lies 1 mm from the plane.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { chamferMore } from '../../src/cad/dressup-more.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { planeFace } from '../../src/cad/extrude-more.js';

await loadKernel();
const R = rep();

test('a cylinder cut by a 30° plane: offset-face chamfer 1 / 1 on its elliptical rim', () => {
  const a = (30 * Math.PI) / 180; const n = [Math.sin(a), 0, Math.cos(a)]; const o = [0, 0, 15];
  const body = R.makeCylinder(10, 30, [0, 0, 0], [0, 0, 1]).cut(R.basicFaceExtrusion(planeFace(o, n, 100), new R.Vector(n.map((v) => v * 100))));
  const rim = body.edges.find((e) => e.geomType !== 'LINE' && e.boundingBox.bounds[1][2] > 15.5);
  const r = chamferMore({ kind: 'offsetFace', edges: [edgeSignature(rim)], distance: 1, distance2: 1 }, { body });
  const removed = R.measureVolume(body) - R.measureVolume(r.body);
  assert.ok(removed > 30 && removed < 50, String(removed));
  let worst = 0; let k = 0;
  for (const e of r.body.edges) {
    if (e.geomType === 'LINE') continue;
    for (let i = 1; i < 20; i++) {
      const p = e.pointAt(i / 20); const P = [p.x, p.y, p.z]; const rr = Math.hypot(P[0], P[1]);
      const dpl = (P[0] - o[0]) * n[0] + (P[1] - o[1]) * n[1] + (P[2] - o[2]) * n[2];
      // On the cylinder, below the plane, near the top: the chamfer's lower boundary.
      if (Math.abs(rr - 10) > 1e-4 || dpl > -1e-4 || dpl < -4) continue;
      const Q = [P[0] - P[0] / rr, P[1] - P[1] / rr, P[2]];
      worst = Math.max(worst, Math.abs(-((Q[0] - o[0]) * n[0] + (Q[1] - o[1]) * n[1] + (Q[2] - o[2]) * n[2]) - 1)); k++;
    }
  }
  assert.ok(k > 50, String(k));
  assert.ok(worst < 2e-3, String(worst));
});
