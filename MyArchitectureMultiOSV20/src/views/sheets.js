// Sheets: a title-block sheet holding viewports of plans, sections,
// elevations, details, 3D views, legends and schedules, each at its view's
// scale, with view titles, the revision table and editable title block
// fields. Drawn in paper millimetres through the canvas API: the sheet
// editor (canvas), printing / PDF / SVG (SvgContext) and DXF use one path.

import { sheetLayout, viewById, detailNumber, sheetRevisions, currentRevision } from "./model.js";
import { viewSpec, drawView, viewExtent, ensureGen, cachedGen, staleGen } from "./viewdraw.js";
import { drawScheduleTable, tableSize } from "./schedules.js";
import { drawAnnotations } from "./annot.js";
import { SvgContext } from "../ui/svgctx.js";
import { PLAN_THEMES } from "../plan/render.js";
import { displayName } from "./names.js";

// The plan palette on paper (same as the print window's).
export function sheetPlanTheme(mono = false) {
  const th = { ...PLAN_THEMES.light, bg: "#ffffff", paper: "#ffffff", furnitureFill: "#ffffff", wallFill: "#2a2e35" };
  if (!mono) return th;
  const out = {};
  for (const [k, v] of Object.entries(th)) out[k] = typeof v === "string" && v.startsWith("#") ? (/^#f/i.test(v) ? "#ffffff" : "#000000") : v;
  out.wallFill = "#3a3a3a";
  return out;
}

const FONT = '"Segoe UI", "Malgun Gothic", sans-serif';

function text(ctx, s, x, y, size, { bold = false, align = "left", color = "#000000", baseline = "alphabetic" } = {}) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(String(s ?? ""), x, y);
}

let clipSeq = 0;
function beginClip(ctx, x, y, w, h) {
  ctx.save();
  if (ctx.parts) {
    const id = `vp-clip-${++clipSeq}`;
    const m = ctx.m;
    ctx.parts.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" transform="matrix(${m.join(" ")})"/></clipPath></defs><g clip-path="url(#${id})">`);
    ctx._clipDepth = (ctx._clipDepth || 0) + 1;
  } else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }
}
function endClip(ctx) {
  if (ctx.parts && ctx._clipDepth) { ctx.parts.push("</g>"); ctx._clipDepth--; }
  ctx.restore();
}

