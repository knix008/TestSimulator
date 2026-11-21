// Drawing views beyond the standard ones (section, detail, auxiliary), annotations (notes, balloons, GD&T,
// datums, surface finish, centre marks, manual dimensions), the bill of materials, and backward compatibility:
// drawings without the new fields render byte for byte as before (hashes of the original module's output).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import {
  createDrawing, projectView, projectDrawing, projectionKey, sectionShape, viewBasis, hatchSegments, layoutViews, drawingSvg, drawingDxf,
  ANNOTATION_KINDS, GDT_SYMBOLS, annotationSvg, annotationPrimitives, bomRows, bomSvg, bomPlacement, VIEW_TYPES,
} from '../../src/cad/drawing.js';

await loadKernel();
const R = rep();
const sha = (s) => createHash('sha256').update(s).digest('hex');
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

/** A small XML well-formedness check: balanced tags, quoted attributes, no stray '<' or bare '&'. */
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
  assert.ok(!xml.slice(last).includes('<'), 'unparsed tag at the end');
  assert.deepEqual(stack, [], 'unclosed tags');
}

/** The block as the old (Y-up) tests built it: x −50…50, y −25…25, z 0…20, a Ø20 through hole along z. */
const yUpBlock = () => R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1]));
/**
 * A 100 × 50 × 20 block standing up behind the front plane (x −50…50, y −20…0, z −25…25) with a Ø20 through hole
 * along y at the origin: the Y-up block turned to Z up by R = (x, y, z) → (x, −z, y). Turned with an exact matrix
 * (a 90° rotate() leaves 1e-15 noise in the vertices), so the Z-up views draw it byte for byte as the Y-up views
 * of the original module drew the unturned block.
 */
function block() {
  const oc = R.getOC();
  const t = new oc.gp_Trsf();
  t.SetValues(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0);
  const b = new oc.BRepBuilderAPI_Transform(yUpBlock().wrapped, t, true);
  const shape = R.cast(b.Shape());
  b.delete(); t.delete();
  return shape;
}
const triArea = (t) => Math.abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) / 2;

test('old drawings render exactly as the original module did (SVG and DXF)', () => {
  // Hashes taken from the module before section / detail / annotation support was added.
  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' }, title: { date: '2026-01-01' } });
  d.views.push({ id: 'v-left', type: 'left' }, { id: 'v-bottom', type: 'bottom' });
  const box = (w, h) => ({ visible: ['M 0 0 L 1 1', `M 0 0 L ${w} 0 L ${w} -${h} Z`], hidden: ['M 0 0 L 2 2'], box: { x0: 0, y0: 0, x1: w, y1: h } });
  const synthetic = new Map([['v-front', box(400, 100)], ['v-top', box(400, 80)], ['v-right', box(80, 100)], ['v-iso', box(300, 200)], ['v-left', box(80, 100)], ['v-bottom', box(400, 80)]]);
  delete d.annotations; delete d.bom; // files saved before these fields existed
  assert.equal(sha(drawingSvg(d, synthetic, { labels: { 'view.top': 'TOP' }, info: { name: 'N' } })), 'dce34cc374ad5c039c8b9c8b379e06bea348926de7812a2fe4aab64dbf92d03e');
  assert.equal(sha(drawingDxf(d, synthetic)), 'fee6834aaa0779b67b5c10a06bad7de8e25dba9b7626b0eb893ee73357033c4c');

  // A real part through the kernel, every standard view, then other sheet settings. The hashes were taken with
  // the Y-up cameras and the unturned block; the Z-up cameras see the turned block exactly the same way.
  const body = block();
  const k = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' }, title: { date: '2026-01-01' } });
  k.views.push({ id: 'v-left', type: 'left' }, { id: 'v-back', type: 'back' }, { id: 'v-bottom', type: 'bottom', x: 60, y: 200 }, { id: 'v-dim', type: 'dimetric' });
  const projections = new Map(k.views.map((v) => [v.id, projectView(body, v.type)]));
  assert.equal(sha(JSON.stringify([...projections].map(([id, p]) => [id, p.visible, p.hidden, p.box]))), 'c1278f22473afeb3e8f273e017161ce24d29c4ad2ac2abcacb9b391931a3b7f2');
  const labels = { 'view.front': '정면도', 'title.name': '이름' };
  assert.equal(sha(drawingSvg(k, projections, { labels, info: { name: 'Box', material: 'Steel', mass: '1 g' }, selected: 'v-top' })), '8d5c17ecf51983c13269e2f3d09e9ae053ba79dd6d59084d1899e078e8935e60');
  assert.equal(sha(drawingDxf(k, projections)), '60be95309cf61d8e2519543955d289f311d2148026e144b2b2e39ea3e83f6deb');
  k.projection = 'first'; k.showHidden = false; k.showDims = false; k.autoScale = false; k.scale = 0.5; k.sheet = 'A4';
  assert.equal(sha(drawingSvg(k, projections)), '2e5fd4ed0d51221edcb58fba708319b0ba249665cefe91a46814616db2ff54c9');
  assert.equal(sha(drawingDxf(k, projections)), '5e017340e0b62f10101bb1a5ea20680d2ec10a4ebfee68587de7c1a83450d5ab');
  // projectView with the view object of a standard view is the same projection.
  assert.deepEqual(projectView(body, 'front', { id: 'v', type: 'front' }), projections.get('v-front'));
  assert.equal(VIEW_TYPES.length, 8);
});

