// 스크립트로 변환, end to end: graphical scripts made of every block kind are turned into M code,
// the code is run by the real engine, and the values it computes are checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { emptyFlow, makeNode, connect, generateCode, applySyntax, OPS, freeVarName } from '../src/flow/flow.js';

function session() {
  const out = [];
  const s = createSession({ print: (t) => out.push(t), host: { post: () => {}, request: () => null } });
  const run = (code) => { out.length = 0; const r = s.evaluate(code); assert.ok(r.ok, `${r.error && r.error.message}\n--- code ---\n${code}`); return out.join(''); };
  const num = (expr) => Number(run(`fprintf('%.12g\\n', ${expr});`).trim());
  return { run, num };
}

// a small builder: add(type, opts) → node; wire(a, b, outPort, inPort)
function builder() {
  let f = emptyFlow();
  let x = 0;
  const add = (type, opts = {}) => { const n = makeNode(f, type, (x += 220), 0, opts); f = { ...f, nodes: [...f.nodes, { ...n, ...opts.patch }] }; return f.nodes[f.nodes.length - 1]; };
  const wire = (a, b, out = 0, inp = 0) => { const before = f.links.length; f = connect(f, { node: a.id, port: out }, { node: b.id, port: inp }); assert.equal(f.links.length, before + 1, 'linked'); };
  const set = (n, patch) => { f = { ...f, nodes: f.nodes.map((m) => (m.id === n.id ? { ...m, ...patch } : m)) }; };
  return { add, wire, set, get flow() { return f; }, replace(g) { f = g; } };
}

test('constants, operators and a formula compute what the blocks say', () => {
  const b = builder();
  const g = b.add('const', { name: 'g', value: '9.81' });
  const t = b.add('const', { name: 't', value: '2' });
  const m = b.add('op', { op: '*' });
  b.wire(g, m, 0, 0); b.wire(t, m, 0, 1);            // r1 = g * t
  const h = b.add('expr', { expr: 'a * b^2 / 2' });
  b.wire(g, h, 0, 0); b.wire(t, h, 0, 1);            // r2 = g * t^2 / 2
  const s = b.add('op', { op: '-' });
  b.wire(h, s, 0, 0); b.wire(m, s, 0, 1);            // r3 = r2 - r1
  const gen = generateCode(b.flow);
  assert.deepEqual(gen.problems, []);
  const e = session();
  e.run(gen.code);
  assert.equal(e.num(m.name), 9.81 * 2);
  assert.ok(Math.abs(e.num(h.name) - 9.81 * 4 / 2) < 1e-12);
  assert.ok(Math.abs(e.num(s.name) - (9.81 * 2 - 9.81 * 2)) < 1e-12);
});

test('every operator of the 연산 block runs', () => {
  const cases = [['+', 7], ['-', 3], ['*', 10], ['/', 2.5], ['^', 25], ['.*', 10], ['./', 2.5], ['.^', 25],
    ['==', 0], ['~=', 1], ['<', 0], ['>', 1], ['<=', 0], ['>=', 1], ['&', 1], ['|', 1]];
  assert.deepEqual(OPS.map((o) => o.op).sort(), cases.map((c) => c[0]).sort(), 'every operator the block offers');
  for (const [op, want] of cases) {
    const b = builder();
    const a = b.add('const', { name: 'a', value: '5' });
    const c = b.add('const', { name: 'c', value: '2' });
    const o = b.add('op', { op });
    b.wire(a, o, 0, 0); b.wire(c, o, 0, 1);
    const gen = generateCode(b.flow);
    assert.deepEqual(gen.problems, [], op);
    const e = session();
    e.run(gen.code);
    assert.equal(e.num(o.name), want, op);
  }
});

test('a 변수 block uses the workspace variable of its name', () => {
  const b = builder();
  const v = b.add('var', { name: 'speed' });
  const k = b.add('const', { name: 'k', value: '3' });
  const o = b.add('op', { op: '*' });
  b.wire(v, o, 0, 0); b.wire(k, o, 0, 1);
  const gen = generateCode(b.flow);
  assert.deepEqual(gen.problems, []);
  assert.doesNotMatch(gen.code, /speed =/, 'a variable block makes no code of its own');
  const e = session();
  e.run('speed = 12;');
  e.run(gen.code);
  assert.equal(e.num(o.name), 36);
});

test('functions: linked inputs, typed-in inputs and several outputs', () => {
  const b = builder();
  const n = b.add('const', { name: 'n', value: '4' });
  let z = b.add('func', { fn: 'linspace', syntax: 'y = linspace(x1, x2, n)' });
  b.set(z, { inputs: z.inputs.map((p, i) => (i === 0 ? { ...p, value: '0' } : i === 1 ? { ...p, value: '3' } : p)), names: ['xs'] });
  b.wire(n, z, 0, 2);
  const sz = b.add('func', { fn: 'size', syntax: '[m, n] = size(A)' });
  b.set(sz, { names: ['rows', 'cols'] });
  b.wire(z, sz, 0, 0);
  const sm = b.add('func', { fn: 'sum', syntax: 's = sum(x)' });
  b.set(sm, { names: ['total'] });
  b.wire(z, sm, 0, 0);
  const gen = generateCode(b.flow);
  assert.deepEqual(gen.problems, [], gen.code);
  assert.match(gen.code, /xs = linspace\(0, 3, n\);/);
  assert.match(gen.code, /\[rows, cols\] = size\(xs\);/);
  const e = session();
  e.run(gen.code);
  assert.equal(e.num('total'), 6);
  assert.equal(e.num('rows'), 1);
  assert.equal(e.num('cols'), 4);
});

