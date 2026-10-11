// Schedules as views (Revit schedules / ArchiCAD interactive schedules):
// a category, chosen fields, filters, sorting, grouping with subtotals,
// grand totals, calculated fields and editable cells that write back to the
// model. Placed on sheets as tables. Pure functions; the UI is in viewtab.js.
//
// schedule view: {kind: "schedule", category, fields: [key], filters:
//   [{field, op, value}], sort: [{field, desc}], group: key | null,
//   totals: bool, calc: [{key, name, expr}]}

import { levelById, openingTags, wallLength, wallHeight, wallTypeOf } from "../core/project.js";
import { roomArea, roomPerimeter } from "../core/rooms.js";
import { furnitureDef } from "../lib/furniture.js";
import { toCSV } from "../core/schedule.js";
import { drawingList, allViews } from "./model.js";
import { displayName } from "./names.js";

const lvName = (p, id) => (levelById(p, id) || {}).name || "";
const wallOf = (p, o) => p.walls.find((w) => w.id === o.wall);
const prop = (k) => ({ get: (p, o) => (o.props && o.props[k] !== undefined ? o.props[k] : ""), set: (o, v) => { o.props = { ...(o.props || {}), [k]: v }; } });

// field: {key, label, type: text | number | length | area, get(p, o), set?(o, v, p)}
export const SCHEDULE_CATEGORIES = {
  rooms: {
    label: "Rooms", items: (p) => p.rooms,
    fields: [
      { key: "number", label: "Number", type: "text", get: (p, o) => o.number || (o.props && o.props.number) || "", set: (o, v) => { o.number = v; } },
      { key: "name", label: "Name", type: "text", get: (p, o) => o.name || "", set: (o, v) => { o.name = v; } },
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, o.level) },
      { key: "area", label: "Area (m²)", type: "area", get: (p, o) => roomArea(o) / 1e6 },
      { key: "perimeter", label: "Perimeter (m)", type: "number", get: (p, o) => roomPerimeter(o) / 1000 },
      { key: "floor", label: "Floor finish", type: "text", get: (p, o) => o.floor || "" },
      { key: "ceilingHeight", label: "Ceiling height", type: "number", get: (p, o) => o.ceilingHeight || "", set: (o, v) => { o.ceilingHeight = +v || null; } },
      { key: "department", label: "Department", type: "text", ...prop("department") },
      { key: "occupancy", label: "Occupancy", type: "number", ...prop("occupancy") },
      { key: "phase", label: "Phase", type: "text", get: (p, o) => o.phase || "new" },
    ],
  },
  doors: {
    label: "Doors", items: (p) => p.openings.filter((o) => o.kind === "door"),
    fields: [
      { key: "mark", label: "Mark", type: "text", get: (p, o) => openingTags(p).get(o.id) || "", set: (o, v) => { o.tag = v || undefined; } },
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, (wallOf(p, o) || {}).level) },
      { key: "type", label: "Type", type: "text", get: (p, o) => o.type || "", set: (o, v) => { o.type = v; } },
      { key: "width", label: "Width", type: "length", get: (p, o) => o.width, set: (o, v) => { o.width = Math.max(100, +v || o.width); } },
      { key: "height", label: "Height", type: "length", get: (p, o) => o.height, set: (o, v) => { o.height = Math.max(100, +v || o.height); } },
      { key: "fire", label: "Fire rating", type: "text", ...prop("fireRating") },
      { key: "hardware", label: "Hardware", type: "text", ...prop("hardware") },
      { key: "phase", label: "Phase", type: "text", get: (p, o) => o.phase || "new" },
    ],
  },
  windows: {
    label: "Windows", items: (p) => p.openings.filter((o) => o.kind === "window"),
    fields: [
      { key: "mark", label: "Mark", type: "text", get: (p, o) => openingTags(p).get(o.id) || "", set: (o, v) => { o.tag = v || undefined; } },
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, (wallOf(p, o) || {}).level) },
      { key: "type", label: "Type", type: "text", get: (p, o) => o.type || "", set: (o, v) => { o.type = v; } },
      { key: "width", label: "Width", type: "length", get: (p, o) => o.width, set: (o, v) => { o.width = Math.max(100, +v || o.width); } },
      { key: "height", label: "Height", type: "length", get: (p, o) => o.height, set: (o, v) => { o.height = Math.max(100, +v || o.height); } },
      { key: "sill", label: "Sill", type: "length", get: (p, o) => o.sill, set: (o, v) => { o.sill = Math.max(0, +v || 0); } },
      { key: "glazing", label: "Glazing", type: "text", ...prop("glazing") },
    ],
  },
  walls: {
    label: "Walls", items: (p) => p.walls,
    fields: [
      { key: "type", label: "Type", type: "text", get: (p, o) => (wallTypeOf(p, o) || {}).name || "" },
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, o.level) },
      { key: "length", label: "Length (m)", type: "number", get: (p, o) => wallLength(o) / 1000 },
      { key: "thickness", label: "Thickness", type: "length", get: (p, o) => o.thickness },
      { key: "height", label: "Height", type: "length", get: (p, o) => wallHeight(p, o), set: (o, v) => { o.height = +v > 0 ? +v : null; } },
      { key: "area", label: "Area (m²)", type: "area", get: (p, o) => (wallLength(o) * wallHeight(p, o)) / 1e6 },
      { key: "material", label: "Material", type: "text", get: (p, o) => o.material || "", set: (o, v) => { o.material = v || undefined; } },
      { key: "phase", label: "Phase", type: "text", get: (p, o) => o.phase || "new" },
    ],
  },
  furniture: {
    label: "Furniture", items: (p) => p.furniture,
    fields: [
      { key: "name", label: "Name", type: "text", get: (p, o) => o.name || (furnitureDef(o.kind) || {}).name || o.kind, set: (o, v) => { o.name = v; } },
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, o.level) },
      { key: "width", label: "Width", type: "length", get: (p, o) => o.w },
      { key: "depth", label: "Depth", type: "length", get: (p, o) => o.d },
      { key: "height", label: "Height", type: "length", get: (p, o) => o.h },
      { key: "price", label: "Price", type: "number", ...prop("price") },
      { key: "supplier", label: "Supplier", type: "text", ...prop("supplier") },
    ],
  },
  columns: {
    label: "Columns", items: (p) => p.columns,
    fields: [
      { key: "level", label: "Level", type: "text", get: (p, o) => lvName(p, o.level) },
      { key: "shape", label: "Shape", type: "text", get: (p, o) => o.shape },
      { key: "width", label: "Width", type: "length", get: (p, o) => o.w },
      { key: "depth", label: "Depth", type: "length", get: (p, o) => o.d },
      { key: "material", label: "Material", type: "text", get: (p, o) => o.material || "concrete" },
    ],
  },
  levels: {
    label: "Levels", items: (p) => p.levels,
    fields: [
      { key: "name", label: "Name", type: "text", get: (p, o) => o.name, set: (o, v) => { if (v) o.name = v; } },
      { key: "elevation", label: "Elevation", type: "length", get: (p, o) => o.elevation, set: (o, v) => { if (Number.isFinite(+v)) o.elevation = +v; } },
      { key: "height", label: "Height", type: "length", get: (p, o) => o.height, set: (o, v) => { if (+v >= 100) o.height = +v; } },
      { key: "rooms", label: "Rooms", type: "number", get: (p, o) => p.rooms.filter((r) => r.level === o.id).length },
      { key: "area", label: "Room area (m²)", type: "area", get: (p, o) => p.rooms.filter((r) => r.level === o.id).reduce((s, r) => s + roomArea(r), 0) / 1e6 },
    ],
  },
  sheets: {
    label: "Sheets", items: (p) => drawingList(p).map((r) => ({ ...r, ref: (p.sheets || []).find((s) => s.id === r.id) })),
    fields: [
      { key: "number", label: "Sheet number", type: "text", get: (p, o) => o.number, set: (o, v) => { if (o.ref && v) o.ref.number = v; } },
      { key: "name", label: "Sheet name", type: "text", get: (p, o) => displayName(o.name), set: (o, v) => { if (o.ref) o.ref.name = v; } },
      { key: "revision", label: "Current revision", type: "text", get: (p, o) => o.revision },
      { key: "date", label: "Date", type: "text", get: (p, o) => o.date },
      { key: "views", label: "Views", type: "number", get: (p, o) => o.views },
    ],
  },
  views: {
    label: "Views", items: (p) => allViews(p).filter((v) => v.kind !== "schedule"),
    fields: [
      { key: "name", label: "Name", type: "text", get: (p, o) => displayName(o.name) },
      { key: "kind", label: "Kind", type: "text", get: (p, o) => o.kind },
      { key: "scale", label: "Scale", type: "text", get: (p, o) => `1:${o.scale || 100}` },
      { key: "detail", label: "Detail level", type: "text", get: (p, o) => o.detail },
      { key: "sheet", label: "Sheet", type: "text", get: (p, o) => { const s = (p.sheets || []).find((sh) => (sh.viewports || []).some((vp) => vp.view === o.id)); return s ? s.number : ""; } },
    ],
  },
};

