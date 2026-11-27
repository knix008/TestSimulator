// The second batch of features: fill / boundary / trim surfaces, hem, sketched bend and jog (with their flat
// patterns), parting line and core / cavity, 3D sketches (sweep path, structural members), sketch text,
// a true wrap on a cylinder, and the cam mate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, addText, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';
import { bendAllowance } from '../../src/cad/advanced.js';
import { solveMates, quatIdentity } from '../../src/cad/assembly.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
const front = { kind: 'std', name: 'front' }; const top = { kind: 'std', name: 'top' }; const right = { kind: 'std', name: 'right' };
function sketchOn(part, plane, draw) { const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() }); draw(s); part.features.push(s); return s; }
function ok(part, opts) { const r = regenerate(part, opts); for (const [id, x] of r.results) assert.ok(x.ok, `${part.features.find((f) => f.id === id)?.type}: ${x.error} ${x.detail ?? ''}`); return r; }
const box = (r) => { const [lo, hi] = r.body.boundingBox.bounds; return hi.map((v, i) => Math.round((v - lo[i]) * 1000) / 1000); };

test('fill surface over a 3D sketch loop, boundary surface through two profiles', () => {
  const part = newPart();
  const s3 = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [20, -4, 0], [20, 0, 20], [0, -4, 20]], closed: true });
  part.features.push(s3);
  const fill = createFeature(part, 'fillSurface', { curve: s3.id });
  part.features.push(fill);
  let r = ok(part);
  const area = R.measureArea(r.surfaces.get(fill.id));
  assert.ok(area > 400 && area < 440, `fill area ${area}`);
  const a = sketchOn(part, top, (k) => addCircle(k, 0, 0, 10));
  part.features.push(createFeature(part, 'plane', { base: top, offset: 30 }));
  const b = sketchOn(part, { kind: 'ref', id: part.features.at(-1).id }, (k) => addRectangle(k, -8, -8, 8, 8));
  const bd = createFeature(part, 'boundary', { curves: [a.id, b.id] });
  part.features.push(bd);
  r = ok(part);
  assert.ok(R.measureArea(r.surfaces.get(bd.id)) > 1500);
});

test('trim a surface by a plane keeps one side', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addRectangle(k, -10, -10, 10, 10));
  const pl = createFeature(part, 'surfacePlanar', { sketch: s.id });
  part.features.push(pl);
  const tr = createFeature(part, 'trimSurface', { surface: pl.id, plane: right, keep: 'above' });
  part.features.push(tr);
  const r = ok(part);
  near(R.measureArea(r.surfaces.get(tr.id)), 200);
});

test('trim a surface by a sketch: the regions taken out (outside) or kept (inside), then thickened', () => {
  for (const keep of ['outside', 'inside']) {
    const part = newPart();
    const s = sketchOn(part, top, (k) => addRectangle(k, -20, -10, 20, 10));
    const pl = createFeature(part, 'surfacePlanar', { sketch: s.id });
    part.features.push(pl);
    // A circle Ø6 and a square 8 × 8 on a plane 30 above: the regions go down through the surface.
    part.features.push(createFeature(part, 'plane', { base: top, offset: 30 }));
    const cut = sketchOn(part, { kind: 'ref', id: part.features.at(-1).id }, (k) => { addCircle(k, -10, 0, 3); addRectangle(k, 6, -4, 14, 4); });
    const tr = createFeature(part, 'trimSurface', { surface: pl.id, sketch: cut.id, keep });
    part.features.push(tr);
    part.features.push(createFeature(part, 'thicken', { surface: tr.id, thickness: 2 }));
    const r = ok(part);
    const inside = Math.PI * 9 + 64;
    near(R.measureArea(r.surfaces.get(tr.id)), keep === 'inside' ? inside : 800 - inside, 1e-3);
    near(R.measureVolume(r.body), 2 * (keep === 'inside' ? inside : 800 - inside), 2e-3);
    assert.ok(r.absorbed.has(pl.id) && r.absorbed.has(tr.id), keep);
  }
});

function sheet(part, w = 100, d = 50, t = 2) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, w, d));
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: t, radius: 2, kFactor: 0.4 }));
  return regenerate(part);
}

test('hem folds the edge back over the sheet', () => {
  const part = newPart();
  const r0 = sheet(part);
  const edge = r0.body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.z > 1.9 && e.endPoint.z > 1.9);
  part.features.push(createFeature(part, 'hem', { edge: edgeSignature(edge), kind: 'open', gap: 2, length: 15 }));
  const r = ok(part);
  const b = box(r);
  // Folded up and back: the box grows upward (gap + thickness) and only a little in x (the bend).
  assert.ok(b[2] > 5 && b[2] < 7, `hem height ${b[2]}`);
  assert.ok(b[0] > 100 && b[0] < 106, `hem length ${b[0]}`);
});

test('sketched bend turns the far side up; flat pattern adds the bend allowance', () => {
  const part = newPart();
  sheet(part, 100, 50, 2);
  const line = sketchOn(part, top, (k) => addLine(k, 60, -10, 60, 60));
  part.features.push(createFeature(part, 'sketchedBend', { sketch: line.id, angle: 90, radius: 2 }));
  const r = ok(part);
  const b = box(r);
  assert.ok(b[2] > 40, `bent up: ${b[2]}`);
  near(V(r.body), 100 * 50 * 2 + 100 * (Math.PI / 2) * 3, 0.02);
  const flat = ok({ ...part, flat: true });
  near(box(flat)[0], 100 + bendAllowance(90, 2, 2, 0.4), 1e-4);
});

