// Physical checks of the model, beyond the drawing rules of check.js: things
// that would not work in the built house — two doors swinging into each other,
// a door leaf hitting a wall, a door too narrow to pass, tall furniture in
// front of a window, furniture standing outside every room, a wall that stops
// just short of another. Called by runCheck (core/check.js) per level with its
// `add`; core/fixes.js offers a repair for each. Pure, mm.

import { wallFrame, wallPoint, openingSpans, wallOutlines } from "./walls.js";
import { furnitureCorners, furnitureDef } from "../lib/furniture.js";
import { pointInPolygon, pointSegDist, segIntersect } from "./geom.js";

export const PHYSICAL_CHECKS = [
  ["door-door", "Door swings that hit each other"],
  ["door-wall", "Door leaf hitting a wall"],
  ["door-narrow", "Doors too narrow to pass"],
  ["furniture-window", "Tall furniture in front of a window"],
  ["furniture-outside", "Furniture outside every room"],
  ["wall-gap", "Walls stopping just short of another"],
];

/** Narrowest door a person passes comfortably (mm); 800+ is the usual minimum for a room door. */
export const MIN_DOOR = 700;
/** Gaps between a wall end and another wall that are drawing mistakes (mm). */
export const WALL_GAP = 300;
// Furniture meant to stand outside or that is not furniture in a room.
const OUTSIDE_OK = new Set(["Outdoor", "Vehicles", "People", "Plants", "Building"]);
// Not something that blocks a window (they stand in front of one on purpose or let light through).
const NOT_BLOCKING = new Set(["Plants", "Lighting", "People", "Decor"]);

/**
 * The quarter a hinged door sweeps (a polygon: hinge, the leaf open, the arc, the leaf closed), on the side it
 * opens to, from the wall face; null for sliding / garage doors and windows.
 */
export function doorSwing(w, span) {
  const o = span.o;
  if (o.kind !== "door" || o.type === "sliding" || o.type === "garage") return null;
  const f = wallFrame(w);
  const side = o.side === -1 ? -1 : 1;
  const leaves = o.type === "double" ? [[span.u1, 1, (span.u2 - span.u1) / 2], [span.u2, -1, (span.u2 - span.u1) / 2]] : [[o.hinge === "end" ? span.u2 : span.u1, o.hinge === "end" ? -1 : 1, span.u2 - span.u1]];
  return leaves.map(([hu, dir, len]) => {
    const [hx, hy] = wallPoint(w, hu, (side * w.thickness) / 2);
    const pts = [[hx, hy]];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2);
      const du = Math.cos(a) * len * dir, dv = Math.sin(a) * len * side;
      pts.push([hx + f.d[0] * du + f.n[0] * dv, hy + f.d[1] * du + f.n[1] * dv]);
    }
    return pts;
  });
}

function polysOverlap(a, b) {
  for (const [x, y] of a) if (pointInPolygon(x, y, b)) return true;
  for (const [x, y] of b) if (pointInPolygon(x, y, a)) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segIntersect(...a[i], ...a[(i + 1) % a.length], ...b[j], ...b[(j + 1) % b.length])) return true;
  }
  return false;
}
// A polygon pulled towards its centroid: shapes that only touch do not count.
const shrink = (pts, k) => { const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length; return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };

