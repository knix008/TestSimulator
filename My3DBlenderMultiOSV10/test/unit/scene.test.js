import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Vector3 } from 'three';
import { INTERPOLATIONS, autoHandles, deleteKey, evalCurve, evalDriver, insertKey, keyFrames, pushDownAction } from '../../src/core/anim.js';
import { autoWeights, armaturePoseMatrices, createArmature, createBone, deformByArmature, posedBone, solveIK } from '../../src/core/armature.js';
import { booleanMesh } from '../../src/core/csg.js';
import {
  addObject, createConstraint, createDefaultScene, createDocument, curveToMesh, deserialize, evaluatedMesh, getObject, isVisible, rotationFromQuat, rotationQuat, sampleSpline, sceneStats, selectOnly, serialize, setFrame, worldMatrix, worldPosition,
} from '../../src/core/doc.js';
import { History } from '../../src/core/history.js';
import { boundingBox, cubeMesh, eulerCharacteristic, gridMesh, icoSphereMesh, isManifold, planeMesh, signedVolume, uvSphereMesh } from '../../src/core/mesh.js';
import { metaballToMesh } from '../../src/core/metaball.js';
import { MODIFIERS, applyModifier, catmullClark, createModifier, evaluateMesh, latticeDeform } from '../../src/core/modifiers.js';
import { SCULPT_BRUSHES, falloff, sculptDab, vertexPaintDab, weightColor, weightPaintDab } from '../../src/core/sculpt.js';
import { textToMesh } from '../../src/core/text3d.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b}`);
const mod = (type, props = {}) => ({ ...createModifier(type), ...props });

