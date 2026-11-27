// DWG (src/cad/dwg) and DXF reading, and 2D drawings as sketches (src/cad/cad2d-import.js).
//
//  - the bit codes against the worked examples of the Open Design Specification (chapter 2);
//  - an R2000 file written and read back: every object read exactly to its end bit, every CRC right (file header,
//    header variables, classes, objects, object map, second header), the header handles pointing at the right
//    objects, the entities, layers and line types as written;
//  - the R2004+ LZ77 decompressor against a compressor written separately from the opcode table (4.7);
//  - DXF: group codes, \U+ escapes, POLYLINE … SEQEND, units; a drawing as a sketch: bulges as arcs, inserts
//    placed, a closed outline a profile.
//  - R2007, R2010, R2013 and R2018 written and read back: every object exact to its string stream, UTF-16 text; the
//    R2007 container's CRC-64s and every Reed–Solomon code word consistent.
// The readers are also checked against AutoCAD's own files of every release, the R2007 container's algorithms
// against an AutoCAD file, and our files of every release by LibreDWG: npm run verify:dwg.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BitReader, BitWriter, crc8, encodeMC, encodeMS, R2000 } from '../../src/cad/dwg/bits.js';
import { readDwg } from '../../src/cad/dwg/read.js';
import { writeDwg } from '../../src/cad/dwg/write.js';
import { readHeader, HEADER_START } from '../../src/cad/dwg/header.js';
import { decompress, MAGIC, pageChecksum } from '../../src/cad/dwg/r2004.js';
import { readDxf } from '../../src/cad/dxf-read.js';
import { flattenDrawing, itemsToSketch, plainMtext } from '../../src/cad/cad2d-import.js';
import { profiles } from '../../src/cad/sketch.js';

const bits = (s) => { const out = new Uint8Array(Math.ceil(s.length / 8)); [...s].forEach((c, i) => { if (c === '1') out[i >> 3] |= 0x80 >> (i & 7); }); return out; };

test('bit codes: the specification examples (2.2, 2.3, 2.6, 2.7)', () => {
  const r = new BitReader(bits('0000000001000000011011010000111110'));
  assert.deepEqual([r.BS(), r.BS(), r.BS(), r.BS(), r.BS()], [257, 0, 256, 15, 0], 'five bitshorts');
  const l = new BitReader(bits('000000000100000001000000000000000010010000111110'));
  assert.deepEqual([l.BL(), l.BL(), l.BL(), l.BL()], [257, 0, 15, 0], 'bitlongs');
  assert.equal(new BitReader(Uint8Array.from([0x82, 0x24])).MC(), 4610, 'modular char');
  assert.equal(new BitReader(Uint8Array.from([0xe9, 0x97, 0xe6, 0x35])).MC(), 112823273, 'four-byte modular char');
  assert.equal(new BitReader(Uint8Array.from([0x85, 0x4b])).MC(), -1413, 'negative modular char');
  assert.equal(new BitReader(Uint8Array.from([0x31, 0xf4, 0x8d, 0x00])).MS(), 4650033, 'modular short');
  // The writers give back what the readers take.
  for (const v of [0, 1, 255, 256, 257, 4610, 112823273, -1, -1413, 0x3f, 0x40, 0x7f]) assert.equal(new BitReader(Uint8Array.from(encodeMC(v))).MC(), v, `MC ${v}`);
  for (const v of [0, 1, 0x7fff, 0x8000, 4650033]) assert.equal(new BitReader(Uint8Array.from(encodeMS(v))).MS(), v, `MS ${v}`);
  const w = new BitWriter(R2000);
  const vals = { BS: [0, 256, 15, -2, 1000], BL: [0, 7, 300, -5], BD: [0, 1, 2.5, -1e-9] };
  for (const v of vals.BS) w.BS(v); for (const v of vals.BL) w.BL(v); for (const v of vals.BD) w.BD(v);
  w.DD(1.25, 1.25); w.DD(1.2500000001, 1.25); w.DD(-77.5, 3); w.H(5, 0x1ca); w.T('Ø20 – 45°');
  const rr = new BitReader(w.bytes());
  assert.deepEqual(vals.BS.map(() => rr.BS()), vals.BS); assert.deepEqual(vals.BL.map(() => rr.BL()), vals.BL); assert.deepEqual(vals.BD.map(() => rr.BD()), vals.BD);
  assert.deepEqual([rr.DD(1.25), rr.DD(1.25), rr.DD(3)], [1.25, 1.2500000001, -77.5], 'doubles with default');
  assert.deepEqual(rr.H(), { code: 5, value: 0x1ca }, 'a handle reference');
  assert.equal(rr.T(), 'Ø20 – 45°', 'text in code page 1252');
  // The 16-bit CRC is the spec's table (CRC-16/ARC): "123456789" → 0xBB3D.
  assert.equal(crc8(0, Uint8Array.from('123456789', (c) => c.charCodeAt(0))), 0xbb3d);
});

