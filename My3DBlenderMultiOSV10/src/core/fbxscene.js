// FBX as a scene: hierarchy, materials with embedded textures, skins, shape keys, cameras, lights and animation, in both directions.
// (formats.js holds the container reader and writer, and the plain list of world-space meshes the simple paths use.)
// FBX cameras look along +X and lights along −Y: a quarter turn each, put on when writing and taken off when reading, as Blender does.
// Checked against a real Blender: npm run verify:blender.
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { insertKey } from './anim.js';
import { bonePoseMatrices, createBone, restBoneMatrix } from './armature.js';
import { GEOMETRY_TYPES, addObject, defaultCamera, defaultLight, defaultMaterial, evaluatedArmature, evaluatedMesh, getMaterial, isVisible, localMatrix, setFrame, worldMatrix } from './doc.js';
import { D, FBX_MAGIC, FbxWriter, I, L, finishFbx, readFbxAscii, readFbxBinary } from './formats.js';
import { createMesh } from './mesh.js';
import { addLink, createNode, defaultShaderGraph } from './nodes.js';

const DEG = Math.PI / 180;
const KTIME = 46186158000;
const childOf = (node, name) => node?.children.find((c) => c.name === name) ?? null;
const childrenOf = (node, name) => node?.children.filter((c) => c.name === name) ?? [];
const prop = (holder, name) => (holder?.children ?? []).find((p) => p.props[0] === name)?.props.slice(4) ?? null;
const cleanName = (raw, fallback) => String(raw ?? fallback).split(/\0|\u0001|::/).filter(Boolean).find((x) => !['Model', 'Geometry', 'Material', 'SubDeformer', 'Deformer', 'Texture', 'Video'].includes(x)) ?? fallback;
// FBX's XYZ applies X first, and three.js spells that 'ZYX'.
const eulerQuat = (a) => new Quaternion().setFromEuler(new Euler(a[0] * DEG, a[1] * DEG, a[2] * DEG, 'ZYX'));
/** What turns this program's camera (looking down −Z) and light (shining down −Z) into FBX's. */
const CAMERA_FIX = new Matrix4().makeRotationY(Math.PI / 2);
const LIGHT_FIX = new Matrix4().makeRotationX(Math.PI / 2);
const LIGHT_TYPES = ['POINT', 'SUN', 'SPOT', 'AREA'];
const unwrap = (angle, previous) => (previous == null ? angle : angle + Math.round((previous - angle) / 360) * 360);

const base64 = (bytes) => {
  if (typeof btoa === 'function') { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(s); }
  return Buffer.from(bytes).toString('base64');
};

