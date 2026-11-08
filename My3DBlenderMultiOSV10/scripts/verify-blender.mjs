// npm run verify:blender -- <path to blender> : checks the file formats against a real Blender, in both directions.
//   1. Our exports are opened by Blender, and what it finds is compared with what was written.
//   2. Blender writes a known scene, and our importers read it, compared with what Blender reports about it.
// Blender runs in background mode with its user folders pointed at a temporary one. It is not part of `npm test`, which needs no Blender.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importBlend } from '../src/core/blendfile.js';
import { exportDAE, exportFBX, exportUSDA, exportUSDZ, importDAE, importFBX, importUSDA } from '../src/core/formats.js';
import { exportGLB, exportOBJ, exportPLY, exportPLYBinary, exportSTLBinary, importGLB, importOBJ } from '../src/core/io.js';
import { cubeMesh, signedVolume, torusMesh, uvSphereMesh } from '../src/core/mesh.js';
import { Vector3 } from 'three';
import { insertKey } from '../src/core/anim.js';
import { bonePoseMatrices, createArmature, createBone, posedBone } from '../src/core/armature.js';
import { addObject, createConstraint, createDocument, defaultCamera, defaultLight, defaultMaterial, evaluatedArmature, evaluatedMesh, setFrame, worldMatrix } from '../src/core/doc.js';
import { exportGLTFScene, importGLTFScene } from '../src/core/gltf.js';
import { exportFBXScene, importFBXScene } from '../src/core/fbxscene.js';
import { exportDAEScene, importDAEScene } from '../src/core/daescene.js';
import { importBlendScene } from '../src/core/blendscene.js';
import * as usdSceneModule from '../src/core/usdscene.js';
import { unwrapSeams } from '../src/core/unwrap.js';
import { createModifier } from '../src/core/modifiers.js';
import { addLink, createNode, defaultShaderGraph } from '../src/core/nodes.js';
import { encodePNG } from '../src/core/paint.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const blender = process.argv[2];
if (!blender || !fs.existsSync(blender)) { console.error('Usage: npm run verify:blender -- <path to blender>'); process.exit(2); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'my3d-blender-'));
const ours = path.join(work, 'ours');
const theirs = path.join(work, 'theirs');
fs.mkdirSync(ours);
fs.mkdirSync(theirs);
const profile = path.join(work, 'profile');
fs.mkdirSync(profile);
const env = { ...process.env, BLENDER_USER_RESOURCES: profile, BLENDER_USER_CONFIG: profile, BLENDER_USER_SCRIPTS: profile, BLENDER_USER_DATAFILES: profile };
const v3Length = (b) => Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]);
const runBlender = (mode, folder, ...more) => execFileSync(blender, ['-b', '--factory-startup', '--python-exit-code', '3', '--python', path.join(here, 'verify-blender.py'), '--', mode, folder, ...more], { env, stdio: 'pipe', maxBuffer: 1 << 28 });

