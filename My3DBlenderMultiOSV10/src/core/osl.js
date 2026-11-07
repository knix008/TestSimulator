// Open Shading Language, the part that fits a script node: a shader's parameters become sockets, its body runs at each shading
// point. Types float, int, color, point, vector, normal; if, for, while, functions from a built-in list; arithmetic works on
// numbers and triples alike, as in OSL. Closures (emission(), diffuse()…) are not here: a shader computes colours and values.
import { noise3 } from './noise.js';

const KEYWORDS = new Set(['shader', 'surface', 'output', 'float', 'int', 'color', 'point', 'vector', 'normal', 'string', 'if', 'else', 'for', 'while', 'return']);
const TYPES = new Set(['float', 'int', 'color', 'point', 'vector', 'normal', 'string']);

function tokenize(src) {
  const out = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith('//', i)) { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e < 0) throw new Error(`Line ${line}: unterminated comment`); line += src.slice(i, e).split('\n').length - 1; i = e + 2; continue; }
    const num = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(src.slice(i, i + 40));
    if (num) { out.push({ t: 'NUM', v: Number(num[0]), line }); i += num[0].length; continue; }
    const name = /^[A-Za-z_]\w*/.exec(src.slice(i, i + 120));
    if (name) { out.push({ t: KEYWORDS.has(name[0]) ? name[0] : 'NAME', v: name[0], line }); i += name[0].length; continue; }
    if (c === '"') { const e = src.indexOf('"', i + 1); if (e < 0) throw new Error(`Line ${line}: unterminated string`); out.push({ t: 'STR', v: src.slice(i + 1, e), line }); i = e + 1; continue; }
    const op = ['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--'].find((o) => src.startsWith(o, i)) ?? c;
    if (!'+-*/%=<>!(){}[],;?:.&|'.includes(op[0])) throw new Error(`Line ${line}: unexpected '${c}'`);
    out.push({ t: op, line });
    i += op.length;
  }
  out.push({ t: 'EOF', line });
  return out;
}

const isTriple = (t) => t === 'color' || t === 'point' || t === 'vector' || t === 'normal';

