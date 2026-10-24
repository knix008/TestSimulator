// npm run samples (second part) — writes one example file for every supported file format to
// samples/formats/: the open/save formats (THERM .thmx, Gmsh .msh, DXF, node-data CSV, DSC/TGA CSV) and
// the export-only ones (CalculiX .inp, Nastran .bdf, Ansys .cdb, COMSOL .mphtxt, STL, VTK, VTU, field
// CSV). Result files come from a real solve with public/heat.wasm (npm run build:wasm first).
// test/unit/formats-samples.test.js opens every file again and checks it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleModel } from '../src/core/samples.js';
import { normalizeModel, engineModel, serializeModel } from '../src/core/model.js';
import { calculixDeck } from '../src/core/interop.js';
import { nastranBdf, ansysCdb, comsolMphtxt, gmshMsh, resultVtu, modelStl, dxfFromModel, modelToTherm } from '../src/core/formats.js';
import { decodeResult, resultVtk, fieldCsv, field } from '../src/core/result.js';
import { sampleNodeCsv } from '../src/core/heatmap.js';
import { sampleDscCsv, sampleTgaCsv } from '../src/core/thermalanalysis.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples', 'formats');
fs.mkdirSync(dir, { recursive: true });

/** Solves a model with the web engine (the same Rust code as the desktop one). */
async function solve(model) {
  const bytes = fs.readFileSync(path.join(root, 'public', 'heat.wasm'));
  let memory = null;
  const { instance } = await WebAssembly.instantiate(bytes, { env: { hm_progress() {}, hm_cancelled: () => 0 } });
  const ex = instance.exports;
  memory = ex.memory;
  const input = new TextEncoder().encode(JSON.stringify(engineModel(model)));
  const ptr = ex.hm_alloc(input.length);
  new Uint8Array(memory.buffer, ptr, input.length).set(input);
  const out = ex.hm_run(ptr, input.length);
  ex.hm_free(ptr, input.length);
  const len = new DataView(memory.buffer).getUint32(out, true);
  const result = new Uint8Array(memory.buffer, out + 4, len).slice();
  ex.hm_result_free(out);
  return decodeResult(result);
}

// The models: a 2D heat sink (the tutorial), a window frame section (THERM's home ground) and a coarse 3D PCB.
const tutorial = normalizeModel(sampleModel('tutorial', 'en'));
const frame = normalizeModel(sampleModel('windowFrame', 'en'));
const pcb = normalizeModel(sampleModel('pcb3d', 'en'));
pcb.domain = { ...pcb.domain, nx: 40, ny: 30, nz: 4 };

const files = {
  'heatsink-2d.myheat': serializeModel(tutorial),
  'window-frame.thmx': modelToTherm(frame),
  'window-frame.dxf': dxfFromModel(frame),
  'heatsink-2d.dxf': dxfFromModel(tutorial),
  'heatsink-2d.msh': gmshMsh(tutorial),
  'pcb-3d.msh': gmshMsh(pcb),
  'heatsink-2d.inp': calculixDeck(tutorial),
  'heatsink-2d.bdf': nastranBdf(tutorial),
  'pcb-3d.bdf': nastranBdf(pcb),
  'heatsink-2d.cdb': ansysCdb(tutorial),
  'pcb-3d.cdb': ansysCdb(pcb),
  'heatsink-2d.mphtxt': comsolMphtxt(tutorial),
  'pcb-3d.mphtxt': comsolMphtxt(pcb),
  'heatsink-2d.stl': modelStl(tutorial),
  'pcb-3d.stl': modelStl(pcb),
  'radiator-nodes.csv': sampleNodeCsv(),
  'dsc-indium.csv': sampleDscCsv(),
  'tga-polymer.csv': sampleTgaCsv(),
};
const result = await solve(tutorial);
if (!result.header.ok) throw new Error(`solve failed: ${result.header.error}`);
files['heatsink-2d-result.vtu'] = resultVtu(result, tutorial.name);
files['heatsink-2d-result.vtk'] = resultVtk(result, tutorial.name);
files['heatsink-2d-T.csv'] = fieldCsv(result, field(result, 'T'), 'T', 'C');
const pcbResult = await solve(pcb);
files['pcb-3d-result.vtu'] = resultVtu(pcbResult, pcb.name);

for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
const size = Object.values(files).reduce((sum, text) => sum + text.length, 0);
console.log(`samples/formats/: ${Object.keys(files).length} files (${(size / 1048576).toFixed(1)} MB)`);
