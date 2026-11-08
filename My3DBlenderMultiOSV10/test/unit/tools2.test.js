// Grease pencil, UV tools, paint tools, more constraints, soft body pressure, GPU layers.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { Vector3 } from 'three';
import { addObject, createConstraint, createDocument, defaultMaterial, setFrame, worldMatrix, worldPosition } from '../../src/core/doc.js';
import { GP_MODIFIERS, applyGPModifiers, createGPModifier, eraseAt, gpencilMeshes, gpencilToMesh, interpolateDrawing, neighbourDrawings, sculptStrokes, simplifyStroke, smoothStroke, strokesAt, subdivideStroke } from '../../src/core/gpencil.js';
import { cubeMesh, gridMesh, planeMesh, uvSphereMesh } from '../../src/core/mesh.js';

import { createImageBuffer, paintDabImage } from '../../src/core/paint.js';
import { bakeSoftBody, defaultSoftBody } from '../../src/core/physics.js';
import { alignUVs, minimizeStretch, pinUVs, stitchUVs, unwrapSeams, weldUVs } from '../../src/core/unwrap.js';
import { buildRenderScene } from '../../src/core/pathtracer.js';
import { run } from '../../src/core/ops.js';
import { BONE_CONSTRAINTS, bonePoseMatrices, createBone, createBoneConstraint, posedBone, restBoneMatrix, rollFromAxes } from '../../src/core/armature.js';
import { evaluatedArmature, evaluatedMesh } from '../../src/core/doc.js';
import { NODE_TYPES, addLink, createNode, evalGeometryNodes } from '../../src/core/nodes.js';
import { createMesh, isManifold, signedVolume } from '../../src/core/mesh.js';
import { quadRemesh, skinHull } from '../../src/core/remesh.js';
import { bakeMap } from '../../src/core/bake.js';
import { addLiquidBox, bakeDynamicPaint, bakeLiquid, clearSimCache, createLiquid, defaultDynamicPaint, defaultLiquidDomain, liquidMeshAt, liquidStep, stepSecondary } from '../../src/core/simulation.js';
import { oceanMesh } from '../../src/core/remesh.js';
import { MODIFIERS } from '../../src/core/modifiers.js';
import { actionBonePose, actionRange, assignAction, insertKey, storeAction } from '../../src/core/anim.js';
import { addLink as linkNodes, defaultShaderGraph, evalDisplacement, evalVolume, treeUses } from '../../src/core/nodes.js';
import { renderImage } from '../../src/core/pathtracer.js';
import { sceneVolumes } from '../../src/core/simulation.js';
import { angleDistortion } from '../../src/core/unwrap.js';
import { catmullClark } from '../../src/core/modifiers.js';
import { multiresEvaluate } from '../../src/core/remesh.js';
import { uvSphereMesh as sphereForDome } from '../../src/core/mesh.js';

const near = (a, b, tolerance = 1e-3) => assert.ok(Math.abs(a - b) <= tolerance, `${a} against ${b}`);
const close = (a, b, tolerance = 1e-3) => a.forEach((x, i) => near(x, b[i], tolerance));
const square = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];

describe('grease pencil', () => {
  const layer = (over = {}) => ({ name: 'L', hide: false, color: [1, 0, 0], strokes: [{ points: square, width: 2, frame: 1 }], ...over });
  test('a stroke becomes a ribbon, and with fill also its inside', () => {
    const [part] = gpencilMeshes({ layers: [layer()] }, 1);
    assert.equal(part.lines.faces.length, 3);
    assert.equal(part.fills.faces.length, 0);
    const [filled] = gpencilMeshes({ layers: [layer({ fill: true })] }, 1);
    assert.equal(filled.fills.faces.length, 2);
    assert.deepEqual(gpencilMeshes({ layers: [layer({ hide: true })] }, 1), []);
  });
  test('thickness and width set the ribbon width', () => {
    const line = [[0, 0, 0], [1, 0, 0]];
    const width = (thickness) => { const [p] = gpencilMeshes({ layers: [layer({ thickness, strokes: [{ points: line, width: 2 }] })] }, 1); return Math.max(...p.lines.verts.map((v) => v[1])) - Math.min(...p.lines.verts.map((v) => v[1])); };
    near(width(1), 0.02);
    near(width(3), 0.06);
  });
  test('a keyed layer holds the last drawing; a plain one shows them all', () => {
    const strokes = [{ points: square, frame: 1 }, { points: square, frame: 10 }, { points: square, frame: 10 }, { points: square, frame: 20 }];
    assert.equal(strokesAt({ strokes }, 5).length, 4);
    assert.equal(strokesAt({ strokes, keyed: true }, 5).length, 1);
    assert.equal(strokesAt({ strokes, keyed: true }, 15).length, 2);
    assert.equal(strokesAt({ strokes, keyed: true }, 25).length, 1);
    assert.equal(strokesAt({ strokes, keyed: true }, 0).length, 0);
  });
  test('smooth, simplify and subdivide', () => {
    const zig = { points: [[0, 0, 0], [1, 1, 0], [2, 0, 0]] };
    smoothStroke(zig, 1);
    close(zig.points[1], [1, 0, 0]);
    const straight = { points: [[0, 0, 0], [1, 0, 0], [2, 0.001, 0], [3, 0, 0], [3, 1, 0]] };
    simplifyStroke(straight, 0.01);
    assert.equal(straight.points.length, 3, 'keeps the ends and the corner');
    const line = { points: [[0, 0, 0], [2, 0, 0]] };
    subdivideStroke(line);
    assert.deepEqual(line.points, [[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  });
  test('erase cuts a stroke in two and removes what is left too short', () => {
    const l = { strokes: [{ points: Array.from({ length: 11 }, (_, i) => [i, 0, 0]), width: 2 }, { points: [[0, 5, 0], [0, 6, 0]], width: 2 }] };
    assert.equal(eraseAt(l, [5, 0, 0], 1.1), 3);
    assert.equal(l.strokes.length, 3);
    assert.equal(l.strokes[0].points.length, 4);
    assert.equal(l.strokes[1].points.length, 4);
    eraseAt(l, [0, 5, 0], 0.5);
    assert.equal(l.strokes.length, 2, 'one point alone is no stroke');
  });
  test('operators work on the active layer, and a drawing converts and renders', () => {
    const doc = createDocument();
    const ctx = { doc };
    run(ctx, 'object.gpencil_add');
    const o = doc.objects.find((x) => x.id === doc.activeId);
    run(ctx, 'gpencil.stroke_add', { points: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] });
    run(ctx, 'gpencil.stroke_subdivide');
    assert.equal(o.data.layers[o.data.activeLayer].strokes[0].points.length, 7);
    o.data.layers[o.data.activeLayer].fill = true;
    const scene = buildRenderScene(doc);
    const lit = scene.materials.filter((m) => m.emission?.some((x) => x !== 0) || m.emission);
    assert.ok(lit.length >= 2, 'its colours reach the renderer');
    run(ctx, 'gpencil.convert');
    const mesh = doc.objects.find((x) => x.id === doc.activeId);
    assert.equal(mesh.type, 'MESH');
    assert.ok(mesh.data.faces.length > 6);
    assert.ok(gpencilToMesh(o.data, doc.frame).verts.length > 0);
  });
});

describe('UV tools', () => {
  const unwrapped = () => { const m = gridMesh(3, 3, 2); unwrapSeams(m); return m; };
  test('weld brings corners together, align onto a line', () => {
    const m = planeMesh(2);
    m.uvs = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
    weldUVs(m, [[0, 0, 0], [0, 1, 0]]);
    assert.deepEqual(m.uvs[0][0], [0.5, 0]);
    assert.deepEqual(m.uvs[0][1], [0.5, 0]);
    const n = planeMesh(2);
    n.uvs = [[[0, 0], [1, 0.2], [1, 1], [0, 1]]];
    alignUVs(n, [[0, 0, 0], [0, 1, 0]], 'V');
    near(n.uvs[0][0][1], 0.1);
    near(n.uvs[0][1][1], 0.1);
  });
  test('pinned corners stay put through a new unwrap, and the island follows them', () => {
    const m = unwrapped();
    m.uvs[0][0] = [0.9, 0.9];
    m.uvs[8][2] = [0.1, 0.1];
    pinUVs(m, [[0, 0, 0], [8, 2, 0]]);
    unwrapSeams(m);
    close(m.uvs[0][0], [0.9, 0.9], 1e-9);
    close(m.uvs[8][2], [0.1, 0.1], 1e-9);
    const span = Math.hypot(m.uvs[4][0][0] - 0.5, m.uvs[4][0][1] - 0.5);
    assert.ok(span < 0.3, 'the rest fits between the pins');
    pinUVs(m, [[0, 0, 0], [8, 2, 0]], false);
    assert.deepEqual(m.uvPins, {});
  });
  test('stitch brings another island to the selected edge', () => {
    const m = cubeMesh(2);
    m.uvs = m.faces.map((_, f) => [[f, 0], [f + 0.5, 0], [f + 0.5, 0.5], [f, 0.5]].map(([x, y]) => [x * 0.1, y]));
    const shared = m.faces[0].filter((v) => m.faces[2].includes(v));
    assert.equal(shared.length, 2);
    const corners = shared.map((v) => [0, m.faces[0].indexOf(v), 0]);
    assert.equal(stitchUVs(m, corners) >= 1, true);
    for (const v of shared) {
      const a = m.uvs[0][m.faces[0].indexOf(v)];
      const b = m.uvs[2][m.faces[2].indexOf(v)];
      close(a, b, 1e-9);
    }
  });
  test('minimize stretch evens out edges, pins holding', () => {
    const m = gridMesh(4, 4, 2);
    m.uvs = m.faces.map((f) => f.map((v) => { const [x, y] = [(m.verts[v][0] + 1) / 2, (m.verts[v][1] + 1) / 2]; return [x * x, y]; }));
    pinUVs(m, [[0, 0, 0]]);
    const was = [...m.uvs[0][0]];
    const { before, after } = minimizeStretch(m, { iterations: 200 });
    assert.ok(after < before * 0.5, `${before} to ${after}`);
    close(m.uvs[0][0], was, 1e-9);
  });
});

describe('image paint tools', () => {
  const flat = (c) => createImageBuffer(32, 32, c);
  const at = (img, x, y) => [...img.rgba.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 3)];
  test('soften blurs an edge and leaves flat areas', () => {
    const img = flat([0, 0, 0, 1]);
    for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) img.rgba.set([255, 255, 255], (y * 32 + x) * 4);
    paintDabImage(img, 0.5, 0.5, { radius: 8, tool: 'SOFTEN' });
    const v = at(img, 16, 16)[0];
    assert.ok(v > 60 && v < 200, `blurred to ${v}`);
    assert.equal(at(img, 2, 2)[0], 0, 'outside the brush nothing changes');
  });
  test('smear drags colour along the stroke; clone copies from an offset', () => {
    const img = flat([0, 0, 0, 1]);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) img.rgba.set([255, 0, 0], (y * 32 + x) * 4);
    paintDabImage(img, 22 / 32, 0.5, { radius: 6, strength: 1, tool: 'SMEAR', from: [14 / 32, 0.5] });
    assert.ok(at(img, 22, 16)[0] > 200, 'red dragged across');
    const pic = flat([0, 0, 0, 1]);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pic.rgba.set([0, 255, 0], (y * 32 + x) * 4);
    paintDabImage(pic, 20 / 32, 1 - 20 / 32, { radius: 6, tool: 'CLONE', offset: [-16 / 32, 16 / 32] });
    assert.ok(at(pic, 20, 20)[1] > 200, 'the green corner copied here');
  });
  test('a mask holds paint back where it is dark', () => {
    const mask = flat([0, 0, 0, 1]);
    for (let y = 0; y < 32; y++) for (let x = 16; x < 32; x++) mask.rgba.set([255, 255, 255], (y * 32 + x) * 4);
    const img = flat([1, 1, 1, 1]);
    paintDabImage(img, 0.5, 0.5, { radius: 12, color: [1, 0, 0], mask });
    assert.equal(at(img, 12, 16)[1], 255, 'dark mask: untouched');
    assert.ok(at(img, 20, 16)[1] < 128, 'light mask: painted');
  });
});

describe('more constraints', () => {
  const pair = (type, setup = {}, targetAt = [0, 5, 0]) => {
    const doc = createDocument();
    doc.objects.length = 0;
    const target = addObject(doc, { type: 'EMPTY', name: 'T', location: targetAt });
    const o = addObject(doc, { type: 'EMPTY', name: 'O', ...setup });
    const c = createConstraint(type);
    if ('target' in c) c.target = target.id;
    o.constraints.push(c);
    return { doc, o, c, target };
  };
  const axis = (doc, o, k) => { const e = worldMatrix(doc, o).elements; return [e[k * 4], e[k * 4 + 1], e[k * 4 + 2]]; };
  test('limit rotation and limit scale', () => {
    const { doc, o } = pair('LIMIT_ROTATION', { rotation: [90, 0, 0] });
    const y = axis(doc, o, 1);
    close(y, [0, Math.cos(Math.PI / 4), Math.sin(Math.PI / 4)]);
    const s = pair('LIMIT_SCALE', { scale: [5, 1, 0.1] });
    near(Math.hypot(...axis(s.doc, s.o, 0)), 2);
    near(Math.hypot(...axis(s.doc, s.o, 2)), 0.5);
  });
  test('locked track turns only about Z', () => {
    const { doc, o } = pair('LOCKED_TRACK', {}, [5, 0, 3]);
    close(axis(doc, o, 2), [0, 0, 1]);
    close(axis(doc, o, 1), [1, 0, 0]);
  });
  test('stretch to reaches the target and keeps volume', () => {
    const { doc, o, c } = pair('STRETCH_TO', {}, [0, 4, 0]);
    c.rest = 1;
    near(Math.hypot(...axis(doc, o, 1)), 4);
    near(Math.hypot(...axis(doc, o, 0)), 0.5);
    close(worldPosition(doc, o), [0, 0, 0]);
  });
  test('maintain volume sets the free axis', () => {
    const { doc, o, c } = pair('MAINTAIN_VOLUME', { scale: [2, 1, 2] });
    c.volume = 8;
    near(Math.hypot(...axis(doc, o, 1)), 2);
  });
  test('follow path goes along the line by arc length, and faces along it; clamp finds the nearest place', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const curve = addObject(doc, { type: 'CURVE', name: 'P', data: { splines: [{ kind: 'POLY', cyclic: false, points: [[0, 0, 0], [4, 0, 0], [4, 4, 0]] }], bevelDepth: 0, resolution: 1 } });
    const o = addObject(doc, { type: 'EMPTY', name: 'O' });
    const c = createConstraint('FOLLOW_PATH');
    c.target = curve.id;
    c.offset = 0.25;
    o.constraints.push(c);
    const at = worldPosition(doc, o);
    near(at[0], 2, 0.2);
    near(at[1], 0, 0.2);
    close(axis(doc, o, 1), [1, 0, 0], 0.1);
    c.offset = 0.75;
    near(worldPosition(doc, o)[1], 2, 0.2);
    const clamped = addObject(doc, { type: 'EMPTY', name: 'C', location: [1, 3, 0] });
    const k = createConstraint('CLAMP_TO');
    k.target = curve.id;
    clamped.constraints.push(k);
    near(worldPosition(doc, clamped)[1], 0, 0.05);
    void setFrame;
    void Vector3;
  });
});

describe('soft body pressure', () => {
  test('pressure swells a closed shape; none leaves it to sag', () => {
    const size = (pressure) => {
      const doc = createDocument();
      doc.objects.length = 0;
      doc.gravity = [0, 0, 0];
      const o = addObject(doc, { type: 'MESH', name: 'S', data: cubeMesh(1) });
      o.softBody = { ...defaultSoftBody(), goal: 0.05, stiffness: 0.2, pressure };
      bakeSoftBody(doc, o, { start: 1, end: 20 });
      return Math.max(...o.cache.cloth[20].map((v) => v[0]));
    };
    assert.ok(size(30) > size(0) + 0.02, `${size(30)} against ${size(0)}`);
  });
});

