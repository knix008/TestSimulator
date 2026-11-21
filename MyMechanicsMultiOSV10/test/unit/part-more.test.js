// More part features: combine / delete / indent / flex / deform bodies, reference axis / point /
// coordinate system, variable / face / full-round fillets, curve- / sketch- / table-driven, fill and
// variable patterns, projected curve, split line, composite curve, curve through XYZ points, and the
// sketch tools convert entities, intersection curve, move / copy / rotate / scale.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, frame, STD_PLANES } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, createSketchGeometry, byId } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { countSolids, solidsOf } from '../../src/cad/part-more.js';
import { convertEntities, intersectionEntities, transformEntities } from '../../src/cad/sketch-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
const front = { kind: 'std', name: 'front' }; const top = { kind: 'std', name: 'top' };
function sketchOn(part, plane, draw) { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; }
function feat(part, type, params) { const f = createFeature(part, type, params); part.features.push(f); return f; }
function ok(part, opts) { const r = regenerate(part, opts); for (const [id, x] of r.results) assert.ok(x.ok, `${part.features.find((f) => f.id === id)?.type}: ${x.error} ${x.detail ?? ''}`); return r; }
const box = (shape) => { const [lo, hi] = shape.boundingBox.bounds; return { lo, hi, size: hi.map((v, i) => v - lo[i]) }; };
/** A box w × h × d as an extrude on the top plane (x ∈ [x0, x0+w], y ∈ [−z0−d, −z0], z ∈ [0, h]). */
function block(part, x0, z0, w, d, h, op = 'boss') {
  // Top plane (Z up): sketch x = world x, sketch y = world y, extruded along +z.
  const s = sketchOn(part, top, (k) => addRectangle(k, x0, -z0 - d, x0 + w, -z0));
  return feat(part, 'extrude', { sketch: s.id, depth: h, op });
}
const sigOf = (shape, test) => faceSignature(shape.faces.find(test));
const faceAt = (axis, value) => (fc) => fc.geomType === 'PLANE' && Math.abs(fc.center[axis] - value) < 1e-6;

// ───────────────────────── bodies

/** A part with two separate bodies (an imported compound of two solids). */
function bodiesPart(...solids) {
  const part = newPart();
  part.features.push({ id: 'imp', type: 'import', name: 'Imported1', brep: R.makeCompound(solids).serialize() });
  return part;
}

test('combine: add, subtract and common between two solid bodies', () => {
  const a = () => R.makeBox([0, 0, 0], [20, 10, 20]);
  const b = () => R.makeBox([10, 0, 10], [30, 20, 30]);
  const part = bodiesPart(a(), b());
  assert.equal(countSolids(ok(part).body), 2);
  const cb = feat(part, 'combine', { op: 'add', main: 0, bodies: [] });
  let r = ok(part);
  assert.equal(countSolids(r.body), 1);
  near(V(r.body), 4000 + 8000 - 1000);
  cb.op = 'subtract';
  r = ok(part);
  near(V(r.body), 3000);
  cb.op = 'common';
  r = ok(part);
  near(V(r.body), 1000);
  // Subtract body 0 from body 1 instead.
  cb.op = 'subtract'; cb.main = 1; cb.bodies = [0];
  near(V(ok(part).body), 7000);
  // Bodies that only touch have nothing in common.
  const touching = bodiesPart(R.makeBox([0, 0, 0], [10, 10, 10]), R.makeBox([10, 0, 0], [20, 10, 10]));
  const c2 = feat(touching, 'combine', { op: 'common' });
  assert.equal(regenerate(touching).results.get(c2.id).ok, false);
});

test('delete / keep body', () => {
  const part = newPart();
  block(part, 0, 0, 40, 20, 10);
  part.features.push({ id: 'pl', type: 'plane', name: 'Plane1', base: { kind: 'std', name: 'right' }, offset: 10, flip: false });
  feat(part, 'split', { plane: { kind: 'ref', id: 'pl' }, keep: 'both' });
  let r = ok(part);
  assert.equal(countSolids(r.body), 2);
  const vols = solidsOf(r.body).map(V);
  const del = feat(part, 'deleteBody', { mode: 'delete', bodies: [0] });
  r = ok(part);
  assert.equal(countSolids(r.body), 1);
  near(V(r.body), vols[1]);
  del.mode = 'keep';
  r = ok(part);
  near(V(r.body), vols[0]);
});

