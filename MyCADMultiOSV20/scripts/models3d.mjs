// 3D sample models shared by the sample generator (scripts/create-samples.mjs)
// and the FreeCAD round-trip test (test/freecad). Every solid has a unique
// name, so FreeCAD's objects can be matched to MyCAD's one by one.
import { booleanOf } from '../src/domain/csg.js';
import { boxOfEntities } from '../src/domain/entities.js';
import { defaultParams, PART_CATEGORIES } from '../src/domain/parts.js';
import { buildShapes, collectLoops } from '../src/domain/stl.js';
import { drawingViews, sectionOutlines } from '../src/domain/views.js';
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { arcPoints } from '../src/domain/geometry.js';
import { featureFrom, flattenTriangles, solidMesh } from '../src/domain/solids.js';
import { normalizeEntity } from '../src/domain/entities.js';

/** A boolean tree (like FreeCAD's Part::Cut / Fuse / Common) of raw solids. */
const bool = (op, parts, extra = {}) => ({ type: 'solid', kind: 'boolean', params: {}, shape: { op, parts }, ...extra });
const raw = (kind, params, place = {}) => ({ type: 'solid', kind, params, ...place });
const solid = (d, kind, name, params = {}, place = {}, shape = undefined) => addEntity(d, 'solid', { kind, name, params, ...place, ...(shape ? { shape } : {}) });
const circleLoop = (cx, cy, r, n = 48) => arcPoints(cx, cy, r, 0, 360, 360 / n).slice(0, -1);

/** Every kind of solid, plain and turned, scaled and mirrored. */
export function solidsShowcase() {
  const d = createDrawing({ title: '3D 솔리드 모음', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-01', material: 'AL6061', company: 'MyCAD samples' });
  solid(d, 'box', 'Block', { length: 30, width: 20, height: 10 }, { x: 0, y: 0 });
  solid(d, 'box', 'BlockTurned', { length: 20, width: 10, height: 6 }, { x: 45, y: 0, rx: 15, ry: -20, rz: 30 });
  solid(d, 'cylinder', 'Pin', { radius: 6, height: 25 }, { x: 90, y: 10 });
  solid(d, 'cylinder', 'QuarterRound', { radius: 10, height: 8, angle: 90 }, { x: 115, y: 0, rz: 20 });
  solid(d, 'cylinder', 'QuarterMirrored', { radius: 10, height: 8, angle: 90 }, { x: 140, y: 0, flip: true });
  solid(d, 'sphere', 'Ball', { radius: 8 }, { x: 0, y: 45, z: 8 });
  solid(d, 'cone', 'Funnel', { radius1: 9, radius2: 3, height: 14 }, { x: 30, y: 45 });
  solid(d, 'cone', 'Spike', { radius1: 5, radius2: 0, height: 15 }, { x: 55, y: 45, rx: 90 });
  solid(d, 'torus', 'Ring', { radius1: 10, radius2: 2.5 }, { x: 85, y: 45, z: 2.5 });
  solid(d, 'tube', 'Sleeve', { outer: 8, inner: 5, height: 20 }, { x: 115, y: 45 });
  solid(d, 'wedge', 'Ramp', { length: 20, width: 12, height: 10, topLength: 6 }, { x: 135, y: 40 });
  solid(d, 'wedge', 'RampMirrored', { length: 20, width: 12, height: 10, topLength: 6 }, { x: 165, y: 52, flip: true, rz: 10 });
  solid(d, 'prism', 'HexBar', { sides: 6, radius: 7, height: 18 }, { x: 0, y: 85 });
  solid(d, 'ellipsoid', 'Egg', { radius1: 9, radius2: 6, radius3: 4 }, { x: 30, y: 85, z: 9 });
  solid(d, 'helix', 'Coil', { radius: 8, pitch: 4, turns: 4, wire: 1.2 }, { x: 60, y: 85 });
  solid(d, 'box', 'BlockScaled', { length: 10, width: 10, height: 10 }, { x: 85, y: 78, scale: 1.5 });
  // Pad: a plate with two holes, from 2D outlines.
  solid(d, 'pad', 'Plate', { height: 5 }, { x: 110, y: 75 }, {
    shapes: [{ outer: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 22 }, { x: 0, y: 22 }], holes: [circleLoop(10, 11, 4), circleLoop(30, 11, 4)] }],
  });
  solid(d, 'pad', 'PlateTilted', { height: 4 }, { x: 165, y: 75, rx: 30 }, {
    shapes: [{ outer: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 20 }, { x: 0, y: 20 }], holes: [] }],
  });
  // Revolution: a V-belt pulley profile in (r, z).
  solid(d, 'revolution', 'Pulley', { angle: 360 }, { x: 0, y: 125 }, {
    profile: [[4, 0], [16, 0], [16, 2], [12, 6], [16, 10], [16, 12], [4, 12]],
  });
  solid(d, 'revolution', 'HalfPulley', { angle: 180 }, { x: 40, y: 125, rz: 45 }, {
    profile: [[4, 0], [12, 0], [12, 8], [4, 8]],
  });
  // Loft: square to circle.
  solid(d, 'loft', 'Transition', { height: 20 }, { x: 75, y: 125 }, {
    bottom: [{ x: -8, y: -8 }, { x: 8, y: -8 }, { x: 8, y: 8 }, { x: -8, y: 8 }], top: circleLoop(0, 0, 5),
  });
  // Sweep: a bent pipe.
  solid(d, 'sweep', 'BentPipe', { radius: 2 }, { x: 100, y: 120 }, {
    path: [[0, 0, 0], [20, 0, 0], ...arcPoints(20, 10, 10, 270, 360, 10).slice(1).map((p) => [p.x, p.y, 0]), [30, 30, 0]],
  });
  // A boolean (box with a cylinder cut out), kept as a tree.
  addEntity(d, 'solid', { ...bool('cut', [raw('box', { length: 24, width: 16, height: 10 }, { x: 140, y: 110 }), raw('cylinder', { radius: 5, height: 20 }, { x: 152, y: 118, z: -5 })]), name: 'DrilledBlock' });
  // An imported-style mesh (a tetrahedron).
  solid(d, 'mesh', 'MeshTetra', {}, {}, { tris: flattenTriangles([[[180, 0, 0], [190, 10, 0], [190, 0, 0]], [[180, 0, 0], [190, 0, 0], [185, 5, 10]], [[190, 0, 0], [190, 10, 0], [185, 5, 10]], [[190, 10, 0], [180, 0, 0], [185, 5, 10]]]) });
  // A 2D sketch next to the solids (exported as a FreeCAD sketch).
  addEntity(d, 'rect', { x: -20, y: -30, width: 60, height: 15 });
  addEntity(d, 'circle', { cx: 60, cy: -22, r: 6 });
  addEntity(d, 'arc', { cx: 90, cy: -22, r: 8, start: 0, end: 180 });
  addEntity(d, 'text', { x: -20, y: -40, text: 'FreeCAD Part 프리미티브 · 패드 · 회전 · 로프트 · 스윕 · 불리언', size: 3.5, layer: 'text' });
  return d;
}

