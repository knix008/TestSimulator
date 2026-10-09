// Generates the sample projects in sample/*.mycircuit plus sample/index.json.
//
//   node scripts/create-samples.mjs            all samples
//   node scripts/create-samples.mjs 03 08      only those (index.json is still rewritten in full)
//
// Every sample is built through the same core APIs the app uses (newPart,
// addWire, cleanup, annotate, updateBoardFromSchematic, autoroute, ...), so the
// files are always valid. Each one is then checked and the script fails loudly
// when a check does not pass:
//   * the schematic is tidy: orthogonal wires that end on pin tips / wires /
//     labels, no wire through a part body, no overlapping wires, no pin
//     resting on another wire, everything on the sheet and clear of the title
//     block
//   * ERC has no errors
//   * the board is fully routed (no ratsnest left) and DRC has no errors
//   * the simulation runs (samples with probes)
//   * the fabrication package can be generated (a Gerber per copper layer)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { newProject, serializeProject, parseProject, copperLayers } from "../src/core/project.js";
import { annotate, runERC, buildNetlist, boardNetlist, partPins } from "../src/core/netlist.js";
import { round, pointPolygonEdgeDist, pointSegDist, rotatePoint, pointInPolygon, polygonBounds } from "../src/core/geom.js";
import { getSymbol, symbolBounds, makeBoxSymbol, registerUserSymbols } from "../src/lib/symbols.js";
import { makeFootprint, registerUserFootprints } from "../src/lib/footprints.js";
import { newPart, addWire, cleanup } from "../src/sch/ops.js";
import { fieldPositions } from "../src/sch/render.js";
import { updateBoardFromSchematic, routingStats, footprintBounds, footprintPads, copperItems, itemDistance, clearanceFor, netClassFor, trackWidthFor } from "../src/pcb/board.js";
import { rectOutline, checkSegment } from "../src/pcb/ops.js";
import { autoroute } from "../src/pcb/autoroute.js";
import { runDRC } from "../src/pcb/drc.js";
import { insetPolygon } from "../src/pcb/zones.js";
import { simulate } from "../src/sim/engine.js";
import { fabricationFiles } from "../src/fab/package.js";
import { strokeTextWidth } from "../src/fab/strokefont.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "sample");
const DATE = "2026-10-09";
const AUTHOR = "MyCircuit Samples";
const COMPANY = "MyCircuit Project";

// Sheet geometry (mils): A4 with a 200-mil border and the title block in the
// bottom-right corner (see drawSheet in src/sch/render.js).
const SHEET = { x1: 300, y1: 300, x2: 11393, y2: 7968 };
const TITLE_BLOCK = { x1: 7000, y1: 6950, x2: 11493, y2: 8068 };

function fail(sample, msg) {
  throw new Error(`[${sample}] ${msg}`);
}

// ====================================================================== schematic builder
class Sch {
  constructor(p) {
    this.p = p;
    this.s = p.schematic;
  }

  // A placed symbol. o: {rot, mirror, value, footprint, fields, ...extra part keys}
  add(lib, x, y, o = {}) {
    const { rot = 0, mirror = false, value, footprint, fields, ...rest } = o;
    const part = newPart(lib, x, y, { rot, mirror });
    if (value != null) part.value = value;
    if (footprint != null) part.footprint = footprint;
    if (fields) part.fields = { ...part.fields, ...fields };
    // Round sources are as wide as tall, so their fields would land on the
    // pins above/below; put them on the right like other vertical parts.
    if ((lib === "VSOURCE" || lib === "ISOURCE") && !rot) {
      part.refOffset = { x: 130, y: -30 };
      part.valueOffset = { x: 130, y: 35 };
    }
    Object.assign(part, rest);
    this.s.parts.push(part);
    return part;
  }

  // World position of a pin tip, by number or name.
  pin(part, key) {
    const pins = partPins(part);
    const pn = pins.find((q) => q.num === String(key)) || pins.find((q) => q.name === String(key));
    if (!pn) throw new Error(`${part.lib} has no pin ${key}`);
    return [pn.x, pn.y];
  }

  // A polyline of orthogonal wire segments through the given points.
  wire(...pts) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (x1 !== x2 && y1 !== y2) throw new Error(`diagonal wire ${x1},${y1} -> ${x2},${y2}`);
      addWire(this.s, x1, y1, x2, y2);
    }
  }

  // Power port (GND, +5V, ...) with its pin at pt.
  power(lib, pt, o = {}) {
    return this.add(lib, pt[0], pt[1], o);
  }

  // Power port plus a PWR_FLAG on the very same point: tells ERC the rail is
  // fed from a connector. Up-pointing ports get the flag hanging below.
  flagged(lib, pt) {
    this.power(lib, pt);
    const down = lib === "GND" || lib === "-12V";
    this.add("PWR_FLAG", pt[0], pt[1], { rot: down ? 0 : 180 });
  }

  label(text, pt, rot = 0, kind = "local") {
    this.s.labels.push({ id: "", kind, text, x: pt[0], y: pt[1], rot });
  }

  text(text, x, y, size = 50) {
    this.s.texts.push({ id: "", text, x, y, size, rot: 0 });
  }

  nc(pt) {
    this.s.noconnects.push({ id: "", x: pt[0], y: pt[1] });
  }

  bus(...pts) {
    for (let i = 0; i + 1 < pts.length; i++) this.s.buses.push({ id: "", x1: pts[i][0], y1: pts[i][1], x2: pts[i + 1][0], y2: pts[i + 1][1] });
  }
}

const at = (pt, dx = 0, dy = 0) => [pt[0] + dx, pt[1] + dy];

// ---------------------------------------------------------------------- schematic lint
function bodyBox(part) {
  const sym = getSymbol(part.lib);
  const b = symbolBounds({ ...sym, pins: [] });
  const pts = [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].map(([x, y]) => {
    const lx = part.mirror ? -x : x;
    const [rx, ry] = rotatePoint(lx, y, part.rot || 0);
    return [part.x + rx, part.y + ry];
  });
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

function segHitsBox(w, b, inset = 2) {
  const x1 = b.x1 + inset, y1 = b.y1 + inset, x2 = b.x2 - inset, y2 = b.y2 - inset;
  if (x1 >= x2 || y1 >= y2) return false;
  if (w.y1 === w.y2) {
    const y = w.y1;
    if (y <= y1 || y >= y2) return false;
    return Math.max(w.x1, w.x2) > x1 && Math.min(w.x1, w.x2) < x2;
  }
  const x = w.x1;
  if (x <= x1 || x >= x2) return false;
  return Math.max(w.y1, w.y2) > y1 && Math.min(w.y1, w.y2) < y2;
}

const inRect = (x, y, r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
const rectHit = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

// Approximate text boxes of the reference / value fields (50-mil font).
function fieldBoxes(part) {
  const sym = getSymbol(part.lib);
  if (!sym || sym.power || sym.flag) return [];
  const f = fieldPositions(part, sym);
  const out = [];
  for (const [key, str] of [["ref", part.ref], ["value", part.value]]) {
    if (!str) continue;
    const pos = f[key];
    const w = String(str).replace(/~/g, "").length * 31;
    const x1 = pos.align === "center" ? pos.x - w / 2 : pos.x;
    out.push({ x1, x2: x1 + w, y1: pos.y - 24, y2: pos.y + 24, what: `${part.ref}.${key}` });
  }
  return out;
}

function lintSchematic(name, sch) {
  const errors = [];
  const warnings = [];
  const wires = sch.wires;
  for (const w of wires) if (w.x1 !== w.x2 && w.y1 !== w.y2) errors.push(`diagonal wire ${JSON.stringify(w)}`);
  // Off-grid coordinates.
  for (const part of sch.parts) {
    if (part.x % 50 || part.y % 50) errors.push(`${part.ref} origin ${part.x},${part.y} is off the 50-mil grid`);
    for (const pin of partPins(part)) if (pin.x % 50 || pin.y % 50) errors.push(`${part.ref}.${pin.num} pin off grid`);
  }
  for (const w of wires) if ([w.x1, w.y1, w.x2, w.y2].some((v) => v % 50)) errors.push(`wire off grid ${JSON.stringify(w)}`);
  // Wires through part bodies.
  const boxes = sch.parts.map((p) => ({ p, b: bodyBox(p) }));
  for (const w of wires) {
    for (const { p, b } of boxes) {
      const sym = getSymbol(p.lib);
      if (sym.power || sym.flag) continue;
      if (segHitsBox(w, b)) errors.push(`wire ${w.x1},${w.y1}-${w.x2},${w.y2} runs through ${p.ref}`);
    }
  }
  // Collinear overlapping wires.
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i], b = wires[j];
      if (a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1) {
        const lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
        const hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
        if (hi > lo) errors.push(`overlapping wires at y=${a.y1} x ${lo}..${hi}`);
      } else if (a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1) {
        const lo = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
        const hi = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
        if (hi > lo) errors.push(`overlapping wires at x=${a.x1} y ${lo}..${hi}`);
      }
    }
  }
  // Pins must not rest on the middle of a wire (an accidental connection).
  for (const part of sch.parts) {
    for (const pin of partPins(part)) {
      for (const w of wires) {
        const end = (pin.x === w.x1 && pin.y === w.y1) || (pin.x === w.x2 && pin.y === w.y2);
        if (!end && pointSegDist(pin.x, pin.y, w.x1, w.y1, w.x2, w.y2) < 0.5) errors.push(`${part.ref}.${pin.num} sits on the middle of a wire`);
      }
    }
  }
  // Pin tips of different real parts touching directly.
  const tips = new Map();
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    if (sym.power || sym.flag) continue;
    for (const pin of partPins(part)) {
      const k = `${pin.x},${pin.y}`;
      if (tips.has(k) && tips.get(k) !== part.ref) errors.push(`pins of ${part.ref} and ${tips.get(k)} touch at ${k}`);
      tips.set(k, part.ref);
    }
  }
  // Every point of every wire on a junction-free crossing is fine electrically,
  // but count them: a clean drawing has none.
  for (let i = 0; i < wires.length; i++) {
    for (let j = i + 1; j < wires.length; j++) {
      const a = wires[i], b = wires[j];
      const h = a.y1 === a.y2 ? a : b.y1 === b.y2 ? b : null;
      const v = h === a ? b : a;
      if (!h || v.x1 !== v.x2 || h === v) continue;
      const x = v.x1, y = h.y1;
      const inH = x > Math.min(h.x1, h.x2) && x < Math.max(h.x1, h.x2);
      const inV = y > Math.min(v.y1, v.y2) && y < Math.max(v.y1, v.y2);
      if (inH && inV) warnings.push(`wires cross at ${x},${y}`);
    }
  }
  // Bodies overlapping each other.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const sa = getSymbol(a.p.lib), sb = getSymbol(b.p.lib);
      if (sa.power || sa.flag || sb.power || sb.flag) continue;
      if (rectHit(a.b, b.b)) errors.push(`${a.p.ref} and ${b.p.ref} overlap`);
    }
  }
  // On the sheet, away from the title block.
  const check = (x, y, what) => {
    if (!inRect(x, y, SHEET)) errors.push(`${what} at ${x},${y} is off the sheet`);
    if (inRect(x, y, TITLE_BLOCK)) errors.push(`${what} at ${x},${y} is inside the title block`);
  };
  for (const { p, b } of boxes) { check(b.x1, b.y1, p.ref); check(b.x2, b.y2, p.ref); check(b.x1, b.y2, p.ref); check(b.x2, b.y1, p.ref); }
  for (const w of wires) { check(w.x1, w.y1, "wire"); check(w.x2, w.y2, "wire"); }
  for (const t of sch.texts) {
    const lines = t.text.split("\n");
    const wTxt = Math.max(...lines.map((l) => l.length)) * (t.size || 50) * 0.6;
    check(t.x, t.y - (t.size || 50), "text");
    check(t.x + wTxt, t.y + (lines.length - 1) * (t.size || 50) * 1.3, "text");
  }
  for (const l of sch.labels) check(l.x, l.y, `label ${l.text}`);
  // Field texts colliding with wires or other bodies (heuristic, warning only).
  const fields = sch.parts.flatMap(fieldBoxes);
  const pinLines = [];
  for (const part of sch.parts) {
    for (const pin of partPins(part)) {
      if (!pin.len) continue;
      const dx = pin.dir === "L" ? -1 : pin.dir === "R" ? 1 : 0;
      const dy = pin.dir === "U" ? -1 : pin.dir === "D" ? 1 : 0;
      pinLines.push({ x1: pin.x, y1: pin.y, x2: pin.x + dx * pin.len, y2: pin.y + dy * pin.len });
    }
  }
  for (const f of fields) {
    for (const w of [...wires, ...pinLines]) {
      const wb = { x1: Math.min(w.x1, w.x2) - 4, x2: Math.max(w.x1, w.x2) + 4, y1: Math.min(w.y1, w.y2) - 4, y2: Math.max(w.y1, w.y2) + 4 };
      if (rectHit(f, wb)) { warnings.push(`${f.what} text touches a wire`); break; }
    }
    for (const { p, b } of boxes) {
      const sym = getSymbol(p.lib);
      if (f.what.startsWith(`${p.ref}.`) && !sym.power) continue;
      if (rectHit(f, b)) warnings.push(`${f.what} text overlaps ${p.ref || p.lib}`);
    }
  }
  for (let i = 0; i < fields.length; i++) for (let j = i + 1; j < fields.length; j++) if (rectHit(fields[i], fields[j])) warnings.push(`${fields[i].what} and ${fields[j].what} texts overlap`);
  if (errors.length) fail(name, `schematic lint:\n  ${errors.join("\n  ")}`);
  return warnings;
}