describe('bone roll and constraints', () => {
  const rig = () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const bones = [createBone('A', [0, 0, 0], [0, 0, 1], null), createBone('B', [0, 0, 1], [0, 0, 2], 0), createBone('C', [2, 0, 0], [2, 0, 1], null)];
    const arm = addObject(doc, { type: 'ARMATURE', name: 'Rig', data: { bones } });
    return { doc, arm, bones };
  };
  const add = (bone, type, set = {}) => { const c = { ...createBoneConstraint(type), ...set }; (bone.constraints ??= []).push(c); return c; };
  const place = (doc, arm, i) => posedBone(evaluatedArmature(doc, arm), i);
  test('roll turns the frame about the bone, and the axis it found is read back', () => {
    const bone = createBone('R', [0, 0, 0], [0, 0, 1], null);
    bone.useRoll = true;
    bone.roll = 0;
    const plain = restBoneMatrix(bone);
    bone.roll = 90;
    const turned = restBoneMatrix(bone);
    const axis = (m, k) => [m.elements[k * 4], m.elements[k * 4 + 1], m.elements[k * 4 + 2]];
    close(axis(plain, 1), [0, 0, 1]);
    close(axis(turned, 1), [0, 0, 1]);
    near(axis(plain, 0)[0] * axis(turned, 0)[0] + axis(plain, 0)[1] * axis(turned, 0)[1], 0);
    near(rollFromAxes(bone.head, bone.tail, axis(turned, 0)), 90);
    assert.equal(new Set(Object.keys(BONE_CONSTRAINTS)).size, 14);
  });
  test('a stored pose is left alone; copy location follows another bone, at its influence', () => {
    const { doc, arm, bones } = rig();
    bones[2].pose.location = [0, 3, 0];
    add(bones[0], 'COPY_LOCATION', { target: arm.id, subtarget: 'C', influence: 0.5 });
    const head = place(doc, arm, 0).head;
    const c = bonePoseMatrices(evaluatedArmature(doc, arm))[2].elements;
    near(head[0], c[12] / 2);
    assert.deepEqual(bones[0].pose.location, [0, 0, 0]);
  });
  test('a child comes along with what a constraint did to its parent', () => {
    const { doc, arm, bones } = rig();
    const aim = addObject(doc, { type: 'EMPTY', name: 'T', location: [5, 0, 0] });
    add(bones[0], 'DAMPED_TRACK', { target: aim.id });
    close(place(doc, arm, 0).tail, [1, 0, 0]);
    close(place(doc, arm, 1).tail, [2, 0, 0]);
  });
  test('limit rotation holds a bone in its own axes', () => {
    const { doc, arm, bones } = rig();
    bones[0].useRoll = true;
    bones[0].pose.rotation = [80, 0, 0];
    add(bones[0], 'LIMIT_ROTATION', { minX: -30, maxX: 30, useY: false, useZ: false });
    const tail = place(doc, arm, 0).tail;
    near(Math.abs(Math.atan2(Math.hypot(tail[0], tail[1]), tail[2])) * 57.29578, 30, 0.1);
  });
  test('stretch to reaches the target and thins, limit scale bounds it, locked track keeps its axis', () => {
    const { doc, arm, bones } = rig();
    const aim = addObject(doc, { type: 'EMPTY', name: 'T', location: [0, 0, 3] });
    add(bones[0], 'STRETCH_TO', { target: aim.id });
    const m = bonePoseMatrices(evaluatedArmature(doc, arm))[0].elements;
    near(Math.hypot(m[4], m[5], m[6]), 3);
    near(Math.hypot(m[0], m[1], m[2]), 1 / Math.sqrt(3));
    add(bones[0], 'LIMIT_SCALE', { min: 0.5, max: 2 });
    const held = bonePoseMatrices(evaluatedArmature(doc, arm))[0].elements;
    near(Math.hypot(held[4], held[5], held[6]), 2);
    const other = rig();
    const side = addObject(other.doc, { type: 'EMPTY', name: 'S', location: [4, 0, 9] });
    add(other.bones[2], 'LOCKED_TRACK', { target: side.id, axis: 'Y', lock: 'X' });
    const pose = bonePoseMatrices(evaluatedArmature(other.doc, other.arm))[2].elements;
    close([pose[0], pose[1], pose[2]], [Math.abs(pose[0]), pose[1], pose[2]]);
  });
  test('disabled ones and missing targets do nothing; operators add and remove them', () => {
    const { doc, arm, bones } = rig();
    add(bones[0], 'COPY_LOCATION', { target: arm.id, subtarget: 'C', enabled: false });
    add(bones[0], 'COPY_LOCATION', { target: 'gone' });
    close(place(doc, arm, 0).head, [0, 0, 0]);
    bones[0].constraints = [];
    doc.activeId = arm.id;
    doc.selected = [arm.id];
    run({ doc }, 'pose.constraint_add', { bone: 1, type: 'LIMIT_SCALE' });
    assert.equal(bones[1].constraints[0].type, 'LIMIT_SCALE');
    run({ doc }, 'pose.constraint_remove', { bone: 1, index: 0 });
    assert.equal(bones[1].constraints.length, 0);
  });
});

describe('zones', () => {
  const tree = (...nodes) => {
    const input = createNode('GROUP_INPUT');
    const output = createNode('GROUP_OUTPUT');
    return { graph: { kind: 'GEOMETRY', nodes: [input, output, ...nodes], links: [] }, input, output };
  };
  const offset = (x, y, z) => createNode('COMBINE_XYZ', 0, 0, { X: x, Y: y, Z: z });
  test('repeat: the body runs that many times, each round from the last', () => {
    const [start, body, end, by] = [createNode('REPEAT_INPUT', 0, 0, { Iterations: 5 }), createNode('SET_POSITION'), createNode('REPEAT_OUTPUT'), offset(0, 0, 1)];
    const { graph, input, output } = tree(start, body, end, by);
    addLink(graph, input.id, 'Geometry', start.id, 'Geometry');
    addLink(graph, start.id, 'Geometry', body.id, 'Geometry');
    addLink(graph, by.id, 'Vector', body.id, 'Offset');
    addLink(graph, body.id, 'Geometry', end.id, 'Geometry');
    addLink(graph, end.id, 'Geometry', output.id, 'Geometry');
    const source = cubeMesh(2);
    const out = evalGeometryNodes(graph, source);
    out.verts.forEach((v, i) => near(v[2], source.verts[i][2] + 5));
    start.values.Iterations = 0;
    out.verts.length = 0;
    evalGeometryNodes(graph, source).verts.forEach((v, i) => near(v[2], source.verts[i][2]));
  });
  test('repeat: the iteration number reaches inside, and growth accumulates by subdividing', () => {
    const [start, grow, end] = [createNode('REPEAT_INPUT', 0, 0, { Iterations: 2 }), createNode('SUBDIVIDE_MESH'), createNode('REPEAT_OUTPUT')];
    const { graph, input, output } = tree(start, grow, end);
    addLink(graph, input.id, 'Geometry', start.id, 'Geometry');
    addLink(graph, start.id, 'Geometry', grow.id, 'Mesh');
    addLink(graph, grow.id, 'Mesh', end.id, 'Geometry');
    addLink(graph, end.id, 'Geometry', output.id, 'Geometry');
    assert.equal(evalGeometryNodes(graph, cubeMesh(2)).faces.length, 6 * 16);
  });
  test('nested repeats multiply', () => {
    const [outerStart, innerStart, body, innerEnd, outerEnd, by] = [createNode('REPEAT_INPUT', 0, 0, { Iterations: 3 }), createNode('REPEAT_INPUT', 0, 0, { Iterations: 4 }), createNode('SET_POSITION'), createNode('REPEAT_OUTPUT'), createNode('REPEAT_OUTPUT'), offset(1, 0, 0)];
    const { graph, input, output } = tree(outerStart, innerStart, body, innerEnd, outerEnd, by);
    addLink(graph, input.id, 'Geometry', outerStart.id, 'Geometry');
    addLink(graph, outerStart.id, 'Geometry', innerStart.id, 'Geometry');
    addLink(graph, innerStart.id, 'Geometry', body.id, 'Geometry');
    addLink(graph, by.id, 'Vector', body.id, 'Offset');
    addLink(graph, body.id, 'Geometry', innerEnd.id, 'Geometry');
    addLink(graph, innerEnd.id, 'Geometry', outerEnd.id, 'Geometry');
    addLink(graph, outerEnd.id, 'Geometry', output.id, 'Geometry');
    const source = cubeMesh(2);
    near(evalGeometryNodes(graph, source).verts[0][0], source.verts[0][0] + 12);
  });
  const falling = () => {
    const [start, body, end, by, scale] = [createNode('SIM_INPUT'), createNode('SET_POSITION'), createNode('SIM_OUTPUT'), createNode('COMBINE_XYZ'), createNode('MATH', 0, 0, { operation: 'MULTIPLY', B: 24 })];
    const { graph, input, output } = tree(start, body, end, by, scale);
    addLink(graph, input.id, 'Geometry', start.id, 'Geometry');
    addLink(graph, start.id, 'Geometry', body.id, 'Geometry');
    addLink(graph, start.id, 'Delta Time', scale.id, 'A');
    addLink(graph, scale.id, 'Value', by.id, 'Z');
    addLink(graph, by.id, 'Vector', body.id, 'Offset');
    addLink(graph, body.id, 'Geometry', end.id, 'Geometry');
    addLink(graph, end.id, 'Geometry', output.id, 'Geometry');
    return graph;
  };
  test('simulation: each frame grows from the last, the first is the input, and going back gives the same', () => {
    const graph = falling();
    const source = cubeMesh(2);
    const doc = { frameStart: 1, fps: 24 };
    const z = (frame) => evalGeometryNodes(graph, source, { frame, doc }).verts[0][2] - source.verts[0][2];
    near(z(1), 0);
    near(z(2), 1);
    near(z(11), 10);
    near(z(5), 4);
    near(z(40), 39);
  });
  test('changing the tree starts the simulation over', () => {
    const graph = falling();
    const source = cubeMesh(2);
    const doc = { frameStart: 1, fps: 24 };
    const z = (frame) => evalGeometryNodes(graph, source, { frame, doc }).verts[0][2] - source.verts[0][2];
    near(z(5), 4);
    graph.nodes.find((n) => n.type === 'MATH').values.B = 48;
    near(z(5), 8);
  });
  test('alone, the end nodes pass through; the checklist of zone nodes is complete', () => {
    for (const type of ['REPEAT_INPUT', 'REPEAT_OUTPUT', 'SIM_INPUT', 'SIM_OUTPUT']) assert.ok(NODE_TYPES[type].kinds.includes('GEOMETRY'));
    const { graph, input, output } = tree(createNode('SIM_OUTPUT'));
    const end = graph.nodes.at(-1);
    addLink(graph, input.id, 'Geometry', end.id, 'Geometry');
    addLink(graph, end.id, 'Geometry', output.id, 'Geometry');
    assert.equal(evalGeometryNodes(graph, cubeMesh(2)).verts.length, 8);
  });
  test('as a modifier: the frame on the document drives it', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    doc.frameStart = 1;
    doc.fps = 24;
    const graph = falling();
    const o = addObject(doc, { type: 'MESH', name: 'S', data: cubeMesh(2), modifiers: [{ type: 'NODES', name: 'Nodes', show: true, showRender: true, graph }] });
    setFrame(doc, 6);
    near(evaluatedMesh(doc, o).verts[0][2], cubeMesh(2).verts[0][2] + 5);
  });
});

describe('remesh modes', () => {
  const allQuads = (m) => m.faces.every((f) => f.length === 4);
  test('blocks: a closed all-quad shape near the size of the cube, made of grid steps', () => {
    const m = quadRemesh(cubeMesh(2), { voxel: 0.25, mode: 'BLOCKS' });
    assert.ok(allQuads(m));
    assert.ok(isManifold(m));
    near(signedVolume(m), 8, 2.5);
    assert.ok(signedVolume(m) > 0, 'faces outward');
  });
  test('smooth: surface nets, closed quads over a sphere of the right volume', () => {
    const m = quadRemesh(uvSphereMesh(32, 16, 1), { voxel: 0.1, mode: 'SMOOTH' });
    assert.ok(allQuads(m));
    assert.ok(isManifold(m));
    near(signedVolume(m), (4 / 3) * Math.PI, 0.25);
  });
  test('sharp: closer to a cube than smooth is', () => {
    const volumeError = (mode) => Math.abs(signedVolume(quadRemesh(cubeMesh(2), { voxel: 0.2, mode })) - 8);
    assert.ok(volumeError('SHARP') < volumeError('SMOOTH'), `${volumeError('SHARP')} against ${volumeError('SMOOTH')}`);
  });
  test('an empty mesh stays empty', () => {
    assert.equal(quadRemesh(createMesh(), { mode: 'BLOCKS' }).faces.length, 0);
  });
});

describe('skin hull', () => {
  const wire = (verts, loose) => { const m = createMesh(verts, []); m.loose = loose; return m; };
  test('a chain: rings at the vertices and between them, closed quads', () => {
    const m = skinHull(wire([[0, 0, 0], [0, 0, 2], [0, 0, 4]], [[0, 1], [1, 2]]), { radius: 0.3 });
    assert.equal(m.verts.length, 36);
    assert.equal(m.faces.length, 34);
    assert.ok(m.faces.every((f) => f.length === 4));
    assert.ok(isManifold(m));
    assert.ok(signedVolume(m) > 0, 'faces outward');
    near(Math.max(...m.verts.map((v) => v[0])), 0.3);
    near(Math.max(...m.verts.map((v) => v[2])), 4);
  });
  test('radius per vertex tapers it', () => {
    const mesh = wire([[0, 0, 0], [0, 0, 1]], [[0, 1]]);
    mesh.skin = { 0: 0.5, 1: 0.1 };
    const m = skinHull(mesh);
    near(Math.max(...m.verts.filter((v) => v[2] === 0).map((v) => v[0])), 0.5);
    near(Math.max(...m.verts.filter((v) => Math.abs(v[2] - 1) < 1e-9).map((v) => v[0])), 0.1);
  });
  test('a branch closes up with a hull', () => {
    const m = skinHull(wire([[0, 0, 0], [2, 0, 0], [-2, 0, 0], [0, 2, 0]], [[0, 1], [0, 2], [0, 3]]), { radius: 0.2 });
    assert.ok(isManifold(m), 'closed');
    assert.ok(signedVolume(m) > 0, 'faces outward');
  });
  test('nothing to skin: nothing', () => {
    assert.equal(skinHull(createMesh([[0, 0, 0]], [])).faces.length, 0);
  });
});

describe('Spline IK, Armature, Transformation, IK at a bone', () => {
  const chain = () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const bones = [createBone('A', [0, 0, 0], [0, 0, 1], null), createBone('B', [0, 0, 1], [0, 0, 2], 0), createBone('C', [5, 0, 0], [5, 0, 1], null), createBone('Goal', [1, 0, 1], [1, 0, 2], null)];
    return { doc, bones, arm: addObject(doc, { type: 'ARMATURE', name: 'R', data: { bones } }) };
  };
  const on = (bone, type, set) => { (bone.constraints ??= []).push({ ...createBoneConstraint(type), ...set }); };
  test('Spline IK lays the chain along the curve from start to end, stretched to it', () => {
    const { doc, bones, arm } = chain();
    const line = addObject(doc, { type: 'CURVE', name: 'L', data: { splines: [{ kind: 'POLY', cyclic: false, points: [[0, 0, 0], [4, 0, 0]] }], bevelDepth: 0, resolution: 1 } });
    on(bones[1], 'SPLINE_IK', { target: line.id, chain: 2 });
    const solved = evaluatedArmature(doc, arm);
    const poses = bonePoseMatrices(solved);
    close([poses[0].elements[12], poses[0].elements[13], poses[0].elements[14]], [0, 0, 0]);
    close([poses[1].elements[12], poses[1].elements[13], poses[1].elements[14]], [2, 0, 0]);
    near(Math.hypot(poses[1].elements[4], poses[1].elements[5], poses[1].elements[6]), 2);
    close(posedBone(solved, 0, poses).head, [0, 0, 0]);
  });
  test('Armature constraint carries a bone with another bone, by weight', () => {
    const { doc, bones, arm } = chain();
    bones[3].pose.location = [0, 2, 0];
    on(bones[2], 'ARMATURE', { target: arm.id, subtarget: 'Goal', weight: 1 });
    const carried = bonePoseMatrices(evaluatedArmature(doc, arm));
    const moved = carried[3].elements[14] - 1;
    near(carried[2].elements[14], moved, 1e-6);
    on(bones[0], 'ARMATURE', { target: arm.id, subtarget: 'Goal', weight: 0 });
    near(bonePoseMatrices(evaluatedArmature(doc, arm))[0].elements[12], 0);
  });
  test('Transformation maps a place in one range to a place in another', () => {
    const { doc, bones, arm } = chain();
    const driver = addObject(doc, { type: 'EMPTY', name: 'D', location: [5, 0, 0] });
    on(bones[2], 'TRANSFORMATION', { target: driver.id, fromMaxX: 10, toMaxX: 2, space: 'POSE' });
    near(bonePoseMatrices(evaluatedArmature(doc, arm))[2].elements[12], 6);
    driver.location = [50, 0, 0];
    near(bonePoseMatrices(evaluatedArmature(doc, arm))[2].elements[12], 7, 1e-6);
  });
  test('IK reaches the head of a bone named as its target', () => {
    const { doc, bones, arm } = chain();
    bones[1].ik = { target: arm.id, subtarget: 'Goal', pole: null, chain: 2, poleAngle: 0, influence: 1, iterations: 40 };
    close(posedBone(evaluatedArmature(doc, arm), 1).tail, [1, 0, 1], 0.02);
  });
});

