// Keeps a popup (the in-page context menu) inside the window: flipped above
// the point near the bottom, pushed in from the right edge (from V20).
export function clampPopupPos({ x, y, width, height, viewW, viewH, pad = 6 }) {
  const vw = Math.max(0, Number(viewW) || 0);
  const vh = Math.max(0, Number(viewH) || 0);
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const p = Math.max(0, Number(pad) || 0);

  let left = Number(x) || 0;
  let top = Number(y) || 0;

  if (left + w > vw - p) left = vw - w - p;
  if (left < p) left = p;

  if (top + h > vh - p) top = top - h;
  if (top < p) top = p;
  if (top + h > vh - p) top = Math.max(p, vh - h - p);

  return { x: Math.round(left), y: Math.round(top) };
}
