import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionShape, isShaped, cornerRadius, traceSelection, maskToSelection, SELECTION_SHAPES } from '../src/lib/selection.js';

test('unknown shapes fall back to a rectangle', () => {
  assert.deepEqual(SELECTION_SHAPES, ['rect', 'round', 'ellipse']);
  assert.equal(selectionShape(null), 'rect');
  assert.equal(selectionShape({ shape: 'star' }), 'rect');
  assert.equal(isShaped({ shape: 'ellipse' }), true);
  assert.equal(isShaped({ shape: 'rect' }), false);
  assert.equal(cornerRadius({ w: 30, h: 60 }), 5);
  assert.equal(cornerRadius({ w: 6, h: 6 }), 2);
});

test('each shape traces a closed path', () => {
  const calls = [];
  const ctx = {
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    arcTo(...args) { calls.push(['arcTo', ...args]); },
    rect(...args) { calls.push(['rect', ...args]); },
    closePath() { calls.push(['closePath']); },
  };
  traceSelection(ctx, { x: 1, y: 2, w: 30, h: 18, shape: 'ellipse' });
  assert.equal(calls.at(-1)[0], 'closePath');
  assert.equal(calls.some((c) => c[0] === 'ellipse'), true);
  calls.length = 0;
  traceSelection(ctx, { x: 0, y: 0, w: 30, h: 18, shape: 'round' });
  assert.equal(calls.filter((c) => c[0] === 'arcTo').length, 4);
  calls.length = 0;
  traceSelection(ctx, { x: 4, y: 5, w: 6, h: 7 });
  assert.deepEqual(calls[0], ['rect', 4, 5, 6, 7]);
});

test('a rectangle needs no mask and a shaped selection clips the canvas', () => {
  const plain = { getContext() { throw new Error('a rectangle must not be masked'); } };
  assert.equal(maskToSelection(plain, { x: 0, y: 0, w: 10, h: 10, shape: 'rect' }), plain);
  const calls = [];
  const ctx = {
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    setTransform(...args) { calls.push(['setTransform', ...args]); },
    beginPath() { calls.push('beginPath'); },
    fill() { calls.push('fill'); },
    moveTo() {},
    ellipse() { calls.push('ellipse'); },
    closePath() {},
    globalCompositeOperation: '',
  };
  const canvas = { getContext: () => ctx };
  const region = { x: 2, y: 4, w: 20, h: 10, shape: 'ellipse' };
  assert.equal(maskToSelection(canvas, region, { ox: 2, oy: 4, scale: 2 }), canvas);
  assert.equal(ctx.globalCompositeOperation, 'destination-in');
  assert.equal(calls.includes('ellipse'), true);
  assert.deepEqual(calls.find((c) => Array.isArray(c)), ['setTransform', 2, 0, 0, 2, -4, -8]);
});
