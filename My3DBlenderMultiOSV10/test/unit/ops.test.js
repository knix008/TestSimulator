import * as svg from '../../src/core/svg.js';
import * as usdscene from '../../src/core/usdscene.js';
import * as abcscene from '../../src/core/abcscene.js';
import * as daescene from '../../src/core/daescene.js';
import * as gpencil from '../../src/core/gpencil.js';
import * as fbxscene from '../../src/core/fbxscene.js';
import * as blendscene from '../../src/core/blendscene.js';
import * as rigid from '../../src/core/rigid.js';
import * as usdc from '../../src/core/usdc.js';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { activeObject, addObject, createDefaultScene, createDocument, deserialize, getObject, serialize, worldPosition } from '../../src/core/doc.js';
import { FEATURES, coverage } from '../../src/core/features.js';
import { History } from '../../src/core/history.js';
import { cubeMesh, setFaceSelection, signedVolume } from '../../src/core/mesh.js';
import { MODIFIERS } from '../../src/core/modifiers.js';
import { NODE_TYPES } from '../../src/core/nodes.js';
import { adjustLast, allOps, canRun, getOp, opIds, run } from '../../src/core/ops.js';
import { createApi, runConsoleLine, runScript } from '../../src/core/script.js';
import * as anim from '../../src/core/anim.js';
import * as armature from '../../src/core/armature.js';
import * as doc2 from '../../src/core/doc.js';
import * as io from '../../src/core/io.js';
import * as meshops from '../../src/core/meshops.js';
import * as metaball from '../../src/core/metaball.js';
import * as addons from '../../src/core/addons.js';
import * as assets from '../../src/core/assets.js';
import * as osl from '../../src/core/osl.js';
import * as python from '../../src/core/python.js';
import * as sequencer from '../../src/core/sequencer.js';
import * as tracking from '../../src/core/tracking.js';
import * as blendfile from '../../src/core/blendfile.js';
import * as freestyle from '../../src/core/freestyle.js';
import * as nurbs from '../../src/core/nurbs.js';
import * as simulation from '../../src/core/simulation.js';
import * as keymap from '../../src/core/keymap.js';
import * as nodes from '../../src/core/nodes.js';
import * as scenes from '../../src/core/scenes.js';
import * as formats from '../../src/core/formats.js';
import * as paint from '../../src/core/paint.js';
import * as pathtracer from '../../src/core/pathtracer.js';
import * as remesh from '../../src/core/remesh.js';
import * as unwrap from '../../src/core/unwrap.js';
import * as physics from '../../src/core/physics.js';
import * as script from '../../src/core/script.js';
import * as sculpt from '../../src/core/sculpt.js';

