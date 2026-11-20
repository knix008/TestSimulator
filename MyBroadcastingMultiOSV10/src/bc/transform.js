// Geometry of scene items: the position is where the item's alignment point sits on the
// canvas, the scale applies to the cropped source, rotation turns about the alignment point, a negative
// scale flips. A bounding box (bounds.type ≠ none) fixes the item's size and fits the source inside it.
// Matrices are 2D affine [a, b, c, d, e, f] (x' = a·x + c·y + e, y' = b·x + d·y + f). Pure — tested in node.

export const ALIGN_FACTORS = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
};
const factors = (align) => ALIGN_FACTORS[align] ?? ALIGN_FACTORS['top-left'];

/** The cropped size of a source (never below 1 px). */
export function croppedSize(tr, w, h) {
  const c = tr.crop ?? {};
  return { w: Math.max(1, w - (c.l || 0) - (c.r || 0)), h: Math.max(1, h - (c.t || 0) - (c.b || 0)) };
}

/**
 * The item's box (its size on the canvas before rotation) and where the cropped source goes inside it.
 * content = { x, y, w, h } in box coordinates; flipX / flipY mirror the content.
 */
export function itemBox(tr, srcW, srcH) {
  const { w: cw, h: ch } = croppedSize(tr, srcW, srcH);
  const b = tr.bounds ?? { type: 'none' };
  const flipX = tr.sx < 0;
  const flipY = tr.sy < 0;
  if (!b.type || b.type === 'none') {
    const w = cw * Math.abs(tr.sx);
    const h = ch * Math.abs(tr.sy);
    return { w, h, content: { x: 0, y: 0, w, h }, flipX, flipY, clip: false };
  }
  const bw = Math.max(1, b.w || cw);
  const bh = Math.max(1, b.h || ch);
  let kx; let ky;
  switch (b.type) {
    case 'stretch': kx = bw / cw; ky = bh / ch; break;
    case 'scale_outer': kx = ky = Math.max(bw / cw, bh / ch); break;
    case 'scale_to_width': kx = ky = bw / cw; break;
    case 'scale_to_height': kx = ky = bh / ch; break;
    case 'max_only': kx = ky = Math.min(1, bw / cw, bh / ch); break;
    default: kx = ky = Math.min(bw / cw, bh / ch); // scale_inner
  }
  const w = cw * kx;
  const h = ch * ky;
  const [fx, fy] = factors(b.align ?? 'center');
  return { w: bw, h: bh, content: { x: (bw - w) * fx, y: (bh - h) * fy, w, h }, flipX, flipY, clip: Boolean(b.crop) };
}

/** Box → canvas: translate to the position, rotate, then move the alignment point to the origin. */
export function itemMatrix(tr, box) {
  const [fx, fy] = factors(tr.align);
  const ax = box.w * fx;
  const ay = box.h * fy;
  const r = ((tr.rot || 0) * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, tr.x - (cos * ax - sin * ay), tr.y - (sin * ax + cos * ay)];
}

export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

/** The four corners on the canvas (top-left, top-right, bottom-right, bottom-left of the box). */
export function corners(tr, srcW, srcH, parent = null) {
  const box = itemBox(tr, srcW, srcH);
  let m = itemMatrix(tr, box);
  if (parent) m = multiply(parent, m);
  return [apply(m, 0, 0), apply(m, box.w, 0), apply(m, box.w, box.h), apply(m, 0, box.h)];
}

/** Axis-aligned bounds of the corners. */
export function boundsOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Is the canvas point inside the (rotated) box? */
export function hitTest(tr, srcW, srcH, x, y, parent = null) {
  const box = itemBox(tr, srcW, srcH);
  let m = itemMatrix(tr, box);
  if (parent) m = multiply(parent, m);
  const p = apply(invert(m), x, y);
  return p.x >= 0 && p.y >= 0 && p.x <= box.w && p.y <= box.h;
}

// ───────────────────────── commands (Transform menu)