describe('modifiers', () => {
  test('every modifier in the table runs on a cube and returns a mesh', () => {
    for (const type of Object.keys(MODIFIERS)) {
      const out = applyModifier(cubeMesh(2), createModifier(type), { frame: 50 });
      assert.ok(Array.isArray(out.verts) && Array.isArray(out.faces), type);
    }
  });
  test('subdivision: a cube has 26 verts and 24 faces after one level, and shrinks towards a sphere', () => {
    const m = catmullClark(cubeMesh(2));
    assert.equal(m.verts.length, 26);
    assert.equal(m.faces.length, 24);
    assert.ok(isManifold(m));
    const two = applyModifier(cubeMesh(2), mod('SUBSURF', { levels: 2 }));
    assert.equal(two.faces.length, 96);
    // A size-2 cube converges to a volume of about 2.62: 3.33, 2.80, 2.66, 2.63… by level.
    near(signedVolume(two), 2.8009, 1e-3);
    near(signedVolume(catmullClark(catmullClark(two))), 2.6314, 1e-3);
    near(Math.max(...two.verts.map((v) => Math.abs(v[0]))), Math.max(...two.verts.map((v) => Math.abs(v[1]))), 1e-9);
  });
  test('subdivision keeps boundary vertices on the boundary curve and subdivides UVs', () => {
    const m = catmullClark(planeMesh(2));
    assert.equal(m.faces.length, 4);
    assert.equal(m.uvs.length, 4);
    for (const v of m.verts) near(v[2], 0);
  });
  test('mirror welds the seam into a closed mesh', () => {
    const half = cubeMesh(2);
    half.verts.forEach((v) => { v[0] += 1; });
    const out = applyModifier(half, mod('MIRROR', { merge: true }));
    near(boundingBox(out.verts).min[0], -2);
    assert.equal(out.faces.length, 12);
    assert.equal(out.verts.length, 12);
  });
  test('array makes count copies at the offset', () => {
    const out = applyModifier(cubeMesh(2), mod('ARRAY', { count: 3, offsetX: 3, offsetY: 0, offsetZ: 0 }));
    assert.equal(out.faces.length, 18);
    near(boundingBox(out.verts).max[0], 7);
  });
  test('solidify closes an open plane into a box', () => {
    const out = applyModifier(planeMesh(2), mod('SOLIDIFY', { thickness: 0.5 }));
    assert.equal(out.faces.length, 6);
    assert.ok(isManifold(out));
    near(Math.abs(signedVolume(out)), 2);
  });
  test('bevel modifier chamfers all sharp cube edges', () => {
    const out = applyModifier(cubeMesh(2), mod('BEVEL', { width: 0.1 }));
    assert.equal(out.faces.length, 26);
    assert.ok(isManifold(out));
  });
  test('decimate reaches about the ratio without breaking the mesh', () => {
    const out = applyModifier(icoSphereMesh(4, 1), mod('DECIMATE', { ratio: 0.25 }));
    assert.ok(out.faces.length <= 1280 * 0.3, `${out.faces.length} faces`);
    assert.ok(out.faces.length > 40);
  });
  test('screw of an open edge sweeps a closed tube', () => {
    const m = { ...planeMesh(1), faces: [], uvs: null, verts: [[1, 0, -1], [1, 0, 1]], loose: [[0, 1]] };
    const out = applyModifier(m, mod('SCREW', { angle: 360, steps: 12, height: 0, axis: 'Z' }));
    assert.equal(out.faces.length, 12);
    assert.equal(out.verts.length, 24);
  });
  test('weld, triangulate, wireframe', () => {
    const c = cubeMesh(2);
    assert.equal(applyModifier(c, mod('TRIANGULATE')).faces.length, 12);
    assert.equal(applyModifier(c, mod('WIREFRAME', { thickness: 0.1 })).faces.length, 12 * 6);
    assert.equal(applyModifier(c, mod('WELD', { distance: 10 })).verts.length < 8, true);
  });
  test('edge split gives each face of a cube its own corners', () => {
    const out = applyModifier(cubeMesh(2), mod('EDGE_SPLIT', { angle: 30 }));
    assert.equal(out.verts.length, 24);
    assert.equal(out.faces.length, 6);
  });
  test('build grows over time, mask hides by vertex group', () => {
    const grid = gridMesh(4, 4, 2);
    assert.equal(applyModifier(grid, mod('BUILD', { start: 1, length: 100 }), { frame: 1 }).faces.length, 0);
    assert.equal(applyModifier(grid, mod('BUILD', { start: 1, length: 100 }), { frame: 51 }).faces.length, 8);
    assert.equal(applyModifier(grid, mod('BUILD', { start: 1, length: 100 }), { frame: 200 }).faces.length, 16);
    const masked = gridMesh(2, 1, 2);
    masked.vgroups = [{ name: 'G', w: { 0: 1, 1: 1, 3: 1, 4: 1 } }];
    assert.equal(applyModifier(masked, mod('MASK', { group: 'G' })).faces.length, 1);
    assert.equal(applyModifier(masked, mod('MASK', { group: 'G', invert: true })).faces.length, 1);
  });
  test('displace moves vertices along normals, wave moves with the frame, smooth shrinks', () => {
    const c = uvSphereMesh(16, 8, 1);
    assert.notDeepEqual(applyModifier(c, mod('DISPLACE', { strength: 1 })).verts, c.verts);
    const [a, b] = [applyModifier(gridMesh(8, 8, 4), mod('WAVE'), { frame: 1 }), applyModifier(gridMesh(8, 8, 4), mod('WAVE'), { frame: 9 })];
    assert.notDeepEqual(a.verts, b.verts);
    assert.ok(Math.abs(signedVolume(applyModifier(c, mod('SMOOTH', { factor: 1, iterations: 3 })))) < Math.abs(signedVolume(c)));
  });
  test('simple deform: twist keeps the height, taper changes the width at one end', () => {
    const tall = gridMesh(2, 2, 2);
    tall.verts.forEach((v, i) => { v[2] = (i % 3) - 1; });
    const twisted = applyModifier(tall, mod('SIMPLE_DEFORM', { mode: 'TWIST', angle: 90 }));
    tall.verts.forEach((v, i) => near(twisted.verts[i][2], v[2]));
    const tapered = applyModifier(cubeMesh(2), mod('SIMPLE_DEFORM', { mode: 'TAPER', factor: 1 }));
    near(boundingBox(tapered.verts).max[0], 2);
    const bent = applyModifier(cubeMesh(2), mod('SIMPLE_DEFORM', { mode: 'BEND', angle: 90 }));
    assert.notDeepEqual(bent.verts, cubeMesh(2).verts);
    const stretched = applyModifier(cubeMesh(2), mod('SIMPLE_DEFORM', { mode: 'STRETCH', factor: 1 }));
    near(boundingBox(stretched.verts).max[2], 2);
  });
  test('cast pulls a cube corner in towards a sphere', () => {
    const out = applyModifier(cubeMesh(2), mod('CAST', { factor: 1 }));
    const d = out.verts.map((v) => Math.hypot(...v));
    near(Math.max(...d), Math.min(...d), 1e-9);
  });
  test('lattice moves points inside by its deformed corners', () => {
    const rest = [];
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) rest.push([i * 4 - 2, j * 4 - 2, k * 4 - 2]);
    const points = rest.map((p) => [p[0], p[1], p[2] + 1]);
    const out = latticeDeform(cubeMesh(2), { res: [2, 2, 2], rest, points });
    out.verts.forEach((v, i) => near(v[2], cubeMesh(2).verts[i][2] + 1));
  });
  test('a hidden modifier is skipped in the viewport but not in the render', () => {
    const list = [{ ...mod('ARRAY', { count: 2 }), show: false }];
    assert.equal(evaluateMesh(cubeMesh(2), list).faces.length, 6);
    assert.equal(evaluateMesh(cubeMesh(2), list, {}, { render: true }).faces.length, 12);
  });
  test('shape keys blend before the modifiers', () => {
    const m = cubeMesh(2);
    m.shapeKeys = [{ name: 'Up', value: 0.5, verts: m.verts.map((v) => [v[0], v[1], v[2] + 2]) }];
    near(boundingBox(evaluateMesh(m).verts).max[2], 2);
  });
});

