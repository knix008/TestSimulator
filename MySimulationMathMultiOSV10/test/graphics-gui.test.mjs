// Pure parts of the figure area (src/graphics): the GUI scene store, the
// controller's side of the engine protocol (driven by a fake engine), the
// export encoders (base64, deflate, PDF) and the SVG recorder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyScene, reduceScene, axesOf, findNode, lightsOf, applyToggles, anyShown, figureTitle, uiItems, niceStep, zoomLimits, panLimits, nearestPoint, fmtNum } from '../src/graphics/scene.js';
import { FigureController, lightOptionsFor } from '../src/graphics/controller.js';
import { bytesToBase64, base64ToBytes, deflate, rgbaToRgb, buildPdf } from '../src/graphics/encode.js';
import { SvgContext, svgColor, parseFont } from '../src/graphics/svgctx.js';
import { tr, FIG_STRINGS } from '../src/graphics/i18n.js';

const M = (data, m = 1) => ({ dims: [m, data.length / m], data });
function line(id, xs, ys, extra = {}) { return { id, type: 'line', props: { XData: M(xs), YData: M(ys), Visible: true, DisplayName: '', ...extra }, children: [], auto: [] }; }
function axes(id, children, extra = {}) {
  return { id, type: 'axes', auto: ['Color'], children, props: { XLim: [0, 10], YLim: [-1, 1], ZLim: [-1, 1], XLimMode: 'auto', YLimMode: 'auto', View: [0, 90], Is3D: false, XScale: 'linear', YScale: 'linear', FontSize: 10, Legend: null, Colorbar: null, CLim: [0, 1], ...extra } };
}
function figure(id, children, extra = {}) { return { id, type: 'figure', auto: ['Color'], children, props: { Number: id, Name: '', NumberTitle: true, Visible: true, Position: [0, 0, 560, 420], ...extra } }; }

function fakeEngine() {
  const listeners = new Map();
  const handlers = new Map();
  return {
    state: 'ready', posted: [],
    post(m) { this.posted.push(m); },
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
    onRequest(type, fn) { handlers.set(type, fn); return () => handlers.delete(type); },
    emit(type, msg) { for (const fn of listeners.get(type) || []) fn(msg, type); },
    request(msg) { const fn = handlers.get(msg.type); return fn ? Promise.resolve(fn(msg)) : Promise.resolve(null); },
    of(type) { return this.posted.filter((m) => m.type === type); },
  };
}

test('reduceScene: full snapshot, update, close, current figure and limit changes', () => {
  let s = emptyScene();
  const f1 = figure(1, [axes(1.1, [line(1.2, [1, 2], [3, 4])])]);
  const f2 = figure(2, []);
  let r = reduceScene(s, { type: 'graphics.scene', figures: [f2, f1], current: 2 });
  s = r.state;
  assert.deepEqual(s.order, [1, 2]);
  assert.equal(s.current, 2);
  assert.equal(r.activate, 2);
  const f1b = figure(1, [axes(1.1, [], { XLim: [2, 3] })]);
  r = reduceScene(s, { type: 'graphics.update', figures: [f1b], current: 1 });
  assert.deepEqual(r.changed, [1]);
  assert.deepEqual(r.limitsChanged, [1.1]);
  assert.equal(r.activate, 1);
  assert.equal(r.state.figures.get(2), f2, 'figures not in an update are kept');
  r = reduceScene(r.state, { type: 'graphics.close', id: 2 });
  assert.deepEqual(r.closed, [2]);
  assert.deepEqual(r.state.order, [1]);
  const again = reduceScene(r.state, { type: 'graphics.close', id: 99 });
  assert.equal(again.state, r.state, 'closing an unknown figure changes nothing');
  r = reduceScene(r.state, { type: 'graphics.scene', figures: [], current: null });
  assert.deepEqual(r.closed, [1]);
  assert.equal(r.state.figures.size, 0);
});

test('tree helpers: axes inside layouts, inline nodes, lights, titles, items', () => {
  const lg = { id: 5.5, type: 'legend', props: { Visible: true }, children: [], auto: [] };
  const L = { id: 5.7, type: 'light', props: { Position: [1, 0, 1] }, children: [], auto: [] };
  const ax = axes(5.1, [{ id: 5.6, type: 'hggroup', props: {}, children: [L], auto: [] }], { Legend: lg });
  const fig = figure(5, [{ id: 5.2, type: 'tiledlayout', props: {}, children: [ax], auto: [] }], { Name: 'Run' });
  assert.deepEqual(axesOf(fig).map((a) => a.id), [5.1]);
  assert.equal(findNode(fig, 5.5), lg);
  assert.deepEqual(lightsOf(ax), [L]);
  assert.equal(figureTitle(fig, 'Figure {n}'), 'Figure 5: Run');
  assert.equal(figureTitle({ id: 3, props: { Number: 3, Name: 'Plain', NumberTitle: false } }), 'Plain');
  assert.deepEqual(uiItems('a|b|c'), ['a', 'b', 'c']);
  assert.deepEqual(uiItems(['x', 'y']), ['x', 'y']);
  assert.equal(niceStep(100), 5);
  assert.equal(niceStep(4), 0.2);
  assert.equal(fmtNum(0.0000125), '1.25e-5');
  assert.equal(fmtNum(Math.PI), '3.1416');
});

