// Imports the user's own 3D files (glTF/GLB with Draco/KTX2, OBJ+MTL, FBX, Collada, STL, 3DS, PLY, 3MF,
// USD/USDZ, VRML, AMF, LightWave, VTK, OFF, KMZ, point clouds (PCD/XYZ), CAD solids (STEP/IGES/BREP),
// Rhino 3DM and .zip bundles) as one THREE.Group in metres, Y up, bottom centre at the origin, with
// MeshStandardMaterials — so an imported model behaves like a library asset (shadows, shared materials,
// the paint bucket). The format list lives in formats.js.
//
// The pure steps (unit guessing, axis, centring, material conversion, merging, stats) are exported
// separately so Node tests can check them without a DOM; the loaders themselves come from three.
// Heavy readers (OpenCASCADE for STEP/IGES/BREP, rhino3dm, the Draco and Basis decoders) are WebAssembly
// files shipped with the app and loaded only when a file needs them — never from the network.
import * as THREE from 'three';
import { unzipSync } from 'fflate';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Loaded with the app anyway (library/assets.js and the KTX2 texture reader use them): no dynamic import needed.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
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
// (STEP/IGES/AMF/3DM files state their units: the readers set userData.fileUnits and no guess is made.)
export const UNIT_PRIOR = { gltf: 'm', usdz: 'm', dae: 'm', vrml: 'm', lwo: 'm', stl: 'mm', '3mf': 'mm', brep: 'mm', amf: 'mm', obj: null, fbx: null, '3ds': null, ply: null, off: null, vtk: null, pcd: null, xyz: null };
/** Formats whose files are usually Z-up (CAD, printing, 3ds Max, Blender PLY, Rhino, scanners) and which the loader does not rotate. */
export const Z_UP_FORMATS = new Set(['stl', '3ds', '3mf', 'ply', 'step', 'iges', 'brep', '3dm', 'amf', 'pcd', 'xyz']);

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
    if (!node.isMesh) { if (node.isPoints || node.isLine) keep.push(node); return; } // point clouds, CAD curves
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
    const clone = node.clone(false); // its children are visited (and placed) on their own
    clone.matrixAutoUpdate = false;
    clone.matrix.multiplyMatrices(inverseRoot, node.matrixWorld);
    group.add(clone);
  }
  return group;
}

// ───────────────────────── statistics

