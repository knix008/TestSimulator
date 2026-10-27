// Descriptive statistics: percentiles, higher moments, robust spread,
// standardization, NaN-ignoring reductions, ranks, correlations and the
// multivariate normal distribution.
import { tensor, num, str, isText, toStr, cell, isTensor } from '../../../value.js';
import { E, F, H, n1, isEmptyV, nv, toRows, fromRows } from '../_util.js';
import { norminv } from '../_kernels.js';
import { globalGen } from '../random.js';
import { alongDim, dimArg, defDim, meanA, varA, sorted, medianA, noNaN, tiedRank, rowsOfV, groups, cellStrCol } from './_s.js';
import { tCdf, Phi } from './dist.js';
import { isDistObj, evalInv } from './distobj.js';

const T = (v, fn) => { if (!isTensor(v) && !(v && v.sparse)) throw E(`${fn}:badInput`, `${fn} requires a numeric input.`); return v; };

/** Percentile of sorted data (reference method: midpoint plotting positions, linear interpolation). */
export function pctSorted(s, p) {
  const n = s.length; if (!n) return NaN;
  if (n === 1) return s[0];
  const pos = (p / 100) * n + 0.5; // 1-based fractional rank
  if (pos <= 1) return s[0]; if (pos >= n) return s[n - 1];
  const i = Math.floor(pos); const f = pos - i;
  return s[i - 1] + f * (s[i] - s[i - 1]);
}
function percentiles(args, fn, scale) {
  const x = T(args[0], fn); let p = Array.from(F(args[1]));
  if (fn === 'quantile' && p.length === 1 && Number.isInteger(p[0]) && p[0] > 1) { const N = p[0]; p = Array.from({ length: N }, (_, i) => (i + 1) / (N + 1)); }
  for (const q of p) if (!(q >= 0 && q <= scale)) throw E(`${fn}:badPercents`, `${fn === 'quantile' ? 'Probabilities' : 'Percentages'} must be between 0 and ${scale}.`);
  let dimV = args[2]; if (dimV && isText(dimV)) dimV = null;
  const dim = dimArg(dimV, x.dims);
  return alongDim(x, dim, (v) => { const s = sorted(noNaN(v)); return p.map((q) => pctSorted(s, q * 100 / scale)); }, p.length);
}
function centralMoments(v) { const a = noNaN(v); const n = a.length; const m = meanA(a); let m2 = 0, m3 = 0, m4 = 0; for (const x of a) { const d = x - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; } return { n, m, m2: m2 / n, m3: m3 / n, m4: m4 / n }; }
function flagDim(args, fn) {
  const x = T(args[0], fn); const flag = n1(args[1], 1); const dim = dimArg(args[2], x.dims); return { x, flag, dim };
}