describe('boolean', () => {
  const offset = (m, x) => { m.verts.forEach((v) => { v[0] += x; }); return m; };
  test('difference of overlapping cubes has the exact volume', () => {
    near(signedVolume(booleanMesh(cubeMesh(2), offset(cubeMesh(2), 1), 'DIFFERENCE')), 4, 1e-4);
  });
  test('union and intersection add up', () => {
    near(signedVolume(booleanMesh(cubeMesh(2), offset(cubeMesh(2), 1), 'UNION')), 12, 1e-4);
    near(signedVolume(booleanMesh(cubeMesh(2), offset(cubeMesh(2), 1), 'INTERSECT')), 4, 1e-4);
  });
  test('the modifier reads the other object in its own space', () => {
    const doc = createDocument();
    const a = addObject(doc, { type: 'MESH', name: 'A', data: cubeMesh(2) });
    const b = addObject(doc, { type: 'MESH', name: 'B', data: cubeMesh(2), location: [1, 0, 0] });
    a.modifiers.push(mod('BOOLEAN', { operation: 'DIFFERENCE', object: b.id }));
    near(signedVolume(evaluatedMesh(doc, a)), 4, 1e-4);
  });
});

describe('scene document', () => {
  test('default scene has a cube, a light and an active camera', () => {
    const doc = createDefaultScene();
    assert.deepEqual(doc.objects.map((o) => o.type), ['MESH', 'LIGHT', 'CAMERA']);
    assert.equal(doc.activeCamera, doc.objects[2].id);
    assert.deepEqual(doc.selected, [doc.objects[0].id]);
  });
  test('names stay unique', () => {
    const doc = createDocument();
    addObject(doc, { name: 'Cube' });
    assert.equal(addObject(doc, { name: 'Cube' }).name, 'Cube.001');
    assert.equal(addObject(doc, { name: 'Cube' }).name, 'Cube.002');
    assert.equal(addObject(doc, { name: 'Cube.001' }).name, 'Cube.003');
  });
  test('parent transforms carry children; hiding a collection hides its objects', () => {
    const doc = createDocument();
    const p = addObject(doc, { name: 'P', location: [1, 0, 0], rotation: [0, 0, 90] });
    const c = addObject(doc, { name: 'C', location: [1, 0, 0], parent: p.id });
    const pos = worldPosition(doc, c);
    near(pos[0], 1); near(pos[1], 1);
    const col = { id: 'c1', name: 'x', parent: 'col_root', hide: true, exclude: false };
    doc.collections.push(col);
    c.collection = 'c1';
    assert.equal(isVisible(doc, c), false);
    assert.equal(isVisible(doc, p), true);
  });
  test('save and load round trip, run-time keys stay out', () => {
    const doc = createDefaultScene();
    doc._rev = 5;
    doc.objects[0]._cache = { big: true };
    const text = serialize(doc);
    assert.ok(!text.includes('_rev') && !text.includes('_cache'));
    assert.deepEqual(deserialize(text).objects[0].data.verts, doc.objects[0].data.verts);
  });
  test('load rejects other files and newer versions with a clear message', () => {
    assert.throws(() => deserialize('{"format":"other"}'), /not a My3DBlender/);
    assert.throws(() => deserialize('{"format":"my3dblender","version":999}'), /newer version/);
  });
  test('load fills in fields a file from before they existed does not have', () => {
    const doc = JSON.parse(serialize(createDefaultScene()));
    delete doc.markers;
    assert.deepEqual(deserialize(JSON.stringify(doc)).markers, []);
  });
  test('statistics count evaluated geometry', () => {
    const doc = createDefaultScene();
    doc.objects[0].modifiers.push(mod('SUBSURF', { levels: 1 }));
    const s = sceneStats(doc);
    assert.equal(s.objects, 3);
    assert.equal(s.faces, 24);
    assert.equal(s.tris, 48);
  });
});

