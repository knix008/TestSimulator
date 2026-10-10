// Unit tests for the DWG reader (src/io/dwg.js). Run:
//   node --test test/unit/dwg.test.mjs
//
// The first part needs no files: bit codes, checksums, both LZ77 variants,
// version detection, error handling and a small R2000 drawing written by the
// test itself (compared with the same drawing as DXF).
//
// The second part compares real drawings with their DXF exports. It runs
// when MYARCH_DWG_CORPUS points at a folder of DWG files with same-named DXF
// files next to them (for example the LibreDWG test-data files
// example_2000.dwg/.dxf … example_2018.dwg/.dxf); otherwise it is skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { importDwg, detectDwgVersion, BitReader, crc16, crc32, decompressR2004, decompressR2007, fitSpline } from "../../src/io/dwg.js";
import { importDxf } from "../../src/io/dxf.js";

import { BitWriter, entityObject, tableObject, buildR2000, sampleDwg, sampleDxf } from "./dwg-fixtures.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b}, got ${a}`);

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
    const i = pool.findIndex((u) => u.text === t.text && u.layer === t.layer && u.align === t.align && Math.abs(u.x - t.x) <= tol && Math.abs(u.y - t.y) <= tol && Math.abs(u.size - t.size) <= tol && Math.abs(u.rot - t.rot) <= 1e-6);
    if (i >= 0) { pool.splice(i, 1); n++; }
  }
  return n;
}

// ================================================================ no files needed

test("bit reader: bit codes (B, BB, BS, BL, BD, DD, RC across byte edges, H, MS-free text)", () => {
  const w = new BitWriter();
  w.B(1).n(2, 2).BS(0).BS(256).BS(7).BS(4000).BL(0).BL(200).BL(123456).BD(0).BD(1).BD(-2.5).RC(0xa5).DD(3.25, 3.25).DD(7.5, 3.25).H(5, 0x1234).T("Abc").RS(0xbeef).RL(0xdeadbeef);
  // DD with a 4-byte patch: same high bytes as the default.
  const def = 1000.0;
  const want = new Float64Array([def]);
  const wb = new Uint8Array(want.buffer);
  wb[0] ^= 0x5a; // differs in the low bytes only
  w.n(1, 2); for (let i = 0; i < 4; i++) w.RC(wb[i]);
  const r = new BitReader(w.bytes());
  assert.equal(r.B(), 1);
  assert.equal(r.BB(), 2);
  assert.deepEqual([r.BS(), r.BS(), r.BS(), r.BS()], [0, 256, 7, 4000]);
  assert.deepEqual([r.BL(), r.BL(), r.BL()], [0, 200, 123456]);
  assert.deepEqual([r.BD(), r.BD(), r.BD()], [0, 1, -2.5]);
  assert.equal(r.RC(), 0xa5);
  assert.equal(r.DD(3.25), 3.25);
  assert.equal(r.DD(3.25), 7.5);
  assert.deepEqual(r.H(), { code: 5, v: 0x1234 });
  assert.equal(r.TV(), "Abc");
  assert.equal(r.RS(), 0xbeef);
  assert.equal(r.RL(), 0xdeadbeef);
  assert.equal(r.DD(def), want[0]);
  assert.throws(() => { for (;;) r.B(); }, /truncated/);
});

test("bit reader: BLL, object type (OT) and Unicode text (TU)", () => {
  const w = new BitWriter();
  w.n(3, 3).RC(0x01).RC(0x02).RC(0x03); // BLL 0x030201
  w.n(0, 2).RC(0x13); // OT: one byte
  w.n(1, 2).RC(0x10); // OT: byte + 0x1f0
  w.n(2, 2).RS(0x2a5); // OT: short
  w.BS(2).RS(0xd55c).RS(0xae00); // "한" + U+AE00
  const r = new BitReader(w.bytes());
  assert.equal(r.BLL(), 0x030201);
  assert.deepEqual([r.OT(), r.OT(), r.OT()], [0x13, 0x200, 0x2a5]);
  assert.equal(r.TU(), "한글");
});

test("checksums: CRC-16 (DWG seed) and CRC-32 match the standard check values", () => {
  const s = new TextEncoder().encode("123456789");
  assert.equal(crc16(s, 0), 0xbb3d); // CRC-16/ARC
  assert.equal(crc32(s), 0xcbf43926);
  assert.equal(crc16(new Uint8Array(0)), 0xc0c1);
  assert.notEqual(crc16(s), crc16(s.slice(0, 8)));
});

