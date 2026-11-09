// Imports the user's own 3D files (glTF/GLB, OBJ+MTL, FBX, Collada, STL, 3DS, PLY, 3MF, USD/USDZ, VRML)
// as one THREE.Group in metres, Y up, bottom centre at the origin, with MeshStandardMaterials — so an
// imported model behaves like a library asset (shadows, shared materials, the paint bucket).
//
// The pure steps (unit guessing, axis, centring, material conversion, merging, stats) are exported
// separately so Node tests can check them without a DOM; the loaders themselves come from three.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { IMPORT_FORMATS, UNIT_SCALE, UNSUPPORTED_FORMATS, extOf } from './formats.js';

export const TRIANGLE_WARNING = 2_000_000;
/** Above this many meshes the model is merged per material (draw calls dominate otherwise). */
export const MERGE_MESH_THRESHOLD = 64;

/** An Error with a localisable `code` (formats.js / i18n hold the messages). */
export function importError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

const toUint8 = (bytes) => (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
const toArrayBuffer = (bytes) => {
  const u8 = toUint8(bytes);
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength ? u8.buffer : u8.slice().buffer;
};
const toText = (bytes) => new TextDecoder().decode(toUint8(bytes));

// ───────────────────────── format detection

/** Format id from the name, checked against the content where it is cheap (GLB magic, zip). */
export function detectFormat(name, bytes) {
  const ext = extOf(name);
  const unsupported = UNSUPPORTED_FORMATS.find((f) => f.ext.includes(ext));
  if (unsupported) throw importError(unsupported.code, unsupported.en, { ko: unsupported.ko, en: unsupported.en });
  const u8 = bytes ? toUint8(bytes) : null;
  if (u8 && u8.length >= 4 && u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) return 'gltf'; // 'glTF'
  const format = IMPORT_FORMATS.find((f) => f.ext.includes(ext));
  if (!format) throw importError('format-unsupported', `Unsupported 3D format: .${ext || '?'}`, { ext });
  return format.id;
}

// ───────────────────────── units and axes

/**
 * Guesses file units from the largest dimension (in file units). Interior objects are 0.05–20 m:
 * a 2000-unit sofa is millimetres, an 85-unit chair centimetres. `prior` = what the format usually means.
 */
export function guessUnits(maxDimension, prior = null) {
  const L = Math.abs(maxDimension);
  if (!Number.isFinite(L) || L === 0) return prior ?? 'm';
  if (prior === 'm') return L > 100 ? guessUnits(L) : 'm';         // glTF/USD/DAE are metres by spec; huge → mis-exported
  if (prior === 'mm') return L < 5 ? 'm' : 'mm';                   // STL/3MF: printing files are millimetres
  if (L > 1500) return 'mm';
  if (L > 50) return 'cm';
  return 'm';
}

/** What a format's numbers usually are (metres, millimetres, or unknown → guess by size). */
export const UNIT_PRIOR = { gltf: 'm', usdz: 'm', dae: 'm', vrml: 'm', stl: 'mm', '3mf': 'mm', obj: null, fbx: null, '3ds': null, ply: null };
/** Formats whose files are usually Z-up (CAD, printing, 3ds Max, Blender PLY) and which the loader does not rotate. */
export const Z_UP_FORMATS = new Set(['stl', '3ds', '3mf', 'ply']);

/** Resolves upAxis 'auto' for a format. Collada/FBX loaders convert axes themselves. */
export function resolveUpAxis(upAxis, format) {
  if (upAxis === 'y' || upAxis === 'z') return upAxis;
  return Z_UP_FORMATS.has(format) ? 'z' : 'y';
}

/** World-space bounding box of an object (updates matrices). */
export function boundsOf(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object, true);
}

/**
 * Puts `object` under a new Group that converts it to metres / Y up and (center) moves the bottom centre
 * of its bounds to the origin. Returns { group, units, unitsGuessed, upAxis, sizeMeters }.
 */
