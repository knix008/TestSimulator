// Drawing a documentation view: floor plans (the plan renderer on a project
// filtered for the view), generated model views (sections, elevations,
// ceiling plans, axonometrics, detail callouts), drafting views and legends,
// plus their annotations, level lines, grid heads and the section /
// elevation / callout markers that link plans to those views.
//
// Everything draws through the canvas API in the view's own 2D frame, so the
// editor canvas, sheets (SvgContext) and DXF output share one code path.

import { drawPlan, planBounds, phaseVisible } from "../plan/render.js";
import { levelById, levelAbove, findItem } from "../core/project.js";
import { modelExtent } from "../view3d/build.js";
import { roomLabelPoint } from "../core/rooms.js";
import { drawLightSymbol, isLight, furnitureCorners } from "../lib/furniture.js";
import { sectionFrame, elevationFrame, ceilingFrame, axoFrame, modelTriangles, generate, loadThree, categoryOf } from "./section.js";
import { drawPoche, polyPath, hatchOf } from "./hatch.js";
import { drawAnnotations, planAnchor, fmtElevation, TEXT } from "./annot.js";
import { effectiveView, viewById, annotationsOf, placementOf, allViews, isHidden, DEFAULT_3D } from "./model.js";
import { displayName } from "./names.js";


// ---------------------------------------------------------------- spec
// What a view shows and how: {type: plan | model | drafting | legend |
// schedule, frame, crop, detail, phase, hidden: Set, scale, level}
export function viewSpec(p, view0) {
  const v = effectiveView(p, view0);
  if (!v) return null;
  const hidden = new Set(v.hidden || []);
  const base = { view: v, scale: v.scale || 100, detail: v.detail || "medium", phase: v.phase || "all", hidden, crop: v.cropOn && v.crop ? v.crop : null };
  if (v.kind === "plan") return { ...base, type: "plan", level: v.level };
  if (v.kind === "ceiling") {
    const lv = levelById(p, v.level);
    if (!lv) return null;
    const cut = v.cutHeight ?? 2300;
    const up = levelAbove(p, lv.id);
    const far = up ? up.elevation - (lv.elevation + cut) + 5 : lv.height - cut + 3000;
    // A reflected ceiling plan shows no furniture (trees, cupboards) — only the lights.
    const hid = new Set(base.hidden);
    if (!v.showFurniture) hid.add("furniture");
    return { ...base, hidden: hid, type: "model", level: lv.id, frame: ceilingFrame(lv.elevation + cut, Math.max(100, far)), ceiling: true };
  }
  if (v.kind === "section" && v.line) return { ...base, type: "model", frame: sectionFrame(v.line, !!v.flip, v.far || 1e6) };
  if (v.kind === "elevation") return { ...base, type: "model", frame: elevationFrame(v.x || 0, v.y || 0, v.angle || 0, v.far || 1e6) };
  if (v.kind === "3d") {
    const e = modelExtent(p);
    const c = [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, e.top / 2];
    const cam = v.camera || { pos: [c[0] / 1000 + 20, 18, c[1] / 1000 + 24], target: [c[0] / 1000, c[2] / 1000, c[1] / 1000] };
    return { ...base, type: "model", frame: axoFrame(cam, c), axo: true, crop: null };
  }
  if (v.kind === "detail") {
    const parent = viewById(p, v.parent);
    const ps = parent && parent.kind !== "detail" ? viewSpec(p, parent) : null;
    if (!ps) return null;
    return { ...ps, view: v, scale: v.scale || 20, detail: v.detail || "fine", phase: v.phase || ps.phase, hidden: new Set([...(ps.hidden || []), ...hidden]), crop: v.crop || ps.crop, parentView: parent };
  }
  if (v.kind === "legend") return { ...base, type: "legend" };
  if (v.kind === "schedule") return { ...base, type: "schedule" };
  return { ...base, type: "drafting" };
}

// ---------------------------------------------------------------- generation cache
const genCache = new Map(); // key → gen
const triCache = new Map(); // key → model triangles
const pending = new Map();
const MAX_GENS = 40;

function specKey(spec) {
  return JSON.stringify([spec.frame, spec.crop, spec.detail, spec.phase, [...spec.hidden].sort()]);
}

export function cachedGen(p, spec, rev) {
  if (!spec || spec.type !== "model") return null;
  return genCache.get(`${rev}|${specKey(spec)}`) || null;
}

