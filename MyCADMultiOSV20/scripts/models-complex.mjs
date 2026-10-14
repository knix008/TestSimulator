// Larger samples (scripts/create-samples.mjs): architecture in the way of
// FreeCAD's BIM workbench (a house plan, the same house in 3D with its
// elevations, an office floor), and bigger mechanical and structural designs
// (a two-stage gear reducer, a detailed shaft drawing, a machine vise, a steel
// frame). Building drawings are 1:1 in mm and printed at 1:100.
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { normalizeEntity } from '../src/domain/entities.js';
import { featureFrom } from '../src/domain/solids.js';
import { presetMaterials } from '../src/domain/arch.js';
import { buildShapes, collectLoops } from '../src/domain/stl.js';
import { drawingViews } from '../src/domain/views.js';

const bool = (op, parts, extra = {}) => ({ type: 'solid', kind: 'boolean', params: {}, shape: { op, parts }, ...extra });
const raw = (kind, params, place = {}) => ({ type: 'solid', kind, params, ...place });
const add = (d, type, data) => addEntity(d, type, data);
const layer = (d, id, name, color, lineType = 'continuous', lineWidth = 0.25) => {
  if (!d.layers.some((l) => l.id === id)) d.layers.push({ id, name, color, lineType, lineWidth, visible: true, locked: false });
};
const rectPts = (x0, y0, x1, y1) => [{ x: Math.min(x0, x1), y: Math.min(y0, y1) }, { x: Math.max(x0, x1), y: Math.min(y0, y1) }, { x: Math.max(x0, x1), y: Math.max(y0, y1) }, { x: Math.min(x0, x1), y: Math.max(y0, y1) }];
const poly = (d, points, extra = {}) => add(d, 'polyline', { points, closed: true, ...extra });
const line = (d, x1, y1, x2, y2, extra = {}) => add(d, 'line', { x1, y1, x2, y2, ...extra });
const text = (d, x, y, value, size, extra = {}) => add(d, 'text', { x, y, text: value, size, layer: 'text', ...extra });
const dim = (d, kind, x1, y1, x2, y2, ox, oy, size, extra = {}) => add(d, 'dim', { kind, x1, y1, x2, y2, ox, oy, size, precision: 0, layer: 'dim', ...extra });

/** A part's outline (gear, I-beam…) as pad shapes, centred on its origin. */
function partShapes(kind, params, angle = 0) {
  const part = normalizeEntity({ type: 'part', kind, x: 0, y: 0, angle, params });
  return buildShapes(collectLoops([part]).loops).map(({ outer, holes }) => ({ outer, holes }));
}
/** A padded part outline (a gear, a beam) as a raw solid. */
const padPart = (kind, params, height, place, angle = 0) => ({ type: 'solid', ...featureFrom('pad', { shapes: partShapes(kind, params, angle) }, { height }), ...place });

// ───────────────────────── architecture: a house (BIM objects, like FreeCAD's BIM workbench)

/**
 * The house: wall centre lines, thicknesses and openings, rooms. Walls are BIM
 * wall objects (3D) and the plan is their cut, as in FreeCAD.
 *   exterior: one closed wall (200) around 100…11900 × 100…8900
 *   interior: walls of 120, each stopping at the faces of the walls it meets
 * Openings: [offset along the wall from its start, width, type, swing side, hinge].
 */
const HOUSE = {
  outer: [[100, 100], [11900, 100], [11900, 8900], [100, 8900]],
  // Openings of the exterior wall per side, measured from the side's lower x / y end.
  outerOpenings: {
    south: [[1400, 2000, 'window'], [5900, 1000, 'door', 1, 1], [9100, 1600, 'window']],
    east: [[1400, 1200, 'window'], [6100, 1200, 'window']],
    north: [[1400, 1800, 'window'], [5900, 800, 'window'], [9100, 1600, 'window']],
    west: [[1900, 1800, 'window']],
  },
  inner: [
    // [x1, y1, x2, y2, openings]
    [5000, 200, 5000, 8800, [[2300, 900, 'door', 1, 1]]],
    [8000, 200, 8000, 8800, [[1800, 900, 'door', -1, 1], [4800, 900, 'door', -1, 1]]],
    [8060, 4500, 11800, 4500, []],
    [5060, 6000, 7940, 6000, [[1140, 800, 'door', 1, 1]]],
    [200, 5500, 4940, 5500, [[1800, 1500, 'opening']]],
  ],
  rooms: [
    { name: ['거실', 'Living'], x0: 100, y0: 100, x1: 5000, y1: 5500 },
    { name: ['주방·식당', 'Kitchen / dining'], x0: 100, y0: 5500, x1: 5000, y1: 8900 },
    { name: ['현관·복도', 'Hall'], x0: 5000, y0: 100, x1: 8000, y1: 6000 },
    { name: ['욕실', 'Bath'], x0: 5000, y0: 6000, x1: 8000, y1: 8900 },
    { name: ['침실 1', 'Bedroom 1'], x0: 8000, y0: 100, x1: 11900, y1: 4500 },
    { name: ['침실 2', 'Bedroom 2'], x0: 8000, y0: 4500, x1: 11900, y1: 8900 },
  ],
};
const H = 2700;

/** An opening of a wall object. */
const opening = ([at, width, type, swing = 1, hinge = 1]) => ({
  type, at, width, swing, hinge,
  height: type === 'window' ? 1300 : 2100,
  sill: type === 'window' ? 900 : 0,
});
const bim = (d, kind, params, shape, place = {}, extra = {}) => add(d, 'solid', { kind, params, shape, x: 0, y: 0, z: 0, ...place, ...extra });
const EQ = ['bed', 'sofa', 'table', 'chair', 'desk', 'wardrobe', 'toilet', 'basin', 'bathtub', 'sink', 'fridge', 'car'];
const furniture = (d, type, [length, width, height], place, name) => bim(d, 'equipment', { equipment: EQ.indexOf(type), length, width, height }, {}, place, { name, layer: 'furniture' });

