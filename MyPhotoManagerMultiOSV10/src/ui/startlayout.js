// Start page card layout (the sibling apps' model, MyFTLServer lib/startLayout):
// explicit positions on a 3-column grid of 20 px rows. Each card is
// { col, row, w, h, fit } — col 0..2, w 1..3 columns, row / h in rows; fit = the
// height follows the content (h is then the last measured value). Kept in the
// settings (startScreen.layout) as a JSON string of
// { version: 2, cards: { <id>: { col, row, w, h, fit } } }.
//
// After every move, resize and on load each card floats up as far as it can in
// its own columns without overlapping. A dropped card keeps the cell it was
// dropped in; cards it overlaps are pushed down and then compacted.
// autoArrange() packs the cards masonry-style in reading order.

export const COLS = 3;
export const ROW = 20;
export const GAP = 14;

/** The cards in reading order, with their default width in columns. */
export const START_CARDS = ['begin', 'browse', 'edit', 'tools', 'recent', 'tip', 'scenes', 'speeds'];
export const DEFAULT_SPAN = { begin: 1, browse: 2, edit: 2, tools: 2, recent: 1, tip: 1, scenes: 2, speeds: 1 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Rows needed by a card `px` pixels high (plus the gap below it). */
export const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));

export function overlaps(a, b) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
}

function fix(c) {
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return { col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w), row: Math.max(0, Math.round(Number(c.row) || 0)), w, h: Math.max(2, Math.round(Number(c.h) || 2)), fit: c.fit !== false };
}

/** Masonry placement in the given order: each card goes to the left-most columns whose top is lowest. */
export function pack(order, widthOf, heightOf) {
  const top = new Array(COLS).fill(0);
  const out = {};
  for (const id of order) {
    const w = clamp(widthOf(id) || 1, 1, COLS);
    let best = 0;
    let bestRow = Infinity;
    for (let c = 0; c + w <= COLS; c += 1) {
      const r = Math.max(...top.slice(c, c + w));
      if (r < bestRow) { bestRow = r; best = c; }
    }
    const h = heightOf(id);
    out[id] = { col: best, row: bestRow, w, h: h.h, fit: h.fit };
    for (let c = best; c < best + w; c += 1) top[c] = bestRow + h.h;
  }
  return out;
}

/** Removes overlaps by pushing cards down. `pinned` (the card being dropped or resized) keeps its place. */
export function resolve(cards, pinned) {
  const ids = Object.keys(cards).sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col));
  const placed = [];
  const out = {};
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

/** Every card moves up as far as it can, in its own columns (top to bottom, left to right). */
export function compact(cards) {
  const ids = Object.keys(cards).sort((a, b) => cards[a].row - cards[b].row || cards[a].col - cards[b].col);
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

/**
 * The card positions from a saved layout (a JSON string or an object). `measured`
 * holds the rows of the fit cards as last measured (missing: `fallbackRows`).
 */
export function cardsOf(saved, measured = {}, ids = START_CARDS, defaultSpan = DEFAULT_SPAN, fallbackRows = 8) {
  let s = saved;
  if (typeof s === 'string') {
    try { s = JSON.parse(s); } catch { s = null; }
  }
  s ||= {};
  const fitRows = (id) => measured[id] || fallbackRows;
  let cards;
  if (s.version === 2 && s.cards && typeof s.cards === 'object') {
    cards = {};
    for (const id of ids.filter((k) => s.cards[k])) cards[id] = fix(s.cards[id]);
    // A card added in a later version goes below the others.
    let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
    for (const id of ids) {
      if (cards[id]) continue;
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: fitRows(id), fit: true };
      bottom += cards[id].h;
    }
  } else {
    cards = pack(ids, (id) => defaultSpan[id], (id) => ({ h: fitRows(id), fit: true }));
  }
  for (const id of Object.keys(cards)) if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
  return compact(resolve(cards, null));
}

/** The live / final result of putting card `id` at `target` ({ col, row } or { w, h, fit }): pushed down, then compacted. */
export function place(cards, id, target) {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));
}

/** Automatic arrangement: reading order, each card in the shortest column(s), at its default width and fit height. */
export function autoArrange(measured = {}, ids = START_CARDS, defaultSpan = DEFAULT_SPAN, fallbackRows = 8) {
  return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })));
}

/** Alt+↑ / Alt+↓: swap with the nearest card above / below that shares a column. */
export function swapVertical(cards, id, dir) {
  const c = cards[id];
  if (!c) return cards;
  const shares = (o) => o.col < c.col + c.w && c.col < o.col + o.w;
  const near = Object.keys(cards)
    .filter((k) => k !== id && shares(cards[k]) && (dir < 0 ? cards[k].row < c.row : cards[k].row > c.row))
    .sort((a, b) => (dir < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row))[0];
  if (!near) return cards;
  const o = cards[near];
  const next = { ...cards };
  if (dir < 0) { next[id] = { ...c, row: o.row }; next[near] = { ...o, row: o.row + c.h }; }
  else { next[near] = { ...o, row: c.row }; next[id] = { ...c, row: c.row + o.h }; }
  return compact(resolve(next, id));
}

/** What goes into settings.startScreen.layout. */
export function layoutText(cards) {
  const out = {};
  for (const [id, c] of Object.entries(compact(cards))) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: Boolean(c.fit) };
  return JSON.stringify({ version: 2, cards: out });
}

export const layoutKey = (cards) => Object.keys(cards).sort().map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`).join('|');
