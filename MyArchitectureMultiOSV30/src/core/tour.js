// Automatic walk-through (자동 둘러보기): a route through the building at eye
// height — in at the entrance, through the doors (and open plans) into every
// room, a slow look round in each, up the stairs to the next level. Ported
// from MySketchBook's engine/tour.js onto this project's data model.
//
// planTour(project) is pure and unit-tested. Its output is in the 3D frame,
// metres: a plan point (x, y) mm becomes [X, Z] = [x / 1000, y / 1000]; climbs
// carry [X, Y, Z] with Y above the lower level's floor. The player
// (src/view3d/tourplayer.js) walks the viewer's camera along it.

import { pointInPolygon } from "./geom.js";
import { levelAbove } from "./project.js";
import { stairLayout } from "./elements/geometry.js";
import { activeModel } from "./elements/model.js";

export const EYE_HEIGHT = 1.6; // m above the floor
/** Walking speed (m/s) at speed 1, and the time of the look round in a room (s). */
export const WALK_SPEED = 1.1;
export const LOOK_TIME = 9;
const CLEARANCE = 0.18; // metres kept from a wall face
const DOOR_STEP = 0.45; // waypoint distance in front of / behind a door, from the wall face
const M = 0.001;

// ---------------------------------------------------------------- geometry

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inPoly = (p, poly) => pointInPolygon(p[0], p[1], poly);

/** Distance from point p to segment ab. */
export function pointSegmentDistance(p, a, b) {
  const ab = sub(b, a); const L2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2)) : 0;
  return dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]);
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segmentsIntersect(p1, p2, q1, q2) {
  const d1 = cross(q1, q2, p1); const d2 = cross(q1, q2, p2); const d3 = cross(p1, p2, q1); const d4 = cross(p1, p2, q2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** Shortest distance between segments ab and cd (0 when they cross). */
export function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

/** Openings one walks through: doors of every kind, and plain openings that start at the floor and are tall enough. */
export const isPassable = (o) => o.kind === "door" || (o.kind === "opening" && (o.sill ?? 0) < 100 && (o.height ?? 0) >= 1800);

/**
 * The solid parts of a level's walls (centre-line pieces between the door gaps,
 * metres) with their half thickness, and the door crossings:
 * { solids: [{ a, b, half }], doors: [{ id, type, centre, normal, width, half, sides: [p, q] }] }.
 */
export function levelObstacles(project, levelId) {
  const walls = project.walls.filter((w) => w.level === levelId);
  const solids = [];
  const doors = [];
  for (const w of walls) {
    const A = [w.x1 * M, w.y1 * M]; const B = [w.x2 * M, w.y2 * M];
    const d = sub(B, A); const L = len(d);
    if (L < 1e-6) continue;
    const u = [d[0] / L, d[1] / L]; const n = [-u[1], u[0]];
    const half = ((w.thickness ?? 200) * M) / 2;
    const at = (t) => [A[0] + u[0] * t, A[1] + u[1] * t];
    const gaps = project.openings.filter((o) => o.wall === w.id && isPassable(o))
      .map((o) => ({ o, t0: Math.max(0, (o.at - o.width / 2) * M), t1: Math.min(L, (o.at + o.width / 2) * M) }))
      .filter((g) => g.t1 - g.t0 > 0.3)
      .sort((x, y) => x.t0 - y.t0);
    let t = 0;
    for (const g of gaps) {
      if (g.t0 > t + 1e-3) solids.push({ a: at(t), b: at(g.t0), half });
      t = Math.max(t, g.t1);
      const c = at((g.t0 + g.t1) / 2); const k = half + DOOR_STEP;
      doors.push({ id: g.o.id, type: g.o.type, centre: c, normal: n, width: g.t1 - g.t0, half, sides: [[c[0] + n[0] * k, c[1] + n[1] * k], [c[0] - n[0] * k, c[1] - n[1] * k]] });
    }
    if (L > t + 1e-3) solids.push({ a: at(t), b: at(L), half });
  }
  return { solids, doors };
}

/** Whether one can walk straight from p to q (keeping `clearance` from every wall face). */
export function clearPath(p, q, solids, clearance = CLEARANCE) {
  for (const s of solids) if (segmentDistance(p, q, s.a, s.b) < s.half + clearance) return false;
  return true;
}

/**
 * The nearest place to p (within 2 m) one can stand: clear of every wall face
 * and, when `polys` are given, inside a room. Stair exits run into the wall
 * at the top of the flight and an entrance's "outside" point can be boxed in
 * by a garden wall — the walk starts from here instead. p itself when it is
 * already fine or nothing nearby is.
 */
export function standSpot(p, solids, polys = []) {
  const clear = (q) => solids.every((s) => pointSegmentDistance(q, s.a, s.b) - s.half >= CLEARANCE + 0.05);
  const roomy = (q) => !polys.length || polys.some((poly) => inPoly(q, poly));
  if (clear(p) && roomy(p)) return p;
  for (let r = 0.25; r <= 2.0001; r += 0.25) {
    let best = null; let bestD = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
      if (!clear(q) || !roomy(q)) continue;
      const d = dist(q, p);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) return best;
  }
  return p;
}

/** Room clearance at p: distance to the nearest wall face (or room edge). */
function clearanceAt(p, solids, poly) {
  let best = Infinity;
  for (const s of solids) best = Math.min(best, pointSegmentDistance(p, s.a, s.b) - s.half);
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** A room's outline in metres. */
const roomPoly = (r) => r.pts.map((q) => [q[0] * M, q[1] * M]);

/** A standing point in a room (metres): inside it, as far from its walls as a grid finds (the middle of an L-shaped room's larger part). */
export function roomStandPoint(poly, solids) {
  if (!poly?.length) return null;
  const xs = poly.map((p) => p[0]); const zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const z0 = Math.min(...zs); const z1 = Math.max(...zs);
  const step = Math.min(0.4, Math.max(0.1, Math.max(x1 - x0, z1 - z0) / 16));
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  // Only the walls near the room matter for its clearance.
  const near = solids.filter((s) => Math.min(s.a[0], s.b[0]) - 2 < x1 && Math.max(s.a[0], s.b[0]) + 2 > x0 && Math.min(s.a[1], s.b[1]) - 2 < z1 && Math.max(s.a[1], s.b[1]) + 2 > z0);
  let best = null; let bestScore = -Infinity;
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let z = z0 + step / 2; z < z1; z += step) {
      const p = [x, z];
      if (!inPoly(p, poly)) continue;
      const c = clearanceAt(p, near, poly);
      // Clearance first; among nearly equal points the one nearer the middle.
      const score = Math.min(c, 1.4) - 0.02 * dist(p, [cx, cz]);
      if (score > bestScore) { bestScore = score; best = p; }
    }
  }
  return best;
}

