// Collada (.dae) as a scene: hierarchy, meshes with UVs, diffuse materials, cameras, lights, armatures with skins, and animation,
// in both directions. formats.js keeps the plain list of world-space meshes the simple paths use.
// Blender's ways are followed where Collada leaves room: time is frame / fps, a light's colour carries its power (and Blender's own
// <extra> says both apart), and a skin's bind shape follows its node. Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { insertKey } from './anim.js';
import { bonePoseMatrices, createBone, restBoneMatrix } from './armature.js';
import { GEOMETRY_TYPES, addObject, defaultCamera, defaultLight, defaultMaterial, evaluatedArmature, evaluatedMesh, getMaterial, isVisible, localMatrix, setFrame, worldMatrix } from './doc.js';
import { daeGeometry, parseXML } from './formats.js';

const DEG = Math.PI / 180;
const find = (node, name) => node?.children.find((c) => c.name === name) ?? null;
const all = (node, name) => node?.children.filter((c) => c.name === name) ?? [];
const numbers = (text) => (text?.trim() ? text.trim().split(/\s+/).map(Number) : []);
const words = (text) => (text?.trim() ? text.trim().split(/\s+/) : []);
const deep = (node, name) => { if (!node) return null; if (node.name === name) return node; for (const c of node.children) { const r = deep(c, name); if (r) return r; } return null; };
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Collada writes matrices row by row; three keeps them column by column. */
const fromRows = (n, at = 0) => new Matrix4().set(...n.slice(at, at + 16));
const rows = (m) => { const e = m.elements; return [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => e[c * 4 + r])); };
const number = (x) => (Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(9));

// ─────────────── reading

/** The transform elements of a node, at a time: animated values replace the ones written. */
function nodeMatrix(node, animatedAt) {
  const m = new Matrix4();
  for (const c of node.children) {
    if (!['matrix', 'translate', 'scale', 'rotate'].includes(c.name)) continue;
    const n = animatedAt?.(c) ?? numbers(c.text);
    if (c.name === 'matrix') m.multiply(fromRows(n));
    else if (c.name === 'translate') m.multiply(new Matrix4().makeTranslation(n[0], n[1], n[2]));
    else if (c.name === 'scale') m.multiply(new Matrix4().makeScale(n[0], n[1], n[2]));
    else m.multiply(new Matrix4().makeRotationAxis(new Vector3(n[0], n[1], n[2]).normalize(), n[3] * DEG));
  }
  return m;
}

/** A sampler's value at a time, by its interpolation (linear, or held for STEP). */
function sample(sampler, time) {
  const { times, values, width, step } = sampler;
  const at = (i) => values.slice(i * width, i * width + width);
  if (time <= times[0]) return at(0);
  if (time >= times.at(-1)) return at(times.length - 1);
  let i = 0;
  while (i + 1 < times.length - 1 && times[i + 1] <= time) i++;
  if (step) return at(i);
  const k = (time - times[i]) / (times[i + 1] - times[i]);
  const [a, b] = [at(i), at(i + 1)];
  return a.map((x, n) => x + (b[n] - x) * k);
}