export function normalizeObject(object, { format = null, units = 'auto', upAxis = 'auto', center = true } = {}) {
  const axis = resolveUpAxis(upAxis, format);
  const inner = new THREE.Group();
  inner.name = 'imported-axis';
  inner.add(object);
  if (axis === 'z') inner.rotation.x = -Math.PI / 2; // Z up → Y up; the file's −Y front becomes +Z
  const raw = boundsOf(inner);
  const rawSize = raw.isEmpty() ? new THREE.Vector3() : raw.getSize(new THREE.Vector3());
  const guessed = units === 'auto' || !UNIT_SCALE[units];
  const chosen = guessed ? guessUnits(Math.max(rawSize.x, rawSize.y, rawSize.z), UNIT_PRIOR[format] ?? null) : units;
  const scale = UNIT_SCALE[chosen];
  inner.scale.setScalar(scale);
  if (center && !raw.isEmpty()) {
    const c = raw.getCenter(new THREE.Vector3());
    inner.position.set(-c.x * scale, -raw.min.y * scale, -c.z * scale);
  }
  const group = new THREE.Group();
  group.name = 'imported';
  group.add(inner);
  group.updateMatrixWorld(true);
  const size = rawSize.multiplyScalar(scale);
  return { group, units: chosen, unitsGuessed: guessed, upAxis: axis, sizeMeters: [size.x, size.y, size.z].map((v) => Math.round(v * 1e4) / 1e4) };
}

// ───────────────────────── materials

const MAP_KEYS = ['map', 'normalMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap', 'bumpMap', 'displacementMap', 'roughnessMap', 'metalnessMap'];

/** Phong/Lambert/Basic/Toon → MeshStandardMaterial keeping colours, maps and transparency. Standard/Physical pass through. */
export function toStandardMaterial(material) {
  if (!material || material.isMeshStandardMaterial) return material;
  const standard = new THREE.MeshStandardMaterial();
  standard.name = material.name;
  if (material.color) standard.color.copy(material.color);
  if (material.emissive) standard.emissive.copy(material.emissive);
  standard.emissiveIntensity = material.emissiveIntensity ?? 1;
  for (const key of MAP_KEYS) if (material[key] && key in standard) standard[key] = material[key];
  if (material.normalScale) standard.normalScale.copy(material.normalScale);
  if (material.bumpScale !== undefined) standard.bumpScale = material.bumpScale;
  standard.opacity = material.opacity;
  standard.transparent = material.transparent || material.opacity < 1;
  if (standard.transparent) standard.depthWrite = material.opacity > 0.95 ? material.depthWrite : false;
  standard.alphaTest = material.alphaTest;
  standard.side = material.side;
  standard.vertexColors = material.vertexColors;
  standard.flatShading = material.flatShading ?? false;
  standard.wireframe = material.wireframe ?? false;
  // Blinn-Phong shininess → GGX roughness (the usual √(2/(n+2)) mapping); Lambert/Basic are matte.
  const shininess = material.isMeshPhongMaterial ? material.shininess : 0;
  standard.roughness = THREE.MathUtils.clamp(Math.sqrt(2 / (shininess + 2)), 0.04, 1);
  // Bright, tinted specular suggests metal.
  standard.metalness = material.specular && material.isMeshPhongMaterial && material.specular.getHSL({}).l > 0.6 && shininess > 60 ? 0.6 : 0;
  if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
  if (material.emissiveMap) material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  standard.userData = { ...material.userData, convertedFrom: material.type };
  return standard;
}

/** Converts every material in the tree (shared materials stay shared); fixes missing normals. */
export function convertMaterials(root) {
  const converted = new Map();
  const convert = (material) => {
    if (!material) return new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7 });
    if (!converted.has(material.uuid)) converted.set(material.uuid, toStandardMaterial(material));
    return converted.get(material.uuid);
  };
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
    const geometry = node.geometry;
    if (geometry && !geometry.attributes.normal && geometry.attributes.position) geometry.computeVertexNormals();
    if (geometry?.attributes.color && !node.material.vertexColors && !Array.isArray(node.material)) node.material.vertexColors = true;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return converted.size;
}