// ---------------------------------------------------------------- graph

function dijkstra(n, edges, from, to = -1) {
  const d = new Array(n).fill(Infinity); const prev = new Array(n).fill(-1); const done = new Uint8Array(n);
  d[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [v, w] of edges[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
  }
  return { d, prev };
}

function shortestPath(nodes, edges, from, to) {
  const { d, prev } = dijkstra(nodes.length, edges, from, to);
  if (d[to] === Infinity) return null;
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.unshift(v);
  return { path, length: d[to] };
}

/** Drops waypoints a straight walk can skip (the path stays clear of the walls). */
function simplify(points, solids) {
  if (points.length < 3) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !clearPath(points[i], points[j], solids)) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------- stairs

/**
 * A stair as a climb (metres): { from: [X, Z] (in front of the first step), to: [X, Z] (past the exit),
 * steps: [[X, Y, Z]…] (tread centres, Y above the stair's floor) }.
 */
export function stairClimb(project, s) {
  const lv = project.levels.find((l) => l.id === s.level);
  const above = levelAbove(project, s.level);
  const rise = above ? above.elevation - lv.elevation : lv?.height ?? 2800;
  const L = stairLayout(s, rise);
  const walk = (L.walk ?? []).map((q) => [q[0] * M, q[1] * M]);
  const steps = (L.treads ?? []).map((tr) => {
    const c = tr.pts.reduce((acc, q) => [acc[0] + q[0] / tr.pts.length, acc[1] + q[1] / tr.pts.length], [0, 0]);
    return [c[0] * M, tr.z * M, c[1] * M];
  });
  const along = (a, b, k) => { const d = sub(b, a); const l = len(d) || 1; return [a[0] + (d[0] / l) * k, a[1] + (d[1] / l) * k]; };
  const first = walk[0] ?? [steps[0][0], steps[0][2]];
  const second = walk[1] ?? first;
  const from = along(first, second, -0.6);
  const last = walk.at(-1) ?? [steps.at(-1)[0], steps.at(-1)[2]];
  const before = walk.at(-2) ?? last;
  const to = along(before, last, len(sub(last, before)) + 0.6);
  return { from, to, steps, rise: rise * M };
}

// ---------------------------------------------------------------- the route

/**
 * The walk-through of a project: [{ type: 'walk', level, points: [[X, Z]…] } | { type: 'look', level, at, room, name,
 * index, total, glide? } | { type: 'climb', from: level id, to: level id, points: [[X, Y, Z]…] }].
 * `levels`: ids to visit (default: all, lowest first); `start`: [X, Z] to start from when the building has no
 * entrance door (the camera's place).
 */
export function planTour(project, { levels = null, start = null } = {}) {
  project = activeModel(project);
  const order = [...project.levels].sort((a, b) => a.elevation - b.elevation).filter((l) => !levels || levels.includes(l.id));
  const moves = [];
  const rooms = [];
  // Where the walk can go on on the next level: past each stair's exit — the one climbed first.
  let enters = [];
  for (let li = 0; li < order.length; li++) {
    const level = order[li];
    const next = order[li + 1];
    const { solids, doors } = levelObstacles(project, level.id);
    const levelRooms = project.rooms.filter((r) => r.level === level.id && r.pts?.length >= 3).map((r) => ({ room: r, poly: roomPoly(r) }));
    const polys = levelRooms.map((r) => r.poly);
    const nodes = [];
    const add = (p) => { nodes.push(p); return nodes.length - 1; };
    // Rooms (standing points).
    const roomNodes = [];
    for (const r of levelRooms) {
      const p = roomStandPoint(r.poly, solids);
      if (p) roomNodes.push({ room: r.room, node: add(p) });
    }
    // Doors (a point either side).
    const inRoom = (p) => levelRooms.some((r) => inPoly(p, r.poly));
    for (const d of doors) { add(d.sides[0]); add(d.sides[1]); }
    // Anchors — where a walk on this level can begin: past the stairs' exits, else in front of each entrance
    // (main door first), else `start`. The first is where the camera arrives; the others take over when the
    // rooms it reaches are used up (a duplex: two homes, two stairs).
    const anchors = [];
    if (enters.length) for (const e of enters) anchors.push(add(standSpot(e, solids, polys)));
    else {
      const rank = (x) => (x.d.type === "double" ? 0 : x.d.type === "single" ? 1 : x.d.type === "garage" ? 3 : 2);
      const entrances = doors.map((d) => ({ d, out: d.sides.findIndex((p) => !inRoom(p)) })).filter((x) => x.out >= 0).sort((a, b) => rank(a) - rank(b));
      for (const x of entrances) {
        const s = x.d.sides[x.out]; const n = sub(s, x.d.centre); const k = len(n) || 1;
        anchors.push(add(standSpot([s[0] + (n[0] / k) * 2.2, s[1] + (n[1] / k) * 2.2], solids)));
        add(standSpot([s[0] + (n[0] / k) * 0.6, s[1] + (n[1] / k) * 0.6], solids));
      }
      if (!anchors.length && start && li === 0) anchors.push(add(start));
      if (!anchors.length && roomNodes.length) anchors.push(roomNodes[0].node);
    }
    // Stairs up from this level (to the next one in the order).
    const climbs = next ? project.stairs.filter((s) => s.level === level.id).map((s) => stairClimb(project, s)).filter((c) => c.steps.length) : [];
    // A stair that starts against (or in) a wall: the walk goes to its first step clear of the walls instead.
    if (solids.length) {
      const wallGap = (p) => Math.min(...solids.map((s) => pointSegmentDistance(p, s.a, s.b) - s.half));
      for (const c of climbs) {
        if (wallGap(c.from) >= CLEARANCE) continue;
        const k = Math.max(0, c.steps.findIndex((s) => wallGap([s[0], s[2]]) >= 0.1));
        c.points0 = [c.steps[k][0], c.steps[k][2]];
        c.skip = k + 1;
      }
    }
    for (const c of climbs) c.node = add(c.points0 ?? c.from);
    const stairNodes = new Set(climbs.map((c) => c.node));
    // Turning points: just off the ends of the walls and in the corners of the rooms — an open plan in an L
    // (living room → hall) needs a corner to walk round.
    const firstHelper = nodes.length;
    const keep = (p) => solids.every((s) => pointSegmentDistance(p, s.a, s.b) - s.half >= CLEARANCE + 0.05);
    for (const s of solids) {
      const d = sub(s.b, s.a); const L = len(d) || 1; const u = [d[0] / L, d[1] / L]; const n = [-u[1], u[0]];
      const r = s.half + CLEARANCE + 0.25;
      for (const [end, sign] of [[s.a, -1], [s.b, 1]]) {
        for (const side of [1, -1]) {
          const p = [end[0] + u[0] * sign * r + n[0] * side * r, end[1] + u[1] * sign * r + n[1] * side * r];
          if (keep(p)) add(p);
        }
      }
    }
    for (const { poly } of levelRooms) {
      const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0);
      const inward = area > 0 ? 1 : -1;
      for (let i = 0; i < poly.length; i++) {
        const prev = poly[(i - 1 + poly.length) % poly.length]; const p = poly[i]; const nx = poly[(i + 1) % poly.length];
        const e1 = sub(p, prev); const e2 = sub(nx, p); const l1 = len(e1) || 1; const l2 = len(e2) || 1;
        const n1 = [(-e1[1] / l1) * inward, (e1[0] / l1) * inward]; const n2 = [(-e2[1] / l2) * inward, (e2[0] / l2) * inward];
        const q = [p[0] + (n1[0] + n2[0]) * 0.55, p[1] + (n1[1] + n2[1]) * 0.55];
        if (inPoly(q, poly) && keep(q)) add(q);
      }
    }
    // Turning points closer than 0.3 m to one already there add nothing.
    for (let i = nodes.length - 1; i >= firstHelper; i--) {
      const q = nodes[i];
      let dup = false;
      for (let j = 0; j < i && !dup; j++) dup = dist(nodes[j], q) < 0.3;
      if (dup) nodes.splice(i, 1);
    }
    // Edges: straight walks clear of the walls; a door's two sides always join (the walk goes through the gap).
    // Only walls near a pair can block it (bounding boxes first: big floors have hundreds of walls).
    const edges = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]; const b = nodes[j];
        const w = dist(a, b);
        if (w > 40) continue; // a sports hall's middle is far from its doors
        const tight = stairNodes.has(i) || stairNodes.has(j);
        const pad = 0.6;
        const bx0 = Math.min(a[0], b[0]) - pad; const bx1 = Math.max(a[0], b[0]) + pad; const bz0 = Math.min(a[1], b[1]) - pad; const bz1 = Math.max(a[1], b[1]) + pad;
        let ok = true;
        for (const s of solids) {
          if (Math.max(s.a[0], s.b[0]) < bx0 || Math.min(s.a[0], s.b[0]) > bx1 || Math.max(s.a[1], s.b[1]) < bz0 || Math.min(s.a[1], s.b[1]) > bz1) continue;
          if (segmentDistance(a, b, s.a, s.b) < s.half + (tight ? 0.05 : CLEARANCE)) { ok = false; break; }
        }
        if (!ok) continue;
        edges[i].push([j, w]); edges[j].push([i, w]);
      }
    }
    // An anchor or a stair foot nothing reaches: joined with a tight clearance to whatever it sees.
    for (const v of [...anchors, ...stairNodes]) {
      if (edges[v].length) continue;
      for (let j = 0; j < nodes.length; j++) {
        if (j === v || dist(nodes[v], nodes[j]) > 6 || !clearPath(nodes[v], nodes[j], solids, 0.03)) continue;
        const w = dist(nodes[v], nodes[j]);
        edges[v].push([j, w]); edges[j].push([v, w]);
      }
    }
    // The doors' points come right after the rooms' (node order above).
    for (let k = 0; k < doors.length; k++) {
      const a = roomNodes.length + 2 * k; const b = a + 1;
      if (!edges[a].some(([v]) => v === b)) { const w = dist(nodes[a], nodes[b]); edges[a].push([b, w]); edges[b].push([a, w]); }
    }
    enters = [];
    if (!anchors.length) continue;
    // Visit order: the nearest room not yet seen (walking distance); when none is reachable any more, the next
    // anchor that reaches one (the player glides there).
    let at = anchors[0]; let path = [nodes[at]];
    const left = new Set(roomNodes.map((r) => r.node));
    const usedAnchors = new Set([at]);
    const visits = [];
    while (left.size) {
      let { d, prev } = dijkstra(nodes.length, edges, at);
      let best = -1;
      for (const v of left) if (d[v] < Infinity && (best < 0 || d[v] < d[best])) best = v;
      if (best < 0) {
        let found = false;
        for (const a of anchors) {
          if (usedAnchors.has(a)) continue;
          usedAnchors.add(a);
          const r = dijkstra(nodes.length, edges, a);
          let b = -1;
          for (const v of left) if (r.d[v] < Infinity && (b < 0 || r.d[v] < r.d[b])) b = v;
          if (b < 0) continue;
          ({ d, prev } = r); best = b; at = a; path = [nodes[a]]; found = true;
          break;
        }
        if (!found) break;
      }
      const sp = []; for (let v = best; v >= 0; v = prev[v]) sp.unshift(v);
      path.push(...sp.slice(1).map((i) => nodes[i]));
      left.delete(best);
      const r = roomNodes.find((x) => x.node === best).room;
      visits.push({ path: simplify(path, solids), room: r, at: nodes[best] });
      path = [nodes[best]];
      at = best;
    }
    for (const v of visits) {
      if (v.path.length > 1) moves.push({ type: "walk", level: level.id, points: v.path });
      rooms.push(moves.length);
      moves.push({ type: "look", level: level.id, at: v.at, room: v.room.id, name: v.room.name ?? "" });
    }
    // Rooms no walk reaches (no door drawn): the camera glides in (the player glides to a move that starts elsewhere).
    for (const r of roomNodes) {
      if (!left.has(r.node)) continue;
      rooms.push(moves.length);
      moves.push({ type: "look", level: level.id, at: nodes[r.node], room: r.room.id, name: r.room.name ?? "", glide: true });
    }
    if (!climbs.length) continue;
    // Up the nearest stair; every stair's exit is an anchor on the next level (the climbed one first).
    const up = levelObstacles(project, next.id).solids;
    const upPolys = project.rooms.filter((r) => r.level === next.id && r.pts?.length >= 3).map(roomPoly);
    const exitOf = (c) => {
      // Off the top step onto the upper floor: past the exit, or (a flight that ends at a wall) the nearest clear spot.
      const top = c.steps.at(-1);
      let off = standSpot(c.to, up, upPolys);
      if (!clearPath([top[0], top[2]], off, up, 0.03)) off = standSpot([top[0], top[2]], up, upPolys);
      return off;
    };
    const { d } = dijkstra(nodes.length, edges, at);
    const reachable = climbs.filter((c) => d[c.node] < Infinity).sort((a, b) => d[a.node] - d[b.node]);
    const climb = reachable[0];
    if (climb) {
      const sp = shortestPath(nodes, edges, at, climb.node);
      const pts = simplify(sp.path.map((i) => nodes[i]), solids);
      if (pts.length > 1) moves.push({ type: "walk", level: level.id, points: pts });
      const foot = climb.points0 ?? climb.from;
      const off = exitOf(climb);
      const rise = (next.elevation - level.elevation) * M;
      moves.push({ type: "climb", from: level.id, to: next.id, points: [[foot[0], 0, foot[1]], ...climb.steps.slice(climb.skip ?? 0), [off[0], rise, off[1]]] });
      enters.push(off);
    }
    for (const c of climbs) if (c !== climb) enters.push(exitOf(c));
  }
  const total = rooms.length;
  rooms.forEach((i, n) => { moves[i].index = n + 1; moves[i].total = total; });
  return moves;
}
