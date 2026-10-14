// 3D file exchange: ZIP, OBJ, PLY, OFF, AMF, 3MF, STEP, STL, FreeCAD .FCStd —
// MyCAD's writers and readers against each other, and MyCAD's readers against
// files made by FreeCAD itself (samples/freecad, volumes FreeCAD computed).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { booleanOf } from '../../src/domain/csg.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import {
  anglesOf, exportMesh, importMesh, indexMesh, matrixOfQuaternion, objectsOf, parseBms, parseStepEntities, quaternionOf, rotationOf, setBooleanImplementation, toBms,
} from '../../src/domain/exchange3d.js';
import { meshBox, meshVolume, solidMesh } from '../../src/domain/solids.js';
import { toAsciiStl, toBinaryStl } from '../../src/domain/stl.js';
import { parseXml } from '../../src/domain/xml.js';
import { crc32, inflateRaw, readZip, writeZip } from '../../src/domain/zip.js';
import { solidsShowcase } from '../../scripts/models3d.mjs';

setBooleanImplementation(booleanOf);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const near = (a, b, rel, label = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-6, `${label}: ${a} vs ${b}`);
const volumeOf = (entities) => entities.map(normalizeEntity).filter((e) => e?.type === 'solid').reduce((sum, e) => sum + meshVolume(solidMesh(e)), 0);

test('zip: stored writer, reader of stored and deflated entries (own inflate), CRC-32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const text = Array.from({ length: 3000 }, (_, i) => `line ${i % 17} ${Math.sin(i).toFixed(4)}`).join('\n');
  for (const level of [0, 1, 6, 9]) assert.equal(new TextDecoder().decode(inflateRaw(zlib.deflateRawSync(text, { level }))), text, `level ${level}`);
  const zip = writeZip([{ name: 'a/b.txt', data: 'héllo' }, { name: 'c.bin', data: new Uint8Array([0, 1, 255]) }]);
  const files = readZip(zip);
  assert.equal(new TextDecoder().decode(files.get('a/b.txt')), 'héllo');
  assert.deepEqual([...files.get('c.bin')], [0, 1, 255]);
});

test('xml: elements, attributes, entities, CDATA, namespaces', () => {
  const doc = parseXml('<?xml version="1.0"?><m:model xmlns:m="x" unit="mm"><m:a v="1 &amp; 2"/><b><![CDATA[<raw>]]></b><!-- note --><c>t&lt;x</c></m:model>');
  assert.equal(doc.attrs.unit, 'mm');
  assert.equal(doc.children[0].attrs.v, '1 & 2');
  assert.equal(doc.children[1].text, '<raw>');
  assert.equal(doc.children[2].text, 't<x');
});

test('rotations: quaternion ↔ matrix ↔ X·Y·Z angles', () => {
  for (const [rx, ry, rz] of [[0, 0, 0], [30, 0, 0], [0, -45, 10], [15, -20, 30], [90, 0, 90], [170, 60, -100]]) {
    const m = rotationOf({ rx, ry, rz });
    const back = matrixOfQuaternion(quaternionOf(m));
    m.flat().forEach((v, i) => assert.ok(Math.abs(v - back.flat()[i]) < 1e-9));
    const a = anglesOf(m);
    const again = rotationOf(a);
    m.flat().forEach((v, i) => assert.ok(Math.abs(v - again.flat()[i]) < 1e-9, `${rx} ${ry} ${rz}`));
  }
});

test('mesh formats: every writer read back by its reader keeps the volume (OBJ, PLY, OFF, AMF, 3MF, STEP, STL)', () => {
  const d = solidsShowcase();
  const solids = d.entities.filter((e) => e.type === 'solid');
  const total = solids.reduce((sum, e) => sum + meshVolume(solidMesh(e)), 0);
  for (const format of ['obj', 'ply', 'off', 'amf', '3mf', 'step']) {
    const bytes = exportMesh(format, d, d.entities);
    const { entities } = importMesh(format, bytes);
    near(volumeOf(entities), total, 1e-5, format);
    if (['obj', 'amf', '3mf', 'step'].includes(format)) assert.equal(entities.length, solids.length, `${format}: one object per solid`);
  }
  const triangles = solids.flatMap((e) => solidMesh(e));
  near(volumeOf(importMesh('stl', toBinaryStl(triangles)).entities), total, 1e-5, 'binary STL');
  near(volumeOf(importMesh('stl', toAsciiStl(triangles)).entities), total, 1e-5, 'ASCII STL');
});

