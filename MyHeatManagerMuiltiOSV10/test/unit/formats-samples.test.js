// The example files in samples/formats/ (npm run samples): every file opens with the app's own readers,
// the openable ones survive being saved again and reopened, and the export-only ones have the structure
// their products expect. (Third-party readers — Gmsh, meshio, ezdxf, ansys-mapdl-reader — were also run
// on these files by hand; see UsersGuide "Supported file formats".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseModel, normalizeModel } from '../../src/core/model.js';
import { bodiesFromDxf } from '../../src/core/interop.js';
import { parseNodeCsv } from '../../src/core/heatmap.js';
import { parseCurveCsv } from '../../src/core/thermalanalysis.js';
import { thermToModel, modelToTherm, gmshToModel, gmshMsh, dxfFromModel, FORMATS } from '../../src/core/formats.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'samples', 'formats');
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');
const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

test('samples/formats has an example for every format the app opens or saves', () => {
  const exts = new Set(files.map((f) => f.split('.').pop().toLowerCase()));
  for (const f of FORMATS) {
    if (f.ext === 'png') continue; // a picture of the view: made by the browser, nothing to keep
    assert.ok(exts.has(f.ext), `no .${f.ext} example`);
  }
});

test('MyHeatManager model (.myheat) opens', () => {
  const model = parseModel(read('heatsink-2d.myheat'));
  assert.ok(model.bodies.length > 5);
});

test('THERM (.thmx) opens, saves again and reopens with the same bodies and materials', () => {
  const model = normalizeModel(thermToModel(read('window-frame.thmx'), { language: 'en' }));
  assert.ok(model.bodies.length >= 5, `bodies ${model.bodies.length}`);
  assert.ok(model.boundaries.some((b) => b.type === 'convection'));
  const again = normalizeModel(thermToModel(modelToTherm(model), { language: 'en' }));
  assert.equal(again.bodies.length, model.bodies.length);
  assert.deepEqual(again.materials.map((m) => m.k).sort(), model.materials.map((m) => m.k).sort());
});

for (const name of ['heatsink-2d.msh', 'pcb-3d.msh']) {
  test(`Gmsh (${name}) opens, saves again and reopens`, () => {
    const { model, warnings } = gmshToModel(read(name), { language: 'en' });
    const m = normalizeModel(model);
    assert.ok(m.bodies.length > 0);
    assert.ok(Array.isArray(warnings));
    const again = normalizeModel(gmshToModel(gmshMsh(m), { language: 'en' }).model);
    assert.equal(again.bodies.length, m.bodies.length);
    assert.equal(again.domain.width, m.domain.width);
    assert.equal(again.domain.dim, name.includes('3d') ? 3 : 2);
  });
}

for (const name of ['window-frame.dxf', 'heatsink-2d.dxf']) {
  test(`DXF (${name}) opens, saves again and reopens`, () => {
    const { bodies } = bodiesFromDxf(read(name), { material: 'm' });
    assert.ok(bodies.length >= 5);
    const model = normalizeModel({ ...normalizeModel({}), bodies, domain: { dim: 2, width: 2000, height: 2000, depth: 1000, nx: 100, ny: 100, background: null } });
    const again = bodiesFromDxf(dxfFromModel(model), { material: 'm' }).bodies;
    assert.equal(again.length, bodies.length);
  });
}

test('node data (.csv) opens in the heat-map tool', () => {
  const data = parseNodeCsv(read('radiator-nodes.csv'));
  assert.ok((data.nodes ?? data).length > 10);
});

test('DSC and TGA curves (.csv) open in the thermal-analysis tool', () => {
  for (const name of ['dsc-indium.csv', 'tga-polymer.csv']) {
    const curve = parseCurveCsv(read(name));
    assert.ok((curve.T ?? curve).length > 50, name);
  }
});

test('export-only files have the structure their products read', () => {
  const inp = read('heatsink-2d.inp');
  assert.match(inp, /^\*NODE/m);
  assert.match(inp, /\*ELEMENT, TYPE=DC2D4/);
  assert.ok(!/[^\x00-\x7f]/.test(inp), 'CalculiX deck must be ASCII');
  for (const name of ['heatsink-2d.bdf', 'pcb-3d.bdf']) {
    const bdf = read(name);
    assert.match(bdf, /^SOL 153/m);
    assert.match(bdf, /^BEGIN BULK/m);
    assert.match(bdf, /^ENDDATA/m);
    assert.ok(!/[^\x00-\x7f]/.test(bdf), `${name} must be ASCII`);
  }
  for (const name of ['heatsink-2d.cdb', 'pcb-3d.cdb']) {
    const cdb = read(name);
    assert.match(cdb, /^NBLOCK,/m);
    assert.match(cdb, /^EBLOCK,/m);
    assert.match(cdb, name.includes('3d') ? /^ET,1,70$/m : /^ET,1,55$/m);
  }
  for (const name of ['heatsink-2d.mphtxt', 'pcb-3d.mphtxt']) assert.match(read(name), /# Created by COMSOL Multiphysics/);
  for (const name of ['heatsink-2d.stl', 'pcb-3d.stl']) assert.match(read(name), /^solid /m);
  for (const name of ['heatsink-2d-result.vtu', 'pcb-3d-result.vtu']) assert.match(read(name), /<VTKFile type="UnstructuredGrid"/);
  assert.match(read('heatsink-2d-result.vtk'), /^# vtk DataFile/);
  assert.match(read('heatsink-2d-T.csv'), /^x_mm,y_mm,T/);
});
