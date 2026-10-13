// Larger samples (scripts/create-samples.mjs): architecture in the way of
// FreeCAD's BIM workbench (a house plan, the same house in 3D with its
// elevations, an office floor), and bigger mechanical and structural designs
// (a two-stage gear reducer, a detailed shaft drawing, a machine vise, a steel
// frame). Building drawings are 1:1 in mm and printed at 1:100.
import { addEntity, createDrawing } from '../src/domain/drawing.js';
import { normalizeEntity } from '../src/domain/entities.js';
import { featureFrom } from '../src/domain/solids.js';
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

// ───────────────────────── architecture: a house

/** The house: walls (centre lines, thickness), their openings, rooms. Shared by the plan and the 3D model. */
const HOUSE = {
  walls: [
    // [x1, y1, x2, y2, thickness, openings: [offset from start, width, kind, swing side (+1/−1)]]
    [100, 100, 11900, 100, 200, [[1400, 2000, 'window'], [5900, 1000, 'door', 1], [9100, 1600, 'window']]],
    [100, 8900, 11900, 8900, 200, [[1400, 1800, 'window'], [5900, 800, 'window'], [9100, 1600, 'window']]],
    [100, 100, 100, 8900, 200, [[1900, 1800, 'window']]],
    [11900, 100, 11900, 8900, 200, [[1400, 1200, 'window'], [6100, 1200, 'window']]],
    [5000, 100, 5000, 8900, 120, [[2400, 900, 'door', -1]]],
    [8000, 100, 8000, 8900, 120, [[1900, 900, 'door', 1], [4900, 900, 'door', 1]]],
    [8000, 4500, 11900, 4500, 120, []],
    [5000, 6000, 8000, 6000, 120, [[1200, 800, 'door', 1]]],
    [100, 5500, 5000, 5500, 120, [[1900, 1500, 'opening']]],
  ],
  rooms: [
    { name: ['거실', 'Living'], x0: 100, y0: 100, x1: 5000, y1: 5500, label: [1200, 3900] },
    { name: ['주방·식당', 'Kitchen / dining'], x0: 100, y0: 5500, x1: 5000, y1: 8900, label: [3500, 7100] },
    { name: ['현관·복도', 'Hall'], x0: 5000, y0: 100, x1: 8000, y1: 6000, label: [5250, 5400] },
    { name: ['욕실', 'Bath'], x0: 5000, y0: 6000, x1: 8000, y1: 8900, label: [6300, 7300] },
    { name: ['침실 1', 'Bedroom 1'], x0: 8000, y0: 100, x1: 11900, y1: 4500, label: [10750, 1500] },
    { name: ['침실 2', 'Bedroom 2'], x0: 8000, y0: 4500, x1: 11900, y1: 8900, label: [10650, 8100] },
  ],
};

/** Wall pieces between the openings: [x0, y0, x1, y1] rectangles. */
function wallPieces([x1, y1, x2, y2, t, openings]) {
  const horizontal = y1 === y2;
  const length = horizontal ? x2 - x1 : y2 - y1;
  // Interior walls stop at the faces of the walls they meet.
  const pieces = [];
  let at = 0;
  for (const [offset, width] of [...openings].sort((a, b) => a[0] - b[0])) {
    if (offset > at) pieces.push([at, offset]);
    at = offset + width;
  }
  if (at < length) pieces.push([at, length]);
  return pieces.map(([a, b]) => (horizontal ? [x1 + a - (a === 0 ? t / 2 : 0), y1 - t / 2, x1 + b + (b === length ? t / 2 : 0), y1 + t / 2] : [x1 - t / 2, y1 + a - (a === 0 ? t / 2 : 0), x1 + t / 2, y1 + b + (b === length ? t / 2 : 0)]));
}

