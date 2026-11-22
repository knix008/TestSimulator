// Harness parts library and the harness drawing sheet: connector housing dimensions (cavities, latch, coupling
// ring) and their exact solid volumes, clip envelopes, parts placed on the harness, the flattened harness on a
// drawing sheet with the wire list and connector tables as drawing tables (SVG and DXF through the drawing code).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { connectorDims, clipDims, connectorLocal, clipLocal, orientFrame, CONNECTOR_TYPES } from '../../src/cad/harness-parts.js';
import { harnessModel, harnessFlat, harnessBom, harnessSolid } from '../../src/cad/harness.js';
import { harnessSheet, harnessPrimitives, harnessToSheet, HARNESS_SCALES } from '../../src/cad/harness-sheet.js';
import { createDrawing, SHEETS } from '../../src/cad/drawing.js';
import { drwItems, drwSvg, drwDxf } from '../../src/cad/drawing-annot.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

test('rectangular housings: size from pitch, rows and walls; cavities on the pitch grid; exact volume', () => {
  const d = connectorDims('rect25', 6);
  assert.deepEqual([d.rows, d.cols, d.w, d.h, d.depth], [1, 6, 6 * 2.5 + 4, 2.5 + 4, 16]);
  assert.deepEqual(d.cavities.map((c) => c[0]), [-6.25, -3.75, -1.25, 1.25, 3.75, 6.25]);
  const big = connectorDims('rect25', 12);
  assert.deepEqual([big.rows, big.cols, big.w, big.h], [2, 6, 19, 9]);
  assert.deepEqual(big.cavities[0], [-6.25, 1.25]);
  const dual = connectorDims('rect30', 5);
  assert.deepEqual([dual.rows, dual.cols], [2, 3]);
  near(dual.w, 3 * 3 + 4.4); near(dual.h, 2 * 3 + 4.4);
  for (const [type, pins] of [['rect25', 4], ['rect30', 6], ['round', 7], ['round', 1]]) {
    const dims = connectorDims(type, pins);
    near(V(connectorLocal(dims)), dims.volume, 1e-6);
  }
  const T = CONNECTOR_TYPES.rect25;
  near(d.volume, d.w * d.h * 16 - 6 * T.cavity ** 2 * T.cavityDepth + 4 * 6 * 1.5);
});

test('circular housing: contacts on a pitch circle (adjacent ones one pitch apart), coupling ring', () => {
  const d = connectorDims('round', 6);
  near(d.pitchRadius, 2.5);
  const [a, b] = d.cavities;
  near(Math.hypot(a[0] - b[0], a[1] - b[1]), 2.5);
  near(d.D, 2 * (2.5 + 0.6 + 2.5));
  assert.deepEqual(connectorDims('round', 1).cavities, [[0, 0]]);
});

test('clips: envelopes round the bundle (P-clip tab, tie-mount base), solids inside them', () => {
  const p = clipDims('pClip', 8);
  assert.deepEqual(p.box, [[-5.2, -5.2, -6], [18, 5.2, 6]]);
  const t = clipDims('tieMount', 8);
  assert.deepEqual(t.box, [[-10, -6, -10], [10, 5, 10]]);
  for (const k of ['pClip', 'tieMount', 'band']) {
    const dims = clipDims(k, 8);
    const s = clipLocal(dims);
    const [lo, hi] = s.boundingBox.bounds;
    for (let i = 0; i < 3; i++) { assert.ok(lo[i] >= dims.box[0][i] - 1e-3 && hi[i] <= dims.box[1][i] + 1e-3, `${k} axis ${i}: ${lo[i]}..${hi[i]}`); }
    near(hi[0], dims.box[1][0], 1e-3);
    assert.ok(V(s) > 0);
  }
  // A band of the bore: exactly the ring.
  near(V(clipLocal(clipDims('band', 8))), Math.PI * (5.5 ** 2 - 16) * 6, 1e-6);
});

test('orientation: +Z along the bundle, +Y toward the up direction', () => {
  const s = orientFrame(R.makeBox([-1, 0, 0], [1, 5, 10]), [1, 0, 0], [0, 0, 1], [100, 0, 0]);
  const [lo, hi] = s.boundingBox.bounds;
  near(lo[0], 100, 1e-6); near(hi[0], 110, 1e-6); near(lo[2], 0, 1e-6); near(hi[2], 5, 1e-6);
});

const H = () => ({
  kind: 'harness', bendRadius: 10, diameter: 4, points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]], branches: [{ points: [[50, 0, 0], [50, -80, 0]] }],
  connectors: [{ name: 'J1', at: [0, 0, 0], pins: 2, type: 'rect25' }, { name: 'J2', at: [100, 100, 0], pins: 2, type: 'round' }, { name: 'J3', at: [50, -80, 0], pins: 2, type: 'rect30' }],
  clips: [{ name: 'C1', at: [25, 0, 0], type: 'tieMount' }, { name: 'C2', at: [100, 50, 0], type: 'pClip' }],
  wires: [{ name: 'W1', from: 'J1', fromPin: 1, to: 'J2', toPin: 1, color: 'RD', gauge: 0.5 }, { name: 'W2', from: 'J1', fromPin: 2, to: 'J3', toPin: 1, color: 'BK', gauge: 1.5 }, { name: 'W3', from: 'J2', fromPin: 2, to: 'J3', toPin: 2, color: 'BU', gauge: 0.35 }],
});

