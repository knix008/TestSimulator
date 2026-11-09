// Wall geometry (pure math, Node-testable): mitred joins where walls meet,
// butt joins where a wall ends on another wall's side, openings cut through,
// and room detection from the wall centre lines.
//
// Plan coordinates [x, z] (CONTRACT.md). A wall runs from a to b; its "left"
// side is +n with n = (-dz, dx)/|d| — on screen (z down) that is the side to
// the right of the direction of travel, but only the naming matters.
import { ShapeUtils, Vector2 } from 'three';

const EPS = 1e-6;
const JOIN_TOL = 0.01; // endpoints closer than 1 cm meet

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, s) => [a[0] * s, a[1] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dist = (a, b) => len(sub(a, b));

export const wallLength = (w) => dist(w.a, w.b);
export const wallDir = (w) => norm(sub(w.b, w.a));
export const wallNormal = (w) => { const d = wallDir(w); return [-d[1], d[0]]; };

/** Intersection of lines p + t·r and q + u·s (null when parallel). */
function lineIntersect(p, r, q, s) {
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(q, p), s) / denom;
  return add(p, mul(r, t));
}

/** Projection parameter of point p on segment ab (0..1 inside) and its distance. */
export function projectOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1;
  const t = dot(sub(p, a), ab) / l2;
  const c = add(a, mul(ab, Math.max(0, Math.min(1, t))));
  return { t, point: c, distance: dist(p, c) };
}

/**
 * Corner points of every wall end after joining. Returns Map wallId → { a: { left, right, joined }, b: { … } }
 * where left/right are the plan points of the wall's two faces at that end.
 */
export function wallCorners(walls) {
  const result = new Map();
  const ends = [];
  for (const w of walls) {
    if (wallLength(w) < EPS) continue;
    const n = wallNormal(w);
    const h = (w.thickness ?? 0.15) / 2;
    const r = { a: { left: add(w.a, mul(n, h)), right: add(w.a, mul(n, -h)), joined: false }, b: { left: add(w.b, mul(n, h)), right: add(w.b, mul(n, -h)), joined: false } };
    result.set(w.id, r);
    ends.push({ wall: w, end: 'a', point: w.a }, { wall: w, end: 'b', point: w.b });
  }
  // Group ends that meet at one node.
  const nodes = [];
  for (const e of ends) {
    const node = nodes.find((n) => n.level === e.wall.level && dist(n.point, e.point) < JOIN_TOL);
    if (node) node.ends.push(e); else nodes.push({ point: e.point, level: e.wall.level, ends: [e] });
  }
  for (const node of nodes) {
    if (node.ends.length >= 2) joinNode(node, result);
    else buttOnWall(node.ends[0], walls, result);
  }
  return result;
}

/** Walls meeting at one point: neighbours in angular order share a corner (mitre for two, star for more). */
function joinNode(node, result) {
  const items = node.ends.map((e) => {
    // Outgoing direction from the node along the wall.
    const out = e.end === 'a' ? wallDir(e.wall) : mul(wallDir(e.wall), -1);
    return { ...e, out, angle: Math.atan2(out[1], out[0]), h: (e.wall.thickness ?? 0.15) / 2 };
  }).sort((p, q) => p.angle - q.angle);
  const sideOf = (item, ccw) => {
    // The face line of the item that faces its ccw (next) neighbour: outgoing dir rotated +90° is "ccw side".
    const left = [-item.out[1], item.out[0]];
    const offset = mul(left, ccw ? item.h : -item.h);
    return { p: add(node.point, offset), r: item.out };
  };
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[(i + 1) % items.length];
    const s1 = sideOf(cur, true);
    const s2 = sideOf(next, false);
    let corner = lineIntersect(s1.p, s1.r, s2.p, s2.r);
    // Nearly parallel (straight continuation) or a very sharp angle: keep the square end.
    if (!corner || dist(corner, node.point) > 4 * Math.max(cur.h, next.h)) corner = s1.p;
    assign(cur, true, corner, result);
    assign(next, false, corner, result);
  }
}

