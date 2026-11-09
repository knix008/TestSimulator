// 3D import/export (src/io): real loaders on small fixtures (test/fixtures/io) where they run without a
// DOM (STL, OBJ+MTL, PLY, GLB built in-test), plus the pure steps: unit guessing, up axis, centring,
// material conversion and merging. Run: node --test test/unit/io.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { EXPORT_FORMATS, IMPORT_FORMATS, dialogFilters, importAccept, importFormatOf } from '../../src/io/formats.js';
import { computeStats, convertMaterials, detectFormat, guessUnits, importModel, mergeByMaterial, normalizeObject, resolveUpAxis, toStandardMaterial } from '../../src/io/import.js';
import { exportModel, objWithMaterials } from '../../src/io/export.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'io');
const read = (name) => new Uint8Array(fs.readFileSync(path.join(fixtures, name)));
const near = (actual, expected, tolerance = 1e-3) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const nearAll = (actual, expected, tolerance) => expected.forEach((v, i) => near(actual[i], v, tolerance));

// GLTFExporter reads Blobs with FileReader, which Node lacks: a minimal one on top of Blob.arrayBuffer().
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.({ target: this }); this.onload?.({ target: this }); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.({ target: this }); this.onload?.({ target: this }); }); }
  };
}

// FileLoader (glTF data: URIs) reports progress with ProgressEvent, a browser-only class.
globalThis.ProgressEvent ??= class extends Event { constructor(type, init = {}) { super(type); Object.assign(this, init); } };

function bottomCentred(object, tolerance = 1e-4) {
  const box = new THREE.Box3().setFromObject(object);
  near(box.min.y, 0, tolerance);
  near((box.min.x + box.max.x) / 2, 0, tolerance);
  near((box.min.z + box.max.z) / 2, 0, tolerance);
}

test('formats: lists, accept string and dialog filters', () => {
  for (const id of ['gltf', 'obj', 'fbx', 'dae', 'stl', '3ds', 'ply', '3mf', 'usdz']) assert.ok(IMPORT_FORMATS.some((f) => f.id === id), id);
  for (const id of ['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz']) assert.ok(EXPORT_FORMATS.some((f) => f.id === id), id);
  for (const f of [...IMPORT_FORMATS, ...EXPORT_FORMATS]) assert.ok(f.ko && f.en && f.ext && f.mime, f.id);
  assert.match(importAccept(), /\.glb/);
  assert.match(importAccept(), /\.mtl/);
  assert.equal(importFormatOf('Chair.GLB').id, 'gltf');
  assert.equal(importFormatOf('x.unknown'), null);
  assert.equal(dialogFilters('ko')[0].name, '모든 3D 모델');
});

test('detectFormat: extensions, GLB magic, SketchUp and unknown files', () => {
  assert.equal(detectFormat('a.obj'), 'obj');
  assert.equal(detectFormat('scan.PLY'), 'ply');
  assert.equal(detectFormat('model.bin', new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])), 'gltf');
  assert.throws(() => detectFormat('house.skp'), (err) => err.code === 'skp-unsupported' && /Collada|glTF/.test(err.message) && /SketchUp/.test(err.ko));
  assert.throws(() => detectFormat('notes.txt'), (err) => err.code === 'format-unsupported');
});

test('guessUnits: size-based guesses with format priors', () => {
  assert.equal(guessUnits(2000), 'mm');   // a sofa 2000 units wide
  assert.equal(guessUnits(85), 'cm');     // a chair 85 units tall
  assert.equal(guessUnits(2.2), 'm');
  assert.equal(guessUnits(2.2, 'm'), 'm');
  assert.equal(guessUnits(250, 'm'), 'cm'); // a "metres" glTF 250 m wide is really cm
  assert.equal(guessUnits(300, 'mm'), 'mm');
  assert.equal(guessUnits(1.5, 'mm'), 'm');
  assert.equal(guessUnits(0), 'm');
  assert.equal(resolveUpAxis('auto', 'stl'), 'z');
  assert.equal(resolveUpAxis('auto', 'gltf'), 'y');
  assert.equal(resolveUpAxis('y', 'stl'), 'y');
});

