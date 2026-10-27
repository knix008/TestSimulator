// Small array arithmetic on core/value.js tensors used by the simulation
// engine's own expression evaluator (parameters, Fcn blocks, chart actions).
// Real and complex double; integer/logical results are saturated to class.
import { tensor, num, bool, MError, isTensor, saturate, INT_RANGE, str, toStr, isChar, isString, prod } from '../../value.js';

export const D = (dims, re, im = null, cls = 'double') => tensor(cls, dims, re, im);
export const scalar = (x) => num(x);
export const isNum = (v) => isTensor(v);

export function asTensor(v) {
  if (v == null) throw new MError('sim:expr:value', 'Missing value.');
  if (isTensor(v)) return v;
  if (isString(v) && v.data.length === 1) return str(v.data[0] || '');
  if (v.cls === 'bus') throw new MError('sim:expr:bus', 'A bus signal cannot be used in arithmetic.');
  throw new MError('sim:expr:type', `Operation is not defined for values of class '${v.cls}'.`);
}

function resultClass(a, b) {
  const ia = a.cls in INT_RANGE, ib = b.cls in INT_RANGE;
  if (ia) return a.cls;
  if (ib) return b.cls;
  if (a.cls === 'single' || b.cls === 'single') return 'single';
  return 'double';
}
function fin(cls, re, dims, im) {
  if (cls !== 'double') for (let i = 0; i < re.length; i++) re[i] = saturate(cls, re[i]);
  if (im && im.every((x) => x === 0)) im = null;
  return tensor(cls, dims, re, im);
}

function bdims(a, b) {
  const n = Math.max(a.length, b.length), out = [];
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 1, y = b[i] ?? 1;
    if (x === y || y === 1) out.push(x); else if (x === 1) out.push(y);
    else throw new MError('sim:expr:dims', `Arrays have incompatible sizes for this operation (${a.join('x')} and ${b.join('x')}).`);
  }
  return out;
}
function bindex(dims, od) {
  // map from output linear index to input linear index for broadcasting
  const n = prod(od);
  const same = dims.length === od.length && dims.every((d, i) => d === od[i]);
  if (same) return null;
  if (prod(dims) === 1) return 0;
  const idx = new Int32Array(n);
  const sub = new Array(od.length).fill(0);
  for (let k = 0; k < n; k++) {
    let li = 0, mul = 1;
    for (let d = 0; d < od.length; d++) { const s = (dims[d] ?? 1) === 1 ? 0 : sub[d]; li += s * mul; mul *= dims[d] ?? 1; }
    idx[k] = li;
    for (let d = 0; d < od.length; d++) { sub[d]++; if (sub[d] < od[d]) break; sub[d] = 0; }
  }
  return idx;
}

/** Element-wise binary op on real parts (fr) and optionally complex (fc). */
export function elementwise(a, b, fr, fc, logicalOut = false) {
  a = asTensor(a); b = asTensor(b);
  const od = bdims(a.dims, b.dims);
  const n = prod(od);
  const ia = bindex(a.dims, od), ib = bindex(b.dims, od);
  const re = new Float64Array(n);
  const cplx = (a.im || b.im) && fc;
  const im = cplx ? new Float64Array(n) : null;
  for (let k = 0; k < n; k++) {
    const i = ia === null ? k : ia === 0 ? 0 : ia[k];
    const j = ib === null ? k : ib === 0 ? 0 : ib[k];
    if (cplx) {
      const r = fc(a.re[i], a.im ? a.im[i] : 0, b.re[j], b.im ? b.im[j] : 0);
      re[k] = r[0]; im[k] = r[1];
    } else re[k] = fr(a.re[i], b.re[j]);
  }
  if (logicalOut) return tensor('logical', od, re);
  return fin(resultClass(a, b), re, od, im);
}

export function unary(a, fr, cls) {
  a = asTensor(a);
  const re = new Float64Array(a.re.length);
  for (let i = 0; i < re.length; i++) re[i] = fr(a.re[i]);
  return fin(cls || (a.cls === 'logical' || a.cls === 'char' ? 'double' : a.cls), re, a.dims);
}

const cmul = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
const cdiv = (ar, ai, br, bi) => { const d = br * br + bi * bi; return [(ar * br + ai * bi) / d, (ai * br - ar * bi) / d]; };
function cpow(ar, ai, br, bi) {
  if (ar === 0 && ai === 0) return br === 0 && bi === 0 ? [1, 0] : [0, 0];
  const lr = Math.log(Math.hypot(ar, ai)), la = Math.atan2(ai, ar);
  const er = br * lr - bi * la, ea = br * la + bi * lr;
  const m = Math.exp(er);
  return [m * Math.cos(ea), m * Math.sin(ea)];
}

