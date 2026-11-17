// Placing furniture without collisions: the nearest free spot for a piece on
// its level — clear of the walls and of the other furniture whose height range
// it shares (a TV above a console, a lamp on a table, a ceiling light over a
// bed do not collide). Touching is fine: a cabinet stands against a wall, a
// chair beside a table. Used when furniture is placed or dragged in the plan
// and in 3D. Pure (no DOM): the unit tests use it.
import { wallOutlines } from "./walls.js";
import { furnitureCorners, furnitureDef, isLight } from "../lib/furniture.js";
import { pointInPolygon, segIntersect } from "./geom.js";

// A polygon pulled `mm` towards its centre (a touch is no overlap; 5 mm whatever the size).
const shrink = (pts, mm = 5) => {
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  return pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1, k = Math.max(0, d - mm) / d; return [cx + (x - cx) * k, cy + (y - cy) * k]; });
};
function overlap(a, b) {
  for (const [x, y] of a) if (pointInPolygon(x, y, b)) return true;
  for (const [x, y] of b) if (pointInPolygon(x, y, a)) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) if (segIntersect(...a[i], ...a[(i + 1) % a.length], ...b[j], ...b[(j + 1) % b.length])) return true;
  return false;
}
const box = (pts) => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const [x, y] of pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); } return [x1, y1, x2, y2]; };
const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// Pieces that never block: rugs lie under everything; people and plants are moved around by hand.
const passable = (f) => f.kind === "rug" || /^rug|carpet/i.test(f.kind) || ["People"].includes((furnitureDef(f.kind) || {}).cat);

/** What a piece collides with on its level: { walls: [{ poly, box }], items: [{ poly, box, z1, z2 }] } (`ignore`: ids). */
export function obstacles(p, level, ignore = new Set()) {
  const walls = p.walls.filter((w) => w.level === level);
  const outlines = wallOutlines(walls);
  const ws = [];
  for (const w of walls) { const o = outlines.get(w.id); if (o && o.poly && o.poly.length >= 3) ws.push({ poly: o.poly, box: box(o.poly) }); }
  const items = [];
  for (const f of p.furniture) {
    if (f.level !== level || ignore.has(f.id) || passable(f) || !(f.w > 0 && f.d > 0)) continue;
    const poly = shrink(furnitureCorners(f));
    items.push({ poly, box: box(poly), z1: f.elevation || 0, z2: (f.elevation || 0) + (f.h || 0), id: f.id });
  }
  return { walls: ws, items };
}

/** Does piece `f` (x, y, w, d, rot, elevation, h) at its place hit an obstacle? */
export function collides(f, obs) {
  const poly = shrink(furnitureCorners(f));
  const bb = box(poly);
  const z1 = f.elevation || 0, z2 = z1 + (f.h || 0);
  for (const w of obs.walls) if (boxesMeet(bb, w.box) && overlap(poly, w.poly)) return true;
  for (const o of obs.items) if (z1 < o.z2 - 1 && o.z1 < z2 - 1 && boxesMeet(bb, o.box) && overlap(poly, o.poly)) return true;
  return false;
}

/**
 * The free spot nearest to where `f` is: { x, y, moved } (moved: it had to go elsewhere), or null when nothing is free
 * within `maxR` mm. The search goes round the spot in rings `step` mm apart. A piece in a room (where it is put,
 * or `origin`, where it was before a drag) stays in a room: it never goes through a wall to the outside.
 */
export function freeSpot(p, f, { step = 50, maxR = 4000, ignore = new Set(), obs = null, origin = null } = {}) {
  const o = obs || obstacles(p, f.level, new Set([...ignore, f.id]));
  const rooms = (p.rooms || []).filter((r) => r.level === f.level && r.pts && r.pts.length >= 3);
  const inRoom = (x, y) => rooms.some((r) => pointInPolygon(x, y, r.pts));
  const indoors = rooms.length > 0 && (inRoom(f.x, f.y) || (!!origin && inRoom(origin[0], origin[1])));
  const ok = (x, y) => (!indoors || inRoom(x, y)) && !collides({ ...f, x, y }, o);
  if (ok(f.x, f.y)) return { x: f.x, y: f.y, moved: false };
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(f.x + Math.cos(a) * r), y = Math.round(f.y + Math.sin(a) * r);
      if (ok(x, y)) { best = { x, y }; break; }
    }
    if (best) return { ...best, moved: true };
  }
  return null;
}