let failed = 0;
const line = (ok, name, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); };
const near = (a, b, tolerance = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const box = (mesh) => { const low = [Infinity, Infinity, Infinity]; const high = [-Infinity, -Infinity, -Infinity]; for (const v of mesh.verts) for (let i = 0; i < 3; i++) { low[i] = Math.min(low[i], v[i]); high[i] = Math.max(high[i], v[i]); } return { low, high }; };

// ── 1. Ours into Blender
const moved = (mesh, [x, y, z]) => ({ ...mesh, verts: mesh.verts.map((v) => [v[0] + x, v[1] + y, v[2] + z]) });
const OBJECTS = [
  { name: 'Box', mesh: moved(cubeMesh(2), [1, 2, 3]), material: { baseColor: [0.8, 0.2, 0.1] } },
  { name: 'Ring', mesh: moved(torusMesh(24, 8, 2, 0.5), [-4, 0, 1]), material: { baseColor: [0.1, 0.5, 0.8] } },
  { name: 'Ball', mesh: moved(uvSphereMesh(16, 8, 1.5), [0, -5, 0]), material: { baseColor: [0.2, 0.7, 0.3] } },
];
const write = (name, data) => fs.writeFileSync(path.join(ours, name), data);
write('ours.obj', exportOBJ(OBJECTS));
write('ours.stl', exportSTLBinary(OBJECTS));
write('ours.ply', exportPLY(OBJECTS));
write('ours.glb', exportGLB(OBJECTS));
write('ours.fbx', exportFBX(OBJECTS));
write('ours.dae', exportDAE(OBJECTS));
write('ours.usda', exportUSDA(OBJECTS));
write('ours-z.usdz', exportUSDZ(OBJECTS));
write('ours-bin.ply', exportPLYBinary(OBJECTS));
let exportABC = null;
try { ({ exportABC } = await import('../src/core/alembic.js')); write('ours.abc', exportABC(OBJECTS)); } catch { console.log('  (Alembic is not there yet)'); }

console.log('Our files, read by Blender:');
runBlender('read', ours);
const report = JSON.parse(fs.readFileSync(path.join(ours, 'report.json'), 'utf8'));
for (const [file, r] of Object.entries(report)) {
  if (r.error) { line(false, file, r.error.split('\n')[0].slice(0, 160)); continue; }
  // STL and PLY are one mesh, and their vertices are welded differently: only the whole shape is compared for them.
  const whole = /\.(stl|ply)$/.test(file);
  const problems = [];
  if (whole) {
    const low = [0, 1, 2].map((i) => Math.min(...r.objects.map((o) => o.low[i])));
    const high = [0, 1, 2].map((i) => Math.max(...r.objects.map((o) => o.high[i])));
    const all = OBJECTS.map((o) => box(o.mesh));
    const wantLow = [0, 1, 2].map((i) => Math.min(...all.map((b) => b.low[i])));
    const wantHigh = [0, 1, 2].map((i) => Math.max(...all.map((b) => b.high[i])));
    if (!near(low, wantLow) || !near(high, wantHigh)) problems.push(`extent ${low} to ${high}`);
  } else {
    if (r.objects.length !== OBJECTS.length) problems.push(`${r.objects.length} objects`);
    for (const want of OBJECTS) {
      const got = r.objects.find((o) => o.name.startsWith(want.name));
      if (!got) { problems.push(`${want.name} is missing`); continue; }
      const b = box(want.mesh);
      // glTF holds only triangles, and its vertices are per corner.
      const tris = want.mesh.faces.reduce((n, f) => n + f.length - 2, 0);
      if (file.endsWith('.glb')) { if (got.faces !== tris) problems.push(`${want.name}: ${got.faces} triangles, wrote ${tris}`); } else {
        if (got.faces !== want.mesh.faces.length) problems.push(`${want.name}: ${got.faces} faces, wrote ${want.mesh.faces.length}`);
        if (got.verts !== want.mesh.verts.length) problems.push(`${want.name}: ${got.verts} vertices, wrote ${want.mesh.verts.length}`);
      }
      if (!near(got.low, b.low) || !near(got.high, b.high)) problems.push(`${want.name}: extent ${got.low.map((x) => x.toFixed(3))} to ${got.high.map((x) => x.toFixed(3))}, wrote ${b.low} to ${b.high}`);
      const volume = signedVolume(want.mesh);
      if (Math.abs(got.volume - volume) > 0.01 * Math.abs(volume) + 1e-3) problems.push(`${want.name}: volume ${got.volume.toFixed(3)}, wrote ${volume.toFixed(3)}`);
    }
  }
  line(!problems.length, file, problems.join('; ') || `${r.objects.length} objects, ${r.objects.reduce((s, o) => s + o.faces, 0)} faces`);
}

// ── 2. Blender into ours
console.log('Blender\'s files, read by us:');
runBlender('write', theirs);
const expected = JSON.parse(fs.readFileSync(path.join(theirs, 'expected.json'), 'utf8'));
const bytes = (name) => new Uint8Array(fs.readFileSync(path.join(theirs, name)));
const text = (name) => fs.readFileSync(path.join(theirs, name), 'utf8');
let importABC = null;
try { ({ importABC } = await import('../src/core/alembic.js')); } catch { /* not yet */ }
const READ = {
  'blender.fbx': () => importFBX(bytes('blender.fbx')),
  'blender.glb': () => importGLB(bytes('blender.glb')),
  'blender.dae': () => importDAE(text('blender.dae')),
  'blender.usda': () => importUSDA(bytes('blender.usda')),
  'blender.usdc': () => importUSDA(bytes('blender.usdc')),
  'blender.usdz': () => importUSDA(bytes('blender.usdz')),
  'blender-anim.usdc': () => importUSDA(bytes('blender-anim.usdc')),
  'blender.obj': () => importOBJ(text('blender.obj')),
  'blender.blend': () => importBlend(bytes('blender.blend')),
  'blender-zstd.blend': () => importBlend(bytes('blender-zstd.blend')),
};
if (importABC) { READ['blender.abc'] = () => importABC(bytes('blender.abc')); READ['blender-anim.abc'] = () => importABC(bytes('blender-anim.abc'), { sample: 4 }); }
for (const [file, read] of Object.entries(READ)) {
  try {
    const list = read();
    const problems = [];
    if (list.length !== expected.length) problems.push(`${list.length} objects`);
    for (const want of expected) {
      const got = list.find((o) => o.name.includes(want.name));
      if (!got) { problems.push(`${want.name} is missing`); continue; }
      // Blender writes glTF and Collada as triangles.
      const count = /\.(glb|dae)$/.test(file) ? want.tris : want.faces;
      if (got.mesh.faces.length !== count) problems.push(`${want.name}: ${got.mesh.faces.length} faces, Blender says ${count}`);
      const b = box(got.mesh);
      const low = file === 'blender-anim.abc' && want.name === 'BoxA' ? [want.low[0], want.low[1], want.low[2] + 4] : want.low;
      const high = file === 'blender-anim.abc' && want.name === 'BoxA' ? [want.high[0], want.high[1], want.high[2] + 4] : want.high;
      if (!near(b.low, low) || !near(b.high, high)) problems.push(`${want.name}: extent ${b.low.map((x) => x.toFixed(3))} to ${b.high.map((x) => x.toFixed(3))}, Blender says ${low.map((x) => x.toFixed(3))} to ${high.map((x) => x.toFixed(3))}`);
      const volume = signedVolume(got.mesh);
      if (Math.abs(volume - want.volume) > 0.01 * Math.abs(want.volume) + 1e-3) problems.push(`${want.name}: volume ${volume.toFixed(3)}, Blender says ${want.volume.toFixed(3)}`);
    }
    line(!problems.length, file, problems.join('; ') || `${list.length} objects`);
  } catch (error) {
    line(false, file, String(error.message).slice(0, 180));
  }
}
// ── 3. Rigs, in both directions: where every vertex is as the animation plays
console.log('Skins and animation in glTF:');
{
  runBlender('rig-write', theirs);
  const want = JSON.parse(fs.readFileSync(path.join(theirs, 'rig-expected.json'), 'utf8'));
  const extentAt = (document, frame) => {
    setFrame(document, frame);
    const all = [];
    const p = new Vector3();
    for (const o of document.objects) {
      if (o.type !== 'MESH') continue;
      const m = worldMatrix(document, o);
      for (const v of evaluatedMesh(document, o).verts) all.push(p.set(v[0], v[1], v[2]).applyMatrix4(m).toArray());
    }
    return { low: [0, 1, 2].map((k) => Math.min(...all.map((q) => q[k]))), high: [0, 1, 2].map((k) => Math.max(...all.map((q) => q[k]))) };
  };
  for (const [file, read, needsImage] of [['rig.glb', importGLTFScene, true], ['rig.blend', importBlendScene, true], ['rig.fbx', importFBXScene, false], ['rig-leaf.fbx', importFBXScene, false], ['rig.dae', (d, b) => importDAEScene(d, new TextDecoder().decode(b)), false], ['rig.usda', (d, b) => usdSceneModule.importUSDScene(d, b), false], ['rig.usdc', (d, b) => usdSceneModule.importUSDScene(d, b), false]]) {
    const doc = createDocument();
    doc.fps = 24;
    const problems = [];
    let made = [];
    try { made = read(doc, bytes(file)); } catch (error) { problems.push(error.message); }
    if (!problems.length) {
      for (const frame of [1, 6, 11]) {
        const got = extentAt(doc, frame);
        const w = want[String(frame)];
        if (!near(got.low, w.low, 0.02) || !near(got.high, w.high, 0.02)) problems.push(`frame ${frame}: ${got.low.map((x) => x.toFixed(3))} to ${got.high.map((x) => x.toFixed(3))}, Blender says ${w.low.map((x) => x.toFixed(3))} to ${w.high.map((x) => x.toFixed(3))}`);
      }
      if (!made.some((o) => o.type === 'ARMATURE' && o.data.bones.length === 2)) problems.push(`no armature with two bones: ${made.filter((o) => o.type === 'ARMATURE').map((o) => o.data.bones.map((b) => b.name)).join()}`);
      if (needsImage && !doc.images?.length) problems.push('the texture did not come along');
    }
    line(!problems.length, `${file} from Blender`, problems.join('; ') || 'bends the same at frames 1, 6 and 11');
  }

  // Ours, the same idea, in Blender.
  const ours2 = createDocument();
  ours2.fps = 24;
  const column = cubeMesh(1);
  const rows = [];
  for (let k = 0; k <= 8; k++) for (const [x, y] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) rows.push([x, y, k / 4]);
  column.verts = rows;
  column.faces = [];
  for (let k = 0; k < 8; k++) for (let a = 0; a < 4; a++) { const b = (a + 1) % 4; column.faces.push([k * 4 + a, k * 4 + b, (k + 1) * 4 + b, (k + 1) * 4 + a]); }
  column.faces.push([3, 2, 1, 0], [32, 33, 34, 35]);
  column.uvs = null;
  const [lowerW, upperW] = [{}, {}];
  rows.forEach((v, i) => { if (v[2] > 1) upperW[i] = 1; else lowerW[i] = 1; });
  column.vgroups = [{ name: 'Lower', w: lowerW }, { name: 'Upper', w: upperW }];
  const arm = createArmature();
  arm.bones[0].name = 'Lower';
  arm.bones[0].tail = [0, 0, 1];
  arm.bones.push(createBone('Upper', [0, 0, 1], [0, 0, 2], 0));
  const rigObject = addObject(ours2, { type: 'ARMATURE', name: 'Rig', data: arm });
  const texture = { ...defaultMaterial('Painted') };
  ours2.materials.push(texture);
  ours2.images = [{ id: 'img1', name: 'Dots', dataUrl: `data:image/png;base64,${Buffer.from(encodePNG({ width: 2, height: 2, rgba: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]) })).toString('base64')}` }];
  texture.useNodes = true;
  texture.nodes = defaultShaderGraph(texture);
  const bsdf = texture.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
  const node = createNode('TEX_IMAGE', 0, 0, { image: 'img1' });
  texture.nodes.nodes.push(node);
  addLink(texture.nodes, node.id, 'Color', bsdf.id, 'Base Color');
  addObject(ours2, { type: 'MESH', name: 'Column', data: column, materials: [texture.id], modifiers: [{ ...createModifier('ARMATURE'), object: rigObject.id }] });
  insertKey(arm, 'bones.1.pose.rotation.0', 1, 0, 'LINEAR');
  insertKey(arm, 'bones.1.pose.rotation.0', 11, 70, 'LINEAR');
  addObject(ours2, { type: 'CAMERA', name: 'Eye', location: [5, -5, 3], rotation: [70, 0, 45], data: defaultCamera() });
  addObject(ours2, { type: 'LIGHT', name: 'Lamp', location: [2, 2, 4], data: defaultLight('POINT') });
  // A whole .blend: modifiers, parents, lights, cameras, constraints, shape keys, materials and keyed objects, frame by frame.
  runBlender('mods-write', theirs);
  const wanted = JSON.parse(fs.readFileSync(path.join(theirs, 'mods-expected.json'), 'utf8'));
  const blendDoc = createDocument();
  blendDoc.fps = 24;
  const scene = importBlendScene(blendDoc, bytes('mods.blend'));
  const trouble2 = [];
  const named = (n) => scene.find((o) => o.name === n);
  for (const [frame, table] of Object.entries(wanted)) {
    setFrame(blendDoc, Number(frame));
    for (const [name, w] of Object.entries(table)) {
      const o = named(name);
      if (!o) { trouble2.push(`${name} is missing`); continue; }
      const world = worldMatrix(blendDoc, o);
      const at = new Vector3().setFromMatrixPosition(world).toArray();
      if (!near(at, w.at, 0.01)) trouble2.push(`${name} at frame ${frame} stands at ${at.map((x) => x.toFixed(3))}, Blender says ${w.at.map((x) => x.toFixed(3))}`);
      if (w.verts == null) continue;
      const mesh = evaluatedMesh(blendDoc, o, { render: true });
      const points = mesh.verts.map((v) => new Vector3(...v).applyMatrix4(world).toArray());
      const low = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
      const high = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
      if (!near(low, w.low, 0.02) || !near(high, w.high, 0.02)) trouble2.push(`${name} at frame ${frame}: ${low.map((x) => x.toFixed(3))} to ${high.map((x) => x.toFixed(3))}, Blender says ${w.low.map((x) => x.toFixed(3))} to ${w.high.map((x) => x.toFixed(3))}`);
      const area = mesh.faces.reduce((sum, f) => {
        for (let i = 1; i + 1 < f.length; i++) {
          const [a, b, c] = [f[0], f[i], f[i + 1]].map((v) => new Vector3(...mesh.verts[v]));
          sum += b.sub(a).cross(c.sub(a)).length() / 2;
        }
        return sum;
      }, 0);
      if (frame === '1' && Math.abs(area - w.area) > w.area * 0.03) trouble2.push(`${name}: area ${area.toFixed(3)}, Blender says ${w.area.toFixed(3)}`);
      if (frame === '1' && (mesh.verts.length !== w.verts || mesh.faces.length !== w.faces)) trouble2.push(`${name}: ${mesh.verts.length} verts and ${mesh.faces.length} faces, Blender says ${w.verts} and ${w.faces}`);
    }
  }
  const lamp = named('Lamp');
  const cam = named('Cam');
  if (lamp?.data.kind !== 'SPOT' || Math.abs(lamp.data.energy - 250) > 0.01 || !near(lamp.data.color, [1, 0.5, 0.25], 0.001) || Math.abs(lamp.data.spotSize - 40.107) > 0.01) trouble2.push(`light: ${JSON.stringify(lamp?.data)}`);
  if (cam?.data.lens !== 35 || cam.data.clipEnd !== 500) trouble2.push(`camera: ${JSON.stringify(cam?.data)}`);
  const red = blendDoc.materials.find((m) => m.name === 'Red');
  if (!red || !near(red.baseColor, [0.8, 0.1, 0.05], 0.001) || Math.abs(red.roughness - 0.3) > 0.001 || Math.abs(red.metallic - 0.6) > 0.001) trouble2.push(`material: ${JSON.stringify({ c: red?.baseColor, r: red?.roughness, m: red?.metallic })}`);
  if (!named('Round')?.data.smooth) trouble2.push('Round is not smooth');
  if (named('Sub')?.data.smooth) trouble2.push('Sub is not flat');
  if (scene.left.length) trouble2.push(`left out: ${scene.left.join('; ')}`);
  line(!trouble2.length, 'mods.blend from Blender', trouble2.join('; ') || 'every object in its place at frames 1, 6 and 11, modifiers evaluated to the same counts and sizes');

  // Bones with rolls and constraints, posed the same at each frame; Skin and Remesh shapes against Blender's own.
  runBlender('bones-write', theirs);
  const boneFacts = JSON.parse(fs.readFileSync(path.join(theirs, 'bones-expected.json'), 'utf8'));
  const boneDoc = createDocument();
  boneDoc.fps = 24;
  const boneScene = importBlendScene(boneDoc, bytes('bones.blend'));
  const bent3 = [];
  if (boneScene.left.length) bent3.push(`left out: ${boneScene.left.join('; ')}`);
  const boneRig = boneScene.find((o) => o.name === 'Rig');
  // Flattening: as good as Blender's angle-based unwrap, and better than the conformal one.
  const dome = boneScene.find((o) => o.name === 'Dome');
  const domeError = (method) => {
    const m = structuredClone(dome.data);
    m.uvs = null;
    unwrapSeams(m, { method });
    const angle = (a, b, c) => { const [u, w] = [[a[0] - b[0], a[1] - b[1], (a[2] ?? 0) - (b[2] ?? 0)], [c[0] - b[0], c[1] - b[1], (c[2] ?? 0) - (b[2] ?? 0)]]; const dot = u[0] * w[0] + u[1] * w[1] + u[2] * w[2]; return Math.acos(Math.max(-1, Math.min(1, dot / ((Math.hypot(...u) * Math.hypot(...w)) || 1)))); };
    let [total, count] = [0, 0];
    m.faces.forEach((face, f) => face.forEach((v, i) => {
      const n = face.length;
      const [p, r] = [(i + n - 1) % n, (i + 1) % n];
      total += Math.abs(angle(m.verts[face[p]], m.verts[v], m.verts[face[r]]) - angle(m.uvs[f][p], m.uvs[f][i], m.uvs[f][r]));
      count++;
    }));
    return total / count;
  };
  const [ourAngle, ourConformal] = [domeError('ANGLE_BASED'), domeError('CONFORMAL')];
  if (ourAngle > boneFacts.abf * 1.25 + 0.005) bent3.push(`angle error of a dome ${ourAngle.toFixed(4)}, Blender ${boneFacts.abf.toFixed(4)}`);
  if (ourAngle > ourConformal * 1.02) bent3.push(`angle based ${ourAngle.toFixed(4)} is worse than conformal ${ourConformal.toFixed(4)}`);
  delete boneFacts.abf;
  for (const [frame, table] of Object.entries(boneFacts)) {
    setFrame(boneDoc, Number(frame));
    const world = worldMatrix(boneDoc, boneRig);
    const solved = evaluatedArmature(boneDoc, boneRig);
    const poses = bonePoseMatrices(solved);
    solved.bones.forEach((b, i) => {
      const placed = posedBone(solved, i, poses);
      const lengthScale = new Vector3().setFromMatrixColumn(poses[i], 1).length();
      const head = new Vector3(...placed.head).applyMatrix4(world).toArray();
      const tail = new Vector3(0, v3Length(b) , 0).applyMatrix4(poses[i]).applyMatrix4(world).toArray();
      const w = table.bones[b.name];
      void lengthScale;
      if (!near(head, w.head, 0.01) || !near(tail, w.tail, 0.01)) bent3.push(`${b.name} at frame ${frame}: ${head.map((x) => x.toFixed(3))} to ${tail.map((x) => x.toFixed(3))}, Blender says ${w.head.map((x) => x.toFixed(3))} to ${w.tail.map((x) => x.toFixed(3))}`);
    });
    if (frame !== '1') continue;
    for (const [name, w] of Object.entries(table.meshes)) {
      const o = boneScene.find((x) => x.name === name);
      if (!o) { bent3.push(`${name} is missing`); continue; }
      const mesh = evaluatedMesh(boneDoc, o, { render: true });
      const m = worldMatrix(boneDoc, o);
      const points = mesh.verts.map((v) => new Vector3(...v).applyMatrix4(m).toArray());
      const low = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
      const high = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
      // Branch topology and octree grids need not match cell for cell; the shape must. A plain chain must match exactly.
      const tolerance = name === 'Cross' || name === 'Blocks' || name === 'Smooth' || name === 'Sharp' ? 0.45 : name === 'Tube' ? 0.05 : 0.02;
      if (!near(low, w.low, tolerance) || !near(high, w.high, tolerance)) bent3.push(`${name}: ${low.map((x) => x.toFixed(3))} to ${high.map((x) => x.toFixed(3))}, Blender says ${w.low.map((x) => x.toFixed(3))} to ${w.high.map((x) => x.toFixed(3))}`);
      if ((name === 'Chain' || name === 'Bent') && (mesh.verts.length !== w.verts || mesh.faces.length !== w.faces)) bent3.push(`${name}: ${mesh.verts.length} verts, ${mesh.faces.length} faces, Blender says ${w.verts}, ${w.faces}`);
      const quads = mesh.faces.filter((f) => f.length === 4).length;
      if (name !== 'Cross' && name !== 'Tube' && name !== 'Dome' && quads !== mesh.faces.length) bent3.push(`${name}: ${mesh.faces.length - quads} faces are not quads`);
    }
  }
  line(!bent3.length, 'bones.blend from Blender', bent3.join('; ') || 'rolls and constraints pose the same at frames 1, 6 and 11; Skin and Remesh make the same shapes');

  // Object constraints: shrinkwrap, transformation and armature read from a .blend; a transform cache read from Blender's Alembic.
  runBlender('cons-write', theirs);
  const consFacts = JSON.parse(fs.readFileSync(path.join(theirs, 'cons-expected.json'), 'utf8'));
  const consDoc = createDocument();
  consDoc.fps = 24;
  const consScene = importBlendScene(consDoc, bytes('cons.blend'));
  const bent4 = [];
  if (consScene.left.length) bent4.push(`left out: ${consScene.left.join('; ')}`);
  const flyer = consScene.find((o) => o.name === 'Flyer');
  const { readABCTransforms } = await import('../src/core/alembic.js');
  const read = readABCTransforms(bytes('cons.abc'));
  const flyerPath = Object.keys(read.samples).find((p) => p.endsWith('/Flyer'));
  if (!flyerPath) bent4.push(`no Flyer among ${Object.keys(read.samples).join(', ')}`);
  consDoc.caches.push({ id: 'cache1', name: 'cons.abc', start: 1, samples: read.samples });
  // The cache alone moves it: its own keys are taken away.
  flyer.anim = null;
  flyer.location = [0, 0, 0];
  flyer.rotation = [0, 0, 0];
  flyer.constraints = [{ ...createConstraint('TRANSFORM_CACHE'), cache: 'cache1', objectPath: flyerPath }];
  for (const [frame, table] of Object.entries(consFacts)) {
    setFrame(consDoc, Number(frame));
    for (const [name, rows] of Object.entries(table)) {
      const o = consScene.find((x) => x.name === name);
      if (!o) { bent4.push(`${name} is missing`); continue; }
      const e = worldMatrix(consDoc, o).elements;
      // Blender gives rows; ours are columns.
      const got = [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((col) => e[col * 4 + r]));
      if (!near(got.flat(), rows.flat(), 0.01)) bent4.push(`${name} at frame ${frame}: ${got.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}, Blender says ${rows.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}`);
    }
  }
  line(!bent4.length, 'cons.blend and cons.abc from Blender', bent4.join('; ') || 'shrinkwrap three ways, transformation to location and rotation, armature and transform cache place objects the same at frames 1, 6 and 11');

  // FBX cameras, lights and shape keys, both ways: what each object is, where it stands and which way it faces.
  const rowsOf = (m) => [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((col) => m.elements[col * 4 + r]));
  const compareFacts = (theirFacts, docX, list, trouble, { blenderReads = false, fovOnly = false } = {}) => {
    for (const [name, want] of Object.entries(theirFacts.objects)) {
      // Blender keeps an empty for the folder of materials in a USD file.
      if (blenderReads && name === '_materials') continue;
      const o = list.find((x) => x.name === name);
      // Blender's USD reader keeps a transform that holds both data and children as an empty of its own.
      if (!o && blenderReads && /\.\d{3}$/.test(name)) continue;
      // Blender makes an armature of the one-joint skeleton that carries shape key weights, its own files' included.
      if (!o && blenderReads && want.type === 'ARMATURE' && name.startsWith('Skel')) continue;
      if (!o) { trouble.push(`${name} is missing`); continue; }
      const got = rowsOf(worldMatrix(docX, o));
      if (!near(got.flat(), want.matrix.flat(), 0.01)) trouble.push(`${name} placed ${got.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}, Blender ${want.matrix.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}`);
      const d = o.data ?? {};
      if (want.type === 'CAMERA') {
        if (d.kind !== want.kind) trouble.push(`${name}: ${d.kind}, Blender ${want.kind}`);
        // Collada tells a field of view, not a lens and a film: the view must match.
        const fov = (c) => 2 * Math.atan(c.sensor / 2 / c.lens);
        const pairs = [...(fovOnly ? [['fov', fov(want), fov(d)]] : [['lens', want.lens], ['sensor', want.sensor]]), ['clipStart', want.clipStart], ['clipEnd', want.clipEnd], ...(want.kind === 'ORTHO' ? [['orthoScale', want.orthoScale]] : [])];
        for (const [key, value, mine] of pairs) { const ours = mine ?? d[key]; if (Math.abs(ours - value) > 1e-3 * Math.max(1, Math.abs(value))) trouble.push(`${name} ${key} ${ours}, Blender ${value}`); }
      }
      if (want.type === 'LIGHT') {
        // Blender's FBX reader makes an area light a point light; it writes one as an area, and its Collada reader keeps it.
        const kind = blenderReads && d.kind === 'AREA' && want.kind === 'POINT' ? 'POINT' : d.kind;
        if (kind !== want.kind) trouble.push(`${name}: ${d.kind}, Blender ${want.kind}`);
        if (Math.abs(d.energy - want.energy) > 1e-3 * want.energy) trouble.push(`${name} energy ${d.energy}, Blender ${want.energy}`);
        if (!near(d.color, want.color, 1e-3)) trouble.push(`${name} colour ${d.color}, Blender ${want.color}`);
        if (want.kind === 'SPOT' && (Math.abs(d.spotSize - (want.spotSize * 180) / Math.PI) > 1e-3 || Math.abs(d.spotBlend - want.spotBlend) > 1e-3)) trouble.push(`${name} spot ${d.spotSize}° blend ${d.spotBlend}, Blender ${(want.spotSize * 180) / Math.PI}° blend ${want.spotBlend}`);
      }
      // Through Blender's extra empty: it stands for the object of the same name.
      let wantParent = want.parent;
      if (blenderReads && wantParent && !list.some((x) => x.name === wantParent)) {
        const plain = wantParent.replace(/\.\d{3}$/, '');
        wantParent = plain !== name && list.some((x) => x.name === plain) ? plain : theirFacts.objects[wantParent]?.parent;
      }
      if (wantParent && docX.objects.find((x) => x.id === o.parent)?.name !== wantParent) trouble.push(`${name}: parent ${docX.objects.find((x) => x.id === o.parent)?.name}, Blender ${want.parent}`);
      if (want.material) {
        const m = docX.materials.find((x) => x.id === o.materials?.[0]);
        const bsdf = m?.nodes?.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
        const textured = Boolean(m?.useNodes && bsdf && m.nodes.links.some((l) => l.to === bsdf.id && l.in === 'Base Color' && m.nodes.nodes.find((n) => n.id === l.from)?.type === 'TEX_IMAGE'));
        if (!m) trouble.push(`${name}: no material`);
        else {
          if (textured !== want.material.textured) trouble.push(`${name}: ${textured ? 'a' : 'no'} picture on the base colour, Blender ${want.material.textured ? 'has one' : 'has none'}`);
          if (!want.material.textured && !near(m.baseColor, want.material.baseColor, 1e-3)) trouble.push(`${name} base colour ${m.baseColor}, Blender ${want.material.baseColor}`);
          if (Math.abs(m.metallic - want.material.metallic) > 1e-3 || Math.abs(m.roughness - want.material.roughness) > 1e-3) trouble.push(`${name} metallic ${m.metallic} roughness ${m.roughness}, Blender ${want.material.metallic} and ${want.material.roughness}`);
        }
      }
      if (want.keys) {
        const keys = d.shapeKeys ?? [];
        if (keys.length !== want.keys.length) { trouble.push(`${name}: ${keys.length} shape keys, Blender ${want.keys.length}`); continue; }
        const m = worldMatrix(docX, o);
        want.keys.forEach((k, n) => {
          if (keys[n].name !== k.name) trouble.push(`${name} key ${n} named ${keys[n].name}, Blender ${k.name}`);
          if (!blenderReads && Math.abs(keys[n].value - k.value) > 1e-3) trouble.push(`${name} ${k.name} = ${keys[n].value}, Blender ${k.value}`);
          const ours3 = keys[n].verts.map((v) => new Vector3(...v).applyMatrix4(m).toArray()).flat();
          if (!near(ours3, k.verts.flat(), 1e-3)) trouble.push(`${name} ${k.name}: the key's shape differs`);
        });
      }
    }
  };
  runBlender('extras-write', theirs);
  const extrasDoc = createDocument();
  extrasDoc.fps = 24;
  const extrasRead = importFBXScene(extrasDoc, bytes('extras.fbx'));
  const bent5 = [];
  compareFacts(JSON.parse(fs.readFileSync(path.join(theirs, 'extras-expected.json'), 'utf8')), extrasDoc, extrasRead, bent5);
  line(!bent5.length, 'extras.fbx from Blender', bent5.join('; ') || 'two cameras, three lights and a shape key: kinds, settings and places the same');

  const mine = createDocument();
  mine.fps = 24;
  const persp = addObject(mine, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 32, clipStart: 0.5, clipEnd: 250 } });
  addObject(mine, { type: 'EMPTY', name: 'OnCam', parent: persp.id, location: [0, 0, -2], data: {} });
  addObject(mine, { type: 'CAMERA', name: 'Ortho', location: [-2, 0, 1], rotation: [23, 0, -17], data: { ...defaultCamera(), kind: 'ORTHO', orthoScale: 7 } });
  for (const [kind, name, energy] of [['POINT', 'Bulb', 250], ['SUN', 'Sun', 4], ['SPOT', 'Spot', 800], ['AREA', 'Panel', 300]]) addObject(mine, { type: 'LIGHT', name, location: [0, -3, 4], rotation: [17, 6, 40], data: { ...defaultLight(kind), energy, color: [1, 0.5, 0.25], spotSize: 60, spotBlend: 0.25 } });
  const morphMesh = moved(cubeMesh(2), [0, 0, 0]);
  morphMesh.shapeKeys = [{ name: 'Up', value: 0, verts: morphMesh.verts.map((v) => [v[0], v[1], v[2] > 0 ? v[2] + 1 : v[2]]) }];
  const morph = addObject(mine, { type: 'MESH', name: 'Morph', location: [4, 0, 0], data: morphMesh });
  morph.data.anim = { fcurves: {}, nla: [] };
  insertKey(morph.data, 'shapeKeys.0.value', 1, 0, 'LINEAR');
  insertKey(morph.data, 'shapeKeys.0.value', 11, 1, 'LINEAR');
  setFrame(mine, 1);
  fs.writeFileSync(path.join(theirs, 'ours-extras.fbx'), exportFBXScene(mine));
  const bent6 = [];
  try {
    runBlender('extras-read', theirs, 'ours-extras.fbx');
    const theirView = JSON.parse(fs.readFileSync(path.join(theirs, 'ours-extras.fbx.json'), 'utf8'));
    // What Blender found, compared with what was written: the same check, the other way round.
    const written = mine.objects.filter((o) => theirView.objects[o.name]);
    if (written.length !== mine.objects.length) bent6.push(`Blender found ${Object.keys(theirView.objects).join(', ')}`);
    compareFacts(theirView, mine, written, bent6, { blenderReads: true });
    for (const [frame, values] of Object.entries(theirView.frames)) {
      setFrame(mine, Number(frame));
      const want = mine.objects.find((o) => o.name === 'Morph').data.shapeKeys[0].value;
      if (Math.abs((values.Morph?.[0] ?? -1) - want) > 1e-3) bent6.push(`Up at frame ${frame}: Blender ${values.Morph?.[0]}, written ${want}`);
    }
  } catch (error) { bent6.push(String(error.stderr ?? error.message).slice(-300)); }
  line(!bent6.length, 'ours-extras.fbx in Blender', bent6.join('; ') || 'two cameras, four lights, a child of a camera and a keyed shape key: the same in Blender, frame by frame');

  // Collada carries no shape keys: the same cameras and lights, by field of view.
  const daeFacts = JSON.parse(fs.readFileSync(path.join(theirs, 'extras-expected.json'), 'utf8'));
  delete daeFacts.objects.Morph.keys;
  const daeDoc = createDocument();
  daeDoc.fps = 24;
  const bent7 = [];
  compareFacts(daeFacts, daeDoc, importDAEScene(daeDoc, text('extras.dae')), bent7, { fovOnly: true });
  line(!bent7.length, 'extras.dae from Blender', bent7.join('; ') || 'two cameras and three lights: kinds, settings and places the same');
  fs.writeFileSync(path.join(theirs, 'ours-extras.dae'), exportDAEScene(mine));
  const bent8 = [];
  try {
    runBlender('extras-read', theirs, 'ours-extras.dae');
    const theirView = JSON.parse(fs.readFileSync(path.join(theirs, 'ours-extras.dae.json'), 'utf8'));
    const written = mine.objects.filter((o) => theirView.objects[o.name]);
    if (written.length !== mine.objects.length) bent8.push(`Blender found ${Object.keys(theirView.objects).join(', ')}`);
    setFrame(mine, 1);
    compareFacts(theirView, mine, written, bent8, { blenderReads: true, fovOnly: true });
  } catch (error) { bent8.push(String(error.stderr ?? error.message).slice(-300)); }
  line(!bent8.length, 'ours-extras.dae in Blender', bent8.join('; ') || 'two cameras, four lights and a child of a camera: the same in Blender');

  // USD: Blender's text, binary and zipped scenes read by us, frame by frame; ours read by Blender.
  const framesAgree = (facts, docX, list, trouble, { extents = false } = {}) => {
    for (const [frame, table] of Object.entries(facts.at ?? {})) {
      setFrame(docX, Number(frame));
      for (const [name, rows2] of Object.entries(table)) {
        const o = list.find((x) => x.name === name);
        if (!o) continue;
        const got = rowsOf(worldMatrix(docX, o));
        if (!near(got.flat(), rows2.flat(), 0.01)) trouble.push(`${name} at frame ${frame}: ${got.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}, Blender ${rows2.slice(0, 3).map((r) => r.map((x) => x.toFixed(3)).join(' ')).join(' | ')}`);
      }
      if (!extents) continue;
      for (const [name, w] of Object.entries(facts.extents?.[frame] ?? {})) {
        const o = list.find((x) => x.name === name);
        if (!o) continue;
        const m = worldMatrix(docX, o);
        const pts = evaluatedMesh(docX, o).verts.map((v) => new Vector3(...v).applyMatrix4(m).toArray());
        const [low, high] = [[0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])))];
        if (!near(low, w.low, 0.01) || !near(high, w.high, 0.01)) trouble.push(`${name} at frame ${frame} spans ${low.map((x) => x.toFixed(3))} to ${high.map((x) => x.toFixed(3))}, Blender ${w.low.map((x) => x.toFixed(3))} to ${w.high.map((x) => x.toFixed(3))}`);
      }
    }
    setFrame(docX, 1);
  };
  // Shape key values frame by frame, as Blender has them.
  const keysAgree = (facts, docX, list, trouble) => {
    for (const [frame, table] of Object.entries(facts.frames ?? {})) {
      setFrame(docX, Number(frame));
      for (const [name, values] of Object.entries(table)) {
        const o = list.find((x) => x.name === name);
        const ours3 = o?.data?.shapeKeys?.map((k) => k.value) ?? [];
        if (!near(ours3, values, 1e-3) || ours3.length !== values.length) trouble.push(`${name} shape keys at frame ${frame}: ${ours3.map((x) => x.toFixed(3))}, Blender ${values.map((x) => x.toFixed(3))}`);
      }
    }
    setFrame(docX, 1);
  };
  runBlender('usd-write', theirs);
  const usdFacts = JSON.parse(fs.readFileSync(path.join(theirs, 'usd-expected.json'), 'utf8'));
  const { exportUSDScene, importUSDScene } = await import('../src/core/usdscene.js');
  for (const file of ['scene.usda', 'scene.usdc', 'scene.usdz']) {
    const usdDoc = createDocument();
    usdDoc.fps = 24;
    const trouble = [];
    try {
      const list = importUSDScene(usdDoc, bytes(file));
      const facts = structuredClone(usdFacts);
      // Pictures travel inside a .usdz only; the others name a file beside them.
      if (!file.endsWith('.usdz')) delete facts.objects.Floor.material;
      setFrame(usdDoc, 1);
      compareFacts(facts, usdDoc, list, trouble);
      framesAgree(facts, usdDoc, list, trouble);
      keysAgree(facts, usdDoc, list, trouble);
    } catch (error) { trouble.push(String(error.stack ?? error.message).slice(0, 300)); }
    line(!trouble.length, `${file} from Blender`, trouble.join('; ') || 'a keyed box with a child, materials, a camera and four lights: the same at frames 1, 6 and 11');
  }
  // Ours: the cameras and lights above, a keyed box with a child, a picture on a floor, and a shape key keyed over time.
  const usdMine = createDocument();
  usdMine.fps = 24;
  usdMine.objects = [];
  for (const o of mine.objects.filter((x) => x.type === 'CAMERA' && x.data.kind !== 'ORTHO' || x.type === 'LIGHT')) addObject(usdMine, { type: o.type, name: o.name, location: [...o.location], rotation: [...o.rotation], data: structuredClone(o.data) });
  const paint = { ...defaultMaterial('Paint'), baseColor: [0.8, 0.2, 0.1], metallic: 0.3, roughness: 0.6 };
  const dots = { ...defaultMaterial('Painted') };
  usdMine.materials.push(paint, dots);
  usdMine.images = [{ id: 'img1', name: 'Dots', dataUrl: `data:image/png;base64,${Buffer.from(encodePNG({ width: 2, height: 2, rgba: new Uint8Array([40, 220, 80, 255, 40, 220, 80, 255, 40, 220, 80, 255, 40, 220, 80, 255]) })).toString('base64')}` }];
  dots.useNodes = true;
  dots.nodes = defaultShaderGraph(dots);
  const dotsBsdf = dots.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
  const dotsTex = createNode('TEX_IMAGE', 0, 0, { image: 'img1' });
  dots.nodes.nodes.push(dotsTex);
  addLink(dots.nodes, dotsTex.id, 'Color', dotsBsdf.id, 'Base Color');
  const keyedBox = addObject(usdMine, { type: 'MESH', name: 'Box', location: [1, 2, 3], data: cubeMesh(2), materials: [paint.id] });
  keyedBox.anim = { fcurves: {}, nla: [] };
  insertKey(keyedBox, 'location.2', 1, 3, 'LINEAR');
  insertKey(keyedBox, 'location.2', 11, 7, 'LINEAR');
  insertKey(keyedBox, 'rotation.2', 1, 0, 'LINEAR');
  insertKey(keyedBox, 'rotation.2', 11, 57, 'LINEAR');
  addObject(usdMine, { type: 'EMPTY', name: 'Rider', parent: keyedBox.id, location: [0, 0, 2], data: {} });
  const floorMesh = cubeMesh(2);
  floorMesh.verts = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]];
  floorMesh.faces = [[0, 1, 2, 3]];
  floorMesh.uvs = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
  addObject(usdMine, { type: 'MESH', name: 'Floor', location: [-3, 0, 0], data: floorMesh, materials: [dots.id] });
  const morph2 = mine.objects.find((o) => o.name === 'Morph');
  addObject(usdMine, { type: 'MESH', name: 'Morph', location: [...morph2.location], data: structuredClone(morph2.data) });
  setFrame(usdMine, 1);
  for (const [file, data] of [['ours-scene.usda', exportUSDScene(usdMine)], ['ours-scene.usdz', exportUSDScene(usdMine, { usdz: true })], ['ours-scene.usdc', exportUSDScene(usdMine, { usdc: true })]]) {
    fs.writeFileSync(path.join(theirs, file), data);
    const trouble = [];
    try {
      runBlender('extras-read', theirs, file);
      const theirView = JSON.parse(fs.readFileSync(path.join(theirs, `${file}.json`), 'utf8'));
      const written = usdMine.objects.filter((o) => theirView.objects[o.name]);
      if (written.length !== usdMine.objects.length) trouble.push(`Blender found ${Object.keys(theirView.objects).join(', ')}`);
      // A picture travels inside a .usdz only.
      if (!file.endsWith('.usdz')) delete theirView.objects.Floor?.material;
      setFrame(usdMine, 1);
      compareFacts(theirView, usdMine, written, trouble, { blenderReads: true });
      framesAgree(theirView, usdMine, written, trouble, { extents: true });
      if (!theirView.objects.Morph?.keys?.length) trouble.push('Blender found no shape keys on Morph');
      keysAgree(theirView, usdMine, written, trouble);
    } catch (error) { trouble.push(String(error.stderr ?? error.stack ?? error.message).slice(-300)); }
    line(!trouble.length, `${file} in Blender`, trouble.join('; ') || 'a keyed box with a child, materials, a camera, four lights and a mesh that changes shape: the same in Blender at frames 1, 6 and 11');
  }

  // Alembic as a scene: Blender's keyed box, camera, changing mesh and curves read by us; ours read by Blender.
  runBlender('abc-write', theirs);
  const { exportABCScene, importABCScene } = await import('../src/core/abcscene.js');
  {
    const abcFacts = JSON.parse(fs.readFileSync(path.join(theirs, 'abc-expected.json'), 'utf8'));
    // Alembic carries points over time, not shape keys.
    for (const v of Object.values(abcFacts.objects)) delete v.keys;
    const abcDoc = createDocument();
    abcDoc.fps = 24;
    const trouble = [];
    try {
      const list = importABCScene(abcDoc, bytes('scene.abc'));
      setFrame(abcDoc, 1);
      compareFacts(abcFacts, abcDoc, list, trouble);
      framesAgree(abcFacts, abcDoc, list, trouble, { extents: true });
    } catch (error) { trouble.push(String(error.stack ?? error.message).slice(0, 300)); }
    line(!trouble.length, 'scene.abc from Blender', trouble.join('; ') || 'a keyed box with a child, a camera with a child, a changing mesh, a Bézier circle and a NURBS path: the same at frames 1, 6 and 11');
  }
  {
    const abcMine = createDocument();
    abcMine.fps = 24;
    abcMine.objects = [];
    const cam = addObject(abcMine, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 32, clipStart: 0.5, clipEnd: 250 } });
    addObject(abcMine, { type: 'EMPTY', name: 'OnCam', parent: cam.id, location: [0, 0, -2], data: {} });
    const box = addObject(abcMine, { type: 'MESH', name: 'Box', location: [1, 2, 3], data: cubeMesh(2) });
    box.anim = { fcurves: {}, nla: [] };
    insertKey(box, 'location.2', 1, 3, 'LINEAR');
    insertKey(box, 'location.2', 11, 7, 'LINEAR');
    insertKey(box, 'rotation.2', 1, 0, 'LINEAR');
    insertKey(box, 'rotation.2', 11, 57, 'LINEAR');
    addObject(abcMine, { type: 'EMPTY', name: 'Rider', parent: box.id, location: [0, 0, 2], data: {} });
    const morphSource = mine.objects.find((o) => o.name === 'Morph');
    addObject(abcMine, { type: 'MESH', name: 'Morph', location: [...morphSource.location], data: structuredClone(morphSource.data) });
    addObject(abcMine, { type: 'CURVE', name: 'Wire', location: [0, 5, 0], data: { splines: [{ kind: 'BEZIER', cyclic: true, points: [[1, 0, 0], [0, 1, 0.5], [-1, 0, 0], [0, -1, -0.5]] }, { kind: 'POLY', cyclic: false, points: [[0, 0, 2], [2, 0, 2], [2, 1, 3]] }], bevelDepth: 0, resolution: 12 } });
    setFrame(abcMine, 1);
    fs.writeFileSync(path.join(theirs, 'ours-scene.abc'), exportABCScene(abcMine));
    const trouble = [];
    try {
      runBlender('extras-read', theirs, 'ours-scene.abc');
      const theirView = JSON.parse(fs.readFileSync(path.join(theirs, 'ours-scene.abc.json'), 'utf8'));
      const written = abcMine.objects.filter((o) => theirView.objects[o.name]);
      if (written.length !== abcMine.objects.length) trouble.push(`Blender found ${Object.keys(theirView.objects).join(', ')}`);
      setFrame(abcMine, 1);
      compareFacts(theirView, abcMine, written, trouble, { blenderReads: true });
      framesAgree(theirView, abcMine, written, trouble, { extents: true });
    } catch (error) { trouble.push(String(error.stderr ?? error.stack ?? error.message).slice(-300)); }
    line(!trouble.length, 'ours-scene.abc in Blender', trouble.join('; ') || 'a keyed box with a child, a camera with a child, a changing mesh and two curves: the same in Blender at frames 1, 6 and 11');
  }

  fs.writeFileSync(path.join(theirs, 'ours-rig.glb'), exportGLTFScene(ours2));
  fs.writeFileSync(path.join(theirs, 'ours-rig.fbx'), exportFBXScene(ours2));
  fs.writeFileSync(path.join(theirs, 'ours-rig.dae'), exportDAEScene(ours2));
  fs.writeFileSync(path.join(theirs, 'ours-rig.usda'), usdSceneModule.exportUSDScene(ours2));
  fs.writeFileSync(path.join(theirs, 'ours-rig.usdc'), usdSceneModule.exportUSDScene(ours2, { usdc: true }));
  for (const file of ['ours-rig.glb', 'ours-rig.fbx', 'ours-rig.dae', 'ours-rig.usda', 'ours-rig.usdc']) {
    const trouble = [];
    try {
      runBlender('rig-read', theirs, file);
      const report2 = JSON.parse(fs.readFileSync(path.join(theirs, `${file}.json`), 'utf8'));
      if (report2.bones !== 2) trouble.push(`${report2.bones} bones`);
      if (report2.actions < 1) trouble.push('no action');
      // Collada names its pictures by file; this one is inside the project only.
      if (report2.images < 1 && !file.endsWith('.dae') && !/\.usd[ac]$/.test(file)) trouble.push('no image');
      if (!file.endsWith('.fbx') && (report2.lights !== 1 || report2.cameras !== 1)) trouble.push(`${report2.lights} lights and ${report2.cameras} cameras`);
      for (const [offset, frame] of [[0, 1], [5, 6], [10, 11]]) {
        const g = extentAt(ours2, frame);
        const w = report2.extents[String(offset)];
        if (!near(g.low, w.low, 0.02) || !near(g.high, w.high, 0.02)) trouble.push(`frame ${frame}: Blender ${w.low.map((x) => x.toFixed(3))} to ${w.high.map((x) => x.toFixed(3))}, ours ${g.low.map((x) => x.toFixed(3))} to ${g.high.map((x) => x.toFixed(3))}`);
      }
    } catch (error) { trouble.push(String(error.stderr ?? error.message).slice(-300)); }
    line(!trouble.length, `${file} in Blender`, trouble.join('; ') || 'two bones, an action and a texture; bends the same');
  }
}