/** Fit to screen: keeps the aspect ratio, as large as fits, centred. */
export function fitToScreen(tr, srcW, srcH, canvasW, canvasH) {
  const { w, h } = croppedSize(tr, srcW, srcH);
  const k = Math.min(canvasW / w, canvasH / h);
  return { ...tr, rot: 0, align: 'top-left', sx: k * Math.sign(tr.sx || 1), sy: k * Math.sign(tr.sy || 1), x: (canvasW - w * k) / 2, y: (canvasH - h * k) / 2, bounds: { ...tr.bounds, type: 'none' } };
}
/** Stretch to screen: fills the canvas exactly. */
export function stretchToScreen(tr, srcW, srcH, canvasW, canvasH) {
  const { w, h } = croppedSize(tr, srcW, srcH);
  return { ...tr, rot: 0, align: 'top-left', sx: (canvasW / w) * Math.sign(tr.sx || 1), sy: (canvasH / h) * Math.sign(tr.sy || 1), x: 0, y: 0, bounds: { ...tr.bounds, type: 'none' } };
}
/** Centres the item (axis: 'both' | 'h' | 'v') keeping its size and rotation. */
export function centerOnScreen(tr, srcW, srcH, canvasW, canvasH, axis = 'both') {
  const b = boundsOf(corners(tr, srcW, srcH));
  const dx = axis === 'v' ? 0 : canvasW / 2 - (b.x + b.w / 2);
  const dy = axis === 'h' ? 0 : canvasH / 2 - (b.y + b.h / 2);
  return { ...tr, x: tr.x + dx, y: tr.y + dy };
}
export const resetTransform = (tr) => ({ ...tr, x: 0, y: 0, rot: 0, sx: 1, sy: 1, align: 'top-left', crop: { l: 0, t: 0, r: 0, b: 0 }, bounds: { type: 'none', w: 0, h: 0, align: 'center', crop: false } });
export const flipH = (tr) => ({ ...tr, sx: -tr.sx });
export const flipV = (tr) => ({ ...tr, sy: -tr.sy });
export const rotateBy = (tr, deg) => ({ ...tr, rot: (((tr.rot + deg) % 360) + 360) % 360 });

/** Moves an item so its rotated bounds touch a canvas edge or centre ('left' | 'right' | 'top' | 'bottom' | 'hcenter' | 'vcenter'). */
export function alignTo(tr, srcW, srcH, canvasW, canvasH, edge) {
  const b = boundsOf(corners(tr, srcW, srcH));
  const d = { left: [-b.x, 0], right: [canvasW - (b.x + b.w), 0], top: [0, -b.y], bottom: [0, canvasH - (b.y + b.h)], hcenter: [canvasW / 2 - (b.x + b.w / 2), 0], vcenter: [0, canvasH / 2 - (b.y + b.h / 2)] }[edge] ?? [0, 0];
  return { ...tr, x: tr.x + d[0], y: tr.y + d[1] };
}

/** Changes the alignment point without moving the item on screen. */
export function setAlignKeepPlace(tr, srcW, srcH, align) {
  const box = itemBox(tr, srcW, srcH);
  const before = apply(itemMatrix(tr, box), 0, 0);
  const next = { ...tr, align };
  const after = apply(itemMatrix(next, box), 0, 0);
  return { ...next, x: tr.x + before.x - after.x, y: tr.y + before.y - after.y };
}

// ───────────────────────── snapping (dragging in the preview)

/**
 * Snaps a moved item's bounds to the canvas edges and centre and to other items' edges.
 * Returns the offset to add and the guide lines that caught it ({ axis: 'x'|'y', at }).
 */