/**
 * Pieces just added (recognised in a plan, pasted …) settle one by one: a piece drawn near a wall goes against
 * its face (not into it; turned square to it when nearly so), then into the nearest free spot, but no further than
 * `maxR` mm (what is drawn stays where it was drawn). Changes `p` in place; returns how many moved.
 */
export function settlePieces(p, ids, { maxR = 600, snap = 150 } = {}) {
  let moved = 0;
  for (const id of ids) {
    const f = p.furniture.find((x) => x.id === id);
    if (!f) continue;
    if (snap > 0 && !passable(f) && !isLight(f) && f.kind !== "component" && f.w > 0 && f.d > 0) {
      const a = alignToWalls(f, p.walls.filter((w) => w.level === f.level), { snap });
      if (a.x !== f.x || a.y !== f.y || a.rot !== (f.rot || 0)) { f.x = a.x; f.y = a.y; f.rot = a.rot; moved++; }
    }
    const s = freeSpot(p, f, { maxR, step: 25 });
    if (s && s.moved) { f.x = s.x; f.y = s.y; moved++; }
  }
  return moved;
}

/**
 * A piece against the walls (as MySketchBook does it): a piece whose side is within `snap` mm of a wall face is
 * pulled onto the face, and one inside a wall is pushed out to it — it never stands in a wall. With `align`, a
 * piece near a wall turns to the nearest right angle to it (when it is within ~30° or already touching), so a
 * side lies along the wall. `f`: { x, y, w, d, rot (degrees) }; walls: { x1, y1, x2, y2, thickness }.
 * Returns { x, y, rot } (rounded mm and degrees).
 */
export function alignToWalls(f, walls, { snap = 160, gap = 0, align = true, pull = true } = {}) {
  let x = f.x, y = f.y, rot = f.rot || 0;
  const hw = Math.max(5, (f.w || 0) / 2), hd = Math.max(5, (f.d || 0) / 2);
  // How far the piece reaches along a direction (its corners: x along (cos, sin) × w/2, y along (−sin, cos) × d/2).
  const span = (dir, r) => { const a = (r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return Math.abs(dir[0] * c + dir[1] * s) * hw + Math.abs(-dir[0] * s + dir[1] * c) * hd; };
  for (let pass = 0; pass < 2; pass++) {
    for (const w of walls || []) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (!(L > 1)) continue;
      const u = [(w.x2 - w.x1) / L, (w.y2 - w.y1) / L], n = [-u[1], u[0]];
      const half = (w.thickness || 200) / 2;
      const along = (x - w.x1) * u[0] + (y - w.y1) * u[1];
      // Beside the wall (not beyond its ends: a piece past a wall's end is not against it).
      if (along < -span(u, rot) + 20 || along > L + span(u, rot) - 20) continue;
      let signed = (x - w.x1) * n[0] + (y - w.y1) * n[1];
      let face = half + span(n, rot) + gap;
      const band = pass === 0 && pull ? snap : 0;
      if (Math.abs(signed) > face + band) continue;
      const side = signed < 0 ? -1 : 1;
      if (align && pass === 0) {
        // The wall's direction in degrees; the piece's rotation that is a multiple of 90° from it and nearest.
        const base = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
        const k = Math.round((rot - base) / 90);
        const best = base + k * 90;
        const diff = Math.abs(rot - best);
        if (diff > 0.01 && (diff < 31 || Math.abs(signed) < face + 40)) rot = ((Math.round(best * 10) / 10) % 360 + 360) % 360;
        face = half + span(n, rot) + gap;
      }
      // Pass 2 only pushes out of a wall; pass 1 also pulls in from the snap band.
      if (pass === 1 && Math.abs(signed) >= face - 0.5) continue;
      const to = side * face - signed;
      x += n[0] * to; y += n[1] * to;
      signed = side * face;
    }
  }
  return { x: Math.round(x), y: Math.round(y), rot };
}

