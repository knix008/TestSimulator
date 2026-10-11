// Unit tests for the CAD entities beyond plain lines and texts (cadextra.js,
// and their DXF / DWG paths): rays and construction lines, raster images
// and wipeouts, multileaders, tables, multilines, ACIS solids and regions
// (SAT and SAB), multi-line attributes, proxy graphics, paper space
// layouts with viewports, and external references. Run:
//   node --test test/unit/cadextra.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { importDxf, dxfRecords, importCadRecords, cadLayouts } from "../../src/io/dxf.js";
import { importDwg, dwgRecords } from "../../src/io/dwg.js";
import { proxyRecords, acisRecords, decodeSatChars, clipPolyline, acdsBlobs } from "../../src/io/cadextra.js";
import { entityObject, tableObject, buildR2000 } from "./dwg-fixtures.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

function dxfDoc({ header = [], tables = [], blocks = [], entities = [], objects = [] } = {}) {
  const out = [];
  const g = (c, v) => out.push(String(c), String(v));
  const recs = (list) => { for (const [type, tags] of list) { g(0, type); for (const [c, v] of tags) g(c, v); } };
  if (header.length) { g(0, "SECTION"); g(2, "HEADER"); for (const [c, v] of header) g(c, v); g(0, "ENDSEC"); }
  if (tables.length) { g(0, "SECTION"); g(2, "TABLES"); recs(tables); g(0, "ENDSEC"); }
  if (blocks.length) { g(0, "SECTION"); g(2, "BLOCKS"); recs(blocks); g(0, "ENDSEC"); }
  g(0, "SECTION"); g(2, "ENTITIES"); recs(entities); g(0, "ENDSEC");
  if (objects.length) { g(0, "SECTION"); g(2, "OBJECTS"); recs(objects); g(0, "ENDSEC"); }
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
const MM = [[9, "$INSUNITS"], [70, 4]];
const line = (x1, y1, x2, y2, layer = "0", extra = []) => ["LINE", [[8, layer], ...extra, [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]]];
const ptsOf = (d) => d.pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);

// ---------------------------------------------------------------- RAY / XLINE
test("rays and construction lines are clipped to twice the drawing extents", () => {
  const r = importDxf(dxfDoc({ header: MM, entities: [
    line(0, 0, 1000, 0), line(0, 0, 0, 1000),
    ["XLINE", [[8, "C"], [10, 500], [20, 500], [30, 0], [11, 1], [21, 0], [31, 0]]],
    ["RAY", [[8, "C"], [10, 500], [20, 500], [30, 0], [11, 0], [21, 1], [31, 0]]],
  ] }));
  const xl = r.drawings.filter((d) => d.layer === "C");
  assert.equal(xl.length, 2);
  // Extents 0…1000 → box −500…1500 (twice the size, same centre).
  const h = xl.find((d) => Math.abs(d.pts[0][1] - d.pts[1][1]) < 1e-9);
  assert.deepEqual(h.pts.map((p) => p[0]).sort((a, b) => a - b), [-500, 1500]);
  near(h.pts[0][1], -500, 1e-9, "xline y (plan is y-down)");
  const v = xl.find((d) => d !== h);
  // A ray starts at its base point and runs one way only (up = −y in plan).
  assert.deepEqual(v.pts.map((p) => p[1]).sort((a, b) => a - b), [-1500, -500]);
  assert.ok(!r.warnings.some((w) => /RAY|XLINE/.test(w)), r.warnings.join(" | "));
});

