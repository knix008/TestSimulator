// The features beyond extrude / revolve: sweep, loft, draft, rib, dome, helix + thread, wrap, surfaces and
// thicken, move / scale / split, insert part (cavity), sheet metal (with its flat pattern) and weldments.
// Every one is built on the kernel and its volume (or result) is checked against hand-worked values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, addArc, createSketchGeometry } from '../../src/cad/sketch.js';
import { addSpline, addEllipse } from '../../src/cad/sketchtools.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { bendAllowance } from '../../src/cad/advanced.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const V = (s) => R.measureVolume(s);
const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}
const front = { kind: 'std', name: 'front' }; const top = { kind: 'std', name: 'top' }; const right = { kind: 'std', name: 'right' };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
function box(part, w = 100, h = 50, d = 20) {
  const s = sketchOn(part, front, (k) => addRectangle(k, -w / 2, -h / 2, w / 2, h / 2));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: d }));
  return regenerate(part);
}

test('sweep a circle along a straight path and along an L path', () => {
  const part = newPart();
  const prof = sketchOn(part, top, (k) => addCircle(k, 0, 0, 2));
  const path = sketchOn(part, front, (k) => { const l = addLine(k, 0, 0, 0, 30); addLine(k, 0, 0, 20, 30, { from: l.p2 }); });
  part.features.push(createFeature(part, 'sweep', { sketch: prof.id, path: path.id }));
  const r = ok(part);
  near(V(r.body), Math.PI * 4 * 50, 0.03);
  assert.equal(part.features[2].name, 'Sweep1');
});

test('loft from a square to a circle', () => {
  const part = newPart();
  const a = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
  part.features.push(createFeature(part, 'plane', { base: top, offset: 30 }));
  const b = sketchOn(part, { kind: 'ref', id: part.features[1].id }, (k) => addCircle(k, 0, 0, 5));
  part.features.push(createFeature(part, 'loft', { sketches: [a.id, b.id], ruled: true }));
  const r = ok(part);
  const v = V(r.body);
  assert.ok(v > Math.PI * 25 * 30 && v < 400 * 30, `loft volume ${v}`);
});

test('draft tapers the side faces, drafted extrude', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  let r = regenerate(part);
  const sides = r.body.faces.filter((f) => f.geomType === 'PLANE' && Math.abs(faceSignature(f).normal[2]) < 0.5).map(faceSignature);
  part.features.push(createFeature(part, 'draft', { angle: 5, neutral: top, faces: sides }));
  r = ok(part);
  assert.ok(V(r.body) < 4000 - 1, `drafted ${V(r.body)}`);
  // Drafted extrude: the top shrinks by tan(5°)·10 on every side.
  const p2 = newPart();
  const s2 = sketchOn(p2, top, (k) => addRectangle(k, -10, -10, 10, 10));
  p2.features.push(createFeature(p2, 'extrude', { sketch: s2.id, depth: 10, draft: true, draftAngle: 5 }));
  const r2 = ok(p2);
  const t = 10 * Math.tan((5 * Math.PI) / 180);
  const a1 = 400; const a2 = (20 - 2 * t) ** 2;
  near(V(r2.body), (10 / 3) * (a1 + a2 + Math.sqrt(a1 * a2)), 0.01);
});

test('rib between the walls of an L bracket', () => {
  const part = newPart();
  const s = sketchOn(part, front, (k) => {
    const pts = [[0, 0], [50, 0], [50, 5], [5, 5], [5, 50], [0, 50]];
    pts.forEach((p, i) => addLine(k, ...p, ...pts[(i + 1) % pts.length]));
  });
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, end: 'midplane', depth: 40 }));
  const before = V(regenerate(part).body);
  const rib = sketchOn(part, front, (k) => addLine(k, 5, 40, 40, 5));
  part.features.push(createFeature(part, 'rib', { sketch: rib.id, thickness: 4 }));
  const r = ok(part);
  // A triangle with legs 35 (from the walls' inner faces) × 4 thick.
  near(V(r.body) - before, 0.5 * 35 * 35 * 4, 0.05);
});

