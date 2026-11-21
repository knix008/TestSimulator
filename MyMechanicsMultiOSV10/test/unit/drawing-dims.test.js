// Drawing dimensions placed by picking edges and vertices in the views (linear, aligned, radial, diameter,
// angular, ordinate, chamfer), precision and tolerances, model items, centre marks / lines, weld symbols, general
// tables, layers, the title block and sheet formats — and that they reach the sheet SVG and the DXF file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createDrawing, projectView, drawingSvg, drawingDxf, SHEETS, viewBasis } from '../../src/cad/drawing.js';
import { sheetDrawing } from '../../src/cad/drawing-more.js';
import {
  pathEntities, viewEntities, pickEntity, dimensionFromPicks, ordinateFromPicks, dimValue, dimText, dimLabel, formatNumber, fitDeviations,
  viewFrames, viewAt, autoTextOffset, dimPrimitives, centerItems, modelItemDims, lineIntersection,
} from '../../src/cad/drawing-dims.js';
import {
  drwSvg, drwDxf, injectSvg, weldPrimitives, createTable, resizeTable, tablePrimitives, addLayer, removeLayer, annotationVisible, aciOf,
  titleFields, applySheetFormat, formatPrimitives, injectDxf, drwSummary, titleBlockPrimitives,
} from '../../src/cad/drawing-annot.js';
import { regenerate } from '../../src/cad/features.js';

await loadKernel();
const R = rep();
// The standard view that looks along z (the block's hole end-on), whichever way up the views are.
const ZV = ['front', 'top', 'right'].find((t) => Math.abs(viewBasis({ type: t }).dir[2]) > 0.999);
const ZID = `v-${ZV}`;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

/** 100 × 50 × 20 block (x −50…50, y −25…25, z 0…20) with a Ø20 hole along z at the origin. */
const block = () => R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1]));

function sheetOf(body, extra = {}) {
  const d = createDrawing({ id: 'd', name: 'Block', source: { kind: 'part', id: 'p' }, title: { date: '2026-01-01' } });
  Object.assign(d, extra);
  const projections = new Map(d.views.map((v) => [v.id, projectView(body, v.type, v)]));
  return { d, projections };
}

test('a projection path splits into lines and arcs; a circle drawn as two arcs is one full circle', () => {
  const ents = pathEntities('M 10 0 A 10 10 0 0 0 -10 0 A 10 10 0 0 0 10 0 Z');
  const arcs = ents.filter((e) => e.t === 'arc');
  assert.equal(arcs.length, 1);
  near(arcs[0].r, 10); near(arcs[0].c[0], 0); near(arcs[0].c[1], 0);
  near(Math.abs(arcs[0].sweep), Math.PI * 2, 1e-6);
  // A fillet corner (y down in the path; y up in the model): centre (47, 22), radius 3, a quarter turn.
  const [line, fillet] = pathEntities('M -47 -25 L 47 -25 A 3 3 0 0 1 50 -22');
  assert.deepEqual(line.a, [-47, 25]); assert.deepEqual(line.b, [47, 25]);
  near(fillet.c[0], 47); near(fillet.c[1], 22); near(fillet.r, 3); near(Math.abs(fillet.sweep), Math.PI / 2);
  // Collinear runs (the kernel's flattening) merge into one line.
  const run = pathEntities('M 0 0 L 1 0 L 2 0 L 5 0 L 5 4');
  assert.equal(run.length, 2); assert.deepEqual(run[0].b, [5, 0]);
});

