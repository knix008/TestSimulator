// The field calculator and histogram (ParaView's Calculator and Histogram filters) over a decoded result: an
// expression of the result's fields per cell, e.g. "T + 273.15", "sqrt(qx^2 + qy^2)", "max(T - Tamb, 0)", becomes a
// new scalar field that the viewport can show; a histogram counts the cells (= volume, the grid is uniform) per
// value bin. Expressions are parsed by a small recursive-descent parser — never eval — so a model file or a typed
// expression cannot run code. Pure functions, unit-tested in Node.
import { field, magnitude } from './result.js';

const FUNCTIONS = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, ln: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

/** Tokens of an expression: numbers, names, operators and parentheses / commas. */
function tokenize(text) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^%(),<>]=?|==|!=))/y;
  let at = 0;
  const src = String(text);
  while (at < src.length) {
    if (/^\s*$/.test(src.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(src);
    if (!m) throw new Error(`unexpected "${src.slice(at).trim()[0]}" at ${at + 1}`);
    at = re.lastIndex;
    if (m[1] != null) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] != null) tokens.push({ type: 'name', value: m[2] });
    else tokens.push({ type: 'op', value: m[3] === '**' ? '^' : m[3] });
  }
  return tokens;
}

/**
 * Compiles an expression into (vars) => number. Grammar: comparison (< <= > >= == !=, giving 1 or 0) over sums,
 * products (* / %), unary minus, powers (^, right-associative), calls name(args), names and numbers.
 * Returns { evaluate, names } (the variable names it reads).
 */
export function compileExpression(text) {
  const tokens = tokenize(text);
  if (!tokens.length) throw new Error('the expression is empty');
  let i = 0;
  const names = new Set();
  const peek = () => tokens[i];
  const take = (value) => {
    const t = tokens[i];
    if (value !== undefined && (!t || t.value !== value)) throw new Error(`expected "${value}"${t ? ` but found "${t.value}"` : ' at the end'}`);
    i++;
    return t;
  };
  const primary = () => {
    const t = take();
    if (!t) throw new Error('the expression ends too early');
    if (t.type === 'num') return () => t.value;
    if (t.value === '(') { const e = comparison(); take(')'); return e; }
    if (t.type === 'name') {
      if (peek()?.value === '(') {
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new Error(`unknown function ${t.value}()`);
        take('(');
        const args = [];
        if (peek()?.value !== ')') { args.push(comparison()); while (peek()?.value === ',') { take(','); args.push(comparison()); } }
        take(')');
        return (v) => fn(...args.map((a) => a(v)));
      }
      if (t.value in CONSTANTS) return () => CONSTANTS[t.value];
      names.add(t.value);
      return (v) => v[t.value];
    }
    throw new Error(`unexpected "${t.value}"`);
  };
  const power = () => {
    const base = primary();
    if (peek()?.value === '^') { take('^'); const exp = unary(); return (v) => base(v) ** exp(v); }
    return base;
  };
  const unary = () => {
    if (peek()?.value === '-') { take('-'); const e = unary(); return (v) => -e(v); }
    if (peek()?.value === '+') { take('+'); return unary(); }
    return power();
  };
  const product = () => {
    let left = unary();
    while (['*', '/', '%'].includes(peek()?.value)) {
      const op = take().value;
      const a = left; const b = unary();
      left = op === '*' ? (v) => a(v) * b(v) : op === '/' ? (v) => a(v) / b(v) : (v) => a(v) % b(v);
    }
    return left;
  };
  const sum = () => {
    let left = product();
    while (['+', '-'].includes(peek()?.value)) {
      const op = take().value;
      const a = left; const b = product();
      left = op === '+' ? (v) => a(v) + b(v) : (v) => a(v) - b(v);
    }
    return left;
  };
  const comparison = () => {
    const left = sum();
    const op = peek()?.value;
    if (!['<', '<=', '>', '>=', '==', '!='].includes(op)) return left;
    take();
    const right = sum();
    const test = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b }[op];
    return (v) => (test(left(v), right(v)) ? 1 : 0);
  };
  const root = comparison();
  if (i < tokens.length) throw new Error(`unexpected "${tokens[i].value}"`);
  return { evaluate: root, names: [...names] };
}

/**
 * The variables a result offers per cell: every stored field of the frame (T, qx, qy, qz, u, v, w, p, vonMises,
 * dispX…, liquid, nut, V, J, qrad …), the magnitudes q, U, disp, the cell centre x, y, z (mm) and the constants
 * Tamb (model ambient, °C) and t (frame time, s). Returns { names, at(cell) → object, cells, mat }.
 */
