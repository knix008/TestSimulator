// Special matrices: magic, hilb, invhilb, pascal, rosser, wilkinson, vander,
// toeplitz, hankel, hadamard, compan and a gallery of common test matrices.
import { fail, out, outMat, optText, scal, intArg, H, dbl, resultCls, tensor } from './util.js';
import { isText, toStr } from '../../value.js';

function magicN(n) {
  const M = new Float64Array(n * n);
  const set = (i, j, v) => { M[i + j * n] = v; };
  if (n === 0) return M;
  if (n % 2 === 1) {
    // siamese method shifted like the reference: M(i,j) = n*mod(i+j-(n+3)/2, n) + mod(i+2j-2, n) + 1 (1-based)
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) {
      const a = ((i + j - (n + 3) / 2) % n + n) % n, b = ((i + 2 * j - 2) % n + n) % n;
      set(i - 1, j - 1, n * a + b + 1);
    }
  } else if (n % 4 === 0) {
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j++) {
      const v = (i - 1) * n + j;
      const keep = Math.floor((i % 4) / 2) === Math.floor((j % 4) / 2);
      set(i - 1, j - 1, keep ? n * n + 1 - v : v);
    }
  } else {
    const p = n / 2; const A = magicN(p);
    const k = (n - 2) / 4;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) {
      const a = A[i + j * p];
      set(i, j, a); set(i + p, j + p, a + p * p); set(i, j + p, a + 2 * p * p); set(i + p, j, a + 3 * p * p);
    }
    // swap columns
    const cols = []; for (let j = 0; j < k; j++) cols.push(j); for (let j = n - k + 1; j < n; j++) cols.push(j);
    for (const j of cols) for (let i = 0; i < p; i++) { const t = M[i + j * n]; M[i + j * n] = M[i + p + j * n]; M[i + p + j * n] = t; }
    for (const j of [k, 0]) { const i = k; const t = M[i + j * n]; M[i + j * n] = M[i + p + j * n]; M[i + p + j * n] = t; }
  }
  return M;
}

function binom(n, k) { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return Math.round(r); }

function toeplitzCore(c, r) {
  const m = c.re.length, n = r.re.length;
  const re = new Float64Array(m * n), cplx = !!(c.im || r.im);
  const im = cplx ? new Float64Array(m * n) : null;
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) {
    if (i >= j) { re[i + j * m] = c.re[i - j]; if (im) im[i + j * m] = c.im ? c.im[i - j] : 0; }
    else { re[i + j * m] = r.re[j - i]; if (im) im[i + j * m] = r.im ? r.im[j - i] : 0; }
  }
  return { m, n, re, im };
}

function hadamardN(n) {
  // n = 2^k, 12*2^k or 20*2^k
  let k = 0, base = null, m = n;
  while (m > 1 && m % 2 === 0) { m /= 2; k++; }
  if (m === 1) base = [[1]];
  else if (m === 3 && k >= 2) { k -= 2; base = toeplitzRows([-1, -1, 1, -1, -1, -1, 1, 1, 1, -1, 1], [-1, 1, -1, 1, 1, 1, -1, -1, -1, 1, -1], 12); }
  else if (m === 5 && k >= 2) { k -= 2; base = hankelRows20(); }
  else fail('hadamard:invalidInput', 'N must be 2^k, 12*2^k or 20*2^k for some integer k.');
  let H0 = base;
  for (let t = 0; t < k; t++) {
    const s = H0.length; const Hn = [];
    for (let i = 0; i < 2 * s; i++) { const row = []; for (let j = 0; j < 2 * s; j++) row.push(H0[i % s][j % s] * (i >= s && j >= s ? -1 : 1)); Hn.push(row); }
    H0 = Hn;
  }
  return H0;
}
function toeplitzRows(cTail, rTail, size) {
  // 12x12: [ones(1,12); ones(11,1) toeplitz(c, r)]
  const T = [];
  for (let i = 0; i < 11; i++) { const row = []; for (let j = 0; j < 11; j++) row.push(i >= j ? cTail[i - j] : rTail[j - i]); T.push(row); }
  const Hm = [new Array(size).fill(1)];
  for (let i = 0; i < 11; i++) Hm.push([1, ...T[i]]);
  return Hm;
}
function hankelRows20() {
  const c = [-1, -1, 1, 1, -1, -1, -1, -1, 1, -1, 1, -1, 1, 1, 1, 1, -1, -1, 1], r = [1, -1, -1, 1, 1, -1, -1, -1, -1, 1, -1, 1, -1, 1, 1, 1, 1, -1, -1];
  const Hk = [];
  for (let i = 0; i < 19; i++) { const row = []; for (let j = 0; j < 19; j++) row.push(i + j < 19 ? c[i + j] : r[i + j - 18]); Hk.push(row); }
  const Hm = [new Array(20).fill(1)];
  for (let i = 0; i < 19; i++) Hm.push([1, ...Hk[i]]);
  return Hm;
}
const fromRows = (rows) => { const m = rows.length, n = m ? rows[0].length : 0; const re = new Float64Array(m * n); for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) re[i + j * m] = rows[i][j]; return outMat(m, n, re); };

