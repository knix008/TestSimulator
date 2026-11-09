// Floor-plan editing (pure math, Node-testable): structural columns and the
// "sticky" plan — walls and columns that meet at one point move together —,
// rectangles of walls for the Room tool, wall length/thickness edits that keep
// the joins, and rooms found again after walls were drawn.
//
// Columns are ordinary objects (project.objects) of the library item 'column':
// every column is structure. Its centre (position x, z) is a plan node: a wall
// end within JOIN_TOL of it is joined to it, so moving the column drags the
// wall ends, and moving the walls drags the column.
import { detectRoom, pointInPolygon, projectOnSegment, wallDir, wallLength, wallNormal } from './walls.js';
import { polygonArea, polygonCentroid } from './document.js';

export const JOIN_TOL = 0.01;
const near = (p, q, tol = JOIN_TOL) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;

// 'column' and its library variants ('column-concrete-square' …).
export const isColumn = (o) => Boolean(o && typeof o.item === 'string' && /^column(-|$)/.test(o.item));
export const columnsOf = (project, level = null) => (project.objects ?? []).filter((o) => isColumn(o) && (level == null || o.level === level));
export const columnCentre = (o) => [o.position[0], o.position[2]];

/** { shape: 'round' | 'square' | 'rect', w, d } of a column (metres, before the object's scale). */
export function columnShape(o) {
  const p = o.params ?? {};
  const shape = ['round', 'square', 'rect'].includes(p.shape) ? p.shape : 'round';
  const w = Number(p.size) > 0 ? Number(p.size) : 0.35;
  const d = shape === 'rect' ? (Number(p.depth) > 0 ? Number(p.depth) : 0.6) : w;
  return { shape, w, d };
}

