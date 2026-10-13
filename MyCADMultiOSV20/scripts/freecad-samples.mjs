// npm run build:samples:freecad — has FreeCAD itself make the files in
// samples/freecad (FCStd, STEP, IGES, BREP, STL, OBJ, PLY, OFF, 3MF) and
// samples/drawings (2D IGES, SVG, DXF from FreeCAD's own writers), and
// record the volumes FreeCAD computed (freecad-volumes.json), which the unit
// tests compare MyCAD's readers against. Needs FreeCAD (FREECAD_CMD or a
// normal install).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFreecad } from './freecad/locate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freecad = findFreecad();
if (!freecad) {
  console.error('FreeCAD (FreeCADCmd) was not found. Install FreeCAD or set FREECAD_CMD to FreeCADCmd.');
  process.exit(1);
}
const dir = path.join(root, 'samples', 'freecad');
fs.mkdirSync(dir, { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mycad-fc-'));
const job = path.join(work, 'job.json');
fs.writeFileSync(job, JSON.stringify({ dir: dir.replace(/\\/g, '/'), out: path.join(work, 'report.json').replace(/\\/g, '/') }));
const run = spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'generate.py')], { env: { ...process.env, MYCAD_FC_JOB: job }, encoding: 'utf8', windowsHide: true });
if (!fs.existsSync(path.join(work, 'report.json'))) {
  console.error(run.stderr || run.stdout || run.error);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(path.join(work, 'report.json'), 'utf8'));
for (const [file, info] of Object.entries(report)) console.log(`${file.padEnd(28)} ${info.error ? `(FreeCAD: ${info.error})` : `${info.volume.toFixed(1)} mm³`}`);
console.log(`samples/freecad/ — made by ${freecad}`);

// 2D drawings: FreeCAD's own IGES, SVG and DXF writers → samples/drawings.
const drawings = path.join(root, 'samples', 'drawings');
const job2d = path.join(work, 'job2d.json');
fs.writeFileSync(job2d, JSON.stringify({ dir: drawings.replace(/\\/g, '/'), out: path.join(work, 'report2d.json').replace(/\\/g, '/') }));
const run2d = spawnSync(freecad, [path.join(root, 'scripts', 'freecad', 'drawings2d.py')], { env: { ...process.env, MYCAD_FC_JOB: job2d }, encoding: 'utf8', windowsHide: true });
if (!fs.existsSync(path.join(work, 'report2d.json'))) {
  console.error(run2d.stderr || run2d.stdout || run2d.error);
  process.exit(1);
}
const report2d = JSON.parse(fs.readFileSync(path.join(work, 'report2d.json'), 'utf8'));
fs.writeFileSync(path.join(drawings, 'freecad-drawings.json'), `${JSON.stringify(report2d, null, 1)}
`);
for (const [file, info] of Object.entries(report2d)) console.log(`${file.padEnd(28)} ${info.error ? `(FreeCAD: ${info.error})` : `${info.edges} edges, ${info.length.toFixed(2)} mm`}`);
