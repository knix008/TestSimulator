// Advanced hole (element stacks from both sides), Intersect (closed regions of bodies, surfaces and planes),
// Mate Reference (faces with mate types; the mates two parts get from the same name) and Insert Part of one body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, createSketchGeometry, newSketchId } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';
import { holeStack, mateRefMates } from '../../src/cad/part-extra.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const V = (s) => R.measureVolume(s);
const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
function sketchOn(part, plane, draw) { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; }
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part, opts) { const r = regenerate(part, opts); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const point = (k, x, y) => k.entities.push({ id: newSketchId('p'), type: 'point', x, y, standalone: true });
const cyl = (r, h) => Math.PI * r * r * h;
const frustum = (r1, r2, h) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
const solids = (s) => { const oc = R.getOC(); let n = 0; const ex = new oc.TopExp_Explorer(s.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; ex.delete(); return n; };

/** A 60 × 40 × 20 block (z 0 … 20) and a point sketch on its top face plane. */
function block() {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, -30, -20, 30, 20));
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  const pl = add(part, 'plane', { base: top, offset: 20 });
  const pts = sketchOn(part, { kind: 'ref', id: pl.id }, (k) => point(k, 0, 0));
  return { part, pts, volume: 60 * 40 * 20 };
}

test('hole stack: counterbore then a straight hole through; a countersink ends at the next diameter', () => {
  const s = holeStack([{ kind: 'counterbore', d: 11, depth: 6.5 }, { kind: 'straight', d: 6.6, depth: 0 }], [], 20);
  assert.equal(s.through, true);
  near(s.depth, 20);
  assert.ok(s.pts.some(([r, z]) => Math.abs(r - 5.5) < 1e-9 && Math.abs(z - 6.5) < 1e-9));
  assert.ok(s.pts.some(([r, z]) => Math.abs(r - 3.3) < 1e-9 && Math.abs(z - 20) < 1e-9));
  const c = holeStack([{ kind: 'countersink', d: 13, angle: 90 }, { kind: 'straight', d: 6.6, depth: 10 }], [], 50);
  // 90° included: depth = (6.5 − 3.3) / tan 45°.
  assert.ok(c.pts.some(([r, z]) => Math.abs(r - 3.3) < 1e-9 && Math.abs(z - 3.2) < 1e-9));
  assert.equal(c.through, false);
});

test('advanced hole: near counterbore + straight through + far countersink — the volume removed is theirs', () => {
  const { part, pts, volume } = block();
  add(part, 'advancedHole', { sketch: pts.id, near: [{ kind: 'counterbore', d: 11, depth: 6.5 }, { kind: 'straight', d: 6.6, depth: 0 }], far: [{ kind: 'countersink', d: 9, angle: 90 }] });
  const r = ok(part);
  const hcs = (4.5 - 3.3) / Math.tan(Math.PI / 4);
  const removed = cyl(5.5, 6.5) + cyl(3.3, 20 - 6.5 - hcs) + frustum(4.5, 3.3, hcs);
  near(volume - V(r.body), removed, 1e-3);
  const holes = [...r.results.values()].find((x) => x.holes)?.holes;
  assert.equal(holes.length, 1); assert.equal(holes[0].through, true); near(holes[0].length, 20, 1e-6);
});

test('advanced hole: a blind straight hole ends in a 118° drill point; a taper narrows', () => {
  const { part, pts, volume } = block();
  const h = add(part, 'advancedHole', { sketch: pts.id, near: [{ kind: 'straight', d: 6, depth: 10 }], far: [] });
  let r = ok(part);
  const tip = 3 / Math.tan((118 * Math.PI) / 360);
  near(volume - V(r.body), cyl(3, 10) + (Math.PI * 9 * tip) / 3, 1e-3);
  h.near = [{ kind: 'taper', d: 8, depth: 10, angle: 2 }];
  r = ok(part);
  const r1 = 4 - 10 * Math.tan((2 * Math.PI) / 180);
  near(volume - V(r.body), frustum(4, r1, 10) + (Math.PI * r1 * r1 * (r1 / Math.tan((118 * Math.PI) / 360))) / 3, 1e-3);
});