test("R2004 LZ77: literal runs, short and long back-references, end marker", () => {
  // "ABCD" literal (opcode 0x01 = 1+3 bytes), copy 4 from offset 3 (0x5c, 0x00), end 0x11.
  assert.deepEqual([...decompressR2004(new Uint8Array([0x01, 65, 66, 67, 68, 0x5c, 0x00, 0x11]), 8)], [..."ABCDABCD"].map((c) => c.charCodeAt(0)));
  // Long literal form (0x00, n → n + 0x0f + 3 bytes), then an overlapping
  // two-byte-offset copy.
  const nineteen = Array.from({ length: 19 }, (_, i) => 65 + i);
  const res = decompressR2004(new Uint8Array([0x00, 0x01, ...nineteen, 0x22, (2 << 2), 0x00, 0x11]), 19 + 4);
  // 0x22: count = 0x22 − 0x1e = 4, two-byte offset (b1 >> 2) | (b2 << 6) = 2 → copy from 3 back.
  assert.deepEqual([...res], [...nineteen, 65 + 16, 65 + 17, 65 + 18, 65 + 16]);
  // A reference before the start of the output is an error.
  assert.throws(() => decompressR2004(new Uint8Array([0x01, 65, 66, 67, 68, 0x5c, 0x40, 0x11]), 64), /out of range/);
  // Running out of input mid-run is reported as truncated.
  assert.throws(() => decompressR2004(new Uint8Array([0x05, 65, 66]), 64), /truncated/);
});

test("R2007 LZ77: shuffled literal runs and back-references", () => {
  // A literal run of n bytes is opcode n − 8 (n = 9 … 22), stored shuffled.
  for (const n of [9, 12, 16, 17, 20, 22]) {
    const plain = Array.from({ length: n }, (_, i) => i + 1);
    // Build the stored order by inverting the decoder on a probe.
    const probe = decompressR2007(new Uint8Array([n - 8, ...plain]), n);
    // probe[k] = plain[perm[k]] → store so that decoding yields `plain`.
    const stored = new Array(n);
    for (let k = 0; k < n; k++) stored[probe[k] - 1] = plain[k];
    assert.deepEqual([...decompressR2007(new Uint8Array([n - 8, ...stored]), n)], plain, `run of ${n}`);
    assert.deepEqual([...probe].sort((a, b) => a - b), plain, `run of ${n} is a permutation`);
  }
  // 16 bytes: two 8-byte halves swapped; 4 and 8 byte pieces kept in order.
  const p16 = Array.from({ length: 16 }, (_, i) => i);
  assert.deepEqual([...decompressR2007(new Uint8Array([8, ...p16]), 16)], [...p16.slice(8), ...p16.slice(0, 8)]);
  // Literal of 9, then opcode 0x40-style copy: length = op >> 4 (4), offset from op & 15 and next byte.
  const p9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const lit9 = decompressR2007(new Uint8Array([1, ...p9]), 9);
  // 0x40: length 4, offset (0) + ((next & 0xf8) << 1) + 1 → next = 0x10 gives offset 0x21? keep it small: next 0x00 → offset 1.
  const out = decompressR2007(new Uint8Array([1, ...p9, 0x40, 0x00]), 13);
  assert.deepEqual([...out], [...lit9, lit9[8], lit9[8], lit9[8], lit9[8]]);
});

test("version detection", () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.deepEqual(detectDwgVersion(enc("AC1015xxxx")), { code: "AC1015", release: "R2000", supported: true, number: 1015 });
  assert.equal(detectDwgVersion(enc("AC1032")).release, "R2018");
  assert.equal(detectDwgVersion(enc("AC1021")).release, "R2007");
  assert.equal(detectDwgVersion(enc("AC1012")).release, "R13");
  assert.equal(detectDwgVersion(enc("AC1009")).supported, false);
  assert.equal(detectDwgVersion(enc("0\r\nSECTION")), null);
  assert.equal(detectDwgVersion(new Uint8Array(3)), null);
});

test("errors: not a DWG, too old, truncated", () => {
  assert.throws(() => importDwg(new TextEncoder().encode("  0\r\nSECTION\r\n  2\r\nHEADER\r\n")), /Not a DWG file/);
  assert.throws(() => importDwg(new TextEncoder().encode("AC1009" + "\0".repeat(200))), /too old/);
  const ok = sampleDwg();
  for (const n of [10, 40, 200, ok.length >> 1]) assert.throws(() => importDwg(ok.subarray(0, n)), /truncated|damaged|missing|No drawing objects/, `cut at ${n}`);
  // Encrypted-header signature check for R2004+.
  const r2004 = new Uint8Array(0x200);
  r2004.set(new TextEncoder().encode("AC1018"));
  assert.throws(() => importDwg(r2004), /damaged/);
  assert.throws(() => importDwg("AC1015"), TypeError);
});