/** A small assembly of parts with booleans — a mounting block. */
export function mountingBlock() {
  const d = createDrawing({ title: '마운팅 블록 (불리언)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-02', material: 'SS400', company: 'MyCAD samples' });
  const body = bool('union', [raw('box', { length: 80, width: 50, height: 12 }), raw('cylinder', { radius: 14, height: 30 }, { x: 40, y: 25 })]);
  const holes = [[10, 10], [70, 10], [70, 40], [10, 40]].map(([x, y]) => raw('cylinder', { radius: 3.3, height: 40 }, { x, y, z: -10 }));
  const tree = bool('cut', [body, raw('cylinder', { radius: 8, height: 60 }, { x: 40, y: 25, z: -10 }), ...holes, raw('box', { length: 30, width: 6, height: 20 }, { x: 25, y: 22, z: 24 })]);
  addEntity(d, 'solid', { ...tree, name: 'MountingBlock' });
  addEntity(d, 'dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 80, y2: 0, ox: 40, oy: -12, size: 3.5, precision: 0, layer: 'dim' });
  addEntity(d, 'dim', { kind: 'vertical', x1: 80, y1: 0, x2: 80, y2: 50, ox: 92, oy: 25, size: 3.5, precision: 0, layer: 'dim' });
  return d;
}

/** A helical spring next to a coil, a pipe run and a lofted hopper. */
export function springsAndPipes() {
  const d = createDrawing({ title: '스프링 · 배관 · 호퍼', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-03', material: 'SUS304', company: 'MyCAD samples' });
  solid(d, 'helix', 'Spring', { radius: 12, pitch: 6, turns: 8, wire: 2 }, { x: 0, y: 0 });
  solid(d, 'sweep', 'Pipe', { radius: 3 }, { x: 40, y: -10 }, {
    // Up 30, a 90° bend of radius 15 (in the x–z plane), then 45 along x.
    path: [[0, 0, 0], [0, 0, 30], ...Array.from({ length: 9 }, (_, i) => {
      const a = ((180 - (i + 1) * 10) * Math.PI) / 180;
      return [15 + 15 * Math.cos(a), 0, 30 + 15 * Math.sin(a)];
    }), [60, 0, 45]],
  });
  solid(d, 'loft', 'Hopper', { height: 30 }, { x: 0, y: 60 }, {
    bottom: circleLoop(0, 0, 6), top: [{ x: -20, y: -15 }, { x: 20, y: -15 }, { x: 20, y: 15 }, { x: -20, y: 15 }],
  });
  return d;
}


// ───────────────────────── more samples

const CATEGORY_LABELS = { fasteners: '체결 요소 (Fasteners)', pins: '핀·키·링 (Pins, keys, rings)', gears: '기어·풀리 (Gears, pulleys)', bearings: '베어링·축 (Bearings, shafts)', springs: '스프링 (Springs)', profiles: '형강·프로파일 (Profiles)' };

/** Every part of the library, laid out by category with its name. */
export function partsCatalog() {
  const d = createDrawing({ title: '부품 라이브러리 전체', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-LIB-01', material: '-', company: 'MyCAD samples' });
  let y = 0;
  for (const [category, kinds] of Object.entries(PART_CATEGORIES)) {
    let x = 0;
    let rowHeight = 0;
    addEntity(d, 'text', { x: -10, y: y + 12, text: CATEGORY_LABELS[category], size: 6, bold: true, layer: 'text' });
    for (const kind of kinds) {
      const probe = normalizeEntity({ type: 'part', kind, params: defaultParams(kind) });
      const box = boxOfEntities([probe]);
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      addEntity(d, 'part', { kind, x: x - box.minX, y: y - box.maxY, params: defaultParams(kind) });
      addEntity(d, 'text', { x, y: y - h - 8, text: kind, size: 3, layer: 'text' });
      x += Math.max(w, 30) + 20;
      rowHeight = Math.max(rowHeight, h);
    }
    y -= rowHeight + 45;
  }
  return d;
}

/** A cover plate: a rectangular array of holes, a bolt circle of counterbores, slots. */
export function arraysPlate() {
  const d = createDrawing({ title: '커버 플레이트 (배열)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-006', material: 'AL5052', company: 'MyCAD samples' });
  addEntity(d, 'rect', { x: 0, y: 0, width: 160, height: 100, radius: 6 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) addEntity(d, 'circle', { cx: 15 + c * 15, cy: 20 + r * 30, r: 3, centerMark: true });
  addEntity(d, 'circle', { cx: 115, cy: 50, r: 18, centerMark: true });
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 * Math.PI) / 180;
    addEntity(d, 'part', { kind: 'hole', x: 115 + 30 * Math.cos(a), y: 50 + 30 * Math.sin(a), params: { size: 5, type: 'counterbore', view: 'top' } });
  }
  addEntity(d, 'part', { kind: 'slot', x: 115, y: 10, params: { length: 30, width: 6 } });
  addEntity(d, 'part', { kind: 'slot', x: 115, y: 90, params: { length: 30, width: 6 } });
  addEntity(d, 'dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 160, y2: 0, ox: 80, oy: -12, size: 3.5, precision: 0, layer: 'dim' });
  addEntity(d, 'dim', { kind: 'vertical', x1: 160, y1: 0, x2: 160, y2: 100, ox: 172, oy: 50, size: 3.5, precision: 0, layer: 'dim' });
  addEntity(d, 'dim', { kind: 'diameter', cx: 115, cy: 50, r: 18, angle: 30, size: 3.5, precision: 0, layer: 'dim' });
  addEntity(d, 'text', { x: 0, y: 110, text: '4×3 구멍 Ø6 피치 15·30 · M5 카운터보어 6개 PCD 60 · 두께 3 mm', size: 3.5, layer: 'text' });
  return d;
}

/** A shaft assembly (side view): stepped shaft, two bearings, a gear, a key, a circlip. */
export function shaftAssembly() {
  const d = createDrawing({ title: '축 조립도', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-007', material: 'S45C', company: 'MyCAD samples' });
  addEntity(d, 'part', { kind: 'shaft', x: 0, y: 0, params: { segments: '20x25, 25x15, 30x40, 25x15, 20x25', chamfer: 1 } });
  addEntity(d, 'part', { kind: 'bearing', x: 32.5, y: 0, params: { series: 6205, view: 'section' } });
  addEntity(d, 'part', { kind: 'bearing', x: 87.5, y: 0, params: { series: 6205, view: 'section' } });
  addEntity(d, 'part', { kind: 'gear', x: 60, y: 80, params: { module: 2, teeth: 30, bore: 30 } });
  addEntity(d, 'part', { kind: 'parallelKey', x: 60, y: -45, params: {} });
  addEntity(d, 'part', { kind: 'circlipShaft', x: 150, y: 0, params: {} });
  addEntity(d, 'line', { x1: -10, y1: 0, x2: 130, y2: 0, lineType: 'center', layer: 'center' });
  addEntity(d, 'dim', { kind: 'horizontal', x1: 0, y1: 10, x2: 120, y2: 10, ox: 60, oy: 34, size: 3.5, precision: 0, layer: 'dim' });
  addEntity(d, 'text', { x: 0, y: -65, text: '6205 베어링 2개 · 기어 m2 z30 · 평행 키 · 축용 멈춤링', size: 3.5, layer: 'text' });
  return d;
}

/** A small gearbox in 3D: a hollow housing with bores, two shafts, two gears padded from the gear part outlines. */
export function gearbox3d() {
  const d = createDrawing({ title: '기어박스 (3D)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-04', material: 'FC200', company: 'MyCAD samples' });
  // An open box with bores through the front and back walls (along y).
  const bores = [0, 54].map((x) => raw('cylinder', { radius: 8, height: 90 }, { x, y: 45, z: 20, rx: 90 }));
  const housing = bool('cut', [raw('box', { length: 120, width: 70, height: 60 }, { x: -30, y: -35, z: -10 }), raw('box', { length: 110, width: 60, height: 60 }, { x: -25, y: -30, z: -5 }), ...bores]);
  addEntity(d, 'solid', { ...housing, name: 'Housing', color: '#9aa4b1' });
  for (const [x, teeth] of [[0, 30], [54, 24]]) {
    const gear = normalizeEntity({ type: 'part', kind: 'gear', x, y: 0, params: { module: 2, teeth, bore: 12, keyway: false, pitchCircle: false } });
    const shapes = buildShapes(collectLoops([gear]).loops).map(({ outer: o, holes }) => ({ outer: o, holes }));
    // The gear lies in the x–z plane of the shaft: pad it, then turn it upright.
    addEntity(d, 'solid', { ...featureFrom('pad', { shapes: shapes.map((s) => ({ outer: s.outer.map((p) => ({ x: p.x - x, y: p.y })), holes: s.holes.map((h) => h.map((p) => ({ x: p.x - x, y: p.y }))) })) }, { height: 12 }), name: `Gear z${teeth}`, x, y: 6, z: 20, rx: 90 });
    addEntity(d, 'solid', { kind: 'cylinder', name: `Shaft z${teeth}`, params: { radius: 6, height: 100 }, x, y: 50, z: 20, rx: 90 });
  }
  return d;
}

/** A bracket with its drawing views (front, top, right with hidden lines, isometric). */
export function drawingViewsSample() {
  const d = createDrawing({ title: '투상도 (TechDraw)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-05', material: 'SS400', company: 'MyCAD samples' });
  const body = bool('cut', [
    bool('union', [raw('box', { length: 60, width: 40, height: 10 }), raw('box', { length: 10, width: 40, height: 40 })]),
    raw('cylinder', { radius: 6, height: 30 }, { x: 38, y: 20, z: -10 }), raw('cylinder', { radius: 5, height: 30 }, { x: -10, y: 20, z: 27, ry: 90 }),
  ]);
  addEntity(d, 'solid', { ...body, name: 'Bracket' });
  const solids = d.entities.filter((e) => e.type === 'solid');
  const labels = { front: '정면도', top: '평면도', right: '우측면도', iso: '등각도' };
  for (const raw of drawingViews(solids, { x0: 90, y0: 0, gap: 25, labels })) addEntity(d, raw.type, raw);
  return d;
}

/** A pulley and a sleeve cut by horizontal planes (Part Section). */
export function sectionSample() {
  const d = createDrawing({ title: '단면 (Section)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-06', material: 'AC4C', company: 'MyCAD samples' });
  addEntity(d, 'solid', { kind: 'revolution', name: 'Pulley', params: { angle: 360 }, shape: { profile: [[6, 0], [30, 0], [30, 4], [24, 10], [30, 16], [30, 20], [6, 20]] } });
  addEntity(d, 'solid', { kind: 'tube', name: 'Sleeve', params: { outer: 12, inner: 6, height: 30 }, x: 80 });
  const solids = d.entities.filter((e) => e.type === 'solid');
  [2, 10].forEach((level, row) => {
    const dy = -80 - row * 75;
    for (const raw of sectionOutlines(solids, level)) addEntity(d, raw.type, { ...raw, points: raw.points.map((p) => ({ x: p.x, y: p.y + dy })) });
    addEntity(d, 'text', { x: -35, y: dy + 36, text: `Z = ${level} mm`, size: 3.5, layer: 'text' });
  });
  return d;
}
