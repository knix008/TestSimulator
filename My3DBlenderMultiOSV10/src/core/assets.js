// The asset library: ready-made materials and objects (built in), and anything marked as an asset in the file or saved to the
// user's own library. An asset is plain data: { id, name, kind: 'MATERIAL'|'OBJECT', catalog, material?, object? }.
import { activeObject, addObject, defaultMaterial, getMaterial, newId, selectOnly } from './doc.js';
import { cubeMesh, coneMesh, cylinderMesh, icoSphereMesh, planeMesh, torusMesh, uvSphereMesh } from './mesh.js';
import { catmullClark } from './modifiers.js';
import { renderImage, buildRenderScene, toDisplay } from './pathtracer.js';
import { createDocument, defaultCamera, defaultLight, selectedObjects } from './doc.js';

const mat = (id, en, ko, catalog, values) => ({ id: `lib_${id}`, name: { en, ko }, kind: 'MATERIAL', catalog, builtin: true, material: { baseColor: [0.8, 0.8, 0.8], metallic: 0, roughness: 0.5, specular: 0.5, ior: 1.45, transmission: 0, alpha: 1, emission: [0, 0, 0], emissionStrength: 1, ...values } });
const obj = (id, en, ko, catalog, build, smooth = false) => ({ id: `lib_${id}`, name: { en, ko }, kind: 'OBJECT', catalog, builtin: true, build, smooth });

export const BUILTIN_ASSETS = [
  mat('gold', 'Gold', '금', 'Metal', { baseColor: [1, 0.76, 0.33], metallic: 1, roughness: 0.2 }),
  mat('silver', 'Silver', '은', 'Metal', { baseColor: [0.97, 0.96, 0.91], metallic: 1, roughness: 0.15 }),
  mat('copper', 'Copper', '구리', 'Metal', { baseColor: [0.95, 0.64, 0.54], metallic: 1, roughness: 0.25 }),
  mat('steel', 'Brushed Steel', '브러시드 스틸', 'Metal', { baseColor: [0.56, 0.57, 0.58], metallic: 1, roughness: 0.45 }),
  mat('glass', 'Clear Glass', '투명 유리', 'Glass', { baseColor: [1, 1, 1], transmission: 1, roughness: 0, ior: 1.5 }),
  mat('frosted', 'Frosted Glass', '젖빛 유리', 'Glass', { baseColor: [0.95, 0.98, 1], transmission: 1, roughness: 0.35, ior: 1.5 }),
  mat('water', 'Water', '물', 'Glass', { baseColor: [0.85, 0.95, 1], transmission: 1, roughness: 0.02, ior: 1.33 }),
  mat('plastic_red', 'Red Plastic', '빨간 플라스틱', 'Plastic', { baseColor: [0.75, 0.05, 0.05], roughness: 0.35 }),
  mat('plastic_blue', 'Blue Plastic', '파란 플라스틱', 'Plastic', { baseColor: [0.05, 0.2, 0.7], roughness: 0.35 }),
  mat('rubber', 'Black Rubber', '검은 고무', 'Plastic', { baseColor: [0.02, 0.02, 0.02], roughness: 0.85 }),
  mat('clay', 'Clay', '점토', 'Matte', { baseColor: [0.65, 0.5, 0.4], roughness: 0.9 }),
  mat('concrete', 'Concrete', '콘크리트', 'Matte', { baseColor: [0.5, 0.5, 0.48], roughness: 0.95 }),
  mat('neon', 'Neon Light', '네온 빛', 'Light', { baseColor: [0, 0, 0], emission: [0.2, 0.9, 1], emissionStrength: 6 }),
  mat('lamp', 'Warm Lamp', '따뜻한 전구', 'Light', { baseColor: [0, 0, 0], emission: [1, 0.75, 0.45], emissionStrength: 10 }),
  obj('rounded_cube', 'Rounded Cube', '둥근 큐브', 'Shapes', () => catmullClark(catmullClark(cubeMesh(2))), true),
  obj('ball', 'Smooth Ball', '매끈한 공', 'Shapes', () => uvSphereMesh(48, 24, 1), true),
  obj('gem', 'Gem', '보석', 'Shapes', () => icoSphereMesh(1, 1)),
  obj('ring', 'Ring', '반지', 'Shapes', () => torusMesh(64, 16, 1, 0.12), true),
  obj('post', 'Post', '기둥', 'Shapes', () => cylinderMesh(32, 0.2, 3), true),
  obj('cone', 'Cone', '원뿔', 'Shapes', () => coneMesh(32, 1, 2)),
  obj('floor', 'Studio Floor', '스튜디오 바닥', 'Stage', () => planeMesh(20)),
];

