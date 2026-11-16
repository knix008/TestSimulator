// BIM building elements beyond walls, rooms and roofs — the parts of a model
// that Revit and ArchiCAD hold and MyArchitecture now draws itself:
//
//   slabs     floors and foundations by outline: layered slab types, openings
//             (holes), a top offset and an optional slope
//   ceilings  by outline at a height above the floor, layered ceiling types
//   beams     by two points with a profile (rectangle, I, T, round) and the
//             top elevation at each end (a sloped beam is a brace)
//   railings  by a path, with a height, balusters and a top rail
//   ramps     by a centre-line path, a width and a rise
//   shafts    vertical openings cutting slabs, ceilings and roofs over a
//             range of levels
//
// plus the parametric behaviour around them: a type catalogue ("families")
// whose type parameters are copied onto every instance, design options (main
// model + alternatives), slab types with layers, and curtain-wall types.
//
// This module only depends on geom.js: project.js imports it, so it must not
// import project.js back (see normalizeElements).

import { uid } from "../geom.js";

export const ELEMENT_COLLECTIONS = ["slabs", "ceilings", "beams", "railings", "ramps", "shafts"];

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);
const pos = (v, d, min = 1) => Math.max(min, num(v, d));
const ptsOf = (a) => (Array.isArray(a) ? a.filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [num(q[0], 0), num(q[1], 0)]) : []);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- slab and ceiling types
// Layers from the top down (the first layer is the finish you walk on).
export const DEFAULT_SLAB_TYPES = [
  { id: "floor-concrete-250", name: "Concrete floor 250", use: "floor", layers: [{ material: "screed", thickness: 50, function: "finish" }, { material: "concrete", thickness: 200, function: "structure" }] },
  { id: "floor-insulated-300", name: "Insulated floor 300", use: "floor", layers: [{ material: "screed", thickness: 60, function: "finish" }, { material: "insulation", thickness: 60, function: "insulation" }, { material: "concrete", thickness: 180, function: "structure" }] },
  { id: "floor-timber-220", name: "Timber floor 220", use: "floor", layers: [{ material: "oak", thickness: 20, function: "finish" }, { material: "timber", thickness: 200, function: "structure" }] },
  { id: "floor-concrete-200", name: "Concrete slab 200", use: "floor", layers: [{ material: "concrete", thickness: 200, function: "structure" }] },
  { id: "found-raft-400", name: "Raft foundation 400", use: "foundation", layers: [{ material: "concrete", thickness: 400, function: "structure" }] },
  { id: "ceil-gypsum-15", name: "Gypsum board ceiling", use: "ceiling", layers: [{ material: "gypsum", thickness: 15, function: "finish" }] },
  { id: "ceil-acoustic-20", name: "Acoustic tile ceiling 600×600", use: "ceiling", layers: [{ material: "acoustic-tile", thickness: 20, function: "finish" }] },
];
export const SLAB_USES = ["floor", "foundation", "ceiling"];

// Built-in slab types are always available; p.slabTypes holds the project's
// own ones (and edited copies of built-ins, which then win by id).
export function allSlabTypes(p) {
  const own = (p && p.slabTypes) || [];
  const ids = new Set(own.map((t) => t.id));
  return [...own, ...DEFAULT_SLAB_TYPES.filter((t) => !ids.has(t.id))];
}
export const slabTypeById = (p, id) => (id ? allSlabTypes(p).find((t) => t.id === id) || null : null);

export const slabTypeThickness = (st) => (st && st.layers ? st.layers.reduce((s, l) => s + l.thickness, 0) : 0);

// ---------------------------------------------------------------- curtain walls
// A wall type of kind "curtain": a grid of mullions (vertical, every `u` mm
// along the wall) and transoms (horizontal, every `v` mm up), with panels in
// the cells. gridMode "even" divides the wall into equal cells no wider than
// u; "fixed" lays them out from the start and leaves the rest at the end.
export const CURTAIN_DEFAULTS = { u: 1500, v: 1350, mullion: 60, depth: 150, panel: "glass", frame: "aluminium", gridMode: "even", spandrel: 0 };
export const DEFAULT_CURTAIN_TYPES = [
  { id: "curtain-1500", name: "Curtain wall 1500 × 1350", exterior: true, kind: "curtain", curtain: { ...CURTAIN_DEFAULTS } },
  { id: "curtain-storefront", name: "Storefront 1200 × 2400", exterior: true, kind: "curtain", curtain: { ...CURTAIN_DEFAULTS, u: 1200, v: 2400, mullion: 50, depth: 120 } },
  { id: "curtain-spandrel", name: "Curtain wall with spandrel panels", exterior: true, kind: "curtain", curtain: { ...CURTAIN_DEFAULTS, u: 1500, v: 3800, spandrel: 900 } },
].map((wt) => ({ ...wt, layers: [{ material: "glass", thickness: wt.curtain.depth, function: "finish" }] }));

