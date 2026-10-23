// Schematic and PCB edit operations (the logic behind the editors' tools),
// plus the SVG renderer used for printing and export.
import test from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../../src/core/project.js";
import { buildNetlist, partPins, boardNetlist, annotate } from "../../src/core/netlist.js";
import * as sops from "../../src/sch/ops.js";
import * as pops from "../../src/pcb/ops.js";
import { footprintPads, footprintGraphics, updateBoardFromSchematic, routingStats, ratsnest, netAtPoint, copperConnectivity } from "../../src/pcb/board.js";
import { zoneOps, insetPolygon } from "../../src/pcb/zones.js";
import { SvgContext } from "../../src/ui/svgctx.js";
import { drawSchematic, SCH_THEMES, fieldPositions } from "../../src/sch/render.js";
import { drawBoard, PCB_THEMES } from "../../src/pcb/render.js";
import { getSymbol } from "../../src/lib/symbols.js";

const pin = (part, num) => partPins(part).find((p) => p.num === num);

// ---------------------------------------------------------------- schematic
test("cleanup merges collinear wires, removes zero-length and duplicate wires", () => {
  const s = newProject().schematic;
  sops.addWire(s, 0, 0, 100, 0);
  sops.addWire(s, 100, 0, 300, 0);
  s.wires.push({ id: "z", x1: 50, y1: 50, x2: 50, y2: 50 });
  s.wires.push({ id: "d", x1: 300, y1: 0, x2: 100, y2: 0 });
  sops.cleanup(s);
  assert.equal(s.wires.length, 1);
  assert.deepEqual([s.wires[0].x1, s.wires[0].x2].sort((a, b) => a - b), [0, 300]);
});

test("auto junctions appear at T joints and vanish when not needed", () => {
  const s = newProject().schematic;
  sops.addWire(s, 0, 0, 400, 0);
  sops.addWire(s, 200, 0, 200, 300);
  sops.cleanup(s);
  assert.equal(s.junctions.length, 1);
  assert.deepEqual([s.junctions[0].x, s.junctions[0].y], [200, 0]);
  // The T splits the horizontal wire so both halves end at the dot.
  assert.equal(s.wires.length, 3);
  s.wires = s.wires.filter((w) => !(w.x1 === 200 && w.x2 === 200));
  sops.cleanup(s);
  assert.equal(s.junctions.length, 0);
  assert.equal(s.wires.length, 1, "halves re-merge once the T is gone");
});

test("orthogonal path helper", () => {
  assert.deepEqual(sops.orthoPath(0, 0, 100, 200), [[0, 0], [100, 0], [100, 200]]);
  assert.deepEqual(sops.orthoPath(0, 0, 100, 200, true), [[0, 0], [0, 200], [100, 200]]);
  assert.deepEqual(sops.orthoPath(0, 0, 0, 200), [[0, 0], [0, 200]]);
});

test("dragging a part rubber-bands its wires and keeps them orthogonal", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000);
  s.parts.push(r);
  const tip = pin(r, "1");
  sops.addWire(s, tip.x, tip.y, tip.x, tip.y - 500);
  const d = sops.beginDrag(s, [r.id]);
  sops.applyDrag(s, d, 300, 0);
  sops.finishDrag(s, d);
  const moved = pin(r, "1");
  assert.equal(moved.x, 1300);
  // Still connected: the pin tip is a wire end, and every wire is horizontal or vertical.
  assert.ok(s.wires.some((w) => (w.x1 === moved.x && w.y1 === moved.y) || (w.x2 === moved.x && w.y2 === moved.y)));
  for (const w of s.wires) assert.ok(w.x1 === w.x2 || w.y1 === w.y2, "orthogonal");
  const nl = buildNetlist(s);
  assert.equal(nl.netAt(1000, 300), nl.pinNet.get(`${r.id}:1`) || nl.netAt(moved.x, moved.y));
});

test("rotate and mirror keep wires attached to pins", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000);
  s.parts.push(r);
  const a = pin(r, "1");
  const b = pin(r, "2");
  sops.addWire(s, a.x, a.y, a.x, a.y - 300);
  sops.addWire(s, b.x, b.y, b.x, b.y + 300);
  sops.rotateItems(s, [r.id]);
  assert.equal(r.rot, 90);
  for (const p of partPins(r)) assert.ok(s.wires.some((w) => (w.x1 === p.x && w.y1 === p.y) || (w.x2 === p.x && w.y2 === p.y)), `pin ${p.num} still wired`);
  sops.mirrorItems(s, [r.id], "x");
  assert.equal(r.mirror, true);
  for (const w of s.wires) assert.ok(w.x1 === w.x2 || w.y1 === w.y2);
});