test('the harness uses the library: housings by type in the solid and the BOM', () => {
  const m = harnessModel(H());
  const bom = harnessBom(m);
  assert.deepEqual(bom.rows.filter((r) => r.item === 'connector').map((r) => [r.type, r.size]), [['rect25', '2P 9×6.5×16'], ['round', '2P Ø8.7×20'], ['rect30', '2P 7.4×10.4×18']]);
  assert.deepEqual(bom.rows.filter((r) => r.item === 'clip').map((r) => r.type), ['tieMount', 'pClip']);
  const s = harnessSolid(H());
  const housings = ['rect25', 'round', 'rect30'].reduce((sum, k) => sum + connectorDims(k, 2).volume, 0);
  assert.ok(V(s.shape) > housings);
  // J1's housing sits beyond the bundle end, facing away (−X).
  const [lo] = s.shape.boundingBox.bounds;
  near(lo[0], -16, 1e-3);
});

test('harness drawing sheet: the layout at a standard scale above the tables, all drawn by the drawing code', () => {
  const flat = harnessFlat(harnessModel(H()));
  const [W, Hs] = SHEETS.A3;
  let n = 0;
  const sheet = harnessSheet(flat, { W, H: Hs, ids: (k) => `${k}-${n++}`, title: 'Flat' });
  assert.ok(HARNESS_SCALES.includes(sheet.scale));
  assert.equal(sheet.scale, 1, 'a 270 mm harness fits an A3 sheet at 1:1');
  const [flatAnn, wires, ...conns] = sheet.annotations;
  assert.equal(flatAnn.kind, 'drwHarness');
  assert.equal(wires.kind, 'drwTable');
  assert.deepEqual(wires.cells[0].slice(0, 3), ['Wire', 'From', 'To']);
  assert.deepEqual(wires.cells.slice(1).map((r) => r[0]), ['W1', 'W2', 'W3']);
  assert.equal(wires.cells[2][5], '130');
  assert.deepEqual(conns.map((c) => c.title), ['J1', 'J2', 'J3']);
  assert.deepEqual(conns[2].cells[1], ['1', 'W2', 'BK', '1.5', 'J1:2']);
  // Everything inside the sheet; tables do not overlap each other or the title block (180 × 40 at 10 mm).
  const boxes = sheet.annotations.slice(1).map((t) => [t.x, t.y, t.x + t.colW.reduce((s, w) => s + w, 0), t.y + 6 + 6 * t.rows]);
  for (const b of boxes) { assert.ok(b[0] >= 0 && b[2] <= W && b[1] >= 0 && b[3] <= Hs, JSON.stringify(b)); assert.ok(!(b[2] > W - 190 && b[3] > Hs - 50), `title block: ${b}`); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i]; const b = boxes[j]; assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `tables ${i} and ${j} overlap`); }
  // The layout keeps true lengths at the scale: each bundle line's sheet length = length × scale.
  const S = harnessToSheet(flatAnn);
  for (const s of flat.segments) { const [p, q] = s.points.map(S); near(Math.hypot(q[0] - p[0], q[1] - p[1]), s.length * sheet.scale, 1e-9); }
  const prims = harnessPrimitives(flatAnn);
  assert.deepEqual(prims.filter((p) => p.kind === 'length').map((p) => Math.round(p.value * 1000)).sort((a, b) => a - b), flat.segments.map((s) => Math.round(s.length * 1000)).sort((a, b) => a - b));
  const layoutTop = Math.max(...flat.segments.flatMap((s) => s.points.map((p) => S(p)[1])));
  assert.ok(layoutTop < Math.min(...boxes.map((b) => b[1])), 'the layout is above the tables');
  // On a drawing: the drawing module draws the annotation and the tables in SVG and DXF.
  const d = createDrawing({ id: 'd1', name: 'H', source: { kind: 'part', id: 'p' } });
  d.views = [];
  d.annotations.push(...sheet.annotations);
  const items = drwItems(d, []).items;
  assert.deepEqual(items.map((i) => i.a.kind), ['drwHarness', 'drwTable', 'drwTable', 'drwTable', 'drwTable']);
  assert.ok(items[0].prims.length > 10);
  const svg = drwSvg(d, []);
  for (const a of sheet.annotations) assert.ok(svg.includes(`data-annotation="${a.id}"`), a.id);
  assert.ok(svg.includes('>W2<') && svg.includes('>J1:2<'));
  const dxf = drwDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n', d, []);
  assert.ok(/\nHARNESS\n/.test(dxf) && /\nTABLES\n/.test(dxf));
  assert.ok(dxf.includes('\nW3\n'));
});

