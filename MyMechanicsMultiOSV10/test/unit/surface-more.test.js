// More surface features: swept surface, cut with surface, delete hole, untrim, mid-surface and radiate surface —
// areas and volumes against their formulas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addArc, addCircle, addLine, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const top = { kind: 'std', name: 'top' }; const front = { kind: 'std', name: 'front' };
const part0 = () => ({ id: 'p', name: 'Part', features: [] });
function sketchOn(part, plane, draw) { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; }
function ok(part) { const r = regenerate(part); for (const [id, x] of r.results) assert.ok(x.ok, `${id}: ${x.error} ${x.detail ?? ''}`); return r; }
const area = (s) => R.measureArea(s);
const surfaceOf = (r, f) => r.results.get(f.id).surface;

test('swept surface: an open arc profile along a straight path is a strip of the arc length × the path', () => {
  const part = part0();
  // Profile on Top: a quarter circle r = 10 (open). Path on Front: a straight line 40 long, normal to Top.
  const prof = sketchOn(part, top, (k) => addArc(k, 0, 0, 10, 0, Math.PI / 2));
  const path = sketchOn(part, front, (k) => addLine(k, 10, 0, 10, 40));
  const f = createFeature(part, 'surfaceSweep', { sketch: prof.id, path: path.id });
  part.features.push(f);
  const r = ok(part);
  near(area(surfaceOf(r, f)), (Math.PI * 10) / 2 * 40, 1e-6);
});

test('cut with surface: a plane surface across a block removes the side its normal points to; flip keeps it', () => {
  const make = (flip) => {
    const part = part0();
    const s = sketchOn(part, top, (k) => addRectangle(k, -20, -10, 20, 10));
    part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 30 }));
    // A planar surface at z = 12 (on a reference plane), larger than the block.
    part.features.push(createFeature(part, 'plane', { base: top, offset: 12 }));
    const ps = sketchOn(part, { kind: 'ref', id: part.features.at(-1).id }, (k) => addRectangle(k, -40, -40, 40, 40));
    const sf = createFeature(part, 'surfacePlanar', { sketch: ps.id });
    part.features.push(sf);
    part.features.push(createFeature(part, 'cutWithSurface', { surface: sf.id, flip }));
    return ok(part).body;
  };
  // The planar surface's normal is the plane's (+z): the part above z = 12 goes.
  const a = make(false); const b = make(true);
  near(R.measureVolume(a), 40 * 20 * 12, 1e-6);
  near(R.measureVolume(b), 40 * 20 * 18, 1e-6);
  near(a.boundingBox.bounds[1][2], 12, 1e-6);
});

test('delete hole and untrim: a planar surface with two holes gets one or both back', () => {
  const make = (type, extra) => {
    const part = part0();
    const s = sketchOn(part, top, (k) => { addRectangle(k, 0, 0, 60, 30); addCircle(k, 15, 15, 5); addCircle(k, 45, 15, 4); });
    const sf = createFeature(part, 'surfacePlanar', { sketch: s.id });
    part.features.push(sf);
    const r0 = ok(part);
    const f = createFeature(part, type, { surface: sf.id, ...(typeof extra === 'function' ? extra(r0, sf) : extra) });
    part.features.push(f);
    return { base: surfaceOf(r0, sf), out: surfaceOf(ok(part), f) };
  };
  const all = make('deleteHole', {});
  near(area(all.base), 1800 - Math.PI * 25 - Math.PI * 16, 1e-6);
  near(area(all.out), 1800, 1e-6);
  // Only the hole whose edge is picked.
  const one = make('deleteHole', (r0, sf) => ({ edges: [edgeSignature(surfaceOf(r0, sf).edges.find((e) => e.geomType === 'CIRCLE' && Math.abs(R.measureLength(e) - Math.PI * 4) < 1e-6))] }));
  near(area(one.out), 1800 - Math.PI * 25, 1e-6);
  const holes = make('untrimSurface', { mode: 'holes' });
  near(area(holes.out), 1800, 1e-6);
  // Natural bounds of a plane trimmed to a rectangle with holes: the face's own parameter box (the rectangle).
  const nat = make('untrimSurface', { mode: 'natural' });
  near(area(nat.out), 1800, 1e-6);
});

