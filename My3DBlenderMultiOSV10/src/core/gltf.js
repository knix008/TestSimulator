// glTF 2.0 as a scene: node hierarchy, materials with textures, skins, animation, morph targets, cameras and lights, in both directions.
// (io.js keeps the plain list of world-space meshes that the simple paths use.) glTF is Y up and this program Z up, so every transform
// is carried across by C, and vertices with it. Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { insertKey } from './anim.js';
import { bonePoseMatrices, createBone, restBoneMatrix } from './armature.js';
import { GEOMETRY_TYPES, addObject, defaultCamera, defaultLight, defaultMaterial, evaluatedArmature, evaluatedMesh, getMaterial, getObject, isVisible, localMatrix, setFrame, worldMatrix } from './doc.js';
import { createMesh, toTriangles } from './mesh.js';
import { addLink, createNode, defaultShaderGraph } from './nodes.js';

const DEG = Math.PI / 180;
// Z up to Y up: (x, y, z) goes to (x, z, -y).
const C = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const CI = new Matrix4().copy(C).invert();
const toY = (m) => new Matrix4().multiplyMatrices(C, m).multiply(CI);
const toZ = (m) => new Matrix4().multiplyMatrices(CI, m).multiply(C);
const vecY = (x, y, z) => [x, z, -y];
const vecZ = (x, y, z) => [x, -z, y];

const base64 = (bytes) => {
  if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); }
  return Buffer.from(bytes).toString('base64');
};
const unbase64 = (text) => (typeof atob === 'function' ? Uint8Array.from(atob(text), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(text, 'base64')));

/** The world up to a node as location, rotation and scale in glTF's own list form. */
function trs(m) {
  const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
  m.decompose(p, q, s);
  return { translation: p.toArray(), rotation: [q.x, q.y, q.z, q.w], scale: s.toArray() };
}

// ─────────────── writing

class Writer {
  constructor() {
    this.chunks = [];
    this.offset = 0;
    this.json = { asset: { version: '2.0', generator: 'My3DBlender' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], bufferViews: [], accessors: [] };
  }

  view(bytes, target) {
    this.json.bufferViews.push({ buffer: 0, byteOffset: this.offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    const pad = (4 - (bytes.length % 4)) % 4;
    this.chunks.push(bytes);
    if (pad) this.chunks.push(new Uint8Array(pad));
    this.offset += bytes.length + pad;
    return this.json.bufferViews.length - 1;
  }

  accessor(typed, type, componentType, { target, normalized = false, bounds = false } = {}) {
    const per = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const count = typed.length / per;
    const a = { bufferView: this.view(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), target), componentType, count, type };
    if (normalized) a.normalized = true;
    if (bounds && count) {
      a.min = new Array(per).fill(Infinity);
      a.max = new Array(per).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let k = 0; k < per; k++) { a.min[k] = Math.min(a.min[k], typed[i * per + k]); a.max[k] = Math.max(a.max[k], typed[i * per + k]); }
    }
    this.json.accessors.push(a);
    return this.json.accessors.length - 1;
  }

  finish() {
    const { json } = this;
    json.buffers = [{ byteLength: this.offset }];
    for (const key of ['materials', 'textures', 'images', 'samplers', 'meshes', 'skins', 'animations', 'cameras']) if (json[key] && !json[key].length) delete json[key];
    const text = new TextEncoder().encode(JSON.stringify(json));
    const jsonPad = (4 - (text.length % 4)) % 4;
    const total = 12 + 8 + text.length + jsonPad + 8 + this.offset;
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, text.length + jsonPad, true);
    view.setUint32(16, 0x4e4f534a, true);
    out.set(text, 20);
    out.fill(0x20, 20 + text.length, 20 + text.length + jsonPad);
    let at = 20 + text.length + jsonPad;
    view.setUint32(at, this.offset, true);
    view.setUint32(at + 4, 0x004e4942, true);
    at += 8;
    for (const chunk of this.chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }
}

function materialTexture(mat, doc) {
  if (!mat?.useNodes || !mat.nodes) return null;
  const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
  if (!bsdf) return null;
  const link = mat.nodes.links.find((l) => l.to === bsdf.id && l.in === 'Base Color');
  const node = link && mat.nodes.nodes.find((n) => n.id === link.from && n.type === 'TEX_IMAGE');
  return node?.values?.image ? (doc.images ?? []).find((im) => im.id === node.values.image) ?? null : null;
}