const builtins = {
  prctile: (args) => percentiles(args, 'prctile', 100),
  quantile: (args) => percentiles(args, 'quantile', 1),
  iqr(args) {
    if (isDistObj(args[0])) return num(evalInv(args[0], 0.75) - evalInv(args[0], 0.25));
    const x = T(args[0], 'iqr'); const dim = dimArg(args[1], x.dims);
    return alongDim(x, dim, (v) => { const s = sorted(noNaN(v)); return [pctSorted(s, 75) - pctSorted(s, 25)]; });
  },
  skewness(args) {
    const { x, flag, dim } = flagDim(args, 'skewness');
    return alongDim(x, dim, (v) => { const { n, m2, m3 } = centralMoments(v); let s = m3 / Math.pow(m2, 1.5); if (flag === 0) s = n > 2 ? s * Math.sqrt(n * (n - 1)) / (n - 2) : NaN; return [s]; });
  },
  kurtosis(args) {
    const { x, flag, dim } = flagDim(args, 'kurtosis');
    return alongDim(x, dim, (v) => { const { n, m2, m4 } = centralMoments(v); let k = m4 / (m2 * m2); if (flag === 0) k = n > 3 ? 3 + (n - 1) / ((n - 2) * (n - 3)) * ((n + 1) * k - 3 * (n - 1)) : NaN; return [k]; });
  },
  moment(args) {
    const x = T(args[0], 'moment'); const order = n1(args[1], 1); const dim = dimArg(args[2], x.dims);
    return alongDim(x, dim, (v) => { const { n, m } = centralMoments(v); let s = 0; const a = noNaN(v); for (const t of a) s += Math.pow(t - m, order); return [order === 1 ? 0 : s / n]; });
  },
  mad(args) {
    const { x, dim } = flagDim(args, 'mad'); const flag = n1(args[1], 0);
    return alongDim(x, dim, (v) => {
      const a = noNaN(v); if (!a.length) return [NaN];
      if (flag) { const md = medianA(a); return [medianA(a.map((t) => Math.abs(t - md)))]; }
      const m = meanA(a); return [meanA(a.map((t) => Math.abs(t - m)))];
    });
  },
  zscore(args) {
    const x = T(args[0], 'zscore'); const flag = n1(args[1], 0); const dim = dimArg(args[2], x.dims);
    const mu = alongDim(x, dim, (v) => [meanA(v)]);
    const sg = alongDim(x, dim, (v) => [Math.sqrt(varA(v, flag))]);
    const len = x.dims[dim] || 1;
    const Z = alongDim(x, dim, (v) => { const m = meanA(v); let s = Math.sqrt(varA(v, flag)); if (s === 0) s = 1; return Array.from(v, (t) => (t - m) / s); }, len);
    return [{ ...Z, dims: x.dims.slice() }, mu, sg];
  },
  geomean(args) { const x = T(args[0], 'geomean'); const dim = dimArg(args[1], x.dims); return alongDim(x, dim, (v) => { if (v.some((t) => t < 0)) return [NaN]; return [Math.exp(meanA(Array.from(v, Math.log)))]; }); },
  harmmean(args) { const x = T(args[0], 'harmmean'); const dim = dimArg(args[1], x.dims); return alongDim(x, dim, (v) => [v.length / Array.from(v).reduce((s, t) => s + 1 / t, 0)]); },
  trimmean(args) {
    const x = T(args[0], 'trimmean'); const pct = n1(args[1], 0);
    let flag = 'round', di = 2; if (args[2] && isText(args[2])) { flag = toStr(args[2]).toLowerCase(); di = 3; }
    const dim = dimArg(args[di], x.dims);
    return alongDim(x, dim, (v) => {
      const s = sorted(noNaN(v)); const n = s.length; if (!n) return [NaN];
      const kf = n * pct / 200; let k;
      if (flag === 'round') k = Math.round(kf); else if (flag === 'floor') k = Math.floor(kf); else if (flag === 'ceil' || flag === 'ceiling') k = Math.ceil(kf);
      else if (flag === 'weighted') { const k0 = Math.floor(kf), w = kf - k0; if (2 * k0 >= n) return [medianA(s)]; let sum = 0, wt = 0; for (let i = k0; i < n - k0; i++) { const ww = (i === k0 || i === n - k0 - 1) ? 1 - w : 1; sum += ww * s[i]; wt += ww; } return [sum / wt]; }
      else throw E('trimmean:badFlag', "Flag must be 'round', 'floor', 'ceil' or 'weighted'.");
      if (2 * k >= n) return [NaN];
      return [meanA(s.slice(k, n - k))];
    });
  },
  nanmean(args) { const x = T(args[0], 'nanmean'); return alongDim(x, dimArg(args[1], x.dims), (v) => [meanA(noNaN(v))]); },
  nansum(args) { const x = T(args[0], 'nansum'); return alongDim(x, dimArg(args[1], x.dims), (v) => [Array.from(noNaN(v)).reduce((a, b) => a + b, 0)]); },
  nanmedian(args) { const x = T(args[0], 'nanmedian'); return alongDim(x, dimArg(args[1], x.dims), (v) => [medianA(noNaN(v))]); },
  nanvar(args) { const x = T(args[0], 'nanvar'); const w = n1(args[1], 0); return alongDim(x, dimArg(args[2], x.dims), (v) => [varA(noNaN(v), w)]); },
  nanstd(args) { const x = T(args[0], 'nanstd'); const w = n1(args[1], 0); return alongDim(x, dimArg(args[2], x.dims), (v) => [Math.sqrt(varA(noNaN(v), w))]); },
  nanmax(args) { const x = T(args[0], 'nanmax'); return alongDim(x, dimArg(args[2], x.dims), (v) => { const a = noNaN(v); return [a.length ? Math.max(...a) : NaN]; }); },
  nanmin(args) { const x = T(args[0], 'nanmin'); return alongDim(x, dimArg(args[2], x.dims), (v) => { const a = noNaN(v); return [a.length ? Math.min(...a) : NaN]; }); },
  tiedrank(args) {
    const x = T(args[0], 'tiedrank');
    const d = x.dims; const isVec = d[0] === 1 || d[1] === 1;
    if (isVec) { const { r, tieSum } = tiedRank(F(x)); return [tensor('double', d, r), num(tieSum / 2)]; }
    const dim = 0; return [alongDim(x, dim, (v) => Array.from(tiedRank(v).r), d[0]), num(0)];
  },
  corr(args, nargout) {
    const X = rowsOfV(args[0]); let Y = null; let k = 1;
    if (args[1] && !isText(args[1])) { Y = rowsOfV(args[1]); k = 2; }
    if (X.length > 0 && X[0].length === 1 && X.length === 1) throw E('corr:badInput', 'corr requires a matrix or column vectors.');
    const o = nv(args, k, ['Type', 'Rows', 'Tail']);
    const type = o.type ? toStr(o.type).toLowerCase() : 'pearson';
    const tail = o.tail ? toStr(o.tail).toLowerCase() : 'both';
    const Xc = colsT(X), Yc = Y ? colsT(Y) : Xc;
    if (Y && X.length !== Y.length) throw E('corr:inputSizeMismatch', 'X and Y must have the same number of rows.');
    const rows = Xc.length, cols = Yc.length; const R = [], P = [];
    for (let i = 0; i < rows; i++) {
      R.push([]); P.push([]);
      for (let j = 0; j < cols; j++) {
        let a = Xc[i], b = Yc[j];
        const ok = a.map((v, t) => !Number.isNaN(v) && !Number.isNaN(b[t]));
        a = a.filter((_, t) => ok[t]); b = b.filter((_, t) => ok[t]);
        const [r, p] = corrPair(a, b, type, tail);
        R[i].push(!Y && i === j ? 1 : r); P[i].push(!Y && i === j ? 1 : p);
      }
    }
    return [fromRows(R), fromRows(P)];
  },
  mvnpdf(args) {
    const { Xr, mu, S, d } = mvnArgs(args, 'mvnpdf');
    const L = cholL(S); if (!L) throw E('mvnpdf:badCovariance', 'SIGMA must be a square, symmetric, positive definite matrix.');
    let logdet = 0; for (let i = 0; i < d; i++) logdet += 2 * Math.log(L[i][i]);
    const out = Xr.map((x, r) => { const z = x.map((v, i) => v - (mu.length > 1 && Array.isArray(mu[0]) ? mu[r][i] : mu[i])); const y = fwd(L, z); let q = 0; for (const t of y) q += t * t; return Math.exp(-0.5 * q - 0.5 * logdet - d * 0.9189385332046728); });
    return tensor('double', [out.length, 1], Float64Array.from(out));
  },
  mvncdf(args) {
    let a = args;
    let lower = null;
    if (a.length >= 2 && !isEmptyV(a[1]) && a.length >= 4) { lower = Array.from(F(a[0])); a = a.slice(1); }
    const { Xr, mu, S, d } = mvnArgs(a, 'mvncdf');
    const out = Xr.map((x) => {
      const hi = x.map((v, i) => v - mu[i]); const lo = lower ? lower.map((v, i) => v - mu[i]) : hi.map(() => -Infinity);
      return mvnRect(lo, hi, S);
    });
    return tensor('double', [out.length, 1], Float64Array.from(out));
  },
  mvnrnd(args, nargout, ctx) {
    const muR = rowsOfV(args[0]); const S = toRows(args[1]); const d = S.length;
    let n = args[2] ? F(args[2])[0] : muR.length;
    const g = globalGen(ctx);
    const L = cholL(S) || eigSqrt(S);
    const Z = new Float64Array(n * d); for (let i = 0; i < n * d; i++) Z[i] = g.randn();
    const out = new Float64Array(n * d);
    for (let r = 0; r < n; r++) {
      const m = muR.length === 1 ? muR[0] : muR[r];
      for (let i = 0; i < d; i++) { let s = m[i]; for (let k = 0; k <= i && k < d; k++) s += Z[r + k * n] * L[i][k]; out[r + i * n] = s; }
    }
    return tensor('double', [n, d], out);
  },
  grp2idx(args) {
    const g = groups(args[0]);
    return [tensor('double', [g.idx.length, 1], Float64Array.from(g.idx, (i) => (i < 0 ? NaN : i + 1))), cellStrCol(g.names), g.values ? tensor('double', [g.names.length, 1], Float64Array.from(g.values)) : cellStrCol(g.names)];
  },
  tabulate(args, nargout, ctx) {
    const g = groups(args[0]); const n = g.idx.filter((i) => i >= 0).length;
    const counts = g.names.map(() => 0); for (const i of g.idx) if (i >= 0) counts[i]++;
    if (g.values) {
      // numeric: values 1..max for positive integers like the reference
      const vals = g.values.every((v) => Number.isInteger(v) && v > 0) ? Array.from({ length: Math.max(...g.values) }, (_, i) => i + 1) : g.values;
      const rows = vals.map((v) => { const k = g.values.indexOf(v); const c = k >= 0 ? counts[k] : 0; return [v, c, 100 * c / n]; });
      if (nargout === 0) { ctx.out('  Value    Count   Percent\n' + rows.map((r) => `${String(r[0]).padStart(7)}${String(r[1]).padStart(9)}${(r[2].toFixed(2) + '%').padStart(10)}`).join('\n') + '\n'); return []; }
      return fromRows(rows);
    }
    const data = []; g.names.forEach((nm, i) => { data.push(str(nm), num(counts[i]), num(100 * counts[i] / n)); });
    if (nargout === 0) { ctx.out('  Value    Count   Percent\n' + g.names.map((nm, i) => `${nm.padStart(7)}${String(counts[i]).padStart(9)}${((100 * counts[i] / n).toFixed(2) + '%').padStart(10)}`).join('\n') + '\n'); return []; }
    const m = g.names.length; const cd = new Array(3 * m); for (let i = 0; i < m; i++) { cd[i] = data[3 * i]; cd[i + m] = data[3 * i + 1]; cd[i + 2 * m] = data[3 * i + 2]; }
    return cell([m, 3], cd);
  },
};
const colsT = (R) => (R.length ? R[0].map((_, j) => R.map((r) => r[j])) : []);
function pearson(a, b) {
  const n = a.length; const ma = meanA(a), mb = meanA(b); let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
}
function tailP(z, tail, dist) {
  const cdf = dist; // function giving lower-tail probability
  if (tail === 'right' || tail === 'gt') return 1 - cdf(z);
  if (tail === 'left' || tail === 'lt') return cdf(z);
  return Math.min(1, 2 * Math.min(cdf(z), 1 - cdf(z)));
}
export function corrPair(a, b, type, tail = 'both') {
  const n = a.length;
  if (type === 'kendall') {
    let con = 0, dis = 0, ta = 0, tb = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = Math.sign(a[i] - a[j]) * Math.sign(b[i] - b[j]); if (s > 0) con++; else if (s < 0) dis++; if (a[i] === a[j]) ta++; if (b[i] === b[j]) tb++; }
    const n0 = n * (n - 1) / 2; const tau = (con - dis) / Math.sqrt((n0 - ta) * (n0 - tb));
    const sd = Math.sqrt(n * (n - 1) * (2 * n + 5) / 18); const z = (con - dis) / sd;
    return [tau, tailP(z, tail, Phi)];
  }
  let r;
  if (type === 'spearman') r = pearson(tiedRank(a).r, tiedRank(b).r); else r = pearson(a, b);
  const df = n - 2; const t = r * Math.sqrt(df / Math.max(1 - r * r, 0));
  const p = n < 3 ? NaN : Math.abs(r) >= 1 ? (tail === 'both' ? 0 : (tail === 'right') === (r > 0) ? 0 : 1) : tailP(t, tail, (z) => tCdf(z, df));
  return [r, p];
}

