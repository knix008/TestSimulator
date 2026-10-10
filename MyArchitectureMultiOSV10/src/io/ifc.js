// IFC exchange (Industry Foundation Classes, ISO 16739) in the STEP physical
// file format (ISO 10303-21): export the project as IFC4 or IFC2X3, read IFC
// files back into a project.
//
// Frames: plan millimetres have y down the screen with north up; IFC is z-up
// with y pointing north, so plan (x, y, z) ↔ IFC (x, −y, z). The exported file
// is in millimetres. Each storey is placed at its elevation; a wall's own frame
// starts at (x1, y1) with local x along the centre line, its openings sit at
// (at, 0, sill) in that frame and the door / window fills its opening's frame.
//
// The reader parses any STEP text into a Map of entities, resolves placements
// (IfcLocalPlacement chains, mapped items) into 3×4 affine matrices and turns
// the building elements it understands into plan items; everything else is
// counted and summarised in the warnings.

import { uid, polygonArea, polygonCentroid, orientedRect, rotPt, offsetPolygon, closestOnSegment } from "../core/geom.js";
import { newProject, normalizeProject, wallHeight, levelAbove, openingTags, wallTypeOf, wallTypeThickness, PHASES } from "../core/project.js";
import { wallOutlines, wallFrame } from "../core/walls.js";
import { roofModel, roofBase } from "../core/roof.js";
import { graphFaces } from "../core/rooms.js";
import { furnitureDef } from "../lib/furniture.js";

const DOOR_TYPES = ["single", "double", "sliding", "garage"];
const WINDOW_TYPES = ["casement", "fixed", "sliding"];

// ================================================================ STEP writing

// A pre-encoded STEP token (reference, enumeration, integer, typed value …).
class Raw {
  constructor(s) { this.s = s; }
}
const raw = (s) => new Raw(s);
const E = (name) => raw(`.${name}.`);
const STAR = raw("*");
const int = (n) => raw(String(Math.round(n)));
const typed = (type, v) => raw(`${type}(${enc(v)})`);

// STEP REAL: always with a decimal point ("0.", "2.5", "1.E-07").
function real(x) {
  const r = Math.round((Number.isFinite(x) ? x : 0) * 1e6) / 1e6;
  if (r === 0) return "0.";
  let s = String(r);
  if (s.includes("e")) {
    const [m, e] = s.split("e");
    s = `${m.includes(".") ? m : `${m}.`}E${e}`;
  } else if (!s.includes(".")) s += ".";
  return s;
}

// STEP string literal: '' and \\ escapes, everything outside printable ASCII
// as \X2\…\X0\ (UTF-16 code units in upper-case hex).
export function stepString(value) {
  const str = String(value ?? "");
  let out = "'";
  let i = 0;
  while (i < str.length) {
    const c = str.charCodeAt(i);
    if (c >= 0x20 && c < 0x7f) {
      out += c === 39 ? "''" : c === 92 ? "\\\\" : str[i];
      i++;
      continue;
    }
    let hex = "";
    while (i < str.length) {
      const d = str.charCodeAt(i);
      if (d >= 0x20 && d < 0x7f) break;
      hex += d.toString(16).toUpperCase().padStart(4, "0");
      i++;
    }
    out += `\\X2\\${hex}\\X0\\`;
  }
  return `${out}'`;
}

function enc(v) {
  if (v === null || v === undefined) return "$";
  if (v instanceof Raw) return v.s;
  if (typeof v === "number") return real(v);
  if (typeof v === "boolean") return v ? ".T." : ".F.";
  if (typeof v === "string") return stepString(v);
  if (Array.isArray(v)) return `(${v.map(enc).join(",")})`;
  throw new TypeError(`cannot encode ${typeof v} as STEP`);
}

class StepWriter {
  constructor() {
    this.lines = [];
    this.cache = new Map();
  }

  add(type, args) {
    this.lines.push(`#${this.lines.length + 1}=${type}(${args.map(enc).join(",")});`);
    return raw(`#${this.lines.length}`);
  }

  once(key, make) {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key);
  }
}

// ---------------------------------------------------------------- GlobalIds
const GUID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

// cyrb128: a fast, well-mixed 128-bit string hash.
function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1, h2, h3, h4];
}