/** The whole scene (or the selected objects) as a GLB file. */
export function exportGLTFScene(doc, { selectedOnly = false } = {}) {
  const w = new Writer();
  const { json } = w;
  json.materials = [];
  json.meshes = [];
  json.images = [];
  json.textures = [];
  json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  json.skins = [];
  json.animations = [];
  json.cameras = [];
  const lights = [];
  const usable = (o) => isVisible(doc, o) && (!selectedOnly || doc.selected.includes(o.id)) && (GEOMETRY_TYPES.has(o.type) || ['EMPTY', 'ARMATURE', 'CAMERA', 'LIGHT'].includes(o.type));
  const objects = doc.objects.filter(usable);
  const nodeOf = new Map();
  const jointsOf = new Map(); // armature id to the node index of each bone

  const materialIndex = new Map();
  const imageIndex = new Map();
  const textureFor = (image) => {
    if (imageIndex.has(image.id)) return imageIndex.get(image.id);
    const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(image.dataUrl ?? '');
    if (!match) return null;
    json.images.push({ name: image.name, mimeType: match[1], bufferView: w.view(unbase64(match[2])) });
    json.textures.push({ source: json.images.length - 1, sampler: 0 });
    imageIndex.set(image.id, json.textures.length - 1);
    return json.textures.length - 1;
  };
  const materialFor = (id) => {
    const m = getMaterial(doc, id);
    if (!m) return undefined;
    if (materialIndex.has(id)) return materialIndex.get(id);
    const bsdf = m.useNodes ? m.nodes?.nodes?.find((n) => n.type === 'BSDF_PRINCIPLED')?.values : null;
    const color = bsdf?.['Base Color'] ?? m.baseColor;
    const alpha = m.alpha ?? 1;
    const out = {
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: [color[0], color[1], color[2], alpha], metallicFactor: bsdf?.Metallic ?? m.metallic ?? 0, roughnessFactor: bsdf?.Roughness ?? m.roughness ?? 0.5 },
      doubleSided: true,
    };
    const image = materialTexture(m, doc);
    const texture = image ? textureFor(image) : null;
    if (texture != null) { out.pbrMetallicRoughness.baseColorTexture = { index: texture }; out.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, alpha]; }
    const e = m.emission ?? [0, 0, 0];
    if (e.some((x) => x > 0)) out.emissiveFactor = e.map((x) => Math.min(1, x * (m.emissionStrength ?? 1)));
    if (alpha < 1) out.alphaMode = 'BLEND';
    json.materials.push(out);
    materialIndex.set(id, json.materials.length - 1);
    return json.materials.length - 1;
  };

  // The nodes first, so that parents can be found.
  const localOf = (o) => {
    let m = localMatrix(o);
    const parent = o.parent ? objects.find((x) => x.id === o.parent) : null;
    if (parent && o.parentInverse) m = new Matrix4().fromArray(o.parentInverse).multiply(m);
    // A parent left out of the file: the object keeps its place in the world.
    if (o.parent && !parent) m = worldMatrix(doc, o);
    return m;
  };
  const nodeMatrix = (o) => {
    const y = toY(localOf(o));
    // Cameras and lights look down their own -Z with Y up in both systems, so they turn with the world but not in themselves.
    return o.type === 'CAMERA' || o.type === 'LIGHT' ? y.multiply(C) : y;
  };
  for (const o of objects) {
    json.nodes.push({ name: o.name, ...trs(nodeMatrix(o)) });
    nodeOf.set(o.id, json.nodes.length - 1);
  }
  for (const o of objects) {
    const index = nodeOf.get(o.id);
    const parent = o.parent ? nodeOf.get(o.parent) : null;
    if (parent != null) (json.nodes[parent].children ??= []).push(index);
    else json.scenes[0].nodes.push(index);
  }

  // Bones: a node each, under the armature's node or their parent bone.
  for (const o of objects) {
    if (o.type !== 'ARMATURE') continue;
    const bones = o.data.bones;
    const rest = bones.map((b) => restBoneMatrix(b));
    const list = bones.map((b, i) => {
      const parent = b.parent != null ? new Matrix4().copy(toY(rest[b.parent])).invert() : new Matrix4();
      json.nodes.push({ name: b.name, ...trs(parent.multiply(toY(rest[i]))) });
      return json.nodes.length - 1;
    });
    bones.forEach((b, i) => {
      const parent = b.parent != null ? list[b.parent] : nodeOf.get(o.id);
      (json.nodes[parent].children ??= []).push(list[i]);
    });
    jointsOf.set(o.id, list);
  }

  // Geometry
  for (const o of objects) {
    const node = json.nodes[nodeOf.get(o.id)];
    if (o.type === 'CAMERA') {
      const c = o.data ?? defaultCamera();
      const aspect = (doc.render?.width ?? 16) / (doc.render?.height ?? 9);
      const xfov = 2 * Math.atan((c.sensor ?? 36) / (2 * (c.lens ?? 50)));
      json.cameras.push({ type: 'perspective', perspective: { aspectRatio: aspect, yfov: 2 * Math.atan(Math.tan(xfov / 2) / aspect), znear: c.clipStart ?? 0.1, zfar: c.clipEnd ?? 1000 } });
      node.camera = json.cameras.length - 1;
      continue;
    }
    if (o.type === 'LIGHT') {
      const l = o.data ?? defaultLight();
      const type = l.kind === 'SUN' ? 'directional' : l.kind === 'SPOT' ? 'spot' : 'point';
      lights.push({
        name: o.name, type, color: l.color,
        intensity: type === 'directional' ? l.energy : (l.energy * 683) / (4 * Math.PI),
        ...(type === 'spot' ? { spot: { outerConeAngle: ((l.spotSize ?? 45) * DEG) / 2, innerConeAngle: (((l.spotSize ?? 45) * DEG) / 2) * (1 - (l.spotBlend ?? 0)) } } : {}),
      });
      node.extensions = { KHR_lights_punctual: { light: lights.length - 1 } };
      continue;
    }
    if (!GEOMETRY_TYPES.has(o.type)) continue;
    // A skinned mesh is written as it rests; the skin does the rest in the reader.
    const armatureMod = o.type === 'MESH' ? o.modifiers.find((m) => m.type === 'ARMATURE' && jointsOf.has(m.object)) : null;
    let source = armatureMod ? { ...o, modifiers: o.modifiers.filter((m) => m !== armatureMod) } : o;
    // Shape keys travel as morph targets over the base shape, not mixed into it.
    if (o.type === 'MESH' && !source.modifiers.length && o.data.shapeKeys?.length) source = { ...source, data: { ...o.data, shapeKeys: [] } };
    const mesh = evaluatedMesh(doc, source, { render: true });
    if (!mesh?.verts?.length || !mesh.faces.length) continue;
    const tri = toTriangles(mesh);
    const count = tri.positions.length / 3;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set(vecY(tri.positions[i * 3], tri.positions[i * 3 + 1], tri.positions[i * 3 + 2]), i * 3);
      nor.set(vecY(tri.normals[i * 3], tri.normals[i * 3 + 1], tri.normals[i * 3 + 2]), i * 3);
    }
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) { uv[i * 2] = tri.uvs[i * 2]; uv[i * 2 + 1] = 1 - tri.uvs[i * 2 + 1]; }
    const attributes = {
      POSITION: w.accessor(pos, 'VEC3', 5126, { target: 34962, bounds: true }),
      NORMAL: w.accessor(nor, 'VEC3', 5126, { target: 34962 }),
      TEXCOORD_0: w.accessor(uv, 'VEC2', 5126, { target: 34962 }),
    };
    if (armatureMod) {
      const arm = getObject(doc, armatureMod.object);
      const names = arm.data.bones.map((b) => b.name);
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const v = tri.corners[i];
        const here = (mesh.vgroups ?? []).map((g) => [names.indexOf(g.name), g.w[v] ?? 0]).filter(([j, value]) => j >= 0 && value > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = here.reduce((s, x) => s + x[1], 0) || 1;
        here.forEach(([j, value], k) => { joints[i * 4 + k] = j; weights[i * 4 + k] = value / sum; });
        if (!here.length) weights[i * 4] = 1;
      }
      attributes.JOINTS_0 = w.accessor(joints, 'VEC4', 5123, { target: 34962 });
      attributes.WEIGHTS_0 = w.accessor(weights, 'VEC4', 5126, { target: 34962 });
      // From the mesh's own coordinates into each bone's.
      const meshWorld = toY(worldMatrix(doc, o));
      const armWorld = toY(worldMatrix(doc, arm));
      const inverseBind = new Float32Array(names.length * 16);
      arm.data.bones.forEach((b, j) => {
        const joint = new Matrix4().multiplyMatrices(armWorld, toY(restBoneMatrix(b)));
        inverseBind.set(joint.invert().multiply(meshWorld).elements, j * 16);
      });
      json.skins.push({ joints: jointsOf.get(arm.id), inverseBindMatrices: w.accessor(inverseBind, 'MAT4', 5126), skeleton: nodeOf.get(arm.id) });
      node.skin = json.skins.length - 1;
    }
    // One primitive per material slot in use.
    const slots = new Map();
    tri.triMat.forEach((slot, t) => { if (!slots.has(slot)) slots.set(slot, []); slots.get(slot).push(t * 3, t * 3 + 1, t * 3 + 2); });
    const primitives = [...slots.entries()].map(([slot, indices]) => ({
      attributes,
      indices: w.accessor(Uint32Array.from(indices), 'SCALAR', 5125, { target: 34963 }),
      ...(o.materials[slot] != null ? { material: materialFor(o.materials[slot]) } : {}),
    }));
    // Morph targets: only when the shape keys can be mapped onto the same vertices.
    const keys = o.type === 'MESH' && !o.modifiers.length ? o.data.shapeKeys ?? [] : [];
    const out = { name: o.name, primitives };
    if (keys.length) {
      const targets = keys.map((key) => {
        const delta = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          const v = tri.corners[i];
          const [b, k] = [o.data.verts[v], key.verts[v] ?? o.data.verts[v]];
          delta.set(vecY(k[0] - b[0], k[1] - b[1], k[2] - b[2]), i * 3);
        }
        return { POSITION: w.accessor(delta, 'VEC3', 5126, { target: 34962, bounds: true }) };
      });
      for (const p of primitives) p.targets = targets;
      out.weights = keys.map((k) => k.value ?? 0);
      out.extras = { targetNames: keys.map((k) => k.name) };
    }
    json.meshes.push(out);
    node.mesh = json.meshes.length - 1;
  }

  // Animation: sampled on every frame between the first and last key, which carries constraints, drivers and curve modifiers across too.
  const keyed = (a) => Object.values(a?.fcurves ?? {}).flat().map((k) => k.f);
  const frames = objects.flatMap((o) => [...keyed(o.anim), ...keyed(o.data?.anim)]);
  const hasNla = objects.some((o) => o.anim?.nla?.length);
  if (frames.length || hasNla) {
    const start = Math.floor(frames.length ? Math.min(...frames) : doc.frameStart);
    const end = Math.ceil(frames.length ? Math.max(...frames) : doc.frameEnd);
    const back = doc.frame;
    const animated = objects.filter((o) => o.anim && (Object.keys(o.anim.fcurves ?? {}).length || o.anim.nla?.length));
    const rigs = objects.filter((o) => o.type === 'ARMATURE' && (Object.keys(o.data.anim?.fcurves ?? {}).length || o.data.bones.some((b) => b.ik?.target)));
    const samples = new Map();
    const count = end - start + 1;
    const track = (node) => { if (!samples.has(node)) samples.set(node, { t: [], r: [], s: [] }); return samples.get(node); };
    const put = (node, m) => { const s = track(node); const parts = trs(m); s.t.push(...parts.translation); s.r.push(...parts.rotation); s.s.push(...parts.scale); };
    for (let f = start; f <= end; f++) {
      setFrame(doc, f);
      for (const o of animated) put(nodeOf.get(o.id), nodeMatrix(o));
      for (const o of rigs) {
        const pose = bonePoseMatrices(evaluatedArmature(doc, o));
        o.data.bones.forEach((b, i) => {
          const parent = b.parent != null ? new Matrix4().copy(toY(pose[b.parent])).invert() : new Matrix4();
          put(jointsOf.get(o.id)[i], parent.multiply(toY(pose[i])));
        });
      }
    }
    setFrame(doc, back);
    if (samples.size) {
      const times = new Float32Array(count);
      for (let i = 0; i < count; i++) times[i] = i / (doc.fps || 24);
      const input = w.accessor(times, 'SCALAR', 5126, { bounds: true });
      const animation = { name: 'Action', samplers: [], channels: [] };
      for (const [node, s] of samples) {
        for (const [path, values, type] of [['translation', s.t, 'VEC3'], ['rotation', s.r, 'VEC4'], ['scale', s.s, 'VEC3']]) {
          animation.samplers.push({ input, output: w.accessor(Float32Array.from(values), type, 5126), interpolation: 'LINEAR' });
          animation.channels.push({ sampler: animation.samplers.length - 1, target: { node, path } });
        }
      }
      json.animations.push(animation);
    }
  }
  if (lights.length) {
    json.extensionsUsed = ['KHR_lights_punctual'];
    json.extensions = { KHR_lights_punctual: { lights } };
  }
  return w.finish();
}

