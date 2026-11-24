// OpenSCAD values and their operators. A value is a JS number, boolean, string, undefined (undef), array (a
// vector), a Range or a FunctionValue. Number to text follows OpenSCAD 2021: six significant digits, trailing
// zeroes dropped, exponent form below 1e-5 and from 1e6 ("1e+06" is written "1e+6"). Trigonometry in degrees is
// exact at 0, 30, 45, 60, 90 … like OpenSCAD's degree_trig.

export class Range {
  constructor(begin, step, end) { this.begin = begin; this.step = step; this.end = end; }
  /** The values of the range (an empty list when the step does not lead from begin to end). */
  /** How many values (OpenSCAD RangeType::numValues; 4294967295 means "too many"). */
  get count() {
    const { begin, step, end } = this;
    if ([begin, step, end].some(Number.isNaN)) return 0;
    if (step === 0) return 0;
    if (step < 0 ? begin < end : begin > end) return 0;
    if (begin === end || !Number.isFinite(step)) return 1;
    if (!Number.isFinite(begin) || !Number.isFinite(end) || step === 0) return 4294967295;
    // nextafter toward +∞ first: a quotient a hair below a whole number counts as that number (OpenSCAD).
    const steps = Math.floor(nextUp(Math.abs((end - begin) / step)));
    return steps >= 4294967295 ? 4294967295 : steps + 1;
  }
  *iter() { const n = this.count; for (let i = 0; i < n; i++) yield i === 0 ? this.begin : this.begin + this.step * i; }
  values(limit = 1e7) {
    const n = this.count;
    if (n > limit) throw Object.assign(new Error(`a range with ${n} values is too long`), { code: 'scad-eval' });
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = i === 0 ? this.begin : this.begin + this.step * i;
    return out;
  }
}

/** The next double above x (C nextafter toward +∞). */
export function nextUp(x) {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return Number.MIN_VALUE;
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const hi = dv.getUint32(0); const lo = dv.getUint32(4);
  if (x > 0) { if (lo === 0xffffffff) { dv.setUint32(0, hi + 1); dv.setUint32(4, 0); } else dv.setUint32(4, lo + 1); }
  else { if (lo === 0) { dv.setUint32(0, hi - 1); dv.setUint32(4, 0xffffffff); } else dv.setUint32(4, lo - 1); }
  return dv.getFloat64(0);
}

export class FunctionValue {
  constructor(params, body, scope, name = null) { this.params = params; this.body = body; this.scope = scope; this.name = name; }
}

export const isNum = (v) => typeof v === 'number';
export const isVec = Array.isArray;
export const isStr = (v) => typeof v === 'string';
export const isBool = (v) => typeof v === 'boolean';
export const isRange = (v) => v instanceof Range;
export const isFn = (v) => v instanceof FunctionValue;

export function typeName(v) {
  if (v === undefined) return 'undefined';
  if (isNum(v)) return 'number';
  if (isBool(v)) return 'bool';
  if (isStr(v)) return 'string';
  if (isVec(v)) return 'vector';
  if (isRange(v)) return 'range';
  if (isFn(v)) return 'function';
  return 'undefined';
}

/** Truth: false, 0, NaN… as OpenSCAD: undef, false, 0, "" and [] are false. */
export function truthy(v) {
  if (v === undefined) return false;
  if (isBool(v)) return v;
  if (isNum(v)) return v !== 0;
  if (isStr(v)) return v.length > 0;
  if (isVec(v)) return v.length > 0;
  return true;
}

// ───────────────────────── numbers as text

