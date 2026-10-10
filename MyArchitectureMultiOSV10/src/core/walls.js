// Wall geometry: joins, outlines, openings, snapping targets.
//
// Walls are centre lines with a thickness. Where wall ends meet, the outline
// corners are found by sorting the walls around the shared point by angle and
// intersecting each wall's left face with the next wall's right face (an
// n-way mitre). An end that stops on the middle of another wall (a T) is
// trimmed to that wall's face; a free end is cut square. The result is one
// quadrilateral per wall: [startLeft, endLeft, endRight, startRight].
//
// A wall's local frame: u runs along the centre line from (x1, y1), v is the
// left normal (−dy, dx). Openings sit at u = opening.at (their centre).

import { dist, lineIntersect, clipHalfPlane, closestOnSegment, clamp, polygonArea } from "./geom.js";
import { wallLength, openingsOf } from "./project.js";

const TOL = 2; // mm: endpoints closer than this are the same joint

export function wallFrame(w) {
  const len = wallLength(w) || 1;
  const d = [(w.x2 - w.x1) / len, (w.y2 - w.y1) / len];
  return { len, d, n: [-d[1], d[0]], o: [w.x1, w.y1] };
}

// u (along) and v (left offset) of a world point in a wall's frame.
export function wallUV(w, x, y) {
  const f = wallFrame(w);
  const px = x - w.x1, py = y - w.y1;
  return { u: px * f.d[0] + py * f.d[1], v: px * f.n[0] + py * f.n[1] };
}

export function wallPoint(w, u, v = 0) {
  const f = wallFrame(w);
  return [w.x1 + f.d[0] * u + f.n[0] * v, w.y1 + f.d[1] * u + f.n[1] * v];
}

const key = (x, y) => `${Math.round(x / TOL)},${Math.round(y / TOL)}`;

// Joint table for the walls of one level: Map key → [{wall, end: 0|1}].
function joints(walls) {
  const map = new Map();
  for (const w of walls) {
    for (const end of [0, 1]) {
      const x = end ? w.x2 : w.x1;
      const y = end ? w.y2 : w.y1;
      let k = key(x, y);
      // Tolerate neighbouring cells: look for an existing joint within TOL.
      if (!map.has(k)) {
        for (const [kk, list] of map) {
          const a = list[0];
          const ax = a.end ? a.wall.x2 : a.wall.x1;
          const ay = a.end ? a.wall.y2 : a.wall.y1;
          if (Math.abs(ax - x) <= TOL && Math.abs(ay - y) <= TOL) { k = kk; break; }
        }
      }
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ wall: w, end });
    }
  }
  return map;
}

