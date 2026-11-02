// The last Octave functions: isnull (null literals), subsindex (objects as
// indices), superiorto / inferiorto (class precedence in dispatch),
// profexplore (profiler call tree browser), memory, preferences,
// addproperty (dynamic graphics properties) and the package functions of
// core/compat/pkgfuncs.js (dotted names, called through the generic a.b.c
// call support of the interpreter).
//
// The package prefix and the root function name contain the product word
// that may only appear in core/compat/, so this file builds them from parts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { buildRegistry } from '../core/registry.js';
import * as lang from '../core/lang/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const P = ['mat', 'lab'].join('');            // package prefix
const ROOT = P + 'root';                      // root folder function
const VALID = `${P}.lang.makeValidName`;
const UNIQUE = `${P}.lang.makeUniqueStrings`;
const ENC = `${P}.net.base64encode`;
const DEC = `${P}.net.base64decode`;
const USED_FIELD = 'MemUsed' + P.toUpperCase();

function session(files = {}, opts = {}) {
  const out = [];
  const events = [];
  const fsys = opts.fs || createMemoryFs(files);
  const replies = opts.replies ? opts.replies.slice() : null;
  const requests = [];
  const host = {
    post() {},
    request(m) { requests.push(m); if (m.type === 'input' && replies) return replies.length ? replies.shift() : 'exit'; return null; },
  };
  const s = createSession({ fs: fsys, host, print: (t, st) => out.push([st, t]), onEvent: (e) => events.push(e) });
  return {
    s, out, events, requests, fs: fsys,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw new Error(`${r.error.identifier}: ${r.error.message}`); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { return js(s.getVariable(name)); },
    raw(name) { return s.getVariable(name); },
    text() { return out.filter((o) => o[0] === 'out' || o[0] === 'echo').map((o) => o[1]).join(''); },
    clearOut() { out.length = 0; },
  };
}
function js(v) {
  if (v == null) return v;
  if (v.cls === 'char') return String.fromCharCode(...v.re);
  if (v.cls === 'string') return v.data.length === 1 ? v.data[0] : v.data;
  if (v.re) { const a = Array.from(v.re); return a.length === 1 ? a[0] : a; }
  if (v.cls === 'cell') return v.data.map(js);
  if (v.cls === 'struct' && v.data.length === 1) return Object.fromEntries(v.fields.map((f) => [f, js(v.data[0][f])]));
  return v;
}

// ---------------------------------------------------------------- isnull

test('isnull: true only for a null literal written in the call', () => {
  const h = session();
  h.run('a = isnull([]); b = isnull(\'\'); c = isnull(""); x = []; d = isnull(x); e = isnull(zeros(0, 0)); f = isnull(1); g = isnull([ ]);');
  assert.deepEqual([h.v('a'), h.v('b'), h.v('c'), h.v('d'), h.v('e'), h.v('f'), h.v('g')], [1, 1, 1, 0, 0, 0, 1]);
  assert.equal(h.raw('a').cls, 'logical');
  // through feval / a handle the argument is an evaluated value
  h.run('p = feval(@isnull, []); fh = @isnull; q = fh([]);');
  assert.deepEqual([h.v('p'), h.v('q')], [0, 0]);
  h.run('if isnull([]), r = 1; else, r = 0; end');
  assert.equal(h.v('r'), 1);
  assert.match(h.fail('isnull()').message, /one input/);
});

test('isnull: inside functions, and shadowed by a variable or a user function', () => {
  const h = session({
    '/home/tnull.m': 'function [a, b] = tnull(v)\n  a = isnull([]);\n  b = isnull(v);\nend\n',
    '/home/sub/isnull.m': 'function r = isnull(x)\n  r = 42;\nend\n',
  });
  h.run('[a, b] = tnull([]);');
  assert.deepEqual([h.v('a'), h.v('b')], [1, 0]);
  h.run('isnull = [7 8 9]; v = isnull([]); clear isnull');
  assert.deepEqual(h.raw('v').dims, [0, 0]);
  h.run('addpath(\'/home/sub\'); w = isnull([]); rmpath(\'/home/sub\'); z = isnull([]);');
  assert.equal(h.v('w'), 42);
  assert.equal(h.v('z'), 1);
});

// ---------------------------------------------------------------- subsindex

