// Dimensions in every kind of view and everything on the sheet reaching the DXF: smart dimensions in pictorial
// (isometric / dimetric) views measure the model in 3D (true length, true angle, true diameter — or the projected
// size on request), detail views are dimensioned at their own scale with model values, broken views give the
// model's distances across the break; the DXF gets the overall view dimensions, zone marks, break lines,
// broken-out outlines, hole tags and table, revision table and sheet name; small centre marks; annotation drag
// snapping and labels of automatic dimensions that never overlap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createDrawing, projectView, drawingDxf, drawingSvg, viewBasis, annotationPrimitives } from '../../src/cad/drawing.js';
import { breakProjection, adjustProjections, sheetDxf, overlayPrimitives, addRevision, addSheet, findHoles, holeTableRows, flattenPath, cropProjection } from '../../src/cad/drawing-more.js';
import {
  viewEntities, pickEntity, dimensionFromPicks, dimValue, dimLabel, viewFrames, pickToTrue, insideDetail, breakForward, breakInverse,
  modelGeometry, pictorialPick, pictorialDimension, pictorialMark, dimPrimitives, autoTextOffset, layoutDimLabels, dimLabelBox, modelItemDims,
  silhouetteLines, angle3,
} from '../../src/cad/drawing-dims.js';
import { snapDrag, separateLabels, primsBox, boxesOverlap, textCorners } from '../../src/cad/drawing-snap.js';
import { annotationBoxes, drwItems } from '../../src/cad/drawing-annot.js';
import { normalizeProject } from '../../src/cad/document.js';
import { migrateDrawingDims, DIM_COORDS } from '../../src/cad/drawing.js';
import { textWidth, textExtent, measureFont, cjkFont, tableEm, embedFonts, fontFaceCss, DRAWING_FONT } from '../../src/cad/text-metrics.js';
import { readFileSync } from 'node:fs';
import { regenerate } from '../../src/cad/features.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≉ ${b}`);
const ZV = ['front', 'top', 'right'].find((t) => Math.abs(viewBasis({ type: t }).dir[2]) > 0.999);
const ZID = `v-${ZV}`;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 100 × 50 × 20 block (x −50…50, y −25…25, z 0…20) with a Ø20 hole along z at the origin. */
const block = () => R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1]));

/** DXF entities: [{ type, layer, codes: Map code → [values] }]. */
function dxfEntities(dxf) {
  const lines = dxf.replace(/\n$/, '').split('\n');
  const start = lines.indexOf('ENTITIES');
  const out = []; let cur = null;
  for (let i = start + 1; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]); const value = lines[i + 1];
    if (code === 0) { if (value === 'ENDSEC') break; cur = { type: value, layer: null, codes: new Map() }; out.push(cur); continue; }
    if (!cur) continue;
    if (code === 8) cur.layer = value;
    if (!cur.codes.has(code)) cur.codes.set(code, []);
    cur.codes.get(code).push(value);
  }
  return out;
}
const texts = (ents, layer) => ents.filter((e) => e.type === 'TEXT' && (!layer || e.layer === layer)).map((e) => e.codes.get(1)[0]);
const layerNames = (dxf) => [...dxf.matchAll(/0\nLAYER\n2\n([^\n]+)\n/g)].map((m) => m[1]);

// ───────────────────────── pictorial views

const isoBody = block();
const geom = modelGeometry(isoBody);
const ISO = { id: 'v-iso', type: 'iso' };
const isoP = projectView(isoBody, 'iso', ISO);
const isoB = viewBasis(ISO);
const P2 = (p) => [dot(p, isoB.x), dot(p, isoB.y)];
// The block corner nearest the viewer (always seen) and the three edges from it.
const corner = geom.vertices.reduce((m, v) => (dot(v, isoB.dir) > dot(m, isoB.dir) ? v : m), geom.vertices[0]);
const edgesAt = geom.lines.filter((l) => [l.a, l.b].some((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1], p[2] - corner[2]) < 1e-6));
const otherEnd = (l) => (Math.hypot(l.a[0] - corner[0], l.a[1] - corner[1], l.a[2] - corner[2]) < 1e-6 ? l.b : l.a);

test('model geometry: the block\'s 12 straight edges, 8 corners and the hole\'s two full circles of radius 10', () => {
  assert.equal(geom.lines.filter((l) => Math.hypot(...[0, 1, 2].map((i) => l.a[i] - l.b[i])) > 1).length >= 12, true);
  for (const c of [[-50, -25, 0], [50, 25, 20], [50, -25, 20]]) assert.ok(geom.vertices.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < 1e-6), `corner ${c}`);
  const rims = geom.circles.filter((c) => Math.abs(c.r - 10) < 1e-9);
  assert.equal(rims.length, 2);
  for (const c of rims) { assert.ok(c.full); near(Math.abs(c.n[2]), 1, 1e-9); near(Math.hypot(c.c[0], c.c[1]), 0, 1e-9); }
  assert.deepEqual(rims.map((c) => Math.round(c.c[2])).sort((a, b) => a - b), [0, 20]);
  assert.equal(edgesAt.length, 3, 'three edges meet at the front corner');
});

test('pictorial: an edge picked in the isometric view measures its true length (TL), not the projected one', () => {
  const ents = viewEntities(isoP, { hidden: false });
  const lengths = [];
  for (const l of edgesAt) {
    const far = otherEnd(l);
    const mid = P2([(corner[0] * 3 + far[0]) / 4, (corner[1] * 3 + far[1]) / 4, (corner[2] * 3 + far[2]) / 4]);
    const pick = pickEntity(ents, mid, 0.5);
    assert.equal(pick?.kind, 'line', 'an edge is under the point');
    const pk = pictorialPick(pick, mid, geom, isoB, 0.5);
    assert.ok(pk, 'matched to a model edge');
    const g = pictorialDimension([pk], 'auto', isoB);
    assert.equal(g.dtype, 'aligned');
    const trueLen = Math.hypot(...[0, 1, 2].map((i) => far[i] - corner[i]));
    near(dimValue(g), trueLen, 1e-9, 'true length');
    const projected = Math.hypot(...[0, 1].map((i) => P2(far)[i] - P2(corner)[i]));
    assert.ok(projected < trueLen - 1, 'the isometric view foreshortens it');
    near(dimValue({ ...g, measure: 'projected' }), projected, 1e-9, 'projected length on request');
    assert.equal(dimLabel(g), `${Math.round(trueLen)} TL`);
    assert.equal(dimLabel({ ...g, trueMark: false }), `${Math.round(trueLen)}`);
    assert.equal(dimLabel({ ...g, measure: 'projected', precision: 2 }), `${projected.toFixed(2)} PROJ`);
    lengths.push(Math.round(trueLen));
  }
  assert.deepEqual(lengths.sort((a, b) => a - b), [20, 50, 100]);
});

