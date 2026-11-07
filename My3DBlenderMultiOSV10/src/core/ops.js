// The operator registry: every action in the program has one entry here, so that menus, keys, the search box, scripts
// and tests all run the same code. An operator has an id ('mesh.extrude_region'), names, optional adjustable properties
// and exec(ctx, props). `ctx` = { doc, history, ... }; the UI adds its own operators the same way.
import { Matrix4, Quaternion, Vector3 } from 'three';
import * as anim from './anim.js';
import { autoWeights, createArmature, createBone, solveIK } from './armature.js';
import {
  CONSTRAINTS, GEOMETRY_TYPES, activeObject, addObject, createConstraint, defaultCamera, defaultLight, defaultMaterial, evaluatedMesh, getMaterial, getObject,
  newId, removeObject, rotationFromQuat, rotationQuat, selectOnly, selectedObjects, setFrame, toggleSelect, worldBounds, worldMatrix, worldPosition, defaultSnap } from './doc.js';
import {
  circleMesh, cloneMesh, compact, coneMesh, createMesh, cubeMesh, cylinderMesh, gridMesh, icoSphereMesh, planeMesh, selectAll, selectNone, selectedFaces, selectionCenter,
  setFaceSelection, torusMesh, unwrapBox, unwrapCylinder, unwrapSmart, unwrapSphere, uvSphereMesh, v3,
} from './mesh.js';
import * as meshops from './meshops.js';
import * as meshtools from './meshtools.js';
import { MODIFIERS, catmullClark, createModifier, evaluateMesh } from './modifiers.js';
import { addLink, createNode, defaultCompositorGraph, defaultGeometryGraph, defaultShaderGraph, defaultWorldGraph } from './nodes.js';
import { nurbsPrimitive } from './nurbs.js';
import { solveCamera } from './tracking.js';
import { calculateMotionPath, makeInstancesReal, newScene, removeScene, switchScene } from './scenes.js';
import { createImageBuffer, encodePNGDataUrl } from './paint.js';
import { multiresAddLevel, voxelRemesh } from './remesh.js';
import { unwrapSeams, uvOverlap } from './unwrap.js';
import { bakeDynamicPaint, bakeLiquid, bakeSmoke, clearSimCache, defaultDynamicPaint, defaultLiquidDomain, defaultLiquidFlow, defaultSmokeDomain, defaultSmokeFlow } from './simulation.js';
import { bakeCloth, bakeRigidBodies, bakeSoftBody, clearCaches, defaultCloth, defaultField, defaultParticles, defaultRigidBody, defaultSoftBody } from './physics.js';

const registry = new Map();

/** Registers an operator. `props`: [{ name, en, ko, type:'number'|'int'|'bool'|'enum'|'vec3'|'string', def, min, max, step, options }]. */
export function register(op) {
  if (registry.has(op.id)) throw new Error(`Operator registered twice: ${op.id}`);
  registry.set(op.id, { undo: true, props: [], ...op });
}

/** Add-ons take their operators away again. */
export const unregister = (id) => registry.delete(id);
export const getOp = (id) => registry.get(id);
export const allOps = () => [...registry.values()];
export const opIds = () => [...registry.keys()];

export function defaultsOf(op) {
  const out = {};
  for (const p of op.props ?? []) out[p.name] = typeof p.def === 'function' ? p.def() : structuredClone(p.def);
  return out;
}

export const canRun = (ctx, id) => {
  const op = registry.get(id);
  if (!op) return false;
  try { return !op.poll || Boolean(op.poll(ctx)); } catch { return false; }
};

/** Runs an operator; records undo unless it says 'CANCELLED'. Throws when it cannot run now. */
export function run(ctx, id, props = {}) {
  const op = registry.get(id);
  if (!op) throw new Error(`Unknown operator: ${id}`);
  if (op.poll && !op.poll(ctx)) throw new Error(`Operator cannot run in this context: ${id}`);
  const values = { ...defaultsOf(op), ...props };
  const result = op.exec(ctx, values);
  if (result === 'CANCELLED') return result;
  touch(ctx);
  // Selecting is not an undo step of its own, but the state an undo returns to has to know about it.
  if (op.undo === false) ctx.history?.amend(ctx.doc);
  else ctx.history?.push(ctx.doc, op.en);
  if (op.undo !== false) ctx.lastOp = op.props?.length ? { id, props: values } : null;
  ctx.notify?.(op);
  return result ?? 'FINISHED';
}

/** Re-runs the last operator with new values from the state before it ("Adjust Last Operation"). */
export function adjustLast(ctx, props) {
  if (!ctx.lastOp) return false;
  const { id, props: old } = ctx.lastOp;
  if (ctx.undo) ctx.undo();
  run(ctx, id, { ...old, ...props });
  return true;
}

/** Marks the document changed so the views redraw. */
export function touch(ctx) {
  ctx.doc._rev = (ctx.doc._rev ?? 0) + 1;
}

const hasActive = (ctx) => Boolean(activeObject(ctx.doc));
const isMeshActive = (ctx) => activeObject(ctx.doc)?.type === 'MESH';
const inObject = (ctx) => ctx.doc.mode === 'OBJECT';
const hasSelected = (ctx) => inObject(ctx) && ctx.doc.selected.length > 0;
const inEdit = (ctx) => ctx.doc.mode === 'EDIT' && isMeshActive(ctx);
const activeMesh = (ctx) => activeObject(ctx.doc).data;

const num = (name, en, ko, def, min, max, step = 0.1) => ({ name, en, ko, type: 'number', def, min, max, step });
const int = (name, en, ko, def, min, max) => ({ name, en, ko, type: 'int', def, min, max, step: 1 });
const bool = (name, en, ko, def = false) => ({ name, en, ko, type: 'bool', def });
const choice = (name, en, ko, def, options) => ({ name, en, ko, type: 'enum', def, options });
const vec = (name, en, ko, def = [0, 0, 0], step = 0.1) => ({ name, en, ko, type: 'vec3', def, step });

// ─────────────── add objects

function addMeshObject(ctx, name, mesh, props) {
  const doc = ctx.doc;
  const location = props.location ?? [...doc.cursor];
  if (doc.mode === 'EDIT' && isMeshActive(ctx)) {
    // In edit mode a new primitive joins the mesh being edited.
    const target = activeObject(doc);
    const inv = new Matrix4().copy(worldMatrix(doc, target)).invert();
    const p = new Vector3();
    const base = target.data.verts.length;
    for (const v of mesh.verts) { p.set(v[0] + location[0], v[1] + location[1], v[2] + location[2]).applyMatrix4(inv); target.data.verts.push([p.x, p.y, p.z]); }
    for (const f of mesh.faces) { target.data.faces.push(f.map((i) => i + base)); if (target.data.uvs) target.data.uvs.push(null); if (target.data.faceMat) target.data.faceMat.push(0); }
    for (const [a, b] of mesh.loose ?? []) (target.data.loose ??= []).push([a + base, b + base]);
    target.data.selV = mesh.verts.map((_, i) => base + i);
    target.data.selF = mesh.faces.map((_, i) => target.data.faces.length - mesh.faces.length + i);
    return target;
  }
  const obj = addObject(doc, { type: 'MESH', name, data: mesh, location, rotation: props.rotation ?? [0, 0, 0] });
  selectOnly(doc, obj);
  return obj;
}

const LOC = vec('location', 'Location', '위치', null);
const withLoc = (list) => [...list.map((p) => p), { ...LOC, def: undefined, hidden: true }];

function primitive(id, en, ko, icon, props, build) {
  register({ id: `mesh.primitive_${id}_add`, en, ko, icon, category: 'add', props: withLoc(props), poll: (ctx) => ctx.doc.mode === 'OBJECT' || inEdit(ctx), exec: (ctx, p) => { addMeshObject(ctx, en, build(p), p); } });
}

primitive('plane', 'Plane', '평면', 'prim-plane', [num('size', 'Size', '크기', 2, 0)], (p) => planeMesh(p.size));
primitive('cube', 'Cube', '큐브', 'prim-cube', [num('size', 'Size', '크기', 2, 0)], (p) => cubeMesh(p.size));
primitive('circle', 'Circle', '원', 'prim-circle', [int('vertices', 'Vertices', '꼭짓점', 32, 3, 512), num('radius', 'Radius', '반지름', 1, 0), choice('fill', 'Fill Type', '채우기', 'NOTHING', ['NOTHING', 'NGON', 'FAN'])], (p) => circleMesh(p.vertices, p.radius, p.fill));
primitive('uv_sphere', 'UV Sphere', 'UV 구', 'prim-sphere', [int('segments', 'Segments', '세그먼트', 32, 3, 256), int('rings', 'Rings', '링', 16, 2, 128), num('radius', 'Radius', '반지름', 1, 0)], (p) => uvSphereMesh(p.segments, p.rings, p.radius));
primitive('ico_sphere', 'Ico Sphere', '아이코 구', 'prim-ico', [int('subdivisions', 'Subdivisions', '세분화', 2, 1, 7), num('radius', 'Radius', '반지름', 1, 0)], (p) => icoSphereMesh(p.subdivisions, p.radius));
primitive('cylinder', 'Cylinder', '원기둥', 'prim-cylinder', [int('vertices', 'Vertices', '꼭짓점', 32, 3, 512), num('radius', 'Radius', '반지름', 1, 0), num('depth', 'Depth', '높이', 2, 0)], (p) => cylinderMesh(p.vertices, p.radius, p.depth));
primitive('cone', 'Cone', '원뿔', 'prim-cone', [int('vertices', 'Vertices', '꼭짓점', 32, 3, 512), num('radius', 'Radius', '반지름', 1, 0), num('depth', 'Depth', '높이', 2, 0)], (p) => coneMesh(p.vertices, p.radius, p.depth));
primitive('torus', 'Torus', '토러스', 'prim-torus', [int('major', 'Major Segments', '큰 세그먼트', 48, 3, 256), int('minor', 'Minor Segments', '작은 세그먼트', 12, 3, 256), num('majorRadius', 'Major Radius', '큰 반지름', 1, 0), num('minorRadius', 'Minor Radius', '작은 반지름', 0.25, 0)], (p) => torusMesh(p.major, p.minor, p.majorRadius, p.minorRadius));
primitive('grid', 'Grid', '격자', 'prim-grid', [int('x', 'X Subdivisions', 'X 세분화', 10, 1, 500), int('y', 'Y Subdivisions', 'Y 세분화', 10, 1, 500), num('size', 'Size', '크기', 2, 0)], (p) => gridMesh(p.x, p.y, p.size));

const addOther = (ctx, init, p) => {
  const obj = addObject(ctx.doc, { location: p?.location ?? [...ctx.doc.cursor], ...init });
  selectOnly(ctx.doc, obj);
  return obj;
};
const objectMode = (ctx) => inObject(ctx);

