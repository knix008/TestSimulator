// The project document: one schematic + one board + project-local libraries.
//
// Everything the editors, engines and exporters need lives in this one plain
// JSON object, so saving is JSON.stringify and every module can be tested in
// Node without a DOM.
//
// project = {
//   format: "mycircuit", version: 1,
//   meta: {title, author, company, rev, date, comment},
//   library: {symbols: [...], footprints: [...]},      // user-made, see src/lib
//   schematic: {
//     sheet: "A4" | "A3" | "A2" | "Letter",
//     pages: [{id, name}],                                 // every item below may carry `page` (default: first page)
//     parts:      [{id, lib, ref, value, footprint, x, y, rot, mirror, fields:{}, dnp, refOffset?, valueOffset?}],
//     wires:      [{id, x1, y1, x2, y2}],
//     buses:      [{id, x1, y1, x2, y2}],                // drawn only, carry no connectivity
//     junctions:  [{id, x, y}],
//     labels:     [{id, kind: "local"|"global", text, x, y, rot}],
//     noconnects: [{id, x, y}],
//     texts:      [{id, text, x, y, size, rot}],
//     sheets:     [{id, page, x, y, w, h, name, target, pins: [{id, name, side: "L"|"R", offset}]}]
//                 hierarchical sheet blocks: the block sits on `page`, its pins
//                 connect to hierarchical labels (kind "hier") on page `target`.
//     dimensions: [{id, page, x1, y1, x2, y2, offset}]   drawing dimensions (mils)
//   },
//   pcb: {
//     layerCount: 2 | 4,
//     thickness: 1.6, maskColor: "green", silkColor: "white", finish: "HASL",
//     outline: [[x,y], ...],                               // closed polygon, mm
//     footprints: [{id, partId, ref, value, footprint, x, y, rot, side: "F"|"B", padNets:{num: net}, locked, refPos:{x,y}?, hideValue}],
//     tracks: [{id, layer, net, w, x1, y1, x2, y2}],
//     vias:   [{id, x, y, d, drill, net}],
//     zones:  [{id, layer, net, pts: [[x,y],...], clearance, thermal, priority}],
//     texts:  [{id, layer, text, x, y, size, rot, mirror}],
//     graphics: [{id, layer, kind: "line"|"rect"|"circle", x1,y1,x2,y2 | cx,cy,r, w}],
//     dimensions: [{id, x1, y1, x2, y2, offset}],
//     rules: {clearance, trackWidth, viaDiameter, viaDrill, minTrackWidth, minDrill, edgeClearance, holeToHole,
//             netClasses: [{name, trackWidth, clearance, viaDiameter, viaDrill, nets: []}]},
//   },
//   sim: {mode: "op"|"tran"|"ac", tStop, tStep, fStart, fStop, points, probes: [net...]},
// }

import { uid } from "./geom.js";
import { registerUserSymbols } from "../lib/symbols.js";
import { registerUserFootprints } from "../lib/footprints.js";

export const FORMAT = "mycircuit";
export const VERSION = 1;

export const COPPER_LAYERS = {
  2: ["F.Cu", "B.Cu"],
  4: ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"],
  6: ["F.Cu", "In1.Cu", "In2.Cu", "In3.Cu", "In4.Cu", "B.Cu"],
};

export const NON_COPPER_LAYERS = ["F.SilkS", "B.SilkS", "F.Mask", "B.Mask", "F.Paste", "B.Paste", "F.Fab", "B.Fab", "F.CrtYd", "B.CrtYd", "Edge.Cuts", "Dwgs.User"];

export function copperLayers(pcb) {
  return COPPER_LAYERS[pcb.layerCount] || COPPER_LAYERS[2];
}

export function defaultRules() {
  return {
    clearance: 0.2,
    trackWidth: 0.25,
    viaDiameter: 0.8,
    viaDrill: 0.4,
    minTrackWidth: 0.15,
    minDrill: 0.3,
    edgeClearance: 0.3,
    holeToHole: 0.25,
    netClasses: [{ name: "Power", trackWidth: 0.5, clearance: 0.25, viaDiameter: 1.0, viaDrill: 0.5, nets: ["GND", "VCC", "+5V", "+3V3", "+12V", "-12V", "VBAT"] }],
  };
}

export function newProject(title = "Untitled") {
  return {
    format: FORMAT,
    version: VERSION,
    meta: { title, author: "", company: "", rev: "1.0", date: new Date().toISOString().slice(0, 10), comment: "" },
    library: { symbols: [], footprints: [] },
    schematic: { sheet: "A4", pages: [{ id: "p1", name: "Main" }], parts: [], wires: [], buses: [], junctions: [], labels: [], noconnects: [], texts: [], sheets: [], dimensions: [] },
    pcb: {
      layerCount: 2,
      thickness: 1.6,
      maskColor: "green",
      silkColor: "white",
      finish: "HASL",
      outline: [[0, 0], [60, 0], [60, 40], [0, 40]],
      footprints: [], tracks: [], vias: [], zones: [], texts: [], graphics: [], dimensions: [],
      rules: defaultRules(),
    },
    sim: { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] },
  };
}

