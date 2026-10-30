// Side panels per screen (src/panes/panels.js), the editor outline
// (src/lib/outline.js) and the engine's help search (session.helpSearch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PANES, PANEL_SETS, SIDE_CHOICES, panelSetFor, tabForDocKind, panelKey, migrateLayout, sideState, panelsOf, sideShown, sidePatch, resetPatch,
  swapPane, addPane, removePane, movePane, paneWeights, splitWeights, addablePanes, PLOTS, GALLERY_GROUPS, plotCommand, variableStats, limitStep, defaultSide,
} from '../src/panes/panels.js';
import { outlineOf, functionName, stripLine } from '../src/lib/outline.js';
import { merge, DEFAULTS } from '../src/lib/settings.js';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

const apply = (settings, patch) => merge(settings, patch);

test('every panel set names known panes; every pane has an icon and a title', () => {
  for (const [id, p] of Object.entries(PANES)) { assert.ok(p.icon, id); assert.ok(p.title, id); }
  for (const [id, set] of Object.entries(PANEL_SETS)) {
    for (const side of ['left', 'right']) {
      assert.ok(set[side].length > 0, `${id}.${side} has panes`);
      for (const p of set[side]) { assert.ok(PANES[p], `${id}.${side}: ${p}`); assert.ok(SIDE_CHOICES[side].includes(p), `${p} can be chosen on the ${side}`); }
    }
    assert.equal(new Set([...set.left, ...set.right]).size, set.left.length + set.right.length, `${id}: a pane is on one side only`);
  }
  // left = tools, right = properties / state
  assert.deepEqual(PANEL_SETS.plots.left, ['gallery']);
  assert.ok(PANEL_SETS.plots.right.includes('figprops'));
  assert.ok(PANEL_SETS.editor.left.includes('outline'));
  assert.ok(PANEL_SETS.editor.right.includes('debug') && PANEL_SETS.editor.right.includes('docprops'));
  assert.deepEqual(PANEL_SETS.help, { ...PANEL_SETS.help, left: ['guidetoc'], right: ['funchelp'] });
  assert.deepEqual(PANEL_SETS.variable.right, ['varprops']);
  assert.deepEqual(PANEL_SETS.simulation.left, ['simlib']);
  assert.deepEqual(PANEL_SETS.simulation.right, ['simtree', 'blockprops']);
});

test('the screen: ribbon tab, active document and who chose last', () => {
  assert.equal(panelSetFor('home'), 'home');
  assert.equal(panelSetFor('apps'), 'home');
  assert.equal(panelSetFor('plots'), 'plots');
  assert.equal(panelSetFor('nonsense'), 'home');
  assert.equal(panelSetFor('editor', 'var', true), 'variable', 'a variable tab activated → variable panels');
  assert.equal(panelSetFor('editor', 'var', false), 'editor', 'a ribbon tab picked afterwards wins');
  assert.equal(tabForDocKind('file'), 'editor');
  assert.equal(tabForDocKind('figures'), 'plots');
  assert.equal(tabForDocKind('model'), 'simulation');
  assert.equal(tabForDocKind('var'), null);
  assert.equal(panelKey('main', 'plots'), 'plots');
  assert.equal(panelKey('doc-3', 'editor'), 'doc-3:editor');
});

test('migration: the old global layout becomes the home panels', () => {
  const m = migrateLayout({ folder: { on: true, w: 320, collapsed: true }, workspace: { on: false }, history: { on: true }, rightW: 410, rightCollapsed: false, wsRatio: 0.7 });
  assert.equal(m.left.w, 320);
  assert.equal(m.left.collapsed, true);
  assert.deepEqual(m.right.panes, ['history']);
  assert.equal(m.right.w, 410);
  assert.ok(Math.abs(m.right.ratio.workspace - 0.7) < 1e-12);
  const off = migrateLayout({ folder: { on: false }, workspace: { on: false }, history: { on: false } });
  assert.equal(off.left.on, false);
  assert.equal(off.right.on, false);
  assert.deepEqual(migrateLayout(undefined).right.panes, ['workspace', 'history']);
  // read from settings when no panels are stored yet; other screens start from their defaults
  const s = merge(DEFAULTS, { layout: { folder: { w: 333 } } });
  assert.equal(sideState(s, 'home', 'left').w, 333);
  assert.equal(sideState(s, 'plots', 'left').w, defaultSide('plots', 'left').w);
  assert.deepEqual(panelsOf(s, 'plots').left.panes, ['gallery']);
});