// ====================================================================== board helpers
function fpOf(p, part) {
  const f = p.pcb.footprints.find((x) => x.partId === part.id);
  if (!f) throw new Error(`no footprint for ${part.ref}`);
  return f;
}

// Put a footprint's courtyard centre at (cx, cy).
function place(p, part, cx, cy, rot = 0, side = "F") {
  const f = fpOf(p, part);
  f.rot = rot;
  f.side = side;
  f.x = 0;
  f.y = 0;
  const b = footprintBounds(f);
  f.x = round(cx - (b.x1 + b.x2) / 2, 3);
  f.y = round(cy - (b.y1 + b.y2) / 2, 3);
  return f;
}

// Put pad `num` of a footprint at (x, y).
function placePad(p, part, num, x, y, rot = 0, side = "F") {
  const f = fpOf(p, part);
  f.rot = rot;
  f.side = side;
  f.x = 0;
  f.y = 0;
  const pad = footprintPads(f, p.pcb).find((q) => q.num === String(num));
  f.x = round(x - pad.x, 3);
  f.y = round(y - pad.y, 3);
  return f;
}

function addZone(p, layer, net, inset = null, priority = 0) {
  const pts = insetPolygon(p.pcb.outline, inset ?? p.pcb.rules.edgeClearance + 0.2);
  p.pcb.zones.push({ id: "", layer, net, pts, clearance: 0.3, thermal: true, priority });
}

function silk(p, text, x, y, size = 1.5, o = {}) {
  p.pcb.texts.push({ id: "", layer: o.layer || "F.SilkS", text, x, y, size, rot: o.rot || 0, mirror: !!o.mirror });
}

// Board texts must sit on the board and off the pads (DRC only checks
// footprint silk, so check our own texts here).
function checkBoardTexts(name, p) {
  const pads = p.pcb.footprints.flatMap((f) => footprintPads(f, p.pcb));
  for (const t of p.pcb.texts) {
    const w = strokeTextWidth(t.text, t.size);
    const vertical = (t.rot || 0) % 180 !== 0;
    const hw = (vertical ? t.size : w) / 2 + 0.1;
    const hh = (vertical ? w : t.size) / 2 + 0.1;
    const box = { x1: t.x - hw, y1: t.y - hh, x2: t.x + hw, y2: t.y + hh };
    for (const [x, y] of [[box.x1, box.y1], [box.x2, box.y1], [box.x2, box.y2], [box.x1, box.y2]]) {
      if (!pointInPolygon(x, y, p.pcb.outline) || pointPolygonEdgeDist(x, y, p.pcb.outline) < 0.3) fail(name, `board text "${t.text}" runs off the board`);
    }
    const side = t.layer.startsWith("B.") ? "B.Cu" : "F.Cu";
    for (const f of p.pcb.footprints) {
      if ((f.side === "B") !== (side === "B.Cu")) continue;
      if (rectHit(box, footprintBounds(f))) fail(name, `board text "${t.text}" lies on ${f.ref}`);
    }
    for (const pad of pads) {
      if (!pad.layers.includes(side) && !pad.npth) continue;
      const r = Math.max(pad.w, pad.h) / 2;
      if (rectHit(box, { x1: pad.x - r, y1: pad.y - r, x2: pad.x + r, y2: pad.y + r })) fail(name, `board text "${t.text}" covers pad ${pad.ref}.${pad.num}`);
    }
  }
}

function board(p, w, h, r = 0) {
  p.pcb.outline = rectOutline(0, 0, w, h, r);
}

// A short track from an SMD pad to a via into the plane of the same net.
function stitch(p, part, padNum, prefer = null) {
  const pcb = p.pcb;
  const rules = pcb.rules;
  const f = fpOf(p, part);
  const pad = footprintPads(f, pcb).find((q) => q.num === String(padNum));
  if (!pad || !pad.net) throw new Error(`stitch: ${part.ref}.${padNum} has no net`);
  const net = pad.net;
  const nc = netClassFor(rules, net);
  const vd = (nc && nc.viaDiameter) || rules.viaDiameter;
  const drill = (nc && nc.viaDrill) || rules.viaDrill;
  const w = trackWidthFor(rules, net);
  const layer = pad.layers[0];
  const items = copperItems(pcb).filter((it) => it.kind !== "zone");
  const holes = [];
  for (const fp of pcb.footprints) for (const q of footprintPads(fp, pcb)) if (q.drill > 0) holes.push({ x: q.x, y: q.y, r: q.drill / 2 });
  for (const v of pcb.vias) holes.push({ x: v.x, y: v.y, r: v.drill / 2 });
  const dirs = prefer ? [prefer] : [];
  for (const a of [0, 90, 180, 270, 45, 135, 225, 315]) dirs.push(a);
  for (const d of [1.3, 1.6, 2.0, 2.4, 2.9]) {
    for (const a of dirs) {
      const x = round(pad.x + d * Math.cos((a * Math.PI) / 180), 2);
      const y = round(pad.y - d * Math.sin((a * Math.PI) / 180), 2);
      if (pointPolygonEdgeDist(x, y, pcb.outline) - vd / 2 < rules.edgeClearance + 0.3 || !pointInPolygon(x, y, pcb.outline)) continue;
      const via = { kind: "via", id: "_v", net, layers: copperLayers(pcb), v: { x, y, d: vd, drill }, x, y };
      let ok = true;
      for (const it of items) {
        if (it.net === net) continue;
        if (itemDistance(via, it) < clearanceFor(rules, net, it.net) + 0.05) { ok = false; break; }
      }
      if (!ok) continue;
      if (holes.some((hl) => Math.hypot(hl.x - x, hl.y - y) - hl.r - drill / 2 < rules.holeToHole + 0.05)) continue;
      // Stay off other footprints' courtyards so the via does not sit under a part.
      if (pcb.footprints.some((fp) => fp !== f && fp.side === f.side && inRect(x, y, footprintBounds(fp)))) continue;
      const seg = { layer, w, x1: pad.x, y1: pad.y, x2: x, y2: y };
      if (!checkSegment(pcb, seg, net, items).ok) continue;
      pcb.tracks.push({ id: "", layer, net, w, x1: pad.x, y1: pad.y, x2: x, y2: y });
      pcb.vias.push({ id: "", x, y, d: vd, drill, net });
      return;
    }
  }
  throw new Error(`stitch: no room for a via next to ${part.ref}.${padNum}`);
}

// A hand-drawn escape track straight out of a fine-pitch pad (the autorouter
// then continues from its end). `w` lets a wide power net leave a narrow pad.
function fanout(p, part, padNum, dx, dy, w = null) {
  const f = fpOf(p, part);
  const pad = footprintPads(f, p.pcb).find((q) => q.num === String(padNum));
  const width = w || trackWidthFor(p.pcb.rules, pad.net);
  p.pcb.tracks.push({ id: "", layer: pad.layers[0], net: pad.net, w: width, x1: pad.x, y1: pad.y, x2: round(pad.x + dx, 4), y2: round(pad.y + dy, 4) });
}

function routeBoard(name, p, opts = {}) {
  const res = autoroute(p, { maxMs: 30000, ...opts });
  p.pcb.tracks.push(...res.tracks);
  p.pcb.vias.push(...res.vias);
  const st = routingStats(p.pcb);
  if (st.unrouted) fail(name, `autoroute left ${st.unrouted} connection(s): ${st.rats.map((r) => r.net).join(", ")}`);
  return res;
}

// ====================================================================== project helpers
function start(title, { rev = "1.0", comment = "" } = {}) {
  const p = newProject(title);
  p.meta = { title, author: AUTHOR, company: COMPANY, rev, date: DATE, comment };
  registerUserSymbols([]);
  registerUserFootprints([]);
  return p;
}

function powerNets(p, ...nets) {
  const pc = p.pcb.rules.netClasses.find((n) => n.name === "Power");
  for (const n of nets) if (!pc.nets.includes(n)) pc.nets.push(n);
}

function finishSchematic(name, p) {
  cleanup(p.schematic);
  annotate(p.schematic, { all: true });
  // Notes may name parts: those are written as functions and resolved once
  // the references are known.
  for (const t of p.schematic.texts) if (typeof t.text === "function") t.text = t.text();
  const lint = lintSchematic(name, p.schematic);
  const erc = runERC(p.schematic);
  const errs = erc.filter((i) => i.severity === "error");
  if (errs.length) fail(name, `ERC errors:\n  ${errs.map((e) => e.message).join("\n  ")}`);
  return { lint, ercWarnings: erc.filter((i) => i.severity !== "error") };
}

