// Drawing views and annotations, one behaviour per test: every standard view type, section / detail / auxiliary
// views, crop / break / broken-out section, every annotation kind (and every GD&T symbol), the bill of materials,
// the hole table, the revision table and sheets — each checked in the SVG and / or DXF output with its numbers.
// View sizes are checked as sets of the box's dimensions (not which world axis a view looks along).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  SHEETS, STANDARD_SCALES, VIEW_TYPES, VIEW_KINDS, VIEW_CAMERAS, scaleLabel, createDrawing, viewBasis, projectView, projectionKey, projectDrawing,
  sectionShape, layoutViews, ANNOTATION_KINDS, GDT_SYMBOLS, GDT_GROUPS, annotationPrimitives, annotationSvg, bomRows, BOM_COLUMNS, bomPlacement, bomSvg,
  drawingSvg, drawingDxf,
} from '../../src/cad/drawing.js';
import {
  DEFAULT_SHEET, sheetsOf, activeSheetId, adoptToActiveSheet, sheetDrawing, addSheet, renameSheet, setActiveSheet, deleteSheet, cropRect, cropProjection,
  breakSpan, defaultBreak, breakProjection, brokenOutRegion, adjustProjections, findHoles, holeTableRows, nextRevision, addRevision, removeRevision,
  overlaySvg, sheetSvg, sheetDxf,
} from '../../src/cad/drawing-more.js';