describe('rotation', () => {
  test('XYZ means X first, then Y, then Z', () => {
    const doc = createDocument();
    const o = addObject(doc, { name: 'O', rotation: [90, 0, 90] });
    // X turns +Y to +Z; Z leaves +Z alone. In the other order it would end on +X.
    const y = new Vector3(0, 1, 0).transformDirection(worldMatrix(doc, o));
    near(y.z, 1);
  });
  test('the default camera looks at the default cube', () => {
    const doc = createDefaultScene();
    const m = worldMatrix(doc, doc.objects[2]);
    const forward = new Vector3(0, 0, -1).transformDirection(m);
    const toCube = new Vector3().setFromMatrixPosition(m).negate().normalize();
    assert.ok(forward.dot(toCube) > 0.99, `the camera looks ${forward.toArray()}`);
  });
  test('a rotation order survives the trip to a quaternion and back', () => {
    for (const mode of ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX']) {
      const q = rotationQuat([10, 20, 30], mode);
      rotationFromQuat(q, mode).forEach((a, i) => near(a, [10, 20, 30][i], 1e-9));
    }
  });
});

describe('constraints', () => {
  const pair = () => {
    const doc = createDocument();
    const t = addObject(doc, { name: 'T', location: [3, 4, 5], scale: [2, 2, 2] });
    const o = addObject(doc, { name: 'O' });
    return { doc, t, o };
  };
  const withC = (o, type, props) => o.constraints.push({ ...createConstraint(type), ...props });
  test('copy location, with influence', () => {
    const { doc, t, o } = pair();
    withC(o, 'COPY_LOCATION', { target: t.id, influence: 0.5 });
    assert.deepEqual(worldPosition(doc, o), [1.5, 2, 2.5]);
  });
  test('copy scale', () => {
    const { doc, t, o } = pair();
    withC(o, 'COPY_SCALE', { target: t.id });
    const s = new Vector3().setFromMatrixScale(worldMatrix(doc, o));
    near(s.x, 2);
  });
  test('limit location clamps', () => {
    const { doc, o } = pair();
    o.location = [50, -50, -5];
    withC(o, 'LIMIT_LOCATION', {});
    assert.deepEqual(worldPosition(doc, o), [10, -10, 0]);
  });
  test('limit distance keeps within reach', () => {
    const { doc, t, o } = pair();
    withC(o, 'LIMIT_DISTANCE', { target: t.id, distance: 1 });
    const d = worldPosition(doc, o).map((x, i) => x - t.location[i]);
    near(Math.hypot(...d), 1);
  });
  test('track to aims a camera (-Z) at the target', () => {
    const { doc, t, o } = pair();
    withC(o, 'TRACK_TO', { target: t.id });
    const forward = new Vector3(0, 0, -1).transformDirection(worldMatrix(doc, o));
    const want = new Vector3(3, 4, 5).normalize();
    near(forward.dot(want), 1, 1e-6);
  });
  test('child of follows the target', () => {
    const { doc, t, o } = pair();
    o.location = [1, 0, 0];
    withC(o, 'CHILD_OF', { target: t.id });
    near(worldPosition(doc, o)[0], 5);
  });
  test('floor stops at the target height', () => {
    const { doc, t, o } = pair();
    withC(o, 'FLOOR', { target: t.id, offset: 1 });
    near(worldPosition(doc, o)[2], 6);
  });
});

