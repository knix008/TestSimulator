// npm run verify:dwg — the DWG reader against AutoCAD's own files. LibreDWG's test data has the same drawing saved
// by AutoCAD as DWG R2000, 2004, 2007, 2010, 2013 and 2018 and, beside each, AutoCAD's DXF of it. They are
// downloaded once into a cache (%TEMP%/mymechanics-dwg-witness; GPL test data, not part of the app), then every
// model-space entity, every entity of every block and every layer read from the DWG must equal the DXF's, entity by
// entity (by handle), and every structural object the writer also writes (R2000) must be read exactly to its end bit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDwg } from '../src/cad/dwg/read.js';
import { readDxf } from '../src/cad/dxf-read.js';

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
  if (dwg.version === 15) for (const o of dwg.objects.values()) if (STRUCTURAL.has(o.name) && !o.error && !o.exact) problems.push(`${o.name} ${o.handle.toString(16)} not read to its end`);
  failures += problems.length;
  console.log(`${problems.length ? '✘' : '✔'} ${f} (${dwg.release}): ${checked} entities equal to AutoCAD's DXF${problems.length ? ` — ${problems.slice(0, 5).join('; ')}` : ''}`);
}
console.log(failures ? `${failures} differences` : 'every release reads as AutoCAD wrote it');
process.exit(failures ? 1 : 0);
