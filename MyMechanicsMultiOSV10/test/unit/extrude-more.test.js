// Extrude end conditions (up to next / vertex / surface / offset from surface / body), start conditions (offset,
// surface, vertex), thin features (open and closed sketches, one direction / mid-plane / two directions, end caps)
// and selected contours — each against the volume worked out by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, addLine, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature, edgeSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const disk = (r, h) => Math.PI * r * r * h;
const newPart = () => ({ id: 'p', name: 'Part', features: [] });
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
const sketchOn = (part, plane, draw) => { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; };
const planeAt = (part, z) => add(part, 'plane', { base: top, offset: z });
const ref = (p) => ({ kind: 'ref', id: p.id });
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const failOf = (part, f) => regenerate(part).results.get(f.id);

/** A 60 × 40 × 20 block (z 0 … 20). */
function block(part = newPart()) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 40));
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  return part;
}
const BLOCK = 60 * 40 * 20;
const topFace = (part) => ok(part).body.faces.find((f) => f.geomType === 'PLANE' && Math.abs(f.center.z - 20) < 1e-6);

test('up to next: a boss from below stops at the block; a cut from above stops where it leaves the material', () => {
  const part = block();
  const p = planeAt(part, -30);
  const s = sketchOn(part, ref(p), (k) => addCircle(k, 30, 20, 5));
  const e = add(part, 'extrude', { sketch: s.id, end: 'upToNext' });
  near(V(ok(part).body), BLOCK + disk(5, 30));
  // A cut starting in the air above the block: through the air and the block, stopping at its bottom face.
  const q = planeAt(part, 40);
  const c = sketchOn(part, ref(q), (k) => addCircle(k, 10, 10, 3));
  add(part, 'extrude', { sketch: c.id, op: 'cut', end: 'upToNext' });
  near(V(ok(part).body), BLOCK + disk(5, 30) - disk(3, 20));
  // Nothing in the way: an error, not a body running to infinity.
  e.reverse = true;
  assert.equal(failOf(part, e).error, 'end-not-reached');
});

test('up to next: a cut into a block with a hollow stops at the hollow', () => {
  const part = block();
  // A hollow z 8 … 12 inside the block (a cut from the side through the middle).
  const h = sketchOn(part, top, (k) => addRectangle(k, 10, 5, 50, 35));
  add(part, 'extrude', { sketch: h.id, op: 'cut', start: 'offset', startOffset: 8, end: 'blind', depth: 4, reverse: true });
  const after = BLOCK - 40 * 30 * 4;
  near(V(ok(part).body), after);
  const s = sketchOn(part, ref(planeAt(part, 20)), (k) => addCircle(k, 30, 20, 4));
  add(part, 'extrude', { sketch: s.id, op: 'cut', end: 'upToNext' });
  // Only the top skin (z 12 … 20) is cut: the cut stops at the hollow's ceiling.
  near(V(ok(part).body), after - disk(4, 8));
});

test('up to vertex and up to surface (a face, a plane): the end plane / face of the extrusion', () => {
  const part = block();
  const p = planeAt(part, 70);
  const s = sketchOn(part, ref(planeAt(part, -30)), (k) => addCircle(k, 30, 20, 5));
  const e = add(part, 'extrude', { sketch: s.id, end: 'upToVertex', endVertex: [60, 40, 20] });
  near(V(ok(part).body), BLOCK + disk(5, 30));
  const tf = { kind: 'face', sig: faceSignature(topFace(part)) };
  e.end = 'upToSurface'; e.endFace = tf;
  near(V(ok(part).body), BLOCK + disk(5, 30));
  e.endFace = ref(p);
  near(V(ok(part).body), BLOCK + disk(5, 30) + disk(5, 50));
});