export const isCurtainType = (wt) => !!wt && wt.kind === "curtain";

function normalizeCurtainType(wt) {
  const c = wt.curtain && typeof wt.curtain === "object" ? wt.curtain : {};
  wt.curtain = {
    u: pos(c.u, CURTAIN_DEFAULTS.u, 200), v: pos(c.v, CURTAIN_DEFAULTS.v, 200), mullion: pos(c.mullion, CURTAIN_DEFAULTS.mullion, 10), depth: pos(c.depth, CURTAIN_DEFAULTS.depth, 20),
    panel: c.panel || "glass", frame: c.frame || "aluminium", gridMode: c.gridMode === "fixed" ? "fixed" : "even", spandrel: Math.max(0, num(c.spandrel, 0)),
  };
  // The layer list keeps every other engine (thickness, IFC layer sets) working.
  wt.layers = [{ material: wt.curtain.panel, thickness: wt.curtain.depth, function: "finish" }];
}

// ---------------------------------------------------------------- type catalogue ("families")
// Each type belongs to a category and carries type parameters; an instance
// (opening, column, beam, furniture, railing) with `typeId` takes them over
// whenever the project is normalized or the type is edited. Everything else on
// the instance (position, swing side, sill …) stays an instance parameter.
export const TYPE_CATEGORIES = ["door", "window", "column", "beam", "furniture", "railing"];
export const TYPE_PARAMS = {
  door: ["type", "width", "height", "frameWidth", "frameDepth"],
  window: ["type", "width", "height", "frameWidth", "frameDepth"],
  column: ["shape", "w", "d", "material"],
  beam: ["profile", "w", "h", "material"],
  furniture: ["kind", "w", "d", "h", "color"],
  railing: ["height", "spacing", "baluster", "rail", "style", "material"],
};
// Instance collection and filter of each category.
export const TYPE_HOSTS = {
  door: ["openings", (o) => o.kind === "door"],
  window: ["openings", (o) => o.kind === "window"],
  column: ["columns", () => true],
  beam: ["beams", () => true],
  furniture: ["furniture", (f) => f.kind !== "model"],
  railing: ["railings", () => true],
};
// Type parameters that only seed a new instance (Revit's "default sill height").
export const TYPE_DEFAULTS = { window: ["sill"], door: [] };

