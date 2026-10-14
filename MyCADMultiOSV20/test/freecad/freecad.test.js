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
import { boxOfEntities, primitives } from '../../src/domain/entities.js';
import { importDrawingBytes } from '../../src/domain/import2d.js';
import { wallParts } from '../../src/domain/arch.js';
import { addEntity, createDrawing } from '../../src/domain/drawing.js';

/** Newer PartDesign-like features: a tapered pad, a three-section ruled loft, a hole, a closed hollow box. */
function featuresModel() {
  const d = createDrawing({ title: 'Features' });
  const sq = (s, cx = 0, cy = 0) => [{ x: cx - s, y: cy - s }, { x: cx + s, y: cy - s }, { x: cx + s, y: cy + s }, { x: cx - s, y: cy + s }];
  addEntity(d, 'solid', { kind: 'pad', name: 'TaperPad', params: { height: 20, taper: 8 }, shape: { shapes: [{ outer: sq(15), holes: [sq(4)] }] } });
  addEntity(d, 'solid', { kind: 'loft', name: 'Loft3', params: { height: 60, mode: 0 }, shape: { sections: [sq(15, 80, 0), sq(6, 80, 0), sq(12, 80, 0)] }, x: 0 });
  addEntity(d, 'solid', { kind: 'hole', name: 'Hole', params: { diameter: 10, depth: 20, type: 1, cbDiameter: 16, cbDepth: 5, tip: 1 }, x: 160, z: 30 });
  addEntity(d, 'solid', { kind: 'thickness', name: 'Hollow', params: { thickness: 3, open: 3 }, shape: { base: { kind: 'box', params: { length: 40, width: 30, height: 20 } } }, x: 220 });
  return d;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const freecad = findFreecad();
const skip = freecad ? false : 'FreeCAD (FreeCADCmd) not found — set FREECAD_CMD';
const FORMATS = ['fcstd', 'step', 'stl', 'obj', 'ply', 'off', '3mf', 'dae', 'brep'];
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
  const features = featuresModel();
  const featuresFile = path.join(dir, 'features.FCStd').replace(/\\/g, '/');
  const csgFile = path.join(dir, 'showcase.csg').replace(/\\/g, '/');
  fs.writeFileSync(csgFile, exportMesh('scad', drawing, drawing.entities));
  files.push(csgFile);
  fs.writeFileSync(featuresFile, exportMesh('fcstd', features, features.entities));
  files.push(featuresFile);
  // Every 3D sample export (samples/exports) as well.
  const exportsDir = path.join(root, 'samples', 'exports');
  // (Not AMF: FreeCAD does not read it — it is for 3D printers.)
  const is3d = (name) => /\.(fcstd|step|stl|obj|ply|off|3mf|ifc)$/i.test(name);
  const sampleFiles = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter(is3d).map((name) => path.join(exportsDir, name).replace(/\\/g, '/')) : [];
  // The 2D exports: IGES through Part.read, SVG and DXF 2000 through FreeCAD's Draft importers.
  const drawingFiles = fs.existsSync(exportsDir) ? fs.readdirSync(exportsDir).filter((name) => /\.(igs|svg|r2000\.dxf)$/i.test(name)).map((name) => path.join(exportsDir, name).replace(/\\/g, '/')) : [];
  files.push(...drawingFiles);
  files.push(...sampleFiles);
  const out = path.join(dir, 'result.json').replace(/\\/g, '/');
  const job = path.join(dir, 'job.json');
  fs.writeFileSync(job, JSON.stringify({ files, out }));
  const run = spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'check.py')], { env: { ...process.env, MYCAD_FC_JOB: job }, encoding: 'utf8', timeout: 600000, windowsHide: true });
  if (!fs.existsSync(out)) throw new Error(`FreeCAD did not report: ${run.stderr?.slice(-800) ?? run.error}`);
  results = Object.fromEntries(JSON.parse(fs.readFileSync(out, 'utf8')).map((entry) => [entry.file.replace(/^showcase\./, '').toLowerCase(), entry]));
  results.block = results['block.fcstd'];
  results.samples = JSON.parse(fs.readFileSync(out, 'utf8')).filter((entry) => sampleFiles.some((file) => file.endsWith(`/${entry.file}`)));
  results.drawings = JSON.parse(fs.readFileSync(out, 'utf8')).filter((entry) => drawingFiles.some((file) => file.endsWith(`/${entry.file}`)));
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

test('FCStd: a tapered pad (TaperAngle) and a three-section ruled loft have the volumes MyCAD gives them', { skip }, () => {
  const fc = results['features.fcstd'];
  assert.ok(fc.ok, fc.error);
  assert.deepEqual(fc.invalid, []);
  for (const e of featuresModel().entities) {
    const object = fc.objects.find((o) => o.label === e.name);
    assert.ok(object?.volume, `${e.name} missing in FreeCAD`);
    near(object.volume, meshVolume(solidMesh(e)), e.kind === 'hole' ? 0.01 : 1e-4, e.name);
  }
});