// Deterministic IFC GlobalId: a version-4 style UUID hashed from `key`,
// compressed to 22 characters (2 for the first byte, 4 per following 3 bytes).
export function ifcGuid(key) {
  const bytes = [];
  for (const h of hash128(String(key))) bytes.push((h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  let s = GUID_CHARS[bytes[0] >> 6] + GUID_CHARS[bytes[0] & 63];
  for (let i = 1; i < 16; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += GUID_CHARS[(n >> 18) & 63] + GUID_CHARS[(n >> 12) & 63] + GUID_CHARS[(n >> 6) & 63] + GUID_CHARS[n & 63];
  }
  return s;
}

function stepTime(ts) {
  let d;
  if (ts instanceof Date) d = ts;
  else if (typeof ts === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(ts)) d = new Date(`${ts}Z`);
  else if (ts !== undefined && ts !== null) d = new Date(ts);
  else d = new Date();
  if (Number.isNaN(d.getTime())) d = new Date(0);
  return { iso: d.toISOString().slice(0, 19), unix: Math.floor(d.getTime() / 1000) };
}

// ---------------------------------------------------------------- small vector helpers
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Newell normal of a 3D polygon (length = twice the area).
function newell(pts) {
  const n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

const ccw = (pts) => (polygonArea(pts) < 0 ? pts.slice().reverse() : pts);
const toIfc2 = ([x, y]) => [x, -y];
// IFC local x axis for a plan rotation (degrees; the y flip reverses the sense).
const xAxisFor = (rot) => [Math.cos(((rot || 0) * Math.PI) / 180), -Math.sin(((rot || 0) * Math.PI) / 180), 0];

const FURNITURE_TYPES = {
  chair: "CHAIR", officeChair: "CHAIR", barStool: "CHAIR", armchair: "CHAIR",
  diningTable4: "TABLE", diningTable6: "TABLE", roundTable: "TABLE", coffeeTable: "TABLE", sideTable: "TABLE", meetingTable: "TABLE",
  desk: "DESK", officeDesk: "DESK", doubleBed: "BED", singleBed: "BED", bunkBed: "BED",
  filing: "FILECABINET", bookshelf: "SHELF", sofa2: "SOFA", sofa3: "SOFA",
};

const ROOF_TYPES = { flat: "FLAT_ROOF", gable: "GABLE_ROOF", hip: "HIP_ROOF", shed: "SHED_ROOF" };

const LAYER_FUNCTIONS = ["finish", "insulation", "structure", "air"];
const DEFAULT_CLASSIFICATION = "Uniclass 2015";
// Property sets this program writes or reads itself (not copied into props).
const OWN_PSETS = new Set(["MyArchitecture_BIM", "MyArchitecture_Properties", "MyArchitecture_Roof", "MyArchitecture_Mass"]);
const STATUS_PHASE = { NEW: "new", EXISTING: "existing", DEMOLISH: "demolish" };

const ifcBool = (b) => typed("IFCBOOLEAN", raw(b ? ".T." : ".F."));

// A free property value as an IFC measure: label/text, real or boolean.
function propValue(v) {
  if (typeof v === "boolean") return ifcBool(v);
  if (typeof v === "number" && Number.isFinite(v)) return typed("IFCREAL", v);
  const s = String(v ?? "");
  return typed(s.length > 255 ? "IFCTEXT" : "IFCLABEL", s);
}

// Decimal degrees → IfcCompoundPlaneAngleMeasure (deg, min, s, millionths of s).
function compoundAngle(v) {
  if (v === null || v === undefined || v === "" || !Number.isFinite(+v)) return null;
  const sign = +v < 0 ? -1 : 1;
  let us = Math.round(Math.abs(+v) * 3600e6);
  const d = Math.floor(us / 3600e6);
  us -= d * 3600e6;
  const m = Math.floor(us / 60e6);
  us -= m * 60e6;
  const s = Math.floor(us / 1e6);
  us -= s * 1e6;
  return [d, m, s, us].map((x) => int(sign * x));
}

// RGB (0..1) and transparency per element category.
const STYLES = {
  wall: { name: "Wall", rgb: [0.86, 0.85, 0.83], transparency: 0 },
  slab: { name: "Floor", rgb: [0.77, 0.6, 0.42], transparency: 0 },
  roof: { name: "Roof", rgb: [0.61, 0.29, 0.23], transparency: 0 },
  window: { name: "Glass", rgb: [0.66, 0.83, 0.91], transparency: 0.6 },
  door: { name: "Door", rgb: [0.69, 0.51, 0.35], transparency: 0 },
  furniture: { name: "Furniture", rgb: [0.6, 0.62, 0.65], transparency: 0 },
  column: { name: "Concrete", rgb: [0.65, 0.65, 0.64], transparency: 0 },
  stair: { name: "Stair", rgb: [0.77, 0.6, 0.42], transparency: 0 },
  mass: { name: "Mass", rgb: [0.78, 0.8, 0.83], transparency: 0 },
};

function doorOperation(o) {
  if (o.type === "double") return "DOUBLE_DOOR_SINGLE_SWING";
  if (o.type === "sliding") return "SLIDING_TO_LEFT";
  if (o.type === "garage") return "ROLLINGUP";
  return o.hinge === "end" ? "SINGLE_SWING_RIGHT" : "SINGLE_SWING_LEFT";
}

// ================================================================ export
class IfcExporter {
  constructor(p, opts) {
    this.p = p;
    this.v4 = opts.schema !== "IFC2X3";
    this.opts = opts;
    this.w = new StepWriter();
    this.seed = p.levels.map((l) => l.id).join("|");
    this.guids = new Set();
    this.contained = new Map(); // level id → [element refs]
    this.psets = new Map(); // content key → {name, props, objects}
    this.classes = new Map(); // classification code → [element refs]
    this.groups = new Map(); // group id → [element refs]
    this.typed = new Map(); // wall type id → {type, set, t, walls}
    this.untyped = new Map(); // thickness → {t, walls}
  }

  add(type, args) { return this.w.add(type, args); }

  guid(key) {
    let k = String(key);
    let g = ifcGuid(k);
    while (this.guids.has(g)) { k += "'"; g = ifcGuid(k); }
    this.guids.add(g);
    return g;
  }

  // A key for things that are not plan items (project, rels, styles …).
  sguid(key) { return this.guid(`${this.seed}/${key}`); }

  // -------------------------------------------------------------- geometry resources
  pt(c) {
    const key = c.map(real).join(",");
    return this.w.once(`p:${key}`, () => this.add("IFCCARTESIANPOINT", [c]));
  }

  dir(d) {
    const l = Math.hypot(...d) || 1;
    const c = d.map((x) => Math.round((x / l) * 1e9) / 1e9);
    return this.w.once(`d:${c.map(real).join(",")}`, () => this.add("IFCDIRECTION", [c]));
  }

  place3(loc = [0, 0, 0], axis = null, ref = null) {
    const key = `a3:${loc.map(real)}:${axis || ""}:${ref ? ref.map(real) : ""}`;
    return this.w.once(key, () => this.add("IFCAXIS2PLACEMENT3D", [this.pt(loc), axis ? this.dir(axis) : null, ref ? this.dir(ref) : null]));
  }

  place2() {
    return this.w.once("a2:origin", () => this.add("IFCAXIS2PLACEMENT2D", [this.pt([0, 0]), null]));
  }

  local(rel, loc = [0, 0, 0], xAxis = null) {
    const turned = xAxis && (Math.abs(xAxis[0] - 1) > 1e-9 || Math.abs(xAxis[1]) > 1e-9);
    return this.add("IFCLOCALPLACEMENT", [rel, turned ? this.place3(loc, [0, 0, 1], xAxis) : this.place3(loc)]);
  }

  rectProfile(x, y) { return this.add("IFCRECTANGLEPROFILEDEF", [E("AREA"), null, this.place2(), x, y]); }

  circleProfile(r) { return this.add("IFCCIRCLEPROFILEDEF", [E("AREA"), null, this.place2(), r]); }

  ellipseProfile(a, b) { return this.add("IFCELLIPSEPROFILEDEF", [E("AREA"), null, this.place2(), a, b]); }

  polyProfile(pts) {
    const ring = ccw(pts);
    const line = this.add("IFCPOLYLINE", [[...ring, ring[0]].map((q) => this.pt([q[0], q[1]]))]);
    return this.add("IFCARBITRARYCLOSEDPROFILEDEF", [E("AREA"), null, line]);
  }

  extrude(profile, depth, position = null) {
    return this.add("IFCEXTRUDEDAREASOLID", [profile, position || this.place3(), this.dir([0, 0, 1]), depth]);
  }

  face(pts) {
    const loop = this.add("IFCPOLYLOOP", [pts.map((q) => this.pt(q))]);
    return this.add("IFCFACE", [[this.add("IFCFACEOUTERBOUND", [loop, true])]]);
  }

  // Closed faceted solid between a planar polygon `top` and the same polygon
  // moved by `shift`; faces are wound with outward normals.
  brepPrism(top, shift) {
    let ring = top;
    if (dot3(newell(ring), shift) > 0) ring = ring.slice().reverse();
    const bot = ring.map((q) => add3(q, shift));
    const faces = [this.face(ring), this.face(bot.slice().reverse())];
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      faces.push(this.face([bot[i], bot[j], ring[j], ring[i]]));
    }
    return this.add("IFCFACETEDBREP", [this.add("IFCCLOSEDSHELL", [faces])]);
  }

  // -------------------------------------------------------------- representations
  style(item, key) {
    const st = this.w.once(`style:${key}`, () => {
      const s = STYLES[key];
      const colour = this.add("IFCCOLOURRGB", [s.name, ...s.rgb]);
      const rendering = this.add("IFCSURFACESTYLERENDERING", [colour, s.transparency, null, null, null, null, null, null, E("NOTDEFINED")]);
      const surface = this.add("IFCSURFACESTYLE", [s.name, E("BOTH"), [rendering]]);
      return this.v4 ? surface : this.add("IFCPRESENTATIONSTYLEASSIGNMENT", [[surface]]);
    });
    this.add("IFCSTYLEDITEM", [item, [st], null]);
    return item;
  }

  body(items, type = "SweptSolid") {
    return this.add("IFCSHAPEREPRESENTATION", [this.ctxBody, "Body", type, items]);
  }

  shape(reps) { return this.add("IFCPRODUCTDEFINITIONSHAPE", [null, null, reps]); }

  // An IfcProduct with the 8 common attributes plus `extra`.
  product(type, key, { name = null, description = null, objectType = null, placement = null, shape = null, tag = null } = {}, extra = []) {
    return this.add(type, [this.guid(key), this.oh, name, description, objectType, placement, shape, tag, ...extra]);
  }

  contain(levelId, ref) {
    if (!this.contained.has(levelId)) this.contained.set(levelId, []);
    this.contained.get(levelId).push(ref);
  }

  aggregate(key, whole, parts) {
    if (parts.length) this.add("IFCRELAGGREGATES", [this.sguid(key), this.oh, null, null, whole, parts]);
  }

  propertyList(props) {
    return props.map(([n, v, kind]) => (kind === "enum"
      ? this.add("IFCPROPERTYENUMERATEDVALUE", [n, null, [v], null])
      : this.add("IFCPROPERTYSINGLEVALUE", [n, null, v, null])));
  }

  // Attach a property set to an element. Elements with identical sets share
  // one IfcPropertySet. props: [[name, value]] or [[name, value, "enum"]].
  addPset(ref, name, props) {
    if (!props.length) return;
    const key = `${name}|${props.map(([n, v, kind]) => `${n}${kind ? "~" : "="}${enc(v)}`).join("|")}`;
    if (!this.psets.has(key)) this.psets.set(key, { name, props, objects: [] });
    this.psets.get(key).objects.push(ref);
  }

  // BIM data of a plan item: the common Pset (with IFC4 Status), phase and
  // department, free properties and the classification code.
  bim(ref, item, common = null, commonProps = []) {
    const phase = PHASES.includes(item.phase) ? item.phase : "new";
    const own = [...commonProps];
    if (this.v4 && common) own.push(["Status", typed("IFCLABEL", phase.toUpperCase()), "enum"]);
    if (common) this.addPset(ref, common, own);
    const data = [["Phase", typed("IFCLABEL", phase)]];
    if (item.department) data.push(["Department", typed("IFCLABEL", String(item.department))]);
    this.addPset(ref, "MyArchitecture_BIM", data);
    const props = item.props && typeof item.props === "object" ? Object.entries(item.props) : [];
    this.addPset(ref, "MyArchitecture_Properties", props.filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => [k, propValue(v)]));
    if (item.group) {
      const g = String(item.group);
      if (!this.groups.has(g)) this.groups.set(g, []);
      this.groups.get(g).push(ref);
    }
    if (item.classification) {
      const code = String(item.classification);
      if (!this.classes.has(code)) this.classes.set(code, []);
      this.classes.get(code).push(ref);
    }
  }

  flushPsets() {
    for (const [key, { name, props, objects }] of this.psets) {
      const set = this.add("IFCPROPERTYSET", [this.sguid(`pset:${key}`), this.oh, name, null, this.propertyList(props)]);
      this.add("IFCRELDEFINESBYPROPERTIES", [this.sguid(`rdp:${key}`), this.oh, null, null, objects, set]);
    }
  }

  flushGroups() {
    for (const [g, objects] of this.groups) {
      const group = this.add("IFCGROUP", [this.sguid(`group:${g}`), this.oh, g, null, null]);
      this.add("IFCRELASSIGNSTOGROUP", [this.sguid(`assigns:${g}`), this.oh, null, null, objects, null, group]);
    }
  }

  flushClassifications() {
    if (!this.classes.size) return;
    const system = this.p.meta.classificationSystem || DEFAULT_CLASSIFICATION;
    const source = this.add("IFCCLASSIFICATION", this.v4 ? [null, null, null, system, null, null, null] : [system, "", null, system]);
    for (const [code, objects] of this.classes) {
      const ref = this.add("IFCCLASSIFICATIONREFERENCE", this.v4 ? [null, code, code, source, null, null] : [null, code, code, source]);
      this.add("IFCRELASSOCIATESCLASSIFICATION", [this.sguid(`class:${code}`), this.oh, code, null, objects, ref]);
    }
  }

  material(name) {
    return this.w.once(`material:${name}`, () => this.add("IFCMATERIAL", this.v4 ? [name, null, null] : [name]));
  }

  // A material layer set (layers listed from the wall's plan left).
  layerSet(name, layers) {
    const list = layers.map((l) => {
      const air = l.function === "air" ? true : null;
      return this.add("IFCMATERIALLAYER", this.v4
        ? [this.material(l.material), l.thickness, air, l.function, null, l.function, null]
        : [this.material(l.material), l.thickness, air]);
    });
    return this.add("IFCMATERIALLAYERSET", this.v4 ? [list, name, null] : [list, name]);
  }

  // The usage placing a layer set on a wall axis: layers run from the wall's
  // −y side (the plan left) to its +y side, centred on the axis.
  layerUsage(set, t) {
    return this.add("IFCMATERIALLAYERSETUSAGE", this.v4 ? [set, E("AXIS2"), E("POSITIVE"), -t / 2, null] : [set, E("AXIS2"), E("POSITIVE"), -t / 2]);
  }

  // IfcWallType per wall type, with its layer set.
  wallTypes() {
    for (const wt of this.p.wallTypes || []) {
      const set = this.layerSet(wt.name, wt.layers);
      const psets = [this.add("IFCPROPERTYSET", [this.guid(`${wt.id}:type-pset`), this.oh, "Pset_WallCommon", null, this.propertyList([["IsExternal", ifcBool(!!wt.exterior)]])])];
      // IFC2X3 layers have no name or category to hold their function.
      if (!this.v4) psets.push(this.add("IFCPROPERTYSET", [this.guid(`${wt.id}:type-bim`), this.oh, "MyArchitecture_BIM", null, this.propertyList([["LayerFunctions", typed("IFCLABEL", wt.layers.map((l) => l.function).join(","))]])]));
      const type = this.add("IFCWALLTYPE", [this.guid(`${wt.id}:type`), this.oh, wt.name, null, null, psets, null, wt.id, null, E("STANDARD")]);
      this.add("IFCRELASSOCIATESMATERIAL", [this.guid(`${wt.id}:type-material`), this.oh, null, null, [type], set]);
      this.typed.set(wt.id, { type, set, t: wallTypeThickness(wt), walls: [] });
    }
  }

  flushWallMaterials() {
    for (const [id, { type, set, t, walls }] of this.typed) {
      if (!walls.length) continue;
      this.add("IFCRELDEFINESBYTYPE", [this.guid(`${id}:defines`), this.oh, null, null, walls, type]);
      this.add("IFCRELASSOCIATESMATERIAL", [this.guid(`${id}:material`), this.oh, null, null, walls, this.layerUsage(set, t)]);
    }
    // Untyped walls: one plain layer, so other tools still read the thickness.
    for (const [tk, { t, walls }] of this.untyped) {
      const set = this.layerSet(`Wall ${Math.round(t)}`, [{ material: "Wall", thickness: t, function: "structure" }]);
      this.add("IFCRELASSOCIATESMATERIAL", [this.sguid(`mat:${tk}`), this.oh, null, null, walls, this.layerUsage(set, t)]);
    }
  }

  // One IfcGrid with an axis per grid line (u: roughly vertical on plan).
  grids() {
    const { p, v4 } = this;
    if (!p.grids || !p.grids.length) return;
    const lv = p.levels.find((l) => Math.abs(l.elevation) < 1e-6) || p.levels[0];
    const curves = [];
    const axis = (g) => {
      const curve = this.add("IFCPOLYLINE", [[this.pt([g.x1, -g.y1]), this.pt([g.x2, -g.y2])]]);
      curves.push(curve);
      return this.add("IFCGRIDAXIS", [g.label || null, curve, true]);
    };
    const upright = (g) => Math.abs(g.y2 - g.y1) >= Math.abs(g.x2 - g.x1);
    const U = p.grids.filter(upright), V = p.grids.filter((g) => !upright(g));
    // IfcGrid needs at least one axis in both lists.
    if (!V.length && U.length > 1) V.push(U.pop());
    if (!U.length && V.length > 1) U.push(V.pop());
    const uAxes = U.map(axis), vAxes = V.map(axis);
    if (!uAxes.length) uAxes.push(...vAxes);
    if (!vAxes.length) vAxes.push(...uAxes);
    const ctxFoot = this.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", ["FootPrint", "Model", STAR, STAR, STAR, STAR, this.ctx, null, E("MODEL_VIEW"), null]);
    const rep = this.add("IFCSHAPEREPRESENTATION", [ctxFoot, "FootPrint", "GeometricCurveSet", [this.add("IFCGEOMETRICCURVESET", [curves])]]);
    const attrs = [this.sguid("grid"), this.oh, "Grid", null, null, this.local(this.storeyPlc.get(lv.id)), this.shape([rep]), uAxes, vAxes, null];
    this.contain(lv.id, this.add("IFCGRID", v4 ? [...attrs, E("NOTDEFINED")] : attrs));
  }

  // -------------------------------------------------------------- the file
  run() {
    const { p, v4, opts } = this;
    const time = stepTime(opts.timestamp);
    this.header(time);
    this.spatial();
    this.wallTypes();
    for (const lv of p.levels) {
      this.walls(lv);
      this.rooms(lv);
      this.columns(lv);
      this.stairs(lv);
      this.roofs(lv);
      this.furniture(lv);
      this.solids(lv);
    }
    this.grids();
    this.flushWallMaterials();
    this.flushPsets();
    this.flushClassifications();
    this.flushGroups();
    for (const lv of p.levels) {
      const list = this.contained.get(lv.id);
      if (list && list.length) this.add("IFCRELCONTAINEDINSPATIALSTRUCTURE", [this.sguid(`contains:${lv.id}`), this.oh, null, null, list, this.storeys.get(lv.id)]);
    }
    const title = p.meta.title || "Untitled";
    const head = [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION((${stepString(v4 ? "ViewDefinition [ReferenceView_V1.2]" : "ViewDefinition [CoordinationView_V2.0]")}),'2;1');`,
      `FILE_NAME(${stepString(`${title}.ifc`)},${stepString(time.iso)},(${stepString(opts.author)}),(${stepString(opts.organization)}),${stepString(opts.application)},${stepString(opts.application)},'');`,
      `FILE_SCHEMA((${stepString(v4 ? "IFC4" : "IFC2X3")}));`,
      "ENDSEC;",
      "DATA;",
    ];
    return [...head, ...this.w.lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  }

  header(time) {
    const { opts } = this;
    const person = this.add("IFCPERSON", [null, opts.author || "Unknown", null, null, null, null, null, null]);
    const org = this.add("IFCORGANIZATION", [null, opts.organization || opts.application, null, null, null]);
    const user = this.add("IFCPERSONANDORGANIZATION", [person, org, null]);
    const devOrg = opts.organization ? org : this.add("IFCORGANIZATION", [null, opts.application, null, null, null]);
    const app = this.add("IFCAPPLICATION", [devOrg, "10.0", opts.application, opts.application]);
    this.oh = this.add("IFCOWNERHISTORY", [user, app, null, E("ADDED"), null, null, null, int(time.unix)]);
  }

  spatial() {
    const { p } = this;
    const north = ((p.meta.north || 0) * Math.PI) / 180;
    const wcs = this.place3();
    const trueNorth = this.add("IFCDIRECTION", [[Math.round(Math.sin(north) * 1e9) / 1e9, Math.round(Math.cos(north) * 1e9) / 1e9]]);
    const ctx = this.add("IFCGEOMETRICREPRESENTATIONCONTEXT", [null, "Model", int(3), 0.01, wcs, trueNorth]);
    this.ctx = ctx;
    this.ctxBody = this.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", ["Body", "Model", STAR, STAR, STAR, STAR, ctx, null, E("MODEL_VIEW"), null]);
    this.ctxAxis = this.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", ["Axis", "Model", STAR, STAR, STAR, STAR, ctx, null, E("GRAPH_VIEW"), null]);
    const units = this.add("IFCUNITASSIGNMENT", [[
      this.add("IFCSIUNIT", [STAR, E("LENGTHUNIT"), E("MILLI"), E("METRE")]),
      this.add("IFCSIUNIT", [STAR, E("AREAUNIT"), null, E("SQUARE_METRE")]),
      this.add("IFCSIUNIT", [STAR, E("VOLUMEUNIT"), null, E("CUBIC_METRE")]),
      this.add("IFCSIUNIT", [STAR, E("PLANEANGLEUNIT"), null, E("RADIAN")]),
    ]]);
    const title = p.meta.title || "Untitled";
    const project = this.add("IFCPROJECT", [this.sguid("project"), this.oh, title, p.meta.comment || null, null, title, null, [ctx], units]);
    const sitePlc = this.local(null);
    const lat = compoundAngle(p.meta.latitude), lon = compoundAngle(p.meta.longitude);
    const site = this.add("IFCSITE", [this.sguid("site"), this.oh, "Site", null, null, sitePlc, null, null, E("ELEMENT"), lat, lon, lat || lon ? 0 : null, null, null]);
    const buildingPlc = this.local(sitePlc);
    const building = this.add("IFCBUILDING", [this.sguid("building"), this.oh, p.meta.title || "Building", null, null, buildingPlc, null, null, E("ELEMENT"), null, null, null]);
    this.aggregate("project-site", project, [site]);
    this.aggregate("site-building", site, [building]);
    this.storeys = new Map();
    this.storeyPlc = new Map();
    for (const lv of p.levels) {
      const plc = this.local(buildingPlc, [0, 0, lv.elevation]);
      const storey = this.add("IFCBUILDINGSTOREY", [this.guid(lv.id), this.oh, lv.name, null, null, plc, null, null, E("ELEMENT"), lv.elevation]);
      this.storeys.set(lv.id, storey);
      this.storeyPlc.set(lv.id, plc);
      // The storey height has no attribute of its own: keep it as a base quantity.
      const q = this.add("IFCQUANTITYLENGTH", this.v4 ? ["GrossHeight", null, null, lv.height, null] : ["GrossHeight", null, null, lv.height]);
      const eq = this.add("IFCELEMENTQUANTITY", [this.sguid(`qto:${lv.id}`), this.oh, this.v4 ? "Qto_BuildingStoreyBaseQuantities" : "BaseQuantities", null, null, [q]]);
      this.add("IFCRELDEFINESBYPROPERTIES", [this.sguid(`qrel:${lv.id}`), this.oh, null, null, [storey], eq]);
    }
    this.aggregate("building-storeys", building, [...this.storeys.values()]);
  }

  // -------------------------------------------------------------- walls and openings
  walls(lv) {
    const { p, v4 } = this;
    const walls = p.walls.filter((w) => w.level === lv.id);
    if (!walls.length) return;
    const outlines = wallOutlines(walls);
    const external = new Set();
    for (const f of graphFaces(walls)) if (f.area < 0) for (const w of f.walls) external.add(w.id);
    const tags = openingTags(p);
    for (const wl of walls) {
      const f = wallFrame(wl);
      const H = wallHeight(p, wl);
      // Wall frame in IFC: origin (x1, −y1), x along the wall, y to its left.
      const X = [f.d[0], -f.d[1]];
      const Y = [-X[1], X[0]];
      const toLocal = ([px, py]) => {
        const dx = px - wl.x1, dy = -(py - wl.y1);
        return [dx * X[0] + dy * X[1], dx * Y[0] + dy * Y[1]];
      };
      const ol = outlines.get(wl.id);
      const t2 = wl.thickness / 2;
      const quad = ol ? ol.poly.map(toLocal) : [[0, -t2], [f.len, -t2], [f.len, t2], [0, t2]];
      const plc = this.local(this.storeyPlc.get(lv.id), [wl.x1, -wl.y1, 0], [X[0], X[1], 0]);
      const axis = this.add("IFCSHAPEREPRESENTATION", [this.ctxAxis, "Axis", "Curve2D", [this.add("IFCPOLYLINE", [[this.pt([0, 0]), this.pt([f.len, 0])]])]]);
      const solid = this.style(this.extrude(this.polyProfile(quad), H), "wall");
      const ref = this.product(v4 ? "IFCWALL" : "IFCWALLSTANDARDCASE", wl.id, { name: wl.name || "Wall", placement: plc, shape: this.shape([this.body([solid]), axis]), tag: wl.id }, v4 ? [E("STANDARD")] : []);
      this.contain(lv.id, ref);
      const wt = wallTypeOf(p, wl);
      if (wt && this.typed.has(wt.id)) this.typed.get(wt.id).walls.push(ref);
      else {
        const tk = real(wl.thickness);
        if (!this.untyped.has(tk)) this.untyped.set(tk, { t: wl.thickness, walls: [] });
        this.untyped.get(tk).walls.push(ref);
      }
      this.bim(ref, wl, "Pset_WallCommon", [["IsExternal", ifcBool(external.has(wl.id))]]);
      for (const o of p.openings.filter((x) => x.wall === wl.id)) this.opening(lv, wl, o, plc, ref, tags.get(o.id));
    }
  }

  opening(lv, wl, o, wallPlc, wallRef, tag) {
    const { v4 } = this;
    const plc = this.local(wallPlc, [o.at, 0, o.sill]);
    const box = this.extrude(this.rectProfile(o.width, wl.thickness + 100), o.height);
    const void_ = this.product("IFCOPENINGELEMENT", `${o.id}:void`, { name: tag || "Opening", placement: plc, shape: this.shape([this.body([box])]) }, v4 ? [E("OPENING")] : []);
    this.add("IFCRELVOIDSELEMENT", [this.guid(`${o.id}:voids`), this.oh, null, null, wallRef, void_]);
    if (o.kind === "opening") { this.bim(void_, o); return; }
    const door = o.kind === "door";
    const leaf = this.style(this.extrude(this.rectProfile(o.width, door ? 40 : 24), o.height), door ? "door" : "window");
    const attrs = { name: tag || (door ? "Door" : "Window"), objectType: o.type || null, placement: this.local(plc), shape: this.shape([this.body([leaf])]), tag: tag || o.id };
    const extra = door
      ? (v4 ? [o.height, o.width, E("DOOR"), E(doorOperation(o)), null] : [o.height, o.width])
      : (v4 ? [o.height, o.width, E("WINDOW"), E(o.type !== "fixed" && o.width > 900 ? "DOUBLE_PANEL_VERTICAL" : "SINGLE_PANEL"), null] : [o.height, o.width]);
    const filler = this.product(door ? "IFCDOOR" : "IFCWINDOW", o.id, attrs, extra);
    this.add("IFCRELFILLSELEMENT", [this.guid(`${o.id}:fills`), this.oh, null, null, void_, filler]);
    this.contain(lv.id, filler);
    this.bim(filler, o, door ? "Pset_DoorCommon" : "Pset_WindowCommon");
  }

  // -------------------------------------------------------------- rooms (spaces + floor slabs)
  rooms(lv) {
    const { p, v4 } = this;
    const spaces = [];
    const slabT = Math.max(20, lv.slab || 0);
    for (const r of p.rooms.filter((x) => x.level === lv.id)) {
      const ring = r.pts.map(toIfc2);
      // Name = room number (the usual IFC convention), LongName = room name.
      const name = r.name || "Space";
      const solid = this.extrude(this.polyProfile(ring), lv.height);
      const space = this.add("IFCSPACE", [this.guid(r.id), this.oh, r.number ? String(r.number) : name, null, null, this.local(this.storeyPlc.get(lv.id)), this.shape([this.body([solid])]), r.name || null, E("ELEMENT"), v4 ? E("SPACE") : E("INTERNAL"), null]);
      spaces.push(space);
      this.bim(space, r, "Pset_SpaceCommon", [["IsExternal", ifcBool(false)]]);
      const slabSolid = this.style(this.extrude(this.polyProfile(ring), slabT, this.place3([0, 0, -slabT])), "slab");
      const slab = this.product("IFCSLAB", `${r.id}:floor`, { name: `Floor ${name}`, placement: this.local(this.storeyPlc.get(lv.id)), shape: this.shape([this.body([slabSolid])]), tag: r.id }, [E("FLOOR")]);
      this.contain(lv.id, slab);
    }
    this.aggregate(`spaces:${lv.id}`, this.storeys.get(lv.id), spaces);
  }

  // -------------------------------------------------------------- columns
  columns(lv) {
    const { p, v4 } = this;
    for (const c of p.columns.filter((x) => x.level === lv.id)) {
      const H = c.height || lv.height;
      const profile = c.shape === "round"
        ? (Math.abs(c.w - c.d) < 0.01 ? this.circleProfile(c.w / 2) : this.ellipseProfile(c.w / 2, c.d / 2))
        : this.rectProfile(c.w, c.d);
      const solid = this.style(this.extrude(profile, H), "column");
      const plc = this.local(this.storeyPlc.get(lv.id), [c.x, -c.y, 0], xAxisFor(c.rot));
      const ref = this.product("IFCCOLUMN", c.id, { name: "Column", objectType: c.shape, placement: plc, shape: this.shape([this.body([solid])]), tag: c.id }, v4 ? [E("COLUMN")] : []);
      this.contain(lv.id, ref);
      this.bim(ref, c, "Pset_ColumnCommon");
    }
  }

  // -------------------------------------------------------------- stairs
  stairs(lv) {
    const { p, v4 } = this;
    for (const s of p.stairs.filter((x) => x.level === lv.id)) {
      const above = levelAbove(p, lv.id);
      const rise = above ? above.elevation - lv.elevation : lv.height;
      const n = s.steps;
      const r = rise / n;
      const run = s.length / n;
      // Side profile (u along the stair, z up) matching the 3D model: one
      // block per step with a flat underside `under` below its tread.
      const under = Math.max(180, r) + 120;
      const u = (i) => -s.length / 2 + i * run;
      const prof = [];
      for (let i = 0; i < n; i++) prof.push([u(i), (i + 1) * r], [u(i + 1), (i + 1) * r]);
      for (let i = n - 1; i >= 0; i--) {
        const b = Math.max(0, (i + 1) * r - under);
        prof.push([u(i + 1), b], [u(i), b]);
      }
      const ring = prof.filter((q, i) => {
        const nx = prof[(i + 1) % prof.length];
        return Math.abs(q[0] - nx[0]) > 1e-6 || Math.abs(q[1] - nx[1]) > 1e-6;
      });
      // Profile plane: local x along the stair, local y up, extruded across the width.
      const position = this.place3([0, s.width / 2, 0], [0, -1, 0], [1, 0, 0]);
      const solid = this.style(this.extrude(this.polyProfile(ring), s.width, position), "stair");
      const plc = this.local(this.storeyPlc.get(lv.id), [s.x, -s.y, 0], xAxisFor(s.rot));
      const stair = this.product("IFCSTAIR", s.id, { name: "Stair", placement: plc, tag: s.id }, [E("STRAIGHT_RUN_STAIR")]);
      const flightAttrs = { name: "Flight", placement: this.local(plc), shape: this.shape([this.body([solid])]) };
      const flight = this.product("IFCSTAIRFLIGHT", `${s.id}:flight`, flightAttrs, v4 ? [int(n), int(n - 1), r, run, E("STRAIGHT")] : [int(n), int(n - 1), r, run]);
      this.aggregate(`stair:${s.id}`, stair, [flight]);
      this.contain(lv.id, stair);
      this.bim(stair, s, "Pset_StairCommon");
    }
  }

  // -------------------------------------------------------------- roofs
  roofs(lv) {
    const { p, v4 } = this;
    const wallT = Math.max(150, ...p.walls.filter((w) => w.level === lv.id).map((w) => w.thickness));
    for (const r of p.roofs.filter((x) => x.level === lv.id)) {
      const th = r.thickness || 200;
      const m = roofModel(r, roofBase(p, r) - lv.elevation);
      const plc = this.local(this.storeyPlc.get(lv.id));
      const roof = this.product("IFCROOF", r.id, { name: "Roof", objectType: r.kind, placement: plc, tag: r.id }, [E(ROOF_TYPES[r.kind] || "NOTDEFINED")]);
      const parts = m.faces.map((face, i) => {
        const item = m.flat
          ? this.extrude(this.polyProfile(face.pts.map(toIfc2)), th, this.place3([0, 0, face.pts[0][2] - th]))
          : this.brepPrism(face.pts.map(([x, y, z]) => [x, -y, z]), [0, 0, -th]);
        this.style(item, "roof");
        const attrs = { name: `Roof face ${i + 1}`, placement: this.local(plc), shape: this.shape([this.body([item], m.flat ? "SweptSolid" : "Brep")]) };
        return this.product("IFCSLAB", `${r.id}:face${i}`, attrs, [E("ROOF")]);
      });
      m.gables.forEach((gb, i) => {
        const pts = gb.pts.map(([x, y, z]) => [x, -y, z]);
        const d = sub3(pts[1], pts[0]);
        const n = norm3([-d[1], d[0], 0]);
        const top = pts.map((q) => add3(q, n.map((c) => (c * wallT) / 2)));
        const item = this.style(this.brepPrism(top, n.map((c) => -c * wallT)), "wall");
        const attrs = { name: "Gable", placement: this.local(plc), shape: this.shape([this.body([item], "Brep")]) };
        parts.push(this.product("IFCBUILDINGELEMENTPROXY", `${r.id}:gable${i}`, attrs, [E(v4 ? "NOTDEFINED" : "ELEMENT")]));
      });
      this.aggregate(`roof:${r.id}`, roof, parts);
      this.contain(lv.id, roof);
      // The parameters behind the faces, so this program can rebuild the roof.
      this.bim(roof, r, "Pset_RoofCommon");
      this.addPset(roof, "MyArchitecture_Roof", [
        ["Kind", typed("IFCLABEL", r.kind)],
        ["Pitch", typed("IFCREAL", r.pitch)],
        ["Overhang", typed("IFCLENGTHMEASURE", r.overhang || 0)],
        ["Thickness", typed("IFCLENGTHMEASURE", th)],
        ["Rotation", typed("IFCREAL", r.rot || 0)],
      ]);
    }
  }

  // -------------------------------------------------------------- mass models
  // A straight prism is an extrusion; a tapered one a faceted Brep whose top
  // is the base scaled about its centroid (a single apex when taper is 0).
  solids(lv) {
    const { p, v4 } = this;
    for (const m of (p.solids || []).filter((x) => x.level === lv.id)) {
      const ring = ccw(m.pts.map(toIfc2));
      const taper = Math.max(0, Math.min(1, m.taper ?? 1));
      let item;
      if (taper >= 1) item = this.extrude(this.polyProfile(ring), m.height, this.place3([0, 0, m.z0 || 0]));
      else {
        const [cx, cy] = polygonCentroid(ring);
        const z0 = m.z0 || 0, z1 = z0 + m.height;
        const bottom = ring.map(([x, y]) => [x, y, z0]);
        const faces = [this.face(bottom.slice().reverse())];
        if (taper <= 0) {
          const apex = [cx, cy, z1];
          for (let i = 0; i < bottom.length; i++) faces.push(this.face([bottom[i], bottom[(i + 1) % bottom.length], apex]));
        } else {
          const top = ring.map(([x, y]) => [cx + (x - cx) * taper, cy + (y - cy) * taper, z1]);
          faces.push(this.face(top));
          for (let i = 0; i < bottom.length; i++) {
            const j = (i + 1) % bottom.length;
            faces.push(this.face([bottom[i], bottom[j], top[j], top[i]]));
          }
        }
        item = this.add("IFCFACETEDBREP", [this.add("IFCCLOSEDSHELL", [faces])]);
      }
      this.style(item, "mass");
      const attrs = { name: m.name || "Mass", objectType: "Mass", placement: this.local(this.storeyPlc.get(lv.id)), shape: this.shape([this.body([item], taper >= 1 ? "SweptSolid" : "Brep")]), tag: m.id };
      const ref = this.product("IFCBUILDINGELEMENTPROXY", m.id, attrs, [E(v4 ? "USERDEFINED" : "ELEMENT")]);
      this.contain(lv.id, ref);
      this.bim(ref, m, v4 ? "Pset_BuildingElementProxyCommon" : null);
      // The parameters, so this program rebuilds the solid exactly.
      this.addPset(ref, "MyArchitecture_Mass", [
        ["Z0", typed("IFCLENGTHMEASURE", m.z0 || 0)],
        ["Height", typed("IFCPOSITIVELENGTHMEASURE", m.height)],
        ["Taper", typed("IFCREAL", taper)],
        ["Material", typed("IFCLABEL", m.material || "concrete")],
      ]);
    }
  }

  // -------------------------------------------------------------- furniture
  furniture(lv) {
    const { p, v4 } = this;
    for (const f of p.furniture.filter((x) => x.level === lv.id)) {
      const solid = this.style(this.extrude(this.rectProfile(f.w, f.d), f.h), "furniture");
      const plc = this.local(this.storeyPlc.get(lv.id), [f.x, -f.y, f.elevation || 0], xAxisFor(f.rot));
      const attrs = { name: f.kind, placement: plc, shape: this.shape([this.body([solid])]), tag: f.id };
      const ref = v4
        ? this.product("IFCFURNITURE", f.id, attrs, [E(FURNITURE_TYPES[f.kind] || "NOTDEFINED")])
        : this.product("IFCFURNISHINGELEMENT", f.id, attrs);
      this.contain(lv.id, ref);
      this.bim(ref, f);
    }
  }
}

// `project` → IFC STEP text. schema: "IFC4" (default) or "IFC2X3".
export function exportIfc(project, { schema = "IFC4", author = "", organization = "", application = "MyArchitecture", timestamp } = {}) {
  const p = normalizeProject(structuredClone(project));
  const s = String(schema).toUpperCase().replace(/\s/g, "") === "IFC2X3" ? "IFC2X3" : "IFC4";
  return new IfcExporter(p, { schema: s, author, organization, application, timestamp }).run();
}

// ================================================================ STEP reading

const DERIVED = Object.freeze({ derived: true });

// Decode the escapes of a STEP string body (after '' has been undone).
function decodeStepString(s) {
  if (!s.includes("\\")) return s;
  const up = s.toUpperCase();
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c !== "\\") { out += c; i++; continue; }
    if (s[i + 1] === "\\") { out += "\\"; i += 2; continue; }
    const head = up.slice(i, i + 4);
    if (head === "\\X2\\" || head === "\\X4\\") {
      const end = up.indexOf("\\X0\\", i + 4);
      const hex = s.slice(i + 4, end < 0 ? s.length : end);
      const w = head === "\\X2\\" ? 4 : 8;
      for (let k = 0; k + w <= hex.length; k += w) {
        const code = parseInt(hex.slice(k, k + w), 16);
        if (Number.isFinite(code)) out += w === 4 ? String.fromCharCode(code) : String.fromCodePoint(code);
      }
      i = end < 0 ? s.length : end + 4;
    } else if (up.slice(i, i + 3) === "\\X\\") {
      out += String.fromCharCode(parseInt(s.slice(i + 3, i + 5), 16) || 0);
      i += 5;
    } else if (up.slice(i, i + 3) === "\\S\\" && i + 3 < s.length) {
      out += String.fromCharCode(s.charCodeAt(i + 3) + 128);
      i += 4;
    } else if (/^\\P[A-I]\\$/.test(head)) {
      i += 4; // code page switch: \S\ below stays ISO 8859-1
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const isDigit = (c) => c >= 48 && c <= 57;
const isAlpha = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

// Parse a STEP physical file → {entities: Map(id → {type, args}), header, errors}.
// Values: numbers, strings, null ($), DERIVED (*), {ref}, {enum}, {typed, value}, arrays.
function parseStepFile(text) {
  const s = String(text ?? "");
  const n = s.length;
  let i = 0;
  const entities = new Map();
  const header = {};
  let errors = 0;

  const ws = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else if (c === 47 && s.charCodeAt(i + 1) === 42) {
        const e = s.indexOf("*/", i + 2);
        i = e < 0 ? n : e + 2;
      } else break;
    }
  };
  const fail = (msg) => { throw new SyntaxError(`${msg} at offset ${i}`); };
  const keyword = (dash = false) => {
    const st = i;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (isAlpha(c) || isDigit(c) || (dash && c === 45)) i++;
      else break;
    }
    return s.slice(st, i).toUpperCase();
  };
  const string = () => {
    i++;
    let body = "";
    for (;;) {
      const e = s.indexOf("'", i);
      if (e < 0) fail("unterminated string");
      body += s.slice(i, e);
      if (s[e + 1] === "'") { body += "'"; i = e + 2; } else { i = e + 1; break; }
    }
    return decodeStepString(body);
  };
  const list = () => {
    i++; // (
    const out = [];
    ws();
    if (s[i] === ")") { i++; return out; }
    for (;;) {
      out.push(value());
      ws();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === ")") { i++; return out; }
      fail("expected ',' or ')'");
    }
  };
  const value = () => {
    ws();
    const ch = s[i];
    const c = s.charCodeAt(i);
    if (ch === "'") return string();
    if (ch === "#") {
      i++;
      const st = i;
      while (i < n && isDigit(s.charCodeAt(i))) i++;
      if (st === i) fail("bad reference");
      return { ref: +s.slice(st, i) };
    }
    if (ch === "$") { i++; return null; }
    if (ch === "*") { i++; return DERIVED; }
    if (ch === "(") return list();
    if (ch === "." && isAlpha(s.charCodeAt(i + 1))) {
      const e = s.indexOf(".", i + 1);
      if (e < 0) fail("unterminated enumeration");
      const v = s.slice(i + 1, e).toUpperCase();
      i = e + 1;
      return { enum: v };
    }
    if (ch === '"') {
      const e = s.indexOf('"', i + 1);
      if (e < 0) fail("unterminated binary");
      const v = s.slice(i + 1, e);
      i = e + 1;
      return v;
    }
    if (isDigit(c) || ch === "-" || ch === "+" || ch === ".") {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(s);
      if (!m) fail("bad number");
      i += m[0].length;
      return parseFloat(m[0]);
    }
    if (isAlpha(c)) {
      const kw = keyword();
      ws();
      if (s[i] !== "(") fail(`expected '(' after ${kw}`);
      const args = list();
      return { typed: kw, value: args.length === 1 ? args[0] : args };
    }
    return fail(`unexpected '${ch}'`);
  };
  const skipStatement = () => {
    // Recover: jump past the next ';' that is not inside a string.
    let inStr = false;
    while (i < n) {
      const ch = s[i++];
      if (ch === "'") inStr = !inStr;
      else if (ch === ";" && !inStr) return;
    }
  };

  while (i < n) {
    ws();
    if (i >= n) break;
    const start = i;
    try {
      if (s[i] === "#") {
        i++;
        const st = i;
        while (i < n && isDigit(s.charCodeAt(i))) i++;
        const id = +s.slice(st, i);
        ws();
        if (s[i] !== "=") fail("expected '='");
        i++;
        ws();
        let ent;
        if (s[i] === "(") {
          // Complex instance: (TYPEA(...)TYPEB(...)).
          i++;
          const parts = [];
          ws();
          while (i < n && s[i] !== ")") {
            const kw = keyword();
            ws();
            if (s[i] !== "(") fail("expected '('");
            parts.push({ type: kw, args: list() });
            ws();
          }
          i++;
          ent = { type: "COMPLEX", args: [], parts };
        } else {
          const type = keyword();
          if (!type) fail("expected an entity name");
          ws();
          if (s[i] !== "(") fail("expected '('");
          ent = { type, args: list() };
        }
        ws();
        if (s[i] !== ";") fail("expected ';'");
        i++;
        entities.set(id, ent);
      } else {
        const kw = keyword(true);
        if (!kw) fail("unexpected text");
        ws();
        if (s[i] === "(") header[kw] = list();
        ws();
        if (s[i] === ";") i++;
      }
    } catch {
      errors++;
      i = Math.max(i, start + 1);
      skipStatement();
    }
  }
  return { entities, header, errors };
}

// STEP text → Map(id → {type, args}) (types upper case).
export function parseStep(text) {
  return parseStepFile(text).entities;
}

// ================================================================ import

const val = (v) => (v && typeof v === "object" && !Array.isArray(v) && "typed" in v ? val(v.value) : v);
const num = (v, d = null) => { const x = val(v); return typeof x === "number" && Number.isFinite(x) ? x : d; };
const str = (v) => { const x = val(v); return typeof x === "string" ? x : null; };
const enm = (v) => { const x = val(v); return x && typeof x === "object" && "enum" in x ? x.enum : null; };
const refId = (v) => (v && typeof v === "object" && "ref" in v ? v.ref : null);
const refs = (v) => (Array.isArray(v) ? v.map(refId).filter((x) => x !== null) : []);
const r3 = (v) => Math.round(v * 1000) / 1000 || 0;
// A property value as a plain string, number or boolean (undefined otherwise).
function simpleValue(v) {
  const x = val(v);
  if (typeof x === "string" || (typeof x === "number" && Number.isFinite(x))) return x;
  const e = enm(x);
  if (e === "T" || e === "TRUE") return true;
  if (e === "F" || e === "FALSE") return false;
  return undefined;
}

// 3×4 affine matrices, row-major [xx xy xz tx, yx yy yz ty, zx zy zz tz].
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function mmul(a, b) {
  const r = new Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + (j === 3 ? a[i * 4 + 3] : 0);
    }
  }
  return r;
}
const mapply = (m, p) => {
  const x = p[0], y = p[1], z = p[2] || 0;
  return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
};
const mdir = (m, d) => [m[0] * d[0] + m[1] * d[1] + m[2] * (d[2] || 0), m[4] * d[0] + m[5] * d[1] + m[6] * (d[2] || 0), m[8] * d[0] + m[9] * d[1] + m[10] * (d[2] || 0)];
const frame = (o, x, y, z) => [x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2]];
function minv(m) {
  const [a, b, c, , d, e, f, , g, h, k] = m;
  const A = e * k - f * h, B = -(d * k - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C || 1e-30;
  const inv = [
    A / det, -(b * k - c * h) / det, (b * f - c * e) / det, 0,
    B / det, (a * k - c * g) / det, -(a * f - c * d) / det, 0,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det, 0,
  ];
  const t = mdir(inv, [m[3], m[7], m[11]]);
  inv[3] = -t[0]; inv[7] = -t[1]; inv[11] = -t[2];
  return inv;
}

const WALL_TYPES = ["IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE", "IFCCURTAINWALL"];
const DOORWIN_TYPES = ["IFCDOOR", "IFCDOORSTANDARDCASE", "IFCWINDOW", "IFCWINDOWSTANDARDCASE"];
const COLUMN_TYPES = ["IFCCOLUMN", "IFCCOLUMNSTANDARDCASE"];
const SLAB_TYPES = ["IFCSLAB", "IFCSLABSTANDARDCASE", "IFCSLABELEMENTEDCASE"];
const FURNITURE_ENTITY_TYPES = ["IFCFURNITURE", "IFCFURNISHINGELEMENT", "IFCSYSTEMFURNITUREELEMENT"];
const EXTRUSIONS = new Set(["IFCEXTRUDEDAREASOLID", "IFCEXTRUDEDAREASOLIDTAPERED"]);
const SPATIAL = new Set(["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE"]);
const NON_BODY_REPS = new Set(["AXIS", "FOOTPRINT", "BOX", "ANNOTATION", "PROFILE", "CLEARANCE", "LIGHTING", "SURVEYPOINTS", "REFERENCE"]);

// Proper IFC names for stats and messages (the file stores them upper case).
const IFC_NAMES = new Map(`IfcActor IfcAirTerminal IfcAnnotation IfcApplication IfcArbitraryClosedProfileDef IfcArbitraryProfileDefWithVoids
IfcAxis2Placement2D IfcAxis2Placement3D IfcBeam IfcBeamStandardCase IfcBooleanClippingResult IfcBooleanResult IfcBuilding
IfcBuildingElementPart IfcBuildingElementProxy IfcBuildingStorey IfcCableCarrierSegment IfcCartesianPoint IfcCartesianPointList2D
IfcCartesianPointList3D IfcCartesianTransformationOperator3D IfcChimney IfcCircle IfcCircleProfileDef IfcClosedShell IfcColourRgb
IfcColumn IfcColumnStandardCase IfcCompositeCurve IfcCompositeCurveSegment IfcConversionBasedUnit IfcCovering IfcCurtainWall
IfcDerivedUnit IfcDerivedUnitElement IfcDimensionalExponents IfcDirection IfcDiscreteAccessory IfcDistributionElement IfcDistributionPort
IfcDoor IfcDoorLiningProperties IfcDoorPanelProperties IfcDoorStandardCase IfcDoorStyle IfcDoorType IfcDuctSegment IfcElementAssembly
IfcElementQuantity IfcEllipseProfileDef IfcExtrudedAreaSolid IfcFace IfcFaceBound IfcFaceOuterBound IfcFacetedBrep IfcFastener
IfcFlowController IfcFlowFitting IfcFlowSegment IfcFlowTerminal IfcFooting IfcFurnishingElement IfcFurniture IfcGeometricCurveSet
IfcGeometricRepresentationContext IfcGeometricRepresentationSubContext IfcGrid IfcGridAxis IfcGridPlacement IfcIndexedPolyCurve
IfcIndexedPolygonalFace IfcLightFixture IfcLine IfcLocalPlacement IfcMappedItem IfcMaterial IfcMaterialLayer IfcMaterialLayerSet
IfcMaterialLayerSetUsage IfcMaterialList IfcMeasureWithUnit IfcMechanicalFastener IfcMember IfcMemberStandardCase IfcOpeningElement
IfcOpeningStandardCase IfcOrganization IfcOwnerHistory IfcPerson IfcPersonAndOrganization IfcPile IfcPipeSegment IfcPlate
IfcPlateStandardCase IfcPolyLoop IfcPolygonalFaceSet IfcPolyline IfcPresentationLayerAssignment IfcPresentationStyleAssignment
IfcProductDefinitionShape IfcProject IfcPropertySet IfcPropertySingleValue IfcQuantityArea IfcQuantityLength IfcQuantityVolume
IfcRailing IfcRamp IfcRampFlight IfcRectangleProfileDef IfcReinforcingBar IfcRelAggregates IfcRelAssociatesMaterial
IfcRelConnectsPathElements IfcRelContainedInSpatialStructure IfcRelDefinesByProperties IfcRelDefinesByType IfcRelFillsElement
IfcRelSpaceBoundary IfcRelVoidsElement IfcRepresentationMap IfcRoof IfcSanitaryTerminal IfcShadingDevice IfcShapeRepresentation
IfcShellBasedSurfaceModel IfcSIUnit IfcSite IfcSlab IfcSlabElementedCase IfcSlabStandardCase IfcSpace IfcStair IfcStairFlight
IfcStyledItem IfcStyledRepresentation IfcSurfaceStyle IfcSurfaceStyleRendering IfcSurfaceStyleShading IfcSystemFurnitureElement
IfcTransportElement IfcTriangulatedFaceSet IfcTrimmedCurve IfcUnitAssignment IfcVector IfcVirtualElement IfcWall IfcWallElementedCase
IfcWallStandardCase IfcWallType IfcWindow IfcWindowLiningProperties IfcWindowPanelProperties IfcWindowStandardCase IfcWindowStyle
IfcWindowType`.split(/\s+/).map((nm) => [nm.toUpperCase(), nm]));
const ifcName = (t) => IFC_NAMES.get(t) || (t.startsWith("IFC") ? `Ifc${t[3] || ""}${t.slice(4).toLowerCase()}` : t);

const SI_PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };

const WARNINGS = {
  wallNoGeometry: (n) => `${n} walls had no usable geometry and were skipped`,
  wallBrep: (n) => `${n} walls had no extruded body and were approximated by their bounding rectangle`,
  wallOffset: (n) => `${n} walls do not start at their storey elevation (the offset was ignored)`,
  openingHost: (n) => `${n} openings cut elements other than walls and were skipped`,
  openingNoGeometry: (n) => `${n} openings had no usable geometry and were skipped`,
  fillerNoWall: (n) => `${n} doors/windows could not be matched to a wall and were skipped`,
  spaceNoGeometry: (n) => `${n} spaces had no usable floor outline and were skipped`,
  columnNoGeometry: (n) => `${n} columns had no usable geometry and were skipped`,
  stairNoGeometry: (n) => `${n} stairs had no usable geometry and were skipped`,
  roofNoGeometry: (n) => `${n} roofs had no usable geometry and were skipped`,
  roofApprox: (n) => `${n} pitched roofs were rebuilt approximately from their faces`,
  furnitureNoGeometry: (n) => `${n} furniture items had no usable geometry and were skipped`,
  floorSlabs: (n) => `${n} floor slabs on storeys without spaces were skipped (floors come from rooms)`,
  booleans: (n) => `${n} bodies with boolean cuts were read without the cuts`,
  gridPlacement: (n) => `${n} grid placements were treated as the origin`,
};

class IfcReader {
  constructor({ entities, header, errors }) {
    this.ents = entities;
    this.header = header;
    this.byType = new Map();
    for (const [id, e] of entities) {
      if (!this.byType.has(e.type)) this.byType.set(e.type, []);
      this.byType.get(e.type).push(id);
    }
    this.warnings = [];
    if (errors) this.warnings.push(`${errors} malformed STEP statements were ignored`);
    this.counts = {};
    this.consumed = new Set();
    this.placements = new Map();
    this.lu = 1; // millimetres per file length unit
    this.walls = [];
    this.wallsOf = new Map(); // IFC wall id → [plan walls]
    this.openings = [];
    this.rooms = [];
    this.columns = [];
    this.stairs = [];
    this.roofs = [];
    this.furniture = [];
    this.floorSlabs = new Map(); // storey id → [thickness mm]
  }

  count(key, n = 1) { this.counts[key] = (this.counts[key] || 0) + n; }

  get(v) {
    const id = typeof v === "number" ? v : refId(v);
    return id === null ? null : this.ents.get(id) || null;
  }

  all(types) { return types.flatMap((t) => this.byType.get(t) || []); }

  // -------------------------------------------------------------- relations
  index() {
    this.parent = new Map();
    this.children = new Map();
    this.container = new Map();
    this.material = new Map();
    this.definitions = new Map();
    for (const id of this.all(["IFCRELAGGREGATES", "IFCRELNESTS"])) {
      const a = this.ents.get(id).args;
      const whole = refId(a[4]);
      for (const part of refs(a[5])) {
        this.parent.set(part, whole);
        if (!this.children.has(whole)) this.children.set(whole, []);
        this.children.get(whole).push(part);
      }
    }
    for (const id of this.all(["IFCRELCONTAINEDINSPATIALSTRUCTURE"])) {
      const a = this.ents.get(id).args;
      for (const el of refs(a[4])) this.container.set(el, refId(a[5]));
    }
    for (const id of this.all(["IFCRELASSOCIATESMATERIAL"])) {
      const a = this.ents.get(id).args;
      for (const el of refs(a[4])) this.material.set(el, refId(a[5]));
    }
    for (const id of this.all(["IFCRELDEFINESBYPROPERTIES"])) {
      const a = this.ents.get(id).args;
      for (const el of refs(a[4])) {
        if (!this.definitions.has(el)) this.definitions.set(el, []);
        this.definitions.get(el).push(refId(a[5]));
      }
    }
    this.typeOf = new Map();
    for (const id of this.all(["IFCRELDEFINESBYTYPE"])) {
      const a = this.ents.get(id).args;
      for (const el of refs(a[4])) this.typeOf.set(el, refId(a[5]));
    }
    this.groupOf = new Map();
    for (const id of this.all(["IFCRELASSIGNSTOGROUP"])) {
      const a = this.ents.get(id).args;
      const g = this.get(a[6]);
      if (!g || g.type !== "IFCGROUP") continue; // systems, zones … are not plan groups
      const name = str(g.args[2]) || `group${refId(a[6])}`;
      for (const el of refs(a[4])) this.groupOf.set(el, name);
    }
    this.classOf = new Map();
    for (const id of this.all(["IFCRELASSOCIATESCLASSIFICATION"])) {
      const a = this.ents.get(id).args;
      let ref = this.get(a[5]);
      if (!ref || ref.type !== "IFCCLASSIFICATIONREFERENCE") continue;
      const code = str(ref.args[1]) || str(ref.args[2]);
      if (!code) continue;
      // Follow ReferencedSource up to the IfcClassification for the system name.
      for (let k = 0; ref && ref.type === "IFCCLASSIFICATIONREFERENCE" && k < 16; k++) ref = this.get(ref.args[3]);
      if (ref && ref.type === "IFCCLASSIFICATION" && !this.classSystem) this.classSystem = str(ref.args[3]);
      for (const el of refs(a[4])) this.classOf.set(el, code);
    }
  }

  // Property sets of an object: [{name, quantity, props: [[name, value]]}],
  // values as read (typed); an enumerated value gives its first value.
  psetsOf(id) {
    const out = [];
    for (const defId of this.definitions.get(id) || []) {
      const d = this.ents.get(defId);
      if (!d) continue;
      const props = [];
      if (d.type === "IFCPROPERTYSET") {
        for (const pid of refs(d.args[4])) {
          const pr = this.ents.get(pid);
          if (!pr) continue;
          if (pr.type === "IFCPROPERTYSINGLEVALUE") props.push([str(pr.args[0]), pr.args[2]]);
          else if (pr.type === "IFCPROPERTYENUMERATEDVALUE") props.push([str(pr.args[0]), (pr.args[2] || [])[0] ?? null]);
        }
      } else if (d.type === "IFCELEMENTQUANTITY") {
        for (const qid of refs(d.args[5])) {
          const q = this.ents.get(qid);
          if (q && q.type.startsWith("IFCQUANTITY")) props.push([str(q.args[0]), num(q.args[3])]);
        }
      } else continue;
      out.push({ name: str(d.args[2]) || "", quantity: d.type === "IFCELEMENTQUANTITY", props });
    }
    return out;
  }

  // Property / quantity values of an object: Map("Pset.Prop" | "Prop" → value).
  props(id) {
    const out = new Map();
    for (const set of this.psetsOf(id)) {
      for (const [name, v] of set.props) { out.set(`${set.name}.${name}`, val(v)); out.set(name, val(v)); }
    }
    return out;
  }

  // Phase, department, free properties and classification of the IFC objects
  // `ids` (the first one wins) onto the plan item.
  applyBim(item, ...ids) {
    let phase = null, status = null;
    const props = {};
    for (const id of ids) {
      if (id === null || id === undefined) continue;
      for (const set of this.psetsOf(id)) {
        if (set.quantity) continue;
        for (const [name, v0] of set.props) {
          const v = simpleValue(v0);
          if (!name || v === undefined) continue;
          if (set.name === "MyArchitecture_BIM") {
            if (name === "Phase" && PHASES.includes(v)) phase ??= v;
            else if (name === "Department") item.department ??= String(v);
          } else if (set.name === "MyArchitecture_Properties") {
            if (!(name in props)) props[name] = v;
          } else if (OWN_PSETS.has(set.name)) continue;
          else if (/^Pset_.*Common$/.test(set.name) && (name === "Status" || name === "IsExternal")) {
            if (name === "Status" && typeof v === "string") status ??= STATUS_PHASE[v.toUpperCase()] || null;
          } else {
            const key = `${set.name}.${name}`;
            if (!(key in props)) props[key] = v;
          }
        }
      }
      const code = this.classOf.get(id);
      if (code && !item.classification) item.classification = code;
      const group = this.groupOf.get(id);
      if (group && !item.group) item.group = group;
    }
    if (phase || status) item.phase = phase || status;
    if (Object.keys(props).length) item.props = props;
    return item;
  }

  // -------------------------------------------------------------- units
  readUnits() {
    const projId = (this.byType.get("IFCPROJECT") || [])[0];
    const proj = projId ? this.ents.get(projId) : null;
    let ua = proj ? this.get(proj.args[8]) : null;
    if (!ua) { const u = (this.byType.get("IFCUNITASSIGNMENT") || [])[0]; ua = u ? this.ents.get(u) : null; }
    this.angle = 1;
    let length = null;
    for (const uref of ua ? ua.args[0] || [] : []) {
      const u = this.get(uref);
      if (!u) continue;
      const kind = enm(u.args[1]);
      if (kind === "LENGTHUNIT") length = this.unitScale(u, "length");
      else if (kind === "PLANEANGLEUNIT") this.angle = this.unitScale(u, "angle") ?? 1;
    }
    if (length === null) {
      this.warnings.push("No length unit found; metres assumed");
      length = 1000;
    }
    this.lu = length;
    this.title = proj ? str(proj.args[2]) || str(proj.args[5]) : null;
    this.projectId = projId;
  }

  // mm per unit for lengths, radians per unit for angles.
  unitScale(u, what) {
    if (!u) return null;
    if (u.type === "IFCSIUNIT") {
      const f = SI_PREFIX[enm(u.args[2])] ?? 1;
      return what === "length" ? 1000 * f : f;
    }
    if (u.type === "IFCCONVERSIONBASEDUNIT" || u.type === "IFCCONVERSIONBASEDUNITWITHOFFSET") {
      const m = this.get(u.args[3]);
      const factor = m ? num(m.args[0]) : null;
      const base = m ? this.unitScale(this.get(m.args[1]), what) : null;
      if (factor !== null && base !== null) return factor * base;
      const name = (str(u.args[2]) || "").toUpperCase();
      if (what === "length") return name.includes("INCH") ? 25.4 : name.includes("FOOT") || name.includes("FEET") ? 304.8 : null;
      return name.includes("DEGREE") ? Math.PI / 180 : null;
    }
    return null;
  }

  // -------------------------------------------------------------- placements
  coords(v) {
    const e = this.get(v);
    if (!e) return null;
    const c = e.args[0] || []; // Coordinates / DirectionRatios
    return [num(c[0], 0), num(c[1], 0), num(c[2], 0)];
  }

  axis(v) {
    const e = this.get(v);
    if (!e) return IDENTITY;
    const o = this.coords(e.args[0]) || [0, 0, 0];
    if (e.type === "IFCAXIS2PLACEMENT2D") {
      const x = norm3(this.coords(e.args[1]) || [1, 0, 0]);
      return frame(o, [x[0], x[1], 0], [-x[1], x[0], 0], [0, 0, 1]);
    }
    if (e.type !== "IFCAXIS2PLACEMENT3D") return IDENTITY;
    const z = norm3(this.coords(e.args[1]) || [0, 0, 1]);
    let x = this.coords(e.args[2]) || [1, 0, 0];
    x = sub3(x, z.map((c) => c * dot3(x, z)));
    if (len3(x) < 1e-9) x = Math.abs(z[0]) < 0.9 ? cross3([1, 0, 0], z).map((c) => -c) : [0, 1, 0];
    x = norm3(x);
    return frame(o, x, cross3(z, x), z);
  }

  placement(v, depth = 0) {
    const id = refId(v);
    if (id === null) return IDENTITY;
    if (this.placements.has(id)) return this.placements.get(id);
    const e = this.ents.get(id);
    let m = IDENTITY;
    if (e && e.type === "IFCLOCALPLACEMENT" && depth < 64) {
      m = mmul(this.placement(e.args[0], depth + 1), this.axis(e.args[1]));
    } else if (e && e.type === "IFCGRIDPLACEMENT") this.count("gridPlacement");
    this.placements.set(id, m);
    return m;
  }

  // IfcCartesianTransformationOperator3D(nonUniform) → matrix.
  operator(e) {
    if (!e) return IDENTITY;
    const o = this.coords(e.args[2]) || [0, 0, 0];
    const s = num(e.args[3], 1);
    const z = norm3(this.coords(e.args[4]) || [0, 0, 1]);
    let x = this.coords(e.args[0]) || [1, 0, 0];
    x = norm3(sub3(x, z.map((c) => c * dot3(x, z))));
    let y = this.coords(e.args[1]) || cross3(z, x);
    y = norm3(y);
    const s2 = num(e.args[5], s), s3 = num(e.args[6], s);
    return frame(o, x.map((c) => c * s), y.map((c) => c * s2), z.map((c) => c * s3));
  }

  // -------------------------------------------------------------- representations
  reps(e) {
    const shape = this.get(e.args[6]);
    if (!shape || shape.type !== "IFCPRODUCTDEFINITIONSHAPE") return [];
    return (shape.args[2] || []).map((r) => this.get(r)).filter((r) => r && (r.type === "IFCSHAPEREPRESENTATION" || r.type === "IFCSTYLEDREPRESENTATION"));
  }

  bodyRep(e) {
    const reps = this.reps(e);
    const id = (r) => (str(r.args[1]) || "").toUpperCase();
    return reps.find((r) => id(r) === "BODY") || reps.find((r) => !NON_BODY_REPS.has(id(r))) || reps.find((r) => id(r) === "BOX") || null;
  }

  // Leaf geometric items with their world matrices.
  leaves(items, M, out = [], depth = 0) {
    for (const ref of items || []) {
      const e = this.get(ref);
      if (!e || depth > 32) continue;
      if (e.type === "IFCMAPPEDITEM") {
        const src = this.get(e.args[0]);
        const rep = src ? this.get(src.args[1]) : null;
        if (!rep) continue;
        const Mi = mmul(mmul(M, this.operator(this.get(e.args[1]))), this.axis(src.args[0]));
        this.leaves(rep.args[3], Mi, out, depth + 1);
      } else if (e.type === "IFCBOOLEANRESULT" || e.type === "IFCBOOLEANCLIPPINGRESULT") {
        this.boolean = true;
        this.leaves([e.args[1]], M, out, depth + 1);
        if (enm(e.args[0]) === "UNION") this.leaves([e.args[2]], M, out, depth + 1);
      } else if (e.type === "IFCCSGSOLID") {
        this.leaves([e.args[0]], M, out, depth + 1);
      } else out.push({ e, M });
    }
    return out;
  }

  // 2D points of a curve (in its own coordinates; z kept when present).
  curve(e, depth = 0) {
    if (!e || depth > 16) return [];
    const t = e.type;
    let pts = [];
    if (t === "IFCPOLYLINE") pts = (e.args[0] || []).map((r) => this.coords(r)).filter(Boolean);
    else if (t === "IFCINDEXEDPOLYCURVE") {
      const list = this.get(e.args[0]);
      const all = (list ? list.args[0] || [] : []).map((c) => [num(c[0], 0), num(c[1], 0), num(c[2], 0)]);
      if (!Array.isArray(e.args[1]) || !e.args[1].length) pts = all;
      else {
        for (const seg of e.args[1]) {
          const idx = Array.isArray(val(seg)) ? val(seg) : seg && Array.isArray(seg.value) ? seg.value : [];
          for (const k of idx) {
            const q = all[num(k, 0) - 1];
            if (q && !(pts.length && dist3(pts[pts.length - 1], q) < 1e-9)) pts.push(q);
          }
        }
      }
    } else if (t === "IFCCOMPOSITECURVE") {
      for (const sref of e.args[0] || []) {
        const seg = this.get(sref);
        if (!seg) continue;
        let sp = this.curve(this.get(seg.args[2]), depth + 1);
        if (enm(seg.args[1]) === "F") sp = sp.slice().reverse();
        for (const q of sp) if (!(pts.length && dist3(pts[pts.length - 1], q) < 1e-9)) pts.push(q);
      }
    } else if (t === "IFCTRIMMEDCURVE") {
      pts = this.trimmed(e, depth);
    } else if (t === "IFCCIRCLE" || t === "IFCELLIPSE") {
      const M = this.axis(e.args[0]);
      const a = num(e.args[1], 0), b = t === "IFCELLIPSE" ? num(e.args[2], a) : a;
      for (let k = 0; k < 24; k++) pts.push(mapply(M, [a * Math.cos((k * Math.PI) / 12), b * Math.sin((k * Math.PI) / 12), 0]));
    }
    if (pts.length > 2 && dist3(pts[0], pts[pts.length - 1]) < 1e-9) pts.pop();
    return pts;
  }

  trimmed(e, depth) {
    const basis = this.get(e.args[0]);
    const trim = (list) => {
      for (const v of list || []) {
        const ent = this.get(v);
        if (ent && ent.type === "IFCCARTESIANPOINT") return { pt: this.coords(v) };
      }
      for (const v of list || []) { const x = num(v); if (x !== null) return { t: x }; }
      return null;
    };
    const t1 = trim(e.args[1]), t2 = trim(e.args[2]);
    if (!basis || !t1 || !t2) return [];
    if (basis.type === "IFCLINE") {
      const P = this.coords(basis.args[0]) || [0, 0, 0];
      const vec = this.get(basis.args[1]);
      const d = vec ? (this.coords(vec.args[0]) || [1, 0, 0]).map((c) => c * num(vec.args[1], 1)) : [1, 0, 0];
      const at = (tr) => tr.pt || add3(P, d.map((c) => c * tr.t));
      return [at(t1), at(t2)];
    }
    if (basis.type === "IFCCIRCLE") {
      const M = this.axis(basis.args[0]);
      const R = num(basis.args[1], 0);
      const inv = minv(M);
      const ang = (tr) => {
        if (tr.pt) { const l = mapply(inv, tr.pt); return Math.atan2(l[1], l[0]); }
        return tr.t * this.angle;
      };
      let a1 = ang(t1), a2 = ang(t2);
      const sense = enm(e.args[3]) !== "F";
      if (sense && a2 <= a1) a2 += 2 * Math.PI;
      if (!sense && a2 >= a1) a2 -= 2 * Math.PI;
      const steps = Math.max(2, Math.ceil((Math.abs(a2 - a1) / Math.PI) * 12));
      const out = [];
      for (let k = 0; k <= steps; k++) { const a = a1 + ((a2 - a1) * k) / steps; out.push(mapply(M, [R * Math.cos(a), R * Math.sin(a), 0])); }
      return out;
    }
    return this.curve(basis, depth + 1);
  }

  // Profile → {kind, pts (2D, incl. its Position), x, y, r, r2, P (2D matrix)}.
  profile(e, depth = 0) {
    if (!e || depth > 8) return null;
    const t = e.type;
    const P = this.axis(e.args[2]);
    const ring = (local) => local.map((q) => { const w = mapply(P, q); return [w[0], w[1]]; });
    if (t === "IFCRECTANGLEPROFILEDEF" || t === "IFCRECTANGLEHOLLOWPROFILEDEF" || t === "IFCROUNDEDRECTANGLEPROFILEDEF") {
      const x = num(e.args[3], 0), y = num(e.args[4], 0);
      return { kind: "rect", x, y, P, pts: ring([[-x / 2, -y / 2], [x / 2, -y / 2], [x / 2, y / 2], [-x / 2, y / 2]]) };
    }
    if (t === "IFCCIRCLEPROFILEDEF" || t === "IFCCIRCLEHOLLOWPROFILEDEF" || t === "IFCELLIPSEPROFILEDEF") {
      const r = num(e.args[3], 0), r2 = t === "IFCELLIPSEPROFILEDEF" ? num(e.args[4], r) : r;
      const local = [];
      for (let k = 0; k < 24; k++) local.push([r * Math.cos((k * Math.PI) / 12), r2 * Math.sin((k * Math.PI) / 12)]);
      return { kind: "circle", r, r2, P, pts: ring(local) };
    }
    if (t === "IFCARBITRARYCLOSEDPROFILEDEF" || t === "IFCARBITRARYPROFILEDEFWITHVOIDS") {
      const pts = this.curve(this.get(e.args[2])).map((q) => [q[0], q[1]]);
      return pts.length >= 3 ? { kind: "poly", P: IDENTITY, pts } : null;
    }
    if (t === "IFCDERIVEDPROFILEDEF") {
      const base = this.profile(this.get(e.args[2]), depth + 1);
      if (!base) return null;
      const op = this.get(e.args[3]);
      const o = op ? this.coords(op.args[2]) || [0, 0, 0] : [0, 0, 0];
      const x = op ? norm3(this.coords(op.args[0]) || [1, 0, 0]) : [1, 0, 0];
      const s = op ? num(op.args[3], 1) : 1;
      const M = frame(o, x.map((c) => c * s), [-x[1] * s, x[0] * s, 0], [0, 0, 1]);
      return { ...base, kind: "poly", pts: base.pts.map((q) => { const w = mapply(M, q); return [w[0], w[1]]; }) };
    }
    if (t === "IFCCOMPOSITEPROFILEDEF") {
      const pts = (e.args[2] || []).flatMap((r) => (this.profile(this.get(r), depth + 1) || { pts: [] }).pts);
      return pts.length >= 3 ? { kind: "poly", P: IDENTITY, pts } : null;
    }
    // Parametric sections (I, L, T, U, C, Z …): their bounding rectangle.
    const x = num(e.args[3]), y = num(e.args[4]);
    if (this.get(e.args[2]) && x !== null && y !== null) {
      return { kind: "rect", x, y, P, pts: ring([[-x / 2, -y / 2], [x / 2, -y / 2], [x / 2, y / 2], [-x / 2, y / 2]]) };
    }
    return null;
  }

  extrusion(leaf) {
    const { e, M } = leaf;
    const prof = this.profile(this.get(e.args[0]));
    if (!prof) return null;
    const Mpos = mmul(M, this.axis(e.args[1]));
    const d = this.coords(e.args[2]) || [0, 0, 1];
    const depth = num(e.args[3], 0);
    const v = d.map((c) => c * depth);
    const bottom = prof.pts.map((q) => mapply(Mpos, [q[0], q[1], 0]));
    const top = prof.pts.map((q) => mapply(Mpos, [q[0] + v[0], q[1] + v[1], v[2]]));
    const wv = mdir(Mpos, v);
    const vertical = len3(wv) > 0 && Math.abs(wv[2]) / len3(wv) > 0.999;
    return { prof, Mpos, bottom, top, vertical, height: Math.abs(wv[2]), base: extent([...bottom, ...top].map((q) => q[2]))[0] };
  }

  // World polygons of a leaf item (file units).
  faces(leaf) {
    const { e, M } = leaf;
    const t = e.type;
    const loops = (faceRefs) => {
      const out = [];
      for (const fr of faceRefs || []) {
        const f = this.get(fr);
        if (!f) continue;
        const bounds = (f.args[0] || []).map((b) => this.get(b)).filter(Boolean);
        const b = bounds.find((x) => x.type === "IFCFACEOUTERBOUND") || bounds[0];
        const loop = b ? this.get(b.args[0]) : null;
        if (!loop || loop.type !== "IFCPOLYLOOP") continue;
        let pts = (loop.args[0] || []).map((r) => mapply(M, this.coords(r) || [0, 0, 0]));
        if (enm(b.args[1]) === "F") pts = pts.reverse();
        if (pts.length >= 3) out.push(pts);
      }
      return out;
    };
    const shellFaces = (shellRef) => { const sh = this.get(shellRef); return sh ? loops(sh.args[0]) : []; };
    if (EXTRUSIONS.has(t)) {
      const x = this.extrusion(leaf);
      if (!x) return [];
      const out = [x.bottom, x.top];
      for (let i = 0; i < x.bottom.length; i++) {
        const j = (i + 1) % x.bottom.length;
        out.push([x.bottom[i], x.bottom[j], x.top[j], x.top[i]]);
      }
      return out;
    }
    if (t === "IFCFACETEDBREP" || t === "IFCFACETEDBREPWITHVOIDS") return shellFaces(e.args[0]);
    if (t === "IFCSHELLBASEDSURFACEMODEL") return (e.args[0] || []).flatMap(shellFaces);
    if (t === "IFCFACEBASEDSURFACEMODEL") return (e.args[0] || []).flatMap(shellFaces);
    if (t === "IFCPOLYGONALFACESET" || t === "IFCTRIANGULATEDFACESET") {
      const list = this.get(e.args[0]);
      const coords = (list ? list.args[0] || [] : []).map((c) => mapply(M, [num(c[0], 0), num(c[1], 0), num(c[2], 0)]));
      const pn = t === "IFCPOLYGONALFACESET" ? e.args[3] : e.args[4];
      const at = (k) => coords[(Array.isArray(pn) && pn.length ? num(pn[k - 1], k) : k) - 1];
      const polys = t === "IFCTRIANGULATEDFACESET"
        ? (e.args[3] || []).map((tri) => tri.map((k) => at(num(k, 0))))
        : (e.args[2] || []).map((fr) => { const f = this.get(fr); return f ? (f.args[0] || []).map((k) => at(num(k, 0))) : []; });
      return polys.filter((q) => q.length >= 3 && q.every(Boolean));
    }
    if (t === "IFCBOUNDINGBOX") {
      const c = this.coords(e.args[0]) || [0, 0, 0];
      return boxFaces(M, c, [c[0] + num(e.args[1], 0), c[1] + num(e.args[2], 0), c[2] + num(e.args[3], 0)]);
    }
    if (t === "IFCBLOCK") {
      return boxFaces(mmul(M, this.axis(e.args[0])), [0, 0, 0], [num(e.args[1], 0), num(e.args[2], 0), num(e.args[3], 0)]);
    }
    return [];
  }

  // Body geometry of a product: leaves, faces, points, first extrusion.
  geometry(id) {
    const e = this.ents.get(id);
    const M = this.placement(e.args[5]);
    const rep = this.bodyRep(e);
    this.boolean = false;
    const leaves = rep ? this.leaves(rep.args[3], M) : [];
    if (this.boolean) this.count("booleans");
    const faces = [];
    let ext = null;
    for (const lf of leaves) {
      if (!ext && EXTRUSIONS.has(lf.e.type)) ext = this.extrusion(lf);
      for (const f of this.faces(lf)) faces.push(f);
    }
    return { e, M, leaves, faces, points: faces.flat(), ext };
  }

  // World polygon of the floor of a body: a vertical extrusion's profile or
  // the largest downward horizontal face at the bottom.
  footprint(g) {
    if (g.ext && g.ext.vertical && g.leaves.length === 1) return g.ext.bottom;
    if (!g.points.length) return null;
    const zmin = extent(g.points.map((q) => q[2]))[0];
    let best = null, bestA = 0;
    for (const f of g.faces) {
      const nrm = newell(f);
      const a = len3(nrm);
      if (a < 1e-9 || Math.abs(nrm[2]) / a < 0.99) continue;
      if (f.some((q) => Math.abs(q[2] - zmin) > 1e-3 * Math.max(1, Math.abs(zmin)) + 1e-6)) continue;
      if (a > bestA) { bestA = a; best = f; }
    }
    return best;
  }

  // -------------------------------------------------------------- plan conversion
  plan(q) { return [r3(q[0] * this.lu), r3(-q[1] * this.lu)]; }
  z(q) { return q[2] * this.lu; }

  // -------------------------------------------------------------- storeys
  readStoreys() {
    const ids = this.byType.get("IFCBUILDINGSTOREY") || [];
    const list = ids.map((id) => {
      const e = this.ents.get(id);
      const M = this.placement(e.args[5]);
      let elev = M[11] * this.lu;
      const attr = num(e.args[9]);
      if (Math.abs(elev) < 1e-6 && attr !== null && Math.abs(attr) > 1e-9) elev = attr * this.lu;
      this.consumed.add(id);
      return { id, name: str(e.args[2]) || str(e.args[7]) || "", elevation: r3(elev), qty: this.props(id).get("GrossHeight") ?? this.props(id).get("Height") ?? null };
    });
    list.sort((a, b) => a.elevation - b.elevation);
    if (!list.length) {
      this.warnings.push("No IfcBuildingStorey found; everything was put on one level");
      list.push({ id: null, name: "1F", elevation: 0, qty: null });
    }
    this.levels = list.map((s, i) => ({ id: uid("lv"), name: s.name || `L${i + 1}`, elevation: s.elevation, height: 0, slab: 200, storey: s.id, qty: s.qty }));
    this.levelOfStorey = new Map(this.levels.map((l) => [l.storey, l]));
    for (const t of ["IFCPROJECT", "IFCSITE", "IFCBUILDING"]) for (const id of this.byType.get(t) || []) this.consumed.add(id);
  }

  storeyOf(id, depth = 0) {
    if (id === null || id === undefined || depth > 32) return null;
    const c = this.container.get(id);
    if (c !== undefined) {
      const ce = this.ents.get(c);
      if (ce && ce.type === "IFCBUILDINGSTOREY") return c;
      if (ce && ce.type === "IFCSPACE") return this.storeyOf(c, depth + 1);
      return null;
    }
    const p = this.parent.get(id);
    if (p === undefined) return null;
    const pe = this.ents.get(p);
    if (pe && pe.type === "IFCBUILDINGSTOREY") return p;
    return this.storeyOf(p, depth + 1);
  }

  // The level of an element: its spatial container, else the storey below it.
  levelFor(id, M) {
    const lv = this.levelOfStorey.get(this.storeyOf(id));
    if (lv) return lv;
    const z = (M ? M[11] : 0) * this.lu;
    let best = this.levels[0];
    for (const l of this.levels) if (l.elevation <= z + 1) best = l;
    return best;
  }

  // -------------------------------------------------------------- walls
  materialThickness(id) {
    let m = this.get(this.material.get(id));
    if (m && m.type === "IFCMATERIALLAYERSETUSAGE") m = this.get(m.args[0]);
    if (!m || m.type !== "IFCMATERIALLAYERSET") return null;
    const t = (m.args[0] || []).reduce((s, l) => s + (num((this.get(l) || { args: [] }).args[1], 0)), 0);
    return t > 0 ? t * this.lu : null;
  }

  axisSegments(e, M) {
    const rep = this.reps(e).find((r) => (str(r.args[1]) || "").toUpperCase() === "AXIS");
    if (!rep) return [];
    const segs = [];
    for (const lf of this.leaves(rep.args[3], M)) {
      const pts = this.curve(lf.e).map((q) => this.plan(mapply(lf.M, q)));
      for (let i = 0; i + 1 < pts.length; i++) if (Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) > 1) segs.push([pts[i], pts[i + 1]]);
    }
    return segs;
  }

  // IfcMaterialLayerSet id behind a material association (set or usage).
  layerSetId(materialId) {
    const m = this.ents.get(materialId);
    if (m && m.type === "IFCMATERIALLAYERSETUSAGE") return refId(m.args[0]);
    return m && m.type === "IFCMATERIALLAYERSET" ? materialId : null;
  }

  // Layers of a layer set → [{material, thickness (mm), function}].
  layers(setId) {
    const set = this.ents.get(setId);
    const out = [];
    for (const lid of refs(set ? set.args[0] : [])) {
      const l = this.ents.get(lid);
      if (!l) continue;
      const t = num(l.args[1], 0) * this.lu;
      if (!(t > 0)) continue;
      const mat = this.get(l.args[0]);
      const named = [str(l.args[3]), str(l.args[5])].map((x) => (x || "").toLowerCase()).find((x) => LAYER_FUNCTIONS.includes(x));
      out.push({ material: (mat && str(mat.args[0])) || "concrete", thickness: r3(t), function: named || (enm(l.args[2]) === "T" ? "air" : "structure") });
    }
    return out;
  }

  // Wall types: from IfcWallType (name, Tag as id, its layer set or that of
  // a wall using it) or, for walls without a type, from distinct layer sets
  // of two or more layers (a single layer is just a thickness).
  readWallTypes() {
    this.wallTypes = [];
    this.wallType = new Map(); // IFC wall id → wall type
    const ids = new Set();
    const typeId = (tag) => {
      const id = tag && !ids.has(tag) ? tag : uid("wt");
      ids.add(id);
      return id;
    };
    const walls = this.all(WALL_TYPES);
    const byEntity = new Map();
    for (const id of this.byType.get("IFCWALLTYPE") || []) {
      const e = this.ents.get(id);
      let setId = this.layerSetId(this.material.get(id));
      if (setId === null) {
        const user = walls.find((w) => this.typeOf.get(w) === id && this.layerSetId(this.material.get(w)) !== null);
        if (user !== undefined) setId = this.layerSetId(this.material.get(user));
      }
      const layers = setId !== null ? this.layers(setId) : [];
      if (!layers.length) continue;
      let exterior = false;
      for (const ps of refs(e.args[5])) {
        const set = this.ents.get(ps);
        if (!set || set.type !== "IFCPROPERTYSET") continue;
        for (const pid of refs(set.args[4])) {
          const pr = this.ents.get(pid);
          const name = pr ? str(pr.args[0]) : null;
          if (name === "IsExternal") exterior = simpleValue(pr.args[2]) === true;
          if (name === "LayerFunctions" && str(set.args[2]) === "MyArchitecture_BIM") {
            const fns = String(simpleValue(pr.args[2]) ?? "").split(",");
            if (fns.length === layers.length) layers.forEach((l, i) => { if (LAYER_FUNCTIONS.includes(fns[i])) l.function = fns[i]; });
          }
        }
      }
      const wt = { id: typeId(str(e.args[7])), name: str(e.args[2]) || "Wall type", exterior, layers };
      byEntity.set(id, wt);
      this.wallTypes.push(wt);
    }
    for (const w of walls) {
      let wt = byEntity.get(this.typeOf.get(w));
      if (!wt) {
        const setId = this.layerSetId(this.material.get(w));
        if (setId === null) continue;
        wt = byEntity.get(setId);
        if (!wt) {
          const layers = this.layers(setId);
          if (layers.length < 2) continue;
          wt = { id: typeId(null), name: str(this.ents.get(setId).args[1]) || `Wall type ${this.wallTypes.length + 1}`, exterior: false, layers };
          byEntity.set(setId, wt);
          this.wallTypes.push(wt);
        }
        if (simpleValue(this.props(w).get("Pset_WallCommon.IsExternal")) === true) wt.exterior = true;
      }
      this.wallType.set(w, wt);
    }
  }

  // Direction (plan) of the side where a wall's first layer lies, from its
  // IfcMaterialLayerSetUsage (layers start on the −y side for POSITIVE sense).
  firstLayerSide(id, M) {
    const usage = this.ents.get(this.material.get(id));
    if (!usage || usage.type !== "IFCMATERIALLAYERSETUSAGE") return null;
    const y = mdir(M, [0, 1, 0]);
    const s = enm(usage.args[2]) === "NEGATIVE" ? 1 : -1;
    return [s * y[0], -s * y[1]];
  }

  readWalls() {
    for (const id of this.all(WALL_TYPES)) {
      this.consumed.add(id);
      const e = this.ents.get(id);
      const g = this.geometry(id);
      if (!g.points.length) {
        for (const c of this.children.get(id) || []) {
          this.consumed.add(c);
          if (this.ents.get(c).args.length > 6) for (const q of this.geometry(c).points) g.points.push(q);
        }
      }
      const lv = this.levelFor(id, g.M);
      const pts = g.points.map((q) => [...this.plan(q), this.z(q)]);
      let segs = this.axisSegments(e, g.M);
      let thick = null;
      if (segs.length === 1 && pts.length) {
        // Centre the axis in the body and measure the thickness across it.
        const [A, B] = segs[0];
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const nx = -(B[1] - A[1]) / L, ny = (B[0] - A[0]) / L;
        const vs = pts.map((q) => (q[0] - A[0]) * nx + (q[1] - A[1]) * ny);
        const [v1, v2] = extent(vs);
        thick = v2 - v1;
        const sh = (v1 + v2) / 2;
        if (Math.abs(sh) > 0.01) segs = [[[A[0] + nx * sh, A[1] + ny * sh], [B[0] + nx * sh, B[1] + ny * sh]]];
      } else if (!segs.length) {
        if (g.ext && g.ext.vertical && g.ext.prof.kind === "rect" && g.leaves.length === 1) {
          const c = g.ext.bottom.map((q) => this.plan(q));
          const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const lx = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
          const ly = Math.hypot(c[3][0] - c[0][0], c[3][1] - c[0][1]);
          segs = [lx >= ly ? [mid(c[0], c[3]), mid(c[1], c[2])] : [mid(c[0], c[1]), mid(c[3], c[2])]];
          thick = Math.min(lx, ly);
        } else if (pts.length) {
          const r = orientedRect(pts.map((q) => [q[0], q[1]]));
          const [dx, dy] = rotPt(r.len / 2, 0, r.angle);
          segs = [[[r.cx - dx, r.cy - dy], [r.cx + dx, r.cy + dy]]];
          thick = r.wid;
          if (!g.ext) this.count("wallBrep");
        }
      }
      if (!segs.length) { this.count("wallNoGeometry"); continue; }
      if (!(thick > 1)) thick = this.materialThickness(id) || 200;
      if (e.type === "IFCCURTAINWALL") thick = Math.max(50, thick);
      let height = null, bottom = lv.elevation;
      if (g.ext && g.ext.vertical) { height = g.ext.height * this.lu; bottom = g.ext.base * this.lu; }
      else if (pts.length) { const [z1, z2] = extent(pts.map((q) => q[2])); bottom = z1; height = z2 - z1; }
      if (Math.abs(bottom - lv.elevation) > 1) this.count("wallOffset");
      const wt = this.wallType.get(id);
      const side = wt ? this.firstLayerSide(id, g.M) : null;
      const list = segs.map(([A0, B0]) => {
        // Layers are listed from the plan left of a wall: turn the wall round
        // when its first layer lies on the right.
        let A = A0, B = B0;
        if (side && side[0] * -(B[1] - A[1]) + side[1] * (B[0] - A[0]) < 0) [A, B] = [B, A];
        const w = {
          id: uid("w"), level: lv.id, x1: r3(A[0]), y1: r3(A[1]), x2: r3(B[0]), y2: r3(B[1]),
          thickness: wt ? wallTypeThickness(wt) : r3(thick), height: height > 1 ? r3(height) : null,
        };
        if (wt) w.type = wt.id;
        return this.applyBim(w, id);
      });
      if (list.length) { this.walls.push(...list); this.wallsOf.set(id, list); }
    }
  }

  // -------------------------------------------------------------- openings
  readOpenings() {
    const fills = new Map();
    for (const rid of this.byType.get("IFCRELFILLSELEMENT") || []) {
      const a = this.ents.get(rid).args;
      fills.set(refId(a[4]), refId(a[5]));
    }
    const placed = new Set();
    for (const rid of this.byType.get("IFCRELVOIDSELEMENT") || []) {
      const a = this.ents.get(rid).args;
      const host = refId(a[4]), op = refId(a[5]);
      if (!this.ents.get(op)) continue;
      this.consumed.add(op);
      const filler = fills.get(op) ?? null;
      if (filler !== null) { placed.add(filler); this.consumed.add(filler); }
      const walls = this.wallsOf.get(host);
      if (!walls) { this.count("openingHost"); continue; }
      let g = this.geometry(op);
      if (!g.points.length && filler !== null) g = this.geometry(filler);
      if (!g.points.length) { this.count("openingNoGeometry"); continue; }
      this.addOpening(walls, g, filler, op);
    }
    // Doors and windows without an opening: put them into the nearest wall.
    for (const id of this.all(DOORWIN_TYPES)) {
      if (placed.has(id)) continue;
      this.consumed.add(id);
      const g = this.geometry(id);
      if (!g.points.length) { this.count("fillerNoWall"); continue; }
      const lv = this.levelFor(id, g.M);
      const c = centre(g.points.map((q) => this.plan(q)));
      let best = null;
      for (const w of this.walls) {
        if (w.level !== lv.id) continue;
        const d = closestOnSegment(c[0], c[1], w.x1, w.y1, w.x2, w.y2).d;
        if (d <= w.thickness / 2 + 100 && (!best || d < best.d)) best = { w, d };
      }
      if (!best) { this.count("fillerNoWall"); continue; }
      this.addOpening([best.w], g, id);
    }
  }

  addOpening(walls, g, fillerId, openingId = null) {
    const pts = g.points.map((q) => [...this.plan(q), this.z(q)]);
    const c = centre(pts);
    let w = walls[0];
    if (walls.length > 1) {
      let bd = Infinity;
      for (const x of walls) { const d = closestOnSegment(c[0], c[1], x.x1, x.y1, x.x2, x.y2).d; if (d < bd) { bd = d; w = x; } }
    }
    const f = wallFrame(w);
    const us = pts.map((q) => (q[0] - w.x1) * f.d[0] + (q[1] - w.y1) * f.d[1]);
    const zs = pts.map((q) => q[2]);
    const [u1, u2] = extent(us), [z1, z2] = extent(zs);
    const fe = fillerId !== null ? this.ents.get(fillerId) : null;
    const kind = !fe ? "opening" : fe.type.startsWith("IFCDOOR") ? "door" : "window";
    const lv = this.levels.find((l) => l.id === w.level);
    const width = (fe && num(fe.args[9]) > 0 ? num(fe.args[9]) * this.lu : u2 - u1);
    const height = (fe && num(fe.args[8]) > 0 ? num(fe.args[8]) * this.lu : z2 - z1);
    const o = { id: uid("o"), wall: w.id, kind, at: r3((u1 + u2) / 2), width: r3(width), height: r3(height), sill: r3(Math.max(0, z1 - lv.elevation)), side: 1, hinge: "start" };
    if (fe) {
      const objectType = (str(fe.args[4]) || "").toLowerCase();
      const op = kind === "door" ? enm(fe.args[11]) || "" : "";
      if ((kind === "door" ? DOOR_TYPES : WINDOW_TYPES).includes(objectType)) o.type = objectType;
      else if (op.startsWith("DOUBLE_DOOR_SLIDING") || op.startsWith("SLIDING")) o.type = "sliding";
      else if (op.startsWith("DOUBLE")) o.type = "double";
      else if (op === "ROLLINGUP") o.type = "garage";
      if (op.endsWith("_RIGHT") && !op.includes("DOUBLE")) o.hinge = "end";
    }
    this.openings.push(this.applyBim(o, fillerId, openingId));
  }

  // -------------------------------------------------------------- spaces, columns, slabs
  readSpaces() {
    for (const id of this.byType.get("IFCSPACE") || []) {
      this.consumed.add(id);
      const g = this.geometry(id);
      const fp = this.footprint(g);
      if (!fp || fp.length < 3) { this.count("spaceNoGeometry"); continue; }
      const lv = this.levelFor(id, g.M);
      const pts = dedupe(fp.map((q) => this.plan(q)));
      if (pts.length < 3) { this.count("spaceNoGeometry"); continue; }
      // Name is the room number when a LongName carries the room name.
      const name = str(g.e.args[2]), longName = str(g.e.args[7]);
      const room = { id: uid("r"), level: lv.id, name: longName || name || "", pts };
      if (longName && name && name !== longName) room.number = name;
      this.rooms.push(this.applyBim(room, id));
    }
  }

  readColumns() {
    for (const id of this.all(COLUMN_TYPES)) {
      this.consumed.add(id);
      const g = this.geometry(id);
      const lv = this.levelFor(id, g.M);
      const x = g.ext;
      let col = null;
      if (x && x.vertical && (x.prof.kind === "rect" || x.prof.kind === "circle")) {
        const M = mmul(x.Mpos, x.prof.P);
        const o = this.plan(mapply(M, [0, 0, 0]));
        const ax = mdir(M, [1, 0, 0]);
        const rot = r3((-Math.atan2(ax[1], ax[0]) * 180) / Math.PI);
        col = x.prof.kind === "rect"
          ? { shape: "rect", w: x.prof.x * this.lu, d: x.prof.y * this.lu }
          : { shape: "round", w: 2 * x.prof.r * this.lu, d: 2 * x.prof.r2 * this.lu };
        Object.assign(col, { x: o[0], y: o[1], rot, height: x.height * this.lu });
      } else if (g.points.length) {
        const pts = g.points.map((q) => this.plan(q));
        const r = orientedRect(pts);
        const [z1, z2] = extent(g.points.map((q) => this.z(q)));
        col = { shape: "rect", x: r3(r.cx), y: r3(r.cy), w: r.len, d: r.wid, rot: r3(r.angle), height: z2 - z1 };
      }
      if (!col) { this.count("columnNoGeometry"); continue; }
      this.columns.push(this.applyBim({ id: uid("c"), level: lv.id, ...col, w: r3(col.w), d: r3(col.d), height: r3(col.height) }, id));
    }
  }

  readSlabs() {
    for (const id of this.all(SLAB_TYPES)) {
      const parent = this.ents.get(this.parent.get(id));
      if (parent && parent.type === "IFCROOF") continue; // read with the roof
      this.consumed.add(id);
      const e = this.ents.get(id);
      if (enm(e.args[8]) === "ROOF") { this.roofWithBim(id, [id]); continue; }
      const g = this.geometry(id);
      const lv = this.levelFor(id, g.M);
      if (!this.floorSlabs.has(lv.id)) this.floorSlabs.set(lv.id, []);
      if (g.ext && g.ext.vertical) this.floorSlabs.get(lv.id).push(g.ext.height * this.lu);
      else this.floorSlabs.get(lv.id).push(null);
    }
  }

  // -------------------------------------------------------------- roofs
  readRoofs() {
    for (const id of this.byType.get("IFCROOF") || []) {
      this.consumed.add(id);
      const kids = this.children.get(id) || [];
      for (const k of kids) this.consumed.add(k);
      const slabs = kids.filter((k) => SLAB_TYPES.includes(this.ents.get(k).type));
      this.roofWithBim(id, [id, ...(slabs.length ? slabs : kids)]);
    }
  }

  roofWithBim(id, partIds) {
    const first = this.roofs.length;
    this.readRoof(id, partIds);
    for (const r of this.roofs.slice(first)) this.applyBim(r, id);
  }

  readRoof(id, partIds) {
    const e = this.ents.get(id);
    const lv = this.levelFor(id, this.placement(e.args[5]));
    const geoms = partIds.map((pid) => this.geometry(pid)).filter((g) => g.points.length);
    if (!geoms.length) { this.count("roofNoGeometry"); return; }
    const props = this.props(id);
    const pset = (k) => props.get(`MyArchitecture_Roof.${k}`);
    const overhang = num(pset("Overhang"), 0) * this.lu;
    // Flat: every part is a vertical extrusion.
    if (geoms.every((g) => g.ext && g.ext.vertical && g.leaves.length === 1)) {
      for (const g of geoms) {
        let pts = dedupe(g.ext.bottom.map((q) => this.plan(q)));
        if (overhang > 0) { const inner = offsetPolygon(pts, overhang); if (polygonArea(inner) * polygonArea(pts) > 0) pts = inner.map(([x, y]) => [r3(x), r3(y)]); }
        const th = g.ext.height * this.lu;
        this.roofs.push({ id: uid("rf"), level: lv.id, kind: "flat", pts, pitch: 0, overhang: r3(overhang), thickness: r3(th), _top: (g.ext.base + g.ext.height) * this.lu });
      }
      return;
    }
    const faces = geoms.flatMap((g) => g.faces).map((f) => f.map((q) => [...this.plan(q), this.z(q)]));
    const all = faces.flat();
    const r = orientedRect(all.map((q) => [q[0], q[1]]));
    // Sloped upward faces (world z-up normals; the plan y flip does not change z).
    const up = [];
    for (const f of geoms.flatMap((g) => g.faces)) {
      const nrm = newell(f);
      const l = len3(nrm);
      if (l < 1e-9) continue;
      const nz = nrm[2] / l;
      if (nz > 0.05 && nz < 0.9995) up.push({ f, slope: (Math.acos(nz) * 180) / Math.PI });
    }
    const measured = up.length ? Math.max(...up.map((u) => u.slope)) : 0;
    const pitch = num(pset("Pitch"), r3(measured));
    const [zmin, zmax] = extent(all.map((q) => q[2]));
    const eaveTop = up.length ? extent(up.flatMap((u) => u.f.map((q) => this.z(q))))[0] : zmax;
    const thickness = num(pset("Thickness")) !== null ? num(pset("Thickness")) * this.lu : eaveTop - zmin > 1 ? eaveTop - zmin : 200;
    const type = enm(e.args[8]);
    const byType = { GABLE_ROOF: "gable", HIP_ROOF: "hip", SHED_ROOF: "shed", FLAT_ROOF: "flat" }[type];
    let kind = str(pset("Kind"));
    if (!["flat", "gable", "hip", "shed"].includes(kind)) kind = byType || (up.length <= 1 ? "shed" : up.length === 2 ? "gable" : "hip");
    if (!pset("Kind")) this.count("roofApprox");
    const L = Math.max(1, r.len / 2 - overhang), W = Math.max(1, r.wid / 2 - overhang);
    const pts = [[-L, -W], [L, -W], [L, W], [-L, W]].map(([u, v]) => { const [x, y] = rotPt(u, v, r.angle); return [r3(r.cx + x), r3(r.cy + y)]; });
    const tan = Math.tan((pitch * Math.PI) / 180);
    const roof = { id: uid("rf"), level: lv.id, kind, pts, pitch, overhang: r3(overhang), thickness: r3(thickness), _top: eaveTop + overhang * tan };
    const rot = num(pset("Rotation"), 0);
    if (rot) roof.rot = rot;
    this.roofs.push(roof);
  }

  // -------------------------------------------------------------- stairs
  readStairs() {
    const flights = new Set(this.byType.get("IFCSTAIRFLIGHT") || []);
    const stairs = (this.byType.get("IFCSTAIR") || []).map((id) => {
      const kids = this.children.get(id) || [];
      for (const k of kids) { this.consumed.add(k); flights.delete(k); }
      const useful = kids.filter((k) => ["IFCSTAIRFLIGHT", ...SLAB_TYPES].includes(this.ents.get(k).type));
      return [id, [id, ...(useful.length ? useful : kids)]];
    });
    for (const id of flights) stairs.push([id, [id]]);
    for (const [id, parts] of stairs) {
      this.consumed.add(id);
      const e = this.ents.get(id);
      const M = this.placement(e.args[5]);
      const inv = minv(M);
      const pts = parts.flatMap((pid) => this.geometry(pid).points).map((q) => mapply(inv, q));
      if (!pts.length) { this.count("stairNoGeometry"); continue; }
      const [x1, x2] = extent(pts.map((q) => q[0])), [y1, y2] = extent(pts.map((q) => q[1])), [z1, z2] = extent(pts.map((q) => q[2]));
      const b = { x1, x2, y1, y2, z1, z2 };
      const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
      let axis = [1, 0, 0];
      let length = b.x2 - b.x1, width = b.y2 - b.y1;
      if (width > length) { axis = [0, 1, 0]; [length, width] = [width, length]; }
      // Point the stair up: the highest point lies at its top end.
      const top = pts.reduce((a, q) => (q[2] > a[2] ? q : a));
      if ((top[0] - cx) * axis[0] + (top[1] - cy) * axis[1] < 0) axis = axis.map((c) => -c);
      const wa = mdir(M, axis);
      const c = this.plan(mapply(M, [cx, cy, b.z1]));
      const risers = parts.map((pid) => this.ents.get(pid)).find((x) => x.type === "IFCSTAIRFLIGHT" && num(x.args[8]) > 0);
      const height = (b.z2 - b.z1) * this.lu;
      const lv = this.levelFor(id, M);
      this.stairs.push(this.applyBim({
        id: uid("s"), level: lv.id, x: c[0], y: c[1], rot: r3((-Math.atan2(wa[1], wa[0]) * 180) / Math.PI),
        length: r3(length * this.lu), width: r3(width * this.lu), steps: risers ? Math.round(num(risers.args[8])) : Math.max(2, Math.round(height / 175)),
      }, id));
    }
  }

  // -------------------------------------------------------------- mass models
  // Proxies with a MyArchitecture_Mass set, and other proxies whose body is a
  // single vertical extrusion (taper 1). Anything else stays skipped.
  readSolids() {
    this.solids = [];
    for (const id of this.byType.get("IFCBUILDINGELEMENTPROXY") || []) {
      if (this.consumed.has(id)) continue;
      const props = this.props(id);
      const own = props.has("MyArchitecture_Mass.Height");
      const g = this.geometry(id);
      const lv = this.levelFor(id, g.M);
      let solid = null;
      if (own) {
        const fp = this.footprint(g);
        const pset = (k) => props.get(`MyArchitecture_Mass.${k}`);
        if (fp && fp.length >= 3) {
          solid = {
            pts: dedupe(fp.map((q) => this.plan(q))), z0: r3(num(pset("Z0"), 0) * this.lu), height: r3(num(pset("Height"), 0) * this.lu),
            taper: Math.max(0, Math.min(1, num(pset("Taper"), 1))), material: str(pset("Material")) || "concrete",
          };
        }
      } else if (g.ext && g.ext.vertical && g.leaves.length === 1) {
        solid = { pts: dedupe(g.ext.bottom.map((q) => this.plan(q))), z0: r3(g.ext.base * this.lu - lv.elevation), height: r3(g.ext.height * this.lu), taper: 1, material: "concrete" };
      }
      if (!solid || solid.pts.length < 3) continue;
      this.consumed.add(id);
      const name = str(g.e.args[2]);
      const m = { id: uid("m"), level: lv.id, ...solid };
      if (name && name !== "Mass") m.name = name;
      this.solids.push(this.applyBim(m, id));
    }
  }

  // -------------------------------------------------------------- furniture
  readFurniture() {
    for (const id of this.all(FURNITURE_ENTITY_TYPES)) {
      this.consumed.add(id);
      const g = this.geometry(id);
      if (!g.points.length) { this.count("furnitureNoGeometry"); continue; }
      const inv = minv(g.M);
      const pts = g.points.map((q) => mapply(inv, q));
      const [lx, hx] = extent(pts.map((q) => q[0])), [ly, hy] = extent(pts.map((q) => q[1])), [lz, hz] = extent(pts.map((q) => q[2]));
      const base = mapply(g.M, [(lx + hx) / 2, (ly + hy) / 2, lz]);
      const ax = mdir(g.M, [1, 0, 0]);
      const lv = this.levelFor(id, g.M);
      const name = str(g.e.args[2]);
      const c = this.plan(base);
      this.furniture.push(this.applyBim({
        id: uid("f"), level: lv.id, kind: name && furnitureDef(name) ? name : "box", x: c[0], y: c[1],
        rot: r3((-Math.atan2(ax[1], ax[0]) * 180) / Math.PI), w: r3((hx - lx) * this.lu), d: r3((hy - ly) * this.lu), h: r3((hz - lz) * this.lu),
        elevation: r3(this.z(base) - lv.elevation), color: null,
      }, id));
    }
  }

  // -------------------------------------------------------------- grids, site
  readGrids() {
    this.grids = [];
    for (const id of this.byType.get("IFCGRID") || []) {
      this.consumed.add(id);
      const e = this.ents.get(id);
      const M = this.placement(e.args[5]);
      const seen = new Set();
      for (const aid of [...refs(e.args[7]), ...refs(e.args[8]), ...refs(e.args[9])]) {
        const ax = this.ents.get(aid);
        if (seen.has(aid) || !ax || ax.type !== "IFCGRIDAXIS") continue;
        seen.add(aid);
        let pts = this.curve(this.get(ax.args[1])).map((q) => this.plan(mapply(M, q)));
        if (pts.length < 2) continue;
        if (enm(ax.args[2]) === "F") pts = pts.reverse();
        const a = pts[0], b = pts[pts.length - 1];
        this.grids.push({ id: uid("g"), x1: a[0], y1: a[1], x2: b[0], y2: b[1], label: str(ax.args[0]) || "" });
      }
    }
  }

  // IfcSite RefLatitude / RefLongitude (deg, min, s, millionths of s).
  readSite() {
    const id = (this.byType.get("IFCSITE") || [])[0];
    const e = id ? this.ents.get(id) : null;
    const angle = (v) => {
      const list = Array.isArray(v) ? v.map((x) => num(x, 0)) : null;
      if (!list || !list.length) return null;
      const sign = list.some((x) => x < 0) ? -1 : 1;
      const [d = 0, m = 0, s = 0, us = 0] = list.map(Math.abs);
      return Math.round(sign * (d + m / 60 + s / 3600 + us / 3.6e9) * 1e9) / 1e9;
    };
    this.site = e ? { latitude: angle(e.args[9]), longitude: angle(e.args[10]) } : { latitude: null, longitude: null };
  }

  // -------------------------------------------------------------- finishing
  finishLevels() {
    const { levels } = this;
    levels.forEach((lv, i) => {
      const next = levels[i + 1];
      let h = next ? next.elevation - lv.elevation : null;
      if (!(h >= 100)) {
        const wallH = this.walls.filter((w) => w.level === lv.id && w.height).map((w) => w.height);
        h = lv.qty !== null && lv.qty * this.lu >= 100 ? lv.qty * this.lu : wallH.length ? Math.max(...wallH) : 2800;
      }
      lv.height = r3(h);
      const slabs = (this.floorSlabs.get(lv.id) || []).filter((t) => t > 0);
      if (slabs.length) lv.slab = r3(Math.max(...slabs));
      const hasRooms = this.rooms.some((r) => r.level === lv.id);
      if (!hasRooms && this.floorSlabs.has(lv.id)) this.count("floorSlabs", this.floorSlabs.get(lv.id).length);
    });
    const levelOf = new Map(levels.map((l) => [l.id, l]));
    for (const w of this.walls) if (w.height !== null && Math.abs(w.height - levelOf.get(w.level).height) < 0.5) w.height = null;
    for (const c of this.columns) if (Math.abs(c.height - levelOf.get(c.level).height) < 0.5) delete c.height;
    for (const r of this.roofs) {
      const lv = levelOf.get(r.level);
      const off = r3(r._top - (lv.elevation + lv.height));
      if (Math.abs(off) >= 0.5) r.offset = off;
      delete r._top;
    }
  }

  // An IfcProduct occurrence we did not read (heuristic: GlobalId + placement).
  isProduct(e) {
    const a = e.args;
    if (a.length < 8 || typeof a[0] !== "string" || a[0].length !== 22) return false;
    if (e.type.endsWith("TYPE") || e.type.endsWith("STYLE")) return false;
    const plc = this.get(a[5]);
    const shape = this.get(a[6]);
    if (a[5] !== null && !(plc && (plc.type === "IFCLOCALPLACEMENT" || plc.type === "IFCGRIDPLACEMENT"))) return false;
    return a[6] === null || (shape && shape.type === "IFCPRODUCTDEFINITIONSHAPE");
  }

  report() {
    const skipped = new Map();
    for (const [id, e] of this.ents) {
      if (this.consumed.has(id) || SPATIAL.has(e.type) || !this.isProduct(e)) continue;
      skipped.set(e.type, (skipped.get(e.type) || 0) + 1);
    }
    for (const [t, n] of [...skipped].sort((a, b) => b[1] - a[1])) this.warnings.push(`${n} ${ifcName(t)} skipped`);
    for (const [k, n] of Object.entries(this.counts)) if (n && WARNINGS[k]) this.warnings.push(WARNINGS[k](n));
    const stats = {};
    for (const [t, ids] of this.byType) stats[ifcName(t)] = ids.length;
    return stats;
  }

  run() {
    const schema = ((this.header.FILE_SCHEMA || [])[0] || []).map((x) => String(x)).join(",").toUpperCase();
    if (schema && !/IFC(2X3|4)/.test(schema)) this.warnings.push(`Unknown schema ${schema}; reading it like IFC4`);
    if (!this.ents.size) throw new Error("not an IFC file (no STEP entities found)");
    this.readUnits();
    this.index();
    this.readStoreys();
    this.readWallTypes();
    this.readWalls();
    this.readOpenings();
    this.readSpaces();
    this.readColumns();
    this.readSlabs();
    this.readRoofs();
    this.readStairs();
    this.readFurniture();
    this.readSolids();
    this.readGrids();
    this.readSite();
    this.finishLevels();
    const stats = this.report();

    const p = newProject(this.title || "Imported IFC");
    p.levels = this.levels.map(({ id, name, elevation, height, slab }) => ({ id, name, elevation, height, slab }));
    p.walls = this.walls;
    p.openings = this.openings;
    p.rooms = this.rooms;
    p.columns = this.columns;
    p.stairs = this.stairs;
    p.roofs = this.roofs;
    p.furniture = this.furniture;
    p.solids = this.solids;
    p.grids = this.grids;
    // Wall types come from the file; a file without any keeps the default library.
    if (this.wallTypes.length) p.wallTypes = this.wallTypes;
    if (this.classSystem) p.meta.classificationSystem = this.classSystem;
    if (this.site.latitude !== null) p.meta.latitude = this.site.latitude;
    if (this.site.longitude !== null) p.meta.longitude = this.site.longitude;
    const ctx = (this.byType.get("IFCGEOMETRICREPRESENTATIONCONTEXT") || []).map((id) => this.ents.get(id)).find((c) => this.get(c.args[5]));
    if (ctx) {
      const tn = this.coords(ctx.args[5]);
      const north = r3((Math.atan2(tn[0], tn[1]) * 180) / Math.PI);
      if (Math.abs(north) > 0.01) p.meta.north = north;
    }
    normalizeProject(p);
    p.view.level = p.levels[0].id;
    return { project: p, warnings: this.warnings, stats };
  }
}

// [min, max] of a list, without spreading it into arguments (meshes can be large).
function extent(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0));

function centre(pts) {
  const [x1, x2] = extent(pts.map((q) => q[0])), [y1, y2] = extent(pts.map((q) => q[1]));
  return [(x1 + x2) / 2, (y1 + y2) / 2];
}

// Drop repeated consecutive points (and a closing duplicate).
function dedupe(pts) {
  const out = [];
  for (const q of pts) if (!out.length || Math.hypot(q[0] - out[out.length - 1][0], q[1] - out[out.length - 1][1]) > 0.01) out.push(q);
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 0.01) out.pop();
  return out;
}

function boxFaces(M, a, b) {
  const P = (x, y, z) => mapply(M, [x ? b[0] : a[0], y ? b[1] : a[1], z ? b[2] : a[2]]);
  return [
    [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)],
    [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], [P(1, 1, 0), P(0, 1, 0), P(0, 1, 1), P(1, 1, 1)],
    [P(0, 1, 0), P(0, 0, 0), P(0, 0, 1), P(0, 1, 1)], [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)],
  ];
}

// IFC STEP text → {project, warnings, stats}.
export function importIfc(text) {
  return new IfcReader(parseStepFile(text)).run();
}
