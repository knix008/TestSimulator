// A small, safe expression language for equations and rates:
//   numbers, names (Inventory, queue1.length, pop.Infected), + - * / ^ %,
//   < <= > >= == != && || !, a ? b : c, and functions (min, max, if, step …).
// System dynamics equations, source rates, conditions and display blocks use it.
// compile() parses once; the result evaluates against a lookup(name) function.

const FUNCTIONS = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: Math.abs,
  sqrt: (x) => Math.sqrt(Math.max(0, x)),
  exp: Math.exp,
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  pow: (a, b) => a ** b,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  clamp: (x, a, b) => Math.min(Math.max(x, a), b),
  if: (c, a, b) => (c ? a : b),
  // System dynamics test inputs (t = current time; the evaluator passes it in).
  step: (height, start, t) => (t >= start ? height : 0),
  pulse: (height, start, interval, t) => (t >= start && (interval > 0 ? ((t - start) % interval) < 1e-9 + (interval * 0.001) : Math.abs(t - start) < 1e-9) ? height : 0),
  ramp: (slope, start, t) => (t > start ? slope * (t - start) : 0),
  sinwave: (amplitude, period, t) => amplitude * Math.sin((2 * Math.PI * t) / (period || 1)),
};
/** Functions that need the current time as their last argument. */
const TIMED = new Set(['step', 'pulse', 'ramp', 'sinwave']);
/** Functions that draw random numbers (the evaluator passes its random stream). */
const RANDOM = new Set(['random', 'uniform', 'normal', 'exponential', 'triangular', 'poisson']);
export const FUNCTION_NAMES = [...Object.keys(FUNCTIONS), ...RANDOM];
export const CONSTANTS = { pi: Math.PI, e: Math.E, true: 1, false: 0, inf: Infinity };

function tokenize(text) {
  const tokens = [];
  const s = String(text ?? '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new SyntaxError(`Bad number at ${i}`);
      tokens.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_À-￿]/.test(c)) {
      const m = /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*(\.[A-Za-z_À-￿][A-Za-z0-9_À-￿]*)*/.exec(s.slice(i));
      tokens.push({ t: 'name', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^%()<>!?:,'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
    if (c === '=') { tokens.push({ t: 'op', v: '==' }); i += 1; continue; }
    throw new SyntaxError(`Unexpected '${c}'`);
  }
  return tokens;
}

function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const take = (v) => { const tok = tokens[p]; if (v != null && (!tok || tok.v !== v)) throw new SyntaxError(`Expected '${v}'`); p += 1; return tok; };
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;

  function ternary() {
    const cond = or();
    if (isOp('?')) { take('?'); const a = ternary(); take(':'); const b = ternary(); return { k: 'if', c: cond, a, b }; }
    return cond;
  }
  function or() { let l = and(); while (isOp('||')) { take(); l = { k: 'bin', o: '||', l, r: and() }; } return l; }
  function and() { let l = cmp(); while (isOp('&&')) { take(); l = { k: 'bin', o: '&&', l, r: cmp() }; } return l; }
  function cmp() {
    let l = add();
    while (['<', '<=', '>', '>=', '==', '!='].some(isOp)) { const o = take().v; l = { k: 'bin', o, l, r: add() }; }
    return l;
  }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const o = take().v; l = { k: 'bin', o, l, r: mul() }; } return l; }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const o = take().v; l = { k: 'bin', o, l, r: unary() }; } return l; }
  function unary() {
    if (isOp('-')) { take(); return { k: 'neg', a: unary() }; }
    if (isOp('+')) { take(); return unary(); }
    if (isOp('!')) { take(); return { k: 'not', a: unary() }; }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp('^')) { take(); return { k: 'bin', o: '^', l: base, r: unary() }; }
    return base;
  }
  function atom() {
    const tok = peek();
    if (!tok) throw new SyntaxError('Unexpected end');
    if (tok.t === 'num') { take(); return { k: 'num', v: tok.v }; }
    if (tok.t === 'name') {
      take();
      if (isOp('(')) {
        take('(');
        const args = [];
        if (!isOp(')')) { args.push(ternary()); while (isOp(',')) { take(','); args.push(ternary()); } }
        take(')');
        const name = tok.v.toLowerCase();
        if (!FUNCTIONS[name] && !RANDOM.has(name)) throw new SyntaxError(`Unknown function ${tok.v}`);
        return { k: 'call', f: name, args };
      }
      const lower = tok.v.toLowerCase();
      if (Object.hasOwn(CONSTANTS, lower)) return { k: 'num', v: CONSTANTS[lower] };
      return { k: 'ref', n: tok.v };
    }
    if (isOp('(')) { take('('); const e = ternary(); take(')'); return e; }
    throw new SyntaxError(`Unexpected '${tok.v}'`);
  }
  const ast = ternary();
  if (p < tokens.length) throw new SyntaxError(`Unexpected '${tokens[p].v}'`);
  return ast;
}

