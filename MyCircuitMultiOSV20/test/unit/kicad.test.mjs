// KiCad import: S-expression reader, schematic + board conversion, and the
// coordinate conventions, checked against real KiCad demo projects
// (test/fixtures/kicad, see README.md there).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSexpr, writeSexpr, child, children, value, num, str, flag, at, xy, atoms, head, SexprError } from "../../src/io/sexpr.js";
import { importKicadSchematic, importKicadPcb, importKicadProject, detectKicadFile, kicadSymbolTransform, mapFootprintName, guessModel3d } from "../../src/io/kicad.js";
import { registerUserSymbols, getSymbol } from "../../src/lib/symbols.js";
import { registerUserFootprints } from "../../src/lib/footprints.js";
import { xform, rotatePoint, pointSegDist, polygonArea } from "../../src/core/geom.js";
import { buildNetlist, partPins } from "../../src/core/netlist.js";
import { footprintPads, routingStats } from "../../src/pcb/board.js";
import { serializeProject, parseProject } from "../../src/core/project.js";

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "kicad");
const read = (rel) => fs.readFileSync(path.join(FX, rel), "utf8");

const DESIGNS = {
  ecc83: { sch: "ecc83/ecc83-pp.kicad_sch", pcb: "ecc83/ecc83-pp.kicad_pcb" }, // KiCad 9 syntax
  ecc83v7: { sch: "ecc83-v7/ecc83-pp.kicad_sch", pcb: "ecc83-v7/ecc83-pp.kicad_pcb" }, // KiCad 7 syntax
  sonde: { sch: "sonde_xilinx/sonde_xilinx.kicad_sch", pcb: "sonde_xilinx/sonde_xilinx.kicad_pcb" },
  stickhub: { sch: "stickhub/StickHub.kicad_sch", nets: "stickhub/StickHub.board-nets.json" },
  synthetic: { sch: "synthetic/synthetic.kicad_sch", pcb: "synthetic/synthetic.kicad_pcb" },
};

// ---------------------------------------------------------------- helpers
// Pins of a placed part including its unit's pins (multi-unit format).
function unitPins(part) {
  const sym = getSymbol(part.lib);
  if (!sym) return [];
  const u = sym.units && part.unit ? sym.units[part.unit - 1] : null;
  return [...sym.pins, ...(u ? u.pins : [])];
}

// Connectivity computed straight from the imported geometry (independent of
// src/core/netlist.js): pin tips, wire ends, T joints, labels, power symbols
// and KiCad's implicit hidden power pins. Returns sorted "REF.pin ..." groups
// of nets with at least two distinct real pins.
function independentGroups(sch) {
  const parent = new Map();
  const find = (a) => { if (!parent.has(a)) parent.set(a, a); while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const P = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const attach = [];
  const real = [];
  for (const part of sch.parts) {
    const sym = getSymbol(part.lib);
    assert.ok(sym, `symbol ${part.lib} registered`);
    for (const pin of unitPins(part)) {
      const [x, y] = xform(pin.x, pin.y, part);
      const node = `${part.ref}.${pin.num}`;
      union(node, P(x, y));
      attach.push([Math.round(x), Math.round(y)]);
      if (sym.power) union(node, `pwr:${part.value}`);
      else if (!sym.flag) {
        real.push(node);
        if (pin.hidden && pin.type === "power_in") union(node, `pwr:${pin.name}`);
      }
    }
  }
  for (const w of sch.wires) { union(P(w.x1, w.y1), P(w.x2, w.y2)); attach.push([w.x1, w.y1], [w.x2, w.y2]); }
  for (const l of sch.labels) { attach.push([l.x, l.y]); union(P(l.x, l.y), l.kind === "local" ? `l:${l.text}` : `g:${l.text}`); }
  for (const j of sch.junctions) attach.push([j.x, j.y]);
  for (const w of sch.wires) for (const [x, y] of attach) if (pointSegDist(x, y, w.x1, w.y1, w.x2, w.y2) < 0.5) union(P(x, y), P(w.x1, w.y1));
  const groups = new Map();
  for (const n of real) {
    const r = find(n);
    if (!groups.has(r)) groups.set(r, new Set());
    groups.get(r).add(n);
  }
  return canon([...groups.values()]);
}

const canon = (groups) => groups.map((g) => [...new Set(g)].sort()).filter((g) => g.length >= 2).map((g) => g.join(" ")).sort();

// Pad -> net table KiCad itself wrote into the board (ground truth).
function boardTruth(pcbText) {
  const root = parseSexpr(pcbText);
  const nets = {};
  for (const fp of children(root, "footprint")) {
    const refNode = children(fp, "property").find((p) => p[1] === "Reference") || children(fp, "fp_text").find((p) => p[1] === "reference");
    for (const pad of children(fp, "pad")) {
      const n = child(pad, "net");
      const name = n ? String(n[2] ?? "") : "";
      if (!name || name.startsWith("unconnected-")) continue;
      (nets[name] ||= []).push(`${refNode[2]}.${pad[1]}`);
    }
  }
  return canon(Object.values(nets));
}

// Absolute pad centres computed directly from the KiCad board file:
// footprint (at) + pad (at) rotated by the footprint angle.
function kicadPadCentres(pcbText) {
  const root = parseSexpr(pcbText);
  const out = [];
  for (const fp of children(root, "footprint")) {
    const a = at(fp);
    const refNode = children(fp, "property").find((p) => p[1] === "Reference") || children(fp, "fp_text").find((p) => p[1] === "reference");
    for (const pad of children(fp, "pad")) {
      const pa = at(pad);
      const [x, y] = rotatePoint(pa.x, pa.y, a.angle);
      out.push({ ref: String(refNode[2]), num: String(pad[2] === "np_thru_hole" ? "" : pad[1]), x: a.x + x, y: a.y + y, side: str(fp, "layer") === "B.Cu" ? "B" : "F" });
    }
  }
  return out;
}

// Wire ends that touch nothing (pin, wire, label, junction, no-connect, sheet pin, bus entry).
function danglingWireEnds(sch, sheets = []) {
  const pts = new Map();
  const add = (x, y) => pts.set(`${x},${y}`, (pts.get(`${x},${y}`) || 0) + 1);
  for (const p of sch.parts) for (const pin of unitPins(p)) { const [x, y] = xform(pin.x, pin.y, p); add(Math.round(x), Math.round(y)); }
  for (const w of sch.wires) { add(w.x1, w.y1); add(w.x2, w.y2); }
  for (const o of [...sch.labels, ...sch.noconnects, ...sch.junctions]) add(o.x, o.y);
  for (const s of sheets) for (const p of s.pins) add(p.x, p.y);
  for (const b of sch.buses) if (b.entry) { add(b.x1, b.y1); add(b.x2, b.y2); }
  const out = [];
  for (const w of sch.wires) {
    for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
      if (pts.get(`${x},${y}`) >= 2) continue;
      if (sch.wires.some((o) => o !== w && pointSegDist(x, y, o.x1, o.y1, o.x2, o.y2) < 0.5)) continue;
      out.push([x, y]);
    }
  }
  return out;
}