register({ id: 'object.light_add', en: 'Light', ko: '조명', icon: 'light', category: 'add', poll: objectMode, props: [choice('kind', 'Type', '종류', 'POINT', ['POINT', 'SUN', 'SPOT', 'AREA'])], exec: (ctx, p) => { addOther(ctx, { type: 'LIGHT', name: { POINT: 'Point', SUN: 'Sun', SPOT: 'Spot', AREA: 'Area' }[p.kind], data: defaultLight(p.kind) }); } });
register({ id: 'object.camera_add', en: 'Camera', ko: '카메라', icon: 'camera', category: 'add', poll: objectMode, exec: (ctx) => { const o = addOther(ctx, { type: 'CAMERA', name: 'Camera', data: defaultCamera() }); ctx.doc.activeCamera ??= o.id; } });
register({ id: 'object.empty_add', en: 'Empty', ko: '엠프티', icon: 'empty', category: 'add', poll: objectMode, props: [choice('display', 'Display', '표시', 'PLAIN_AXES', ['PLAIN_AXES', 'ARROWS', 'CUBE', 'SPHERE', 'CIRCLE']), num('size', 'Size', '크기', 1, 0)], exec: (ctx, p) => { addOther(ctx, { type: 'EMPTY', name: 'Empty', data: { display: p.display, size: p.size } }); } });
register({ id: 'object.armature_add', en: 'Armature', ko: '아마추어', icon: 'armature', category: 'add', poll: objectMode, exec: (ctx) => { addOther(ctx, { type: 'ARMATURE', name: 'Armature', data: createArmature() }); } });
register({
  id: 'object.curve_add', en: 'Curve', ko: '커브', icon: 'curve', category: 'add', poll: objectMode, props: [choice('kind', 'Type', '종류', 'BEZIER', ['BEZIER', 'CIRCLE', 'PATH'])],
  exec: (ctx, p) => {
    const splines = p.kind === 'CIRCLE' ? [{ kind: 'BEZIER', cyclic: true, points: [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]] }]
      : p.kind === 'PATH' ? [{ kind: 'POLY', cyclic: false, points: [[-2, 0, 0], [-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]] }]
        : [{ kind: 'BEZIER', cyclic: false, points: [[-1, 0, 0], [-0.3, 0.6, 0], [0.3, -0.6, 0], [1, 0, 0]] }];
    addOther(ctx, { type: 'CURVE', name: 'Curve', data: { splines, bevelDepth: 0, resolution: 12 } });
  },
});
register({ id: 'object.text_add', en: 'Text', ko: '텍스트', icon: 'text', category: 'add', poll: objectMode, props: [{ name: 'body', en: 'Text', ko: '내용', type: 'string', def: 'Text' }, num('size', 'Size', '크기', 1, 0), num('extrude', 'Extrude', '두께', 0, 0)], exec: (ctx, p) => { addOther(ctx, { type: 'TEXT', name: 'Text', data: { body: p.body, size: p.size, extrude: p.extrude, align: 'LEFT' } }); } });
register({ id: 'object.metaball_add', en: 'Metaball', ko: '메타볼', icon: 'meta', category: 'add', poll: objectMode, exec: (ctx) => { addOther(ctx, { type: 'META', name: 'Metaball', data: { elements: [{ co: [0, 0, 0], radius: 1, stiffness: 2 }], threshold: 0.6, resolution: 0.15 } }); } });
register({
  id: 'object.lattice_add', en: 'Lattice', ko: '래티스', icon: 'lattice', category: 'add', poll: objectMode,
  exec: (ctx) => {
    const rest = [];
    for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) rest.push([i - 0.5, j - 0.5, k - 0.5]);
    addOther(ctx, { type: 'LATTICE', name: 'Lattice', data: { res: [2, 2, 2], rest, points: rest.map((v) => [...v]) } });
  },
});
register({ id: 'object.gpencil_add', en: 'Grease Pencil', ko: '그리스 펜슬', icon: 'gpencil', category: 'add', poll: objectMode, exec: (ctx) => { addOther(ctx, { type: 'GPENCIL', name: 'GPencil', data: { layers: [{ name: 'Lines', hide: false, color: [0, 0, 0], strokes: [] }], activeLayer: 0 } }); } });
register({ id: 'object.forcefield_add', en: 'Force Field', ko: '역장', icon: 'field', category: 'add', poll: objectMode, props: [choice('kind', 'Type', '종류', 'WIND', ['WIND', 'FORCE', 'VORTEX', 'DRAG'])], exec: (ctx, p) => { addOther(ctx, { type: 'EMPTY', name: p.kind[0] + p.kind.slice(1).toLowerCase(), data: { display: 'ARROWS', size: 1 }, field: defaultField(p.kind) }); } });

// ─────────────── objects

register({ id: 'object.select_all', en: 'Select All', ko: '모두 선택', key: 'A', category: 'select', undo: false, poll: objectMode, props: [choice('action', 'Action', '동작', 'SELECT', ['SELECT', 'DESELECT', 'INVERT'])],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const ids = doc.objects.filter((o) => !o.hide && !o.hideSelect).map((o) => o.id);
    doc.selected = p.action === 'SELECT' ? ids : p.action === 'DESELECT' ? [] : ids.filter((id) => !doc.selected.includes(id));
  } });
register({ id: 'object.select_set', en: 'Select', ko: '선택', category: 'select', poll: objectMode, props: [{ name: 'id', type: 'string', def: '', hidden: true }, bool('extend', 'Extend', '추가')],
  exec: (ctx, p) => {
    const obj = getObject(ctx.doc, p.id);
    if (!obj) { if (!p.extend) ctx.doc.selected = []; return; }
    if (p.extend) toggleSelect(ctx.doc, obj); else selectOnly(ctx.doc, obj);
  } });
register({ id: 'object.delete', en: 'Delete', ko: '삭제', icon: 'delete', key: 'X', poll: hasSelected, exec: (ctx) => { for (const id of [...ctx.doc.selected]) removeObject(ctx.doc, id); } });
register({ id: 'object.duplicate', en: 'Duplicate Objects', ko: '오브젝트 복제', icon: 'duplicate', key: 'Shift+D', poll: hasSelected, props: [bool('linked', 'Linked', '데이터 공유')],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const copies = selectedObjects(doc).map((obj) => {
      const { id, name, ...rest } = obj;
      const clone = structuredClone(rest);
      if (p.linked) clone.data = obj.data;
      return addObject(doc, { ...clone, name });
    });
    doc.selected = copies.map((o) => o.id);
    doc.activeId = copies.at(-1)?.id ?? doc.activeId;
  } });
register({ id: 'object.join', en: 'Join', ko: '합치기', key: 'Ctrl+J', icon: 'join', poll: (ctx) => hasSelected(ctx) && isMeshActive(ctx) && selectedObjects(ctx.doc).filter((o) => o.type === 'MESH').length > 1,
  exec: (ctx) => {
    const doc = ctx.doc;
    const target = activeObject(doc);
    const inv = new Matrix4().copy(worldMatrix(doc, target)).invert();
    const p = new Vector3();
    const mesh = target.data;
    for (const obj of selectedObjects(doc)) {
      if (obj === target || obj.type !== 'MESH') continue;
      const m = new Matrix4().copy(inv).multiply(worldMatrix(doc, obj));
      const base = mesh.verts.length;
      for (const v of obj.data.verts) { p.set(v[0], v[1], v[2]).applyMatrix4(m); mesh.verts.push([p.x, p.y, p.z]); }
      obj.data.faces.forEach((face, f) => {
        mesh.faces.push(face.map((i) => i + base));
        if (mesh.uvs) mesh.uvs.push(obj.data.uvs?.[f] ?? null);
        if (mesh.faceMat) mesh.faceMat.push(0);
      });
      for (const [a, b] of obj.data.loose ?? []) (mesh.loose ??= []).push([a + base, b + base]);
      removeObject(doc, obj.id);
    }
    doc.selected = [target.id];
  } });
const setSmooth = (value) => (ctx) => { for (const o of selectedObjects(ctx.doc)) if (o.type === 'MESH') o.data.smooth = value; };
register({ id: 'object.shade_smooth', en: 'Shade Smooth', ko: '부드러운 셰이딩', icon: 'shade-smooth', poll: hasSelected, exec: setSmooth(true) });
register({ id: 'object.shade_flat', en: 'Shade Flat', ko: '평면 셰이딩', icon: 'shade-flat', poll: hasSelected, exec: setSmooth(false) });
register({ id: 'object.hide_set', en: 'Hide Selected', ko: '선택 숨기기', key: 'H', poll: hasSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) o.hide = true; ctx.doc.selected = []; } });
register({ id: 'object.hide_view_clear', en: 'Show Hidden', ko: '숨김 해제', key: 'Alt+H', poll: objectMode, exec: (ctx) => { const shown = ctx.doc.objects.filter((o) => o.hide); for (const o of shown) o.hide = false; ctx.doc.selected = shown.map((o) => o.id); } });
register({ id: 'object.mode_set', en: 'Set Mode', ko: '모드 전환', poll: hasActive, props: [choice('mode', 'Mode', '모드', 'OBJECT', ['OBJECT', 'EDIT', 'SCULPT', 'VERTEX_PAINT', 'WEIGHT_PAINT', 'TEXTURE_PAINT', 'POSE', 'PAINT_GPENCIL'])],
  exec: (ctx, p) => {
    const obj = activeObject(ctx.doc);
    const mesh = obj.type === 'MESH';
    const allowed = { OBJECT: true, EDIT: mesh || obj.type === 'ARMATURE' || obj.type === 'CURVE' || obj.type === 'SURFACE', SCULPT: mesh, VERTEX_PAINT: mesh, WEIGHT_PAINT: mesh, TEXTURE_PAINT: mesh, POSE: obj.type === 'ARMATURE', PAINT_GPENCIL: obj.type === 'GPENCIL' };
    if (!allowed[p.mode]) return 'CANCELLED';
    ctx.doc.mode = p.mode;
    if (p.mode !== 'OBJECT') ctx.doc.selected = [obj.id];
    return undefined;
  } });
register({ id: 'object.editmode_toggle', en: 'Toggle Edit Mode', ko: '편집 모드 전환', key: 'Tab', poll: (ctx) => { const o = activeObject(ctx.doc); return o && (o.type === 'MESH' || o.type === 'ARMATURE' || o.type === 'CURVE' || o.type === 'SURFACE'); },
  exec: (ctx) => { ctx.doc.mode = ctx.doc.mode === 'EDIT' ? 'OBJECT' : 'EDIT'; if (ctx.doc.mode === 'EDIT') ctx.doc.selected = [ctx.doc.activeId]; } });
register({ id: 'object.transform_apply', en: 'Apply Transform', ko: '트랜스폼 적용', key: 'Ctrl+A', poll: hasSelected, props: [bool('location', 'Location', '위치', true), bool('rotation', 'Rotation', '회전', true), bool('scale', 'Scale', '크기', true)],
  exec: (ctx, p) => {
    const q = new Vector3();
    for (const obj of selectedObjects(ctx.doc)) {
      if (obj.type !== 'MESH') continue;
      const keep = { location: p.location ? [0, 0, 0] : obj.location, rotation: p.rotation ? [0, 0, 0] : obj.rotation, scale: p.scale ? [1, 1, 1] : obj.scale };
      const before = new Matrix4().compose(new Vector3(...(p.location ? obj.location : [0, 0, 0])), rotationQuat(p.rotation ? obj.rotation : [0, 0, 0], obj.rotationMode), new Vector3(...(p.scale ? obj.scale : [1, 1, 1])));
      obj.data.verts = obj.data.verts.map((v) => { q.set(v[0], v[1], v[2]).applyMatrix4(before); return [q.x, q.y, q.z]; });
      Object.assign(obj, keep);
    }
  } });
