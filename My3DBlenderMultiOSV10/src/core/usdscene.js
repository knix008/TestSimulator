// USD as a scene, both ways: hierarchy, meshes with UVs and per-face materials, UsdPreviewSurface materials (with a base colour
// picture inside a .usdz), cameras, lights and animation as time samples. Meshes that deform (skins, shape keys) are written as
// their points at every frame. Blender's ways are followed where USD leaves room: lens and film in tenths of a scene unit, a light's
// power as Blender divides it (π for lamps, 4 for the sun), a spot's cone as its half angle. Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { insertKey } from './anim.js';
import { bonePoseMatrices, createBone, restBoneMatrix, rollFromAxes } from './armature.js';
import { GEOMETRY_TYPES, addObject, defaultCamera, defaultLight, defaultMaterial, evaluatedArmature, evaluatedMesh, getMaterial, getObject, isVisible, localMatrix, newId, setFrame, worldMatrix } from './doc.js';
import { createMesh } from './mesh.js';
import { addLink, createNode, defaultShaderGraph } from './nodes.js';
import { attrAt, parseUSDA, readUSDStage } from './usdstage.js';
import { writeUSDC } from './usdcwrite.js';

const DEG = Math.PI / 180;
const EULER = { rotateXYZ: 'ZYX', rotateXZY: 'YZX', rotateYXZ: 'ZXY', rotateYZX: 'XZY', rotateZXY: 'YXZ', rotateZYX: 'XYZ' };
const LIGHTS = new Set(['SphereLight', 'DistantLight', 'RectLight', 'DiskLight', 'CylinderLight']);
const flat = (v) => (Array.isArray(v) ? v.flat(Infinity) : v);

// ─────────────── reading