describe('displacement and volume shaders', () => {
  const lit = () => { const doc = createDocument(); doc.objects.length = 0; doc.render.width = 24; doc.render.height = 24; doc.render.percent = 100; doc.render.samples = 16; doc.render.bounces = 3; return doc; };
  const material = (doc, build) => { const m = { ...defaultMaterial('M'), useNodes: true, nodes: defaultShaderGraph() }; build(m.nodes, m); doc.materials.push(m); return m; };
  const output = (g) => g.nodes.find((n) => n.type === 'OUTPUT_MATERIAL');
  test('the Displacement node: height over the midlevel, along the normal; nothing wired, no displacement', () => {
    const g = defaultShaderGraph();
    assert.equal(treeUses(g, 'Displacement'), false);
    assert.equal(evalDisplacement(g, {}), null);
    const d = createNode('DISPLACEMENT', 0, 0, { Height: 1, Midlevel: 0.5, Scale: 2 });
    g.nodes.push(d);
    linkNodes(g, d.id, 'Displacement', output(g).id, 'Displacement');
    assert.equal(treeUses(g, 'Displacement'), true);
    close(evalDisplacement(g, { normal: [0, 0, 1] }), [0, 0, 1]);
  });
  test('true displacement moves the geometry the renderer gets; bump only does not', () => {
    const doc = lit();
    const d = createNode('DISPLACEMENT', 0, 0, { Height: 1, Midlevel: 0, Scale: 0.5 });
    const m = material(doc, (g) => { g.nodes.push(d); linkNodes(g, d.id, 'Displacement', output(g).id, 'Displacement'); });
    addObject(doc, { type: 'MESH', name: 'P', data: planeMesh(2), materials: [m.id] });
    const top = () => { const p = buildRenderScene(doc).positions; let z = -Infinity; for (let i = 2; i < p.length; i += 3) z = Math.max(z, p[i]); return z; };
    near(top(), 0.5);
    m.displacementMethod = 'BUMP';
    near(top(), 0);
  });
  test('a sloped height shades as a bent surface', () => {
    const doc = lit();
    doc.world.color = [1, 1, 1];
    doc.world.useNodes = false;
    const wave = createNode('TEX_WAVE', 0, 0, { Scale: 4 });
    const d = createNode('DISPLACEMENT', 0, 0, { Midlevel: 0, Scale: 0.2 });
    const m = material(doc, (g) => { g.nodes.push(wave, d); linkNodes(g, wave.id, 'Fac', d.id, 'Height'); linkNodes(g, d.id, 'Displacement', output(g).id, 'Displacement'); });
    m.displacementMethod = 'BUMP';
    const sun = addObject(doc, { type: 'LIGHT', name: 'S', rotation: [40, 0, 0], data: { kind: 'SUN', color: [1, 1, 1], energy: 4, radius: 0, spotSize: 45, spotBlend: 0, size: 1, castShadow: true } });
    void sun;
    addObject(doc, { type: 'MESH', name: 'P', data: planeMesh(8), materials: [m.id] });
    const cam = addObject(doc, { type: 'CAMERA', name: 'C', location: [0, 0, 6], data: { kind: 'PERSP', lens: 35, sensor: 36, clipStart: 0.1, clipEnd: 100, orthoScale: 6, dofFocus: 10, dofEnabled: false, fstop: 2.8 } });
    doc.activeCamera = cam.id;
    const stripes = (r) => { const line = []; for (let x = 0; x < 24; x++) line.push(r.data[(12 * 24 + x) * 4]); return Math.max(...line) - Math.min(...line); };
    const bumped = stripes(renderImage(buildRenderScene(doc)));
    m.displacementMethod = 'TRUE';
    assert.ok(bumped > 0.1, `stripes of light: ${bumped}`);
  });
  test('a volume shader fills its mesh, evaluated per cell, and a surface-less material hides the mesh', () => {
    const doc = lit();
    const noise = createNode('TEX_CHECKER', 0, 0, { Scale: 1 });
    const v = createNode('VOLUME_PRINCIPLED', 0, 0, { Density: 3, Color: [0.2, 0.9, 0.3], Anisotropy: 0.4 });
    const m = material(doc, (g) => { g.nodes.push(noise, v); g.links = []; linkNodes(g, noise.id, 'Fac', v.id, 'Density'); linkNodes(g, v.id, 'Volume', output(g).id, 'Volume'); });
    addObject(doc, { type: 'MESH', name: 'B', data: sphereForDome(16, 8, 1), materials: [m.id] });
    const [volume] = sceneVolumes(doc);
    assert.ok(volume, 'a volume');
    assert.equal(volume.anisotropy, 0.4);
    close(volume.albedo, [0.2, 0.9, 0.3]);
    const corner = volume.density[0];
    assert.equal(corner, 0, 'nothing outside the mesh');
    assert.ok(volume.density.some((x) => x > 200), 'something inside');
    assert.equal(buildRenderScene(doc).positions.length, 0, 'no surface of its own');
    assert.deepEqual(evalVolume(defaultShaderGraph(), {}), null);
  });
  const through = (build) => {
    const doc = lit();
    doc.world.color = [1, 1, 1];
    doc.world.strength = 1;
    doc.world.useNodes = false;
    doc.render.bounces = 8;
    const m = material(doc, (g) => { g.links = []; build(g); });
    addObject(doc, { type: 'MESH', name: 'B', data: cubeMesh(2), materials: [m.id] });
    const cam = addObject(doc, { type: 'CAMERA', name: 'C', location: [0, 0, 5], data: { kind: 'PERSP', lens: 80, sensor: 36, clipStart: 0.1, clipEnd: 100, orthoScale: 6, dofFocus: 10, dofEnabled: false, fstop: 2.8 } });
    doc.activeCamera = cam.id;
    doc.render.samples = 48;
    const scene = buildRenderScene(doc);
    scene.volumes[0].n && void 0;
    const image = renderImage(scene);
    return [0, 1, 2].map((c) => { let sum = 0; let n = 0; for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) { sum += image.data[(y * 24 + x) * 4 + c]; n++; } return sum / n; });
  };
  test('absorption follows Beer per channel: looking through two units of it', () => {
    const c = through((g) => { const v = createNode('VOLUME_ABSORPTION', 0, 0, { Color: [0.5, 1, 1], Density: 1 }); g.nodes.push(v); linkNodes(g, v.id, 'Volume', output(g).id, 'Volume'); });
    // exp(-density * (1 - colour) * length): red through 2 units at 0.5 is e^-1.
    near(c[0], Math.exp(-1), 0.08);
    near(c[1], 1, 0.02);
  });
  test('anisotropy sends scattered light onward: forward scatter lets more of the bright world through', () => {
    const glow = (g) => through((graph) => { const v = createNode('VOLUME_SCATTER', 0, 0, { Color: [1, 1, 1], Density: 3, Anisotropy: g }); graph.nodes.push(v); linkNodes(graph, v.id, 'Volume', output(graph).id, 'Volume'); });
    assert.ok(glow(0.8)[0] >= glow(-0.8)[0] - 0.1, 'forward at least as bright');
  });
});

describe('baking', () => {
  const object = (mesh, doc = createDocument()) => { doc.objects.length = 0; return { doc, o: addObject(doc, { type: 'MESH', name: 'O', data: mesh }) }; };
  const flat = () => { const m = planeMesh(2); m.uvs = [[[0, 0], [1, 0], [1, 1], [0, 1]]]; return m; };
  const at = (img, x, y) => [...img.rgba.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];
  test('no UVs is a clear message', () => {
    const { doc, o } = object(cubeMesh(2));
    o.data.uvs = null;
    assert.throws(() => bakeMap(doc, o, { type: 'POSITION' }), /no UV map/);
  });
  test('position and UV land where the UVs say; a flat normal is straight up', () => {
    const { doc, o } = object(flat());
    const uv = bakeMap(doc, o, { type: 'UV', width: 16, height: 16 });
    assert.ok(at(uv, 15, 0)[0] > 230, 'U grows to the right');
    assert.ok(at(uv, 0, 0)[1] > 230, 'V at the top of the picture');
    const normal = bakeMap(doc, o, { type: 'NORMAL', width: 16, height: 16 });
    const n = at(normal, 8, 8);
    near(n[0], 127.5, 2);
    near(n[1], 127.5, 2);
    assert.ok(n[2] > 250);
  });
  test('colour comes from the material, through its tree', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const m = { ...defaultMaterial('B'), id: 'mb', baseColor: [1, 0, 0], useNodes: false, nodes: null };
    doc.materials.push(m);
    const o = addObject(doc, { type: 'MESH', name: 'O', data: flat(), materials: ['mb'] });
    const c = at(bakeMap(doc, o, { type: 'DIFFUSE', width: 8, height: 8 }), 4, 4);
    assert.ok(c[0] > 250 && c[1] < 5);
  });
  test('AO is dark in a corner, open out in the clear', () => {
    const { doc, o } = object(flat());
    const open = at(bakeMap(doc, o, { type: 'AO', width: 8, height: 8, samples: 32, distance: 2 }), 4, 4)[0];
    assert.equal(open, 255, 'nothing above it');
    addObject(doc, { type: 'MESH', name: 'Lid', data: cubeMesh(6), location: [0, 0, 3.5] });
    const covered = at(bakeMap(doc, o, { type: 'AO', width: 8, height: 8, samples: 32, distance: 2 }), 4, 4)[0];
    assert.ok(covered < 60, `under a lid ${covered}`);
  });
  test('from a detailed surface: displacement is the height above the base, and normals tilt', () => {
    const { doc, o } = object(flat());
    const high = gridMesh(16, 16, 2);
    high.verts = high.verts.map(([x, y]) => [x, y, x > 0 ? 0.25 : 0]);
    const d = bakeMap(doc, o, { type: 'DISPLACEMENT', width: 16, height: 16, high, distance: 0.5 });
    near(at(d, 12, 8)[0], 255 * (0.5 + 0.25), 3);
    near(at(d, 3, 8)[0], 127.5, 3);
    const slope = gridMesh(16, 16, 2);
    slope.verts = slope.verts.map(([x, y]) => [x, y, x * 0.5]);
    slope.smooth = false;
    const n = at(bakeMap(doc, o, { type: 'NORMAL', width: 16, height: 16, high: slope, distance: 1 }), 8, 8);
    assert.ok(n[0] < 90, `leans back along U: ${n}`);
  });
  test('multiresolution detail bakes through the same way', () => {
    const { doc, o } = object(flat());
    const mod = { type: 'MULTIRES', levels: 2, total: 2, disp: null };
    const top = multiresEvaluate(o.data, mod, catmullClark);
    mod.disp = top.verts.map(() => [0, 0, 0.2]);
    const detail = multiresEvaluate(o.data, mod, catmullClark);
    near(at(bakeMap(doc, o, { type: 'DISPLACEMENT', width: 8, height: 8, high: detail, mesh: o.data, distance: 0.5 }), 4, 4)[0], 255 * 0.7, 4);
  });
  test('a margin spreads past the island', () => {
    const { doc, o } = object(planeMesh(2));
    o.data.uvs = [[[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]]];
    const img = bakeMap(doc, o, { type: 'UV', width: 16, height: 16, margin: 2 });
    assert.ok(img.rgba[(8 * 16 + 2) * 4 + 3] === 255, 'two pixels out');
    assert.equal(img.rgba[(8 * 16 + 0) * 4 + 3], 0, 'not further');
  });
});

describe('angle based unwrapping', () => {
  const dome = () => {
    const whole = uvSphereMesh(24, 12, 1);
    const keep = whole.verts.map((v) => v[2] >= -0.01);
    const m = cloneDome(whole, keep);
    return m;
  };
  const cloneDome = (mesh, keep) => {
    const map = new Map();
    const verts = [];
    mesh.verts.forEach((v, i) => { if (keep[i]) { map.set(i, verts.length); verts.push(v); } });
    return createMesh(verts, mesh.faces.filter((f) => f.every((v) => keep[v])).map((f) => f.map((v) => map.get(v))));
  };
  test('it keeps a dome\'s angles at least as well as conformal maps', () => {
    const measure = (method) => { const m = dome(); unwrapSeams(m, { method }); return angleDistortion(m); };
    assert.ok(measure('ANGLE_BASED') <= measure('CONFORMAL') * 1.05, `${measure('ANGLE_BASED')} against ${measure('CONFORMAL')}`);
  });
  test('a flat sheet stays exactly itself', () => {
    const m = gridMesh(6, 6, 2);
    unwrapSeams(m);
    assert.ok(angleDistortion(m) < 1, `worst angle off by ${angleDistortion(m)}`);
  });
  test('the operator offers both', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const o = addObject(doc, { type: 'MESH', name: 'D', data: dome() });
    doc.activeId = o.id;
    doc.selected = [o.id];
    run({ doc }, 'uv.unwrap', { method: 'CONFORMAL' });
    const first = JSON.stringify(o.data.uvs);
    run({ doc }, 'uv.unwrap', { method: 'ANGLE_BASED' });
    assert.notEqual(JSON.stringify(o.data.uvs), first);
  });
});

describe('the action library and the Action constraint', () => {
  const rigWithAction = () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const bones = [createBone('Root', [0, 0, 0], [0, 0, 1], null), createBone('C', [5, 0, 0], [5, 0, 1], null)];
    const arm = addObject(doc, { type: 'ARMATURE', name: 'R', data: { bones } });
    // A library action that moves a bone called C: one unit along its own X from frame 1 to 11.
    const holder = {};
    insertKey(holder, 'bones.0.pose.location.0', 1, 0, 'LINEAR');
    insertKey(holder, 'bones.0.pose.location.0', 11, 2, 'LINEAR');
    const action = storeAction(doc, holder, 'Slide', ['C']);
    const driver = addObject(doc, { type: 'EMPTY', name: 'D', location: [5, 0, 0] });
    return { doc, bones, arm, action, driver };
  };
  const headOf = (doc, arm, i) => posedBone(evaluatedArmature(doc, arm), i).head;
  test('stored actions are copies with unique names, and assigning finds bones by name', () => {
    const { doc, action } = rigWithAction();
    const again = storeAction(doc, { anim: { fcurves: action.fcurves } }, 'Slide', ['C']);
    assert.equal(again.name, 'Slide.001');
    again.fcurves['bones.0.pose.location.0'][0].v = 9;
    assert.equal(action.fcurves['bones.0.pose.location.0'][0].v, 0, 'the library keeps its own keys');
    assert.deepEqual(actionRange(action), [1, 11]);
    const target = {};
    assignAction(target, action, ['Root', 'C']);
    assert.deepEqual(Object.keys(target.anim.fcurves), ['bones.1.pose.location.0'], 'C is the second bone here');
    const pose = actionBonePose(action, 'C', 7, 6);
    close(pose.location, [1, 0, 0]);
    assert.equal(actionBonePose(action, 'Root', 0, 6), null, 'an action that does not move a bone leaves it');
  });
  test('the target picks the frame: half way along its range is half way through the action, clamped at the ends', () => {
    const { doc, bones, arm, action, driver } = rigWithAction();
    bones[1].constraints = [{ ...createBoneConstraint('ACTION'), target: driver.id, action: action.id, channel: 'LOCATION_X', min: 0, max: 10, frameStart: 1, frameEnd: 11, mix: 'REPLACE' }];
    const rest = new Vector3().setFromMatrixColumn(restBoneMatrix(bones[1]), 0).toArray();
    close(headOf(doc, arm, 1), [5 + rest[0], rest[1], rest[2]]);
    driver.location = [50, 0, 0];
    close(headOf(doc, arm, 1), [5 + rest[0] * 2, rest[1] * 2, rest[2] * 2]);
    driver.location = [-3, 0, 0];
    close(headOf(doc, arm, 1), [5, 0, 0]);
    Object.assign(bones[1].constraints[0], { useEvalTime: true, evalTime: 0.25 });
    close(headOf(doc, arm, 1), [5 + rest[0] * 0.5, rest[1] * 0.5, rest[2] * 0.5]);
    bones[1].constraints[0].influence = 0;
    close(headOf(doc, arm, 1), [5, 0, 0]);
  });
  test('before and after mix the action on either side of the bone\'s own pose', () => {
    const { doc, bones, arm, action, driver } = rigWithAction();
    bones[1].pose.rotation = [0, 0, 90];
    const at = (mix) => { bones[1].constraints = [{ ...createBoneConstraint('ACTION'), target: driver.id, action: action.id, min: 0, max: 10, frameStart: 1, frameEnd: 11, mix }]; return headOf(doc, arm, 1); };
    const [before, after, split] = [at('BEFORE_FULL'), at('AFTER_FULL'), at('BEFORE_SPLIT')];
    for (const p of [before, after, split]) near(Math.hypot(p[0] - 5, p[1], p[2]), 1, 1e-6);
    near(Math.hypot(before[0] - after[0], before[1] - after[1], before[2] - after[2]), Math.SQRT2, 1e-6);
    close(split, before, 1e-6);
    assert.equal(createBoneConstraint('ACTION').mix, 'BEFORE_SPLIT', 'Blender\'s default');
  });
  test('operators key a pose, save it, assign it, play it as a strip, and deleting it leaves constraints reading nothing', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const bones = [createBone('A', [0, 0, 0], [0, 0, 1], null), createBone('B', [0, 0, 1], [0, 0, 2], 0)];
    const arm = addObject(doc, { type: 'ARMATURE', name: 'R', data: { bones } });
    doc.activeId = arm.id;
    doc.selected = [arm.id];
    const ctx = { doc };
    doc.mode = 'POSE';
    run(ctx, 'anim.keyframe_insert');
    assert.equal(Object.keys(arm.data.anim.fcurves).length, 18, 'in pose mode every bone is keyed on the data');
    bones[1].pose.rotation = [30, 0, 0];
    setFrame(doc, 10);
    bones[1].pose.rotation = [30, 0, 0];
    run(ctx, 'pose.keyframe_insert', { bone: 1, type: 'Rotation' });
    run(ctx, 'action.new', { name: 'Bend' });
    assert.equal(doc.actions[0].name, 'Bend');
    assert.deepEqual(doc.actions[0].bones, ['A', 'B']);
    arm.data.anim.fcurves = {};
    bones[1].pose.rotation = [0, 0, 0];
    run(ctx, 'action.assign', { index: 0 });
    setFrame(doc, 10);
    near(bones[1].pose.rotation[0], 30);
    arm.data.anim.fcurves = {};
    bones[1].pose.rotation = [0, 0, 0];
    setFrame(doc, 20);
    run(ctx, 'action.strip_add', { index: 0 });
    const strip = arm.anim.nla[0];
    assert.ok(Object.keys(strip.action).every((p) => p.startsWith('data.bones.')), 'on the object, reaching the bones through the data');
    setFrame(doc, 29);
    near(bones[1].pose.rotation[0], 30);
    bones[0].constraints = [{ ...createBoneConstraint('ACTION'), action: doc.actions[0].id }];
    run(ctx, 'action.remove', { index: 0 });
    assert.equal(doc.actions.length, 0);
    assert.equal(bones[0].constraints[0].action, '');
    assert.doesNotThrow(() => evaluatedArmature(doc, arm));
  });
});

