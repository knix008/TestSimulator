// Language: indexing and indexed assignment for every value kind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session(files = {}) {
  const out = [];
  const s = createSessionWith(null, { fs: createMemoryFs(files), print: (t, st) => out.push([st, t]) });
  return {
    s, out,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw Object.assign(new Error(r.error.message), { id: r.error.identifier }); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { return js(s.getVariable(name)); },
    raw(name) { return s.getVariable(name); },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return v.dims[0] <= 1 ? String.fromCharCode(...v.re) : v;
  if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
  if (v.re) {
    const vals = Array.from(v.re, (x, i) => (v.im && v.im[i] ? [x, v.im[i]] : x));
    if (vals.length === 1 && v.dims.length === 2 && v.dims[0] === 1) return vals[0];
    const [m, n] = v.dims;
    if (v.dims.length > 2) return vals;
    if (m === 1 || n === 1) return vals;
    return Array.from({ length: m }, (_, i) => Array.from({ length: n }, (_, j) => vals[i + j * m]));
  }
  if (v.cls === 'cell') return v.data.map(js);
  if (v.cls === 'struct' && v.data.length === 1) return Object.fromEntries(v.fields.map((f) => [f, js(v.data[0][f])]));
  if (v.cls === 'struct') return v.data.map((r) => Object.fromEntries(v.fields.map((f) => [f, js(r[f])])));
  return v;
}

test('linear and subscript indexing of matrices', () => {
  const h = session();
  h.run('A = [1 2 3; 4 5 6; 7 8 9]; a = A(2, 3); b = A(5); c = A(:, 2); d = A(2, :); e = A([1 3], [1 3]); f = A(:)\'; g = A(end, :); k = A(:, [1 0 1] == 1);');
  assert.equal(h.v('a'), 6);
  assert.equal(h.v('b'), 5);
  assert.deepEqual(h.v('c'), [2, 5, 8]);
  assert.deepEqual(h.raw('c').dims, [3, 1]);
  assert.deepEqual(h.v('d'), [4, 5, 6]);
  assert.deepEqual(h.v('e'), [[1, 3], [7, 9]]);
  assert.deepEqual(h.v('f'), [1, 4, 7, 2, 5, 8, 3, 6, 9]);
  assert.deepEqual(h.v('g'), [7, 8, 9]);
  assert.deepEqual(h.v('k'), [[1, 3], [4, 6], [7, 9]]);
});

test('result shape of linear indexing follows the source vector or the index', () => {
  const h = session();
  h.run('r = 1:5; c = (1:5)\'; a = r([1; 2]); b = c([1 2]);');
  assert.deepEqual(h.raw('a').dims, [1, 2]);
  assert.deepEqual(h.raw('b').dims, [2, 1]);
});

test('logical masks select elements', () => {
  const h = session();
  h.run('x = [5 -1 3 -7]; p = x(x > 0); x(x < 0) = 0; M = [1 2; 3 4]; m = M(M > 1);');
  assert.deepEqual(h.v('p'), [5, 3]);
  assert.deepEqual(h.v('x'), [5, 0, 3, 0]);
  assert.deepEqual(h.v('m'), [3, 2, 4]);
  assert.deepEqual(h.raw('m').dims, [3, 1]);
});

test('index errors report bounds and bad subscripts', () => {
  const h = session();
  h.run('x = [1 2 3];');
  assert.match(h.fail('x(4)').message, /must not exceed 3/);
  assert.match(h.fail('x(0)').message, /positive integers/);
  assert.match(h.fail('x(1.5)').message, /positive integers/);
});

test('assignment grows arrays with zero fill', () => {
  const h = session();
  h.run('x = []; x(3) = 5; y = 1; y(2, 3) = 7; z = [1 2]; z(end+1) = 3; c = (1:2)\'; c(4) = 9;');
  assert.deepEqual(h.v('x'), [0, 0, 5]);
  assert.deepEqual(h.v('y'), [[1, 0, 0], [0, 0, 7]]);
  assert.deepEqual(h.v('z'), [1, 2, 3]);
  assert.deepEqual(h.v('c'), [1, 2, 0, 9]);
  assert.deepEqual(h.raw('c').dims, [4, 1]);
  h.run('n(2).a = 1;');
  assert.deepEqual(h.raw('n').dims, [1, 2]);
  assert.match(h.fail('M = [1 2; 3 4]; M(7) = 1;').message, /ambiguous/);
});

