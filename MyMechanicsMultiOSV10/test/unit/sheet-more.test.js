// More surfaces (ruled, delete / replace face, extend), sheet metal (miter flange, lofted bend with its
// developed flat pattern, tab, closed corner, corner relief, forming tools) and weldments (end cap, gusset,
// weld bead, trim / extend of members): each checked by volume, area or size of the result.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { bendAllowance } from '../../src/cad/advanced.js';
import { developStrip, SHEET_MORE_TYPES } from '../../src/cad/sheet-more.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const A = (s) => R.measureArea(s);
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
const front = { kind: 'std', name: 'front' }; const top = { kind: 'std', name: 'top' }; const right = { kind: 'std', name: 'right' };
function sketchOn(part, plane, draw) { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; }
function add(part, type, params) { const f = createFeature(part, type, params); part.features.push(f); return f; }
function ok(part, opts) { const r = regenerate(part, opts); for (const [id, x] of r.results) assert.ok(x.ok, `${part.features.find((f) => f.id === id)?.type}: ${x.error} ${x.detail ?? ''}`); return r; }
const size = (shape) => { const [lo, hi] = shape.boundingBox.bounds; return hi.map((v, i) => Math.round((v - lo[i]) * 1000) / 1000); };
const bounds = (shape) => shape.boundingBox.bounds;

/** A 20 mm cube from the top plane (x −10…10, y −10…10, z 0…20). */
function cube(part, s = 20) {
  const sk = sketchOn(part, top, (k) => addRectangle(k, -s / 2, -s / 2, s / 2, s / 2));
  add(part, 'extrude', { sketch: sk.id, depth: s });
  return regenerate(part);
}
const faceWhere = (body, test) => body.faces.find((f) => { const c = f.center; return test([c.x, c.y, c.z], f); });

test('every new type has a name and defaults', () => {
  const part = newPart();
  for (const type of SHEET_MORE_TYPES) { const f = createFeature(part, type); assert.ok(f.name && f.name !== type, type); }
});

// ───────────────────────── surfaces

test('ruled surface: tangent strips around the top face, and along a direction', () => {
  const part = newPart();
  const r0 = cube(part);
  const topFace = faceWhere(r0.body, (c) => c[2] > 19.99);
  const edges = topFace.edges.map(edgeSignature);
  const tan = add(part, 'ruledSurface', { edges, mode: 'tangent', distance: 5 });
  let r = ok(part);
  near(A(r.surfaces.get(tan.id)), 4 * 20 * 5);
  tan.mode = 'vector'; tan.axis = 'z';
  r = ok(part);
  const s = r.surfaces.get(tan.id);
  near(A(s), 400);
  near(bounds(s)[1][2], 25);
});

test('delete face: patch a through hole back, or leave a surface body', () => {
  const part = newPart();
  cube(part);
  const h = sketchOn(part, top, (k) => addCircle(k, 0, 0, 4));
  add(part, 'extrude', { sketch: h.id, op: 'cut', end: 'throughBoth' });
  const r0 = regenerate(part);
  near(V(r0.body), 8000 - Math.PI * 16 * 20, 1e-3);
  const hole = r0.body.faces.find((f) => f.geomType === 'CYLINDRE');
  const del = add(part, 'deleteFace', { faces: [faceSignature(hole)], mode: 'patch' });
  let r = ok(part);
  near(V(r.body), 8000, 1e-4);
  del.mode = 'fill';
  r = ok(part);
  near(V(r.body), 8000, 1e-4);
  del.mode = 'delete';
  r = ok(part);
  assert.equal(r.body, null);
  near(A(r.surfaces.get(del.id)), A(r0.body) - 2 * Math.PI * 4 * 20, 1e-3);
});

