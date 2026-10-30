// Model editor UI logic: connection shapes (꺾은 선 / 직선 / 곡선), the block
// hover description and the 코드 보기 width the splitter may drag to.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { newModel, makeBlock, connect, portGeometry } from '../core/sim/model.js';
import { blockDef } from '../core/sim/blocks/index.js';
import { modelToCode } from '../core/sim/codegen.js';
import { lineGeometry, curveThrough, distToPolyline, lineStyleOf, LINE_STYLES, LINE_STYLE_ICON } from '../src/sim/render.js';
import { blockTipInfo, CODE_PANE, codePaneMax, codePaneWidth } from '../src/sim/logic.js';
import { tr, lbl } from '../src/sim/i18n.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Gain → Gain one row apart, so the 꺾은 선 route has elbows. */
function twoBlocks(style, points = []) {
  const m = newModel('t');
  const a = makeBlock(m, 'Gain', { x: 0, y: 0 });
  const b = makeBlock(m, 'Gain', { x: 200, y: 120 });
  a.name = 'A'; b.name = 'B';
  m.root.blocks.push(a, b);
  const l = connect(m, m.root, { block: a.id, port: 1 }, { block: b.id, port: 1 }, points);
  if (style) l.style = style;
  const byId = new Map(m.root.blocks.map((x) => [x.id, x]));
  const src = portGeometry(a).out[0], dst = portGeometry(b).in[0];
  return { m, a, b, l, geo: () => lineGeometry(m.root, byId), src, dst };
}

test('line shapes: unknown or missing style is 꺾은 선', () => {
  assert.deepEqual(LINE_STYLES, ['ortho', 'straight', 'curve']);
  assert.equal(lineStyleOf({}), 'ortho');
  assert.equal(lineStyleOf({ style: 'zigzag' }), 'ortho');
  assert.equal(lineStyleOf({ style: 'curve' }), 'curve');
  assert.equal(lineStyleOf(null), 'ortho');
});

test('꺾은 선: every segment horizontal or vertical, ends on the ports', () => {
  const { geo, src, dst } = twoBlocks(null);
  const [it] = geo();
  assert.ok(it.pts.length > 2, 'the route has elbows');
  for (let i = 0; i + 1 < it.pts.length; i++) {
    const [p, q] = [it.pts[i], it.pts[i + 1]];
    assert.ok(near(p[0], q[0]) || near(p[1], q[1]), `segment ${i} is axis-aligned`);
  }
  assert.deepEqual(it.pts[0], [src.x, src.y]);
  assert.deepEqual(it.pts.at(-1), [dst.x, dst.y]);
  assert.equal(it.ctrl, undefined);
});

test('직선: port to port with no elbows, through the user points as they are', () => {
  const { geo, src, dst } = twoBlocks('straight');
  assert.deepEqual(geo()[0].pts, [[src.x, src.y], [dst.x, dst.y]]);
  const t = twoBlocks('straight', [[120, 30]]);
  assert.deepEqual(t.geo()[0].pts, [[t.src.x, t.src.y], [120, 30], [t.dst.x, t.dst.y]]);
});

test('곡선: smooth, leaves and enters along the ports, keeps the points it goes through', () => {
  const { geo, src, dst } = twoBlocks('curve');
  const [it] = geo();
  assert.deepEqual(it.ctrl, [[src.x, src.y], [dst.x, dst.y]]);
  assert.ok(it.pts.length > 10, 'sampled');
  assert.deepEqual(it.pts[0], [src.x, src.y]);
  assert.deepEqual(it.pts.at(-1), [dst.x, dst.y]);
  // out port faces right: the first step goes right and not up or down much
  const [p0, p1] = it.pts;
  assert.ok(p1[0] > p0[0] && Math.abs(p1[1] - p0[1]) < (p1[0] - p0[0]), 'leaves to the right');
  // in port faces left: the last step arrives moving right
  const [q0, q1] = it.pts.slice(-2);
  assert.ok(q1[0] > q0[0] && Math.abs(q1[1] - q0[1]) < (q1[0] - q0[0]), 'enters from the left');
  // the curve is not the straight chord
  assert.ok(it.pts.some((p) => distToPolyline([[src.x, src.y], [dst.x, dst.y]], p[0], p[1]).d > 5), 'bends away from the straight chord');
  // through a user point
  const t = twoBlocks('curve', [[120, 30]]);
  const g = t.geo()[0];
  assert.ok(g.pts.some((p) => near(p[0], 120) && near(p[1], 30)), 'passes through the point');
  assert.ok(distToPolyline(g.pts, 120, 30).d < 1e-6);
});

test('curveThrough: ends exact, no direction = toward the next point', () => {
  const c = curveThrough([[0, 0], [100, 0]]);
  assert.deepEqual(c[0], [0, 0]);
  assert.deepEqual(c.at(-1), [100, 0]);
  assert.ok(c.every((p) => near(p[1], 0)), 'a straight pair without port directions stays on the line');
  assert.deepEqual(curveThrough([[3, 4]]), [[3, 4]]);
});

