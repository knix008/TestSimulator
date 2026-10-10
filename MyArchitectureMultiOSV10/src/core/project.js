// Project model. A design is one plain JSON object (.myarch): saving is
// JSON.stringify, undo is a snapshot and every engine is a pure function of
// it, so all of them can be tested in Node without a DOM.
//
// Units are millimetres. Plan coordinates: x to the right, y down the screen
// (north is up unless meta.north rotates it). Every plan item carries the id
// of its level (storey); openings belong to a wall and take its level.

import { uid } from "./geom.js";
import { normalizeLight } from "../lib/furniture.js";

export const FORMAT = "myarch";
export const FORMAT_VERSION = 1;

// Item collections that live on a level (openings ride on their wall).
export const LEVEL_COLLECTIONS = ["walls", "rooms", "columns", "stairs", "furniture", "roofs", "solids", "dimensions", "texts", "drawings", "underlays"];
export const COLLECTIONS = [...LEVEL_COLLECTIONS.slice(0, 1), "openings", ...LEVEL_COLLECTIONS.slice(1)];

export const DEFAULTS = {
  wallThickness: 200,
  wallHeight: 2800,
  doorWidth: 900,
  doorHeight: 2100,
  windowWidth: 1200,
  windowHeight: 1200,
  windowSill: 900,
  slab: 200,
  columnSize: 400,
  stairWidth: 1000,
  textSize: 300,
};

// Wall types (BIM): a layered build-up from the outside (left of the wall
// line) to the inside. A wall with a type takes its thickness from the layers.
export const DEFAULT_WALL_TYPES = [
  { id: "ext-brick-300", name: "Exterior brick cavity 300", exterior: true, layers: [{ material: "brick", thickness: 100, function: "finish" }, { material: "insulation", thickness: 80, function: "insulation" }, { material: "concrete", thickness: 100, function: "structure" }, { material: "plaster", thickness: 20, function: "finish" }] },
  { id: "ext-render-250", name: "Exterior rendered 250", exterior: true, layers: [{ material: "plaster", thickness: 20, function: "finish" }, { material: "insulation", thickness: 60, function: "insulation" }, { material: "concrete", thickness: 150, function: "structure" }, { material: "plaster", thickness: 20, function: "finish" }] },
  { id: "ext-wood-200", name: "Exterior timber frame 200", exterior: true, layers: [{ material: "wood-cladding", thickness: 25, function: "finish" }, { material: "insulation", thickness: 150, function: "structure" }, { material: "plaster", thickness: 25, function: "finish" }] },
  { id: "int-block-150", name: "Interior block 150", exterior: false, layers: [{ material: "plaster", thickness: 15, function: "finish" }, { material: "concrete", thickness: 120, function: "structure" }, { material: "plaster", thickness: 15, function: "finish" }] },
  { id: "int-drywall-100", name: "Interior drywall 100", exterior: false, layers: [{ material: "paint-white", thickness: 13, function: "finish" }, { material: "insulation", thickness: 74, function: "structure" }, { material: "paint-white", thickness: 13, function: "finish" }] },
  { id: "concrete-200", name: "Concrete 200", exterior: false, layers: [{ material: "concrete", thickness: 200, function: "structure" }] },
];

export const PHASES = ["existing", "new", "demolish"];

// Unit prices for the cost estimate (per m² of wall face or floor, per item).
export const DEFAULT_COSTS = {
  currency: "KRW", wall: 120000, floor: 80000, roof: 150000, door: 450000, window: 380000, opening: 100000, stair: 2500000, column: 300000, furniture: 0,
};

export function newLevel(name = "1F", elevation = 0, height = DEFAULTS.wallHeight) {
  return { id: uid("lv"), name, elevation, height, slab: DEFAULTS.slab };
}

export function newProject(title = "Untitled") {
  const level = newLevel("1F", 0);
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { title, author: "", company: "", client: "", address: "", rev: "A", date: new Date().toISOString().slice(0, 10), comment: "", scale: 100, north: 0, latitude: 37.57, longitude: 126.98, timezone: 9 },
    defaults: { ...DEFAULTS },
    levels: [level],
    wallTypes: DEFAULT_WALL_TYPES.map((wt) => JSON.parse(JSON.stringify(wt))),
    grids: [],
    costs: { ...DEFAULT_COSTS },
    layers: [{ id: "0", name: "0", color: "#9aa4b5", visible: true }],
    walls: [],
    openings: [],
    rooms: [],
    columns: [],
    stairs: [],
    furniture: [],
    roofs: [],
    dimensions: [],
    texts: [],
    drawings: [],
    underlays: [],
    models: [],
    solids: [],
    scenes: [],
    view: { level: level.id },
  };
}

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);

