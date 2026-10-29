// Start-page card board (src/ui/startlayout.js): placement on the 3-column
// grid, pushing down, compaction, swapping and the pixel / cell maths the
// gliding drag and resize use.
import test from "node:test";
import assert from "node:assert/strict";
import { COLS, ROW, GAP, overlaps, cardsOf, place, compact, autoArrange, swapVertical, layoutValue, boxOf, cellAt, spanFor, rowsFor } from "../../src/ui/startlayout.js";

const IDS = ["hero", "banner", "templates", "recent", "side", "help", "samples"];
const SPAN = { hero: 3, banner: 3, templates: 3, recent: 2, side: 1, help: 2, samples: 3 };
const noOverlap = (cards) => { const v = Object.values(cards); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (overlaps(v[i], v[j])) return false; return true; };

test("default layout: full-width cards in reading order, recent and help beside the background", () => {
  const c = cardsOf(null, IDS, SPAN, { hero: 6, banner: 3, templates: 14, recent: 8, side: 16, help: 8, samples: 30 });
  assert.ok(noOverlap(c));
  assert.equal(c.hero.row, 0);
  assert.equal(c.banner.row, 6);
  assert.equal(c.templates.row, 9);
  assert.deepEqual([c.recent.col, c.recent.w, c.side.col, c.side.w], [0, 2, 2, 1]);
  assert.equal(c.help.col, 0);
  assert.equal(c.help.row, c.recent.row + 8, "help goes under recent, next to the tall background card");
  assert.ok(c.samples.row >= c.side.row + c.side.h, "samples go below everything");
});

test("a dropped card keeps its cell and the ones it covers move down without overlapping", () => {
  const c = cardsOf(null, IDS, SPAN, { hero: 6, banner: 3, templates: 14, recent: 8, side: 16, help: 8, samples: 30 });
  const n = place(c, "side", { col: 0, row: 0 });
  assert.ok(noOverlap(n));
  assert.deepEqual([n.side.col, n.side.row], [0, 0]);
  assert.ok(n.hero.row >= n.side.h, "the full-width hero is pushed below it");
});

test("compaction floats cards up in their own columns", () => {
  const c = compact({ a: { col: 0, row: 10, w: 1, h: 4 }, b: { col: 1, row: 30, w: 2, h: 4 }, c: { col: 0, row: 40, w: 3, h: 2 } });
  assert.deepEqual([c.a.row, c.b.row, c.c.row], [0, 0, 4]);
});

test("resizing a card wider pushes its neighbour down; fit is turned off", () => {
  const c = cardsOf(null, IDS, SPAN, { hero: 6, banner: 3, templates: 14, recent: 8, side: 16, help: 8, samples: 30 });
  const n = place(c, "recent", { w: 3, h: 12, fit: false });
  assert.ok(noOverlap(n));
  assert.equal(n.recent.w, 3);
  assert.equal(n.recent.fit, false);
  assert.ok(n.side.row >= n.recent.row + 12);
});

test("Alt+↑ / Alt+↓ swap with the neighbour above / below", () => {
  const c = { a: { col: 0, row: 0, w: 3, h: 4 }, b: { col: 0, row: 4, w: 3, h: 6 } };
  const up = swapVertical(c, "b", -1);
  assert.deepEqual([up.b.row, up.a.row], [0, 6]);
  assert.deepEqual(swapVertical(c, "a", -1), c, "nothing above: unchanged");
});

test("auto arrange packs every card without overlaps; saved layouts round-trip", () => {
  const measured = { hero: 6, banner: 3, templates: 14, recent: 8, side: 16, help: 8, samples: 30 };
  const a = autoArrange(IDS, SPAN, measured);
  assert.ok(noOverlap(a));
  const back = cardsOf(layoutValue(a), IDS, SPAN, measured);
  for (const id of IDS) assert.deepEqual([back[id].col, back[id].row, back[id].w, back[id].h], [a[id].col, a[id].row, a[id].w, a[id].h]);
});

test("a card added in a later version goes below the saved ones", () => {
  const saved = layoutValue(autoArrange(["hero", "recent"], SPAN, { hero: 6, recent: 8 }));
  const c = cardsOf(saved, ["hero", "recent", "samples"], SPAN, { hero: 6, recent: 8, samples: 10 });
  assert.ok(noOverlap(c));
  assert.ok(c.samples.row >= 6);
});

test("pixel boxes, cells and spans agree with each other", () => {
  const width = 1200;
  const colW = (width - GAP * (COLS - 1)) / COLS;
  const b = boxOf({ col: 1, row: 3, w: 2, h: 5 }, width);
  assert.equal(b.x, colW + GAP);
  assert.equal(b.y, 3 * ROW);
  assert.equal(b.w, 2 * colW + GAP);
  assert.equal(b.h, 5 * ROW - GAP);
  assert.deepEqual(cellAt(b.x + 10, b.y + 4, 2, width), { col: 1, row: 3 });
  assert.deepEqual(cellAt(5000, -50, 2, width), { col: 1, row: 0 }, "clamped to the board");
  assert.deepEqual(spanFor(b.w, b.h, 1, width), { w: 2, h: 5 });
  assert.deepEqual(spanFor(9999, 10, 1, width), { w: 2, h: 4 }, "no wider than the columns left, at least 4 rows");
  assert.equal(rowsFor(186), 10);
});

test("every background kind draws on a canvas (and none hides its own drawing method)", async () => {
  globalThis.window = globalThis.window || { devicePixelRatio: 1 };
  globalThis.document = globalThis.document || { addEventListener() {}, removeEventListener() {}, hidden: false };
  const { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, ANIMATION_NAMES } = await import("../../src/ui/startbg.js");
  const { ICON_NAMES } = await import("../../src/ui/icons.js");
  const palette = () => ({ bg: [20, 24, 30], accent: [76, 141, 255], text: [228, 233, 240], muted: [140, 150, 165], danger: [255, 90, 90], ok: [80, 220, 120], warn: [245, 196, 81], dark: true });
  for (const kind of ANIMATION_KINDS) {
    let draws = 0;
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { if (/^(fill|stroke|fillRect|strokeRect|fillText)$/.test(k)) draws++; void a; return { addColorStop() {} }; }), set: (t, k, v) => { t[k] = v; return true; } });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1400, height: 800 }), width: 0, height: 0 };
    const a = new AnimatedBackground(canvas, { kind, colors: palette });
    assert.equal(a.kind, kind);
    for (let i = 0; i < 90; i++) { a.time += 1 / 30; a.draw(1 / 30); }
    if (kind === "model3d") continue; // the live 3D view draws this one
    assert.equal(typeof a[kind], "function", `${kind}: its drawing method was overwritten`);
    assert.ok(draws > 90 * 3, `${kind} draws (${draws})`);
    assert.ok(ICON_NAMES.includes(ANIMATION_ICONS[kind]), `${kind} has a real icon`);
    assert.ok(ANIMATION_NAMES[kind] && ANIMATION_NAMES[kind].length === 2, `${kind} has a name and a description`);
  }
});
