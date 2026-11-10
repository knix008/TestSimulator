// More 3D import formats (src/io/import.js): OFF, VTK, LightWave, point clouds (PCD/XYZ), CAD solids
// (STEP/IGES/BREP through OpenCASCADE), ZIP/KMZ bundles, and the helpers behind Draco/KTX2/Rhino.
// Samples: samples/models (scripts/make-model-samples.mjs) — a 45 × 87 × 47 cm chair and a 120 × 75 × 80 cm table.
// AMF, VTP, KMZ, 3DM, Draco and KTX2 need a browser (DOMParser, workers): the web E2E checks those.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { strToU8, zipSync } from 'fflate';
import { IMPORT_FORMATS, MODEL_EXTENSIONS, dialogFilters, importAccept, importFormatOf } from '../../src/io/formats.js';
import { isModelName } from '../../src/engine/fileformat.js';
import { cadToObject, cleanXyz, gltfExtensions, importModel, mergeByMaterial, parseOff, rhinoUnits, uncompressTextures, unpackBundle } from '../../src/io/import.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sample = (name) => new Uint8Array(fs.readFileSync(path.join(root, 'samples', 'models', name)));
const fixture = (name) => new Uint8Array(fs.readFileSync(path.join(root, 'test', 'fixtures', 'io', name)));
const near = (actual, expected, tolerance = 1e-3) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const nearAll = (actual, expected, tolerance) => expected.forEach((v, i) => near(actual[i], v, tolerance));
const CHAIR = [0.45, 0.87, 0.47];
const TABLE = [1.2, 0.75, 0.8];

function bottomCentred(object, tolerance = 1e-4) {
  const box = new THREE.Box3().setFromObject(object);
  near(box.min.y, 0, tolerance);
  near((box.min.x + box.max.x) / 2, 0, tolerance);
  near((box.min.z + box.max.z) / 2, 0, tolerance);
}

// The sample chair's boxes (scripts/make-model-samples.mjs), in imported (bottom-centred) metres.
const BOXES = [
  [-0.225, 0.42, -0.235, 0.225, 0.47, 0.235], [-0.225, 0.47, -0.235, 0.225, 0.87, -0.195],
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [sx * 0.205 - 0.02, 0, sz * 0.215 - 0.02, sx * 0.205 + 0.02, 0.42, sz * 0.215 + 0.02]),
].map(([a, b, c, d, e, f]) => new THREE.Box3(new THREE.Vector3(a, b, c), new THREE.Vector3(d, e, f)));

/** Every triangle faces away from the centre of the box it lies on (outward winding, so FrontSide is right). */
function outward(object) {
  object.updateMatrixWorld(true);
  let checked = 0;
  object.traverse((n) => {
    if (!n.isMesh) return;
    const p = (n.geometry.index ? n.geometry.toNonIndexed() : n.geometry).attributes.position;
    const tri = new THREE.Triangle(), normal = new THREE.Vector3(), mid = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      tri.set(...[0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k).applyMatrix4(n.matrixWorld)));
      tri.getNormal(normal); tri.getMidpoint(mid);
      // Faces where two boxes touch (the back on the seat) lie on both: outward from either is fine.
      const boxes = BOXES.filter((b) => b.clone().expandByScalar(1e-3).containsPoint(mid));
      assert.ok(boxes.length, `triangle off the chair at ${mid.toArray().map((v) => v.toFixed(3))}`);
      assert.ok(boxes.some((box) => normal.dot(mid.clone().sub(box.getCenter(new THREE.Vector3()))) > 0), `inward triangle at ${mid.toArray().map((v) => v.toFixed(3))}`);
      checked++;
    }
  });
  assert.ok(checked > 0);
}