test('replace face: the top face moves onto a surface above or below', () => {
  const part = newPart();
  const r0 = cube(part);
  const topSig = faceSignature(faceWhere(r0.body, (c) => c[2] > 19.99));
  const pl = add(part, 'plane', { base: top, offset: 30 });
  const sk = sketchOn(part, { kind: 'ref', id: pl.id }, (k) => addRectangle(k, -20, -20, 20, 20));
  const surf = add(part, 'surfacePlanar', { sketch: sk.id });
  add(part, 'replaceFace', { faces: [topSig], surface: surf.id });
  let r = ok(part);
  near(V(r.body), 20 * 20 * 30);
  pl.offset = 12;
  r = ok(part);
  near(V(r.body), 20 * 20 * 12);
  // A curved replacement: an arc swept across gives a rounded top.
  const part2 = newPart('q');
  const r2 = cube(part2);
  const sig2 = faceSignature(faceWhere(r2.body, (c) => c[2] > 19.99));
  const pl2 = add(part2, 'plane', { base: front, offset: -15 });
  const sk2 = sketchOn(part2, { kind: 'ref', id: pl2.id }, (k) => addLine(k, -15, 25, 15, 30));
  const ext = add(part2, 'surfaceExtrude', { sketch: sk2.id, depth: 30 });
  add(part2, 'replaceFace', { faces: [sig2], surface: ext.id });
  r = ok(part2);
  assert.ok(r.surfaces.get(ext.id));
  // The sloped top from z 25 (x = −15) to 30 (x = 15): over x −10…10 its mean height is 27.5.
  near(V(r.body), 20 * 20 * 27.5, 2e-3);
});

test('extend surface: a plane grows by its offset, a cylinder along the same surface', () => {
  const part = newPart();
  const sk = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
  const pl = add(part, 'surfacePlanar', { sketch: sk.id });
  const ex = add(part, 'extendSurface', { surface: pl.id, distance: 5 });
  let r = ok(part);
  near(A(r.surfaces.get(ex.id)), 900);
  const part2 = newPart('q');
  const c = sketchOn(part2, top, (k) => addCircle(k, 0, 0, 10));
  const cyl = add(part2, 'surfaceExtrude', { sketch: c.id, depth: 20 });
  const ex2 = add(part2, 'extendSurface', { surface: cyl.id, distance: 5 });
  r = ok(part2);
  // A full cylinder: only its height grows (5 at each end).
  near(A(r.surfaces.get(ex2.id)), 2 * Math.PI * 10 * 30, 1e-3);
  ex2.kind = 'linear';
  r = ok(part2);
  near(A(r.surfaces.get(ex2.id)), 2 * Math.PI * 10 * 30, 1e-2);
});

// ───────────────────────── sheet metal

function sheet(part, w = 100, d = 50, t = 2) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, w, d));
  add(part, 'baseFlange', { sketch: s.id, thickness: t, radius: 2, kFactor: 0.4 });
  return regenerate(part);
}
/** The straight top edges of the sheet along x = w and along y = d (the sketch's y runs to +y). */
function cornerEdges(body, w = 100, d = 50, t = 2) {
  const at = (e) => [e.startPoint, e.endPoint].map((p) => [p.x, p.y, p.z]);
  const e1 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((p) => Math.abs(p[0] - w) < 1e-6 && Math.abs(p[2] - t) < 1e-6));
  const e2 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((p) => Math.abs(p[1] - d) < 1e-6 && Math.abs(p[2] - t) < 1e-6));
  return [e1, e2];
}

const flangeArea = (r, t, L) => (Math.PI / 4) * ((r + t) ** 2 - r ** 2) + L * t;

