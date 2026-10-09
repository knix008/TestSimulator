// Fabrication outputs: Gerber, Excellon, BOM, PnP, netlists, zip, SVG.
import { test } from "node:test";
import assert from "node:assert/strict";

import { newProject } from "../../src/core/project.js";
import { allPads } from "../../src/pcb/board.js";
import { gerberLayer, gerberFileName, fabLayers } from "../../src/fab/gerber.js";
import { excellon } from "../../src/fab/excellon.js";
import { bomCsv, bomRows } from "../../src/fab/bom.js";
import { pickPlaceCsv } from "../../src/fab/pnp.js";
import { kicadNetlist, ipc356 } from "../../src/fab/netlistExport.js";
import { makeZip, crc32, readZip } from "../../src/fab/zip.js";
import { fabricationFiles, fabricationZip } from "../../src/fab/package.js";
import { parseGerber, parseExcellon, renderGerberToCanvas } from "../../src/fab/gerberParse.js";
import { pcbLayerSvg } from "../../src/fab/svgExport.js";
import { strokeText, strokeTextWidth } from "../../src/fab/strokefont.js";

const DATE = "2026-01-02T03:04:06Z";

function board() {
  const p = newProject("Fab Test");
  const pcb = p.pcb;
  pcb.outline = [[0, 0], [50, 0], [50, 30], [0, 30]];
  pcb.footprints = [
    { id: "f1", partId: "p1", ref: "R1", value: "10k", footprint: "R_0805", x: 10, y: 10, rot: 0, side: "F", padNets: { 1: "VCC", 2: "SIG" } },
    { id: "f2", partId: "p2", ref: "R2", value: "10k", footprint: "R_0805", x: 10, y: 14, rot: 45, side: "F", padNets: { 1: "SIG", 2: "GND" } },
    { id: "f3", ref: "J1", value: "Conn", footprint: "PinHeader_1x02_P2.54mm", x: 40, y: 8, rot: 0, side: "F", padNets: { 1: "VCC", 2: "GND" } },
    { id: "f4", ref: "U1", value: "NE555", footprint: "DIP-8_W7.62mm", x: 20, y: 4, rot: 0, side: "F", padNets: { 1: "GND", 8: "VCC" } },
    { id: "f5", partId: "p4", ref: "C1", value: "100n", footprint: "C_0805", x: 30, y: 12, rot: 90, side: "B", padNets: { 1: "VCC", 2: "GND" } },
    { id: "f6", ref: "H1", value: "MountingHole", footprint: "MountingHole_3.2mm", x: 4, y: 26, rot: 0, side: "F", padNets: {} },
  ];
  pcb.tracks = [
    { id: "t1", layer: "F.Cu", net: "VCC", w: 0.5, x1: 9.05, y1: 10, x2: 40, y2: 10 },
    { id: "t2", layer: "B.Cu", net: "GND", w: 0.25, x1: 40, y1: 10.54, x2: 30, y2: 12.95 },
  ];
  pcb.vias = [{ id: "v1", x: 25, y: 10, d: 0.8, drill: 0.4, net: "VCC" }];
  pcb.zones = [{ id: "z1", layer: "F.Cu", net: "GND", pts: [[2, 18], [48, 18], [48, 28], [2, 28]], clearance: 0.3, thermal: true }];
  pcb.texts = [
    { id: "x1", layer: "F.SilkS", text: "MyCircuit", x: 25, y: 22, size: 1.5, rot: 0 },
    { id: "x2", layer: "B.SilkS", text: "BACK", x: 25, y: 25, size: 1.5, rot: 0 },
  ];
  const sch = p.schematic;
  sch.parts = [
    { id: "p1", lib: "R", ref: "R1", value: "10k", footprint: "R_0805", x: 1000, y: 1000, rot: 0, fields: {} },
    { id: "p2", lib: "R", ref: "R2", value: "10k", footprint: "R_0805", x: 1000, y: 1600, rot: 0, fields: {} },
    { id: "p3", lib: "R", ref: "R10", value: "10k", footprint: "R_0805", x: 2000, y: 1000, rot: 0, fields: {} },
    { id: "p4", lib: "C", ref: "C1", value: "100n", footprint: "C_0805", x: 3000, y: 1000, rot: 0, fields: {} },
    { id: "p5", lib: "R", ref: "R3", value: "10k", footprint: "R_0805", x: 4000, y: 1000, rot: 0, fields: {}, dnp: true },
    { id: "p6", lib: "GND", ref: "#PWR01", value: "GND", footprint: "", x: 1000, y: 1800, rot: 0, fields: {} },
  ];
  sch.wires = [{ id: "w1", x1: 1000, y1: 1200, x2: 1000, y2: 1400 }];
  return p;
}

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("every Gerber layer parses back and ends with M02", () => {
  const p = board();
  for (const layer of fabLayers(p.pcb)) {
    const g = gerberLayer(p, layer, { date: DATE });
    assert.match(g, /%FSLAX46Y46\*%/);
    assert.match(g, /%MOMM\*%/);
    assert.match(g, /%TF\.GenerationSoftware,MyCircuit,10\.0\*%/);
    assert.match(g, /%TF\.FileFunction,[^*]+\*%/);
    assert.ok(g.trimEnd().endsWith("M02*"), `${layer} ends with M02`);
    const parsed = parseGerber(g);
    assert.equal(parsed.units, "mm");
    assert.ok(parsed.ended, `${layer} reached M02`);
    for (const prim of parsed.primitives) {
      if (prim.type === "flash" || prim.type === "draw") assert.ok(parsed.apertures[prim.aperture], `${layer}: aperture D${prim.aperture} defined`);
    }
  }
});