test('legend / colorbar toggles: synthetic nodes for missing ones, graphics.set for real ones', () => {
  const a1 = axes(1.1, [line(1.3, [0, 1], [0, 1], { DisplayName: 'up' }), line(1.2, [0, 1], [1, 0])]);
  const real = { id: 1.9, type: 'legend', props: { Visible: true, Entries: [] }, children: [], auto: [] };
  const a2 = axes(1.4, [line(1.5, [0, 1], [0, 1])], { Legend: real });
  const fig = figure(1, [a1, a2]);
  let sync = applyToggles(fig, { legend: false });
  assert.deepEqual(sync, [{ handle: 1.9, props: { Visible: false } }]);
  assert.equal(anyShown(fig, 'Legend'), false);
  sync = applyToggles(fig, { legend: true, colorbar: true });
  assert.equal(a1.props.Legend.synthetic, true);
  assert.deepEqual(a1.props.Legend.props.Entries.map((e) => e.label), ['data1', 'up'], 'creation order, DisplayName first');
  assert.equal(a1.props.Colorbar.synthetic, true);
  assert.deepEqual(sync, [{ handle: 1.9, props: { Visible: true } }]);
  applyToggles(fig, { colorbar: false });
  assert.equal(a1.props.Colorbar, null);
});

test('2D view math: zoom about a pixel, pan, nearest data point', () => {
  // 100 px per unit, x = 0 at px 0
  const toPx = (v) => v * 100, fromPx = (p) => p / 100;
  assert.deepEqual(zoomLimits([0, 10], toPx, fromPx, 500, 2), [2.5, 7.5]);
  assert.deepEqual(zoomLimits([0, 10], toPx, fromPx, 0, 0.5), [0, 20]);
  assert.deepEqual(panLimits([0, 10], toPx, fromPx, 100), [-1, 9]);
  const ax = axes(1.1, [line(1.2, [0, 1, 2], [0, 5, 0]), { id: 1.3, type: 'line', props: { XData: M([9]), YData: M([9]), Visible: false }, children: [] }]);
  const mapper = { x: (v) => v * 100, y: (v) => 1000 - v * 100 };
  const hit = nearestPoint(ax, mapper, 105, 505);
  assert.equal(hit.x, 1); assert.equal(hit.y, 5); assert.equal(hit.index, 2);
  assert.equal(nearestPoint(ax, mapper, 900, 100), null, 'hidden lines are ignored; too far is null');
});

test('controller: sync on attach, scene, resize, close, mode and current figure', async () => {
  const e = fakeEngine();
  const ctl = new FigureController(e, {});
  const detach = ctl.attach();
  assert.deepEqual(e.of('graphics.sync'), [{ type: 'graphics.sync' }]);
  let renders = 0;
  ctl.subscribe(() => { renders += 1; });
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [])]), figure(2, [])], current: 2 });
  assert.equal(ctl.active, 2);
  assert.ok(renders > 0);
  ctl.selectFigure(1);
  assert.deepEqual(e.of('graphics.current').at(-1), { type: 'graphics.current', id: 1 });
  e.emit('graphics.mode', { type: 'graphics.mode', figure: 1, mode: 'rotate' });
  assert.equal(ctl.mode(1), 'rotate');
  ctl.setMode('rotate', 1);
  assert.equal(ctl.mode(1), 'none', 'pressing the active mode again switches it off');
  ctl.reportSize(1, 800.4, 600);
  ctl.reportSize(1, 800, 600);
  await new Promise((r) => setTimeout(r, 160));
  assert.deepEqual(e.of('graphics.resize'), [{ type: 'graphics.resize', id: 1, width: 800, height: 600 }]);
  ctl.closeFigure(2);
  assert.deepEqual(e.of('graphics.close').at(-1), { type: 'graphics.close', id: 2 });
  assert.ok(ctl.scene.figures.has(2), 'the engine confirms the close');
  e.emit('graphics.close', { type: 'graphics.close', id: 2 });
  assert.equal(ctl.scene.figures.has(2), false);
  detach();
});

