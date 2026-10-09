// Core model: geometry, values, project normalisation, connectivity, annotation, ERC.
import test from "node:test";
import assert from "node:assert/strict";
import * as geom from "../../src/core/geom.js";
import { newProject, normalizeProject, parseProject, serializeProject, parseValue, formatValue, copperLayers } from "../../src/core/project.js";
import { buildNetlist, annotate, runERC, boardNetlist, partPins } from "../../src/core/netlist.js";
import { allSymbols, getSymbol, searchSymbols, makeBoxSymbol, registerUserSymbols, symbolBounds } from "../../src/lib/symbols.js";
import { allFootprints, getFootprint, makeFootprint } from "../../src/lib/footprints.js";
import { newPart, addWire, cleanup } from "../../src/sch/ops.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// Wire two pin tips with an orthogonal path.
function wire(sch, a, b) {
  if (a.x === b.x || a.y === b.y) addWire(sch, a.x, a.y, b.x, b.y);
  else { addWire(sch, a.x, a.y, b.x, a.y); addWire(sch, b.x, a.y, b.x, b.y); }
}
const pin = (part, num) => partPins(part).find((p) => p.num === num);

test("rotatePoint turns counter-clockwise on screen (y down)", () => {
  const [a1, b1] = geom.rotatePoint(1, 0, 90);
  near(a1, 0); near(b1, -1);
  const [a2, b2] = geom.rotatePoint(0, -1, 90);
  near(a2, -1); near(b2, 0);
  const [x, y] = geom.rotatePoint(1, 0, 45);
  near(x, Math.SQRT1_2, 1e-12);
  near(y, -Math.SQRT1_2, 1e-12);
});

test("xform / unxform round-trip with mirror and rotation", () => {
  const t = { x: 10, y: 20, rot: 270, mirror: true };
  const [wx, wy] = geom.xform(3, -7, t);
  const [lx, ly] = geom.unxform(wx, wy, t);
  near(lx, 3, 1e-9);
  near(ly, -7, 1e-9);
  assert.equal(geom.xformDir("L", { rot: 90 }), "D");
  assert.equal(geom.xformDir("L", { mirror: true }), "R");
});

test("segment distances and intersections", () => {
  assert.equal(geom.segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0), true);
  assert.equal(geom.segmentsIntersect(0, 0, 1, 0, 0, 1, 1, 1), false);
  near(geom.segSegDist(0, 0, 10, 0, 0, 3, 10, 3), 3);
  near(geom.pointSegDist(5, 4, 0, 0, 10, 0), 4);
  assert.equal(geom.pointInPolygon(5, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]), true);
  assert.equal(geom.pointInPolygon(15, 5, [[0, 0], [10, 0], [10, 10], [0, 10]]), false);
  near(Math.abs(geom.polygonArea([[0, 0], [10, 0], [10, 10], [0, 10]])), 100);
});

test("pad polygons and pad distances", () => {
  const a = { shape: "rect", x: 0, y: 0, w: 2, h: 1, rot: 0 };
  const b = { shape: "rect", x: 3, y: 0, w: 2, h: 1, rot: 0 };
  near(geom.padPadDist(a, b), 1, 1e-9);
  const c = { shape: "circle", x: 0, y: 0, w: 2, h: 2 };
  assert.equal(geom.padPolygon(c).length, 24);
  near(geom.segPadDist(0, 3, 10, 3, a), 2.5, 1e-9);
  const rot = geom.padPolygon({ shape: "rect", x: 0, y: 0, w: 4, h: 2, rot: 90 });
  const xs = rot.map((p) => p[0]);
  near(Math.max(...xs) - Math.min(...xs), 2, 1e-9);
});

