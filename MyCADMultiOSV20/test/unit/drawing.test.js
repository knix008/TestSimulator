import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addEntity, addLayer, AUTO, createDrawing, defaultLayers, duplicateEntities, editable, extents, findEntity, findLayer, insertEntities, moveToLayer,
  normalizeDrawing, polarArray, rectangularArray, removeEntities, removeLayer, reorder, replaceEntity, stats, styleOf, transformEntities, updateEntity, updateLayer,
} from '../../src/domain/drawing.js';
import { DrawingDocument } from '../../src/domain/document.js';
import { History } from '../../src/domain/history.js';

test('a new drawing has the standard mechanical layers', () => {
  const ko = createDrawing({ title: '축', language: 'ko' });
  assert.deepEqual(ko.layers.map((layer) => layer.id), ['0', 'center', 'hidden', 'dim', 'text']);
  assert.equal(ko.layers[0].name, '외형선');
  assert.equal(defaultLayers('en')[1].name, 'Center lines');
  assert.equal(findLayer(ko, 'center').lineType, 'center');
  assert.equal(ko.activeLayer, '0');
  assert.equal(ko.units, 'mm');
});

test('entities use the active layer and resolve ByLayer styles', () => {
  const drawing = createDrawing();
  drawing.activeLayer = 'hidden';
  const line = addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 1, y2: 0 });
  assert.equal(line.layer, 'hidden');
  assert.deepEqual(styleOf(drawing, line), { color: '#3a8fd6', lineType: 'hidden', lineWidth: 0.25 });
  const own = addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 1, y2: 0, color: '#ff0000', lineType: 'dashed', lineWidth: 0.7 });
  assert.deepEqual(styleOf(drawing, own), { color: '#ff0000', lineType: 'dashed', lineWidth: 0.7 });
  const lost = addEntity(drawing, 'circle', { cx: 0, cy: 0, r: 1, layer: 'nope' });
  assert.equal(lost.layer, 'hidden', 'unknown layer → active layer');
});

test('update, replace, remove, duplicate and reorder', () => {
  const drawing = createDrawing();
  const a = addEntity(drawing, 'circle', { cx: 0, cy: 0, r: 1 });
  const b = addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 1, y2: 1 });
  assert.equal(updateEntity(drawing, a.id, { r: 5, type: 'line' }).r, 5, 'type cannot change');
  assert.equal(findEntity(drawing, a.id).type, 'circle');
  replaceEntity(drawing, { ...findEntity(drawing, b.id), x2: 9 });
  assert.equal(findEntity(drawing, b.id).x2, 9);
  const copies = duplicateEntities(drawing, [a.id], { x: 10, y: 0 });
  assert.equal(copies.length, 1);
  assert.notEqual(copies[0].id, a.id);
  assert.equal(copies[0].cx, 10);
  reorder(drawing, [a.id], true);
  assert.equal(drawing.entities.at(-1).id, a.id);
  reorder(drawing, [a.id], false);
  assert.equal(drawing.entities[0].id, a.id);
  assert.equal(removeEntities(drawing, [a.id, b.id]), 2);
  assert.equal(drawing.entities.length, 1);
});

test('transforms move or copy a selection', () => {
  const drawing = createDrawing();
  const line = addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  transformEntities(drawing, [line.id], { type: 'move', dx: 0, dy: 5 });
  assert.equal(findEntity(drawing, line.id).y1, 5);
  const copies = transformEntities(drawing, [line.id], { type: 'rotate', cx: 0, cy: 5, angle: 90 }, { copy: true });
  assert.equal(drawing.entities.length, 2);
  assert.ok(Math.abs(copies[0].y2 - 15) < 1e-9);
});

test('rectangular and polar arrays', () => {
  const drawing = createDrawing();
  const hole = addEntity(drawing, 'circle', { cx: 0, cy: 0, r: 2 });
  const grid = rectangularArray(drawing, [hole.id], { rows: 2, columns: 3, dx: 10, dy: 20 });
  assert.equal(grid.length, 5);
  assert.ok(grid.some((entity) => entity.cx === 20 && entity.cy === 20));
  const ring = createDrawing();
  const bolt = addEntity(ring, 'circle', { cx: 50, cy: 0, r: 3 });
  const holes = polarArray(ring, [bolt.id], { count: 6, angle: 360, cx: 0, cy: 0 });
  assert.equal(holes.length, 5);
  for (const entity of holes) assert.ok(Math.abs(Math.hypot(entity.cx, entity.cy) - 50) < 1e-9);
  const half = createDrawing();
  const item = addEntity(half, 'line', { x1: 10, y1: 0, x2: 20, y2: 0 });
  const fan = polarArray(half, [item.id], { count: 3, angle: 180, cx: 0, cy: 0, rotateItems: false });
  assert.equal(fan.length, 2);
  assert.ok(Math.abs(fan[1].x1 + 20) < 1e-9 && Math.abs(fan[1].y1) < 1e-9, 'the last item is on the other side, not rotated');
});

