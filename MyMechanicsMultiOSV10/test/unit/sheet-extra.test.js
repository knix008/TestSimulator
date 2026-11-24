// More sheet metal: convert to sheet metal, insert bends, rip, unfold / fold, cross break, welded corner, tab and
// slot — and the bend map (sheet-fold.js) Fold relies on. Volumes and sizes are checked against hand formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addLine, createSketchGeometry } from '../../src/cad/sketch.js';
import { faceSignature, edgeSignature } from '../../src/cad/refs.js';
import { bendAllowance } from '../../src/cad/advanced.js';
import { bendFrame, foldLocal, unfoldLocal, foldPoint, flangeMap, applyMap, refineAcross } from '../../src/cad/sheet-fold.js';
import { solidsOf } from '../../src/cad/sheet-extra.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const V = (s) => R.measureVolume(s);
const P = (v) => [v.x, v.y, v.z];
function newPart(id = 'p') { return { id, name: 'Part', features: [] }; }
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const size = (s) => { const [lo, hi] = s.boundingBox.bounds; return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]]; };
const bounds = (s) => s.boundingBox.bounds;
const faceAt = (body, test) => body.faces.find((f) => f.geomType === 'PLANE' && test(P(f.center), P(f.normalAt(f.center))));
const edgesWhere = (body, test) => body.edges.filter((e) => e.geomType === 'LINE' && test(P(e.startPoint), P(e.endPoint)));

/** A 100 × 60 × 40 box on the Top plane (z 0 … 40). */
function box(part, h = 40) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 60));
  add(part, 'extrude', { sketch: s.id, depth: h });
  return ok(part);
}
const bottomEdges = (body) => edgesWhere(body, (a, b) => Math.abs(a[2]) < 1e-6 && Math.abs(b[2]) < 1e-6);

// ───────────────────────── the bend map

test('bend map: a flat strip wraps onto the bend, the flange turns rigidly, and it inverts', () => {
  const bend = { r: 2, t: 2, theta: 90, BA: bendAllowance(90, 2, 2, 0.4), L: 20 };
  // The inner face's start stays; the strip's far end is on the inner arc at θ.
  assert.deepEqual(foldLocal(bend, [0, 0, 3]), [0, 0, 3]);
  const e = foldLocal(bend, [bend.BA, 0, 0]);
  near(e[0], 2); near(e[1], 2);
  // The outer face (y = −t) at the strip's end: radius r + t at 90°.
  const o = foldLocal(bend, [bend.BA, -2, 0]);
  near(o[0], 4); near(o[1], 2);
  // The flange runs straight up from there.
  const f = foldLocal(bend, [bend.BA + 10, -1, 5]);
  near(f[0], 3); near(f[1], 12); near(f[2], 5);
  for (const q of [[-3, -1, 0], [1.2, -0.5, 2], [bend.BA * 0.7, -1.9, 1], [bend.BA + 7, -0.3, -4]]) {
    const back = unfoldLocal(bend, foldLocal(bend, q));
    q.forEach((v, i) => near(back[i], v, 1e-9));
  }
});

test('bend map: the rigid flange map agrees with the point map in any frames', () => {
  const bend = { r: 1.5, t: 1, theta: 63, BA: bendAllowance(63, 1.5, 1, 0.33), L: 30 };
  const flat = bendFrame([5, -2, 1], [0.6, 0.8, 0], [0, 0, 1]);
  const form = bendFrame([-1, 4, 7], [0, 1, 0], [-1, 0, 0]);
  const M = flangeMap(bend, flat, form);
  for (const p of [[20, 30, 0.5], [15, 9, 0.1], [40, 12, 0.9]]) {
    const local = [(p[0] - 5) * 0.6 + (p[1] + 2) * 0.8, p[2] - 1];
    if (local[0] <= bend.BA) continue;
    const a = applyMap(M, p); const b = foldPoint(bend, flat, form, p);
    a.forEach((v, i) => near(v, b[i], 1e-9));
  }
  // R is a rotation.
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  near(det(M.R), 1, 1e-12);
});