test('indent: a tool pressed into a plate leaves a wall of the thickness around it', () => {
  const plate = R.makeBox([-50, -50, 0], [50, 50, 2]);
  const tool = R.makeBox([-10, -10, -5], [10, 10, 15]);
  const part = bodiesPart(plate, tool);
  const ind = feat(part, 'indent', { target: 0, toolBody: 1, thickness: 1, clearance: 0, keepTool: false });
  const r = ok(part);
  assert.equal(countSolids(r.body), 1);
  const b = box(r.body);
  near(b.lo[2], -6, 1e-3);
  near(b.hi[2], 2, 1e-3);
  // Plate + the wall below it (22 × 22 × 6 with rounded edges) − the tool's part inside (20 × 20 × 7).
  const v = V(r.body);
  assert.ok(v < 20000 + 22 * 22 * 6 - 20 * 20 * 7 + 1 && v > 20000 + 20 * 20 * 6 - 20 * 20 * 7, `indent volume ${v}`);
  ind.keepTool = true;
  assert.equal(countSolids(ok(part).body), 2);
});

test('flex bend curls a bar; twist, taper and stretch keep or change its volume as expected', () => {
  const part = newPart();
  block(part, 0, 0, 100, 10, 10);
  const fx = feat(part, 'flex', { mode: 'bend', axis: 'x', toward: 'z', angle: 90 });
  let r = ok(part);
  // A quarter circle of radius 100/(π/2) ≈ 63.7 on the neutral line: the bar now spans about R in x and z.
  const Rb = 100 / (Math.PI / 2);
  const b = box(r.body);
  assert.ok(Math.abs(b.size[0] - (Rb + 5)) < 2, `bend x ${b.size[0]}`);
  assert.ok(Math.abs(b.size[2] - (Rb + 5)) < 2, `bend z ${b.size[2]}`);
  near(V(r.body), 10000, 0.02);
  fx.mode = 'twist'; fx.angle = 90;
  r = ok(part);
  near(V(r.body), 10000, 0.02);
  near(box(r.body).size[0], 100, 1e-3);
  fx.mode = 'taper'; fx.factor = 0.5;
  r = ok(part);
  // Cross-section scaled linearly 1 → 0.5: volume = 100 · 100 · ∫(1 − t/2)² = 10000 · 7/12.
  near(V(r.body), (10000 * 7) / 12, 0.02);
  fx.mode = 'stretch'; fx.stretch = 50;
  r = ok(part);
  near(box(r.body).size[0], 150, 1e-3);
  near(V(r.body), 15000, 1e-3);
  // A faceted body still takes later features.
  const s = sketchOn(part, top, (k) => addCircle(k, 20, -5, 2));
  feat(part, 'extrude', { sketch: s.id, op: 'cut', end: 'throughBoth' });
  r = ok(part);
  assert.ok(V(r.body) < 15000 - 100);
});

test('deform pushes the material near a point', () => {
  const part = newPart();
  block(part, -50, -50, 100, 100, 10);
  feat(part, 'deform', { x: 0, y: 0, z: 10, dir: 'z', amount: 5, radius: 30 });
  const r = ok(part);
  const b = box(r.body);
  assert.ok(b.hi[2] > 14 && b.hi[2] <= 15 + 1e-6, `deform top ${b.hi[2]}`);
  near(b.lo[2], 0, 1e-6);
  assert.ok(V(r.body) > 100000, 'material added under the bump');
});

// ───────────────────────── reference geometry