/** The column's outline on the plan, counter-clockwise [[x, z], …] (rotation and scale applied). */
export function columnFootprint(o, segments = 32) {
  const { shape, w, d } = columnShape(o);
  const sx = Math.abs(o.scale?.[0] ?? 1); const sz = Math.abs(o.scale?.[2] ?? 1);
  const local = shape === 'round'
    ? Array.from({ length: segments }, (_, i) => { const a = (i / segments) * Math.PI * 2; return [Math.cos(a) * w / 2, -Math.sin(a) * w / 2]; })
    : [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
  const ry = o.rotation?.[1] ?? 0;
  const c = Math.cos(ry); const s = Math.sin(ry);
  // three.js rotation about +Y: x' = x·cos + z·sin, z' = −x·sin + z·cos.
  return local.map(([x, z]) => { const X = x * sx; const Z = z * sz; return [o.position[0] + X * c + Z * s, o.position[2] - X * s + Z * c]; });
}

/** Snap points of the columns of a level: their centres (endpoint inference) for the wall and column tools. */
export const columnSnapPoints = (project, level) => columnsOf(project, level).map((o) => [columnCentre(o), 'endpoint']);

/** Columns whose centre is a wall end (or lies on a wall's centre line) of the same level. */
export function columnsAtWall(project, wall) {
  return columnsOf(project, wall.level).filter((o) => near(columnCentre(o), wall.a) || near(columnCentre(o), wall.b));
}

/**
 * Moves walls and columns by a plan vector, dragging what is joined to them: the ends of other walls
 * at a moved wall end or a moved column, and the columns at the ends of moved walls.
 * `walls` / `columns` = ids that move whole. Mutates the project; returns the ids that moved.
 */
export function moveJoined(project, { walls = [], columns = [] }, delta) {
  const dx = delta[0]; const dz = delta[1];
  const wallSet = new Set(walls); const colSet = new Set(columns);
  const moved = new Set();
  const nodes = [];
  for (const w of project.walls) if (wallSet.has(w.id)) nodes.push({ level: w.level, p: [...w.a] }, { level: w.level, p: [...w.b] });
  for (const o of project.objects) if (colSet.has(o.id) && isColumn(o)) nodes.push({ level: o.level, p: columnCentre(o) });
  const isNode = (level, q) => nodes.some((n) => n.level === level && near(n.p, q));
  const shift = (q) => [q[0] + dx, q[1] + dz];
  for (const w of project.walls) {
    if (wallSet.has(w.id)) { w.a = shift(w.a); w.b = shift(w.b); moved.add(w.id); continue; }
    let hit = false;
    if (isNode(w.level, w.a)) { w.a = shift(w.a); hit = true; }
    if (isNode(w.level, w.b)) { w.b = shift(w.b); hit = true; }
    if (hit) moved.add(w.id);
  }
  for (const o of project.objects) {
    if (!isColumn(o)) continue;
    if (colSet.has(o.id) || isNode(o.level, columnCentre(o))) { o.position = [o.position[0] + dx, o.position[1], o.position[2] + dz]; moved.add(o.id); }
  }
  return [...moved];
}

/** Moves one plan node (a wall end or column centre) to `to`: every wall end and column there follows. */
export function moveNode(project, level, from, to) {
  for (const w of project.walls) {
    if (w.level !== level) continue;
    if (near(w.a, from)) w.a = [...to];
    if (near(w.b, from)) w.b = [...to];
  }
  for (const o of columnsOf(project, level)) if (near(columnCentre(o), from)) o.position = [to[0], o.position[1], to[1]];
}

/** Wall length from its start: the end node moves along the wall (joined walls and columns follow). */
export function setWallLength(project, wall, length) {
  const d = wallDir(wall);
  moveNode(project, wall.level, [...wall.b], [wall.a[0] + d[0] * length, wall.a[1] + d[1] * length]);
}

/**
 * New thickness keeping a face where it is: align 'center' (both faces move), 'left' or 'right' (that face stays;
 * the centre line shifts and joined walls are cut back or extended to it, columns at the ends follow).
 */
export function setWallThickness(project, wall, thickness, align = 'center') {
  const old = wall.thickness ?? 0.15;
  wall.thickness = thickness;
  if (align !== 'left' && align !== 'right') return;
  offsetWall(project, wall, (align === 'left' ? 1 : -1) * (old - thickness) / 2);
}

/**
 * Moves a wall's centre line sideways by `s` along its left normal (+n). At each end the node slides along
 * the first joined wall that is not a straight continuation (so that wall stretches or shortens along
 * itself and the join holds); a straight continuation only bends towards the new end. Columns at the ends
 * follow. With `butts`, walls that end on this wall's side (T-junctions) are stretched to the new line too.
 */
export function offsetWall(project, wall, s, { butts = false } = {}) {
  if (Math.abs(s) < 1e-9) return;
  const n = wallNormal(wall);
  const d = wallDir(wall);
  const tee = [];
  if (butts) {
    const L = wallLength(wall);
    for (const w of project.walls) {
      if (w === wall || w.level !== wall.level) continue;
      for (const e2 of ['a', 'b']) {
        const q = w[e2];
        const t = (q[0] - wall.a[0]) * d[0] + (q[1] - wall.a[1]) * d[1];
        const off = (q[0] - wall.a[0]) * n[0] + (q[1] - wall.a[1]) * n[1];
        if (t > JOIN_TOL && t < L - JOIN_TOL && Math.abs(off) < JOIN_TOL) tee.push([w, e2]);
      }
    }
  }
  for (const end of ['a', 'b']) {
    const from = [...wall[end]];
    let to = [from[0] + n[0] * s, from[1] + n[1] * s];
    const joined = [];
    for (const w of project.walls) {
      if (w === wall || w.level !== wall.level) continue;
      for (const e2 of ['a', 'b']) if (near(w[e2], from)) joined.push([w, e2]);
    }
    // The node slides along the first joined wall that is not a straight continuation, to the shifted
    // centre line ((from + wd·k − to) · n = 0); everything at the node goes there, so the joins hold.
    for (const [w] of joined) {
      const wd = wallDir(w);
      if (Math.abs(wd[0] * d[1] - wd[1] * d[0]) < 1e-6) continue;
      const k = ((to[0] - from[0]) * n[0] + (to[1] - from[1]) * n[1]) / (wd[0] * n[0] + wd[1] * n[1]);
      to = [from[0] + wd[0] * k, from[1] + wd[1] * k];
      break;
    }
    for (const [w, e2] of joined) w[e2] = [...to];
    for (const o of columnsOf(project, wall.level)) if (near(columnCentre(o), from)) o.position = [to[0], o.position[1], to[1]];
    wall[end] = to;
  }
  // T-junctions: the butting wall's end slides along that wall to the moved line (when it is not parallel).
  for (const [w, e2] of tee) {
    const other = e2 === 'a' ? w.b : w.a;
    const wd = [w[e2][0] - other[0], w[e2][1] - other[1]];
    const den = wd[0] * n[0] + wd[1] * n[1];
    if (Math.abs(den) < 1e-9) continue;
    const from = [...w[e2]];
    const k = ((wall.a[0] - other[0]) * n[0] + (wall.a[1] - other[1]) * n[1]) / den;
    const to = [other[0] + wd[0] * k, other[1] + wd[1] * k];
    moveNode(project, wall.level, from, to);
  }
}

/**
 * Rooms of the levels whose walls moved follow them: each room is found again from the walls around a
 * point inside it (rooms in `skip`, e.g. moved along with the walls, stay as they are). Returns the ids changed.
 */
export function refitRooms(project, levels, skip = new Set()) {
  const changed = [];
  for (const room of project.rooms) {
    if (!levels.has(room.level) || skip.has(room.id) || room.points.length < 3) continue;
    let probe = polygonCentroid(room.points);
    if (!pointInPolygon(probe, room.points)) {
      // A concave room: a point just inside its first corner.
      const [p, q, r] = [room.points.at(-1), room.points[0], room.points[1]];
      probe = [q[0] + ((p[0] - q[0]) + (r[0] - q[0])) * 0.05, q[1] + ((p[1] - q[1]) + (r[1] - q[1])) * 0.05];
      if (!pointInPolygon(probe, room.points)) continue;
    }
    const poly = detectRoom(project.walls, probe, room.level);
    if (!poly || polygonArea(poly) < 0.3) continue;
    if (poly.length === room.points.length && poly.every((pt, i) => near(pt, room.points[i], 1e-4))) continue;
    room.points = poly;
    changed.push(room.id);
  }
  return changed;
}

// ───────────────────────── rectangles (Room tool)

/**
 * The four sides of a rectangle as wall segments, leaving out the stretches already covered by collinear
 * walls of the level (so a room drawn against an existing room shares its wall instead of doubling it).
 * Returns [[a, b], …] in counter-clockwise order on screen (z down: x0,z0 → x1,z0 → x1,z1 → x0,z1).
 */
export function rectangleSegments(walls, corner0, corner1) {
  const x0 = Math.min(corner0[0], corner1[0]); const x1 = Math.max(corner0[0], corner1[0]);
  const z0 = Math.min(corner0[1], corner1[1]); const z1 = Math.max(corner0[1], corner1[1]);
  const sides = [[[x0, z0], [x1, z0]], [[x1, z0], [x1, z1]], [[x1, z1], [x0, z1]], [[x0, z1], [x0, z0]]];
  const out = [];
  for (const [a, b] of sides) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    // Covered intervals along this side from collinear walls.
    const cover = [];
    for (const w of walls) {
      const pa = [(w.a[0] - a[0]) * u[0] + (w.a[1] - a[1]) * u[1], (w.a[0] - a[0]) * -u[1] + (w.a[1] - a[1]) * u[0]];
      const pb = [(w.b[0] - a[0]) * u[0] + (w.b[1] - a[1]) * u[1], (w.b[0] - a[0]) * -u[1] + (w.b[1] - a[1]) * u[0]];
      if (Math.abs(pa[1]) > JOIN_TOL || Math.abs(pb[1]) > JOIN_TOL) continue;
      const lo = Math.max(0, Math.min(pa[0], pb[0])); const hi = Math.min(L, Math.max(pa[0], pb[0]));
      if (hi - lo > JOIN_TOL) cover.push([lo, hi]);
    }
    cover.sort((p, q) => p[0] - q[0]);
    let t = 0;
    const at = (v) => [a[0] + u[0] * v, a[1] + u[1] * v];
    for (const [lo, hi] of cover) {
      if (lo - t > JOIN_TOL) out.push([at(t), at(lo)]);
      t = Math.max(t, hi);
    }
    if (L - t > JOIN_TOL) out.push([at(t), at(L)]);
  }
  return out;
}