function compan(v) {
  const t = dbl(v, 'compan', 'u');
  if (!(t.dims.length === 2 && (t.dims[0] <= 1 || t.dims[1] <= 1))) fail('compan:NeedVectorInput', 'Input argument must be a vector.');
  const n = t.re.length;
  if (n <= 1) return outMat(0, 0, []);
  if (t.re[0] === 0 && (!t.im || t.im[0] === 0)) fail('compan:FirstCoeffZero', 'First element of input must be nonzero.');
  const m = n - 1; const re = new Float64Array(m * m), im = t.im ? new Float64Array(m * m) : null;
  const a0r = t.re[0], a0i = t.im ? t.im[0] : 0; const d = a0r * a0r + a0i * a0i;
  for (let j = 0; j < m; j++) {
    const br = t.re[j + 1], bi = t.im ? t.im[j + 1] : 0;
    re[j * m] = -(br * a0r + bi * a0i) / d; if (im) im[j * m] = -(bi * a0r - br * a0i) / d;
  }
  for (let i = 1; i < m; i++) re[i + (i - 1) * m] = 1;
  return outMat(m, m, re, im, resultCls(v));
}

function gallery(args, nargout) {
  const name = optText(args[0]);
  if (name == null) fail('gallery:badName', 'The first argument must be the name of a matrix family.');
  const a = args.slice(1);
  const n1 = (i, def) => (a[i] == null ? def : intArg(a[i], 'gallery', 'n'));
  switch (name) {
    case 'minij': { const n = n1(0); const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = Math.min(i, j) + 1; return outMat(n, n, re); }
    case 'moler': { const n = n1(0); const alpha = a[1] != null ? scal(a[1], 'gallery') : -1; const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = i === j ? i + 1 : alpha * alpha * Math.min(i, j) + alpha; for (let i = 0; i < n; i++) re[i * (n + 1)] = alpha * alpha * i + 1; return outMat(n, n, re); }
    case 'lehmer': { const n = n1(0); const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = (Math.min(i, j) + 1) / (Math.max(i, j) + 1); return outMat(n, n, re); }
    case 'tridiag': {
      let n, c = -1, d = 2, e = -1;
      if (a.length >= 4) { n = n1(0); c = scal(a[1], 'gallery'); d = scal(a[2], 'gallery'); e = scal(a[3], 'gallery'); }
      else n = n1(0);
      const re = new Float64Array(n * n);
      for (let i = 0; i < n; i++) { re[i * (n + 1)] = d; if (i > 0) re[i + (i - 1) * n] = c; if (i < n - 1) re[i + (i + 1) * n] = e; }
      return outMat(n, n, re);
    }
    case 'kms': { const n = n1(0); const rho = a[1] != null ? scal(a[1], 'gallery') : 0.5; const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = Math.pow(rho, Math.abs(i - j)); return outMat(n, n, re); }
    case 'frank': {
      const n = n1(0); const re = new Float64Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { if (j >= i - 1) re[i + j * n] = n - Math.max(i, j); }
      return outMat(n, n, re);
    }
    case 'circul': {
      const v = dbl(a[0], 'gallery'); let c = Array.from(v.re); if (c.length === 1) { const n = c[0]; c = Array.from({ length: n }, (_, i) => i + 1); }
      const n = c.length; const re = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) re[i + j * n] = c[((j - i) % n + n) % n];
      return outMat(n, n, re);
    }
    case 'cauchy': {
      const x = Array.from(dbl(a[0], 'gallery').re); let xs = x; if (xs.length === 1) xs = Array.from({ length: x[0] }, (_, i) => i + 1);
      const ys = a[1] ? Array.from(dbl(a[1], 'gallery').re) : xs; const m = xs.length, n = ys.length;
      const re = new Float64Array(m * n); for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) re[i + j * m] = 1 / (xs[i] + ys[j]);
      return outMat(m, n, re);
    }
    case 'lotkin': { const n = n1(0); const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = i === 0 ? 1 : 1 / (i + j + 1); return outMat(n, n, re); }
    case 'parter': { const n = n1(0); const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = 1 / (i - j + 0.5); return outMat(n, n, re); }
    case 'ris': { const n = n1(0); const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = 0.5 / (n - i - j - 0.5); return outMat(n, n, re); }
    case 'grcar': {
      const n = n1(0); const k = a[1] != null ? intArg(a[1], 'gallery') : 3; const re = new Float64Array(n * n);
      for (let i = 0; i < n; i++) { if (i > 0) re[i + (i - 1) * n] = -1; for (let j = i; j <= Math.min(n - 1, i + k); j++) re[i + j * n] = 1; }
      return outMat(n, n, re);
    }
    case 'clement': {
      const n = n1(0); const re = new Float64Array(n * n);
      for (let i = 0; i < n - 1; i++) { re[i + (i + 1) * n] = i + 1; re[i + 1 + i * n] = n - 1 - i; }
      return outMat(n, n, re);
    }
    case 'jordbloc': { const n = n1(0); const lam = a[1] != null ? scal(a[1], 'gallery') : 1; const re = new Float64Array(n * n); for (let i = 0; i < n; i++) { re[i * (n + 1)] = lam; if (i < n - 1) re[i + (i + 1) * n] = 1; } return outMat(n, n, re); }
    case 'fiedler': { const c = Array.from(dbl(a[0], 'gallery').re); const xs = c.length === 1 ? Array.from({ length: c[0] }, (_, i) => i + 1) : c; const n = xs.length; const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = Math.abs(xs[i] - xs[j]); return outMat(n, n, re); }
    case 'gearmat': { const n = n1(0); const re = new Float64Array(n * n); for (let i = 0; i < n - 1; i++) { re[i + (i + 1) * n] = 1; re[i + 1 + i * n] = 1; } if (n > 1) { re[(n - 1) * n] = 1; re[n - 1] = -1; } return outMat(n, n, re); }
    case 'pei': { const n = n1(0); const al = a[1] != null ? scal(a[1], 'gallery') : 1; const re = new Float64Array(n * n).fill(1); for (let i = 0; i < n; i++) re[i * (n + 1)] += al; return outMat(n, n, re); }
    case 'ipjfact': { const n = n1(0); const re = new Float64Array(n * n); const fact = (k) => { let r = 1; for (let t = 2; t <= k; t++) r *= t; return r; }; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = fact(i + j + 2); return outMat(n, n, re); }
    case 'binomial': {
      const n = n1(0); const L = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) L[i + j * n] = binom(i, j);
      const A = new Float64Array(n * n);
      // A = L * D * U, U = L(n:-1:1, n:-1:1), D = diag((-2).^(0:n-1))
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        let s2 = 0;
        for (let k = 0; k < n; k++) s2 += L[i + k * n] * Math.pow(-2, k) * L[(n - 1 - k) + (n - 1 - j) * n];
        A[i + j * n] = s2;
      }
      return outMat(n, n, A);
    }
    case 'orthog': {
      const n = n1(0); const k = a[1] != null ? intArg(a[1], 'gallery') : 1; const re = new Float64Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (k === 1) re[i + j * n] = Math.sqrt(2 / (n + 1)) * Math.sin(((i + 1) * (j + 1) * Math.PI) / (n + 1));
        else if (k === 2) re[i + j * n] = (2 / Math.sqrt(2 * n + 1)) * Math.sin((2 * (i + 1) * (j + 1) * Math.PI) / (2 * n + 1));
        else fail('gallery:badOption', 'orthog supports k = 1 or 2.');
      }
      return outMat(n, n, re);
    }
    case 'wilk': {
      const n = n1(0);
      if (n === 3) return fromRows([[1e-10, 0.9, -0.4], [0, 0.9, -0.4], [0, 0, 1e-10]]);
      if (n === 4) return fromRows([[0.9143e-4, 0, 0, 0], [0.8762, 0.7156e-4, 0, 0], [0.7943, 0.8143, 0.9504e-4, 0], [0.8017, 0.6123, 0.7165, 0.7123e-4]]);
      if (n === 21) return wilkinsonN(21);
      fail('gallery:badOption', 'wilk supports n = 3, 4 or 21.');
      break;
    }
    case 'rosser': return rosser();
    case 'hilb': return hilbV(n1(0));
    case 'pascal': return pascalV(n1(0), 0);
    case 'magic': return outMat(n1(0), n1(0), magicN(n1(0)));
    default: fail('gallery:unknownMatrix', `Unknown matrix family '${name}'.`);
  }
  void nargout;
}

