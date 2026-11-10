// 3D model samples for File › Import › 3D model and its tests: one small chair (45 × 87 × 47 cm, front +Z)
// written in each format the importer reads beyond the everyday ones, plus a table as CAD solids.
//
//   node scripts/make-model-samples.mjs        → samples/models/*
//
//   chair.amf (mm, Z up)        chair.off (cm, face colours)      chair.vtk / chair.vtp (m)
//   chair.lwo (LightWave, m)    chair.3dm (Rhino, mm, Z up)       chair.kmz (KML + Collada in inches, textured)
//   scan.pcd (binary, Z up)     scan.xyz (x y z r g b)            chair-obj.zip (OBJ + MTL + texture in folders)
//   chair-gltf.zip (glTF + .bin + texture)   chair-draco.glb (Draco meshes)   chair-ktx2.glb (KTX2/Basis texture)
//   table.step / table.igs / table.brep (120 × 75 × 80 cm table as solids, made by FreeCAD when it is installed:
//   FREECAD_CMD or the usual folders; without FreeCAD those three are left as they are)
//
// The KTX2 texture is three.js's test image examples/textures/ktx2/2d_etc1s.ktx2 (MIT), kept in test/fixtures/io.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { zipSync, strToU8 } from 'fflate';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'samples', 'models');
fs.mkdirSync(outDir, { recursive: true });
const require = createRequire(import.meta.url);
const write = (name, data) => { fs.writeFileSync(path.join(outDir, name), data); console.log(`  ${name.padEnd(18)} ${String(data.length).padStart(7)} bytes`); };

// ───────────────────────── the chair (metres, Y up, front +Z, bottom centre at the origin)

const BOXES = [
  [-0.225, 0.42, -0.235, 0.225, 0.47, 0.235],    // seat
  [-0.225, 0.47, -0.235, 0.225, 0.87, -0.195],   // back
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * 0.205 - 0.02, 0, sz * 0.215 - 0.02, sx * 0.205 + 0.02, 0.42, sz * 0.215 + 0.02]), // legs
];
const WOOD = [0.62, 0.43, 0.25];

/** The chair as quads: { points: [[x,y,z]], quads: [[a,b,c,d]] (outward, counter-clockwise), uvs per quad corner }. */
function chair(transform = (p) => p) {
  const points = [], quads = [];
  for (const [x0, y0, z0, x1, y1, z1] of BOXES) {
    const base = points.length;
    for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]) points.push(transform([x, y, z]));
    for (const q of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [0, 1, 5, 4], [3, 7, 6, 2]]) quads.push(q.map((i) => base + i));
  }
  return { points, quads };
}
const triangles = (quads) => quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);
const zUp = ([x, y, z]) => [x, -z, y]; // the importer turns Z-up files with −90° about X: file (x, −Z, Y) → world (X, Y, Z)
const scaled = (k, f = (p) => p) => (p) => f(p).map((v) => +(v * k).toFixed(6));
const fmt = (v) => +v.toFixed(5);