test('bend map: refining across a bend splits shared edges once (the mesh stays closed)', () => {
  // A unit cube's surface, refined along x.
  const verts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const tris = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const { verts: v2, tris: t2 } = refineAcross(verts, tris, (p) => p[0], 0.1);
  const edges = new Map();
  for (const [a, b, c] of t2) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const k = p < q ? `${p},${q}` : `${q},${p}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
  assert.ok([...edges.values()].every((n) => n === 2), 'every edge between two triangles');
  for (const [a, b, c] of t2) for (const [p, q] of [[a, b], [b, c], [c, a]]) assert.ok(Math.abs(v2[p][0] - v2[q][0]) <= 0.1 + 1e-12);
});

// ───────────────────────── convert / insert bends

/** The converted box's volume: base, four bends and walls, and the overlapped corners' extensions. */
function convertedVolume({ t = 2, r = 2, H = 40, gap = 0.2 } = {}) {
  const s = r + t; const L = H - s;
  const base = (100 - 2 * s) * (60 - 2 * s) * t;
  const run = 2 * (100 - 2 * s) + 2 * (60 - 2 * s);
  const bendArea = (Math.PI / 4) * ((r + t) ** 2 - r ** 2);
  // At each corner one wall runs on s (to the other's outer face), the other s − t − gap (to its inner face less the gap).
  const corners = 4 * L * t * (s + (s - t - gap));
  return { formed: base + run * (bendArea + L * t) + corners, flat: base + run * t * (bendAllowance(90, r, t, 0.4) + L) + corners, L };
}

test('convert to sheet metal: a box becomes a tray with four bends inside its outline', () => {
  const part = newPart();
  const r0 = box(part);
  const face = faceAt(r0.body, (c, n) => Math.abs(c[2]) < 1e-6 && n[2] < -0.9);
  const cv = add(part, 'convertSheet', { face: faceSignature(face), edges: bottomEdges(r0.body).map(edgeSignature), thickness: 2, radius: 2, kFactor: 0.4, gap: 0.2 });
  const r = ok(part);
  const want = convertedVolume();
  near(V(r.body), want.formed, 1e-4);
  const [lo, hi] = bounds(r.body);
  lo.forEach((v) => near(v, 0, 1e-5)); near(hi[0], 100, 1e-5); near(hi[1], 60, 1e-5); near(hi[2], 40, 1e-5);
  assert.equal(r.results.get(cv.id).convert.bends, 4);
  assert.equal(r.sheet.bends.length, 4);
  // Flat: the base with each wall laid out (bend allowance + flat length) on its side.
  const flat = ok({ ...part, flat: true });
  near(V(flat.body), want.flat, 1e-4);
  const strip = bendAllowance(90, 2, 2, 0.4) + want.L;
  near(size(flat.body)[0], 92 + 2 * strip, 1e-5);
  near(size(flat.body)[1], 52 + 2 * strip, 1e-5);
  near(size(flat.body)[2], 2, 1e-6);
});

test('convert to sheet metal: material outside keeps the inner size; open corners leave the corners open', () => {
  const part = newPart();
  const r0 = box(part);
  const face = faceAt(r0.body, (c, n) => Math.abs(c[2]) < 1e-6 && n[2] < -0.9);
  const [e0] = bottomEdges(r0.body).filter((e) => Math.abs(e.startPoint.x - 100) < 1e-6 && Math.abs(e.endPoint.x - 100) < 1e-6);
  add(part, 'convertSheet', { face: faceSignature(face), edges: [edgeSignature(e0)], thickness: 2, radius: 3, kFactor: 0.4, side: 'outside' });
  const r = ok(part);
  const [lo, hi] = bounds(r.body);
  // Outside: the sheet is under the old bottom (z −2 … 0) and the wall outside x = 100 (to 102).
  near(lo[2], -2, 1e-5); near(hi[0], 102, 1e-5); near(hi[2], 40, 1e-5);
  // One bend: base short of the edge by r (the inner setback), wall L = 40 − r.
  const base = (100 - 3) * 60 * 2; const bend = (Math.PI / 4) * (5 ** 2 - 3 ** 2) * 60; const wall = (40 - 3) * 2 * 60;
  near(V(r.body), base + bend + wall, 1e-4);

  const p2 = newPart('q');
  const b2 = box(p2);
  const f2 = faceAt(b2.body, (c, n) => Math.abs(c[2]) < 1e-6 && n[2] < -0.9);
  add(p2, 'convertSheet', { face: faceSignature(f2), edges: bottomEdges(b2.body).map(edgeSignature), thickness: 2, radius: 2, kFactor: 0.4, corner: 'open' });
  const want = convertedVolume();
  near(V(ok(p2).body), want.formed - 4 * want.L * 2 * (4 + (4 - 2 - 0.2)), 1e-4);
});

test('insert bends: a shelled box is rebuilt with bends, as converting the solid box would', () => {
  const part = newPart();
  const r0 = box(part);
  const topFace = faceAt(r0.body, (c, n) => Math.abs(c[2] - 40) < 1e-6 && n[2] > 0.9);
  add(part, 'shell', { thickness: 2, faces: [faceSignature(topFace)] });
  const r1 = ok(part);
  const face = faceAt(r1.body, (c, n) => Math.abs(c[2]) < 1e-6 && n[2] < -0.9);
  const ib = add(part, 'insertBends', { face: faceSignature(face), radius: 2, kFactor: 0.4, gap: 0.1 });
  const r = ok(part);
  assert.equal(r.results.get(ib.id).convert.bends, 4);
  near(r.results.get(ib.id).convert.thickness, 2, 1e-9);
  near(V(r.body), convertedVolume({ gap: 0.1 }).formed, 1e-4);
  const flat = ok({ ...part, flat: true });
  near(V(flat.body), convertedVolume({ gap: 0.1 }).flat, 1e-4);
  near(size(flat.body)[2], 2, 1e-6);
});

// ───────────────────────── rip

test('rip: a gap through one wall at the other wall\'s inner face, or along the corner\'s bisector', () => {
  const part = newPart();
  const r0 = box(part);
  const topFace = faceAt(r0.body, (c, n) => Math.abs(c[2] - 40) < 1e-6 && n[2] > 0.9);
  add(part, 'shell', { thickness: 2, faces: [faceSignature(topFace)] });
  const r1 = ok(part);
  const before = V(r1.body);
  const [corner] = edgesWhere(r1.body, (a, b) => [a, b].every((p) => Math.abs(p[0] - 100) < 1e-6 && Math.abs(p[1] - 60) < 1e-6));
  assert.ok(corner);
  const rip = add(part, 'rip', { edges: [edgeSignature(corner)], gap: 0.5, direction: 'a' });
  let r = ok(part);
  // Through one wall (2 thick) for the whole edge (40 high), 0.5 wide.
  near(before - V(r.body), 2 * 0.5 * 40, 1e-6);
  assert.equal(r.results.get(rip.id).rip.edges, 1);
  rip.direction = 'both';
  r = ok(part);
  // On the bisector the strip crosses the t × t corner (√2 t long) and a sliver of a wall past its inner corner.
  const removed = before - V(r.body);
  assert.ok(removed > Math.SQRT2 * 2 * 0.5 * 40 * 0.95 && removed < Math.SQRT2 * 2 * 0.5 * 40 * 1.2, `bisector ${removed}`);
});

// ───────────────────────── unfold / fold

function flangedSheet() {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  add(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 });
  const r0 = ok(part);
  const [edge] = edgesWhere(r0.body, (a, b) => [a, b].every((p) => Math.abs(p[0] - 100) < 1e-6 && Math.abs(p[2] - 2) < 1e-6));
  add(part, 'edgeFlange', { edge: edgeSignature(edge), length: 30 });
  return part;
}

test('unfold / fold: a cut made across a bend in the flat lands across the formed bend', () => {
  const part = flangedSheet();
  const formedBefore = V(ok(part).body);
  const uf = add(part, 'unfold', {});
  const cutSketch = sketchOn(part, top, (k) => addRectangle(k, 90, 20, 115, 30));
  add(part, 'extrude', { sketch: cutSketch.id, op: 'cut', end: 'midplane', depth: 20 });
  const fd = add(part, 'fold', {});
  const r = ok(part);
  const BA = bendAllowance(90, 2, 2, 0.4);
  // In the flat: 10 × 25 × 2 is cut. Formed: 10 on the base, the whole bend (a quarter ring) and 15 − BA on the flange.
  const want = 10 * 10 * 2 + 10 * (Math.PI / 4) * (4 ** 2 - 2 ** 2) + (15 - BA) * 10 * 2;
  near(formedBefore - V(r.body), want, 2e-3);
  assert.equal(r.results.get(uf.id).unfold.bends, 1);
  assert.ok(r.results.get(fd.id).fold.cutPieces >= 2);
  // Between them the part is flat (the cut feature's body).
  near(size(r.results.get(cutSketch.id).body)[2], 2, 1e-6);
  // The flat pattern: the same cut, simply 10 × 25 through the sheet.
  const flatBefore = V(ok({ ...flangedSheet(), flat: true }).body);
  near(flatBefore - V(ok({ ...part, flat: true }).body), 10 * 25 * 2, 1e-6);
  // The formed part is closed where the cut is not: the flange still reaches its full height.
  near(bounds(r.body)[1][2], 2 + 2 + 30, 1e-5);
});

test('unfold / fold across a sketched bend (the side that turns, the strip, the side that stays)', () => {
  const make = () => {
    const part = newPart();
    const s0 = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
    add(part, 'baseFlange', { sketch: s0.id, thickness: 2, radius: 2, kFactor: 0.4 });
    // The line runs −y, so the side that turns is +x (past x = 60).
    const ln = sketchOn(part, top, (k) => addLine(k, 60, 60, 60, -10));
    add(part, 'sketchedBend', { sketch: ln.id, angle: 90, radius: 2 });
    return part;
  };
  const part = make();
  const before = V(ok(part).body);
  add(part, 'unfold', {});
  const cs = sketchOn(part, top, (k) => addRectangle(k, 55, 20, 70, 30));
  add(part, 'extrude', { sketch: cs.id, op: 'cut', end: 'midplane', depth: 20 });
  add(part, 'fold', {});
  const r = ok(part);
  const BA = bendAllowance(90, 2, 2, 0.4);
  const want = 5 * 10 * 2 + 10 * (Math.PI / 4) * (4 ** 2 - 2 ** 2) + (10 - BA) * 10 * 2;
  near(before - V(r.body), want, 2e-3);
  // Formed and flat both keep their outline: the bend still stands 2 + 2 + 40 − … high.
  near(bounds(r.body)[1][2], bounds(ok(make()).body)[1][2], 1e-6);
});

test('fold without an unfold before it is an error; two unfolds in a row too', () => {
  const part = flangedSheet();
  const fd = add(part, 'fold', {});
  assert.equal(regenerate(part).results.get(fd.id).error, 'no-unfold');
  part.features.pop();
  add(part, 'unfold', {});
  const u2 = add(part, 'unfold', {});
  assert.equal(regenerate(part).results.get(u2.id).error, 'already-unfolded');
});

// ───────────────────────── cross break, welded corner

test('cross break: the panel\'s two diagonals, cosmetic (the body is unchanged)', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  add(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 });
  const r0 = ok(part);
  const face = faceAt(r0.body, (c, n) => Math.abs(c[2] - 2) < 1e-6 && n[2] > 0.9);
  const cb = add(part, 'crossBreak', { face: faceSignature(face), radius: 150, angle: 3 });
  const r = ok(part);
  near(V(r.body), V(r0.body));
  const res = r.results.get(cb.id);
  assert.equal(res.crossBreak.lines.length, 2);
  for (const e of r.curves.get(cb.id).edges) near(e.length, Math.hypot(100, 50), 1e-9);
  near(res.crossBreak.radius, 150); near(res.crossBreak.angle, 3);
  assert.ok(res.crossBreak.normal[2] > 0.99);
});

test('welded corner fills the gap between two edge flanges (as a closed corner does) and keeps it as a weld', () => {
  const make = (type) => {
    const part = newPart(type);
    const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
    add(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 });
    const r0 = ok(part);
    const at = (e) => [e.startPoint, e.endPoint].map(P);
    const e1 = r0.body.edges.find((e) => e.geomType === 'LINE' && at(e).every((p) => Math.abs(p[0] - 100) < 1e-6 && Math.abs(p[2] - 2) < 1e-6));
    const e2 = r0.body.edges.find((e) => e.geomType === 'LINE' && at(e).every((p) => Math.abs(p[1] - 50) < 1e-6 && Math.abs(p[2] - 2) < 1e-6));
    const f1 = add(part, 'edgeFlange', { edge: edgeSignature(e1), length: 20 });
    const f2 = add(part, 'edgeFlange', { edge: edgeSignature(e2), length: 20 });
    const before = V(ok(part).body);
    const c = add(part, type, { flanges: [f1.id, f2.id] });
    return { part, before, c };
  };
  const w = make('weldedCorner');
  const rw = ok(w.part);
  const cc = make('closedCorner');
  const rc = ok(cc.part);
  const weld = rw.results.get(w.c.id).weld;
  assert.equal(weld.corners, 1);
  near(V(rw.body), V(rc.body), 2e-3);
  near(weld.volume, V(rw.body) - w.before, 2e-3);
  assert.ok(weld.length > 20);
  // The flat pattern has no weld.
  near(V(ok({ ...w.part, flat: true }).body), V(ok({ ...w.part, features: w.part.features.slice(0, -1), flat: true }).body), 1e-9);
});

// ───────────────────────── tab and slot

test('tab and slot: tabs on the upright plate, slots with clearance through the base plate', () => {
  const part = newPart();
  const a = sketchOn(part, top, (k) => addRectangle(k, -50, -30, 50, 30));
  add(part, 'extrude', { sketch: a.id, depth: 5 });
  const b = sketchOn(part, { kind: 'std', name: 'top' }, (k) => addRectangle(k, -40, -2, 40, 2));
  // The upright plate: a separate body standing on the base's top face (z 5 … 45).
  const up = add(part, 'extrude', { sketch: b.id, depth: 40, merge: false });
  up.end = 'blind';
  const pl = createFeature(part, 'plane', { base: top, offset: 5 });
  part.features.splice(part.features.indexOf(b), 0, pl);
  b.plane = { kind: 'ref', id: pl.id };
  const r0 = ok(part);
  assert.equal(solidsOf(r0.body).length, 2);
  const face = faceAt(r0.body, (c, n) => Math.abs(c[2] - 5) < 1e-6 && n[2] > 0.9 && Math.abs(c[0]) < 1e-6 && Math.abs(c[1]) < 1e-6 && true);
  const [edge] = edgesWhere(r0.body, (p, q) => [p, q].every((x) => Math.abs(x[2] - 5) < 1e-6 && Math.abs(x[1] + 2) < 1e-6) && Math.abs(Math.abs(p[0] - q[0]) - 80) < 1e-6);
  assert.ok(face && edge);
  const ts = add(part, 'tabSlot', { edge: edgeSignature(edge), face: faceSignature(face), count: 3, length: 10, clearance: 0.1 });
  const r = ok(part);
  const res = r.results.get(ts.id).tabSlot;
  near(res.height, 5); assert.equal(res.count, 3);
  const [base, upright] = solidsOf(r.body).sort((x, y) => size(y)[2] - size(x)[2]).reverse();
  // Base: 100 × 60 × 5 less three slots 10.2 × 4.2 through it; upright: 80 × 4 × 40 plus three 10 × 4 × 5 tabs.
  near(V(base), 100 * 60 * 5 - 3 * 10.2 * 4.2 * 5, 1e-6);
  near(V(upright), 80 * 4 * 40 + 3 * 10 * 4 * 5, 1e-6);
  near(bounds(upright)[0][2], 0, 1e-6);
});

test('a flipped edge flange stands on the sheet (it used to float two thicknesses away)', () => {
  for (const [z, lo, hi] of [[0, 0, 24], [2, -22, 2]]) {
    const part = newPart();
    const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
    add(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 });
    const r0 = ok(part);
    const [edge] = edgesWhere(r0.body, (a, b) => [a, b].every((p) => Math.abs(p[0] - 100) < 1e-6 && Math.abs(p[2] - z) < 1e-6));
    add(part, 'edgeFlange', { edge: edgeSignature(edge), length: 20, flip: true });
    const r = ok(part);
    near(bounds(r.body)[0][2], lo, 1e-6); near(bounds(r.body)[1][2], hi, 1e-6);
    assert.equal(solidsOf(r.body).length, 1);
  }
});
