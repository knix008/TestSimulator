// The start page board: Arrange lines the cards up in shelves (tops level along a shelf, left edges in
// columns) and keeps the size each card was given; the arranged board stays aligned when reloaded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeKeepingSizes, cardsOf, layoutValue } from '../../src/ui/startlayout.js';

test('arrange keeps sizes and aligns shelves', () => {
  const cards = { a: { col: 1, row: 9, w: 2, h: 10, fit: false }, b: { col: 0, row: 0, w: 1, h: 6, fit: false }, c: { col: 0, row: 20, w: 3, h: 4, fit: true }, d: { col: 2, row: 30, w: 1, h: 3, fit: false } };
  const out = arrangeKeepingSizes(cards);
  for (const id of Object.keys(cards)) { assert.equal(out[id].w, cards[id].w); assert.equal(out[id].h, cards[id].h); }
  // b (row 0) then a beside it on the first shelf; c is full width on the next; d starts the last shelf.
  assert.deepEqual([out.b.col, out.b.row, out.a.col, out.a.row], [0, 0, 1, 0]);
  assert.deepEqual([out.c.col, out.c.row], [0, 10]);
  assert.deepEqual([out.d.col, out.d.row], [0, 14]);
  // Saved and read back: the shelves stay (no card slides up into a gap).
  const again = cardsOf(layoutValue(out, { aligned: true }), Object.keys(cards), {});
  assert.equal(again.d.row, 14);
  assert.equal(again.a.row, again.b.row);
});