test('controller: zoom / pan sync with graphics.set, no reset on its own echo, fit restores auto limits', async () => {
  const e = fakeEngine();
  const ctl = new FigureController(e, {});
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [line(1.2, [0, 10], [-1, 1])])])], current: 1 });
  const ax = ctl.targetAxes();
  assert.equal(ctl.zoomPercent(), 100);
  ctl.zoomBy(2);
  assert.deepEqual(ctl.limits2d(ax).XLim, [2.5, 7.5]);
  assert.equal(ctl.zoomPercent(), 200);
  await new Promise((r) => setTimeout(r, 360));
  const set = e.of('graphics.set').at(-1);
  assert.deepEqual(set, { type: 'graphics.set', handle: 1.1, props: { XLim: [2.5, 7.5], YLim: [-0.5, 0.5] } });
  // the engine later sends the figure with the limits the GUI set: the zoom stays and home is kept
  e.emit('graphics.update', { type: 'graphics.update', figures: [figure(1, [axes(1.1, [], { XLim: [2.5, 7.5], YLim: [-0.5, 0.5], XLimMode: 'manual', YLimMode: 'manual' })])], current: 1 });
  assert.equal(ctl.zoomPercent(), 200);
  ctl.setZoomPercent(400);
  assert.equal(ctl.zoomPercent(), 400);
  ctl.resetView();
  const fit = e.of('graphics.set').at(-1);
  assert.deepEqual(fit.props, { XLimMode: 'auto', YLimMode: 'auto' });
  assert.equal(ctl.zoomPercent(), 100);
  assert.deepEqual(ctl.targetAxes().props.XLim, [0, 10]);
  // an engine-side change (xlim in code) becomes the new home
  e.emit('graphics.update', { type: 'graphics.update', figures: [figure(1, [axes(1.1, [], { XLim: [0, 4] })])], current: 1 });
  assert.equal(ctl.zoomPercent(), 100);
});

test('controller: 2D / 3D toggle sends View and remembers the last 3D angles', () => {
  const e = fakeEngine();
  const ctl = new FigureController(e, {});
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [], { View: [30, 20], Is3D: true })])], current: 1 });
  ctl.toggle2d3d();
  const ax = ctl.targetAxes();
  assert.deepEqual(e.of('graphics.set').at(-1), { type: 'graphics.set', handle: 1.1, props: { View: [0, 90] } });
  assert.equal(ax.props.Is3D, false);
  ctl.toggle2d3d();
  assert.deepEqual(e.of('graphics.set').at(-1).props, { View: [30, 20] });
  assert.equal(ax.props.Is3D, true);
  ctl.commitView3d(ax, [-50.123, 44.5]);
  assert.deepEqual(ax.props.View, [-50.12, 44.5]);
  ctl.toggle2d3d(); ctl.toggle2d3d();
  assert.deepEqual(ax.props.View, [-50.12, 44.5]);
  // a plain 2D plot gets the default 3D view
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(2, [axes(2.1, [])])], current: 2 });
  ctl.toggle2d3d();
  assert.deepEqual(ctl.targetAxes().props.View, [-37.5, 30]);
});

test('lighting: light objects from M code switch 3D lighting on; no GUI light controls', () => {
  const L = { id: 1.5, type: 'light', props: { Position: [1, 0, 1], Visible: true, Style: 'infinite', Color: [1, 1, 1] }, children: [], auto: [] };
  const lit = axes(1.1, [{ id: 1.6, type: 'hggroup', props: {}, children: [L], auto: [] }], { Is3D: true });
  assert.deepEqual(lightOptionsFor(lit), { lighting: true, defaultLight: false });
  assert.deepEqual(lightOptionsFor(axes(2.1, [], { Is3D: true })), { lighting: false, defaultLight: false });
  const ctl = new FigureController(fakeEngine(), {});
  for (const gone of ['setLight', 'setGuiLight', 'guiLight', 'setLightsOpen', 'lightsOfAxes']) assert.equal(typeof ctl[gone], 'undefined', gone);
  assert.equal(ctl.paintOptions(figure(1, [])).lightOpts(lit).lighting, true);
});