/** The house as BIM objects: slab, walls with windows and doors, stairs, rooms, furniture, porch, roof. */
function houseModel(d) {
  layer(d, 'wall', '벽체', '#1d2433', 'continuous', 0.5);
  layer(d, 'slab', '슬래브', '#7a8394', 'continuous', 0.18);
  layer(d, 'stair', '계단', '#1d2433', 'continuous', 0.25);
  layer(d, 'space', '실', '#2f8f5b', 'continuous', 0.18);
  layer(d, 'furniture', '가구', '#7a8394', 'continuous', 0.18);
  layer(d, 'roof', '지붕', '#b5523b', 'hidden', 0.25);
  layer(d, 'grid', '통심선', '#e5484d', 'center', 0.18);
  bim(d, 'slab', { thickness: 200 }, { outer: rectPts(-100, -100, 12100, 9100).map(({ x, y }) => ({ x: x + 100, y: y + 100 })) }, { x: -100, y: -100 }, { name: '기초 슬래브', layer: 'slab' });
  // Exterior wall: one closed wall, counter-clockwise from the south-west corner.
  const [W, D] = [11800, 8800];
  const o = HOUSE.outerOpenings;
  const openings = [
    ...o.south.map(([at, ...rest]) => [at, ...rest]),
    ...o.east.map(([at, ...rest]) => [W + at, ...rest]),
    ...o.north.map(([at, width, ...rest]) => [W + D + (W - at - width), width, ...rest]),
    ...o.west.map(([at, width, ...rest]) => [2 * W + D + (D - at - width), width, ...rest]),
  ].map(opening);
  bim(d, 'wall', { width: 200, height: H, align: 0 }, { path: HOUSE.outer.map(([x, y]) => ({ x: x - 100, y: y - 100 })), closed: true, openings }, { x: 100, y: 100 }, { name: '외벽', layer: 'wall' });
  HOUSE.inner.forEach(([x1, y1, x2, y2, list], i) => {
    bim(d, 'wall', { width: 120, height: H, align: 0 }, { path: [{ x: 0, y: 0 }, { x: x2 - x1, y: y2 - y1 }], closed: false, openings: list.map(opening) }, { x: x1, y: y1 }, { name: `내벽 ${i + 1}`, layer: 'wall' });
  });
  // Stairs in the hall going up north: 14 risers of ≈193, treads 250.
  bim(d, 'stairs', { length: 3500, width: 1100, height: H, steps: 14, thickness: 150 }, {}, { x: 7800, y: 1500, rz: 90 }, { name: '계단', layer: 'stair' });
  // Rooms (between the wall faces).
  const face = (v, outerValue) => (v === outerValue ? 100 : 60);
  for (const room of HOUSE.rooms) {
    const x0 = room.x0 + face(room.x0, 100);
    const y0 = room.y0 + face(room.y0, 100);
    const x1 = room.x1 - face(room.x1, 11900);
    const y1 = room.y1 - face(room.y1, 8900);
    bim(d, 'space', { height: 2400 }, { outer: rectPts(0, 0, x1 - x0, y1 - y0), holes: [] }, { x: x0, y: y0 }, { name: room.name[0], layer: 'space' });
  }
  // Furniture and fixtures (Arch Equipment).
  furniture(d, 'sofa', [2800, 900, 850], { x: 3400, y: 1500, rz: 180 }, '소파');
  furniture(d, 'table', [1400, 700, 450], { x: 1300, y: 2000 }, '거실 탁자');
  furniture(d, 'wardrobe', [1000, 400, 500], { x: 900, y: 4950 }, 'TV 장');
  furniture(d, 'sink', [4400, 600, 900], { x: 300, y: 8150 }, '싱크대');
  furniture(d, 'fridge', [800, 700, 1800], { x: 4100, y: 7300 }, '냉장고');
  furniture(d, 'table', [1800, 1000, 740], { x: 1500, y: 6400 }, '식탁');
  for (const x of [1700, 2400, 3000]) {
    furniture(d, 'chair', [400, 450, 900], { x: x + 200, y: 6350, rz: 180 }, '의자');
    furniture(d, 'chair', [400, 450, 900], { x: x - 200, y: 7450 }, '의자');
  }
  furniture(d, 'bed', [2100, 1600, 900], { x: 9000, y: 3100, rz: -90 }, '침대 (퀸)');
  furniture(d, 'table', [400, 400, 500], { x: 8500, y: 2700 }, '협탁');
  furniture(d, 'table', [400, 400, 500], { x: 10700, y: 2700 }, '협탁');
  furniture(d, 'wardrobe', [2000, 600, 2200], { x: 8200, y: 3840 }, '붙박이장');
  furniture(d, 'bed', [2000, 1400, 900], { x: 9000, y: 8200, rz: -90 }, '침대 (더블)');
  furniture(d, 'desk', [1400, 700, 740], { x: 11800, y: 5000, rz: 90 }, '책상');
  furniture(d, 'bathtub', [1700, 750, 550], { x: 5200, y: 8000 }, '욕조');
  furniture(d, 'toilet', [700, 400, 800], { x: 7300, y: 8800, rz: -90 }, '변기');
  furniture(d, 'basin', [600, 450, 850], { x: 5510, y: 6250, rz: 90 }, '세면대');
  // Porch: slab, two columns, canopy.
  bim(d, 'slab', { thickness: 150 }, { outer: rectPts(0, 0, 2600, 1600), holes: [] }, { x: 5100, y: -1800 }, { name: '현관 바닥', layer: 'slab' });
  for (const [x, name] of [[5300, '현관 기둥 1'], [7500, '현관 기둥 2']]) bim(d, 'column', { width: 240, depth: 240, height: 2400, profile: 1 }, {}, { x, y: -1600 }, { name, layer: 'wall' });
  bim(d, 'slab', { thickness: 150 }, { outer: rectPts(0, 0, 2800, 1900), holes: [] }, { x: 5000, y: -1900, z: 2550 }, { name: '현관 캐노피', layer: 'roof' });
  // Gable roof (ridge along x) and the two gable walls.
  bim(d, 'roof', { roofType: 0, slope: 27.5, overhang: 300, thickness: 180 }, { outer: rectPts(0, 0, 11800, 8800), holes: [] }, { x: 100, y: 100, z: H }, { name: '박공지붕', layer: 'roof' });
  const rise = Math.tan((27.5 * Math.PI) / 180) * 4400;
  for (const [x, name] of [[0, '박공벽 (서)'], [11800, '박공벽 (동)']]) {
    add(d, 'solid', { kind: 'pad', name, layer: 'roof', params: { height: 200 }, shape: { shapes: [{ outer: [{ x: 0, y: 0 }, { x: 8800, y: 0 }, { x: 4400, y: rise }], holes: [] }] }, x, y: 100, z: H, rx: 90, rz: 90 });
  }
  // Structural grid 1–4 / A–C on the wall centre lines (Arch Axis with distances).
  bim(d, 'axis', { countX: 4, spacingX: 4000, countY: 3, spacingY: 4400, extension: 2000, bubble: 400 }, { xs: [0, 4900, 7900, 11800], ys: [0, 4400, 8800] }, { x: 100, y: 100 }, { name: '통심선', layer: 'grid' });
}