// ───────────────────────── merging

/**
 * Merges the meshes of `root` per material into a few big meshes (baked into root space). Skinned,
 * morphing and instanced meshes are kept as they are. Returns a new Group, or `root` when nothing merges.
 */
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const keep = [];
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences?.length || Array.isArray(node.material) || !node.visible) { keep.push(node); return; }
    const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, node.matrixWorld));
    // Same attribute set needed to merge: drop extras not every mesh has (uv1, tangents…), keep position/normal/uv/color.
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) geometry.deleteAttribute(name);
    for (const name of Object.keys(geometry.morphAttributes)) delete geometry.morphAttributes[name];
    geometry.clearGroups();
    const key = `${node.material.uuid}|${Object.keys(geometry.attributes).sort().join(',')}`;
    if (!buckets.has(key)) buckets.set(key, { material: node.material, geometries: [] });
    buckets.get(key).geometries.push(geometry);
  });
  if (!buckets.size) return root;
  const group = new THREE.Group();
  group.name = root.name;
  for (const { material, geometries } of buckets.values()) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = material.name || 'merged';
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const node of keep) {
    const clone = node.clone();
    clone.matrixAutoUpdate = false;
    clone.matrix.multiplyMatrices(inverseRoot, node.matrixWorld);
    group.add(clone);
  }
  return group;
}

// ───────────────────────── statistics

export function computeStats(root) {
  let meshes = 0, triangles = 0;
  const materials = new Set(), textures = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    meshes++;
    const g = node.geometry;
    const count = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    triangles += Math.floor(count / 3) * (node.isInstancedMesh ? node.count : 1);
    for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!m) continue;
      materials.add(m.uuid);
      for (const key of MAP_KEYS) if (m[key]) textures.add(m[key].source?.uuid ?? m[key].uuid);
    }
  });
  const box = boundsOf(root);
  const size = box.isEmpty() ? [0, 0, 0] : box.getSize(new THREE.Vector3()).toArray().map((v) => Math.round(v * 1e4) / 1e4);
  return { meshes, triangles, materials: materials.size, textures: textures.size, sizeMeters: size };
}

// ───────────────────────── side files (textures, .mtl, .bin)

/**
 * A LoadingManager that serves the user's side files from memory: any URL a loader asks for is matched by
 * its path or base name (case-insensitive) against `related` and answered with a blob: URL.
 */
