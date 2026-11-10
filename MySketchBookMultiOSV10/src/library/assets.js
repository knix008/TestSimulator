// Downloaded asset library (library, filled by `npm run assets`): Poly Haven CC0 props as GLB,
// tiled PBR textures for the material presets and HDRIs (environments.js).
//
// Performance rules: a model is fetched and parsed once; every placement is a clone that SHARES its
// geometry and materials (one GPU upload, batched programs). Texture sets are shared the same way.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { setTextureHook } from '../engine/materials.js';
import { CATEGORIES } from './categories.js';
import { libraryUrl, setLibraryBase } from './environments.js';

export { libraryUrl, setLibraryBase };

const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

async function fetchJson(path) {
  const res = await fetch(libraryUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
  return res.json();
}

// ───────────────────────── models

let manifestPromise = null;
let manifestById = new Map();

/**
 * library/models/manifest.json → array of { id, file, ko, en, category, placement, size, tris, bytes, thumb, tags, author, license }.
 * Resolves to [] (with a console warning) when the library was not fetched, so the app still runs.
 */
export function loadAssetManifest({ reload = false } = {}) {
  if (manifestPromise && !reload) return manifestPromise;
  manifestPromise = fetchJson('models/manifest.json')
    .then((list) => { manifestById = new Map(list.map((e) => [e.id, e])); return list; })
    .catch((err) => { console.warn('Asset library not available (run npm run assets):', err.message); manifestPromise = null; return []; });
  return manifestPromise;
}

/** Where an asset goes: ceiling lamps hang, frames/mirrors/sconces go on walls, small things sit on surfaces. */
export function guessPlacement(entry) {
  if (entry.placement) return entry.placement;
  const words = new Set([...(entry.tags ?? []), ...String(entry.en ?? '').toLowerCase().split(/\s+/)]);
  const has = (...list) => list.some((w) => words.has(w));
  if (entry.category === 'lighting' && has('chandelier', 'pendant', 'ceiling', 'hanging')) return 'ceiling';
  if (has('frame', 'painting', 'mirror', 'sconce', 'wall') && !has('standing')) return 'wall';
  const [w = 1, h = 1, d = 1] = entry.size ?? [];
  return Math.max(w, d) < 0.7 && h < 0.6 ? 'surface' : 'floor';
}

const kebab = (id) => String(id).replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();

/** Catalog entries (ARCHITECTURE.md §12) for the manifest: kind 'asset', no params, `asset` = manifest id. */
export function assetCatalogItems(manifest) {
  return (manifest ?? []).map((entry) => ({
    id: `asset-${kebab(entry.id)}`,
    category: CATEGORY_IDS.has(entry.category) ? entry.category : 'decor',
    ko: entry.ko, en: entry.en,
    kind: 'asset',
    placement: guessPlacement(entry),
    size: entry.size,
    params: [],
    tags: entry.tags ?? [],
    asset: entry.id,
    thumb: entry.thumb ? libraryUrl(`models/${entry.thumb}`) : null,
    tris: entry.tris, bytes: entry.bytes,
    author: entry.author, license: entry.license ?? 'CC0',
  }));
}

let gltfLoader = null;
function loader() {
  if (!gltfLoader) { gltfLoader = new GLTFLoader(); gltfLoader.setMeshoptDecoder(MeshoptDecoder); }
  return gltfLoader;
}

/** Shared templates by id (Promise<Object3D>); clones are handed out. */
const templates = new Map();

/** Prepares a loaded scene once: shadows, texture filtering, and marks the shared resources. */
export function prepareTemplate(root, id) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      // Shared by every clone: owners must not dispose it with one instance.
      material.userData.shared = true;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) if (material[key]) material[key].anisotropy = textureOptions.anisotropy;
    }
    node.geometry.userData.shared = true;
  });
  root.userData.asset = id;
  return root;
}

/**
 * The model of a library asset as a THREE.Object3D (bottom centre at the origin, metres, front +Z).
 * Each call returns a new clone sharing geometry and materials with the cached template.
 */
export function loadAssetModel(id, { onProgress } = {}) {
  let template = templates.get(id);
  if (!template) {
    template = loadAssetManifest().then(() => new Promise((resolve, reject) => {
      const file = manifestById.get(id)?.file ?? `${id}.glb`;
      loader().load(libraryUrl(`models/${file}`),
        (gltf) => resolve(prepareTemplate(gltf.scene, id)),
        (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); },
        (err) => reject(Object.assign(new Error(`Asset ${id} failed to load: ${err?.message ?? err}`), { code: 'asset-load-failed', id })));
    }));
    template.catch(() => templates.delete(id));
    templates.set(id, template);
  }
  return template.then((root) => { onProgress?.(1); return root.clone(true); });
}

/** Adds a model under an id (the user's own imported objects) so loadAssetModel shares it the same way. */
export function registerAssetModel(id, object3D) {
  templates.set(id, Promise.resolve(prepareTemplate(object3D, id)));
}

export const isAssetLoaded = (id) => templates.has(id);

