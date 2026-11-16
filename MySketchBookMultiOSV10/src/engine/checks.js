// Model checks for the bottom panel's Problems tab (pure, Node-testable):
// things that are probably mistakes in a floor plan — doors wider than their
// wall, openings overlapping, furniture overlapping or outside every room,
// wall-mounted items standing off a wall, objects raised with nothing under
// them, library items that cannot be found.
// Each problem: { id, severity: 'error' | 'warning' | 'info', code, entity, params }.
// The panel shows check.<code> and a fix direction check.fix.<code> (see CHECK_CODES).
import { wallLength, wallDir, wallNormal, pointInPolygon } from './walls.js';
import { swingMeta, planLeaves, sectorPolygon, doorwayZones, wallQuad, overlapDepth, SWING_BAND } from './doorswing.js';
import { HEADROOM, holePolygons, isStairs, stairsWorld, toWorld } from './stairs.js';

const footprint = (o, size) => {
  // The item's plan rectangle (rotated about Y) as four corners.
  const [w, , d] = size;
  const sx = Math.abs(o.scale?.[0] ?? 1); const sz = Math.abs(o.scale?.[2] ?? 1);
  const hw = (w * sx) / 2; const hd = (d * sz) / 2;
  const c = Math.cos(o.rotation?.[1] ?? 0); const s = Math.sin(o.rotation?.[1] ?? 0);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [o.position[0] + x * c + z * s, o.position[2] - x * s + z * c]);
};

/** Overlap area of two convex quads, estimated on a small grid (good enough for a warning). */
function overlapShare(a, b) {
  const xs = [...a, ...b].map((p) => p[0]); const zs = [...a, ...b].map((p) => p[1]);
  const x0 = Math.max(Math.min(...a.map((p) => p[0])), Math.min(...b.map((p) => p[0])));
  const x1 = Math.min(Math.max(...a.map((p) => p[0])), Math.max(...b.map((p) => p[0])));
  const z0 = Math.max(Math.min(...a.map((p) => p[1])), Math.min(...b.map((p) => p[1])));
  const z1 = Math.min(Math.max(...a.map((p) => p[1])), Math.max(...b.map((p) => p[1])));
  void xs; void zs;
  if (x1 <= x0 || z1 <= z0) return 0;
  let inBoth = 0; let inA = 0; let inB = 0;
  const N = 12;
  const ax0 = Math.min(...a.map((p) => p[0])); const ax1 = Math.max(...a.map((p) => p[0]));
  const az0 = Math.min(...a.map((p) => p[1])); const az1 = Math.max(...a.map((p) => p[1]));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [ax0 + ((i + 0.5) / N) * (ax1 - ax0), az0 + ((j + 0.5) / N) * (az1 - az0)];
    if (!pointInPolygon(p, a)) continue;
    inA += 1;
    if (pointInPolygon(p, b)) inBoth += 1;
  }
  void inB;
  return inA ? inBoth / inA : 0;
}

/** Every check code. The Problems panel shows `check.<code>` and a fix direction `check.fix.<code>`. */
export const CHECK_CODES = [
  'wallShort', 'openingTooWide', 'openingOutside', 'openingTooTall', 'openingsOverlap', 'itemMissing',
  'outsideRooms', 'floating', 'unsupported', 'offWall', 'objectsOverlap',
  'doorBlocked', 'doorwayBlocked', 'doorsCollide', 'doorHitsWall', 'swingBlocked', 'noRooms',
  'stairsRise', 'stairsNoLevel', 'stairsHeadroom',
];

/** Distance from a plan point to the nearest wall face on this level (Infinity when none is near). */
function wallFaceDist(p, walls, level) {
  let best = Infinity;
  for (const w of walls) {
    if (w.level !== level) continue;
    const L = wallLength(w);
    if (L < 0.05) continue;
    const d = wallDir(w);
    const n = wallNormal(w);
    const relx = p[0] - w.a[0];
    const relz = p[1] - w.a[1];
    const t = relx * d[0] + relz * d[1];
    if (t < -0.08 || t > L + 0.08) continue;
    const face = Math.abs(relx * n[0] + relz * n[1]) - (w.thickness ?? 0.15) / 2;
    if (face < best) best = face;
  }
  return best;
}

/** The back of an item (local −Z) in plan, so a wall-mounted piece can be checked against the wall face. */
function backPoint(o, size) {
  const depth = size[2] * Math.abs(o.scale?.[2] ?? 1);
  const ry = o.rotation?.[1] ?? 0;
  return [o.position[0] - Math.sin(ry) * (depth / 2), o.position[2] - Math.cos(ry) * (depth / 2)];
}

