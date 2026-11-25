// 3D sketch relations and dimensions (sketch3d-solve.js): along an axis, parallel to a plane, parallel /
// perpendicular / equal segments, fixed points, lengths, distances and angles — solved with the smallest move,
// degrees of freedom counted, conflicts reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve3d, addRelation3d, measure3d, segmentCount, pruneRelations3d } from '../../src/cad/sketch3d-solve.js';

const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const L = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

test('an L path in space made exact: along X, along Z, lengths 40 and 25, the start fixed — no freedom left', () => {
  const f = { points: [[0.3, -0.2, 0.1], [39, 1, -0.5], [41, 0.8, 24]], closed: false };
  addRelation3d(f, 'fix', 0); f.relations3d[0].at = [0, 0, 0];
  addRelation3d(f, 'alongX', 0); addRelation3d(f, 'alongZ', 1);
  const l1 = addRelation3d(f, 'length', 0); const l2 = addRelation3d(f, 'length', 1);
  l1.value = 40; l2.value = 25;
  const r = solve3d(f.points, f.relations3d);
  assert.ok(r.ok);
  assert.deepEqual(r.points, [[0, 0, 0], [40, 0, 0], [40, 0, 25]]);
  assert.equal(r.dof, 0);
});

test('parallel to a plane, parallel and perpendicular segments, equal lengths, an angle', () => {
  const f = { points: [[0, 0, 0], [10, 1, 2], [12, 9, 3], [3, 11, 1]], closed: true };
  assert.equal(segmentCount(4, true), 4);
  addRelation3d(f, 'fix', 0); addRelation3d(f, 'parallelXY', 0); addRelation3d(f, 'parallelXY', 1); addRelation3d(f, 'parallelXY', 2);
  addRelation3d(f, 'parallel', 0, 2); addRelation3d(f, 'perpendicular', 0, 1); addRelation3d(f, 'equal', 0, 1);
  const r = solve3d(f.points, f.relations3d, { closed: true });
  assert.ok(r.ok);
  const P = r.points;
  for (const p of P) near(p[2], 0, 1e-6);
  near(L(P[0], P[1]), L(P[1], P[2]), 1e-6);
  const u = P[1].map((v, i) => v - P[0][i]); const w = P[2].map((v, i) => v - P[1][i]);
  near(u[0] * w[0] + u[1] * w[1] + u[2] * w[2], 0, 1e-5);
  // An angle of 60° between two segments of an open path.
  const g = { points: [[0, 0, 0], [10, 0, 0], [15, 8, 3]], closed: false };
  addRelation3d(g, 'fix', 0); addRelation3d(g, 'fix', 1);
  const a = addRelation3d(g, 'angle', 0, 1); a.value = 60;
  const s = solve3d(g.points, g.relations3d);
  assert.ok(s.ok);
  near(measure3d(s.points, { type: 'angle', a: 0, b: 1 }), 60, 1e-6);
});

test('conflicting dimensions cannot be solved and leave the points where they were; driven ones impose nothing', () => {
  const f = { points: [[0, 0, 0], [10, 0, 0]], closed: false };
  addRelation3d(f, 'fix', 0); addRelation3d(f, 'fix', 1);
  const d = addRelation3d(f, 'length', 0); d.value = 20;
  const r = solve3d(f.points, f.relations3d);
  assert.equal(r.ok, false); assert.deepEqual(r.points, f.points);
  d.driven = true;
  assert.ok(solve3d(f.points, f.relations3d).ok);
  // Removing a point drops the relations on what is gone.
  f.points.pop(); pruneRelations3d(f);
  assert.ok(f.relations3d.every((x) => x.a < 1));
});
