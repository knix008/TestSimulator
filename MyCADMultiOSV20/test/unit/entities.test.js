import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canExplode, createEntity, dimText, dimValue, entityBox, entityDistance, explode, formatNumber, grips, hitTest, inBox, measure, moveGrip, normalizeEntity,
  offsetEntity, offsetPoints, primitives, rectCorners, textWidth, totalLength, transformEntity,
} from '../../src/domain/entities.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('normalizeEntity repairs bad values and rejects unknown types', () => {
  assert.equal(normalizeEntity({ type: 'spline' }), null);
  assert.equal(normalizeEntity(null), null);
  const circle = normalizeEntity({ type: 'circle', cx: 'x', cy: 2, r: -5, color: 'red', lineType: 'zigzag' });
  assert.equal(circle.cx, 0);
  assert.equal(circle.r, 1, 'non-positive radius → 1');
  assert.equal(circle.color, null);
  assert.equal(circle.lineType, null);
  assert.ok(circle.id);
  assert.equal(normalizeEntity({ type: 'polyline', points: [{ x: 1, y: 1 }] }), null, 'a polyline needs two points');
  assert.equal(normalizeEntity({ type: 'polygon', cx: 0, cy: 0, r: 5, sides: 1 }).sides, 3);
  assert.equal(normalizeEntity({ type: 'part', kind: 'unknown' }), null);
});

test('every entity type expands to primitives with a box', () => {
  const samples = [
    createEntity('line', { x1: 0, y1: 0, x2: 10, y2: 0 }),
    createEntity('polyline', { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }], closed: true }),
    createEntity('rect', { x: 0, y: 0, width: 20, height: 10, radius: 2 }),
    createEntity('circle', { cx: 0, cy: 0, r: 5, centerMark: true }),
    createEntity('arc', { cx: 0, cy: 0, r: 5, start: 0, end: 90 }),
    createEntity('ellipse', { cx: 0, cy: 0, rx: 10, ry: 5 }),
    createEntity('polygon', { cx: 0, cy: 0, r: 10, sides: 6 }),
    createEntity('text', { x: 0, y: 0, text: '가나 ABC', size: 5 }),
    createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 30, y2: 0, ox: 15, oy: 10, size: 3.5 }),
    createEntity('dim', { kind: 'radius', cx: 0, cy: 0, r: 10, angle: 45, size: 3.5 }),
    createEntity('dim', { kind: 'angle', cx: 0, cy: 0, r: 10, start: 0, end: 60, size: 3.5 }),
    createEntity('part', { kind: 'gear', x: 0, y: 0, params: { module: 2, teeth: 18 } }),
  ];
  for (const entity of samples) {
    const prims = primitives(entity);
    assert.ok(prims.length > 0, entity.type);
    const box = entityBox(entity);
    assert.ok(box && box.maxX >= box.minX && box.maxY >= box.minY, `${entity.type} box`);
  }
});

test('rectangle corners follow its rotation; rounded corners make arcs', () => {
  const rect = createEntity('rect', { x: 0, y: 0, width: 10, height: 5, angle: 90 });
  const corners = rectCorners(rect);
  near(corners[1].x, 0);
  near(corners[1].y, 10);
  const rounded = primitives(createEntity('rect', { x: 0, y: 0, width: 10, height: 10, radius: 2 }))[0];
  assert.ok(rounded.points.length > 4);
});

test('hit tests: near the outline, not inside closed shapes; text by its box', () => {
  const circle = createEntity('circle', { cx: 0, cy: 0, r: 10 });
  assert.ok(hitTest(circle, { x: 10.2, y: 0 }, 0.5));
  assert.ok(!hitTest(circle, { x: 0, y: 0 }, 0.5));
  near(entityDistance(circle, { x: 20, y: 0 }), 10);
  const text = createEntity('text', { x: 0, y: 0, text: 'HELLO', size: 10 });
  assert.ok(hitTest(text, { x: 5, y: 3 }, 0.1));
});