export function categoryFields(cat) { return (SCHEDULE_CATEGORIES[cat] || SCHEDULE_CATEGORIES.rooms).fields; }

export function defaultSchedule(cat) {
  const fields = categoryFields(cat).slice(0, 6).map((f) => f.key);
  return { category: cat, fields, filters: [], sort: [{ field: fields[0], desc: false }], group: null, totals: true, calc: [] };
}

// ---------------------------------------------------------------- formulas
// A tiny safe expression language for calculated fields: numbers, field
// keys, + − × ÷, parentheses. "area * 1.1", "(width * height) / 1e6".
export function evalFormula(expr, row) {
  const src = String(expr || "");
  let i = 0;
  const peek = () => { while (src[i] === " ") i++; return src[i]; };
  const num = () => {
    const m = src.slice(i).match(/^\d+(\.\d+)?(e[+-]?\d+)?/i);
    if (m) { i += m[0].length; return parseFloat(m[0]); }
    const id = src.slice(i).match(/^[A-Za-z_][\w.]*/);
    if (id) { i += id[0].length; const v = parseFloat(row[id[0]]); return Number.isFinite(v) ? v : 0; }
    throw new Error("bad formula");
  };
  const factor = () => {
    const c = peek();
    if (c === "(") { i++; const v = expr0(); if (peek() !== ")") throw new Error("missing )"); i++; return v; }
    if (c === "-") { i++; return -factor(); }
    return num();
  };
  const term = () => { let v = factor(); for (;;) { const c = peek(); if (c === "*") { i++; v *= factor(); } else if (c === "/") { i++; const d = factor(); v = d ? v / d : 0; } else return v; } };
  const expr0 = () => { let v = term(); for (;;) { const c = peek(); if (c === "+") { i++; v += term(); } else if (c === "-") { i++; v -= term(); } else return v; } };
  try { const v = expr0(); return peek() === undefined ? v : NaN; } catch { return NaN; }
}