test('dome on the top face', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const r0 = regenerate(part);
  const face = r0.body.faces.find((f) => f.geomType === 'PLANE' && faceSignature(f).center[2] > 9);
  part.features.push(createFeature(part, 'dome', { faces: [faceSignature(face)], height: 4 }));
  const r = ok(part);
  // Spherical cap of height h over radius a: πh(3a² + h²)/6.
  near(V(r.body) - V(r0.body), (Math.PI * 4 * (3 * 100 + 16)) / 6, 0.01);
});

test('helix as a sweep path (a spring) and a thread on a shaft', () => {
  const part = newPart();
  const helix = createFeature(part, 'helix', { plane: top, radius: 10, pitch: 6, turns: 2 });
  part.features.push(helix);
  // Profile: a circle on the front plane (through the helix axis, +Z) at the helix start (x = 10).
  const prof = sketchOn(part, front, (k) => addCircle(k, 10, 0, 1));
  part.features.push(createFeature(part, 'sweep', { sketch: prof.id, path: helix.id, frenet: true }));
  const r = ok(part);
  const len = 2 * Math.hypot(2 * Math.PI * 10, 6);
  near(V(r.body), Math.PI * len, 0.08);
  // Thread: an M10 shaft 20 long, threaded 10 from its top edge.
  const shaft = newPart('q');
  const c = sketchOn(shaft, top, (k) => addCircle(k, 0, 0, 5));
  shaft.features.push(createFeature(shaft, 'extrude', { sketch: c.id, depth: 20 }));
  const r1 = regenerate(shaft);
  const edge = r1.body.edges.find((e) => e.geomType === 'CIRCLE' && e.pointAt(0).z > 19);
  shaft.features.push(createFeature(shaft, 'thread', { edge: edgeSignature(edge), pitch: 1.5, length: 10 }));
  const r2 = ok(shaft);
  const removed = V(r1.body) - V(r2.body);
  assert.ok(removed > 10 && removed < Math.PI * 25 * 10 * 0.5, `thread removed ${removed}`);
});

test('surface extrude, planar surface, thicken and offset surface', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 20, 10));
  const plane = createFeature(part, 'surfacePlanar', { sketch: s.id });
  part.features.push(plane);
  part.features.push(createFeature(part, 'thicken', { surface: plane.id, thickness: 3 }));
  let r = ok(part);
  near(V(r.body), 600);
  const wall = sketchOn(part, front, (k) => addArc(k, 0, 0, 30, 0, Math.PI / 2));
  const sx = createFeature(part, 'surfaceExtrude', { sketch: wall.id, depth: 10 });
  part.features.push(sx);
  r = ok(part);
  assert.ok(r.surfaces.get(sx.id));
  near(R.measureArea(r.surfaces.get(sx.id)), (Math.PI / 2) * 30 * 10, 0.01);
});

test('move / copy, scale and split bodies', () => {
  const part = newPart();
  box(part, 10, 10, 10);
  part.features.push(createFeature(part, 'moveBody', { dx: 20, copy: true }));
  let r = ok(part);
  near(V(r.body), 2000);
  part.features.push(createFeature(part, 'scaleBody', { factor: 2 }));
  r = ok(part);
  near(V(r.body), 16000);
  part.features.push(createFeature(part, 'split', { plane: right, keep: 'above' }));
  r = ok(part);
  // The copy (x 30…50 after scaling) is on the +x side entirely; the original straddles x = 0.
  near(V(r.body), 8000 + 4000);
});

test('insert part and cavity (a part cut by another)', () => {
  const pin = newPart('pin');
  const c = sketchOn(pin, front, (k) => addCircle(k, 0, 0, 3));
  pin.features.push(createFeature(pin, 'extrude', { sketch: c.id, depth: 30 }));
  const block = newPart('block');
  box(block, 20, 20, 20);
  block.features.push(createFeature(block, 'insertPart', { part: 'pin', op: 'cut', dy: 5 }));
  const project = { parts: [pin, block] };
  const r = regenerate(block, { project });
  assert.ok(r.results.get(block.features[2].id).ok, r.results.get(block.features[2].id).detail);
  near(V(r.body), 8000 - Math.PI * 9 * 20, 0.002);
  // A part that inserts itself is refused (no endless rebuild).
  block.features.push(createFeature(block, 'insertPart', { part: 'block' }));
  assert.equal(regenerate(block, { project }).results.get(block.features[3].id).error, 'part-cycle');
});