// Does the core place multi-unit symbols' unit pins (being added in parallel)?
function coreSupportsUnits() {
  registerUserSymbols([{ name: "__probe__", title: "p", category: "x", refPrefix: "U", value: "p", pins: [], body: [], units: [{ name: "A", body: [], pins: [{ num: "1", name: "a", x: 0, y: 0, dir: "R", len: 100, type: "passive" }] }] }]);
  const n = partPins({ id: "p", lib: "__probe__", ref: "U1", x: 0, y: 0, rot: 0, unit: 1 }).length;
  registerUserSymbols([]);
  return n === 1;
}
const UNITS = coreSupportsUnits();

function netlistGroups(sch) {
  const nl = buildNetlist(sch);
  return canon(nl.nets.map((n) => n.pins.map((p) => `${p.ref}.${p.pin}`)));
}

// ================================================================ S-expressions
test("sexpr: atoms, strings with escapes, nested lists", () => {
  const t = parseSexpr('(kicad_sch (version 20231120) (generator "eeschema") (pad "1" smd rect (at -1.5 2e-1 90)) (txt "a \\"q\\" \\\\ b\\nc") (neg -.5) (empty ""))');
  assert.equal(head(t), "kicad_sch");
  assert.equal(num(t, "version"), 20231120);
  assert.equal(str(t, "generator"), "eeschema");
  const pad = child(t, "pad");
  assert.deepEqual(pad.slice(0, 4), ["pad", "1", "smd", "rect"]);
  assert.equal(typeof pad[1], "string", "quoted numbers stay strings");
  assert.deepEqual(at(pad), { x: -1.5, y: 0.2, angle: 90 });
  assert.equal(value(t, "txt"), 'a "q" \\ b\nc');
  assert.equal(num(t, "neg"), -0.5);
  assert.equal(value(t, "empty"), "");
  assert.equal(value(t, "missing", 1, "dflt"), "dflt");
  assert.deepEqual(atoms(pad), ["1", "smd", "rect"]);
  assert.deepEqual(xy(parseSexpr("(p (start 1 2))"), "start"), [1, 2]);
  assert.equal(children(t).length, 6);
});

test("sexpr: flags in both KiCad spellings", () => {
  assert.equal(flag(parseSexpr("(pin passive line (at 0 0 0) hide (name x))"), "hide"), true);
  assert.equal(flag(parseSexpr("(pin passive line (hide yes))"), "hide"), true);
  assert.equal(flag(parseSexpr("(pin passive line (hide no))"), "hide"), false);
  assert.equal(flag(parseSexpr("(pin passive line)"), "hide"), false);
  assert.equal(flag(parseSexpr("(symbol (power))"), "power"), true);
});

test("sexpr: write/parse round-trip of a real schematic and odd strings", () => {
  for (const f of [DESIGNS.ecc83.sch, DESIGNS.ecc83v7.pcb, DESIGNS.synthetic.pcb]) {
    const a = parseSexpr(read(f));
    const b = parseSexpr(writeSexpr(a));
    assert.deepEqual(b, a, f);
  }
  const odd = ["x", "1", "-1.5", "", "a b", 'q"uote', "back\\slash", "new\nline", "(paren)", "${KICAD6_3DMODEL_DIR}/x.wrl", "#PWR01", "Net-(U1-Pad3)", 0, -2.54, 0.0001, 1e-9];
  const node = ["test", ...odd];
  assert.deepEqual(parseSexpr(writeSexpr(node)), node);
});