export const DEFAULT_TYPES = [
  { id: "door-single-900", category: "door", name: "Single door 900 × 2100", params: { type: "single", width: 900, height: 2100, frameWidth: 60, frameDepth: 0 } },
  { id: "door-single-800", category: "door", name: "Single door 800 × 2100", params: { type: "single", width: 800, height: 2100, frameWidth: 60, frameDepth: 0 } },
  { id: "door-double-1600", category: "door", name: "Double door 1600 × 2100", params: { type: "double", width: 1600, height: 2100, frameWidth: 70, frameDepth: 0 } },
  { id: "door-sliding-1800", category: "door", name: "Sliding glass door 1800 × 2200", params: { type: "sliding", width: 1800, height: 2200, frameWidth: 50, frameDepth: 0 } },
  { id: "door-garage-2400", category: "door", name: "Garage door 2400 × 2100", params: { type: "garage", width: 2400, height: 2100, frameWidth: 60, frameDepth: 0 } },
  { id: "win-casement-1200", category: "window", name: "Casement window 1200 × 1200", params: { type: "casement", width: 1200, height: 1200, frameWidth: 60, frameDepth: 90, sill: 900 } },
  { id: "win-fixed-1800", category: "window", name: "Fixed window 1800 × 1500", params: { type: "fixed", width: 1800, height: 1500, frameWidth: 50, frameDepth: 90, sill: 800 } },
  { id: "win-sliding-1500", category: "window", name: "Sliding window 1500 × 1200", params: { type: "sliding", width: 1500, height: 1200, frameWidth: 60, frameDepth: 90, sill: 900 } },
  { id: "win-tall-900", category: "window", name: "Tall window 900 × 2100", params: { type: "casement", width: 900, height: 2100, frameWidth: 60, frameDepth: 90, sill: 0 } },
  { id: "col-concrete-400", category: "column", name: "Concrete column 400 × 400", params: { shape: "rect", w: 400, d: 400, material: "concrete" } },
  { id: "col-concrete-600", category: "column", name: "Concrete column 600 × 600", params: { shape: "rect", w: 600, d: 600, material: "concrete" } },
  { id: "col-round-450", category: "column", name: "Round column Ø450", params: { shape: "round", w: 450, d: 450, material: "concrete" } },
  { id: "col-steel-300", category: "column", name: "Steel column 300 × 300", params: { shape: "rect", w: 300, d: 300, material: "steel" } },
  { id: "beam-concrete-300x600", category: "beam", name: "Concrete beam 300 × 600", params: { profile: "rect", w: 300, h: 600, material: "concrete" } },
  { id: "beam-steel-i200x400", category: "beam", name: "Steel I-beam 200 × 400", params: { profile: "I", w: 200, h: 400, material: "steel" } },
  { id: "beam-timber-100x250", category: "beam", name: "Timber joist 100 × 250", params: { profile: "rect", w: 100, h: 250, material: "timber" } },
  { id: "beam-glulam-200x600", category: "beam", name: "Glulam beam 200 × 600", params: { profile: "rect", w: 200, h: 600, material: "timber" } },
  { id: "rail-steel-1000", category: "railing", name: "Steel balustrade 1000", params: { height: 1000, spacing: 120, baluster: 20, rail: 50, style: "bars", material: "steel" } },
  { id: "rail-glass-1100", category: "railing", name: "Glass balustrade 1100", params: { height: 1100, spacing: 1200, baluster: 40, rail: 60, style: "glass", material: "steel" } },
  { id: "rail-timber-900", category: "railing", name: "Timber handrail 900", params: { height: 900, spacing: 150, baluster: 40, rail: 60, style: "bars", material: "timber" } },
];

// ---------------------------------------------------------------- profiles, styles
export const BEAM_PROFILES = ["rect", "I", "T", "round"];
export const RAILING_STYLES = ["bars", "glass", "panel"];
export const STAIR_SHAPES = ["straight", "L", "U", "spiral"];
export const STAIR_RAILINGS = ["none", "left", "right", "both"];

// ---------------------------------------------------------------- design options
// p.designOptions = [{id, name, options: [{id, name}], active}]; an element with
// `option` belongs to that option and is shown only while it is the active
// one of its set. Everything without `option` is the main model.
const HIDDEN = new Set();
let hiddenFor = null;
let hiddenKey = "";

export function hiddenOptions(p) {
  const sets = (p && p.designOptions) || [];
  const key = sets.map((s) => `${s.id}:${s.active}:${s.options.map((o) => o.id).join(",")}`).join("|");
  if (hiddenFor === sets && key === hiddenKey) return HIDDEN;
  HIDDEN.clear();
  for (const s of sets) for (const o of s.options || []) if (o.id !== s.active) HIDDEN.add(o.id);
  hiddenFor = sets;
  hiddenKey = key;
  return HIDDEN;
}

// Recompute the hidden option ids for p (call at the top of an entry point).
export function syncOptions(p) { hiddenOptions(p); }
// Is an item hidden by its design option? Uses the set of the last synced project.
export const optionHidden = (it) => !!(it && it.option && HIDDEN.has(it.option));

// The project as built with the active design options only (a shallow copy
// whose collections leave out the other options and openings in hidden walls).
export function activeModel(p) {
  const hidden = hiddenOptions(p);
  if (!hidden.size) return p;
  const out = { ...p };
  const off = (it) => !!(it.option && hidden.has(it.option));
  for (const k of Object.keys(p)) if (Array.isArray(p[k]) && p[k].some((x) => x && typeof x === "object" && "option" in x)) out[k] = p[k].filter((x) => !off(x));
  const walls = new Set(out.walls.map((w) => w.id));
  out.openings = (out.openings || p.openings).filter((o) => walls.has(o.wall) && !off(o));
  return out;
}

