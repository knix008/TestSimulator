// Start-page cards: three columns, snapped to rows, never overlapping.
export const COLS = 3;
export const ROW = 20;
export const GAP = 14;
export const LAYOUT_VERSION = 2;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));

export const overlaps = (a, b) => a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;

export function clampCell(value) {
  const c = value ?? {};
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return { col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w), row: Math.max(0, Math.round(Number(c.row) || 0)), w, h: Math.max(2, Math.round(Number(c.h) || 2)), fit: c.fit !== false };
}

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

function resolve(cards, pinned) {
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
  return compact(resolve(cards, null));
}

export const place = (cards, id, target) => compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));

export const autoArrange = (ids, defaultSpan, measured = {}, fallbackRows = 8) => compact(pack([...ids], (id) => defaultSpan[id] || 1, (id) => measured[id] || fallbackRows));

export function layoutValue(cards) {
  const out = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  return { version: LAYOUT_VERSION, cards: out };
}
