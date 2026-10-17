// ONNX Runtime for the downloaded REMBG models. Loaded only when a model runs,
// so the colour algorithms and the unit tests never pull in the wasm runtime.
// Package exports do not expose these files, so import them by path.
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

let loading = null;

export function loadOrt() {
  loading ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    const api = ort.env ? ort : ort.default;
    api.env.wasm.numThreads = 1;
    api.env.wasm.proxy = false;
    api.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };
    return api;
  })();
  return loading;
}
