// Reads STEP / IGES / BREP files off the main thread with occt-import-js (OpenCASCADE compiled to
// WebAssembly, LGPL-2.1 — a separate, replaceable .wasm file loaded only when such a file is opened).
// Message in: { format: 'step' | 'iges' | 'brep', buffer, params }; out: { result } or { error }.
import occtimportjs from 'occt-import-js';
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

let occt = null;
self.onmessage = async ({ data }) => {
  try {
    occt ??= await occtimportjs({ locateFile: () => wasmUrl });
    self.postMessage({ result: occt.ReadFile(data.format, new Uint8Array(data.buffer), data.params) });
  } catch (error) {
    self.postMessage({ error: String(error?.message ?? error) });
  }
};