/**
 * @param {object} project
 * @param {(id: string) => object|null} itemOf  catalog lookup
 */
export function checkProject(project, itemOf) {
  const out = [];
  const push = (severity, code, entity, params = {}) => out.push({ id: `${code}:${entity ?? ''}:${out.length}`, severity, code, entity, params });
  const walls = new Map(project.walls.map((w) => [w.id, w]));

  for (const w of project.walls) if (wallLength(w) < 0.1) push('warning', 'wallShort', w.id);

  // Openings: within their wall and not overlapping each other.
  const byWall = new Map();
  for (const o of project.openings) {
    const w = walls.get(o.wall);
    if (!w) continue;
    const L = wallLength(w);
    if (o.width > L - 0.02) push('error', 'openingTooWide', o.id, { width: o.width, length: L });
    else if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > L + 0.001) push('error', 'openingOutside', o.id);
    const level = project.levels.find((l) => l.id === w.level);
    if (level && (o.sill ?? 0) + o.height > (w.height ?? level.height) - 0.01) push('error', 'openingTooTall', o.id);
    if (!itemOf(o.item)) push('error', 'itemMissing', o.id, { item: o.item });
    (byWall.get(o.wall) ?? byWall.set(o.wall, []).get(o.wall)).push(o);
  }
  for (const list of byWall.values()) {
    const sorted = [...list].sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1]; const b = sorted[i];
      if (a.offset + a.width / 2 > b.offset - b.width / 2 + 0.005) push('error', 'openingsOverlap', b.id, { other: a.id });
    }
  }

  // Furniture: missing items, outside rooms, floating, overlapping others on the floor.
  const floorObjects = [];
  for (const o of project.objects) {
    const item = itemOf(o.item);
    if (!item) { push('error', 'itemMissing', o.id, { item: o.item }); continue; }
    if (o.hidden) continue;
    const rooms = project.rooms.filter((r) => r.level === o.level);
    // Stairs stand in stairwells (open to the floor below, so without a room of their own).
    // Structural columns (planedit.js) stand in the walls, between rooms or outside them.
    const isStairs = o.item === 'stairs' || (item.tags ?? []).includes('stairs') || /^column(-|$)/.test(o.item);
    if (!isStairs && rooms.length && !rooms.some((r) => pointInPolygon([o.position[0], o.position[2]], r.points))) push('warning', 'outsideRooms', o.id);
    const placement = item.placement ?? 'floor';
    const size = item.sizeOf?.(o.params ?? {}) ?? item.size;
    if (placement === 'wall' && size && project.walls.length) {
      const gap = wallFaceDist(backPoint(o, size), project.walls, o.level);
      if (gap > 0.06) push('warning', 'offWall', o.id, { height: gap });
    }
    const h = size ? size[1] * Math.abs(o.scale?.[1] ?? 1) : 0;
    if ((placement === 'floor' || placement === 'surface') && size) floorObjects.push({ o, quad: footprint(o, size), h, y: o.position[1] ?? 0, rug: /rug|carpet|cushion/.test(item.id), seat: /chair|stool|bench/.test(item.id) && !/armchair|lounge/.test(item.id), table: /table|desk|island|wp-manager|wp-cluster|wp-conf/.test(item.id) && !/side-table|coffee|bedside/.test(item.id) });
  }
  // Raised off the floor with nothing underneath: it is not resting on a piece of furniture, so it would fall.
  for (const a of floorObjects) {
    if (a.y <= 0.05 || /^stairs|column/.test(a.o.item)) continue;
    const held = floorObjects.some((b) => {
      if (b.o === a.o || b.o.level !== a.o.level) return false;
      const top = b.y + b.h;
      if (Math.abs(top - a.y) > 0.12) return false;
      return pointInPolygon([a.o.position[0], a.o.position[2]], b.quad);
    });
    if (!held) push('warning', 'unsupported', a.o.id, { height: a.y });
  }
  for (let i = 0; i < floorObjects.length; i++) {
    for (let j = i + 1; j < floorObjects.length; j++) {
      const A = floorObjects[i]; const B = floorObjects[j];
      if (A.rug || B.rug || A.o.level !== B.o.level || Math.abs(A.y - B.y) > 0.05) continue; // rugs, and things standing on furniture, overlap on purpose
      if ((A.seat && B.table) || (A.table && B.seat)) continue; // chairs tuck under tables and desks
      const share = Math.max(overlapShare(A.quad, B.quad), overlapShare(B.quad, A.quad));
      if (share > 0.35) push('warning', 'objectsOverlap', B.o.id, { other: A.o.id, share: Math.round(share * 100) });
    }
  }

  doorChecks(project, itemOf, walls, push);
  stairChecks(project, push);

  // Walls drawn but no room yet: a hint, not an error.
  for (const level of project.levels) {
    if (project.walls.some((w) => w.level === level.id) && !project.rooms.some((r) => r.level === level.id)) push('info', 'noRooms', null, { level: level.name });
  }
  return out;
}