test('up to surface: a boss stops on a curved face (the volume under a cylinder)', () => {
  const part = newPart();
  // A horizontal bar: circle r 10 on the Right plane at (y 20, z 50), 100 long along x.
  const right = { kind: 'std', name: 'right' };
  const c = sketchOn(part, right, (k) => addCircle(k, 20, 50, 10));
  add(part, 'extrude', { sketch: c.id, end: 'midplane', depth: 100 });
  const bar = ok(part).body.faces.find((f) => /CYL/.test(f.geomType));
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 20, 2));
  add(part, 'extrude', { sketch: s.id, end: 'upToSurface', endFace: { kind: 'face', sig: faceSignature(bar) }, merge: false });
  const body = ok(part).body;
  // ∫∫ over the disk of (50 − √(100 − (y − 20)²)) dA, by the midpoint rule in y (the x width is exact).
  let exp = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const y = -2 + (4 * (i + 0.5)) / n; const w = 2 * Math.sqrt(Math.max(0, 4 - y * y)); exp += w * (50 - Math.sqrt(100 - y * y)) * (4 / n); }
  near(V(body) - disk(10, 100), exp, 1e-5);
});

test('offset from surface: short of the surface, past it (reverse offset), and translated', () => {
  const part = newPart();
  const p = planeAt(part, 50);
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 5));
  const e = add(part, 'extrude', { sketch: s.id, end: 'offsetFromSurface', endFace: ref(p), endOffset: 5 });
  near(V(ok(part).body), disk(5, 45));
  e.reverseOffset = true;
  near(V(ok(part).body), disk(5, 55));
  e.translateSurface = true; e.reverseOffset = false;
  near(V(ok(part).body), disk(5, 45));
});

test('up to body: a boss to the second body of a two-body part', () => {
  const part = block();
  const far = sketchOn(part, ref(planeAt(part, 100)), (k) => addRectangle(k, 0, 0, 60, 40));
  add(part, 'extrude', { sketch: far.id, depth: 20, merge: false });
  const s = sketchOn(part, ref(planeAt(part, 40)), (k) => addCircle(k, 30, 20, 5));
  const e = add(part, 'extrude', { sketch: s.id, end: 'upToBody', endBody: 1, merge: false });
  near(V(ok(part).body), 2 * BLOCK + disk(5, 60));
  e.endBody = 7;
  assert.equal(failOf(part, e).error, 'body-missing');
});

test('start conditions: offset, a face of the body and a vertex', () => {
  let part = newPart();
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 5));
  const e = add(part, 'extrude', { sketch: s.id, start: 'offset', startOffset: 5, depth: 10 });
  let body = ok(part).body;
  near(V(body), disk(5, 10)); near(body.boundingBox.bounds[0][2], 5); near(body.boundingBox.bounds[1][2], 15);
  e.startReverse = true;
  body = ok(part).body; near(body.boundingBox.bounds[0][2], -5); near(body.boundingBox.bounds[1][2], 5);

  part = block();
  const c = sketchOn(part, top, (k) => addCircle(k, 30, 20, 5));
  const g = add(part, 'extrude', { sketch: c.id, start: 'surface', startFace: { kind: 'face', sig: faceSignature(topFace(part)) }, depth: 10 });
  body = ok(part).body;
  near(V(body), BLOCK + disk(5, 10)); near(body.boundingBox.bounds[1][2], 30);
  g.start = 'vertex'; g.startVertex = [0, 0, 20];
  body = ok(part).body;
  near(V(body), BLOCK + disk(5, 10)); near(body.boundingBox.bounds[1][2], 30);
  // From the face up to a plane.
  g.start = 'surface'; g.end = 'upToSurface'; g.endFace = ref(planeAt(part, 45));
  part.features.push(part.features.splice(part.features.indexOf(g), 1)[0]);
  near(V(ok(part).body), BLOCK + disk(5, 25));
});

test('thin feature, closed sketch: one direction (in / out), mid-plane, two directions, end caps — sharp corners', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 60, 40));
  const e = add(part, 'extrude', { sketch: s.id, depth: 10, thin: true, thinKind: 'oneDir', thinT1: 2 });
  near(V(ok(part).body), (60 * 40 - 56 * 36) * 10);
  e.thinReverse = true;
  near(V(ok(part).body), (64 * 44 - 60 * 40) * 10);
  e.thinReverse = false; e.thinKind = 'mid';
  near(V(ok(part).body), (62 * 42 - 58 * 38) * 10);
  e.thinKind = 'twoDir'; e.thinT1 = 2; e.thinT2 = 1;
  near(V(ok(part).body), (62 * 42 - 56 * 36) * 10);
  e.thinKind = 'oneDir'; e.capEnds = true; e.capThickness = 2;
  near(V(ok(part).body), 60 * 40 * 2 * 2 + (60 * 40 - 56 * 36) * 6);
});