test('pictorial: two corners picked measure the 3D distance between them; a corner to an edge the 3D perpendicular', () => {
  const ents = viewEntities(isoP, { hidden: false });
  const [l1, l2] = edgesAt;
  const A = otherEnd(l1); const B = otherEnd(l2);
  const pa = pictorialPick(pickEntity(ents, P2(A), 0.5), P2(A), geom, isoB, 0.5);
  const pb = pictorialPick(pickEntity(ents, P2(B), 0.5), P2(B), geom, isoB, 0.5);
  assert.equal(pa.kind, 'point'); assert.equal(pb.kind, 'point');
  assert.deepEqual(pa.p3, A); assert.deepEqual(pb.p3, B);
  const g = pictorialDimension([pa, pb], 'auto', isoB);
  near(dimValue(g), Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), 1e-9);
  // Corner A to the edge l2 (which runs from the corner to B): square to it in 3D, that is A to the corner.
  const mid2 = P2([(corner[0] + B[0]) / 2, (corner[1] + B[1]) / 2, (corner[2] + B[2]) / 2]);
  const pe = pictorialPick(pickEntity(ents, mid2, 0.5), mid2, geom, isoB, 0.5);
  near(dimValue(pictorialDimension([pa, pe], 'auto', isoB)), Math.hypot(A[0] - corner[0], A[1] - corner[1], A[2] - corner[2]), 1e-9);
  // Sheet directions mean nothing in a pictorial view.
  assert.equal(pictorialDimension([pa, pb], 'horizontal', isoB).error, 'pictorialType');
  assert.equal(pictorialDimension([pa], 'auto', isoB).error, 'more');
});

test('pictorial: two edges at a corner give their true 90°, though the sheet shows a wider angle', () => {
  const ents = viewEntities(isoP, { hidden: false });
  const pk = edgesAt.slice(0, 2).map((l) => {
    const far = otherEnd(l);
    const mid = P2([(corner[0] + far[0]) / 2, (corner[1] + far[1]) / 2, (corner[2] + far[2]) / 2]);
    return pictorialPick(pickEntity(ents, mid, 0.5), mid, geom, isoB, 0.5);
  });
  const g = pictorialDimension(pk, 'auto', isoB);
  assert.equal(g.dtype, 'angular');
  near(dimValue(g), 90, 1e-9);
  const shown = dimValue({ ...g, measure: 'projected' });
  assert.ok(Math.abs(shown - 90) > 10, `the sheet angle ${shown} is not 90`);
  assert.equal(pictorialMark({ ...g, measure: 'projected' }), ' PROJ');
  assert.equal(pictorialMark(g), '');
});

test('pictorial: the hole rim (an ellipse on the sheet) is dimensioned Ø20, the leader ends on the ellipse', () => {
  const ents = viewEntities(isoP, { hidden: false });
  const rim = geom.circles.find((c) => Math.abs(c.r - 10) < 1e-9 && dot(c.c, isoB.dir) === Math.max(...geom.circles.filter((x) => Math.abs(x.r - 10) < 1e-9).map((x) => dot(x.c, isoB.dir))));
  let pk = null;
  for (let k = 0; k < 24 && !pk; k++) {
    const t = ((k + 0.37) * Math.PI * 2) / 24;
    const p3 = [rim.c[0] + 10 * Math.cos(t), rim.c[1] + 10 * Math.sin(t), rim.c[2]];
    const q = P2(p3);
    const pick = pickEntity(ents, q, 0.3);
    if (pick && pick.kind !== 'point') pk = pictorialPick(pick, q, geom, isoB, 0.3);
  }
  assert.equal(pk?.kind, 'circle', 'the rim is matched to its 3D circle');
  near(pk.r, 10, 1e-9);
  const g = pictorialDimension([pk], 'auto', isoB);
  assert.equal(g.dtype, 'diameter');
  near(dimValue(g), 20, 1e-9);
  assert.equal(dimLabel(g), 'Ø20');
  // On the sheet: the arrow tip lies on the projected 3D circle.
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [ISO];
  const { frames } = viewFrames(d, new Map([['v-iso', isoP]]));
  const fr = frames.get('v-iso');
  assert.ok(fr.pictorial);
  const a = { kind: 'drwDim', view: 'v-iso', ...g }; [a.x, a.y] = autoTextOffset(a, fr);
  const prims = dimPrimitives(a, fr);
  assert.ok(prims.some((p) => p.t === 'text' && p.text === 'Ø20'));
  const tip = prims.find((p) => p.t === 'fill').pts[0];
  // Back to the circle's plane: its distance from the centre is the radius.
  const X = fr.fromSheet(...tip);
  const base = [0, 1, 2].map((i) => isoB.x[i] * X[0] + isoB.y[i] * X[1]);
  const tt = dot([rim.c[0] - base[0], rim.c[1] - base[1], rim.c[2] - base[2]], rim.n) / dot(isoB.dir, rim.n);
  const P = base.map((v, i) => v + isoB.dir[i] * tt);
  near(Math.hypot(P[0] - rim.c[0], P[1] - rim.c[1], P[2] - rim.c[2]), 10, 0.05, 'on the ellipse');
});

// ───────────────────────── detail views

test('detail view: a frame of its own at its scale; the hole measures Ø20 there, drawn twice the size', () => {
  const body = block();
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: ZID, type: ZV }, { id: 'det', kind: 'detail', type: ZV, parent: ZID, scale: 2, center: [0, 0], radius: 15, label: 'B' }];
  const proj = new Map([[ZID, projectView(body, ZV, d.views[0])]]);
  const { frames } = viewFrames(d, proj);
  const parent = frames.get(ZID); const det = frames.get('det');
  assert.ok(det, 'the detail view has a frame');
  near(det.s, parent.s * 2, 1e-12);
  assert.equal(det.base.id, ZID);
  const ents = viewEntities(det.p);
  const pick = pickEntity(ents, [0, 10.1], 2.2 / det.s);
  assert.equal(pick.kind, 'arc');
  assert.ok(insideDetail(det, [0, 10.1])); assert.ok(!insideDetail(det, [40, 0]));
  const g = dimensionFromPicks([pick]);
  near(dimValue(g), 20, 1e-9);
  const a = { kind: 'drwDim', view: 'det', ...g }; [a.x, a.y] = autoTextOffset(a, det);
  const b = { kind: 'drwDim', view: ZID, ...g }; [b.x, b.y] = autoTextOffset(b, parent);
  // Model value in both, the arrows twice as far apart on the detail.
  assert.equal(dimLabel(a), 'Ø20');
  const span = (prims, fr) => { const tips = prims.filter((p) => p.t === 'fill').map((p) => p.pts[0]); return Math.hypot(tips[0][0] - tips[1][0], tips[0][1] - tips[1][1]) / fr.s; };
  near(span(dimPrimitives(a, det), det) * det.s, 20 * det.s, 1e-6);
  near(span(dimPrimitives(b, parent), parent) * parent.s, 20 * parent.s, 1e-6);
});