test('associative harness sheet: the key follows the harness, an update keeps the tables where they were put', async () => {
  const { harnessKey, applyHarnessSheet, transformFlat, harnessSheetOptions } = await import('../../src/cad/harness-sheet.js');
  const f = H();
  const k0 = harnessKey(f);
  assert.equal(harnessKey(JSON.parse(JSON.stringify(f))), k0);
  const g = JSON.parse(JSON.stringify(f)); g.wires[0].gauge = 1.5;
  assert.notEqual(harnessKey(g), k0);
  // Build, move a table, change the harness, update: the table keeps its place and id, its contents change.
  const d = createDrawing({ id: 'd2', name: 'H', source: { kind: 'part', id: 'p' } });
  d.views = [];
  let n = 0; const ids = () => `a${n++}`;
  const ann = { id: 'h1', kind: 'drwHarness', opts: harnessSheetOptions() };
  d.annotations.push(ann);
  applyHarnessSheet(d, ann, harnessSheet(harnessFlat(harnessModel(f)), { ids }), { source: { part: 'p', feature: 'r' }, key: k0 });
  const wires = d.annotations.find((x) => x.role === 'wires');
  wires.x = 33; wires.y = 44;
  applyHarnessSheet(d, ann, harnessSheet(harnessFlat(harnessModel(g)), { ids }), { key: harnessKey(g) });
  const w2 = d.annotations.find((x) => x.role === 'wires');
  assert.deepEqual([w2.id, w2.x, w2.y], [wires.id, 33, 44]);
  assert.equal(w2.cells[1][4], '1.5');
  assert.equal(d.annotations.filter((x) => x.kind === 'drwTable').length, 4, 'tables replaced, not added');
  assert.equal(ann.key, harnessKey(g)); assert.equal(ann.stale, false);
  // Out of date: a marked note on the sheet.
  ann.stale = true; ann.staleText = 'OUT OF DATE';
  assert.ok(harnessPrimitives(ann).some((p) => p.kind === 'stale' && p.text === 'OUT OF DATE'));
  // Orientation keeps the lengths; 90° swaps the extents.
  const flat = harnessFlat(harnessModel(f));
  const r = transformFlat(flat, { rotate: 90 });
  const ext = (fl) => [fl.bounds[1][0] - fl.bounds[0][0], fl.bounds[1][1] - fl.bounds[0][1]];
  near(ext(r)[0], ext(flat)[1], 1e-9); near(ext(r)[1], ext(flat)[0], 1e-9);
  for (const [i, s] of r.segments.entries()) near(Math.hypot(s.points[1][0] - s.points[0][0], s.points[1][1] - s.points[0][1]), flat.segments[i].length, 1e-9);
  const m = transformFlat(flat, { mirror: true });
  near(m.bounds[1][1], -flat.bounds[0][1], 1e-9);
  // Options: a fixed scale, tables switched off, the row height.
  const s2 = harnessSheet(flat, { ids, opts: { scale: 0.5, showConnectors: false, rowH: 8 } });
  assert.equal(s2.scale, 0.5);
  assert.deepEqual(s2.annotations.map((x) => x.kind), ['drwHarness', 'drwTable']);
  assert.equal(s2.annotations[1].rowH, 8);
  assert.equal(harnessSheet(flat, { ids, opts: { showWires: false, showConnectors: false } }).annotations.length, 1);
});

test('every route and harness text has Korean and English', async () => {
  const { DICTIONARIES } = await import('../../src/i18n.js');
  const { CONNECTOR_TYPE_IDS, CLIP_TYPE_IDS } = await import('../../src/cad/harness-parts.js');
  const { WIRE_COLOURS } = await import('../../src/cad/harness.js');
  const keys = [
    ...['pipe', 'tube', 'cable', 'elbow', 'elbowCut', 'bend', 'flange', 'tee', 'reducingTee', 'cross', 'reducingCross', 'lateral', 'reducingElbow', 'reducer', 'tubeReducer', 'saddle', 'trueY', 'wye', 'wire', 'connector', 'clip'].map((k) => `route.bom.${k}`),
    ...['cut-elbow', 'lateral', 'wye'].map((k) => `route.note.${k}`),
    ...CONNECTOR_TYPE_IDS.map((k) => `harness.conn.${k}`), ...CLIP_TYPE_IDS.map((k) => `harness.clip.${k}`),
    ...Object.keys(WIRE_COLOURS).map((k) => `harness.colour.${k}`), ...['current', 'stale', 'missing'].map((k) => `harness.status.${k}`),
    ...['branch-not-attached', 'point-off-route', 'route-loop', 'no-standard-reducer', 'tee-no-run', 'tee-angle', 'tube-tee-sizes', 'tee-outlet-larger', 'no-standard-tee', 'junction-degree', 'connector-name', 'connector-shared', 'wire-connector', 'wire-pin', 'pin-used', 'wire-clip', 'wire-no-path', 'harness-loop', 'cross-angle', 'reducer-at-bend'].map((k) => `rebuild.${k}`),
    'cmd.harnessRoute', 'cmd.harnessDrawing', 'route.harness', 'ann.drwHarness', 'pm.help.harnessSheet',
  ];
  const { ko, en } = DICTIONARIES;
  assert.deepEqual(keys.filter((k) => !ko[k] || !en[k]), []);
});