test("copy / paste re-annotates clashing references and offsets positions", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000, { ref: "R1" });
  s.parts.push(r);
  const clip = sops.copyItems(s, [r.id]);
  const ids = sops.pasteItems(s, clip, 2000, 1000);
  assert.equal(ids.length, 1);
  const copy = s.parts.find((p) => p.id === ids[0]);
  assert.equal(copy.ref, "R?");
  assert.equal(copy.x, 2000);
});

test("hit testing finds parts, wires, labels and field handles", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000, { ref: "R1" });
  s.parts.push(r);
  sops.addWire(s, 2000, 0, 2000, 800);
  s.labels.push({ id: "l", kind: "local", text: "VCC", x: 3000, y: 1000, rot: 0 });
  assert.equal(sops.hitTest(s, 1000, 1000, 10).kind, "parts");
  assert.equal(sops.hitTest(s, 2003, 400, 10).kind, "wires");
  assert.equal(sops.hitTest(s, 3050, 990, 10).kind, "labels");
  const f = fieldPositions(r, getSymbol("R"));
  assert.equal(sops.hitTest(s, f.ref.x + 30, f.ref.y, 10).field, "ref");
  assert.equal(sops.hitTest(s, 5000, 5000, 10), null);
  assert.equal(sops.pinAt(s, pin(r, "2").x, pin(r, "2").y, 5).pin.num, "2");
});

test("box selection: window vs crossing", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000);
  s.parts.push(r);
  const b = sops.partBox(r);
  assert.deepEqual(sops.itemsInRect(s, { x1: b.x1 - 10, y1: b.y1 - 10, x2: b.x2 + 10, y2: b.y2 + 10 }), [r.id]);
  assert.deepEqual(sops.itemsInRect(s, { x1: 1000, y1: 1000, x2: 5000, y2: 5000 }), []);
  assert.deepEqual(sops.itemsInRect(s, { x1: 1000, y1: 1000, x2: 5000, y2: 5000 }, true), [r.id]);
});

test("snapping prefers pins and wire ends over the grid", () => {
  const s = newProject().schematic;
  const r = sops.newPart("R", 1000, 1000);
  s.parts.push(r);
  const tip = pin(r, "1");
  const p = sops.snapPoint(s, tip.x + 12, tip.y - 9, 50, 30);
  assert.deepEqual([p.x, p.y, p.snapped], [tip.x, tip.y, "pin"]);
  const g = sops.snapPoint(s, 4012, 3988, 50, 30);
  assert.deepEqual([g.x, g.y, g.snapped], [4000, 4000, null]);
});

test("label auto-increment and dangling ends", () => {
  assert.equal(sops.incrementText("D7"), "D8");
  assert.equal(sops.incrementText("ADDR09"), "ADDR10");
  assert.equal(sops.incrementText("CLK"), "CLK");
  const s = newProject().schematic;
  sops.addWire(s, 0, 0, 500, 0);
  assert.equal(sops.danglingEnds(s).length, 2);
});

test("delete removes items and orphaned junctions", () => {
  const s = newProject().schematic;
  sops.addWire(s, 0, 0, 400, 0);
  const w = sops.addWire(s, 200, 0, 200, 300);
  sops.cleanup(s);
  assert.equal(s.junctions.length, 1);
  const vertical = s.wires.find((x) => x.x1 === 200 && x.x2 === 200) || w;
  sops.deleteItems(s, [vertical.id]);
  assert.equal(s.junctions.length, 0);
});

// ---------------------------------------------------------------- PCB
function smallBoard() {
  const p = newProject("board");
  const s = p.schematic;
  const r = sops.newPart("R", 1000, 1000, { footprint: "R_0805" });
  const c = sops.newPart("C", 2000, 1000, { footprint: "C_0805" });
  const j = sops.newPart("Conn_01x02", 3000, 1000);
  s.parts.push(r, c, j);
  s.labels.push({ id: "a", kind: "local", text: "SIG", x: pin(r, "1").x, y: pin(r, "1").y }, { id: "b", kind: "local", text: "SIG", x: pin(c, "1").x, y: pin(c, "1").y }, { id: "c", kind: "local", text: "SIG", x: pin(j, "1").x, y: pin(j, "1").y });
  s.labels.push({ id: "d", kind: "local", text: "GND", x: pin(r, "2").x, y: pin(r, "2").y }, { id: "e", kind: "local", text: "GND", x: pin(c, "2").x, y: pin(c, "2").y }, { id: "f", kind: "local", text: "GND", x: pin(j, "2").x, y: pin(j, "2").y });
  annotate(s);
  updateBoardFromSchematic(p.pcb, boardNetlist(s));
  const place = { R1: [10, 10], C1: [20, 10], J1: [35, 8] };
  for (const f of p.pcb.footprints) [f.x, f.y] = place[f.ref];
  return p;
}

