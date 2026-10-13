// Writes example drawings to samples/ (npm run build:samples):
//   01-gear-pair.mcad          meshing spur gears with centre distance and pitch circles
//   02-flange.mcad             a flange with bolt holes on its pitch circle (prints as an STL plate)
//   03-shaft.mcad              a stepped shaft with diameters and lengths dimensioned
//   04-bracket.mcad            a mounting plate: rounded rectangle, slots, holes (try 3D view / STL)
//   05-bolt-and-nut.mcad       an M10 bolt (side view), its nut and washer, a socket screw and a hole
//   06-cover-plate.mcad        hole arrays, a bolt circle of counterbores, slots
//   07-shaft-assembly.mcad     shaft, two bearings, gear, key and circlip
//   08-parts-catalog.mcad      all 36 library parts by category
//   09-solids-showcase.mcad    every 3D solid (FreeCAD Part primitives, pad, revolve, loft, sweep, boolean)
//   10-mounting-block.mcad     3D: a block made with booleans (fuse, cut)
//   11-springs-pipes.mcad      3D: helical spring, bent pipe (sweep), hopper (loft)
//   12-gearbox.mcad            3D: housing, shafts and gears padded from the gear outlines
//   13-drawing-views.mcad      3D bracket with front/top/right (hidden lines) and isometric views
//   14-sections.mcad           3D pulley and sleeve with section outlines
//   04-bracket.dxf             the bracket as DXF R12
//   exports/                   the 3D samples in FreeCAD's formats: .FCStd .step .stl .3mf (the showcase also .obj .ply .off .amf)
// samples/freecad/ holds files made by FreeCAD itself (npm run build:samples:freecad).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { exportDxf } from '../src/domain/dxf.js';
import { serialize } from '../src/domain/format.js';
import { exportMesh } from '../src/domain/exchange3d.js';
import { solidMesh } from '../src/domain/solids.js';
import { toBinaryStl } from '../src/domain/stl.js';
import { arraysPlate, drawingViewsSample, gearbox3d, mountingBlock, partsCatalog, sectionSample, shaftAssembly, solidsShowcase, springsAndPipes } from './models3d.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'samples');
fs.mkdirSync(out, { recursive: true });

const dim = (drawing, data) => addEntity(drawing, 'dim', { size: 3.5, precision: 1, layer: 'dim', ...data });
const text = (drawing, x, y, value, size = 3.5) => addEntity(drawing, 'text', { x, y, text: value, size, layer: 'text' });
const sheet = (drawing, number, material) => Object.assign(drawing.sheet, { number, material, company: 'MyCAD samples' });

function gearPair() {
  const d = createDrawing({ title: '기어 쌍 (m2, z24/z16)', author: 'SHKWON' });
  sheet(d, 'MC-001', 'SM45C');
  addEntity(d, 'part', { kind: 'gear', x: 0, y: 0, params: { module: 2, teeth: 24, bore: 14 } });
  addEntity(d, 'part', { kind: 'gear', x: 40, y: 0, angle: 360 / 32, params: { module: 2, teeth: 16, bore: 10 } });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 40, y2: 0, ox: 20, oy: 40 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 26, angle: 225 });
  dim(d, { kind: 'diameter', cx: 40, cy: 0, r: 18, angle: -40 });
  text(d, -26, -45, '모듈 2 · 압력각 20° · 중심 거리 40 mm');
  return d;
}

function flange() {
  const d = createDrawing({ title: '플랜지 Ø120', author: 'SHKWON' });
  sheet(d, 'MC-002', 'SS400');
  addEntity(d, 'part', { kind: 'flange', x: 0, y: 0, params: { outer: 120, bore: 40, pcd: 90, holes: 6, holeDia: 11 } });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 60, angle: 30 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 20, angle: 200 });
  dim(d, { kind: 'diameter', cx: 0, cy: 0, r: 45, angle: 120, text: 'PCD <>' });
  text(d, -40, -80, '6-Ø11 등간격 관통');
  return d;
}

function shaft() {
  const d = createDrawing({ title: '단붙이 축', author: 'SHKWON' });
  sheet(d, 'MC-003', 'SCM440');
  addEntity(d, 'part', { kind: 'shaft', x: 0, y: 0, params: { segments: '20x30, 30x50, 25x20, 20x30', chamfer: 1 } });
  let x = 0;
  for (const [diameter, length] of [[20, 30], [30, 50], [25, 20], [20, 30]]) {
    dim(d, { kind: 'horizontal', x1: x, y1: diameter / 2, x2: x + length, y2: diameter / 2, ox: x + length / 2, oy: 26 });
    dim(d, { kind: 'vertical', x1: x + length / 2, y1: -diameter / 2, x2: x + length / 2, y2: diameter / 2, ox: x + length / 2, oy: 0, text: 'Ø<>' });
    x += length;
  }
  dim(d, { kind: 'horizontal', x1: 0, y1: 10, x2: x, y2: 10, ox: x / 2, oy: 36 });
  return d;
}

