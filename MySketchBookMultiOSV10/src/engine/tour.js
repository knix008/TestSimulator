// Automatic walk-through ("자동 둘러보기"): a route through the building at eye height — in at the entrance,
// through the doors (and open plans) into every room, a slow look round in each, up the stairs to the next level —
// and a player that walks the camera along it.
//
// planTour(project) is pure (plan coordinates [x, z] in metres, levels by elevation) and unit-tested;
// TourPlayer drives a viewport (engine/viewport.js calls its step() from the render loop).
import * as THREE from 'three';
import { pointInPolygon } from './walls.js';
import { isStairs, stairLayout, toWorld } from './stairs.js';

export const EYE_HEIGHT = 1.6;
/** Walking speed (m/s) at speed 1, and the time of the look round in a room (s). */
export const WALK_SPEED = 1.1;
export const LOOK_TIME = 9;
const CLEARANCE = 0.18; // metres kept from a wall face
const DOOR_STEP = 0.45; // waypoint distance in front of / behind a door, from the wall face

// ───────────────────────── geometry

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

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

/** Openings one walks through: doors of every kind, and tall openings that start at the floor. */
export const isPassable = (o) => /^door/.test(o.item ?? '') || ((o.sill ?? 0) < 0.1 && (o.height ?? 0) >= 1.8);

/**
 * The solid parts of a level's walls (centre-line pieces between the door gaps) with their half thickness,
 * and the door crossings: { solids: [{ a, b, half }], doors: [{ id, item, centre, normal, half, sides: [p, q] }] }.
 */
export function levelObstacles(project, levelId) {
  const walls = project.walls.filter((w) => w.level === levelId);
  const solids = [];
  const doors = [];
  for (const w of walls) {
    const d = sub(w.b, w.a); const L = len(d);
    if (L < 1e-6) continue;
    const u = [d[0] / L, d[1] / L]; const n = [-u[1], u[0]];
    const half = (w.thickness ?? 0.2) / 2;
    const at = (t) => [w.a[0] + u[0] * t, w.a[1] + u[1] * t];
    const gaps = project.openings.filter((o) => o.wall === w.id && isPassable(o))
      .map((o) => ({ o, t0: Math.max(0, o.offset - o.width / 2), t1: Math.min(L, o.offset + o.width / 2) }))
      .filter((g) => g.t1 - g.t0 > 0.3)
      .sort((x, y) => x.t0 - y.t0);
    let t = 0;
    for (const g of gaps) {
      if (g.t0 > t + 1e-3) solids.push({ a: at(t), b: at(g.t0), half });
      t = Math.max(t, g.t1);
      const c = at((g.t0 + g.t1) / 2); const k = half + DOOR_STEP;
      doors.push({ id: g.o.id, item: g.o.item, centre: c, normal: n, width: g.t1 - g.t0, half, sides: [[c[0] + n[0] * k, c[1] + n[1] * k], [c[0] - n[0] * k, c[1] - n[1] * k]] });
    }
    if (L > t + 1e-3) solids.push({ a: at(t), b: at(L), half });
  }
  return { solids, doors };
}

/** Whether one can walk straight from p to q (keeping CLEARANCE from every wall face). */
export function clearPath(p, q, solids, clearance = CLEARANCE) {
  for (const s of solids) if (segmentDistance(p, q, s.a, s.b) < s.half + clearance) return false;
  return true;
}