test("update board from schematic adds, updates and removes footprints", () => {
  const p = smallBoard();
  assert.equal(p.pcb.footprints.length, 3);
  const r = p.pcb.footprints.find((f) => f.ref === "R1");
  assert.equal(r.padNets["1"], "SIG");
  // Rename the net in the schematic → pads and tracks follow.
  p.pcb.tracks.push(pops.newTrack("SIG", "F.Cu", 0.25, 0, 0, 1, 0));
  for (const l of p.schematic.labels) if (l.text === "SIG") l.text = "DATA";
  const sum = updateBoardFromSchematic(p.pcb, boardNetlist(p.schematic));
  assert.equal(sum.updated.length, 3);
  assert.equal(p.pcb.tracks[0].net, "DATA");
  p.schematic.parts = p.schematic.parts.filter((x) => x.ref !== "C1");
  const sum2 = updateBoardFromSchematic(p.pcb, boardNetlist(p.schematic));
  assert.deepEqual(sum2.removed, ["C1"]);
});

test("back-side footprints are mirrored and use B.Cu", () => {
  const p = smallBoard();
  const r = p.pcb.footprints.find((f) => f.ref === "R1");
  const front = footprintPads(r, p.pcb);
  r.side = "B";
  const back = footprintPads(r, p.pcb);
  assert.deepEqual(back[0].layers, ["B.Cu"]);
  assert.ok(Math.abs(back[0].x - (2 * r.x - front[0].x)) < 1e-9, "x mirrored about the origin");
  assert.equal(footprintGraphics(r)[0].layer, "B.SilkS");
});

test("ratsnest shrinks as tracks connect pads; netAtPoint finds copper", () => {
  const p = smallBoard();
  const before = routingStats(p.pcb);
  assert.equal(before.total, 4);
  assert.equal(before.unrouted, 4);
  const pads = p.pcb.footprints.flatMap((f) => footprintPads(f, p.pcb));
  const a = pads.find((x) => x.ref === "R1" && x.num === "1");
  const b = pads.find((x) => x.ref === "C1" && x.num === "1");
  p.pcb.tracks.push(pops.newTrack("SIG", "F.Cu", 0.25, a.x, a.y, b.x, b.y));
  assert.equal(routingStats(p.pcb).unrouted, 3);
  assert.equal(netAtPoint(p.pcb, (a.x + b.x) / 2, a.y, "F.Cu").net, "SIG");
  assert.equal(ratsnest(p.pcb, copperConnectivity(p.pcb)).length, 3);
});

test("45° routing posture", () => {
  assert.deepEqual(pops.route45(0, 0, 10, 4), [[0, 0], [6, 0], [10, 4]]);
  assert.deepEqual(pops.route45(0, 0, 10, 4, true), [[0, 0], [4, 4], [10, 4]]);
  assert.deepEqual(pops.route45(0, 0, 5, 5), [[0, 0], [5, 5]]);
});

test("segment clearance check flags other-net copper", () => {
  const p = smallBoard();
  const pads = p.pcb.footprints.flatMap((f) => footprintPads(f, p.pcb));
  const gndPad = pads.find((x) => x.ref === "R1" && x.num === "2");
  const seg = { x1: gndPad.x - 3, y1: gndPad.y, x2: gndPad.x + 3, y2: gndPad.y, w: 0.25, layer: "F.Cu" };
  assert.equal(pops.checkSegment(p.pcb, seg, "SIG").ok, false);
  const far = { x1: 10, y1: 30, x2: 15, y2: 30, w: 0.25, layer: "F.Cu" };
  assert.equal(pops.checkSegment(p.pcb, far, "SIG").ok, true);
});

test("rotate, flip, lock, move and delete footprints", () => {
  const p = smallBoard();
  const r = p.pcb.footprints.find((f) => f.ref === "R1");
  pops.rotatePcb(p.pcb, [r.id], 90);
  assert.equal(r.rot, 90);
  assert.deepEqual([r.x, r.y], [10, 10], "single footprint rotates about its origin");
  pops.flipPcb(p.pcb, [r.id]);
  assert.equal(r.side, "B");
  assert.equal(r.rot, 270);
  const mv = pops.beginMovePcb(p.pcb, [r.id]);
  pops.applyMovePcb(p.pcb, mv, 1.5, -2);
  assert.deepEqual([r.x, r.y], [11.5, 8]);
  r.locked = true;
  pops.applyMovePcb(p.pcb, mv, 5, 5);
  assert.deepEqual([r.x, r.y], [11.5, 8], "locked footprints do not move");
  pops.deletePcb(p.pcb, [r.id]);
  assert.ok(p.pcb.footprints.includes(r), "locked footprints are not deleted");
  r.locked = false;
  pops.deletePcb(p.pcb, [r.id]);
  assert.ok(!p.pcb.footprints.includes(r));
});