test('smart dimension picks: lines, points, circles and pairs give the right kind and value', () => {
  const p = projectView(block(), ZV, { id: 'v', type: ZV });
  const ents = viewEntities(p);
  const edge = pickEntity(ents, [-49.8, 3], 1);
  assert.equal(edge.kind, 'line');
  const g1 = dimensionFromPicks([edge]);
  assert.equal(g1.dtype, 'vertical'); near(dimValue(g1), 50);
  const hole = pickEntity(ents, [0, 10.4], 1);
  assert.equal(hole.kind, 'arc'); assert.ok(hole.full);
  const g2 = dimensionFromPicks([hole]);
  assert.equal(g2.dtype, 'diameter'); near(dimValue(g2), 20);
  assert.equal(dimensionFromPicks([hole], 'radial').dtype, 'radial'); near(dimValue(dimensionFromPicks([hole], 'radial')), 10);
  const c1 = pickEntity(ents, [-50.3, -25.2], 1); const c2 = pickEntity(ents, [49.6, -24.8], 1);
  assert.equal(c1.kind, 'point'); assert.equal(c2.kind, 'point');
  const g3 = dimensionFromPicks([c1, c2]); assert.equal(g3.dtype, 'horizontal'); near(dimValue(g3), 100);
  const g4 = dimensionFromPicks([c1, pickEntity(ents, [50, 25], 0.5)]); assert.equal(g4.dtype, 'aligned'); near(dimValue(g4), Math.hypot(100, 50));
  assert.equal(dimensionFromPicks([c1, pickEntity(ents, [50, 25], 0.5)], 'vertical').dtype, 'vertical');
  // Two parallel edges: their distance; two edges at a corner: the angle; the hole's centre to an edge: perpendicular.
  const left = pickEntity(ents, [-50, 10], 0.5); const right = pickEntity(ents, [50, 10], 0.5); const bottom = pickEntity(ents, [10, -25], 0.5);
  near(dimValue(dimensionFromPicks([left, right])), 100);
  const ang = dimensionFromPicks([left, bottom]);
  assert.equal(ang.dtype, 'angular'); near(dimValue(ang), 90, 1e-6); assert.deepEqual(ang.v.map(Math.round), [-50, -25]);
  const centre = pickEntity(ents, [0.2, 0.1], 1);
  assert.equal(centre.kind, 'point'); assert.equal(centre.of, 'center');
  near(dimValue(dimensionFromPicks([centre, bottom])), 25);
  assert.equal(dimensionFromPicks([left], 'radial').error, 'needArc');
  assert.equal(dimensionFromPicks([left, right], 'angular').error, 'parallel');
  assert.deepEqual(lineIntersection([0, 0], [1, 0], [5, -1], [5, 1]), [5, 0]);
});

test('ordinate and chamfer dimensions', () => {
  const P = (x, y) => ({ kind: 'point', p: [x, y] });
  const o = ordinateFromPicks([P(-50, -25), P(-30, 0), P(0, 0), P(50, 10)], 'x');
  assert.deepEqual(dimValue(o), [20, 50, 100]);
  assert.deepEqual(dimValue(ordinateFromPicks([P(0, 0), P(3, 7)], 'y')), [7]);
  assert.equal(ordinateFromPicks([P(0, 0)]).error, 'more');
  // A 2 × 45° chamfer at a corner: the chamfer line and the face it leaves.
  const ch = dimensionFromPicks([{ kind: 'line', a: [48, 25], b: [50, 23] }, { kind: 'line', a: [-50, 25], b: [48, 25] }], 'chamfer');
  const v = dimValue(ch); near(v.distance, 2); near(v.angle, 45);
  assert.equal(dimLabel(ch), '2 × 45°');
  const ch2 = dimensionFromPicks([{ kind: 'line', a: [47, 25], b: [50, 23.268] }, { kind: 'line', a: [-50, 25], b: [47, 25] }], 'chamfer');
  near(dimValue(ch2).distance, 3); near(dimValue(ch2).angle, 30, 0.01);
});