test('controller: blocking requests (export, getframe, dialogs, ginput, uiwait)', async () => {
  const e = fakeEngine();
  const asked = [];
  const ctl = new FigureController(e, {
    exportFigure: async (fig, req) => ({ bytes: new Uint8Array([req.width & 255, req.height & 255, 7]), ext: req.format }),
    frame: (fig, o) => ({ width: o.width, height: o.height, rgba: '' }),
    toBase64: bytesToBase64,
    copyImage: async () => {},
    ask: async (o) => { asked.push(o); return o.buttons ? o.buttons[1].id : true; },
    chooseFile: async () => 'C:/work/data/run.csv',
    lang: () => 'en',
  });
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [])])], current: 1 });
  ctl.reportSize(1, 300, 200);
  const ex = await e.request({ type: 'graphics.export', figure: 1, format: 'png' });
  assert.deepEqual(base64ToBytes(ex.data), new Uint8Array([300 & 255, 200, 7]));
  assert.ok((await e.request({ type: 'graphics.export', figure: 9, format: 'png' })).error);
  assert.deepEqual(await e.request({ type: 'graphics.getframe', figure: 1, axes: null }), { width: 300, height: 200, rgba: '' });
  assert.deepEqual(await e.request({ type: 'graphics.dialog', kind: 'questdlg', title: 'Q', message: 'Go?', buttons: ['Yes', 'No'], default: 'Yes' }), { answer: 'No' });
  assert.deepEqual(await e.request({ type: 'graphics.dialog', kind: 'uigetfile', filter: ['*.csv'], cwd: '/' }), { file: 'run.csv', path: 'C:/work/data/' });
  const inp = e.request({ type: 'graphics.dialog', kind: 'inputdlg', prompts: ['a'], defaults: ['1'] });
  await Promise.resolve();
  assert.equal(ctl.dialog.kind, 'inputdlg');
  ctl.dialog.resolve({ values: ['42'] });
  assert.deepEqual(await inp, { values: ['42'] });
  const gi = e.request({ type: 'graphics.ginput', figure: 1, n: 2 });
  await Promise.resolve();
  ctl.addGinputPoint(1, 2, 1);
  ctl.addGinputPoint(3, 4, 3);
  assert.deepEqual(await gi, { points: [[1, 2, 1], [3, 4, 3]] });
  const key = e.request({ type: 'graphics.ginput', figure: 1, n: 1 });
  await Promise.resolve();
  ctl.finishGinput('a');
  assert.deepEqual(await key, { points: [], key: 'a' });
  const w = e.request({ type: 'graphics.uiwait', figure: 1, timeout: null });
  await Promise.resolve();
  e.emit('graphics.uiresume', { type: 'graphics.uiresume' });
  assert.deepEqual(await w, { ok: true });
  e.emit('graphics.dialog', { type: 'graphics.dialog', kind: 'errordlg', title: '', message: 'bad' });
  assert.equal(asked.at(-1).kind, 'error');
  assert.equal(asked.at(-1).title, 'Error');
});

test('encoders: base64, RGBA → RGB, deflate round trip and a well-formed PDF', async () => {
  const bytes = new Uint8Array(70000).map((_, i) => (i * 31) & 255);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  assert.deepEqual(rgbaToRgb(new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0])), new Uint8Array([255, 0, 0, 255, 255, 255]));
  const z = await deflate(bytes);
  const back = new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  assert.deepEqual(back, bytes);
  const pdf = buildPdf({ pageW: 420, pageH: 315, imgW: 2, imgH: 1, data: new Uint8Array([1, 2, 3, 4, 5, 6]), flate: false, title: 'Fig (1)' });
  const text = new TextDecoder('latin1').decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/MediaBox \[0 0 420 315\]/);
  assert.match(text, /\/Title \(Fig \\\(1\\\)\)/);
  const start = Number(/startxref\n(\d+)/.exec(text)[1]);
  assert.ok(text.slice(start).startsWith('xref'));
  const offs = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(offs.length, 6);
  offs.forEach((o, i) => assert.ok(text.slice(o).startsWith(`${i + 1} 0 obj`), `xref entry ${i + 1}`));
});

test('SVG recorder: paths, transforms, clipping groups, text and colours', () => {
  const g = new SvgContext(200, 100);
  g.fillStyle = 'rgba(255,0,0,0.5)';
  g.fillRect(10, 10, 20, 20);
  g.save();
  g.beginPath(); g.rect(0, 0, 100, 50); g.clip();
  g.translate(50, 25); g.rotate(Math.PI / 2);
  g.strokeStyle = '#00f'; g.lineWidth = 2; g.setLineDash([4, 2]);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(10, 0); g.stroke();
  g.font = 'bold 12px "Segoe UI", sans-serif'; g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('a<b', 0, 0);
  g.restore();
  g.beginPath(); g.arc(100, 50, 10, 0, Math.PI * 2); g.fill();
  const s = g.toString();
  assert.match(s, /^<\?xml/);
  assert.match(s, /<path d="M10 10L30 10L30 30L10 30Z" fill="rgb\(255,0,0\)" fill-opacity="0.5"/);
  assert.match(s, /M50 25L50 35/, 'the rotated line is stored in device coordinates');
  assert.match(s, /stroke-dasharray="4 2"/);
  assert.match(s, /<text [^>]*font-weight="bold"[^>]*text-anchor="middle"[^>]*dominant-baseline="central"[^>]*>a&lt;b<\/text>/);
  assert.equal((s.match(/<g /g) || []).length, (s.match(/<\/g>/g) || []).length, 'clip groups are closed');
  assert.deepEqual(svgColor('rgba(1, 2, 3, 0.25)'), { color: 'rgb(1,2,3)', alpha: 0.25 });
  assert.deepEqual(parseFont('italic 9.5px serif'), { style: 'italic', weight: 'normal', size: 9.5, family: 'serif' });
  assert.ok(g.measureText('abcd').width > 0);
});