// ---------------------------------------------------------------- IMAGE / WIPEOUT
test("wipeouts become their boundary, images their frame and an underlay request", () => {
  const r = importDxf(dxfDoc({ header: MM, entities: [
    ["WIPEOUT", [[8, "W"], [10, 100], [20, 100], [30, 0], [11, 200], [21, 0], [31, 0], [12, 0], [22, 100], [32, 0], [13, 1], [23, 1], [70, 7], [280, 1], [71, 2], [91, 4], [14, -0.5], [24, -0.5], [14, 0.5], [24, -0.5], [14, 0.5], [24, 0.5], [14, -0.5], [24, 0.5]]],
    ["IMAGE", [[8, "I"], [10, 0], [20, 0], [30, 0], [11, 10], [21, 0], [31, 0], [12, 0], [22, 10], [32, 0], [13, 40], [23, 20], [70, 3], [280, 0], [340, "1A"]]],
  ], objects: [["IMAGEDEF", [[5, "1A"], [1, "C:\\plans\\scan.png"], [10, 40], [20, 20]]]] }));
  const w = r.drawings.find((d) => d.layer === "W");
  assert.ok(w.closed);
  assert.deepEqual(ptsOf(w).sort().join(" "), [[100, -100], [300, -100], [300, -200], [100, -200]].sort().join(" "));
  const im = r.drawings.find((d) => d.layer === "I");
  assert.ok(im && im.closed && im.pts.length === 4);
  assert.equal(r.images.length, 1);
  const u = r.images[0];
  assert.equal(u.file, "C:\\plans\\scan.png");
  assert.equal(u.drawing, im.id);
  // 40 × 20 pixels of 10 mm: 400 × 200 mm, its top left corner at y = −200.
  near(u.w, 400, 1e-9, "width"); near(u.h, 200, 1e-9, "height"); near(u.x, 0, 1e-9, "x"); near(u.y, -200, 1e-9, "y"); near(u.rot, 0, 1e-9, "rotation");
});

// ---------------------------------------------------------------- MULTILEADER
const mleaderTags = (extraCtx = [], ent = []) => [
  [8, "L"], [100, "AcDbMLeader"], [270, 2], [300, "CONTEXT_DATA{"], [40, 1], [10, 100], [20, 50], [30, 0], [41, 25], [140, 30], [145, 5], [290, 1],
  [304, "Note\\Pline 2"], [11, 0], [21, 0], [31, 1], [12, 110], [22, 62], [32, 0], [13, 1], [23, 0], [33, 0], [171, 1], ...extraCtx,
  [302, "LEADER{"], [290, 1], [291, 1], [10, 90], [20, 50], [30, 0], [11, 1], [21, 0], [31, 0], [90, 0], [40, 10],
  [304, "LEADER_LINE{"], [10, 0], [20, 0], [30, 0], [91, 0], [305, "}"], [303, "}"], [301, "}"],
  [340, "0"], [90, 0], [170, 1], [291, 1], [42, 30], [172, 2], ...ent,
];
test("multileaders draw their leader, arrowhead, dogleg and text", () => {
  const r = importDxf(dxfDoc({ header: MM, entities: [["MULTILEADER", mleaderTags()]] }));
  const leader = r.drawings.find((d) => !d.closed && d.pts.length === 2 && d.pts[0][0] === 0);
  assert.deepEqual(ptsOf(leader), [[0, 0], [90, -50]]);
  const arrow = r.drawings.find((d) => d.closed);
  assert.equal(arrow.pts.length, 3);
  assert.deepEqual(ptsOf(arrow)[0], [0, 0], "the arrow tip is the leader's first point");
  const dogleg = r.drawings.find((d) => !d.closed && d.pts[0][0] === 90);
  assert.deepEqual(ptsOf(dogleg), [[90, -50], [100, -50]]);
  assert.equal(r.texts.length, 1);
  assert.equal(r.texts[0].text, "Note\nline 2");
  near(r.texts[0].size, 25, 1e-9, "text height");
  assert.ok(!r.warnings.length, r.warnings.join(" | "));
  // Leader type 0 (invisible): only the text.
  const inv = importDxf(dxfDoc({ header: MM, entities: [["MULTILEADER", mleaderTags().map(([c, v]) => (c === 170 ? [170, 0] : [c, v]))]] }));
  assert.equal(inv.drawings.length, 0);
  assert.equal(inv.texts.length, 1);
});

