// Fastening features: mounting boss (hole or pin, draft, fins), snap hook, snap hook groove, vent and lip / groove,
// built in parts through regenerate(); volumes are checked against the shapes' own formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature } from '../../src/cad/refs.js';
import { ventParts } from '../../src/cad/fastening.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const V = (s) => R.measureVolume(s);
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
/** A 100 × 60 × 5 plate on the Top plane (z 0 … 5); returns the part and its top face's signature. */
function plate() {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = sketchOn(part, top, (k) => addRectangle(k, -50, -30, 50, 30));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 5 }));
  const r = ok(part);
  const face = r.body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 5) < 1e-9);
  return { part, face: faceSignature(face), volume: V(r.body) };
}
const frustum = (h, r1, r2) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;

test('mounting boss with a hole: frustum (drafted side) minus the hole, standing on the face at the given point', () => {
  const { part, face, volume } = plate();
  part.features.push(createFeature(part, 'mountingBoss', { face, atCenter: false, x: 20, y: -10, z: 99, height: 12, od: 8, draft: 2, id: 3, holeDepth: 9, fins: 0 }));
  const r = ok(part);
  const rb = 4 + 12 * Math.tan((2 * Math.PI) / 180);
  near(V(r.body), volume + frustum(12, rb, 4) - Math.PI * 1.5 * 1.5 * 9, 1e-6);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(hi[2], 17, 1e-6);
  // The point was projected onto the face: the boss is centred at (20, −10).
  const tops = r.body.faces.filter((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 17) < 1e-6);
  assert.equal(tops.length, 1);
  void lo;
});

test('mounting boss with a pin, a through hole, a drafted hole and fins', () => {
  const pin = plate();
  pin.part.features.push(createFeature(pin.part, 'mountingBoss', { face: pin.face, height: 10, od: 6, draft: 0, kind: 'pin', pinDiameter: 2, pinHeight: 3, fins: 0 }));
  near(V(ok(pin.part).body), pin.volume + Math.PI * 9 * 10 + Math.PI * 1 * 3, 1e-6);
  const thru = plate();
  thru.part.features.push(createFeature(thru.part, 'mountingBoss', { face: thru.face, height: 10, od: 6, draft: 0, id: 2, through: true, fins: 0 }));
  // A through hole goes on through the plate too.
  near(V(ok(thru.part).body), thru.volume + Math.PI * 9 * 10 - Math.PI * 1 * (10 + 5), 1e-6);
  const dr = plate();
  dr.part.features.push(createFeature(dr.part, 'mountingBoss', { face: dr.face, height: 10, od: 6, draft: 0, id: 2, holeDepth: 8, holeDraft: 1, fins: 0 }));
  const rBot = 1 - 8 * Math.tan(Math.PI / 180);
  near(V(ok(dr.part).body), dr.volume + Math.PI * 9 * 10 - frustum(8, 1, rBot), 1e-5);
  const fin = plate();
  fin.part.features.push(createFeature(fin.part, 'mountingBoss', { face: fin.face, height: 10, od: 6, draft: 0, id: 2, holeDepth: 8, fins: 4, finLength: 5, finThickness: 1, finHeight: 8, finAngle: 0, finShape: 'rect' }));
  const rf = ok(fin.part);
  // Rectangular fins along ±x and ±y: each adds 5 × 1 × 8 outside the boss plus the bit between the boss's round
  // side and its flat inner end (the fin starts inside the boss).
  // The piece of a fin between the boss's round side and the plane x = r: ∫ (r − √(r² − y²)) dy over |y| ≤ t/2.
  const sliver = (r, t) => { const y = t / 2; return 2 * (r * y - ((y / 2) * Math.sqrt(r * r - y * y) + ((r * r) / 2) * Math.asin(y / r))); };
  near(V(rf.body), fin.volume + Math.PI * 9 * 10 - Math.PI * 8 + 4 * (5 * 1 * 8 + sliver(3, 1) * 8), 1e-6);
  // Above the plate the fins reach 3 + 5 from the axis along ±x and ±y.
  const [lo, hi] = rf.body.clone().intersect(R.makeBox([-60, -40, 5.01], [60, 40, 30])).boundingBox.bounds;
  near(hi[0], 8, 1e-6); near(lo[1], -8, 1e-6);
  // Triangular fins: smaller than rectangular ones.
  const tri = plate();
  tri.part.features.push(createFeature(tri.part, 'mountingBoss', { face: tri.face, height: 10, od: 6, draft: 0, id: 2, holeDepth: 8, fins: 4, finLength: 5, finThickness: 1, finHeight: 8, finShape: 'triangle' }));
  assert.ok(V(ok(tri.part).body) < V(rf.body) - 50);
});