test('a 표시 block prints its value, with its label', () => {
  const b = builder();
  const a = b.add('const', { name: 'a', value: '[1 2 3]' });
  const d = b.add('disp', { patch: { label: 'Result' } });
  b.wire(a, d);
  const gen = generateCode(b.flow);
  const out = session().run(gen.code);
  assert.match(out, /Result:/);
  assert.match(out, /1\s+2\s+3/);
});

test('blocks with open inputs stay in the script as comments, and the rest still runs', () => {
  const b = builder();
  const o1 = b.add('op', { op: '+' });
  const o2 = b.add('op', { op: '*' });
  const gen = generateCode(b.flow, { title: 'two operators' });
  assert.equal(gen.problems.length, 2);
  assert.match(gen.code, new RegExp(`% ${o1.name} = \\? \\+ \\?   <- Connect both inputs\\.`));
  assert.match(gen.code, new RegExp(`% ${o2.name} = \\? \\* \\?   <- `));
  session().run(gen.code); // comments only: runs without an error
  // one input linked: that one shows, the open one is ?
  const c = b.add('const', { name: 'c', value: '2' });
  b.wire(c, o1, 0, 0);
  const g2 = generateCode(b.flow, { problemText: (p) => `KO:${p.code}` });
  assert.match(g2.code, new RegExp(`% ${o1.name} = c \\+ \\?   <- KO:missingInput`));
  // a formula, a function and a display left open
  const x = b.add('expr', { expr: 'a + b' });
  const f = b.add('func', { fn: 'zeros', syntax: 'X = zeros(m, n)' });
  b.set(f, { names: ['Z'] });
  const d = b.add('disp');
  const g3 = generateCode(b.flow);
  assert.match(g3.code, new RegExp(`% ${x.name} = a \\+ b   <- `));
  assert.match(g3.code, /% Z = zeros\(\?, \?\)   <- /);
  assert.match(g3.code, /% disp\(\?\)   <- /);
  const e = session();
  e.run(g3.code);
  assert.equal(e.num('c'), 2, 'the complete blocks still run');
  assert.ok(d);
});

test('a chosen syntax changes the generated call', () => {
  const b = builder();
  const f0 = b.add('func', { fn: 'zeros', syntax: 'X = zeros(n)' });
  const reshaped = applySyntax(b.flow, b.flow.nodes.find((n) => n.id === f0.id), 'X = zeros(m, n)');
  b.replace({ ...b.flow, nodes: b.flow.nodes.map((n) => (n.id === f0.id ? { ...reshaped, names: ['Z'], inputs: reshaped.inputs.map((p) => ({ ...p, value: '2' })) } : n)) });
  const gen = generateCode(b.flow);
  assert.match(gen.code, /Z = zeros\(2, 2\);/);
  const e = session();
  e.run(gen.code);
  assert.equal(e.num('numel(Z)'), 4);
});

test('new 변수 blocks get names no block uses yet', () => {
  let f = emptyFlow();
  const names = [];
  for (let i = 0; i < 9; i++) { const n = makeNode(f, 'var', 0, 0); names.push(n.name); f = { ...f, nodes: [...f.nodes, n] }; }
  assert.deepEqual(names, ['x', 'y', 'z', 't', 'u', 'v', 'w', 'v1', 'v2']);
  f = { ...emptyFlow(), nodes: [makeNode(emptyFlow(), 'const', 0, 0, { name: 'x' })] };
  assert.equal(freeVarName(f), 'y', 'an output name is taken too');
});

test('a constant linked into a 변수 block is assigned to that variable', () => {
  const b = builder();
  const c = b.add('const', { name: 'c1', value: '25' });
  const v = b.add('var', { name: 'speed' });
  b.wire(c, v);                                       // speed = c1;
  const k = b.add('const', { name: 'k', value: '2' });
  const o = b.add('op', { op: '*' });
  b.wire(v, o, 0, 0); b.wire(k, o, 0, 1);            // r1 = speed * k;
  const gen = generateCode(b.flow);
  assert.deepEqual(gen.problems, []);
  assert.match(gen.code, /c1 = 25;\nspeed = c1;\n/);
  assert.ok(gen.code.includes(`${o.name} = speed * k;`), gen.code);
  const e = session();
  e.run(gen.code);
  assert.equal(e.num('speed'), 25);
  assert.equal(e.num(o.name), 50);
  // a result into a variable, too
  const v2 = b.add('var', { name: 'twice' });
  b.wire(o, v2);
  const e2 = session();
  e2.run(generateCode(b.flow).code);
  assert.equal(e2.num('twice'), 50);
});

test('a variable given a value is an output name: two blocks may not give the same one', () => {
  const b = builder();
  const c = b.add('const', { name: 'speed', value: '1' });
  const v = b.add('var', { name: 'speed' });
  assert.deepEqual(generateCode(b.flow).problems, [], 'open input: it only reads speed');
  const c2 = b.add('const', { name: 'c2', value: '3' });
  b.wire(c2, v);
  assert.ok(generateCode(b.flow).problems.some((p) => p.code === 'dupName'), 'speed = 1 and speed = c2');
  assert.ok(c);
});