// ---------------------------------------------------------------- ACAD_TABLE
test("tables show their anonymous block, or a grid built from their rows and columns", () => {
  const blocks = [["BLOCK", [[2, "*T1"], [70, 1], [10, 0], [20, 0]]], line(0, 0, 100, 0), ["MTEXT", [[8, "0"], [10, 5], [20, -5], [40, 4], [71, 1], [1, "cell"]]], ["ENDBLK", []]];
  const withBlock = importDxf(dxfDoc({ header: MM, blocks, entities: [["ACAD_TABLE", [[8, "T"], [100, "AcDbBlockReference"], [2, "*T1"], [10, 1000], [20, 2000], [30, 0], [100, "AcDbTable"], [11, 1], [21, 0], [31, 0], [91, 1], [92, 1], [141, 10], [142, 100]]]] }));
  assert.deepEqual(ptsOf(withBlock.drawings[0]), [[1000, -2000], [1100, -2000]]);
  assert.equal(withBlock.drawings[0].layer, "T");
  assert.equal(withBlock.texts[0].text, "cell");
  const grid = importDxf(dxfDoc({ header: MM, entities: [["ACAD_TABLE", [[8, "T"], [10, 0], [20, 0], [30, 0], [11, 1], [21, 0], [31, 0], [91, 2], [92, 3], [141, 10], [141, 10], [142, 50], [142, 50], [142, 50], ...["a", "b", "c", "d", "e", "f"].map((s) => [1, s])]]] }));
  assert.equal(grid.drawings.length, 3 + 4, "row and column lines");
  assert.deepEqual(grid.texts.map((t) => t.text), ["a", "b", "c", "d", "e", "f"]);
});

// ---------------------------------------------------------------- MLINE
test("multilines draw one line per element, offset along the miters", () => {
  const vtx = (x, y) => [[11, x], [21, y], [31, 0], [12, 1], [22, 0], [32, 0], [13, 0], [23, 1], [33, 0], [74, 1], [41, 50], [75, 0], [74, 1], [41, -50], [75, 0]];
  const r = importDxf(dxfDoc({ header: MM, entities: [["MLINE", [[8, "M"], [40, 1], [70, 0], [71, 1], [72, 2], [73, 2], [10, 0], [20, 0], [30, 0], ...vtx(0, 0), ...vtx(1000, 0)]]] }));
  assert.equal(r.drawings.length, 2);
  assert.deepEqual(r.drawings.map(ptsOf).map((p) => p[0][1]).sort((a, b) => a - b), [-50, 50]);
});

// ---------------------------------------------------------------- ACIS
// A 100 × 50 rectangle region with one quarter-circle corner (ACIS 7 SAT).
const SAT7 = [
  "21500 0 1 0", "@7 unknown 14 ACIS 215.0 NT 24 Thu Jan 01 00:00:00 2025", "1 9.9999999999999995e-07 1e-10",
  "asmheader $-1 -1 @9 215.0.0.0 #",
  "body $-1 -1 $-1 $2 $-1 $-1 #",
  "lump $-1 -1 $-1 $-1 $3 $1 #",
  "shell $-1 -1 $-1 $-1 $-1 $-1 $-1 $2 #",
  "edge $-1 -1 $-1 $5 0 $6 100 $-1 $11 forward @7 unknown #",
  "vertex $-1 -1 $-1 $4 $7 #",
  "vertex $-1 -1 $-1 $4 $8 #",
  "point $-1 -1 $-1 0 0 0 #",
  "point $-1 -1 $-1 100 0 0 #",
  "point $-1 -1 $-1 0 50 0 #",
  "edge $-1 -1 $-1 $6 0 $9 1.5707963 $-1 $12 forward @7 unknown #",
  "straight-curve $-1 -1 $-1 0 0 0 1 0 0 I I #",
  "ellipse-curve $-1 -1 $-1 0 0 0 0 0 1 100 0 0 1 I I #",
  "End-of-ACIS-data $-1 -1 @7 unknown #",
].join("\n");
// (records: 0 asmheader, 1 body, 2 lump, 3 shell, 4 edge, 5 v, 6 v, 7–9 points, 10 edge, 11 straight, 12 ellipse)
const SAT7_FIXED = SAT7.replace("vertex $-1 -1 $-1 $4 $7 #\nvertex $-1 -1 $-1 $4 $8 #", "vertex $-1 -1 $-1 $4 $7 #\nvertex $-1 -1 $-1 $4 $8 #").replace("$6 0 $9 1.5707963", "$6 0 $13 1.5707963");

