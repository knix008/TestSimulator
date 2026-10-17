// Plane geometry for the drawing: points, rectangles, rotation, the outline
// of a rotated shape, distances to segments, segment crossings, and path
// strings. Pure functions (unit-tested in Node). Coordinates are page pixels
// (96 per inch), y grows downwards, angles are degrees clockwise.

export const DEG = Math.PI / 180;
export const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Rotates p around c by `angle` degrees. */
export function rotatePoint(p, c, angle) {
  if (!angle) return { x: p.x, y: p.y };
  const r = angle * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export const center = (s) => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

/** A point given in the shape's own coordinates (0…w, 0…h, before flips and rotation) on the page. */
export function localToPage(s, lx, ly) {
  const x = s.flipH ? s.w - lx : lx;
  const y = s.flipV ? s.h - ly : ly;
  return rotatePoint({ x: s.x + x, y: s.y + y }, center(s), s.angle ?? 0);
}

/** A page point in the shape's own coordinates. */
export function pageToLocal(s, px, py) {
  const p = rotatePoint({ x: px, y: py }, center(s), -(s.angle ?? 0));
  let x = p.x - s.x;
  let y = p.y - s.y;
  if (s.flipH) x = s.w - x;
  if (s.flipV) y = s.h - y;
  return { x, y };
}

/** The four corners of a (possibly rotated) shape on the page. */
export function corners(s) {
  return [[0, 0], [s.w, 0], [s.w, s.h], [0, s.h]].map(([x, y]) => rotatePoint({ x: s.x + x, y: s.y + y }, center(s), s.angle ?? 0));
}

/** Axis-aligned bounding box of points. */
export function boundsOf(points) {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Bounding box of a shape on the page (rotation included). */
export const shapeBounds = (s) => (s.angle ? boundsOf(corners(s)) : { x: s.x, y: s.y, w: s.w, h: s.h });

export function unionBounds(list) {
  const boxes = list.filter(Boolean);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

export const inflate = (b, d) => ({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d });
export const rectContains = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const rectInside = (inner, outer) => inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01 && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01;
/** True when the rectangles overlap (touching edges do not count). */
export const rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Is the page point inside the (rotated) shape's box? */
export function shapeContains(s, p, pad = 0) {
  const l = pageToLocal(s, p.x, p.y);
  return l.x >= -pad && l.x <= s.w + pad && l.y >= -pad && l.y <= s.h + pad;
}

/** Distance from p to the segment a–b. */
export function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function polylineDistance(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) best = Math.min(best, segmentDistance(p, points[i - 1], points[i]));
  return best;
}

/** Where segments a–b and c–d cross (strictly inside both), or null. */
export function segmentIntersection(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y, t, u };
}

/** Where the ray from the centre of box `b` towards p leaves the box. */
export function boxExit(b, p) {
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? (b.w / 2) / Math.abs(dx) : Infinity;
  const sy = dy ? (b.h / 2) / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/** Length of a polyline. */
export function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** The point at fraction t (0…1) along a polyline, with the direction there (degrees). */
export function pointAlong(points, t) {
  const total = polylineLength(points);
  if (points.length < 2 || !total) return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, angle: 0 };
  let target = clamp(t, 0, 1) * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = dist(a, b);
    if (target <= len || i === points.length - 1) {
      const k = len ? Math.min(1, target / len) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) / DEG };
    }
    target -= len;
  }
  return { ...points[points.length - 1], angle: 0 };
}

/** Points of a cubic Bézier, sampled (for hit testing, label placement and arrows). */
export function sampleCubic(p0, p1, p2, p3, steps = 24) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    out.push({
      x: m * m * m * p0.x + 3 * m * m * t * p1.x + 3 * m * t * t * p2.x + t * t * t * p3.x,
      y: m * m * m * p0.y + 3 * m * m * t * p1.y + 3 * m * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

const n = (value) => round(value, 2);

/** SVG path of a polygon or polyline; corners rounded by `radius` (clipped to half of each side). */
export function polyPath(points, { closed = true, radius = 0 } = {}) {
  if (!points.length) return '';
  const pts = points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p));
  if (!radius || pts.length < 3) return `M${pts.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}${closed ? 'Z' : ''}`;
  const count = pts.length;
  const corner = (i) => {
    const p = pts[i];
    const prev = pts[(i - 1 + count) % count];
    const next = pts[(i + 1) % count];
    const d1 = dist(p, prev);
    const d2 = dist(p, next);
    const r = Math.min(radius, d1 / 2, d2 / 2);
    return {
      a: { x: p.x + ((prev.x - p.x) / (d1 || 1)) * r, y: p.y + ((prev.y - p.y) / (d1 || 1)) * r },
      b: { x: p.x + ((next.x - p.x) / (d2 || 1)) * r, y: p.y + ((next.y - p.y) / (d2 || 1)) * r },
      p,
    };
  };
  if (!closed) {
    let d = `M${n(pts[0].x)} ${n(pts[0].y)}`;
    for (let i = 1; i < count - 1; i++) {
      const c = corner(i);
      d += `L${n(c.a.x)} ${n(c.a.y)}Q${n(c.p.x)} ${n(c.p.y)} ${n(c.b.x)} ${n(c.b.y)}`;
    }
    return `${d}L${n(pts[count - 1].x)} ${n(pts[count - 1].y)}`;
  }
  const cs = pts.map((_, i) => corner(i));
  let d = `M${n(cs[0].b.x)} ${n(cs[0].b.y)}`;
  for (let i = 1; i <= count; i++) {
    const c = cs[i % count];
    d += `L${n(c.a.x)} ${n(c.a.y)}Q${n(c.p.x)} ${n(c.p.y)} ${n(c.b.x)} ${n(c.b.y)}`;
  }
  return `${d}Z`;
}

/** Ellipse inside x, y, w, h as a path (two arcs). */
export function ellipsePath(x, y, w, h) {
  const rx = w / 2;
  const ry = h / 2;
  return `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 0 ${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 1 0 ${n(x)} ${n(y + ry)}Z`;
}

/** Rounded rectangle path. */
export function roundRectPath(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M${n(x)} ${n(y)}H${n(x + w)}V${n(y + h)}H${n(x)}Z`;
  return `M${n(x + rr)} ${n(y)}H${n(x + w - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w)} ${n(y + rr)}V${n(y + h - rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + w - rr)} ${n(y + h)}H${n(x + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x)} ${n(y + h - rr)}V${n(y + rr)}A${n(rr)} ${n(rr)} 0 0 1 ${n(x + rr)} ${n(y)}Z`;
}

/** Points of a regular polygon (or star when `inner` is set) inside w × h. */
export function regularPoints(w, h, sides, { inner = null, rotate = -90 } = {}) {
  const pts = [];
  const count = inner ? sides * 2 : sides;
  for (let i = 0; i < count; i++) {
    const a = (rotate + (360 / count) * i) * DEG;
    const k = inner && i % 2 ? inner : 1;
    pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k]);
  }
  // Stretch so the points touch all four sides of the box.
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  return pts.map(([x, y]) => [((x - minX) / (maxX - minX || 1)) * w, ((y - minY) / (maxY - minY || 1)) * h]);
}

/** Snaps a value to the nearest multiple of `step`. */
export const snap = (value, step) => (step > 0 ? Math.round(value / step) * step : value);

/** Angle of the vector a→b in degrees (0 = right, 90 = down). */
export const angleOf = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) / DEG;

/** Unit direction for a side name. */
export const SIDE_DIR = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

/** Which side of the box a point (in the box's local frame, normalized 0…1) faces. */
export function sideOfNormalized(nx, ny) {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}