export function housePlan() {
  const d = createDrawing({ title: '단독주택 1층 평면도 (S 1:100)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-101', material: '철근콘크리트 · 경량벽', company: 'MyCAD samples', scale: '1:100' });
  layer(d, 'wall', '벽체', '#1d2433', 'continuous', 0.5);
  layer(d, 'opening', '창호', '#3a6cf0', 'continuous', 0.25);
  layer(d, 'furniture', '가구', '#7a8394', 'continuous', 0.18);
  layer(d, 'stair', '계단', '#1d2433', 'continuous', 0.25);
  layer(d, 'grid', '통심선', '#e5484d', 'center', 0.18);
  const T = 250; // text height, mm in the drawing (2.5 mm on paper at 1:100)
  // Walls: pieces hatched, openings drawn as doors and windows.
  for (const wall of HOUSE.walls) {
    const [x1, y1, x2, y2, t, openings] = wall;
    const horizontal = y1 === y2;
    for (const [a, b, c, e] of wallPieces(wall)) {
      const pts = rectPts(a, b, c, e);
      poly(d, pts, { layer: 'wall' });
      add(d, 'hatch', { loops: [pts], pattern: t > 150 ? 'ansi31' : 'solid', scale: 16, angle: 0, layer: 'wall', color: t > 150 ? null : '#9aa4b1' });
    }
    for (const [offset, width, kind, side = 1] of openings) {
      const s = horizontal ? { x: x1 + offset, y: y1 } : { x: x1, y: y1 + offset };
      const along = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
      const normal = horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 };
      const at = (u, v) => ({ x: s.x + along.x * u + normal.x * v, y: s.y + along.y * u + normal.y * v });
      // Jambs.
      for (const u of [0, width]) { const p = at(u, -t / 2); const q = at(u, t / 2); line(d, p.x, p.y, q.x, q.y, { layer: 'opening' }); }
      if (kind === 'window') {
        for (const v of [-t / 2, -t / 8, t / 8, t / 2]) { const p = at(0, v); const q = at(width, v); line(d, p.x, p.y, q.x, q.y, { layer: 'opening' }); }
      } else if (kind === 'door') {
        const hinge = at(0, side * t / 2);
        const tip = at(0, side * (t / 2 + width));
        line(d, hinge.x, hinge.y, tip.x, tip.y, { layer: 'opening' });
        const leafAngle = horizontal ? (side > 0 ? 90 : 270) : (side > 0 ? 0 : 180);
        const closedAngle = horizontal ? 0 : 90;
        const [start, end] = horizontal ? (side > 0 ? [0, 90] : [270, 360]) : (side > 0 ? [0, 90] : [90, 180]);
        add(d, 'arc', { cx: hinge.x, cy: hinge.y, r: width, start, end, layer: 'opening', lineType: 'dashed' });
        void leafAngle; void closedAngle;
      }
    }
  }
  // Stairs (in the hall, going up towards the bedrooms): 14 treads of 250.
  const sx0 = 6700; const sx1 = 7800; const sy0 = 1500;
  poly(d, rectPts(sx0, sy0, sx1, sy0 + 14 * 250), { layer: 'stair' });
  for (let i = 1; i < 14; i++) line(d, sx0, sy0 + i * 250, sx1, sy0 + i * 250, { layer: 'stair' });
  add(d, 'polyline', { points: [{ x: (sx0 + sx1) / 2, y: sy0 + 150 }, { x: (sx0 + sx1) / 2, y: sy0 + 14 * 250 - 300 }], closed: false, layer: 'stair' });
  add(d, 'polyline', { points: [{ x: (sx0 + sx1) / 2 - 150, y: sy0 + 14 * 250 - 550 }, { x: (sx0 + sx1) / 2, y: sy0 + 14 * 250 - 300 }, { x: (sx0 + sx1) / 2 + 150, y: sy0 + 14 * 250 - 550 }], closed: false, layer: 'stair' });
  line(d, sx0 - 100, sy0 + 2300, sx1 + 100, sy0 + 2700, { layer: 'stair', lineType: 'dashed' });
  text(d, (sx0 + sx1) / 2 - 150, sy0 - 350, 'UP', T);
  // Furniture.
  const f = { layer: 'furniture' };
  poly(d, rectPts(600, 600, 3400, 1500), f); poly(d, rectPts(600, 600, 3400, 850), f); poly(d, rectPts(600, 600, 850, 1500), f); poly(d, rectPts(3150, 600, 3400, 1500), f);
  poly(d, rectPts(1300, 2000, 2700, 2700), f);
  add(d, 'circle', { cx: 4200, cy: 1200, r: 350, ...f });
  poly(d, rectPts(900, 4950, 1900, 5350), f);
  poly(d, rectPts(300, 8150, 4700, 8750), f);
  add(d, 'ellipse', { cx: 1500, cy: 8450, rx: 300, ry: 200, ...f });
  for (const [x, y] of [[3300, 8350], [3700, 8350], [3300, 8600], [3700, 8600]]) add(d, 'circle', { cx: x, cy: y, r: 110, ...f });
  poly(d, rectPts(1500, 6400, 3300, 7400), f);
  for (const x of [1700, 2400, 3000]) { poly(d, rectPts(x - 200, 6000, x + 200, 6350), f); poly(d, rectPts(x - 200, 7450, x + 200, 7800), f); }
  poly(d, rectPts(9000, 1000, 10600, 3100), f); poly(d, rectPts(9100, 2650, 9750, 3000), f); poly(d, rectPts(9850, 2650, 10500, 3000), f); line(d, 9000, 2300, 10600, 2300, f);
  poly(d, rectPts(8500, 2700, 8900, 3100), f); poly(d, rectPts(10700, 2700, 11100, 3100), f);
  poly(d, rectPts(8200, 3800, 10200, 4400), f); line(d, 8200, 3800, 10200, 4400, f); line(d, 8200, 4400, 10200, 3800, f);
  poly(d, rectPts(9000, 6200, 10400, 8200), f); poly(d, rectPts(9150, 7750, 10250, 8100), f);
  poly(d, rectPts(10800, 5000, 11700, 6400), f);
  poly(d, rectPts(5200, 8000, 6900, 8700), f); add(d, 'ellipse', { cx: 6050, cy: 8350, rx: 700, ry: 230, ...f });
  poly(d, rectPts(7300, 8500, 7800, 8750), f); add(d, 'ellipse', { cx: 7550, cy: 8230, rx: 200, ry: 280, ...f });
  poly(d, rectPts(5200, 6300, 5800, 6800), f); add(d, 'ellipse', { cx: 5500, cy: 6550, rx: 200, ry: 150, ...f });
  // Room names and areas (net, between the wall faces).
  for (const room of HOUSE.rooms) {
    const area = ((room.x1 - room.x0 - 160) * (room.y1 - room.y0 - 160)) / 1e6;
    const [lx, ly] = room.label;
    text(d, lx, ly + 100, room.name[0], T * 1.4, { bold: true });
    text(d, lx, ly - 300, `${area.toFixed(1)} m²`, T);
  }
  // Grid lines with their bubbles: 1–4 along x, A–C along y.
  const xs = [100, 5000, 8000, 11900]; const ys = [100, 4500, 8900];
  xs.forEach((x, i) => { line(d, x, -1600, x, 10200, { layer: 'grid' }); add(d, 'circle', { cx: x, cy: -2000, r: 400, layer: 'grid', lineType: 'continuous' }); text(d, x - 90, -2130, String(i + 1), T * 1.2, { layer: 'grid' }); });
  ys.forEach((y, i) => { line(d, -1600, y, 13200, y, { layer: 'grid' }); add(d, 'circle', { cx: -2000, cy: y, r: 400, layer: 'grid', lineType: 'continuous' }); text(d, -2100, y - 130, 'ABC'[i], T * 1.2, { layer: 'grid' }); });
  // Dimension chains: grid spacings and overall, outside the walls.
  for (let i = 0; i + 1 < xs.length; i++) dim(d, 'horizontal', xs[i], 9000, xs[i + 1], 9000, (xs[i] + xs[i + 1]) / 2, 9700, T);
  dim(d, 'horizontal', 0, 9000, 12000, 9000, 6000, 10600, T);
  for (let i = 0; i + 1 < ys.length; i++) dim(d, 'vertical', 0, ys[i], 0, ys[i + 1], -700, (ys[i] + ys[i + 1]) / 2, T);
  dim(d, 'vertical', 0, 0, 0, 9000, -1500, 4500, T);
  // Window and door widths along the front.
  for (const [offset, width] of HOUSE.walls[0][5]) dim(d, 'horizontal', 100 + offset, 0, 100 + offset + width, 0, 100 + offset + width / 2, -700, T * 0.8);
  // North arrow, section mark, title.
  add(d, 'circle', { cx: 14200, cy: 7600, r: 700, layer: 'text' });
  add(d, 'polyline', { points: [{ x: 14200, y: 8300 }, { x: 13900, y: 7100 }, { x: 14200, y: 7350 }, { x: 14500, y: 7100 }], closed: true, layer: 'text' });
  text(d, 14100, 8450, 'N', T * 1.6, { bold: true });
  line(d, 2600, -1200, 2600, 11200, { lineType: 'phantom', layer: 'text' });
  text(d, 2700, 11000, 'A', T * 1.4, { bold: true }); text(d, 2700, -1500, 'A', T * 1.4, { bold: true });
  text(d, 0, -3300, '단독주택 1층 평면도   S = 1:100   (단위 mm)', T * 1.8, { bold: true });
  text(d, 0, -3900, '외벽 200 (빗금) · 내벽 120 (회색) · 창호 파란색 · 통심선 1–4, A–C · 계단 14단 (단높이 ≈ 193)', T);
  return d;
}