test("ACIS (SAT text): straight and elliptical edges become lines and arcs", () => {
  // Vertex 13 is added so that the arc runs from (100, 0) to (0, 100).
  const sat = SAT7_FIXED.replace("End-of-ACIS-data", "vertex $-1 -1 $-1 $10 $14 #\npoint $-1 -1 $-1 0 100 0 #\nEnd-of-ACIS-data");
  const { records } = acisRecords(sat);
  assert.equal(records.length, 2);
  const ln = records.find((r) => r.type === "LINE"), arc = records.find((r) => r.type === "ARC");
  assert.ok(ln && arc, records.map((r) => r.type).join(","));
  const tag = (r, c) => r.tags.find((t) => t[0] === c)[1];
  assert.deepEqual([tag(ln, 10), tag(ln, 20), tag(ln, 11), tag(ln, 21)], [0, 0, 100, 0]);
  near(tag(arc, 40), 100, 1e-9, "radius");
  near(tag(arc, 50), 0, 1e-6, "start angle"); near(tag(arc, 51), 90, 1e-6, "end angle");
  // The same data, obfuscated as DWG/DXF store it, through a DXF 3DSOLID.
  const enc = decodeSatChars(sat).split("\n");
  const r = importDxf(dxfDoc({ header: MM, entities: [["3DSOLID", [[8, "S"], [100, "AcDbModelerGeometry"], [70, 1], ...enc.map((l) => [1, l])]]] }));
  assert.equal(r.drawings.length, 2);
  assert.deepEqual(r.drawings.map((d) => d.kind).sort(), ["arc", "polyline"]);
  assert.ok(!r.warnings.length, r.warnings.join(" | "));
});

test("ACIS 1.x SAT (R13/R14: no header lines, numeric sense) and SAB binary read alike", () => {
  const sat106 = ["106 4 1 0", "edge $-1 $1 $2 $-1 $5 0 #", "vertex $-1 $0 $3 #", "vertex $-1 $0 $4 #", "point $-1 0 0 0 #", "point $-1 10 20 0 #", "straight-curve $-1 0 0 0 1 2 0 0 0 #"].join("\n");
  const a = acisRecords(sat106).records;
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].tags.filter((t) => [10, 20, 11, 21].includes(t[0])).map((t) => t[1]), [0, 0, 10, 20]);
  // SAB: the same model as tagged binary records.
  const bytes = [];
  const u8 = (x) => bytes.push(x & 255);
  const i32 = (x) => { const b = new Uint8Array(new Int32Array([x]).buffer); bytes.push(...b); };
  const f64 = (x) => bytes.push(...new Uint8Array(new Float64Array([x]).buffer));
  const str = (tag, s) => { u8(tag); u8(s.length); for (const ch of s) u8(ch.charCodeAt(0)); };
  for (const ch of "ACIS BinaryFile") u8(ch.charCodeAt(0));
  i32(21500); i32(0); i32(1); i32(0);
  str(7, "test"); str(7, "ACIS 215"); str(7, "today"); u8(6); f64(1); u8(6); f64(1e-6); u8(6); f64(1e-10);
  const ptr = (n) => { u8(0x0c); i32(n); };
  const rec = (name, body) => { const parts = name.split("-"); parts.slice(0, -1).forEach((p) => str(0x0e, p)); str(0x0d, parts[parts.length - 1]); body(); u8(0x11); };
  rec("edge", () => { ptr(-1); u8(4); i32(-1); ptr(-1); ptr(1); u8(6); f64(0); ptr(2); u8(6); f64(1); ptr(-1); ptr(5); u8(0x0b); });
  rec("vertex", () => { ptr(-1); u8(4); i32(-1); ptr(-1); ptr(0); ptr(3); });
  rec("vertex", () => { ptr(-1); u8(4); i32(-1); ptr(-1); ptr(0); ptr(4); });
  rec("point", () => { ptr(-1); u8(4); i32(-1); ptr(-1); u8(0x13); f64(0); f64(0); f64(0); });
  rec("point", () => { ptr(-1); u8(4); i32(-1); ptr(-1); u8(0x13); f64(10); f64(20); f64(0); });
  rec("straight-curve", () => { ptr(-1); u8(4); i32(-1); ptr(-1); u8(0x13); f64(0); f64(0); f64(0); u8(0x14); f64(1); f64(2); f64(0); });
  rec("End-of-ACIS-data", () => {});
  const b = acisRecords(new Uint8Array(bytes)).records;
  assert.deepEqual(b.map((r) => r.tags), a.map((r) => r.tags));
});