test('figure area strings exist in both languages', () => {
  const en = Object.keys(FIG_STRINGS.en).sort(), ko = Object.keys(FIG_STRINGS.ko).sort();
  assert.deepEqual(ko, en);
  assert.equal(tr('en', 'figure', { n: 3 }), 'Figure 3');
  assert.equal(tr('ko', 'figure', { n: 3 }), '그림 3');
});

test('engine: get / set on graphics handles (no recursion through the handle class methods)', async () => {
  const { createSessionWith } = await import('../core/lang/session.js');
  const { createMemoryFs } = await import('../core/fs-memory.js');
  const gfx = await import('../core/graphics/index.js');
  const registry = { builtins: gfx.builtins, help: {}, classes: gfx.classes, owner: {}, installs: [gfx.install] };
  const out = [];
  const s = createSessionWith(registry, { fs: createMemoryFs({}), print: (t) => out.push(t), onEvent: () => {}, host: { post() {}, request: () => null } });
  const run = (code) => { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); };
  run("plot(1:10); a = gca; v = get(a, 'View'); xl = get(gca, 'XLim'); set(a, 'XLim', [2 5]); xl2 = a.XLim; c = get(a, {'XScale', 'YScale'});");
  const val = (n) => Array.from(s.getVariable(n).re);
  assert.deepEqual(val('v'), [0, 90]);
  assert.equal(val('xl').length, 2);
  assert.deepEqual(val('xl2'), [2, 5]);
  assert.deepEqual(s.getVariable('c').dims, [1, 2]);
  run("f = gcf; set(f, 'Name', 'run'); n = get(f, 'Name'); s2 = get(f);");
  assert.equal(String.fromCharCode(...s.getVariable('n').re), 'run');
  assert.equal(s.getVariable('s2').cls, 'struct');
});

// ---------------------------------------------------------------- export dialog: GIF encoder and options

/** A small independent GIF decoder (one frame, global palette) for the tests. */
function decodeGif(b) {
  assert.equal(String.fromCharCode(...b.subarray(0, 6)), 'GIF89a');
  const w = b[6] | (b[7] << 8), h = b[8] | (b[9] << 8);
  const size = 2 << (b[10] & 7);
  const pal = [];
  let p = 13;
  for (let i = 0; i < size; i++, p += 3) pal.push([b[p], b[p + 1], b[p + 2]]);
  let trans = -1;
  while (b[p] === 0x21) { if (b[p + 1] === 0xf9 && (b[p + 3] & 1)) trans = b[p + 6]; p += 2; while (b[p]) p += b[p] + 1; p += 1; }
  assert.equal(b[p], 0x2c);
  p += 10;
  const minCode = b[p++];
  const data = [];
  while (b[p]) { const n = b[p]; for (let i = 1; i <= n; i++) data.push(b[p + i]); p += n + 1; }
  assert.equal(b[p + 1], 0x3b, 'trailer');
  const clear = 1 << minCode, eoi = clear + 1;
  let codeSize, dict, prev, bitPos = 0;
  const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = []; codeSize = minCode + 1; prev = null; };
  reset();
  const out = [];
  for (;;) {
    let code = 0;
    for (let i = 0; i < codeSize; i++, bitPos++) code |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i;
    if (code === clear) { reset(); continue; }
    if (code === eoi) break;
    let entry;
    if (code < dict.length) entry = dict[code];
    else if (code === dict.length && prev) entry = [...prev, prev[0]];
    else throw new Error(`bad LZW code ${code}`);
    for (const x of entry) out.push(x);
    if (prev) { dict.push([...prev, entry[0]]); if (dict.length === 1 << codeSize && codeSize < 12) codeSize++; }
    prev = entry;
  }
  return { w, h, pal, trans, indices: out };
}

