import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convexOverlap, DIM_BAND_MM, dimensionChains, insidePolygon, mergePositions, placeLabels, planData, wallCorners, wallsBox,
} from '../../src/print/dimensions.js';
import { defaultPrintSetup, dimensionArea, frameForSheet, layoutSheets, MAX_PRINT_FOV, normalizePrintSetup, sheetGeometry } from '../../src/print/layout.js';
import { dimText, fitLine, fitText, planOverlay, planToPaper, sheetSvg } from '../../src/print/sheet.js';

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const W = (a, b, t = 0.2) => ({ a, b, t });

// A 9 × 6 m flat: outer walls, one wall across at x = 4 (full height) and one at x = 6.5 only in the lower half.
const FLAT = [
  W([0, 0], [9, 0]), W([9, 0], [9, 6]), W([9, 6], [0, 6]), W([0, 6], [0, 0]),
  W([4, 0], [4, 6], 0.1), W([6.5, 3], [6.5, 6], 0.1), W([4, 3], [9, 3], 0.1),
];

test('dimensions: wall extents on centre lines and outer faces', () => {
  const box = wallsBox(FLAT);
  assert.deepEqual([box.minX, box.maxX, box.minZ, box.maxZ], [0, 9, 0, 6]);
  assert.ok(near(box.outer.minX, -0.1) && near(box.outer.maxZ, 6.1));
  assert.equal(wallsBox([]), null);
});

test('dimensions: close positions merge, the ends stay exact', () => {
  assert.deepEqual(mergePositions([0, 0.02, 3, 3.01, 6, 5.99]), [0, 3, 6]);
  assert.deepEqual(mergePositions([2, 1, 1]), [1, 2]);
  assert.deepEqual(mergePositions([]), []);
});

test('dimension chains: one tick per wall seen from each side, adding up to the overall dimension', () => {
  const dims = dimensionChains(FLAT, 'detailed');
  const of = (side, kind) => dims.find((d) => d.side === side && d.kind === kind);
  // Top half: walls at x = 0, 4, 9 (the x = 6.5 wall is only in the lower half).
  assert.deepEqual(of('top', 'chain').ticks, [0, 4, 9]);
  assert.deepEqual(of('bottom', 'chain').ticks, [0, 4, 6.5, 9]);
  assert.deepEqual(of('top', 'overall').ticks, [0, 9]);
  assert.equal(of('top', 'chain').row, 0);
  assert.equal(of('top', 'overall').row, 1);
  // Left half sees only the outer walls → no chain, the overall moves to the first row.
  assert.equal(of('left', 'chain'), undefined);
  assert.deepEqual(of('left', 'overall').ticks, [0, 6]);
  assert.equal(of('left', 'overall').row, 0);
  assert.deepEqual(of('right', 'chain').ticks, [0, 3, 6]);
  // Chains add up to the overall length.
  for (const d of dims.filter((x) => x.kind === 'chain')) {
    const sum = d.ticks.slice(1).reduce((s, v, i) => s + (v - d.ticks[i]), 0);
    assert.ok(near(sum, d.ticks[d.ticks.length - 1] - d.ticks[0]));
  }
  // The dimension lines are measured from the outer faces.
  assert.ok(near(of('top', 'chain').base, -0.1));
  assert.ok(near(of('right', 'chain').base, 9.1));
});

test('dimension modes: none, overall (top and left only), and nothing for an empty plan', () => {
  assert.deepEqual(dimensionChains(FLAT, 'none'), []);
  const overall = dimensionChains(FLAT, 'overall');
  assert.deepEqual(overall.map((d) => d.side).sort(), ['left', 'top']);
  assert.ok(overall.every((d) => d.kind === 'overall' && d.row === 0));
  assert.deepEqual(dimensionChains([], 'detailed'), []);
  assert.equal(normalizePrintSetup({ dimensions: 'weird' }).dimensions, defaultPrintSetup().dimensions);
  assert.equal(normalizePrintSetup({ dimensions: 'overall' }).dimensions, 'overall');
});

test('dimension text: whole millimetres for metric units, feet and inches for imperial', () => {
  assert.equal(dimText(3.6, 'mm'), '3,600');
  assert.equal(dimText(0.9, 'cm'), '900');
  assert.equal(dimText(3.048, 'ft'), '10\' 0"');
});

test('plans with walls keep a band free for their dimension lines', () => {
  const area = { x: 0, y: 0, w: 200, h: 100 };
  assert.equal(dimensionArea(area, 'none'), area);
  const inner = dimensionArea(area, 'detailed');
  assert.ok(near(inner.w, 200 - 2 * DIM_BAND_MM.detailed) && near(inner.h, 100 - 2 * DIM_BAND_MM.detailed));
  const plan = { walls: FLAT, openings: [], rooms: [], units: 'mm' };
  const info = { levels: [{ id: 'a', name: '1F', bounds: { minX: -0.5, maxX: 9.5, minZ: -0.5, maxZ: 6.5 }, plan }], scenes: [] };
  const setup = { ...defaultPrintSetup(), includeView: false, includeSummary: false, planScale: 'fit' };
  const none = layoutSheets(info, { ...setup, dimensions: 'none' }).sheets[0];
  const det = layoutSheets(info, setup).sheets[0];
  assert.equal(det.dims, 'detailed');
  assert.equal(det.plan, plan);
  assert.ok(det.scale > none.scale, 'a smaller plan leaves room for the dimensions');
  // A level without walls draws no dimensions and keeps the full area.
  const bare = layoutSheets({ ...info, levels: [{ ...info.levels[0], plan: { walls: [], openings: [], rooms: [] } }] }, setup).sheets[0];
  assert.equal(bare.dims, 'none');
  assert.ok(near(bare.scale, none.scale));
});

