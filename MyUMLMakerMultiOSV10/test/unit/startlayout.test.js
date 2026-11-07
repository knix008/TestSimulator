// The start page's card board: cells stay inside the columns, cards never overlap, moving and
// resizing push the others away, a saved arrangement comes back, a bad one is repaired.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { autoArrange, cardsOf, clampCell, COLS, compact, layoutValue, LAYOUT_VERSION, overlaps, place, rowsFor } from '../../src/ui/startlayout.js';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IDS = ['hero', 'actions', 'recent', 'templates', 'samples'];
const SPAN = { hero: 3, actions: 2, recent: 1, templates: 3, samples: 3 };
const HEIGHTS = { hero: 6, actions: 10, recent: 18, templates: 16, samples: 30 };
const noOverlaps = (cards, label = '') => {
  const list = Object.entries(cards);
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) assert.ok(!overlaps(list[i][1], list[j][1]), `${label} ${list[i][0]} overlaps ${list[j][0]}`);
};
const inside = (cards) => { for (const [id, c] of Object.entries(cards)) assert.ok(c.col >= 0 && c.col + c.w <= COLS && c.row >= 0 && c.h >= 2, `${id}: ${JSON.stringify(c)}`); };

test('the default arrangement: wide cards alone, the launcher beside the recent files', () => {
  const cards = autoArrange(IDS, SPAN, HEIGHTS);
  inside(cards);
  noOverlaps(cards);
  assert.deepEqual([cards.hero.col, cards.hero.row, cards.hero.w], [0, 0, 3]);
  assert.deepEqual([cards.actions.col, cards.actions.row, cards.actions.w], [0, 6, 2]);
  assert.deepEqual([cards.recent.col, cards.recent.row, cards.recent.w], [2, 6, 1]);
  assert.equal(cards.templates.row, 24, 'below the taller of the two');
});

test('rowsFor rounds a height up to whole rows, at least two', () => {
  assert.equal(rowsFor(0), 2);
  assert.equal(rowsFor(100), 6);
  assert.equal(rowsFor(106), 6);
  assert.equal(rowsFor(107), 7);
});

test('clampCell repairs anything', () => {
  assert.deepEqual(clampCell(null), { col: 0, row: 0, w: 1, h: 2, fit: true });
  assert.deepEqual(clampCell({ col: 9, row: -4, w: 2, h: 'x', fit: false }), { col: 1, row: 0, w: 2, h: 2, fit: false });
  assert.deepEqual(clampCell({ col: 0, w: 99 }).w, COLS);
});

test('moving a card pushes the others down, with no holes left above', () => {
  const start = cardsOf(null, IDS, SPAN, HEIGHTS);
  const moved = place(start, 'samples', { col: 0, row: 0 });
  inside(moved);
  noOverlaps(moved, 'moved');
  assert.equal(moved.samples.row, 0, 'the moved card goes where it was dropped');
  assert.equal(moved.hero.row, 30, 'the card that was there moved below it');
  assert.deepEqual(compact(moved), moved, 'already compact');
});

test('a card moved into another column takes that column', () => {
  const cards = place(cardsOf(null, ['a', 'b'], { a: 1, b: 1 }, { a: 5, b: 5 }), 'b', { col: 2, row: 0 });
  assert.equal(cards.b.col, 2);
  assert.equal(cards.b.row, 0, 'nothing above it there');
  noOverlaps(cards);
});

test('resizing makes a card fixed; fit brings the measured height back', () => {
  const start = cardsOf(null, IDS, SPAN, HEIGHTS);
  const big = place(start, 'recent', { h: 40, fit: false });
  noOverlaps(big, 'resized');
  assert.equal(big.recent.fit, false);
  assert.equal(big.templates.row, big.recent.row + 40, 'the cards below moved down');
  const again = cardsOf(layoutValue(place(big, 'recent', { fit: true })), IDS, SPAN, HEIGHTS);
  assert.equal(again.recent.h, HEIGHTS.recent, 'fits its content again');
  assert.equal(again.recent.fit, true);
});