test('layers: add, update, move entities, remove (entities fall back to the first layer)', () => {
  const drawing = createDrawing();
  const layer = addLayer(drawing, { base: 'Layer' });
  assert.ok(layer.name.startsWith('Layer'));
  const second = addLayer(drawing, { base: 'Layer' });
  assert.notEqual(second.name, layer.name, 'unique names');
  const circle = addEntity(drawing, 'circle', { cx: 0, cy: 0, r: 1 });
  assert.equal(moveToLayer(drawing, [circle.id], layer.id), 1);
  updateLayer(drawing, layer.id, { visible: false, color: '#00ff00' });
  assert.equal(findLayer(drawing, layer.id).color, '#00ff00');
  assert.equal(editable(drawing).length, 0, 'hidden layer → not editable');
  assert.equal(extents(drawing), null, 'hidden entities are not in the visible extents');
  updateLayer(drawing, layer.id, { visible: true, locked: true });
  assert.equal(editable(drawing).length, 0, 'locked layer → not editable');
  drawing.activeLayer = layer.id;
  assert.ok(removeLayer(drawing, layer.id));
  assert.equal(findEntity(drawing, circle.id).layer, '0');
  assert.equal(drawing.activeLayer, '0');
  while (drawing.layers.length > 1) removeLayer(drawing, drawing.layers.at(-1).id);
  assert.equal(removeLayer(drawing, '0'), false, 'the last layer stays');
});

test('normalizeDrawing repairs layers, ids and unknown entities', () => {
  const raw = {
    title: 'X', grid: { size: -1 },
    layers: [{ id: 'a', name: 'A', color: 'bad' }, { id: 'a', name: 'dup' }],
    entities: [{ type: 'circle', id: 'same', cx: 0, cy: 0, r: 1, layer: 'zz' }, { type: 'line', id: 'same', x1: 0, y1: 0, x2: 1, y2: 1, layer: 'a' }, { type: 'hatch' }],
    sheet: { number: 'D-1', bogus: 5 },
  };
  const drawing = normalizeDrawing(raw);
  assert.equal(drawing.layers.length, 1);
  assert.equal(drawing.layers[0].color, AUTO);
  assert.equal(drawing.entities.length, 2);
  assert.equal(drawing.entities[0].layer, 'a');
  assert.notEqual(drawing.entities[0].id, drawing.entities[1].id);
  assert.equal(drawing.grid.size, 10);
  assert.equal(drawing.sheet.number, 'D-1');
  assert.equal('bogus' in drawing.sheet, false);
  const counts = stats(drawing);
  assert.equal(counts.entities, 2);
  assert.equal(counts.byType.circle, 1);
});

test('document: dirty tracking and undo/redo by snapshots', () => {
  const doc = new DrawingDocument(createDrawing({ title: 'T' }));
  assert.equal(doc.dirty, false);
  const entity = doc.apply('add', (drawing) => addEntity(drawing, 'line', { x1: 0, y1: 0, x2: 1, y2: 0 }));
  assert.ok(entity.id);
  assert.equal(doc.dirty, true);
  assert.equal(doc.history.undoLabel, 'add');
  doc.apply('nothing', () => {});
  assert.equal(doc.history.undoStack.length, 1, 'no-op changes are not recorded');
  assert.equal(doc.undo(), 'add');
  assert.equal(doc.drawing.entities.length, 0);
  assert.equal(doc.dirty, false);
  assert.equal(doc.redo(), 'add');
  assert.equal(doc.drawing.entities.length, 1);
  doc.markSaved('C:/x.mcad');
  assert.equal(doc.dirty, false);
  assert.equal(doc.path, 'C:/x.mcad');
  assert.equal(doc.undo(), 'add');
  assert.equal(doc.dirty, true);
});

test('history keeps at most its limit and clears redo on a new change', () => {
  const history = new History(3);
  for (let i = 0; i < 5; i++) history.record(String(i), `step ${i}`);
  assert.equal(history.undoStack.length, 3);
  history.undo('5');
  assert.ok(history.canRedo);
  history.record('x', 'new');
  assert.ok(!history.canRedo);
});