/** Rugs, mats and other flat things lie under a door leaf. */
const FLAT = /rug|carpet|(^|-)mat($|-)|doormat/;

/**
 * The plan swings of every door (see doorswing.js) of a project: { o (opening), wall, meta,
 * leaves, sectors (the swept quarter discs), zones (sectors + clearance band), ways (doorway
 * zones on the sides the leaf does not sweep) }.
 */
export function doorSwings(project, itemOf, walls = new Map(project.walls.map((w) => [w.id, w]))) {
  const out = [];
  for (const o of project.openings) {
    const w = walls.get(o.wall);
    const item = itemOf(o.item);
    if (!w || !item || item.category !== 'doors' || (o.sill ?? 0) > 0.3) continue;
    const meta = swingMeta(item, { ...(o.params ?? {}), width: o.width, height: o.height }, w.thickness ?? 0.15);
    const leaves = planLeaves(o, w, meta);
    out.push({ o, wall: w, meta, leaves, sectors: leaves.map((l) => sectorPolygon(l, 0)), zones: leaves.map((l) => sectorPolygon(l, SWING_BAND)), ways: doorwayZones(o, w, meta) });
  }
  return out;
}

/** Furniture standing on the floor that a door leaf or a person walking through would hit: { o, quad }. */
export function doorBlockers(project, itemOf) {
  const out = [];
  for (const o of project.objects) {
    if (o.hidden) continue;
    const item = itemOf(o.item);
    if (!item || (item.placement ?? 'floor') !== 'floor' || o.position[1] > 1.9) continue;
    const size = item.sizeOf?.(o.params ?? {}) ?? item.size;
    if (!size || FLAT.test(item.id) || size[1] * Math.abs(o.scale?.[1] ?? 1) < 0.03) continue;
    out.push({ o, quad: footprint(o, size) });
  }
  return out;
}

/** Door checks: furniture in a swing or a doorway, two swings meeting, a leaf hitting a wall. */
function doorChecks(project, itemOf, walls, push) {
  const doors = doorSwings(project, itemOf, walls);
  if (!doors.length) return;
  const blockers = doorBlockers(project, itemOf);
  const hits = (polys, quad, depth = 0.01) => polys.some((p) => overlapDepth(p, quad) > depth);
  for (const d of doors) {
    for (const b of blockers) {
      if (b.o.level !== d.wall.level) continue;
      // A structural column is part of the building: the door is what has to change.
      if (/^column(-|$)/.test(b.o.item)) { if (hits(d.sectors, b.quad, 0.02)) push('warning', 'doorHitsWall', d.o.id, { other: b.o.id }); continue; }
      if (hits(d.zones, b.quad)) push('warning', 'doorBlocked', b.o.id, { other: d.o.id });
      else if (hits(d.ways, b.quad, 0.02)) push('info', 'doorwayBlocked', b.o.id, { other: d.o.id });
    }
    for (const w of project.walls) {
      if (w.id === d.wall.id || w.level !== d.wall.level || wallLength(w) < 0.05) continue;
      if (hits(d.sectors, wallQuad(w), 0.02)) push('warning', 'doorHitsWall', d.o.id, { other: w.id });
    }
  }
  for (let i = 0; i < doors.length; i++) {
    for (let j = i + 1; j < doors.length; j++) {
      const A = doors[i]; const B = doors[j];
      if (A.wall.level !== B.wall.level || !A.sectors.length || !B.sectors.length) continue;
      if (A.sectors.some((s) => hits(B.sectors, s, 0.02))) push('warning', 'doorsCollide', B.o.id, { other: A.o.id });
    }
  }
}

export const countBySeverity =(list) => ({ error: list.filter((p) => p.severity === 'error').length, warning: list.filter((p) => p.severity === 'warning').length, info: list.filter((p) => p.severity === 'info').length });

const PLACE = '__place__';

/**
 * Physical problems of something being placed (or moved), before it is committed.
 * `draft` is an object `{ kind: 'object', level, item, position, rotation, scale, params, id? }`
 * or an opening `{ kind: 'opening', wall, item, offset, width, height, sill, side, flip, params }`.
 * An `id` already in the project is that object at its current position (a move), not a second copy.
 * Returns [{ severity, code, params }] — the same codes the Problems list uses, plus `swingBlocked`
 * when a door being placed would open into furniture.
 */