test("flash counts match pads per layer", () => {
  const p = board();
  const pads = allPads(p.pcb);
  const darkFlashes = (layer, opts) => parseGerber(gerberLayer(p, layer, opts)).primitives.filter((x) => x.type === "flash" && x.polarity === "dark").length;
  const vias = p.pcb.vias.length;
  for (const layer of ["F.Cu", "B.Cu"]) {
    const n = pads.filter((pad) => pad.layers.includes(layer)).length;
    assert.equal(darkFlashes(layer), n + vias, layer);
  }
  assert.equal(pads.filter((x) => x.layers.includes("F.Cu")).length, 14);
  assert.equal(darkFlashes("F.Mask"), 15); // 14 pads + NPTH hole, vias tented
  assert.equal(darkFlashes("B.Mask"), 13);
  assert.equal(darkFlashes("F.Mask", { tentVias: false }), 16);
  assert.equal(darkFlashes("F.Paste"), 4);
  assert.equal(darkFlashes("B.Paste"), 2);
  // The zone adds clear-polarity knockouts and a region.
  const f = parseGerber(gerberLayer(p, "F.Cu"));
  assert.ok(f.primitives.some((x) => x.type === "region" && x.polarity === "dark"));
  assert.ok(f.primitives.some((x) => x.polarity === "clear"));
  assert.match(gerberLayer(p, "F.Cu"), /%LPC\*%[\s\S]*%LPD\*%/);
});

test("thermal spokes only for same-net pads inside the zone", () => {
  const p = board();
  p.pcb.footprints.push({ id: "f7", ref: "TP1", value: "TP", footprint: "TestPoint_Pad_D1.5mm", x: 40, y: 23, rot: 0, side: "F", padNets: { 1: "GND" } });
  const g = parseGerber(gerberLayer(p, "F.Cu"));
  const spokesNear = (x, y) => g.primitives.filter((q) => q.type === "draw" && q.polarity === "dark" && near(q.x1, x, 1e-4) && near(q.y1, -y, 1e-4)).length;
  assert.equal(spokesNear(40, 23), 4, "TP1 inside the GND zone gets 4 spokes");
  assert.equal(spokesNear(20, 4), 0, "U1.1 (GND, outside the zone) gets none");
});