// ───────────────────────── rooms after drawing walls

const shapeKey = (poly) => poly.map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).sort().join(';');

/**
 * After walls were added: the closed areas on either side of the new walls become rooms. A room that was
 * split by a new partition keeps its name and finishes for one part and lends them to the other.
 * `makeRoom(points, from)` returns a new room (from = the split room or null). Returns { added, changed }.
 */
export function roomsAfterWalls(project, level, newWalls, makeRoom, { minArea = 0.8 } = {}) {
  const walls = project.walls.filter((w) => w.level === level);
  const faces = new Map();
  for (const w of newWalls) {
    const L = wallLength(w);
    if (L < 0.05) continue;
    const d = wallDir(w); const n = wallNormal(w);
    const mid = [w.a[0] + d[0] * L / 2, w.a[1] + d[1] * L / 2];
    const off = (w.thickness ?? 0.15) / 2 + 0.05;
    const sides = [1, -1].map((s) => { const probe = [mid[0] + n[0] * off * s, mid[1] + n[1] * off * s]; return { probe, poly: detectRoom(walls, probe, level) }; });
    // A wall standing free inside one area has the same area on both sides: it closes nothing.
    if (sides[0].poly && sides[1].poly && shapeKey(sides[0].poly) === shapeKey(sides[1].poly)) continue;
    for (const side of sides) {
      if (!side.poly || polygonArea(side.poly) < minArea) continue;
      const key = shapeKey(side.poly);
      if (!faces.has(key)) faces.set(key, side);
    }
  }
  const rooms = project.rooms.filter((r) => r.level === level);
  const existing = new Set(rooms.map((r) => shapeKey(r.points)));
  const used = new Set();
  const before = new Map(rooms.map((r) => [r, r.points]));
  const added = []; const changed = [];
  for (const [key, face] of faces) {
    if (existing.has(key)) continue;
    const host = rooms.find((r) => !used.has(r) && pointInPolygon(face.probe, before.get(r)));
    if (host) { host.points = face.poly; used.add(host); changed.push(host.id); existing.add(key); continue; }
    const from = rooms.find((r) => pointInPolygon(face.probe, before.get(r))) ?? null;
    const room = makeRoom(face.poly, from);
    if (room) { project.rooms.push(room); added.push(room.id); existing.add(key); }
  }
  return { added, changed };
}