register({ id: 'object.origin_set', en: 'Set Origin', ko: '원점 설정', poll: hasSelected, props: [choice('type', 'Type', '종류', 'ORIGIN_GEOMETRY', ['ORIGIN_GEOMETRY', 'ORIGIN_CURSOR', 'GEOMETRY_ORIGIN'])],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    for (const obj of selectedObjects(doc)) {
      if (obj.type !== 'MESH' || !obj.data.verts.length) continue;
      const m = worldMatrix(doc, obj);
      const inv = new Matrix4().copy(m).invert();
      const c = obj.data.verts.reduce((s, v) => v3.add(s, v3.mul(v, 1 / obj.data.verts.length)), [0, 0, 0]);
      const center = new Vector3(...c);
      if (p.type === 'GEOMETRY_ORIGIN') { obj.data.verts = obj.data.verts.map((v) => v3.sub(v, c)); continue; }
      const world = p.type === 'ORIGIN_CURSOR' ? new Vector3(...doc.cursor) : center.clone().applyMatrix4(m);
      const local = world.clone().applyMatrix4(inv);
      const shift = [local.x, local.y, local.z];
      obj.data.verts = obj.data.verts.map((v) => v3.sub(v, shift));
      if (obj.parent == null) obj.location = [world.x, world.y, world.z];
    }
  } });
register({ id: 'object.parent_set', en: 'Set Parent', ko: '부모 설정', key: 'Ctrl+P', poll: (ctx) => hasSelected(ctx) && hasActive(ctx) && ctx.doc.selected.length > 1, props: [choice('type', 'Type', '종류', 'OBJECT', ['OBJECT', 'ARMATURE_AUTO'])],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const parent = activeObject(doc);
    for (const o of selectedObjects(doc)) {
      if (o === parent) continue;
      o.parent = parent.id;
      // Keep where it is in the world.
      o.parentInverse = new Matrix4().copy(worldMatrix(doc, parent)).invert().toArray();
      if (p.type === 'ARMATURE_AUTO' && parent.type === 'ARMATURE' && o.type === 'MESH') {
        const toArm = new Matrix4().copy(worldMatrix(doc, parent)).invert().multiply(worldMatrix(doc, o));
        autoWeights(o.data, parent.data, toArm);
        if (!o.modifiers.some((m) => m.type === 'ARMATURE')) o.modifiers.push({ ...createModifier('ARMATURE'), object: parent.id });
      }
    }
  } });
register({ id: 'object.parent_clear', en: 'Clear Parent', ko: '부모 해제', key: 'Alt+P', poll: hasSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) { o.parent = null; delete o.parentInverse; } } });
register({ id: 'object.camera_set_active', en: 'Set Active Camera', ko: '활성 카메라 설정', icon: 'camera', poll: (ctx) => activeObject(ctx.doc)?.type === 'CAMERA', exec: (ctx) => { ctx.doc.activeCamera = ctx.doc.activeId; } });
register({ id: 'object.convert_mesh', en: 'Convert to Mesh', ko: '메시로 변환', poll: (ctx) => { const o = activeObject(ctx.doc); return hasSelected(ctx) && o && GEOMETRY_TYPES.has(o.type); },
  exec: (ctx) => {
    for (const obj of selectedObjects(ctx.doc)) {
      if (!GEOMETRY_TYPES.has(obj.type)) continue;
      const mesh = evaluatedMesh(ctx.doc, obj);
      if (!mesh) continue;
      obj.type = 'MESH';
      obj.data = mesh;
      obj.modifiers = [];
    }
  } });
register({ id: 'object.visual_transform_apply', en: 'Apply Visual Transform', ko: '보이는 트랜스폼 적용', poll: hasSelected,
  exec: (ctx) => {
    for (const obj of selectedObjects(ctx.doc)) {
      const pos = new Vector3(); const rot = new Quaternion(); const scl = new Vector3();
      worldMatrix(ctx.doc, obj).decompose(pos, rot, scl);
      obj.location = [pos.x, pos.y, pos.z];
      obj.rotation = rotationFromQuat(rot, obj.rotationMode);
      obj.scale = [scl.x, scl.y, scl.z];
      obj.constraints = [];
    }
  } });

// ─────────────── collections

register({ id: 'collection.create', en: 'New Collection', ko: '새 컬렉션', icon: 'collection', props: [{ name: 'name', en: 'Name', ko: '이름', type: 'string', def: 'Collection' }], exec: (ctx, p) => { const c = { id: newId('col'), name: p.name, parent: ctx.doc.activeCollection, hide: false, exclude: false }; ctx.doc.collections.push(c); ctx.doc.activeCollection = c.id; } });
register({ id: 'collection.move_objects', en: 'Move to Collection', ko: '컬렉션으로 이동', key: 'M', poll: hasSelected, props: [{ name: 'collection', type: 'string', def: 'col_root', hidden: true }], exec: (ctx, p) => { for (const o of selectedObjects(ctx.doc)) o.collection = p.collection; } });
register({ id: 'collection.delete', en: 'Delete Collection', ko: '컬렉션 삭제', poll: (ctx) => ctx.doc.activeCollection !== 'col_root',
  exec: (ctx) => {
    const doc = ctx.doc;
    const id = doc.activeCollection;
    const parent = doc.collections.find((c) => c.id === id)?.parent ?? 'col_root';
    for (const o of doc.objects) if (o.collection === id) o.collection = parent;
    for (const c of doc.collections) if (c.parent === id) c.parent = parent;
    doc.collections = doc.collections.filter((c) => c.id !== id);
    doc.activeCollection = parent;
  } });

// ─────────────── transforms

/** Applies a world-space change to the selection: objects in object mode, vertices in edit mode. */
function transformSelection(ctx, apply) {
  const doc = ctx.doc;
  if (doc.mode === 'EDIT' && isMeshActive(ctx)) {
    const obj = activeObject(doc);
    const m = worldMatrix(doc, obj);
    const inv = new Matrix4().copy(m).invert();
    const p = new Vector3();
    const prop = doc.proportional;
    const followers = prop?.enabled ? meshops.proportionalWeights(obj.data, prop) : [];
    const step = (i, weight) => {
      const v = obj.data.verts[i];
      p.set(v[0], v[1], v[2]).applyMatrix4(m);
      const out = apply([p.x, p.y, p.z], weight);
      p.set(out[0], out[1], out[2]).applyMatrix4(inv);
      obj.data.verts[i] = [p.x, p.y, p.z];
    };
    for (const [i, weight] of followers) step(i, weight);
    for (const i of obj.data.selV ?? []) step(i, 1);
    return;
  }
  for (const obj of selectedObjects(doc)) {
    if (obj.parent) continue;
    obj.location = apply([...obj.location], obj);
  }
}

/** The pivot in world space. */
export function selectionPivot(doc, mode = 'MEDIAN') {
  if (mode === 'CURSOR') return [...doc.cursor];
  const obj = activeObject(doc);
  if (doc.mode === 'EDIT' && obj?.type === 'MESH') {
    const c = selectionCenter(obj.data);
    const p = new Vector3(...c).applyMatrix4(worldMatrix(doc, obj));
    return [p.x, p.y, p.z];
  }
  const list = selectedObjects(doc);
  if (!list.length) return [...doc.cursor];
  const sum = list.reduce((s, o) => v3.add(s, worldPosition(doc, o)), [0, 0, 0]);
  return v3.mul(sum, 1 / list.length);
}

const AXIS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const transformPoll = (ctx) => ctx.doc.selected.length > 0 && (ctx.doc.mode === 'OBJECT' || ctx.doc.mode === 'EDIT');

register({ id: 'transform.translate', en: 'Move', ko: '이동', icon: 'tool-move', key: 'G', poll: transformPoll, props: [vec('value', 'Move', '이동')], exec: (ctx, p) => { transformSelection(ctx, (q, w) => v3.add(q, v3.mul(p.value, typeof w === 'number' ? w : 1))); } });
register({ id: 'transform.rotate', en: 'Rotate', ko: '회전', icon: 'tool-rotate', key: 'R', poll: transformPoll, props: [num('angle', 'Angle', '각도', 0, undefined, undefined, 5), choice('axis', 'Axis', '축', 'Z', ['X', 'Y', 'Z'])],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const pivot = selectionPivot(doc);
    const a = (p.angle * Math.PI) / 180;
    const k = AXIS[p.axis];
    const rotate = (q, w) => {
      const r = v3.sub(q, pivot);
      const turned = a * (typeof w === 'number' ? w : 1);
      const [cos, sin] = [Math.cos(turned), Math.sin(turned)];
      return v3.add(pivot, v3.add(v3.add(v3.mul(r, cos), v3.mul(v3.cross(k, r), sin)), v3.mul(k, v3.dot(k, r) * (1 - cos))));
    };
    transformSelection(ctx, rotate);
    if (doc.mode !== 'EDIT') {
      const turn = new Quaternion().setFromAxisAngle(new Vector3(...k), a);
      for (const obj of selectedObjects(doc)) obj.rotation = rotationFromQuat(turn.clone().multiply(rotationQuat(obj.rotation, obj.rotationMode)), obj.rotationMode);
    }
  } });
register({ id: 'transform.resize', en: 'Scale', ko: '크기 조절', icon: 'tool-scale', key: 'S', poll: transformPoll, props: [vec('value', 'Scale', '크기', [1, 1, 1], 0.05)],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const pivot = selectionPivot(doc);
    const scale = (q, w) => {
      const k = typeof w === 'number' ? w : 1;
      return [0, 1, 2].map((a) => pivot[a] + (q[a] - pivot[a]) * (1 + (p.value[a] - 1) * k));
    };
    transformSelection(ctx, scale);
    if (doc.mode !== 'EDIT') for (const obj of selectedObjects(doc)) obj.scale = obj.scale.map((s, k) => s * p.value[k]);
  } });
register({ id: 'transform.mirror', en: 'Mirror', ko: '미러', key: 'Ctrl+M', poll: transformPoll, props: [choice('axis', 'Axis', '축', 'X', ['X', 'Y', 'Z'])],
  exec: (ctx, p) => {
    const value = p.axis === 'X' ? [-1, 1, 1] : p.axis === 'Y' ? [1, -1, 1] : [1, 1, -1];
    const pivot = selectionPivot(ctx.doc);
    transformSelection(ctx, (q) => [pivot[0] + (q[0] - pivot[0]) * value[0], pivot[1] + (q[1] - pivot[1]) * value[1], pivot[2] + (q[2] - pivot[2]) * value[2]]);
    if (ctx.doc.mode === 'EDIT') meshops.flipNormals(activeMesh(ctx));
    else for (const obj of selectedObjects(ctx.doc)) obj.scale = obj.scale.map((s, k) => s * value[k]);
  } });