export function placementProblems(project, draft, itemOf) {
  if (!draft || !project) return [];
  const out = [];
  const push = (severity, code, params = {}) => out.push({ severity, code, params });
  if (draft.kind === 'opening') openingPlacement(project, draft, itemOf, push);
  else objectPlacement(project, draft, itemOf, push);
  return out;
}

function objectPlacement(project, draft, itemOf, push) {
  const existing = draft.id ? project.objects.find((o) => o.id === draft.id) : null;
  const o = existing ?? {
    id: PLACE, level: draft.level, item: draft.item, position: draft.position, rotation: draft.rotation ?? [0, 0, 0],
    scale: draft.scale ?? [1, 1, 1], params: draft.params ?? {}, hidden: false,
  };
  const item = itemOf(o.item);
  if (!item) { push('error', 'itemMissing', { item: o.item }); return; }
  const rooms = project.rooms.filter((r) => r.level === o.level);
  const structural = o.item === 'stairs' || (item.tags ?? []).includes('stairs') || /^column(-|$)/.test(o.item);
  if (!structural && rooms.length && !rooms.some((r) => pointInPolygon([o.position[0], o.position[2]], r.points))) push('warning', 'outsideRooms');
  const placement = item.placement ?? 'floor';
  const size = item.sizeOf?.(o.params ?? {}) ?? item.size;
  if (placement === 'wall' && size && project.walls.length) {
    const gap = wallFaceDist(backPoint(o, size), project.walls, o.level);
    if (gap > 0.06) push('warning', 'offWall', { height: gap });
  }
  if ((placement !== 'floor' && placement !== 'surface') || !size) return;
  const quad = footprint(o, size);
  const y = o.position[1] ?? 0;
  const rug = /rug|carpet|cushion/.test(item.id);
  const seat = /chair|stool|bench/.test(item.id) && !/armchair|lounge/.test(item.id);
  const table = /table|desk|island|wp-manager|wp-cluster|wp-conf/.test(item.id) && !/side-table|coffee|bedside/.test(item.id);
  if (y > 0.05 && !/^stairs|column/.test(o.item)) {
    const held = project.objects.some((b) => {
      if (b === o || b.hidden || b.level !== o.level) return false;
      const bi = itemOf(b.item);
      const bs = bi?.sizeOf?.(b.params ?? {}) ?? bi?.size;
      if (!bs || ((bi.placement ?? 'floor') !== 'floor' && (bi.placement ?? 'floor') !== 'surface')) return false;
      const top = (b.position[1] ?? 0) + bs[1] * Math.abs(b.scale?.[1] ?? 1);
      return Math.abs(top - y) <= 0.12 && pointInPolygon([o.position[0], o.position[2]], footprint(b, bs));
    });
    if (!held) push('warning', 'unsupported', { height: y });
  }
  if (!rug) {
    for (const b of project.objects) {
      if (b === o || b.hidden || b.level !== o.level || Math.abs((b.position[1] ?? 0) - y) > 0.05) continue;
      const bi = itemOf(b.item);
      const bs = bi?.sizeOf?.(b.params ?? {}) ?? bi?.size;
      if (!bs || (bi.placement ?? 'floor') !== 'floor' || /rug|carpet|cushion/.test(bi.id)) continue;
      const bSeat = /chair|stool|bench/.test(bi.id) && !/armchair|lounge/.test(bi.id);
      const bTable = /table|desk|island|wp-manager|wp-cluster|wp-conf/.test(bi.id) && !/side-table|coffee|bedside/.test(bi.id);
      if ((seat && bTable) || (table && bSeat)) continue;
      const bq = footprint(b, bs);
      const share = Math.max(overlapShare(quad, bq), overlapShare(bq, quad));
      if (share > 0.35) push('warning', 'objectsOverlap', { other: b.id, share: Math.round(share * 100) });
    }
  }
  if ((item.placement ?? 'floor') === 'floor' && y < 1.9 && !/rug|carpet|(^|-)mat($|-)|doormat/.test(item.id) && size[1] * Math.abs(o.scale?.[1] ?? 1) >= 0.03) {
    const doors = doorSwings(project, itemOf);
    const hits = (polys, depth) => polys.some((p) => overlapDepth(p, quad) > depth);
    for (const d of doors) {
      if (d.wall.level !== o.level) continue;
      if (/^column(-|$)/.test(o.item)) { if (hits(d.sectors, 0.02)) push('warning', 'doorHitsWall', { other: d.o.id }); continue; }
      if (hits(d.zones, 0.01)) push('warning', 'doorBlocked', { other: d.o.id });
      else if (hits(d.ways, 0.02)) push('info', 'doorwayBlocked', { other: d.o.id });
    }
  }
}

