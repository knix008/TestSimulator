import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../../src/domain/board.js';
import { BoardDocument } from '../../src/domain/document.js';
import { baseName, directoryOf, FormatError, isBoardFileName, isImageFileName, isTextFileName, parse, serialize, stripExtension, withExtension } from '../../src/domain/format.js';
import { History } from '../../src/domain/history.js';

test('serialize → parse round-trips a board', () => {
  const board = B.createBoard({ title: '계획', columns: ['A', 'B'] });
  B.addCard(board, board.columns[0].id, { title: '카드', tags: ['t'], checklist: [{ text: 'c', done: true }] });
  const text = serialize(board);
  assert.match(text, /"format": "mykanbanboard"/);
  const back = parse(text);
  assert.deepEqual(back, board);
});

test('parse accepts a BOM and a bare board object', () => {
  const board = B.createBoard({ title: 'x' });
  assert.equal(parse(`\uFEFF${JSON.stringify(board)}`).title, 'x');
});

test('parse rejects broken and foreign files with a code', () => {
  const code = (text) => { try { parse(text); return null; } catch (error) { assert.ok(error instanceof FormatError); return error.code; } };
  assert.equal(code('{nope'), 'format.invalidJson');
  assert.equal(code('[]'), 'format.notBoard');
  assert.equal(code('{"title":"x"}'), 'format.notBoard');
  assert.equal(code('{"format":"other","board":{"columns":[]}}'), 'format.otherFormat');
  assert.equal(code('{"format":"mykanbanboard","version":99,"board":{"columns":[]}}'), 'format.newerVersion');
});

test('parse repairs duplicate ids and bad entries', () => {
  const text = JSON.stringify({ format: 'mykanbanboard', version: 1, board: { title: '', columns: [
    { id: 'c', title: 'A', cards: [{ id: 'k', title: '1' }, { id: 'k', title: '2' }, null] },
    { id: 'c', title: 'B', cards: 'bad' }, 7,
  ] } });
  const board = parse(text);
  assert.equal(board.title, 'Board');
  assert.equal(board.columns.length, 2);
  assert.notEqual(board.columns[0].id, board.columns[1].id);
  const ids = board.columns[0].cards.map((c) => c.id);
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(board.columns[1].cards, []);
});

test('file name helpers', () => {
  assert.equal(baseName('C:\\a\\b\\plan.mkanban'), 'plan.mkanban');
  assert.equal(baseName('/x/y.json'), 'y.json');
  assert.equal(stripExtension('plan.MKANBAN'), 'plan');
  assert.equal(withExtension('C:/a/plan'), 'C:/a/plan.mkanban');
  assert.equal(withExtension('C:/a/plan.json'), 'C:/a/plan.json');
  assert.equal(directoryOf('C:\\a\\b\\plan.mkanban'), 'C:\\a\\b');
  assert.ok(isBoardFileName('x.mkanban') && isBoardFileName('x.JSON') && !isBoardFileName('x.txt'));
  assert.ok(isImageFileName('a.JPG') && isImageFileName('b.webp') && !isImageFileName('c.mkanban'));
  assert.ok(isTextFileName('a.md') && isTextFileName('b.csv') && !isTextFileName('c.png'));
});

test('History: record, undo, redo, limit', () => {
  const history = new History(3);
  history.record('s0', 'a');
  history.record('s1', 'b');
  assert.equal(history.undoLabel, 'b');
  assert.equal(history.undo('s2').snapshot, 's1');
  assert.ok(history.canRedo);
  assert.equal(history.redo('s1').snapshot, 's2');
  history.record('s2', 'c');
  history.record('s3', 'd');
  history.record('s4', 'e');
  assert.equal(history.undoStack.length, 3, 'old steps drop off');
  assert.ok(!history.canRedo, 'a new change clears redo');
});

test('BoardDocument: undo/redo restores board, dirty tracks saved state', () => {
  const doc = new BoardDocument(B.createBoard({ columns: ['A'] }));
  assert.ok(!doc.dirty);
  const card = doc.apply('add', (board) => B.addCard(board, board.columns[0].id, { title: 'x' }));
  assert.ok(doc.dirty);
  assert.equal(doc.history.undoLabel, 'add');
  doc.apply('noop', () => {});
  assert.equal(doc.history.undoStack.length, 1, 'a change that changes nothing is not recorded');
  assert.equal(doc.undo(), 'add');
  assert.equal(B.findCard(doc.board, card.id), null);
  assert.ok(!doc.dirty);
  assert.equal(doc.redo(), 'add');
  assert.ok(B.findCard(doc.board, card.id));
  doc.markSaved('C:/x.mkanban');
  assert.ok(!doc.dirty);
  assert.equal(doc.path, 'C:/x.mkanban');
  assert.equal(doc.undo(), 'add');
  assert.ok(doc.dirty, 'undoing past the save point is a change');
  assert.equal(doc.undo(), null);
});
