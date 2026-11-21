// Model-based definition (src/cad/mbd.js): 3D dimensions with tolerances, GD&T frames, datums and notes on
// faces / edges, refreshed after a rebuild, the auto dimension scheme of a prismatic plate with holes, and the
// copies inserted into a drawing view.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnnotation, editAnnotation, removeAnnotation, resolveAnnotations, measureRefs, dimensionText, annotationText, limitsOf,
  labelHtml, autoDimensionScheme, toDrawingAnnotations, insertIntoDrawing, annotationsOf, GDT_GLYPHS,
} from '../../src/cad/mbd.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const plane = (center, normal, area = 100) => ({ type: 'PLANE', center, normal, area });
const cyl = (point, dir, radius, surfacePoint, normal) => ({ type: 'CYLINDRE', center: point, radius, axis: { point, dir }, point: surfacePoint, normal });
const ref = (info, i) => ({ type: 'face', sig: { ...info, i }, info });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

test('measuring references: parallel faces, plane to axis, two axes, a hole, an edge', () => {
  near(measureRefs(plane([0, 0, 0], [0, 0, -1]), plane([5, 5, 12], [0, 0, 1])).value, 12);
  assert.equal(measureRefs(plane([0, 0, 0], [0, 0, 1]), plane([0, 0, 5], [1, 0, 0])), null, 'not parallel');
  const hole = cyl([30, 20, 5], [0, 0, 1], 4, [34, 20, 5], [-1, 0, 0]);
  near(measureRefs(plane([0, 10, 5], [-1, 0, 0]), hole).value, 30);
  near(measureRefs(hole).value, 8);
  assert.equal(measureRefs(hole).measure, 'diameter');
  near(measureRefs(hole, cyl([30, 50, 5], [0, 0, 1], 4)).value, 30);
  near(measureRefs({ type: 'LINE', mid: [5, 0, 0], dir: [1, 0, 0], length: 10, start: [0, 0, 0], end: [10, 0, 0] }).value, 10);
  near(measureRefs({ type: 'CIRCLE', mid: [5, 0, 0], length: 2 * Math.PI * 3, start: [3, 0, 0], end: [3, 0, 0] }).value, 6);
});

test('annotations: create, edit tolerances, text, limits, labels, remove', () => {
  const part = { features: [] };
  const top = ref(plane([50, 25, 10], [0, 0, 1], 5000), 1), bottom = ref(plane([50, 25, 0], [0, 0, -1], 5000), 2);
  const d = createAnnotation(part, 'dimension', [bottom, top], { size: 100, label: 'Dim' });
  assert.equal(d.name, 'Dim1');
  near(d.value, 10);
  assert.equal(dimensionText(d), '10');
  editAnnotation(part, d.id, 'tolType', 'symmetric'); editAnnotation(part, d.id, 'plus', '0.05');
  assert.equal(dimensionText(d), '10 ±0.05');
  editAnnotation(part, d.id, 'tolType', 'deviation'); editAnnotation(part, d.id, 'plus', '0.1'); editAnnotation(part, d.id, 'minus', '-0.02');
  assert.equal(dimensionText(d), '10 +0.1/-0.02');
  assert.deepEqual(limitsOf(d), { lower: 9.98, upper: 10.1 });
  const g = createAnnotation(part, 'gdt', [top], { symbol: 'parallelism', tolerance: '0.02', datums: ['A'] });
  assert.equal(annotationText(g), `${GDT_GLYPHS.parallelism} 0.02 | A`);
  const datum = createAnnotation(part, 'datum', [bottom]);
  assert.equal(datum.letter, 'A');
  assert.equal(createAnnotation(part, 'datum', [top]).letter, 'B', 'next free letter');
  const note = createAnnotation(part, 'note', [top], { text: 'Break <sharp> edges' });
  assert.match(labelHtml(note, esc), /&lt;sharp&gt;/);
  assert.match(labelHtml(g, esc), /mbd-frame/);
  assert.equal(annotationsOf(part).length, 5);
  assert.ok(removeAnnotation(part, note.id));
  assert.equal(annotationsOf(part).length, 4);
  editAnnotation(part, g.id, 'datums', 'a, b c d');
  assert.deepEqual(g.datums, ['A', 'B', 'C']);
});

test('after a rebuild the dimension follows its faces; a lost face makes it dangling', () => {
  const part = { features: [] };
  const a = ref(plane([0, 0, 0], [0, 0, -1]), 1), b = ref(plane([0, 0, 10], [0, 0, 1]), 2);
  const d = createAnnotation(part, 'dimension', [a, b]);
  // The part got thicker: the top face moved to z = 14.
  let found = resolveAnnotations(part, (r) => (r.sig.i === 1 ? a.info : plane([0, 0, 14], [0, 0, 1])));
  assert.equal(found, 1);
  near(d.value, 14);
  near(d.at[2], 7);
  found = resolveAnnotations(part, (r) => (r.sig.i === 1 ? a.info : null));
  assert.equal(found, 0);
  assert.equal(d.dangling, true);
});