test('OpenSCAD: FreeCAD\'s OpenSCAD workbench reads the .csg, each solid with its volume', { skip }, () => {
  const entry = results.csg;
  assert.ok(entry.ok, entry.error);
  assert.ok(entry.objects.every((o) => o.valid), 'every shape valid');
  // FreeCAD makes true cylinders and spheres: within the facets of MyCAD's meshes.
  const left = [...entry.objects];
  for (const e of solids) {
    const v = meshVolume(solidMesh(e));
    const i = left.findIndex((o) => Math.abs(o.volume - v) <= Math.abs(v) * 0.02 + 0.5);
    assert.ok(i >= 0, `${e.name}: ${v.toFixed(1)} not among ${left.map((o) => o.volume.toFixed(1)).join(', ')}`);
    left.splice(i, 1);
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

// (VRML: FreeCAD only writes it; its VRML is read back in the unit tests.)
for (const format of ['stl', 'obj', 'ply', 'off', '3mf', 'dae', 'brep']) {
  test(`${format.toUpperCase()}: FreeCAD reads the mesh with the same volume and size`, { skip }, () => {
    const entry = results[format];
    assert.ok(entry.ok, entry.error);
    near(entry.volume, meshTotal(), 1e-4, format);
    const box = meshBox(solids.flatMap((e) => solidMesh(e)));
    [...box.min, ...box.max].forEach((value, i) => assert.ok(Math.abs(entry.bbox[i] - value) < 0.01, `${format} bbox[${i}]`));
  });
}

test('every sample in samples/exports opens in FreeCAD with the volume MyCAD gives it', { skip }, () => {
  const samples = results.samples.filter((entry) => !entry.file.endsWith('.ifc'));
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

test('BIM: the IFC samples open in FreeCAD (BIM NativeIFC) with their classes, and walls of the same volume', { skip }, (t) => {
  const ifc = results.samples.filter((entry) => entry.file.endsWith('.ifc'));
  assert.ok(ifc.length >= 3, `${ifc.length} IFC samples`);
  if (ifc.some((entry) => /IfcOpenShell not built|DLL load failed/.test(entry.error ?? ''))) {
    t.skip('FreeCAD cannot load ifcopenshell here (a FreeCAD installed under a very long path?)');
    return;
  }
  for (const entry of ifc) {
    assert.ok(entry.ok, `${entry.file}: ${entry.error}`);
    const drawing = parseFile(fs.readFileSync(path.join(root, 'samples', `${entry.file.replace(/\.[^.]+$/, '')}.mcad`), 'utf8'));
    const classes = new Set(entry.elements.map((e) => e.cls));
    for (const cls of ['IfcProject', 'IfcBuildingStorey', 'IfcWall', 'IfcDoor', 'IfcSlab', 'IfcSpace']) assert.ok(classes.has(cls), `${entry.file}: ${cls}`);
    // FreeCAD subtracts each wall's openings itself and shows the windows and doors with the wall.
    for (const wall of drawing.entities.filter((e) => e.type === 'solid' && e.kind === 'wall')) {
      const found = entry.elements.find((e) => e.cls === 'IfcWall' && e.label === wall.name);
      assert.ok(found, `${entry.file}: ${wall.name}`);
      const parts = wallParts(wall);
      const expected = meshVolume(parts.main) + parts.openings.reduce((sum, o) => sum + meshVolume([...o.wood, ...o.glass]), 0);
      near(found.volume, expected, 1e-4, `${entry.file} ${wall.name}`);
    }
  }
});

/** Total length of what the entities draw (lines, outlines, circles, arcs). */
function drawnLength(entities) {
  let total = 0;
  const along = (pts) => { for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); };
  for (const entity of entities) {
    for (const prim of primitives(entity)) {
      if (prim.kind === 'line') along([prim.a, prim.b]);
      else if (prim.kind === 'poly') along(prim.closed ? [...prim.points, prim.points[0]] : prim.points);
      else if (prim.kind === 'fill') along([...prim.points, prim.points[0]]);
      else if (prim.kind === 'circle') total += 2 * Math.PI * prim.r;
      else if (prim.kind === 'arc') { let sweep = (prim.end - prim.start) % 360; if (sweep <= 0) sweep += 360; total += ((sweep * Math.PI) / 180) * prim.r; }
    }
  }
  return total;
}

test('2D: MyCAD IGES exports open in FreeCAD with the same total curve length', { skip }, () => {
  const iges = results.drawings.filter((entry) => entry.file.endsWith('.igs'));
  assert.ok(iges.length >= 3, `${iges.length} IGES files`);
  for (const entry of iges) {
    assert.ok(entry.ok, `${entry.file}: ${entry.error}`);
    const { drawing: imported } = importDrawingBytes(entry.file, new Uint8Array(fs.readFileSync(path.join(root, 'samples', 'exports', entry.file))));
    near(entry.length, drawnLength(imported.entities.filter((e) => e.type !== 'text')), 1e-4, `${entry.file} length`);
  }
});

test('2D: MyCAD SVG and DXF 2000 exports open in FreeCAD (Draft importers) with their geometry', { skip }, () => {
  const others = results.drawings.filter((entry) => !entry.file.endsWith('.igs'));
  assert.ok(others.length >= 6, `${others.length} files`);
  for (const entry of others) {
    assert.ok(entry.ok, `${entry.file}: ${entry.error}`);
    assert.ok(entry.edges > 10 && entry.length > 100, `${entry.file}: ${entry.edges} edges, ${entry.length}`);
    // Same place and size as MyCAD's drawing (SVG is in page coordinates: only its width is compared).
    const name = entry.file.replace(/\.(svg|r2000\.dxf)$/i, '');
    const drawing = parseFile(fs.readFileSync(path.join(root, 'samples', `${name}.mcad`), 'utf8'));
    const box = boxOfEntities(drawing.entities.filter((e) => e.type !== 'text'));
    if (entry.file.endsWith('.dxf')) for (const [i, value] of [[0, box.minX], [1, box.minY]]) assert.ok(Math.abs(entry.bbox[i] - value) < 0.05, `${entry.file} bbox[${i}] ${entry.bbox[i]} vs ${value}`);
    assert.ok(entry.bbox[3] - entry.bbox[0] > (box.maxX - box.minX) * 0.8, `${entry.file}: width`);
  }
});