export function computeStats(root) {
  let meshes = 0, triangles = 0, points = 0;
  const materials = new Set(), textures = new Set();
  root.traverse((node) => {
    if (node.isPoints) points += node.geometry.attributes.position?.count ?? 0;
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
  return { meshes, triangles, points, materials: materials.size, textures: textures.size, sizeMeters: size };
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
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
      await useGltfDecoders(loader, gltfExtensions(bytes));
      const data = ext === 'gltf' ? toText(bytes) : toArrayBuffer(bytes);
      const gltf = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
      const scene = gltf.scene ?? gltf.scenes?.[0];
      if (scene) uncompressTextures(scene);
      return scene;
    }
    case 'step': case 'iges': case 'brep': {
      const object = cadToObject(await readCad(format, bytes), name);
      // Asked in metres (STEP/IGES carry their units); BREP has none — OpenCASCADE's millimetres.
      object.userData.fileUnits = format === 'brep' ? 'mm' : 'm';
      return object;
    }
    case '3dm': {
      const { Rhino3dmLoader } = await import('three/examples/jsm/loaders/3DMLoader.js');
      rhinoLoader ??= new Rhino3dmLoader(await decoderManager()).setLibraryPath('');
      const object = await rhinoLoader.parseAsync(toUint8(bytes).slice().buffer); // the buffer moves to a worker
      const units = rhinoUnits(object.userData?.settings?.modelUnitSystem);
      if (units) object.userData.fileUnits = units;
      rhinoDisplayColours(object);
      return object;
    }
    case 'amf': {
      const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js');
      const object = new AMFLoader(manager).parse(toArrayBuffer(bytes));
      object.userData.fileUnits = 'mm'; // the loader scales every AMF unit to millimetres
      return object;
    }
    case 'lwo': {
      const { LWOLoader } = await import('three/examples/jsm/loaders/LWOLoader.js');
      const { meshes } = new LWOLoader(manager).parse(toArrayBuffer(bytes), '', String(name).replace(/\.[^.]+$/, ''));
      const group = new THREE.Group();
      for (const mesh of meshes) group.add(mesh);
      frontSideOnly(group);
      return group;
    }
    case 'vtk': {
      const { VTKLoader } = await import('three/examples/jsm/loaders/VTKLoader.js');
      return meshOrPoints(new VTKLoader(manager).parse(toArrayBuffer(bytes)), name);
    }
    case 'off':
      return meshFromGeometry(parseOff(toText(bytes)), name);
    case 'pcd': {
      const { PCDLoader } = await import('three/examples/jsm/loaders/PCDLoader.js');
      const points = new PCDLoader(manager).parse(toArrayBuffer(bytes));
      return makePoints(points.geometry, name);
    }
    case 'xyz': {
      const { XYZLoader } = await import('three/examples/jsm/loaders/XYZLoader.js');
      return makePoints(new XYZLoader(manager).parse(cleanXyz(toText(bytes))), name);
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
      return meshOrPoints(new PLYLoader(manager).parse(toArrayBuffer(bytes)), name);
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

/** Point clouds (PLY/VTK without faces, PCD, XYZ) stay points; sizePoints() gives them a dot size once in metres. */
export function makePoints(geometry, name = '') {
  const material = new THREE.PointsMaterial({ size: 0.01, color: geometry.attributes.color ? 0xffffff : 0x8a8f96, vertexColors: Boolean(geometry.attributes.color) });
  material.name = 'points';
  const points = new THREE.Points(geometry, material);
  points.name = String(name).replace(/\.[^.]+$/, '') || 'points';
  return points;
}
/**
 * LWOLoader mirrors x (LightWave is left-handed) and draws the then inside-out faces with BackSide. glTF has no
 * BackSide (the model is stored as GLB), so the winding is reversed instead and the faces drawn FrontSide.
 */
export function frontSideOnly(root) {
  const flipped = new Set();
  const meshes = [];
  root.traverse((node) => { if (node.isMesh && [node.material].flat().every((m) => m?.side === THREE.BackSide)) meshes.push(node); });
  for (const node of meshes) {
    const materials = [node.material].flat();
    const g = node.geometry;
    if (flipped.has(g)) continue;
    if (g.index) { const a = g.index.array; for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; } else {
      for (const attribute of Object.values(g.attributes)) {
        const { array: a, itemSize: n } = attribute;
        for (let v = 0; v + 2 < attribute.count; v += 3) for (let k = 0; k < n; k++) { const t = a[(v + 1) * n + k]; a[(v + 1) * n + k] = a[(v + 2) * n + k]; a[(v + 2) * n + k] = t; }
        attribute.needsUpdate = true;
      }
    }
    const normal = g.attributes.normal; // the loader's normals follow the inside-out winding
    if (normal) { for (let i = 0; i < normal.array.length; i++) normal.array[i] = -normal.array[i]; normal.needsUpdate = true; }
    flipped.add(g);
    for (const m of materials) m.side = THREE.FrontSide;
  }
}

const meshOrPoints = (geometry, name) => (geometry.index ? meshFromGeometry(geometry, name) : makePoints(geometry, name));

/**
 * Dot size of every point cloud from its density (metres, after normalising): about the spacing of the points on
 * the cloud's surfaces, so scans read as surfaces without blobbing. Meshing a scan is a separate job (it guesses
 * surfaces and needs normals most files lack); clouds are placed and moved like any object.
 */
export function sizePoints(root) {
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isPoints) return;
    const count = node.geometry.attributes.position?.count ?? 0;
    const s = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
    const area = Math.max(2 * (s.x * s.y + s.y * s.z + s.z * s.x), 1e-6);
    const size = THREE.MathUtils.clamp(2 * Math.sqrt(area / Math.max(count, 1)), 0.002, 0.05);
    for (const m of [node.material].flat()) if (m?.isPointsMaterial) { m.size = size; m.sizeAttenuation = true; }
    node.userData.pointSize = size; // kept in the stored GLB (extras): GLTFLoader brings points back 1 px wide
  });
}

