// Mass → building (SketchUp's massing model turned into BIM elements): a mass,
// a face or a closed line drawn in 3D becomes levels with walls along its
// outline, a floor slab and a room per level, windows, an entrance door and a
// roof over the top. Each level takes the mass's plan where it cuts the
// middle of that level, so a stepped or tapered mass gives smaller floors
// higher up. Pure (runs inside store.edit, so it undoes as one step).

import { uid, polygonArea, offsetPolygon, pointInPolygon, polygonCentroid, clipHalfPlane, pointSegDist } from "./geom.js";
import { levelById, newLevel, wallTypeThickness, wallLength } from "./project.js";
import { solidMesh, faceNormal } from "./mesh.js";
import { cleanup } from "./rooms.js";

export const MASS_ROOF_KINDS = ["flat", "gable", "hip", "shed", "none"];
const MIN_AREA = 1e6; // 1 m²: smaller cuts are slivers

// ---------------------------------------------------------------- slicing
// The plan outlines where the horizontal plane at height z cuts a mesh:
// closed loops of [x, y] (outer outlines and courtyards alike).
export function sliceMesh(m, z) {
  const segs = [];
  const cut = (a, b) => {
    // The same mesh edge seen from both of its faces gives the same point.
    if (a > b) [a, b] = [b, a];
    const pa = m.v[a], pb = m.v[b];
    const k = (z - pa[2]) / (pb[2] - pa[2]);
    return [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k];
  };
  m.f.forEach((f, fi) => {
    const n = faceNormal(m, fi);
    if (Math.abs(n[2]) > 0.999) return; // a floor or a roof face
    const pts = [];
    for (const ring of [f.l, ...(f.h || [])]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if ((m.v[a][2] - z) * (m.v[b][2] - z) < 0) pts.push(cut(a, b));
      }
    }
    if (pts.length < 2) return;
    // The face meets the plane along a line: pair the crossings along it.
    const d = [-n[1], n[0]];
    pts.sort((p, q) => p[0] * d[0] + p[1] * d[1] - (q[0] * d[0] + q[1] * d[1]));
    for (let i = 0; i + 1 < pts.length; i += 2) segs.push([pts[i], pts[i + 1]]);
  });
  return chainLoops(segs);
}