test('precision and tolerances: symmetric, deviation, limits, ISO 286 fits, basic, reference', () => {
  assert.equal(formatNumber(100), '100'); assert.equal(formatNumber(12.345), '12.35'); assert.equal(formatNumber(100, 2), '100.00'); assert.equal(formatNumber(2.5, 0), '3');
  const g = { dtype: 'horizontal', p1: [0, 0], p2: [100, 0] };
  assert.equal(dimText({ ...g, precision: 1 }, 100).main, '100.0');
  assert.equal(dimText({ ...g, tol: { type: 'symmetric', upper: 0.05 } }, 100).main, '100 ±0.05');
  const dev = dimText({ ...g, tol: { type: 'bilateral', upper: 0.1, lower: 0.05 } }, 100);
  assert.equal(dev.upper, '+0.10'); assert.equal(dev.lower, '−0.05');
  const lim = dimText({ ...g, tol: { type: 'limits', upper: 0.1, lower: 0.05 } }, 100);
  assert.equal(lim.main, ''); assert.equal(lim.upper, '100.10'); assert.equal(lim.lower, '99.95');
  // ISO 286: Ø20 H7 = +0.021 / 0, h6 = 0 / −0.013, g6 = −0.007 / −0.020, k6 = +0.015 / +0.002, js6 = ±0.0065, Ø50 F8 = +0.064 / +0.025.
  assert.deepEqual(fitDeviations('H7', 20), { upper: 0.021, lower: 0 });
  assert.deepEqual(fitDeviations('h6', 20), { upper: 0, lower: -0.013 });
  assert.deepEqual(fitDeviations('g6', 20), { upper: -0.007, lower: -0.02 });
  assert.deepEqual(fitDeviations('k6', 20), { upper: 0.015, lower: 0.002 });
  assert.deepEqual(fitDeviations('js6', 20), { upper: 0.0065, lower: -0.0065 });
  assert.deepEqual(fitDeviations('F8', 50), { upper: 0.064, lower: 0.025 });
  assert.equal(fitDeviations('H7', 600), null); assert.equal(fitDeviations('X7', 20), null);
  const fit = dimText({ dtype: 'diameter', c: [0, 0], r: 10, tol: { type: 'fit', fit: 'H7' } }, 20);
  assert.equal(fit.main, 'Ø20 H7'); assert.equal(fit.upper, '+0.021'); assert.equal(fit.lower, '0');
  assert.ok(dimText({ ...g, tol: { type: 'basic' } }, 100).box);
  assert.equal(dimText({ ...g, tol: { type: 'reference' } }, 100).main, '(100)');
  assert.equal(dimText({ dtype: 'angular', tol: { type: 'symmetric', upper: 0.5 } }, 90).main, '90° ±0.50°');
  assert.equal(dimText({ dtype: 'radial', r: 3 }, 3).main, 'R3');
});