test("sexpr: errors carry line and column", () => {
  assert.throws(() => parseSexpr('(a (b "unterminated))'), (e) => e instanceof SexprError && /unterminated string/.test(e.message));
  assert.throws(() => parseSexpr("(a (b c)"), (e) => e instanceof SexprError && /missing '\)'/.test(e.message));
  assert.deepEqual(parseSexpr("(a))"), ["a"], "trailing text after the first expression is ignored");
  assert.throws(() => parseSexpr(")"), /unexpected '\)'/);
  assert.throws(() => parseSexpr("\n\n  ("), (e) => e.line === 3 && e.col === 3);
  // Several top-level expressions.
  assert.equal(parseSexpr("(a) (b)", { all: true }).length, 2);
  // Byte-order mark.
  assert.equal(head(parseSexpr("﻿(kicad_pcb)")), "kicad_pcb");
});

test("detectKicadFile", () => {
  assert.equal(detectKicadFile(read(DESIGNS.ecc83.sch)), "schematic");
  assert.equal(detectKicadFile(read(DESIGNS.ecc83v7.pcb)), "pcb");
  assert.equal(detectKicadFile("  \n(kicad_pcb (version 1))"), "pcb");
  assert.equal(detectKicadFile("EESchema Schematic File Version 4"), null);
  assert.equal(detectKicadFile('{"format":"mycircuit"}'), null);
  assert.equal(detectKicadFile(""), null);
  assert.throws(() => importKicadSchematic(read(DESIGNS.ecc83.pcb)), /Not a KiCad schematic/);
  assert.throws(() => importKicadPcb(read(DESIGNS.ecc83.sch)), /Not a KiCad board/);
});

// ================================================================ schematic conventions
test("symbol transform mapping (KiCad angle + mirror -> rot/mirror)", () => {
  assert.deepEqual(kicadSymbolTransform(0), { rot: 0, mirror: false });
  assert.deepEqual(kicadSymbolTransform(90), { rot: 90, mirror: false });
  assert.deepEqual(kicadSymbolTransform(-90), { rot: 270, mirror: false });
  assert.deepEqual(kicadSymbolTransform(0, "y"), { rot: 0, mirror: true });
  assert.deepEqual(kicadSymbolTransform(0, "x"), { rot: 180, mirror: true });
  assert.deepEqual(kicadSymbolTransform(90, "x"), { rot: 90, mirror: true });
  assert.deepEqual(kicadSymbolTransform(270, "y"), { rot: 90, mirror: true });
});

for (const [key, d] of Object.entries(DESIGNS)) {
  if (key === "synthetic") continue;
  test(`schematic ${key}: pin tips meet wire ends and connectivity equals KiCad's board netlist`, () => {
    const r = importKicadSchematic(read(d.sch));
    registerUserSymbols(r.symbols);
    const sch = r.schematic;
    assert.ok(sch.parts.length > 10 && sch.wires.length > 20);
    // Normal KiCad files sit on the 50 mil grid after conversion.
    for (const o of [...sch.parts, ...sch.junctions]) { assert.equal(o.x % 50, 0, `${o.ref || "junction"} x on grid`); assert.equal(o.y % 50, 0); }
    assert.deepEqual(danglingWireEnds(sch, r.sheets), [], "every wire end touches a pin, wire, label or junction");
    const truth = d.nets ? canon(Object.values(JSON.parse(read(d.nets)).nets)) : boardTruth(read(d.pcb));
    assert.ok(truth.length >= 9);
    assert.deepEqual(independentGroups(sch), truth);
  });
}

test("schematic stickhub (mirrored + rotated parts): buildNetlist reproduces KiCad's nets", () => {
  const r = importKicadSchematic(read(DESIGNS.stickhub.sch));
  registerUserSymbols(r.symbols);
  const sch = r.schematic;
  const combos = new Set(sch.parts.map((p) => `${p.rot}/${p.mirror}`));
  for (const c of ["90/true", "270/true", "0/true", "270/false"]) assert.ok(combos.has(c), `fixture exercises ${c}`);
  const truth = canon(Object.values(JSON.parse(read(DESIGNS.stickhub.nets)).nets));
  assert.equal(truth.length, 45);
  assert.deepEqual(netlistGroups(sch), truth);
});

test("schematic ecc83: buildNetlist with multi-unit tubes", (t) => {
  if (!UNITS) { t.skip("core partPins does not place unit pins yet"); return; }
  for (const d of [DESIGNS.ecc83, DESIGNS.ecc83v7]) {
    const r = importKicadSchematic(read(d.sch));
    registerUserSymbols(r.symbols);
    assert.deepEqual(netlistGroups(r.schematic), boardTruth(read(d.pcb)));
  }
});

test("schematic: KiCad 7 and KiCad 9 files of the same design import identically", () => {
  const strip = (r) => JSON.stringify({
    parts: r.schematic.parts.map(({ id, lib, refOffset, valueOffset, fields, ...p }) => ({ ...p, lib: lib.replace(/^[^:]*:/, "") })),
    wires: r.schematic.wires.map(({ id, ...w }) => w),
    junctions: r.schematic.junctions.map(({ id, ...j }) => j),
    noconnects: r.schematic.noconnects.map(({ id, ...n }) => n),
  });
  assert.equal(strip(importKicadSchematic(read(DESIGNS.ecc83v7.sch))), strip(importKicadSchematic(read(DESIGNS.ecc83.sch))));
});