const IDX = 'classdef Idx\n  properties\n    K = 0\n  end\n  methods\n    function o = Idx(k)\n      o.K = k;\n    end\n    function r = subsindex(o)\n      r = o.K - 1;\n    end\n  end\nend\n';
const NOIDX = 'classdef NoIdx\n  properties\n    K = 1\n  end\nend\n';

test('subsindex: an object used as an index gives its zero-based result + 1', () => {
  const h = session({ '/home/Idx.m': IDX, '/home/NoIdx.m': NOIDX });
  h.run('A = [10 20 30 40]; a = A(Idx(3)); b = A(Idx([1 4])); A(Idx(2)) = 99; c = {5, 6, 7}; d = c{Idx(3)}; M = magic(3); m = M(Idx(2), Idx(3)); s = "xyz"; t = s(Idx(1));');
  assert.equal(h.v('a'), 30);
  assert.deepEqual(h.v('b'), [10, 40]);
  assert.deepEqual(h.v('A'), [10, 99, 30, 40]);
  assert.equal(h.v('d'), 7);
  assert.equal(h.v('m'), 7);
  // x(obj) with x a function handle passes the object to the function unchanged
  h.run('f = @(o) class(o); k = f(Idx(1));');
  assert.equal(h.v('k'), 'Idx');
  assert.match(h.fail('A = 1:3; A(NoIdx())').message, /subsindex/);
});

test('subsindex: the result must be numeric', () => {
  const bad = 'classdef BadIdx\n  methods\n    function r = subsindex(o)\n      r = \'a\';\n    end\n  end\nend\n';
  const h = session({ '/home/BadIdx.m': bad });
  assert.match(h.fail('A = 1:3; A(BadIdx())').message, /zero-based/);
});

// ---------------------------------------------------------------- superiorto / inferiorto

const cls = (name, ctorBody, attrs = '') => `classdef ${attrs}${name}\n  methods\n    function o = ${name}()\n${ctorBody}\n    end\n    function r = plus(a, b)\n      r = '${name}';\n    end\n    function r = combine(a, b)\n      r = '${name}';\n    end\n  end\nend\n`;

test('superiorto / inferiorto: method dispatch with objects of several classes', () => {
  const h = session({
    '/home/Lo.m': cls('Lo', '      o = o;'),
    '/home/Hi.m': cls('Hi', "      superiorto('Lo');"),
    '/home/Mid.m': cls('Mid', "      inferiorto('Hi');"),
    '/home/Plain.m': cls('Plain', '      o = o;'),
  });
  // without precedence the leftmost object wins
  h.run('p = Plain(); l = Lo(); a = combine(p, l); b = combine(l, p); c = p + l; d = l + p;');
  assert.deepEqual([h.v('a'), h.v('b'), h.v('c'), h.v('d')], ['Plain', 'Lo', 'Plain', 'Lo']);
  // Hi declared itself superior to Lo
  h.run('hi = Hi(); e = combine(l, hi); f = combine(hi, l); g = l + hi; k = hi + l;');
  assert.deepEqual([h.v('e'), h.v('f'), h.v('g'), h.v('k')], ['Hi', 'Hi', 'Hi', 'Hi']);
  // Mid declared Hi superior to itself
  h.run('m = Mid(); n1 = combine(m, hi); n2 = m + hi; n3 = combine(m, l);');
  assert.deepEqual([h.v('n1'), h.v('n2'), h.v('n3')], ['Hi', 'Hi', 'Mid']);
  // a cell of names, and the conflicting order is refused
  assert.match(h.fail("superiorto('Lo')").message, /outside a class/);
});

test('superiorto: conflicting declarations and the InferiorClasses attribute', () => {
  const h = session({
    '/home/A1.m': cls('A1', "      superiorto({'B1'});"),
    '/home/B1.m': cls('B1', "      superiorto('A1');"),
    '/home/C1.m': cls('C1', '      o = o;', '(InferiorClasses = {?D1}) '),
    '/home/D1.m': cls('D1', '      o = o;'),
  });
  h.run('a = A1();');
  assert.match(h.fail('b = B1();').message, /Conflicting precedence/);
  h.run('c = C1(); d = D1(); x = combine(d, c); y = d + c;');
  assert.deepEqual([h.v('x'), h.v('y')], ['C1', 'C1']);
});

// ---------------------------------------------------------------- profiler call tree and profexplore

