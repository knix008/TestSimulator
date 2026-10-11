// Annotations placed in a view (Revit "Annotate" / ArchiCAD documentation
// tools). Each annotation belongs to one view and lives in that view's 2D
// frame (plan millimetres for floor and ceiling plans, view millimetres for
// sections and elevations, paper millimetres for sheets). Text sizes and
// symbol sizes are paper millimetres times the view scale, so annotations
// print at the same size at every scale.
//
// kinds:
//   dim     aligned dimension      pts [a, b], offset
//   dimlin  linear (horizontal / vertical) pts [a, b], axis "x"|"y", offset
//   chain   chained dimension      pts [p1 … pn], angle (deg), offset
//   angle   angular dimension      c, a, b (points), r
//   radius  radial / diameter      c, p, diameter?
//   arclen  arc length             c, a, b
//   spot    spot elevation         x, y, dx, dy (reads the height)
//   note    text with leader       x, y, text, leader [[x, y] …]
//   tag     parametric tag         target (element id), dx, dy, template?, leader
//   keynote keynote                x, y, key, text, leader
//   symbol  north arrow, arrow, break line, centre mark …   x, y, rot, sym
//   cloud   revision cloud         pts, rev
//   region  filled region          pts, pattern, color, border
//   mask    masking region         pts
//   line    detail line            pts, style (line style id)

import { applyLineStyle, drawRegionFill, polyPath } from "./hatch.js";
import { openingTags, wallLength, levelById, wallTypeOf, findItem } from "../core/project.js";
import { roomArea, roomPerimeter, roomLabelPoint } from "../core/rooms.js";
import { wallPoint } from "../core/walls.js";
import { furnitureDef } from "../lib/furniture.js";
import { materialById } from "../lib/materials.js";
import { fmtLen } from "../core/geom.js";
import { displayName } from "./names.js";

export const TEXT = 2.5; // paper mm
export const ANNOTATION_TOOLS = ["dim", "dimlin", "chain", "angle", "radius", "arclen", "spot", "note", "tag", "keynote", "symbol", "cloud", "region", "mask", "line"];
export const SYMBOLS = ["north", "arrow", "break", "centre", "cross"];

// ---------------------------------------------------------------- parameters
export const DEFAULT_TAG = { rooms: "{name}\n{area}", openings: "{mark}", walls: "{type}", furniture: "{name}", columns: "{mark}", stairs: "{name}", roofs: "{name}", solids: "{name}" };

export function elementParams(p, kind, obj) {
  const lv = levelById(p, kind === "openings" ? (p.walls.find((w) => w.id === obj.wall) || {}).level : obj.level);
  const out = { id: obj.id, kind, level: lv ? lv.name : "", name: obj.name || "", mark: obj.mark || obj.tag || (obj.props && obj.props.mark) || "", material: obj.material ? (materialById(obj.material) || {}).name || obj.material : "", phase: obj.phase || "" };
  if (kind === "rooms") {
    out.area = `${(roomArea(obj) / 1e6).toFixed(2)} m²`;
    out.areaValue = roomArea(obj) / 1e6;
    out.perimeter = `${(roomPerimeter(obj) / 1000).toFixed(2)} m`;
    out.number = obj.number || (obj.props && obj.props.number) || "";
    out.floor = obj.floor || "";
  } else if (kind === "openings") {
    out.mark = openingTags(p).get(obj.id) || out.mark;
    out.width = String(obj.width);
    out.height = String(obj.height);
    out.sill = String(obj.sill);
    out.type = obj.type || "";
    out.size = `${obj.width}×${obj.height}`;
  } else if (kind === "walls") {
    const wt = wallTypeOf(p, obj);
    out.type = wt ? wt.name : `${Math.round(obj.thickness)} mm`;
    out.thickness = String(Math.round(obj.thickness));
    out.length = fmtLen(wallLength(obj));
    out.height = String(obj.height || (lv ? lv.height : ""));
  } else if (kind === "furniture") {
    const def = furnitureDef(obj.kind);
    out.name = obj.name || (def ? def.name : obj.kind);
    out.width = String(obj.w); out.depth = String(obj.d); out.height = String(obj.h);
    out.price = obj.props && obj.props.price ? String(obj.props.price) : "";
  } else if (kind === "columns") {
    out.size = `${obj.w}×${obj.d}`;
    out.mark = out.mark || obj.id.slice(-3).toUpperCase();
  } else if (kind === "stairs") {
    out.name = out.name || `${obj.steps} R`;
    out.steps = String(obj.steps);
  }
  for (const [k, v] of Object.entries(obj.props || {})) if (out[k] === undefined || out[k] === "") out[k] = String(v);
  return out;
}