function syncBoard(name, p) {
  const sum = updateBoardFromSchematic(p.pcb, boardNetlist(p.schematic));
  if (sum.missingFootprint.length) fail(name, `parts without a footprint: ${sum.missingFootprint.join(", ")}`);
}

// Deterministic ids so regenerating gives identical files.
function renumber(p) {
  const map = new Map();
  const prefix = { parts: "p", wires: "w", buses: "b", junctions: "j", labels: "l", noconnects: "n", texts: "x" };
  for (const [k, pre] of Object.entries(prefix)) {
    p.schematic[k].forEach((o, i) => {
      const id = `${pre}${i + 1}`;
      if (k === "parts") map.set(o.id, id);
      o.id = id;
    });
  }
  const pre2 = { footprints: "f", tracks: "t", vias: "v", zones: "z", texts: "s", graphics: "g", dimensions: "d" };
  for (const [k, pre] of Object.entries(pre2)) {
    p.pcb[k].forEach((o, i) => {
      o.id = `${pre}${i + 1}`;
      if (k === "footprints" && o.partId) o.partId = map.get(o.partId) || o.partId;
    });
  }
}

// ====================================================================== samples
const SAMPLES = [];
function sample(def) {
  SAMPLES.push(def);
}

// ---------------------------------------------------------------------- 01
sample({
  file: "01-led-resistor",
  title: "LED and resistor",
  titleKo: "LED와 저항",
  description: "The classic first circuit: a 9 V battery, a switch, a current-limiting resistor and an LED. Run the operating point to read the LED current.",
  descriptionKo: "가장 기본적인 첫 회로: 9V 배터리, 스위치, 전류 제한 저항과 LED. 동작점 해석으로 LED 전류를 확인해 보세요.",
  tags: ["beginner", "simulation", "THT"],
  features: ["schematic basics", "power symbols", "net labels", "DC operating point", "single-sided routing", "3D view"],
  sim: ["op"],
  build(name) {
    const p = start("LED and resistor", { comment: "Beginner sample" });
    const S = new Sch(p);
    const bt = S.add("BATTERY", 2000, 2600, { value: "9V", footprint: "PinHeader_1x02_P2.54mm" });
    const sw = S.add("SW_SPST", 2800, 2000, { value: "ON/OFF", fields: { state: "closed" } });
    const r = S.add("R", 3700, 2000, { rot: 90, value: "470", footprint: "R_Axial_P10.16mm" });
    const d = S.add("LED", 4500, 2600, { value: "Red", footprint: "LED_D5.0mm" });
    S.power("GND", S.pin(bt, 2));
    S.power("GND", S.pin(d, 1));
    S.wire(S.pin(bt, 1), [2000, 2000], S.pin(sw, 1));
    S.wire(S.pin(sw, 2), S.pin(r, 1));
    S.wire(S.pin(r, 2), [4500, 2000], S.pin(d, 2));
    S.label("VBAT", [2200, 2000]);
    S.label("SW_OUT", [3100, 2000]);
    S.label("LED_A", [4100, 2000]);
    S.text("Your first circuit", 2000, 1400, 90);
    S.text("I(LED) = (9 V - 2 V) / 470 ohm = approx. 15 mA\nSimulate > Operating point, then hover the wires\nor open the probe list to read VBAT and LED_A.", 2000, 3400, 50);
    S.text("Toggle SW1 (field \"state\": open / closed)\nand run the simulation again.", 5200, 2200, 45);
    const sch = finishSchematic(name, p);

    board(p, 36, 22, 2);
    syncBoard(name, p);
    place(p, bt, 4.2, 11, 0);
    place(p, sw, 12, 4.6, 90);
    place(p, r, 17, 12, 0);
    place(p, d, 30, 11, 0);
    routeBoard(name, p);
    silk(p, "LED + R  v1.0", 15, 19, 1.4);
    p.pcb.maskColor = "green"; p.pcb.silkColor = "white"; p.pcb.finish = "HASL";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: ["VBAT", "LED_A"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 02
sample({
  file: "02-voltage-divider-rc",
  title: "Voltage divider and RC low-pass",
  titleKo: "전압 분배기와 RC 저역 통과 필터",
  description: "A resistive divider followed by an RC low-pass filter, driven by a sine source. Run the AC sweep for a Bode plot or a transient to see the filtered wave.",
  descriptionKo: "저항 분배기 뒤에 RC 저역 통과 필터를 두고 사인파 전원으로 구동합니다. AC 해석으로 보드 선도를, 과도 해석으로 걸러진 파형을 확인하세요.",
  tags: ["beginner", "simulation", "SMD"],
  features: ["AC analysis (Bode plot)", "transient analysis", "sine source", "probes", "SMD 0805 parts", "GND pour"],
  sim: ["ac", "tran"],
  build(name) {
    const p = start("Voltage divider + RC low-pass");
    const S = new Sch(p);
    const v = S.add("VSOURCE", 1500, 2600, { value: "SIN 2V 1kHz", fields: { wave: "sine", amplitude: "2", freq: "1k", offset: "0" } });
    const r1 = S.add("R", 2400, 2000, { rot: 90, value: "10k", footprint: "R_0805" });
    const r2 = S.add("R", 3000, 2600, { value: "10k", footprint: "R_0805" });
    const r3 = S.add("R", 3700, 2000, { rot: 90, value: "1k", footprint: "R_0805" });
    const c1 = S.add("C", 4400, 2600, { value: "100n", footprint: "C_0805" });
    S.power("GND", S.pin(v, 2));
    S.power("GND", S.pin(r2, 2));
    S.power("GND", S.pin(c1, 2));
    S.wire(S.pin(v, 1), [1500, 2000], S.pin(r1, 1));
    S.wire(S.pin(r1, 2), S.pin(r3, 1));
    S.wire([3000, 2000], S.pin(r2, 1));
    S.wire(S.pin(r3, 2), [4900, 2000]);
    S.wire([4400, 2000], S.pin(c1, 1));
    S.label("IN", [1800, 2000]);
    S.label("DIV", [3200, 2000]);
    S.label("OUT", [4900, 2000]);
    S.text("Divider + RC low-pass", 1500, 1400, 90);
    S.text(() => `DIV = IN x ${r2.ref} / (${r1.ref} + ${r2.ref}) = IN / 2   (source impedance ${r1.ref} || ${r2.ref} = 5 k)\nfc = 1 / (2 pi (5k + 1k) 100n) = approx. 265 Hz  (${r3.ref}, ${c1.ref})\nAC analysis: Bode plot of OUT.  Transient: 2 V / 1 kHz sine in, ~0.25 V out.`, 1500, 3500, 50);
    const sch = finishSchematic(name, p);

    board(p, 30, 20, 1.5);
    syncBoard(name, p);
    place(p, v, 3.5, 10, 0);
    place(p, r1, 10, 7, 0);
    place(p, r2, 15, 12, 90);
    place(p, r3, 20, 7, 0);
    place(p, c1, 25, 12, 90);
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    for (const part of [r2, c1]) stitch(p, part, 2);
    routeBoard(name, p);
    silk(p, "RC FILTER v1.0", 17, 17, 1.4);
    p.pcb.maskColor = "blue"; p.pcb.silkColor = "white"; p.pcb.finish = "HASL";
    p.sim = { mode: "ac", tStop: "5m", tStep: "5u", fStart: "10", fStop: "100k", points: 20, probes: ["IN", "DIV", "OUT"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 03
sample({
  file: "03-555-blinker",
  title: "555 LED blinker",
  titleKo: "555 LED 점멸기",
  description: "An NE555 timer in astable mode blinks an LED about 1.5 times per second from a 9 V battery. A through-hole board made for the 3D view.",
  descriptionKo: "NE555 타이머를 비안정 모드로 써서 9V 배터리로 LED를 1초에 약 1.5번 깜빡입니다. 3D 보기에 어울리는 스루홀 기판입니다.",
  tags: ["classic", "THT", "3D"],
  features: ["IC symbol", "net labels", "DIP footprint", "electrolytic capacitors", "red solder mask", "3D view"],
  sim: [],
  build(name) {
    const p = start("555 LED blinker");
    const S = new Sch(p);
    const u = S.add("NE555", 4000, 2500, { footprint: "DIP-8_W7.62mm" });
    const bt = S.add("BATTERY", 1300, 2300, { value: "9V", footprint: "PinHeader_1x02_P2.54mm" });
    const c3 = S.add("C", 1800, 2300, { value: "100n", footprint: "C_Disc_D5.0mm_P5.00mm" });
    const ra = S.add("R", 2400, 1500, { value: "1k", footprint: "R_Axial_P10.16mm" });
    const rb = S.add("R", 2400, 2100, { value: "47k", footprint: "R_Axial_P10.16mm" });
    const ct = S.add("C_POL", 2400, 2700, { value: "10u", footprint: "CP_Radial_D5.0mm_P2.00mm" });
    const cv = S.add("C", 3300, 3200, { value: "10n", footprint: "C_Disc_D5.0mm_P5.00mm" });
    const rl = S.add("R", 5400, 2300, { rot: 90, value: "470", footprint: "R_Axial_P10.16mm" });
    const d = S.add("LED", 6000, 2700, { value: "Green", footprint: "LED_D5.0mm" });
    S.power("VCC", S.pin(bt, 1));
    S.power("GND", S.pin(bt, 2));
    S.power("VCC", S.pin(c3, 1));
    S.power("GND", S.pin(c3, 2));
    S.power("VCC", S.pin(ra, 1));
    S.power("GND", S.pin(ct, 2));
    S.power("GND", S.pin(cv, 2));
    S.power("GND", S.pin(u, "1"));
    S.power("GND", S.pin(d, 1));
    // Timing chain RA - RB - C on the left.
    S.wire(S.pin(ra, 2), S.pin(rb, 1));
    S.wire([2400, 1800], [2800, 1800]);
    S.label("DIS", [2800, 1800]);
    S.wire(S.pin(u, "2"), S.pin(rb, 2));
    S.wire(S.pin(u, "6"), [2400, 2400]);
    S.wire(S.pin(rb, 2), [2400, 2400], S.pin(ct, 1));
    // Control voltage decoupling.
    S.wire(S.pin(u, "5"), [3300, 2500], S.pin(cv, 1));
    // Reset and VCC tied to the supply under the chip.
    S.wire(S.pin(u, "4"), [3500, 2600], [3500, 2900], [4900, 2900]);
    S.wire(S.pin(u, "8"), [4600, 2500], [4600, 2900]);
    S.power("VCC", [4900, 2900]);
    // Discharge and output.
    S.wire(S.pin(u, "7"), [4800, 2400]);
    S.label("DIS", [4800, 2400]);
    S.wire(S.pin(u, "3"), S.pin(rl, 1));
    S.wire(S.pin(rl, 2), [6000, 2300], S.pin(d, 2));
    S.text("555 astable LED blinker", 1300, 900, 90);
    S.text(() => `RA = ${ra.ref}, RB = ${rb.ref}, C = ${ct.ref}\nf = 1.44 / ((RA + 2 RB) C) = 1.44 / ((1k + 94k) x 10u) = approx. 1.5 Hz\nDuty cycle = (RA + RB) / (RA + 2 RB) = approx. 50 %`, 1300, 3900, 50);
    S.text("The NE555 has no simulation model:\nthis sample is about the PCB and the 3D view.", 5200, 3500, 45);
    const sch = finishSchematic(name, p);

    board(p, 50, 32, 2.5);
    syncBoard(name, p);
    place(p, bt, 4, 16, 0);
    place(p, c3, 9.5, 5.5, 0);
    place(p, u, 25, 16, 0);
    place(p, ra, 14, 15.5, 90);
    place(p, rb, 18, 15.5, 90);
    place(p, ct, 13, 26.5, 0);
    place(p, cv, 23, 27, 0);
    place(p, rl, 36, 10, 0);
    place(p, d, 44, 16, 90);
    addZone(p, "B.Cu", "GND");
    routeBoard(name, p);
    silk(p, "555 BLINKER", 36, 26, 1.8);
    silk(p, "rev 1.0", 36, 28.6, 1.2);
    p.pcb.maskColor = "red"; p.pcb.silkColor = "white"; p.pcb.finish = "HASL";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 04
sample({
  file: "04-power-supply-7805",
  title: "5 V power supply (7805)",
  titleKo: "5V 전원 공급기 (7805)",
  description: "12 V in, 5 V out: input fuse, reverse-polarity diode, LM7805 linear regulator with input/output capacitors and a power LED. The operating point shows the regulated rail.",
  descriptionKo: "12V 입력, 5V 출력: 입력 퓨즈, 역전압 보호 다이오드, 입출력 커패시터가 달린 LM7805 리니어 레귤레이터와 전원 LED. 동작점 해석으로 안정된 5V 출력을 확인합니다.",
  tags: ["power", "simulation", "THT"],
  features: ["voltage regulator model", "PWR_FLAG", "polarized capacitors", "power net class (wide tracks)", "mounting holes", "black mask / ENIG"],
  sim: ["op"],
  build(name) {
    const p = start("5 V power supply (LM7805)");
    const S = new Sch(p);
    const v = S.add("VSOURCE", 1500, 2600, { value: "12V", footprint: "PinHeader_1x02_P2.54mm" });
    const f = S.add("FUSE", 2100, 2000, { rot: 90, value: "500mA", footprint: "Fuse_1206" });
    const d1 = S.add("D", 2900, 2000, { rot: 90, value: "1N4007", footprint: "D_DO-41_P10.16mm" });
    const c1 = S.add("C_POL", 3500, 2600, { value: "100u", footprint: "CP_Radial_D8.0mm_P3.50mm" });
    const u = S.add("LM7805", 4600, 2000, { footprint: "TO-220-3_Vertical", valueOffset: { x: 30, y: 170 } });
    const c2 = S.add("C_POL", 5500, 2600, { value: "10u", footprint: "CP_Radial_D5.0mm_P2.00mm" });
    const c3 = S.add("C", 6000, 2600, { value: "100n", footprint: "C_0805" });
    const r1 = S.add("R", 6500, 2400, { value: "1k", footprint: "R_0805" });
    const d2 = S.add("LED", 6500, 3000, { value: "Green", footprint: "LED_0805" });
    const j2 = S.add("Conn_01x02", 7700, 2100, { value: "5V OUT" });
    const h1 = S.add("MOUNTING_HOLE", 2000, 4300);
    const h2 = S.add("MOUNTING_HOLE", 2500, 4300);
    S.power("GND", S.pin(v, 2));
    S.power("GND", S.pin(c1, 2));
    S.power("GND", S.pin(u, "GND"));
    S.power("GND", S.pin(c2, 2));
    S.power("GND", S.pin(c3, 2));
    S.power("GND", S.pin(d2, 1));
    S.power("GND", S.pin(j2, 2));
    S.wire(S.pin(v, 1), [1500, 2000], S.pin(f, 1));
    S.wire(S.pin(f, 2), S.pin(d1, 2));
    S.wire(S.pin(d1, 1), S.pin(u, "VI"));
    S.wire([3500, 2000], S.pin(c1, 1));
    S.wire([3300, 2000], [3300, 1700]);
    S.add("PWR_FLAG", 3300, 1700);
    S.wire(S.pin(u, "VO"), S.pin(j2, 1));
    S.wire([6900, 2000], [6900, 1800]);
    S.power("+5V", [6900, 1800]);
    S.wire([5500, 2000], S.pin(c2, 1));
    S.wire([6000, 2000], S.pin(c3, 1));
    S.wire([6500, 2000], S.pin(r1, 1));
    S.wire(S.pin(r1, 2), S.pin(d2, 2));
    S.label("VRAW", [1700, 2000]);
    S.label("VIN", [3800, 2000]);
    S.text("5 V regulated supply", 1500, 1200, 90);
    S.text("F1 protects against shorts, D1 against a reversed plug.\nThe LM7805 needs about 2 V of headroom: VIN = 12 V - 0.7 V (D1).\nPWR_FLAG marks VIN as driven (it is fed only through F1 and D1).", 1500, 3500, 50);
    S.text("Mounting holes", 1800, 4000, 45);
    const sch = finishSchematic(name, p);
    powerNets(p, "VRAW", "VIN");

    board(p, 50, 32, 2);
    syncBoard(name, p);
    place(p, v, 3.5, 16, 0);
    place(p, f, 10, 9, 0);
    place(p, d1, 15, 15, 180);
    place(p, c1, 16.5, 26, 0);
    place(p, u, 28, 10, 0);
    place(p, c2, 30, 22, 0);
    place(p, c3, 36, 22, 90);
    place(p, r1, 40, 13, 90);
    place(p, d2, 40, 19, 90);
    place(p, j2, 46.5, 16, 0);
    place(p, h1, 4.5, 27.5);
    place(p, h2, 45.5, 27.5);
    addZone(p, "B.Cu", "GND");
    for (const part of [c3]) stitch(p, part, 2);
    stitch(p, d2, 1);
    routeBoard(name, p);
    silk(p, "7805 PSU", 30, 29, 1.8);
    silk(p, "12V IN", 7, 3, 1.2);
    silk(p, "5V OUT", 44, 3, 1.2);
    p.pcb.maskColor = "black"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: ["VRAW", "VIN", "+5V"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 05
sample({
  file: "05-npn-switch",
  title: "NPN transistor switch",
  titleKo: "NPN 트랜지스터 스위치",
  description: "A push button drives the base of a 2N3904 through 10 kΩ; the transistor switches an LED. The button's state field is set to closed so the operating point shows the LED on.",
  descriptionKo: "누름 버튼이 10kΩ을 거쳐 2N3904의 베이스를 구동하고, 트랜지스터가 LED를 켭니다. 버튼의 state 필드가 closed로 되어 있어 동작점 해석에서 LED가 켜진 상태를 볼 수 있습니다.",
  tags: ["beginner", "simulation", "THT"],
  features: ["BJT model", "switch state field", "pull-down resistor", "SOT-23 footprint", "yellow mask / black silk"],
  sim: ["op"],
  build(name) {
    const p = start("NPN transistor switch");
    const S = new Sch(p);
    const bt = S.add("BATTERY", 1600, 2900, { value: "4.5V", footprint: "PinHeader_1x02_P2.54mm" });
    const sw = S.add("SW_PUSH", 3000, 3000, { fields: { state: "closed" } });
    const r1 = S.add("R", 3800, 3000, { rot: 90, value: "10k", footprint: "R_Axial_P10.16mm" });
    const r2 = S.add("R", 4100, 3600, { value: "100k", footprint: "R_Axial_P10.16mm" });
    const q = S.add("Q_NPN", 4500, 3000, { value: "2N3904", footprint: "SOT-23_Q", refOffset: { x: 200, y: -40 }, valueOffset: { x: 200, y: 30 } });
    const r3 = S.add("R", 4600, 1800, { value: "220", footprint: "R_Axial_P10.16mm" });
    const d = S.add("LED", 4600, 2400, { value: "Yellow", footprint: "LED_D5.0mm" });
    S.power("VCC", S.pin(bt, 1));
    S.power("GND", S.pin(bt, 2));
    S.power("VCC", S.pin(r3, 1));
    S.power("GND", S.pin(q, "E"));
    S.power("GND", S.pin(r2, 2));
    S.wire(S.pin(sw, 1), [2800, 2600]);
    S.power("VCC", [2800, 2600]);
    S.wire(S.pin(sw, 2), S.pin(r1, 1));
    S.wire(S.pin(r1, 2), S.pin(q, "B"));
    S.wire([4100, 3000], S.pin(r2, 1));
    S.wire(S.pin(r3, 2), S.pin(d, 2));
    S.wire(S.pin(d, 1), S.pin(q, "C"));
    S.label("SW_OUT", [3300, 3000]);
    S.label("BASE", [4200, 3000]);
    S.label("LED_K", [4600, 2700]);
    S.text("Transistor as a switch", 1500, 1300, 90);
    S.text(() => `Button pressed: Ib = (4.5 V - 0.7 V) / ${r1.ref} = approx. 0.38 mA, enough to saturate ${q.ref}.\nThe LED current is set by ${r3.ref}: (4.5 V - 2 V - 0.1 V) / 220 = approx. 11 mA.\n${r2.ref} pulls the base low so ${q.ref} is off when the button is released.\n${sw.ref} field "state" = closed / open selects what the simulator sees.`, 1500, 4500, 50);
    const sch = finishSchematic(name, p);

    board(p, 40, 26, 2);
    syncBoard(name, p);
    place(p, bt, 3.5, 13, 0);
    place(p, sw, 11, 13, 0);
    place(p, r1, 22, 8, 0);
    place(p, r2, 22, 19, 0);
    place(p, q, 30, 13, 0);
    place(p, r3, 36, 9, 90);
    place(p, d, 33, 21, 0);
    addZone(p, "B.Cu", "GND");
    routeBoard(name, p);
    silk(p, "NPN SWITCH", 22, 24, 1.4);
    p.pcb.maskColor = "yellow"; p.pcb.silkColor = "black"; p.pcb.finish = "HASL";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: ["SW_OUT", "BASE", "LED_K"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 06
sample({
  file: "06-opamp-amplifier",
  title: "Non-inverting op-amp amplifier",
  titleKo: "비반전 연산증폭기 증폭기",
  description: "An op-amp with ±12 V supplies amplifies a 0.5 V sine by 1 + Rf/Rg = 11. Run the transient to see input and output, or the AC sweep for the gain.",
  descriptionKo: "±12V 전원의 연산증폭기가 0.5V 사인파를 1 + Rf/Rg = 11배 증폭합니다. 과도 해석으로 입출력 파형을, AC 해석으로 이득을 확인하세요.",
  tags: ["analog", "simulation", "op-amp"],
  features: ["op-amp model", "split ±12 V supply", "feedback network", "transient + AC analysis", "white mask / ENIG"],
  sim: ["tran", "ac"],
  build(name) {
    const p = start("Non-inverting amplifier (gain 11)");
    const S = new Sch(p);
    const v2 = S.add("VSOURCE", 1500, 2000, { value: "12V" });
    const v3 = S.add("VSOURCE", 1500, 2800, { value: "12V" });
    const v1 = S.add("VSOURCE", 2500, 2800, { value: "SIN 0.5V 1kHz", fields: { wave: "sine", amplitude: "0.5", freq: "1k", offset: "0" } });
    const u = S.add("OPAMP", 4500, 2500, { value: "OPAMP", refOffset: { x: 100, y: -190 }, valueOffset: { x: 100, y: 190 } });
    const rf = S.add("R", 4600, 3200, { rot: 90, value: "100k", footprint: "R_0805" });
    const rg = S.add("R", 3900, 3700, { value: "10k", footprint: "R_0805" });
    const rl = S.add("R", 5600, 2900, { value: "10k", footprint: "R_0805" });
    S.power("+12V", S.pin(v2, 1));
    S.power("-12V", S.pin(v3, 2));
    S.wire(S.pin(v2, 2), S.pin(v3, 1));
    S.wire([1500, 2400], [1200, 2400]);
    S.power("GND", [1200, 2400]);
    S.power("+12V", S.pin(u, "7"));
    S.power("-12V", S.pin(u, "4"));
    S.power("GND", S.pin(v1, 2));
    S.power("GND", S.pin(rg, 2));
    S.power("GND", S.pin(rl, 2));
    S.wire(S.pin(v1, 1), [2500, 2400], S.pin(u, "3"));
    S.wire(S.pin(u, "2"), [3900, 2600], [3900, 3200], S.pin(rf, 1));
    S.wire([3900, 3200], S.pin(rg, 1));
    S.wire(S.pin(rf, 2), [5200, 3200], [5200, 2500]);
    S.wire(S.pin(u, "1"), [5600, 2500], S.pin(rl, 1));
    S.label("IN", [3000, 2400]);
    S.label("OUT", [5300, 2500]);
    S.label("FB", [3900, 2900]);
    S.text("Non-inverting amplifier", 1200, 1200, 90);
    S.text(() => `Gain = 1 + Rf / Rg = 1 + ${rf.ref} / ${rg.ref} = 1 + 100k / 10k = 11   (0.5 V in -> 5.5 V out)\n${v2.ref} / ${v3.ref} make the split +12 V / -12 V supply around GND; ${v1.ref} is the signal.\nTransient: compare IN and OUT.  AC: flat 20.8 dB gain.`, 1200, 4400, 50);
    const sch = finishSchematic(name, p);

    board(p, 40, 28, 2);
    syncBoard(name, p);
    place(p, v2, 3.5, 7, 0);
    place(p, v3, 3.5, 21, 0);
    place(p, v1, 9.5, 14, 0);
    place(p, u, 22, 14, 0);
    place(p, rg, 15, 21, 90);
    place(p, rf, 22, 23.5, 0);
    place(p, rl, 32, 18, 90);
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    for (const part of [rg, rl]) stitch(p, part, 2);
    routeBoard(name, p);
    silk(p, "OPAMP x11", 32, 5, 1.5);
    p.pcb.maskColor = "white"; p.pcb.silkColor = "black"; p.pcb.finish = "ENIG";
    p.sim = { mode: "tran", tStop: "3m", tStep: "2u", fStart: "10", fStop: "1Meg", points: 20, probes: ["IN", "OUT"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 07
sample({
  file: "07-half-wave-rectifier",
  title: "Half-wave rectifier",
  titleKo: "반파 정류기",
  description: "A 12 V / 50 Hz sine is rectified by a diode and smoothed by a 470 µF capacitor into a 1 kΩ load. The transient shows the ripple.",
  descriptionKo: "12V / 50Hz 사인파를 다이오드로 정류하고 470µF 커패시터로 평활하여 1kΩ 부하에 공급합니다. 과도 해석으로 리플을 확인하세요.",
  tags: ["power", "simulation", "THT"],
  features: ["diode model", "transient analysis", "ripple", "OSP finish"],
  sim: ["tran"],
  build(name) {
    const p = start("Half-wave rectifier");
    const S = new Sch(p);
    const v = S.add("VSOURCE", 2000, 2700, { value: "SIN 12V 50Hz", fields: { wave: "sine", amplitude: "12", freq: "50", offset: "0" } });
    const d = S.add("D", 2800, 2200, { rot: 90, value: "1N4007", footprint: "D_DO-41_P10.16mm" });
    const c = S.add("C_POL", 3600, 2800, { value: "470u", footprint: "CP_Radial_D8.0mm_P3.50mm" });
    const rl = S.add("R", 4300, 2800, { value: "1k", footprint: "R_Axial_P10.16mm" });
    S.power("GND", S.pin(v, 2));
    S.power("GND", S.pin(c, 2));
    S.power("GND", S.pin(rl, 2));
    S.wire(S.pin(v, 1), [2000, 2200], S.pin(d, 2));
    S.wire(S.pin(d, 1), [4800, 2200]);
    S.wire([3600, 2200], S.pin(c, 1));
    S.wire([4300, 2200], S.pin(rl, 1));
    S.label("AC_IN", [2200, 2200]);
    S.label("VOUT", [4800, 2200]);
    S.text("Half-wave rectifier with smoothing capacitor", 1500, 1400, 90);
    S.text(() => `Peak output = 12 V - 0.7 V = approx. 11.3 V\nRipple = I / (f C) = (11.3 V / 1k) / (50 Hz x 470u) = approx. 0.48 V\nTry ${c.ref} = 47u in the transient to see the ripple grow.`, 1500, 3700, 50);
    const sch = finishSchematic(name, p);

    board(p, 40, 24, 1.5);
    syncBoard(name, p);
    place(p, v, 3.5, 12, 0);
    place(p, d, 15, 7, 180);
    place(p, c, 22, 15, 0);
    place(p, rl, 32, 12, 90);
    addZone(p, "B.Cu", "GND");
    routeBoard(name, p);
    silk(p, "RECTIFIER", 15, 21, 1.5);
    p.pcb.maskColor = "green"; p.pcb.silkColor = "white"; p.pcb.finish = "OSP";
    p.sim = { mode: "tran", tStop: "100m", tStep: "100u", fStart: "10", fStop: "1Meg", points: 20, probes: ["AC_IN", "VOUT"] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 08
sample({
  file: "08-arduino-minimal",
  title: "Minimal Arduino (ATmega328P)",
  titleKo: "최소 구성 아두이노 (ATmega328P)",
  description: "A breadboard-Arduino on a PCB: ATmega328P with a 16 MHz crystal, reset button, decoupling, an ISP header for programming and the classic D13 LED. Two-layer board with GND pours on both sides and four mounting holes.",
  descriptionKo: "브레드보드 아두이노를 PCB로: 16MHz 크리스털, 리셋 버튼, 디커플링 커패시터, 프로그래밍용 ISP 헤더와 D13 LED를 갖춘 ATmega328P. 양면 GND 동박과 마운팅 홀 4개가 있는 2층 기판입니다.",
  tags: ["MCU", "2-layer", "THT"],
  features: ["net labels", "no-connect flags", "PWR_FLAG", "crystal oscillator", "ISP header", "GND pour on both layers", "mounting holes", "autorouter"],
  sim: [],
  build(name) {
    const p = start("Minimal Arduino (ATmega328P)");
    const S = new Sch(p);
    const u = S.add("ATmega328P", 5500, 3500);
    // Left side of the MCU.
    S.wire(S.pin(u, "1"), [4400, 2800]);
    S.label("RESET", [4400, 2800], 180);
    S.wire(S.pin(u, "9"), [4400, 2900]);
    S.label("XTAL1", [4400, 2900], 180);
    S.wire(S.pin(u, "10"), [4400, 3000]);
    S.label("XTAL2", [4400, 3000], 180);
    S.wire(S.pin(u, "7"), [4100, 3100]);
    S.power("+5V", [4100, 3100]);
    S.wire(S.pin(u, "20"), [4500, 3200], [4500, 3100]);
    const c6 = S.add("C", 4200, 3600, { value: "100n", footprint: "C_Disc_D5.0mm_P5.00mm" });
    S.wire(S.pin(u, "21"), [4200, 3300], S.pin(c6, 1));
    S.power("GND", S.pin(c6, 2));
    S.wire(S.pin(u, "8"), [4600, 3400], [4600, 3800]);
    S.wire(S.pin(u, "22"), [4600, 3500]);
    S.power("GND", [4600, 3800]);
    for (const n of ["2", "3", "4", "5", "6", "11"]) S.nc(S.pin(u, n));
    // Right side.
    for (const n of ["12", "13", "14", "15", "16", "23", "24", "25", "26", "27", "28"]) S.nc(S.pin(u, n));
    S.wire(S.pin(u, "17"), [6600, 3300]);
    S.label("MOSI", [6600, 3300]);
    S.wire(S.pin(u, "18"), [6600, 3400]);
    S.label("MISO", [6600, 3400]);
    const r3 = S.add("R", 7000, 3500, { rot: 90, value: "1k", footprint: "R_Axial_P10.16mm" });
    const led = S.add("LED", 7600, 3900, { value: "Red", footprint: "LED_D5.0mm" });
    S.wire(S.pin(u, "19"), S.pin(r3, 1));
    S.label("SCK", [6400, 3500]);
    S.wire(S.pin(r3, 2), [7600, 3500], S.pin(led, 2));
    S.label("LED_D13", [7300, 3500]);
    S.power("GND", S.pin(led, 1));
    S.text("D13 LED (SCK / PB5)", 6800, 4500, 45);

    // Reset: pull-up, button, label.
    const r1 = S.add("R", 2400, 1600, { value: "10k", footprint: "R_Axial_P10.16mm" });
    const sw = S.add("SW_PUSH", 2400, 2400, { rot: 90, value: "RESET" });
    S.power("+5V", S.pin(r1, 1));
    S.wire(S.pin(r1, 2), [2400, 2000], S.pin(sw, 2));
    S.wire([2400, 2000], [2900, 2000]);
    S.label("RESET", [2900, 2000]);
    S.power("GND", S.pin(sw, 1));
    S.text("Reset", 1900, 1200, 60);

    // 16 MHz crystal.
    const y1 = S.add("CRYSTAL", 3000, 4000, { value: "16MHz" });
    const c2 = S.add("C", 2500, 3800, { rot: 90, value: "22p", footprint: "C_Disc_D5.0mm_P5.00mm" });
    const c3 = S.add("C", 2500, 4200, { rot: 90, value: "22p", footprint: "C_Disc_D5.0mm_P5.00mm" });
    S.wire(S.pin(y1, 1), [3400, 3800]);
    S.label("XTAL1", [3400, 3800]);
    S.wire(S.pin(y1, 2), [3400, 4200]);
    S.label("XTAL2", [3400, 4200]);
    S.wire(S.pin(c2, 2), S.pin(y1, 1));
    S.wire(S.pin(c3, 2), S.pin(y1, 2));
    S.wire(S.pin(c2, 1), [2100, 3800], [2100, 4300]);
    S.wire(S.pin(c3, 1), [2100, 4200]);
    S.power("GND", [2100, 4300]);
    S.text("16 MHz clock", 1900, 3400, 60);

    // ISP programming header (AVR 6-pin layout).
    const isp = S.add("Conn_02x03", 2600, 5400, { value: "ISP" });
    S.wire(S.pin(isp, 1), [1700, 5300]);
    S.label("MISO", [1700, 5300], 180);
    S.wire(S.pin(isp, 3), [1700, 5400]);
    S.label("SCK", [1700, 5400], 180);
    S.wire(S.pin(isp, 5), [1700, 5500]);
    S.label("RESET", [1700, 5500], 180);
    S.wire(S.pin(isp, 2), [3300, 5300]);
    S.power("+5V", [3300, 5300]);
    S.wire(S.pin(isp, 4), [3600, 5400]);
    S.label("MOSI", [3600, 5400]);
    S.wire(S.pin(isp, 6), [3300, 5500]);
    S.power("GND", [3300, 5500]);
    S.text("ISP programming header", 1300, 4950, 60);

    // Power input.
    const j2 = S.add("Conn_01x02", 2300, 6400, { mirror: true, value: "5V IN" });
    S.wire(S.pin(j2, 1), [3100, 6300]);
    S.power("+5V", [3100, 6300]);
    S.wire(S.pin(j2, 2), [3100, 6400]);
    S.power("GND", [3100, 6400]);
    S.text("Power input", 1700, 6000, 60);

    // Decoupling, placed next to the MCU on the board.
    const c1 = S.add("C_POL", 4400, 5300, { value: "10u", footprint: "CP_Radial_D5.0mm_P2.00mm" });
    const c4 = S.add("C", 4900, 5300, { value: "100n", footprint: "C_Disc_D5.0mm_P5.00mm" });
    const c5 = S.add("C", 5400, 5300, { value: "100n", footprint: "C_Disc_D5.0mm_P5.00mm" });
    for (const c of [c1, c4, c5]) { S.power("+5V", S.pin(c, 1)); S.power("GND", S.pin(c, 2)); }
    S.text(() => `Decoupling: ${c4.ref} at VCC (pin 7), ${c5.ref} at AVCC (pin 20)`, 4200, 4800, 45);

    // Power flags: both rails come in through J2 only.
    S.flagged("+5V", [4500, 6300]);
    S.flagged("GND", [5000, 6300]);
    S.text("PWR_FLAG: the rails are fed by the connector", 4200, 5900, 45);

    const holes = [0, 1, 2, 3].map((i) => S.add("MOUNTING_HOLE", 6600 + i * 500, 5400));
    S.text("Mounting holes", 6500, 5000, 45);
    S.text("Minimal Arduino: ATmega328P at 16 MHz", 1300, 750, 90);
    S.text("Program it through the ISP header (USBasp, Arduino as ISP)\nwith the Arduino Uno bootloader / board settings.", 7400, 2300, 45);
    const sch = finishSchematic(name, p);

    board(p, 62, 48, 3);
    syncBoard(name, p);
    // DIP-28 turned so pin 1 is bottom-left: pins 1-14 along the bottom row,
    // 15-28 along the top. XTAL (9, 10) and VCC/GND (7, 8) face down, AVCC/
    // AREF/GND (20-22) and SPI (17-19) face up.
    place(p, u, 31, 22, 90);
    place(p, y1, 36.1, 31, 0);
    place(p, c2, 32.5, 37.5, 90);
    place(p, c3, 39.7, 37.5, 90);
    place(p, c4, 25.5, 32.5, 0);
    place(p, c5, 31, 12.5, 0);
    place(p, c6, 39, 12.5, 0);
    place(p, c1, 9, 13, 0);
    place(p, j2, 4, 24, 0);
    place(p, r1, 14, 32, 0);
    place(p, sw, 14, 40.5, 0);
    place(p, isp, 50, 38, 0);
    place(p, r3, 47, 8.5, 0);
    place(p, led, 55, 13.5, 0);
    const hp = [[4.5, 4.5], [57.5, 4.5], [4.5, 43.5], [57.5, 43.5]];
    holes.forEach((h, i) => place(p, h, hp[i][0], hp[i][1]));
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    routeBoard(name, p);
    silk(p, "MINI ARDUINO", 31, 5, 2);
    silk(p, "ATmega328P  rev 1.0", 31, 8, 1.2);
    silk(p, "ISP", 50, 44.2, 1.2);
    silk(p, "5V IN", 4.5, 28.5, 1.2);
    p.pcb.maskColor = "green"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 09
sample({
  file: "09-usb-uart-ch340",
  title: "USB to UART bridge (CH340G)",
  titleKo: "USB-UART 변환기 (CH340G)",
  description: "Micro-USB to a 6-pin serial header through a CH340G with its 12 MHz crystal. A compact SMD board with a blue mask and ENIG finish; some decoupling capacitors sit on the bottom side.",
  descriptionKo: "CH340G와 12MHz 크리스털로 마이크로 USB를 6핀 시리얼 헤더로 변환합니다. 파란 솔더마스크와 ENIG 마감의 작은 SMD 기판이며, 일부 디커플링 커패시터는 뒷면에 실장됩니다.",
  tags: ["interface", "SMD", "2-layer"],
  features: ["USB connector", "SMD footprints", "parts on both sides", "net labels", "no-connect flags", "blue mask / ENIG"],
  sim: [],
  build(name) {
    const p = start("USB to UART bridge (CH340G)");
    const S = new Sch(p);
    const usb = S.add("USB_B_Micro", 2000, 3000);
    S.wire(S.pin(usb, "1"), [2800, 2800]);
    S.power("+5V", [2800, 2800]);
    S.wire(S.pin(usb, "2"), [3000, 2900]);
    S.label("USB_D-", [3000, 2900]);
    S.wire(S.pin(usb, "3"), [3000, 3000]);
    S.label("USB_D+", [3000, 3000]);
    S.nc(S.pin(usb, "4"));
    S.wire(S.pin(usb, "5"), [2800, 3200]);
    S.power("GND", [2800, 3200]);

    const u = S.add("CH340G", 5000, 3000);
    S.wire(S.pin(u, "5"), [4100, 2600]);
    S.label("USB_D+", [4100, 2600], 180);
    S.wire(S.pin(u, "6"), [4100, 2700]);
    S.label("USB_D-", [4100, 2700], 180);
    S.wire(S.pin(u, "9"), [4100, 2800]);
    S.label("XI", [4100, 2800], 180);
    S.wire(S.pin(u, "10"), [4100, 2900]);
    S.label("XO", [4100, 2900], 180);
    S.wire(S.pin(u, "16"), [3800, 3000]);
    S.power("+5V", [3800, 3000]);
    const c3 = S.add("C", 4000, 3500, { value: "100n", footprint: "C_0603" });
    S.wire(S.pin(u, "4"), [4000, 3100], S.pin(c3, 1));
    S.power("GND", S.pin(c3, 2));
    S.wire(S.pin(u, "1"), [4300, 3200]);
    S.power("GND", [4300, 3200]);
    S.text("V3: 100n to GND when VCC = 5 V", 3600, 4050, 40);

    const j2 = S.add("Conn_01x06", 7500, 2800, { value: "UART" });
    const sig = [["2", "1", "TXD"], ["3", "2", "RXD"], ["13", "3", "DTR"], ["14", "4", "RTS"]];
    for (const [up, jp, lbl] of sig) {
      const a = S.pin(u, up);
      S.wire(a, S.pin(j2, Number(jp) + 1));
      S.label(lbl, [6000, a[1]]);
    }
    for (const n of ["11", "12", "15", "7", "8"]) S.nc(S.pin(u, n));
    S.wire(S.pin(j2, 1), [6800, 2500]);
    S.power("+5V", [6800, 2500]);
    S.wire(S.pin(j2, 6), [6800, 3000]);
    S.power("GND", [6800, 3000]);
    S.text("Header: 1 +5V, 2 TXD, 3 RXD, 4 DTR, 5 RTS, 6 GND\n(TXD/RXD named from the CH340 side)", 6600, 3700, 40);

    // 12 MHz crystal.
    const y1 = S.add("CRYSTAL", 3000, 4800, { value: "12MHz" });
    const c1 = S.add("C", 2500, 4600, { rot: 90, value: "22p", footprint: "C_0603" });
    const c2 = S.add("C", 2500, 5000, { rot: 90, value: "22p", footprint: "C_0603" });
    S.wire(S.pin(y1, 1), [3400, 4600]);
    S.label("XI", [3400, 4600]);
    S.wire(S.pin(y1, 2), [3400, 5000]);
    S.label("XO", [3400, 5000]);
    S.wire(S.pin(c1, 2), S.pin(y1, 1));
    S.wire(S.pin(c2, 2), S.pin(y1, 2));
    S.wire(S.pin(c1, 1), [2100, 4600], [2100, 5100]);
    S.wire(S.pin(c2, 1), [2100, 5000]);
    S.power("GND", [2100, 5100]);
    S.text("12 MHz clock", 1900, 4200, 60);

    // Supply decoupling and power LED.
    const c4 = S.add("C", 4900, 4800, { value: "10u", footprint: "C_0805" });
    const c5 = S.add("C", 5400, 4800, { value: "100n", footprint: "C_0603" });
    for (const c of [c4, c5]) { S.power("+5V", S.pin(c, 1)); S.power("GND", S.pin(c, 2)); }
    const r1 = S.add("R", 6300, 4600, { value: "1k", footprint: "R_0603" });
    const d1 = S.add("LED", 6300, 5200, { value: "Blue", footprint: "LED_0603" });
    S.power("+5V", S.pin(r1, 1));
    S.wire(S.pin(r1, 2), S.pin(d1, 2));
    S.power("GND", S.pin(d1, 1));
    S.text("Decoupling (bottom side)", 4700, 4200, 45);
    S.text("Power LED", 6200, 4200, 45);
    S.text("USB to UART with the CH340G", 1500, 1400, 90);
    S.text("VBUS from the USB connector powers everything (it is a power output,\nso no PWR_FLAG is needed). D+/D- are joined by the USB_D+ / USB_D- labels.", 1500, 1800, 45);
    const sch = finishSchematic(name, p);

    board(p, 40, 24, 2);
    syncBoard(name, p);
    placePad(p, usb, "2", 7.0, 11.5, 270); // D- on the routing grid so it can escape between its neighbours
    place(p, u, 19, 12, 0);
    place(p, y1, 19, 4, 0);
    place(p, c1, 11.8, 4, 90);
    place(p, c2, 26.2, 4, 90);
    place(p, c3, 13, 16.5, 90);
    place(p, j2, 36.5, 12, 0);
    place(p, c4, 19, 12, 90, "B");
    place(p, c5, 15.3, 12, 90, "B");
    place(p, r1, 25, 19.5, 0);
    place(p, d1, 29, 19.5, 180);
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    for (const part of [c1, c2, c3]) stitch(p, part, 1);
    for (const part of [c4, c5]) stitch(p, part, 2);
    stitch(p, d1, 1);
    stitch(p, u, "1");
    fanout(p, usb, "1", 1.8, 0, 0.3);
    fanout(p, usb, "2", 1.8, 0);
    fanout(p, usb, "3", 1.8, 0);
    routeBoard(name, p);
    silk(p, "USB-UART CH340G", 20, 21.6, 1.2);
    silk(p, "5V", 33.6, 5.7, 0.9);
    silk(p, "GND", 33.3, 18.4, 0.9);
    p.pcb.maskColor = "blue"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG"; p.pcb.thickness = 1.2;
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 10
sample({
  file: "10-shift-register-leds",
  title: "74HC595 LED bar",
  titleKo: "74HC595 LED 바",
  description: "A 74HC595 shift register drives eight LEDs from three signals on a header. Net labels and a bus line keep the eight outputs readable; pull resistors set the default state of ~OE~ and ~SRCLR~.",
  descriptionKo: "74HC595 시프트 레지스터가 헤더의 신호 세 개로 LED 여덟 개를 구동합니다. 네트 라벨과 버스 선으로 여덟 개의 출력을 읽기 쉽게 그렸고, 풀업/풀다운 저항으로 ~OE~와 ~SRCLR~의 기본 상태를 정합니다.",
  tags: ["logic", "SMD", "2-layer"],
  features: ["net labels", "bus graphics", "pull-up / pull-down", "8 identical channels", "SOIC and 0805 footprints", "red mask / ENIG"],
  sim: [],
  build(name) {
    const p = start("74HC595 LED bar");
    const S = new Sch(p);
    const u = S.add("74HC595", 5500, 3000, { footprint: "SOIC-16_3.9x9.9mm" });
    for (const [pin, lbl] of [["14", "SER"], ["11", "SRCLK"], ["12", "RCLK"], ["10", "~SRCLR~"], ["13", "~OE~"]]) {
      const a = S.pin(u, pin);
      S.wire(a, [4500, a[1]]);
      S.label(lbl, [4500, a[1]], 180);
    }
    S.wire(S.pin(u, "16"), [4300, 3100]);
    S.power("+5V", [4300, 3100]);
    S.wire(S.pin(u, "8"), [4600, 3200]);
    S.power("GND", [4600, 3200]);
    S.nc(S.pin(u, "9"));
    // Outputs onto the Q bus.
    const outs = [["15", "QA"], ["1", "QB"], ["2", "QC"], ["3", "QD"], ["4", "QE"], ["5", "QF"], ["6", "QG"], ["7", "QH"]];
    for (const [pin, lbl] of outs) {
      const a = S.pin(u, pin);
      S.wire(a, [6500, a[1]]);
      S.label(lbl, [6500, a[1]], 180);
      S.bus([6500, a[1]], [6600, a[1] - 100]);
    }
    S.bus([6600, 3200], [6600, 1900], [9900, 1900]);
    const leds = [];
    const res = [];
    outs.forEach(([, lbl], i) => {
      const x = 7200 + i * 400;
      S.bus([x - 100, 1900], [x, 2000]);
      const r = S.add("R", x, 2600, { value: "330", footprint: "R_0805" });
      const d = S.add("LED", x, 3200, { value: "Red", footprint: "LED_0805" });
      S.wire([x, 2000], S.pin(r, 1));
      S.label(lbl, [x, 2000], 90);
      S.wire(S.pin(r, 2), S.pin(d, 2));
      S.power("GND", S.pin(d, 1));
      leds.push(d);
      res.push(r);
    });
    S.text("Q[A..H] bus: the labels make the connections,\nthe bus line only shows they belong together.", 7000, 1500, 45);

    // Input header with default levels for ~SRCLR~ (high) and ~OE~ (low).
    const j1 = S.add("Conn_01x07", 1600, 3000, { mirror: true, value: "IN" });
    S.wire(S.pin(j1, 1), [2300, 2700]);
    S.power("+5V", [2300, 2700]);
    for (const [pin, lbl] of [[2, "SER"], [3, "SRCLK"], [4, "RCLK"]]) {
      const a = S.pin(j1, pin);
      S.wire(a, [2700, a[1]]);
      S.label(lbl, [2700, a[1]]);
    }
    const r1 = S.add("R", 3000, 2600, { value: "10k", footprint: "R_0805" });
    const r2 = S.add("R", 3200, 3500, { value: "10k", footprint: "R_0805" });
    S.wire(S.pin(j1, 5), [3400, 3100]);
    S.label("~SRCLR~", [3400, 3100]);
    S.power("+5V", S.pin(r1, 1));
    S.wire(S.pin(r1, 2), [3000, 3100]);
    S.wire(S.pin(j1, 6), [3400, 3200]);
    S.label("~OE~", [3400, 3200]);
    S.wire([3200, 3200], S.pin(r2, 1));
    S.power("GND", S.pin(r2, 2));
    S.wire(S.pin(j1, 7), [2300, 3300]);
    S.power("GND", [2300, 3300]);

    const c1 = S.add("C", 5500, 4400, { value: "100n", footprint: "C_0805" });
    S.power("+5V", S.pin(c1, 1));
    S.power("GND", S.pin(c1, 2));
    S.text(() => `${c1.ref}: decoupling next to ${u.ref} pin 16`, 5200, 4900, 45);
    S.flagged("+5V", [2200, 4500]);
    S.flagged("GND", [2700, 4500]);
    S.text("PWR_FLAG: +5V and GND come from J1", 1800, 4100, 45);
    S.text("74HC595 LED bar", 1300, 1100, 90);
    S.text(() => `Shift eight bits in on SER (one per SRCLK rising edge), then pulse RCLK to latch them onto the LEDs.\n${r1.ref} keeps the active-low SRCLR high (no clear) and ${r2.ref} keeps the active-low OE low (outputs on) when the inputs float.`, 1300, 5600, 50);
    const sch = finishSchematic(name, p);

    board(p, 56, 28, 2);
    syncBoard(name, p);
    place(p, j1, 3.5, 14, 0);
    place(p, u, 18, 14, 180);
    place(p, r1, 9.5, 8, 90);
    place(p, r2, 9.5, 20, 90);
    place(p, c1, 13.5, 21.5, 90);
    leds.forEach((d, i) => place(p, d, 27.5 + i * 3.6, 6, 270));
    res.forEach((r, i) => place(p, r, 27.5 + i * 3.6, 12, 90));
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    routeBoard(name, p);
    silk(p, "74HC595 LED BAR", 40, 22, 1.6);
    silk(p, "QA", 27.5, 2.2, 0.9);
    silk(p, "QH", 27.5 + 7 * 3.6, 2.2, 0.9);
    p.pcb.maskColor = "red"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 11
sample({
  file: "11-four-layer-attiny",
  title: "ATtiny85 on a 4-layer board",
  titleKo: "4층 기판의 ATtiny85",
  description: "An ATtiny85 (SOIC-8) with an AMS1117-3.3 regulator, a button, an LED and an ISP header on a 4-layer board: In1.Cu is a solid GND plane, In2.Cu a +3V3 plane, and every SMD supply pad drops into its plane through a via.",
  descriptionKo: "ATtiny85(SOIC-8)와 AMS1117-3.3 레귤레이터, 버튼, LED, ISP 헤더를 4층 기판에 배치했습니다. In1.Cu는 GND 평면, In2.Cu는 +3V3 평면이며 SMD 전원 패드는 모두 비아로 평면에 연결됩니다.",
  tags: ["MCU", "4-layer", "SMD"],
  features: ["4-layer stack-up", "inner power planes", "stitching vias", "LDO regulator", "black mask / ENIG"],
  sim: [],
  build(name) {
    const p = start("ATtiny85 on a 4-layer board");
    const S = new Sch(p);
    const u = S.add("ATtiny85", 5500, 3000, { value: "ATtiny85-20SU", footprint: "SOIC-8_3.9x4.9mm" });
    S.wire(S.pin(u, "1"), [4400, 2800]);
    S.label("RESET", [4400, 2800], 180);
    S.wire(S.pin(u, "2"), [4400, 2900]);
    S.label("BTN", [4400, 2900], 180);
    const r3 = S.add("R", 4100, 3000, { rot: 90, value: "330", footprint: "R_0805" });
    const d1 = S.add("LED", 3500, 3000, { rot: 270, value: "Green", footprint: "LED_0805" });
    S.wire(S.pin(u, "3"), S.pin(r3, 2));
    S.label("LED", [4500, 3000]);
    S.wire(S.pin(r3, 1), S.pin(d1, 2));
    S.power("GND", S.pin(d1, 1));
    S.wire(S.pin(u, "4"), [4600, 3100]);
    S.power("GND", [4600, 3100]);
    S.wire(S.pin(u, "8"), [6500, 2800]);
    S.power("+3V3", [6500, 2800]);
    for (const [pin, lbl] of [["7", "SCK"], ["6", "MISO"], ["5", "MOSI"]]) {
      const a = S.pin(u, pin);
      S.wire(a, [6700, a[1]]);
      S.label(lbl, [6700, a[1]]);
    }

    // 5 V in -> 3.3 V LDO.
    const j1 = S.add("Conn_01x02", 1500, 1600, { mirror: true, value: "5V IN" });
    const u2 = S.add("AMS1117-3.3", 3600, 1500, { footprint: "SOT-223-3", valueOffset: { x: -40, y: 200 } });
    const c1 = S.add("C", 2700, 1900, { value: "10u", footprint: "C_0805" });
    const c2 = S.add("C", 4400, 1900, { value: "10u", footprint: "C_0805" });
    S.wire(S.pin(j1, 1), S.pin(u2, "VI"));
    S.wire([2400, 1500], [2400, 1300]);
    S.power("+5V", [2400, 1300]);
    S.wire([2700, 1500], S.pin(c1, 1));
    S.power("GND", S.pin(c1, 2));
    S.wire(S.pin(j1, 2), [2200, 1600]);
    S.power("GND", [2200, 1600]);
    S.power("GND", S.pin(u2, "GND"));
    S.wire(S.pin(u2, "VO"), [5000, 1500]);
    S.power("+3V3", [5000, 1500]);
    S.wire([4400, 1500], S.pin(c2, 1));
    S.power("GND", S.pin(c2, 2));

    // Reset pull-up and the button.
    const r1 = S.add("R", 2400, 3600, { value: "10k", footprint: "R_0805" });
    S.power("+3V3", S.pin(r1, 1));
    S.wire(S.pin(r1, 2), [2400, 4000], [2900, 4000]);
    S.label("RESET", [2900, 4000]);
    const sw = S.add("SW_PUSH", 4000, 3700);
    S.wire([3600, 3700], S.pin(sw, 1));
    S.label("BTN", [3600, 3700]);
    S.wire(S.pin(sw, 2), [4400, 3700]);
    S.power("GND", [4400, 3700]);
    S.text("PB3 uses its internal pull-up", 3500, 4100, 40);

    // ISP header.
    const isp = S.add("Conn_02x03", 2600, 5200, { value: "ISP" });
    for (const [pin, lbl] of [[1, "MISO"], [3, "SCK"], [5, "RESET"]]) {
      const a = S.pin(isp, pin);
      S.wire(a, [1700, a[1]]);
      S.label(lbl, [1700, a[1]], 180);
    }
    S.wire(S.pin(isp, 2), [3300, 5100]);
    S.power("+3V3", [3300, 5100]);
    S.wire(S.pin(isp, 4), [3600, 5200]);
    S.label("MOSI", [3600, 5200]);
    S.wire(S.pin(isp, 6), [3300, 5300]);
    S.power("GND", [3300, 5300]);
    S.text("ISP header (3.3 V target)", 1300, 4750, 60);

    const c3 = S.add("C", 5500, 4400, { value: "100n", footprint: "C_0805" });
    S.power("+3V3", S.pin(c3, 1));
    S.power("GND", S.pin(c3, 2));
    S.text(() => `${c3.ref}: decoupling at ${u.ref} pin 8`, 5200, 4900, 45);
    S.flagged("+5V", [7200, 4200]);
    S.flagged("GND", [7700, 4200]);
    S.text("PWR_FLAG: 5 V and GND enter through J1", 6900, 3800, 45);
    S.text("ATtiny85 on a 4-layer board", 1300, 800, 90);
    S.text("Stack-up: F.Cu signals | In1.Cu GND plane | In2.Cu +3V3 plane | B.Cu signals + GND pour.\nEvery SMD GND / +3V3 pad has a short track to a via into its plane.", 4500, 5800, 50);
    const sch = finishSchematic(name, p);

    p.pcb.layerCount = 4;
    board(p, 36, 28, 2);
    syncBoard(name, p);
    place(p, j1, 3.5, 7, 0);
    place(p, u2, 11, 7, 0);
    place(p, c1, 6.5, 13, 90);
    place(p, c2, 17.8, 3.5, 0);
    place(p, u, 19, 15, 0);
    place(p, c3, 23.5, 9.5, 0);
    place(p, r3, 13.5, 18, 90);
    place(p, d1, 13.5, 22.5, 90);
    place(p, sw, 23, 23, 0);
    place(p, r1, 25, 16.5, 90);
    place(p, isp, 32, 14, 0);
    addZone(p, "In1.Cu", "GND");
    addZone(p, "In2.Cu", "+3V3");
    addZone(p, "B.Cu", "GND");
    stitch(p, u, "4");
    stitch(p, u, "8");
    stitch(p, u2, "1");
    stitch(p, u2, "2", 0);
    for (const c of [c1, c2, c3]) stitch(p, c, 2);
    stitch(p, c2, 1);
    stitch(p, c3, 1);
    stitch(p, d1, 1);
    stitch(p, r1, 1);
    routeBoard(name, p);
    silk(p, "ATtiny85 4L", 8, 25, 1.4);
    silk(p, "ISP", 32, 19.2, 1.1);
    silk(p, "5V", 3.2, 11.2, 1.1);
    p.pcb.maskColor = "black"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ---------------------------------------------------------------------- 12
function bme280Library() {
  const sym = makeBoxSymbol("BME280_Module", {
    title: "BME280 sensor module (I2C)", category: "Sensor", refPrefix: "U", value: "BME280 module",
    footprints: ["BME280_Module_P2.54"], keywords: "bme280 temperature humidity pressure sensor i2c module 센서 모듈",
    left: [["1", "VIN", "power_in"], ["2", "SCL", "input"], ["3", "SDA", "bidir"], ["4", "GND", "power_in"]],
  });
  const fp = makeFootprint("header", { name: "BME280_Module_P2.54", rows: 1, n: 4, pitch: 2.54 });
  fp.title = "BME280 breakout module: 4-pin 2.54 mm header on a 12.5 x 12.6 mm board";
  // The module's own PCB and the sensor chip, drawn around the header.
  const L = (x1, y1, x2, y2) => ({ t: "line", x1, y1, x2, y2, w: 0.12 });
  fp.silk.push(L(-1.8, -2.5, 10.7, -2.5), L(10.7, -2.5, 10.7, 10.1), L(10.7, 10.1, -1.8, 10.1), L(-1.8, 10.1, -1.8, -2.5));
  fp.silk.push(L(5.5, 2.5, 8, 2.5), L(8, 2.5, 8, 5.1), L(8, 5.1, 5.5, 5.1), L(5.5, 5.1, 5.5, 2.5));
  fp.silk.push({ t: "circle", cx: 8.7, cy: 8.3, r: 1.1, w: 0.12 });
  return { sym, fp };
}

sample({
  file: "12-custom-library",
  title: "Custom symbol and footprint",
  titleKo: "사용자 심벌과 풋프린트",
  description: "A BME280 sensor module drawn with a project-local symbol (made with the symbol generator) and a custom footprint (made with the footprint wizard), wired to a host header with I2C pull-ups. Both live inside the project file.",
  descriptionKo: "프로젝트에 포함된 사용자 심벌(심벌 생성기로 제작)과 사용자 풋프린트(풋프린트 마법사로 제작)로 그린 BME280 센서 모듈을 I2C 풀업 저항과 함께 호스트 헤더에 연결했습니다. 둘 다 프로젝트 파일 안에 저장됩니다.",
  tags: ["library", "sensor", "I2C"],
  features: ["project library", "custom symbol", "custom footprint", "I2C pull-ups", "net labels", "purple mask / ENIG"],
  sim: [],
  build(name) {
    const p = start("Custom library: BME280 module");
    const { sym, fp } = bme280Library();
    p.library.symbols.push(sym);
    p.library.footprints.push(fp);
    registerUserSymbols(p.library.symbols);
    registerUserFootprints(p.library.footprints);
    const S = new Sch(p);
    const u = S.add("BME280_Module", 6000, 3000);
    const j1 = S.add("Conn_01x04", 2500, 3000, { mirror: true, value: "HOST" });
    for (let i = 1; i <= 4; i++) S.wire(S.pin(j1, i), S.pin(u, String(i)));
    S.wire([3500, 2800], [3500, 2600]);
    S.power("+3V3", [3500, 2600]);
    S.wire([3500, 3100], [3500, 3300]);
    S.power("GND", [3500, 3300]);
    S.label("SCL", [4300, 2900]);
    S.label("SDA", [4300, 3000]);
    const r1 = S.add("R", 4500, 1700, { value: "4k7", footprint: "R_0805" });
    const r2 = S.add("R", 5300, 1700, { value: "4k7", footprint: "R_0805" });
    for (const [r, lbl] of [[r1, "SCL"], [r2, "SDA"]]) {
      S.power("+3V3", S.pin(r, 1));
      const b = S.pin(r, 2);
      S.wire(b, [b[0], 2100], [b[0] + 300, 2100]);
      S.label(lbl, [b[0] + 300, 2100]);
    }
    S.text("I2C pull-ups", 4300, 1200, 50);
    const c1 = S.add("C", 7200, 3000, { value: "100n", footprint: "C_0805" });
    S.power("+3V3", S.pin(c1, 1));
    S.power("GND", S.pin(c1, 2));
    S.flagged("+3V3", [2200, 4300]);
    S.flagged("GND", [2700, 4300]);
    S.text("PWR_FLAG: the host header feeds both rails", 1800, 3900, 45);
    S.text("Custom library parts", 1500, 900, 90);
    S.text(() => `${u.ref} uses the project-local symbol "BME280_Module" (symbol generator: 4 pins on the left)\nand the footprint "BME280_Module_P2.54" (footprint wizard: 1x4 header + module outline on the silkscreen).\nBoth are stored in this file under library.symbols / library.footprints: open them from the library browser.`, 1500, 5200, 50);
    const sch = finishSchematic(name, p);

    board(p, 32, 22, 2);
    syncBoard(name, p);
    place(p, j1, 3.5, 11, 0);
    place(p, u, 23.5, 11, 0);
    place(p, r1, 11, 8.5, 90);
    place(p, r2, 14, 8.5, 90);
    place(p, c1, 12.5, 15.5, 90);
    addZone(p, "B.Cu", "GND");
    addZone(p, "F.Cu", "GND");
    routeBoard(name, p);
    silk(p, "BME280 BREAKOUT", 10.5, 20, 1.1);
    p.pcb.maskColor = "purple"; p.pcb.silkColor = "white"; p.pcb.finish = "ENIG";
    p.sim = { mode: "op", tStop: "10m", tStep: "10u", fStart: "10", fStop: "1Meg", points: 50, probes: [] };
    return { p, ...sch };
  },
});

// ====================================================================== main
function runSample(def) {
  const t0 = Date.now();
  const name = def.file;
  const { p, lint, ercWarnings } = def.build(name);
  renumber(p);
  // Round-trip through the file format so every check sees what the app loads.
  const text = serializeProject(p);
  const q = parseProject(text);
  const erc = runERC(q.schematic);
  if (erc.some((i) => i.severity === "error")) fail(name, "ERC errors after reload");
  const st = routingStats(q.pcb);
  if (st.unrouted) fail(name, `${st.unrouted} unrouted connection(s) after reload`);
  checkBoardTexts(name, q);
  const drc = runDRC(q);
  const drcErr = drc.filter((i) => i.severity === "error");
  if (drcErr.length) fail(name, `DRC errors:\n  ${drcErr.slice(0, 20).map((e) => `${e.code}: ${e.message}`).join("\n  ")}`);
  const simOk = [];
  for (const mode of def.sim) {
    const r = simulate(q, { mode });
    if (!r.ok) fail(name, `simulation (${mode}) failed: ${r.errors.join("; ")}`);
    simOk.push(mode);
  }
  if (def.sim.length && !q.sim.probes.length) fail(name, "simulated sample without probes");
  const files = fabricationFiles(q, { date: DATE });
  for (const layer of copperLayers(q.pcb)) if (!files.some((f) => f.kind === "gerber" && f.layer === layer)) fail(name, `no Gerber for ${layer}`);
  writeFileSync(join(OUT, `${name}.mycircuit`), text);
  const nets = buildNetlist(q.schematic).nets.length;
  return {
    name,
    parts: q.schematic.parts.filter((x) => { const s = getSymbol(x.lib); return s && !s.power && !s.flag; }).length,
    nets,
    tracks: q.pcb.tracks.length,
    vias: q.pcb.vias.length,
    erc: erc.length,
    drc: drc.length,
    sim: simOk.length ? simOk.join("+") : "-",
    ms: Date.now() - t0,
    lint,
    ercWarnings: erc,
    drcWarnings: drc,
  };
}

function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const rows = [];
  for (const def of SAMPLES) {
    if (only.length && !only.some((o) => def.file.startsWith(o))) continue;
    rows.push(runSample(def));
  }
  const index = SAMPLES.map((d) => ({
    file: `${d.file}.mycircuit`, title: d.title, titleKo: d.titleKo, description: d.description, descriptionKo: d.descriptionKo,
    tags: d.tags, features: d.features,
  }));
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2) + "\n");

  const head = ["sample", "parts", "nets", "tracks", "vias", "ERC warn", "DRC warn", "sim ok", "ms"];
  const table = rows.map((r) => [r.name, r.parts, r.nets, r.tracks, r.vias, r.erc, r.drc, r.sim, r.ms].map(String));
  const widths = head.map((h, i) => Math.max(h.length, ...table.map((t) => t[i].length)));
  const line = (cells) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const t of table) console.log(line(t));
  for (const r of rows) {
    const notes = [...r.lint.map((m) => `lint: ${m}`), ...r.ercWarnings.map((e) => `ERC ${e.code}: ${e.message}`), ...r.drcWarnings.map((e) => `DRC ${e.code}: ${e.message}`)];
    if (notes.length) console.log(`\n${r.name}:\n  ${notes.join("\n  ")}`);
  }
  console.log(`\nWrote ${rows.length} sample(s) and index.json to ${OUT}`);
}

main();