/** XYZ text → what XYZLoader reads: commas as separators; x y z (+ r g b when they look like 0–255 colours). */
export function cleanXyz(text) {
  return text.split(/\r?\n/).map((line) => {
    const v = line.trim().replace(/[,;]/g, ' ').split(/\s+/);
    if (!line.trim() || line.trim().startsWith('#') || v.length < 3 || v.slice(0, 3).some((x) => !Number.isFinite(Number(x)))) return '';
    const rgb = v.slice(3, 6);
    return (rgb.length === 3 && rgb.every((x) => /^\d+$/.test(x) && Number(x) <= 255) ? v.slice(0, 6) : v.slice(0, 3)).join(' ');
  }).filter(Boolean).join('\n');
}

/**
 * OFF (Object File Format: OFF / COFF / NOFF / STOFF headers, ASCII) → BufferGeometry. Polygons are fanned
 * into triangles; vertex colours (COFF) and per-face colours are kept as vertex colours.
 */
export function parseOff(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const head = lines.shift()?.split(/\s+/) ?? [];
  const kind = head.shift() ?? '';
  if (!/^(ST)?C?N?4?n?OFF$/.test(kind)) throw importError('parse-failed', 'Not an OFF file (the first line must be OFF)');
  if (head[0] === 'BINARY') throw importError('parse-failed', 'Binary OFF files are not supported (save as ASCII OFF)');
  const counts = (head.length >= 2 ? head : lines.shift()?.split(/\s+/) ?? []).map(Number);
  const [nv, nf] = counts;
  if (!(nv > 0) || !(nf >= 0) || lines.length < nv + nf) throw importError('parse-failed', 'OFF file is truncated');
  const hasNormal = kind.includes('N'), hasColor = kind.includes('C');
  const colour = (vals) => { const c = vals.slice(0, 3).map(Number); return c.some((x) => x > 1) ? c.map((x) => x / 255) : c; };
  const pos = [], vcol = [];
  for (let i = 0; i < nv; i++) {
    const v = lines[i].split(/\s+/).map(Number);
    pos.push(v[0], v[1], v[2]);
    if (hasColor) vcol.push(...colour(v.slice(hasNormal ? 6 : 3)));
  }
  const tris = [], fcol = [];
  for (let i = 0; i < nf; i++) {
    const v = lines[nv + i].split(/\s+/).map(Number);
    const n = v[0];
    const extra = v.slice(1 + n);
    const c = extra.length >= 3 ? colour(extra) : null;
    for (let k = 1; k + 1 < n; k++) { tris.push(v[1], v[1 + k], v[2 + k]); fcol.push(c, c, c); }
  }
  const geometry = new THREE.BufferGeometry();
  if (fcol.some(Boolean)) {
    // Face colours: unshared corners so each face keeps its own colour.
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((i) => pos.slice(i * 3, i * 3 + 3)), 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(tris.flatMap((i, k) => fcol[k] ?? (hasColor ? vcol.slice(i * 3, i * 3 + 3) : [0.75, 0.75, 0.75])), 3));
  } else {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (hasColor) geometry.setAttribute('color', new THREE.Float32BufferAttribute(vcol, 3));
    geometry.setIndex(tris);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ───────────────────────── CAD solids (STEP / IGES / BREP) via OpenCASCADE

const CAD_PARAMS = { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };

/**
 * Tessellates a STEP/IGES/BREP file with occt-import-js: in a worker in the browser (big assemblies take seconds),
 * directly in Node (tests). Returns its result { success, root: { name, meshes, children }, meshes: [...] }.
 */
export async function readCad(format, bytes) {
  const buffer = toUint8(bytes).slice().buffer; // moves to the worker
  if (typeof Worker === 'function' && typeof window !== 'undefined') {
    const worker = new Worker(new URL('./cad-worker.js', import.meta.url), { type: 'module' });
    try {
      const reply = await new Promise((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => reject(new Error(event.message || 'the CAD reader could not start'));
        worker.postMessage({ format, buffer, params: CAD_PARAMS }, [buffer]);
      });
      if (reply.error) throw new Error(reply.error);
      return reply.result;
    } finally { worker.terminate(); } // frees OpenCASCADE's memory (~100 MB) until the next CAD file
  }
  const spec = 'occt-import-js'; // Node only: kept out of the web bundle (the worker carries its own copy)
  const occtimportjs = (await import(/* @vite-ignore */ spec)).default;
  occtModule ??= occtimportjs();
  return (await occtModule).ReadFile(format, new Uint8Array(buffer), CAD_PARAMS);
}
let occtModule = null;

/** occt-import-js result → a Group mirroring the file's assembly tree; face colours become (shared) materials. */
export function cadToObject(result, name = '') {
  if (!result?.success) throw importError('parse-failed', 'OpenCASCADE could not read the CAD file');
  const materials = new Map();
  const materialOf = (rgb) => {
    const color = rgb ? new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace) : new THREE.Color(0xb8b8b8);
    const key = color.getHexString();
    if (!materials.has(key)) materials.set(key, Object.assign(new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0 }), { name: `#${key}` }));
    return materials.get(key);
  };
  const meshes = (result.meshes ?? []).map((m, i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
    if (m.attributes.normal) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
    geometry.setIndex(m.index.array);
    const faces = (m.brep_faces ?? []).filter((f) => f.color);
    let material = materialOf(m.color);
    if (faces.length) {
      // Faces coloured unlike their solid: one draw group per face (index ranges are in triangles).
      const list = [];
      for (const f of m.brep_faces) {
        const mat = f.color ? materialOf(f.color) : material;
        let slot = list.indexOf(mat);
        if (slot < 0) slot = list.push(mat) - 1;
        geometry.addGroup(f.first * 3, (f.last - f.first + 1) * 3, slot);
      }
      material = list.length === 1 ? list[0] : list;
      if (list.length === 1) geometry.clearGroups();
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = m.name || `${String(name).replace(/\.[^.]+$/, '')}-${i + 1}`;
    return mesh;
  });
  const used = new Set();
  const build = (node) => {
    const group = new THREE.Group();
    group.name = node?.name ?? '';
    for (const i of node?.meshes ?? []) if (meshes[i]) group.add(used.has(i) ? meshes[i].clone() : (used.add(i), meshes[i]));
    for (const child of node?.children ?? []) group.add(build(child));
    return group;
  };
  const root = build(result.root);
  if (!root.name) root.name = String(name).replace(/\.[^.]+$/, '');
  return root;
}