describe('animation curves', () => {
  const keys = (list, interp) => autoHandles(list.map(([f, v]) => ({ f, v, interp })));
  test('holds before the first and after the last key', () => {
    const c = keys([[10, 1], [20, 2]], 'LINEAR');
    assert.equal(evalCurve(c, 0), 1);
    assert.equal(evalCurve(c, 30), 2);
  });
  test('linear extrapolation continues the slope', () => {
    near(evalCurve(keys([[10, 1], [20, 2]], 'LINEAR'), 30, 'LINEAR'), 3);
  });
  test('constant jumps, linear interpolates', () => {
    assert.equal(evalCurve(keys([[0, 0], [10, 10]], 'CONSTANT'), 9), 0);
    assert.equal(evalCurve(keys([[0, 0], [10, 10]], 'LINEAR'), 5), 5);
  });
  test('bezier passes through its keys, eases at the ends and stays monotonic between flat keys', () => {
    const c = keys([[0, 0], [10, 10]], 'BEZIER');
    near(evalCurve(c, 0), 0); near(evalCurve(c, 10), 10); near(evalCurve(c, 5), 5, 1e-4);
    assert.ok(evalCurve(c, 1) < 1, 'slow start');
    let prev = -1;
    for (let f = 0; f <= 10; f += 0.5) { const v = evalCurve(c, f); assert.ok(v >= prev); prev = v; }
  });
  test('every easing starts at the first value and ends at the second', () => {
    for (const interp of INTERPOLATIONS) {
      if (interp === 'CONSTANT') continue;
      for (const easing of ['IN', 'OUT', 'IN_OUT']) {
        const c = [{ f: 0, v: 0, interp, easing }, { f: 10, v: 1, interp, easing }];
        autoHandles(c);
        near(evalCurve(c, 0.00001), 0, 0.02);
        near(evalCurve(c, 9.99999), 1, 0.02);
      }
    }
  });
  test('insert replaces a key on the same frame and keeps order; delete removes it', () => {
    const o = { location: [1, 0, 0] };
    insertKey(o, 'location.0', 20);
    insertKey(o, 'location.0', 10, 5);
    insertKey(o, 'location.0', 20, 7);
    assert.deepEqual(o.anim.fcurves['location.0'].map((k) => [k.f, k.v]), [[10, 5], [20, 7]]);
    assert.deepEqual(keyFrames(o), [10, 20]);
    assert.ok(deleteKey(o, 'location.0', 10));
    assert.ok(deleteKey(o, 'location.0', 20));
    assert.equal(o.anim.fcurves['location.0'], undefined);
  });
  test('setFrame moves an animated object and a keyed material', () => {
    const doc = createDefaultScene();
    const o = doc.objects[0];
    insertKey(o, 'location.2', 1, 0, 'LINEAR');
    insertKey(o, 'location.2', 11, 10, 'LINEAR');
    const mat = doc.materials[0];
    insertKey(mat, 'roughness', 1, 0, 'LINEAR');
    insertKey(mat, 'roughness', 11, 1, 'LINEAR');
    setFrame(doc, 6);
    near(o.location[2], 5);
    near(mat.roughness, 0.5);
  });
  test('NLA strip plays a pushed-down action, scaled in time', () => {
    const o = { location: [0, 0, 0] };
    insertKey(o, 'location.0', 1, 0, 'LINEAR');
    insertKey(o, 'location.0', 11, 10, 'LINEAR');
    const strip = pushDownAction(o);
    assert.equal(Object.keys(o.anim.fcurves).length, 0);
    strip.start = 101; strip.end = 121; strip.scale = 2;
    const doc = createDocument();
    const obj = addObject(doc, { name: 'X', anim: o.anim });
    setFrame(doc, 111);
    near(obj.location[0], 5);
  });
  test('drivers: an expression sets a property each frame; a bad expression changes nothing', () => {
    const doc = createDefaultScene();
    const o = doc.objects[0];
    o.drivers.push({ path: 'location.2', expression: 'frame * 2', variables: [] });
    setFrame(doc, 7);
    near(o.location[2], 14);
    assert.equal(evalDriver('sin(', {}), null);
    near(evalDriver('max(a, 3)', { a: 1 }), 3);
  });
  test('a driver variable reads another object', () => {
    const doc = createDefaultScene();
    const [a, b] = doc.objects;
    b.location[0] = 21;
    a.drivers.push({ path: 'location.1', expression: 'v / 3', variables: [{ name: 'v', object: b.id, path: 'location.0' }] });
    setFrame(doc, 1);
    near(a.location[1], 7);
  });
});