export function resultVariables(result, { frame = 0, ambient = 25 } = {}) {
  const h = result.header;
  const g = h.grid;
  const arrays = {};
  for (const name of Object.keys(h.fields ?? {})) if (name !== 'mat') arrays[name] = field(result, name, frame);
  const mag = (...names) => (names.some((n) => arrays[n]) ? magnitude(...names.map((n) => arrays[n])) : null);
  if (!arrays.q) arrays.q = mag('qx', 'qy', 'qz');
  if (!arrays.U) arrays.U = mag('u', 'v', 'w');
  if (!arrays.disp) arrays.disp = mag('dispX', 'dispY', 'dispZ');
  for (const [key, list] of Object.entries(arrays)) if (!list) delete arrays[key];
  const mat = field(result, 'mat');
  const nz = g.dim === 3 ? g.nz : 1;
  const cells = g.nx * g.ny * nz;
  const t = h.times?.[frame] ?? 0;
  const names = [...Object.keys(arrays), 'x', 'y', 'z', 'Tamb', 't'];
  const vars = { Tamb: ambient, t };
  const at = (c) => {
    for (const key in arrays) vars[key] = arrays[key][c];
    const i = c % g.nx;
    const j = Math.floor(c / g.nx) % g.ny;
    const k = Math.floor(c / (g.nx * g.ny));
    vars.x = (i + 0.5) * g.dx;
    vars.y = (j + 0.5) * g.dy;
    vars.z = g.dim === 3 ? (k + 0.5) * g.dz : 0;
    return vars;
  };
  return { names, at, cells, mat };
}

/**
 * Evaluates an expression on every simulated cell (void cells, mat ≥ 255, get NaN).
 * Returns { values: Float32Array, min, max, mean, count, invalid (cells that gave NaN / ±∞) }.
 */
export function evaluateField(result, expression, options = {}) {
  const { evaluate, names } = compileExpression(expression);
  const vars = resultVariables(result, options);
  const unknown = names.filter((n) => !vars.names.includes(n));
  if (unknown.length) throw new Error(`unknown name${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} (available: ${vars.names.join(', ')})`);
  const values = new Float32Array(vars.cells);
  let min = Infinity; let max = -Infinity; let sum = 0; let count = 0; let invalid = 0;
  for (let c = 0; c < vars.cells; c++) {
    if (vars.mat && vars.mat[c] >= 255) { values[c] = NaN; continue; }
    const v = evaluate(vars.at(c));
    values[c] = v;
    if (!Number.isFinite(v)) { invalid++; continue; }
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  return { values, min: count ? min : NaN, max: count ? max : NaN, mean: count ? sum / count : NaN, count, invalid };
}

/**
 * Histogram of the finite values of simulated cells: `bins` equal bins over [lo, hi] (the data range unless given).
 * Returns { edges (bins + 1), counts, fraction (share of cells = of volume per bin), cumulative, total }.
 */
export function histogram(values, mat = null, { bins = 20, lo = null, hi = null } = {}) {
  let a = Infinity; let b = -Infinity;
  for (let i = 0; i < values.length; i++) {
    if (mat && mat[i] >= 255) continue;
    const v = values[i];
    if (Number.isFinite(v)) { if (v < a) a = v; if (v > b) b = v; }
  }
  const from = lo ?? (a === Infinity ? 0 : a);
  let to = hi ?? (b === -Infinity ? 1 : b);
  if (to <= from) to = from + 1;
  const n = Math.max(1, Math.round(bins));
  const counts = new Array(n).fill(0);
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    if (mat && mat[i] >= 255) continue;
    const v = values[i];
    if (!Number.isFinite(v) || v < from || v > to) continue;
    counts[Math.min(n - 1, Math.floor(((v - from) / (to - from)) * n))]++;
    total++;
  }
  const edges = Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
  let run = 0;
  return { edges, counts, fraction: counts.map((x) => (total ? x / total : 0)), cumulative: counts.map((x) => { run += x; return total ? run / total : 0; }), total };
}

/** CSV of a histogram: from, to, cells, fraction, cumulative. */
export function histogramCsv(hist, name = 'value', unit = '') {
  const label = unit ? `${name} (${unit})` : name;
  const rows = [`${label} from,${label} to,cells,fraction,cumulative`];
  hist.counts.forEach((c, k) => rows.push(`${hist.edges[k]},${hist.edges[k + 1]},${c},${hist.fraction[k]},${hist.cumulative[k]}`));
  return `${rows.join('\n')}\n`;
}
