// Splines: style splines (one Bézier of degree 3, 5 or 7 on its control polygon) through to a solid, tangent
// handles on an interpolating spline's points, and the curvature comb (exact curvature of the Bézier pieces).
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../src/cad/features.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createSketchGeometry, addLine, byId, splineBeziers, bezierPoint, polyline, profiles, endTangent } from '../../src/cad/sketch.js';
import { addSpline, addStyleSpline, curvatureComb } from '../../src/cad/sketchtools.js';

await loadKernel();
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('a degree-5 style spline passes through its first and last control points only', () => {
  const s = createSketchGeometry();
  const ctrl = [[0, 0], [10, 20], [20, -10], [30, 25], [40, -5], [50, 0]];
  const sp = addStyleSpline(s, ctrl);
  const bz = splineBeziers(s, sp);
  assert.equal(bz.length, 1); assert.equal(bz[0].length, 6);
  const pts = polyline(s, sp);
  assert.deepEqual(pts[0], [0, 0]); near(pts.at(-1)[0], 50); near(pts.at(-1)[1], 0);
  // The middle control points are construction points (not on the curve).
  assert.ok(sp.pts.slice(1, -1).every((id) => byId(s, id).construction));
  // Bernstein check at t = 0.5: Σ C(5,i)/32 · P_i.
  const C = [1, 5, 10, 10, 5, 1];
  const want = ctrl.reduce((m, p, i) => [m[0] + (C[i] / 32) * p[0], m[1] + (C[i] / 32) * p[1]], [0, 0]);
  const got = bezierPoint(bz[0], 0.5);
  near(got[0], want[0], 1e-12); near(got[1], want[1], 1e-12);
});

test('a profile closed by a degree-5 style spline extrudes to the exact area (kernel Bézier of that degree)', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const sk = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() });
  const ctrl = [[0, 0], [10, 20], [20, 10], [30, 25], [40, 15], [50, 0]];
  const sp = addStyleSpline(sk, ctrl);
  addLine(sk, 0, 0, 0, 0, { from: sp.pts.at(-1), to: sp.pts[0] });
  part.features.push(sk);
  assert.equal(profiles(sk).length, 1);
  part.features.push(createFeature(part, 'extrude', { sketch: sk.id, depth: 10 }));
  const r = regenerate(part);
  assert.ok(r.body, 'a solid');
  // Area under a Bézier above the chord y = 0 (Green's theorem on the exact curve, fine numeric integration).
  let A = 0; const N = 20000; let prev = bezierPoint(ctrl, 0);
  for (let i = 1; i <= N; i++) { const q = bezierPoint(ctrl, i / N); A += (prev[0] * q[1] - q[0] * prev[1]) / 2; prev = q; }
  near(rep().measureVolume(r.body), Math.abs(A) * 10, 1e-4);
});

test('a tangent handle turns the spline at its point; weight changes how far the tangent reaches', () => {
  const s = createSketchGeometry();
  const sp = addSpline(s, [[0, 0], [20, 10], [40, 0]]);
  const ang = (bz) => (Math.atan2(bz[1][1][1] - bz[1][0][1], bz[1][1][0] - bz[1][0][0]) * 180) / Math.PI;
  near(ang(splineBeziers(s, sp)), 0, 1e-9); // natural tangent at the middle: horizontal
  sp.handles = { 1: { angle: 30, weight: 1 } };
  near(ang(splineBeziers(s, sp)), 30, 1e-9);
  const reach = (bz) => Math.hypot(bz[1][1][0] - bz[1][0][0], bz[1][1][1] - bz[1][0][1]);
  const r1 = reach(splineBeziers(s, sp));
  sp.handles[1].weight = 2;
  near(reach(splineBeziers(s, sp)), 2 * r1, 1e-9);
  // The incoming piece ends with the same direction (G1 at the point).
  const bz = splineBeziers(s, sp);
  const inc = Math.atan2(bz[0][3][1] - bz[0][2][1], bz[0][3][0] - bz[0][2][0]) * 180 / Math.PI;
  near(inc, 30, 1e-9);
  // The solver's end tangent of a handled end.
  sp.handles = { 0: { angle: 90, weight: 1 } };
  const t0 = endTangent(sp, sp.pts[0], (id) => { const p = byId(s, id); return [p.x, p.y]; }, new Map(s.entities.map((e) => [e.id, e])));
  near(Math.atan2(t0[1], t0[0]), Math.PI / 2, 1e-9);
});

test('the curvature comb: exact curvature of the Bézier (a cubic close to a circle reads 1/r within 3 %)', () => {
  // The standard cubic quarter circle of radius 10 (k = 0.5523).
  const s = createSketchGeometry();
  const k = 0.5522847498 * 10;
  const sp = addStyleSpline(s, [[10, 0], [10, k], [k, 10], [0, 10]]);
  const teeth = curvatureComb(s, sp, { samples: 16 });
  for (const q of teeth) assert.ok(Math.abs(q.k - 0.1) < 0.1 * 0.03, String(q.k));
  // Teeth point outward from a counterclockwise bend (away from the centre).
  const mid = teeth[Math.floor(teeth.length / 2)];
  assert.ok(Math.hypot(...mid.tip) > Math.hypot(...mid.at));
});