test('GIF encoder: exact colours, transparency and LZW that survives dictionary resets', async () => {
  const { encodeGif, quantize, lzwEncode } = await import('../src/graphics/encode.js');
  const w = 37, h = 23;
  const cols = [[255, 0, 0], [0, 128, 255], [10, 20, 30], [255, 255, 255], [0, 0, 0], [12, 200, 90]];
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const c = cols[(i * 7 + (i >> 3)) % cols.length]; px.set([...c, i % 11 === 0 ? 0 : 255], 4 * i); }
  const g = decodeGif(encodeGif(px, w, h, { transparent: true }));
  assert.equal(g.w, w); assert.equal(g.h, h);
  assert.equal(g.indices.length, w * h);
  assert.ok(g.trans >= 0);
  for (let i = 0; i < w * h; i++) {
    if (px[4 * i + 3] < 128) assert.equal(g.indices[i], g.trans);
    else assert.deepEqual(g.pal[g.indices[i]], Array.from(px.subarray(4 * i, 4 * i + 3)), `pixel ${i}`);
  }
  assert.equal(decodeGif(encodeGif(px, w, h, { transparent: false })).trans, -1, 'opaque export: no transparent index');
  // more than 4096 distinct sequences force clear codes; the decoded indices must still match
  const n = 200 * 120;
  const idx = new Uint8Array(n);
  let s = 12345;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; idx[i] = (s >>> 16) & 255; }
  const data = lzwEncode(idx, 8);
  const bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 200, 0, 120, 0, 0xf7, 0, 0];
  for (let i = 0; i < 768; i++) bytes.push(0);
  bytes.push(0x2c, 0, 0, 0, 0, 200, 0, 120, 0, 0, 8);
  for (let i = 0; i < data.length; i += 255) { const m = Math.min(255, data.length - i); bytes.push(m); for (let k = 0; k < m; k++) bytes.push(data[i + k]); }
  bytes.push(0, 0x3b);
  assert.deepEqual(Uint8Array.from(decodeGif(Uint8Array.from(bytes)).indices), idx);
  // many colours: the palette is capped at 256 and every pixel maps to an entry
  const big = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) big.set([i & 255, (i >> 4) & 255, (i * 3) & 255, 255], 4 * i);
  const q = quantize(big, { transparent: true });
  assert.ok(q.palette.length <= 256 && q.palette.length > 200);
  assert.equal(q.transparent, -1);
  assert.equal(decodeGif(encodeGif(big, 64, 64)).indices.length, 64 * 64);
});

test('PNG pHYs and JPEG JFIF DPI writers', async () => {
  const { setPngDpi, setJpegDpi, crc32 } = await import('../src/graphics/encode.js');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const chunk = (type, data) => { const b = new Uint8Array(12 + data.length); const v = new DataView(b.buffer); v.setUint32(0, data.length); b.set(new TextEncoder().encode(type), 4); b.set(data, 8); v.setUint32(8 + data.length, crc32(b, 4, 8 + data.length)); return b; };
  const ihdr = new Uint8Array(13); new DataView(ihdr.buffer).setUint32(0, 2); new DataView(ihdr.buffer).setUint32(4, 2); ihdr.set([8, 6, 0, 0, 0], 8);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', ihdr), ...chunk('pHYs', new Uint8Array(9)), ...chunk('IEND', new Uint8Array(0))]);
  const out = setPngDpi(setPngDpi(png, 96), 300);
  const txt = String.fromCharCode(...out);
  assert.equal(txt.split('pHYs').length - 1, 1, 'one pHYs chunk');
  const at = txt.indexOf('pHYs');
  const v = new DataView(out.buffer, out.byteOffset);
  assert.equal(at, 37, 'right after IHDR');
  assert.equal(v.getUint32(at + 4), 11811);
  assert.equal(out[at + 12], 1);
  assert.equal(v.getUint32(at + 13), crc32(out, at, at + 13));
  assert.ok(txt.slice(-8, -4) === 'IEND');
  const jfif = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  assert.deepEqual(Array.from(setJpegDpi(jfif, 300).subarray(13, 18)), [1, 1, 44, 1, 44]);
  const bare = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 2, 0xff, 0xd9]);
  const k = setJpegDpi(bare, 72);
  assert.deepEqual(Array.from(k.subarray(2, 10)), [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
  assert.equal(k[13], 1);
  assert.equal((k[14] << 8) | k[15], 72);
  assert.deepEqual(Array.from(k.subarray(k.length - 6)), [0xff, 0xdb, 0, 2, 0xff, 0xd9]);
});

