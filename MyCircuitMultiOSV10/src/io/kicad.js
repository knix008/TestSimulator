// KiCad 6/7/8/9 import: .kicad_sch -> schematic + symbols, .kicad_pcb -> board
// + footprints, or both at once into a complete project.
//
// Conventions (verified against KiCad demo projects in test/unit/kicad.test.mjs):
//
// Schematic
//   * KiCad schematics are millimetres, y down. We store mils: round(mm / 0.0254).
//     KiCad's 1.27 mm grid is exactly 50 mil, so normal files land on grid.
//   * Library symbols (lib_symbols) are y UP: every library y is negated.
//   * A library pin's (at x y angle) is its connection point; the angle is the
//     direction from that point towards the body (0 right, 90 up, 180 left,
//     270 down in the library's y-up frame) -> our dir R/U/L/D, which also
//     points from the tip towards the body.
//   * A placed symbol's (at x y angle) rotates the symbol `angle` degrees
//     counter-clockwise on screen, the same sense as our `rot`.
//     (mirror y) flips the drawn symbol left/right and (mirror x) flips it
//     top/bottom, applied after the rotation in screen space. Our xform
//     mirrors local x *before* rotating, so
//        mirror y, angle a -> {mirror: true, rot: -a}
//        mirror x, angle a -> {mirror: true, rot: 180 - a}
//   * Sub-symbols "NAME_U_S": unit U (0 = shared by every unit), body style S
//     (0 = shared by every style, 2 = De Morgan alternate, skipped).
//   * Label (at x y angle): 0 = text runs right of the anchor, 90 up,
//     180 left, 270 down — the same as our label rot.
//
// Board
//   * Millimetres, y down, same as ours. Footprint (at x y angle) rotates
//     counter-clockwise on screen like our rot.
//   * Pad (at x y angle): x/y are footprint-local (unrotated); the angle is the
//     pad's absolute orientation (it already includes the footprint angle).
//   * Footprints on B.Cu are stored flipped: KiCad mirrors their local
//     geometry top/bottom (y -> -y) and negates the angle. Our board mirrors
//     back-side parts at transform time (local x -> -x, then rotate), so the
//     front-side local geometry is (x, -y) and our rot is the KiCad angle + 180.

import { parseSexpr, head, child, children, value, num, str, flag, xy, at, atoms } from "./sexpr.js";
import { uid, rotatePoint, polygonArea, round } from "../core/geom.js";
import { newProject, normalizeProject, NON_COPPER_LAYERS, COPPER_LAYERS, defaultRules } from "../core/project.js";
import { getFootprint, autoCourtyard } from "../lib/footprints.js";

const MIL = 0.0254;
const mil = (mm) => Math.round((Number(mm) || 0) / MIL) + 0; // + 0 turns -0 into 0
const nmil = (mm) => 0 - mil(mm);
const norm360 = (a) => { const r = ((Number(a) || 0) % 360 + 360) % 360; return Math.abs(r - 360) < 1e-9 ? 0 : round(r, 6); };

// ---------------------------------------------------------------- detection
export function detectKicadFile(text) {
  const s = String(text ?? "").replace(/^﻿/, "").slice(0, 4096);
  const m = s.match(/^\s*\(\s*([A-Za-z_]+)/);
  if (!m) return null;
  if (m[1] === "kicad_sch") return "schematic";
  if (m[1] === "kicad_pcb") return "pcb";
  return null;
}

// ---------------------------------------------------------------- shared geometry
// Circle through three points, or null when they are (nearly) collinear.
function circleFrom3(a, b, c) {
  const [ax, ay] = a, [bx, by] = b, [cx, cy] = c;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

const mod360 = (a) => ((a % 360) + 360) % 360;

// Three points in a y-down frame -> our arc {cx, cy, r, a1, a2}: degrees,
// counter-clockwise on screen from a1 up to a2 (a2 > a1).
function arcFrom3(s, m, e) {
  const c = circleFrom3(s, m, e);
  if (!c) return null;
  const ang = ([x, y]) => (Math.atan2(-(y - c.cy), x - c.cx) * 180) / Math.PI;
  const aS = ang(s), aM = ang(m), aE = ang(e);
  const dM = mod360(aM - aS);
  const dE = mod360(aE - aS) || 360;
  const [start, sweep] = dM <= dE ? [aS, dE] : [aE, 360 - dE];
  // Keep a1 in [0, 360), letting a hair below 0 (float noise in KiCad's
  // rounded mid points) stay near 0 rather than wrap to 360.
  let a1 = mod360(start);
  if (360 - a1 < 1e-3) a1 -= 360;
  return { cx: c.cx, cy: c.cy, r: c.r, a1, a2: a1 + sweep };
}

// Points along a three-point arc (any frame), ending exactly on `e`.
function flattenArc(s, m, e, stepDeg = 10) {
  const c = circleFrom3(s, m, e);
  if (!c) return [s, e];
  const t = ([x, y]) => Math.atan2(y - c.cy, x - c.cx);
  const tS = t(s), tM = t(m), tE = t(e);
  const TWO = Math.PI * 2;
  const md = (v) => ((v % TWO) + TWO) % TWO;
  const dM = md(tM - tS);
  const dE = md(tE - tS) || TWO;
  const sweep = dM <= dE ? dE : dE - TWO;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep * 180 / Math.PI) / stepDeg));
  const out = [s];
  for (let i = 1; i < steps; i++) {
    const a = tS + (sweep * i) / steps;
    out.push([c.cx + c.r * Math.cos(a), c.cy + c.r * Math.sin(a)]);
  }
  out.push(e);
  return out;
}

// KiCad's pre-6 style arc: centre, start point, sweep angle (degrees,
// clockwise on screen when positive). Returns start/mid/end.
function legacyArc(center, start, angle) {
  const rot = (p, deg) => {
    const [x, y] = rotatePoint(p[0] - center[0], p[1] - center[1], -deg);
    return [center[0] + x, center[1] + y];
  };
  return { start, mid: rot(start, angle / 2), end: rot(start, angle) };
}

function bezierPoints(p, steps = 8) {
  if (p.length !== 4) return p;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ]);
  }
  return out;
}

// (pts ...) including (arc ...) entries -> flat point list.
function ptsList(node, stepDeg = 10) {
  const p = child(node, "pts");
  if (!p) return [];
  const out = [];
  for (const c of children(p)) {
    if (c[0] === "xy") out.push([Number(c[1]) || 0, Number(c[2]) || 0]);
    else if (c[0] === "arc") {
      const s = xy(c, "start"), m = xy(c, "mid"), e = xy(c, "end");
      if (s && m && e) {
        const f = flattenArc(s, m, e, stepDeg);
        if (out.length && Math.hypot(out[out.length - 1][0] - s[0], out[out.length - 1][1] - s[1]) < 1e-9) f.shift();
        out.push(...f);
      }
    }
  }
  return out;
}

function strokeWidth(node, def = 0) {
  const s = child(node, "stroke");
  if (s && child(s, "width")) return num(s, "width", 1, def);
  if (child(node, "width")) return num(node, "width", 1, def);
  return def;
}

function fillType(node) {
  const f = child(node, "fill");
  if (!f) return "none";
  const t = value(f, "type");
  if (t != null) return String(t);
  // KiCad 9 board graphics: (fill yes|no|solid)
  const v = f[1];
  if (v === "yes" || v === "solid") return "solid";
  return "none";
}

function makeWarner() {
  const list = [];
  const counts = new Map();
  const warn = (msg) => {
    counts.set(msg, (counts.get(msg) || 0) + 1);
    if (counts.get(msg) === 1) list.push(msg);
  };
  const finish = () => list.map((m) => (counts.get(m) > 1 ? `${m} (×${counts.get(m)})` : m));
  return { warn, finish };
}

// ================================================================ schematic
const PIN_TYPES = {
  input: "input", output: "output", bidirectional: "bidir", tri_state: "tristate", passive: "passive",
  power_in: "power_in", power_out: "power_out", open_collector: "open_collector", open_emitter: "open_collector",
  unspecified: "unspecified", no_connect: "no_connect", unconnected: "no_connect", free: "passive",
};
const PIN_DIRS = { 0: "R", 90: "U", 180: "L", 270: "D" };

function props(node) {
  const out = {};
  for (const p of children(node, "property")) if (typeof p[1] === "string") out[p[1]] = p[2] == null ? "" : String(p[2]);
  return out;
}

function stripLib(id) {
  const s = String(id || "");
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(i + 1) : s;
}

