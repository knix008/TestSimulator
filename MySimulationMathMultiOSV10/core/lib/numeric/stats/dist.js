// Probability distributions: one table entry per family with pdf, cdf,
// inverse, random generator, mean/variance and maximum likelihood fit. The
// <name>pdf / cdf / inv / rnd / stat / fit / like builtins are generated from it.
import { tensor, num, isText, toStr, prod } from '../../../value.js';
import { E, F, H, sizeArgs, n1, isEmptyV, nv, onum } from '../_util.js';
import { gammaln, gammainc, gammaincinv, betainc, betaincinv, betaln, erfc, norminv, lnchoose, digamma, invertMonotone, gamma as gammaFn } from '../_kernels.js';
import { globalGen } from '../random.js';
import { bcast, ew, meanA, varA, stdA, sumA, nelderMead, brent, invM, trigamma, sorted } from './_s.js';

const SQ2 = Math.SQRT2, LN2PI_2 = 0.9189385332046728, EULER = 0.5772156649015329;
const isInt = (x) => Number.isFinite(x) && Math.floor(x) === x;
const NaNs = () => NaN;
const Phi = (z) => 0.5 * erfc(-z / SQ2);
const PhiU = (z) => 0.5 * erfc(z / SQ2);

// ------------------------------------------------------------ random variates
export function gammaRnd(g, a) {
  if (!(a > 0)) return NaN;
  if (a < 1) { const u = g.rand(); return gammaRnd(g, a + 1) * Math.pow(u, 1 / a); }
  const d = a - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v; do { x = g.randn(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = g.rand();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
/** Smallest integer x in [lo,hi] with cdf(x) >= q, searching from a guess. */
export function discreteInv(cdf, q, guess, lo, hi) {
  if (Number.isNaN(q) || q < 0 || q > 1) return NaN;
  if (q === 0) return lo;
  if (q === 1 && hi === Infinity) return Infinity;
  let x = Math.round(guess); if (!Number.isFinite(x)) x = lo; x = Math.max(lo, Math.min(hi, x));
  if (cdf(x) >= q) { while (x > lo && cdf(x - 1) >= q) x--; } else { while (x < hi && cdf(x) < q) x++; }
  return x;
}
function poissRnd(g, lam) {
  if (!(lam >= 0)) return NaN; if (lam === 0) return 0;
  if (lam < 30) { const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= g.rand(); } while (p > L); return k - 1; }
  const D = DIST.poiss; return discreteInv((x) => D.cdf(x, [lam]), g.rand(), lam + Math.sqrt(lam) * norminv(0.5), 0, Infinity);
}
function binoRnd(g, n, p) {
  if (!(n >= 0) || !isInt(n) || !(p >= 0 && p <= 1)) return NaN;
  if (n <= 40) { let k = 0; for (let i = 0; i < n; i++) if (g.rand() < p) k++; return k; }
  const D = DIST.bino; const u = g.rand(); const m = n * p, s = Math.sqrt(n * p * (1 - p));
  return discreteInv((x) => D.cdf(x, [n, p]), u, m + s * norminv(u), 0, n);
}

// ------------------------------------------------------------ the families
// Each: name (display), cls (object class), key, pnames, defaults (undefined → required),
// valid(p), pdf(x,p), cdf(x,p,upper), inv(q,p), rnd(g,p), stat(p) → [mean, var], discrete, support(p)
export const DIST = {};
function def(key, o) { DIST[key] = { key, discrete: false, ...o }; }

def('norm', {
  name: 'Normal', cls: 'NormalDistribution', pnames: ['mu', 'sigma'], defaults: [0, 1], pdesc: ['Mean', 'Standard deviation'], pos: [false, true],
  valid: ([m, s]) => s > 0,
  pdf: (x, [m, s]) => { const z = (x - m) / s; return Math.exp(-0.5 * z * z) / (s * 2.5066282746310002); },
  cdf: (x, [m, s], up) => (up ? PhiU((x - m) / s) : Phi((x - m) / s)),
  inv: (q, [m, s]) => m + s * norminv(q),
  rnd: (g, [m, s]) => m + s * g.randn(),
  stat: ([m, s]) => [m, s * s],
  support: () => [-Infinity, Infinity],
  fit: (x) => [meanA(x), stdA(x)],
});
def('unif', {
  name: 'Uniform', cls: 'UniformDistribution', pnames: ['Lower', 'Upper'], defaults: [0, 1], pdesc: ['Lower limit', 'Upper limit'], pos: [false, false], short: ['a', 'b'],
  valid: ([a, b]) => a < b,
  pdf: (x, [a, b]) => (x >= a && x <= b ? 1 / (b - a) : 0),
  cdf: (x, [a, b], up) => { const c = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return up ? 1 - c : c; },
  inv: (q, [a, b]) => (q >= 0 && q <= 1 ? a + q * (b - a) : NaN),
  rnd: (g, [a, b]) => a + (b - a) * g.rand(),
  stat: ([a, b]) => [(a + b) / 2, (b - a) ** 2 / 12],
  support: ([a, b]) => [a, b],
  fit: (x) => [Math.min(...x), Math.max(...x)],
});
def('unid', {
  name: 'Discrete Uniform', cls: 'DiscreteUniformDistribution', pnames: ['N'], defaults: [undefined], pdesc: ['Maximum value'], discrete: true,
  valid: ([N]) => N >= 1 && isInt(N),
  pdf: (x, [N]) => (isInt(x) && x >= 1 && x <= N ? 1 / N : 0),
  cdf: (x, [N], up) => { const c = x < 1 ? 0 : x >= N ? 1 : Math.floor(x) / N; return up ? 1 - c : c; },
  inv: (q, [N]) => (q > 0 && q <= 1 ? Math.ceil(N * q) : NaN),
  rnd: (g, [N]) => Math.ceil(N * g.rand()),
  stat: ([N]) => [(N + 1) / 2, (N * N - 1) / 12],
  support: ([N]) => [1, N],
});
def('exp', {
  name: 'Exponential', cls: 'ExponentialDistribution', pnames: ['mu'], defaults: [1], pdesc: ['Mean'], pos: [true],
  valid: ([m]) => m > 0,
  pdf: (x, [m]) => (x < 0 ? 0 : Math.exp(-x / m) / m),
  cdf: (x, [m], up) => (x <= 0 ? (up ? 1 : 0) : up ? Math.exp(-x / m) : -Math.expm1(-x / m)),
  inv: (q, [m]) => (q >= 0 && q <= 1 ? -m * Math.log1p(-q) : NaN),
  rnd: (g, [m]) => -m * Math.log(g.rand()),
  stat: ([m]) => [m, m * m],
  support: () => [0, Infinity],
  fit: (x) => [meanA(x)],
});
const gamPdf = (x, a, b) => {
  if (x < 0) return 0;
  if (x === 0) return a < 1 ? Infinity : a === 1 ? 1 / b : 0;
  return Math.exp((a - 1) * Math.log(x) - x / b - gammaln(a) - a * Math.log(b));
};
def('gam', {
  name: 'Gamma', cls: 'GammaDistribution', pnames: ['a', 'b'], defaults: [undefined, 1], pdesc: ['Shape', 'Scale'], pos: [true, true],
  valid: ([a, b]) => a > 0 && b > 0,
  pdf: (x, [a, b]) => gamPdf(x, a, b),
  cdf: (x, [a, b], up) => gammainc(Math.max(x, 0) / b, a, !!up),
  inv: (q, [a, b]) => b * gammaincinv(q, a),
  rnd: (g, [a, b]) => b * gammaRnd(g, a),
  stat: ([a, b]) => [a * b, a * b * b],
  support: () => [0, Infinity],
  fit: (x) => {
    if (x.some((v) => v <= 0)) return nelderFit(DIST.gam, x, [meanA(x) ** 2 / varA(x), varA(x) / meanA(x)]);
    const m = meanA(x); const s = Math.log(m) - meanA(x.map(Math.log));
    let a = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
    for (let i = 0; i < 100; i++) { const d = (Math.log(a) - digamma(a) - s) / (1 / a - trigamma(a)); let an = a - d; if (an <= 0) an = a / 2; if (Math.abs(an - a) < 1e-15 * a) { a = an; break; } a = an; }
    return [a, m / a];
  },
});
def('beta', {
  name: 'Beta', cls: 'BetaDistribution', pnames: ['a', 'b'], defaults: [undefined, undefined], pdesc: ['First shape parameter', 'Second shape parameter'], pos: [true, true],
  valid: ([a, b]) => a > 0 && b > 0,
  pdf: (x, [a, b]) => {
    if (x < 0 || x > 1) return 0;
    if (x === 0) return a < 1 ? Infinity : a === 1 ? b : 0;
    if (x === 1) return b < 1 ? Infinity : b === 1 ? a : 0;
    return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - betaln(a, b));
  },
  cdf: (x, [a, b], up) => betainc(Math.min(Math.max(x, 0), 1), a, b, !!up),
  inv: (q, [a, b]) => betaincinv(q, a, b),
  rnd: (g, [a, b]) => { const x = gammaRnd(g, a), y = gammaRnd(g, b); return x / (x + y); },
  stat: ([a, b]) => [a / (a + b), a * b / ((a + b) ** 2 * (a + b + 1))],
  support: () => [0, 1],
  fit: (x) => { const m = meanA(x), v = varA(x); const c = m * (1 - m) / v - 1; return nelderFit(DIST.beta, x, [Math.max(m * c, 0.1), Math.max((1 - m) * c, 0.1)]); },
});
def('chi2', {
  name: 'Chi-square', cls: 'ChiSquareDistribution', pnames: ['nu'], defaults: [undefined], pdesc: ['Degrees of freedom'], pos: [true],
  valid: ([v]) => v > 0,
  pdf: (x, [v]) => gamPdf(x, v / 2, 2),
  cdf: (x, [v], up) => gammainc(Math.max(x, 0) / 2, v / 2, !!up),
  inv: (q, [v]) => 2 * gammaincinv(q, v / 2),
  rnd: (g, [v]) => 2 * gammaRnd(g, v / 2),
  stat: ([v]) => [v, 2 * v],
  support: () => [0, Infinity],
});
function ncxTerms(d) { const h = d / 2; const sd = Math.sqrt(h); return [Math.max(0, Math.floor(h - 12 * sd - 20)), Math.ceil(h + 12 * sd + 40)]; }
const poisW = (j, h) => (h === 0 ? (j === 0 ? 1 : 0) : Math.exp(-h + j * Math.log(h) - gammaln(j + 1)));
def('ncx2', {
  name: 'Noncentral Chi-square', cls: 'NoncentralChiSquareDistribution', pnames: ['nu', 'delta'], defaults: [undefined, undefined], pdesc: ['Degrees of freedom', 'Noncentrality'],
  valid: ([v, d]) => v > 0 && d >= 0,
  pdf: (x, [v, d]) => { if (x < 0) return 0; const [j0, j1] = ncxTerms(d); let s = 0; for (let j = j0; j <= j1; j++) s += poisW(j, d / 2) * gamPdf(x, v / 2 + j, 2); return s; },
  cdf: (x, [v, d], up) => { if (x <= 0) return up ? 1 : 0; const [j0, j1] = ncxTerms(d); let s = 0; for (let j = j0; j <= j1; j++) s += poisW(j, d / 2) * gammainc(x / 2, v / 2 + j, !!up); return Math.min(1, s); },
  inv: (q, p) => (q < 0 || q > 1 ? NaN : q === 0 ? 0 : q === 1 ? Infinity : invertMonotone((x) => DIST.ncx2.cdf(x, p), q, 0, p[0] + p[1] + 10, 1e-14)),
  rnd: (g, [v, d]) => 2 * gammaRnd(g, v / 2 + poissRnd(g, d / 2)),
  stat: ([v, d]) => [v + d, 2 * (v + 2 * d)],
  support: () => [0, Infinity],
});
const tCdf = (x, v, up) => {
  if (Number.isNaN(x)) return NaN;
  if (up) x = -x;
  if (v === Infinity) return Phi(x);
  const x2 = x * x;
  const tail = x2 < v ? 0.5 * betainc(x2 / (v + x2), 0.5, v / 2, true) : 0.5 * betainc(v / (v + x2), v / 2, 0.5);
  return x < 0 ? tail : 1 - tail;
};
const tInv = (q, v) => {
  if (Number.isNaN(q) || q < 0 || q > 1) return NaN;
  if (q === 0) return -Infinity; if (q === 1) return Infinity; if (q === 0.5) return 0;
  if (v === Infinity) return norminv(q);
  if (v === 1) return Math.tan(Math.PI * (q - 0.5));
  const qq = Math.min(q, 1 - q); const y = betaincinv(2 * qq, v / 2, 0.5);
  const x = Math.sqrt(v * (1 - y) / y);
  return q < 0.5 ? -x : x;
};
def('t', {
  name: "Student's t", cls: 'tDistribution', pnames: ['nu'], defaults: [undefined], pdesc: ['Degrees of freedom'], pos: [true],
  valid: ([v]) => v > 0,
  pdf: (x, [v]) => (v === Infinity ? Math.exp(-0.5 * x * x) / 2.5066282746310002 : Math.exp(gammaln((v + 1) / 2) - gammaln(v / 2) - 0.5 * Math.log(v * Math.PI) - (v + 1) / 2 * Math.log1p(x * x / v))),
  cdf: (x, [v], up) => tCdf(x, v, up),
  inv: (q, [v]) => tInv(q, v),
  rnd: (g, [v]) => g.randn() / Math.sqrt(2 * gammaRnd(g, v / 2) / v),
  stat: ([v]) => [v > 1 ? 0 : NaN, v > 2 ? v / (v - 2) : v > 1 ? Infinity : NaN],
  support: () => [-Infinity, Infinity],
});
def('f', {
  name: 'F', cls: 'FDistribution', pnames: ['nu1', 'nu2'], defaults: [undefined, undefined], pdesc: ['Numerator degrees of freedom', 'Denominator degrees of freedom'], pos: [true, true],
  valid: ([a, b]) => a > 0 && b > 0,
  pdf: (x, [a, b]) => {
    if (x < 0) return 0;
    if (x === 0) return a < 2 ? Infinity : a === 2 ? 1 : 0;
    return Math.exp(0.5 * a * Math.log(a) + 0.5 * b * Math.log(b) + (a / 2 - 1) * Math.log(x) - (a + b) / 2 * Math.log(b + a * x) - betaln(a / 2, b / 2));
  },
  cdf: (x, [a, b], up) => (x <= 0 ? (up ? 1 : 0) : betainc(a * x / (a * x + b), a / 2, b / 2, !!up)),
  inv: (q, [a, b]) => { if (Number.isNaN(q) || q < 0 || q > 1) return NaN; if (q === 1) return Infinity; const y = betaincinv(q, a / 2, b / 2); return b * y / (a * (1 - y)); },
  rnd: (g, [a, b]) => (gammaRnd(g, a / 2) / a) / (gammaRnd(g, b / 2) / b),
  stat: ([a, b]) => [b > 2 ? b / (b - 2) : NaN, b > 4 ? 2 * b * b * (a + b - 2) / (a * (b - 2) ** 2 * (b - 4)) : NaN],
  support: () => [0, Infinity],
});
def('bino', {
  name: 'Binomial', cls: 'BinomialDistribution', pnames: ['N', 'p'], defaults: [undefined, undefined], pdesc: ['Number of trials', 'Probability of success'], discrete: true,
  valid: ([n, p]) => n >= 0 && isInt(n) && p >= 0 && p <= 1,
  pdf: (x, [n, p]) => {
    if (!isInt(x) || x < 0 || x > n) return 0;
    if (p === 0) return x === 0 ? 1 : 0; if (p === 1) return x === n ? 1 : 0;
    return Math.exp(lnchoose(n, x) + x * Math.log(p) + (n - x) * Math.log1p(-p));
  },
  cdf: (x, [n, p], up) => {
    let c; if (x < 0) c = 0; else if (x >= n) c = 1; else { const k = Math.floor(x); if (p === 0) c = 1; else if (p === 1) c = 0; else return betainc(1 - p, n - k, k + 1, !!up); }
    return up ? 1 - c : c;
  },
  inv: (q, [n, p]) => discreteInv((x) => DIST.bino.cdf(x, [n, p]), q, n * p + Math.sqrt(n * p * (1 - p)) * norminv(Math.min(Math.max(q, 1e-12), 1 - 1e-12)), 0, n),
  rnd: (g, [n, p]) => binoRnd(g, n, p),
  stat: ([n, p]) => [n * p, n * p * (1 - p)],
  support: ([n]) => [0, n],
});
def('poiss', {
  name: 'Poisson', cls: 'PoissonDistribution', pnames: ['lambda'], defaults: [undefined], pdesc: ['Mean'], discrete: true, pos: [true],
  valid: ([l]) => l >= 0,
  pdf: (x, [l]) => (!isInt(x) || x < 0 ? 0 : l === 0 ? (x === 0 ? 1 : 0) : Math.exp(-l + x * Math.log(l) - gammaln(x + 1))),
  cdf: (x, [l], up) => { if (x < 0) return up ? 1 : 0; if (l === 0) return up ? 0 : 1; if (x === Infinity) return up ? 0 : 1; return gammainc(l, Math.floor(x) + 1, !up); },
  inv: (q, [l]) => discreteInv((x) => DIST.poiss.cdf(x, [l]), q, l + Math.sqrt(l) * norminv(Math.min(Math.max(q, 1e-12), 1 - 1e-12)), 0, Infinity),
  rnd: (g, [l]) => poissRnd(g, l),
  stat: ([l]) => [l, l],
  support: () => [0, Infinity],
  fit: (x) => [meanA(x)],
});
def('geo', {
  name: 'Geometric', cls: 'GeometricDistribution', pnames: ['p'], defaults: [undefined], pdesc: ['Probability of success'], discrete: true,
  valid: ([p]) => p > 0 && p <= 1,
  pdf: (x, [p]) => (!isInt(x) || x < 0 ? 0 : p * Math.pow(1 - p, x)),
  cdf: (x, [p], up) => { if (x < 0) return up ? 1 : 0; const k = Math.floor(x) + 1; return up ? Math.exp(k * Math.log1p(-p)) : -Math.expm1(k * Math.log1p(-p)); },
  inv: (q, [p]) => (q < 0 || q > 1 ? NaN : q === 1 ? Infinity : Math.max(Math.ceil(Math.log1p(-q) / Math.log1p(-p) - 1 - 1e-12), 0)),
  rnd: (g, [p]) => (p === 1 ? 0 : Math.floor(Math.log(g.rand()) / Math.log1p(-p))),
  stat: ([p]) => [(1 - p) / p, (1 - p) / (p * p)],
  support: () => [0, Infinity],
  fit: (x) => [1 / (1 + meanA(x))],
});
def('nbin', {
  name: 'Negative Binomial', cls: 'NegativeBinomialDistribution', pnames: ['R', 'p'], defaults: [undefined, undefined], pdesc: ['Number of successes', 'Probability of success'], discrete: true, pos: [true, false],
  valid: ([r, p]) => r > 0 && p > 0 && p <= 1,
  pdf: (x, [r, p]) => (!isInt(x) || x < 0 ? 0 : p === 1 ? (x === 0 ? 1 : 0) : Math.exp(gammaln(r + x) - gammaln(x + 1) - gammaln(r) + r * Math.log(p) + x * Math.log1p(-p))),
  cdf: (x, [r, p], up) => (x < 0 ? (up ? 1 : 0) : p === 1 ? (up ? 0 : 1) : betainc(p, r, Math.floor(x) + 1, !!up)),
  inv: (q, [r, p]) => { const m = r * (1 - p) / p, s = Math.sqrt(r * (1 - p)) / p; return discreteInv((x) => DIST.nbin.cdf(x, [r, p]), q, m + s * norminv(Math.min(Math.max(q, 1e-12), 1 - 1e-12)), 0, Infinity); },
  rnd: (g, [r, p]) => (p === 1 ? 0 : poissRnd(g, gammaRnd(g, r) * (1 - p) / p)),
  stat: ([r, p]) => [r * (1 - p) / p, r * (1 - p) / (p * p)],
  support: () => [0, Infinity],
  fit: (x) => { const m = meanA(x), v = varA(x); const r0 = v > m ? m * m / (v - m) : 10; return nelderFit(DIST.nbin, x, [r0, r0 / (r0 + m)]); },
});
const hygeRange = ([M, K, N]) => [Math.max(0, N - (M - K)), Math.min(N, K)];
def('hyge', {
  name: 'Hypergeometric', cls: 'HypergeometricDistribution', pnames: ['M', 'K', 'N'], defaults: [undefined, undefined, undefined], pdesc: ['Population size', 'Number of items with the property', 'Number of samples drawn'], discrete: true,
  valid: ([M, K, N]) => isInt(M) && isInt(K) && isInt(N) && M >= 0 && K >= 0 && N >= 0 && K <= M && N <= M,
  pdf: (x, p) => { const [lo, hi] = hygeRange(p); const [M, K, N] = p; if (!isInt(x) || x < lo || x > hi) return 0; return Math.exp(lnchoose(K, x) + lnchoose(M - K, N - x) - lnchoose(M, N)); },
  cdf: (x, p, up) => { const [lo, hi] = hygeRange(p); let c; if (x < lo) c = 0; else if (x >= hi) c = 1; else { c = 0; for (let k = lo; k <= Math.floor(x); k++) c += DIST.hyge.pdf(k, p); c = Math.min(c, 1); } return up ? 1 - c : c; },
  inv: (q, p) => { const [lo, hi] = hygeRange(p); return discreteInv((x) => DIST.hyge.cdf(x, p), q, lo, lo, hi); },
  rnd: (g, p) => DIST.hyge.inv(g.rand(), p),
  stat: ([M, K, N]) => [N * K / M, N * K / M * (M - K) / M * (M - N) / (M - 1)],
  support: (p) => hygeRange(p),
});
def('logn', {
  name: 'Lognormal', cls: 'LognormalDistribution', pnames: ['mu', 'sigma'], defaults: [0, 1], pdesc: ['Log mean', 'Log standard deviation'], pos: [false, true],
  valid: ([m, s]) => s > 0,
  pdf: (x, [m, s]) => { if (x <= 0) return 0; const z = (Math.log(x) - m) / s; return Math.exp(-0.5 * z * z) / (x * s * 2.5066282746310002); },
  cdf: (x, [m, s], up) => (x <= 0 ? (up ? 1 : 0) : up ? PhiU((Math.log(x) - m) / s) : Phi((Math.log(x) - m) / s)),
  inv: (q, [m, s]) => Math.exp(m + s * norminv(q)),
  rnd: (g, [m, s]) => Math.exp(m + s * g.randn()),
  stat: ([m, s]) => [Math.exp(m + s * s / 2), Math.exp(2 * m + s * s) * Math.expm1(s * s)],
  support: () => [0, Infinity],
  fit: (x) => { const l = x.map(Math.log); return [meanA(l), stdA(l)]; },
});
def('wbl', {
  name: 'Weibull', cls: 'WeibullDistribution', pnames: ['A', 'B'], defaults: [1, 1], pdesc: ['Scale', 'Shape'], pos: [true, true],
  valid: ([a, b]) => a > 0 && b > 0,
  pdf: (x, [a, b]) => { if (x < 0) return 0; if (x === 0) return b < 1 ? Infinity : b === 1 ? 1 / a : 0; const z = x / a; return (b / a) * Math.pow(z, b - 1) * Math.exp(-Math.pow(z, b)); },
  cdf: (x, [a, b], up) => (x <= 0 ? (up ? 1 : 0) : up ? Math.exp(-Math.pow(x / a, b)) : -Math.expm1(-Math.pow(x / a, b))),
  inv: (q, [a, b]) => (q < 0 || q > 1 ? NaN : a * Math.pow(-Math.log1p(-q), 1 / b)),
  rnd: (g, [a, b]) => a * Math.pow(-Math.log(g.rand()), 1 / b),
  stat: ([a, b]) => { const g1 = gammaFn(1 + 1 / b); return [a * g1, a * a * (gammaFn(1 + 2 / b) - g1 * g1)]; },
  support: () => [0, Infinity],
  fit: (x) => {
    const l = x.map(Math.log); const ml = meanA(l);
    const f = (b) => { let s0 = 0, s1 = 0; const mx = Math.max(...l); for (const v of l) { const w = Math.exp(b * (v - mx)); s0 += w; s1 += w * v; } return s1 / s0 - 1 / b - ml; };
    const b = brent(f, 0.5 / (stdA(l) || 1), 3 / (stdA(l) || 1));
    let s = 0; for (const v of x) s += Math.pow(v, b);
    return [Math.pow(s / x.length, 1 / b), b];
  },
});
def('ev', {
  name: 'Extreme Value', cls: 'ExtremeValueDistribution', pnames: ['mu', 'sigma'], defaults: [0, 1], pdesc: ['Location', 'Scale'], pos: [false, true],
  valid: ([m, s]) => s > 0,
  pdf: (x, [m, s]) => { const z = (x - m) / s; return Math.exp(z - Math.exp(z)) / s; },
  cdf: (x, [m, s], up) => { const z = (x - m) / s; return up ? Math.exp(-Math.exp(z)) : -Math.expm1(-Math.exp(z)); },
  inv: (q, [m, s]) => (q < 0 || q > 1 ? NaN : m + s * Math.log(-Math.log1p(-q))),
  rnd: (g, [m, s]) => m + s * Math.log(-Math.log(g.rand())),
  stat: ([m, s]) => [m - EULER * s, Math.PI * Math.PI * s * s / 6],
  support: () => [-Infinity, Infinity],
  fit: (x) => {
    const mx = Math.max(...x), mean = meanA(x);
    const f = (s) => { let s0 = 0, s1 = 0; for (const v of x) { const w = Math.exp((v - mx) / s); s0 += w; s1 += w * v; } return s1 / s0 - mean - s; };
    const sd = stdA(x) || 1; const s = brent(f, sd * 0.3, sd * 2);
    let s0 = 0; for (const v of x) s0 += Math.exp((v - mx) / s);
    return [mx + s * Math.log(s0 / x.length), s];
  },
});
def('gev', {
  name: 'Generalized Extreme Value', cls: 'GeneralizedExtremeValueDistribution', pnames: ['k', 'sigma', 'mu'], defaults: [undefined, undefined, undefined], pdesc: ['Shape', 'Scale', 'Location'], pos: [false, true, false],
  valid: ([k, s]) => s > 0,
  pdf: (x, [k, s, m]) => {
    const z = (x - m) / s;
    if (Math.abs(k) < 1e-12) { const t = Math.exp(-z); return t * Math.exp(-t) / s; }
    const u = 1 + k * z; if (u <= 0) return 0;
    const t = Math.pow(u, -1 / k); return Math.pow(t, k + 1) * Math.exp(-t) / s;
  },
  cdf: (x, [k, s, m], up) => {
    const z = (x - m) / s; let c;
    if (Math.abs(k) < 1e-12) c = Math.exp(-Math.exp(-z));
    else { const u = 1 + k * z; c = u <= 0 ? (k > 0 ? 0 : 1) : Math.exp(-Math.pow(u, -1 / k)); }
    return up ? 1 - c : c;
  },
  inv: (q, [k, s, m]) => { if (q < 0 || q > 1) return NaN; const L = -Math.log(q); return Math.abs(k) < 1e-12 ? m - s * Math.log(L) : m + s * Math.expm1(-k * Math.log(L)) / k; },
  rnd: (g, p) => DIST.gev.inv(g.rand(), p),
  stat: ([k, s, m]) => {
    const mean = Math.abs(k) < 1e-12 ? m + EULER * s : k < 1 ? m + s * (gammaFn(1 - k) - 1) / k : Infinity;
    const v = Math.abs(k) < 1e-12 ? Math.PI ** 2 * s * s / 6 : k < 0.5 ? s * s * (gammaFn(1 - 2 * k) - gammaFn(1 - k) ** 2) / (k * k) : Infinity;
    return [mean, v];
  },
  support: ([k, s, m]) => (k > 0 ? [m - s / k, Infinity] : k < 0 ? [-Infinity, m - s / k] : [-Infinity, Infinity]),
  fit: (x) => { const s = stdA(x) * Math.sqrt(6) / Math.PI; return nelderFit(DIST.gev, x, [0.1, s, meanA(x) - EULER * s]); },
});
def('gp', {
  name: 'Generalized Pareto', cls: 'GeneralizedParetoDistribution', pnames: ['k', 'sigma', 'theta'], defaults: [undefined, undefined, 0], pdesc: ['Shape', 'Scale', 'Location'], pos: [false, true, false], fixed: [false, false, true],
  valid: ([k, s]) => s > 0,
  pdf: (x, [k, s, th]) => {
    const z = (x - th) / s; if (z < 0) return 0;
    if (Math.abs(k) < 1e-12) return Math.exp(-z) / s;
    if (k < 0 && z > -1 / k) return 0;
    return Math.pow(1 + k * z, -1 - 1 / k) / s;
  },
  cdf: (x, [k, s, th], up) => {
    const z = (x - th) / s; let c;
    if (z <= 0) c = 0; else if (Math.abs(k) < 1e-12) c = -Math.expm1(-z); else if (k < 0 && z >= -1 / k) c = 1; else c = -Math.expm1(-Math.log1p(k * z) / k);
    return up ? 1 - c : c;
  },
  inv: (q, [k, s, th]) => { if (q < 0 || q > 1) return NaN; return Math.abs(k) < 1e-12 ? th - s * Math.log1p(-q) : th + s * Math.expm1(-k * Math.log1p(-q)) / k; },
  rnd: (g, p) => DIST.gp.inv(g.rand(), p),
  stat: ([k, s, th]) => [k < 1 ? th + s / (1 - k) : Infinity, k < 0.5 ? s * s / ((1 - k) ** 2 * (1 - 2 * k)) : Infinity],
  support: ([k, s, th]) => [th, k < 0 ? th - s / k : Infinity],
  fit: (x, fixedTheta = 0) => { const y = x.map((v) => v - fixedTheta); const m = meanA(y), v = varA(y); const k0 = 0.5 * (1 - m * m / v); const r = nelderFit({ ...DIST.gp, pdf: (t, [k, s]) => DIST.gp.pdf(t, [k, s, 0]), valid: ([k, s]) => s > 0 }, y, [k0, 0.5 * m * (1 + m * m / v)]); return [r[0], r[1], fixedTheta]; },
});
def('rayl', {
  name: 'Rayleigh', cls: 'RayleighDistribution', pnames: ['B'], defaults: [1], pdesc: ['Scale'], pos: [true],
  valid: ([b]) => b > 0,
  pdf: (x, [b]) => (x < 0 ? 0 : x / (b * b) * Math.exp(-x * x / (2 * b * b))),
  cdf: (x, [b], up) => (x <= 0 ? (up ? 1 : 0) : up ? Math.exp(-x * x / (2 * b * b)) : -Math.expm1(-x * x / (2 * b * b))),
  inv: (q, [b]) => (q < 0 || q > 1 ? NaN : Math.sqrt(-2 * b * b * Math.log1p(-q))),
  rnd: (g, [b]) => b * Math.sqrt(-2 * Math.log(g.rand())),
  stat: ([b]) => [b * Math.sqrt(Math.PI / 2), (4 - Math.PI) / 2 * b * b],
  support: () => [0, Infinity],
  fit: (x) => [Math.sqrt(sumA(x.map((v) => v * v)) / (2 * x.length))],
});
// families available through makedist / pdf('name', ...) only
def('logistic', {
  name: 'Logistic', cls: 'LogisticDistribution', pnames: ['mu', 'sigma'], defaults: [0, 1], pdesc: ['Location', 'Scale'], pos: [false, true], noFns: true,
  valid: ([m, s]) => s > 0,
  pdf: (x, [m, s]) => { const z = -Math.abs((x - m) / s); const e = Math.exp(z); return e / (s * (1 + e) ** 2); },
  cdf: (x, [m, s], up) => { const z = (x - m) / s; return 1 / (1 + Math.exp(up ? z : -z)); },
  inv: (q, [m, s]) => (q < 0 || q > 1 ? NaN : m + s * Math.log(q / (1 - q))),
  rnd: (g, p) => DIST.logistic.inv(g.rand(), p),
  stat: ([m, s]) => [m, s * s * Math.PI * Math.PI / 3],
  support: () => [-Infinity, Infinity],
  fit: (x) => nelderFit(DIST.logistic, x, [medianOf(x), stdA(x) * Math.sqrt(3) / Math.PI]),
});
def('tri', {
  name: 'Triangular', cls: 'TriangularDistribution', pnames: ['A', 'B', 'C'], defaults: [0, 0.5, 1], pdesc: ['Lower limit', 'Peak location', 'Upper limit'], noFns: true,
  valid: ([a, b, c]) => a <= b && b <= c && a < c,
  pdf: (x, [a, b, c]) => (x < a || x > c ? 0 : x < b ? 2 * (x - a) / ((c - a) * (b - a)) : x === b ? 2 / (c - a) : 2 * (c - x) / ((c - a) * (c - b))),
  cdf: (x, [a, b, c], up) => { const r = x <= a ? 0 : x >= c ? 1 : x <= b ? (x - a) ** 2 / ((c - a) * (b - a)) : 1 - (c - x) ** 2 / ((c - a) * (c - b)); return up ? 1 - r : r; },
  inv: (q, [a, b, c]) => (q < 0 || q > 1 ? NaN : q < (b - a) / (c - a) ? a + Math.sqrt(q * (c - a) * (b - a)) : c - Math.sqrt((1 - q) * (c - a) * (c - b))),
  rnd: (g, p) => DIST.tri.inv(g.rand(), p),
  stat: ([a, b, c]) => [(a + b + c) / 3, (a * a + b * b + c * c - a * b - a * c - b * c) / 18],
  support: ([a, , c]) => [a, c],
});
def('tls', {
  name: 't Location-Scale', cls: 'tLocationScaleDistribution', pnames: ['mu', 'sigma', 'nu'], defaults: [0, 1, 1], pdesc: ['Location', 'Scale', 'Degrees of freedom'], pos: [false, true, true], noFns: true,
  valid: ([m, s, v]) => s > 0 && v > 0,
  pdf: (x, [m, s, v]) => DIST.t.pdf((x - m) / s, [v]) / s,
  cdf: (x, [m, s, v], up) => tCdf((x - m) / s, v, up),
  inv: (q, [m, s, v]) => m + s * tInv(q, v),
  rnd: (g, [m, s, v]) => m + s * DIST.t.rnd(g, [v]),
  stat: ([m, s, v]) => [v > 1 ? m : NaN, v > 2 ? s * s * v / (v - 2) : v > 1 ? Infinity : NaN],
  support: () => [-Infinity, Infinity],
  fit: (x) => nelderFit(DIST.tls, x, [medianOf(x), stdA(x), 5]),
});
def('hn', {
  name: 'Half Normal', cls: 'HalfNormalDistribution', pnames: ['mu', 'sigma'], defaults: [0, 1], pdesc: ['Location', 'Scale'], pos: [false, true], fixed: [true, false], noFns: true,
  valid: ([m, s]) => s > 0,
  pdf: (x, [m, s]) => (x < m ? 0 : 2 * Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * 2.5066282746310002)),
  cdf: (x, [m, s], up) => { const c = x <= m ? 0 : 1 - 2 * PhiU((x - m) / s); return up ? 1 - c : c; },
  inv: (q, [m, s]) => (q < 0 || q > 1 ? NaN : m + s * norminv((1 + q) / 2)),
  rnd: (g, [m, s]) => m + s * Math.abs(g.randn()),
  stat: ([m, s]) => [m + s * Math.sqrt(2 / Math.PI), s * s * (1 - 2 / Math.PI)],
  support: ([m]) => [m, Infinity],
  fit: (x, mu = 0) => [mu, Math.sqrt(meanA(x.map((v) => (v - mu) ** 2)))],
});
function medianOf(x) { const s = sorted(x); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

// ------------------------------------------------------------ likelihood and fitting
export function negLogLik(D, x, p, freq) {
  if (!D.valid(p)) return Infinity;
  let s = 0;
  for (let i = 0; i < x.length; i++) { const f = D.pdf(x[i], p); s -= (freq ? freq[i] : 1) * Math.log(f); }
  return Number.isNaN(s) ? Infinity : s;
}
/** Generic MLE by Nelder–Mead in a log-transformed space for positive parameters. */
export function nelderFit(D, x, p0) {
  const pos = D.pos || D.pnames.map(() => false);
  const to = (p) => p.map((v, i) => (pos[i] ? Math.log(Math.max(v, 1e-300)) : v));
  const from = (q) => q.map((v, i) => (pos[i] ? Math.exp(v) : v));
  let r = nelderMead((q) => negLogLik(D, x, from(q)), to(p0));
  r = nelderMead((q) => negLogLik(D, x, from(q)), r.x);
  return from(r.x);
}
/** Fits a family to data; returns parameter array. opts: {ntrials, theta, mu}. */
export function fitFamily(D, x, opts = {}) {
  if (!x.length) throw E('fitdist:noData', 'There is no data to fit.');
  if (D.key === 'bino') { const n = opts.ntrials; if (n == null) throw E('fitdist:noNTrials', "The 'NTrials' value is required for the Binomial distribution."); return [n, meanA(x) / n]; }
  if (D.key === 'gp') return D.fit(x, opts.theta || 0);
  if (D.key === 'hn') return D.fit(x, opts.mu || 0);
  if (D.fit) return D.fit(x);
  throw E('fitdist:noFit', `Fitting is not supported for the ${D.name} distribution.`);
}
/** Asymptotic covariance of the parameters from a numerical Hessian of the negative log likelihood. */
export function paramCov(D, x, p, fixed = []) {
  const free = p.map((_, i) => !fixed[i]).map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const k = free.length; const Hm = Array.from({ length: k }, () => new Array(k).fill(0));
  const f = (q) => negLogLik(D, x, q);
  const h = free.map((i) => 1e-4 * Math.max(Math.abs(p[i]), 1e-2));
  const at = (d) => { const q = p.slice(); d.forEach(([i, v]) => { q[free[i]] += v; }); return f(q); };
  const f0 = f(p);
  for (let a = 0; a < k; a++) for (let b = a; b < k; b++) {
    let v;
    if (a === b) v = (at([[a, h[a]]]) - 2 * f0 + at([[a, -h[a]]])) / (h[a] * h[a]);
    else v = (at([[a, h[a]], [b, h[b]]]) - at([[a, h[a]], [b, -h[b]]]) - at([[a, -h[a]], [b, h[b]]]) + at([[a, -h[a]], [b, -h[b]]])) / (4 * h[a] * h[b]);
    Hm[a][b] = Hm[b][a] = v;
  }
  const C = invM(Hm) || Hm.map((r) => r.map(() => NaN));
  const full = p.map(() => p.map(() => 0));
  free.forEach((i, a) => free.forEach((j, b) => { full[i][j] = C[a][b]; }));
  return full;
}
/** Exact covariance where known. */
export function covFor(D, x, p) {
  const n = x.length;
  if (D.key === 'norm') { return [[p[1] ** 2 / n, 0], [0, p[1] ** 2 / (2 * (n - 1))]]; }
  if (D.key === 'exp') return [[p[0] ** 2 / n]];
  if (D.key === 'poiss') return [[p[0] / n]];
  if (D.key === 'logn') return [[p[1] ** 2 / n, 0], [0, p[1] ** 2 / (2 * (n - 1))]];
  if (D.key === 'bino') return [[0, 0], [0, p[1] * (1 - p[1]) / (n * p[0])]];
  if (D.key === 'unif') return [[0, 0], [0, 0]];
  return paramCov(D, x, p, D.fixed || []);
}
/** Confidence intervals [lo[], hi[]] for fitted parameters. */
export function paramCI(D, x, p, alpha = 0.05, cov = null) {
  const n = x.length; const z = norminv(1 - alpha / 2);
  if (D.key === 'norm' || D.key === 'logn') {
    const xs = D.key === 'logn' ? x.map(Math.log) : x; const s = stdA(xs), m = meanA(xs);
    const tc = tInv(1 - alpha / 2, n - 1);
    return [[m - tc * s / Math.sqrt(n), s * Math.sqrt((n - 1) / (2 * gammaincinv(1 - alpha / 2, (n - 1) / 2)))], [m + tc * s / Math.sqrt(n), s * Math.sqrt((n - 1) / (2 * gammaincinv(alpha / 2, (n - 1) / 2)))]];
  }
  if (D.key === 'exp') { const s = sumA(x); return [[2 * s / (2 * gammaincinv(1 - alpha / 2, n))], [2 * s / (2 * gammaincinv(alpha / 2, n))]]; }
  if (D.key === 'poiss') { const s = sumA(x); return [[s === 0 ? 0 : gammaincinv(alpha / 2, s) / n], [gammaincinv(1 - alpha / 2, s + 1) / n]]; }
  if (D.key === 'bino') { const [N, ph] = p; const ci = clopperPearson(sumA(x), N * n, alpha); return [[N, ci[0]], [N, ci[1]]]; }
  if (D.key === 'unif') { return [[p[0] - (p[1] - p[0]) * (Math.pow(alpha, -1 / n) - 1), p[1]], [p[0], p[1] + (p[1] - p[0]) * (Math.pow(alpha, -1 / n) - 1)]]; }
  const C = cov || covFor(D, x, p); const pos = D.pos || [];
  const lo = [], hi = [];
  p.forEach((v, i) => {
    const se = Math.sqrt(Math.max(C[i][i], 0));
    if (pos[i]) { lo.push(v * Math.exp(-z * se / v)); hi.push(v * Math.exp(z * se / v)); } else { lo.push(v - z * se); hi.push(v + z * se); }
  });
  return [lo, hi];
}
export function clopperPearson(k, n, alpha) {
  const lo = k === 0 ? 0 : betaincinv(alpha / 2, k, n - k + 1);
  const hi = k === n ? 1 : betaincinv(1 - alpha / 2, k + 1, n - k);
  return [lo, hi];
}

// ------------------------------------------------------------ name lookup
const ALIASES = {
  normal: 'norm', norm: 'norm', gaussian: 'norm', uniform: 'unif', unif: 'unif', discreteuniform: 'unid', unid: 'unid',
  exponential: 'exp', exp: 'exp', gamma: 'gam', gam: 'gam', beta: 'beta', chi2: 'chi2', chisquare: 'chi2', chisquared: 'chi2',
  noncentralchisquare: 'ncx2', ncx2: 'ncx2', t: 't', studentt: 't', "student'st": 't', f: 'f', binomial: 'bino', bino: 'bino', poisson: 'poiss', poiss: 'poiss',
  geometric: 'geo', geo: 'geo', negativebinomial: 'nbin', nbin: 'nbin', hypergeometric: 'hyge', hyge: 'hyge', lognormal: 'logn', logn: 'logn',
  weibull: 'wbl', wbl: 'wbl', extremevalue: 'ev', ev: 'ev', generalizedextremevalue: 'gev', gev: 'gev', generalizedpareto: 'gp', gp: 'gp',
  rayleigh: 'rayl', rayl: 'rayl', logistic: 'logistic', triangular: 'tri', tri: 'tri', tlocationscale: 'tls', halfnormal: 'hn',
};
export function distByName(name) {
  const k = ALIASES[String(name).toLowerCase().replace(/[\s_-]/g, '')];
  if (!k) throw E('stats:unknownDistribution', `Unrecognized distribution name: '${name}'.`);
  return DIST[k];
}

// ------------------------------------------------------------ builtin generators
function stripUpper(args) {
  if (args.length && isText(args[args.length - 1]) && toStr(args[args.length - 1]).toLowerCase() === 'upper') return [args.slice(0, -1), true];
  return [args, false];
}
function paramVals(D, args, start, fname) {
  const out = [];
  for (let i = 0; i < D.pnames.length; i++) {
    const a = args[start + i];
    if (a == null || isEmptyV(a)) {
      if (D.defaults[i] === undefined) throw E(`${fname}:tooFewInputs`, `${fname} requires ${D.pnames.length + (start ? 1 : 0)} input arguments.`);
      out.push(D.defaults[i]);
    } else out.push(a);
  }
  return out;
}
const safe = (D, f) => (...a) => { const p = a.slice(1); for (const v of p) if (Number.isNaN(v)) return NaN; if (!D.valid(p)) return NaN; return f(a[0], p); };
export function famPdf(D, fname) { return (args) => { if (!args.length) throw E(`${fname}:tooFewInputs`, `${fname} requires at least one input.`); return ew([args[0], ...paramVals(D, args, 1, fname)], safe(D, (x, p) => (Number.isNaN(x) ? NaN : D.pdf(x, p)))); }; }
export function famCdf(D, fname) {
  return (a0) => {
    const [args, up] = stripUpper(a0); if (!args.length) throw E(`${fname}:tooFewInputs`, `${fname} requires at least one input.`);
    return ew([args[0], ...paramVals(D, args, 1, fname)], safe(D, (x, p) => (Number.isNaN(x) ? NaN : D.cdf(x, p, up))));
  };
}
export function famInv(D, fname) { return (args) => { if (!args.length) throw E(`${fname}:tooFewInputs`, `${fname} requires at least one input.`); return ew([args[0], ...paramVals(D, args, 1, fname)], safe(D, (q, p) => (Number.isNaN(q) || q < 0 || q > 1 ? NaN : D.inv(q, p)))); }; }
export function famRnd(D, fname) {
  return (args, nargout, ctx) => {
    const np = D.pnames.length; const g = globalGen(ctx);
    const params = paramVals(D, args.slice(0, np), 0, fname);
    let target = null;
    if (args.length > np) target = sizeArgs(args.slice(np)).dims;
    return ew(params, (...p) => (p.some(Number.isNaN) || !D.valid(p) ? NaN : D.rnd(g, p)), target);
  };
}
export function famStat(D, fname) { return (args) => { const ps = paramVals(D, args, 0, fname); const { dims, outs } = bcast(ps, 2, (...p) => (p.some(Number.isNaN) || !D.valid(p) ? [NaN, NaN] : D.stat(p))); return outs.map((o) => tensor('double', dims, o)); }; }

/** Data vector of a fit function (NaNs removed). */
const dataOf = (v) => Array.from(F(v)).filter((x) => !Number.isNaN(x));
const rowV = (a) => tensor('double', [1, a.length], Float64Array.from(a));
const ciM = (lo, hi) => { const k = lo.length; const a = new Float64Array(2 * k); for (let i = 0; i < k; i++) { a[2 * i] = lo[i]; a[2 * i + 1] = hi[i]; } return tensor('double', [2, k], a); };
function fitBuiltin(key) {
  const D = DIST[key];
  return (args, nargout) => {
    const x = dataOf(args[0]); const alpha = n1(args[1], 0.05);
    const p = fitFamily(D, x); const [lo, hi] = paramCI(D, x, p, alpha);
    if (key === 'norm') return [num(p[0]), num(p[1]), tensor('double', [2, 1], [lo[0], hi[0]]), tensor('double', [2, 1], [lo[1], hi[1]])];
    if (key === 'exp' || key === 'poiss' || key === 'rayl') return [num(p[0]), tensor('double', [2, 1], [lo[0], hi[0]])];
    if (key === 'unif') return [num(p[0]), num(p[1]), tensor('double', [2, 1], [lo[0], hi[0]]), tensor('double', [2, 1], [lo[1], hi[1]])];
    return [rowV(p), ciM(lo, hi)];
  };
}
function likeBuiltin(key) {
  const D = DIST[key];
  return (args) => {
    const p = Array.from(F(args[0])); const x = dataOf(args[1]);
    const nl = negLogLik(D, x, p);
    const C = paramCov(D, x, p, D.fixed || []);
    return [num(nl), tensor('double', [p.length, p.length], Float64Array.from(C.flat()))];
  };
}

export const builtins = {};
export const help = {};
for (const D of Object.values(DIST)) {
  if (D.noFns) continue;
  const k = D.key; const ps = D.pnames.join(',');
  builtins[k + 'pdf'] = famPdf(D, k + 'pdf');
  builtins[k + 'cdf'] = famCdf(D, k + 'cdf');
  builtins[k + 'inv'] = famInv(D, k + 'inv');
  builtins[k + 'rnd'] = famRnd(D, k + 'rnd');
  builtins[k + 'stat'] = famStat(D, k + 'stat');
  const nm = D.name.toLowerCase(); const kn = D.name;
  help[k + 'pdf'] = H(`${kn} probability density (mass) function.`, `${kn} 분포의 확률 밀도(질량) 함수.`, [`y = ${k}pdf(x, ${ps})`]);
  help[k + 'cdf'] = H(`${kn} cumulative distribution function; 'upper' gives the complement.`, `${kn} 분포의 누적 분포 함수; 'upper'는 여사건 확률.`, [`p = ${k}cdf(x, ${ps})`, `p = ${k}cdf(x, ${ps}, 'upper')`]);
  help[k + 'inv'] = H(`Inverse of the ${nm} cumulative distribution function.`, `${kn} 누적 분포 함수의 역함수.`, [`x = ${k}inv(p, ${ps})`]);
  help[k + 'rnd'] = H(`Random numbers from the ${nm} distribution.`, `${kn} 분포를 따르는 난수.`, [`r = ${k}rnd(${ps})`, `r = ${k}rnd(${ps}, m, n)`, `r = ${k}rnd(${ps}, [sz1 sz2 ...])`]);
  help[k + 'stat'] = H(`Mean and variance of the ${nm} distribution.`, `${kn} 분포의 평균과 분산.`, [`[m, v] = ${k}stat(${ps})`]);
}
for (const k of ['norm', 'exp', 'gam', 'beta', 'poiss', 'logn', 'wbl', 'ev', 'rayl', 'unif', 'gev', 'gp', 'nbin']) {
  const fname = k === 'unif' ? 'unifit' : k + 'fit';
  builtins[fname] = fitBuiltin(k);
  help[fname] = H(`Parameter estimates and confidence intervals for ${DIST[k].name.toLowerCase()} data.`, `${DIST[k].name} 분포 데이터의 모수 추정값과 신뢰 구간.`, k === 'norm' ? ['[muHat, sigmaHat, muCI, sigmaCI] = normfit(x)', '[___] = normfit(x, alpha)'] : [`[parmHat, parmCI] = ${fname}(x)`, `[___] = ${fname}(x, alpha)`]);
}
for (const k of ['norm', 'exp', 'gam', 'beta', 'wbl', 'ev', 'logn', 'gev', 'gp', 'nbin']) {
  builtins[k + 'like'] = likeBuiltin(k);
  help[k + 'like'] = H(`Negative log likelihood of ${DIST[k].name.toLowerCase()} parameters and its asymptotic covariance.`, `${DIST[k].name} 분포 모수의 음의 로그 가능도와 점근 공분산.`, [`[nlogL, avar] = ${k}like(params, x)`]);
}
builtins.binofit = (args) => {
  const xs = F(args[0]), ns = F(args[1]); const alpha = n1(args[2], 0.05);
  const n = Math.max(xs.length, ns.length); const ph = new Float64Array(n), ci = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { const x = xs[xs.length === 1 ? 0 : i], N = ns[ns.length === 1 ? 0 : i]; ph[i] = x / N; const c = clopperPearson(x, N, alpha); ci[i] = c[0]; ci[i + n] = c[1]; }
  return [tensor('double', (args[0].dims && args[0].dims[0] === 1 && n > 1) ? [1, n] : [n, 1], ph), tensor('double', [n, 2], ci)];
};
help.binofit = H('Binomial parameter estimate with Clopper–Pearson confidence interval.', '이항 분포 모수 추정값과 Clopper–Pearson 신뢰 구간.', ['[phat, pci] = binofit(x, n)', '[phat, pci] = binofit(x, n, alpha)']);
export { tCdf, tInv, Phi };