describe('grease pencil sculpting, interpolation and modifiers', () => {
  const line = (y = 0, n = 11, frame = 1) => ({ points: Array.from({ length: n }, (_, i) => [i / (n - 1) * 2 - 1, y, 0]), width: 2, frame });
  test('brushes act only near where they pass: thickness, strength, push, pinch, twist, smooth, randomize', () => {
    const s = line();
    sculptStrokes([s], 'THICKNESS', [[1, 0, 0]], { radius: 0.5, strength: 1 });
    assert.ok(s.pressure.at(-1) > 1 && s.pressure[0] === 1, 'thicker at the brush, unchanged far away');
    sculptStrokes([s], 'STRENGTH', [[1, 0, 0]], { radius: 0.5, strength: 1, invert: true });
    assert.ok(s.strength.at(-1) < 1 && s.strength[0] === 1);
    const pushed = line();
    sculptStrokes([pushed], 'PUSH', [[0, 0, 0], [0, 0.2, 0]], { radius: 0.3, strength: 1 });
    near(pushed.points[5][1], 0.2, 1e-9);
    near(pushed.points[0][1], 0, 1e-12);
    const pinched = line();
    sculptStrokes([pinched], 'PINCH', [[0, 0, 0]], { radius: 0.5, strength: 1 });
    assert.ok(Math.abs(pinched.points[4][0]) < 0.2, 'drawn in towards the brush');
    const twisted = line();
    sculptStrokes([twisted], 'TWIST', [[0, 0, 0]], { radius: 0.5, strength: 1, normal: [0, 0, 1] });
    assert.ok(twisted.points[6][1] > 0 && twisted.points[4][1] < 0, 'turned about the view axis');
    near(Math.hypot(...twisted.points[6]), 0.2, 1e-9);
    const wavy = { points: [[-1, 0, 0], [-0.5, 0.3, 0], [0, -0.3, 0], [0.5, 0.3, 0], [1, 0, 0]], width: 2 };
    sculptStrokes([wavy], 'SMOOTH', [[0, 0, 0]], { radius: 2, strength: 1 });
    assert.ok(Math.abs(wavy.points[2][1]) < 0.3);
    const shaken = line();
    sculptStrokes([shaken], 'RANDOMIZE', [[0, 0, 0]], { radius: 0.5, strength: 1 });
    assert.ok(shaken.points.some((p) => p[1] !== 0) && shaken.points[0][1] === 0);
    assert.equal(sculptStrokes([line()], 'PUSH', [[5, 5, 5]], { radius: 0.1 }), 0, 'nothing in reach');
  });
  test('grab carries the points it first touched, all the way', () => {
    const s = line();
    sculptStrokes([s], 'GRAB', [[1, 0, 0], [1, 0.5, 0], [1, 1, 0]], { radius: 0.3 });
    close(s.points.at(-1), [1, 1, 0]);
    close(s.points[0], [-1, 0, 0]);
  });
  test('thicker points make a wider ribbon, and a weaker stroke is drawn fainter', () => {
    const s = line(0, 3);
    s.pressure = [1, 3, 1];
    s.strength = [0.5, 0.5, 0.5];
    const [part] = gpencilMeshes({ layers: [{ name: 'L', color: [0, 0, 0], strokes: [s] }] }, 1);
    near(Math.abs(part.lines.verts[2][1] - part.lines.verts[3][1]) / Math.abs(part.lines.verts[0][1] - part.lines.verts[1][1]), 3, 1e-9);
    near(part.opacity, 0.5);
  });
  test('interpolation fills the frames between two drawings, stroke by stroke, with easing', () => {
    const layer = { name: 'L', keyed: true, strokes: [line(0, 5, 1), { ...line(2, 9, 11), width: 4 }] };
    assert.deepEqual(neighbourDrawings(layer, 6), { before: 1, after: 11 });
    const [made] = interpolateDrawing(layer, 6);
    assert.equal(made.points.length, 9);
    for (const p of made.points) near(p[1], 1, 1e-9);
    near(made.width, 3);
    assert.equal(strokesAt(layer, 6)[0], made);
    const [eased] = interpolateDrawing(layer, 6, 'EASE_IN');
    near(eased.points[0][1], 0.5, 1e-9);
    assert.equal(layer.strokes.filter((x) => x.frame === 6).length, 1, 'interpolating again replaces the drawing at that frame');
    assert.equal(interpolateDrawing(layer, 20), null, 'nothing after the last drawing');
    const doc = createDocument();
    const ctx = { doc };
    run(ctx, 'object.gpencil_add');
    const o = doc.objects.find((x) => x.id === doc.activeId);
    o.data.layers[0].strokes = [line(0, 5, 1), line(2, 5, 5)];
    setFrame(doc, 2);
    run(ctx, 'gpencil.interpolate_sequence');
    assert.deepEqual([...new Set(o.data.layers[0].strokes.map((x) => x.frame))].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  });
  test('modifiers change what is drawn and leave the strokes', () => {
    const s = line(0, 5);
    const data = { layers: [{ name: 'L', color: [0, 0, 0], opacity: 1, strokes: [s] }, { name: 'Other', color: [0, 0, 1], strokes: [line(1, 5)] }], modifiers: [] };
    const shown = (layer = data.layers[0], frame = 1) => applyGPModifiers(data, layer, layer.strokes, frame);
    for (const type of Object.keys(GP_MODIFIERS)) assert.equal(createGPModifier(type).type, type);
    data.modifiers = [{ ...createGPModifier('ARRAY'), count: 3, offset: [0, 1, 0] }];
    assert.equal(shown().strokes.length, 3);
    data.modifiers.push({ ...createGPModifier('MIRROR'), x: false, y: true });
    assert.equal(shown().strokes.length, 6);
    data.modifiers = [{ ...createGPModifier('THICKNESS'), factor: 2 }, { ...createGPModifier('OFFSET'), location: [0, 0, 1] }, { ...createGPModifier('TINT'), color: [1, 0, 0], factor: 1 }, { ...createGPModifier('OPACITY'), factor: 0.5 }];
    const r = shown();
    assert.deepEqual(r.strokes[0].pressure, [2, 2, 2, 2, 2]);
    near(r.strokes[0].points[0][2], 1);
    assert.deepEqual(r.color, [1, 0, 0]);
    near(r.opacity, 0.5);
    assert.equal(s.points[0][2], 0, 'the stroke itself is unchanged');
    assert.equal(s.pressure, undefined);
    data.modifiers = [{ ...createGPModifier('BUILD'), start: 1, length: 10 }];
    assert.equal(shown(data.layers[0], 1).strokes.length, 0, 'nothing yet at the start');
    assert.equal(shown(data.layers[0], 6).strokes[0].points.length, 3, 'half way: half the points');
    assert.equal(shown(data.layers[0], 30).strokes[0].points.length, 5);
    data.modifiers = [{ ...createGPModifier('SUBDIVIDE'), levels: 2 }, { ...createGPModifier('SMOOTH') }, { ...createGPModifier('NOISE'), factor: 0.1 }, { ...createGPModifier('SIMPLIFY'), tolerance: 0 }];
    assert.equal(shown().strokes[0].points.length, 17);
    data.modifiers = [{ ...createGPModifier('THICKNESS'), layer: 'Other', factor: 3 }];
    assert.equal(shown().strokes[0].pressure, undefined, 'limited to the other layer');
    assert.deepEqual(shown(data.layers[1]).strokes[0].pressure, [3, 3, 3, 3, 3]);
    const doc = createDocument();
    const ctx = { doc };
    run(ctx, 'object.gpencil_add');
    run(ctx, 'gpencil.modifier_add', { type: 'ARRAY' });
    run(ctx, 'gpencil.stroke_add', { points: [[0, 0, 0], [1, 0, 0]] });
    const o = doc.objects.find((x) => x.id === doc.activeId);
    assert.equal(gpencilMeshes(o.data, doc.frame)[0].lines.faces.length, 3);
    run(ctx, 'gpencil.modifier_remove', { index: 0 });
    assert.equal(o.data.modifiers.length, 0);
  });
  test('erasing, simplifying and subdividing keep each point\'s pressure with it', () => {
    const s = { ...line(0, 5), pressure: [1, 2, 3, 4, 5] };
    const layer = { strokes: [s] };
    eraseAt(layer, [0, 0, 0], 0.1);
    assert.deepEqual(layer.strokes.map((x) => x.pressure), [[1, 2], [4, 5]]);
    const t = subdivideStroke({ ...line(0, 2), pressure: [1, 3] });
    assert.deepEqual(t.pressure, [1, 2, 3]);
    const u = simplifyStroke({ ...line(0, 5), pressure: [1, 2, 3, 4, 5] }, 0.01);
    assert.deepEqual(u.pressure, [1, 5]);
  });
});

describe('liquid surface tension and foam', () => {
  const cubeOfLiquid = (velocity = [0, 0, 0]) => {
    const l = createLiquid([-1, -1, -1], [1, 1, 1], 16);
    addLiquidBox(l, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5], { perCell: 8, velocity });
    return l;
  };
  const spread = (l) => {
    const c = [0, 1, 2].map((a) => l.particles.reduce((s, p) => s + p[a], 0) / l.particles.length);
    const r = l.particles.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])).sort((a, b) => b - a);
    return r.slice(0, Math.ceil(r.length * 0.02)).reduce((s, x) => s + x, 0) / Math.ceil(r.length * 0.02);
  };
  test('without gravity a cube of liquid keeps its corners, and with surface tension it pulls them in', () => {
    const [still, tense] = [cubeOfLiquid(), cubeOfLiquid()];
    const before = spread(still);
    for (let i = 0; i < 12; i++) {
      liquidStep(still, { gravity: [0, 0, 0] });
      liquidStep(tense, { gravity: [0, 0, 0], tension: 0.05 });
    }
    near(spread(still), before, before * 0.02);
    assert.ok(spread(tense) < before * 0.95, `corners ${spread(tense)} against ${before}`);
    assert.equal(tense.particles.length, still.particles.length, 'no liquid lost');
  });
  test('a fast surface throws spray that falls, and still liquid makes none', () => {
    const calm = cubeOfLiquid();
    assert.equal(stepSecondary(calm, [], { dt: 1 / 24 }).length, 0);
    const fast = cubeOfLiquid([4, 0, 0]);
    let bits = stepSecondary(fast, [], { dt: 1 / 24, threshold: 1, rate: 200 });
    assert.ok(bits.length > 20, `${bits.length} born`);
    for (let i = 0; i < 6; i++) { liquidStep(fast, { gravity: [0, 0, -9.81] }); bits = stepSecondary(fast, bits, { dt: 1 / 24, threshold: 1, rate: 200, seed: i + 2 }); }
    const kinds = new Set(bits.map((b) => b.kind));
    assert.ok(kinds.has(0), 'some are spray, out in the air');
    assert.ok(bits.filter((b) => b.kind === 0).some((b) => b.v[2] < -0.5), 'spray falls');
    for (const b of bits) assert.ok(b.life > 0);
  });
  test('a baked domain with foam draws it in the second material slot', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    doc.frameStart = 1;
    doc.frameEnd = 4;
    const domain = addObject(doc, { type: 'MESH', name: 'Domain', data: cubeMesh(2), fluid: { ...defaultLiquidDomain(), res: 10, foam: true, foamThreshold: 0.5, foamRate: 400 } });
    addObject(doc, { type: 'MESH', name: 'Flow', data: cubeMesh(1), location: [0, 0, 0.4], fluidFlow: { kind: 'GEOMETRY', velocity: [5, 0, 0] } });
    doc.activeId = domain.id;
    run({ doc }, 'object.fluid_foam_material');
    assert.equal(doc.materials.find((m) => m.id === domain.materials[1]).name, 'Foam');
    const cache = bakeLiquid(doc, domain);
    assert.ok(Object.values(cache.frames).some((f) => f.foam.length > 0));
    const f = Number(Object.keys(cache.frames).find((k) => cache.frames[k].foam.length));
    const mesh = liquidMeshAt(doc, domain, f);
    assert.equal(mesh.faceMat.filter((m) => m === 1).length, cache.frames[f].foam.length * 8);
    clearSimCache(domain.id);
  });
});

describe('ocean foam and paint waves', () => {
  test('an ocean marks foam where choppy waves fold, more of it with coverage, and a render whitens there', () => {
    const calm = oceanMesh({ resolution: 32, size: 20, windSpeed: 12, choppiness: 0, useFoam: true });
    assert.ok(Math.max(...calm.foam) < 0.01, 'no chop, no folding');
    const rough = oceanMesh({ resolution: 32, size: 20, windSpeed: 20, choppiness: 2.5, useFoam: true });
    const covered = oceanMesh({ resolution: 32, size: 20, windSpeed: 20, choppiness: 2.5, useFoam: true, foamCoverage: 0.3 });
    const mean = (m) => m.foam.reduce((a, b) => a + b, 0) / m.foam.length;
    assert.ok(mean(rough) > mean(calm), `rough ${mean(rough)}`);
    assert.ok(mean(covered) > mean(rough));
    assert.equal(rough.colors.length, rough.verts.length);
    assert.equal(rough.attributes.foam, rough.foam, 'readable by Named Attribute');
    assert.equal(oceanMesh({ resolution: 8 }).foam, undefined, 'off unless asked');
    const doc = createDocument();
    doc.objects.length = 0;
    const sea = addObject(doc, { type: 'MESH', name: 'Sea', data: planeMesh(2), modifiers: [{ type: 'OCEAN', ...Object.fromEntries(Object.entries(MODIFIERS.OCEAN.props).map(([k, p]) => [k, p.def])), resolution: 16, size: 10, windSpeed: 20, choppiness: 2.5, useFoam: true, foamCoverage: 0.5, enabled: true }] });
    const m = { ...defaultMaterial('Water'), baseColor: [0, 0, 0.2] };
    doc.materials.push(m);
    sea.materials = [m.id];
    const scene = buildRenderScene(doc, { width: 4, height: 4 });
    assert.ok(scene.vertexColors, 'foam reaches the renderer');
    const values = [...scene.vertexColors].filter((x) => x >= 0);
    assert.ok(values.some((x) => x > 0.5), 'whitened in places');
  });
  test('a wave canvas dips under a brush and the dip spreads and dies away', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    doc.frameStart = 1;
    doc.frameEnd = 40;
    const canvas = addObject(doc, { type: 'MESH', name: 'Water', data: gridMesh(20, 20, 4), dynamicPaint: { ...defaultDynamicPaint('CANVAS'), surface: 'WAVE' } });
    const brush = addObject(doc, { type: 'MESH', name: 'Drop', data: cubeMesh(0.2), location: [0, 0, 0], dynamicPaint: { ...defaultDynamicPaint('BRUSH'), radius: 0.3 } });
    insertKey(brush, 'location.2', 1, 0, 'CONSTANT');
    insertKey(brush, 'location.2', 3, 5, 'CONSTANT');
    const cache = bakeDynamicPaint(doc, canvas);
    const centre = canvas.data.verts.reduce((best, v, i) => (Math.hypot(v[0], v[1]) < Math.hypot(canvas.data.verts[best][0], canvas.data.verts[best][1]) ? i : best), 0);
    const edge = canvas.data.verts.findIndex((v) => Math.abs(v[0] - 1) < 0.15 && Math.abs(v[1]) < 0.15);
    assert.ok(cache.frames[2].wave[centre] < -0.05, 'pressed down where the brush is');
    assert.ok(Math.max(...Array.from({ length: 20 }, (_, k) => Math.abs(cache.frames[k + 3].wave[edge]))) > 1e-3, 'the ring reaches further out');
    const energy = (f) => { const w = cache.frames[f].wave; const mean = w.reduce((a, b) => a + b, 0) / w.length; return w.reduce((sum, x) => sum + (x - mean) ** 2, 0); };
    assert.ok(energy(40) < energy(5) * 0.5, 'it dies away');
    setFrame(doc, 2);
    const shown = evaluatedMesh(doc, canvas);
    assert.ok(shown.verts[centre][2] < -0.05, 'the mesh moves with it');
    assert.equal(shown.colors, null, 'a wave surface is not painted');
  });
});