// Last result for the same view settings, even of an older revision (shown
// while the new one is computed).
export function staleGen(spec) {
  if (!spec || spec.type !== "model") return null;
  const k = specKey(spec);
  let best = null;
  for (const [key, g] of genCache) if (key.endsWith(`|${k}`)) best = g;
  return best;
}

export async function ensureGen(p, spec, rev, THREEarg = null) {
  if (!spec || spec.type !== "model") return null;
  const key = `${rev}|${specKey(spec)}`;
  if (genCache.has(key)) return genCache.get(key);
  if (pending.has(key)) return pending.get(key);
  const job = (async () => {
    const THREE = THREEarg || (await loadThree());
    const hid = [...spec.hidden].filter((c) => !["dimensions", "texts", "tags", "grids", "levels", "markers", "drawings", "regions", "clouds", "symbols"].includes(c)).sort();
    const tk = `${rev}|${spec.phase}|${hid.join(",")}`;
    let model = triCache.get(tk);
    if (!model) {
      model = modelTriangles(THREE, p, { phase: spec.phase, furniture: !spec.hidden.has("furniture"), hidden: new Set(hid) });
      triCache.set(tk, model);
      while (triCache.size > 4) triCache.delete(triCache.keys().next().value);
    }
    const gen = generate(p, model, spec.frame, { crop: spec.crop, detail: spec.detail, res: spec.axo ? 1600 : 2000 });
    genCache.set(key, gen);
    while (genCache.size > MAX_GENS) genCache.delete(genCache.keys().next().value);
    return gen;
  })();
  pending.set(key, job);
  try { return await job; } finally { pending.delete(key); }
}

export function clearGenCache() { genCache.clear(); triCache.clear(); }