test('miter flange: two flanges meeting in a mitered corner, flat pattern as strips', () => {
  const part = newPart();
  const r0 = sheet(part);
  const [e1, e2] = cornerEdges(r0.body);
  assert.ok(e1 && e2);
  const mf = add(part, 'miterFlange', { edges: [edgeSignature(e1), edgeSignature(e2)], length: 20, gap: 0 });
  const r = ok(part);
  const base = 100 * 50 * 2;
  const plain = flangeArea(2, 2, 20) * (50 + 100);
  const extra = V(r.body) - base - plain;
  // The corner adds material (the mitered pieces close it) but less than a full overlap of both flanges.
  assert.ok(extra > 0 && extra < 2 * flangeArea(2, 2, 20) * 25, `corner ${extra}`);
  const b = size(r.body);
  assert.ok(b[2] > 23 && b[2] < 25, `height ${b[2]}`);
  assert.equal(r.results.get(mf.id).miter.corners, 1);
  const flat = ok({ ...part, flat: true });
  const strip = bendAllowance(90, 2, 2, 0.4) + 20;
  near(size(flat.body)[0], 100 + strip, 1e-4);
  near(size(flat.body)[1], 50 + strip, 1e-4);
});

test('closed corner closes two edge flanges like a miter flange does', () => {
  const part = newPart();
  const r0 = sheet(part);
  const [e1, e2] = cornerEdges(r0.body);
  const f1 = add(part, 'edgeFlange', { edge: edgeSignature(e1), length: 20 });
  const f2 = add(part, 'edgeFlange', { edge: edgeSignature(e2), length: 20 });
  const before = V(ok(part).body);
  add(part, 'closedCorner', { flanges: [f1.id, f2.id] });
  const r = ok(part);
  const miter = newPart('m');
  const m0 = sheet(miter);
  const [m1, m2] = cornerEdges(m0.body);
  add(miter, 'miterFlange', { edges: [edgeSignature(m1), edgeSignature(m2)], length: 20 });
  const rm = ok(miter);
  assert.ok(V(r.body) > before + 1);
  near(V(r.body), V(rm.body), 2e-3);
});

test('corner relief cuts a rectangular notch through both bend zones (flat pattern)', () => {
  const part = newPart();
  const r0 = sheet(part);
  const [e1, e2] = cornerEdges(r0.body);
  add(part, 'edgeFlange', { edge: edgeSignature(e1), length: 20 });
  add(part, 'edgeFlange', { edge: edgeSignature(e2), length: 20 });
  const before = V(ok({ ...part, flat: true }).body);
  const rel = add(part, 'cornerRelief', { kind: 'rect', size: 3 });
  const flat = ok({ ...part, flat: true });
  const zone = 2 + 2;
  // The notch spans the sheet corner (3 × 3), both bend strips (3 × zone each) and the corner between them
  // (zone × zone, which the second strip covers in this flat pattern): (3 + zone)² × t.
  near(before - V(flat.body), 2 * (3 + zone) ** 2, 1e-4);
  const formed = ok(part);
  assert.equal(formed.results.get(rel.id).relief.corners, 1);
  rel.kind = 'round';
  assert.ok(V(ok(part).body) < V(regenerate({ ...part, features: part.features.slice(0, -1) }).body));
});

test('tab adds a sheet-thick piece on the sheet plane', () => {
  const part = newPart();
  sheet(part);
  const tb = sketchOn(part, top, (k) => addRectangle(k, 100, 10, 120, 40));
  add(part, 'tab', { sketch: tb.id });
  const r = ok(part);
  near(V(r.body), 100 * 50 * 2 + 20 * 30 * 2);
  near(size(r.body)[0], 120);
  near(size(r.body)[2], 2);
  // A tab off the sheet is refused.
  const far = newPart('f');
  sheet(far);
  const tf = sketchOn(far, top, (k) => addRectangle(k, 150, 10, 170, 40));
  const bad = add(far, 'tab', { sketch: tf.id });
  assert.equal(regenerate(far).results.get(bad.id).error, 'tab-not-touching');
});

