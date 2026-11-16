// Repairs for the model check (core/check.js, core/physcheck.js): for each
// problem, a few candidate repairs — open the door the other way, slide the
// wardrobe off the window, push furniture out of a wall, clamp an opening into
// its wall, join a wall gap … Each candidate is tried on a copy of the project
// and kept only if the check of that level then no longer reports the problem
// and reports nothing new; the first that works is offered. Every problem also
// has advice in words (ADVICE) for the cases no automatic repair settles.
// Pure: projects in, projects out (mm).

import { runCheck } from "./check.js";
import { wallLength, wallHeight } from "./project.js";
import { wallFrame, wallPoint } from "./walls.js";
import { pointInPolygon, polygonCentroid, closestOnSegment, uid } from "./geom.js";
import { cleanupLevel, applyCleanup } from "./wallcleanup.js";
import { furnitureCorners } from "../lib/furniture.js";

/** What to do about each problem, in words (translated by the UI). */
export const ADVICE = {
  "wall-short": "Delete the wall, or lengthen it so it reaches the next wall.",
  "wall-duplicate": "Delete one of the two walls (Build → Clean up walls merges them).",
  "opening-outside": "Move the opening along its wall, or make it narrower.",
  "opening-overlap": "Move one opening along the wall, or make them narrower.",
  "opening-tall": "Lower the opening or its sill, or raise the wall.",
  "door-blocked": "Move the furniture out of the swing, or let the door open the other way.",
  "furniture-wall": "Pull the furniture away from the wall into the room.",
  "room-small": "Join the room with its neighbour, or check that it is meant to be this small.",
  "room-overlap": "Redraw one of the rooms (Build → Detect rooms from walls).",
  "room-no-door": "Add a door or an opening in one of the room's walls.",
  "stair-top": "Add a level above (Build → Add level on top), or delete the stair.",
  "clash-furniture": "Move one of the pieces so they do not overlap.",
  "clash-stair": "Move the stair away from the wall, or shorten it.",
  "clash-column": "Move the column or the opening.",
  "door-door": "Hinge one of the doors on its other side, or let it open the other way.",
  "door-wall": "Hinge the door on its other side, or let it open the other way.",
  "door-narrow": "Widen the door to 800 mm or more (900 mm for wheelchairs).",
  "furniture-window": "Slide the furniture along the wall beside the window, or put it on another wall.",
  "furniture-outside": "Move the furniture into a room, or draw the room around it.",
  "wall-gap": "Join the wall to the one it stops short of (Build → Clean up walls).",
};
export const adviceFor = (code) => ADVICE[code] || "Select the items (click the problem) and correct them by hand.";

const clone = (p) => JSON.parse(JSON.stringify(p));
const sameIds = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const findIn = (p, id) => {
  for (const k of ["walls", "openings", "furniture", "rooms", "stairs", "columns"]) { const it = (p[k] || []).find((x) => x.id === id); if (it) return [k, it]; }
  return [null, null];
};

/** Checks a trial: the problem is gone and the level has no problem it did not have. */
function works(p, issue, before) {
  const after = runCheck(p, { level: issue.level });
  if (after.some((x) => x.code === issue.code && sameIds(x.ids || [], issue.ids || []))) return false;
  const key = (x) => `${x.code}|${[...(x.ids || [])].sort().join(",")}`;
  const had = new Set(before.map(key));
  return after.every((x) => had.has(key(x)));
}

// ---------------------------------------------------------------- candidate repairs
function doorFlips(id) {
  return [
    { key: "Open {tag} the other way", apply: (p) => { const o = p.openings.find((x) => x.id === id); o.side = o.side === -1 ? 1 : -1; } },
    { key: "Hinge {tag} on its other side", apply: (p) => { const o = p.openings.find((x) => x.id === id); o.hinge = o.hinge === "end" ? "start" : "end"; } },
    { key: "Hinge {tag} on its other side and open it the other way", apply: (p) => { const o = p.openings.find((x) => x.id === id); o.side = o.side === -1 ? 1 : -1; o.hinge = o.hinge === "end" ? "start" : "end"; } },
    { key: "Make {tag} a sliding door", apply: (p) => { const o = p.openings.find((x) => x.id === id); o.type = "sliding"; } },
  ].map((c) => ({ ...c, target: id }));
}

