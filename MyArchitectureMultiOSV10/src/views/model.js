// Documentation data model: views, sheets, viewports, annotations, view
// templates, revisions, publish sets and line styles (Revit / ArchiCAD style
// project documentation). Pure functions, no DOM; imported by
// core/project.js (normalizeViews runs inside normalizeProject).
//
// project.views        [{id, kind, name, …}]       stored views
//   kind: plan | ceiling | section | elevation | detail | drafting | legend | schedule
//   Every level has a floor plan and a ceiling plan whether or not they are
//   stored: implicitViews() derives them (ids "pl-<level>", "cp-<level>"),
//   and ensureView() stores one the first time it is changed.
//   3D views are the project's scenes (p.scenes) plus "3d-default".
// project.sheets       [{id, number, name, paper, landscape, fields, viewports, revisions}]
//   viewport: {id, view, x, y (centre, paper mm), scale? , title?}
// project.annotations  [{id, view, kind, …}] — coordinates in the view's 2D frame
// project.viewTemplates, revisions, publishSets, lineStyles

import { uid } from "../core/geom.js";

export const VIEW_KINDS = ["plan", "ceiling", "section", "elevation", "detail", "drafting", "legend", "schedule", "3d"];
export const DETAIL_LEVELS = ["coarse", "medium", "fine"];
export const VIEW_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000];

// Categories a view can hide or override (model categories come from the 3D
// build, so new element kinds appear in the list as soon as they exist).
export const MODEL_CATEGORIES = ["walls", "doors", "windows", "openings", "rooms", "columns", "stairs", "furniture", "lights", "roofs", "solids"];
export const ANNOTATION_CATEGORIES = ["dimensions", "texts", "tags", "grids", "levels", "markers", "drawings", "regions", "clouds", "symbols"];

export const LINE_STYLES = [
  { id: "thin", name: "Thin lines", weight: 0.13, color: "#000000", pattern: "solid" },
  { id: "medium", name: "Medium lines", weight: 0.25, color: "#000000", pattern: "solid" },
  { id: "wide", name: "Wide lines", weight: 0.5, color: "#000000", pattern: "solid" },
  { id: "hidden", name: "Hidden lines", weight: 0.18, color: "#000000", pattern: "dash" },
  { id: "centre", name: "Centre lines", weight: 0.18, color: "#000000", pattern: "dashdot" },
  { id: "overhead", name: "Overhead lines", weight: 0.18, color: "#000000", pattern: "dot" },
  { id: "demolished", name: "Demolished", weight: 0.25, color: "#c62828", pattern: "dash" },
  { id: "red", name: "Red lines", weight: 0.25, color: "#d32f2f", pattern: "solid" },
];
export const LINE_PATTERNS = { solid: [], dash: [3, 1.5], dashdot: [6, 1.2, 0.6, 1.2], dot: [0.6, 1] };

export const PAPERS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841], Letter: [279.4, 215.9], Tabloid: [431.8, 279.4] };

export const DEFAULT_TEMPLATES = [
  { id: "vt-plan-100", name: "Architectural plan 1:100", kinds: ["plan"], scale: 100, detail: "medium", phase: "all", hidden: [] },
  { id: "vt-furn-50", name: "Furniture plan 1:50", kinds: ["plan"], scale: 50, detail: "fine", phase: "new", hidden: ["dimensions"] },
  { id: "vt-section-50", name: "Construction section 1:50", kinds: ["section", "detail"], scale: 50, detail: "fine", phase: "all", hidden: ["furniture", "lights"] },
  { id: "vt-elev-100", name: "Presentation elevation 1:100", kinds: ["elevation"], scale: 100, detail: "medium", phase: "new", hidden: ["furniture"] },
];

// Fields a template controls when applied.
export const TEMPLATE_FIELDS = ["scale", "detail", "phase", "hidden", "overrides"];

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);

