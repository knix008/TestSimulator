// Placing drawing annotations without clutter (no DOM):
//   boxes — the sheet rectangle a list of primitives covers (texts by their estimated width and height, turned
//     with their rotation), and whether two rectangles overlap;
//   separating labels — every label in turn is pushed outward step by step (a new row each step) until it overlaps
//     none placed before it nor any obstacle: the automatic dimensions of a small part no longer sit on each other;
//   snapping a drag — an annotation dragged on the sheet lines up with the other annotations (their anchors, the
//     left / middle / right and top / middle / bottom of their boxes) within a tolerance, or else with a grid; the
//     guides show what it lined up with.
// Sheet mm, y down. Texts are measured in the sheet's font (text-metrics.js).

import { textWidth, textExtent } from './text-metrics.js';

/** An empty box. */
export const emptyBox = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
const grow = (b, x, y) => { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; };
export const boxValid = (b) => Boolean(b) && b.x1 >= b.x0 && b.y1 >= b.y0 && [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite);

/**
 * The rectangle of a text primitive { x, y, text, size, anchor, rot, bold }: (x, y) is the baseline at the anchor;
 * the width is measured in the sheet's font (text-metrics.js), the height runs from the font's ascent above the
 * baseline to its descent below. Turned texts give the box of their turned corners. Several lines go down
 * 1.25·size each (as the SVG and DXF place them).
 */
export function textCorners(p) {
  const lines = String(p.text ?? '').split('\n');
  const size = Number(p.size) || 3.2;
  const w = Math.max(0, ...lines.map((l) => textWidth(l, size, { bold: Boolean(p.bold) })));
  const x0 = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
  const { ascent, descent } = textExtent(size);
  const top = -ascent; const bottom = descent + (lines.length - 1) * size * 1.25;
  const r = ((Number(p.rot) || 0) * Math.PI) / 180; const c = Math.cos(r); const s = Math.sin(r);
  return [[x0, top], [x0 + w, top], [x0 + w, bottom], [x0, bottom]].map(([u, v]) => [p.x + u * c - v * s, p.y + u * s + v * c]);
}

/** The box of primitives (poly, fill, circle, text); `only` (optional) limits it to those of a type, e.g. 'text'. */
export function primsBox(prims, only = null) {
  const b = emptyBox();
  for (const p of prims ?? []) {
    if (only && p.t !== only) continue;
    if (p.t === 'poly' || p.t === 'fill') for (const q of p.pts) grow(b, q[0], q[1]);
    else if (p.t === 'circle') { grow(b, p.c[0] - p.r, p.c[1] - p.r); grow(b, p.c[0] + p.r, p.c[1] + p.r); }
    else if (p.t === 'text' && String(p.text ?? '') !== '') for (const q of textCorners(p)) grow(b, q[0], q[1]);
  }
  return boxValid(b) ? b : null;
}

/** True when two boxes overlap by more than touching (`pad` mm of clearance asked for). */
export function boxesOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

export const shiftBox = (b, dx, dy) => (b ? { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy } : null);

/**
 * Labels placed one after another without overlapping: `items` [{ boxAt(k) }] where boxAt(k) is the label's box
 * pushed out k steps (k = 0 where it was put); `obstacles` boxes it must also clear. Each label takes the smallest
 * k (up to maxSteps) whose box is `pad` clear of the obstacles and of the labels placed before it. Returns the
 * steps [k] in the items' order and the final boxes.
 */
export function separateLabels(items, { obstacles = [], pad = 0.8, maxSteps = 400 } = {}) {
  const placed = obstacles.filter(boxValid);
  const steps = []; const boxes = [];
  for (const it of items) {
    let k = 0; let b = it.boxAt(0);
    while (k < maxSteps && b && placed.some((o) => boxesOverlap(o, b, pad))) { k += 1; b = it.boxAt(k); }
    steps.push(k); boxes.push(b);
    if (b) placed.push(b);
  }
  return { steps, boxes };
}

/**
 * The snap of an annotation being dragged. `moving` { anchor: [x, y], box } where it is now (after the raw drag);
 * `targets` [{ anchor, box }] the other annotations. Lines it can line up with, per axis: the anchors, and the
 * box edges and middles (left with left, middle with middle, right with right). The nearest within `tol` wins
 * on each axis; an axis that lines up with nothing snaps its anchor to `grid` (mm, 0 = off).
 * Returns { dx, dy, guides: [{ axis: 'x' | 'y', at, from, to }] } (add dx, dy to the drag; a guide on axis x is
 * the vertical line x = at from y = from to y = to).
 */
export function snapDrag(moving, targets = [], { tol = 2, grid = 0 } = {}) {
  const out = { dx: 0, dy: 0, guides: [] };
  const mb = moving.box ?? null; const ma = moving.anchor ?? null;
  const feats = (b, a, axis) => {
    const list = [];
    if (a) list.push({ kind: 'anchor', v: axis === 'x' ? a[0] : a[1] });
    if (b) { const lo = axis === 'x' ? b.x0 : b.y0; const hi = axis === 'x' ? b.x1 : b.y1; list.push({ kind: 'lo', v: lo }, { kind: 'mid', v: (lo + hi) / 2 }, { kind: 'hi', v: hi }); }
    return list;
  };
  for (const axis of ['x', 'y']) {
    const mine = feats(mb, ma, axis);
    let best = null;
    for (const t of targets) {
      for (const f of feats(t.box ?? null, t.anchor ?? null, axis)) {
        for (const m of mine) {
          if (m.kind !== f.kind) continue;
          const d = f.v - m.v;
          if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d) - 1e-12)) best = { d, at: f.v, t };
        }
      }
    }
    if (best) {
      if (axis === 'x') out.dx = best.d; else out.dy = best.d;
      // The guide runs across both: along the other axis from the one to the other.
      const span = [mb, best.t.box].filter(Boolean).flatMap((b) => (axis === 'x' ? [b.y0, b.y1] : [b.x0, b.x1]));
      const pts = [ma, best.t.anchor].filter(Boolean).map((a) => (axis === 'x' ? a[1] : a[0]));
      const all = [...span, ...pts];
      out.guides.push({ axis, at: best.at, from: Math.min(...all), to: Math.max(...all) });
    } else if (grid > 0 && ma) {
      const v = axis === 'x' ? ma[0] : ma[1];
      const d = Math.round(v / grid) * grid - v;
      if (axis === 'x') out.dx = d; else out.dy = d;
    }
  }
  if (Math.abs(out.dx) < 1e-12) out.dx = 0;
  if (Math.abs(out.dy) < 1e-12) out.dy = 0;
  return out;
}