/** A drawing of every entity the writer knows. */
function sampleDrawing() {
  const entities = [
    { name: 'LINE', layerName: 'VISIBLE', start: [0, 0, 0], end: [100, 50, 0] },
    { name: 'LINE', layerName: 'HIDDEN', start: [10.5, -3.25, 0], end: [-7, 22.125, 0] },
    { name: 'LINE', layerName: 'VISIBLE', start: [1, 2, 3], end: [4, 5, 6] },
    { name: 'CIRCLE', layerName: 'VISIBLE', center: [50, 25, 0], radius: 12.5 },
    { name: 'ARC', layerName: 'NOTES', center: [0, 0, 0], radius: 5, startAngle: 0.25, endAngle: 2.5 },
    { name: 'ELLIPSE', layerName: 'NOTES', center: [3, 4, 0], majorAxis: [6, 0, 0], ratio: 0.5, startParam: 0, endParam: 2 * Math.PI },
    { name: 'POINT', layerName: '0', point: [1, 2, 0] },
    { name: 'TEXT', layerName: 'NOTES', insert: [5, 6], height: 3.5, text: 'Ø 20 H7 – 45°', rotation: 0 },
    { name: 'TEXT', layerName: 'NOTES', insert: [15, 6], align: [15, 6], halign: 1, height: 2.5, text: 'centred', rotation: Math.PI / 2 },
    { name: 'SOLID', layerName: 'NOTES', corners: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0]] },
    { name: 'LWPOLYLINE', layerName: 'VISIBLE', points: [[0, 0], [10, 0], [10, 10]], bulges: [0, 0.5, 0], closed: true },
  ];
  const layers = [{ name: 'VISIBLE', color: 7 }, { name: 'HIDDEN', color: 8, ltype: 'HIDDEN' }, { name: 'NOTES', color: 3 }];
  return { entities, layers };
}

