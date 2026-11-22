// Exchange formats off the main window's thread: the full OpenCASCADE build (cad/occt-full.js, ~50 MB of wasm) is
// loaded here, once, the first time an IGES file is opened or saved. Shapes come and go as BREP text.
//
// In:  { id, kind: 'import-iges', data (ArrayBuffer | string) }  |  { id, kind: 'export-iges', brep, unit, mode }
// Out: { id, type: 'done', result: string (BREP or IGES text) }  |  { id, type: 'error', message, code }
import { igesToBrep, brepToIges } from '../cad/occt-full.js';

self.onmessage = async (event) => {
  const { id, kind, data, brep, unit, mode } = event.data ?? {};
  try {
    let result;
    if (kind === 'import-iges') result = await igesToBrep(data);
    else if (kind === 'export-iges') result = await brepToIges(brep, { unit, mode });
    else throw new Error(`unknown request ${kind}`);
    self.postMessage({ id, type: 'done', result });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error?.message ?? error), code: error?.code ?? null });
  }
};
