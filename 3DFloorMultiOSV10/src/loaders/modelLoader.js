import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/addons/loaders/TDSLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { AMFLoader } from 'three/addons/loaders/AMFLoader.js';
import { PCDLoader } from 'three/addons/loaders/PCDLoader.js';
import { XYZLoader } from 'three/addons/loaders/XYZLoader.js';
import { VRMLLoader } from 'three/addons/loaders/VRMLLoader.js';
import { GCodeLoader } from 'three/addons/loaders/GCodeLoader.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import { VOXLoader, buildMesh } from 'three/addons/loaders/VOXLoader.js';
import { VTKLoader } from 'three/addons/loaders/VTKLoader.js';
import { KMZLoader } from 'three/addons/loaders/KMZLoader.js';

/** Extensions handled as 3D scene content (not floor-plan images). */
export const MODEL_EXTENSIONS = [
  'glb', 'gltf',
  'obj', 'mtl',
  'stl',
  'fbx',
  'ply',
  'dae',
  '3ds',
  '3mf',
  'amf',
  'pcd',
  'xyz',
  'wrl', 'vrml',
  'gcode',
  'usdz', 'usd', 'usda', 'usdc',
  'vox',
  'vtk', 'vtp',
  'kmz',
];

const PRIMARY_MODEL_EXTENSIONS = MODEL_EXTENSIONS.filter((ext) => ext !== 'mtl');

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg',
]);

const ACCEPT_MODELS = PRIMARY_MODEL_EXTENSIONS.map((ext) => `.${ext}`).join(',');
export const ACCEPT_OPEN_FILES = `${ACCEPT_MODELS},image/*`;
export const ACCEPT_MODEL_FILES = ACCEPT_MODELS;

/** Preferred open order when multiple model files are selected together. */
const PRIMARY_ORDER = [
  'glb', 'gltf', 'fbx', 'usdz', 'usd', 'usda', 'usdc',
  'obj', 'dae', 'kmz', '3ds', '3mf', 'vox',
  'stl', 'ply', 'vtk', 'vtp', 'amf', 'pcd', 'xyz', 'wrl', 'vrml', 'gcode',
];

let dracoLoader = null;

function getExt(name = '') {
  const base = String(name).split(/[\\/]/).pop() || '';
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i + 1).toLowerCase() : '';
}

function fileBaseName(name = '') {
  return String(name).split(/[\\/]/).pop().toLowerCase();
}

export function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(getExt(file.name));
}

export function isModelFile(file) {
  if (!file) return false;
  return PRIMARY_MODEL_EXTENSIONS.includes(getExt(file.name));
}

export function isSupportedOpenFile(file) {
  return isImageFile(file) || isModelFile(file);
}

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    // Bundled with the app under public/draco/gltf (works offline / Electron)
    const base = import.meta.env.BASE_URL || '/';
    dracoLoader.setDecoderPath(`${base}draco/gltf/`);
  }
  return dracoLoader;
}

function defaultMeshMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xc8d0dc,
    roughness: 0.55,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
}

function toLitMaterial(mat) {
  if (!mat) return defaultMeshMaterial();
  // MeshBasicMaterial ignores lights — convert so light moves change shading
  if (mat.isMeshBasicMaterial) {
    return new THREE.MeshStandardMaterial({
      color: mat.color?.clone?.() ?? new THREE.Color(0xc8d0dc),
      map: mat.map ?? null,
      transparent: Boolean(mat.transparent),
      opacity: mat.opacity ?? 1,
      side: mat.side ?? THREE.DoubleSide,
      roughness: 0.65,
      metalness: 0.05,
      alphaMap: mat.alphaMap ?? null,
      alphaTest: mat.alphaTest ?? 0,
    });
  }
  if (mat.side == null) mat.side = THREE.DoubleSide;
  if (mat.transparent && mat.opacity === 0) mat.opacity = 1;
  return mat;
}

function prepareObject(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (!child.material) {
        child.material = defaultMeshMaterial();
        return;
      }
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => toLitMaterial(m));
      } else {
        child.material = toLitMaterial(child.material);
      }
    }
    if (child.isPoints && child.material) {
      child.material.sizeAttenuation = child.material.sizeAttenuation !== false;
      if (child.material.size == null) child.material.size = 0.05;
    }
  });
  return object;
}

/**
 * Center on origin, scale to a readable size, and sit on the ground plane (y=0).
 * Makes wildly different source units display consistently.
 */
function normalizeModel(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return object;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  wrapper.name = object.name ? `${object.name}_normalized` : 'NormalizedModel';
  wrapper.add(object);

  object.position.x -= center.x;
  object.position.y -= center.y;
  object.position.z -= center.z;

  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  wrapper.scale.setScalar(4 / maxDim);
  wrapper.updateMatrixWorld(true);

  const grounded = new THREE.Box3().setFromObject(wrapper);
  if (!grounded.isEmpty()) {
    wrapper.position.y -= grounded.min.y;
  }
  return wrapper;
}

function geometryToMesh(geometry, name) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, defaultMeshMaterial());
  mesh.name = name || 'Model';
  return prepareObject(mesh);
}