// ───────────────────────── broken views

test('break maps: forward and back are inverse; the far side moves by the removed length', () => {
  const br = [{ axis: 'x', at: -40, gap: 4, to: -15 }];
  for (const X of [-60, -40, -30, -15, 0, 37.5]) { const q = breakForward(br, X, 3); const r = breakInverse(br, ...q); near(r[0], X, 1e-12); near(r[1], 3, 1e-12); }
  near(breakForward(br, 50, 0)[0], 50 - 21, 1e-12);
  const two = [...br, { axis: 'y', at: 0, gap: 2, to: 10 }];
  const q = breakForward(two, 20, 30); near(q[0], -1, 1e-12); near(q[1], 22, 1e-12);
  const r = breakInverse(two, ...q); near(r[0], 20, 1e-12); near(r[1], 30, 1e-12);
});

test('broken view: dimensions across the break give the model distance; circles beyond it stay circles', () => {
  const body = block();
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: ZID, type: ZV, break: { axis: 'x', from: -40, to: -15 } }];
  const raw = projectView(body, ZV, d.views[0]);
  const lo = -50;
  const adj = adjustProjections(d, new Map([[ZID, raw]]));
  const p = adj.get(ZID);
  assert.equal(p.breaks[0].to, -15);
  const { frames } = viewFrames(d, adj);
  const fr = frames.get(ZID);
  const ents = viewEntities(p);
  assert.ok(ents.some((e) => e.t === 'arc' && Math.abs(e.r - 10) < 1e-6), 'the hole is still an arc');
  const shift = -15 - -40 - p.breaks[0].gap;
  // The right-hand corner sits shifted in the projection; picked there it is where it really is.
  const right = pickToTrue(fr, pickEntity(ents, [50 - shift, -25], 0.5));
  const left = pickToTrue(fr, pickEntity(ents, [lo, -25], 0.5));
  assert.equal(right.kind, 'point'); near(right.p[0], 50, 1e-6);
  const g = dimensionFromPicks([left, right]);
  near(dimValue(g), 100, 1e-6, 'overall length across the break');
  const hole = pickToTrue(fr, pickEntity(ents, [-shift, 10], 0.5));
  assert.equal(hole.kind, 'arc'); near(hole.c[0], 0, 1e-6);
  const centre = pickToTrue(fr, pickEntity(ents, [-shift, 0], 0.5));
  near(dimValue(dimensionFromPicks([left, centre], 'horizontal')), 50, 1e-6, 'edge to hole centre');
  // On the sheet the true points land on the shortened drawing.
  const S = fr.toSheet(50, -25); const Q = fr.projAt(...S);
  near(Q[0], 50 - shift, 1e-9);
  const a = { kind: 'drwDim', view: ZID, ...g }; [a.x, a.y] = autoTextOffset(a, fr);
  assert.ok(dimPrimitives(a, fr).some((q) => q.t === 'text' && q.text === '100'));
  // Cropping keeps whole paths (the hole) as they are too.
  const c = cropProjection(raw, { x0: -20, y0: -20, x1: 20, y1: 20 });
  assert.ok(viewEntities(c).some((e) => e.t === 'arc' && Math.abs(e.r - 10) < 1e-6));
});

// ───────────────────────── DXF: everything the sheet shows

test('DXF: the overall view dimensions (DIMENSIONS) and the frame\'s zone marks are written', () => {
  const body = block();
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: ZID, type: ZV }, { id: 'v-iso', type: 'iso' }];
  const proj = new Map(d.views.map((v) => [v.id, projectView(body, v.type, v)]));
  const dxf = drawingDxf(d, proj);
  const ents = dxfEntities(dxf);
  assert.deepEqual(texts(ents, 'DIMENSIONS').sort(), ['100', '50'], 'width and height of the end view, nothing for the isometric');
  assert.ok(layerNames(dxf).includes('DIMENSIONS'));
  // A3: 400 / 50 = 8 columns, 277 / 50 ≈ 6 rows → (7 + 5) × 2 ticks on the border (layer ZONES).
  assert.equal(ents.filter((e) => e.type === 'LINE' && e.layer === 'BORDER').length, 4, 'BORDER keeps only the frame');
  assert.equal(ents.filter((e) => e.type === 'LINE' && e.layer === 'ZONES').length, (7 + 5) * 2);
  assert.ok(layerNames(dxf).includes('ZONES'));
  assert.equal(texts(dxfEntities(drawingDxf({ ...d, showDims: false }, proj)), 'DIMENSIONS').length, 0);
});