test('DWG R2000 written and read back: every object exact, every CRC right, the drawing as written', () => {
  const { entities, layers } = sampleDrawing();
  const bytes = writeDwg({ layers, entities, units: 4 });
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'AC1015');
  const d = readDwg(bytes); // throws when the file header CRC is wrong
  for (const o of d.objects.values()) assert.ok(o.exact && !o.error && !o.unsupported, `${o.name} ${o.handle.toString(16)} read exactly`);
  // Header variables: exactly their section, CRC right, handles at the right objects.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = {}; for (let i = 0; i < dv.getUint32(0x15, true); i++) { const at = 0x19 + i * 9; records[bytes[at]] = { seek: dv.getUint32(at + 1, true), size: dv.getUint32(at + 5, true) }; }
  const h = readHeader(bytes, records[0].seek, 15);
  assert.equal(h.usedBits, h.sizeBytes * 8, 'the variables fill their section');
  assert.equal(h.crc, h.crcComputed, 'header CRC');
  const kind = (handle) => d.objects.get(handle)?.name;
  for (const [v, name] of [['BLOCK_CONTROL', 'BLOCK_CONTROL'], ['LAYER_CONTROL', 'LAYER_CONTROL'], ['LTYPE_CONTROL', 'LTYPE_CONTROL'], ['DIMSTYLE_CONTROL', 'DIMSTYLE_CONTROL'], ['DICT_NAMED_OBJECTS', 'DICTIONARY'], ['DICT_PLOTSTYLES', 'ACDBDICTIONARYWDFLT'], ['BLOCK_RECORD_MSPACE', 'BLOCK_HEADER'], ['LTYPE_CONTINUOUS', 'LTYPE'], ['CLAYER', 'LAYER'], ['DIMSTYLE', 'DIMSTYLE']]) assert.equal(kind(h.vars[v]), name, `${v} → ${name}`);
  assert.equal(h.vars.INSUNITS, 4); assert.equal(d.units, 4);
  assert.ok(h.vars.HANDSEED > Math.max(...d.objects.keys()), 'the handle seed is past every handle');
  // Every object's CRC and every object map section's.
  let at = records[2].seek; let handle = 0; let loc = 0; let count = 0;
  for (;;) {
    const s = (bytes[at] << 8) | bytes[at + 1];
    assert.equal(crc8(0xc0c1, bytes, at, at + s), (bytes[at + s] << 8) | bytes[at + s + 1], 'map section CRC');
    if (s <= 2) break;
    const r = new BitReader(bytes, (at + 2) * 8);
    while ((r.bit >> 3) < at + s) {
      handle += r.MC(false); loc += r.MC(true); count++;
      const o = new BitReader(bytes, loc * 8); const size = o.MS(); const ms = (o.bit >> 3) - loc;
      assert.equal(crc8(0xc0c1, bytes, loc, loc + ms + size), bytes[loc + ms + size] | bytes[loc + ms + size + 1] << 8, `object ${handle.toString(16)} CRC`);
    }
    at += s + 2;
  }
  assert.equal(count, d.objects.size, 'the map lists every object');
  const cs = dv.getUint32(records[1].seek + 16, true);
  assert.equal(crc8(0xc0c1, bytes, records[1].seek + 16, records[1].seek + 20 + cs), dv.getUint16(records[1].seek + 20 + cs, true), 'classes CRC');
  // The drawing.
  assert.deepEqual([...d.layers.values()].map((l) => `${l.name}/${l.color}`).sort(), ['0/7', 'HIDDEN/8', 'NOTES/3', 'VISIBLE/7']);
  const hidden = [...d.objects.values()].find((o) => o.name === 'LAYER' && o.entryName === 'HIDDEN');
  assert.equal(d.objects.get(hidden.ltype).entryName, 'HIDDEN', 'the layer keeps its line type');
  assert.deepEqual(d.objects.get(hidden.ltype).dashes.map((x) => x.length), [6.35, -3.175]);
  assert.deepEqual(d.modelSpace.map((e) => e.name), entities.map((e) => e.name), 'entities in order');
  const [l1, l2, l3, c, a, el, p, t1, t2, so, lw] = d.modelSpace;
  assert.deepEqual([l1.start, l1.end, l1.layerName], [[0, 0, 0], [100, 50, 0], 'VISIBLE']);
  assert.deepEqual([l2.start, l2.end], [[10.5, -3.25, 0], [-7, 22.125, 0]]);
  assert.deepEqual([l3.start, l3.end], [[1, 2, 3], [4, 5, 6]], 'a line off the XY plane');
  assert.deepEqual([c.center, c.radius, a.radius, a.startAngle, a.endAngle], [[50, 25, 0], 12.5, 5, 0.25, 2.5]);
  assert.deepEqual([el.majorAxis, el.ratio], [[6, 0, 0], 0.5]);
  assert.deepEqual(p.point, [1, 2, 0]);
  assert.deepEqual([t1.text, t1.insert, t1.height], ['Ø 20 H7 – 45°', [5, 6], 3.5]);
  assert.deepEqual([t2.text, t2.rotation, t2.halign], ['centred', Math.PI / 2, 1]);
  assert.deepEqual(so.corners[1], [1, 0, 0]);
  assert.deepEqual([lw.points, lw.bulges, lw.closed], [[[0, 0], [10, 0], [10, 10]], [0, 0.5, 0], true]);
  // The second file header names the sections again.
  let sAt = -1; for (let i = bytes.length - 16; i >= 0; i--) if (bytes[i] === 0xd4 && bytes[i + 1] === 0x7b && bytes[i + 2] === 0x21 && bytes[i + 3] === 0xce) { sAt = i; break; }
  const sr = new BitReader(bytes, (sAt + 16) * 8); sr.RL();
  assert.equal(sr.BL(), sAt, 'the second header knows where it is');
  assert.deepEqual([...HEADER_START], [...bytes.subarray(records[0].seek, records[0].seek + 16)], 'header sentinel at its locator');
});

/**
 * A compressor written from the opcode table of 4.7 alone (literal runs, matches with 0x40–0xFF and 0x21–0x3F
 * opcodes): what it writes the app's decompressor must read back.
 */
