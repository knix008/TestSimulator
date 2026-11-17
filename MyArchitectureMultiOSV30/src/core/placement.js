// Placing furniture without collisions: the nearest free spot for a piece on
// its level — clear of the walls and of the other furniture whose height range
// it shares (a TV above a console, a lamp on a table, a ceiling light over a
// bed do not collide). Touching is fine: a cabinet stands against a wall, a
// chair beside a table. Used when furniture is placed or dragged in the plan
// and in 3D. Pure (no DOM): the unit tests use it.
import { wallOutlines } from "./walls.js";
import { furnitureCorners, furnitureDef } from "../lib/furniture.js";
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
 * Pieces just added (recognised in a plan, pasted …) settle one by one into the nearest free spot, but no further
 * than `maxR` mm (what is drawn stays where it was drawn). Changes `p` in place; returns how many moved.
 */
export function settlePieces(p, ids, { maxR = 600 } = {}) {
  let moved = 0;
  for (const id of ids) {
    const f = p.furniture.find((x) => x.id === id);
    if (!f) continue;
    const s = freeSpot(p, f, { maxR, step: 25 });
    if (s && s.moved) { f.x = s.x; f.y = s.y; moved++; }
  }
  return moved;
}
