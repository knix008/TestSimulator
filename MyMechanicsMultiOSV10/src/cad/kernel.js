// The geometry kernel: OpenCASCADE (the B-rep kernel of many commercial CAD programs) compiled to
// WebAssembly (replicad-opencascadejs), driven through replicad's API. Loaded once, on demand: the app
// starts without it (the start page needs no geometry) and the first part waits for it.
//
// Under Node (the unit tests) the wasm file is read from node_modules; in the app Vite hands out its URL.
import * as R from 'replicad';

let loading = null;
let ready = false;

/** True once the kernel can be used synchronously (every modelling call after loadKernel resolved). */
export const kernelReady = () => ready;

/** The replicad module (shapes, sketches, finders, measurements, exports). */
export const rep = () => R;

/**
 * Loads OpenCASCADE once. `wasmUrl` (optional): where the .wasm file is; by default Vite's URL of it in the
 * app, the file in node_modules under Node.
 */
export function loadKernel({ wasmUrl = null, onProgress = null } = {}) {
  loading ??= (async () => {
    onProgress?.(0.05);
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node) && typeof window === 'undefined';
    let url = wasmUrl;
    if (!url && isNode) {
      const nodeUrl = 'node:url';
      const { fileURLToPath } = await import(/* @vite-ignore */ nodeUrl);
      url = fileURLToPath(new URL('../../node_modules/replicad-opencascadejs/dist/replicad_single.wasm', import.meta.url));
    }
    if (!url) url = (await import('replicad-opencascadejs/wasm?url')).default;
    onProgress?.(0.2);
    const { default: init } = await import('replicad-opencascadejs');
    onProgress?.(0.4);
    const oc = await init({ locateFile: () => url });
    R.setOC(oc);
    // STEP writing prints transfer statistics on the console: not wanted in the app.
    ready = true;
    onProgress?.(1);
    return R;
  })();
  return loading;
}