// ------------------------------------------------------------ multivariate normal helpers
function mvnArgs(args, fn) {
  const Xr = rowsOfV(args[0]); const d = Xr.length ? Xr[0].length : 0;
  let mu = new Array(d).fill(0);
  if (args[1] && !isEmptyV(args[1])) { const m = rowsOfV(args[1]); mu = m.length === 1 ? m[0] : (m[0].length === 1 && m.length === d ? m.map((r) => r[0]) : m); }
  let S;
  if (args[2] && !isEmptyV(args[2])) { S = toRows(args[2]); if (S.length === 1 && d > 1 && S[0].length === d) S = S[0].map((v, i) => S[0].map((_, j) => (i === j ? v : 0))); }
  else S = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? 1 : 0)));
  if (S.length !== d) throw E(`${fn}:sizeMismatch`, 'SIGMA must be a d-by-d matrix where d is the number of columns of X.');
  return { Xr, mu, S, d };
}
export function cholL(S) {
  const n = S.length; const L = S.map(() => new Array(n).fill(0));
  for (let j = 0; j < n; j++) {
    let s = S[j][j]; for (let k = 0; k < j; k++) s -= L[j][k] ** 2;
    if (!(s > 0)) return null; L[j][j] = Math.sqrt(s);
    for (let i = j + 1; i < n; i++) { let t = S[i][j]; for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k]; L[i][j] = t / L[j][j]; }
  }
  return L;
}
function eigSqrt(S) {
  // semidefinite: regularize slightly
  const n = S.length; const R = S.map((r, i) => r.map((v, j) => v + (i === j ? 1e-12 * (Math.abs(S[i][i]) + 1e-300) : 0)));
  const L = cholL(R); if (!L) throw E('mvnrnd:badCovariance', 'SIGMA must be a symmetric positive semi-definite matrix.');
  return L;
}
const fwd = (L, b) => { const n = L.length; const y = new Array(n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; } return y; };
/** Bivariate normal upper orthant P(X>h, Y>k) with correlation r (Genz BVNU). */
function bvnu(h, k, r) {
  if (h === Infinity || k === Infinity) return 0;
  if (h === -Infinity) return k === -Infinity ? 1 : Phi(-k);
  if (k === -Infinity) return Phi(-h);
  const TWOPI = 2 * Math.PI; let w, x;
  if (Math.abs(r) < 0.3) { w = [0.1713244923791705, 0.3607615730481384, 0.4679139345726904]; x = [0.9324695142031522, 0.6612093864662647, 0.2386191860831970]; }
  else if (Math.abs(r) < 0.75) { w = [0.04717533638651177, 0.1069393259953183, 0.1600783285433464, 0.2031674267230659, 0.2334925365383547, 0.2491470458134029]; x = [0.9815606342467191, 0.9041172563704750, 0.7699026741943050, 0.5873179542866171, 0.3678314989981802, 0.1252334085114692]; }
  else { w = [0.01761400713915212, 0.04060142980038694, 0.06267204833410906, 0.08327674157670475, 0.1019301198172404, 0.1181945319615184, 0.1316886384491766, 0.1420961093183821, 0.1491729864726037, 0.1527533871307259]; x = [0.9931285991850949, 0.9639719272779138, 0.9122344282513259, 0.8391169718222188, 0.7463319064601508, 0.6360536807265150, 0.5108670019508271, 0.3737060887154196, 0.2277858511416451, 0.07652652113349733]; }
  let hk = h * k; let bvn = 0;
  if (Math.abs(r) < 0.925) {
    const hs = (h * h + k * k) / 2; const asr = Math.asin(r);
    for (let i = 0; i < w.length; i++) for (const s of [-1, 1]) { const sn = Math.sin(asr * (s * x[i] + 1) / 2); bvn += w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn)); }
    bvn = bvn * asr / (2 * TWOPI) + Phi(-h) * Phi(-k);
  } else {
    if (r < 0) { k = -k; hk = -hk; }
    if (Math.abs(r) < 1) {
      const as = (1 - r) * (1 + r); let a = Math.sqrt(as); const bs = (h - k) ** 2; const c = (4 - hk) / 8; const d = (12 - hk) / 16;
      bvn = a * Math.exp(-(bs / as + hk) / 2) * (1 - c * (bs - as) * (1 - d * bs / 5) / 3 + c * d * as * as / 5);
      if (hk > -160) { const b = Math.sqrt(bs); bvn -= Math.exp(-hk / 2) * Math.sqrt(TWOPI) * Phi(-b / a) * b * (1 - c * bs * (1 - d * bs / 5) / 3); }
      a = a / 2;
      for (let i = 0; i < w.length; i++) for (const s of [-1, 1]) {
        let xs = (a * (s * x[i] + 1)) ** 2; const rs = Math.sqrt(1 - xs);
        let asr = -(bs / xs + hk) / 2;
        if (asr > -100) bvn += a * w[i] * Math.exp(asr) * (Math.exp(-hk * (1 - rs) / (2 * (1 + rs))) / rs - (1 + c * xs * (1 + d * xs)));
      }
      bvn = -bvn / TWOPI;
    }
    if (r > 0) bvn += Phi(-Math.max(h, k));
    else { bvn = -bvn; if (k > h) bvn += Phi(k) - Phi(h); }
  }
  return Math.max(0, Math.min(1, bvn));
}
/** P(lo < X < hi) for X ~ N(0, S). Exact in 1-D and 2-D, quasi-Monte Carlo (Genz) otherwise. */
export function mvnRect(lo, hi, S) {
  const d = S.length;
  if (d === 1) { const s = Math.sqrt(S[0][0]); return Phi(hi[0] / s) - Phi(lo[0] / s); }
  if (d === 2) {
    const s1 = Math.sqrt(S[0][0]), s2 = Math.sqrt(S[1][1]); const r = S[0][1] / (s1 * s2);
    const a = [lo[0] / s1, lo[1] / s2], b = [hi[0] / s1, hi[1] / s2];
    return Math.max(0, bvnu(a[0], a[1], r) - bvnu(b[0], a[1], r) - bvnu(a[0], b[1], r) + bvnu(b[0], b[1], r));
  }
  const L = cholL(S); if (!L) throw E('mvncdf:badCovariance', 'SIGMA must be positive definite.');
  const N = 20000 * d; const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73];
  const alpha = primes.slice(0, d).map(Math.sqrt);
  let sum = 0;
  for (let k = 1; k <= N; k++) {
    let f = 1; const y = new Array(d).fill(0);
    for (let i = 0; i < d; i++) {
      let s = 0; for (let j = 0; j < i; j++) s += L[i][j] * y[j];
      const a = Phi((lo[i] - s) / L[i][i]), b = Phi((hi[i] - s) / L[i][i]);
      f *= b - a; if (f <= 0) break;
      const u = Math.abs(2 * ((k * alpha[i]) % 1) - 1);
      y[i] = norminv(Math.min(Math.max(a + u * (b - a), 1e-300), 1 - 1e-16));
    }
    sum += f;
  }
  return sum / N;
}

