// Image-based lighting: Poly Haven CC0 HDRIs in library/hdri (fetched by
// scripts/fetch-assets.mjs, which reads this list), prefiltered with PMREM for
// reflections/ambient light, plus the equirect texture for showing as background.
// roomEnvironment() needs no download (three's procedural RoomEnvironment).
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * `file` = 1k (always present); `file2k` = sharper background for the main ones.
 * `polyhaven` = the source asset id (licence list, fetch script).
 */
export const ENVIRONMENTS = [
  { id: 'lythwood_room', ko: '밝은 거실 (흐린 낮)', en: 'Bright living room (overcast day)', kind: 'interior', main: true },
  { id: 'hotel_room', ko: '호텔 객실', en: 'Hotel room', kind: 'interior' },
  { id: 'relax_inn_seaview_suite', ko: '바다 전망 스위트룸', en: 'Sea-view suite', kind: 'interior' },
  { id: 'studio_small_08', ko: '촬영 스튜디오', en: 'Photo studio', kind: 'studio', main: true },
  { id: 'kloofendal_48d_partly_cloudy_puresky', ko: '맑은 낮 하늘', en: 'Daylight sky', kind: 'exterior', main: true },
  { id: 'overcast_soil_puresky', ko: '흐린 하늘', en: 'Overcast sky', kind: 'exterior' },
  { id: 'venice_sunset', ko: '해 질 녘', en: 'Sunset', kind: 'exterior' },
  { id: 'satara_night', ko: '밤', en: 'Night', kind: 'exterior' },
].map((env) => ({
  ...env,
  polyhaven: env.id,
  file: `hdri/${env.id}.hdr`,
  file2k: env.main ? `hdri/${env.id}_2k.hdr` : null,
  thumb: `hdri/thumbs/${env.id}.webp`,
}));

/** Base URL of library: relative to the page so Vite dev, the web build and Tauri all resolve it. */
let libraryBase = null;
export function setLibraryBase(url) { libraryBase = url; }
export function libraryUrl(path) {
  const base = libraryBase ?? new URL('library/', globalThis.document?.baseURI ?? globalThis.location?.href ?? 'http://localhost/').href;
  return new URL(path, base).href;
}

// PMREM results are per renderer (GPU resources); key = renderer + id + quality.
const cache = new WeakMap();
const cacheFor = (renderer) => { let map = cache.get(renderer); if (!map) cache.set(renderer, map = new Map()); return map; };

/**
 * Loads an HDRI and prefilters it. Resolves to { texture (PMREM, for scene.environment), background (equirect) }.
 * options.quality: '2k' uses the sharper file when there is one (background); lighting is identical.
 */
export function loadEnvironment(id, renderer, { quality = '1k', onProgress } = {}) {
  const env = ENVIRONMENTS.find((item) => item.id === id);
  if (!env) return Promise.reject(Object.assign(new Error(`Unknown environment ${id}`), { code: 'env-unknown' }));
  const file = quality === '2k' && env.file2k ? env.file2k : env.file;
  const map = cacheFor(renderer);
  const key = `${id}|${file}`;
  if (map.has(key)) return map.get(key);
  const promise = new Promise((resolve, reject) => {
    new HDRLoader().load(libraryUrl(file), (equirect) => {
      equirect.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const texture = pmrem.fromEquirectangular(equirect).texture;
      pmrem.dispose();
      resolve({ texture, background: equirect, env });
    }, (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); }, reject);
  });
  promise.catch(() => map.delete(key));
  map.set(key, promise);
  return promise;
}

/**
 * The user's own environment (engine/usertextures.js decodes the picture): an equirect texture → the same
 * { texture (PMREM), background (equirect) } as loadEnvironment. Cached per renderer under `key`.
 */
export function environmentFromEquirect(key, equirect, renderer) {
  const map = cacheFor(renderer);
  const cacheKey = `user|${key}`;
  if (map.has(cacheKey)) return map.get(cacheKey);
  equirect.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromEquirectangular(equirect).texture;
  pmrem.dispose();
  const result = Promise.resolve({ texture, background: equirect, env: null });
  map.set(cacheKey, result);
  return result;
}

/** Procedural studio-room lighting, no download (fallback / first paint). Cached per renderer. */
export function roomEnvironment(renderer) {
  const map = cacheFor(renderer);
  if (map.has('room')) return map.get('room');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.dispose?.();
  pmrem.dispose();
  const result = { texture, background: null, env: null };
  map.set('room', result);
  return result;
}