function context() {
  const doc = createDefaultScene();
  const history = new History();
  history.reset(doc);
  const ctx = {
    doc, history,
    undo() { const text = this.history.undo(); if (text) this.doc = deserialize(text); return Boolean(text); },
  };
  return ctx;
}

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not near ${b}`);

describe('operator registry', () => {
  test('every operator has names in both languages and a valid id', () => {
    for (const op of allOps()) {
      assert.match(op.id, /^[a-z0-9_]+\.[a-z0-9_]+$/);
      assert.ok(op.en, `${op.id} needs an English name`);
      assert.ok(op.ko, `${op.id} needs a Korean name`);
      assert.match(op.ko, /[가-힣]|^RGB|^UV|^IK/, `${op.id}: the Korean name should be Korean: ${op.ko}`);
    }
  });
  test('every visible operator property has names in both languages', () => {
    for (const op of allOps()) {
      for (const p of op.props) {
        if (p.hidden) continue;
        assert.ok(p.en && p.ko, `${op.id}.${p.name}`);
        if (p.type === 'enum') assert.ok(p.options.includes(p.def), `${op.id}.${p.name}: default not among the options`);
      }
    }
  });
  test('an unknown operator and one that cannot run say so', () => {
    const ctx = context();
    assert.throws(() => run(ctx, 'no.such'), /Unknown operator/);
    assert.throws(() => run(ctx, 'mesh.extrude_region'), /cannot run/);
    assert.equal(canRun(ctx, 'mesh.extrude_region'), false);
    run(ctx, 'object.editmode_toggle');
    assert.equal(canRun(ctx, 'mesh.extrude_region'), true);
  });
});

describe('add and object operators', () => {
  const adds = ['plane', 'cube', 'circle', 'uv_sphere', 'ico_sphere', 'cylinder', 'cone', 'torus', 'grid'];
  for (const name of adds) {
    test(`add ${name}: selected, active, at the 3D cursor`, () => {
      const ctx = context();
      ctx.doc.cursor = [1, 2, 3];
      run(ctx, `mesh.primitive_${name}_add`);
      const o = activeObject(ctx.doc);
      assert.equal(o.type, 'MESH');
      assert.deepEqual(o.location, [1, 2, 3]);
      assert.deepEqual(ctx.doc.selected, [o.id]);
      assert.ok(o.data.verts.length > 0);
    });
  }
  test('a primitive added in edit mode joins the edited mesh', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    run(ctx, 'mesh.primitive_cube_add');
    assert.equal(ctx.doc.objects.length, 3);
    assert.equal(activeObject(ctx.doc).data.faces.length, 12);
    assert.equal(activeObject(ctx.doc).data.selV.length, 8);
  });
  test('add each other object type', () => {
    for (const [id, type] of [['object.light_add', 'LIGHT'], ['object.camera_add', 'CAMERA'], ['object.empty_add', 'EMPTY'], ['object.armature_add', 'ARMATURE'], ['object.curve_add', 'CURVE'], ['object.text_add', 'TEXT'], ['object.metaball_add', 'META'], ['object.lattice_add', 'LATTICE'], ['object.gpencil_add', 'GPENCIL'], ['object.forcefield_add', 'EMPTY']]) {
      const ctx = context();
      run(ctx, id);
      assert.equal(activeObject(ctx.doc).type, type, id);
    }
  });
  test('light kinds', () => {
    for (const kind of ['POINT', 'SUN', 'SPOT', 'AREA']) {
      const ctx = context();
      run(ctx, 'object.light_add', { kind });
      assert.equal(activeObject(ctx.doc).data.kind, kind);
    }
  });
  test('select all, none, invert, set', () => {
    const ctx = context();
    run(ctx, 'object.select_all', { action: 'SELECT' });
    assert.equal(ctx.doc.selected.length, 3);
    run(ctx, 'object.select_all', { action: 'DESELECT' });
    assert.equal(ctx.doc.selected.length, 0);
    run(ctx, 'object.select_all', { action: 'INVERT' });
    assert.equal(ctx.doc.selected.length, 3);
    run(ctx, 'object.select_set', { id: ctx.doc.objects[1].id });
    assert.deepEqual(ctx.doc.selected, [ctx.doc.objects[1].id]);
    run(ctx, 'object.select_set', { id: ctx.doc.objects[0].id, extend: true });
    assert.equal(ctx.doc.selected.length, 2);
    assert.equal(ctx.doc.activeId, ctx.doc.objects[0].id);
  });
  test('delete clears selection and references', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    const other = ctx.doc.objects[1];
    other.parent = cube.id;
    run(ctx, 'object.delete');
    assert.equal(getObject(ctx.doc, cube.id), null);
    assert.equal(other.parent, null);
    assert.equal(ctx.doc.selected.length, 0);
  });
  test('duplicate copies deep; linked shares the mesh', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    run(ctx, 'object.duplicate');
    const copy = activeObject(ctx.doc);
    assert.equal(copy.name, 'Cube.001');
    assert.notEqual(copy.data, cube.data);
    run(ctx, 'object.duplicate', { linked: true });
    assert.equal(activeObject(ctx.doc).data, copy.data);
  });
  test('join brings the other mesh in, in its world position', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_cube_add', { location: [10, 0, 0] });
    const second = activeObject(ctx.doc);
    run(ctx, 'object.select_set', { id: ctx.doc.objects[0].id });
    run(ctx, 'object.select_set', { id: second.id, extend: true });
    run(ctx, 'object.select_set', { id: ctx.doc.objects[0].id, extend: true });
    run(ctx, 'object.join');
    const joined = activeObject(ctx.doc);
    assert.equal(joined.data.faces.length, 12);
    assert.ok(joined.data.verts.some((v) => v[0] > 9));
    assert.equal(getObject(ctx.doc, second.id), null);
  });
  test('smooth and flat, hide and show', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    run(ctx, 'object.shade_smooth');
    assert.equal(cube.data.smooth, true);
    run(ctx, 'object.shade_flat');
    assert.equal(cube.data.smooth, false);
    run(ctx, 'object.hide_set');
    assert.equal(cube.hide, true);
    run(ctx, 'object.hide_view_clear');
    assert.equal(cube.hide, false);
    assert.deepEqual(ctx.doc.selected, [cube.id]);
  });
  test('modes: only the ones the object type allows', () => {
    const ctx = context();
    run(ctx, 'object.mode_set', { mode: 'SCULPT' });
    assert.equal(ctx.doc.mode, 'SCULPT');
    assert.equal(run(ctx, 'object.mode_set', { mode: 'POSE' }), 'CANCELLED');
    assert.equal(ctx.doc.mode, 'SCULPT');
    run(ctx, 'object.mode_set', { mode: 'OBJECT' });
    run(ctx, 'object.select_set', { id: ctx.doc.objects[1].id });
    assert.equal(run(ctx, 'object.mode_set', { mode: 'EDIT' }), 'CANCELLED');
  });
  test('apply transform moves it into the vertices; the world position stays', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    cube.location = [1, 0, 0];
    cube.scale = [2, 2, 2];
    run(ctx, 'object.transform_apply');
    assert.deepEqual(cube.location, [0, 0, 0]);
    assert.deepEqual(cube.scale, [1, 1, 1]);
    near(Math.max(...cube.data.verts.map((v) => v[0])), 3);
  });
  test('origin to geometry leaves the look unchanged', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    cube.data.verts = cube.data.verts.map((v) => [v[0] + 5, v[1], v[2]]);
    run(ctx, 'object.origin_set');
    near(cube.location[0], 5);
    near(Math.max(...cube.data.verts.map((v) => v[0])), 1);
  });
  test('parent keeps the child in place; clear removes it', () => {
    const ctx = context();
    const [cube, light] = ctx.doc.objects;
    cube.location = [5, 0, 0];
    const before = worldPosition(ctx.doc, light);
    run(ctx, 'object.select_set', { id: light.id });
    run(ctx, 'object.select_set', { id: cube.id, extend: true });
    run(ctx, 'object.parent_set');
    assert.equal(light.parent, cube.id);
    worldPosition(ctx.doc, light).forEach((x, i) => near(x, before[i], 1e-9));
    run(ctx, 'object.select_set', { id: light.id });
    run(ctx, 'object.parent_clear');
    assert.equal(light.parent, null);
  });
  test('armature parent with automatic weights adds groups and a modifier', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    run(ctx, 'object.armature_add');
    const arm = activeObject(ctx.doc);
    run(ctx, 'object.select_set', { id: cube.id });
    run(ctx, 'object.select_set', { id: arm.id, extend: true });
    run(ctx, 'object.parent_set', { type: 'ARMATURE_AUTO' });
    assert.equal(cube.modifiers[0].type, 'ARMATURE');
    assert.equal(cube.data.vgroups[0].name, 'Bone');
  });
  test('convert a curve and text to mesh', () => {
    const ctx = context();
    run(ctx, 'object.text_add', { body: 'Hi' });
    run(ctx, 'object.convert_mesh');
    assert.equal(activeObject(ctx.doc).type, 'MESH');
    assert.ok(activeObject(ctx.doc).data.faces.length > 0);
  });
  test('collections: create, move, delete keeps the objects', () => {
    const ctx = context();
    run(ctx, 'collection.create', { name: 'Props' });
    const id = ctx.doc.activeCollection;
    run(ctx, 'collection.move_objects', { collection: id });
    const cube = ctx.doc.objects[0];
    assert.equal(cube.collection, id);
    run(ctx, 'collection.delete');
    assert.equal(cube.collection, 'col_root');
    assert.equal(ctx.doc.collections.length, 1);
  });
});

describe('transform operators', () => {
  test('object mode: move, rotate about the median, scale', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    run(ctx, 'transform.translate', { value: [1, 2, 3] });
    assert.deepEqual(cube.location, [1, 2, 3]);
    run(ctx, 'transform.rotate', { angle: 90, axis: 'Z' });
    near(cube.rotation[2], 90);
    run(ctx, 'transform.resize', { value: [2, 2, 2] });
    assert.deepEqual(cube.scale, [2, 2, 2]);
  });
  test('rotating two objects swings them round their middle', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_cube_add', { location: [2, 0, 0] });
    const [a, b] = [ctx.doc.objects[0], activeObject(ctx.doc)];
    run(ctx, 'object.select_set', { id: a.id, extend: true });
    run(ctx, 'transform.rotate', { angle: 180, axis: 'Z' });
    near(a.location[0], 2);
    near(b.location[0], 0);
  });
  test('edit mode: moves only selected vertices, in world space', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    cube.scale = [2, 2, 2];
    run(ctx, 'object.editmode_toggle');
    cube.data.selV = [0];
    run(ctx, 'transform.translate', { value: [2, 0, 0] });
    near(cube.data.verts[0][0], 0);
    near(cube.data.verts[1][0], 1);
  });
  test('mirror in edit mode keeps the normals outward', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    run(ctx, 'mesh.select_all');
    run(ctx, 'transform.mirror', { axis: 'X' });
    near(signedVolume(activeObject(ctx.doc).data), 8);
  });
  test('clear location, rotation, scale and cursor snaps', () => {
    const ctx = context();
    const cube = ctx.doc.objects[0];
    Object.assign(cube, { location: [1, 1, 1], rotation: [9, 9, 9], scale: [3, 3, 3] });
    run(ctx, 'view3d.snap_cursor_to_selected');
    assert.deepEqual(ctx.doc.cursor, [1, 1, 1]);
    run(ctx, 'object.location_clear');
    run(ctx, 'object.rotation_clear');
    run(ctx, 'object.scale_clear');
    assert.deepEqual([cube.location, cube.rotation, cube.scale], [[0, 0, 0], [0, 0, 0], [1, 1, 1]]);
    run(ctx, 'view3d.snap_selected_to_cursor');
    assert.deepEqual(cube.location, [1, 1, 1]);
    run(ctx, 'view3d.snap_cursor_to_center');
    assert.deepEqual(ctx.doc.cursor, [0, 0, 0]);
  });
});

describe('mesh operators', () => {
  /** Every mesh.* tool with its usual selection: it must run and leave valid indices. */
  const allMeshOps = opIds().filter((id) => id.startsWith('mesh.') && !id.includes('primitive'));
  for (const id of allMeshOps) {
    test(`${id} runs on a selected cube and leaves valid indices`, () => {
      const ctx = context();
      run(ctx, 'object.editmode_toggle');
      const m = activeObject(ctx.doc).data;
      m.selMode = 'face';
      setFaceSelection(m, id === 'mesh.bridge_edge_loops' ? [] : [1]);
      const result = run(ctx, id);
      assert.ok(['FINISHED', 'CANCELLED'].includes(result));
      const mesh = activeObject(ctx.doc).data;
      for (const face of mesh.faces) for (const i of face) assert.ok(i >= 0 && i < mesh.verts.length, `${id}: index ${i} of ${mesh.verts.length}`);
      for (const i of mesh.selV) assert.ok(i < mesh.verts.length, `${id}: selected ${i}`);
    });
  }
  test('separate moves selected faces to a new object', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    const m = activeObject(ctx.doc).data;
    m.selMode = 'face';
    setFaceSelection(m, [1]);
    run(ctx, 'mesh.separate');
    assert.equal(ctx.doc.objects.length, 4);
    assert.equal(ctx.doc.objects.at(-1).data.faces.length, 1);
    assert.equal(activeObject(ctx.doc).data.faces.length, 5);
    assert.equal(ctx.doc.objects.at(-1).name, 'Cube.001');
  });
  test('adjust last re-runs from the state before it', () => {
    const ctx = context();
    run(ctx, 'object.editmode_toggle');
    const m = activeObject(ctx.doc).data;
    m.selMode = 'face';
    setFaceSelection(m, [1]);
    ctx.history.push(ctx.doc, 'select');
    run(ctx, 'mesh.extrude_region', { offset: 1 });
    near(Math.max(...activeObject(ctx.doc).data.verts.map((v) => v[2])), 2);
    adjustLast(ctx, { offset: 3 });
    near(Math.max(...activeObject(ctx.doc).data.verts.map((v) => v[2])), 4);
    assert.equal(activeObject(ctx.doc).data.faces.length, 10);
    assert.equal(ctx.lastOp.props.offset, 3);
  });
});

describe('uv, modifier, material, animation, physics operators', () => {
  test('uv projections write a layer the size of the faces', () => {
    for (const id of ['uv.smart_project', 'uv.cube_project', 'uv.cylinder_project', 'uv.sphere_project', 'uv.reset']) {
      const ctx = context();
      activeObject(ctx.doc).data.uvs = null;
      run(ctx, id);
      assert.equal(activeObject(ctx.doc).data.uvs.length, 6, id);
    }
  });
  test('add, move, apply, remove modifiers', () => {
    const ctx = context();
    run(ctx, 'object.modifier_add', { type: 'MIRROR' });
    run(ctx, 'object.modifier_add', { type: 'SUBSURF' });
    const o = activeObject(ctx.doc);
    run(ctx, 'object.modifier_move', { index: 1, to: 0 });
    assert.equal(o.modifiers[0].type, 'SUBSURF');
    run(ctx, 'object.modifier_apply', { index: 0 });
    assert.equal(activeObject(ctx.doc).data.faces.length, 96);
    assert.deepEqual(activeObject(ctx.doc).modifiers.map((m) => m.type), ['MIRROR']);
    run(ctx, 'object.modifier_remove', { index: 0 });
    assert.equal(activeObject(ctx.doc).modifiers.length, 0);
  });
  test('every modifier type can be added through the operator', () => {
    for (const type of Object.keys(MODIFIERS)) {
      const ctx = context();
      run(ctx, 'object.modifier_add', { type });
      assert.equal(activeObject(ctx.doc).modifiers[0].type, type);
    }
  });
  test('materials: new, slots, nodes, assign', () => {
    const ctx = context();
    const o = activeObject(ctx.doc);
    run(ctx, 'object.material_slot_add');
    assert.equal(o.materials.length, 2);
    run(ctx, 'material.use_nodes');
    const mat = ctx.doc.materials[0];
    assert.equal(mat.useNodes, true);
    assert.equal(mat.nodes.kind, 'SHADER');
    run(ctx, 'object.editmode_toggle');
    o.data.selMode = 'face';
    setFaceSelection(o.data, [2]);
    run(ctx, 'object.material_slot_assign', { slot: 1 });
    assert.equal(o.data.faceMat[2], 1);
    assert.equal(o.data.faceMat[0], 0);
  });
  test('keyframes, interpolation, markers, frame steps', () => {
    const ctx = context();
    const o = activeObject(ctx.doc);
    run(ctx, 'anim.keyframe_insert');
    assert.equal(Object.keys(o.anim.fcurves).length, 9);
    run(ctx, 'screen.frame_set', { frame: 11 });
    o.location[0] = 10;
    run(ctx, 'anim.keyframe_insert', { type: 'Location' });
    run(ctx, 'anim.interpolation_set', { type: 'LINEAR' });
    run(ctx, 'screen.frame_offset', { delta: -5 });
    assert.equal(ctx.doc.frame, 6);
    near(activeObject(ctx.doc).location[0], 5);
    run(ctx, 'screen.frame_jump', { end: true });
    assert.equal(ctx.doc.frame, 250);
    run(ctx, 'marker.add');
    assert.equal(ctx.doc.markers[0].frame, 250);
    run(ctx, 'screen.frame_set', { frame: 11 });
    run(ctx, 'anim.keyframe_delete');
    run(ctx, 'anim.keyframe_clear');
    assert.equal(Object.keys(activeObject(ctx.doc).anim.fcurves).length, 0);
  });
  test('a keyframe on any numeric property; refuses a non-number', () => {
    const ctx = context();
    run(ctx, 'anim.keyframe_insert_path', { path: 'scale.1' });
    assert.ok(activeObject(ctx.doc).anim.fcurves['scale.1']);
    assert.equal(run(ctx, 'anim.keyframe_insert_path', { path: 'name' }), 'CANCELLED');
  });
  test('shape keys and vertex groups', () => {
    const ctx = context();
    run(ctx, 'object.shape_key_add');
    run(ctx, 'object.vertex_group_add');
    const o = activeObject(ctx.doc);
    assert.equal(o.data.shapeKeys[0].verts.length, 8);
    run(ctx, 'object.editmode_toggle');
    o.data.selV = [0, 1];
    run(ctx, 'object.vertex_group_assign', { group: 0, weight: 0.5 });
    assert.deepEqual(o.data.vgroups[0].w, { 0: 0.5, 1: 0.5 });
  });
  test('bones: extrude chains from the last one; IK and clear pose', () => {
    const ctx = context();
    run(ctx, 'object.armature_add');
    run(ctx, 'armature.bone_add');
    const arm = activeObject(ctx.doc).data;
    assert.equal(arm.bones.length, 2);
    assert.deepEqual(arm.bones[1].head, arm.bones[0].tail);
    assert.equal(arm.bones[1].parent, 0);
    run(ctx, 'pose.ik_solve', { bone: 1, target: [1, 0, 1], chain: 2 });
    assert.ok(arm.bones.some((b) => b.pose.rotation.some((r) => r !== 0)));
    run(ctx, 'pose.transforms_clear');
    assert.deepEqual(arm.bones[0].pose.rotation, [0, 0, 0]);
  });
  test('bake all drives bodies; free all clears', () => {
    const ctx = context();
    ctx.doc.frameEnd = 20;
    const o = activeObject(ctx.doc);
    run(ctx, 'rigidbody.object_add');
    run(ctx, 'ptcache.bake_all');
    assert.ok(o.cache.transform[20].location[2] < 0);
    run(ctx, 'ptcache.free_all');
    assert.deepEqual(activeObject(ctx.doc).cache, {});
    run(ctx, 'rigidbody.object_remove');
    assert.equal(o.rigidBody, null);
  });
  test('cloth, soft body, collision toggle on and off; particles add and remove', () => {
    const ctx = context();
    const o = activeObject(ctx.doc);
    for (const [id, key] of [['object.cloth_toggle', 'cloth'], ['object.softbody_toggle', 'softBody'], ['object.collision_toggle', 'collision']]) {
      run(ctx, id);
      assert.ok(o[key], key);
      run(ctx, id);
      assert.equal(o[key], null, key);
    }
    run(ctx, 'object.particle_system_add', { kind: 'HAIR' });
    assert.equal(o.particles[0].kind, 'HAIR');
    run(ctx, 'object.particle_system_remove');
    assert.equal(o.particles.length, 0);
  });
  test('grease pencil: layers and strokes', () => {
    const ctx = context();
    run(ctx, 'object.gpencil_add');
    run(ctx, 'gpencil.stroke_add', { points: [[0, 0, 0], [1, 0, 0]] });
    run(ctx, 'gpencil.layer_add');
    const d = activeObject(ctx.doc).data;
    assert.equal(d.layers[0].strokes.length, 1);
    assert.equal(d.activeLayer, 1);
    assert.equal(run(ctx, 'gpencil.stroke_add', { points: [[0, 0, 0]] }), 'CANCELLED');
    run(ctx, 'gpencil.clear');
    assert.equal(d.layers[1].strokes.length, 0);
  });
});

describe('undo through operators', () => {
  test('every step comes back', () => {
    const ctx = context();
    run(ctx, 'mesh.primitive_cube_add');
    run(ctx, 'object.modifier_add', { type: 'SUBSURF' });
    assert.equal(ctx.doc.objects.length, 4);
    ctx.undo();
    assert.equal(activeObject(ctx.doc).modifiers.length, 0);
    ctx.undo();
    assert.equal(ctx.doc.objects.length, 3);
    assert.equal(ctx.undo(), false);
  });
  test('select-only operators leave no undo step', () => {
    const ctx = context();
    run(ctx, 'object.select_all', { action: 'DESELECT' });
    assert.equal(ctx.history.canUndo, false);
    assert.equal(getOp('object.select_all').undo, false);
  });
});

describe('scripting', () => {
  test('bpy.ops runs operators; bpy.context and bpy.data read the scene', () => {
    const ctx = context();
    const r = runScript(ctx, `
      bpy.ops.mesh.primitive_cube_add({ size: 4, location: [1, 2, 3] });
      const o = bpy.context.active_object;
      o.location[2] = 9;
      print(o.name, bpy.data.objects.length);
      bpy.context.scene.frame_current = 7;
      return bpy.context.selected_objects.length;
    `);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.value, 1);
    assert.deepEqual(r.output, ['Cube.001 4']);
    assert.equal(ctx.doc.frame, 7);
    assert.equal(activeObject(ctx.doc).location[2], 9);
  });
  test('an error in a script is reported, not thrown', () => {
    const r = runScript(context(), 'nothing.here()');
    assert.equal(r.ok, false);
    assert.match(r.error, /ReferenceError/);
    assert.equal(runScript(context(), 'if (').ok, false);
  });
  test('a script can be undone in one step', () => {
    const ctx = context();
    runScript(ctx, 'bpy.ops.mesh.primitive_cube_add(); bpy.ops.mesh.primitive_cube_add();');
    assert.equal(ctx.doc.objects.length, 5);
    ctx.undo();
    assert.equal(ctx.doc.objects.length, 4);
  });
  test('the console shows expressions and runs statements', () => {
    const ctx = context();
    assert.deepEqual(runConsoleLine(ctx, '1 + 2').output, ['3']);
    assert.deepEqual(runConsoleLine(ctx, 'bpy.data.objects.length').output, ['3']);
    assert.equal(runConsoleLine(ctx, 'for (let i = 0; i < 2; i++) bpy.ops.object.empty_add()').ok, true);
    assert.equal(ctx.doc.objects.length, 5);
    assert.equal(runConsoleLine(ctx, 'bogus()').ok, false);
  });
  test('every operator is reachable from the API', () => {
    const api = createApi(context());
    for (const id of opIds()) {
      const [group, name] = id.split('.');
      assert.equal(typeof api.ops[group][name], 'function', id);
    }
  });
});

describe('feature checklist', () => {
  const modules = { svg, abcscene, usdscene, daescene, fbxscene, blendscene, usdc, rigid, gpencil, addons, anim, armature, assets, blendfile, freestyle, osl, python, sequencer, tracking, keymap, nodes, nurbs, scenes, simulation, doc: doc2, formats, io, meshops, metaball, paint, pathtracer, physics, remesh, script, sculpt, unwrap };
  // Operators the UI layer registers (they need the screen or file dialogs).
  test('ids are unique and every entry is complete', () => {
    const ids = new Set();
    for (const f of FEATURES) {
      assert.ok(!ids.has(f.id), `duplicate ${f.id}`);
      ids.add(f.id);
      assert.ok(f.en && f.ko && f.area, f.id);
      assert.ok(['done', 'partial', 'planned'].includes(f.status), f.id);
    }
  });
  test('partial features list what is missing; done ones list nothing', () => {
    for (const f of FEATURES) {
      if (f.status === 'partial') assert.ok(f.missing?.length && f.missing.every((m) => typeof m === 'string' && m.length > 3), `${f.id} needs its missing parts`);
      else assert.equal(f.missing, undefined, `${f.id} is ${f.status} but lists missing parts`);
    }
  });
  test('planned features claim no code', () => {
    for (const f of FEATURES.filter((x) => x.status === 'planned')) {
      assert.ok(!f.ops && !f.module && !f.node && !f.modifier, f.id);
    }
  });
  test('every operator, module function, modifier and node a feature names exists', () => {
    for (const f of FEATURES) {
      for (const id of f.ops ?? []) assert.ok(getOp(id), `${f.id}: operator ${id}`);
      if (f.module) {
        const [name, fn] = f.module.split('.');
        assert.equal(typeof modules[name]?.[fn], 'function', `${f.id}: ${f.module}`);
      }
      if (f.modifier) assert.ok(MODIFIERS[f.modifier], `${f.id}: modifier ${f.modifier}`);
      if (f.node) assert.ok(NODE_TYPES[f.node], `${f.id}: node ${f.node}`);
    }
  });
  test('every modifier in the code is on the checklist', () => {
    const listed = new Set(FEATURES.map((f) => f.modifier).filter(Boolean));
    for (const key of Object.keys(MODIFIERS)) assert.ok(listed.has(key), key);
  });
  test('the coverage figure is computed from the list', () => {
    const c = coverage();
    assert.equal(c.done + c.partial + c.planned, FEATURES.length);
    assert.ok(c.percent > 0 && c.percent < 100, 'the list must keep what is not done');
    assert.equal(coverage([{ area: 'A', status: 'done' }, { area: 'A', status: 'planned' }]).percent, 50);
  });
});

describe('document helper', () => {
  test('objects can be created in a blank document', () => {
    const doc = createDocument();
    const o = addObject(doc, { type: 'MESH', name: 'M', data: cubeMesh(1) });
    assert.equal(serialize(doc).includes(o.id), true);
  });
});