test('section view: the cut keeps the side away from the normal, cut faces are hatched, label SECTION A-A', () => {
  const body = block();
  const plane = { point: [0, 0, 0], normal: [0, 0, 1] };
  const kept = sectionShape(body, plane);
  near(R.measureVolume(kept), R.measureVolume(body) / 2, 1e-3);
  assert.ok(kept.boundingBox.bounds[1][2] < 1e-6, 'the +z half (toward the viewer) is removed');
  assert.ok(R.measureVolume(body) > 0, 'the input shape is untouched');

  const view = { id: 'v-sec', type: 'top', kind: 'section', plane, label: 'A', parent: 'v-front' };
  const p = projectView(body, 'top', view);
  // Looking down −z at the cut face: 100 wide (x) by 20 high (y).
  near(p.box.x1 - p.box.x0, 100, 1e-3); near(p.box.y1 - p.box.y0, 20, 1e-3);
  // The cut face is the 100 × 20 rectangle minus the Ø20 hole: 1600 mm².
  const area = p.section.triangles.reduce((s, t) => s + triArea(t), 0);
  near(area, 100 * 20 - 20 * 20, 1);
  // The triangles are in the projection's SVG path coordinates (the view's up, world +y here, is negated: SVG y runs down the sheet).
  const xs = p.section.triangles.flatMap((t) => [t[0], t[2], t[4]]); const ys = p.section.triangles.flatMap((t) => [t[1], t[3], t[5]]);
  near(Math.min(...xs), -50); near(Math.max(...xs), 50); near(Math.min(...ys), -p.box.y1); near(Math.max(...ys), -p.box.y0);

  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views.push(view);
  const projections = projectDrawing(body, d);
  assert.deepEqual(projections.get('v-sec').box, p.box);
  const svg = drawingSvg(d, projections);
  assertWellFormed(svg);
  assert.match(svg, /class="hatch"/);
  assert.match(svg, />SECTION A-A</);
  assert.match(svg, /class="cut-line"/, 'the parent (front) view shows the cutting plane');
  assert.equal((svg.match(/font-size="4.2" text-anchor="middle">A</g) ?? []).length, 2, 'a letter at each end of the cutting line');
  assert.match(drawingSvg(d, projections, { labels: { 'drawing.section': '단면' } }), />단면 A-A</);
  // Hatch lines stay inside the cut face: none crosses the hole (|x| < 10 in path coordinates).
  const hatch = svg.match(/<path d="([^"]+)" class="hatch"/)[1];
  for (const [, x0, , x1] of hatch.matchAll(/M (\S+) (\S+) L (\S+) \S+/g).map((m) => [0, Number(m[1]), 0, Number(m[3])])) assert.ok(!(Math.min(x0, x1) < -10.5 && Math.max(x0, x1) > 10.5), 'a hatch line jumps over the hole');
  // DXF: hatch on its own layer, label and cutting line on NOTES.
  const dxf = drawingDxf(d, projections);
  assert.match(dxf, /\n8\nHATCH\n/); assert.match(dxf, /\nTEXT\n8\nNOTES\n[\s\S]*?\n1\nSECTION A-A\n/);
  assert.match(dxf, /\n2\nNOTES\n/); assert.match(dxf, /\n2\nHATCH\n/);
  // Section views are laid out with the others and do not take the front view's place.
  const { places } = layoutViews(d, projections);
  assert.ok(places.get('v-sec').cy > places.get('v-front').cy);
  assert.notEqual(projectionKey(view), projectionKey({ ...view, plane: { point: [0, 0, 1], normal: [0, 0, 1] } }));
});