test("R2013+ ACIS data storage: blobs are found by entity handle", () => {
  // A minimal AcDs section: header, segment index, one _data_ segment.
  const sec = new Uint8Array(1024);
  const dv = new DataView(sec.buffer);
  dv.setUint32(24, 128, true); dv.setUint32(32, 2, true); // segment index at 128, two entries
  dv.setUint32(128 + 48 + 12, 256, true); // entry 1 → offset 256
  dv.setUint16(256, 0xd5ac, true);
  for (const [i, ch] of [..."_data_"].entries()) sec[258 + i] = ch.charCodeAt(0);
  dv.setUint32(256 + 16, 700, true);
  let p = 256 + 48;
  dv.setUint32(p, 20, true); dv.setUint32(p + 4, 1, true); dv.setUint32(p + 8, 0x2e1, true); dv.setUint32(p + 16, 0, true);
  p += 20;
  const sab = new TextEncoder().encode("ACIS BinaryFile" + "\0".repeat(40));
  dv.setUint32(p, sab.length, true); sec.set(sab, p + 4);
  const m = acdsBlobs(sec);
  assert.equal(m.size, 1);
  assert.equal(m.get(0x2e1).length, sab.length);
});

// ---------------------------------------------------------------- R2018 multi-line attributes
test("multi-line attributes (embedded MTEXT) keep their line breaks", () => {
  const r = importDxf(dxfDoc({ header: MM, entities: [
    ["INSERT", [[8, "0"], [2, "B"], [10, 0], [20, 0], [66, 1]]],
    ["ATTRIB", [[8, "A"], [10, 0], [20, 0], [40, 10], [1, "one two"], [100, "AcDbAttribute"], [2, "TAG"], [70, 0], [101, "Embedded Object"], [10, 5], [20, 5], [30, 0], [40, 10], [41, 0], [71, 1], [1, "one\\Ptwo"]]],
    ["SEQEND", []],
  ], blocks: [["BLOCK", [[2, "B"], [70, 2], [10, 0], [20, 0]]], ["ENDBLK", []]] }));
  assert.equal(r.texts.length, 1);
  assert.equal(r.texts[0].text, "one\ntwo");
  near(r.texts[0].x, 5, 1e-9, "x");
});

// ---------------------------------------------------------------- proxy graphics
test("entities without a reader are drawn from their proxy graphics", () => {
  // Chunks: polyline (type 6) with 3 points, circle (type 2).
  const chunks = [];
  const f64 = (...v) => new Uint8Array(new Float64Array(v).buffer);
  const chunk = (type, ...parts) => { const n = parts.reduce((s, p) => s + p.length, 8); const b = new Uint8Array(n); new DataView(b.buffer).setUint32(0, n, true); new DataView(b.buffer).setUint32(4, type, true); let o = 8; for (const p of parts) { b.set(p, o); o += p.length; } chunks.push(b); };
  chunk(6, new Uint8Array(new Uint32Array([3]).buffer), f64(0, 0, 0, 100, 0, 0, 100, 100, 0));
  chunk(2, f64(50, 50, 0), f64(25), f64(0, 0, 1));
  const total = chunks.reduce((s, c) => s + c.length, 8);
  const g = new Uint8Array(total);
  new DataView(g.buffer).setUint32(0, total, true); new DataView(g.buffer).setUint32(4, chunks.length, true);
  let o = 8; for (const c of chunks) { g.set(c, o); o += c.length; }
  assert.equal(proxyRecords(g).length, 2);
  const hex = [...g].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const r = importDxf(dxfDoc({ header: MM, entities: [["ACME_THING", [[8, "P"], [100, "AcDbEntity"], [92, g.length], [310, hex.slice(0, 64)], [310, hex.slice(64)], [100, "AcDbAcmeThing"]]]] }));
  assert.deepEqual(r.drawings.map((d) => d.kind).sort(), ["circle", "polyline"]);
  assert.ok(r.warnings.some((w) => /ACME_THING entity was drawn from its stored graphics/.test(w)), r.warnings.join(" | "));
});