export const planViewId = (levelId) => `pl-${levelId}`;
export const ceilingViewId = (levelId) => `cp-${levelId}`;
export const DEFAULT_3D = "3d-default";

export function newView(kind, props = {}) {
  const base = { id: uid("v"), kind, name: props.name || kind, scale: 100, detail: kind === "detail" ? "fine" : "medium", phase: "all", hidden: [], overrides: {}, template: null, crop: null, cropOn: kind === "detail" || kind === "section" || kind === "elevation", cropShow: true };
  return { ...base, ...props };
}

// The implicit views (one floor plan and one ceiling plan per level).
export function implicitViews(p) {
  const out = [];
  for (const lv of p.levels || []) {
    out.push(newView("plan", { id: planViewId(lv.id), name: lv.name, level: lv.id, implicit: true, cropOn: false }));
    out.push(newView("ceiling", { id: ceilingViewId(lv.id), name: lv.name, level: lv.id, cutHeight: 2300, implicit: true, cropOn: false }));
  }
  return out;
}

// Every view: stored ones replace their implicit twin.
export function allViews(p) {
  const stored = p.views || [];
  const ids = new Set(stored.map((v) => v.id));
  const levelIds = new Set((p.levels || []).map((l) => l.id));
  const res = [];
  for (const v of implicitViews(p)) if (!ids.has(v.id)) res.push(v);
  for (const v of stored) if (!(v.kind === "plan" || v.kind === "ceiling") || levelIds.has(v.level)) res.push(v);
  // Keep plans in level order.
  const lvIndex = new Map((p.levels || []).map((l, i) => [l.id, i]));
  res.sort((a, b) => VIEW_KINDS.indexOf(a.kind) - VIEW_KINDS.indexOf(b.kind) || (lvIndex.get(a.level) ?? 0) - (lvIndex.get(b.level) ?? 0));
  return res;
}

export function view3dList(p) {
  return [{ id: DEFAULT_3D, kind: "3d", name: "Default 3D", camera: null, scale: 200 }, ...(p.scenes || []).map((s) => ({ id: s.id, kind: "3d", name: s.name, camera: s.camera, style: s.style, scale: 200, scene: true }))];
}

export function viewById(p, id) {
  if (!id) return null;
  const v = (p.views || []).find((x) => x.id === id);
  if (v) return v;
  const imp = implicitViews(p).find((x) => x.id === id);
  if (imp) return imp;
  return view3dList(p).find((x) => x.id === id) || null;
}

// Inside store.edit: the stored copy of a view (an implicit one is stored now).
export function ensureView(p, id) {
  let v = (p.views || []).find((x) => x.id === id);
  if (v) return v;
  const imp = implicitViews(p).find((x) => x.id === id);
  if (!imp) return null;
  v = { ...imp };
  delete v.implicit;
  p.views = p.views || [];
  p.views.push(v);
  return v;
}

export const planViewOf = (p, levelId) => viewById(p, planViewId(levelId));

// A view with its template applied (the template wins for its fields).
export function effectiveView(p, v) {
  if (!v || !v.template) return v;
  const t = (p.viewTemplates || []).find((x) => x.id === v.template);
  if (!t) return v;
  const out = { ...v };
  for (const k of TEMPLATE_FIELDS) if (t[k] !== undefined) out[k] = Array.isArray(t[k]) ? t[k].slice() : typeof t[k] === "object" ? { ...t[k] } : t[k];
  return out;
}

export function isHidden(v, cat) {
  return !!(v && v.hidden && v.hidden.includes(cat));
}

export const sheetById = (p, id) => (p.sheets || []).find((s) => s.id === id) || null;

// The sheet (and viewport) a view is placed on, or null.
export function placementOf(p, viewId) {
  for (const s of p.sheets || []) {
    const vp = (s.viewports || []).find((x) => x.view === viewId);
    if (vp) return { sheet: s, viewport: vp, number: detailNumber(s, vp) };
  }
  return null;
}