test('formats: new formats listed, one list for accept / dialogs / drag & drop', () => {
  for (const id of ['step', 'iges', 'brep', '3dm', 'amf', 'kmz', 'lwo', 'vtk', 'off', 'pcd', 'xyz', 'zip']) assert.ok(IMPORT_FORMATS.some((f) => f.id === id), id);
  for (const f of IMPORT_FORMATS) assert.ok(f.ko && f.en && f.ext.length && f.mime, f.id);
  for (const [name, id] of [['part.STP', 'step'], ['part.igs', 'iges'], ['part.brp', 'brep'], ['house.3dm', '3dm'], ['scan.vtp', 'vtk'], ['bundle.zip', 'zip']]) assert.equal(importFormatOf(name).id, id, name);
  for (const name of ['a.step', 'a.iges', 'a.3dm', 'a.kmz', 'a.lwo', 'a.off', 'a.pcd', 'a.xyz', 'a.zip', 'a.glb', 'a.skp']) assert.ok(isModelName(name), name);
  for (const name of ['a.png', 'a.mtl', 'a.msk', 'a.dxf']) assert.ok(!isModelName(name), name);
  assert.ok(MODEL_EXTENSIONS.includes('skp'));
  for (const ext of ['.stp', '.3dm', '.kmz', '.zip', '.mtl', '.png', '.ktx2']) assert.ok(importAccept().split(',').includes(ext), ext);
  const all = dialogFilters('en')[0];
  assert.equal(all.name, 'All 3D models');
  for (const ext of ['step', 'glb', 'mtl', 'png', 'bin']) assert.ok(all.extensions.includes(ext), ext);
  assert.ok(dialogFilters('ko').some((f) => f.name.startsWith('STEP')));
});

test('OFF: own reader — chair in centimetres with face colours; COFF vertex colours; errors', async () => {
  const { object, stats } = await importModel({ name: 'chair.off', bytes: sample('chair.off') });
  assert.equal(stats.units, 'cm');
  nearAll(stats.sizeMeters, CHAIR, 1e-4);
  assert.equal(stats.triangles, 72);
  bottomCentred(object);
  outward(object);
  let mesh; object.traverse((n) => { if (n.isMesh) mesh = n; });
  assert.ok(mesh.geometry.attributes.color && mesh.material.vertexColors, 'face colours kept');
  const c = mesh.geometry.attributes.color;
  const colours = new Set(Array.from({ length: c.count }, (_, i) => c.getX(i).toFixed(2)));
  assert.equal(colours.size, 2, 'seat/back and legs differ');

  const coff = parseOff('COFF\n# triangle\n3 1 0\n0 0 0 255 0 0\n1 0 0 0 255 0\n0 1 0 0 0 255\n3 0 1 2\n');
  assert.equal(coff.index.count, 3);
  assert.deepEqual(Array.from(coff.attributes.color.array.slice(0, 3)), [1, 0, 0]);
  const quad = parseOff('OFF 4 1 0\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n');
  assert.equal(quad.index.count, 6, 'a quad is fanned into two triangles');
  assert.throws(() => parseOff('PLY\n'), (err) => err.code === 'parse-failed');
  assert.throws(() => parseOff('OFF\n8 6 0\n0 0 0\n'), (err) => err.code === 'parse-failed' && /truncated/.test(err.message));
});

test('VTK legacy and LightWave LWO: metres, outward faces drawn front side', async () => {
  for (const name of ['chair.vtk', 'chair.lwo']) {
    const { object, stats } = await importModel({ name, bytes: sample(name) });
    assert.equal(stats.units, 'm', name);
    nearAll(stats.sizeMeters, CHAIR, 1e-4);
    assert.equal(stats.triangles, 72, name);
    bottomCentred(object);
    outward(object);
    object.traverse((n) => { if (n.isMesh) for (const m of [n.material].flat()) { assert.ok(m.isMeshStandardMaterial); assert.equal(m.side, THREE.FrontSide, `${name}: no BackSide (lost in GLB)`); } });
  }
  const { object } = await importModel({ name: 'chair.lwo', bytes: sample('chair.lwo') });
  let colour; object.traverse((n) => { if (n.isMesh) colour = n.material.color; });
  assert.ok(colour.r > colour.g && colour.g > colour.b, 'the SURF colour (wood) is kept');
});