test('DXF: break lines, broken-out outline and hatching, hole tags and table, revisions and the sheet name', () => {
  const body = block().cut(R.makeCylinder(4, 40, [30, 10, -10], [0, 0, 1]));
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: ZID, type: ZV, break: { axis: 'x', from: -45, to: -15 } }];
  const raw = new Map([[ZID, projectView(body, ZV, d.views[0])]]);
  const adj = adjustProjections(d, raw);
  d.holeTable = { view: ZID };
  const rows = holeTableRows(findHoles(body), d.views[0], raw.get(ZID).box);
  assert.equal(rows.length, 2);
  addRevision(d, { description: 'FIRST ISSUE', date: '2026-01-01', by: 'SK' });
  const sd = { ...d, revisionsShown: true, sheetCount: 2, sheetIndex: 0, sheetName: 'MAIN' };
  const dxf = sheetDxf(sd, adj, { holeRows: rows, labels: { 'holeTable.title': 'HOLES' } });
  const ents = dxfEntities(dxf);
  assert.equal(ents.filter((e) => e.type === 'LINE' && e.layer === 'BREAKS').length, 2 * 5, 'two zig-zags of five strokes');
  const tbl = texts(ents, 'TABLES');
  for (const s of ['HOLES', 'A1', 'A2', '%%c20', '%%c8', 'REVISIONS', 'FIRST ISSUE', '2026-01-01', 'SK']) assert.ok(tbl.includes(s), `${s} in the tables`);
  assert.equal(tbl.filter((s) => s === 'A1').length, 2, 'A1 as a tag in the view and as a row');
  assert.ok(texts(ents, 'NOTES').some((s) => /1 \/ 2/.test(s) && /MAIN/.test(s)));
  for (const l of ['BREAKS', 'TABLES', 'NOTES']) assert.ok(layerNames(dxf).includes(l), `layer ${l} declared`);
  // Every primitive group the overlay has went in: line count = segments of every polyline.
  const groups = overlayPrimitives(sd, adj, { holeRows: rows });
  const segs = groups.find((g) => g.layer === 'TABLES').prims.filter((p) => p.t === 'poly').reduce((s, p) => s + p.pts.length - 1 + (p.closed ? 1 : 0), 0);
  assert.equal(ents.filter((e) => e.type === 'LINE' && e.layer === 'TABLES').length, segs);
  // Broken-out: the wavy outline (48 strokes, closed) on BREAKS, its hatching on HATCH.
  const d2 = createDrawing({ id: 'd2', name: 'B', source: { kind: 'part', id: 'p' } });
  d2.views = [{ id: ZID, type: ZV, brokenOut: { x0: -45, y0: -10, x1: -20, y1: 10, depth: 10 } }];
  const adj2 = adjustProjections(d2, new Map([[ZID, projectView(body, ZV, d2.views[0])]]), { shape: body, key: 'k', cache: new Map() });
  const e2 = dxfEntities(sheetDxf(d2, adj2, {}));
  assert.equal(e2.filter((e) => e.type === 'LINE' && e.layer === 'BREAKS').length, 48);
  assert.ok(e2.filter((e) => e.layer === 'HATCH').length > 3);
  // A plain sheet gets none of the extra layers.
  assert.ok(!layerNames(sheetDxf(createDrawing({ id: 'd3', name: 'P', source: { kind: 'part', id: 'p' } }), new Map(), {})).includes('BREAKS'));
});

test('centre mark: a small one is one plain cross over its size, a normal one has its dashes beyond the gap', () => {
  const small = annotationPrimitives({ kind: 'centermark', x: 0, y: 0, size: 3 });
  assert.equal(small.length, 2);
  assert.deepEqual(small.map((p) => p.pts), [[[-1.5, 0], [1.5, 0]], [[0, -1.5], [0, 1.5]]]);
  const normal = annotationPrimitives({ kind: 'centermark', x: 0, y: 0, size: 10 });
  assert.equal(normal.length, 6);
  assert.deepEqual(normal[2].pts, [[-5, 0], [-2.5, 0]]);
  assert.equal(annotationPrimitives({ kind: 'centermark', x: 0, y: 0, size: 4 }).length, 6, 'size 4: 1 mm of dash fits');
});

// ───────────────────────── annotation boxes, drag snapping

test('text widths come from the sheet font (Roboto): advance widths and kerning, exact', () => {
  const font = measureFont();
  assert.ok(font, 'the kernel loaded the font');
  assert.equal(font.unitsPerEm, 2048);
  // The same as opentype's own advance-width sum (with kerning) for every text tried.
  for (const [text, size] of [['100', 10], ['Ø20', 3.2], ['50 TL', 3.5], ['AV', 10], ['R3.5', 2.5], ['±0.05', 3.2]]) near(textWidth(text, size), font.getAdvanceWidth(text, size), 1e-12, text);
  near(textWidth('100', 10), 16.8603515625, 1e-12);
  near(textWidth('ABCD', 5), 12.91259765625, 1e-12);
  // Kerning: A and V close up by 87 units.
  near(textWidth('AV', 10), ((1336 + 1304 - 87) / 2048) * 10, 1e-12);
  // Bold: Roboto Bold's own widths.
  const bold = measureFont(true);
  assert.ok(bold && bold !== font, 'Roboto Bold is loaded');
  near(textWidth('100', 10, { bold: true }), 17.2119140625, 1e-12);
  near(textWidth('AB 3.5', 5, { bold: true }), bold.getAdvanceWidth('AB 3.5', 5), 1e-12);
  // Characters Roboto lacks: the Korean font's widths (its file when the system has one, else its table).
  near(textWidth('한글', 3), 6, 1e-12, 'Hangul: one em');
  near(textWidth('A한', 10), font.getAdvanceWidth('A', 10) + 10, 1e-12);
  const cjk = cjkFont();
  if (cjk) near(textWidth('⌒', 10), (cjk.charToGlyph('⌒').advanceWidth / cjk.unitsPerEm) * 10, 1e-12, 'a symbol from the Korean font');
  assert.equal(tableEm('가'), 1); assert.equal(tableEm('ㄱ'), 1); assert.equal(tableEm('漢'), 1); assert.equal(tableEm('⌒'), 0.6);
  const e = textExtent(5); near(e.ascent, (1900 / 2048) * 5, 1e-12); near(e.descent, (500 / 2048) * 5, 1e-12);
});

test('text boxes: anchored and turned texts cover their measured extent', () => {
  const W = textWidth('ABCD', 5); const { ascent, descent } = textExtent(5);
  const b = primsBox([{ t: 'text', x: 10, y: 20, text: 'ABCD', size: 5, anchor: 'middle' }]);
  near(b.x0, 10 - W / 2); near(b.x1, 10 + W / 2); near(b.y0, 20 - ascent); near(b.y1, 20 + descent);
  const wab = textWidth('AB', 5);
  const r = primsBox([{ t: 'text', x: 0, y: 0, text: 'AB', size: 5, rot: -90 }]);
  near(r.x0, -ascent); near(r.x1, descent); near(r.y0, -wab); near(r.y1, 0);
  assert.equal(textCorners({ x: 0, y: 0, text: 'A\nB', size: 2 })[2][1], textExtent(2).descent + 2.5);
  assert.ok(boxesOverlap({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 1, y0: 1, x1: 3, y1: 3 }));
  assert.ok(!boxesOverlap({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 2, y0: 0, x1: 3, y1: 2 }), 'touching is not overlapping');
  assert.ok(boxesOverlap({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 2.5, y0: 0, x1: 3, y1: 2 }, 1), 'within the clearance');
});