// Detail numbers 1, 2, 3 … in viewport order (schedules are not numbered).
export function detailNumber(sheet, vp) {
  const list = (sheet.viewports || []).filter((x) => !x.schedule);
  return list.indexOf(vp) + 1;
}

// "A101" → "A102"; numbers keep their prefix and width.
export function nextSheetNumber(p, prefix = "A") {
  let best = 100;
  for (const s of p.sheets || []) {
    const m = String(s.number || "").match(/^([A-Za-z-]*)(\d+)$/);
    if (m && m[1] === prefix) best = Math.max(best, +m[2]);
  }
  return `${prefix}${best + 1}`;
}

export function newSheet(p, props = {}) {
  return { id: uid("sh"), number: nextSheetNumber(p), name: props.name || "Sheet", paper: "A1", landscape: true, fields: { drawnBy: "", checkedBy: "", approvedBy: "", issueDate: "", status: "" }, viewports: [], revisions: [], ...props };
}

export function sheetPaper(sheet) {
  let [a, b] = PAPERS[sheet.paper] || PAPERS.A1;
  if (sheet.paper === "custom") [a, b] = [num(sheet.w, 841), num(sheet.h, 594)];
  if (a < b) [a, b] = [b, a];
  return sheet.landscape === false ? [b, a] : [a, b];
}

// Sheet layout in paper mm: frame, title block strip at the right, drawing area.
export function sheetLayout(sheet) {
  const [W, H] = sheetPaper(sheet);
  const m = W > 500 ? 10 : 7;
  const tbW = Math.min(W > 500 ? 180 : 120, W * 0.3);
  const frame = { x1: m + (W > 500 ? 10 : 0), y1: m, x2: W - m, y2: H - m };
  const tb = { x1: frame.x2 - tbW, y1: frame.y1, x2: frame.x2, y2: frame.y2 };
  const area = { x1: frame.x1 + 4, y1: frame.y1 + 4, x2: tb.x1 - 4, y2: frame.y2 - 4 };
  return { W, H, frame, tb, area };
}

// Revisions shown on a sheet: those listed on it and those whose clouds are
// in its views, oldest first.
export function sheetRevisions(p, sheet) {
  const ids = new Set(sheet.revisions || []);
  const views = new Set((sheet.viewports || []).map((v) => v.view));
  for (const a of p.annotations || []) if (a.kind === "cloud" && a.rev && (views.has(a.view) || a.view === sheet.id)) ids.add(a.rev);
  return (p.revisions || []).filter((r) => ids.has(r.id)).sort((a, b) => a.seq - b.seq);
}

export function currentRevision(p, sheet) {
  const r = sheetRevisions(p, sheet);
  return r.length ? r[r.length - 1] : null;
}

// Drawing list rows (sheet list).
export function drawingList(p) {
  return (p.sheets || []).slice().sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true })).map((s) => {
    const r = currentRevision(p, s);
    return { id: s.id, number: s.number, name: s.name, paper: s.paper, views: (s.viewports || []).length, revision: r ? r.name || String(r.seq) : "", date: r ? r.date : s.fields && s.fields.issueDate || "" };
  });
}

export const annotationsOf = (p, viewId) => (p.annotations || []).filter((a) => a.view === viewId);

export function newAnnotation(viewId, kind, props = {}) {
  return { id: uid("an"), view: viewId, kind, ...props };
}