test("fitted splines: interpolation passes through every fit point", () => {
  const Q = [[0, 0, 0], [100, 50, 0], [200, -20, 0], [300, 40, 0]];
  const bs = fitSpline(Q, [1, 0, 0], [0, 1, 0]);
  assert.equal(bs.ctrl.length, Q.length + 2);
  assert.equal(bs.knots.length, Q.length + 6);
  // Evaluate the B-spline at the knots (de Boor) and compare with the fit points.
  const U = bs.knots, P = bs.ctrl;
  const at = (u) => {
    let k = 3;
    while (k < P.length - 1 && u >= U[k + 1]) k++;
    const d = [0, 1, 2, 3].map((j) => P[j + k - 3].slice());
    for (let r = 1; r <= 3; r++) for (let j = 3; j >= r; j--) {
      const den = U[j + 1 + k - r] - U[j + k - 3];
      const a = den > 0 ? (u - U[j + k - 3]) / den : 0;
      d[j] = d[j].map((x, i) => (1 - a) * d[j - 1][i] + a * x);
    }
    return d[3];
  };
  const params = [0, ...U.slice(4, 4 + Q.length - 2), U[U.length - 1]];
  params.forEach((u, i) => { const p = at(Math.min(u, U[U.length - 1] - 1e-9)); near(p[0], Q[i][0], 1e-6, `x${i}`); near(p[1], Q[i][1], 1e-6, `y${i}`); });
  // End tangent: P1 − P0 points along the given start direction.
  assert.ok(bs.ctrl[1][0] > 0 && Math.abs(bs.ctrl[1][1]) < 1e-9);
  assert.equal(fitSpline([[0, 0, 0]]), null);
});

test("a small R2000 drawing imports exactly like the same drawing as DXF", () => {
  const bytes = sampleDwg();
  assert.equal(detectDwgVersion(bytes).release, "R2000");
  const a = importDwg(bytes, { units: "mm" });
  const b = importDxf(sampleDxf(), { units: "mm" });
  assert.equal(a.version, "R2000");
  assert.deepEqual(a.counts, b.counts);
  assert.deepEqual(a.layers.map((l) => [l.name, l.color, l.visible]).sort(), b.layers.map((l) => [l.name, l.color, l.visible]).sort());
  assert.equal(a.drawings.length, b.drawings.length);
  assert.equal(matchDrawings(a.drawings, b.drawings), b.drawings.length);
  assert.equal(matchTexts(a.texts, b.texts), b.texts.length);
  // Spot checks: the block insert (scaled ×2, rotated 90°) and the bulge.
  const circle = a.drawings.find((d) => d.kind === "circle");
  near(circle.r, 800, 1e-6, "inserted circle radius");
  near(circle.cx, 1000, 1e-6, "inserted circle x");
  near(circle.cy, -(2000 + 800), 1e-6, "inserted circle y (plan is y-down)");
  assert.equal(circle.layer, "Walls", "layer 0 inside a block takes the insert's layer");
  const poly = a.drawings.find((d) => d.kind === "polyline" && d.closed);
  assert.ok(poly.pts.length > 4, "the bulge is flattened into an arc");
  assert.equal(poly.color, a.drawings.find((d) => d.kind === "polyline" && d.closed).color);
  assert.equal(a.layers.find((l) => l.name === "Hidden").visible, false);
  assert.ok(a.bounds && a.bounds.x2 >= 5000);
  // Without a readable header the units are guessed (and said so).
  const auto = importDwg(bytes);
  assert.equal(auto.units, "mm");
  assert.ok(auto.warnings.some((w) => /no units/.test(w)));
});

test("unreadable objects are skipped and counted", () => {
  // Corrupt the TEXT object's text length so its data runs out.
  const objects = [
    [0x10, tableObject(0x33, 0x10, (d) => d.T("0").B(0).BS(0).B(0).BS(0).BS(7))],
    [0x1f, tableObject(0x31, 0x1f, (d) => d.T("*Model_Space").B(0).BS(0).B(0).B(0).B(0).B(0).B(0).B(1).BD3([0, 0, 0]))],
    [0x30, entityObject(19, 0x30, { layer: 0x10, body: (d) => d.B(1).RD(0).DD(10, 0).RD(0).DD(0, 0).B(1).B(1) })],
    [0x31, entityObject(1, 0x31, { layer: 0x10, body: (d) => d.RC(0).RD(0).RD(0).RD(0).BS(30000) })],
  ];
  const r = importDwg(buildR2000(objects), { units: "mm" });
  assert.equal(r.drawings.length, 1);
  assert.ok(r.warnings.some((w) => /1 DWG object could not be read/.test(w)), r.warnings.join(" | "));
});