/** Floor plan of the house: the BIM model cut at 1 m (FreeCAD: section plane + TechDraw Arch view), dimensions and notes. */
export function housePlan() {
  const d = createDrawing({ title: '단독주택 1층 평면도 (S 1:100)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-101', material: '철근콘크리트 · 경량벽', company: 'MyCAD samples', scale: '1:100' });
  houseModel(d);
  // The roof is above the cut: its layer is off in the plan (the 3D view shows it when switched on).
  d.layers.find((l) => l.id === 'roof').visible = false;
  const T = 250;
  const xs = [100, 5000, 8000, 11900]; const ys = [100, 4500, 8900];
  for (let i = 0; i + 1 < xs.length; i++) dim(d, 'horizontal', xs[i], 9000, xs[i + 1], 9000, (xs[i] + xs[i + 1]) / 2, 9700, T);
  dim(d, 'horizontal', 0, 9000, 12000, 9000, 6000, 10600, T);
  for (let i = 0; i + 1 < ys.length; i++) dim(d, 'vertical', 0, ys[i], 0, ys[i + 1], -700, (ys[i] + ys[i + 1]) / 2, T);
  dim(d, 'vertical', 0, 0, 0, 9000, -1500, 4500, T);
  for (const [offset, width] of HOUSE.outerOpenings.south) dim(d, 'horizontal', 100 + offset, 0, 100 + offset + width, 0, 100 + offset + width / 2, -700, T * 0.8);
  // North arrow, section mark, title.
  add(d, 'circle', { cx: 14200, cy: 7600, r: 700, layer: 'text' });
  add(d, 'polyline', { points: [{ x: 14200, y: 8300 }, { x: 13900, y: 7100 }, { x: 14200, y: 7350 }, { x: 14500, y: 7100 }], closed: true, layer: 'text' });
  text(d, 14100, 8450, 'N', T * 1.6, { bold: true });
  line(d, 2600, -1200, 2600, 11200, { lineType: 'phantom', layer: 'text' });
  text(d, 2700, 11000, 'A', T * 1.4, { bold: true }); text(d, 2700, -1500, 'A', T * 1.4, { bold: true });
  text(d, 0, -3300, '단독주택 1층 평면도   S = 1:100   (단위 mm)', T * 1.8, { bold: true });
  text(d, 0, -3900, 'BIM 모델(벽·창호·계단·실·가구)을 바닥에서 1 m 높이로 자른 평면 · 3D 보기(Ctrl+Shift+3)로 같은 모델을 입체로 봅니다', T);
  return d;
}

