// Split line by silhouette and by intersection (cad/split-line-more.js, part-more.js): cylinders and spheres split
// exactly by a plane, other curved faces along the zero line of n·d; faces split where planes or surfaces meet them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';
import { silhouetteTools, silhouetteChains, splitFace } from '../../src/cad/split-line-more.js';

await loadKernel();
const R = rep();
const vec = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const newEdges = (before, after) => after.edges.filter((e) => !before.edges.some((x) => x.isSame(e) || (Math.hypot(...[0, 1, 2].map((k) => vec(x.startPoint)[k] - vec(e.startPoint)[k])) < 1e-6 && Math.hypot(...[0, 1, 2].map((k) => vec(x.endPoint)[k] - vec(e.endPoint)[k])) < 1e-6 && Math.abs(x.length - e.length) < 1e-6)));

test('silhouette of a lying cylinder: along its top and bottom lines seen from the front; seen from above its seams already are the silhouette', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'right' }, ...createSketchGeometry() }); addCircle(s, 0, 10, 10); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 40 }));
  const r0 = regenerate(part);
  const cyl = r0.body.faces.filter((f) => /CYL/.test(f.geomType));
  const f = createFeature(part, 'splitLine', { kind: 'silhouette', plane: 'std:front', faces: cyl.map(faceSignature) }); part.features.push(f);
  const r = regenerate(part);
  assert.ok(r.results.get(f.id).ok, r.results.get(f.id).error);
  assert.equal(r.body.faces.length, r0.body.faces.length + 2);
  near(R.measureVolume(r.body), R.measureVolume(r0.body));
  // The lines along x at the top and the bottom of the cylinder (z = 0 and z = 20, y = 0).
  const along = r.body.edges.filter((e) => e.geomType === 'LINE' && Math.abs(vec(e.startPoint)[0] - vec(e.endPoint)[0]) > 39);
  const at = (z) => along.some((e) => Math.abs(vec(e.startPoint)[2] - z) < 1e-6 && Math.abs(vec(e.startPoint)[1]) < 1e-6);
  assert.ok(at(0) && at(20), `lines: ${along.map((e) => vec(e.startPoint).map((x) => x.toFixed(2))).join(' | ')}`);
  // From above (Top plane): the silhouette is z = 10, where the extrusion's seams are: nothing to split, no error.
  f.plane = 'std:top';
  const r2 = regenerate(part);
  assert.ok(r2.results.get(f.id).ok, r2.results.get(f.id).error);
});
function near(a, b, tol = 1e-6) { assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`); }

test('a sphere splits on its equator; a lofted freeform face along the zero line of n·d', () => {
  const sphere = R.makeSphere(10).translate([0, 0, 5]);
  const face = sphere.faces[0];
  const pieces = splitFace(face, silhouetteTools(face, [0, 0, 1], 50));
  assert.ok(pieces.length >= 2);
  for (const p of pieces) { const z = p.boundingBox.bounds.map((b) => b[2]); assert.ok(Math.abs(z[0] - 5) < 1e-6 || Math.abs(z[1] - 5) < 1e-6, `piece z ${z}`); }
  // A freeform face: a loft from a 30 × 20 ellipse (z = 0) to a 16 × 24 one (z = 20), seen along x — its
  // silhouette is where the normal has no x part; every piece lies on one side of it and no surface is lost.
  const e1 = R.makeEllipse(15, 10, [0, 0, 0], [0, 0, 1]); const e2 = R.makeEllipse(12, 8, [0, 0, 20], [0, 0, 1]).rotate(90, [0, 0, 20], [0, 0, 1]);
  const loft = R.loft([R.assembleWire([e1]), R.assembleWire([e2])], { ruled: false }, false);
  let crossing = 0;
  for (const lf of loft.faces.filter((f) => f.geomType !== 'PLANE')) {
    const chains = silhouetteChains(lf, [1, 0, 0], 40).filter((c) => c.length >= 5);
    if (!chains.length) continue;
    crossing++;
    for (const c of chains) for (const q of c) assert.ok(Math.abs(q.n[0]) < 1e-6, `n·d ${q.n[0]}`);
    const lp = splitFace(lf, silhouetteTools(lf, [1, 0, 0], 40), 40e-6);
    assert.ok(lp.length >= 2, `${lp.length} pieces`);
    near(lp.reduce((sum, p) => sum + R.measureArea(p), 0), R.measureArea(lf), 1e-6);
    // Each piece faces one way: n·x keeps its sign over it.
    for (const p of lp) {
      const signs = new Set();
      for (const [u, v] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8], [0.2, 0.8], [0.8, 0.2]]) { const q = p.pointOnSurface(u, v); const n = p.normalAt(q); if (Math.abs(n.x) > 1e-3) signs.add(Math.sign(n.x)); }
      assert.ok(signs.size <= 1, 'a piece faces both ways');
    }
  }
  assert.ok(crossing >= 1);
});

test('intersection split line: a block split where the Front and Right planes meet it; a missing tool says so', () => {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: { kind: 'std', name: 'top' }, ...createSketchGeometry() }); addRectangle(s, -20, -10, 20, 10); part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const n0 = regenerate(part).body.faces.length;
  const f = createFeature(part, 'splitLine', { kind: 'intersection', tools: ['std:front', 'std:right'], faces: [] }); part.features.push(f);
  const r = regenerate(part);
  assert.ok(r.results.get(f.id).ok, r.results.get(f.id).error);
  // Top and bottom split in four, the four sides in two each.
  assert.equal(r.body.faces.length, n0 + 2 * 3 + 4);
  f.tools = [];
  assert.equal(regenerate(part).results.get(f.id).error, 'no-tools');
});
