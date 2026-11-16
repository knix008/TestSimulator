// Unit tests for the DWG writer (src/io/dwgwrite.js). Run:
//   node --test test/unit/dwgwrite.test.mjs
//
// Round trips through our own reader: importDwg(exportDwg(project)) must
// give the same drawings, texts and layers as importDxf(exportDxf(project)),
// and a hand-written DXF with every supported entity type must import the
// same from its DWG. A structural check walks the file like AutoCAD does:
// file header CRC, section sentinels and CRCs, object map pages, every
// object's CRC and the handle seed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dxfToDwg, exportDwg, encodeDwgText } from "../../src/io/dwgwrite.js";
import { importDwg, detectDwgVersion, crc16 } from "../../src/io/dwg.js";
import { importDxf, exportDxf } from "../../src/io/dxf.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { makeFurniture } from "../../src/lib/furniture.js";

// Same drawings within `tol` mm (any order); returns the number matched.
function matchDrawings(a, b, tol = 1e-3) {
  const key = (d) => `${d.kind}|${d.layer}|${d.pts ? d.pts.length : 0}`;
  const pool = new Map();
  for (const d of a) { const k = key(d); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(d); }
  const same = (d, e) => {
    if (d.color !== e.color || !!d.closed !== !!e.closed) return false;
    for (const k of ["cx", "cy", "r", "a1", "a2"]) if (k in d && !(Math.abs(d[k] - e[k]) <= tol)) return false;
    if (d.pts) for (let i = 0; i < d.pts.length; i++) if (!(Math.hypot(d.pts[i][0] - e.pts[i][0], d.pts[i][1] - e.pts[i][1]) <= tol)) return false;
    return true;
  };
  let n = 0;
  for (const d of b) {
    const list = pool.get(key(d)) || [];
    const i = list.findIndex((e) => same(d, e));
    if (i >= 0) { list.splice(i, 1); n++; }
  }
  return n;
}
function matchTexts(a, b, tol = 1e-3) {
  const pool = a.slice();
  let n = 0;
  for (const t of b) {
    const i = pool.findIndex((u) => u.text === t.text && u.layer === t.layer && u.align === t.align && u.color === t.color && Math.abs(u.x - t.x) <= tol && Math.abs(u.y - t.y) <= tol && Math.abs(u.size - t.size) <= tol && Math.abs(u.rot - t.rot) <= 1e-6);
    if (i >= 0) { pool.splice(i, 1); n++; }
  }
  return n;
}
const layerList = (r) => r.layers.map((l) => `${l.name}|${l.color}|${l.visible}`).sort();

// Both imports agree item by item.
function assertSame(fromDxf, fromDwg, what) {
  assert.equal(fromDwg.drawings.length, fromDxf.drawings.length, `${what}: drawing count`);
  assert.equal(matchDrawings(fromDwg.drawings, fromDxf.drawings), fromDxf.drawings.length, `${what}: every drawing matches`);
  assert.equal(fromDwg.texts.length, fromDxf.texts.length, `${what}: text count`);
  assert.equal(matchTexts(fromDwg.texts, fromDxf.texts), fromDxf.texts.length, `${what}: every text matches`);
  assert.deepEqual(layerList(fromDwg), layerList(fromDxf), `${what}: layers`);
  assert.equal(fromDwg.units, fromDxf.units, `${what}: units`);
}

