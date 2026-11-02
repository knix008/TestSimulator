/**
 * The start screen's card board.
 *
 * Every card has an explicit cell on a three-column grid of 20 px rows:
 * `{ col, row, w, h, fit }` — `col` 0..2, `w` 1..3 columns, `row` and `h` in rows,
 * and `fit` when the height follows the content (then `h` is the last measured
 * value). What is stored is `{ version: 1, cards: { <id>: cell } }`.
 *
 * The rules are vertical compaction, the way a dashboard grid behaves: after every
 * move, resize and on load each card floats up as far as it can within its own
 * columns without overlapping another. A dropped card keeps the column it was
 * dropped in; the cards it lands on are pushed down and then compacted.
 * `autoArrange` packs the cards masonry-style in reading order.
 *
 * Pure: nothing here touches the DOM, so it is tested under plain Node.
 */

export const COLS = 3;
export const ROW = 20;
export const GAP = 14;
export const LAYOUT_VERSION = 1;

export type Cell = { col: number; row: number; w: number; h: number; fit: boolean };
export type Cells = Record<string, Cell>;
export type SavedLayout = { version: number; cards: Record<string, Partial<Cell>> };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Rows a card `px` pixels tall needs, the gap below it included. */
export const rowsFor = (px: number): number => Math.max(2, Math.ceil((px + GAP) / ROW));

export function overlaps(a: Cell, b: Cell): boolean {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
}

/** A stored cell made safe: whole numbers, inside the grid, never zero-sized. */
export function clampCell(value: Partial<Cell> | null | undefined): Cell {
  const c = value ?? {};
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return {
    col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w),
    row: Math.max(0, Math.round(Number(c.row) || 0)),
    w,
    h: Math.max(2, Math.round(Number(c.h) || 2)),
    fit: c.fit !== false,
  };
}

/**
 * Masonry placement in the given order: each card goes to the left-most run of
 * columns whose top is lowest.
 */
export function pack(
  order: string[],
  widthOf: (id: string) => number,
  heightOf: (id: string) => { h: number; fit: boolean },
): Cells {
  const top = new Array<number>(COLS).fill(0);
  const out: Cells = {};
  for (const id of order) {
    const w = clamp(Math.round(widthOf(id) || 1), 1, COLS);
    let best = 0;
    let bestRow = Infinity;
    for (let c = 0; c + w <= COLS; c += 1) {
      const row = Math.max(...top.slice(c, c + w));
      if (row < bestRow) {
        bestRow = row;
        best = c;
      }
    }
    const height = heightOf(id);
    out[id] = { col: best, row: bestRow, w, h: height.h, fit: height.fit };
    for (let c = best; c < best + w; c += 1) top[c] = bestRow + height.h;
  }
  return out;
}

/**
 * Removes overlaps by pushing cards down. `pinned` (the card being dropped or
 * resized) keeps its place; the others are taken top to bottom and each goes down
 * just far enough to clear the cards already placed.
 */
export function resolve(cards: Cells, pinned: string | null): Cells {
  const ids = Object.keys(cards).sort((a, b) =>
    a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col);
  const placed: Cell[] = [];
  const out: Cells = {};
  for (const id of ids) {
    const c = { ...cards[id] };
    if (id !== pinned) {
      for (let guard = 0; guard < 200; guard += 1) {
        const hit = placed.filter((p) => overlaps(c, p));
        if (!hit.length) break;
        c.row = Math.max(...hit.map((p) => p.row + p.h));
      }
    }
    placed.push(c);
    out[id] = c;
  }
  return out;
}

/** Every card moves up as far as it can within its own columns. */
export function compact(cards: Cells): Cells {
  const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col);
  const placed: Cell[] = [];
  const out: Cells = {};
  for (const id of ids) {
    const c = { ...cards[id] };
    let row = 0;
    for (const p of placed) if (p.col < c.col + c.w && c.col < p.col + p.w) row = Math.max(row, p.row + p.h);
    c.row = row;
    placed.push(c);
    out[id] = c;
  }
  return out;
}

/**
 * The cells to draw, from what was saved. `ids` are the cards in their default
 * order, `defaultSpan` their default widths and `measured` the rows of the fit
 * cards as last measured (missing ones use `fallbackRows`). A card the saved
 * layout does not know — one added in a later version — goes below the others.
 */
export function cardsOf(
  saved: unknown,
  ids: string[],
  defaultSpan: Record<string, number>,
  measured: Record<string, number> = {},
  fallbackRows = 8,
): Cells {
  const rows = (id: string) => measured[id] || fallbackRows;
  const stored = saved && typeof saved === "object" ? (saved as Partial<SavedLayout>) : null;
  let cards: Cells;
  if (stored && stored.version === LAYOUT_VERSION && stored.cards && typeof stored.cards === "object") {
    cards = {};
    for (const id of ids) if (stored.cards[id]) cards[id] = clampCell(stored.cards[id]);
    let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
    for (const id of ids) {
      if (cards[id]) continue;
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: rows(id), fit: true };
      bottom += cards[id].h;
    }
  } else {
    cards = pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: rows(id), fit: true }));
  }
  for (const id of Object.keys(cards)) {
    if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
  }
  return compact(resolve(cards, null));
}

/** Card `id` put at `target`: the cards under it pushed down, then everything compacted. */
export function place(cards: Cells, id: string, target: Partial<Cell>): Cells {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));
}

/** Auto arrange: masonry in reading order, every card back at its fit height. */
export function autoArrange(
  ids: string[],
  defaultSpan: Record<string, number>,
  measured: Record<string, number> = {},
  fallbackRows = 8,
): Cells {
  return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })));
}

/** Alt+Up / Alt+Down: swap with the nearest card above or below that shares a column. */
export function swapVertical(cards: Cells, id: string, direction: number): Cells {
  const c = cards[id];
  if (!c) return cards;
  const shares = (o: Cell) => o.col < c.col + c.w && c.col < o.col + o.w;
  const near = Object.keys(cards)
    .filter((k) => k !== id && shares(cards[k]))
    .filter((k) => (direction < 0 ? cards[k].row < c.row : cards[k].row > c.row))
    .sort((a, b) => (direction < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row))[0];
  if (!near) return cards;
  const o = cards[near];
  const next = { ...cards };
  if (direction < 0) {
    next[id] = { ...c, row: o.row };
    next[near] = { ...o, row: o.row + c.h };
  } else {
    next[near] = { ...o, row: c.row };
    next[id] = { ...c, row: c.row + o.h };
  }
  return compact(resolve(next, id));
}

/** What is stored. */
export function layoutValue(cards: Cells): SavedLayout {
  const out: Record<string, Cell> = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  return { version: LAYOUT_VERSION, cards: out };
}

/** A string that changes whenever any card moves or changes size. */
export const layoutKey = (cards: Cells): string =>
  Object.keys(cards).sort().map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`).join("|");
