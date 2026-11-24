// Fillet (multiple radii, chord width, face items, conic and curvature-continuous profiles), chamfer
// (distance-distance, angle-distance, offset face, vertex) and shell (outward, hollow, multi-thickness) against
// the volumes worked out from their cross-sections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addRectangle, addCircle, addLine, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' };
const newPart = () => ({ id: 'p', name: 'Part', features: [] });
const add = (part, type, params) => { const f = createFeature(part, type, params); part.features.push(f); return f; };
const sketchOn = (part, plane, draw) => { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; };
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const BOX = 40 * 30 * 20;

/** A 40 × 30 × 20 box (x 0 … 40, y 0 … 30, z 0 … 20) and its body. */
function box() {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 40, 30));
  add(part, 'extrude', { sketch: s.id, depth: 20 });
  return { part, body: ok(part).body };
}
const vertical = (body, x, y) => edgeSignature(body.edges.find((e) => { const a = e.startPoint; const b = e.endPoint; return Math.abs(a.x - x) < 1e-6 && Math.abs(a.y - y) < 1e-6 && Math.abs(b.x - x) < 1e-6 && Math.abs(b.y - y) < 1e-6; }));
const corner = (r) => r * r - (Math.PI * r * r) / 4; // a 90° edge's fillet cross-section

test('fillet: a radius per edge (multiple radii) and chord width', () => {
  const { part, body } = box();
  const a = vertical(body, 0, 0); const b = vertical(body, 40, 30);
  const f = add(part, 'fillet', { edges: [a, b], radius: 2, radii: [{ sig: b, r: 5 }] });
  near(V(ok(part).body), BOX - (corner(2) + corner(5)) * 20);
  // Chord width 3√2 on a 90° edge is radius 3.
  delete f.radii; f.mode = 'chord'; f.radius = 3 * Math.SQRT2;
  near(V(ok(part).body), BOX - 2 * corner(3) * 20);
});

test('fillet: a face as the item fillets all its edges (mitred where they meet)', () => {
  const { part, body } = box();
  const topFace = body.faces.find((fc) => fc.geomType === 'PLANE' && Math.abs(fc.center.z - 20) < 1e-6);
  const byFace = add(part, 'fillet', { edges: [], faceItems: [faceSignature(topFace)], radius: 2 });
  const v = V(ok(part).body);
  // The same as picking its four edges one by one.
  delete byFace.faceItems; byFace.edges = topFace.edges.map((e) => edgeSignature(e));
  near(v, V(ok(part).body), 1e-9);
  near(v, BOX - corner(2) * 140, 1e-3);
});

test('fillet profiles: conic with rho = √2 − 1 is the circle; rho 0.5 a parabola; curvature continuous (quintic)', () => {
  const r = 4;
  const run = (opts) => { const { part, body } = box(); add(part, 'fillet', { edges: [vertical(body, 0, 0)], radius: r, ...opts }); return BOX - V(ok(part).body); };
  near(run({ profile: 'conic', rho: Math.SQRT2 - 1 }), corner(r) * 20, 1e-6);
  // A parabola leaves 2/3 of the corner triangle (r²/2) under it: 1/3 of it is removed.
  near(run({ profile: 'conic', rho: 0.5 }), ((r * r) / 2 / 3) * 20, 1e-6);
  // Curvature continuous: the area between the corner and the quintic Bézier (poles on the two tangent lines).
  const P = [[r, 0], [r * 0.6, 0], [r * 0.25, 0], [0, r * 0.25], [0, r * 0.6], [0, r]];
  const bez = (t) => { const c = [1, 5, 10, 10, 5, 1]; let x = 0; let y = 0; for (let i = 0; i < 6; i++) { const w = c[i] * (1 - t) ** (5 - i) * t ** i; x += w * P[i][0]; y += w * P[i][1]; } return [x, y]; };
  let area = 0; const n = 20000; let prev = bez(0);
  for (let i = 1; i <= n; i++) { const q = bez(i / n); area += (prev[0] * q[1] - q[0] * prev[1]) / 2; prev = q; }
  // The region between the corner (0, 0) and the curve: the polygon corner → curve → back to the corner.
  near(run({ profile: 'curvature' }), Math.abs(area) * 20, 1e-5);
});