test('hatch segments fill a square at 45° and stay inside it', () => {
  const tris = [[0, 0, 10, 0, 10, 10], [0, 0, 10, 10, 0, 10]];
  const segs = hatchSegments(tris, 1);
  assert.ok(segs.length > 10);
  let total = 0;
  for (const [x0, y0, x1, y1] of segs) {
    for (const v of [x0, y0, x1, y1]) assert.ok(v > -1e-6 && v < 10 + 1e-6);
    near(Math.abs(x1 - x0), Math.abs(y1 - y0), 1e-6); // 45°
    assert.ok((x1 - x0) * (y1 - y0) <= 1e-9, 'up-right on the sheet (y down)');
    total += Math.hypot(x1 - x0, y1 - y0);
  }
  near(total, 100 / 1, 2); // area / spacing; the diagonal seam between the triangles is merged
  assert.equal(segs.length, new Set(segs.map((s) => Math.round((s[0] + s[1]) * 1000))).size, 'one segment per line: the triangles are merged');
});

test('detail view: the parent projection clipped to a circle at a larger scale, circle and letter on the parent', () => {
  const body = block();
  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  d.autoScale = false; d.scale = 1;
  d.views.push({ id: 'v-det', kind: 'detail', parent: 'v-top', center: [0, 0], radius: 12, scale: 2, label: 'B' });
  const projections = projectDrawing(body, d);
  assert.ok(!projections.has('v-det'), 'a detail view needs no projection of its own');
  const svg = drawingSvg(d, projections);
  assertWellFormed(svg);
  assert.match(svg, /<clipPath id="clip-d-v-det" clipPathUnits="userSpaceOnUse"><circle cx="0" cy="0" r="12"\/><\/clipPath>/);
  assert.match(svg, /clip-path="url\(#clip-d-v-det\)"/);
  assert.match(svg, /scale\(2\)/, 'drawn at twice the sheet scale');
  assert.match(svg, />DETAIL B \(2:1\)</);
  assert.match(svg, /class="detail-circle"/, 'the circle on the parent view');
  assert.match(svg, /font-size="4.2" text-anchor="start">B</);
  assert.match(drawingSvg(d, projections, { labels: { 'drawing.detail': '상세도' } }), />상세도 B \(2:1\)</);
  const { places } = layoutViews(d, projections);
  assert.ok(places.has('v-det'));
  // DXF: only the lines inside the circle (top view: the hole of radius 10 is inside, the block's outline is not).
  const dxf = drawingDxf(d, projections);
  assert.match(dxf, /\nCIRCLE\n8\nNOTES\n/);
  assert.match(dxf, /\n1\nDETAIL B \(2:1\)\n/);
  // A detail of a projection works without the kernel too (the parent's projection is reused).
  const fake = new Map([['v-front', { visible: ['M -50 0 L 50 0'], hidden: [], box: { x0: -50, y0: -10, x1: 50, y1: 10 } }]]);
  const e = createDrawing({ id: 'e', name: 'E', source: null });
  e.autoScale = false; e.scale = 0.5; // the label shows the view's own scale: sheet 1:2 × 4 = 2:1
  e.views = [{ id: 'v-front', type: 'front' }, { id: 'v-d', kind: 'detail', parent: 'v-front', radius: 5, scale: 4, label: 'C' }];
  const s2 = drawingSvg(e, fake);
  assertWellFormed(s2);
  assert.match(s2, /DETAIL C \(2:1\)/);
});