/** Unshared corners with per-face UVs (for textured formats). */
function texturedChair(k = 1) {
  const { points, quads } = chair(scaled(k));
  const position = [], normal = [], uv = [], index = [];
  for (const q of quads) {
    const p = q.map((i) => points[i]);
    const e1 = p[1].map((v, i) => v - p[0][i]), e2 = p[3].map((v, i) => v - p[0][i]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const len = Math.hypot(...n) || 1;
    const base = position.length / 3;
    p.forEach((pt, i) => { position.push(...pt); normal.push(...n.map((v) => v / len)); uv.push(...[[0, 0], [1, 0], [1, 1], [0, 1]][i]); });
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { position, normal, uv, index };
}

const woodPng = await sharp(Buffer.from(Array.from({ length: 64 * 64 }, (_, i) => {
  const x = i % 64, y = Math.floor(i / 64);
  const grain = 0.85 + 0.15 * Math.sin(x * 0.45 + Math.sin(y * 0.2) * 2);
  return WOOD.map((c) => Math.round(255 * c * grain));
}).flat()), { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();

// ───────────────────────── AMF (millimetres, Z up)

{
  const { points, quads } = chair(scaled(1000, zUp));
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<amf unit="millimeter" version="1.1">', '  <metadata type="name">MySketchBook sample chair</metadata>',
    '  <material id="1"><color><r>0.62</r><g>0.43</g><b>0.25</b></color></material>',
    '  <object id="0"><mesh>', '    <vertices>',
    ...points.map(([x, y, z]) => `      <vertex><coordinates><x>${x}</x><y>${y}</y><z>${z}</z></coordinates></vertex>`),
    '    </vertices>', '    <volume materialid="1">',
    ...triangles(quads).map(([a, b, c]) => `      <triangle><v1>${a}</v1><v2>${b}</v2><v3>${c}</v3></triangle>`),
    '    </volume>', '  </mesh></object>', '</amf>', ''].join('\n');
  write('chair.amf', strToU8(xml));
}

// ───────────────────────── OFF (centimetres, Y up, face colours: legs darker)

{
  const { points, quads } = chair(scaled(100));
  const colour = (i) => (i < 12 ? '158 110 64' : '92 64 40');
  const text = ['OFF', '# MySketchBook sample chair, centimetres', `${points.length} ${quads.length} 0`,
    ...points.map((p) => p.map(fmt).join(' ')), ...quads.map((q, i) => `4 ${q.join(' ')} ${colour(i)}`), ''].join('\n');
  write('chair.off', strToU8(text));
}

// ───────────────────────── VTK legacy ASCII and VTK XML PolyData (metres, Y up)

{
  const { points, quads } = chair();
  const vtk = ['# vtk DataFile Version 3.0', 'MySketchBook sample chair (metres)', 'ASCII', 'DATASET POLYDATA', `POINTS ${points.length} float`,
    ...points.map((p) => p.map(fmt).join(' ')), `POLYGONS ${quads.length} ${quads.length * 5}`, ...quads.map((q) => `4 ${q.join(' ')}`), ''].join('\n');
  write('chair.vtk', strToU8(vtk));
  const vtp = ['<?xml version="1.0"?>', '<VTKFile type="PolyData" version="0.1" byte_order="LittleEndian">', '  <PolyData>',
    `    <Piece NumberOfPoints="${points.length}" NumberOfVerts="0" NumberOfLines="0" NumberOfStrips="0" NumberOfPolys="${quads.length}">`,
    '      <Points>', `        <DataArray type="Float32" NumberOfComponents="3" format="ascii">${points.flat().map(fmt).join(' ')}</DataArray>`, '      </Points>',
    '      <Polys>', `        <DataArray type="Int32" Name="connectivity" format="ascii">${quads.flat().join(' ')}</DataArray>`,
    `        <DataArray type="Int32" Name="offsets" format="ascii">${quads.map((_, i) => (i + 1) * 4).join(' ')}</DataArray>`, '      </Polys>',
    '    </Piece>', '  </PolyData>', '</VTKFile>', ''].join('\n');
  write('chair.vtp', strToU8(vtp));
}

// ───────────────────────── LightWave LWO2 (metres; LightWave is left-handed: x is mirrored, faces clockwise)

{
  const { points, quads } = chair(([x, y, z]) => [-x, y, z]);
  const chunk = (id, body) => { const pad = body.length % 2; const b = Buffer.alloc(8 + body.length + pad); b.write(id, 0, 'ascii'); b.writeUInt32BE(body.length, 4); body.copy(b, 8); return b; };
  const sub = (id, body) => { const b = Buffer.alloc(6 + body.length); b.write(id, 0, 'ascii'); b.writeUInt16BE(body.length, 4); body.copy(b, 6); return b; };
  const str = (s) => { const b = Buffer.from(`${s}\0`, 'ascii'); return b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b; };
  const u2 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
  const f4 = (...v) => { const b = Buffer.alloc(4 * v.length); v.forEach((x, i) => b.writeFloatBE(x, i * 4)); return b; };
  const tags = chunk('TAGS', str('Wood'));
  const layr = chunk('LAYR', Buffer.concat([u2(0), u2(0), f4(0, 0, 0), str('chair')]));
  const pnts = chunk('PNTS', f4(...points.flat()));
  // Mirroring x flips the winding; reversing each quad keeps the faces outward once the loader mirrors back.
  const pols = chunk('POLS', Buffer.concat([Buffer.from('FACE'), ...quads.map((q) => Buffer.concat([u2(4), ...[...q].reverse().map(u2)]))]));
  const ptag = chunk('PTAG', Buffer.concat([Buffer.from('SURF'), ...quads.map((_, i) => Buffer.concat([u2(i), u2(0)]))]));
  const surf = chunk('SURF', Buffer.concat([str('Wood'), str(''), sub('COLR', Buffer.concat([f4(...WOOD), u2(0)])), sub('DIFF', Buffer.concat([f4(1), u2(0)]))]));
  const body = Buffer.concat([Buffer.from('LWO2'), tags, layr, pnts, pols, ptag, surf]);
  const form = Buffer.alloc(8); form.write('FORM', 0, 'ascii'); form.writeUInt32BE(body.length, 4);
  write('chair.lwo', Buffer.concat([form, body]));
}

// ───────────────────────── point clouds: PCD (binary, Z up, colours) and XYZ (x y z r g b, Y up)

function sampleSurface(step = 0.02) {
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1] of BOXES) {
    const grid = (a0, a1) => { const n = Math.max(1, Math.round((a1 - a0) / step)); return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n); };
    for (const x of grid(x0, x1)) for (const y of grid(y0, y1)) for (const z of grid(z0, z1)) {
      const onSurface = [x0, x1].includes(x) || [y0, y1].includes(y) || [z0, z1].includes(z);
      if (onSurface) out.push([x, y, z]);
    }
  }
  return out;
}
{
  const pts = sampleSurface();
  const shade = (y) => WOOD.map((c) => Math.round(255 * c * (0.7 + 0.35 * y)));
  const header = ['# .PCD v0.7 - MySketchBook sample chair scan (metres, Z up)', 'VERSION 0.7', 'FIELDS x y z rgb', 'SIZE 4 4 4 4', 'TYPE F F F U', 'COUNT 1 1 1 1',
    `WIDTH ${pts.length}`, 'HEIGHT 1', 'VIEWPOINT 0 0 0 1 0 0 0', `POINTS ${pts.length}`, 'DATA binary', ''].join('\n');
  const data = Buffer.alloc(pts.length * 16);
  pts.forEach((p, i) => {
    const [x, y, z] = zUp(p);
    const [r, g, b] = shade(p[1]);
    data.writeFloatLE(x, i * 16); data.writeFloatLE(y, i * 16 + 4); data.writeFloatLE(z, i * 16 + 8); data.writeUInt32LE((r << 16) | (g << 8) | b, i * 16 + 12);
  });
  write('scan.pcd', Buffer.concat([Buffer.from(header, 'ascii'), data]));
  const xyz = pts.map((p) => [...zUp(p).map(fmt), ...shade(p[1])].join(' ')).join('\n');
  write('scan.xyz', strToU8(`${xyz}\n`));
}

