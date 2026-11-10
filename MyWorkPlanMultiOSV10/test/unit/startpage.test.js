// The start page's card board (pure layout: three columns, cards never overlap,
// moved cards keep their place, auto arrange restores the default) and the cards
// the page offers: no theme card, ten quick actions with Print, templates and the
// 40 samples in groups that fill their rows.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { autoArrange, cardsOf, clampCell, compact, COLS, layoutValue, LAYOUT_VERSION, overlaps, place } from '../../src/ui/startlayout.js';
import { SAMPLE_GROUPS, SAMPLE_PROJECTS } from '../../src/domain/samples/index.js';
import { TEMPLATES } from '../../src/domain/templates.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const IDS = ['hero', 'actions', 'recent', 'templates', 'samples', 'background'];
const SPAN = { hero: 3, actions: 2, recent: 1, templates: 3, samples: 3, background: 3 };
const HEIGHTS = { hero: 6, actions: 7, recent: 9, templates: 7, samples: 30, background: 12 };

const noOverlap = (cards) => {
  const list = Object.entries(cards);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!overlaps(list[i][1], list[j][1]), `${list[i][0]} overlaps ${list[j][0]}`);
};

test('the default board: hero on top, actions beside recent, then templates, samples, background', () => {
  const cards = autoArrange(IDS, SPAN, HEIGHTS);
  noOverlap(cards);
  assert.deepEqual(cards.hero, { col: 0, row: 0, w: 3, h: 6, fit: true });
  assert.deepEqual([cards.actions.col, cards.actions.row, cards.actions.w], [0, 6, 2]);
  assert.deepEqual([cards.recent.col, cards.recent.row, cards.recent.w], [2, 6, 1]);
  assert.ok(cards.templates.row >= 15 && cards.samples.row > cards.templates.row && cards.background.row > cards.samples.row);
  for (const c of Object.values(cards)) assert.ok(c.col >= 0 && c.col + c.w <= COLS);
});

test('moving a card pushes the others down and never overlaps; the saved form loads back', () => {
  let cards = autoArrange(IDS, SPAN, HEIGHTS);
  cards = place(cards, 'recent', { col: 0, row: 6 });
  noOverlap(cards);
  assert.equal(cards.recent.col, 0);
  const saved = layoutValue(cards);
  assert.equal(saved.version, LAYOUT_VERSION);
  const back = cardsOf(saved, IDS, SPAN, HEIGHTS);
  assert.equal(back.recent.col, 0);
  noOverlap(back);
  // A resized card keeps its height (no longer fits its content) until fit again.
  const resized = place(back, 'samples', { w: 2, h: 12, fit: false });
  noOverlap(resized);
  assert.deepEqual([resized.samples.w, resized.samples.h, resized.samples.fit], [2, 12, false]);
  assert.equal(cardsOf(layoutValue(resized), IDS, SPAN, HEIGHTS).samples.fit, false);
});

test('bad saved layouts are repaired; an old version starts over; new cards are added', () => {
  assert.deepEqual(clampCell({ col: 9, row: -3, w: 7, h: 0 }), { col: 0, row: 0, w: 3, h: 2, fit: true });
  const old = cardsOf({ version: LAYOUT_VERSION - 1, cards: { hero: { col: 2, row: 40, w: 1, h: 3 } } }, IDS, SPAN, HEIGHTS);
  assert.deepEqual(old, autoArrange(IDS, SPAN, HEIGHTS), 'old layout ignored');
  const partial = cardsOf({ version: LAYOUT_VERSION, cards: { hero: { col: 0, row: 0, w: 3, h: 6 } } }, IDS, SPAN, HEIGHTS);
  assert.deepEqual(Object.keys(partial).sort(), [...IDS].sort(), 'missing cards are added');
  noOverlap(partial);
  const holes = compact({ a: { col: 0, row: 10, w: 1, h: 2 } });
  assert.equal(holes.a.row, 0, 'compact closes gaps');
});

test('the start page has no theme picker and offers Print among ten quick actions', () => {
  const page = read('src/ui/startpage.js');
  assert.doesNotMatch(page, /pick-theme|theme-settings|themeBody|DARK_THEMES/);
  const actions = /export const START_ACTIONS = \[([^\]]+)\]/.exec(page)[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(actions, ['open', 'import', 'print', 'tutorial', 'shortcuts', 'language', 'settings', 'start-settings', 'about', 'exit']);
  const app = read('src/app.js');
  for (const action of [...actions, 'sample', 'arrange', 'help-menu', 'guide', 'tutorial-doc', 'tutorial-video', 'template', 'animation', 'shuffle', 'background-image']) {
    assert.match(app, new RegExp(`case '${action}':`), `app.js handles data-start="${action}"`);
  }
});

test('every grid of the start page fills its rows', () => {
  assert.equal(10 % 5, 0, 'ten actions in rows of five');
  assert.equal(TEMPLATES.length % 4, 0, 'templates in rows of four');
  for (const group of SAMPLE_GROUPS) assert.equal(SAMPLE_PROJECTS.filter((s) => s.group === group.id).length % 5, 0, group.id);
  const css = read('src/styles.css');
  assert.match(css, /\.start-actions \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.template-grid \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.sample-tiles \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.start-card-background \.bg-grid \{ grid-template-columns: repeat\(7, minmax\(0, 1fr\)\); \}/);
});
