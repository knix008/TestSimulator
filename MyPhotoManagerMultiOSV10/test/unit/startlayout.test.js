// Start page cards: grouped items on a 3-column grid; moving, resizing, auto arrange,
// and what the settings keep.
// features: APP-STARTLAYOUT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize } from '../../src/settings.js';
import { autoArrange, cardsOf, COLS, layoutText, overlaps, place, START_CARDS, swapVertical } from '../../src/ui/startlayout.js';

const noOverlap = (cards) => {
  const ids = Object.keys(cards);
  for (const a of ids) for (const b of ids) if (a < b) assert.ok(!overlaps(cards[a], cards[b]), `${a} overlaps ${b}: ${JSON.stringify([cards[a], cards[b]])}`);
};
const inGrid = (cards) => { for (const c of Object.values(cards)) assert.ok(c.col >= 0 && c.col + c.w <= COLS && c.row >= 0, JSON.stringify(c)); };

test('every card is placed, inside the grid and without overlaps, from any saved value', () => {
  for (const saved of [null, '', 'not json', '{"columns":[]}', '{"version":2,"cards":{"begin":{"col":2,"row":0,"w":3,"h":5}}}', layoutText(autoArrange())]) {
    const cards = cardsOf(saved);
    assert.deepEqual(Object.keys(cards).sort(), [...START_CARDS].sort(), String(saved));
    inGrid(cards);
    noOverlap(cards);
  }
});

test('the default layout packs the cards in reading order', () => {
  const cards = cardsOf(null, { begin: 20, browse: 12, edit: 10, tools: 10, recent: 6, tip: 4, scenes: 10, speeds: 8 });
  assert.deepEqual([cards.begin.col, cards.begin.row, cards.begin.w], [0, 0, 1]);
  assert.deepEqual([cards.browse.col, cards.browse.row, cards.browse.w], [1, 0, 2]);
  assert.equal(cards.edit.row, cards.browse.row + cards.browse.h, 'edit under browse');
});

test('moving a card pushes the others down and floats everything up', () => {
  const start = cardsOf(null, {});
  const moved = place(start, 'speeds', { col: 0, row: 0 });
  assert.deepEqual([moved.speeds.col, moved.speeds.row], [0, 0]);
  assert.ok(moved.begin.row >= moved.speeds.h, 'begin went below');
  noOverlap(moved);
  inGrid(moved);
});

test('resizing sets a fixed height and width; fit goes back to the content height', () => {
  const start = cardsOf(null, { recent: 6 });
  const big = place(start, 'recent', { w: 3, h: 15, fit: false });
  assert.equal(big.recent.w, 3);
  assert.equal(big.recent.h, 15);
  assert.equal(big.recent.fit, false);
  noOverlap(big);
  const again = cardsOf(layoutText(place(big, 'recent', { fit: true })), { recent: 6 });
  assert.equal(again.recent.fit, true);
  assert.equal(again.recent.h, 6);
});

test('auto arrange restores the packed layout after any changes', () => {
  const measured = { begin: 20, browse: 12, edit: 10 };
  let cards = place(cardsOf(null, measured), 'scenes', { col: 0, row: 0, w: 3 });
  cards = place(cards, 'tip', { w: 1, h: 30, fit: false });
  assert.deepEqual(cardsOf(layoutText(autoArrange(measured)), measured), cardsOf(null, measured));
});

test('Alt+↑ / Alt+↓ swap a card with its neighbour', () => {
  const cards = cardsOf(null, {});
  const up = swapVertical(cards, 'edit', -1);
  assert.ok(up.edit.row < up.browse.row, 'edit above browse');
  noOverlap(up);
});

test('the settings keep the layout string and the show-on-launch choice', () => {
  const text = layoutText(place(cardsOf(null), 'tip', { col: 2, row: 0 }));
  const s = normalize({ startScreen: { layout: text, showOnLaunch: false } });
  assert.equal(s.startScreen.layout, text);
  assert.equal(s.startScreen.showOnLaunch, false);
  assert.equal(normalize({}).startScreen.showOnLaunch, true);
  assert.deepEqual([cardsOf(s.startScreen.layout).tip.col, cardsOf(s.startScreen.layout).tip.row], [2, 0]);
});
