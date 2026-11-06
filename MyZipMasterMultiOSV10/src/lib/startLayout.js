// Where the start screen's two movable cards sit, in pixels on their board. Nothing here touches the
// page. A saved layout is only what the user changed; until then the cards fill the board.
//
// The cards are always arranged: either side by side, the second filling what the first leaves, or
// one above the other at full width. Moving a card chooses which; resizing one makes the other give
// way. Nothing is ever left overlapping or with a hole between them.

export const CARD_IDS = ['main', 'background'];
export const GAP = 12;
export const MIN_W = 280;
export const MIN_H = 150;
const SNAP = 8;

const tooNarrow = (width) => width < MIN_W * 2 + GAP;

export function defaultLayout(width, height) {
  if (tooNarrow(width)) {
    const h = Math.max(MIN_H, 300);
    return { main: { x: 0, y: 0, w: width, h }, background: { x: 0, y: h + GAP, w: width, h } };
  }
  // The background's card holds two drag bars on one line, so it gets a little more.
  const left = Math.round((width - GAP) * 0.46);
  const h = Math.max(MIN_H, height);
  return { main: { x: 0, y: 0, w: left, h }, background: { x: left + GAP, y: 0, w: width - left - GAP, h } };
}

function clampCard(card, width) {
  const w = Math.min(Math.max(MIN_W, card.w), Math.max(MIN_W, width));
  const h = Math.max(MIN_H, card.h);
  return { x: Math.max(0, Math.min(card.x, Math.max(0, width - w))), y: Math.max(0, card.y), w, h };
}

const valid = (c) => c && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(c[k]));
// Side by side both start at the top; stacked, one is lower. A card being resized may reach past
// the other for a moment, which does not change which arrangement this is.
const isStacked = (a, b) => a.y !== b.y;

function stack(topId, bottomId, top, bottom, width) {
  return {
    [topId]: { x: 0, y: 0, w: width, h: top.h },
    [bottomId]: { x: 0, y: top.h + GAP, w: width, h: bottom.h },
  };
}

// `fixedId` keeps its width; the other card takes the rest.
function sideBySide(leftId, rightId, left, right, width, fixedId) {
  const room = width - GAP - MIN_W;
  if (fixedId === rightId) {
    const w = Math.min(right.w, room);
    return { [leftId]: { x: 0, y: 0, w: width - w - GAP, h: left.h }, [rightId]: { x: width - w, y: 0, w, h: right.h } };
  }
  const w = Math.min(left.w, room);
  return { [leftId]: { x: 0, y: 0, w, h: left.h }, [rightId]: { x: w + GAP, y: 0, w: width - w - GAP, h: right.h } };
}

function arrangeAs(layout, width, fixedId) {
  const [a, b] = CARD_IDS;
  if (tooNarrow(width) || isStacked(layout[a], layout[b])) {
    return layout[a].y <= layout[b].y ? stack(a, b, layout[a], layout[b], width) : stack(b, a, layout[b], layout[a], width);
  }
  return layout[a].x <= layout[b].x ? sideBySide(a, b, layout[a], layout[b], width, fixedId) : sideBySide(b, a, layout[b], layout[a], width, fixedId);
}

// A saved layout on the board as it is now, which may be narrower than when it was saved.
export function fitLayout(saved, width, height) {
  const base = defaultLayout(width, height);
  if (!CARD_IDS.every((id) => valid(saved?.[id]))) return base;
  const out = {};
  for (const id of CARD_IDS) out[id] = clampCard(saved[id], width);
  return arrangeAs(out, width);
}

// While a card is under the pointer it goes where the pointer goes; only kept on the board.
export const heldLayout = (layout, id, width) => ({ ...layout, [id]: clampCard(layout[id], width) });

// A card let go after moving: where it landed says how the two are arranged now.
export function settleMove(layout, id, width) {
  const snap = (n) => Math.round(n / SNAP) * SNAP;
  const other = CARD_IDS.find((c) => c !== id);
  const a = clampCard({ x: snap(layout[id].x), y: snap(layout[id].y), w: layout[id].w, h: layout[id].h }, width);
  const b = layout[other];
  if (tooNarrow(width)) return a.y <= b.y ? stack(id, other, a, b, width) : stack(other, id, b, a, width);
  const across = a.x < b.x + b.w && b.x < a.x + a.w;
  if (across && a.y >= b.y + b.h / 2) return stack(other, id, b, a, width);
  if (across && a.y + a.h <= b.y + b.h / 2) return stack(id, other, a, b, width);
  // Beside each other. A card that was full width comes back at half.
  const half = (c) => (c.w > width - GAP - MIN_W ? Math.round((width - GAP) / 2) : c.w);
  const [ca, cb] = [{ ...a, w: half(a) }, { ...b, w: half(b) }];
  // Which half of the board its middle landed in says which side it takes.
  return a.x + a.w / 2 <= width / 2 ? sideBySide(id, other, ca, cb, width, id) : sideBySide(other, id, cb, ca, width, id);
}

// A card let go after resizing: the arrangement stays, and the other card gives way.
export function settleResize(layout, id, width) {
  const snap = (n) => Math.round(n / SNAP) * SNAP;
  const a = clampCard({ ...layout[id], w: snap(layout[id].w), h: snap(layout[id].h) }, width);
  return arrangeAs({ ...layout, [id]: a }, width, id);
}

export const movedBy = (card, dx, dy) => ({ ...card, x: card.x + dx, y: card.y + dy });
export const resizedBy = (card, dx, dy) => ({ ...card, w: Math.max(MIN_W, card.w + dx), h: Math.max(MIN_H, card.h + dy) });