test('untrim natural: a quarter-cylinder strip opens to the whole cylinder (its natural u range), the height kept', () => {
  const part = part0();
  // A cylindrical surface: an arc (r 10, 90°) extruded 20 as a surface; trimmed by the plane z = 8 keeps z < 8.
  const s = sketchOn(part, top, (k) => addArc(k, 0, 0, 10, 0, Math.PI / 2));
  const se = createFeature(part, 'surfaceExtrude', { sketch: s.id, depth: 20 });
  part.features.push(se);
  const f = createFeature(part, 'untrimSurface', { surface: se.id, mode: 'natural' });
  part.features.push(f);
  const r = ok(part);
  near(area(surfaceOf(r, se)), (Math.PI * 10) / 2 * 20, 1e-6);
  near(area(surfaceOf(r, f)), 2 * Math.PI * 10 * 20, 1e-6);
});

test('mid-surface of a plate and of a stepped plate (automatic facing pairs)', () => {
  const part = part0();
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 50, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 4 }));
  const f = createFeature(part, 'midSurface', { maxThickness: 5 });
  part.features.push(f);
  const r = ok(part);
  const mid = surfaceOf(r, f);
  near(area(mid), 1000, 1e-6);
  const [lo, hi] = mid.boundingBox.bounds;
  near(lo[2], 2, 1e-6); near(hi[2], 2, 1e-6);
  assert.equal(r.results.get(f.id).pairs, 1);
  // Picked faces: the top and the bottom.
  const body = regenerate({ ...part, features: part.features.slice(0, -1) }).body;
  const topF = body.faces.find((x) => x.geomType === 'PLANE' && Math.abs(x.center.z - 4) < 1e-9);
  const botF = body.faces.find((x) => x.geomType === 'PLANE' && Math.abs(x.center.z) < 1e-9);
  f.faces = [faceSignature(topF), faceSignature(botF)];
  near(area(surfaceOf(ok(part), f)), 1000, 1e-6);
});

test('radiate surface: from the top edges of a block outward in the top plane, a flat ring', () => {
  const part = part0();
  const s = sketchOn(part, top, (k) => addRectangle(k, -20, -10, 20, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 8 }));
  const body = ok(part).body;
  const rim = body.faces.find((x) => x.geomType === 'PLANE' && Math.abs(x.center.z - 8) < 1e-9);
  const f = createFeature(part, 'radiateSurface', { edges: rim.edges.map(edgeSignature), plane: 'std:top', distance: 5 });
  part.features.push(f);
  const r = ok(part);
  const surf = surfaceOf(r, f);
  // Outward offset of a 40 × 20 rectangle by 5 with round corners: 2·5·(40 + 20) + π·25.
  near(area(surf), 2 * 5 * 60 + Math.PI * 25, 1e-6);
  const [lo, hi] = surf.boundingBox.bounds;
  near(hi[0], 25, 1e-6); near(lo[1], -15, 1e-6); near(lo[2], 8, 1e-6); near(hi[2], 8, 1e-6);
  // Flip: inward.
  f.flip = true;
  near(area(surfaceOf(ok(part), f)), 40 * 20 - 30 * 10, 1e-6);
});

test('flatten surface: a cylinder strip develops exactly to a rectangle of the arc length × the height', () => {
  const part = part0();
  const s = sketchOn(part, top, (k) => addArc(k, 0, 0, 10, 0, Math.PI / 2));
  const se = createFeature(part, 'surfaceExtrude', { sketch: s.id, depth: 20 });
  part.features.push(se);
  const f = createFeature(part, 'flattenSurface', { surface: se.id });
  part.features.push(f);
  const r = ok(part);
  const flat = surfaceOf(r, f);
  near(area(flat), (Math.PI * 10) / 2 * 20, 1e-9);
  assert.equal(r.results.get(f.id).exact, true);
  // Flat: every face is a plane, four straight edges of 15.708 and 20.
  const faces = [...R.iterTopo(flat.wrapped, 'face')].map((x) => R.cast(x));
  assert.ok(faces.every((x) => x.geomType === 'PLANE'));
  const lens = flat.edges.map((e) => R.measureLength(e)).sort((a, b) => a - b);
  near(lens[0], (Math.PI * 10) / 2, 1e-9); near(lens[3], 20, 1e-9);
});

