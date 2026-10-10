// Plan drawing. Everything is drawn in world millimetres through the canvas
// API, so the same code paints the editor, the SVG export (svgctx.js), print
// sheets and thumbnails.
//
// Line weights come from `lw` (one thin line in world units): on screen that is
// one pixel, in print a fraction of a paper millimetre times the scale.
// Walls are drawn as a union: every solid piece is stroked with a double-width
// outline first and filled afterwards, so the fills hide the seams between
// joined walls and only the outer boundary keeps its line.

import { wallOutlines, wallPieces, openingSpans, wallFrame, wallPoint } from "../core/walls.js";
import { wallLength, openingTags, levelById, levelIndex } from "../core/project.js";
import { roomArea, roomLabelPoint } from "../core/rooms.js";
import { roofModel, roofBase } from "../core/roof.js";
import { drawFurniturePlan, drawLightSymbol, furnitureCorners, isLight } from "../lib/furniture.js";
import { materialColor } from "../lib/materials.js";
import { fmtLen, fmtArea, rotPt, labelPoint as labelPointOf } from "../core/geom.js";

export const PLAN_THEMES = {
  dark: {
    bg: "#1b1f27", grid: "#2a303b", gridMajor: "#384050", wall: "#d9dee8", wallFill: "#8b93a3", hatch: "#5d6574", door: "#e8c170", window: "#7fc8f0",
    room: "#e3e6ec", roomLabel: "#e3e6ec", roomArea: "#9aa3b2", dim: "#ffb46b", text: "#e3e6ec", furniture: "#a8b3c4", furnitureFill: "#2a303b",
    stair: "#c3cad6", column: "#9aa2b1", roof: "#d68c5a", drawing: "#9aa4b5", select: "#4f9dff", hover: "#7fb5ff", ghost: "#566072", issue: "#ef5350",
    paper: "#1b1f27", ruler: "#202430",
  },
  light: {
    bg: "#f4f3ef", grid: "#e2e0da", gridMajor: "#cfccc4", wall: "#1e2227", wallFill: "#3c424b", hatch: "#7b828c", door: "#a5641b", window: "#1f77b4",
    room: "#2a2f37", roomLabel: "#1e2227", roomArea: "#5b6370", dim: "#c0571b", text: "#1e2227", furniture: "#4c5562", furnitureFill: "#fbfaf7",
    stair: "#3b424c", column: "#3c424b", roof: "#b5562b", drawing: "#55606e", select: "#1a73e8", hover: "#5a9cf0", ghost: "#b9bcc2", issue: "#d32f2f",
    paper: "#ffffff", ruler: "#e9e7e1",
  },
};

