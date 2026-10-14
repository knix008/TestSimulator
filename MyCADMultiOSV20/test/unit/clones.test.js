// Draft Clone: copies that follow their source, with their own similarity transform.
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeClone } from '../../src/domain/clones.js';
import { DrawingDocument } from '../../src/domain/document.js';
import { addEntity, cloneEntities, createDrawing, findEntity, removeEntities, syncDrawingClones, transformEntities, unlinkClones, updateEntity } from '../../src/domain/drawing.js';
import { entityBox } from '../../src/domain/entities.js';
import { parseFile, serialize } from '../../src/domain/format.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const nearBox = (box, [minX, minY, maxX, maxY]) => { near(box.minX, minX); near(box.minY, minY); near(box.maxX, maxX); near(box.maxY, maxY); };

test('a clone follows its source and keeps its own place', () => {
  const d = createDrawing();
  const src = addEntity(d, 'rect', { x: 0, y: 0, width: 20, height: 10 });
  const [clone] = cloneEntities(d, [src.id], { x: 50, y: 0 });
  assert.equal(clone.clone.of, src.id);
  nearBox(entityBox(clone), [50, 0, 70, 10]);
  updateEntity(d, src.id, { width: 40 });
  syncDrawingClones(d);
  nearBox(entityBox(findEntity(d, clone.id)), [50, 0, 90, 10]);
  // Its own style stays.
  updateEntity(d, clone.id, { color: '#ff0000' });
  updateEntity(d, src.id, { height: 20, color: '#00ff00' });
  syncDrawingClones(d);
  assert.equal(findEntity(d, clone.id).color, '#ff0000');
  assert.equal(findEntity(d, clone.id).height, 20);
});

test('move, rotate, mirror and scale of a clone compose into its transform', () => {
  const d = createDrawing();
  const src = addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 10 });
  const [clone] = cloneEntities(d, [src.id], { x: 50, y: 0 });
  transformEntities(d, [clone.id], { type: 'rotate', cx: 0, cy: 0, angle: 90 });
  nearBox(entityBox(findEntity(d, clone.id)), [-10, 50, 0, 90]);
  transformEntities(d, [clone.id], { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
  nearBox(entityBox(findEntity(d, clone.id)), [-10, -90, 0, -50]);
  transformEntities(d, [clone.id], { type: 'scale', cx: 0, cy: 0, factor: 2 });
  nearBox(entityBox(findEntity(d, clone.id)), [-20, -180, 0, -100]);
  transformEntities(d, [clone.id], { type: 'move', dx: 5, dy: 5 });
  nearBox(entityBox(findEntity(d, clone.id)), [-15, -175, 5, -95]);
  // …and still follows the source.
  updateEntity(d, src.id, { width: 20 });
  syncDrawingClones(d);
  const box = entityBox(findEntity(d, clone.id));
  near(box.maxY - box.minY, 40);
  // Mirroring twice is no mirror.
  const twice = composeClone(composeClone({ of: 'x', cx: 0, cy: 0, dx: 3, dy: 4, angle: 30, scale: 1, flip: false }, { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }), { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } });
  assert.equal(twice.flip, false);
  near(twice.angle, 30);
  near(twice.dx, 3);
});

test('clones of clones, solids, deleting the source, unlinking', () => {
  const d = createDrawing();
  const box = addEntity(d, 'solid', { kind: 'box', params: { length: 10, width: 10, height: 10 } });
  const [a] = cloneEntities(d, [box.id]);
  const [b] = cloneEntities(d, [a.id]);
  updateEntity(d, box.id, { params: { length: 30, width: 10, height: 10 } });
  syncDrawingClones(d);
  assert.equal(findEntity(d, b.id).params.length, 30);
  assert.equal(findEntity(d, b.id).x, 20);
  removeEntities(d, [box.id]);
  syncDrawingClones(d);
  assert.equal(findEntity(d, a.id).clone, undefined, 'without its source a clone is an ordinary object');
  assert.ok(findEntity(d, b.id).clone, 'b still follows a');
  assert.equal(unlinkClones(d, [b.id]), 1);
  assert.equal(findEntity(d, b.id).clone, undefined);
});

test('a document keeps clones in step on every change, and undo brings both back', () => {
  const doc = new DrawingDocument(createDrawing());
  let src;
  let clone;
  doc.apply('add', (d) => { src = addEntity(d, 'circle', { cx: 0, cy: 0, r: 5 }); });
  doc.apply('clone', (d) => { [clone] = cloneEntities(d, [src.id], { x: 20, y: 0 }); });
  doc.apply('edit', (d) => updateEntity(d, src.id, { r: 8 }));
  assert.equal(findEntity(doc.drawing, clone.id).r, 8);
  doc.undo();
  assert.equal(findEntity(doc.drawing, clone.id).r, 5);
  const back = parseFile(serialize(doc.drawing));
  assert.equal((back.drawing ?? back).entities[1].clone.of, src.id, 'saved with its link');
});