describe('armature', () => {
  const chain = () => {
    const arm = createArmature();
    arm.bones = [createBone('A', [0, 0, 0], [0, 0, 1]), createBone('B', [0, 0, 1], [0, 0, 2], 0)];
    return arm;
  };
  test('a rest pose changes nothing', () => {
    const arm = chain();
    assert.deepEqual(posedBone(arm, 1).tail.map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 2]);
  });
  test('rotating the parent carries the child', () => {
    const arm = chain();
    arm.bones[0].pose.rotation = [90, 0, 0];
    const tail = posedBone(arm, 1).tail;
    near(Math.hypot(...tail), 2);
    near(tail[2], 0, 1e-6);
  });
  test('automatic weights give each end to its nearest bone and sum to one', () => {
    const arm = chain();
    const m = gridMesh(1, 1, 0.1);
    m.verts = [[0, 0, 0.1], [0, 0, 1.9]];
    m.faces = [];
    autoWeights(m, arm);
    // A tiny share is dropped, so a missing weight reads as zero.
    assert.ok(m.vgroups[0].w[0] > (m.vgroups[1].w[0] ?? 0));
    assert.ok(m.vgroups[1].w[1] > (m.vgroups[0].w[1] ?? 0));
    near((m.vgroups[0].w[0] ?? 0) + (m.vgroups[1].w[0] ?? 0), 1);
  });
  test('skinning moves weighted vertices with the bone', () => {
    const doc = createDocument();
    const arm = addObject(doc, { type: 'ARMATURE', name: 'Arm', data: chain() });
    const m = gridMesh(1, 1, 0.1);
    m.verts = [[0, 0, 2]];
    m.faces = [];
    m.vgroups = [{ name: 'A', w: { 0: 1 } }, { name: 'B', w: {} }];
    arm.data.bones[0].pose.rotation = [180, 0, 0];
    const out = deformByArmature(m, armaturePoseMatrices(arm.data), worldMatrix(doc, arm), worldMatrix(doc, arm));
    near(out.verts[0][2], -2, 1e-6);
  });
  test('the armature modifier reads pose through the scene', () => {
    const doc = createDocument();
    const arm = addObject(doc, { type: 'ARMATURE', name: 'Arm', data: chain() });
    const mesh = gridMesh(1, 1, 0.1);
    mesh.verts = mesh.verts.map((v) => [v[0], v[1], 2]);
    mesh.vgroups = [{ name: 'A', w: { 0: 1, 1: 1, 2: 1, 3: 1 } }, { name: 'B', w: {} }];
    const o = addObject(doc, { type: 'MESH', name: 'Skin', data: mesh });
    o.modifiers.push(mod('ARMATURE', { object: arm.id }));
    arm.data.bones[0].pose.rotation = [180, 0, 0];
    near(evaluatedMesh(doc, o).verts[0][2], -2, 1e-5);
  });
  test('IK brings the tip to a reachable target', () => {
    const arm = chain();
    assert.ok(solveIK(arm, 1, [1, 0, 1], 2, 32) < 0.01);
  });
});