const help = {
  prctile: H('Percentiles of a data set (NaN values ignored).', '데이터의 백분위수 (NaN 무시).', ['Y = prctile(X, p)', 'Y = prctile(X, p, dim)']),
  quantile: H('Quantiles of a data set (NaN values ignored).', '데이터의 분위수 (NaN 무시).', ['Y = quantile(X, p)', 'Y = quantile(X, N)', 'Y = quantile(X, p, dim)']),
  iqr: H('Interquartile range.', '사분위 범위.', ['r = iqr(X)', 'r = iqr(X, dim)', 'r = iqr(pd)']),
  skewness: H('Skewness (flag 0 corrects for bias).', '왜도 (flag 0은 편향 보정).', ['y = skewness(X)', 'y = skewness(X, flag)', 'y = skewness(X, flag, dim)']),
  kurtosis: H('Kurtosis (flag 0 corrects for bias).', '첨도 (flag 0은 편향 보정).', ['k = kurtosis(X)', 'k = kurtosis(X, flag)', 'k = kurtosis(X, flag, dim)']),
  moment: H('Central moment of a given order.', '주어진 차수의 중심 적률.', ['m = moment(X, order)', 'm = moment(X, order, dim)']),
  mad: H('Mean (flag 0) or median (flag 1) absolute deviation.', '평균(flag 0) 또는 중앙값(flag 1) 절대 편차.', ['y = mad(X)', 'y = mad(X, flag)', 'y = mad(X, flag, dim)']),
  zscore: H('Standardized z-scores.', '표준화 z 점수.', ['Z = zscore(X)', '[Z, mu, sigma] = zscore(X, flag, dim)']),
  geomean: H('Geometric mean.', '기하 평균.', ['m = geomean(X)', 'm = geomean(X, dim)']),
  harmmean: H('Harmonic mean.', '조화 평균.', ['m = harmmean(X)', 'm = harmmean(X, dim)']),
  trimmean: H('Mean excluding the given percentage of outliers.', '이상값 비율을 제외한 평균.', ['m = trimmean(X, percent)', 'm = trimmean(X, percent, flag, dim)']),
  nanmean: H('Mean ignoring NaN values.', 'NaN을 무시한 평균.', ['m = nanmean(X)', 'm = nanmean(X, dim)']),
  nansum: H('Sum ignoring NaN values.', 'NaN을 무시한 합.', ['s = nansum(X)', 's = nansum(X, dim)']),
  nanmedian: H('Median ignoring NaN values.', 'NaN을 무시한 중앙값.', ['m = nanmedian(X)', 'm = nanmedian(X, dim)']),
  nanvar: H('Variance ignoring NaN values.', 'NaN을 무시한 분산.', ['v = nanvar(X)', 'v = nanvar(X, w, dim)']),
  nanstd: H('Standard deviation ignoring NaN values.', 'NaN을 무시한 표준편차.', ['s = nanstd(X)', 's = nanstd(X, w, dim)']),
  nanmax: H('Maximum ignoring NaN values.', 'NaN을 무시한 최댓값.', ['m = nanmax(X)', 'm = nanmax(X, [], dim)']),
  nanmin: H('Minimum ignoring NaN values.', 'NaN을 무시한 최솟값.', ['m = nanmin(X)', 'm = nanmin(X, [], dim)']),
  tiedrank: H('Ranks with ties averaged.', '동률을 평균한 순위.', ['[R, tieadj] = tiedrank(X)']),
  corr: H("Linear or rank correlation with p-values ('Type' Pearson, Spearman or Kendall).", "선형 또는 순위 상관계수와 p 값 ('Type' Pearson, Spearman, Kendall).", ['rho = corr(X)', '[rho, pval] = corr(X, Y)', "[___] = corr(___, 'Type', 'Spearman')", "[___] = corr(___, 'Tail', 'right')"]),
  mvnpdf: H('Multivariate normal probability density.', '다변량 정규 확률 밀도.', ['y = mvnpdf(X)', 'y = mvnpdf(X, mu, Sigma)']),
  mvncdf: H('Multivariate normal cumulative distribution (exact for 1-D and 2-D).', '다변량 정규 누적 분포 (1차원·2차원은 정확한 값).', ['p = mvncdf(X)', 'p = mvncdf(X, mu, Sigma)', 'p = mvncdf(xl, xu, mu, Sigma)']),
  mvnrnd: H('Random vectors from the multivariate normal distribution.', '다변량 정규 분포의 난수 벡터.', ['R = mvnrnd(mu, Sigma)', 'R = mvnrnd(mu, Sigma, n)']),
  grp2idx: H('Converts a grouping variable to indices.', '그룹 변수를 인덱스로 변환합니다.', ['[g, gn, gl] = grp2idx(s)']),
  tabulate: H('Frequency table of data.', '데이터의 도수표.', ['tbl = tabulate(x)', 'tabulate(x)']),
};
export { builtins, help };