// Fill in defaults, ids and missing collections; drop items whose level is gone.
export function normalizeProject(p) {
  const base = newProject();
  const out = p && typeof p === "object" ? p : base;
  out.format = FORMAT;
  out.version = FORMAT_VERSION;
  out.meta = { ...base.meta, ...(out.meta || {}) };
  out.defaults = { ...DEFAULTS, ...(out.defaults || {}) };
  if (!Array.isArray(out.levels) || !out.levels.length) out.levels = base.levels;
  for (const l of out.levels) {
    l.id = l.id || uid("lv");
    l.name = String(l.name ?? "");
    l.elevation = num(l.elevation, 0);
    l.height = Math.max(100, num(l.height, DEFAULTS.wallHeight));
    l.slab = Math.max(0, num(l.slab, DEFAULTS.slab));
  }
  out.levels.sort((a, b) => a.elevation - b.elevation);
  if (!Array.isArray(out.layers) || !out.layers.length) out.layers = base.layers;
  for (const k of [...COLLECTIONS, "models", "grids"]) if (!Array.isArray(out[k])) out[k] = [];
  if (!Array.isArray(out.wallTypes)) out.wallTypes = base.wallTypes;
  for (const wt of out.wallTypes) {
    wt.id = wt.id || uid("wt");
    wt.name = String(wt.name ?? wt.id);
    wt.layers = (Array.isArray(wt.layers) ? wt.layers : []).map((l) => ({ material: l.material || "concrete", thickness: Math.max(1, num(l.thickness, 100)), function: l.function || "structure" }));
    if (!wt.layers.length) wt.layers = [{ material: "concrete", thickness: 200, function: "structure" }];
  }
  out.costs = { ...DEFAULT_COSTS, ...(out.costs || {}) };
  for (const g of out.grids) { g.id = g.id || uid("g"); for (const k of ["x1", "y1", "x2", "y2"]) g[k] = num(g[k], 0); g.label = String(g.label ?? ""); }
  // BIM data on every element: phase, classification and free properties.
  for (const k of COLLECTIONS) {
    for (const it of out[k]) {
      if (!PHASES.includes(it.phase)) it.phase = "new";
      if (it.props && typeof it.props !== "object") it.props = {};
    }
  }
  const levelIds = new Set(out.levels.map((l) => l.id));
  const first = out.levels[0].id;
  for (const k of LEVEL_COLLECTIONS) {
    for (const it of out[k]) {
      it.id = it.id || uid(k[0]);
      if (!levelIds.has(it.level)) it.level = first;
    }
  }
  const typeById = new Map(out.wallTypes.map((wt) => [wt.id, wt]));
  for (const w of out.walls) {
    for (const k of ["x1", "y1", "x2", "y2"]) w[k] = num(w[k], 0);
    w.thickness = Math.max(10, num(w.thickness, out.defaults.wallThickness));
    // A typed wall is as thick as its layers.
    if (w.type && typeById.has(w.type)) w.thickness = wallTypeThickness(typeById.get(w.type));
    else if (w.type) delete w.type;
    // null = the level's height.
    w.height = Number.isFinite(+w.height) && w.height !== null && w.height !== "" && +w.height > 0 ? Math.max(100, +w.height) : null;
  }
  const wallIds = new Set(out.walls.map((w) => w.id));
  out.openings = out.openings.filter((o) => wallIds.has(o.wall));
  for (const o of out.openings) {
    o.id = o.id || uid("o");
    o.kind = o.kind === "window" ? "window" : o.kind === "opening" ? "opening" : "door";
    o.width = Math.max(100, num(o.width, o.kind === "window" ? out.defaults.windowWidth : out.defaults.doorWidth));
    o.height = Math.max(100, num(o.height, o.kind === "window" ? out.defaults.windowHeight : out.defaults.doorHeight));
    o.sill = Math.max(0, num(o.sill, o.kind === "window" ? out.defaults.windowSill : 0));
    o.at = num(o.at, 0);
    o.hinge = o.hinge === "end" ? "end" : "start";
    o.side = o.side === -1 ? -1 : 1;
    o.type = o.type || (o.kind === "window" ? "casement" : "single");
  }
  for (const r of out.rooms) {
    r.pts = Array.isArray(r.pts) ? r.pts.filter((q) => Array.isArray(q) && q.length >= 2).map((q) => [num(q[0], 0), num(q[1], 0)]) : [];
    r.name = String(r.name ?? "");
  }
  out.rooms = out.rooms.filter((r) => r.pts.length >= 3);
  for (const f of out.furniture) {
    f.rot = num(f.rot, 0);
    f.w = Math.max(10, num(f.w, 600));
    f.d = Math.max(10, num(f.d, 600));
    f.h = Math.max(1, num(f.h, 750));
    f.elevation = num(f.elevation, 0);
    normalizeLight(f); // lamps: on/off, lumens, colour, beam
  }
  for (const s of out.stairs) {
    s.rot = num(s.rot, 0);
    s.width = Math.max(300, num(s.width, out.defaults.stairWidth));
    s.length = Math.max(300, num(s.length, 3000));
    s.steps = Math.max(2, Math.round(num(s.steps, 16)));
  }
  for (const c of out.columns) { c.w = Math.max(20, num(c.w, out.defaults.columnSize)); c.d = Math.max(20, num(c.d, c.w)); c.rot = num(c.rot, 0); c.shape = c.shape === "round" ? "round" : "rect"; }
  for (const r of out.roofs) {
    r.pts = Array.isArray(r.pts) ? r.pts.map((q) => [num(q[0], 0), num(q[1], 0)]) : [];
    r.kind = ["flat", "gable", "hip", "shed"].includes(r.kind) ? r.kind : "gable";
    r.pitch = Math.max(0, Math.min(75, num(r.pitch, 30)));
    r.overhang = Math.max(0, num(r.overhang, 400));
    r.thickness = Math.max(20, num(r.thickness, 200));
  }
  out.roofs = out.roofs.filter((r) => r.pts.length >= 3);
  // Mass models (SketchUp-style push/pull solids): a plan shape extruded
  // from z0 by height above the level floor, optionally tapered to the top.
  for (const s of out.solids) {
    s.pts = Array.isArray(s.pts) ? s.pts.map((q) => [num(q[0], 0), num(q[1], 0)]) : [];
    s.z0 = num(s.z0, 0);
    s.height = Math.max(1, num(s.height, 3000));
    s.taper = Math.max(0, Math.min(1, num(s.taper, 1)));
    s.material = s.material || "concrete";
  }
  out.solids = out.solids.filter((s) => s.pts.length >= 3);
  if (!Array.isArray(out.scenes)) out.scenes = [];
  for (const d of out.drawings) { d.layer = d.layer || "0"; d.kind = d.kind || "polyline"; }
  for (const tx of out.texts) { tx.size = Math.max(10, num(tx.size, out.defaults.textSize)); tx.rot = num(tx.rot, 0); tx.text = String(tx.text ?? ""); }
  const layerIds = new Set(out.layers.map((l) => l.id));
  for (const d of out.drawings) if (!layerIds.has(d.layer)) { out.layers.push({ id: d.layer, name: d.layer, color: "#9aa4b5", visible: true }); layerIds.add(d.layer); }
  out.view = { ...(out.view || {}) };
  if (!levelIds.has(out.view.level)) out.view.level = first;
  return out;
}