// ─────────────── reading

const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function parseContainer(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let json;
  let bin = null;
  if (data.length > 12 && view.getUint32(0, true) === 0x46546c67) {
    let at = 12;
    while (at + 8 <= data.length) {
      const length = view.getUint32(at, true);
      const type = view.getUint32(at + 4, true);
      const body = data.subarray(at + 8, at + 8 + length);
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
      else if (type === 0x004e4942) bin = body;
      at += 8 + length;
    }
  } else json = JSON.parse(new TextDecoder().decode(data));
  if (!json?.asset) throw new Error('Not a glTF file');
  for (const needed of json.extensionsRequired ?? []) if (needed === 'KHR_draco_mesh_compression' || needed === 'EXT_meshopt_compression') throw new Error(`This glTF uses ${needed}, which cannot be read: export it without compression.`);
  const buffers = (json.buffers ?? []).map((b, i) => {
    if (b.uri?.startsWith('data:')) return unbase64(b.uri.slice(b.uri.indexOf(',') + 1));
    if (b.uri) throw new Error(`This .gltf keeps its data in a separate file (${b.uri}). Use a .glb file, or one with the data embedded.`);
    return i === 0 ? bin : null;
  });
  return { json, buffers };
}

function reader({ json, buffers }) {
  return (index) => {
    const a = json.accessors[index];
    const per = TYPES[a.type];
    const size = COMPONENT[a.componentType];
    const out = new Array(a.count * per);
    if (a.bufferView == null) { out.fill(0); return out; }
    const bv = json.bufferViews[a.bufferView];
    const buffer = buffers[bv.buffer];
    const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const stride = bv.byteStride ?? per * size;
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < per; k++) {
        const o = start + i * stride + k * size;
        let v;
        switch (a.componentType) {
          case 5126: v = dv.getFloat32(o, true); break;
          case 5125: v = dv.getUint32(o, true); break;
          case 5123: v = dv.getUint16(o, true); if (a.normalized) v /= 65535; break;
          case 5122: v = dv.getInt16(o, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
          case 5121: v = dv.getUint8(o); if (a.normalized) v /= 255; break;
          default: v = dv.getInt8(o); if (a.normalized) v = Math.max(v / 127, -1);
        }
        out[i * per + k] = v;
      }
    }
    return out;
  };
}