test('normalizeObject: Z-up → Y-up, units, bottom centre at the origin', () => {
  // 20 × 30 × 40 in (x, y, z), Z up, sitting off-centre.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 40).translate(100, 50, 20), new THREE.MeshStandardMaterial());
  const { group, units, unitsGuessed, upAxis, sizeMeters } = normalizeObject(mesh, { units: 'in', upAxis: 'z' });
  assert.equal(units, 'in');
  assert.equal(unitsGuessed, false);
  assert.equal(upAxis, 'z');
  nearAll(sizeMeters, [20 * 0.0254, 40 * 0.0254, 30 * 0.0254], 1e-4); // the file's z (40) is now the height
  bottomCentred(group);
  // Front: the file's −Y side faces +Z after the rotation.
  const probe = new THREE.Vector3(0, -1, 0).applyEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  nearAll(probe.toArray(), [0, 0, 1]);
  // center: false keeps the position.
  const kept = normalizeObject(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(5, 5, 5)), { units: 'm', upAxis: 'y', center: false });
  near(new THREE.Box3().setFromObject(kept.group).min.x, 4.5);
});

test('materials: Phong/Lambert become MeshStandardMaterial keeping colour, maps and transparency', () => {
  const map = new THREE.Texture();
  const phong = new THREE.MeshPhongMaterial({ color: 0x336699, shininess: 100, map, transparent: true, opacity: 0.5, side: THREE.DoubleSide, name: 'blue' });
  const standard = toStandardMaterial(phong);
  assert.ok(standard.isMeshStandardMaterial);
  assert.equal(standard.color.getHex(), 0x336699);
  assert.equal(standard.map, map);
  assert.equal(standard.name, 'blue');
  assert.equal(standard.transparent, true);
  near(standard.opacity, 0.5);
  assert.equal(standard.side, THREE.DoubleSide);
  near(standard.roughness, Math.sqrt(2 / 102));
  assert.equal(toStandardMaterial(new THREE.MeshLambertMaterial()).roughness, 1);
  const physical = new THREE.MeshPhysicalMaterial();
  assert.equal(toStandardMaterial(physical), physical);
  // Shared materials stay shared; missing normals are computed.
  const shared = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  const group = new THREE.Group().add(new THREE.Mesh(geometry, shared), new THREE.Mesh(new THREE.BoxGeometry(), shared));
  assert.equal(convertMaterials(group), 1);
  assert.equal(group.children[0].material, group.children[1].material);
  assert.ok(group.children[0].geometry.attributes.normal);
  assert.ok(group.children[0].castShadow && group.children[0].receiveShadow);
});

test('mergeByMaterial: thousands of tiny meshes become one mesh per material', () => {
  const a = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const b = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const root = new THREE.Group();
  const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < 1000; i++) {
    const mesh = new THREE.Mesh(box, i % 2 ? a : b);
    mesh.position.set(i % 10, Math.floor(i / 100), Math.floor(i / 10) % 10);
    mesh.rotation.y = i * 0.1;
    const parent = new THREE.Group();
    parent.position.x = 0.5;
    parent.add(mesh);
    root.add(parent);
  }
  const before = computeStats(root);
  const merged = mergeByMaterial(root);
  const after = computeStats(merged);
  assert.equal(after.meshes, 2);
  assert.equal(after.materials, 2);
  assert.equal(after.triangles, before.triangles);
  nearAll(after.sizeMeters, before.sizeMeters, 1e-4);
});

