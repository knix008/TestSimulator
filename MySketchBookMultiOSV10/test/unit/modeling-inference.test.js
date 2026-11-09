// Inference engine (src/modeling/inference.js): SketchUp-style snapping as pure math.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infer, projectRayToAxis, projectRayToPlane, closestPointsRaySegment, candidatesFromMesh } from '../../src/modeling/inference.js';
import { GeoMesh } from '../../src/modeling/mesh.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);
const closeP = (p, q, tol = 1e-6) => { close(p.x, q[0], tol); close(p.y, q[1], tol); close(p.z, q[2], tol); };
// top view: looking straight down at (x, z); 1 px = 1 cm, so 10 px = 0.1 m
const down = (x, z) => ({ origin: { x, y: 10, z }, direction: { x: 0, y: -1, z: 0 } });
const base = (x, z, extra = {}) => ({ ray: down(x, z), pixelSize: 0.01, tolerancePx: 10, ...extra });
const square = { edges: [
  { a: [0, 0, 0], b: [1, 0, 0], ref: 'e1' }, { a: [1, 0, 0], b: [1, 0, 1], ref: 'e2' },
  { a: [1, 0, 1], b: [0, 0, 1], ref: 'e3' }, { a: [0, 0, 1], b: [0, 0, 0], ref: 'e4' },
], faces: [{ plane: { normal: [0, 1, 0], constant: 0 }, contains: (p) => p.x >= 0 && p.x <= 1 && p.z >= 0 && p.z <= 1, ref: 'f1' }] };

test('helpers: ray to axis, ray to plane, ray to segment', () => {
  const r = { origin: [0, 5, 0], direction: [0, -1, 0] };
  const a = projectRayToAxis(r, [0, 0, 2], [0, 0, 1]);
  closeP(a.point, [0, 0, 0]);
  close(a.distance, 0);
  close(a.t, -2);
  closeP(projectRayToPlane(r, { normal: [0, 1, 0], constant: -1 }), [0, 1, 0]);
  closeP(projectRayToPlane(r, { normal: [0, 1, 0], point: [0, 2, 0] }), [0, 2, 0]);
  assert.equal(projectRayToPlane(r, { normal: [0, 1, 0], constant: -6 }), null); // behind
  assert.equal(projectRayToPlane(r, { normal: [1, 0, 0], constant: 0 }), null); // parallel
  const s = closestPointsRaySegment({ origin: [0.5, 5, 0.2], direction: [0, -1, 0] }, [0, 0, 0], [1, 0, 0]);
  closeP(s.pointOnSegment, [0.5, 0, 0]);
  close(s.segT, 0.5);
  close(s.distance, 0.2);
});

test('endpoint wins over midpoint, on-edge and the face', () => {
  const r = infer(base(0.97, 0.04, { candidates: square }));
  assert.equal(r.kind, 'endpoint');
  closeP(r.point, [1, 0, 0]);
  assert.equal(r.tooltipKey, 'inference.endpoint');
});

test('midpoint, then on-edge, then on-face, then ground', () => {
  let r = infer(base(0.52, 0.03, { candidates: square }));
  assert.equal(r.kind, 'midpoint');
  closeP(r.point, [0.5, 0, 0]);
  r = infer(base(0.3, 0.03, { candidates: square }));
  assert.equal(r.kind, 'onEdge');
  closeP(r.point, [0.3, 0, 0]);
  assert.equal(r.ref, 'e1');
  r = infer(base(0.4, 0.4, { candidates: square }));
  assert.equal(r.kind, 'onFace');
  assert.equal(r.ref, 'f1');
  closeP(r.point, [0.4, 0, 0.4]);
  r = infer(base(3, 3, { candidates: square }));
  assert.equal(r.kind, 'ground');
  closeP(r.point, [3, 0, 3]);
  r = infer({ ray: { origin: [0, 1, 0], direction: [0, 1, 0] }, pixelSize: 0.01, candidates: {} });
  assert.equal(r.kind, 'free');
});

test('intersection of two edges near the cursor', () => {
  const r = infer(base(0.35, 0.32, { candidates: { edges: [{ a: [0, 0, 0], b: [1, 0, 1], ref: 'd1' }, { a: [1, 0, 0], b: [0, 0, 0.5], ref: 'd2' }] } }));
  assert.equal(r.kind, 'intersection');
  closeP(r.point, [1 / 3, 0, 1 / 3]);
  assert.deepEqual(r.ref, ['d1', 'd2']);
});

