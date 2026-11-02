// 수식으로 모델 만들기: equations → a block-diagram model.
//
//   미분방정식  x'' = -c*x' - k*x + u     states with ' (or dx/dt, d2x/dt2, der(x))
//               x(0) = 1, x'(0) = 0       initial conditions
//               k = 2                     parameters (constant right-hand sides → model workspace)
//               y = x + 1                 output / intermediate signals
//   전달 함수   G = (s + 1)/(s^2 + 2*s + 1)       (z with Ts = … : discrete)
//   상태 공간   A = [0 1; -2 -3]  B = [0; 1]  C = [1 0]  D = 0  x0 = [1; 0]
//
// A differential equation becomes a chain of Integrators per state; its right-hand
// side is split into terms: c*v → Gain, a constant → Constant, anything else → Fcn
// (through a Mux when it reads several signals), added up by a Sum. Names that are
// never defined are inputs (Step, Sine Wave, Constant or In port); t is a Clock.
//
//   parseEquations(text, { kind })            → spec (throws MError 'sim:eq:*' with the line)
//   tfSpec(list, ts) / ssSpec(matrices)        → spec from numbers (tf2model / ss2model)
//   specModel(spec, { name, input, stopTime }) → { model, info }
//   equationModel(text, opts)                 → parseEquations + specModel
//   insertEquationModel(model, sys, built)    → adds a built model's blocks to a system
import { MError } from '../value.js';
import { newModel, makeBlock, connect, reassignIds, systemBounds } from './model.js';

// data: what eqhint.js needs to suggest a fix (the statement, the name, the sizes …)
const err = (id, msg, line, data = {}) => new MError(`sim:eq:${id}`, line ? `Line ${line}: ${msg}` : msg, { line: line || 0, ...data });

export const EQ_KINDS = ['auto', 'ode', 'tf', 'ss'];
export const EQ_INPUTS = ['step', 'sine', 'constant', 'inport'];
const FUNCS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'log2', 'sqrt', 'abs', 'sign', 'min', 'max', 'mod', 'rem', 'floor', 'ceil', 'round', 'fix', 'hypot', 'power']);
const CONSTS = { pi: Math.PI, inf: Infinity, Inf: Infinity, eps: 2.220446049250313e-16 };
const MATH = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, log: Math.log, log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign, min: Math.min, max: Math.max, hypot: Math.hypot,
  mod: (a, b) => (b === 0 ? a : a - Math.floor(a / b) * b), rem: (a, b) => (b === 0 ? a : a - Math.trunc(a / b) * b), floor: Math.floor, ceil: Math.ceil, round: Math.round, fix: Math.trunc, power: Math.pow,
};

// ---------------------------------------------------------------- lexer
/** Tokens of one statement: num, id (with primes = derivative order), op, nl (a new row inside [ ]). */
function lex(src, line) {
  const out = [];
  let i = 0, sp = false;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; sp = true; continue; }
    if (c === '\n') { out.push({ t: 'nl', sp }); i++; sp = false; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0]), sp }); i += num[0].length; sp = false; continue; }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (id) {
      i += id[0].length;
      let d = 0;
      while (src[i] === "'") { d++; i++; }
      out.push({ t: 'id', v: id[0], d, sp }); sp = false; continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '.*' || two === './' || two === '.^' || two === '**') { out.push({ t: 'op', v: two === '**' ? '^' : two[1], sp }); i += 2; sp = false; continue; }
    if ('+-*/^()[],;='.includes(c)) { out.push({ t: 'op', v: c, sp }); i++; sp = false; continue; }
    throw err('syntax', `Unexpected character '${c}'.`, line, { char: c, src });
  }
  out.push({ t: 'eof', sp });
  return out;
}

// ---------------------------------------------------------------- parser
const tokName = (t) => (t.t === 'eof' ? 'eof' : t.t === 'nl' ? 'nl' : String(t.v));
// nodes: { k:'num', v } { k:'var', name, d } { k:'call', name, d, args } { k:'neg', a } { k:'bin', op, a, b } { k:'mat', rows }
function parseStatement(src, line) {
  const toks = lex(src, line);
  let p = 0, inMat = 0;
  const peek = (o = 0) => toks[p + o];
  const isOp = (v, o = 0) => peek(o).t === 'op' && peek(o).v === v;
  const expect = (v) => { if (!isOp(v)) throw err('syntax', `Expected '${v}' but found '${peek().t === 'eof' ? 'end of line' : peek().v ?? 'new line'}'.`, line, { expected: v, found: tokName(peek()), src }); p++; };
  // inside [ ]: "1 -2" is two elements, "1 - 2" one
  const elementEnd = () => inMat && peek().sp && (isOp('+') || isOp('-')) && !peek(1).sp;
  const startsFactor = () => { const t = peek(); return t.t === 'num' || t.t === 'id' || (t.t === 'op' && (t.v === '(' || t.v === '[')); };
  function expr() {
    let a = term();
    while ((isOp('+') || isOp('-')) && !elementEnd()) { const op = peek().v; p++; a = { k: 'bin', op, a, b: term() }; }
    return a;
  }
  function term() {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = peek().v; p++; a = { k: 'bin', op, a, b: unary() }; continue; }
      // implicit product: 2s, 2(s+1), (s+1)(s+2) (not across a space inside [ ])
      if (startsFactor() && !(inMat && peek().sp)) { a = { k: 'bin', op: '*', a, b: power() }; continue; }
      return a;
    }
  }
  function unary() {
    if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const a = primary();
    if (isOp('^')) { p++; return { k: 'bin', op: '^', a, b: unary() }; }
    return a;
  }
  function primary() {
    const t = peek();
    if (t.t === 'num') { p++; return { k: 'num', v: t.v }; }
    if (t.t === 'id') {
      p++;
      if (isOp('(') && !(inMat && peek().sp)) {
        p++;
        const args = [];
        const save = inMat; inMat = 0;
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
        inMat = save;
        expect(')');
        if (t.v === 'der' && args.length === 1 && (args[0].k === 'var')) return { k: 'var', name: args[0].name, d: args[0].d + 1 + t.d };
        return { k: 'call', name: t.v, d: t.d, args };
      }
      return { k: 'var', name: t.v, d: t.d };
    }
    if (isOp('(')) { p++; const save = inMat; inMat = 0; const e = expr(); inMat = save; expect(')'); return e; }
    if (isOp('[')) {
      p++; inMat++;
      const rows = [[]];
      for (;;) {
        if (isOp(']')) { p++; break; }
        if (peek().t === 'eof') throw err('syntax', "Missing ']'.", line, { expected: ']', found: 'eof', src });
        if (isOp(';') || peek().t === 'nl') { p++; if (rows[rows.length - 1].length) rows.push([]); continue; }
        if (isOp(',')) { p++; continue; }
        rows[rows.length - 1].push(expr());
      }
      inMat--;
      if (!rows[rows.length - 1].length) rows.pop();
      return { k: 'mat', rows };
    }
    throw err('syntax', t.t === 'eof' ? 'The expression is incomplete.' : `Unexpected '${t.v ?? 'new line'}'.`, line, { found: tokName(t), src });
  }
  const lhs = expr();
  let rhs = null;
  if (isOp('=')) { p++; rhs = expr(); }
  if (peek().t !== 'eof') throw err('syntax', `Unexpected '${peek().v ?? 'new line'}'.`, line, { found: tokName(peek()), src });
  return rhs ? { lhs, rhs } : { lhs: null, rhs: lhs };
}