function compress(data) {
  const out = [];
  const literalLength = (n) => { // the length of a run of n ≥ 4 literals (or 0x01–0x0E for 4–17)
    if (n <= 17) out.push(n - 3); else { out.push(0); let rest = n - 3 - 0x0f; while (rest > 0xff) { out.push(0); rest -= 0xff; } out.push(rest); }
  };
  let i = 0; let lit = [];
  const flushFirst = () => { literalLength(lit.length); out.push(...lit); lit = []; };
  // First literal run (at least 4 bytes).
  lit = Array.from(data.subarray(0, Math.min(17, data.length))); i = lit.length; flushFirst();
  while (i < data.length) {
    let best = 0; let off = 0;
    for (let o = 1; o <= Math.min(i, 1024); o++) { let n = 0; while (i + n < data.length && n < 33 && data[i + n - o] === data[i + n]) n++; if (n > best) { best = n; off = o; } }
    if (best >= 3) {
      // Then the literals that follow (up to the next match), counted in the opcode or as a run.
      const start = i + best; let end = start;
      while (end < data.length && end - start < 200) { let n = 0; for (let o = 1; o <= Math.min(end, 1024) && n < 3; o++) { n = 0; while (end + n < data.length && n < 3 && data[end + n - o] === data[end + n]) n++; } if (n >= 3) break; end++; }
      const lits = data.subarray(start, end); const nl = lits.length;
      const litField = nl >= 1 && nl <= 3 ? nl : 0;
      if (best <= 14 && off - 1 < 1024) { out.push(((best + 1) << 4) | (((off - 1) & 3) << 2) | litField, (off - 1) >> 2); }
      else { out.push(best + 0x1e, (((off - 1) & 0x3f) << 2) | litField, (off - 1) >> 6); }
      if (nl && !litField) { if (nl < 4) throw new Error('unreachable'); literalLength(nl); }
      else if (!nl && !litField) { /* no literals: the next opcode follows */ }
      out.push(...lits);
      i = end;
      if (nl >= 4 || nl === 0) { /* literal count encoded as a run or absent */ }
    } else throw new Error('the test data repeats after its first 17 bytes, so every later position starts a match');
  }
  out.push(0x11, 0, 0);
  return Uint8Array.from(out);
}

test('DWG R2004 written and read back: the paged container (header CRC-32, page and system-page checksums), every object exact', async () => {
  const { r2004Header, r2004Sections } = await import('../../src/cad/dwg/r2004.js');
  const { crc32 } = await import('../../src/cad/dwg/bits.js');
  const { entities, layers } = sampleDrawing();
  const bytes = writeDwg({ layers, entities, units: 4, version: 'R2004' });
  assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), 'AC1018');
  // The decrypted file header and its CRC-32 (seed 0, the CRC field zero).
  const h = r2004Header(bytes).raw.slice();
  const stored = (h[0x68] | h[0x69] << 8 | h[0x6a] << 16 | h[0x6b] << 24) >>> 0;
  h.set([0, 0, 0, 0], 0x68);
  assert.equal(crc32(h, 0, 0x6c, 0), stored, 'file header CRC-32');
  const u32 = (b, at) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16 | b[at + 3] << 24) >>> 0;
  // Every data page: the header unmasked, its checksums as AutoCAD computes them (checked against AutoCAD's files).
  const H = r2004Header(bytes);
  let pages = 0;
  for (let at = 0x100; at < H.pageMapAddress;) {
    const mask = (0x4164536b ^ at) >>> 0;
    const hdr = new Uint8Array(32);
    for (let k = 0; k < 32; k += 4) { const v = (u32(bytes, at + k) ^ mask) >>> 0; hdr[k] = v & 255; hdr[k + 1] = (v >>> 8) & 255; hdr[k + 2] = (v >>> 16) & 255; hdr[k + 3] = v >>> 24; }
    if (u32(hdr, 0) !== 0x4163043b) { const size = u32(bytes, at + 8); at += (0x14 + size + 31) & ~31; continue; } // the section map (a system page)
    const comp = bytes.subarray(at + 32, at + 32 + u32(hdr, 8));
    const ds = pageChecksum(0, comp);
    assert.equal(u32(hdr, 28), ds, 'page data checksum');
    const h0 = hdr.slice(); h0.set([0, 0, 0, 0], 24);
    assert.equal(u32(hdr, 24), pageChecksum(ds, h0), 'page header checksum');
    pages++; at += (32 + comp.length + 31) & ~31;
  }
  assert.ok(pages >= 7, `${pages} data pages`);
  // The page map: its checksum over its header (checksum 0), continued over the data.
  const pm = bytes.subarray(H.pageMapAddress, H.pageMapAddress + 0x14 + u32(bytes, H.pageMapAddress + 8));
  const ph = pm.slice(0, 0x14); ph.set([0, 0, 0, 0], 16);
  assert.equal(u32(pm, 16), pageChecksum(pageChecksum(0, ph), pm.subarray(0x14)), 'page map checksum');
  const sections = r2004Sections(bytes);
  for (const n of ['AcDb:Header', 'AcDb:AuxHeader', 'AcDb:Classes', 'AcDb:Handles', 'AcDb:Template', 'AcDb:ObjFreeSpace', 'AcDb:AcDbObjects']) assert.ok(sections.has(n), n);
  assert.equal(sections.get('AcDb:AuxHeader').length, 123);
  const hv = readHeader(sections.get('AcDb:Header'), 0, 18);
  assert.equal(hv.crc, hv.crcComputed, 'header CRC');
  assert.ok(hv.sizeBytes * 8 - hv.usedBits < 8, 'the variables fill their section');
  const d = readDwg(bytes);
  for (const o of d.objects.values()) assert.ok(o.exact && !o.error && !o.unsupported, `${o.name} ${o.handle.toString(16)} read exactly`);
  assert.equal(d.units, 4);
  assert.deepEqual(d.modelSpace.map((e) => e.name), entities.map((e) => e.name));
  assert.deepEqual([...d.layers.values()].map((l) => l.name).sort(), ['0', ...layers.map((l) => l.name)].sort());
  assert.equal([...d.layers.values()].find((l) => l.name === layers[0].name).color, layers[0].color ?? 7);
});