const PROF_FILES = {
  '/home/pa.m': 'function pa()\n  pb(); pb();\n  pc();\nend\n',
  '/home/pb.m': 'function pb()\n  pc();\nend\n',
  '/home/pc.m': 'function pc()\n  x = 0; for i = 1:200, x = x + i; end\nend\n',
};

test('profile info: Hierarchical holds the call tree', () => {
  const h = session(PROF_FILES);
  h.run("profile on; pa(); profile off; p = profile('info'); T = p.FunctionTable; H = p.Hierarchical;");
  const p = h.raw('p');
  assert.deepEqual(p.fields, ['FunctionTable', 'Hierarchical']);
  const H = h.raw('H');
  assert.deepEqual(H.fields, ['Index', 'SelfTime', 'TotalTime', 'NumCalls', 'Children']);
  assert.equal(H.data.length, 1);
  const names = h.raw('T').data.map((r) => js(r.FunctionName));
  const top = H.data[0];
  assert.equal(names[js(top.Index) - 1], 'pa');
  assert.equal(js(top.NumCalls), 1);
  const kids = top.Children.data.map((r) => [names[js(r.Index) - 1], js(r.NumCalls)]);
  assert.deepEqual(kids.sort(), [['pb', 2], ['pc', 1]]);
  const pb = top.Children.data.find((r) => names[js(r.Index) - 1] === 'pb');
  assert.deepEqual(pb.Children.data.map((r) => [names[js(r.Index) - 1], js(r.NumCalls)]), [['pc', 2]]);
  assert.ok(js(top.TotalTime) >= js(top.SelfTime));
  h.run("profile clear; q = profile('info');");
  assert.equal(h.raw('q').data[0].Hierarchical.data.length, 0);
});

test('profexplore: numbers go down, up [N] goes up, help, exit / quit', () => {
  const h = session(PROF_FILES, { replies: ['1', 'help', '1', 'up', '2', 'up 5', 'up', 'up', 'abc', '7', 'quit'] });
  h.run('profile on; pa(); profile off; profexplore');
  const t = h.text();
  assert.match(t, /^\nTop\n {2}1\) pa\n {4}1 calls, [\d.]+ total, [\d.]+ self\n/);
  assert.match(t, /profexplore> 1\n/);
  assert.match(t, /Top\n {2}pa\n {4}1\) pb\n {6}2 calls/);
  assert.match(t, /Commands for profile explorer:/);
  assert.match(t, /up \[N\] Go up N levels/);
  assert.match(t, /Top\n {2}pa\n {4}pb\n {6}1\) pc\n {8}2 calls/);
  assert.match(t, /Top\n {2}pa\n {4}pc\n/); // option 2 after going up
  assert.match(t, /Already at the top level\./);
  assert.match(t, /Unknown command "abc"/);
  assert.match(t, /The chosen option is out of range!/);
  assert.equal(h.requests.filter((r) => r.type === 'input').length, 11);
  assert.ok(h.requests.every((r) => r.prompt === 'profexplore> ' && r.text === true));
});

test('profexplore(data) uses the given data; bad data and no Command Window fail', () => {
  const h = session(PROF_FILES, { replies: ['exit'] });
  h.run("profile on; pa(); profile off; d = profile('info'); profile clear; profexplore(d)");
  assert.match(h.text(), /1\) pa/);
  assert.match(h.fail('profexplore(1)').message, /FunctionTable and Hierarchical/);
  const g = session(PROF_FILES);
  assert.match(g.fail('profile on; pa(); profile off; profexplore').message, /not available/);
});

// ---------------------------------------------------------------- memory, preferences

test('memory: [userdata, systemdata] structs and the printed table', () => {
  const h = session();
  h.run('[u, s] = memory();');
  const u = h.raw('u'), s = h.raw('s');
  assert.deepEqual(u.fields, ['MaxPossibleArrayBytes', 'MemAvailableAllArrays', 'ram_available_all_arrays', USED_FIELD, 'mem_used_octave', 'ram_used_octave']);
  assert.deepEqual(s.fields, ['PhysicalMemory', 'SystemMemory', 'VirtualAddressSpace']);
  for (const k of ['PhysicalMemory', 'SystemMemory', 'VirtualAddressSpace']) assert.deepEqual(s.data[0][k].fields, ['Available', 'Total']);
  // Node reports the resident size of the process
  assert.ok(js(u.data[0].ram_used_octave) > 0);
  assert.equal(js(s.data[0].VirtualAddressSpace.data[0].Total), 2 ** 48);
  for (const k of u.fields) assert.equal(u.data[0][k].cls, 'double');
  h.clearOut();
  h.run('memory');
  assert.match(h.text(), /System {4}RAM: .*swap:/);
  assert.match(h.text(), /Available RAM: .*total:/);
  assert.match(h.fail('memory(1)').message, /no input/);
});

