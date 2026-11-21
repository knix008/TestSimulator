// Assembly extras (src/cad/asm-extra.js): assembly-level cuts and holes through several components (kernel),
// belts and chains between pulleys (length formula, path, body), sketch blocks, sketch pictures and library features.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { quatIdentity, quatFromAxisAngle } from '../../src/cad/assembly.js';
import { createSketchGeometry, addRectangle, addCircle } from '../../src/cad/sketch.js';
import { frame as makeFrame, STD_PLANES } from '../../src/cad/features.js';
import {
  createAsmFeature, asmFeatureTool, cutComponent, featureActsOn, beltPath, chainLinks, beltMesh, meshVolume, createBelt,
  makeBlock, insertBlock, blockInstances, explodeBlock, pictureCorners, normalisePicture, makeLibraryItem, insertLibraryItem, loadLibrary, saveLibrary,
} from '../../src/cad/asm-extra.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('assembly hole through two stacked plates: cut in each component frame, parts untouched', () => {
  const plate = R.makeBox([-50, -50, 0], [50, 50, 10]);
  const asm = { components: [{ id: 'a', position: [0, 0, 0], rotation: quatIdentity() }, { id: 'b', position: [0, 0, 10], rotation: quatIdentity() }, { id: 'c', position: [200, 0, 0], rotation: quatIdentity() }] };
  // A ⌀10 hole on the Top plane (normal +Y before the Z-up switch, +Z after) — the tool is built on that plane's own frame.
  const top = makeFrame(STD_PLANES.top);
  const along = top.normal.findIndex((v) => Math.abs(v) > 0.5);
  const f = createAsmFeature(asm, 'asmHole', { plane: 'top', profile: { kind: 'circle', cx: 0, cy: 0, d: 10 }, comps: ['a', 'b'] });
  assert.equal(asm.asmFeatures.length, 1);
  assert.ok(featureActsOn(f, 'a') && !featureActsOn(f, 'c'));
  const hole = Math.PI * 25 * 10;
  if (along === 2) {
    for (const c of asm.components.slice(0, 2)) {
      const cut = cutComponent(plate, c, asm.asmFeatures, c.id, 200);
      near(R.measureVolume(cut), 100000 - hole, 1);
    }
  } else {
    // Y-up planes: the plates stand along Y instead.
    const tall = R.makeBox([-50, 0, -50], [50, 10, 50]);
    for (const c of [{ id: 'a', position: [0, 0, 0], rotation: quatIdentity() }, { id: 'b', position: [0, 10, 0], rotation: quatIdentity() }]) near(R.measureVolume(cutComponent(tall, c, asm.asmFeatures, c.id, 200)), 100000 - hole, 1);
  }
  near(R.measureVolume(plate), 100000, 1e-6);
  assert.equal(cutComponent(plate, asm.components[2], asm.asmFeatures, 'c', 200), plate, 'not acting: the same body');
});

test('assembly cut on a rotated component cuts where the tool is in assembly space', () => {
  const bar = R.makeBox([0, -5, -5], [100, 5, 5]);
  const asm = { components: [{ id: 'a', position: [0, 0, 0], rotation: quatFromAxisAngle([0, 0, 1], 90) }] };
  // The bar now runs along +Y; a cut on the Right plane (x = 0) covering y ∈ [40, 60] removes 20 mm of it.
  const fr = makeFrame(STD_PLANES.right);
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = [0, 50, 0], yAlongU = Math.abs(fr.xDir[1]) > 0.5;
  createAsmFeature(asm, 'asmCut', { plane: 'right', profile: { kind: 'rect', cx: dot(at, fr.xDir), cy: dot(at, fr.yDir), w: yAlongU ? 20 : 40, h: yAlongU ? 40 : 20 } });
  const cut = cutComponent(bar, asm.components[0], asm.asmFeatures, 'a', 200);
  near(R.measureVolume(cut), 10000 - 20 * 100, 1);
  assert.ok(asmFeatureTool(asm.asmFeatures[0], 200));
});