test('import STL (ASCII and binary): millimetres, Z up → 2 × 0.8 × 1 m, centred', async () => {
  for (const name of ['box_mm_zup_ascii.stl', 'box_mm_zup_binary.stl']) {
    const phases = [];
    const { object, stats, warnings } = await importModel({ name, bytes: read(name) }, { onProgress: (f, phase) => phases.push([f, phase]) });
    assert.equal(stats.units, 'mm', name);
    assert.equal(stats.upAxis, 'z');
    assert.equal(stats.triangles, 12);
    assert.equal(stats.meshes, 1);
    nearAll(stats.sizeMeters, [2, 0.8, 1], 1e-4);
    bottomCentred(object);
    assert.ok(warnings.some((w) => w.code === 'units-guessed'));
    assert.deepEqual(phases.at(-1), [1, 'done']);
    assert.ok(phases.every(([f], i) => i === 0 || f >= phases[i - 1][0]), 'progress only grows');
    object.traverse((n) => { if (n.isMesh) assert.ok(n.material.isMeshStandardMaterial && n.geometry.attributes.normal); });
  }
  // Explicit units/axis override the guesses.
  const { stats } = await importModel({ name: 'box.stl', bytes: read('box_mm_zup_binary.stl') }, { units: 'cm', upAxis: 'y' });
  nearAll(stats.sizeMeters, [20, 10, 8], 1e-3);
});

test('import OBJ + MTL from related files: centimetres → 1 m cube, two converted materials, normals computed', async () => {
  const related = new Map([['cube.mtl', read('cube.mtl')]]);
  const { object, stats } = await importModel({ name: 'cube_cm.obj', bytes: read('cube_cm.obj'), related });
  assert.equal(stats.units, 'cm');
  nearAll(stats.sizeMeters, [1, 1, 1], 1e-4);
  assert.equal(stats.triangles, 12);
  bottomCentred(object);
  const materials = new Map();
  object.traverse((n) => {
    if (!n.isMesh) return;
    assert.ok(n.geometry.attributes.normal);
    for (const m of [n.material].flat()) materials.set(m.name, m);
  });
  assert.deepEqual([...materials.keys()].sort(), ['grey', 'red']);
  for (const m of materials.values()) assert.ok(m.isMeshStandardMaterial);
  const red = materials.get('red');
  near(red.color.r, new THREE.Color().setRGB(0.8, 0.1, 0.1, THREE.SRGBColorSpace).r, 0.02);
  assert.ok(red.roughness < materials.get('grey').roughness, 'shinier Phong → lower roughness');
  // Without the MTL it still imports (default materials).
  const plain = await importModel({ name: 'cube_cm.obj', bytes: read('cube_cm.obj') });
  assert.equal(plain.stats.triangles, 12);
});

test('import PLY: vertex colours kept, Z up, metres', async () => {
  const { object, stats } = await importModel({ name: 'box_m_zup.ply', bytes: read('box_m_zup.ply') });
  assert.equal(stats.units, 'm');
  nearAll(stats.sizeMeters, [0.4, 0.2, 0.3], 1e-4);
  assert.equal(stats.triangles, 12);
  let mesh; object.traverse((n) => { if (n.isMesh) mesh = n; });
  assert.ok(mesh.geometry.attributes.color);
  assert.equal(mesh.material.vertexColors, true);
});

test('import .skp and unknown formats reject with a code', async () => {
  await assert.rejects(importModel({ name: 'chair.skp', bytes: read('chair.skp') }), (err) => err.code === 'skp-unsupported');
  await assert.rejects(importModel({ name: 'x.docx', bytes: new Uint8Array(4) }), (err) => err.code === 'format-unsupported');
  await assert.rejects(importModel({ name: 'broken.glb', bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]) }), (err) => err.code === 'parse-failed');
});

test('import optimise toggle: many meshes merged only when optimize is on', async () => {
  // Build a GLB with 300 separate meshes (2 materials) in-test, then import it.
  const root = new THREE.Group();
  const mats = [new THREE.MeshStandardMaterial({ color: 0x884422, name: 'wood' }), new THREE.MeshStandardMaterial({ color: 0x222222, name: 'metal' })];
  for (let i = 0; i < 300; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), mats[i % 2]);
    mesh.position.set((i % 20) * 0.05, Math.floor(i / 20) * 0.05, 0);
    root.add(mesh);
  }
  const { bytes } = await exportModel(root, 'glb');
  const merged = await importModel({ name: 'parts.glb', bytes }, { optimize: true });
  assert.equal(merged.stats.meshes, 2);
  assert.equal(merged.stats.triangles, 300 * 12);
  assert.ok(merged.warnings.some((w) => w.code === 'merged'));
  const separate = await importModel({ name: 'parts.glb', bytes }, { optimize: false });
  assert.equal(separate.stats.meshes, 300);
  nearAll(merged.stats.sizeMeters, separate.stats.sizeMeters, 1e-4);
});