/** A 100 × 60 × 10 plate (Z up) with four ⌀8 holes at (15, 15), (85, 15), (15, 45), (85, 45) and a ⌀20 bore at the centre. */
function plateModel() {
  const faces = [
    plane([50, 30, 0], [0, 0, -1], 6000), plane([50, 30, 10], [0, 0, 1], 6000),
    plane([50, 0, 5], [0, -1, 0], 1000), plane([50, 60, 5], [0, 1, 0], 1000),
    plane([0, 30, 5], [-1, 0, 0], 600), plane([100, 30, 5], [1, 0, 0], 600),
  ];
  for (const [x, y] of [[15, 15], [85, 15], [15, 45], [85, 45]]) faces.push(cyl([x, y, 5], [0, 0, 1], 4, [x + 4, y, 5], [-1, 0, 0]));
  faces.push(cyl([50, 30, 5], [0, 0, 1], 10, [60, 30, 5], [-1, 0, 0]));
  return { box: [[0, 0, 0], [100, 60, 10]], faces: faces.map((info, i) => ({ type: 'face', sig: { i }, info })) };
}

test('auto dimension scheme of a prismatic plate: datums, sizes, hole sizes and positions, frames', () => {
  const part = { features: [] };
  const added = autoDimensionScheme(part, plateModel());
  const datums = added.filter((a) => a.kind === 'datum').map((a) => a.letter);
  assert.deepEqual(datums, ['A', 'B', 'C']);
  const dims = added.filter((a) => a.kind === 'dimension');
  const values = dims.map((a) => Math.round(a.value * 1000) / 1000);
  for (const v of [100, 60, 10]) assert.ok(values.includes(v), `overall ${v} in ${values}`);
  const holeDims = dims.filter((a) => a.measure === 'diameter');
  assert.deepEqual(holeDims.map((a) => dimensionText(a)).sort(), ['4× ⌀8 +0.1/-0', '⌀20 +0.1/-0'].sort());
  // Positions: x from datum C and y from datum B for each of the 5 holes.
  const positions = dims.filter((a) => a.measure === 'distance' && a.refs.length === 2 && a.refs[1].sig.i >= 6).map((a) => a.value).sort((p, q) => p - q);
  assert.deepEqual(positions, [15, 15, 15, 15, 30, 45, 45, 50, 85, 85]);
  const frames = added.filter((a) => a.kind === 'gdt');
  assert.ok(frames.some((a) => a.symbol === 'flatness'));
  assert.equal(frames.filter((a) => a.symbol === 'position').length, 2);
  assert.deepEqual(frames.find((a) => a.symbol === 'position').datums, ['A', 'B', 'C']);
  // Running it again replaces the earlier automatic annotations (hand-made ones stay).
  createAnnotation(part, 'note', [], { text: 'mine' });
  const again = autoDimensionScheme(part, plateModel());
  assert.equal(annotationsOf(part).length, again.length + 1);
});

test('a boss is not dimensioned as a hole', () => {
  const part = { features: [] };
  const model = { box: [[0, 0, 0], [40, 40, 20]], faces: [plane([20, 20, 0], [0, 0, -1]), cyl([20, 20, 15], [0, 0, 1], 5, [25, 20, 15], [1, 0, 0])].map((info, i) => ({ sig: { i }, info, type: 'face' })) };
  const added = autoDimensionScheme(part, model);
  assert.equal(added.filter((a) => a.measure === 'diameter').length, 0);
});

test('insert model annotations into a drawing view: dimensions, frames, datums with leaders', () => {
  const part = { features: [] };
  const model = plateModel();
  autoDimensionScheme(part, model);
  // Top view (looking down −Z), scale 1, view centre at (150, 100) on the sheet: x right, y down.
  const toSheet = (p) => [150 + (p[0] - 50), 100 - (p[1] - 30)];
  let n = 0;
  const infoOf = (r) => model.faces.find((f) => f.sig.i === r.sig.i)?.info ?? null;
  const list = toDrawingAnnotations(annotationsOf(part), { toSheet, newId: (p) => `${p}${n++}`, infoOf, view: 'v1' });
  // The plate's 10 mm thickness is measured along the line of sight of the top view: left out there.
  const thickness = annotationsOf(part).filter((a) => a.kind === 'dimension' && a.refs.length === 2 && Math.abs(a.value - 10) < 1e-9);
  assert.equal(thickness.length, 1);
  assert.equal(list.length, annotationsOf(part).length - 1);
  assert.ok(!list.some((a) => a.fromModel === thickness[0].id));
  const lin = list.filter((a) => a.kind === 'dimension');
  assert.ok(lin.length >= 2, 'linear dimensions between two references');
  const w = lin.find((a) => a.text.startsWith('100'));
  assert.ok(w, 'the 100 mm overall size');
  near(Math.abs(w.b[0] - w.a[0]), 100, 1e-6);
  assert.ok(list.some((a) => a.kind === 'note' && a.text.includes('⌀8')));
  assert.ok(list.filter((a) => a.kind === 'datum').every((a) => Array.isArray(a.target)));
  assert.ok(list.every((a) => a.fromModel && a.view === 'v1'));
  const drawing = { annotations: [{ id: 'mine', kind: 'note', text: 'keep' }] };
  insertIntoDrawing(drawing, list);
  insertIntoDrawing(drawing, list);
  assert.equal(drawing.annotations.length, list.length + 1, 'inserting again replaces the earlier copies');
});