register({ id: 'object.location_clear', en: 'Clear Location', ko: '위치 지우기', key: 'Alt+G', poll: hasSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) o.location = [0, 0, 0]; } });
register({ id: 'object.rotation_clear', en: 'Clear Rotation', ko: '회전 지우기', key: 'Alt+R', poll: hasSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) o.rotation = [0, 0, 0]; } });
register({ id: 'object.scale_clear', en: 'Clear Scale', ko: '크기 지우기', key: 'Alt+S', poll: hasSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) o.scale = [1, 1, 1]; } });
register({ id: 'view3d.snap_cursor_to_center', en: 'Cursor to World Origin', ko: '커서를 월드 원점으로', exec: (ctx) => { ctx.doc.cursor = [0, 0, 0]; } });
register({ id: 'view3d.snap_cursor_to_selected', en: 'Cursor to Selected', ko: '커서를 선택으로', poll: (ctx) => ctx.doc.selected.length > 0, exec: (ctx) => { ctx.doc.cursor = selectionPivot(ctx.doc); } });
register({ id: 'view3d.snap_selected_to_cursor', en: 'Selection to Cursor', ko: '선택을 커서로', poll: hasSelected, exec: (ctx) => { const c = ctx.doc.cursor; for (const o of selectedObjects(ctx.doc)) o.location = [...c]; } });

// ─────────────── edit mesh

// The mesh functions return the mesh for chaining; only 'CANCELLED' means anything to run().
register({ id: 'view3d.toggle_snap', en: 'Toggle Snapping', ko: '스냅 켜기·끄기', icon: 'snap', key: 'Shift+Tab', undo: false, exec: (ctx) => { ctx.doc.snap = { ...defaultSnap(), ...ctx.doc.snap }; ctx.doc.snap.enabled = !ctx.doc.snap.enabled; } });
register({ id: 'view3d.snap_target', en: 'Snap To', ko: '스냅 대상', icon: 'snap', undo: false, props: [choice('target', 'Target', '대상', 'INCREMENT', ['INCREMENT', 'VERTEX', 'EDGE', 'FACE', 'CENTER'])], exec: (ctx, p) => { ctx.doc.snap = { ...defaultSnap(), ...ctx.doc.snap, target: p.target, enabled: true }; } });
const meshOp = (id, en, ko, props, fn, extra = {}) => register({ id, en, ko, props, poll: inEdit, exec: (ctx, p) => (fn(activeMesh(ctx), p, ctx) === 'CANCELLED' ? 'CANCELLED' : undefined), ...extra });

meshOp('mesh.select_mode', 'Select Mode', '선택 모드', [choice('type', 'Type', '종류', 'VERT', ['VERT', 'EDGE', 'FACE'])], (m, p) => {
  m.selMode = p.type.toLowerCase();
  if (m.selMode === 'face') setFaceSelection(m, selectedFaces({ ...m, selMode: 'vert' }));
}, { undo: false });
meshOp('mesh.select_all', 'Select All', '모두 선택', [choice('action', 'Action', '동작', 'SELECT', ['SELECT', 'DESELECT', 'INVERT'])], (m, p) => {
  if (p.action === 'SELECT') selectAll(m); else if (p.action === 'DESELECT') selectNone(m); else meshops.selectInvert(m);
}, { key: 'A', undo: false, category: 'select' });
meshOp('mesh.select_linked', 'Select Linked', '연결 선택', [], meshops.selectLinked, { key: 'Ctrl+L', undo: false, category: 'select' });
meshOp('mesh.select_more', 'Select More', '더 선택', [], meshops.selectMore, { key: 'Ctrl+Num+', undo: false, category: 'select' });
meshOp('mesh.select_less', 'Select Less', '덜 선택', [], meshops.selectLess, { key: 'Ctrl+Num-', undo: false, category: 'select' });
meshOp('mesh.select_random', 'Select Random', '임의 선택', [num('ratio', 'Ratio', '비율', 0.5, 0, 1, 0.05), int('seed', 'Seed', '시드', 1, 0, 100000)], (m, p) => { meshops.selectRandom(m, p.ratio, p.seed); }, { undo: false, category: 'select' });
meshOp('mesh.select_non_manifold', 'Select Non Manifold', '비다양체 선택', [], meshops.selectNonManifold, { undo: false, category: 'select' });
meshOp('mesh.extrude_region', 'Extrude Region', '영역 돌출', [num('offset', 'Offset', '거리', 1)], (m, p) => { meshops.extrudeRegion(m, p.offset); }, { key: 'E', icon: 'tool-extrude' });
meshOp('mesh.extrude_individual', 'Extrude Individual', '개별 돌출', [num('offset', 'Offset', '거리', 1)], (m, p) => { meshops.extrudeIndividual(m, p.offset); }, { icon: 'tool-extrude' });
meshOp('mesh.inset', 'Inset Faces', '면 인셋', [num('thickness', 'Thickness', '두께', 0.1, 0, undefined, 0.01), num('depth', 'Depth', '깊이', 0, undefined, undefined, 0.01), { name: 'individual', en: 'Individual', ko: '개별', type: 'bool', default: false }], (m, p) => { if (p.individual || !meshtools.regionHasOutline(m)) meshops.insetFaces(m, p.thickness, p.depth); else meshtools.insetRegion(m, p.thickness, p.depth); }, { key: 'I', icon: 'tool-inset' });
meshOp('mesh.bevel', 'Bevel', '베벨', [num('width', 'Width', '폭', 0.1, 0, undefined, 0.01), int('segments', 'Segments', '세그먼트', 1, 1, 64), num('profile', 'Profile', '프로파일', 0.5, 0, 1, 0.05), choice('affect', 'Affect', '대상', 'EDGES', ['EDGES', 'VERTICES'])], (m, p) => { if (p.affect === 'VERTICES') meshtools.bevelVerts(m, p.width); else meshops.bevelEdges(m, p.width, { segments: p.segments, profile: p.profile }); }, { key: 'Ctrl+B', icon: 'tool-bevel' });
meshOp('mesh.loopcut', 'Loop Cut', '루프 컷', [int('a', 'Edge A', '엣지 A', -1, -1), int('b', 'Edge B', '엣지 B', -1, -1), int('cuts', 'Number of Cuts', '컷 수', 1, 1, 100), num('slide', 'Slide', '슬라이드', 0, -1, 1, 0.05)], (m, p) => {
  let [a, b] = [p.a, p.b];
  if (a < 0 || b < 0) {
    const quad = m.faces.find((f) => f.length === 4);
    if (!quad) return 'CANCELLED';
    [a, b] = [quad[0], quad[1]];
  }
  meshops.loopCut(m, a, b, p.cuts, p.slide);
  return undefined;
}, { key: 'Ctrl+R', icon: 'tool-loopcut' });
meshOp('mesh.bisect', 'Bisect', '이등분', [vec('point', 'Plane Point', '평면 위치'), vec('normal', 'Plane Normal', '평면 노멀', [0, 0, 1]), choice('clear', 'Clear', '지우기', 'NONE', ['NONE', 'INNER', 'OUTER']), bool('fill', 'Fill', '채우기')], (m, p) => { meshops.bisect(m, p.point, p.normal, { clear: p.clear === 'NONE' ? null : p.clear, fill: p.fill }); }, { icon: 'tool-knife' });
meshOp('mesh.subdivide', 'Subdivide', '세분화', [int('cuts', 'Number of Cuts', '컷 수', 1, 1, 6)], (m, p) => { meshops.subdivideFaces(m, p.cuts); });
meshOp('mesh.delete', 'Delete', '삭제', [choice('type', 'Type', '종류', 'VERT', ['VERT', 'EDGE', 'FACE', 'ONLY_FACE'])], (m, p) => { meshops.deleteSelection(m, p.type); }, { key: 'X', icon: 'delete' });
meshOp('mesh.dissolve_verts', 'Dissolve Vertices', '꼭짓점 용해', [], meshops.dissolveVerts);
meshOp('mesh.dissolve_edges', 'Dissolve Edges', '엣지 용해', [], meshops.dissolveEdges);
meshOp('mesh.dissolve_faces', 'Dissolve Faces', '면 용해', [], meshops.dissolveFaces);
meshOp('mesh.merge', 'Merge', '병합', [choice('type', 'Type', '종류', 'CENTER', ['CENTER', 'CURSOR', 'FIRST', 'LAST'])], (m, p, ctx) => { meshops.mergeVerts(m, p.type, ctx.doc.cursor); }, { key: 'M' });
meshOp('mesh.remove_doubles', 'Merge by Distance', '거리로 병합', [num('threshold', 'Distance', '거리', 0.0001, 0, undefined, 0.001)], (m, p) => { meshops.mergeByDistance(m, p.threshold, false); });
meshOp('mesh.edge_face_add', 'Make Edge/Face', '엣지/면 만들기', [], meshops.makeEdgeFace, { key: 'F' });
meshOp('mesh.bridge_edge_loops', 'Bridge Edge Loops', '엣지 루프 연결', [], (m) => (meshops.bridgeLoops(m) ? undefined : 'CANCELLED'));
meshOp('mesh.flip_normals', 'Flip Normals', '노멀 뒤집기', [], meshops.flipNormals);
meshOp('mesh.normals_make_consistent', 'Recalculate Normals', '노멀 다시 계산', [bool('inside', 'Inside', '안쪽')], (m, p) => { meshops.recalcNormals(m, p.inside); }, { key: 'Shift+N' });
meshOp('mesh.shrink_fatten', 'Shrink/Fatten', '축소/팽창', [num('value', 'Offset', '거리', 0.1, undefined, undefined, 0.01)], (m, p) => { meshops.shrinkFatten(m, p.value); }, { key: 'Alt+S' });
meshOp('mesh.vertices_smooth', 'Smooth Vertices', '꼭짓점 스무스', [num('factor', 'Factor', '강도', 0.5, 0, 1, 0.05), int('repeat', 'Repeat', '반복', 1, 1, 100)], (m, p) => { meshops.smoothVerts(m, p.factor, p.repeat); });
meshOp('mesh.vertices_randomize', 'Randomize', '무작위 이동', [num('amount', 'Amount', '양', 0.1, 0, undefined, 0.01), int('seed', 'Seed', '시드', 1, 0, 100000)], (m, p) => { meshops.randomizeVerts(m, p.amount, p.seed); });
meshOp('mesh.to_sphere', 'To Sphere', '구로 변형', [num('factor', 'Factor', '강도', 1, 0, 1, 0.05)], (m, p) => { meshops.toSphere(m, p.factor); });
meshOp('mesh.poke', 'Poke Faces', '면 찌르기', [num('offset', 'Offset', '거리', 0, undefined, undefined, 0.01)], (m, p) => { meshops.pokeFaces(m, p.offset); });
meshOp('mesh.triangulate', 'Triangulate Faces', '면 삼각분할', [], meshops.triangulateFaces, { key: 'Ctrl+T' });
meshOp('mesh.tris_to_quads', 'Tris to Quads', '삼각형을 사각형으로', [num('angle', 'Max Angle', '최대 각도', 40, 0, 180, 5)], (m, p) => { meshops.trisToQuads(m, p.angle); }, { key: 'Alt+J' });
meshOp('mesh.duplicate', 'Duplicate', '복제', [], meshops.duplicateSelection, { key: 'Shift+D', icon: 'duplicate' });
meshOp('mesh.spin', 'Spin', '회전 돌출', [num('angle', 'Angle', '각도', 360, undefined, undefined, 5), int('steps', 'Steps', '단계', 12, 1, 256), vec('center', 'Center', '중심'), vec('axis', 'Axis', '축', [0, 0, 1])], (m, p) => { meshops.spin(m, p.angle, p.steps, p.center, p.axis); }, { icon: 'tool-spin' });
meshOp('mesh.shade_smooth', 'Shade Smooth', '부드러운 셰이딩', [], (m) => { m.smooth = true; });
meshOp('mesh.shade_flat', 'Shade Flat', '평면 셰이딩', [], (m) => { m.smooth = false; });
register({ id: 'mesh.separate', en: 'Separate Selection', ko: '선택 분리', key: 'P', poll: inEdit,
  exec: (ctx) => {
    const doc = ctx.doc;
    const source = activeObject(doc);
    const mesh = source.data;
    const faces = selectedFaces(mesh);
    if (!faces.length) return 'CANCELLED';
    const copy = cloneMesh(mesh);
    const set = new Set(faces);
    copy.selMode = 'face';
    copy.selF = mesh.faces.map((_, f) => f).filter((f) => !set.has(f));
    meshops.deleteSelection(copy, 'FACE');
    const m2 = mesh;
    m2.selMode = 'face';
    m2.selF = faces;
    meshops.deleteSelection(m2, 'FACE');
    const { id, name, ...rest } = source;
    addObject(doc, { ...structuredClone({ ...rest, data: null }), data: copy, name });
    return undefined;
  } });