test('snap hook: arm plus lip; the groove is the hook grown by the clearance, cut from the cover body', () => {
  const { part, face, volume } = plate();
  const hook = createFeature(part, 'snapHook', { face, height: 15, width: 6, thickness: 1.5, lipDepth: 1.2, lipHeight: 3, insertAngle: 30, angle: 0 });
  part.features.push(hook);
  const r = ok(part);
  const H = 15; const d = 1.2; const lh = 3; const slope = d / Math.tan(Math.PI / 6); const y0 = H - lh; const y1 = H - slope;
  const lip = d * (y1 - y0) + (d * (H - y1)) / 2;
  near(V(r.body), volume + 1.5 * 6 * 15 + lip * 6, 1e-6);
  // A cover over the hook (a second body, z 14 … 18): the groove cuts the grown hook out of it.
  const s = sketchOn(part, { kind: 'std', name: 'top' }, (k) => addRectangle(k, -20, -20, 20, 20));
  part.features.push(createFeature(part, 'plane', { base: top, offset: 14 }));
  s.plane = { kind: 'ref', id: part.features.at(-1).id };
  part.features.splice(part.features.indexOf(s), 1);
  part.features.push(s);
  // Merge result off: the cover is a body of its own (it overlaps the hook's top).
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 4, merge: false }));
  const before = ok(part);
  const solids = [...R.iterTopo(before.body.wrapped, 'solid')].length;
  assert.equal(solids, 2);
  const cover = 40 * 40 * 4;
  near(V(before.body), V(r.body) + cover, 1e-6);
  part.features.push(createFeature(part, 'snapHookGroove', { hook: hook.id, body: 1, clearance: 0.2 }));
  const after = ok(part);
  assert.ok(V(after.body) < V(before.body) - 0.5, 'the groove takes material from the cover');
  // Only the cover lost material: the hook (z ≤ 20) still reaches its full height.
  near(after.body.boundingBox.bounds[1][2], 20, 1e-6);
});

test('vent: the boundary is cut through, ribs and a spar stay', () => {
  const { part, volume } = plate();
  const s = sketchOn(part, top, (k) => {
    addRectangle(k, -20, -10, 20, 10);
    addLine(k, 0, -10, 0, 10);
    addLine(k, -20, 0, 20, 0);
    addCircle(k, -10, 5, 3);
  });
  part.features.push(createFeature(part, 'vent', { sketch: s.id, ribWidth: 2, sparWidth: 1 }));
  const parts = ventParts(s);
  assert.equal(parts.ribs.length, 2);
  assert.equal(parts.spars.length, 1);
  const r = ok(part);
  // Removed: the 40 × 20 window less the two ribs (40 + 20 long, 2 wide, overlapping 2 × 2 at the cross) and the
  // spar ring (width 1 about r = 3), then less where the spar and the ribs overlap.
  const ring = Math.PI * (3.5 * 3.5 - 2.5 * 2.5);
  const removedMax = (800 - (40 * 2 + 20 * 2 - 4)) * 5;
  const got = volume - V(r.body);
  assert.ok(got < removedMax && got > removedMax - ring * 5 - 1, `removed ${got}`);
});

test('lip and groove on the rim of a shelled box: the strip is width × height along the inner edge', () => {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = sketchOn(part, top, (k) => addRectangle(k, -30, -20, 30, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 25 }));
  let r = ok(part);
  const lid = r.body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 25) < 1e-9);
  part.features.push(createFeature(part, 'shell', { thickness: 2, faces: [faceSignature(lid)] }));
  r = ok(part);
  const rim = r.body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 25) < 1e-9);
  const v0 = V(r.body);
  part.features.push(createFeature(part, 'lipGroove', { face: faceSignature(rim), kind: 'lip', side: 'inner', width: 1, height: 1.5 }));
  r = ok(part);
  // Along the inner edge (56 × 36 opening): the strip inside an offset of 1 mm with round outer corners.
  const strip = (56 + 2) * (36 + 2) - 56 * 36 - (4 - Math.PI) * 1;
  near(V(r.body) - v0, strip * 1.5, 1e-6);
  near(r.body.boundingBox.bounds[1][2], 26.5, 1e-9);
  part.features.at(-1).kind = 'groove'; part.features.at(-1).clearance = 0.1;
  r = ok(part);
  const strip2 = (56 + 2.2) * (36 + 2.2) - 56 * 36 - (4 - Math.PI) * 1.1 * 1.1;
  near(v0 - V(r.body), strip2 * 1.5, 1e-6);
  // Outer side: inside the 60 × 40 outer edge (corners stay square inside a shrunk rectangle).
  part.features.at(-1).side = 'outer'; part.features.at(-1).kind = 'lip'; part.features.at(-1).clearance = 0;
  r = ok(part);
  near(V(r.body) - v0, (60 * 40 - 58 * 38) * 1.5, 1e-6);
});