export function relatedFilesManager(related, missing) {
  const manager = new THREE.LoadingManager();
  const byName = new Map();
  const urls = [];
  for (const [name, bytes] of related ?? []) {
    const clean = String(name).replace(/\\/g, '/').toLowerCase();
    byName.set(clean, bytes);
    byName.set(clean.split('/').pop(), bytes);
  }
  const blobUrls = new Map();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    const clean = decodeURIComponent(String(url).split(/[?#]/)[0]).replace(/\\/g, '/').toLowerCase();
    const base = clean.split('/').pop();
    const bytes = byName.get(clean) ?? byName.get(clean.replace(/^\.\//, '')) ?? byName.get(base);
    if (!bytes) { missing?.add(base); return url; }
    if (!blobUrls.has(base)) {
      const type = /\.(png)$/.test(base) ? 'image/png' : /\.(jpe?g)$/.test(base) ? 'image/jpeg' : /\.webp$/.test(base) ? 'image/webp' : 'application/octet-stream';
      const href = URL.createObjectURL(new Blob([toUint8(bytes)], { type }));
      urls.push(href);
      blobUrls.set(base, href);
    }
    return blobUrls.get(base);
  });
  manager.revoke = () => { for (const href of urls) URL.revokeObjectURL(href); };
  return manager;
}

/**
 * Tracks the manager's requests; `wait()` resolves at once when nothing was requested, else when the last
 * side file (textures arrive after parse() returns) has loaded or failed.
 */
function trackManager(manager) {
  let started = false, finished = false;
  const waiters = [];
  const { onStart, onLoad } = manager;
  manager.onStart = (...a) => { started = true; finished = false; onStart?.(...a); };
  manager.onLoad = (...a) => { finished = true; onLoad?.(...a); waiters.splice(0).forEach((resolve) => resolve()); };
  return { wait: () => (!started || finished ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve))) };
}

// ───────────────────────── parsing per format

/** Parses the bytes with three's loader for the format. Returns a THREE.Object3D. */
export async function parseModel(format, bytes, { manager, name = '', related } = {}) {
  const ext = extOf(name);
  switch (format) {
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
      const data = ext === 'gltf' ? toText(bytes) : toArrayBuffer(bytes);
      const gltf = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
      return gltf.scene ?? gltf.scenes?.[0];
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const text = toText(bytes);
      const loader = new OBJLoader(manager);
      const mtlName = /^\s*mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
      const mtl = findRelated(related, mtlName) ?? findRelated(related, null, 'mtl');
      if (mtl) {
        const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
        const creator = new MTLLoader(manager).parse(toText(mtl), '');
        creator.preload();
        loader.setMaterials(creator);
      }
      return loader.parse(text);
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      return new FBXLoader(manager).parse(toArrayBuffer(bytes), '');
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      const result = new ColladaLoader(manager).parse(toText(bytes), '');
      if (!result?.scene) throw importError('parse-failed', 'Collada file has no scene');
      return result.scene;
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      return meshFromGeometry(new STLLoader(manager).parse(toArrayBuffer(bytes)), name);
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geometry = new PLYLoader(manager).parse(toArrayBuffer(bytes));
      // Point clouds (no faces) become points, everything else a mesh.
      if (!geometry.index) {
        return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.005, vertexColors: Boolean(geometry.attributes.color) }));
      }
      return meshFromGeometry(geometry, name);
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
      return new TDSLoader(manager).parse(toArrayBuffer(bytes), '');
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return new ThreeMFLoader(manager).parse(toArrayBuffer(bytes));
    }
    case 'usdz': {
      const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js');
      const loader = new USDLoader(manager);
      const data = ext === 'usda' ? toText(bytes) : toArrayBuffer(bytes);
      return await new Promise((resolve, reject) => { try { loader.parse(data, '', resolve, reject); } catch (err) { reject(err); } });
    }
    case 'vrml': {
      const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js');
      return new VRMLLoader(manager).parse(toText(bytes), '');
    }
    default:
      throw importError('format-unsupported', `Unsupported 3D format: ${format}`);
  }
}

function findRelated(related, name, ext = null) {
  if (!related) return null;
  for (const [key, bytes] of related) {
    const base = String(key).replace(/\\/g, '/').split('/').pop().toLowerCase();
    if (name && base === String(name).replace(/\\/g, '/').split('/').pop().toLowerCase()) return bytes;
    if (!name && ext && base.endsWith(`.${ext}`)) return bytes;
  }
  return null;
}

/** STL/PLY give a bare geometry: wrap it in a mesh (vertex colours when the file has them). */
export function meshFromGeometry(geometry, name = '') {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: geometry.attributes.color ? 0xffffff : 0xb8b8b8, roughness: 0.6, vertexColors: Boolean(geometry.attributes.color) });
  material.name = 'imported';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = String(name).replace(/\.[^.]+$/, '') || 'mesh';
  return mesh;
}

// ───────────────────────── the whole import

/**
 * importModel({ name, bytes, related? }, options) → { object, stats, warnings }
 *   options: units 'auto'|'mm'|'cm'|'m'|'in'|'ft' · upAxis 'auto'|'y'|'z' · center (true) · optimize (true)
 *            onProgress(fraction, phase) with phase 'parse' | 'materials' | 'optimize' | 'normalize' | 'done'
 * Errors carry `code`: 'skp-unsupported', 'format-unsupported', 'parse-failed', 'empty-model'.
 */