/** Reads an FBX file into the scene. Returns the new objects. */
export function importFBXScene(doc, input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  const binary = new TextDecoder().decode(data.subarray(0, 20)) === FBX_MAGIC;
  const root = binary ? readFbxBinary(data) : readFbxAscii(new TextDecoder().decode(data));
  const objects = root.find((n) => n.name === 'Objects');
  if (!objects) throw new Error('No Objects section in this FBX file');
  const settingsNode = root.find((n) => n.name === 'GlobalSettings');
  const settings = childOf(settingsNode, 'Properties70') ?? childOf(settingsNode, 'Properties60');
  const unit = (prop(settings, 'UnitScaleFactor')?.[0] ?? 1) / 100;
  const upAxis = prop(settings, 'UpAxis')?.[0] ?? 1;
  const G = new Matrix4();
  if (upAxis === 1) G.makeRotationX(Math.PI / 2);
  G.multiply(new Matrix4().makeScale(unit, unit, unit));

  const byId = new Map();
  for (const node of objects.children) byId.set(node.props[0], node);
  const parentsOf = new Map();
  const childrenByParent = new Map();
  const propertyLinks = []; // [child, parent, property]
  for (const c of childrenOf(root.find((n) => n.name === 'Connections'), 'C')) {
    const [kind, child, parent, property] = c.props;
    if (kind !== 'OO' && kind !== 'OP') continue;
    if (!parentsOf.has(child)) parentsOf.set(child, []);
    parentsOf.get(child).push(parent);
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
    childrenByParent.get(parent).push(child);
    if (kind === 'OP') propertyLinks.push([child, parent, property]);
  }
  const kids = (id, name) => (childrenByParent.get(id) ?? []).map((k) => byId.get(k)).filter((n) => n?.name === name);
  const isModel = (id) => byId.get(id)?.name === 'Model';
  const modelParent = (id) => (parentsOf.get(id) ?? []).find(isModel) ?? null;

  // Animation curves on each model's transform, from the first stack.
  const stack = objects.children.find((n) => n.name === 'AnimationStack');
  const layers = stack ? kids(stack.props[0], 'AnimationLayer') : [];
  const layer = layers[0] ?? null;
  const curvesOf = new Map(); // model id to { 'Lcl Translation': [xCurve, yCurve, zCurve], … }
  if (layer) {
    for (const nodeCurve of kids(layer.props[0], 'AnimationCurveNode')) {
      const link = propertyLinks.find(([child, parent]) => child === nodeCurve.props[0] && isModel(parent));
      if (!link) continue;
      const channels = [null, null, null];
      for (const [child, parent, property] of propertyLinks) {
        if (parent !== nodeCurve.props[0]) continue;
        const curve = byId.get(child);
        if (curve?.name !== 'AnimationCurve') continue;
        const axis = { 'd|X': 0, 'd|Y': 1, 'd|Z': 2 }[property];
        if (axis == null) continue;
        channels[axis] = { times: childOf(curve, 'KeyTime')?.props[0] ?? [], values: childOf(curve, 'KeyValueFloat')?.props[0] ?? [] };
      }
      if (!curvesOf.has(link[1])) curvesOf.set(link[1], {});
      curvesOf.get(link[1])[link[2]] = channels;
    }
  }
  const curveAt = (curve, time, fallback) => {
    if (!curve?.times.length) return fallback;
    const { times, values } = curve;
    if (time <= times[0]) return values[0];
    if (time >= times.at(-1)) return values.at(-1);
    let i = 0;
    while (i + 1 < times.length - 1 && times[i + 1] <= time) i++;
    const k = (time - times[i]) / (times[i + 1] - times[i]);
    return values[i] + (values[i + 1] - values[i]) * k;
  };
  const localOf = (id, time = null) => {
    const model = byId.get(id);
    const p = childOf(model, 'Properties70');
    const curves = time != null ? curvesOf.get(id) : null;
    const pick = (name, fallback) => {
      const base = prop(p, name) ?? fallback;
      if (!curves?.[name]) return base;
      return [0, 1, 2].map((k) => curveAt(curves[name][k], time, base[k]));
    };
    const t = pick('Lcl Translation', [0, 0, 0]);
    const r = pick('Lcl Rotation', [0, 0, 0]);
    const s = pick('Lcl Scaling', [1, 1, 1]);
    const pre = prop(p, 'PreRotation') ?? [0, 0, 0];
    const post = prop(p, 'PostRotation') ?? [0, 0, 0];
    const rotation = eulerQuat(pre).multiply(eulerQuat(r)).multiply(eulerQuat(post).invert());
    return new Matrix4().compose(new Vector3(t[0], t[1], t[2]), rotation, new Vector3(s[0], s[1], s[2]));
  };
  const worldOf = (id, time = null) => {
    const parent = modelParent(id);
    return parent != null ? worldOf(parent, time).multiply(localOf(id, time)) : localOf(id, time);
  };

  // Materials and their textures.
  const images = new Map();
  const imageFromVideo = (video) => {
    const id = video.props[0];
    if (images.has(id)) return images.get(id);
    const content = childOf(video, 'Content')?.props[0];
    if (!content?.length || typeof content === 'string') return null;
    const file = String(childOf(video, 'RelativeFilename')?.props[0] ?? childOf(video, 'FileName')?.props[0] ?? 'image.png');
    const mime = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
    const image = { id: `img_fbx_${id}_${Math.floor(Math.random() * 1e6).toString(36)}`, name: file.split(/[\\/]/).pop(), dataUrl: `data:${mime};base64,${base64(content)}` };
    (doc.images ??= []).push(image);
    images.set(id, image);
    return image;
  };
  const materials = new Map();
  const materialOf = (node) => {
    const id = node.props[0];
    if (materials.has(id)) return materials.get(id);
    const p = childOf(node, 'Properties70');
    const color = prop(p, 'DiffuseColor') ?? prop(p, 'Diffuse') ?? [0.8, 0.8, 0.8];
    const mat = { ...defaultMaterial(cleanName(node.props[1], 'Material')), baseColor: color.slice(0, 3) };
    const shine = prop(p, 'Shininess')?.[0];
    if (shine != null) mat.roughness = Math.max(0, Math.min(1, 1 - Math.sqrt(shine) / 10));
    const textureLink = propertyLinks.find(([child, parent, property]) => parent === id && /DiffuseColor/.test(property ?? '') && byId.get(child)?.name === 'Texture');
    const video = textureLink ? kids(textureLink[0], 'Video')[0] : null;
    const image = video ? imageFromVideo(video) : null;
    if (image) {
      mat.useNodes = true;
      mat.nodes = defaultShaderGraph(mat);
      const bsdf = mat.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
      const tex = createNode('TEX_IMAGE', bsdf.x - 280, bsdf.y, { image: image.id });
      mat.nodes.nodes.push(tex);
      addLink(mat.nodes, tex.id, 'Color', bsdf.id, 'Base Color');
    }
    doc.materials.push(mat);
    materials.set(id, mat);
    return mat;
  };

  const readGeometry = (geo) => {
    const raw = childOf(geo, 'Vertices')?.props[0];
    const index = childOf(geo, 'PolygonVertexIndex')?.props[0];
    if (!raw || !index) return null;
    const mesh = createMesh();
    for (let i = 0; i + 2 < raw.length; i += 3) mesh.verts.push([raw[i], raw[i + 1], raw[i + 2]]);
    const flat = [];
    const starts = [];
    let run = [];
    index.forEach((x, k) => {
      if (!run.length) starts.push(k);
      const v = x < 0 ? -x - 1 : x;
      run.push(v);
      flat.push(v);
      if (x < 0) { mesh.faces.push(run); run = []; }
    });
    const layerUv = childOf(geo, 'LayerElementUV');
    if (layerUv) {
      const uv = childOf(layerUv, 'UV')?.props[0] ?? [];
      const uvIndex = childOf(layerUv, 'UVIndex')?.props[0] ?? null;
      const mapping = childOf(layerUv, 'MappingInformationType')?.props[0];
      const reference = childOf(layerUv, 'ReferenceInformationType')?.props[0];
      const at = (k) => { const j = reference === 'Direct' || !uvIndex ? k : uvIndex[k]; return j < 0 ? [0, 0] : [uv[j * 2] ?? 0, uv[j * 2 + 1] ?? 0]; };
      if (mapping === 'ByPolygonVertex') mesh.uvs = mesh.faces.map((f, i) => f.map((_, c) => at(starts[i] + c)));
      else if (mapping === 'ByVertice' || mapping === 'ByVertex') mesh.uvs = mesh.faces.map((f) => f.map((v) => at(v)));
    }
    if (childOf(geo, 'LayerElementSmoothing')) mesh.smooth = true;
    const matLayer = childOf(geo, 'LayerElementMaterial');
    if (matLayer && childOf(matLayer, 'MappingInformationType')?.props[0] === 'ByPolygon') {
      const list = childOf(matLayer, 'Materials')?.props[0];
      if (list?.length === mesh.faces.length) mesh.faceMat = [...list];
    }
    return mesh;
  };

  /** Shape keys: a BlendShape deformer on the geometry, one channel per key, each with a shape of moved vertices. */
  const shapeAnims = []; // [obj, key index, curve]
  const readShapes = (geometry, mesh) => {
    const blend = kids(geometry.props[0], 'Deformer').find((d) => d.props[2] === 'BlendShape');
    if (!blend) return [];
    const found = [];
    for (const channel of kids(blend.props[0], 'Deformer').filter((d) => d.props[2] === 'BlendShapeChannel')) {
      const shape = kids(channel.props[0], 'Geometry').find((g) => g.props[2] === 'Shape');
      if (!shape) continue;
      const indexes = childOf(shape, 'Indexes')?.props[0] ?? [];
      const moved = childOf(shape, 'Vertices')?.props[0] ?? [];
      const verts = mesh.verts.map((v) => [...v]);
      indexes.forEach((v, k) => { if (verts[v]) for (let a = 0; a < 3; a++) verts[v][a] += moved[k * 3 + a] ?? 0; });
      const percent = childOf(channel, 'DeformPercent')?.props[0] ?? prop(childOf(channel, 'Properties70'), 'DeformPercent')?.[0] ?? 0;
      found.push({ name: cleanName(channel.props[1], cleanName(shape.props[1], `Key ${found.length + 1}`)), value: percent / 100, verts });
      // Its animation, on the channel's DeformPercent.
      for (const [child, parent, property] of propertyLinks) {
        if (parent !== channel.props[0] || property !== 'DeformPercent' || byId.get(child)?.name !== 'AnimationCurveNode') continue;
        const link = propertyLinks.find(([c2, p2, pr2]) => p2 === child && /DeformPercent/.test(pr2 ?? '') && byId.get(c2)?.name === 'AnimationCurve');
        const curve = link ? byId.get(link[0]) : null;
        if (curve) found.at(-1).curve = { times: childOf(curve, 'KeyTime')?.props[0] ?? [], values: childOf(curve, 'KeyValueFloat')?.props[0] ?? [] };
      }
    }
    return found;
  };
  /** A camera's or light's quarter turn, from its node attribute; null for anything else. */
  const attributeOf = (id) => kids(id, 'NodeAttribute')[0] ?? null;
  const fixOf = (id) => { const kind = attributeOf(id)?.props[2]; return kind === 'Camera' ? CAMERA_FIX : kind === 'Light' ? LIGHT_FIX : null; };
  const readCamera = (attribute) => {
    const p = childOf(attribute, 'Properties70');
    const camera = defaultCamera();
    const film = prop(p, 'FilmWidth')?.[0];
    if (film) camera.sensor = film * 25.4;
    const focal = prop(p, 'FocalLength')?.[0];
    const fov = prop(p, 'FieldOfView')?.[0] ?? prop(p, 'FieldOfViewX')?.[0];
    if (focal) camera.lens = focal;
    else if (fov) camera.lens = camera.sensor / 2 / Math.tan((fov * DEG) / 2);
    if ((prop(p, 'CameraProjectionType')?.[0] ?? 0) === 1) camera.kind = 'ORTHO';
    const zoom = prop(p, 'OrthoZoom')?.[0];
    if (zoom) camera.orthoScale = zoom;
    const [near, far] = [prop(p, 'NearPlane')?.[0], prop(p, 'FarPlane')?.[0]];
    if (near != null) camera.clipStart = near * unit;
    if (far != null) camera.clipEnd = far * unit;
    return camera;
  };
  const readLight = (attribute) => {
    const p = childOf(attribute, 'Properties70');
    const light = defaultLight(LIGHT_TYPES[prop(p, 'LightType')?.[0] ?? 0] ?? 'POINT');
    const color = prop(p, 'Color');
    if (color) light.color = color.slice(0, 3);
    const intensity = prop(p, 'Intensity')?.[0];
    if (intensity != null) light.energy = intensity / 100;
    const [outer, inner] = [prop(p, 'OuterAngle')?.[0], prop(p, 'InnerAngle')?.[0]];
    if (light.kind === 'SPOT' && outer) { light.spotSize = outer; light.spotBlend = inner != null ? Math.max(0, Math.min(1, 1 - inner / outer)) : light.spotBlend; }
    const shadows = prop(p, 'CastShadows')?.[0];
    if (shadows != null) light.castShadow = !!shadows;
    return light;
  };

  const place = (obj, m) => {
    const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
    m.decompose(p, q, s);
    obj.location = p.toArray();
    const e = new Euler().setFromQuaternion(q, 'ZYX');
    obj.rotation = [e.x / DEG, e.y / DEG, e.z / DEG];
    obj.rotationMode = 'XYZ';
    obj.scale = s.toArray();
  };
  const fps = doc.fps || 24;
  // Time zero is frame 1, as Blender reads and writes it.
  const toFrame = (time) => Math.round((time / KTIME) * fps) + 1;
  let lastFrame = 0;

  // Skins: which bones each geometry answers to.
  const limbs = new Set(objects.children.filter((n) => n.name === 'Model' && n.props[2] === 'LimbNode').map((n) => n.props[0]));
  const skinOf = new Map();
  for (const skin of objects.children.filter((n) => n.name === 'Deformer' && n.props[2] === 'Skin')) {
    const geometry = (parentsOf.get(skin.props[0]) ?? []).find((id) => byId.get(id)?.name === 'Geometry');
    if (geometry == null) continue;
    const clusters = kids(skin.props[0], 'Deformer').filter((c) => c.props[2] === 'Cluster').map((c) => ({
      bone: (childrenByParent.get(c.props[0]) ?? []).find(isModel),
      indexes: childOf(c, 'Indexes')?.props[0] ?? [],
      weights: childOf(c, 'Weights')?.props[0] ?? [],
      transform: new Matrix4().fromArray(childOf(c, 'Transform')?.props[0] ?? new Matrix4().elements),
      link: new Matrix4().fromArray(childOf(c, 'TransformLink')?.props[0] ?? new Matrix4().elements),
    })).filter((c) => c.bone != null);
    if (clusters.length) skinOf.set(geometry, clusters);
  }
  for (const clusters of skinOf.values()) for (const c of clusters) limbs.add(c.bone);

  const created = [];
  const objectOf = new Map();
  const armatureFor = new Map(); // root limb to its armature record
  const rootLimb = (id) => { let at = id; for (let p = modelParent(at); p != null && limbs.has(p); p = modelParent(at)) at = p; return at; };
  const bindOf = new Map();
  for (const clusters of skinOf.values()) for (const c of clusters) bindOf.set(c.bone, c.link);
  const buildArmature = (rootId) => {
    if (armatureFor.has(rootId)) return armatureFor.get(rootId);
    const order = [];
    const visit = (id) => { order.push(id); for (const k of childrenByParent.get(id) ?? []) if (limbs.has(k)) visit(k); };
    visit(rootId);
    // Blender's leaf markers are tips, not bones.
    const real = order.filter((id) => !/_end$/.test(cleanName(byId.get(id).props[1], '')) || bindOf.has(id));
    const worldZ = new Map(order.map((id) => [id, new Matrix4().multiplyMatrices(G, bindOf.get(id) ?? worldOf(id))]));
    const positionOf = (id) => new Vector3().setFromMatrixPosition(worldZ.get(id));
    const bones = real.map((id) => {
      const head = positionOf(id);
      const near = (childrenByParent.get(id) ?? []).filter((k) => limbs.has(k)).map(positionOf).find((p) => p.distanceTo(head) > 1e-4);
      const parent = modelParent(id);
      const parentIndex = real.indexOf(parent);
      let tail;
      if (near) tail = near;
      else {
        const length = parentIndex >= 0 ? head.distanceTo(positionOf(parent)) : 0;
        tail = head.clone().addScaledVector(new Vector3(0, 1, 0).transformDirection(worldZ.get(id)), length > 1e-4 ? length * 0.5 : 0.25);
      }
      return createBone(cleanName(byId.get(id).props[1], 'Bone'), head.toArray(), tail.toArray(), parentIndex >= 0 ? parentIndex : null);
    });
    const arm = addObject(doc, { type: 'ARMATURE', name: modelParent(rootId) != null ? cleanName(byId.get(modelParent(rootId)).props[1], 'Armature') : 'Armature', data: { bones } });
    created.push(arm);
    const record = { arm, ids: real, worldZ };
    armatureFor.set(rootId, record);
    return record;
  };
  for (const id of limbs) buildArmature(rootLimb(id));
  // The empty that only holds a skeleton is the armature now.
  const holder = (id) => [...armatureFor.keys()].some((r) => modelParent(r) === id) && !kids(id, 'Geometry').length;

  // Objects
  for (const model of objects.children) {
    if (model.name !== 'Model') continue;
    const id = model.props[0];
    if (limbs.has(id) || holder(id)) continue;
    const geometry = kids(id, 'Geometry')[0];
    const name = cleanName(model.props[1], 'FBX');
    if (geometry) {
      const mesh = readGeometry(geometry);
      if (!mesh) continue;
      const shapes = readShapes(geometry, mesh);
      if (shapes.length) mesh.shapeKeys = shapes.map(({ name, value, verts }) => ({ name, value, verts }));
      const materialIds = kids(id, 'Material').map((m) => materialOf(m).id);
      const clusters = skinOf.get(geometry.props[0]);
      if (clusters) {
        // A cluster's Transform carries the mesh into the bone's space, and TransformLink the bone into the world: together, the mesh at rest.
        const rest = new Matrix4().multiplyMatrices(G, clusters[0].link).multiply(clusters[0].transform);
        const p = new Vector3();
        mesh.verts = mesh.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(rest); return [p.x, p.y, p.z]; });
        for (const key of mesh.shapeKeys ?? []) key.verts = key.verts.map((v) => { p.set(v[0], v[1], v[2]).applyMatrix4(rest); return [p.x, p.y, p.z]; });
        const record = buildArmature(rootLimb(clusters[0].bone));
        mesh.vgroups = record.arm.data.bones.map((b) => ({ name: b.name, w: {} }));
        for (const c of clusters) {
          const group = mesh.vgroups[record.ids.indexOf(c.bone)];
          if (group) c.indexes.forEach((v, k) => { if (c.weights[k] > 0) group.w[v] = c.weights[k]; });
        }
        const obj = addObject(doc, { type: 'MESH', name, data: mesh, materials: materialIds, modifiers: [{ type: 'ARMATURE', name: 'Armature', object: record.arm.id, show: true, showRender: true }] });
        shapes.forEach((shape, n) => { if (shape.curve) shapeAnims.push([obj, n, shape.curve]); });
        created.push(obj);
        continue;
      }
      const obj = addObject(doc, { type: 'MESH', name, data: mesh, materials: materialIds });
      shapes.forEach((shape, n) => { if (shape.curve) shapeAnims.push([obj, n, shape.curve]); });
      objectOf.set(id, obj);
      created.push(obj);
    } else if (model.props[2] !== 'LimbNode') {
      const attribute = attributeOf(id);
      const kind = attribute?.props[2];
      const obj = kind === 'Camera' ? addObject(doc, { type: 'CAMERA', name, data: readCamera(attribute) })
        : kind === 'Light' ? addObject(doc, { type: 'LIGHT', name, data: readLight(attribute) })
          : addObject(doc, { type: 'EMPTY', name });
      objectOf.set(id, obj);
      created.push(obj);
    }
  }
  const objectLocal = (id, time) => {
    const parent = modelParent(id);
    let m;
    if (parent != null && objectOf.has(parent)) {
      m = localOf(id, time);
      // Under a camera or a light, the parent's quarter turn is not this program's.
      const parentFix = fixOf(parent);
      if (parentFix) m = parentFix.clone().multiply(m);
    } else m = new Matrix4().multiplyMatrices(G, worldOf(id, time)); // At the top, or under something left out: into this program's axes and units.
    const fix = fixOf(id);
    return fix ? m.multiply(fix.clone().invert()) : m;
  };
  for (const [id, obj] of objectOf) {
    const parent = modelParent(id);
    if (parent != null && objectOf.has(parent)) obj.parent = objectOf.get(parent).id;
    place(obj, objectLocal(id, null));
    if (!curvesOf.has(id)) continue;
    const times = [...new Set(Object.values(curvesOf.get(id)).flat().filter(Boolean).flatMap((c) => c.times))].sort((a, b) => a - b);
    let previous = [null, null, null];
    for (const time of times) {
      const holderObj = {};
      place(holderObj, objectLocal(id, time));
      holderObj.rotation = holderObj.rotation.map((a, k) => unwrap(a, previous[k]));
      previous = holderObj.rotation;
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      for (const name of ['location', 'rotation', 'scale']) holderObj[name].forEach((v, k) => insertKey(obj, `${name}.${k}`, frame, v, 'LINEAR'));
    }
  }
  // Bones: what each joint does to the rest pose, in this program's terms.
  for (const { arm, ids, worldZ } of armatureFor.values()) {
    const related = [...new Set(ids.flatMap((id) => { const chain = []; for (let at = id; at != null; at = modelParent(at)) chain.push(at); return chain; }))];
    const times = [...new Set(related.flatMap((id) => Object.values(curvesOf.get(id) ?? {}).flat().filter(Boolean).flatMap((c) => c.times)))].sort((a, b) => a - b);
    if (!times.length) continue;
    const rest = arm.data.bones.map((b) => restBoneMatrix(b));
    const previous = ids.map(() => [null, null, null]);
    for (const time of times) {
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      const posed = ids.map((id, j) => new Matrix4().multiplyMatrices(G, worldOf(id, time)).multiply(new Matrix4().copy(worldZ.get(id)).invert()).multiply(rest[j]));
      ids.forEach((_, j) => {
        const bone = arm.data.bones[j];
        const local = bone.parent != null
          ? new Matrix4().copy(rest[j]).invert().multiply(rest[bone.parent]).multiply(new Matrix4().copy(posed[bone.parent]).invert()).multiply(posed[j])
          : new Matrix4().copy(rest[j]).invert().multiply(posed[j]);
        const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
        local.decompose(p, q, s);
        const e = new Euler().setFromQuaternion(q);
        const rotation = [e.x / DEG, e.y / DEG, e.z / DEG].map((a, k) => unwrap(a, previous[j][k]));
        previous[j] = rotation;
        arm.data.anim ??= { fcurves: {}, nla: [] };
        for (const [name, values] of [['location', p.toArray()], ['rotation', rotation], ['scale', s.toArray()]]) values.forEach((v, k) => insertKey(arm.data, `bones.${j}.pose.${name}.${k}`, frame, v, 'LINEAR'));
      });
    }
  }
  for (const [obj, n, curve] of shapeAnims) {
    curve.times.forEach((time, k) => {
      const frame = toFrame(time);
      lastFrame = Math.max(lastFrame, frame);
      obj.data.anim ??= { fcurves: {}, nla: [] };
      insertKey(obj.data, `shapeKeys.${n}.value`, frame, (curve.values[k] ?? 0) / 100, 'LINEAR');
    });
  }
  if (lastFrame > doc.frameEnd) doc.frameEnd = lastFrame;
  setFrame(doc, doc.frame);
  return created;
}