/**
 * Pieces where a move, a resize or an edit left them: they must not stand in a wall or on another piece. A piece
 * near a wall goes against it (alignToWalls; one piece also turns to it); then, if anything still hits a wall or
 * another piece, the pieces go together (a moved group keeps its layout) to the nearest free spot — inside a room
 * when they were (`origins`: id → [x, y] before the move). When nothing is free within `maxR` mm they go back to
 * `origins`. Typed values (properties) and resizes pass snap 0 and align false: only out of a wall. Changes `p` in place. Returns { moved, back, ids } — moved: they had to go elsewhere than dropped
 * (not counting the snap to a wall); back: they went back where they were.
 */
export function settleMoved(p, ids, { origins = null, maxR = 4000, step = 25, snap = 160, align = true } = {}) {
  const pieces = (ids || []).map((id) => p.furniture.find((f) => f.id === id)).filter((f) => f && !passable(f) && f.w > 0 && f.d > 0 && f.kind !== "component");
  if (!pieces.length) return { moved: false, back: false, ids: [] };
  const out = { moved: false, back: false, ids: pieces.map((f) => f.id) };
  const byLevel = new Map();
  for (const f of pieces) { if (!byLevel.has(f.level)) byLevel.set(f.level, []); byLevel.get(f.level).push(f); }
  for (const [level, list] of byLevel) {
    const walls = p.walls.filter((w) => w.level === level);
    const obs = obstacles(p, level, new Set(list.map((f) => f.id)));
    // 1. Against the walls. One piece snaps and turns; a group moves by the largest push any of its pieces needs
    //    (so nothing is left in a wall), pulled to a wall only when one piece alone stands by it.
    const snappable = list.filter((f) => !isLight(f));
    if (list.length === 1 && snappable.length === 1) {
      const f = list[0], a = alignToWalls(f, walls, { snap, align, pull: snap > 0 });
      f.x = a.x; f.y = a.y; f.rot = a.rot;
    } else if (snappable.length) {
      let best = null;
      for (const f of snappable) {
        const a = alignToWalls(f, walls, { snap: 0, align: false, pull: false });
        const dx = a.x - f.x, dy = a.y - f.y, m = Math.hypot(dx, dy);
        if (m > 0 && (!best || m > best.m)) best = { dx, dy, m };
      }
      if (best) for (const f of list) { f.x += best.dx; f.y += best.dy; }
    }
    // 2. Still in a wall or on another piece: the nearest free spot for the whole set.
    const rooms = (p.rooms || []).filter((r) => r.level === level && r.pts && r.pts.length >= 3);
    const inRoom = (x, y) => rooms.some((r) => pointInPolygon(x, y, r.pts));
    const indoors = rooms.length > 0 && list.some((f) => inRoom(f.x, f.y) || (origins && origins[f.id] && inRoom(...origins[f.id])));
    // Each moved piece against the others of the set too (a resized piece may now reach its neighbour in the group).
    const okAt = (dx, dy) => {
      for (const f of list) {
        const g = { ...f, x: f.x + dx, y: f.y + dy };
        if (indoors && !inRoom(g.x, g.y)) return false;
        if (collides(g, obs)) return false;
      }
      return true;
    };
    if (okAt(0, 0)) continue;
    let spot = null;
    for (let r = step; r <= maxR && !spot; r += step) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, dx = Math.round(Math.cos(a) * r), dy = Math.round(Math.sin(a) * r);
        if (okAt(dx, dy)) { spot = [dx, dy]; break; }
      }
    }
    if (spot) {
      for (const f of list) { f.x += spot[0]; f.y += spot[1]; }
      out.moved = true;
      // A single piece pushed off: against the wall again if that is still free.
      if (list.length === 1 && snappable.length === 1) {
        const f = list[0], a = alignToWalls(f, walls, { snap: 60, align: false });
        if (!collides({ ...f, x: a.x, y: a.y }, obs) && (!indoors || inRoom(a.x, a.y))) { f.x = a.x; f.y = a.y; }
      }
    } else if (origins && list.every((f) => origins[f.id])) {
      for (const f of list) { f.x = origins[f.id][0]; f.y = origins[f.id][1]; if (origins[f.id][2] !== undefined) f.rot = origins[f.id][2]; }
      out.back = true;
    }
  }
  return out;
}