test('plan overlay: dimension lines at the real scale, opening widths, room labels', () => {
  const plan = {
    walls: FLAT,
    openings: [{ x: 2, z: 0, ux: 1, uz: 0, width: 0.9, t: 0.2, door: true }],
    rooms: [{ name: 'Living', area: '24.00 m²', points: [[0, 0], [4, 0], [4, 6], [0, 6]], centre: [2, 3], size: [4, 6] }],
    units: 'mm',
  };
  const info = { levels: [{ id: 'a', name: '1F', bounds: { minX: -0.5, maxX: 9.5, minZ: -0.5, maxZ: 6.5 }, plan }], scenes: [] };
  const lay = layoutSheets(info, { ...defaultPrintSetup(), includeView: false, includeSummary: false, planScale: 100 });
  const sheet = lay.sheets[0];
  const svg = sheetSvg(sheet, lay.geometry, 'data:image/png;base64,AAAA', { t, index: 0, total: 1, project: 'P', date: 'd', scaleBar: true, titleBlock: true });
  assert.match(svg, /class="plan-overlay" clip-path="url\(#plan-clip-0\)"/);
  assert.match(svg, />4,000</);
  assert.match(svg, />5,000</);
  assert.match(svg, />9,000</);
  assert.match(svg, /class="opening-width"[^>]*>900</);
  assert.match(svg, />Living</);
  assert.match(svg, />4,000 × 6,000</);
  // 1:100 → 9 m is 90 mm on paper between the outer ticks of the top overall line.
  const map = planToPaper(sheet.request.camera, lay.geometry.area);
  assert.ok(near(map.x(9) - map.x(0), 90, 1e-6));
  // Overall mode: no opening widths, no room sizes.
  const overall = planOverlay({ ...sheet, dims: 'overall' }, lay.geometry.area);
  assert.doesNotMatch(overall, /opening-width/);
  assert.doesNotMatch(overall, /×/);
  assert.match(overall, /dim-overall/);
  // Without a picture nothing is drawn over the placeholder.
  assert.doesNotMatch(sheetSvg(sheet, lay.geometry, null, { t, index: 0, total: 1 }), /plan-overlay/);
});

test('labels: polygons overlap, points in polygons', () => {
  const sq = [[0, 0], [2, 0], [2, 2], [0, 2]];
  assert.ok(convexOverlap(sq, [[1, 1], [3, 1], [3, 3], [1, 3]]));
  assert.ok(!convexOverlap(sq, [[2, 0], [4, 0], [4, 2], [2, 2]]), 'touching is not overlapping');
  assert.ok(!convexOverlap(sq, [[3, 0], [4, 1], [3, 2], [2.6, 1]]));
  assert.ok(insidePolygon([1, 1], sq) && !insidePolygon([3, 1], sq));
  const corners = wallCorners({ a: [0, 0], b: [4, 0], t: 0.2 });
  assert.deepEqual(corners.map(([x, z]) => [x, Math.round(z * 10) / 10]), [[0, 0.1], [4, 0.1], [4, -0.1], [0, -0.1]]);
});

test('labels are nudged off walls and off each other, and stay in their rooms', () => {
  const room = [[0, 0], [40, 0], [40, 40], [0, 40]];
  const wall = [[18, 0], [22, 0], [22, 40], [18, 40]]; // a wall through the room's middle
  const [moved] = placeLabels([{ x: 20, y: 20, w: 10, h: 5, region: room }], [wall]);
  assert.ok(moved.moved && moved.clear);
  const box = (p) => [[p.x - 5, p.y - 2.5], [p.x + 5, p.y - 2.5], [p.x + 5, p.y + 2.5], [p.x - 5, p.y + 2.5]];
  assert.ok(!convexOverlap(box(moved), wall));
  assert.ok(box(moved).every((c) => insidePolygon(c, room)));
  // Two labels wanting the same spot end up apart.
  const two = placeLabels([{ x: 10, y: 10, w: 10, h: 5, region: room }, { x: 10, y: 10, w: 8, h: 4, region: room }], []);
  assert.ok(!convexOverlap(box(two[0]), [[two[1].x - 4, two[1].y - 2], [two[1].x + 4, two[1].y - 2], [two[1].x + 4, two[1].y + 2], [two[1].x - 4, two[1].y + 2]]));
  assert.ok(!two[0].moved, 'the bigger label keeps its place');
  // A free label stays where it is.
  assert.deepEqual(placeLabels([{ x: 5, y: 5, w: 2, h: 2 }], []), [{ x: 5, y: 5, moved: false, clear: true }]);
});