for (const [version, tag] of [['R2007', 'AC1021'], ['R2010', 'AC1024'], ['R2013', 'AC1027'], ['R2018', 'AC1032']]) {
  test(`DWG ${version} written and read back: every object exact to its string stream, the drawing as written (UTF-16 text)`, () => {
    const { entities, layers } = sampleDrawing();
    const all = [...entities, { name: 'TEXT', layerName: 'NOTES', insert: [0, -10], height: 2.5, text: '한글 치수 — Ü', rotation: 0 }];
    const bytes = writeDwg({ layers, entities: all, units: 4, version });
    assert.equal(String.fromCharCode(...bytes.subarray(0, 6)), tag);
    const d = readDwg(bytes);
    assert.equal(d.release, tag);
    for (const o of d.objects.values()) assert.ok(o.exact && !o.error && !o.unsupported, `${o.name} ${o.handle.toString(16)} read exactly`);
    assert.deepEqual(d.modelSpace.map((e) => e.name), all.map((e) => e.name));
    assert.equal(d.modelSpace.at(-1).text, '한글 치수 — Ü');
    assert.equal(d.modelSpace.find((e) => e.name === 'TEXT').text, 'Ø 20 H7 – 45°');
    assert.deepEqual([...d.layers.values()].map((l) => l.name).sort(), ['0', ...layers.map((l) => l.name)].sort());
    assert.equal([...d.layers.values()].find((l) => l.name === 'NOTES').color, 3);
  });
}