// Where each viewport sits on the sheet (paper mm):
// [{vp, view, spec, ext (view coords), x1, y1, x2, y2, scale}]
export function viewportRects(p, sheet, rev = 0, t = (s) => s) {
  const L = sheetLayout(sheet);
  const out = [];
  for (const vp of sheet.viewports || []) {
    const view = viewById(p, vp.view);
    if (!view) continue;
    if (view.kind === "schedule") {
      const sz = tableSize(p, view, t);
      const cx = vp.fit ? (L.area.x1 + L.area.x2) / 2 : vp.x, cy = vp.fit ? (L.area.y1 + L.area.y2) / 2 : vp.y;
      out.push({ vp, view, schedule: true, x1: cx - sz.w / 2, y1: cy - sz.h / 2, x2: cx + sz.w / 2, y2: cy + sz.h / 2, scale: 1 });
      continue;
    }
    const spec = viewSpec(p, view);
    if (!spec) continue;
    const ext = viewExtent(p, view, null, rev);
    const S = spec.scale;
    const w = (ext.x2 - ext.x1) / S, h = (ext.y2 - ext.y1) / S;
    const cx = vp.fit ? (L.area.x1 + L.area.x2) / 2 : vp.x, cy = vp.fit ? (L.area.y1 + L.area.y2) / 2 - 4 : vp.y;
    out.push({ vp, view, spec, ext, scale: S, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
  }
  return out;
}

// Generate every model view on the sheet (sections, elevations, 3D…).
export async function prepareSheet(p, sheet, rev = 0) {
  for (const vp of sheet.viewports || []) {
    const v = viewById(p, vp.view);
    const spec = v && v.kind !== "schedule" ? viewSpec(p, v) : null;
    if (spec && spec.type === "model") await ensureGen(p, spec, rev);
  }
}

export function sheetReady(p, sheet, rev = 0) {
  return (sheet.viewports || []).every((vp) => {
    const v = viewById(p, vp.view);
    const spec = v && v.kind !== "schedule" ? viewSpec(p, v) : null;
    return !spec || spec.type !== "model" || !!cachedGen(p, spec, rev);
  });
}

// o: {rev, planTheme, ink, mono, print, selected: Set (viewport ids), t,
//     minLw, units, labels, select}
export function drawSheet(ctx, p, sheet, o = {}) {
  const t = o.t || ((s) => s);
  const L = sheetLayout(sheet);
  const ink = "#000000";
  const { W, H, frame, tb } = L;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  // ---- viewports
  const rects = viewportRects(p, sheet, o.rev, t);
  for (const r of rects) {
    if (r.schedule) {
      drawScheduleTable(ctx, p, r.view, displayName(r.view.name, t), r.x1, r.y1, { ink, t });
    } else {
      const S = r.scale;
      beginClip(ctx, r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1);
      ctx.translate(r.x1, r.y1);
      ctx.scale(1 / S, 1 / S);
      ctx.translate(-r.ext.x1, -r.ext.y1);
      const gen = r.spec.type === "model" ? cachedGen(p, r.spec, o.rev ?? 0) || staleGen(r.spec) : null;
      drawView(ctx, p, r.view, { ink, bg: "#ffffff", mono: o.mono, print: true, minLw: (o.minLw || 0) * S, px: 0.06 * S, rev: o.rev, gen, theme: o.planTheme || sheetPlanTheme(o.mono), units: o.units, labels: o.labels, planOpts: { lw: 0.18 * S, px: 0.06 * S } });
      endClip(ctx);
      if (r.view.cropShow && r.view.cropOn && o.showCrops) { ctx.strokeStyle = "#999999"; ctx.lineWidth = 0.2; ctx.setLineDash([2, 1]); ctx.strokeRect(r.x1, r.y1, r.x2 - r.x1, r.y2 - r.y1); ctx.setLineDash([]); }
    }
    // View title: number bubble, name, scale.
    if (!r.schedule && r.vp.title !== false) {
      const n = detailNumber(sheet, r.vp);
      const y = r.y2 + 7;
      ctx.strokeStyle = ink; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.arc(r.x1 + 4, y, 3.6, 0, Math.PI * 2); ctx.stroke();
      text(ctx, n, r.x1 + 4, y + 1.2, 3.4, { bold: true, align: "center" });
      const name = r.vp.title || (r.view.id === "3d-default" ? t("Default 3D") : displayName(r.view.name, t));
      text(ctx, name, r.x1 + 10, y - 0.4, 3.4, { bold: true });
      ctx.beginPath(); ctx.moveTo(r.x1 + 9, y + 1.2); ctx.lineTo(r.x1 + 10 + Math.max(30, name.length * 2.1), y + 1.2); ctx.stroke();
      text(ctx, r.view.kind === "3d" ? t("Axonometric") : `1:${r.scale}`, r.x1 + 10, y + 4.6, 2.6, { color: "#333333" });
    }
    if (o.selected && o.selected.has(r.vp.id)) {
      ctx.strokeStyle = o.select || "#1a73e8"; ctx.lineWidth = 0.6; ctx.setLineDash([2, 1.2]);
      ctx.strokeRect(r.x1 - 1, r.y1 - 1, r.x2 - r.x1 + 2, r.y2 - r.y1 + 2);
      ctx.setLineDash([]);
    }
  }
  // ---- sheet annotations (paper mm, scale 1)
  drawAnnotations(ctx, (p.annotations || []).filter((a) => a.view === sheet.id), { scale: 1, ink, bg: "#ffffff", mono: o.mono, print: true, p, selected: o.selectedAnn, select: o.select, minLw: o.minLw });
  // ---- frame and title block
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.7;
  ctx.strokeRect(frame.x1, frame.y1, frame.x2 - frame.x1, frame.y2 - frame.y1);
  drawTitleBlock(ctx, p, sheet, tb, rects, o);
  ctx.restore();
  return rects;
}

function drawTitleBlock(ctx, p, sheet, tb, rects, o) {
  const t = o.t || ((s) => s);
  const m = p.meta || {};
  const f = sheet.fields || {};
  const ink = "#000000", grey = "#555555";
  const x = tb.x1, w = tb.x2 - tb.x1;
  const k = Math.min(1, w / 180);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = ink;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, tb.y1, w, tb.y2 - tb.y1);
  ctx.strokeRect(x, tb.y1, w, tb.y2 - tb.y1);
  let y = tb.y1;
  const rule = (yy, lw = 0.3) => { ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); };
  const small = (s, xx, yy) => text(ctx, s, xx, yy, 2 * k, { color: grey });
  // Company / office.
  y += 12 * k;
  text(ctx, m.company || "MyArchitecture", x + 4, y, 5 * k, { bold: true });
  y += 5 * k;
  small(m.author ? `${t("Drawn by")}: ${m.author}` : "", x + 4, y);
  y += 4 * k;
  rule(y);
  // Project.
  y += 5 * k; small(t("Project"), x + 3, y);
  y += 6 * k; text(ctx, m.title || t("Untitled"), x + 4, y, 4.2 * k, { bold: true });
  y += 5 * k; text(ctx, [m.client, m.address].filter(Boolean).join(" · "), x + 4, y, 2.6 * k, { color: "#333333" });
  y += 4 * k;
  rule(y);
  // Revisions table.
  const revs = sheetRevisions(p, sheet);
  y += 5 * k; small(t("Revisions"), x + 3, y);
  y += 2 * k;
  const cols = [x + 3, x + 14 * k, x + w - 26 * k];
  rule(y, 0.2);
  y += 4 * k;
  text(ctx, t("No."), cols[0], y, 2.2 * k, { bold: true }); text(ctx, t("Description"), cols[1], y, 2.2 * k, { bold: true }); text(ctx, t("Date"), cols[2], y, 2.2 * k, { bold: true });
  const rows = revs.slice(-8);
  for (const r of rows) {
    y += 4.5 * k;
    text(ctx, r.name || String(r.seq), cols[0], y, 2.4 * k); text(ctx, displayName(r.description || "", t).slice(0, 40), cols[1], y, 2.4 * k); text(ctx, r.date || "", cols[2], y, 2.4 * k);
  }
  if (!rows.length) { y += 4.5 * k; text(ctx, "—", cols[0], y, 2.4 * k, { color: grey }); }
  y += 3 * k;
  rule(y);
  // Fields grid near the bottom.
  const bottom = tb.y2;
  const fieldsTop = bottom - 62 * k;
  if (y < fieldsTop) y = fieldsTop;
  const half = x + w / 2;
  const scales = [...new Set(rects.filter((r) => !r.schedule && r.view.kind !== "3d").map((r) => r.scale))];
  const scaleText = scales.length === 1 ? `1:${scales[0]}` : scales.length ? t("As indicated") : "—";
  const cur = currentRevision(p, sheet);
  const cells = [
    [t("Drawn by"), f.drawnBy || m.author || ""], [t("Checked by"), f.checkedBy || ""],
    [t("Approved by"), f.approvedBy || ""], [t("Date"), f.issueDate || m.date || ""],
    [t("Drawing scale"), scaleText], [t("Status"), displayName(f.status || "", t)],
  ];
  let yy = y;
  for (let i = 0; i < cells.length; i += 2) {
    rule(yy, 0.2);
    ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(half, yy); ctx.lineTo(half, yy + 9 * k); ctx.stroke();
    small(cells[i][0], x + 3, yy + 3 * k); text(ctx, cells[i][1], x + 3, yy + 7.6 * k, 2.8 * k);
    small(cells[i + 1][0], half + 3, yy + 3 * k); text(ctx, cells[i + 1][1], half + 3, yy + 7.6 * k, 2.8 * k);
    yy += 9 * k;
  }
  rule(yy, 0.5);
  small(t("Sheet name"), x + 3, yy + 3.5 * k);
  text(ctx, displayName(sheet.name || "", t), x + 4, yy + 10 * k, 4 * k, { bold: true });
  yy += 13 * k;
  rule(yy, 0.3);
  small(t("Sheet number"), x + 3, yy + 3.5 * k);
  small(t("Rev."), x + w - 22 * k, yy + 3.5 * k);
  text(ctx, sheet.number || "", x + 4, Math.min(bottom - 2, yy + 13 * k), 9 * k, { bold: true });
  text(ctx, cur ? cur.name || String(cur.seq) : "—", x + w - 21 * k, Math.min(bottom - 2, yy + 12 * k), 6 * k, { bold: true });
}

