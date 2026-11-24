// The faces / edges / wires / solids of a shape, listed in hash buckets (kernel.js subShapes): exactly the list
// replicad's own getters gave (same order, each sub-shape once), and fast on bodies with thousands of faces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep, subShapes } from '../../src/cad/kernel.js';
import { runScad } from '../../src/cad/openscad/index.js';
import { meshSolid } from '../../src/cad/openscad-feature.js';

await loadKernel();
const R = rep();
const oc = R.getOC();

/** replicad's original listing: every explored item compared with every earlier one. */
function slowList(wrapped, kind) {
  const E = oc.TopAbs_ShapeEnum;
  const type = { face: E.TopAbs_FACE, edge: E.TopAbs_EDGE, wire: E.TopAbs_WIRE, solid: E.TopAbs_SOLID }[kind];
  const ex = new oc.TopExp_Explorer(wrapped, type, E.TopAbs_SHAPE);
  const seen = [];
  while (ex.More()) { const it = ex.Current(); if (!seen.some((s) => s.IsSame(it))) seen.push(it); ex.Next(); }
  ex.delete();
  return seen;
}
const hash = (s) => oc.ReplicadShapeHasher.HashCode(s, R.HASH_CODE_MAX);

test('the same sub-shapes in the same order as the one-by-one comparison, for every kind', () => {
  const shapes = [
    R.makeBox([0, 0, 0], [10, 20, 30]),
    R.makeCylinder(5, 20).fuse(R.makeBox([-10, -10, 0], [10, 10, 5])),
    R.makeBox([0, 0, 0], [20, 20, 20]).cut(R.makeCylinder(4, 40, [10, 10, -10])),
    R.makeCompound([R.makeBox([0, 0, 0], [1, 1, 1]), R.makeBox([5, 0, 0], [6, 1, 1])]),
  ];
  for (const [i, s] of shapes.entries()) {
    for (const kind of ['face', 'edge', 'wire', 'solid']) {
      const fast = subShapes(s.wrapped, kind).map(hash); const slow = slowList(s.wrapped, kind).map(hash);
      assert.deepEqual(fast, slow, `shape ${i} ${kind}s`);
    }
    // The replicad getters go through the fast listing and still give replicad Face / Edge objects.
    assert.deepEqual(s.faces.map((f) => f.hashCode), slowList(s.wrapped, 'face').map(hash));
    assert.ok(s.edges.every((e) => e instanceof R.Edge));
  }
});

test('a faceted body with thousands of faces lists its edges quickly', () => {
  const r = runScad('sphere(20, $fn = 72);');
  const body = meshSolid(r.verts, r.tris);
  const t0 = performance.now();
  const edges = body.edges; const faces = body.faces;
  const ms = performance.now() - t0;
  assert.ok(faces.length > 2000 && edges.length > 4000, `${faces.length} faces, ${edges.length} edges`);
  assert.ok(ms < 5000, `listed in ${ms.toFixed(0)} ms`);
  // Euler: V − E + F = 2 for the sphere's closed surface.
  const verts = subShapes(body.wrapped, 'vertex').length;
  assert.equal(verts - edges.length + faces.length, 2);
});