test('thin feature, open sketch: an L of lines — one side, the other side, mid-plane, two directions', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => { const a = addLine(k, 0, 0, 40, 0); addLine(k, 40, 0, 40, 20, { from: a.p2 }); });
  const e = add(part, 'extrude', { sketch: s.id, depth: 10, thin: true, thinKind: 'oneDir', thinT1: 2 });
  const one = V(ok(part).body) / 10;
  e.thinReverse = true;
  const other = V(ok(part).body) / 10;
  // Inside the corner: 40·2 + 20·2 − 2·2; outside it: 40·2 + 20·2 + 2·2.
  assert.deepEqual([one, other].map(Math.round).sort((a, b) => a - b), [116, 124]);
  near(one + other, 240, 1e-6);
  e.thinReverse = false; e.thinKind = 'mid';
  near(V(ok(part).body), (41 * 2 + 19 * 2) * 10);
  e.thinKind = 'twoDir'; e.thinT1 = 2; e.thinT2 = 1;
  const two = V(ok(part).body) / 10;
  // 2 on one side, 1 on the other: 40·3 + 20·3 ∓ the corner squares (2·2 in, 1·1 out or the other way round).
  assert.ok([40 * 3 + 20 * 3 - 4 + 1, 40 * 3 + 20 * 3 + 4 - 1].some((x) => Math.abs(two - x) < 1e-6), `${two}`);
});

test('selected contours: only the chosen regions are extruded', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => { addRectangle(k, 0, 0, 10, 10); addRectangle(k, 20, 0, 40, 10); });
  const e = add(part, 'extrude', { sketch: s.id, depth: 5, contours: [0] });
  const a = V(ok(part).body);
  e.contours = [1];
  const b = V(ok(part).body);
  assert.deepEqual([a, b].map(Math.round).sort((x, y) => x - y), [500, 1000]);
  e.contours = [0, 1];
  near(V(ok(part).body), 1500);
  e.contours = [];
  assert.equal(failOf(part, e).error, 'no-contours');
});

test('direction of extrusion along a slanted edge (depth along it, the prism leans); flip side to cut', () => {
  const part = newPart();
  // A leaning block: a parallelogram on the Front plane (sketch x → X, y → Z), its slanted edges along (1, 0, 1).
  const front = { kind: 'std', name: 'front' };
  const p = sketchOn(part, front, (k) => { const a = addLine(k, 0, 0, 10, 0); const b = addLine(k, 10, 0, 20, 10, { from: a.p2 }); const c = addLine(k, 20, 10, 10, 10, { from: b.p2 }); addLine(k, 10, 10, 0, 0, { from: c.p2, to: a.p1 }); });
  add(part, 'extrude', { sketch: p.id, end: 'midplane', depth: 10 });
  const lean = V(ok(part).body);
  const slanted = ok(part).body.edges.find((e) => { const a = e.startPoint; const b = e.endPoint; return Math.abs(Math.abs(b.x - a.x) - 10) < 1e-6 && Math.abs(Math.abs(b.z - a.z) - 10) < 1e-6; });
  assert.ok(slanted, 'a slanted edge');
  const s = sketchOn(part, top, (k) => addCircle(k, 100, 0, 5));
  add(part, 'extrude', { sketch: s.id, depth: 10, dirVector: { kind: 'edge', sig: edgeSignature(slanted) }, merge: false });
  const body = ok(part).body;
  // 10 along (1, 0, 1)/√2: 10/√2 high, the top circle moved 10/√2 in x.
  near(V(body) - lean, disk(5, 10 / Math.SQRT2));
  const hi = body.boundingBox.bounds[1];
  near(hi[0], 105 + 10 / Math.SQRT2);
  near(hi[2], 10 / Math.SQRT2 > 10 ? 10 / Math.SQRT2 : 10);

  // Flip side to cut: a through cut that keeps only what the profile covers.
  const q = block();
  const c = sketchOn(q, top, (k) => addCircle(k, 30, 20, 5));
  const cut = add(q, 'extrude', { sketch: c.id, op: 'cut', end: 'throughBoth' });
  near(V(ok(q).body), BLOCK - disk(5, 20));
  cut.flipSide = true;
  near(V(ok(q).body), disk(5, 20));
});
