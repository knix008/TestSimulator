// glTF as a scene: hierarchy, materials, skins, animation, cameras and lights; binary PLY; USDZ.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Vector3 } from 'three';
import { insertKey } from '../../src/core/anim.js';
import { createArmature, createBone } from '../../src/core/armature.js';
import { addObject, createDocument, defaultCamera, defaultLight, defaultMaterial, evaluatedMesh, getMaterial, setFrame, worldMatrix } from '../../src/core/doc.js';
import { exportUSDZ, importUSDA } from '../../src/core/formats.js';
import { exportGLTFScene, importGLTFScene } from '../../src/core/gltf.js';
import { exportFBXScene, importFBXScene } from '../../src/core/fbxscene.js';
import { exportPLYBinary, importPLYAny } from '../../src/core/io.js';
import { cubeMesh, signedVolume } from '../../src/core/mesh.js';
import { createModifier } from '../../src/core/modifiers.js';
import { addLink, createNode, defaultShaderGraph } from '../../src/core/nodes.js';
import { encodePNGDataUrl } from '../../src/core/paint.js';

const close = (a, b, tolerance = 1e-4) => assert.ok(a.every((v, i) => Math.abs(v - b[i]) <= tolerance), `${a} against ${b}`);
const placeOf = (doc, o) => new Vector3().setFromMatrixPosition(worldMatrix(doc, o)).toArray();
const roundTrip = (doc) => { const next = createDocument(); next.fps = doc.fps; const made = importGLTFScene(next, exportGLTFScene(doc)); return { next, made }; };