function collectRefs(node, out) {
  if (!node) return out;
  switch (node.k) {
    case 'ref': out.add(node.n); break;
    case 'bin': collectRefs(node.l, out); collectRefs(node.r, out); break;
    case 'neg': case 'not': collectRefs(node.a, out); break;
    case 'if': collectRefs(node.c, out); collectRefs(node.a, out); collectRefs(node.b, out); break;
    case 'call': for (const a of node.args) collectRefs(a, out); break;
    default: break;
  }
  return out;
}

function evaluateNode(node, ctx) {
  switch (node.k) {
    case 'num': return node.v;
    case 'ref': return ctx.lookup(node.n);
    case 'neg': return -evaluateNode(node.a, ctx);
    case 'not': return evaluateNode(node.a, ctx) ? 0 : 1;
    case 'if': return evaluateNode(node.c, ctx) ? evaluateNode(node.a, ctx) : evaluateNode(node.b, ctx);
    case 'bin': {
      const l = evaluateNode(node.l, ctx);
      if (node.o === '&&') return l ? (evaluateNode(node.r, ctx) ? 1 : 0) : 0;
      if (node.o === '||') return l ? 1 : (evaluateNode(node.r, ctx) ? 1 : 0);
      const r = evaluateNode(node.r, ctx);
      switch (node.o) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? (l === 0 ? 0 : Infinity * Math.sign(l)) : l / r;
        case '%': return r === 0 ? 0 : l % r;
        case '^': return l ** r;
        case '<': return l < r ? 1 : 0;
        case '<=': return l <= r ? 1 : 0;
        case '>': return l > r ? 1 : 0;
        case '>=': return l >= r ? 1 : 0;
        case '==': return Math.abs(l - r) < 1e-12 ? 1 : 0;
        case '!=': return Math.abs(l - r) >= 1e-12 ? 1 : 0;
        default: return NaN;
      }
    }
    case 'call': {
      const args = node.args.map((a) => evaluateNode(a, ctx));
      if (RANDOM.has(node.f)) {
        const r = ctx.random;
        if (!r) return 0;
        switch (node.f) {
          case 'random': return r.next();
          case 'uniform': return r.uniform(args[0] ?? 0, args[1] ?? 1);
          case 'normal': return r.normal(args[0] ?? 0, args[1] ?? 1);
          case 'exponential': return r.exponential(args[0] ?? 1);
          case 'triangular': { const [a = 0, c = 0.5, b = 1] = args; const u = r.next(); const f = (c - a) / ((b - a) || 1); return u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c)); }
          case 'poisson': return r.poisson(args[0] ?? 1);
          default: return 0;
        }
      }
      if (TIMED.has(node.f)) args.push(ctx.time ?? 0);
      return FUNCTIONS[node.f](...args);
    }
    default: return NaN;
  }
}

const cache = new Map();
/**
 * Parses `text` once (cached): { ok, error, refs:Set, eval(lookup, { time, random }) }.
 * A plain number is fast-pathed.
 */
export function compile(text) {
  const key = String(text ?? '').trim();
  if (cache.has(key)) return cache.get(key);
  let result;
  if (key === '') result = { ok: false, error: 'empty', refs: new Set(), eval: () => 0, constant: true };
  else if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(key)) {
    const v = Number(key);
    result = { ok: true, refs: new Set(), eval: () => v, constant: true, value: v };
  } else {
    try {
      const ast = parse(tokenize(key));
      const refs = collectRefs(ast, new Set());
      result = { ok: true, refs, ast, constant: refs.size === 0 && !JSON.stringify(ast).includes('"call"'), eval: (lookup, ctx = {}) => evaluateNode(ast, { lookup, time: ctx.time, random: ctx.random }) };
    } catch (error) {
      result = { ok: false, error: error.message, refs: new Set(), eval: () => NaN };
    }
  }
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}

/** Evaluates with a plain object of values (tests, previews). Unknown names are 0. */
export function evaluate(text, values = {}, ctx = {}) {
  const c = compile(text);
  return c.eval((name) => (Object.hasOwn(values, name) ? values[name] : 0), ctx);
}

/** Names allowed as identifiers in equations (SD element names). */
export const isIdentifier = (name) => /^[A-Za-z_À-￿][A-Za-z0-9_À-￿]*$/.test(String(name ?? '')) && !Object.hasOwn(CONSTANTS, String(name).toLowerCase()) && !FUNCTIONS[String(name).toLowerCase()];