test('export options: formats, transparency rules, size, aspect lock, file names, regions', async () => {
  const { FORMATS, normalizeExport, backgroundChoices, outputSize, lockedPair, fileNameFor, clampRect, EXPORT_DEFAULTS } = await import('../src/graphics/exportopts.js');
  assert.deepEqual(FORMATS.map((f) => f.id), ['png', 'jpg', 'gif', 'webp', 'svg', 'pdf']);
  assert.deepEqual(FORMATS.filter((f) => f.alpha).map((f) => f.id), ['png', 'gif', 'webp', 'svg']);
  assert.deepEqual(backgroundChoices('jpg'), ['theme', 'white']);
  assert.deepEqual(backgroundChoices('webp'), ['theme', 'white', 'none']);
  let r = normalizeExport({ format: 'jpg', background: 'none' });
  assert.equal(r.opts.background, 'white');
  assert.deepEqual(r.notes, ['noAlphaJpg']);
  assert.deepEqual(normalizeExport({ format: 'pdf', background: 'none' }).notes, ['noAlphaPdf']);
  r = normalizeExport({ format: 'gif', background: 'none' });
  assert.equal(r.opts.background, 'none'); assert.deepEqual(r.notes, []);
  r = normalizeExport({ format: 'bmp', scale: 7, dpi: 5, quality: 300, width: -4, target: 'x' });
  assert.equal(r.opts.format, 'png'); assert.equal(r.opts.scale, EXPORT_DEFAULTS.scale); assert.equal(r.opts.dpi, 36); assert.equal(r.opts.quality, 100); assert.equal(r.opts.width, 16); assert.equal(r.opts.target, 'figure');
  assert.deepEqual(outputSize({ sizeMode: 'scale', scale: 3 }, 400, 300), { width: 1200, height: 900, sx: 3, sy: 3 });
  assert.deepEqual(outputSize({ sizeMode: 'pixels', width: 800, height: 10, lock: true }, 400, 300), { width: 800, height: 600, sx: 2, sy: 2 });
  assert.deepEqual(outputSize({ sizeMode: 'pixels', width: 800, height: 100, lock: false }, 400, 300), { width: 800, height: 100, sx: 2, sy: 1 / 3 });
  assert.deepEqual(lockedPair({ lock: true, width: 1, height: 1 }, 'height', 150, 400, 300), { height: 150, width: 200 });
  assert.deepEqual(lockedPair({ lock: false, width: 7, height: 1 }, 'height', 150, 400, 300), { height: 150, width: 7 });
  assert.equal(fileNameFor('my plot.png', 'jpg'), 'my plot.jpg');
  assert.equal(fileNameFor('a/b:c', 'svg'), 'a_b_c.svg');
  assert.equal(fileNameFor('  ', 'gif'), 'figure.gif');
  assert.deepEqual(clampRect({ x: 500, y: 50, w: -600, h: 1000 }, 400, 300), { x: 0, y: 50, w: 400, h: 250 });
  assert.equal(clampRect({ x: 5, y: 5, w: 2, h: 40 }, 400, 300), null);
});

test('controller: export dialog state, picking, request and remembered options', () => {
  const e = fakeEngine();
  let stored = { format: 'webp', background: 'none', scale: 3 };
  const ctl = new FigureController(e, { loadExportOpts: () => stored, saveExportOpts: (o) => { stored = o; } });
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, []), axes(1.2, [])])], current: 1 });
  ctl.reportSize(1, 640, 480);
  assert.equal(ctl.exportOpts().format, 'webp');
  assert.equal(ctl.exportOpts().scale, 3);
  ctl.openExport();
  assert.deepEqual(ctl.exportDlg, { picking: null });
  ctl.setExportOpts({ format: 'jpg' });
  assert.equal(stored.format, 'jpg');
  assert.equal(stored.background, 'white', 'JPG drops transparency');
  assert.deepEqual(ctl.exportNotes, ['noAlphaJpg']);
  ctl.startPick('region');
  assert.equal(ctl.exportDlg.picking, 'region');
  ctl.finishPick({ x: 10, y: 20, w: 100, h: 50 });
  assert.equal(ctl.exportOpts().target, 'region');
  assert.equal(ctl.exportDlg.picking, null, 'the dialog comes back');
  ctl.addTip(1, { axId: 1.1, point: [1, 2, 0], label: ['X 1'] });
  const req = ctl.exportRequest();
  assert.equal(req.figW, 640); assert.equal(req.figH, 480);
  assert.deepEqual(req.rect, { x: 10, y: 20, w: 100, h: 50 });
  assert.equal(req.tipList.length, 1);
  ctl.selectAxes(ctl.axesById(1.2));
  ctl.startPick('axes'); ctl.finishPick();
  assert.equal(ctl.exportOpts().target, 'axes');
  assert.equal(ctl.exportRequest().axesId, 1.2);
  assert.equal(ctl.exportRequest({ tips: false }).tipList.length, 0);
  ctl.closeExport();
  assert.equal(ctl.exportDlg, null);
});

test('polar and UI axes colours follow the theme like cartesian axes', async () => {
  const { THEMED } = await import('../core/graphics/schema.js');
  assert.deepEqual(THEMED.polaraxes, THEMED.axes);
  assert.deepEqual(THEMED.uiaxes, THEMED.axes);
});