function hilbV(n) { const re = new Float64Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) re[i + j * n] = 1 / (i + j + 1); return outMat(n, n, re); }
function pascalV(n, k) {
  const P = new Float64Array(n * n);
  if (k === 0) { for (let i = 0; i < n; i++) { P[i] = 1; P[i * n] = 1; } for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) P[i + j * n] = P[i - 1 + j * n] + P[i + (j - 1) * n]; return outMat(n, n, P); }
  // lower triangular Cholesky factor (up to sign), k = 1: involutory
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) P[i + j * n] = binom(i, j) * (j % 2 ? -1 : 1);
  if (k === 1) return outMat(n, n, P);
  if (k === 2) {
    // rot90(P,3) with sign flip for even n: transpose-reverse of the k=1 matrix
    const Q = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Q[i + j * n] = P[(n - 1 - j) + i * n];
    if (n % 2 === 0) for (let i = 0; i < n * n; i++) Q[i] = -Q[i];
    return outMat(n, n, Q);
  }
  fail('pascal:badK', 'k must be 0, 1 or 2.');
}
function rosser() {
  return fromRows([
    [611, 196, -192, 407, -8, -52, -49, 29], [196, 899, 113, -192, -71, -43, -8, -44], [-192, 113, 899, 196, 61, 49, 8, 52], [407, -192, 196, 611, 8, 44, 59, -23],
    [-8, -71, 61, 8, 411, -599, 208, 208], [-52, -43, 49, 44, -599, 411, 208, 208], [-49, -8, 8, 59, 208, 208, 99, -911], [29, -44, 52, -23, 208, 208, -911, 99]]);
}
function wilkinsonN(n) {
  const m = (n - 1) / 2; const re = new Float64Array(n * n);
  for (let i = 0; i < n; i++) { re[i * (n + 1)] = Math.abs(-m + i); if (i < n - 1) { re[i + (i + 1) * n] = 1; re[i + 1 + i * n] = 1; } }
  return outMat(n, n, re);
}