// Segments → closed loops (endpoints matched to 0.5 mm).
export function chainLoops(segs) {
  const key = ([x, y]) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const at = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); if (!at.has(k)) at.set(k, []); at.get(k).push([i, e]); } });
  const used = new Set();
  const loops = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const loop = [segs[i][0]];
    let cur = segs[i][1];
    for (let guard = 0; guard < segs.length; guard++) {
      if (key(cur) === key(loop[0])) break;
      loop.push(cur);
      const next = (at.get(key(cur)) || []).find(([j]) => !used.has(j));
      if (!next) { loop.length = 0; break; }
      used.add(next[0]);
      cur = segs[next[0]][1 - next[1]];
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Loops → [{outer, holes}] (a loop inside another is its courtyard).
export function nestLoops(loops) {
  const list = loops.map((l) => cleanup(l)).filter((l) => l.length >= 3 && Math.abs(polygonArea(l)) >= MIN_AREA)
    .map((l) => (polygonArea(l) < 0 ? l.slice().reverse() : l)) // counter-clockwise
    .sort((a, b) => polygonArea(b) - polygonArea(a));
  const out = [];
  for (const l of list) {
    const parent = out.find((o) => pointInPolygon(l[0][0], l[0][1], o.outer) && !o.holes.some((h) => pointInPolygon(l[0][0], l[0][1], h)));
    if (parent) parent.holes.push(l); else out.push({ outer: l, holes: [] });
  }
  return out;
}

// ---------------------------------------------------------------- the source
// What a mass gives: its plan per height (z from the mass's level floor), its
// bottom and top, and whether it is flat (a face or a closed line: the number
// of levels is then asked for).
// Several ids: lines drawn in 3D (Edges) that together close into outlines.
export function massSource(p, id) {
  if (Array.isArray(id) && id.length > 1) return linesSource(p, id);
  if (Array.isArray(id)) id = id[0];
  const s = (p.solids || []).find((x) => x.id === id);
  if (!s) return null;
  const m = solidMesh(s);
  if (!m || !m.v || !m.v.length) return null;
  let zb = Infinity, zt = -Infinity;
  for (const v of m.v) { zb = Math.min(zb, v[2]); zt = Math.max(zt, v[2]); }
  const flatLoop = () => {
    // A face: its outline; loose edges: their closed chain.
    if (m.f.length === 1) return m.f[0].l.map((i) => [m.v[i][0], m.v[i][1]]);
    if (!m.f.length && m.e && m.e.length >= 3) {
      const nb = new Map();
      for (const [a, b] of m.e) { for (const [x, y] of [[a, b], [b, a]]) { if (!nb.has(x)) nb.set(x, []); nb.get(x).push(y); } }
      if ([...nb.values()].some((l) => l.length !== 2)) return null; // not one closed loop
      const start = m.e[0][0];
      const chain = [start];
      for (let prev = -1, cur = start; ;) {
        const next = nb.get(cur).find((x) => x !== prev);
        if (next === start || next === undefined) break;
        chain.push(next); prev = cur; cur = next;
        if (chain.length > m.e.length) return null;
      }
      return chain.length === m.e.length ? chain.map((i) => [m.v[i][0], m.v[i][1]]) : null;
    }
    return null;
  };
  if (zt - zb < 10) {
    const loop = flatLoop();
    if (!loop || Math.abs(polygonArea(loop)) < MIN_AREA) return null;
    return { solid: s, ids: [s.id], flat: true, bottom: zb, top: zb, plansAt: () => nestLoops([loop]) };
  }
  if (!m.f.length) return null;
  return { solid: s, ids: [s.id], flat: false, bottom: zb, top: zt, plansAt: (z) => nestLoops(sliceMesh(m, z + 0.37)) };
}

function linesSource(p, ids) {
  const list = ids.map((id) => (p.solids || []).find((x) => x.id === id));
  if (list.some((s) => !s || !s.mesh || s.mesh.f.length || !(s.mesh.e || []).length)) return null;
  const s = list[0];
  const e0 = (levelById(p, s.level) || { elevation: 0 }).elevation;
  const segs = [];
  let zb = Infinity;
  for (const x of list) {
    const dz = (levelById(p, x.level) || { elevation: 0 }).elevation - e0;
    for (const [a, b] of x.mesh.e) { const A = x.mesh.v[a], B = x.mesh.v[b]; segs.push([[A[0], A[1]], [B[0], B[1]]]); zb = Math.min(zb, A[2] + dz, B[2] + dz); }
  }
  const shapes = nestLoops(chainLoops(segs));
  if (!shapes.length) return null;
  return { solid: s, ids: list.map((x) => x.id), flat: true, bottom: zb, top: zb, plansAt: () => shapes };
}

// ---------------------------------------------------------------- the levels
// The levels the building takes, from the one at the mass's bottom up:
// existing levels first, then new ones of the same height. A flat source
// takes `count` levels; a solid as many as fit in its height (half a level
// or more counts).
export function massLevels(p, src, { count = 1, floorHeight = null } = {}) {
  const lv0 = levelById(p, src.solid.level) || p.levels[0];
  const bottom = lv0.elevation + src.bottom;
  // The level whose floor is nearest the mass's bottom.
  let i = 0;
  p.levels.forEach((l, k) => { if (Math.abs(l.elevation - bottom) < Math.abs(p.levels[i].elevation - bottom)) i = k; });
  const height = floorHeight || p.levels[i].height || 3000;
  const plan = [];
  let z = p.levels[i].elevation;
  const top = src.flat ? Infinity : lv0.elevation + src.top;
  for (let k = 0; k < 200; k++) {
    if (src.flat ? plan.length >= Math.max(1, count) : top - z < 0.5 * (p.levels[i + k] ? p.levels[i + k].height : height)) break;
    const lv = p.levels[i + k];
    if (lv) plan.push({ level: lv, elevation: lv.elevation, height: lv.height });
    else {
      const prev = plan[plan.length - 1];
      const e = prev ? prev.elevation + prev.height : z;
      plan.push({ level: null, elevation: e, height });
    }
    z = plan[plan.length - 1].elevation + plan[plan.length - 1].height;
  }
  return plan;
}

// ---------------------------------------------------------------- the building
const round = (pts) => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);

