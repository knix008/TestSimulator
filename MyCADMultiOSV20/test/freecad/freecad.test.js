// FreeCAD round trip: MyCAD writes every 3D format, real FreeCAD (FreeCADCmd)
// opens each file and reports volumes and bounding boxes, which must match
// MyCAD's own. FreeCAD is found through FREECAD_CMD or the usual install
// folders; without it these tests are skipped (shown as ○).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { exportMesh } from '../../src/domain/exchange3d.js';
import { toBinaryStl } from '../../src/domain/stl.js';
import { exactVolume, meshBox, meshVolume, solidMesh } from '../../src/domain/solids.js';
import { mountingBlock, solidsShowcase } from '../../scripts/models3d.mjs';
import { parseFile } from '../../src/domain/format.js';
import { findFreecad } from '../../scripts/freecad/locate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const freecad = findFreecad();
const skip = freecad ? false : 'FreeCAD (FreeCADCmd) not found — set FREECAD_CMD';
const FORMATS = ['fcstd', 'step', 'stl', 'obj', 'ply', 'off', '3mf'];
let results = null;
let drawing = null;
let solids = [];

before(() => {
  if (!freecad) return;
  drawing = solidsShowcase();
  solids = drawing.entities.filter((e) => e.type === 'solid');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycad-freecad-'));
  const files = FORMATS.map((format) => {
    const file = path.join(dir, `showcase.${format === 'fcstd' ? 'FCStd' : format}`);
    const bytes = format === 'stl' ? toBinaryStl(solids.flatMap((e) => solidMesh(e))) : exportMesh(format, drawing, drawing.entities);
    fs.writeFileSync(file, bytes);
    return file.replace(/\\/g, '/');
  });
  // The boolean model too (Part::Cut / MultiFuse trees in FreeCAD).
  const block = mountingBlock();
  const blockFile = path.join(dir, 'block.FCStd').replace(/\\/g, '/');
  fs.writeFileSync(blockFile, exportMesh('fcstd', block, block.entities));
  files.push(blockFile);
  // Every 3D sample export (samples/exports) as well.
  const exportsDir = path.join(root, 'samples', 'exports');
  // (Not AMF: FreeCAD does not read it — it is for 3D printers.)
  const sampleFiles = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((name) => !name.endsWith('.amf')).map((name) => path.join(exportsDir, name).replace(/\\/g, '/')) : [];
  files.push(...sampleFiles);
  const out = path.join(dir, 'result.json').replace(/\\/g, '/');
  const job = path.join(dir, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ files, out }));
  const run = spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'check.py')], { env: { ...process.env, MYCAD_FC_JOB: job }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  if (!fs.existsSync(out)) throw new Error(`FreeCAD did not report: ${run.stderr?.slice(-800) ?? run.error}`);
  results = Object.fromEntries(JSON.parse(fs.readFileSync(out, 'utf8')).map((entry) => [entry.file.replace(/^showcase\./, '').toLowerCase(), entry]));
  results.block = results['block.fcstd'];
  results.samples = JSON.parse(fs.readFileSync(out, 'utf8')).filter((entry) => sampleFiles.some((file) => file.endsWith(`/${entry.file}`)));
});

const near = (actual, expected, relative, label) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relative + 0.01, `${label}: FreeCAD ${actual.toFixed(3)} · MyCAD ${expected.toFixed(3)}`);
const meshTotal = () => solids.reduce((sum, e) => sum + meshVolume(solidMesh(e)), 0);

test('FreeCAD opens the FCStd document: every object valid, recomputed', { skip }, () => {
  const fc = results.fcstd;
  assert.ok(fc.ok, fc.error);
  assert.deepEqual(fc.invalid, [], 'objects FreeCAD could not recompute');
  const labels = fc.objects.filter((o) => o.volume).map((o) => o.label);
  for (const e of solids) assert.ok(labels.includes(e.name), `${e.name} missing in FreeCAD`);
  assert.ok(fc.objects.some((o) => o.type === 'Sketcher::SketchObject' && o.edges >= 6), 'the 2D drawing arrives as a sketch');
});

test('FCStd: each parametric solid has the same volume as MyCAD (FreeCAD computes it exactly)', { skip }, () => {
  for (const e of solids) {
    const object = results.fcstd.objects.find((o) => o.label === e.name);
    const exact = exactVolume(e);
    // Tessellated solids (no exact formula) are compared with a tolerance for MyCAD's facets.
    near(object.volume, exact ?? meshVolume(solidMesh(e)), exact ? 1e-3 : 0.02, e.name);
  }
});

test('FCStd: each solid sits in the same place (bounding boxes match)', { skip }, () => {
  for (const e of solids) {
    const object = results.fcstd.objects.find((o) => o.label === e.name);
    const box = meshBox(solidMesh(e));
    const size = Math.max(...box.size);
    const ours = [...box.min, ...box.max];
    object.bbox.forEach((value, i) => assert.ok(Math.abs(value - ours[i]) <= size * 0.03 + 0.05, `${e.name} bbox[${i}]: FreeCAD ${value.toFixed(2)} · MyCAD ${ours[i].toFixed(2)}`));
  }
});

test('FCStd: a boolean tree arrives as FreeCAD Part::Cut / MultiFuse with the same volume', { skip }, () => {
  const block = results.block;
  assert.ok(block.ok, block.error);
  const ours = mountingBlock().entities.filter((e) => e.type === 'solid').reduce((sum, e) => sum + meshVolume(solidMesh(e)), 0);
  near(block.volume, ours, 0.01, 'MountingBlock (FreeCAD computes it exactly)');
});

test('STEP (faceted B-rep): FreeCAD reads valid solids with the same volume', { skip }, () => {
  const step = results.step;
  assert.ok(step.ok, step.error);
  assert.equal(step.solids, solids.length);
  near(step.volume, meshTotal(), 1e-4, 'STEP');
});

for (const format of ['stl', 'obj', 'ply', 'off', '3mf']) {
  test(`${format.toUpperCase()}: FreeCAD reads the mesh with the same volume and size`, { skip }, () => {
    const entry = results[format];
    assert.ok(entry.ok, entry.error);
    near(entry.volume, meshTotal(), 1e-4, format);
    const box = meshBox(solids.flatMap((e) => solidMesh(e)));
    [...box.min, ...box.max].forEach((value, i) => assert.ok(Math.abs(entry.bbox[i] - value) < 0.01, `${format} bbox[${i}]`));
  });
}

test('every sample in samples/exports opens in FreeCAD with the volume MyCAD gives it', { skip }, () => {
  const samples = results.samples;
  assert.ok(samples.length >= 20, `${samples.length} sample files checked`);
  for (const entry of samples) {
    assert.ok(entry.ok, `${entry.file}: ${entry.error}`);
    if (entry.invalid) assert.deepEqual(entry.invalid, [], `${entry.file}: objects FreeCAD could not recompute`);
    const drawing = parseFile(fs.readFileSync(path.join(root, 'samples', `${entry.file.replace(/\.[^.]+$/, '')}.mcad`), 'utf8'));
    const solids = drawing.entities.filter((e) => e.type === 'solid');
    const meshTotalVolume = solids.reduce((sum, e) => sum + meshVolume(solidMesh(e)), 0);
    // FCStd is recomputed by FreeCAD from parameters (exact curves); the others carry MyCAD's triangles.
    near(entry.volume, meshTotalVolume, entry.file.endsWith('.FCStd') ? 0.02 : 1e-4, entry.file);
  }
});