// ---------------------------------------------------------------- migration
// Old files have no documentation data: they get the default 3D view, the
// implicit level plans and one sheet per level with that level's plan —
// what the print window printed before. Ids that point nowhere are dropped.
export function normalizeViews(p, { defaultSheets = true } = {}) {
  const old = !Array.isArray(p.sheets);
  for (const k of ["views", "sheets", "annotations", "revisions", "publishSets"]) if (!Array.isArray(p[k])) p[k] = [];
  if (!Array.isArray(p.viewTemplates)) p.viewTemplates = DEFAULT_TEMPLATES.map((t) => JSON.parse(JSON.stringify(t)));
  if (!Array.isArray(p.lineStyles) || !p.lineStyles.length) p.lineStyles = LINE_STYLES.map((s) => ({ ...s }));
  const levelIds = new Set((p.levels || []).map((l) => l.id));
  p.views = p.views.filter((v) => v && typeof v === "object" && VIEW_KINDS.includes(v.kind));
  for (const v of p.views) {
    v.id = v.id || uid("v");
    v.name = String(v.name ?? v.kind);
    v.scale = Math.max(1, num(v.scale, 100));
    if (!DETAIL_LEVELS.includes(v.detail)) v.detail = "medium";
    if (!["all", "new", "existing"].includes(v.phase)) v.phase = "all";
    if (!Array.isArray(v.hidden)) v.hidden = [];
    if (!v.overrides || typeof v.overrides !== "object") v.overrides = {};
    if (v.crop && !["x1", "y1", "x2", "y2"].every((k) => Number.isFinite(+v.crop[k]))) v.crop = null;
    if (v.line) for (const k of ["x1", "y1", "x2", "y2"]) v.line[k] = num(v.line[k], 0);
    delete v.implicit;
  }
  p.views = p.views.filter((v) => !(v.kind === "plan" || v.kind === "ceiling") || levelIds.has(v.level));
  const tplIds = new Set(p.viewTemplates.map((t) => t.id));
  for (const v of p.views) if (v.template && !tplIds.has(v.template)) v.template = null;
  // Details whose parent is gone go too.
  const viewIds = () => new Set([...allViews(p).map((v) => v.id), ...view3dList(p).map((v) => v.id)]);
  let ids = viewIds();
  p.views = p.views.filter((v) => v.kind !== "detail" || ids.has(v.parent));
  ids = viewIds();
  p.annotations = p.annotations.filter((a) => a && typeof a === "object" && a.kind);
  for (const a of p.annotations) a.id = a.id || uid("an");
  for (const r of p.revisions) { r.id = r.id || uid("rv"); r.seq = Math.max(1, Math.round(num(r.seq, 1))); r.name = String(r.name ?? r.seq); r.description = String(r.description ?? ""); r.date = String(r.date ?? ""); }
  if (old && defaultSheets) {
    for (const lv of p.levels || []) {
      const s = newSheet(p, { name: `Floor plan — ${lv.name}`, paper: "A3", landscape: true, auto: true });
      s.viewports.push({ id: uid("vp"), view: planViewId(lv.id), x: 0, y: 0, fit: true });
      p.sheets.push(s);
    }
  }
  const sheetIds = new Set(p.sheets.map((s) => s.id));
  for (const s of p.sheets) {
    s.id = s.id || uid("sh");
    s.number = String(s.number ?? "");
    s.name = String(s.name ?? "");
    if (!(s.paper in PAPERS) && s.paper !== "custom") s.paper = "A1";
    s.landscape = s.landscape !== false;
    s.fields = { drawnBy: "", checkedBy: "", approvedBy: "", issueDate: "", status: "", ...(s.fields || {}) };
    s.viewports = (Array.isArray(s.viewports) ? s.viewports : []).filter((vp) => vp && (ids.has(vp.view)));
    for (const vp of s.viewports) { vp.id = vp.id || uid("vp"); vp.x = num(vp.x, 0); vp.y = num(vp.y, 0); }
    s.revisions = (Array.isArray(s.revisions) ? s.revisions : []).filter((r) => p.revisions.some((x) => x.id === r));
  }
  p.annotations = p.annotations.filter((a) => ids.has(a.view) || sheetIds.has(a.view));
  for (const ps of p.publishSets) { ps.id = ps.id || uid("ps"); ps.name = String(ps.name ?? ""); ps.sheets = (ps.sheets || []).filter((id) => sheetIds.has(id)); }
  return p;
}