export function checkPhysical(p, lv, add, tags) {
  const walls = p.walls.filter((w) => w.level === lv.id);
  if (!walls.length) return;
  const outlines = wallOutlines(walls);
  // ---- doors
  const swings = [];
  for (const w of walls) {
    for (const s of openingSpans(p, w)) {
      const o = s.o;
      if (o.kind === "door" && o.type !== "garage" && o.width < MIN_DOOR) {
        const [x, y] = wallPoint(w, o.at);
        add("warning", "door-narrow", "{tag} is only {w} mm wide: hard to pass ({min} mm or more is usual).", { tag: tags.get(o.id), w: Math.round(o.width), min: 800 }, x, y, [o.id], lv.id);
      }
      const sw = doorSwing(w, s);
      if (sw) swings.push({ w, o, polys: sw.map((poly) => shrink(poly, 0.97)) });
    }
  }
  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      const A = swings[i], B = swings[j];
      if (A.polys.some((a) => B.polys.some((b) => polysOverlap(a, b)))) {
        const [x, y] = wallPoint(B.w, B.o.at);
        add("warning", "door-door", "{a} and {b} swing into each other.", { a: tags.get(A.o.id), b: tags.get(B.o.id) }, x, y, [A.o.id, B.o.id], lv.id);
      }
    }
  }
  for (const S of swings) {
    for (const w of walls) {
      if (w.id === S.w.id) continue;
      const ol = outlines.get(w.id);
      // The leaf's far part only: walls meeting at the door's jamb do not count.
      if (ol && S.polys.some((poly) => polysOverlap(shrink(poly.slice(1), 0.9), ol.poly))) {
        const [x, y] = wallPoint(S.w, S.o.at);
        add("warning", "door-wall", "{tag} hits a wall when it opens.", { tag: tags.get(S.o.id) }, x, y, [S.o.id, w.id], lv.id);
        break;
      }
    }
  }
  // ---- furniture
  const furn = p.furniture.filter((f) => f.level === lv.id && (f.elevation || 0) < 2000);
  const rooms = p.rooms.filter((r) => r.level === lv.id);
  for (const f of furn) {
    const def = furnitureDef(f.kind) || {};
    if (f.kind === "rug" || def.mount === "wall") continue;
    if (rooms.length && !OUTSIDE_OK.has(def.cat) && f.kind !== "model" && !rooms.some((r) => pointInPolygon(f.x, f.y, r.pts))) {
      // Only when it is on the building (inside the walls' extent): a bench in the garden is fine.
      const inside = walls.some((w) => w.x1 !== w.x2 || w.y1 !== w.y2) && (() => { const xs = walls.flatMap((w) => [w.x1, w.x2]), ys = walls.flatMap((w) => [w.y1, w.y2]); return f.x > Math.min(...xs) && f.x < Math.max(...xs) && f.y > Math.min(...ys) && f.y < Math.max(...ys); })();
      if (inside) add("warning", "furniture-outside", "Furniture stands outside every room (inside a wall or a gap?).", {}, f.x, f.y, [f.id], lv.id);
    }
    // Tall pieces only (wardrobes, fridges, shelving): a bed head or a lamp under a window is fine.
    if ((f.h || 0) < 1500 || f.kind === "model" || NOT_BLOCKING.has(def.cat) || /curtain|blind|plant|tree/i.test(f.kind)) continue;
    const fc = furnitureCorners(f);
    const top = (f.elevation || 0) + f.h;
    for (const w of walls) {
      const fw = wallFrame(w);
      for (const s of openingSpans(p, w)) {
        const o = s.o;
        if (o.kind !== "window" || top < o.sill + 600) continue;
        // Close to the wall (within 300 mm of either face) and covering half the window's width or more.
        const t = w.thickness / 2;
        const uv = fc.map(([x, y]) => [(x - w.x1) * fw.d[0] + (y - w.y1) * fw.d[1], (x - w.x1) * fw.n[0] + (y - w.y1) * fw.n[1]]);
        const v0 = Math.min(...uv.map((q) => q[1])), v1 = Math.max(...uv.map((q) => q[1]));
        const near = (v0 < t + 300 && v1 > t) || (v1 > -t - 300 && v0 < -t);
        const cover = Math.min(s.u2, Math.max(...uv.map((q) => q[0]))) - Math.max(s.u1, Math.min(...uv.map((q) => q[0])));
        if (near && cover >= (s.u2 - s.u1) * 0.5) add("warning", "furniture-window", "Tall furniture stands in front of {tag}.", { tag: tags.get(o.id) }, f.x, f.y, [f.id, o.id], lv.id);
      }
    }
  }
  // ---- walls stopping just short of another (a drawing gap, not a free-standing wall)
  for (const w of walls) {
    for (const [ex, ey] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      let touches = false, best = null;
      for (const v of walls) {
        if (v === w) continue;
        const d = pointSegDist(ex, ey, v.x1, v.y1, v.x2, v.y2);
        if (d <= v.thickness / 2 + 2) { touches = true; break; }
        const gap = d - v.thickness / 2;
        if (gap <= WALL_GAP && (!best || gap < best.gap)) best = { v, gap };
      }
      if (!touches && best) add("warning", "wall-gap", "A wall stops {d} mm short of another.", { d: Math.round(best.gap) }, ex, ey, [w.id, best.v.id], lv.id);
    }
  }
}
