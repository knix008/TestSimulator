// Node groups, instancing, several scenes, motion paths, the keymap and the asset library.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BUILTIN_ASSETS, applyAsset, assetName, assetPreview, fileAssets, packAsset } from '../../src/core/assets.js';
import { activeObject, addObject, createDefaultScene, createDocument, defaultMaterial, deserialize, getMaterial, getObject, serialize, setFrame, worldPosition } from '../../src/core/doc.js';
import { History } from '../../src/core/history.js';
import { applyKeymap, comboFromEvent, defaultKey, keyConflicts, lookupKey, normalizeCombo } from '../../src/core/keymap.js';
import { cubeMesh, gridMesh, planeMesh } from '../../src/core/mesh.js';
import { addLink, createNode, evalShader, evalGeometryNodes, makeGroup, nodeSockets, nodesForKind, syncGroupInstances, ungroup, createGroupNode, defaultGeometryGraph } from '../../src/core/nodes.js';
import { getOp, run } from '../../src/core/ops.js';
import { buildRenderScene } from '../../src/core/pathtracer.js';
import { calculateMotionPath, isInstanceSource, makeInstancesReal, newScene, onionFrames, pathLength, removeScene, sceneInstances, switchScene } from '../../src/core/scenes.js';
import * as anim from '../../src/core/anim.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b} (±${eps})`);
const context = () => {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  return { doc, history, undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); } };
};
const shaderGraph = () => {
  // Value → Math (×2) → Math (+1) → Base Color's red, through a Combine-free shortcut: a value link fills a colour.
  const value = createNode('VALUE', 0, 0, { value: 0.1 });
  const a = createNode('MATH', 200, 0, { operation: 'MULTIPLY', Value2: 2 });
  const b = createNode('MATH', 400, 0, { operation: 'ADD', Value2: 0.3 });
  const bsdf = createNode('BSDF_PRINCIPLED', 600, 0);
  const out = createNode('OUTPUT_MATERIAL', 800, 0);
  const g = { kind: 'SHADER', nodes: [value, a, b, bsdf, out], links: [] };
  const socketsA = nodeSockets(a).inputs.map((s) => s.name);
  addLink(g, value.id, 'Value', a.id, socketsA[0]);
  a.values[socketsA[1]] = 2;
  addLink(g, a.id, 'Value', b.id, socketsA[0]);
  b.values[socketsA[1]] = 0.3;
  addLink(g, b.id, 'Value', bsdf.id, 'Base Color');
  addLink(g, bsdf.id, 'BSDF', out.id, 'Surface');
  return { g, value, a, b, bsdf, out };
};
const base = (g) => evalShader(g, { uv: [0, 0], position: [0, 0, 0], normal: [0, 0, 1] }).baseColor;