test('export → import round trips: GLB, glTF, STL (mm, Z up), PLY, OBJ', async () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x3366cc, roughness: 0.4, name: 'Blue paint' });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.75, 0.6).translate(0, 0.375, 0), material);
  box.name = 'desk';
  const scene = new THREE.Group().add(box);

  const glb = await exportModel(scene, 'glb');
  assert.equal(glb.ext, 'glb');
  assert.equal(String.fromCharCode(...glb.bytes.slice(0, 4)), 'glTF');
  const back = await importModel({ name: 'desk.glb', bytes: glb.bytes });
  nearAll(back.stats.sizeMeters, [1.2, 0.75, 0.6], 1e-4);
  assert.equal(back.stats.units, 'm');
  let mat; back.object.traverse((n) => { if (n.isMesh) mat = n.material; });
  assert.equal(mat.color.getHex(), 0x3366cc);

  const gltf = await exportModel(scene, 'gltf');
  assert.equal(JSON.parse(new TextDecoder().decode(gltf.bytes)).asset.version, '2.0');
  nearAll((await importModel({ name: 'desk.gltf', bytes: gltf.bytes })).stats.sizeMeters, [1.2, 0.75, 0.6], 1e-4);

  const stl = await exportModel(scene, 'stl', { units: 'mm', upAxis: 'z' });
  assert.equal(stl.bytes.length, 84 + 12 * 50);
  const stlBack = await importModel({ name: 'desk.stl', bytes: stl.bytes });
  assert.equal(stlBack.stats.units, 'mm');
  nearAll(stlBack.stats.sizeMeters, [1.2, 0.75, 0.6], 1e-4);

  const ply = await exportModel(scene, 'ply');
  nearAll((await importModel({ name: 'desk.ply', bytes: ply.bytes }, { upAxis: 'y' })).stats.sizeMeters, [1.2, 0.75, 0.6], 1e-4);

  const obj = await exportModel(scene, 'obj');
  const objText = new TextDecoder().decode(obj.bytes);
  assert.match(objText, /usemtl Blue_paint/);
  nearAll((await importModel({ name: 'desk.obj', bytes: obj.bytes }, { units: 'm' })).stats.sizeMeters, [1.2, 0.75, 0.6], 1e-4);

  const zipped = await exportModel(scene, 'obj', { mtl: true, name: 'desk' });
  assert.equal(zipped.ext, 'zip');
  const { unzipSync } = await import('fflate');
  const files = unzipSync(zipped.bytes);
  assert.deepEqual(Object.keys(files).sort(), ['desk.mtl', 'desk.obj']);
  const mtl = new TextDecoder().decode(files['desk.mtl']);
  assert.match(mtl, /newmtl Blue_paint/);
  assert.match(new TextDecoder().decode(files['desk.obj']), /^mtllib desk\.mtl/);
  // The source object is untouched.
  assert.equal(box.parent, scene);
  assert.equal(scene.parent, null);
  await assert.rejects(exportModel(scene, 'xyz'), (err) => err.code === 'export-format-unsupported');
});

test('objWithMaterials: one usemtl per mesh with unique names', async () => {
  const a = new THREE.MeshStandardMaterial({ name: 'same' });
  const b = new THREE.MeshStandardMaterial({ name: 'same' });
  const group = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), b), new THREE.Mesh(new THREE.BoxGeometry(), a));
  const { obj, mtl } = await objWithMaterials(group, 'x');
  assert.deepEqual(obj.match(/^usemtl .+$/gm), ['usemtl same', 'usemtl same_2', 'usemtl same']);
  assert.equal(mtl.match(/^newmtl /gm).length, 2);
});