export function parseProject(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("not a project file");
  if (data.format && data.format !== FORMAT) throw new Error(`unknown format "${data.format}"`);
  if (!data.levels && !data.walls) throw new Error("not a MyArchitecture project");
  return normalizeProject(data);
}

export function serializeProject(p) {
  return JSON.stringify(p, null, 1);
}

// ---------------------------------------------------------------- accessors
export const levelById = (p, id) => p.levels.find((l) => l.id === id) || null;
export const levelIndex = (p, id) => p.levels.findIndex((l) => l.id === id);
export const onLevel = (list, level) => list.filter((it) => it.level === level);
export const wallById = (p, id) => p.walls.find((w) => w.id === id) || null;
export const openingsOf = (p, wallId) => p.openings.filter((o) => o.wall === wallId);

export function levelOfItem(p, kind, item) {
  if (kind === "openings") { const w = wallById(p, item.wall); return w ? w.level : null; }
  return item.level;
}

export function wallHeight(p, w) {
  const lv = levelById(p, w.level);
  return w.height || (lv ? lv.height : DEFAULTS.wallHeight);
}

export function wallTypeThickness(wt) {
  return wt.layers.reduce((s, l) => s + l.thickness, 0);
}

export const wallTypeOf = (p, w) => (w.type ? (p.wallTypes || []).find((wt) => wt.id === w.type) || null : null);

export function wallLength(w) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

// The level directly above (for stairs, roofs) or null.
export function levelAbove(p, id) {
  const i = levelIndex(p, id);
  return i >= 0 && i + 1 < p.levels.length ? p.levels[i + 1] : null;
}

// Find an item anywhere: → {kind, obj} or null.
export function findItem(p, id) {
  for (const k of COLLECTIONS) {
    const obj = p[k].find((x) => x.id === id);
    if (obj) return { kind: k, obj };
  }
  const g = (p.grids || []).find((x) => x.id === id);
  return g ? { kind: "grids", obj: g } : null;
}

// Sequential tags D01, D02 … / W01 … in plan order (level, then y, then x).
export function openingTags(p) {
  const tags = new Map();
  const order = (o) => {
    const w = wallById(p, o.wall);
    const li = w ? levelIndex(p, w.level) : 0;
    const t = w ? o.at / (wallLength(w) || 1) : 0;
    const x = w ? w.x1 + (w.x2 - w.x1) * t : 0;
    const y = w ? w.y1 + (w.y2 - w.y1) * t : 0;
    return [li, Math.round(y / 100), x];
  };
  for (const kind of ["door", "window", "opening"]) {
    const list = p.openings.filter((o) => o.kind === kind).map((o) => [o, order(o)]);
    list.sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[1][2] - b[1][2]);
    const pre = kind === "door" ? "D" : kind === "window" ? "W" : "O";
    list.forEach(([o], i) => tags.set(o.id, o.tag || `${pre}${String(i + 1).padStart(2, "0")}`));
  }
  return tags;
}