/** Compiles a shader. Returns { name, inputs: [{name,type,def}], outputs: [{name,type,def}], run(inputs, globals) → outputs }. */
export function compileOSL(source) {
  const toks = tokenize(source);
  let p = 0;
  const is = (t) => toks[p].t === t;
  const accept = (t) => (toks[p].t === t ? toks[p++] : null);
  const fail = (m) => { throw new Error(`Line ${toks[p].line}: ${m}`); };
  const expect = (t) => toks[p].t === t ? toks[p++] : fail(`expected '${t}', found '${toks[p].v ?? toks[p].t}'`);

  const primary = () => {
    const tok = toks[p];
    if (accept('NUM')) return { k: 'num', v: tok.v };
    if (accept('STR')) return { k: 'str', v: tok.v };
    if (accept('(')) { const e = expression(); expect(')'); return e; }
    if (TYPES.has(tok.t) || tok.t === 'NAME') {
      p++;
      if (accept('(')) {
        const args = [];
        while (!is(')')) { args.push(expression()); if (!accept(',')) break; }
        expect(')');
        return { k: 'call', name: tok.v, args };
      }
      if (tok.t !== 'NAME') fail(`unexpected '${tok.v}'`);
      return { k: 'var', name: tok.v };
    }
    return fail(`unexpected '${tok.v ?? tok.t}'`);
  };
  const postfix = () => {
    let e = primary();
    for (;;) {
      if (accept('[')) { const i = expression(); expect(']'); e = { k: 'index', e, i }; } else if (accept('.')) { const name = expect('NAME').v; e = { k: 'index', e, i: { k: 'num', v: { x: 0, y: 1, z: 2, r: 0, g: 1, b: 2 }[name] ?? fail(`no component '${name}'`) } }; } else return e;
    }
  };
  const unary = () => {
    if (accept('-')) return { k: 'neg', e: unary() };
    if (accept('!')) return { k: 'not', e: unary() };
    if (accept('+')) return unary();
    return postfix();
  };
  const binary = (next, ops) => () => { let l = next(); while (ops.includes(toks[p].t)) { const op = toks[p++].t; l = { k: 'bin', op, l, r: next() }; } return l; };
  const mul = binary(unary, ['*', '/', '%']);
  const add = binary(mul, ['+', '-']);
  const rel = binary(add, ['<', '>', '<=', '>=']);
  const eq = binary(rel, ['==', '!=']);
  const and = binary(eq, ['&&']);
  const or = binary(and, ['||']);
  const expression = () => {
    const c = or();
    if (accept('?')) { const a = expression(); expect(':'); return { k: 'ifexp', c, a, b: expression() }; }
    return c;
  };
  const statement = () => {
    if (accept('{')) { const body = []; while (!is('}')) body.push(statement()); expect('}'); return { k: 'block', body }; }
    if (accept('if')) { expect('('); const c = expression(); expect(')'); const a = statement(); return { k: 'if', c, a, b: accept('else') ? statement() : null }; }
    if (accept('while')) { expect('('); const c = expression(); expect(')'); return { k: 'while', c, body: statement() }; }
    if (accept('for')) {
      expect('(');
      const init = is(';') ? null : simple();
      expect(';');
      const c = is(';') ? null : expression();
      expect(';');
      const step = is(')') ? null : simple();
      expect(')');
      return { k: 'for', init, c, step, body: statement() };
    }
    if (accept('return')) { expect(';'); return { k: 'return' }; }
    if (accept(';')) return { k: 'block', body: [] };
    const s = simple();
    expect(';');
    return s;
  };
  const simple = () => {
    if (TYPES.has(toks[p].t) && toks[p + 1].t === 'NAME') {
      const type = toks[p++].t;
      const decls = [];
      do { const name = expect('NAME').v; decls.push({ name, init: accept('=') ? expression() : null }); } while (accept(','));
      return { k: 'decl', type, decls };
    }
    const target = postfix();
    if (accept('++')) return { k: 'assign', target, op: '+', e: { k: 'num', v: 1 } };
    if (accept('--')) return { k: 'assign', target, op: '-', e: { k: 'num', v: 1 } };
    for (const [tok, op] of [['=', null], ['+=', '+'], ['-=', '-'], ['*=', '*'], ['/=', '/']]) if (accept(tok)) return { k: 'assign', target, op, e: expression() };
    return { k: 'expr', e: target };
  };

  if (!accept('shader') && !accept('surface')) fail("a shader starts with 'shader name(...)'");
  const name = expect('NAME').v;
  expect('(');
  const inputs = [];
  const outputs = [];
  while (!is(')')) {
    const isOutput = Boolean(accept('output'));
    const type = toks[p].t;
    if (!TYPES.has(type)) fail('expected a type');
    p++;
    const param = expect('NAME').v;
    const init = accept('=') ? expression() : null;
    (isOutput ? outputs : inputs).push({ name: param, type, init });
    if (!accept(',')) break;
  }
  expect(')');
  expect('{');
  const body = [];
  while (!is('}')) body.push(statement());
  expect('}');
  if (!is('EOF')) fail('unexpected text after the shader');
  // Check every function and name now: an error belongs at compile time, not on the millionth pixel.
  const FUNCTIONS = makeFunctions();
  const scan = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(scan); return; }
    if (n.k === 'call' && !FUNCTIONS[n.name]) throw new Error(`Unknown function '${n.name}'`);
    Object.values(n).forEach(scan);
  };
  scan(body);
  scan(inputs);
  scan(outputs);

  const vars0 = (globals) => ({ P: globals.P, N: globals.N, I: globals.I ?? [0, 0, 0], u: globals.u, v: globals.v, M_PI: Math.PI });
  const evalInit = (init, type, vars) => { const v = init ? evaluate(init, vars, FUNCTIONS) : 0; return coerce(v, type); };
  const defaults = (list) => list.map((x) => ({ name: x.name, type: x.type, def: evalInit(x.init, x.type, vars0({ P: [0, 0, 0], N: [0, 0, 1], u: 0, v: 0 })) }));
  return {
    name,
    inputs: defaults(inputs),
    outputs: defaults(outputs),
    run(values, globals) {
      const vars = vars0(globals);
      for (const x of inputs) vars[x.name] = values[x.name] !== undefined ? coerce(values[x.name], x.type) : evalInit(x.init, x.type, vars);
      for (const x of outputs) vars[x.name] = evalInit(x.init, x.type, vars);
      const state = { steps: 0 };
      try {
        for (const s of body) execute(s, vars, FUNCTIONS, state);
      } catch (e) {
        if (e !== RETURN) throw e;
      }
      return Object.fromEntries(outputs.map((x) => [x.name, coerce(vars[x.name], x.type)]));
    },
  };
}