// ───────────────────────── walls split and joined at columns

/** An opening's centre kept inside its wall (a wall shorter than the opening holds it in its middle). */
export function clampOpening(o, L) {
  const half = (o.width ?? 0) / 2;
  o.offset = L <= 2 * half ? L / 2 : Math.max(half, Math.min(L - half, o.offset));
}

/**
 * Splits `wall` at distance `t` from its start into two walls joined end to end. The wall object itself
 * becomes the first piece (same id); the second piece is a copy (thickness, height, materials, alignment,
 * tag, curve …) with a new id from `makeId`, inserted right after it. Openings go to the piece their centre
 * is on, with the offset measured from that piece's start. Returns [first, second], or null when `t` is
 * within JOIN_TOL of an end (nothing to split).
 */
export function splitWallAt(project, wall, t, makeId) {
  const L = wallLength(wall);
  if (!(t > JOIN_TOL && t < L - JOIN_TOL)) return null;
  const d = wallDir(wall);
  const m = [wall.a[0] + d[0] * t, wall.a[1] + d[1] * t];
  const second = JSON.parse(JSON.stringify({ ...wall, id: makeId(), a: m, b: [...wall.b] }));
  wall.b = [...m];
  const i = project.walls.indexOf(wall);
  project.walls.splice(i < 0 ? project.walls.length : i + 1, 0, second);
  for (const o of project.openings ?? []) {
    if (o.wall !== wall.id) continue;
    if (o.offset > t) { o.wall = second.id; o.offset -= t; clampOpening(o, L - t); } else clampOpening(o, t);
  }
  return [wall, second];
}

/** Splits every wall of `level` whose centre line passes through `point` (not at its ends). Returns the new walls' ids. */
export function splitWallsAtPoint(project, level, point, makeId) {
  const out = [];
  for (const w of [...project.walls]) {
    if (w.level !== level) continue;
    const L = wallLength(w);
    if (L < 2 * JOIN_TOL) continue;
    const pr = projectOnSegment(point, w.a, w.b);
    if (pr.distance >= JOIN_TOL) continue;
    const parts = splitWallAt(project, w, pr.t * L, makeId);
    if (parts) out.push(parts[1].id);
  }
  return out;
}