test('sheet metal: base flange, edge flange, flat pattern length', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 3, kFactor: 0.4 }));
  const r0 = regenerate(part);
  near(V(r0.body), 100 * 50 * 2);
  // The top face's edge at x = 100.
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.9 && e.endPoint.z > 1.9);
  assert.ok(edge, 'edge at x=100 on top');
  part.features.push(createFeature(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30, angle: 90 }));
  const r1 = ok(part);
  const flange = (Math.PI / 2) * ((5 * 5 - 3 * 3) / 2) * 50 + 30 * 2 * 50;
  near(V(r1.body) - V(r0.body), flange, 0.01);
  const [lo, hi] = r1.body.boundingBox.bounds;
  assert.ok(hi[2] > 30, `flange goes up: ${hi[2]}`);
  // Flat: the flange lies flat, bend allowance + 30 long.
  const flat = regenerate({ ...part, flat: true });
  const [flo, fhi] = flat.body.boundingBox.bounds;
  near(fhi[0] - flo[0], 100 + bendAllowance(90, 3, 2, 0.4) + 30, 1e-4);
  near(fhi[2] - flo[2], 2);
  void lo;
});

test('weldment structural members along a frame sketch', () => {
  const part = newPart();
  const s = sketchOn(part, front, (k) => { const l = addLine(k, 0, 0, 500, 0); addLine(k, 0, 0, 0, 300, { from: l.p1 }); });
  part.features.push(createFeature(part, 'structural', { sketch: s.id, profile: 'squareTube', w: 40, t: 3 }));
  const r = ok(part);
  const area = 40 * 40 - 34 * 34;
  const res = r.results.get(part.features[1].id);
  assert.deepEqual(res.members.map((m) => m.length), [500, 300]);
  assert.ok(Math.abs(V(r.body) - area * 800) < area * 80, `frame volume ${V(r.body)}`);
});

test('spline and ellipse profiles extrude', () => {
  const part = newPart();
  const s = sketchOn(part, front, (k) => {
    const sp = addSpline(k, [[0, 0], [10, 5], [20, 0]]);
    const l = addLine(k, 20, 0, 20, -10, { from: sp.pts[2] });
    const m = addLine(k, 20, -10, 0, -10, { from: l.p2 });
    addLine(k, 0, -10, 0, 0, { from: m.p2, to: sp.pts[0] });
  });
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 1 }));
  const r = ok(part);
  assert.ok(V(r.body) > 200 && V(r.body) < 300, `spline region ${V(r.body)}`);
  const e = newPart();
  const k = sketchOn(e, front, (x) => addEllipse(x, 0, 0, 10, 5, 0.3));
  e.features.push(createFeature(e, 'extrude', { sketch: k.id, depth: 2 }));
  near(V(ok(e).body), Math.PI * 50 * 2);
});

test('wrap: emboss a rectangle onto a cylinder', () => {
  const part = newPart();
  const c = sketchOn(part, top, (k) => addCircle(k, 0, 0, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: c.id, depth: 40 }));
  const r0 = regenerate(part);
  const cyl = r0.body.faces.find((f) => f.geomType !== 'PLANE');
  part.features.push(createFeature(part, 'plane', { base: front, offset: 25 }));
  const s = sketchOn(part, { kind: 'ref', id: part.features[2].id }, (k) => addRectangle(k, -3, 15, 3, 25));
  part.features.push(createFeature(part, 'wrap', { sketch: s.id, face: faceSignature(cyl), depth: 1, op: 'emboss' }));
  const r = ok(part);
  const added = V(r.body) - V(r0.body);
  assert.ok(added > 6 * 10 * 0.9 && added < 6 * 10 * 1.1, `emboss ${added}`);
});