// ---------------------------------------------------------------- rows
function matches(v, f) {
  const a = typeof v === "number" ? v : String(v ?? "");
  const b = f.value;
  const nb = parseFloat(b);
  switch (f.op) {
    case "=": return typeof a === "number" ? Math.abs(a - nb) < 1e-9 : a === String(b);
    case "!=": return typeof a === "number" ? Math.abs(a - nb) >= 1e-9 : a !== String(b);
    case ">": return +a > nb;
    case "<": return +a < nb;
    case ">=": return +a >= nb;
    case "<=": return +a <= nb;
    case "contains": return String(a).toLowerCase().includes(String(b).toLowerCase());
    default: return true;
  }
}

// → {columns: [{key, label, type, editable}], groups: [{key, rows, totals}],
//    totals, count, rows (flat)}
export function scheduleTable(p, sch) {
  const cat = SCHEDULE_CATEGORIES[sch.category] || SCHEDULE_CATEGORIES.rooms;
  const byKey = new Map(cat.fields.map((f) => [f.key, f]));
  const calc = (sch.calc || []).filter((c) => c.key && c.expr);
  const columns = [];
  for (const k of sch.fields || []) {
    const f = byKey.get(k);
    if (f) columns.push({ key: f.key, label: f.label, type: f.type, editable: !!f.set });
    const c = calc.find((x) => x.key === k);
    if (c) columns.push({ key: c.key, label: c.name || c.key, type: "number", calc: true });
  }
  const rows = [];
  for (const o of cat.items(p)) {
    const row = { _id: o.id, _obj: o };
    for (const f of cat.fields) row[f.key] = f.get(p, o);
    for (const c of calc) row[c.key] = evalFormula(c.expr, row);
    if ((sch.filters || []).every((f) => !f.field || matches(row[f.field], f))) rows.push(row);
  }
  const cmp = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true }));
  const sorts = [...(sch.group ? [{ field: sch.group }] : []), ...(sch.sort || [])].filter((s) => s.field);
  rows.sort((a, b) => { for (const s of sorts) { const c = cmp(a[s.field], b[s.field]); if (c) return s.desc ? -c : c; } return 0; });
  const sum = (list) => {
    const t = {};
    for (const c of columns) if (c.type === "area" || c.type === "number" || c.type === "length" || c.calc) t[c.key] = list.reduce((s, r) => s + (parseFloat(r[c.key]) || 0), 0);
    return t;
  };
  const groups = [];
  if (sch.group) {
    for (const r of rows) {
      const k = String(r[sch.group] ?? "");
      let g = groups[groups.length - 1];
      if (!g || g.key !== k) groups.push((g = { key: k, rows: [] }));
      g.rows.push(r);
    }
    for (const g of groups) g.totals = sum(g.rows);
  } else groups.push({ key: null, rows, totals: null });
  return { columns, groups, rows, totals: sch.totals ? sum(rows) : null, count: rows.length };
}

