// SketchUp-style model data on the project (the geometry is src/core/mesh.js,
// the edits src/core/skops.js):
//
//   p.components  [{id, name, mesh, size: [w, d, h], outline, cut, desc}]
//                 component definitions; mesh in local millimetres, origin at
//                 the insertion point (bottom centre when made). An instance
//                 is a furniture item {kind: "component", comp, x, y, rot,
//                 w, d, h, elevation} — scaled by w / size[0] …; one in a
//                 wall is an opening {kind: "opening", comp} (it cuts the hole)
//   p.layers      the tags (SketchUp's "layers"): every item may carry
//                 `layer`; the 3D view hides the tags a scene switches off
//   p.materials   own and edited materials [{id, name, color, src (texture
//                 image, data URL), tile (mm), opacity}]
//   p.sections    section planes [{id, name, o: [x, y, z], n: [x, y, z], active}]
//                 (n points into the part that stays)
//   p.guides      construction lines / points [{id, a: [x, y, z], b?}]
//   p.dims3d      3D dimensions [{id, a, b, off: [x, y, z]}]
//   p.texts3d     3D text [{id, at, text, leader?}]
//   p.style3d     the style: edges, profiles, colours, watermark …
//
// 3D points here are plan millimetres with z measured from 0 (absolute).

import { uid } from "./geom.js";
import { normalizeMesh, meshBounds, footprint, boxMesh } from "./mesh.js";
import { setProjectMaterials } from "../lib/materials.js";

export const STYLE_DEFAULTS = {
  edges: false, edgeColor: "#1d2128", profiles: false, profileWidth: 3, colorByTag: false,
  background: "", sky: "", horizon: "", ground: "", groundOn: true, watermark: "", watermarkPos: "br",
  sectionFill: "#3b4250", fogDensity: 1,
};

const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);
const vec = (a, d = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? [num(a[0], d[0]), num(a[1], d[1]), num(a[2], d[2])] : d.slice());
const hex = (c, d) => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : d);

// Bring the definition's size and plan outline in line with its mesh.
export function syncDefinition(def) {
  const b = meshBounds(def.mesh);
  def.size = [Math.max(1, b.x2 - b.x1), Math.max(1, b.y2 - b.y1), Math.max(1, b.z2 - b.z1)];
  const ring = def.mesh.f.length ? footprint(def.mesh) : [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]];
  def.outline = ring.map(([x, y]) => [+(x / def.size[0]).toFixed(4), +(y / def.size[1]).toFixed(4)]);
  return def;
}

// A mass model that has a mesh: its plan footprint, base and height follow it.
export function syncMeshSolid(s) {
  if (!s.mesh) return s;
  const m = normalizeMesh(s.mesh);
  if (!m) { delete s.mesh; return s; }
  s.mesh = m;
  const b = meshBounds(m);
  const big = m.f.length > 1500 || s.terrain;
  const ring = big ? [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]] : footprint(m);
  s.pts = ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  s.z0 = Math.round(b.z1 * 10) / 10;
  s.height = Math.max(1, Math.round((b.z2 - b.z1) * 10) / 10);
  s.taper = 1;
  return s;
}

