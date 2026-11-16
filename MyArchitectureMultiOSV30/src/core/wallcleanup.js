// Build → "Clean up walls…": MySketchBook's 2D workbench cleanup (io/plan-draft.js)
// on a level of this app — walls shorter than a crumb go, open ends a small gap
// apart are joined, nearly square corners are squared, straight runs merge
// into one wall — and what is still wrong afterwards (open ends, overlapping
// walls, openings wider than their wall or on top of each other). Walls and
// openings keep all their own settings (height, type, material, phase, door
// type …); rooms can be found again from the cleaned walls, keeping the names
// and finishes of the rooms they replace. Pure: plain objects in and out, mm.

import { fromResult, cleanupAll, removeShort, joinEnds, squareUp, mergeCollinear, draftProblems, wallLength } from "../io/plan-draft.js";
import { detectRooms, cleanup as cleanPolygon } from "./rooms.js";
import { pointInPolygon, uid } from "./geom.js";

export const CLEANUP_DEFAULTS = { minWall: 120, joinGap: 300, squareDeg: 6, merge: true, rooms: true };

// Two walls are one run only if nothing but their place differs (type, material, height, phase, finishes …).
const PLACE = new Set(["id", "x1", "y1", "x2", "y2", "thickness", "name"]);
export function sameSettings(a, b) {
  if (!a || !b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !PLACE.has(k)));
  for (const k of keys) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  return true;
}

/** The walls and openings of a level as a plan draft (metres), each carrying its own object to give back. */
export function levelDraft(project, level) {
  const walls = project.walls.filter((w) => w.level === level);
  const index = new Map(walls.map((w, i) => [w.id, i]));
  const result = {
    walls: walls.map((w) => ({ a: [w.x1 / 1000, w.y1 / 1000], b: [w.x2 / 1000, w.y2 / 1000], thickness: w.thickness / 1000, keep: { own: w } })),
    openings: project.openings.filter((o) => index.has(o.wall)).map((o) => ({ wall: index.get(o.wall), offset: o.at / 1000, width: o.width / 1000, keep: { own: o } })),
  };
  return fromResult(result);
}

/** What is wrong with a level's walls: [{ kind, at: [x, y] mm, ids }] (plan-draft draftProblems, ids of this app). */
export function wallProblems(project, level) {
  const d = levelDraft(project, level);
  const own = new Map([...d.walls.map((w) => [w.id, w.keep.own.id]), ...d.openings.map((o) => [o.id, o.keep.own.id])]);
  return draftProblems(d).map((p) => ({ kind: p.kind, at: [p.at[0] * 1000, p.at[1] * 1000], ids: p.ids.map((i) => own.get(i) || i) }));
}

/**
 * Cleans up a level: { walls, openings, rooms (the level's new room list, or null = rooms left as they are),
 * report: { removed, joined, squared, merged }, before, after (problem counts), changed }.
 * Nothing is changed on `project`; the caller applies the result (one undo step).
 */
export function cleanupLevel(project, level, options = {}) {
  const o = { ...CLEANUP_DEFAULTS, ...options };
  const before = wallProblems(project, level).length;
  const d = levelDraft(project, level);
  const report = { removed: 0, joined: 0, squared: 0, merged: 0 };
  report.removed = removeShort(d, { min: o.minWall / 1000 });
  report.joined = joinEnds(d, { tol: o.joinGap / 1000 });
  if (o.squareDeg > 0) report.squared = squareUp(d, { tolDeg: o.squareDeg });
  report.joined += joinEnds(d, { tol: o.joinGap / 1000 });
  if (o.merge) report.merged = mergeCollinear(d, { canMerge: (u, v) => sameSettings(u.keep && u.keep.own, v.keep && v.keep.own) });
  // Back to this app's walls: each keeps its own object (a merged run keeps the first wall's settings).
  const r1 = (v) => Math.round(v * 1000 * 10) / 10;
  const used = new Set();
  const walls = [];
  const idOf = new Map();
  for (const w of d.walls) {
    if (wallLength(w) < 0.005) continue;
    const own = w.keep && w.keep.own;
    const id = own && !used.has(own.id) ? own.id : uid("w");
    used.add(id);
    idOf.set(w.id, { id, L: wallLength(w) });
    walls.push({ ...(own || { level, height: null }), id, x1: r1(w.a[0]), y1: r1(w.a[1]), x2: r1(w.b[0]), y2: r1(w.b[1]), thickness: Math.round(w.thickness * 1000) });
  }
  const openings = [];
  for (const op of d.openings) {
    const w = idOf.get(op.wall);
    if (!w) continue;
    const width = Math.min(op.width, Math.max(0.2, w.L - 0.02));
    const at = Math.max(width / 2, Math.min(w.L - width / 2, op.offset));
    openings.push({ ...op.keep.own, wall: w.id, at: r1(at), width: Math.round(width * 1000) });
  }
  let rooms = null;
  if (o.rooms) {
    const old = project.rooms.filter((r) => r.level === level);
    const centre = (pts) => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    const taken = new Set();
    rooms = detectRooms(walls).sort((a, b) => b.area - a.area).map((r) => {
      const c = centre(r.pts);
      // The old room this one replaces: the one its centre lies in (or whose centre lies in it).
      const was = old.find((x) => !taken.has(x.id) && (pointInPolygon(c[0], c[1], x.pts) || pointInPolygon(...centre(x.pts), r.pts)));
      if (was) { taken.add(was.id); return { ...was, pts: cleanPolygon(r.pts) }; }
      return { id: uid("r"), level, name: "", pts: cleanPolygon(r.pts) };
    });
    // Rooms the new walls no longer enclose are kept as they were (nothing is lost silently).
    for (const x of old) if (!taken.has(x.id)) rooms.push(x);
  }
  const after = draftProblems(d).length;
  const changed = report.removed + report.joined + report.squared + report.merged > 0;
  return { walls, openings, rooms, report, before, after, changed };
}

/** Puts a cleanupLevel result on the project's level (inside the caller's undo step). */
export function applyCleanup(p, level, res) {
  const gone = new Set(p.walls.filter((w) => w.level === level).map((w) => w.id));
  p.walls = [...p.walls.filter((w) => !gone.has(w.id)), ...res.walls];
  p.openings = [...p.openings.filter((o) => !gone.has(o.wall)), ...res.openings];
  if (res.rooms) p.rooms = [...p.rooms.filter((r) => r.level !== level), ...res.rooms];
}

export { cleanupAll };