test('drag snapping: lines up with another annotation\'s anchor or box edge within tolerance, else the grid', () => {
  const other = { anchor: [50, 40], box: { x0: 40, y0: 36, x1: 60, y1: 41 } };
  // Anchor 1.2 mm right and 0.4 mm below the other's: both axes snap to it.
  const s = snapDrag({ anchor: [51.2, 80.4], box: { x0: 46, y0: 76, x1: 66, y1: 81 } }, [other], { tol: 2 });
  near(s.dx, -1.2, 1e-12); near(s.dy, 0, 1e-12);
  assert.equal(s.guides.length, 1); assert.equal(s.guides[0].axis, 'x'); near(s.guides[0].at, 50);
  near(s.guides[0].from, 36); near(s.guides[0].to, 81);
  // Left edges line up (x0 41 vs 40) when the anchors are far apart; the bottom edge 0.5 above the other's.
  const t = snapDrag({ anchor: [90, 0], box: { x0: 41, y0: 35.5, x1: 50, y1: 40.5 } }, [other], { tol: 2 });
  near(t.dx, -1); near(t.dy, 0.5);
  assert.deepEqual(t.guides.map((g) => g.axis).sort(), ['x', 'y']);
  // Nothing near: the grid (5 mm) takes the anchor.
  const g = snapDrag({ anchor: [123.4, 66.1], box: null }, [other], { tol: 1, grid: 5 });
  near(g.dx, 1.6, 1e-9); near(g.dy, -1.1, 1e-9); assert.equal(g.guides.length, 0);
  const none = snapDrag({ anchor: [123.4, 66.1] }, [], { tol: 1 });
  assert.deepEqual([none.dx, none.dy], [0, 0]);
});

test('separating labels: a pile of identical labels ends up in rows that do not overlap', () => {
  const items = Array.from({ length: 6 }, () => ({ boxAt: (k) => ({ x0: 0, y0: 10 + 4 * k, x1: 12, y1: 13.2 + 4 * k }) }));
  const { steps, boxes } = separateLabels(items, { pad: 0.5 });
  assert.deepEqual(steps, [0, 1, 2, 3, 4, 5]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!boxesOverlap(boxes[i], boxes[j]));
  // An obstacle in the way pushes the first one too.
  const r = separateLabels(items.slice(0, 1), { obstacles: [{ x0: 0, y0: 9, x1: 5, y1: 15 }], pad: 0.5 });
  assert.equal(r.steps[0], 2);
});

test('auto dimensions of a small part: model items whose labels would overlap are laid out clear of each other', () => {
  // A 6 × 4 plate with a Ø1.5 hole, dimensioned by its sketch: the labels are bigger than the part.
  const features = [
    { id: 's1', type: 'sketch', name: 'S1', plane: { kind: 'std', name: 'top' }, entities: [
      { id: 'p1', type: 'point', x: 0, y: 0 }, { id: 'p2', type: 'point', x: 6, y: 0 }, { id: 'p3', type: 'point', x: 6, y: 4 }, { id: 'p4', type: 'point', x: 0, y: 4 },
      { id: 'l1', type: 'line', p1: 'p1', p2: 'p2' }, { id: 'l2', type: 'line', p1: 'p2', p2: 'p3' }, { id: 'l3', type: 'line', p1: 'p3', p2: 'p4' }, { id: 'l4', type: 'line', p1: 'p4', p2: 'p1' },
      { id: 'pc', type: 'point', x: 1.5, y: 2 }, { id: 'c1', type: 'circle', c: 'pc', r: 0.75 },
    ], constraints: [
      { id: 'k1', type: 'distance', a: 'l1', value: 6 }, { id: 'k2', type: 'distance', a: 'l2', value: 4 },
      { id: 'k3', type: 'diameter', a: 'c1', value: 1.5 }, { id: 'k4', type: 'hdistance', a: 'p1', b: 'pc', value: 1.5 }, { id: 'k5', type: 'vdistance', a: 'p1', b: 'pc', value: 2 },
      { id: 'k6', type: 'distance', a: 'l3', value: 6 }, { id: 'k7', type: 'distance', a: 'l4', value: 4 },
    ] },
    { id: 'e1', type: 'extrude', name: 'E1', sketch: 's1', op: 'boss', end: 'blind', depth: 2, reverse: false, end2: 'none', depth2: 1 },
  ];
  const part = { id: 'p', name: 'P', features };
  const built = regenerate(part);
  assert.ok(built.body, 'the plate builds');
  const d = createDrawing({ id: 'd', name: 'S', source: { kind: 'part', id: 'p' } });
  d.scale = 1; d.autoScale = false;
  const proj = new Map(d.views.map((v) => [v.id, projectView(built.body, v.type, v)]));
  const { frames } = viewFrames(d, proj);
  const dims = modelItemDims(part, built.results, d.views).filter((g) => frames.has(g.view)).map((g, i) => { const a = { id: `m${i}`, kind: 'drwDim', ...g }; [a.x, a.y] = autoTextOffset(a, frames.get(g.view)); return a; });
  assert.ok(dims.length >= 6);
  const before = dims.map((a) => dimLabelBox(a, frames.get(a.view)));
  let clashes = 0;
  for (let i = 0; i < before.length; i++) for (let j = i + 1; j < before.length; j++) if (boxesOverlap(before[i], before[j])) clashes++;
  assert.ok(clashes > 0, 'placed one by one, some labels overlap');
  const { dims: laid } = layoutDimLabels(dims, frames);
  const after = laid.map((a) => dimLabelBox(a, frames.get(a.view)));
  for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) assert.ok(!boxesOverlap(after[i], after[j]), `labels ${dimLabel(laid[i])} and ${dimLabel(laid[j])} overlap`);
  // Values are untouched; only the text places moved.
  assert.deepEqual(laid.map(dimLabel), dims.map(dimLabel));
  // Against existing dimensions too.
  const extra = layoutDimLabels([dims[0]], frames, { existing: laid.slice(1) });
  const b0 = dimLabelBox(extra.dims[0], frames.get(dims[0].view));
  for (const a of laid.slice(1)) assert.ok(!boxesOverlap(b0, dimLabelBox(a, frames.get(a.view))));
});

test('annotation boxes and anchors on the sheet: base notes by their (x, y), smart dimensions by their text', () => {
  const body = block();
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  d.views = [{ id: ZID, type: ZV }];
  const proj = new Map([[ZID, projectView(body, ZV, d.views[0])]]);
  const { frames } = viewFrames(d, proj);
  const fr = frames.get(ZID);
  const g = dimensionFromPicks([pickEntity(viewEntities(fr.p), [0, 10.2], 1)]);
  d.annotations = [{ id: 'n1', kind: 'note', x: 30, y: 40, text: 'NOTE', size: 3.5 }, { id: 'dm', kind: 'drwDim', view: ZID, ...g, x: 20, y: -5 }];
  const boxes = annotationBoxes(d, proj);
  const n = boxes.find((b) => b.id === 'n1'); const m = boxes.find((b) => b.id === 'dm');
  assert.deepEqual(n.anchor, [30, 40]); near(n.box.x0, 30); near(n.box.x1, 30 + textWidth('NOTE', 3.5), 1e-12); near(textWidth('NOTE', 3.5), 8.936279296875, 1e-12);
  near(m.anchor[0], fr.place.cx + 20); near(m.anchor[1], fr.place.cy - 5);
  assert.ok(m.box.x1 > m.box.x0);
});

