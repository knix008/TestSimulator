// Plan drawing, hit testing and plan edits of the BIM elements
// (src/core/elements): slabs, ceilings, beams, railings, ramps, shafts, stairs
// by type, curtain walls. Pure functions of the project and a canvas-like
// context, like render.js and ops.js, so they run in Node tests.

import { pointInPolygon, pointSegDist, dist, labelPoint, polygonArea, rotPt, bounds } from "../core/geom.js";
import { materialColor } from "../lib/materials.js";
import { wallPoint, wallFrame } from "../core/walls.js";
import { levelById, wallLength } from "../core/project.js";
import {
  shaftsAt, cutsOf, slabArea, beamOutline, beamFrame, rampModel, stairLayout, stairRise, stairRails, curtainGrid, isCurtainWall, ceilingHeight, offsetPath,
} from "../core/elements/geometry.js";
import { optionHidden } from "../core/elements/model.js";

// Element collections drawn from a list of points (pts) and with two ends (beams).
export const PTS_KINDS = ["slabs", "ceilings", "railings", "ramps", "shafts"];
export const OPEN_PATH_KINDS = ["railings", "ramps"];

const alpha = (hex, a) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

function label(ctx, s, x, y, size, o = {}) {
  const sz = Math.max(size, (o.minPx || 0) * (o.px || 0));
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate((o.rot * Math.PI) / 180);
  ctx.font = `${o.bold ? "600 " : ""}${sz}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (o.halo && ctx.strokeText) { ctx.lineWidth = sz * 0.22; ctx.strokeStyle = o.halo; ctx.lineJoin = "round"; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = o.color || "#000";
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

function arrowHead(ctx, a, b, size) {
  const L = dist(...a, ...b) || 1;
  const d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-d[1], d[0]];
  ctx.beginPath();
  ctx.moveTo(...b);
  ctx.lineTo(b[0] - d[0] * size + n[0] * size * 0.5, b[1] - d[1] * size + n[1] * size * 0.5);
  ctx.lineTo(b[0] - d[0] * size - n[0] * size * 0.5, b[1] - d[1] * size - n[1] * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- drawing
// Under the rooms: floor slabs and foundations, shafts.
export function drawElementsUnder(ctx, p, th, o, on) {
  const lw = o.lw;
  if (o.show.slabs !== false) {
    for (const s of on(p.slabs || [])) {
      const cuts = cutsOf(p, s);
      ctx.beginPath();
      for (const ring of [s.pts, ...cuts]) ring.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = alpha(materialColor(s.material || (s.kind === "foundation" ? "concrete" : "concrete"), "#a7a7a2"), o.print ? 0.08 : 0.12);
      if (ctx.fill) ctx.fill("evenodd");
      ctx.strokeStyle = th.hatch;
      ctx.lineWidth = lw * 1.1;
      if (s.kind === "foundation") ctx.setLineDash([lw * 8, lw * 4]);
      poly(ctx, s.pts);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const h of s.holes || []) { poly(ctx, h); ctx.stroke(); crossOut(ctx, h); }
      if (s.slope > 0) {
        const [cx, cy] = labelPoint(s.pts);
        const a = ((s.slopeDir || 0) * Math.PI) / 180;
        const k = Math.min(1500, Math.sqrt(Math.abs(polygonArea(s.pts))) / 4);
        ctx.fillStyle = ctx.strokeStyle = th.dim;
        ctx.lineWidth = lw * 1.2;
        const A = [cx - Math.cos(a) * k, cy - Math.sin(a) * k], B = [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
        ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
        arrowHead(ctx, A, B, 220);
        label(ctx, `${Math.round(s.slope * 10) / 10}°`, cx, cy - 260, 170, { color: th.dim, px: o.px, minPx: 8, halo: o.print ? null : th.bg });
      }
    }
  }
  // Shafts: outline with both diagonals (on every level they pass through).
  if (o.show.shafts !== false) {
    for (const s of shaftsAt(p, o.level)) {
      if (optionHidden(s)) continue;
      ctx.strokeStyle = th.wall;
      ctx.lineWidth = lw * 1.4;
      poly(ctx, s.pts);
      ctx.stroke();
      crossOut(ctx, s.pts);
      if (s.name) { const [x, y] = labelPoint(s.pts); label(ctx, s.name, x, y, 180, { color: th.text, px: o.px, minPx: 8, halo: o.print ? null : th.bg }); }
    }
  }
}

function crossOut(ctx, pts) {
  const b = bounds(pts);
  // Diagonals of the bounding box clipped to the polygon are close enough for
  // the usual rectangular openings; draw the polygon's own diagonals.
  const n = pts.length;
  ctx.beginPath();
  if (n === 4) { ctx.moveTo(...pts[0]); ctx.lineTo(...pts[2]); ctx.moveTo(...pts[1]); ctx.lineTo(...pts[3]); }
  else { ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.moveTo(b.x2, b.y1); ctx.lineTo(b.x1, b.y2); }
  ctx.stroke();
}

// Over the walls: curtain walls, beams (dashed: above the cut), railings,
// ramps, stair railings, ceilings (dash-dot outline with the height).
export function drawElementsOver(ctx, p, th, o, on, walls) {
  const lw = o.lw;
  // Curtain walls: both faces, the glass line and the mullions.
  for (const w of walls) {
    if (!isCurtainWall(p, w)) continue;
    const t = w.thickness / 2;
    const L = wallLength(w);
    const { us, c } = curtainGrid(p, w, 3000);
    const demo = w.phase === "demolish";
    ctx.strokeStyle = demo ? th.issue : th.wall;
    ctx.lineWidth = lw;
    if (demo) ctx.setLineDash([lw * 6, lw * 4]);
    for (const v of [-t, t]) { ctx.beginPath(); ctx.moveTo(...wallPoint(w, 0, v)); ctx.lineTo(...wallPoint(w, L, v)); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.strokeStyle = th.window;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); ctx.moveTo(...wallPoint(w, 0, 0)); ctx.lineTo(...wallPoint(w, L, 0)); ctx.stroke();
    ctx.fillStyle = th.wallFill;
    ctx.strokeStyle = th.wall;
    ctx.lineWidth = lw;
    const m = Math.max(c.mullion, lw * 2);
    for (const u of us) {
      const uu = Math.min(L - m / 2, Math.max(m / 2, u));
      poly(ctx, [wallPoint(w, uu - m / 2, -t), wallPoint(w, uu + m / 2, -t), wallPoint(w, uu + m / 2, t), wallPoint(w, uu - m / 2, t)]);
      ctx.fill();
      ctx.stroke();
    }
  }
  if (o.show.beams !== false) {
    for (const b of on(p.beams || [])) {
      ctx.strokeStyle = th.column;
      ctx.lineWidth = lw * 1.1;
      ctx.setLineDash([lw * 7, lw * 4]);
      poly(ctx, beamOutline(b));
      ctx.stroke();
      ctx.setLineDash([lw * 14, lw * 3, lw * 2, lw * 3]);
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  if (o.show.ramps !== false) {
    for (const r of on(p.ramps || [])) {
      const m = rampModel(p, r);
      ctx.fillStyle = th.furnitureFill;
      ctx.strokeStyle = th.stair;
      ctx.lineWidth = lw * 1.4;
      poly(ctx, m.outline);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = lw;
      poly(ctx, r.pts, false);
      ctx.stroke();
      ctx.fillStyle = th.stair;
      const n = r.pts.length;
      arrowHead(ctx, r.pts[n - 2], r.pts[n - 1], 220);
      const [mx, my] = r.pts[0];
      label(ctx, `${(m.slope * 100).toFixed(1)}%  1:${m.slope > 0 ? Math.round(1 / m.slope) : "∞"}`, mx, my, 160, { color: th.stair, px: o.px, minPx: 8, halo: o.print ? null : th.bg });
    }
  }
  const railLine = (pts) => {
    ctx.lineWidth = lw * 1.8;
    poly(ctx, pts, false);
    ctx.stroke();
    ctx.lineWidth = lw;
    for (const [x, y] of pts) { ctx.beginPath(); ctx.rect(x - 30, y - 30, 60, 60); ctx.fill(); }
  };
  if (o.show.railings !== false) {
    ctx.strokeStyle = th.stair;
    ctx.fillStyle = th.stair;
    for (const r of on(p.railings || [])) railLine(r.pts);
    for (const s of on(p.stairs)) for (const rail of stairRails(p, s)) railLine(rail.map((q) => [q[0], q[1]]));
  }
  if (o.show.ceilings !== false) {
    for (const c of on(p.ceilings || [])) {
      ctx.strokeStyle = th.drawing;
      ctx.lineWidth = lw;
      ctx.setLineDash([lw * 10, lw * 3, lw * 2, lw * 3]);
      poly(ctx, c.pts);
      ctx.stroke();
      ctx.setLineDash([]);
      const [x, y] = labelPoint(c.pts);
      label(ctx, `CLG +${(ceilingHeight(p, c) / 1000).toFixed(2)}`, x, y + 420, 150, { color: th.drawing, px: o.px, minPx: 8, halo: o.print ? null : alpha(th.bg, 0.7) });
    }
  }
}

// Stairs by type (L, U, spiral) in plan: outline, treads, landings, walking line.
export function drawShapedStair(ctx, p, s, th, lw, o) {
  const lay = stairLayout(s, stairRise(p, s));
  ctx.strokeStyle = th.stair;
  ctx.fillStyle = th.furnitureFill;
  ctx.lineWidth = lw * 1.5;
  poly(ctx, lay.outline);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = lw;
  for (const tr of lay.treads) { poly(ctx, tr.pts); ctx.stroke(); }
  for (const ld of lay.landings) { poly(ctx, ld.pts); ctx.stroke(); }
  poly(ctx, lay.walk, false);
  ctx.stroke();
  ctx.fillStyle = th.stair;
  const n = lay.walk.length;
  arrowHead(ctx, lay.walk[n - 2], lay.walk[n - 1], 160);
  ctx.beginPath();
  ctx.arc(...lay.walk[0], 45, 0, Math.PI * 2);
  ctx.fill();
  const [tx, ty] = lay.walk[0];
  label(ctx, (o && o.upLabel) || "UP", tx, ty - 220, 170, { color: th.stair, px: o.px, minPx: 8, bold: true });
}

// Selection / hover outlines.
export function highlightElements(ctx, p, ids, on, walls) {
  for (const k of PTS_KINDS) {
    for (const it of k === "shafts" ? (p.shafts || []).filter((s) => ids.has(s.id)) : on(p[k] || [])) {
      if (!ids.has(it.id)) continue;
      if (k === "ramps") poly(ctx, rampModel(p, it).outline);
      else poly(ctx, it.pts, !OPEN_PATH_KINDS.includes(k));
      ctx.stroke();
    }
  }
  for (const b of on(p.beams || [])) if (ids.has(b.id)) { poly(ctx, beamOutline(b)); ctx.stroke(); }
  for (const w of walls) {
    if (!ids.has(w.id) || !isCurtainWall(p, w)) continue;
    const t = w.thickness / 2 + 20, L = wallLength(w);
    poly(ctx, [wallPoint(w, 0, -t), wallPoint(w, L, -t), wallPoint(w, L, t), wallPoint(w, 0, t)]);
    ctx.stroke();
  }
}

// Points to include in the plan extent.
export function elementBoundsPoints(p, level) {
  const out = [];
  const on = (l) => level === null || l === level;
  for (const k of PTS_KINDS) for (const it of p[k] || []) if (on(it.level)) out.push(...it.pts);
  for (const b of p.beams || []) if (on(b.level)) out.push([b.x1, b.y1], [b.x2, b.y2]);
  for (const s of p.stairs || []) if (s.shape && on(s.level)) out.push(...stairLayout(s, 3000).outline);
  return out;
}

// Outline of a stair of any shape (render.js stairGeometry uses it for L/U/spiral).
export const shapedStairOutline = (s) => stairLayout(s, 3000).outline;

// ---------------------------------------------------------------- hit testing
const onLevel = (list, level) => list.filter((it) => it.level === level && !optionHidden(it));

// Corner / end handles of the selected elements → {kind, obj, handle} or null.
export function hitElementHandles(p, level, x, y, tol, selected) {
  for (const k of PTS_KINDS) {
    for (const it of onLevel(p[k] || [], level)) {
      if (!selected.has(it.id)) continue;
      const i = it.pts.findIndex(([px, py]) => dist(x, y, px, py) <= tol * 1.5);
      if (i >= 0) return { kind: k, obj: it, handle: i };
    }
  }
  for (const b of onLevel(p.beams || [], level)) {
    if (!selected.has(b.id)) continue;
    if (dist(x, y, b.x1, b.y1) <= tol * 1.5) return { kind: "beams", obj: b, handle: 0 };
    if (dist(x, y, b.x2, b.y2) <= tol * 1.5) return { kind: "beams", obj: b, handle: 1 };
  }
  return null;
}

const nearPath = (x, y, pts, tol, closed) => {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) if (pointSegDist(x, y, ...pts[i], ...pts[(i + 1) % pts.length]) <= tol) return true;
  return false;
};

// Elements above the walls in the pick order: beams, railings, ramps, shafts,
// then the edges of slabs and ceilings.
export function hitElements(p, level, x, y, tol) {
  for (const b of onLevel(p.beams || [], level).reverse()) if (pointSegDist(x, y, b.x1, b.y1, b.x2, b.y2) <= b.w / 2 + tol) return { kind: "beams", obj: b };
  for (const r of onLevel(p.railings || [], level).reverse()) if (nearPath(x, y, r.pts, tol * 1.6, false)) return { kind: "railings", obj: r };
  for (const r of onLevel(p.ramps || [], level).reverse()) if (pointInPolygon(x, y, rampModel(p, r).outline)) return { kind: "ramps", obj: r };
  for (const s of shaftsAt(p, level)) if (!optionHidden(s) && pointInPolygon(x, y, s.pts)) return { kind: "shafts", obj: s };
  for (const c of onLevel(p.ceilings || [], level).reverse()) if (nearPath(x, y, c.pts, tol * 1.5, true)) return { kind: "ceilings", obj: c };
  for (const s of onLevel(p.slabs || [], level).reverse()) if (nearPath(x, y, s.pts, tol * 1.5, true)) return { kind: "slabs", obj: s };
  return null;
}

// Inside a slab (after rooms: clicking a room picks the room).
export function hitElementAreas(p, level, x, y) {
  const slabs = onLevel(p.slabs || [], level).filter((s) => pointInPolygon(x, y, s.pts));
  if (slabs.length) { slabs.sort((a, b) => Math.abs(polygonArea(a.pts)) - Math.abs(polygonArea(b.pts))); return { kind: "slabs", obj: slabs[0] }; }
  const ceil = onLevel(p.ceilings || [], level).filter((c) => pointInPolygon(x, y, c.pts));
  if (ceil.length) return { kind: "ceilings", obj: ceil[0] };
  return null;
}

// Box selection (window: fully inside; crossing: touching).
export function boxSelectElements(p, level, test) {
  const ids = [];
  for (const k of PTS_KINDS) for (const it of onLevel(p[k] || [], level)) if (test(it.pts)) ids.push(it.id);
  for (const b of onLevel(p.beams || [], level)) if (test([[b.x1, b.y1], [b.x2, b.y2]])) ids.push(b.id);
  return ids;
}

// ---------------------------------------------------------------- transforms
export function transformElements(p, set, fn, { mirror = false } = {}) {
  for (const k of PTS_KINDS) {
    for (const it of p[k] || []) {
      if (!set.has(it.id)) continue;
      it.pts = it.pts.map(([x, y]) => fn(x, y));
      if (it.holes) it.holes = it.holes.map((h) => h.map(([x, y]) => fn(x, y)));
      if (mirror && !OPEN_PATH_KINDS.includes(k)) { it.pts.reverse(); if (it.holes) it.holes.forEach((h) => h.reverse()); }
    }
  }
  for (const b of p.beams || []) if (set.has(b.id)) { [b.x1, b.y1] = fn(b.x1, b.y1); [b.x2, b.y2] = fn(b.x2, b.y2); }
  // A sloped slab's direction turns with it.
  for (const s of p.slabs || []) {
    if (!set.has(s.id) || !(s.slope > 0)) continue;
    const a = ((s.slopeDir || 0) * Math.PI) / 180;
    const o = fn(0, 0), d = fn(Math.cos(a) * 1000, Math.sin(a) * 1000);
    s.slopeDir = Math.round(((Math.atan2(d[1] - o[1], d[0] - o[0]) * 180) / Math.PI) * 1000) / 1000;
  }
}

export function elementCentrePoints(p, set) {
  const pts = [];
  for (const k of PTS_KINDS) for (const it of p[k] || []) if (set.has(it.id)) pts.push(...it.pts);
  for (const b of p.beams || []) if (set.has(b.id)) pts.push([b.x1, b.y1], [b.x2, b.y2]);
  return pts;
}

export function scaleElements(p, set, k) {
  for (const b of p.beams || []) if (set.has(b.id)) { b.w *= k; b.h *= k; }
  for (const r of p.ramps || []) if (set.has(r.id)) r.width *= k;
}

// Shift pasted copies (pasteItems moves pts and x/y; holes and beams here).
export function shiftElement(kind, it, dx, dy) {
  if (it.holes) it.holes = it.holes.map((h) => h.map(([a, b]) => [a + dx, b + dy]));
  if (kind === "beams") { it.x1 += dx; it.y1 += dy; it.x2 += dx; it.y2 += dy; }
}

// Drag a handle of an element (vertex index or beam end) to (x, y).
export function dragElementHandle(kind, obj, handle, x, y) {
  if (PTS_KINDS.includes(kind)) { obj.pts[handle] = [x, y]; return true; }
  if (kind === "beams") { if (handle) { obj.x2 = x; obj.y2 = y; } else { obj.x1 = x; obj.y1 = y; } return true; }
  return false;
}

// Handle positions of a selected element (the editor draws them).
export function elementHandles(kind, obj) {
  if (PTS_KINDS.includes(kind)) return obj.pts;
  if (kind === "beams") return [[obj.x1, obj.y1], [obj.x2, obj.y2]];
  return [];
}

export { levelById, rotPt, wallFrame, slabArea, offsetPath };
