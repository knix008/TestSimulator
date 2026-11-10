// Where the start screen's cards sit when the user has moved or resized them
// (from MyEBookReader V20).
//
// `null` is the automatic layout (the CSS grid). Once a card is moved or
// resized, every card gets its own box — { x, y, w, h } in px from the top-left
// of the board — and is drawn there until "Auto arrange" goes back to null.

// Top to bottom: each card is a full-width band (its contents run across).
export const START_CARDS = ['hero', 'how', 'recent', 'samples', 'engine', 'formats', 'bg'];
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

// ── The grid cards snap to ──
// Twelve columns across the board with GAP between them, and rows ROW px
// apart; a card's edges fall on column and row lines with GAP left free
// between neighbours.
export const GRID_COLS = 12;
export const GRID_ROW = 32;

/** Column pitch (column width + GAP) of a board `width` wide. */
export function columnStep(width) {
  return (width + GAP) / GRID_COLS;
}

/** A box put on the nearest grid lines, at least the minimum size, inside the board. */
export function snapBox(box, width) {
  const step = columnStep(width);
  const minSpan = Math.min(GRID_COLS, Math.ceil((MIN_CARD_W + GAP) / step));
  const span = Math.max(minSpan, Math.min(GRID_COLS, Math.round((box.w + GAP) / step)));
  const col = Math.max(0, Math.min(GRID_COLS - span, Math.round(box.x / step)));
  const minRows = Math.ceil((MIN_CARD_H + GAP) / GRID_ROW);
  const rows = Math.max(minRows, Math.round((box.h + GAP) / GRID_ROW));
  return {
    x: Math.round(col * step),
    y: Math.max(0, Math.round(box.y / GRID_ROW)) * GRID_ROW,
    w: Math.round(span * step - GAP),
    h: rows * GRID_ROW - GAP,
  };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;
}

/**
 * Cards that overlap another are pushed down below it, top to bottom, so
 * nothing covers anything. `fixedId` (the card being placed) stays where it
 * is and the others make way for it.
 */
export function pushAside(layout, fixedId = null) {
  const out = { ...layout };
  const placed = fixedId ? [out[fixedId]] : [];
  const rest = START_CARDS.filter((id) => id !== fixedId)
    .sort((a, b) => out[a].y - out[b].y || out[a].x - out[b].x);
  for (const id of rest) {
    const box = { ...out[id] };
    for (let hit = placed.find((p) => overlaps(box, p)); hit; hit = placed.find((p) => overlaps(box, p))) {
      box.y = hit.y + hit.h + GAP;
    }
    out[id] = box;
    placed.push(box);
  }
  return out;
}

/** Every card on the grid, overlaps pushed apart (the layout a drag starts from). */
export function snapLayout(layout, width) {
  const out = {};
  for (const id of START_CARDS) out[id] = snapBox(layout[id], width);
  return pushAside(out);
}

/**
 * Where a card lands when let go at `box`: its spot on the grid, with the
 * cards in the way pushed down. Worked out from the layout the drag started
 * with, so cards return to their places when the card moves on.
 */
export function placeCard(layout, id, box, width) {
  return pushAside({ ...layout, [id]: snapBox(box, width) }, id);
}

/** How tall the board must be to hold every card, plus a gap below the last. */
export function boardHeight(layout) {
  if (!layout) return 0;
  return Math.max(...START_CARDS.map((id) => layout[id].y + layout[id].h)) + GAP;
}