test("PCB hit testing and box selection", () => {
  const p = smallBoard();
  const r = p.pcb.footprints.find((f) => f.ref === "R1");
  assert.equal(pops.hitTestPcb(p.pcb, r.x, r.y, 0.1).obj, r);
  p.pcb.vias.push(pops.newVia(p.pcb, "GND", 30, 30));
  assert.equal(pops.hitTestPcb(p.pcb, 30.1, 30, 0.1).kind, "vias");
  assert.equal(pops.hitTestPcb(p.pcb, 0, 20, 0.2).kind, "outline");
  assert.ok(pops.itemsInRectPcb(p.pcb, { x1: 0, y1: 0, x2: 60, y2: 40 }).length >= 4);
});

test("connected copper selection follows tracks through vias", () => {
  const p = newProject();
  p.pcb.tracks.push(pops.newTrack("A", "F.Cu", 0.25, 0, 0, 10, 0), pops.newTrack("A", "B.Cu", 0.25, 10, 0, 10, 10), pops.newTrack("B", "F.Cu", 0.25, 30, 30, 40, 30));
  p.pcb.vias.push(pops.newVia(p.pcb, "A", 10, 0));
  const ids = pops.connectedCopper(p.pcb, [p.pcb.tracks[0].id]);
  assert.equal(ids.length, 3);
});

test("rounded rectangle outline and inset polygon", () => {
  const o = pops.rectOutline(0, 0, 50, 30, 3);
  assert.ok(o.length > 20);
  const xs = o.map((q) => q[0]);
  assert.equal(Math.min(...xs), 0);
  assert.equal(Math.max(...xs), 50);
  const ins = insetPolygon([[0, 0], [50, 0], [50, 30], [0, 30]], 1);
  assert.deepEqual(ins.map((q) => q.map((v) => Math.round(v))), [[1, 1], [49, 1], [49, 29], [1, 29]]);
});

test("zone ops knock out other nets and add thermal spokes for same-net pads", () => {
  const p = smallBoard();
  const z = { id: "z", layer: "F.Cu", net: "GND", pts: insetPolygon(p.pcb.outline, 0.5), clearance: 0.3, thermal: true };
  p.pcb.zones.push(z);
  const ops = zoneOps(p.pcb, z);
  assert.equal(ops[0].polarity, "dark");
  assert.ok(ops.filter((o) => o.polarity === "clear" && o.shape === "pad").length >= 4);
  assert.ok(ops.filter((o) => o.shape === "segment" && o.polarity === "dark").length >= 4, "spokes");
  z.thermal = false;
  assert.equal(zoneOps(p.pcb, z).filter((o) => o.shape === "segment" && o.polarity === "dark").length, 0);
});

test("arrange footprints places them inside the board without overlap", () => {
  const p = smallBoard();
  for (const f of p.pcb.footprints) { f.x = 100; f.y = 100; }
  pops.arrangeFootprints(p.pcb);
  for (const f of p.pcb.footprints) assert.ok(f.x > 0 && f.x < 60 && f.y > 0 && f.y < 40, `${f.ref} inside`);
});

// ---------------------------------------------------------------- SVG pipeline
test("SvgContext records paths, text and transforms", () => {
  const c = new SvgContext(100, 50);
  c.translate(10, 10);
  c.scale(2, 2);
  c.strokeStyle = "#f00";
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(5, 0);
  c.stroke();
  c.font = "10px sans-serif";
  c.fillText("A&B", 1, 1);
  const svg = c.toString("#fff");
  assert.match(svg, /M10 10L20 10/);
  assert.match(svg, /stroke-width="2"/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /<rect width="100%" height="100%" fill="#fff"\/>/);
});

test("schematic and board render to SVG without errors", () => {
  const p = smallBoard();
  const ctx = new SvgContext(11693, 8268);
  drawSchematic(ctx, p, SCH_THEMES.print, 1);
  const svg = ctx.toString("#fff");
  assert.ok(svg.length > 5000);
  assert.match(svg, />R1</);
  assert.match(svg, />SIG</);
  const b = new SvgContext(60, 40);
  drawBoard(b, p, PCB_THEMES.light, 10, { courtyards: true });
  assert.ok(b.toString().includes("<path"));
});