// ---------------------------------------------------------------- layouts
function layoutDoc() {
  return dxfDoc({
    header: MM,
    tables: [
      ["LAYER", [[2, "0"], [5, "10"], [62, 7], [70, 0]]], ["LAYER", [[2, "Hidden"], [5, "11"], [62, 3], [70, 0]]],
      ["BLOCK_RECORD", [[5, "1F"], [2, "*Model_Space"], [340, "22"]]], ["BLOCK_RECORD", [[5, "1B"], [2, "*Paper_Space"], [340, "1E"]]], ["BLOCK_RECORD", [[5, "23"], [2, "*Paper_Space0"], [340, "26"]]],
    ],
    blocks: [["BLOCK", [[2, "*Paper_Space0"], [70, 0], [10, 0], [20, 0]]], line(0, 0, 10, 0, "0"), ["ENDBLK", []]],
    entities: [
      line(0, 0, 10000, 0), line(0, 0, 0, 5000, "Hidden"),
      // Layout1: a title line, the layout's own viewport (id 1) and one
      // viewport showing model 0…2000 × 0…1000 at 1:100 in a 20 × 10 frame at (110, 55).
      line(0, 0, 200, 0, "0", [[67, 1]]),
      ["VIEWPORT", [[67, 1], [8, "0"], [10, 100], [20, 50], [40, 300], [41, 200], [68, 1], [69, 1], [12, 100], [22, 50], [45, 200]]],
      ["VIEWPORT", [[67, 1], [8, "VP"], [10, 110], [20, 55], [40, 20], [41, 10], [68, 2], [69, 2], [12, 1000], [22, 500], [45, 1000], [16, 0], [26, 0], [36, 1], [341, "11"]]],
    ],
    objects: [
      ["LAYOUT", [[5, "1E"], [100, "AcDbLayout"], [1, "Sheet A"], [71, 1], [330, "1B"]]],
      ["LAYOUT", [[5, "26"], [100, "AcDbLayout"], [1, "Sheet B"], [71, 2], [330, "23"]]],
      ["LAYOUT", [[5, "22"], [100, "AcDbLayout"], [1, "Model"], [71, 0], [330, "1F"]]],
    ],
  });
}

test("layouts: listed in tab order; a layout shows its entities and the model through its viewports", () => {
  const recs = dxfRecords(layoutDoc());
  assert.deepEqual(cadLayouts(recs).map((l) => l.name), ["Sheet A", "Sheet B"]);
  const model = importCadRecords(recs);
  assert.deepEqual(model.layouts, ["Sheet A", "Sheet B"]);
  assert.equal(model.drawings.length, 2);
  assert.ok(model.warnings.some((w) => /paper space/.test(w)));
  const a = importCadRecords(recs, { space: "layout:Sheet A" });
  // Title line, viewport frame, the model's long line clipped to the frame
  // (the Hidden layer is frozen in the viewport).
  assert.equal(a.drawings.length, 3, a.drawings.map((d) => `${d.layer}:${JSON.stringify(d.pts)}`).join(" "));
  const frame = a.drawings.find((d) => d.layer === "VP");
  assert.deepEqual(ptsOf(frame).sort().join(" "), [[100, -50], [120, -50], [120, -60], [100, -60]].sort().join(" "));
  // Model x 0 → paper 110 − 1000/100 = 100; x 10000 is clipped at the frame (120).
  const clipped = a.drawings.find((d) => d.layer === "0" && d.pts[0][1] !== 0);
  assert.deepEqual(ptsOf(clipped), [[100, -50], [120, -50]]);
  assert.ok(!a.drawings.some((d) => d.layer === "Hidden"));
  const b = importCadRecords(recs, { space: "layout:Sheet B" });
  assert.equal(b.drawings.length, 1);
  const all = importCadRecords(recs, { space: "all" });
  assert.equal(all.drawings.length, 2 + 3 + 1);
  assert.ok(all.layers.some((l) => l.name === "Sheet A|VP") && all.layers.some((l) => l.name === "Sheet B|0"));
  const right = Math.max(...all.drawings.filter((d) => !d.layer.includes("|")).flatMap((d) => d.pts.map((p) => p[0])));
  assert.ok(all.drawings.filter((d) => d.layer.startsWith("Sheet")).every((d) => d.pts.every((p) => p[0] > right)), "layouts lie to the right of the model");
  assert.ok(importCadRecords(recs, { space: "layout:Nope" }).warnings.some((w) => /not found/.test(w)));
});

