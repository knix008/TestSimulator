// Unit tests for binary DXF import (src/io/dxfbin.js) and the AutoCAD
// 2000–2018 DXF export (src/io/dxfmodern.js via exportDxf's `version`).
// Run: node --test test/unit/dxfbin.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { importDxf, exportDxf, DXF_VERSIONS } from "../../src/io/dxf.js";
import { readBinaryDxf, writeBinaryDxf, asciiPairs, isBinaryDxf, BINARY_DXF_SENTINEL } from "../../src/io/dxfbin.js";
import { newProject, normalizeProject } from "../../src/core/project.js";
import { makeFurniture, furnitureParts } from "../../src/lib/furniture.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b}, got ${a}`);

function sampleProject() {
  const p = normalizeProject(newProject("DXF test"));
  const L = p.view.level;
  const wall = (id, x1, y1, x2, y2) => ({ id, level: L, x1, y1, x2, y2, thickness: 200, height: null });
  p.walls.push(wall("w1", 0, 0, 6000, 0), wall("w2", 6000, 0, 6000, 4000), wall("w3", 6000, 4000, 0, 4000), wall("w4", 0, 4000, 0, 0));
  p.openings.push({ id: "d1", wall: "w1", kind: "door", at: 1500, width: 900, height: 2100, hinge: "start", side: 1, type: "single" });
  p.openings.push({ id: "n1", wall: "w3", kind: "window", at: 3000, width: 1200, height: 1200, sill: 900, type: "casement" });
  p.rooms.push({ id: "r1", level: L, name: "거실", pts: [[100, 100], [5900, 100], [5900, 3900], [100, 3900]] });
  p.furniture.push({ id: "f1", level: L, ...makeFurniture("sofa3", 3000, 2000) });
  p.furniture.push({ id: "f2", level: L, ...makeFurniture("sofa3", 1500, 1200), rot: 90 });
  p.furniture.push({ id: "f3", level: L, ...makeFurniture("bed", 4500, 2500), rot: 30 });
  p.dimensions.push({ id: "m1", level: L, x1: 0, y1: 0, x2: 6000, y2: 0, offset: -800 });
  p.stairs.push({ id: "s1", level: L, x: 1500, y: 2500, rot: 0, width: 1000, length: 2400, steps: 12 });
  p.texts.push({ id: "t1", level: L, x: 500, y: 500, text: "Hello", size: 300, rot: 0, align: "left" });
  p.texts.push({ id: "t2", level: L, x: 4000, y: 3000, text: "Line one\n둘째 줄 {a}\\b", size: 200, rot: 30, align: "center" });
  p.layers.push({ id: "trace", name: "Trace", color: "#123456", visible: true });
  p.drawings.push({ id: "g1", level: L, layer: "trace", kind: "arc", cx: 3000, cy: 2000, r: 500, a1: 30, a2: 120, ccw: false, color: "#ab12cd" });
  p.drawings.push({ id: "g2", level: L, layer: "trace", kind: "polyline", pts: [[0, 0], [100, 50], [200, 0]], closed: false });
  return normalizeProject(p);
}

// Group code / value pairs of an ASCII DXF, values trimmed.
const pairsOf = (text) => asciiPairs(text).map(([c, v]) => [c, v.trim()]);
// Records [{type, tags}] of one section.
function section(text, name) {
  const p = pairsOf(text);
  const i = p.findIndex(([c, v], k) => c === 2 && v === name && p[k - 1] && p[k - 1][1] === "SECTION");
  const out = [];
  for (let k = i + 1; k < p.length && !(p[k][0] === 0 && p[k][1] === "ENDSEC"); k++) {
    if (p[k][0] === 0) out.push({ type: p[k][1], tags: [] }); else out[out.length - 1].tags.push(p[k]);
  }
  return out;
}
const tag = (r, code) => (r.tags.find((t) => t[0] === code) || [])[1];

// Import results without the random ids, comparable between files.
const shape = (r) => ({
  drawings: r.drawings.map(({ id, ...d }) => d).map((d) => JSON.stringify(d, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))).sort(),
  texts: r.texts.map(({ id, ...t }) => JSON.stringify(t, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v))).sort(),
  layers: r.layers.map((l) => l.name).sort(),
  units: r.units,
});

// ================================================================ binary DXF

test("A binary DXF (2-byte group codes) imports exactly like its ASCII twin", () => {
  for (const version of ["R12", "2000", "2018"]) {
    const text = exportDxf(sampleProject(), { version });
    const bin = writeBinaryDxf(asciiPairs(text));
    assert.ok(isBinaryDxf(bin));
    assert.equal(new TextDecoder("latin1").decode(bin.subarray(0, 22)), BINARY_DXF_SENTINEL);
    const a = importDxf(text), b = importDxf(bin);
    assert.deepEqual(shape(b), shape(a), version);
    assert.deepEqual(b.counts, a.counts);
    // Also as an ArrayBuffer and through a DataView-sized view.
    assert.deepEqual(shape(importDxf(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength))), shape(a));
  }
});