test('deletion with empty brackets', () => {
  const h = session();
  h.run('x = 1:5; x([2 4]) = []; M = [1 2 3; 4 5 6]; M(:, 2) = []; N = [1 2; 3 4]; N(1, :) = []; c = {1, 2, 3}; c(2) = []; s = "abc"; t = [1 2 3; 4 5 6]; t(2) = [];');
  assert.deepEqual(h.v('x'), [1, 3, 5]);
  assert.deepEqual(h.v('M'), [[1, 3], [4, 6]]);
  assert.deepEqual(h.v('N'), [3, 4]);
  assert.deepEqual(h.v('c'), [1, 3]);
  assert.deepEqual(h.v('t'), [1, 2, 5, 3, 6]);
  assert.match(h.fail('t2 = [1 2; 3 4]; t2(1, 1) = [];').message, /only one non-colon/);
});

test('cells: brace lists, auto creation and nested cells', () => {
  const h = session();
  h.run("c = {1, 'two', [3 4]}; a = c(2); b = c{2}; c{5} = 'five'; d = c{3}(2); c{3}(1) = 30; e = c{3};");
  assert.equal(h.raw('a').cls, 'cell');
  assert.equal(h.v('b'), 'two');
  assert.deepEqual(h.raw('c').dims, [1, 5]);
  assert.deepEqual(h.raw('c').data[3].dims, [0, 0]);
  assert.equal(h.v('d'), 4);
  assert.deepEqual(h.v('e'), [30, 4]);
  h.run('q{2, 2} = 1; n = {}; n{end+1} = 7; n{end+1} = 8; nested{2}{3} = 9;');
  assert.deepEqual(h.raw('q').dims, [2, 2]);
  assert.deepEqual(h.v('n'), [7, 8]);
  assert.equal(h.raw('nested').data[1].data[2].re[0], 9);
  assert.match(h.fail('x = 5; x{2} = 1;').message, /brace indexing/);
  assert.match(h.fail('cc = {1}; cc(2) = 5;').message, /Conversion to cell/);
});

test('comma-separated lists expand into calls, matrices and cells', () => {
  const h = session();
  h.run("c = {1, 2, 3}; m = [c{:}]; d = {c{:}, 4}; s(1).v = 10; s(2).v = 20; w = [s.v]; [a, b] = c{1:2};");
  assert.deepEqual(h.v('m'), [1, 2, 3]);
  assert.deepEqual(h.v('d'), [1, 2, 3, 4]);
  assert.deepEqual(h.v('w'), [10, 20]);
  assert.equal(h.v('a'), 1);
  assert.equal(h.v('b'), 2);
  h.run('[c{1:3}] = deal(0); [s.v] = deal(7, 8);');
  assert.deepEqual(h.v('c'), [0, 0, 0]);
  assert.deepEqual(h.v('w'), [10, 20]);
  h.run('w2 = [s.v];');
  assert.deepEqual(h.v('w2'), [7, 8]);
});

test('structs: fields, nested auto-creation and dynamic names', () => {
  const h = session();
  h.run("s.a = 1; s.b.c = 'x'; s.b.d(3) = 5; f = 'dyn'; s.(f) = 42; u.list{2}.val = 3; v = u.list{2}.val;");
  assert.deepEqual(h.v('s'), { a: 1, b: { c: 'x', d: [0, 0, 5] }, dyn: 42 });
  assert.equal(h.v('v'), 3);
});

test('struct arrays and field errors', () => {
  const h = session();
  h.run("t(3).name = 'third'; t(2).name = 2; n = t(2).name; p = t(1:2); first = t(1);");
  assert.equal(h.v('n'), 2);
  assert.deepEqual(h.raw('p').dims, [1, 2]);
  assert.deepEqual(h.raw('first').dims, [1, 1]);
  assert.match(h.fail('t.name = 1;').message, /Scalar structure required/);
  h.run('r.x = 1;');
  assert.match(h.fail('r.y').message, /Unrecognized field name "y"/);
  assert.match(h.fail('k = 5; k.f = 1;').message, /dot indexing/);
  assert.match(h.fail('k = 5; k.f').message, /Dot indexing/);
});

