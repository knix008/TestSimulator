// Language: lexer and parser edge cases (whitespace in matrices, quote vs
// transpose, command syntax, comments, continuation, numbers, functions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lex } from '../core/lang/lexer.js';
import { parse, parseExpr } from '../core/lang/parser.js';
import { unparse } from '../core/lang/unparse.js';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session(files = {}) {
  const out = [];
  const s = createSessionWith(null, { fs: createMemoryFs(files), print: (t, st) => out.push([st, t]) });
  return {
    s, out,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(r.error.message); return r; },
    v(name) { return js(s.getVariable(name)); },
    text() { return out.filter((o) => o[0] === 'out').map((o) => o[1]).join(''); },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return v.dims[0] <= 1 ? String.fromCharCode(...v.re) : v;
  if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
  if (v.re) {
    const vals = Array.from(v.re, (x, i) => (v.im && v.im[i] ? [x, v.im[i]] : x));
    if (vals.length === 1) return vals[0];
    const [m, n] = v.dims;
    if (m === 1 || n === 1) return vals;
    return Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => vals[i + j * m]));
  }
  if (v.cls === 'cell') return v.data.map(js);
  if (v.cls === 'struct' && v.data.length === 1) return Object.fromEntries(v.fields.map((f) => [f, js(v.data[0][f])]));
  return v;
}

const types = (src) => lex(src).filter((t) => t.type !== 'nl' && t.type !== 'eof').map((t) => `${t.type}:${t.value}`);

test('quote after a value is a transpose, otherwise a char vector', () => {
  assert.deepEqual(types("a'"), ['id:a', "op:'"]);
  assert.deepEqual(types("x = 'it''s'"), ['id:x', 'op:=', "str:it's"]);
  assert.deepEqual(types("[a' b']"), ['op:[', 'id:a', "op:'", 'id:b', "op:'", 'op:]']);
  assert.deepEqual(types("[a 'b']"), ['op:[', 'id:a', 'str:b', 'op:]']);
  assert.deepEqual(types("a.'"), ['id:a', "op:.'"]);
  assert.deepEqual(types('x(1)\''), ['id:x', 'op:(', 'num:1', 'op:)', "op:'"]);
});

test('numbers: decimals, exponents, hex, binary, imaginary', () => {
  const nums = (src) => lex(src).filter((t) => t.type === 'num').map((t) => [t.value, t.imag, t.cls]);
  assert.deepEqual(nums('1e3 .5 2.5E-2 3.'), [[1000, false, 'double'], [0.5, false, 'double'], [0.025, false, 'double'], [3, false, 'double']]);
  assert.deepEqual(nums('0x1F 0b101 0xFFu16'), [[31, false, 'uint8'], [5, false, 'uint8'], [255, false, 'uint16']]);
  assert.deepEqual(nums('2i 3j 1.5e1i'), [[2, true, 'double'], [3, true, 'double'], [15, true, 'double']]);
  // 1./x keeps the operator
  assert.deepEqual(types('1./x'), ['num:1', 'op:./', 'id:x']);
});

test('command syntax is detected only at statement start', () => {
  const t = lex('hold on\nformat long g\nx = 1; disp hello world');
  const cmds = t.filter((x) => x.type === 'cmd').map((x) => [x.value, x.args]);
  assert.deepEqual(cmds, [['hold', ['on']], ['format', ['long', 'g']], ['disp', ['hello', 'world']]]);
  // a - b is an expression, a -b is a command, a(1) and a = 1 are not commands
  assert.equal(lex('a - b').some((x) => x.type === 'cmd'), false);
  assert.equal(lex('a -b').some((x) => x.type === 'cmd'), true);
  assert.equal(lex('a (1)').some((x) => x.type === 'cmd'), false);
  assert.equal(lex('a = 1').some((x) => x.type === 'cmd'), false);
  // quoted arguments keep spaces
  assert.deepEqual(lex("disp 'a b' c").find((x) => x.type === 'cmd').args, ['a b', 'c']);
  // known variables are never commands
  assert.equal(lex('x -1', { isVar: (n) => n === 'x' }).some((t2) => t2.type === 'cmd'), false);
});

test('comments, block comments and continuation lines', () => {
  const src = 'a = 1; % comment\n%{\nnot code ( [\n%}\nb = [1, ... continued\n 2];\n';
  const p = parse(src);
  assert.equal(p.body.length, 2);
  assert.equal(p.body[1].rhs.rows[0].length, 2);
});