/** Stores a corner on the face of `item` that is on its ccw (true) or cw side, translating to the wall's left/right. */
function assign(item, ccwSide, point, result) {
  const r = result.get(item.wall.id)[item.end];
  // For end 'a' the outgoing dir equals the wall dir: ccw side = left. For end 'b' it is reversed: ccw side = right.
  const left = item.end === 'a' ? ccwSide : !ccwSide;
  r[left ? 'left' : 'right'] = point;
  r.joined = true;
}

/** A wall end that touches the side of another wall (T-junction): its faces stop at that wall's face. */
function buttOnWall(e, walls, result) {
  const w = e.wall;
  for (const other of walls) {
    if (other === w || other.level !== w.level || wallLength(other) < EPS) continue;
    const pr = projectOnSegment(e.point, other.a, other.b);
    const ho = (other.thickness ?? 0.15) / 2;
    if (pr.t <= 0 || pr.t >= 1 || pr.distance > ho + JOIN_TOL) continue;
    const n = wallNormal(other);
    // The face of `other` on the side where this wall comes from.
    const towards = dot(sub(e.end === 'a' ? w.b : w.a, other.a), n) >= 0 ? 1 : -1;
    const faceP = add(other.a, mul(n, ho * towards));
    const od = wallDir(other);
    const r = result.get(w.id)[e.end];
    const d = wallDir(w);
    for (const side of ['left', 'right']) {
      const hit = lineIntersect(r[side], d, faceP, od);
      if (hit) r[side] = hit;
    }
    r.joined = true;
    r.butt = other.id;
    return;
  }
}

/** Plan outline of each wall: [aRight, bRight, bLeft, aLeft] after joins. Map wallId → points. */
export function wallFootprints(walls, corners = wallCorners(walls)) {
  const out = new Map();
  for (const w of walls) {
    const c = corners.get(w.id);
    if (c) out.set(w.id, [c.a.right, c.b.right, c.b.left, c.a.left]);
  }
  return out;
}

/** Opening rectangles of a wall along its axis: [{ t0, t1, y0, y1, opening }] clamped to the wall. */
export function openingSpans(wall, openings, height) {
  const L = wallLength(wall);
  return openings.filter((o) => o.wall === wall.id).map((o) => {
    const t0 = Math.max(0.001, o.offset - o.width / 2);
    const t1 = Math.min(L - 0.001, o.offset + o.width / 2);
    const y0 = Math.max(0, o.sill ?? 0);
    const y1 = Math.min(height - 0.001, y0 + o.height);
    return { t0, t1, y0: y0 < 0.001 ? 0 : y0, y1, opening: o };
  }).filter((s) => s.t1 - s.t0 > 0.01 && s.y1 - s.y0 > 0.01).sort((p, q) => p.t0 - q.t0);
}

/**
 * Triangle mesh of one wall: { positions, normals, uvs, indices, groups: [{ start, count, slot }] }
 * with slots 'left', 'right', 'top', 'reveal', 'end'. UVs are in metres.
 */