// ───────────────────────── pictorial: arcs, ellipses, curves, silhouettes, sphere outlines

/** Picks the model thing under a 3D point of it in the isometric view of `body` (tries the points given). */
function isoPickAt(body, points3, tol = 0.3) {
  const g = modelGeometry(body);
  const p = projectView(body, 'iso', ISO);
  const ents = viewEntities(p, { hidden: false });
  for (const p3 of points3) {
    const q = P2(p3);
    const pick = pickEntity(ents, q, tol);
    if (!pick) continue;
    const pk = pictorialPick(pick, q, g, isoB, tol);
    if (pk) return { pk, g };
  }
  return { pk: null, g };
}
const ring = (c, u, v, ra, rb, n = 16, t0 = 0.31) => Array.from({ length: n }, (_, k) => { const t = t0 + (k * Math.PI * 2) / n; return [0, 1, 2].map((i) => c[i] + u[i] * ra * Math.cos(t) + v[i] * rb * Math.sin(t)); });

test('pictorial: a fillet arc (an elliptical arc on the sheet) gives its true radius and arc length', () => {
  const body = R.makeBox([0, 0, 0], [40, 30, 20]).fillet(5, (e) => e.inDirection('Z'));
  // The rounded vertical edge nearest the viewer: the fillet arcs on the top face (z = 20).
  const g0 = modelGeometry(body);
  const arcs = g0.circles.filter((c) => Math.abs(c.r - 5) < 1e-9 && Math.abs(c.c[2] - 20) < 1e-9 && !c.full);
  assert.equal(arcs.length, 4, 'four quarter arcs on the top face');
  for (const a of arcs) { near(a.span, Math.PI / 2, 1e-9); near(a.length, 2.5 * Math.PI, 1e-9); }
  const front = arcs.reduce((m, a) => (dot(a.c, isoB.dir) > dot(m.c, isoB.dir) ? a : m), arcs[0]);
  const mid = front.pts[Math.floor(front.pts.length / 2)];
  const { pk } = isoPickAt(body, [mid]);
  assert.equal(pk?.kind, 'circle'); assert.equal(pk.full, false);
  const r = pictorialDimension([pk], 'auto', isoB);
  assert.equal(r.dtype, 'radial'); assert.equal(dimLabel(r), 'R5');
  const len = pictorialDimension([pk], 'arclength', isoB);
  near(dimValue(len), 2.5 * Math.PI, 1e-9);
  assert.equal(dimLabel({ ...len, precision: 3 }), `⌒${(2.5 * Math.PI).toFixed(3)}`);
});

test('pictorial: an elliptical edge (an inclined hole) gives its true major axis', () => {
  const dir = [1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)];
  const body = R.makeBox([0, 0, 0], [40, 40, 40]).cut(R.makeCylinder(5, 80, [20 - dir[0] * 40, 20, 20 - dir[2] * 40], dir));
  const g0 = modelGeometry(body);
  const top = g0.ellipses.find((e) => Math.abs(e.c[2] - 40) < 1e-6);
  assert.ok(top, 'the hole meets the top face in an ellipse');
  near(top.b, 5, 1e-9); near(top.a, 5 * Math.sqrt(5) / 2, 1e-9);
  near(top.c[0], 30, 1e-9); near(top.c[1], 20, 1e-9);
  const v = [top.n[1] * top.u[2] - top.n[2] * top.u[1], top.n[2] * top.u[0] - top.n[0] * top.u[2], top.n[0] * top.u[1] - top.n[1] * top.u[0]];
  const { pk } = isoPickAt(body, ring(top.c, top.u, v, top.a, top.b));
  assert.equal(pk?.kind, 'ellipse');
  const g = pictorialDimension([pk], 'auto', isoB);
  assert.equal(g.dtype, 'aligned');
  near(dimValue(g), 5 * Math.sqrt(5), 1e-9, 'major axis 2a');
  near(dimValue(pictorialDimension([pk], 'radial', isoB)), 5 * Math.sqrt(5) / 2, 1e-9, 'semi-major axis');
  assert.ok(dimValue(pictorialDimension([pk], 'arclength', isoB)) > 2 * Math.PI * 5, 'the ellipse is longer round than the hole');
});

test('pictorial: a spline edge gives the true distance between its ends and its length along it', () => {
  const body = R.draw([0, 0]).hLine(40).smoothSplineTo([0, 30]).close().sketchOnPlane('XY').extrude(10);
  const g0 = modelGeometry(body);
  const curve = g0.curves.find((c) => Math.abs(c.a[2] - 10) < 1e-9 && Math.abs(c.b[2] - 10) < 1e-9);
  assert.ok(curve, 'the spline at the top');
  const kernelLen = body.edges.filter((e) => e.geomType !== 'LINE').map((e) => e.length).find((l) => Math.abs(l - curve.length) < 1e-9);
  assert.ok(kernelLen > 50, 'longer than its chord');
  const { pk } = isoPickAt(body, [curve.pts[10], curve.pts[16], curve.pts[22]]);
  assert.equal(pk?.kind, 'curve');
  near(dimValue(pictorialDimension([pk], 'auto', isoB)), 50, 1e-9, 'chord (40, 0) – (0, 30)');
  near(dimValue(pictorialDimension([pk], 'arclength', isoB)), kernelLen, 1e-9);
});

test('pictorial: a cylinder\'s silhouette lines give its true length and, two of them or as a diameter, Ø20', () => {
  const body = R.makeCylinder(10, 60, [0, 0, 0], [1, 0, 0]);
  const g0 = modelGeometry(body);
  assert.equal(g0.cylinders.length, 1); near(g0.cylinders[0].r, 10); near(g0.cylinders[0].hi - g0.cylinders[0].lo, 60, 1e-9);
  const s = [0, isoB.dir[2], -isoB.dir[1]]; const sl = Math.hypot(...s); const su = s.map((x) => x / sl); // axis × view, axis = x
  const picks = [1, -1].map((side) => isoPickAt(body, [[30, su[1] * 10 * side, su[2] * 10 * side], [20, su[1] * 10 * side, su[2] * 10 * side]]).pk);
  for (const pk of picks) { assert.equal(pk?.kind, 'line'); assert.ok(pk.silhouette, 'a silhouette, not a model edge'); }
  const len = pictorialDimension([picks[0]], 'auto', isoB);
  near(dimValue(len), 60, 1e-9); assert.equal(dimLabel(len), '60 TL');
  assert.equal(dimLabel(pictorialDimension([picks[0]], 'diameter', isoB)), 'Ø20');
  near(dimValue(pictorialDimension(picks, 'auto', isoB)), 20, 1e-9, 'between the two silhouettes');
});