test('reference axis drives a circular pattern; point and coordinate system are built', () => {
  const part = newPart();
  block(part, -50, -50, 100, 100, 5);
  const ax = feat(part, 'refAxis', { kind: 'twoPoints', x1: 20, y1: 0, z1: 0, x2: 20, y2: 0, z2: 10 });
  const s = sketchOn(part, top, (k) => addCircle(k, 35, 0, 3));
  const cut = feat(part, 'extrude', { sketch: s.id, op: 'cut', end: 'throughBoth' });
  feat(part, 'circularPattern', { seeds: [cut.id], axis: { kind: 'ref', id: ax.id }, count: 4, angle: 360, equal: true });
  const r = ok(part);
  near(V(r.body), 100 * 100 * 5 - 4 * Math.PI * 9 * 5, 2e-3);
  // The holes circle x = 20 at radius 15: one is at x = 5.
  assert.ok(r.body.faces.some((fc) => fc.geomType !== 'PLANE' && Math.abs(fc.center.x - 5) < 0.5 && Math.abs(fc.center.y) < 0.5));
  assert.ok(r.curves.has(ax.id));
  const pt = feat(part, 'refPoint', { kind: 'faceCenter', face: sigOf(r.body, faceAt('z', 5)) });
  // rx 90, ry −90 is the old Y-up rz 90 turned with the model: X → +z, Y → −x.
  const cs = feat(part, 'coordSys', { pointRef: pt.id, rx: 90, ry: -90, rz: 0 });
  const r2 = ok(part);
  // The face's centre (moved a little off the middle by the holes).
  const fc = r2.body.faces.find(faceAt('z', 5)).center;
  r2.results.get(pt.id).point.forEach((v, i) => near(v, [fc.x, fc.y, fc.z][i]));
  near(r2.results.get(pt.id).point[2], 5);
  const c = r2.results.get(cs.id).coordSys;
  near(c.x[2], 1); near(c.y[0], -1);
  // Axis from two planes: front ∩ right = the z axis.
  const a2 = feat(part, 'refAxis', { kind: 'twoPlanes', planeA: 'std:front', planeB: 'std:right' });
  const d = ok(part).results.get(a2.id).axis.dir;
  near(Math.abs(d[2]), 1);
});

test('table-driven pattern places copies at the XY table offsets in a coordinate system', () => {
  const part = newPart();
  block(part, -50, -50, 100, 100, 5);
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 2));
  const cut = feat(part, 'extrude', { sketch: s.id, op: 'cut', end: 'throughBoth' });
  // rx 90: the system's X / Z axes lie in the top plane (X → +x, Y → +z, Z → −y), so the table's X and Z offsets slide the hole across the plate.
  const cs = feat(part, 'coordSys', { rx: 90, ry: 0, rz: 0 });
  feat(part, 'tablePattern', { seeds: [cut.id], points: [[20, 0, 0], [0, 0, 20], [-20, 0, -20]], cs: cs.id });
  const r = ok(part);
  near(V(r.body), 50000 - 4 * Math.PI * 4 * 5, 2e-3);
});

// ───────────────────────── fillets

test('variable-radius fillet runs from r1 to r2', () => {
  const part = newPart();
  block(part, 0, 0, 40, 20, 20);
  const r0 = ok(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && Math.abs(e.startPoint.z - 20) < 1e-6 && Math.abs(e.endPoint.z - 20) < 1e-6 && Math.abs(e.startPoint.y) < 1e-6 && Math.abs(e.endPoint.y) < 1e-6);
  feat(part, 'variableFillet', { edges: [edgeSignature(edge)], r1: 2, r2: 6 });
  const r = ok(part);
  const removed = 16000 - V(r.body);
  // Between a constant 2 mm fillet (0.86 · 4 · 40) and a constant 6 mm one (0.86 · 36 · 40).
  const k = 1 - Math.PI / 4;
  assert.ok(removed > k * 4 * 40 && removed < k * 36 * 40, `removed ${removed}`);
});

test('face fillet rounds between two faces; full round replaces a rib top by a half cylinder', () => {
  const part = newPart();
  block(part, 0, 0, 40, 10, 20);
  const r0 = ok(part);
  const topF = sigOf(r0.body, faceAt('z', 20)); const frontF = sigOf(r0.body, (fc) => fc.geomType === 'PLANE' && Math.abs(fc.center.y) < 1e-6);
  const ff = feat(part, 'faceFillet', { faces: [topF, frontF], radius: 3 });
  let r = ok(part);
  near(V(r.body), 8000 - (1 - Math.PI / 4) * 9 * 40, 1e-3);
  part.features.pop();
  void ff;
  const back = sigOf(r0.body, (fc) => fc.geomType === 'PLANE' && Math.abs(fc.center.y + 10) < 1e-6);
  feat(part, 'fullRoundFillet', { faces: [frontF, topF, back] });
  r = ok(part);
  // Width 10 → radius 5: the two corners (5 × 5 − π·25/4 each) over 40 mm go.
  near(V(r.body), 8000 - 2 * (25 - (Math.PI * 25) / 4) * 40, 1e-3);
  near(box(r.body).hi[2], 20, 1e-4);
  assert.ok(r.body.faces.some((fc) => fc.geomType !== 'PLANE'));
});