/**
 * A column standing in a wall becomes a joint of the plan: a column whose centre is within a wall's half
 * thickness of a wall end moves onto that end; else one inside a wall moves onto its centre line, and the
 * walls through its centre are split there (so moving the column drags both pieces). Returns
 * { moved (the column was snapped), split: [new wall ids] }.
 */
export function attachColumn(project, column, makeId) {
  const level = column.level;
  const c = columnCentre(column);
  const walls = project.walls.filter((w) => w.level === level && wallLength(w) > JOIN_TOL);
  const reach = (w) => Math.max(JOIN_TOL, (w.thickness ?? 0.15) / 2);
  let best = null;
  for (const w of walls) {
    for (const e of ['a', 'b']) {
      const dd = Math.hypot(w[e][0] - c[0], w[e][1] - c[1]);
      if (dd <= reach(w) && (!best || dd < best.d)) best = { p: [...w[e]], d: dd };
    }
  }
  if (!best) {
    for (const w of walls) {
      const L = wallLength(w);
      const pr = projectOnSegment(c, w.a, w.b);
      const t = pr.t * L;
      if (t > JOIN_TOL && t < L - JOIN_TOL && pr.distance <= reach(w) && (!best || pr.distance < best.d)) best = { p: pr.point, d: pr.distance };
    }
  }
  if (!best) return { moved: false, split: [] };
  const moved = best.d > 1e-9;
  if (moved) column.position = [best.p[0], column.position[1], best.p[1]];
  return { moved, split: splitWallsAtPoint(project, level, columnCentre(column), makeId) };
}

/**
 * Splits walls (`wallIds`) at every column of their level standing in them: a column whose centre is inside
 * the wall (within its half thickness of the centre line, not at an end) moves onto the centre line and the
 * wall is split there. Returns the new walls' ids.
 */
export function splitWallsAtColumns(project, wallIds, makeId) {
  const out = [];
  const ids = new Set(wallIds);
  for (const w of project.walls.filter((x) => ids.has(x.id))) {
    for (const col of columnsOf(project, w.level)) {
      // A wall split before is now several pieces: try each of them.
      for (const piece of project.walls.filter((x) => x.id === w.id || out.includes(x.id))) {
        const L = wallLength(piece);
        const pr = projectOnSegment(columnCentre(col), piece.a, piece.b);
        if (pr.distance > Math.max(JOIN_TOL, (piece.thickness ?? 0.15) / 2) || !(pr.t * L > JOIN_TOL && pr.t * L < L - JOIN_TOL)) continue;
        col.position = [pr.point[0], col.position[1], pr.point[1]];
        const parts = splitWallAt(project, piece, pr.t * L, makeId);
        if (parts) { out.push(parts[1].id); break; }
      }
    }
  }
  return out;
}

/** The plan nodes of columns about to be deleted: [{ level, point }]. */
export function columnNodesOf(project, ids) {
  const set = new Set(ids);
  return (project.objects ?? []).filter((o) => set.has(o.id) && isColumn(o)).map((o) => ({ level: o.level, point: columnCentre(o) }));
}

const sameJSON = (p, q) => JSON.stringify(p ?? null) === JSON.stringify(q ?? null);
const swapSide = (side) => (side === 'left' ? 'right' : side === 'right' ? 'left' : side);
const swapAlign = (align) => (align === 'left' ? 'right' : align === 'right' ? 'left' : align);
const sortedEntries = (m) => Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => v != null).sort(([p], [q]) => (p < q ? -1 : 1)));

/**
 * Two walls meeting end to end at `point` on one straight line, alike in every way (thickness, height,
 * materials and alignment — seen in the same direction —, tag, curve), with nothing else there (no column,
 * no third wall end) are merged back into one wall (the first keeps its id and direction; openings of the
 * other move over with their offsets and sides fixed). Returns the merged wall's id or null.
 */