describe('the Action constraint on objects', () => {
  test('a dial picks a frame of an action that moves the object', () => {
    const doc = createDocument();
    doc.objects.length = 0;
    const dial = addObject(doc, { type: 'EMPTY', name: 'Dial', location: [0, 0, 0] });
    const box = addObject(doc, { type: 'EMPTY', name: 'Box', location: [0, 0, 1] });
    const holder = {};
    insertKey(holder, 'location.1', 1, 0, 'LINEAR');
    insertKey(holder, 'location.1', 11, 4, 'LINEAR');
    const action = storeAction(doc, holder, 'Lift');
    box.constraints = [{ ...createConstraint('ACTION'), target: dial.id, action: action.id, channel: 'ROTATION_Z', min: 0, max: 90, frameStart: 1, frameEnd: 11 }];
    close(worldPosition(doc, box), [0, 0, 1]);
    dial.rotation = [0, 0, 45];
    close(worldPosition(doc, box), [0, 2, 1], 1e-6);
    dial.rotation = [0, 0, 180];
    close(worldPosition(doc, box), [0, 4, 1], 1e-6);
    box.constraints[0].mix = 'REPLACE';
    close(worldPosition(doc, box), [0, 4, 0], 1e-6);
    box.constraints[0].influence = 0.5;
    close(worldPosition(doc, box), [0, 2, 0.5], 1e-6);
  });
});

import { CONSTRAINTS as OBJECT_CONSTRAINTS, CONSTRAINT_GROUPS, cacheMatrix } from '../../src/core/doc.js';
import { createArmature } from '../../src/core/armature.js';
import { exportABC, readABCTransforms } from '../../src/core/alembic.js';
import { addTransformCache } from '../../src/core/ops.js';
import { Matrix4 } from 'three';

describe('Every object constraint: shrinkwrap, transformation, armature, transform cache', () => {
  const at = (doc, o) => { const e = worldMatrix(doc, o).elements; return [e[12], e[13], e[14]].map((x) => +x.toFixed(4) + 0); };
  test('all 26 of Blender\'s object constraints, each in one menu group', () => {
    assert.equal(Object.keys(OBJECT_CONSTRAINTS).length, 26);
    const grouped = CONSTRAINT_GROUPS.flatMap((g) => g.types);
    assert.deepEqual([...grouped].sort(), Object.keys(OBJECT_CONSTRAINTS).sort());
    for (const type of grouped) assert.equal(createConstraint(type).type, type);
  });
  test('Shrinkwrap: onto the nearest surface, a distance away, along an axis, or to a vertex', () => {
    const doc = createDocument();
    const floor = addObject(doc, { type: 'MESH', name: 'Floor', data: cubeMesh(2) });
    const e = addObject(doc, { type: 'EMPTY', name: 'E', location: [0.3, 0.2, 5], data: {} });
    const c = { ...createConstraint('SHRINKWRAP'), target: floor.id };
    e.constraints = [c];
    assert.deepEqual(at(doc, e), [0.3, 0.2, 1]);
    c.distance = 1;
    assert.deepEqual(at(doc, e), [0.3, 0.2, 2]);
    c.distance = 0;
    c.mode = 'NEAREST_VERTEX';
    assert.deepEqual(at(doc, e), [1, 1, 1]);
    // Along −Z from beside the cube nothing is hit, and it stays.
    c.mode = 'PROJECT';
    e.location = [5, 0, 5];
    assert.deepEqual(at(doc, e), [5, 0, 5]);
    e.location = [0.5, -0.5, 5];
    assert.deepEqual(at(doc, e), [0.5, -0.5, 1]);
    // The target as drawn: moved and scaled.
    floor.location = [0, 0, -3];
    floor.scale = [1, 1, 2];
    assert.deepEqual(at(doc, e), [0.5, -0.5, -1]);
    c.influence = 0.5;
    assert.deepEqual(at(doc, e), [0.5, -0.5, 2]);
  });
  test('Transformation: the target\'s share of its range becomes the owner\'s, added to location or rotation', () => {
    const doc = createDocument();
    const drv = addObject(doc, { type: 'EMPTY', name: 'Drv', location: [0.5, 0, 0], data: {} });
    const o = addObject(doc, { type: 'EMPTY', name: 'O', location: [0, 5, 0], data: {} });
    const c = { ...createConstraint('TRANSFORMATION'), target: drv.id, fromMaxX: 2, toMaxX: 3 };
    o.constraints = [c];
    assert.deepEqual(at(doc, o), [0.75, 5, 0]);
    drv.location = [9, 0, 0];
    assert.deepEqual(at(doc, o), [3, 5, 0], 'held at the end of the range');
    c.toType = 'ROTATION';
    c.toMaxX = 90;
    const y = new Vector3().setFromMatrixColumn(worldMatrix(doc, o), 1);
    assert.deepEqual(y.toArray().map((x) => +x.toFixed(6) + 0), [0, 0, 1], 'turned 90° about X');
    c.toType = 'SCALE';
    c.toMinX = 1; c.toMaxX = 2; c.toMinY = 1; c.toMaxY = 1; c.toMinZ = 1; c.toMaxZ = 1;
    assert.ok(Math.abs(new Vector3().setFromMatrixColumn(worldMatrix(doc, o), 0).length() - 2) < 1e-9);
  });
  test('Armature: an object follows a bone as a skinned vertex would, weighted between two', () => {
    const doc = createDocument();
    const arm = createArmature();
    arm.bones = [createBone('A', [0, 0, 0], [0, 0, 1]), createBone('B', [2, 0, 0], [2, 0, 1])];
    const rig = addObject(doc, { type: 'ARMATURE', name: 'Rig', location: [0, 0, 0], data: arm });
    const rider = addObject(doc, { type: 'EMPTY', name: 'Rider', location: [0, 0, 1], data: {} });
    rider.constraints = [{ ...createConstraint('ARMATURE'), target: rig.id, subtarget: 'A' }];
    assert.deepEqual(at(doc, rider), [0, 0, 1], 'at rest it stays');
    arm.bones[0].pose.rotation = [90, 0, 0];
    // A rider at the bone's tail goes where the posed tail goes; one below the bone's head swings the other way.
    const tail = posedBone(arm, 0).tail.map((x) => +x.toFixed(4) + 0);
    assert.deepEqual(at(doc, rider), tail, 'turned with the bone');
    rig.location = [0, 0, 2];
    assert.deepEqual(at(doc, rider), [-tail[0] + 0, -tail[1] + 0, 2 - tail[2]], 'about the bone where the armature stands');
    rider.constraints[0] = { ...rider.constraints[0], target2: rig.id, subtarget2: 'B', weight2: 1 };
    rig.location = [0, 0, 0];
    assert.deepEqual(at(doc, rider), [tail[0] / 2, tail[1] / 2, (tail[2] + 1) / 2], 'half each');
  });
  test('Transform Cache: matrices per sample from an Alembic file, blended between frames', () => {
    const bytes = exportABC([{ name: 'Box', mesh: cubeMesh(2) }]);
    const read = readABCTransforms(bytes);
    const path = Object.keys(read.samples).find((p) => p.endsWith('/Box'));
    assert.ok(path, `paths: ${Object.keys(read.samples)}`);
    assert.equal(read.count, 1);
    const id = new Matrix4().elements;
    read.samples[path][0].forEach((x, i) => assert.ok(Math.abs(x - id[i]) < 1e-9, 'Z up again, axes and all'));
    // Two samples a frame apart: frame 1.5 is half way.
    const cache = { id: 'k', start: 1, samples: { '/A': [new Matrix4().makeTranslation(0, 0, 0).elements, new Matrix4().makeTranslation(2, 0, 4).elements] } };
    assert.deepEqual(cacheMatrix(cache, '/A', 1.5).elements.slice(12, 15), [1, 0, 2]);
    assert.deepEqual(cacheMatrix(cache, '/A', 9).elements.slice(12, 15), [2, 0, 4], 'held after the last');
    const doc = createDocument();
    doc.caches.push(cache);
    const o = addObject(doc, { type: 'EMPTY', name: 'A', location: [5, 5, 5], data: {} });
    o.constraints = [{ ...createConstraint('TRANSFORM_CACHE'), cache: 'k', objectPath: '/A' }];
    setFrame(doc, 2);
    assert.deepEqual(at(doc, o), [2, 0, 4], 'in place of its own');
  });
  test('opening a cache file gives an empty Transform Cache its cache and the path named like the object', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'EMPTY', name: 'Box', data: {} });
    doc.activeId = o.id;
    o.constraints = [createConstraint('TRANSFORM_CACHE')];
    const cache = addTransformCache(doc, 'box.abc', exportABC([{ name: 'Box', mesh: cubeMesh(2) }]));
    assert.equal(o.constraints[0].cache, cache.id);
    assert.ok(o.constraints[0].objectPath.endsWith('/Box'));
    run({ doc }, 'cachefile.remove', { cache: cache.id });
    assert.equal(doc.caches.length, 0);
    assert.equal(o.constraints[0].cache, '');
  });
});

import { exportFBXScene, importFBXScene } from '../../src/core/fbxscene.js';
import { defaultCamera, defaultLight } from '../../src/core/doc.js';

describe('FBX: cameras, lights and shape keys travel', () => {
  const build = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    const cam = addObject(doc, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 32, clipStart: 0.5, clipEnd: 250 } });
    addObject(doc, { type: 'EMPTY', name: 'OnCam', parent: cam.id, location: [0, 0, -2], data: {} });
    addObject(doc, { type: 'CAMERA', name: 'Ortho', rotation: [23, 0, -17], data: { ...defaultCamera(), kind: 'ORTHO', orthoScale: 7 } });
    addObject(doc, { type: 'LIGHT', name: 'Spot', location: [0, -3, 4], rotation: [17, 6, 40], data: { ...defaultLight('SPOT'), energy: 800, color: [1, 0.5, 0.25], spotSize: 60, spotBlend: 0.25, castShadow: false } });
    addObject(doc, { type: 'LIGHT', name: 'Panel', data: { ...defaultLight('AREA'), energy: 300 } });
    const mesh = cubeMesh(2);
    mesh.shapeKeys = [{ name: 'Up', value: 0.25, verts: mesh.verts.map((v) => [v[0], v[1], v[2] > 0 ? v[2] + 1 : v[2]]) }];
    const morph = addObject(doc, { type: 'MESH', name: 'Morph', location: [4, 0, 0], data: mesh });
    morph.data.anim = { fcurves: {}, nla: [] };
    insertKey(morph.data, 'shapeKeys.0.value', 1, 0, 'LINEAR');
    insertKey(morph.data, 'shapeKeys.0.value', 11, 1, 'LINEAR');
    setFrame(doc, 1);
    return doc;
  };
  test('read back: kinds, settings, places and the way they face', () => {
    const doc = build();
    const back = createDocument();
    back.objects = [];
    back.fps = 24;
    const list = importFBXScene(back, exportFBXScene(doc));
    for (const o of doc.objects) {
      const got = list.find((x) => x.name === o.name);
      assert.ok(got, o.name);
      assert.equal(got.type, o.type, o.name);
      const [a, b] = [worldMatrix(doc, o).elements, worldMatrix(back, got).elements];
      a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, `${o.name} [${i}] ${x} and ${b[i]}`));
    }
    const named = (n) => list.find((x) => x.name === n).data;
    assert.deepEqual([named('Cam').lens, +named('Cam').sensor.toFixed(6), named('Cam').clipStart, named('Cam').clipEnd], [35, 32, 0.5, 250]);
    assert.deepEqual([named('Ortho').kind, named('Ortho').orthoScale], ['ORTHO', 7]);
    const spot = named('Spot');
    assert.deepEqual([spot.kind, spot.energy, spot.color, spot.spotSize, +spot.spotBlend.toFixed(6), spot.castShadow], ['SPOT', 800, [1, 0.5, 0.25], 60, 0.25, false]);
    assert.equal(named('Panel').kind, 'AREA');
    const keys = named('Morph').shapeKeys;
    assert.equal(keys.length, 1);
    assert.equal(keys[0].name, 'Up');
    assert.deepEqual(keys[0].verts, doc.objects.find((o) => o.name === 'Morph').data.shapeKeys[0].verts);
    // The key's value is keyed: frame 6 is half way, as it was.
    setFrame(back, 6);
    assert.ok(Math.abs(named('Morph').shapeKeys[0].value - 0.5) < 1e-6);
  });
  test('a camera looks down its −Z after the trip', () => {
    const doc = build();
    const back = createDocument();
    back.objects = [];
    const list = importFBXScene(back, exportFBXScene(doc));
    const cam = list.find((x) => x.name === 'Cam');
    const look = new Vector3(0, 0, -1).transformDirection(worldMatrix(back, cam));
    const want = new Vector3(0, 0, -1).transformDirection(worldMatrix(doc, doc.objects[0]));
    assert.ok(look.distanceTo(want) < 1e-6);
  });
});

import { exportDAEScene, importDAEScene } from '../../src/core/daescene.js';
import { createModifier } from '../../src/core/modifiers.js';