/** The same house as a 3D BIM-style model: walls with openings cut, slab, roof, stairs, porch — and its elevations. */
export function house3d() {
  const d = createDrawing({ title: '단독주택 3D 모델 · 입면도', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-201', material: '철근콘크리트', company: 'MyCAD samples', scale: '1:100' });
  const H = 2700;
  const solids = [];
  const push = (data) => { solids.push(data); return data; };
  push({ ...raw('box', { length: 12400, width: 9400, height: 200 }, { x: -200, y: -200, z: -200 }), name: 'Slab' });
  HOUSE.walls.forEach(([x1, y1, x2, y2, t, openings], i) => {
    const horizontal = y1 === y2;
    const length = horizontal ? x2 - x1 : y2 - y1;
    const ext = t > 150 ? t / 2 : -t / 2; // exterior walls run past the corners, interior ones stop at the faces
    const box = horizontal
      ? raw('box', { length: length + 2 * ext, width: t, height: H }, { x: x1 - ext, y: y1 - t / 2, z: 0 })
      : raw('box', { length: t, width: length + 2 * ext, height: H }, { x: x1 - t / 2, y: y1 - ext, z: 0 });
    const cuts = openings.filter(([, , kind]) => kind !== 'opening' || true).map(([offset, width, kind]) => {
      const z0 = kind === 'window' ? 900 : 0;
      const h = kind === 'window' ? 1300 : 2100;
      return horizontal
        ? raw('box', { length: width, width: t + 200, height: h }, { x: x1 + offset, y: y1 - t / 2 - 100, z: z0 })
        : raw('box', { length: t + 200, width, height: h }, { x: x1 - t / 2 - 100, y: y1 + offset, z: z0 });
    });
    push({ ...(cuts.length ? bool('cut', [box, ...cuts]) : box), name: `Wall${i + 1}` });
  });
  // Gable roof: two slabs at 27.5°, ridge along x; gable walls closing the ends.
  const pitch = 27.5;
  const run = 4700 + 300;
  const slope = run / Math.cos((pitch * Math.PI) / 180) + 150;
  push({ ...raw('box', { length: 12600, width: slope, height: 180 }, { x: -300, y: -300, z: H, rx: pitch }), name: 'RoofSouth' });
  push({ ...raw('box', { length: 12600, width: slope, height: 180 }, { x: 12300, y: 9300, z: H, rx: pitch, rz: 180 }), name: 'RoofNorth' });
  const rise = Math.tan((pitch * Math.PI) / 180) * 4500;
  for (const [x, name] of [[0, 'GableWest'], [11800, 'GableEast']]) {
    push({ type: 'solid', kind: 'pad', name, params: { height: 200 }, shape: { shapes: [{ outer: [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 4500, y: rise }], holes: [] }] }, x, y: 0, z: H, rx: 90, rz: 90 });
  }
  // Stairs: 14 steps.
  for (let i = 0; i < 14; i++) push({ ...raw('box', { length: 1100, width: 250, height: (i + 1) * 193 }, { x: 6700, y: 1500 + i * 250, z: 0 }), name: `Step${i + 1}` });
  // Porch: slab, two columns, canopy.
  push({ ...raw('box', { length: 2600, width: 1600, height: 150 }, { x: 5100, y: -1800, z: -150 }), name: 'PorchSlab' });
  for (const [x, name] of [[5300, 'ColumnW'], [7500, 'ColumnE']]) push({ ...raw('cylinder', { radius: 120, height: 2400 }, { x, y: -1600, z: 0 }), name });
  push({ ...raw('box', { length: 2800, width: 1900, height: 150 }, { x: 5000, y: -1900, z: 2400 }), name: 'Canopy' });
  for (const data of solids) add(d, 'solid', data);
  // Elevations and plan of the model to the right (TechDraw-style views).
  const placed = d.entities.filter((e) => e.type === 'solid');
  for (const view of drawingViews(placed, { x0: 15000, y0: 0, gap: 2500, views: { front: true, right: true, top: true, iso: false }, labels: { front: '남측 입면도', right: '동측 입면도', top: '지붕 평면도' }, textHeight: 300 })) add(d, view.type, view);
  text(d, 15000, -2000, '입면도: 3D 모델에서 투영 (숨은선 점선)', 300);
  return d;
}

// ───────────────────────── architecture: an office floor

export function officePlan() {
  const d = createDrawing({ title: '사무소 기준층 평면도 (S 1:200)', author: 'SHKWON' });
  Object.assign(d.sheet, { number: 'A-301', material: '철골철근콘크리트', company: 'MyCAD samples', scale: '1:200' });
  layer(d, 'wall', '벽체', '#1d2433', 'continuous', 0.5);
  layer(d, 'column', '기둥', '#1d2433', 'continuous', 0.5);
  layer(d, 'glass', '커튼월', '#3a6cf0', 'continuous', 0.18);
  layer(d, 'furniture', '가구', '#7a8394', 'continuous', 0.13);
  layer(d, 'grid', '통심선', '#e5484d', 'center', 0.18);
  layer(d, 'opening', '창호', '#3a6cf0', 'continuous', 0.18);
  const T = 400;
  const bay = 8000; const nx = 5; const ny = 3;
  const W = bay * nx; const D = bay * ny;
  // Curtain wall: inner and outer lines, mullions every 1500.
  poly(d, rectPts(-150, -150, W + 150, D + 150), { layer: 'glass' });
  poly(d, rectPts(-50, -50, W + 50, D + 50), { layer: 'glass' });
  for (let x = 1500; x < W; x += 1500) { line(d, x, -150, x, -50, { layer: 'glass' }); line(d, x, D + 50, x, D + 150, { layer: 'glass' }); }
  for (let y = 1500; y < D; y += 1500) { line(d, -150, y, -50, y, { layer: 'glass' }); line(d, W + 50, y, W + 150, y, { layer: 'glass' }); }
  // Columns 700 × 700 on the grid.
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) {
    const pts = rectPts(i * bay - 350, j * bay - 350, i * bay + 350, j * bay + 350);
    poly(d, pts, { layer: 'column' });
    add(d, 'hatch', { loops: [pts], pattern: 'solid', layer: 'column', color: '#4a5263' });
  }
  // Core in the middle bay: two stairs, two lifts, toilets, shaft.
  const cx0 = 2 * bay + 300; const cy0 = bay + 300; const cx1 = 3 * bay - 300; const cy1 = 2 * bay - 300;
  const coreWall = (pts) => { poly(d, pts, { layer: 'wall' }); add(d, 'hatch', { loops: [pts], pattern: 'ansi31', scale: 30, layer: 'wall' }); };
  coreWall(rectPts(cx0, cy0, cx1, cy0 + 250)); coreWall(rectPts(cx0, cy1 - 250, cx1, cy1));
  coreWall(rectPts(cx0, cy0, cx0 + 250, cy1)); coreWall(rectPts(cx1 - 250, cy0, cx1, cy1));
  coreWall(rectPts(cx0 + 2600, cy0, cx0 + 2800, cy1)); coreWall(rectPts(cx1 - 2800, cy0, cx1 - 2600, cy1));
  for (const [x0] of [[cx0 + 250], [cx1 - 2600]]) {
    for (let i = 0; i < 12; i++) line(d, x0 + 100, cy0 + 600 + i * 270, x0 + 1150, cy0 + 600 + i * 270, { layer: 'wall' });
    for (let i = 0; i < 12; i++) line(d, x0 + 1250, cy0 + 600 + i * 270, x0 + 2300, cy0 + 600 + i * 270, { layer: 'wall' });
    line(d, x0 + 1200, cy0 + 500, x0 + 1200, cy0 + 600 + 11 * 270, { layer: 'wall' });
    text(d, x0 + 300, cy1 - 900, '계단', T);
  }
  // Between the stairs (x: cx0+2800 … cx1-2800): two lifts one above the other, toilets at the top.
  const mx = cx0 + 3000;
  for (let k = 0; k < 2; k++) {
    const y = cy0 + 500 + k * 2000;
    const pts = rectPts(mx, y, mx + 1400, y + 1700);
    poly(d, pts, { layer: 'wall' }); line(d, mx, y, mx + 1400, y + 1700, { layer: 'wall' }); line(d, mx + 1400, y, mx, y + 1700, { layer: 'wall' });
    text(d, mx + 380, y + 700, `EV${k + 1}`, T);
  }
  for (let k = 0; k < 2; k++) {
    poly(d, rectPts(mx + k * 750, cy1 - 1500, mx + k * 750 + 650, cy1 - 350), { layer: 'furniture' });
    add(d, 'ellipse', { cx: mx + k * 750 + 325, cy: cy1 - 750, rx: 180, ry: 260, layer: 'furniture' });
  }
  text(d, mx, cy1 - 1950, 'WC', T);
  // Meeting rooms along the north side (bays 1 and 5), with doors.
  for (const [x0, x1, name] of [[300, bay * 1 + 4000, '회의실 A (16인)'], [bay * 4 - 4000, W - 300, '회의실 B (16인)']]) {
    const pts = rectPts(x0, D - 5000, x1, D - 300);
    poly(d, pts, { layer: 'wall' });
    poly(d, rectPts((x0 + x1) / 2 - 2400, D - 3600, (x0 + x1) / 2 + 2400, D - 1700), { layer: 'furniture' });
    for (let k = 0; k < 8; k++) { add(d, 'circle', { cx: (x0 + x1) / 2 - 2100 + k * 600, cy: D - 3900, r: 220, layer: 'furniture' }); add(d, 'circle', { cx: (x0 + x1) / 2 - 2100 + k * 600, cy: D - 1400, r: 220, layer: 'furniture' }); }
    const door = (x0 + x1) / 2 + 2800;
    add(d, 'arc', { cx: door, cy: D - 5000, r: 900, start: 270, end: 360, layer: 'opening', lineType: 'dashed' });
    line(d, door, D - 5000, door, D - 5900, { layer: 'opening' });
    text(d, x0 + 600, D - 900, name, T);
  }
  // Open office: clusters of four desks with chairs.
  const cluster = (x, y) => {
    for (const [dx, dy] of [[0, 0], [1600, 0], [0, 800], [1600, 800]]) poly(d, rectPts(x + dx, y + dy, x + dx + 1600, y + dy + 800), { layer: 'furniture' });
    for (const [dx, dy] of [[800, -350], [2400, -350], [800, 1950], [2400, 1950]]) add(d, 'circle', { cx: x + dx, cy: y + dy, r: 280, layer: 'furniture' });
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const x = 1200 + i * 7800; const y = 1500 + j * 4200;
    if (x > cx0 - 3500 && x < cx1 + 300 && y > cy0 - 2500) continue;
    cluster(x, y);
    cluster(x + 3600, y);
  }
  // Grid and dimensions.
  for (let i = 0; i <= nx; i++) { line(d, i * bay, -3000, i * bay, D + 3000, { layer: 'grid' }); add(d, 'circle', { cx: i * bay, cy: -3600, r: 600, layer: 'grid', lineType: 'continuous' }); text(d, i * bay - 150, -3800, String(i + 1), T * 1.2, { layer: 'grid' }); }
  for (let j = 0; j <= ny; j++) { line(d, -3000, j * bay, W + 3000, j * bay, { layer: 'grid' }); add(d, 'circle', { cx: -3600, cy: j * bay, r: 600, layer: 'grid', lineType: 'continuous' }); text(d, -3780, j * bay - 200, 'ABCD'[j], T * 1.2, { layer: 'grid' }); }
  for (let i = 0; i < nx; i++) dim(d, 'horizontal', i * bay, D, (i + 1) * bay, D, i * bay + bay / 2, D + 1600, T);
  dim(d, 'horizontal', 0, D, W, D, W / 2, D + 2600, T);
  for (let j = 0; j < ny; j++) dim(d, 'vertical', 0, j * bay, 0, (j + 1) * bay, -1600, j * bay + bay / 2, T);
  dim(d, 'vertical', 0, 0, 0, D, -2600, D / 2, T);
  text(d, 0, -5600, `사무소 기준층 평면도   S = 1:200   바닥면적 ${(W * D / 1e6).toFixed(0)} m² · 기둥 ${(nx + 1) * (ny + 1)}개 · 책상 ${0} 석`.replace(' · 책상 0 석', ''), T * 1.6, { bold: true });
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