test("schematic: multi-unit symbols (ECC83 double triode, 74LS125 quad)", () => {
  const r = importKicadSchematic(read(DESIGNS.ecc83.sch));
  const ecc = r.symbols.find((s) => s.name === "ecc83-pp:ECC83");
  assert.equal(ecc.units.length, 3);
  assert.deepEqual(ecc.units.map((u) => u.name), ["A", "B", "C"]);
  assert.deepEqual(ecc.units[0].pins.map((p) => p.num).sort(), ["6", "7", "8"]);
  assert.ok(ecc.body.length >= 3, "unit-0 graphics are common body");
  const all = [...ecc.pins, ...ecc.units.flatMap((u) => u.pins)].map((p) => p.num);
  assert.equal(new Set(all).size, all.length, "pin numbers unique across units");
  const tubes = r.schematic.parts.filter((p) => p.lib === "ecc83-pp:ECC83");
  assert.equal(tubes.length, 3);
  assert.deepEqual(tubes.map((p) => p.unit).sort(), [1, 2, 3]);
  assert.equal(new Set(tubes.map((p) => p.ref)).size, 1, "units of one tube share the reference");
  // Grid pin (G, input) of unit A: library (at -7.62 0 0) -> tip (-300, 0) pointing right.
  assert.deepEqual(ecc.units[0].pins.find((p) => p.num === "7"), { num: "7", name: "G", x: -300, y: 0, dir: "R", len: 100, type: "input" });

  const s = importKicadSchematic(read(DESIGNS.sonde.sch));
  const ls = s.symbols.find((x) => x.name === "sonde_xilinx:74LS125");
  assert.equal(ls.units.length, 4);
  assert.deepEqual(ls.pins.map((p) => [p.name, p.hidden, p.type]).sort(), [["GND", true, "power_in"], ["VCC", true, "power_in"]]);
  assert.ok(s.warnings.some((w) => /hidden power pins/.test(w)));
});

// ================================================================ synthetic schematic
test("synthetic schematic: parts, transforms, symbols, power, fields", () => {
  const r = importKicadSchematic(read(DESIGNS.synthetic.sch), { pageName: "Top" });
  registerUserSymbols(r.symbols);
  const sch = r.schematic;
  assert.equal(sch.sheet, "A3");
  assert.deepEqual(sch.pages, [{ id: "p1", name: "Top" }]);
  assert.deepEqual(r.titleBlock, { title: 'Synthetic "import" test', date: "2026-10-09", rev: "B", company: "MyCircuit tests", comment: "Hand-written KiCad 8 schematic" });
  const byRef = (ref, unit) => sch.parts.find((p) => p.ref === ref && (unit == null || p.unit === unit));
  const R1 = byRef("R1"), R2 = byRef("R2"), D1 = byRef("D1");
  assert.deepEqual([R1.x, R1.y, R1.rot, R1.mirror], [4000, 2000, 90, false]);
  assert.deepEqual([R2.x, R2.y, R2.rot, R2.mirror, R2.dnp], [5000, 2000, 90, true, true], "(at 127 50.8 270) (mirror y)");
  assert.deepEqual([D1.rot, D1.mirror], [0, true], "(at .. 180) (mirror x)");
  assert.equal(R1.footprint, "R_0805", "KiCad library footprint mapped to the built-in one");
  assert.equal(R1.fields.kicadFootprint, "Resistor_SMD:R_0805_2012Metric");
  assert.equal(R1.fields.MPN, "RC0805FR-0710KL");
  assert.equal(R1.fields.Datasheet, undefined, "'~' datasheet dropped");
  assert.equal(R1.value, "10k");
  assert.equal(R2.ref, "R2", "reference from (instances), not the stale property");
  assert.deepEqual(sch.parts.filter((p) => p.ref === "U1").map((p) => [p.unit, p.footprint]), [[1, "SOIC-8_3.9x4.9mm"], [2, "SOIC-8_3.9x4.9mm"], [3, "SOIC-8_3.9x4.9mm"]]);

  const R = getSymbol("Device:R");
  assert.equal(R.refPrefix, "R");
  assert.deepEqual(R.pins.map((p) => [p.num, p.x, p.y, p.dir, p.len, p.hideNum]), [["1", 0, -150, "D", 50, true], ["2", 0, 150, "U", 50, true]]);
  assert.deepEqual(R.body, [{ t: "rect", x1: -40, y1: -100, x2: 40, y2: 100 }]);
  assert.match(R.keywords, /resistor/);
  const LED = getSymbol("Device:LED");
  assert.ok(LED.pins.every((p) => p.hideName && p.hideNum));
  assert.deepEqual(LED.body.find((b) => b.t === "poly").fill, "fg");
  assert.deepEqual(LED.body.find((b) => b.t === "circle"), { t: "circle", cx: 0, cy: 0, r: 80 });
  const arc = LED.body.find((b) => b.t === "arc");
  assert.ok(arc && arc.a2 > arc.a1 && arc.a2 - arc.a1 < 90, "short arc, CCW a1 -> a2");
  // Arc end points land on the converted library points (y negated).
  const end = (a) => [arc.cx + arc.r * Math.cos(a * Math.PI / 180), arc.cy - arc.r * Math.sin(a * Math.PI / 180)];
  const ends = [end(arc.a1), end(arc.a2)].map(([x, y]) => [Math.round(x), Math.round(y)]).sort((a, b) => a[0] - b[0]);
  assert.ok(Math.hypot(ends[0][0] - 50, ends[0][1] + 70) <= 2 && Math.hypot(ends[1][0] - 120, ends[1][1] + 130) <= 2, JSON.stringify(ends));
  assert.deepEqual(LED.body.find((b) => b.t === "text"), { t: "text", x: 0, y: 150, text: "LED", size: 50, anchor: "start" });
  assert.equal(getSymbol("power:GND").power, "GND");
  assert.equal(getSymbol("power:GND").category, "Power");
  assert.equal(getSymbol("power:+5V").power, "+5V");
  assert.equal(getSymbol("power:+5V").refPrefix, "#PWR");
  const dual = getSymbol("Amp:DUAL");
  assert.deepEqual(dual.units.map((u) => u.pins.map((p) => p.num).join()), ["1,2,3", "5,6,7", "8,4"]);
  assert.equal(dual.units[0].body[0].fill, "body");
  assert.ok(r.warnings.some((w) => /De Morgan/.test(w)), "alternate body style skipped with a warning");
});