/** Moves of a piece of furniture: `dirs` [[dx, dy]] unit vectors, distances in mm. */
function furnitureMoves(id, dirs, dists, key = "Move the furniture {d} mm") {
  const out = [];
  for (const d of dists) for (const [dx, dy] of dirs) out.push({ key, vars: { d: Math.round(d) }, target: id, apply: (p) => { const f = p.furniture.find((x) => x.id === id); f.x += dx * d; f.y += dy * d; } });
  return out;
}

/**
 * A piece standing against wall `from` moved to the middle of another edge of its room, turned so the same side
 * faces the wall (a wardrobe's back, a whiteboard's board): the longest edges first.
 */
function toOtherWalls(p, id, from, level) {
  const fu = p.furniture.find((x) => x.id === id);
  if (!fu) return [];
  const room = p.rooms.find((r) => r.level === level && pointInPolygon(fu.x, fu.y, r.pts));
  if (!room) return [];
  const f = wallFrame(from);
  const side = Math.sign((fu.x - from.x1) * f.n[0] + (fu.y - from.y1) * f.n[1]) || 1;
  // Its back now: towards the wall, in the piece's own axes.
  const back = [-f.n[0] * side, -f.n[1] * side];
  const r0 = ((fu.rot || 0) * Math.PI) / 180;
  const local = [back[0] * Math.cos(r0) + back[1] * Math.sin(r0), -back[0] * Math.sin(r0) + back[1] * Math.cos(r0)];
  const half = Math.abs(local[0]) * fu.w / 2 + Math.abs(local[1]) * fu.d / 2;
  const across = Math.abs(local[1]) * fu.w + Math.abs(local[0]) * fu.d;
  const [cx, cy] = polygonCentroid(room.pts);
  const edges = [];
  for (let i = 0; i < room.pts.length; i++) {
    const A = room.pts[i], B = room.pts[(i + 1) % room.pts.length];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < across + 100) continue;
    const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
    // Outward normal of the edge (away from the room's middle).
    let m = [(B[1] - A[1]) / L, -(B[0] - A[0]) / L];
    if ((mid[0] - cx) * m[0] + (mid[1] - cy) * m[1] < 0) m = [-m[0], -m[1]];
    // Not the wall it stands at now.
    if (Math.abs(m[0] * back[0] + m[1] * back[1] - 1) < 0.02 && Math.abs((mid[0] - fu.x) * m[0] + (mid[1] - fu.y) * m[1]) < half + 400) continue;
    edges.push({ mid, m, L });
  }
  edges.sort((x, y) => y.L - x.L);
  return edges.slice(0, 4).map(({ mid, m }) => {
    const rot = Math.round(((Math.atan2(m[1], m[0]) - Math.atan2(local[1], local[0])) * 180) / Math.PI);
    return { key: "Move the furniture to another wall of \"{room}\"", vars: { room: room.name || "—" }, target: id, apply: (pp) => { const z = pp.furniture.find((q) => q.id === id); z.x = Math.round(mid[0] - m[0] * (half + 20)); z.y = Math.round(mid[1] - m[1] * (half + 20)); z.rot = ((rot % 360) + 360) % 360; } };
  });
}

/** Whether furniture `id` covers half or more of a window of wall `wallId` (the check's rule, for a quick pre-test). */
function coversWindow(p, id, wallId) {
  const fu = p.furniture.find((x) => x.id === id); const w = p.walls.find((x) => x.id === wallId);
  if (!fu || !w) return false;
  const f = wallFrame(w);
  const uv = furnitureCorners(fu).map(([x, y]) => [(x - w.x1) * f.d[0] + (y - w.y1) * f.d[1], (x - w.x1) * f.n[0] + (y - w.y1) * f.n[1]]);
  const u0 = Math.min(...uv.map((q) => q[0])), u1 = Math.max(...uv.map((q) => q[0]));
  return p.openings.some((o) => o.wall === wallId && o.kind === "window" && Math.min(u1, o.at + o.width / 2) - Math.max(u0, o.at - o.width / 2) >= o.width * 0.5);
}