function nArg(args, fn) {
  if (!args.length) fail(`${fn}:notEnoughInputs`, 'Not enough input arguments.');
  const n = scal(args[0], fn, 'n');
  if (!Number.isFinite(n)) fail(`${fn}:badN`, 'n must be finite.');
  return Math.max(0, Math.floor(n));
}

export const builtins = {
  magic(args) { const n = nArg(args, 'magic'); return outMat(n, n, magicN(n)); },
  hilb(args) { return hilbV(nArg(args, 'hilb')); },
  invhilb(args) {
    const n = nArg(args, 'invhilb');
    const re = new Float64Array(n * n);
    let p = n;
    for (let i = 1; i <= n; i++) {
      if (i > 1) p = ((n - i + 1) * p * (n + i - 1)) / ((i - 1) ** 2);
      let r = p * p;
      re[(i - 1) * (n + 1)] = r / (2 * i - 1);
      for (let j = i + 1; j <= n; j++) {
        r = (-((n - j + 1) * r * (n + j - 1)) / ((j - 1) ** 2));
        re[i - 1 + (j - 1) * n] = r / (i + j - 1); re[j - 1 + (i - 1) * n] = r / (i + j - 1);
      }
    }
    return outMat(n, n, re);
  },
  pascal(args) { const n = nArg(args, 'pascal'); const k = args.length > 1 ? intArg(args[1], 'pascal', 'k') : 0; return pascalV(n, k); },
  rosser() { return rosser(); },
  wilkinson(args) { return wilkinsonN(nArg(args, 'wilkinson')); },
  vander(args) {
    const t = dbl(args[0], 'vander', 'v');
    const m = t.re.length; const n = args.length > 1 ? intArg(args[1], 'vander', 'n') : m;
    const re = new Float64Array(m * n), im = t.im ? new Float64Array(m * n) : null;
    for (let i = 0; i < m; i++) {
      let vr = 1, vi = 0; const xr = t.re[i], xi = t.im ? t.im[i] : 0;
      for (let j = n - 1; j >= 0; j--) { re[i + j * m] = vr; if (im) im[i + j * m] = vi; const nr = vr * xr - vi * xi; vi = vr * xi + vi * xr; vr = nr; }
    }
    return outMat(m, n, re, im, resultCls(args[0]));
  },
  toeplitz(args) {
    const c = dbl(args[0], 'toeplitz', 'c');
    let r;
    if (args.length > 1) {
      r = dbl(args[1], 'toeplitz', 'r');
      // the first element of c wins
    } else {
      // symmetric/Hermitian Toeplitz: r = c, c = conj(c) with real diagonal
      r = c;
      const cc = { re: Float64Array.from(c.re), im: c.im ? Float64Array.from(c.im, (x) => -x) : null };
      if (cc.im) cc.im[0] = -cc.im[0];
      const T = toeplitzCore(cc, r);
      return outMat(T.m, T.n, T.re, T.im, resultCls(args[0]));
    }
    const T = toeplitzCore(c, r);
    return outMat(T.m, T.n, T.re, T.im, resultCls(args[0], args[1]));
  },
  hankel(args) {
    const c = dbl(args[0], 'hankel', 'c');
    const m = c.re.length;
    const r = args.length > 1 ? dbl(args[1], 'hankel', 'r') : { re: new Float64Array(m), im: null };
    const n = r.re.length;
    const re = new Float64Array(m * n), cplx = !!(c.im || r.im), im = cplx ? new Float64Array(m * n) : null;
    for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) {
      const k = i + j;
      if (k < m) { re[i + j * m] = c.re[k]; if (im && c.im) im[i + j * m] = c.im[k]; }
      else { re[i + j * m] = r.re[k - m + 1]; if (im && r.im) im[i + j * m] = r.im[k - m + 1]; }
    }
    return outMat(m, n, re, im, resultCls(args[0], args[1]));
  },
  hadamard(args) { const n = nArg(args, 'hadamard'); if (n === 0) return outMat(0, 0, []); return fromRows(hadamardN(n)); },
  compan(args) { return compan(args[0]); },
  gallery(args, nargout) { return gallery(args, nargout); },
};