// Windows spread along a wall (none on short walls), clear of `skip` (a door).
function windowsOn(w, { width = 1200, spacing = 3000, skip = null } = {}) {
  const L = wallLength(w);
  const n = Math.floor((L - 600) / spacing);
  const out = [];
  for (let i = 0; i < n; i++) {
    const at = Math.round(((i + 0.5) / n) * L);
    if (skip !== null && Math.abs(at - skip) < (width + 1000) / 2 + 300) continue;
    if (at - width / 2 < 300 || at + width / 2 > L - 300) continue;
    out.push(at);
  }
  return out;
}

// The rooms of one floor: the inside of its walls. A floor round one
// courtyard is cut in two across the courtyard (a room has no holes); with
// more courtyards no room is made.
export function floorRooms(sh, thick) {
  const inside = cleanup(offsetPolygon(sh.outer, thick));
  if (!sh.holes.length) return Math.abs(polygonArea(inside)) >= MIN_AREA ? [inside] : [];
  if (sh.holes.length > 1) return [];
  const hole = offsetPolygon(sh.holes[0], -thick);
  const c = polygonCentroid(hole)[1];
  const out = [];
  for (const dir of [[0, 1], [0, -1]]) {
    const a = clipHalfPlane(inside, [0, c], dir, 0), b = clipHalfPlane(hole, [0, c], dir, 0);
    const cutEdge = (pts) => pts.findIndex((q, i) => { const r = pts[(i + 1) % pts.length]; return Math.abs(q[1] - c) < 1e-6 && Math.abs(r[1] - c) < 1e-6; });
    const ia = cutEdge(a), ib = cutEdge(b);
    if (ia < 0 || ib < 0) return [];
    // Around the outside from the end of its cut, then back round the courtyard.
    const from = (pts, i) => [...pts.slice(i + 1), ...pts.slice(0, i + 1)];
    const room = cleanup([...from(a, ia), ...from(b, ib).reverse()]);
    if (Math.abs(polygonArea(room)) >= MIN_AREA) out.push(room);
  }
  return out;
}