test('auxiliary (custom) view along a diagonal matches the camera basis', () => {
  const cube = R.makeBox([10, -1, 0], [11, 0, 1]);
  const view = { id: 'v-aux', type: 'custom', dir: [1, -1, 1], label: 'D' };
  const basis = viewBasis(view);
  near(basis.y[2] > 0 ? 1 : 0, 1, 0); // world Z stays up
  const p = projectView(cube, 'custom', view);
  const corners = [];
  for (const x of [10, 11]) for (const y of [-1, 0]) for (const z of [0, 1]) corners.push([x, y, z]);
  const u = corners.map((c) => c[0] * basis.x[0] + c[1] * basis.x[1] + c[2] * basis.x[2]);
  const v = corners.map((c) => c[0] * basis.y[0] + c[1] * basis.y[1] + c[2] * basis.y[2]);
  near(p.box.x0, Math.min(...u), 1e-3); near(p.box.x1, Math.max(...u), 1e-3);
  near(p.box.y0, Math.min(...v), 1e-3); near(p.box.y1, Math.max(...v), 1e-3);
  near(p.box.x1 - p.box.x0, Math.SQRT2, 1e-3); // a unit cube seen along its diagonal: a hexagon √2 wide
  assert.ok(p.visible.length >= 6);
  // An explicit x axis (or up) is honoured.
  const q = projectView(cube, 'custom', { type: 'custom', dir: [0, -1, 0], x: [0, 0, 1] });
  near(q.box.x1 - q.box.x0, 1); near(q.box.x0, 0);
  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  d.views.push(view);
  const svg = drawingSvg(d, projectDrawing(cube, d));
  assertWellFormed(svg);
  assert.match(svg, />VIEW D-D</);
});

test('every annotation kind renders well-formed SVG and goes to DXF', () => {
  const samples = {
    note: { id: 'a1', kind: 'note', x: 20, y: 30, text: 'NOTE <1> & "2"\n두 번째 줄', size: 3.5 },
    balloon: { id: 'a2', kind: 'balloon', x: 50, y: 50, target: [70, 70], item: 3 },
    gdt: { id: 'a3', kind: 'gdt', x: 100, y: 40, symbol: 'position', tolerance: '0.05', diameter: true, modifier: 'M', datums: ['A', 'B'], target: [90, 60] },
    datum: { id: 'a4', kind: 'datum', x: 150, y: 40, letter: 'A', target: [150, 60] },
    surface: { id: 'a5', kind: 'surface', x: 180, y: 60, ra: '1.6', process: 'removal' },
    centermark: { id: 'a6', kind: 'centermark', x: 200, y: 60, size: 12 },
    dimension: { id: 'a7', kind: 'dimension', a: [20, 150], b: [70, 150], offset: 8 },
  };
  assert.deepEqual(Object.keys(samples), ANNOTATION_KINDS);
  for (const kind of ANNOTATION_KINDS) {
    const svg = annotationSvg(samples[kind], { scale: 0.5 });
    assertWellFormed(svg);
    assert.match(svg, new RegExp(`^<g class="annotation ann-${kind}" data-annotation="${samples[kind].id}">`));
    if (kind !== 'note') assert.ok(svg.includes('<path'), `${kind} draws line work`);
  }
  assert.match(annotationSvg(samples.note), /NOTE &lt;1&gt; &amp; &quot;2&quot;/);
  assert.match(annotationSvg(samples.note), /<tspan[^>]*>두 번째 줄<\/tspan>/);
  // A manual dimension shows the model distance: 50 mm on a 1:2 sheet is 100.
  assert.match(annotationSvg(samples.dimension, { scale: 0.5 }), />100<\/text>/);
  assert.match(annotationSvg({ ...samples.dimension, text: 'Ø12 H7' }), />Ø12 H7<\/text>/);
  assert.match(annotationSvg({ ...samples.dimension, b: [70, 180], orient: 'vertical' }, { scale: 1 }), />30<\/text>/);
  assert.match(annotationSvg(samples.balloon), />3<\/text>/);
  for (const process of ['any', 'removal', 'noRemoval']) assertWellFormed(annotationSvg({ ...samples.surface, process }));
  assert.match(annotationSvg(samples.gdt, { selected: true }), /class="annotation ann-gdt selected"/);

  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'part', id: 'p' } });
  d.annotations = Object.values(samples);
  const fake = new Map(d.views.map((v) => [v.id, { visible: ['M 0 0 L 10 0'], hidden: [], box: { x0: 0, y0: 0, x1: 10, y1: 5 } }]));
  const svg = drawingSvg(d, fake, { selected: 'a3' });
  assertWellFormed(svg);
  for (const a of d.annotations) assert.ok(svg.includes(`data-annotation="${a.id}"`));
  const dxf = drawingDxf(d, fake);
  assert.ok(dxf.trim().endsWith('EOF'));
  assert.match(dxf, /\n2\nNOTES\n/);
  for (const text of ['NOTE <1> & "2"', '두 번째 줄', '3', '0.05', 'A', 'B', 'Ra 1.6']) assert.ok(dxf.includes(`\n1\n${text}\n`), `DXF TEXT ${text}`);
  assert.match(dxf, /\nCIRCLE\n8\nNOTES\n/);
  assert.match(dxf, /\nSOLID\n8\nNOTES\n/);
  // Every kind contributes something to the DXF.
  for (const a of d.annotations) assert.ok(annotationPrimitives(a, { scale: 1 }).length > 0, a.kind);
});

