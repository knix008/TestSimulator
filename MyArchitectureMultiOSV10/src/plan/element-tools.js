// Plan editor tools of the BIM elements (the editor calls in here):
//   slab      click inside the walls → a floor slab under the building outline;
//             Shift+click draws its outline (Enter / first point finishes)
//   ceiling   click inside a room → a ceiling over it; Shift+click draws one
//   shaft     two opposite corners of a vertical opening
//   beam      two points (snaps to columns and wall ends)
//   railing   click the points of its path (Enter / double-click ends)
//   ramp      click the points of its centre line, bottom first
//   curtainWall  drawn like walls, with a curtain-wall type
// Stairs keep the stair tool; its shape (straight, L, U, spiral) is a setting.

import { t } from "../ui/i18n.js";
import { toast } from "../ui/widgets.js";
import { uid, dist, pointInPolygon, polygonArea, fmtLen } from "../core/geom.js";
import { levelById } from "../core/project.js";
import { roomAtPoint, buildingOutlines } from "../core/rooms.js";
import { DEFAULT_CURTAIN_TYPES, typeById, applyType, slabTypeById, slabTypeThickness } from "../core/elements/model.js";
import { beamOutline, stairRise } from "../core/elements/geometry.js";

export const ELEMENT_TOOLS = new Set(["slab", "ceiling", "shaft", "beam", "railing", "ramp", "member"]);
export const OPEN_CHAIN_TOOLS = new Set(["railing", "ramp"]);
const AREA_TOOLS = new Set(["slab", "ceiling"]);

const S = (ed) => ed.app.settings;

export function pointerElement(ed, type, e, x, y) {
  const tool = ed.tool;
  if (tool === "beam" || tool === "shaft" || tool === "member") return twoPoint(ed, type, e, x, y);
  const c = ed.chain;
  const last = c && c.pts.length ? c.pts[c.pts.length - 1] : null;
  const s = ed.snapAt(x, y, { from: last, ortho: !!last && ed.ortho && !e.shiftKey, onWall: false });
  ed.cursor = s;
  if (type === "move") { ed.request(); return; }
  if (type !== "down" || e.button !== 0) return;
  if (!c && !e.shiftKey && AREA_TOOLS.has(tool)) {
    const walls = ed.p.walls.filter((w) => w.level === ed.level);
    if (tool === "slab") {
      const out = buildingOutlines(walls).filter((pts) => pointInPolygon(x, y, pts));
      if (out.length) { createArea(ed, "slab", out[0]); return; }
    } else {
      const r = ed.p.rooms.find((q) => q.level === ed.level && pointInPolygon(x, y, q.pts));
      const pts = r ? r.pts : (roomAtPoint(walls, x, y) || {}).pts;
      if (pts) { createArea(ed, "ceiling", pts); return; }
    }
  }
  if (c && c.pts.length >= (AREA_TOOLS.has(tool) ? 3 : 2) && dist(s.x, s.y, ...c.pts[0]) < ed.tol() * 1.5 && AREA_TOOLS.has(tool)) { ed.finishChain(); return; }
  if (!c) ed.chain = { tool, pts: [[s.x, s.y]], ids: [] };
  else if (dist(s.x, s.y, ...last) < 1) { ed.finishChain(); return; }
  else c.pts.push([s.x, s.y]);
  ed.request();
}

// Called by PlanEditor.finishChain for the element chains.
export function finishElementChain(ed, c) {
  if (AREA_TOOLS.has(c.tool) && c.pts.length >= 3) createArea(ed, c.tool, c.pts);
  if (c.tool === "railing" && c.pts.length >= 2) createRailing(ed, c.pts);
  if (c.tool === "ramp" && c.pts.length >= 2) createRamp(ed, c.pts);
}

export function createArea(ed, kind, pts) {
  if (Math.abs(polygonArea(pts)) < 1e4) return null;
  const id = uid(kind === "slab" ? "sl" : "cl");
  const set = S(ed);
  const pts2 = pts.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  if (kind === "slab") {
    const st = slabTypeById(ed.p, set.slabType || "floor-concrete-250");
    ed.store.edit(t("Add slab"), (p) => { p.slabs.push({ id, level: ed.level, pts: pts2, holes: [], ...(st ? { type: st.id, thickness: slabTypeThickness(st) } : { thickness: 200 }), offset: 0, slope: 0, slopeDir: 0, kind: st && st.use === "foundation" ? "foundation" : "floor", phase: set.drawPhase || "new" }); });
    toast(t("Floor slab added: {a} m². Set its type, offset and slope on the right.", { a: (Math.abs(polygonArea(pts)) / 1e6).toFixed(2) }), "ok", 3000);
  } else {
    const st = slabTypeById(ed.p, set.ceilingType || "ceil-gypsum-15");
    ed.store.edit(t("Add ceiling"), (p) => { p.ceilings.push({ id, level: ed.level, pts: pts2, holes: [], ...(st ? { type: st.id, thickness: slabTypeThickness(st) } : { thickness: 20 }), height: +set.ceilingHeight || null, phase: set.drawPhase || "new" }); });
    toast(t("Ceiling added. Change its height on the right."), "ok", 2500);
  }
  ed.select([id]);
  return id;
}