test('plan data for the sheets: level walls and openings in plan coordinates, room names, sizes', () => {
  const project = {
    levels: [{ id: 'L1' }, { id: 'L2' }],
    walls: [{ id: 'w1', a: [0, 0], b: [4, 0], thickness: 0.2 }, { id: 'w2', a: [0, 0], b: [0, 3], thickness: 0.2, level: 'L2' }],
    openings: [{ wall: 'w1', offset: 1, width: 0.8, item: 'door' }, { wall: 'w2', offset: 1, width: 1.2, item: 'window' }],
    rooms: [{ name: 'Bed', level: 'L1', points: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
  };
  const data = planData(project, { levelId: 'L1', isDoor: (o) => o.item === 'door', areaText: () => '12 m²', units: 'mm' });
  assert.equal(data.walls.length, 1);
  assert.deepEqual(data.openings, [{ x: 1, z: 0, ux: 1, uz: 0, width: 0.8, t: 0.2, door: true, swing: 0 }]);
  assert.deepEqual(data.rooms[0].size, [4, 3]);
  assert.deepEqual(data.rooms[0].centre, [2, 1.5]);
  assert.equal(data.rooms[0].area, '12 m²');
});

test('3D view on a portrait sheet: what the screen shows stays visible', () => {
  const rad = Math.PI / 180;
  const screen = 16 / 9;
  const g = sheetGeometry({ orientation: 'portrait' });
  const sheet = g.area.w / g.area.h;
  // Fit: the horizontal field of view of the screen is kept (until the widest field of view, then the camera steps back).
  const f = frameForSheet({ fov: 50, screenAspect: screen, sheetAspect: sheet, mode: 'fit' });
  const hfov = (fov, aspect) => 2 * Math.atan(Math.tan((fov / 2) * rad) * aspect);
  assert.ok(f.fov <= MAX_PRINT_FOV + 1e-9);
  // Visible width at the target: tan(hfov/2) × distance.
  assert.ok(near(Math.tan(hfov(f.fov, sheet) / 2) * f.dolly, Math.tan(hfov(50, screen) / 2), 1e-9));
  // A milder change only widens the field of view.
  const mild = frameForSheet({ fov: 40, screenAspect: 1.5, sheetAspect: 1.2, mode: 'fit' });
  assert.equal(mild.dolly, 1);
  assert.ok(near(hfov(mild.fov, 1.2), hfov(40, 1.5), 1e-9));
  // Parallel views grow their height instead.
  const o = frameForSheet({ ortho: true, orthoHalfHeight: 3, screenAspect: 2, sheetAspect: 0.5, mode: 'fit' });
  assert.ok(near(o.orthoHalfHeight, 12) && o.dolly === 1);
  // A sheet wider than the screen keeps the camera when fitting; filling crops it instead.
  assert.deepEqual(frameForSheet({ fov: 50, screenAspect: 1, sheetAspect: 1.4, mode: 'fit' }), { fov: 50, orthoHalfHeight: null, dolly: 1, k: 1 });
  const fill = frameForSheet({ fov: 50, screenAspect: 1, sheetAspect: 1.4, mode: 'fill' });
  assert.ok(fill.fov < 50 && near(hfov(fill.fov, 1.4), hfov(50, 1), 1e-9));
  // Filling a portrait sheet keeps the camera (the screen's sides are cut).
  assert.equal(frameForSheet({ fov: 50, screenAspect: screen, sheetAspect: sheet, mode: 'fill' }).fov, 50);
  // The request carries the framing mode, so the picture is rendered again when it changes.
  const info = { levels: [], scenes: [] };
  const a = layoutSheets(info, { ...defaultPrintSetup(), viewFit: 'fit' }).sheets[0].request;
  const b = layoutSheets(info, { ...defaultPrintSetup(), viewFit: 'fill' }).sheets[0].request;
  assert.equal(a.fit, 'fit');
  assert.notEqual(a.key, b.key);
});

test('long names in the title block shrink, then are cut between words', () => {
  assert.deepEqual(fitLine('Short', 5, 50, 3.5), { text: 'Short', size: 5 });
  const name = 'Riverside apartment renovation, second floor with study';
  const shrunk = fitLine(name, 5, 120, 3.5);
  assert.ok(shrunk.size < 5 && shrunk.text === name);
  const cut = fitLine(name, 5, 60, 3.5);
  assert.equal(cut.size, 3.5);
  assert.ok(cut.text.endsWith('…'));
  // Cut at a word break, no dangling comma or space.
  const head = cut.text.slice(0, -1);
  assert.ok(name.startsWith(head) && /[A-Za-z]$/.test(head) && name[head.length] === ' ' || name[head.length] === ',', cut.text);
  assert.equal(fitText('A  B', 3, 100), 'A B');
});