test('preferences posts the showPreferences event', () => {
  const h = session();
  h.run('preferences');
  assert.deepEqual(h.events.filter((e) => e.type === 'showPreferences'), [{ type: 'showPreferences' }]);
  assert.match(h.fail('preferences(1)').message, /no input/);
});

// ---------------------------------------------------------------- addproperty

test('addproperty: typed dynamic properties of one graphics object', () => {
  const h = session();
  h.run("f = figure('Visible', 'off'); ln = line([0 1], [0 1]); ln2 = line([0 1], [1 0]);");
  h.run("addproperty('Mode2', ln, 'radio', 'a|{b}|c'); r0 = get(ln, 'Mode2'); set(ln, 'mode2', 'c'); r1 = ln.Mode2;");
  assert.deepEqual([h.v('r0'), h.v('r1')], ['b', 'c']);
  assert.match(h.fail("set(ln, 'Mode2', 'zz')").message, /not one of/);
  h.run("addproperty('Flag', ln, 'boolean', 'on'); b0 = get(ln, 'Flag'); set(ln, 'Flag', false); b1 = get(ln, 'Flag');");
  assert.deepEqual([h.v('b0'), h.v('b1')], ['on', 'off']);
  h.run("addproperty('Weight', ln, 'double', 3); w0 = get(ln, 'Weight'); ln.Weight = 5; w1 = get(ln, 'Weight');");
  assert.deepEqual([h.v('w0'), h.v('w1')], [3, 5]);
  assert.match(h.fail("set(ln, 'Weight', 'x')").message, /numeric/);
  h.run("addproperty('Note', ln, 'string', 'hi'); n0 = get(ln, 'Note'); addproperty('Bag', ln, 'any', {1, 'x'}); g0 = class(get(ln, 'Bag'));");
  assert.deepEqual([h.v('n0'), h.v('g0')], ['hi', 'cell']);
  h.run("addproperty('Tint', ln, 'color', [1 0 0], 'none|flat'); c0 = get(ln, 'Tint'); set(ln, 'Tint', 'none'); c1 = get(ln, 'Tint'); set(ln, 'Tint', 'b'); c2 = get(ln, 'Tint');");
  assert.deepEqual([h.v('c0'), h.v('c1'), h.v('c2')], [[1, 0, 0], 'none', [0, 0, 1]]);
  h.run("addproperty('Other', ln, 'handle', ln2); o0 = isequal(get(ln, 'Other'), ln2); addproperty('Vals', ln, 'array', [1 2; 3 4]); v0 = get(ln, 'Vals');");
  assert.equal(h.v('o0'), 1);
  assert.deepEqual(h.v('v0'), [1, 3, 2, 4]);
  // per object: the other line does not have it; get(h) and isprop see it; copies keep it
  assert.match(h.fail("get(ln2, 'Mode2')").message, /Unrecognized property/);
  h.run("s = get(ln); hasF = isfield(s, 'Mode2'); ip = [isprop(ln, 'Mode2'), isprop(ln2, 'Mode2'), isprop(ln, 'Color')]; cp = copyobj(ln, gca); cm = get(cp, 'Mode2');");
  assert.equal(h.v('hasF'), 1);
  assert.deepEqual(h.v('ip'), [1, 0, 1]);
  assert.equal(h.v('cm'), 'c');
  h.run("opts = set(ln, 'Mode2');");
  assert.deepEqual(h.v('opts'), ['a', 'b', 'c']);
});

test('addproperty: errors', () => {
  const h = session();
  h.run("f = figure('Visible', 'off'); ln = line([0 1], [0 1]); addproperty('Extra', ln, 'any');");
  assert.match(h.fail("addproperty('Color', ln, 'any')").message, /already exists/);
  assert.match(h.fail("addproperty('extra', ln, 'any')").message, /already exists/);
  assert.match(h.fail("addproperty('Q', ln, 'fancy')").message, /unsupported property type/);
  assert.match(h.fail("addproperty('Q', ln, 'radio')").message, /radio property needs/);
  assert.match(h.fail("addproperty('1Q', ln, 'any')").message, /invalid property name/);
  assert.match(h.fail("addproperty('Q', ln)").message, /TYPE are required/);
});