function openingPlacement(project, draft, itemOf, push) {
  const wall = project.walls.find((w) => w.id === draft.wall);
  if (!wall) return;
  const o = {
    id: PLACE, wall: draft.wall, item: draft.item, offset: draft.offset, width: draft.width, height: draft.height,
    sill: draft.sill ?? 0, side: draft.side ?? 'left', flip: Boolean(draft.flip), params: draft.params ?? {},
  };
  const L = wallLength(wall);
  if (o.width > L - 0.02) push('error', 'openingTooWide', { width: o.width, length: L });
  else if (o.offset - o.width / 2 < -0.001 || o.offset + o.width / 2 > L + 0.001) push('error', 'openingOutside');
  const level = project.levels.find((l) => l.id === wall.level);
  if (level && o.sill + o.height > (wall.height ?? level.height) - 0.01) push('error', 'openingTooTall');
  for (const other of project.openings) {
    if (other.wall !== o.wall) continue;
    if (o.offset + o.width / 2 > other.offset - other.width / 2 + 0.005 && other.offset + other.width / 2 > o.offset - o.width / 2 + 0.005) push('error', 'openingsOverlap', { other: other.id });
  }
  const item = itemOf(o.item);
  if (!item || item.category !== 'doors') return;
  const doors = doorSwings({ openings: [...project.openings, o], walls: project.walls }, itemOf);
  const mine = doors.find((d) => d.o.id === PLACE);
  if (!mine) return;
  const hits = (polys, quad, depth) => polys.some((p) => overlapDepth(p, quad) > depth);
  for (const b of doorBlockers(project, itemOf)) {
    if (b.o.level !== mine.wall.level) continue;
    if (hits(mine.zones, b.quad, 0.01) || hits(mine.ways, b.quad, 0.02)) push('warning', 'swingBlocked', { other: b.o.id });
  }
  for (const w of project.walls) {
    if (w.id === wall.id || w.level !== wall.level || wallLength(w) < 0.05) continue;
    if (hits(mine.sectors, wallQuad(w), 0.02)) push('warning', 'doorHitsWall', { other: w.id });
  }
  for (const other of doors) {
    if (other.o.id === PLACE || other.wall.level !== mine.wall.level) continue;
    if (mine.sectors.some((s) => hits(other.sectors, s, 0.02))) push('warning', 'doorsCollide', { other: other.o.id });
  }
}

/**
 * Stairs (engine/stairs.js): the top reaches the level above (rise mismatch → warning), a stair of a
 * storey's height with no level above (info), and headroom: a tread with the slab of a floor above
 * less than 2 m over it and no opening (stairwell hole) there (warning).
 */
export function stairChecks(project, push) {
  const levels = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  for (const o of project.objects) {
    if (!isStairs(o) || o.hidden) continue;
    const world = stairsWorld(project, o);
    const above = levels.find((l) => l.elevation > world.base + 0.3);
    if (above) {
      const needed = above.elevation - world.base;
      const rise = world.top - world.base;
      if (Math.abs(world.top - above.elevation) > 0.02 && rise > needed * 0.6) push('warning', 'stairsRise', o.id, { width: rise, length: needed });
    } else if (world.top - world.base > 1.5) push('info', 'stairsNoLevel', o.id);
    // Headroom under every floor above: the underside of its slab (the top of the level below it).
    let low = null;
    for (const lv of levels) {
      if (lv.elevation <= world.base + 0.3) continue;
      const below = levels.filter((l) => l.elevation < lv.elevation - 0.01).at(-1);
      const underside = below ? Math.min(lv.elevation, below.elevation + below.height) : lv.elevation;
      const rooms = project.rooms.filter((r) => r.level === lv.id);
      if (!rooms.length) continue;
      for (const s of world.layout.steps) {
        const y = world.base + s.y;
        const clear = underside - y;
        if (clear >= HEADROOM - 0.005 || y >= lv.elevation - 0.01) continue;
        const cx = s.poly.reduce((a, q) => a + q[0], 0) / s.poly.length; const cz = s.poly.reduce((a, q) => a + q[1], 0) / s.poly.length;
        const p = toWorld(o, [cx, cz]);
        const covered = rooms.some((r) => pointInPolygon(p, r.points) && !holePolygons(r.holes).some((h) => pointInPolygon(p, h)));
        if (covered && (low == null || clear < low)) low = clear;
      }
    }
    if (low != null) push('warning', 'stairsHeadroom', o.id, { height: Math.max(0, low) });
  }
}