export function mergeWallsAt(project, level, point) {
  if (columnsOf(project, level).some((o) => near(columnCentre(o), point))) return null;
  const ends = [];
  for (const w of project.walls) {
    if (w.level !== level) continue;
    for (const e of ['a', 'b']) if (near(w[e], point)) ends.push([w, e]);
  }
  if (ends.length !== 2 || ends[0][0] === ends[1][0]) return null;
  const [[w1, e1], [w2, e2]] = ends;
  const out = (w, e) => { const d = wallDir(w); return e === 'a' ? d : [-d[0], -d[1]]; };
  const o1 = out(w1, e1); const o2 = out(w2, e2);
  if (Math.abs(o1[0] * o2[1] - o1[1] * o2[0]) > 1e-4 || o1[0] * o2[0] + o1[1] * o2[1] > 0) return null;
  const reversed = e1 === e2; // the two walls run in opposite directions
  const m2 = w2.material ?? {};
  const mat2 = reversed ? { ...m2, left: m2.right, right: m2.left } : m2;
  if (Math.abs((w1.thickness ?? 0.15) - (w2.thickness ?? 0.15)) > 1e-9) return null;
  if ((w1.height ?? null) !== (w2.height ?? null)) return null;
  if (!sameJSON(sortedEntries(w1.material), sortedEntries(mat2))) return null;
  if ((w1.align ?? 'center') !== ((reversed ? swapAlign(w2.align) : w2.align) ?? 'center')) return null;
  if ((w1.tag ?? 'untagged') !== (w2.tag ?? 'untagged') || Boolean(w1.hidden) !== Boolean(w2.hidden) || Boolean(w1.locked) !== Boolean(w2.locked)) return null;
  if ((w1.curve?.id ?? null) !== (w2.curve?.id ?? null)) return null;
  const L1 = wallLength(w1); const L2 = wallLength(w2);
  const far2 = e2 === 'a' ? [...w2.b] : [...w2.a];
  const ops2 = (project.openings ?? []).filter((o) => o.wall === w2.id);
  if (e1 === 'b') {
    // w1 → node → w2: openings of w2 come after w1's length.
    for (const o of ops2) { o.wall = w1.id; o.offset = L1 + (reversed ? L2 - o.offset : o.offset); if (reversed) o.side = swapSide(o.side); }
    w1.b = far2;
  } else {
    // w2 → node → w1 (w1 keeps its direction; its start moves back by w2's length).
    for (const o of project.openings ?? []) if (o.wall === w1.id) o.offset += L2;
    for (const o of ops2) { o.wall = w1.id; o.offset = reversed ? L2 - o.offset : o.offset; if (reversed) o.side = swapSide(o.side); }
    w1.a = far2;
  }
  project.walls = project.walls.filter((w) => w !== w2);
  return w1.id;
}

/** After columns were deleted: the walls they split are merged again where they can be. Returns the merged ids. */
export function mergeWallsAtNodes(project, nodes) {
  return nodes.map((n) => mergeWallsAt(project, n.level, n.point)).filter(Boolean);
}

// ───────────────────────── wall end grips

/** The parts of a level's plan that grip drags change, so each drag step starts from the same state. */
export function planSnapshot(project, level) {
  return {
    walls: new Map(project.walls.filter((w) => w.level === level).map((w) => [w.id, { a: [...w.a], b: [...w.b] }])),
    columns: new Map(columnsOf(project, level).map((o) => [o.id, [...o.position]])),
    openings: new Map((project.openings ?? []).map((o) => [o.id, o.offset])),
    rooms: new Map(project.rooms.filter((r) => r.level === level).map((r) => [r.id, r.points.map((p) => [...p])])),
  };
}

export function restorePlan(project, snap) {
  for (const w of project.walls) { const s = snap.walls.get(w.id); if (s) { w.a = [...s.a]; w.b = [...s.b]; } }
  for (const o of project.objects) { const s = snap.columns.get(o.id); if (s) o.position = [...s]; }
  for (const o of project.openings ?? []) if (snap.openings.has(o.id)) o.offset = snap.openings.get(o.id);
  for (const r of project.rooms) { const s = snap.rooms.get(r.id); if (s) r.points = s.map((p) => [...p]); }
}

/**
 * Openings of walls whose ends moved stay where they were on the wall: measured from the end that stayed
 * (from b when only a moved), else projected onto the new wall; always clamped inside it.
 * `before` = Map wallId → { a, b } before the change (planSnapshot().walls).
 */