// Fill in anything a hand-written or older file may be missing, and give every
// object an id. Returns the same (mutated) object.
export function normalizeProject(p) {
  if (!p || typeof p !== "object") throw new Error("not a project");
  if (p.format && p.format !== FORMAT) throw new Error(`unknown format ${p.format}`);
  const base = newProject();
  p.format = FORMAT;
  p.version = p.version || VERSION;
  p.meta = { ...base.meta, ...(p.meta || {}) };
  p.library = { symbols: [], footprints: [], ...(p.library || {}) };
  p.schematic = { ...base.schematic, ...(p.schematic || {}) };
  for (const key of ["parts", "wires", "buses", "junctions", "labels", "noconnects", "texts", "sheets", "dimensions"]) {
    if (!Array.isArray(p.schematic[key])) p.schematic[key] = [];
    for (const o of p.schematic[key]) if (!o.id) o.id = uid(key[0]);
  }
  if (!Array.isArray(p.schematic.pages) || !p.schematic.pages.length) p.schematic.pages = [{ id: "p1", name: "Main" }];
  for (const pg of p.schematic.pages) { if (!pg.id) pg.id = uid("pg"); if (!pg.name) pg.name = "Page"; }
  for (const part of p.schematic.parts) {
    part.rot = part.rot || 0;
    part.mirror = !!part.mirror;
    part.fields = part.fields || {};
    if (part.value == null) part.value = "";
    if (part.footprint == null) part.footprint = "";
  }
  for (const l of p.schematic.labels) { l.kind = l.kind || "local"; l.rot = l.rot || 0; }
  p.pcb = { ...base.pcb, ...(p.pcb || {}) };
  p.pcb.rules = { ...defaultRules(), ...(p.pcb.rules || {}) };
  for (const key of ["footprints", "tracks", "vias", "zones", "texts", "graphics", "dimensions"]) {
    if (!Array.isArray(p.pcb[key])) p.pcb[key] = [];
    for (const o of p.pcb[key]) if (!o.id) o.id = uid(key[0]);
  }
  for (const fp of p.pcb.footprints) {
    fp.rot = fp.rot || 0;
    fp.side = fp.side === "B" ? "B" : "F";
    fp.padNets = fp.padNets || {};
  }
  for (const z of p.pcb.zones) {
    if (z.clearance == null) z.clearance = 0.3;
    if (z.thermal == null) z.thermal = true;
    z.priority = z.priority || 0;
  }
  if (!Array.isArray(p.pcb.outline) || p.pcb.outline.length < 3) p.pcb.outline = base.pcb.outline;
  p.sim = { ...base.sim, ...(p.sim || {}) };
  registerProjectLibrary(p);
  return p;
}

export function registerProjectLibrary(p) {
  registerUserSymbols(p.library.symbols);
  registerUserFootprints(p.library.footprints);
}

export function serializeProject(p) {
  return JSON.stringify(p, null, 1);
}

export function parseProject(text) {
  const data = JSON.parse(text);
  return normalizeProject(data);
}

export function cloneProject(p) {
  return JSON.parse(JSON.stringify(p));
}

// ---------------------------------------------------------------- engineering numbers
const SI = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

// "4k7" -> 4700, "10u" -> 1e-5, "1Meg" -> 1e6, "2.2nF" -> 2.2e-9, "5V" -> 5.
export function parseValue(text) {
  if (typeof text === "number") return text;
  let s = String(text ?? "").trim().replace(/Ω|ohms?|Ohms?/g, "");
  if (!s) return NaN;
  s = s.replace(/meg/i, "M");
  const m = s.match(/^([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*([fpnuµmkKMGT]?)(\d*)\s*[A-Za-z]*$/);
  if (m) {
    const mul = m[2] ? SI[m[2]] : 1;
    let num = parseFloat(m[1]);
    if (m[3]) num = parseFloat(`${m[1]}.${m[3]}`);
    return num * mul;
  }
  // 4k7 style: digits, prefix, digits
  const r = s.match(/^(\d+)([fpnuµmkKMGTR])(\d+)\s*[A-Za-z]*$/);
  if (r) {
    const mul = r[2] === "R" ? 1 : SI[r[2]];
    return parseFloat(`${r[1]}.${r[3]}`) * mul;
  }
  return NaN;
}

export function formatValue(v, unit = "", digits = 3) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return `0${unit ? " " + unit : ""}`;
  const a = Math.abs(v);
  const table = [[1e12, "T"], [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"]];
  for (const [mul, pre] of table) {
    if (a >= mul * 0.9995) {
      const n = v / mul;
      return `${+n.toPrecision(digits)} ${pre}${unit}`.trim();
    }
  }
  return `${v.toExponential(2)} ${unit}`.trim();
}