function createUrlMap(files) {
  const urlMap = new Map();
  const urls = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    urls.push(url);
    urlMap.set(fileBaseName(file.name), url);
  }
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const key = fileBaseName(url.split('?')[0]);
    return urlMap.get(key) || url;
  });
  return {
    manager,
    urlFor(file) {
      return urlMap.get(fileBaseName(file.name));
    },
    revoke() {
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}

function pickPrimaryModel(files) {
  return [...files]
    .filter((f) => PRIMARY_MODEL_EXTENSIONS.includes(getExt(f.name)))
    .sort((a, b) => {
      const ai = PRIMARY_ORDER.indexOf(getExt(a.name));
      const bi = PRIMARY_ORDER.indexOf(getExt(b.name));
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
    })[0] || null;
}

function loadWithLoader(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function loadByExtension(ext, url, manager, files, urlFor) {
  switch (ext) {
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader(manager);
      loader.setDRACOLoader(getDracoLoader());
      const gltf = await loadWithLoader(loader, url);
      return prepareObject(gltf.scene || gltf.scenes?.[0]);
    }
    case 'obj': {
      const objLoader = new OBJLoader(manager);
      const mtlFile = [...files].find((f) => getExt(f.name) === 'mtl');
      if (mtlFile) {
        const mtlLoader = new MTLLoader(manager);
        const mats = await loadWithLoader(mtlLoader, urlFor(mtlFile));
        mats.preload();
        objLoader.setMaterials(mats);
      }
      return prepareObject(await loadWithLoader(objLoader, url));
    }
    case 'stl':
      return geometryToMesh(await loadWithLoader(new STLLoader(manager), url), 'STL');
    case 'fbx':
      return prepareObject(await loadWithLoader(new FBXLoader(manager), url));
    case 'ply':
      return geometryToMesh(await loadWithLoader(new PLYLoader(manager), url), 'PLY');
    case 'dae': {
      const collada = await loadWithLoader(new ColladaLoader(manager), url);
      return prepareObject(collada.scene);
    }
    case '3ds':
      return prepareObject(await loadWithLoader(new TDSLoader(manager), url));
    case '3mf':
      return prepareObject(await loadWithLoader(new ThreeMFLoader(manager), url));
    case 'amf':
      return prepareObject(await loadWithLoader(new AMFLoader(manager), url));
    case 'pcd':
      return prepareObject(await loadWithLoader(new PCDLoader(manager), url));
    case 'xyz': {
      const geometry = await loadWithLoader(new XYZLoader(manager), url);
      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ size: 0.05, color: 0x88aacc, sizeAttenuation: true }),
      );
      points.name = 'XYZ';
      return points;
    }
    case 'wrl':
    case 'vrml':
      return prepareObject(await loadWithLoader(new VRMLLoader(manager), url));
    case 'gcode':
      return prepareObject(await loadWithLoader(new GCodeLoader(manager), url));
    case 'usdz':
    case 'usd':
    case 'usda':
    case 'usdc': {
      const model = await loadWithLoader(new USDLoader(manager), url);
      return prepareObject(model);
    }
    case 'vox': {
      const result = await loadWithLoader(new VOXLoader(manager), url);
      if (result?.scene) return prepareObject(result.scene);
      const chunks = result?.chunks || (Array.isArray(result) ? result : []);
      const group = new THREE.Group();
      group.name = 'VOX';
      for (const chunk of chunks) {
        if (chunk?.data) group.add(buildMesh(chunk));
      }
      if (!group.children.length) throw i18nErr('error.modelLoad', { name: 'VOX' });
      return prepareObject(group);
    }
    case 'vtk':
    case 'vtp':
      return geometryToMesh(await loadWithLoader(new VTKLoader(manager), url), 'VTK');
    case 'kmz': {
      const kmz = await loadWithLoader(new KMZLoader(manager), url);
      return prepareObject(kmz.scene || kmz);
    }
    default:
      throw i18nErr('error.unsupportedFormat', { name: ext || '?' });
  }
}

function i18nErr(key, vars = {}) {
  return new Error(`i18n:${JSON.stringify({ key, vars })}`);
}

/**
 * Load one or more dropped/selected files as a Three.js Object3D.
 * Companion resources (e.g. .mtl, .bin, textures) resolve by file name.
 */
export async function loadModelFromFiles(fileList) {
  const files = [...(fileList || [])].filter(Boolean);
  if (!files.length) {
    throw i18nErr('error.selectModel');
  }

  const primary = pickPrimaryModel(files);
  if (!primary) {
    throw i18nErr('error.unsupportedFormat', { name: files[0]?.name || '?' });
  }

  const { manager, urlFor, revoke } = createUrlMap(files);
  const url = urlFor(primary);
  const ext = getExt(primary.name);

  try {
    let object = await loadByExtension(ext, url, manager, files, urlFor);
    if (!object) {
      throw i18nErr('error.modelLoad', { name: primary.name });
    }
    object.name = object.name || primary.name;
    object = normalizeModel(object);
    object.name = primary.name;
    return { object, fileName: primary.name, format: ext };
  } catch (err) {
    if (String(err?.message || '').startsWith('i18n:')) throw err;
    const wrapped = i18nErr('error.modelLoad', { name: primary.name });
    wrapped.cause = err;
    throw wrapped;
  } finally {
    revoke();
  }
}