export function optionName(p, id) {
  for (const s of p.designOptions || []) { const o = s.options.find((x) => x.id === id); if (o) return `${s.name}: ${o.name}`; }
  return "";
}

// ---------------------------------------------------------------- types
// The built-in catalogue (DEFAULT_TYPES) is always loaded; p.types holds the
// project's own types and edited copies of built-ins (same id: the copy wins).
// Files stay small: only what the user made or changed is saved.
export function allTypes(p) {
  const own = (p && p.types) || [];
  const ids = new Set(own.map((t) => t.id));
  return [...own, ...DEFAULT_TYPES.filter((t) => !ids.has(t.id))];
}
export const isBuiltinType = (id) => DEFAULT_TYPES.some((t) => t.id === id);
export const typeById = (p, id) => (id ? allTypes(p).find((x) => x.id === id) || null : null);
export const typesOf = (p, category) => allTypes(p).filter((x) => x.category === category);

// Category of an instance ({kind, obj}) → "door" | … | null.
export function categoryOf(kind, obj) {
  if (kind === "openings") return obj.kind === "door" ? "door" : obj.kind === "window" ? "window" : null;
  if (kind === "columns") return "column";
  if (kind === "beams") return "beam";
  if (kind === "furniture") return obj.kind === "model" ? null : "furniture";
  if (kind === "railings") return "railing";
  return null;
}

// Copy a type's parameters onto one instance.
export function applyType(t, obj) {
  if (!t) return obj;
  for (const k of TYPE_PARAMS[t.category] || []) if (t.params[k] !== undefined && t.params[k] !== null) obj[k] = clone(t.params[k]);
  return obj;
}

// Every instance of a type → [{kind, obj}].
export function typeInstances(p, typeId) {
  const t = typeById(p, typeId);
  if (!t) return [];
  const [coll, ok] = TYPE_HOSTS[t.category];
  return (p[coll] || []).filter((o) => o.typeId === typeId && ok(o)).map((obj) => ({ kind: coll, obj }));
}

// Push every type's parameters onto its instances; instances whose type is
// gone (or whose kind no longer fits it) lose the link.
export function applyTypes(p) {
  const byId = new Map(allTypes(p).map((t) => [t.id, t]));
  for (const coll of new Set(Object.values(TYPE_HOSTS).map((x) => x[0]))) {
    for (const o of p[coll] || []) {
      if (!o.typeId) continue;
      const t = byId.get(o.typeId);
      if (!t || t.category !== categoryOf(coll, o)) { delete o.typeId; continue; }
      applyType(t, o);
    }
  }
}

// A new type in a category, copied from `from` (a type) or from an instance.
export function newType(p, category, name, params) {
  const t = { id: uid("ty"), category, name, params: {} };
  for (const k of [...TYPE_PARAMS[category], ...(TYPE_DEFAULTS[category] || [])]) if (params[k] !== undefined) t.params[k] = clone(params[k]);
  p.types.push(t);
  return t;
}

function normalizeTypes(out) {
  if (!Array.isArray(out.types)) out.types = [];
  out.types = out.types.filter((t) => t && TYPE_CATEGORIES.includes(t.category));
  for (const t of out.types) {
    t.id = t.id || uid("ty");
    t.name = String(t.name ?? t.id);
    t.params = t.params && typeof t.params === "object" ? t.params : {};
    for (const k of ["width", "height", "w", "d", "h", "frameWidth", "spacing", "baluster", "rail"]) if (k in t.params) t.params[k] = pos(t.params[k], 100, 1);
    for (const k of ["frameDepth", "sill"]) if (k in t.params) t.params[k] = Math.max(0, num(t.params[k], 0));
  }
}