test('DWG R2007 container: file header CRC, map CRCs and every Reed–Solomon code word consistent', async () => {
  const { RS_SYSTEM, RS_DATA, rsSyndromes, crc64, crcSeed1, crcSeed2 } = await import('../../src/cad/dwg/r2007-write.js');
  const { entities, layers } = sampleDrawing();
  const bytes = writeDwg({ layers, entities, units: 4, version: 'R2007' });
  const u64 = (a, at) => { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(a[at + i]); return v; };
  const block = (base, blocks, i) => { const b = new Uint8Array(255); for (let j = 0; j < 255; j++) b[j] = bytes[base + i + j * blocks]; return b; };
  const consistent = (code, base, blocks) => Array.from({ length: blocks }, (_, i) => rsSyndromes(code, block(base, blocks, i)).every((x) => x === 0)).every(Boolean);
  assert.ok(consistent(RS_SYSTEM, 0x80, 3), 'file header code words');
  const pe = new Uint8Array(3 * 239); for (let i = 0; i < 3; i++) pe.set(block(0x80, 3, i).subarray(0, 239), i * 239);
  const len = (pe[24] | pe[25] << 8 | pe[26] << 16 | pe[27] << 24);
  assert.ok(len < 0, 'stored, not compressed');
  const hdr = pe.slice(32, 32 - len);
  assert.equal(u64(pe, 16), crc64(true, crcSeed2(0, -len), hdr), 'header data CRC');
  const h0 = hdr.slice(); h0.fill(0, 0x108, 0x110);
  assert.equal(u64(hdr, 0x108), crc64(true, crcSeed2(0, 0x110), h0), 'header CRC');
  const H = (at) => Number(u64(hdr, at));
  // The pages map (a system page at 0x480): its code words and its CRC; then every page it lists.
  const pmSize = H(0x58); const pmBlocks = Math.ceil((((H(0x50) + 7) & ~7) * H(0x18)) / 239);
  assert.ok(consistent(RS_SYSTEM, 0x480, pmBlocks), 'pages map code words');
  const pm = new Uint8Array(pmBlocks * 239); for (let i = 0; i < pmBlocks; i++) pm.set(block(0x480, pmBlocks, i).subarray(0, 239), i * 239);
  assert.equal(u64(hdr, 0x80), crc64(false, crcSeed1(0, pmSize), pm.subarray(0, pmSize)), 'pages map CRC');
  const system = new Set([H(0x40), H(0x30), H(0xc0), H(0xb8)]);
  let at = 0x480; let checked = 0;
  for (let k = 0; 16 * k + 16 <= pmSize; k++) {
    const size = Number(u64(pm, 16 * k)); const id = Number(u64(pm, 16 * k + 8));
    if (!size) break;
    // Interleaved pages (system ones and RS coded data); the raw ones (AppInfo, SummaryInfo) are checked by the reader.
    const blocks = Math.floor(size / 255);
    if (system.has(id)) assert.ok(consistent(RS_SYSTEM, at, blocks), `system page ${id}`);
    else if (consistent(RS_DATA, at, blocks)) checked++;
    at += size;
  }
  assert.ok(checked >= 7, `${checked} RS(255,251) data pages consistent`);
  assert.equal(at + 0x400, bytes.length, 'the pages, then the copy of the file header');
});

test('R2004 compression: data compressed by an independent encoder of the opcode table decompresses exactly', () => {
  const pattern = new TextEncoder().encode('AcDb:AcDbObjects ');
  const data = new Uint8Array(4000);
  for (let i = 0; i < data.length; i++) data[i] = i < 17 ? pattern[i] : data[i - 17] ^ (i % 97 === 0 ? 1 : 0);
  const packed = compress(data);
  assert.ok(packed.length < data.length / 3, `${packed.length} bytes for ${data.length}`);
  assert.deepEqual([...decompress(packed, 0, packed.length, data.length)], [...data]);
  // The magic sequence of 4.1 starts 29 23 BE 84 E1 6C D6 AE; the page checksum of 4.2 is an Adler-like sum.
  assert.deepEqual([...MAGIC.subarray(0, 8)], [0x29, 0x23, 0xbe, 0x84, 0xe1, 0x6c, 0xd6, 0xae]);
  assert.equal(pageChecksum(0, Uint8Array.from([1, 2, 3])), ((1 + 3 + 6) << 16 | 6) >>> 0);
});

test('DXF: sections, layers with line types, POLYLINE … SEQEND folded, \\U+ escapes, units', () => {
  const dxf = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1032', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '0', 'LAYER', '2', 'HIDDEN', '62', '8', '6', 'HIDDEN', '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'TEXT', '8', 'HIDDEN', '10', '1', '20', '2', '40', '2.5', '1', '45\\U+00B0',
    '0', 'POLYLINE', '8', '0', '70', '1', '0', 'VERTEX', '10', '0', '20', '0', '42', '1', '0', 'VERTEX', '10', '10', '20', '0', '0', 'SEQEND',
    '0', 'ENDSEC', '0', 'EOF'].join('\r\n');
  const m = readDxf(dxf);
  assert.equal(m.release, 'AC1032'); assert.equal(m.units, 1, 'inches');
  assert.deepEqual(m.layers.get('HIDDEN'), { name: 'HIDDEN', color: 8, on: true, ltype: 'HIDDEN' });
  assert.equal(m.modelSpace[0].text, '45°');
  const pl = m.modelSpace[1];
  assert.deepEqual([pl.name, pl.closed, pl.vertexList.map((v) => v.bulge)], ['POLYLINE_2D', true, [1, 0]]);
  assert.throws(() => readDxf('nothing'), (e) => e.code === 'dxf-read');
  assert.equal(plainMtext('{\\fArial|b1;Line 1}\\PLine \\S1#2;'), 'Line 1\nLine 1/2');
});