// Outline quads for every wall of a level: Map wallId → {poly, tee: [bool, bool]}.
// `draw` extends T-joined ends to the other wall's centre line so filled
// plans show no seam; the 3D model uses the exact face (draw = false).
export function wallOutlines(walls, { draw = false } = {}) {
  const out = new Map();
  const corner = new Map(); // `${id}:${end}` → {left, right}
  const J = joints(walls);
  for (const list of J.values()) {
    // Outgoing direction of every wall end at this joint.
    const arms = list.map(({ wall, end }) => {
      const f = wallFrame(wall);
      const dir = end ? [-f.d[0], -f.d[1]] : f.d;
      const p = end ? [wall.x2, wall.y2] : [wall.x1, wall.y1];
      return { wall, end, p, dir, n: [-dir[1], dir[0]], half: wall.thickness / 2, ang: Math.atan2(dir[1], dir[0]) };
    });
    // A T: this joint lies on the interior of another wall of the level.
    if (arms.length >= 1) {
      const p = arms[0].p;
      for (const w of walls) {
        if (list.some((a) => a.wall === w)) continue;
        const c = closestOnSegment(p[0], p[1], w.x1, w.y1, w.x2, w.y2);
        const L = wallLength(w);
        if (c.d <= Math.max(TOL, 1) && c.t * L > TOL && (1 - c.t) * L > TOL) {
          const f = wallFrame(w);
          const off = draw ? 0 : w.thickness / 2;
          for (const dir of [f.d, [-f.d[0], -f.d[1]]]) {
            arms.push({ wall: w, virtual: true, p: [c.x, c.y], dir, n: [-dir[1], dir[0]], half: off, ang: Math.atan2(dir[1], dir[0]) });
          }
          break;
        }
      }
    }
    arms.sort((a, b) => a.ang - b.ang);
    const m = arms.length;
    for (let i = 0; i < m; i++) {
      const a = arms[i];
      if (a.virtual) continue;
      const leftPt = [a.p[0] + a.n[0] * a.half, a.p[1] + a.n[1] * a.half];
      const rightPt = [a.p[0] - a.n[0] * a.half, a.p[1] - a.n[1] * a.half];
      let left = leftPt;
      let right = rightPt;
      if (m > 1) {
        const next = arms[(i + 1) % m];
        const prev = arms[(i - 1 + m) % m];
        // Left face meets the next arm's right face.
        const nr = [next.p[0] - next.n[0] * next.half, next.p[1] - next.n[1] * next.half];
        const x1 = lineIntersect(leftPt, a.dir, nr, next.dir);
        if (x1 && dist(...x1, ...a.p) < 4 * Math.max(a.half, next.half, 1) && sameSide(x1, a)) left = x1;
        // Right face meets the previous arm's left face.
        const pl = [prev.p[0] + prev.n[0] * prev.half, prev.p[1] + prev.n[1] * prev.half];
        const x2 = lineIntersect(rightPt, a.dir, pl, prev.dir);
        if (x2 && dist(...x2, ...a.p) < 4 * Math.max(a.half, prev.half, 1) && sameSide(x2, a)) right = x2;
      }
      // Where three or more wall ends meet, each outline also reaches the joint
      // point: the wedges between neighbouring corners then fill the hub (a T
      // of three ends, a cross of four) without a hole.
      const real = arms.filter((x) => !x.virtual).length;
      corner.set(`${a.wall.id}:${a.end}`, { left, right, tee: arms.some((x) => x.virtual), hub: real >= 3 && !arms.some((x) => x.virtual) ? a.p.slice() : null });
    }
  }
  for (const w of walls) {
    const s = corner.get(`${w.id}:0`);
    const e = corner.get(`${w.id}:1`);
    if (!s || !e) continue;
    // At the end joint the arm points backwards, so its left is the wall's right.
    const poly = [s.left, e.right];
    if (e.hub) poly.push(e.hub);
    poly.push(e.left, s.right);
    if (s.hub) poly.push(s.hub);
    out.set(w.id, { poly, tee: [s.tee, e.tee] });
  }
  return out;
}

// A mitre corner must not run backwards past the arm's own start by much
// (that happens for nearly reversed walls); reject those.
function sameSide(pt, arm) {
  const along = (pt[0] - arm.p[0]) * arm.dir[0] + (pt[1] - arm.p[1]) * arm.dir[1];
  return along > -4 * Math.max(arm.half, 1) && along < 8 * Math.max(arm.half, 1) + 1e6;
}

// Opening intervals along a wall, clamped and sorted: [{o, u1, u2}].
export function openingSpans(p, w) {
  const len = wallLength(w);
  return openingsOf(p, w.id)
    .map((o) => {
      const u1 = clamp(o.at - o.width / 2, 0, len);
      const u2 = clamp(o.at + o.width / 2, 0, len);
      return { o, u1, u2 };
    })
    .filter((s) => s.u2 - s.u1 > 1)
    .sort((a, b) => a.u1 - b.u1);
}

// Part of a wall outline between u = a and u = b (along the centre line).
export function slicePoly(w, poly, a, b) {
  const f = wallFrame(w);
  let out = poly;
  if (a > -1e8) out = clipHalfPlane(out, f.o, f.d, a);
  if (b < 1e8) out = clipHalfPlane(out, f.o, [-f.d[0], -f.d[1]], -b);
  return out;
}