test('point clouds: PCD (binary, colours) and XYZ become placeable points with a density-based size', async () => {
  for (const name of ['scan.pcd', 'scan.xyz']) {
    const { object, stats } = await importModel({ name, bytes: sample(name) });
    assert.equal(stats.points, 3024, name);
    assert.equal(stats.triangles, 0);
    assert.equal(stats.upAxis, 'z');
    nearAll(stats.sizeMeters, CHAIR, 1e-3);
    bottomCentred(object, 1e-3);
    let points; object.traverse((n) => { if (n.isPoints) points = n; });
    assert.ok(points.geometry.attributes.color, `${name}: colours`);
    assert.ok(points.material.isPointsMaterial && points.material.vertexColors && points.material.sizeAttenuation);
    assert.ok(points.material.size >= 0.01 && points.material.size <= 0.05, `${name}: point size ${points.material.size}`);
    assert.equal(points.userData.pointSize, points.material.size, 'size kept for the stored GLB');
  }
  // Commas, 4 columns (intensity) and float colours: x y z only; integer 0–255 colours are kept.
  assert.equal(cleanXyz('# head\n1,2,3\n4 5 6 0.7\n7 8 9 10 20 30\n1 2 3 0.1 0.2 0.3\nbad line\n'), '1 2 3\n4 5 6\n7 8 9 10 20 30\n1 2 3');
});

test('CAD solids: STEP, IGES and BREP through OpenCASCADE, in metres without guessing', async () => {
  for (const name of ['table.step', 'table.igs', 'table.brep']) {
    const { object, stats, warnings } = await importModel({ name, bytes: sample(name) });
    nearAll(stats.sizeMeters, TABLE, 1e-3);
    assert.equal(stats.upAxis, 'z', name);
    assert.ok(stats.triangles >= 12 && stats.triangles < 2000, `${name}: ${stats.triangles} triangles`);
    assert.ok(!warnings.some((w) => w.code === 'units-guessed'), `${name}: units come from the file`);
    bottomCentred(object, 1e-3);
    object.traverse((n) => { if (n.isMesh) { assert.ok(n.geometry.attributes.normal); assert.ok(n.material.isMeshStandardMaterial); } });
  }
  // Units chosen by the user still win.
  const { stats } = await importModel({ name: 'table.brep', bytes: sample('table.brep') }, { units: 'cm' });
  nearAll(stats.sizeMeters, TABLE.map((v) => v * 10), 1e-2);
  await assert.rejects(importModel({ name: 'broken.step', bytes: strToU8('ISO-10303-21;\nnot really\n') }), (err) => err.code === 'parse-failed');
});

test('cadToObject: assembly tree, solid and face colours as shared materials', () => {
  const square = { attributes: { position: { array: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0] } }, index: { array: [0, 1, 2, 0, 2, 3] } };
  const result = {
    success: true,
    root: { name: 'asm', meshes: [], children: [{ name: 'a', meshes: [0], children: [] }, { name: 'b', meshes: [1, 0], children: [] }] },
    meshes: [
      { ...square, name: 'plain', color: [1, 0, 0] },
      { ...square, name: 'faces', color: [1, 0, 0], brep_faces: [{ first: 0, last: 0, color: [0, 0, 1] }, { first: 1, last: 1, color: null }] },
    ],
  };
  const group = cadToObject(result, 'asm.step');
  assert.equal(group.name, 'asm');
  assert.deepEqual(group.children.map((c) => c.name), ['a', 'b']);
  const [plain, faces, again] = [group.children[0].children[0], ...group.children[1].children];
  assert.equal(plain.material.name, '#ff0000');
  assert.equal(faces.material.length, 2);
  assert.equal(faces.material[1], plain.material, 'same colour, same material');
  assert.deepEqual(faces.geometry.groups.map((g) => [g.start, g.count, g.materialIndex]), [[0, 3, 0], [3, 3, 1]]);
  assert.notEqual(again, plain, 'a part used twice is cloned');
  assert.equal(again.geometry, plain.geometry);
  assert.throws(() => cadToObject({ success: false }), (err) => err.code === 'parse-failed');
});

