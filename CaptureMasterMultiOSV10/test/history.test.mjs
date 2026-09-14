import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, push, replace, undo, redo, canUndo, canRedo, HISTORY_LIMIT } from '../src/lib/history.js';

test('push / undo / redo walk the states in order', () => {
  let h = createHistory('a');
  h = push(h, 'b');
  h = push(h, 'c');
  assert.equal(h.present, 'c');
  assert.ok(canUndo(h) && !canRedo(h));
  h = undo(h);
  assert.equal(h.present, 'b');
  h = undo(h);
  assert.equal(h.present, 'a');
  assert.ok(!canUndo(h));
  h = redo(h);
  assert.equal(h.present, 'b');
  h = redo(h);
  assert.equal(h.present, 'c');
  assert.equal(redo(h), h, 'redo at the end is a no-op');
});

test('a new push clears the redo stack', () => {
  let h = push(push(createHistory(1), 2), 3);
  h = undo(h);
  h = push(h, 99);
  assert.equal(h.present, 99);
  assert.ok(!canRedo(h));
  assert.deepEqual(h.past, [1, 2]);
});

test('replace changes the present without a history entry', () => {
  let h = push(createHistory('a'), 'b');
  h = replace(h, 'b2');
  assert.equal(h.present, 'b2');
  assert.equal(undo(h).present, 'a');
});

test('the past is capped at HISTORY_LIMIT entries', () => {
  let h = createHistory(0);
  for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = push(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  assert.equal(h.past[0], 20);
});

test('pushing the identical present is a no-op', () => {
  const h = createHistory('x');
  assert.equal(push(h, 'x'), h);
});