/** The window moved along its wall, clear of the furniture (both ways), when the furniture cannot move. */
function windowSlides(p, winId, furnId) {
  const o = p.openings.find((x) => x.id === winId); const w = o && p.walls.find((x) => x.id === o.wall); const fu = p.furniture.find((x) => x.id === furnId);
  if (!o || !w || !fu) return [];
  const f = wallFrame(w), L = wallLength(w);
  const uv = furnitureCorners(fu).map(([x, y]) => (x - w.x1) * f.d[0] + (y - w.y1) * f.d[1]);
  const u0 = Math.min(...uv), u1 = Math.max(...uv);
  return [u0 - o.width / 2 - 100, u1 + o.width / 2 + 100]
    .filter((at) => at - o.width / 2 > 50 && at + o.width / 2 < L - 50)
    .map((at) => ({ key: "Move {tag} along the wall, clear of the furniture", target: winId, apply: (pp) => { pp.openings.find((x) => x.id === winId).at = Math.round(at); } }));
}

function candidates(p, issue) {
  const [a, b] = issue.ids || [];
  const STEPS = [150, 300, 600, 900, 1300, 1800];
  switch (issue.code) {
    case "door-blocked": {
      // The furniture away from the door (along the wall, then away from it), then the door itself.
      const o = p.openings.find((x) => x.id === a); const w = o && p.walls.find((x) => x.id === o.wall);
      if (!w) return [];
      const f = wallFrame(w);
      return [...furnitureMoves(b, [f.d, [-f.d[0], -f.d[1]], [f.n[0] * o.side, f.n[1] * o.side]], STEPS), ...doorFlips(a)];
    }
    case "door-door": return [...doorFlips(b), ...doorFlips(a)];
    case "door-wall": return doorFlips(a);
    case "furniture-window": {
      const o = p.openings.find((x) => x.id === b); const w = o && p.walls.find((x) => x.id === o.wall);
      if (!w) return [];
      const f = wallFrame(w);
      // Slides that still cover a window of that wall are skipped before the full check (pre).
      // The exact slides that leave less than half the window covered, each way, then the fixed steps.
      const fu = p.furniture.find((x) => x.id === a);
      const exact = [];
      if (fu) {
        const uv = furnitureCorners(fu).map(([x, y]) => (x - w.x1) * f.d[0] + (y - w.y1) * f.d[1]);
        const u0 = Math.min(...uv), u1 = Math.max(...uv), w0 = o.at - o.width / 2, w1 = o.at + o.width / 2;
        exact.push([f.d, Math.max(0, w0 + o.width / 2 - u0) + 60], [[-f.d[0], -f.d[1]], Math.max(0, u1 - (w1 - o.width / 2)) + 60]);
      }
      const slides = [...exact.flatMap(([dir, d]) => furnitureMoves(a, [dir], [d], "Slide the furniture {d} mm along the wall, off the window")), ...furnitureMoves(a, [f.d, [-f.d[0], -f.d[1]]], STEPS, "Slide the furniture {d} mm along the wall, off the window")]
        .map((c) => ({ ...c, pre: (pp) => !coversWindow(pp, a, w.id) }));
      // Away from the window wall (a passage in front of the window), on the furniture's side.
      const side = fu ? Math.sign((fu.x - w.x1) * f.n[0] + (fu.y - w.y1) * f.n[1]) || 1 : 1;
      const away = furnitureMoves(a, [[f.n[0] * side, f.n[1] * side]], [400, 700, 1000], "Move the furniture {d} mm away from the window");
      return [...slides, ...toOtherWalls(p, a, w, issue.level), ...away, ...windowSlides(p, b, a)];
    }
    case "furniture-wall": {
      const fu = p.furniture.find((x) => x.id === a); const w = p.walls.find((x) => x.id === b);
      if (!fu || !w) return [];
      const f = wallFrame(w);
      // Away from the wall's centre line, on the furniture's side.
      const s = Math.sign((fu.x - w.x1) * f.n[0] + (fu.y - w.y1) * f.n[1]) || 1;
      return furnitureMoves(a, [[f.n[0] * s, f.n[1] * s]], [50, 100, 150, 200, 300, 400, 500, 700], "Pull the furniture {d} mm away from the wall");
    }
    case "clash-furniture": {
      const fa = p.furniture.find((x) => x.id === a), fb = p.furniture.find((x) => x.id === b);
      if (!fa || !fb) return [];
      // Move the smaller piece, along the axis that separates them soonest.
      const [mv, st] = fa.w * fa.d < fb.w * fb.d ? [fa, fb] : [fb, fa];
      const dx = Math.sign(mv.x - st.x) || 1, dy = Math.sign(mv.y - st.y) || 1;
      return furnitureMoves(mv.id, [[dx, 0], [0, dy], [-dx, 0], [0, -dy]], [100, 200, 300, 450, 600, 800, 1000, 1300]);
    }
    case "furniture-outside": {
      const fu = p.furniture.find((x) => x.id === a);
      const rooms = p.rooms.filter((r) => r.level === issue.level);
      if (!fu || !rooms.length) return [];
      // Into the nearest room: just inside its nearest edge, then its middle.
      let best = null;
      for (const r of rooms) for (let i = 0; i < r.pts.length; i++) {
        const [q, s2] = [r.pts[i], r.pts[(i + 1) % r.pts.length]];
        const c = closestOnSegment(fu.x, fu.y, q[0], q[1], s2[0], s2[1]);
        if (!best || c.d < best.d) best = { r, x: c.x, y: c.y, d: c.d };
      }
      const [cx, cy] = polygonCentroid(best.r.pts);
      const L = Math.hypot(cx - best.x, cy - best.y) || 1;
      const reach = Math.max(fu.w, fu.d) / 2 + 60;
      const spots = [[best.x + ((cx - best.x) / L) * reach, best.y + ((cy - best.y) / L) * reach], [cx, cy]];
      return spots.map(([x, y]) => ({ key: "Move the furniture into \"{room}\"", vars: { room: best.r.name || "—" }, target: a, apply: (pp) => { const f = pp.furniture.find((z) => z.id === a); f.x = Math.round(x); f.y = Math.round(y); } }));
    }
    case "opening-outside": return [{ key: "Move {tag} back inside its wall", target: a, apply: (pp) => { const o = pp.openings.find((x) => x.id === a); const w = pp.walls.find((x) => x.id === o.wall); const L = wallLength(w); o.width = Math.min(o.width, L - 20); o.at = Math.max(o.width / 2 + 5, Math.min(L - o.width / 2 - 5, o.at)); } }];
    case "opening-overlap": {
      const out = [];
      for (const [mv, st, dir] of [[b, a, 1], [a, b, -1]]) out.push({ key: "Move {tag} along the wall, clear of the other opening", target: mv, apply: (pp) => { const m = pp.openings.find((x) => x.id === mv), s = pp.openings.find((x) => x.id === st); m.at = s.at + dir * (s.width / 2 + m.width / 2 + 100); } });
      return out;
    }
    case "opening-tall": return [{ key: "Lower {tag} to fit the wall", target: a, apply: (pp) => { const o = pp.openings.find((x) => x.id === a); const w = pp.walls.find((x) => x.id === o.wall); const H = wallHeight(pp, w); if (o.sill + o.height > H) { o.height = Math.max(300, H - o.sill - 50); if (o.sill + o.height > H) o.sill = Math.max(0, H - o.height - 50); } } }];
    case "door-narrow": return [900, 800].map((wd) => ({ key: "Widen {tag} to {w} mm", vars: { w: wd }, target: a, apply: (pp) => { const o = pp.openings.find((x) => x.id === a); o.width = wd; const w = pp.walls.find((x) => x.id === o.wall); const L = wallLength(w); o.at = Math.max(wd / 2 + 5, Math.min(L - wd / 2 - 5, o.at)); } }));
    case "wall-short": return [{ key: "Delete the short wall", target: a, wide: true, apply: (pp) => { pp.walls = pp.walls.filter((x) => x.id !== a); pp.openings = pp.openings.filter((x) => x.wall !== a); } }];
    case "wall-duplicate":
    case "wall-gap": return [{ key: "Clean up the walls of this level", target: a, wide: true, apply: (pp) => { const r = cleanupLevel(pp, issue.level, { rooms: false, squareDeg: 0 }); applyCleanup(pp, issue.level, r); } }];
    case "room-no-door": {
      const r = p.rooms.find((x) => x.id === a);
      if (!r) return [];
      // A door in the middle of a wall along the room's edge, interior walls (a room beyond) first.
      const walls = p.walls.filter((w) => w.level === issue.level);
      const along = [];
      for (const w of walls) {
        const L = wallLength(w);
        if (L < 1100) continue;
        const mid = wallPoint(w, L / 2);
        const f = wallFrame(w);
        const off = w.thickness / 2 + 120;
        const sides = [1, -1].map((s) => [mid[0] + f.n[0] * off * s, mid[1] + f.n[1] * off * s]);
        const inRoom = sides.findIndex(([x, y]) => pointInPolygon(x, y, r.pts));
        if (inRoom < 0) continue;
        const [ox, oy] = sides[1 - inRoom];
        const beyond = p.rooms.some((q) => q.level === issue.level && q.id !== r.id && pointInPolygon(ox, oy, q.pts));
        along.push({ w, L, beyond, side: inRoom === 0 ? 1 : -1 });
      }
      along.sort((x, y) => (y.beyond - x.beyond) || (y.L - x.L));
      return along.slice(0, 4).map(({ w, L, side }) => ({ key: "Add a door to \"{room}\"", vars: { room: r.name || "—" }, target: a, wide: true, apply: (pp) => { pp.openings.push({ id: uid("o"), wall: w.id, kind: "door", type: "single", at: Math.round(L / 2), width: 900, height: 2100, sill: 0, side, hinge: "start" }); } }));
    }
    default: return [];
  }
}