meshOp('mesh.mark_seam', 'Mark Seam', '심 표시', [bool('clear', 'Clear', '지우기')], (m, p) => (meshops.markSelectedEdges(m, 'seam', p.clear ? null : true) ? undefined : 'CANCELLED'));
meshOp('mesh.mark_sharp', 'Mark Sharp', '샤프 표시', [bool('clear', 'Clear', '지우기')], (m, p) => (meshops.markSelectedEdges(m, 'sharp', p.clear ? null : true) ? undefined : 'CANCELLED'));
meshOp('mesh.mark_sharp_angle', 'Sharp by Angle', '각도로 샤프 표시', [num('angle', 'Angle', '각도', 30, 0, 180, 5)], (m, p) => { meshops.markSharpByAngle(m, p.angle); });
meshOp('mesh.crease', 'Edge Crease', '엣지 크리즈', [num('value', 'Crease', '크리즈', 1, 0, 1, 0.1)], (m, p) => (meshops.markSelectedEdges(m, 'crease', p.value || null) ? undefined : 'CANCELLED'), { key: 'Shift+E' });
meshOp('mesh.rip', 'Rip', '찢기', [], (m) => (meshops.ripSelection(m) ? undefined : 'CANCELLED'), { key: 'V' });
meshOp('mesh.edge_slide', 'Edge Slide', '엣지 슬라이드', [num('factor', 'Factor', '비율', 0.5, -1, 1, 0.05)], (m, p) => (meshops.edgeSlide(m, p.factor) ? undefined : 'CANCELLED'));
meshOp('mesh.normals_custom_set', 'Set Custom Normals', '사용자 노멀 설정', [], meshops.setCustomNormalsFromShading);
meshOp('mesh.normals_point_cursor', 'Point Normals to Cursor', '노멀을 커서로', [bool('invert', 'Away', '반대로')], (m, p, ctx) => {
  const inv = new Matrix4().copy(worldMatrix(ctx.doc, activeObject(ctx.doc))).invert();
  const c = new Vector3(...ctx.doc.cursor).applyMatrix4(inv);
  if (!m.selV?.length) return 'CANCELLED';
  meshops.pointNormalsAt(m, [c.x, c.y, c.z], p.invert);
  return undefined;
});
meshOp('mesh.normals_custom_clear', 'Clear Custom Normals', '사용자 노멀 지우기', [], meshops.clearCustomNormals);
meshOp('mesh.skin_radius', 'Skin Radius', '스킨 반지름', [num('radius', 'Radius', '반지름', 0.25, 0.001, undefined, 0.01)], (m, p) => {
  if (!m.selV?.length) return 'CANCELLED';
  m.skin ??= {};
  for (const i of m.selV) m.skin[i] = p.radius;
  return undefined;
});
register({ id: 'wm.proportional_set', en: 'Proportional Editing', ko: '비례 편집', icon: 'proportional', key: 'O', undo: false, props: [bool('enabled', 'Enabled', '사용', true), num('size', 'Size', '크기', 1, 0.001, undefined, 0.1), choice('falloff', 'Falloff', '감쇠', 'SMOOTH', meshops.PROPORTIONAL_FALLOFFS), bool('connected', 'Connected Only', '연결된 것만')],
  exec: (ctx, p) => { ctx.doc.proportional = { enabled: p.enabled, size: p.size, falloff: p.falloff, connected: p.connected }; } });

// ─────────────── UV

register({ id: 'uv.unwrap', en: 'Unwrap', ko: '펼치기', key: 'U', icon: 'ed-uv', poll: isMeshActive, props: [num('margin', 'Margin', '간격', 0.01, 0, 0.2, 0.005)],
  exec: (ctx, p) => {
    const m = activeMesh(ctx);
    if (!m.faces.length) return 'CANCELLED';
    const chosen = ctx.doc.mode === 'EDIT' ? selectedFaces(m) : [];
    ctx.lastUnwrap = unwrapSeams(m, { faces: chosen.length ? chosen : null, margin: p.margin });
    return undefined;
  } });
const uvOp = (id, en, ko, props, fn) => register({ id, en, ko, props, poll: isMeshActive, exec: (ctx, p) => fn(activeMesh(ctx), p) });
uvOp('uv.smart_project', 'Smart UV Project', '스마트 UV 투영', [num('margin', 'Island Margin', '간격', 0.01, 0, 0.2, 0.005)], (m, p) => { unwrapSmart(m, p.margin); });
uvOp('uv.cube_project', 'Cube Projection', '큐브 투영', [num('scale', 'Scale', '크기', 0.5, 0, undefined, 0.05)], (m, p) => { unwrapBox(m, p.scale); });
uvOp('uv.cylinder_project', 'Cylinder Projection', '원기둥 투영', [], (m) => { unwrapCylinder(m); });
uvOp('uv.sphere_project', 'Sphere Projection', '구 투영', [], (m) => { unwrapSphere(m); });
uvOp('uv.reset', 'Reset UVs', 'UV 초기화', [], (m) => { m.uvs = m.faces.map((f) => (f.length === 4 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : f.map((_, i) => { const a = (i / f.length) * Math.PI * 2; return [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2]; }))); });

// ─────────────── images and texture paint

const makeImage = (ctx, name, width, height, color) => {
  const buffer = createImageBuffer(width, height, color);
  const dataUrl = ctx.encodeImage?.(buffer) ?? encodePNGDataUrl(buffer);
  const image = { id: newId('img'), name, dataUrl, width, height };
  ctx.doc.images.push(image);
  if (ctx.images) ctx.images[image.id] = { src: dataUrl, ...buffer, version: 0 };
  return image;
};
register({ id: 'image.new', en: 'New Image', ko: '새 이미지', icon: 'new', props: [{ name: 'name', en: 'Name', ko: '이름', type: 'string', def: 'Untitled' }, int('width', 'Width', '폭', 1024, 1, 8192), int('height', 'Height', '높이', 1024, 1, 8192), vec('color', 'Color', '색', [0, 0, 0], 0.05), num('alpha', 'Alpha', '알파', 1, 0, 1, 0.05)],
  exec: (ctx, p) => { makeImage(ctx, p.name, p.width, p.height, [...p.color, p.alpha]); } });
register({ id: 'paint.add_texture', en: 'Add Paint Texture', ko: '칠할 텍스처 추가', icon: 'tool-brush', poll: isMeshActive, props: [int('size', 'Size', '크기', 1024, 8, 8192), vec('color', 'Color', '색', [0.8, 0.8, 0.8], 0.05)],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const obj = activeObject(doc);
    // Faces sharing UV space would all show the same paint.
    if (!obj.data.uvs?.every(Boolean) || uvOverlap(obj.data) > 0.02) unwrapSeams(obj.data);
    let mat = getMaterial(doc, obj.materials.find(Boolean));
    if (!mat) {
      mat = defaultMaterial(`Material.${String(doc.materials.length).padStart(3, '0')}`);
      doc.materials.push(mat);
      if (obj.materials.length) obj.materials[0] = mat.id; else obj.materials.push(mat.id);
    }
    mat.useNodes = true;
    mat.nodes ??= defaultShaderGraph(mat);
    const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    if (!bsdf) return 'CANCELLED';
    const image = makeImage(ctx, `${obj.name} Base Color`, p.size, p.size, [...p.color, 1]);
    const node = createNode('TEX_IMAGE', bsdf.x - 280, bsdf.y, { image: image.id });
    mat.nodes.nodes.push(node);
    addLink(mat.nodes, node.id, 'Color', bsdf.id, 'Base Color');
    return undefined;
  } });

// ─────────────── sculpt helpers

const multiresOf = (obj) => obj?.modifiers?.find((m) => m.type === 'MULTIRES') ?? null;
register({ id: 'object.multires_subdivide', en: 'Subdivide (Multiresolution)', ko: '세분화 (멀티레졸루션)', poll: (ctx) => Boolean(multiresOf(activeObject(ctx.doc))),
  exec: (ctx) => {
    const obj = activeObject(ctx.doc);
    const mod = multiresOf(obj);
    if ((mod.total ?? 0) >= 6) return 'CANCELLED';
    multiresAddLevel(obj.data, mod, catmullClark);
    return undefined;
  } });
register({ id: 'object.voxel_remesh', en: 'Voxel Remesh', ko: '복셀 리메시', key: 'Ctrl+R', poll: isMeshActive, props: [num('voxelSize', 'Voxel Size', '복셀 크기', 0.1, 0.005, undefined, 0.01)],
  exec: (ctx, p) => {
    const obj = activeObject(ctx.doc);
    if (!obj.data.faces.length) return 'CANCELLED';
    obj.data = voxelRemesh(obj.data, { voxel: p.voxelSize, smooth: true });
    return undefined;
  } });

// ─────────────── modifiers and constraints

const modPoll = (ctx) => { const o = activeObject(ctx.doc); return o && GEOMETRY_TYPES.has(o.type) && ctx.doc.mode === 'OBJECT'; };

register({ id: 'object.modifier_add', en: 'Add Modifier', ko: '모디파이어 추가', icon: 'modifier', poll: modPoll, props: [choice('type', 'Type', '종류', 'SUBSURF', Object.keys(MODIFIERS))],
  exec: (ctx, p) => {
    const mod = createModifier(p.type);
    if (p.type === 'NODES') mod.graph = defaultGeometryGraph();
    activeObject(ctx.doc).modifiers.push(mod);
  } });