export function normalizeSketchup(p) {
  p.components = (Array.isArray(p.components) ? p.components : []).filter((c) => c && typeof c === "object");
  for (const c of p.components) {
    c.id = c.id || uid("cd");
    c.name = String(c.name ?? "Component");
    c.mesh = normalizeMesh(c.mesh) || boxMesh(-500, -500, 0, 1000, 1000, 1000);
    c.cut = !!c.cut;
    syncDefinition(c);
  }
  p.materials = (Array.isArray(p.materials) ? p.materials : []).filter((m) => m && typeof m === "object" && m.id);
  for (const m of p.materials) {
    m.id = String(m.id);
    m.name = String(m.name ?? m.id);
    m.color = hex(m.color, "#cccccc");
    m.tile = Math.max(10, Math.min(1e5, num(m.tile, 1000)));
    m.opacity = Math.max(0.05, Math.min(1, num(m.opacity, 1)));
    if (m.src !== undefined && typeof m.src !== "string") delete m.src;
  }
  setProjectMaterials(p.materials);
  p.sections = (Array.isArray(p.sections) ? p.sections : []).filter((s) => s && typeof s === "object");
  let active = false;
  for (const s of p.sections) {
    s.id = s.id || uid("sp");
    s.name = String(s.name ?? "Section");
    s.o = vec(s.o);
    const n = vec(s.n, [0, 0, -1]);
    const l = Math.hypot(...n) || 1;
    s.n = n.map((x) => x / l);
    if (Math.hypot(...s.n) < 0.5) s.n = [0, 0, -1];
    s.active = !!s.active && !active;
    if (s.active) active = true;
  }
  p.guides = (Array.isArray(p.guides) ? p.guides : []).filter((g) => g && Array.isArray(g.a)).map((g) => ({ id: g.id || uid("gl"), a: vec(g.a), ...(Array.isArray(g.b) ? { b: vec(g.b) } : {}) }));
  p.dims3d = (Array.isArray(p.dims3d) ? p.dims3d : []).filter((d) => d && Array.isArray(d.a) && Array.isArray(d.b)).map((d) => ({ ...d, id: d.id || uid("d3"), a: vec(d.a), b: vec(d.b), off: vec(d.off) }));
  p.texts3d = (Array.isArray(p.texts3d) ? p.texts3d : []).filter((x) => x && Array.isArray(x.at)).map((x) => ({ ...x, id: x.id || uid("t3"), at: vec(x.at), text: String(x.text ?? ""), ...(Array.isArray(x.leader) ? { leader: vec(x.leader) } : {}) }));
  const st = p.style3d && typeof p.style3d === "object" ? p.style3d : {};
  p.style3d = { ...STYLE_DEFAULTS, ...st };
  for (const k of ["edgeColor", "sectionFill"]) p.style3d[k] = hex(p.style3d[k], STYLE_DEFAULTS[k]);
  for (const k of ["background", "sky", "horizon", "ground"]) p.style3d[k] = p.style3d[k] ? hex(p.style3d[k], "") : "";
  p.style3d.profileWidth = Math.max(1, Math.min(12, num(p.style3d.profileWidth, 3)));
  p.style3d.fogDensity = Math.max(0.1, Math.min(5, num(p.style3d.fogDensity, 1)));
  p.style3d.watermark = String(p.style3d.watermark || "");
  if (!["tl", "tr", "bl", "br", "c"].includes(p.style3d.watermarkPos)) p.style3d.watermarkPos = "br";
  // (Mass models with a mesh are synced by normalizeProject: syncMeshSolid.)
  // Tags: an item's tag must exist.
  const tags = new Set((p.layers || []).map((l) => l.id));
  for (const k of ["walls", "openings", "rooms", "columns", "stairs", "furniture", "roofs", "solids"]) {
    for (const it of p[k] || []) if (it.layer !== undefined && !tags.has(it.layer)) delete it.layer;
  }
  // Component instances whose definition is gone fall back to a box.
  const defs = new Set(p.components.map((c) => c.id));
  for (const f of p.furniture || []) if (f.kind === "component" && !defs.has(f.comp)) { f.kind = "box"; delete f.comp; }
  for (const o of p.openings || []) if (o.comp && !defs.has(o.comp)) delete o.comp;
  return p;
}

export const componentById = (p, id) => (p.components || []).find((c) => c.id === id) || null;
export const isInstance = (f) => !!f && f.kind === "component" && !!f.comp;
export const instancesOf = (p, defId) => [...(p.furniture || []).filter((f) => f.kind === "component" && f.comp === defId), ...(p.openings || []).filter((o) => o.comp === defId)];

// The tag (layer id) of an item; "0" when it has none.
export const tagOf = (it) => (it && it.layer) || "0";

// Scale of an instance against its definition.
export function instanceScale(def, f) {
  const s = def.size;
  return [(f.w || s[0]) / s[0], (f.d || s[1]) / s[1], (f.h || s[2]) / s[2]];
}