test('dimensions, centre marks, a weld symbol and a table on the sheet: SVG and DXF carry their numbers', () => {
  const body = block();
  const { d, projections } = sheetOf(body);
  const { frames } = viewFrames(d, projections);
  const front = frames.get(ZID);
  assert.ok(front && !frames.get('v-iso') === false);
  // The view under a sheet point.
  assert.equal(viewAt(frames, front.place.cx + 1, front.place.cy - 1).v.id, ZID);
  // Sheet ↔ model.
  const [X, Y] = front.fromSheet(...front.toSheet(12, -7)); near(X, 12); near(Y, -7);
  const ents = viewEntities(front.p);
  const hole = dimensionFromPicks([pickEntity(ents, [0, 10.2], 1)]);
  const width = dimensionFromPicks([pickEntity(ents, [-50, -25], 0.5), pickEntity(ents, [50, -25], 0.5)]);
  const height = dimensionFromPicks([pickEntity(ents, [50, 3], 0.5)]);
  const mk = (id, g, extra = {}) => { const a = { id, kind: 'drwDim', view: ZID, ...g, ...extra }; [a.x, a.y] = autoTextOffset(a, front); return a; };
  d.annotations.push(
    mk('dim1', width, { tol: { type: 'symmetric', upper: 0.1 } }),
    mk('dim2', hole, { tol: { type: 'fit', fit: 'H7' } }),
    mk('dim3', height, { precision: 1 }),
    { id: 'cm1', kind: 'drwCenter', view: ZID, ...centerItems(body, d.views.find((v) => v.id === ZID))[0] },
    { id: 'w1', kind: 'drwWeld', x: 40, y: 60, target: [30, 72], symbol: 'fillet', side: 'both', size: 'a5', length: '50', pitch: '100', allAround: true, field: true, tail: '111' },
    { ...createTable({ id: 't1', x: 20, y: 200, rows: 2, cols: 2, title: 'NOTES' }), cells: [['ITEM', 'VALUE'], ['Ra', '1.6']] },
  );
  // The width dimension text goes below the view (away from its middle).
  assert.ok(d.annotations[0].y > 0);
  const svg = drwSvg(d, projections, { selected: 'dim2' });
  for (const text of ['100 ±0.10', 'Ø20 H7', '+0.021', '50.0', 'a5', '50-100', '111', 'NOTES', 'VALUE', '1.6']) assert.ok(svg.includes(`>${text}<`), `SVG has ${text}`);
  assert.match(svg, /data-annotation="dim2"[^>]*>/); assert.match(svg, /class="annotation dx-ann dx-drwDim selected" data-annotation="dim2"/);
  assert.match(svg, /class="dx-center"|dx-thin/);
  const full = injectSvg(drawingSvg(d, projections), svg);
  assert.ok(full.trim().endsWith('</svg>')); assert.ok(full.includes('drawing-drw'));
  const dxf = drwDxf(drawingDxf(d, projections), d, projections, { info: { name: 'Block', material: 'Steel' } });
  for (const text of ['100 %%p0.10', '%%c20 H7', '+0.021', '50.0', 'a5', '50-100', 'NOTES', 'VALUE', 'Block', 'Steel']) assert.ok(dxf.includes(`\n1\n${text}\n`), `DXF has ${text}`);
  for (const layer of ['DIMENSIONS', 'CENTER', 'WELDS', 'TABLES', 'TITLE']) assert.match(dxf, new RegExp(`\\n0\\nLAYER\\n2\\n${layer}\\n`));
  const count = Number(/0\nTABLE\n2\nLAYER\n70\n(\d+)\n/.exec(dxf)[1]);
  assert.equal(count, (dxf.match(/\n0\nLAYER\n2\n/g) ?? []).length, 'the layer table count matches its records');
  assert.ok(dxf.trim().endsWith('EOF'));
  assert.deepEqual(drwSummary(d).map((x) => x.text).slice(0, 3), ['100 ±0.10', 'Ø20 H7 +0.021 0', '50.0']);
  // Primitives of the arrows of a linear dimension point outward at the extension lines.
  const prims = dimPrimitives(d.annotations[0], front);
  assert.equal(prims.filter((p) => p.t === 'fill').length, 2);
});

test('centre marks end-on and centre lines side-on come from the cylinders', () => {
  const body = block();
  const front = centerItems(body, { id: 'f', type: 'front' });
  const top = centerItems(body, { id: 't', type: 'top' });
  const right = centerItems(body, { id: 'r', type: 'right' });
  // The hole runs along z: whichever views look along z show a mark; views across it show a line 20 long.
  const all = [front, top, right];
  const marks = all.flat().filter((x) => x.ctype === 'mark'); const lines = all.flat().filter((x) => x.ctype === 'line');
  assert.equal(marks.length, 1); near(marks[0].r, 10);
  assert.equal(lines.length, 2);
  for (const l of lines) near(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 20, 1e-6);
  // A fillet (a quarter cylinder) gives none.
  const rounded = R.makeBox([0, 0, 0], [30, 30, 10]).fillet(4, (e) => e.inDirection('Z'));
  assert.equal(centerItems(rounded, { id: 'f', type: 'front' }).length + centerItems(rounded, { id: 't', type: 'top' }).length + centerItems(rounded, { id: 'r', type: 'right' }).length, 0);
});