test('a fixed card keeps its height when measured, a fit card follows', () => {
  const saved = layoutValue(place(cardsOf(null, IDS, SPAN, HEIGHTS), 'recent', { h: 40, fit: false }));
  const cards = cardsOf(saved, IDS, SPAN, { ...HEIGHTS, recent: 3, actions: 12 });
  assert.equal(cards.recent.h, 40);
  assert.equal(cards.actions.h, 12);
});

test('a saved arrangement comes back; new cards go below; hidden cards stay out', () => {
  const saved = layoutValue(place(cardsOf(null, IDS, SPAN, HEIGHTS), 'samples', { col: 0, row: 0 }));
  assert.equal(saved.version, LAYOUT_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved, 'plain data');
  const same = cardsOf(saved, IDS, SPAN, HEIGHTS);
  assert.equal(same.samples.row, 0);
  const more = cardsOf(saved, [...IDS, 'theme'], { ...SPAN, theme: 3 }, { ...HEIGHTS, theme: 9 });
  assert.equal(more.theme.row, Math.max(...IDS.map((id) => more[id].row + more[id].h)), 'a new card under everything');
  noOverlaps(more, 'new card');
  const fewer = cardsOf(saved, IDS.filter((id) => id !== 'samples'), SPAN, HEIGHTS);
  assert.deepEqual(Object.keys(fewer).sort(), IDS.filter((id) => id !== 'samples').sort());
  noOverlaps(fewer, 'hidden card');
  assert.equal(fewer.hero.row, 0, 'its place is closed up');
});

test('a layout of another version, or a broken one, starts over', () => {
  const fresh = cardsOf(null, IDS, SPAN, HEIGHTS);
  for (const bad of [{ version: LAYOUT_VERSION + 1, cards: {} }, 'x', 7, [], { version: LAYOUT_VERSION }]) assert.deepEqual(cardsOf(bad, IDS, SPAN, HEIGHTS), fresh, JSON.stringify(bad));
  const repaired = cardsOf({ version: LAYOUT_VERSION, cards: { hero: { col: 50, row: -3, w: 9, h: 0 }, recent: { col: 0, row: 0, w: 1, h: 3 } } }, IDS, SPAN, HEIGHTS);
  inside(repaired);
  noOverlaps(repaired, 'repaired');
});

test('the settings keep the layout and the opacity, and repair bad values', () => {
  assert.equal(defaultSettings().startLayout, null);
  assert.equal(defaultSettings().startCardOpacity, 80);
  const layout = { version: 1, cards: {} };
  assert.deepEqual(normalizeSettings({ startLayout: layout }).startLayout, layout);
  for (const bad of ['x', 7, [1], null]) assert.equal(normalizeSettings({ startLayout: bad }).startLayout, null);
  assert.equal(normalizeSettings({ startCardOpacity: 5 }).startCardOpacity, 20);
  assert.equal(normalizeSettings({ startCardOpacity: 500 }).startCardOpacity, 100);
  assert.equal(normalizeSettings({ startCardOpacity: 'x' }).startCardOpacity, 80);
});

test('the start page has MyMind\'s parts: cards, handles, corners, launcher, theme and background', () => {
  const page = fs.readFileSync(path.join(root, 'src/ui/startpage.js'), 'utf8');
  for (const id of ['hero', 'actions', 'recent', 'templates', 'samples', 'theme', 'background']) assert.match(page, new RegExp(`card\\('${id}'`), `card ${id}`);
  for (const part of ['data-card-handle', 'data-card-resize', 'start-tools', 'start-foot', 'data-sample-group', 'sample-count', 'pick-theme']) assert.ok(page.includes(part), part);
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  for (const action of [...page.matchAll(/data-start="([\w-]+)"/g)].map((m) => m[1])) assert.ok(app.includes(`case '${action}':`), `app.js handles the start action ${action}`);
  for (const [action] of [['open'], ['import'], ['reverse'], ['textImport'], ['tutorial'], ['theme-settings'], ['language'], ['settings'], ['start-settings'], ['about'], ['exit']]) assert.ok(app.includes(`case '${action}':`), `app.js handles the launcher tile ${action}`);
});
