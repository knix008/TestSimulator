/**
 * The start screen's card board (src/startLayout.ts) and its stored preferences
 * (src/startBackground.ts): compaction, moving, resizing, auto arrange and the
 * sanitising of whatever comes back from storage.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  autoArrange,
  cardsOf,
  clampCell,
  compact,
  COLS,
  layoutValue,
  overlaps,
  place,
  rowsFor,
  swapVertical,
} from "../src/startLayout.ts";
import { DEFAULT_START_SCREEN, effectiveSpeed, REDUCED_MOTION_SPEED, sanitizeStartScreen } from "../core/startScreen.ts";
import { defaultSettings, sanitize } from "../core/settings.ts";

const IDS = ["hero", "sessions", "recent", "theme", "background"];
const SPAN = { hero: 3, sessions: 3, recent: 2, theme: 1, background: 1 };
const MEASURED = { hero: 6, sessions: 10, recent: 9, theme: 7, background: 8 };

function noOverlaps(cards) {
  const ids = Object.keys(cards);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      assert.ok(!overlaps(cards[ids[i]], cards[ids[j]]), `${ids[i]} overlaps ${ids[j]}`);
    }
  }
}

function inside(cards) {
  for (const [id, c] of Object.entries(cards)) {
    assert.ok(c.col >= 0 && c.col + c.w <= COLS, `${id} leaves the grid`);
    assert.ok(c.row >= 0 && c.h >= 2, `${id} has no height`);
  }
}

test("start layout: the default board packs in reading order without overlaps", () => {
  const cards = cardsOf(null, IDS, SPAN, MEASURED);
  noOverlaps(cards);
  inside(cards);
  assert.deepEqual([cards.hero.row, cards.hero.w], [0, 3]);
  assert.equal(cards.sessions.row, 6);
  assert.equal(cards.recent.row, 16);
  assert.equal(cards.recent.col, 0);
  assert.equal(cards.theme.col, 2);
  assert.equal(cards.theme.row, 16);
  // The background goes under the shorter column, the theme's.
  assert.equal(cards.background.col, 2);
  assert.equal(cards.background.row, 23);
});

test("start layout: compaction floats every card up within its own columns", () => {
  const cards = compact({
    a: { col: 0, row: 9, w: 1, h: 4, fit: true },
    b: { col: 1, row: 30, w: 2, h: 3, fit: true },
    c: { col: 0, row: 40, w: 3, h: 2, fit: true },
  });
  assert.equal(cards.a.row, 0);
  assert.equal(cards.b.row, 0);
  assert.equal(cards.c.row, 4);
});

test("start layout: dropping a card pushes the ones under it down and keeps its column", () => {
  const start = cardsOf(null, IDS, SPAN, MEASURED);
  const moved = place(start, "theme", { col: 0, row: 0 });
  noOverlaps(moved);
  inside(moved);
  assert.equal(moved.theme.col, 0);
  assert.equal(moved.theme.row, 0);
  assert.ok(moved.hero.row >= moved.theme.h, "the hero was not pushed below the dropped card");
});

test("start layout: resizing clamps to the grid and marks the card fixed", () => {
  const start = cardsOf(null, IDS, SPAN, MEASURED);
  const resized = place(start, "recent", { w: 3, h: 14, fit: false });
  noOverlaps(resized);
  assert.equal(resized.recent.w, 3);
  assert.equal(resized.recent.h, 14);
  assert.equal(resized.recent.fit, false);
  const stored = layoutValue(resized);
  const back = cardsOf(stored, IDS, SPAN, MEASURED);
  assert.equal(back.recent.h, 14, "a fixed height survives a reload");
  assert.equal(back.theme.h, MEASURED.theme, "a fit card takes its measured height");
});

test("start layout: a stored layout missing a card puts it below the others", () => {
  const stored = layoutValue(cardsOf(null, ["hero", "sessions"], SPAN, MEASURED));
  const cards = cardsOf(stored, IDS, SPAN, MEASURED);
  noOverlaps(cards);
  for (const id of ["recent", "theme", "background"]) assert.ok(cards[id], `${id} is missing`);
});

test("start layout: garbage in storage gives the default board", () => {
  for (const junk of [null, 42, "x", { version: 99 }, { version: 1, cards: "no" }]) {
    const cards = cardsOf(junk, IDS, SPAN, MEASURED);
    noOverlaps(cards);
    inside(cards);
  }
  const fixed = clampCell({ col: 9, row: -3, w: 7, h: 0 });
  assert.deepEqual(fixed, { col: 0, row: 0, w: 3, h: 2, fit: true });
});

test("start layout: Alt+Up / Alt+Down swap with the neighbour in the same column", () => {
  const start = cardsOf(null, IDS, SPAN, MEASURED);
  const swapped = swapVertical(start, "background", -1);
  noOverlaps(swapped);
  assert.ok(swapped.background.row < swapped.theme.row);
  assert.deepEqual(swapVertical(start, "hero", -1), start, "nothing above the top card");
});

test("start layout: auto arrange restores the default order at fit heights", () => {
  const messy = place(place(cardsOf(null, IDS, SPAN, MEASURED), "background", { col: 0, row: 0 }), "recent", { w: 1, h: 30, fit: false });
  const arranged = autoArrange(IDS, SPAN, MEASURED);
  noOverlaps(arranged);
  assert.notDeepEqual(arranged, messy);
  assert.deepEqual(arranged, cardsOf(null, IDS, SPAN, MEASURED));
  assert.ok(Object.values(arranged).every((c) => c.fit));
  assert.equal(rowsFor(100), 6);
});

test("start screen: its settings are sanitised and live in the app settings", () => {
  assert.deepEqual(sanitizeStartScreen(null), DEFAULT_START_SCREEN);
  assert.deepEqual(sanitizeStartScreen("junk"), DEFAULT_START_SCREEN);
  const prefs = sanitizeStartScreen({ background: "mergeFlow", speed: 1234, shuffleSec: 2, cardOpacity: 3, layout: [] });
  assert.equal(prefs.background, "mergeFlow");
  assert.equal(prefs.speed, 300);
  assert.equal(prefs.shuffleSec, 5);
  assert.equal(prefs.cardOpacity, 20);
  assert.equal(prefs.layout, null);
  // A background that was removed (the old "plain") falls back to the default.
  assert.equal(sanitizeStartScreen({ background: "plain" }).background, DEFAULT_START_SCREEN.background);
  assert.equal(sanitizeStartScreen({ speed: 47 }).speed, 50);
  assert.equal(sanitizeStartScreen({ speed: -5 }).speed, 0);
  assert.equal(sanitizeStartScreen({ cardOpacity: 101 }).cardOpacity, 100);
  // Reduced motion never stops it: no saved speed means a slower default, a saved one wins.
  assert.equal(effectiveSpeed({ speed: null }, true), REDUCED_MOTION_SPEED);
  assert.ok(REDUCED_MOTION_SPEED > 0);
  assert.equal(effectiveSpeed({ speed: null }, false), 100);
  assert.equal(effectiveSpeed({ speed: 0 }, false), 0);
  assert.equal(effectiveSpeed({ speed: 200 }, true), 200);
  // Part of the app settings, with defaults and validation.
  assert.deepEqual(defaultSettings().startScreen, DEFAULT_START_SCREEN);
  const stored = sanitize({ ...defaultSettings(), startScreen: { background: "aurora", speed: 130, cardOpacity: 55 } });
  assert.equal(stored.startScreen.background, "aurora");
  assert.equal(stored.startScreen.speed, 130);
  assert.equal(stored.startScreen.cardOpacity, 55);
  assert.deepEqual(sanitize({ ...defaultSettings(), startScreen: undefined }).startScreen, DEFAULT_START_SCREEN);
});

test("panels: the start screen has no panels and no rails, and keeps the saved state", async () => {
  const { panelSwitches, visiblePanels } = await import("../src/panelLayout.ts");
  const all = { showLeftPanel: true, showRightPanel: true, showLogPanel: true, showTerminalPanel: true };
  const none = { showLeftPanel: false, showRightPanel: false, showLogPanel: false, showTerminalPanel: false };
  assert.deepEqual(panelSwitches(null), { left: false, right: false, bottom: false });
  assert.deepEqual(visiblePanels(null, all), { left: false, leftRail: false, right: false, rightRail: false, bottom: false });
  assert.deepEqual(visiblePanels(undefined, none), { left: false, leftRail: false, right: false, rightRail: false, bottom: false });
  // Back on a tab, the same saved settings bring the panels back as they were.
  assert.deepEqual(visiblePanels("merge", all), { left: true, leftRail: false, right: true, rightRail: false, bottom: true });
  assert.deepEqual(visiblePanels("merge", none), { left: false, leftRail: true, right: false, rightRail: true, bottom: false });
  assert.deepEqual(panelSwitches("compare"), { left: true, right: false, bottom: true });
  assert.deepEqual(visiblePanels("directory", { ...none, showTerminalPanel: true }), { left: false, leftRail: true, right: false, rightRail: false, bottom: true });
});

test("panels: the main window with no tab open has the session and bottom panels, no merge panel", async () => {
  const { panelKind, panelSwitches, visiblePanels } = await import("../src/panelLayout.ts");
  assert.equal(panelKind(true, undefined), null);
  assert.equal(panelKind(true, "merge"), null);
  assert.equal(panelKind(false, "merge"), "merge");
  const empty = panelKind(false, undefined);
  assert.deepEqual(panelSwitches(empty), { left: true, right: false, bottom: true });
  const shown = visiblePanels(empty, { showLeftPanel: true, showRightPanel: true, showLogPanel: true, showTerminalPanel: false });
  assert.deepEqual(shown, { left: true, leftRail: false, right: false, rightRail: false, bottom: true });
});

test("start button: toggles the start screen and the main window, with and without tabs", async () => {
  const { hideStartScreen, isOnStartScreen, showStartScreen, toggleStartScreen } = await import("../src/startScreen.ts");
  hideStartScreen();

  // No tab: the start screen by default, and the button swaps it for the main window.
  assert.equal(isOnStartScreen(false), true);
  toggleStartScreen(false);
  assert.equal(isOnStartScreen(false), false);
  toggleStartScreen(false);
  assert.equal(isOnStartScreen(false), true);

  // Opening something from the main window shows it, and the tabs take over again.
  toggleStartScreen(false);
  assert.equal(isOnStartScreen(true), false);
  hideStartScreen();

  // A tab open: the work by default, and the button brings the start screen over it.
  assert.equal(isOnStartScreen(true), false);
  toggleStartScreen(true);
  assert.equal(isOnStartScreen(true), true);
  toggleStartScreen(true);
  assert.equal(isOnStartScreen(true), false);

  // Closing the last tab lands on the start screen, not on an empty main window.
  assert.equal(isOnStartScreen(false), true);

  showStartScreen();
  hideStartScreen();
  assert.equal(isOnStartScreen(false), true);
});

test("start screen: exactly 20 backgrounds, each with an icon and Korean and English names", async () => {
  const { BACKGROUND_KINDS, BACKGROUND_ICONS } = await import("../src/startBackground.ts");
  const { translate } = await import("../core/i18n.ts");
  const { hasIcon } = await import("../src/icons.tsx").catch(() => ({ hasIcon: null }));
  assert.equal(BACKGROUND_KINDS.length, 20, `${BACKGROUND_KINDS.length} backgrounds`);
  assert.equal(new Set(BACKGROUND_KINDS).size, BACKGROUND_KINDS.length, "duplicate background ids");
  const names = { ko: new Set(), en: new Set() };
  for (const kind of BACKGROUND_KINDS) {
    assert.ok(BACKGROUND_ICONS[kind], `${kind} has no icon`);
    if (hasIcon) assert.ok(hasIcon(BACKGROUND_ICONS[kind]), `${kind}: no icon called ${BACKGROUND_ICONS[kind]}`);
    for (const language of ["ko", "en"]) {
      const name = translate(language, `start.bg.${kind}`);
      const hint = translate(language, `start.bg.${kind}.hint`);
      assert.notEqual(name, `start.bg.${kind}`, `${kind} has no ${language} name`);
      assert.notEqual(hint, `start.bg.${kind}.hint`, `${kind} has no ${language} description`);
      names[language].add(name);
    }
  }
  assert.equal(names.ko.size, BACKGROUND_KINDS.length, "two backgrounds share a Korean name");
  assert.equal(names.en.size, BACKGROUND_KINDS.length, "two backgrounds share an English name");
});