export const plus = (a, b) => elementwise(a, b, (x, y) => x + y, (ar, ai, br, bi) => [ar + br, ai + bi]);
export const minus = (a, b) => elementwise(a, b, (x, y) => x - y, (ar, ai, br, bi) => [ar - br, ai - bi]);
export const times = (a, b) => elementwise(a, b, (x, y) => x * y, cmul);
export const rdivide = (a, b) => elementwise(a, b, (x, y) => x / y, cdiv);
export const ldivide = (a, b) => rdivide(b, a);
export function power(a, b) {
  a = asTensor(a); b = asTensor(b);
  // negative base with fractional exponent gives complex
  let needC = !!(a.im || b.im);
  if (!needC) for (let i = 0; i < a.re.length && !needC; i++) if (a.re[i] < 0) for (let j = 0; j < b.re.length; j++) if (!Number.isInteger(b.re[j])) { needC = true; break; }
  if (needC) {
    const ac = a.im ? a : tensor(a.cls, a.dims, a.re, new Float64Array(a.re.length));
    return elementwise(ac, b, (x, y) => x ** y, cpow);
  }
  return elementwise(a, b, (x, y) => x ** y, null);
}
const cmp = (f) => (a, b) => elementwise(a, b, (x, y) => (f(x, y) ? 1 : 0), null, true);
export const eq = cmp((x, y) => x === y);
export const ne = cmp((x, y) => x !== y);
export const lt = cmp((x, y) => x < y);
export const le = cmp((x, y) => x <= y);
export const gt = cmp((x, y) => x > y);
export const ge = cmp((x, y) => x >= y);
export const and = cmp((x, y) => x !== 0 && y !== 0);
export const or = cmp((x, y) => x !== 0 || y !== 0);
export const xor = cmp((x, y) => (x !== 0) !== (y !== 0));
export const not = (a) => unary(a, (x) => (x === 0 ? 1 : 0), 'logical');
export function uminus(a) {
  a = asTensor(a);
  const re = a.re.map((x) => -x);
  const im = a.im ? a.im.map((x) => -x) : null;
  return fin(a.cls === 'logical' || a.cls === 'char' ? 'double' : a.cls, re, a.dims, im);
}

export function transpose(a, conj = false) {
  a = asTensor(a);
  if (a.dims.length > 2) throw new MError('sim:expr:transpose', 'Transpose on N-D array is not defined.');
  const [m, n] = a.dims;
  const re = new Float64Array(m * n), im = a.im ? new Float64Array(m * n) : null;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { re[j + i * n] = a.re[i + j * m]; if (im) im[j + i * n] = conj ? -a.im[i + j * m] : a.im[i + j * m]; }
  return tensor(a.cls, [n, m], re, im);
}

export function mtimes(a, b) {
  a = asTensor(a); b = asTensor(b);
  if (prod(a.dims) === 1 || prod(b.dims) === 1) return times(a, b);
  const [m, k] = a.dims, [k2, n] = b.dims;
  if (k !== k2) throw new MError('sim:expr:innerdim', `Incorrect dimensions for matrix multiplication (${m}x${k} * ${k2}x${n}).`);
  const cplx = a.im || b.im;
  const re = new Float64Array(m * n), im = cplx ? new Float64Array(m * n) : null;
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    let sr = 0, si = 0;
    for (let p = 0; p < k; p++) {
      const ar = a.re[i + p * m], ai = a.im ? a.im[i + p * m] : 0, br = b.re[p + j * k], bi = b.im ? b.im[p + j * k] : 0;
      sr += ar * br - ai * bi; si += ar * bi + ai * br;
    }
    re[i + j * m] = sr; if (im) im[i + j * m] = si;
  }
  return fin(resultClass(a, b), re, [m, n], im);
}