test('whitespace separates matrix elements', () => {
  const h = session();
  h.run("a = [1 -2]; b = [1 - 2]; c = [1 , 2\n 3 4]; d = [1 -2 + 3]; x = 2; e = [x' x']; f = [x (1)];");
  assert.deepEqual(h.v('a'), [1, -2]);
  assert.equal(h.v('b'), -1);
  assert.deepEqual(h.v('c'), [[1, 2], [3, 4]]);
  assert.deepEqual(h.v('d'), [1, 1]);
  assert.deepEqual(h.v('e'), [2, 2]);
  assert.deepEqual(h.v('f'), [2, 1]);
});

test('operator precedence and associativity', () => {
  const h = session();
  h.run('a = -2^2; b = 2^-1; c = 2^3^2; d = ~0 == 1; e = 1:3 + 1; f = 2*3^2; g = -2^-2; k = 1 - - 1; m = 3 > 2 > 1');
  assert.equal(h.v('a'), -4);
  assert.equal(h.v('b'), 0.5);
  assert.equal(h.v('c'), 64);
  assert.equal(h.v('d'), 1);
  assert.deepEqual(h.v('e'), [1, 2, 3, 4]);
  assert.equal(h.v('f'), 18);
  assert.equal(h.v('g'), -0.25);
  assert.equal(h.v('k'), 2);
  assert.equal(h.v('m'), 0);
});

test('short-circuit operators and elementwise logic', () => {
  const h = session();
  h.run('a = 0 && error(\'x\'); b = 1 || error(\'y\'); c = [1 0 1] & [1 1 0]; d = [0 0 1] | 0; e = ~[1 0];');
  assert.equal(h.v('a'), 0);
  assert.equal(h.v('b'), 1);
  assert.deepEqual(h.v('c'), [1, 0, 0]);
  assert.deepEqual(h.v('d'), [0, 0, 1]);
  assert.deepEqual(h.v('e'), [0, 1]);
  assert.throws(() => h.run('[1 1] && 1'), /logical scalar/);
});

test('strings: char vectors and string scalars', () => {
  const h = session();
  h.run('a = \'abc\'; b = "say ""hi"""; c = [\'ab\' \'cd\']; d = "x" + "y"; e = \'a\':\'e\';');
  assert.equal(h.v('a'), 'abc');
  assert.equal(h.v('b'), 'say "hi"');
  assert.equal(h.v('c'), 'abcd');
  assert.equal(h.v('d'), 'xy');
  assert.equal(h.v('e'), 'abcde');
});

test('end inside indexing, colon and nested index expressions', () => {
  const h = session();
  h.run('x = 10:10:100; a = x(end); b = x(end-1); c = x([1 end]); d = x(end/2); m = [1 2 3; 4 5 6]; e = m(end, end); f = m(end); ');
  const h2 = session({ '/home/endargs.m': 'x = 10:10:100;\ng = x(mn(end, 3));\nfunction r = mn(a, b)\nr = a*(a<b) + b*(a>=b);\nend\n' });
  h2.run('endargs');
  assert.equal(h2.v('g'), 30);
  assert.equal(h.v('a'), 100);
  assert.equal(h.v('b'), 90);
  assert.deepEqual(h.v('c'), [10, 100]);
  assert.equal(h.v('d'), 50);
  assert.equal(h.v('e'), 6);
  assert.equal(h.v('f'), 6);
});

test('parse errors carry a position', () => {
  assert.throws(() => parse('x = (1 + 2'), (e) => e.identifier === 'core:parse');
  assert.throws(() => parse('x = [1 2'), (e) => e.identifier === 'core:parse');
  const h = session();
  const r = h.s.evaluate('y = 3 +');
  assert.equal(r.ok, false);
  assert.equal(r.error.identifier, 'core:parse');
});