/** The same house with its roof, and elevations projected from the model (TechDraw-style views). */
export function house3d() {
  const d = createDrawing({ title: '단독주택 3D 모델 · 입면도', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-201', material: '철근콘크리트', company: 'MyCAD samples', scale: '1:100' });
  houseModel(d);
  const placed = d.entities.filter((e) => e.type === 'solid' && e.layer !== 'furniture');
  for (const view of drawingViews(placed, { x0: 16000, y0: 0, gap: 2500, views: { front: true, right: true, top: true, iso: false }, labels: { front: '남측 입면도', right: '동측 입면도', top: '지붕 평면도' }, textHeight: 300 })) add(d, view.type, view);
  text(d, 16000, -2000, '입면도: BIM 모델에서 투영 (숨은선 점선)', 300);
  return d;
}

// ───────────────────────── architecture: an office floor (BIM objects)

export function officePlan() {
  const d = createDrawing({ title: '사무소 기준층 평면도 (S 1:200)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-301', material: '철골철근콘크리트', company: 'MyCAD samples', scale: '1:200' });
  layer(d, 'wall', '벽체', '#1d2433', 'continuous', 0.5);
  layer(d, 'column', '기둥', '#1d2433', 'continuous', 0.5);
  layer(d, 'glass', '커튼월', '#3a6cf0', 'continuous', 0.18);
  layer(d, 'slab', '슬래브', '#7a8394', 'continuous', 0.13);
  layer(d, 'stair', '계단', '#1d2433', 'continuous', 0.25);
  layer(d, 'space', '실', '#2f8f5b', 'continuous', 0.13);
  layer(d, 'furniture', '가구', '#7a8394', 'continuous', 0.13);
  layer(d, 'grid', '통심선', '#e5484d', 'center', 0.18);
  const T = 400;
  const FH = 3600; // floor to slab
  const bay = 8000; const nx = 5; const ny = 3;
  const W = bay * nx; const D = bay * ny;
  bim(d, 'slab', { thickness: 250 }, { outer: rectPts(0, 0, W + 600, D + 600), holes: [] }, { x: -300, y: -300 }, { name: '바닥 슬래브', layer: 'slab' });
  bim(d, 'curtainwall', { height: FH, spacing: 1500, vspacing: 1200, mullion: 60, depth: 150 }, { path: rectPts(0, 0, W + 200, D + 200), closed: true }, { x: -100, y: -100 }, { name: '커튼월', layer: 'glass' });
  bim(d, 'axis', { countX: nx + 1, spacingX: bay, countY: ny + 1, spacingY: bay, extension: 3000, bubble: 600 }, {}, {}, { name: '통심선', layer: 'grid' });
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) bim(d, 'column', { width: 700, depth: 700, height: FH, profile: 0 }, {}, { x: i * bay, y: j * bay }, { name: `기둥 ${i + 1}${'ABCD'[j]}`, layer: 'column' });
  // Core in the middle bay: concrete walls round two stairs, two lifts and the toilets.
  const cx0 = 2 * bay + 300; const cy0 = bay + 300; const cx1 = 3 * bay - 300; const cy1 = 2 * bay - 300;
  bim(d, 'wall', { width: 250, height: FH, align: 0 }, { path: rectPts(0, 0, cx1 - cx0, cy1 - cy0), closed: true, openings: [opening([1400, 1000, 'door', 1, 1]), opening([3400, 900, 'opening']), opening([(cx1 - cx0) - 2400, 1000, 'door', 1, -1])] }, { x: cx0, y: cy0 }, { name: '코어 벽', layer: 'wall' });
  for (const [x, name] of [[cx0 + 2700, '코어 칸막이 (서)'], [cx1 - 2700, '코어 칸막이 (동)']]) bim(d, 'wall', { width: 200, height: FH, align: 0 }, { path: [{ x: 0, y: 0 }, { x: 0, y: cy1 - cy0 - 250 }], openings: [] }, { x, y: cy0 + 125 }, { name, layer: 'wall' });
  // Two U-shaped stairs: two flights each, up then back (FH / 2 each).
  for (const [x0, side] of [[cx0 + 125, 'W'], [cx1 - 2575, 'E']]) {
    bim(d, 'stairs', { length: 3000, width: 1150, height: FH / 2, steps: 12, thickness: 150 }, {}, { x: x0 + 1150, y: cy0 + 1000, rz: 90 }, { name: `계단 ${side} (1)`, layer: 'stair' });
    bim(d, 'stairs', { length: 3000, width: 1150, height: FH / 2, steps: 12, thickness: 150 }, {}, { x: x0 + 1300, y: cy0 + 4000, z: FH / 2, rz: -90 }, { name: `계단 ${side} (2)`, layer: 'stair' });
    bim(d, 'slab', { thickness: 150 }, { outer: rectPts(0, 0, 2450, 1300), holes: [] }, { x: x0, y: cy0 + 4000, z: FH / 2 }, { name: `계단참 ${side}`, layer: 'stair' });
  }
  // Lifts: shafts with doors, one above the other.
  const mx = cx0 + 3000;
  for (let k = 0; k < 2; k++) {
    bim(d, 'wall', { width: 150, height: FH, align: 0 }, { path: rectPts(0, 0, 1600, 1900), closed: true, openings: [opening([400, 900, 'sliding'])] }, { x: mx, y: cy0 + 400 + k * 2100 }, { name: `승강기 ${k + 1}`, layer: 'wall' });
  }
  for (let k = 0; k < 2; k++) furniture(d, 'toilet', [700, 400, 800], { x: mx + 200 + k * 800, y: cy1 - 300, rz: -90 }, '변기');
  furniture(d, 'basin', [600, 450, 850], { x: mx + 1600, y: cy1 - 1700, rz: 90 }, '세면대');
  // Meeting rooms along the north side (bays 1 and 5): partitions with a door, a table and chairs.
  for (const [x0, x1, name] of [[300, bay + 4000, '회의실 A'], [bay * 4 - 4000, W - 300, '회의실 B']]) {
    bim(d, 'wall', { width: 120, height: FH, align: 0 }, { path: [{ x: 0, y: 0 }, { x: x1 - x0, y: 0 }], openings: [opening([(x1 - x0) / 2 + 2400, 900, 'door', 1, 1])] }, { x: x0, y: D - 5000 }, { name: `${name} 칸막이`, layer: 'wall' });
    const side = x0 < W / 2 ? x1 : x0;
    bim(d, 'wall', { width: 120, height: FH, align: 0 }, { path: [{ x: 0, y: 0 }, { x: 0, y: 4700 }], openings: [] }, { x: side, y: D - 5000 }, { name: `${name} 칸막이 2`, layer: 'wall' });
    const cx = (x0 + x1) / 2;
    furniture(d, 'table', [4800, 1900, 740], { x: cx - 2400, y: D - 3600 }, `${name} 회의 탁자`);
    for (let k = 0; k < 8; k++) {
      furniture(d, 'chair', [450, 450, 900], { x: cx - 2100 + k * 600 + 225, y: D - 3650, rz: 180 }, '의자');
      furniture(d, 'chair', [450, 450, 900], { x: cx - 2100 + k * 600 - 225, y: D - 1650 }, '의자');
    }
    bim(d, 'space', { height: 2700 }, { outer: rectPts(0, 0, x1 - x0 - 60, 4640), holes: [] }, { x: x0 + (x0 < W / 2 ? 0 : 60), y: D - 4940 }, { name: `${name} (16인)`, layer: 'space' });
  }
  // Open office: clusters of four desks with chairs.
  const cluster = (x, y) => {
    for (const [dx, dy] of [[0, 0], [1600, 0]]) furniture(d, 'desk', [1600, 800, 740], { x: x + dx, y: y + dy }, '책상');
    for (const [dx, dy] of [[0, 800], [1600, 800]]) furniture(d, 'desk', [1600, 800, 740], { x: x + dx + 1600, y: y + dy + 800, rz: 180 }, '책상');
    for (const [dx, dy] of [[800, -350], [2400, -350]]) furniture(d, 'chair', [450, 450, 900], { x: x + dx + 225, y: y + dy + 225, rz: 180 }, '의자');
    for (const [dx, dy] of [[800, 1950], [2400, 1950]]) furniture(d, 'chair', [450, 450, 900], { x: x + dx - 225, y: y + dy - 225 }, '의자');
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const x = 1200 + i * 7800; const y = 1500 + j * 4200;
    if (x > cx0 - 3500 && x < cx1 + 300 && y > cy0 - 2500) continue;
    cluster(x, y);
    cluster(x + 3600, y);
  }
  bim(d, 'space', { height: 2700 }, { outer: rectPts(0, 0, W - 400, D - 5200), holes: [rectPts(cx0 - 200, cy0 - 200, cx1 - 200, cy1 - 200)] }, { x: 200, y: 200 }, { name: '사무실', layer: 'space' });
  // Dimensions on the grid.
  for (let i = 0; i < nx; i++) dim(d, 'horizontal', i * bay, D, (i + 1) * bay, D, i * bay + bay / 2, D + 1600, T);
  dim(d, 'horizontal', 0, D, W, D, W / 2, D + 2600, T);
  for (let j = 0; j < ny; j++) dim(d, 'vertical', 0, j * bay, 0, (j + 1) * bay, -1600, j * bay + bay / 2, T);
  dim(d, 'vertical', 0, 0, 0, D, -2600, D / 2, T);
  text(d, 0, -6400, `사무소 기준층 평면도   S = 1:200   바닥면적 ${(W * D / 1e6).toFixed(0)} m² · 기둥 ${(nx + 1) * (ny + 1)}개`, T * 1.6, { bold: true });
  text(d, 0, -7300, 'BIM 모델(커튼월·기둥·코어 벽·계단·승강기·가구)의 1 m 단면 · 3D 보기에서 같은 모델을 입체로', T);
  return d;
}


// ───────────────────────── architecture: a two-storey house (levels, materials, layered walls, rebar, any-outline roof)

/** A two-storey L-shaped house: levels, layered walls, a hip roof over the L with gable ends, rebar, a carport truss, a pipe. */
export function twoStoreyHouse() {
  const d = createDrawing({ title: '2층 주택 — 층 · 재료 · 철근 (BIM)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-401', material: '철근콘크리트 · 벽돌 치장', company: 'MyCAD samples', scale: '1:100' });
  for (const [id, name, color, type, width] of [['wall', '벽체', '#1d2433', 'continuous', 0.5], ['slab', '슬래브', '#7a8394', 'continuous', 0.18], ['stair', '계단', '#1d2433', 'continuous', 0.25], ['space', '실', '#2f8f5b', 'continuous', 0.18], ['furniture', '가구', '#7a8394', 'continuous', 0.18], ['roof', '지붕', '#b5523b', 'hidden', 0.25], ['structure', '구조', '#8a4b2a', 'continuous', 0.25], ['grid', '통심선', '#e5484d', 'center', 0.18]]) layer(d, id, name, color, type, width);
  const M = Object.fromEntries(presetMaterials('ko').map((m) => [m.id, m]));
  d.bim = { site: '대지 (남향)', building: '2층 주택', levels: [{ id: 'L1', name: '1층', elevation: 0, height: 3000, visible: true }, { id: 'L2', name: '2층', elevation: 3000, height: 3000, visible: true }], activeLevel: 'L1', planLevel: 'L1', materials: presetMaterials('ko') };
  const on = (level, extra = {}) => ({ level, ...extra });
  // The L outline (wall centre line), counter-clockwise.
  const L = [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 6000 }, { x: 6000, y: 6000 }, { x: 6000, y: 10000 }, { x: 0, y: 10000 }];
  const layers = [{ material: M.brick, thickness: 90 }, { material: M.insulation, thickness: 100 }, { material: M.concrete, thickness: 180 }, { material: M.gypsum, thickness: 12 }];
  const win = (at, width, cols = 2, rows = 1, sill = 900, height = 1300) => ({ type: 'window', at, width, height, sill, swing: 1, hinge: 1, cols, rows });
  const door = (at, width = 1000, swing = 1, hinge = 1) => ({ type: 'door', at, width, height: 2100, sill: 0, swing, hinge });
  // A round-headed window drawn as a sketch (frame outline and its panes, in 0…1).
  const arch = Array.from({ length: 13 }, (_, i) => ({ u: 0.5 + 0.5 * Math.cos((Math.PI * i) / 12), v: 0.6 + 0.4 * Math.sin((Math.PI * i) / 12) }));
  const arched = { outer: [{ u: 0, v: 0 }, { u: 1, v: 0 }, ...arch.slice(0, 13)], holes: [[{ u: 0.12, v: 0.08 }, { u: 0.88, v: 0.08 }, { u: 0.88, v: 0.58 }, { u: 0.12, v: 0.58 }], [{ u: 0.12, v: 0.64 }, { u: 0.88, v: 0.64 }, ...Array.from({ length: 9 }, (_, i) => ({ u: 0.5 + 0.38 * Math.cos((Math.PI * (i + 1)) / 10), v: 0.64 + 0.28 * Math.sin((Math.PI * (i + 1)) / 10) }))]] };
  // Ground floor.
  bim(d, 'slab', { thickness: 250 }, { outer: rectPts(-300, -300, 12300, 10300).map(({ x, y }) => ({ x: x + 300, y: y + 300 })), holes: [] }, { x: -300, y: -300 }, on('L1', { name: '기초 슬래브', layer: 'slab', material: M.concrete }));
  bim(d, 'wall', { width: 382, height: 3000, align: 0 }, { path: L, closed: true, layers, openings: [win(1200, 2400, 3, 1), door(5200, 1000), win(8500, 2400, 3, 2, 600, 1800), win(13300, 1500), { type: 'custom', at: 21000, width: 1200, height: 1800, sill: 700, swing: 1, hinge: 1, profile: arched }, win(26000, 1800), win(31000, 2000)] }, {}, on('L1', { name: '1층 외벽', layer: 'wall' }));
  bim(d, 'wall', { width: 150, height: 3000, align: 0 }, { path: [{ x: 6000, y: 200 }, { x: 6000, y: 5800 }], openings: [door(2200, 900, -1)] }, {}, on('L1', { name: '1층 내벽 1', layer: 'wall', material: M.block }));
  bim(d, 'wall', { width: 150, height: 3000, align: 0 }, { path: [{ x: 200, y: 6000 }, { x: 5800, y: 6000 }], openings: [{ type: 'opening', at: 2000, width: 1600, height: 2100, sill: 0, swing: 1, hinge: 1 }] }, {}, on('L1', { name: '1층 내벽 2', layer: 'wall', material: M.block }));
  bim(d, 'stairs', { length: 4000, width: 1000, height: 3000, steps: 16, thickness: 160 }, {}, { x: 4800, y: 1400, rz: 90 }, on('L1', { name: '계단', layer: 'stair', material: M.concrete }));
  for (const [name, x0, y0, x1, y1] of [['거실', 200, 200, 5900, 5900], ['주방·식당', 6100, 200, 11800, 5800], ['현관·서재', 200, 6100, 5800, 9800]]) {
    bim(d, 'space', { height: 2700 }, { outer: rectPts(0, 0, x1 - x0, y1 - y0), holes: [] }, { x: x0, y: y0 }, on('L1', { name, layer: 'space' }));
  }
  furniture(d, 'sofa', [2600, 900, 850], { x: 3200, y: 1300, rz: 180 }, '소파'); d.entities.at(-1).level = 'L1';
  furniture(d, 'table', [1800, 900, 740], { x: 8000, y: 2400 }, '식탁'); d.entities.at(-1).level = 'L1';
  furniture(d, 'sink', [3000, 600, 900], { x: 8400, y: 5100 }, '싱크대'); d.entities.at(-1).level = 'L1';
  // Upper floor: its slab (stair well left open), the same layered outline, rooms.
  const floor = bim(d, 'slab', { thickness: 220 }, { outer: L.map((q) => ({ x: q.x, y: q.y })), holes: [rectPts(3700, 1300, 4900, 5500)] }, {}, on('L2', { name: '2층 바닥 슬래브', layer: 'slab', material: M.concrete, z: 3000 }));
  bim(d, 'wall', { width: 382, height: 2800, align: 0 }, { path: L, closed: true, layers, openings: [win(1500, 1800), win(5000, 1500), win(8800, 1800, 2, 2), win(14000, 1500), win(21000, 1200, 1, 2), win(26000, 1800), win(31000, 1600)] }, { z: 3000 }, on('L2', { name: '2층 외벽', layer: 'wall' }));
  bim(d, 'wall', { width: 120, height: 2800, align: 0 }, { path: [{ x: 6000, y: 200 }, { x: 6000, y: 5800 }], openings: [door(2600, 900, -1)] }, { z: 3000 }, on('L2', { name: '2층 내벽', layer: 'wall', material: M.gypsum }));
  for (const [name, x0, y0, x1, y1] of [['침실 1', 200, 200, 5900, 5900], ['침실 2', 6100, 200, 11800, 5800], ['가족실', 200, 6100, 5800, 9800]]) {
    bim(d, 'space', { height: 2500 }, { outer: rectPts(0, 0, x1 - x0, y1 - y0), holes: [] }, { x: x0, y: y0, z: 3000 }, on('L2', { name, layer: 'space' }));
  }
  furniture(d, 'bed', [2100, 1600, 900], { x: 2000, y: 3900, rz: -90 }, '침대'); Object.assign(d.entities.at(-1), { level: 'L2', z: 3000 });
  furniture(d, 'bed', [2000, 1400, 900], { x: 8500, y: 3700, rz: -90 }, '침대'); Object.assign(d.entities.at(-1), { level: 'L2', z: 3000 });
  // Rebar: the upper floor slab's bottom mesh.
  d.entities.push(normalizeEntity({ type: 'solid', kind: 'rebar', name: '2층 슬래브 배근', layer: 'structure', level: 'L2', params: { diameter: 13, spacing: 250, cover: 30, bars: 2, stirrup: 10 }, x: 0, y: 0, z: 3000, shape: { host: { kind: 'slab', params: { thickness: 220 }, outer: floor.shape.outer, holes: floor.shape.holes } }, material: M.steel }));
  // Hip roof over the L, the two short ends gabled (FreeCAD: an angle per edge, 90° = gable).
  bim(d, 'roof', { roofType: 1, slope: 30, overhang: 500, thickness: 200 }, { outer: L.map((q) => ({ x: q.x, y: q.y })), holes: [], slopes: [null, 90, null, null, 90, null] }, { z: 5800 }, on('L2', { name: 'L자 지붕 (박공 끝)', layer: 'roof', material: M.tile }));
  // Carport east of the house: steel posts, a Pratt truss each side, a corrugated sheet roof.
  for (const [x, y] of [[12800, 300], [17800, 300], [12800, 5700], [17800, 5700]]) bim(d, 'column', { width: 150, depth: 150, height: 2400, profile: 2 }, {}, { x, y }, on('L1', { name: '카포트 기둥', layer: 'structure', material: M.steel }));
  for (const y of [300, 5700]) bim(d, 'truss', { trussType: 0, height: 600, panels: 6, chord: 80, web: 50 }, { path: [{ x: 0, y: 0 }, { x: 5000, y: 0 }] }, { x: 12800, y, z: 2400 }, on('L1', { name: '카포트 트러스', layer: 'structure', material: M.steel }));
  bim(d, 'panel', { thickness: 1, waveLength: 150, waveHeight: 25 }, { outer: rectPts(0, 0, 5600, 6000), holes: [] }, { x: 12500, y: 0, z: 3030 }, on('L1', { name: '골판 지붕', layer: 'roof', material: M.steel }));
  // A gas pipe along the south and east walls, 400 mm up.
  bim(d, 'pipe', { diameter: 60, wall: 4 }, { path: [{ x: 0, y: 0 }, { x: 11500, y: 0 }, { x: 11500, y: 5000 }], closed: false }, { x: 300, y: -350, z: 400 }, on('L1', { name: '가스관', layer: 'structure', material: M.steel }));
  bim(d, 'axis', { countX: 3, spacingX: 6000, countY: 3, spacingY: 5000, extension: 1500, bubble: 400 }, { xs: [0, 6000, 12000], ys: [0, 6000, 10000] }, {}, { name: '통심선', layer: 'grid' });
  text(d, 0, -3000, '2층 주택 — 층(1층·2층), 다층 벽(벽돌·단열·콘크리트·석고), L자 지붕(변별 경사), 철근, 카포트 트러스·골판, 가스관', 250, { bold: true });
  text(d, 0, -3500, '왼쪽 패널의 건물 트리에서 평면도 층을 바꾸고, 3D 보기에서 두 층을 함께 봅니다', 220);
  return d;
}

