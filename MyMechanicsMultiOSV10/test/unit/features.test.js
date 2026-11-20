// Feature-based parts on the OpenCASCADE kernel: every feature kind builds, volumes come out right,
// references to faces and edges survive a change earlier in the tree, failures are reported per feature.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, faceRef, allDependents } from '../../src/cad/features.js';
import { addCircle, addConstraint, addLine, addRectangle, createSketchGeometry, solveSketch } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);
const volume = (shape) => R.measureVolume(shape);

function newPart() { return { id: 'p', name: 'Part', features: [] }; }
function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}

test('boss extrude of a rectangle with a hole, then a blind cut', () => {
  const part = newPart();
  const s1 = sketchOn(part, { kind: 'std', name: 'front' }, (s) => { addRectangle(s, -50, -25, 50, 25); addCircle(s, 0, 0, 10); });
  part.features.push(createFeature(part, 'extrude', { sketch: s1.id, depth: 20 }));
  let r = regenerate(part);
  assert.equal(r.error, null);
  near(volume(r.body), 100 * 50 * 20 - Math.PI * 100 * 20);
  const s2 = sketchOn(part, { kind: 'std', name: 'front' }, (s) => addRectangle(s, 30, -10, 45, 10));
  // Sketched on the front plane (z = 0): a cut goes against the normal — Reverse makes it go into the part.
  part.features.push(createFeature(part, 'extrude', { sketch: s2.id, op: 'cut', depth: 5, reverse: true }));
  r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), 100 * 50 * 20 - Math.PI * 100 * 20 - 15 * 20 * 5);
  assert.equal(part.features[1].name, 'Boss-Extrude1');
  assert.equal(part.features[3].name, 'Cut-Extrude1');
});

test('mid-plane, through-all and second direction', () => {
  const part = newPart();
  const s = sketchOn(part, { kind: 'std', name: 'top' }, (k) => addRectangle(k, 0, 0, 10, 10));
  const e = createFeature(part, 'extrude', { sketch: s.id, end: 'midplane', depth: 30 });
  part.features.push(e);
  let r = regenerate(part);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(lo[1], -15); near(hi[1], 15);
  e.end = 'blind'; e.depth = 10; e.end2 = 'blind'; e.depth2 = 4;
  r = regenerate(part);
  near(volume(r.body), 100 * 14);
});

test('revolve about a construction line', () => {
  const part = newPart();
  const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => {
    addRectangle(k, 10, 0, 20, 30);
    addLine(k, 0, 0, 0, 50, { construction: true });
  });
  part.features.push(createFeature(part, 'revolve', { sketch: s.id }));
  const r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), Math.PI * (400 - 100) * 30);
});

test('fillet and chamfer edges found again after the base sketch changes', () => {
  const part = newPart();
  let rectLines;
  const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => { rectLines = addRectangle(k, 0, 0, 40, 30); });
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  let r = regenerate(part);
  const verticalEdges = r.body.edges.filter((e) => { const sig = edgeSignature(e); return Math.abs(Math.abs(sig.dir[2]) - 1) < 1e-6; });
  assert.equal(verticalEdges.length, 4);
  part.features.push(createFeature(part, 'fillet', { radius: 3, edges: verticalEdges.map(edgeSignature) }));
  r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), (40 * 30 - (4 - Math.PI) * 9) * 10);
  // Wider base: the fillet still finds its four edges.
  addConstraint(s, { type: 'distance', a: rectLines[0].id, value: 60 });
  solveSketch(s);
  r = regenerate(part);
  assert.equal(r.results.get(part.features[2].id).ok, true);
  near(volume(r.body), (60 * 30 - (4 - Math.PI) * 9) * 10, 2e-3);
  const top = r.body.edges.filter((e) => Math.abs(edgeSignature(e).mid[2] - 10) < 1e-6 && edgeSignature(e).type === 'LINE');
  part.features.push(createFeature(part, 'chamfer', { distance: 1, edges: top.map(edgeSignature) }));
  r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
});

test('shell removes a face and leaves walls', () => {
  const part = newPart();
  const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addRectangle(k, 0, 0, 50, 40));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 30 }));
  let r = regenerate(part);
  const top = r.body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 30) < 1e-6);
  part.features.push(createFeature(part, 'shell', { thickness: 2, faces: [faceSignature(top)] }));
  r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), 50 * 40 * 30 - 46 * 36 * 28, 1e-3);
});

