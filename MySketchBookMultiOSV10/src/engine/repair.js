// After a 2D plan becomes a 3D model, fix the mistakes the checks can correct, then
// the view shows that model. What is left is still listed in Problems, with a way to fix it.
// Pure (no DOM): mutates the project and returns { fixed, remaining }.
import { wallLength, wallDir, wallNormal, pointInPolygon } from './walls.js';
import { swingMeta, swingKind, doorDirection, setDoorDirection, wallQuad, overlapDepth } from './doorswing.js';
import { doorBlockers, doorSwings, checkProject } from './checks.js';
import { isStairs, stairsWorld, syncStairwells } from './stairs.js';

const footprint = (o, size) => {
  const [w, , d] = size;
  const sx = Math.abs(o.scale?.[0] ?? 1); const sz = Math.abs(o.scale?.[2] ?? 1);
  const hw = (w * sx) / 2; const hd = (d * sz) / 2;
  const c = Math.cos(o.rotation?.[1] ?? 0); const s = Math.sin(o.rotation?.[1] ?? 0);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [o.position[0] + x * c + z * s, o.position[2] - x * s + z * c]);
};

const sizeOf = (item, o) => item?.sizeOf?.(o.params ?? {}) ?? item?.size ?? null;
const hypot = (x, z) => Math.hypot(x, z);
const FIXED = /^(stairs|column)(-|$)/;

/** The nearest wall face to a plan point: { wall, t, side, gap } or null. `side` is +1 on the left normal. */
function nearestFace(p, walls, level) {
  let best = null;
  for (const w of walls) {
    if (w.level !== level) continue;
    const L = wallLength(w);
    if (L < 0.05) continue;
    const d = wallDir(w); const n = wallNormal(w);
    const relx = p[0] - w.a[0]; const relz = p[1] - w.a[1];
    const t = relx * d[0] + relz * d[1];
    if (t < -0.08 || t > L + 0.08) continue;
    const signed = relx * n[0] + relz * n[1];
    const gap = Math.abs(signed) - (w.thickness ?? 0.15) / 2;
    if (!best || gap < best.gap) best = { wall: w, t: Math.min(L, Math.max(0, t)), side: signed >= 0 ? 1 : -1, gap, L, d, n };
  }
  return best;
}

function backOf(o, size) {
  const depth = size[2] * Math.abs(o.scale?.[2] ?? 1);
  const ry = o.rotation?.[1] ?? 0;
  return [o.position[0] - Math.sin(ry) * (depth / 2), o.position[2] - Math.cos(ry) * (depth / 2)];
}

function inRoom(project, level, x, z) {
  const rooms = project.rooms.filter((r) => r.level === level);
  return !rooms.length || rooms.some((r) => pointInPolygon([x, z], r.points));
}

/**
 * Fixes a model built from a 2D plan: openings fit their walls, wall items sit on a wall,
 * raised objects rest on something, doors can open, overlapping pieces are separated,
 * stairs reach the floor above. Returns how many places changed and how many problems remain.
 * @param {object} project
 * @param {(id: string) => object|null} itemOf
 */
export function repairModel(project, itemOf) {
  let fixed = 0;
  const mark = () => { fixed += 1; };
  project.objects ??= [];
  project.openings ??= [];
  project.walls ??= [];
  project.rooms ??= [];

  fitOpenings(project, mark);
  dropShortWalls(project, mark);
  seatWallItems(project, itemOf, mark);
  seatRaised(project, itemOf, mark);
  pullInside(project, itemOf, mark);
  separateOverlaps(project, itemOf, mark);
  fixStairs(project, itemOf, mark);
  clearDoors(project, itemOf, mark);

  const remaining = checkProject(project, itemOf).length;
  return { fixed, remaining };
}