/** A number as OpenSCAD writes it: 6 significant digits, no trailing zeroes. */
export function numStr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return '0';
  const neg = x < 0;
  const [mant, expPart] = Math.abs(x).toExponential(5).split('e');
  const e = Number(expPart);
  const digits = mant.replace('.', '');
  const decimalPoint = e + 1;
  let s;
  if (-decimalPoint + 1 > 5 || decimalPoint - 6 > 0) {
    // Exponent form: d.ddddd → trailing zeroes dropped.
    let m = `${digits[0]}.${digits.slice(1)}`.replace(/0+$/, '').replace(/\.$/, '');
    s = `${m}e${e < 0 ? '-' : '+'}${Math.abs(e)}`;
  } else if (decimalPoint <= 0) {
    s = `0.${'0'.repeat(-decimalPoint)}${digits}`.replace(/0+$/, '').replace(/\.$/, '');
  } else if (decimalPoint >= digits.length) {
    s = digits + '0'.repeat(decimalPoint - digits.length);
  } else {
    s = `${digits.slice(0, decimalPoint)}.${digits.slice(decimalPoint)}`.replace(/0+$/, '').replace(/\.$/, '');
  }
  return neg ? `-${s}` : s;
}

/** A value as str() writes it (strings bare at the top level, quoted inside vectors). */
export function toStr(v, top = true) {
  if (v === undefined) return 'undef';
  if (isNum(v)) return numStr(v);
  if (isBool(v)) return v ? 'true' : 'false';
  if (isStr(v)) return top ? v : `"${v}"`;
  if (isVec(v)) return `[${v.map((x) => toStr(x, false)).join(', ')}]`;
  if (isRange(v)) return `[${numStr(v.begin)} : ${numStr(v.step)} : ${numStr(v.end)}]`;
  if (isFn(v)) return `function(${v.params.map((p) => (p.def ? `${p.name} = ${exprSource(p.def)}` : p.name)).join(', ')}) ${exprSource(v.body)}`;
  return 'undef';
}
/** A value as echo() writes it (strings quoted). */
export const repr = (v) => toStr(v, false);

/** An expression written back as OpenSCAD source (as OpenSCAD prints function literals). */
export function exprSource(e) {
  if (!e) return '';
  const args = (list) => list.map((a) => (a.name ? `${a.name} = ` : '') + exprSource(a.expr)).join(', ');
  switch (e.t) {
    case 'num': return numStr(e.v);
    case 'str': return `"${e.v}"`;
    case 'bool': return String(e.v);
    case 'undef': return 'undef';
    case 'id': return e.name;
    case 'vec': return `[${e.items.map(exprSource).join(', ')}]`;
    case 'range': return `[${exprSource(e.begin)} : ${e.step ? `${exprSource(e.step)} : ` : ''}${exprSource(e.end)}]`;
    case 'un': return `${e.op}${exprSource(e.e)}`;
    case 'bin': return `(${exprSource(e.a)} ${e.op} ${exprSource(e.b)})`;
    case 'tern': return `(${exprSource(e.c)} ? ${exprSource(e.a)} : ${exprSource(e.b)})`;
    case 'call': return `${exprSource(e.fn)}(${args(e.args)})`;
    case 'index': return `${exprSource(e.obj)}[${exprSource(e.idx)}]`;
    case 'member': return `${exprSource(e.obj)}.${e.name}`;
    case 'let': return `let(${args(e.binds)}) ${exprSource(e.body)}`;
    case 'assert': return `assert(${args(e.args)}) ${exprSource(e.body)}`;
    case 'echo': return `echo(${args(e.args)}) ${exprSource(e.body)}`;
    case 'func': return `function(${e.params.map((p) => (p.def ? `${p.name} = ${exprSource(p.def)}` : p.name)).join(', ')}) ${exprSource(e.body)}`;
    case 'lc-for': return `for(${args(e.binds)}) ${exprSource(e.body)}`;
    case 'lc-cfor': return `for(${args(e.init)}; ${exprSource(e.cond)}; ${args(e.update)}) ${exprSource(e.body)}`;
    case 'lc-if': return `if(${exprSource(e.cond)}) ${exprSource(e.then)}${e.else ? ` else ${exprSource(e.else)}` : ''}`;
    case 'lc-each': return `each ${exprSource(e.body)}`;
    case 'lc-let': return `let(${args(e.binds)}) ${exprSource(e.body)}`;
    default: return '';
  }
}

// ───────────────────────── trigonometry in degrees (exact where OpenSCAD is)