describe('sculpt and paint', () => {
  test('all brushes run; a brush outside the mesh moves nothing', () => {
    for (const brush of Object.keys(SCULPT_BRUSHES)) {
      const m = gridMesh(8, 8, 2);
      m.verts[40][2] = 0.1;
      assert.ok(sculptDab(m, brush, [0, 0, 0], { radius: 1, strength: 0.5, delta: [0, 0, 1], normal: [0, 0, 1] }) > 0, brush);
      assert.equal(sculptDab(m, brush, [50, 50, 50], { radius: 1 }), 0, brush);
    }
  });
  test('draw raises along the normal; invert lowers; falloff fades to the edge', () => {
    const up = gridMesh(8, 8, 2);
    sculptDab(up, 'DRAW', [0, 0, 0], { radius: 1, strength: 1, normal: [0, 0, 1] });
    assert.ok(up.verts[40][2] > 0);
    near(up.verts[0][2], 0);
    const down = gridMesh(8, 8, 2);
    sculptDab(down, 'DRAW', [0, 0, 0], { radius: 1, strength: 1, normal: [0, 0, 1], invert: true });
    assert.ok(down.verts[40][2] < 0);
    assert.equal(falloff(0), 1);
    assert.equal(falloff(1), 0);
  });
  test('smooth and flatten reduce a bump', () => {
    for (const brush of ['SMOOTH', 'FLATTEN']) {
      const m = gridMesh(8, 8, 2);
      m.verts[40][2] = 1;
      sculptDab(m, brush, [0, 0, 1], { radius: 1.5, strength: 1, normal: [0, 0, 1] });
      assert.ok(m.verts[40][2] < 1, brush);
    }
  });
  test('grab moves by the delta at full strength in the centre', () => {
    const m = gridMesh(8, 8, 2);
    sculptDab(m, 'GRAB', [0, 0, 0], { radius: 1, delta: [0, 0, 2] });
    near(m.verts[40][2], 2);
  });
  test('symmetry mirrors the dab across X', () => {
    const m = gridMesh(8, 8, 2);
    sculptDab(m, 'DRAW', [0.5, 0, 0], { radius: 0.3, strength: 1, normal: [0, 0, 1], symmetryX: true });
    near(m.verts[42][2], m.verts[38][2], 1e-9);
    assert.ok(m.verts[42][2] > 0);
  });
  test('mask protects vertices from later strokes', () => {
    const m = gridMesh(8, 8, 2);
    sculptDab(m, 'MASK', [0, 0, 0], { radius: 2, strength: 1 });
    const masked = m.mask[40];
    assert.ok(masked > 0.9);
    sculptDab(m, 'DRAW', [0, 0, 0], { radius: 1, strength: 1, normal: [0, 0, 1] });
    assert.ok(m.verts[40][2] < 0.2 * (1 - masked) + 1e-9);
  });
  test('vertex paint makes the layer and blends', () => {
    const m = gridMesh(2, 2, 2);
    vertexPaintDab(m, [0, 0, 0], { radius: 0.5, strength: 1, color: [1, 0, 0] });
    assert.equal(m.colors.length, 9);
    assert.deepEqual(m.colors[4], [1, 0, 0]);
    assert.deepEqual(m.colors[0], [1, 1, 1]);
  });
  test('weight paint makes the group, clamps 0 to 1, colours by ramp', () => {
    const m = gridMesh(2, 2, 2);
    weightPaintDab(m, 'G', [0, 0, 0], { radius: 0.5, strength: 1, weight: 1 });
    near(m.vgroups[0].w[4], 1);
    weightPaintDab(m, 'G', [0, 0, 0], { radius: 0.5, strength: 1, weight: 5, blend: 'ADD' });
    near(m.vgroups[0].w[4], 1);
    assert.deepEqual(weightColor(0), [0, 0, 1]);
    assert.deepEqual(weightColor(1), [1, 0, 0]);
  });
});

