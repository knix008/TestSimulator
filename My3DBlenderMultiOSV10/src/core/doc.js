// The scene document: objects, collections, materials, world, timeline and render settings. Plain JSON-able data;
// keys starting with "_" are run-time only and never saved. No DOM here.
import { Euler, Matrix4, Quaternion, ShapeUtils, Vector2, Vector3 } from 'three';
import { applyAnimation, evalDriver, evalFCurve, getPath, setPath } from './anim.js';
import { boundingBox, closestOnTriangle, cubeMesh, createMesh, toTriangles, triangulateIndices, v3 } from './mesh.js';
import { projectOntoMesh } from './meshtools.js';
import { evaluateMesh } from './modifiers.js';
import { ACTION_CHANNELS, ACTION_MIXES, BONE_CONSTRAINTS, armaturePoseMatrices, boneLocalMatrix, bonePoseMatrices, channelValue, deformByArmature, mixMatrices, restBoneMatrix, solvedArmature } from './armature.js';
import { evalGeometryNodes } from './nodes.js';
import { metaballToMesh } from './metaball.js';
import { textToMesh } from './text3d.js';
import { surfaceToMesh } from './nurbs.js';
import { applyDynamicPaint, liquidMeshAt, simBaked } from './simulation.js';

export const FORMAT = 'my3dblender';
export const FORMAT_VERSION = 1;
const DEG = Math.PI / 180;
/** Object types that evaluate to a surface. */
export const GEOMETRY_TYPES = new Set(['MESH', 'CURVE', 'TEXT', 'META', 'SURFACE']);

let nextId = 1;
export const newId = (prefix = 'id') => `${prefix}${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function defaultMaterial(name = 'Material') {
  return {
    id: newId('mat'), name, baseColor: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5, specular: 0.5, ior: 1.45, transmission: 0, alpha: 1,
    emission: [0, 0, 0], emissionStrength: 1, useNodes: false, nodes: null,
  };
}

export function createDocument() {
  const doc = {
    format: FORMAT, version: FORMAT_VERSION, name: 'Untitled',
    objects: [], materials: [], images: [], texts: [], palettes: [], clips: [], actions: [], caches: [],
    collections: [{ id: 'col_root', name: 'Scene Collection', parent: null, hide: false, exclude: false }],
    activeCollection: 'col_root',
    activeId: null, selected: [], mode: 'OBJECT', cursor: [0, 0, 0], activeCamera: null,
    proportional: { enabled: false, size: 1, falloff: 'SMOOTH', connected: false },
    snap: defaultSnap(),
    scenes: [{ id: 'scene_1', name: 'Scene', state: null }], activeScene: 'scene_1', nodeGroups: [],
    frame: 1, frameStart: 1, frameEnd: 250, fps: 24, frameStep: 1, markers: [],
    gravity: [0, 0, -9.81], unitScale: 1, unitSystem: 'METRIC',
    world: { color: [0.05, 0.05, 0.05], strength: 1, useNodes: false, nodes: null, aoDistance: 10, mist: { start: 5, depth: 25, falloff: 'QUADRATIC' } },
    render: {
      engine: 'PATH', samples: 32, bounces: 4, width: 1920, height: 1080, percent: 50, filmTransparent: false, exposure: 0, gamma: 1, format: 'PNG',
      dofAperture: 0, viewTransform: 'FILMIC', denoise: true, seed: 0,
      freestyle: { enabled: false, thickness: 1.5, color: [0, 0, 0], crease: 40, silhouette: true, border: true, creases: true },
    },
    compositor: null, compositorEnabled: false, sequence: { strips: [], channels: 8 }, viewLayers: [{ id: 'vl1', name: 'ViewLayer', usePass: { combined: true, z: false, normal: false } }],
  };
  return doc;
}

/** The start-up scene: a cube, a light and a camera. */
export function createDefaultScene() {
  const doc = createDocument();
  const mat = defaultMaterial();
  doc.materials.push(mat);
  const cube = addObject(doc, { type: 'MESH', name: 'Cube', data: cubeMesh(2), materials: [mat.id] });
  const light = addObject(doc, { type: 'LIGHT', name: 'Light', location: [4.08, 1, 5.9], data: defaultLight('POINT') });
  light.data.energy = 1000;
  const camera = addObject(doc, { type: 'CAMERA', name: 'Camera', location: [7.36, -6.93, 4.96], rotation: [63.6, 0, 46.7], data: defaultCamera() });
  doc.activeCamera = camera.id;
  selectOnly(doc, cube);
  return doc;
}

export const defaultSnap = () => ({ enabled: false, target: 'INCREMENT' });
export const defaultLight = (kind = 'POINT') => ({ kind, color: [1, 1, 1], energy: kind === 'SUN' ? 3 : 100, radius: kind === 'SUN' ? 0.01 : 0.1, spotSize: 45, spotBlend: 0.15, size: 1, castShadow: true });
export const defaultCamera = () => ({ kind: 'PERSP', lens: 50, sensor: 36, clipStart: 0.1, clipEnd: 1000, orthoScale: 6, dofFocus: 10, dofEnabled: false, fstop: 2.8 });

export function addObject(doc, init = {}) {
  const base = uniqueName(doc, init.name ?? 'Object');
  const obj = {
    id: newId('ob'), type: 'EMPTY', parent: null, collection: doc.activeCollection,
    location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], rotationMode: 'XYZ',
    hide: false, hideRender: false, hideSelect: false, displayType: 'TEXTURED', color: [1, 1, 1, 1],
    data: null, materials: [], modifiers: [], constraints: [], anim: null, drivers: [], customProps: {},
    rigidBody: null, rigidConstraint: null, cloth: null, softBody: null, field: null, collision: null, particles: [], cache: {},
    ...init, name: base,
  };
  doc.objects.push(obj);
  return obj;
}

export function uniqueName(doc, name) {
  const taken = new Set(doc.objects.map((o) => o.name));
  if (!taken.has(name)) return name;
  const stem = name.replace(/\.\d{3}$/, '');
  for (let i = 1; ; i++) {
    const candidate = `${stem}.${String(i).padStart(3, '0')}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const getObject = (doc, id) => doc.objects.find((o) => o.id === id) ?? null;
export const activeObject = (doc) => getObject(doc, doc.activeId);
export const selectedObjects = (doc) => doc.selected.map((id) => getObject(doc, id)).filter(Boolean);
export const getMaterial = (doc, id) => doc.materials.find((m) => m.id === id) ?? null;