test('lofted bend: a sheet cone between two circles; its flat blank has the same area', () => {
  const part = newPart();
  const a = sketchOn(part, top, (k) => addCircle(k, 0, 0, 30));
  const pl = add(part, 'plane', { base: top, offset: 40 });
  const b = sketchOn(part, { kind: 'ref', id: pl.id }, (k) => addCircle(k, 0, 0, 15));
  const lb = add(part, 'loftedBend', { sketches: [a.id, b.id], thickness: 1.5 });
  const r = ok(part);
  const slant = Math.hypot(15, 40);
  const lateral = Math.PI * (30 + 15) * slant;
  near(r.results.get(lb.id).lofted.area, lateral, 1e-3);
  assert.ok(V(r.body) > lateral * 1.5 * 0.98 && V(r.body) < lateral * 1.5 * 1.06, `cone volume ${V(r.body)}`);
  const flat = ok({ ...part, flat: true });
  near(r.results.get(lb.id).lofted.area, flat.results.get(lb.id).lofted.flatArea, 5e-3);
  near(V(flat.body), flat.results.get(lb.id).lofted.flatArea * 1.5, 1e-4);
  near(size(flat.body)[2], 1.5);
});

test('developing a flat strip keeps its lengths', () => {
  const P = [[0, 0, 0], [10, 0, 0], [20, 0, 5]]; const Q = [[0, 10, 0], [10, 10, 2], [20, 10, 5]];
  const { p, q } = developStrip(P, Q);
  const d2 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1]); const d3 = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  for (let i = 0; i < 2; i++) { near(d2(p[i], p[i + 1]), d3(P[i], P[i + 1]), 1e-9); near(d2(q[i], q[i + 1]), d3(Q[i], Q[i + 1]), 1e-9); near(d2(p[i + 1], q[i]), d3(P[i + 1], Q[i]), 1e-9); }
});

test('forming tools: dimple, emboss, louver and lance rise from the sheet face', () => {
  for (const tool of ['dimple', 'emboss', 'louver', 'lance']) {
    const part = newPart(tool);
    const r0 = sheet(part);
    const topFace = faceWhere(r0.body, (c, f) => f.geomType === 'PLANE' && c[2] > 1.99);
    const ft = add(part, 'formTool', { face: faceSignature(topFace), tool, size: 20, width: 8, height: 4 });
    const r = ok(part);
    const b = size(r.body);
    near(b[2], 2 + 4, 1e-3);
    assert.equal(r.results.get(ft.id).form.tool, tool);
    const dv = V(r.body) - 100 * 50 * 2;
    // The formed shell holds about as much metal as the opening it replaces, a little more (it is stretched).
    assert.ok(dv > -1 && dv < 600, `${tool}: ${dv}`);
    ft.down = true;
    const rd = ok(part);
    near(size(rd.body)[2], 6, 1e-3);
    near(bounds(rd.body)[0][2], -4, 1e-3);
  }
});

// ───────────────────────── weldments

function member(part, profile = 'squareBar', w = 10, x1 = 100) {
  const s = sketchOn(part, top, (k) => addLine(k, 0, 0, x1, 0));
  return add(part, 'structural', { sketch: s.id, profile, w, h: w, t: 2 });
}

test('end cap: an inset plate on a tube end', () => {
  const part = newPart();
  member(part, 'squareTube', 40, 200);
  const r0 = ok(part);
  const end = faceWhere(r0.body, (c, f) => f.geomType === 'PLANE' && c[0] > 199.99);
  const cap = add(part, 'endCap', { face: faceSignature(end), thickness: 5, inset: 2 });
  const r = ok(part);
  near(V(r.body) - V(r0.body), 36 * 36 * 5);
  near(size(r.body)[0], 205);
  assert.equal(r.results.get(cap.id).endCap.w, 36);
});

/** An L of two blocks: a base (x 0…100, z 0…10) and an upright (x 0…10, z 0…100), y −40…0. */
function corner(part) {
  const a = sketchOn(part, front, (k) => addRectangle(k, 0, 0, 100, 10));
  add(part, 'extrude', { sketch: a.id, depth: 40 });
  const b = sketchOn(part, front, (k) => addRectangle(k, 0, 0, 10, 100));
  add(part, 'extrude', { sketch: b.id, depth: 40 });
  return ok(part);
}

