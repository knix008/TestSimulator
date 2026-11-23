import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COLS, autoArrange, cardsOf, clampCell, layoutValue, overlaps, place } from '../src/startLayout.js';
import { ANIMATION_INTERVALS, ANIMATION_KINDS, randomAnimation } from '../src/startBackground.js';
import { BG_DEFAULTS, OPACITY, SPEED, normalizeBg } from '../src/startScreenBg.js';

const SPAN = { actions: 1, recent: 2, examples: 3, background: 3 };
const IDS = ['actions', 'recent', 'examples', 'background'];
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const noOverlap = (cards) => {
  const list = Object.values(cards);
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(!overlaps(list[i], list[j]));
};

test('the default board: quick start and recent files side by side, then the samples, then the background', () => {
  const cards = autoArrange(IDS, SPAN, { actions: 14, recent: 6, examples: 30, background: 12 });
  assert.deepEqual([cards.actions.col, cards.actions.row], [0, 0]);
  assert.deepEqual([cards.recent.col, cards.recent.row], [1, 0]);
  assert.equal(cards.examples.row, 14);
  assert.equal(cards.background.row, cards.examples.row + 30, 'the background card is below the samples');
  noOverlap(cards);
});

test('moving or resizing a card never makes cards overlap and the layout survives a save', () => {
  const start = cardsOf(null, IDS, SPAN, { actions: 10, recent: 6, examples: 20, background: 8 });
  const moved = place(start, 'background', { col: 0, row: 0 });
  assert.equal(moved.background.row, 0);
  noOverlap(moved);
  const resized = place(moved, 'recent', { w: 3, h: 9, fit: false });
  noOverlap(resized);
  const again = cardsOf(layoutValue(resized), IDS, SPAN, {});
  assert.deepEqual([again.recent.w, again.recent.h, again.recent.fit], [3, 9, false], 'the size survives a save');
  noOverlap(again);
  assert.deepEqual(clampCell({ col: 9, w: 9, h: 1 }), { col: 0, row: 0, w: COLS, h: 2, fit: true });
});

test('the program name card is fixed: no move handle and no resize corner', () => {
  const hero = HTML.slice(HTML.indexOf('<header class="start-hero">'), HTML.indexOf('</header>', HTML.indexOf('<header class="start-hero">')));
  assert.ok(hero.length > 0);
  assert.doesNotMatch(hero, /card-handle|card-resize|data-card/);
  for (const id of IDS) {
    assert.match(HTML, new RegExp(`data-card-handle="${id}"`), `${id} can be moved`);
    assert.match(HTML, new RegExp(`data-card-resize="${id}"`), `${id} can be resized`);
  }
});

test('every resize marker is six dots in a triangle', () => {
  const markers = [...HTML.matchAll(/class="(?:card-resize|resize-grip)"[\s\S]*?<\/svg>/g)].map((m) => m[0]);
  assert.equal(markers.length, IDS.length + 1);
  for (const marker of markers) {
    assert.equal((marker.match(/<circle /g) ?? []).length, 6);
    assert.doesNotMatch(marker, /<path /);
  }
});

test('twenty start screen backgrounds with speed, opacity, random start and interval', () => {
  assert.equal(ANIMATION_KINDS.length, 20);
  assert.equal(new Set(ANIMATION_KINDS).size, 20);
  assert.notEqual(randomAnimation('aurora', () => 0), 'aurora');
  assert.deepEqual(normalizeBg({}), BG_DEFAULTS);
  const clamped = normalizeBg({ startBg: 'nope', startBgSpeed: 999, startCardOpacity: 1, startBgRandom: false, startBgInterval: 7 });
  assert.equal(clamped.startBg, BG_DEFAULTS.startBg);
  assert.equal(clamped.startBgSpeed, SPEED.max);
  assert.equal(clamped.startCardOpacity, OPACITY.min);
  assert.equal(clamped.startBgRandom, false);
  assert.equal(clamped.startBgInterval, 0);
  assert.ok(ANIMATION_INTERVALS.includes(normalizeBg({ startBgInterval: 60 }).startBgInterval));
  const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  for (const kind of ANIMATION_KINDS) assert.equal((i18n.match(new RegExp(`^  bg_${kind}: `, 'gm')) ?? []).length, 2, `${kind} in ko and en`);
});