export function selectOnly(doc, obj) {
  doc.selected = obj ? [obj.id] : [];
  doc.activeId = obj ? obj.id : doc.activeId;
}

export function toggleSelect(doc, obj) {
  if (doc.selected.includes(obj.id) && doc.activeId === obj.id) doc.selected = doc.selected.filter((id) => id !== obj.id);
  else {
    if (!doc.selected.includes(obj.id)) doc.selected.push(obj.id);
    doc.activeId = obj.id;
  }
}

/** Hidden by itself or by a collection it is in. */
export function isVisible(doc, obj) {
  if (obj.hide) return false;
  let col = doc.collections.find((c) => c.id === obj.collection);
  while (col) {
    if (col.hide || col.exclude) return false;
    col = doc.collections.find((c) => c.id === col.parent);
  }
  return true;
}

export function removeObject(doc, id) {
  doc.objects = doc.objects.filter((o) => o.id !== id);
  doc.selected = doc.selected.filter((s) => s !== id);
  if (doc.activeId === id) doc.activeId = doc.selected[0] ?? null;
  if (doc.activeCamera === id) doc.activeCamera = doc.objects.find((o) => o.type === 'CAMERA')?.id ?? null;
  for (const o of doc.objects) {
    if (o.parent === id) o.parent = null;
    o.modifiers = o.modifiers.map((m) => (m.object === id ? { ...m, object: null } : m));
    o.constraints = o.constraints.filter((c) => c.target !== id);
  }
}

// ─────────────── transforms

/**
 * Rotation mode 'XYZ' means: turn about X first, then Y, then Z. three.js names the same rotation by the order of the
 * matrix product, 'ZYX', so every conversion between degrees and quaternions goes through these two functions.
 */
const eulerOrder = (mode) => (mode && mode !== 'QUATERNION' ? [...mode].reverse().join('') : 'ZYX');
export const rotationQuat = (rotation, mode = 'XYZ') => new Quaternion().setFromEuler(new Euler(rotation[0] * DEG, rotation[1] * DEG, rotation[2] * DEG, eulerOrder(mode)));
export function rotationFromQuat(q, mode = 'XYZ') {
  const e = new Euler().setFromQuaternion(q, eulerOrder(mode));
  return [e.x / DEG, e.y / DEG, e.z / DEG];
}

export function localMatrix(obj) {
  const rotation = obj.rotationMode === 'QUATERNION' && obj.quaternion
    ? new Quaternion(obj.quaternion[1], obj.quaternion[2], obj.quaternion[3], obj.quaternion[0])
    : rotationQuat(obj.rotation, obj.rotationMode);
  return new Matrix4().compose(new Vector3(...obj.location), rotation, new Vector3(...obj.scale));
}

/** World matrix: parents, then constraints. */
export function worldMatrix(doc, obj, seen = new Set()) {
  if (seen.has(obj.id)) return localMatrix(obj);
  seen.add(obj.id);
  let m = localMatrix(obj);
  const parent = obj.parent ? getObject(doc, obj.parent) : null;
  if (parent) {
    const pm = worldMatrix(doc, parent, seen);
    const inverse = obj.parentInverse ? new Matrix4().fromArray(obj.parentInverse) : new Matrix4();
    m = pm.multiply(inverse).multiply(m);
  }
  return applyConstraints(doc, obj, m, seen);
}

const RAD_TO_DEG = 180 / Math.PI;