test('per-screen memory: a patch writes the whole side and leaves the other screens alone', () => {
  let s = merge(DEFAULTS, { layout: { folder: { on: true, w: 300 }, workspace: { on: false } } });
  s = apply(s, sidePatch(s, 'home', 'right', { w: 420 }));
  assert.equal(sideState(s, 'home', 'right').w, 420);
  assert.deepEqual(sideState(s, 'home', 'right').panes, ['history'], 'the migrated pane list survives a partial patch');
  s = apply(s, sidePatch(s, 'plots', 'left', { collapsed: true }));
  assert.equal(sideState(s, 'plots', 'left').collapsed, true);
  assert.equal(sideState(s, 'editor', 'left').collapsed, false);
  assert.equal(sideState(s, 'home', 'left').w, 300);
  // a child window's sets are separate
  s = apply(s, sidePatch(s, panelKey('doc-1', 'editor'), 'left', { w: 199 }));
  assert.equal(sideState(s, 'doc-1:editor', 'left').w, 199);
  assert.equal(sideState(s, 'editor', 'left').w, 250);
  assert.deepEqual(sideState(s, 'doc-1:editor', 'left').panes, PANEL_SETS.editor.left);
  // reset
  s = apply(s, resetPatch('home'));
  assert.deepEqual(sideState(s, 'home', 'right').panes, ['workspace', 'history']);
  // widths are clamped, unknown panes dropped, duplicates removed
  const bad = { panels: { help: { left: { w: 5, panes: ['guidetoc', 'nope', 'guidetoc'] } } } };
  assert.equal(sideState(bad, 'help', 'left').w, 170);
  assert.deepEqual(sideState(bad, 'help', 'left').panes, ['guidetoc']);
});

test('pane chooser edits: swap, add, remove, move, weights', () => {
  const s = sideState({}, 'editor', 'right'); // debug, docprops, workspace
  assert.deepEqual(swapPane(s, 'docprops', 'history').panes, ['debug', 'history', 'workspace']);
  assert.deepEqual(swapPane(s, 'debug', 'workspace').panes, ['workspace', 'docprops', 'debug'], 'two shown panes trade places');
  assert.deepEqual(swapPane(s, 'debug', 'debug'), {});
  assert.deepEqual(addPane(s, 'history').panes, ['debug', 'docprops', 'workspace', 'history']);
  assert.deepEqual(addPane(s, 'history', 'debug').panes, ['debug', 'history', 'docprops', 'workspace']);
  assert.equal(addPane(s, 'debug').panes, undefined, 'already there: only unfolded');
  assert.deepEqual(removePane(s, 'debug').panes, ['docprops', 'workspace']);
  assert.deepEqual(removePane({ ...s, panes: ['debug'] }, 'debug'), { panes: ['debug'], on: false }, 'the last pane turns the side off');
  assert.deepEqual(movePane(s, 'workspace', -1).panes, ['debug', 'workspace', 'docprops']);
  assert.deepEqual(movePane(s, 'debug', -1), {});
  const w = paneWeights({ ...s, fold: { docprops: true } });
  assert.deepEqual(Object.keys(w), ['debug', 'workspace']);
  assert.ok(Math.abs(w.debug + w.workspace - 1) < 1e-12);
  const w2 = splitWeights({ a: 0.5, b: 0.3, c: 0.2 }, 'a', 'b', 0.25);
  assert.ok(Math.abs(w2.a - 0.2) < 1e-12 && Math.abs(w2.b - 0.6) < 1e-12 && w2.c === 0.2);
  assert.ok(addablePanes(s, 'right').includes('history'));
  assert.ok(!addablePanes(s, 'right').includes('debug'));
  assert.equal(sideShown({ on: true, panes: [] }), false);
});