test('jog raises the far side by its height', () => {
  const part = newPart();
  sheet(part, 100, 50, 2);
  const line = sketchOn(part, top, (k) => addLine(k, 50, -10, 50, 60));
  part.features.push(createFeature(part, 'jog', { sketch: line.id, height: 10 }));
  const r = ok(part);
  const b = box(r);
  near(b[2], 12, 1e-6);
  near(b[0], 102, 1e-6);
});

test('parting line and core / cavity of a cup', () => {
  const part = newPart();
  const s = sketchOn(part, top, (k) => addCircle(k, 0, 0, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 20 }));
  const r0 = regenerate(part);
  const topFace = r0.body.faces.find((f) => f.geomType === 'PLANE' && faceSignature(f).center[2] > 19);
  part.features.push(createFeature(part, 'shell', { thickness: 2, faces: [faceSignature(topFace)] }));
  const pl = createFeature(part, 'partingLine', { dir: 'z' });
  part.features.push(pl);
  part.features.push(createFeature(part, 'toolingSplit', { dir: 'z', margin: 10, gap: 0 }));
  const r = ok(part);
  assert.ok(r.results.get(pl.id).parting.edges >= 1);
  // Block 60×(20+20)×60 minus the cup's solid volume.
  const cup = V(r0.body) - Math.PI * 18 * 18 * 18;
  near(V(r.body), 60 * 40 * 60 - cup, 0.01);
});

test('3D sketch as a sweep path and as structural members', () => {
  const part = newPart();
  const s3 = createFeature(part, 'sketch3d', { points: [[0, 0, 0], [0, 0, 50], [40, -30, 50]] });
  part.features.push(s3);
  part.features.push(createFeature(part, 'structural', { sketch: s3.id, profile: 'roundBar', w: 10 }));
  let r = ok(part);
  assert.deepEqual(r.results.get(part.features[1].id).members.map((m) => m.length), [50, 50]);
  const p2 = newPart('q');
  const path = createFeature(p2, 'sketch3d', { points: [[0, 0, 0], [0, 0, 40], [0, -30, 60]], spline: true });
  p2.features.push(path);
  const prof = sketchOn(p2, top, (k) => addCircle(k, 0, 0, 3));
  p2.features.push(createFeature(p2, 'sweep', { sketch: prof.id, path: path.id }));
  r = ok(p2);
  assert.ok(V(r.body) > Math.PI * 9 * 60);
});

test('sketch text extrudes as letters', () => {
  const part = newPart();
  const s = sketchOn(part, front, (k) => addText(k, 0, 0, 'MECH', 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 2 }));
  const r = ok(part);
  const b = box(r);
  assert.ok(b[0] > 25 && b[0] < 40 && b[2] > 6 && b[2] < 10, `text box ${b}`);
  assert.ok(V(r.body) > 50);
});

test('wrap lays a rectangle on a cylinder by arc length', () => {
  const part = newPart();
  const c = sketchOn(part, top, (k) => addCircle(k, 0, 0, 20));
  part.features.push(createFeature(part, 'extrude', { sketch: c.id, depth: 40 }));
  const r0 = regenerate(part);
  const cyl = r0.body.faces.find((f) => f.geomType !== 'PLANE');
  part.features.push(createFeature(part, 'plane', { base: front, offset: 25 }));
  // 30 wide: on the cylinder it spans 30 mm of arc (a projection could not reach past the sides).
  const s = sketchOn(part, { kind: 'ref', id: part.features[2].id }, (k) => addRectangle(k, -15, 15, 15, 25));
  part.features.push(createFeature(part, 'wrap', { sketch: s.id, face: faceSignature(cyl), depth: 1, op: 'emboss' }));
  const r = ok(part);
  const added = V(r.body) - V(r0.body);
  // Arc 30 × height 10 × depth 1, a little more at the outer radius.
  near(added, 30 * 10 * (1 + 0.5 / 20), 0.03);
});

test('cam mate: a flat follower rides on a round cam', () => {
  // Cam: a circle of radius 20 around (5, 0) in its comp's XY plane (eccentric), axis +Z; follower: a plane facing -y.
  const profile = Array.from({ length: 72 }, (_, i) => { const t = (i / 72) * Math.PI * 2; return [5 + 20 * Math.cos(t), 20 * Math.sin(t), 0]; });
  const asm = {
    components: [
      { id: 'cam', position: [0, 0, 0], rotation: quatIdentity(), fixed: true },
      { id: 'fol', position: [0, 40, 0], rotation: quatIdentity(), fixed: false },
    ],
    mates: [
      { id: 'm1', type: 'cam', a: { comp: 'cam', kind: 'plane', point: [0, 0, 0], dir: [0, 0, 1] }, b: { comp: 'fol', kind: 'plane', point: [0, 0, 0], dir: [0, -1, 0] }, profile },
      // The follower slides along y only: its axis stays on x = 0, z = 0.
      { id: 'm2', type: 'coincident', a: { comp: 'cam', kind: 'plane', point: [0, 0, 0], dir: [1, 0, 0] }, b: { comp: 'fol', kind: 'axis', point: [0, 0, 0], dir: [0, 1, 0] } },
      { id: 'm3', type: 'coincident', a: { comp: 'cam', kind: 'plane', point: [0, 0, 0], dir: [0, 0, 1] }, b: { comp: 'fol', kind: 'axis', point: [0, 0, 0], dir: [0, 1, 0] } },
    ],
  };
  const r = solveMates(asm, { size: 50 });
  assert.equal(r.failed.length, 0, JSON.stringify(r));
  near(asm.components[1].position[1], 20, 1e-3);
});