const RETURN = Symbol('return');
const coerce = (v, type) => {
  if (isTriple(type)) return Array.isArray(v) ? v : [v, v, v];
  if (type === 'int') return Math.trunc(Array.isArray(v) ? (v[0] + v[1] + v[2]) / 3 : v);
  if (type === 'string') return v;
  return Array.isArray(v) ? (v[0] + v[1] + v[2]) / 3 : v;
};
const zip = (a, b, fn) => {
  const [aa, ba] = [Array.isArray(a), Array.isArray(b)];
  if (!aa && !ba) return fn(a, b);
  return [0, 1, 2].map((k) => fn(aa ? a[k] : a, ba ? b[k] : b));
};
const map1 = (fn) => (a) => (Array.isArray(a) ? a.map(fn) : fn(a));
const map2 = (fn) => (a, b) => zip(a, b, fn);

function makeFunctions() {
  const triple = (args) => (args.length === 1 ? (Array.isArray(args[0]) ? [...args[0]] : [args[0], args[0], args[0]]) : [args[0], args[1], args[2]]);
  return {
    color: (...a) => triple(a), point: (...a) => triple(a), vector: (...a) => triple(a), normal: (...a) => triple(a), float: (a) => (Array.isArray(a) ? (a[0] + a[1] + a[2]) / 3 : a), int: (a) => Math.trunc(a),
    sin: map1(Math.sin), cos: map1(Math.cos), tan: map1(Math.tan), asin: map1(Math.asin), acos: map1(Math.acos), atan: map1(Math.atan), atan2: map2(Math.atan2), sqrt: map1((x) => Math.sqrt(Math.max(0, x))), exp: map1(Math.exp), log: map1((x) => Math.log(Math.max(1e-30, x))),
    abs: map1(Math.abs), fabs: map1(Math.abs), floor: map1(Math.floor), ceil: map1(Math.ceil), round: map1(Math.round), fract: map1((x) => x - Math.floor(x)), sign: map1(Math.sign),
    pow: map2((a, b) => (a < 0 && b % 1 ? 0 : a ** b)), min: map2(Math.min), max: map2(Math.max), mod: map2((a, b) => (b ? a - b * Math.floor(a / b) : 0)), fmod: map2((a, b) => (b ? a % b : 0)),
    clamp: (x, a, b) => zip(zip(x, a, Math.max), b, Math.min),
    mix: (a, b, t) => {
      if (!Array.isArray(a) && !Array.isArray(b) && !Array.isArray(t)) return a + (b - a) * t;
      const at = (v, k) => (Array.isArray(v) ? v[k] : v);
      return [0, 1, 2].map((k) => at(a, k) + (at(b, k) - at(a, k)) * at(t, k));
    },
    step: map2((e, x) => (x < e ? 0 : 1)),
    smoothstep: (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a || 1))); return k * k * (3 - 2 * k); },
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    length: (a) => Math.hypot(a[0], a[1], a[2]),
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    normalize: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    radians: map1((x) => (x * Math.PI) / 180), degrees: map1((x) => (x * 180) / Math.PI),
    // noise("perlin", p) or noise(p), like OSL; a triple result when assigned to a colour goes through coerce.
    noise: (...a) => { const q = typeof a[0] === 'string' ? a[1] : a[0]; const [x, y, z] = Array.isArray(q) ? q : [q, typeof a[1] === 'number' ? a[1] : 0, 0]; return noise3(x, y, z); },
  };
}