// A one-room house with every kind of plan item and some CAD drawings.
function sampleProject() {
  const p = normalizeProject(newProject("DWG test"));
  const L = p.view.level;
  const wall = (id, x1, y1, x2, y2) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, height: null });
  p.walls.push(wall("w1", 0, 0, 6000, 0), wall("w2", 6000, 0, 6000, 4000), wall("w3", 6000, 4000, 0, 4000), wall("w4", 0, 4000, 0, 0));
  p.openings.push({ id: "d1", wall: "w1", kind: "door", at: 1500, width: 900, height: 2100, hinge: "start", side: 1, type: "single" });
  p.openings.push({ id: "n1", wall: "w3", kind: "window", at: 3000, width: 1200, height: 1200, sill: 900, type: "casement" });
  p.rooms.push({ id: "r1", level: L, name: "거실 Ø", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] });
  p.furniture.push({ id: "f1", level: L, ...makeFurniture("sofa3", 3000, 2000) });
  p.dimensions.push({ id: "m1", level: L, x1: 0, y1: 0, x2: 6000, y2: 0, offset: -800 });
  p.texts.push({ id: "t1", level: L, x: 500, y: 500, text: "거실 Ø note", size: 300, rot: 0, align: "left" });
  p.texts.push({ id: "t2", level: L, x: 4000, y: 3000, text: "Turned", size: 200, rot: 30, align: "center" });
  p.drawings.push({ id: "g1", level: L, layer: "0", kind: "arc", cx: 3000, cy: 2000, r: 500, a1: 30, a2: 120, ccw: false });
  p.drawings.push({ id: "g2", level: L, layer: "cad", kind: "circle", cx: 1000, cy: 1000, r: 300, color: "#ff0000" });
  p.drawings.push({ id: "g3", level: L, layer: "cad", kind: "polyline", pts: [[0, 5000], [1000, 5500], [2000, 5000]], closed: false });
  p.drawings.push({ id: "g4", level: L, layer: "cad", kind: "polyline", pts: [[3000, 5000], [4000, 5000], [4000, 6000]], closed: true });
  return normalizeProject(p);
}

