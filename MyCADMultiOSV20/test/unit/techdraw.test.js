// FreeCAD TechDraw on the 2D page: views from any direction, broken and detail
// views, chain / coordinate / chamfer / extent dimensions, cascading, ISO 286
// fits, centrelines, threads, symbols, templates and tables.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignDimensions, arcLength, boltCircle, brokenView, cascadeDimensions, centreLineBetween, chainDimensions, chamferDimension, circleCentreLines, deviations, detailView,
  directionView, extendLine, extentDimension, fitText, itTolerance, pageTemplate, regionArea, sheetTable, surfaceFinish, threadBottom, threadSide, vertexPoints, viewFrame, weldSymbol,
} from '../../src/domain/techdraw.js';
import { normalizeSolidData, solidMesh } from '../../src/domain/solids.js';
import { normalizeEntity } from '../../src/domain/entities.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const line = (x1, y1, x2, y2) => ({ type: 'line', layer: '0', x1, y1, x2, y2 });

test('views: a box seen along any direction; along −y it is the front view (width × height)', () => {
  const box = solidMesh(normalizeSolidData({ type: 'solid', kind: 'box', params: { length: 40, width: 20, height: 10 } }));
  const frame = viewFrame([0, -1, 0]);
  assert.deepEqual(frame.u.map((v) => Math.round(v) + 0), [1, 0, 0]);
  const front = directionView(box, [0, -1, 0], { x0: 100, y0: 0 });
  const pts = front.flatMap((e) => e.points);
  near(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)), 40);
  near(Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)), 10);
  near(Math.min(...pts.map((p) => p.x)), 100);
  const iso = directionView(box, [1, -1, 1], { scale: 2 });
  assert.ok(iso.some((e) => e.lineType === 'hidden'), 'hidden edges marked');
});

test('broken view: the middle band goes, the far part comes back leaving the gap; detail view magnifies a circle', () => {
  const out = brokenView([line(0, 0, 100, 0), line(0, 10, 100, 10)], 'x', 30, 70, 6);
  const xs = out.entities.flatMap((e) => e.points.map((p) => p.x));
  near(Math.max(...xs), 66, 1e-9);
  assert.ok(!xs.some((x) => x > 30 + 1e-9 && x < 36 - 1e-9), 'nothing inside the gap');
  assert.equal(out.breaks.length, 2);
  const det = detailView([line(-10, 0, 10, 0)], { x: 0, y: 0 }, 5, 3, { x: 100, y: 100 });
  const seg = det.find((e) => e.type === 'polyline').points;
  near(seg[0].x, 85); near(seg.at(-1).x, 115);
  assert.equal(det.at(-1).type, 'circle');
});

test('dimensions: chain and coordinate dimensions of points, chamfer, extent, cascade and align', () => {
  const pts = vertexPoints([line(0, 0, 10, 0), line(10, 0, 25, 0), { type: 'point', x: 40, y: 0 }]);
  assert.equal(pts.length, 4);
  const chain = chainDimensions(pts, { direction: 'horizontal' });
  assert.deepEqual(chain.map((d) => d.x2 - d.x1), [10, 15, 15]);
  assert.ok(chain.every((d) => d.oy === chain[0].oy && d.oy > 0), 'one line above the points');
  const coord = chainDimensions(pts, { direction: 'horizontal', coordinate: true, spacing: 7 });
  assert.deepEqual(coord.map((d) => d.x1), [0, 0, 0]);
  assert.deepEqual(coord.map((d) => d.oy - coord[0].oy), [0, 7, 14]);
  const ch = chamferDimension(line(0, 0, 3, 3), 'horizontal');
  assert.match(ch.text, /×45°$/);
  const ext = extentDimension([line(0, 0, 10, 5), { type: 'circle', cx: 30, cy: 0, r: 5 }], 'horizontal');
  assert.deepEqual([ext.x1, ext.x2], [0, 35]);
  const dims = [{ id: 'a', type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 30, y2: 0, ox: 15, oy: 20 }, { id: 'b', type: 'dim', kind: 'horizontal', x1: 0, y1: 0, x2: 10, y2: 0, ox: 5, oy: 5 }];
  const cas = cascadeDimensions(dims, 7);
  assert.deepEqual(cas.map((d) => [d.id, d.oy]), [['b', 5], ['a', 12]]);
  assert.deepEqual(alignDimensions(dims).map((d) => d.oy), [20, 20]);
});

test('ISO 286 fits: IT grades and deviations of common fits (20 mm H7/g6, 50 mm H7/p6)', () => {
  assert.equal(itTolerance(20, 7), 21);
  assert.equal(itTolerance(20, 6), 13);
  assert.deepEqual(deviations(20, 'H', 7), { upper: 21, lower: 0 });
  assert.deepEqual(deviations(20, 'g', 6), { upper: -7, lower: -20 });
  assert.deepEqual(deviations(20, 'h', 6), { upper: 0, lower: -13 });
  const loose = fitText(20, 'H', 7, 'g', 6);
  assert.equal(loose.kind, 'clearance');
  assert.match(loose.text, /^<> H7\/g6 \(\+0\.021\/0 · −0\.007\/−0\.020\)$/);
  assert.equal(fitText(50, 'H', 7, 'p', 6).kind, 'interference');
  assert.equal(fitText(20, 'H', 7, 'k', 6).kind, 'transition');
});

test('cosmetic: centrelines, bolt circle, threads; symbols, template fields, tables, area, arc length, extend', () => {
  const c = centreLineBetween(line(0, 0, 50, 0), line(0, 10, 50, 10), 3);
  assert.deepEqual([c.x1, c.y1, c.x2, c.y2], [-3, 5, 53, 5]);
  assert.equal(circleCentreLines({ cx: 0, cy: 0, r: 5 }).length, 2);
  const holes = [0, 120, 240].map((a) => ({ cx: 30 * Math.cos((a * Math.PI) / 180), cy: 30 * Math.sin((a * Math.PI) / 180), r: 3 }));
  near(boltCircle(holes).circle.r, 30);
  const [t1, t2] = threadSide(line(0, 0, 40, 0), line(0, 10, 40, 10));
  near(t1.y1, 0.75); near(t2.y1, 9.25);
  near(threadBottom({ cx: 0, cy: 0, r: 10 }, { hole: true }).r, 10 / 0.85);
  assert.ok(surfaceFinish({ x: 0, y: 0 }, { text: 'Ra 1.6' }).some((e) => e.type === 'text' && e.text === 'Ra 1.6'));
  assert.equal(weldSymbol({ x: 0, y: 0 }, { x: 10, y: 10 }, { allAround: true })[0].type, 'leader');
  const page = pageTemplate('A3', { x: 0, y: 0 }, { title: 'Bracket' });
  assert.equal(page[0].width, 420);
  assert.equal(page.find((e) => e.field === 'title').text, 'Bracket');
  assert.equal(normalizeEntity({ type: 'text', x: 0, y: 0, text: 'x', field: 'title' }).field, 'title');
  const table = sheetTable({ A1: 'a', B2: '=1+1' }, { A1: 'a', B2: 2 }, { x: 0, y: 0 });
  assert.equal(table.filter((e) => e.type === 'line').length, 3 + 3);
  assert.ok(table.some((e) => e.type === 'text' && e.text === '2'));
  near(regionArea([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }]]), 96);
  near(arcLength({ r: 10, start: 0, end: 90 }), 5 * Math.PI);
  const longer = extendLine({ x1: 0, y1: 0, x2: 10, y2: 0 }, 2);
  assert.deepEqual([longer.x1, longer.x2], [-2, 12]);
});