export function fixOpenings(project, before) {
  const walls = new Map(project.walls.map((w) => [w.id, w]));
  for (const o of project.openings ?? []) {
    const w = walls.get(o.wall); const s = before.get(o.wall);
    if (!w || !s) continue;
    const sameA = near(w.a, s.a, 1e-9); const sameB = near(w.b, s.b, 1e-9);
    if (sameA && sameB) continue;
    const L = wallLength(w);
    const L0 = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const shift = [w.a[0] - s.a[0], w.a[1] - s.a[1]];
    const translated = near([s.b[0] + shift[0], s.b[1] + shift[1]], w.b, 1e-9);
    if (sameB && !sameA) o.offset = L - (L0 - o.offset);
    else if (!sameA && !translated) {
      const d0 = [(s.b[0] - s.a[0]) / (L0 || 1), (s.b[1] - s.a[1]) / (L0 || 1)];
      const p = [s.a[0] + d0[0] * o.offset, s.a[1] + d0[1] * o.offset];
      o.offset = projectOnSegment(p, w.a, w.b).t * L;
    }
    clampOpening(o, L);
  }
}

const endsOf = (project, level) => new Map(project.walls.filter((w) => w.level === level).map((w) => [w.id, { a: [...w.a], b: [...w.b] }]));

/**
 * Moves one end of a wall to `to`. Joined walls and columns at that end follow (moveNode), unless `detach`:
 * then only this wall's end moves and it leaves its joins. Openings stay inside their walls.
 */
export function moveWallEnd(project, wall, end, to, { detach = false } = {}) {
  const before = endsOf(project, wall.level);
  if (detach) wall[end] = [...to];
  else moveNode(project, wall.level, [...wall[end]], to);
  fixOpenings(project, before);
}

/** Moves a wall parallel to itself by `s` (along its left normal): joined walls and walls butting on it stretch. */
export function moveWallParallel(project, wall, s) {
  const before = endsOf(project, wall.level);
  offsetWall(project, wall, s, { butts: true });
  fixOpenings(project, before);
}

// ───────────────────────── drawing walls by a face

/**
 * A polyline moved sideways by `offset` along each segment's left normal (n = (−dz, dx)); the corners are
 * where the moved segments meet (mitres). `closed`: the last point joins the first. Parallel neighbours
 * keep the plain offset point.
 */
export function offsetPolyline(points, offset, closed = false) {
  const n = points.length;
  if (!offset || n < 2) return points.map((p) => [...p]);
  const segs = [];
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p = points[i]; const q = points[(i + 1) % n];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const d = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
    const nn = [-d[1], d[0]];
    segs.push({ p: [p[0] + nn[0] * offset, p[1] + nn[1] * offset], q: [q[0] + nn[0] * offset, q[1] + nn[1] * offset], d });
  }
  const meet = (s1, s2) => {
    const den = s1.d[0] * s2.d[1] - s1.d[1] * s2.d[0];
    if (Math.abs(den) < 1e-9) return [...s2.p];
    const t = ((s2.p[0] - s1.p[0]) * s2.d[1] - (s2.p[1] - s1.p[1]) * s2.d[0]) / den;
    return [s1.p[0] + s1.d[0] * t, s1.p[1] + s1.d[1] * t];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) out.push([...segs[0].p]);
    else if (!closed && i === n - 1) out.push([...segs[n - 2].q]);
    else out.push(meet(segs[(i - 1 + segs.length) % segs.length], segs[i % segs.length]));
  }
  return out;
}

/**
 * The centre line of walls drawn along one of their faces: `align` 'center' (the points are the centre
 * line), 'left' (the points are the left face, +n side — the same convention as a wall's `align`, "thickness
 * from", in the Entity panel) or 'right'. Corners mitre where the offset segments meet.
 */
export function faceToCentre(points, thickness, align = 'center', closed = false) {
  const s = align === 'left' ? -1 : align === 'right' ? 1 : 0;
  return offsetPolyline(points, (s * thickness) / 2, closed);
}

// ───────────────────────── curved walls (chains of short straight walls)

/**
 * The straight pieces of a curved wall: an arc around `center` ([x, z]) of radius `r` from angle `a0` to
 * `a1` (radians; the point at angle a is [cx + r·cos a, cz + r·sin a]; a1 < a0 runs the other way), cut into
 * equal chords with at most `maxError` between chord and arc (default 1 cm) and at most `maxLength` long
 * (default 0.3 m). Returns [[a, b], …] in order from a0 to a1; consecutive pieces share their end points
 * exactly. `start` / `end` replace the first / last point (exact click points).
 * Each wall made from them carries `curve: { id, cx, cz, r, a0, a1 }` (the whole arc; arcCurve()).
 */