test('readers: binary PLY, OBJ with negative indices and polygons, OFF, inch AMF, 3MF build transforms', () => {
  // Binary little-endian PLY: a unit tetrahedron.
  const header = 'ply\nformat binary_little_endian 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 4\nproperty list uchar int vertex_indices\nend_header\n';
  const body = new DataView(new ArrayBuffer(4 * 12 + 4 * 13));
  [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((p, i) => p.forEach((v, k) => body.setFloat32(i * 12 + k * 4, v, true)));
  [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]].forEach((f, i) => { body.setUint8(48 + i * 13, 3); f.forEach((v, k) => body.setInt32(48 + i * 13 + 1 + k * 4, v, true)); });
  const ply = new Uint8Array([...new TextEncoder().encode(header), ...new Uint8Array(body.buffer)]);
  near(volumeOf(importMesh('ply', ply).entities), 1 / 6, 1e-6, 'binary PLY');
  const obj = 'v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nv 0 0 1\nv 1 0 1\nv 1 1 1\nv 0 1 1\nf -8 -5 -6 -7\nf 5 6 7 8\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n';
  near(volumeOf(importMesh('obj', obj).entities), 1, 1e-9, 'OBJ quads');
  near(volumeOf(importMesh('off', 'OFF\n4 4 0\n0 0 0\n1 0 0\n0 1 0\n0 0 1\n3 0 2 1\n3 0 1 3\n3 0 3 2\n3 1 2 3\n').entities), 1 / 6, 1e-9, 'OFF');
  const amf = '<amf unit="inch"><object id="1"><mesh><vertices>' + [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]].map((p) => `<vertex><coordinates><x>${p[0]}</x><y>${p[1]}</y><z>${p[2]}</z></coordinates></vertex>`).join('') + '</vertices><volume>' + [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]].map((f) => `<triangle><v1>${f[0]}</v1><v2>${f[1]}</v2><v3>${f[2]}</v3></triangle>`).join('') + '</volume></mesh></object></amf>';
  near(volumeOf(importMesh('amf', amf).entities), 25.4 ** 3 / 6, 1e-9, 'AMF in inches');
  const model = '<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object><object id="2" type="model"><components><component objectid="1" transform="2 0 0 0 2 0 0 0 2 0 0 0"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0"/></build></model>';
  const threemf = writeZip([{ name: '3D/3dmodel.model', data: model }]);
  const read = importMesh('3mf', threemf).entities.map(normalizeEntity);
  near(volumeOf(read), 8 / 6, 1e-9, '3MF component scaled ×2');
  near(meshBox(solidMesh(read[0])).min[0], 10, 1e-9, '3MF build item moved');
  assert.throws(() => importMesh('stl', new Uint8Array(10)));
  assert.throws(() => importMesh('step', 'not a step file'));
});

test('FreeCAD mesh (.bms) and STEP entities', () => {
  const tris = solidMesh(normalizeEntity({ type: 'solid', kind: 'box', params: { length: 2, width: 3, height: 4 } }));
  const back = parseBms(toBms(tris));
  near(meshVolume(back), 24, 1e-6, 'bms');
  assert.equal(indexMesh(tris).vertices.length, 8);
  const entities = parseStepEntities("ISO-10303-21;\nDATA;\n#1=CARTESIAN_POINT('',(1.,2.,3.));\n#2=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));\n#3=PRODUCT('it''s','x','',(#1));\nENDSEC;\nEND-ISO-10303-21;");
  assert.deepEqual(entities.get(1).args[1], [1, 2, 3]);
  assert.ok(entities.get(2).parts.LENGTH_UNIT);
  assert.equal(entities.get(3).args[0], "it's");
});