/** Openings sit inside their wall, no wider or taller than it, and not on top of each other. */
function fitOpenings(project, mark) {
  const wallOf = new Map(project.walls.map((w) => [w.id, w]));
  const levelOf = new Map(project.levels.map((l) => [l.id, l]));
  const byWall = new Map();
  for (const o of project.openings) {
    const w = wallOf.get(o.wall);
    if (!w) continue;
    const L = wallLength(w);
    if (L < 0.2) continue;
    if (o.width > L - 0.02) { o.width = Math.max(0.4, L - 0.04); mark(); }
    const half = o.width / 2;
    const lo = half + 0.01; const hi = L - half - 0.01;
    if (hi > lo && (o.offset < lo - 0.001 || o.offset > hi + 0.001)) { o.offset = Math.min(hi, Math.max(lo, o.offset)); mark(); }
    const limit = (w.height ?? levelOf.get(w.level)?.height ?? 2.4) - 0.02;
    if ((o.sill ?? 0) + o.height > limit + 0.001) {
      o.height = Math.max(0.4, limit - (o.sill ?? 0));
      if ((o.sill ?? 0) + o.height > limit) o.sill = Math.max(0, limit - o.height);
      mark();
    }
    if (!byWall.has(o.wall)) byWall.set(o.wall, []);
    byWall.get(o.wall).push(o);
  }
  for (const list of byWall.values()) {
    const sorted = [...list].sort((a, b) => a.offset - b.offset);
    const w = wallOf.get(sorted[0].wall);
    const L = wallLength(w);
    let cursor = 0;
    for (const o of sorted) {
      const half = o.width / 2;
      const hi = L - half - 0.01;
      const need = cursor + half + 0.02;
      if (o.offset < need - 0.001 && need <= hi) { o.offset = need; mark(); }
      cursor = o.offset + half;
    }
  }
}

/** Walls under 10 cm with nothing in them are crumbs left by the drawing. */
function dropShortWalls(project, mark) {
  const used = new Set(project.openings.map((o) => o.wall));
  const drop = new Set(project.walls.filter((w) => !used.has(w.id) && wallLength(w) < 0.1).map((w) => w.id));
  if (!drop.size) return;
  project.walls = project.walls.filter((w) => !drop.has(w.id));
  fixedCount(mark, drop.size);
}

function fixedCount(mark, n) { for (let i = 0; i < n; i++) mark(); }

/** A wall item's back goes onto the nearest real wall face, clear of doors and windows. */
function seatWallItems(project, itemOf, mark) {
  for (const o of project.objects) {
    if (o.hidden || FIXED.test(o.item)) continue;
    const item = itemOf(o.item);
    if ((item?.placement ?? 'floor') !== 'wall') continue;
    const size = sizeOf(item, o);
    if (!size) continue;
    const back = backOf(o, size);
    const face = nearestFace(back, project.walls, o.level);
    if (!face || face.gap <= 0.06 || face.gap > 3) continue;
    const openings = project.openings.filter((op) => op.wall === face.wall.id);
    const t = clearAlong(face, openings, face.t);
    if (t == null) continue;
    const depth = size[2] * Math.abs(o.scale?.[2] ?? 1);
    const half = (face.wall.thickness ?? 0.15) / 2;
    const facePt = [face.wall.a[0] + face.d[0] * t + face.n[0] * face.side * half, face.wall.a[1] + face.d[1] * t + face.n[1] * face.side * half];
    // The back (local −Z) points at the wall.
    const backDir = [-face.side * face.n[0], -face.side * face.n[1]];
    o.rotation = [o.rotation?.[0] ?? 0, Math.atan2(-backDir[0], -backDir[1]), o.rotation?.[2] ?? 0];
    o.position = [facePt[0] - backDir[0] * (0.002 + depth / 2), o.position[1], facePt[1] - backDir[1] * (0.002 + depth / 2)];
    mark();
  }
}

/** A spot on the wall that is not inside a door or a window. */
function clearAlong(face, openings, prefer) {
  const spans = openings.map((o) => [o.offset - o.width / 2 - 0.05, o.offset + o.width / 2 + 0.05]);
  const blocked = (t) => spans.some(([a, b]) => t > a && t < b);
  const ok = (t) => t >= 0.08 && t <= face.L - 0.08 && !blocked(t);
  if (ok(prefer)) return prefer;
  for (let k = 1; k <= 40; k++) {
    for (const s of [1, -1]) {
      const t = prefer + s * k * 0.05;
      if (ok(t)) return t;
    }
  }
  return null;
}

/** Something raised off the floor rests on the piece under it, or comes down to the floor. */
function seatRaised(project, itemOf, mark) {
  const pieces = [];
  for (const o of project.objects) {
    const item = itemOf(o.item);
    const size = sizeOf(item, o);
    const placement = item?.placement ?? 'floor';
    if (!size || o.hidden || (placement !== 'floor' && placement !== 'surface')) continue;
    pieces.push({ o, quad: footprint(o, size), h: size[1] * Math.abs(o.scale?.[1] ?? 1), y: o.position[1] ?? 0 });
  }
  for (const a of pieces) {
    if (a.y <= 0.05 || FIXED.test(a.o.item)) continue;
    let top = null;
    for (const b of pieces) {
      if (b.o === a.o || b.o.level !== a.o.level) continue;
      const at = b.y + b.h;
      if (at > a.y + 0.02) continue;
      if (!pointInPolygon([a.o.position[0], a.o.position[2]], b.quad)) continue;
      if (top == null || at > top) top = at;
    }
    const y = top == null ? 0 : top;
    if (Math.abs(y - a.y) < 0.02) continue;
    a.o.position[1] = y;
    a.y = y;
    mark();
  }
}