// SVG: Blender's own importer and ours on one file with every element kind, transforms, units, use and symbol.
{
  const { readSVG } = await import('../src/core/svg.js');
  const { fillCurve } = await import('../src/core/doc.js');
  const trouble = [];
  try {
    fs.copyFileSync(path.join(here, '..', 'test', 'fixtures', 'every-element.svg'), path.join(theirs, 'every-element.svg'));
    runBlender('svg-read', theirs, 'every-element.svg');
    const found = JSON.parse(fs.readFileSync(path.join(theirs, 'every-element.svg.json'), 'utf8'));
    const curves = readSVG(fs.readFileSync(path.join(theirs, 'every-element.svg'), 'utf8'));
    const seen = {};
    let worst = 0;
    const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const triArea = (m) => m.faces.reduce((s, f) => { const [a, b, c] = f.map((i) => m.verts[i]); return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }, 0);
    if (found.length !== curves.length) trouble.push(`Blender made ${found.length} curves, we ${curves.length}`);
    for (const c of curves) {
      const n = seen[c.name] ?? 0;
      seen[c.name] = n + 1;
      const name = n ? `${c.name}.${String(n).padStart(3, '0')}` : c.name;
      const b = found.find((x) => x.name === name);
      if (!b) { trouble.push(`${name} missing in Blender`); continue; }
      if (b.fill !== c.fill || b.dimensions !== c.dimensions) trouble.push(`${name}: fill ${c.fill} ${c.dimensions}, Blender ${b.fill} ${b.dimensions}`);
      if (c.fill && (!b.color || c.color.some((x, k) => Math.abs(x - b.color[k]) > 1e-5))) trouble.push(`${name}: colour ${c.color}, Blender ${b.color}`);
      if (b.splines.length !== c.splines.length) { trouble.push(`${name}: ${c.splines.length} splines, Blender ${b.splines.length}`); continue; }
      c.splines.forEach((s, k) => {
        const t = b.splines[k];
        if (s.cyclic !== t.cyclic || s.points.length !== t.points.length) { trouble.push(`${name}[${k}]: ${s.points.length} points cyclic ${s.cyclic}, Blender ${t.points.length} ${t.cyclic}`); return; }
        s.points.forEach((p, j) => { worst = Math.max(worst, d3(p, t.points[j]), d3(s.handles[j][0], t.left[j]), d3(s.handles[j][1], t.right[j])); });
      });
      if (c.fill) {
        const area = triArea(fillCurve({ splines: c.splines, resolution: 12, fill: true }));
        if (Math.abs(area - b.area) > 1e-3 * Math.max(b.area, 1e-6)) trouble.push(`${name}: filled area ${area.toExponential(4)}, Blender ${b.area.toExponential(4)}`);
      }
    }
    if (worst > 1e-6) trouble.push(`points and handles up to ${worst.toExponential(2)} apart`);
  } catch (error) { trouble.push(String(error.stderr ?? error.stack ?? error.message).slice(-300)); }
  line(!trouble.length, 'every-element.svg in both importers', trouble.join('; ') || 'paths with arcs and smooth curves, rects, rounded rects, circles, ellipses, lines, polylines, polygons, groups with transforms, use and symbol: the same points, handles, fills, colours and filled areas');
}
console.log(failed ? `\n${failed} failed (files kept in ${work})` : '\nAll agree.');
if (!failed) fs.rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
