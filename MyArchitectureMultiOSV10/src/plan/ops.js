// Pure plan edits: hit-testing, snapping, moving / rotating / mirroring with
// connected walls following, copy & paste, delete.

import { closestOnSegment, pointInPolygon, pointSegDist, dist, rotPt, uid, bounds, snapAngle } from "../core/geom.js";
import { wallLength, COLLECTIONS, LEVEL_COLLECTIONS } from "../core/project.js";
import { openingSpans, wallPoint, endsAt, wallFrame } from "../core/walls.js";
import { furnitureCorners, isLight } from "../lib/furniture.js";
import { roofModel } from "../core/roof.js";
import { stairGeometry, dimensionGeometry, gridBubble } from "./render.js";

const on = (list, level) => list.filter((it) => it.level === level);

// ---------------------------------------------------------------- hit test
// → {kind, obj, handle?} for the topmost item under (x, y); tol in mm.
export function hitTest(p, level, x, y, tol, { selected = new Set(), layersHidden = new Set() } = {}) {
  const walls = on(p.walls, level);
  // Handles of selected walls / rooms / dimensions come first.
  for (const w of walls) {
    if (!selected.has(w.id)) continue;
    if (dist(x, y, w.x1, w.y1) <= tol * 1.5) return { kind: "walls", obj: w, handle: 0 };
    if (dist(x, y, w.x2, w.y2) <= tol * 1.5) return { kind: "walls", obj: w, handle: 1 };
  }
  for (const r of [...on(p.rooms, level), ...on(p.roofs, level), ...on(p.solids || [], level)]) {
    if (!selected.has(r.id)) continue;
    const i = r.pts.findIndex(([px, py]) => dist(x, y, px, py) <= tol * 1.5);
    if (i >= 0) return { kind: p.rooms.includes(r) ? "rooms" : p.roofs.includes(r) ? "roofs" : "solids", obj: r, handle: i };
  }
  for (const d of on(p.dimensions, level)) {
    if (!selected.has(d.id)) continue;
    if (dist(x, y, d.x1, d.y1) <= tol * 1.5) return { kind: "dimensions", obj: d, handle: 0 };
    if (dist(x, y, d.x2, d.y2) <= tol * 1.5) return { kind: "dimensions", obj: d, handle: 1 };
  }
  for (const g of p.grids || []) {
    if (!selected.has(g.id)) continue;
    if (dist(x, y, g.x1, g.y1) <= tol * 1.5) return { kind: "grids", obj: g, handle: 0 };
    if (dist(x, y, g.x2, g.y2) <= tol * 1.5) return { kind: "grids", obj: g, handle: 1 };
  }
  for (const g of p.grids || []) {
    for (const end of [0, 1]) { const [cx, cy, r] = gridBubble(g, end); if (dist(x, y, cx, cy) <= r) return { kind: "grids", obj: g }; }
  }
  for (const w of walls) {
    for (const s of openingSpans(p, w)) {
      const c = closestOnSegment(x, y, ...wallPoint(w, s.u1), ...wallPoint(w, s.u2));
      if (c.d <= w.thickness / 2 + tol) return { kind: "openings", obj: s.o };
    }
  }
  for (const t of on(p.texts, level).reverse()) {
    const lines = String(t.text).split("\n");
    const wdt = Math.max(...lines.map((l) => l.length)) * t.size * 0.62;
    const [lx, ly] = rotPt(x - t.x, y - t.y, -(t.rot || 0));
    const x0 = t.align === "center" ? -wdt / 2 : t.align === "right" ? -wdt : 0;
    if (lx >= x0 - tol && lx <= x0 + wdt + tol && ly >= -tol && ly <= lines.length * t.size * 1.25 + tol) return { kind: "texts", obj: t };
  }
  for (const d of on(p.dimensions, level)) {
    const g = dimensionGeometry(d);
    if (pointSegDist(x, y, ...g.a, ...g.b) <= tol * 1.2) return { kind: "dimensions", obj: d };
  }
  // Lamps first (a ceiling light hangs over the table it lights); a small
  // lamp is also hit within the pick tolerance of its centre.
  const furn = on(p.furniture, level).reverse();
  for (const f of furn) if (isLight(f) && (pointInPolygon(x, y, furnitureCorners(f)) || dist(x, y, f.x, f.y) <= tol * 1.5)) return { kind: "furniture", obj: f };
  for (const f of furn) if (pointInPolygon(x, y, furnitureCorners(f))) return { kind: "furniture", obj: f };
  for (const c of on(p.columns, level)) if (pointInPolygon(x, y, furnitureCorners(c)) || dist(x, y, c.x, c.y) <= tol) return { kind: "columns", obj: c };
  for (const s of on(p.stairs, level)) if (pointInPolygon(x, y, stairGeometry(s).outline)) return { kind: "stairs", obj: s };
  for (const s of on(p.solids || [], level).reverse()) if (pointInPolygon(x, y, s.pts)) return { kind: "solids", obj: s };
  let bestWall = null;
  for (const w of walls) {
    const d = pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2);
    if (d <= w.thickness / 2 + tol && (!bestWall || d < bestWall.d)) bestWall = { d, w };
  }
  if (bestWall) return { kind: "walls", obj: bestWall.w };
  for (const d of on(p.drawings, level).reverse()) {
    if (layersHidden.has(d.layer)) continue;
    if (hitDrawing(d, x, y, tol)) return { kind: "drawings", obj: d };
  }
  const rooms = on(p.rooms, level).filter((r) => pointInPolygon(x, y, r.pts));
  if (rooms.length) {
    rooms.sort((a, b) => Math.abs(areaOf(a.pts)) - Math.abs(areaOf(b.pts)));
    return { kind: "rooms", obj: rooms[0] };
  }
  for (const r of on(p.roofs, level)) if (pointInPolygon(x, y, roofModel(r).outline)) return { kind: "roofs", obj: r };
  for (const g of p.grids || []) if (pointSegDist(x, y, g.x1, g.y1, g.x2, g.y2) <= tol) return { kind: "grids", obj: g };
  for (const u of on(p.underlays, level).reverse()) {
    const [lx, ly] = rotPt(x - u.x, y - u.y, -(u.rot || 0));
    if (lx >= 0 && ly >= 0 && lx <= u.w && ly <= u.h) return { kind: "underlays", obj: u };
  }
  return null;
}