// Fill "{name} {area} {props.x}" from the element; unknown fields are blank.
export function formatTemplate(tpl, params) {
  return String(tpl).replace(/\{([\w.]+)\}/g, (_, k) => {
    const key = k.startsWith("props.") ? k.slice(6) : k;
    const v = params[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function tagText(p, a) {
  const it = findItem(p, a.target);
  if (!it) return "?";
  return formatTemplate(a.template || DEFAULT_TAG[it.kind] || "{name}", elementParams(p, it.kind, it.obj)).trim() || "—";
}

// Where a tag points in a plan (element anchor).
export function planAnchor(p, id) {
  const it = findItem(p, id);
  if (!it) return null;
  const o = it.obj;
  if (it.kind === "rooms") return o.label || roomLabelPoint(o);
  if (it.kind === "openings") { const w = p.walls.find((x) => x.id === o.wall); return w ? wallPoint(w, o.at, 0) : null; }
  if (it.kind === "walls") return [(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2];
  if (Array.isArray(o.pts) && o.pts.length) { const n = o.pts.length; return [o.pts.reduce((s, q) => s + q[0], 0) / n, o.pts.reduce((s, q) => s + q[1], 0) / n]; }
  if (Number.isFinite(o.x) && Number.isFinite(o.y)) return [o.x, o.y];
  if (Number.isFinite(o.x1)) return [(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2];
  return null;
}

// ---------------------------------------------------------------- geometry helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const nrm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };

function text(ctx, s, x, y, size, { align = "center", baseline = "middle", rot = 0, color, bold = false, halo = null } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.font = `${bold ? "bold " : ""}${size}px "Segoe UI", "Malgun Gothic", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (halo && ctx.strokeText) { ctx.lineWidth = size * 0.25; ctx.strokeStyle = halo; ctx.lineJoin = "round"; ctx.strokeText(s, 0, 0); }
  ctx.fillStyle = color;
  const lines = String(s).split("\n");
  lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * size * 1.25));
  ctx.restore();
}

// Upright angle for a text along direction d.
function readable(d) {
  let a = Math.atan2(d[1], d[0]);
  if (a > Math.PI / 2 + 1e-3) a -= Math.PI;
  if (a < -Math.PI / 2 - 1e-3) a += Math.PI;
  return a;
}

function tick(ctx, q, d, n, k) {
  ctx.moveTo(q[0] - (d[0] + n[0]) * k, q[1] - (d[1] + n[1]) * k);
  ctx.lineTo(q[0] + (d[0] + n[0]) * k, q[1] + (d[1] + n[1]) * k);
}

function arrowHead(ctx, tip, from, size) {
  const d = nrm(sub(tip, from));
  const n = [-d[1], d[0]];
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - d[0] * size + n[0] * size * 0.35, tip[1] - d[1] * size + n[1] * size * 0.35);
  ctx.lineTo(tip[0] - d[0] * size - n[0] * size * 0.35, tip[1] - d[1] * size - n[1] * size * 0.35);
  ctx.closePath();
  ctx.fill();
}

// A linear dimension string between projected points on a line through
// `base` with direction d, offset along n.
function dimString(ctx, pts, d, n, offset, o, labels) {
  const S = o.scale;
  const order = pts.map((q, i) => [q[0] * d[0] + q[1] * d[1], i]).sort((a, b) => a[0] - b[0]);
  const ns = pts.map((q) => q[0] * n[0] + q[1] * n[1]);
  const N = (offset >= 0 ? Math.max(...ns) : Math.min(...ns)) + offset;
  const P = (t) => [d[0] * t + n[0] * N, d[1] * t + n[1] * N];
  const t0 = order[0][0], t1 = order[order.length - 1][0];
  ctx.beginPath();
  ctx.moveTo(...P(t0 - 2 * S)); ctx.lineTo(...P(t1 + 2 * S));
  for (const [t, i] of order) {
    const q = pts[i];
    const s = Math.sign(N - ns[i]) || 1;
    ctx.moveTo(q[0] + n[0] * s * S, q[1] + n[1] * s * S);
    const e = P(t);
    ctx.lineTo(e[0] + n[0] * s * 1.5 * S, e[1] + n[1] * s * 1.5 * S);
  }
  ctx.stroke();
  ctx.save();
  ctx.lineWidth *= 2;
  ctx.beginPath();
  for (const [t] of order) tick(ctx, P(t), d, n, 1.1 * S);
  ctx.stroke();
  ctx.restore();
  const rot = readable(d);
  const up = [Math.sin(rot), -Math.cos(rot)];
  for (let k = 0; k + 1 < order.length; k++) {
    const a = order[k][0], b = order[k + 1][0];
    if (b - a < 1e-6) continue;
    const mid = P((a + b) / 2);
    text(ctx, labels ? labels[k] : fmtDim(b - a, o.units), mid[0] + up[0] * TEXT * 0.75 * S, mid[1] + up[1] * TEXT * 0.75 * S, TEXT * S, { rot, color: ctx.strokeStyle, halo: o.halo });
  }
  return { N };
}

export function fmtDim(mm, units = "mm") {
  if (units === "m") return (mm / 1000).toFixed(3);
  if (units === "cm") return (mm / 10).toFixed(1);
  if (units === "ft") return fmtLen(mm, "ft");
  return String(Math.round(mm));
}

// Elevation text "+3.000" / "±0.000" (metres).
export function fmtElevation(mm) {
  const v = Math.round(mm) / 1000;
  if (Math.abs(v) < 0.0005) return "±0.000";
  return `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}`;
}

// Revision cloud: arcs bulging outwards along each edge.
function cloudPath(ctx, pts, r) {
  ctx.beginPath();
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const outward = area > 0 ? 1 : -1;
  let first = true;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = len(sub(b, a));
    const n = Math.max(1, Math.round(L / (r * 2)));
    for (let k = 0; k < n; k++) {
      const p0 = [a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)];
      const p1 = [a[0] + (b[0] - a[0]) * ((k + 1) / n), a[1] + (b[1] - a[1]) * ((k + 1) / n)];
      const c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      const rr = L / n / 2;
      const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
      if (first) { ctx.moveTo(p0[0], p0[1]); first = false; }
      // Half circle on the outer side.
      const steps = 8;
      for (let s = 1; s <= steps; s++) {
        const t = a0 + (outward * Math.PI * s) / steps;
        ctx.lineTo(c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr);
      }
    }
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- drawing
// o: {scale, ink, units, selected: Set, select (colour), halo, mono, p,
//     anchorOf(id) → [x, y] | null, spot(x, y) → mm elevation, print}
export function drawAnnotation(ctx, a, o) {
  const S = o.scale || 100;
  const ink = o.selected && o.selected.has(a.id) ? o.select || "#1a73e8" : a.color && !o.mono ? a.color : o.ink;
  const thin = Math.max(0.18 * S, o.minLw || 0);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = thin;
  ctx.setLineDash([]);
  ctx.lineJoin = "round";
  const k = a.kind;
  if ((k === "dim" || k === "dimlin" || k === "chain") && a.pts && a.pts.length >= 2) {
    let d;
    if (k === "dim") d = nrm(sub(a.pts[1], a.pts[0]));
    else if (k === "dimlin") d = a.axis === "y" ? [0, 1] : [1, 0];
    else d = [Math.cos(((a.angle || 0) * Math.PI) / 180), Math.sin(((a.angle || 0) * Math.PI) / 180)];
    const n = [-d[1], d[0]];
    dimString(ctx, a.pts, d, n, a.offset ?? 6 * S, o);
  } else if (k === "angle" && a.c && a.a && a.b) {
    const r = a.r || 15 * S;
    const a0 = Math.atan2(a.a[1] - a.c[1], a.a[0] - a.c[0]);
    let a1 = Math.atan2(a.b[1] - a.c[1], a.b[0] - a.c[0]);
    let sw = a1 - a0;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    while (sw < -Math.PI) sw += 2 * Math.PI;
    a1 = a0 + sw;
    ctx.beginPath();
    ctx.moveTo(a.c[0], a.c[1]); ctx.lineTo(a.c[0] + Math.cos(a0) * r * 1.1, a.c[1] + Math.sin(a0) * r * 1.1);
    ctx.moveTo(a.c[0], a.c[1]); ctx.lineTo(a.c[0] + Math.cos(a1) * r * 1.1, a.c[1] + Math.sin(a1) * r * 1.1);
    ctx.moveTo(a.c[0] + Math.cos(a0) * r, a.c[1] + Math.sin(a0) * r);
    ctx.arc(a.c[0], a.c[1], r, a0, a1, sw < 0);
    ctx.stroke();
    for (const ang of [a0, a1]) {
      const tip = [a.c[0] + Math.cos(ang) * r, a.c[1] + Math.sin(ang) * r];
      const dir = ang === a0 ? 1 : -1;
      const tg = [-Math.sin(ang) * dir * Math.sign(sw), Math.cos(ang) * dir * Math.sign(sw)];
      arrowHead(ctx, tip, [tip[0] + tg[0] * 2 * S, tip[1] + tg[1] * 2 * S], 2 * S);
    }
    const mid = a0 + sw / 2;
    text(ctx, `${Math.abs((sw * 180) / Math.PI).toFixed(1)}°`, a.c[0] + Math.cos(mid) * (r + 3 * S), a.c[1] + Math.sin(mid) * (r + 3 * S), TEXT * S, { color: ink, halo: o.halo });
  } else if (k === "radius" && a.c && a.p) {
    const R = len(sub(a.p, a.c));
    const d = nrm(sub(a.p, a.c));
    const from = a.diameter ? [a.c[0] - d[0] * R, a.c[1] - d[1] * R] : a.c;
    ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...a.p); ctx.stroke();
    arrowHead(ctx, a.p, a.c, 2.2 * S);
    if (a.diameter) arrowHead(ctx, from, a.c, 2.2 * S);
    const lab = a.diameter ? `Ø ${fmtDim(2 * R, o.units)}` : `R ${fmtDim(R, o.units)}`;
    const m = [(from[0] + a.p[0]) / 2, (from[1] + a.p[1]) / 2];
    const rot = readable(d);
    text(ctx, lab, m[0] + Math.sin(rot) * TEXT * 0.8 * S, m[1] - Math.cos(rot) * TEXT * 0.8 * S, TEXT * S, { rot, color: ink, halo: o.halo });
  } else if (k === "arclen" && a.c && a.a && a.b) {
    const R = len(sub(a.a, a.c));
    const a0 = Math.atan2(a.a[1] - a.c[1], a.a[0] - a.c[0]);
    let sw = Math.atan2(a.b[1] - a.c[1], a.b[0] - a.c[0]) - a0;
    while (sw > Math.PI) sw -= 2 * Math.PI;
    while (sw < -Math.PI) sw += 2 * Math.PI;
    const r = R + (a.offset ?? 6 * S);
    ctx.beginPath();
    ctx.moveTo(a.c[0] + Math.cos(a0) * r, a.c[1] + Math.sin(a0) * r);
    ctx.arc(a.c[0], a.c[1], r, a0, a0 + sw, sw < 0);
    for (const ang of [a0, a0 + sw]) { ctx.moveTo(a.c[0] + Math.cos(ang) * (R + S), a.c[1] + Math.sin(ang) * (R + S)); ctx.lineTo(a.c[0] + Math.cos(ang) * (r + 2 * S), a.c[1] + Math.sin(ang) * (r + 2 * S)); }
    ctx.stroke();
    const mid = a0 + sw / 2;
    text(ctx, `⌒ ${fmtDim(Math.abs(sw) * R, o.units)}`, a.c[0] + Math.cos(mid) * (r + 3 * S), a.c[1] + Math.sin(mid) * (r + 3 * S), TEXT * S, { color: ink, halo: o.halo });
  } else if (k === "spot") {
    const z = o.spot ? o.spot(a.x, a.y, a) : 0;
    const tx = a.x + (a.dx ?? 8 * S), ty = a.y + (a.dy ?? -6 * S);
    ctx.beginPath();
    // Triangle marker on the point, leader to the text.
    ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 1.5 * S, a.y - 2.5 * S); ctx.lineTo(a.x + 1.5 * S, a.y - 2.5 * S); ctx.closePath();
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 2.5 * S); ctx.lineTo(tx, ty); ctx.lineTo(tx + 14 * S, ty); ctx.stroke();
    text(ctx, fmtElevation(z), tx + 7 * S, ty - TEXT * 0.7 * S, TEXT * S, { color: ink, halo: o.halo });
  } else if (k === "note" || k === "keynote") {
    const s = k === "keynote" ? (a.key || "?") : displayName(a.text || "");
    const size = (a.size || TEXT) * S;
    if (Array.isArray(a.leader) && a.leader.length) {
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      for (const q of a.leader) ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      arrowHead(ctx, a.leader[a.leader.length - 1], a.leader.length > 1 ? a.leader[a.leader.length - 2] : [a.x, a.y], 2 * S);
    }
    if (k === "keynote") {
      const w = Math.max(6, s.length * 0.65 * TEXT) * S;
      ctx.strokeRect(a.x - w / 2, a.y - 2.2 * S, w, 4.4 * S);
      text(ctx, s, a.x, a.y, TEXT * S, { color: ink, bold: true });
      if (a.text && a.showText) text(ctx, a.text, a.x + w / 2 + S, a.y, TEXT * 0.85 * S, { align: "left", color: ink });
    } else text(ctx, s, a.x, a.y, size, { align: a.align || "left", color: ink, halo: o.halo });
  } else if (k === "tag") {
    const anchor = o.anchorOf ? o.anchorOf(a.target) : null;
    const s = o.p ? tagText(o.p, a) : "?";
    const base = anchor || [a.x || 0, a.y || 0];
    const pos = [base[0] + (a.dx || 0), base[1] + (a.dy || 0)];
    const lines = s.split("\n");
    const w = Math.max(...lines.map((l) => l.length)) * TEXT * 0.62 * S + 2 * S;
    const hgt = lines.length * TEXT * 1.25 * S + 1.2 * S;
    if (a.leader && anchor && Math.hypot(a.dx || 0, a.dy || 0) > 3 * S) { ctx.beginPath(); ctx.moveTo(pos[0], pos[1] + (a.dy > 0 ? -hgt / 2 : hgt / 2)); ctx.lineTo(anchor[0], anchor[1]); ctx.stroke(); arrowHead(ctx, anchor, pos, 1.8 * S); }
    ctx.save();
    if (!o.print) { ctx.fillStyle = o.bg || "#ffffff"; ctx.globalAlpha = 0.85; ctx.fillRect(pos[0] - w / 2, pos[1] - hgt / 2, w, hgt); ctx.globalAlpha = 1; }
    else { ctx.fillStyle = "#ffffff"; ctx.fillRect(pos[0] - w / 2, pos[1] - hgt / 2, w, hgt); }
    ctx.restore();
    const it = o.p ? findItem(o.p, a.target) : null;
    ctx.beginPath();
    if (it && it.kind === "openings") { // door/window tags: hexagon-ish rounded box
      ctx.moveTo(pos[0] - w / 2, pos[1]); ctx.lineTo(pos[0] - w / 2 + hgt / 2, pos[1] - hgt / 2); ctx.lineTo(pos[0] + w / 2 - hgt / 2, pos[1] - hgt / 2); ctx.lineTo(pos[0] + w / 2, pos[1]); ctx.lineTo(pos[0] + w / 2 - hgt / 2, pos[1] + hgt / 2); ctx.lineTo(pos[0] - w / 2 + hgt / 2, pos[1] + hgt / 2); ctx.closePath();
    } else if (it && it.kind !== "rooms") ctx.rect(pos[0] - w / 2, pos[1] - hgt / 2, w, hgt);
    ctx.stroke();
    text(ctx, s, pos[0], pos[1], TEXT * S, { color: ink, bold: it && it.kind === "rooms" });
  } else if (k === "symbol") {
    const sz = (a.size || 10) * S;
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.rot) ctx.rotate((a.rot * Math.PI) / 180);
    ctx.beginPath();
    if (a.sym === "north") {
      ctx.arc(0, 0, sz / 2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -sz / 2); ctx.lineTo(sz * 0.18, sz * 0.3); ctx.lineTo(0, sz * 0.15); ctx.lineTo(-sz * 0.18, sz * 0.3); ctx.closePath(); ctx.fill();
      text(ctx, "N", 0, -sz * 0.68, TEXT * 1.2 * S, { color: ink, bold: true });
    } else if (a.sym === "arrow") {
      ctx.moveTo(-sz / 2, 0); ctx.lineTo(sz / 2, 0); ctx.stroke(); arrowHead(ctx, [sz / 2, 0], [-sz / 2, 0], sz * 0.3);
    } else if (a.sym === "break") {
      ctx.moveTo(-sz, 0); ctx.lineTo(-sz * 0.15, 0); ctx.lineTo(-sz * 0.05, -sz * 0.3); ctx.lineTo(sz * 0.05, sz * 0.3); ctx.lineTo(sz * 0.15, 0); ctx.lineTo(sz, 0); ctx.stroke();
    } else if (a.sym === "centre") {
      ctx.setLineDash([3 * S, S, 0.6 * S, S]);
      ctx.moveTo(-sz / 2, 0); ctx.lineTo(sz / 2, 0); ctx.moveTo(0, -sz / 2); ctx.lineTo(0, sz / 2); ctx.stroke();
    } else {
      ctx.moveTo(-sz / 2, -sz / 2); ctx.lineTo(sz / 2, sz / 2); ctx.moveTo(sz / 2, -sz / 2); ctx.lineTo(-sz / 2, sz / 2); ctx.stroke();
    }
    ctx.restore();
  } else if (k === "cloud" && a.pts && a.pts.length >= 2) {
    ctx.lineWidth = Math.max(0.35 * S, o.minLw || 0);
    if (!o.mono && !(o.selected && o.selected.has(a.id))) ctx.strokeStyle = "#d32f2f";
    cloudPath(ctx, a.pts, 3 * S);
    ctx.stroke();
    if (a.rev && o.p) {
      const r = (o.p.revisions || []).find((x) => x.id === a.rev);
      if (r) {
        const q = a.pts[0];
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.moveTo(q[0], q[1] - 3 * S); ctx.lineTo(q[0] + 3 * S, q[1] + 2 * S); ctx.lineTo(q[0] - 3 * S, q[1] + 2 * S); ctx.closePath(); ctx.stroke();
        text(ctx, r.name || String(r.seq), q[0], q[1] + 0.4 * S, TEXT * 0.8 * S, { color: ctx.strokeStyle, bold: true });
      }
    }
  } else if ((k === "region" || k === "mask") && a.pts && a.pts.length >= 3) {
    if (k === "mask") { polyPath(ctx, a.pts); ctx.fillStyle = o.bg || "#ffffff"; ctx.fill(); if (o.selected && o.selected.has(a.id)) { ctx.setLineDash([2 * S, S]); ctx.stroke(); } }
    else {
      drawRegionFill(ctx, a.pts, a.pattern || "hatch", o.mono ? "#000000" : a.color, { scale: S, mono: o.mono });
      if (a.border !== "none") { applyLineStyle(ctx, o.p, a.border || "thin", { scale: S, mono: o.mono, minLw: o.minLw }); if (o.selected && o.selected.has(a.id)) ctx.strokeStyle = ink; polyPath(ctx, a.pts); ctx.stroke(); }
    }
  } else if (k === "line" && a.pts && a.pts.length >= 2) {
    applyLineStyle(ctx, o.p, a.style || "medium", { scale: S, mono: o.mono, minLw: o.minLw });
    if (o.selected && o.selected.has(a.id)) ctx.strokeStyle = ink;
    ctx.beginPath();
    a.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    if (a.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawAnnotations(ctx, list, o) {
  // Regions and masks first, then lines, then everything else on top.
  const order = (a) => (a.kind === "mask" || a.kind === "region" ? 0 : a.kind === "line" ? 1 : 2);
  for (const a of list.slice().sort((x, y) => order(x) - order(y))) {
    if (o.hidden && o.hidden.has(categoryOfAnnotation(a))) continue;
    drawAnnotation(ctx, a, o);
  }
}

export function categoryOfAnnotation(a) {
  return { dim: "dimensions", dimlin: "dimensions", chain: "dimensions", angle: "dimensions", radius: "dimensions", arclen: "dimensions", spot: "dimensions", note: "texts", keynote: "tags", tag: "tags", symbol: "symbols", cloud: "clouds", region: "regions", mask: "regions", line: "drawings" }[a.kind] || "texts";
}

// ---------------------------------------------------------------- editing
// Editable points of an annotation: [{get, set}] in view coordinates.
export function handlesOf(a) {
  const H = [];
  const ptRef = (obj, key) => ({ get: () => obj[key], set: (q) => { obj[key] = [q[0], q[1]]; } });
  if (Array.isArray(a.pts)) a.pts.forEach((_, i) => H.push({ get: () => a.pts[i], set: (q) => { a.pts[i] = [q[0], q[1]]; } }));
  for (const key of ["c", "a", "b", "p"]) if (Array.isArray(a[key])) H.push(ptRef(a, key));
  if (Number.isFinite(a.x) && a.kind !== "tag") H.push({ get: () => [a.x, a.y], set: (q) => { a.x = q[0]; a.y = q[1]; } });
  if (Array.isArray(a.leader)) a.leader.forEach((_, i) => H.push({ get: () => a.leader[i], set: (q) => { a.leader[i] = [q[0], q[1]]; } }));
  return H;
}

export function moveAnnotation(a, dx, dy) {
  if (a.kind === "tag") { a.dx = (a.dx || 0) + dx; a.dy = (a.dy || 0) + dy; return; }
  if (Array.isArray(a.pts)) a.pts = a.pts.map((q) => [q[0] + dx, q[1] + dy]);
  for (const key of ["c", "a", "b", "p"]) if (Array.isArray(a[key])) a[key] = [a[key][0] + dx, a[key][1] + dy];
  if (Number.isFinite(a.x)) { a.x += dx; a.y += dy; }
  if (Array.isArray(a.leader)) a.leader = a.leader.map((q) => [q[0] + dx, q[1] + dy]);
}

const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
};

function inside(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// Does (x, y) touch the annotation (tolerance in view units)?
export function hitAnnotation(a, x, y, tol, o = {}) {
  const S = o.scale || 100;
  const P = [x, y];
  const near = (q) => q && Math.hypot(q[0] - x, q[1] - y) <= tol + 2 * S;
  if (Array.isArray(a.pts) && a.pts.length >= 2) {
    for (let i = 0; i + 1 < a.pts.length; i++) if (segDist(P, a.pts[i], a.pts[i + 1]) <= tol) return true;
    if ((a.kind === "region" || a.kind === "mask" || a.kind === "cloud" || a.closed) && (segDist(P, a.pts[a.pts.length - 1], a.pts[0]) <= tol || inside(x, y, a.pts))) return true;
    if (a.kind === "dim" || a.kind === "dimlin" || a.kind === "chain") {
      // The dimension line itself (offset from the points).
      const d = a.kind === "dim" ? nrm(sub(a.pts[1], a.pts[0])) : a.kind === "dimlin" ? (a.axis === "y" ? [0, 1] : [1, 0]) : [Math.cos(((a.angle || 0) * Math.PI) / 180), Math.sin(((a.angle || 0) * Math.PI) / 180)];
      const n = [-d[1], d[0]];
      const off = a.offset ?? 6 * S;
      const N = (off >= 0 ? Math.max(...a.pts.map((q) => q[0] * n[0] + q[1] * n[1])) : Math.min(...a.pts.map((q) => q[0] * n[0] + q[1] * n[1]))) + off;
      const ts = a.pts.map((q) => q[0] * d[0] + q[1] * d[1]);
      const A = [d[0] * Math.min(...ts) + n[0] * N, d[1] * Math.min(...ts) + n[1] * N], B = [d[0] * Math.max(...ts) + n[0] * N, d[1] * Math.max(...ts) + n[1] * N];
      if (segDist(P, A, B) <= tol + TEXT * S) return true;
    }
  }
  for (const key of ["c", "a", "b", "p"]) if (near(a[key])) return true;
  if (a.kind === "radius" && a.c && a.p && segDist(P, a.c, a.p) <= tol) return true;
  if (Number.isFinite(a.x)) {
    if (near([a.x, a.y])) return true;
    if ((a.kind === "note" || a.kind === "keynote") && x >= a.x - tol && x <= a.x + Math.max(8, String(a.text || a.key || "").length * TEXT * 0.62) * S && Math.abs(y - a.y) <= TEXT * S + tol) return true;
    if (a.kind === "spot" && near([a.x + (a.dx ?? 8 * S) + 7 * S, a.y + (a.dy ?? -6 * S)])) return true;
    if (a.kind === "symbol" && Math.hypot(x - a.x, y - a.y) <= (a.size || 10) * S * 0.6) return true;
  }
  if (a.kind === "tag" && o.anchorOf) {
    const base = o.anchorOf(a.target) || [a.x || 0, a.y || 0];
    const pos = [base[0] + (a.dx || 0), base[1] + (a.dy || 0)];
    if (Math.abs(x - pos[0]) <= 6 * S + tol && Math.abs(y - pos[1]) <= 3 * S + tol) return true;
  }
  if (Array.isArray(a.leader)) { let prev = [a.x, a.y]; for (const q of a.leader) { if (segDist(P, prev, q) <= tol) return true; prev = q; } }
  return false;
}
