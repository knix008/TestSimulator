// Several scenes in one file, instancing (collection instances, instances on vertices and faces) and motion paths.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { posedBone } from './armature.js';
import { evaluatedMesh, getObject, newId, setFrame, worldMatrix, evaluatedArmature } from './doc.js';
import { faceArea, faceCenter, faceNormal, v3 } from './mesh.js';

// ─────────────── scenes
//
// The active scene's fields live on the document itself, so everything else in the program simply works on `doc`. The others
// wait in doc.scenes[i].state; materials, images and text blocks are shared by all of them.
export const SCENE_FIELDS = ['objects', 'collections', 'activeCollection', 'activeId', 'selected', 'cursor', 'activeCamera', 'frame', 'frameStart', 'frameEnd', 'fps', 'frameStep', 'markers', 'gravity', 'unitScale', 'unitSystem', 'world', 'render', 'compositor', 'compositorEnabled', 'sequence', 'viewLayers', 'proportional'];

export function ensureScenes(doc) {
  if (!doc.scenes?.length) {
    doc.scenes = [{ id: 'scene_1', name: 'Scene', state: null }];
    doc.activeScene = 'scene_1';
  }
  return doc.scenes;
}

const takeState = (doc) => Object.fromEntries(SCENE_FIELDS.map((k) => [k, doc[k]]));

export function switchScene(doc, id) {
  ensureScenes(doc);
  if (id === doc.activeScene) return false;
  const target = doc.scenes.find((s) => s.id === id);
  if (!target?.state) return false;
  const current = doc.scenes.find((s) => s.id === doc.activeScene);
  current.state = takeState(doc);
  Object.assign(doc, target.state);
  target.state = null;
  doc.activeScene = id;
  doc.mode = 'OBJECT';
  return true;
}

/** A new scene, empty or a full copy of the active one (same materials, its own objects). It becomes active. */
export function newScene(doc, { name = null, copy = false } = {}) {
  ensureScenes(doc);
  const id = newId('scene');
  const blank = { objects: [], collections: [{ id: 'col_root', name: 'Scene Collection', parent: null, hide: false, exclude: false }], activeCollection: 'col_root', activeId: null, selected: [], cursor: [0, 0, 0], activeCamera: null, frame: doc.frame, frameStart: doc.frameStart, frameEnd: doc.frameEnd, fps: doc.fps, frameStep: 1, markers: [], gravity: [...doc.gravity], unitScale: doc.unitScale, unitSystem: doc.unitSystem, world: { color: [0.05, 0.05, 0.05], strength: 1, useNodes: false, nodes: null }, render: structuredClone(doc.render), compositor: null, compositorEnabled: false, sequence: { strips: [], channels: 8 }, viewLayers: structuredClone(doc.viewLayers), proportional: { enabled: false, size: 1, falloff: 'SMOOTH', connected: false } };
  let state = blank;
  if (copy) {
    // Object ids are globally unique, also between scenes: references inside the copy are renamed by text.
    let text = JSON.stringify(takeState(doc));
    for (const o of doc.objects) text = text.split(`"${o.id}"`).join(`"${newId('ob')}${o.id.length}"`);
    state = JSON.parse(text);
  }
  const base = name ?? (copy ? `${doc.scenes.find((s) => s.id === doc.activeScene).name} Copy` : 'Scene');
  const taken = new Set(doc.scenes.map((s) => s.name));
  let unique = base;
  for (let i = 1; taken.has(unique); i++) unique = `${base}.${String(i).padStart(3, '0')}`;
  doc.scenes.push({ id, name: unique, state });
  switchScene(doc, id);
  return id;
}

export function removeScene(doc, id = doc.activeScene) {
  ensureScenes(doc);
  if (doc.scenes.length < 2) return false;
  if (id === doc.activeScene) switchScene(doc, doc.scenes.find((s) => s.id !== id).id);
  doc.scenes = doc.scenes.filter((s) => s.id !== id);
  return true;
}

// ─────────────── instancing

function collectionTree(doc, id, seen = new Set()) {
  if (seen.has(id)) return seen;
  seen.add(id);
  for (const c of doc.collections) if (c.parent === id) collectionTree(doc, c.id, seen);
  return seen;
}

const placeOnVertex = (location) => new Matrix4().makeTranslation(location[0], location[1], location[2]);
function placeOnFace(mesh, face, { scaleByArea = false } = {}) {
  const c = faceCenter(mesh, face);
  const n = faceNormal(mesh, face);
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(n[0], n[1], n[2]));
  const s = scaleByArea ? Math.sqrt(faceArea(mesh, face)) : 1;
  return new Matrix4().compose(new Vector3(c[0], c[1], c[2]), turn, new Vector3(s, s, s));
}