// ─────────────── writing

const toEuler = (m) => {
  const [p, q, s] = [new Vector3(), new Quaternion(), new Vector3()];
  m.decompose(p, q, s);
  const e = new Euler().setFromQuaternion(q, 'ZYX');
  return { t: p.toArray(), r: [e.x / DEG, e.y / DEG, e.z / DEG], s: s.toArray() };
};

/** The scene (or the selected objects) as binary FBX 7.4. One unit here is a metre, and Z stays up. */
export function exportFBXScene(doc, { selectedOnly = false } = {}) {
  const w = new FbxWriter();
  const p70 = (entries) => w.node('Properties70', [], () => { for (const e of entries) w.node('P', e); });
  const usable = (o) => isVisible(doc, o) && (!selectedOnly || doc.selected.includes(o.id)) && (GEOMETRY_TYPES.has(o.type) || ['EMPTY', 'ARMATURE', 'CAMERA', 'LIGHT'].includes(o.type));
  const objects = doc.objects.filter(usable);
  let nextId = 100000;
  const newId = () => nextId++;
  const links = [];
  const modelId = new Map(objects.map((o) => [o.id, newId()]));
  const fps = doc.fps || 24;
  const fileRate = fps === 24 ? 11 : fps === 30 ? 6 : fps === 25 ? 8 : fps === 60 ? 3 : 14;

  w.node('FBXHeaderExtension', [], () => {
    w.node('FBXHeaderVersion', [I(1003)]);
    w.node('FBXVersion', [I(7400)]);
    w.node('Creator', ['My3DBlender']);
  });
  w.node('GlobalSettings', [], () => {
    w.node('Version', [I(1000)]);
    p70([
      ['UpAxis', 'int', 'Integer', '', I(2)], ['UpAxisSign', 'int', 'Integer', '', I(1)],
      ['FrontAxis', 'int', 'Integer', '', I(1)], ['FrontAxisSign', 'int', 'Integer', '', I(-1)],
      ['CoordAxis', 'int', 'Integer', '', I(0)], ['CoordAxisSign', 'int', 'Integer', '', I(1)],
      ['UnitScaleFactor', 'double', 'Number', '', D(100)],
      ['TimeMode', 'enum', '', '', I(fileRate)],
      ['CustomFrameRate', 'double', 'Number', '', D(fps)],
    ]);
  });

  const parented = (o) => o.parent && modelId.has(o.parent);
  const fixOf = (o) => (o?.type === 'CAMERA' ? CAMERA_FIX : o?.type === 'LIGHT' ? LIGHT_FIX : null);
  const localOf = (o) => {
    let m;
    if (!parented(o)) m = worldMatrix(doc, o);
    else {
      m = localMatrix(o);
      if (o.parentInverse) m = new Matrix4().fromArray(o.parentInverse).multiply(m);
      const parentFix = fixOf(doc.objects.find((x) => x.id === o.parent));
      if (parentFix) m = parentFix.clone().invert().multiply(m);
    }
    const fix = fixOf(o);
    return fix ? m.clone().multiply(fix) : m;
  };
  // Armatures
  const rigs = objects.filter((o) => o.type === 'ARMATURE').map((o) => {
    const rest = o.data.bones.map((b) => restBoneMatrix(b));
    return { o, rest, ids: o.data.bones.map(() => newId()), attributes: o.data.bones.map(() => newId()) };
  });
  const rigOf = new Map(rigs.map((r) => [r.o.id, r]));
  const boneLocalAt = (rig, matrices, i) => {
    const b = rig.o.data.bones[i];
    return b.parent != null ? new Matrix4().copy(matrices[b.parent]).invert().multiply(matrices[i]) : matrices[i].clone();
  };

  const materialIds = new Map();
  const images = new Map();
  const materialFor = (id) => {
    const m = getMaterial(doc, id);
    if (!m) return null;
    if (!materialIds.has(id)) materialIds.set(id, { id: newId(), m });
    return materialIds.get(id).id;
  };
  const geoms = [];
  for (const o of objects) {
    if (!GEOMETRY_TYPES.has(o.type)) continue;
    const armatureMod = o.type === 'MESH' ? o.modifiers.find((m) => m.type === 'ARMATURE' && rigOf.has(m.object)) : null;
    const source = armatureMod ? { ...o, modifiers: o.modifiers.filter((m) => m !== armatureMod) } : o;
    // Shape keys travel as blend shapes when they fit the vertices as written: the base goes without them.
    const keys = o.type === 'MESH' && !source.modifiers.length ? (o.data.shapeKeys ?? []).filter((k) => k.verts?.length === o.data.verts.length) : [];
    const mesh = evaluatedMesh(doc, keys.length ? { ...source, data: { ...o.data, shapeKeys: [] } } : source, { render: true });
    if (!mesh?.verts?.length || !mesh.faces.length) continue;
    const shapes = keys.map((key, n) => ({ key, n, channel: newId(), shape: newId() }));
    geoms.push({ o, mesh, shapes, blend: shapes.length ? newId() : null, id: newId(), rig: armatureMod ? rigOf.get(armatureMod.object) : null, skin: armatureMod ? newId() : null, materials: o.materials.map(materialFor).filter((x) => x != null) });
  }
  for (const { id, m } of materialIds.values()) {
    if (!m.useNodes || !m.nodes) continue;
    const bsdf = m.nodes.nodes.find((n) => n.type === 'BSDF_PRINCIPLED');
    const link = bsdf && m.nodes.links.find((l) => l.to === bsdf.id && l.in === 'Base Color');
    const node = link && m.nodes.nodes.find((n) => n.id === link.from && n.type === 'TEX_IMAGE');
    const image = node ? (doc.images ?? []).find((im) => im.id === node.values?.image) : null;
    const match = /^data:image\/([a-z]+);base64,(.*)$/s.exec(image?.dataUrl ?? '');
    if (match) images.set(id, { texture: newId(), video: newId(), name: image.name, ext: match[1] === 'jpeg' ? 'jpg' : match[1], bytes: Uint8Array.from(typeof atob === 'function' ? atob(match[2]) : Buffer.from(match[2], 'base64').toString('latin1'), (c) => c.charCodeAt(0)) });
  }

  // Animation, sampled over the keyed range.
  const keyed = (a) => Object.values(a?.fcurves ?? {}).flat().map((k) => k.f);
  const frames = objects.flatMap((o) => [...keyed(o.anim), ...keyed(o.data?.anim)]);
  const anim = { stack: newId(), layer: newId(), nodes: [], shapes: [] };
  if (frames.length) {
    const [start, end] = [Math.floor(Math.min(...frames)), Math.ceil(Math.max(...frames))];
    const back = doc.frame;
    const tracks = new Map();
    const trackOf = (id) => { if (!tracks.has(id)) tracks.set(id, { t: [], r: [], s: [] }); return tracks.get(id); };
    const movers = objects.filter((o) => Object.keys(o.anim?.fcurves ?? {}).length);
    const moving = rigs.filter((r) => Object.keys(r.o.data.anim?.fcurves ?? {}).length || r.o.data.bones.some((b) => b.ik?.target));
    const morphing = geoms.flatMap((g) => g.shapes.filter((x) => g.o.data.anim?.fcurves?.[`shapeKeys.${x.n}.value`]?.length));
    const times = [];
    for (let f = start; f <= end; f++) {
      setFrame(doc, f);
      times.push(Math.round(((f - 1) / fps) * KTIME));
      const add = (id, m) => {
        const track = trackOf(id);
        const parts = toEuler(m);
        const before = track.r.at(-1);
        track.t.push(parts.t);
        track.r.push(parts.r.map((a, k) => unwrap(a, before?.[k])));
        track.s.push(parts.s);
      };
      for (const o of movers) add(modelId.get(o.id), localOf(o));
      for (const rig of moving) {
        const pose = bonePoseMatrices(evaluatedArmature(doc, rig.o));
        rig.ids.forEach((id, i) => add(id, boneLocalAt(rig, pose, i)));
      }
      for (const x of morphing) (x.percents ??= []).push((x.key.value ?? 0) * 100);
    }
    for (const x of morphing) anim.shapes.push({ id: newId(), curve: newId(), channel: x.channel, values: x.percents, times });
    setFrame(doc, back);
    for (const [model, track] of tracks) {
      for (const [property, list] of [['Lcl Translation', track.t], ['Lcl Rotation', track.r], ['Lcl Scaling', track.s]]) {
        const node = { id: newId(), model, property, first: list[0], curves: [0, 1, 2].map((k) => ({ id: newId(), axis: 'XYZ'[k], values: list.map((v) => v[k]) })), times };
        anim.nodes.push(node);
      }
    }
  }

  const count = objects.length + geoms.length + rigs.reduce((n, r) => n + r.ids.length * 2, 0) + materialIds.size;
  w.node('Definitions', [], () => {
    w.node('Version', [I(100)]);
    w.node('Count', [I(count)]);
    for (const type of ['Model', 'Geometry', 'Material', 'NodeAttribute', 'Deformer', 'Texture', 'Video', 'AnimationStack', 'AnimationLayer', 'AnimationCurveNode', 'AnimationCurve']) w.node('ObjectType', [type], () => { w.node('Count', [I(1)]); });
  });

  const modelNode = (id, name, subtype, m) => {
    const { t, r, s } = toEuler(m);
    w.node('Model', [L(id), `${name}\0\u0001Model`, subtype], () => {
      w.node('Version', [I(232)]);
      p70([
        ['RotationActive', 'bool', '', '', I(1)],
        ['InheritType', 'enum', '', '', I(1)],
        ['DefaultAttributeIndex', 'int', 'Integer', '', I(0)],
        ['Lcl Translation', 'Lcl Translation', '', 'A', D(t[0]), D(t[1]), D(t[2])],
        ['Lcl Rotation', 'Lcl Rotation', '', 'A', D(r[0]), D(r[1]), D(r[2])],
        ['Lcl Scaling', 'Lcl Scaling', '', 'A', D(s[0]), D(s[1]), D(s[2])],
      ]);
      w.node('Culling', ['CullingOff']);
    });
  };

  w.node('Objects', [], () => {
    for (const g of geoms) {
      const { mesh } = g;
      w.node('Geometry', [L(g.id), `${g.o.name}\0\u0001Geometry`, 'Mesh'], () => {
        w.node('GeometryVersion', [I(124)]);
        w.node('Vertices', [{ kind: 'd', value: mesh.verts.flat() }]);
        w.node('PolygonVertexIndex', [{ kind: 'i', value: mesh.faces.flatMap((f) => f.map((v, k) => (k === f.length - 1 ? -v - 1 : v))) }]);
        const hasUv = mesh.uvs?.some(Boolean);
        if (hasUv) {
          w.node('LayerElementUV', [I(0)], () => {
            w.node('Version', [I(101)]);
            w.node('Name', ['UVMap']);
            w.node('MappingInformationType', ['ByPolygonVertex']);
            w.node('ReferenceInformationType', ['Direct']);
            w.node('UV', [{ kind: 'd', value: mesh.faces.flatMap((f, i) => f.flatMap((_, k) => mesh.uvs[i]?.[k] ?? [0, 0])) }]);
          });
        }
        if (g.materials.length) {
          w.node('LayerElementMaterial', [I(0)], () => {
            w.node('Version', [I(101)]);
            w.node('Name', ['']);
            w.node('MappingInformationType', ['ByPolygon']);
            w.node('ReferenceInformationType', ['IndexToDirect']);
            w.node('Materials', [{ kind: 'i', value: mesh.faces.map((_, i) => Math.min(mesh.faceMat?.[i] ?? 0, g.materials.length - 1)) }]);
          });
        }
        w.node('Layer', [I(0)], () => {
          w.node('Version', [I(100)]);
          if (hasUv) w.node('LayerElement', [], () => { w.node('Type', ['LayerElementUV']); w.node('TypedIndex', [I(0)]); });
          if (g.materials.length) w.node('LayerElement', [], () => { w.node('Type', ['LayerElementMaterial']); w.node('TypedIndex', [I(0)]); });
        });
      });
      links.push([g.id, modelId.get(g.o.id)]);
      for (const m of g.materials) links.push([m, modelId.get(g.o.id)]);
      if (!g.blend) continue;
      w.node('Deformer', [L(g.blend), `${g.o.name}\0\u0001Deformer`, 'BlendShape'], () => { w.node('Version', [I(100)]); });
      links.push([g.blend, g.id]);
      for (const { key, channel, shape } of g.shapes) {
        const moved = [];
        g.o.data.verts.forEach((v, i) => { const d = [0, 1, 2].map((a) => key.verts[i][a] - v[a]); if (d.some((x) => Math.abs(x) > 1e-9)) moved.push([i, d]); });
        w.node('Geometry', [L(shape), `${key.name}\0\u0001Geometry`, 'Shape'], () => {
          w.node('Version', [I(100)]);
          w.node('Indexes', [{ kind: 'i', value: moved.map(([i]) => i) }]);
          w.node('Vertices', [{ kind: 'd', value: moved.flatMap(([, d]) => d) }]);
          w.node('Normals', [{ kind: 'd', value: moved.flatMap(() => [0, 0, 0]) }]);
        });
        w.node('Deformer', [L(channel), `${key.name}\0\u0001SubDeformer`, 'BlendShapeChannel'], () => {
          w.node('Version', [I(100)]);
          w.node('DeformPercent', [D((key.value ?? 0) * 100)]);
          w.node('FullWeights', [{ kind: 'd', value: [100] }]);
        });
        links.push([shape, channel]);
        links.push([channel, g.blend]);
      }
    }
    for (const o of objects) {
      const subtype = GEOMETRY_TYPES.has(o.type) && geoms.some((g) => g.o === o) ? 'Mesh' : o.type === 'CAMERA' ? 'Camera' : o.type === 'LIGHT' ? 'Light' : 'Null';
      modelNode(modelId.get(o.id), o.name, subtype, localOf(o));
      links.push([modelId.get(o.id), parented(o) ? modelId.get(o.parent) : 0]);
      if (subtype === 'Camera') {
        const attribute = newId();
        const c = { ...defaultCamera(), ...o.data };
        const r = doc.render ?? {};
        const [width, height] = [r.resX ?? 1920, r.resY ?? 1080];
        const film = c.sensor / 25.4;
        w.node('NodeAttribute', [L(attribute), `${o.name}\0\u0001NodeAttribute`, 'Camera'], () => {
          p70([
            ['AspectRatioMode', 'enum', '', '', I(2)], ['AspectWidth', 'double', 'Number', '', D(width)], ['AspectHeight', 'double', 'Number', '', D(height)],
            ['FilmWidth', 'double', 'Number', '', D(film)], ['FilmHeight', 'double', 'Number', '', D((film * height) / width)], ['FilmAspectRatio', 'double', 'Number', '', D(width / height)],
            ['ApertureMode', 'enum', '', '', I(3)], ['GateFit', 'enum', '', '', I(2)],
            ['FieldOfView', 'FieldOfView', '', 'A', D((2 * Math.atan(c.sensor / 2 / c.lens)) / DEG)],
            ['FocalLength', 'double', 'Number', 'A', D(c.lens)],
            ['CameraProjectionType', 'enum', '', '', I(c.kind === 'ORTHO' ? 1 : 0)], ['OrthoZoom', 'double', 'Number', '', D(c.orthoScale)],
            ['NearPlane', 'double', 'Number', '', D(c.clipStart)], ['FarPlane', 'double', 'Number', '', D(c.clipEnd)],
          ]);
          w.node('TypeFlags', ['Camera']);
          w.node('GeometryVersion', [I(124)]);
        });
        links.push([attribute, modelId.get(o.id)]);
      } else if (subtype === 'Light') {
        const attribute = newId();
        const l = { ...defaultLight(o.data?.kind), ...o.data };
        w.node('NodeAttribute', [L(attribute), `${o.name}\0\u0001NodeAttribute`, 'Light'], () => {
          const entries = [
            ['LightType', 'enum', '', '', I(Math.max(0, LIGHT_TYPES.indexOf(l.kind)))],
            ['Color', 'Color', '', 'A', D(l.color[0]), D(l.color[1]), D(l.color[2])],
            ['Intensity', 'Number', '', 'A', D(l.energy * 100)],
            ['CastShadows', 'bool', '', '', I(l.castShadow === false ? 0 : 1)],
          ];
          if (l.kind === 'SPOT') entries.push(['OuterAngle', 'double', 'Number', '', D(l.spotSize)], ['InnerAngle', 'double', 'Number', '', D(l.spotSize * (1 - l.spotBlend))]);
          p70(entries);
          w.node('TypeFlags', ['Light']);
          w.node('GeometryVersion', [I(124)]);
        });
        links.push([attribute, modelId.get(o.id)]);
      } else if (subtype === 'Null') {
        const attribute = newId();
        w.node('NodeAttribute', [L(attribute), `${o.name}\0\u0001NodeAttribute`, 'Null'], () => { w.node('TypeFlags', ['Null']); });
        links.push([attribute, modelId.get(o.id)]);
      }
    }
    for (const rig of rigs) {
      rig.o.data.bones.forEach((b, i) => {
        modelNode(rig.ids[i], b.name, 'LimbNode', boneLocalAt(rig, rig.rest, i));
        w.node('NodeAttribute', [L(rig.attributes[i]), `${b.name}\0\u0001NodeAttribute`, 'LimbNode'], () => {
          w.node('TypeFlags', ['Skeleton']);
          p70([['Size', 'double', 'Number', '', D(new Vector3(...b.head).distanceTo(new Vector3(...b.tail)) * 33)]]);
        });
        links.push([rig.attributes[i], rig.ids[i]]);
        links.push([rig.ids[i], b.parent != null ? rig.ids[b.parent] : modelId.get(rig.o.id)]);
      });
    }
    // Skins
    for (const g of geoms) {
      if (!g.rig) continue;
      const arm = g.rig.o;
      const [meshWorld, armWorld] = [worldMatrix(doc, g.o), worldMatrix(doc, arm)];
      w.node('Deformer', [L(g.skin), `\0\u0001Deformer`, 'Skin'], () => { w.node('Version', [I(101)]); w.node('Link_DeformAcuracy', [D(50)]); });
      links.push([g.skin, g.id]);
      arm.data.bones.forEach((b, i) => {
        const group = (g.mesh.vgroups ?? []).find((x) => x.name === b.name);
        const entries = Object.entries(group?.w ?? {}).filter(([, value]) => value > 0);
        if (!entries.length) return;
        // Normalized per vertex, as readers expect.
        const totals = {};
        for (const other of g.mesh.vgroups ?? []) for (const [v, value] of Object.entries(other.w)) totals[v] = (totals[v] ?? 0) + value;
        const cluster = newId();
        const link = new Matrix4().multiplyMatrices(armWorld, g.rig.rest[i]);
        w.node('Deformer', [L(cluster), `${b.name}\0\u0001SubDeformer`, 'Cluster'], () => {
          w.node('Version', [I(100)]);
          w.node('UserData', ['', '']);
          w.node('Indexes', [{ kind: 'i', value: entries.map(([v]) => Number(v)) }]);
          w.node('Weights', [{ kind: 'd', value: entries.map(([v, value]) => value / (totals[v] || 1)) }]);
          // From the mesh into the bone's space, not the mesh's place in the world.
          w.node('Transform', [{ kind: 'd', value: [...new Matrix4().copy(link).invert().multiply(meshWorld).elements] }]);
          w.node('TransformLink', [{ kind: 'd', value: [...link.elements] }]);
        });
        links.push([cluster, g.skin]);
        links.push([g.rig.ids[i], cluster]);
      });
    }
    // Materials and textures
    for (const { id, m } of materialIds.values()) {
      w.node('Material', [L(id), `${m.name}\0\u0001Material`, ''], () => {
        w.node('Version', [I(102)]);
        w.node('ShadingModel', ['phong']);
        const c = m.baseColor;
        p70([['DiffuseColor', 'Color', '', 'A', D(c[0]), D(c[1]), D(c[2])], ['DiffuseFactor', 'Number', '', 'A', D(1)], ['Shininess', 'Number', '', 'A', D(((1 - (m.roughness ?? 0.5)) * 10) ** 2)]]);
      });
      const image = images.get(id);
      if (!image) continue;
      const file = `${image.name}.${image.ext}`;
      w.node('Texture', [L(image.texture), `${image.name}\0\u0001Texture`, ''], () => {
        w.node('Type', ['TextureVideoClip']);
        w.node('Version', [I(202)]);
        w.node('TextureName', [`${image.name}\0\u0001Texture`]);
        w.node('Media', [`${image.name}\0\u0001Video`]);
        w.node('FileName', [file]);
        w.node('RelativeFilename', [file]);
      });
      w.node('Video', [L(image.video), `${image.name}\0\u0001Video`, 'Clip'], () => {
        w.node('Type', ['Clip']);
        w.node('FileName', [file]);
        w.node('RelativeFilename', [file]);
        w.node('Content', [{ kind: 'R', value: image.bytes }]);
      });
      links.push([image.video, image.texture]);
      links.push([image.texture, id, 'DiffuseColor']);
    }
    // Animation
    if (anim.nodes.length || anim.shapes.length) {
      w.node('AnimationStack', [L(anim.stack), 'Action\0\u0001AnimStack', ''], () => {
        const times = (anim.nodes[0] ?? anim.shapes[0]).times;
        p70([['LocalStart', 'KTime', 'Time', '', L(times[0])], ['LocalStop', 'KTime', 'Time', '', L(times.at(-1))], ['ReferenceStart', 'KTime', 'Time', '', L(times[0])], ['ReferenceStop', 'KTime', 'Time', '', L(times.at(-1))]]);
      });
      w.node('AnimationLayer', [L(anim.layer), 'Layer\0\u0001AnimLayer', '']);
      links.push([anim.layer, anim.stack]);
      for (const n of anim.nodes) {
        w.node('AnimationCurveNode', [L(n.id), `${n.property.split(' ')[1][0]}\0\u0001AnimCurveNode`, ''], () => {
          p70([['d|X', 'Number', '', 'A', D(n.first[0])], ['d|Y', 'Number', '', 'A', D(n.first[1])], ['d|Z', 'Number', '', 'A', D(n.first[2])]]);
        });
        links.push([n.id, anim.layer]);
        links.push([n.id, n.model, n.property]);
        for (const c of n.curves) {
          w.node('AnimationCurve', [L(c.id), '\0\u0001AnimCurve', ''], () => {
            w.node('Default', [D(c.values[0])]);
            w.node('KeyVer', [I(4008)]);
            w.node('KeyTime', [{ kind: 'l', value: n.times }]);
            w.node('KeyValueFloat', [{ kind: 'f', value: c.values }]);
            // All keys linear: one attribute over all of them.
            w.node('KeyAttrFlags', [{ kind: 'i', value: [4] }]);
            w.node('KeyAttrDataFloat', [{ kind: 'f', value: [0, 0, 0, 0] }]);
            w.node('KeyAttrRefCount', [{ kind: 'i', value: [n.times.length] }]);
          });
          links.push([c.id, n.id, `d|${c.axis}`]);
        }
      }
      for (const x of anim.shapes) {
        w.node('AnimationCurveNode', [L(x.id), 'DeformPercent\0\u0001AnimCurveNode', ''], () => { p70([['d|DeformPercent', 'Number', '', 'A', D(x.values[0])]]); });
        links.push([x.id, anim.layer]);
        links.push([x.id, x.channel, 'DeformPercent']);
        w.node('AnimationCurve', [L(x.curve), '\0\u0001AnimCurve', ''], () => {
          w.node('Default', [D(x.values[0])]);
          w.node('KeyVer', [I(4008)]);
          w.node('KeyTime', [{ kind: 'l', value: x.times }]);
          w.node('KeyValueFloat', [{ kind: 'f', value: x.values }]);
          w.node('KeyAttrFlags', [{ kind: 'i', value: [4] }]);
          w.node('KeyAttrDataFloat', [{ kind: 'f', value: [0, 0, 0, 0] }]);
          w.node('KeyAttrRefCount', [{ kind: 'i', value: [x.times.length] }]);
        });
        links.push([x.curve, x.id, 'd|DeformPercent']);
      }
    }
  });
  w.node('Connections', [], () => {
    for (const [child, parent, property] of links) {
      if (property) w.node('C', ['OP', L(child), L(parent), property]);
      else w.node('C', ['OO', L(child), L(parent)]);
    }
  });
  return finishFbx(w);
}