test("engineering value parsing and formatting", () => {
  assert.equal(parseValue("4k7"), 4700);
  near(parseValue("10u"), 1e-5, 1e-18);
  assert.equal(parseValue("1Meg"), 1e6);
  near(parseValue("2.2nF"), 2.2e-9, 1e-20);
  assert.equal(parseValue("5V"), 5);
  assert.equal(parseValue("1R5"), 1.5);
  assert.equal(parseValue("100mA"), 0.1);
  assert.ok(Number.isNaN(parseValue("abc")));
  assert.equal(formatValue(4700, "Ω"), "4.7 kΩ");
  assert.equal(formatValue(0.0021, "A"), "2.1 mA");
  assert.equal(formatValue(0), "0");
});

test("project normalisation fills defaults and ids, serialise round-trips", () => {
  const p = normalizeProject({ schematic: { parts: [{ lib: "R", x: 0, y: 0 }] }, pcb: { tracks: [{ layer: "F.Cu", x1: 0, y1: 0, x2: 1, y2: 0, w: 0.2 }] } });
  assert.ok(p.schematic.parts[0].id);
  assert.ok(p.pcb.tracks[0].id);
  assert.equal(p.pcb.layerCount, 2);
  assert.deepEqual(copperLayers({ layerCount: 4 }), ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"]);
  const again = parseProject(serializeProject(p));
  assert.deepEqual(again.schematic.parts[0], p.schematic.parts[0]);
  assert.throws(() => parseProject('{"format":"other"}'));
});

test("symbol library integrity: pins unique, on 50-mil grid, footprints exist", () => {
  assert.ok(allSymbols().length >= 50);
  for (const s of allSymbols()) {
    const nums = s.pins.map((p) => p.num);
    // Pins may share a number only for twin pads; symbols here never do.
    assert.equal(new Set(nums).size, nums.length, `${s.name} duplicate pin numbers`);
    for (const p of s.pins) {
      assert.ok(p.x % 50 === 0, `${s.name} pin ${p.num} x off grid`);
      assert.ok(p.y % 50 === 0, `${s.name} pin ${p.num} y off grid`);
      assert.ok("LRUD".includes(p.dir));
    }
    for (const f of s.footprints || []) assert.ok(getFootprint(f), `${s.name} → missing footprint ${f}`);
    if (s.sim) for (const n of s.sim.pins) assert.ok(nums.includes(n), `${s.name} sim pin ${n}`);
    const b = symbolBounds(s);
    assert.ok(b.x2 >= b.x1 && b.y2 >= b.y1);
  }
  assert.equal(searchSymbols("timer")[0].name, "NE555");
  assert.ok(searchSymbols("저항").some((s) => s.name === "R"));
});

test("footprint library integrity and generators", () => {
  assert.ok(allFootprints().length >= 50);
  for (const f of allFootprints()) {
    assert.ok(f.pads.length > 0, f.name);
    assert.ok(f.courtyard.x2 > f.courtyard.x1, f.name);
    assert.ok(f.model3d && f.model3d.kind, `${f.name} model3d`);
    for (const p of f.pads) if (p.layers === "*") assert.ok(p.drill > 0, `${f.name} THT pad without drill`);
  }
  assert.equal(getFootprint("DIP-8_W7.62mm").pads.length, 8);
  assert.equal(makeFootprint("qfp", { perSide: 10, pitch: 0.5 }).pads.length, 40);
  assert.equal(makeFootprint("header", { rows: 2, n: 5 }).pads.length, 10);
  assert.throws(() => makeFootprint("nope"));
});

test("user symbols register and box symbols lay pins out on both sides", () => {
  const s = makeBoxSymbol("TEST_IC", { left: [["1", "A"], ["2", "B"]], right: [["3", "Y"]], bottom: [["4", "GND"]] });
  assert.equal(s.pins.find((p) => p.num === "1").dir, "R");
  assert.equal(s.pins.find((p) => p.num === "3").dir, "L");
  assert.equal(s.pins.find((p) => p.num === "4").dir, "U");
  registerUserSymbols([s]);
  assert.equal(getSymbol("TEST_IC").name, "TEST_IC");
  registerUserSymbols([]);
  assert.equal(getSymbol("TEST_IC"), null);
});

function ledCircuit() {
  const p = newProject("led");
  const s = p.schematic;
  const bt = newPart("BATTERY", 1000, 1000);
  const r = newPart("R", 1600, 600, { rot: 90, value: "330" });
  const d = newPart("LED", 2200, 1000);
  const g1 = newPart("GND", 1000, 1500);
  const g2 = newPart("GND", 2200, 1500);
  s.parts.push(bt, r, d, g1, g2);
  wire(s, pin(bt, "1"), pin(r, "1"));
  wire(s, pin(r, "2"), pin(d, "2"));
  wire(s, pin(bt, "2"), pin(g1, "1"));
  wire(s, pin(d, "1"), pin(g2, "1"));
  cleanup(s);
  annotate(s);
  return { p, bt, r, d };
}

test("netlist: wires, power ports and naming", () => {
  const { p, bt, r, d } = ledCircuit();
  const nl = buildNetlist(p.schematic);
  assert.equal(nl.nets.length, 3);
  const gnd = nl.nets.find((n) => n.name === "GND");
  assert.deepEqual(gnd.pins.map((x) => `${x.ref}.${x.pin}`).sort(), ["BT1.2", "D1.1"]);
  assert.equal(nl.pinNet.get(`${bt.id}:1`), nl.pinNet.get(`${r.id}:1`));
  assert.equal(nl.pinNet.get(`${r.id}:2`), nl.pinNet.get(`${d.id}:2`));
  assert.match(nl.pinNet.get(`${bt.id}:1`), /^Net-\(/);
});

test("netlist: labels join nets, crossings need a junction, T-joints connect", () => {
  const p = newProject();
  const s = p.schematic;
  const r1 = newPart("R", 1000, 1000);
  const r2 = newPart("R", 3000, 1000);
  s.parts.push(r1, r2);
  s.labels.push({ id: "l1", kind: "local", text: "SIG", x: pin(r1, "1").x, y: pin(r1, "1").y, rot: 0 });
  s.labels.push({ id: "l2", kind: "global", text: "SIG", x: pin(r2, "1").x, y: pin(r2, "1").y, rot: 0 });
  // A horizontal and a vertical wire crossing without a junction.
  addWire(s, 0, 2000, 4000, 2000);
  addWire(s, 2000, 1500, 2000, 2500);
  // A T joint: wire ending on the middle of the horizontal one.
  addWire(s, 3000, 1500, 3000, 2000);
  const nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${r1.id}:1`), "SIG");
  assert.equal(nl.pinNet.get(`${r2.id}:1`), "SIG");
  const root = (n, x, y) => n.dsu.find(n.key(x, y));
  assert.notEqual(root(nl, 0, 2000), root(nl, 2000, 1500), "plain crossing must not connect");
  assert.equal(root(nl, 0, 2000), root(nl, 3000, 1500), "T joint connects");
  s.junctions.push({ id: "j", x: 2000, y: 2000 });
  const nl2 = buildNetlist(s);
  assert.equal(root(nl2, 0, 2000), root(nl2, 2000, 1500), "junction connects the crossing");
});

test("annotation numbers per prefix in reading order and keeps existing numbers", () => {
  const p = newProject();
  const s = p.schematic;
  s.parts.push(newPart("R", 2000, 500), newPart("R", 500, 500), newPart("C", 500, 2000), newPart("R", 500, 3000, { ref: "R5" }));
  const changes = annotate(s);
  assert.equal(changes.length, 3);
  assert.deepEqual(s.parts.map((x) => x.ref), ["R2", "R1", "C1", "R5"]);
  annotate(s, { all: true });
  assert.deepEqual(s.parts.map((x) => x.ref).sort(), ["C1", "R1", "R2", "R3"]);
});

test("ERC: clean circuit has no errors; each rule fires", () => {
  const { p } = ledCircuit();
  assert.deepEqual(runERC(p.schematic).filter((i) => i.severity === "error"), []);

  const s = newProject().schematic;
  const u = newPart("NE555", 2000, 2000, { ref: "U1" });
  const r = newPart("R", 4000, 2000, { ref: "U1" }); // duplicate ref
  const q = newPart("R", 5000, 2000); // unannotated "R?"
  s.parts.push(u, r, q);
  s.noconnects.push({ id: "nc", x: 9999, y: 9999 });
  addWire(s, 100, 100, 600, 100);
  const codes = new Set(runERC(s).map((i) => i.code));
  for (const c of ["duplicate-ref", "unannotated", "unconnected-pin", "stray-nc", "dangling-wire"]) assert.ok(codes.has(c), `missing ${c}`);

  // Power input fed only through a label → undriven; a PWR_FLAG fixes it.
  const s2 = newProject().schematic;
  const u2 = newPart("NE555", 2000, 2000, { ref: "U1" });
  s2.parts.push(u2);
  const vcc = pin(u2, "8");
  const vccPart = newPart("+5V", vcc.x, vcc.y);
  s2.parts.push(vccPart);
  assert.ok(runERC(s2).some((i) => i.code === "power-undriven"));
  s2.parts.push(newPart("PWR_FLAG", vcc.x, vcc.y));
  assert.ok(!runERC(s2).some((i) => i.code === "power-undriven" && i.message.includes("U1.8")));

  // Two outputs on one net.
  const s3 = newProject().schematic;
  const a = newPart("NE555", 1000, 1000, { ref: "U1" });
  const b = newPart("NE555", 1000, 3000, { ref: "U2" });
  s3.parts.push(a, b);
  s3.labels.push({ id: "x", kind: "local", text: "Q", x: pin(a, "3").x, y: pin(a, "3").y }, { id: "y", kind: "local", text: "Q", x: pin(b, "3").x, y: pin(b, "3").y });
  assert.ok(runERC(s3).some((i) => i.code === "output-conflict"));
});

test("boardNetlist maps symbol pins to pad nets", () => {
  const { p } = ledCircuit();
  const bn = boardNetlist(p.schematic);
  assert.equal(bn.parts.length, 3);
  const led = bn.parts.find((x) => x.ref === "D1");
  assert.equal(led.padNets["1"], "GND");
  assert.equal(led.footprint, "LED_0805");
});

test("uid is unique", () => {
  const set = new Set(Array.from({ length: 2000 }, () => geom.uid("x")));
  assert.equal(set.size, 2000);
});

test("multi-page: local labels stay on their page, global labels and power join pages", async () => {
  const { pageView, writePageView } = await import("../../src/core/netlist.js");
  const p = newProject("pages");
  const s = p.schematic;
  s.pages.push({ id: "p2", name: "Two" });
  const a = newPart("R", 1000, 1000, { ref: "R1" });
  const b = newPart("R", 1000, 1000, { ref: "R2", page: "p2" });
  s.parts.push(a, b);
  const pa = pin(a, "1");
  const pb = pin(b, "1");
  s.labels.push({ id: "la", kind: "local", text: "X", x: pa.x, y: pa.y }, { id: "lb", kind: "local", text: "X", x: pb.x, y: pb.y, page: "p2" });
  let nl = buildNetlist(s);
  assert.notEqual(nl.pinNet.get(`${a.id}:1`), nl.pinNet.get(`${b.id}:1`), "local labels must not cross pages");
  // Same coordinates on different pages never connect either.
  assert.notEqual(nl.pinNet.get(`${a.id}:2`), nl.pinNet.get(`${b.id}:2`));
  s.labels[0].kind = "global";
  s.labels[1].kind = "global";
  nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${a.id}:1`), nl.pinNet.get(`${b.id}:1`), "global labels join pages");
  // Power ports join pages too.
  const pa2 = pin(a, "2");
  const pb2 = pin(b, "2");
  s.parts.push(newPart("GND", pa2.x, pa2.y), newPart("GND", pb2.x, pb2.y, { page: "p2" }));
  nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${a.id}:2`), "GND");
  assert.equal(nl.pinNet.get(`${b.id}:2`), "GND");
  // ERC issues carry their page, and page views round-trip.
  s.parts.push(newPart("R", 3000, 3000, { ref: "R9", page: "p2" }));
  const iss = runERC(s).filter((i) => i.message.includes("R9"));
  assert.ok(iss.length && iss.every((i) => i.page === "p2"));
  const v = pageView(s, "p2");
  assert.equal(v.parts.length, 3);
  v.wires.push({ id: "wnew", x1: 0, y1: 0, x2: 100, y2: 0 });
  writePageView(s, v);
  assert.equal(s.wires.find((w) => w.id === "wnew").page, "p2");
  assert.equal(pageView(s).wires.length, 0, "first page unaffected");
});

test("library footprints: silkscreen never covers pads, pads keep Power-class clearance", async () => {
  const { runDRC } = await import("../../src/pcb/drc.js");
  const p = newProject("lib");
  const fps = allFootprints();
  const cols = 8;
  fps.forEach((f, i) => {
    p.pcb.footprints.push({ id: `f${i}`, ref: `X${i}`, value: "", footprint: f.name, x: 15 + (i % cols) * 45, y: 15 + Math.floor(i / cols) * 45, rot: 0, side: "F", padNets: {} });
  });
  const W = cols * 45 + 10;
  const H = Math.ceil(fps.length / cols) * 45 + 10;
  p.pcb.outline = [[0, 0], [W, 0], [W, H], [0, H]];
  const silk = runDRC(p).filter((i) => i.code === "silk_over_pad");
  assert.deepEqual(silk.map((i) => i.message), []);
  // Adjacent pads on different nets must clear the Power class (0.25 mm): give every pad its own net.
  for (const f of p.pcb.footprints) {
    const def = getFootprint(f.footprint);
    f.padNets = Object.fromEntries(def.pads.filter((pd) => !pd.npth).map((pd) => [pd.num, `N_${f.ref}_${pd.num}`]));
  }
  p.pcb.rules.netClasses = [{ name: "Power", trackWidth: 0.5, clearance: 0.25, viaDiameter: 1, viaDrill: 0.5, nets: [] }];
  p.pcb.rules.clearance = 0.2;
  const tight = runDRC(p, { skip: ["unconnected"] }).filter((i) => i.code === "clearance" || i.code === "short");
  // Fine-pitch ICs (0.5–0.65 mm pitch) are allowed below 0.2 mm only if the rule says so; the library must pass 0.2.
  assert.deepEqual(tight.map((i) => i.message), []);
});

test("multi-unit parts: units share a reference, nets and one footprint; hidden power pins join their net", async () => {
  const { unitCount, partSymbol } = await import("../../src/lib/symbols.js");
  const { bomRows } = await import("../../src/fab/bom.js");
  const p = newProject("units");
  const s = p.schematic;
  assert.equal(unitCount(getSymbol("LM358_DUAL")), 3);
  const a = newPart("LM358_DUAL", 1000, 1000, { unit: 1, unitGroup: "g1" });
  const b = newPart("LM358_DUAL", 2000, 1000, { unit: 2, unitGroup: "g1" });
  const c = newPart("LM358_DUAL", 3000, 1000, { unit: 3, unitGroup: "g1" });
  s.parts.push(a, b, c);
  assert.deepEqual(partPins(a).map((x) => x.num).sort(), ["1", "2", "3"]);
  assert.deepEqual(partPins(c).map((x) => x.num).sort(), ["4", "8"]);
  assert.equal(partSymbol(b).unitName, "B");
  annotate(s);
  assert.ok(a.ref === b.ref && b.ref === c.ref && /^U\d+$/.test(a.ref), "one reference for the whole component");
  // Wire unit A output to unit B + input with labels.
  s.labels.push({ id: "l1", kind: "local", text: "MID", x: pin(a, "1").x, y: pin(a, "1").y }, { id: "l2", kind: "local", text: "MID", x: pin(b, "5").x, y: pin(b, "5").y });
  s.parts.push(newPart("+5V", pin(c, "8").x, pin(c, "8").y), newPart("GND", pin(c, "4").x, pin(c, "4").y), newPart("PWR_FLAG", pin(c, "8").x, pin(c, "8").y), newPart("PWR_FLAG", pin(c, "4").x, pin(c, "4").y));
  annotate(s);
  assert.ok(!runERC(s).some((i) => i.code === "duplicate-ref"), "units are not duplicates");
  const bn = boardNetlist(s);
  const u = bn.parts.filter((x) => x.ref === a.ref);
  assert.equal(u.length, 1, "one footprint for three units");
  assert.equal(u[0].padNets["1"], "MID");
  assert.equal(u[0].padNets["5"], "MID");
  assert.equal(u[0].padNets["8"], "+5V");
  assert.equal(bomRows(p).filter((r) => r.refs.includes(a.ref)).length, 1, "BOM lists the component once");
  // Hidden power-input pins join the global net named after the pin.
  const { registerUserSymbols } = await import("../../src/lib/symbols.js");
  registerUserSymbols([{ name: "HIDDEN_PWR", title: "t", category: "IC", refPrefix: "U", pins: [{ num: "1", name: "IN", x: -200, y: 0, dir: "R", len: 100, type: "input" }, { num: "2", name: "VDD", x: 0, y: -200, dir: "D", len: 100, type: "power_in", hidden: true }], body: [] }]);
  const s2 = newProject().schematic;
  const hpart = newPart("HIDDEN_PWR", 1000, 1000, { ref: "U9" });
  s2.parts.push(hpart);
  assert.equal(buildNetlist(s2).pinNet.get(`${hpart.id}:2`), "VDD");
  registerUserSymbols([]);
});

test("hierarchy: sheet pins join hierarchical labels on the sub-sheet page", async () => {
  const { sheetPinPoint } = await import("../../src/core/netlist.js");
  const { syncSheetPins } = await import("../../src/sch/ops.js");
  const p = newProject("hier");
  const s = p.schematic;
  s.pages.push({ id: "sub", name: "Filter" });
  const a = newPart("R", 1000, 1000, { ref: "R1" });
  const b = newPart("R", 1000, 1000, { ref: "R2", page: "sub" });
  s.parts.push(a, b);
  const pb = pin(b, "1");
  s.labels.push({ id: "h1", kind: "hier", text: "IN", x: pb.x, y: pb.y, page: "sub" });
  const sh = { id: "sh1", page: "p1", x: 2000, y: 2000, w: 600, h: 400, name: "Filter", target: "sub", pins: [] };
  s.sheets.push(sh);
  // Without a sheet pin the label is flagged and nothing connects.
  assert.ok(runERC(s).some((i) => i.code === "hier-unconnected"));
  assert.equal(syncSheetPins(s, sh), true, "a pin is created for the label");
  assert.deepEqual(sh.pins.map((q) => [q.name, q.side]), [["IN", "L"]]);
  assert.equal(syncSheetPins(s, sh), false, "second sync changes nothing");
  // Wire R1 pin 1 to the sheet pin.
  const [sx, sy] = sheetPinPoint(sh, sh.pins[0]);
  wire(s, pin(a, "1"), { x: sx, y: sy });
  const nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${a.id}:1`), nl.pinNet.get(`${b.id}:1`), "sheet pin reaches the sub-sheet");
  assert.ok(!runERC(s).some((i) => i.code === "hier-unconnected"));
  assert.ok(!runERC(s).some((i) => i.code === "single-label" && i.ids.includes("h1")), "a hierarchical label is not a lone net label");
  // A hierarchical label on another page does not leak through.
  s.pages.push({ id: "other", name: "Other" });
  const c = newPart("R", 1000, 1000, { ref: "R3", page: "other" });
  s.parts.push(c);
  s.labels.push({ id: "h2", kind: "hier", text: "IN", x: pin(c, "1").x, y: pin(c, "1").y, page: "other" });
  assert.notEqual(buildNetlist(s).pinNet.get(`${c.id}:1`), nl.pinNet.get(`${a.id}:1`));
  // Removing the label drops the pin; a broken target is an ERC error.
  s.labels = s.labels.filter((l) => l.id !== "h1");
  syncSheetPins(s, sh);
  assert.equal(sh.pins.length, 0);
  sh.target = "missing";
  assert.ok(runERC(s).some((i) => i.code === "sheet-target"));
});