export function createRailing(ed, pts) {
  const id = uid("rl");
  const set = S(ed);
  const ty = typeById(ed.p, set.railingType || "rail-steel-1000");
  const r = { id, level: ed.level, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), height: 1000, z: 0, spacing: 120, baluster: 20, rail: 50, style: "bars", material: "steel", phase: set.drawPhase || "new" };
  if (ty) { r.typeId = ty.id; applyType(ty, r); }
  ed.store.edit(t("Add railing"), (p) => { p.railings.push(r); });
  ed.select([id]);
  return id;
}

export function createRamp(ed, pts) {
  const id = uid("rp");
  const set = S(ed);
  ed.store.edit(t("Add ramp"), (p) => { p.ramps.push({ id, level: ed.level, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]), width: +set.rampWidth || 1500, rise: null, thickness: 150, material: "concrete", railing: "both", phase: set.drawPhase || "new" }); });
  const rp = ed.p.ramps.find((r) => r.id === id);
  if (rp) {
    let L = 0;
    for (let i = 1; i < rp.pts.length; i++) L += dist(...rp.pts[i - 1], ...rp.pts[i]);
    const lv = levelById(ed.p, ed.level);
    const rise = lv ? lv.height : 2800;
    toast(t("Ramp added: slope 1:{k}. Set its rise (to the level above by default) on the right.", { k: Math.round(L / Math.max(1, rise)) }), "ok", 3500);
  }
  ed.select([id]);
  return id;
}

// Beam (start, end) and shaft (two corners).
function twoPoint(ed, type, e, x, y) {
  const m = ed.measure;
  const lineTool = ed.tool === "beam" || ed.tool === "member";
  const s = ed.snapAt(x, y, { from: m && m.stage === 1 ? m.a : null, ortho: !!m && ed.ortho && !e.shiftKey && lineTool, onWall: lineTool });
  ed.cursor = s;
  if (type === "move") { ed.request(); return; }
  if (type !== "down" || e.button !== 0) return;
  if (!m) { ed.measure = { a: [s.x, s.y], b: null, stage: 1, offset: 0 }; ed.request(); return; }
  const a = m.a, b = [s.x, s.y];
  ed.measure = null;
  if (ed.tool === "beam") createBeam(ed, a, b);
  else if (ed.tool === "member") createMember(ed, a, b);
  else if (ed.toolOpts && "holeIn" in ed.toolOpts) { createHole(ed, a, b, ed.toolOpts.holeIn); ed.setTool("select"); }
  else createShaft(ed, a, b);
  ed.request();
}

export function createBeam(ed, a, b) {
  if (dist(...a, ...b) < 200) return null;
  const id = uid("bm");
  const set = S(ed);
  const ty = typeById(ed.p, set.beamType || "beam-concrete-300x600");
  const bm = { id, level: ed.level, x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 300, h: 600, profile: "rect", z1: null, z2: null, material: "concrete", phase: set.drawPhase || "new" };
  if (ty) { bm.typeId = ty.id; applyType(ty, bm); }
  ed.store.edit(t("Add beam"), (p) => { p.beams.push(bm); });
  return id;
}

// A structural member between two clicks at the top of the storey, or a
// post from the floor to the top when both clicks fall on the same point.
// Section, material and role: the last ones used (settings.memberDefaults).
export const MEMBER_DEFAULTS = { profile: "H", w: 300, h: 300, t: 15, material: "steel-grey", role: "beam" };
export function createMember(ed, a, b) {
  const lv = ed.p.levels.find((l) => l.id === ed.level);
  const H = lv ? lv.height : 3000;
  const post = dist(...a, ...b) < 50;
  if (!post && dist(...a, ...b) < 200) return null;
  const id = uid("mb");
  const set = S(ed);
  const def = { ...MEMBER_DEFAULTS, ...(set.memberDefaults || {}) };
  const m = { id, level: ed.level, pts: post ? [[a[0], a[1], 0], [a[0], a[1], H]] : [[a[0], a[1], H - def.h / 2], [b[0], b[1], H - def.h / 2]], ...def, role: post ? "column" : def.role === "column" ? "beam" : def.role, roll: 0, phase: set.drawPhase || "new" };
  ed.store.edit(t("Add member"), (p) => { p.members.push(m); });
  return id;
}