test('axis inference from the last point (red / green / blue)', () => {
  const from = [0, 0, 0];
  let r = infer(base(2, 0.05, { from, candidates: {} }));
  assert.equal(r.kind, 'axisX');
  closeP(r.point, [2, 0, 0]);
  closeP(r.lineFrom, [0, 0, 0]);
  r = infer(base(0.04, 1.5, { from, candidates: {} }));
  assert.equal(r.kind, 'axisZ');
  closeP(r.point, [0, 0, 1.5]);
  // off-axis: falls back to the ground
  r = infer(base(1, 1, { from, candidates: {} }));
  assert.equal(r.kind, 'ground');
  // blue (up) axis seen from the side
  const side = { origin: { x: 0.03, y: 1.2, z: 10 }, direction: { x: 0, y: 0, z: -1 } };
  r = infer({ ray: side, pixelSize: 0.01, from, candidates: {} });
  assert.equal(r.kind, 'axisY');
  closeP(r.point, [0, 1.2, 0]);
  // rotated axes
  const c = Math.SQRT1_2;
  r = infer(base(1.02, 1, { from, axes: { x: [c, 0, c], z: [-c, 0, c] }, candidates: {} }));
  assert.equal(r.kind, 'axisX');
  closeP(r.point, [1.01, 0, 1.01]);
});

test('endpoints still beat axis inference', () => {
  const r = infer(base(1.98, 0.02, { from: [0, 0, 0], candidates: { points: [{ p: [2, 0, 0], kind: 'endpoint', ref: 'v' }] } }));
  assert.equal(r.kind, 'endpoint');
});

test('inference lock along an axis projects snapped points onto the axis', () => {
  const pts = { points: [{ p: [3, 0, 2], kind: 'endpoint', ref: 'far' }] };
  const r = infer(base(3.02, 2.01, { from: [0, 0, 0], lock: 'x', candidates: pts }));
  assert.equal(r.kind, 'axisX');
  assert.ok(r.locked);
  closeP(r.point, [3, 0, 0]);
  assert.equal(r.snap.kind, 'endpoint');
  // no snap: closest point of the axis to the ray
  const r2 = infer(base(1.5, 0.7, { from: [0, 0, 0], lock: 'x', candidates: {} }));
  closeP(r2.point, [1.5, 0, 0]);
  // lock to a plane
  const r3 = infer(base(0.5, 0.5, { lock: { plane: { normal: [0, 1, 0], constant: -2 } }, candidates: {} }));
  closeP(r3.point, [0.5, 2, 0.5]);
  assert.equal(r3.kind, 'onFace');
});

test('parallel and perpendicular to a reference edge', () => {
  const ref = { a: [0, 0, 0], b: [1, 0, 1], ref: 'diag' };
  let r = infer(base(2.01, 1.99, { from: [0, 0, 0], candidates: { refEdges: [ref] } }));
  assert.equal(r.kind, 'parallel');
  closeP(r.point, [2, 0, 2], 0.02);
  r = infer(base(-1.0, 1.02, { from: [0, 0, 0], candidates: { refEdges: [ref] } }));
  assert.equal(r.kind, 'perpendicular');
  close(r.point.x + r.point.z, 0, 1e-6);
});

test('guides: on-guide and guide/edge intersections', () => {
  const guides = [{ origin: [0, 0, 0.3], direction: [1, 0, 0], ref: 'g' }];
  let r = infer(base(5, 0.33, { candidates: { guides } }));
  assert.equal(r.kind, 'onGuide');
  closeP(r.point, [5, 0, 0.3]);
  r = infer(base(1.02, 0.32, { candidates: { guides, edges: square.edges } }));
  assert.equal(r.kind, 'intersection');
  closeP(r.point, [1, 0, 0.3]);
});

test('screen-space tolerance via toScreen', () => {
  const toScreen = (p) => ({ x: p.x * 100, y: p.z * 100 });
  const r = infer({ ray: down(0.95, 0.0), toScreen, tolerancePx: 10, candidates: square });
  assert.equal(r.kind, 'endpoint');
  const r2 = infer({ ray: down(0.85, 0.0), toScreen, tolerancePx: 10, candidates: square });
  assert.equal(r2.kind, 'onEdge');
});

test('candidates can be taken straight from a GeoMesh', () => {
  const m = new GeoMesh();
  const c = m.addCircle([2, 0, 2], [0, 1, 0], 0.5, 16);
  const r = m.addRectangle([0, 0, 0], [1, 0, 1]);
  const cand = candidatesFromMesh(m);
  assert.equal(infer(base(2.01, 2.02, { candidates: cand })).kind, 'center');
  const f = infer(base(0.4, 0.6, { candidates: cand }));
  assert.equal(f.kind, 'onFace');
  assert.equal(f.ref, r.faces[0]);
  void c;
});
