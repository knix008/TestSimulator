import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../../src/domain/board.js';

const sample = () => {
  const board = B.createBoard({ title: 'T', columns: ['A', 'B', 'C'] });
  const [a, b] = board.columns;
  B.addCard(board, a.id, { title: 'one', priority: 'high', tags: ['x'] });
  B.addCard(board, a.id, { title: 'two', due: '2000-01-01' });
  B.addCard(board, b.id, { title: 'three', color: 'red', description: 'find me' });
  return board;
};

test('createBoard makes the named columns with unique ids', () => {
  const board = B.createBoard({ title: 'Plan', columns: ['To do', 'Done'] });
  assert.equal(board.title, 'Plan');
  assert.deepEqual(board.columns.map((c) => c.title), ['To do', 'Done']);
  assert.notEqual(board.columns[0].id, board.columns[1].id);
});

test('newId never repeats', () => {
  const ids = new Set(Array.from({ length: 5000 }, () => B.newId('x')));
  assert.equal(ids.size, 5000);
});

test('createCard normalizes bad input', () => {
  const card = B.createCard({ title: 5, color: 'neon', priority: 'max', tags: 'a, b, A, ,c', due: 'tomorrow', checklist: [{ text: 'x' }] });
  assert.equal(card.title, '5');
  assert.equal(card.color, 'none');
  assert.equal(card.priority, 'none');
  assert.deepEqual(card.tags, ['a', 'b', 'c']);
  assert.equal(card.due, '');
  assert.equal(card.checklist.length, 1);
  assert.ok(card.checklist[0].id);
});

test('addCard inserts at an index and findCard locates it', () => {
  const board = sample();
  const col = board.columns[0];
  const card = B.addCard(board, col.id, { title: 'zero' }, 0);
  assert.equal(col.cards[0].id, card.id);
  const found = B.findCard(board, card.id);
  assert.equal(found.column.id, col.id);
  assert.equal(found.index, 0);
  assert.equal(B.findCard(board, 'missing'), null);
});

test('moveCard moves between columns and within a column', () => {
  const board = sample();
  const [a, b] = board.columns;
  const one = a.cards[0];
  assert.ok(B.moveCard(board, one.id, b.id, 0));
  assert.equal(b.cards[0].id, one.id);
  assert.equal(a.cards.length, 1);
  assert.ok(B.moveCard(board, one.id, b.id, 5));
  assert.equal(b.cards.at(-1).id, one.id);
  assert.equal(B.moveCard(board, 'nope', b.id, 0), false);
});

test('shiftCard moves to the neighbouring column and stops at the edges', () => {
  const board = sample();
  const card = board.columns[0].cards[0];
  assert.equal(B.shiftCard(board, card.id, -1), false);
  assert.ok(B.shiftCard(board, card.id, 1));
  assert.equal(B.findCard(board, card.id).column.id, board.columns[1].id);
});

test('columns: add, update, move, remove, clear, sort', () => {
  const board = sample();
  const col = B.addColumn(board, { title: 'New' }, 1);
  assert.equal(board.columns[1].id, col.id);
  B.updateColumn(board, col.id, { title: 'Renamed', wip: '3', color: 'blue' });
  assert.deepEqual([col.title, col.wip, col.color], ['Renamed', 3, 'blue']);
  B.moveColumn(board, col.id, 0);
  assert.equal(board.columns[0].id, col.id);
  assert.equal(B.clearColumn(board, board.columns[1].id), 2);
  B.sortColumn(board, board.columns[2].id, 'title');
  assert.ok(B.removeColumn(board, col.id));
  assert.equal(board.columns.length, 3);
  assert.throws(() => B.updateColumn(board, 'nope', {}));
});

