// KTX2 (Basis Universal / UASTC / uncompressed) textures. The Basis transcoder
// (JS + WebAssembly from three/examples/jsm/libs/basis) is bundled by Vite and
// found through a URL modifier, so it works offline in the desktop app and the
// web build alike. Loaded only when a .ktx2 file is imported (io/textures.js).
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import transcoderJs from 'three/examples/jsm/libs/basis/basis_transcoder.js?url';
import transcoderWasm from 'three/examples/jsm/libs/basis/basis_transcoder.wasm?url';

let loader = null;
let loaderRenderer = null;

function loaderFor(renderer) {
  if (loader && loaderRenderer === renderer) return loader;
  loader?.dispose();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => (/basis_transcoder\.js$/.test(url) ? transcoderJs : /basis_transcoder\.wasm$/.test(url) ? transcoderWasm : url));
  loader = new KTX2Loader(manager).setTranscoderPath('basis/');
  if (renderer) loader.detectSupport(renderer);
  else throw Object.assign(new Error('KTX2 textures need the 3D view'), { code: 'texture-unreadable' });
  loaderRenderer = renderer;
  return loader;
}

/** Loads the Basis transcoder (JS + WebAssembly) now — tests check it is bundled and starts offline. */
export const ensureTranscoder = (renderer) => loaderFor(renderer).init();

/** KTX2 bytes (ArrayBuffer) → a texture in a format the renderer's GPU can sample. */
export function decodeKtx2(buffer, renderer) {
  const ktx2 = loaderFor(renderer);
  return new Promise((resolve, reject) => ktx2.parse(buffer, resolve, (error) => reject(Object.assign(new Error(`KTX2: ${error?.message ?? error}`), { code: 'texture-unreadable' }))));
}