describe('curves, text, metaballs', () => {
  test('a bezier spline passes through its control points', () => {
    const pts = sampleSpline({ kind: 'BEZIER', cyclic: false, points: [[0, 0, 0], [1, 1, 0], [2, 0, 0]] }, 8);
    assert.equal(pts.length, 17);
    assert.deepEqual(pts[8], [1, 1, 0]);
    assert.deepEqual(pts.at(-1), [2, 0, 0]);
  });
  test('an unbeveled curve is edges, a beveled curve is a closed tube', () => {
    const spline = { kind: 'POLY', cyclic: false, points: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] };
    const wire = curveToMesh({ splines: [spline], bevelDepth: 0 });
    assert.equal(wire.loose.length, 2);
    const tube = curveToMesh({ splines: [spline], bevelDepth: 0.1 });
    assert.ok(isManifold(tube));
    assert.ok(signedVolume(tube) > 0);
  });
  test('text outlines become faces in the XY plane, extrude gives depth', () => {
    const flat = textToMesh({ body: 'Ab', size: 1, extrude: 0 });
    assert.ok(flat.faces.length > 10);
    near(boundingBox(flat.verts).max[2], 0);
    assert.ok(boundingBox(textToMesh({ body: 'Ab', size: 1, extrude: 0.5 }).verts).max[2] > 0.4);
  });
  test('centre alignment centres the text', () => {
    const box = boundingBox(textToMesh({ body: 'Center', size: 1, extrude: 0, align: 'CENTER' }).verts);
    near(box.min[0], -box.max[0], 1e-6);
  });
  test('one metaball is a closed surface round its centre', () => {
    const m = metaballToMesh({ elements: [{ co: [0, 0, 0], radius: 1, stiffness: 2 }], threshold: 0.6, resolution: 0.15 });
    assert.ok(isManifold(m));
    assert.equal(eulerCharacteristic(m), 2);
    assert.ok(signedVolume(m) > 0);
  });
  test('two close metaballs merge, two far ones do not', () => {
    const count = (d) => {
      const m = metaballToMesh({ elements: [{ co: [0, 0, 0], radius: 1, stiffness: 2 }, { co: [d, 0, 0], radius: 1, stiffness: 2 }], threshold: 0.6, resolution: 0.15 });
      return eulerCharacteristic(m);
    };
    assert.equal(count(1), 2);
    assert.equal(count(3), 4);
  });
});

describe('history', () => {
  test('undo and redo restore the document; a new edit drops the redo branch', () => {
    const doc = createDefaultScene();
    const h = new History();
    h.reset(doc);
    doc.frame = 2;
    h.push(doc, 'A');
    doc.frame = 3;
    h.push(doc, 'B');
    assert.equal(JSON.parse(h.undo()).frame, 2);
    assert.equal(JSON.parse(h.undo()).frame, 1);
    assert.equal(h.undo(), null);
    assert.equal(JSON.parse(h.redo()).frame, 2);
    doc.frame = 9;
    h.push(doc, 'C');
    assert.equal(h.canRedo, false);
  });
  test('nothing changed: no entry', () => {
    const doc = createDefaultScene();
    const h = new History();
    h.reset(doc);
    assert.equal(h.push(doc, 'Same'), false);
    assert.equal(h.canUndo, false);
  });
  test('the limit drops the oldest; jump goes to any entry', () => {
    const doc = createDefaultScene();
    const h = new History(3);
    h.reset(doc);
    for (let i = 2; i < 10; i++) { doc.frame = i; h.push(doc, `F${i}`); }
    assert.equal(h.undoStack.length, 3);
    assert.equal(JSON.parse(h.jump(0)).frame, 6);
    assert.equal(h.entries().index, 0);
    assert.equal(JSON.parse(h.jump(3)).frame, 9);
  });
});

describe('history and the selection', () => {
  test('amend folds a selection into the state undo returns to, without adding a step', () => {
    const doc = createDefaultScene();
    const h = new History();
    h.reset(doc);
    doc.selected = [];
    h.amend(doc);
    assert.equal(h.canUndo, false);
    doc.frame = 2;
    h.push(doc, 'edit');
    assert.deepEqual(JSON.parse(h.undo()).selected, []);
  });
});

describe('selection helper', () => {
  test('selectOnly and getObject', () => {
    const doc = createDefaultScene();
    selectOnly(doc, doc.objects[1]);
    assert.equal(getObject(doc, doc.activeId).type, 'LIGHT');
  });
});