describe('Collada as a scene: hierarchy, cameras, lights, skins and animation', () => {
  const build = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    const cam = addObject(doc, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 36, clipStart: 0.5, clipEnd: 250 } });
    addObject(doc, { type: 'EMPTY', name: 'OnCam', parent: cam.id, location: [0, 0, -2], data: {} });
    addObject(doc, { type: 'CAMERA', name: 'Ortho', rotation: [23, 0, -17], data: { ...defaultCamera(), kind: 'ORTHO', orthoScale: 7 } });
    addObject(doc, { type: 'LIGHT', name: 'Spot', location: [0, -3, 4], rotation: [17, 6, 40], data: { ...defaultLight('SPOT'), energy: 800, color: [1, 0.5, 0.25], spotSize: 60, spotBlend: 0.25 } });
    addObject(doc, { type: 'LIGHT', name: 'Panel', data: { ...defaultLight('AREA'), energy: 300, size: 2 } });
    const box = addObject(doc, { type: 'MESH', name: 'Box', location: [1, 2, 3], data: cubeMesh(2) });
    box.anim = { fcurves: {}, nla: [] };
    insertKey(box, 'location.2', 1, 3, 'LINEAR');
    insertKey(box, 'location.2', 11, 7, 'LINEAR');
    // A column bent by its upper bone.
    const arm = { bones: [createBone('Lower', [0, 0, 0], [0, 0, 1]), createBone('Upper', [0, 0, 1], [0, 0, 2], 0)] };
    const rig = addObject(doc, { type: 'ARMATURE', name: 'Rig', location: [5, 0, 0], data: arm });
    const column = cubeMesh(1);
    column.verts = [];
    for (let k = 0; k <= 4; k++) for (const [x, y] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) column.verts.push([x, y, k / 2]);
    column.faces = [];
    for (let k = 0; k < 4; k++) for (let a = 0; a < 4; a++) { const b = (a + 1) % 4; column.faces.push([k * 4 + a, k * 4 + b, (k + 1) * 4 + b, (k + 1) * 4 + a]); }
    column.uvs = null;
    column.vgroups = [{ name: 'Lower', w: {} }, { name: 'Upper', w: {} }];
    column.verts.forEach((v, i) => { column.vgroups[v[2] > 1 ? 1 : 0].w[i] = 1; });
    addObject(doc, { type: 'MESH', name: 'Column', location: [5, 0, 0], data: column, modifiers: [{ ...createModifier('ARMATURE'), object: rig.id }] });
    arm.anim = { fcurves: {}, nla: [] };
    insertKey(arm, 'bones.1.pose.rotation.0', 1, 0, 'LINEAR');
    insertKey(arm, 'bones.1.pose.rotation.0', 11, 70, 'LINEAR');
    setFrame(doc, 1);
    return doc;
  };
  const extent = (doc, frame) => {
    setFrame(doc, frame);
    const points = [];
    for (const o of doc.objects) {
      if (o.name !== 'Column') continue;
      const m = worldMatrix(doc, o);
      for (const v of evaluatedMesh(doc, o).verts) points.push(new Vector3(...v).applyMatrix4(m).toArray());
    }
    return [0, 1, 2].flatMap((k) => [Math.min(...points.map((p) => p[k])), Math.max(...points.map((p) => p[k]))]);
  };
  test('read back: every object, its kind, settings and place, frame by frame', () => {
    const doc = build();
    const back = createDocument();
    back.objects = [];
    back.fps = 24;
    const list = importDAEScene(back, exportDAEScene(doc));
    assert.deepEqual(list.map((o) => o.name).sort(), doc.objects.map((o) => o.name).sort());
    const named = (n) => list.find((x) => x.name === n);
    for (const frame of [1, 6, 11]) {
      setFrame(doc, frame);
      setFrame(back, frame);
      for (const o of doc.objects) {
        if (o.type === 'ARMATURE' || o.name === 'Column') continue;
        const [a, b] = [worldMatrix(doc, o).elements, worldMatrix(back, named(o.name)).elements];
        a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, `${o.name} at ${frame} [${i}] ${x} and ${b[i]}`));
      }
      const [want, got] = [extent(doc, frame), extent(back, frame)];
      want.forEach((x, i) => assert.ok(Math.abs(x - got[i]) < 1e-4, `the column at ${frame}: ${got} against ${want}`));
    }
    assert.ok(Math.abs(named('Cam').data.lens - 35) < 1e-6, 'the same view from a 36 mm film');
    assert.deepEqual([named('Ortho').data.kind, named('Ortho').data.orthoScale], ['ORTHO', 7]);
    const spot = named('Spot').data;
    assert.deepEqual([spot.kind, spot.energy, spot.color, spot.spotSize, spot.spotBlend], ['SPOT', 800, [1, 0.5, 0.25], 60, 0.25]);
    assert.deepEqual([named('Panel').data.kind, named('Panel').data.size], ['AREA', 2]);
    assert.equal(named('OnCam').parent, named('Cam').id, 'the hierarchy kept');
    assert.deepEqual(named('Rig').data.bones.map((b) => [b.name, b.parent]), [['Lower', null], ['Upper', 0]]);
  });
  test('a light from another program: its colour carries the power', () => {
    const doc = createDocument();
    doc.objects = [];
    const text = `<?xml version="1.0"?><COLLADA version="1.4.1"><asset><up_axis>Y_UP</up_axis></asset>
<library_lights><light id="L"><technique_common><point><color>200 100 50</color></point></technique_common></light></library_lights>
<library_visual_scenes><visual_scene id="S"><node id="n" name="Lamp"><translate>0 4 0</translate><instance_light url="#L"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#S"/></scene></COLLADA>`;
    const [lamp] = importDAEScene(doc, text);
    assert.deepEqual([lamp.data.energy, lamp.data.color], [200, [1, 0.5, 0.25]]);
    assert.deepEqual(lamp.location.map((x) => +x.toFixed(6) + 0), [0, 0, 4], 'Y up turned to Z up');
  });
});

import { exportUSDScene, importUSDScene } from '../../src/core/usdscene.js';
import { attrAt, readUSDStage } from '../../src/core/usdstage.js';
import { encodePNG } from '../../src/core/paint.js';

describe('USD as a scene: hierarchy, time samples, materials, cameras and lights', () => {
  const build = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    addObject(doc, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 32, clipStart: 0.5, clipEnd: 250 } });
    addObject(doc, { type: 'CAMERA', name: 'Ortho', data: { ...defaultCamera(), kind: 'ORTHO', orthoScale: 7 } });
    for (const [kind, name, energy] of [['POINT', 'Bulb', 250], ['SUN', 'Sun', 4], ['SPOT', 'Spot', 800], ['AREA', 'Panel', 300]]) addObject(doc, { type: 'LIGHT', name, location: [0, -3, 4], rotation: [17, 6, 40], data: { ...defaultLight(kind), energy, color: [1, 0.5, 0.25], spotSize: 60, spotBlend: 0.25, size: 2 } });
    const paint = { ...defaultMaterial('Paint'), baseColor: [0.8, 0.2, 0.1], metallic: 0.3, roughness: 0.6 };
    const dots = { ...defaultMaterial('Dots') };
    doc.materials.push(paint, dots);
    doc.images = [{ id: 'img1', name: 'Dots', dataUrl: `data:image/png;base64,${Buffer.from(encodePNG({ width: 1, height: 1, rgba: new Uint8Array([40, 220, 80, 255]) })).toString('base64')}` }];
    dots.useNodes = true;
    dots.nodes = defaultShaderGraph(dots);
    const bsdf = dots.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    const tex = createNode('TEX_IMAGE', 0, 0, { image: 'img1' });
    dots.nodes.nodes.push(tex);
    linkNodes(dots.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    const box = addObject(doc, { type: 'MESH', name: 'Box.001', location: [1, 2, 3], data: cubeMesh(2), materials: [paint.id, dots.id] });
    box.data.faceMat = box.data.faces.map((_, f) => (f < 3 ? 0 : 1));
    box.anim = { fcurves: {}, nla: [] };
    insertKey(box, 'location.2', 1, 3, 'LINEAR');
    insertKey(box, 'location.2', 11, 7, 'LINEAR');
    insertKey(box, 'rotation.2', 1, 0, 'LINEAR');
    insertKey(box, 'rotation.2', 11, 90, 'LINEAR');
    addObject(doc, { type: 'EMPTY', name: 'Rider', parent: box.id, location: [0, 0, 2], data: {} });
    const morph = cubeMesh(2);
    morph.shapeKeys = [{ name: 'Up', value: 0, verts: morph.verts.map((v) => [v[0], v[1], v[2] > 0 ? v[2] + 1 : v[2]]) }];
    const m = addObject(doc, { type: 'MESH', name: 'Morph', location: [4, 0, 0], data: morph });
    m.data.anim = { fcurves: {}, nla: [] };
    insertKey(m.data, 'shapeKeys.0.value', 1, 0, 'LINEAR');
    insertKey(m.data, 'shapeKeys.0.value', 11, 1, 'LINEAR');
    setFrame(doc, 1);
    return doc;
  };
  const top = (doc, o) => Math.max(...evaluatedMesh(doc, o).verts.map((v) => new Vector3(...v).applyMatrix4(worldMatrix(doc, o)).z));
  for (const usdz of [false, true]) {
    test(`read back from ${usdz ? '.usdz' : '.usda'}: places at every frame, settings, materials per face${usdz ? ' and the picture inside' : ''}`, () => {
      const doc = build();
      const back = createDocument();
      back.objects = [];
      back.fps = 24;
      const list = importUSDScene(back, usdz ? exportUSDScene(doc, { usdz: true }) : new TextEncoder().encode(exportUSDScene(doc)));
      assert.deepEqual(list.map((o) => o.name).sort(), doc.objects.map((o) => o.name).sort(), 'the names, dots and all');
      const named = (n) => list.find((x) => x.name === n);
      for (const frame of [1, 6, 11]) {
        setFrame(doc, frame);
        setFrame(back, frame);
        for (const o of doc.objects) {
          const [a, b] = [worldMatrix(doc, o).elements, worldMatrix(back, named(o.name)).elements];
          a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, `${o.name} at ${frame} [${i}] ${x} and ${b[i]}`));
        }
        assert.ok(Math.abs(top(doc, doc.objects.find((o) => o.name === 'Morph')) - top(back, named('Morph'))) < 1e-5, `the changing mesh at ${frame}`);
      }
      assert.deepEqual([named('Cam').data.lens, +named('Cam').data.sensor.toFixed(5)], [35, 32]);
      assert.deepEqual([named('Ortho').data.kind, named('Ortho').data.orthoScale], ['ORTHO', 7]);
      for (const n of ['Bulb', 'Sun', 'Spot', 'Panel']) {
        const [a, b] = [doc.objects.find((o) => o.name === n).data, named(n).data];
        assert.equal(b.kind, a.kind, n);
        assert.ok(Math.abs(b.energy - a.energy) < 1e-3, `${n} ${b.energy}`);
      }
      assert.deepEqual([named('Spot').data.spotSize, named('Spot').data.spotBlend], [60, 0.25]);
      assert.equal(named('Panel').data.size, 2);
      assert.equal(named('Rider').parent, named('Box.001').id);
      const box = named('Box.001');
      assert.equal(box.materials.length, 2, 'two materials, by face');
      assert.deepEqual(box.data.faceMat, [0, 0, 0, 1, 1, 1]);
      const paint = back.materials.find((x) => x.id === box.materials[0]);
      assert.deepEqual([paint.baseColor, paint.metallic, paint.roughness], [[0.8, 0.2, 0.1], 0.3, 0.6]);
      const dots = back.materials.find((x) => x.id === box.materials[1]);
      assert.equal(Boolean(dots.useNodes && dots.nodes.nodes.some((x) => x.type === 'TEX_IMAGE')), usdz, 'a picture only travels inside a .usdz');
      if (usdz) assert.ok(back.images.some((im) => im.dataUrl.startsWith('data:image/png;base64,')));
    });
  }
  test('the text reader: time samples, connections, relationships, metadata and comments', () => {
    const stage = readUSDStage(new TextEncoder().encode(`#usda 1.0
( upAxis = "Y" metersPerUnit = 0.01 ) # a comment
def Xform "A" ( kind = "component" )
{
    double3 xformOp:translate.timeSamples = { 0: (0, 0, 0), 10: (10, 20, 30), }
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "M" ( prepend apiSchemas = ["MaterialBindingAPI"] )
    {
        rel material:binding = </Mat>
        color3f inputs:c.connect = </Mat/S.outputs:rgb>
        texCoord2f[] primvars:st = [(0, 0), (1, 1)] ( interpolation = "faceVarying" )
        asset inputs:file = @./tex.png@
        string doc = """two
lines"""
    }
}`));
    assert.deepEqual([stage.meta.upAxis, stage.meta.metersPerUnit], ['Y', 0.01]);
    const a = stage.prims.get('/A');
    assert.deepEqual(attrAt(a.attrs.get('xformOp:translate'), 5), [5, 10, 15]);
    const m = stage.prims.get('/A/M');
    assert.deepEqual(m.rels.get('material:binding'), ['/Mat']);
    assert.deepEqual(m.attrs.get('inputs:c').connect, ['/Mat/S.outputs:rgb']);
    assert.equal(m.attrs.get('primvars:st').interpolation, 'faceVarying');
    assert.deepEqual(m.attrs.get('inputs:file').value, { asset: './tex.png' });
    assert.equal(m.attrs.get('doc').value, 'two\nlines');
  });
});

import { curvePolyline, exportABCScene, importABCScene } from '../../src/core/abcscene.js';
import { importABC } from '../../src/core/alembic.js';

describe('Alembic as a scene: hierarchy, motion, changing meshes, cameras and curves', () => {
  const build = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    const cam = addObject(doc, { type: 'CAMERA', name: 'Cam', location: [1, 2, 3], rotation: [57, 11, 29], data: { ...defaultCamera(), lens: 35, sensor: 32, clipStart: 0.5, clipEnd: 250 } });
    addObject(doc, { type: 'EMPTY', name: 'OnCam', parent: cam.id, location: [0, 0, -2], data: {} });
    const box = addObject(doc, { type: 'MESH', name: 'Box', location: [1, 2, 3], data: cubeMesh(2) });
    box.data.uvs = box.data.faces.map((f) => f.map((_, k) => [k / 4, 0.5]));
    box.anim = { fcurves: {}, nla: [] };
    insertKey(box, 'location.2', 1, 3, 'LINEAR');
    insertKey(box, 'location.2', 11, 7, 'LINEAR');
    insertKey(box, 'rotation.2', 1, 0, 'LINEAR');
    insertKey(box, 'rotation.2', 11, 90, 'LINEAR');
    addObject(doc, { type: 'EMPTY', name: 'Rider', parent: box.id, location: [0, 0, 2], data: {} });
    const morph = cubeMesh(2);
    morph.shapeKeys = [{ name: 'Up', value: 0, verts: morph.verts.map((v) => [v[0], v[1], v[2] > 0 ? v[2] + 1 : v[2]]) }];
    const m = addObject(doc, { type: 'MESH', name: 'Morph', location: [4, 0, 0], data: morph });
    m.data.anim = { fcurves: {}, nla: [] };
    insertKey(m.data, 'shapeKeys.0.value', 1, 0, 'LINEAR');
    insertKey(m.data, 'shapeKeys.0.value', 11, 1, 'LINEAR');
    addObject(doc, { type: 'CURVE', name: 'Wire', location: [0, 5, 0], data: { splines: [{ kind: 'POLY', cyclic: true, points: [[0, 0, 0], [1, 0, 0], [1, 1, 1], [0, 1, 0]] }, { kind: 'POLY', cyclic: false, points: [[0, 0, 2], [2, 0, 2]] }], bevelDepth: 0, resolution: 12 } });
    setFrame(doc, 1);
    return doc;
  };
  const span = (doc, o) => {
    const w = worldMatrix(doc, o);
    const pts = evaluatedMesh(doc, o).verts.map((v) => new Vector3(...v).applyMatrix4(w).toArray());
    return [0, 1, 2].flatMap((k) => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))]);
  };
  test('read back: names, parents, places at every frame, the camera, the changing mesh and the curve', () => {
    const doc = build();
    const back = createDocument();
    back.objects = [];
    back.fps = 24;
    const bytes = exportABCScene(doc);
    const list = importABCScene(back, bytes);
    assert.deepEqual(list.map((o) => o.name).sort(), doc.objects.map((o) => o.name).sort());
    const named = (n) => list.find((x) => x.name === n);
    for (const frame of [1, 4, 6, 11]) {
      setFrame(doc, frame);
      setFrame(back, frame);
      for (const o of doc.objects) {
        const [a, b] = [worldMatrix(doc, o).elements, worldMatrix(back, named(o.name)).elements];
        a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-4, `${o.name} at ${frame} [${i}] ${x} and ${b[i]}`));
        if (o.type === 'MESH' || o.type === 'CURVE') close(span(back, named(o.name)), span(doc, o), 1e-4);
      }
    }
    assert.equal(named('OnCam').parent, named('Cam').id);
    assert.equal(named('Rider').parent, named('Box').id);
    assert.deepEqual([named('Cam').data.lens, +named('Cam').data.sensor.toFixed(4), named('Cam').data.clipStart, named('Cam').data.clipEnd], [35, 32, 0.5, 250]);
    assert.equal(named('Wire').type, 'CURVE');
    assert.deepEqual(named('Wire').data.splines.map((s) => [s.points.length, s.cyclic]), [[5, false], [2, false]], 'a closed line among open ones repeats its first point');
    assert.ok(named('Morph').cache?.points?.[6], 'the changing mesh is a point cache');
    assert.equal(named('Box').cache?.points, undefined, 'a mesh that only moves keeps one shape');
    assert.deepEqual(named('Box').data.uvs[0], doc.objects.find((o) => o.name === 'Box').data.uvs[0]);
    assert.equal(back.frameEnd >= 11, true);
  });
  test('still scenes write one sample; the flat reader still finds the meshes in the world', () => {
    const doc = createDocument();
    doc.objects = [];
    const parent = addObject(doc, { type: 'EMPTY', name: 'Holder', location: [0, 0, 5], rotation: [0, 0, 90], data: {} });
    addObject(doc, { type: 'MESH', name: 'Cube', parent: parent.id, location: [2, 0, 0], data: cubeMesh(2) });
    setFrame(doc, 1);
    const flat = importABC(exportABCScene(doc));
    assert.equal(flat.length, 1);
    const xs = flat[0].mesh.verts.map((v) => v[0]);
    const ys = flat[0].mesh.verts.map((v) => v[1]);
    const zs = flat[0].mesh.verts.map((v) => v[2]);
    close([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)], [-1, 1, 1, 3, 4, 6], 1e-5);
  });
  test('curves of other kinds: Bézier, B-spline with knots, and closed ones', () => {
    // Written by hand as Alembic lays them out, then read: every kind becomes the line it draws.
    const doc = createDocument();
    doc.objects = [];
    addObject(doc, { type: 'CURVE', name: 'Ring', data: { splines: [{ kind: 'POLY', cyclic: true, points: [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] }], bevelDepth: 0, resolution: 12 } });
    const back = createDocument();
    back.objects = [];
    const [ring] = importABCScene(back, exportABCScene(doc));
    assert.deepEqual(ring.data.splines.map((s) => [s.points.length, s.cyclic]), [[4, true]], 'all closed: written as a periodic curve');
    // A cubic Bézier: a quarter circle by the usual handles, through its ends and close to the circle between.
    const h = 0.5523;
    const quarter = curvePolyline([[1, 0, 0], [1, h, 0], [h, 1, 0], [0, 1, 0]], 4, 1, false, null, null);
    close(quarter.points[0], [1, 0, 0], 1e-9);
    close(quarter.points.at(-1), [0, 1, 0], 1e-9);
    for (const p of quarter.points) near(Math.hypot(p[0], p[1]), 1, 1e-3);
    // An open B-spline with clamped knots reaches its ends; a uniform cubic one passes (p0 + 4 p1 + p2) / 6.
    const clamped = curvePolyline([[0, 0, 0], [1, 2, 0], [3, 2, 0], [4, 0, 0]], 4, 2, false, [0, 0, 0, 0, 1, 1, 1, 1], null);
    close(clamped.points[0], [0, 0, 0], 1e-9);
    close(clamped.points.at(-1), [4, 0, 0], 1e-9);
    close(clamped.points[Math.floor(clamped.points.length / 2)], [2, 1.5, 0], 1e-9);
    const uniform = curvePolyline([[0, 0, 0], [6, 0, 0], [12, 6, 0], [18, 0, 0]], 4, 2, false, [0, 1, 2, 3, 4, 5, 6, 7], null);
    close(uniform.points[0], [6, 1, 0], 1e-9);
    // Weights pull the curve: a rational quadratic quarter circle.
    const rational = curvePolyline([[1, 0, 0], [1, 1, 0], [0, 1, 0]], 3, 2, false, [0, 0, 0, 1, 1, 1], [1, Math.SQRT1_2, 1]);
    for (const p of rational.points) near(Math.hypot(p[0], p[1]), 1, 1e-9);
    // A periodic uniform B-spline closes on itself.
    const loop = curvePolyline([[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]], 4, 2, true, null, null);
    assert.equal(loop.cyclic, true);
    close(loop.points[0], [0, 2 / 3, 0], 1e-9);
    for (const p of loop.points) assert.ok(Math.hypot(p[0], p[1]) > 0.647 && Math.hypot(p[0], p[1]) < 0.667);
  });
});