// opts: {count (levels of a flat source), floorHeight, wallType (id), roof
// (MASS_ROOF_KINDS), pitch, rooms, windows, door, keepMass, roomName(level, i)}
// → {levels: [ids], created: n new levels, walls, slabs, rooms, roofs, openings} or throws.
export function massToBuilding(p, id, opts = {}) {
  const src = massSource(p, id);
  if (!src) throw new Error("Select a mass, a face or lines drawn in 3D that close into an outline.");
  const o = { count: 1, roof: "flat", pitch: 30, rooms: true, windows: true, door: true, keepMass: false, ...opts };
  const plan = massLevels(p, src, o);
  if (!plan.length) throw new Error("The mass is lower than half a level.");
  const lv0 = levelById(p, src.solid.level) || p.levels[0];
  const wt = (p.wallTypes || []).find((x) => x.id === o.wallType) || (p.wallTypes || []).find((x) => x.exterior) || null;
  const thick = wt ? wallTypeThickness(wt) : (p.defaults && p.defaults.wallThickness) || 200;
  const out = { levels: [], created: 0, walls: [], slabs: [], rooms: [], roofs: [], openings: [] };
  const floors = [];
  plan.forEach((step) => {
    // The plan at mid-height of the level (a flat source: its one outline).
    const zMid = Math.min(step.elevation + step.height / 2, src.flat ? Infinity : lv0.elevation + src.top - 1) - lv0.elevation;
    const shapes = src.plansAt(Math.max(src.bottom + 1, zMid));
    if (!shapes.length) return;
    let lv = step.level;
    if (!lv) {
      lv = newLevel(`${p.levels.length + 1}F`, step.elevation, step.height);
      p.levels.push(lv);
      out.created++;
    }
    out.levels.push(lv.id);
    floors.push({ lv, shapes });
  });
  if (!floors.length) throw new Error("The mass is lower than half a level.");
  floors.forEach(({ lv, shapes }, k) => {
    const walls = [];
    const rooms = [];
    for (const sh of shapes) {
      // Wall lines half a wall inside the outline (outside faces on the mass),
      // around a courtyard half a wall outside it.
      for (const [ring, d] of [[sh.outer, thick / 2], ...sh.holes.map((h) => [h, -thick / 2])]) {
        const line = round(offsetPolygon(ring, d));
        for (let i = 0; i < line.length; i++) {
          const a = line[i], b = line[(i + 1) % line.length];
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
          const w = { id: uid("w"), level: lv.id, x1: a[0], y1: a[1], x2: b[0], y2: b[1], thickness: thick, height: null, material: null, ...(wt ? { type: wt.id } : {}), phase: "new" };
          walls.push(w);
          p.walls.push(w);
          out.walls.push(w.id);
        }
      }
      const slab = { id: uid("sl"), level: lv.id, pts: round(sh.outer), holes: sh.holes.map(round), thickness: lv.slab || 200, offset: 0, slope: 0, slopeDir: 0, kind: "floor", phase: "new" };
      p.slabs.push(slab);
      out.slabs.push(slab.id);
      if (o.rooms) for (const pts of floorRooms(sh, thick)) {
        const room = { id: uid("r"), level: lv.id, name: o.roomName ? o.roomName(lv, out.rooms.length) : lv.name, pts, floor: "oak" };
        p.rooms.push(room);
        out.rooms.push(room.id);
        rooms.push(room);
      }
    }
    // Entrances on the ground floor: each room a door in the middle of the
    // longest wall along it (the first: the longest outside wall).
    const doors = new Map(); // wall → where its door is
    if (o.door && k === 0) {
      const along = (w, r) => r.pts.some((a, i) => { const b = r.pts[(i + 1) % r.pts.length], m = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2]; return pointSegDist(m[0], m[1], a[0], a[1], b[0], b[1]) <= thick / 2 + 80; });
      const targets = rooms.length ? rooms.map((r) => walls.filter((w) => along(w, r))) : [walls];
      for (const list of targets) {
        const free = list.filter((w) => !doors.has(w) && wallLength(w) >= 1600);
        if (!free.length) continue;
        const w = free.reduce((a, b) => (wallLength(b) > wallLength(a) ? b : a));
        const at = Math.round(wallLength(w) / 2);
        doors.set(w, at);
        const d = { id: uid("o"), wall: w.id, kind: "door", type: "single", at, width: 1000, height: 2100, sill: 0, side: 1, hinge: "start" };
        p.openings.push(d);
        out.openings.push(d.id);
      }
    }
    if (o.windows) {
      for (const w of walls) {
        for (const at of windowsOn(w, { skip: doors.has(w) ? doors.get(w) : null })) {
          const win = { id: uid("o"), wall: w.id, kind: "window", type: "casement", at, width: 1200, height: Math.min(1200, lv.height - 1400), sill: 900, side: 1, hinge: "start" };
          if (win.height < 300) continue;
          p.openings.push(win);
          out.openings.push(win.id);
        }
      }
    }
  });
  // The roof over the top level's outline (the outside faces of its walls).
  const top = floors[floors.length - 1];
  if (o.roof && o.roof !== "none") {
    for (const sh of top.shapes) {
      const flat = o.roof === "flat";
      const r = { id: uid("f"), level: top.lv.id, pts: round(sh.outer), kind: o.roof, pitch: flat ? 0 : o.pitch, overhang: flat ? 0 : 500, thickness: 200, material: flat ? "concrete" : "roof-tiles", auto: true };
      p.roofs.push(r);
      out.roofs.push(r.id);
    }
  }
  const used = new Set(src.ids);
  if (o.keepMass) for (const x of p.solids) { if (used.has(x.id)) x.hidden = true; }
  else p.solids = p.solids.filter((x) => !used.has(x.id));
  // New levels keep the plan's level order (by elevation).
  p.levels.sort((a, b) => a.elevation - b.elevation);
  return out;
}