/** Room clearance at p: distance to the nearest wall face (or room edge). */
function clearanceAt(p, solids, poly) {
  let best = Infinity;
  for (const s of solids) best = Math.min(best, pointSegmentDistance(p, s.a, s.b) - s.half);
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** A standing point in a room: inside it, as far from its walls as the grid finds (the middle of an L-shaped room's larger part). */
export function roomStandPoint(room, solids) {
  const poly = room.points;
  if (!poly?.length) return null;
  const xs = poly.map((p) => p[0]); const zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const z0 = Math.min(...zs); const z1 = Math.max(...zs);
  const step = Math.min(0.4, Math.max(0.1, Math.max(x1 - x0, z1 - z0) / 16));
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  let best = null; let bestScore = -Infinity;
  for (let x = x0 + step / 2; x < x1; x += step) {
    for (let z = z0 + step / 2; z < z1; z += step) {
      const p = [x, z];
      if (!pointInPolygon(p, poly)) continue;
      const c = clearanceAt(p, solids, poly);
      // Clearance first; among nearly equal points the one nearer the middle.
      const score = Math.min(c, 1.4) - 0.02 * dist(p, [cx, cz]);
      if (score > bestScore) { bestScore = score; best = p; }
    }
  }
  return best;
}

// ───────────────────────── graph

function shortestPath(nodes, edges, from, to) {
  const n = nodes.length; const d = new Array(n).fill(Infinity); const prev = new Array(n).fill(-1); const done = new Array(n).fill(false);
  d[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0 || u === to) break;
    done[u] = true;
    for (const [v, w] of edges[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
  }
  if (d[to] === Infinity) return null;
  const path = [];
  for (let v = to; v >= 0; v = prev[v]) path.unshift(v);
  return { path, length: d[to] };
}

function distancesFrom(nodes, edges, from) {
  const n = nodes.length; const d = new Array(n).fill(Infinity); const done = new Array(n).fill(false);
  d[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    for (const [v, w] of edges[u]) if (d[u] + w < d[v]) d[v] = d[u] + w;
  }
  return d;
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

// ───────────────────────── the route

/** The stairs of a level as a climb: { from: [x, z] (in front of the first step), to: [x, z] (past the exit), steps: [[x, y, z]…] }. */
export function stairClimb(o) {
  const L = stairLayout(o.params ?? {});
  const fwd = L.dir ?? [0, -1];
  const from = toWorld(o, [L.start[0] - fwd[0] * 0.6, L.start[1] - fwd[1] * 0.6]);
  const steps = (L.steps ?? []).map((s) => {
    const poly = s.poly ?? [];
    const c = poly.reduce((acc, p) => [acc[0] + p[0] / poly.length, acc[1] + p[1] / poly.length], [0, 0]);
    const w = toWorld(o, c);
    return [w[0], s.y ?? 0, w[1]];
  });
  let to = steps.length ? [steps.at(-1)[0], steps.at(-1)[2]] : toWorld(o, L.start);
  if (L.exit) {
    const m = [(L.exit.a[0] + L.exit.b[0]) / 2, (L.exit.a[1] + L.exit.b[1]) / 2];
    const last = (L.steps ?? []).at(-1)?.poly ?? [];
    const lc = last.length ? last.reduce((acc, p) => [acc[0] + p[0] / last.length, acc[1] + p[1] / last.length], [0, 0]) : m;
    const out = sub(m, lc); const k = len(out) || 1;
    to = toWorld(o, [m[0] + (out[0] / k) * 0.6, m[1] + (out[1] / k) * 0.6]);
  }
  return { from, to, steps, rise: L.rise };
}

/**
 * The walk-through of a project: [{ type: 'walk', level, points: [[x, z]…] } | { type: 'look', level, at, room, name,
 * index, total } | { type: 'climb', from: level id, to: level id, points: [[x, y, z]…] }] — `y` in climbs is above the
 * lower level's floor. `levels`: ids to visit (default: all, lowest first); `start`: [x, z] to start from when the
 * building has no entrance door (the camera's place).
 */
export function planTour(project, { levels = null, start = null } = {}) {
  const order = [...project.levels].sort((a, b) => a.elevation - b.elevation).filter((l) => !levels || levels.includes(l.id));
  const moves = [];
  const rooms = [];
  let enter = null; // where the walk goes on (stairs exit) on the next level
  for (let li = 0; li < order.length; li++) {
    const level = order[li];
    const { solids, doors } = levelObstacles(project, level.id);
    const levelRooms = project.rooms.filter((r) => r.level === level.id && r.points?.length >= 3);
    const nodes = []; const kinds = [];
    const add = (p, kind) => { nodes.push(p); kinds.push(kind); return nodes.length - 1; };
    // Rooms (standing points).
    const roomNodes = [];
    for (const r of levelRooms) {
      const p = roomStandPoint(r, solids);
      if (p) roomNodes.push({ room: r, node: add(p, 'room') });
    }
    // Doors (a point either side).
    const inRoom = (p) => levelRooms.some((r) => pointInPolygon(p, r.points));
    for (const d of doors) { add(d.sides[0], 'door'); add(d.sides[1], 'door'); }
    // Where the walk begins on this level: past the stairs' exit, else in front of the entrance, else `start`.
    let startNode = -1;
    if (enter) startNode = add(enter, 'enter');
    else {
      const entrances = doors.map((d) => ({ d, out: d.sides.findIndex((p) => !inRoom(p)) })).filter((x) => x.out >= 0);
      const front = entrances.find((x) => /entrance|jungmun/.test(x.d.item ?? '')) ?? entrances[0];
      if (front) {
        const s = front.d.sides[front.out]; const n = sub(s, front.d.centre); const k = len(n) || 1;
        startNode = add([s[0] + (n[0] / k) * 2.2, s[1] + (n[1] / k) * 2.2], 'outside');
        add([s[0] + (n[0] / k) * 0.6, s[1] + (n[1] / k) * 0.6], 'outside');
      } else if (start && li === 0) startNode = add(start, 'start');
      else if (roomNodes.length) startNode = roomNodes[0].node;
    }
    // Stairs up from this level (to the next one in the order).
    const next = order[li + 1];
    const stair = next ? project.objects.find((o) => o.level === level.id && isStairs(o)) : null;
    const climb = stair ? stairClimb(stair) : null;
    // A stair that starts against (or in) a wall: the walk goes to its first step clear of the walls instead.
    if (climb && !inRoom(climb.from) && climb.steps.length) {
      const wallGap = (p) => Math.min(...solids.map((s) => pointSegmentDistance(p, s.a, s.b) - s.half));
      const k = Math.max(0, climb.steps.findIndex((s) => wallGap([s[0], s[2]]) >= 0.1));
      climb.points0 = [climb.steps[k][0], climb.steps[k][2]];
      climb.skip = k + 1;
    }
    const stairNode = climb ? add(climb.points0 ?? climb.from, 'stairs') : -1;
    // Turning points: just off the ends of the walls and in the corners of the rooms — an open plan in an L (living
    // room → hall) needs a corner to walk round.
    const firstHelper = nodes.length;
    const keep = (p) => solids.every((s) => pointSegmentDistance(p, s.a, s.b) - s.half >= CLEARANCE + 0.05);
    for (const s of solids) {
      const d = sub(s.b, s.a); const L = len(d) || 1; const u = [d[0] / L, d[1] / L]; const n = [-u[1], u[0]];
      const r = s.half + CLEARANCE + 0.25;
      for (const [end, sign] of [[s.a, -1], [s.b, 1]]) {
        for (const side of [1, -1]) {
          const p = [end[0] + u[0] * sign * r + n[0] * side * r, end[1] + u[1] * sign * r + n[1] * side * r];
          if (keep(p)) add(p, 'corner');
        }
      }
    }
    for (const r of levelRooms) {
      const poly = r.points; const area = poly.reduce((acc, p, i) => { const q = poly[(i + 1) % poly.length]; return acc + p[0] * q[1] - q[0] * p[1]; }, 0);
      const inward = area > 0 ? 1 : -1;
      for (let i = 0; i < poly.length; i++) {
        const prev = poly[(i - 1 + poly.length) % poly.length]; const p = poly[i]; const next = poly[(i + 1) % poly.length];
        const e1 = sub(p, prev); const e2 = sub(next, p); const l1 = len(e1) || 1; const l2 = len(e2) || 1;
        const n1 = [-e1[1] / l1 * inward, e1[0] / l1 * inward]; const n2 = [-e2[1] / l2 * inward, e2[0] / l2 * inward];
        const q = [p[0] + (n1[0] + n2[0]) * 0.55, p[1] + (n1[1] + n2[1]) * 0.55];
        if (pointInPolygon(q, poly) && keep(q)) add(q, 'corner');
      }
    }
    // Corners closer than 0.3 m to one already there add nothing.
    for (let i = nodes.length - 1; i >= firstHelper; i--) {
      if (nodes.slice(0, i).some((q) => dist(q, nodes[i]) < 0.3)) { nodes.splice(i, 1); kinds.splice(i, 1); }
    }
    // Edges: straight walks clear of the walls; a door's two sides always join (the walk goes through the gap).
    const edges = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const tight = i === stairNode || j === stairNode;
        if (dist(nodes[i], nodes[j]) > 16 || !clearPath(nodes[i], nodes[j], solids, tight ? 0.05 : CLEARANCE)) continue;
        const w = dist(nodes[i], nodes[j]);
        edges[i].push([j, w]); edges[j].push([i, w]);
      }
    }
    // The doors' points come right after the rooms' (node order above).
    for (let k = 0; k < doors.length; k++) {
      const a = roomNodes.length + 2 * k; const b = a + 1;
      if (!edges[a].some(([v]) => v === b)) { const w = dist(nodes[a], nodes[b]); edges[a].push([b, w]); edges[b].push([a, w]); }
    }
    if (startNode < 0) continue;
    // Visit order: the nearest room not yet seen (walking distance), until none is reachable.
    let at = startNode; let path = [nodes[at]];
    const left = new Set(roomNodes.map((r) => r.node));
    const visits = [];
    while (left.size) {
      const d = distancesFrom(nodes, edges, at);
      let best = -1;
      for (const v of left) if (d[v] < Infinity && (best < 0 || d[v] < d[best])) best = v;
      if (best < 0) break;
      const sp = shortestPath(nodes, edges, at, best);
      path.push(...sp.path.slice(1).map((i) => nodes[i]));
      left.delete(best);
      const r = roomNodes.find((x) => x.node === best).room;
      visits.push({ path: simplify(path, solids), room: r, at: nodes[best] });
      path = [nodes[best]];
      at = best;
    }
    for (const v of visits) {
      if (v.path.length > 1) moves.push({ type: 'walk', level: level.id, points: v.path });
      rooms.push(moves.length);
      moves.push({ type: 'look', level: level.id, at: v.at, room: v.room.id, name: v.room.name ?? '' });
    }
    // Rooms no walk reaches (no door drawn): the camera glides in (TourPlayer glides to a move that starts elsewhere).
    for (const r of roomNodes) {
      if (!left.has(r.node)) continue;
      rooms.push(moves.length);
      moves.push({ type: 'look', level: level.id, at: nodes[r.node], room: r.room.id, name: r.room.name ?? '', glide: true });
    }
    enter = null;
    if (climb && stairNode >= 0) {
      const sp = shortestPath(nodes, edges, at, stairNode);
      if (sp) {
        const pts = simplify(sp.path.map((i) => nodes[i]), solids);
        if (pts.length > 1) moves.push({ type: 'walk', level: level.id, points: pts });
        const foot = climb.points0 ?? climb.from;
        moves.push({ type: 'climb', from: level.id, to: next.id, points: [[foot[0], 0, foot[1]], ...climb.steps.slice(climb.skip ?? 0), [climb.to[0], next.elevation - level.elevation, climb.to[1]]] });
        enter = climb.to;
      }
    }
  }
  const total = rooms.length;
  rooms.forEach((i, n) => { moves[i].index = n + 1; moves[i].total = total; });
  return moves;
}

// ───────────────────────── player

/**
 * Walks a viewport's camera along a planned tour. viewport.tour = this while it runs; the viewport calls step(now).
 * onChange({ move, index, room: { name, index, total }, paused, done }) reports where it is.
 */
export class TourPlayer {
  constructor(viewport, project, moves, { speed = 1, onChange = () => {} } = {}) {
    this.vp = viewport;
    this.project = project;
    this.moves = moves;
    this.speed = speed;
    this.onChange = onChange;
    this.index = -1;
    this.paused = false;
    this.last = 0;
    this.yaw = null;
  }

  elevation(levelId) { return this.project.levels.find((l) => l.id === levelId)?.elevation ?? 0; }

  start() {
    this.saved = { position: this.vp.camera.position.clone(), target: this.vp.target.clone(), up: this.vp.camera.up.clone(), ortho: this.vp.isOrtho };
    this.vp.setProjection(false, { keepView: false });
    this.vp.camera.up.set(0, 1, 0);
    this.vp.tour = this;
    // The red / green / blue axis lines would cross the rooms at eye height: hidden while the tour runs.
    if (this.vp.axes) { this.axesWere = this.vp.axes.visible; this.vp.axes.visible = false; }
    // A short glide from the current view to the first place on the route.
    const first = this.moves[0];
    const p0 = first.type === 'walk' ? first.points[0] : first.type === 'look' ? first.at : [first.points[0][0], first.points[0][2]];
    const lvl = first.level ?? first.from;
    const p1 = first.type === 'walk' && first.points[1] ? first.points[1] : [p0[0], p0[1] - 1];
    const y = this.elevation(lvl) + EYE_HEIGHT;
    this.vp.animateTo(new THREE.Vector3(p0[0], y, p0[1]), new THREE.Vector3(p1[0], y, p1[1]), new THREE.Vector3(0, 1, 0), 900);
    this.wait = performance.now() + 950;
    this.go(0);
  }

  /** Builds the current move's motion. */
  go(i) {
    this.index = i;
    const m = this.moves[i];
    this.t = 0;
    this.motion = null;
    if (!m) { this.finish(); return; }
    // A move that starts somewhere else (a level reached without stairs): a glide there first.
    const startAt = m.type === 'look' ? new THREE.Vector3(m.at[0], this.elevation(m.level) + EYE_HEIGHT, m.at[1])
      : m.type === 'walk' ? new THREE.Vector3(m.points[0][0], this.elevation(m.level) + EYE_HEIGHT, m.points[0][1])
        : new THREE.Vector3(m.points[0][0], this.elevation(m.from) + m.points[0][1] + EYE_HEIGHT, m.points[0][2]);
    if (!this.wait && startAt.distanceTo(this.vp.camera.position) > 0.6) {
      const yaw = this.currentYaw();
      this.vp.animateTo(startAt, startAt.clone().add(new THREE.Vector3(Math.sin(yaw) * 2, -0.12, Math.cos(yaw) * 2)), new THREE.Vector3(0, 1, 0), 900);
      this.wait = performance.now() + 950;
    }
    if (m.type === 'walk' || m.type === 'climb') {
      const base = m.type === 'walk' ? this.elevation(m.level) : this.elevation(m.from);
      const pts = m.type === 'walk' ? m.points.map((p) => new THREE.Vector3(p[0], base + EYE_HEIGHT, p[1])) : m.points.map((p) => new THREE.Vector3(p[0], base + p[1] + EYE_HEIGHT, p[2]));
      const curve = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5) : new THREE.LineCurve3(pts[0], pts.at(-1));
      const length = curve.getLength();
      this.motion = { curve, length, duration: Math.max(0.6, length / (WALK_SPEED * (m.type === 'climb' ? 0.6 : 1))) };
    } else if (m.type === 'look') {
      this.motion = { duration: LOOK_TIME, startYaw: this.currentYaw() };
    }
    this.report();
  }

  currentYaw() {
    const d = this.vp.target.clone().sub(this.vp.camera.position);
    return Math.atan2(d.x, d.z);
  }

  report() {
    const m = this.moves[this.index];
    const room = [...this.moves.slice(0, this.index + 1)].reverse().find((x) => x.type === 'look');
    const ahead = this.moves.slice(this.index).find((x) => x.type === 'look');
    const shown = m?.type === 'look' ? m : ahead ?? room;
    this.onChange({ move: m, index: this.index, room: shown ? { name: shown.name, index: shown.index, total: shown.total, here: m?.type === 'look' } : null, paused: this.paused, climbing: m?.type === 'climb', done: !m });
  }

  setPaused(p) { this.paused = p; this.last = 0; this.report(); this.vp.requestRender(); }

  /** Goes on after a pause; the view may have been turned or moved by hand meanwhile — back to the route first. */
  resume() {
    const m = this.moves[this.index];
    if (m && this.motion) {
      let pos;
      if (m.type === 'look') pos = new THREE.Vector3(m.at[0], this.elevation(m.level) + EYE_HEIGHT, m.at[1]);
      else pos = this.motion.curve.getPointAt(Math.min(1, Math.max(0, this.t)));
      const yaw = this.currentYaw();
      if (m.type !== 'look') this.yaw = yaw;
      else this.motion.startYaw = yaw - ((this.t < 0.5 ? 2 * this.t * this.t : 1 - 2 * (1 - this.t) * (1 - this.t)) * Math.PI * 2);
      if (pos.distanceTo(this.vp.camera.position) > 0.05 || this.vp.isOrtho) {
        this.vp.setProjection(false, { keepView: false });
        this.vp.animateTo(pos, pos.clone().add(new THREE.Vector3(Math.sin(yaw) * 2, -0.12, Math.cos(yaw) * 2)), new THREE.Vector3(0, 1, 0), 600);
        this.wait = performance.now() + 650;
      }
    }
    this.setPaused(false);
  }
  setSpeed(s) { this.speed = s; }

  /** Jumps to the previous / next room (its look round). */
  skip(dir) {
    const looks = this.moves.map((m, i) => (m.type === 'look' ? i : -1)).filter((i) => i >= 0);
    if (!looks.length) return;
    const now = this.index;
    const target = dir > 0 ? looks.find((i) => i > now) : ([...looks].reverse().find((i) => i < now) ?? looks[0]);
    if (target == null) { this.finish(); return; }
    const m = this.moves[target];
    const y = this.elevation(m.level) + EYE_HEIGHT;
    const yaw = this.currentYaw();
    this.vp.animateTo(new THREE.Vector3(m.at[0], y, m.at[1]), new THREE.Vector3(m.at[0] + Math.sin(yaw), y, m.at[1] + Math.cos(yaw)), new THREE.Vector3(0, 1, 0), 700);
    this.wait = performance.now() + 750;
    this.go(target);
  }

  step(now) {
    if (this.wait && now < this.wait) { this.last = now; return; }
    this.wait = 0;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.paused || !this.motion) { return; }
    const m = this.moves[this.index];
    this.t += (dt * this.speed) / this.motion.duration;
    const k = Math.min(1, this.t);
    const cam = this.vp.camera;
    if (m.type === 'look') {
      // A full turn, slow at the start and the end.
      const e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);
      const yaw = this.motion.startYaw + e * Math.PI * 2;
      this.vp.target.set(cam.position.x + Math.sin(yaw) * 2, cam.position.y - 0.12, cam.position.z + Math.cos(yaw) * 2);
    } else {
      const s = k; // constant speed along the arc
      const pos = this.motion.curve.getPointAt(s);
      const aheadAt = Math.min(1, s + Math.min(0.5, 1.2 / Math.max(0.5, this.motion.length)));
      const ahead = this.motion.curve.getPointAt(aheadAt);
      cam.position.copy(pos);
      const dir = ahead.clone().sub(pos);
      if (m.type === 'walk') dir.y = 0;
      // The view turns towards where the walk goes (smoothly).
      const want = Math.atan2(dir.x, dir.z);
      let yaw = this.yaw ?? this.currentYaw();
      let dy = want - yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      if (dir.lengthSq() > 1e-6) yaw += dy * Math.min(1, dt * 3.2 * this.speed);
      this.yaw = yaw;
      const pitch = m.type === 'climb' ? Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6 : -0.06;
      this.vp.target.set(pos.x + Math.sin(yaw) * 2, pos.y + Math.tan(pitch) * 2, pos.z + Math.cos(yaw) * 2);
    }
    this.vp.syncCameras();
    this.vp.touchInteraction();
    if (this.t >= 1) { this.yaw = m.type === 'look' ? null : this.yaw; this.go(this.index + 1); }
  }

  finish() {
    this.motion = null;
    this.index = this.moves.length;
    this.report();
  }

  /** Ends the tour; `restore` glides back to the view it started from. */
  stop({ restore = true } = {}) {
    if (this.vp.tour === this) this.vp.tour = null;
    if (this.vp.axes && this.axesWere != null) this.vp.axes.visible = this.axesWere;
    if (restore && this.saved) {
      if (this.saved.ortho) this.vp.setProjection(true, { keepView: false });
      this.vp.animateTo(this.saved.position, this.saved.target, this.saved.up, 700);
    }
    this.vp.requestRender();
  }
}