describe('node groups', () => {
  test('grouping does not change what the tree computes', () => {
    const { g, a, b } = shaderGraph();
    const before = base(g);
    near(before[0], 0.5);
    const node = makeGroup(g, [a.id, b.id], 'Twice Plus');
    assert.equal(g.nodes.filter((n) => n.type === 'GROUP').length, 1);
    assert.equal(g.nodes.some((n) => n.id === a.id), false, 'the nodes moved inside');
    assert.deepEqual(node.group.inputs.map((s) => s.type), ['VALUE']);
    assert.deepEqual(node.group.outputs.map((s) => s.type), ['VALUE']);
    assert.deepEqual(base(g), before);
  });
  test('the group node has the sockets the boundary needs', () => {
    const { g, a, b } = shaderGraph();
    const node = makeGroup(g, [a.id, b.id]);
    assert.equal(nodeSockets(node).inputs.length, 1);
    assert.ok(g.links.some((l) => l.to === node.id));
    assert.ok(g.links.some((l) => l.from === node.id));
  });
  test('ungroup restores the same result and the same nodes', () => {
    const { g, a, b } = shaderGraph();
    const before = base(g);
    const node = makeGroup(g, [a.id, b.id]);
    assert.equal(ungroup(g, node.id), true);
    assert.equal(g.nodes.some((n) => n.type === 'GROUP'), false);
    assert.equal(g.nodes.filter((n) => n.type === 'MATH').length, 2);
    assert.deepEqual(base(g), before);
  });
  test('a group inside a group', () => {
    const { g, a, b } = shaderGraph();
    const before = base(g);
    const inner = makeGroup(g, [a.id]);
    makeGroup(g, [inner.id, b.id], 'Outer');
    assert.equal(g.nodes.filter((n) => n.type === 'MATH').length, 0);
    assert.deepEqual(base(g), before);
  });
  test('an unlinked group input is typed on the group node, and reaches inside', () => {
    const { g, a, b, value } = shaderGraph();
    const node = makeGroup(g, [a.id, b.id]);
    g.links = g.links.filter((l) => l.from !== value.id);
    node.values[node.group.inputs[0].name] = 1;
    near(base(g)[0], 2.3);
  });
  test('editing one use updates the others', () => {
    const doc = createDocument();
    const m1 = { ...defaultMaterial('A'), useNodes: true };
    const { g, a, b } = shaderGraph();
    m1.nodes = g;
    const node = makeGroup(g, [a.id, b.id], 'Shared');
    const m2 = { ...defaultMaterial('B'), useNodes: true, nodes: { kind: 'SHADER', nodes: [createGroupNode(node.group)], links: [] } };
    doc.materials.push(m1, m2);
    const inner = node.group.graph.nodes.find((n) => n.type === 'MATH' && n.values.operation === 'ADD');
    inner.values[nodeSockets(inner).inputs[1].name] = 0.9;
    assert.equal(syncGroupInstances(doc, node.group), 1);
    const other = m2.nodes.nodes[0].group.graph.nodes.find((n) => n.type === 'MATH' && n.values.operation === 'ADD');
    assert.equal(other.values[nodeSockets(other).inputs[1].name], 0.9);
    assert.equal(doc.nodeGroups.length, 1, 'remembered for the Add menu');
  });
  test('groups work in a geometry tree too', () => {
    const g = defaultGeometryGraph();
    const input = g.nodes.find((n) => n.type === 'GROUP_INPUT');
    const output = g.nodes.find((n) => n.type === 'GROUP_OUTPUT');
    const xf = createNode('TRANSFORM_GEOMETRY', 200, 0, { Translation: [0, 0, 5] });
    addLink(g, input.id, 'Geometry', xf.id, 'Geometry');
    addLink(g, xf.id, 'Geometry', output.id, 'Geometry');
    const before = evalGeometryNodes(g, cubeMesh(2)).verts[0];
    makeGroup(g, [xf.id], 'Lift');
    assert.deepEqual(evalGeometryNodes(g, cubeMesh(2)).verts[0], before);
  });
  test('the group\'s own nodes are not in the Add menu', () => {
    assert.equal(nodesForKind('SHADER').some((n) => ['GROUP', 'NG_INPUT', 'NG_OUTPUT'].includes(n.id)), false);
  });
  test('a tree with groups survives saving', () => {
    const { g, a, b } = shaderGraph();
    makeGroup(g, [a.id, b.id]);
    near(base(JSON.parse(JSON.stringify(g)))[0], 0.5);
  });
});