test('plot gallery: groups cover the ribbon templates; commands fit the selection', () => {
  const ids = GALLERY_GROUPS.flatMap((g) => g[2]).sort();
  assert.deepEqual(ids, PLOTS.map((p) => p[0]).sort());
  const v = (name, dims, cls = 'double') => ({ name, dims, cls });
  assert.deepEqual(plotCommand('plot', [v('y', [1, 50])]), { cmd: 'plot(y)' });
  assert.deepEqual(plotCommand('scatter', [v('y', [1, 50])]), { cmd: 'scatter(1:numel(y), y)' });
  assert.deepEqual(plotCommand('plot', [v('x', [1, 50]), v('y', [1, 50])]), { cmd: 'plot(x, y)' });
  assert.deepEqual(plotCommand('plot', [v('x', [50, 1]), v('Y', [50, 3])]), { cmd: 'plot(x, Y)' });
  assert.deepEqual(plotCommand('surf', [v('Z', [20, 30])]), { cmd: 'surf(Z)' });
  assert.deepEqual(plotCommand('surf', [v('x', [1, 30]), v('y', [1, 20]), v('Z', [20, 30])]), { cmd: 'surf(x, y, Z)' });
  assert.deepEqual(plotCommand('contour', [v('X', [20, 30]), v('Y', [20, 30]), v('Z', [20, 30])]), { cmd: 'contour(X, Y, Z)' });
  assert.equal(plotCommand('surf', [v('y', [1, 50])]).error, 'px_need_matrix');
  assert.equal(plotCommand('pie', [v('M', [3, 3])]).error, 'px_need_vector');
  assert.equal(plotCommand('plot', []).error, 'px_need_var');
  assert.equal(plotCommand('plot', [v('s', [1, 5], 'char')]).error, 'px_need_numeric');
  assert.equal(plotCommand('plot', [v('e', [0, 0])]).error, 'px_empty');
  assert.equal(plotCommand('plot', [v('x', [1, 5]), v('y', [1, 6])]).error, 'px_xy_length');
  assert.equal(plotCommand('histogram', [v('x', [1, 5]), v('y', [1, 5])]).error, 'px_one_var');
  assert.equal(plotCommand('surf', [v('x', [1, 5]), v('y', [1, 5])]).error, 'px_need_xyz');
  assert.equal(plotCommand('surf', [v('x', [1, 5]), v('y', [1, 5]), v('Z', [20, 30])]).error, 'px_xyz_size');
  assert.equal(plotCommand('plot', [v('a', [1, 2]), v('b', [1, 2]), v('c', [1, 2])]).error, 'px_too_many');
});

test('variable properties: numeric statistics, struct fields, table columns, cells', () => {
  const n = variableStats({ cls: 'double', dims: [1, 5], re: new Float64Array([1, 2, NaN, 4, 0]) });
  assert.equal(n.kind, 'numeric');
  assert.equal(n.min, 0);
  assert.equal(n.max, 4);
  assert.equal(n.mean, 7 / 4);
  assert.equal(n.nan, 1);
  assert.equal(n.nnz, 4);
  assert.ok(Math.abs(n.std - Math.sqrt(((1 - 1.75) ** 2 + (2 - 1.75) ** 2 + (4 - 1.75) ** 2 + 1.75 ** 2) / 3)) < 1e-12);
  const s = variableStats({ cls: 'struct', dims: [1, 1], fields: ['a', 'b'], data: [{ a: { cls: 'double', dims: [1, 1] }, b: { cls: 'char', dims: [1, 3] } }] });
  assert.deepEqual(s.fields, [{ name: 'a', cls: 'double', dims: [1, 1] }, { name: 'b', cls: 'char', dims: [1, 3] }]);
  const tb = variableStats({ cls: 'table', isObject: true, dims: [3, 2], props: { names: ['x', 'y'], vars: [{ cls: 'double', dims: [3, 1] }, { cls: 'string', dims: [3, 1] }] } });
  assert.equal(tb.kind, 'table');
  assert.equal(tb.rows, 3);
  assert.deepEqual(tb.columns.map((c) => c.cls), ['double', 'string']);
  const c = variableStats({ cls: 'cell', dims: [1, 3], data: [{ cls: 'char' }, { cls: 'double' }, { cls: 'char' }] });
  assert.deepEqual(c.classes, [{ cls: 'char', n: 2 }, { cls: 'double', n: 1 }]);
  assert.equal(variableStats(null), null);
  assert.equal(limitStep(0, 10), 0.2);
  assert.equal(limitStep(0, 1000), 20);
  assert.equal(limitStep(-1, 1), 0.05);
  assert.equal(limitStep(3, 3), 0.1);
});