test('GD&T: every symbol is drawn as paths (no font glyphs), with tolerance, modifier and datum cells', () => {
  assert.equal(GDT_SYMBOLS.length, 14);
  const glyphs = new Set();
  for (const symbol of GDT_SYMBOLS) {
    const svg = annotationSvg({ id: symbol, kind: 'gdt', x: 0, y: 0, symbol, tolerance: '0.1', datums: ['A'] });
    assertWellFormed(svg);
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    assert.deepEqual(texts, ['0.1', 'A'], `${symbol}: only the tolerance and datum are text`);
    const paths = [...svg.matchAll(/<path d="([^"]+)" class="(ann-line|ann-fill)"/g)].map((m) => m[1]);
    assert.ok(paths.length >= 1, `${symbol} glyph`);
    glyphs.add(paths.join('|'));
  }
  assert.equal(glyphs.size, GDT_SYMBOLS.length, 'every symbol looks different');
  const frame = annotationSvg({ kind: 'gdt', x: 0, y: 0, symbol: 'position', tolerance: '0.05', diameter: true, modifier: 'L', datums: ['A', 'B', 'C'] });
  assert.equal((frame.match(/class="ann-frame"/g) ?? []).length, 1 + 4, 'outer frame + 4 cell dividers');
  assert.match(frame, />L<\/text>/);
});

