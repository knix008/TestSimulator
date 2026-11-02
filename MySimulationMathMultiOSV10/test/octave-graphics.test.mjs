// Graphics: the Octave-compatibility additions (core/graphics/octave.js,
// volume.js, uiextra.js, xform.js) at the object-tree / property level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { buildRegistry } from '../core/registry.js';
import * as gfx from '../core/graphics/index.js';

const REG = buildRegistry();

/** A full session (all areas) with a fake GUI host; returns helpers. */
function session({ requests = {} } = {}) {
  const out = [];
  const posted = [];
  const host = {
    post(m) { posted.push(m); },
    request(m) { const fn = requests[m.type]; return fn ? fn(m) : null; },
  };
  const s = createSessionWith(REG, { fs: createMemoryFs({}), print: (t) => out.push(t), onEvent: () => {}, host });
  const run = (code) => { const r = s.evaluate(code); if (!r.ok) throw new Error(`${r.error.identifier}: ${r.error.message}\n  in: ${code}`); return r; };
  const fails = (code) => { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; };
  const v = (name) => s.getVariable(name);
  const nums = (name) => Array.from(v(name).re);
  const num = (name) => v(name).re[0];
  const text = (name) => { const x = v(name); return x.cls === 'string' ? x.data[0] : String.fromCharCode(...x.re); };
  const G = () => s.ctx.state.graphics;
  /** The last scene snapshot / update posted for the GUI. */
  const scene = () => { run('drawnow'); const m = posted.filter((p) => p.type === 'graphics.scene' || p.type === 'graphics.update').pop(); return m; };
  return { s, run, fails, v, nums, num, text, out, posted, G, scene };
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const allClose = (a, b, tol = 1e-9) => a.length === b.length && a.every((x, i) => close(x, b[i], tol));
/** Depth-first search of a serialized node tree. */
function findNode(node, pred) {
  if (pred(node)) return node;
  for (const c of node.children || []) { const r = findNode(c, pred); if (r) return r; }
  return null;
}

test('every graphics builtin has English and Korean help with syntax lines', () => {
  for (const name of Object.keys(gfx.builtins)) {
    if (name.startsWith('__')) continue;
    const h = gfx.help[name];
    assert.ok(h && h.en && h.ko && Array.isArray(h.syntax) && h.syntax.length, `help for ${name}`);
  }
});

// ---------------------------------------------------------------- octave.js: application data, handles, toolkits

test('appdata, guidata and guihandles', () => {
  const t = session();
  t.run("f = figure; setappdata(f, 'a', 5, 'b', 'x'); a = getappdata(f, 'a'); s = getappdata(f); miss = getappdata(f, 'zz'); tf = isappdata(f, {'a', 'q'}); rmappdata(f, 'a'); gone = isappdata(f, 'a');");
  assert.equal(t.num('a'), 5);
  assert.deepEqual(t.v('s').fields, ['a', 'b']);
  assert.deepEqual(t.v('miss').dims, [0, 0]);
  assert.deepEqual(t.nums('tf'), [1, 0]);
  assert.equal(t.num('gone'), 0);
  t.fails("rmappdata(f, 'nothere')");
  t.run("plot(1:3, 'Tag', 'curve'); uicontrol('Style', 'pushbutton', 'Tag', 'go'); guidata(gca, struct('k', 3)); g = guidata(f); hs = guihandles(f); c1 = isgraphics(hs.curve, 'line'); c2 = isgraphics(hs.go, 'uicontrol');");
  assert.equal(t.v('g').data[0].k.re[0], 3);
  assert.equal(t.num('c1'), 1);
  assert.equal(t.num('c2'), 1);
  t.run("setappdata(0, 'rootdata', 7); r = getappdata(groot, 'rootdata');");
  assert.equal(t.num('r'), 7);
});

test('handle tests, toolkit queries, listfonts and isguirunning through the GUI ping', () => {
  const t = session();
  t.run('f = figure; ax = axes; l = line(1:2, 1:2); a = isaxes([ax l]); b = isfigure([f ax]); c = ishghandle([0 f 12345]); d = isaxes(\'text\'); tk = graphics_toolkit; av = available_graphics_toolkits; ld = loaded_graphics_toolkits; g = isguirunning; w = have_window_system; fonts = listfonts;');
  assert.deepEqual(t.nums('a'), [1, 0]);
  assert.deepEqual(t.nums('b'), [1, 0]);
  assert.deepEqual(t.nums('c'), [1, 1, 0]);
  assert.equal(t.num('d'), 0);
  assert.equal(t.text('tk'), 'canvas');
  assert.equal(t.v('av').data.length, 1);
  assert.equal(t.v('ld').data.length, 1);
  assert.equal(t.num('g'), 0, 'no GUI attached');
  assert.equal(t.num('w'), 0);
  assert.ok(t.v('fonts').data.length > 5);
  t.fails("graphics_toolkit('gnuplot')");
  const g = session({ requests: { 'graphics.ping': () => ({ gui: true }) } });
  g.run('a = isguirunning; b = have_window_system;');
  assert.equal(g.num('a'), 1);
  assert.equal(g.num('b'), 1);
});

test('addlistener / dellistener run after set and dot assignment; linkprop keeps properties equal', () => {
  const t = session();
  t.run("n = 0; l = line([0 1], [0 1]); addlistener(l, 'Color', 'n = n + 1;'); set(l, 'Color', 'r'); l.Color = [0 0 1]; set(l, 'LineWidth', 2);");
  assert.equal(t.num('n'), 2);
  t.run("dellistener(l, 'Color'); set(l, 'Color', 'g');");
  assert.equal(t.num('n'), 2);
  t.run("cnt = 0; addlistener(gca, 'XLim', 'cnt = cnt + 1;'); xlim([0 4]);");
  assert.equal(t.num('cnt'), 1, 'hooked properties (XLim) notify too');
  t.run("figure; a1 = subplot(1, 2, 1); a2 = subplot(1, 2, 2); hl = linkprop([a1 a2], {'XLim', 'Color'}); set(a1, 'XLim', [0 5]); x2 = get(a2, 'XLim'); a2.Color = [1 0 0]; c1 = get(a1, 'Color'); m2 = get(a2, 'XLimMode');");
  assert.deepEqual(t.nums('x2'), [0, 5]);
  assert.deepEqual(t.nums('c1'), [1, 0, 0]);
  assert.equal(t.text('m2'), 'manual');
  assert.deepEqual(t.v('hl').fields, ['Targets', 'PropertyNames']);
  t.fails("linkprop(gca, 'XLim')");
  t.fails("addlistener(gca, 'NoSuchProp', @(h, e) 1)");
});

// ---------------------------------------------------------------- copying, struct round trip, files

test('copyobj copies axes with children, labels and legend; figures to the root', () => {
  const t = session();
  t.run("f = figure; plot(1:3, 'r'); title('T'); xlabel('X'); legend('L'); setappdata(gca, 'k', 1); f2 = figure; ax2 = copyobj(findobj(f, 'Type', 'axes'), f2); n = numel(get(ax2, 'Children')); tt = get(get(ax2, 'Title'), 'String'); lc = get(get(ax2, 'Children'), 'Color'); hasLeg = ~isempty(get(ax2, 'Legend')); k = getappdata(ax2, 'k');");
  assert.equal(t.num('n'), 1);
  assert.equal(t.text('tt'), 'T');
  assert.deepEqual(t.nums('lc'), [1, 0, 0]);
  assert.equal(t.num('hasLeg'), 1);
  assert.equal(t.num('k'), 1);
  t.run("f3 = copyobj(f, groot); isf = isfigure(f3); nax = numel(findobj(f3, 'Type', 'axes')); other = f3 ~= f;");
  assert.equal(t.num('isf'), 1);
  assert.equal(t.num('nax'), 1);
  assert.equal(t.num('other'), 1);
  t.fails('copyobj(f, gca)');
  t.fails('copyobj(gca, 0)');
});

test('hdl2struct / struct2hdl and savefig / openfig round trips', () => {
  const t = session();
  t.run("f = figure('Name', 'keep'); plot(1:4, [1 3 2 4], 'g--'); xlabel('time'); legend('sig'); s = hdl2struct(f); ty = s.type; cty = s.children(1).type; nsp = numel(s.children(1).special);");
  assert.equal(t.text('ty'), 'figure');
  assert.equal(t.text('cty'), 'axes');
  assert.equal(t.num('nsp'), 1, 'the x label is a special child');
  t.run("h = struct2hdl(s); nm = get(h, 'Name'); ax = findobj(h, 'Type', 'axes'); xl = get(get(ax, 'XLabel'), 'String'); ln = findobj(h, 'Type', 'line'); yd = get(ln, 'YData'); ls = get(ln, 'LineStyle'); lg = ~isempty(get(ax, 'Legend'));");
  assert.equal(t.text('nm'), 'keep');
  assert.equal(t.text('xl'), 'time');
  assert.deepEqual(t.nums('yd'), [1, 3, 2, 4]);
  assert.equal(t.text('ls'), '--');
  assert.equal(t.num('lg'), 1);
  t.run("figure; surf(peaks(6)); view(30, 40); savefig('saved'); close all; g = openfig('saved.fig'); ns = numel(findobj(g, 'Type', 'surface')); v = get(findobj(g, 'Type', 'axes'), 'View'); hgsave(g, 'two.fig'); g2 = hgload('two.fig'); ns2 = numel(findobj(g2, 'Type', 'surface'));");
  assert.equal(t.num('ns'), 1);
  assert.deepEqual(t.nums('v'), [30, 40]);
  assert.equal(t.num('ns2'), 1);
  t.fails("openfig('nofile.fig')");
});

test('hggroup and hgtransform: the transform Matrix moves the data in the scene and in the limits', () => {
  const t = session();
  t.run("figure; tr = hgtransform; line([0 2], [0 0], 'Parent', tr); text(0, 0, 'p', 'Parent', tr);");
  t.run("set(tr, 'Matrix', [0 -1 0 1; 1 0 0 0; 0 0 1 0; 0 0 0 1]); M = get(tr, 'Matrix'); lim = axis; g = hggroup; ty = get(g, 'Type');");
  assert.equal(t.text('ty'), 'hggroup');
  assert.deepEqual(t.v('M').dims, [4, 4]);
  // the line (0,0)-(2,0) turned by 90° and moved by +1 in x: (1,0)-(1,2)
  const lim = t.nums('lim');
  assert.ok(lim[2] <= 0 && lim[3] >= 2, `y limits cover 0..2: ${lim}`);
  const m = t.scene();
  const fig = m.figures[0];
  const grp = findNode(fig, (n) => n.props && n.props.IsTransform);
  assert.equal(grp.type, 'hggroup', 'sent as a group: the renderers need no transform support');
  const ln = findNode(grp, (n) => n.type === 'line');
  assert.ok(allClose(ln.props.XData.data, [1, 1]) && allClose(ln.props.YData.data, [0, 2]), JSON.stringify(ln.props.XData));
  const tx = findNode(grp, (n) => n.type === 'text');
  assert.ok(allClose(tx.props.Position, [1, 0, 0]));
  t.fails("set(tr, 'Matrix', eye(3))");
  t.run("tr2 = hgtransform; m0 = get(tr2, 'Matrix');");
  assert.deepEqual(t.nums('m0'), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

// ---------------------------------------------------------------- camera

test('camera functions: position, target, up vector, view angle, zoom, orbit, roll, look-at', () => {
  const t = session();
  t.run("figure; surf(peaks(10)); axis([0 10 0 10 -10 10]); daspect([1 1 1]); campos([10 10 10]); v = get(gca, 'View'); p = campos; pm = campos('mode');");
  assert.ok(allClose(t.nums('v'), [135, Math.atan2(10, Math.hypot(5, 5)) * 180 / Math.PI], 1e-9), String(t.nums('v')));
  assert.deepEqual(t.nums('p'), [10, 10, 10]);
  assert.equal(t.text('pm'), 'manual');
  t.run("va0 = camva; camzoom(2); va = camva; camva(10); va2 = camva; vm = camva('mode'); camva('auto'); va3 = camva;");
  assert.ok(close(t.num('va0'), 6.6086));
  assert.ok(close(t.num('va'), 2 * Math.atan(Math.tan(6.6086 / 2 * Math.PI / 180) / 2) * 180 / Math.PI));
  assert.equal(t.num('va2'), 10);
  assert.equal(t.text('vm'), 'manual');
  assert.ok(close(t.num('va3'), 6.6086));
  t.run("ct0 = camtarget; camtarget([5 5 0]); ct = camtarget; tm = camtarget('mode');");
  assert.deepEqual(t.nums('ct0'), [5, 5, 0]);
  assert.deepEqual(t.nums('ct'), [5, 5, 0]);
  assert.equal(t.text('tm'), 'manual');
  t.run("view(30, 20); camorbit(15, 10); v2 = get(gca, 'View'); u0 = camup; camroll(90); u1 = camup; d = camtarget - campos;");
  assert.ok(allClose(t.nums('v2'), [45, 30]));
  assert.deepEqual(t.nums('u0'), [0, 0, 1]);
  const u0 = t.nums('u0'), u1 = t.nums('u1'), d = t.nums('d');
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k = d.map((x) => x / Math.hypot(...d));
  const perp = (u) => u.map((x, i) => x - dot(u, k) * k[i]);
  assert.ok(close(dot(u1, k), dot(u0, k)), 'the part along the view axis stays');
  assert.ok(Math.abs(dot(perp(u0), perp(u1))) < 1e-9, `rolled 90°: the screen-up direction turned a quarter (${u1})`);
  t.run("camup([0 0 1]); camup('auto'); um = camup('mode'); h = line([1 2], [1 2], [0 0]); camlookat(h); lt = camtarget; lv = camva;");
  assert.equal(t.text('um'), 'auto');
  assert.deepEqual(t.nums('lt'), [1.5, 1.5, 0]);
  assert.ok(t.num('lv') < 6.6086);
  t.fails('camzoom(-1)');
  t.fails('camva(200)');
  t.fails('camup([0 0 0])');
});

// ---------------------------------------------------------------- colormap tools

test('colormap tools: brighten, cmpermute, cmunique, contrast, cubehelix, ocean, rainbow, iscolormap', () => {
  const t = session();
  t.run('m = brighten([0.25 0.5 1], 0.5); d = brighten([0.25 0.5 1], -0.5);');
  assert.ok(allClose(t.nums('m'), [0.5, Math.SQRT1_2, 1]));
  assert.ok(allClose(t.nums('d'), [0.0625, 0.25, 1]));
  t.run('figure; colormap(gray(4)); brighten(0.5); cm = colormap;');
  assert.ok(allClose(t.nums('cm').slice(0, 4), [0, Math.sqrt(1 / 3), Math.sqrt(2 / 3), 1]));
  t.fails('brighten(1.5)');
  t.run('map = [1 0 0; 0 1 0; 0 0 1]; X = [1 2; 3 1]; [Y, nm] = cmpermute(X, map, [3 1 2]); ok = isequal(nm(Y(:), :), map(X(:), :));');
  assert.equal(t.num('ok'), 1);
  assert.deepEqual(t.nums('Y'), [2, 1, 3, 2]);
  t.run('rgb = cat(3, [1 0; 1 0], [0 0; 0 0], [0 1; 0 1]); [Y, nm] = cmunique(rgb); c = class(Y); [Y2, nm2] = cmunique([1 2 2; 1 1 2], [0 0 0; 0 0 0; 1 1 1]);');
  assert.equal(t.text('c'), 'uint8');
  assert.deepEqual(t.nums('Y'), [1, 1, 0, 0]);
  assert.deepEqual(t.nums('nm'), [0, 1, 0, 0, 1, 0]);
  assert.deepEqual(t.nums('nm2'), [0, 0, 0]);
  assert.deepEqual(t.nums('Y2'), [0, 0, 0, 0, 0, 0]);
  t.run('cmap = contrast([1 2 3 100], 4); h = cubehelix(5); h2 = cubehelix(3, 0, 0, 0, 1); oc = ocean(4); rb = rainbow(6); t1 = iscolormap(jet(3)); t2 = iscolormap([0 0 2]); t3 = iscolormap(single([0 0.5 1]));');
  const cmap = t.nums('cmap');
  assert.equal(cmap[0], 0);
  assert.equal(cmap[3], 1);
  assert.ok(cmap[1] < 0.02 && cmap[2] < 0.03, 'equalised: the outlier does not stretch the low values');
  assert.deepEqual(t.v('h').dims, [5, 3]);
  assert.ok(allClose([t.nums('h')[0], t.nums('h')[4]], [0, 1]), 'cubehelix runs from black to white');
  assert.ok(allClose(t.nums('h2'), [0, 0.5, 1, 0, 0.5, 1, 0, 0.5, 1]), 'without hue it is a gray ramp');
  assert.ok(allClose(t.nums('oc'), [0, 0, 0, 1, 0, 0, 0.5, 1, 0, 1 / 3, 2 / 3, 1]));
  assert.deepEqual([t.nums('rb')[0], t.nums('rb')[6]], [1, 0], 'rainbow starts red');
  assert.deepEqual([t.num('t1'), t.num('t2'), t.num('t3')], [1, 0, 1]);
  t.run("figure; colormap('ocean'); n = size(colormap, 1);");
  assert.equal(t.num('n'), 256);
});

test('colstyle, dither, rgbplot and spinmap', () => {
  const t = session();
  t.run("[l, c, m, msg] = colstyle('r--o'); [l2, c2, m2, msg2] = colstyle(':diamond'); [l3, c3, m3, msg3] = colstyle('q');");
  assert.deepEqual([t.text('l'), t.text('c'), t.text('m'), t.text('msg')], ['--', 'r', 'o', '']);
  assert.deepEqual([t.text('l2'), t.text('c2'), t.text('m2')], [':', '', 'd']);
  assert.match(t.text('msg3'), /unrecognized/);
  t.run('B = dither([0.2 0.8; 0.5 0.5]); X = dither(cat(3, ones(2), zeros(2), zeros(2)), [0 0 0; 1 0 0; 0 0 1]); cx = class(X);');
  assert.deepEqual(t.nums('B'), [0, 1, 1, 0]);
  assert.equal(t.text('cx'), 'uint8');
  assert.deepEqual(t.nums('X'), [1, 1, 1, 1], 'pure red maps to the red entry (0-based)');
  t.run("figure; h = rgbplot(jet(8)); n = numel(h); c = get(h(2), 'Color'); figure; rgbplot(gray(4), 'composite'); im = findobj(gca, 'Type', 'image'); sz = size(get(im, 'CData'));");
  assert.equal(t.num('n'), 3);
  assert.deepEqual(t.nums('c'), [0, 1, 0]);
  assert.deepEqual(t.nums('sz'), [1, 4, 3]);
  t.run('figure; colormap(jet(8)); spinmap(0.12, 1); same = isequal(colormap, jet(8));');
  assert.equal(t.num('same'), 1, 'spinmap restores the colormap');
});

// ---------------------------------------------------------------- figure helpers

test('closereq, dialog, movegui, findfigs, getpixelposition, orient', () => {
  const t = session();
  t.run("f = figure; set(f, 'CloseRequestFcn', @(s, e) closereq); close(f); alive = ishghandle(f);");
  assert.equal(t.num('alive'), 0);
  t.run("d = dialog('Name', 'Ask'); ws = get(d, 'WindowStyle'); mb = get(d, 'MenuBar'); nm = get(d, 'Name');");
  assert.deepEqual([t.text('ws'), t.text('mb'), t.text('nm')], ['modal', 'none', 'Ask']);
  t.run("set(0, 'ScreenSize', [1 1 1000 800]); f = figure('Position', [0 0 200 100]); movegui(f, 'center'); p1 = get(f, 'Position'); movegui(f, [10 -20]); p2 = get(f, 'Position'); set(f, 'Position', [5000 -300 200 100]); findfigs; p3 = get(f, 'Position');");
  assert.deepEqual(t.nums('p1'), [400, 350, 200, 100]);
  assert.deepEqual(t.nums('p2'), [10, 680, 200, 100]);
  const p3 = t.nums('p3');
  assert.ok(p3[0] + 200 <= 1000 && p3[1] >= 1, `on screen: ${p3}`);
  t.fails("movegui(f, 'middle')");
  t.run("f = figure('Position', [100 100 400 300]); ax = axes('Position', [0.1 0.2 0.5 0.5]); pp = getpixelposition(ax); fp = getpixelposition(f); pnl = uipanel(f, 'Units', 'pixels', 'Position', [20 30 200 100]); b = uicontrol(pnl, 'Position', [5 6 50 20]); bp = getpixelposition(b, true);");
  assert.deepEqual(t.nums('pp'), [40, 60, 200, 150]);
  assert.deepEqual(t.nums('fp'), [100, 100, 400, 300]);
  assert.deepEqual(t.nums('bp'), [25, 36, 50, 20]);
  t.run("o0 = orient(f); orient(f, 'landscape'); o1 = orient(f); ps = get(f, 'PaperSize'); orient(f, 'tall'); o2 = orient(f);");
  assert.equal(t.text('o0'), 'portrait');
  assert.equal(t.text('o1'), 'landscape');
  assert.deepEqual(t.nums('ps'), [11, 8.5]);
  assert.equal(t.text('o2'), 'tall');
});

test('whitebg, hidden, refreshdata, printd, rticklabels / thetaticklabels', () => {
  const t = session();
  t.run("f = figure; ax = axes; title('t'); whitebg(f, 'k'); bg = get(ax, 'Color'); fg = get(ax, 'XColor'); tc = get(get(ax, 'Title'), 'Color'); whitebg(f); bg2 = get(ax, 'Color');");
  assert.deepEqual(t.nums('bg'), [0, 0, 0]);
  assert.deepEqual(t.nums('fg'), [1, 1, 1]);
  assert.deepEqual(t.nums('tc'), [1, 1, 1]);
  assert.deepEqual(t.nums('bg2'), [1, 1, 1], 'without a colour it switches back');
  t.run("figure; mesh(peaks(5)); s = findobj(gca, 'Type', 'surface'); hidden off; f1 = get(s, 'FaceColor'); st = hidden; hidden on; f2 = get(s, 'FaceColor');");
  assert.equal(t.text('f1'), 'none');
  assert.equal(t.text('st'), 'off');
  assert.deepEqual(t.nums('f2'), [1, 1, 1]);
  t.run("figure; xs = 1:3; ys = [1 4 9]; h = plot(xs, ys, 'XDataSource', 'xs', 'YDataSource', 'ys'); xs = [2 3 4]; ys = [0 0 1]; refreshdata; xd = get(h, 'XData'); yd = get(h, 'YData');");
  assert.deepEqual(t.nums('xd'), [2, 3, 4]);
  assert.deepEqual(t.nums('yd'), [0, 0, 1]);
  t.run("printd([1 2; 3 4], 'out.txt'); txt = fileread('out.txt'); s = printd('hello', 'h.txt');");
  assert.match(t.text('txt'), /1\s+2\s*\n\s*3\s+4/);
  assert.equal(t.text('s').trim(), 'hello');
  t.run("figure; polarplot(0:0.5:6, 1:13); rticklabels({'a', 'b', 'c'}); r = rticklabels; thetaticklabels({'E', 'N'}); th = thetaticklabels; thetaticklabels('auto'); th2 = thetaticklabels;");
  assert.deepEqual(t.v('r').data.map((x) => String.fromCharCode(...x.re)), ['a', 'b', 'c']);
  assert.deepEqual(t.v('th').data.map((x) => String.fromCharCode(...x.re)), ['E', 'N']);
  assert.ok(t.v('th2').data.length > 2);
  t.run('figure; plot(1:3);');
  t.fails("rticklabels({'a'})");
});

test('waitfor and gtext use the GUI requests', () => {
  const seen = [];
  const t = session({ requests: {
    'graphics.uiwait': (m) => { seen.push(m); return { ok: true }; },
    'graphics.ginput': (m) => { seen.push(m); return { points: [[0.5, 0.25, 1]] }; },
  } });
  t.run("f = figure('Name', 'x'); waitfor(f, 'Name', 'x'); waitfor(f, 'Name', 'y'); waitfor(f, 'timeout', 2);");
  assert.equal(seen.length, 2, 'no wait when the property already has the value');
  assert.equal(seen[1].timeout, 2);
  t.run("plot(0:1, 0:1); h = gtext('mark', 'Color', 'r'); p = get(h, 'Position'); s = get(h, 'String'); c = get(h, 'Color');");
  assert.deepEqual(t.nums('p').slice(0, 2), [0.5, 0.25]);
  assert.equal(t.text('s'), 'mark');
  assert.deepEqual(t.nums('c'), [1, 0, 0]);
  const plain = session();
  plain.run('f = figure; waitfor(f);');
  plain.fails("gtext('x')");
});

// ---------------------------------------------------------------- extra plots

test('comet / comet3 leave the whole trace; ez* function plots', () => {
  const t = session();
  t.run("figure; comet(1:5, (1:5).^2, 0); L = findobj(gca, 'Type', 'line'); n = numel(L); lens = cellfun(@numel, get(L, 'XData'));");
  assert.equal(t.num('n'), 3);
  assert.ok(t.nums('lens').includes(5), 'the body ends as the full curve');
  t.run("figure; comet3(sin(1:6), cos(1:6), 1:6, 0); v = get(gca, 'View');");
  assert.deepEqual(t.nums('v'), [-37.5, 30]);
  t.run("figure; h = ezcontour('x.^2 + y.^2', [-1 1], 21); ty = get(h, 'Type'); z = get(h, 'ZData'); tt = get(get(gca, 'Title'), 'String');");
  assert.equal(t.text('ty'), 'contour');
  assert.deepEqual(t.v('z').dims, [21, 21]);
  assert.equal(t.text('tt'), 'x.^2 + y.^2');
  t.run("figure; ezcontourf(@(x, y) x .* y, [-1 1 -2 2], 10); c = findobj(gca, 'Type', 'contour'); fl = get(c, 'Fill');");
  assert.equal(t.text('fl'), 'on');
  t.run("figure; ezsurfc(@(x, y) x + y, [0 1], 5); ns = numel(findobj(gca, 'Type', 'surface')); nc = numel(findobj(gca, 'Type', 'contour')); figure; ezmeshc('sin(x).*y', [0 1]); fc = get(findobj(gca, 'Type', 'surface'), 'FaceColor');");
  assert.equal(t.num('ns'), 1);
  assert.equal(t.num('nc'), 1);
  assert.deepEqual(t.nums('fc'), [1, 1, 1]);
  t.run("figure; h = ezplot3('cos(t)', 'sin(t)', 't', [0 pi], 50); x = get(h, 'XData'); z = get(h, 'ZData');");
  assert.equal(t.nums('x').length, 50);
  assert.ok(close(t.nums('z')[49], Math.PI));
  t.run("figure; h = ezpolar(@(t) 1 + 0 * t); k = get(gca, 'Type');");
  assert.equal(t.text('k'), 'polaraxes');
});

test('loglogerr / semilogxerr / semilogyerr, plotyy and pareto', () => {
  const t = session();
  t.run("figure; h = loglogerr(1:4, [1 4 9 16], [0.1 0.2 0.3 0.4]); xs = get(gca, 'XScale'); ys = get(gca, 'YScale'); ty = get(h, 'Type'); yp = get(h, 'YPositiveDelta');");
  assert.deepEqual([t.text('xs'), t.text('ys'), t.text('ty')], ['log', 'log', 'errorbar']);
  assert.deepEqual(t.nums('yp'), [0.1, 0.2, 0.3, 0.4]);
  t.run("figure; h = semilogxerr(1:3, 1:3, [0.5 0.5 0.5], '>'); xp = get(h, 'XPositiveDelta'); xs = get(gca, 'XScale'); ys = get(gca, 'YScale'); figure; semilogyerr(1:3, [1 10 100], [1 1 1], [2 2 2]); ys2 = get(gca, 'YScale');");
  assert.deepEqual(t.nums('xp'), [0.5, 0.5, 0.5]);
  assert.deepEqual([t.text('xs'), t.text('ys'), t.text('ys2')], ['log', 'linear', 'log']);
  t.run("figure; [ax, h1, h2] = plotyy(1:10, (1:10).^2, 1:10, sqrt(1:10), @plot, 'stem'); n = numel(ax); loc = get(ax(2), 'YAxisLocation'); p1 = get(ax(1), 'Position'); p2 = get(ax(2), 'Position'); t2 = get(h2, 'Type'); bg = get(ax(2), 'Color'); yc = get(ax(1), 'YColor'); lc = get(h1, 'Color'); xlim(ax(1), [2 8]); x2 = get(ax(2), 'XLim');");
  assert.equal(t.num('n'), 2);
  assert.equal(t.text('loc'), 'right');
  assert.deepEqual(t.nums('p1'), t.nums('p2'));
  assert.equal(t.text('t2'), 'stem');
  assert.equal(t.text('bg'), 'none');
  assert.deepEqual(t.nums('yc'), t.nums('lc'));
  assert.deepEqual(t.nums('x2'), [2, 8], 'the x-axes stay linked');
  t.run("figure; [h, ax] = pareto([5 20 3 40 1 1], {'a', 'b', 'c', 'd', 'e', 'f'}); lbl = get(ax(1), 'XTickLabel'); bars = get(h(1), 'YData'); cum = get(h(2), 'YData'); yl = get(ax(2), 'YTickLabel');");
  assert.deepEqual(t.v('lbl').data.map((x) => String.fromCharCode(...x.re)), ['d', 'b', 'a', 'c']);
  assert.deepEqual(t.nums('bars'), [40, 20, 5, 3]);
  assert.deepEqual(t.nums('cum'), [40, 60, 65, 68]);
  assert.equal(t.v('yl').data.length, 5);
});

test('plotmatrix, spy, gplot, treeplot / etreeplot, sombrero', () => {
  const t = session();
  t.run("figure; x = [1 2; 2 4; 3 5; 4 9]; [h, ax, big, P, pax] = plotmatrix(x); sh = size(h); sa = size(ax); np = numel(P); vis = get(big, 'Visible'); xd = get(h(2, 1), 'XData'); yd = get(h(2, 1), 'YData');");
  assert.deepEqual(t.nums('sh'), [2, 2]);
  assert.deepEqual(t.nums('sa'), [2, 2]);
  assert.equal(t.num('np'), 2, 'histograms on the diagonal');
  assert.equal(t.text('vis'), 'off');
  assert.deepEqual(t.nums('xd'), [1, 2, 3, 4], 'cell (2,1): column 1 of x against column 2');
  assert.deepEqual(t.nums('yd'), [2, 4, 5, 9]);
  t.run("figure; [h, ax] = plotmatrix(rand(5, 2), rand(5, 3), 'r*'); s2 = size(ax); m = get(h(1), 'Marker'); c = get(h(1), 'Color');");
  assert.deepEqual(t.nums('s2'), [3, 2]);
  assert.equal(t.text('m'), '*');
  assert.deepEqual(t.nums('c'), [1, 0, 0]);
  t.run("figure; h = spy(sparse([1 0 2; 0 0 3])); xd = get(h, 'XData'); yd = get(h, 'YData'); yr = get(gca, 'YDir'); xl = get(get(gca, 'XLabel'), 'String'); lim = axis;");
  assert.deepEqual(t.nums('xd'), [1, 3, 3]);
  assert.deepEqual(t.nums('yd'), [1, 1, 2]);
  assert.equal(t.text('yr'), 'reverse');
  assert.equal(t.text('xl'), 'nz = 3');
  assert.deepEqual(t.nums('lim'), [0, 4, 0, 3]);
  t.run('[x, y] = gplot([0 1 0; 0 0 1; 0 0 0], [0 0; 1 0; 1 1]);');
  assert.deepEqual(t.nums('x').filter(Number.isFinite), [0, 1, 1, 1]);
  assert.deepEqual(t.nums('y').filter(Number.isFinite), [0, 0, 0, 1]);
  t.run("figure; treeplot([0 1 1 2 2]); L = findobj(gca, 'Type', 'line'); nl = numel(L); nodes = findobj(gca, 'Marker', 'o'); nx = get(nodes, 'XData'); ny = get(nodes, 'YData');");
  assert.equal(t.num('nl'), 2);
  const nx = t.nums('nx'), ny = t.nums('ny');
  assert.ok(ny[0] > ny[1] && ny[1] > ny[3], 'root on top, leaves below');
  assert.ok(close(nx[1], (nx[3] + nx[4]) / 2), 'a parent is centred over its children');
  t.fails('treeplot([0 3 2])');
  t.run("figure; etreeplot(sparse([4 1 0; 1 4 1; 0 1 4])); ny = get(findobj(gca, 'Marker', 'o'), 'YData');");
  const ey = t.nums('ny');
  assert.ok(ey[0] < ey[1] && ey[1] < ey[2], 'tridiagonal: a chain 1 → 2 → 3 (3 is the root)');
  t.run("[X, Y, Z] = sombrero(5); figure; sombrero(7); s = findobj(gca, 'Type', 'surface'); zs = size(get(s, 'ZData'));");
  assert.deepEqual(t.v('Z').dims, [5, 5]);
  assert.ok(close(t.v('Z').re[12], 1, 1e-12), 'sin(r)/r at the centre is 1');
  assert.deepEqual(t.nums('zs'), [7, 7]);
});

test('stemleaf text and datetick labels', () => {
  const t = session();
  t.run("s = stemleaf([-22 12 -28 52 39 -2 12 10 11 11 42 38 44 18 44], 'Stem and leaf plot');");
  const rows = [];
  const S = t.v('s');
  for (let i = 0; i < S.dims[0]; i++) { let r = ''; for (let j = 0; j < S.dims[1]; j++) r += String.fromCharCode(S.re[i + j * S.dims[0]]); rows.push(r.trimEnd()); }
  assert.equal(rows[0], 'Stem and leaf plot');
  assert.ok(rows.some((r) => /^\s+1 \| 011228$/.test(r)), rows.join('\n'));
  assert.ok(rows.some((r) => /^\s+-2 \| 82$/.test(r)));
  assert.ok(rows.some((r) => /^\s+-0 \| 2$/.test(r)));
  assert.ok(rows.some((r) => /unsorted/.test(r)));
  t.run("figure; tt = datenum(2024, 1, 1) + (0:30:360); plot(tt, 1:numel(tt)); datetick('x'); lab = get(gca, 'XTickLabel'); tk = get(gca, 'XTick');");
  const lab = t.v('lab').data.map((x) => String.fromCharCode(...x.re));
  assert.equal(lab[0], 'Jan24');
  assert.ok(lab.includes('Jul24'));
  t.run("datetick('x', 'yyyy-mm-dd', 'keepticks'); lab2 = get(gca, 'XTickLabel'); tk2 = get(gca, 'XTick');");
  assert.deepEqual(t.nums('tk2'), t.nums('tk'));
  assert.equal(String.fromCharCode(...t.v('lab2').data[0].re), '2024-01-01');
  t.run("figure; plot(datenum(2024, 5, 1) + (0:0.1:1), 1:11); datetick('x', 15); l3 = get(gca, 'XTickLabel');");
  assert.match(String.fromCharCode(...t.v('l3').data[0].re), /^\d\d:\d\d$/);
});

// ---------------------------------------------------------------- volume.js

/** n×k Value → rows. */
const rowsV = (x) => { const [m, k] = x.dims; return Array.from({ length: m }, (_, i) => Array.from({ length: k }, (_, c) => x.re[i + c * m])); };
const field = (x, name) => x.data[0][name];

test('isosurface: sphere vertices on the radius, outward normals and faces, fv struct, patch without outputs', () => {
  const t = session();
  t.run('[x, y, z] = meshgrid(-1.3:0.1:1.3); V = -(x.^2 + y.^2 + z.^2); [f, v] = isosurface(x, y, z, V, -1); n = isonormals(x, y, z, V, v); fv = isosurface(x, y, z, V, -1);');
  const f = rowsV(t.v('f')), v = rowsV(t.v('v')), n = rowsV(t.v('n'));
  assert.ok(f.length > 1000, `triangles: ${f.length}`);
  for (const p of v) assert.ok(Math.abs(Math.hypot(...p) - 1) < 0.02, `vertex radius ${Math.hypot(...p)}`);
  n.forEach((q, i) => { const r = Math.hypot(...v[i]); assert.ok((q[0] * v[i][0] + q[1] * v[i][1] + q[2] * v[i][2]) / r > 0.95, 'normal points outward'); });
  let outward = 0;
  for (const tri of f) {
    const [a, b, c] = tri.map((k) => v[k - 1]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (nn[0] * a[0] + nn[1] * a[1] + nn[2] * a[2] > 0) outward++;
  }
  assert.equal(outward, f.length, 'every face is oriented towards smaller values (outward)');
  // shared vertices: each vertex is used by several faces (a closed surface has V - E + F = 2)
  const edges = new Set();
  for (const tri of f) for (let k = 0; k < 3; k++) { const a = tri[k], b = tri[(k + 1) % 3]; edges.add(a < b ? `${a},${b}` : `${b},${a}`); }
  assert.equal(v.length - edges.size + f.length, 2, 'Euler characteristic of a sphere');
  const fv = t.v('fv');
  assert.deepEqual(fv.fields.slice().sort(), ['faces', 'vertices']);
  assert.deepEqual(field(fv, 'faces').dims, t.v('f').dims);
  t.run("[f2, v2] = isosurface(x, y, z, V, -1, 'noshare'); nv2 = size(v2, 1); nf2 = size(f2, 1);");
  assert.equal(t.num('nv2'), 3 * t.num('nf2'));
  t.run('figure; isosurface(x, y, z, V, -1); p = findobj(gca, \'Type\', \'patch\'); np = numel(p); nfp = size(get(p, \'Faces\'), 1);');
  assert.equal(t.num('np'), 1);
  assert.equal(t.num('nfp'), f.length);
  t.run('[fc, vc, cc] = isosurface(x, y, z, V, -1, x);');
  const vc = rowsV(t.v('vc')), cc = t.nums('cc');
  vc.forEach((p, i) => assert.ok(Math.abs(cc[i] - p[0]) < 1e-12, 'colour = x interpolated'));
  assert.equal(t.fails('isosurface(ones(3, 3), 0.5)').identifier, 'graphics:isosurface:volume');
});

test('isonormals negate / patch handle and isocolors (scalar and RGB, patch handle)', () => {
  const t = session();
  t.run("[x, y, z] = meshgrid(0:4, 0:3, 0:2); V = x + 2*y; vert = [1.5 1.2 0.5; 3 2 1]; n1 = isonormals(x, y, z, V, vert); n2 = isonormals(x, y, z, V, vert, 'negate');");
  const g = [-1, -2, 0].map((c) => c / Math.sqrt(5));
  for (const r of rowsV(t.v('n1'))) assert.ok(allClose(r, g, 1e-12));
  for (const r of rowsV(t.v('n2'))) assert.ok(allClose(r, g.map((c) => -c), 1e-12));
  t.run('c = isocolors(x, y, z, V, vert); rgb = isocolors(x, y, z, x, y, z, vert);');
  assert.ok(allClose(t.nums('c'), [1.5 + 2.4, 3 + 4], 1e-12));
  assert.deepEqual(rowsV(t.v('rgb')), [[1.5, 1.2, 0.5], [3, 2, 1]]);
  t.run("p = patch('Faces', [1 2 3], 'Vertices', [vert; 1 1 1]); isonormals(x, y, z, V, p); isocolors(x, y, z, V, p); vn = get(p, 'VertexNormals'); fc = get(p, 'FaceVertexCData'); fcol = get(p, 'FaceColor');");
  assert.deepEqual(t.v('vn').dims, [3, 3]);
  assert.ok(allClose(t.nums('fc'), [3.9, 7, 3], 1e-12));
  assert.equal(t.text('fcol'), 'interp');
});

test('isocaps: caps lie on the box faces, cut the right area, above + below fill the face', () => {
  const t = session();
  t.run("[x, y, z] = meshgrid(-0.8:0.05:0.8); V = -(x.^2 + y.^2 + z.^2); [f, v, c] = isocaps(x, y, z, V, -1, 'xmin'); [fb, vb] = isocaps(x, y, z, V, -1, 'below', 'xmin'); fva = isocaps(x, y, z, V, -1);");
  const area = (F, P) => F.reduce((s, tri) => {
    const [a, b, c] = tri.map((k) => P[k - 1]);
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    return s + 0.5 * Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
  }, 0);
  const v = rowsV(t.v('v')), f = rowsV(t.v('f'));
  for (const p of v) assert.ok(Math.abs(p[0] + 0.8) < 1e-12, 'on the xmin face');
  for (const cval of t.nums('c')) assert.ok(cval >= -1 - 1e-9, 'cap values are inside (above the isovalue)');
  const aIn = area(f, v), aOut = area(rowsV(t.v('fb')), rowsV(t.v('vb')));
  assert.ok(Math.abs(aIn - Math.PI * 0.36) < 0.01, `disc area ${aIn}`);
  assert.ok(Math.abs(aIn + aOut - 1.6 * 1.6) < 1e-9, 'above + below = the whole face');
  // the 6 faces of the box: each face carries a disc of the same area
  const fva = t.v('fva');
  assert.ok(Math.abs(area(rowsV(field(fva, 'faces')), rowsV(field(fva, 'vertices'))) - 6 * aIn) < 1e-9);
  // outward orientation on xmin: normal −x
  const [a, b, c] = f[0].map((k) => v[k - 1]);
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  assert.ok(nx < 0);
});

test('slice: planes and surfaces coloured by the trilinear field', () => {
  const t = session();
  t.run("[x, y, z] = meshgrid(1:5, 1:4, 1:3); V = x + 2*y + 3*z; h = slice(x, y, z, V, 2.5, [], 2); n = numel(h); X1 = get(h(1), 'XData'); C1 = get(h(1), 'CData'); Y1 = get(h(1), 'YData'); Z1 = get(h(1), 'ZData'); C2 = get(h(2), 'CData'); Z2 = get(h(2), 'ZData'); X2 = get(h(2), 'XData'); Y2 = get(h(2), 'YData');");
  assert.equal(t.num('n'), 2);
  assert.deepEqual(t.v('C1').dims, [3, 4]);
  const chk = (X, Y, Z, C) => { const xs = t.nums(X), ys = t.nums(Y), zs = t.nums(Z), cs = t.nums(C); cs.forEach((c, i) => assert.ok(close(c, xs[i] + 2 * ys[i] + 3 * zs[i], 1e-12))); };
  chk('X1', 'Y1', 'Z1', 'C1'); chk('X2', 'Y2', 'Z2', 'C2');
  assert.ok(t.nums('X1').every((x) => x === 2.5));
  assert.ok(t.nums('Z2').every((x) => x === 2));
  t.run("[xi, yi] = meshgrid(1:0.5:5, 1:0.5:4); zi = 1 + 0.5*xi; h2 = slice(x, y, z, V, xi, yi, zi); C3 = get(h2, 'CData'); ec = get(h2, 'EdgeColor'); hn = slice(V, 2.4, [], [], 'nearest'); C4 = get(hn, 'CData');");
  t.nums('C3').forEach((c, i) => { const X = t.nums('xi')[i], Y = t.nums('yi')[i]; const Z = 1 + 0.5 * X; assert.ok(Number.isNaN(c) ? Z > 3 : close(c, X + 2 * Y + 3 * Z, 1e-12)); });
  assert.ok(t.nums('C4').every((c, i) => Number.isFinite(c)));
  assert.deepEqual(t.nums('ec'), [0, 0, 0]);
});

test('smooth3: constant data unchanged, box and gaussian kernels sum to one', () => {
  const t = session();
  t.run("W = smooth3(5*ones(4, 5, 6), 'gaussian', [3 5 3]); D = zeros(5, 5, 5); D(3, 3, 3) = 27; B = smooth3(D); G = smooth3(D, 'gaussian', 5, 1); sB = sum(B(:)); sG = sum(G(:));");
  assert.ok(t.nums('W').every((x) => close(x, 5, 1e-12)));
  assert.deepEqual(t.v('B').dims, [5, 5, 5]);
  assert.ok(close(t.v('B').re[2 + 2 * 5 + 2 * 25], 1, 1e-12));
  assert.ok(close(t.num('sB'), 27, 1e-12));
  assert.ok(close(t.num('sG'), 27, 1e-12) || t.num('sG') < 27, 'gaussian keeps or loses mass only at the padded edges');
  assert.equal(t.fails("smooth3(ones(3, 3, 3), 'box', 2)").identifier, 'graphics:smooth3:size');
});

test('reducevolume, reducepatch and shrinkfaces', () => {
  const t = session();
  t.run('V = reshape(1:60, 3, 4, 5); nv = reducevolume(V, [2 1 2]); [nx, ny, nz, nv2] = reducevolume(V, 2);');
  assert.deepEqual(t.v('nv').dims, [3, 2, 3]);
  const V = Array.from({ length: 60 }, (_, k) => k + 1);
  const at = (i, j, k) => V[i + 3 * j + 12 * k];
  const want = [];
  for (const k of [0, 2, 4]) for (const j of [0, 2]) for (const i of [0, 1, 2]) want.push(at(i, j, k));
  assert.deepEqual(t.nums('nv'), want);
  assert.deepEqual(t.v('nx').dims, [2, 2, 3]);
  assert.deepEqual(t.nums('nx').slice(0, 4), [1, 1, 3, 3]);

  t.run('[x, y, z] = meshgrid(-1.3:0.1:1.3); S = -(x.^2 + y.^2 + z.^2); [f, v] = isosurface(x, y, z, S, -1); r = reducepatch(f, v, 0.2); nf = size(f, 1); nr = size(r.faces, 1); mx = max(abs(sqrt(sum(r.vertices.^2, 2)) - 1));');
  assert.ok(t.num('nr') <= 0.2 * t.num('nf') && t.num('nr') > 0.05 * t.num('nf'), `${t.num('nr')} of ${t.num('nf')}`);
  assert.ok(t.num('mx') < 0.15, 'the reduced mesh stays near the sphere');
  t.run("figure; p = patch('Faces', f, 'Vertices', v); reducepatch(p, 100); np = size(get(p, 'Faces'), 1);");
  assert.ok(t.num('np') <= 100 && t.num('np') > 20);

  t.run('[sf, sv] = shrinkfaces([1 2 3; 1 3 4], [0 0 0; 2 0 0; 2 2 0; 0 2 0], 0.5); s = shrinkfaces(struct(\'faces\', [1 2 3], \'vertices\', [0 0 0; 3 0 0; 0 3 0]));');
  const sv = rowsV(t.v('sv')), sf = rowsV(t.v('sf'));
  assert.equal(sv.length, 6);
  assert.deepEqual(sf, [[1, 2, 3], [4, 5, 6]]);
  const cen = (r) => [0, 1, 2].map((c) => (sv[r[0] - 1][c] + sv[r[1] - 1][c] + sv[r[2] - 1][c]) / 3);
  assert.ok(allClose(cen(sf[0]), [4 / 3, 2 / 3, 0], 1e-12));
  assert.ok(allClose(sv[0], [2 / 3, 1 / 3, 0], 1e-12), 'half way to the centroid');
  const s = t.v('s');
  assert.ok(allClose(rowsV(field(s, 'vertices'))[1], [1 + 0.3 * 2, 1 - 0.3, 0].map((x, i) => [1.6, 0.7, 0][i]), 1e-12));
});

test('stream2 / stream3 on uniform fields are straight lines; options limit the vertices', () => {
  const t = session();
  t.run('[x, y] = meshgrid(0:10); u = ones(size(x)); v = 0.5*ones(size(x)); xy = stream2(x, y, u, v, [1 2], [1 1]); xy2 = stream2(u, v, 2, 2, [0.1 5]);');
  const xy = t.v('xy');
  assert.deepEqual(xy.dims, [1, 2]);
  const P = rowsV(xy.data[0]);
  assert.ok(P.length > 50);
  for (const p of P) assert.ok(close(p[1] - 1, 0.5 * (p[0] - 1), 1e-9));
  assert.ok(P[P.length - 1][0] <= 10 && P[P.length - 1][0] > 9.5);
  assert.equal(t.v('xy2').data[0].dims[0], 5);
  t.run('[x, y, z] = meshgrid(0:6, 0:5, 0:4); U = ones(size(x)); V = zeros(size(x)); W = 0.5*ones(size(x)); s3 = stream3(x, y, z, U, V, W, 0, 2, 0);');
  const Q = rowsV(t.v('s3').data[0]);
  assert.ok(Q.length > 30);
  for (const q of Q) { assert.ok(close(q[1], 2, 1e-12)); assert.ok(close(q[2], 0.5 * q[0], 1e-9)); }
});

test('streamtube, ostreamtube and streamribbon build surfaces around the streamlines', () => {
  const t = session();
  t.run('[x, y, z] = meshgrid(0:5, 0:4, 0:4); U = ones(size(x)); V = zeros(size(x)); W = zeros(size(x));');
  t.run("h = streamtube(x, y, z, U, V, W, 0, 2, 2); Y = get(h, 'YData'); Z = get(h, 'ZData'); X = get(h, 'XData');");
  const Y = t.nums('Y'), Z = t.nums('Z');
  assert.deepEqual(t.v('Y').dims.slice(1), [21]);
  Y.forEach((yv, i) => assert.ok(close(Math.hypot(yv - 2, Z[i] - 2), 0.5, 1e-9), 'radius = half a cell'));
  t.run("h2 = ostreamtube(x, y, z, U, V, W, 0, 2, 2, [2 8]); Y2 = get(h2, 'YData'); Z2 = get(h2, 'ZData');");
  t.nums('Y2').forEach((yv, i) => assert.ok(close(Math.hypot(yv - 2, t.nums('Z2')[i] - 2), 1, 1e-9)));
  assert.deepEqual(t.v('Y2').dims.slice(1), [9]);
  t.run("hr = streamribbon(x, y, z, U, V, W, 0, 2, 2, 0.4); R = get(hr, 'YData'); RZ = get(hr, 'ZData'); RX = get(hr, 'XData');");
  const R = rowsV(t.v('R')), RZ = rowsV(t.v('RZ'));
  assert.deepEqual(t.v('R').dims.slice(1), [2]);
  R.forEach((r, i) => assert.ok(close(Math.hypot(r[0] - r[1], RZ[i][0] - RZ[i][1]), 0.4, 1e-9), 'ribbon width'));
  // a rotating field twists the ribbon: u = 1 along x with swirl (v, w) = (-(z-2), (y-2))
  t.run("Vs = -(z - 2); Ws = (y - 2); hs = streamribbon(x, y, z, U, Vs, Ws, 0, 2, 2, 0.4); TY = get(hs, 'YData'); TZ = get(hs, 'ZData');");
  const TY = rowsV(t.v('TY')), TZ = rowsV(t.v('TZ'));
  const ang = (r, i) => Math.atan2(TZ[i][1] - TZ[i][0], r[1] - r[0]);
  assert.ok(Math.abs(ang(TY[TY.length - 1], TY.length - 1) - ang(TY[0], 0)) > 0.5, 'the ribbon turns along the swirling streamline');
  t.run("hv = streamribbon({[0 0 0; 1 0 0; 2 0 0]}, {[0 pi/2 pi]}, 1); VZ = get(hv, 'ZData'); ht = streamtube({[0 0 0; 1 0 0]}, 2);");
  assert.ok(allClose(rowsV(t.v('VZ'))[0], [-0.5, 0.5], 1e-12));
  assert.ok(rowsV(t.v('VZ'))[1].every((v) => Math.abs(v) < 1e-12), 'turned by 90 degrees');
});

test('triplot, trimesh, trisurf and tetramesh', () => {
  const t = session();
  t.run("tri = [1 2 3; 2 4 3]; x = [0 1 0 1]; y = [0 0 1 1]; z = [0 1 2 3]; h = triplot(tri, x, y, 'r--'); X = get(h, 'XData'); col = get(h, 'Color'); ls = get(h, 'LineStyle');");
  assert.deepEqual(t.nums('X').map((v) => (Number.isNaN(v) ? 'n' : v)), [0, 1, 0, 0, 'n', 1, 1, 0, 1, 'n']);
  assert.deepEqual(t.nums('col'), [1, 0, 0]);
  assert.equal(t.text('ls'), '--');
  t.run("figure; hs = trisurf(tri, x, y, z); F = get(hs, 'Faces'); Vt = get(hs, 'Vertices'); fc = get(hs, 'FaceColor'); hm = trimesh(tri, x, y, z, [4 3 2 1]); ec = get(hm, 'EdgeColor'); cd = get(hm, 'FaceVertexCData'); vw = get(gca, 'View');");
  assert.deepEqual(rowsV(t.v('F')), [[1, 2, 3], [2, 4, 3]]);
  assert.deepEqual(rowsV(t.v('Vt'))[3], [1, 1, 3]);
  assert.equal(t.text('fc'), 'flat');
  assert.equal(t.text('ec'), 'interp');
  assert.deepEqual(t.nums('cd'), [4, 3, 2, 1]);
  assert.deepEqual(t.nums('vw'), [-37.5, 30]);
  t.run("figure; T = [1 2 3 4; 2 3 4 5]; P = [0 0 0; 1 0 0; 0 1 0; 0 0 1; 1 1 1]; ht = tetramesh(T, P); nt = numel(ht); f1 = get(ht(1), 'Faces'); v2 = get(ht(2), 'Vertices'); c1 = get(ht(1), 'FaceColor'); c2 = get(ht(2), 'FaceColor');");
  assert.equal(t.num('nt'), 2);
  assert.deepEqual(t.v('f1').dims, [4, 3]);
  assert.deepEqual(rowsV(t.v('v2'))[3], [1, 1, 1]);
  assert.notDeepEqual(t.nums('c1'), t.nums('c2'));
  assert.equal(t.fails('triplot([1 2 9], [0 1 2], [0 1 0])').identifier, 'graphics:triplot:tri');
});

test('surfnorm normals, diffuse and specular reflectance, surfl', () => {
  const t = session();
  t.run('[x, y] = meshgrid(0:4, 0:3); z = x; [nx, ny, nz] = surfnorm(x, y, z); [ax, ay, az] = surfnorm(zeros(3, 4));');
  const s = Math.SQRT1_2;
  assert.ok(t.nums('nx').every((v) => close(v, -s, 1e-12)) && t.nums('ny').every((v) => Math.abs(v) < 1e-12) && t.nums('nz').every((v) => close(v, s, 1e-12)));
  assert.ok(t.nums('az').every((v) => v === 1));
  t.run('figure; surfnorm(x, y, z); nl = numel(findobj(gca, \'Type\', \'line\')); ns = numel(findobj(gca, \'Type\', \'surface\'));');
  assert.equal(t.num('nl'), 1); assert.equal(t.num('ns'), 1);
  t.run('d = diffuse([0 0 1], [0 0 0], [1 1 0], [1 0 1]); d2 = diffuse(0, 0, 1, [0 90]);');
  assert.ok(allClose(t.nums('d'), [s, s, s], 1e-12));
  assert.ok(close(t.num('d2'), 1, 1e-12));
  t.run('s1 = specular(0, 0, 1, [0 0 1], [0 0 1]); s2 = specular(0, 0, 1, [1 0 1], [-1 0 1]); s3 = specular(0, 0, 1, [1 0 1], [0 0 1]); s4 = specular(0, 0, 1, [1 0 1], [0 0 1], 2); s5 = specular(0, 0, 1, [0 0 -1], [0 0 1]);');
  assert.ok(close(t.num('s1'), 1, 1e-12));
  assert.ok(close(t.num('s2'), 1, 1e-12));
  assert.ok(close(t.num('s3'), s ** 10, 1e-12));
  assert.ok(close(t.num('s4'), 0.5, 1e-12));
  assert.equal(t.num('s5'), 0);
  t.run("figure; [X, Y] = meshgrid(-2:0.25:2); Z = X.*exp(-X.^2 - Y.^2); h = surfl(X, Y, Z); C = get(h, 'CData'); figure; h2 = surfl(X, Y, Z, 'light'); nlight = numel(findobj(gca, 'Type', 'light'));");
  const C = t.nums('C');
  assert.ok(C.every((c) => c >= 0.55 - 1e-12 && c <= 0.55 + 0.6 + 0.4 + 1e-12));
  assert.ok(Math.max(...C) - Math.min(...C) > 0.2, 'the shading varies over the surface');
  assert.equal(t.num('nlight'), 1);
});

test('rotate: lines, surfaces, patches and text about an axis through an origin', () => {
  const t = session();
  t.run("h = line([1 2], [0 0], [0 0]); rotate(h, [0 0 1], 90, [0 0 0]); X = get(h, 'XData'); Y = get(h, 'YData');");
  assert.ok(allClose(t.nums('X'), [0, 0], 1e-12) || t.nums('X').every((v) => Math.abs(v) < 1e-12));
  assert.ok(allClose(t.nums('Y'), [1, 2], 1e-12));
  t.run("p = patch('Faces', [1 2 3], 'Vertices', [0 0 0; 1 0 0; 0 1 0]); rotate(p, [90 0], 180, [0 0 0]); Vp = get(p, 'Vertices');");
  // [theta phi] = [90 0] is the +y axis: (x, y, z) → (−x, y, −z)
  const Vp = rowsV(t.v('Vp'));
  assert.ok(allClose(Vp[1], [-1, 0, 0].map((v) => v), 1e-12) || allClose(Vp[1].map((v) => v + 0), [-1, 0, 0], 1e-12));
  assert.ok(allClose(Vp[2], [0, 1, 0], 1e-12));
  t.run("figure; [x, y] = meshgrid(0:2, 0:1); s = surface(x, y, zeros(2, 3)); tx = text(1, 0, 0, 'a'); rotate([s; tx], [1 0 0], 90, [0 0 0]); Zs = get(s, 'ZData'); Ys = get(s, 'YData'); pt = get(tx, 'Position');");
  assert.ok(allClose(t.nums('Zs'), [0, 1, 0, 1, 0, 1], 1e-12));
  assert.ok(t.nums('Ys').every((v) => Math.abs(v) < 1e-12));
  assert.ok(allClose(t.nums('pt'), [1, 0, 0], 1e-12));
  t.run("figure; h2 = line([0 2], [0 0]); rotate(h2, [0 0 1], 180); X2 = get(h2, 'XData');");
  assert.ok(allClose(t.nums('X2'), [2, 0], 1e-12), 'default origin = centre of the data');
});


// ---------------------------------------------------------------- uiextra: menus, tools, tables, button groups

test('uimenu: menu bar, submenus, Label/Text alias, Position order and MenuSelected callbacks', () => {
  const t = session();
  t.run("f = figure; m = uimenu(f, 'Label', '&File'); a = uimenu(m, 'Text', 'Open', 'Callback', 'opened = 1;', 'Accelerator', 'O');");
  t.run("b = uimenu(m, 'Label', 'Quit', 'Separator', 'on', 'MenuSelectedFcn', @(s, e) assignin('base', 'evname', e.EventName)); s = uimenu(m, 'Label', 'Sub'); uimenu(s, 'Label', 'Deep');");
  t.run("lbl = get(a, 'Label'); txt2 = b.Text; p = [a.Position b.Position s.Position]; ty = get(m, 'Type'); par = get(a, 'Parent') == m;");
  assert.equal(t.text('lbl'), 'Open');
  assert.equal(t.text('txt2'), 'Quit');
  assert.deepEqual(t.nums('p'), [1, 2, 3]);
  assert.equal(t.text('ty'), 'uimenu');
  assert.equal(t.num('par'), 1);
  const sc = t.scene();
  const fig = sc.figures.find((x) => x.type === 'figure');
  const menu = findNode(fig, (n) => n.type === 'uimenu' && n.props.Text === '&File');
  assert.ok(menu, 'menu bar menu in the scene');
  assert.equal(menu.children.length, 3);
  const open = findNode(fig, (n) => n.props && n.props.Text === 'Open');
  assert.equal(open.props.Accelerator, 'O');
  assert.equal(open.props.Callback, true);
  t.s.handleMessage({ type: 'graphics.callback', handle: open.id, event: 'MenuSelected' });
  assert.equal(t.num('opened'), 1);
  const quit = findNode(fig, (n) => n.props && n.props.Text === 'Quit');
  assert.equal(quit.props.Separator, true);
  t.s.handleMessage({ type: 'graphics.callback', handle: quit.id, event: 'MenuSelected' });
  assert.equal(t.text('evname'), 'Action');
  t.run("set(a, 'Enable', 'off'); opened = 0;");
  t.s.handleMessage({ type: 'graphics.callback', handle: open.id, event: 'MenuSelected' });
  assert.equal(t.num('opened'), 0, 'a disabled menu does not run its callback');
  t.fails("uimenu(gca, 'Label', 'x')");
});

test('uicontextmenu: ContextMenu / UIContextMenu are sent as the menu id, opening callback runs', () => {
  const t = session();
  t.run("f = figure; cm = uicontextmenu(f, 'Callback', 'opening = 1;'); it = uimenu(cm, 'Label', 'Red', 'Callback', 'picked = 7;'); h = plot(1:3); h.UIContextMenu = cm; f.ContextMenu = cm;");
  t.run("same = get(h, 'UIContextMenu') == cm; ty = cm.Type;");
  assert.equal(t.num('same'), 1);
  assert.equal(t.text('ty'), 'uicontextmenu');
  const fig = t.scene().figures[0];
  const cm = findNode(fig, (n) => n.type === 'uicontextmenu');
  const line = findNode(fig, (n) => n.type === 'line');
  assert.equal(line.props.ContextMenu, cm.id);
  assert.equal(fig.props.ContextMenu, cm.id);
  t.s.handleMessage({ type: 'graphics.callback', handle: cm.id, event: 'ContextMenuOpening' });
  assert.equal(t.num('opening'), 1);
  t.s.handleMessage({ type: 'graphics.callback', handle: cm.children[0].id, event: 'MenuSelected' });
  assert.equal(t.num('picked'), 7);
  t.fails("uicontextmenu(gca)");
});

test('uitoolbar / uipushtool / uitoggletool: default tool bar, State, On/Off/Clicked callbacks', () => {
  const t = session();
  t.run("f = figure; img = zeros(16, 16, 3); img(:, :, 1) = 1; p = uipushtool('CData', img, 'TooltipString', 'Run', 'ClickedCallback', 'runs = 1;');");
  t.run("tb = get(p, 'Parent'); tt = uitoggletool(tb, 'Tooltip', 'Grid', 'OnCallback', 'st = 1;', 'OffCallback', 'st = 0;', 'ClickedCallback', 'clicks = 1;'); ty = get(tb, 'Type'); tip = tt.TooltipString; s0 = tt.State;");
  assert.equal(t.text('ty'), 'uitoolbar');
  assert.equal(t.text('tip'), 'Grid');
  assert.equal(t.text('s0'), 'off');
  const fig = t.scene().figures[0];
  const bar = findNode(fig, (n) => n.type === 'uitoolbar');
  assert.equal(bar.children.length, 2);
  const push = findNode(fig, (n) => n.type === 'uipushtool');
  assert.deepEqual(push.props.CData.dims, [16, 16, 3]);
  assert.equal(push.props.TooltipString, 'Run');
  t.s.handleMessage({ type: 'graphics.callback', handle: push.id, event: 'ClickedCallback' });
  assert.equal(t.num('runs'), 1);
  const tog = findNode(fig, (n) => n.type === 'uitoggletool');
  t.s.handleMessage({ type: 'graphics.callback', handle: tog.id, event: 'ClickedCallback', props: { State: true } });
  t.run('s1 = tt.State;');
  assert.equal(t.text('s1'), 'on');
  assert.equal(t.num('st'), 1);
  assert.equal(t.num('clicks'), 1);
  t.s.handleMessage({ type: 'graphics.callback', handle: tog.id, event: 'ClickedCallback', props: { State: false } });
  assert.equal(t.num('st'), 0);
  t.fails("uipushtool(gcf)");
});

test('uitable: Data, names, scene cells, CellEdit conversion and CellSelection events', () => {
  const t = session();
  t.run("f = figure; d = {1, 'a', true; 2.5, 'b', false}; tb = uitable(f, 'Data', d, 'ColumnName', {'x', 'name', 'ok'}, 'ColumnEditable', [true true true], 'CellEditCallback', @(s, e) assignin('base', 'ev', e), 'CellSelectionCallback', @(s, e) assignin('base', 'sel', e.Indices));");
  t.run("rn = get(tb, 'RowName'); cn = tb.ColumnName;");
  assert.equal(t.text('rn'), 'numbered');
  assert.equal(t.v('cn').data.length, 3);
  const fig = t.scene().figures[0];
  const node = findNode(fig, (n) => n.type === 'uitable');
  assert.deepEqual(node.props.ColumnNames, ['x', 'name', 'ok']);
  assert.deepEqual(node.props.RowNames, ['1', '2']);
  assert.deepEqual(node.props.Editable, [true, true, true]);
  assert.deepEqual(node.props.Cells[1], [{ t: 'n', v: 2.5, s: '2.5' }, { t: 's', v: 'b' }, { t: 'b', v: false }]);
  t.s.handleMessage({ type: 'graphics.callback', handle: node.id, event: 'CellEdit', data: { row: 2, col: 1, value: '7.25' } });
  t.run("ix = ev.Indices; pd = ev.PreviousData; nd = ev.NewData; ed = ev.EditData; er = ev.Error; d2 = tb.Data; v21 = d2{2, 1};");
  assert.deepEqual(t.nums('ix'), [2, 1]);
  assert.equal(t.num('pd'), 2.5);
  assert.equal(t.num('nd'), 7.25);
  assert.equal(t.text('ed'), '7.25');
  assert.equal(t.text('er'), '');
  assert.equal(t.num('v21'), 7.25);
  t.s.handleMessage({ type: 'graphics.callback', handle: node.id, event: 'CellEdit', data: { row: 1, col: 1, value: 'abc' } });
  t.run("er = ev.Error; v11 = tb.Data{1, 1};");
  assert.match(t.text('er'), /not a number/);
  assert.equal(t.num('v11'), 1, 'a bad number leaves the data unchanged');
  t.s.handleMessage({ type: 'graphics.callback', handle: node.id, event: 'CellEdit', data: { row: 1, col: 3, value: false } });
  t.run("b13 = tb.Data{1, 3}; c = class(b13);");
  assert.equal(t.text('c'), 'logical');
  assert.equal(t.num('b13'), 0);
  t.s.handleMessage({ type: 'graphics.callback', handle: node.id, event: 'CellSelection', data: { indices: [[2, 3]] } });
  assert.deepEqual(t.nums('sel'), [2, 3]);
  // numeric matrix data stays numeric
  t.run("t2 = uitable('Data', magic(3), 'ColumnEditable', true, 'RowName', []);");
  const n2 = findNode(t.scene().figures[0], (n) => n.type === 'uitable' && n.props.Cells.length === 3);
  assert.deepEqual(n2.props.RowNames, []);
  assert.deepEqual(n2.props.Editable, [true, true, true]);
  t.s.handleMessage({ type: 'graphics.callback', handle: n2.id, event: 'CellEdit', data: { row: 1, col: 1, value: '-4' } });
  t.run("m11 = t2.Data(1, 1); cls = class(t2.Data);");
  assert.equal(t.num('m11'), -4);
  assert.equal(t.text('cls'), 'double');
  t.fails("uitable('Data', struct('a', 1))");
});

test('uibuttongroup: exclusive radio buttons, SelectedObject and SelectionChangedFcn', () => {
  const t = session();
  t.run("f = figure; bg = uibuttongroup(f, 'Title', 'Mode', 'SelectionChangedFcn', @(s, e) assignin('base', 'chg', [get(e.OldValue, 'Value') get(e.NewValue, 'Value')]));");
  t.run("r1 = uicontrol(bg, 'Style', 'radiobutton', 'String', 'A'); r2 = uicontrol(bg, 'Style', 'radiobutton', 'String', 'B'); r3 = uicontrol(bg, 'Style', 'togglebutton', 'String', 'C');");
  t.run("v = [r1.Value r2.Value r3.Value]; first = bg.SelectedObject == r1;");
  assert.deepEqual(t.nums('v'), [1, 0, 0]);
  assert.equal(t.num('first'), 1);
  t.run("bg.SelectedObject = r3; v = [r1.Value r2.Value r3.Value];");
  assert.deepEqual(t.nums('v'), [0, 0, 1]);
  t.run("set(r2, 'Value', 1); v = [r1.Value r2.Value r3.Value];");
  assert.deepEqual(t.nums('v'), [0, 1, 0]);
  const fig = t.scene().figures[0];
  const g = findNode(fig, (n) => n.type === 'uibuttongroup');
  assert.equal(g.props.Title, 'Mode');
  const b1 = findNode(fig, (n) => n.type === 'uicontrol' && n.props.String === 'A');
  t.posted.length = 0;
  t.s.handleMessage({ type: 'graphics.callback', handle: b1.id, event: 'Callback', props: { Value: 1 } });
  t.run("v = [r1.Value r2.Value r3.Value];");
  assert.deepEqual(t.nums('v'), [1, 0, 0]);
  assert.deepEqual(t.nums('chg'), [0, 1], 'old button now off, new on');
  const upd = t.posted.filter((m) => m.type === 'graphics.update').pop();
  const b2 = findNode(upd.figures[0], (n) => n.type === 'uicontrol' && n.props.String === 'B');
  assert.equal(b2.props.Value, 0, 'the deselected sibling is sent to the GUI');
  t.fails("bg.SelectedObject = figure;");
});

test('uisetfont: list + input dialogs, struct result, applies to a handle, 0 on cancel, error without GUI', () => {
  let cancel = false;
  const seen = [];
  const t = session({ requests: { 'graphics.dialog': (m) => { seen.push(m.kind); if (cancel) return { cancelled: true }; return m.kind === 'listdlg' ? { indices: [m.items.indexOf('Georgia') + 1] } : { values: ['14', 'bold', 'italic'] }; } } });
  t.run("h = text(0.5, 0.5, 'hi'); s = uisetfont(h, 'Pick'); n = s.FontName; w = s.FontWeight; a = s.FontAngle; z = s.FontSize; fn = get(h, 'FontName'); fz = get(h, 'FontSize');");
  assert.deepEqual(seen, ['listdlg', 'inputdlg']);
  assert.equal(t.text('n'), 'Georgia');
  assert.equal(t.text('w'), 'bold');
  assert.equal(t.text('a'), 'italic');
  assert.equal(t.num('z'), 14);
  assert.equal(t.text('fn'), 'Georgia');
  assert.equal(t.num('fz'), 14);
  cancel = true;
  t.run('r = uisetfont;');
  assert.equal(t.num('r'), 0);
  session().fails('uisetfont');
});

test('figure GUI helpers: menu items, accelerators, context menus, tool bars, table text', async () => {
  const U = await import('../src/graphics/uimodel.js');
  const node = (id, type, props, children = []) => ({ id, type, props: { Visible: true, ...props }, children, auto: [] });
  const deep = node(5, 'uimenu', { Text: 'Deep', Position: 1, Accelerator: 'D' });
  const sub = node(4, 'uimenu', { Text: 'Sub', Position: 3 }, [deep]);
  const quit = node(3, 'uimenu', { Text: 'Quit', Position: 2, Separator: true, Enable: false });
  const open = node(2, 'uimenu', { Text: '&Open && go', Position: 1, Accelerator: 'o', Checked: true });
  const file = node(1.5, 'uimenu', { Text: 'File', Position: 1 }, [sub, quit, open]);
  const cm = node(6, 'uicontextmenu', {}, [node(7, 'uimenu', { Text: 'Red' })]);
  const tb = node(8, 'uitoolbar', {}, [node(10, 'uitoggletool', { Tag: 'tg', State: true }), node(9, 'uipushtool', { TooltipString: 'Run' })]);
  const fig = node(1, 'figure', { ContextMenu: 6 }, [tb, cm, file]);
  assert.deepEqual(U.menuChildren(file).map((m) => m.props.Text), ['&Open && go', 'Quit', 'Sub']);
  const items = U.menuItems(file);
  assert.deepEqual(items.map((i) => i.sep ? '-' : i.label), ['Open & go', '-', 'Quit', 'Sub …']);
  assert.equal(items[0].keys, 'Ctrl+O');
  assert.equal(items[0].icon, 'check');
  assert.equal(items[2].disabled, true);
  assert.equal(items[3].icon, 'chevronRight');
  assert.equal(U.findAccelerator(fig, 'd').id, 5);
  assert.equal(U.findAccelerator(fig, 'O').id, 2);
  assert.equal(U.findAccelerator(fig, 'x'), null);
  assert.equal(U.contextMenuOf(fig, fig).id, 6);
  assert.equal(U.findIn(fig, 7).props.Text, 'Red');
  const bars = U.toolbarsOf(fig);
  assert.equal(bars.length, 1);
  assert.deepEqual(bars[0].tools.map((x) => U.toolLabel(x)), ['Run', 'tg']);
  const px = U.cdataPixels({ dims: [1, 2, 3], data: [1, NaN, 0, 0, 0, 0] });
  assert.deepEqual(Array.from(px.data), [255, 0, 0, 255, 0, 0, 0, 0]);
  assert.equal(U.cellText({ t: 'n', v: 2.5, s: '2.5' }), '2.5');
  assert.equal(U.cellText({ t: 'b', v: true }), 'true');
});

test('openfig reuse / visible flags, hgsave .ofig, hgload with a property struct', () => {
  const t = session();
  t.run("f = figure('Name', 'Saved'); plot(1:3, [4 5 6]); title('My title'); xlim([0 4]); savefig(f, 'one'); hgsave(f, 'two'); close all;");
  t.run("e1 = exist('one.fig', 'file'); e2 = exist('two.ofig', 'file');");
  assert.equal(t.num('e1'), 2);
  assert.equal(t.num('e2'), 2, 'hgsave without an extension writes .ofig');
  t.run("h = openfig('one.fig'); tt = get(get(gca, 'Title'), 'String'); xl = get(gca, 'XLim');");
  assert.equal(t.text('tt'), 'My title');
  assert.deepEqual(t.nums('xl'), [0, 4]);
  t.run("h2 = openfig('one.fig', 'reuse'); same = (h2 == h); n = numel(findobj(0, 'Type', 'figure'));");
  assert.equal(t.num('same'), 1, 'reuse brings back the same figure');
  assert.equal(t.num('n'), 1, 'and loads no second copy');
  t.run("h3 = openfig('one.fig', 'new', 'invisible'); vis = get(h3, 'Visible'); n2 = numel(findobj(0, 'Type', 'figure'));");
  assert.equal(t.text('vis'), 'off');
  assert.equal(t.num('n2'), 2);
  t.run("[h4, old] = hgload('two', struct('Name', 'Loaded')); n4 = get(h4, 'Name'); oldn = old.Name;");
  assert.equal(t.text('n4'), 'Loaded');
  assert.equal(t.text('oldn'), 'Saved');
});