test('fillet profile on a circular edge: the conic circle on a cylinder top is the circular fillet', () => {
  const make = (opts) => {
    const part = newPart();
    const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 10));
    add(part, 'extrude', { sketch: s.id, depth: 20 });
    const rim = ok(part).body.edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(e.startPoint.z - 20) < 1e-6);
    add(part, 'fillet', { edges: [edgeSignature(rim)], radius: 3, ...opts });
    return V(ok(part).body);
  };
  near(make({ profile: 'conic', rho: Math.SQRT2 - 1 }), make({}), 1e-6);
});

test('chamfer: distance-distance (and flipped), angle-distance', () => {
  const run = (opts) => { const { part, body } = box(); add(part, 'chamfer', { edges: [vertical(body, 0, 0)], ...opts }); return BOX - V(ok(part).body); };
  near(run({ kind: 'distDist', distance: 2, distance2: 5 }), ((2 * 5) / 2) * 20);
  near(run({ kind: 'distDist', distance: 2, distance2: 5, flip: true }), ((2 * 5) / 2) * 20);
  const d = 4; const ang = 30;
  near(run({ kind: 'angleDist', distance: d, angle: ang }), ((d * d * Math.tan((ang * Math.PI) / 180)) / 2) * 20);
});

test('chamfer: offset face on a 60° wedge edge (offsets square to the faces), and a vertex chamfer', () => {
  const part = newPart();
  // A wedge: triangle (0,0) (40,0) (20·cos60·2 …) on Top, 10 high — the edge at the origin has 60° between its faces.
  const a60 = Math.PI / 3;
  const s = sketchOn(part, top, (k) => { const l1 = addLine(k, 0, 0, 40, 0); const l2 = addLine(k, 40, 0, 40 * Math.cos(a60), 40 * Math.sin(a60), { from: l1.p2 }); addLine(k, 40 * Math.cos(a60), 40 * Math.sin(a60), 0, 0, { from: l2.p2, to: l1.p1 }); });
  add(part, 'extrude', { sketch: s.id, depth: 10 });
  const body = ok(part).body;
  const before = V(body);
  add(part, 'chamfer', { kind: 'offsetFace', edges: [vertical(body, 0, 0)], distance: 2, distance2: 3 });
  const h1 = 2; const h2 = 3;
  const qx = (h2 + h1 * Math.cos(a60)) / Math.sin(a60);
  const s1 = qx; const s2 = qx * Math.cos(a60) + h1 * Math.sin(a60);
  const removed = before - V(ok(part).body);
  // Which face is "first" decides which offset goes where; both give s1 · s2 · sin α / 2 with h1, h2 swapped.
  const other = ((h1 + h2 * Math.cos(a60)) / Math.sin(a60));
  const s2b = other * Math.cos(a60) + h2 * Math.sin(a60);
  assert.ok([(s1 * s2 * Math.sin(a60)) / 2 * 10, (other * s2b * Math.sin(a60)) / 2 * 10].some((x) => Math.abs(x - removed) < 1e-6), `${removed}`);

  const b = box();
  add(b.part, 'chamfer', { kind: 'vertex', vertex: [40, 30, 20], distance: 2, distance2: 3, distance3: 4, edges: [] });
  near(BOX - V(ok(b.part).body), (2 * 3 * 4) / 6);
});

test('shell: outward with the top open, a hollow body (no face removed), a thicker bottom (multi-thickness)', () => {
  const topSig = (body) => faceSignature(body.faces.find((fc) => fc.geomType === 'PLANE' && Math.abs(fc.center.z - 20) < 1e-6));
  const bottomSig = (body) => faceSignature(body.faces.find((fc) => fc.geomType === 'PLANE' && Math.abs(fc.center.z) < 1e-6));
  let { part, body } = box();
  const sh = add(part, 'shell', { thickness: 2, faces: [topSig(body)], outward: true });
  near(V(ok(part).body), 44 * 34 * 22 - BOX);
  delete sh.outward; sh.faces = [];
  near(V(ok(part).body), BOX - 36 * 26 * 16);
  ({ part, body } = box());
  add(part, 'shell', { thickness: 2, faces: [topSig(body)], multi: [{ sig: bottomSig(body), t: 5 }] });
  near(V(ok(part).body), BOX - 36 * 26 * 15);
});