export function wallMesh(wall, { corners, openings = [], height, base = 0 }) {
  const c = corners.get(wall.id);
  const P = []; const N = []; const U = []; const I = [];
  const groups = [];
  const d = wallDir(wall);
  const n = wallNormal(wall);
  const tOf = (p) => dot(sub(p, wall.a), d);
  const spans = openingSpans(wall, openings, height);
  const begin = (slot) => ({ slot, start: I.length });
  const end = (g) => { if (I.length > g.start) groups.push({ start: g.start, count: I.length - g.start, slot: g.slot }); };

  // Side faces with holes: 2D shape in (t, y), mapped back to 3D on the face plane.
  for (const side of ['left', 'right']) {
    const g = begin(side);
    const sign = side === 'left' ? 1 : -1;
    const pA = c.a[side];
    const pB = c.b[side];
    const tA = tOf(pA);
    const tB = tOf(pB);
    const offset = dot(sub(pA, wall.a), n);
    const contour = [new Vector2(tA, 0), new Vector2(tB, 0), new Vector2(tB, height), new Vector2(tA, height)];
    const holes = spans.filter((s) => s.t0 > Math.min(tA, tB) + 0.002 && s.t1 < Math.max(tA, tB) - 0.002)
      .map((s) => (s.y0 <= 0.0005
        ? null
        : [new Vector2(s.t0, s.y0), new Vector2(s.t1, s.y0), new Vector2(s.t1, s.y1), new Vector2(s.t0, s.y1)]));
    // Door openings reaching the floor make the outline a notched polygon instead of a hole.
    const doors = spans.filter((s) => s.y0 <= 0.0005 && s.t0 > Math.min(tA, tB) && s.t1 < Math.max(tA, tB));
    let outline = contour;
    if (doors.length) {
      outline = [new Vector2(tA, 0)];
      for (const s of doors) outline.push(new Vector2(s.t0, 0), new Vector2(s.t0, s.y1), new Vector2(s.t1, s.y1), new Vector2(s.t1, 0));
      outline.push(new Vector2(tB, 0), new Vector2(tB, height), new Vector2(tA, height));
    }
    const holeList = holes.filter(Boolean);
    const tris = ShapeUtils.triangulateShape(outline, holeList);
    const pts = [...outline, ...holeList.flat()];
    const start = P.length / 3;
    for (const v of pts) {
      const t = v.x;
      const x = wall.a[0] + d[0] * t + n[0] * offset;
      const z = wall.a[1] + d[1] * t + n[1] * offset;
      P.push(x, base + v.y, z);
      N.push(n[0] * sign, 0, n[1] * sign);
      U.push(side === 'left' ? -t : t, v.y);
    }
    for (const [i0, i1, i2] of tris) {
      // Counter-clockwise in (t, y) faces +n (the left side); the right side needs the opposite winding.
      const a = pts[i0]; const b = pts[i1]; const cc = pts[i2];
      const ccw = (b.x - a.x) * (cc.y - a.y) - (b.y - a.y) * (cc.x - a.x) > 0;
      if (ccw === (side === 'left')) I.push(start + i0, start + i1, start + i2); else I.push(start + i0, start + i2, start + i1);
    }
    end(g);
  }

  // Top face.
  const gTop = begin('top');
  const fp = [c.a.right, c.b.right, c.b.left, c.a.left];
  quad(P, N, U, I, fp.map((p) => [p[0], base + height, p[1]]), [0, 1, 0], (p) => [p[0], p[2]]);
  end(gTop);

  // Ends that do not join another wall.
  const gEnd = begin('end');
  if (!c.a.joined) quad(P, N, U, I, [[c.a.left[0], base, c.a.left[1]], [c.a.right[0], base, c.a.right[1]], [c.a.right[0], base + height, c.a.right[1]], [c.a.left[0], base + height, c.a.left[1]]], [-d[0], 0, -d[1]], (p, i) => [i === 0 || i === 3 ? 0 : wall.thickness, p[1] - base]);
  if (!c.b.joined) quad(P, N, U, I, [[c.b.right[0], base, c.b.right[1]], [c.b.left[0], base, c.b.left[1]], [c.b.left[0], base + height, c.b.left[1]], [c.b.right[0], base + height, c.b.right[1]]], [d[0], 0, d[1]], (p, i) => [i === 0 || i === 3 ? 0 : wall.thickness, p[1] - base]);
  end(gEnd);

  // Reveals: the inside surfaces of each opening, through the wall thickness.
  const gRev = begin('reveal');
  const h2 = (wall.thickness ?? 0.15) / 2;
  const at = (t, y, s) => [wall.a[0] + d[0] * t + n[0] * h2 * s, base + y, wall.a[1] + d[1] * t + n[1] * h2 * s];
  for (const s of spans) {
    quad(P, N, U, I, [at(s.t0, s.y0, -1), at(s.t0, s.y0, 1), at(s.t0, s.y1, 1), at(s.t0, s.y1, -1)], [d[0], 0, d[1]], (p, i) => [i === 0 || i === 3 ? 0 : h2 * 2, p[1] - base]);
    quad(P, N, U, I, [at(s.t1, s.y0, 1), at(s.t1, s.y0, -1), at(s.t1, s.y1, -1), at(s.t1, s.y1, 1)], [-d[0], 0, -d[1]], (p, i) => [i === 0 || i === 3 ? 0 : h2 * 2, p[1] - base]);
    quad(P, N, U, I, [at(s.t0, s.y1, -1), at(s.t0, s.y1, 1), at(s.t1, s.y1, 1), at(s.t1, s.y1, -1)], [0, -1, 0], (p, i) => [i < 2 ? s.t0 : s.t1, i === 0 || i === 3 ? 0 : h2 * 2]);
    if (s.y0 > 0.0005) quad(P, N, U, I, [at(s.t0, s.y0, 1), at(s.t0, s.y0, -1), at(s.t1, s.y0, -1), at(s.t1, s.y0, 1)], [0, 1, 0], (p, i) => [i < 2 ? s.t0 : s.t1, i === 0 || i === 3 ? 0 : h2 * 2]);
  }
  end(gRev);
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I), groups };
}