test('gusset: a triangular plate in the inside corner', () => {
  const part = newPart();
  const r0 = corner(part);
  const f1 = faceWhere(r0.body, (c, f) => f.geomType === 'PLANE' && Math.abs(c[2] - 10) < 1e-6 && c[0] > 10);
  const f2 = faceWhere(r0.body, (c, f) => f.geomType === 'PLANE' && Math.abs(c[0] - 10) < 1e-6 && c[2] > 10);
  const g = add(part, 'gusset', { faces: [faceSignature(f1), faceSignature(f2)], d1: 30, d2: 30, thickness: 5 });
  let r = ok(part);
  near(V(r.body) - V(r0.body), 0.5 * 30 * 30 * 5);
  g.chamfer = 5;
  r = ok(part);
  near(V(r.body) - V(r0.body), (0.5 * 30 * 30 - 0.5 * 5 * 5) * 5);
});

test('weld bead: a fillet weld along the inside corner, or only a cosmetic one', () => {
  const part = newPart();
  const r0 = corner(part);
  const e = r0.body.edges.find((x) => x.geomType === 'LINE' && [x.startPoint, x.endPoint].every((p) => Math.abs(p.x - 10) < 1e-6 && Math.abs(p.z - 10) < 1e-6));
  const w = add(part, 'weldBead', { edges: [edgeSignature(e)], size: 5 });
  let r = ok(part);
  near(V(r.body) - V(r0.body), 0.5 * 5 * 5 * 40);
  near(r.results.get(w.id).weld.length, 40);
  w.cosmetic = true;
  r = ok(part);
  near(V(r.body), V(r0.body));
  assert.ok(r.curves.get(w.id));
  // On an outside edge there is no corner to weld.
  const outside = r0.body.edges.find((x) => x.geomType === 'LINE' && [x.startPoint, x.endPoint].every((p) => Math.abs(p.x - 100) < 1e-6 && Math.abs(p.z - 10) < 1e-6));
  w.cosmetic = false; w.edges = [edgeSignature(outside)];
  assert.equal(regenerate(part).results.get(w.id).error, 'weld-not-corner');
});

test('weld bead around a pipe standing on a plate', () => {
  const part = newPart();
  const p = sketchOn(part, top, (k) => addRectangle(k, -30, -30, 30, 30));
  add(part, 'extrude', { sketch: p.id, depth: 5 });
  const pl = add(part, 'plane', { base: top, offset: 5 });
  const c = sketchOn(part, { kind: 'ref', id: pl.id }, (k) => addCircle(k, 0, 0, 10));
  add(part, 'extrude', { sketch: c.id, depth: 30 });
  const r0 = ok(part);
  const e = r0.body.edges.find((x) => x.geomType === 'CIRCLE' && Math.abs(x.startPoint.z - 5) < 1e-6);
  add(part, 'weldBead', { edges: [edgeSignature(e)], size: 3 });
  const r = ok(part);
  // A triangle (legs 3) revolved at radius 10 + 1 (its centroid): Pappus.
  near(V(r.body) - V(r0.body), 0.5 * 9 * 2 * Math.PI * 11, 2e-3);
});

test('trim / extend a structural member to a plane; the cut list length follows', () => {
  const part = newPart();
  const m = member(part, 'squareBar', 10, 100);
  const pl = add(part, 'plane', { base: right, offset: 60 });
  const te = add(part, 'trimExtend', { member: m.id, plane: { kind: 'ref', id: pl.id } });
  let r = ok(part);
  near(V(r.body), 100 * 60);
  near(size(r.body)[0], 60);
  assert.equal(r.results.get(te.id).members[0].length, 60);
  pl.offset = 150;
  r = ok(part);
  near(V(r.body), 100 * 150);
  near(size(r.body)[0], 150);
  assert.equal(r.results.get(te.id).members[0].length, 150);
});