// Library symbol graphics -> body primitives (y negated: library is y-up).
function convertGraphic(g, warn) {
  const P = ([x, y]) => [mil(x), nmil(y)];
  const fill = (t) => (t === "outline" || t === "color" ? "fg" : t === "background" ? "body" : undefined);
  const w = strokeWidth(g, 0);
  const wm = w > 0.2 ? 2 : undefined;
  switch (g[0]) {
    case "polyline": {
      const p = ptsList(g).map(P);
      if (p.length < 2) return null;
      const f = fill(fillType(g));
      if (f && p.length >= 3) return { t: "poly", pts: p, fill: f };
      return wm ? { t: "line", pts: p, w: wm } : { t: "line", pts: p };
    }
    case "bezier": {
      const p = bezierPoints(ptsList(g)).map(P);
      return p.length >= 2 ? { t: "line", pts: p } : null;
    }
    case "rectangle": {
      const s = xy(g, "start"), e = xy(g, "end");
      if (!s || !e) return null;
      const [x1, y1] = P(s), [x2, y2] = P(e);
      const o = { t: "rect", x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
      const f = fill(fillType(g));
      if (f) o.fill = f;
      return o;
    }
    case "circle": {
      const c = xy(g, "center");
      if (!c) return null;
      const [cx, cy] = P(c);
      const o = { t: "circle", cx, cy, r: mil(num(g, "radius")) };
      const f = fill(fillType(g));
      if (f) o.fill = f;
      return o;
    }
    case "arc": {
      let s = xy(g, "start"), m = xy(g, "mid"), e = xy(g, "end");
      if (!m) {
        // KiCad 6 transitional form: (radius (at x y) (length r) (angles a1 a2))
        const rad = child(g, "radius");
        if (rad) {
          const c = xy(rad, "at"), r = num(rad, "length"), ang = child(rad, "angles");
          if (c && ang) {
            const a1 = Number(ang[1]) || 0, a2 = Number(ang[2]) || 0;
            const cx = mil(c[0]), cy = nmil(c[1]);
            return { t: "arc", cx, cy, r: mil(r), a1: Math.min(a1, a2), a2: Math.max(a1, a2) };
          }
        }
        warn("Arc without a mid point skipped");
        return null;
      }
      // Work in exact mils (unrounded) so the centre stays accurate.
      const Q = ([x, y]) => [x / MIL, -y / MIL];
      const a = arcFrom3(Q(s), Q(m), Q(e));
      if (!a) return { t: "line", pts: [P(s), P(e)] };
      return { t: "arc", cx: Math.round(a.cx) + 0, cy: Math.round(a.cy) + 0, r: Math.round(a.r), a1: round(a.a1, 2) + 0, a2: round(a.a2, 2) + 0 };
    }
    case "text": {
      const a = at(g);
      if (!a) return null;
      const eff = child(g, "effects");
      const font = eff && child(eff, "font");
      const size = font ? num(font, "size", 1, 1.27) : 1.27;
      const just = eff && child(eff, "justify");
      const anchor = just && just.includes("left") ? "start" : just && just.includes("right") ? "end" : "middle";
      return { t: "text", x: mil(a.x), y: nmil(a.y), text: String(g[1] ?? ""), size: mil(size), anchor };
    }
    case "text_box": {
      const s = xy(g, "start") || (at(g) && [at(g).x, at(g).y]);
      if (!s) return null;
      return { t: "text", x: mil(s[0]), y: nmil(s[1]), text: String(g[1] ?? ""), size: 50, anchor: "start" };
    }
    default:
      return null;
  }
}

function convertPin(p, symFlags, warn) {
  const a = at(p) || { x: 0, y: 0, angle: 0 };
  const ang = norm360(a.angle);
  let dir = PIN_DIRS[Math.round(ang / 90) * 90 % 360];
  if (ang % 90) warn("Pin at a non-orthogonal angle rounded to the nearest 90°");
  const nameNode = child(p, "name");
  const numNode = child(p, "number");
  const name = nameNode ? String(nameNode[1] ?? "") : "";
  const number = numNode ? String(numNode[1] ?? "") : "";
  const type = PIN_TYPES[p[1]] || "passive";
  const pin = { num: number, name: name || "~", x: mil(a.x), y: nmil(a.y), dir, len: mil(num(p, "length", 1, 2.54)), type };
  if (symFlags.hideNames || name === "~" || name === "") pin.hideName = true;
  if (symFlags.hideNums) pin.hideNum = true;
  if (flag(p, "hide")) pin.hidden = true;
  return pin;
}

// One lib_symbols entry -> our symbol definition.
function convertLibSymbol(node, libMap, warn, seen = new Set()) {
  const name = String(node[1]);
  let base = null;
  const ext = value(node, "extends");
  if (ext != null && !seen.has(name)) {
    const parentNode = libMap.get(ext) || [...libMap.entries()].find(([k]) => stripLib(k) === ext)?.[1];
    if (parentNode) base = convertLibSymbol(parentNode, libMap, warn, new Set([...seen, name]));
    else warn(`Symbol ${name} extends ${ext}, which is not in the file`);
  }
  const pr = props(node);
  const pinNames = child(node, "pin_names");
  const pinNums = child(node, "pin_numbers");
  const symFlags = {
    hideNames: !!(pinNames && flag(pinNames, "hide")),
    hideNums: !!(pinNums && flag(pinNums, "hide")),
  };
  const isPower = flag(node, "power") || !!child(node, "power");
  // Group graphics and pins by unit (style 0/1 only).
  const unitsMap = new Map(); // unit -> {body, pins, name}
  const take = (u) => {
    if (!unitsMap.has(u)) unitsMap.set(u, { body: [], pins: [], name: null });
    return unitsMap.get(u);
  };
  const addItems = (src, u) => {
    const bucket = take(u);
    for (const g of children(src)) {
      if (g[0] === "pin") bucket.pins.push(convertPin(g, symFlags, warn));
      else if (g[0] === "symbol" || g[0] === "property") continue;
      else {
        const b = convertGraphic(g, warn);
        if (b) bucket.body.push(b);
      }
    }
  };
  addItems(node, 0);
  for (const sub of children(node, "symbol")) {
    const m = String(sub[1]).match(/_(\d+)_(\d+)$/);
    const u = m ? +m[1] : 0;
    const style = m ? +m[2] : 1;
    if (style > 1) { warn(`De Morgan alternate body style of ${name} skipped`); continue; }
    addItems(sub, u);
    const un = value(sub, "unit_name");
    if (un) take(u).name = String(un);
  }
  const common = take(0);
  const unitNums = [...unitsMap.keys()].filter((u) => u > 0).sort((a, b) => a - b);
  const sym = {
    name,
    title: stripLib(name),
    category: "KiCad",
    refPrefix: (pr.Reference ?? "U").replace(/\?+$/, "") || "U",
    value: pr.Value ?? stripLib(name),
    footprints: pr.Footprint ? [stripLib(pr.Footprint)] : [],
    keywords: [pr.ki_keywords, pr.Description, pr.ki_description].filter(Boolean).join(" "),
    source: "kicad",
    body: [...common.body],
    pins: [...common.pins],
  };
  if (base) {
    // Derived symbol: geometry from the parent, fields from the child.
    sym.body = base.body; sym.pins = base.pins;
    if (base.units) sym.units = base.units;
  }
  const declaredUnits = Math.max(unitNums.length ? unitNums[unitNums.length - 1] : 0, 1);
  if (!base) {
    if (declaredUnits <= 1) {
      const u1 = unitsMap.get(1);
      if (u1) { sym.body.push(...u1.body); sym.pins.push(...u1.pins); }
    } else {
      sym.units = [];
      for (let u = 1; u <= declaredUnits; u++) {
        const b = unitsMap.get(u) || { body: [], pins: [], name: null };
        sym.units.push({ name: b.name || unitLetter(u), body: b.body, pins: b.pins });
      }
    }
  }
  if (isPower) {
    const allPins = [...sym.pins, ...(sym.units || []).flatMap((u) => u.pins)];
    const isFlag = /PWR_FLAG/i.test(sym.value) || /PWR_FLAG/i.test(name) || (allPins.length && allPins.every((p) => p.type === "power_out"));
    sym.category = "Power";
    if (isFlag) sym.flag = true;
    else sym.power = sym.value || stripLib(name);
  } else {
    const hiddenPower = [...sym.pins, ...(sym.units || []).flatMap((u) => u.pins)].filter((p) => p.hidden && p.type === "power_in");
    if (hiddenPower.length) warn(`Symbol ${name} has hidden power pins (${hiddenPower.map((p) => p.name).join(", ")}); KiCad joins them to the net of the same name implicitly`);
  }
  if (pr.Datasheet && pr.Datasheet !== "~") sym.fields = { Datasheet: pr.Datasheet };
  return sym;
}

function unitLetter(u) {
  let s = "";
  let n = u;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

// Placed symbol orientation -> our {rot, mirror}.
export function kicadSymbolTransform(angle, mirror) {
  const a = norm360(angle);
  if (mirror === "y") return { rot: norm360(-a), mirror: true };
  if (mirror === "x") return { rot: norm360(180 - a), mirror: true };
  return { rot: a, mirror: false };
}

// Library footprint name -> one of ours when an obvious match exists.
export function mapFootprintName(full) {
  const name = stripLib(full);
  if (!name) return "";
  if (getFootprint(name)) return name;
  const tries = [];
  let m;
  if ((m = name.match(/^(R|C|L|LED|Fuse)_(0402|0603|0805|1206)(?:_|$)/))) tries.push(`${m[1]}_${m[2]}`);
  if ((m = name.match(/^(Pin(?:Header|Socket))_(\dx\d\d)_P2\.54mm/))) tries.push(`PinHeader_${m[2]}_P2.54mm`);
  if ((m = name.match(/^(SOIC-\d+)_3\.9x([\d.]+)mm/))) tries.push(`${m[1]}_3.9x${m[2]}mm`);
  if ((m = name.match(/^(DIP-\d+)_W7\.62mm/))) tries.push(`${m[1]}_W7.62mm`);
  if ((m = name.match(/^(TQFP-32_7x7mm_P0\.8mm)/))) tries.push(m[1]);
  if ((m = name.match(/^CP_Radial_D([\d.]+)mm_P([\d.]+)mm/))) tries.push(`CP_Radial_D${(+m[1]).toFixed(1)}mm_P${(+m[2]).toFixed(2)}mm`);
  if ((m = name.match(/^LED_D([\d.]+)mm/))) tries.push(`LED_D${(+m[1]).toFixed(1)}mm`);
  if ((m = name.match(/^R_Axial_DIN0207_.*_P([\d.]+)mm/))) tries.push(`R_Axial_P${(+m[1]).toFixed(2)}mm`);
  if (/^SOT-23(_|$)/.test(name)) tries.push("SOT-23");
  if (/^SOT-223/.test(name)) tries.push("SOT-223-3");
  if (/^D_SOD-123(_|$)/.test(name)) tries.push("D_SOD-123");
  if (/^TO-92_Inline/.test(name)) tries.push("TO-92_Inline");
  if (/^TO-220-3_Vertical/.test(name)) tries.push("TO-220-3_Vertical");
  if (/^MountingHole_3\.2mm/.test(name)) tries.push("MountingHole_3.2mm");
  if (/^Crystal_HC49-U/.test(name)) tries.push("Crystal_HC49-U");
  for (const t of tries) if (getFootprint(t)) return t;
  return name;
}

const SHEETS = { A4: "A4", A3: "A3", A2: "A2", USLetter: "Letter", Letter: "Letter", A5: "A4", A1: "A2", A0: "A2", USLegal: "Letter", USLedger: "A3", A: "Letter", B: "A3", C: "A2", D: "A2", E: "A2" };

function labelRot(angle) {
  return Math.round(norm360(angle) / 90) * 90 % 360;
}

export function importKicadSchematic(text, { pageName } = {}) {
  const root = typeof text === "string" ? parseSexpr(text) : text;
  if (head(root) !== "kicad_sch") throw new Error("Not a KiCad schematic (.kicad_sch, KiCad 6 or newer)");
  const { warn, finish } = makeWarner();
  const version = num(root, "version");
  if (version && version < 20211014) warn(`File version ${version} is older than KiCad 6.0; some items may not import`);

  // ---- library symbols
  const libNode = child(root, "lib_symbols");
  const libMap = new Map();
  for (const s of children(libNode, "symbol")) libMap.set(String(s[1]), s);
  const symbols = [];
  const symByName = new Map();
  for (const [name, node] of libMap) {
    try {
      const sym = convertLibSymbol(node, libMap, warn);
      symbols.push(sym);
      symByName.set(name, sym);
    } catch (e) {
      warn(`Symbol ${name} could not be converted: ${e.message}`);
    }
  }

  // ---- KiCad 6 keeps references in a root-level table
  const legacyInst = new Map();
  for (const p of children(child(root, "symbol_instances"), "path")) {
    const path = String(p[1] || "");
    legacyInst.set(path.split("/").pop(), { reference: value(p, "reference"), unit: value(p, "unit"), value: value(p, "value"), footprint: value(p, "footprint") });
  }

  const sch = { sheet: "A4", pages: [{ id: "p1", name: pageName || "Main" }], parts: [], wires: [], buses: [], junctions: [], labels: [], noconnects: [], texts: [] };
  const paper = child(root, "paper");
  if (paper) {
    const p = String(paper[1] || "A4");
    sch.sheet = SHEETS[p] || "A4";
    if (!SHEETS[p]) warn(`Paper size ${p} is not supported; using A4`);
    else if (SHEETS[p] !== p) warn(`Paper size ${p} mapped to ${SHEETS[p]}`);
  }
  const tb = child(root, "title_block");
  const titleBlock = tb ? {
    title: str(tb, "title"), date: str(tb, "date"), rev: str(tb, "rev"), company: str(tb, "company"),
    comment: children(tb, "comment").map((c) => String(c[2] ?? "")).filter(Boolean).join(" / "),
  } : null;

  // ---- placed symbols
  for (const s of children(root, "symbol")) {
    const libId = String(value(s, "lib_id") ?? "");
    const lib = String(value(s, "lib_name") ?? libId);
    const sym = symByName.get(lib) || symByName.get(libId);
    if (!sym) warn(`Symbol ${lib} is not in lib_symbols`);
    const a = at(s) || { x: 0, y: 0, angle: 0 };
    const mirror = value(s, "mirror");
    const t = kicadSymbolTransform(a.angle, mirror);
    if (norm360(a.angle) % 90) warn("Symbol at a non-orthogonal angle");
    const pr = props(s);
    const uuid = String(value(s, "uuid") ?? "");
    // Reference and unit: (instances (project (path (reference) (unit)))) wins.
    let ref = pr.Reference ?? "";
    let unit = num(s, "unit", 1, 1);
    const inst = child(s, "instances");
    if (inst) {
      const proj = children(inst, "project")[0];
      const path = proj && children(proj, "path")[0];
      if (path) {
        if (value(path, "reference") != null) ref = String(value(path, "reference"));
        if (value(path, "unit") != null) unit = num(path, "unit", 1, unit);
      }
    } else if (legacyInst.has(uuid)) {
      const li = legacyInst.get(uuid);
      if (li.reference != null) ref = String(li.reference);
      if (li.unit != null) unit = Number(li.unit) || unit;
    }
    const style = num(s, "convert", 1, num(s, "body_style", 1, 1));
    if (style > 1) warn(`${ref}: De Morgan body style not supported; drawn with the normal style`);
    const fpFull = pr.Footprint || "";
    const fields = {};
    for (const [k, v] of Object.entries(pr)) {
      if (k === "Reference" || k === "Value" || k === "Footprint" || k.startsWith("ki_")) continue;
      if (v === "" || v === "~") continue;
      fields[k] = v;
    }
    if (fpFull) fields.kicadFootprint = fpFull;
    const part = {
      id: uid("p"), lib: sym ? sym.name : lib, ref, value: pr.Value ?? (sym ? sym.value : ""),
      footprint: fpFull ? mapFootprintName(fpFull) : "",
      x: mil(a.x), y: mil(a.y), rot: t.rot, mirror: t.mirror, fields,
      dnp: flag(s, "dnp"),
    };
    if (sym && sym.units && sym.units.length > 1) part.unit = Math.max(1, Math.min(sym.units.length, unit));
    else if (unit > 1 && sym && !sym.units) warn(`${ref}: unit ${unit} of a single-unit symbol`);
    // Field positions (absolute in KiCad) -> offsets from the part, as our
    // renderer draws them left-aligned at the offset.
    const fieldPos = (name) => {
      const p = children(s, "property").find((q) => q[1] === name);
      if (!p) return null;
      const pa = at(p);
      const eff = child(p, "effects");
      if (!pa || (eff && flag(eff, "hide")) || flag(p, "hide")) return null;
      const font = eff && child(eff, "font");
      const size = mil(font ? num(font, "size", 1, 1.27) : 1.27);
      const txt = name === "Reference" ? ref : part.value;
      const just = eff && child(eff, "justify");
      const width = String(txt).length * size * 0.6;
      const dx = just && just.includes("left") ? 0 : just && just.includes("right") ? -width : -width / 2;
      return { x: Math.round(mil(pa.x) - part.x + dx), y: Math.round(mil(pa.y) - part.y + size * 0.35) };
    };
    if (sym && !sym.power && !sym.flag) {
      const ro = fieldPos("Reference");
      const vo = fieldPos("Value");
      if (ro) part.refOffset = ro;
      if (vo) part.valueOffset = vo;
    }
    sch.parts.push(part);
  }

  // ---- wires, buses, junctions, no-connects
  for (const w of children(root, "wire")) {
    const p = ptsList(w).map(([x, y]) => [mil(x), mil(y)]);
    for (let i = 1; i < p.length; i++) sch.wires.push({ id: uid("w"), x1: p[i - 1][0], y1: p[i - 1][1], x2: p[i][0], y2: p[i][1] });
  }
  for (const b of children(root, "bus")) {
    const p = ptsList(b).map(([x, y]) => [mil(x), mil(y)]);
    for (let i = 1; i < p.length; i++) sch.buses.push({ id: uid("b"), x1: p[i - 1][0], y1: p[i - 1][1], x2: p[i][0], y2: p[i][1] });
  }
  for (const e of children(root, "bus_entry")) {
    const a = at(e);
    const sz = xy(e, "size") || [2.54, 2.54];
    if (a) sch.buses.push({ id: uid("b"), x1: mil(a.x), y1: mil(a.y), x2: mil(a.x + sz[0]), y2: mil(a.y + sz[1]), entry: true });
  }
  for (const j of children(root, "junction")) {
    const a = at(j);
    if (a) sch.junctions.push({ id: uid("j"), x: mil(a.x), y: mil(a.y) });
  }
  for (const n of children(root, "no_connect")) {
    const a = at(n);
    if (a) sch.noconnects.push({ id: uid("n"), x: mil(a.x), y: mil(a.y) });
  }

  // ---- labels
  const labelKinds = { label: "local", global_label: "global", hierarchical_label: "hier" };
  for (const [tag, kind] of Object.entries(labelKinds)) {
    for (const l of children(root, tag)) {
      const a = at(l);
      if (!a) continue;
      const o = { id: uid("l"), kind, text: String(l[1] ?? ""), x: mil(a.x), y: mil(a.y), rot: labelRot(a.angle) };
      const shape = value(l, "shape");
      if (shape && kind !== "local") o.shape = String(shape);
      sch.labels.push(o);
    }
  }
  for (const tag of ["directive_label", "netclass_flag"]) {
    const n = children(root, tag).length;
    if (n) warn(`${n} ${tag.replace("_", " ")}(s) skipped (no connectivity meaning here)`);
  }

  // ---- texts
  for (const t of children(root, ["text", "text_box"])) {
    const a = at(t) || (xy(t, "start") && { x: xy(t, "start")[0], y: xy(t, "start")[1], angle: 0 });
    if (!a) continue;
    const eff = child(t, "effects");
    const font = eff && child(eff, "font");
    const size = mil(font ? num(font, "size", 1, 1.27) : 1.27);
    sch.texts.push({ id: uid("t"), text: String(t[1] ?? ""), x: mil(a.x), y: mil(a.y), size, rot: labelRot(a.angle) });
  }
  const graphicCount = ["polyline", "rectangle", "circle", "arc", "bezier", "image"].reduce((n, k) => n + children(root, k).length, 0);
  if (graphicCount) warn(`${graphicCount} schematic graphic item(s) (lines, shapes, images) skipped`);

  // ---- hierarchical sheets
  const sheets = [];
  for (const sh of children(root, "sheet")) {
    const a = at(sh) || { x: 0, y: 0 };
    const size = xy(sh, "size") || [0, 0];
    const pr = props(sh);
    const name = pr.Sheetname ?? pr["Sheet name"] ?? "Sheet";
    const file = pr.Sheetfile ?? pr["Sheet file"] ?? "";
    const pins = children(sh, "pin").map((p) => {
      const pa = at(p) || { x: 0, y: 0, angle: 0 };
      return { name: String(p[1] ?? ""), type: String(p[2] ?? "passive"), x: mil(pa.x), y: mil(pa.y), rot: labelRot(pa.angle) };
    });
    sheets.push({ name, file, uuid: String(value(sh, "uuid") ?? ""), x: mil(a.x), y: mil(a.y), w: mil(size[0]), h: mil(size[1]), pins });
    sch.texts.push({ id: uid("t"), text: `[Sheet ${name}: ${file}]`, x: mil(a.x), y: mil(a.y) + 60, size: 50, rot: 0 });
  }
  if (sheets.length) warn(`${sheets.length} hierarchical sheet(s) imported as notes only; import their files as extra pages`);

  return { schematic: sch, symbols, sheets, titleBlock, warnings: finish() };
}

// ================================================================ board
const NONCU = new Set(NON_COPPER_LAYERS);
function mapGraphicLayer(name) {
  const n = String(name || "");
  if (NONCU.has(n)) return n;
  const alias = { "F.Silkscreen": "F.SilkS", "B.Silkscreen": "B.SilkS", "F.Courtyard": "F.CrtYd", "B.Courtyard": "B.CrtYd", "F.Mask": "F.Mask", "B.Mask": "B.Mask" };
  if (alias[n]) return alias[n];
  if (/^(Cmts|Eco\d|User\.\d+|Dwgs)\.?User$/.test(n) || /^User\.\d+$/.test(n) || n === "Cmts.User" || n === "Eco1.User" || n === "Eco2.User" || n === "Margin") return "Dwgs.User";
  return null;
}
const isCopper = (l) => /^(F|B|In\d+)\.Cu$/.test(String(l || ""));

function netNameOf(node, netTable) {
  const c = child(node, "net");
  if (!c) return "";
  if (typeof c[2] === "string") return c[2];
  if (typeof c[1] === "string" && !/^\d+$/.test(c[1])) return c[1];
  return netTable.get(Number(c[1])) || "";
}

// Board-space shape items (Edge.Cuts or graphics) from a gr_* / fp_* node,
// flattened to segments and circles. `P` maps a raw point to output space.
function shapeSegments(g, P, stepDeg = 10) {
  const kind = g[0].replace(/^(gr|fp)_/, "");
  const segs = [];
  const loops = [];
  const circles = [];
  const add = (a, b) => segs.push([P(a), P(b)]);
  if (kind === "line") {
    const s = xy(g, "start"), e = xy(g, "end");
    if (s && e) add(s, e);
  } else if (kind === "rect") {
    const s = xy(g, "start"), e = xy(g, "end");
    if (s && e) loops.push([[s[0], s[1]], [e[0], s[1]], [e[0], e[1]], [s[0], e[1]]].map(P));
  } else if (kind === "circle") {
    const c = xy(g, "center"), e = xy(g, "end");
    if (c && e) circles.push({ c, r: Math.hypot(e[0] - c[0], e[1] - c[1]) });
  } else if (kind === "arc") {
    let s = xy(g, "start"), m = xy(g, "mid"), e = xy(g, "end");
    if (!m && child(g, "angle")) {
      const la = legacyArc(s, e, num(g, "angle"));
      s = la.start; m = la.mid; e = la.end;
    }
    if (s && m && e) {
      const f = flattenArc(s, m, e, stepDeg);
      for (let i = 1; i < f.length; i++) add(f[i - 1], f[i]);
    }
  } else if (kind === "poly") {
    const p = ptsList(g, stepDeg);
    if (p.length >= 3) loops.push(p.map(P));
    else if (p.length === 2) add(p[0], p[1]);
  } else if (kind === "curve") {
    const p = bezierPoints(ptsList(g));
    for (let i = 1; i < p.length; i++) add(p[i - 1], p[i]);
  }
  return { segs, loops, circles };
}

// Join loose segments into closed loops (and leftover open chains).
function chainSegments(segs, tol = 0.01) {
  const rest = segs.map((s) => [s[0], s[1]]);
  const near = (a, b) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
  const loops = [];
  const open = [];
  while (rest.length) {
    const first = rest.pop();
    const path = [first[0], first[1]];
    let grown = true;
    while (grown && !(path.length > 2 && near(path[0], path[path.length - 1]))) {
      grown = false;
      const end = path[path.length - 1];
      for (let i = 0; i < rest.length; i++) {
        const [a, b] = rest[i];
        if (near(a, end)) { path.push(b); rest.splice(i, 1); grown = true; break; }
        if (near(b, end)) { path.push(a); rest.splice(i, 1); grown = true; break; }
      }
      if (!grown) {
        // Try growing from the front instead.
        const startPt = path[0];
        for (let i = 0; i < rest.length; i++) {
          const [a, b] = rest[i];
          if (near(a, startPt)) { path.unshift(b); rest.splice(i, 1); grown = true; break; }
          if (near(b, startPt)) { path.unshift(a); rest.splice(i, 1); grown = true; break; }
        }
      }
    }
    if (path.length > 3 && near(path[0], path[path.length - 1])) loops.push(path.slice(0, -1));
    else open.push(path);
  }
  return { loops, open };
}

function circlePoly(c, r, n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

const CHIP3D = { "0402": [1.0, 0.5, 0.35], "0603": [1.6, 0.8, 0.45], "0805": [2.0, 1.25, 0.5], "1206": [3.2, 1.6, 0.6], "1210": [3.2, 2.5, 0.6], "2512": [6.3, 3.2, 0.6] };

// Best-effort 3D model from the KiCad footprint name.
export function guessModel3d(name, pads = []) {
  const n = String(name || "");
  let m;
  const padSpan = (axis) => {
    const v = pads.map((p) => p[axis]);
    return v.length ? Math.max(...v) - Math.min(...v) : 0;
  };
  if ((m = n.match(/^(R|C|L|LED|D|Fuse)_(0402|0603|0805|1206|1210|2512)(?:_|$)/))) {
    const [L, W, H] = CHIP3D[m[2]];
    const body = { R: "resistor", C: "capacitor", L: "inductor", LED: "led", D: "led", Fuse: "fuse" }[m[1]];
    return { kind: "chip", L, W, H, body, polarity: m[1] === "LED" || m[1] === "D" };
  }
  if ((m = n.match(/^(?:SOIC|SOP|SSOP|TSSOP|MSOP|HTSSOP)-(\d+)(?:[-_].*?([\d.]+)x([\d.]+)mm)?(?:.*?_P([\d.]+)mm)?/))) {
    const W = m[2] ? +m[2] : 3.9, L = m[3] ? +m[3] : undefined, pitch = m[4] ? +m[4] : /TSSOP|MSOP|SSOP/.test(n) ? 0.65 : 1.27;
    return { kind: "soic", n: +m[1], W, ...(L ? { L } : {}), H: 1.5, span: padSpan("x") + 0.6 || W + 2.1, pitch };
  }
  if ((m = n.match(/^(?:LQFP|TQFP|QFP|QFN|VQFN|WQFN|DFN)-(\d+)\S*?_([\d.]+)x[\d.]+mm(?:.*?_P([\d.]+)mm)?/))) {
    const W = +m[2];
    return { kind: "qfp", n: +m[1], W, H: /QFN|DFN/.test(n) ? 0.9 : 1.2, pitch: m[3] ? +m[3] : 0.5, span: Math.max(padSpan("x"), padSpan("y")) + 1 || W + 2 };
  }
  if ((m = n.match(/^DIP-(\d+)_W([\d.]+)mm/))) return { kind: "dip", n: +m[1], pitch: 2.54, row: +m[2] };
  if ((m = n.match(/^Pin(?:Header|Socket)_(\d+)x(\d+)_P([\d.]+)mm/))) return { kind: "header", rows: +m[1], n: +m[2], pitch: +m[3] };
  if (/^SOT-23(-\d)?(_|$)/.test(n)) return { kind: "sot23", W: 2.9, L: 1.3, H: 1.0 };
  if (/^SOT-223/.test(n)) return { kind: "sot223", W: 3.5, L: 6.5, H: 1.6 };
  if (/^TO-92/.test(n)) return { kind: "to92", cx: padSpan("x") / 2 || 1.27, D: 4.8, H: 4.8 };
  if (/^TO-220/.test(n)) return { kind: "to220", cx: padSpan("x") / 2 || 2.54, W: 10, T: 4.5, H: 15 };
  if ((m = n.match(/^Crystal_HC49.*?(?:_P?([\d.]+)mm)?$/))) return { kind: "crystal", pitch: padSpan("x") || 4.88, L: 10.9, W: 4.6, H: 3.6 };
  if (/^D_SOD-123/.test(n)) return { kind: "sod123", L: 2.7, W: 1.6, H: 1.1 };
  if ((m = n.match(/^CP_Radial_D([\d.]+)mm_P([\d.]+)mm/))) return { kind: "radial", pitch: +m[2], D: +m[1], H: +m[1] * 1.4 + 2 };
  if ((m = n.match(/^C_Disc_D([\d.]+)mm.*?_P([\d.]+)mm/))) return { kind: "disc", pitch: +m[2], D: +m[1], T: 2.5 };
  if ((m = n.match(/^LED_D([\d.]+)mm/))) return { kind: "led", pitch: padSpan("x") || 2.54, D: +m[1], H: +m[1] * 1.7 };
  if ((m = n.match(/^R_Axial_DIN\d+_L([\d.]+)mm_D([\d.]+)mm_P([\d.]+)mm/))) return { kind: "axial", pitch: +m[3], L: +m[1], D: +m[2], body: "resistor" };
  if ((m = n.match(/^D_DO-41.*?_P([\d.]+)mm/))) return { kind: "axial", pitch: +m[1], L: 5.2, D: 2.7, body: "diode" };
  if (/^MountingHole/.test(n)) return { kind: "hole" };
  if (/^TestPoint/.test(n)) return { kind: "testpoint" };
  if (/^USB_Micro-B/.test(n)) return { kind: "usb", W: 7.5, D: 5.0, H: 2.5, cy: -1.0 };
  return { kind: "box" };
}

const PAD_SHAPES = { rect: "rect", circle: "circle", oval: "oval", roundrect: "roundrect", trapezoid: "rect", custom: "rect", chamfered_rect: "roundrect" };

function convertFootprint(node, netTable, warn) {
  const libName = String(node[1] ?? "");
  const name = stripLib(libName) || "Footprint";
  const layer = str(node, "layer", 1, "F.Cu");
  const back = layer === "B.Cu";
  const a = at(node) || { x: 0, y: 0, angle: 0 };
  const theta = Number(a.angle) || 0;
  const L = back ? ([x, y]) => [x, -y] : ([x, y]) => [x, y];
  const r5 = (v) => round(v, 5) + 0;
  const own = back ? "B" : "F";
  const other = back ? "F" : "B";

  // ---- pads
  const pads = [];
  const padNets = {};
  const padsAbs = [];
  for (const p of children(node, "pad")) {
    const num0 = p[1] == null ? "" : String(p[1]);
    const type = String(p[2] ?? "smd");
    const shape0 = String(p[3] ?? "rect");
    const pa = at(p) || { x: 0, y: 0, angle: 0 };
    const [lx, ly] = L([pa.x, pa.y]);
    const phi = Number(pa.angle) || 0;
    const size = xy(p, "size") || [1, 1];
    const shape = PAD_SHAPES[shape0] || "rect";
    if (shape0 === "custom") warn(`Custom-shaped pads imported as rectangles of their anchor size`);
    if (shape0 === "trapezoid") warn("Trapezoid pads imported as rectangles");
    const pad = { num: num0, shape, x: r5(lx), y: r5(ly), w: r5(size[0]), h: r5(shape === "circle" ? size[0] : size[1]) };
    // Every pad shape we have is point-symmetric, so 0..180 covers all.
    const localRot = round(norm360(back ? theta - phi : phi - theta) % 180, 6);
    if (localRot) pad.rot = localRot;
    const layersList = atoms(child(p, "layers")).map(String);
    const drillNode = child(p, "drill");
    if (drillNode) {
      const nums = atoms(drillNode).filter((v) => typeof v === "number");
      if (nums.length) {
        const oval = atoms(drillNode).includes("oval");
        pad.drill = r5(oval && nums.length > 1 ? Math.min(nums[0], nums[1]) : nums[0]);
        if (oval && nums.length > 1 && nums[0] !== nums[1]) warn("Oval (slot) drills imported as round holes of the smaller size");
      }
    }
    if (type === "thru_hole" || type === "np_thru_hole") {
      pad.layers = "*";
      if (type === "np_thru_hole") { pad.npth = true; pad.num = ""; if (!pad.drill) pad.drill = pad.w; }
      if (!pad.drill) pad.drill = r5(Math.min(pad.w, pad.h) / 2);
    } else {
      // smd / connect: on the footprint's own side unless only the other side is listed.
      const hasOwn = layersList.some((l) => l === `${own}.Cu` || l === "*.Cu" || l === "F&B.Cu");
      const hasOther = layersList.some((l) => l === `${other}.Cu`);
      if (!hasOwn && hasOther) {
        pad.layers = "B";
        warn("SMD pads on the far side of their footprint (e.g. edge connectors) are marked layers \"B\"");
      } else if (!hasOwn && !hasOther) {
        continue; // mask/paste-only aperture
      } else pad.layers = "F";
      delete pad.drill;
    }
    pads.push(pad);
    const net = netNameOf(p, netTable);
    if (net && !pad.npth) padNets[pad.num] = net;
    // Absolute KiCad position (for diagnostics/tests).
    const [ax, ay] = rotatePoint(pa.x, pa.y, theta);
    padsAbs.push({ num: pad.num, x: a.x + ax, y: a.y + ay });
  }

  // ---- silk + courtyard (front-local)
  const silkLayer = `${own}.SilkS`;
  const crtLayer = `${own}.CrtYd`;
  const silk = [];
  let crt = null;
  const crtAdd = (x, y) => {
    if (!crt) crt = { x1: x, y1: y, x2: x, y2: y };
    crt.x1 = Math.min(crt.x1, x); crt.y1 = Math.min(crt.y1, y); crt.x2 = Math.max(crt.x2, x); crt.y2 = Math.max(crt.y2, y);
  };
  const edge = { segs: [], loops: [], circles: [] };
  for (const g of children(node, ["fp_line", "fp_rect", "fp_circle", "fp_arc", "fp_poly", "fp_curve"])) {
    const gl = str(g, "layer");
    const w = r5(strokeWidth(g, 0.12) || 0.12);
    if (gl === "Edge.Cuts") {
      // Board edge drawn inside a footprint: absolute board coordinates.
      const P = ([x, y]) => { const [rx, ry] = rotatePoint(x, y, theta); return [a.x + rx, a.y + ry]; };
      const sh = shapeSegments(g, P);
      edge.segs.push(...sh.segs); edge.loops.push(...sh.loops);
      for (const c of sh.circles) edge.circles.push({ c: P(c.c), r: c.r });
      continue;
    }
    if (gl !== silkLayer && gl !== crtLayer) continue;
    const isCrt = gl === crtLayer;
    const k = g[0];
    if (k === "fp_line") {
      const s = xy(g, "start"), e = xy(g, "end");
      if (!s || !e) continue;
      const [x1, y1] = L(s), [x2, y2] = L(e);
      if (isCrt) { crtAdd(x1, y1); crtAdd(x2, y2); } else silk.push({ t: "line", x1: r5(x1), y1: r5(y1), x2: r5(x2), y2: r5(y2), w });
    } else if (k === "fp_rect") {
      const s = xy(g, "start"), e = xy(g, "end");
      if (!s || !e) continue;
      const [x1, y1] = L(s), [x2, y2] = L(e);
      if (isCrt) { crtAdd(x1, y1); crtAdd(x2, y2); } else silk.push({ t: "rect", x1: r5(Math.min(x1, x2)), y1: r5(Math.min(y1, y2)), x2: r5(Math.max(x1, x2)), y2: r5(Math.max(y1, y2)), w });
    } else if (k === "fp_circle") {
      const c = xy(g, "center"), e = xy(g, "end");
      if (!c || !e) continue;
      const [cx, cy] = L(c);
      const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
      if (isCrt) { crtAdd(cx - r, cy - r); crtAdd(cx + r, cy + r); } else silk.push({ t: "circle", cx: r5(cx), cy: r5(cy), r: r5(r), w });
    } else if (k === "fp_arc") {
      let s = xy(g, "start"), m = xy(g, "mid"), e = xy(g, "end");
      if (!m && child(g, "angle") && s && e) { const la = legacyArc(s, e, num(g, "angle")); s = la.start; m = la.mid; e = la.end; }
      if (!s || !m || !e) continue;
      const arc = arcFrom3(L(s), L(m), L(e));
      if (isCrt) { for (const p of flattenArc(L(s), L(m), L(e))) crtAdd(p[0], p[1]); continue; }
      if (!arc) { const [x1, y1] = L(s), [x2, y2] = L(e); silk.push({ t: "line", x1: r5(x1), y1: r5(y1), x2: r5(x2), y2: r5(y2), w }); continue; }
      silk.push({ t: "arc", cx: r5(arc.cx), cy: r5(arc.cy), r: r5(arc.r), a1: round(arc.a1, 3) + 0, a2: round(arc.a2, 3) + 0, w });
    } else if (k === "fp_poly" || k === "fp_curve") {
      let p = ptsList(g).map(L);
      if (k === "fp_curve") p = bezierPoints(p);
      if (isCrt) { for (const q of p) crtAdd(q[0], q[1]); continue; }
      const closed = k === "fp_poly";
      for (let i = 1; i < p.length + (closed ? 1 : 0); i++) {
        const q0 = p[i - 1], q1 = p[i % p.length];
        silk.push({ t: "line", x1: r5(q0[0]), y1: r5(q0[1]), x2: r5(q1[0]), y2: r5(q1[1]), w });
      }
    }
  }

  // ---- texts: reference / value
  const prop = (nm) => children(node, "property").find((q) => q[1] === nm) || children(node, "fp_text").find((q) => q[1] === nm.toLowerCase());
  const refNode = prop("Reference");
  const valNode = prop("Value");
  const textOf = (n) => (n ? String(n[0] === "fp_text" ? n[2] : n[2]) : "");
  const ref = textOf(refNode);
  const val = textOf(valNode);
  let refPos;
  if (refNode) {
    const ra = at(refNode);
    const hidden = flag(refNode, "hide") || flag(child(refNode, "effects"), "hide");
    if (ra && !hidden) {
      const [rx, ry] = rotatePoint(ra.x, ra.y, theta);
      refPos = { x: r5(rx), y: r5(ry) };
    }
  }
  const valLayer = valNode ? str(valNode, "layer") : "";
  const hideValue = !valNode || flag(valNode, "hide") || flag(child(valNode, "effects"), "hide") || !/SilkS$/.test(valLayer);

  const def = {
    name, title: libName, kind: pads.some((p) => p.layers === "*" && !p.npth) ? "tht" : "smd", category: "KiCad", source: "kicad",
    pads, silk,
    courtyard: crt ? { x1: r5(crt.x1), y1: r5(crt.y1), x2: r5(crt.x2), y2: r5(crt.y2) } : null,
    model3d: guessModel3d(name, pads),
  };
  if (!def.courtyard) def.courtyard = autoCourtyard(def);
  const placed = {
    id: uid("f"), ref, value: val, footprint: name, x: r5(a.x), y: r5(a.y),
    rot: norm360(back ? theta + 180 : theta), side: back ? "B" : "F", padNets, locked: flag(node, "locked") || atoms(node).includes("locked"),
    hideValue,
  };
  if (refPos) placed.refPos = refPos;
  return { def, placed, edge, padsAbs };
}

// Geometry identity of a footprint definition. KiCad re-orders items and
// leaves float noise per instance (rotated/flipped copies), so the key is
// order-independent and rounded to 1 µm.
function geometryKey(def) {
  const r = (v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  const canon = (o) => { const c = {}; for (const k of Object.keys(o).sort()) c[k] = r(o[k]); return c; };
  const silk = def.silk.map((s) => {
    let c = canon(s);
    if (s.t === "line" && (c.x1 > c.x2 || (c.x1 === c.x2 && c.y1 > c.y2))) c = { ...c, x1: c.x2, y1: c.y2, x2: c.x1, y2: c.y1 };
    return JSON.stringify(c);
  }).sort();
  const pads = def.pads.map((p) => JSON.stringify(canon(p))).sort();
  return JSON.stringify([pads, silk, def.courtyard ? canon(def.courtyard) : null]);
}

export function importKicadPcb(text) {
  const root = typeof text === "string" ? parseSexpr(text) : text;
  if (head(root) !== "kicad_pcb") throw new Error("Not a KiCad board (.kicad_pcb, KiCad 6 or newer)");
  const { warn, finish } = makeWarner();
  const version = num(root, "version");
  if (version && version < 20211014) warn(`File version ${version} is older than KiCad 6.0; some items may not import`);

  // ---- layers
  const copperNames = [];
  for (const l of children(child(root, "layers"))) {
    const nm = String(l[1] ?? "");
    if (isCopper(nm)) copperNames.push(nm);
  }
  const nCu = copperNames.length || 2;
  let layerCount = nCu;
  if (!COPPER_LAYERS[layerCount]) {
    layerCount = nCu < 2 ? 2 : nCu <= 4 ? 4 : 6;
    warn(`${nCu} copper layers mapped to a ${layerCount}-layer stack-up`);
  }
  const supported = new Set(COPPER_LAYERS[layerCount]);
  const general = child(root, "general");
  const thickness = num(general, "thickness", 1, 1.6) || 1.6;

  // ---- nets
  const netTable = new Map();
  for (const n of children(root, "net")) if (typeof n[1] === "number") netTable.set(n[1], String(n[2] ?? ""));

  const pcb = { layerCount, thickness, outline: null, footprints: [], tracks: [], vias: [], zones: [], texts: [], graphics: [], dimensions: [], rules: defaultRules() };
  const r5 = (v) => round(v, 5) + 0;
  const cuLayer = (l) => {
    if (supported.has(l)) return l;
    warn(`Copper on ${l} has no matching layer in a ${layerCount}-layer board; moved to ${COPPER_LAYERS[layerCount][1] || "In1.Cu"}`);
    return COPPER_LAYERS[layerCount].length > 2 ? COPPER_LAYERS[layerCount][COPPER_LAYERS[layerCount].length - 2] : "B.Cu";
  };

  // ---- footprints
  const defs = [];
  const defsByName = new Map(); // name -> [{key, def}]
  const edge = { segs: [], loops: [], circles: [] };
  const padsAbsolute = [];
  for (const node of children(root, ["footprint", "module"])) {
    const { def, placed, edge: fe, padsAbs } = convertFootprint(node, netTable, warn);
    edge.segs.push(...fe.segs); edge.loops.push(...fe.loops); edge.circles.push(...fe.circles);
    const key = geometryKey(def);
    const list = defsByName.get(def.name) || [];
    let found = list.find((e) => e.key === key);
    if (!found) {
      if (list.length) def.name = `${def.name}_${list.length + 1}`;
      found = { key, def };
      list.push(found);
      defsByName.set(placed.footprint, list);
      defs.push(def);
    }
    placed.footprint = found.def.name;
    pcb.footprints.push(placed);
    padsAbsolute.push({ ref: placed.ref, id: placed.id, pads: padsAbs });
  }

  // ---- tracks
  let minW = Infinity, minDrill = Infinity;
  for (const s of children(root, "segment")) {
    const a = xy(s, "start"), b = xy(s, "end");
    const l = str(s, "layer");
    if (!a || !b || !isCopper(l)) continue;
    const w = num(s, "width", 1, 0.25);
    minW = Math.min(minW, w);
    pcb.tracks.push({ id: uid("t"), layer: cuLayer(l), net: netNameOf(s, netTable), w: r5(w), x1: r5(a[0]), y1: r5(a[1]), x2: r5(b[0]), y2: r5(b[1]) });
  }
  let arcCount = 0;
  for (const s of children(root, "arc")) {
    const a = xy(s, "start"), m = xy(s, "mid"), b = xy(s, "end");
    const l = str(s, "layer");
    if (!a || !m || !b || !isCopper(l)) continue;
    arcCount++;
    const w = num(s, "width", 1, 0.25);
    minW = Math.min(minW, w);
    const net = netNameOf(s, netTable);
    const p = flattenArc(a, m, b, 10);
    for (let i = 1; i < p.length; i++) pcb.tracks.push({ id: uid("t"), layer: cuLayer(l), net, w: r5(w), x1: r5(p[i - 1][0]), y1: r5(p[i - 1][1]), x2: r5(p[i][0]), y2: r5(p[i][1]) });
  }
  if (arcCount) warn(`${arcCount} arc track(s) approximated with straight segments`);

  // ---- vias
  for (const v of children(root, "via")) {
    const a = at(v);
    if (!a) continue;
    const kind = atoms(v).find((x) => x === "blind" || x === "micro");
    if (kind) warn(`${kind} vias imported as through vias`);
    const d = num(v, "size", 1, 0.8);
    const drill = num(v, "drill", 1, 0.4);
    minDrill = Math.min(minDrill, drill);
    pcb.vias.push({ id: uid("v"), x: r5(a.x), y: r5(a.y), d: r5(d), drill: r5(drill), net: netNameOf(v, netTable) });
  }

  // ---- zones
  let keepouts = 0;
  for (const z of children(root, "zone")) {
    if (child(z, "keepout")) { keepouts++; continue; }
    let layers = [];
    if (child(z, "layers")) layers = atoms(child(z, "layers")).map(String);
    else if (child(z, "layer")) layers = [str(z, "layer")];
    const expanded = [];
    for (const l of layers) {
      if (l === "*.Cu") expanded.push(...COPPER_LAYERS[layerCount]);
      else if (l === "F&B.Cu") expanded.push("F.Cu", "B.Cu");
      else if (isCopper(l)) expanded.push(cuLayer(l));
    }
    if (!expanded.length) continue;
    const poly = child(z, "polygon");
    const p = poly ? ptsList(poly, 10) : [];
    if (p.length < 3) continue;
    const net = str(z, "net_name") || netNameOf(z, netTable);
    const cp = child(z, "connect_pads");
    const cpMode = cp ? atoms(cp).find((x) => typeof x === "string") : undefined;
    const clearance = cp ? num(cp, "clearance", 1, 0.3) : 0.3;
    const minThickness = num(z, "min_thickness", 1, 0);
    for (const l of [...new Set(expanded)]) {
      const zone = { id: uid("z"), layer: l, net, pts: p.map(([x, y]) => [r5(x), r5(y)]), clearance: r5(clearance), thermal: cpMode !== "yes", priority: num(z, "priority", 1, 0) };
      if (minThickness) zone.minWidth = r5(minThickness);
      if (child(z, "name")) zone.name = str(z, "name");
      pcb.zones.push(zone);
    }
  }
  if (keepouts) warn(`${keepouts} keep-out / rule area(s) skipped`);

  // ---- board graphics and outline
  const graphicsTags = ["gr_line", "gr_rect", "gr_arc", "gr_circle", "gr_poly", "gr_curve"];
  const id = (p) => p;
  let skippedCu = 0;
  for (const g of children(root, graphicsTags)) {
    const l = str(g, "layer");
    const w = r5(strokeWidth(g, 0.1) || 0.1);
    if (l === "Edge.Cuts") {
      const sh = shapeSegments(g, id);
      edge.segs.push(...sh.segs); edge.loops.push(...sh.loops); edge.circles.push(...sh.circles);
      continue;
    }
    if (isCopper(l)) { skippedCu++; continue; }
    const layer = mapGraphicLayer(l);
    if (!layer) continue;
    if (g[0] === "gr_circle") {
      const c = xy(g, "center"), e = xy(g, "end");
      if (c && e) pcb.graphics.push({ id: uid("g"), layer, kind: "circle", cx: r5(c[0]), cy: r5(c[1]), r: r5(Math.hypot(e[0] - c[0], e[1] - c[1])), w });
      continue;
    }
    if (g[0] === "gr_rect") {
      const s = xy(g, "start"), e = xy(g, "end");
      if (s && e) pcb.graphics.push({ id: uid("g"), layer, kind: "rect", x1: r5(Math.min(s[0], e[0])), y1: r5(Math.min(s[1], e[1])), x2: r5(Math.max(s[0], e[0])), y2: r5(Math.max(s[1], e[1])), w });
      continue;
    }
    const sh = shapeSegments(g, id);
    for (const [a, b] of sh.segs) pcb.graphics.push({ id: uid("g"), layer, kind: "line", x1: r5(a[0]), y1: r5(a[1]), x2: r5(b[0]), y2: r5(b[1]), w });
    for (const loop of sh.loops) for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      pcb.graphics.push({ id: uid("g"), layer, kind: "line", x1: r5(a[0]), y1: r5(a[1]), x2: r5(b[0]), y2: r5(b[1]), w });
    }
  }
  if (skippedCu) warn(`${skippedCu} copper graphic shape(s) skipped (draw them as tracks or zones)`);

  const chained = chainSegments(edge.segs);
  const loops = [...chained.loops, ...edge.loops, ...edge.circles.map((c) => circlePoly(c.c, c.r))];
  loops.sort((p, q) => Math.abs(polygonArea(q)) - Math.abs(polygonArea(p)));
  const pushLines = (pts, closed) => {
    for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      pcb.graphics.push({ id: uid("g"), layer: "Edge.Cuts", kind: "line", x1: r5(a[0]), y1: r5(a[1]), x2: r5(b[0]), y2: r5(b[1]), w: 0.1 });
    }
  };
  if (loops.length) {
    pcb.outline = loops[0].map(([x, y]) => [r5(x), r5(y)]);
    for (const l of loops.slice(1)) pushLines(l, true);
    if (loops.length > 1) warn(`${loops.length - 1} extra closed Edge.Cuts shape(s) kept as cut-out graphics`);
  } else {
    // No closed loop: bounding box of whatever is there (edge, else footprints).
    const pts = edge.segs.flat();
    if (!pts.length) for (const f of padsAbsolute) for (const p of f.pads) pts.push([p.x, p.y]);
    if (pts.length) {
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const m = edge.segs.length ? 0 : 5;
      const x1 = Math.min(...xs) - m, y1 = Math.min(...ys) - m, x2 = Math.max(...xs) + m, y2 = Math.max(...ys) + m;
      pcb.outline = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => [r5(x), r5(y)]);
      warn(edge.segs.length ? "Board edge (Edge.Cuts) is not closed; using its bounding box as the outline" : "No board edge (Edge.Cuts); outline drawn around the parts");
    } else {
      pcb.outline = [[0, 0], [60, 0], [60, 40], [0, 40]];
      warn("No board edge (Edge.Cuts) found");
    }
  }
  for (const o of chained.open) pushLines(o, false);

  // ---- texts
  for (const t of children(root, "gr_text")) {
    const a = at(t);
    if (!a) continue;
    const l = str(t, "layer");
    const layer = isCopper(l) ? (supported.has(l) ? l : null) : mapGraphicLayer(l);
    if (!layer) continue;
    const eff = child(t, "effects");
    const font = eff && child(eff, "font");
    const just = eff && child(eff, "justify");
    pcb.texts.push({ id: uid("x"), layer, text: String(t[1] ?? ""), x: r5(a.x), y: r5(a.y), size: r5(font ? num(font, "size", 1, 1) : 1), rot: norm360(a.angle), mirror: !!(just && just.includes("mirror")) });
  }
  const dims = children(root, "dimension").length;
  if (dims) warn(`${dims} dimension(s) skipped`);

  // ---- rules: keep defaults, but never stricter than what the board uses.
  if (Number.isFinite(minW)) pcb.rules.minTrackWidth = Math.min(pcb.rules.minTrackWidth, r5(minW));
  if (Number.isFinite(minDrill)) pcb.rules.minDrill = Math.min(pcb.rules.minDrill, r5(minDrill));
  const setup = child(root, "setup");
  if (setup) {
    const ptm = num(setup, "pad_to_mask_clearance", 1, NaN);
    if (Number.isFinite(ptm)) pcb.rules.maskExpansion = ptm;
  }

  const tb = child(root, "title_block");
  const titleBlock = tb ? { title: str(tb, "title"), date: str(tb, "date"), rev: str(tb, "rev"), company: str(tb, "company") } : null;
  return { pcb, footprints: defs, padsAbsolute, titleBlock, warnings: finish() };
}

// ================================================================ project
// Turn KiCad sheet symbols into sheet blocks, each with its own page. When the
// sub-sheet's file text is given (sheetTexts[file]) it is imported onto that
// page, recursively; otherwise the page starts empty.
function importSheetTree(project, rawSheets, parentPage, sheetTexts, warnings, depth) {
  const sch = project.schematic;
  for (const raw of rawSheets) {
    const target = uid("pg");
    sch.pages.push({ id: target, name: raw.name });
    // The importer leaves a "[Sheet …]" note where the block was; the block replaces it.
    sch.texts = sch.texts.filter((t) => !((t.page || "p1") === parentPage && t.text === `[Sheet ${raw.name}: ${raw.file}]`));
    const pins = raw.pins.map((p) => ({
      id: uid("sp"), name: p.name,
      side: Math.abs(p.x - raw.x) <= Math.abs(p.x - (raw.x + raw.w)) ? "L" : "R",
      offset: Math.max(0, Math.min(raw.h, p.y - raw.y)),
    }));
    sch.sheets.push({ id: uid("sh"), page: parentPage, x: raw.x, y: raw.y, w: raw.w, h: raw.h, name: raw.name, target, pins });
    const base = String(raw.file || "").split(/[\\/]/).pop();
    const text = sheetTexts && (sheetTexts[raw.file] ?? sheetTexts[base]);
    if (text == null) { warnings.push(`Schematic: sub-sheet "${raw.name}" (${raw.file}) was not supplied; its page is empty`); continue; }
    if (depth > 8) { warnings.push(`Schematic: sheet "${raw.name}" nests too deep; skipped`); continue; }
    const s = importKicadSchematic(text, { pageName: raw.name });
    for (const k of ["parts", "wires", "buses", "junctions", "labels", "noconnects", "texts"]) {
      for (const o of s.schematic[k] || []) { o.page = target; sch[k].push(o); }
    }
    const known = new Set(project.library.symbols.map((x) => x.name));
    for (const sym of s.symbols) if (!known.has(sym.name)) project.library.symbols.push(sym);
    warnings.push(...s.warnings.filter((w) => !/hierarchical sheet/.test(w)).map((w) => `Schematic (${raw.name}): ${w}`));
    importSheetTree(project, s.sheets, target, sheetTexts, warnings, depth + 1);
  }
}

export function importKicadProject({ schText, pcbText, name, sheetTexts = {} } = {}) {
  if (!schText && !pcbText) throw new Error("Nothing to import: give a .kicad_sch and/or a .kicad_pcb");
  const project = newProject(name || "KiCad import");
  const warnings = [];
  let tb = null;
  let sheets = [];
  if (schText) {
    const s = importKicadSchematic(schText);
    project.schematic = { ...project.schematic, ...s.schematic, sheets: [] };
    project.library.symbols = s.symbols;
    warnings.push(...s.warnings.filter((w) => !/hierarchical sheet/.test(w)).map((w) => `Schematic: ${w}`));
    tb = s.titleBlock;
    sheets = s.sheets;
    importSheetTree(project, sheets, project.schematic.pages[0].id, sheetTexts, warnings, 1);
  }
  if (pcbText) {
    const b = importKicadPcb(pcbText);
    project.pcb = { ...project.pcb, ...b.pcb, rules: { ...project.pcb.rules, ...b.pcb.rules } };
    project.library.footprints = b.footprints;
    warnings.push(...b.warnings.map((w) => `Board: ${w}`));
    if (!tb || !tb.title) tb = { ...(b.titleBlock || {}), ...(tb || {}) };
  }
  // Link board footprints to schematic parts by reference; parts take the
  // board's footprint (the imported geometry) so updates keep them in sync.
  if (schText && pcbText) {
    const byRef = new Map();
    for (const part of project.schematic.parts) {
      if (!part.ref || part.ref.startsWith("#")) continue;
      if (!byRef.has(part.ref)) byRef.set(part.ref, []);
      byRef.get(part.ref).push(part);
    }
    for (const fp of project.pcb.footprints) {
      const parts = byRef.get(fp.ref);
      if (!parts) continue;
      parts.sort((a, b) => (a.unit || 1) - (b.unit || 1));
      fp.partId = parts[0].id;
      for (const part of parts) part.footprint = fp.footprint;
    }
  }
  if (tb) {
    if (tb.title) project.meta.title = tb.title;
    if (tb.rev) project.meta.rev = tb.rev;
    if (tb.date) project.meta.date = tb.date;
    if (tb.company) project.meta.company = tb.company;
    if (tb.comment) project.meta.comment = tb.comment;
  }
  if (!tb || !tb.title) project.meta.title = name || project.meta.title;
  normalizeProject(project);
  // Not part of the saved document.
  Object.defineProperty(project, "importWarnings", { value: warnings, enumerable: false, configurable: true, writable: true });
  Object.defineProperty(project, "importSheets", { value: sheets, enumerable: false, configurable: true, writable: true });
  return project;
}