/** An object just outside every room steps into the nearest one. */
function pullInside(project, itemOf, mark) {
  for (const o of project.objects) {
    if (o.hidden || FIXED.test(o.item) || isStairs(o)) continue;
    const item = itemOf(o.item);
    if ((item?.placement ?? 'floor') !== 'floor') continue;
    const rooms = project.rooms.filter((r) => r.level === o.level);
    if (!rooms.length || rooms.some((r) => pointInPolygon([o.position[0], o.position[2]], r.points))) continue;
    const next = nearestInside(rooms, [o.position[0], o.position[2]]);
    if (!next) continue;
    o.position[0] = next[0]; o.position[2] = next[1];
    mark();
  }
}

function nearestInside(rooms, p) {
  let best = null;
  for (const r of rooms) {
    const c = r.points.reduce((a, q) => [a[0] + q[0], a[1] + q[1]], [0, 0]).map((v) => v / r.points.length);
    for (let i = 0; i < r.points.length; i++) {
      const a = r.points[i]; const b = r.points[(i + 1) % r.points.length];
      const ab = [b[0] - a[0], b[1] - a[1]];
      const L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / L2));
      const q = [a[0] + ab[0] * t, a[1] + ab[1] * t];
      const inward = [c[0] - q[0], c[1] - q[1]];
      const len = hypot(inward[0], inward[1]) || 1;
      const at = [q[0] + (inward[0] / len) * 0.25, q[1] + (inward[1] / len) * 0.25];
      if (!pointInPolygon(at, r.points)) continue;
      const dist = hypot(at[0] - p[0], at[1] - p[1]);
      if (dist < 0.6 && (!best || dist < best.dist)) best = { at, dist };
    }
  }
  return best?.at ?? null;
}

/** Two floor pieces the check says overlap are pushed apart. A light touch is left alone. */
function separateOverlaps(project, itemOf, mark) {
  for (const pr of checkProject(project, itemOf)) {
    if (pr.code !== 'objectsOverlap') continue;
    const a = project.objects.find((o) => o.id === pr.entity);
    const b = project.objects.find((o) => o.id === pr.params.other);
    if (!a || !b) continue;
    const mover = FIXED.test(a.item) ? b : a;
    const other = mover === a ? b : a;
    if (FIXED.test(mover.item)) continue;
    const item = itemOf(mover.item);
    const otherItem = itemOf(other.item);
    const size = sizeOf(item, mover);
    const otherSize = sizeOf(otherItem, other);
    if (!size || !otherSize) continue;
    if (pushApart(project, { o: mover, size }, { o: other, size: otherSize })) mark();
  }
}

function pushApart(project, mover, other) {
  const from = [other.o.position[0], other.o.position[2]];
  const start = [mover.o.position[0], mover.o.position[2]];
  let dx = start[0] - from[0]; let dz = start[1] - from[1];
  const len = hypot(dx, dz) || 1;
  if (hypot(dx, dz) < 1e-4) { dx = 1; dz = 0; }
  dx /= len; dz /= len;
  for (let k = 1; k <= 24; k++) {
    const x = start[0] + dx * k * 0.05; const z = start[1] + dz * k * 0.05;
    if (!inRoom(project, mover.o.level, x, z)) continue;
    mover.o.position[0] = x; mover.o.position[2] = z;
    if (overlapDepth(footprint(mover.o, mover.size), footprint(other.o, other.size)) <= 0.02) return true;
  }
  mover.o.position[0] = start[0]; mover.o.position[2] = start[1];
  return false;
}

/** A stair's rise matches the level above. A missing stairwell hole is cut only when headroom fails. */
function fixStairs(project, itemOf, mark) {
  const levels = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  for (const o of project.objects) {
    if (!isStairs(o) || o.hidden) continue;
    const world = stairsWorld(project, o);
    const above = levels.find((l) => l.elevation > world.base + 0.3);
    if (!above) continue;
    const needed = above.elevation - world.base;
    const rise = world.top - world.base;
    if (Math.abs(world.top - above.elevation) > 0.02 && rise > needed * 0.6) {
      o.params = { ...(o.params ?? {}), rise: Math.round(needed * 1000) / 1000 };
      mark();
    }
  }
  syncStairwells(project);
  let again = false;
  for (const pr of checkProject(project, itemOf)) {
    if (pr.code !== 'stairsHeadroom') continue;
    const o = project.objects.find((x) => x.id === pr.entity);
    if (!o || o.params?.stairwell !== false) continue;
    o.params = { ...o.params, stairwell: true };
    mark();
    again = true;
  }
  if (again) syncStairwells(project);
}