const nodeLocal = (node) => {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
};

/** Sets an object's transform from a Z-up local matrix. */
function placeObject(obj, m) {
  const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
  m.decompose(p, q, s);
  obj.location = p.toArray();
  const e = new Euler().setFromQuaternion(q, 'ZYX'); // X first, then Y, then Z, which is this program's XYZ
  obj.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
  obj.rotationMode = 'XYZ';
  obj.scale = s.toArray();
}

/** Keeps an angle within half a turn of the one before, so that linear keys do not spin the long way round. */
const unwrap = (angle, previous) => (previous == null ? angle : angle + Math.round((previous - angle) / 360) * 360);

/** Value at a time on a sampler. */
function sampleAt(sampler, read, time) {
  const input = sampler.inputData ??= read(sampler.input);
  const per = sampler.per;
  const output = sampler.outputData ??= read(sampler.output);
  const cubic = sampler.interpolation === 'CUBICSPLINE';
  const stride = cubic ? 3 : 1;
  const value = (i) => { const at = (cubic ? i * 3 + 1 : i) * per; return output.slice(at, at + per); };
  if (time <= input[0]) return value(0);
  if (time >= input.at(-1)) return value(input.length - 1);
  let i = 0;
  while (i + 1 < input.length - 1 && input[i + 1] <= time) i++;
  const span = input[i + 1] - input[i];
  const t = span > 0 ? (time - input[i]) / span : 0;
  if (sampler.interpolation === 'STEP') return value(i);
  const [a, b] = [value(i), value(i + 1)];
  void stride;
  if (cubic) {
    const out_ = output.slice((i * 3 + 2) * per, (i * 3 + 3) * per);
    const in_ = output.slice(((i + 1) * 3) * per, ((i + 1) * 3 + 1) * per);
    const [t2, t3] = [t * t, t * t * t];
    const r = a.map((v, k) => (2 * t3 - 3 * t2 + 1) * v + (t3 - 2 * t2 + t) * span * out_[k] + (-2 * t3 + 3 * t2) * b[k] + (t3 - t2) * span * in_[k]);
    if (per === 4) { const q = new Quaternion(...r).normalize(); return [q.x, q.y, q.z, q.w]; }
    return r;
  }
  if (per === 4) { const q = new Quaternion(...a).slerp(new Quaternion(...b), t); return [q.x, q.y, q.z, q.w]; }
  return a.map((v, k) => v + (b[k] - v) * t);
}