describe('instancing', () => {
  const withCollection = () => {
    const ctx = context();
    const doc = ctx.doc;
    run(ctx, 'collection.create', { name: 'Props' });
    const col = doc.collections.at(-1);
    activeObject(doc).collection = col.id;
    doc.activeCollection = 'col_root';
    return { ctx, doc, col };
  };
  test('a collection instance repeats what is in the collection, where the empty is', () => {
    const { ctx, doc, col } = withCollection();
    run(ctx, 'object.collection_instance_add', { collection: col.id, location: [0, 0, 0] });
    activeObject(doc).location = [5, 0, 0];
    const list = sceneInstances(doc);
    assert.equal(list.length, 1);
    near(list[0].matrix.elements[12], 5);
  });
  test('an instance of a child collection, and an excluded source collection still renders', () => {
    const { ctx, doc, col } = withCollection();
    col.exclude = true;
    run(ctx, 'object.collection_instance_add', { collection: col.id });
    activeObject(doc).location = [5, 0, 0];
    const scene = buildRenderScene(doc, { width: 4, height: 4 });
    assert.equal(scene.positions.length / 9, 12, 'once, through the instance');
    let maxX = -Infinity;
    for (let i = 0; i < scene.positions.length; i += 3) maxX = Math.max(maxX, scene.positions[i]);
    near(maxX, 6, 1e-5);
  });
  test('children repeat on vertices, keep their offset, and the original hides', () => {
    const doc = createDocument();
    const owner = addObject(doc, { type: 'MESH', name: 'Owner', data: planeMesh(4), location: [10, 0, 0], instancing: { mode: 'VERTS' } });
    const child = addObject(doc, { type: 'MESH', name: 'Child', data: cubeMesh(0.5), parent: owner.id, location: [0, 0, 1], parentInverse: undefined });
    const list = sceneInstances(doc);
    assert.equal(list.length, 4);
    assert.equal(isInstanceSource(doc, child), true);
    const xs = list.map((x) => x.matrix.elements[12]).sort((a, b) => a - b);
    assert.deepEqual(xs.map((x) => Math.round(x)), [8, 8, 12, 12]);
    for (const x of list) near(x.matrix.elements[14], 1);
    assert.equal(buildRenderScene(doc, { width: 2, height: 2 }).positions.length / 9, 2 + 4 * 12, 'the owner plus four instances; not the original');
  });
  test('on faces: at the centre, turned to the normal, optionally scaled by area', () => {
    const doc = createDocument();
    const owner = addObject(doc, { type: 'MESH', name: 'Cube', data: cubeMesh(2), instancing: { mode: 'FACES' } });
    addObject(doc, { type: 'MESH', name: 'Stud', data: cubeMesh(0.2), parent: owner.id, location: [0, 0, 0.5] });
    const list = sceneInstances(doc);
    assert.equal(list.length, 6);
    for (const inst of list) near(Math.hypot(inst.matrix.elements[12], inst.matrix.elements[13], inst.matrix.elements[14]), 1.5, 1e-6);
    owner.instancing.scaleByArea = true;
    near(Math.hypot(sceneInstances(doc)[0].matrix.elements[0], sceneInstances(doc)[0].matrix.elements[1], sceneInstances(doc)[0].matrix.elements[2]), 2, 1e-6);
  });
  test('Make Real turns instances into ordinary objects where they were', () => {
    const doc = createDocument();
    const owner = addObject(doc, { type: 'MESH', name: 'Owner', data: planeMesh(4), instancing: { mode: 'VERTS' } });
    addObject(doc, { type: 'MESH', name: 'Child', data: cubeMesh(0.5), parent: owner.id });
    const expected = sceneInstances(doc).map((x) => x.matrix.elements[12]).sort();
    const made = makeInstancesReal(doc, owner, addObject);
    assert.equal(made.length, 4);
    assert.deepEqual(made.map((o) => o.location[0]).sort(), expected);
    assert.equal(sceneInstances(doc).length, 0);
    assert.notEqual(made[0].name, made[1].name);
  });
  test('the operators', () => {
    const ctx = context();
    run(ctx, 'object.instancer_set', { mode: 'FACES' });
    assert.equal(activeObject(ctx.doc).instancing.mode, 'FACES');
    run(ctx, 'object.instancer_set', { mode: 'NONE' });
    assert.equal(sceneInstances(ctx.doc).length, 0);
  });
});

describe('several scenes', () => {
  test('a new empty scene has nothing in it; switching back finds everything', () => {
    const doc = createDefaultScene();
    const ids = doc.objects.map((o) => o.id);
    const id = newScene(doc);
    assert.equal(doc.activeScene, id);
    assert.equal(doc.objects.length, 0);
    addObject(doc, { type: 'EMPTY', name: 'Only Here' });
    switchScene(doc, 'scene_1');
    assert.deepEqual(doc.objects.map((o) => o.id), ids);
    switchScene(doc, id);
    assert.deepEqual(doc.objects.map((o) => o.name), ['Only Here']);
  });
  test('a copied scene has its own objects with their references, and shares materials', () => {
    const doc = createDefaultScene();
    const first = doc.objects[0];
    addObject(doc, { type: 'EMPTY', name: 'Child', parent: first.id });
    const materials = doc.materials.length;
    newScene(doc, { copy: true });
    assert.equal(doc.objects.length, 4);
    assert.notEqual(doc.objects[0].id, first.id);
    assert.equal(getObject(doc, doc.objects[3].parent)?.name, first.name);
    assert.ok(getObject(doc, doc.activeCamera)?.type === 'CAMERA');
    assert.equal(doc.materials.length, materials);
    doc.objects[0].location = [9, 9, 9];
    switchScene(doc, 'scene_1');
    assert.deepEqual(doc.objects[0].location, [0, 0, 0]);
  });
  test('frame, world and render settings belong to each scene', () => {
    const doc = createDefaultScene();
    doc.frame = 7;
    doc.render.samples = 5;
    newScene(doc);
    doc.frame = 99;
    doc.render.samples = 77;
    doc.world.color = [1, 0, 0];
    switchScene(doc, 'scene_1');
    assert.equal(doc.frame, 7);
    assert.equal(doc.render.samples, 5);
    assert.notDeepEqual(doc.world.color, [1, 0, 0]);
  });
  test('deleting: the last one stays; deleting the active one moves on', () => {
    const doc = createDefaultScene();
    assert.equal(removeScene(doc), false);
    newScene(doc);
    assert.equal(removeScene(doc), true);
    assert.equal(doc.activeScene, 'scene_1');
    assert.equal(doc.scenes.length, 1);
    assert.equal(doc.objects.length, 3);
  });
  test('names stay unique; saving and undo keep every scene', () => {
    const ctx = context();
    run(ctx, 'scene.new');
    run(ctx, 'scene.new');
    assert.deepEqual(ctx.doc.scenes.map((s) => s.name), ['Scene', 'Scene.001', 'Scene.002']);
    const back = deserialize(serialize(ctx.doc));
    assert.equal(back.scenes.length, 3);
    ctx.undo();
    assert.equal(ctx.doc.scenes.length, 2);
    assert.equal(ctx.doc.activeScene, ctx.doc.scenes[1].id);
  });
  test('a file saved before scenes existed opens with one', () => {
    const doc = createDefaultScene();
    delete doc.scenes;
    delete doc.activeScene;
    const back = deserialize(JSON.stringify(doc));
    assert.equal(back.scenes.length, 1);
    assert.ok(newScene(back));
    assert.equal(back.scenes.length, 2);
  });
});

