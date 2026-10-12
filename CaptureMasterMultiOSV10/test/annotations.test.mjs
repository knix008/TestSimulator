import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normRect, fontString, boundsOf, hitTest, HANDLES, handlesOf, moveAnnotation, resizeAnnotation, cursorForHandle,
} from '../src/lib/render.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('boxes, lines, pens and badges report their bounds', () => {
  assert.deepEqual(normRect(3, 8, 1, 2), { x: 1, y: 2, w: 2, h: 6 });
  const font = fontString({ italic: true, bold: true, size: 2, family: 'A"B' });
  assert.match(font, /^italic bold 6px "AB", /);
  assert.deepEqual(boundsOf({ type: 'line', x1: 5, y1: 1, x2: 1, y2: 9 }), { x: 1, y: 1, w: 4, h: 8 });
  assert.deepEqual(boundsOf({ type: 'pen', points: [] }), { x: 0, y: 0, w: 0, h: 0 });
  assert.deepEqual(boundsOf({ type: 'pen', points: [{ x: 2, y: 4 }, { x: 8, y: 1 }] }), { x: 2, y: 1, w: 6, h: 3 });
  const badge = boundsOf({ type: 'number', x: 10, y: 20 });
  near(badge.x, 10 - 14);
  near(badge.w, 28);
});

test('hit testing prefers the top annotation and ignores a hollow box', () => {
  const back = { type: 'highlight', x: 0, y: 0, w: 100, h: 100 };
  const front = { type: 'rect', x: 10, y: 10, w: 20, h: 20, fill: true };
  assert.equal(hitTest([back, front], 15, 15), front);
  const hollow = { type: 'rect', x: 0, y: 0, w: 100, h: 100, fill: false, strokeWidth: 4 };
  assert.equal(hitTest([hollow], 50, 50), null);
  assert.equal(hitTest([hollow], 2, 2), hollow);
  const line = { type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, strokeWidth: 4 };
  assert.equal(hitTest([line], 50, 5), line);
  assert.equal(hitTest([line], 50, 30), null);
  const dot = { type: 'pen', points: [{ x: 10, y: 10 }], strokeWidth: 4 };
  assert.equal(hitTest([dot], 10, 10), dot);
  assert.equal(hitTest([dot], 40, 40), null);
});

test('handles move and resize, and pictures keep their proportions', () => {
  assert.equal(HANDLES.length, 8);
  const line = { type: 'line', x1: 1, y1: 2, x2: 3, y2: 4 };
  assert.deepEqual(handlesOf(line).map((h) => h.id), ['p1', 'p2']);
  assert.deepEqual(handlesOf({ type: 'text', x: 0, y: 0, text: 'a' }), []);
  assert.equal(handlesOf({ type: 'rect', x: 0, y: 0, w: 10, h: 8 }).length, 8);
  assert.deepEqual(moveAnnotation(line, 5, -1), { type: 'line', x1: 6, y1: 1, x2: 8, y2: 3 });
  assert.deepEqual(moveAnnotation({ type: 'pen', points: [{ x: 1, y: 1 }] }, 2, 3).points, [{ x: 3, y: 4 }]);
  const box = { type: 'rect', x: 0, y: 0, w: 40, h: 20 };
  assert.equal(resizeAnnotation(box, 'e', 10, 0).w, 50);
  const flipped = resizeAnnotation(box, 'w', 50, 0);
  assert.equal(flipped.x, 40);
  assert.equal(flipped.w, 10);
  const picture = { type: 'image', x: 0, y: 0, w: 100, h: 50 };
  const grown = resizeAnnotation(picture, 'se', 100, 0);
  near(grown.w, 200);
  near(grown.h, 100);
  assert.equal(grown.x, 0);
  const corner = resizeAnnotation(picture, 'nw', -50, 0);
  near(corner.w, 150);
  near(corner.h, 75);
  near(corner.x, -50);
  assert.equal(resizeAnnotation({ type: 'number', x: 1, y: 2 }, 'se', 4, 4).x, 1);
  assert.equal(cursorForHandle('nw'), 'nwse-resize');
  assert.equal(cursorForHandle('p1'), 'move');
  assert.equal(cursorForHandle('nope'), 'default');
});