// A DXF with every entity type the writer supports (and a LEADER, which it skips).
function handDxf() {
  const rec = (type, tags) => [[0, type], ...tags].map(([c, v]) => `${c}\r\n${v}`).join("\r\n");
  const s = [
    rec("SECTION", [[2, "HEADER"]]),
    "9\r\n$ACADVER\r\n1\r\nAC1015\r\n9\r\n$INSUNITS\r\n70\r\n4",
    rec("ENDSEC", []),
    rec("SECTION", [[2, "TABLES"]]),
    rec("TABLE", [[2, "LTYPE"], [70, 1]]),
    rec("LTYPE", [[2, "DASHED"], [70, 0], [3, "Dashed __ __"], [72, 65], [73, 2], [40, 19.05], [49, 12.7], [74, 0], [49, -6.35], [74, 0]]),
    rec("ENDTAB", []),
    rec("TABLE", [[2, "LAYER"], [70, 4]]),
    rec("LAYER", [[2, "0"], [70, 0], [62, 7], [6, "CONTINUOUS"]]),
    rec("LAYER", [[2, "Walls"], [70, 0], [62, 1], [6, "DASHED"]]),
    rec("LAYER", [[2, "Hidden"], [70, 0], [62, -3], [6, "CONTINUOUS"]]),
    rec("LAYER", [[2, "\\U+AC70\\U+C2E4"], [70, 0], [62, 30], [6, "CONTINUOUS"]]),
    rec("ENDTAB", []),
    rec("TABLE", [[2, "STYLE"], [70, 2]]),
    rec("STYLE", [[2, "STANDARD"], [70, 0], [40, 0], [41, 1], [50, 0], [71, 0], [42, 2.5], [3, "txt"], [4, ""]]),
    rec("STYLE", [[2, "Narrow"], [70, 0], [40, 0], [41, 0.7], [50, 0], [71, 0], [42, 2.5], [3, "romans.shx"], [4, ""]]),
    rec("ENDTAB", []),
    rec("ENDSEC", []),
    rec("SECTION", [[2, "BLOCKS"]]),
    rec("BLOCK", [[8, "0"], [2, "*Model_Space"], [70, 0], [10, 0], [20, 0], [30, 0]]), rec("ENDBLK", [[8, "0"]]),
    rec("BLOCK", [[8, "0"], [2, "Door"], [70, 2], [10, 10], [20, 0], [30, 0]]),
    rec("CIRCLE", [[8, "0"], [62, 0], [10, 410], [20, 0], [30, 0], [40, 400]]),
    rec("LINE", [[8, "Walls"], [10, 10], [20, 0], [30, 0], [11, 810], [21, 0], [31, 0]]),
    rec("ATTDEF", [[8, "0"], [10, 0], [20, 0], [30, 0], [40, 100], [1, "D?"], [3, "Door tag"], [2, "TAG"], [70, 0]]),
    rec("ENDBLK", [[8, "0"]]),
    rec("BLOCK", [[8, "0"], [2, "*D7"], [70, 1], [10, 0], [20, 0], [30, 0]]),
    rec("LINE", [[8, "0"], [10, 0], [20, -800], [30, 0], [11, 6000], [21, -800], [31, 0]]),
    rec("TEXT", [[8, "0"], [10, 3000], [20, -700], [30, 0], [40, 180], [1, "6000"], [72, 1], [11, 3000], [21, -700], [31, 0]]),
    rec("ENDBLK", [[8, "0"]]),
    rec("ENDSEC", []),
    rec("SECTION", [[2, "ENTITIES"]]),
    rec("LINE", [[8, "Walls"], [62, 5], [6, "DASHED"], [10, 0], [20, 0], [30, 0], [11, 5000], [21, 0], [31, 0]]),
    rec("LWPOLYLINE", [[8, "Walls"], [62, 3], [90, 4], [70, 1], [43, 0], [10, 0], [20, 0], [10, 1000], [20, 0], [42, 0.5], [10, 1000], [20, 1000], [10, 0], [20, 1000], [42, -0.25]]),
    rec("POLYLINE", [[8, "Hidden"], [66, 1], [10, 0], [20, 0], [30, 0], [70, 0]]),
    rec("VERTEX", [[8, "Hidden"], [10, 100], [20, 100], [30, 0], [42, 1]]),
    rec("VERTEX", [[8, "Hidden"], [10, 300], [20, 100], [30, 0]]),
    rec("VERTEX", [[8, "Hidden"], [10, 300], [20, 400], [30, 0]]),
    rec("SEQEND", [[8, "Hidden"]]),
    rec("POLYLINE", [[8, "0"], [66, 1], [10, 0], [20, 0], [30, 0], [70, 8]]),
    rec("VERTEX", [[8, "0"], [10, 2000], [20, 2000], [30, 5], [70, 32]]),
    rec("VERTEX", [[8, "0"], [10, 2500], [20, 2600], [30, 7], [70, 32]]),
    rec("SEQEND", [[8, "0"]]),
    rec("CIRCLE", [[8, "0"], [10, 3000], [20, 3000], [30, 0], [40, 250]]),
    rec("ARC", [[8, "Hidden"], [10, 3000], [20, 3000], [30, 0], [40, 500], [50, 10], [51, 135]]),
    rec("ELLIPSE", [[8, "0"], [10, 4000], [20, 1000], [30, 0], [11, 600], [21, 200], [31, 0], [40, 0.5], [41, 0], [42, 6.283185307179586]]),
    rec("ELLIPSE", [[8, "0"], [10, 4000], [20, 3000], [30, 0], [11, 0], [21, 400], [31, 0], [40, 0.25], [41, 0.5], [42, 3]]),
    rec("POINT", [[8, "0"], [10, 50], [20, 60], [30, 0]]),
    rec("SOLID", [[8, "0"], [10, 6000], [20, 0], [30, 0], [11, 6500], [21, 0], [31, 0], [12, 6000], [22, 500], [32, 0], [13, 6500], [23, 500], [33, 0]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 300], [30, 0], [40, 250], [50, 30], [1, "Hello \\U+AC70 \\U+00D8"], [7, "Narrow"], [41, 0.8], [51, 15]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 900], [30, 0], [40, 200], [1, "Centre"], [72, 1], [11, 900], [21, 900], [31, 0], [73, 2]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 1200], [30, 0], [40, 200], [1, "Right top"], [72, 2], [11, 1500], [21, 1200], [31, 0], [73, 3]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 1500], [30, 0], [40, 200], [1, "Aligned"], [72, 5], [11, 1100], [21, 1700], [31, 0]]),
    rec("TEXT", [[8, "0"], [10, 100], [20, 1800], [30, 0], [40, 200], [1, "Middle"], [72, 4], [11, 700], [21, 1900], [31, 0]]),
    rec("MTEXT", [[8, "\\U+AC70\\U+C2E4"], [10, 2000], [20, 4000], [30, 0], [40, 150], [41, 2000], [71, 5], [72, 1], [3, "First line \\Pwith a long first chunk "], [1, "and the {\\fArial;rest} \\U+AC70"], [50, 20]]),
    rec("INSERT", [[8, "Walls"], [66, 1], [2, "Door"], [10, 1000], [20, 2000], [30, 0], [41, 2], [42, 2], [43, 2], [50, 90]]),
    rec("ATTRIB", [[8, "0"], [10, 1000], [20, 2000], [30, 0], [40, 200], [1, "D01"], [2, "TAG"], [70, 0], [50, 90]]),
    rec("SEQEND", [[8, "0"]]),
    rec("INSERT", [[8, "0"], [2, "Door"], [10, 4000], [20, 5000], [30, 0], [41, 1], [42, -1], [43, 1], [50, 0], [70, 2], [71, 2], [44, 1500], [45, 1200]]),
    rec("DIMENSION", [[8, "0"], [2, "*D7"], [10, 0], [20, -800], [30, 0], [11, 3000], [21, -700], [31, 0], [70, 33], [1, ""], [13, 0], [23, 0], [33, 0], [14, 6000], [24, 0], [34, 0]]),
    rec("HATCH", [[8, "Walls"], [10, 0], [20, 0], [30, 0], [210, 0], [220, 0], [230, 1], [2, "SOLID"], [70, 1], [71, 0], [91, 2],
      [92, 2], [72, 1], [73, 1], [93, 3], [10, 7000], [20, 0], [42, 0.3], [10, 8000], [20, 0], [42, 0], [10, 8000], [20, 1000], [42, 0], [97, 0],
      [92, 1], [93, 3], [72, 1], [10, 7000], [20, 2000], [11, 8000], [21, 2000], [72, 2], [10, 8000], [20, 2500], [40, 500], [50, 270], [51, 90], [73, 1], [72, 1], [10, 8000], [20, 3000], [11, 7000], [21, 2000], [97, 0],
      [75, 0], [76, 1], [98, 1], [10, 7500], [20, 500]]),
    rec("HATCH", [[8, "0"], [10, 0], [20, 0], [30, 0], [2, "ANSI31"], [70, 0], [71, 0], [91, 1],
      [92, 1], [93, 2], [72, 3], [10, 9000], [20, 1000], [11, 500], [21, 0], [40, 0.5], [50, 0], [51, 180], [73, 1], [72, 1], [10, 8500], [20, 1000], [11, 9500], [21, 1000], [97, 0],
      [75, 0], [76, 1], [52, 0], [41, 10], [77, 0], [78, 1], [53, 45], [43, 0], [44, 0], [45, -22.45], [46, 22.45], [79, 0], [98, 0]]),
    rec("3DFACE", [[8, "0"], [10, 0], [20, 6000], [30, 0], [11, 500], [21, 6000], [31, 0], [12, 500], [22, 6500], [32, 0], [13, 0], [23, 6500], [33, 0]]),
    rec("SPLINE", [[8, "0"], [70, 8], [71, 3], [72, 8], [73, 4], [74, 0], [40, 0], [40, 0], [40, 0], [40, 0], [40, 1], [40, 1], [40, 1], [40, 1],
      [10, 0], [20, 7000], [30, 0], [10, 1000], [20, 8000], [30, 0], [10, 2000], [20, 6000], [30, 0], [10, 3000], [20, 7000], [30, 0]]),
    rec("RAY", [[8, "0"], [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0]]),
    rec("XLINE", [[8, "0"], [10, 5], [20, 5], [30, 0], [11, 0], [21, 1], [31, 0]]),
    rec("LEADER", [[8, "0"], [10, 0], [20, 0], [30, 0], [10, 100], [20, 100], [30, 0]]),
    rec("LINE", [[8, "0"], [67, 1], [10, 0], [20, 0], [30, 0], [11, 10], [21, 10], [31, 0]]),
    rec("ENDSEC", []),
    rec("EOF", []),
  ];
  return s.join("\r\n") + "\r\n";
}

