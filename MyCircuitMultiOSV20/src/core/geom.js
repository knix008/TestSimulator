// Geometry shared by every editor, exporter and engine.
//
// Coordinate systems
//   Schematic : mils (1/1000 inch), integers, y grows downwards.
//   PCB       : millimetres, floats, y grows downwards (Gerber export flips y).
//
// Rotation is in degrees and turns counter-clockwise *as seen on screen*.
// Because y grows downwards that is the matrix
//   x' =  x cos + y sin
//   y' = -x sin + y cos
// Mirroring negates local x before rotating.

export const DEG = Math.PI / 180;

export function rotatePoint(x, y, deg) {
  if (!deg) return [x, y];
  const r = ((deg % 360) + 360) % 360;
  if (r === 90) return [y, -x];
  if (r === 180) return [-x, -y];
  if (r === 270) return [-y, x];
  const c = Math.cos(r * DEG);
  const s = Math.sin(r * DEG);
  return [x * c + y * s, -x * s + y * c];
}

// Place a local point into world space for something sitting at (t.x, t.y)
// with t.rot degrees and t.mirror.
export function xform(px, py, t) {
  const lx = t.mirror ? -px : px;
  const [rx, ry] = rotatePoint(lx, py, t.rot || 0);
  return [t.x + rx, t.y + ry];
}

// Inverse of xform: world point into the local frame.
export function unxform(wx, wy, t) {
  const [rx, ry] = rotatePoint(wx - t.x, wy - t.y, -(t.rot || 0));
  return [t.mirror ? -rx : rx, ry];
}

// A direction letter (L R U D) after rotation/mirroring.
const DIRS = ["R", "U", "L", "D"]; // counter-clockwise order on screen
export function xformDir(dir, t) {
  let d = dir;
  if (t.mirror) d = d === "L" ? "R" : d === "R" ? "L" : d;
  const steps = Math.round(((t.rot || 0) % 360 + 360) % 360 / 90);
  return DIRS[(DIRS.indexOf(d) + steps) % 4];
}

export function dirVector(dir) {
  switch (dir) {
    case "L": return [-1, 0];
    case "R": return [1, 0];
    case "U": return [0, -1];
    default: return [0, 1];
  }
}

export function snap(v, grid) {
  return Math.round(v / grid) * grid;
}

export function round(v, digits = 4) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Distance from point P to segment AB.
export function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Closest point on segment AB to P, plus its parameter.
export function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy, t };
}

function orient(ax, ay, bx, by, cx, cy) {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.abs(v) < 1e-12 ? 0 : v > 0 ? 1 : -1;
}

function onSeg(ax, ay, bx, by, px, py) {
  return Math.min(ax, bx) - 1e-9 <= px && px <= Math.max(ax, bx) + 1e-9 &&
    Math.min(ay, by) - 1e-9 <= py && py <= Math.max(ay, by) + 1e-9;
}

export function segmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  const o1 = orient(a1x, a1y, a2x, a2y, b1x, b1y);
  const o2 = orient(a1x, a1y, a2x, a2y, b2x, b2y);
  const o3 = orient(b1x, b1y, b2x, b2y, a1x, a1y);
  const o4 = orient(b1x, b1y, b2x, b2y, a2x, a2y);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a1x, a1y, a2x, a2y, b1x, b1y)) return true;
  if (o2 === 0 && onSeg(a1x, a1y, a2x, a2y, b2x, b2y)) return true;
  if (o3 === 0 && onSeg(b1x, b1y, b2x, b2y, a1x, a1y)) return true;
  if (o4 === 0 && onSeg(b1x, b1y, b2x, b2y, a2x, a2y)) return true;
  return false;
}

export function segSegDist(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  if (segmentsIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) return 0;
  return Math.min(
    pointSegDist(a1x, a1y, b1x, b1y, b2x, b2y),
    pointSegDist(a2x, a2y, b1x, b1y, b2x, b2y),
    pointSegDist(b1x, b1y, a1x, a1y, a2x, a2y),
    pointSegDist(b2x, b2y, a1x, a1y, a2x, a2y),
  );
}

// pts: [[x,y],...] closed implicitly.
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

export function polygonBounds(pts) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x1) x1 = x;
    if (y < y1) y1 = y;
    if (x > x2) x2 = x;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

// Distance from a point to the polygon boundary (0 when on it).
export function pointPolygonEdgeDist(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    best = Math.min(best, pointSegDist(x, y, pts[j][0], pts[j][1], pts[i][0], pts[i][1]));
  }
  return best;
}

export function boundsUnion(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
}

export function rectsOverlap(a, b) {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

export function rectContains(outer, inner) {
  return inner.x1 >= outer.x1 && inner.x2 <= outer.x2 && inner.y1 >= outer.y1 && inner.y2 <= outer.y2;
}

// Polygon outline of a pad (world coords) — used by DRC, zone fill and Gerber regions.
// pad: {shape, x, y, w, h, rot}. Circles/ovals return an approximated polygon.
export function padPolygon(pad, inflate = 0, segments = 24) {
  const w = pad.w + inflate * 2;
  const h = pad.h + inflate * 2;
  const pts = [];
  if (pad.shape === "circle") {
    const r = Math.max(w, h) / 2;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  } else if (pad.shape === "oval" || pad.shape === "roundrect") {
    const r = pad.shape === "oval" ? Math.min(w, h) / 2 : Math.min(w, h) * 0.25 + inflate;
    const rr = Math.min(r, Math.min(w, h) / 2);
    const hx = w / 2 - rr;
    const hy = h / 2 - rr;
    const corners = [[hx, hy, 0], [-hx, hy, 90], [-hx, -hy, 180], [hx, -hy, 270]];
    const per = Math.max(3, Math.round(segments / 4));
    for (const [cx, cy, start] of corners) {
      for (let i = 0; i <= per; i++) {
        const a = (start + (90 * i) / per) * DEG;
        pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
      }
    }
  } else {
    pts.push([w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2]);
  }
  return pts.map(([x, y]) => {
    const [rx, ry] = rotatePoint(x, y, pad.rot || 0);
    return [pad.x + rx, pad.y + ry];
  });
}

// Shortest distance between two pads (approximated by their outlines).
export function padPadDist(a, b) {
  const pa = padPolygon(a);
  const pb = padPolygon(b);
  if (pointInPolygon(pa[0][0], pa[0][1], pb) || pointInPolygon(pb[0][0], pb[0][1], pa)) return 0;
  let best = Infinity;
  for (let i = 0, j = pa.length - 1; i < pa.length; j = i++) {
    for (let k = 0, l = pb.length - 1; k < pb.length; l = k++) {
      best = Math.min(best, segSegDist(pa[j][0], pa[j][1], pa[i][0], pa[i][1], pb[l][0], pb[l][1], pb[k][0], pb[k][1]));
      if (best === 0) return 0;
    }
  }
  return best;
}

// Distance from a segment (of a track, centre line) to a pad outline.
export function segPadDist(ax, ay, bx, by, pad) {
  const poly = padPolygon(pad);
  if (pointInPolygon(ax, ay, poly) || pointInPolygon(bx, by, poly)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, segSegDist(ax, ay, bx, by, poly[j][0], poly[j][1], poly[i][0], poly[i][1]));
  }
  return best;
}

let idCounter = 0;
export function uid(prefix = "o") {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