// ───────────────────────── mechanical: a two-stage gear reducer

export function gearReducer() {
  const d = createDrawing({ title: '2단 기어 감속기 (i = 9.0)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-10', material: 'FC250 · SCM440', company: 'MyCAD samples' });
  // Shafts along y at x = 0 (input), 72 (intermediate), 174 (output); centre height z = 90.
  const zc = 90;
  const shafts = [0, 72, 174];
  // Housing: outer shell with feet, hollowed, bored for the bearings, with mounting holes.
  const outer = raw('box', { length: 360, width: 150, height: 170 }, { x: -70, y: -75, z: 10 });
  const feet = raw('box', { length: 400, width: 200, height: 20 }, { x: -90, y: -100, z: 0 });
  const inner = raw('box', { length: 340, width: 130, height: 170 }, { x: -60, y: -65, z: 20 });
  const bores = shafts.map((x, i) => raw('cylinder', { radius: [20, 26, 32][i], height: 200 }, { x, y: 100, z: zc, rx: 90 }));
  const holes = [[-75, -85], [295, -85], [-75, 85], [295, 85]].map(([x, y]) => raw('cylinder', { radius: 7, height: 40 }, { x, y, z: -10 }));
  add(d, 'solid', { ...bool('cut', [bool('union', [outer, feet]), inner, ...bores, ...holes]), name: 'Housing', color: '#9aa4b1' });
  // Gears (padded from the gear outlines, stood up so their axes run along y).
  const gear = (name, teeth, module, bore, width, x, y) => add(d, 'solid', { ...padPart('gear', { module, teeth, bore, keyway: false, pitchCircle: false }, width, { x, y, z: zc, rx: 90 }), name });
  gear('Pinion1 z18 m2', 18, 2, 14, 22, 0, -10);
  gear('Gear1 z54 m2', 54, 2, 30, 20, 72, -12);
  gear('Pinion2 z17 m3', 17, 3, 30, 30, 72, 42);
  gear('Gear2 z51 m3', 51, 3, 40, 28, 174, 40);
  // Shafts (stepped: cylinders), bearings (tubes) in the walls, end caps with bolts.
  shafts.forEach((x, i) => {
    const r = [7, 15, 20][i];
    add(d, 'solid', { ...raw('cylinder', { radius: r, height: i === 0 ? 260 : i === 2 ? 240 : 150 }, { x, y: i === 0 ? 150 : i === 2 ? 75 : 75, z: zc, rx: 90 }), name: `Shaft${i + 1}` });
    for (const y of [-65, 75]) add(d, 'solid', { ...raw('tube', { outer: [20, 26, 32][i], inner: r, height: 10 }, { x, y, z: zc, rx: 90 }), name: `Bearing${i + 1}${y < 0 ? 'F' : 'B'}` });
    for (const y of [-75, 85]) {
      add(d, 'solid', { ...raw('tube', { outer: [20, 26, 32][i] + 14, inner: r + 1, height: 10 }, { x, y, z: zc, rx: 90 }), name: `Cap${i + 1}${y < 0 ? 'F' : 'B'}` });
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        const rr = [20, 26, 32][i] + 8;
        add(d, 'solid', { ...raw('prism', { sides: 6, radius: 3.5, height: 4 }, { x: x + rr * Math.cos(a), y: y < 0 ? y - 10 : y + 4, z: zc + rr * Math.sin(a), rx: 90 }), name: `Bolt${i + 1}${y < 0 ? 'F' : 'B'}${k + 1}` });
      }
    }
  });
  // The lid is off (beside the housing) so the gear train can be seen; oil level plug and breather.
  add(d, 'solid', { ...bool('cut', [raw('box', { length: 360, width: 150, height: 12 }, { x: -70, y: 140, z: 0 }), raw('box', { length: 90, width: 70, height: 20 }, { x: 60, y: 180, z: -4 })]), name: 'Lid', color: '#9aa4b1' });
  add(d, 'solid', { ...raw('box', { length: 110, width: 90, height: 6 }, { x: 50, y: 170, z: 12 }), name: 'InspectionCover', color: '#c9cdd4' });
  add(d, 'solid', { ...raw('cylinder', { radius: 8, height: 18 }, { x: 105, y: 215, z: 18 }), name: 'Breather', color: '#40454f' });
  add(d, 'solid', { ...raw('cylinder', { radius: 9, height: 12 }, { x: 290, y: -75, z: 60, rx: 90 }), name: 'OilPlug', color: '#e5484d' });
  add(d, 'text', { x: -90, y: -140, text: '2단 감속기 (뚜껑 분리): z18/54 (m2) × z17/51 (m3) → 감속비 3 × 3 = 9.0 · 축간 72 / 102 mm', size: 5, layer: 'text' });
  return d;
}