/**
 * The first repair that works for `issue` (an entry of runCheck), or null: { key, vars, apply(project) } — the
 * key is an English message template for t(); apply changes the project it is given (the caller's undo step).
 */
export function findFix(project, issue, { tags = null } = {}) {
  const list = candidates(project, issue);
  if (!list.length) return null;
  const before = runCheck(project, { level: issue.level });
  for (const c of list) {
    // A repair of one object is tried on the project itself and undone; anything bigger on a copy.
    const [kind, obj] = c.target && !c.wide ? findIn(project, c.target) : [null, null];
    let trial = project, saved = null;
    if (obj) saved = JSON.stringify(obj); else trial = clone(project);
    let ok = false;
    try { c.apply(trial); ok = (!c.pre || c.pre(trial)) && works(trial, issue, before); } catch { ok = false; }
    if (obj) { const back = JSON.parse(saved); for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, back); }
    void kind;
    if (ok) {
      const tag = issue.vars && (issue.vars.tag || issue.vars.a) ? (c.target === (issue.ids || [])[1] && issue.vars.b ? issue.vars.b : issue.vars.tag || issue.vars.a) : "";
      return { key: c.key, vars: { tag, ...(c.vars || {}) }, apply: c.apply, code: issue.code };
    }
  }
  return null;
}

/**
 * Repairs everything that can be repaired (in `project`, changed in place), a few rounds since one repair can
 * settle another: { fixed: [{ code, key, vars }], left: [issues still there] }.
 */
export function fixAll(project, { rounds = 3, codes = null } = {}) {
  const fixed = [];
  for (let round = 0; round < rounds; round++) {
    let any = false;
    const current = new Map(); // level → its issues now (refreshed after a repair there)
    const now = (lv) => { if (!current.has(lv)) current.set(lv, runCheck(project, { level: lv })); return current.get(lv); };
    for (const issue of runCheck(project)) {
      if (codes && !codes.includes(issue.code)) continue;
      // Still there (an earlier repair this round may have settled it)?
      if (!now(issue.level).some((x) => x.code === issue.code && sameIds(x.ids || [], issue.ids || []))) continue;
      const fx = findFix(project, issue);
      if (!fx) continue;
      fx.apply(project);
      current.delete(issue.level);
      fixed.push({ code: fx.code, key: fx.key, vars: fx.vars });
      any = true;
    }
    if (!any) break;
  }
  const left = runCheck(project).filter((x) => !codes || codes.includes(x.code));
  return { fixed, left };
}

export { findIn };