describe('glTF scene', () => {
  test('hierarchy, transforms and shape survive, Z up staying Z up', () => {
    const doc = createDocument();
    const parent = addObject(doc, { type: 'MESH', name: 'Parent', data: cubeMesh(2), location: [1, 2, 3], rotation: [10, 20, 30], scale: [1, 2, 1] });
    const child = addObject(doc, { type: 'EMPTY', name: 'Child', location: [0, 0, 5], parent: parent.id });
    const { next, made } = roundTrip(doc);
    assert.deepEqual(made.map((o) => o.name), ['Parent', 'Child']);
    assert.equal(made[1].parent, made[0].id);
    close(placeOf(next, made[1]), placeOf(doc, child));
    const a = worldMatrix(doc, parent).elements;
    const b = worldMatrix(next, made[0]).elements;
    close([...b], [...a], 1e-4);
    assert.ok(signedVolume(evaluatedMesh(next, made[0])) > 0);
  });
  test('materials: colour, metal, roughness, and a texture wired to the base colour', () => {
    const doc = createDocument();
    const plain = { ...defaultMaterial('Plain'), baseColor: [0.2, 0.4, 0.6], metallic: 0.3, roughness: 0.7 };
    const painted = defaultMaterial('Painted');
    const rgba = new Uint8ClampedArray(16).fill(200);
    doc.images = [{ id: 'i1', name: 'Tex', dataUrl: encodePNGDataUrl({ width: 2, height: 2, rgba }) }];
    painted.useNodes = true;
    painted.nodes = defaultShaderGraph(painted);
    const bsdf = painted.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    const node = createNode('TEX_IMAGE', 0, 0, { image: 'i1' });
    painted.nodes.nodes.push(node);
    addLink(painted.nodes, node.id, 'Color', bsdf.id, 'Base Color');
    doc.materials.push(plain, painted);
    addObject(doc, { type: 'MESH', name: 'A', data: cubeMesh(1), materials: [plain.id] });
    addObject(doc, { type: 'MESH', name: 'B', data: cubeMesh(1), materials: [painted.id] });
    const { next, made } = roundTrip(doc);
    const m = getMaterial(next, made[0].materials[0]);
    close(m.baseColor, plain.baseColor);
    close([m.metallic, m.roughness], [0.3, 0.7]);
    const t = getMaterial(next, made[1].materials[0]);
    assert.ok(t.useNodes);
    const tex = t.nodes.nodes.find((n) => n.type === 'TEX_IMAGE');
    assert.ok(t.nodes.links.some((l) => l.from === tex.id && l.in === 'Base Color'));
    assert.equal(next.images.find((i) => i.id === tex.values.image).dataUrl, doc.images[0].dataUrl);
  });
  test('object animation plays the same, at every frame', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'Mover', data: cubeMesh(1) });
    insertKey(o, 'location.0', 1, 0);
    insertKey(o, 'location.0', 21, 5);
    insertKey(o, 'rotation.2', 1, 0);
    insertKey(o, 'rotation.2', 21, 90);
    const { next, made } = roundTrip(doc);
    for (const f of [1, 6, 11, 21]) {
      setFrame(doc, f);
      setFrame(next, f);
      close([...worldMatrix(next, made[0]).elements], [...worldMatrix(doc, o).elements], 1e-3);
    }
  });
  test('a skinned mesh bends the same after the trip, weights and bones included', () => {
    const doc = createDocument();
    const arm = createArmature();
    arm.bones[0].name = 'Low';
    arm.bones[0].tail = [0, 0, 1];
    arm.bones.push(createBone('High', [0, 0, 1], [0, 0, 2], 0));
    const rig = addObject(doc, { type: 'ARMATURE', name: 'Rig', data: arm, location: [1, 0, 0] });
    const mesh = cubeMesh(1);
    mesh.verts = mesh.verts.map((v) => [v[0] + 1, v[1], v[2] + 1.5]);
    mesh.vgroups = [{ name: 'Low', w: {} }, { name: 'High', w: Object.fromEntries(mesh.verts.map((_, i) => [i, 1])) }];
    const body = addObject(doc, { type: 'MESH', name: 'Body', data: mesh, modifiers: [{ ...createModifier('ARMATURE'), object: rig.id }] });
    insertKey(arm, 'bones.1.pose.rotation.0', 1, 0, 'LINEAR');
    insertKey(arm, 'bones.1.pose.rotation.0', 11, 60, 'LINEAR');
    const { next, made } = roundTrip(doc);
    const armature = made.find((o) => o.type === 'ARMATURE');
    assert.equal(armature.data.bones.length, 2);
    assert.equal(armature.data.bones[1].parent, 0);
    const skinned = made.find((o) => o.modifiers?.some((m) => m.type === 'ARMATURE'));
    assert.ok(skinned, 'bound to the armature');
    const worldVerts = (d, o) => { const m = worldMatrix(d, o); return evaluatedMesh(d, o).verts.map((v) => new Vector3(...v).applyMatrix4(m).toArray()); };
    const extent = (list) => [0, 1, 2].flatMap((k) => [Math.min(...list.map((p) => p[k])), Math.max(...list.map((p) => p[k]))]);
    for (const f of [1, 6, 11]) {
      setFrame(doc, f);
      setFrame(next, f);
      close(extent(worldVerts(next, skinned)), extent(worldVerts(doc, body)), 2e-3);
    }
    void rig;
  });
  test('cameras and lights keep where they look and how strong they are', () => {
    const doc = createDocument();
    const cam = addObject(doc, { type: 'CAMERA', name: 'Eye', location: [1, -5, 2], rotation: [80, 0, 15], data: { ...defaultCamera(), lens: 35 } });
    const lamp = addObject(doc, { type: 'LIGHT', name: 'Lamp', location: [0, 0, 3], data: { ...defaultLight('POINT'), energy: 250, color: [1, 0.5, 0.25] } });
    const sun = addObject(doc, { type: 'LIGHT', name: 'Sun', rotation: [30, 0, 0], data: { ...defaultLight('SUN'), energy: 4 } });
    const { next, made } = roundTrip(doc);
    const by = (name) => made.find((o) => o.name === name);
    close([...worldMatrix(next, by('Eye')).elements], [...worldMatrix(doc, cam).elements], 1e-3);
    close([by('Eye').data.lens], [35], 1e-3);
    close([by('Lamp').data.energy], [250], 1e-3);
    close(by('Lamp').data.color, lamp.data.color);
    assert.equal(by('Sun').data.kind, 'SUN');
    close([by('Sun').data.energy], [4]);
    close([...worldMatrix(next, by('Sun')).elements], [...worldMatrix(doc, sun).elements], 1e-3);
  });
  test('morph targets become shape keys', () => {
    const doc = createDocument();
    const mesh = cubeMesh(2);
    mesh.shapeKeys = [{ name: 'Tall', value: 0.25, verts: mesh.verts.map((v) => [v[0], v[1], v[2] * 2]) }];
    addObject(doc, { type: 'MESH', name: 'K', data: mesh });
    const { made } = roundTrip(doc);
    const keys = made[0].data.shapeKeys;
    assert.equal(keys.length, 1);
    assert.equal(keys[0].name, 'Tall');
    assert.equal(keys[0].value, 0.25);
    assert.equal(Math.max(...keys[0].verts.map((v) => v[2])), 2);
  });
  test('what cannot be read says why', () => {
    const doc = createDocument();
    const text = (o) => new TextEncoder().encode(JSON.stringify(o));
    assert.throws(() => importGLTFScene(doc, text({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression'] })), /draco/i);
    assert.throws(() => importGLTFScene(doc, text({ asset: { version: '2.0' }, buffers: [{ uri: 'data.bin', byteLength: 4 }] })), /separate file/);
    assert.throws(() => importGLTFScene(doc, text({ nothing: true })), /Not a glTF/);
  });
});

describe('other formats', () => {
  test('binary PLY round trip, with colours and quads', () => {
    const mesh = cubeMesh(2);
    mesh.colors = mesh.verts.map(() => [1, 0.5, 0]);
    const [back] = importPLYAny(exportPLYBinary([{ name: 'A', mesh }]));
    assert.equal(back.mesh.faces.length, 6);
    assert.equal(back.mesh.faces[0].length, 4);
    close(back.mesh.verts[3], mesh.verts[3]);
    close(back.mesh.colors[0], [1, 128 / 255, 0], 0.01);
  });
  test('a big-endian PLY reads too, and an ASCII one still does', () => {
    const head = 'ply\nformat binary_big_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n';
    const text = new TextEncoder().encode(head);
    const out = new Uint8Array(text.length + 36 + 13);
    out.set(text);
    const v = new DataView(out.buffer);
    let at = text.length;
    for (const p of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) for (const c of p) { v.setFloat32(at, c); at += 4; }
    v.setUint8(at, 3); at += 1;
    for (const i of [0, 1, 2]) { v.setInt32(at, i); at += 4; }
    const [m] = importPLYAny(out);
    assert.deepEqual(m.mesh.verts[1], [1, 0, 0]);
    assert.deepEqual(m.mesh.faces[0], [0, 1, 2]);
    const ascii = new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n');
    assert.equal(importPLYAny(ascii)[0].mesh.faces.length, 1);
  });
  test('USDZ: a stored zip, its data on a 64 byte boundary, and it reads back', () => {
    const bytes = exportUSDZ([{ name: 'Box', mesh: cubeMesh(2) }]);
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
    const view = new DataView(bytes.buffer);
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    assert.equal(start % 64, 0);
    const [o] = importUSDA(bytes);
    assert.equal(o.mesh.faces.length, 6);
    assert.ok(Math.abs(signedVolume(o.mesh) - 8) < 1e-6);
  });
});

describe('FBX scene', () => {
  const rig = () => {
    const doc = createDocument();
    doc.fps = 24;
    const mesh = cubeMesh(1);
    mesh.verts = mesh.verts.map((v) => [v[0], v[1], v[2] + 1]);
    mesh.vgroups = [{ name: 'Up', w: Object.fromEntries(mesh.verts.map((_, i) => [i, 1])) }];
    const arm = addObject(doc, { type: 'ARMATURE', name: 'Rig', data: { bones: [createBone('Up', [0, 0, 0], [0, 0, 1], null)] } });
    const box = addObject(doc, { type: 'MESH', name: 'Box', data: mesh, modifiers: [{ ...createModifier('ARMATURE'), object: arm.id }] });
    insertKey(arm.data, 'bones.0.pose.rotation.0', 1, 0, 'LINEAR');
    insertKey(arm.data, 'bones.0.pose.rotation.0', 11, 60, 'LINEAR');
    return { doc, box };
  };
  const extent = (doc, o, frame) => {
    setFrame(doc, frame);
    const points = evaluatedMesh(doc, o, { render: true }).verts.map((v) => new Vector3(...v).applyMatrix4(worldMatrix(doc, o)).toArray());
    return [0, 1, 2].flatMap((k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))]);
  };
  test('a skinned, keyed mesh bends the same after a round trip', () => {
    const { doc, box } = rig();
    const next = createDocument();
    next.fps = 24;
    const made = importFBXScene(next, exportFBXScene(doc));
    const arm = made.find((o) => o.type === 'ARMATURE');
    assert.deepEqual(arm.data.bones.map((b) => b.name), ['Up']);
    const back = made.find((o) => o.name === 'Box');
    assert.equal(back.modifiers[0].type, 'ARMATURE');
    assert.equal(back.modifiers[0].object, arm.id);
    for (const frame of [1, 6, 11]) close(extent(next, back, frame), extent(doc, box, frame), 1e-3);
  });
  test('parents, places, colours and textures survive', () => {
    const doc = createDocument();
    const mat = { ...defaultMaterial('Blue'), baseColor: [0.1, 0.2, 0.9], roughness: 0.4 };
    doc.images = [{ id: 'i1', name: 'Tex', dataUrl: encodePNGDataUrl(2, 2, new Uint8Array(16).fill(200)) }];
    mat.useNodes = true;
    mat.nodes = defaultShaderGraph(mat);
    const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    const tex = createNode('TEX_IMAGE', 0, 0, { image: 'i1' });
    mat.nodes.nodes.push(tex);
    addLink(mat.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    doc.materials.push(mat);
    const parent = addObject(doc, { type: 'MESH', name: 'P', data: cubeMesh(2), materials: [mat.id], location: [1, 2, 3], rotation: [10, 20, 30] });
    const child = addObject(doc, { type: 'EMPTY', name: 'C', location: [0, 0, 4], parent: parent.id });
    const next = createDocument();
    const made = importFBXScene(next, exportFBXScene(doc));
    const [p2, c2] = ['P', 'C'].map((n) => made.find((o) => o.name === n));
    assert.equal(c2.parent, p2.id);
    close(placeOf(next, c2), placeOf(doc, child));
    const m2 = getMaterial(next, p2.materials[0]);
    close(m2.baseColor, mat.baseColor);
    assert.ok(Math.abs(m2.roughness - 0.4) < 1e-6);
    assert.ok(m2.useNodes && next.images?.length === 1, 'the picture came along');
  });
  test('keys on an object move it the same, at the same frames', () => {
    const doc = createDocument();
    doc.fps = 24;
    const o = addObject(doc, { type: 'EMPTY', name: 'E', location: [0, 0, 0] });
    insertKey(o, 'location.0', 1, 0, 'LINEAR');
    insertKey(o, 'location.0', 11, 5, 'LINEAR');
    const next = createDocument();
    next.fps = 24;
    const [back] = importFBXScene(next, exportFBXScene(doc));
    for (const frame of [1, 6, 11]) { setFrame(doc, frame); setFrame(next, frame); close(placeOf(next, back), placeOf(doc, o), 1e-3); }
  });
});