test('function files with and without end, local and nested functions', () => {
  const noEnd = parse('function y = f(x)\ny = g(x);\nfunction z = g(x)\nz = 2*x;\n');
  assert.equal(noEnd.kind, 'function');
  assert.deepEqual(noEnd.functions.map((f) => f.name), ['f', 'g']);
  const withEnd = parse('function y = f(x)\n  y = inner(x);\n  function r = inner(t)\n    r = t + 1;\n  end\nend\n');
  assert.equal(withEnd.functions.length, 1);
  assert.equal(withEnd.functions[0].nested[0].name, 'inner');
  const multi = parse('function [a, b, ~] = h(x, ~, varargin)\na = 1; b = 2;\nend');
  assert.deepEqual(multi.functions[0].outs, ['a', 'b', '~']);
  assert.deepEqual(multi.functions[0].params, ['x', '~', 'varargin']);
  const script = parse('x = 1;\ny = sq(x);\nfunction r = sq(t)\nr = t^2;\nend\n');
  assert.equal(script.kind, 'script');
  assert.equal(script.functions[0].name, 'sq');
});

test('arguments blocks parse sizes, classes, validators and defaults', () => {
  const p = parse('function f(x, y, opts)\narguments\n  x (1,1) double {mustBePositive} = 1\n  y char = \'a\'\n  opts.Name (1,:) char = "n"\nend\nend');
  const items = p.functions[0].args[0].items;
  assert.deepEqual(items.map((i) => [i.name, i.field, i.dims, i.cls]), [['x', null, [1, 1], 'double'], ['y', null, null, 'char'], ['opts', 'Name', [1, -1], 'char']]);
  assert.equal(items[0].validators[0].name, 'mustBePositive');
});

test('classdef blocks parse properties, methods, events and enumerations', () => {
  const p = parse(`classdef (Sealed) Point < handle & Base
  properties (Access = private)
    X (1,1) double = 0
    Y = 2
  end
  properties (Constant)
    Origin = [0 0]
  end
  methods
    function obj = Point(x)
      obj.X = x;
    end
    function d = dist(obj)
      d = obj.X;
    end
  end
  methods (Static)
    function p = make()
      p = Point(1);
    end
  end
  events
    Moved
  end
  enumeration
    A, B (2)
  end
end`);
  const cd = p.classdef;
  assert.equal(cd.name, 'Point');
  assert.deepEqual(cd.supers, ['handle', 'Base']);
  assert.deepEqual(cd.props.map((x) => x.name), ['X', 'Y', 'Origin']);
  assert.deepEqual(cd.methods.map((m) => m.name), ['Point', 'dist', 'make']);
  assert.equal(cd.events[0].name, 'Moved');
  assert.deepEqual(cd.enums.map((e) => e.name), ['A', 'B']);
});

test('anonymous functions unparse to compact text', () => {
  assert.equal(unparse(parseExpr('@(x, y) x .^ 2 + y * 3')), '@(x,y)x.^2+y*3');
  assert.equal(unparse(parseExpr('@() disp( [1, 2; 3 4] )')), '@()disp([1,2;3,4])');
  assert.equal(unparse(parseExpr('(a+b)*c')), '(a+b)*c');
});

test('multiple assignment targets and tilde outputs parse', () => {
  const p = parse('[a, ~, c(2), s.f] = deal(1, 2, 3, 4)');
  assert.equal(p.body[0].t, 'massign');
  assert.deepEqual(p.body[0].lhs.map((l) => l.t), ['lv', 'tilde', 'lv', 'lv']);
  const q = parse('[a b] = size(x)');
  assert.equal(q.body[0].lhs.length, 2);
});

test('cell arrays, nested cells and empty brackets', () => {
  const h = session();
  h.run("c = {1, 'two'; [3 4], {5}}; e = {}; z = []; n = c{2, 2};");
  assert.deepEqual(js(h.s.getVariable('c')).length, 4);
  assert.deepEqual(h.s.getVariable('c').dims, [2, 2]);
  assert.deepEqual(h.s.getVariable('e').dims, [0, 0]);
  assert.deepEqual(h.s.getVariable('z').dims, [0, 0]);
  assert.equal(h.s.getVariable('n').cls, 'cell');
});

test('statement separators control printing', () => {
  const h = session();
  h.run('a = 1, b = 2; c = 3');
  const t = h.text();
  assert.match(t, /a = 1/);
  assert.doesNotMatch(t, /b = 2/);
  assert.match(t, /c = 3/);
});

test('keywords as field names and dynamic fields', () => {
  const h = session();
  h.run("s.end = 1; s.('if') = 2; n = 'for'; s.(n) = 3; a = s.end + s.if + s.for;");
  assert.equal(h.v('a'), 6);
});