test('value semantics: aliases never see in-place updates', () => {
  const h = session();
  h.run('a = []; for i = 1:5, a(i) = i; end; b = a; a(2) = 100; c = {1, 2}; d = c; c{1} = 9; s.x = [1 2]; t = s; s.x(1) = 7; n.inner.v = 1; m = n; n.inner.v = 2; p = a; p(end+1) = 6;');
  assert.deepEqual(h.v('a'), [1, 100, 3, 4, 5]);
  assert.deepEqual(h.v('b'), [1, 2, 3, 4, 5]);
  assert.deepEqual(h.v('d'), [1, 2]);
  assert.deepEqual(h.v('c'), [9, 2]);
  assert.deepEqual(h.v('t'), { x: [1, 2] });
  assert.deepEqual(h.v('s'), { x: [7, 2] });
  assert.deepEqual(h.v('m'), { inner: { v: 1 } });
  assert.deepEqual(h.v('p'), [1, 100, 3, 4, 5, 6]);
  // elements taken out of a container stay independent
  h.run('c2 = {[1 2 3]}; x = c2{1}; c2{1}(2) = 0; y = c2{1};');
  assert.deepEqual(h.v('x'), [1, 2, 3]);
  assert.deepEqual(h.v('y'), [1, 0, 3]);
  h.run('s2(2).f = [1 1]; r = s2(2); s2(2).f(1) = 5; g = r.f;');
  assert.deepEqual(h.v('g'), [1, 1]);
  h.run('q.a = [1 2]; w = q; q.a(1) = 9; z = w.a; q2 = q; q.b = 1;');
  assert.deepEqual(h.v('z'), [1, 2]);
  assert.deepEqual(Object.keys(h.v('q2')), ['a']);
});

test('class conversion in assignment follows integer and char rules', () => {
  const h = session();
  h.run("a = [1 2 3]; a(2) = 0x05s8; b = [0x01s8 0x02s8]; b(2) = 300; c = 'abc'; c(2) = 'X'; l = [1 0] == 1; l(2) = 2; s = \"a\"; s(3) = \"c\"; z = [1 2]; z(2) = 1i;");
  assert.equal(h.raw('a').cls, 'int8');
  assert.deepEqual(h.v('b'), [1, 127]);
  assert.equal(h.v('c'), 'aXc');
  assert.equal(h.raw('l').cls, 'double');
  assert.deepEqual(h.raw('s').data, ['a', null, 'c']);
  assert.deepEqual(h.v('z'), [1, [0, 1]]);
});

test('string arrays: paren and brace indexing', () => {
  const h = session();
  h.run('s = ["ab", "cd", "ef"]; a = s(2); b = s{3}; s(2) = "XY"; s{1} = \'zz\'; t = s([1 3]);');
  assert.equal(h.v('a'), 'cd');
  assert.equal(h.v('b'), 'ef');
  assert.equal(h.raw('b').cls, 'char');
  assert.deepEqual(h.raw('s').data, ['zz', 'XY', 'ef']);
  assert.deepEqual(h.raw('t').data, ['zz', 'ef']);
});

test('N-dimensional indexing and growth', () => {
  const h = session();
  h.run('A(2, 2, 2) = 8; s = A(:, :, 2); v = A(2, 2, 2); A(:, :, 3) = [1 2; 3 4]; w = A(1, 2, 3); n = A(8);');
  assert.deepEqual(h.raw('A').dims, [2, 2, 3]);
  assert.deepEqual(h.v('s'), [[0, 0], [0, 8]]);
  assert.equal(h.v('v'), 8);
  assert.equal(h.v('w'), 2);
  assert.equal(h.v('n'), 8);
});

test('colon assignment keeps the shape', () => {
  const h = session();
  h.run('M = [1 2; 3 4]; M(:) = 10:13; N = [1 2; 3 4]; N(:, 1) = [7; 8]; P = [1 2; 3 4]; P(2, :) = 0; Q(:, 1) = [1; 2; 3];');
  assert.deepEqual(h.v('M'), [[10, 12], [11, 13]]);
  assert.deepEqual(h.v('N'), [[7, 2], [8, 4]]);
  assert.deepEqual(h.v('P'), [[1, 2], [0, 0]]);
  assert.deepEqual(h.raw('Q').dims, [3, 1]);
  assert.match(h.fail('M(1:2, 1) = [1 2 3];').message, /size of the left side|different number/);
});

test('function handles are called with parentheses', () => {
  const h = session();
  h.run('f = @(x) x * 2; a = f(4); g = {f}; b = g{1}(5); s.h = f; c = s.h(6);');
  assert.equal(h.v('a'), 8);
  assert.equal(h.v('b'), 10);
  assert.equal(h.v('c'), 12);
});

test('sparse matrices index through a dense view', () => {
  const h = session();
  const S = { cls: 'double', sparse: true, dims: [2, 2], colPtr: Int32Array.from([0, 1, 2]), rowIdx: Int32Array.from([0, 1]), re: Float64Array.from([5, 6]), im: null };
  h.s.setVariable('S', S);
  h.run('a = S(2, 2); S(1, 2) = 3; b = S(1, 2);');
  assert.equal(h.v('a'), 6);
  assert.equal(h.v('b'), 3);
  assert.equal(h.raw('S').sparse, true);
});
