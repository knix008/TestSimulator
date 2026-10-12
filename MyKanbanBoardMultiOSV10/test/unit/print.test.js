import assert from 'node:assert/strict';
import test from 'node:test';
import * as B from '../../src/domain/board.js';
import { defaultPrintOptions, pageSize, paginate, selectContent } from '../../src/domain/print.js';

const big = (columns, cards) => {
  const board = B.createBoard({ title: 'Big', columns: Array.from({ length: columns }, (_, i) => `C${i}`) });
  for (const column of board.columns) for (let i = 0; i < cards; i++) B.addCard(board, column.id, { title: `card ${i}`, description: 'some text '.repeat(5) });
  return board;
};

test('page size follows paper and orientation', () => {
  assert.deepEqual(pageSize({ paper: 'A4', orientation: 'portrait' }), { width: 210, height: 297 });
  assert.deepEqual(pageSize({ paper: 'A4', orientation: 'landscape' }), { width: 297, height: 210 });
  assert.equal(pageSize({ paper: 'Letter', orientation: 'portrait' }).width, 215.9);
});

test('a small board fits on one page', () => {
  const board = big(3, 2);
  const { pages } = paginate([board], defaultPrintOptions());
  assert.equal(pages.length, 1);
  assert.equal(pages[0].columns.length, 3);
  assert.equal(pages[0].number, 1);
  assert.equal(pages[0].total, 1);
});

test('many cards continue on following pages; every card printed once', () => {
  const board = big(2, 60);
  const { pages } = paginate([board], defaultPrintOptions());
  assert.ok(pages.length > 1);
  const printed = pages.flatMap((page) => page.columns.flatMap((column) => column.cards.map((card) => card.id)));
  assert.equal(printed.length, 120);
  assert.equal(new Set(printed).size, 120);
  assert.ok(pages[1].columns.every((column) => column.continued));
});

test('more columns than fit across split into column groups', () => {
  const board = big(9, 1);
  const portrait = paginate([board], { ...defaultPrintOptions(), orientation: 'portrait' });
  const landscape = paginate([board], { ...defaultPrintOptions(), orientation: 'landscape' });
  assert.ok(landscape.perPage > portrait.perPage, 'landscape fits more columns');
  assert.equal(portrait.pages.length, Math.ceil(9 / portrait.perPage));
});

test('scale changes how much fits', () => {
  const board = big(6, 30);
  const small = paginate([board], { ...defaultPrintOptions(), scale: 50 });
  const large = paginate([board], { ...defaultPrintOptions(), scale: 150 });
  assert.ok(small.pages.length < large.pages.length);
});

test('range: all, current and custom (columns, selected cards)', () => {
  const a = big(3, 2);
  const b = big(2, 2);
  assert.equal(selectContent([a, b], 1, { range: 'all' }).length, 2);
  assert.deepEqual(selectContent([a, b], 1, { range: 'current' }), [b]);
  const custom = selectContent([a, b], 0, { range: 'custom', columnIds: [a.columns[1].id], selectedOnly: true }, [a.columns[1].cards[0].id]);
  assert.equal(custom[0].columns.length, 1);
  assert.equal(custom[0].columns[0].cards.length, 1);
  assert.equal(a.columns[1].cards.length, 2, 'the original board is untouched');
});

test('an empty board still gives a page; a very tall card does not loop', () => {
  const empty = B.createBoard({ columns: [] });
  assert.equal(paginate([empty], defaultPrintOptions()).pages.length, 1);
  const tall = B.createBoard({ columns: ['A'] });
  B.addCard(tall, tall.columns[0].id, { title: 'x'.repeat(5000), description: 'y\n'.repeat(500) });
  assert.equal(paginate([tall], defaultPrintOptions()).pages.length, 1);
});