test("coordinates round-trip with negated y; rotated pads use macros", () => {
  const p = board();
  const g = parseGerber(gerberLayer(p, "F.Cu"));
  const r1 = allPads(p.pcb).find((x) => x.ref === "R1" && x.num === "1");
  const hit = g.primitives.find((x) => x.type === "flash" && near(x.x, r1.x) && near(x.y, -r1.y));
  assert.ok(hit, "R1.1 flashed at (x, -y)");
  const ap = g.apertures[hit.aperture];
  assert.ok(ap.shapes.length >= 1);
  // Track from (9.05, 10) to (40, 10) with 0.5 mm aperture.
  const tr = g.primitives.find((x) => x.type === "draw" && near(x.x1, 9.05) && near(x.y1, -10) && near(x.x2, 40));
  assert.ok(tr && near(tr.width, 0.5));
  // R2 at 45 degrees -> macro aperture.
  const r2 = allPads(p.pcb).find((x) => x.ref === "R2" && x.num === "1");
  const f2 = g.primitives.find((x) => x.type === "flash" && near(x.x, r2.x, 1e-5) && near(x.y, -r2.y, 1e-5));
  assert.ok(f2);
  assert.match(g.apertures[f2.aperture].type, /^MCPAD/);
  // Bounds lie inside the (flipped) board.
  assert.ok(g.bounds.x1 >= -1 && g.bounds.x2 <= 51 && g.bounds.y1 >= -31 && g.bounds.y2 <= 1);
});

test("silkscreen text and edge cuts", () => {
  const p = board();
  const silk = parseGerber(gerberLayer(p, "F.SilkS"));
  assert.ok(silk.primitives.filter((x) => x.type === "draw").length > 30);
  assert.ok(silk.primitives.some((x) => x.type === "draw" && x.arc), "footprint circle as arc (mounting hole)");
  const edge = parseGerber(gerberLayer(p, "Edge.Cuts"));
  const draws = edge.primitives.filter((x) => x.type === "draw");
  assert.equal(draws.length, 4);
  assert.ok(near(edge.bounds.x2, 50.05) && near(edge.bounds.y1, -30.05));
  // Back text mirrored: strokes for "BACK" start right of the anchor after mirroring.
  const back = strokeText("BACK", 25, 25, 1.5, { mirror: true, anchor: "start" });
  const front = strokeText("BACK", 25, 25, 1.5, { anchor: "start" });
  assert.ok(Math.max(...back.flat().map((q) => q[0])) <= 25 + 1e-9);
  assert.ok(Math.min(...front.flat().map((q) => q[0])) >= 25 - 1e-9);
});