// Text in world units; on screen never smaller than `minPx` pixels.
function text(ctx, s, x, y, size, o = {}) {
  const px = o.px || 0;
  const sz = Math.max(size, (o.minPx || 0) * px);
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate((o.rot * Math.PI) / 180);
  ctx.font = `${o.bold ? "600 " : ""}${sz}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.textAlign = o.align || "center";
  ctx.textBaseline = o.baseline || "middle";
  if (o.halo) {
    ctx.lineWidth = sz * 0.22;
    ctx.strokeStyle = o.halo;
    ctx.lineJoin = "round";
    if (ctx.strokeText) ctx.strokeText(s, 0, 0);
  }
  ctx.fillStyle = o.color || "#000";
  ctx.fillText(s, 0, 0);
  ctx.restore();
  return sz;
}

function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
}

const alpha = (hex, a) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function roomColor(r) {
  return r.color || materialColor(r.floor || "oak", "#c49a6c");
}

// Part of the infinite line through a (direction d) inside a convex polygon.
function lineInPoly(a, d, pts) {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const ex = q[0] - p[0], ey = q[1] - p[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
    const s = ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / den;
    if (s < -1e-6 || s > 1 + 1e-6) continue;
    t0 = Math.min(t0 === -Infinity ? t : t0, t);
    t1 = Math.max(t1 === Infinity ? t : t1, t);
  }
  return Number.isFinite(t0) && Number.isFinite(t1) && t1 - t0 > 1e-6 ? [t0, t1] : null;
}

// Which phases are drawn: "all", "new" (the finished design: no demolition)
// or "existing" (the building before the works: existing + to demolish).
export function phaseVisible(it, filter = "all") {
  const ph = it.phase || "new";
  if (filter === "new") return ph !== "demolish";
  if (filter === "existing") return ph !== "new";
  return true;
}

// ---------------------------------------------------------------- walls
export function drawWalls(ctx, p, walls, th, o) {
  const outlines = wallOutlines(walls, { draw: true });
  const pieces = [];
  for (const w of walls) {
    const ol = outlines.get(w.id);
    if (!ol) continue;
    for (const pc of wallPieces(p, w, ol.poly)) pieces.push({ w, pc });
  }
  const lw = o.lw;
  const style = o.wallStyle || "solid";
  const solid = pieces.filter((x) => x.w.phase !== "demolish");
  // Union outline: wide strokes, then fills on top.
  ctx.lineJoin = "miter";
  ctx.strokeStyle = th.wall;
  ctx.lineWidth = lw * (o.print ? 2.6 : 3);
  for (const { pc } of solid) { poly(ctx, pc); ctx.stroke(); }
  const fill = style === "outline" ? th.bg : style === "hatch" ? th.bg : th.wallFill;
  for (const { w, pc } of solid) {
    poly(ctx, pc);
    ctx.fillStyle = w.phase === "existing" && style === "solid" ? alpha(th.wallFill, 0.45) : fill;
    if (w.phase === "existing" && style === "solid") { ctx.fillStyle = th.bg; ctx.fill(); ctx.fillStyle = alpha(th.wallFill, 0.45); }
    ctx.fill();
  }
  // Walls to demolish: dashed outline only.
  ctx.strokeStyle = th.issue || "#d32f2f";
  ctx.lineWidth = lw * 1.4;
  ctx.setLineDash([lw * 6, lw * 4]);
  for (const { w, pc } of pieces) if (w.phase === "demolish") { poly(ctx, pc); ctx.stroke(); }
  ctx.setLineDash([]);
  // Layered wall types: thin lines between the layers once they are big enough to see.
  if (style !== "outline") {
    ctx.strokeStyle = style === "solid" ? alpha(th.bg, 0.7) : th.hatch;
    ctx.lineWidth = lw * 0.8;
    for (const { w, pc } of solid) {
      const wt = w.type ? (p.wallTypes || []).find((x) => x.id === w.type) : null;
      if (!wt || wt.layers.length < 2 || w.thickness / lw < 18) continue;
      const f = wallFrame(w);
      let v = w.thickness / 2;
      for (let i = 0; i < wt.layers.length - 1; i++) {
        v -= wt.layers[i].thickness;
        const a = wallPoint(w, 0, v);
        const r = lineInPoly(a, f.d, pc);
        if (!r) continue;
        ctx.beginPath();
        ctx.moveTo(a[0] + f.d[0] * r[0], a[1] + f.d[1] * r[0]);
        ctx.lineTo(a[0] + f.d[0] * r[1], a[1] + f.d[1] * r[1]);
        ctx.stroke();
      }
    }
  }
  if (style === "hatch") {
    ctx.save();
    ctx.beginPath();
    for (const { pc } of pieces) pc.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (ctx.clip) ctx.clip("nonzero");
    ctx.strokeStyle = th.hatch;
    ctx.lineWidth = lw;
    const b = o.view || { x1: -1e5, y1: -1e5, x2: 1e5, y2: 1e5 };
    const step = Math.max(60, lw * 6);
    ctx.beginPath();
    for (let k = Math.floor((b.x1 + b.y1) / step) * step; k < b.x2 + b.y2; k += step) { ctx.moveTo(k - b.y1, b.y1); ctx.lineTo(k - b.y2, b.y2); }
    ctx.stroke();
    ctx.restore();
  }
  return { outlines, pieces };
}

// ---------------------------------------------------------------- openings
function drawOpening(ctx, w, s, th, lw, tag, o) {
  const op = s.o;
  const f = wallFrame(w);
  const t = w.thickness / 2;
  const P = (u, v) => wallPoint(w, u, v);
  const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); };
  ctx.lineWidth = lw;
  if (op.kind === "window") {
    ctx.strokeStyle = th.wall;
    // Jambs, both wall faces and a double glass line.
    line(P(s.u1, -t), P(s.u1, t));
    line(P(s.u2, -t), P(s.u2, t));
    line(P(s.u1, t), P(s.u2, t));
    line(P(s.u1, -t), P(s.u2, -t));
    ctx.strokeStyle = th.window;
    ctx.lineWidth = lw * 1.3;
    const g = Math.min(30, t * 0.3);
    line(P(s.u1, g), P(s.u2, g));
    line(P(s.u1, -g), P(s.u2, -g));
    if (op.type === "sliding") { line(P(s.u1, 0), P((s.u1 + s.u2) / 2 + 40, 0)); }
  } else if (op.kind === "opening") {
    ctx.strokeStyle = th.wall;
    ctx.setLineDash([lw * 6, lw * 4]);
    line(P(s.u1, t), P(s.u2, t));
    line(P(s.u1, -t), P(s.u2, -t));
    ctx.setLineDash([]);
  } else {
    ctx.strokeStyle = th.door;
    const side = op.side || 1;
    const face = side * t;
    const width = s.u2 - s.u1;
    const leaf = (hingeU, len, dir) => {
      // dir: +1 when the leaf closes towards +u.
      const hinge = P(hingeU, face);
      const tip = [hinge[0] + f.n[0] * side * len, hinge[1] + f.n[1] * side * len];
      ctx.lineWidth = lw * 2;
      line(hinge, tip);
      ctx.lineWidth = lw;
      // Swing arc from the open tip back to the closed position.
      ctx.beginPath();
      const a0 = Math.atan2(tip[1] - hinge[1], tip[0] - hinge[0]);
      const closed = P(hingeU + dir * len, face);
      const a1 = Math.atan2(closed[1] - hinge[1], closed[0] - hinge[0]);
      let sweep = a1 - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      ctx.setLineDash(o.print ? [] : [lw * 5, lw * 3]);
      ctx.arc(hinge[0], hinge[1], len, a0, a0 + sweep, sweep < 0);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (op.type === "sliding") {
      ctx.lineWidth = lw * 2;
      const half = width / 2;
      line(P(s.u1, 25), P(s.u1 + half + 50, 25));
      line(P(s.u2 - half - 50, -25), P(s.u2, -25));
    } else if (op.type === "garage") {
      ctx.setLineDash([lw * 6, lw * 4]);
      line(P(s.u1, face), P(s.u2, face));
      line(P(s.u1, face + side * 600), P(s.u2, face + side * 600));
      ctx.setLineDash([]);
    } else if (op.type === "double") {
      leaf(s.u1, width / 2, 1);
      leaf(s.u2, width / 2, -1);
    } else if (op.hinge === "end") leaf(s.u2, width, -1);
    else leaf(s.u1, width, 1);
    ctx.strokeStyle = th.wall;
    ctx.lineWidth = lw;
    line(P(s.u1, -t), P(s.u1, t));
    line(P(s.u2, -t), P(s.u2, t));
  }
  if (tag && o.tags) {
    const [x, y] = P((s.u1 + s.u2) / 2, -(op.side || 1) * (t + 220));
    text(ctx, tag, x, y, 160, { color: op.kind === "window" ? th.window : th.door, px: o.px, minPx: 9, bold: true, halo: o.print ? null : th.bg });
  }
}

// ---------------------------------------------------------------- stairs
export function stairGeometry(s) {
  const L = s.length, W = s.width;
  const P = (u, v) => { const [x, y] = rotPt(u, v, s.rot || 0); return [s.x + x, s.y + y]; };
  return { L, W, P, outline: [P(-L / 2, -W / 2), P(L / 2, -W / 2), P(L / 2, W / 2), P(-L / 2, W / 2)] };
}

function drawStair(ctx, s, th, lw, o) {
  const g = stairGeometry(s);
  ctx.strokeStyle = th.stair;
  ctx.lineWidth = lw * 1.5;
  ctx.fillStyle = th.furnitureFill;
  poly(ctx, g.outline);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = lw;
  ctx.beginPath();
  for (let i = 1; i < s.steps; i++) {
    const u = -g.L / 2 + (g.L * i) / s.steps;
    ctx.moveTo(...g.P(u, -g.W / 2));
    ctx.lineTo(...g.P(u, g.W / 2));
  }
  ctx.stroke();
  // Walking line with an arrow towards the top.
  ctx.beginPath();
  ctx.moveTo(...g.P(-g.L / 2 + 150, 0));
  ctx.lineTo(...g.P(g.L / 2 - 80, 0));
  ctx.stroke();
  const a = 160;
  ctx.beginPath();
  ctx.moveTo(...g.P(g.L / 2 - 80, 0));
  ctx.lineTo(...g.P(g.L / 2 - 80 - a, -a * 0.5));
  ctx.lineTo(...g.P(g.L / 2 - 80 - a, a * 0.5));
  ctx.closePath();
  ctx.fillStyle = th.stair;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(...g.P(-g.L / 2 + 150, 0), 45, 0, Math.PI * 2);
  ctx.fill();
  const [tx, ty] = g.P(-g.L / 2 + 420, -g.W / 4);
  text(ctx, o.upLabel || "UP", tx, ty, 170, { color: th.stair, px: o.px, minPx: 8, rot: s.rot || 0, bold: true });
}

// ---------------------------------------------------------------- dimensions
export function dimensionGeometry(d) {
  const L = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1;
  const ux = (d.x2 - d.x1) / L, uy = (d.y2 - d.y1) / L;
  const nx = -uy, ny = ux;
  const off = d.offset || 0;
  return { L, ux, uy, nx, ny, a: [d.x1 + nx * off, d.y1 + ny * off], b: [d.x2 + nx * off, d.y2 + ny * off] };
}

function drawDimension(ctx, d, th, lw, o) {
  const g = dimensionGeometry(d);
  const color = o.color || th.dim;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  const ext = Math.sign(d.offset || 1) * 120;
  ctx.beginPath();
  ctx.moveTo(d.x1 + g.nx * Math.sign(d.offset || 1) * 60, d.y1 + g.ny * Math.sign(d.offset || 1) * 60);
  ctx.lineTo(g.a[0] + g.nx * ext, g.a[1] + g.ny * ext);
  ctx.moveTo(d.x2 + g.nx * Math.sign(d.offset || 1) * 60, d.y2 + g.ny * Math.sign(d.offset || 1) * 60);
  ctx.lineTo(g.b[0] + g.nx * ext, g.b[1] + g.ny * ext);
  ctx.moveTo(g.a[0] - g.ux * 120, g.a[1] - g.uy * 120);
  ctx.lineTo(g.b[0] + g.ux * 120, g.b[1] + g.uy * 120);
  ctx.stroke();
  // Architectural ticks.
  ctx.lineWidth = lw * 2.2;
  ctx.beginPath();
  for (const q of [g.a, g.b]) {
    const k = 90;
    ctx.moveTo(q[0] - (g.ux + g.nx) * k, q[1] - (g.uy + g.ny) * k);
    ctx.lineTo(q[0] + (g.ux + g.nx) * k, q[1] + (g.uy + g.ny) * k);
  }
  ctx.stroke();
  let ang = (Math.atan2(g.uy, g.ux) * 180) / Math.PI;
  if (ang > 90.5 || ang < -89.5) ang += 180;
  const mid = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
  const label = d.label || fmtLen(g.L, o.units === "ft" ? "ft" : o.units === "m" ? "m" : "mm").replace(" mm", "");
  // Text sits on the outer side of the dimension line.
  const tz = 180;
  const k = tz * 0.75 * Math.sign(d.offset || 1);
  text(ctx, label, mid[0] + g.nx * k, mid[1] + g.ny * k, tz, { color, px: o.px, minPx: 9, rot: ang, halo: o.print ? null : th.bg });
}

// ---------------------------------------------------------------- structural grid
export function gridBubble(g, end) {
  const L = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
  const ux = (g.x2 - g.x1) / L, uy = (g.y2 - g.y1) / L;
  const r = 380;
  return end ? [g.x2 + ux * r, g.y2 + uy * r, r] : [g.x1 - ux * r, g.y1 - uy * r, r];
}

function drawGrids(ctx, p, th, lw, o) {
  const color = th.gridLine || "#5b8fd6";
  for (const g of p.grids || []) {
    ctx.strokeStyle = (o.selected && o.selected.has(g.id)) ? th.select : color;
    ctx.lineWidth = lw * 1.2;
    ctx.setLineDash([lw * 18, lw * 4, lw * 3, lw * 4]);
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const end of [0, 1]) {
      const [cx, cy, r] = gridBubble(g, end);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = th.bg;
      ctx.fill();
      ctx.stroke();
      text(ctx, g.label || "", cx, cy, r * 0.95, { color: ctx.strokeStyle, bold: true, px: o.px, minPx: 0 });
    }
  }
}

// ---------------------------------------------------------------- whole plan
// opts: level, lw, px, print, selected:Set, hover, show:{...}, wallStyle,
// units, images:Map(id→img), models:Map(id→asset), issues, labels:{up}
export function drawPlan(ctx, p, th, opts) {
  const o = { show: {}, ...opts };
  const show = { rooms: true, furniture: true, dims: true, texts: true, drawings: true, underlays: true, roofs: true, ghost: true, tags: true, areas: true, columns: true, stairs: true, ...o.show };
  const lw = o.lw;
  const L = o.level;
  const sel = o.selected || new Set();
  const on = (list) => list.filter((it) => it.level === L && phaseVisible(it, o.phase));
  const walls = on(p.walls);
  o.tags = show.tags;
  const openingOk = (op) => phaseVisible(op, o.phase);

  // Underlay images.
  if (show.underlays) {
    for (const u of on(p.underlays)) {
      const img = o.images && o.images.get(u.id);
      if (!img || !img.complete || !ctx.drawImage) continue;
      ctx.save();
      ctx.globalAlpha = u.opacity ?? 0.5;
      ctx.translate(u.x, u.y);
      if (u.rot) ctx.rotate((u.rot * Math.PI) / 180);
      try { ctx.drawImage(img, 0, 0, u.w, u.h); } catch { /* not decoded yet */ }
      ctx.restore();
    }
  }

  // The level below, faintly.
  if (show.ghost) {
    const i = levelIndex(p, L);
    if (i > 0) {
      const below = p.levels[i - 1].id;
      const ol = wallOutlines(p.walls.filter((w) => w.level === below), { draw: true });
      ctx.strokeStyle = th.ghost;
      ctx.lineWidth = lw;
      ctx.setLineDash([lw * 4, lw * 4]);
      for (const { poly: pc } of ol.values()) { poly(ctx, pc); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }

  // Structural grid (the same on every level).
  if (show.grids !== false) drawGrids(ctx, p, th, lw, o);

  // Room floors.
  const rooms = on(p.rooms);
  if (show.rooms) {
    for (const r of rooms) {
      poly(ctx, r.pts);
      ctx.fillStyle = alpha(roomColor(r), o.print ? 0.16 : 0.22);
      ctx.fill();
    }
  }

  // Mass models: tinted footprint, the tapered top dashed, and the height.
  if (show.solids !== false) {
    for (const s of on(p.solids || [])) {
      poly(ctx, s.pts);
      ctx.fillStyle = alpha(materialColor(s.material, "#a7a7a2"), o.print ? 0.25 : 0.35);
      ctx.fill();
      ctx.strokeStyle = th.wall;
      ctx.lineWidth = lw * 1.6;
      ctx.stroke();
      if ((s.taper ?? 1) < 1) {
        const [cx, cy] = s.pts.reduce((a, q) => [a[0] + q[0] / s.pts.length, a[1] + q[1] / s.pts.length], [0, 0]);
        ctx.setLineDash([lw * 4, lw * 3]);
        ctx.lineWidth = lw;
        if (s.taper > 0) { poly(ctx, s.pts.map(([x, y]) => [cx + (x - cx) * s.taper, cy + (y - cy) * s.taper])); ctx.stroke(); }
        ctx.beginPath();
        for (const [x, y] of s.pts) { ctx.moveTo(x, y); ctx.lineTo(cx + (x - cx) * s.taper, cy + (y - cy) * s.taper); }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const [lx, ly] = labelPointOf(s.pts);
      text(ctx, `${s.name ? s.name + "  " : ""}H ${(s.height / 1000).toFixed(2)} m`, lx, ly, 200, { color: th.text, px: o.px, minPx: 9, halo: o.print ? null : alpha(th.bg, 0.7) });
    }
  }

  // CAD drawings (imported DXF / line tool).
  if (show.drawings) {
    const layers = new Map(p.layers.map((l) => [l.id, l]));
    for (const d of on(p.drawings)) {
      const layer = layers.get(d.layer);
      if (layer && layer.visible === false) continue;
      ctx.strokeStyle = d.color || (layer && layer.color) || th.drawing;
      ctx.lineWidth = lw * (d.weight || 1);
      ctx.beginPath();
      if (d.kind === "circle") ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      else if (d.kind === "arc") ctx.arc(d.cx, d.cy, d.r, (d.a1 * Math.PI) / 180, (d.a2 * Math.PI) / 180, !!d.ccw);
      else (d.pts || []).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (d.closed) ctx.closePath();
      ctx.stroke();
    }
  }

  // Furniture, stairs (under the walls so walls stay crisp).
  if (show.furniture) {
    // Lamps last: a ceiling light over a table stays visible, with its on/off symbol.
    const furn = on(p.furniture);
    for (const f of [...furn.filter((x) => !isLight(x)), ...furn.filter(isLight)]) {
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.rot) ctx.rotate((f.rot * Math.PI) / 180);
      if (f.kind === "model") {
        const asset = o.models && o.models.get(f.model);
        const outline = asset && asset.outline && asset.outline.length >= 3 ? asset.outline : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
        poly(ctx, outline.map(([x, y]) => [x * f.w, y * f.d]));
        ctx.fillStyle = th.furnitureFill;
        ctx.fill();
        ctx.strokeStyle = th.furniture;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.setLineDash([lw * 3, lw * 3]);
        ctx.strokeRect(-f.w / 2, -f.d / 2, f.w, f.d);
        ctx.setLineDash([]);
        text(ctx, f.name || (asset && asset.name) || "3D", 0, 0, Math.min(f.w, f.d) * 0.16 + 40, { color: th.furniture, px: o.px, minPx: 0 });
      } else {
        drawFurniturePlan(ctx, f, th, lw);
        if (isLight(f)) drawLightSymbol(ctx, f, th, lw);
      }
      ctx.restore();
    }
  }
  if (show.stairs) for (const s of on(p.stairs)) drawStair(ctx, s, th, lw, { px: o.px, upLabel: o.labels && o.labels.up });

  // Walls and openings.
  const { outlines } = drawWalls(ctx, p, walls, th, { ...o, lw });
  const tags = openingTags(p);
  for (const w of walls) for (const s of openingSpans(p, w)) if (openingOk(s.o)) drawOpening(ctx, w, s, th, lw, tags.get(s.o.id), o);

  // Columns.
  if (show.columns) {
    for (const c of on(p.columns)) {
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.rot) ctx.rotate((c.rot * Math.PI) / 180);
      ctx.beginPath();
      if (c.shape === "round") ctx.ellipse(0, 0, c.w / 2, c.d / 2, 0, 0, Math.PI * 2);
      else ctx.rect(-c.w / 2, -c.d / 2, c.w, c.d);
      ctx.fillStyle = th.column;
      ctx.fill();
      ctx.strokeStyle = th.wall;
      ctx.lineWidth = lw * 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Roofs above, dashed (outline, ridges and hips).
  if (show.roofs) {
    for (const r of on(p.roofs)) {
      const m = roofModel(r, roofBase(p, r));
      ctx.strokeStyle = th.roof;
      ctx.lineWidth = lw * 1.2;
      ctx.setLineDash([lw * 10, lw * 5]);
      poly(ctx, m.outline);
      ctx.stroke();
      ctx.setLineDash([lw * 3, lw * 3]);
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of m.lines) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Room names and areas.
  if (show.rooms) {
    for (const r of rooms) {
      const [x, y] = r.label ? r.label : roomLabelPoint(r);
      const nameSize = r.textSize || 260;
      const s1 = r.name ? text(ctx, r.name, x, y - (show.areas ? nameSize * 0.45 : 0), nameSize, { color: th.roomLabel, bold: true, px: o.px, minPx: 10, halo: o.print ? null : alpha(th.bg, 0.7) }) : 0;
      if (show.areas && r.showArea !== false) text(ctx, fmtArea(roomArea(r), o.units === "ft" ? "ft" : "mm"), x, y + (r.name ? Math.max(s1, nameSize) * 0.6 : 0), nameSize * 0.7, { color: th.roomArea, px: o.px, minPx: 9 });
    }
  }

  if (show.dims) for (const d of on(p.dimensions)) drawDimension(ctx, d, th, lw, { px: o.px, units: o.units, print: o.print, color: sel.has(d.id) ? th.select : null });
  if (show.texts) for (const tx of on(p.texts)) {
    const lines = String(tx.text).split("\n");
    lines.forEach((ln, i) => text(ctx, ln, tx.x, tx.y + i * tx.size * 1.25, tx.size, { color: sel.has(tx.id) ? th.select : tx.color || th.text, align: tx.align || "left", baseline: "top", rot: tx.rot, px: o.px, minPx: 0 }));
  }

  // Selection and hover outlines.
  const hl = (ids, color, width) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw * width;
    for (const w of walls) if (ids.has(w.id)) { const ol = outlines.get(w.id); if (ol) { poly(ctx, ol.poly); ctx.stroke(); } }
    for (const r of rooms) if (ids.has(r.id)) { poly(ctx, r.pts); ctx.stroke(); }
    for (const f of on(p.furniture)) if (ids.has(f.id)) { poly(ctx, furnitureCorners(f)); ctx.stroke(); }
    for (const c of on(p.columns)) if (ids.has(c.id)) { poly(ctx, furnitureCorners({ ...c, h: 0 })); ctx.stroke(); }
    for (const s of on(p.stairs)) if (ids.has(s.id)) { poly(ctx, stairGeometry(s).outline); ctx.stroke(); }
    for (const r of on(p.roofs)) if (ids.has(r.id)) { poly(ctx, r.pts); ctx.stroke(); }
    for (const s of on(p.solids || [])) if (ids.has(s.id)) { poly(ctx, s.pts); ctx.stroke(); }
    for (const u of on(p.underlays)) if (ids.has(u.id)) { ctx.save(); ctx.translate(u.x, u.y); if (u.rot) ctx.rotate((u.rot * Math.PI) / 180); ctx.strokeRect(0, 0, u.w, u.h); ctx.restore(); }
    for (const d of on(p.drawings)) if (ids.has(d.id)) {
      ctx.beginPath();
      if (d.kind === "circle") ctx.arc(d.cx, d.cy, d.r, 0, Math.PI * 2);
      else if (d.kind === "arc") ctx.arc(d.cx, d.cy, d.r, (d.a1 * Math.PI) / 180, (d.a2 * Math.PI) / 180, !!d.ccw);
      else (d.pts || []).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (d.closed) ctx.closePath();
      ctx.stroke();
    }
    for (const w of walls) {
      for (const s of openingSpans(p, w)) {
        if (!ids.has(s.o.id)) continue;
        const t = w.thickness / 2 + 40;
        poly(ctx, [wallPoint(w, s.u1, -t), wallPoint(w, s.u2, -t), wallPoint(w, s.u2, t), wallPoint(w, s.u1, t)]);
        ctx.stroke();
      }
    }
  };
  if (!o.print) {
    if (o.hover && !sel.has(o.hover)) hl(new Set([o.hover]), alpha(th.hover, 0.7), 2);
    if (sel.size) hl(sel, th.select, 2.5);
    for (const is of o.issues || []) {
      if (is.level !== L) continue;
      ctx.strokeStyle = th.issue;
      ctx.lineWidth = lw * 2;
      const r = 14 * o.px;
      ctx.beginPath();
      ctx.arc(is.x, is.y, r, 0, Math.PI * 2);
      ctx.moveTo(is.x - r * 0.5, is.y - r * 0.5); ctx.lineTo(is.x + r * 0.5, is.y + r * 0.5);
      ctx.moveTo(is.x + r * 0.5, is.y - r * 0.5); ctx.lineTo(is.x - r * 0.5, is.y + r * 0.5);
      ctx.stroke();
    }
  }
}

// Extent of everything on a level (or every level) → {x1, y1, x2, y2} or null.
export function planBounds(p, level = null) {
  let b = null;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!b) b = { x1: x, y1: y, x2: x, y2: y };
    else { b.x1 = Math.min(b.x1, x); b.y1 = Math.min(b.y1, y); b.x2 = Math.max(b.x2, x); b.y2 = Math.max(b.y2, y); }
  };
  const on = (l) => level === null || l === level;
  for (const w of p.walls) if (on(w.level)) { const t = w.thickness / 2; add(w.x1 - t, w.y1 - t); add(w.x2 + t, w.y2 + t); add(w.x1 + t, w.y1 + t); add(w.x2 - t, w.y2 - t); }
  for (const r of [...p.rooms, ...p.roofs, ...(p.solids || [])]) if (on(r.level)) for (const [x, y] of r.pts) add(x, y);
  for (const f of [...p.furniture, ...p.columns]) if (on(f.level)) for (const [x, y] of furnitureCorners(f)) add(x, y);
  for (const s of p.stairs) if (on(s.level)) for (const [x, y] of stairGeometry(s).outline) add(x, y);
  for (const d of p.dimensions) if (on(d.level)) { const g = dimensionGeometry(d); add(...g.a); add(...g.b); }
  for (const t of p.texts) if (on(t.level)) add(t.x, t.y);
  for (const d of p.drawings) if (on(d.level)) {
    if (d.kind === "circle" || d.kind === "arc") { add(d.cx - d.r, d.cy - d.r); add(d.cx + d.r, d.cy + d.r); } else for (const [x, y] of d.pts || []) add(x, y);
  }
  for (const u of p.underlays) if (on(u.level)) { add(u.x, u.y); add(u.x + u.w, u.y + u.h); }
  return b;
}

export { levelById, wallLength };