export const CONSTRAINTS = {
  COPY_LOCATION: { en: 'Copy Location', ko: '위치 복사', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  COPY_ROTATION: { en: 'Copy Rotation', ko: '회전 복사', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  COPY_SCALE: { en: 'Copy Scale', ko: '크기 복사', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  COPY_TRANSFORMS: { en: 'Copy Transforms', ko: '트랜스폼 복사', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  TRACK_TO: { en: 'Track To', ko: '따라보기', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  DAMPED_TRACK: { en: 'Damped Track', ko: '감쇠 따라보기', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  LIMIT_LOCATION: { en: 'Limit Location', ko: '위치 제한', props: { minX: { def: -10, step: 0.1 }, maxX: { def: 10, step: 0.1 }, minY: { def: -10, step: 0.1 }, maxY: { def: 10, step: 0.1 }, minZ: { def: 0, step: 0.1 }, maxZ: { def: 10, step: 0.1 } } },
  LIMIT_DISTANCE: { en: 'Limit Distance', ko: '거리 제한', props: { target: { def: null, object: true }, distance: { def: 5, min: 0, step: 0.1 } } },
  CHILD_OF: { en: 'Child Of', ko: '자식', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  FLOOR: { en: 'Floor', ko: '바닥', props: { target: { def: null, object: true }, offset: { def: 0, step: 0.1 } } },
  LIMIT_ROTATION: { en: 'Limit Rotation', ko: '회전 제한', props: { useX: { def: true }, minX: { def: -45, step: 5 }, maxX: { def: 45, step: 5 }, useY: { def: true }, minY: { def: -45, step: 5 }, maxY: { def: 45, step: 5 }, useZ: { def: true }, minZ: { def: -45, step: 5 }, maxZ: { def: 45, step: 5 } } },
  LIMIT_SCALE: { en: 'Limit Scale', ko: '크기 제한', props: { min: { def: 0.5, min: 0, step: 0.1 }, max: { def: 2, min: 0, step: 0.1 } } },
  LOCKED_TRACK: { en: 'Locked Track', ko: '고정 따라보기', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  STRETCH_TO: { en: 'Stretch To', ko: '늘이기', props: { target: { def: null, object: true }, rest: { def: 1, min: 0.001, step: 0.1 }, volume: { def: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  MAINTAIN_VOLUME: { en: 'Maintain Volume', ko: '부피 유지', props: { volume: { def: 1, min: 0.001, step: 0.1 }, axis: { def: 'Y', options: ['X', 'Y', 'Z'] } } },
  PIVOT: { en: 'Pivot', ko: '피벗', props: { target: { def: null, object: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  FOLLOW_PATH: { en: 'Follow Path', ko: '경로 따라가기', props: { target: { def: null, object: 'CURVE' }, offset: { def: 0, min: 0, max: 1, step: 0.01 }, followCurve: { def: true }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  CLAMP_TO: { en: 'Clamp To', ko: '경로에 붙이기', props: { target: { def: null, object: 'CURVE' }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  TRANSFORMATION: { en: 'Transformation', ko: '트랜스폼 변환', props: { ...Object.fromEntries(Object.entries(BONE_CONSTRAINTS.TRANSFORMATION.props).filter(([key]) => key !== 'space' && key !== 'subtarget')), influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  SHRINKWRAP: { en: 'Shrinkwrap', ko: '수축 감싸기', props: { target: { def: null, object: 'MESH' }, mode: { def: 'NEAREST_SURFACE', options: ['NEAREST_SURFACE', 'PROJECT', 'NEAREST_VERTEX'] }, distance: { def: 0, min: 0, step: 0.05 }, axis: { def: '-Z', options: ['X', 'Y', 'Z', '-X', '-Y', '-Z'] }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  ARMATURE: { en: 'Armature', ko: '아마추어', props: { target: { def: null, object: 'ARMATURE' }, subtarget: { def: '', bone: 'target' }, weight: { def: 1, min: 0, max: 1, step: 0.05 }, target2: { def: null, object: 'ARMATURE' }, subtarget2: { def: '', bone: 'target2' }, weight2: { def: 0, min: 0, max: 1, step: 0.05 }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  CAMERA_SOLVER: { en: 'Camera Solver', ko: '카메라 솔버', props: { clip: { def: '', choices: 'clips' }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  OBJECT_SOLVER: { en: 'Object Solver', ko: '오브젝트 솔버', props: { clip: { def: '', choices: 'clips' }, camera: { def: null, object: 'CAMERA' }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  FOLLOW_TRACK: { en: 'Follow Track', ko: '트랙 따라가기', props: { clip: { def: '', choices: 'clips' }, track: { def: '', choices: 'tracks' }, camera: { def: null, object: 'CAMERA' }, depth: { def: 10, min: 0, step: 0.5 }, use3D: { def: false }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  TRANSFORM_CACHE: { en: 'Transform Cache', ko: '트랜스폼 캐시', props: { cache: { def: '', choices: 'caches' }, objectPath: { def: '', choices: 'cachePaths' }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
  ACTION: { en: 'Action', ko: '액션', props: { target: { def: null, object: true }, action: { def: '', action: true }, channel: { def: 'LOCATION_X', options: ACTION_CHANNELS }, min: { def: 0, step: 0.1 }, max: { def: 1, step: 0.1 }, frameStart: { def: 1, step: 1, int: true }, frameEnd: { def: 10, step: 1, int: true }, mix: { def: 'BEFORE_SPLIT', options: ACTION_MIXES }, influence: { def: 1, min: 0, max: 1, step: 0.05 } } },
};

/** The Add Constraint menu's groups, as Blender has them. */
export const CONSTRAINT_GROUPS = [
  { en: 'Motion Tracking', ko: '모션 트래킹', types: ['CAMERA_SOLVER', 'FOLLOW_TRACK', 'OBJECT_SOLVER'] },
  { en: 'Transform', ko: '트랜스폼', types: ['COPY_LOCATION', 'COPY_ROTATION', 'COPY_SCALE', 'COPY_TRANSFORMS', 'LIMIT_DISTANCE', 'LIMIT_LOCATION', 'LIMIT_ROTATION', 'LIMIT_SCALE', 'MAINTAIN_VOLUME', 'TRANSFORMATION', 'TRANSFORM_CACHE'] },
  { en: 'Tracking', ko: '따라보기', types: ['CLAMP_TO', 'DAMPED_TRACK', 'LOCKED_TRACK', 'STRETCH_TO', 'TRACK_TO'] },
  { en: 'Relationship', ko: '관계', types: ['ACTION', 'ARMATURE', 'CHILD_OF', 'FLOOR', 'FOLLOW_PATH', 'PIVOT', 'SHRINKWRAP'] },
];

/** An object's transform from an action at a frame: its location, rotation and scale curves, at rest where it has none. */
function actionObjectMatrix(action, frame, mode) {
  const read = (name, k, rest) => (action.fcurves?.[`${name}.${k}`]?.length ? evalFCurve(action, `${name}.${k}`, frame) : rest);
  const [l, r, sc] = [[0, 1, 2].map((k) => read('location', k, 0)), [0, 1, 2].map((k) => read('rotation', k, 0)), [0, 1, 2].map((k) => read('scale', k, 1))];
  return new Matrix4().compose(new Vector3(...l), rotationQuat(r, mode), new Vector3(...sc));
}

/** A clip's solved camera at a frame, in the scene: between solved frames it is blended, outside them held. */
export function solvedCameraMatrix(clip, frame) {
  const path = clip?.solve?.camera;
  if (!path?.length) return null;
  let i = 0;
  while (i + 1 < path.length && path[i + 1].frame <= frame) i++;
  const [a, b] = [path[i], path[Math.min(i + 1, path.length - 1)]];
  const share = b.frame > a.frame ? Math.max(0, Math.min(1, (frame - a.frame) / (b.frame - a.frame))) : 0;
  const q = new Quaternion().fromArray(a.quaternion).slerp(new Quaternion().fromArray(b.quaternion), share);
  const p = new Vector3(...a.location).lerp(new Vector3(...b.location), share);
  return new Matrix4().compose(p, q, new Vector3(1, 1, 1));
}

/** A transform cache's matrix for one path at a frame: samples one frame apart from the cache's start, blended between. */
export function cacheMatrix(cache, path, frame) {
  const samples = cache?.samples?.[path];
  if (!samples?.length) return null;
  const at = Math.max(0, Math.min(samples.length - 1, frame - (cache.start ?? 1)));
  const [i, j] = [Math.floor(at), Math.ceil(at)];
  const [pa, qa, sa, pb, qb, sb] = [new Vector3(), new Quaternion(), new Vector3(), new Vector3(), new Quaternion(), new Vector3()];
  new Matrix4().fromArray(samples[i]).decompose(pa, qa, sa);
  new Matrix4().fromArray(samples[j]).decompose(pb, qb, sb);
  const k = at - i;
  return new Matrix4().compose(pa.lerp(pb, k), qa.slerp(qb, k), sa.lerp(sb, k));
}

/** Where a camera sees a point of the clip (pixels, rows down) at a depth in front of it, in the world. */
function clipPointInWorld(camera, cameraWorld, clip, [u, v], depth) {
  const aspect = (clip.height || 1) / (clip.width || 1);
  const x = (u / (clip.width || 1)) * 2 - 1;
  const y = 1 - (v / (clip.height || 1)) * 2;
  const half = camera.kind === 'ORTHO' ? (camera.orthoScale ?? 6) / 2 : (depth * (camera.sensor ?? 36)) / 2 / (camera.lens ?? 50);
  return new Vector3(x * half, y * half * aspect, -depth).applyMatrix4(cameraWorld);
}

/** A track's point at a frame: its own where it has one, else the nearest earlier one. */
function trackPointAt(track, frame) {
  if (track.points[frame]) return track.points[frame];
  const frames = Object.keys(track.points).map(Number).sort((a, b) => a - b);
  const before = frames.filter((f) => f <= frame);
  return track.points[before.length ? before.at(-1) : frames[0]] ?? null;
}

/** The line a curve object draws, in world space: for constraints that run along it. */
function curvePoints(doc, curveObject, matrix) {
  const line = curveToMesh({ ...curveObject.data, bevelDepth: 0 });
  if (!line?.verts.length) return [];
  const p = new Vector3();
  return line.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(matrix); return p.toArray(); });
}

export function createConstraint(type) {
  const spec = CONSTRAINTS[type];
  if (!spec) throw new Error(`Unknown constraint: ${type}`);
  const c = { type, name: spec.en, enabled: true };
  for (const [key, p] of Object.entries(spec.props)) c[key] = p.def;
  return c;
}

function applyConstraints(doc, obj, matrix, seen) {
  let m = matrix;
  for (const c of obj.constraints ?? []) {
    if (c.enabled === false) continue;
    const pos = new Vector3();
    const rot = new Quaternion();
    const scl = new Vector3();
    m.decompose(pos, rot, scl);
    const targetObj = c.target ? getObject(doc, c.target) : null;
    const t = targetObj ? worldMatrix(doc, targetObj, new Set(seen)) : null;
    const tp = new Vector3();
    const tr = new Quaternion();
    const ts = new Vector3();
    t?.decompose(tp, tr, ts);
    const k = c.influence ?? 1;
    switch (c.type) {
      case 'COPY_LOCATION': if (t) pos.lerp(tp, k); break;
      case 'COPY_ROTATION': if (t) rot.slerp(tr, k); break;
      case 'COPY_SCALE': if (t) scl.lerp(ts, k); break;
      case 'COPY_TRANSFORMS': if (t) { pos.lerp(tp, k); rot.slerp(tr, k); scl.lerp(ts, k); } break;
      case 'CHILD_OF': if (t) { const mm = t.clone().multiply(m); const p2 = new Vector3(); const r2 = new Quaternion(); const s2 = new Vector3(); mm.decompose(p2, r2, s2); pos.lerp(p2, k); rot.slerp(r2, k); scl.lerp(s2, k); } break;
      case 'TRACK_TO':
      case 'DAMPED_TRACK':
        if (t) {
          // Cameras look down −Z with Y up.
          const dir = tp.clone().sub(pos);
          if (dir.lengthSq() > 1e-12) {
            const look = new Matrix4().lookAt(pos, tp, new Vector3(0, 0, 1));
            rot.slerp(new Quaternion().setFromRotationMatrix(look), k);
          }
        }
        break;
      case 'LIMIT_LOCATION':
        pos.set(Math.max(c.minX, Math.min(c.maxX, pos.x)), Math.max(c.minY, Math.min(c.maxY, pos.y)), Math.max(c.minZ, Math.min(c.maxZ, pos.z)));
        break;
      case 'LIMIT_DISTANCE':
        if (t) {
          const d = pos.clone().sub(tp);
          if (d.length() > c.distance) pos.copy(tp).add(d.setLength(c.distance));
        }
        break;
      case 'FLOOR': if (t) pos.z = Math.max(pos.z, tp.z + c.offset); break;
      case 'ACTION': {
        // The target's value picks the frame, in the world; the action's transform is put together with the object's own.
        const action = doc.actions?.find((a) => a.id === c.action);
        if (!t || !action) break;
        const share = c.max === c.min ? 0 : (channelValue(t, c.channel ?? 'LOCATION_X') - c.min) / (c.max - c.min);
        const frame = c.frameStart + Math.max(0, Math.min(1, share)) * (c.frameEnd - c.frameStart);
        const A = actionObjectMatrix(action, frame, obj.rotationMode);
        const mix = c.mix ?? 'BEFORE_SPLIT';
        const how = mix.endsWith('FULL') ? 'FULL' : mix.endsWith('SPLIT') ? 'SPLIT' : 'ALIGNED';
        // The object's own transform, apart from its parent, is what the action goes with.
        const own = new Matrix4().compose(pos, rot, scl);
        const mixed = mix === 'REPLACE' ? A : mix.startsWith('BEFORE') ? mixMatrices(A, own, how) : mixMatrices(own, A, how);
        const [p2, r2, s2] = [new Vector3(), new Quaternion(), new Vector3()];
        mixed.decompose(p2, r2, s2);
        pos.lerp(p2, k); rot.slerp(r2, k); scl.lerp(s2, k);
        break;
      }
      case 'TRANSFORMATION': {
        // Where the target stands in its range, in the world, is the same share of the owner's range: added to its location and rotation, or its scale.
        if (!t) break;
        const source = c.fromType === 'ROTATION' ? (() => { const e = new Euler().setFromQuaternion(tr, 'ZYX'); return [e.x * RAD_TO_DEG, e.y * RAD_TO_DEG, e.z * RAD_TO_DEG]; })() : c.fromType === 'SCALE' ? ts.toArray() : tp.toArray();
        const mapped = ['X', 'Y', 'Z'].map((axis, n) => {
          const [lo, hi] = [c[`fromMin${axis}`], c[`fromMax${axis}`]];
          const share = hi === lo ? 0 : Math.max(0, Math.min(1, (source[n] - lo) / (hi - lo)));
          return c[`toMin${axis}`] + (c[`toMax${axis}`] - c[`toMin${axis}`]) * share;
        });
        if (c.toType === 'ROTATION') {
          const e = new Euler().setFromQuaternion(rot, 'ZYX');
          rot.slerp(new Quaternion().setFromEuler(new Euler(e.x + mapped[0] / RAD_TO_DEG, e.y + mapped[1] / RAD_TO_DEG, e.z + mapped[2] / RAD_TO_DEG, 'ZYX')), k);
        } else if (c.toType === 'SCALE') scl.lerp(new Vector3(...mapped), k);
        else pos.add(new Vector3(...mapped).multiplyScalar(k));
        break;
      }
      case 'SHRINKWRAP': {
        // Onto the target's surface as it is drawn: the nearest point, a vertex, or along an axis; kept the distance away.
        if (!targetObj || targetObj.type !== 'MESH' || seen.has(targetObj.id)) break;
        const mesh = meshInSpaceOf(doc, targetObj.id, new Matrix4(), doc.frame, seen);
        if (!mesh?.verts.length) break;
        const here = pos.toArray();
        let onto = null;
        if (c.mode === 'NEAREST_VERTEX') {
          let best = Infinity;
          for (const v of mesh.verts) { const d = v3.dist(v, here); if (d < best) { best = d; onto = v; } }
        } else if (c.mode === 'PROJECT') {
          const axis = c.axis ?? '-Z';
          const [moved] = projectOntoMesh([here], mesh, axis.slice(-1), { positive: !axis.startsWith('-'), negative: axis.startsWith('-') });
          if (!v3.dist(moved, here)) break;
          onto = moved;
        } else {
          let best = Infinity;
          for (const tri of triangulateIndices(mesh)) {
            const q = closestOnTriangle(here, mesh.verts[tri[0]], mesh.verts[tri[1]], mesh.verts[tri[2]]);
            const d = v3.dist(q, here);
            if (d < best) { best = d; onto = q; }
          }
        }
        if (!onto) break;
        const away = v3.dist(here, onto);
        const goal = c.distance > 0 && away > 1e-9 ? v3.add(onto, v3.mul(v3.sub(here, onto), c.distance / away)) : onto;
        pos.lerp(new Vector3(...goal), k);
        break;
      }
      case 'ARMATURE': {
        // Follows bones as a skinned vertex would: each bone's change from rest, in the world, weighted.
        const sum = new Array(16).fill(0);
        let total = 0;
        for (const [id, name, weight] of [[c.target, c.subtarget, c.weight ?? 1], [c.target2, c.subtarget2, c.weight2 ?? 0]]) {
          const rig = id ? getObject(doc, id) : null;
          if (!rig || rig.type !== 'ARMATURE' || seen.has(id) || !(weight > 0)) continue;
          const index = rig.data.bones.findIndex((b) => b.name === name);
          if (index < 0) continue;
          const rigWorld = worldMatrix(doc, rig, new Set(seen));
          const change = rigWorld.clone().multiply(armaturePoseMatrices(evaluatedArmature(doc, rig))[index]).multiply(rigWorld.clone().invert());
          change.elements.forEach((x, n) => { sum[n] += x * weight; });
          total += weight;
        }
        if (!total) break;
        const [p2, r2, s2] = [new Vector3(), new Quaternion(), new Vector3()];
        new Matrix4().fromArray(sum.map((x) => x / total)).multiply(new Matrix4().compose(pos, rot, scl)).decompose(p2, r2, s2);
        pos.lerp(p2, k); rot.slerp(r2, k); scl.lerp(s2, k);
        break;
      }
      case 'CAMERA_SOLVER':
      case 'OBJECT_SOLVER': {
        // The camera the clip was solved for, at this frame. An object solver reads the same motion as the object's, seen from a camera that stays put.
        const clip = (doc.clips ?? []).find((x) => x.id === c.clip) ?? (doc.clips ?? []).find((x) => x.solve?.camera?.length);
        const solved = solvedCameraMatrix(clip, doc.frame);
        if (!solved) break;
        let goal = solved;
        if (c.type === 'OBJECT_SOLVER') {
          const cameraObj = getObject(doc, c.camera ?? doc.activeCamera);
          if (!cameraObj || seen.has(cameraObj.id)) break;
          goal = worldMatrix(doc, cameraObj, new Set(seen)).multiply(solved.clone().invert()).multiply(new Matrix4().compose(pos, rot, scl));
        }
        const [p2, r2, s2] = [new Vector3(), new Quaternion(), new Vector3()];
        goal.decompose(p2, r2, s2);
        pos.lerp(p2, k); rot.slerp(r2, k);
        if (c.type === 'OBJECT_SOLVER') scl.lerp(s2, k);
        break;
      }
      case 'FOLLOW_TRACK': {
        // Where the track is seen: at its solved point in 3D, or on the camera's line of sight at a depth.
        const clip = (doc.clips ?? []).find((x) => x.id === c.clip) ?? doc.clips?.[0];
        const index = clip ? clip.tracks.findIndex((x) => x.name === c.track) : -1;
        const track = clip?.tracks[index >= 0 ? index : 0];
        if (!track) break;
        if (c.use3D && clip.solve?.points?.[index >= 0 ? index : 0]) {
          pos.lerp(new Vector3(...clip.solve.points[index >= 0 ? index : 0]), k);
          break;
        }
        const cameraObj = getObject(doc, c.camera ?? doc.activeCamera);
        const point = trackPointAt(track, doc.frame - (clip.start ?? 1));
        if (!cameraObj || cameraObj.type !== 'CAMERA' || seen.has(cameraObj.id) || !point) break;
        pos.lerp(clipPointInWorld(cameraObj.data ?? {}, worldMatrix(doc, cameraObj, new Set(seen)), clip, point, c.depth ?? 10), k);
        break;
      }
      case 'TRANSFORM_CACHE': {
        // A transform read from a file, frame by frame, in place of the object's own.
        const cache = (doc.caches ?? []).find((x) => x.id === c.cache);
        const read = cacheMatrix(cache, c.objectPath, doc.frame);
        if (!read) break;
        const [p2, r2, s2] = [new Vector3(), new Quaternion(), new Vector3()];
        read.decompose(p2, r2, s2);
        pos.lerp(p2, k); rot.slerp(r2, k); scl.lerp(s2, k);
        break;
      }
      case 'LIMIT_ROTATION': {
        const e = new Euler().setFromQuaternion(rot, 'ZYX');
        const limit = (value, use, lo, hi) => (use ? Math.min(hi, Math.max(lo, value * RAD_TO_DEG)) / RAD_TO_DEG : value);
        rot.setFromEuler(new Euler(limit(e.x, c.useX, c.minX, c.maxX), limit(e.y, c.useY, c.minY, c.maxY), limit(e.z, c.useZ, c.minZ, c.maxZ), 'ZYX'));
        break;
      }
      case 'LIMIT_SCALE': scl.set(Math.min(c.max, Math.max(c.min, scl.x)), Math.min(c.max, Math.max(c.min, scl.y)), Math.min(c.max, Math.max(c.min, scl.z))); break;
      case 'LOCKED_TRACK':
        // Turns about its own Z only, until its Y points at the target as nearly as that allows.
        if (t) {
          const local = tp.clone().sub(pos).applyQuaternion(rot.clone().invert());
          const angle = Math.atan2(-local.x, local.y);
          rot.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle * k));
        }
        break;
      case 'STRETCH_TO':
        if (t) {
          const toTarget = tp.clone().sub(pos);
          const distance = toTarget.length();
          if (distance > 1e-9) {
            const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0).applyQuaternion(rot).normalize(), toTarget.clone().normalize());
            rot.premultiply(new Quaternion().slerp(turn, k));
            const stretch = 1 + (distance / Math.max(1e-6, c.rest) - 1) * k;
            const thin = c.volume ? 1 / Math.sqrt(Math.max(1e-6, stretch)) : 1;
            scl.set(scl.x * thin, scl.y * stretch, scl.z * thin);
          }
        }
        break;
      case 'MAINTAIN_VOLUME': {
        const [a, b] = c.axis === 'X' ? [scl.y, scl.z] : c.axis === 'Z' ? [scl.x, scl.y] : [scl.x, scl.z];
        const free = c.volume / Math.max(1e-6, Math.abs(a * b));
        if (c.axis === 'X') scl.x = free; else if (c.axis === 'Z') scl.z = free; else scl.y = free;
        break;
      }
      case 'PIVOT':
        // Its own rotation applied about the target rather than about itself.
        if (t) pos.lerp(tp.clone().add(pos.clone().sub(tp).applyQuaternion(rot)), k);
        break;
      case 'FOLLOW_PATH':
      case 'CLAMP_TO':
        if (t && targetObj?.type === 'CURVE') {
          const line = curvePoints(doc, targetObj, t);
          if (line.length < 2) break;
          if (c.type === 'CLAMP_TO') {
            let best = line[0];
            let bestD = Infinity;
            for (let i = 0; i + 1 < line.length; i++) {
              const [a, b] = [new Vector3(...line[i]), new Vector3(...line[i + 1])];
              const along = Math.max(0, Math.min(1, pos.clone().sub(a).dot(b.clone().sub(a)) / Math.max(1e-12, b.distanceToSquared(a))));
              const q = a.lerp(b, along);
              const d = q.distanceToSquared(pos);
              if (d < bestD) { bestD = d; best = q.toArray(); }
            }
            pos.lerp(new Vector3(...best), k);
            break;
          }
          const lengths = [0];
          for (let i = 0; i + 1 < line.length; i++) lengths.push(lengths[i] + new Vector3(...line[i]).distanceTo(new Vector3(...line[i + 1])));
          const wanted = Math.max(0, Math.min(1, c.offset)) * lengths.at(-1);
          let i = 0;
          while (i + 2 < lengths.length && lengths[i + 1] < wanted) i++;
          const span = lengths[i + 1] - lengths[i] || 1;
          const [a, b] = [new Vector3(...line[i]), new Vector3(...line[i + 1])];
          pos.lerp(a.clone().lerp(b, (wanted - lengths[i]) / span), k);
          if (c.followCurve) rot.slerp(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()), k);
        }
        break;
      default:
    }
    m = new Matrix4().compose(pos, rot, scl);
  }
  return m;
}

export function worldPosition(doc, obj) {
  const p = new Vector3().setFromMatrixPosition(worldMatrix(doc, obj));
  return [p.x, p.y, p.z];
}

// ─────────────── frames

/** Sets the frame: keyframes on every object and material, then drivers, then baked simulation caches. */
export function setFrame(doc, frame) {
  doc.frame = frame;
  applyAnimation(doc, frame);
  for (const m of doc.materials) applyAnimation(m, frame);
  applyAnimation(doc.world, frame);
  for (const obj of doc.objects) {
    if (obj.anim) applyAnimation(obj, frame);
    if (obj.data?.anim) applyAnimation(obj.data, frame);
    for (const d of obj.drivers ?? []) evaluateDriver(doc, obj, d);
    const baked = obj.cache?.transform?.[frame];
    if (baked) {
      obj.location = [...baked.location];
      if (baked.rotation) obj.rotation = [...baked.rotation];
    }
  }
  return doc;
}

export function evaluateDriver(doc, obj, driver) {
  const vars = { frame: doc.frame };
  for (const v of driver.variables ?? []) {
    const source = getObject(doc, v.object);
    const value = source ? getPath(source, v.path) ?? 0 : 0;
    vars[v.name] = typeof value === 'number' ? value : 0;
  }
  const type = driver.type ?? 'SCRIPTED';
  let value;
  if (type === 'SCRIPTED') {
    value = evalDriver(driver.expression, vars);
  } else {
    const list = (driver.variables ?? []).map((v) => vars[v.name]);
    if (!list.length) value = null;
    else if (type === 'SUM') value = list.reduce((a, b) => a + b, 0);
    else if (type === 'AVERAGE') value = list.reduce((a, b) => a + b, 0) / list.length;
    else if (type === 'MIN') value = Math.min(...list);
    else value = Math.max(...list);
  }
  driver._error = value == null;
  if (value != null) setPath(obj, driver.path, value);
}

/** An armature's data with its live IK solved for the current positions of the targets. */
export function evaluatedArmature(doc, obj) {
  const inverse = new Matrix4().copy(worldMatrix(doc, obj)).invert();
  return solvedArmature(obj.data, (id) => {
    const other = getObject(doc, id);
    if (!other) return null;
    const p = new Vector3().setFromMatrixPosition(worldMatrix(doc, other)).applyMatrix4(inverse);
    return [p.x, p.y, p.z];
  }, (id, boneName, wantRest = false) => {
    // Its own bones are read from the pose being worked out; anything else is in this armature's space. Another armature's bone counts as posed without its constraints.
    if (id === obj.id) return null;
    const other = getObject(doc, id);
    if (!other) return null;
    const world = worldMatrix(doc, other);
    if (boneName && other.type === 'ARMATURE') {
      const index = other.data.bones.findIndex((b) => b.name === boneName);
      if (index >= 0) return inverse.clone().multiply(world).multiply(wantRest ? restBoneMatrix(other.data.bones[index]) : bonePoseMatrices(other.data)[index]);
    }
    return inverse.clone().multiply(world);
  }, (id) => {
    const other = getObject(doc, id);
    return other?.type === 'CURVE' ? curvePoints(doc, other, inverse.clone().multiply(worldMatrix(doc, other))) : null;
  }, worldMatrix(doc, obj), {
    actionOf: (id) => doc.actions?.find((a) => a.id === id) ?? null,
    // Local space: an object's own transform, or another armature's bone relative to its rest. This armature's own bones are read in the solve.
    localOf: (id, boneName) => {
      const other = getObject(doc, id);
      if (!other) return null;
      if (boneName && other.type === 'ARMATURE') {
        if (other.id === obj.id) return null;
        const index = other.data.bones.findIndex((b) => b.name === boneName);
        if (index >= 0) return boneLocalMatrix(other.data, index);
      }
      return localMatrix(other);
    },
  });
}

// ─────────────── evaluated geometry

/** A mesh's vertices moved into another object's local space (for Boolean and Shrinkwrap). */
function meshInSpaceOf(doc, otherId, space, ctxFrame, seen) {
  const other = getObject(doc, otherId);
  if (!other || other.type !== 'MESH' || seen.has(otherId)) return null;
  const mesh = evaluatedMesh(doc, other, { frame: ctxFrame, seen: new Set([...seen, otherId]) });
  if (!mesh) return null;
  const toLocal = new Matrix4().copy(space).invert().multiply(worldMatrix(doc, other));
  const p = new Vector3();
  return { ...mesh, verts: mesh.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(toLocal); return [p.x, p.y, p.z]; }) };
}

/** What an object looks like after shape keys and modifiers. */
export function evaluatedMesh(doc, obj, { frame = doc.frame, render = false, seen = new Set([obj.id]) } = {}) {
  if (obj.type === 'CURVE') return obj.data ? curveToMesh(obj.data) : null;
  if (obj.type === 'TEXT') return obj.data ? textToMesh(obj.data) : null;
  if (obj.type === 'META') return obj.data ? metaballToMesh(obj.data) : null;
  if (obj.type === 'SURFACE') return obj.data ? surfaceToMesh(obj.data) : null;
  if (obj.type !== 'MESH' || !obj.data) return null;
  if (obj.fluid && simBaked(obj)) {
    // A baked liquid domain is the liquid: its surface comes in world space, and the object's matrix is taken out again.
    const inverse = new Matrix4().copy(worldMatrix(doc, obj)).invert();
    const p = new Vector3();
    const surface = liquidMeshAt(doc, obj, frame);
    return { ...surface, verts: surface.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(inverse); return [p.x, p.y, p.z]; }), uvs: null };
  }
  // A baked cloth, or a point cache read from a file (held from its last frame before this one).
  const points = obj.cache?.points;
  const held = points ? points[frame] ?? points[Math.max(...Object.keys(points).map(Number).filter((f) => f <= frame), Math.min(...Object.keys(points).map(Number)))] : null;
  const clothFrame = obj.cache?.cloth?.[frame] ?? held;
  const source = clothFrame ? { ...obj.data, verts: clothFrame } : obj.data;
  const space = worldMatrix(doc, obj);
  return evaluateMesh(source, obj.modifiers ?? [], {
    frame,
    fps: doc.fps,
    meshInLocal: (id) => meshInSpaceOf(doc, id, space, frame, seen),
    latticeInLocal: (id) => {
      const lat = getObject(doc, id);
      if (!lat || lat.type !== 'LATTICE') return null;
      const toLocal = new Matrix4().copy(space).invert().multiply(worldMatrix(doc, lat));
      const p = new Vector3();
      const move = (list) => list.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(toLocal); return [p.x, p.y, p.z]; });
      return { res: lat.data.res, rest: move(lat.data.rest), points: move(lat.data.points) };
    },
    deformByArmature: (mesh, id) => {
      const arm = getObject(doc, id);
      if (!arm || arm.type !== 'ARMATURE') return mesh;
      return deformByArmature(mesh, armaturePoseMatrices(evaluatedArmature(doc, arm)), space, worldMatrix(doc, arm));
    },
    evalGeometryNodes: (mesh, mod) => evalGeometryNodes(mod.graph, mesh, { frame, doc }),
    beforeAll: obj.dynamicPaint?.role === 'CANVAS' && obj.dynamicPaint.surface === 'WEIGHT' ? (mesh) => applyDynamicPaint(obj, mesh, frame) : null,
    afterAll: obj.dynamicPaint?.role === 'CANVAS' && obj.dynamicPaint.surface !== 'WEIGHT' ? (mesh) => applyDynamicPaint(obj, mesh, frame) : null,
  }, { render });
}

/** Curve data: { splines: [{ points: [[x,y,z]…], cyclic, kind:'BEZIER'|'POLY' }], bevelDepth, resolution }. */
export function curveToMesh(curve) {
  const mesh = createMesh();
  const depth = curve.bevelDepth ?? 0;
  const ringSteps = 8;
  // A filled 2D curve: its closed splines become faces in the XY plane, a spline inside an odd number of others a hole.
  if (curve.fill && depth <= 0) return fillCurve(curve);
  for (const spline of curve.splines ?? []) {
    const pts = sampleSpline(spline, curve.resolution ?? 12);
    if (pts.length < 2) continue;
    const base = mesh.verts.length;
    if (depth <= 0) {
      for (const p of pts) mesh.verts.push(p);
      for (let i = 0; i < pts.length - 1; i++) mesh.loose.push([base + i, base + i + 1]);
      if (spline.cyclic) mesh.loose.push([base + pts.length - 1, base]);
      continue;
    }
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[spline.cyclic ? (i + n - 1) % n : Math.max(0, i - 1)];
      const next = pts[spline.cyclic ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const t = v3.norm(v3.sub(next, prev));
      const ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const u = v3.norm(v3.cross(ref, t));
      const w = v3.cross(t, u);
      for (let k = 0; k < ringSteps; k++) {
        const a = (k / ringSteps) * Math.PI * 2;
        mesh.verts.push(v3.add(pts[i], v3.add(v3.mul(u, Math.cos(a) * depth), v3.mul(w, Math.sin(a) * depth))));
      }
    }
    const segs = spline.cyclic ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      for (let k = 0; k < ringSteps; k++) {
        const l = (k + 1) % ringSteps;
        mesh.faces.push([base + i * ringSteps + k, base + i * ringSteps + l, base + j * ringSteps + l, base + j * ringSteps + k]);
      }
    }
    if (!spline.cyclic) {
      mesh.faces.push(Array.from({ length: ringSteps }, (_, k) => base + ringSteps - 1 - k));
      mesh.faces.push(Array.from({ length: ringSteps }, (_, k) => base + (n - 1) * ringSteps + k));
    }
  }
  mesh.smooth = true;
  return mesh;
}

/** The faces of a filled 2D curve (Blender's fill: both sides, even-odd holes). Splines that are not closed stay out. */
export function fillCurve(curve) {
  const mesh = createMesh();
  const rings = [];
  for (const spline of curve.splines ?? []) {
    if (!spline.cyclic) continue;
    const pts = sampleSpline(spline, curve.resolution ?? 12);
    const ring = pts.filter((q, i) => { const r = pts[(i + 1) % pts.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 1e-9; });
    if (ring.length >= 3) rings.push(ring);
  }
  const inside = (pt, ring) => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [a, b] = [ring[i], ring[j]];
      if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  const area = (ring) => ring.reduce((s, q, i) => { const r = ring[(i + 1) % ring.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
  const parents = rings.map((ring, i) => rings.map((other, j) => (j !== i && Math.abs(area(other)) > Math.abs(area(ring)) && inside(ring[0], other) ? j : -1)).filter((j) => j >= 0));
  for (let i = 0; i < rings.length; i++) {
    if (parents[i].length % 2) continue;
    // Holes: rings directly inside this one (one level deeper).
    const holes = rings.filter((_, j) => parents[j].length === parents[i].length + 1 && parents[j].includes(i));
    const to2 = (ring) => ring.map((q) => new Vector2(q[0], q[1]));
    const contour = to2(rings[i]);
    const holes2 = holes.map(to2);
    const base = mesh.verts.length;
    const all = [rings[i], ...holes].flat();
    for (const q of all) mesh.verts.push([q[0], q[1], q[2] ?? 0]);
    for (const tri of ShapeUtils.triangulateShape(contour, holes2)) mesh.faces.push([base + tri[0], base + tri[1], base + tri[2]]);
  }
  return mesh;
}

/** Points along a spline; BEZIER is a Catmull-Rom path through the control points. */
export function sampleSpline(spline, resolution = 12) {
  const p = spline.points;
  // Bézier points with their own handles (from an SVG file): cubic segments, `resolution` steps each, as Blender draws them.
  if (spline.handles?.length === p.length && p.length >= 2) {
    const n = p.length;
    const out = [];
    const segs = spline.cyclic ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const [a, b, c, d] = [p[i], spline.handles[i][1], spline.handles[j][0], p[j]];
      for (let s = 0; s < resolution; s++) {
        const t = s / resolution;
        const u = 1 - t;
        out.push([0, 1, 2].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]));
      }
    }
    if (!spline.cyclic) out.push([...p[n - 1]]);
    return out;
  }
  if (spline.kind !== 'BEZIER' || p.length < 3) return p.map((q) => [...q]);
  const n = p.length;
  const out = [];
  const at = (i) => (spline.cyclic ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  const segs = spline.cyclic ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < resolution; s++) {
      const t = s / resolution;
      const [t2, t3] = [t * t, t * t * t];
      out.push([0, 1, 2].map((k) => 0.5 * (2 * b[k] + (c[k] - a[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * t3)));
    }
  }
  if (!spline.cyclic) out.push([...p[n - 1]]);
  return out;
}

export function worldBounds(doc, objects) {
  const pts = [];
  const p = new Vector3();
  for (const obj of objects) {
    const m = worldMatrix(doc, obj);
    if (GEOMETRY_TYPES.has(obj.type) && obj.data) {
      const mesh = evaluatedMesh(doc, obj);
      if (mesh?.verts.length) {
        const box = boundingBox(mesh.verts);
        for (let i = 0; i < 8; i++) {
          p.set(i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]).applyMatrix4(m);
          pts.push([p.x, p.y, p.z]);
        }
        continue;
      }
    }
    p.setFromMatrixPosition(m);
    pts.push([p.x, p.y, p.z]);
  }
  return boundingBox(pts);
}

// ─────────────── save, load, statistics

/** The file text. Run-time keys ("_…") stay out. */
/**
 * Brings every object of another document into this one (File › Append): fresh ids, with materials, images and the references
 * between them kept. They land in a new collection named after the source. Returns the new objects.
 */
export function appendDocument(doc, other, { name = 'Appended', only = null } = {}) {
  const chosen = other.objects.filter((o) => !only || only.includes(o.name));
  const collection = { id: newId('col'), name, parent: 'col_root', hide: false, exclude: false };
  doc.collections.push(collection);
  const remap = new Map();
  const seen = new Set();
  const carry = (list, target, prefix, used) => {
    for (const item of list) {
      if (!used.has(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      const copy = structuredClone(item);
      copy.id = newId(prefix);
      remap.set(item.id, copy.id);
      target.push(copy);
    }
  };
  const usedMaterials = new Set(chosen.flatMap((o) => o.materials ?? []).filter(Boolean));
  const usedImages = new Set();
  for (const m of other.materials) if (usedMaterials.has(m.id)) for (const n of m.nodes?.nodes ?? []) if (n.values?.image) usedImages.add(n.values.image);
  carry(other.images ?? [], doc.images, 'img', usedImages);
  carry(other.materials ?? [], doc.materials, 'mat', usedMaterials);
  for (const m of doc.materials) for (const n of m.nodes?.nodes ?? []) if (remap.has(n.values?.image)) n.values.image = remap.get(n.values.image);
  const added = [];
  for (const source of chosen) {
    const { id, name: objectName, ...rest } = structuredClone(source);
    const obj = addObject(doc, { ...rest, name: objectName, collection: collection.id });
    remap.set(id, obj.id);
    added.push(obj);
  }
  // Only now are all the new ids known: parents, modifier targets and constraint targets can follow.
  for (const obj of added) {
    obj.parent = remap.get(obj.parent) ?? null;
    if (!obj.parent) delete obj.parentInverse;
    obj.materials = (obj.materials ?? []).map((m) => remap.get(m) ?? null);
    for (const list of [obj.modifiers, obj.constraints]) for (const item of list ?? []) {
      for (const key of ['object', 'target']) if (item[key] != null) item[key] = remap.get(item[key]) ?? null;
    }
  }
  return added;
}

export function serialize(doc) {
  return JSON.stringify(doc, (key, value) => (key.startsWith('_') ? undefined : value));
}

export function deserialize(text) {
  const doc = JSON.parse(text);
  if (doc?.format !== FORMAT) throw new Error('This is not a My3DBlender file.');
  if (doc.version > FORMAT_VERSION) throw new Error(`This file was saved by a newer version (${doc.version}).`);
  // Files saved before a field existed read as a fresh document's defaults.
  const base = createDocument();
  for (const key of Object.keys(base)) if (doc[key] === undefined) doc[key] = base[key];
  return doc;
}

export function sceneStats(doc) {
  const stats = { objects: 0, verts: 0, faces: 0, tris: 0 };
  for (const obj of doc.objects) {
    if (!isVisible(doc, obj)) continue;
    stats.objects++;
    const mesh = evaluatedMesh(doc, obj);
    if (!mesh) continue;
    stats.verts += mesh.verts.length;
    stats.faces += mesh.faces.length;
    stats.tris += toTriangles(mesh).triFace.length;
  }
  return stats;
}