test('outline: sections, main / local / nested functions with lines', () => {
  const script = ['%% Load', 'x = 1;', 'if x, y = x(end); end', '%% Plot it', 'plot(x)', '%%', 'z = helper(2);', 'function r = helper(a)', '  r = a * 2;', 'end'].join('\n');
  assert.deepEqual(outlineOf(script), [
    { kind: 'section', name: 'Load', line: 1, depth: 0 },
    { kind: 'section', name: 'Plot it', line: 4, depth: 0 },
    { kind: 'section', name: '', line: 6, depth: 0 },
    { kind: 'local', name: 'helper', line: 8, depth: 0 },
  ]);
  const fn = ['function [a, b] = main(x)', '  % comment with function word', "  s = 'end of text';", '  a = inner(x);', '  function q = inner(p)', '    q = p(end);', '  end', 'end', 'function out = second(v)', 'out = v;', 'end'].join('\n');
  assert.deepEqual(outlineOf(fn).map((i) => [i.kind, i.name, i.line, i.depth]), [
    ['function', 'main', 1, 0], ['nested', 'inner', 5, 1], ['local', 'second', 9, 0],
  ]);
  // functions without "end"
  const noEnd = ['function a = first(x)', 'if x', '  a = 1;', 'end', 'function b = other()', 'b = 2;'].join('\n');
  assert.deepEqual(outlineOf(noEnd).map((i) => [i.kind, i.name, i.line]), [['function', 'first', 1], ['local', 'other', 5]]);
  const cls = ['classdef (Sealed) Point < handle', '  properties', '    X = 0', '  end', '  methods', '    function obj = Point(x)', '      obj.X = x;', '    end', '    function d = get.Dist(obj)', '      d = abs(obj.X);', '    end', '  end', 'end'].join('\n');
  assert.deepEqual(outlineOf(cls).map((i) => [i.kind, i.name, i.line, i.depth]), [
    ['classdef', 'Point', 1, 0], ['block', 'properties', 2, 1], ['block', 'methods', 5, 1], ['method', 'Point', 6, 2], ['method', 'get.Dist', 9, 2],
  ]);
  assert.equal(functionName('function name'), 'name');
  assert.equal(functionName('function y = f(x)'), 'f');
  assert.equal(functionName('function [a,b]=g'), 'g');
  assert.equal(stripLine("x = 'a % b'; % c"), "x = ''; ");
  assert.equal(stripLine("y = a';"), "y = a';");
  assert.deepEqual(outlineOf(''), []);
  assert.deepEqual(outlineOf('m = methods(obj);\nx = 1;').length, 0);
});

test('help search: names first, then help text; one line each', () => {
  const s = createSession({ fs: createMemoryFs({}), print: () => {}, onEvent: () => {} });
  const r = s.helpSearch('plot', 500);
  assert.ok(r.length > 3);
  assert.equal(r[0].name, 'plot');
  const names = r.map((x) => x.name);
  assert.ok(names.indexOf('plot3') > 0 && names.indexOf('plot3') < names.length);
  for (const x of r) { assert.ok(!x.en.includes('\n')); assert.equal(typeof x.ko, 'string'); }
  assert.ok(s.helpSearch('zzzz-no-such').length === 0);
  assert.ok(s.helpSearch('', 10).length === 10);
});