test("bus labels: D[0..7] expands to members across pages and through sheet pins", async () => {
  const { busMembers } = await import("../../src/core/netlist.js");
  assert.deepEqual(busMembers("D[0..3]"), ["D0", "D1", "D2", "D3"]);
  assert.deepEqual(busMembers("A[3..1]"), ["A1", "A2", "A3"]);
  assert.equal(busMembers("CLK"), null);
  const p = newProject("bus");
  const s = p.schematic;
  s.pages.push({ id: "p2", name: "Two" });
  const a = newPart("R", 1000, 1000, { ref: "R1" });
  const b = newPart("R", 1000, 1000, { ref: "R2", page: "p2" });
  s.parts.push(a, b);
  s.labels.push({ id: "a", kind: "local", text: "D5", x: pin(a, "1").x, y: pin(a, "1").y },
    { id: "b", kind: "local", text: "D5", x: pin(b, "1").x, y: pin(b, "1").y, page: "p2" });
  assert.notEqual(buildNetlist(s).pinNet.get(`${a.id}:1`), buildNetlist(s).pinNet.get(`${b.id}:1`));
  // Global bus labels on both pages carry every member across.
  s.labels.push({ id: "g1", kind: "global", text: "D[0..7]", x: 3000, y: 3000 }, { id: "g2", kind: "global", text: "D[0..7]", x: 3000, y: 3000, page: "p2" });
  let nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${a.id}:1`), nl.pinNet.get(`${b.id}:1`));
  assert.equal(nl.pinNet.get(`${a.id}:1`), "D5", "the member name names the net");
  // A vector sheet pin does the same for one sub-sheet.
  s.labels = s.labels.filter((l) => l.kind !== "global");
  s.sheets.push({ id: "sh", page: "p1", x: 4000, y: 1000, w: 600, h: 400, name: "Two", target: "p2", pins: [{ id: "sp", name: "D[0..7]", side: "L", offset: 100 }] });
  nl = buildNetlist(s);
  assert.equal(nl.pinNet.get(`${a.id}:1`), nl.pinNet.get(`${b.id}:1`));
});

test("far-side pads (layers \"B\") land on the opposite copper layer", async () => {
  const { registerUserFootprints } = await import("../../src/lib/footprints.js");
  const { footprintPads } = await import("../../src/pcb/board.js");
  registerUserFootprints([{ name: "EDGE_TEST", pads: [
    { num: "1", shape: "rect", x: 0, y: 0, w: 1, h: 2, layers: "F" },
    { num: "2", shape: "rect", x: 2, y: 0, w: 1, h: 2, layers: "B" },
  ], graphics: [] }]);
  try {
    const p = newProject("edge");
    const fp = { id: "f1", ref: "J1", footprint: "EDGE_TEST", x: 10, y: 10, rot: 0, side: "F" };
    assert.deepEqual(footprintPads(fp, p.pcb).map((q) => q.layers[0]), ["F.Cu", "B.Cu"]);
    fp.side = "B";
    assert.deepEqual(footprintPads(fp, p.pcb).map((q) => q.layers[0]), ["B.Cu", "F.Cu"]);
  } finally {
    registerUserFootprints([]);
  }
});