// ───────────────────────── patterns

test('curve-driven pattern spaces copies along a curve', () => {
  const part = newPart();
  block(part, -10, -10, 100, 20, 5);
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 2));
  const cut = feat(part, 'extrude', { sketch: s.id, op: 'cut', end: 'throughBoth' });
  const path = feat(part, 'sketch3d', { points: [[0, 0, 5], [60, 0, 5]] });
  const cp = feat(part, 'curvePattern', { seeds: [cut.id], curve: path.id, count: 4, equal: true });
  const r = ok(part);
  assert.equal(r.results.get(cp.id).copies, 3);
  near(V(r.body), 10000 - 4 * Math.PI * 4 * 5, 2e-3);
  assert.ok(r.body.faces.some((fc) => fc.geomType !== 'PLANE' && Math.abs(fc.center.x - 60) < 0.5));
});

test('sketch-driven pattern puts a copy at each sketch point', () => {
  const part = newPart();
  block(part, -50, -50, 100, 100, 5);
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 2));
  const cut = feat(part, 'extrude', { sketch: s.id, op: 'cut', end: 'throughBoth' });
  const pts = sketchOn(part, top, (k) => { for (const [x, y] of [[0, 0], [30, 0], [0, 30], [-30, -30]]) k.entities.push({ id: `pt${x}_${y}`, type: 'point', x, y }); });
  feat(part, 'sketchPattern', { seeds: [cut.id], sketch: pts.id });
  const r = ok(part);
  near(V(r.body), 50000 - 4 * Math.PI * 4 * 5, 2e-3);
});

test('fill pattern fills a face with round cuts in a square grid', () => {
  const part = newPart();
  block(part, -25, -25, 50, 50, 4);
  const r0 = ok(part);
  const fp = feat(part, 'fillPattern', { face: sigOf(r0.body, faceAt('z', 4)), spacing: 10, margin: 3, layout: 'square', diameter: 4 });
  const r = ok(part);
  // Grid points at −20…20 step 10 that keep 3 + 2 mm from the edges (|u| ≤ 20): 5 × 5.
  assert.equal(r.results.get(fp.id).copies, 25);
  near(V(r.body), 10000 - 25 * Math.PI * 4 * 4, 2e-3);
  fp.layout = 'hex';
  const rh = ok(part);
  assert.ok(rh.results.get(fp.id).copies > 20);
});

test('variable pattern rebuilds the seed with a growing value per copy', () => {
  const part = newPart();
  block(part, 0, 0, 100, 20, 5);
  const bump = block(part, 5, 5, 10, 10, 5);
  // The bump starts on the top plane (z = 0) like the plate: 10 tall, its lower 5 mm inside the plate.
  bump.depth = 10;
  const vp = feat(part, 'variablePattern', { seeds: [bump.id], param: 'depth', delta: 5, count: 3, axis: 'x', spacing: 30 });
  const r = ok(part);
  assert.equal(r.results.get(vp.id).copies, 2);
  // Plate 100·20·5 = 10000, bumps 10·10 tall 10, 15, 20 above z = 0 (their lower 5 mm inside the plate).
  near(V(r.body), 10000 + 100 * (5 + 10 + 15));
  near(box(r.body).hi[2], 20);
});

// ───────────────────────── curves

test('projected curve and split line on the top face', () => {
  const part = newPart();
  block(part, -20, -20, 40, 40, 10);
  const r0 = ok(part);
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 8));
  const topSig = sigOf(r0.body, faceAt('z', 10));
  const pc = feat(part, 'projectedCurve', { sketch: s.id, faces: [topSig] });
  let r = ok(part);
  near(r.results.get(pc.id).length, 2 * Math.PI * 8, 1e-3);
  part.features.pop();
  const sl = feat(part, 'splitLine', { sketch: s.id, faces: [topSig] });
  r = ok(part);
  assert.equal(r.results.get(sl.id).splitFaces, 1);
  assert.equal(r.body.faces.length, 7);
  near(V(r.body), 16000);
  // A later feature still works on the split body.
  feat(part, 'fillet', { edges: [edgeSignature(r.body.edges.find((e) => e.geomType === 'LINE'))], radius: 1 });
  ok(part);
});