// ───────────────────────── material textures

const textureOptions = { anisotropy: 8, enabled: true };
let indexPromise = null;
const loadTextureIndex = () => (indexPromise ??= fetchJson('textures/index.json').catch((err) => { console.warn('Texture library not available:', err.message); return {}; }));

/** Base textures by `set/map`; per-repeat copies share the image (Source), so it is uploaded once. */
const baseTextures = new Map();
const tiledTextures = new Map();
let textureLoader = null;

function baseTexture(set, map) {
  const key = `${set}/${map}`;
  let promise = baseTextures.get(key);
  if (!promise) {
    textureLoader ??= new THREE.TextureLoader();
    // The set's file type: WebP once scripts/optimize-assets.mjs has run (index.json `ext`), JPEG before.
    promise = loadTextureIndex().then((index) => textureLoader.loadAsync(libraryUrl(`textures/${set}/${map}.${index[set]?.ext ?? 'jpg'}`)));
    promise.catch(() => baseTextures.delete(key));
    baseTextures.set(key, promise);
  }
  return promise;
}

async function tiledTexture(set, map, repeatX, repeatY) {
  const key = `${set}/${map}|${repeatX.toFixed(4)}|${repeatY.toFixed(4)}`;
  let texture = tiledTextures.get(key);
  if (texture) return texture;
  const base = await baseTexture(set, map);
  texture = tiledTextures.get(key);
  if (texture) return texture;
  texture = base.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = textureOptions.anisotropy;
  texture.colorSpace = map === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  tiledTextures.set(key, texture);
  return texture;
}

let texturesLoadedCallback = null;
/** Called (with the material) whenever a material received its textures, so the viewport can redraw. */
export function setOnTexturesLoaded(callback) { texturesLoadedCallback = callback; }

let pending = 0;
/** Number of materials still waiting for their textures (tests, "wait until ready" screenshots). */
export const texturesPending = () => pending;

/**
 * Colour factor for a textured material: preset (or user) colour ÷ the texture's average colour, so the
 * grain/weave stays but the average colour matches what the preset or the user picked.
 */
export function textureTint(targetHex, averageHex) {
  const target = new THREE.Color(targetHex);
  const average = new THREE.Color(averageHex ?? '#ffffff');
  const ratio = (t, a) => Math.min(4, t / Math.max(a, 0.01));
  return new THREE.Color(ratio(target.r, average.r), ratio(target.g, average.g), ratio(target.b, average.b));
}

/** Attaches a preset's texture set to a material (async; the material is usable meanwhile). */
export async function applyPresetTextures(spec, material) {
  if (!spec?.textures || !textureOptions.enabled) return false;
  pending++;
  try {
    const index = await loadTextureIndex();
    const info = index[spec.textures];
    if (!info) return false;
    // UVs are metres, so one tile covers the texture's real-world size (Poly Haven lists it);
    // a preset may override with `textureSize`, and `repeat` is the fallback.
    const [sizeX, sizeY] = spec.textureSize ? [spec.textureSize, spec.textureSize] : (info.size ?? [spec.repeat ?? 1, spec.repeat ?? 1]);
    const repeatX = 1 / (sizeX || 1), repeatY = 1 / (sizeY || sizeX || 1);
    const maps = info.maps ?? ['diff', 'nor', 'rough'];
    const loaded = Object.fromEntries(await Promise.all(maps.map(async (map) => [map, await tiledTexture(spec.textures, map, repeatX, repeatY)])));
    // A procedural pattern (engine/patterns.js) supplies the colour; the set then only adds its relief.
    if (loaded.diff && !spec.pattern) { material.map = loaded.diff; material.color.copy(textureTint(spec.color, info.avg)); }
    if (loaded.nor) material.normalMap = loaded.nor;
    if (loaded.rough) {
      material.roughnessMap = loaded.rough;
      // Keep the preset's average roughness: the map supplies variation around it.
      if (info.roughAvg) material.roughness = Math.min(2, spec.roughness / Math.max(info.roughAvg, 0.05));
    }
    if (loaded.ao) { material.aoMap = loaded.ao; material.aoMapIntensity = 0.8; }
    material.userData.textures = spec.textures;
    material.needsUpdate = true;
    texturesLoadedCallback?.(material);
    return true;
  } catch (err) {
    console.warn(`Textures for ${spec.id} not loaded:`, err.message);
    return false;
  } finally { pending--; }
}

/**
 * Hooks texture loading into materials.js: every material made for a preset with `textures` gets its
 * maps lazily. options: { anisotropy = 8, enabled = true } (enabled false = flat colours, e.g. low quality).
 */
export function installTextureHook(options = {}) {
  Object.assign(textureOptions, options);
  // The promise is returned: materials.js keeps it as material.userData.ready (thumbnails wait for the textures).
  setTextureHook((spec, material) => applyPresetTextures(spec, material));
}

/** Preloads the texture index (optional; the hook loads it on first use). */
export const preloadTextureIndex = () => loadTextureIndex();