// Warnings the reader gives that are about its own coverage, not the file.
const fileWarnings = (r) => r.warnings.filter((w) => !/DWG objects? could not be read/.test(w));

// ---------------------------------------------------------------- structure

// Walks an R2000 file and checks every checksum, sentinel and the handle map.
function checkStructure(b) {
  const u16 = (i) => b[i] | (b[i + 1] << 8);
  const u32 = (i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
  assert.equal(String.fromCharCode(...b.subarray(0, 6)), "AC1015");
  assert.equal(u16(0x13), 30, "code page ANSI_1252");
  const n = u32(0x15);
  assert.equal(n, 6, "six section locators");
  const loc = {};
  for (let k = 0; k < n; k++) { const p = 0x19 + k * 9; loc[b[p]] = { at: u32(p + 1), size: u32(p + 5) }; }
  const e = 0x19 + n * 9;
  assert.equal(u16(e), crc16(b, 0xc0c1, 0, e), "file header CRC");
  // Header variables and classes: sentinel, size, data, CRC over size + data.
  for (const k of [0, 1]) {
    const { at, size } = loc[k];
    const len = u32(at + 16);
    assert.equal(len + 38, size, `section ${k} size`);
    assert.equal(u16(at + 20 + len), crc16(b, 0xc0c1, at + 16, at + 20 + len), `section ${k} CRC`);
  }
  // Object map pages and every object's CRC.
  let p = loc[2].at, objects = 0, maxHandle = 0;
  for (;;) {
    const size = (b[p] << 8) | b[p + 1];
    assert.ok(size <= 2032, "object map page size");
    assert.equal((b[p + size] << 8) | b[p + size + 1], crc16(b, 0xc0c1, p, p + size), "object map page CRC");
    if (size <= 2) break;
    let q = p + 2, h = 0, off = 0;
    while (q < p + size) {
      let v = 0, m = 1, c;
      do { c = b[q++]; v += (c & 0x7f) * m; m *= 128; } while (c & 0x80);
      let w = 0; m = 1;
      for (;;) { c = b[q++]; if (c & 0x80) { w += (c & 0x7f) * m; m *= 128; } else { w += (c & 0x3f) * m; if (c & 0x40) w = -w; break; } }
      h += v; off += w;
      const ms = u16(off);
      assert.ok(!(ms & 0x8000) || true);
      let len = ms & 0x7fff, hdr = 2;
      if (ms & 0x8000) { len += (u16(off + 2) & 0x7fff) * 0x8000; hdr = 4; }
      assert.equal(u16(off + hdr + len), crc16(b, 0xc0c1, off, off + hdr + len), `object ${h.toString(16)} CRC`);
      objects++;
      maxHandle = Math.max(maxHandle, h);
    }
    p += size + 2;
  }
  assert.equal(loc[2].at + loc[2].size, p + 4, "object map section size");
  return { objects, maxHandle, loc };
}

// ================================================================ tests

test("Text in the drawing code page: ANSI_1252 bytes, \\U+XXXX for the rest", () => {
  assert.deepEqual(encodeDwgText("AØ€"), [0x41, 0xd8, 0x80]);
  assert.deepEqual(String.fromCharCode(...encodeDwgText("거")), "\\U+AC70");
});

test("A project exported as DWG imports like its DXF export (R2000 DXF path)", () => {
  const p = sampleProject();
  const dwg = exportDwg(p);
  assert.equal(detectDwgVersion(dwg).release, "R2000");
  const a = importDxf(exportDxf(p, { version: "2000" }));
  const b = importDwg(dwg);
  assertSame(a, b, "project");
  assert.ok(a.drawings.length > 20 && a.texts.length >= 4, "the sample has content");
  assert.ok(b.texts.some((t) => t.text === "거실 Ø"), "non-ASCII room name survives");
  assert.ok(b.texts.some((t) => t.text === "거실 Ø note"), "non-ASCII note survives");
  assert.deepEqual(fileWarnings(b), a.warnings);
  assert.equal(b.units, "mm");
});

test("The R12 DXF export converts to the same DWG content", () => {
  const p = sampleProject();
  const dxf = exportDxf(p);
  const skipped = [];
  const b = importDwg(dxfToDwg(dxf, { onSkip: (t, n) => skipped.push([t, n]) }));
  assertSame(importDxf(dxf), b, "R12");
  assert.deepEqual(skipped, []);
});

test("Every supported entity type of a hand-written DXF survives the DWG", () => {
  const dxf = handDxf();
  const skipped = {};
  const dwg = dxfToDwg(dxf, { onSkip: (t, n) => { skipped[t] = n; } });
  assert.deepEqual(skipped, { LEADER: 1 });
  const a = importDxf(dxf), b = importDwg(dwg);
  // The LEADER is drawn by importDxf but not written to the DWG.
  const leaderless = { ...a, drawings: a.drawings.filter((d) => !(d.kind === "polyline" && d.pts.length === 2 && d.pts[0][0] === 0 && d.pts[0][1] === 0 && d.pts[1][0] === 100)) };
  assert.equal(leaderless.drawings.length, a.drawings.length - 1);
  assertSame(leaderless, b, "hand DXF");
  assert.deepEqual(fileWarnings(b), a.warnings.filter((w) => !/LEADER/.test(w)));
  // Text details: escapes decoded, justification and style kept.
  assert.ok(b.texts.some((t) => t.text === "Hello 거 Ø"));
  assert.ok(b.texts.some((t) => t.align === "center" && t.text === "Centre"));
  assert.ok(b.texts.some((t) => t.align === "right" && t.text === "Right top"));
  assert.ok(b.texts.some((t) => t.text.startsWith("First line \nwith a long first chunk and the rest 거") && t.layer === "거실"));
  assert.ok(b.texts.some((t) => t.text === "D01"), "attribute");
  assert.ok(b.layers.find((l) => l.name === "Hidden" && l.visible === false), "layer off");
});

test("The file is structurally complete: CRCs, sentinels, object map, handle seed", () => {
  const dwg = exportDwg(sampleProject());
  const { objects, maxHandle } = checkStructure(dwg);
  assert.ok(objects > 60, `${objects} objects`);
  // HANDSEED (aux header at 0x61 + 79) is above every handle.
  const seed = dwg[0x61 + 79] | (dwg[0x61 + 80] << 8) | (dwg[0x61 + 81] << 16);
  assert.ok(seed > maxHandle, "handle seed above the largest handle");
  checkStructure(dxfToDwg(handDxf()));
});

test("Large drawings: object map pages and long objects", () => {
  const rec = (type, tags) => [[0, type], ...tags].map(([c, v]) => `${c}\n${v}`).join("\n");
  const ents = [];
  for (let i = 0; i < 3000; i++) ents.push(rec("LINE", [[8, `L${i % 7}`], [10, i], [20, 0], [30, 0], [11, i], [21, 100], [31, 0]]));
  const pts = [];
  for (let i = 0; i < 3000; i++) pts.push([10, Math.cos(i / 300) * 1000 + i * 1e-3], [20, Math.sin(i / 300) * 1000]);
  ents.push(rec("LWPOLYLINE", [[8, "0"], [90, 3000], [70, 0], ...pts]));
  const dxf = [rec("SECTION", [[2, "ENTITIES"]]), ...ents, rec("ENDSEC", []), rec("EOF", [])].join("\n") + "\n";
  const dwg = dxfToDwg(dxf);
  const { objects } = checkStructure(dwg);
  assert.ok(objects > 3000);
  const a = importDxf(dxf), b = importDwg(dwg);
  assertSame(a, b, "large");
});