export const help = {
  magic: H('Magic square.', '마방진.', ['M = magic(n)']),
  hilb: H('Hilbert matrix.', '힐베르트 행렬.', ['H = hilb(n)']),
  invhilb: H('Inverse of the Hilbert matrix (exact).', '힐베르트 행렬의 역행렬 (정확값).', ['H = invhilb(n)']),
  pascal: H('Pascal matrix.', '파스칼 행렬.', ['P = pascal(n)', 'P = pascal(n, 1)', 'P = pascal(n, 2)']),
  rosser: H('Classic symmetric eigenvalue test matrix.', '고전적 대칭 고유값 시험 행렬.', ['A = rosser']),
  wilkinson: H("Wilkinson's eigenvalue test matrix.", '윌킨슨 고유값 시험 행렬.', ['W = wilkinson(n)']),
  vander: H('Vandermonde matrix.', '방데르몽드 행렬.', ['A = vander(v)', 'A = vander(v, n)']),
  toeplitz: H('Toeplitz matrix.', '퇴플리츠 행렬.', ['T = toeplitz(c, r)', 'T = toeplitz(r)']),
  hankel: H('Hankel matrix.', '한켈 행렬.', ['H = hankel(c)', 'H = hankel(c, r)']),
  hadamard: H('Hadamard matrix.', '아다마르 행렬.', ['H = hadamard(n)']),
  compan: H('Companion matrix of a polynomial.', '다항식의 동반 행렬.', ['A = compan(u)']),
  gallery: H('Test matrices (minij, moler, lehmer, tridiag, kms, frank, circul, cauchy, lotkin, parter, ris, grcar, clement, jordbloc, fiedler, gearmat, pei, ipjfact, binomial, orthog, wilk, ...).', '시험 행렬 모음 (minij, moler, lehmer, tridiag, kms, frank, circul, cauchy, lotkin, parter, ris, grcar, clement, jordbloc, fiedler, gearmat, pei, ipjfact, binomial, orthog, wilk 등).', ["A = gallery('minij', n)", "A = gallery('tridiag', n, c, d, e)", "A = gallery('lehmer', n)"]),
};
void out; void tensor; void isText; void toStr;
