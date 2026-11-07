// The scene document: objects, collections, materials, world, timeline and render settings. Plain JSON-able data;
// keys starting with "_" are run-time only and never saved. No DOM here.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { applyAnimation, evalDriver, getPath, setPath } from './anim.js';
import { boundingBox, cubeMesh, createMesh, toTriangles, v3 } from './mesh.js';
import { evaluateMesh } from './modifiers.js';
import { armaturePoseMatrices, deformByArmature, solvedArmature } from './armature.js';
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
    objects: [], materials: [], images: [], texts: [], palettes: [], clips: [],
    collections: [{ id: 'col_root', name: 'Scene Collection', parent: null, hide: false, exclude: false }],
    activeCollection: 'col_root',
    activeId: null, selected: [], mode: 'OBJECT', cursor: [0, 0, 0], activeCamera: null,
    proportional: { enabled: false, size: 1, falloff: 'SMOOTH', connected: false },
    snap: defaultSnap(),
    scenes: [{ id: 'scene_1', name: 'Scene', state: null }], activeScene: 'scene_1', nodeGroups: [],
    frame: 1, frameStart: 1, frameEnd: 250, fps: 24, frameStep: 1, markers: [],
    gravity: [0, 0, -9.81], unitScale: 1, unitSystem: 'METRIC',
    world: { color: [0.05, 0.05, 0.05], strength: 1, useNodes: false, nodes: null },
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
    rigidBody: null, cloth: null, softBody: null, field: null, collision: null, particles: [], cache: {},
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
};

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
  const clothFrame = obj.cache?.cloth?.[frame];
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
    afterAll: obj.dynamicPaint?.role === 'CANVAS' ? (mesh) => applyDynamicPaint(obj, mesh, frame) : null,
  }, { render });
}

/** Curve data: { splines: [{ points: [[x,y,z]…], cyclic, kind:'BEZIER'|'POLY' }], bevelDepth, resolution }. */
export function curveToMesh(curve) {
  const mesh = createMesh();
  const depth = curve.bevelDepth ?? 0;
  const ringSteps = 8;
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

/** Points along a spline; BEZIER is a Catmull-Rom path through the control points. */
export function sampleSpline(spline, resolution = 12) {
  const p = spline.points;
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