// ───────────────────────── mechanical: a detailed shaft drawing

export function shaftDetail() {
  const d = createDrawing({ title: '출력축 상세도 (S 1:1)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-021', material: 'SCM440 (QT)', company: 'MyCAD samples', scale: '1:1' });
  const steps = [[0, 12, 'M24×2'], [30, 15, 'Ø30 k6'], [55, 20, 'Ø40 h6'], [125, 25, 'Ø50'], [140, 20, 'Ø40 h6'], [185, 15, 'Ø30 k6'], [210, 0]];
  // Outline: upper and lower halves, chamfers at each step.
  const top = [];
  for (let i = 0; i + 1 < steps.length; i++) {
    const [x0, r] = steps[i]; const [x1] = steps[i + 1];
    if (i) top.push({ x: x0, y: r });
    else top.push({ x: x0, y: r - 1.5 }, { x: x0 + 1.5, y: r });
    top.push({ x: x1 - 1, y: r }, { x: x1, y: r - 1 });
  }
  const outline = [...top, ...top.slice().reverse().map((p) => ({ x: p.x, y: -p.y }))];
  add(d, 'polyline', { points: outline, closed: true, lineWidth: 0.5 });
  for (let i = 1; i + 1 < steps.length; i++) line(d, steps[i][0], -steps[i][1], steps[i][0], steps[i][1]);
  // Thread (thin lines at the root), keyways (on Ø40 and Ø30), centre line, centre holes.
  line(d, 0, 10.9, 28, 10.9, { lineWidth: 0.18 }); line(d, 0, -10.9, 28, -10.9, { lineWidth: 0.18 });
  add(d, 'rect', { x: 62, y: -6, width: 56, height: 12, radius: 6 });
  add(d, 'rect', { x: 189, y: -4, width: 18, height: 8, radius: 4 });
  line(d, -8, 0, 218, 0, { lineType: 'center', layer: 'center' });
  add(d, 'polyline', { points: [{ x: 0, y: 3 }, { x: 7, y: 3 }, { x: 9, y: 0 }, { x: 7, y: -3 }, { x: 0, y: -3 }], closed: false, lineType: 'hidden', layer: 'hidden' });
  // Section A–A through the keyway on Ø40: circle, keyway notch, hatched.
  const sx = 280; const sy = 0;
  const ring = Array.from({ length: 72 }, (_, k) => ({ x: sx + 20 * Math.cos((k * Math.PI) / 36), y: sy + 20 * Math.sin((k * Math.PI) / 36) }));
  const notch = ring.filter((p) => !(p.y - sy > 13 && Math.abs(p.x - sx) < 6));
  const k = notch.findIndex((p, idx) => idx && Math.abs(Math.atan2(p.y - sy, p.x - sx) - Math.atan2(notch[idx - 1].y - sy, notch[idx - 1].x - sx)) > 0.3);
  const section = k > 0 ? [...notch.slice(0, k), { x: sx + 6, y: sy + 15 }, { x: sx - 6, y: sy + 15 }, ...notch.slice(k)] : notch;
  add(d, 'polyline', { points: section, closed: true, lineWidth: 0.5 });
  add(d, 'hatch', { loops: [section], pattern: 'ansi31', scale: 1.2, angle: 0 });
  line(d, sx - 26, sy, sx + 26, sy, { lineType: 'center', layer: 'center' }); line(d, sx, sy - 26, sx, sy + 26, { lineType: 'center', layer: 'center' });
  text(d, sx - 8, sy - 34, 'A–A', 5, { bold: true });
  line(d, 90, -28, 90, -24, { lineWidth: 0.5 }); line(d, 90, 24, 90, 28, { lineWidth: 0.5 });
  text(d, 92, -32, 'A', 4); text(d, 92, 29, 'A', 4);
  // Dimensions: lengths, diameters with fits, keyway, section.
  const lengths = [[0, 30], [30, 55], [55, 125], [125, 140], [140, 185], [185, 210]];
  lengths.forEach(([a, b]) => dim(d, 'horizontal', a, -25, b, -25, (a + b) / 2, -38, 3.5, { precision: 0 }));
  dim(d, 'horizontal', 0, -25, 210, -25, 105, -50, 3.5);
  [[15, 12, 'M24×2-6g'], [42, 15, 'Ø<> k6'], [90, 20, 'Ø<> h6'], [132, 25, 'Ø<>'], [162, 20, 'Ø<> h6'], [197, 15, 'Ø<> k6']].forEach(([x, r, t], i) => dim(d, 'vertical', x, -r, x, r, x + (i % 2 ? 6 : -6), 40 + (i % 2) * 8, 3.5, { text: t }));
  dim(d, 'horizontal', 62, 6, 118, 6, 90, 32, 3.5, { text: '<> (키홈 12 P9)' });
  dim(d, 'horizontal', sx - 6, sy + 15, sx + 6, sy + 15, sx, sy + 28, 3.5, { text: '12 P9' });
  dim(d, 'vertical', sx + 20, sy - 20, sx + 20, sy + 15, sx + 32, sy, 3.5, { text: '35 0/−0.2' });
  // Surface finish marks, geometric tolerance note, chamfer note.
  for (const [x, y, ra] of [[90, 21, '0.8'], [162, 21, '0.8'], [42, 16, '1.6'], [132, 26, '3.2']]) {
    add(d, 'polyline', { points: [{ x: x - 3, y: y + 5 }, { x, y }, { x: x + 6, y: y + 10 }], closed: false });
    text(d, x + 3, y + 6, `Ra ${ra}`, 2.5);
  }
  add(d, 'leader', { points: [{ x: 210, y: 14 }, { x: 222, y: 30 }, { x: 240, y: 30 }], text: 'C1 (모서리 모두)', size: 3 });
  add(d, 'leader', { points: [{ x: 4, y: 3 }, { x: -10, y: 30 }, { x: -30, y: 30 }], text: '센터 구멍 A3.15', size: 3 });
  const notes = ['주기', '1. 열처리: 조질 (QT) 28~32 HRC', '2. 베어링 자리 (Ø40 h6) 동심도 0.01 / 기준 A–B', '3. 지시 없는 모따기 C0.5, 지시 없는 공차 KS B ISO 2768-m', '4. 키홈 12 P9 × 5 (KS B 1311)'];
  notes.forEach((n, i) => text(d, 0, -70 - i * 6, n, i ? 3 : 3.5, { bold: !i }));
  // Title block.
  const tb = [150, -110, 330, -70];
  poly(d, rectPts(...tb), { lineWidth: 0.5 });
  for (const y of [-100, -90, -80]) line(d, tb[0], y, tb[2], y);
  line(d, 200, -110, 200, -70); line(d, 260, -110, 260, -70);
  const cells = [['도명', '출력축'], ['도번', 'MC-021'], ['재질', 'SCM440'], ['척도', '1:1']];
  cells.forEach(([k2, v], i) => { text(d, 152, -77 - i * 10, k2, 3); text(d, 202, -77 - i * 10, v, 3); });
  text(d, 262, -77, 'MyCAD samples', 3); text(d, 262, -87, 'SHKWON', 3); text(d, 262, -97, '3각법', 3);
  return d;
}