// ---------------------------------------------------------------- navigation, grid, dimensions
test("grid: 5 × 5 cells keep an even screen spacing at every zoom level", async () => {
  const { Viewport } = await import("../../src/ui/viewport.js");
  const cellAt = (scale, step) => Viewport.prototype.gridCell.call({ scale }, step);
  for (const step of [50, 0.635, 1, 25]) {
    let prev = null;
    for (let z = -12; z <= 12; z++) {
      const scale = Math.pow(1.6, z);
      const cell = cellAt(scale, step);
      const px = cell * scale;
      assert.ok(px >= 10 - 1e-9 && px < 50 + 1e-9, `cell ${cell} at scale ${scale} is ${px}px`);
      // Always the snap grid times a power of 5, so major lines stay on multiples of 5 cells.
      const k = Math.log(cell / step) / Math.log(5);
      assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `cell ${cell} is not step × 5^k`);
      if (prev) assert.ok(cell === prev || Math.abs(cell / prev - 5) < 1e-9 || Math.abs(prev / cell - 5) < 1e-9, "zoom steps the grid by ×5 only");
      prev = cell;
    }
  }
});

test("schematic dimensions: length text, hit-testing, box selection, drag and SVG output", async () => {
  const { formatSchLength, drawSchDimension } = await import("../../src/sch/render.js");
  assert.equal(formatSchLength(500), "12.70 mm (500 mil)");
  assert.equal(formatSchLength(1000, "mil"), "1000 mil (25.40 mm)");
  const s = newProject().schematic;
  const d = { id: "dm1", x1: 1000, y1: 1000, x2: 2000, y2: 1000, offset: 100 };
  s.dimensions.push(d);
  // The dimension line sits `offset` off the measured points (y down: +offset is downwards here).
  const [ax, ay, bx, by] = sops.dimensionLine(d);
  assert.deepEqual([ax, ay, bx, by], [1000, 1100, 2000, 1100]);
  assert.equal(sops.hitTest(s, 1500, 1100, 10).kind, "dimensions");
  assert.equal(sops.hitTest(s, 1500, 1400, 10), null);
  assert.deepEqual(sops.itemsInRect(s, { x1: 900, y1: 900, x2: 2100, y2: 1200 }), ["dm1"]);
  assert.deepEqual(sops.itemsInRect(s, { x1: 900, y1: 900, x2: 1500, y2: 1200 }), []);
  assert.deepEqual(sops.itemsInRect(s, { x1: 900, y1: 900, x2: 1500, y2: 1200 }, true), ["dm1"]);
  const drag = sops.beginDrag(s, ["dm1"]);
  sops.applyDrag(s, drag, 50, 100);
  assert.deepEqual([d.x1, d.y1, d.x2, d.y2], [1050, 1100, 2050, 1100]);
  const svg = new SvgContext(4000, 3000);
  drawSchDimension(svg, d, SCH_THEMES.light, 1, {});
  assert.match(svg.toString(), /25\.40 mm \(1000 mil\)/);
  // Saved with the project and printed with its page.
  const p = newProject();
  p.schematic.dimensions.push({ ...d });
  const svg2 = new SvgContext(4000, 3000);
  drawSchematic(svg2, p, SCH_THEMES.light, 1, { sheet: false });
  assert.match(svg2.toString(), /25\.40 mm/);
});

test("sheet pins count as connection points: snapping, junctions, dangling ends, rubber-banding", () => {
  const s = newProject().schematic;
  s.pages.push({ id: "sub", name: "Sub" });
  const sh = { id: "sh", page: "p1", x: 1000, y: 1000, w: 600, h: 400, name: "Sub", target: "sub", pins: [{ id: "sp", name: "IN", side: "L", offset: 100 }] };
  s.sheets.push(sh);
  assert.ok(sops.snapTargets(s).some((t) => t.x === 1000 && t.y === 1100 && t.kind === "pin"));
  sops.addWire(s, 500, 1100, 1000, 1100);
  assert.deepEqual(sops.danglingEnds(s).map(String), ["500,1100"], "the end on the sheet pin is connected");
  const drag = sops.beginDrag(s, ["sh"]);
  sops.applyDrag(s, drag, 0, 200);
  assert.ok(s.wires.some((w) => (w.x2 === 1000 && w.y2 === 1300) || (w.x1 === 1000 && w.y1 === 1300)), "the wire end follows the sheet pin");
});