test('기본값으로 and swaps clear folds and weights even though settings are deep-merged', () => {
  let s = merge(DEFAULTS, {});
  s = apply(s, sidePatch(s, 'editor', 'right', (st) => ({ fold: { ...st.fold, docprops: true }, ratio: { debug: 0.9 } })));
  assert.equal(sideState(s, 'editor', 'right').fold.docprops, true);
  s = apply(s, resetPatch('editor'));
  const r = sideState(s, 'editor', 'right');
  assert.equal(r.fold.docprops, false);
  assert.equal(r.ratio.debug, PANEL_SETS.editor.ratio.right.debug);
  s = apply(s, sidePatch(s, 'editor', 'right', { fold: {} }));
  assert.equal(sideState(s, 'editor', 'right').fold.docprops, false);
});

test('editor hover help: names under the pointer, definitions in the file, engine help for builtins', async () => {
  const { nameAt, localDefinition } = await import('../src/lib/hoverHelp.js');
  assert.deepEqual(nameAt('y = sin(x) + pi;', 5), { from: 4, to: 7, name: 'sin' });
  assert.equal(nameAt('s.pi = 3;', 3), null, 'struct fields are not looked up');
  assert.equal(nameAt('x = 12;', 5), null);
  const src = [
    'g = 9.81;   % 중력 가속도 [m/s^2]',
    '% 공기 밀도',
    'rho = 1.225;',
    'y = drop(2);',
    'function h = drop(t)',
    '% DROP  자유 낙하 거리',
    '  h = 0.5 * g * t.^2;',
    'end',
  ].join('\n');
  assert.deepEqual(localDefinition(src, 'g'), { kind: 'constant', line: 1, syntax: ['g = 9.81'], text: '중력 가속도 [m/s^2]' });
  assert.deepEqual(localDefinition(src, 'rho'), { kind: 'constant', line: 3, syntax: ['rho = 1.225'], text: '공기 밀도' });
  assert.deepEqual(localDefinition(src, 'drop'), { kind: 'function', line: 5, syntax: ['h = drop(t)'], text: 'DROP  자유 낙하 거리' });
  assert.equal(localDefinition(src, 'sin'), null);
  const s = createSession();
  for (const n of ['sin', 'plot', 'pi', 'eps']) assert.ok(s.help(n) && s.help(n).ko, `engine help for ${n}`);
});

test('engine check (문제점) and catalog (도움말): syntax errors, undefined names, unused values, outputs', () => {
  const s = createSession();
  const src = [
    'g = 9.81;',
    'y = drop(2) + zz;',
    'plot(1:3, sin(y) * pi);',
    'f = @(t) t.^2 + g;',
    'function [h, v] = drop(t)',
    '  tmp = 3;',
    '  h = 0.5 * g * t.^2;',
    'end',
  ].join('\n');
  const got = s.check(src).map((p) => `${p.severity}:${p.code}:${p.name}:${p.line}:${p.col}`);
  assert.deepEqual(got, ['warning:undefined:zz:2:15', 'warning:outputNotSet:v:5:14', 'info:unused:tmp:6:3', 'warning:undefined:g:7:13']);
  const bad = s.check('x = (1 + ;');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].severity, 'error');
  assert.equal(bad[0].code, 'parse');
  assert.equal(bad[0].line, 1);
  assert.deepEqual(s.check('function a\nend\nfunction a\nend').map((p) => p.code), ['duplicateFunction']);
  assert.deepEqual(s.check('function r = outer(x)\n  k = 2;\n  r = inner(x);\n  function y = inner(z)\n    y = z * k;\n  end\nend'), [], 'nested functions share variables');
  s.evaluate('wsVar = 5;');
  assert.deepEqual(s.check('disp(wsVar)'), [], 'scripts see the workspace');
  const cat = s.catalog();
  assert.ok(cat.length > 1000);
  assert.ok(!cat.some((c) => c.name.startsWith('__')));
  assert.equal(cat.find((c) => c.name === 'pi').kind, 'constant');
  const sin = cat.find((c) => c.name === 'sin');
  assert.equal(sin.kind, 'function');
  assert.ok(sin.ko && sin.en && sin.area);
});