test("stroke font covers printable ASCII", () => {
  for (let c = 0x21; c <= 0x7e; c++) {
    const ch = String.fromCharCode(c);
    const lines = strokeText(ch, 0, 0, 1);
    assert.ok(lines.length > 0, `glyph for ${ch}`);
    for (const l of lines) for (const [x, y] of l) assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
  assert.equal(strokeText(" ", 0, 0, 1).length, 0);
  assert.ok(strokeTextWidth("10k", 2) > strokeTextWidth("1", 2));
  // Middle anchor centres the text; rotation turns it CCW on screen (up = -y).
  const mid = strokeText("HH", 5, 5, 1, { anchor: "middle" }).flat();
  assert.ok(near((Math.min(...mid.map((q) => q[0])) + Math.max(...mid.map((q) => q[0]))) / 2, 5, 1e-9));
  const rot = strokeText("H", 0, 0, 1, { rot: 90, anchor: "start", valign: "baseline" }).flat();
  assert.ok(Math.min(...rot.map((q) => q[1])) < -0.5);
});

test("gerber file names", () => {
  const p = board();
  assert.equal(gerberFileName(p, "F.Cu"), "Fab_Test-F_Cu.gtl");
  assert.equal(gerberFileName(p, "B.Cu"), "Fab_Test-B_Cu.gbl");
  assert.equal(gerberFileName(p, "In1.Cu"), "Fab_Test-In1_Cu.g2");
  assert.equal(gerberFileName(p, "In2.Cu"), "Fab_Test-In2_Cu.g3");
  assert.equal(gerberFileName(p, "F.SilkS"), "Fab_Test-F_SilkS.gto");
  assert.equal(gerberFileName(p, "B.Mask"), "Fab_Test-B_Mask.gbs");
  assert.equal(gerberFileName(p, "F.Paste"), "Fab_Test-F_Paste.gtp");
  assert.equal(gerberFileName(p, "Edge.Cuts"), "Fab_Test-Edge_Cuts.gm1");
});

test("4-layer board has inner copper", () => {
  const p = board();
  p.pcb.layerCount = 4;
  const layers = fabLayers(p.pcb);
  assert.ok(layers.includes("In1.Cu") && layers.includes("In2.Cu"));
  const g = gerberLayer(p, "In1.Cu");
  assert.match(g, /%TF\.FileFunction,Copper,L2,Inr\*%/);
  const flashes = parseGerber(g).primitives.filter((x) => x.type === "flash").length;
  assert.equal(flashes, 10 + 1); // THT pads + via
});

test("excellon hole counts", () => {
  const p = board();
  const pth = excellon(p, { plated: true, date: DATE });
  const npth = excellon(p, { plated: false, date: DATE });
  const both = excellon(p, {});
  for (const t of [pth, npth, both]) {
    assert.ok(t.startsWith("M48"));
    assert.match(t, /METRIC/);
    assert.match(t, /;FILE_FORMAT=/);
    assert.ok(t.trimEnd().endsWith("M30"));
  }
  const a = parseExcellon(pth);
  assert.equal(a.holes.length, 2 + 8 + 1);
  assert.deepEqual(Object.values(a.tools).sort((x, y) => x - y), [0.4, 0.8, 1.0]);
  assert.match(pth, /T1C0\.400/);
  const b = parseExcellon(npth);
  assert.equal(b.holes.length, 1);
  assert.ok(near(b.holes[0].x, 4) && near(b.holes[0].y, -26) && near(b.holes[0].d, 3.2));
  assert.equal(parseExcellon(both).holes.length, 12);
  const via = a.holes.find((h) => near(h.d, 0.4));
  assert.ok(near(via.x, 25) && near(via.y, -10));
});

test("zip structure and CRC32", () => {
  assert.equal(crc32("hello"), 0x3610a686);
  assert.equal(crc32(""), 0);
  const z = makeZip([{ name: "a.txt", data: "hello" }, { name: "dir/한글.txt", data: new Uint8Array([1, 2, 3]) }], { date: new Date(2026, 0, 2, 3, 4, 6) });
  const dv = new DataView(z.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(6, true) & 0x0800, 0x0800);
  assert.equal(dv.getUint32(14, true), 0x3610a686);
  const second = 30 + 5 + 5;
  assert.equal(dv.getUint32(second, true), 0x04034b50);
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), 2);
  // DOS time 03:04:06 -> (3<<11)|(4<<5)|3, date 2026-01-02 -> (46<<9)|(1<<5)|2
  assert.equal(dv.getUint16(10, true), (3 << 11) | (4 << 5) | 3);
  assert.equal(dv.getUint16(12, true), (46 << 9) | (1 << 5) | 2);
  const files = readZip(z);
  assert.deepEqual(files.map((f) => f.name), ["a.txt", "dir/한글.txt"]);
  assert.equal(new TextDecoder().decode(files[0].data), "hello");
  for (const f of files) assert.equal(crc32(f.data), f.crc);
});

test("BOM groups and sorts", () => {
  const p = board();
  const rows = bomRows(p);
  const r = rows.find((x) => x.value === "10k" && x.footprint === "R_0805" && !x.dnp);
  assert.equal(r.references, "R1,R2,R10");
  assert.equal(r.qty, 3);
  assert.equal(r.description, "Resistor");
  const dnp = rows.find((x) => x.dnp);
  assert.equal(dnp.references, "R3");
  assert.equal(rows[rows.length - 1], dnp, "DNP last");
  assert.ok(!rows.some((x) => x.refs.some((ref) => ref.startsWith("#"))));
  assert.ok(rows.some((x) => x.references === "H1"), "board-only footprints included");
  assert.deepEqual(rows.map((x) => x.item), rows.map((_, i) => i + 1));
  const csv = bomCsv(p, { group: true });
  const lines = csv.trim().split(/\r\n/);
  assert.equal(lines[0], "\"Item\",\"Qty\",\"References\",\"Value\",\"Footprint\",\"Description\",\"DNP\"");
  assert.ok(lines.some((l) => l.includes("3,\"R1,R2,R10\",\"10k\",\"R_0805\"")));
  assert.ok(lines.some((l) => l.endsWith("\"DNP\"") && l.includes("\"R3\"")));
  assert.equal(bomCsv(p, { group: false }).trim().split(/\r\n/).length, 1 + 8);
});