test("synthetic schematic: labels, texts, buses, sheets and connectivity", () => {
  const r = importKicadSchematic(read(DESIGNS.synthetic.sch));
  registerUserSymbols(r.symbols);
  const sch = r.schematic;
  const lab = (text, kind) => sch.labels.filter((l) => l.text === text && l.kind === kind).map(({ id, ...l }) => l);
  assert.deepEqual(lab("SIG", "local"), [{ kind: "local", text: "SIG", x: 4500, y: 2500, rot: 270 }, { kind: "local", text: "SIG", x: 4650, y: 2000, rot: 0 }]);
  assert.deepEqual(lab("VOUT", "global"), [{ kind: "global", text: "VOUT", x: 4750, y: 4000, rot: 0, shape: "output" }]);
  assert.deepEqual(lab("HIN", "hier"), [{ kind: "hier", text: "HIN", x: 3700, y: 3900, rot: 180, shape: "input" }]);
  assert.deepEqual(sch.texts[0], { ...sch.texts[0], text: "Synthetic\nimport test", x: 2000, y: 1200, size: 100, rot: 0 });
  assert.deepEqual(sch.buses.map(({ id, ...b }) => b), [{ x1: 2000, y1: 5000, x2: 4000, y2: 5000 }, { x1: 2400, y1: 5000, x2: 2500, y2: 5100, entry: true }]);
  assert.deepEqual(sch.junctions.map((j) => [j.x, j.y]), [[4500, 2000]]);
  assert.equal(sch.noconnects.length, 3);
  assert.deepEqual(r.sheets, [{ name: "Child", file: "child.kicad_sch", uuid: "5a1e0000-0000-4000-8000-000000000301", x: 7500, y: 1600, w: 1000, h: 500, pins: [{ name: "IN", type: "input", x: 7500, y: 1800, rot: 180 }] }]);
  assert.ok(sch.texts.some((t) => /Sheet Child/.test(t.text)));
  assert.ok(r.warnings.some((w) => /hierarchical sheet/.test(w)));
  assert.ok(r.warnings.some((w) => /graphic item/.test(w)));
  assert.deepEqual(danglingWireEnds(sch), []);
  assert.deepEqual(independentGroups(sch), [
    "D1.1 U1.4", // GND
    "D1.2 R2.2",
    "R1.1 U1.8", // +5V
    "R1.2 R2.1", // SIG
    "U1.1 U1.7", // VOUT
  ]);
  if (UNITS) {
    const nl = buildNetlist(sch);
    assert.deepEqual(canon(nl.nets.map((n) => n.pins.map((p) => `${p.ref}.${p.pin}`))), independentGroups(sch));
    assert.ok(nl.nets.some((n) => n.name === "SIG" && n.pins.length === 2));
  }
});

test("schematic: KiCad 6 symbol_instances table supplies references", () => {
  const text = `(kicad_sch (version 20211123) (generator eeschema) (uuid 11111111-0000-0000-0000-000000000000) (paper "USLetter")
    (lib_symbols (symbol "Device:C" (pin_numbers hide) (in_bom yes) (on_board yes)
      (property "Reference" "C" (id 0) (at 0 0 0)) (property "Value" "C" (id 1) (at 0 0 0))
      (symbol "C_0_1" (polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) (stroke (width 0.508) (type default) (color 0 0 0 0)) (fill (type none))))
      (symbol "C_1_1" (pin passive line (at 0 3.81 270) (length 2.794) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
                      (pin passive line (at 0 -3.81 90) (length 2.794) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27))))))))
    (symbol (lib_id "Device:C") (at 50.8 50.8 0) (unit 1) (in_bom yes) (on_board yes) (uuid aaaaaaaa-0000-0000-0000-000000000001)
      (property "Reference" "C?" (id 0) (at 53.34 49.53 0)) (property "Value" "100n" (id 1) (at 53.34 52.07 0)) (property "Footprint" "Capacitor_SMD:C_0603_1608Metric" (id 2) (at 0 0 0) (effects (font (size 1.27 1.27)) hide)))
    (symbol_instances (path "/aaaaaaaa-0000-0000-0000-000000000001" (reference "C7") (unit 1) (value "100n") (footprint "Capacitor_SMD:C_0603_1608Metric"))))`;
  const r = importKicadSchematic(text);
  assert.equal(r.schematic.parts[0].ref, "C7");
  assert.equal(r.schematic.parts[0].footprint, "C_0603");
  assert.equal(r.schematic.sheet, "Letter");
  assert.deepEqual(r.symbols[0].body, [{ t: "line", pts: [[-80, 30], [80, 30]], w: 2 }]);
});

// ================================================================ board
function padCheck(pcbText, imported) {
  registerUserFootprints(imported.footprints);
  const want = kicadPadCentres(pcbText);
  const byRef = new Map(imported.pcb.footprints.map((f) => [f.ref, f]));
  let checked = 0;
  for (const k of want) {
    const fp = byRef.get(k.ref);
    assert.ok(fp, `footprint ${k.ref}`);
    assert.equal(fp.side, k.side);
    const ours = footprintPads(fp, imported.pcb).filter((p) => p.num === k.num);
    const best = Math.min(...ours.map((p) => Math.hypot(p.x - k.x, p.y - k.y)));
    assert.ok(best <= 1e-3, `${k.ref}.${k.num} off by ${best} mm`);
    checked++;
  }
  return checked;
}