test('pictorial: a sphere\'s outline is a circle of its true diameter', () => {
  // A ball with a flat cut underneath (a bare sphere has no edges to project).
  const body = R.makeSphere(12).cut(R.makeBox([-20, -20, -20], [20, 20, -6]));
  const c = [0, 0, 0];
  const pts = ring(c, isoB.x, isoB.y, 12, 12, 12);
  const { pk } = isoPickAt(body, pts);
  assert.equal(pk?.kind, 'circle'); assert.equal(pk.outline, 'sphere');
  assert.equal(dimLabel(pictorialDimension([pk], 'auto', isoB)), 'Ø24');
});

test('arc length in an orthographic view: the hole\'s circumference, a quarter fillet', () => {
  const body = block();
  const p = projectView(body, ZV, { id: ZID, type: ZV });
  const hole = pickEntity(viewEntities(p), [0, 10.05], 0.5);
  const g = dimensionFromPicks([hole], 'arclength');
  near(dimValue(g), 20 * Math.PI, 1e-9);
  assert.equal(dimLabel({ ...g, precision: 2 }), `⌒${(20 * Math.PI).toFixed(2)}`);
  assert.equal(dimensionFromPicks([pickEntity(viewEntities(p), [-50, 0], 0.5)], 'arclength').error, 'needCurve');
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } }); d.views = [{ id: ZID, type: ZV }];
  const { frames } = viewFrames(d, new Map([[ZID, p]]));
  const a = { kind: 'drwDim', view: ZID, ...g }; [a.x, a.y] = autoTextOffset(a, frames.get(ZID));
  const prims = dimPrimitives(a, frames.get(ZID));
  const tip = prims.find((q) => q.t === 'fill').pts[0]; const m = frames.get(ZID).fromSheet(...tip);
  near(Math.hypot(m[0], m[1]), 10, 1e-6, 'the arrow is on the circle');
});

// ───────────────────────── opening older files: dimensions of broken views

test('opening an older drawing: dimensions picked in a broken view move to true coordinates, once', () => {
  const body = block();
  const view = { id: ZID, type: ZV, break: { axis: 'x', from: -40, to: -15 } };
  const raw = projectView(body, ZV, view);
  const adjOf = (d) => adjustProjections(d, new Map([[ZID, raw]]));
  // As the old module saved it: the points where they were picked in the shortened view.
  const probe = { id: 'd', name: 'B', source: { kind: 'part', id: 'p' }, views: [view] };
  const shortened = adjOf(probe).get(ZID);
  const shift = -15 - -40 - shortened.breaks[0].gap;
  const lo = -50;
  const oldDim = { id: 'dm', kind: 'drwDim', view: ZID, dtype: 'horizontal', p1: [lo, -25], p2: [50 - shift, -25], x: 0, y: 20 };
  const oldHole = { id: 'dh', kind: 'drwDim', view: ZID, dtype: 'diameter', c: [-shift, 0], r: 10, full: true, x: 15, y: -15 };
  const model = { id: 'mi', kind: 'drwDim', view: ZID, dtype: 'horizontal', p1: [lo, 25], p2: [50, 25], model: true, x: 0, y: -20 };
  const file = { format: 'mymechanics', name: 'Old', parts: [], assemblies: [], up: 'z', drawings: [{ ...createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } }), views: [view], annotations: [oldDim, oldHole, model] }] };
  delete file.drawings[0].dimCoords; // saved before dimension coordinates were versioned
  near(dimValue(oldDim), 100 - shift, 1e-9, 'the old file read the shortened length');
  const p = normalizeProject(JSON.parse(JSON.stringify(file)));
  const d = p.drawings[0];
  assert.equal(d.dimCoords, DIM_COORDS);
  assert.deepEqual(d.annotations.map((a) => Boolean(a.legacyBroken)), [true, true, false], 'model items were true already');
  // Where the sheet is first drawn, they are converted: true values, same places on the sheet.
  const adj = adjOf(d);
  const before = viewFrames(d, adj).frames.get(ZID);
  const sheetAt = before.place.cx + (oldDim.p2[0] - before.cx) * before.s;
  drwItems(d, adj);
  const [dm, dh, mi] = d.annotations;
  assert.ok(!dm.legacyBroken && !dh.legacyBroken);
  near(dimValue(dm), 100, 1e-9, 'overall length across the break');
  near(dm.p2[0], 50, 1e-9); near(dh.c[0], 0, 1e-9); near(dimValue(dh), 20, 1e-9);
  assert.deepEqual(mi.p2, [50, 25], 'untouched');
  near(before.toSheet(...dm.p2)[0], sheetAt, 1e-9, 'drawn where it was');
  // Saved and opened again: nothing moves twice.
  const again = normalizeProject(JSON.parse(JSON.stringify(p))).drawings[0];
  assert.ok(again.annotations.every((a) => !a.legacyBroken));
  drwItems(again, adjOf(again));
  near(again.annotations[0].p2[0], 50, 1e-9);
  // New drawings are in true coordinates from the start; a drawing without broken views marks nothing.
  assert.equal(createDrawing({ id: 'n', name: 'N', source: null }).dimCoords, DIM_COORDS);
  const plain = { views: [{ id: 'v', type: 'front' }], annotations: [{ kind: 'drwDim', view: 'v', dtype: 'aligned', p1: [0, 0], p2: [1, 0] }] };
  assert.equal(migrateDrawingDims(plain), 0); assert.equal(plain.dimCoords, DIM_COORDS);
  assert.equal(migrateDrawingDims(plain), 0);
});

test('exported SVG embeds Roboto Regular and Bold, the very font files the text is measured with', () => {
  const css = fontFaceCss();
  const faces = [...css.matchAll(/@font-face\{font-family:'Roboto';font-style:normal;font-weight:(\d+);src:url\(data:font\/woff;base64,([A-Za-z0-9+/=]+)\)/g)];
  assert.deepEqual(faces.map((m) => m[1]), ['400', '700']);
  for (const [, w, b64] of faces) assert.ok(Buffer.from(b64, 'base64').equals(readFileSync(new URL(`../../node_modules/@fontsource/roboto/files/roboto-latin-${w}-normal.woff`, import.meta.url))), `weight ${w}`);
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } });
  const svg = embedFonts(drawingSvg(d, new Map()));
  assert.match(svg, /^<svg[^>]*>\n {2}<style>@font-face/);
  assert.ok(svg.includes(DRAWING_FONT.split(',')[0]));
  assert.ok(drawingSvg(d, new Map()).includes('Roboto,"Malgun Gothic"'), 'the sheet names Roboto, then the Korean fonts');
});