const SQRT3_4 = Math.sqrt(3) / 2;
const reduce360 = (x) => (x < 360 && x >= 0 ? x : x - 360 * Math.floor(x / 360));
export function sinDeg(x) {
  if (!Number.isFinite(x)) return NaN;
  x = reduce360(x);
  const oppose = x >= 180; if (oppose) x -= 180;
  if (x > 90) x = 180 - x;
  let r;
  if (x < 45) r = x === 30 ? 0.5 : Math.sin(x * Math.PI / 180);
  else if (x === 45) r = Math.SQRT1_2;
  else if (x === 60) r = SQRT3_4;
  else r = Math.cos((90 - x) * Math.PI / 180);
  return oppose ? -r : r;
}
export function cosDeg(x) {
  if (!Number.isFinite(x)) return NaN;
  x = reduce360(x);
  let oppose = x >= 180; if (oppose) x -= 180;
  if (x > 90) { x = 180 - x; oppose = !oppose; }
  let r;
  if (x > 45) r = x === 60 ? 0.5 : Math.sin((90 - x) * Math.PI / 180);
  else if (x === 45) r = Math.SQRT1_2;
  else if (x === 30) r = SQRT3_4;
  else r = Math.cos(x * Math.PI / 180);
  return oppose ? -r : r;
}
export function tanDeg(x) {
  if (!Number.isFinite(x)) return NaN;
  const cycles = Math.floor(x / 180);
  if (!(x < 180 && x >= 0)) x -= 180 * cycles;
  const oppose = x > 90; if (oppose) x = 180 - x;
  let r;
  if (x === 0) r = cycles % 2 === 0 ? 0 : -0;
  else if (x === 30) r = Math.sqrt(3) / 3;
  else if (x === 45) r = 1;
  else if (x === 60) r = Math.sqrt(3);
  else if (x === 90) r = cycles % 2 === 0 ? Infinity : -Infinity;
  else r = Math.tan(x * Math.PI / 180);
  return oppose ? -r : r;
}
const R2D = 180 / Math.PI;
export function asinDeg(x) { const d = Math.asin(x) * R2D; const w = roundHalfAway(d); return sinDeg(w) === x ? w : d; }
export function acosDeg(x) { const d = Math.acos(x) * R2D; const w = roundHalfAway(d); return cosDeg(w) === x ? w : d; }
export function atanDeg(x) { const d = Math.atan(x) * R2D; const w = roundHalfAway(d); return tanDeg(w) === x ? w : d; }
export function atan2Deg(y, x) { const d = Math.atan2(y, x) * R2D; const w = roundHalfAway(d); return Math.abs(d - w) < 3e-14 ? w : d; }
/** round() of C: halves away from zero. */
export function roundHalfAway(x) { return x < 0 ? -Math.round(-x) : Math.round(x); }

/** Rotation matrix (3×3, rows) about an axis by degrees, as OpenSCAD's angle_axis_degrees. */
export function angleAxis(a, v) {
  const s = sinDeg(a); const c = cosDeg(a);
  const m = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (!(m > 0)) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = (1 - c) / m; const Cv = v.map((x) => x * k);
  const n = Math.sqrt(m); const us = v.map((x) => (x / n) * s);
  return [
    [Cv[0] * v[0] + c, Cv[1] * v[0] - us[2], Cv[2] * v[0] + us[1]],
    [Cv[0] * v[1] + us[2], Cv[1] * v[1] + c, Cv[2] * v[1] - us[0]],
    [Cv[0] * v[2] - us[1], Cv[1] * v[2] + us[0], Cv[2] * v[2] + c],
  ];
}

// ───────────────────────── operators

export function equal(a, b) {
  if (a === b) return true;
  if (isNum(a) && isNum(b)) return a === b;
  if (isVec(a) && isVec(b)) return a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isRange(a) && isRange(b)) {
    // Equal when they give the same values (two empty ranges are equal).
    const n = a.count;
    if (n !== b.count) return false;
    if (n > 1e6) return a.begin === b.begin && a.step === b.step && a.end === b.end;
    const va = a.values(Infinity), vb = b.values(Infinity);
    return va.every((x, i) => x === vb[i]);
  }
  return false;
}

export function negate(v) {
  if (isNum(v)) return -v;
  if (isVec(v)) { const out = v.map(negate); return out; }
  return undefined;
}

