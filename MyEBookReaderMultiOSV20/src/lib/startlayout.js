// Where the start screen's cards sit when the user has moved or resized them.
//
// `null` is the automatic layout (the CSS grid). Once a card is moved or
// resized, every card gets its own box — { x, y, w, h } in px from the top-left
// of the board — and is drawn there until "Auto arrange" goes back to null.

export const START_CARDS = ['hero', 'begin', 'library', 'bg'];
export const MIN_CARD_W = 220;
export const MIN_CARD_H = 110;
const GAP = 16;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/** A saved layout, or null when it is missing, partial or damaged. */
export function normalizeStartLayout(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const id of START_CARDS) {
    const b = raw[id];
    if (!b || typeof b !== 'object') return null;
    const box = { x: num(b.x), y: num(b.y), w: num(b.w), h: num(b.h) };
    if (Object.values(box).some((v) => Number.isNaN(v))) return null;
    out[id] = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      w: Math.max(MIN_CARD_W, box.w),
      h: Math.max(MIN_CARD_H, box.h),
    };
  }
  return out;
}

/** The boxes of the cards as they are drawn now (the automatic grid), relative to the board. */
export function measureLayout(boardRect, cardRects) {
  const out = {};
  for (const id of START_CARDS) {
    const r = cardRects[id];
    if (!r) return null;
    out[id] = {
      x: Math.round(r.left - boardRect.left),
      y: Math.round(r.top - boardRect.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }
  return out;
}

/** Keeps every card inside a board `width` wide (the window may have shrunk). */
export function clampLayout(layout, width) {
  if (!layout) return layout;
  const out = {};
  for (const id of START_CARDS) {
    const b = layout[id];
    const w = Math.max(MIN_CARD_W, Math.min(b.w, Math.max(MIN_CARD_W, width)));
    out[id] = { ...b, w, x: Math.max(0, Math.min(b.x, Math.max(0, width - w))) };
  }
  return out;
}

/** One card moved by (dx, dy), kept inside the board. */
export function moveCard(layout, id, dx, dy, width) {
  const b = layout[id];
  const x = Math.max(0, Math.min(b.x + dx, Math.max(0, width - b.w)));
  const y = Math.max(0, b.y + dy);
  return { ...layout, [id]: { ...b, x: Math.round(x), y: Math.round(y) } };
}

/** One card resized from its bottom-right corner by (dw, dh). */
export function resizeCard(layout, id, dw, dh, width) {
  const b = layout[id];
  const w = Math.max(MIN_CARD_W, Math.min(b.w + dw, Math.max(MIN_CARD_W, width - b.x)));
  const h = Math.max(MIN_CARD_H, b.h + dh);
  return { ...layout, [id]: { ...b, w: Math.round(w), h: Math.round(h) } };
}

/** How tall the board must be to hold every card, plus a gap below the last. */
export function boardHeight(layout) {
  if (!layout) return 0;
  return Math.max(...START_CARDS.map((id) => layout[id].y + layout[id].h)) + GAP;
}