test("R12 binary DXF with 1-byte group codes and the 255 escape for 1000+", () => {
  const text = exportDxf(sampleProject(), { version: "R12" });
  const pairs = asciiPairs(text);
  // Add extended data to the first LINE (1001/1000/1040/1070 need the escape).
  const i = pairs.findIndex(([c, v]) => c === 0 && v.trim() === "LINE");
  const j = pairs.findIndex(([c], k) => k > i && c === 0);
  pairs.splice(j, 0, [1001, "MYAPP"], [1000, "note"], [1040, "2.5"], [1070, "-7"]);
  const bin = writeBinaryDxf(pairs, { wide: false });
  assert.equal(bin[22], 0); assert.equal(bin[23], "S".charCodeAt(0), "one code byte, then SECTION");
  const read = readBinaryDxf(bin);
  const x = read.findIndex(([c]) => c === 1001);
  assert.deepEqual(read.slice(x, x + 4), [[1001, "MYAPP"], [1000, "note"], [1040, "2.5"], [1070, "-7"]]);
  assert.deepEqual(shape(importDxf(bin)), shape(importDxf(text)));
});

test("Binary values: doubles, 16/32/64-bit integers, booleans, binary chunks and strings", () => {
  const pairs = [
    [0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1027"], [0, "ENDSEC"],
    [0, "SECTION"], [2, "ENTITIES"],
    [0, "LINE"], [5, "2F"], [330, "1F"], [100, "AcDbEntity"], [8, "레이어"], [62, "-5"], [370, "50"], [420, "1193046"], [92, "123456"], [160, "9007199254740993"],
    [290, "1"], [310, "00FF10A0"], [1004, "CAFE"], [1071, "-2147483648"], [100, "AcDbLine"],
    [10, "1.25"], [20, "-3.5e-7"], [30, "0"], [11, "1e+20"], [21, "2"], [31, "0"],
    [0, "ENDSEC"], [0, "EOF"],
  ];
  const read = readBinaryDxf(writeBinaryDxf(pairs));
  const get = (code) => read.find(([c]) => c === code)[1];
  assert.equal(get(8), "레이어", "AC1027 strings are UTF-8");
  assert.equal(get(62), "-5");
  assert.equal(get(370), "50");
  assert.equal(get(420), "1193046");
  assert.equal(get(92), "123456");
  assert.equal(get(160), "9007199254740993", "64-bit integers are exact");
  assert.equal(get(290), "1");
  assert.equal(get(310), "00FF10A0");
  assert.equal(get(1004), "CAFE");
  assert.equal(get(1071), "-2147483648");
  assert.equal(+get(20), -3.5e-7);
  assert.equal(+get(11), 1e20);
  assert.equal(read[read.length - 1][1], "EOF");
  const r = importDxf(writeBinaryDxf(pairs), { units: "mm" });
  assert.equal(r.drawings.length, 1);
  assert.equal(r.drawings[0].layer, "레이어");
  assert.equal(r.drawings[0].color, "#123456", "true colour 420 wins");
});

test("Binary DXF before 2007 decodes texts per $DWGCODEPAGE", () => {
  const euckr = Uint8Array.of(0xb0, 0xc5, 0xbd, 0xc7); // 거실 in EUC-KR (cp949)
  const head = writeBinaryDxf([[0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1015"], [9, "$DWGCODEPAGE"], [3, "ANSI_949"], [0, "ENDSEC"], [0, "SECTION"], [2, "ENTITIES"], [0, "TEXT"], [8, "0"], [10, "0"], [20, "0"], [40, "100"], [1, "@@@@"], [0, "ENDSEC"], [0, "EOF"]]);
  // Swap the placeholder bytes for the EUC-KR ones.
  const at = head.findIndex((b, i) => b === 0x40 && head[i + 1] === 0x40 && head[i + 2] === 0x40 && head[i + 3] === 0x40);
  head.set(euckr, at);
  const r = importDxf(head, { units: "mm" });
  assert.equal(r.texts[0].text, "거실");
});

test("A truncated binary DXF fails with a clear message; binary text without bytes is refused", () => {
  const bin = writeBinaryDxf(asciiPairs(exportDxf(sampleProject())));
  assert.throws(() => importDxf(bin.subarray(0, Math.floor(bin.length / 2) + 3)), /truncated|EOF|SECTION/i);
  assert.throws(() => importDxf(new TextDecoder("latin1").decode(bin)), /read as bytes/);
  assert.throws(() => readBinaryDxf(new TextEncoder().encode("0\nSECTION\n")), /Not a binary DXF/);
});

// ================================================================ AutoCAD 2000+ export

test("DXF versions on offer: R12 first, then AutoCAD 2000 … 2018", () => {
  assert.deepEqual(DXF_VERSIONS.map((v) => v.id), ["R12", "2000", "2004", "2007", "2010", "2013", "2018"]);
  assert.deepEqual(DXF_VERSIONS.map((v) => v.acadver), ["AC1009", "AC1015", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032"]);
  assert.ok(exportDxf(sampleProject()).includes("AC1009"), "R12 stays the default");
});

for (const v of DXF_VERSIONS.filter((x) => x.id !== "R12")) {
  test(`AutoCAD ${v.id} export: a consistent drawing database (handles, owners, tables, objects)`, () => {
    const text = exportDxf(sampleProject(), { version: v.id });
    const pairs = pairsOf(text);
    assert.equal(pairs[pairs.length - 1][1], "EOF");
    const hv = (name, code) => { const k = pairs.findIndex(([c, x]) => c === 9 && x === name); return k >= 0 && pairs[k + 1][0] === code ? pairs[k + 1][1] : undefined; };
    assert.equal(hv("$ACADVER", 1), v.acadver);
    assert.equal(hv("$INSUNITS", 70), "4", "millimetres");
    // Every object has a unique handle; every owner (330) and pointer (340/350/360/390) is one of them.
    const handles = new Set();
    for (let k = 0; k < pairs.length; k++) {
      const [c, x] = pairs[k];
      if ((c === 5 || c === 105) && pairs.slice(Math.max(0, k - 3), k).some(([cc]) => cc === 0)) {
        assert.ok(!handles.has(x), `handle ${x} used twice`);
        handles.add(x);
      }
    }
    const seed = parseInt(hv("$HANDSEED", 5), 16);
    for (const h of handles) assert.ok(parseInt(h, 16) < seed, `handle ${h} below $HANDSEED`);
    for (const [c, x] of pairs) if ([330, 340, 350, 360, 390].includes(c) && x !== "0") assert.ok(handles.has(x), `${c} → ${x} exists`);
    // Tables: the count (70) matches the entries.
    const tables = section(text, "TABLES");
    let current = null, count = 0, expected = 0;
    for (const r of tables) {
      if (r.type === "TABLE") { current = tag(r, 2); expected = +tag(r, 70); count = 0; } else if (r.type === "ENDTAB") { assert.equal(count, expected, `${current} count`); current = null; } else count++;
    }
    const names = (type) => tables.filter((r) => r.type === type).map((r) => tag(r, 2));
    assert.deepEqual(names("BLOCK_RECORD").slice(0, 2), ["*Model_Space", "*Paper_Space"]);
    assert.ok(names("LTYPE").includes("ByLayer") && names("LTYPE").includes("Continuous"));
    assert.ok(names("LAYER").includes("0") && names("LAYER").includes("A-WALL"));
    // Model space entities are owned by *Model_Space's block record.
    const ms = tables.find((r) => r.type === "BLOCK_RECORD" && tag(r, 2) === "*Model_Space");
    const ents = section(text, "ENTITIES");
    assert.ok(ents.length > 20);
    for (const e of ents) assert.equal(tag(e, 330), tag(ms, 5), `${e.type} owner`);
    assert.ok(ents.some((e) => e.type === "LWPOLYLINE") && !ents.some((e) => e.type === "POLYLINE" || e.type === "VERTEX"));
    // OBJECTS: the root dictionary and its named dictionaries.
    const objs = section(text, "OBJECTS");
    const root = objs[0];
    assert.equal(root.type, "DICTIONARY");
    const keys = root.tags.filter(([c]) => c === 3).map(([, x]) => x);
    for (const k of ["ACAD_GROUP", "ACAD_LAYOUT", "ACAD_MLINESTYLE", "ACAD_PLOTSTYLENAME"]) assert.ok(keys.includes(k), k);
    assert.equal(objs.filter((o) => o.type === "LAYOUT").length, 2);
  });
}

test("AutoCAD 2000+ exports import back like the R12 file (same drawing, same texts)", () => {
  const p = sampleProject();
  const ref = importDxf(exportDxf(p));
  for (const v of ["2000", "2004", "2007", "2013", "2018"]) {
    const r = importDxf(exportDxf(p, { version: v }));
    assert.deepEqual(r.warnings, [], v);
    assert.equal(r.units, "mm");
    // Same geometry per layer (furniture comes from blocks now; ids and the order differ).
    const byLayer = (x) => { const m = {}; for (const d of x.drawings) m[d.layer] = (m[d.layer] || 0) + 1; return m; };
    assert.deepEqual(byLayer(r), byLayer(ref), v);
    // Multi-line notes are one MTEXT now: the same lines come back.
    const texts = (x) => x.texts.flatMap((t) => t.text.split("\n")).sort();
    assert.deepEqual(texts(r), texts(ref), v);
    const pts = (x, layer) => x.drawings.filter((d) => d.layer === layer).flatMap((d) => d.pts || [[d.cx, d.cy]]).map(([a, b]) => `${Math.round(a)},${Math.round(b)}`).sort();
    for (const layer of ["A-WALL", "A-FURN", "A-DOOR", "A-AREA"]) assert.deepEqual(pts(r, layer), pts(ref, layer), `${v} ${layer}`);
  }
});

test("Furniture becomes one block per kind and size, inserted once per piece", () => {
  const p = sampleProject();
  const text = exportDxf(p, { version: "2018" });
  const blocks = section(text, "BLOCKS").filter((r) => r.type === "BLOCK").map((r) => tag(r, 2));
  const furn = blocks.filter((b) => b.startsWith("FURN_"));
  assert.equal(furn.length, 2, `two distinct pieces: ${furn}`);
  const inserts = section(text, "ENTITIES").filter((e) => e.type === "INSERT");
  assert.equal(inserts.length, 3);
  assert.ok(inserts.every((e) => tag(e, 8) === "A-FURN"));
  assert.deepEqual(inserts.map((e) => Math.round(+(tag(e, 50) || 0))).sort((a, b) => a - b), [0, 270, 330], "plan rotation → DXF rotation (y flipped)");
  const r = importDxf(text);
  const expected = p.furniture.reduce((n, f) => n + furnitureParts(f).length, 0);
  assert.equal(r.drawings.filter((d) => d.layer === "A-FURN").length, expected);
});

test("Lineweights, layer descriptions, true colour and text encoding by version", () => {
  const p = sampleProject();
  const t2000 = exportDxf(p, { version: "2000" }), t2004 = exportDxf(p, { version: "2004" }), t2018 = exportDxf(p, { version: "2018" });
  const layer = (text, name) => section(text, "TABLES").find((r) => r.type === "LAYER" && tag(r, 2) === name);
  assert.equal(tag(layer(t2018, "A-WALL"), 370), "50");
  assert.equal(tag(layer(t2018, "A-WALL"), 1001), "AcAecLayerStandard");
  assert.ok(layer(t2018, "A-WALL").tags.some(([c, x]) => c === 1000 && /Walls/.test(x)), "layer description");
  // True colour: 2004 and newer only.
  assert.equal(tag(layer(t2018, "Trace"), 420), String(0x123456));
  assert.equal(tag(layer(t2000, "Trace"), 420), undefined);
  const arc = (text) => section(text, "ENTITIES").find((e) => e.type === "ARC" && tag(e, 8) === "Trace");
  assert.equal(tag(arc(t2004), 420), String(0xab12cd));
  assert.equal(tag(arc(t2000), 420), undefined);
  assert.equal(importDxf(t2004).drawings.find((d) => d.kind === "arc" && d.layer === "Trace").color, "#ab12cd");
  // Text: \U+ escapes in pure ASCII before 2007, UTF-8 from 2007 on.
  assert.ok(!/[^\x00-\x7f]/.test(t2004) && t2004.includes("\\U+AC70\\U+C2E4"));
  assert.ok(t2018.includes("거실"));
  for (const t of [t2000, t2018]) assert.ok(importDxf(t).texts.some((x) => x.text === "거실"));
  // The two-line note: one MTEXT with braces and backslashes escaped.
  const mt = section(t2018, "ENTITIES").find((e) => e.type === "MTEXT");
  assert.equal(tag(mt, 1), "Line one\\P둘째 줄 \\{a\\}\\\\b");
  assert.equal(tag(mt, 71), "2", "centred at the top");
  const lines = importDxf(t2018).texts.filter((x) => x.layer === "A-ANNO-TEXT").flatMap((x) => x.text.split("\n"));
  assert.ok(lines.includes("둘째 줄 {a}\\b"), JSON.stringify(lines));
});

test("Binary round trip of an AutoCAD 2018 export (2-byte codes, handles and xdata)", () => {
  const text = exportDxf(sampleProject(), { version: "2018" });
  const bin = writeBinaryDxf(asciiPairs(text));
  const back = readBinaryDxf(bin);
  const want = asciiPairs(text);
  assert.equal(back.length, want.length);
  for (let i = 0; i < want.length; i++) {
    assert.equal(back[i][0], want[i][0]);
    const a = back[i][1], b = want[i][1];
    if (a !== b) near(+a, +b, 1e-9 * Math.max(1, Math.abs(+b)), `pair ${i} (${want[i][0]})`);
  }
});
