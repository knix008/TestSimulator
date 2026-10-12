// Selection shapes. A selection is { x, y, w, h, shape } in image pixels; the
// shape (rectangle, rounded rectangle, ellipse) lies inside that box.

export const SELECTION_SHAPES = ['rect', 'round', 'ellipse'];
export const SHAPE_ICON = { rect: 'selRect', round: 'selRound', ellipse: 'selEllipse' };

export function selectionShape(r) {
  return r && SELECTION_SHAPES.includes(r.shape) ? r.shape : 'rect';
}

export function isShaped(r) {
  return selectionShape(r) !== 'rect';
}

/** Corner radius of a rounded selection: a sixth of the shorter side. */
export function cornerRadius(r) {
  return Math.max(2, Math.min(r.w, r.h) / 6);
}

/** Adds the selection outline to the current path as a closed subpath. */
export function traceSelection(ctx, r) {
  const { x, y, w, h } = r;
  const shape = selectionShape(r);
  if (shape === 'ellipse') {
    ctx.moveTo(x + w, y + h / 2);
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  } else if (shape === 'round') {
    const k = Math.min(cornerRadius(r), w / 2, h / 2);
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Keeps only what lies inside the selection on `canvas`, whose top-left corner
 * is the image point (ox, oy) drawn at `scale`. Rectangles need no mask.
 */
export function maskToSelection(canvas, r, { ox = r.x, oy = r.y, scale = 1 } = {}) {
  if (!r || !isShaped(r)) return canvas;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  traceSelection(ctx, r);
  ctx.fill();
  ctx.restore();
  return canvas;
}