// ───────────────────────── KMZ: doc.kml + models/chair.dae (inches, Z up, like SketchUp) + images/wood.png

function collada(k, texture) {
  const { position, normal, uv, index } = texturedChair(1);
  const p = []; for (let i = 0; i < position.length; i += 3) p.push(...zUp(position.slice(i, i + 3)).map((v) => fmt(v * k)));
  const n = []; for (let i = 0; i < normal.length; i += 3) n.push(...zUp(normal.slice(i, i + 3)).map(fmt));
  const tri = index.flatMap((i) => [i, i, i]).join(' ');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><unit meter="0.0254" name="inch"/><up_axis>Z_UP</up_axis></asset>
  <library_images><image id="wood-image"><init_from>${texture}</init_from></image></library_images>
  <library_effects><effect id="wood-effect"><profile_COMMON>
    <newparam sid="wood-surface"><surface type="2D"><init_from>wood-image</init_from></surface></newparam>
    <newparam sid="wood-sampler"><sampler2D><source>wood-surface</source></sampler2D></newparam>
    <technique sid="common"><lambert><diffuse><texture texture="wood-sampler" texcoord="UVSET0"/></diffuse></lambert></technique>
  </profile_COMMON></effect></library_effects>
  <library_materials><material id="wood" name="wood"><instance_effect url="#wood-effect"/></material></library_materials>
  <library_geometries><geometry id="chair-mesh"><mesh>
    <source id="chair-pos"><float_array id="chair-pos-a" count="${p.length}">${p.join(' ')}</float_array><technique_common><accessor source="#chair-pos-a" count="${p.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <source id="chair-nrm"><float_array id="chair-nrm-a" count="${n.length}">${n.join(' ')}</float_array><technique_common><accessor source="#chair-nrm-a" count="${n.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
    <source id="chair-uv"><float_array id="chair-uv-a" count="${uv.length}">${uv.join(' ')}</float_array><technique_common><accessor source="#chair-uv-a" count="${uv.length / 2}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>
    <vertices id="chair-vtx"><input semantic="POSITION" source="#chair-pos"/></vertices>
    <triangles material="wood" count="${index.length / 3}"><input semantic="VERTEX" source="#chair-vtx" offset="0"/><input semantic="NORMAL" source="#chair-nrm" offset="1"/><input semantic="TEXCOORD" source="#chair-uv" offset="2" set="0"/><p>${tri}</p></triangles>
  </mesh></geometry></library_geometries>
  <library_visual_scenes><visual_scene id="scene"><node id="chair" name="chair"><instance_geometry url="#chair-mesh"><bind_material><technique_common><instance_material symbol="wood" target="#wood"><bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;
}
{
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>chair</name><Model><Link><href>models/chair.dae</href></Link></Model></Placemark></kml>
`;
  write('chair.kmz', zipSync({ 'doc.kml': strToU8(kml), 'models/chair.dae': strToU8(collada(1 / 0.0254, '../images/wood.png')), 'images/wood.png': woodPng }));
}

// ───────────────────────── ZIP bundles: OBJ + MTL + texture (centimetres) and glTF + .bin + texture

{
  const { position, uv, index } = texturedChair(100);
  const v = [], vt = [];
  for (let i = 0; i < position.length; i += 3) v.push(`v ${position.slice(i, i + 3).map(fmt).join(' ')}`);
  for (let i = 0; i < uv.length; i += 2) vt.push(`vt ${uv[i]} ${uv[i + 1]}`);
  const f = []; for (let i = 0; i < index.length; i += 3) f.push(`f ${[0, 1, 2].map((k) => `${index[i + k] + 1}/${index[i + k] + 1}`).join(' ')}`);
  const obj = ['# MySketchBook sample chair, centimetres', 'mtllib chair.mtl', 'o chair', ...v, ...vt, 'usemtl wood', ...f, ''].join('\n');
  const mtl = ['newmtl wood', 'Kd 1 1 1', 'Ks 0.1 0.1 0.1', 'Ns 20', 'map_Kd ../textures/wood.png', ''].join('\n');
  write('chair-obj.zip', zipSync({ 'chair/chair.obj': strToU8(obj), 'chair/chair.mtl': strToU8(mtl), 'textures/wood.png': woodPng, 'readme.txt': strToU8('Sample: a chair as OBJ + MTL + texture.\n') }));
}

/** The chair as a glTF document (metres), optionally with its texture given as KTX2. */
function chairDocument(textureBytes, mimeType) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const { position, normal, uv, index } = texturedChair(1);
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const texture = doc.createTexture('wood').setImage(textureBytes).setMimeType(mimeType).setURI(mimeType === 'image/png' ? 'wood.png' : 'wood.ktx2');
  const material = doc.createMaterial('wood').setBaseColorTexture(texture).setRoughnessFactor(0.7).setMetallicFactor(0);
  const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(position))).setAttribute('NORMAL', acc('VEC3', new Float32Array(normal)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv))).setIndices(acc('SCALAR', new Uint16Array(index))).setMaterial(material);
  const mesh = doc.createMesh('chair').addPrimitive(prim);
  doc.createScene('scene').addChild(doc.createNode('chair').setMesh(mesh));
  return doc;
}
{
  const io = new NodeIO();
  const { json, resources } = await io.writeJSON(chairDocument(woodPng, 'image/png'), { basename: 'chair' });
  const files = { 'chair.gltf': strToU8(JSON.stringify(json, null, 1)) };
  for (const [name, data] of Object.entries(resources)) files[name] = data;
  write('chair-gltf.zip', zipSync(files));

  const draco3d = require('draco3dgltf');
  const dracoIo = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({ 'draco3d.encoder': await draco3d.createEncoderModule(), 'draco3d.decoder': await draco3d.createDecoderModule() });
  const dracoDoc = chairDocument(woodPng, 'image/png');
  await dracoDoc.transform(draco({ method: 'edgebreaker' }));
  write('chair-draco.glb', await dracoIo.writeBinary(dracoDoc));

  const ktxDoc = chairDocument(fs.readFileSync(path.join(root, 'test', 'fixtures', 'io', 'etc1s.ktx2')), 'image/ktx2');
  ktxDoc.createExtension(KHRTextureBasisu).setRequired(true);
  write('chair-ktx2.glb', await new NodeIO().registerExtensions([KHRTextureBasisu]).writeBinary(ktxDoc));
}

// ───────────────────────── Rhino 3DM (millimetres, Z up)

{
  const rhino = await require('rhino3dm')();
  const doc = new rhino.File3dm();
  doc.settings().modelUnitSystem = rhino.UnitSystem.Millimeters;
  const { points, quads } = chair(scaled(1000, zUp));
  const mesh = new rhino.Mesh();
  for (const [x, y, z] of points) mesh.vertices().add(x, y, z);
  for (const [a, b, c, d] of quads) mesh.faces().addQuadFace(a, b, c, d);
  mesh.normals().computeNormals();
  mesh.compact();
  const attributes = new rhino.ObjectAttributes();
  attributes.name = 'chair';
  attributes.colorSource = rhino.ObjectColorSource.ColorFromObject;
  attributes.objectColor = { r: 158, g: 110, b: 64, a: 255 };
  doc.objects().add(mesh, attributes);
  write('chair.3dm', Buffer.from(doc.toByteArray()));
}

// ───────────────────────── CAD solids by FreeCAD: STEP, IGES, BREP (millimetres, Z up)

function findFreecad() {
  if (process.env.FREECAD_CMD && fs.existsSync(process.env.FREECAD_CMD)) return process.env.FREECAD_CMD;
  const found = [];
  if (process.platform === 'win32') {
    for (const base of [process.env.ProgramFiles, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      try { for (const name of fs.readdirSync(base).filter((n) => /^FreeCAD/i.test(n))) found.push(path.join(base, name, 'bin', 'freecadcmd.exe')); } catch { /* not there */ }
    }
    for (const drive of 'CDEF') {
      try { for (const name of fs.readdirSync(`${drive}:\\`).filter((n) => /^(freecad|fc)/i.test(n))) found.push(path.join(`${drive}:\\`, name, 'bin', 'freecadcmd.exe')); } catch { /* no drive */ }
    }
  } else found.push('/usr/bin/freecadcmd', '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd');
  return found.find((f) => fs.existsSync(f)) ?? null;
}
{
  const freecad = findFreecad();
  if (!freecad) console.log('  (FreeCAD not found: table.step / table.igs / table.brep kept as they are)');
  else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'msk-cad-'));
    const script = path.join(tmp, 'table.py');
    const out = (ext) => path.join(tmp, `table.${ext}`).replace(/\\/g, '/');
    // Table: 1200 × 800 top, 30 thick, top surface at 750; legs 50 × 50 inset 40 mm (Z up, centred on X/Y).
    fs.writeFileSync(script, [
      'import FreeCAD, Part',
      'top = Part.makeBox(1200, 800, 30, FreeCAD.Vector(-600, -400, 720))',
      'legs = [Part.makeBox(50, 50, 720, FreeCAD.Vector(x, y, 0)) for x in (-560, 510) for y in (-360, 310)]',
      'table = top.fuse(legs).removeSplitter()',
      `table.exportStep("${out('step')}")`,
      `table.exportIges("${out('igs')}")`,
      `table.exportBrep("${out('brep')}")`,
      '',
    ].join('\n'));
    const run = spawnSync(freecad, [script], { encoding: 'utf8', timeout: 120000 });
    for (const ext of ['step', 'igs', 'brep']) {
      if (fs.existsSync(out(ext))) write(`table.${ext}`, fs.readFileSync(out(ext)));
      else console.log(`  ✘ FreeCAD did not write table.${ext}: ${(run.stderr || run.stdout || '').slice(-400)}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
console.log(`→ ${path.relative(root, outDir)}`);