register({ id: 'object.modifier_remove', en: 'Remove Modifier', ko: '모디파이어 제거', poll: modPoll, props: [int('index', 'Index', '순서', 0, 0)], exec: (ctx, p) => { activeObject(ctx.doc).modifiers.splice(p.index, 1); } });
register({ id: 'object.modifier_move', en: 'Move Modifier', ko: '모디파이어 이동', poll: modPoll, props: [int('index', 'Index', '순서', 0, 0), int('to', 'To', '대상', 0, 0)],
  exec: (ctx, p) => {
    const list = activeObject(ctx.doc).modifiers;
    if (p.to < 0 || p.to >= list.length) return 'CANCELLED';
    const [m] = list.splice(p.index, 1);
    list.splice(p.to, 0, m);
    return undefined;
  } });
register({ id: 'object.modifier_apply', en: 'Apply Modifier', ko: '모디파이어 적용', poll: (ctx) => modPoll(ctx) && isMeshActive(ctx), props: [int('index', 'Index', '순서', 0, 0)],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const obj = activeObject(doc);
    const upTo = obj.modifiers.slice(0, p.index + 1);
    const rest = obj.modifiers.slice(p.index + 1);
    obj.modifiers = upTo;
    const out = evaluatedMesh(doc, obj);
    obj.data = out;
    obj.modifiers = rest;
    void evaluateMesh;
  } });
register({ id: 'object.constraint_add', en: 'Add Constraint', ko: '컨스트레인트 추가', poll: hasActive, props: [choice('type', 'Type', '종류', 'COPY_LOCATION', Object.keys(CONSTRAINTS))], exec: (ctx, p) => { activeObject(ctx.doc).constraints.push(createConstraint(p.type)); } });
register({ id: 'object.constraint_remove', en: 'Remove Constraint', ko: '컨스트레인트 제거', poll: hasActive, props: [int('index', 'Index', '순서', 0, 0)], exec: (ctx, p) => { activeObject(ctx.doc).constraints.splice(p.index, 1); } });

// ─────────────── materials, world, nodes

const matPoll = (ctx) => { const o = activeObject(ctx.doc); return o && GEOMETRY_TYPES.has(o.type); };
register({ id: 'material.new', en: 'New Material', ko: '새 재질', icon: 'material', poll: matPoll, exec: (ctx) => { const m = defaultMaterial(`Material.${String(ctx.doc.materials.length).padStart(3, '0')}`); ctx.doc.materials.push(m); const o = activeObject(ctx.doc); if (o.materials.length) o.materials[ctx.activeSlot ?? 0] = m.id; else o.materials.push(m.id); } });
register({ id: 'object.material_slot_add', en: 'Add Material Slot', ko: '재질 슬롯 추가', poll: matPoll, exec: (ctx) => { activeObject(ctx.doc).materials.push(null); } });
register({ id: 'object.material_slot_remove', en: 'Remove Material Slot', ko: '재질 슬롯 제거', poll: matPoll, props: [int('index', 'Index', '순서', 0, 0)], exec: (ctx, p) => { activeObject(ctx.doc).materials.splice(p.index, 1); } });
register({ id: 'object.material_slot_assign', en: 'Assign to Selection', ko: '선택에 지정', poll: inEdit, props: [int('slot', 'Slot', '슬롯', 0, 0)],
  exec: (ctx, p) => {
    const m = activeMesh(ctx);
    m.faceMat ??= m.faces.map(() => 0);
    for (const f of selectedFaces(m)) m.faceMat[f] = p.slot;
  } });
register({ id: 'material.use_nodes', en: 'Use Nodes', ko: '노드 사용', poll: (ctx) => { const o = activeObject(ctx.doc); return o && o.materials.some(Boolean); },
  exec: (ctx) => {
    const id = activeObject(ctx.doc).materials.find(Boolean);
    const mat = getMaterial(ctx.doc, id);
    mat.useNodes = true;
    mat.nodes ??= defaultShaderGraph(mat);
  } });
register({ id: 'world.use_nodes', en: 'Use World Nodes', ko: '월드 노드 사용', exec: (ctx) => { const w = ctx.doc.world; w.useNodes = true; w.nodes ??= defaultWorldGraph(w.color, w.strength); } });
register({ id: 'compositor.use_nodes', en: 'Use Compositor Nodes', ko: '컴포지터 노드 사용', exec: (ctx) => { ctx.doc.compositorEnabled = true; ctx.doc.compositor ??= defaultCompositorGraph(); } });

// ─────────────── animation

const TRANSFORM_PATHS = { Location: ['location.0', 'location.1', 'location.2'], Rotation: ['rotation.0', 'rotation.1', 'rotation.2'], Scale: ['scale.0', 'scale.1', 'scale.2'] };
TRANSFORM_PATHS.LocRotScale = [...TRANSFORM_PATHS.Location, ...TRANSFORM_PATHS.Rotation, ...TRANSFORM_PATHS.Scale];

register({ id: 'anim.keyframe_insert', en: 'Insert Keyframe', ko: '키프레임 삽입', key: 'I', icon: 'keyframe', poll: hasSelected, props: [choice('type', 'Channels', '채널', 'LocRotScale', Object.keys(TRANSFORM_PATHS)), choice('interp', 'Interpolation', '보간', 'BEZIER', anim.INTERPOLATIONS)],
  exec: (ctx, p) => {
    for (const obj of selectedObjects(ctx.doc)) for (const path of TRANSFORM_PATHS[p.type]) anim.insertKey(obj, path, ctx.doc.frame, anim.getPath(obj, path), p.interp);
  } });
register({ id: 'anim.keyframe_insert_path', en: 'Insert Keyframe on Property', ko: '속성에 키프레임 삽입', poll: hasActive, props: [{ name: 'path', en: 'Path', ko: '경로', type: 'string', def: 'location.0' }],
  exec: (ctx, p) => { const obj = activeObject(ctx.doc); if (typeof anim.getPath(obj, p.path) !== 'number') return 'CANCELLED'; anim.insertKey(obj, p.path, ctx.doc.frame); return undefined; } });
register({ id: 'anim.keyframe_delete', en: 'Delete Keyframes', ko: '키프레임 삭제', key: 'Alt+I', poll: hasSelected,
  exec: (ctx) => {
    let n = 0;
    for (const obj of selectedObjects(ctx.doc)) for (const path of Object.keys(obj.anim?.fcurves ?? {})) if (anim.deleteKey(obj, path, ctx.doc.frame)) n++;
    return n ? undefined : 'CANCELLED';
  } });
register({ id: 'anim.keyframe_clear', en: 'Clear Keyframes', ko: '키프레임 모두 지우기', poll: hasSelected, exec: (ctx) => { for (const obj of selectedObjects(ctx.doc)) if (obj.anim) obj.anim.fcurves = {}; } });
register({ id: 'anim.interpolation_set', en: 'Set Interpolation', ko: '보간 설정', key: 'T', poll: hasSelected, props: [choice('type', 'Type', '종류', 'LINEAR', anim.INTERPOLATIONS), choice('easing', 'Easing', '가감속', 'IN', ['IN', 'OUT', 'IN_OUT'])],
  exec: (ctx, p) => {
    // The selected keys, or all of them when none is selected.
    const objects = selectedObjects(ctx.doc);
    const onlySelected = objects.some((o) => anim.hasSelectedKeys(o));
    for (const obj of objects) for (const keys of Object.values(obj.anim?.fcurves ?? {})) for (const k of keys) if (!onlySelected || k.sel) { k.interp = p.type; k.easing = p.easing; }
  } });
const hasKeysSelected = (ctx) => selectedObjects(ctx.doc).some((o) => anim.hasSelectedKeys(o));
register({ id: 'action.delete_selected', en: 'Delete Selected Keys', ko: '선택 키 삭제', poll: hasKeysSelected, exec: (ctx) => { for (const o of selectedObjects(ctx.doc)) anim.deleteSelectedKeys(o); setFrame(ctx.doc, ctx.doc.frame); } });
register({ id: 'action.duplicate', en: 'Duplicate Selected Keys', ko: '선택 키 복제', poll: hasKeysSelected, props: [int('offset', 'Offset', '이동', 10)], exec: (ctx, p) => { for (const o of selectedObjects(ctx.doc)) anim.duplicateSelectedKeys(o, p.offset); setFrame(ctx.doc, ctx.doc.frame); } });
register({ id: 'graph.handle_type', en: 'Set Handle Type', ko: '핸들 종류', key: 'V', poll: hasKeysSelected, props: [choice('type', 'Type', '종류', 'AUTO', anim.HANDLE_TYPES)], exec: (ctx, p) => { for (const o of selectedObjects(ctx.doc)) for (const keys of Object.values(o.anim?.fcurves ?? {})) anim.setHandleType(keys, p.type); setFrame(ctx.doc, ctx.doc.frame); } });
const curvePoll = (ctx) => Object.keys(activeObject(ctx.doc)?.anim?.fcurves ?? {}).length > 0;
register({ id: 'graph.modifier_add', en: 'Add F-Curve Modifier', ko: 'F-커브 모디파이어 추가', poll: curvePoll, props: [{ name: 'path', en: 'Path', ko: '경로', type: 'string', def: 'location.0' }, choice('type', 'Type', '종류', 'CYCLES', Object.keys(anim.FCURVE_MODIFIERS))],
  exec: (ctx, p) => { const a = activeObject(ctx.doc).anim; if (!a.fcurves[p.path]) return 'CANCELLED'; ((a.modifiers ??= {})[p.path] ??= []).push(anim.defaultFModifier(p.type)); setFrame(ctx.doc, ctx.doc.frame); return undefined; } });
register({ id: 'graph.modifier_remove', en: 'Remove F-Curve Modifier', ko: 'F-커브 모디파이어 제거', poll: curvePoll, props: [{ name: 'path', en: 'Path', ko: '경로', type: 'string', def: 'location.0' }, int('index', 'Index', '순서', 0, 0)],
  exec: (ctx, p) => { const list = activeObject(ctx.doc).anim.modifiers?.[p.path]; if (!list?.[p.index]) return 'CANCELLED'; list.splice(p.index, 1); setFrame(ctx.doc, ctx.doc.frame); return undefined; } });
register({ id: 'graph.extrapolation_set', en: 'Set Extrapolation', ko: '외삽 설정', poll: curvePoll, props: [{ name: 'path', en: 'Path', ko: '경로', type: 'string', def: 'location.0' }, choice('type', 'Type', '종류', 'LINEAR', ['CONSTANT', 'LINEAR'])],
  exec: (ctx, p) => { const a = activeObject(ctx.doc).anim; (a.extrapolation ??= {})[p.path] = p.type; setFrame(ctx.doc, ctx.doc.frame); } });