/** Whether an object appears only through its parent's instancing. */
export function isInstanceSource(doc, obj) {
  const parent = obj.parent ? getObject(doc, obj.parent) : null;
  return Boolean(parent?.instancing && parent.instancing.mode !== 'NONE' && parent.instancing.hideSources !== false);
}

/** Every instance in the scene: { object (the original), matrix (its world matrix as an instance), owner }. */
export function sceneInstances(doc, { frame = doc.frame, depth = 0 } = {}) {
  const out = [];
  if (depth > 4) return out;
  for (const owner of doc.objects) {
    if (owner.hide || owner.hideRender === 'never') continue;
    const ownerWorld = worldMatrix(doc, owner);
    const colId = owner.type === 'EMPTY' ? owner.data?.instanceCollection : null;
    if (colId) {
      const inside = collectionTree(doc, colId);
      const col = doc.collections.find((c) => c.id === colId);
      const offset = col?.instanceOffset ?? [0, 0, 0];
      const shift = new Matrix4().makeTranslation(-offset[0], -offset[1], -offset[2]);
      for (const o of doc.objects) {
        if (o === owner || !inside.has(o.collection)) continue;
        out.push({ object: o, matrix: new Matrix4().copy(ownerWorld).multiply(shift).multiply(worldMatrix(doc, o)), owner });
      }
    }
    const mode = owner.instancing?.mode;
    if (mode === 'VERTS' || mode === 'FACES') {
      const mesh = evaluatedMesh(doc, owner, { frame, render: true });
      if (!mesh) continue;
      const inverse = new Matrix4().copy(ownerWorld).invert();
      const places = mode === 'VERTS' ? mesh.verts.map(placeOnVertex) : mesh.faces.map((f) => placeOnFace(mesh, f, owner.instancing));
      for (const child of doc.objects) {
        if (child.parent !== owner.id) continue;
        const relative = new Matrix4().copy(inverse).multiply(worldMatrix(doc, child));
        for (const place of places) out.push({ object: child, matrix: new Matrix4().copy(ownerWorld).multiply(place).multiply(relative), owner });
      }
    }
  }
  return out;
}

/** Turns one owner's instances into ordinary objects. Returns how many were made. */
export function makeInstancesReal(doc, owner, addObject) {
  const made = [];
  for (const inst of sceneInstances(doc).filter((x) => x.owner === owner)) {
    const { id, name, parent, parentInverse, ...rest } = structuredClone(inst.object);
    void id; void parent; void parentInverse;
    const pos = new Vector3();
    const rot = new Quaternion();
    const scl = new Vector3();
    inst.matrix.decompose(pos, rot, scl);
    const e = new Euler().setFromQuaternion(rot, 'ZYX');
    const obj = addObject(doc, { ...rest, name, parent: null, collection: doc.activeCollection, location: [pos.x, pos.y, pos.z], rotation: [e.x * 57.29577951308232, e.y * 57.29577951308232, e.z * 57.29577951308232], rotationMode: 'XYZ', scale: [scl.x, scl.y, scl.z] });
    made.push(obj);
  }
  if (owner.instancing) owner.instancing = { ...owner.instancing, mode: 'NONE' };
  if (owner.data?.instanceCollection) owner.data.instanceCollection = null;
  return made;
}

// ─────────────── motion paths

/** Where an object is at each frame of a range: { start, end, step, points, matrices }. The document's frame is put back. */
export function calculateMotionPath(doc, obj, { start = doc.frameStart, end = doc.frameEnd, step = 1, bone = null } = {}) {
  const back = doc.frame;
  const points = [];
  const matrices = [];
  for (let f = start; f <= end; f += step) {
    setFrame(doc, f);
    const m = worldMatrix(doc, obj);
    if (bone != null) {
      // The tip of a bone, where a hand or a foot would be.
      const tip = posedBone(evaluatedArmature(doc, obj), bone).tail;
      const p = new Vector3(...tip).applyMatrix4(m);
      points.push([p.x, p.y, p.z]);
    } else points.push([m.elements[12], m.elements[13], m.elements[14]]);
    matrices.push(Array.from(m.elements));
  }
  setFrame(doc, back);
  return { start, end, step, points, matrices };
}

/** The length of a path, for reports and tests. */
export const pathLength = (points) => points.slice(1).reduce((s, p, i) => s + v3.dist(p, points[i]), 0);

/** Which stored frames a ghost is drawn for around `frame`. */
export function onionFrames(path, frame, { before = 2, after = 2, every = 5 } = {}) {
  if (!path) return [];
  const out = [];
  for (let k = -before; k <= after; k++) {
    if (k === 0) continue;
    const f = frame + k * every;
    const i = Math.round((f - path.start) / path.step);
    if (i >= 0 && i < path.points.length) out.push({ frame: f, matrix: path.matrices[i], opacity: 0.35 * (1 - (Math.abs(k) - 1) / Math.max(before, after, 1)) + 0.05 });
  }
  return out;
}