test('3D coordinate axes: orientation triad directions and the theme palette', async () => {
  const { triadDirs, axisPalette } = await import('../src/graphics/render3d.js');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // top view (az 0, el 90): X right, Y up, Z toward the viewer
  let d = triadDirs(0, 90);
  assert.ok(near(d[0].x, 1) && near(d[0].y, 0));
  assert.ok(near(d[1].x, 0) && near(d[1].y, 1));
  assert.ok(near(d[2].depth, 1));
  // side view (az 0, el 0): X right, Z up, Y into the screen
  d = triadDirs(0, 0);
  assert.ok(near(d[0].x, 1) && near(d[2].y, 1) && near(d[1].depth, -1));
  // default 3D view (az -37.5, el 30): X goes right and up, Y left and up, Z straight up
  d = triadDirs(-37.5, 30);
  assert.ok(d[0].x > 0.7 && d[0].y > 0);
  assert.ok(d[1].x < -0.5 && d[1].y > 0);
  assert.ok(near(d[2].x, 0) && d[2].y > 0.8);
  for (const v of d) assert.ok(near(v.x * v.x + v.y * v.y + v.depth * v.depth, 1), 'unit vectors');
  for (const dark of [true, false]) {
    const [x, y, z] = axisPalette(dark);
    assert.ok(x[0] > x[1] && x[0] > x[2], 'X is red');
    assert.ok(y[1] > y[0] && y[1] > y[2], 'Y is green');
    assert.ok(z[2] > z[0] && z[2] > z[1], 'Z is blue');
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    for (const c of [x, y, z]) assert.ok(dark ? lum(c) > 0.35 : lum(c) < 0.45, 'contrast with the background');
  }
});

test('controller: commitView3d moves the shown camera; 3D pan sends CameraTarget; the axes toggle', () => {
  const e = fakeEngine();
  const ctl = new FigureController(e, {});
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [], { View: [-37.5, 30], Is3D: true })])], current: 1 });
  const seen = [];
  ctl.views3d.set(1.1, { setView: (a, b) => seen.push([a, b]), dispose() {}, zoomF: 1, target: { toArray: () => [0, 0, 0] }, getView: () => [0, 0] });
  const ax = ctl.targetAxes();
  ctl.commitView3d(ax, [0, 0]);
  assert.deepEqual(seen, [[0, 0]]);
  assert.deepEqual(e.of('graphics.set').at(-1).props, { View: [0, 0] });
  ctl.commitTarget3d(ax, [1.23456789012, -2, 0.5]);
  assert.deepEqual(e.of('graphics.set').at(-1), { type: 'graphics.set', handle: 1.1, props: { CameraTarget: [1.2345679, -2, 0.5] } });
  assert.equal(ctl.axesLines, true, 'coordinate axes are on by default');
  assert.equal(ctl.paintOptions(ctl.figure()).axesLines, true);
  ctl.setAxesLines(false);
  assert.equal(ctl.paintOptions(ctl.figure()).axesLines, false);
  ctl.views3d.clear();
});

test('export orientation: landscape / portrait lay the figure out at that shape; selections keep theirs', async () => {
  const { orientationOf, orientedFigure, orientedPixels, normalizeExport } = await import('../src/graphics/exportopts.js');
  assert.equal(orientationOf(800, 600), 'landscape');
  assert.equal(orientationOf(600, 600), 'landscape');
  assert.equal(orientationOf(600, 601), 'portrait');
  assert.deepEqual(orientedFigure(848, 376, null), { figW: 848, figH: 376 }, 'default: the figure as shown');
  assert.deepEqual(orientedFigure(848, 376, 'landscape'), { figW: 848, figH: 376 });
  assert.deepEqual(orientedFigure(848, 376, 'portrait'), { figW: 376, figH: 848 });
  assert.deepEqual(orientedFigure(300, 500, 'landscape'), { figW: 500, figH: 300 });
  assert.deepEqual(orientedPixels(1200, 800, 'portrait'), { width: 800, height: 1200 });
  assert.deepEqual(orientedPixels(1200, 800, 'landscape'), { width: 1200, height: 800 });
  assert.equal(normalizeExport({ orientation: 'portrait' }).opts.orientation, 'portrait');
  assert.equal(normalizeExport({ orientation: 'sideways' }).opts.orientation, null);
  // the controller applies it to whole-figure exports only
  const e = fakeEngine();
  let stored = { orientation: 'portrait' };
  const ctl = new FigureController(e, { loadExportOpts: () => stored, saveExportOpts: (o) => { stored = o; } });
  ctl.attach();
  e.emit('graphics.scene', { type: 'graphics.scene', figures: [figure(1, [axes(1.1, [])])], current: 1 });
  ctl.reportSize(1, 848, 376);
  let r = ctl.exportRequest();
  assert.deepEqual([r.figW, r.figH], [376, 848]);
  ctl.setExportOpts({ orientation: 'landscape' });
  assert.equal(stored.orientation, 'landscape', 'remembered');
  r = ctl.exportRequest();
  assert.deepEqual([r.figW, r.figH], [848, 376]);
  ctl.setExportOpts({ orientation: 'portrait', target: 'axes' });
  r = ctl.exportRequest();
  assert.deepEqual([r.figW, r.figH], [848, 376], 'an axes export keeps the on-screen layout');
});