// ---------------------------------------------------------------- package functions (core/compat/pkgfuncs.js)

test('makeValidName: Octave rules, options and the modified flags', () => {
  const h = session();
  h.run(`[v, m] = ${VALID}({'1abc', 'for', 'a b c', 'ok_1', 'x-y', '  lead', '', 'café'});`);
  assert.deepEqual(h.v('v'), ['x1abc', 'xFor', 'aBC', 'ok_1', 'x_y', 'lead', 'x', 'caf_']);
  assert.deepEqual(h.v('m'), [1, 1, 1, 0, 1, 1, 1, 1]);
  h.run(`a = ${VALID}('a-b', 'ReplacementStyle', 'hex'); b = ${VALID}('a-b c', 'ReplacementStyle', 'delete', 'Prefix', 'p'); c = ${VALID}('9x', 'Prefix', 'v_'); [d, dm] = ${VALID}('fine');`);
  assert.deepEqual([h.v('a'), h.v('b'), h.v('c'), h.v('d'), h.v('dm')], ['a0x2Db', 'abC', 'v_9x', 'fine', 0]);
  h.run(`s = ${VALID}(["a b", "ok"]);`);
  assert.equal(h.raw('s').cls, 'string');
  assert.deepEqual(h.v('s'), ['aB', 'ok']);
  assert.match(h.fail(`${VALID}('x', 'ReplacementStyle', 'zap')`).message, /ReplacementStyle/);
  assert.match(h.fail(`${VALID}('x', 'Prefix', '1')`).message, /Prefix/);
  assert.match(h.fail(`${VALID}(5)`).message, /character vector/);
});

test('makeUniqueStrings: suffixes, exclusions, index selection and maximum length', () => {
  const h = session();
  h.run(`[u, m] = ${UNIQUE}({'quiz', 'quiz', 'quiz', 'exam', 'quiz', 'exam', 'solo'});`);
  assert.deepEqual(h.v('u'), ['quiz_1', 'quiz_2', 'quiz_3', 'exam_1', 'quiz_4', 'exam_2', 'solo']);
  assert.deepEqual(h.v('m'), [1, 1, 1, 1, 1, 1, 0]);
  h.run(`a = ${UNIQUE}('max', {'max', 'max_1'}); b = ${UNIQUE}('max', 'other'); [c, cm] = ${UNIQUE}({'a', 'b', 'a', 'a'}, [3 4]); d = ${UNIQUE}({'a', 'b', 'a', 'a'}, logical([0 0 1 0]));`);
  assert.deepEqual([h.v('a'), h.v('b')], ['max_2', 'max']);
  assert.deepEqual(h.v('c'), ['a', 'b', 'a_1', 'a_2']);
  assert.deepEqual(h.v('cm'), [0, 0, 1, 1]);
  assert.deepEqual(h.v('d'), ['a', 'b', 'a_1', 'a']);
  h.run(`[e, em] = ${UNIQUE}({'abcdef', 'abcdeg', 'xy'}, {}, 4);`);
  assert.deepEqual(h.v('e'), ['ab_1', 'ab_2', 'xy']);
  assert.deepEqual(h.v('em'), [1, 1, 0]);
  assert.match(h.fail(`${UNIQUE}({'a'}, 5)`).message, /out of bounds/);
  assert.match(h.fail(`${UNIQUE}({'a'}, {}, 0)`).message, /MAXLENGTH/);
});

test('base64encode / base64decode', () => {
  const h = session();
  h.run(`e = ${ENC}('Hello'); d = ${DEC}(e); t = char(d); u = ${ENC}(uint8([1 2 3 4])); w = ${DEC}("AQIDBA=="); z = ${ENC}(''); k = ${ENC}('한'); kb = ${DEC}(k);`);
  assert.equal(h.v('e'), 'SGVsbG8=');
  assert.equal(h.raw('d').cls, 'uint8');
  assert.deepEqual(h.raw('d').dims, [1, 5]);
  assert.equal(h.v('t'), 'Hello');
  assert.equal(h.v('u'), 'AQIDBA==');
  assert.deepEqual(h.v('w'), [1, 2, 3, 4]);
  assert.deepEqual(h.raw('z').dims, [1, 0]);
  assert.deepEqual(h.v('kb'), [0xed, 0x95, 0x9c]); // UTF-8 bytes
  h.run(`m = ${DEC}(['SGVs' newline 'bG8=']);`);
  assert.deepEqual(h.v('m'), [72, 101, 108, 108, 111]);
  assert.match(h.fail(`${DEC}('S*==')`).message, /not valid base64/);
  assert.match(h.fail(`${ENC}([1 2])`).message, /uint8 or char/);
});