/** A Collada file into the document: returns the objects made. */
export function importDAEScene(doc, text) {
  const root = find(parseXML(text), 'COLLADA');
  if (!root) throw new Error('Not a Collada file');
  const asset = find(root, 'asset');
  const up = find(asset, 'up_axis')?.text.trim() ?? 'Y_UP';
  const meter = Number(find(asset, 'unit')?.attrs.meter ?? 1);
  const R = new Matrix4().makeScale(meter, meter, meter);
  if (up === 'Y_UP') R.premultiply(new Matrix4().makeRotationX(Math.PI / 2));
  else if (up === 'X_UP') R.premultiply(new Matrix4().makeRotationY(-Math.PI / 2));
  const library = (lib, item) => new Map(all(find(root, lib), item).map((x) => [x.attrs.id, x]));
  const geometries = library('library_geometries', 'geometry');
  const controllers = library('library_controllers', 'controller');
  const cameras = library('library_cameras', 'camera');
  const lights = library('library_lights', 'light');
  const effects = library('library_effects', 'effect');
  const materialsById = library('library_materials', 'material');
  const fps = doc.fps || 24;

  // Animation: every channel, by the node it moves and the element (and part of it) it sets.
  const channels = new Map(); // node id → Map(sid → [{ member, sampler }])
  const times = new Set();
  const visitAnimations = (holder) => {
    for (const animation of all(holder, 'animation')) {
      const sources = new Map(all(animation, 'source').map((s) => [s.attrs.id, s]));
      const samplers = new Map(all(animation, 'sampler').map((s) => [s.attrs.id, s]));
      for (const channel of all(animation, 'channel')) {
        const sampler = samplers.get(channel.attrs.source?.slice(1));
        const input = (semantic) => sources.get(all(sampler, 'input').find((x) => x.attrs.semantic === semantic)?.attrs.source?.slice(1));
        const [inp, out, interp] = [input('INPUT'), input('OUTPUT'), input('INTERPOLATION')];
        if (!inp || !out) continue;
        const keyTimes = numbers(find(inp, 'float_array')?.text);
        const values = numbers(find(out, 'float_array')?.text);
        const width = Number(deep(out, 'accessor')?.attrs.stride ?? Math.max(1, Math.round(values.length / Math.max(1, keyTimes.length))));
        const step = words(find(interp, 'Name_array')?.text).every((x) => x === 'STEP') && Boolean(interp);
        const match = /^([^/]+)\/([^.(]+)(.*)$/.exec(channel.attrs.target ?? '');
        if (!match) continue;
        const [, nodeId, sid, member] = match;
        if (!channels.has(nodeId)) channels.set(nodeId, new Map());
        if (!channels.get(nodeId).has(sid)) channels.get(nodeId).set(sid, []);
        channels.get(nodeId).get(sid).push({ member, sampler: { times: keyTimes, values, width, step } });
        for (const t of keyTimes) times.add(t);
      }
      visitAnimations(animation);
    }
  };
  visitAnimations(find(root, 'library_animations'));
  /** A node's own transform at a time (null: as written). */
  const localAt = (node, time) => nodeMatrix(node, time == null ? null : (element) => {
    const list = channels.get(node.attrs.id)?.get(element.attrs.sid);
    if (!list) return null;
    const value = numbers(element.text);
    const MEMBERS = { '.X': 0, '.Y': 1, '.Z': 2, '.ANGLE': 3, '(0)': 0, '(1)': 1, '(2)': 2, '(3)': 3 };
    for (const { member, sampler } of list) {
      const got = sample(sampler, time);
      if (!member) got.forEach((x, n) => { value[n] = x; });
      else if (member in MEMBERS) value[MEMBERS[member]] = got[0];
      else {
        // (row)(column) of a matrix.
        const cell = /^\((\d)\)\((\d)\)$/.exec(member);
        if (cell) value[Number(cell[1]) * 4 + Number(cell[2])] = got[0];
      }
    }
    return value;
  });

  const materialOf = new Map();
  const material = (instance) => {
    const bind = deep(instance, 'instance_material');
    const mat = bind && materialsById.get(bind.attrs.target?.slice(1));
    if (!mat) return null;
    if (materialOf.has(mat.attrs.id)) return materialOf.get(mat.attrs.id);
    const effect = effects.get(find(mat, 'instance_effect')?.attrs.url?.slice(1));
    const color = find(deep(effect, 'diffuse'), 'color');
    const made = { ...defaultMaterial(mat.attrs.name ?? mat.attrs.id), baseColor: color ? numbers(color.text).slice(0, 3) : [0.8, 0.8, 0.8] };
    const shine = find(deep(effect, 'shininess'), 'float');
    if (shine) made.roughness = Math.max(0, Math.min(1, 1 - Math.sqrt(Number(shine.text)) / 10));
    doc.materials.push(made);
    materialOf.set(mat.attrs.id, made.id);
    return made.id;
  };
  const readCamera = (node) => {
    const camera = defaultCamera();
    const optics = deep(node, 'technique_common');
    const persp = find(optics, 'perspective');
    const ortho = find(optics, 'orthographic');
    const holder = persp ?? ortho;
    const value = (name) => { const x = find(holder, name); return x ? Number(x.text) : null; };
    const aspect = value('aspect_ratio') ?? 16 / 9;
    if (persp) {
      // Only the field of view is told: Blender's 36 mm film, and the lens that makes that view.
      const xfov = value('xfov') ?? (value('yfov') != null ? (2 * Math.atan(Math.tan((value('yfov') * DEG) / 2) * aspect)) / DEG : null);
      if (xfov) camera.lens = camera.sensor / 2 / Math.tan((xfov * DEG) / 2);
    } else if (ortho) {
      camera.kind = 'ORTHO';
      const xmag = value('xmag') ?? (value('ymag') != null ? value('ymag') * aspect : null);
      if (xmag) camera.orthoScale = xmag * 2;
    }
    if (value('znear') != null) camera.clipStart = value('znear') * meter;
    if (value('zfar') != null) camera.clipEnd = value('zfar') * meter;
    return camera;
  };
  const readLight = (node) => {
    const common = find(node, 'technique_common');
    const kind = find(common, 'directional') ? 'SUN' : find(common, 'spot') ? 'SPOT' : 'POINT';
    const shape = find(common, 'directional') ?? find(common, 'spot') ?? find(common, 'point') ?? find(common, 'ambient');
    const light = defaultLight(kind);
    const color = numbers(find(shape, 'color')?.text);
    const blender = deep(find(node, 'extra'), 'technique');
    const extra = (name) => { const x = find(blender, name); return x ? Number(x.text) : null; };
    if (extra('energy') != null) {
      light.energy = extra('energy');
      light.color = [extra('red') ?? 1, extra('green') ?? 1, extra('blue') ?? 1];
      if (extra('type') === 4) { light.kind = 'AREA'; light.size = extra('area_size') ?? light.size; }
    } else if (color.length >= 3) {
      // The colour carries the power: split again into a colour no brighter than white and a power.
      const strongest = Math.max(...color.slice(0, 3), 1e-9);
      light.color = color.slice(0, 3).map((x) => x / Math.max(1, strongest));
      light.energy = Math.max(1, strongest);
    }
    if (kind === 'SPOT') {
      light.spotSize = extra('spotsize') ?? Number(find(shape, 'falloff_angle')?.text ?? light.spotSize);
      light.spotBlend = extra('spotblend') ?? Number(find(shape, 'falloff_exponent')?.text ?? light.spotBlend);
    }
    return light;
  };

  // The scene's nodes: what each is, its parent, and its world matrix at rest.
  const sceneRef = find(find(root, 'scene'), 'instance_visual_scene')?.attrs.url?.slice(1);
  const scenes = all(find(root, 'library_visual_scenes'), 'visual_scene');
  const scene = scenes.find((s) => s.attrs.id === sceneRef) ?? scenes[0];
  const nodes = [];
  const parentOf = new Map();
  const walk = (node, parent) => { nodes.push(node); parentOf.set(node, parent); for (const c of all(node, 'node')) walk(c, node); };
  for (const n of all(scene, 'node')) walk(n, null);
  const worldAt = (node, time = null) => { const p = parentOf.get(node); return (p ? worldAt(p, time) : R.clone()).multiply(localAt(node, time)); };
  const isJoint = (n) => n?.attrs.type === 'JOINT';
  const byId = new Map(nodes.map((n) => [n.attrs.id, n]));

  // Skins: which joints, their binding, and the weights.
  const skins = new Map(); // controller id → { mesh source, bindShape, joints: [node], inverse: [Matrix4], weights: [[ [joint, w] … ] per vertex] }
  for (const [id, controller] of controllers) {
    const skin = find(controller, 'skin');
    if (!skin) continue;
    const sources = new Map(all(skin, 'source').map((s) => [s.attrs.id, s]));
    const jointsInput = all(find(skin, 'joints'), 'input');
    const sourceOf = (semantic, inputs) => sources.get(inputs.find((x) => x.attrs.semantic === semantic)?.attrs.source?.slice(1));
    const names = words((find(sourceOf('JOINT', jointsInput), 'Name_array') ?? find(sourceOf('JOINT', jointsInput), 'IDREF_array'))?.text);
    const inverse = numbers(find(sourceOf('INV_BIND_MATRIX', jointsInput), 'float_array')?.text);
    const weightsTag = find(skin, 'vertex_weights');
    const weightInputs = all(weightsTag, 'input');
    const weightValues = numbers(find(sourceOf('WEIGHT', weightInputs), 'float_array')?.text);
    const [jOff, wOff] = ['JOINT', 'WEIGHT'].map((s) => Number(weightInputs.find((x) => x.attrs.semantic === s)?.attrs.offset ?? 0));
    const stride = Math.max(...weightInputs.map((x) => Number(x.attrs.offset ?? 0))) + 1;
    const vcount = numbers(find(weightsTag, 'vcount')?.text);
    const v = numbers(find(weightsTag, 'v')?.text);
    let at = 0;
    const weights = vcount.map((n) => { const list = []; for (let k = 0; k < n; k++, at++) list.push([v[at * stride + jOff], weightValues[v[at * stride + wOff]]]); return list; });
    skins.set(id, { source: skin.attrs.source?.slice(1), bindShape: fromRows(numbers(find(skin, 'bind_shape_matrix')?.text ?? '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1')), names, inverse: names.map((_, j) => fromRows(inverse, j * 16).invert()), weights });
  }
  // A skin's joint names are sids (Blender) or ids: found among the scene's joints either way.
  const jointNamed = (name, skeletonRoot) => {
    const candidates = nodes.filter((n) => isJoint(n) || n.attrs.sid === name);
    const under = (n) => { if (!skeletonRoot) return true; for (let p = n; p; p = parentOf.get(p)) if (p === skeletonRoot) return true; return false; };
    return candidates.find((n) => n.attrs.sid === name && under(n)) ?? byId.get(name) ?? candidates.find((n) => n.attrs.name === name) ?? null;
  };

  // Skeletons: the top joint of each chain of joints, and where each joint was bound.
  const bindWorld = new Map();
  for (const n of nodes) {
    for (const inst of all(n, 'instance_controller')) {
      const skin = skins.get(inst.attrs.url?.slice(1));
      if (!skin) continue;
      const skeleton = byId.get(find(inst, 'skeleton')?.text.trim().slice(1));
      skin.joints = skin.names.map((name) => jointNamed(name, skeleton));
      skin.joints.forEach((joint, j) => { if (joint && !bindWorld.has(joint)) bindWorld.set(joint, R.clone().multiply(skin.inverse[j])); });
    }
  }
  const restOf = (joint) => bindWorld.get(joint) ?? worldAt(joint);
  const created = [];
  const armatures = new Map(); // top joint → { arm, joints }
  const topJoint = (n) => { let at = n; while (isJoint(parentOf.get(at))) at = parentOf.get(at); return at; };
  const armatureFor = (top) => {
    if (armatures.has(top)) return armatures.get(top);
    const joints = [];
    const visit = (n) => { joints.push(n); for (const c of all(n, 'node')) if (isJoint(c)) visit(c); };
    visit(top);
    const holder = parentOf.get(top);
    const holderWorld = holder ? worldAt(holder) : R.clone();
    const position = (n) => new Vector3().setFromMatrixPosition(restOf(n));
    const bones = joints.map((n) => {
      const head = position(n);
      const tipTag = deep(find(n, 'extra'), 'technique');
      const tip = ['tip_x', 'tip_y', 'tip_z'].map((k) => find(tipTag, k)).every(Boolean) ? new Vector3(...['tip_x', 'tip_y', 'tip_z'].map((k) => Number(find(tipTag, k).text))) : null;
      let tail;
      // Blender tells the tail as an offset from the head in the armature's space.
      if (tip && tip.lengthSq() > 1e-12) tail = head.clone().add(tip.applyMatrix3(new Matrix3().setFromMatrix4(holderWorld)));
      else {
        const child = all(n, 'node').filter(isJoint).map(position).find((p) => p.distanceTo(head) > 1e-4);
        const parent = parentOf.get(n);
        const length = isJoint(parent) ? head.distanceTo(position(parent)) : 0;
        tail = child ?? head.clone().addScaledVector(new Vector3(0, 1, 0).transformDirection(restOf(n)), length > 1e-4 ? length * 0.5 : 0.25);
      }
      const parentIndex = joints.indexOf(parentOf.get(n));
      return createBone(n.attrs.name ?? n.attrs.sid ?? n.attrs.id ?? 'Bone', head.toArray(), tail.toArray(), parentIndex >= 0 ? parentIndex : null);
    });
    const name = holder && !isJoint(holder) && !all(holder, 'instance_geometry').length ? holder.attrs.name ?? holder.attrs.id : 'Armature';
    const arm = addObject(doc, { type: 'ARMATURE', name, data: { bones } });
    created.push(arm);
    const record = { arm, joints, holder };
    armatures.set(top, record);
    return record;
  };
  for (const n of nodes) if (isJoint(n) && !isJoint(parentOf.get(n))) armatureFor(n);
  const armatureHolders = new Set([...armatures.values()].map((r) => r.holder).filter((h) => h && !all(h, 'instance_geometry').length && !all(h, 'instance_controller').length && !all(h, 'instance_camera').length && !all(h, 'instance_light').length));

  // Objects
  const objectOf = new Map();
  const place = (obj, m) => {
    const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
    m.decompose(p, q, s);
    const e = new Euler().setFromQuaternion(q, 'ZYX');
    obj.location = p.toArray();
    obj.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
    obj.rotationMode = 'XYZ';
    obj.scale = s.toArray();
  };
  for (const n of nodes) {
    if (isJoint(n) || armatureHolders.has(n)) continue;
    const name = n.attrs.name ?? n.attrs.id ?? 'Collada';
    const controller = find(n, 'instance_controller');
    const skin = controller ? skins.get(controller.attrs.url?.slice(1)) : null;
    if (skin) {
      // Skinned: at rest where the node puts the bind shape; the joints' change from their binding moves it from there.
      const mesh = geometries.get(skin.source) && daeGeometry(geometries.get(skin.source));
      if (!mesh) continue;
      const rest = worldAt(n).multiply(skin.bindShape);
      const p = new Vector3();
      mesh.verts = mesh.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(rest); return [p.x, p.y, p.z]; });
      if (rest.determinant() < 0) mesh.faces = mesh.faces.map((f) => [...f].reverse());
      const top = skin.joints.find(Boolean);
      const record = top ? armatureFor(topJoint(top)) : null;
      if (record) {
        mesh.vgroups = record.arm.data.bones.map((b) => ({ name: b.name, w: {} }));
        skin.weights.forEach((list, vertex) => list.forEach(([j, w]) => {
          const index = record.joints.indexOf(skin.joints[j]);
          if (index >= 0 && w > 0) mesh.vgroups[index].w[vertex] = (mesh.vgroups[index].w[vertex] ?? 0) + w;
        }));
      }
      const obj = addObject(doc, { type: 'MESH', name, data: mesh, materials: [material(controller)].filter(Boolean), modifiers: record ? [{ type: 'ARMATURE', name: 'Armature', object: record.arm.id, show: true, showRender: true }] : [] });
      created.push(obj);
      continue;
    }
    const geometry = find(n, 'instance_geometry');
    const camera = find(n, 'instance_camera');
    const light = find(n, 'instance_light');
    let obj;
    if (geometry) {
      const mesh = geometries.get(geometry.attrs.url?.slice(1)) && daeGeometry(geometries.get(geometry.attrs.url.slice(1)));
      if (!mesh) continue;
      obj = addObject(doc, { type: 'MESH', name, data: mesh, materials: [material(geometry)].filter(Boolean) });
    } else if (camera && cameras.has(camera.attrs.url?.slice(1))) obj = addObject(doc, { type: 'CAMERA', name, data: readCamera(cameras.get(camera.attrs.url.slice(1))) });
    else if (light && lights.has(light.attrs.url?.slice(1))) obj = addObject(doc, { type: 'LIGHT', name, data: readLight(lights.get(light.attrs.url.slice(1))) });
    else obj = addObject(doc, { type: 'EMPTY', name });
    objectOf.set(n, obj);
    created.push(obj);
  }
  // Parents among the objects made; anything else, all the way from the root.
  const objectLocal = (n, time) => {
    const p = parentOf.get(n);
    return p && objectOf.has(p) ? localAt(n, time) : worldAt(n, time);
  };
  const sorted = [...times].sort((a, b) => a - b);
  const toFrame = (time) => Math.round(time * fps);
  let lastFrame = 0;
  const animatedBelow = (n) => { for (let at = n; at; at = parentOf.get(at)) if (channels.has(at.attrs.id)) return true; return false; };
  for (const [n, obj] of objectOf) {
    const p = parentOf.get(n);
    if (p && objectOf.has(p)) obj.parent = objectOf.get(p).id;
    place(obj, objectLocal(n, null));
    if (obj.type === 'MESH' && objectLocal(n, null).determinant() < 0) obj.data.faces = obj.data.faces.map((f) => [...f].reverse());
    const moving = obj.parent ? channels.has(n.attrs.id) : animatedBelow(n);
    if (!moving || !sorted.length) continue;
    let previous = [null, null, null];
    for (const time of sorted) {
      const holder = {};
      place(holder, objectLocal(n, time));
      holder.rotation = holder.rotation.map((a, k) => (previous[k] == null ? a : a + Math.round((previous[k] - a) / 360) * 360));
      previous = holder.rotation;
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      for (const key of ['location', 'rotation', 'scale']) holder[key].forEach((v, k) => insertKey(obj, `${key}.${k}`, frame, v, 'LINEAR'));
    }
  }
  // Bones: each joint's world now against its binding, carried to the bone's rest.
  for (const { arm, joints } of armatures.values()) {
    if (!joints.some(animatedBelow) || !sorted.length) continue;
    const rest = arm.data.bones.map((b) => restBoneMatrix(b));
    const previous = joints.map(() => [null, null, null]);
    for (const time of sorted) {
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      const posed = joints.map((n, j) => worldAt(n, time).multiply(restOf(n).clone().invert()).multiply(rest[j]));
      joints.forEach((_, j) => {
        const bone = arm.data.bones[j];
        const local = bone.parent != null
          ? rest[j].clone().invert().multiply(rest[bone.parent]).multiply(posed[bone.parent].clone().invert()).multiply(posed[j])
          : rest[j].clone().invert().multiply(posed[j]);
        const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
        local.decompose(p, q, s);
        const e = new Euler().setFromQuaternion(q);
        const rotation = [e.x / DEG, e.y / DEG, e.z / DEG].map((a, k) => (previous[j][k] == null ? a : a + Math.round((previous[j][k] - a) / 360) * 360));
        previous[j] = rotation;
        arm.data.anim ??= { fcurves: {}, nla: [] };
        for (const [key, values] of [['location', p.toArray()], ['rotation', rotation], ['scale', s.toArray()]]) values.forEach((v, k) => insertKey(arm.data, `bones.${j}.pose.${key}.${k}`, frame, v, 'LINEAR'));
      });
    }
  }
  if (lastFrame > doc.frameEnd) doc.frameEnd = lastFrame;
  setFrame(doc, doc.frame);
  return created;
}