test('flatten surface: a cone frustum develops to an annular sector of the same area and slant lengths', () => {
  const part = part0();
  // A slanted line revolved a quarter turn about the vertical centerline: radii 10 → 4 over a height of 8.
  const s = sketchOn(part, front, (k) => { addLine(k, 10, 0, 4, 8); addLine(k, 0, -5, 0, 20, { construction: true }); });
  const sr = createFeature(part, 'surfaceRevolve', { sketch: s.id, angle: 90 });
  part.features.push(sr);
  const f = createFeature(part, 'flattenSurface', { surface: sr.id });
  part.features.push(f);
  const r = ok(part);
  const slant = Math.hypot(6, 8);
  // Lateral area of a quarter frustum: π (r1 + r2) · slant / 4.
  near(area(surfaceOf(r, sr)), (Math.PI * 14 * slant) / 4, 1e-9);
  near(area(surfaceOf(r, f)), (Math.PI * 14 * slant) / 4, 1e-7);
  // The two straight sides keep the slant length; the arcs keep their lengths (2π r / 4).
  const lens = surfaceOf(r, f).edges.map((e) => R.measureLength(e)).sort((a, b) => a - b);
  near(lens[0], (2 * Math.PI * 4) / 4, 1e-6); near(lens[3], (2 * Math.PI * 10) / 4, 1e-6);
  near(lens[1], slant, 1e-9); near(lens[2], slant, 1e-9);
});

test('flatten surface: a cylinder face with a hole keeps the hole; a sphere cap is laid out conformally with its area', () => {
  const part = part0();
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 40 }));
  // A radial hole through the side.
  const hs = sketchOn(part, front, (k) => addCircle(k, 0, 20, 3));
  part.features.push(createFeature(part, 'extrude', { sketch: hs.id, op: 'cut', end: 'throughBoth' }));
  const body = ok(part).body;
  const cyl = body.faces.find((x) => x.geomType === 'CYLINDRE');
  const f = createFeature(part, 'flattenSurface', { face: faceSignature(cyl) });
  part.features.push(f);
  const r = ok(part);
  // Exact: the side 2π·10·40 less two holes, each ∫ 2·10·asin(√(9 − t²)/10) dt over |t| ≤ 3 (the kernel's own 3D
  // area of the drilled face is 4e-6 off this; the developed face is within 2e-7).
  let hole = 0; const N = 20000;
  for (let i = 0; i < N; i++) { const t = -3 + (6 * (i + 0.5)) / N; hole += 2 * 10 * Math.asin(Math.sqrt(9 - t * t) / 10) * (6 / N); }
  near(area(surfaceOf(r, f)), 2 * Math.PI * 10 * 40 - 2 * hole, 5e-7);
  void cyl;
  // A sphere cap: an arc revolved a full turn (r 10, 60° from the pole).
  const q = part0();
  const a = sketchOn(q, front, (k) => { addArc(k, 0, 0, 10, Math.PI / 6, Math.PI / 2); addLine(k, 0, -12, 0, 12, { construction: true }); });
  const sr = createFeature(q, 'surfaceRevolve', { sketch: a.id, angle: 360 });
  q.features.push(sr);
  const fq = createFeature(q, 'flattenSurface', { surface: sr.id });
  q.features.push(fq);
  const rq = ok(q);
  const capArea = 2 * Math.PI * 10 * (10 - 10 * Math.sin(Math.PI / 6));
  near(area(surfaceOf(rq, sr)), capArea, 1e-6);
  // The layout keeps the mesh's area (within the mesh's own error); a cap is not developable: some distortion.
  near(area(surfaceOf(rq, fq)), capArea, 2e-3);
  const [lo, hi] = rq.results.get(fq.id).distortion;
  assert.equal(rq.results.get(fq.id).exact, false);
  assert.ok(lo < 1 && hi > 1 && lo > 0.5 && hi < 2, `distortion ${lo} … ${hi}`);
});
