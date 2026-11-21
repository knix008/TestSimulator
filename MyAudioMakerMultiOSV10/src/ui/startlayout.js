// The start page's card board: three columns, cards snapped to rows, never overlapping.
// Pure: the DOM side is ui/startboard.js. The saved form lives in settings.startLayout.
export const COLS = 3;
export const ROW = 20;
export const GAP = 14;
// Raised when the default arrangement changes: an older saved one starts over once.
export const LAYOUT_VERSION = 2;
// Cards that cannot be moved or resized: the program name and information card is always the
// first row, across every column, as tall as its content. No card can be put above it.
export const FIXED_CARDS = new Set(['hero']);
const isFixed = (id) => FIXED_CARDS.has(id);
const fixedCell = (h) => ({ col: 0, row: 0, w: COLS, h, fit: true });
/** Fixed cards first, then by row and column. */
const order = (cards) => (a, b) => (isFixed(b) - isFixed(a)) || cards[a].row - cards[b].row || cards[a].col - cards[b].col;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));

export const overlaps = (a, b) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

/** A cell made valid: inside the columns, at least two rows tall. */
export function clampCell(value) {
  const c = value ?? {};
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return { col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w), row: Math.max(0, Math.round(Number(c.row) || 0)), w, h: Math.max(2, Math.round(Number(c.h) || 2)), fit: c.fit !== false };
}

/** The cards in order, each put in the columns where it can start highest. */
function pack(order, widthOf, heightOf) {
  const top = new Array(COLS).fill(0);
  const out = {};
  for (const id of order) {
    const w = clamp(Math.round(widthOf(id) || 1), 1, COLS);
    let best = 0;
    let bestRow = Infinity;
    for (let c = 0; c + w <= COLS; c += 1) {
      const row = Math.max(...top.slice(c, c + w));
      if (row < bestRow) { bestRow = row; best = c; }
    }
    out[id] = { col: best, row: bestRow, w, h: heightOf(id), fit: true };
    for (let c = best; c < best + w; c += 1) top[c] = bestRow + out[id].h;
  }
  return out;
}

/** Pushes overlapping cards down; fixed cards never move, the pinned card (the one being moved) moves only off them. */
function resolve(cards, pinned) {
  const ids = Object.keys(cards).sort((a, b) => (isFixed(b) - isFixed(a)) || (a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col));
  const placed = [];
  const out = {};
  for (const id of ids) {
    const c = { ...cards[id] };
    if (!isFixed(id)) {
      for (let guard = 0; guard < 200; guard += 1) {
        // Fixed cards come first and the pinned one next, so the pinned card only steps off fixed cards.
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

/** Moves every card up as far as the cards above it allow. */
export function compact(cards) {
  const ids = Object.keys(cards).sort(order(cards));
  const placed = [];
  const out = {};
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

/** The board from the saved layout (or the default), for these cards; fit cards take their measured heights. */
export function cardsOf(saved, ids, defaultSpan, measured = {}, fallbackRows = 8) {
  const rows = (id) => measured[id] || fallbackRows;
  let cards;
  if (saved && typeof saved === 'object' && saved.version === LAYOUT_VERSION && saved.cards && typeof saved.cards === 'object') {
    cards = {};
    for (const id of ids) if (saved.cards[id]) cards[id] = clampCell(saved.cards[id]);
    let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
    for (const id of ids) {
      if (cards[id]) continue;
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: rows(id), fit: true };
      bottom += cards[id].h;
    }
  } else {
    cards = pack([...ids], (id) => defaultSpan[id] || 1, rows);
  }
  for (const id of Object.keys(cards)) if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
  for (const id of Object.keys(cards)) if (isFixed(id)) cards[id] = fixedCell(measured[id] || cards[id].h);
  return compact(resolve(cards, null));
}

/** The board with one card moved or resized (a fixed card stays as it is). */
export const place = (cards, id, target) => (isFixed(id) ? compact(resolve({ ...cards }, null)) : compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id)));

/** The default arrangement (fixed cards first, at the top). */
export function autoArrange(ids, defaultSpan, measured = {}, fallbackRows = 8) {
  const sorted = [...ids].sort((a, b) => isFixed(b) - isFixed(a));
  const cards = pack(sorted, (id) => (isFixed(id) ? COLS : defaultSpan[id] || 1), (id) => measured[id] || fallbackRows);
  return compact(cards);
}

/** The form saved in the settings. */
export function layoutValue(cards) {
  const out = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  return { version: LAYOUT_VERSION, cards: out };
}