test('FCStd: MyCAD writes a parametric FreeCAD document and reads it back with the same solids', () => {
  const d = solidsShowcase();
  const solids = d.entities.filter((e) => e.type === 'solid');
  const bytes = exportMesh('fcstd', d, d.entities);
  const files = readZip(bytes);
  assert.ok(files.has('Document.xml') && files.has('GuiDocument.xml'));
  const xml = new TextDecoder().decode(files.get('Document.xml'));
  for (const type of ['Part::Box', 'Part::Cylinder', 'Part::Sphere', 'Part::Cone', 'Part::Torus', 'Part::Wedge', 'Part::Prism', 'Part::Ellipsoid', 'Part::Helix', 'Part::Sweep', 'Part::Extrusion', 'Part::Revolution', 'Part::Loft', 'Part::Mirroring', 'Mesh::Feature', 'Sketcher::SketchObject']) {
    assert.ok(xml.includes(`type="${type}"`), type);
  }
  // Side files are stored in the order Document.xml refers to them (FreeCAD reads them in that order).
  const order = [...files.keys()].filter((name) => name !== 'Document.xml' && name !== 'GuiDocument.xml');
  assert.deepEqual(order, order.slice().sort((a, b) => xml.indexOf(`file="${a}"`) - xml.indexOf(`file="${b}"`)));
  const { entities, warnings } = importMesh('fcstd', bytes);
  assert.deepEqual(warnings, []);
  const read = entities.map(normalizeEntity).filter((e) => e.type === 'solid');
  assert.equal(read.length, solids.length);
  for (const e of solids) {
    const back = read.find((r) => r.name === e.name);
    assert.ok(back, e.name);
    near(meshVolume(solidMesh(back)), meshVolume(solidMesh(e)), 0.01, e.name);
    const a = meshBox(solidMesh(back));
    const b = meshBox(solidMesh(e));
    [...a.min, ...a.max].forEach((v, i) => assert.ok(Math.abs(v - [...b.min, ...b.max][i]) < Math.max(...b.size) * 0.02 + 0.05, `${e.name} box`));
  }
  assert.ok(entities.some((e) => e.type === 'line'), 'the 2D sketch comes back as lines');
});

test('files made by FreeCAD 1.1 (samples/freecad) are read with the volumes FreeCAD computed', () => {
  const dir = path.join(root, 'samples', 'freecad');
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'freecad-volumes.json'), 'utf8'));
  const checked = [];
  for (const [file, info] of Object.entries(expected)) {
    if (info.error || !fs.existsSync(path.join(dir, file))) continue;
    const ext = file.split('.').pop().toLowerCase();
    if (ext === 'iges') continue;
    const { entities } = importMesh(ext, new Uint8Array(fs.readFileSync(path.join(dir, file))));
    // Curved faces are tessellated by MyCAD (5° steps): within half a percent.
    near(volumeOf(entities), info.volume, 0.005, file);
    checked.push(file);
  }
  assert.ok(checked.length >= 9, checked.join(', '));
  const assembly = importMesh('fcstd', new Uint8Array(fs.readFileSync(path.join(dir, 'freecad-assembly.FCStd')))).entities.map(normalizeEntity);
  const objects = expected['freecad-assembly.FCStd'].objects;
  for (const [name, volume] of Object.entries(objects)) {
    const entity = assembly.find((e) => e.name === name);
    assert.ok(entity, name);
    near(meshVolume(solidMesh(entity)), volume, 0.01, name);
  }
});

test('objectsOf: one named object per solid', () => {
  const d = solidsShowcase();
  const objects = objectsOf(d.entities);
  assert.equal(objects.length, d.entities.filter((e) => e.type === 'solid').length);
  assert.ok(objects.every((o) => o.name && o.triangles.length));
});
