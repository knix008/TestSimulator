// Exchange formats off the main window's thread: the full OpenCASCADE build (cad/occt-full.js, ~50 MB of wasm) is
// loaded here, once, the first time an IGES or Parasolid file is opened or saved. Shapes come and go as BREP text.
//
// In:  { id, kind: 'import-iges', data (ArrayBuffer | string) }  |  { id, kind: 'export-iges', brep, unit, mode }
//      { id, kind: 'import-xt', data }  |  { id, kind: 'export-xt', brep, binary, file }
// Out: { id, type: 'done', result }  |  { id, type: 'error', message, code }
import { formatsJob } from './formats-jobs.js';

self.onmessage = async (event) => {
  const { id, ...message } = event.data ?? {};
  try {
    self.postMessage({ id, type: 'done', result: await formatsJob(message) });
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error?.message ?? error), code: error?.code ?? null });
  }
};
