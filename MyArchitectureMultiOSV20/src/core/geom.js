// Plane geometry in millimetres, y pointing down on screen (x right). Angles
// are in degrees, measured with atan2 (counter-clockwise in maths axes, so
// clockwise on screen); every routine here only needs to be self-consistent.

export const EPS = 1e-6;

let counter = 0;
export function uid(prefix = "x") {
  counter = (counter + 1) % 1679616;
  return `${prefix}${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(4, "0")}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const snap = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const normAngle = (a) => ((a % 360) + 360) % 360;

// Rotate (x, y) about the origin by `a` degrees.
export function rotPt(x, y, a) {
  if (!a) return [x, y];
  const c = Math.cos(rad(a));
  const s = Math.sin(rad(a));
  return [x * c - y * s, x * s + y * c];
}

// Local (item) → world for a placed item {x, y, rot}.
export function toWorld(item, lx, ly) {
  const [rx, ry] = rotPt(lx, ly, item.rot || 0);
  return [item.x + rx, item.y + ry];
}

// World → local for a placed item {x, y, rot}.
export function toLocal(item, wx, wy) {
  return rotPt(wx - item.x, wy - item.y, -(item.rot || 0));
}

// Closest point on segment AB to P: {x, y, t (0..1), d}.
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { x, y, t, d: Math.hypot(px - x, py - y) };
}

export function pointSegDist(px, py, ax, ay, bx, by) {
  return closestOnSegment(px, py, ax, ay, bx, by).d;
}

// Intersection of the infinite lines P1 + t·d1 and P2 + s·d2 → [x, y] or null.
export function lineIntersect(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

// Proper/touching intersection of segments AB and CD → {x, y, t, u} or null.
export function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: ax + rx * t, y: ay + ry * t, t, u };
}

// Signed area (shoelace). Positive for counter-clockwise in maths axes.
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function polygonPerimeter(pts, closed = true) {
  let p = 0;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) p += dist(...pts[i], ...pts[(i + 1) % n]);
  return p;
}

export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const k = x1 * y2 - x2 * y1;
    a += k;
    cx += (x1 + x2) * k;
    cy += (y1 + y2) * k;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

// A point that is certainly inside the polygon (for labels): the centroid when
// it is inside, otherwise the middle of the widest horizontal chord.
export function labelPoint(pts) {
  const c = polygonCentroid(pts);
  if (pointInPolygon(c[0], c[1], pts)) return c;
  const b = bounds(pts);
  let best = c;
  let bestW = -1;
  for (let k = 1; k < 12; k++) {
    const y = b.y1 + ((b.y2 - b.y1) * k) / 12;
    const xs = [];
    for (let i = 0, n = pts.length; i < n; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b2) => a - b2);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1] - xs[i];
      if (w > bestW) { bestW = w; best = [(xs[i] + xs[i + 1]) / 2, y]; }
    }
  }
  return best;
}

export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bounds(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

export function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

// Clip a polygon to the half-plane where (p − origin)·dir >= value
// (Sutherland–Hodgman against one edge).
export function clipHalfPlane(pts, origin, dir, value) {
  const f = (p) => (p[0] - origin[0]) * dir[0] + (p[1] - origin[1]) * dir[1] - value;
  const out = [];
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

// Offset a closed polygon inward by per-edge distances (positive = into the
// polygon). Edge i runs from pts[i] to pts[i+1]. Works for simple polygons of
// either orientation; very sharp corners are bevelled.
export function offsetPolygon(pts, d) {
  const n = pts.length;
  if (n < 3) return pts.slice();
  const ccw = polygonArea(pts) > 0;
  const dd = typeof d === "number" ? pts.map(() => d) : d;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = dist(...a, ...b) || 1;
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Left normal (−dy, dx) points inside for a counter-clockwise polygon.
    const nrm = ccw ? [-dir[1], dir[0]] : [dir[1], -dir[0]];
    lines.push({ p: [a[0] + nrm[0] * dd[i], a[1] + nrm[1] * dd[i]], dir });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const x = lineIntersect(prev.p, prev.dir, cur.p, cur.dir);
    if (!x || dist(...x, ...pts[i]) > 6 * Math.max(Math.abs(dd[i]), Math.abs(dd[(i - 1 + n) % n]), 1)) out.push(cur.p.slice());
    else out.push(x);
  }
  return out;
}

// Convex hull (monotone chain) of [[x, y]] → counter-clockwise hull.
export function convexHull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Oriented bounding rectangle along the polygon's longest edge:
// {cx, cy, len (along), wid (across), angle (deg of the long side)}.
export function orientedRect(pts) {
  let best = null;
  const hull = convexHull(pts);
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let u1 = Infinity, u2 = -Infinity, v1 = Infinity, v2 = -Infinity;
    for (const [x, y] of hull) {
      const u = x * c - y * s;
      const v = x * s + y * c;
      u1 = Math.min(u1, u); u2 = Math.max(u2, u); v1 = Math.min(v1, v); v2 = Math.max(v2, v);
    }
    const area = (u2 - u1) * (v2 - v1);
    if (!best || area < best.area - 1e-6) {
      const uc = (u1 + u2) / 2, vc = (v1 + v2) / 2;
      const [cx, cy] = rotPt(uc, vc, deg(ang));
      let len = u2 - u1, wid = v2 - v1, angle = deg(ang);
      if (wid > len) { [len, wid] = [wid, len]; angle += 90; }
      best = { area, cx, cy, len, wid, angle: normAngle(angle) };
    }
  }
  return best || { cx: 0, cy: 0, len: 0, wid: 0, angle: 0, area: 0 };
}

// Ear-clipping triangulation of a simple polygon → index triples.
export function triangulate(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (polygonArea(pts) < 0) idx.reverse();
  const tris = [];
  const isEar = (i0, i1, i2) => {
    const [ax, ay] = pts[i0], [bx, by] = pts[i1], [cx, cy] = pts[i2];
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) <= 1e-9) return false;
    for (const j of idx) {
      if (j === i0 || j === i1 || j === i2) continue;
      const [px, py] = pts[j];
      const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      const d2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
      const d3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
      if (d1 >= 0 && d2 >= 0 && d3 >= 0) return false;
    }
    return true;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      if (isEar(i0, i1, i2)) { tris.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break; }
    }
    if (!cut) break; // degenerate: fan the rest
  }
  for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1]]);
  return tris;
}

// Snap an angle (deg) to the nearest multiple of `step` when within `tol`.
export function snapAngle(a, step = 45, tol = 360) {
  const s = Math.round(a / step) * step;
  return Math.abs(s - a) <= tol ? s : a;
}

export function fmtLen(mm, units = "mm") {
  if (!Number.isFinite(mm)) return "—";
  if (units === "m") return `${(mm / 1000).toFixed(2)} m`;
  if (units === "cm") return `${(mm / 10).toFixed(1)} cm`;
  if (units === "ft") {
    // Round to a tenth of an inch first, so 11.96" becomes 1' 0", never 0' 12".
    const tenths = Math.round((mm / 25.4) * 10);
    const ft = Math.floor(tenths / 120);
    const inch = (tenths - ft * 120) / 10;
    return `${ft}' ${inch.toFixed(inch < 10 ? 1 : 0)}"`;
  }
  return `${Math.round(mm)} mm`;
}

export function fmtArea(mm2, units = "mm") {
  if (units === "ft") return `${(mm2 / 92903.04).toFixed(1)} ft²`;
  return `${(mm2 / 1e6).toFixed(2)} m²`;
}