export function snap(rect, canvasW, canvasH, others = [], { distance = 10, edges = true, center = true, items = true } = {}) {
  const xs = [];
  const ys = [];
  if (edges) { xs.push(0, canvasW); ys.push(0, canvasH); }
  if (center) { xs.push(canvasW / 2); ys.push(canvasH / 2); }
  if (items) for (const o of others) { xs.push(o.x, o.x + o.w); ys.push(o.y, o.y + o.h); }
  const best = (vals, targets) => {
    let hit = null;
    for (const v of vals) for (const t of targets) { const d = t - v; if (Math.abs(d) <= distance && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, at: t }; }
    return hit;
  };
  const hx = best([rect.x, rect.x + rect.w / 2, rect.x + rect.w], xs);
  const hy = best([rect.y, rect.y + rect.h / 2, rect.y + rect.h], ys);
  return { dx: hx?.d ?? 0, dy: hy?.d ?? 0, guides: [...(hx ? [{ axis: 'x', at: hx.at }] : []), ...(hy ? [{ axis: 'y', at: hy.at }] : [])] };
}

/**
 * Resizing by a handle: the opposite handle stays put. `handle` is one of ALIGN_FACTORS' keys
 * (the side being dragged), `local` the pointer in the item's unrotated box space.
 * keepAspect: corner handles keep the ratio unless Shift is held .
 */
export function resizeByHandle(tr, srcW, srcH, handle, local, { keepAspect = true, startBox = null } = {}) {
  const box = startBox ?? itemBox(tr, srcW, srcH);
  const [hx, hy] = factors(handle);
  const corner = handle !== 'top' && handle !== 'bottom' && handle !== 'left' && handle !== 'right';
  // The fixed point (opposite handle) in box space.
  const fx = 1 - hx;
  const fy = 1 - hy;
  let w = box.w;
  let h = box.h;
  if (handle === 'left' || handle === 'right' || corner) w = Math.max(1, Math.abs(local.x - box.w * fx));
  if (handle === 'top' || handle === 'bottom' || corner) h = Math.max(1, Math.abs(local.y - box.h * fy));
  if (corner && keepAspect) { const k = Math.max(w / box.w, h / box.h); w = box.w * k; h = box.h * k; }
  const m = itemMatrix(tr, box);
  const fixed = apply(m, box.w * fx, box.h * fy);
  let next;
  if (tr.bounds?.type && tr.bounds.type !== 'none') next = { ...tr, bounds: { ...tr.bounds, w, h } };
  else {
    const { w: cw, h: ch } = croppedSize(tr, srcW, srcH);
    next = { ...tr, sx: (w / cw) * Math.sign(tr.sx || 1), sy: (h / ch) * Math.sign(tr.sy || 1) };
  }
  // Keep the fixed point where it was.
  const nb = itemBox(next, srcW, srcH);
  const moved = apply(itemMatrix(next, nb), nb.w * fx, nb.h * fy);
  return { ...next, x: next.x + fixed.x - moved.x, y: next.y + fixed.y - moved.y };
}

/** Crop by a handle (Alt+drag): the pixels covered move into crop.{l,t,r,b}. */
export function cropByHandle(tr, srcW, srcH, handle, local, startBox = null) {
  const box = startBox ?? itemBox(tr, srcW, srcH);
  const kx = box.content.w / croppedSize(tr, srcW, srcH).w || 1;
  const ky = box.content.h / croppedSize(tr, srcW, srcH).h || 1;
  const crop = { ...tr.crop };
  const [hx, hy] = factors(handle);
  if (hx === 0 && handle !== 'top' && handle !== 'bottom') crop.l = Math.max(0, Math.round(crop.l + local.x / kx));
  if (hx === 1 && handle !== 'top' && handle !== 'bottom') crop.r = Math.max(0, Math.round(crop.r + (box.w - local.x) / kx));
  if (hy === 0 && handle !== 'left' && handle !== 'right') crop.t = Math.max(0, Math.round(crop.t + local.y / ky));
  if (hy === 1 && handle !== 'left' && handle !== 'right') crop.b = Math.max(0, Math.round(crop.b + (box.h - local.y) / ky));
  crop.l = Math.min(crop.l, srcW - crop.r - 1);
  crop.t = Math.min(crop.t, srcH - crop.b - 1);
  return { ...tr, crop };
}