// ---------------------------------------------------------------- normalize
// Called by normalizeProject after levels and the level collections are in
// place (ids and levels set). Old files load: every field has a default and
// nothing that was there is dropped.
export function normalizeElements(out) {
  const levels = new Map(out.levels.map((l) => [l.id, l]));
  // Slab / ceiling types.
  if (!Array.isArray(out.slabTypes)) out.slabTypes = [];
  for (const st of out.slabTypes) {
    st.id = st.id || uid("st");
    st.name = String(st.name ?? st.id);
    st.use = SLAB_USES.includes(st.use) ? st.use : "floor";
    st.layers = (Array.isArray(st.layers) ? st.layers : []).map((l) => ({ material: l.material || "concrete", thickness: Math.max(1, num(l.thickness, 100)), function: l.function || "structure" }));
    if (!st.layers.length) st.layers = [{ material: "concrete", thickness: 200, function: "structure" }];
  }
  const slabType = new Map(allSlabTypes(out).map((t) => [t.id, t]));
  // Curtain-wall types live with the wall types.
  for (const wt of out.wallTypes || []) {
    if (wt.kind === "curtain") normalizeCurtainType(wt);
    else if (wt.kind !== undefined) delete wt.kind;
  }
  const curtainIds = new Set((out.wallTypes || []).filter(isCurtainType).map((t) => t.id));
  normalizeTypes(out);
  if (!Array.isArray(out.designOptions)) out.designOptions = [];
  for (const s of out.designOptions) {
    s.id = s.id || uid("ds");
    s.name = String(s.name ?? "Option set");
    s.options = (Array.isArray(s.options) ? s.options : []).map((o) => ({ id: o.id || uid("do"), name: String(o.name ?? "Option") }));
    if (!s.options.length) s.options = [{ id: uid("do"), name: "Option 1" }];
    if (!s.options.some((o) => o.id === s.active)) s.active = s.options[0].id;
  }
  const optionIds = new Set(out.designOptions.flatMap((s) => s.options.map((o) => o.id)));
  for (const k of Object.keys(out)) {
    if (!Array.isArray(out[k])) continue;
    for (const it of out[k]) if (it && typeof it === "object" && "option" in it && !optionIds.has(it.option)) delete it.option;
  }

  // ---- slabs and ceilings
  const holesOf = (h) => (Array.isArray(h) ? h.map(ptsOf).filter((q) => q.length >= 3) : []);
  for (const s of out.slabs) {
    s.pts = ptsOf(s.pts);
    s.holes = holesOf(s.holes);
    const st = s.type && slabType.get(s.type);
    if (s.type && !st) delete s.type;
    s.thickness = st ? slabTypeThickness(st) : pos(s.thickness, 200, 10);
    s.kind = st ? (st.use === "foundation" ? "foundation" : "floor") : s.kind === "foundation" ? "foundation" : "floor";
    s.offset = num(s.offset, 0);
    s.slope = Math.max(0, Math.min(60, num(s.slope, 0)));
    s.slopeDir = num(s.slopeDir, 0);
  }
  out.slabs = out.slabs.filter((s) => s.pts.length >= 3);
  for (const c of out.ceilings) {
    c.pts = ptsOf(c.pts);
    c.holes = holesOf(c.holes);
    const st = c.type && slabType.get(c.type);
    if (c.type && !st) delete c.type;
    c.thickness = st ? slabTypeThickness(st) : pos(c.thickness, 20, 1);
    c.height = c.height === null || c.height === undefined || c.height === "" ? null : pos(c.height, 2600, 100);
  }
  out.ceilings = out.ceilings.filter((c) => c.pts.length >= 3);
  // ---- beams
  for (const b of out.beams) {
    for (const k of ["x1", "y1", "x2", "y2"]) b[k] = num(b[k], 0);
    b.w = pos(b.w, 200, 10);
    b.h = pos(b.h, 400, 10);
    b.profile = BEAM_PROFILES.includes(b.profile) ? b.profile : "rect";
    b.z1 = b.z1 === null || b.z1 === undefined || b.z1 === "" ? null : num(b.z1, 0);
    b.z2 = b.z2 === null || b.z2 === undefined || b.z2 === "" ? null : num(b.z2, 0);
    b.material = b.material || "concrete";
  }
  out.beams = out.beams.filter((b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) > 1);
  // ---- railings
  for (const r of out.railings) {
    r.pts = ptsOf(r.pts);
    r.height = pos(r.height, 1000, 100);
    r.z = num(r.z, 0);
    r.spacing = pos(r.spacing, 120, 50);
    r.baluster = pos(r.baluster, 20, 5);
    r.rail = pos(r.rail, 50, 10);
    r.style = RAILING_STYLES.includes(r.style) ? r.style : "bars";
    r.material = r.material || "steel";
  }
  out.railings = out.railings.filter((r) => r.pts.length >= 2);
  // ---- ramps
  for (const r of out.ramps) {
    r.pts = ptsOf(r.pts);
    r.width = pos(r.width, 1500, 300);
    r.rise = r.rise === null || r.rise === undefined || r.rise === "" ? null : num(r.rise, 0);
    r.thickness = pos(r.thickness, 150, 20);
    r.material = r.material || "concrete";
    r.railing = STAIR_RAILINGS.includes(r.railing) ? r.railing : "both";
  }
  out.ramps = out.ramps.filter((r) => r.pts.length >= 2);
  // ---- shafts
  for (const s of out.shafts) {
    s.pts = ptsOf(s.pts);
    if (!levels.has(s.top)) s.top = s.level;
    // The top level must not be below the base level.
    const a = levels.get(s.level), b = levels.get(s.top);
    if (a && b && b.elevation < a.elevation) s.top = s.level;
    s.name = String(s.name ?? "");
  }
  out.shafts = out.shafts.filter((s) => s.pts.length >= 3);

  // ---- extra parameters on the existing elements
  for (const w of out.walls) {
    if (w.baseOffset !== undefined) { w.baseOffset = num(w.baseOffset, 0); if (!w.baseOffset) delete w.baseOffset; }
    if (w.heightEnd !== undefined) { if (w.heightEnd === null || !(+w.heightEnd > 0)) delete w.heightEnd; else w.heightEnd = Math.max(100, +w.heightEnd); }
    if (w.attachTop !== undefined && !w.attachTop) delete w.attachTop;
    if (w.curtain !== undefined) {
      if (!w.type || !curtainIds.has(w.type) || typeof w.curtain !== "object") delete w.curtain;
      else for (const k of Object.keys(w.curtain)) { if (!["u", "v"].includes(k) || !(+w.curtain[k] >= 200)) delete w.curtain[k]; else w.curtain[k] = +w.curtain[k]; }
    }
  }
  for (const s of out.stairs) {
    if (s.shape === undefined || s.shape === "straight") { if (s.shape) delete s.shape; }
    else if (!STAIR_SHAPES.includes(s.shape)) delete s.shape;
    if (s.shape) {
      s.turn = s.turn === -1 ? -1 : 1;
      if (s.shape === "L") s.length2 = pos(s.length2, s.length, 300);
      if (s.shape === "L" || s.shape === "U") s.landing = pos(s.landing, s.width, 300);
      if (s.shape === "U") s.gap = Math.max(0, num(s.gap, 100));
      if (s.shape === "spiral") { s.radius = pos(s.radius, 300, 50); s.sweep = Math.max(90, Math.min(720, num(s.sweep, 270))); }
    }
    if (s.railing !== undefined && !STAIR_RAILINGS.includes(s.railing)) delete s.railing;
  }
  for (const r of out.roofs) {
    if (r.holes !== undefined) { r.holes = holesOf(r.holes); if (!r.holes.length) delete r.holes; }
    if (r.kind === "edges" || r.edges) {
      const n = r.pts.length;
      const src = Array.isArray(r.edges) ? r.edges : [];
      r.edges = Array.from({ length: n }, (_, i) => {
        const e = src[i] && typeof src[i] === "object" ? src[i] : {};
        const out2 = { slope: e.slope !== false };
        if (e.pitch !== undefined && e.pitch !== null && e.pitch !== "") out2.pitch = Math.max(0, Math.min(75, num(e.pitch, r.pitch)));
        if (e.overhang !== undefined && e.overhang !== null && e.overhang !== "") out2.overhang = Math.max(0, num(e.overhang, r.overhang));
        return out2;
      });
    }
  }
  for (const o of out.openings) {
    for (const k of ["frameWidth", "frameDepth"]) if (o[k] !== undefined) { o[k] = Math.max(0, num(o[k], 0)); if (!o[k] && k === "frameWidth") delete o[k]; }
  }
  applyTypes(out);
  void levels;
  return out;
}