await loadKernel();
const R = rep();
const near = (a, b, tol = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= tol, `${what} ${a} ≉ ${b}`);
const count = (s, re) => (s.match(re) ?? []).length;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function assertWellFormed(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0; let m;
  while ((m = re.exec(xml))) {
    const between = xml.slice(last, m.index);
    assert.ok(!between.includes('<'), `stray '<' near …${between.slice(-60)}`);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(between), `bare '&' near …${between.slice(-60)}`);
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `</${name}> closes the wrong tag`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
}
/** DXF entities: [{ type, layer, codes: Map code → [values] }]. */
function dxfEntities(dxf) {
  const lines = dxf.replace(/\n$/, '').split('\n');
  const start = lines.findIndex((l, i) => l === 'ENTITIES' && lines[i - 1] === '2');
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
const dxfTexts = (dxf) => dxfEntities(dxf).filter((e) => e.type === 'TEXT').map((e) => e.codes.get(1)[0]);
const svgTexts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

/** A synthetic projection w × h (model units), one visible outline and one hidden line. */
const fake = (w, h) => ({ visible: [`M 0 0 L ${w} 0 L ${w} ${-h} L 0 ${-h} Z`], hidden: [`M 0 ${-h / 2} L ${w} ${-h / 2}`], box: { x0: 0, y0: 0, x1: w, y1: h } });
const drawing = (extra = {}) => ({ ...createDrawing({ id: 'd', name: 'Drawing', source: { kind: 'part', id: 'p' }, title: { date: '2026-01-01' } }), ...extra });
const fakeAll = (d, w = 60, h = 40) => new Map(d.views.map((v) => [v.id, fake(w, h)]));

// A 30 × 20 × 10 box: every standard view sees two of its three sizes.
const DIMS = [30, 20, 10];
const box = R.makeBox([0, 0, 0], DIMS);
const boxViews = new Map(VIEW_TYPES.map((t) => [t, projectView(box, t)]));
const sizeOf = (p) => [p.box.x1 - p.box.x0, p.box.y1 - p.box.y0];
const sorted = (a) => [...a].sort((x, y) => x - y);

// ───────────────────────── standard views

for (const type of VIEW_TYPES.filter((t) => t !== 'iso' && t !== 'dimetric')) {
  test(`view ${type}: a box projects to two of its three sizes`, () => {
    const [w, h] = sizeOf(boxViews.get(type));
    const match = (v) => DIMS.some((d) => Math.abs(d - v) < 1e-3);
    assert.ok(match(w) && match(h) && Math.abs(w - h) > 1e-3, `${w} × ${h}`);
  });
  test(`view ${type}: the outline is drawn as visible lines on the sheet and on the VISIBLE layer`, () => {
    const d = drawing({ views: [{ id: 'v', type }] });
    const projections = new Map([['v', boxViews.get(type)]]);
    assert.ok(count(drawingSvg(d, projections), /class="visible-line"/g) >= 1);
    assert.ok(dxfEntities(drawingDxf(d, projections)).filter((e) => e.type === 'LINE' && e.layer === 'VISIBLE').length >= 4);
  });
  test(`view ${type}: overall dimensions read the true width and height`, () => {
    const d = drawing({ views: [{ id: 'v', type }] });
    const p = boxViews.get(type);
    const texts = [...drawingSvg(d, new Map([['v', p]])).matchAll(/class="dim-text"[^>]*>([^<]*)</g)].map((m) => Number(m[1]));
    assert.deepEqual(sorted(texts), sorted(sizeOf(p).map((v) => Math.round(v * 100) / 100)));
  });
  test(`view ${type}: labelled with the UI text view.${type}`, () => {
    const d = drawing({ views: [{ id: 'v', type }] });
    assert.ok(drawingSvg(d, new Map([['v', boxViews.get(type)]]), { labels: { [`view.${type}`]: `LBL-${type}` } }).includes(`>LBL-${type}<`));
  });
}
for (const [a, b] of [['front', 'back'], ['top', 'bottom'], ['right', 'left']]) {
  test(`views ${a} and ${b} look along opposite directions and have the same size`, () => {
    nearV(VIEW_CAMERAS[a].dir.map((x) => -x), VIEW_CAMERAS[b].dir);
    nearV(sorted(sizeOf(boxViews.get(a))), sorted(sizeOf(boxViews.get(b))), 1e-3);
  });
}
function nearV(a, b, tol = 1e-9) { assert.equal(a.length, b.length); a.forEach((v, i) => near(v, b[i], tol)); }
test('views front, top and right together see every size of the box twice', () => {
  const all = ['front', 'top', 'right'].flatMap((t) => sizeOf(boxViews.get(t)));
  assert.deepEqual(sorted(all).map((v) => Math.round(v)), [10, 10, 20, 20, 30, 30]);
});
for (const type of ['iso', 'dimetric']) {
  test(`view ${type}: wider than any face of the box, no hidden lines and no dimensions`, () => {
    const p = boxViews.get(type);
    assert.ok(Math.max(...sizeOf(p)) > 30, `${sizeOf(p)}`);
    const d = drawing({ views: [{ id: 'v', type }] });
    const svg = drawingSvg(d, new Map([['v', { ...p, hidden: ['M 0 0 L 1 1'] }]]));
    assert.equal(count(svg, /class="hidden-line"/g), 0);
    assert.equal(count(svg, /class="dim-text"/g), 0);
  });
}
for (const type of VIEW_TYPES) {
  test(`view basis of ${type} is right-handed and orthonormal`, () => {
    const b = viewBasis({ type });
    for (const v of [b.dir, b.x, b.y]) near(Math.hypot(...v), 1, 1e-9);
    near(b.dir[0] * b.x[0] + b.dir[1] * b.x[1] + b.dir[2] * b.x[2], 0, 1e-9);
    const c = [b.dir[1] * b.x[2] - b.dir[2] * b.x[1], b.dir[2] * b.x[0] - b.dir[0] * b.x[2], b.dir[0] * b.x[1] - b.dir[1] * b.x[0]];
    nearV(c, b.y, 1e-9);
  });
}
test('projection keys differ for every standard view type', () => {
  assert.equal(new Set(VIEW_TYPES.map((type) => projectionKey({ type }))).size, VIEW_TYPES.length);
});
test('projectDrawing reuses a cached projection with the same key', () => {
  const d = drawing({ views: [{ id: 'a', type: 'front' }, { id: 'b', type: 'front' }] });
  const cache = new Map();
  const out = projectDrawing(box, d, cache);
  assert.equal(out.get('a'), out.get('b'));
  assert.equal(cache.size, 1);
});
test('hidden lines are drawn by default and dropped with showHidden off (SVG and DXF)', () => {
  const d = drawing({ views: [{ id: 'v-front', type: 'front' }] });
  const p = new Map([['v-front', fake(60, 40)]]);
  assert.equal(count(drawingSvg(d, p), /class="hidden-line"/g), 1);
  assert.ok(dxfEntities(drawingDxf(d, p)).some((e) => e.layer === 'HIDDEN'));
  d.showHidden = false;
  assert.equal(count(drawingSvg(d, p), /class="hidden-line"/g), 0);
  assert.ok(!dxfEntities(drawingDxf(d, p)).some((e) => e.layer === 'HIDDEN'));
});
test('a view with hidden: false hides its own hidden lines only', () => {
  const d = drawing({ views: [{ id: 'a', type: 'front', hidden: false }, { id: 'b', type: 'top' }] });
  assert.equal(count(drawingSvg(d, fakeAll(d)), /class="hidden-line"/g), 1);
});
test('showDims off removes every overall dimension', () => {
  const d = drawing({ showDims: false });
  assert.equal(count(drawingSvg(d, fakeAll(d)), /class="dim-text"/g), 0);
});
test('a selected view gets the "selected" class', () => {
  const d = drawing();
  assert.match(drawingSvg(d, fakeAll(d), { selected: 'v-top' }), /class="view selected" data-view="v-top"/);
});
test('a view moved by hand keeps its sheet position', () => {
  const d = drawing(); d.views[0].x = 77; d.views[0].y = 66;
  assert.deepEqual(layoutViews(d, fakeAll(d)).places.get(d.views[0].id), { cx: 77, cy: 66 });
});
test('auto scale: a standard scale, smaller for larger parts', () => {
  const d = drawing();
  const scales = [20, 60, 150, 400, 3000].map((w) => layoutViews(d, fakeAll(d, w, w / 2)).scale);
  for (const sc of scales) assert.ok(STANDARD_SCALES.includes(sc), String(sc));
  for (let i = 1; i < scales.length; i++) assert.ok(scales[i] <= scales[i - 1], scales.join(' '));
  assert.ok(scales[0] > 1 && scales.at(-1) < 1, scales.join(' '));
});
for (const w of [20, 150, 3000]) {
  test(`auto scale: the views of a ${w} mm part fit inside the sheet frame`, () => {
    const d = drawing(); const p = fakeAll(d, w, w / 2);
    const { scale, places } = layoutViews(d, p);
    for (const v of d.views) {
      const c = places.get(v.id); const hw = (w * scale) / 2; const hh = (w / 2 * scale) / 2;
      assert.ok(c.cx - hw >= 10 && c.cx + hw <= 410 && c.cy - hh >= 10 && c.cy + hh <= 287, `${v.id} at ${JSON.stringify(c)} ± ${hw}`);
    }
  });
}
test('a fixed scale is used as set and shown in the title block', () => {
  const d = drawing({ autoScale: false, scale: 2 });
  assert.equal(layoutViews(d, fakeAll(d)).scale, 2);
  assert.ok(drawingSvg(d, fakeAll(d)).includes('>2:1<'));
});
for (const s of STANDARD_SCALES) {
  test(`scale label of ${s} reads ${scaleLabel(s)} and means that ratio`, () => {
    const [a, b] = scaleLabel(s).split(':').map(Number);
    near(a / b, s, 1e-2 * s);
    assert.ok(a === 1 || b === 1);
  });
}
test('third-angle projection: top view above the front, right view to its right', () => {
  const d = drawing(); const { places } = layoutViews(d, fakeAll(d));
  assert.ok(places.get('v-top').cy < places.get('v-front').cy); assert.ok(places.get('v-right').cx > places.get('v-front').cx);
});
test('first-angle projection: top view below the front, right view to its left', () => {
  const d = drawing({ projection: 'first' }); const { places } = layoutViews(d, fakeAll(d));
  assert.ok(places.get('v-top').cy > places.get('v-front').cy); assert.ok(places.get('v-right').cx < places.get('v-front').cx);
});
test('the title block projection symbol has its circles right for third angle, left for first angle', () => {
  const third = drawingSvg(drawing(), new Map()); const first = drawingSvg(drawing({ projection: 'first' }), new Map());
  assert.match(third, /<circle cx="18" cy="0" r="5"/); assert.match(first, /<circle cx="-6" cy="0" r="5"/);
});
test('title block shows every field the drawing sets', () => {
  const d = drawing({ title: { company: 'ACME & Co', drawnBy: 'SK', checkedBy: 'JL', date: '2026-03-04', partNo: 'P-77', revision: 'C' } });
  const texts = svgTexts(drawingSvg(d, new Map(), { info: { name: 'Shaft', material: 'Steel', mass: '1.5 kg' } }));
  for (const v of ['ACME &amp; Co', 'SK', 'JL', '2026-03-04', 'P-77', 'C', 'Shaft', 'Steel', '1.5 kg', 'A3']) assert.ok(texts.includes(v), v);
});
test('title block field names follow the UI labels', () => {
  assert.ok(svgTexts(drawingSvg(drawing(), new Map(), { labels: { 'title.material': '재질' } })).includes('재질'));
});
for (const sheet of Object.keys(SHEETS)) {
  test(`sheet ${sheet}: frame 10 mm inside the edge and the title block at the bottom right`, () => {
    const [W, H] = SHEETS[sheet];
    const svg = drawingSvg(drawing({ sheet }), new Map());
    assert.ok(svg.includes(`<rect class="frame" x="10" y="10" width="${W - 20}" height="${H - 20}"/>`));
    assert.ok(svg.includes(`<rect x="${W - 190}" y="${H - 50}" width="180" height="40" class="frame"/>`));
  });
}

// ───────────────────────── section views

const block = R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1]));
const blockVolume = 100 * 50 * 20 - Math.PI * 100 * 20;
for (const [name, normal, point] of [['x', [1, 0, 0], [0, 0, 0]], ['y', [0, 1, 0], [0, 0, 0]], ['z', [0, 0, 1], [0, 0, 10]], ['-x', [-1, 0, 0], [0, 0, 0]]]) {
  test(`section shape across ${name} through the middle keeps half the block`, () => {
    near(R.measureVolume(sectionShape(block, { point, normal })), blockVolume / 2, 1e-3 * blockVolume);
  });
}
test('section shape off-centre keeps the side away from the normal', () => {
  near(R.measureVolume(sectionShape(R.makeBox([0, 0, 0], [10, 10, 10]), { point: [3, 0, 0], normal: [1, 0, 0] })), 300, 1e-6);
});
const sectionDrawing = (label = 'A', extra = {}) => {
  const d = drawing();
  d.views.push({ id: 'v-sec', type: 'right', kind: 'section', parent: 'v-front', label, plane: { point: [0, 0, 0], normal: VIEW_CAMERAS.right.dir }, ...extra });
  return d;
};
const sectionSvg = (d) => drawingSvg(d, projectDrawing(block, d));
for (const label of ['A', 'B', 'K']) {
  test(`section view ${label}: labelled SECTION ${label}-${label} in SVG and DXF`, () => {
    const d = sectionDrawing(label);
    const p = projectDrawing(block, d);
    assert.ok(drawingSvg(d, p).includes(`>SECTION ${label}-${label}<`));
    assert.ok(dxfTexts(drawingDxf(d, p)).includes(`SECTION ${label}-${label}`));
  });
}
test('section view: the cut face is hatched (SVG hatch path, DXF HATCH layer)', () => {
  const d = sectionDrawing(); const p = projectDrawing(block, d);
  assert.equal(count(drawingSvg(d, p), /class="hatch"/g), 1);
  assert.ok(dxfEntities(drawingDxf(d, p)).filter((e) => e.layer === 'HATCH').length > 5);
});
test('section view: a smaller hatch spacing draws more hatch lines', () => {
  const lines = (spacing) => { const d = sectionDrawing('A', { hatchSpacing: spacing }); return dxfEntities(drawingDxf(d, projectDrawing(block, d))).filter((e) => e.layer === 'HATCH').length; };
  assert.ok(lines(1) > lines(4) * 2, `${lines(1)} vs ${lines(4)}`);
});
test('section view: the parent view shows the cutting line with the letter at both ends', () => {
  const svg = sectionSvg(sectionDrawing('Q'));
  assert.equal(count(svg, /class="cut-line"/g), 1);
  assert.equal(count(svg, /class="cut-end"/g), 2);
  assert.equal(count(svg, />Q<\/text>/g), 2);
});
test('section view: a cutting plane not seen edge-on in a view draws no cutting line there', () => {
  const d = drawing();
  d.views.push({ id: 'v-sec', type: 'front', kind: 'section', parent: 'v-front', label: 'A', plane: { point: [0, 0, 0], normal: VIEW_CAMERAS.front.dir } });
  assert.equal(count(drawingSvg(d, projectDrawing(block, d)), /class="cut-line"/g), 0);
});
test('section view: hidden lines are off unless the view asks for them', () => {
  const p = (extra) => { const d = sectionDrawing('A', extra); d.views = d.views.filter((v) => v.kind); const pr = projectDrawing(block, d); pr.get('v-sec').hidden = ['M 0 0 L 5 5']; return drawingSvg(d, pr); };
  assert.equal(count(p({}), /class="hidden-line"/g), 0);
  assert.equal(count(p({ hidden: true }), /class="hidden-line"/g), 1);
});
test('section view: its DXF label is on the NOTES layer, declared in the layer table', () => {
  const d = sectionDrawing(); const dxf = drawingDxf(d, projectDrawing(block, d));
  assert.ok(dxfEntities(dxf).some((e) => e.type === 'TEXT' && e.layer === 'NOTES' && e.codes.get(1)[0] === 'SECTION A-A'));
  assert.match(dxf, /\nLAYER\n2\nNOTES\n/); assert.match(dxf, /\nLAYER\n2\nHATCH\n/);
});
test('section label follows the UI language', () => {
  assert.ok(drawingSvg(sectionDrawing(), projectDrawing(block, sectionDrawing()), { labels: { 'drawing.section': '단면' } }).includes('>단면 A-A<'));
});
test('section and detail views are placed below the standard views', () => {
  const d = sectionDrawing(); const { places } = layoutViews(d, projectDrawing(block, d));
  assert.ok(places.get('v-sec').cy > places.get('v-front').cy);
});
test('projection key of a section changes with its plane', () => {
  const v = sectionDrawing().views.at(-1);
  assert.notEqual(projectionKey(v), projectionKey({ ...v, plane: { point: [1, 0, 0], normal: v.plane.normal } }));
});
test('VIEW_KINDS lists section and detail', () => { assert.deepEqual(VIEW_KINDS, ['section', 'detail']); });

