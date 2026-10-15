// The OpenCASCADE kernel's files in real FreeCAD: fillets, chamfers, booleans
// on curved faces and hollowed solids written exactly (STEP with its true
// surfaces, FCStd with Part::Feature shapes) — FreeCAD must find the same
// exact volumes. Skipped without FreeCAD (FREECAD_CMD).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportMesh, importMesh } from '../../src/domain/exchange3d.js';
import { exportIges } from '../../src/domain/iges.js';
import { loadOcc, occProperties } from '../../src/domain/occ.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';
import { meshVolume, resetSolidCaches, solidProperties } from '../../src/domain/solids.js';
import { normalizeEntity } from '../../src/domain/entities.js';
import { wallParts } from '../../src/domain/arch.js';
import { findFreecad } from '../../scripts/freecad/locate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const freecad = findFreecad();
if (!freecad) throw new Error('FreeCAD (FreeCADCmd) was not found. Install FreeCAD 1.x or set FREECAD_CMD to FreeCADCmd.');
const skip = false;

function exactModel() {
  const d = createDrawing({ title: 'Exact' });
  const box = (length, width, height, place = {}) => ({ kind: 'box', params: { length, width, height }, ...place });
  addEntity(d, 'solid', { kind: 'fillet', name: 'Rounded', params: { size: 4, edges: 0 }, shape: { base: box(60, 40, 20) } });
  addEntity(d, 'solid', { kind: 'chamfer', name: 'Chamfered', params: { size: 3, edges: 0 }, shape: { base: { kind: 'cylinder', params: { radius: 15, height: 30, angle: 360 } } }, x: 100 });
  addEntity(d, 'solid', { kind: 'boolean', name: 'Plate', params: {}, shape: { op: 'cut', parts: [box(80, 50, 10), { kind: 'cylinder', params: { radius: 10, height: 20, angle: 360 }, x: 40, y: 25, z: -5 }, { kind: 'sphere', params: { radius: 12 }, x: 15, y: 15, z: 10 }] }, y: 100 });
  addEntity(d, 'solid', { kind: 'thickness', name: 'Cup', params: { thickness: 2, open: 0 }, shape: { base: { kind: 'cylinder', params: { radius: 20, height: 30, angle: 360 } } }, x: 200 });
  return d;
}

let results = null;
let solids = [];

before(async () => {
  if (!freecad) return;
  await loadOcc();
  resetSolidCaches();
  const drawing = exactModel();
  solids = drawing.entities.filter((e) => e.type === 'solid');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycad-exact-'));
  const files = ['step', 'fcstd', 'brep'].map((format) => {
    const file = path.join(dir, `exact.${format === 'fcstd' ? 'FCStd' : format}`).replace(/\\/g, '/');
    fs.writeFileSync(file, exportMesh(format, drawing, drawing.entities));
    return file;
  });
  // IGES: the solids as B-rep objects (186).
  const igesFile = path.join(dir, 'exact.igs').replace(/\\/g, '/');
  fs.writeFileSync(igesFile, exportIges(drawing, { file: 'exact.igs', date: new Date('2026-01-01T00:00:00Z') }));
  files.push(igesFile);
  // A STEP read back in and written again keeps its exact shape too.
  const again = importMesh('step', fs.readFileSync(files[0], 'utf8'));
  const d2 = createDrawing({ title: 'Again' });
  for (const e of again.entities) addEntity(d2, 'solid', e);
  const againFile = path.join(dir, 'again.step').replace(/\\/g, '/');
  fs.writeFileSync(againFile, exportMesh('step', d2, d2.entities));
  files.push(againFile);
  const out = path.join(dir, 'result.json').replace(/\\/g, '/');
  const job = path.join(dir, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ files, out }));
  const run = spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'check.py')], { env: { ...process.env, MYCAD_FC_JOB: job }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  if (!fs.existsSync(out)) throw new Error(`FreeCAD did not report: ${run.stderr?.slice(-800) ?? run.error}`);
  results = Object.fromEntries(JSON.parse(fs.readFileSync(out, 'utf8')).map((entry) => [entry.file.toLowerCase(), entry]));
  // The other way: FreeCAD makes a PartDesign body (Pad, Pocket, Fillet) and a Part::Fillet; MyCAD reads their stored shapes.
  const pdJob = path.join(dir, 'pd-job.json');
  const pdFile = path.join(dir, 'partdesign.FCStd').replace(/\\/g, '/');
  const pdReport = path.join(dir, 'partdesign.json').replace(/\\/g, '/');
  fs.writeFileSync(pdJob, JSON.stringify({ out: pdFile, report: pdReport }));
  spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'partdesign.py')], { env: { ...process.env, MYCAD_FC_JOB: pdJob }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  results.partdesign = { report: JSON.parse(fs.readFileSync(pdReport, 'utf8')), read: importMesh('fcstd', fs.readFileSync(pdFile)) };
  // FreeCAD's BIM objects (a wall with a window, a column, a beam, a slab) written to IFC by FreeCAD.
  const bimJob = path.join(dir, 'bim-job.json');
  const bimFile = path.join(dir, 'bim.ifc').replace(/\\/g, '/');
  const bimReport = path.join(dir, 'bim.json').replace(/\\/g, '/');
  fs.writeFileSync(bimJob, JSON.stringify({ out: bimFile, report: bimReport }));
  spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'bim_ifc.py')], { env: { ...process.env, MYCAD_FC_JOB: bimJob }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  results.bim = { report: JSON.parse(fs.readFileSync(bimReport, 'utf8')), read: importMesh('ifc', fs.readFileSync(bimFile)) };
});

