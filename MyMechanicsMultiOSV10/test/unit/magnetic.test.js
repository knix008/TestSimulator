// Connection points and magnetic mates: a part's named point with a direction (a face's centre and normal, a
// cylinder's end); points of two components that are near and face each other snap together.
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { createSketchGeometry, addRectangle, addCircle } from '../../src/cad/sketch.js';
import { magneticPairs } from '../../src/cad/part-extra.js';
import { solveMates, quatIdentity, placeDir, placePoint, mateEntityOfFace } from '../../src/cad/assembly.js';
import { faceSignature } from '../../src/cad/refs.js';

const near = (a, b, tol = 1e-5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
before(async () => { await loadKernel(); });

const top = { kind: 'std', name: 'top' };
const buildPart = (part) => { const r = regenerate(part); return { result: r, faces: r.body.faces }; };
function block() {
  const p = { id: 'p', name: 'Block', features: [] };
  const s = createFeature(p, 'sketch', { plane: top, ...createSketchGeometry() });
  addRectangle(s, 0, 0, 40, 20);
  p.features.push(s, createFeature(p, 'extrude', { sketch: s.id, depth: 10 }));
  return p;
}
const faceWhere = (part, pred) => faceSignature(buildPart(part).faces.find((f) => pred(f)));

test('a connection point on a planar face: its centre and outward normal; offset and flip', () => {
  const p = block();
  const cp = createFeature(p, 'connectionPoint', { face: faceWhere(p, (f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 10) < 1e-6), cpName: 'Top' });
  p.features.push(cp);
  const r = buildPart(p).result.results.get(cp.id).connPoint;
  assert.equal(r.name, 'Top');
  assert.deepEqual(r.point.map((v) => Math.round(v * 1e6) / 1e6), [20, 10, 10]);
  assert.deepEqual(r.dir.map((v) => Math.round(v * 1e6) / 1e6), [0, 0, 1]);
  cp.offset = 3; cp.flip = true;
  const q = buildPart(p).result.results.get(cp.id).connPoint;
  near(q.point[2], 7); near(q.dir[2], -1);
});

test('a connection point on a pin: the axis at its outer end, pointing out', () => {
  // A pin Ø6 from the block's bottom up to z = 25 (it stands 15 out of the 10-high block).
  const p = block();
  const s2 = createFeature(p, 'sketch', { plane: top, ...createSketchGeometry() });
  addCircle(s2, 10, 10, 3);
  p.features.push(s2, createFeature(p, 'extrude', { sketch: s2.id, depth: 25 }));
  const entry = buildPart(p);
  const pin = entry.faces.find((f) => /CYL/.test(f.geomType));
  assert.ok(pin, 'pin face');
  const cp = createFeature(p, 'connectionPoint', { face: faceSignature(pin) });
  p.features.push(cp);
  const r = buildPart(p).result.results.get(cp.id).connPoint;
  near(r.point[0], 10); near(r.point[1], 10); near(r.point[2], 25);
  near(r.dir[2], 1);
});

test('pairs: near and facing each other; the nearest first, one partner each; already joined skipped', () => {
  const pts = [
    { comp: 'A', name: 'p', point: [0, 0, 0], dir: [0, 0, 1] },
    { comp: 'B', name: 'q', point: [0, 0, 10], dir: [0, 0, -1] },
    { comp: 'C', name: 'r', point: [0, 0, 5], dir: [0, 0, -1] },
    { comp: 'D', name: 's', point: [3, 0, 0], dir: [0, 0, 1] }, // same way as p: never pairs with it
    { comp: 'E', name: 't', point: [100, 0, 0], dir: [0, 0, -1] }, // too far
  ];
  const r = magneticPairs(pts, { distance: 25 });
  assert.deepEqual(r.map((x) => `${x.a.comp}-${x.b.comp}`), ['A-C', 'B-D']);
  const j = magneticPairs(pts, { distance: 25, joined: new Set(['C:r|A:p']) });
  assert.deepEqual(j.map((x) => `${x.a.comp}-${x.b.comp}`), ['C-D', 'A-B']);
});

test('a magnetic mate: the points meet and the directions face each other; the turn about them stays free', () => {
  const asm = {
    components: [{ id: 'A', fixed: true, position: [0, 0, 0], rotation: quatIdentity() }, { id: 'B', position: [5, 3, 18], rotation: [0, 0.2, 0, Math.sqrt(1 - 0.04)] }],
    mates: [{ id: 'm', type: 'magnetic', a: { comp: 'A', kind: 'point', point: [20, 10, 10], dir: [0, 0, 1] }, b: { comp: 'B', kind: 'point', point: [0, 0, 0], dir: [0, 0, -1] } }],
  };
  const r = solveMates(asm);
  assert.deepEqual(r.failed, []);
  const B = asm.components[1];
  const p = placePoint(B, [0, 0, 0]); const d = placeDir(B, [0, 0, -1]);
  near(p[0], 20, 1e-5); near(p[1], 10, 1e-5); near(p[2], 10, 1e-5);
  near(d[2], -1, 1e-6);
  assert.equal(r.status.get('B'), 'under');
  assert.equal(typeof mateEntityOfFace, 'function');
});