test('sortColumn by priority puts urgent first', () => {
  const board = B.createBoard({ columns: ['A'] });
  const id = board.columns[0].id;
  B.addCard(board, id, { title: 'b', priority: 'low' });
  B.addCard(board, id, { title: 'a', priority: 'urgent' });
  B.addCard(board, id, { title: 'c', priority: 'medium' });
  B.sortColumn(board, id, 'priority');
  assert.deepEqual(board.columns[0].cards.map((c) => c.priority), ['urgent', 'medium', 'low']);
  B.sortColumn(board, id, 'title');
  assert.deepEqual(board.columns[0].cards.map((c) => c.title), ['a', 'b', 'c']);
});

test('updateCard applies only valid fields', () => {
  const board = sample();
  const card = board.columns[0].cards[0];
  B.updateCard(board, card.id, { title: 'x', color: 'green', priority: 'urgent', tags: 'p,q', due: '2030-02-03', bogus: 1 });
  assert.equal(card.title, 'x');
  assert.equal(card.color, 'green');
  assert.equal(card.priority, 'urgent');
  assert.deepEqual(card.tags, ['p', 'q']);
  assert.equal(card.due, '2030-02-03');
  assert.equal(card.bogus, undefined);
});

test('insertCards and duplicateCards give fresh ids', () => {
  const board = sample();
  const source = board.columns[0].cards[0];
  const [copy] = B.insertCards(board, board.columns[2].id, [source]);
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.title, source.title);
  const dups = B.duplicateCards(board, [source.id]);
  assert.equal(dups.length, 1);
  assert.equal(board.columns[0].cards[1].id, dups[0].id, 'duplicate goes right after the original');
});

test('column background: pastel or custom colour, opacity 0–100', () => {
  const board = sample();
  const id = board.columns[0].id;
  assert.equal(B.PASTELS.length, 20);
  assert.equal(new Set(B.PASTELS.map((p) => p.hex)).size, 20);
  B.updateColumn(board, id, { background: B.PASTELS[4].hex, bgOpacity: 55 });
  assert.equal(board.columns[0].background, B.PASTELS[4].hex);
  assert.equal(board.columns[0].bgOpacity, 55);
  B.updateColumn(board, id, { background: '#ABCDEF', bgOpacity: 400 });
  assert.equal(board.columns[0].background, '#abcdef', 'custom colour');
  assert.equal(board.columns[0].bgOpacity, 100);
  B.updateColumn(board, id, { background: 'red' });
  assert.equal(board.columns[0].background, '', 'invalid colour → none');
  assert.equal(B.createColumn({}).bgOpacity, 100);
});

test('removeCards removes from every column', () => {
  const board = sample();
  const ids = B.allCards(board).map((c) => c.id).slice(0, 2);
  assert.equal(B.removeCards(board, ids), 2);
  assert.equal(B.allCards(board).length, 1);
});

test('stats, overdue and tags', () => {
  const board = sample();
  const s = B.stats(board, '2020-01-01');
  assert.deepEqual(s, { columns: 3, cards: 3, done: 0, overdue: 1, overWip: 0 });
  assert.deepEqual(B.allTags(board), ['x']);
  B.updateColumn(board, board.columns[0].id, { wip: 1 });
  assert.equal(B.stats(board).overWip, 1);
});

test('matchesFilter searches text, priority, colour, tag and overdue', () => {
  const board = sample();
  const [one, two] = board.columns[0].cards;
  const three = board.columns[1].cards[0];
  assert.ok(B.matchesFilter(three, { text: 'FIND' }));
  assert.ok(!B.matchesFilter(one, { text: 'find' }));
  assert.ok(B.matchesFilter(one, { priority: 'high' }));
  assert.ok(!B.matchesFilter(two, { priority: 'high' }));
  assert.ok(B.matchesFilter(three, { color: 'red' }));
  assert.ok(B.matchesFilter(one, { tag: 'x' }));
  assert.ok(B.matchesFilter(two, { overdue: true }, '2020-01-01'));
  assert.ok(!B.matchesFilter(one, { overdue: true }, '2020-01-01'));
  assert.ok(!B.filterActive({ text: ' ', priority: 'all' }));
  assert.ok(B.filterActive({ overdue: true }));
});
