// Undo / redo history of file operations (src/lib/history.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { History } from '../src/lib/history.js';

const entry = (n) => ({ kind: 'create', path: `/tmp/${n}`, isDir: false });

test('a new history can neither undo nor redo', () => {
  const h = new History();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.peekUndo(), null);
  assert.equal(h.peekRedo(), null);
});

test('push: the latest entry is the one to undo', () => {
  const h = new History();
  h.push(entry(1)); h.push(entry(2));
  assert.equal(h.canUndo, true);
  assert.equal(h.peekUndo().path, '/tmp/2');
});

test('commitUndo moves the entry to the redo stack, commitRedo moves it back', () => {
  const h = new History();
  const e = entry(1);
  h.push(e);
  h.commitUndo(e);
  assert.equal(h.canUndo, false);
  assert.equal(h.peekRedo(), e);
  h.commitRedo(e);
  assert.equal(h.peekUndo(), e);
  assert.equal(h.canRedo, false);
});

test('a new operation forgets what could have been redone', () => {
  const h = new History();
  const a = entry('a');
  h.push(a); h.commitUndo(a);
  assert.equal(h.canRedo, true);
  h.push(entry('b'));
  assert.equal(h.canRedo, false);
});

test('mark (an operation that cannot be undone) clears redo but keeps undo', () => {
  const h = new History();
  const a = entry('a'), b = entry('b');
  h.push(a); h.push(b); h.commitUndo(b);
  h.mark();
  assert.equal(h.canRedo, false);
  assert.equal(h.peekUndo(), a);
});

test('mark with nothing to redo does not notify listeners', () => {
  const h = new History();
  let calls = 0;
  h.subscribe(() => calls++);
  h.mark();
  assert.equal(calls, 0);
});

test('only the last 50 operations are kept', () => {
  const h = new History();
  for (let i = 0; i < 60; i++) h.push(entry(i));
  assert.equal(h.undoStack.length, 50);
  assert.equal(h.undoStack[0].path, '/tmp/10', 'the oldest ten were dropped');
});

test('the limit can be changed per history (settings › undo steps)', () => {
  const h = new History();
  h.max = 3;
  for (let i = 0; i < 5; i++) h.push(entry(i));
  assert.deepEqual(h.undoStack.map((e) => e.path), ['/tmp/2', '/tmp/3', '/tmp/4']);
});

test('drop removes an entry whose reversal failed, from either stack', () => {
  const h = new History();
  const a = entry('a'), b = entry('b');
  h.push(a); h.push(b); h.commitUndo(b);
  h.drop(a); h.drop(b);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
});

test('clear empties both stacks', () => {
  const h = new History();
  const a = entry('a');
  h.push(a); h.push(entry('b')); h.commitUndo(a);
  h.clear();
  assert.equal(h.canUndo || h.canRedo, false);
});

test('listeners are told of every change and the version counts up; unsubscribe stops them', () => {
  const h = new History();
  let calls = 0;
  const off = h.subscribe(() => calls++);
  h.push(entry(1)); h.push(entry(2));
  assert.equal(calls, 2);
  assert.equal(h.version, 2);
  off();
  h.clear();
  assert.equal(calls, 2);
  assert.equal(h.version, 3);
});

test('undo / redo of the same entry several times round-trips cleanly', () => {
  const h = new History();
  const e = entry('x');
  h.push(e);
  for (let i = 0; i < 5; i++) { h.commitUndo(e); h.commitRedo(e); }
  assert.equal(h.undoStack.length, 1);
  assert.equal(h.redoStack.length, 0);
});
