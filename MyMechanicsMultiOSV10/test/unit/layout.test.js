// Layout-based design (layout.js): blocks in a layout part's sketch make parts placed where the instances are;
// moving an instance or editing its block updates the linked components and parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeature, frame as makeFrame, STD_PLANES } from '../../src/cad/features.js';
import { createPart, createAssembly } from '../../src/cad/document.js';
import { createSketchGeometry, addRectangle, byId } from '../../src/cad/sketch.js';
import { makeBlock, insertBlock, blockInstances } from '../../src/cad/asm-extra.js';
import { instancePlacement, makePartsFromBlocks, updateFromLayout, linkedPlacement } from '../../src/cad/layout.js';
import { placePoint } from '../../src/cad/assembly.js';

const near = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
let k = 0; const newId = (p) => `${p}${++k}`;
const frames = (sk) => makeFrame(STD_PLANES[sk.plane?.name ?? 'top']);

function setup() {
  // A block: a 40 × 20 plate drawn round its centre.
  const src = createSketchGeometry(); const r = addRectangle(src, -20, -10, 20, 10);
  const block = makeBlock(src, (r.lines ?? r).map((l) => l.id ?? l), { name: 'Plate', base: [0, 0] });
  const project = { parts: [], assemblies: [], sketchBlocks: [block] };
  const layout = createPart('Layout');
  const sk = createFeature(layout, 'sketch', { plane: { kind: 'std', name: 'front' }, ...createSketchGeometry() });
  layout.features.push(sk);
  const a = insertBlock(sk, block, { x: 50, y: 30, angle: 30 });
  const b = insertBlock(sk, block, { x: -40, y: 10, angle: 0 });
  project.parts.push(layout);
  const asm = createAssembly('Asm');
  const lc = { id: 'L', name: 'Layout<1>', part: layout.id, position: [5, 0, 0], rotation: [0, 0, 0, 1], fixed: true };
  asm.components.push(lc);
  project.assemblies.push(asm);
  return { project, asm, lc, sk, block, a, b };
}

test('an instance\'s place is found from its points: move, turn (and scale)', () => {
  const { sk, block, a, b } = setup();
  const pa = instancePlacement(sk, block, a.instance);
  near(pa.x, 50); near(pa.y, 30); near(pa.angle, Math.PI / 6); near(pa.scale, 1);
  const pb = instancePlacement(sk, block, b.instance);
  near(pb.x, -40); near(pb.angle, 0);
});

test('Make Part from Block: one part for the block, a linked component per instance, on the instance', () => {
  const { project, asm, lc, sk, block, a } = setup();
  const made = makePartsFromBlocks(project, asm, lc, { createPart, createFeature, newId, blockInstances, frames });
  assert.equal(made.parts.length, 1); assert.equal(made.comps.length, 2);
  const part = made.parts[0];
  assert.equal(part.fromBlock.block, block.id);
  const psk = part.features[0];
  assert.equal(psk.entities.filter((e) => e.type === 'line').length, 4);
  // A corner of the part's plate (its sketch on Top, (20, 10)) lands on the same corner of the instance in the world.
  const comp = made.comps.find((c) => c.layoutLink.instance === a.instance);
  const top = makeFrame(STD_PLANES.top); const front = makeFrame(STD_PLANES.front);
  const w = (fr, [u, v]) => [0, 1, 2].map((i) => fr.origin[i] + fr.xDir[i] * u + fr.yDir[i] * v);
  const inPart = placePoint(comp, w(top, [20, 10]));
  const c30 = Math.cos(Math.PI / 6), s30 = Math.sin(Math.PI / 6);
  const inLayout = placePoint(lc, w(front, [50 + 20 * c30 - 10 * s30, 30 + 20 * s30 + 10 * c30]));
  inPart.forEach((v, i) => near(v, inLayout[i], 1e-6));
  // Running it again makes nothing new.
  assert.equal(makePartsFromBlocks(project, asm, lc, { createPart, createFeature, newId, blockInstances, frames }).comps.length, 0);
});

test('moving an instance moves its component; editing the block updates the part', () => {
  const { project, asm, lc, sk, block, a } = setup();
  makePartsFromBlocks(project, asm, lc, { createPart, createFeature, newId, blockInstances, frames });
  // Move instance a by (+10, −5) in the layout sketch.
  for (const e of sk.entities) if (e.block?.instance === a.instance && e.type === 'point') { e.x += 10; e.y -= 5; }
  const r = updateFromLayout(project, asm, { frames });
  assert.equal(r.moved, 1); assert.equal(r.updated, 0);
  const comp = asm.components.find((c) => c.layoutLink?.instance === a.instance);
  const want = linkedPlacement(lc, frames(sk), { x: 60, y: 25, angle: Math.PI / 6 });
  comp.position.forEach((v, i) => near(v, want.position[i], 1e-6));
  // The block made wider: the part's sketch follows.
  for (const e of block.entities) if (e.type === 'point' && e.x > 0) e.x = 30;
  const r2 = updateFromLayout(project, asm, { frames });
  assert.equal(r2.updated, 1);
  const part = project.parts.find((p) => p.fromBlock);
  const xs = part.features[0].entities.filter((e) => e.type === 'point' && !e.origin).map((e) => e.x);
  assert.equal(Math.max(...xs), 30);
  // A deleted instance is reported.
  sk.entities = sk.entities.filter((e) => e.block?.instance !== a.instance);
  assert.deepEqual(updateFromLayout(project, asm, { frames }).lost, [comp.id]);
});