test('model items: the sketch dimensions and the extrude depth appear in the views that show them', () => {
  const pts = [['a', -50, -25], ['b', 50, -25], ['c', 50, 25], ['e', -50, 25]].map(([id, x, y]) => ({ id, type: 'point', x, y }));
  const sketch = {
    id: 'sk1', type: 'sketch', name: 'S1', plane: { kind: 'std', name: 'front' },
    entities: [{ id: 'O', type: 'point', x: 0, y: 0, fixed: true, origin: true }, ...pts,
      { id: 'l1', type: 'line', p1: 'a', p2: 'b' }, { id: 'l2', type: 'line', p1: 'b', p2: 'c' }, { id: 'l3', type: 'line', p1: 'c', p2: 'e' }, { id: 'l4', type: 'line', p1: 'e', p2: 'a' },
      { id: 'hc', type: 'circle', c: 'O', r: 10 }],
    constraints: [{ id: 'c1', type: 'distance', a: 'l1', value: 100 }, { id: 'c2', type: 'distance', a: 'l2', value: 50 }, { id: 'c3', type: 'diameter', a: 'hc', value: 20 }, { id: 'c4', type: 'angle', a: 'l1', b: 'l2', value: 90 }],
  };
  const part = { id: 'p', name: 'P', features: [sketch, { id: 'ex1', type: 'extrude', name: 'E1', sketch: 'sk1', op: 'boss', end: 'blind', depth: 20, reverse: false, end2: 'none', depth2: 10 }] };
  const r = regenerate(part);
  assert.ok(r.body, 'the part builds');
  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  const dims = modelItemDims(part, r.results, d.views);
  const values = dims.map((g) => Math.round(dimValue(g) * 1000) / 1000).sort((a, b) => a - b);
  assert.deepEqual(values, [20, 20, 50, 90, 100]);
  const depth = dims.find((g) => g.source === 'ex1:depth');
  assert.ok(depth && depth.view !== dims.find((g) => g.source === 'sk1:c1').view, 'the depth is in a side view');
  for (const g of dims) assert.ok(d.views.some((v) => v.id === g.view) && !['iso', 'dimetric'].includes(d.views.find((v) => v.id === g.view).type));
  // Placed on the sheet: every value is in the SVG.
  const projections = new Map(d.views.map((v) => [v.id, projectView(r.body, v.type, v)]));
  const { frames } = viewFrames(d, projections);
  d.annotations = dims.map((g, i) => { const a = { id: `m${i}`, kind: 'drwDim', ...g }; [a.x, a.y] = autoTextOffset(a, frames.get(a.view)); return a; });
  const svg = drwSvg(d, projections);
  for (const text of ['100', '50', 'Ø20', '90°', '20']) assert.ok(svg.includes(`>${text}<`), `SVG has ${text}`);
});