test("board ecc83 (KiCad 9 and 7): pads at KiCad positions, fully routed, closed outline", () => {
  for (const d of [DESIGNS.ecc83, DESIGNS.ecc83v7]) {
    const text = read(d.pcb);
    const r = importKicadPcb(text);
    const pcb = r.pcb;
    assert.equal(pcb.layerCount, 2);
    assert.equal(pcb.footprints.length, 15);
    assert.ok(new Set(pcb.footprints.map((f) => f.rot)).size >= 3, "rotated footprints present");
    assert.ok(padCheck(text, r) > 30);
    const st = routingStats(pcb);
    assert.equal(st.total, 20);
    assert.equal(st.unrouted, 0);
    assert.equal(pcb.outline.length, 4);
    assert.ok(Math.abs(Math.abs(polygonArea(pcb.outline)) - 52.07 * 46.355) < 1e-6, `outline area ${polygonArea(pcb.outline)}`);
    assert.deepEqual([...new Set(pcb.zones.map((z) => `${z.layer}:${z.net}`))], ["B.Cu:GND"]);
    const R1 = pcb.footprints.find((f) => f.ref === "R1");
    assert.equal(R1.value, "1.5K");
    assert.equal(R1.footprint, "R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal");
    assert.deepEqual(r.footprints.find((f) => f.name === R1.footprint).model3d, { kind: "axial", pitch: 7.62, L: 6.3, D: 2.5, body: "resistor" });
    // Same footprint used at several angles collapses into one definition.
    assert.equal(r.footprints.filter((f) => f.name.startsWith("R_Axial")).length, 1);
    assert.equal(pcb.footprints.filter((f) => f.footprint === R1.footprint).length, 4);
  }
});

test("board sonde: back-side footprint pads, vias, edge-mount connector", () => {
  const text = read(DESIGNS.sonde.pcb);
  const r = importKicadPcb(text);
  const J2 = r.pcb.footprints.find((f) => f.ref === "J2");
  assert.equal(J2.side, "B");
  assert.equal(J2.rot, 90, "B.Cu (at .. -90) -> rot -90 + 180");
  assert.ok(padCheck(text, r) > 100);
  assert.equal(r.pcb.vias.length, 3);
  const st = routingStats(r.pcb);
  assert.ok(st.total > 50);
  // Only the J1 solder cups on the far (bottom) side stay unrouted: their pads
  // are marked layers "B", which the core does not place on the other side yet.
  const farPads = r.pcb.footprints.flatMap((fp) => footprintPads(fp, r.pcb).filter((p, i) => r.footprints.find((d) => d.name === fp.footprint).pads[p.index].layers === "B"));
  assert.ok(farPads.length >= 16);
  for (const rat of st.rats) {
    assert.ok(farPads.some((p) => Math.hypot(p.x - rat.x1, p.y - rat.y1) < 1e-6 || Math.hypot(p.x - rat.x2, p.y - rat.y2) < 1e-6), `rat ${rat.net} explained by a far-side pad`);
  }
  assert.ok(st.unrouted <= 2);
});