function bracket() {
  const d = createDrawing({ title: '고정 브래킷', author: 'SHKWON' });
  sheet(d, 'MC-004', 'AL6061');
  addEntity(d, 'rect', { x: 0, y: 0, width: 120, height: 70, radius: 8 });
  addEntity(d, 'part', { kind: 'slot', x: 30, y: 50, params: { length: 20, width: 8 } });
  addEntity(d, 'part', { kind: 'slot', x: 90, y: 50, params: { length: 20, width: 8 } });
  for (const [cx, cy] of [[15, 15], [105, 15]]) addEntity(d, 'circle', { cx, cy, r: 4.5, centerMark: true });
  addEntity(d, 'circle', { cx: 60, cy: 25, r: 12, centerMark: true });
  dim(d, { kind: 'horizontal', x1: 0, y1: 0, x2: 120, y2: 0, ox: 60, oy: -14 });
  dim(d, { kind: 'vertical', x1: 120, y1: 0, x2: 120, y2: 70, ox: 134, oy: 35 });
  dim(d, { kind: 'diameter', cx: 60, cy: 25, r: 12, angle: 35 });
  dim(d, { kind: 'horizontal', x1: 15, y1: 15, x2: 105, y2: 15, ox: 60, oy: 6 });
  text(d, 0, 84, '두께 6 mm — 3D 보기와 STL 내보내기로 확인하세요');
  return d;
}

function boltAndNut() {
  const d = createDrawing({ title: 'M10 볼트·너트·와셔', author: 'SHKWON' });
  sheet(d, 'MC-005', 'SCM435 (8.8)');
  addEntity(d, 'part', { kind: 'bolt', x: 0, y: 0, params: { size: 10, length: 40 } });
  addEntity(d, 'part', { kind: 'nut', x: 80, y: 0, params: { size: 10 } });
  addEntity(d, 'part', { kind: 'washer', x: 120, y: 0, params: { size: 10, type: 'plain' } });
  addEntity(d, 'part', { kind: 'socketScrew', x: 0, y: -50, params: { size: 8, length: 25 } });
  addEntity(d, 'part', { kind: 'hole', x: 80, y: -50, params: { size: 8, type: 'counterbore' } });
  dim(d, { kind: 'horizontal', x1: 0, y1: 5, x2: 40, y2: 5, ox: 20, oy: 18 });
  text(d, -6, -24, 'M10 × 40 · 너트 맞변 16 · 와셔 Ø20');
  return d;
}

const files = [
  ['01-gear-pair', gearPair()], ['02-flange', flange()], ['03-shaft', shaft()], ['04-bracket', bracket()], ['05-bolt-and-nut', boltAndNut()],
  ['06-cover-plate', arraysPlate()], ['07-shaft-assembly', shaftAssembly()], ['08-parts-catalog', partsCatalog()],
  ['09-solids-showcase', solidsShowcase()], ['10-mounting-block', mountingBlock()], ['11-springs-pipes', springsAndPipes()], ['12-gearbox', gearbox3d()],
  ['13-drawing-views', drawingViewsSample()], ['14-sections', sectionSample()],
];
for (const [name, drawing] of files) fs.writeFileSync(path.join(out, `${name}.mcad`), serialize(drawing));
fs.writeFileSync(path.join(out, '04-bracket.dxf'), exportDxf(files[3][1]));

// The 3D samples in every 3D format FreeCAD reads.
const exportsDir = path.join(out, 'exports');
fs.mkdirSync(exportsDir, { recursive: true });
const FORMATS = ['fcstd', 'step', 'stl', 'obj', 'ply', 'off', 'amf', '3mf'];
const written = [];
for (const [name, drawing] of files) {
  const solids = drawing.entities.filter((entity) => entity.type === 'solid');
  if (!solids.length) continue;
  // Every format for the showcase; FreeCAD's main ones for the rest (keeps samples/ small).
  for (const format of name === '09-solids-showcase' ? FORMATS : ['fcstd', 'step', 'stl', '3mf']) {
    const file = `${name}.${format === 'fcstd' ? 'FCStd' : format}`;
    const bytes = format === 'stl' ? toBinaryStl(solids.flatMap((entity) => solidMesh(entity)), drawing.title) : exportMesh(format, drawing, drawing.entities);
    fs.writeFileSync(path.join(exportsDir, file), bytes);
    written.push(file);
  }
}
console.log(`samples/: ${files.map(([name]) => `${name}.mcad`).join(', ')}, 04-bracket.dxf`);
console.log(`samples/exports/: ${written.length} files (${FORMATS.join(', ')})`);