test('holes from sketch points on a face: simple, counterbore and countersink', () => {
  for (const kind of ['simple', 'counterbore', 'countersink']) {
    const part = newPart();
    const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addRectangle(k, 0, 0, 60, 40));
    part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 15 }));
    let r = regenerate(part);
    const top = r.body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 15) < 1e-6);
    const hs = createFeature(part, 'sketch', { plane: faceRef(top), ...createSketchGeometry() });
    hs.entities.push({ id: 'h1', type: 'point', x: 0, y: 0 }, { id: 'h2', type: 'point', x: 15, y: 5 });
    part.features.push(hs);
    part.features.push(createFeature(part, 'hole', { sketch: hs.id, kind, through: true, diameter: 6 }));
    r = regenerate(part);
    assert.equal(r.error, null, `${kind}: ${r.error?.message}`);
    const removed = 60 * 40 * 15 - volume(r.body);
    if (kind === 'simple') near(removed, 2 * Math.PI * 9 * 15, 1e-2);
    else assert.ok(removed > 2 * Math.PI * 9 * 15 + 1, `${kind} removes more than a plain hole`);
  }
});

test('linear and circular patterns, mirror', () => {
  const part = newPart();
  const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addRectangle(k, 0, 0, 100, 60));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const s2 = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addCircle(k, 10, 10, 3));
  const cut = createFeature(part, 'extrude', { sketch: s2.id, op: 'cut', end: 'throughBoth' });
  part.features.push(cut);
  part.features.push(createFeature(part, 'linearPattern', { seeds: [cut.id], direction: { kind: 'axis', axis: 'x' }, spacing: 20, count: 4, direction2: { kind: 'axis', axis: 'y' }, spacing2: 20, count2: 2 }));
  let r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), 100 * 60 * 10 - 8 * Math.PI * 9 * 10, 1e-3);
  part.features.push(createFeature(part, 'mirror', { seeds: [cut.id], plane: { kind: 'std', name: 'top' } }));
  r = regenerate(part);
  assert.equal(r.error, null, r.error?.message);
  // Mirrored about y = 0: the copy falls outside the plate (y = -10) and cuts nothing.
  near(volume(r.body), 100 * 60 * 10 - 8 * Math.PI * 9 * 10, 1e-3);

  const disc = newPart();
  const d = sketchOn(disc, { kind: 'std', name: 'front' }, (k) => addCircle(k, 0, 0, 50));
  disc.features.push(createFeature(disc, 'extrude', { sketch: d.id, depth: 8 }));
  const h = sketchOn(disc, { kind: 'std', name: 'front' }, (k) => addCircle(k, 35, 0, 4));
  const hc = createFeature(disc, 'extrude', { sketch: h.id, op: 'cut', end: 'throughBoth' });
  disc.features.push(hc);
  disc.features.push(createFeature(disc, 'circularPattern', { seeds: [hc.id], axis: { kind: 'axis', axis: 'z' }, count: 6 }));
  r = regenerate(disc);
  assert.equal(r.error, null, r.error?.message);
  near(volume(r.body), Math.PI * 2500 * 8 - 6 * Math.PI * 16 * 8, 1e-3);
});

test('reference plane and a sketch on it; a failing feature does not stop the rest', () => {
  const part = newPart();
  const plane = createFeature(part, 'plane', { base: { kind: 'std', name: 'top' }, offset: 40 });
  part.features.push(plane);
  const s = sketchOn(part, { kind: 'ref', id: plane.id }, (k) => addCircle(k, 0, 0, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 5 }));
  const bad = createFeature(part, 'fillet', { radius: 2, edges: [{ type: 'LINE', mid: [999, 999, 999], dir: [1, 0, 0], length: 1 }] });
  part.features.push(bad);
  const open = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addLine(k, 0, 0, 10, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: open.id, depth: 5 }));
  const r = regenerate(part);
  const [lo, hi] = r.body.boundingBox.bounds;
  near(lo[1], 40); near(hi[1], 45);
  assert.equal(r.results.get(bad.id).ok, false);
  assert.equal(r.results.get(bad.id).error, 'no-edges');
  assert.equal(r.results.get(part.features.at(-1).id).error, 'no-profile');
  assert.deepEqual(allDependents(part, plane.id), [s.id, part.features[2].id]);
});

test('rollback stops the rebuild at the bar', () => {
  const part = newPart();
  const s = sketchOn(part, { kind: 'std', name: 'front' }, (k) => addRectangle(k, 0, 0, 10, 10));
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  const r = regenerate(part, { upTo: 1 });
  assert.equal(r.body, null);
  assert.equal(r.results.get(part.features[1].id).rolledBack, true);
});