test('the root folder function: host install folder, OCTAVE_HOME, else "/"', () => {
  const h = session();
  h.run(`r = ${ROOT};`);
  assert.equal(h.v('r'), '/');
  h.run(`setenv('OCTAVE_HOME', '/opt/oct/'); r2 = ${ROOT}();`);
  assert.equal(h.v('r2'), '/opt/oct');
  const mfs = createMemoryFs();
  mfs.installDir = () => 'C:\\Apps\\Sim\\';
  const g = session({}, { fs: mfs });
  g.run(`r = ${ROOT};`);
  assert.equal(g.v('r'), 'C:/Apps/Sim');
  assert.match(g.fail(`${ROOT}(1)`).message, /no input/);
});

test('dotted package names: call, command syntax, handles, help and catalog', () => {
  const h = session();
  h.run(`${ENC} Hello`);
  assert.match(h.text(), /SGVsbG8=/);
  h.run(`f = @${ENC}; a = f('ab'); g = func2str(f); b = feval('${ENC}', 'ab'); c = ${VALID}('a b').';`);
  assert.equal(h.v('a'), 'YWI=');
  assert.equal(h.v('b'), 'YWI=');
  assert.match(h.v('g'), new RegExp(`${P}\\.net\\.base64encode`));
  // a variable named like the package prefix is indexed as usual
  h.run(`${P} = struct('x', 7); y = ${P}.x;`);
  assert.equal(h.v('y'), 7);
  for (const n of [VALID, UNIQUE, ENC, DEC, ROOT, 'memory']) {
    const hp = h.s.help(n);
    assert.ok(hp && hp.en && hp.ko && hp.syntax && hp.syntax.length, `help of ${n}`);
  }
  assert.match(h.fail(`${P}.lang.noSuchThing(1)`).message, /Unrecognized|Undefined/);
  // the static check knows the package names and their command syntax
  assert.deepEqual(h.s.check(`x = ${VALID}('a b');\n${ENC} hi\ny = isnull([]);\n`, {}), []);
});

// ---------------------------------------------------------------- registry, help, name rule

test('registry: no duplicates; every new builtin has en/ko help with syntax lines', () => {
  const reg = buildRegistry();
  for (const n of [VALID, UNIQUE, ENC, DEC, ROOT, 'memory', 'addproperty']) {
    assert.equal(typeof reg.builtins[n], 'function', n);
    const hp = reg.help[n];
    assert.ok(hp && hp.en && hp.ko && Array.isArray(hp.syntax) && hp.syntax.length, `help of ${n}`);
  }
  for (const n of ['isnull', 'superiorto', 'inferiorto', 'profexplore', 'preferences']) {
    assert.equal(typeof lang.builtins[n], 'function', n);
    const hp = lang.help[n];
    assert.ok(hp && hp.en && hp.ko && Array.isArray(hp.syntax) && hp.syntax.length, `help of ${n}`);
    assert.ok(!(n in reg.builtins), `${n} is owned by the language only`);
  }
  assert.equal(reg.owner[VALID], 'base');
});

test('name rule: the product words appear only inside core/compat/', () => {
  const banned = new RegExp(['mat', 'lab', '|', 'sim', 'ul', 'ink'].join(''), 'i');
  const root = path.join(here, '..');
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'compat' && e.name !== 'fixtures') walk(p); continue; }
      if (!/\.(m?js|jsx|css|html|md)$/.test(e.name)) continue;
      if (banned.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
    }
  };
  for (const d of ['core', 'src', 'test']) walk(path.join(root, d));
  assert.deepEqual(hits, []);
  // the package functions live in core/compat/, which is allowed to name them
  assert.ok(banned.test(fs.readFileSync(path.join(root, 'core', 'compat', 'pkgfuncs.js'), 'utf8')));
  assert.ok(!banned.test(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')));
});