// ---------------------------------------------------------------- plan views
// The project as one plan view shows it: hidden categories removed, rooms
// without their labels when the view carries its own room tags, windows
// above the cut height left out. Cached per (project, revision, view).
const planCache = new WeakMap();
export function planProject(p, view, rev = 0) {
  const v = effectiveView(p, view);
  if (!v) return p;
  let byView = planCache.get(p);
  if (!byView) planCache.set(p, (byView = new Map()));
  const key = `${rev}|${JSON.stringify([v.hidden, v.detail, v.cutHeight, v.phase])}|${v.id}`;
  const hit = byView.get(v.id);
  if (hit && hit.key === key) return hit.p;
  const hid = new Set(v.hidden || []);
  const q = { ...p };
  const drop = (k) => { q[k] = []; };
  for (const c of ["walls", "rooms", "columns", "stairs", "roofs", "solids", "dimensions", "texts", "drawings", "underlays"]) if (hid.has(c)) drop(c);
  if (hid.has("furniture")) q.furniture = p.furniture.filter((f) => categoryOf(p, "furniture", f.id) === "lights" && !hid.has("lights"));
  if (hid.has("lights")) q.furniture = q.furniture.filter((f) => categoryOf(p, "furniture", f.id) !== "lights");
  if (hid.has("grids")) q.grids = [];
  q.openings = p.openings.filter((o) => !(hid.has("doors") && o.kind === "door") && !(hid.has("windows") && o.kind === "window") && !(Number.isFinite(v.cutHeight) && o.sill >= v.cutHeight));
  if (Number.isFinite(v.cutHeight)) q.furniture = q.furniture.filter((f) => isLight(f) || (f.elevation || 0) < v.cutHeight);
  if (v.detail === "coarse") q.wallTypes = [];
  // The view's phase filter (new design / existing) on top of the user's phase view.
  if (v.phase && v.phase !== "all") for (const k of ["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "solids"]) q[k] = (q[k] || []).filter((it) => phaseVisible(it, v.phase));
  // Explicit room tags replace the automatic room names.
  const tags = annotationsOf(p, v.id).filter((a) => a.kind === "tag");
  const tagged = new Set(tags.map((a) => a.target));
  if (tags.some((a) => (findItem(p, a.target) || {}).kind === "rooms")) q.rooms = q.rooms.map((r) => (tagged.has(r.id) ? { ...r, name: "", showArea: false } : r));
  byView.set(v.id, { key, p: q });
  return q;
}

// drawPlan show-flags for a view (on top of the user's display settings).
export function planShow(p, view, base = {}) {
  const v = effectiveView(p, view);
  const hid = new Set((v && v.hidden) || []);
  const show = { ...base };
  if (hid.has("dimensions")) show.dims = false;
  if (hid.has("texts")) show.texts = false;
  if (hid.has("drawings")) show.drawings = false;
  if (hid.has("furniture") && hid.has("lights")) show.furniture = false;
  if (hid.has("roofs")) show.roofs = false;
  if (hid.has("grids")) show.grids = false;
  const tags = v ? annotationsOf(p, v.id).filter((a) => a.kind === "tag" && (findItem(p, a.target) || {}).kind === "openings") : [];
  if (tags.length || hid.has("tags")) show.tags = false;
  return show;
}

// Furniture above the cut plane: dashed outlines (overhead).
function drawOverhead(ctx, p, v, o) {
  if (!Number.isFinite(v.cutHeight)) return;
  ctx.save();
  ctx.strokeStyle = o.ink;
  ctx.lineWidth = Math.max(0.13 * o.scale, o.minLw || 0);
  ctx.setLineDash([2 * o.scale, 1 * o.scale]);
  for (const f of p.furniture) {
    if (f.level !== v.level || isLight(f) || (f.elevation || 0) < v.cutHeight) continue;
    polyPath(ctx, furnitureCorners(f));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- model views
// o: {scale, ink, bg, mono, print, minLw (one screen pixel), px}
export function drawModelView(ctx, p, spec, gen, o) {
  const S = spec.scale;
  const ink = o.ink || "#000000";
  if (!gen) return;
  // Poché.
  for (const c of gen.cut) {
    if (o.overrides && o.overrides[c.cat] && o.overrides[c.cat].color && !o.mono) {
      polyPath(ctx, c.pts); ctx.fillStyle = o.overrides[c.cat].color; ctx.fill();
      continue;
    }
    drawPoche(ctx, c.pts, c.mat, c.kind, spec.detail, { scale: S, mono: o.mono, lw: o.minLw });
  }
  // Lines: cut heavy, projection thin; per-category overrides recolour.
  const wCut = Math.max((spec.detail === "coarse" ? 0.5 : 0.35) * S, (o.minLw || 0) * 1.6);
  const wProj = Math.max(0.13 * S, o.minLw || 0);
  ctx.save();
  ctx.lineCap = "round";
  ctx.setLineDash([]);
  for (const cls of ["proj", "cut"]) {
    ctx.strokeStyle = cls === "proj" && o.halftone ? "#888888" : ink;
    ctx.lineWidth = cls === "cut" ? wCut : wProj;
    ctx.beginPath();
    for (const l of gen.lines) if (l.cls === cls) { ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); }
    ctx.stroke();
  }
  ctx.restore();
  if (spec.ceiling) drawCeilingExtras(ctx, p, spec, o);
}

// Ceiling plan extras: room names with the ceiling height, light symbols.
function drawCeilingExtras(ctx, p, spec, o) {
  const S = spec.scale;
  const lv = levelById(p, spec.level);
  const cut = spec.view.cutHeight ?? 2300;
  if (!spec.hidden.has("rooms")) {
    for (const r of p.rooms.filter((x) => x.level === spec.level)) {
      const [x, y] = r.label || roomLabelPoint(r);
      const ch = r.ceilingHeight || (r.props && r.props.ceilingHeight) || Math.min(lv ? lv.height : 2700, Math.max(cut, 2400));
      label(ctx, r.name || "", x, y - TEXT * 0.7 * S, TEXT * S, o.ink, true);
      label(ctx, `CH ${Math.round(ch)}`, x, y + TEXT * 0.8 * S, TEXT * 0.85 * S, o.ink, false);
    }
  }
  if (!spec.hidden.has("lights")) {
    const th = { furniture: o.ink, furnitureFill: o.bg || "#ffffff", select: "#1a73e8", wall: o.ink, door: o.ink, window: o.ink };
    for (const f of p.furniture.filter((x) => x.level === spec.level && isLight(x))) {
      ctx.save(); ctx.translate(f.x, f.y); if (f.rot) ctx.rotate((f.rot * Math.PI) / 180);
      try { drawLightSymbol(ctx, f, th, Math.max(0.18 * S, o.minLw || 0)); } catch { /* symbol needs a canvas feature */ }
      ctx.restore();
    }
  }
}

function label(ctx, s, x, y, size, color, bold = false, align = "center") {
  ctx.save();
  ctx.font = `${bold ? "bold " : ""}${size}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

// Level lines with heads and grid lines with bubbles in a section / elevation.
export function drawLevelsAndGrids(ctx, p, spec, gen, o) {
  if (!gen || spec.ceiling || spec.axo) return;
  const S = spec.scale;
  const f = spec.frame;
  if (Math.abs(f.dn[2]) < 0.9) return; // only vertical views
  const b = spec.crop || gen.bounds;
  const ink = o.ink;
  const lw = Math.max(0.18 * S, o.minLw || 0);
  ctx.save();
  if (!spec.hidden.has("levels")) {
    for (const lv of p.levels) {
      const y = -(lv.elevation - f.o[2]);
      const x1 = b.x1 - 4 * S, x2 = b.x2 + 6 * S;
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
      ctx.setLineDash([6 * S, 1.5 * S, 1 * S, 1.5 * S]);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.setLineDash([]);
      // Head: circle with two filled quadrants.
      const r = 1.8 * S, cx = x2 + r;
      ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ink;
      for (const q of [0, Math.PI]) { ctx.beginPath(); ctx.moveTo(cx, y); ctx.arc(cx, y, r, q - Math.PI / 2, q, false); ctx.closePath(); ctx.fill(); }
      label(ctx, lv.name, cx + r + 1 * S, y - TEXT * 0.65 * S, TEXT * S, ink, true, "left");
      label(ctx, fmtElevation(lv.elevation), cx + r + 1 * S, y + TEXT * 0.65 * S, TEXT * 0.9 * S, ink, false, "left");
    }
  }
  if (!spec.hidden.has("grids")) {
    for (const g of p.grids || []) {
      // Where does the grid line cross the view plane line?
      const gx = g.x2 - g.x1, gy = g.y2 - g.y1;
      const den = f.r[0] * gy - f.r[1] * gx;
      if (Math.abs(den) < 1e-6 * Math.hypot(gx, gy)) continue;
      const wx = g.x1 - f.o[0], wy = g.y1 - f.o[1];
      const t = (wx * gy - wy * gx) / den;
      const s = (wx * f.r[1] - wy * f.r[0]) / den;
      if (s < -0.25 || s > 1.25) continue;
      if (t < b.x1 - 1 || t > b.x2 + 1) continue;
      const y1 = b.y2 + 2 * S, y2 = b.y1 - 6 * S;
      ctx.strokeStyle = ink; ctx.lineWidth = lw;
      ctx.setLineDash([8 * S, 1.5 * S, 1 * S, 1.5 * S]);
      ctx.beginPath(); ctx.moveTo(t, y1); ctx.lineTo(t, y2); ctx.stroke();
      ctx.setLineDash([]);
      const r = 4 * S;
      ctx.beginPath(); ctx.arc(t, y2 - r, r, 0, Math.PI * 2);
      ctx.fillStyle = o.bg || "#ffffff"; ctx.fill(); ctx.stroke();
      label(ctx, g.label || "", t, y2 - r, TEXT * 1.2 * S, ink, true);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- legends
export function legendRows(p, view) {
  if (view.legend === "materials") return [...new Set(p.walls.map((w) => w.material).filter(Boolean))].map((m) => ({ name: m, swatch: [{ mat: m, t: 1 }] }));
  return (p.wallTypes || []).map((wt) => ({ name: wt.name, swatch: wt.layers.map((l) => ({ mat: l.material, t: l.thickness })), total: wt.layers.reduce((s, l) => s + l.thickness, 0) }));
}

function drawLegend(ctx, p, spec, o) {
  const S = spec.scale;
  const rows = legendRows(p, spec.view);
  let y = 0;
  label(ctx, spec.view.name, 0, y, TEXT * 1.4 * S, o.ink, true, "left");
  y += 10 * S;
  for (const r of rows) {
    let x = 0;
    const tot = r.swatch.reduce((s, q) => s + q.t, 0) || 1;
    const w = 30 * S;
    for (const q of r.swatch) {
      const ww = (w * q.t) / tot;
      drawPoche(ctx, [[x, y], [x + ww, y], [x + ww, y + 8 * S], [x, y + 8 * S]], q.mat, "walls", "fine", { scale: S * 0.5, mono: o.mono });
      ctx.strokeStyle = o.ink; ctx.lineWidth = Math.max(0.18 * S, o.minLw || 0);
      ctx.strokeRect(x, y, ww, 8 * S);
      x += ww;
    }
    label(ctx, r.total ? `${r.name}  (${r.total} mm)` : r.name, w + 4 * S, y + 4 * S, TEXT * S, o.ink, false, "left");
    y += 12 * S;
  }
  return { x1: -2 * S, y1: -6 * S, x2: 140 * S, y2: y };
}

// ---------------------------------------------------------------- markers in plans
// Markers drawn on a plan: every section and elevation (they cut through all
// levels) and the callouts whose parent is this plan view.
export function markersFor(p, planView) {
  const out = [];
  for (const v of allViews(p)) {
    if (v.kind === "section" && v.line) out.push(v);
    else if (v.kind === "elevation" && (!v.level || !planView || v.level === planView.level || v.allLevels !== false)) out.push(v);
    else if (v.kind === "detail" && planView && v.parent === planView.id && v.crop) out.push(v);
  }
  return out;
}

function refText(p, v) {
  const pl = placementOf(p, v.id);
  return pl ? [String(pl.number), pl.sheet.number] : [v.ref || "—", "—"];
}

// Geometry of a marker (plan mm) for drawing and hit testing.
export function markerGeometry(v, S) {
  const r = 4 * S;
  if (v.kind === "section") {
    let { x1, y1, x2, y2 } = v.line;
    const L = Math.hypot(x2 - x1, y2 - y1) || 1;
    const d = [(x2 - x1) / L, (y2 - y1) / L];
    let n = [d[1], -d[0]]; // look direction
    if (v.flip) n = [-n[0], -n[1]];
    const heads = [[x1 - d[0] * r, y1 - d[1] * r], [x2 + d[0] * r, y2 + d[1] * r]];
    return { kind: "section", a: [x1, y1], b: [x2, y2], d, n, heads, r };
  }
  if (v.kind === "elevation") {
    const a = ((v.angle || 0) * Math.PI) / 180;
    return { kind: "elevation", c: [v.x, v.y], n: [Math.cos(a), Math.sin(a)], r };
  }
  if (v.kind === "detail") return { kind: "detail", box: v.crop, r };
  return null;
}

export function drawMarkers(ctx, p, planView, o) {
  const S = o.scale || 100;
  const ink = o.markerInk || o.ink;
  const lw = Math.max(0.25 * S, o.minLw || 0);
  for (const v of markersFor(p, planView)) {
    const g = markerGeometry(v, S);
    if (!g) continue;
    const sel = o.selected && o.selected.has(v.id);
    ctx.save();
    ctx.strokeStyle = sel ? o.select || "#1a73e8" : ink;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = lw;
    const [top, bottom] = refText(p, v);
    if (g.kind === "section") {
      ctx.setLineDash([8 * S, 2 * S, 1 * S, 2 * S]);
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(...g.a); ctx.lineTo(...g.b); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = lw * 2.2;
      ctx.beginPath();
      ctx.moveTo(...g.a); ctx.lineTo(g.a[0] + g.d[0] * 6 * S, g.a[1] + g.d[1] * 6 * S);
      ctx.moveTo(...g.b); ctx.lineTo(g.b[0] - g.d[0] * 6 * S, g.b[1] - g.d[1] * 6 * S);
      ctx.stroke();
      ctx.lineWidth = lw;
      for (const c of g.heads) head(ctx, c, g.r, g.n, top, bottom, o, ctx.strokeStyle);
      label(ctx, displayName(v.name), g.heads[1][0] + g.n[0] * g.r * 2.6, g.heads[1][1] + g.n[1] * g.r * 2.6, TEXT * 0.9 * S, ctx.strokeStyle, false);
    } else if (g.kind === "elevation") {
      head(ctx, g.c, g.r, g.n, top, bottom, o, ctx.strokeStyle);
      label(ctx, displayName(v.name), g.c[0] + g.n[0] * g.r * 3.2, g.c[1] + g.n[1] * g.r * 3.2 + TEXT * S, TEXT * 0.9 * S, ctx.strokeStyle, false);
    } else if (g.kind === "detail") {
      const b = g.box;
      ctx.setLineDash([3 * S, 1.5 * S]);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1), 3 * S); else ctx.rect(Math.min(b.x1, b.x2), Math.min(b.y1, b.y2), Math.abs(b.x2 - b.x1), Math.abs(b.y2 - b.y1));
      ctx.stroke();
      ctx.setLineDash([]);
      const c = [Math.max(b.x1, b.x2) + g.r * 1.4, Math.min(b.y1, b.y2) - g.r * 0.4];
      ctx.beginPath(); ctx.moveTo(Math.max(b.x1, b.x2), Math.min(b.y1, b.y2) + g.r); ctx.lineTo(c[0] - g.r * 0.7, c[1] + g.r * 0.7); ctx.stroke();
      head(ctx, c, g.r, null, top, bottom, o, ctx.strokeStyle);
      label(ctx, displayName(v.name), c[0] + g.r * 1.3, c[1], TEXT * 0.9 * S, ctx.strokeStyle, false, "left");
    }
    ctx.restore();
  }
}

// A view reference head: circle split in two (detail number / sheet), with a
// filled pointer towards the look direction n.
function head(ctx, c, r, n, top, bottom, o, color) {
  if (n) {
    const a = Math.atan2(n[1], n[0]);
    ctx.beginPath();
    ctx.moveTo(c[0] + Math.cos(a) * r * 1.9, c[1] + Math.sin(a) * r * 1.9);
    ctx.lineTo(c[0] + Math.cos(a + 1.2) * r, c[1] + Math.sin(a + 1.2) * r);
    ctx.lineTo(c[0] + Math.cos(a - 1.2) * r, c[1] + Math.sin(a - 1.2) * r);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
  ctx.fillStyle = o.bg || "#ffffff"; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c[0] - r, c[1]); ctx.lineTo(c[0] + r, c[1]); ctx.stroke();
  ctx.fillStyle = color;
  label(ctx, top, c[0], c[1] - r * 0.45, r * 0.62, color, true);
  label(ctx, bottom, c[0], c[1] + r * 0.48, r * 0.5, color, false);
}

// Hit test of markers: → {view, part: "line" | "a" | "b" | "head" | "box" | "corner", index?}
export function hitMarker(p, planView, x, y, tol, S) {
  const d2 = (q) => Math.hypot(q[0] - x, q[1] - y);
  const seg = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t); };
  for (const v of markersFor(p, planView).reverse()) {
    const g = markerGeometry(v, S);
    if (!g) continue;
    if (g.kind === "section") {
      if (d2(g.heads[0]) <= g.r + tol) return { view: v, part: "head", end: 0 };
      if (d2(g.heads[1]) <= g.r + tol) return { view: v, part: "head", end: 1 };
      if (d2(g.a) <= tol * 1.5) return { view: v, part: "a" };
      if (d2(g.b) <= tol * 1.5) return { view: v, part: "b" };
      if (seg(g.a, g.b) <= tol) return { view: v, part: "line" };
    } else if (g.kind === "elevation") {
      if (d2(g.c) <= g.r * 1.9 + tol) return { view: v, part: "head" };
    } else if (g.kind === "detail") {
      const b = g.box;
      const corners = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]];
      for (let i = 0; i < 4; i++) if (d2(corners[i]) <= tol * 1.5) return { view: v, part: "corner", index: i };
      for (let i = 0; i < 4; i++) if (seg(corners[i], corners[(i + 1) % 4]) <= tol) return { view: v, part: "box" };
      const c = [Math.max(b.x1, b.x2) + g.r * 1.4, Math.min(b.y1, b.y2) - g.r * 0.4];
      if (d2(c) <= g.r + tol) return { view: v, part: "head" };
    }
  }
  return null;
}

// ---------------------------------------------------------------- whole view
// Annotation drawing options for a view.
export function annotationOptions(p, spec, gen, o) {
  const plan = spec.type === "plan" || spec.ceiling;
  const anchorOf = (id) => {
    if (plan) return planAnchor(p, id);
    const bb = gen && gen.items.get(id);
    return bb ? [(bb.x1 + bb.x2) / 2, bb.y1 + (bb.y2 - bb.y1) * 0.3] : null;
  };
  const lvElev = spec.level ? (levelById(p, spec.level) || {}).elevation || 0 : 0;
  const spot = (x, y) => (spec.type === "model" && !spec.ceiling && !spec.axo ? -(y) + spec.frame.o[2] : lvElev);
  return { scale: spec.scale, ink: o.ink, bg: o.bg, mono: o.mono, print: o.print, select: o.select, selected: o.selected, minLw: o.minLw, halo: o.halo, units: o.units, p, anchorOf, spot, hidden: spec.hidden };
}

// Draw the whole view into ctx (already in view coordinates).
// o: {ink, bg, mono, print, minLw, select, selected, units, rev, gen,
//     planOpts (extra drawPlan options), theme (plan theme)}
export function drawView(ctx, p, view, o) {
  const spec = viewSpec(p, view);
  if (!spec) return null;
  const gen = o.gen || (spec.type === "model" ? cachedGen(p, spec, o.rev ?? 0) || staleGen(spec) : null);
  if (spec.type === "plan") {
    const pv = spec.view;
    const pp = planProject(p, pv, o.rev ?? 0);
    const th = o.theme;
    drawPlan(ctx, pp, th, {
      level: pv.level, lw: (o.minLw || 1) * (o.print ? 1 : 1), px: o.px || o.minLw || 1, print: !!o.print, units: o.units, phase: spec.phase !== "all" ? spec.phase : o.phase, models: new Map(p.models.map((m) => [m.id, m])), labels: o.labels,
      ...(o.planOpts || {}), show: planShow(p, pv, { ghost: false, underlays: false, ...((o.planOpts && o.planOpts.show) || {}) }),
    });
    drawOverhead(ctx, p, pv, { ...o, scale: spec.scale });
    if (!spec.hidden.has("markers")) drawMarkers(ctx, p, pv, { ...o, scale: spec.scale });
  } else if (spec.type === "model") {
    drawModelView(ctx, p, spec, gen, { ...o, overrides: spec.view.overrides, halftone: false });
    drawLevelsAndGrids(ctx, p, spec, gen, o);
    if (spec.ceiling && !spec.hidden.has("markers")) drawMarkers(ctx, p, null, { ...o, scale: spec.scale });
  } else if (spec.type === "legend") {
    drawLegend(ctx, p, spec, o);
  }
  // Annotations of this view (a detail shows its own).
  drawAnnotations(ctx, annotationsOf(p, spec.view.id), annotationOptions(p, spec, gen, o));
  return { spec, gen };
}

// Extent of a view's content in its frame (crop when on; + room for heads).
export function viewExtent(p, view, gen = null, rev = 0) {
  const spec = viewSpec(p, view);
  if (!spec) return { x1: 0, y1: 0, x2: 1000, y2: 1000 };
  const S = spec.scale;
  const anns = annotationsOf(p, spec.view.id);
  if (spec.crop) return { ...spec.crop };
  let b = null;
  const add = (x, y) => { if (!Number.isFinite(x) || !Number.isFinite(y)) return; if (!b) b = { x1: x, y1: y, x2: x, y2: y }; else { b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y); b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y); } };
  if (spec.type === "plan" || (spec.type === "model" && spec.ceiling)) {
    const pb = planBounds(p, spec.level) || planBounds(p);
    if (pb) { add(pb.x1 - 600, pb.y1 - 600); add(pb.x2 + 600, pb.y2 + 600); }
  } else if (spec.type === "model") {
    const g = gen || cachedGen(p, spec, rev) || staleGen(spec);
    if (g) {
      add(g.bounds.x1, g.bounds.y1); add(g.bounds.x2, g.bounds.y2);
      if (!spec.axo && Math.abs(spec.frame.dn[2]) > 0.9) { add(g.bounds.x2 + 22 * S, g.bounds.y1); add(g.bounds.x1 - 5 * S, g.bounds.y1 - 14 * S); }
    }
  } else if (spec.type === "legend") {
    const rows = legendRows(p, spec.view).length;
    add(-2 * S, -6 * S); add(140 * S, (10 + rows * 12) * S);
  }
  for (const a of anns) {
    for (const q of [...(a.pts || []), ...(a.leader || []), a.c, a.a, a.b, a.p].filter(Boolean)) add(q[0], q[1]);
    if (Number.isFinite(a.x)) add(a.x, a.y);
  }
  return b || { x1: 0, y1: 0, x2: 100 * S, y2: 70 * S };
}

export { DEFAULT_3D, isHidden, hatchOf };