export function createShaft(ed, a, b) {
  if (Math.abs(b[0] - a[0]) < 200 || Math.abs(b[1] - a[1]) < 200) return null;
  const id = uid("sh");
  const p0 = ed.p;
  const i = p0.levels.findIndex((l) => l.id === ed.level);
  const top = p0.levels[p0.levels.length - 1].id;
  const pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  ed.store.edit(t("Add shaft"), (p) => { p.shafts.push({ id, level: ed.level, top: i >= 0 ? top : ed.level, pts, name: "" }); });
  toast(t("Shaft added through every level above. It cuts slabs, ceilings and roofs; set its top level on the right."), "ok", 3500);
  ed.select([id]);
  return id;
}

// An opening (hole) in one slab, ceiling or roof: the given one, else the
// one under the opening on this level (slabs first).
export function createHole(ed, a, b, targetId = null) {
  if (Math.abs(b[0] - a[0]) < 50 || Math.abs(b[1] - a[1]) < 50) return null;
  const pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const p = ed.p;
  const pick = (list) => list.find((x) => x.level === ed.level && pointInPolygon(c[0], c[1], x.pts));
  const kind = targetId ? ["slabs", "ceilings", "roofs"].find((k) => p[k].some((x) => x.id === targetId)) : null;
  const target = kind ? p[kind].find((x) => x.id === targetId) : pick(p.slabs) || pick(p.ceilings) || pick(p.roofs);
  if (!target) { toast(t("Draw the opening inside a slab, ceiling or roof."), "warn"); return null; }
  ed.store.edit(t("Add opening"), () => { target.holes = [...(target.holes || []), pts]; });
  ed.select([target.id]);
  return target.id;
}

// A new stair from two clicks with the shape chosen for the stair tool.
export function stairFromClicks(ed, a, b, base) {
  const shape = S(ed).stairShape || "straight";
  const out = { ...base, railing: S(ed).stairRailing || "both" };
  if (shape === "straight") return out;
  out.shape = shape;
  out.turn = S(ed).stairTurn === -1 ? -1 : 1;
  const len = dist(...a, ...b);
  if (shape === "L") { out.length2 = Math.max(1200, Math.round(len * 0.7)); out.landing = out.width; }
  if (shape === "U") { out.landing = out.width; out.gap = 100; }
  if (shape === "spiral") {
    // First click: the centre; second: the outer radius and the start angle.
    out.x = a[0]; out.y = a[1];
    out.radius = Math.max(150, Math.round(len - out.width));
    out.sweep = 270;
  }
  return out;
}

// Previews drawn by the editor's overlay.
export function renderElementOverlay(ed, ctx, px, th) {
  const m = ed.measure, cur = ed.cursor;
  if (!m || !cur || !ELEMENT_TOOLS.has(ed.tool) || m.b) return;
  const b = [cur.x, cur.y];
  ctx.strokeStyle = th.select;
  ctx.lineWidth = 1.5 * px;
  ctx.fillStyle = "rgba(79,157,255,0.18)";
  ctx.beginPath();
  if (ed.tool === "beam" || ed.tool === "member") {
    const w = (typeById(ed.p, S(ed).beamType || "beam-concrete-300x600") || { params: { w: 300 } }).params.w || 300;
    if (dist(...m.a, ...b) > 1) beamOutline({ x1: m.a[0], y1: m.a[1], x2: b[0], y2: b[1], w }).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  } else {
    ctx.rect(Math.min(m.a[0], b[0]), Math.min(m.a[1], b[1]), Math.abs(b[0] - m.a[0]), Math.abs(b[1] - m.a[1]));
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  void fmtLen;
}

// Make sure a curtain-wall type exists (the curtain wall tool adds the
// built-in ones to a project that has none) → its id.
export function ensureCurtainType(p, wanted) {
  if (wanted && p.wallTypes.some((w) => w.id === wanted && w.kind === "curtain")) return wanted;
  let first = p.wallTypes.find((w) => w.kind === "curtain");
  if (!first) { for (const wt of DEFAULT_CURTAIN_TYPES) p.wallTypes.push(JSON.parse(JSON.stringify(wt))); first = p.wallTypes.find((w) => w.id === (wanted || DEFAULT_CURTAIN_TYPES[0].id)) || p.wallTypes.find((w) => w.kind === "curtain"); }
  return first.id;
}

export { stairRise };