// ───────────────────────── mechanical: a machine vise

export function machineVise() {
  const d = createDrawing({ title: '머신 바이스 (조 폭 125)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'MC-3D-12', material: 'FC300 · S45C', company: 'MyCAD samples' });
  const base = bool('cut', [
    bool('union', [raw('box', { length: 300, width: 140, height: 40 }, { x: 0, y: 0, z: 0 }), raw('box', { length: 360, width: 60, height: 18 }, { x: -30, y: 40, z: 0 })]),
    raw('box', { length: 220, width: 40, height: 30 }, { x: 60, y: 50, z: 16 }),
    ...[[-15, 70], [345, 70]].map(([x, y]) => raw('cylinder', { radius: 8, height: 40 }, { x, y, z: -10 })),
  ]);
  add(d, 'solid', { ...base, name: 'Base', color: '#5d7fa3' });
  add(d, 'solid', { ...bool('cut', [raw('box', { length: 60, width: 140, height: 80 }, { x: 0, y: 0, z: 40 }), raw('cylinder', { radius: 11, height: 80 }, { x: -10, y: 70, z: 70, ry: 90 })]), name: 'FixedJaw', color: '#5d7fa3' });
  add(d, 'solid', { ...raw('box', { length: 70, width: 140, height: 60 }, { x: 170, y: 0, z: 40 }), name: 'MovingJaw', color: '#7b9cc1' });
  add(d, 'solid', { ...raw('box', { length: 40, width: 36, height: 30 }, { x: 185, y: 52, z: 18 }), name: 'Nut', color: '#d9822b' });
  for (const [x, name] of [[60, 'JawPlateFixed'], [160, 'JawPlateMoving']]) {
    add(d, 'solid', { ...raw('box', { length: 10, width: 125, height: 36 }, { x, y: 7.5, z: 82 }), name, color: '#c9cdd4' });
    for (const y of [35, 105]) add(d, 'solid', { ...raw('cylinder', { radius: 5, height: 4 }, { x: x === 60 ? x + 10 : x - 4, y, z: 100, ry: 90 }), name: `${name}Screw${y}`, color: '#40454f' });
  }
  add(d, 'solid', { ...raw('cylinder', { radius: 10, height: 300 }, { x: -20, y: 70, z: 70, ry: 90 }), name: 'LeadScrew', color: '#c9cdd4' });
  add(d, 'solid', { ...raw('helix', { radius: 10.5, pitch: 6, turns: 25, wire: 1.4 }, { x: 70, y: 70, z: 70, ry: 90 }), name: 'Thread', color: '#a0a6b0' });
  add(d, 'solid', { ...raw('cylinder', { radius: 14, height: 30 }, { x: -50, y: 70, z: 70, ry: 90 }), name: 'Hub', color: '#40454f' });
  add(d, 'solid', { ...raw('cylinder', { radius: 6, height: 220 }, { x: -40, y: -40, z: 70, rx: -90 }), name: 'Handle', color: '#c9cdd4' });
  for (const [y, name] of [[-45, 'KnobA'], [185, 'KnobB']]) add(d, 'solid', { ...raw('sphere', { radius: 11 }, { x: -40, y, z: 70 }), name, color: '#e5484d' });
  // A workpiece clamped between the jaws, on two parallels.
  for (const [y, name] of [[20, 'ParallelA'], [110, 'ParallelB']]) add(d, 'solid', { ...raw('box', { length: 86, width: 10, height: 22 }, { x: 72, y, z: 40 }), name, color: '#40454f' });
  add(d, 'solid', { ...raw('box', { length: 86, width: 110, height: 45 }, { x: 72, y: 15, z: 62 }), name: 'Workpiece', color: '#e8a53a' });
  add(d, 'text', { x: 0, y: -60, text: '머신 바이스: 조 폭 125 · 최대 열림 100 · 이송 나사 Tr20×6 (핸들 1회전 6 mm)', size: 6, layer: 'text' });
  return d;
}

// ───────────────────────── structure: a steel frame

export function steelFrame() {
  const d = createDrawing({ title: '철골 구조 (3 × 2 경간)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'S-101', material: 'SS275', company: 'MyCAD samples' });
  const bx = 6000; const by = 5000; const h = 4000; const s = 30; // section scale: I-beam size 200 → 6000 mm frame (1:1)
  const ibeam = (place, length) => ({ type: 'solid', ...featureFrom('pad', { shapes: partShapes('iBeam', { size: 200 }).map((sh) => ({ outer: sh.outer.map((p) => ({ x: p.x * s / 30 * 1.5, y: p.y * s / 30 * 1.5 })), holes: [] })) }, { height: length }), ...place });
  let n = 0;
  for (let i = 0; i <= 3; i++) for (let j = 0; j <= 2; j++) {
    n++;
    add(d, 'solid', { ...ibeam({ x: i * bx, y: j * by, z: 20 }, h - 20), name: `Column${n}`, color: '#3a6cf0' });
    add(d, 'solid', { ...raw('box', { length: 500, width: 500, height: 20 }, { x: i * bx - 250, y: j * by - 250, z: 0 }), name: `BasePlate${n}`, color: '#40454f' });
  }
  let b = 0;
  for (let j = 0; j <= 2; j++) for (let i = 0; i < 3; i++) add(d, 'solid', { ...ibeam({ x: i * bx, y: j * by, z: h + 150, ry: 90 }, bx), name: `BeamX${++b}`, color: '#2fa36b' });
  for (let i = 0; i <= 3; i++) for (let j = 0; j < 2; j++) add(d, 'solid', { ...ibeam({ x: i * bx, y: j * by, z: h + 150, rx: -90 }, by), name: `BeamY${++b}`, color: '#2fa36b' });
  // Bracing in the end bays (rods) and purlins on top.
  const brace = (x0, y0, x1, y1, name) => {
    const len = Math.hypot(x1 - x0, h);
    const angle = (Math.atan2(h, x1 - x0) * 180) / Math.PI;
    add(d, 'solid', { ...raw('cylinder', { radius: 20, height: len }, { x: x0, y: y0, z: 0, ry: 90 - angle }), name, color: '#d9822b' });
    void y1;
  };
  brace(0, 0, bx, 0, 'BraceA1'); brace(2 * bx, 2 * by, 3 * bx, 2 * by, 'BraceC3');
  for (let k = 0; k <= 8; k++) add(d, 'solid', { ...raw('box', { length: 3 * bx, width: 100, height: 150 }, { x: 0, y: k * (2 * by) / 8 - 50, z: h + 300 }), name: `Purlin${k + 1}`, color: '#9aa4b1' });
  add(d, 'text', { x: 0, y: -1500, text: '철골 골조: 기둥·보 H-200 (SS275) · 경간 6 m × 3, 5 m × 2 · 높이 4 m · 가새 Ø40 · 중도리 150 × 100', size: 250, layer: 'text' });
  return d;
}