test('branches follow the line shape', () => {
  const { m, a, l, geo } = twoBlocks('straight');
  const c = makeBlock(m, 'Gain', { x: 200, y: -120 });
  c.name = 'C'; m.root.blocks.push(c);
  connect(m, m.root, { block: a.id, port: 1 }, { block: c.id, port: 1 });
  m.root.lines[0].branches[0].points = [];
  const byId = new Map(m.root.blocks.map((x) => [x.id, x]));
  const straight = lineGeometry(m.root, byId).filter((it) => it.dst);
  assert.ok(straight.length >= 2);
  for (const it of straight) assert.ok(it.pts.length <= 2 + (it.seg.points || []).length, 'a 직선 branch has no added elbows');
  l.style = 'curve';
  const items = lineGeometry(m.root, byId).filter((it) => it.dst);
  assert.ok(items.length >= 2 && items.every((it) => it.ctrl), 'every branch to a block is a curve');
  assert.ok(geo().length >= 2);
});

test('line shape is offered in the context menu and the properties pane, with icons in both icon sets', () => {
  const editor = read('../src/sim/ModelEditor.jsx');
  const panes = read('../src/sim/SidePanes.jsx');
  assert.match(editor, /LINE_STYLES\.map/);
  assert.match(panes, /LineStyleRow/);
  assert.match(editor, /put\(l, 'style'/);
  for (const name of Object.values(LINE_STYLE_ICON)) {
    assert.match(read('../src/sim/icons.jsx'), new RegExp(`^\\s{2}${name}:`, 'm'), `${name} in sim/icons.jsx`);
    assert.match(read('../src/components/Chrome.jsx'), new RegExp(`^\\s{2}${name}:`, 'm'), `${name} in Chrome.jsx`);
  }
  for (const k of ['line_style', 'line_ortho', 'line_straight', 'line_curve', 'subsystem']) {
    assert.notEqual(tr('ko', k), k, `ko ${k}`);
    assert.notEqual(tr('en', k), k, `en ${k}`);
  }
  assert.equal(tr('ko', 'line_straight'), '직선');
  assert.equal(tr('ko', 'line_ortho'), '꺾은 선');
  assert.equal(tr('ko', 'line_curve'), '곡선');
});

test('a line shape is noted in the generated M code', () => {
  const { m } = twoBlocks('curve');
  assert.match(modelToCode(m, 't'), /line shapes/);
  const plain = twoBlocks(null);
  assert.doesNotMatch(modelToCode(plain.m, 't'), /line shapes/);
});

test('block hover description: name, kind, what it does; mask and subsystem', () => {
  const m = newModel('t');
  const g = makeBlock(m, 'Gain'); g.name = 'Gain1';
  const ko = { lbl: (v) => lbl('ko', v), subsystem: tr('ko', 'subsystem') };
  const en = { lbl: (v) => lbl('en', v), subsystem: tr('en', 'subsystem') };
  const def = blockDef('Gain');
  const t = blockTipInfo(g, def, en);
  assert.equal(t.title, 'Gain1');
  assert.equal(t.sub, lbl('en', def.label));
  assert.equal(t.text, lbl('en', def.desc));
  assert.ok(t.text.length > 0, 'Gain has a description');
  assert.equal(blockTipInfo(g, def, ko).text, lbl('ko', def.desc));
  // kind equal to the name is not repeated
  g.name = lbl('en', def.label);
  assert.equal(blockTipInfo(g, def, en).sub, '');
  // a masked block shows its mask
  g.mask = { type: 'Motor', description: 'DC motor model', params: [] };
  assert.deepEqual(blockTipInfo(g, def, en), { title: g.name, sub: 'Motor', text: 'DC motor model' });
  // a subsystem without a definition
  const s = { name: 'Plant', type: 'SubSystemX', system: { blocks: [], lines: [] } };
  assert.deepEqual(blockTipInfo(s, null, ko), { title: 'Plant', sub: '서브시스템', text: '' });
  // every library block has a description to show
  const missing = [];
  for (const type of ['Gain', 'Sum', 'Integrator', 'Scope', 'Constant']) if (!lbl('ko', blockDef(type).desc)) missing.push(type);
  assert.deepEqual(missing, []);
});

test('code pane width: splitter limits keep the pane and the canvas usable', () => {
  assert.equal(CODE_PANE.min, 240);
  assert.equal(CODE_PANE.width, 440);
  assert.equal(codePaneMax(1200, 232), 1200 - 232 - CODE_PANE.canvasMin);
  assert.equal(codePaneMax(1200, 0), 1000);
  assert.equal(codePaneMax(300, 232), CODE_PANE.min, 'never below the minimum');
  assert.equal(codePaneWidth(undefined, 1200), 440, 'default');
  assert.equal(codePaneWidth(100, 1200), 240, 'clamped up');
  assert.equal(codePaneWidth(5000, 1200, 232), 768, 'clamped down');
  assert.equal(codePaneWidth(512.4, 1200), 512);
});

test('the code pane has a splitter and takes its width; the canvas shows block descriptions', () => {
  const editor = read('../src/sim/ModelEditor.jsx');
  const pane = read('../src/sim/ModelCodePane.jsx');
  assert.match(editor, /<Splitter axis="x" dir=\{-1\} value=\{codeW\}/);
  assert.match(editor, /codeW: w/, 'the dragged width is remembered with the view toggles');
  assert.match(pane, /flexBasis: width/);
  assert.match(editor, /h\.kind === 'block' \|\| h\.kind === 'in' \|\| h\.kind === 'out'/);
  assert.match(editor, /sim-tip-block/);
  assert.match(read('../src/sim/sim.css'), /\.sim-tip-block \{[^}]*white-space: normal/);
});
