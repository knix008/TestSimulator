// The start screen's card board, the same rules as My Git Master (src/startLayout.ts there).
export const COLS = 3;
export const ROW = 20;
export const GAP = 14;
export const LAYOUT_VERSION = 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const rowsFor = (px) => Math.max(2, Math.ceil((px + GAP) / ROW));
export function overlaps(a, b) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
}
export function clampCell(value) {
  const c = value ?? {};
  const w = clamp(Math.round(Number(c.w) || 1), 1, COLS);
  return {
    col: clamp(Math.round(Number(c.col) || 0), 0, COLS - w),
    row: Math.max(0, Math.round(Number(c.row) || 0)),
    w,
    h: Math.max(2, Math.round(Number(c.h) || 2)),
    fit: c.fit !== false
  };
}
export function pack(order, widthOf, heightOf) {
  const top = new Array(COLS).fill(0);
  const out = {};
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
export function resolve(cards, pinned) {
  const ids = Object.keys(cards).sort((a, b) => a === pinned ? -1 : b === pinned ? 1 : cards[a].row - cards[b].row || cards[a].col - cards[b].col);
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
  const stored = saved && typeof saved === "object" ? saved : null;
  let cards;
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
export function place(cards, id, target) {
  return compact(resolve({ ...cards, [id]: { ...cards[id], ...target } }, id));
}
export function autoArrange(ids, defaultSpan, measured = {}, fallbackRows = 8) {
  return compact(pack(ids, (id) => defaultSpan[id] || 1, (id) => ({ h: measured[id] || fallbackRows, fit: true })));
}
export function swapVertical(cards, id, direction) {
  const c = cards[id];
  if (!c) return cards;
  const shares = (o2) => o2.col < c.col + c.w && c.col < o2.col + o2.w;
  const near = Object.keys(cards).filter((k) => k !== id && shares(cards[k])).filter((k) => direction < 0 ? cards[k].row < c.row : cards[k].row > c.row).sort((a, b) => direction < 0 ? cards[b].row - cards[a].row : cards[a].row - cards[b].row)[0];
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
export function layoutValue(cards) {
  const out = {};
  for (const [id, c] of Object.entries(cards)) out[id] = { col: c.col, row: c.row, w: c.w, h: c.h, fit: c.fit };
  return { version: LAYOUT_VERSION, cards: out };
}
export const layoutKey = (cards) => Object.keys(cards).sort().map((id) => `${id}:${cards[id].col},${cards[id].row},${cards[id].w},${cards[id].h}`).join("|");