export const assetName = (asset, language = 'en') => (typeof asset.name === 'string' ? asset.name : asset.name[language] ?? asset.name.en);

/** Marked data in the file, as assets. */
export function fileAssets(doc) {
  const out = [];
  for (const o of doc.objects) if (o.asset) out.push({ id: o.id, name: o.name, kind: 'OBJECT', catalog: o.asset.catalog ?? 'File', source: 'file', object: packObject(doc, o) });
  for (const m of doc.materials) if (m.asset) out.push({ id: m.id, name: m.name, kind: 'MATERIAL', catalog: m.asset.catalog ?? 'File', source: 'file', material: packMaterial(m) });
  return out;
}

const packMaterial = (m) => { const { id, asset, ...rest } = structuredClone(m); void id; void asset; return rest; };

function packObject(doc, o) {
  const { id, parent, parentInverse, asset, anim, cache, ...rest } = structuredClone(o);
  void id; void parent; void parentInverse; void asset; void anim; void cache;
  rest.materials = (o.materials ?? []).map((mid) => { const m = getMaterial(doc, mid); return m ? packMaterial(m) : null; });
  return rest;
}

/** A copy of something for the user's own library (or null). */
export function packAsset(doc, target) {
  if (target.type) return { id: newId('asset'), name: target.name, kind: 'OBJECT', catalog: 'My Library', object: packObject(doc, target) };
  return { id: newId('asset'), name: target.name, kind: 'MATERIAL', catalog: 'My Library', material: packMaterial(target) };
}

const newMaterial = (doc, values, name) => {
  const m = { ...defaultMaterial(name), ...structuredClone(values), name };
  m.id = newId('mat');
  doc.materials.push(m);
  return m;
};

/**
 * Uses an asset: a material goes on the active object (and its selected companions), an object appears at the 3D cursor.
 * Returns what was made, or null when a material has nothing to go on.
 */
export function applyAsset(doc, asset, language = 'en') {
  const name = assetName(asset, language);
  if (asset.kind === 'MATERIAL') {
    const targets = [...new Set([activeObject(doc), ...selectedObjects(doc)])].filter((o) => o && ['MESH', 'CURVE', 'TEXT', 'META', 'SURFACE'].includes(o.type));
    if (!targets.length) return null;
    const m = newMaterial(doc, asset.material, name);
    for (const o of targets) { if (o.materials.length) o.materials[0] = m.id; else o.materials.push(m.id); }
    return m;
  }
  let init;
  if (asset.build) {
    const mesh = asset.build();
    mesh.smooth = asset.smooth;
    init = { type: 'MESH', data: mesh };
  } else {
    const { materials, ...rest } = structuredClone(asset.object);
    init = { ...rest, materials: (materials ?? []).map((v) => (v ? newMaterial(doc, v, v.name).id : null)) };
  }
  const added = addObject(doc, { ...init, name, location: [...doc.cursor], collection: doc.activeCollection });
  selectOnly(doc, added);
  return added;
}

/** A small rendered picture of an asset: { width, height, rgba }. */
export function assetPreview(asset, size = 72, samples = 6) {
  const doc = createDocument();
  doc.world.color = [0.55, 0.57, 0.62];
  doc.render = { ...doc.render, samples, bounces: 3, width: size, height: size, percent: 100, seed: 3 };
  let shape;
  if (asset.kind === 'MATERIAL') {
    const m = newMaterial(doc, asset.material, 'Preview');
    shape = addObject(doc, { type: 'MESH', name: 'Ball', data: { ...uvSphereMesh(24, 12, 1), smooth: true }, materials: [m.id] });
  } else if (asset.build) {
    shape = addObject(doc, { type: 'MESH', name: 'Shape', data: { ...asset.build(), smooth: asset.smooth } });
  } else {
    const { materials, ...rest } = structuredClone(asset.object);
    shape = addObject(doc, { ...rest, name: 'Shape', parent: null, location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: (materials ?? []).map((v) => (v ? newMaterial(doc, v, v.name ?? 'M').id : null)) });
  }
  void shape;
  addObject(doc, { type: 'LIGHT', name: 'L', location: [3, -3, 5], data: { ...defaultLight('POINT'), energy: 400 } });
  const camera = addObject(doc, { type: 'CAMERA', name: 'C', location: [0, -4.4, 2.4], rotation: [61, 0, 0], data: { ...defaultCamera(), lens: 50 } });
  doc.activeCamera = camera.id;
  const image = renderImage(buildRenderScene(doc), { samples });
  return { width: size, height: size, rgba: toDisplay(image, { viewTransform: 'STANDARD' }) };
}
