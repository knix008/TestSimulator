// The graphical editor's model and M code generator (src/flow/flow.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFlow, makeNode, connect, generateCode, parseSyntax, applySyntax, parseFlow, serializeFlow, removeItems, pruneLinks, topoOrder, isVarName } from '../src/flow/flow.js';
import { createSession } from '../core/session.js';

const add = (f, n) => ({ ...f, nodes: [...f.nodes, n] });

test('flow: help syntax lines become ports', () => {
  assert.deepEqual(parseSyntax('Y = sin(X)'), { fn: 'sin', outputs: ['Y'], inputs: [{ label: 'X', value: '' }] });
  assert.deepEqual(parseSyntax('[F, E] = log2(X)').outputs, ['F', 'E']);
  assert.deepEqual(parseSyntax('plot(X, Y)'), { fn: 'plot', outputs: [], inputs: [{ label: 'X', value: '' }, { label: 'Y', value: '' }] });
  assert.deepEqual(parseSyntax("v = intmax('int8')").inputs, [{ label: 'arg1', value: "'int8'" }]);
  assert.deepEqual(parseSyntax('X = zeros(m, n, ...)').inputs.map((p) => p.label), ['m', 'n']);
  assert.deepEqual(parseSyntax('p = pi'), { fn: 'pi', outputs: ['p'], inputs: [] });
  assert.ok(isVarName('x1') && !isVarName('1x') && !isVarName('end'));
});

test('flow: constants, an operator, functions and a display make runnable M code in data order', () => {
  let f = emptyFlow();
  const t = makeNode(f, 'func', 0, 0, { fn: 'linspace', syntax: 'y = linspace(x1, x2, n)' }); f = add(f, t);
  const a = makeNode(f, 'const', 0, 200, { name: 'amp', value: '2' }); f = add(f, a);
  const s = makeNode(f, 'func', 200, 0, { fn: 'sin', syntax: 'Y = sin(X)' }); f = add(f, s);
  const m = makeNode(f, 'op', 400, 0, { op: '.*' }); f = add(f, m);
  const p = makeNode(f, 'func', 600, 0, { fn: 'plot', syntax: 'plot(X, Y)' }); f = add(f, p);
  const d = makeNode(f, 'disp', 600, 200); f = add(f, d);
  f.nodes = f.nodes.map((n) => (n.id === t.id ? { ...n, inputs: [{ label: 'x1', value: '0' }, { label: 'x2', value: '2*pi' }, { label: 'n', value: '50' }] } : n));
  f = connect(f, { node: t.id, port: 0 }, { node: s.id, port: 0 });
  f = connect(f, { node: s.id, port: 0 }, { node: m.id, port: 0 });
  f = connect(f, { node: a.id, port: 0 }, { node: m.id, port: 1 });
  f = connect(f, { node: t.id, port: 0 }, { node: p.id, port: 0 });
  f = connect(f, { node: m.id, port: 0 }, { node: p.id, port: 1 });
  f = connect(f, { node: m.id, port: 0 }, { node: d.id, port: 0 });
  const { code, problems } = generateCode(f);
  assert.deepEqual(problems, []);
  assert.equal(code, [
    'y1 = linspace(0, 2*pi, 50);',
    'Y1 = sin(y1);',
    'amp = 2;',
    'r1 = Y1 .* amp;',
    'plot(y1, r1);',
    'disp(r1);',
    '',
  ].join('\n'));
  const sess = createSession();
  const res = sess.evaluate(code.replace('plot(y1, r1);\n', ''));
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(sess.check(code).filter((x) => x.severity !== 'info').length, 0, 'the generated code passes the checker');
});

test('flow: connections replace, refuse loops, follow removed ports; problems are reported', () => {
  let f = emptyFlow();
  const a = makeNode(f, 'const', 0, 0, { name: 'a', value: '1' }); f = add(f, a);
  const b = makeNode(f, 'const', 0, 100, { name: 'b', value: '2' }); f = add(f, b);
  const o = makeNode(f, 'op', 200, 0); f = add(f, o);
  const o2 = makeNode(f, 'op', 400, 0); f = add(f, o2);
  f = connect(f, { node: a.id, port: 0 }, { node: o.id, port: 0 });
  f = connect(f, { node: b.id, port: 0 }, { node: o.id, port: 0 });
  assert.equal(f.links.length, 1, 'an input keeps only the newest link');
  assert.equal(f.links[0].from.node, b.id);
  f = connect(f, { node: o.id, port: 0 }, { node: o2.id, port: 0 });
  const before = f.links.length;
  f = connect(f, { node: o2.id, port: 0 }, { node: o.id, port: 1 });
  assert.equal(f.links.length, before, 'a loop is refused');
  assert.deepEqual(topoOrder(f).cyclic, []);
  const g = generateCode(f);
  assert.deepEqual(g.problems.map((p) => p.code).sort(), ['missingInput', 'missingInput']);
  f.nodes = f.nodes.map((n) => (n.id === b.id ? { ...n, name: 'a' } : n));
  assert.ok(generateCode(f).problems.some((p) => p.code === 'dupName'));
  f = removeItems(f, [a.id]);
  assert.ok(!f.links.some((l) => l.from.node === a.id));
  // a function that loses an input drops that link
  let h = emptyFlow();
  const x = makeNode(h, 'const', 0, 0, { name: 'x', value: '3' }); h = add(h, x);
  const fn = makeNode(h, 'func', 200, 0, { fn: 'zeros', syntax: 'X = zeros(m, n)' }); h = add(h, fn);
  h = connect(h, { node: x.id, port: 0 }, { node: fn.id, port: 1 });
  h.nodes = h.nodes.map((n) => (n.id === fn.id ? applySyntax(h, n, 'X = zeros(n)') : n));
  h = pruneLinks(h);
  assert.equal(h.links.length, 0);
  assert.equal(h.nodes[1].names[0], 'X1', 'the output name is kept');
});

test('flow: formulas substitute their inputs once; files round-trip', () => {
  let f = emptyFlow();
  const a = makeNode(f, 'const', 0, 0, { name: 'b', value: '1' }); f = add(f, a);
  const c = makeNode(f, 'const', 0, 100, { name: 'k', value: '5' }); f = add(f, c);
  const e = makeNode(f, 'expr', 200, 0, { expr: 'a + 2*b' }); f = add(f, e);
  f = connect(f, { node: a.id, port: 0 }, { node: e.id, port: 0 });
  f = connect(f, { node: c.id, port: 0 }, { node: e.id, port: 1 });
  const { code, problems } = generateCode(f, { title: 'test' });
  assert.deepEqual(problems, []);
  assert.equal(code.split('\n')[3], 'r1 = b + 2*k;');
  const back = parseFlow(serializeFlow(f));
  assert.deepEqual(back.nodes, f.nodes);
  assert.deepEqual(back.links, f.links);
  assert.throws(() => parseFlow('{"x":1}'));
});