// One sheet as an SVG document sized in paper mm → {svg, W, H}.
export function sheetSvg(p, sheet, o = {}) {
  const L = sheetLayout(sheet);
  const ctx = new SvgContext(L.W, L.H);
  drawSheet(ctx, p, sheet, { ...o, print: true });
  return { svg: ctx.toString("#ffffff"), W: L.W, H: L.H };
}

// A free spot on the sheet for a new viewport of size w × h (paper mm):
// left to right, top to bottom in the drawing area.
export function placeFree(p, sheet, w, h, rev = 0) {
  const L = sheetLayout(sheet);
  const taken = viewportRects(p, sheet, rev).map((r) => ({ x1: r.x1 - 6, y1: r.y1 - 6, x2: r.x2 + 6, y2: r.y2 + 16 }));
  const free = (x1, y1) => taken.every((r) => x1 + w < r.x1 || x1 > r.x2 || y1 + h + 12 < r.y1 || y1 > r.y2);
  for (let y = L.area.y1 + 4; y + h <= L.area.y2; y += 8) {
    for (let x = L.area.x1 + 4; x + w <= L.area.x2; x += 8) if (free(x, y)) return [x + w / 2, y + h / 2];
  }
  return [(L.area.x1 + L.area.x2) / 2, (L.area.y1 + L.area.y2) / 2];
}

export { viewExtent };