test("pick and place coordinates", () => {
  const p = board();
  const csv = pickPlaceCsv(p, { side: "both" });
  const lines = csv.trim().split(/\r\n/);
  assert.equal(lines[0], "Ref,Val,Package,PosX,PosY,Rot,Side");
  const row = (ref) => lines.find((l) => l.startsWith(`"${ref}"`));
  assert.equal(row("R1"), "\"R1\",\"10k\",\"R_0805\",10.0000,20.0000,0.0000,top");
  assert.equal(row("C1"), "\"C1\",\"100n\",\"C_0805\",30.0000,18.0000,90.0000,bottom");
  assert.equal(row("H1"), undefined, "mounting hole excluded");
  assert.equal(lines.length, 1 + 5);
  assert.equal(pickPlaceCsv(p, { side: "B" }).trim().split(/\r\n/).length, 2);
  assert.equal(pickPlaceCsv(p, { side: "F" }).trim().split(/\r\n/).length, 5);
});

test("KiCad netlist and IPC-D-356", () => {
  const p = board();
  const net = kicadNetlist(p, { date: DATE });
  assert.ok(net.startsWith("(export (version \"E\")"));
  assert.match(net, /\(comp \(ref "R1"\)\s+\(value "10k"\)\s+\(footprint "R_0805"\)/);
  assert.ok(!net.includes("#PWR"));
  assert.match(net, /\(net \(code "\d+"\) \(name "GND"\)\s+\(node \(ref "R2"\) \(pin "2"\)/);
  assert.match(net, /\(name "Net-\(R1-Pad2\)"\)\s+\(node \(ref "R1"\) \(pin "2"\)[^\n]*\n\s+\(node \(ref "R2"\) \(pin "1"\)/);
  // Balanced parentheses (ignoring quoted strings).
  let depth = 0;
  for (const ch of net.replace(/"(?:\\.|[^"\\])*"/g, "")) { if (ch === "(") depth++; if (ch === ")") depth--; assert.ok(depth >= 0); }
  assert.equal(depth, 0);

  const ipc = ipc356(p, { date: DATE });
  const recs = ipc.split("\n").filter((l) => /^3[126]7/.test(l));
  assert.equal(recs.length, 17 + 1);
  assert.equal(recs.filter((l) => l.startsWith("327")).length, 6);
  assert.equal(recs.filter((l) => l.startsWith("367")).length, 1);
  assert.ok(ipc.trimEnd().endsWith("999"));
  const r1 = recs.find((l) => l.slice(20, 26).trim() === "R1" && l.slice(27, 31).trim() === "1");
  assert.equal(r1.slice(3, 17).trim(), "VCC");
  assert.match(r1, /X\+009050Y-010000/);
});

test("fabrication package and zip", () => {
  const p = board();
  const files = fabricationFiles(p, { date: DATE });
  const names = files.map((f) => f.name);
  for (const n of ["Fab_Test-F_Cu.gtl", "Fab_Test-B_Cu.gbl", "Fab_Test-Edge_Cuts.gm1", "Fab_Test-PTH.drl", "Fab_Test-NPTH.drl", "Fab_Test-BOM.csv", "Fab_Test-pos.csv", "Fab_Test-job.gbrjob", "README.txt"]) {
    assert.ok(names.includes(n), n);
  }
  assert.equal(files.filter((f) => f.kind === "gerber").length, 9);
  const job = JSON.parse(files.find((f) => f.kind === "job").data);
  assert.equal(job.GeneralSpecs.LayerNumber, 2);
  assert.equal(job.GeneralSpecs.Size.X, 50);
  assert.ok(job.FilesAttributes.some((a) => a.Path === "Fab_Test-F_Cu.gtl" && a.FileFunction === "Copper,L1,Top"));
  const z = fabricationZip(p, { date: DATE });
  const back = readZip(z);
  assert.equal(back.length, files.length);
  assert.deepEqual(back.map((f) => f.name), names);
  for (const f of back) assert.equal(crc32(f.data), f.crc);
  // Reproducible with a fixed date.
  assert.deepEqual(fabricationZip(p, { date: DATE }), z);
});

test("SVG plot and canvas renderer", () => {
  const p = board();
  const svg = pcbLayerSvg(p, ["B.Cu", "F.Cu", "F.SilkS", "Edge.Cuts"], { fit: true });
  assert.ok(svg.includes("<svg") && svg.trimEnd().endsWith("</svg>"));
  assert.match(svg, /<mask id="L_F_Cu_m"/);
  assert.match(svg, /data-layer="Edge.Cuts"/);
  const mirrored = pcbLayerSvg(p, ["B.Cu"], { mirror: true, background: null });
  assert.match(mirrored, /scale\(-1 1\)/);

  // Canvas renderer against a recording fake context.
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, k) {
      if (k in target) return target[k];
      return (...args) => calls.push([k, ...args]);
    },
    set(target, k, v) { target[k] = v; calls.push(["set", k, v]); return true; },
  });
  renderGerberToCanvas(ctx, parseGerber(gerberLayer(p, "F.Cu")), { color: "#f00", scale: 5 });
  assert.ok(calls.some((c) => c[0] === "fill"));
  assert.ok(calls.some((c) => c[0] === "stroke"));
  assert.ok(calls.some((c) => c[0] === "set" && c[1] === "globalCompositeOperation" && c[2] === "destination-out"));
});

test("parser reads KiCad-style macros and legacy syntax", () => {
  const text = [
    "G04 KiCad style*",
    "%FSLAX46Y46*%",
    "%MOMM*%",
    "%AMRoundRect*",
    "0 Rectangle with rounded corners*",
    "0 $1 Rounding radius*",
    "4,1,4,$2,$3,$4,$5,$6,$7,$8,$9,$2,$3,0*",
    "1,1,$1+$1,$2,$3*",
    "1,1,$1+$1,$4,$5*",
    "1,1,$1+$1,$6,$7*",
    "1,1,$1+$1,$8,$9*",
    "20,1,$1+$1,$2,$3,$4,$5,0*",
    "%",
    "%ADD10RoundRect,0.25X-0.5X-0.4X0.5X-0.4X0.5X0.4X-0.5X0.4*%",
    "%ADD11C,0.2*%",
    "%ADD12O,1.0X2.0*%",
    "G01*",
    "G54D10*",
    "X1000000Y2000000D03*",
    "D11*",
    "X0Y0D02*",
    "X5000000Y0D01*",
    "G75*",
    "G03X5000000Y0I-1000000J0D01*",
    "G01*",
    "%LPC*%",
    "G36*",
    "X0Y0D02*",
    "X1000000Y0D01*",
    "X1000000Y1000000D01*",
    "G37*",
    "%LPD*%",
    "D12*",
    "X3000000Y3000000D03*",
    "M02*",
  ].join("\n");
  const g = parseGerber(text);
  assert.equal(g.primitives.length, 5);
  const ap = g.apertures[10];
  assert.equal(ap.shapes.length, 6);
  assert.ok(near(ap.shapes[1].d, 0.5));
  assert.equal(g.primitives[0].type, "flash");
  assert.ok(near(g.primitives[0].x, 1) && near(g.primitives[0].y, 2));
  assert.ok(g.primitives[2].arc && near(g.primitives[2].arc.r, 1));
  assert.equal(g.primitives[3].type, "region");
  assert.equal(g.primitives[3].polarity, "clear");
  assert.equal(g.apertures[12].shapes[0].kind, "poly");

  const inch = parseGerber("%FSLAX24Y24*%%MOIN*%%ADD10C,0.01*%D10*X10000Y-5000D03*M02*");
  assert.equal(inch.units, "in");
  assert.ok(near(inch.primitives[0].x, 25.4) && near(inch.primitives[0].y, -12.7));
  assert.ok(near(inch.apertures[10].diameter, 0.254));

  const ex = parseExcellon("M48\nINCH,TZ\nT1C0.0320\n%\nT1\nX01Y02\nX1.5Y-0.5\nM30\n");
  assert.equal(ex.holes.length, 2);
  assert.ok(near(ex.holes[1].x, 38.1) && near(ex.holes[1].d, 0.8128));
});