export function arcWallSegments(center, r, a0, a1, { maxError = 0.01, maxLength = 0.3, start = null, end = null } = {}) {
  const sweep = a1 - a0;
  if (!(r > 0) || Math.abs(sweep) < 1e-9) return [];
  const bySag = maxError >= r ? Math.PI : 2 * Math.acos(1 - maxError / r);
  const byLen = maxLength >= 2 * r ? Math.PI : 2 * Math.asin(maxLength / (2 * r));
  const step = Math.min(bySag, byLen);
  const count = Math.max(1, Math.ceil(Math.abs(sweep) / step - 1e-9));
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const a = a0 + (sweep * i) / count;
    pts.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
  }
  if (start) pts[0] = [...start];
  if (end) pts[count] = [...end];
  const out = [];
  for (let i = 0; i < count; i++) out.push([pts[i], pts[i + 1]]);
  return out;
}

/** The `curve` record stored on every piece of a curved wall. */
export const arcCurve = (id, center, r, a0, a1) => ({ id, cx: center[0], cz: center[1], r, a0, a1 });

/** The arc from p0 to p1 through pm: { cx, cz, r, a0, a1 } (null when the three points are on a line). */
export function arcFromThreePoints(p0, p1, pm) {
  const [ax, az] = p0; const [bx, bz] = p1; const [mx, mz] = pm;
  const den = 2 * (ax * (bz - mz) + bx * (mz - az) + mx * (az - bz));
  const scale = Math.max(1e-9, Math.hypot(bx - ax, bz - az) ** 2);
  if (Math.abs(den) < 1e-6 * scale) return null;
  const a2 = ax * ax + az * az; const b2 = bx * bx + bz * bz; const m2 = mx * mx + mz * mz;
  const ox = (a2 * (bz - mz) + b2 * (mz - az) + m2 * (az - bz)) / den;
  const oz = (a2 * (mx - bx) + b2 * (ax - mx) + m2 * (bx - ax)) / den;
  const r = Math.hypot(ax - ox, az - oz);
  const ang = (p) => Math.atan2(p[1] - oz, p[0] - ox);
  const a0 = ang(p0);
  const ccw = (a) => { let v = a - a0; while (v < 0) v += Math.PI * 2; while (v >= Math.PI * 2) v -= Math.PI * 2; return v; };
  const toB = ccw(ang(p1)); const toM = ccw(ang(pm));
  // Increasing angle when the middle point comes before the end that way round, else decreasing.
  const a1 = toM < toB ? a0 + toB : a0 - (Math.PI * 2 - toB);
  return { cx: ox, cz: oz, r, a0, a1 };
}

/**
 * The arc of radius `r` from p0 to p1 bulging towards `side` (any point on the side it bows out to): the
 * shorter of the two arcs (a radius below half the chord becomes a half circle). { cx, cz, r, a0, a1 } or null.
 */
export function arcFromRadius(p0, p1, r, side) {
  const dx = p1[0] - p0[0]; const dz = p1[1] - p0[1];
  const c = Math.hypot(dx, dz);
  if (c < 1e-6 || !(r > 0)) return null;
  const h = c / 2;
  const R = Math.max(r, h);
  const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  let nrm = [-dz / c, dx / c];
  if ((side[0] - mid[0]) * nrm[0] + (side[1] - mid[1]) * nrm[1] < 0) nrm = [-nrm[0], -nrm[1]];
  const sag = R - Math.sqrt(Math.max(0, R * R - h * h));
  return arcFromThreePoints(p0, p1, [mid[0] + nrm[0] * sag, mid[1] + nrm[1] * sag]);
}

/** The pieces of the curved wall `wall` belongs to (walls of its level sharing its curve id). */
export function curveChain(project, wall) {
  const id = wall?.curve?.id;
  if (!id) return wall ? [wall] : [];
  return project.walls.filter((w) => w.level === wall.level && w.curve?.id === id);
}

/** { r, segments, length, sweep (radians) } of a curved wall's pieces (null when they do not share one curve). */
export function curveInfo(walls) {
  const c = walls[0]?.curve;
  if (!c || walls.some((w) => w.curve?.id !== c.id)) return null;
  return { r: c.r, segments: walls.length, length: walls.reduce((s, w) => s + wallLength(w), 0), sweep: Math.abs(c.a1 - c.a0) };
}