/** A planar quad (or convex polygon) fan with one normal; winding follows the normal. */
function quad(P, N, U, I, pts, normal, uvOf) {
  const start = P.length / 3;
  pts.forEach((p, i) => { P.push(p[0], p[1], p[2]); N.push(...normal); U.push(...uvOf(p, i)); });
  // Check the winding against the normal and flip when needed.
  const [a, b, c] = pts;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const flip = cr[0] * normal[0] + cr[1] * normal[1] + cr[2] * normal[2] < 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (flip) I.push(start, start + i + 1, start + i); else I.push(start, start + i, start + i + 1);
  }
}

// ───────────────────────── rooms from walls

/**
 * The room polygon around a plan point: the smallest cycle of wall centre lines that contains it,
 * shrunk to the walls' inner faces. Returns [[x, z], …] (counter-clockwise) or null.
 */
export function detectRoom(walls, point, level = null) {
  const list = walls.filter((w) => (level == null || w.level === level) && wallLength(w) > EPS);
  const { nodes, edges } = planarGraph(list);
  if (!edges.length) return null;
  const faces = graphFaces(nodes, edges);
  let best = null;
  for (const face of faces) {
    const poly = face.map((i) => nodes[i]);
    const area = signedArea(poly);
    if (area <= EPS) continue; // the outer face is clockwise
    if (!pointInPolygon(point, poly)) continue;
    if (!best || area < best.area) best = { face, area };
  }
  if (!best) return null;
  // Inner faces: offset every edge inwards by its wall's half thickness.
  const cycle = best.face;
  const lines = cycle.map((i, k) => {
    const j = cycle[(k + 1) % cycle.length];
    const e = edges.find((ed) => (ed.u === i && ed.v === j) || (ed.u === j && ed.v === i));
    const p = nodes[i]; const q = nodes[j];
    const dir = norm(sub(q, p));
    const inward = [-dir[1], dir[0]]; // CCW polygon: interior is on the left
    return { p: add(p, mul(inward, (e?.wall.thickness ?? 0.15) / 2)), r: dir };
  });
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    const prev = lines[(k - 1 + lines.length) % lines.length];
    const cur = lines[k];
    const hit = lineIntersect(prev.p, prev.r, cur.p, cur.r);
    if (hit) out.push(hit); else out.push(cur.p);
  }
  return simplify(out);
}

function simplify(points) {
  const out = points.filter((p, i) => dist(p, points[(i + 1) % points.length]) > 1e-4);
  return out.filter((p, i) => {
    const a = out[(i - 1 + out.length) % out.length]; const b = out[(i + 1) % out.length];
    return Math.abs(cross(sub(p, a), sub(b, p))) > 1e-8;
  });
}