test('layers: hidden layers are not drawn, colours colour the annotations, the DXF gets the layers', () => {
  const body = block();
  const { d, projections } = sheetOf(body);
  addLayer(d, { id: 'L1', name: 'Dims red', color: '#ff0000' });
  addLayer(d, { id: 'L2', name: 'Hidden', color: '#0000ff' });
  const g = { kind: 'drwDim', view: ZID, dtype: 'horizontal', p1: [-50, -25], p2: [50, -25], x: 0, y: 30 };
  d.annotations.push({ id: 'a', ...g, layer: 'L1' }, { id: 'b', ...g, y: 40, text: 'HIDDEN-ME', layer: 'L2' }, { id: 'n1', kind: 'note', x: 30, y: 30, text: 'NOTE1', layer: 'L1' });
  d.layers[1].visible = false;
  assert.equal(annotationVisible(d, d.annotations[1]), false);
  const svg = drwSvg(d, projections);
  assert.match(svg, /data-annotation="a" data-layer="L1">.*stroke="#ff0000"/s);
  assert.ok(!svg.includes('HIDDEN-ME'));
  assert.match(svg, /\[data-annotation="n1"\]:not\(\.selected\) \.ann-text\{fill:#ff0000\}/);
  const base = drawingDxf({ ...d, annotations: [] }, projections);
  const dxf = drwDxf(base, d, projections, { layered: [d.annotations[2]] });
  assert.match(dxf, /\n0\nLAYER\n2\nDIMS_RED\n70\n0\n62\n1\n/);
  assert.match(dxf, /\n0\nLAYER\n2\nL_HIDDEN\n70\n0\n62\n-5\n/, 'a hidden layer is off in the DXF (renamed off the sheet\'s own HIDDEN layer)');
  assert.match(dxf, /\nTEXT\n8\nDIMS_RED\n[\s\S]*?\n1\nNOTE1\n/);
  assert.equal(aciOf('#00ff00'), 3); assert.equal(aciOf('#000000'), 7);
  removeLayer(d, 'L1');
  assert.equal(d.annotations[0].layer, undefined);
  assert.equal(injectDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', [], ['0\nPOINT']), '0\nSECTION\n2\nENTITIES\n0\nPOINT\n0\nENDSEC\n0\nEOF\n');
});

test('title block fields, sheet formats (ISO / ANSI sizes, zones) and tables', () => {
  assert.deepEqual(SHEETS['ANSI C'], [558.8, 431.8]); assert.deepEqual(SHEETS['ANSI D'], [863.6, 558.8]); assert.deepEqual(SHEETS['ANSI E'], [1117.6, 863.6]);
  const d = createDrawing({ id: 'd', name: 'Doc', source: { kind: 'part', id: 'p' }, title: { date: '2026-01-01' } });
  d.title = { ...d.title, title: 'Bracket', partNo: 'BR-01', material: 'S355', drawnBy: 'KSH', revision: 'C' };
  const f = titleFields(d, { info: { name: 'Model', material: 'Steel' }, scale: 0.5 });
  assert.equal(f.name, 'Bracket'); assert.equal(f.material, 'S355'); assert.equal(f.scale, '1:2'); assert.equal(f.revision, 'C');
  const tb = titleBlockPrimitives(420, 297, f).filter((p) => p.t === 'text').map((p) => p.text);
  for (const t of ['Bracket', 'BR-01', 'S355', 'KSH', '1:2', 'C']) assert.ok(tb.includes(t));
  applySheetFormat(d, { standard: 'ANSI', sheet: 'ANSI D' });
  assert.equal(d.sheet, 'ANSI D'); assert.equal(d.projection, 'third'); assert.equal(d.format.standard, 'ANSI');
  let texts = formatPrimitives(d).map((p) => p.text);
  // ASME: zone numbers run right to left, letters bottom to top.
  const cols = Math.round((863.6 - 20) / 50);
  assert.equal(formatPrimitives(d)[0].text, String(cols)); assert.ok(texts.includes('ASME Y14.5 · ANSI'));
  applySheetFormat(d, { standard: 'ISO', sheet: 'A2' });
  texts = formatPrimitives(d).map((p) => p.text);
  assert.equal(d.projection, 'first'); assert.equal(formatPrimitives(d)[0].text, '1'); assert.ok(texts.includes('ISO 128 · ISO 129-1'));
  // Tables resize and keep their cells.
  const t = createTable({ id: 't', rows: 2, cols: 2 }); t.cells[1][1] = 'X';
  resizeTable(t, 3, 4);
  assert.equal(t.cells.length, 3); assert.equal(t.cells[0].length, 4); assert.equal(t.cells[1][1], 'X');
  assert.ok(tablePrimitives(t).some((p) => p.t === 'text' && p.text === 'X'));
  // The weld symbol: ISO has the dashed identification line, ANSI none.
  const w = { x: 0, y: 0, symbol: 'vGroove', side: 'arrow', size: '6' };
  assert.ok(weldPrimitives(w, { iso: true }).some((p) => p.cls === 'dx-dash'));
  assert.ok(!weldPrimitives(w, { iso: false }).some((p) => p.cls === 'dx-dash'));
  // sheetDrawing keeps the format and layers on the sheet copy.
  d.layers = [{ id: 'L', name: 'L', color: '#000000', visible: true }];
  assert.equal(sheetDrawing(d).format.standard, 'ISO'); assert.equal(sheetDrawing(d).layers.length, 1);
});