// ───────────────────────── detail views

const detailDrawing = (scale, extra = {}) => {
  const d = drawing({ autoScale: false, scale: 1 });
  d.views = [{ id: 'v-front', type: 'front' }, { id: 'v-det', kind: 'detail', parent: 'v-front', center: [5, 5], radius: 10, scale, label: 'B', ...extra }];
  return d;
};
for (const [scale, label] of [[2, '2:1'], [4, '4:1'], [5, '5:1'], [10, '10:1']]) {
  test(`detail view at ×${scale} on a 1:1 sheet is labelled DETAIL B (${label})`, () => {
    const d = detailDrawing(scale);
    const p = fakeAll(d);
    assert.ok(drawingSvg(d, p).includes(`>DETAIL B (${label})<`));
    assert.ok(dxfTexts(drawingDxf(d, p)).includes(`DETAIL B (${label})`));
  });
}
test('detail view: clipped to its circle of the given radius', () => {
  const svg = drawingSvg(detailDrawing(2), fakeAll(detailDrawing(2)));
  assert.match(svg, /<clipPath id="clip-d-v-det" clipPathUnits="userSpaceOnUse"><circle cx="5" cy="-5" r="10"\/>/);
});
test('detail view: its border circle is radius × scale on the sheet', () => {
  const svg = drawingSvg(detailDrawing(3), fakeAll(detailDrawing(3)));
  assert.match(svg, /class="detail-border"/);
  assert.match(svg, /r="30" class="detail-border"/);
});
test('detail view: the parent view shows the detail circle and letter', () => {
  const svg = drawingSvg(detailDrawing(2, { label: 'Z' }), fakeAll(detailDrawing(2)));
  assert.equal(count(svg, /class="detail-circle"/g), 1);
  assert.ok(svgTexts(svg).includes('Z'));
});
test('detail view: DXF draws the border circle and only lines inside the circle', () => {
  const d = detailDrawing(2);
  const ents = dxfEntities(drawingDxf(d, fakeAll(d)));
  assert.ok(ents.filter((e) => e.type === 'CIRCLE' && e.layer === 'NOTES').length >= 2, 'border and parent circle');
  const plain = dxfEntities(drawingDxf({ ...d, views: [d.views[0]] }, fakeAll(d))).filter((e) => e.layer === 'VISIBLE').length;
  const withDetail = ents.filter((e) => e.layer === 'VISIBLE').length;
  assert.ok(withDetail > plain && withDetail < plain * 2 + 1, `${plain} → ${withDetail}`);
});
test('detail view has no projection of its own and its own projection key is its parent', () => {
  assert.equal(projectView(box, 'front', { kind: 'detail' }).detail, true);
  assert.equal(projectionKey({ kind: 'detail', parent: 'v-top' }), 'detail|v-top');
  assert.equal(viewBasis({ kind: 'detail' }), null);
});
test('detail view: no overall dimensions', () => {
  const d = detailDrawing(2); d.views = [d.views[1], { id: 'v-front', type: 'front' }];
  const svg = drawingSvg(d, fakeAll(d));
  assert.equal(count(svg, /class="dim-text"/g), 2, 'only the parent view is dimensioned');
});

// ───────────────────────── auxiliary views

test('auxiliary view with a letter is labelled VIEW D-D', () => {
  const d = drawing({ views: [{ id: 'a', type: 'custom', dir: [1, 1, 0], label: 'D' }] });
  assert.ok(drawingSvg(d, projectDrawing(box, d)).includes('>VIEW D-D<'));
});
test('auxiliary view without a letter is labelled "Auxiliary view" (or the UI text)', () => {
  const d = drawing({ views: [{ id: 'a', type: 'custom', dir: [1, 1, 0] }] });
  const p = projectDrawing(box, d);
  assert.ok(drawingSvg(d, p).includes('>Auxiliary view<'));
  assert.ok(drawingSvg(d, p, { labels: { 'view.custom': '보조 투상도' } }).includes('>보조 투상도<'));
});
for (const dir of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
  test(`auxiliary view along ${dir} equals a standard view of the same size`, () => {
    const p = projectView(box, 'custom', { type: 'custom', dir });
    const [w, h] = sizeOf(p);
    assert.deepEqual(sorted([w, h]).map((v) => Math.round(v)), sorted(DIMS.filter((_, i) => dir[i] === 0)));
  });
}
test('auxiliary view along a box diagonal is wider than every face', () => {
  assert.ok(Math.max(...sizeOf(projectView(box, 'custom', { type: 'custom', dir: [1, 1, 1] }))) > 30);
});
test('projection key of an auxiliary view changes with its direction', () => {
  assert.notEqual(projectionKey({ type: 'custom', dir: [1, 0, 0] }), projectionKey({ type: 'custom', dir: [0, 1, 0] }));
});

// ───────────────────────── crop, break, broken-out section