test('ZIP bundles: the main model is picked, the rest are side files', async () => {
  const obj = fs.readFileSync(path.join(root, 'test', 'fixtures', 'io', 'cube_cm.obj'));
  const mtl = fs.readFileSync(path.join(root, 'test', 'fixtures', 'io', 'cube.mtl'));
  const zip = zipSync({ 'cube/cube_cm.obj': obj, 'cube/materials/cube.mtl': mtl, 'readme.txt': strToU8('hi'), '__MACOSX/cube/._cube_cm.obj': strToU8('junk') });
  const { object, stats } = await importModel({ name: 'cube.zip', bytes: zip });
  assert.equal(stats.format, 'obj');
  assert.equal(stats.bundle, 'cube.zip');
  nearAll(stats.sizeMeters, [1, 1, 1], 1e-4);
  const names = new Set(); object.traverse((n) => { if (n.isMesh) for (const m of [n.material].flat()) names.add(m.name); });
  assert.deepEqual([...names].sort(), ['grey', 'red'], 'the .mtl inside the zip was used');

  const pick = (files) => unpackBundle({ name: 'b.zip', bytes: zipSync(Object.fromEntries(files.map((f) => [f, strToU8('x')]))) }).name;
  assert.equal(pick(['a.obj', 'deep/er/b.glb', 'c.fbx']), 'b.glb', 'glTF first');
  assert.equal(pick(['a.obj', 'c.fbx', 'd.dae']), 'c.fbx');
  assert.equal(pick(['a.stl', 'x/a.obj', 'd.dae']), 'a.obj');
  assert.equal(pick(['x/y/a.stl', 'a.ply']), 'a.ply', 'shallowest among equals');
  const kmz = unpackBundle({ name: 'm.kmz', bytes: zipSync({ 'doc.kml': strToU8('<kml><Placemark><Model><Link><href>models/b.dae</href></Link></Model></Placemark></kml>'), 'models/a.dae': strToU8('a'), 'models/b.dae': strToU8('b'), 'images/t.png': strToU8('p') }) });
  assert.equal(kmz.name, 'b.dae', 'KMZ: the model the KML names');
  assert.ok(kmz.related.has('images/t.png') && kmz.related.has('doc.kml'));
  const sampleKmz = unpackBundle({ name: 'chair.kmz', bytes: sample('chair.kmz') });
  assert.equal(sampleKmz.name, 'chair.dae');
  assert.ok(sampleKmz.related.has('images/wood.png'));

  await assert.rejects(importModel({ name: 'pics.zip', bytes: zipSync({ 'a.png': strToU8('p') }) }), (err) => err.code === 'zip-no-model');
  await assert.rejects(importModel({ name: 'sk.zip', bytes: zipSync({ 'house.skp': strToU8('s') }) }), (err) => err.code === 'skp-unsupported');
  await assert.rejects(importModel({ name: 'bad.zip', bytes: strToU8('not a zip') }), (err) => err.code === 'parse-failed');
});

test('Draco / KTX2 / Rhino helpers: extensions read from the header, units, RGBA textures uncompressed', () => {
  assert.ok(gltfExtensions(sample('chair-draco.glb')).has('KHR_draco_mesh_compression'));
  assert.ok(gltfExtensions(sample('chair-ktx2.glb')).has('KHR_texture_basisu'));
  assert.equal(gltfExtensions(strToU8('{"asset":{"version":"2.0"}}')).size, 0);
  assert.equal(gltfExtensions(strToU8('not json')).size, 0);
  assert.equal(fixture('etc1s.ktx2')[1], 0x4b, 'KTX2 fixture present');

  assert.equal(rhinoUnits({ name: 'UnitSystem', value: 2 }), 'mm');
  assert.equal(rhinoUnits(4), 'm');
  assert.equal(rhinoUnits('Inches'), 'in');
  assert.equal(rhinoUnits(0), null);

  const data = new Uint8Array(2 * 2 * 4).fill(200);
  const compressed = new THREE.CompressedTexture([{ data, width: 2, height: 2 }], 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  compressed.colorSpace = THREE.SRGBColorSpace; compressed.flipY = false;
  const material = new THREE.MeshStandardMaterial({ map: compressed, roughnessMap: compressed });
  const holder = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  uncompressTextures(holder);
  assert.ok(material.map.isDataTexture && !material.map.isCompressedTexture);
  assert.equal(material.map, material.roughnessMap, 'shared texture stays shared');
  assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(material.map.flipY, false);
  assert.equal(material.map.image.data, data);
});

test('mergeByMaterial keeps point clouds next to merged meshes', () => {
  const root = new THREE.Group();
  const m = new THREE.MeshStandardMaterial();
  for (let i = 0; i < 70; i++) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), m); mesh.position.x = i * 0.2; root.add(mesh); }
  root.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3)), new THREE.PointsMaterial()));
  const merged = mergeByMaterial(root);
  let meshes = 0, points = 0;
  merged.traverse((n) => { if (n.isMesh) meshes++; if (n.isPoints) points++; });
  assert.equal(meshes, 1);
  assert.equal(points, 1);
});