test("synthetic board: B-side SMD at 150°, arcs, vias, zones, outline with arcs and a cut-out", () => {
  const text = read(DESIGNS.synthetic.pcb);
  const r = importKicadPcb(text);
  const pcb = r.pcb;
  assert.equal(pcb.layerCount, 4);
  assert.equal(pcb.thickness, 1.2);
  assert.equal(padCheck(text, r), 7);
  // F and B instances of the same footprint share one definition.
  assert.deepEqual(r.footprints.map((f) => f.name), ["R_0805_2012Metric", "PinHeader_1x02_P2.54mm_Vertical", "MountingHole_3.2mm_M3"]);
  const R1 = pcb.footprints.find((f) => f.ref === "R1");
  const R2 = pcb.footprints.find((f) => f.ref === "R2");
  assert.deepEqual([R1.rot, R1.side, R2.rot, R2.side], [30, "F", 330, "B"]);
  const res = r.footprints[0];
  assert.deepEqual(res.pads.map((p) => [p.num, p.x, p.y, p.w, p.h, p.shape, p.layers, p.rot]), [["1", -0.9125, 0, 1.025, 1.4, "roundrect", "F", undefined], ["2", 0.9125, 0, 1.025, 1.4, "roundrect", "F", undefined]]);
  assert.deepEqual(res.courtyard, { x1: -1.68, y1: -0.95, x2: 1.68, y2: 0.95 });
  assert.ok(res.silk.some((s) => s.t === "line" && s.x1 === -1.5 && s.y1 === -0.8), "pin-1 mark on the front-local top side");
  const arc = res.silk.find((s) => s.t === "arc");
  assert.deepEqual([arc.cx, arc.cy, arc.r, arc.a1, arc.a2], [1.6, 0, 0.4, 0, 90]);
  assert.deepEqual(res.model3d, { kind: "chip", L: 2, W: 1.25, H: 0.5, body: "resistor", polarity: false });
  // Back-side pads land where KiCad puts them and on the bottom copper.
  const r2pads = footprintPads(R2, pcb);
  assert.deepEqual(r2pads.map((p) => p.layers), [["B.Cu"], ["B.Cu"]]);
  assert.ok(Math.hypot(r2pads[0].x - 120.790248, r2pads[0].y - 100.45625) < 1e-5);
  assert.equal(((r2pads[0].rot % 180) + 180) % 180, 150, "pad orientation as in KiCad (mod 180)");
  const J1 = r.footprints.find((f) => f.name.startsWith("PinHeader"));
  assert.deepEqual(J1.pads.map((p) => [p.shape, p.drill, p.layers]), [["rect", 1, "*"], ["oval", 1, "*"]]);
  assert.deepEqual(J1.courtyard, { x1: -1.8, y1: -1.2, x2: 1.8, y2: 4.35 });
  assert.equal(J1.silk.filter((s) => s.t === "line").length, 5, "fp_poly -> closed line loop");
  assert.equal(J1.model3d.kind, "header");
  const H1 = r.footprints.find((f) => f.name.startsWith("MountingHole"));
  assert.deepEqual(H1.pads, [{ num: "", shape: "circle", x: 0, y: 0, w: 3.2, h: 3.2, drill: 3.2, layers: "*", npth: true }]);
  assert.equal(pcb.footprints.find((f) => f.ref === "J1").hideValue, true);
  assert.deepEqual(R2.refPos, { x: 0.825, y: -1.42894 });

  // Copper.
  assert.equal(pcb.vias.length, 2);
  assert.deepEqual(pcb.vias.map((v) => [v.net, v.d, v.drill]), [["SIG", 0.6, 0.3], ["+5V", 0.8, 0.4]]);
  const arcTracks = pcb.tracks.filter((t) => t.net === "SIG" && t.layer === "F.Cu" && t.x1 >= 106 && t.x2 <= 109 && t.y2 >= 107);
  assert.ok(arcTracks.length >= 6, "arc flattened into segments");
  for (const t of arcTracks) for (const [x, y] of [[t.x1, t.y1], [t.x2, t.y2]]) assert.ok(Math.abs(Math.hypot(x - 106, y - 107) - 3) < 1e-4);
  const st = routingStats(pcb);
  assert.deepEqual([st.total, st.unrouted], [3, 0]);
  assert.deepEqual(pcb.zones.map((z) => [z.layer, z.net, z.priority, z.clearance, z.thermal]), [["F.Cu", "GND", 2, 0.5, true], ["In1.Cu", "GND", 2, 0.5, true], ["In2.Cu", "+5V", 0, 0.3, false]]);
  assert.ok(pcb.zones[2].pts.length > 8, "zone outline arc flattened");
  // Outline: rounded rectangle from lines + arcs; the round hole is a cut-out.
  assert.ok(pcb.outline.length > 20);
  assert.ok(Math.abs(Math.abs(polygonArea(pcb.outline)) - (45 * 28 - (4 - Math.PI) * 4)) < 0.2);
  const cut = pcb.graphics.filter((g) => g.layer === "Edge.Cuts");
  assert.ok(cut.length >= 24 && cut.every((g) => Math.abs(Math.hypot(g.x1 - 128, g.y1 - 95) - 1.5) < 1e-4));
  assert.ok(pcb.graphics.some((g) => g.layer === "F.SilkS" && g.kind === "line"));
  assert.ok(pcb.graphics.some((g) => g.layer === "Dwgs.User" && g.kind === "rect"));
  assert.deepEqual(pcb.texts.map((t) => [t.layer, t.text, t.size, t.mirror]), [["F.SilkS", 'SYNTH "8"', 1.5, false], ["B.SilkS", "BOTTOM", 1, true]]);
  for (const w of [/keep-out/, /arc track/, /copper graphic/, /cut-out/, /Oval/]) assert.ok(r.warnings.some((x) => w.test(x)), String(w));
});

test("footprint name mapping and 3D model guesses", () => {
  assert.equal(mapFootprintName("Resistor_SMD:R_0603_1608Metric"), "R_0603");
  assert.equal(mapFootprintName("LED_SMD:LED_0805_2012Metric"), "LED_0805");
  assert.equal(mapFootprintName("Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical"), "PinHeader_1x04_P2.54mm");
  assert.equal(mapFootprintName("Package_DIP:DIP-8_W7.62mm"), "DIP-8_W7.62mm");
  assert.equal(mapFootprintName("Package_TO_SOT_SMD:SOT-23"), "SOT-23");
  assert.equal(mapFootprintName("Valve:Valve_ECC-83-1"), "Valve_ECC-83-1");
  assert.equal(mapFootprintName(""), "");
  assert.equal(guessModel3d("SOIC-8_3.9x4.9mm_P1.27mm").kind, "soic");
  assert.equal(guessModel3d("TSSOP-16_4.4x5mm_P0.65mm").pitch, 0.65);
  assert.equal(guessModel3d("LQFP-48_7x7mm_P0.5mm").kind, "qfp");
  assert.equal(guessModel3d("QFN-24-1EP_4x4mm_P0.5mm").kind, "qfp");
  assert.deepEqual(guessModel3d("DIP-14_W7.62mm"), { kind: "dip", n: 14, pitch: 2.54, row: 7.62 });
  assert.deepEqual(guessModel3d("PinSocket_2x05_P2.54mm_Vertical"), { kind: "header", rows: 2, n: 5, pitch: 2.54 });
  assert.equal(guessModel3d("SOT-23-5").kind, "sot23");
  assert.equal(guessModel3d("TO-92_Inline").kind, "to92");
  assert.equal(guessModel3d("TO-220-3_Vertical").kind, "to220");
  assert.equal(guessModel3d("Crystal_HC49-U_Vertical").kind, "crystal");
  assert.equal(guessModel3d("D_SOD-123").kind, "sod123");
  assert.equal(guessModel3d("CP_Radial_D8.0mm_P3.50mm").D, 8);
  assert.equal(guessModel3d("LED_D5.0mm").kind, "led");
  assert.equal(guessModel3d("C_0603_1608Metric").kind, "chip");
  assert.deepEqual(guessModel3d("Valve_ECC-83-1"), { kind: "box" });
});