test('bill of materials: quantities per part, missing parts and sub-assemblies, drawn above the title block', () => {
  const project = {
    parts: [
      { id: 'p1', name: 'Base', partNo: 'B-001', description: 'Plate', material: 'al-6061' },
      { id: 'p2', name: 'Pin', partNo: 'P-002', material: 'brass' },
    ],
    assemblies: [{ id: 'sub1', name: 'Wheel unit', components: [] }],
  };
  const asm = {
    id: 'a', name: 'Top', components: [
      { id: 'c1', part: 'p1' }, { id: 'c2', part: 'p2' }, { id: 'c3', part: 'p2' }, { id: 'c4', part: 'p2' },
      { id: 'c5', part: 'gone', name: 'Lost bracket' }, { id: 'c6', sub: 'sub1' }, { id: 'c7', sub: 'sub1' },
      { id: 'c8', part: 'p1', suppressed: true }, { id: 'c9', sub: 'nowhere' },
    ],
  };
  const rows = bomRows(asm, project);
  assert.deepEqual(rows.map((r) => [r.item, r.name, r.qty]), [[1, 'Base', 1], [2, 'Pin', 3], [3, 'Lost bracket', 1], [4, 'Wheel unit', 2], [5, 'nowhere', 1]]);
  assert.equal(rows[0].partNo, 'B-001'); assert.equal(rows[0].description, 'Plate');
  assert.equal(rows[0].material, 'Aluminium 6061-T6');
  assert.equal(bomRows(asm, project, { lang: 'ko' })[1].material, '황동');
  assert.deepEqual(rows[1].components, ['c2', 'c3', 'c4']);
  assert.deepEqual(bomRows({ components: [] }, project), []);
  assert.deepEqual(bomRows(null, null), []);

  const table = bomSvg(rows, { labels: { 'bom.qty': '수량' } });
  assertWellFormed(table);
  assert.match(table, />수량<\/text>/); assert.match(table, />ITEM NO.<\/text>/);
  const place = bomPlacement(rows, 'A3');
  near(place.x + place.w, 420 - 10); near(place.y + place.h, 297 - 10 - 40); // its bottom on the title block

  const d = createDrawing({ id: 'd', name: 'D', source: { kind: 'assembly', id: 'a' } });
  const fake = new Map(d.views.map((v) => [v.id, { visible: ['M 0 0 L 10 0'], hidden: [], box: { x0: 0, y0: 0, x1: 10, y1: 5 } }]));
  assert.ok(!drawingSvg(d, fake, { bomRows: rows }).includes('class="bom"'), 'hidden unless drawing.bom.show');
  d.bom = { show: true };
  const svg = drawingSvg(d, fake, { bomRows: rows });
  assertWellFormed(svg);
  assert.match(svg, /<g class="bom">/);
  assert.match(svg, />Pin<\/text>/); assert.match(svg, />Lost bracket<\/text>/);
  const dxf = drawingDxf(d, fake, { bomRows: rows });
  assert.ok(dxf.includes('\n1\nWheel unit\n') && dxf.includes('\n1\nPART NUMBER\n'));
  d.bom = { show: true, x: 30, y: 40 };
  assert.match(drawingSvg(d, fake, { bomRows: rows }), /<path d="M 30 40 L /);
});

test('a full sheet with every new feature renders and exports', () => {
  const body = block();
  const d = createDrawing({ id: 'full', name: 'Full', source: { kind: 'part', id: 'p' } });
  d.views.push(
    { id: 'v-sa', type: 'front', kind: 'section', parent: 'v-right', label: 'A', plane: { point: [0, -10, 0], normal: [0, -1, 0] } },
    { id: 'v-sc', type: 'right', kind: 'section', parent: 'v-front', label: 'C', plane: { point: [20, 0, 0], normal: [1, 0, 0] } },
    { id: 'v-db', kind: 'detail', parent: 'v-sa', center: [0, 0], radius: 15, scale: 2, label: 'B' },
    { id: 'v-aux', type: 'custom', dir: [1, 0, 1], label: 'D' },
  );
  d.annotations = ANNOTATION_KINDS.map((kind, i) => ({ id: `n${i}`, kind, x: 40 + i * 20, y: 30, text: 'T', item: i, symbol: GDT_SYMBOLS[i], tolerance: '0.1', datums: ['A'], letter: 'A', ra: '3.2', a: [40, 250], b: [90, 250] }));
  d.bom = { show: true };
  const projections = projectDrawing(body, d, new Map());
  const svg = drawingSvg(d, projections, { bomRows: [{ item: 1, partNo: '', name: 'Block', description: '', material: '', qty: 1 }], info: { name: 'Block' } });
  assertWellFormed(svg);
  assert.equal((svg.match(/class="hatch"/g) ?? []).length, 3, 'two sections and the detail of a section');
  assert.equal((svg.match(/class="cut-line"/g) ?? []).length, 2);
  const dxf = drawingDxf(d, projections, { bomRows: [{ item: 1, name: 'Block', qty: 1 }] });
  assert.ok(dxf.includes('\n1\nSECTION C-C\n') && dxf.includes('\n1\nDETAIL B') && dxf.includes('\n1\nBlock\n'));
});