test('pictorial: a cone\'s silhouettes (drawn outlines, no model edges) give its slant length, wide diameter and their true angle', () => {
  // A frustum about z: radius 10 at z = 0 to 4 at z = 30 (apex at z = 50).
  const body = R.draw([0, 0]).hLine(10).lineTo([4, 30]).hLine(-4).close().sketchOnPlane('XZ').revolve();
  near(R.measureVolume(body), (Math.PI * 30 / 3) * (100 + 40 + 16), 1e-6);
  const g0 = modelGeometry(body);
  assert.equal(g0.cones.length, 1);
  const co = g0.cones[0];
  near(co.apex[2], 50, 1e-9); near(Math.hypot(co.apex[0], co.apex[1]), 0, 1e-9); near(co.dir[2], -1, 1e-12);
  near(Math.tan(co.alpha), 0.2, 1e-12); near(co.lo, 20, 1e-9); near(co.hi, 50, 1e-9);
  const sils = silhouetteLines(g0, isoB);
  assert.equal(sils.length, 2);
  for (const sl of sils) {
    // On the surface: each end at its height's radius; the surface there turns away from the viewer.
    for (const p of [sl.a3, sl.b3]) near(Math.hypot(p[0], p[1]), 10 - 0.2 * p[2], 1e-9);
    const mid = sl.a3.map((v, i) => (v + sl.b3[i]) / 2);
    const radial = [mid[0], mid[1], 0].map((v) => v / Math.hypot(mid[0], mid[1]));
    const n = [radial[0] * 30, radial[1] * 30, 6]; // outward normal of the cone (∝ r' and dz)
    near(dot(n, isoB.dir), 0, 1e-9);
  }
  const picks = sils.map((sl) => isoPickAt(body, [0.5, 0.35, 0.65].map((t) => sl.a3.map((v, i) => v + (sl.b3[i] - v) * t))).pk);
  for (const pk of picks) { assert.equal(pk?.kind, 'line', 'the outline is drawn there'); assert.equal(pk.silhouette?.kind, 'cone'); }
  near(dimValue(pictorialDimension([picks[0]], 'auto', isoB)), Math.hypot(30, 6), 1e-9, 'slant length');
  assert.equal(dimLabel(pictorialDimension([picks[0]], 'diameter', isoB)), 'Ø20');
  const ang = pictorialDimension(picks, 'auto', isoB);
  assert.equal(ang.dtype, 'angular');
  near(dimValue(ang), angle3(sils[0].b3, co.apex, sils[1].b3), 1e-9, 'the true angle at the apex');
});

test('pictorial: the diameter of a partial arc has its far arrow at the opposite point of the full circle', () => {
  const body = R.makeBox([0, 0, 0], [40, 30, 20]).fillet(5, (e) => e.inDirection('Z'));
  const arcs = modelGeometry(body).circles.filter((c) => Math.abs(c.r - 5) < 1e-9 && Math.abs(c.c[2] - 20) < 1e-9);
  const arc = arcs.reduce((m, a) => (dot(a.c, isoB.dir) > dot(m.c, isoB.dir) ? a : m), arcs[0]);
  const { pk } = isoPickAt(body, [arc.pts[12]]);
  const g = pictorialDimension([pk], 'diameter', isoB);
  assert.equal(dimLabel(g), 'Ø10');
  const d = createDrawing({ id: 'd', name: 'B', source: { kind: 'part', id: 'p' } }); d.views = [ISO];
  const { frames } = viewFrames(d, new Map([['v-iso', projectView(body, 'iso', ISO)]]));
  const fr = frames.get('v-iso');
  const a = { kind: 'drwDim', view: 'v-iso', ...g }; [a.x, a.y] = autoTextOffset(a, fr);
  const tips = dimPrimitives(a, fr).filter((p) => p.t === 'fill').map((p) => p.pts[0]);
  assert.equal(tips.length, 2);
  // Back on the arc's plane (z = 20): both on the circle, through the centre from each other.
  const on = tips.map((t) => { const X = fr.fromSheet(...t); const base = [0, 1, 2].map((i) => isoB.x[i] * X[0] + isoB.y[i] * X[1]); const k = (20 - base[2]) / isoB.dir[2]; return base.map((v, i) => v + isoB.dir[i] * k); });
  for (const p of on) near(Math.hypot(p[0] - arc.c[0], p[1] - arc.c[1]), 5, 1e-6, 'on the circle');
  near((on[0][0] + on[1][0]) / 2, arc.c[0], 1e-6); near((on[0][1] + on[1][1]) / 2, arc.c[1], 1e-6);
  // The first tip is on the arc itself.
  const ang = Math.atan2(on[0][1] - arc.c[1], on[0][0] - arc.c[0]);
  assert.ok(arc.pts.some((p) => Math.abs(Math.atan2(p[1] - arc.c[1], p[0] - arc.c[0]) - ang) < 0.15), 'first arrow on the arc');
});

test('a bare sphere: its outline circle is drawn in every view and dimensioned Ø24', () => {
  const body = R.makeSphere(12);
  for (const type of ['front', 'top', 'iso', 'dimetric']) {
    const p = projectView(body, type, { id: 'v', type });
    near(p.box.x1 - p.box.x0, 24, 1e-9, type); near(p.box.y1 - p.box.y0, 24, 1e-9, type);
    const ents = viewEntities(p);
    assert.ok(ents.some((e) => e.t === 'arc' && Math.abs(e.r - 12) < 1e-9 && Math.abs(Math.abs(e.sweep) - Math.PI * 2) < 1e-6), `${type}: one full circle`);
  }
  const p = projectView(body, 'iso', ISO);
  const pick = pickEntity(viewEntities(p), [12.1, 0], 0.5);
  assert.equal(pick.kind, 'arc');
  const pk = pictorialPick(pick, [12.1, 0], modelGeometry(body), isoB, 0.5);
  assert.equal(pk?.outline, 'sphere');
  assert.equal(dimLabel(pictorialDimension([pk], 'auto', isoB)), 'Ø24');
  const front = projectView(body, 'front', { id: 'f', type: 'front' });
  assert.equal(dimLabel(dimensionFromPicks([pickEntity(viewEntities(front), [0, 12], 0.5)])), 'Ø24');
});