test('belt between two pulleys: open-belt length, wrap angles, closed path, body volume', () => {
  const p1 = { c: [0, 0, 0], r: 50 }, p2 = { c: [200, 0, 5], r: 20 };
  const b = beltPath(p1, p2, [0, 0, 1], { segments: 200 });
  const C = 200, beta = Math.asin(30 / C);
  near(b.length, 2 * C * Math.cos(beta) + 50 * (Math.PI + 2 * beta) + 20 * (Math.PI - 2 * beta), 1e-9);
  near(b.wrap1 + b.wrap2, 2 * Math.PI, 1e-12);
  assert.ok(b.wrap1 > Math.PI && b.wrap2 < Math.PI, 'the larger pulley wraps more');
  // The polyline (closed) is close to the exact length and every point is on a pulley or a tangent.
  let poly = 0;
  for (let i = 0; i < b.path.length; i++) { const p = b.path[i], q = b.path[(i + 1) % b.path.length]; poly += Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); }
  near(poly, b.length, b.length * 2e-4);
  assert.ok(b.path.every((p) => Math.abs(p[2] - 2.5) < 1e-9), 'in the mid plane');
  const mesh = beltMesh(b, { width: 10, thickness: 2 });
  // Volume ≈ length × width × thickness (outer arcs slightly longer: + width × π × t² for the two wraps).
  near(Math.abs(meshVolume(mesh)), b.length * 10 * 2 + 10 * Math.PI * 4, b.length * 20 * 0.01);
  assert.equal(beltPath({ c: [0, 0, 0], r: 50 }, { c: [10, 0, 0], r: 20 }, [0, 0, 1]), null, 'overlapping pulleys');
  const chain = chainLinks(b.length, 12.7);
  assert.equal(chain.links % 2, 0);
  assert.ok(chain.length >= b.length && chain.length - b.length < 2 * 12.7);
  const asm = {};
  createBelt(asm, 'chain', { comp: 'a' }, { comp: 'b' }, { pitch: 12.7 });
  assert.equal(asm.belts[0].kind, 'chain');
});

test('sketch blocks: make, insert moved / rotated / scaled instances, explode', () => {
  const s = createSketchGeometry();
  const lines = addRectangle(s, 0, 0, 20, 10);
  const circle = addCircle(s, 10, 5, 3);
  const block = makeBlock(s, [...lines.map((l) => l.id), circle.id], { name: 'Plate' });
  assert.deepEqual(block.base, [10, 5]);
  assert.equal(block.entities.filter((e) => e.type === 'point').length, 5);
  assert.equal(block.entities.filter((e) => e.type === 'line').length, 4);
  assert.equal(block.constraints.length, 4, 'horizontal / vertical relations go with it');
  const before = s.entities.length;
  const one = insertBlock(s, block, { x: 100, y: 0 });
  const two = insertBlock(s, block, { x: 0, y: 100, angle: 90, scale: 2 });
  assert.equal(s.entities.length, before + 2 * block.entities.length);
  const inst = blockInstances(s);
  assert.equal(inst.size, 2);
  const pts = (ids) => ids.map((id) => s.entities.find((e) => e.id === id)).filter((e) => e.type === 'point');
  const xs = pts(one.ids).map((p) => p.x);
  near(Math.min(...xs), 90); near(Math.max(...xs), 110);
  const big = pts(two.ids);
  near(Math.max(...big.map((p) => p.y)) - Math.min(...big.map((p) => p.y)), 40, 1e-6);   // 20 wide, ×2, turned 90°
  near(s.entities.find((e) => two.ids.includes(e.id) && e.type === 'circle').r, 6);
  assert.ok(s.constraints.length >= 12);
  assert.equal(explodeBlock(s, one.instance), block.entities.length);
  assert.equal(blockInstances(s).size, 1);
});

test('sketch picture corners on the plane and normalised fields', () => {
  const fr = makeFrame(STD_PLANES.front);
  const c = pictureCorners({ x: 10, y: 0, width: 40, aspect: 0.5 }, fr);
  assert.equal(c.length, 4);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  near(d(c[0], c[1]), 40); near(d(c[1], c[2]), 20);
  c.forEach((p) => near(p[0] * fr.normal[0] + p[1] * fr.normal[1] + p[2] * fr.normal[2], 0));
  const n = normalisePicture({ src: 'data:x', opacity: 4, width: -1 });
  assert.equal(n.opacity, 1);
  assert.ok(n.width > 0);
});

test('library features: save a feature with its sketch, insert it on a face with new ids', () => {
  const part = { features: [{ id: 's1', type: 'sketch', name: 'Sketch1', plane: { kind: 'std', name: 'front' }, entities: [], constraints: [] }, { id: 'e1', type: 'extrude', name: 'Boss1', sketch: 's1', depth: 5 }] };
  const item = makeLibraryItem(part, 'e1', { name: 'Pad' });
  assert.equal(item.features.length, 2);
  assert.equal(makeLibraryItem(part, 'nope'), null);
  const face = { kind: 'face', sig: { type: 'PLANE', center: [0, 0, 5], normal: [0, 0, 1] }, origin: [0, 0, 5], xDir: [1, 0, 0] };
  const made = insertLibraryItem(part, item, face);
  assert.equal(part.features.length, 4);
  assert.notEqual(made[0].id, 's1');
  assert.equal(made[1].sketch, made[0].id);
  assert.deepEqual(made[0].plane, face);
  assert.ok(made.every((f) => f.library === item.id));
  item.features[0].name = 'changed';
  assert.equal(made[0].name, 'Pad-Sketch1', 'a copy, not a reference');
  // Storage: an in-memory fallback without a storage, any getItem / setItem store otherwise.
  saveLibrary([item]);
  assert.equal(loadLibrary()[0].name, 'Pad');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadLibrary(storage), []);
  saveLibrary([item, item], storage);
  assert.equal(loadLibrary(storage).length, 2);
});