import { LIGHT_PASSES, cryptoHash, cryptoMatte, murmur3, passKey, syncRenderLayers } from '../../src/core/passes.js';
import { evalCompositor, nodeSockets } from '../../src/core/nodes.js';

describe('render passes: light split, light groups and cryptomatte', () => {
  const scene = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.render.samples = 8;
    doc.render.bounces = 4;
    doc.viewLayers[0].lightGroups = [{ name: 'Key' }, { name: 'Glow' }];
    const red = { ...defaultMaterial('Red'), baseColor: [0.8, 0.1, 0.1], roughness: 0.4 };
    const glass = { ...defaultMaterial('Glass'), baseColor: [0.9, 0.9, 1], transmission: 1, roughness: 0 };
    const lamp = { ...defaultMaterial('Lamp'), emission: [1, 1, 1], emissionStrength: 3 };
    doc.materials.push(red, glass, lamp);
    addObject(doc, { type: 'MESH', name: 'Cube', data: cubeMesh(2), materials: [red.id] });
    addObject(doc, { type: 'MESH', name: 'Ball', location: [-2, 1, 0], data: uvSphereMesh(12, 8, 0.7), materials: [glass.id] });
    addObject(doc, { type: 'MESH', name: 'Floor', location: [0, 0, -1], data: planeMesh(10) });
    addObject(doc, { type: 'MESH', name: 'Glow', location: [2, 0, 1], data: cubeMesh(0.5), materials: [lamp.id] }).lightGroup = 'Glow';
    doc.activeCamera = addObject(doc, { type: 'CAMERA', name: 'Camera', location: [7, -7, 5], rotation: [63, 0, 45], data: { kind: 'PERSP', lens: 50, sensor: 36, clipStart: 0.1, clipEnd: 100 } }).id;
    addObject(doc, { type: 'LIGHT', name: 'Light', location: [4, 1, 6], data: { ...defaultLight('POINT'), energy: 1000 } }).lightGroup = 'Key';
    doc.world.color = [0.2, 0.3, 0.4];
    doc.world.lightGroup = 'Sky';
    return doc;
  };
  test('murmur3 and cryptomatte ids follow the Cryptomatte specification', () => {
    assert.equal(murmur3('hello').toString(16), '248bfa47');
    assert.equal(murmur3(''), 0);
    assert.equal(murmur3('abcd').toString(16), '43ed676a');
    for (const name of ['Cube', 'Floor', '큐브', 'a/b']) {
      const id = cryptoHash(name);
      assert.ok(Number.isFinite(id) && id !== 0 && Math.abs(id) > 1e-37, `${name}: ${id}`);
    }
  });
  test('colour times light, glow and world add up to the image; each light group to its own share', () => {
    const doc = scene();
    const built = buildRenderScene(doc, { width: 32, height: 24 });
    const img = renderImage(built, { passes: true });
    const total = (im) => [0, 1, 2].map((k) => { let s = 0; for (let p = 0; p < im.data.length / 4; p++) s += im.data[p * 4 + k]; return s; });
    const P = img.passes;
    const sum = [0, 0, 0];
    for (let p = 0; p < 32 * 24; p++) {
      for (let k = 0; k < 3; k++) {
        const at = (n) => P[n].data[p * 4 + k];
        sum[k] += at('Diffuse Color') * (at('Diffuse Direct') + at('Diffuse Indirect')) + at('Glossy Color') * (at('Glossy Direct') + at('Glossy Indirect'))
          + at('Transmission Color') * (at('Transmission Direct') + at('Transmission Indirect')) + at('Volume Direct') + at('Volume Indirect') + at('Emit') + at('Environment');
      }
    }
    close(sum, total(img), 1e-2);
    for (const name of LIGHT_PASSES) assert.ok(P[name], name);
    assert.ok(total(P['Diffuse Direct'])[0] > 0 && total(P['Glossy Direct'])[0] > 0 && total(P['Transmission Indirect'])[0] + total(P['Transmission Direct'])[0] > 0, 'every lobe sees light');
    assert.ok(total(P.Emit)[0] > 0 && total(P.Environment)[2] > 0);
    // Light groups: the lamp's and the glowing cube's; the world names a group the view layer lacks, so it adds to none.
    assert.deepEqual(Object.keys(P.lightGroups), ['Key', 'Glow']);
    const key = total(P.lightGroups.Key);
    const glow = total(P.lightGroups.Glow);
    assert.ok(key[0] > 0 && glow[0] > 0);
    // With the world in a group too, the groups together are the whole image.
    doc.viewLayers[0].lightGroups.push({ name: 'Sky' });
    const again = renderImage(buildRenderScene(doc, { width: 32, height: 24 }), { passes: true });
    const groups = Object.values(again.passes.lightGroups).map(total);
    close([0, 1, 2].map((k) => groups.reduce((s, g) => s + g[k], 0)), total(again), 1e-2);
  });
  test('cryptomatte: shares per pixel add to one where something is hit, and a matte picks one object out', () => {
    const doc = scene();
    const built = buildRenderScene(doc, { width: 32, height: 24 });
    const img = renderImage(built, { passes: true });
    const layers = [0, 1, 2].map((i) => img.passes[`CryptoObject0${i}`]);
    let covered = 0;
    for (let p = 0; p < 32 * 24; p++) {
      const share = layers.reduce((s, l) => s + l.data[p * 4 + 1] + l.data[p * 4 + 3], 0);
      assert.ok(share <= 1 + 1e-6);
      // Edges share a pixel with the background, which has no id.
      if (Math.abs(share - 1) < 1e-6) covered++;
      // Ranks come most seen first.
      assert.ok(layers[0].data[p * 4 + 1] >= layers[0].data[p * 4 + 3]);
    }
    assert.ok(covered > 0);
    const cube = cryptoMatte(layers, ['Cube']);
    const both = cryptoMatte(layers, ['Cube', 'Floor']);
    const sumOf = (m) => m.data.reduce((s, x, i) => s + (i % 4 === 0 ? x : 0), 0);
    assert.ok(sumOf(cube) > 0 && sumOf(both) > sumOf(cube));
    assert.equal(sumOf(cryptoMatte(layers, ['Nothing'])), 0);
    assert.deepEqual(Object.keys(img.passes.cryptoManifest.CryptoObject).sort(), ['Ball', 'Cube', 'Floor', 'Glow']);
    assert.equal(img.passes.cryptoManifest.CryptoObject.Cube, murmur3('Cube').toString(16).padStart(8, '0'));
    const mats = [0, 1, 2].map((i) => img.passes[`CryptoMaterial0${i}`]);
    assert.ok(sumOf(cryptoMatte(mats, ['Glass'])) > 0);
    // Asset: the glowing cube made a child of the cube counts as the cube's asset.
    doc.objects.find((o) => o.name === 'Glow').parent = doc.objects.find((o) => o.name === 'Cube').id;
    const again = renderImage(buildRenderScene(doc, { width: 32, height: 24 }), { passes: true });
    const assets = [0, 1, 2].map((i) => again.passes[`CryptoAsset0${i}`]);
    const objectsAgain = [0, 1, 2].map((i) => again.passes[`CryptoObject0${i}`]);
    assert.deepEqual(Object.keys(again.passes.cryptoManifest.CryptoAsset).sort(), ['Ball', 'Cube', 'Floor']);
    near(sumOf(cryptoMatte(assets, ['Cube'])), sumOf(cryptoMatte(objectsAgain, ['Cube', 'Glow'])), 1e-3);
  });
  test('the compositor: Render Layers shows the switched-on passes and a Combined per light group; Cryptomatte keeps the named', () => {
    const doc = scene();
    run({ doc }, 'compositor.use_nodes');
    doc.viewLayers[0].usePass.diffuseDirect = true;
    doc.viewLayers[0].usePass.cryptoObject = true;
    syncRenderLayers(doc);
    const layersNode = doc.compositor.nodes.find((n) => n.type === 'CMP_RENDER_LAYERS');
    const names = nodeSockets(layersNode).outputs.map((s) => s.name);
    for (const n of ['Diffuse Direct', 'CryptoObject00', 'CryptoObject02', 'Combined_Key', 'Combined_Glow']) assert.ok(names.includes(n), n);
    assert.ok(!names.includes('Glossy Direct'));
    assert.equal(passKey('Transmission Indirect'), 'transmissionIndirect');
    const built = buildRenderScene(doc, { width: 16, height: 12 });
    const img = renderImage(built, { passes: true });
    const passes = { light: img.passes, lightGroups: img.passes.lightGroups };
    // Render Layers › Cryptomatte (Cube) › Composite: only the cube is left.
    const out = doc.compositor.nodes.find((n) => n.type === 'CMP_OUTPUT');
    doc.compositor.links = doc.compositor.links.filter((l) => l.to !== out.id);
    const crypto = createNode('CMP_CRYPTOMATTE', 300, 0, { matteId: 'Cube' });
    doc.compositor.nodes.push(crypto);
    linkNodes(doc.compositor, layersNode.id, 'Image', crypto.id, 'Image');
    linkNodes(doc.compositor, crypto.id, 'Image', out.id, 'Image');
    const kept = evalCompositor(doc.compositor, img, passes);
    const matte = cryptoMatte([0, 1, 2].map((i) => img.passes[`CryptoObject0${i}`]), ['Cube']);
    for (let p = 0; p < 16 * 12; p++) near(kept.data[p * 4], img.data[p * 4] * matte.data[p * 4], 1e-6);
    // A light group's Combined straight to the output.
    doc.compositor.links = doc.compositor.links.filter((l) => l.to !== out.id);
    linkNodes(doc.compositor, layersNode.id, 'Combined_Key', out.id, 'Image');
    assert.equal(evalCompositor(doc.compositor, img, passes), img.passes.lightGroups.Key);
  });
  test('light group operators: add with unique names, add the used ones, remove the unused', () => {
    const doc = scene();
    doc.viewLayers[0].lightGroups = [];
    run({ doc }, 'scene.view_layer_add_lightgroup');
    run({ doc }, 'scene.view_layer_add_lightgroup');
    assert.deepEqual(doc.viewLayers[0].lightGroups.map((g) => g.name), ['Lightgroup', 'Lightgroup.001']);
    run({ doc }, 'scene.view_layer_add_used_lightgroups');
    assert.deepEqual(doc.viewLayers[0].lightGroups.map((g) => g.name), ['Lightgroup', 'Lightgroup.001', 'Glow', 'Key', 'Sky']);
    run({ doc }, 'scene.view_layer_remove_unused_lightgroups');
    assert.deepEqual(doc.viewLayers[0].lightGroups.map((g) => g.name), ['Glow', 'Key', 'Sky']);
    run({ doc }, 'scene.view_layer_remove_lightgroup', { index: 0 });
    assert.deepEqual(doc.viewLayers[0].lightGroups.map((g) => g.name), ['Key', 'Sky']);
  });
});
import { buildBVH, renderRows } from '../../src/core/pathtracer.js';

describe('data passes: ambient occlusion, mist and object index', () => {
  test('mist rises with distance by the falloff, AO darkens in a corner, and the object index comes from the object', () => {
    const doc = createDocument();
    doc.objects = [];
    doc.render.samples = 16;
    doc.world.mist = { start: 2, depth: 20, falloff: 'LINEAR' };
    doc.world.aoDistance = 3;
    const floor = addObject(doc, { type: 'MESH', name: 'Floor', data: planeMesh(40) });
    floor.passIndex = 7;
    addObject(doc, { type: 'MESH', name: 'Wall', location: [0, 3, 1], rotation: [90, 0, 0], data: planeMesh(40) });
    // Looking straight down the floor towards the wall.
    doc.activeCamera = addObject(doc, { type: 'CAMERA', name: 'Camera', location: [0, -6, 1], rotation: [90, 0, 0], data: { kind: 'PERSP', lens: 20, sensor: 36, clipStart: 0.1, clipEnd: 100 } }).id;
    const built = buildRenderScene(doc, { width: 40, height: 30 });
    const img = renderImage(built, { passes: true });
    const at = (name, x, y) => img.passes[name].data[(y * 40 + x) * 4];
    // The wall straight ahead is 9 away: (9 − 2) / 20 of the way into the mist.
    near(at('Mist', 20, 12), 7 / 20, 0.02);
    const nearFloor = at('Mist', 20, 29);
    assert.ok(nearFloor < at('Mist', 20, 16), 'the floor close by is clearer than further on');
    // The floor far from the wall sees open sky; where it meets the wall, half of it is the wall.
    assert.ok(at('Ambient Occlusion', 20, 29) > at('Ambient Occlusion', 20, 16) + 0.15, `${at('Ambient Occlusion', 20, 29)} and ${at('Ambient Occlusion', 20, 16)}`);
    // The passes on their own random numbers: the image is the one rendered without them.
    const plain = renderImage(buildRenderScene(doc, { width: 40, height: 30 }));
    assert.deepEqual(Array.from(plain.data.subarray(0, 400)), Array.from(img.data.subarray(0, 400)));
    // Object index: the floor's at the bottom, the wall's (none set) in the middle, through the AOV.
    const bvh = buildBVH(built.positions);
    const out = new Float32Array(40 * 4);
    const extra = { objectIndex: new Float32Array(40) };
    renderRows(built, bvh, 29, 30, out, { baseRow: 29, samples: 1, aovs: { depth: new Float32Array(40), normal: new Float32Array(120), extra } });
    assert.equal(extra.objectIndex[20], 7);
    renderRows(built, bvh, 12, 13, out.fill(0), { baseRow: 12, samples: 1, aovs: { depth: new Float32Array(40), normal: new Float32Array(120), extra } });
    assert.equal(extra.objectIndex[20], 0);
  });
});

import { oceanField as seaField, oceanSpectrum } from '../../src/core/remesh.js';