/** Reads a glTF or GLB into the scene. Returns the new objects. */
export function importGLTFScene(doc, input) {
  const container = parseContainer(input);
  const { json } = container;
  const read = reader(container);
  const nodes = json.nodes ?? [];
  const parentOf = new Array(nodes.length).fill(null);
  nodes.forEach((n, i) => { for (const c of n.children ?? []) parentOf[c] = i; });
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => parentOf[i] == null);

  // Images and materials
  const images = (json.images ?? []).map((im, i) => {
    let bytes = null;
    let mime = im.mimeType ?? 'image/png';
    if (im.bufferView != null) {
      const bv = json.bufferViews[im.bufferView];
      bytes = container.buffers[bv.buffer].subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    } else if (im.uri?.startsWith('data:')) {
      mime = im.uri.slice(5, im.uri.indexOf(';'));
      bytes = unbase64(im.uri.slice(im.uri.indexOf(',') + 1));
    }
    if (!bytes) return null;
    const image = { id: `img_gltf_${Date.now().toString(36)}_${i}_${Math.floor(Math.random() * 1e6).toString(36)}`, name: im.name ?? `Image ${i}`, dataUrl: `data:${mime};base64,${base64(bytes)}` };
    (doc.images ??= []).push(image);
    return image;
  });
  const materials = (json.materials ?? []).map((m) => {
    const pbr = m.pbrMetallicRoughness ?? {};
    const c = pbr.baseColorFactor ?? [1, 1, 1, 1];
    const mat = { ...defaultMaterial(m.name ?? 'Material'), baseColor: c.slice(0, 3), alpha: m.alphaMode === 'BLEND' ? c[3] ?? 1 : 1, metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1, emission: m.emissiveFactor ?? [0, 0, 0] };
    const texture = pbr.baseColorTexture ? json.textures?.[pbr.baseColorTexture.index] : null;
    const image = texture != null ? images[texture.source] : null;
    if (image) {
      mat.useNodes = true;
      mat.nodes = defaultShaderGraph(mat);
      const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
      const node = createNode('TEX_IMAGE', bsdf.x - 280, bsdf.y, { image: image.id });
      mat.nodes.nodes.push(node);
      addLink(mat.nodes, node.id, 'Color', bsdf.id, 'Base Color');
    }
    doc.materials.push(mat);
    return mat;
  });

  // Joints become bones, not objects.
  const jointNodes = new Set((json.skins ?? []).flatMap((s) => s.joints));
  const world = new Array(nodes.length);
  const worldOf = (i, sampleLocal = null) => {
    const local = sampleLocal ? sampleLocal(i) : nodeLocal(nodes[i]);
    return parentOf[i] != null ? new Matrix4().multiplyMatrices(worldOf(parentOf[i], sampleLocal), local) : local;
  };
  nodes.forEach((_, i) => { world[i] = worldOf(i); });

  const objectOf = new Map();
  const created = [];
  const buildMesh = (node, placeVertex) => {
    const source = json.meshes[node.mesh];
    const mesh = createMesh();
    const slotMats = [];
    let anyUv = false;
    const uvs = [];
    const faceMat = [];
    const jointsAll = [];
    const weightsAll = [];
    const targets = (source.primitives[0]?.targets ?? []).map(() => []);
    for (const prim of source.primitives) {
      if (prim.mode != null && prim.mode !== 4) continue;
      const pos = read(prim.attributes.POSITION);
      const base = mesh.verts.length;
      for (let i = 0; i < pos.length; i += 3) mesh.verts.push(placeVertex(pos[i], pos[i + 1], pos[i + 2]));
      const indices = prim.indices != null ? read(prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
      const uv = prim.attributes.TEXCOORD_0 != null ? read(prim.attributes.TEXCOORD_0) : null;
      let slot = 0;
      if (prim.material != null) {
        const id = materials[prim.material]?.id;
        slot = slotMats.indexOf(id);
        if (slot < 0) { slotMats.push(id); slot = slotMats.length - 1; }
      }
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const tri = [indices[i], indices[i + 1], indices[i + 2]];
        mesh.faces.push(tri.map((k) => k + base));
        faceMat.push(slot);
        uvs.push(uv ? tri.map((k) => [uv[k * 2], 1 - uv[k * 2 + 1]]) : null);
        anyUv ||= Boolean(uv);
      }
      if (prim.attributes.JOINTS_0 != null) {
        const [j, w] = [read(prim.attributes.JOINTS_0), read(prim.attributes.WEIGHTS_0)];
        for (let i = 0; i < pos.length / 3; i++) { jointsAll[base + i] = j.slice(i * 4, i * 4 + 4); weightsAll[base + i] = w.slice(i * 4, i * 4 + 4); }
      }
      (prim.targets ?? []).forEach((t, n) => {
        if (t.POSITION == null || !targets[n]) return;
        const d = read(t.POSITION);
        for (let i = 0; i < d.length; i += 3) targets[n].push(vecZ(d[i], d[i + 1], d[i + 2]));
      });
    }
    if (anyUv) mesh.uvs = uvs;
    if (slotMats.length > 1) mesh.faceMat = faceMat;
    if (targets.some((t) => t.length)) {
      const names = source.extras?.targetNames ?? [];
      mesh.shapeKeys = targets.map((t, i) => ({ name: names[i] ?? `Key ${i + 1}`, value: (node.weights ?? source.weights ?? [])[i] ?? 0, verts: mesh.verts.map((v, k) => [v[0] + (t[k]?.[0] ?? 0), v[1] + (t[k]?.[1] ?? 0), v[2] + (t[k]?.[2] ?? 0)]) }));
    }
    return { mesh, slotMats, jointsAll, weightsAll };
  };

  const placeNode = (i, type, extra) => {
    const node = nodes[i];
    const obj = addObject(doc, { type, name: node.name ?? json.meshes?.[node.mesh]?.name ?? type, ...extra });
    objectOf.set(i, obj);
    created.push(obj);
    return obj;
  };
  const walk = (i) => {
    const node = nodes[i];
    if (!jointNodes.has(i) || node.mesh != null) {
      if (node.mesh != null && node.skin == null) {
        const { mesh, slotMats } = buildMesh(node, vecZ);
        placeNode(i, 'MESH', { data: mesh, materials: slotMats });
      } else if (node.mesh == null && node.camera != null) {
        const cam = json.cameras?.[node.camera];
        const data = defaultCamera();
        const p = cam?.perspective;
        if (p) {
          const aspect = p.aspectRatio ?? (doc.render?.width ?? 16) / (doc.render?.height ?? 9);
          data.lens = (data.sensor / 2) / Math.tan(Math.atan(Math.tan(p.yfov / 2) * aspect));
          data.clipStart = p.znear ?? 0.1;
          data.clipEnd = p.zfar ?? 1000;
        }
        placeNode(i, 'CAMERA', { data });
      } else if (node.mesh == null && node.extensions?.KHR_lights_punctual) {
        const l = json.extensions?.KHR_lights_punctual?.lights?.[node.extensions.KHR_lights_punctual.light];
        const kind = l?.type === 'directional' ? 'SUN' : l?.type === 'spot' ? 'SPOT' : 'POINT';
        const data = { ...defaultLight(kind), color: l?.color ?? [1, 1, 1] };
        data.energy = kind === 'SUN' ? l?.intensity ?? 1 : ((l?.intensity ?? 1) * 4 * Math.PI) / 683;
        if (kind === 'SPOT' && l.spot) { data.spotSize = ((l.spot.outerConeAngle ?? 0.785) * 2) / DEG; data.spotBlend = 1 - (l.spot.innerConeAngle ?? 0) / (l.spot.outerConeAngle || 1); }
        placeNode(i, 'LIGHT', { data });
      } else if (node.skin == null && !isBareArmatureNode(i)) {
        placeNode(i, 'EMPTY', {});
      }
    }
    for (const c of node.children ?? []) walk(c);
  };
  // A node that only holds the bones of a skin stays out: the armature object stands for it.
  const isBareArmatureNode = (i) => (nodes[i].children ?? []).length > 0 && nodes[i].children.every((c) => jointNodes.has(c));
  roots.forEach(walk);
  // Hierarchy and transforms.
  for (const [i, obj] of objectOf) {
    const parent = parentOf[i] != null ? objectOf.get(parentOf[i]) : null;
    const local = toZ(parent ? nodeLocal(nodes[i]) : world[i]);
    if (parent) obj.parent = parent.id;
    placeObject(obj, obj.type === 'CAMERA' || obj.type === 'LIGHT' ? local.multiply(CI) : local);
  }

  // Skins: an armature in world space, and the mesh bound to it.
  const armatures = [];
  (json.skins ?? []).forEach((skin, skinIndex) => {
    const joints = skin.joints;
    const inverse = skin.inverseBindMatrices != null ? read(skin.inverseBindMatrices) : null;
    const bind = joints.map((_, j) => (inverse ? new Matrix4().fromArray(inverse.slice(j * 16, j * 16 + 16)) : new Matrix4()));
    const worldZ = joints.map((n) => toZ(world[n]));
    const bones = joints.map((n, j) => {
      const m = worldZ[j];
      const head = new Vector3().setFromMatrixPosition(m).toArray();
      // Towards its first child when it has one away from it, or else along the joint's own Y.
      const childAt = (nodes[n].children ?? []).map((c) => joints.indexOf(c)).filter((k) => k >= 0).map((k) => new Vector3().setFromMatrixPosition(worldZ[k])).find((p) => p.distanceTo(new Vector3(...head)) > 1e-4);
      const parentIndex = joints.indexOf(parentOf[n]);
      let tail;
      if (childAt) tail = childAt.toArray();
      else {
        const parentLength = parentIndex >= 0 ? new Vector3(...head).distanceTo(new Vector3().setFromMatrixPosition(worldZ[parentIndex])) : 0;
        const axis = new Vector3(0, 1, 0).transformDirection(m);
        tail = new Vector3(...head).addScaledVector(axis, parentLength > 1e-4 ? parentLength * 0.5 : 0.25).toArray();
      }
      const bone = createBone(nodes[n].name ?? `Bone.${j}`, head, tail, parentIndex >= 0 ? parentIndex : null);
      return bone;
    });
    const arm = addObject(doc, { type: 'ARMATURE', name: `Armature${skinIndex ? `.${skinIndex}` : ''}`, data: { bones } });
    created.push(arm);
    armatures.push({ skinIndex, arm, joints, worldZ });
    nodes.forEach((node, i) => {
      if (node.skin !== skinIndex || node.mesh == null) return;
      // The vertices rest where the first joint and its inverse bind put them; the node's own transform does not count for a skin.
      const restY = new Matrix4().multiplyMatrices(world[joints[0]], bind[0]);
      const p = new Vector3();
      const { mesh, slotMats, jointsAll, weightsAll } = buildMesh(node, (x, y, z) => { p.set(x, y, z).applyMatrix4(restY); return vecZ(p.x, p.y, p.z); });
      mesh.vgroups = bones.map((b) => ({ name: b.name, w: {} }));
      jointsAll.forEach((list, v) => list?.forEach((j, k) => { const w = weightsAll[v][k]; if (w > 0 && mesh.vgroups[j]) mesh.vgroups[j].w[v] = (mesh.vgroups[j].w[v] ?? 0) + w; }));
      const obj = addObject(doc, { type: 'MESH', name: node.name ?? 'Skinned', data: mesh, materials: slotMats, modifiers: [{ type: 'ARMATURE', name: 'Armature', object: arm.id, show: true, showRender: true }] });
      created.push(obj);
    });
  });

  // Animation
  const fps = doc.fps || 24;
  for (const animation of (json.animations ?? []).slice(0, 1)) {
    const samplers = animation.samplers.map((s) => ({ ...s }));
    // Files that start at time 0 begin on frame 1. Blender writes a frame's own number over the rate, so its frame 1 is 1/24 s: those keep their numbers.
    const earliest = Math.min(...samplers.map((s) => json.accessors[s.input]?.min?.[0] ?? read(s.input)[0] ?? 0));
    const toFrame = (time) => Math.round(time * fps) + (earliest < 1e-6 ? 1 : 0);
    const channelsOf = new Map();
    for (const c of animation.channels) {
      if (c.target?.node == null || !['translation', 'rotation', 'scale'].includes(c.target.path)) continue;
      const s = samplers[c.sampler];
      s.per = c.target.path === 'rotation' ? 4 : 3;
      if (!channelsOf.has(c.target.node)) channelsOf.set(c.target.node, {});
      channelsOf.get(c.target.node)[c.target.path] = s;
    }
    const localAt = (i, time) => {
      const ch = channelsOf.get(i);
      if (!ch) return nodeLocal(nodes[i]);
      const n = nodes[i];
      if (n.matrix && (!ch.translation || !ch.rotation || !ch.scale)) {
        const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
        new Matrix4().fromArray(n.matrix).decompose(p, q, s);
        return new Matrix4().compose(ch.translation ? new Vector3(...sampleAt(ch.translation, read, time)) : p, ch.rotation ? new Quaternion(...sampleAt(ch.rotation, read, time)) : q, ch.scale ? new Vector3(...sampleAt(ch.scale, read, time)) : s);
      }
      return new Matrix4().compose(
        new Vector3(...(ch.translation ? sampleAt(ch.translation, read, time) : n.translation ?? [0, 0, 0])),
        new Quaternion(...(ch.rotation ? sampleAt(ch.rotation, read, time) : n.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(ch.scale ? sampleAt(ch.scale, read, time) : n.scale ?? [1, 1, 1])),
      );
    };
    const timesFor = (list) => {
      const set = new Set();
      for (const i of list) for (const s of Object.values(channelsOf.get(i) ?? {})) for (const t of (s.inputData ??= read(s.input))) set.add(t);
      return [...set].sort((a, b) => a - b);
    };
    let last = 0;
    for (const [i, obj] of objectOf) {
      if (!channelsOf.has(i)) continue;
      const parent = parentOf[i] != null ? objectOf.get(parentOf[i]) : null;
      let previous = [null, null, null];
      for (const time of timesFor([i])) {
        const local = toZ(parent ? localAt(i, time) : worldOf(i, (n) => localAt(n, time)));
        const holder = { location: [], rotation: [], scale: [] };
        placeObject(holder, obj.type === 'CAMERA' || obj.type === 'LIGHT' ? local.multiply(CI) : local);
        holder.rotation = holder.rotation.map((a, k) => unwrap(a, previous[k]));
        previous = holder.rotation;
        const frame = toFrame(time);
        last = Math.max(last, frame);
        for (const [name, values] of Object.entries({ location: holder.location, rotation: holder.rotation, scale: holder.scale })) values.forEach((v, k) => insertKey(obj, `${name}.${k}`, frame, v, 'LINEAR'));
      }
    }
    for (const { arm, joints, worldZ } of armatures) {
      if (!joints.some((n) => channelsOf.has(n))) continue;
      const rest = arm.data.bones.map((b) => restBoneMatrix(b));
      const previous = joints.map(() => [null, null, null]);
      for (const time of timesFor(joints)) {
        const frame = toFrame(time);
        last = Math.max(last, frame);
        const posed = joints.map((n, j) => {
          const now = toZ(worldOf(n, (k) => localAt(k, time)));
          // Each bone's posed matrix in this program's terms: what the joint does to the rest pose, applied to the bone's own rest.
          return now.multiply(new Matrix4().copy(worldZ[j]).invert()).multiply(rest[j]);
        });
        joints.forEach((_, j) => {
          const bone = arm.data.bones[j];
          let local;
          if (bone.parent != null) local = new Matrix4().copy(rest[j]).invert().multiply(rest[bone.parent]).multiply(new Matrix4().copy(posed[bone.parent]).invert()).multiply(posed[j]);
          else local = new Matrix4().copy(rest[j]).invert().multiply(posed[j]);
          const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
          local.decompose(p, q, s);
          const e = new Euler().setFromQuaternion(q);
          const rotation = [e.x / DEG, e.y / DEG, e.z / DEG].map((a, k) => unwrap(a, previous[j][k]));
          previous[j] = rotation;
          arm.data.anim ??= { fcurves: {}, nla: [] };
          for (const [name, values] of [['location', p.toArray()], ['rotation', rotation], ['scale', s.toArray()]]) {
            values.forEach((v, k) => insertKey(arm.data, `bones.${j}.pose.${name}.${k}`, frame, v, 'LINEAR'));
          }
        });
      }
    }
    if (last > doc.frameEnd) doc.frameEnd = last;
  }
  setFrame(doc, doc.frame);
  return created;
}
