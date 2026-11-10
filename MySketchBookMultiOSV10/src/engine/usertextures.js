// The user's own pictures, kept in the project (project.assets[id] = { kind: 'texture' | 'environment', name,
// ext, bytes }, the bytes in the .msk as assets/<id>.<ext>): textures of custom materials and environments.
//
// Custom material spec (document.materials[], engine/materials.js) with pictures:
//   { id, ko, en, color /* tint */, roughness, metalness, maps: { color, normal, roughness } /* asset ids */,
//     textureSize: [w, h] /* metres one tile covers (UVs are metres) */ }
// The materials.js hook calls applyUserTextures(spec, material): decoded textures are shared per asset,
// tiled per material; a texture still decoding is attached when it arrives (onTexturesLoaded → redraw).
import * as THREE from 'three';
// The decoders (three loaders) load on first use, not with the app.
const io = () => import('../io/textures.js');

/** Map slots of a custom material and the material property each fills. */
export const TEXTURE_SLOTS = [['color', 'map'], ['normal', 'normalMap'], ['roughness', 'roughnessMap']];

let source = () => null;
let rendererOf = () => null;
let loadedCallback = null;

/**
 * Wires the store in: `bytesOf(assetId)` → { name, bytes } | null (the open document's assets),
 * `renderer()` → the 3D view's renderer (KTX2 needs it), `onLoaded(material)` after late textures.
 */
export function configureUserTextures({ bytesOf, renderer, onLoaded } = {}) {
  if (bytesOf) source = bytesOf;
  if (renderer) rendererOf = renderer;
  if (onLoaded) loadedCallback = onLoaded;
}

const decoded = new Map(); // asset id → Promise<THREE.Texture>
const ready = new Map(); // asset id → THREE.Texture (resolved)
const tiled = new Map(); // `${asset}|${slot}|${rx}|${ry}` → texture

/** A texture decoded elsewhere (the import) joins the cache, so the new material shows it at once. */
export function primeTexture(assetId, texture) {
  ready.set(assetId, texture);
  decoded.set(assetId, Promise.resolve(texture));
}

/** The decoded texture of an asset (shared; cached). */
export function assetTexture(assetId) {
  if (decoded.has(assetId)) return decoded.get(assetId);
  const file = source(assetId);
  if (!file) return Promise.reject(Object.assign(new Error(`texture ${assetId} is missing`), { code: 'texture-missing' }));
  const promise = io().then((m) => m.decodeTexture(file.name, file.bytes, { renderer: rendererOf() })).then((texture) => { ready.set(assetId, texture); return texture; });
  promise.catch(() => decoded.delete(assetId));
  decoded.set(assetId, promise);
  return promise;
}

/** Forgets decoded textures (another project opened). */
export function clearUserTextures() {
  for (const texture of tiled.values()) texture.dispose();
  for (const texture of ready.values()) texture.dispose();
  decoded.clear(); ready.clear(); tiled.clear();
}

/** One tiled copy (shares the GPU image) per asset, slot and tile size. */
function tiledTexture(assetId, base, slot, repeatX, repeatY) {
  const key = `${assetId}|${slot}|${repeatX}|${repeatY}`;
  let texture = tiled.get(key);
  if (texture) return texture;
  texture = base.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  // Colour pictures are sRGB (HDR data is linear); data maps (normal, roughness) are not colours.
  if (slot === 'color') { if (!base.isCompressedTexture || base.colorSpace === THREE.NoColorSpace) texture.colorSpace = base.userData?.hdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace; }
  else texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  tiled.set(key, texture);
  return texture;
}

/** Metres covered by one tile → [repeatX, repeatY] for metre UVs. */
export function tileRepeat(textureSize) {
  const [w, h] = Array.isArray(textureSize) ? textureSize : [textureSize ?? 1, textureSize ?? 1];
  const sx = Number(w) > 0 ? Number(w) : 1;
  const sy = Number(h) > 0 ? Number(h) : sx;
  return [1 / sx, 1 / sy];
}

function attach(spec, material, slot, prop, assetId, base) {
  const [rx, ry] = tileRepeat(spec.textureSize);
  material[prop] = tiledTexture(assetId, base, slot, rx, ry);
  if (slot === 'roughness') material.roughness = 1; // the map gives the roughness
  if (slot === 'normal' && /(^|[_\-. ])(dx|directx)([_\-. ]|$)|nor_?dx|normal_?dx/i.test(base.name ?? '')) material.normalScale.set(1, -1);
  material.needsUpdate = true;
}

/** materials.js hook: attaches a custom material's pictures (at once when decoded, else when they arrive). */
export function applyUserTextures(spec, material) {
  const maps = spec?.maps;
  if (!maps) return;
  for (const [slot, prop] of TEXTURE_SLOTS) {
    const assetId = maps[slot];
    if (!assetId) continue;
    const now = ready.get(assetId);
    if (now) { attach(spec, material, slot, prop, assetId, now); continue; }
    assetTexture(assetId).then((base) => { attach(spec, material, slot, prop, assetId, base); loadedCallback?.(material, spec); })
      .catch((error) => console.warn(`Texture ${assetId} of ${spec.id} not loaded:`, error.message));
  }
}

// ───────────────────────── environments

const environments = new Map(); // asset id → Promise<{ equirect, width, height }>

/** Decoded equirect panorama of an environment asset (shared; cached). */
export function assetEnvironment(assetId) {
  if (environments.has(assetId)) return environments.get(assetId);
  const file = source(assetId);
  if (!file) return Promise.reject(Object.assign(new Error(`environment ${assetId} is missing`), { code: 'texture-missing' }));
  const promise = io().then((m) => m.decodeEnvironment(file.name, file.bytes)).then(({ texture, width, height }) => ({ equirect: texture, width, height }));
  promise.catch(() => environments.delete(assetId));
  environments.set(assetId, promise);
  return promise;
}

/** An environment decoded by the import joins the cache. */
export function primeEnvironment(assetId, decodedEnv) { environments.set(assetId, Promise.resolve({ equirect: decodedEnv.texture, width: decodedEnv.width, height: decodedEnv.height })); }

export function clearUserEnvironments() { environments.clear(); }

/** Environment ids in the project style: 'user:<asset id>'. */
export const USER_ENV_PREFIX = 'user:';
export const isUserEnvironment = (id) => String(id ?? '').startsWith(USER_ENV_PREFIX);
export const userEnvironmentAsset = (id) => (isUserEnvironment(id) ? String(id).slice(USER_ENV_PREFIX.length) : null);