// The solid pieces of a wall in plan (gaps where openings are), each a polygon.
export function wallPieces(p, w, poly) {
  const spans = openingSpans(p, w);
  const pieces = [];
  let from = -1e9;
  for (const s of spans) {
    if (s.u1 > from + 0.5 || from === -1e9) pieces.push(slicePoly(w, poly, from, s.u1));
    from = Math.max(from, s.u2);
  }
  pieces.push(slicePoly(w, poly, from, 1e9));
  // Drop slivers left when an opening touches a wall end.
  return pieces.filter((pc) => pc.length >= 3 && Math.abs(polygonArea(pc)) > 1);
}

// Which wall is under a point (within its thickness + margin)?
export function wallAt(walls, x, y, margin = 0) {
  let best = null;
  for (const w of walls) {
    const c = closestOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
    const lim = w.thickness / 2 + margin;
    if (c.d <= lim && (!best || c.d < best.d)) best = { wall: w, d: c.d, t: c.t, x: c.x, y: c.y, u: c.t * wallLength(w) };
  }
  return best;
}

// Place an opening of `width` on wall w nearest to u, kept inside the wall.
export function fitOpening(w, u, width) {
  const len = wallLength(w);
  const half = Math.min(width, len) / 2;
  return clamp(u, half, len - half);
}

// Every endpoint and midpoint of the walls (snap targets).
export function wallSnapPoints(walls) {
  const pts = [];
  for (const w of walls) {
    pts.push({ x: w.x1, y: w.y1, kind: "end", id: w.id }, { x: w.x2, y: w.y2, kind: "end", id: w.id }, { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2, kind: "mid", id: w.id });
  }
  return pts;
}

// Other wall ends that coincide with (x, y): [{wall, end}].
export function endsAt(walls, x, y, tol = TOL) {
  const out = [];
  for (const w of walls) {
    if (dist(w.x1, w.y1, x, y) <= tol) out.push({ wall: w, end: 0 });
    if (dist(w.x2, w.y2, x, y) <= tol) out.push({ wall: w, end: 1 });
  }
  return out;
}

// Split wall w at u: returns [a, b] (b gets a new id from makeId) with the
// openings redistributed.
export function splitWall(p, w, u, makeId) {
  const len = wallLength(w);
  if (u <= TOL || u >= len - TOL) return null;
  const [mx, my] = wallPoint(w, u);
  const b = { ...w, id: makeId(), x1: mx, y1: my };
  w.x2 = mx;
  w.y2 = my;
  for (const o of p.openings) {
    if (o.wall !== w.id) continue;
    if (o.at > u) { o.wall = b.id; o.at -= u; }
  }
  p.walls.push(b);
  return [w, b];
}

// Merge collinear walls that meet end to end with the same thickness/height.
export function mergeCollinear(p, level) {
  let merged = 0;
  let again = true;
  while (again) {
    again = false;
    const walls = p.walls.filter((w) => w.level === level);
    outer: for (const a of walls) {
      for (const b of walls) {
        if (a === b || a.thickness !== b.thickness || (a.height || 0) !== (b.height || 0)) continue;
        if (dist(a.x2, a.y2, b.x1, b.y1) > TOL) continue;
        const fa = wallFrame(a), fb = wallFrame(b);
        if (Math.abs(fa.d[0] * fb.d[1] - fa.d[1] * fb.d[0]) > 1e-4 || fa.d[0] * fb.d[0] + fa.d[1] * fb.d[1] < 0) continue;
        // Only when nothing else joins there.
        if (endsAt(walls, a.x2, a.y2).length !== 2) continue;
        const la = wallLength(a);
        for (const o of p.openings) if (o.wall === b.id) { o.wall = a.id; o.at += la; }
        a.x2 = b.x2;
        a.y2 = b.y2;
        p.walls = p.walls.filter((w) => w !== b);
        merged++;
        again = true;
        break outer;
      }
    }
  }
  return merged;
}