/** Centre lines split at every crossing and T-junction: nodes [[x, z]], edges [{ u, v, wall }]. */
export function planarGraph(walls) {
  const nodes = [];
  const nodeAt = (p) => {
    let i = nodes.findIndex((n) => dist(n, p) < JOIN_TOL);
    if (i < 0) { nodes.push([p[0], p[1]]); i = nodes.length - 1; }
    return i;
  };
  const cuts = walls.map((w) => [0, 1]);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const A = walls[i]; const B = walls[j];
      const r = sub(A.b, A.a); const s = sub(B.b, B.a);
      const denom = cross(r, s);
      if (Math.abs(denom) < EPS) continue;
      const t = cross(sub(B.a, A.a), s) / denom;
      const u = cross(sub(B.a, A.a), r) / denom;
      const tolA = JOIN_TOL / len(r); const tolB = JOIN_TOL / len(s);
      if (t < -tolA || t > 1 + tolA || u < -tolB || u > 1 + tolB) continue;
      cuts[i].push(Math.max(0, Math.min(1, t)));
      cuts[j].push(Math.max(0, Math.min(1, u)));
    }
  }
  const edges = [];
  walls.forEach((w, i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e9) / 1e9))].sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const p = add(w.a, mul(sub(w.b, w.a), ts[k]));
      const q = add(w.a, mul(sub(w.b, w.a), ts[k + 1]));
      const u = nodeAt(p); const v = nodeAt(q);
      if (u !== v && !edges.some((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u))) edges.push({ u, v, wall: w });
    }
  });
  return { nodes, edges };
}

/** Faces of a planar graph by walking half-edges (always turning most clockwise → smallest faces). */
function graphFaces(nodes, edges) {
  const out = new Map();
  for (const e of edges) {
    for (const [a, b] of [[e.u, e.v], [e.v, e.u]]) {
      if (!out.has(a)) out.set(a, []);
      out.get(a).push(b);
    }
  }
  const angle = (a, b) => Math.atan2(nodes[b][1] - nodes[a][1], nodes[b][0] - nodes[a][0]);
  for (const [a, list] of out) list.sort((p, q) => angle(a, p) - angle(a, q));
  const used = new Set();
  const faces = [];
  for (const e of edges) {
    for (const [a0, b0] of [[e.u, e.v], [e.v, e.u]]) {
      if (used.has(`${a0}>${b0}`)) continue;
      const face = [];
      let a = a0; let b = b0; let guard = 0;
      while (!used.has(`${a}>${b}`) && guard++ < 10000) {
        used.add(`${a}>${b}`);
        face.push(a);
        // Next: at b, the neighbour just before the reverse direction in CCW order (turn left most).
        const list = out.get(b);
        const i = list.indexOf(a);
        const next = list[(i - 1 + list.length) % list.length];
        a = b; b = next;
      }
      if (face.length >= 3) faces.push(face);
    }
  }
  return faces;
}

export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i]; const q = poly[(i + 1) % poly.length]; s += p[0] * q[1] - q[0] * p[1]; }
  return s / 2;
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]; const [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** The wall nearest to a plan point within `maxDistance` (for placing doors/windows): { wall, t (metres from a), distance, side }. */
export function nearestWall(walls, point, maxDistance = 0.5) {
  let best = null;
  for (const w of walls) {
    const L = wallLength(w);
    if (L < EPS) continue;
    const pr = projectOnSegment(point, w.a, w.b);
    if (pr.distance > maxDistance) continue;
    if (!best || pr.distance < best.distance) {
      const side = dot(sub(point, w.a), wallNormal(w)) >= 0 ? 'left' : 'right';
      best = { wall: w, t: Math.max(0, Math.min(1, pr.t)) * L, distance: pr.distance, side };
    }
  }
  return best;
}

/** Splits a wall at distance t from a: returns the two new walls (ids from `makeId`). Openings move to the part they fall in. */
export function splitWall(wall, t, makeId) {
  const d = wallDir(wall);
  const m = add(wall.a, mul(d, t));
  return [{ ...wall, id: makeId(), b: m }, { ...wall, id: makeId(), a: m }];
}