const nlaPoll = (ctx) => (activeObject(ctx.doc)?.anim?.nla?.length ?? 0) > 0;
register({ id: 'nla.transition_add', en: 'Add Transition', ko: '전환 추가', poll: nlaPoll, props: [int('index', 'Strip', '스트립', 0, 0)], exec: (ctx, p) => { if (!anim.addTransition(activeObject(ctx.doc), p.index)) return 'CANCELLED'; setFrame(ctx.doc, ctx.doc.frame); return undefined; } });
register({ id: 'nla.split', en: 'Split Strip', ko: '스트립 나누기', poll: nlaPoll, props: [int('index', 'Strip', '스트립', 0, 0)], exec: (ctx, p) => { if (!anim.splitStrip(activeObject(ctx.doc), p.index, ctx.doc.frame)) return 'CANCELLED'; setFrame(ctx.doc, ctx.doc.frame); return undefined; } });
register({ id: 'nla.delete', en: 'Delete Strip', ko: '스트립 삭제', poll: nlaPoll, props: [int('index', 'Strip', '스트립', 0, 0)], exec: (ctx, p) => { activeObject(ctx.doc).anim.nla.splice(p.index, 1); setFrame(ctx.doc, ctx.doc.frame); } });
register({ id: 'nla.strip_sync', en: 'Update Strip Length', ko: '스트립 길이 갱신', undo: false, poll: nlaPoll, props: [int('index', 'Strip', '스트립', 0, 0)], exec: (ctx, p) => { const s = activeObject(ctx.doc).anim.nla[p.index]; if (s) anim.syncStripEnd(s); } });
register({ id: 'screen.frame_set', en: 'Set Frame', ko: '프레임 설정', undo: false, props: [int('frame', 'Frame', '프레임', 1)], exec: (ctx, p) => { setFrame(ctx.doc, p.frame); } });
register({ id: 'screen.frame_offset', en: 'Step Frame', ko: '프레임 이동', undo: false, props: [int('delta', 'Delta', '이동', 1)], exec: (ctx, p) => { setFrame(ctx.doc, ctx.doc.frame + p.delta); } });
register({ id: 'screen.frame_jump', en: 'Jump to End', ko: '끝으로 이동', undo: false, props: [bool('end', 'End', '끝')], exec: (ctx, p) => { setFrame(ctx.doc, p.end ? ctx.doc.frameEnd : ctx.doc.frameStart); } });
register({ id: 'marker.add', en: 'Add Marker', ko: '마커 추가', key: 'M', exec: (ctx) => { ctx.doc.markers.push({ frame: ctx.doc.frame, name: `F_${String(ctx.doc.frame).padStart(2, '0')}` }); ctx.doc.markers.sort((a, b) => a.frame - b.frame); } });
register({ id: 'nla.push_down', en: 'Push Down Action', ko: '액션 내려놓기', poll: (ctx) => Object.keys(activeObject(ctx.doc)?.anim?.fcurves ?? {}).length > 0, exec: (ctx) => { anim.pushDownAction(activeObject(ctx.doc), `Action${(activeObject(ctx.doc).anim.nla?.length ?? 0) + 1}`); } });
register({ id: 'object.driver_add', en: 'Add Driver', ko: '드라이버 추가', poll: hasActive, props: [{ name: 'path', en: 'Path', ko: '경로', type: 'string', def: 'location.2' }, { name: 'expression', en: 'Expression', ko: '식', type: 'string', def: 'sin(frame / 10)' }], exec: (ctx, p) => { (activeObject(ctx.doc).drivers ??= []).push({ path: p.path, expression: p.expression, variables: [] }); } });
register({ id: 'object.shape_key_add', en: 'Add Shape Key', ko: '셰이프 키 추가', poll: isMeshActive, exec: (ctx) => { const m = activeMesh(ctx); (m.shapeKeys ??= []).push({ name: `Key ${m.shapeKeys.length + 1}`, value: 0, verts: m.verts.map((v) => [...v]) }); } });
register({ id: 'object.vertex_group_add', en: 'Add Vertex Group', ko: '꼭짓점 그룹 추가', poll: isMeshActive, exec: (ctx) => { const m = activeMesh(ctx); (m.vgroups ??= []).push({ name: `Group${m.vgroups.length ? `.${String(m.vgroups.length).padStart(3, '0')}` : ''}`, w: {} }); } });
register({ id: 'object.vertex_group_assign', en: 'Assign to Vertex Group', ko: '꼭짓점 그룹에 지정', poll: inEdit, props: [int('group', 'Group', '그룹', 0, 0), num('weight', 'Weight', '가중치', 1, 0, 1, 0.05)],
  exec: (ctx, p) => { const m = activeMesh(ctx); const g = m.vgroups?.[p.group]; if (!g) return 'CANCELLED'; for (const i of m.selV ?? []) g.w[i] = p.weight; return undefined; } });

// ─────────────── armatures

const armPoll = (ctx) => activeObject(ctx.doc)?.type === 'ARMATURE';
register({ id: 'armature.bone_add', en: 'Add Bone', ko: '본 추가', key: 'E', poll: armPoll, props: [bool('connected', 'Extrude from Last', '마지막 본에서 돌출', true)],
  exec: (ctx, p) => {
    const arm = activeObject(ctx.doc).data;
    const last = arm.bones.length - 1;
    const base = p.connected && last >= 0 ? arm.bones[last] : null;
    const head = base ? [...base.tail] : [0, 0, 0];
    const dir = base ? v3.sub(base.tail, base.head) : [0, 0, 1];
    arm.bones.push(createBone(`Bone.${String(arm.bones.length).padStart(3, '0')}`, head, v3.add(head, dir), base ? last : null));
  } });
register({ id: 'pose.ik_solve', en: 'Solve IK', ko: 'IK 풀기', poll: armPoll, props: [int('bone', 'Bone', '본', 0, 0), vec('target', 'Target', '목표', [0, 0, 1]), int('chain', 'Chain Length', '체인 길이', 2, 1, 32)],
  exec: (ctx, p) => { solveIK(activeObject(ctx.doc).data, p.bone, p.target, p.chain); } });
const boneProps = [int('bone', 'Bone', '본', 0, 0)];
register({ id: 'pose.ik_add', en: 'Add IK to Bone', ko: '본에 IK 추가', poll: armPoll, props: [...boneProps, { name: 'target', en: 'Target', ko: '목표', type: 'string', def: '' }, int('chain', 'Chain Length', '체인 길이', 2, 1, 32)],
  exec: (ctx, p) => { const b = activeObject(ctx.doc).data.bones[p.bone]; if (!b) return 'CANCELLED'; b.ik = { target: p.target || null, pole: null, chain: p.chain, poleAngle: 0, influence: 1, iterations: 24 }; return undefined; } });
register({ id: 'pose.ik_clear', en: 'Remove IK', ko: 'IK 제거', poll: armPoll, props: boneProps, exec: (ctx, p) => { const b = activeObject(ctx.doc).data.bones[p.bone]; if (b) b.ik = null; } });
register({ id: 'pose.paths_calculate', en: 'Calculate Bone Path', ko: '본 경로 계산', icon: 'curve', poll: armPoll, props: [...boneProps, int('start', 'Start', '시작', 1), int('end', 'End', '끝', 250), int('step', 'Step', '간격', 1, 1)],
  exec: (ctx, p) => { const o = activeObject(ctx.doc); const b = o.data.bones[p.bone]; if (!b) return 'CANCELLED'; b.motionPath = calculateMotionPath(ctx.doc, o, { start: p.start, end: Math.max(p.start, p.end), step: p.step, bone: p.bone }); return undefined; } });
register({ id: 'pose.paths_clear', en: 'Clear Bone Paths', ko: '본 경로 지우기', poll: armPoll, exec: (ctx) => { for (const b of activeObject(ctx.doc).data.bones) b.motionPath = null; } });
register({ id: 'pose.transforms_clear', en: 'Clear Pose', ko: '포즈 지우기', poll: armPoll, exec: (ctx) => { for (const b of activeObject(ctx.doc).data.bones) b.pose = { location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }; } });

// ─────────────── physics

const addTo = (key, make) => (ctx) => { const o = activeObject(ctx.doc); o[key] = o[key] ? null : make(); };
register({ id: 'rigidbody.object_add', en: 'Rigid Body', ko: '강체', icon: 'physics', poll: isMeshActive, props: [choice('type', 'Type', '종류', 'ACTIVE', ['ACTIVE', 'PASSIVE'])], exec: (ctx, p) => { activeObject(ctx.doc).rigidBody = defaultRigidBody(p.type); } });
register({ id: 'rigidbody.object_remove', en: 'Remove Rigid Body', ko: '강체 제거', poll: (ctx) => Boolean(activeObject(ctx.doc)?.rigidBody), exec: (ctx) => { activeObject(ctx.doc).rigidBody = null; } });
register({ id: 'object.cloth_toggle', en: 'Cloth', ko: '천', poll: isMeshActive, exec: addTo('cloth', defaultCloth) });
register({ id: 'object.softbody_toggle', en: 'Soft Body', ko: '소프트 바디', poll: isMeshActive, exec: addTo('softBody', defaultSoftBody) });
register({ id: 'object.collision_toggle', en: 'Collision', ko: '충돌', poll: isMeshActive, exec: addTo('collision', () => ({ friction: 0.5 })) });
register({ id: 'object.particle_system_add', en: 'Add Particle System', ko: '파티클 시스템 추가', poll: isMeshActive, props: [choice('kind', 'Type', '종류', 'EMITTER', ['EMITTER', 'HAIR'])], exec: (ctx, p) => { const s = defaultParticles(); s.kind = p.kind; (activeObject(ctx.doc).particles ??= []).push(s); } });
register({ id: 'object.particle_system_remove', en: 'Remove Particle System', ko: '파티클 시스템 제거', poll: (ctx) => (activeObject(ctx.doc)?.particles?.length ?? 0) > 0, props: [int('index', 'Index', '순서', 0, 0)], exec: (ctx, p) => { activeObject(ctx.doc).particles.splice(p.index, 1); } });
register({ id: 'ptcache.bake_all', en: 'Bake All Simulations', ko: '모든 시뮬레이션 베이크', icon: 'physics', props: [],
  exec: (ctx) => {
    const doc = ctx.doc;
    const frame = doc.frame;
    setFrame(doc, doc.frameStart);
    bakeRigidBodies(doc);
    for (const o of doc.objects) {
      if (o.cloth) bakeCloth(doc, o);
      else if (o.softBody) bakeSoftBody(doc, o);
    }
    for (const o of doc.objects) {
      if (o.smoke) bakeSmoke(doc, o);
      if (o.fluid) bakeLiquid(doc, o);
      if (o.dynamicPaint?.role === 'CANVAS') bakeDynamicPaint(doc, o);
    }
    setFrame(doc, frame);
  } });