test('reference geometry: bounding box best fit finds a turned block exactly; square to a plane it is larger', () => {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 40, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  part.features.push(createFeature(part, 'moveBody', { rx: 20, ry: 10, rz: 35 }));
  const bb = createFeature(part, 'boundingBox', { mode: 'bestFit' });
  part.features.push(bb);
  let r = ok(part);
  const box = r.results.get(bb.id).box;
  near(box.length, 40, 1e-7); near(box.width, 20, 1e-7); near(box.thickness, 10, 1e-7);
  near(box.volume, 8000, 1e-7);
  bb.mode = 'plane'; bb.plane = 'std:top';
  r = ok(part);
  assert.ok(r.results.get(bb.id).box.volume > 8000 * 1.3);
  // A cylinder: 2r × 2r × h.
  const c = { id: 'c', name: 'Part', features: [] };
  const cs = sketchOn(c, top, (k) => addCircle(k, 3, 4, 5));
  c.features.push(createFeature(c, 'extrude', { sketch: cs.id, depth: 30 }));
  const cb = createFeature(c, 'boundingBox', {});
  c.features.push(cb);
  const rc = ok(c).results.get(cb.id);
  near(rc.box.length, 30, 1e-7); near(rc.box.width, 10, 1e-7); near(rc.box.thickness, 10, 1e-7);
  near(rc.box.centre[0], 3, 1e-7); near(rc.box.centre[1], 4, 1e-7); near(rc.box.centre[2], 15, 1e-7);
});

test('reference point at the centre of mass of an L-shaped part', () => {
  const part = { id: 'p', name: 'Part', features: [] };
  const s = sketchOn(part, top, (k) => { addRectangle(k, 0, 0, 40, 10); });
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const s2 = sketchOn(part, top, (k) => { addRectangle(k, 0, 10, 10, 40); });
  part.features.push(createFeature(part, 'extrude', { sketch: s2.id, depth: 10 }));
  const p = createFeature(part, 'refPoint', { kind: 'centerOfMass' });
  part.features.push(p);
  const r = ok(part);
  const pt = r.results.get(p.id).point;
  // Areas 400 at (20, 5) and 300 at (5, 25): centroid (95/7, 95/7), z = 5.
  near(pt[0], (400 * 20 + 300 * 5) / 700, 1e-9); near(pt[1], (400 * 5 + 300 * 25) / 700, 1e-9); near(pt[2], 5, 1e-9);
});

test('boundary boss and boundary cut through two closed profiles (same solid as a loft)', () => {
  const make = (op, withBody) => {
    const part = { id: 'p', name: 'Part', features: [] };
    if (withBody) { const s = sketchOn(part, top, (k) => addRectangle(k, -30, -30, 30, 30)); part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 30 })); }
    const a = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
    part.features.push(createFeature(part, 'plane', { base: top, offset: 30 }));
    const b = sketchOn(part, { kind: 'ref', id: part.features.at(-1).id }, (k) => addRectangle(k, -5, -5, 5, 5));
    const f = createFeature(part, 'boundary', { curves: [a.id, b.id], op });
    part.features.push(f);
    return { r: ok(part), f };
  };
  // A frustum of square sections 20 → 10 over 30: V = h/3 (A1 + A2 + √(A1 A2)).
  const frustum = (30 / 3) * (400 + 100 + 200);
  const boss = make('boss', false);
  near(V(boss.r.body), frustum, 1e-6);
  assert.equal(boss.f.name, 'Boundary-Boss1');
  const cut = make('cut', true);
  near(V(cut.r.body), 60 * 60 * 30 - frustum, 1e-6);
  const surf = make('surface', false);
  assert.ok(surf.r.results.get(surf.f.id).surface && !surf.r.body);
});