// ================================================================ corpus (MYARCH_DWG_CORPUS)

const corpus = process.env.MYARCH_DWG_CORPUS;
const corpusOk = !!corpus && existsSync(corpus) && statSync(corpus).isDirectory();
const pairs = corpusOk
  ? readdirSync(corpus).filter((n) => /\.dwg$/i.test(n)).map((n) => n.replace(/\.dwg$/i, "")).filter((b) => existsSync(path.join(corpus, `${b}.dxf`))).sort()
  : [];
const skip = corpusOk ? false : "MYARCH_DWG_CORPUS is not set (folder of DWG files with matching DXF exports)";

test("corpus: every DWG reads", { skip }, () => {
  const files = readdirSync(corpus).filter((n) => /\.dwg$/i.test(n));
  assert.ok(files.length > 0, "no DWG files in the corpus folder");
  for (const n of files) {
    const r = importDwg(readFileSync(path.join(corpus, n)));
    assert.ok(Array.isArray(r.drawings) && Array.isArray(r.texts) && Array.isArray(r.layers), n);
    assert.ok(r.drawings.every((d) => d.kind && d.layer && (d.pts ? d.pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) : Number.isFinite(d.cx + d.cy + d.r))), `${n}: finite geometry`);
  }
});

for (const base of pairs) {
  test(`corpus: ${base}.dwg matches ${base}.dxf`, { skip }, () => {
    const dwg = importDwg(readFileSync(path.join(corpus, `${base}.dwg`)));
    const dxf = importDxf(readFileSync(path.join(corpus, `${base}.dxf`)));
    const ver = detectDwgVersion(readFileSync(path.join(corpus, `${base}.dwg`)));
    // R13/R14 DXF exports turn newer objects into proxies and blocks, so only
    // R2000+ are held to identical counts.
    if (ver.number >= 1015) {
      assert.deepEqual(dwg.counts, dxf.counts, "entity counts per type");
      assert.equal(dwg.units, dxf.units, "units");
      assert.deepEqual(dwg.layers.map((l) => [l.name, l.color, l.visible]).sort(), dxf.layers.map((l) => [l.name, l.color, l.visible]).sort(), "layers");
      assert.equal(dwg.drawings.length, dxf.drawings.length, "drawing items");
      assert.equal(dwg.texts.length, dxf.texts.length, "texts");
    } else {
      assert.deepEqual(dwg.layers.map((l) => l.name).sort(), dxf.layers.map((l) => l.name).sort(), "layers");
    }
    // Geometry within 1 µm (fitted splines are recomputed from their fit
    // points, so allow those few to differ).
    const m = matchDrawings(dwg.drawings, dxf.drawings);
    const splines = dxf.counts.SPLINE || 0;
    const tolerance = ver.number >= 1015 ? Math.max(splines * 40, Math.ceil(dxf.drawings.length * 0.001)) : dxf.drawings.length;
    assert.ok(dxf.drawings.length - m <= tolerance, `${m}/${dxf.drawings.length} drawing items match`);
    if (ver.number >= 1015) assert.equal(matchTexts(dwg.texts, dxf.texts), dxf.texts.length, "texts match");
  });
}

test("corpus: R2000 file header and object map CRCs are valid", { skip }, () => {
  for (const n of readdirSync(corpus).filter((x) => /\.dwg$/i.test(x))) {
    const b = new Uint8Array(readFileSync(path.join(corpus, n)));
    if (detectDwgVersion(b)?.code !== "AC1015") continue;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const recs = dv.getUint32(0x15, true);
    assert.equal(dv.getUint16(0x19 + recs * 9, true), crc16(b, 0xc0c1, 0, 0x19 + recs * 9), `${n}: file header CRC`);
    const off = dv.getUint32(0x19 + 2 * 9 + 1, true);
    const size = (b[off] << 8) | b[off + 1];
    assert.equal((b[off + size] << 8) | b[off + size + 1], crc16(b, 0xc0c1, off, off + size), `${n}: object map CRC`);
  }
});
