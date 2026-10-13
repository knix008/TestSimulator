// Plane geometry in drawing units (mm, y up). Points are { x, y }; angles in
// entity data are degrees (counter-clockwise from +x), radians only inside.

export const EPS = 1e-9;
export const TAU = Math.PI * 2;
export const rad = (deg) => (deg * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

export const pt = (x, y) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const samePoint = (a, b, tolerance = 1e-6) => dist(a, b) <= tolerance;

export function norm(a) {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export const perp = (a) => ({ x: -a.y, y: a.x });

/** Angle of the vector a→b in degrees, 0…360. */
export function angleOf(a, b) {
  return normDeg(deg(Math.atan2(b.y - a.y, b.x - a.x)));
}

/** Degrees folded into 0…360. */
export function normDeg(angle) {
  const value = ((angle % 360) + 360) % 360;
  return Math.abs(value - 360) < 1e-9 ? 0 : value;
}

export const polar = (center, r, angleDeg) => ({ x: center.x + r * Math.cos(rad(angleDeg)), y: center.y + r * Math.sin(rad(angleDeg)) });

export function rotate(p, center, angleDeg) {
  const a = rad(angleDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

export const scaleAt = (p, center, factor) => ({ x: center.x + (p.x - center.x) * factor, y: center.y + (p.y - center.y) * factor });

/** Mirror of p across the line through a and b. */
export function mirrorPoint(p, a, b) {
  const d = norm(sub(b, a));
  const v = sub(p, a);
  const along = dot(v, d);
  const foot = add(a, mul(d, along));
  return sub(mul(foot, 2), p);
}

/** Counter-clockwise sweep from start to end, in degrees (0 < sweep ≤ 360). */
export function sweep(start, end) {
  const value = normDeg(end - start);
  return value < 1e-9 ? 360 : value;
}

/** Is `angle` on the arc that runs counter-clockwise from start to end? */
export function angleOnArc(angle, start, end, tolerance = 1e-7) {
  const total = sweep(start, end);
  const part = normDeg(angle - start);
  return part <= total + tolerance || part >= 360 - tolerance;
}

// ───────────────────────── distances

/** Closest point on segment ab to p, and the parameter t (0…1). */
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { point: add(a, mul(ab, t)), t };
}

export const distToSegment = (p, a, b) => dist(p, closestOnSegment(p, a, b).point);

export function closestOnCircle(p, c, r) {
  const d = sub(p, c);
  const l = len(d);
  return l < EPS ? { x: c.x + r, y: c.y } : add(c, mul(d, r / l));
}

export function closestOnArc(p, c, r, start, end) {
  const angle = angleOf(c, p);
  if (angleOnArc(angle, start, end)) return closestOnCircle(p, c, r);
  const a = polar(c, r, start);
  const b = polar(c, r, end);
  return dist(p, a) <= dist(p, b) ? a : b;
}

// ───────────────────────── intersections

/** Intersection of segments ab and cd (null when parallel or apart). `infinite` extends both. */
export function intersectLines(a, b, c, d, infinite = false) {
  const r = sub(b, a);
  const s = sub(d, c);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < EPS) return null;
  const t = cross(sub(c, a), s) / denominator;
  const u = cross(sub(c, a), r) / denominator;
  if (!infinite && (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9)) return null;
  return add(a, mul(r, t));
}

/** Points where segment ab meets circle (c, r). */
export function intersectSegmentCircle(a, b, c, r, infinite = false) {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  if (A < EPS) return [];
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  let disc = B * B - 4 * A * C;
  if (disc < -1e-9) return [];
  disc = Math.max(0, disc);
  const root = Math.sqrt(disc);
  const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return ts.filter((t) => infinite || (t >= -1e-9 && t <= 1 + 1e-9)).map((t) => add(a, mul(d, t)));
}

export function intersectCircles(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const base = add(c1, mul(sub(c2, c1), a / d));
  const offset = mul(perp(norm(sub(c2, c1))), h);
  return h < 1e-9 ? [base] : [add(base, offset), sub(base, offset)];
}

// ───────────────────────── circles through points

/** Circle through three points, or null when they are on one line. */
export function circleFrom3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS) return null;
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const center = {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
  return { center, r: dist(center, a) };
}

/** Arc from start through middle to end: { cx, cy, r, start, end } (counter-clockwise). */
export function arcFrom3(p1, p2, p3) {
  const circle = circleFrom3(p1, p2, p3);
  if (!circle) return null;
  const { center, r } = circle;
  let start = angleOf(center, p1);
  let end = angleOf(center, p3);
  const through = angleOf(center, p2);
  // The arc must pass through the middle point; otherwise go the other way round.
  if (!angleOnArc(through, start, end)) [start, end] = [end, start];
  return { cx: center.x, cy: center.y, r, start, end };
}

// ───────────────────────── polygons & boxes

export function bboxOf(points) {
  if (!points.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBox(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export const boxWidth = (box) => (box ? box.maxX - box.minX : 0);
export const boxHeight = (box) => (box ? box.maxY - box.minY : 0);
export const boxCenter = (box) => ({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
export const boxContains = (outer, inner) => inner.minX >= outer.minX - 1e-9 && inner.maxX <= outer.maxX + 1e-9 && inner.minY >= outer.minY - 1e-9 && inner.maxY <= outer.maxY + 1e-9;
export const boxesOverlap = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export function normalizeBox(a, b) {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

/** Signed area (counter-clockwise positive). */
export function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function polylineLength(points, closed = false) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  if (closed && points.length > 2) total += dist(points[points.length - 1], points[0]);
  return total;
}

export function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Does segment ab touch the box (inside or crossing an edge)? */
export function segmentHitsBox(a, b, box) {
  const inside = (p) => p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
  if (inside(a) || inside(b)) return true;
  const corners = [pt(box.minX, box.minY), pt(box.maxX, box.minY), pt(box.maxX, box.maxY), pt(box.minX, box.maxY)];
  for (let i = 0; i < 4; i++) if (intersectLines(a, b, corners[i], corners[(i + 1) % 4])) return true;
  return false;
}

/** Points along an arc (counter-clockwise from start to end), at most `step` degrees apart. */
export function arcPoints(cx, cy, r, start, end, step = 6) {
  const total = sweep(start, end);
  const count = Math.max(2, Math.ceil(total / step));
  const points = [];
  for (let i = 0; i <= count; i++) points.push(polar({ x: cx, y: cy }, r, start + (total * i) / count));
  return points;
}

/** Points of an ellipse (rx along `angle`, ry across), closed loop without repeating the first. */
export function ellipsePoints(cx, cy, rx, ry, angle = 0, segments = 96) {
  const points = [];
  const c = Math.cos(rad(angle));
  const s = Math.sin(rad(angle));
  for (let i = 0; i < segments; i++) {
    const t = (TAU * i) / segments;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    points.push({ x: cx + x * c - y * s, y: cy + x * s + y * c });
  }
  return points;
}

/** Ramanujan's approximation of an ellipse's perimeter. */
export function ellipsePerimeter(rx, ry) {
  const h = ((rx - ry) ** 2) / ((rx + ry) ** 2 || 1);
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Rounds away floating noise (1e-10) so numbers print cleanly. */
export function clean(value, digits = 6) {
  const factor = 10 ** digits;
  const result = Math.round(value * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}