/** A USD file's scene into the document: returns the objects made. */
export function importUSDScene(doc, input) {
  const stage = readUSDStage(input);
  const meters = stage.meta.metersPerUnit ?? 1;
  const R = new Matrix4().makeScale(meters, meters, meters);
  if ((stage.meta.upAxis ?? 'Y') === 'Y') R.premultiply(new Matrix4().makeRotationX(Math.PI / 2));
  const fps = doc.fps || 24;
  const perSecond = stage.meta.timeCodesPerSecond ?? stage.meta.framesPerSecond ?? fps;
  const toFrame = (time) => Math.round((time * fps) / perSecond);
  const prims = stage.prims;
  const attr = (prim, name) => prim?.attrs.get(name) ?? prim?.attrs.get(name.replace(/^inputs:/, '')) ?? null;
  const at = (prim, name, time = null) => attrAt(attr(prim, name), time);

  /** A prim's own transform at a time, from its ops in order. */
  const opsOf = (prim) => { const order = at(prim, 'xformOpOrder'); return Array.isArray(order) ? order : []; };
  const localAt = (prim, time) => {
    const m = new Matrix4();
    for (const op of opsOf(prim)) {
      const inverse = op.startsWith('!invert!');
      const name = inverse ? op.slice(8) : op;
      if (name === '!resetXformStack!') continue;
      const kind = name.split(':')[1];
      const v = flat(at(prim, name, time));
      let o = new Matrix4();
      if (v != null) {
        if (kind === 'transform') o.fromArray(v);
        else if (kind === 'translate') o.makeTranslation(v[0], v[1], v[2]);
        else if (kind === 'scale') o.makeScale(v[0], v[1], v[2]);
        else if (kind === 'orient') o.makeRotationFromQuaternion(new Quaternion(v[1], v[2], v[3], v[0]));
        else if (EULER[kind]) o.makeRotationFromEuler(new Euler(v[0] * DEG, v[1] * DEG, v[2] * DEG, EULER[kind]));
        else if (kind === 'rotateX') o.makeRotationX(v * DEG);
        else if (kind === 'rotateY') o.makeRotationY(v * DEG);
        else if (kind === 'rotateZ') o.makeRotationZ(v * DEG);
      }
      if (inverse) o = o.invert();
      m.multiply(o);
    }
    return m;
  };
  const sampleTimes = (prim) => opsOf(prim).flatMap((op) => (attr(prim, op.replace('!invert!', ''))?.samples ?? []).map(([time]) => time));

  // Materials, made when first bound.
  const materials = new Map();
  const images = new Map();
  const imageOf = (asset) => {
    const name = String(asset).replace(/\\/g, '/').replace(/^\.\//, '');
    if (images.has(name)) return images.get(name);
    const bytes = stage.files?.get(name) ?? [...(stage.files ?? new Map()).entries()].find(([k]) => k.endsWith(name.split('/').pop()))?.[1];
    if (!bytes) { images.set(name, null); return null; }
    const mime = /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'image/png';
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const image = { id: newId('img'), name: name.split('/').pop(), dataUrl: `data:${mime};base64,${typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64')}` };
    (doc.images ??= []).push(image);
    images.set(name, image);
    return image;
  };
  const materialFor = (path) => {
    if (!path) return null;
    if (materials.has(path)) return materials.get(path);
    const prim = prims.get(path);
    if (!prim) return null;
    const surface = attr(prim, 'outputs:surface')?.connect?.[0] ?? [...prim.attrs.entries()].find(([k, a]) => k.endsWith(':surface') && a.connect)?.[1].connect[0];
    const shader = surface ? prims.get(surface.split('.')[0]) : prim.children.find((c) => at(c, 'info:id') === 'UsdPreviewSurface');
    const made = defaultMaterial(prim.name);
    const read = (name) => at(shader, `inputs:${name}`);
    const color = read('diffuseColor');
    if (color) made.baseColor = flat(color).slice(0, 3);
    for (const [ours, theirs] of [['metallic', 'metallic'], ['roughness', 'roughness'], ['ior', 'ior']]) if (typeof read(theirs) === 'number') made[ours] = read(theirs);
    if (typeof read('opacity') === 'number') made.alpha = read('opacity');
    const emissive = read('emissiveColor');
    if (emissive && flat(emissive).some((x) => x > 0)) { made.emission = flat(emissive).slice(0, 3); made.emissionStrength = 1; }
    // A picture on the base colour.
    const link = attr(shader, 'inputs:diffuseColor')?.connect?.[0];
    const texture = link ? prims.get(link.split('.')[0]) : null;
    const file = texture ? at(texture, 'inputs:file') : null;
    const image = file ? imageOf(file.asset ?? file) : null;
    if (image) {
      made.useNodes = true;
      made.nodes = defaultShaderGraph(made);
      const bsdf = made.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
      const tex = createNode('TEX_IMAGE', bsdf.x - 280, bsdf.y, { image: image.id });
      made.nodes.nodes.push(tex);
      addLink(made.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    }
    doc.materials.push(made);
    materials.set(path, made.id);
    return made.id;
  };
  const bound = (prim) => prim?.rels.get('material:binding')?.[0] ?? null;

  const meshOf = (prim, holder) => {
    const points = at(prim, 'points');
    const counts = flat(at(prim, 'faceVertexCounts'));
    const indices = flat(at(prim, 'faceVertexIndices'));
    if (!points?.length || !counts?.length || !indices?.length) return null;
    const verts = points.map((p) => [p[0], p[1], p[2]]);
    const left = at(prim, 'orientation') === 'leftHanded';
    const faces = [];
    const starts = [];
    let k = 0;
    for (const n of counts) { const f = indices.slice(k, k + n); faces.push(left ? f.reverse() : f); starts.push(k); k += n; }
    const mesh = createMesh(verts, faces);
    const uvName = ['primvars:st', 'primvars:UVMap', 'primvars:uv', 'primvars:st0', 'primvars:map1'].find((n) => prim.attrs.has(n));
    const uv = uvName ? at(prim, uvName) : null;
    if (uv?.length) {
      const lookup = flat(at(prim, `${uvName}:indices`));
      const vertexWise = ['vertex', 'varying'].includes(attr(prim, uvName).interpolation);
      mesh.uvs = counts.map((n, f) => {
        const list = Array.from({ length: n }, (_, c) => { const corner = starts[f] + c; const j = vertexWise ? indices[corner] : corner; const v = uv[lookup ? lookup[j] : j] ?? [0, 0]; return [v[0], v[1]]; });
        return left ? list.reverse() : list;
      });
    }
    mesh.smooth = (at(prim, 'subdivisionScheme') ?? 'catmullClark') !== 'none';
    // Materials: the mesh's (or its holder's), and per-face subsets after it.
    const slots = [];
    const own = materialFor(bound(prim) ?? bound(holder));
    if (own) slots.push(own);
    const subsets = prim.children.filter((c) => c.type === 'GeomSubset' && (at(c, 'familyName') ?? 'materialBind') === 'materialBind');
    if (subsets.length) {
      mesh.faceMat = mesh.faces.map(() => 0);
      for (const s of subsets) {
        const id = materialFor(bound(s));
        if (!id) continue;
        let slot = slots.indexOf(id);
        if (slot < 0) { slots.push(id); slot = slots.length - 1; }
        for (const f of flat(at(s, 'indices')) ?? []) if (f < mesh.faceMat.length) mesh.faceMat[f] = slot;
      }
    }
    if (!slots.length) {
      const color = at(prim, 'primvars:displayColor');
      if (color?.length) {
        const m = { ...defaultMaterial(`${prim.name} colour`), baseColor: flat(color[0] ?? color).slice(0, 3) };
        doc.materials.push(m);
        slots.push(m.id);
      }
    }
    return { mesh, slots, deforming: attr(prim, 'points')?.samples?.length > 1 ? attr(prim, 'points').samples : null };
  };
  const cameraOf = (prim) => {
    const camera = defaultCamera();
    const tenths = 100 * meters;
    const [focal, h] = [at(prim, 'focalLength'), at(prim, 'horizontalAperture')];
    if (at(prim, 'projection') === 'orthographic') {
      camera.kind = 'ORTHO';
      if (h) camera.orthoScale = (h / 10) * meters;
    } else {
      if (h) camera.sensor = h * tenths;
      if (focal) camera.lens = focal * tenths;
    }
    const clip = flat(at(prim, 'clippingRange'));
    if (clip?.length === 2) { camera.clipStart = clip[0] * meters; camera.clipEnd = clip[1] * meters; }
    return camera;
  };
  const lightOf = (prim) => {
    const cone = at(prim, 'inputs:shaping:cone:angle');
    const kind = prim.type === 'DistantLight' ? 'SUN' : prim.type === 'RectLight' || prim.type === 'DiskLight' ? 'AREA' : typeof cone === 'number' && cone < 90 ? 'SPOT' : 'POINT';
    const light = defaultLight(kind);
    const intensity = (at(prim, 'inputs:intensity') ?? 1) * 2 ** (at(prim, 'inputs:exposure') ?? 0);
    light.energy = kind === 'SUN' ? intensity * 4 : intensity * Math.PI;
    const color = at(prim, 'inputs:color');
    if (color) light.color = flat(color).slice(0, 3);
    if (kind === 'SPOT') { light.spotSize = cone * 2; light.spotBlend = at(prim, 'inputs:shaping:cone:softness') ?? light.spotBlend; }
    const radius = at(prim, 'inputs:radius');
    if (typeof radius === 'number' && kind !== 'AREA') light.radius = radius * meters;
    if (prim.type === 'RectLight') light.size = (at(prim, 'inputs:width') ?? 1) * meters;
    if (prim.type === 'DiskLight') light.size = (radius ?? 0.5) * 2 * meters;
    return light;
  };

  // Which prims become objects. An Xform holding a single mesh, camera or light is that one object, named after the Xform;
  // an Xform without a transform that holds others is only a folder.
  const DATA = (p) => p.type === 'Mesh' || p.type === 'Camera' || LIGHTS.has(p.type) || p.type === 'Skeleton';
  const skeletons = new Map(); // Skeleton prim path → its armature object
  const skinned = []; // { obj, prim }: meshes bound to a skeleton
  const shaped = []; // { obj, prim, skeleton }: meshes with blend shapes, weighted by their skeleton's animation
  let lastFrame = 0;
  const objectOf = new Map(); // prim path → { obj, chain: [prims whose transforms make its local] }
  const created = [];
  const visit = (prim, chain, parentObj) => {
    if (['Material', 'Shader', 'GeomSubset', 'Scope', 'NodeGraph', 'SkelAnimation', 'BlendShape', 'DomeLight', 'Shader'].includes(prim.type) || prim.name === '_materials' || prim.specifier === 'class') return;
    // A skeleton that only carries blend shape weights (Blender's for shape keys) is no armature.
    const kids = prim.children.filter((c) => c.type !== 'Material' && c.type !== 'Scope' && c.type !== 'GeomSubset' && !(c.type === 'Skeleton' && shapeOnly(c)));
    let obj = null;
    let data = null;
    const isXform = prim.type === 'Xform' || prim.type === 'SkelRoot' || prim.type === '';
    // Blender's way: an object's transform holds its data, and its children's transforms beside it.
    const held = kids.filter(DATA);
    if (isXform && held.length === 1 && !held[0].children.some((c) => c.type !== 'GeomSubset' && c.type !== 'SkelAnimation' && c.type !== 'BlendShape')) data = held[0];
    else if (DATA(prim)) data = prim;
    const links = [...chain, prim, ...(data && data !== prim ? [data] : [])];
    if (data || (isXform && (opsOf(prim).length || !kids.length))) {
      const name = at(prim, 'userProperties:blender:object_name') ?? prim.name;
      if (data?.type === 'Mesh') {
        const read = meshOf(data, prim);
        if (read) {
          obj = addObject(doc, { type: 'MESH', name, data: read.mesh, materials: read.slots });
          const bound = skeletonOf(data);
          if (bound) skinned.push({ obj, prim: data, skeleton: bound });
          if (blendShapesOf(data, obj) && bound) shaped.push({ obj, prim: data, skeleton: bound });
          if (read.deforming) {
            // A mesh cache: the points of every sample, by frame, held between.
            obj.cache = { ...(obj.cache ?? {}), points: Object.fromEntries(read.deforming.map(([time, pts]) => [toFrame(time), pts.map((p) => [p[0], p[1], p[2]])])) };
            for (const [time] of read.deforming) lastFrame = Math.max(lastFrame, toFrame(time));
          }
        }
      } else if (data?.type === 'Camera') obj = addObject(doc, { type: 'CAMERA', name, data: cameraOf(data) });
      else if (data?.type === 'Skeleton') { obj = addObject(doc, { type: 'ARMATURE', name, data: { bones: bonesOf(data) } }); skeletons.set(data.path, { obj, prim: data }); }
      else if (data && LIGHTS.has(data.type)) obj = addObject(doc, { type: 'LIGHT', name, data: lightOf(data) });
      else if (!data) obj = addObject(doc, { type: 'EMPTY', name });
      if (obj) {
        created.push(obj);
        objectOf.set(prim.path, { obj, chain: links, parentObj });
      }
    }
    const nextChain = obj ? [] : links;
    for (const c of kids) if (c !== data) visit(c, nextChain, obj ?? parentObj);
  };
  const root = prims.get('/');
  for (const c of root.children) visit(c, [], null);
  bindSkins();

  const place = (o, m) => {
    const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
    m.decompose(p, q, s);
    const e = new Euler().setFromQuaternion(q, 'ZYX');
    o.location = p.toArray();
    o.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
    o.rotationMode = 'XYZ';
    o.scale = s.toArray();
  };
  for (const { obj, chain, parentObj } of objectOf.values()) {
    const localOf = (time) => chain.reduce((m, p) => m.multiply(localAt(p, time)), parentObj ? new Matrix4() : R.clone());
    if (parentObj) obj.parent = parentObj.id;
    place(obj, localOf(null));
    if (obj.type === 'MESH' && localOf(null).determinant() < 0) obj.data.faces = obj.data.faces.map((f) => [...f].reverse());
    const times = [...new Set(chain.flatMap(sampleTimes))].sort((a, b) => a - b);
    if (times.length < 2) { if (times.length) place(obj, localOf(times[0])); continue; }
    let previous = [null, null, null];
    for (const time of times) {
      const holder = {};
      place(holder, localOf(time));
      holder.rotation = holder.rotation.map((a, k) => (previous[k] == null ? a : a + Math.round((previous[k] - a) / 360) * 360));
      previous = holder.rotation;
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      for (const key of ['location', 'rotation', 'scale']) holder[key].forEach((v, k) => insertKey(obj, `${key}.${k}`, frame, v, 'LINEAR'));
    }
  }
  animateSkeletons();
  animateShapes();
  for (const { obj } of skeletons.values()) for (const b of obj.data.bones) delete b.bind;
  if (lastFrame > doc.frameEnd) doc.frameEnd = lastFrame;
  setFrame(doc, doc.frame);
  return created;

  // ── UsdSkel: a Skeleton is an armature, its joints the bones at their bind transforms; meshes bound to it get vertex groups
  // from their joint indices and weights and an Armature modifier; a SkelAnimation keys the bones.
  function shapeOnly(skel) {
    const anim = prims.get(skel.rels.get('skel:animationSource')?.[0]);
    return (flat(at(skel, 'joints'))?.length ?? 0) <= 1 && Boolean(anim?.attrs.has('blendShapes')) && !['rotations', 'translations', 'scales'].some((n) => anim.attrs.has(n));
  }
  /** Blend shapes as shape keys: each target's offsets, on its point indices (all points when it names none). */
  function blendShapesOf(prim, obj) {
    const names = flat(at(prim, 'skel:blendShapes'));
    const targets = prim.rels.get('skel:blendShapeTargets') ?? [];
    if (!names?.length || !targets.length) return false;
    const base = obj.data.verts;
    obj.data.shapeKeys = names.map((name, k) => {
      const target = prims.get(targets[k]);
      const offsets = at(target, 'offsets') ?? [];
      const indices = flat(at(target, 'pointIndices'));
      const verts = base.map((v) => [...v]);
      offsets.forEach((d, i) => { const v = verts[indices ? indices[i] : i]; if (v) for (let c = 0; c < 3; c++) v[c] += d[c]; });
      return { name, value: 0, verts };
    });
    return true;
  }
  /** The weights of blend shapes over time, from the animation of the skeleton the mesh is bound to. */
  function animateShapes() {
    for (const { obj, prim, skeleton } of shaped) {
      const skel = prims.get(skeleton);
      const anim = prims.get(skel?.rels.get('skel:animationSource')?.[0]);
      if (!anim) continue;
      const names = flat(at(anim, 'blendShapes')) ?? [];
      const weights = attr(anim, 'blendShapeWeights');
      const mine = flat(at(prim, 'skel:blendShapes')) ?? [];
      const order = mine.map((n) => names.indexOf(n));
      const still = flat(attrAt(weights, null)) ?? [];
      order.forEach((i, k) => { if (i >= 0 && still[i] != null) obj.data.shapeKeys[k].value = still[i]; });
      if (!(weights?.samples?.length > 1)) continue;
      obj.data.anim ??= { fcurves: {}, nla: [] };
      for (const [time, value] of weights.samples) {
        const frame = toFrame(time);
        lastFrame = Math.max(lastFrame, frame);
        const list = flat(value);
        order.forEach((i, k) => { if (i >= 0) insertKey(obj.data, `shapeKeys.${k}.value`, frame, list[i] ?? 0, 'LINEAR'); });
      }
    }
  }
  function skeletonOf(prim) {
    for (let p = prim; p; p = prims.get(p.parent)) { const rel = p.rels.get('skel:skeleton')?.[0]; if (rel) return rel; if (!p.parent) break; }
    return null;
  }
  function jointsOf(prim) {
    const joints = flat(at(prim, 'joints')) ?? [];
    const parentOf = joints.map((j) => joints.indexOf(j.slice(0, Math.max(0, j.lastIndexOf('/')))));
    return { joints, parentOf };
  }
  function matrices(value, count) {
    const list = flat(value) ?? [];
    return Array.from({ length: count }, (_, i) => (list.length >= (i + 1) * 16 ? new Matrix4().fromArray(list.slice(i * 16, i * 16 + 16)) : null));
  }
  function bonesOf(prim) {
    const { joints, parentOf } = jointsOf(prim);
    const binds = matrices(at(prim, 'bindTransforms'), joints.length);
    const rests = matrices(at(prim, 'restTransforms'), joints.length);
    // Without bind transforms, the rest transforms chained down the joints.
    const world = joints.map(() => null);
    const worldOf = (j) => world[j] ?? (world[j] = binds[j] ?? (parentOf[j] >= 0 ? worldOf(parentOf[j]).clone().multiply(rests[j] ?? new Matrix4()) : rests[j]?.clone() ?? new Matrix4()));
    const lengths = flat(at(prim, 'primvars:blender:bone_lengths'));
    return joints.map((path, j) => {
      const m = worldOf(j);
      const head = new Vector3().setFromMatrixPosition(m);
      const y = new Vector3().setFromMatrixColumn(m, 1).normalize();
      const x = new Vector3().setFromMatrixColumn(m, 0).normalize();
      // Length: Blender's own when it wrote one, else to the first child ahead, else half the parent's.
      let length = lengths?.[j];
      if (!(length > 0)) {
        const ahead = joints.map((_, k) => k).filter((k) => parentOf[k] === j).map((k) => new Vector3().setFromMatrixPosition(worldOf(k)).sub(head).dot(y)).find((d) => d > 1e-4);
        length = ahead ?? (parentOf[j] >= 0 ? Math.max(0.05, new Vector3().setFromMatrixPosition(worldOf(parentOf[j])).distanceTo(head) * 0.5) : 0.25);
      }
      const tail = head.clone().addScaledVector(y, length);
      const bone = createBone(path.slice(path.lastIndexOf('/') + 1), head.toArray(), tail.toArray(), parentOf[j] >= 0 ? parentOf[j] : null);
      bone.useRoll = true;
      bone.roll = rollFromAxes(bone.head, bone.tail, x.toArray());
      bone.bind = [...m.elements];
      return bone;
    });
  }
  function bindSkins() {
    for (const { obj, prim, skeleton } of skinned) {
      const skel = skeletons.get(skeleton);
      if (!skel) continue;
      const bones = skel.obj.data.bones;
      const own = flat(at(prim, 'skel:joints'));
      const names = (own ?? jointsOf(skel.prim).joints).map((j) => j.slice(j.lastIndexOf('/') + 1));
      const indices = flat(at(prim, 'primvars:skel:jointIndices')) ?? [];
      const weights = flat(at(prim, 'primvars:skel:jointWeights')) ?? [];
      const size = attr(prim, 'primvars:skel:jointIndices')?.elementSize ?? Math.max(1, Math.round(indices.length / Math.max(1, obj.data.verts.length)));
      const constant = attr(prim, 'primvars:skel:jointIndices')?.interpolation === 'constant';
      obj.data.vgroups = bones.map((b) => ({ name: b.name, w: {} }));
      for (let v = 0; v < obj.data.verts.length; v++) {
        for (let k = 0; k < size; k++) {
          const at2 = (constant ? 0 : v * size) + k;
          const w = weights[at2] ?? 0;
          const group = obj.data.vgroups.find((g) => g.name === names[indices[at2]]);
          if (w > 0 && group) group.w[v] = (group.w[v] ?? 0) + w;
        }
      }
      obj.modifiers.push({ type: 'ARMATURE', name: 'Armature', object: skel.obj.id, show: true, showRender: true });
    }
  }
  function animateSkeletons() {
    for (const { obj, prim } of skeletons.values()) {
      const source = prim.rels.get('skel:animationSource')?.[0];
      const anim = source ? prims.get(source) : null;
      if (!anim) continue;
      const { joints, parentOf } = jointsOf(prim);
      const bones = obj.data.bones;
      const binds = bones.map((b) => new Matrix4().fromArray(b.bind));
      const restLocal = matrices(at(prim, 'restTransforms'), joints.length);
      const rest = bones.map((b) => restBoneMatrix(b));
      const order = (flat(at(anim, 'joints')) ?? []).map((j) => joints.indexOf(j));
      const channels = ['translations', 'rotations', 'scales'].map((n) => attr(anim, n));
      const times = [...new Set(channels.flatMap((c) => (c?.samples ?? []).map(([time]) => time)))].sort((a, b) => a - b);
      const localsAt = (time) => {
        const out = joints.map((_, j) => restLocal[j]?.clone() ?? (parentOf[j] >= 0 ? binds[parentOf[j]].clone().invert().multiply(binds[j]) : binds[j].clone()));
        const [t, r, s] = channels.map((c) => attrAt(c, time));
        order.forEach((j, k) => {
          if (j < 0) return;
          const [p, q, sc] = [new Vector3(), new Quaternion(), new Vector3()];
          out[j].decompose(p, q, sc);
          if (t?.[k]) p.fromArray(flat(t[k]));
          if (r?.[k]) { const v = flat(r[k]); q.set(v[1], v[2], v[3], v[0]).normalize(); }
          if (s?.[k]) sc.fromArray(flat(s[k]));
          out[j].compose(p, q, sc);
        });
        return out;
      };
      const poseAt = (time) => {
        const locals = localsAt(time);
        const skelSpace = [];
        const of = (j) => skelSpace[j] ?? (skelSpace[j] = parentOf[j] >= 0 ? of(parentOf[j]).clone().multiply(locals[j]) : locals[j].clone());
        // Each bone posed as its joint moved from the bind pose, carried onto the bone's own rest frame.
        const posed = joints.map((_, j) => of(j).clone().multiply(binds[j].clone().invert()).multiply(rest[j]));
        return bones.map((bone, j) => {
          const local = bone.parent != null ? rest[j].clone().invert().multiply(rest[bone.parent]).multiply(posed[bone.parent].clone().invert()).multiply(posed[j]) : rest[j].clone().invert().multiply(posed[j]);
          const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
          local.decompose(p, q, s);
          const e = new Euler().setFromQuaternion(q);
          return { location: p.toArray(), rotation: [e.x / DEG, e.y / DEG, e.z / DEG], scale: s.toArray() };
        });
      };
      if (times.length < 2) {
        poseAt(times[0] ?? null).forEach((pose, j) => { bones[j].pose = pose; });
        continue;
      }
      obj.data.anim ??= { fcurves: {}, nla: [] };
      const previous = bones.map(() => null);
      for (const time of times) {
        const frame = toFrame(time);
        lastFrame = Math.max(lastFrame, frame);
        poseAt(time).forEach((pose, j) => {
          if (previous[j]) pose.rotation = pose.rotation.map((a, k) => a + Math.round((previous[j][k] - a) / 360) * 360);
          previous[j] = pose.rotation;
          for (const key of ['location', 'rotation', 'scale']) pose[key].forEach((v, k) => insertKey(obj.data, `bones.${j}.pose.${key}.${k}`, frame, v, 'LINEAR'));
        });
      }
    }
  }
}

// ─────────────── writing

const n9 = (x) => (Math.abs(x) < 1e-12 ? 0 : +x.toPrecision(9));
const tuple = (v) => `(${v.map(n9).join(', ')})`;
const quote = (s) => JSON.stringify(String(s));

/** A .usdz: an uncompressed zip, every file starting on a 64 byte boundary, the USD file first. */
export function storeUSDZ(files) {
  const encoder = new TextEncoder();
  const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    const nameBytes = encoder.encode(name);
    const padding = (64 - ((offset + 30 + nameBytes.length + 4) % 64)) % 64;
    const head = new Uint8Array(30 + nameBytes.length + 4 + padding);
    const v = new DataView(head.buffer);
    const crc = crc32(bytes);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint32(14, crc, true); v.setUint32(18, bytes.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, nameBytes.length, true); v.setUint16(28, 4 + padding, true);
    head.set(nameBytes, 30);
    v.setUint16(30 + nameBytes.length, 0x1986, true); v.setUint16(32 + nameBytes.length, padding, true);
    central.push({ nameBytes, crc, size: bytes.length, offset });
    parts.push(head, bytes);
    offset += head.length + bytes.length;
  }
  const dir = [];
  for (const c of central) {
    const entry = new Uint8Array(46 + c.nameBytes.length);
    const v = new DataView(entry.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint32(16, c.crc, true); v.setUint32(20, c.size, true); v.setUint32(24, c.size, true); v.setUint16(28, c.nameBytes.length, true); v.setUint32(42, c.offset, true);
    entry.set(c.nameBytes, 46);
    dir.push(entry);
  }
  const dirSize = dir.reduce((s, d) => s + d.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, dirSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + dirSize + 22);
  let at = 0;
  for (const p of [...parts, ...dir, end]) { out.set(p, at); at += p.length; }
  return out;
}

/** The scene (or the selected objects) as USD text, as binary .usdc with `usdc`, or as a .usdz with its pictures with `usdz`. Z up, in metres. */
export function exportUSDScene(doc, { selectedOnly = false, usdz = false, usdc = false } = {}) {
  const usable = (o) => isVisible(doc, o) && (!selectedOnly || doc.selected.includes(o.id)) && (GEOMETRY_TYPES.has(o.type) || ['EMPTY', 'CAMERA', 'LIGHT', 'ARMATURE'].includes(o.type));
  const objects = doc.objects.filter(usable);
  const fps = doc.fps || 24;
  const r = doc.render ?? {};
  const aspect = (r.resY ?? 1080) / (r.resX ?? 1920);
  const prim = (s) => { const t = String(s).replace(/\W/g, '_'); return /^[a-zA-Z_]/.test(t) ? t : `_${t}`; };
  const names = new Map();
  const taken = new Set(['_materials']);
  for (const o of objects) { let id = prim(o.name); for (let i = 1; taken.has(id); i++) id = `${prim(o.name)}_${i}`; taken.add(id); names.set(o.id, id); }
  const parented = (o) => o.parent && names.has(o.parent);
  const localOf = (o) => {
    if (!parented(o)) return worldMatrix(doc, o);
    const m = localMatrix(o);
    return o.parentInverse ? new Matrix4().fromArray(o.parentInverse).multiply(m) : m;
  };
  const parts = (m) => {
    const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
    m.decompose(p, q, s);
    const e = new Euler().setFromQuaternion(q, 'ZYX');
    return { t: p.toArray(), r: [e.x / DEG, e.y / DEG, e.z / DEG], s: s.toArray() };
  };

  // What moves, sampled on every frame of the keyed range (with constraints, drivers and parents as they act).
  const keyed = (a) => Object.values(a?.fcurves ?? {}).flat().map((k) => k.f);
  const frames = objects.flatMap((o) => [...keyed(o.anim), ...keyed(o.data?.anim), ...(o.type === 'MESH' ? o.modifiers.filter((m) => m.type === 'ARMATURE').flatMap((m) => keyed(doc.objects.find((a) => a.id === m.object)?.data?.anim)) : [])]);
  const [start, end] = frames.length ? [Math.floor(Math.min(...frames)), Math.ceil(Math.max(...frames))] : [doc.frameStart ?? 1, doc.frameEnd ?? 250];
  const movers = new Set(objects.filter((o) => Object.keys(o.anim?.fcurves ?? {}).length || o.constraints?.length).map((o) => o.id));
  // A mesh skinned to an armature written here is bound to its skeleton; any other deforming mesh travels as its points.
  const skinOf = (o) => (o.type === 'MESH' ? o.modifiers.find((m) => m.type === 'ARMATURE' && objects.some((a) => a.id === m.object && a.type === 'ARMATURE')) : null);
  // Shape keys travel as blend shapes when nothing but a skin changes the mesh; otherwise as points.
  const keyedShapes = (o) => o.type === 'MESH' && o.data?.shapeKeys?.length > 0 && o.modifiers.every((m) => m === skinOf(o) || m.show === false);
  const deforms = (o) => o.type === 'MESH' && !skinOf(o) && !keyedShapes(o) && (o.modifiers.some((m) => m.type === 'ARMATURE') || Object.keys(o.data?.anim?.fcurves ?? {}).some((p) => p.startsWith('shapeKeys.')));
  const shapeTracks = new Map(objects.filter(keyedShapes).map((o) => [o.id, []]));
  const rigs = objects.filter((o) => o.type === 'ARMATURE' && o.data?.bones?.length);
  const posesOf = new Map(rigs.map((o) => [o.id, []]));
  const tracks = new Map();
  const pointTracks = new Map();
  if (frames.length) {
    const back = doc.frame;
    for (let f = start; f <= end; f++) {
      setFrame(doc, f);
      for (const o of objects) {
        if (movers.has(o.id)) { if (!tracks.has(o.id)) tracks.set(o.id, []); tracks.get(o.id).push([f, parts(localOf(o))]); }
        if (deforms(o)) { if (!pointTracks.has(o.id)) pointTracks.set(o.id, []); pointTracks.get(o.id).push([f, evaluatedMesh(doc, o, { render: true }).verts]); }
        if (posesOf.has(o.id)) posesOf.get(o.id).push([f, bonePoseMatrices(evaluatedArmature(doc, o))]);
        if (shapeTracks.has(o.id) && Object.keys(o.data.anim?.fcurves ?? {}).some((p) => p.startsWith('shapeKeys.'))) shapeTracks.get(o.id).push([f, o.data.shapeKeys.map((k) => k.value ?? 0)]);
      }
    }
    setFrame(doc, back);
  }

  const files = [];
  const materialPrims = new Map();
  const materialLines = [];
  const materialPath = (id) => {
    const m = getMaterial(doc, id);
    if (!m) return null;
    if (materialPrims.has(m.id)) return materialPrims.get(m.id);
    let name = prim(m.name);
    for (let i = 1; [...materialPrims.values()].includes(`/root/_materials/${name}`); i++) name = `${prim(m.name)}_${i}`;
    const path = `/root/_materials/${name}`;
    materialPrims.set(m.id, path);
    // A picture on the base colour travels inside a .usdz.
    const bsdf = m.useNodes && m.nodes ? m.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED') : null;
    const link = bsdf && m.nodes.links.find((l) => l.to === bsdf.id && l.in === 'Base Color');
    const node = link && m.nodes.nodes.find((n) => n.id === link.from && n.type === 'TEX_IMAGE');
    const image = node ? (doc.images ?? []).find((im) => im.id === node.values?.image) : null;
    const match = usdz && /^data:image\/(png|jpeg);base64,(.*)$/s.exec(image?.dataUrl ?? '');
    let file = null;
    if (match) {
      file = `textures/${prim(image.name.replace(/\.\w+$/, ''))}.${match[1] === 'jpeg' ? 'jpg' : 'png'}`;
      if (!files.some((x) => x.name === file)) files.push({ name: file, bytes: Uint8Array.from(typeof atob === 'function' ? atob(match[2]) : Buffer.from(match[2], 'base64').toString('latin1'), (c) => c.charCodeAt(0)) });
    }
    const L = materialLines;
    L.push(`        def Material "${name}"`, '        {', `            token outputs:surface.connect = <${path}/Principled_BSDF.outputs:surface>`, '');
    L.push('            def Shader "Principled_BSDF"', '            {', '                uniform token info:id = "UsdPreviewSurface"');
    if (file) L.push(`                color3f inputs:diffuseColor.connect = <${path}/Image.outputs:rgb>`);
    else L.push(`                color3f inputs:diffuseColor = ${tuple(m.baseColor)}`);
    L.push(`                float inputs:metallic = ${n9(m.metallic ?? 0)}`, `                float inputs:roughness = ${n9(m.roughness ?? 0.5)}`, `                float inputs:ior = ${n9(m.ior ?? 1.45)}`, `                float inputs:opacity = ${n9(m.alpha ?? 1)}`);
    const glow = (m.emission ?? [0, 0, 0]).map((x) => x * (m.emissionStrength ?? 1));
    if (glow.some((x) => x > 0)) L.push(`                color3f inputs:emissiveColor = ${tuple(glow)}`);
    L.push('                token outputs:surface', '            }');
    if (file) {
      L.push('', '            def Shader "Image"', '            {', '                uniform token info:id = "UsdUVTexture"', `                asset inputs:file = @./${file}@`, `                float2 inputs:st.connect = <${path}/UVMap.outputs:result>`, '                float3 outputs:rgb', '            }');
      L.push('', '            def Shader "UVMap"', '            {', '                uniform token info:id = "UsdPrimvarReader_float2"', '                string inputs:varname = "st"', '                float2 outputs:result', '            }');
    }
    L.push('        }', '');
    return path;
  };

  // The root says it was made for the scene, as Blender's does, so that readers keep no object for it.
  // Prim paths, for the bindings between meshes and skeletons.
  const pathOf = (o) => (parented(o) ? `${pathOf(doc.objects.find((x) => x.id === o.parent))}/${names.get(o.id)}` : `/root/${names.get(o.id)}`);
  const jointPaths = (bones) => { const out = []; const of = (i) => out[i] ?? (out[i] = bones[i].parent != null ? `${of(bones[i].parent)}/${prim(bones[i].name)}` : prim(bones[i].name)); bones.forEach((_, i) => of(i)); return out; };
  const matrix = (m) => `( ${[0, 1, 2, 3].map((r) => tuple(m.elements.slice(r * 4, r * 4 + 4))).join(', ')} )`;
  const skinnedAny = objects.some((o) => skinOf(o) || keyedShapes(o));
  const out = ['#usda 1.0', '(', '    defaultPrim = "root"', `    endTimeCode = ${end}`, '    metersPerUnit = 1', `    startTimeCode = ${start}`, `    timeCodesPerSecond = ${fps}`, '    upAxis = "Z"', ')', '', `def ${skinnedAny ? 'SkelRoot' : 'Xform'} "root" (`, '    customData = {', '        dictionary Blender = {', '            bool generated = 1', '        }', '    }', ')', '{'];
  const write = (o, depth) => {
    const pad = ' '.repeat(depth * 4);
    const id = names.get(o.id);
    // The object's own name, which a prim name cannot always hold; Blender reads it to keep a transform and its data one object.
    // A mesh with blend shapes of its own, not skinned, is its own skeleton's root, as Blender writes it.
    const ownSkeleton = keyedShapes(o) && !skinOf(o);
    const L = [`${pad}def ${ownSkeleton ? 'SkelRoot' : 'Xform'} "${id}"`, `${pad}{`, `${pad}    custom string userProperties:blender:object_name = ${quote(o.name)}`];
    const track = tracks.get(o.id);
    const still = parts(localOf(o));
    const op = (type, name, key) => {
      if (!track) return `${pad}    ${type} xformOp:${name} = ${tuple(still[key])}`;
      return [`${pad}    ${type} xformOp:${name}.timeSamples = {`, ...track.map(([f, p]) => `${pad}        ${f}: ${tuple(p[key])},`), `${pad}    }`].join('\n');
    };
    L.push(op('double3', 'translate', 't'), op('float3', 'rotateXYZ', 'r'), op('float3', 'scale', 's'), `${pad}    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]`);
    const inner = `${pad}    `;
    if (GEOMETRY_TYPES.has(o.type)) {
      const skin = skinOf(o);
      // A skinned mesh is written as it rests; the skeleton moves it.
      const shapes = keyedShapes(o);
      const mesh = evaluatedMesh(doc, { ...o, ...(skin ? { modifiers: o.modifiers.filter((m) => m !== skin) } : {}), ...(shapes ? { data: { ...o.data, shapeKeys: [] } } : {}) }, { render: true });
      if (mesh?.verts.length && mesh.faces.length) {
        const slots = (o.materials ?? []).map(materialPath);
        const used = [...new Set(mesh.faces.map((_, f) => Math.min(mesh.faceMat?.[f] ?? 0, Math.max(0, slots.length - 1))))];
        const schemas = [...(slots.some(Boolean) ? ['"MaterialBindingAPI"'] : []), ...(skin || shapes ? ['"SkelBindingAPI"'] : [])];
        L.push('', `${inner}def Mesh "${id}"${schemas.length ? ` (\n${inner}    prepend apiSchemas = [${schemas.join(', ')}]\n${inner})` : ''}`, `${inner}{`);
        if (skin) L.push(...skinLines(o, skin, mesh, `${inner}    `));
        else if (shapes) L.push(...ownSkinLines(o, mesh, `${inner}    `));
        if (shapes) L.push(...blendShapeLines(o, mesh, `${inner}    `));
        L.push(`${inner}    int[] faceVertexCounts = [${mesh.faces.map((f) => f.length).join(', ')}]`, `${inner}    int[] faceVertexIndices = [${mesh.faces.flat().join(', ')}]`);
        const pts = pointTracks.get(o.id);
        if (pts) L.push(`${inner}    point3f[] points.timeSamples = {`, ...pts.map(([f, v]) => `${inner}        ${f}: [${v.map(tuple).join(', ')}],`), `${inner}    }`);
        else L.push(`${inner}    point3f[] points = [${mesh.verts.map(tuple).join(', ')}]`);
        if (mesh.uvs?.some(Boolean)) L.push(`${inner}    texCoord2f[] primvars:st = [${mesh.faces.flatMap((f, i) => f.map((_, k) => tuple(mesh.uvs[i]?.[k] ?? [0, 0]))).join(', ')}] (`, `${inner}        interpolation = "faceVarying"`, `${inner}    )`);
        L.push(`${inner}    uniform token subdivisionScheme = "none"`);
        if (used.length <= 1 && slots[used[0] ?? 0]) L.push(`${inner}    rel material:binding = <${slots[used[0] ?? 0]}>`);
        else if (used.length > 1) {
          for (const slot of used) {
            if (!slots[slot]) continue;
            L.push('', `${inner}    def GeomSubset "${prim(`slot_${slot}`)}" (`, `${inner}        prepend apiSchemas = ["MaterialBindingAPI"]`, `${inner}    )`, `${inner}    {`, `${inner}        uniform token elementType = "face"`, `${inner}        uniform token familyName = "materialBind"`, `${inner}        int[] indices = [${mesh.faces.map((_, f) => f).filter((f) => Math.min(mesh.faceMat?.[f] ?? 0, slots.length - 1) === slot).join(', ')}]`, `${inner}        rel material:binding = <${slots[slot]}>`, `${inner}    }`);
          }
        }
        L.push(`${inner}}`);
      }
    } else if (o.type === 'ARMATURE' && o.data?.bones?.length) {
      L.push('', ...skeletonLines(o, inner));
    } else if (o.type === 'CAMERA') {
      const c = { ...defaultCamera(), ...o.data };
      const width = c.kind === 'ORTHO' ? c.orthoScale * 10 : c.sensor / 100;
      L.push('', `${inner}def Camera "${id}"`, `${inner}{`, `${inner}    float2 clippingRange = ${tuple([c.clipStart, c.clipEnd])}`);
      if (c.kind !== 'ORTHO') L.push(`${inner}    float focalLength = ${n9(c.lens / 100)}`);
      L.push(`${inner}    float horizontalAperture = ${n9(width)}`, `${inner}    token projection = "${c.kind === 'ORTHO' ? 'orthographic' : 'perspective'}"`, `${inner}    float verticalAperture = ${n9(width * aspect)}`, `${inner}}`);
    } else if (o.type === 'LIGHT') {
      const l = { ...defaultLight(o.data?.kind), ...o.data };
      const type = l.kind === 'SUN' ? 'DistantLight' : l.kind === 'AREA' ? 'RectLight' : 'SphereLight';
      L.push('', `${inner}def ${type} "${id}"${l.kind === 'SPOT' ? ` (\n${inner}    prepend apiSchemas = ["ShapingAPI"]\n${inner})` : ''}`, `${inner}{`);
      L.push(`${inner}    color3f inputs:color = ${tuple(l.color)}`, `${inner}    float inputs:intensity = ${n9(l.kind === 'SUN' ? l.energy / 4 : l.energy / Math.PI)}`, `${inner}    bool inputs:normalize = 1`);
      if (l.kind === 'AREA') L.push(`${inner}    float inputs:width = ${n9(l.size ?? 1)}`, `${inner}    float inputs:height = ${n9(l.size ?? 1)}`);
      if (l.kind === 'POINT' || l.kind === 'SPOT') L.push(`${inner}    float inputs:radius = ${n9(l.kind === 'SPOT' ? 0 : l.radius ?? 0.1)}`);
      if (l.kind === 'SPOT') L.push(`${inner}    float inputs:shaping:cone:angle = ${n9(l.spotSize / 2)}`, `${inner}    float inputs:shaping:cone:softness = ${n9(l.spotBlend)}`, `${inner}    bool treatAsPoint = 1`);
      L.push(`${inner}}`);
    }
    if (ownSkeleton) L.push('', ...shapeSkeletonLines(o, inner));
    for (const c of objects.filter((x) => x.parent === o.id)) L.push('', write(c, depth + 1));
    L.push(`${pad}}`);
    return L.join('\n');
  };
  const keyNames = (o) => o.data.shapeKeys.map((k, i) => prim(k.name || `Key_${i + 1}`));
  /** Blend shapes: their names, the targets, and each target's offsets from the basis on every point. */
  function blendShapeLines(o, mesh, pad) {
    const names = keyNames(o);
    const at = `${pathOf(o)}/${names_of(o)}`;
    const L = [`${pad}uniform token[] skel:blendShapes = [${names.map(quote).join(', ')}]`, `${pad}rel skel:blendShapeTargets = [${names.map((n) => `<${at}/${n}>`).join(', ')}]`];
    o.data.shapeKeys.forEach((key, k) => {
      const offsets = mesh.verts.map((v, i) => [0, 1, 2].map((c) => (key.verts[i]?.[c] ?? v[c]) - v[c]));
      L.push('', `${pad}def BlendShape "${names[k]}"`, `${pad}{`, `${pad}    uniform vector3f[] offsets = [${offsets.map(tuple).join(', ')}]`, `${pad}    uniform int[] pointIndices = [${mesh.verts.map((_, i) => i).join(', ')}]`, `${pad}}`);
    });
    return L;
  }
  /** A mesh with blend shapes and no armature: bound wholly to its own one-joint skeleton, which carries the weights. */
  function ownSkinLines(o, mesh, pad) {
    return [
      `${pad}matrix4d primvars:skel:geomBindTransform = ${matrix(new Matrix4())}`,
      `${pad}int[] primvars:skel:jointIndices = [${mesh.verts.map(() => 0).join(', ')}] (`, `${pad}    elementSize = 1`, `${pad}    interpolation = "vertex"`, `${pad})`,
      `${pad}float[] primvars:skel:jointWeights = [${mesh.verts.map(() => 1).join(', ')}] (`, `${pad}    elementSize = 1`, `${pad}    interpolation = "vertex"`, `${pad})`,
      `${pad}rel skel:skeleton = <${pathOf(o)}/Skel>`,
    ];
  }
  /** The weights of a mesh's blend shapes, still and on every frame they are keyed. */
  function weightLines(list, pad) {
    const names = list.flatMap(keyNames);
    const still = list.flatMap((o) => o.data.shapeKeys.map((k) => k.value ?? 0));
    const L = [`${pad}uniform token[] blendShapes = [${names.map(quote).join(', ')}]`, `${pad}float[] blendShapeWeights = [${still.map(n9).join(', ')}]`];
    const frameList = [...new Set(list.flatMap((o) => (shapeTracks.get(o.id) ?? []).map(([f]) => f)))].sort((a, b) => a - b);
    if (frameList.length) {
      const valueAt = (o, f, k) => (shapeTracks.get(o.id)?.find(([g]) => g === f)?.[1][k] ?? o.data.shapeKeys[k].value ?? 0);
      L.push(`${pad}float[] blendShapeWeights.timeSamples = {`, ...frameList.map((f) => `${pad}    ${f}: [${list.flatMap((o) => o.data.shapeKeys.map((_, k) => n9(valueAt(o, f, k)))).join(', ')}],`), `${pad}}`);
    }
    return L;
  }
  function shapeSkeletonLines(o, pad) {
    const I = matrix(new Matrix4());
    return [`${pad}def Skeleton "Skel" (`, `${pad}    prepend apiSchemas = ["SkelBindingAPI"]`, `${pad})`, `${pad}{`, `${pad}    uniform matrix4d[] bindTransforms = [${I}]`, `${pad}    uniform token[] joints = ["joint1"]`, `${pad}    uniform matrix4d[] restTransforms = [${I}]`, `${pad}    rel skel:animationSource = <${pathOf(o)}/Skel/Anim>`, '', `${pad}    def SkelAnimation "Anim"`, `${pad}    {`, ...weightLines([o], `${pad}        `), `${pad}    }`, `${pad}}`];
  }
  const names_of = (o) => names.get(o.id);
  /** A skeleton: joints by path, bind transforms (the bones' rest matrices in the armature), rest transforms from each parent, Blender's bone lengths, and the animation as joint-local transforms on every frame. */
  function skeletonLines(o, pad) {
    const bones = o.data.bones;
    const paths = jointPaths(bones);
    const rest = bones.map((b) => restBoneMatrix(b));
    const local = (list, i) => (bones[i].parent != null ? list[bones[i].parent].clone().invert().multiply(list[i]) : list[i].clone());
    const L = [`${pad}def Skeleton "Skel" (`, `${pad}    prepend apiSchemas = ["SkelBindingAPI"]`, `${pad})`, `${pad}{`];
    L.push(`${pad}    uniform matrix4d[] bindTransforms = [${rest.map(matrix).join(', ')}]`);
    L.push(`${pad}    uniform token[] joints = [${paths.map(quote).join(', ')}]`);
    L.push(`${pad}    float[] primvars:blender:bone_lengths = [${bones.map((b) => n9(Math.hypot(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]))).join(', ')}] (`, `${pad}        interpolation = "uniform"`, `${pad}    )`);
    L.push(`${pad}    uniform matrix4d[] restTransforms = [${rest.map((_, i) => matrix(local(rest, i))).join(', ')}]`);
    const poses = posesOf.get(o.id) ?? [];
    const now = bonePoseMatrices(evaluatedArmature(doc, o));
    const parts = (list) => list.map((_, i) => { const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()]; local(list, i).decompose(p, q, s); return { t: p.toArray(), r: [q.w, q.x, q.y, q.z], s: s.toArray() }; });
    L.push(`${pad}    rel skel:animationSource = <${pathOf(o)}/Skel/Anim>`, '', `${pad}    def SkelAnimation "Anim"`, `${pad}    {`, `${pad}        uniform token[] joints = [${paths.map(quote).join(', ')}]`);
    const still = parts(now);
    for (const [type, name, key] of [['float3', 'translations', 't'], ['quatf', 'rotations', 'r'], ['half3', 'scales', 's']]) {
      L.push(`${pad}        ${type}[] ${name} = [${still.map((x) => tuple(x[key])).join(', ')}]`);
      if (poses.length) L.push(`${pad}        ${type}[] ${name}.timeSamples = {`, ...poses.map(([f, list]) => `${pad}            ${f}: [${parts(list).map((x) => tuple(x[key])).join(', ')}],`), `${pad}        }`);
    }
    const keyed = objects.filter((m) => keyedShapes(m) && skinOf(m)?.object === o.id);
    if (keyed.length) L.push(...weightLines(keyed, `${pad}        `));
    L.push(`${pad}    }`, `${pad}}`);
    return L;
  }
  /** A mesh's binding: the skeleton, where the mesh stood in it when bound, and per vertex its joints and weights (four at most). */
  function skinLines(o, skin, mesh, pad) {
    const arm = doc.objects.find((a) => a.id === skin.object);
    const paths = jointPaths(arm.data.bones);
    const names = arm.data.bones.map((b) => b.name);
    const per = mesh.verts.map((_, v) => {
      const here = (mesh.vgroups ?? []).map((g) => [names.indexOf(g.name), g.w[v] ?? 0]).filter(([j, w]) => j >= 0 && w > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = here.reduce((s, x) => s + x[1], 0);
      return sum > 0 ? here.map(([j, w]) => [j, w / sum]) : [[0, 0]];
    });
    const size = Math.max(1, ...per.map((x) => x.length));
    const padded = per.map((x) => [...x, ...Array.from({ length: size - x.length }, () => [0, 0])]);
    const bind = new Matrix4().copy(worldMatrix(doc, arm)).invert().multiply(worldMatrix(doc, o));
    return [
      `${pad}matrix4d primvars:skel:geomBindTransform = ${matrix(bind)}`,
      `${pad}int[] primvars:skel:jointIndices = [${padded.flatMap((x) => x.map((p) => p[0])).join(', ')}] (`, `${pad}    elementSize = ${size}`, `${pad}    interpolation = "vertex"`, `${pad})`,
      `${pad}float[] primvars:skel:jointWeights = [${padded.flatMap((x) => x.map((p) => n9(p[1]))).join(', ')}] (`, `${pad}    elementSize = ${size}`, `${pad}    interpolation = "vertex"`, `${pad})`,
      `${pad}uniform token[] skel:joints = [${paths.map(quote).join(', ')}]`,
      `${pad}rel skel:skeleton = <${pathOf(arm)}/Skel>`,
    ];
  }
  for (const o of objects.filter((x) => !parented(x))) out.push(write(o, 1), '');
  if (materialLines.length) out.push('    def Scope "_materials"', '    {', ...materialLines, '    }');
  out.push('}', '');
  const text = out.join('\n');
  // Binary: the same scene, read back from the text and packed as a crate.
  if (usdc) return writeUSDC(parseUSDA(text));
  if (!usdz) return text;
  return storeUSDZ([{ name: 'scene.usda', bytes: new TextEncoder().encode(text) }, ...files]);
}