export async function importModel(file, options = {}) {
  const { units = 'auto', upAxis = 'auto', center = true, optimize = true, onProgress } = options;
  const progress = async (fraction, phase) => { onProgress?.(fraction, phase); await nextFrame(); };
  const format = detectFormat(file.name, file.bytes);
  const warnings = [];
  const missing = new Set();
  const manager = relatedFilesManager(file.related, missing);
  const tracker = trackManager(manager);

  await progress(0.05, 'parse');
  let object;
  try {
    object = await parseModel(format, file.bytes, { manager, name: file.name, related: file.related });
  } catch (err) {
    manager.revoke();
    if (err.code) throw err;
    throw importError('parse-failed', `Could not read ${file.name}: ${err.message ?? err}`, { cause: err, format });
  }
  if (!object) { manager.revoke(); throw importError('empty-model', `${file.name} contains no 3D objects`); }

  await progress(0.5, 'materials');
  const materialCount = convertMaterials(object);
  if (materialCount === 0 && !object.isPoints) {
    let any = false; object.traverse((n) => { if (n.isMesh || n.isPoints || n.isLine) any = true; });
    if (!any) { manager.revoke(); throw importError('empty-model', `${file.name} contains no meshes`); }
  }

  let meshCount = 0; object.traverse((n) => { if (n.isMesh) meshCount++; });
  if (optimize && meshCount > MERGE_MESH_THRESHOLD) {
    await progress(0.65, 'optimize');
    const before = meshCount;
    object = mergeByMaterial(object);
    let after = 0; object.traverse((n) => { if (n.isMesh) after++; });
    if (after < before) warnings.push({ code: 'merged', before, after, en: `Merged ${before} meshes into ${after} for speed`, ko: `빠른 표시를 위해 메시 ${before}개를 ${after}개로 합쳤습니다` });
  }

  await progress(0.8, 'normalize');
  const norm = normalizeObject(object, { format, units, upAxis, center });
  norm.group.name = String(file.name).replace(/\.[^.]+$/, '');
  norm.group.userData.import = { name: file.name, format, units: norm.units, upAxis: norm.upAxis };
  if (norm.unitsGuessed) warnings.push({ code: 'units-guessed', units: norm.units, en: `Units guessed as ${norm.units}`, ko: `단위를 ${norm.units}(으)로 추정했습니다` });

  // Textures referenced by the file load asynchronously; wait for them (bounded) so stats/screens are complete.
  let timer;
  await Promise.race([tracker.wait(), new Promise((r) => { timer = setTimeout(r, 15000); })]);
  clearTimeout(timer);
  for (const name of missing) warnings.push({ code: 'missing-file', file: name, en: `Missing file: ${name}`, ko: `파일이 없습니다: ${name}` });

  const stats = computeStats(norm.group);
  stats.units = norm.units;
  stats.upAxis = norm.upAxis;
  stats.format = format;
  if (stats.triangles > TRIANGLE_WARNING) warnings.push({ code: 'too-many-triangles', triangles: stats.triangles, en: `Very heavy model: ${stats.triangles.toLocaleString()} triangles (drawing may slow down)`, ko: `매우 무거운 모델입니다: 삼각형 ${stats.triangles.toLocaleString()}개 (화면이 느려질 수 있습니다)` });
  if (Math.max(...stats.sizeMeters) > 200) warnings.push({ code: 'very-large', size: stats.sizeMeters, en: 'The model is larger than 200 m — check the units', ko: '모델이 200 m보다 큽니다 — 단위를 확인하세요' });
  // Blob URLs must outlive texture decoding; revoke after the images are in.
  if (missing.size || file.related?.size) setTimeout(() => manager.revoke(), 60000).unref?.();
  else manager.revoke();
  await progress(1, 'done');
  return { object: norm.group, stats, warnings };
}