test('box selection: window needs the whole entity, crossing any part', () => {
  const line = createEntity('line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const box = { minX: 5, minY: -1, maxX: 20, maxY: 1 };
  assert.ok(!inBox(line, box, false));
  assert.ok(inBox(line, box, true));
  assert.ok(inBox(line, { minX: -1, minY: -1, maxX: 11, maxY: 1 }, false));
  const circle = createEntity('circle', { cx: 0, cy: 0, r: 10 });
  assert.ok(!inBox(circle, { minX: -2, minY: -2, maxX: 2, maxY: 2 }, true), 'box inside the circle does not touch the outline');
});

test('transforms: move, rotate, scale, mirror keep the entity type and geometry', () => {
  const line = createEntity('line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  const moved = transformEntity(line, { type: 'move', dx: 5, dy: 1 });
  assert.equal(moved.x1, 5);
  assert.equal(moved.id, line.id);
  const rotated = transformEntity(line, { type: 'rotate', cx: 0, cy: 0, angle: 90 });
  near(rotated.x2, 0);
  near(rotated.y2, 10);
  const scaled = transformEntity(createEntity('circle', { cx: 1, cy: 1, r: 2 }), { type: 'scale', cx: 0, cy: 0, factor: 3 });
  near(scaled.cx, 3);
  near(scaled.r, 6);
  const arc = transformEntity(createEntity('arc', { cx: 0, cy: 0, r: 5, start: 0, end: 90 }), { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } });
  near(arc.start, 90);
  near(arc.end, 180);
  const rect = createEntity('rect', { x: 0, y: 0, width: 10, height: 5 });
  const mirrored = transformEntity(rect, { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } });
  const xs = rectCorners(mirrored).map((p) => p.x);
  near(Math.min(...xs), -10);
  near(Math.max(...xs), 0);
  const part = transformEntity(createEntity('part', { kind: 'bolt', x: 0, y: 0 }), { type: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
  assert.equal(part.flip, true);
});

test('dimensions measure and label themselves', () => {
  const horizontal = createEntity('dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 30, y2: 20, ox: 0, oy: 30, precision: 1 });
  assert.equal(dimValue(horizontal), 30);
  assert.equal(dimText(horizontal), '30');
  const aligned = createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 3, y2: 4, precision: 2 });
  assert.equal(dimText(aligned), '5');
  assert.equal(dimText(createEntity('dim', { kind: 'diameter', cx: 0, cy: 0, r: 12.5, precision: 1 })), 'Ø25');
  assert.equal(dimText(createEntity('dim', { kind: 'radius', cx: 0, cy: 0, r: 7.25, precision: 2 })), 'R7.25');
  assert.equal(dimText(createEntity('dim', { kind: 'angle', cx: 0, cy: 0, r: 5, start: 0, end: 45, precision: 0 })), '45°');
  assert.equal(dimText(createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 10, y2: 0, text: '4-<> 구멍' })), '4-10 구멍');
  assert.equal(formatNumber(2.5, 3), '2.5');
  assert.equal(formatNumber(2, 0), '2');
});

test('grips edit the geometry', () => {
  const line = createEntity('line', { x1: 0, y1: 0, x2: 10, y2: 0 });
  assert.deepEqual(grips(line).map((g) => g.id), ['p1', 'p2', 'mid']);
  const stretched = moveGrip(line, 'p2', { x: 20, y: 5 });
  assert.equal(stretched.x2, 20);
  const whole = moveGrip(line, 'mid', { x: 5, y: 10 });
  assert.equal(whole.y1, 10);
  const circle = moveGrip(createEntity('circle', { cx: 0, cy: 0, r: 5 }), 'q0', { x: 12, y: 0 });
  assert.equal(circle.r, 12);
  const rect = moveGrip(createEntity('rect', { x: 0, y: 0, width: 10, height: 10 }), 'c2', { x: 30, y: 20 });
  assert.equal(rect.width, 30);
  assert.equal(rect.height, 20);
});

test('offset: lines to the side, circles in or out, closed shapes as polylines', () => {
  const line = offsetEntity(createEntity('line', { x1: 0, y1: 0, x2: 10, y2: 0 }), 5, { x: 3, y: -1 });
  near(line.y1, -5);
  const outer = offsetEntity(createEntity('circle', { cx: 0, cy: 0, r: 10 }), 2, { x: 20, y: 0 });
  near(outer.r, 12);
  const inner = offsetEntity(createEntity('circle', { cx: 0, cy: 0, r: 10 }), 2, { x: 1, y: 0 });
  near(inner.r, 8);
  assert.equal(offsetEntity(createEntity('circle', { cx: 0, cy: 0, r: 1 }), 2, { x: 0.1, y: 0 }), null);
  const square = offsetEntity(createEntity('rect', { x: 0, y: 0, width: 10, height: 10 }), 1, { x: 5, y: 5 });
  assert.equal(square.type, 'polyline');
  near(Math.min(...square.points.map((p) => p.x)), 1);
  const outward = offsetPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], true, -1);
  near(Math.min(...outward.map((p) => p.x)), -1);
});

test('explode: parts and dimensions become simple entities', () => {
  const part = createEntity('part', { kind: 'washer', x: 0, y: 0, layer: 'p' });
  assert.ok(canExplode(part));
  const pieces = explode(part);
  assert.ok(pieces.length >= 3);
  assert.ok(pieces.every((piece) => ['line', 'polyline', 'circle', 'arc', 'text'].includes(piece.type) && piece.layer === 'p'));
  assert.ok(pieces.some((piece) => piece.lineType === 'center'), 'centre lines keep their line type');
  const dim = explode(createEntity('dim', { kind: 'aligned', x1: 0, y1: 0, x2: 10, y2: 0, ox: 5, oy: 5 }));
  assert.ok(dim.some((piece) => piece.type === 'text' && piece.text === '10'));
  assert.equal(explode(createEntity('polyline', { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true })).length, 3);
  assert.ok(!canExplode(createEntity('line', { x1: 0, y1: 0, x2: 1, y2: 0 })));
});

test('measurements and text widths', () => {
  const circle = measure(createEntity('circle', { cx: 0, cy: 0, r: 10 }));
  near(circle.area, Math.PI * 100);
  const rect = measure(createEntity('rect', { x: 0, y: 0, width: 20, height: 10 }));
  near(rect.area, 200);
  near(rect.perimeter, 60);
  const arc = measure(createEntity('arc', { cx: 0, cy: 0, r: 10, start: 0, end: 90 }));
  near(arc.length, Math.PI * 5);
  near(totalLength([createEntity('line', { x1: 0, y1: 0, x2: 3, y2: 4 }), createEntity('circle', { cx: 0, cy: 0, r: 1 })]), 5 + 2 * Math.PI);
  assert.ok(textWidth('가나', 10) > textWidth('ab', 10), 'Hangul is wider');
});