test('intersect: a box and the Right plane make two regions; excluding one leaves the other half', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, -50, -30, 50, 30));
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  const ix = add(part, 'intersect', { planes: ['right'] });
  let r = ok(part);
  const regions = r.results.get(ix.id).intersect.regions;
  assert.equal(regions.length, 2);
  for (const g of regions) near(g.volume, 60000, 1e-6);
  // Merged back: the same box.
  near(V(r.body), 120000, 1e-6);
  ix.exclude = [0];
  r = ok(part);
  near(V(r.body), 60000, 1e-6);
  assert.ok(r.body.boundingBox.bounds[0][0] > -1e-6, 'the region left is the +x half (sorted by centre)');
  ix.exclude = []; ix.merge = false;
  r = ok(part);
  assert.equal(solids(r.body), 2);
  // Every region left out: the part stays as it was (no error), the list is still there for the PropertyManager.
  ix.exclude = [0, 1]; ix.merge = true;
  r = ok(part);
  near(V(r.body), 120000, 1e-6);
  assert.equal(r.results.get(ix.id).intersect.allExcluded, true);
  assert.equal(r.results.get(ix.id).intersect.regions.length, 2);
});

test('intersect: two overlapping bodies give three regions (each alone and their overlap)', () => {
  const part = newPart();
  const a = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 40, 40));
  add(part, 'extrude', { sketch: a.id, depth: 10 });
  const b = sketchOn(part, top, (k) => addRectangle(k, 30, 0, 70, 40));
  add(part, 'extrude', { sketch: b.id, depth: 10, merge: false });
  const ix = add(part, 'intersect', {});
  let r = ok(part);
  const vols = r.results.get(ix.id).intersect.regions.map((g) => Math.round(g.volume));
  assert.deepEqual(vols, [12000, 4000, 12000]);
  ix.exclude = [1];
  r = ok(part);
  near(V(r.body), 24000, 1e-6);
  // Not merged and not consuming: the two original bodies stay beside the regions.
  ix.exclude = []; ix.merge = false; ix.consume = false;
  r = ok(part);
  assert.equal(solids(r.body), 5);
});

test('mate reference: a shaft and a face of a pin and of a bushing (same name) give concentric + coincident mates', () => {
  const pin = newPart('pin');
  const c = sketchOn(pin, top, (k) => k.entities.push({ id: 'c0', type: 'point', x: 0, y: 0 }, { id: 'cc', type: 'circle', c: 'c0', r: 3 }));
  add(pin, 'extrude', { sketch: c.id, depth: 12 });
  const body = ok(pin).body;
  const shaft = body.faces.find((f) => /CYL/.test(f.geomType));
  const end = body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z) < 1e-6);
  const mr = add(pin, 'mateReference', { refName: 'Pin', primary: faceSignature(shaft), secondary: faceSignature(end) });
  const r = ok(pin);
  const ref = r.results.get(mr.id).mateRef;
  assert.equal(ref.name, 'Pin');
  assert.deepEqual(ref.refs.map((x) => [x.kind, x.type]), [['axis', 'concentric'], ['plane', 'coincident']]);
  // The same reference on the "other" part: mates pair primary with primary, secondary with secondary.
  const mates = mateRefMates([ref], [{ name: 'Pin', refs: ref.refs }], 'new', 'old');
  assert.deepEqual(mates.map((m) => [m.type, m.aligned, m.a.comp, m.b.comp]), [['concentric', 'aligned', 'new', 'old'], ['coincident', 'anti', 'new', 'old']]);
  assert.equal(mateRefMates([ref], [{ name: 'Other', refs: ref.refs }], 'n', 'o').length, 0);
  assert.ok(r.results.get(mr.id).frame, 'a frame for the reference marker');
});

test('insert part of one body (Save Bodies): body 1 of a two-body part', () => {
  const src = newPart('src');
  const a = sketchOn(src, top, (k) => addRectangle(k, 0, 0, 10, 10));
  add(src, 'extrude', { sketch: a.id, depth: 10 });
  const b = sketchOn(src, top, (k) => addRectangle(k, 20, 0, 40, 10));
  add(src, 'extrude', { sketch: b.id, depth: 10, merge: false });
  const project = { parts: [src], assemblies: [], drawings: [] };
  const one = newPart('one'); project.parts.push(one);
  add(one, 'insertPart', { part: 'src', body: 1 });
  near(V(ok(one, { project }).body), 2000, 1e-9);
  one.features[0].body = 0;
  near(V(ok(one, { project }).body), 1000, 1e-9);
  one.features[0].body = 5;
  assert.equal(regenerate(one, { project }).results.get(one.features[0].id).error, 'body-missing');
});

test('move face: the top face of a block pushed out 5 and pulled in 3', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, -30, -20, 30, 20));
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  const body = ok(part).body;
  const topFace = body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 20) < 1e-6);
  const m = add(part, 'moveFace', { faces: [faceSignature(topFace)], distance: 5 });
  near(V(ok(part).body), 60 * 40 * 25, 1e-9);
  m.distance = -3;
  near(V(ok(part).body), 60 * 40 * 17, 1e-9);
});