export function cellText(v, type) {
  if (v === "" || v === null || v === undefined) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    if (type === "area" || type === "number") return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2);
    return String(Math.round(v));
  }
  return String(v);
}

// Write a cell back to the element (inside store.edit). → true when changed.
export function setCell(p, sch, id, key, value) {
  const cat = SCHEDULE_CATEGORIES[sch.category];
  const f = cat && cat.fields.find((x) => x.key === key);
  if (!f || !f.set) return false;
  const o = cat.items(p).find((x) => x.id === id);
  if (!o) return false;
  f.set(o, value, p);
  return true;
}

export function scheduleCSV(p, sch) {
  const tb = scheduleTable(p, sch);
  const rows = tb.rows.map((r) => Object.fromEntries(tb.columns.map((c) => [c.key, cellText(r[c.key], c.type)])));
  if (tb.totals) rows.push(Object.fromEntries(tb.columns.map((c, i) => [c.key, i === 0 ? `Total (${tb.count})` : tb.totals[c.key] !== undefined ? cellText(tb.totals[c.key], c.type) : ""])));
  return toCSV(rows, tb.columns.map((c) => [c.key, c.label]));
}

// ---------------------------------------------------------------- on sheets
const ROW = 6, PAD = 1.6, TXT = 2.2;

export function tableSize(p, sch, t = (s) => s) {
  const tb = scheduleTable(p, sch);
  const widths = tb.columns.map((c) => Math.max(18, t(c.label).length * TXT * 0.58 + 2 * PAD, ...tb.rows.slice(0, 200).map((r) => cellText(r[c.key], c.type).length * TXT * 0.58 + 2 * PAD)));
  const nRows = 2 + tb.rows.length + (sch.group ? tb.groups.length * 2 : 0) + (tb.totals ? 1 : 0);
  return { tb, widths, w: widths.reduce((s, v) => s + v, 0), h: nRows * ROW };
}

// Draw a schedule table with its top-left corner at (x, y), paper mm.
export function drawScheduleTable(ctx, p, sch, title, x, y, { ink = "#000000", t = (s) => s } = {}) {
  const { tb, widths, w } = tableSize(p, sch, t);
  const font = (b, s = TXT) => `${b ? "bold " : ""}${s}px "Segoe UI", "Malgun Gothic", sans-serif`;
  const cell = (s, cx, cy, cw, bold = false, align = "left") => {
    ctx.font = font(bold);
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    ctx.fillText(s, align === "right" ? cx + cw - PAD : cx + PAD, cy + ROW / 2);
  };
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.25;
  let cy = y;
  ctx.strokeRect(x, cy, w, ROW);
  ctx.font = font(true, TXT * 1.15);
  ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(title, x + w / 2, cy + ROW / 2);
  cy += ROW;
  let cx = x;
  tb.columns.forEach((c, i) => { ctx.strokeRect(cx, cy, widths[i], ROW); cell(t(c.label), cx, cy, widths[i], true); cx += widths[i]; });
  cy += ROW;
  const right = (c) => c.type !== "text";
  for (const g of tb.groups) {
    if (g.key !== null) { ctx.strokeRect(x, cy, w, ROW); cell(g.key || "—", x, cy, w, true); cy += ROW; }
    for (const r of g.rows) {
      cx = x;
      tb.columns.forEach((c, i) => { ctx.strokeRect(cx, cy, widths[i], ROW); cell(cellText(r[c.key], c.type), cx, cy, widths[i], false, right(c) ? "right" : "left"); cx += widths[i]; });
      cy += ROW;
    }
    if (g.totals) {
      cx = x;
      tb.columns.forEach((c, i) => { ctx.strokeRect(cx, cy, widths[i], ROW); cell(i === 0 ? `${g.rows.length}` : g.totals[c.key] !== undefined ? cellText(g.totals[c.key], c.type) : "", cx, cy, widths[i], true, i && right(c) ? "right" : "left"); cx += widths[i]; });
      cy += ROW;
    }
  }
  if (tb.totals) {
    cx = x;
    ctx.lineWidth = 0.5;
    tb.columns.forEach((c, i) => { ctx.strokeRect(cx, cy, widths[i], ROW); cell(i === 0 ? `${t("Total")} (${tb.count})` : tb.totals[c.key] !== undefined ? cellText(tb.totals[c.key], c.type) : "", cx, cy, widths[i], true, i && right(c) ? "right" : "left"); cx += widths[i]; });
    cy += ROW;
  }
  ctx.restore();
  return { w, h: cy - y };
}
