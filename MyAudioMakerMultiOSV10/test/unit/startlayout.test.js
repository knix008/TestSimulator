// The start page board: the program name and information card (hero) is fixed — always the top
// row across every column — and no move, resize or saved layout can change that.
import assert from 'node:assert/strict';
import test from 'node:test';
import { autoArrange, cardsOf, COLS, FIXED_CARDS, LAYOUT_VERSION, overlaps, place } from '../../src/ui/startlayout.js';
import { START_CARD_SPAN } from '../../src/ui/startboard.js';

const IDS = Object.keys(START_CARD_SPAN);
const measured = { hero: 9, actions: 12, recent: 14, compose: 10, templates: 16, samples: 30, background: 12 };
const heroAtTop = (cards, what) => assert.deepEqual({ ...cards.hero, h: undefined }, { col: 0, row: 0, w: COLS, h: undefined, fit: true }, `${what}: hero at the top across all columns`);
const noOverlap = (cards, what) => {
  const list = Object.entries(cards);
  for (const [a, ca] of list) for (const [b, cb] of list) if (a < b) assert.ok(!overlaps(ca, cb), `${what}: ${a} and ${b} do not overlap`);
};

test('only the hero card is fixed', () => {
  assert.deepEqual([...FIXED_CARDS], ['hero']);
});

test('the default arrangement puts the hero first, full width, with its content height', () => {
  const cards = autoArrange(IDS, START_CARD_SPAN, measured);
  heroAtTop(cards, 'default');
  assert.equal(cards.hero.h, measured.hero);
  for (const id of IDS.filter((x) => x !== 'hero')) assert.ok(cards[id].row >= measured.hero, `${id} is below the hero`);
  noOverlap(cards, 'default');
});

test('moving or resizing the hero changes nothing', () => {
  const cards = cardsOf(null, IDS, START_CARD_SPAN, measured);
  assert.deepEqual(place(cards, 'hero', { col: 1, row: 10 }), cards, 'move');
  assert.deepEqual(place(cards, 'hero', { w: 1, h: 30, fit: false }), cards, 'resize');
});

test('another card dropped on the top row goes below the hero, never above it', () => {
  const cards = cardsOf(null, IDS, START_CARD_SPAN, measured);
  for (const col of [0, 1, 2]) {
    const moved = place(cards, 'recent', { col, row: 0 });
    heroAtTop(moved, `recent → column ${col}, row 0`);
    assert.ok(moved.recent.row >= moved.hero.h, 'recent below the hero');
    noOverlap(moved, `recent → column ${col}`);
  }
  const grown = place(cards, 'samples', { w: 3, h: 40, fit: false });
  heroAtTop(grown, 'samples resized');
  noOverlap(grown, 'samples resized');
});

test('a saved layout that moved or shrank the hero is put right', () => {
  const saved = { version: LAYOUT_VERSION, cards: { hero: { col: 1, row: 20, w: 1, h: 4, fit: false }, recent: { col: 0, row: 0, w: 1, h: 14, fit: true } } };
  const cards = cardsOf(saved, IDS, START_CARD_SPAN, measured);
  heroAtTop(cards, 'saved');
  assert.equal(cards.hero.h, measured.hero, 'the hero takes its content height');
  assert.ok(cards.recent.row >= cards.hero.h, 'recent below the hero');
  noOverlap(cards, 'saved');
});