// ───────────────────────── Rhino, Draco, KTX2: decoders shipped with the app (never fetched from a CDN)

let rhinoLoader = null, dracoLoader = null, ktx2Loader = null;

/** A LoadingManager answering the decoders' file requests (draco_decoder.wasm, rhino3dm.js …) with the shipped copies. */
async function decoderManager() {
  let DECODER_URLS;
  try { ({ DECODER_URLS } = await import('./decoders.js')); } catch (err) { throw importError('parse-failed', `The decoder for this file is not available here (${err.message ?? err})`); }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => DECODER_URLS[String(url).split(/[?#]/)[0].split('/').pop()] ?? url);
  return manager;
}

/** Rhino's model unit system (enum value or name) → our unit, when it is one we know. */
export function rhinoUnits(system) {
  const value = typeof system === 'object' ? system?.value ?? system?.name : system;
  const byValue = { 2: 'mm', 3: 'cm', 4: 'm', 8: 'in', 9: 'ft' };
  if (byValue[value]) return byValue[value];
  const n = String(value ?? '').toLowerCase();
  return /milli/.test(n) ? 'mm' : /centi/.test(n) ? 'cm' : /^(unitsystem_)?meters?$/.test(n) ? 'm' : /inch/.test(n) ? 'in' : /feet|foot/.test(n) ? 'ft' : null;
}

/**
 * Objects without a render material get the 3DM loader's white, 80 % metal default; Rhino shows them in their
 * display colour (layer or object colour), so that colour is used — as a matte material, shared per colour.
 */
export function rhinoDisplayColours(root) {
  const byColour = new Map();
  root.traverse((node) => {
    const c = node.userData?.attributes?.drawColor;
    if (!node.isMesh || !c || node.material?.name !== THREE.Loader.DEFAULT_MATERIAL_NAME) return;
    const colour = new THREE.Color().setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
    const key = colour.getHexString();
    if (!byColour.has(key)) byColour.set(key, new THREE.MeshStandardMaterial({ name: `#${key}`, color: colour, roughness: 0.6, metalness: 0, side: node.material.side, vertexColors: node.material.vertexColors }));
    node.material = byColour.get(key);
  });
}

/** extensionsUsed/Required of a glTF or GLB (read from its JSON without parsing the rest). */
export function gltfExtensions(bytes) {
  const u8 = toUint8(bytes);
  try {
    let json;
    if (u8[0] === 0x67 && u8[1] === 0x6c && u8[2] === 0x54 && u8[3] === 0x46) {
      const length = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint32(12, true);
      json = new TextDecoder().decode(u8.subarray(20, 20 + length));
    } else json = toText(u8);
    const data = JSON.parse(json);
    return new Set([...(data.extensionsUsed ?? []), ...(data.extensionsRequired ?? [])]);
  } catch { return new Set(); }
}

/**
 * Draco meshes and KTX2/Basis textures: the decoders are set up only for files that use them, with the local
 * decoder files of decoders.js (see there why the loaders' own default paths are not enough).
 */
async function useGltfDecoders(loader, used) {
  if (used.has('KHR_draco_mesh_compression')) {
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
    dracoLoader ??= new DRACOLoader(await decoderManager());
    loader.setDRACOLoader(dracoLoader);
  }
  if (used.has('KHR_texture_basisu')) {
    if (!ktx2Loader) {
      ktx2Loader = new KTX2Loader(await decoderManager());
      // Transcode to plain RGBA (no GPU formats): the model is re-saved as GLB in the project, and the glTF
      // exporter writes ordinary pixels only; it also needs no renderer here.
      ktx2Loader.workerConfig = { astcSupported: false, astcHDRSupported: false, etc1Supported: false, etc2Supported: false, dxtSupported: false, bptcSupported: false, pvrtcSupported: false };
    }
    loader.setKTX2Loader(ktx2Loader);
  }
}

/** Uncompressed "compressed" textures (KTX2 transcoded to RGBA) → DataTextures the exporter and renderer both take. */
export function uncompressTextures(root) {
  const done = new Map();
  const convert = (texture) => {
    if (!texture?.isCompressedTexture || texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType) return texture;
    if (done.has(texture.uuid)) return done.get(texture.uuid);
    const level = texture.mipmaps?.[0];
    if (!level?.data) return texture;
    const data = new THREE.DataTexture(level.data, level.width, level.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    for (const key of ['name', 'mapping', 'channel', 'wrapS', 'wrapT', 'anisotropy', 'colorSpace', 'flipY', 'userData']) data[key] = texture[key];
    data.offset.copy(texture.offset); data.repeat.copy(texture.repeat); data.center.copy(texture.center); data.rotation = texture.rotation;
    data.magFilter = THREE.LinearFilter; data.minFilter = THREE.LinearMipmapLinearFilter; data.generateMipmaps = true;
    data.needsUpdate = true;
    done.set(texture.uuid, data);
    return data;
  };
  root.traverse((node) => {
    for (const m of [node.material].flat()) {
      if (!m) continue;
      for (const key of Object.keys(m)) if (m[key]?.isTexture) m[key] = convert(m[key]);
    }
  });
}

// ───────────────────────── .zip bundles and KMZ

/** Which file of a bundle is the model: glTF/GLB, then FBX, OBJ, Collada, then any other readable format. */
const BUNDLE_ORDER = ['gltf', 'fbx', 'obj', 'dae'];

/**
 * A .zip (model + textures / .mtl / .bin) or .kmz (KML + Collada) → { name, bytes, related } like picking all
 * those files: the main model is chosen (by BUNDLE_ORDER, then the shallowest), everything else is a side file.
 * KMZ goes this way rather than through KMZLoader so its textures resolve like any side file's.
 */
export function unpackBundle(file) {
  let entries;
  try { entries = unzipSync(toUint8(file.bytes)); } catch (err) { throw importError('parse-failed', `${file.name} is not a readable ZIP archive (${err.message ?? err})`); }
  const files = Object.entries(entries).filter(([path, data]) => !path.endsWith('/') && data.length && !/(^|\/)(__MACOSX|\.DS_Store)/.test(path));
  const formatOf = (path) => IMPORT_FORMATS.find((f) => f.ext.includes(extOf(path)) && f.id !== 'zip' && f.id !== 'kmz')?.id ?? null;
  const rank = (path) => { const i = BUNDLE_ORDER.indexOf(formatOf(path)); return i < 0 ? BUNDLE_ORDER.length : i; };
  const depth = (path) => path.split('/').length;
  // KMZ: the KML names its model (<Model><Link><href>models/x.dae</href>).
  const kml = files.find(([path]) => /\.kml$/i.test(path));
  const href = kml ? /<Model[\s\S]*?<href>\s*([^<]+?)\s*<\/href>/i.exec(new TextDecoder().decode(kml[1]))?.[1] : null;
  const candidates = files.filter(([path]) => formatOf(path)).sort((a, b) => rank(a[0]) - rank(b[0]) || depth(a[0]) - depth(b[0]) || a[0].localeCompare(b[0]));
  const main = (href && candidates.find(([path]) => path.toLowerCase().endsWith(href.replace(/^\.?\//, '').toLowerCase()))) || candidates[0];
  if (!main) {
    const unsupported = files.find(([path]) => UNSUPPORTED_FORMATS.some((f) => f.ext.includes(extOf(path))));
    if (unsupported) detectFormat(unsupported[0]); // throws its explanation (e.g. SketchUp)
    throw importError('zip-no-model', `${file.name} contains no 3D model file`);
  }
  const related = new Map(file.related ?? []);
  for (const [path, data] of files) if (path !== main[0]) related.set(path, data);
  return { name: main[0].split('/').pop(), bytes: main[1], related, bundle: file.name };
}

// ───────────────────────── the whole import

/**
 * importModel({ name, bytes, related? }, options) → { object, stats, warnings }
 *   options: units 'auto'|'mm'|'cm'|'m'|'in'|'ft' · upAxis 'auto'|'y'|'z' · center (true) · optimize (true)
 *            onProgress(fraction, phase) with phase 'parse' | 'materials' | 'optimize' | 'normalize' | 'done'
 * Errors carry `code`: 'skp-unsupported', 'format-unsupported', 'parse-failed', 'empty-model', 'zip-no-model'.
 */
export async function importModel(file, options = {}) {
  const { units = 'auto', upAxis = 'auto', center = true, optimize = true, onProgress } = options;
  const progress = async (fraction, phase) => { onProgress?.(fraction, phase); await nextFrame(); };
  const format = detectFormat(file.name, file.bytes);
  if (format === 'zip' || format === 'kmz') {
    const inner = unpackBundle(file);
    const result = await importModel(inner, options);
    result.stats.bundle = file.name;
    return result;
  }
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
  // Files that state their units (STEP, IGES, AMF, 3DM) need no guess unless the user picked units.
  const fileUnits = units === 'auto' && UNIT_SCALE[object.userData?.fileUnits] ? object.userData.fileUnits : units;
  const norm = normalizeObject(object, { format, units: fileUnits, upAxis, center });
  sizePoints(norm.group);
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