describe('motion paths', () => {
  const moving = () => {
    const ctx = context();
    const obj = activeObject(ctx.doc);
    anim.insertKey(obj, 'location.0', 1, 0, 'LINEAR');
    anim.insertKey(obj, 'location.0', 11, 10, 'LINEAR');
    return { ctx, obj };
  };
  test('the path follows the keyframes, and the frame is put back', () => {
    const { ctx, obj } = moving();
    setFrame(ctx.doc, 5);
    const path = calculateMotionPath(ctx.doc, obj, { start: 1, end: 11 });
    assert.equal(path.points.length, 11);
    near(path.points[0][0], 0);
    near(path.points[10][0], 10);
    near(pathLength(path.points), 10, 1e-6);
    assert.equal(ctx.doc.frame, 5);
    near(obj.location[0], 4, 1e-6);
  });
  test('it follows parents too, and a step leaves frames out', () => {
    const { ctx, obj } = moving();
    const child = addObject(ctx.doc, { type: 'EMPTY', name: 'Rider', parent: obj.id, location: [0, 0, 2] });
    const path = calculateMotionPath(ctx.doc, child, { start: 1, end: 11, step: 5 });
    assert.equal(path.points.length, 3);
    near(path.points[2][0], 10);
    near(path.points[2][2], 2);
    void worldPosition;
  });
  test('onion frames lie around the current one, nearer ones stronger, inside the path', () => {
    const { ctx, obj } = moving();
    const path = calculateMotionPath(ctx.doc, obj, { start: 1, end: 11 });
    const list = onionFrames(path, 6, { before: 2, after: 2, every: 2 });
    assert.deepEqual(list.map((x) => x.frame), [2, 4, 8, 10]);
    assert.ok(list[1].opacity > list[0].opacity);
    assert.deepEqual(onionFrames(path, 1, { before: 2, after: 1, every: 2 }).map((x) => x.frame), [3]);
    assert.deepEqual(onionFrames(null, 1), []);
  });
  test('the operators', () => {
    const { ctx, obj } = moving();
    run(ctx, 'object.paths_calculate', { start: 1, end: 11 });
    assert.equal(obj.motionPath.points.length, 11);
    run(ctx, 'object.onion_set', { before: 1, after: 1, every: 2 });
    assert.equal(obj.onion.every, 2);
    run(ctx, 'object.paths_clear');
    assert.equal(obj.motionPath, null);
  });
});