/** Statements with their line numbers: split at new lines and ; outside [ ], comments (% #) removed, dx/dt → x'. */
function statements(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n')
    .replace(/\bd([2-9]?)([A-Za-z_]\w*)\s*\/\s*dt(?:\^?[2-9])?\b/g, (m, n, v) => v + "'".repeat(n ? Number(n) : 1));
  const out = [];
  let cur = '', depth = 0, line = 1, start = 1;
  const flush = () => { if (cur.trim()) out.push({ src: cur, line: start }); cur = ''; start = line; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if ((c === '%' || c === '#')) { while (i < src.length && src[i] !== '\n') i++; i--; continue; }
    if (c === '[') depth++;
    if (c === ']') depth = Math.max(0, depth - 1);
    if (c === '\n') { line++; if (depth) { cur += c; continue; } flush(); start = line; continue; }
    if (c === ';' && !depth) { flush(); start = line; continue; }
    if (!cur.trim()) start = line;
    cur += c;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- printing and evaluation
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };
export function fmtNum(x) {
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  const r = Number(x.toPrecision(12));
  return String(Object.is(r, -0) ? 0 : r);
}
/** M text of a node; rename(var) may replace variables (u(1) …). */
function print(n, rename = null, parent = 0, right = false) {
  switch (n.k) {
    case 'num': return fmtNum(n.v);
    case 'var': return rename ? rename(n) : n.name + "'".repeat(n.d);
    case 'call': return `${n.name}(${n.args.map((a) => print(a, rename)).join(', ')})`;
    case 'mat': return `[${n.rows.map((r) => r.map((a) => print(a, rename)).join(' ')).join('; ')}]`;
    case 'neg': { const s = `-${print(n.a, rename, PREC.neg)}`; return parent >= PREC.neg ? `(${s})` : s; }
    default: {
      const pr = PREC[n.op];
      const a = print(n.a, rename, pr, false), b = print(n.b, rename, pr, true);
      const s = n.op === '+' || n.op === '-' ? `${a} ${n.op} ${b}` : `${a}${n.op}${b}`;
      const need = pr < parent || (pr === parent && right && (n.op === '-' || n.op === '/' || n.op === '+' || n.op === '*')) || (pr === parent && !right && n.op === '^');
      return need ? `(${s})` : s;
    }
  }
}
/** Variables read by a node: [{ name, d }] in order, each once. */
function varsOf(n, out = []) {
  if (n.k === 'var') { if (!out.some((v) => v.name === n.name && v.d === n.d)) out.push({ name: n.name, d: n.d }); return out; }
  if (n.k === 'call') { if (n.d) out.push({ name: n.name, d: n.d, bad: 'call' }); n.args.forEach((a) => varsOf(a, out)); return out; }
  if (n.k === 'mat') { n.rows.flat().forEach((a) => varsOf(a, out)); return out; }
  if (n.a) varsOf(n.a, out);
  if (n.b) varsOf(n.b, out);
  return out;
}
function evalNum(n, env, line) {
  switch (n.k) {
    case 'num': return n.v;
    case 'var':
      if (n.d) throw err('const', `'${n.name}${"'".repeat(n.d)}' is not a constant.`, line, { name: n.name, d: n.d });
      if (n.name in env) return env[n.name];
      if (n.name in CONSTS) return CONSTS[n.name];
      throw err('const', `'${n.name}' has no value.`, line, { name: n.name, why: 'value' });
    case 'call': {
      const f = MATH[n.name];
      if (!f) throw err('func', `Unknown function '${n.name}'.`, line, { name: n.name });
      return f(...n.args.map((a) => evalNum(a, env, line)));
    }
    case 'neg': return -evalNum(n.a, env, line);
    case 'mat': throw err('const', 'A matrix is not a number here.', line);
    default: {
      const a = evalNum(n.a, env, line), b = evalNum(n.b, env, line);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : a ** b;
    }
  }
}
function evalMatrix(n, env, line, what) {
  const rows = n.k === 'mat' ? n.rows.map((r) => r.map((a) => evalNum(a, env, line))) : [[evalNum(n, env, line)]];
  if (rows.length && rows.some((r) => r.length !== rows[0].length)) throw err('dims', `The rows of ${what} have different lengths.`, line, { what, why: 'rows' });
  return rows;
}
const matText = (M) => (M.length === 1 && M[0].length === 1 ? fmtNum(M[0][0]) : `[${M.map((r) => r.map(fmtNum).join(' ')).join('; ')}]`);

// ---------------------------------------------------------------- polynomials (transfer functions)
const trim = (p) => { let i = 0; while (i < p.length - 1 && Math.abs(p[i]) < 1e-14) i++; return p.slice(i); };
const pad = (p, n) => [...new Array(Math.max(0, n - p.length)).fill(0), ...p];
const padd = (a, b, s = 1) => { const n = Math.max(a.length, b.length); const A = pad(a, n), B = pad(b, n); return trim(A.map((x, i) => x + s * B[i])); };
const pmul = (a, b) => { const r = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return trim(r); };
/** A rational function of `v` from a node: { n, d } (descending coefficients). */
function rational(node, v, env, tfs, line) {
  const R = (n, d = [1]) => ({ n, d });
  switch (node.k) {
    case 'num': return R([node.v]);
    case 'var':
      if (node.d) throw err('tf', `'${node.name}${"'".repeat(node.d)}': derivatives do not belong in a transfer function.`, line, { why: 'deriv', name: node.name });
      if (node.name === v) return R([1, 0]);
      if (tfs[node.name]) return tfs[node.name];
      return R([evalNum(node, env, line)]);
    case 'neg': { const a = rational(node.a, v, env, tfs, line); return R(a.n.map((x) => -x), a.d); }
    case 'call': return R([evalNum(node, env, line)]);
    case 'mat': throw err('tf', 'A matrix does not belong in a transfer function.', line, { why: 'matrix' });
    default: {
      const a = rational(node.a, v, env, tfs, line);
      if (node.op === '^') {
        const e = evalNum(node.b, env, line);
        if (!Number.isInteger(e)) throw err('tf', `The power ${fmtNum(e)} is not an integer.`, line, { why: 'power' });
        let r = R([1]);
        for (let i = 0; i < Math.abs(e); i++) r = R(pmul(r.n, a.n), pmul(r.d, a.d));
        return e < 0 ? R(r.d, r.n) : r;
      }
      const b = rational(node.b, v, env, tfs, line);
      if (node.op === '*') return R(pmul(a.n, b.n), pmul(a.d, b.d));
      if (node.op === '/') return R(pmul(a.n, b.d), pmul(a.d, b.n));
      return R(padd(pmul(a.n, b.d), pmul(b.n, a.d), node.op === '-' ? -1 : 1), pmul(a.d, b.d));
    }
  }
}
function normalizeTF({ n, d }, name, line) {
  n = trim(n); d = trim(d);
  if (d.every((x) => x === 0)) throw err('tf', `${name}: the denominator is zero.`, line, { why: 'zero', name });
  const k = d[0];
  n = n.map((x) => x / k); d = d.map((x) => x / k);
  if (n.length > d.length) throw err('tf', `${name} is improper: the numerator has a higher degree than the denominator.`, line, { why: 'improper', name });
  return { num: n.map((x) => Number(x.toPrecision(12))), den: d.map((x) => Number(x.toPrecision(12))) };
}
const polyText = (p) => (p.length === 1 ? fmtNum(p[0]) : `[${p.map(fmtNum).join(' ')}]`);

// ---------------------------------------------------------------- analysis
/** The equations as a spec: { kind, ... } (see the build functions). Throws with the line. */
export function parseEquations(text, { kind = 'auto' } = {}) {
  const st = statements(text);
  if (!st.length) throw err('empty', 'There are no equations.', 0, {});
  const odes = new Map(), ics = [], defs = new Map(), bare = [];
  for (const s of st) {
    const { lhs, rhs } = parseStatement(s.src, s.line);
    if (!lhs) { bare.push({ rhs, line: s.line, src: s.src }); continue; }
    if (lhs.k === 'var' && lhs.d > 0) {
      if (odes.has(lhs.name)) throw err('dup', `'${lhs.name}' has two differential equations.`, s.line, { name: lhs.name, why: 'ode', first: odes.get(lhs.name).line });
      odes.set(lhs.name, { name: lhs.name, order: lhs.d, rhs, line: s.line });
    } else if (lhs.k === 'call' && lhs.args.length === 1 && lhs.args[0].k === 'num' && lhs.args[0].v === 0 && !FUNCS.has(lhs.name)) {
      ics.push({ name: lhs.name, d: lhs.d, rhs, line: s.line });
    } else if (lhs.k === 'var' || (lhs.k === 'call' && lhs.d === 0 && lhs.args.every((a) => a.k === 'var'))) {
      if (defs.has(lhs.name)) throw err('dup', `'${lhs.name}' is defined twice.`, s.line, { name: lhs.name, why: 'def', first: defs.get(lhs.name).line });
      defs.set(lhs.name, { name: lhs.name, rhs, line: s.line });
    } else throw err('lhs', `The left side '${print(lhs)}' must be a name, a derivative (x', x'') or an initial value (x(0)).`, s.line, { lhs, rhs, src: s.src });
  }
  const free = new Set();
  const collect = (n) => varsOf(n).forEach((v) => free.add(v.name));
  for (const o of odes.values()) collect(o.rhs);
  for (const d of defs.values()) collect(d.rhs);
  for (const b of bare) collect(b.rhs);
  let k = kind;
  if (!EQ_KINDS.includes(k)) throw err('kind', `Unknown kind '${kind}' (auto, ode, tf or ss).`, 0, { why: 'unknown' });
  if (k === 'auto') {
    if (odes.size) k = 'ode';
    else if (defs.has('A') && (defs.has('B') || defs.has('C'))) k = 'ss';
    else if (free.has('s') || free.has('z')) k = 'tf';
    else throw err('kind', "Write differential equations (x' = …), a transfer function (G = 1/(s + 1)) or state-space matrices (A = …, B = …, C = …, D = …).", 0, { why: 'none' });
  }
  if (k === 'ode') return analyzeODE(odes, ics, defs, bare);
  if (k === 'tf') return analyzeTF(defs, bare);
  return analyzeSS(defs, bare);
}

/** Parameters: definitions whose right side is constant (numbers, other parameters, pi …). */
function splitParams(defs, exclude) {
  const params = new Map();
  for (let changed = true; changed;) {
    changed = false;
    for (const d of defs.values()) {
      if (params.has(d.name) || exclude.has(d.name)) continue;
      const vs = varsOf(d.rhs);
      if (d.rhs.k !== 'mat' && vs.every((v) => !v.d && !v.bad && (params.has(v.name) || v.name in CONSTS))) {
        params.set(d.name, d); changed = true;
      }
    }
  }
  const env = {};
  const order = [];
  // in definition order, each after the parameters it reads
  const done = new Set();
  const visit = (d) => { if (done.has(d.name)) return; done.add(d.name); for (const v of varsOf(d.rhs)) if (params.has(v.name)) visit(params.get(v.name)); order.push(d); env[d.name] = evalNum(d.rhs, env, d.line); };
  for (const d of params.values()) visit(d);
  return { params: order, env };
}

function analyzeODE(odes, ics, defs, bare) {
  if (bare.length) throw err('lhs', `'${print(bare[0].rhs)}' is not an equation (write name = …).`, bare[0].line, { rhs: bare[0].rhs, bare: true, src: bare[0].src });
  if (!odes.size) throw err('kind', "Write differential equations with a derivative on the left: x' = …, x'' = ….", 0, { why: 'noode' });
  for (const n of odes.keys()) if (defs.has(n)) throw err('dup', `'${n}' is both a state and a definition.`, defs.get(n).line, { name: n, why: 'statedef', rhs: defs.get(n).rhs });
  const { params, env } = splitParams(defs, new Set(odes.keys()));
  const pnames = new Set(params.map((p) => p.name));
  const signals = [...defs.values()].filter((d) => !pnames.has(d.name));
  const known = new Set([...odes.keys(), ...signals.map((d) => d.name), ...pnames, 't']);
  const inputs = [];
  const check = (node, line) => {
    for (const v of varsOf(node)) {
      if (v.bad === 'call') throw err('deriv', `'${v.name}' is a function; it cannot be differentiated.`, line, { name: v.name, d: v.d, why: 'call' });
      if (v.d) {
        const o = odes.get(v.name);
        if (!o) throw err('deriv', `'${v.name}${"'".repeat(v.d)}': only states (names with a differential equation) have derivatives.`, line, { name: v.name, d: v.d, why: 'notstate', states: [...odes.keys()], signals: signals.map((x) => x.name) });
        if (v.d > o.order) throw err('deriv', `'${v.name}${"'".repeat(v.d)}' is a higher derivative than its equation (${v.name}${"'".repeat(o.order)}).`, line, { name: v.name, d: v.d, order: o.order, why: 'higher' });
      }
      if (!known.has(v.name) && !(v.name in CONSTS) && !inputs.includes(v.name)) inputs.push(v.name);
    }
    const calls = [];
    const walkCalls = (n) => { if (n.k === 'call') { calls.push(n); n.args.forEach(walkCalls); } else { if (n.a) walkCalls(n.a); if (n.b) walkCalls(n.b); if (n.rows) n.rows.flat().forEach(walkCalls); } };
    walkCalls(node);
    for (const c of calls) if (!FUNCS.has(c.name)) throw err('func', `Unknown function '${c.name}'.`, line, { name: c.name, known: [...known] });
  };
  for (const o of odes.values()) { if (o.rhs.k === 'mat') throw err('dims', 'Use one equation per state (no matrices).', o.line, { why: 'odemat' }); check(o.rhs, o.line); }
  for (const s of signals) { if (s.rhs.k === 'mat') throw err('dims', `'${s.name}': matrices are not supported in differential equations.`, s.line, { why: 'odemat' }); check(s.rhs, s.line); }
  // algebraic loops between definitions
  const byName = new Map(signals.map((s) => [s.name, s]));
  const state = new Map();
  const loop = (s, path) => {
    if (state.get(s.name) === 2) return;
    if (state.get(s.name) === 1) throw err('loop', `The definitions ${[...path, s.name].join(' → ')} depend on each other (algebraic loop).`, s.line, { names: [...path, s.name] });
    state.set(s.name, 1);
    for (const v of varsOf(s.rhs)) if (!v.d && byName.has(v.name)) loop(byName.get(v.name), [...path, s.name]);
    state.set(s.name, 2);
  };
  signals.forEach((s) => loop(s, []));
  const init = {};
  for (const ic of ics) {
    const o = odes.get(ic.name);
    if (!o) throw err('ic', `'${ic.name}(0)': '${ic.name}' has no differential equation.`, ic.line, { name: ic.name, d: ic.d, why: 'noode', states: [...odes.keys()] });
    if (ic.d >= o.order) throw err('ic', `'${ic.name}${"'".repeat(ic.d)}(0)': ${ic.name}${"'".repeat(o.order)} is given by its equation, not by an initial value.`, ic.line, { name: ic.name, d: ic.d, order: o.order, why: 'order' });
    const vs = varsOf(ic.rhs);
    const bad = vs.find((v) => v.d || !(pnames.has(v.name) || v.name in CONSTS));
    if (bad) throw err('ic', `The initial value of ${ic.name}${"'".repeat(ic.d)} must be a constant ('${bad.name}' is not).`, ic.line, { name: ic.name, d: ic.d, bad: bad.name, why: 'const' });
    init[`${ic.name}:${ic.d}`] = print(ic.rhs);
  }
  // shown: definitions nothing else reads, else the states
  const read = new Set();
  for (const o of odes.values()) varsOf(o.rhs).forEach((v) => read.add(v.name));
  for (const s of signals) varsOf(s.rhs).forEach((v) => read.add(v.name));
  const ends = signals.filter((s) => !read.has(s.name)).map((s) => s.name);
  return { kind: 'ode', states: [...odes.values()], signals, params, env, inputs, init, outputs: ends.length ? ends : [...odes.keys()], usesTime: [...odes.values(), ...signals].some((e) => varsOf(e.rhs).some((v) => v.name === 't')) };
}

function analyzeTF(defs, bare) {
  const exprs = [...defs.values()];
  bare.forEach((b, i) => exprs.push({ name: bare.length > 1 ? `G${i + 1}` : (defs.has('G') ? 'G1' : 'G'), rhs: b.rhs, line: b.line }));
  const uses = (d, v) => varsOf(d.rhs).some((x) => x.name === v);
  const withS = exprs.some((d) => uses(d, 's')), withZ = exprs.some((d) => uses(d, 'z'));
  if (withS && withZ) throw err('tf', 'Use s (continuous) or z (discrete), not both.', 0, { why: 'both' });
  const v = withZ ? 'z' : 's';
  const tfNames = new Set();
  // transfer functions: definitions that read v or another transfer function
  for (let changed = true; changed;) {
    changed = false;
    for (const d of exprs) if (!tfNames.has(d.name) && varsOf(d.rhs).some((x) => x.name === v || tfNames.has(x.name))) { tfNames.add(d.name); changed = true; }
  }
  if (!tfNames.size) throw err('tf', `No transfer function: write it with ${v}, e.g. G = 1/(${v} + 1).`, 0, { why: 'none', v });
  const { params, env } = splitParams(new Map(exprs.filter((d) => !tfNames.has(d.name)).map((d) => [d.name, d])), new Set([v]));
  const pnames = new Set(params.map((p) => p.name));
  for (const d of exprs) if (!tfNames.has(d.name) && !pnames.has(d.name)) throw err('tf', `'${d.name}' is neither a transfer function nor a constant.`, d.line, { why: 'neither', name: d.name, v });
  const tfs = {};
  const done = new Set();
  const visit = (d, path = []) => {
    if (done.has(d.name)) return;
    if (path.includes(d.name)) throw err('loop', `${[...path, d.name].join(' → ')} refer to each other.`, d.line, { names: [...path, d.name] });
    for (const x of varsOf(d.rhs)) if (tfNames.has(x.name) && x.name !== d.name) visit(exprs.find((e) => e.name === x.name), [...path, d.name]);
    tfs[d.name] = rational(d.rhs, v, env, tfs, d.line);
    done.add(d.name);
  };
  const list = exprs.filter((d) => tfNames.has(d.name));
  list.forEach((d) => visit(d));
  // blocks for the ones nothing else uses
  const usedBy = new Set();
  for (const d of list) varsOf(d.rhs).forEach((x) => { if (x.name !== d.name) usedBy.add(x.name); });
  const out = list.filter((d) => !usedBy.has(d.name)).map((d) => ({ name: d.name, line: d.line, ...normalizeTF(tfs[d.name], d.name, d.line) }));
  let ts = null;
  if (v === 'z') {
    ts = 'Ts' in env ? env.Ts : 'T' in env ? env.T : null;
    if (!(ts > 0)) throw err('tf', 'A discrete transfer function needs its sample time: Ts = 0.1.', 0, { why: 'ts' });
  }
  return { kind: 'tf', variable: v, ts, tfs: out, params: params.filter((p) => p.name !== 'Ts'), env, inputs: ['u'], outputs: out.map((t) => t.name) };
}

function analyzeSS(defs, bare) {
  if (bare.length) throw err('lhs', `'${print(bare[0].rhs)}' is not an equation (write A = …).`, bare[0].line, { rhs: bare[0].rhs, bare: true, ss: true, src: bare[0].src });
  const mats = new Set(['A', 'B', 'C', 'D', 'x0', 'X0']);
  const { params, env } = splitParams(new Map([...defs].filter(([n]) => !mats.has(n))), new Set());
  const get = (n) => defs.get(n);
  for (const n of ['A', 'B', 'C']) if (!get(n)) throw err('ss', `State space needs ${n} (A, B, C and optionally D, x0).`, 0, { missing: n });
  const M = {};
  for (const n of ['A', 'B', 'C', 'D', 'x0', 'X0']) if (get(n)) M[n] = evalMatrix(get(n).rhs, env, get(n).line, n);
  const lineOf = (n) => (get(n) || get(n === 'x0' ? 'X0' : n) || {}).line;
  const spec = ssSpec({ A: M.A, B: M.B, C: M.C, D: M.D, x0: M.x0 || M.X0, ts: 'Ts' in env ? env.Ts : null }, lineOf);
  return { ...spec, params: params.filter((p) => p.name !== 'Ts'), env };
}

/**
 * A state-space spec from matrices (rows of numbers): { A, B, C, D?, x0?, ts? }; lineOf(name) gives the
 * line for messages. D defaults to zeros, x0 to zeros; ts > 0 makes it discrete.
 */
export function ssSpec({ A, B, C, D = null, x0 = null, ts = null }, lineOf = () => 0) {
  const n = A ? A.length : 0;
  if (!n || A[0].length !== n) throw err('dims', `A must be square (it is ${n}×${A && A[0] ? A[0].length : 0}).`, lineOf('A'), { what: 'A', got: A });
  if (!B || B.length !== n) throw err('dims', `B must have ${n} rows like A (it has ${B ? B.length : 0}).`, lineOf('B'), { what: 'B', n, got: B });
  if (!C || !C.length || C[0].length !== n) throw err('dims', `C must have ${n} columns like A (it has ${C && C[0] ? C[0].length : 0}).`, lineOf('C'), { what: 'C', n, got: C });
  const m = B[0].length, p = C.length;
  const DD = D && D.length ? D : Array.from({ length: p }, () => new Array(m).fill(0));
  if (DD.length !== p || DD[0].length !== m) throw err('dims', `D must be ${p}×${m} (it is ${DD.length}×${DD[0].length}).`, lineOf('D'), { what: 'D', p, m });
  let x = x0 && x0.length ? x0.flat() : null;
  if (x && x.length !== n) throw err('dims', `x0 must have ${n} values (it has ${x.length}).`, lineOf('x0'), { what: 'x0', n, got: x });
  if (ts != null && !(ts > 0)) throw err('ss', 'The sample time Ts must be positive.', lineOf('Ts'), { why: 'ts' });
  return { kind: 'ss', A, B, C, D: DD, x0: x, ts: ts || null, n, m, p, params: [], env: {}, inputs: m === 1 ? ['u'] : Array.from({ length: m }, (_, i) => `u${i + 1}`), outputs: ['y'] };
}

/** A transfer-function spec from coefficients: list [{ name, num, den }] (descending powers); ts > 0: discrete (z). */
export function tfSpec(list, ts = null) {
  if (!list.length) throw err('tf', 'There is no transfer function.');
  if (ts != null && !(ts > 0)) throw err('tf', 'The sample time Ts must be positive.', 0, { why: 'tspos' });
  const tfs = list.map((t) => ({ name: t.name, ...normalizeTF({ n: t.num.slice(), d: t.den.slice() }, t.name, 0) }));
  return { kind: 'tf', variable: ts ? 'z' : 's', ts: ts || null, tfs, params: [], env: {}, inputs: ['u'], outputs: tfs.map((t) => t.name) };
}

// ---------------------------------------------------------------- building
const COLW = 130, ROWH = 64, X0 = 40, Y0 = 40;

/** A small builder: blocks placed on a column / row grid, lines by block and port. */
function builder(name) {
  const model = newModel(name);
  const sys = model.root;
  const place = new Map(); // block id → { col, row }
  return {
    model, sys,
    add(type, nm, params, col, row) {
      const b = makeBlock(model, type, { name: nm, params }, sys);
      sys.blocks.push(b);
      place.set(b.id, { col, row });
      return b;
    },
    wire(a, ap, b, bp, label) { const l = connect(model, sys, { block: a.id, port: ap }, { block: b.id, port: bp }); if (label && !l.name) l.name = label; return l; },
    layout() {
      for (const b of sys.blocks) {
        const { col, row } = place.get(b.id);
        b.x = Math.round(X0 + col * COLW + (60 - Math.min(b.w, 100)) / 2);
        b.y = Math.round(Y0 + row * ROWH + (40 - b.h) / 2);
      }
    },
  };
}

function sourceBlock(B, input, nm, col, row, port) {
  switch (input) {
    case 'sine': return B.add('SineWave', nm, {}, col, row);
    case 'constant': return B.add('Constant', nm, { Value: '1' }, col, row);
    case 'inport': return B.add('Inport', nm, { Port: String(port) }, col, row);
    default: return B.add('Step', nm, {}, col, row);
  }
}

/** Scope and Out ports for the shown signals: [{ name, from: [block, port] }]. */
function sinks(B, shown, col, row0) {
  const scope = B.add('Scope', 'Scope', { NumInputPorts: String(shown.length) }, col + 1, row0 + Math.max(0, (shown.length - 1) / 2));
  shown.forEach((s, i) => {
    const out = B.add('Outport', `${s.name}_out`, { Port: String(i + 1) }, col + 2, row0 + i);
    B.wire(s.from[0], s.from[1], scope, i + 1, s.name);
    B.wire(s.from[0], s.from[1], out, 1);
  });
}

/** The terms of a sum: [{ sign, node }] (a - (b + c) → +a, -b, -c). */
function termsOf(node) {
  const terms = [];
  const flat = (n, sign) => {
    if (n.k === 'bin' && (n.op === '+' || n.op === '-')) { flat(n.a, sign); flat(n.b, n.op === '-' ? -sign : sign); }
    else if (n.k === 'neg') flat(n.a, -sign);
    else terms.push({ sign, node: n });
  };
  flat(node, 1);
  return terms;
}

function buildODE(spec, B, input) {
  const pnames = new Set(spec.params.map((p) => p.name));
  const isConst = (node) => varsOf(node).every((v) => !v.d && !v.bad && (pnames.has(v.name) || v.name in CONSTS));
  const constText = (node) => (varsOf(node).some((v) => !(v.name in CONSTS)) ? print(node) : fmtNum(evalNum(node, {}, 0)));
  const tag = (label) => label.replace(/'/g, 'd');
  const states = new Map(spec.states.map((s) => [s.name, s]));
  const defs = new Map(spec.signals.map((s) => [s.name, s]));
  // one row band per equation, as tall as its right-hand side has terms
  const bandOf = (node) => { const t = termsOf(node); return Math.max(2, t.filter((x) => !isConst(x.node)).length + (t.some((x) => isConst(x.node)) ? 1 : 0)); };
  let row = 0;
  const band = (node) => { const r = row; row += bandOf(node); return r; };
  let srcRows = 0, portNo = 0;
  const memo = new Map();
  const integ = new Map(); // `${x}:${k}` → the Integrator whose output is x^(k)
  // integrators first; the highest derivative is on the left, the state itself next to the scope
  const maxOrder = Math.max(...spec.states.map((s) => s.order));
  const endCol = 4 + maxOrder;
  const stateRow = new Map();
  for (const s of spec.states) {
    const r = band(s.rhs);
    stateRow.set(s.name, r);
    const mid = r + Math.floor((bandOf(s.rhs) - 1) / 2);
    for (let k = s.order - 1; k >= 0; k--) {
      integ.set(`${s.name}:${k}`, B.add('Integrator', s.name + "'".repeat(k), { InitialCondition: spec.init[`${s.name}:${k}`] || '0' }, endCol - 1 - k, mid));
    }
    for (let k = s.order - 1; k >= 1; k--) B.wire(integ.get(`${s.name}:${k}`), 1, integ.get(`${s.name}:${k - 1}`), 1, s.name + "'".repeat(k));
  }
  // a signal by name and derivative → [block, port]
  const signal = (name, d) => {
    const key = `${name}:${d}`;
    if (memo.has(key)) return memo.get(key);
    let r;
    if (states.has(name)) {
      const s = states.get(name);
      r = d < s.order ? [integ.get(key), 1] : expression(s.rhs, s.name + "'".repeat(s.order), stateRow.get(name));
    } else if (defs.has(name)) {
      const s = defs.get(name);
      r = expression(s.rhs, s.name, band(s.rhs));
    } else if (name === 't') r = [B.add('Clock', 't', {}, 0, -1 - srcRows++), 1];
    else r = [sourceBlock(B, input, name, 0, -1 - srcRows++, ++portNo), 1];
    memo.set(key, r);
    return r;
  };
  // c*v, v*c, v/c, c*v*c … with exactly one signal factor → { v, coef }
  const factor = (n) => {
    const fs = [];
    const flat = (m, inv) => {
      if (m.k === 'bin' && m.op === '*') { flat(m.a, inv); flat(m.b, inv); }
      else if (m.k === 'bin' && m.op === '/' && !inv) { flat(m.a, false); flat(m.b, true); }
      else fs.push({ node: m, inv });
    };
    flat(n, false);
    const sig = fs.filter((f) => !isConst(f.node));
    if (sig.length !== 1 || sig[0].inv || sig[0].node.k !== 'var') return null;
    let num = null, den = null;
    for (const c of fs) {
      if (c === sig[0]) continue;
      if (c.inv) den = den ? { k: 'bin', op: '*', a: den, b: c.node } : c.node;
      else num = num ? { k: 'bin', op: '*', a: num, b: c.node } : c.node;
    }
    if (!num && !den) return { v: sig[0].node, coef: null };
    let coef = num || { k: 'num', v: 1 };
    if (den) coef = { k: 'bin', op: '/', a: coef, b: den };
    if (coef.k !== 'num' && !varsOf(coef).some((v) => !(v.name in CONSTS))) coef = { k: 'num', v: evalNum(coef, {}, 0) };
    return { v: sig[0].node, coef };
  };
  // a right-hand side as blocks: label = the signal it computes, r = its row band
  function expression(node, label, r) {
    const terms = termsOf(node);
    const consts = terms.filter((t) => isConst(t.node));
    const parts = []; // { sign, from }
    let sub = 0;
    for (const t of terms.filter((x) => !isConst(x.node))) {
      const f = factor(t.node);
      if (f) {
        const from = signal(f.v.name, f.v.d);
        let sign = t.sign, coef = f.coef;
        if (coef && coef.k === 'num' && coef.v < 0) { sign = -sign; coef = { k: 'num', v: -coef.v }; }
        if (coef && coef.k === 'neg') { sign = -sign; coef = coef.a; }
        if (!coef || (coef.k === 'num' && coef.v === 1)) parts.push({ sign, from });
        else {
          const g = B.add('Gain', `Gain_${tag(label)}`, { Gain: constText(coef) }, 2, r + sub++);
          B.wire(from[0], from[1], g, 1, print(f.v));
          parts.push({ sign, from: [g, 1] });
        }
        continue;
      }
      // anything else: an Fcn of the signals it reads (through a Mux when there are several)
      const vs = varsOf(t.node).filter((v) => !(pnames.has(v.name) && !v.d) && !(v.name in CONSTS));
      const idx = new Map(vs.map((v, i) => [`${v.name}:${v.d}`, i + 1]));
      const text = print(t.node, (v) => (idx.has(`${v.name}:${v.d}`) ? `u(${idx.get(`${v.name}:${v.d}`)})` : v.name));
      const rr = r + sub++;
      const fcn = B.add('Fcn', `Fcn_${tag(label)}`, { Expr: text }, 2, rr);
      if (vs.length === 1) { const from = signal(vs[0].name, vs[0].d); B.wire(from[0], from[1], fcn, 1, print({ k: 'var', ...vs[0] })); }
      else {
        const mux = B.add('Mux', `Mux_${tag(label)}`, { Inputs: String(vs.length) }, 1, rr);
        vs.forEach((v, i) => { const from = signal(v.name, v.d); B.wire(from[0], from[1], mux, i + 1, print({ k: 'var', ...v })); });
        B.wire(mux, 1, fcn, 1);
      }
      parts.push({ sign: t.sign, from: [fcn, 1] });
    }
    if (consts.length) {
      const sum0 = consts.reduce((acc, t) => (acc ? { k: 'bin', op: t.sign > 0 ? '+' : '-', a: acc, b: t.node } : t.sign > 0 ? t.node : { k: 'neg', a: t.node }), null);
      const c = B.add('Constant', `Const_${tag(label)}`, { Value: constText(sum0) }, 2, r + sub++);
      parts.push({ sign: 1, from: [c, 1] });
    }
    const mid = r + Math.floor((Math.max(2, sub) - 1) / 2);
    if (parts.length === 1 && parts[0].sign > 0) return parts[0].from;
    if (parts.length === 1) {
      const g = B.add('Gain', `Neg_${tag(label)}`, { Gain: '-1' }, 3, mid);
      B.wire(parts[0].from[0], parts[0].from[1], g, 1);
      return [g, 1];
    }
    const sum = B.add('Sum', `Sum_${tag(label)}`, { Inputs: parts.map((p) => (p.sign > 0 ? '+' : '-')).join('') }, 3, mid);
    parts.forEach((p, i) => B.wire(p.from[0], p.from[1], sum, i + 1));
    return [sum, 1];
  }
  // each state's highest derivative feeds its first integrator
  for (const s of spec.states) {
    const from = signal(s.name, s.order);
    B.wire(from[0], from[1], integ.get(`${s.name}:${s.order - 1}`), 1, s.name + "'".repeat(s.order));
  }
  sinks(B, spec.outputs.map((n) => ({ name: n, from: signal(n, 0) })), endCol, 0);
}

function buildTF(spec, B, input) {
  const src = sourceBlock(B, input, 'u', 0, Math.max(0, (spec.tfs.length - 1) / 2), 1);
  const shown = spec.tfs.map((t, i) => {
    const params = { Numerator: polyText(t.num), Denominator: polyText(t.den) };
    if (spec.variable === 'z') params.SampleTime = fmtNum(spec.ts);
    const b = B.add(spec.variable === 'z' ? 'DiscreteTransferFcn' : 'TransferFcn', t.name, params, 2, i);
    B.wire(src, 1, b, 1, 'u');
    return { name: t.name, from: [b, 1] };
  });
  sinks(B, shown, 3, 0);
}

function buildSS(spec, B, input) {
  const ssParams = { A: matText(spec.A), B: matText(spec.B), C: matText(spec.C), D: matText(spec.D), InitialCondition: spec.x0 ? matText(spec.x0.map((x) => [x])) : '0' };
  if (spec.ts) ssParams.SampleTime = fmtNum(spec.ts);
  const ss = B.add(spec.ts ? 'DiscreteStateSpace' : 'StateSpace', 'StateSpace', ssParams, 2, Math.max(0, (spec.m - 1) / 2));
  if (spec.m === 1) B.wire(sourceBlock(B, input, 'u', 0, 0, 1), 1, ss, 1, 'u');
  else {
    const mux = B.add('Mux', 'Mux', { Inputs: String(spec.m) }, 1, (spec.m - 1) / 2);
    spec.inputs.forEach((n, i) => B.wire(sourceBlock(B, input, n, 0, i, i + 1), 1, mux, i + 1, n));
    B.wire(mux, 1, ss, 1, 'u');
  }
  sinks(B, [{ name: 'y', from: [ss, 1] }], 3, Math.max(0, (spec.m - 1) / 2));
}

/**
 * A new model from a spec (parseEquations, tfSpec, ssSpec). opts: name ('eqmodel'), input (step | sine |
 * constant | inport: what the undefined names become), stopTime ('10'), description.
 * → { model, info: { kind, states, inputs, params, outputs, blocks, lines, tfs? } }
 */
export function specModel(spec, opts = {}) {
  const input = EQ_INPUTS.includes(opts.input) ? opts.input : 'step';
  const name = opts.name || 'eqmodel';
  if (!/^[A-Za-z]\w*$/.test(name)) throw err('name', `'${name}' is not a valid model name.`);
  const B = builder(name);
  if (spec.kind === 'ode') buildODE(spec, B, input);
  else if (spec.kind === 'tf') buildTF(spec, B, input);
  else buildSS(spec, B, input);
  B.layout();
  // sources sit on rows above 0: move everything to the top left
  const bb = systemBounds(B.sys);
  if (bb) { const dx = X0 - bb.x, dy = Y0 - bb.y; for (const b of B.sys.blocks) { b.x += dx; b.y += dy; } }
  const model = B.model;
  model.workspace = spec.params.map((p) => ({ name: p.name, value: print(p.rhs) }));
  model.settings.stopTime = String(opts.stopTime || '10');
  if (opts.description) model.meta.description = String(opts.description).trim();
  const info = {
    kind: spec.kind,
    states: spec.kind === 'ode' ? spec.states.map((s) => ({ name: s.name, order: s.order })) : spec.kind === 'ss' ? Array.from({ length: spec.n }, (_, i) => ({ name: `x${i + 1}`, order: 1 })) : [],
    inputs: spec.inputs.slice(),
    params: spec.params.map((p) => ({ name: p.name, value: print(p.rhs) })),
    outputs: spec.outputs.slice(),
    blocks: model.root.blocks.length,
    lines: model.root.lines.length,
  };
  if (spec.kind === 'tf') info.tfs = spec.tfs.map((t) => ({ name: t.name, num: t.num, den: t.den, ts: spec.ts }));
  if (spec.kind === 'ss') Object.assign(info, { n: spec.n, m: spec.m, p: spec.p, ts: spec.ts });
  return { model, info };
}

/** A new model from equation text: parseEquations(text, { kind }) then specModel (opts as there, plus kind). */
export function equationModel(text, opts = {}) {
  return specModel(parseEquations(text, { kind: opts.kind || 'auto' }), { ...opts, description: text });
}

/**
 * Adds the blocks and lines of a built model (equationModel(...).model) to `sys` of `model`, below what is
 * there, and its parameters to the model workspace (a parameter of the same name gets the new value).
 * → the new block ids.
 */
export function insertEquationModel(model, sys, built) {
  const part = JSON.parse(JSON.stringify({ blocks: built.root.blocks, lines: built.root.lines, notes: [] }));
  reassignIds(model, part);
  const used = new Set(sys.blocks.map((b) => b.name));
  for (const b of part.blocks) {
    if (!used.has(b.name)) { used.add(b.name); continue; }
    const stem = b.name.replace(/\d+$/, '');
    let i = 1; while (used.has(stem + i)) i++;
    b.name = stem + i; used.add(b.name);
  }
  const here = systemBounds(sys);
  const there = systemBounds(part);
  if (here && there) {
    const dx = here.x - there.x, dy = here.y + here.h + 60 - there.y;
    for (const b of part.blocks) { b.x += dx; b.y += dy; }
    const move = (s) => { s.points = (s.points || []).map(([x, y]) => [x + dx, y + dy]); (s.branches || []).forEach(move); };
    part.lines.forEach(move);
  }
  sys.blocks.push(...part.blocks);
  sys.lines.push(...part.lines);
  model.workspace = Array.isArray(model.workspace) ? model.workspace : [];
  for (const w of built.workspace || []) {
    const at = model.workspace.findIndex((x) => x.name === w.name);
    if (at >= 0) model.workspace[at] = { ...w }; else model.workspace.push({ ...w });
  }
  return part.blocks.map((b) => b.id);
}

// the parser for eqhint.js (suggestions for a failed parse)
export const eqParts = { statements, parseStatement, print, varsOf, evalNum, FUNCS, CONSTS, fmtNum, matText };