test('composite curve joins curves end to end; curve through XYZ points passes through them', () => {
  const part = newPart();
  const a = feat(part, 'sketch3d', { points: [[0, 0, 0], [10, 0, 0]] });
  const b = feat(part, 'sketch3d', { points: [[10, 0, 0], [10, 0, 20], [10, -5, 20]] });
  const cc = feat(part, 'compositeCurve', { curves: [a.id, b.id] });
  const pts = [[0, 0, 0], [20, 0, 10], [40, -10, 0], [60, -20, 15]];
  const xyz = feat(part, 'curveXYZ', { points: pts });
  const r = ok(part);
  near(r.results.get(cc.id).length, 35);
  const wire = r.curves.get(xyz.id);
  for (const p of pts) assert.ok(R.measureDistanceBetween(wire, R.makeVertex(p)) < 1e-4, `through ${p}`);
  const L = wire.edges.reduce((s, e) => s + e.length, 0);
  assert.ok(L > Math.hypot(20, 10) + Math.hypot(20, 10, 10) + Math.hypot(20, 15, 10) - 1e-6);
  // A sweep can follow it.
  feat(part, 'sweep', { sketch: sketchOn(part, { kind: 'std', name: 'right' }, (k) => addCircle(k, 0, 0, 1)).id, path: xyz.id });
});

// ───────────────────────── sketch tools

test('convert entities and intersection curve make sketch geometry from the body', () => {
  const R0 = R.makeBox([0, -20, 0], [30, 0, 10]);
  const fr = frame({ origin: [0, 0, 10], xDir: [1, 0, 0], normal: [0, 0, 1] });
  const sk = createSketchGeometry();
  const made = convertEntities(sk, fr, R0);
  assert.equal(made.filter((e) => e.type === 'line').length, 4);
  // The rectangle's points are shared: 4 corner points (the one at (0, 0) is the sketch origin).
  assert.equal(sk.entities.filter((e) => e.type === 'point').length, 4);
  const cyl = R.makeCylinder(5, 40, [0, 0, 0], [0, 0, 1]);
  const mid = frame(STD_PLANES.top);
  const sk2 = createSketchGeometry();
  const made2 = intersectionEntities(sk2, { ...mid, origin: [0, 0, 20] }, cyl);
  assert.ok(made2.some((e) => e.type === 'circle' && Math.abs(e.r - 5) < 1e-6) || made2.filter((e) => e.type === 'arc').length >= 1);
  const sk3 = createSketchGeometry();
  const made3 = intersectionEntities(sk3, frame(STD_PLANES.front), R.makeBox([-10, -5, -5], [10, 5, 5]));
  assert.equal(made3.filter((e) => e.type === 'line').length, 4);
});

test('move, copy, rotate and scale sketch entities', () => {
  const sk = createSketchGeometry();
  const l = addLine(sk, 0, 0, 10, 0);
  const c = addCircle(sk, 20, 0, 3);
  const P = (id) => { const p = byId(sk, id); return [p.x, p.y]; };
  transformEntities(sk, [l.id], { kind: 'move', dx: 5, dy: 5 });
  assert.deepEqual(P(l.p1), [5, 5]); assert.deepEqual(P(l.p2), [15, 5]);
  const made = transformEntities(sk, [c.id], { kind: 'move', dx: 0, dy: 10, copy: true });
  assert.equal(made.length, 1);
  assert.deepEqual(P(made[0].c), [20, 10]);
  assert.deepEqual(P(c.c), [20, 0]);
  transformEntities(sk, [l.id], { kind: 'rotate', cx: 5, cy: 5, angle: 90 });
  const q = P(l.p2); near(q[0], 5); near(q[1], 15);
  transformEntities(sk, [c.id], { kind: 'scale', cx: 20, cy: 0, factor: 2 });
  near(c.r, 6);
  const copies = transformEntities(sk, [l.id, c.id], { kind: 'rotate', cx: 0, cy: 0, angle: 180, copy: true });
  assert.equal(copies.length, 2);
  const cc = copies.find((e) => e.type === 'circle');
  near(P(cc.c)[0], -20);
});