describe('keymap', () => {
  const event = (key, mods = {}) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  test('a key press has one name', () => {
    assert.equal(comboFromEvent(event('k')), 'K');
    assert.equal(comboFromEvent(event('K', { shiftKey: true })), 'Shift+K');
    assert.equal(comboFromEvent(event('k', { ctrlKey: true, altKey: true })), 'Ctrl+Alt+K');
    assert.equal(comboFromEvent(event(' ')), 'Space');
    assert.equal(comboFromEvent(event('Shift', { shiftKey: true })), null);
    assert.equal(comboFromEvent(event('F5')), 'F5');
    assert.equal(normalizeCombo('shift + ctrl+a'), 'Ctrl+Shift+A');
  });
  test('a changed key runs its operator, and the old one no longer does', () => {
    const can = () => true;
    const table = { 'mesh.rip': 'K' };
    assert.deepEqual(lookupKey(table, 'K', can), { run: 'mesh.rip' });
    assert.deepEqual(lookupKey(table, 'V', can), { swallow: true });
    assert.equal(lookupKey(table, 'J', can), null);
  });
  test('an operator that cannot run now leaves the key alone', () => {
    const table = { 'mesh.rip': 'K' };
    assert.equal(lookupKey(table, 'K', () => false), null);
    assert.equal(lookupKey(table, 'V', () => false), null);
  });
  test('menus show the new key; reset brings the default back', () => {
    assert.equal(defaultKey('mesh.rip'), 'V');
    applyKeymap({ 'mesh.rip': 'K' });
    assert.equal(getOp('mesh.rip').key, 'K');
    applyKeymap({ 'mesh.rip': '' });
    assert.equal(getOp('mesh.rip').key, undefined);
    applyKeymap({});
    assert.equal(getOp('mesh.rip').key, 'V');
  });
  test('conflicts are found', () => {
    assert.ok(keyConflicts('mesh.rip', 'G').includes('transform.translate'));
    assert.deepEqual(keyConflicts('mesh.rip', 'Ctrl+Alt+Shift+F9'), []);
  });
});

describe('asset library', () => {
  test('every built-in asset has names in both languages and unique ids', () => {
    const ids = new Set();
    for (const a of BUILTIN_ASSETS) {
      assert.ok(a.name.en && a.name.ko, a.id);
      assert.equal(ids.has(a.id), false, a.id);
      ids.add(a.id);
    }
    assert.ok(BUILTIN_ASSETS.length >= 20);
  });
  test('a material goes on the selection, an independent copy each time', () => {
    const doc = createDefaultScene();
    const gold = BUILTIN_ASSETS.find((a) => a.id === 'lib_gold');
    const m = applyAsset(doc, gold, 'ko');
    assert.equal(m.name, '금');
    assert.equal(activeObject(doc).materials[0], m.id);
    assert.equal(getMaterial(doc, m.id).metallic, 1);
    m.roughness = 0.9;
    assert.equal(gold.material.roughness, 0.2);
  });
  test('with nothing to put it on, a material does nothing', () => {
    const doc = createDocument();
    assert.equal(applyAsset(doc, BUILTIN_ASSETS.find((a) => a.kind === 'MATERIAL')), null);
    assert.equal(doc.materials.length, 0);
  });
  test('an object appears at the 3D cursor, selected', () => {
    const doc = createDefaultScene();
    doc.cursor = [1, 2, 3];
    const made = applyAsset(doc, BUILTIN_ASSETS.find((a) => a.id === 'lib_ring'));
    assert.deepEqual(made.location, [1, 2, 3]);
    assert.equal(doc.activeId, made.id);
    assert.equal(made.data.smooth, true);
  });
  test('marked objects are assets of the file; packed ones carry their materials to another file', () => {
    const ctx = context();
    const obj = activeObject(ctx.doc);
    const mat = getMaterial(ctx.doc, obj.materials[0]);
    mat.baseColor = [0, 1, 0];
    run(ctx, 'asset.mark', { catalog: 'Mine' });
    const list = fileAssets(ctx.doc);
    assert.equal(list.length, 1);
    assert.equal(list[0].catalog, 'Mine');
    const packed = JSON.parse(JSON.stringify(packAsset(ctx.doc, obj)));
    const other = createDocument();
    const made = applyAsset(other, packed);
    assert.equal(made.data.verts.length, 8);
    assert.deepEqual(getMaterial(other, made.materials[0]).baseColor, [0, 1, 0]);
    assert.equal(assetName(packed), obj.name);
    run(ctx, 'asset.clear');
    assert.equal(fileAssets(ctx.doc).length, 0);
  });
  test('previews are real pictures: a gold ball is not a grey one', () => {
    const picture = (id) => assetPreview(BUILTIN_ASSETS.find((a) => a.id === id), 24, 4);
    const gold = picture('lib_gold');
    assert.equal(gold.rgba.length, 24 * 24 * 4);
    const centre = (p) => { const i = (12 * 24 + 12) * 4; return [p.rgba[i], p.rgba[i + 1], p.rgba[i + 2]]; };
    const [r, , b] = centre(gold);
    assert.ok(r > b + 20, `gold centre ${centre(gold)}`);
    const neon = centre(picture('lib_neon'));
    assert.ok(neon[0] > 200, `neon glows: ${neon}`);
    assert.ok(picture('lib_floor').rgba.length > 0);
  });
});
void gridMesh;