// ================================================================ project
test("importKicadProject: complete project that survives save/load", () => {
  for (const key of ["ecc83", "synthetic"]) {
    const d = DESIGNS[key];
    const p = importKicadProject({ schText: read(d.sch), pcbText: read(d.pcb), name: key });
    assert.equal(p.format, "mycircuit");
    assert.ok(p.library.symbols.length >= 5 && p.library.footprints.length >= 3);
    assert.ok(Array.isArray(p.importWarnings));
    assert.equal(Object.keys(p).includes("importWarnings"), false, "warnings are not saved");
    // Board footprints are linked to their schematic parts.
    const refs = new Set(p.schematic.parts.map((x) => x.ref));
    const linkable = p.pcb.footprints.filter((f) => refs.has(f.ref));
    assert.ok(linkable.length >= 2);
    for (const fp of linkable) {
      const part = p.schematic.parts.find((x) => x.id === fp.partId);
      assert.ok(part, `${fp.ref} linked`);
      assert.equal(part.ref, fp.ref);
      assert.equal(part.footprint, fp.footprint);
    }
    const before = routingStats(p.pcb);
    const q = parseProject(serializeProject(p));
    assert.deepEqual(JSON.parse(serializeProject(q)), JSON.parse(serializeProject(p)));
    const after = routingStats(q.pcb);
    assert.deepEqual([after.total, after.unrouted], [before.total, before.unrouted]);
    assert.equal(after.unrouted, 0);
  }
  const synth = importKicadProject({ schText: read(DESIGNS.synthetic.sch), pcbText: read(DESIGNS.synthetic.pcb) });
  assert.equal(synth.meta.title, 'Synthetic "import" test');
  assert.equal(synth.meta.rev, "B");
  assert.equal(synth.schematic.sheet, "A3");
  assert.equal(synth.pcb.layerCount, 4);
  assert.deepEqual(synth.schematic.parts.filter((x) => x.ref === "U1").map((x) => x.footprint), ["SOIC-8_3.9x4.9mm", "SOIC-8_3.9x4.9mm", "SOIC-8_3.9x4.9mm"], "unplaced U1 keeps the mapped footprint");
  assert.equal(synth.schematic.parts.find((x) => x.ref === "R1").footprint, "R_0805_2012Metric", "placed parts take the board's footprint");
  assert.equal(synth.importSheets.length, 1);
  // Board only / schematic only.
  const boardOnly = importKicadProject({ pcbText: read(DESIGNS.ecc83.pcb), name: "Board" });
  assert.equal(boardOnly.schematic.parts.length, 0);
  assert.equal(boardOnly.pcb.footprints.length, 15);
  const schOnly = importKicadProject({ schText: read(DESIGNS.ecc83.sch) });
  assert.equal(schOnly.meta.title, "ECC Push-Pull");
  assert.equal(schOnly.pcb.footprints.length, 0);
  assert.throws(() => importKicadProject({}), /Nothing to import/);
});

test("hierarchical KiCad project: sheet symbols become sheet blocks with their own pages", () => {
  const schText = read(DESIGNS.synthetic.sch);
  const child = read("synthetic/child.kicad_sch");
  // Without the sub-sheet file: block + empty page, with a warning.
  const bare = importKicadProject({ schText });
  assert.equal(bare.schematic.sheets.length, 1);
  assert.equal(bare.schematic.pages.length, 2);
  assert.ok(bare.importWarnings.some((w) => /was not supplied/.test(w)));
  assert.ok(!bare.schematic.texts.some((t) => /^\[Sheet /.test(t.text)), "the note is replaced by the block");
  // With it: the child is imported onto that page and joins through the sheet pin.
  const p = importKicadProject({ schText, sheetTexts: { "child.kicad_sch": child } });
  registerUserSymbols(p.library.symbols);
  const [sh] = p.schematic.sheets;
  assert.deepEqual([sh.name, sh.x, sh.y, sh.w, sh.h], ["Child", 7500, 1600, 1000, 500]);
  assert.deepEqual(sh.pins.map((q) => [q.name, q.side, q.offset]), [["IN", "L", 200]]);
  const page = p.schematic.pages.find((g) => g.id === sh.target);
  assert.equal(page.name, "Child");
  const kid = p.schematic.labels.find((l) => l.text === "KID");
  assert.equal(kid.page, sh.target);
  // Nothing is wired to the pin on the top sheet; add a stub wire there.
  const parentWire = { id: "stub", x1: 7000, y1: 1800, x2: 7500, y2: 1800 };
  p.schematic.wires.push(parentWire);
  const nl = buildNetlist(p.schematic);
  const childWire = p.schematic.wires.find((w) => w.page === sh.target);
  assert.ok(parentWire && childWire);
  assert.equal(nl.wireNet.get(parentWire.id), nl.wireNet.get(childWire.id), "parent wire reaches the child page");
  assert.ok(!p.importWarnings.some((w) => /was not supplied/.test(w)));
});