// ---------------------------------------------------------------- external references
test("external references are drawn from the given drawing on XREF|layer layers, or reported", () => {
  const host = dxfDoc({ header: MM, blocks: [["BLOCK", [[2, "Site"], [70, 4], [10, 0], [20, 0], [1, "..\\other\\Site.dwg"]]], ["ENDBLK", []]], entities: [["INSERT", [[8, "X"], [2, "Site"], [10, 1000], [20, 0]]]] });
  const missing = importDxf(host);
  assert.equal(missing.drawings.length, 0);
  assert.deepEqual(missing.xrefs.missing, [{ name: "Site", path: "..\\other\\Site.dwg" }]);
  assert.ok(missing.warnings.some((w) => /External reference "Site"/.test(w)));
  const site = dxfRecords(dxfDoc({ header: [[9, "$INSUNITS"], [70, 6]], tables: [["LAYER", [[2, "Roads"], [62, 1], [70, 0]]]], entities: [line(0, 0, 2, 0, "Roads"), line(0, 0, 0, 1, "0")] }));
  const r = importDxf(host, { xrefs: { Site: site } });
  assert.equal(r.drawings.length, 2);
  const road = r.drawings.find((d) => d.layer === "Site|Roads");
  // Metres in the external drawing → host millimetres, placed at the insert.
  assert.deepEqual(ptsOf(road), [[1000, 0], [3000, 0]]);
  assert.ok(r.drawings.some((d) => d.layer === "X"), "layer 0 takes the insert's layer");
  assert.equal(r.layers.find((l) => l.name === "Site|Roads").color, "#ff0000");
  assert.deepEqual(r.xrefs.loaded, ["Site"]);
});

// ---------------------------------------------------------------- DWG paths
const L0 = 0x10, MS = 0x1f;
const baseObjects = () => [
  [L0, tableObject(0x33, L0, (d) => d.T("0").B(0).BS(0).B(0).BS(0).BS(7))],
  [MS, tableObject(0x31, MS, (d) => d.T("*Model_Space").B(0).BS(0).B(0).B(0).B(0).B(0).B(0).B(1).BD3([0, 0, 0]))],
];