function elementwise(a, b, f) {
  if (isNum(a) && isNum(b)) return f(a, b);
  if (isVec(a) && isVec(b)) {
    if (a.length !== b.length) return undefined;
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i++) { const r = elementwise(a[i], b[i], f); if (r === undefined) return undefined; out[i] = r; }
    return out;
  }
  return undefined;
}
export const add = (a, b) => elementwise(a, b, (x, y) => x + y);
export const sub = (a, b) => elementwise(a, b, (x, y) => x - y);

const isNumVec = (v) => isVec(v) && v.every(isNum);
const isMatrix = (v) => isVec(v) && v.length > 0 && v.every((r) => isNumVec(r) && r.length === v[0].length && r.length > 0);

function scaleVec(v, k) {
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) {
    if (isNum(v[i])) out[i] = v[i] * k;
    else if (isVec(v[i])) { const r = scaleVec(v[i], k); if (r === undefined) return undefined; out[i] = r; }
    else return undefined;
  }
  return out;
}

export function mul(a, b) {
  if (isNum(a) && isNum(b)) return a * b;
  if (isNum(a) && isVec(b)) return scaleVec(b, a);
  if (isVec(a) && isNum(b)) return scaleVec(a, b);
  if (isVec(a) && isVec(b)) {
    // vector · vector, matrix × vector, vector × matrix, matrix × matrix.
    if (isNumVec(a) && isNumVec(b)) { if (a.length !== b.length) return undefined; let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
    if (isMatrix(a) && isNumVec(b)) { if (a[0].length !== b.length) return undefined; return a.map((row) => row.reduce((s, x, i) => s + x * b[i], 0)); }
    if (isNumVec(a) && isMatrix(b)) { if (a.length !== b.length) return undefined; return b[0].map((_, j) => a.reduce((s, x, i) => s + x * b[i][j], 0)); }
    if (isMatrix(a) && isMatrix(b)) { if (a[0].length !== b.length) return undefined; return a.map((row) => b[0].map((_, j) => row.reduce((s, x, i) => s + x * b[i][j], 0))); }
  }
  return undefined;
}

export function div(a, b) {
  if (isNum(a) && isNum(b)) return a / b;
  if (isVec(a) && isNum(b)) { const out = a.map((x) => div(x, b)); return out.some((x) => x === undefined) ? undefined : out; }
  if (isNum(a) && isVec(b)) { const out = b.map((x) => div(a, x)); return out.some((x) => x === undefined) ? undefined : out; }
  return undefined;
}
export function mod(a, b) { return isNum(a) && isNum(b) ? a % b : undefined; }
export function pow(a, b) { return isNum(a) && isNum(b) ? Math.pow(a, b) : undefined; }

export function compare(op, a, b) {
  if (isRange(a) !== isRange(b)) return undefined;
  if (isRange(a)) { a = a.values(); b = b.values(); }
  // Only numbers with numbers, strings with strings and booleans with booleans compare (else undef).
  if (isVec(a) && isVec(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (equal(a[i], b[i])) continue;
      const lt = compare('<', a[i], b[i]);
      if (lt === undefined) return undefined;
      return op === '<' || op === '<=' ? lt : !lt;
    }
    const d = a.length - b.length;
    switch (op) { case '<': return d < 0; case '<=': return d <= 0; case '>': return d > 0; default: return d >= 0; }
  }
  const ok = (isNum(a) && isNum(b)) || (isStr(a) && isStr(b)) || (isBool(a) && isBool(b));
  if (!ok) return undefined;
  if (isBool(a)) { a = Number(a); b = Number(b); }
  switch (op) { case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b; default: return undefined; }
}

/** A vector index (fractions floored, out of range = undef). */
export function index(obj, i) {
  if (!isNum(i) || Number.isNaN(i)) return undefined;
  const k = Math.floor(i);
  if (k < 0) return undefined;
  if (isVec(obj)) return obj[k];
  if (isStr(obj)) { const cs = [...obj]; return cs[k]; }
  if (isRange(obj)) { const vs = obj.values(); return vs[k]; }
  return undefined;
}
