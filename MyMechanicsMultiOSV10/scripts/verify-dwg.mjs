// npm run verify:dwg — the DWG reader against AutoCAD's own files. LibreDWG's test data has the same drawing saved
// by AutoCAD as DWG R2000, 2004, 2007, 2010, 2013 and 2018 and, beside each, AutoCAD's DXF of it. They are
// downloaded once into a cache (%TEMP%/mymechanics-dwg-witness; GPL test data, not part of the app), then every
// model-space entity, every entity of every block and every layer read from the DWG must equal the DXF's, entity by
// entity (by handle), and every structural object the writer also writes must be read exactly to its end bit (R2007+:
// to where its string stream starts). Then the writer: our own R2000, 2004, 2007, 2010, 2013 and 2018 files are opened by LibreDWG (its WASM build, @mlightcad/libredwg-web,
// a dev dependency) — no error code, the layers and the entities as written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDwg } from '../src/cad/dwg/read.js';
import { readDxf } from '../src/cad/dxf-read.js';
import { writeDwg } from '../src/cad/dwg/write.js';

import { pathToFileURL, fileURLToPath } from 'node:url';

const cache = path.join(os.tmpdir(), 'mymechanics-dwg-witness');
const BASE = 'https://raw.githubusercontent.com/LibreDWG/libredwg/master/test/test-data/';
const FILES = ['example_2000', 'example_2004', 'example_2007', 'example_2010', 'example_2013', 'example_2018'];
fs.mkdirSync(cache, { recursive: true });
for (const f of FILES) for (const ext of ['dwg', 'dxf']) {
  const file = path.join(cache, `${f}.${ext}`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) continue;
  const res = await fetch(BASE + `${f}.${ext}`);
  if (!res.ok) throw new Error(`download ${f}.${ext}: ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const vnear = (a, b, n = 3) => a && b && Array.from({ length: n }, (_, i) => near(a[i] ?? 0, b[i] ?? 0)).every(Boolean);
const angle = (a) => { let x = a % (2 * Math.PI); if (x < 0) x += 2 * Math.PI; return x; };
const same = {
  LINE: (a, b) => vnear(a.start, b.start) && vnear(a.end, b.end),
  CIRCLE: (a, b) => vnear(a.center, b.center) && near(a.radius, b.radius),
  ARC: (a, b) => vnear(a.center, b.center) && near(a.radius, b.radius) && Math.abs(angle(a.startAngle) - angle(b.startAngle)) < 1e-9 && Math.abs(angle(a.endAngle) - angle(b.endAngle)) < 1e-9,
  POINT: (a, b) => vnear(a.point, b.point),
  ELLIPSE: (a, b) => vnear(a.center, b.center) && vnear(a.majorAxis, b.majorAxis) && near(a.ratio, b.ratio) && near(a.startParam, b.startParam) && near(a.endParam, b.endParam),
  LWPOLYLINE: (a, b) => a.points.length === b.points.length && a.points.every((p, i) => vnear(p, b.points[i], 2)) && (a.bulges.length ? a.bulges : a.points.map(() => 0)).every((x, i) => near(x, b.bulges[i] ?? 0)) && a.closed === b.closed,
  SPLINE: (a, b) => (a.fit.length ? a.fit.length === b.fit.length && a.fit.every((p, i) => vnear(p, b.fit[i])) : a.degree === b.degree && a.control.length === b.control.length && a.control.every((p, i) => vnear(p, b.control[i])) && a.knots.every((k, i) => near(k, b.knots[i]))),
  TEXT: (a, b) => a.text === b.text && vnear(a.insert, b.insert, 2) && near(a.height, b.height),
  MTEXT: (a, b) => a.text === b.text && vnear(a.insert, b.insert) && near(a.height, b.height),
  INSERT: (a, b) => vnear(a.insert, b.insert) && vnear(a.scale, b.scale) && near(angle(a.rotation), angle(b.rotation)),
  SOLID: (a, b) => a.corners.every((p, i) => vnear(p, b.corners[i], 2)),
  POLYLINE_2D: (a, b) => a.vertexList.length === b.vertexList.length && a.vertexList.every((v, i) => vnear(v.point, b.vertexList[i].point, 2)),
  POLYLINE_3D: (a, b) => a.vertexList.length === b.vertexList.length && a.vertexList.every((v, i) => vnear(v.point, b.vertexList[i].point)),
};
const STRUCTURAL = new Set(['BLOCK_CONTROL', 'LAYER_CONTROL', 'STYLE_CONTROL', 'LTYPE_CONTROL', 'VIEW_CONTROL', 'UCS_CONTROL', 'VPORT_CONTROL', 'APPID_CONTROL', 'DIMSTYLE_CONTROL', 'VX_CONTROL', 'DICTIONARY', 'ACDBDICTIONARYWDFLT', 'ACDBPLACEHOLDER', 'LAYER', 'STYLE', 'APPID', 'LTYPE', 'MLINESTYLE', 'BLOCK_HEADER', 'BLOCK', 'ENDBLK', 'LAYOUT', 'DIMSTYLE', 'VPORT', 'LINE', 'CIRCLE', 'ARC', 'POINT', 'TEXT', 'SOLID', 'LWPOLYLINE', 'ELLIPSE']);

let failures = 0;
for (const f of FILES) {
  const dwg = readDwg(fs.readFileSync(path.join(cache, `${f}.dwg`)));
  const dxf = readDxf(fs.readFileSync(path.join(cache, `${f}.dxf`), 'latin1'));
  const problems = []; let checked = 0;
  const compare = (mine, theirs, where) => {
    const by = new Map(mine.map((e) => [e.handle, e]));
    for (const e of theirs) {
      const d = by.get(e.handle);
      if (!d) { problems.push(`${where}: no ${e.name} ${e.handle.toString(16)}`); continue; }
      if (d.name !== e.name || (same[e.name] && !same[e.name](d, e)) || d.layerName !== e.layerName) problems.push(`${where}: ${e.name} ${e.handle.toString(16)} differs`);
      else checked++;
    }
  };
  compare(dwg.modelSpace, dxf.modelSpace, 'model space');
  const all = [...dwg.blocks.values()].flatMap((b) => b.entities);
  for (const [name, b] of dxf.blocks) if (!/^\*(model|paper)_space/i.test(name)) compare(all, b.entities, `block ${name}`);
  const layers = (m) => [...m.layers.values()].map((l) => l.name).sort().join();
  if (layers(dwg) !== layers(dxf)) problems.push('layers differ');
  for (const o of dwg.objects.values()) if (STRUCTURAL.has(o.name) && !o.error && !o.exact) problems.push(`${o.name} ${o.handle.toString(16)} not read to its end`);
  failures += problems.length;
  console.log(`${problems.length ? '✘' : '✔'} ${f} (${dwg.release}): ${checked} entities equal to AutoCAD's DXF${problems.length ? ` — ${problems.slice(0, 5).join('; ')}` : ''}`);
}

// ——— the R2007 container's algorithms against AutoCAD's file ———
// Its Reed–Solomon parity (file header code words), the header's and the pages map's CRC-64s (normal and mirrored,
// both seeds) and every data page's 32-bit checksum and CRC-64, computed by our writer's functions.
{
  const { RS_SYSTEM, rsParity, crc64, crcSeed1, crcSeed2, pageChecksum2007 } = await import('../src/cad/dwg/r2007-write.js');
  const { decompress21 } = await import('../src/cad/dwg/r2007.js');
  const b = fs.readFileSync(path.join(cache, 'example_2007.dwg'));
  const problems = [];
  const deint = (at, blocks, k) => { const o = new Uint8Array(blocks * k); for (let j = 0; j < blocks; j++) for (let i = 0; i < k; i++) o[j * k + i] = b[at + i * blocks + j]; return o; };
  const u64 = (a, at) => { let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(a[at + i]); return v; };
  for (let i = 0; i < 3; i++) {
    const blk = new Uint8Array(255); for (let j = 0; j < 255; j++) blk[j] = b[0x80 + i + 3 * j];
    if (!rsParity(RS_SYSTEM, blk, 239).every((x, k) => x === blk[239 + k])) problems.push(`file header code word ${i} parity`);
  }
  const fh = deint(0x80, 3, 239);
  const len = fh[24] | fh[25] << 8 | fh[26] << 16 | fh[27] << 24;
  if (u64(fh, 16) !== crc64(true, crcSeed2(0, Math.abs(len)), fh.subarray(32, 32 + Math.abs(len)))) problems.push('header data CRC');
  const hdr = len > 0 ? decompress21(fh, 32, len, 0x110) : fh.slice(32, 32 + 0x110);
  const h0 = hdr.slice(); h0.fill(0, 0x108, 0x110);
  if (u64(hdr, 0x108) !== crc64(true, crcSeed2(0, 0x110), h0)) problems.push('header CRC');
  const H = (at) => Number(u64(hdr, at));
  const sys = (at, comp, size, factor) => { const blocks = Math.floor((((comp + 7) & ~7) * factor + 238) / 239); const d = deint(at, blocks, 239); return { raw: d.subarray(0, comp), data: comp < size ? decompress21(d, 0, comp, size) : d.slice(0, size) }; };
  const pm = sys(0x480 + H(0x38), H(0x50), H(0x58), H(0x18));
  if (u64(hdr, 0x80) !== crc64(false, crcSeed1(0, H(0x58)), pm.data) || u64(hdr, 0x10) !== crc64(false, crcSeed1(0, H(0x50)), pm.raw)) problems.push('pages map CRCs');
  const pages = new Map(); let off = 0;
  for (let at = 0; at + 16 <= pm.data.length; at += 16) { const size = Number(u64(pm.data, at)); const id = Number(BigInt.asIntN(64, u64(pm.data, at + 8))); if (!size && !id) break; pages.set(Math.abs(id), off + 0x480); off += size; }
  const sm = sys(pages.get(H(0xc0)), H(0xb0), H(0xc8), H(0xd8)).data;
  let n = 0;
  for (let at = 0; at + 64 <= sm.length;) {
    const nameLen = Number(u64(sm, at + 32)); const enc = Number(u64(sm, at + 48)); const count = Number(u64(sm, at + 56)); at += 64 + nameLen;
    for (let p = 0; p < count; p++, at += 56) {
      const id = Number(u64(sm, at + 16)); const usize = Number(u64(sm, at + 24)); const csize = Number(u64(sm, at + 32));
      if (enc !== 4 || !pages.has(id)) continue;
      const d = deint(pages.get(id), Math.floor((((csize + 7) & ~7) + 250) / 251), 251);
      const un = csize < usize ? decompress21(d, 0, csize, usize) : d.slice(0, usize);
      if (pageChecksum2007(0, un, usize) !== Number(u64(sm, at + 40)) || crc64(false, crcSeed1(0, csize), d.subarray(0, csize)) !== u64(sm, at + 48)) problems.push(`data page ${id}`);
      n++;
    }
  }
  failures += problems.length;
  console.log(`${problems.length ? '✘' : '✔'} the R2007 container's Reed–Solomon parity, CRC-64s and ${n} page checksums as AutoCAD's${problems.length ? ` — ${problems.slice(0, 5).join('; ')}` : ''}`);
}

// ——— the writer, read by LibreDWG ———

const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@mlightcad', 'libredwg-web');
// LibreDWG reports a damaged or doubtful file only on the console ("… error code: N"): listen for it.
const said = [];
const keep = { log: console.log, warn: console.warn, error: console.error };
for (const k of ['log', 'warn', 'error']) console[k] = (...a) => { said.push(a.join(' ')); };
const { LibreDwg, Dwg_File_Type } = await import(pathToFileURL(path.join(pkg, 'dist', 'libredwg-web.js')).href);
const lib = await LibreDwg.create(path.join(pkg, 'wasm') + path.sep);
Object.assign(console, keep);
const entities = [
  { name: 'LINE', layerName: 'VISIBLE', start: [0, 0, 0], end: [100, 50, 0] },
  { name: 'CIRCLE', layerName: 'VISIBLE', center: [50, 25, 0], radius: 12.5 },
  { name: 'ARC', layerName: 'NOTES', center: [0, 0, 0], radius: 5, startAngle: 0.25, endAngle: 2.5 },
  { name: 'ELLIPSE', layerName: 'NOTES', center: [3, 4, 0], majorAxis: [6, 0, 0], ratio: 0.5, startParam: 0, endParam: 2 * Math.PI },
  { name: 'POINT', layerName: '0', point: [1, 2, 0] },
  { name: 'TEXT', layerName: 'NOTES', insert: [5, 6], height: 3.5, text: 'Hello', rotation: 0 },
  { name: 'SOLID', layerName: 'NOTES', corners: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 0]] },
  { name: 'LWPOLYLINE', layerName: 'VISIBLE', points: [[0, 0], [10, 0], [10, 10]], bulges: [0, 0.5, 0], closed: true },
];
const layers = [{ name: 'VISIBLE', color: 7 }, { name: 'HIDDEN', color: 8, ltype: 'HIDDEN' }, { name: 'NOTES', color: 3 }];
/** LibreDWG's reading of a file: its "error code" messages and the converted drawing. */
const open = (bytes) => {
  said.length = 0;
  for (const k of ['log', 'warn', 'error']) console[k] = (...a) => { said.push(a.join(' ')); };
  let db = null;
  try {
    const dwg = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), Dwg_File_Type.DWG);
    if (dwg) { db = lib.convert(dwg); lib.dwg_free(dwg); }
  } finally { Object.assign(console, keep); }
  return { db, errors: said.filter((x) => /error code/i.test(x)) };
};
for (const version of ['R2000', 'R2004', 'R2007', 'R2010', 'R2013', 'R2018']) {
  const bytes = writeDwg({ layers, entities, units: 4, version });
  const { db, errors } = open(bytes);
  const problems = [];
  // R2007: LibreDWG flags an absent AcDb:AppInfoHistory (AutoCAD's own, undocumented section, which LibreDWG's own writer
  // leaves out too) with code 64. Accepted only when the same file with a placeholder for it reads without any error.
  let note = '';
  if (version === 'R2007' && errors.length === 1 && /error code: 64\b/.test(errors[0])) {
    const again = open(writeDwg({ layers, entities, units: 4, version, extraSections: [['AcDb:AppInfoHistory', new Uint8Array(16), [0x96de0737, 0x700, 1]]] }));
    if (again.errors.length) problems.push(`with AppInfoHistory: ${again.errors.join('; ')}`); else note = ' (code 64 only for the absent AppInfoHistory)';
  } else if (errors.length) problems.push(errors.join('; '));
  if (!db) problems.push('not opened');
  const got = (db?.tables?.LAYER?.entries ?? []).map((l) => l.name).sort().join();
  if (got !== ['0', 'VISIBLE', 'HIDDEN', 'NOTES'].sort().join()) problems.push(`layers ${got}`);
  const counts = {}; for (const e of db?.entities ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
  for (const e of entities) if (!counts[e.name]) problems.push(`no ${e.name}`);
  const line = (db?.entities ?? []).find((e) => e.type === 'LINE');
  if (line && (line.endPoint?.x !== 100 || line.endPoint?.y !== 50 || line.layer !== 'VISIBLE')) problems.push('the line differs');
  failures += problems.length;
  console.log(`${problems.length ? '✘' : '✔'} our DWG ${version} read by LibreDWG: ${Object.keys(counts).length} entity types, layers ${got}${note}${problems.length ? ` — ${problems.join('; ')}` : ''}`);
}

console.log(failures ? `${failures} differences` : 'every release reads as AutoCAD wrote it; LibreDWG reads what we write');
process.exit(failures ? 1 : 0);