test('a drawing as a sketch: a bulged polyline is a closed outline of lines and an arc, a rotated insert lands in place', () => {
  // A 20 × 10 slot: two lines and two half-circle bulges (bulge 1 = 180°), closed.
  const model = {
    modelSpace: [
      { name: 'LWPOLYLINE', layerName: '0', points: [[0, 0], [20, 0], [20, 10], [0, 10]], bulges: [0, 1, 0, 1], closed: true, extrusion: [0, 0, 1] },
      { name: 'INSERT', layerName: '0', block: 7, insert: [100, 0, 0], scale: [2, 2, 1], rotation: Math.PI / 2, extrusion: [0, 0, 1] },
      { name: 'INSERT', layerName: '0', block: 7, insert: [0, 0, 0], scale: [1, 1, 1], rotation: 0, dimension: true },
    ],
    blocks: new Map([[7, { name: 'B', base: [1, 0, 0], entities: [{ name: 'LINE', start: [1, 0, 0], end: [4, 0, 0], layerName: '0' }] }]]),
  };
  const { items, skipped } = flattenDrawing(model);
  assert.deepEqual(items.map((i) => i.kind), ['line', 'arc3', 'line', 'arc3', 'line']);
  assert.deepEqual(skipped, { DIMENSION: 1 }, 'the dimension block is left out');
  const placed = items.at(-1);
  assert.ok(Math.hypot(placed.a[0] - 100, placed.a[1]) < 1e-12 && Math.hypot(placed.b[0] - 100, placed.b[1] - 6) < 1e-12, `insert: ${placed.a} → ${placed.b}`);
  const arc = items[1].pts; // from (20,0) bulging out to x = 25 at the middle, to (20,10)
  assert.ok(Math.hypot(arc[1][0] - 25, arc[1][1] - 5) < 1e-12, `bulge mid point ${arc[1]}`);
  const { sketch } = itemsToSketch(items.slice(0, 4), { scale: 25.4 });
  const prof = profiles(sketch);
  assert.equal(prof.length, 1, 'one closed region');
  const area = (20 * 10 + Math.PI * 25) * 25.4 * 25.4;
  // The loop area is taken over the arcs as polylines: within their chord error.
  assert.ok(Math.abs(Math.abs(prof[0].outer.area) - area) < 2e-3 * area, `area ${prof[0].outer.area} vs ${area}`);
});

test('a sketch saved as DXF and as DWG comes back as the same closed profile', async () => {
  const { createSketchGeometry, addLine, addArc, addCircle } = await import('../../src/cad/sketch.js');
  const { sketchToEntities, entitiesToDxf } = await import('../../src/cad/sketch-export.js');
  // A 40 × 20 plate with one rounded end (a half circle) and a hole.
  const s = createSketchGeometry();
  const a = addLine(s, 0, 0, 40, 0); const top = addLine(s, 40, 20, 0, 20);
  addLine(s, 0, 0, 0, 0, { from: top.p2, to: a.p1 });
  addArc(s, 40, 10, 10, 0, 0, { from: a.p2, to: top.p1 });
  addCircle(s, 15, 10, 4);
  const want = 40 * 20 + Math.PI * 100 / 2 - Math.PI * 16;
  const areaOf = (sk) => { const pr = profiles(sk); return pr.reduce((t, p) => t + Math.abs(p.outer.area) - p.holes.reduce((u, h) => u + Math.abs(h.area), 0), 0); };
  assert.ok(Math.abs(areaOf(s) - want) < 2e-3 * want, `source ${areaOf(s)} vs ${want}`);
  const entities = sketchToEntities(s);
  assert.deepEqual(entities.map((e) => e.name).sort(), ['ARC', 'CIRCLE', 'LINE', 'LINE', 'LINE']);
  for (const model of [readDxf(entitiesToDxf(entities)), readDwg(writeDwg({ layers: [{ name: 'SKETCH', color: 7 }], entities }))]) {
    const { sketch } = itemsToSketch(flattenDrawing(model).items, { scale: 1 });
    assert.ok(Math.abs(areaOf(sketch) - want) < 2e-3 * want, `back ${areaOf(sketch)} vs ${want}`);
  }
});
