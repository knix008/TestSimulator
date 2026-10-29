// Module worker that reads a Rhino .3dm file with rhino3dm (WebAssembly).
// It runs outside the page because rhino3dm's bindings compile JavaScript at
// run time (new Function), which the page's Content-Security-Policy forbids;
// a worker loaded from its own script file has no such policy. Started by
// rhino3dm.js for one file and terminated afterwards (which frees the wasm
// memory).
//
//   postMessage({ bytes: Uint8Array, mode: "model" | "plan" })
//   ← { ok: true, data } | { ok: false, error }

import { extract3dm } from "./rhino3dm-extract.js";

let ready = null;
function rhino() {
  if (!ready) {
    ready = (async () => {
      const [mod, wasm] = await Promise.all([
        import("../vendor/rhino3dm/rhino3dm.module.js"),
        fetch(new URL("../vendor/rhino3dm/rhino3dm.wasm", import.meta.url)).then((r) => {
          if (!r.ok) throw new Error(`rhino3dm.wasm: HTTP ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      return mod.default({ wasmBinary: new Uint8Array(wasm) });
    })();
  }
  return ready;
}

self.onmessage = async (e) => {
  const { bytes, mode } = e.data || {};
  try {
    const rh = await rhino();
    const data = extract3dm(rh, bytes, { mode });
    const transfer = [];
    for (const m of data.meshes) for (const k of ["positions", "normals", "index"]) if (m[k]) transfer.push(m[k].buffer);
    self.postMessage({ ok: true, data }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
  }
};
