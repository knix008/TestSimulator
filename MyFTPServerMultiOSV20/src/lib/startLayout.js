// Start-page card layout: explicit positions on a 3-column grid with 20 px
// rows. Each card is { col, row, w, h, fit } — col 0..2, w 1..3 columns,
// row / h in rows; fit = the height follows the content (h is then the last
// measured value). Kept in session.startBackground.layout as
// { version: 2, cards: { <id>: { col, row, w, h, fit } } }.
//
// Rules (vertical compaction, like react-grid-layout compactType 'vertical'):
// after every move, resize, hide / show and on load, each card floats up as
// far as it can in its own columns without overlapping. A dropped card keeps
// the column it was dropped in; cards it overlaps are pushed down and then
// compacted. autoArrange() packs the cards masonry-style in reading order.

export const COLS = 3;
export const ROW = 20;
export const GAP = 14;

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

/**
 * Masonry placement in the given order (used for the default layout and to
 * migrate the old { order, span, height } layout): each card goes to the
 * left-most columns whose top is lowest.
 */
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

/**
 * Removes overlaps by pushing cards down. `pinned` (the card being dropped
 * or resized) keeps its place; the others are taken top to bottom and each
 * goes down just far enough to clear the cards already placed.
 */
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
 * The card positions from a saved layout. `ids` = all card ids in the
 * default order, `defaultSpan` their default widths, `measured` the rows of
 * the fit cards as last measured (missing: `fallbackRows`).
 */
export function cardsOf(saved, ids, defaultSpan, measured = {}, fallbackRows = 8) {
  const s = saved || {};
  const fitRows = (id) => measured[id] || fallbackRows;
  let cards;
  if (s.version === 2 && s.cards && typeof s.cards === 'object') {
    cards = {};
    const present = ids.filter((id) => s.cards[id]);
    for (const id of present) cards[id] = fix(s.cards[id]);
    // A card added in a later version goes below the others.
    let bottom = Math.max(0, ...Object.values(cards).map((c) => c.row + c.h));
    for (const id of ids) {
      if (cards[id]) continue;
      cards[id] = { col: 0, row: bottom, w: clamp(defaultSpan[id] || 1, 1, COLS), h: fitRows(id), fit: true };
      bottom += cards[id].h;
    }
  } else {
    // Old layout (order + span + height in px) or none: pack in order.
    const order = (s.order || []).filter((id) => ids.includes(id));
    for (const id of ids) if (!order.includes(id)) order.push(id);
    const span = { ...defaultSpan, ...(s.span || {}) };
    const height = s.height || {};
    cards = pack(order, (id) => span[id], (id) => (height[id] ? { h: rowsFor(height[id]), fit: false } : { h: fitRows(id), fit: true }));
  }
  // Fit cards take their measured height.
  for (const id of Object.keys(cards)) if (cards[id].fit && measured[id]) cards[id] = { ...cards[id], h: measured[id] };
  return compact(resolve(cards, null));
}

/** The live / final result of putting card `id` at `target`: pushed down, then compacted. */
export function place(cards, id, target) {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));
}

/**
 * Automatic arrangement: full-width cards keep the reading order at the top,
 * then each card goes to the currently shortest column(s), at its fit height.
 */
export function autoArrange(ids, defaultSpan, measured = {}, fallbackRows = 8) {
  return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })));
}

/** Alt+↑ / Alt+↓: swap with the nearest card above / below that shares a column. */
export function swapVertical(cards, id, dir) {
  const c = cards[id];
  if (!c) return cards;
  const shares = (o) => o.col < c.col + c.w && c.col < o.col + o.w;
  const others = Object.keys(cards).filter((k) => k !== id && shares(cards[k]));
  const near = others
    .filter((k) => (dir < 0 ? cards[k].row < c.row : cards[k].row > c.row))
    .sort((a, b) => (dir < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row))[0];
  if (!near) return cards;
  const o = cards[near];
  const next = { ...cards };
  if (dir < 0) { next[id] = { ...c, row: o.row }; next[near] = { ...o, row: o.row + c.h }; }
  else { next[near] = { ...o, row: c.row }; next[id] = { ...c, row: c.row + o.h }; }
  return compact(resolve(next, id));
}

/** What goes into settings.startBackground.layout. */
export function layoutValue(cards) {
  const out = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, ...(c.fit ? { fit: true } : { fit: false }) };
  return { version: 2, cards: out };
}

export const layoutKey = (cards) => Object.keys(cards).sort().map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`).join('|');

export const clampCard = (c) => fix(c);