test("DWG: RAY, XLINE, MLINE and a SAT 3DSOLID read like their DXF", () => {
  const sat = SAT7_FIXED.replace("End-of-ACIS-data", "vertex $-1 -1 $-1 $10 $14 #\npoint $-1 -1 $-1 0 100 0 #\nEnd-of-ACIS-data");
  const enc = decodeSatChars(sat + "\n");
  const objs = [
    ...baseObjects(),
    [0x30, entityObject(19, 0x30, { layer: L0, body: (d) => d.B(1).RD(0).DD(1000, 0).RD(0).DD(1000, 0).B(1).B(1) })],
    [0x31, entityObject(40, 0x31, { layer: L0, body: (d) => d.BD3([500, 500, 0]).BD3([0, 1, 0]) })],
    [0x32, entityObject(41, 0x32, { layer: L0, body: (d) => d.BD3([500, 500, 0]).BD3([1, 0, 0]) })],
    [0x33, entityObject(47, 0x33, { layer: L0, body: (d) => {
      d.BD(1).RC(0).BD3([0, 0, 0]).BD3([0, 0, 1]).BS(0).RC(2).BS(2);
      for (const x of [0, 1000]) { d.BD3([x, 0, 0]).BD3([1, 0, 0]).BD3([0, 1, 0]); for (const off of [50, -50]) d.BS(1).BD(off).BS(0); }
    }, handles: (d) => d.H(5, 0) })],
    [0x34, entityObject(38, 0x34, { layer: L0, body: (d) => { d.B(0).B(1).BS(1).BL(enc.length); for (const ch of enc) d.RC(ch.charCodeAt(0)); d.BL(0); } })],
  ];
  const r = importDwg(buildR2000(objs), { units: "mm" });
  assert.deepEqual(r.counts, { LINE: 1, RAY: 1, XLINE: 1, MLINE: 1, "3DSOLID": 1 });
  assert.equal(r.drawings.length, 1 + 2 + 2 + 2, r.drawings.map((d) => d.kind).join(","));
  assert.ok(!r.warnings.some((w) => /not supported|could not be read|ACIS/.test(w)), r.warnings.join(" | "));
  const ray = r.drawings.filter((d) => d.kind === "polyline" && d.pts.length === 2 && Math.abs(d.pts[0][0] - 500) < 1e-9 && Math.abs(d.pts[1][0] - 500) < 1e-9);
  assert.equal(ray.length, 1, "the ray goes up from its base point");
});

// ---------------------------------------------------------------- corpus (MYARCH_DWG_CORPUS)
const corpus = process.env.MYARCH_DWG_CORPUS;
const ex = (n) => corpus && path.join(corpus, n);
const skip = corpus && existsSync(ex("example_2000.dwg")) ? false : "MYARCH_DWG_CORPUS is not set";

test("corpus: multileaders, tables, wipeouts, rays, multilines and ACIS solids in every release", { skip }, () => {
  for (const v of ["r14", "2000", "2004", "2007", "2010", "2013", "2018"]) {
    const f = ex(`example_${v}.dwg`);
    if (!existsSync(f)) continue;
    const r = importDwg(readFileSync(f));
    assert.ok(!r.warnings.some((w) => /(MULTILEADER|ACAD_TABLE|WIPEOUT|RAY|XLINE|MLINE|REGION|3DSOLID|TOLERANCE|ARC_DIMENSION) entit/.test(w)), `${v}: ${r.warnings.join(" | ")}`);
  }
});

test("corpus: layouts of a DWG read like those of its DXF", { skip }, () => {
  for (const v of ["2000", "2007", "2018"]) {
    const a = dwgRecords(readFileSync(ex(`example_${v}.dwg`))), b = dxfRecords(readFileSync(ex(`example_${v}.dxf`)));
    const la = cadLayouts(a).map((l) => l.name), lb = cadLayouts(b).map((l) => l.name);
    assert.deepEqual(la, lb, `${v}: layout names`);
    for (const name of la) {
      const da = importCadRecords(a, { space: `layout:${name}` }), db = importCadRecords(b, { space: `layout:${name}` });
      assert.equal(da.drawings.length, db.drawings.length, `${v} ${name}: drawings`);
      assert.equal(da.texts.length, db.texts.length, `${v} ${name}: texts`);
    }
  }
});

test("clipping keeps the parts of a polyline inside a rectangle", () => {
  const r = { x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.deepEqual(clipPolyline([[-5, 5], [15, 5]], false, r), [[[0, 5], [10, 5]]]);
  assert.deepEqual(clipPolyline([[1, 1], [5, 1], [5, 20], [8, 20], [8, 2]], false, r), [[[1, 1], [5, 1], [5, 10]], [[8, 10], [8, 2]]]);
  assert.deepEqual(clipPolyline([[20, 20], [30, 30]], false, r), []);
});