describe('ocean spectra and spray', () => {
  const heightOf = (options) => {
    let v = 0;
    let count = 0;
    for (const seed of [1, 2, 3, 4]) for (const h of seaField({ resolution: 128, size: 400, windSpeed: 12, seed, ...options }).height) { v += h * h; count++; }
    return 4 * Math.sqrt(v / count);
  };
  test('a fully grown sea (Pierson–Moskowitz) stands 0.21 v²/g high, as Phillips is scaled to; a fetch and shallow water lower it', () => {
    const grown = 0.21 * 144 / 9.81;
    near(heightOf({ spectrum: 'PIERSON_MOSKOWITZ' }), grown, 0.1 * grown);
    const jonswap = heightOf({ spectrum: 'JONSWAP', fetch: 120 });
    assert.ok(jonswap < grown && jonswap > 0.5 * grown, `JONSWAP ${jonswap}`);
    assert.ok(heightOf({ spectrum: 'JONSWAP', fetch: 20 }) < jonswap, 'a shorter fetch, smaller waves');
    assert.ok(heightOf({ spectrum: 'TEXEL_MARSEN_ARSLOE', fetch: 120, depth: 5 }) < 0.8 * jonswap, 'shallow water damps the long waves');
    near(heightOf({ spectrum: 'TEXEL_MARSEN_ARSLOE', fetch: 120, depth: 500 }), jonswap, 0.02 * jonswap);
  });
  test('the spectra peak where they should: Pierson–Moskowitz at 0.877 g/U, JONSWAP higher and sharper', () => {
    const omegas = Array.from({ length: 400 }, (_, i) => 0.2 + i * 0.005);
    const peakOf = (kind, opts) => omegas.reduce((best, w) => (oceanSpectrum(kind, w, opts) > oceanSpectrum(kind, best, opts) ? w : best), omegas[0]);
    near(peakOf('PIERSON_MOSKOWITZ', { windSpeed: 12 }), (0.877 * 9.81) / 12, 0.01);
    const p = peakOf('JONSWAP', { windSpeed: 12, fetch: 120 });
    near(p, 22 * ((9.81 * 9.81) / (12 * 120000)) ** (1 / 3), 0.01);
    assert.ok(oceanSpectrum('JONSWAP', p, { windSpeed: 12, fetch: 120, sharpenPeak: 3.3 }) > 2.5 * oceanSpectrum('JONSWAP', p, { windSpeed: 12, fetch: 120, sharpenPeak: 1 }));
  });
  test('spray: unit directions scaled by the foam, the most squeezed way; inverted, at right angles to it', () => {
    const base = { resolution: 32, size: 20, useFoam: true, useSpray: true, choppiness: 2, foamCoverage: 0.3 };
    const a = oceanMesh(base);
    const b = oceanMesh({ ...base, invertSpray: true });
    assert.equal(a.attributes.spray.length, a.verts.length);
    let checked = 0;
    a.attributes.spray.forEach((s, i) => {
      near(Math.hypot(s[0], s[1]), a.attributes.foam[i], 1e-9);
      const t = b.attributes.spray[i];
      if (a.attributes.foam[i] > 0.05) { assert.ok(Math.abs(s[0] * t[0] + s[1] * t[1]) < 1e-9, 'at right angles'); checked++; }
    });
    assert.ok(checked > 10);
    assert.equal(oceanMesh({ ...base, useSpray: false }).attributes.spray, undefined);
  });
});

import { parseUSDA as parseUsdText } from '../../src/core/usdstage.js';
import { writeUSDC } from '../../src/core/usdcwrite.js';
import { storeUSDZ } from '../../src/core/usdscene.js';
import { Crate } from '../../src/core/usdc.js';
import { posedBone as bonePosed } from '../../src/core/armature.js';

describe('USD: skeletons, binary writing and composition', () => {
  const rigged = () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    const arm = { bones: [createBone('Lower', [0, 0, 0], [0, 0, 1], null), createBone('Upper.001', [0, 0, 1], [0, 0.3, 2], 0)] };
    const rig = addObject(doc, { type: 'ARMATURE', name: 'Rig', location: [1, 0, 0], data: arm });
    const column = cubeMesh(2);
    column.verts = column.verts.map((v) => [v[0] * 0.2, v[1] * 0.2, v[2] + 1]);
    column.vgroups = [{ name: 'Lower', w: {} }, { name: 'Upper.001', w: {} }];
    column.verts.forEach((v, i) => { if (v[2] > 1) { column.vgroups[1].w[i] = 0.75; column.vgroups[0].w[i] = 0.25; } else column.vgroups[0].w[i] = 1; });
    addObject(doc, { type: 'MESH', name: 'Column', location: [1, 0, 0], data: column, modifiers: [{ ...createModifier('ARMATURE'), object: rig.id }] });
    arm.anim = { fcurves: {}, nla: [] };
    insertKey(arm, 'bones.1.pose.rotation.0', 1, 0, 'LINEAR');
    insertKey(arm, 'bones.1.pose.rotation.0', 11, 60, 'LINEAR');
    insertKey(arm, 'bones.0.pose.rotation.2', 1, 0, 'LINEAR');
    insertKey(arm, 'bones.0.pose.rotation.2', 11, 30, 'LINEAR');
    setFrame(doc, 1);
    return doc;
  };
  const pointsAt = (doc, name, frame) => {
    setFrame(doc, frame);
    const o = doc.objects.find((x) => x.name === name);
    const m = worldMatrix(doc, o);
    return evaluatedMesh(doc, o).verts.map((v) => new Vector3(...v).applyMatrix4(m).toArray());
  };
  for (const usdc of [false, true]) {
    test(`a skinned rig ${usdc ? 'as binary .usdc' : 'as text'}: a Skeleton with its animation and a bound mesh, read back bending the same`, () => {
      const doc = rigged();
      const out = exportUSDScene(doc, { usdc });
      const bytes = usdc ? out : new TextEncoder().encode(out);
      if (!usdc) {
        assert.match(out, /def SkelRoot "root"/);
        assert.match(out, /def Skeleton "Skel"/);
        assert.match(out, /uniform token\[\] joints = \["Lower", "Lower\/Upper_001"\]/);
        assert.match(out, /primvars:skel:jointWeights/);
        assert.doesNotMatch(out, /points\.timeSamples/, 'the skin moves it, not points per frame');
      } else assert.equal(new TextDecoder().decode(out.subarray(0, 8)), 'PXR-USDC');
      const back = createDocument();
      back.objects = [];
      back.fps = 24;
      const list = importUSDScene(back, bytes);
      const rig = list.find((o) => o.type === 'ARMATURE');
      assert.equal(rig.data.bones.length, 2);
      assert.deepEqual(rig.data.bones.map((b) => b.parent), [null, 0]);
      for (const frame of [1, 4, 8, 11]) {
        const [a, b] = [pointsAt(doc, 'Column', frame), pointsAt(back, 'Column', frame)];
        a.forEach((p, i) => close(b[i], p, 1e-4));
        // The bones themselves stand where they did.
        const [ra, rb] = [doc.objects.find((o) => o.type === 'ARMATURE'), rig];
        for (const j of [0, 1]) {
          const [pa, pb] = [bonePosed(evaluatedArmature(doc, ra), j), bonePosed(evaluatedArmature(back, rb), j)];
          close(pb.head, pa.head, 1e-4);
          close(pb.tail, pa.tail, 1e-4);
        }
      }
    });
  }
  test('binary writing keeps every kind of value: arrays, time samples, matrices, quaternions, halves, tokens, assets, connections and metadata', () => {
    const text = `#usda 1.0
(
    defaultPrim = "W"
    metersPerUnit = 0.01
    upAxis = "Y"
    doc = "a note"
)
def Xform "W" (
    customData = { dictionary Blender = { bool generated = 1 } }
    kind = "component"
)
{
    double3 xformOp:translate.timeSamples = { 1: (1, 2, 3), 5: (4, 5, 6), }
    uniform token[] xformOpOrder = ["xformOp:translate"]
    custom string userProperties:note = "hello"
    def Mesh "M" ( prepend apiSchemas = ["MaterialBindingAPI"] )
    {
        point3f[] points = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        texCoord2f[] primvars:st = [(0, 0), (1, 0), (1, 1)] ( interpolation = "faceVarying" )
        int[] primvars:skel:jointIndices = [0, 1, 2, 0, 1, 2] ( elementSize = 2 interpolation = "vertex" )
        matrix4d primvars:skel:geomBindTransform = ( (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (5, 6, 7, 1) )
        quatf[] rotations = [(0.5, 0.5, 0.5, 0.5), (1, 0, 0, 0)]
        half3[] scales = [(1, 2, 0.5)]
        float f = 0.25
        double d = 0.1
        bool b = 1
        token t = "tok"
        asset inputs:file = @./tex.png@
        color3f inputs:c.connect = </W/S.outputs:rgb>
        rel material:binding = </W/S>
    }
    def Shader "S" { float3 outputs:rgb }
}`;
    const read = (bytes) => { const stage = readUSDStage(bytes); return { stage, m: stage.prims.get('/W/M'), w: stage.prims.get('/W') }; };
    const a = read(new TextEncoder().encode(text));
    const bin = writeUSDC(parseUsdText(text));
    const b = read(bin);
    assert.deepEqual([b.stage.meta.defaultPrim, b.stage.meta.metersPerUnit, b.stage.meta.upAxis], ['W', 0.01, 'Y']);
    assert.deepEqual(b.w.attrs.get('xformOp:translate').samples, [[1, [1, 2, 3]], [5, [4, 5, 6]]]);
    assert.deepEqual(b.w.attrs.get('xformOpOrder').value, ['xformOp:translate']);
    assert.equal(b.w.attrs.get('userProperties:note').value, 'hello');
    const value = (x, name) => x.m.attrs.get(name).value;
    for (const name of ['points', 'faceVertexCounts', 'faceVertexIndices', 'primvars:st', 'primvars:skel:jointIndices', 'scales', 'f', 't']) assert.deepEqual(value(b, name), value(a, name), name);
    assert.deepEqual(value(b, 'rotations'), [[0.5, 0.5, 0.5, 0.5], [1, 0, 0, 0]], 'quaternions, real part first');
    assert.deepEqual(value(b, 'primvars:skel:geomBindTransform'), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]);
    assert.equal(value(b, 'd'), 0.1);
    assert.equal(value(b, 'b'), true);
    assert.equal(value(b, 'inputs:file'), './tex.png');
    assert.equal(b.m.attrs.get('primvars:st').interpolation, 'faceVarying');
    assert.equal(b.m.attrs.get('primvars:skel:jointIndices').elementSize, 2);
    assert.deepEqual(b.m.attrs.get('inputs:c').connect, ['/W/S.outputs:rgb']);
    assert.deepEqual(b.m.rels.get('material:binding'), ['/W/S']);
    // What USD's reader needs: types, specifiers, children and property lists, custom data and API schemas.
    const crate = new Crate(bin);
    assert.equal(crate.value(crate.specs.get('/W/M.points').fields.typeName), 'point3f[]');
    assert.equal(crate.value(crate.specs.get('/W').fields.specifier), 0);
    assert.deepEqual(crate.value(crate.specs.get('/W').fields.primChildren), ['M', 'S']);
    assert.ok(crate.specs.get('/W').fields.customData != null && crate.specs.get('/W/M').fields.apiSchemas != null);
    assert.ok(crate.value(crate.specs.get('/W/M').fields.properties).includes('material:binding'));
  });
  const composed = `#usda 1.0
(
    defaultPrim = "Scene"
)
class Xform "_Base"
{
    double3 xformOp:scale = (2, 2, 2)
    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:scale"]
}
def Xform "Proto"
{
    double3 xformOp:translate = (0, 0, 0)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "Body"
    {
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        rel material:binding = </Proto/Red>
    }
    def Material "Red"
    {
        token outputs:surface.connect = </Proto/Red/S.outputs:surface>
        def Shader "S" { uniform token info:id = "UsdPreviewSurface"
            color3f inputs:diffuseColor = (1, 0, 0)
            token outputs:surface }
    }
}
def Xform "Scene"
{
    def Xform "Copy" ( prepend references = </Proto> inherits = </_Base> )
    {
        double3 xformOp:translate = (5, 0, 0)
    }
    def Xform "Shaped" (
        variants = { string shape = "tall" }
        prepend variantSets = "shape"
    )
    {
        double3 xformOp:translate = (0, 3, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
        variantSet "shape" = {
            "flat" { def Mesh "Flat" { point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
                int[] faceVertexCounts = [3]
                int[] faceVertexIndices = [0, 1, 2] } }
            "tall" { def Mesh "Tall" { point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 0, 9)]
                int[] faceVertexCounts = [3]
                int[] faceVertexIndices = [0, 1, 2] } }
        }
    }
    def Xform "Outside" ( prepend references = @parts/part.usda@ )
    {
    }
}`;
  const part = `#usda 1.0
(
    defaultPrim = "Part"
)
def Xform "Part"
{
    double3 xformOp:translate = (0, 0, 7)
    uniform token[] xformOpOrder = ["xformOp:translate"]
    def Mesh "Piece" { point3f[] points = [(0, 0, 0), (2, 0, 0), (0, 2, 0)]
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2] }
}`;
  test('composition: a reference with its material, a class inherited, the chosen variant, and a layer inside the .usdz', () => {
    const usdz = storeUSDZ([{ name: 'scene.usda', bytes: new TextEncoder().encode(composed) }, { name: 'parts/part.usda', bytes: new TextEncoder().encode(part) }]);
    const stage = readUSDStage(usdz);
    assert.deepEqual(stage.missing, []);
    // The reference brings the prototype's mesh and material under the copy, with its binding moved along.
    assert.ok(stage.prims.get('/Scene/Copy/Body'));
    assert.deepEqual(stage.prims.get('/Scene/Copy/Body').rels.get('material:binding'), ['/Scene/Copy/Red']);
    assert.deepEqual(stage.prims.get('/Scene/Copy/Red').attrs.get('outputs:surface').connect, ['/Scene/Copy/Red/S.outputs:surface']);
    // The copy's own translate wins; the class gives its scale and op order.
    assert.deepEqual(attrAt(stage.prims.get('/Scene/Copy').attrs.get('xformOp:translate')), [5, 0, 0]);
    assert.deepEqual(attrAt(stage.prims.get('/Scene/Copy').attrs.get('xformOp:scale')), [2, 2, 2]);
    assert.ok(stage.prims.get('/Scene/Shaped/Tall') && !stage.prims.get('/Scene/Shaped/Flat'), 'only the chosen variant');
    assert.ok(stage.prims.get('/Scene/Outside/Piece'), 'a file of the .usdz');
    // As objects: the copy with its red material and scale, the variant's mesh, the outside piece; no class, no prototype doubled.
    const doc = createDocument();
    doc.objects = [];
    const list = importUSDScene(doc, usdz);
    const named = (n) => list.find((o) => o.name === n);
    assert.ok(!list.some((o) => o.name === '_Base'));
    const copy = named('Body') ?? named('Copy');
    assert.ok(copy, list.map((o) => o.name).join());
    const top = list.filter((o) => o.type === 'MESH').map((o) => [o.name, new Vector3().setFromMatrixPosition(worldMatrix(doc, o)).toArray().map((x) => +x.toFixed(4))]);
    assert.ok(top.some(([, p]) => p[0] === 5), `the copy stands at x = 5: ${JSON.stringify(top)}`);
    const red = list.filter((o) => o.type === 'MESH').map((o) => doc.materials.find((m) => m.id === o.materials?.[0])).find((m) => m?.name === 'Red');
    assert.deepEqual(red?.baseColor, [1, 0, 0]);
    const tall = list.find((o) => o.type === 'MESH' && Math.max(...o.data.verts.map((v) => Math.abs(v[2]) + Math.abs(v[1]))) >= 9);
    assert.ok(tall, 'the tall variant');
    // Without the layer: it is listed as missing, and the rest still comes in.
    const alone = readUSDStage(new TextEncoder().encode(composed));
    assert.deepEqual(alone.missing, ['parts/part.usda']);
    assert.ok(alone.prims.get('/Scene/Copy/Body'));
    // Written as binary, references and inherits survive, and compose the same.
    const again = readUSDStage(writeUSDC(parseUsdText(composed)));
    assert.ok(again.prims.get('/Scene/Copy/Body') && again.prims.get('/Scene/Copy').attrs.get('xformOp:scale'));
  });
});

describe('USD blend shapes', () => {
  test('shape keys travel as blend shapes with their weights keyed, on a mesh of their own skeleton or a skinned one', () => {
    const doc = createDocument();
    doc.objects = [];
    doc.fps = 24;
    const morph = cubeMesh(2);
    morph.shapeKeys = [{ name: 'Up', value: 0, verts: morph.verts.map((v) => [v[0], v[1], v[2] > 0 ? v[2] + 1 : v[2]]) }, { name: 'Wide', value: 0.5, verts: morph.verts.map((v) => [v[0] * 2, v[1], v[2]]) }];
    const m = addObject(doc, { type: 'MESH', name: 'Morph', location: [4, 0, 0], data: morph });
    m.data.anim = { fcurves: {}, nla: [] };
    insertKey(m.data, 'shapeKeys.0.value', 1, 0, 'LINEAR');
    insertKey(m.data, 'shapeKeys.0.value', 11, 1, 'LINEAR');
    setFrame(doc, 1);
    const text = exportUSDScene(doc);
    assert.match(text, /def SkelRoot "Morph"/);
    assert.match(text, /def BlendShape "Up"/);
    assert.match(text, /blendShapeWeights\.timeSamples/);
    assert.doesNotMatch(text, /points\.timeSamples/);
    for (const bytes of [new TextEncoder().encode(text), exportUSDScene(doc, { usdc: true })]) {
      const back = createDocument();
      back.objects = [];
      back.fps = 24;
      const list = importUSDScene(back, bytes);
      assert.deepEqual(list.map((o) => o.name), ['Morph'], 'no armature for the weights alone');
      const o = list[0];
      assert.deepEqual(o.data.shapeKeys.map((k) => k.name), ['Up', 'Wide']);
      for (const frame of [1, 6, 11]) {
        setFrame(doc, frame);
        setFrame(back, frame);
        close(o.data.shapeKeys.map((k) => k.value), m.data.shapeKeys.map((k) => k.value), 1e-6);
        const [a, b] = [evaluatedMesh(doc, m).verts, evaluatedMesh(back, o).verts];
        a.forEach((v, i) => close(b[i], v, 1e-5));
      }
    }
  });
});