function segIntersectLoose(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  if (t < 0 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [a[0] + rx * t, a[1] + ry * t];
}

function areaOf(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i]; const [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

function hitDrawing(d, x, y, tol) {
  if (d.kind === "circle") return Math.abs(dist(x, y, d.cx, d.cy) - d.r) <= tol;
  if (d.kind === "arc") {
    if (Math.abs(dist(x, y, d.cx, d.cy) - d.r) > tol) return false;
    let a = (Math.atan2(y - d.cy, x - d.cx) * 180) / Math.PI;
    let a1 = d.a1, a2 = d.a2;
    if (d.ccw) [a1, a2] = [a2, a1];
    const norm = (v) => ((v % 360) + 360) % 360;
    a = norm(a - a1);
    return a <= norm(a2 - a1) + 1e-6;
  }
  const pts = d.pts || [];
  const n = d.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) if (pointSegDist(x, y, ...pts[i], ...pts[(i + 1) % pts.length]) <= tol) return true;
  return false;
}

// Items fully inside a rectangle (window) or touching it (crossing).
export function boxSelect(p, level, r, crossing = false) {
  const inside = ([x, y]) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
  const test = (pts) => (crossing ? pts.some(inside) : pts.every(inside));
  const ids = [];
  for (const w of on(p.walls, level)) if (test([[w.x1, w.y1], [w.x2, w.y2]])) ids.push(w.id);
  for (const o of p.openings) {
    const w = p.walls.find((x) => x.id === o.wall);
    if (w && w.level === level && test([wallPoint(w, o.at)])) ids.push(o.id);
  }
  for (const k of ["rooms", "roofs", "solids"]) for (const r2 of on(p[k] || [], level)) if (test(r2.pts)) ids.push(r2.id);
  for (const k of ["furniture", "columns"]) for (const f of on(p[k], level)) if (test(furnitureCorners(f))) ids.push(f.id);
  for (const s of on(p.stairs, level)) if (test(stairGeometry(s).outline)) ids.push(s.id);
  for (const d of on(p.dimensions, level)) if (test([[d.x1, d.y1], [d.x2, d.y2]])) ids.push(d.id);
  for (const t of on(p.texts, level)) if (test([[t.x, t.y]])) ids.push(t.id);
  for (const d of on(p.drawings, level)) {
    const pts = d.kind === "circle" || d.kind === "arc" ? [[d.cx - d.r, d.cy - d.r], [d.cx + d.r, d.cy + d.r]] : d.pts || [];
    if (pts.length && test(pts)) ids.push(d.id);
  }
  for (const u of on(p.underlays, level)) if (test([[u.x, u.y], [u.x + u.w, u.y + u.h]])) ids.push(u.id);
  for (const g of p.grids || []) if (test([[g.x1, g.y1], [g.x2, g.y2]])) ids.push(g.id);
  return ids;
}

// ---------------------------------------------------------------- snapping
// Snap a cursor point: endpoints / vertices first, then a point on a wall
// centre line, then the grid. → {x, y, kind, guide?}
export function snapPoint(p, level, x, y, { grid = 100, tol = 150, from = null, ortho = true, exclude = new Set(), onWall = true, endpoints = true } = {}) {
  if (endpoints) {
    let best = null;
    const consider = (px, py, kind) => {
      const d = dist(x, y, px, py);
      if (d <= tol && (!best || d < best.d)) best = { x: px, y: py, kind, d };
    };
    for (const w of on(p.walls, level)) {
      if (exclude.has(w.id)) continue;
      consider(w.x1, w.y1, "end");
      consider(w.x2, w.y2, "end");
    }
    for (const r of on(p.rooms, level)) if (!exclude.has(r.id)) for (const [px, py] of r.pts) consider(px, py, "vertex");
    for (const c of on(p.columns, level)) if (!exclude.has(c.id)) consider(c.x, c.y, "centre");
    for (const d of on(p.drawings, level)) if (!exclude.has(d.id)) for (const [px, py] of d.pts || []) consider(px, py, "vertex");
    if (best) return best;
  }
  let sx = x, sy = y;
  let guide = null;
  if (from && ortho) {
    // Constrain the direction to 45° steps and the length to the grid.
    const ang = (Math.atan2(y - from[1], x - from[0]) * 180) / Math.PI;
    const a = (snapAngle(ang, 45) * Math.PI) / 180;
    let len = (x - from[0]) * Math.cos(a) + (y - from[1]) * Math.sin(a);
    len = Math.max(0, grid > 0 ? Math.round(len / grid) * grid : len);
    sx = from[0] + Math.cos(a) * len;
    sy = from[1] + Math.sin(a) * len;
    // The ray meets another wall's centre line close by: end exactly on it.
    let hit = null;
    for (const w of on(p.walls, level)) {
      if (exclude.has(w.id)) continue;
      const far = [from[0] + Math.cos(a) * 1e7, from[1] + Math.sin(a) * 1e7];
      const xi = segIntersectLoose(from, far, [w.x1, w.y1], [w.x2, w.y2]);
      if (xi && dist(xi[0], xi[1], x, y) <= Math.max(tol, w.thickness) && dist(xi[0], xi[1], ...from) > 1 && (!hit || dist(xi[0], xi[1], x, y) < hit.d)) hit = { x: xi[0], y: xi[1], d: dist(xi[0], xi[1], x, y) };
    }
    if (hit) return { x: hit.x, y: hit.y, kind: "wall" };
    // Line up with an existing wall end along the free axis.
    if (Math.abs(Math.cos(a)) > 0.99 || Math.abs(Math.sin(a)) > 0.99) {
      const horizontal = Math.abs(Math.cos(a)) > 0.99;
      for (const w of on(p.walls, level)) {
        if (exclude.has(w.id)) continue;
        for (const [ex, ey] of [[w.x1, w.y1], [w.x2, w.y2]]) {
          if (horizontal && Math.abs(ex - sx) < tol * 0.6 && Math.abs(ex - from[0]) > 1) { sx = ex; guide = [ex, ey, sx, sy]; }
          if (!horizontal && Math.abs(ey - sy) < tol * 0.6 && Math.abs(ey - from[1]) > 1) { sy = ey; guide = [ex, ey, sx, sy]; }
        }
      }
    }
    return { x: sx, y: sy, kind: "ortho", guide };
  }
  if (onWall) {
    let best = null;
    for (const w of on(p.walls, level)) {
      if (exclude.has(w.id)) continue;
      const c = closestOnSegment(x, y, w.x1, w.y1, w.x2, w.y2);
      if (c.d <= Math.max(tol * 0.6, w.thickness / 2) && (!best || c.d < best.d)) best = { ...c, w };
    }
    if (best) {
      // Snap the position along the wall to the grid as well.
      const L = wallLength(best.w);
      const u = grid > 0 ? Math.round((best.t * L) / grid) * grid : best.t * L;
      const [wx, wy] = wallPoint(best.w, Math.max(0, Math.min(L, u)));
      return { x: wx, y: wy, kind: "wall", wall: best.w };
    }
  }
  if (grid > 0) { sx = Math.round(x / grid) * grid; sy = Math.round(y / grid) * grid; }
  return { x: sx, y: sy, kind: "grid" };
}

// ---------------------------------------------------------------- transforms
// Every movable point of the selection, applied through fn(x, y) → [x, y].
function transformItems(p, ids, fn, { stretch = true, rotate = 0, mirror = false } = {}) {
  const set = new Set(ids);
  // Wall ends that move, so connected walls can follow.
  const moved = [];
  for (const w of p.walls) {
    if (!set.has(w.id)) continue;
    moved.push([w.x1, w.y1, ...fn(w.x1, w.y1), w.level], [w.x2, w.y2, ...fn(w.x2, w.y2), w.level]);
    [w.x1, w.y1] = fn(w.x1, w.y1);
    [w.x2, w.y2] = fn(w.x2, w.y2);
    if (mirror) {
      // Keep the wall's left side meaning the same: openings keep their side.
      for (const o of p.openings) if (o.wall === w.id) { o.side = -(o.side || 1); }
    }
  }
  if (stretch) {
    for (const w of p.walls) {
      if (set.has(w.id)) continue;
      for (const [ox, oy, nx, ny, lv] of moved) {
        if (lv !== w.level) continue; // walls on other storeys stay put
        if (dist(w.x1, w.y1, ox, oy) < 2) { w.x1 = nx; w.y1 = ny; }
        if (dist(w.x2, w.y2, ox, oy) < 2) { w.x2 = nx; w.y2 = ny; }
      }
    }
    // Openings on stretched walls stay inside them.
    for (const o of p.openings) {
      const w = p.walls.find((x) => x.id === o.wall);
      if (!w) continue;
      const L = wallLength(w);
      o.at = Math.max(o.width / 2, Math.min(L - o.width / 2, o.at));
    }
  }
  for (const k of ["rooms", "roofs", "solids"]) for (const r of p[k] || []) if (set.has(r.id)) { r.pts = r.pts.map(([x, y]) => fn(x, y)); if (r.label) r.label = fn(...r.label); if (mirror) r.pts.reverse(); }
  for (const k of ["furniture", "columns", "stairs", "texts"]) {
    for (const f of p[k]) {
      if (!set.has(f.id)) continue;
      [f.x, f.y] = fn(f.x, f.y);
      if (rotate) f.rot = (((f.rot || 0) + rotate) % 360 + 360) % 360;
      if (mirror && k !== "texts") f.rot = ((180 - (f.rot || 0)) % 360 + 360) % 360;
    }
  }
  for (const d of p.dimensions) if (set.has(d.id)) { [d.x1, d.y1] = fn(d.x1, d.y1); [d.x2, d.y2] = fn(d.x2, d.y2); if (mirror) d.offset = -(d.offset || 0); }
  for (const g of p.grids || []) if (set.has(g.id)) { [g.x1, g.y1] = fn(g.x1, g.y1); [g.x2, g.y2] = fn(g.x2, g.y2); }
  for (const d of p.drawings) {
    if (!set.has(d.id)) continue;
    if (d.pts) d.pts = d.pts.map(([x, y]) => fn(x, y));
    if (d.cx !== undefined) {
      [d.cx, d.cy] = fn(d.cx, d.cy);
      if (d.kind === "arc") {
        if (rotate) { d.a1 += rotate; d.a2 += rotate; }
        if (mirror) { const a1 = 180 - d.a2, a2 = 180 - d.a1; d.a1 = a1; d.a2 = a2; }
      }
    }
  }
  for (const u of p.underlays) if (set.has(u.id)) { [u.x, u.y] = fn(u.x, u.y); if (rotate) u.rot = ((u.rot || 0) + rotate) % 360; }
  // Openings selected on their own slide along their wall.
}

export function moveItems(p, ids, dx, dy, opts) {
  transformItems(p, ids, (x, y) => [x + dx, y + dy], opts);
  // Openings selected without their wall slide along it.
  const set = new Set(ids);
  for (const o of p.openings) {
    if (!set.has(o.id)) continue;
    const w = p.walls.find((x) => x.id === o.wall);
    if (!w || set.has(w.id)) continue;
    const f = wallFrame(w);
    o.at = Math.max(o.width / 2, Math.min(wallLength(w) - o.width / 2, o.at + dx * f.d[0] + dy * f.d[1]));
  }
}

export function selectionCentre(p, ids) {
  const pts = [];
  const set = new Set(ids);
  for (const w of p.walls) if (set.has(w.id)) pts.push([w.x1, w.y1], [w.x2, w.y2]);
  for (const k of ["rooms", "roofs", "solids"]) for (const r of p[k] || []) if (set.has(r.id)) pts.push(...r.pts);
  for (const k of ["furniture", "columns", "stairs", "texts"]) for (const f of p[k]) if (set.has(f.id)) pts.push([f.x, f.y]);
  for (const d of [...p.dimensions, ...(p.grids || [])]) if (set.has(d.id)) pts.push([d.x1, d.y1], [d.x2, d.y2]);
  for (const d of p.drawings) if (set.has(d.id)) pts.push(...(d.pts || [[d.cx, d.cy]]));
  for (const u of p.underlays) if (set.has(u.id)) pts.push([u.x + u.w / 2, u.y + u.h / 2]);
  if (!pts.length) return null;
  const b = bounds(pts);
  return [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
}

export function rotateItems(p, ids, angle, centre = null, grid = 0) {
  let c = centre || selectionCentre(p, ids);
  if (!c) return;
  if (grid > 0) c = [Math.round(c[0] / grid) * grid, Math.round(c[1] / grid) * grid];
  const fn = (x, y) => { const [rx, ry] = rotPt(x - c[0], y - c[1], angle); return [c[0] + rx, c[1] + ry]; };
  transformItems(p, ids, fn, { rotate: angle });
}

export function mirrorItems(p, ids, axis = "x") {
  const c = selectionCentre(p, ids);
  if (!c) return;
  const fn = axis === "x" ? (x, y) => [2 * c[0] - x, y] : (x, y) => [x, 2 * c[1] - y];
  transformItems(p, ids, fn, { mirror: true });
  if (axis === "y") {
    // A vertical flip is a horizontal one turned by 180°.
    const set = new Set(ids);
    for (const k of ["furniture", "columns", "stairs"]) for (const f of p[k]) if (set.has(f.id)) f.rot = ((f.rot + 180) % 360 + 360) % 360;
  }
}

// Move one wall end (and every wall end joined to it).
export function moveWallEnd(p, wall, end, x, y) {
  const ox = end ? wall.x2 : wall.x1;
  const oy = end ? wall.y2 : wall.y1;
  for (const { wall: w, end: e } of endsAt(p.walls.filter((q) => q.level === wall.level), ox, oy)) {
    if (e) { w.x2 = x; w.y2 = y; } else { w.x1 = x; w.y1 = y; }
  }
  for (const o of p.openings) {
    const w = p.walls.find((q) => q.id === o.wall);
    if (w) o.at = Math.max(o.width / 2, Math.min(wallLength(w) - o.width / 2, o.at));
  }
}

// ---------------------------------------------------------------- clipboard
export function copyItems(p, ids) {
  const set = new Set(ids);
  const out = {};
  for (const k of COLLECTIONS) out[k] = p[k].filter((x) => set.has(x.id)).map((x) => JSON.parse(JSON.stringify(x)));
  // Openings of copied walls come along.
  const wallIds = new Set(out.walls.map((w) => w.id));
  for (const o of p.openings) if (wallIds.has(o.wall) && !set.has(o.id)) out.openings.push(JSON.parse(JSON.stringify(o)));
  out.openings = out.openings.filter((o) => wallIds.has(o.wall) || p.walls.some((w) => w.id === o.wall));
  const c = selectionCentre(p, ids);
  out.centre = c || [0, 0];
  return out;
}

// Paste a clipboard onto `level`, centred at (x, y) → new ids.
export function pasteItems(p, clip, level, x, y) {
  const idMap = new Map();
  const nid = (old, prefix) => { const n = uid(prefix); idMap.set(old, n); return n; };
  const dx = x - clip.centre[0];
  const dy = y - clip.centre[1];
  const added = [];
  for (const k of LEVEL_COLLECTIONS) {
    for (const src of clip[k] || []) {
      const it = JSON.parse(JSON.stringify(src));
      it.id = nid(src.id, k[0]);
      it.level = level;
      if (k === "walls") { it.x1 += dx; it.y1 += dy; it.x2 += dx; it.y2 += dy; }
      else if (it.pts) it.pts = it.pts.map(([a, b]) => [a + dx, b + dy]);
      if (it.label) it.label = [it.label[0] + dx, it.label[1] + dy];
      if (it.x !== undefined && k !== "walls") { it.x += dx; it.y += dy; }
      if (k === "dimensions") { it.x1 += dx; it.y1 += dy; it.x2 += dx; it.y2 += dy; }
      if (it.cx !== undefined) { it.cx += dx; it.cy += dy; }
      p[k].push(it);
      added.push(it.id);
    }
  }
  for (const src of clip.openings || []) {
    const wall = idMap.get(src.wall);
    if (!wall) continue; // an opening copied without its wall stays where it was
    const o = { ...JSON.parse(JSON.stringify(src)), id: nid(src.id, "o"), wall };
    delete o.tag;
    p.openings.push(o);
    added.push(o.id);
  }
  return added;
}

export function deleteItems(p, ids) {
  const set = new Set(ids);
  for (const k of COLLECTIONS) p[k] = p[k].filter((x) => !set.has(x.id));
  p.grids = (p.grids || []).filter((g) => !set.has(g.id));
  const walls = new Set(p.walls.map((w) => w.id));
  p.openings = p.openings.filter((o) => walls.has(o.wall));
}

// Scale the selection about its centre (plan sizes, and heights of
// furniture, solids and columns too: a uniform 3D scale).
export function scaleItems(p, ids, k) {
  const c = selectionCentre(p, ids);
  if (!c || !(k > 0)) return;
  const set = new Set(ids);
  transformItems(p, ids, (x, y) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k], { stretch: true });
  for (const f of [...p.furniture, ...p.columns]) if (set.has(f.id)) { f.w *= k; f.d *= k; if (f.h) f.h *= k; }
  for (const s of p.solids || []) if (set.has(s.id)) { s.height *= k; s.z0 *= k; }
  for (const w of p.walls) if (set.has(w.id)) w.thickness = Math.max(10, w.thickness * k);
  for (const s of p.stairs) if (set.has(s.id)) { s.length *= k; s.width *= k; }
  for (const t of p.texts) if (set.has(t.id)) t.size *= k;
  for (const d of p.drawings) if (set.has(d.id) && d.r) d.r *= k;
  for (const u of p.underlays) if (set.has(u.id)) { u.w *= k; u.h *= k; }
}

// Groups (SketchUp-style): the members are selected and moved together.
export function groupMembers(p, id) {
  const it = [...p.walls, ...p.rooms, ...p.columns, ...p.stairs, ...p.furniture, ...p.roofs, ...(p.solids || []), ...p.dimensions, ...p.texts, ...p.drawings].find((x) => x.id === id);
  if (!it || !it.group) return [id];
  const out = [];
  for (const k of ["walls", "rooms", "columns", "stairs", "furniture", "roofs", "solids", "dimensions", "texts", "drawings"]) for (const x of p[k] || []) if (x.group === it.group) out.push(x.id);
  // Openings in grouped walls come along.
  const walls = new Set(p.walls.filter((w) => out.includes(w.id)).map((w) => w.id));
  for (const o of p.openings) if (walls.has(o.wall)) out.push(o.id);
  return out;
}

// Point at distance `len` from `from` in direction of `to` (typed lengths).
export function pointAtLength(from, to, len) {
  const d = dist(...from, ...to) || 1;
  return [from[0] + ((to[0] - from[0]) / d) * len, from[1] + ((to[1] - from[1]) / d) * len];
}