function evaluate(n, vars, fns) {
  switch (n.k) {
    case 'num': case 'str': return n.v;
    case 'var':
      if (!(n.name in vars)) throw new Error(`Unknown name '${n.name}'`);
      return vars[n.name];
    case 'neg': return map1((x) => -x)(evaluate(n.e, vars, fns));
    case 'not': return evaluate(n.e, vars, fns) ? 0 : 1;
    case 'index': return evaluate(n.e, vars, fns)[evaluate(n.i, vars, fns)];
    case 'ifexp': return evaluate(n.c, vars, fns) ? evaluate(n.a, vars, fns) : evaluate(n.b, vars, fns);
    case 'call': return fns[n.name](...n.args.map((a) => evaluate(a, vars, fns)));
    case 'bin': {
      if (n.op === '&&') return evaluate(n.l, vars, fns) && evaluate(n.r, vars, fns) ? 1 : 0;
      if (n.op === '||') return evaluate(n.l, vars, fns) || evaluate(n.r, vars, fns) ? 1 : 0;
      const [a, b] = [evaluate(n.l, vars, fns), evaluate(n.r, vars, fns)];
      switch (n.op) {
        case '+': return zip(a, b, (x, y) => x + y);
        case '-': return zip(a, b, (x, y) => x - y);
        case '*': return zip(a, b, (x, y) => x * y);
        case '/': return zip(a, b, (x, y) => (y ? x / y : 0));
        case '%': return zip(a, b, (x, y) => (y ? x % y : 0));
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return Array.isArray(a) ? (a.every((x, k) => x === b[k]) ? 1 : 0) : a === b ? 1 : 0;
        case '!=': return Array.isArray(a) ? (a.some((x, k) => x !== b[k]) ? 1 : 0) : a !== b ? 1 : 0;
        default:
      }
      break;
    }
    default:
  }
  throw new Error(`Cannot evaluate ${n.k}`);
}

function execute(s, vars, fns, state) {
  switch (s.k) {
    case 'block': for (const x of s.body) execute(x, vars, fns, state); return;
    case 'decl': for (const d of s.decls) vars[d.name] = coerce(d.init ? evaluate(d.init, vars, fns) : 0, s.type); return;
    case 'assign': {
      const value = evaluate(s.e, vars, fns);
      if (s.target.k === 'var') {
        if (!(s.target.name in vars)) throw new Error(`Unknown name '${s.target.name}'`);
        vars[s.target.name] = s.op ? zip(vars[s.target.name], value, ({ '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => (b ? a / b : 0) })[s.op]) : value;
      } else {
        const base = evaluate(s.target.e, vars, fns);
        const i = evaluate(s.target.i, vars, fns);
        base[i] = s.op ? ({ '+': base[i] + value, '-': base[i] - value, '*': base[i] * value, '/': value ? base[i] / value : 0 })[s.op] : value;
      }
      return;
    }
    case 'if': if (evaluate(s.c, vars, fns)) execute(s.a, vars, fns, state); else if (s.b) execute(s.b, vars, fns, state); return;
    case 'while': while (evaluate(s.c, vars, fns)) { if (++state.steps > 10000) throw new Error('A loop ran too long'); execute(s.body, vars, fns, state); } return;
    case 'for': if (s.init) execute(s.init, vars, fns, state); while (!s.c || evaluate(s.c, vars, fns)) { if (++state.steps > 10000) throw new Error('A loop ran too long'); execute(s.body, vars, fns, state); if (s.step) execute(s.step, vars, fns, state); } return;
    case 'return': throw RETURN;
    case 'expr': evaluate(s.e, vars, fns); return;
    default: throw new Error(`Cannot run ${s.k}`);
  }
}

const compiled = new Map();
/** Compiled once for each source text: { shader } or { error }. */
export function oslShader(source) {
  if (!compiled.has(source)) {
    if (compiled.size > 64) compiled.clear();
    try { compiled.set(source, { shader: compileOSL(source) }); } catch (error) { compiled.set(source, { error: error.message }); }
  }
  return compiled.get(source);
}

export const DEFAULT_OSL = `shader Checker(float Scale = 5, color Dark = color(0.05, 0.05, 0.07), color Light = color(0.9, 0.85, 0.7), output color Color = 0, output float Fac = 0)
{
    point p = P * Scale;
    float check = mod(floor(p[0]) + floor(p[1]) + floor(p[2]), 2);
    Fac = check;
    Color = mix(Dark, Light, check);
}
`;