register({ id: 'ptcache.free_all', en: 'Free All Bakes', ko: '모든 베이크 지우기', exec: (ctx) => { clearCaches(ctx.doc); clearSimCache(); } });
const toggleOn = (key, make) => (ctx) => { const o = activeObject(ctx.doc); o[key] = o[key] ? null : make(); clearSimCache(o.id); };
register({ id: 'object.smoke_domain_toggle', en: 'Smoke Domain', ko: '연기 도메인', poll: isMeshActive, exec: toggleOn('smoke', defaultSmokeDomain) });
register({ id: 'object.smoke_flow_toggle', en: 'Smoke Flow', ko: '연기 흐름', poll: isMeshActive, exec: toggleOn('smokeFlow', defaultSmokeFlow) });
register({ id: 'object.fluid_domain_toggle', en: 'Liquid Domain', ko: '액체 도메인', poll: isMeshActive, exec: toggleOn('fluid', defaultLiquidDomain) });
register({ id: 'object.fluid_flow_toggle', en: 'Liquid Flow', ko: '액체 흐름', poll: isMeshActive, exec: toggleOn('fluidFlow', defaultLiquidFlow) });
register({ id: 'object.dynamicpaint_toggle', en: 'Dynamic Paint', ko: '다이나믹 페인트', poll: isMeshActive, props: [choice('role', 'Role', '역할', 'CANVAS', ['CANVAS', 'BRUSH'])], exec: (ctx, p) => { const o = activeObject(ctx.doc); o.dynamicPaint = o.dynamicPaint?.role === p.role ? null : defaultDynamicPaint(p.role); clearSimCache(o.id); } });
register({ id: 'object.mesh_from_data', en: 'Mesh from Data', ko: '데이터로 메시 만들기', category: 'add', poll: objectMode, props: [{ name: 'name', en: 'Name', ko: '이름', type: 'string', def: 'Mesh', hidden: true }, { name: 'verts', type: 'vec3list', def: [], hidden: true }, { name: 'faces', type: 'list', def: [], hidden: true }, { name: 'smooth', type: 'bool', def: false, hidden: true }],
  exec: (ctx, p) => {
    if (!p.verts.length) return 'CANCELLED';
    const mesh = createMesh(p.verts.map((v) => [...v]), p.faces.map((f) => [...f]));
    mesh.smooth = p.smooth;
    const obj = addObject(ctx.doc, { type: 'MESH', name: p.name, data: mesh, location: [...ctx.doc.cursor] });
    selectOnly(ctx.doc, obj);
    return undefined;
  } });
register({ id: 'object.volume_add', en: 'Volume', ko: '볼륨', icon: 'empty', category: 'add', poll: objectMode, props: [choice('kind', 'Shape', '모양', 'NOISE', ['CONSTANT', 'SPHERE', 'NOISE'])], exec: (ctx, p) => { addOther(ctx, { type: 'VOLUME', name: 'Volume', data: { kind: p.kind, density: 6, res: 32, scale: 4, threshold: 0.45, colour: [0.85, 0.85, 0.85], emission: [0, 0, 0], emissionStrength: 1 } }); } });
register({ id: 'mesh.primitive_nurbs_surface_add', en: 'NURBS Surface', ko: 'NURBS 서피스', icon: 'curve', category: 'add', poll: objectMode, props: [choice('kind', 'Shape', '모양', 'PATCH', ['PATCH', 'CYLINDER', 'SPHERE', 'TORUS'])], exec: (ctx, p) => { addOther(ctx, { type: 'SURFACE', name: 'Surface', data: nurbsPrimitive(p.kind) }); } });

// ─────────────── grease pencil

const gpPoll = (ctx) => activeObject(ctx.doc)?.type === 'GPENCIL';
register({ id: 'gpencil.layer_add', en: 'Add Layer', ko: '레이어 추가', poll: gpPoll, exec: (ctx) => { const d = activeObject(ctx.doc).data; d.layers.push({ name: `Layer ${d.layers.length + 1}`, hide: false, color: [0, 0, 0], strokes: [] }); d.activeLayer = d.layers.length - 1; } });
register({ id: 'gpencil.stroke_add', en: 'Add Stroke', ko: '스트로크 추가', poll: gpPoll, props: [{ name: 'points', type: 'vec3list', def: [], hidden: true }, num('width', 'Width', '두께', 2, 0.1)],
  exec: (ctx, p) => { const d = activeObject(ctx.doc).data; if (p.points.length < 2) return 'CANCELLED'; d.layers[d.activeLayer].strokes.push({ points: p.points, width: p.width, frame: ctx.doc.frame }); return undefined; } });
register({ id: 'gpencil.clear', en: 'Clear Layer', ko: '레이어 지우기', poll: gpPoll, exec: (ctx) => { const d = activeObject(ctx.doc).data; d.layers[d.activeLayer].strokes = []; } });

// ─────────────── scenes

register({ id: 'scene.new', en: 'New Scene', ko: '새 장면', icon: 'new', props: [choice('type', 'Type', '종류', 'EMPTY', ['EMPTY', 'COPY'])], exec: (ctx, p) => { newScene(ctx.doc, { copy: p.type === 'COPY' }); } });
register({ id: 'scene.delete', en: 'Delete Scene', ko: '장면 삭제', icon: 'delete', poll: (ctx) => (ctx.doc.scenes?.length ?? 1) > 1, exec: (ctx) => (removeScene(ctx.doc) ? undefined : 'CANCELLED') });
register({ id: 'scene.set', en: 'Switch Scene', ko: '장면 전환', props: [{ name: 'id', type: 'string', def: '', hidden: true }], exec: (ctx, p) => (switchScene(ctx.doc, p.id) ? undefined : 'CANCELLED') });
register({ id: 'scene.rename', en: 'Rename Scene', ko: '장면 이름 바꾸기', props: [{ name: 'name', en: 'Name', ko: '이름', type: 'string', def: 'Scene' }], exec: (ctx, p) => { ctx.doc.scenes.find((s) => s.id === ctx.doc.activeScene).name = p.name; } });

// ─────────────── instancing

register({ id: 'object.collection_instance_add', en: 'Collection Instance', ko: '컬렉션 인스턴스', icon: 'collection', category: 'add', poll: objectMode, props: [{ name: 'collection', type: 'string', def: '', hidden: true }],
  exec: (ctx, p) => {
    const col = ctx.doc.collections.find((c) => c.id === p.collection);
    if (!col) return 'CANCELLED';
    addOther(ctx, { type: 'EMPTY', name: col.name, data: { display: 'PLAIN_AXES', size: 0.5, instanceCollection: col.id } });
    return undefined;
  } });
register({ id: 'object.instancer_set', en: 'Instancing', ko: '인스턴싱', poll: isMeshActive, props: [choice('mode', 'Mode', '방식', 'VERTS', ['NONE', 'VERTS', 'FACES']), bool('scaleByArea', 'Scale by Face Area', '면 넓이로 크기 조절')],
  exec: (ctx, p) => { activeObject(ctx.doc).instancing = { mode: p.mode, scaleByArea: p.scaleByArea }; } });
register({ id: 'object.instances_make_real', en: 'Make Instances Real', ko: '인스턴스를 실제 오브젝트로', poll: (ctx) => { const o = activeObject(ctx.doc); return Boolean(o && (o.data?.instanceCollection || (o.instancing && o.instancing.mode !== 'NONE'))); },
  exec: (ctx) => (makeInstancesReal(ctx.doc, activeObject(ctx.doc), addObject).length ? undefined : 'CANCELLED') });

// ─────────────── motion paths

register({ id: 'object.paths_calculate', en: 'Calculate Motion Path', ko: '모션 경로 계산', icon: 'curve', poll: hasActive, props: [int('start', 'Start', '시작', 1), int('end', 'End', '끝', 250), int('step', 'Step', '간격', 1, 1, 100)],
  exec: (ctx, p) => { activeObject(ctx.doc).motionPath = calculateMotionPath(ctx.doc, activeObject(ctx.doc), { start: p.start, end: Math.max(p.start, p.end), step: p.step }); } });
register({ id: 'object.paths_clear', en: 'Clear Motion Path', ko: '모션 경로 지우기', poll: (ctx) => Boolean(activeObject(ctx.doc)?.motionPath), exec: (ctx) => { const o = activeObject(ctx.doc); o.motionPath = null; o.onion = null; } });
register({ id: 'object.onion_set', en: 'Onion Skin', ko: '어니언 스킨', poll: (ctx) => Boolean(activeObject(ctx.doc)?.motionPath), props: [bool('enabled', 'Enabled', '사용', true), int('before', 'Before', '이전', 2, 0, 10), int('after', 'After', '이후', 2, 0, 10), int('every', 'Every', '간격', 5, 1, 100)],
  exec: (ctx, p) => { activeObject(ctx.doc).onion = p.enabled ? { before: p.before, after: p.after, every: p.every } : null; } });

// ─────────────── assets

register({ id: 'asset.mark', en: 'Mark as Asset', ko: '애셋으로 표시', poll: hasActive, props: [{ name: 'catalog', en: 'Catalog', ko: '카탈로그', type: 'string', def: 'File' }], exec: (ctx, p) => { activeObject(ctx.doc).asset = { catalog: p.catalog }; } });
register({ id: 'asset.clear', en: 'Clear Asset', ko: '애셋 표시 해제', poll: (ctx) => Boolean(activeObject(ctx.doc)?.asset), exec: (ctx) => { activeObject(ctx.doc).asset = null; } });

// ─────────────── movie clips: from tracks to the scene

register({ id: 'clip.solve', en: 'Solve Camera', ko: '카메라 풀기', icon: 'camera', poll: (ctx) => (ctx.doc.clips ?? []).some((c) => c.tracks?.length >= 4), props: [{ name: 'clip', type: 'string', def: '', hidden: true }],
  exec: (ctx, p) => {
    const doc = ctx.doc;
    const clip = doc.clips.find((c) => c.id === p.clip) ?? doc.clips.find((c) => c.tracks?.length >= 4);
    const solve = solveCamera(clip.tracks);
    clip.solve = { error: solve.error, frames: solve.frames };
    // Pixels become scene units: the points fit a box of about 4.
    const reach = Math.max(1e-6, ...solve.points.flat().map(Math.abs));
    const unit = 2 / reach;
    const start = clip.start ?? 1;
    let collection = doc.collections.find((c) => c.name === 'Tracking');
    if (!collection) { collection = { id: newId('col'), name: 'Tracking', parent: 'col_root', hide: false, exclude: false }; doc.collections.push(collection); }
    for (const o of doc.objects.filter((x) => x.collection === collection.id)) removeObject(doc, o.id);
    solve.points.forEach((point, i) => addObject(doc, { type: 'EMPTY', name: clip.tracks[i].name, collection: collection.id, location: point.map((x) => x * unit), data: { display: 'PLAIN_AXES', size: 0.1 } }));
    const camera = addObject(doc, { type: 'CAMERA', name: `${clip.name} Camera`, collection: collection.id, data: { ...defaultCamera(), kind: 'ORTHO', orthoScale: (clip.width / (solve.scales[0] || 1)) * unit } });
    const quaternion = new Quaternion();
    solve.frames.forEach((f, i) => {
      quaternion.fromArray(solve.rotations[i]);
      const rotation = rotationFromQuat(quaternion, 'XYZ');
      const back = new Vector3(0, 0, 8).applyQuaternion(quaternion);
      const frame = f + start;
      for (let k = 0; k < 3; k++) {
        anim.insertKey(camera, `location.${k}`, frame, back.getComponent(k), 'LINEAR');
        anim.insertKey(camera, `rotation.${k}`, frame, rotation[k], 'LINEAR');
      }
    });
    doc.activeCamera = camera.id;
    setFrame(doc, doc.frame);
    ctx.lastSolve = solve;
    return undefined;
  } });

// ─────────────── helpers exported for the UI

export function frameBounds(doc, onlySelected) {
  const list = onlySelected ? selectedObjects(doc) : doc.objects.filter((o) => !o.hide);
  return list.length ? worldBounds(doc, list) : null;
}

export { compact, createMesh };