/** Solves A X = B (real; Gaussian elimination with partial pivoting, least squares when not square). */
export function mldivide(a, b) {
  a = asTensor(a); b = asTensor(b);
  if (prod(a.dims) === 1) return rdivide(b, a);
  const [m, n] = a.dims; const [mb, nb] = b.dims;
  if (m !== mb) throw new MError('sim:expr:dims', 'Matrix dimensions must agree.');
  if (m !== n) {
    // least squares via normal equations
    const at = transpose(a);
    return mldivide(mtimes(at, a), mtimes(at, b));
  }
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => a.re[i + j * n]));
  const B = Array.from({ length: n }, (_, i) => Array.from({ length: nb }, (_, j) => b.re[i + j * n]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    const piv = A[c][c];
    if (piv === 0) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / piv; if (!f) continue;
      for (let j = c; j < n; j++) A[r][j] -= f * A[c][j];
      for (let j = 0; j < nb; j++) B[r][j] -= f * B[c][j];
    }
  }
  const X = Array.from({ length: n }, () => new Array(nb).fill(0));
  for (let r = n - 1; r >= 0; r--) for (let j = 0; j < nb; j++) {
    let s = B[r][j]; for (let k = r + 1; k < n; k++) s -= A[r][k] * X[k][j];
    X[r][j] = s / A[r][r];
  }
  const re = new Float64Array(n * nb); for (let i = 0; i < n; i++) for (let j = 0; j < nb; j++) re[i + j * n] = X[i][j];
  return tensor('double', [n, nb], re);
}
export const mrdivide = (a, b) => {
  a = asTensor(a); b = asTensor(b);
  if (prod(b.dims) === 1) return rdivide(a, b);
  return transpose(mldivide(transpose(b), transpose(a)));
};
export function mpower(a, b) {
  a = asTensor(a); b = asTensor(b);
  if (prod(a.dims) === 1 && prod(b.dims) === 1) return power(a, b);
  const p = b.re[0];
  if (!Number.isInteger(p)) throw new MError('sim:expr:mpower', 'Matrix power needs an integer exponent here.');
  const n = a.dims[0];
  let r = eye(n), base = p < 0 ? inv(a) : a, e = Math.abs(p);
  while (e > 0) { if (e & 1) r = mtimes(r, base); base = mtimes(base, base); e >>= 1; }
  return r;
}
export function eye(n, m = n) { const t = tensor('double', [n, m]); for (let i = 0; i < Math.min(n, m); i++) t.re[i + i * n] = 1; return t; }
export const inv = (a) => mldivide(a, eye(a.dims[0]));

/** Matrix concatenation: rows of items (each row concatenated horizontally, then vertically). */
export function concat(rows) {
  const hrows = [];
  for (const row of rows) {
    const items = row.filter((v) => !(isTensor(v) && prod(v.dims) === 0 && !(v.dims[0] > 0 || v.dims[1] > 0)) || row.length === 1);
    const its = items.filter((v) => !(isTensor(v) && prod(v.dims) === 0));
    if (!its.length) { hrows.push(tensor('double', [0, 0])); continue; }
    hrows.push(its.length === 1 ? asTensor(its[0]) : hcat(its.map(asTensor)));
  }
  const nonEmpty = hrows.filter((v) => prod(v.dims) > 0);
  if (!nonEmpty.length) return hrows.length && hrows.every((r) => r.cls === 'char') ? str('') : tensor('double', [0, 0]);
  return nonEmpty.length === 1 ? nonEmpty[0] : vcat(nonEmpty);
}
function catClass(items) {
  if (items.some((v) => v.cls === 'char')) return 'char';
  const ints = items.find((v) => v.cls in INT_RANGE); if (ints) return ints.cls;
  if (items.some((v) => v.cls === 'single')) return 'single';
  if (items.every((v) => v.cls === 'logical')) return 'logical';
  return 'double';
}
export function hcat(items) {
  const m = items[0].dims[0];
  let n = 0; for (const v of items) { if (v.dims[0] !== m) throw new MError('sim:expr:horzcat', 'Dimensions of arrays being concatenated are not consistent.'); n += v.dims[1]; }
  const cplx = items.some((v) => v.im);
  const re = new Float64Array(m * n), im = cplx ? new Float64Array(m * n) : null;
  let off = 0;
  for (const v of items) { re.set(v.re, off); if (im && v.im) im.set(v.im, off); off += v.re.length; }
  return fin(catClass(items), re, [m, n], im);
}
export function vcat(items) {
  const n = items[0].dims[1];
  let m = 0; for (const v of items) { if (v.dims[1] !== n) throw new MError('sim:expr:vertcat', 'Dimensions of arrays being concatenated are not consistent.'); m += v.dims[0]; }
  const cplx = items.some((v) => v.im);
  const re = new Float64Array(m * n), im = cplx ? new Float64Array(m * n) : null;
  let r0 = 0;
  for (const v of items) {
    const mv = v.dims[0];
    for (let j = 0; j < n; j++) for (let i = 0; i < mv; i++) { re[r0 + i + j * m] = v.re[i + j * mv]; if (im && v.im) im[r0 + i + j * m] = v.im[i + j * mv]; }
    r0 += mv;
  }
  return fin(catClass(items), re, [m, n], im);
}

export function range(a, s, b) {
  if (!(s !== 0) || Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(s)) return tensor('double', [1, 0]);
  const n = Math.floor((b - a) / s + 1e-10) + 1;
  if (n <= 0) return tensor('double', [1, 0]);
  const re = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = a + i * s;
  return tensor('double', [1, n], re);
}

export const truthy = (v) => {
  v = asTensor(v);
  if (!v.re.length) return false;
  for (let i = 0; i < v.re.length; i++) if (v.re[i] === 0 || Number.isNaN(v.re[i])) return false;
  return true;
};
export { bool, num, str, toStr, isChar };
