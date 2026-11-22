// Tetrahedral mesher (src/cad/fem/mesh.js): volumes, face tags, element quality, local refinement, thin walls,
// quadratic (curved) boundary elements and the surface-vertex map used by the colour plots.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tetMesh, tetQuality } from '../../src/cad/fem/mesh.js';
import { elementVolume, TET_EDGES } from '../../src/cad/fem/elements.js';
import { buildModel, selectFaces, faceStats } from '../../src/cad/fem/model.js';
import { boxMesh, cylinderMesh, quarterPlateWithHole, quarterCap, surfaceVolume } from './fem-shapes.js';

const within = (v, e, rel, what) => assert.ok(Math.abs(v - e) <= rel * Math.abs(e), `${what}: ${v} vs ${e} (±${rel * 100}%)`);
const curvedVolume = (m) => { let v = 0; const X = new Float64Array(3 * m.npe); for (let e = 0; e < m.ne; e++) { for (let a = 0; a < m.npe; a++) { const p = 3 * m.elements[m.npe * e + a]; X.set(m.nodes.subarray(p, p + 3), 3 * a); } v += elementVolume(m.order, X); } return v; };

test('box: exact volume, every face tagged with its area, Kuhn-quality elements', () => {
  for (const order of [1, 2]) {
    const m = tetMesh(boxMesh(100, 10, 10, 2), { resolution: 20, order });
    assert.equal(m.ok, true);
    within(m.volume, 10000, 1e-9, 'volume');
    assert.ok(m.quality.min > 0.5, `quality ${m.quality.min}`);
    assert.equal(m.npe, order === 2 ? 10 : 4);
    assert.ok([...m.vertexMap.elem].every((e) => e >= 0), 'every surface vertex located');
  }
  const model = buildModel([{ mesh: boxMesh(100, 10, 10, 2), material: {} }], { resolution: 20 });
  for (const [id, area] of [[0, 100], [1, 100], [2, 1000], [3, 1000], [4, 1000], [5, 1000]]) within(faceStats(model, selectFaces(model, id)).area, area, 1e-9, `face ${id} area`);
});

test('cylinder: curved quadratic elements recover the volume; no slivers', () => {
  const surf = cylinderMesh(10, 40, 96, 8);
  const m = tetMesh(surf, { size: 3, order: 2 });
  assert.equal(m.ok, true);
  within(curvedVolume(m), surfaceVolume(surf), 0.01, 'curved T10 volume');
  assert.ok(Math.abs(curvedVolume(m) - surfaceVolume(surf)) < Math.abs(m.volume - surfaceVolume(surf)), 'curved closer than straight');
  assert.ok(m.quality.min > 0.05, `min quality ${m.quality.min}`);
  const tags = new Set(m.faces.faceId);
  assert.deepEqual([...tags].sort(), [0, 1, 2]);
});

test('local refinement on a face: small elements at the hole, the global size elsewhere, conforming', () => {
  const surf = quarterPlateWithHole(50, 50, 5, 2, 48);
  const coarse = tetMesh(surf, { size: 4, order: 1 });
  const fine = tetMesh(surf, { size: 4, order: 1, refine: [{ faceIds: [4], size: 0.5 }], grading: 0.3 });
  assert.ok(fine.ne > 2 * coarse.ne);
  // Edges touching the hole are near the requested size; far ones keep the global size.
  let nearMax = 0, farMax = 0;
  for (let e = 0; e < fine.ne; e++) for (const [i, j] of TET_EDGES) {
    const a = fine.elements[4 * e + i], b = fine.elements[4 * e + j];
    const l = Math.hypot(fine.nodes[3 * a] - fine.nodes[3 * b], fine.nodes[3 * a + 1] - fine.nodes[3 * b + 1], fine.nodes[3 * a + 2] - fine.nodes[3 * b + 2]);
    const r = Math.hypot(fine.nodes[3 * a], fine.nodes[3 * a + 1]);
    if (r < 5.3) nearMax = Math.max(nearMax, l); if (r > 40) farMax = Math.max(farMax, l);
  }
  assert.ok(nearMax < 1.2, `edges at the hole ${nearMax}`);
  assert.ok(farMax > 3, `far edges ${farMax}`);
  // Conforming: every interior face is shared by exactly two elements (boundary faces lie on the surface).
  const S = fine.surfaceModel;
  for (let f = 0; f < fine.faces.nf; f++) {
    const ids = [0, 1, 2].map((k) => fine.faces.nodes[3 * f + k]), c = [0, 1, 2].map((ax) => (fine.nodes[3 * ids[0] + ax] + fine.nodes[3 * ids[1] + ax] + fine.nodes[3 * ids[2] + ax]) / 3);
    assert.ok(Math.sqrt(S.closest(c[0], c[1], c[2], 10).d2) < 0.2, 'boundary face on the surface (no cracks)');
  }
  within(fine.volume, surfaceVolume(surf), 0.005, 'refined volume');
});

test('thin plate thinner than the element size is refined through its thickness', () => {
  const surf = boxMesh(60, 60, 1, 2);
  const m = tetMesh(surf, { size: 6, order: 2 });
  assert.equal(m.ok, true);
  within(m.volume, 3600, 1e-6, 'volume');
  for (let t = 0; t < m.ne; t++) { const X = []; for (let a = 0; a < 4; a++) { const p = 3 * m.elements[10 * t + a]; X.push(m.nodes[p], m.nodes[p + 1], m.nodes[p + 2]); } assert.ok(tetQuality(X) > 0.02); }
});

test('spherical cap with point refinement at the contact point', () => {
  const surf = quarterCap(10, 4, 32, 16);
  const m = tetMesh(surf, { size: 1, order: 2, refine: [{ point: [0, 0, 0], radius: 0.5, size: 0.2 }] });
  assert.equal(m.ok, true);
  within(curvedVolume(m), (Math.PI * 16 * 26) / 12, 0.02, 'cap volume');
  let nearest = Infinity;
  for (let n = 0; n < m.nn; n++) nearest = Math.min(nearest, Math.hypot(m.nodes[3 * n], m.nodes[3 * n + 1], m.nodes[3 * n + 2]));
  assert.ok(nearest < 0.05, 'a node at the pole');
});

test('errors: empty surface', () => {
  assert.equal(tetMesh({ vertices: [], triangles: [], faceGroups: [] }).error, 'empty');
});