// ─────────────── writing

/** The scene (or the selected objects) as Collada 1.4.1, Z up, in metres. */
export function exportDAEScene(doc, { selectedOnly = false } = {}) {
  const usable = (o) => isVisible(doc, o) && (!selectedOnly || doc.selected.includes(o.id)) && (GEOMETRY_TYPES.has(o.type) || ['EMPTY', 'ARMATURE', 'CAMERA', 'LIGHT'].includes(o.type));
  const objects = doc.objects.filter(usable);
  const sane = (s) => String(s).replace(/[^\w.-]/g, '_');
  const idOf = new Map();
  const taken = new Set();
  for (const o of objects) { let id = sane(o.name); while (taken.has(id)) id += '_'; taken.add(id); idOf.set(o.id, id); }
  const jointId = (o, b) => `${idOf.get(o.id)}_${sane(b.name)}`;
  const fps = doc.fps || 24;
  const r = doc.render ?? {};
  const aspect = (r.resX ?? 1920) / (r.resY ?? 1080);
  const parented = (o) => o.parent && idOf.has(o.parent);
  const localOf = (o) => {
    if (!parented(o)) return worldMatrix(doc, o);
    const m = localMatrix(o);
    return o.parentInverse ? new Matrix4().fromArray(o.parentInverse).multiply(m) : m;
  };
  const skinOf = (o) => (o.type === 'MESH' ? o.modifiers.find((m) => m.type === 'ARMATURE' && objects.some((a) => a.id === m.object && a.type === 'ARMATURE')) : null);

  const geometry = [];
  const controllers = [];
  const effects = [];
  const materials = [];
  const cameraLib = [];
  const lightLib = [];
  const materialIds = new Set();
  const materialRef = (id) => {
    const m = getMaterial(doc, id);
    if (!m) return null;
    const key = `${sane(m.name)}-material`;
    if (!materialIds.has(key)) {
      materialIds.add(key);
      effects.push(`<effect id="${key}-effect"><profile_COMMON><technique sid="common"><lambert><diffuse><color sid="diffuse">${[...m.baseColor, 1].map(number).join(' ')}</color></diffuse></lambert></technique></profile_COMMON></effect>`);
      materials.push(`<material id="${key}" name="${escape(m.name)}"><instance_effect url="#${key}-effect"/></material>`);
    }
    return key;
  };
  const bindMaterial = (key) => (key ? `<bind_material><technique_common><instance_material symbol="${key}" target="#${key}"/></technique_common></bind_material>` : '');
  const meshXml = (id, name, mesh, key) => {
    const hasUv = mesh.uvs?.some(Boolean);
    const uv = hasUv ? mesh.faces.flatMap((f, i) => f.map((_, k) => mesh.uvs[i]?.[k] ?? [0, 0])) : [];
    let corner = 0;
    const p = mesh.faces.flatMap((f) => f.flatMap((v) => (hasUv ? [v, corner++] : [v])));
    geometry.push(`<geometry id="${id}-mesh" name="${escape(name)}"><mesh>
<source id="${id}-mesh-positions"><float_array id="${id}-mesh-positions-array" count="${mesh.verts.length * 3}">${mesh.verts.flat().map(number).join(' ')}</float_array><technique_common><accessor source="#${id}-mesh-positions-array" count="${mesh.verts.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
${hasUv ? `<source id="${id}-mesh-map"><float_array id="${id}-mesh-map-array" count="${uv.length * 2}">${uv.flat().map(number).join(' ')}</float_array><technique_common><accessor source="#${id}-mesh-map-array" count="${uv.length}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>` : ''}
<vertices id="${id}-mesh-vertices"><input semantic="POSITION" source="#${id}-mesh-positions"/></vertices>
<polylist count="${mesh.faces.length}"${key ? ` material="${key}"` : ''}><input semantic="VERTEX" source="#${id}-mesh-vertices" offset="0"/>${hasUv ? `<input semantic="TEXCOORD" source="#${id}-mesh-map" offset="1" set="0"/>` : ''}<vcount>${mesh.faces.map((f) => f.length).join(' ')}</vcount><p>${p.join(' ')}</p></polylist>
</mesh></geometry>`);
  };

  // Nodes, with what each one holds.
  const nodeXml = (o) => {
    const id = idOf.get(o.id);
    const inner = [];
    if (GEOMETRY_TYPES.has(o.type)) {
      const skin = skinOf(o);
      const source = skin ? { ...o, modifiers: o.modifiers.filter((m) => m !== skin) } : o;
      const mesh = evaluatedMesh(doc, source, { render: true });
      if (mesh?.verts.length && mesh.faces.length) {
        const key = o.materials.map(materialRef).find(Boolean) ?? null;
        meshXml(id, o.name, mesh, key);
        if (!skin) inner.push(`<instance_geometry url="#${id}-mesh" name="${escape(o.name)}">${bindMaterial(key)}</instance_geometry>`);
        else {
          // Bound where it is: the bind shape is its place in the world, and each joint's binding the inverse of where its bone rests.
          const rig = objects.find((a) => a.id === skin.object);
          const armWorld = worldMatrix(doc, rig);
          const bones = rig.data.bones;
          const totals = {};
          for (const g of mesh.vgroups ?? []) for (const [v, w] of Object.entries(g.w)) totals[v] = (totals[v] ?? 0) + w;
          const perVertex = mesh.verts.map((_, v) => bones.map((b, j) => [j, (mesh.vgroups ?? []).find((g) => g.name === b.name)?.w[v] ?? 0]).filter(([, w]) => w > 0).map(([j, w]) => [j, w / (totals[v] || 1)]));
          const weights = perVertex.flat();
          const sid = `${id}-skin`;
          controllers.push(`<controller id="${sid}" name="${escape(rig.name)}"><skin source="#${id}-mesh">
<bind_shape_matrix>${rows(worldMatrix(doc, o)).map(number).join(' ')}</bind_shape_matrix>
<source id="${sid}-joints"><Name_array id="${sid}-joints-array" count="${bones.length}">${bones.map((b) => sane(b.name)).join(' ')}</Name_array><technique_common><accessor source="#${sid}-joints-array" count="${bones.length}" stride="1"><param name="JOINT" type="name"/></accessor></technique_common></source>
<source id="${sid}-bind_poses"><float_array id="${sid}-bind_poses-array" count="${bones.length * 16}">${bones.flatMap((b) => rows(armWorld.clone().multiply(restBoneMatrix(b)).invert())).map(number).join(' ')}</float_array><technique_common><accessor source="#${sid}-bind_poses-array" count="${bones.length}" stride="16"><param name="TRANSFORM" type="float4x4"/></accessor></technique_common></source>
<source id="${sid}-weights"><float_array id="${sid}-weights-array" count="${weights.length}">${weights.map(([, w]) => number(w)).join(' ')}</float_array><technique_common><accessor source="#${sid}-weights-array" count="${weights.length}" stride="1"><param name="WEIGHT" type="float"/></accessor></technique_common></source>
<joints><input semantic="JOINT" source="#${sid}-joints"/><input semantic="INV_BIND_MATRIX" source="#${sid}-bind_poses"/></joints>
<vertex_weights count="${mesh.verts.length}"><input semantic="JOINT" source="#${sid}-joints" offset="0"/><input semantic="WEIGHT" source="#${sid}-weights" offset="1"/><vcount>${perVertex.map((l) => l.length).join(' ')}</vcount><v>${(() => { let at = 0; return perVertex.flatMap((l) => l.flatMap(([j]) => [j, at++])).join(' '); })()}</v></vertex_weights>
</skin></controller>`);
          return { id, skinned: `<node id="${id}" name="${escape(o.name)}" type="NODE"><matrix sid="transform">1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</matrix><instance_controller url="#${sid}"><skeleton>#${jointId(rig, bones.find((b) => b.parent == null) ?? bones[0])}</skeleton>${bindMaterial(key)}</instance_controller></node>` };
        }
      }
    } else if (o.type === 'CAMERA') {
      const c = { ...defaultCamera(), ...o.data };
      const shape = c.kind === 'ORTHO'
        ? `<orthographic><xmag sid="xmag">${number(c.orthoScale / 2)}</xmag><aspect_ratio>${number(aspect)}</aspect_ratio><znear sid="znear">${number(c.clipStart)}</znear><zfar sid="zfar">${number(c.clipEnd)}</zfar></orthographic>`
        : `<perspective><xfov sid="xfov">${number((2 * Math.atan(c.sensor / 2 / c.lens)) / DEG)}</xfov><aspect_ratio>${number(aspect)}</aspect_ratio><znear sid="znear">${number(c.clipStart)}</znear><zfar sid="zfar">${number(c.clipEnd)}</zfar></perspective>`;
      cameraLib.push(`<camera id="${id}-camera" name="${escape(o.name)}"><optics><technique_common>${shape}</technique_common></optics></camera>`);
      inner.push(`<instance_camera url="#${id}-camera"/>`);
    } else if (o.type === 'LIGHT') {
      const l = { ...defaultLight(o.data?.kind), ...o.data };
      const power = l.color.map((x) => number(x * l.energy)).join(' ');
      const shape = l.kind === 'SUN' ? `<directional><color sid="color">${power}</color></directional>`
        : l.kind === 'SPOT' ? `<spot><color sid="color">${power}</color><constant_attenuation>1</constant_attenuation><linear_attenuation>0</linear_attenuation><quadratic_attenuation>0</quadratic_attenuation><falloff_angle sid="fall_off_angle">${number(l.spotSize)}</falloff_angle><falloff_exponent sid="fall_off_exponent">${number(l.spotBlend)}</falloff_exponent></spot>`
          : `<point><color sid="color">${power}</color><constant_attenuation>1</constant_attenuation><linear_attenuation>0</linear_attenuation><quadratic_attenuation>0</quadratic_attenuation></point>`;
      // Blender's own words for what Collada has no room for: the power apart from the colour, the spot's blend, an area light.
      const type = { POINT: 0, SUN: 1, SPOT: 2, AREA: 4 }[l.kind] ?? 0;
      lightLib.push(`<light id="${id}-light" name="${escape(o.name)}"><technique_common>${shape}</technique_common><extra><technique profile="blender"><type sid="type" type="int">${type}</type><red sid="red" type="float">${number(l.color[0])}</red><green sid="green" type="float">${number(l.color[1])}</green><blue sid="blue" type="float">${number(l.color[2])}</blue><energy sid="blender_energy" type="float">${number(l.energy)}</energy><spotsize sid="spotsize" type="float">${number(l.spotSize)}</spotsize><spotblend sid="spotblend" type="float">${number(l.spotBlend)}</spotblend><area_size sid="area_size" type="float">${number(l.size ?? 1)}</area_size></technique></extra></light>`);
      inner.push(`<instance_light url="#${id}-light"/>`);
    } else if (o.type === 'ARMATURE') {
      const bones = o.data.bones;
      const rests = bones.map((b) => restBoneMatrix(b));
      const joint = (j) => {
        const b = bones[j];
        const local = b.parent != null ? rests[b.parent].clone().invert().multiply(rests[j]) : rests[j];
        const tip = [0, 1, 2].map((k) => number(b.tail[k] - b.head[k]));
        const kids = bones.map((x, k) => (x.parent === j ? joint(k) : '')).join('');
        return `<node id="${jointId(o, b)}" name="${escape(b.name)}" sid="${sane(b.name)}" type="JOINT"><matrix sid="transform">${rows(local).map(number).join(' ')}</matrix>${kids}<extra><technique profile="blender"><tip_x sid="tip_x" type="float">${tip[0]}</tip_x><tip_y sid="tip_y" type="float">${tip[1]}</tip_y><tip_z sid="tip_z" type="float">${tip[2]}</tip_z></technique></extra></node>`;
      };
      inner.push(bones.map((b, j) => (b.parent == null ? joint(j) : '')).join(''));
    }
    return { id, inner };
  };
  const built = new Map(objects.map((o) => [o.id, nodeXml(o)]));
  const skinnedNodes = [];
  const writeNode = (o) => {
    const { id, inner, skinned } = built.get(o.id);
    const kids = objects.filter((c) => c.parent === o.id && !built.get(c.id).skinned).map(writeNode).join('');
    if (skinned) { skinnedNodes.push(skinned); return ''; }
    return `<node id="${id}" name="${escape(o.name)}" type="NODE"><matrix sid="transform">${rows(localOf(o)).map(number).join(' ')}</matrix>${inner.join('')}${kids}</node>`;
  };
  const top = objects.filter((o) => !parented(o)).map(writeNode).join('\n');
  // Skinned meshes stand at the top, where the bind shape alone places them.
  for (const o of objects) if (built.get(o.id).skinned && !skinnedNodes.includes(built.get(o.id).skinned)) skinnedNodes.push(built.get(o.id).skinned);

  // Animation: every frame of the keyed range, as each moving node's matrix.
  const keyed = (a) => Object.values(a?.fcurves ?? {}).flat().map((k) => k.f);
  const frames = objects.flatMap((o) => [...keyed(o.anim), ...keyed(o.data?.anim)]);
  const animations = [];
  if (frames.length) {
    const [start, end] = [Math.floor(Math.min(...frames)), Math.ceil(Math.max(...frames))];
    const back = doc.frame;
    const tracks = new Map();
    const track = (target) => { if (!tracks.has(target)) tracks.set(target, []); return tracks.get(target); };
    const movers = objects.filter((o) => Object.keys(o.anim?.fcurves ?? {}).length && !built.get(o.id).skinned);
    const rigs = objects.filter((o) => o.type === 'ARMATURE' && (Object.keys(o.data.anim?.fcurves ?? {}).length || o.data.bones.some((b) => b.ik?.target)));
    for (let f = start; f <= end; f++) {
      setFrame(doc, f);
      for (const o of movers) track(idOf.get(o.id)).push(rows(localOf(o)));
      for (const o of rigs) {
        const pose = bonePoseMatrices(evaluatedArmature(doc, o));
        o.data.bones.forEach((b, j) => track(jointId(o, b)).push(rows(b.parent != null ? pose[b.parent].clone().invert().multiply(pose[j]) : pose[j])));
      }
    }
    setFrame(doc, back);
    const times = [];
    for (let f = start; f <= end; f++) times.push(number(f / fps));
    for (const [target, list] of tracks) {
      const a = `${target}-anim`;
      animations.push(`<animation id="${a}" name="${escape(target)}">
<source id="${a}-input"><float_array id="${a}-input-array" count="${times.length}">${times.join(' ')}</float_array><technique_common><accessor source="#${a}-input-array" count="${times.length}" stride="1"><param name="TIME" type="float"/></accessor></technique_common></source>
<source id="${a}-output"><float_array id="${a}-output-array" count="${list.length * 16}">${list.flat().map(number).join(' ')}</float_array><technique_common><accessor source="#${a}-output-array" count="${list.length}" stride="16"><param name="TRANSFORM" type="float4x4"/></accessor></technique_common></source>
<source id="${a}-interpolation"><Name_array id="${a}-interpolation-array" count="${times.length}">${times.map(() => 'LINEAR').join(' ')}</Name_array><technique_common><accessor source="#${a}-interpolation-array" count="${times.length}" stride="1"><param name="INTERPOLATION" type="name"/></accessor></technique_common></source>
<sampler id="${a}-sampler"><input semantic="INPUT" source="#${a}-input"/><input semantic="OUTPUT" source="#${a}-output"/><input semantic="INTERPOLATION" source="#${a}-interpolation"/></sampler>
<channel source="#${a}-sampler" target="${target}/transform"/>
</animation>`);
    }
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><contributor><authoring_tool>My3DBlender</authoring_tool></contributor><unit name="meter" meter="1"/><up_axis>Z_UP</up_axis></asset>
<library_cameras>${cameraLib.join('\n')}</library_cameras>
<library_lights>${lightLib.join('\n')}</library_lights>
<library_effects>${effects.join('\n')}</library_effects>
<library_materials>${materials.join('\n')}</library_materials>
<library_geometries>${geometry.join('\n')}</library_geometries>
<library_controllers>${controllers.join('\n')}</library_controllers>
<library_animations>${animations.join('\n')}</library_animations>
<library_visual_scenes><visual_scene id="Scene" name="Scene">${top}
${skinnedNodes.join('\n')}</visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>
`;
}