test('IFC from FreeCAD\'s BIM: a wall with its window, a column, a beam and a slab come in as BIM objects of the same volume', { skip }, () => {
  const { report, read } = results.bim;
  assert.deepEqual(read.warnings, []);
  const by = (name) => read.entities.find((e) => e.name === name);
  assert.deepEqual(['WallA', 'ColumnA', 'BeamA', 'SlabA'].map((n) => by(n)?.kind), ['wall', 'column', 'beam', 'slab']);
  assert.ok(!read.entities.some((e) => /WindowA/.test(e.name ?? '')), 'the window is the wall\'s opening');
  const wall = normalizeEntity(by('WallA'));
  assert.deepEqual(wall.shape.openings.map((o) => [o.type, Math.round(o.at), Math.round(o.width), Math.round(o.sill), Math.round(o.height)]), [['window', 2000, 1200, 900, 1000]]);
  near(meshVolume(wallParts(wall).main), report.WallA, 'WallA');
  for (const name of ['ColumnA', 'BeamA', 'SlabA']) near(solidProperties(normalizeEntity(by(name))).volume, report[name], name);
});

test('FCStd from FreeCAD: a PartDesign body and a Part::Fillet are read exactly (their stored B-reps)', { skip }, () => {
  const { report, read } = results.partdesign;
  assert.deepEqual(read.entities.map((e) => e.name).sort(), Object.keys(report).sort(), 'one solid each, the body standing for its features');
  for (const e of read.entities) near(occProperties({ ...e, type: 'solid' }).volume, report[e.name], e.name);
  assert.deepEqual(read.warnings, []);
});

const near = (a, b, label) => assert.ok(Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-6, `${label}: FreeCAD ${a} · MyCAD ${b}`);

test('STEP: FreeCAD reads each solid with its true surfaces and exact volume', { skip }, () => {
  const step = results['exact.step'];
  assert.ok(step.ok, step.error);
  assert.ok(step.valid);
  assert.equal(step.solids, solids.length);
  for (const surface of ['Cylinder', 'Sphere', 'Plane']) assert.ok(step.surfaces.includes(surface), `${surface} in ${step.surfaces}`);
  const ours = solids.map((e) => occProperties(e).volume).sort((a, b) => a - b);
  const theirs = [...step.solidVolumes].sort((a, b) => a - b);
  ours.forEach((v, i) => near(theirs[i], v, solids[i].name));
  const again = results['again.step'];
  assert.ok(again.ok && again.valid);
  [...again.solidVolumes].sort((a, b) => a - b).forEach((v, i) => near(v, ours[i], 'read and written again'));
});

test('FCStd: dress-ups arrive as exact Part::Feature shapes, booleans as FreeCAD booleans — same volumes', { skip }, () => {
  const fc = results['exact.fcstd'];
  assert.ok(fc.ok, fc.error);
  assert.deepEqual(fc.invalid, []);
  for (const e of solids) {
    const object = fc.objects.find((o) => o.label === e.name);
    assert.ok(object?.volume, `${e.name} missing`);
    near(object.volume, occProperties(e).volume, e.name);
  }
  assert.ok(fc.objects.filter((o) => o.type === 'Part::Feature').length >= 3, 'fillet, chamfer and thickness as exact shapes');
});

test('BREP: one compound of the exact solids', { skip }, () => {
  const brep = results['exact.brep'];
  assert.ok(brep.ok && brep.valid);
  assert.equal(brep.solids, solids.length);
  near(brep.volume, solids.reduce((s, e) => s + occProperties(e).volume, 0), 'total');
});

test('IGES: FreeCAD reads each solid (manifold solid B-rep, 186) valid, with the same volume', { skip }, () => {
  const iges = results['exact.igs'];
  assert.ok(iges.ok, iges.error);
  assert.ok(iges.valid);
  assert.equal(iges.solids, solids.length);
  const ours = solids.map((e) => occProperties(e).volume).sort((a, b) => a - b);
  const theirs = [...iges.solidVolumes].sort((a, b) => a - b);
  // Planes, cylinders and spheres are exact; other surfaces are cubic B-splines through a dense grid.
  ours.forEach((v, i) => assert.ok(Math.abs(theirs[i] - v) <= 1e-5 * v, `${theirs[i]} vs ${v}`));
});