/** Doors open the way that hits the least, then furniture still in the way slides aside. */
function clearDoors(project, itemOf, mark) {
  for (const o of project.openings) {
    const wall = project.walls.find((w) => w.id === o.wall);
    const item = itemOf(o.item);
    if (!wall || !item || item.category !== 'doors') continue;
    const meta = swingMeta(item, { ...(o.params ?? {}), width: o.width, height: o.height }, wall.thickness ?? 0.15);
    if (!meta || swingKind(meta) !== 'swing') continue;
    const now = doorScore(project, itemOf, o);
    if (now === 0) continue;
    let best = { opening: o, score: now };
    for (const swing of ['left', 'right']) {
      const c = { ...o, params: { ...(o.params ?? {}) }, flip: Boolean(o.flip), side: o.side ?? 'left' };
      setDoorDirection(c, meta, { swing });
      consider(project, itemOf, c, best);
      if (doorDirection(c, meta)?.hinge) {
        const h = { ...c, params: { ...c.params }, flip: c.flip, side: c.side };
        const cur = doorDirection(h, meta).hinge;
        setDoorDirection(h, meta, { hinge: cur === 'left' ? 'right' : 'left' });
        consider(project, itemOf, h, best);
      }
    }
    if (best.opening !== o && best.score < now) {
      o.side = best.opening.side; o.flip = best.opening.flip;
      mark();
    }
  }
  const blocked = (quad, level) => {
    const doors = doorSwings(project, itemOf);
    return doors.some((d) => d.wall.level === level && (d.zones.some((p) => overlapDepth(p, quad) > 0.01) || d.ways.some((p) => overlapDepth(p, quad) > 0.02)));
  };
  for (const b of doorBlockers(project, itemOf)) {
    if (FIXED.test(b.o.item) || !blocked(b.quad, b.o.level)) continue;
    const item = itemOf(b.o.item);
    const size = sizeOf(item, b.o);
    if (!size) continue;
    const ry = b.o.rotation?.[1] ?? 0;
    const axis = [Math.cos(ry), -Math.sin(ry)];
    const start = [b.o.position[0], b.o.position[2]];
    let moved = false;
    for (let k = 1; k <= 24 && !moved; k++) {
      for (const s of [1, -1]) {
        const x = start[0] + axis[0] * s * k * 0.05; const z = start[1] + axis[1] * s * k * 0.05;
        if (!inRoom(project, b.o.level, x, z)) continue;
        b.o.position[0] = x; b.o.position[2] = z;
        if (!blocked(footprint(b.o, size), b.o.level)) { moved = true; break; }
      }
    }
    if (moved) mark();
    else { b.o.position[0] = start[0]; b.o.position[2] = start[1]; }
  }
}

function consider(project, itemOf, opening, best) {
  const score = doorScore(project, itemOf, opening);
  if (score < best.score) { best.opening = opening; best.score = score; }
}

function doorScore(project, itemOf, opening) {
  const openings = project.openings.map((o) => (o.id === opening.id ? opening : o));
  const doors = doorSwings({ openings, walls: project.walls }, itemOf);
  const mine = doors.find((d) => d.o.id === opening.id);
  if (!mine?.sectors) return 0;
  let score = 0;
  const hit = (polys, quad, depth) => polys.some((p) => overlapDepth(p, quad) > depth);
  for (const b of doorBlockers(project, itemOf)) {
    if (b.o.level !== mine.wall.level) continue;
    if (/^column(-|$)/.test(b.o.item)) { if (hit(mine.sectors, b.quad, 0.02)) score += 8; continue; }
    if (hit(mine.zones, b.quad, 0.01)) score += 3;
    else if (hit(mine.ways, b.quad, 0.02)) score += 1;
  }
  for (const w of project.walls) {
    if (w.id === mine.wall.id || w.level !== mine.wall.level || wallLength(w) < 0.05) continue;
    if (hit(mine.sectors, wallQuad(w), 0.02)) score += 8;
  }
  for (const other of doors) {
    if (other === mine || other.wall.level !== mine.wall.level) continue;
    if (mine.sectors.some((p) => hit(other.sectors, p, 0.02))) score += 8;
  }
  return score;
}