test('crop rectangle is sorted whichever corners are given', () => {
  assert.deepEqual(cropRect({ crop: { x0: 10, y0: 8, x1: -5, y1: 2 } }), { x0: -5, y0: 2, x1: 10, y1: 8 });
});
test('crop rectangle needs four numbers', () => {
  assert.equal(cropRect({ crop: { x0: 1, y0: 2, x1: 'a', y1: 4 } }), null); assert.equal(cropRect({}), null);
});
test('crop projection: the box becomes the rectangle', () => {
  const c = cropProjection(fake(60, 40), { x0: 10, y0: 5, x1: 30, y1: 25 });
  assert.deepEqual(c.box, { x0: 10, y0: 5, x1: 30, y1: 25 });
});
test('crop projection outside the view keeps no lines', () => {
  const c = cropProjection(fake(60, 40), { x0: 100, y0: 100, x1: 120, y1: 120 });
  assert.deepEqual(c.visible, []); assert.deepEqual(c.hidden, []);
});
test('cropped view on the sheet: dimensions read the cropped size', () => {
  const d = drawing({ views: [{ id: 'v-front', type: 'front', crop: { x0: 0, y0: 0, x1: 25, y1: 15 } }] });
  const svg = sheetSvg(d, adjustProjections(d, new Map([['v-front', fake(60, 40)]])), {});
  const dims = [...svg.matchAll(/class="dim-text"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(sorted(dims.map(Number)), [15, 25]);
});
test('break span is clamped to the view box and sorted', () => {
  assert.deepEqual(breakSpan({ break: { axis: 'x', from: 80, to: -10 } }, { x0: 0, y0: 0, x1: 60, y1: 40 }), { axis: 'x', from: 0, to: 60 });
});
test('break span outside the view is no break', () => {
  assert.equal(breakSpan({ break: { axis: 'x', from: 70, to: 80 } }, { x0: 0, y0: 0, x1: 60, y1: 40 }), null);
});
test('default break: the middle 60 % of the longer side', () => {
  assert.deepEqual(defaultBreak({ x0: 0, y0: 0, x1: 100, y1: 20 }), { axis: 'x', from: 20, to: 80 });
  assert.deepEqual(defaultBreak({ x0: 0, y0: 0, x1: 20, y1: 100 }), { axis: 'y', from: 20, to: 80 });
});
for (const axis of ['x', 'y']) {
  test(`break along ${axis}: shorter view, true length kept for its dimension`, () => {
    const p = axis === 'x' ? fake(100, 20) : fake(20, 100);
    const b = breakProjection(p, { axis, from: 20, to: 80 });
    const [w, h] = sizeOf(b);
    assert.ok((axis === 'x' ? w : h) < 50);
    assert.equal(axis === 'x' ? b.trueW : b.trueH, 100);
    const d = drawing({ autoScale: false, scale: 1, views: [{ id: 'v-front', type: 'front', break: { axis, from: 20, to: 80 } }] });
    const svg = sheetSvg(d, adjustProjections(d, new Map([['v-front', p]])), {});
    assert.ok(svg.includes('>100</text>'));
    assert.equal(count(svg, /class="break-line"/g), 2, 'two zig-zag lines at the gap');
  });
}
test('broken-out region needs a positive depth', () => {
  assert.equal(brokenOutRegion({ brokenOut: { x0: 0, y0: 0, x1: 1, y1: 1, depth: 0 } }), null);
  assert.deepEqual(brokenOutRegion({ brokenOut: { x0: 5, y0: 6, x1: 1, y1: 2, depth: 3 } }), { x0: 1, y0: 2, x1: 5, y1: 6, depth: 3 });
});
test('broken-out section on the sheet: a wavy outline and hatching', () => {
  const d = drawing({ views: [{ id: 'v-front', type: 'front' }] });
  const p = projectView(block, 'front');
  const cx = (p.box.x0 + p.box.x1) / 2; const cy = (p.box.y0 + p.box.y1) / 2;
  d.views[0].brokenOut = { x0: cx - 40, y0: cy - 4, x1: cx - 25, y1: cy + 4, depth: 5 };
  const svg = sheetSvg(d, adjustProjections(d, new Map([['v-front', p]]), { shape: block, key: 'b', cache: new Map() }), {});
  assert.equal(count(svg, /class="brokenout-line"/g), 1);
  assert.ok(count(svg, /class="hatch"/g) >= 1);
  assertWellFormed(svg);
});

// ───────────────────────── annotations

const ANN = {
  note: { id: 'n', kind: 'note', x: 20, y: 30, text: 'DEBURR ALL EDGES', size: 3.5 },
  balloon: { id: 'b', kind: 'balloon', x: 50, y: 50, item: 7 },
  gdt: { id: 'g', kind: 'gdt', x: 100, y: 40, symbol: 'flatness', tolerance: '0.02' },
  datum: { id: 'dt', kind: 'datum', x: 150, y: 40, letter: 'C' },
  surface: { id: 's', kind: 'surface', x: 180, y: 60, ra: '0.8' },
  centermark: { id: 'c', kind: 'centermark', x: 200, y: 60, size: 12 },
  dimension: { id: 'm', kind: 'dimension', a: [20, 150], b: [70, 150] },
  cloud: { id: 'cl', kind: 'cloud', x: 220, y: 30, w: 40, h: 20, rev: 'B' },
  datumTarget: { id: 'tg', kind: 'datumTarget', x: 260, y: 40, label: 'A1', area: 'Ø6', target: [270, 55] },
  hatch: { id: 'h', kind: 'hatch', x: 280, y: 70, w: 20, h: 15, pattern: 'ansi31' },
  bendTable: { id: 'bt', kind: 'bendTable', x: 300, y: 20, rows: [{ no: 1, dir: 'UP', angle: 90, radius: 2, k: 0.44, allowance: 4.53 }] },
};
const withAnn = (...anns) => drawing({ views: [], annotations: anns });
test('the annotation samples cover every annotation kind', () => { assert.deepEqual(Object.keys(ANN), ANNOTATION_KINDS); });
for (const kind of ANNOTATION_KINDS) {
  test(`annotation ${kind}: a well-formed SVG group with its kind and id`, () => {
    const svg = annotationSvg(ANN[kind]);
    assertWellFormed(svg);
    assert.match(svg, new RegExp(`^<g class="annotation ann-${kind}" data-annotation="${ANN[kind].id}">`));
  });
  test(`annotation ${kind}: drawn on the sheet inside the annotations group`, () => {
    const svg = drawingSvg(withAnn(ANN[kind]), new Map());
    assert.match(svg, new RegExp(`<g class="annotations"><g class="annotation ann-${kind}"`));
  });
  test(`annotation ${kind}: written to DXF on the NOTES layer`, () => {
    const ents = dxfEntities(drawingDxf(withAnn(ANN[kind]), new Map())).filter((e) => e.layer === 'NOTES');
    assert.ok(ents.length >= 1);
    assert.equal(ents.length, annotationPrimitives(ANN[kind]).reduce((n, p) => n + (p.t === 'circle' ? 1 : p.t === 'text' ? String(p.text).split('\n').filter(Boolean).length : p.t === 'fill' ? p.pts.length + 1 : p.pts.length - 1 + (p.closed && p.pts.length > 2 ? 1 : 0)), 0));
  });
  test(`annotation ${kind}: selected annotation gets the "selected" class`, () => {
    assert.match(drawingSvg(withAnn(ANN[kind]), new Map(), { selected: ANN[kind].id }), new RegExp(`class="annotation ann-${kind} selected"`));
  });
}
test('note: its text is in SVG and DXF', () => {
  assert.ok(svgTexts(annotationSvg(ANN.note)).includes('DEBURR ALL EDGES'));
  assert.ok(dxfTexts(drawingDxf(withAnn(ANN.note), new Map())).includes('DEBURR ALL EDGES'));
});
test('note: special characters are escaped in SVG and kept in DXF', () => {
  const a = { ...ANN.note, text: 'A < B & "C"' };
  assert.ok(annotationSvg(a).includes('A &lt; B &amp; &quot;C&quot;'));
  assert.ok(dxfTexts(drawingDxf(withAnn(a), new Map())).includes('A < B & "C"'));
});
test('note: three lines become three tspans and three DXF texts', () => {
  const a = { ...ANN.note, text: 'ONE\nTWO\nTHREE' };
  assert.equal(count(annotationSvg(a), /<tspan/g), 3);
  assert.deepEqual(dxfTexts(drawingDxf(withAnn(a), new Map())), ['ONE', 'TWO', 'THREE']);
});
test('note: the text size is the font size', () => { assert.match(annotationSvg({ ...ANN.note, size: 5 }), /font-size="5"/); });
test('note: DXF text height is 0.72 × the font size', () => {
  const e = dxfEntities(drawingDxf(withAnn({ ...ANN.note, size: 5 }), new Map())).find((x) => x.type === 'TEXT');
  near(Number(e.codes.get(40)[0]), 3.6, 1e-4);
});
test('note: DXF y is flipped (sheet y down → DXF y up)', () => {
  const [, H] = SHEETS.A3;
  const e = dxfEntities(drawingDxf(withAnn(ANN.note), new Map())).find((x) => x.type === 'TEXT');
  near(Number(e.codes.get(10)[0]), 20, 1e-4); near(Number(e.codes.get(20)[0]), H - 30, 1e-4);
});
test('note: a rotated note has an SVG rotation and the DXF angle', () => {
  assert.match(annotationSvg({ ...ANN.note, rot: 30 }), /transform="rotate\(30 20 30\)"/);
  const e = dxfEntities(drawingDxf(withAnn({ ...ANN.note, rot: 30 }), new Map())).find((x) => x.type === 'TEXT');
  near(Number(e.codes.get(50)[0]), -30, 1e-4);
});
test('note: bold text gets the bold class', () => { assert.match(annotationSvg({ ...ANN.note, bold: true }), /class="ann-text ann-bold"/); });
test('note: a target adds a leader line with an arrowhead', () => {
  const plain = annotationPrimitives(ANN.note); const lead = annotationPrimitives({ ...ANN.note, target: [10, 60] });
  assert.equal(lead.length, plain.length + 2);
  assert.ok(lead.some((p) => p.t === 'fill'));
});
for (const item of [1, 12, 99]) {
  test(`balloon ${item}: the item number inside a circle`, () => {
    const svg = annotationSvg({ ...ANN.balloon, item });
    assert.ok(svgTexts(svg).includes(String(item)));
    assert.ok(dxfTexts(drawingDxf(withAnn({ ...ANN.balloon, item }), new Map())).includes(String(item)));
  });
}
test('balloon: default radius 4, or its size', () => {
  assert.equal(annotationPrimitives(ANN.balloon).find((p) => p.t === 'circle').r, 4);
  assert.equal(annotationPrimitives({ ...ANN.balloon, size: 6 }).find((p) => p.t === 'circle').r, 6);
});
test('balloon: a far target adds a leader ending in a dot', () => {
  const prims = annotationPrimitives({ ...ANN.balloon, target: [80, 80] });
  assert.ok(prims.some((p) => p.t === 'poly'));
  assert.ok(prims.some((p) => p.t === 'circle' && p.fill));
});
test('balloon: a target inside the circle draws no leader', () => {
  assert.ok(!annotationPrimitives({ ...ANN.balloon, target: [51, 51] }).some((p) => p.t === 'poly'));
});
test('GD&T groups: every symbol has a tolerance kind', () => {
  assert.deepEqual(Object.keys(GDT_GROUPS).sort(), [...GDT_SYMBOLS].sort());
  for (const g of Object.values(GDT_GROUPS)) assert.ok(['form', 'orientation', 'location', 'profile', 'runout'].includes(g));
});
for (const symbol of GDT_SYMBOLS) {
  test(`GD&T ${symbol} (${GDT_GROUPS[symbol]}): frame, glyph, tolerance and datum in SVG and DXF`, () => {
    const a = { id: 'g', kind: 'gdt', x: 10, y: 10, symbol, tolerance: '0.05', datums: GDT_GROUPS[symbol] === 'form' ? [] : ['A'] };
    const svg = annotationSvg(a);
    assert.equal(count(svg, /class="ann-frame"/g), 1 + 1 + (a.datums.length ? 1 : 0), 'outer frame + cell dividers');
    assert.ok(count(svg, /class="ann-(line|fill)"/g) >= 1, 'glyph');
    assert.deepEqual(svgTexts(svg), ['0.05', ...a.datums]);
    const texts = dxfTexts(drawingDxf(withAnn(a), new Map()));
    assert.deepEqual(texts, ['0.05', ...a.datums]);
  });
}
test('GD&T: three datums make three datum cells', () => {
  const svg = annotationSvg({ ...ANN.gdt, symbol: 'position', datums: ['A', 'B', 'C'] });
  assert.equal(count(svg, /class="ann-frame"/g), 1 + 4);
});
test('GD&T: the diameter sign adds a circle and a slash', () => {
  const plain = annotationPrimitives(ANN.gdt).length; const dia = annotationPrimitives({ ...ANN.gdt, diameter: true }).length;
  assert.equal(dia, plain + 2);
});
for (const mod of ['M', 'L']) {
  test(`GD&T: material condition ${mod} is a circled letter`, () => {
    const prims = annotationPrimitives({ ...ANN.gdt, modifier: mod });
    assert.ok(prims.some((p) => p.t === 'text' && p.text === mod));
  });
}
test('GD&T: an unknown modifier is ignored', () => {
  assert.equal(annotationPrimitives({ ...ANN.gdt, modifier: 'X' }).length, annotationPrimitives(ANN.gdt).length);
});
test('GD&T: frame height is its size (default 6)', () => {
  const frame = (a) => annotationPrimitives(a).find((p) => p.cls === 'ann-frame' && p.closed);
  near(frame(ANN.gdt).pts[2][1] - frame(ANN.gdt).pts[0][1], 6); near(frame({ ...ANN.gdt, size: 9 }).pts[2][1] - frame({ ...ANN.gdt, size: 9 }).pts[0][1], 9);
});
test('GD&T: a target adds a leader with an arrowhead', () => {
  const prims = annotationPrimitives({ ...ANN.gdt, target: [100, 90] });
  assert.equal(prims.length, annotationPrimitives(ANN.gdt).length + 2);
});
for (const letter of ['A', 'B', 'D']) {
  test(`datum ${letter}: boxed letter with a filled triangle (SVG fill, DXF SOLID)`, () => {
    const a = { ...ANN.datum, letter };
    assert.ok(svgTexts(annotationSvg(a)).includes(letter));
    const ents = dxfEntities(drawingDxf(withAnn(a), new Map()));
    assert.ok(ents.some((e) => e.type === 'SOLID'));
    assert.deepEqual(dxfTexts(drawingDxf(withAnn(a), new Map())), [letter]);
  });
}
test('datum: the triangle sits on the target', () => {
  const tri = annotationPrimitives({ ...ANN.datum, target: [150, 70] }).find((p) => p.t === 'fill');
  near((tri.pts[0][1] + tri.pts[1][1]) / 2, 70, 1e-9);
});
test('surface finish: the Ra value as "Ra <value>"', () => {
  assert.ok(svgTexts(annotationSvg(ANN.surface)).includes('Ra 0.8'));
  assert.ok(dxfTexts(drawingDxf(withAnn(ANN.surface), new Map())).includes('Ra 0.8'));
});
test('surface finish: without a value only the tick is drawn', () => {
  assert.deepEqual(annotationPrimitives({ ...ANN.surface, ra: '' }).map((p) => p.t), ['poly']);
});
test('surface finish: material removal adds the closing bar', () => {
  assert.equal(annotationPrimitives({ ...ANN.surface, process: 'removal' }).length, annotationPrimitives(ANN.surface).length + 1);
});
test('surface finish: no removal adds the circle', () => {
  assert.ok(annotationPrimitives({ ...ANN.surface, process: 'noRemoval' }).some((p) => p.t === 'circle'));
});
test('surface finish: the tick has its tip at the point and legs 5 and 10 long', () => {
  const [tick] = annotationPrimitives(ANN.surface);
  assert.deepEqual(tick.pts[1], [180, 60]);
  near(Math.hypot(tick.pts[0][0] - 180, tick.pts[0][1] - 60), 5, 1e-9); near(Math.hypot(tick.pts[2][0] - 180, tick.pts[2][1] - 60), 10, 1e-9);
});
test('centre mark: a large mark is a cross with four dashes (6 lines)', () => {
  assert.equal(annotationPrimitives(ANN.centermark).length, 6);
  assert.equal(dxfEntities(drawingDxf(withAnn(ANN.centermark), new Map())).filter((e) => e.type === 'LINE' && e.layer === 'NOTES').length, 6);
});
test('centre mark: its dashes reach half its size from the centre', () => {
  const xs = annotationPrimitives(ANN.centermark).flatMap((p) => p.pts.map((q) => q[0]));
  near(Math.max(...xs), 206); near(Math.min(...xs), 194);
});
test('centre mark: a small mark scales with its size', () => {
  const xs = annotationPrimitives({ ...ANN.centermark, size: 3 }).flatMap((p) => p.pts.map((q) => q[0]));
  near(Math.max(...xs), 201.5); near(Math.min(...xs), 198.5);
});
for (const [scale, expected] of [[1, '50'], [0.5, '100'], [2, '25'], [0.25, '200']]) {
  test(`dimension 50 sheet mm at scale ${scale} reads ${expected}`, () => {
    assert.ok(svgTexts(annotationSvg(ANN.dimension, { scale })).includes(expected));
  });
}
test('dimension on a drawing uses the sheet scale', () => {
  const d = withAnn(ANN.dimension); d.autoScale = false; d.scale = 0.5;
  assert.ok(svgTexts(drawingSvg(d, new Map())).includes('100'));
  assert.ok(dxfTexts(drawingDxf(d, new Map())).includes('100'));
});
test('dimension: horizontal measures the x distance only', () => {
  assert.ok(svgTexts(annotationSvg({ ...ANN.dimension, b: [70, 190], orient: 'horizontal' })).includes('50'));
});
test('dimension: vertical measures the y distance only and is turned 90°', () => {
  const a = { ...ANN.dimension, b: [70, 190], orient: 'vertical' };
  assert.ok(svgTexts(annotationSvg(a)).includes('40'));
  assert.equal(Math.abs(annotationPrimitives(a).find((p) => p.t === 'text').rot), 90);
});
test('dimension: aligned measures the straight distance', () => {
  assert.ok(svgTexts(annotationSvg({ ...ANN.dimension, b: [50, 190] })).includes('50'));
});
test('dimension: decimals are rounded to two places', () => {
  assert.ok(svgTexts(annotationSvg({ ...ANN.dimension, b: [20 + 12.3456, 150] })).includes('12.35'));
});
test('dimension: an override text replaces the value', () => {
  assert.ok(svgTexts(annotationSvg({ ...ANN.dimension, text: 'Ø20 H7' })).includes('Ø20 H7'));
});
test('dimension: the line sits at the offset (default 8) from the points', () => {
  const lineAt = (a) => annotationPrimitives(a)[2].pts[0][1];
  near(lineAt(ANN.dimension), 142); near(lineAt({ ...ANN.dimension, offset: -5 }), 155); near(lineAt({ ...ANN.dimension, offset: 0 }), 150);
});
test('dimension: two extension lines, the dimension line and two arrowheads', () => {
  assert.deepEqual(annotationPrimitives(ANN.dimension).map((p) => p.t), ['poly', 'poly', 'poly', 'fill', 'fill', 'text']);
});
test('an unknown annotation kind draws nothing', () => {
  assert.deepEqual(annotationPrimitives({ kind: 'nope' }), []);
});

// ───────────────────────── bill of materials

const project = {
  parts: [{ id: 'p1', name: 'Base plate', partNo: 'B-1', description: 'Plate', material: 'al-6061' }, { id: 'p2', name: 'Pin', partNo: 'P-2', material: 'brass' }],
  assemblies: [{ id: 's1', name: 'Wheel', components: [] }],
};
const asm = { id: 'a', components: [{ id: 'c1', part: 'p1' }, { id: 'c2', part: 'p2' }, { id: 'c3', part: 'p2' }, { id: 'c4', sub: 's1' }, { id: 'c5', part: 'p2', excludeFromBom: true }] };
const rows = bomRows(asm, project);
test('BOM: one row per part with summed quantities', () => {
  assert.deepEqual(rows.map((r) => [r.item, r.name, r.qty]), [[1, 'Base plate', 1], [2, 'Pin', 2], [3, 'Wheel', 1]]);
});
test('BOM: components excluded from the BOM are not counted', () => { assert.equal(rows[1].components.length, 2); });
test('BOM: columns are item, part number, name, description, material, quantity', () => {
  assert.deepEqual(BOM_COLUMNS.map((c) => c.key), ['item', 'partNo', 'name', 'description', 'material', 'qty']);
});
test('BOM: the table has every column heading', () => {
  const texts = svgTexts(bomSvg(rows));
  for (const c of BOM_COLUMNS) assert.ok(texts.includes(c.fallback), c.fallback);
});
test('BOM: headings follow the UI labels', () => {
  assert.ok(svgTexts(bomSvg(rows, { labels: { 'bom.name': '이름' } })).includes('이름'));
});
test('BOM: every row shows its item, part number, name and quantity', () => {
  const texts = svgTexts(bomSvg(rows));
  for (const r of rows) for (const v of [r.item, r.partNo, r.name, r.qty].filter((x) => x !== '')) assert.ok(texts.includes(String(v)), String(v));
});
test('BOM: a long name is shortened with an ellipsis to fit its column', () => {
  const long = [{ item: 1, partNo: '', name: 'An extremely long component name that does not fit', description: '', material: '', qty: 1 }];
  assert.ok(svgTexts(bomSvg(long)).some((t) => t.endsWith('…') && t.startsWith('An extremely')));
});
test('BOM: one horizontal line per row plus the frame', () => {
  const svg = bomSvg(rows);
  assert.equal(count(svg, /class="bom-frame"/g), 2, 'outer frame and the heading line');
  assert.equal(count(svg, /class="bom-grid"/g), rows.length - 1 + BOM_COLUMNS.length - 1);
});
for (const sheet of Object.keys(SHEETS)) {
  test(`BOM placement on ${sheet}: right edge 10 mm in, bottom on the title block`, () => {
    const [W, H] = SHEETS[sheet]; const p = bomPlacement(rows, sheet);
    near(p.x + p.w, W - 10); near(p.y + p.h, H - 50); near(p.h, 6 * (rows.length + 1));
  });
}
test('BOM on the sheet: only when shown, in SVG and DXF', () => {
  const d = drawing({ source: { kind: 'assembly', id: 'a' }, views: [] });
  assert.ok(!drawingSvg(d, new Map(), { bomRows: rows }).includes('class="bom"'));
  d.bom = { show: true };
  assert.ok(drawingSvg(d, new Map(), { bomRows: rows }).includes('<g class="bom">'));
  const texts = dxfTexts(drawingDxf(d, new Map(), { bomRows: rows }));
  for (const v of ['Base plate', 'Pin', 'Wheel', 'QTY.', '2']) assert.ok(texts.includes(v), v);
});
test('BOM moved by hand starts at its position', () => {
  const d = drawing({ views: [], bom: { show: true, x: 25, y: 35 } });
  assert.match(drawingSvg(d, new Map(), { bomRows: rows }), /<path d="M 25 35 L /);
});

// ───────────────────────── hole table

const plate = R.makeBox([0, 0, 0], [80, 60, 10]).cut(R.makeCylinder(5, 30, [20, 15, -10], [0, 0, 1])).cut(R.makeCylinder(3, 30, [60, 15, -10], [0, 0, 1])).cut(R.makeCylinder(4, 30, [40, 45, -10], [0, 0, 1]));
const holes = findHoles(plate);
// The standard view that looks along the holes (±z), whichever it is called.
const endOn = VIEW_TYPES.find((t) => Math.abs(viewBasis({ type: t }).dir[2]) > 0.999 && viewBasis({ type: t }).dir[2] > 0);
const side = VIEW_TYPES.find((t) => Math.abs(viewBasis({ type: t }).dir[2]) < 1e-6);
const endOnBox = projectView(plate, endOn).box;
const holeRows = holeTableRows(holes, { type: endOn }, endOnBox);
test('hole table: three through holes found with their diameters', () => {
  assert.deepEqual(sorted(holes.map((h) => Math.round(h.diameter * 1000) / 1000)), [6, 8, 10]);
});
test('hole table: a view looking along the holes lists all three, tagged A1…A3', () => {
  assert.deepEqual(holeRows.map((r) => r.tag), ['A1', 'A2', 'A3']);
});
test('hole table: rows are ordered from the bottom row up, left to right', () => {
  for (let i = 1; i < holeRows.length; i++) assert.ok(holeRows[i].Y > holeRows[i - 1].Y + 1e-6 || (Math.abs(holeRows[i].Y - holeRows[i - 1].Y) < 1e-6 && holeRows[i].X > holeRows[i - 1].X));
});
test('hole table: X / Y are measured from the lower-left corner of the view', () => {
  for (const r of holeRows) { near(r.x, r.X - endOnBox.x0, 1e-9); near(r.y, r.Y - endOnBox.y0, 1e-9); assert.ok(r.x > 0 && r.y > 0); }
  const dist = holeRows.map((r) => Math.hypot(r.x, r.y)); assert.ok(dist.every((v) => v < 100));
});
test('hole table: the hole positions are those of the model (pairwise distances)', () => {
  const byD = new Map(holeRows.map((r) => [Math.round(r.diameter), r]));
  near(Math.hypot(byD.get(10).x - byD.get(6).x, byD.get(10).y - byD.get(6).y), 40, 1e-3);
  near(Math.hypot(byD.get(10).x - byD.get(8).x, byD.get(10).y - byD.get(8).y), Math.hypot(20, 30), 1e-3);
});
test('hole table: a view from the side sees no hole end-on', () => { assert.equal(holeTableRows(holes, { type: side }, endOnBox).length, 0); });
test('hole table: a detail view has no hole rows', () => { assert.deepEqual(holeTableRows(holes, { kind: 'detail' }, endOnBox), []); });
test('hole table on the sheet: title, column headings, ⌀ sizes and the tags on the view', () => {
  const d = drawing({ views: [{ id: 'v', type: endOn }], holeTable: { view: 'v' } });
  const svg = sheetSvg(d, new Map([['v', projectView(plate, endOn)]]), { holeRows });
  assertWellFormed(svg);
  const texts = svgTexts(svg);
  for (const v of ['HOLE TABLE', 'TAG', 'X LOC', 'Y LOC', 'SIZE', '⌀10', '⌀8', '⌀6']) assert.ok(texts.includes(v), v);
  assert.equal(count(svg, /class="hole-tag"/g), 3);
});
test('hole table on the sheet: its X LOC / Y LOC cells hold the row numbers', () => {
  const d = drawing({ views: [{ id: 'v', type: endOn }], holeTable: { view: 'v' } });
  const texts = svgTexts(sheetSvg(d, new Map([['v', projectView(plate, endOn)]]), { holeRows }));
  const fmt = (v) => { const r = Math.round(v * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, ''); };
  for (const r of holeRows) { assert.ok(texts.includes(fmt(r.x)), `x ${fmt(r.x)}`); assert.ok(texts.includes(fmt(r.y)), `y ${fmt(r.y)}`); }
});
test('hole table headings follow the UI labels', () => {
  const d = drawing({ views: [{ id: 'v', type: endOn }], holeTable: { view: 'v' } });
  assert.ok(svgTexts(sheetSvg(d, new Map([['v', projectView(plate, endOn)]]), { holeRows, labels: { 'holeTable.title': '구멍 표' } })).includes('구멍 표'));
});
test('hole table moved by hand is drawn at its position', () => {
  const d = drawing({ views: [{ id: 'v', type: endOn }], holeTable: { view: 'v', x: 33, y: 44 } });
  assert.match(sheetSvg(d, new Map([['v', projectView(plate, endOn)]]), { holeRows }), /<g class="hole-table"><rect x="33" y="44"/);
});
test('no hole table without the drawing asking for one', () => {
  const d = drawing({ views: [{ id: 'v', type: endOn }] });
  assert.doesNotMatch(sheetSvg(d, new Map([['v', projectView(plate, endOn)]]), { holeRows }), /hole-table/);
});

// ───────────────────────── revision table

test('revision letters run A, B, … skipping I, O and Q', () => {
  const list = []; const seen = [];
  for (let i = 0; i < 10; i++) { const r = nextRevision(list); seen.push(r); list.push({ rev: r }); }
  assert.deepEqual(seen, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K']);
});
test('revision letters continue AA after Z', () => {
  const list = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('').map((rev) => ({ rev }));
  assert.equal(nextRevision(list), 'AA');
});
test('a freed revision letter is used again', () => { assert.equal(nextRevision([{ rev: 'B' }]), 'A'); });
test('addRevision: the row and the title block revision', () => {
  const d = drawing(); const row = addRevision(d, { description: 'First', date: '2026-01-02', by: 'SK' });
  assert.deepEqual(row, { rev: 'A', description: 'First', date: '2026-01-02', by: 'SK' });
  assert.equal(d.title.revision, 'A'); assert.equal(d.revisionTable.show, true);
});
test('revision table on the sheet: headings and every row', () => {
  const d = drawing(); addRevision(d, { description: 'First issue', date: '2026-01-02', by: 'SK' }); addRevision(d, { description: 'Hole moved', date: '2026-02-03', by: 'JL' });
  const texts = svgTexts(sheetSvg(d, new Map(), {}));
  for (const v of ['REVISIONS', 'REV', 'DESCRIPTION', 'DATE', 'BY', 'A', 'B', 'First issue', 'Hole moved', '2026-01-02', '2026-02-03', 'SK', 'JL']) assert.ok(texts.includes(v), v);
});
test('revision table: placed at the top right by default, or where it was moved', () => {
  const d = drawing(); addRevision(d, { description: 'x' });
  const w = 12 + 62 + 22 + 16;
  assert.ok(sheetSvg(d, new Map(), {}).includes(`<g class="revision-table"><rect x="${420 - 12 - w}" y="12"`));
  d.revisionTable.x = 30; d.revisionTable.y = 40;
  assert.ok(sheetSvg(d, new Map(), {}).includes('<g class="revision-table"><rect x="30" y="40"'));
});
test('revision table headings follow the UI labels', () => {
  const d = drawing(); addRevision(d, { description: 'x' });
  assert.ok(svgTexts(sheetSvg(d, new Map(), { labels: { 'rev.title': '개정 이력' } })).includes('개정 이력'));
});
test('removing the last revision hides the table and resets the title block to A', () => {
  const d = drawing(); addRevision(d, { description: 'x' }); addRevision(d, { description: 'y' });
  removeRevision(d, 'B'); assert.equal(d.title.revision, 'A'); assert.equal(d.revisionTable.show, true);
  removeRevision(d, 'A'); assert.equal(d.revisionTable.show, false);
  assert.doesNotMatch(sheetSvg(d, new Map(), {}), /revision-table/);
});
test('the title block shows the latest revision', () => {
  const d = drawing(); addRevision(d, {}); addRevision(d, {}); addRevision(d, {});
  assert.match(drawingSvg(d, new Map()), /class="tb-value">C</);
});

// ───────────────────────── sheets

test('a drawing without sheets has one default sheet', () => {
  assert.deepEqual(sheetsOf(drawing()), [{ id: DEFAULT_SHEET, name: '' }]);
  assert.equal(activeSheetId(drawing()), DEFAULT_SHEET);
});
test('addSheet: appended, active, numbered when unnamed; the first sheet is named 1', () => {
  const d = drawing(); const s = addSheet(d, '', 'sh2');
  assert.deepEqual(sheetsOf(d).map((x) => x.name), ['1', '2']);
  assert.equal(activeSheetId(d), s.id);
});
test('addSheet: the existing views and annotations stay on the first sheet', () => {
  const d = drawing({ annotations: [{ ...ANN.note }] }); addSheet(d, 'Two', 'sh2');
  assert.ok(d.views.every((v) => v.sheet === DEFAULT_SHEET)); assert.equal(d.annotations[0].sheet, DEFAULT_SHEET);
});
test('a new sheet shows none of the first sheet\'s views', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2');
  assert.equal(sheetDrawing(d).views.length, 0);
  assert.equal(count(sheetSvg(d, fakeAll(d), {}), /data-view=/g), 0);
});
test('adoptToActiveSheet: new items go to the active sheet; with one sheet nothing changes', () => {
  const one = drawing(); one.views.push({ id: 'x', type: 'back' });
  assert.equal(adoptToActiveSheet(one), 0);
  const d = drawing(); addSheet(d, 'Two', 'sh2'); d.views.push({ id: 'x', type: 'back' }); d.annotations.push({ ...ANN.balloon });
  assert.equal(adoptToActiveSheet(d), 2);
  assert.deepEqual(sheetDrawing(d).views.map((v) => v.id), ['x']);
});
test('renameSheet changes only that sheet\'s name', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2'); renameSheet(d, 'sh2', 'Details');
  assert.deepEqual(sheetsOf(d).map((s) => s.name), ['1', 'Details']);
});
test('setActiveSheet switches sheets; an unknown id is ignored', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2');
  setActiveSheet(d, DEFAULT_SHEET); assert.equal(activeSheetId(d), DEFAULT_SHEET);
  setActiveSheet(d, 'nope'); assert.equal(activeSheetId(d), DEFAULT_SHEET);
});
test('sheet name and number are shown on a drawing with several sheets', () => {
  const d = drawing(); addSheet(d, 'Details', 'sh2');
  assert.ok(svgTexts(sheetSvg(d, new Map(), {})).includes('SHEET 2 / 2 — Details'));
  setActiveSheet(d, DEFAULT_SHEET);
  assert.ok(svgTexts(sheetSvg(d, new Map(), { labels: { 'sheet.label': '시트' } })).includes('시트 1 / 2 — 1'));
});
test('a single-sheet drawing shows no sheet name', () => { assert.doesNotMatch(sheetSvg(drawing(), new Map(), {}), /sheet-name/); });
test('deleteSheet: removes the sheet\'s views and annotations', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2'); d.views.push({ id: 'x', type: 'back' }); d.annotations.push({ ...ANN.note, id: 'n2' }); adoptToActiveSheet(d);
  assert.equal(deleteSheet(d, 'sh2'), true);
  assert.ok(!d.views.some((v) => v.id === 'x')); assert.ok(!d.annotations.some((a) => a.id === 'n2'));
  assert.equal(sheetsOf(d).length, 1); assert.equal(activeSheetId(d), DEFAULT_SHEET);
});
test('deleteSheet: a detail or section view of a deleted view goes too', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2');
  d.views.push({ id: 'x', type: 'back', sheet: 'sh2' }, { id: 'det', kind: 'detail', parent: 'x', sheet: DEFAULT_SHEET });
  deleteSheet(d, 'sh2');
  assert.ok(!d.views.some((v) => v.id === 'det'));
});
test('deleteSheet: deleting the first sheet makes the next one first and keeps its items', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2'); d.views.push({ id: 'x', type: 'back', sheet: 'sh2' });
  deleteSheet(d, DEFAULT_SHEET);
  assert.deepEqual(d.views.map((v) => v.id), ['x']); assert.equal(activeSheetId(d), 'sh2');
});
test('deleteSheet: the last sheet cannot be deleted, nor an unknown one', () => {
  const d = drawing(); assert.equal(deleteSheet(d, DEFAULT_SHEET), false);
  addSheet(d, 'Two', 'sh2'); assert.equal(deleteSheet(d, 'nope'), false);
});
test('deleteSheet: a BOM on the deleted sheet moves to the first sheet, hidden', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2'); d.bom = { show: true, sheet: 'sh2' };
  deleteSheet(d, 'sh2'); assert.deepEqual(d.bom, { show: false, sheet: DEFAULT_SHEET });
});
test('deleteSheet: a hole table of a deleted view is removed', () => {
  const d = drawing(); addSheet(d, 'Two', 'sh2'); d.views.push({ id: 'x', type: 'back', sheet: 'sh2' }); d.holeTable = { view: 'x', sheet: 'sh2' };
  deleteSheet(d, 'sh2'); assert.equal(d.holeTable, null);
});
test('BOM, hole table and revision table appear only on their own sheet', () => {
  const d = drawing(); addRevision(d, { description: 'x' }); d.bom = { show: true }; d.holeTable = { view: 'v-front' };
  const sd1 = sheetDrawing(d); assert.equal(sd1.bom.show, true); assert.ok(sd1.holeTable); assert.equal(sd1.revisionsShown, true);
  addSheet(d, 'Two', 'sh2');
  const sd2 = sheetDrawing(d); assert.equal(sd2.bom.show, false); assert.equal(sd2.holeTable, null); assert.equal(sd2.revisionsShown, false);
});
test('sheet DXF holds only the active sheet\'s views and annotations', () => {
  const d = drawing({ annotations: [{ ...ANN.note, text: 'ON SHEET ONE' }] }); addSheet(d, 'Two', 'sh2');
  d.annotations.push({ ...ANN.note, id: 'n2', text: 'ON SHEET TWO' }); adoptToActiveSheet(d);
  const two = dxfTexts(sheetDxf(d, fakeAll(d), {}));
  assert.ok(two.includes('ON SHEET TWO')); assert.ok(!two.includes('ON SHEET ONE'));
  assert.equal(dxfEntities(sheetDxf(d, fakeAll(d), {})).filter((e) => e.layer === 'VISIBLE').length, 0);
  setActiveSheet(d, DEFAULT_SHEET);
  const one = dxfTexts(sheetDxf(d, fakeAll(d), {}));
  assert.ok(one.includes('ON SHEET ONE')); assert.ok(!one.includes('ON SHEET TWO'));
});
test('overlay is empty for a plain single-sheet drawing', () => {
  assert.equal(overlaySvg(sheetDrawing(drawing()), fakeAll(drawing()), {}), '');
});
test('every view, annotation and table together: one well-formed sheet', () => {
  const d = sectionDrawing('A');
  d.views.push({ id: 'v-det', kind: 'detail', parent: 'v-sec', radius: 8, scale: 2, label: 'B' }, { id: 'v-aux', type: 'custom', dir: [1, 1, 0], label: 'D' });
  d.annotations = Object.values(ANN);
  d.bom = { show: true };
  addRevision(d, { description: 'All' });
  const svg = sheetSvg(d, projectDrawing(block, d), { bomRows: rows });
  assertWellFormed(svg);
  for (const kind of ANNOTATION_KINDS) assert.ok(svg.includes(`ann-${kind}`), kind);
  for (const v of ['SECTION A-A', 'VIEW D-D', 'REVISIONS']) assert.ok(svg.includes(`>${esc(v).replace(/\\/g, '')}<`), v);
  assert.match(svg, /DETAIL B \(/);
});
