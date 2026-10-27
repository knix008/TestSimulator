// Statistics submodule of the numerics area: distributions, descriptive
// statistics, hypothesis tests, regression, clustering and PCA.
// The registry holds only the numerics builtins, so other areas cannot interfere.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as stats from '../core/lib/numeric/stats/index.js';
import * as random from '../core/lib/numeric/random.js';
import { num, str, rowVec, colVec, matrix, MError, isFuncHandle, toStr } from '../core/value.js';

const registry = {
  builtins: { ...random.builtins, ...stats.builtins }, owner: {}, help: { ...random.help, ...stats.help },
  classes: { ...random.classes, ...stats.classes }, installs: [random.install],
};
// Same shape as test/helpers/mockctx.mjs, built on the numerics-only registry.
function makeCtx() {
  const out = [];
  const ctx = {
    registry, outText: out, warnings: [], state: {}, format: { numeric: 'short', spacing: 'loose' },
    host: { post() {}, request() { return null; } },
    out(t) { out.push(t); }, errOut(t) { out.push(t); }, warning(id, message) { ctx.warnings.push({ id, message }); },
    onMessage() {}, checkInterrupt() {}, getVar() {}, setVar() {},
    evalString() { throw new MError('test:noInterpreter', 'evalString is not available'); },
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') { const b = registry.builtins[fn]; if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`); r = b(args, nargout, ctx); }
      else if (isFuncHandle(fn) && fn.jsfn) r = fn.jsfn(args, nargout);
      else if (isFuncHandle(fn) && fn.name) return ctx.call(fn.name, args, nargout);
      else throw new MError('test:badCall', 'Cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
  };
  for (const i of registry.installs) i(ctx);
  return ctx;
}
const ctx = makeCtx();
const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
const V = (x) => (typeof x === 'number' ? num(x) : typeof x === 'string' ? str(x) : Array.isArray(x) ? (Array.isArray(x[0]) ? matrix(x) : rowVec(x)) : x);
const call = (name, args, nargout = 1) => ctx.call(name, args.map(V), nargout);
const val = (name, ...args) => call(name, args)[0];
const arr = (v) => Array.from(v.re);
const sc = (name, ...args) => val(name, ...args).re[0];
const close = (a, b, tol = 1e-4, msg = '') => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} expected ${b}, got ${a}`);
const closeArr = (a, b, tol = 1e-4) => { assert.equal(a.length, b.length, 'length'); a.forEach((x, i) => close(x, b[i], tol, `[${i}]`)); };
const field = (s, f) => s.data[0][f];

test('help exists for every statistics builtin (en, ko, syntax)', () => {
  for (const k of Object.keys(stats.builtins)) {
    const h = stats.help[k];
    assert.ok(h && h.en && h.ko && h.syntax && h.syntax.length, `help for ${k}`);
  }
});

test('normal distribution values', () => {
  close(sc('normcdf', 1.96), 0.9750021);
  close(sc('normpdf', 0), 0.3989423);
  close(sc('norminv', 0.975), 1.9599640);
  close(sc('normcdf', 3, 1, 2), 0.8413447);
  close(sc('normcdf', 1.96, 0, 1, 'upper'), 0.0249979, 1e-5);
  const [m, v] = call('normstat', [[1, 2], 3], 2);
  assert.deepEqual(arr(m), [1, 2]); assert.deepEqual(arr(v), [9, 9]);
  assert.ok(Number.isNaN(sc('normpdf', 0, 0, -1)));
});

test('t, chi-square and F quantiles match tables', () => {
  close(sc('tinv', 0.975, 10), 2.2281389);
  close(sc('tcdf', 2, 5), 0.9490303);
  close(sc('tinv', 0.95, 1), 6.3137515);
  close(sc('chi2inv', 0.95, 3), 7.8147279);
  close(sc('chi2cdf', 3.84, 1), 0.9499565);
  close(sc('finv', 0.95, 2, 10), 4.1028210);
  close(sc('fcdf', 3, 4, 10), 0.9276768);
  close(sc('ncx2cdf', 5, 3, 2), 0.5934052, 1e-4);
});

test('gamma, beta, exponential, Weibull, lognormal and others', () => {
  close(sc('gaminv', 0.5, 2, 3), 5.0350410);
  close(sc('gamcdf', 2, 2, 1), 0.5939942);
  close(sc('betainv', 0.3, 2, 5), 0.1818035);
  close(sc('betapdf', 0.5, 2, 2), 1.5);
  close(sc('expcdf', 1, 2), 1 - Math.exp(-0.5), 1e-12);
  close(sc('expinv', 0.5, 2), 2 * Math.log(2), 1e-12);
  close(sc('wblcdf', 1.5, 2, 3), 1 - Math.exp(-((1.5 / 2) ** 3)), 1e-12);
  close(sc('logncdf', 2, 0, 1), 0.7558914);
  close(sc('raylinv', 0.5, 2), 2 * Math.sqrt(2 * Math.log(2)), 1e-12);
  close(sc('evcdf', 0, 0, 1), 1 - Math.exp(-1), 1e-12);
  close(sc('unifcdf', 0.3, 0, 2), 0.15, 1e-12);
  close(sc('gevcdf', 1, 0, 1, 0), Math.exp(-Math.exp(-1)), 1e-12);
  close(sc('gpcdf', 1, 0, 1), 1 - Math.exp(-1), 1e-12);
  const [m, v] = call('wblstat', [1, 2], 2); close(m.re[0], Math.sqrt(Math.PI) / 2, 1e-10); close(v.re[0], 1 - Math.PI / 4, 1e-10);
});

test('discrete distributions', () => {
  close(sc('binopdf', 3, 10, 0.5), 0.1171875, 1e-12);
  close(sc('binocdf', 3, 10, 0.5), 0.171875, 1e-10);
  assert.equal(sc('binoinv', 0.5, 20, 0.3), 6);
  close(sc('poisscdf', 2, 3), 0.4231901);
  close(sc('poisspdf', 0, 2), Math.exp(-2), 1e-12);
  assert.equal(sc('poissinv', 0.9, 4), 7);
  close(sc('geopdf', 2, 0.25), 0.25 * 0.75 * 0.75, 1e-12);
  assert.equal(sc('geoinv', 0.5, 0.2), 3);
  close(sc('nbinpdf', 2, 3, 0.5), 0.1875, 1e-10);
  close(sc('hygepdf', 1, 10, 4, 3), 0.5, 1e-10);
  close(sc('hygecdf', 2, 20, 5, 6), 0.8686791);
  close(sc('unidcdf', 3, 6), 0.5, 1e-12);
  assert.equal(sc('binopdf', 2.5, 10, 0.5), 0);
});

test('family functions broadcast parameters and keep shapes', () => {
  const y = val('normpdf', [[0, 1], [2, 3]], [0, 1]);
  assert.deepEqual(y.dims, [2, 2]);
  close(y.re[0], 0.3989423); close(y.re[2], 0.3989423); close(y.re[3], 0.0539910);
  const p = val('chi2cdf', [1, 2, 3], 2);
  assert.deepEqual(p.dims, [1, 3]);
  closeArr(arr(p), [1, 2, 3].map((x) => 1 - Math.exp(-x / 2)), 1e-12);
});

test('random generators follow the global stream and size arguments', () => {
  ctx.call('rng', [num(0)]);
  const u = val('unifrnd', 0, 1, 1, 3);
  closeArr(arr(u), [0.8147236863931789, 0.9057919370756192, 0.1269868162935061], 1e-12);
  ctx.call('rng', [num(5)]); const a = arr(val('normrnd', 2, 3, [2, 3]));
  ctx.call('rng', [num(5)]); const b = arr(val('normrnd', 2, 3, 2, 3));
  assert.deepEqual(a, b); assert.equal(a.length, 6);
  ctx.call('rng', [num(1)]);
  const g = arr(val('gamrnd', 3, 2, 1, 20000));
  close(g.reduce((s, x) => s + x, 0) / g.length, 6, 0.03);
  const pz = arr(val('poissrnd', 4, 1, 20000)); close(pz.reduce((s, x) => s + x, 0) / pz.length, 4, 0.03);
  const bz = arr(val('binornd', 100, 0.3, 1, 5000)); close(bz.reduce((s, x) => s + x, 0) / bz.length, 30, 0.02);
  assert.ok(pz.every((x) => Number.isInteger(x) && x >= 0));
  const r = val('random', 'Normal', 0, 1, 2, 2); assert.deepEqual(r.dims, [2, 2]);
});

test('makedist objects: properties, methods, truncate', () => {
  const pd = val('makedist', 'Normal', 'mu', 2, 'sigma', 0.5);
  assert.equal(pd.cls, 'prob.NormalDistribution');
  assert.equal(pd.props.mu.re[0], 2);
  const C = stats.classes['prob.NormalDistribution'];
  close(C.methods.mean([pd]).re[0], 2); close(C.methods.std([pd]).re[0], 0.5);
  close(sc('cdf', pd, 2.5), 0.8413447);
  close(sc('icdf', pd, 0.975), 2 + 0.5 * 1.959964);
  close(sc('pdf', 'Poisson', 2, 3), 9 / 2 * Math.exp(-3), 1e-12);
  const t = val('truncate', pd, 2, Infinity);
  close(sc('cdf', t, 2.5), (0.8413447 - 0.5) / 0.5);
  close(sc('pdf', t, 1.9), 0);
  const text = C.display(pd, 'pd');
  assert.match(text, /Normal distribution/); assert.match(text, /mu = 2/);
  const pw = val('makedist', 'Weibull', 'A', 2, 'B', 3);
  close(sc('cdf', pw, 1.5), 1 - Math.exp(-((1.5 / 2) ** 3)), 1e-12);
  const list = val('makedist'); assert.equal(list.cls, 'cell');
});

test('fitdist and fit functions', () => {
  const x = [4.1, 5.2, 6.3, 5.5, 4.8, 5.9, 6.1, 5.0];
  const pd = val('fitdist', x, 'Normal');
  const m = x.reduce((s, t) => s + t, 0) / x.length; const s = Math.sqrt(x.reduce((a, t) => a + (t - m) ** 2, 0) / (x.length - 1));
  close(pd.props.mu.re[0], m, 1e-12); close(pd.props.sigma.re[0], s, 1e-12);
  const [mu, sig, muci] = call('normfit', [x], 3);
  close(mu.re[0], m, 1e-12); close(sig.re[0], s, 1e-12);
  const tc = 2.3646243; close(muci.re[0], m - tc * s / Math.sqrt(8), 1e-5);
  const y = [1.2, 2.3, 0.5, 3.3, 1.9, 2.8, 1.1, 0.9, 4.2, 2.0];
  const [ph] = call('gamfit', [y], 2);
  // gamma MLE satisfies log(a) - digamma(a) = log(mean) - mean(log)
  const a = ph.re[0], b = ph.re[1]; const my = y.reduce((p, t) => p + t, 0) / y.length;
  close(a * b, my, 1e-10);
  const pe = val('fitdist', y, 'Exponential'); close(pe.props.mu.re[0], my, 1e-12);
  const [lam, lci] = call('poissfit', [[2, 3, 1, 4, 2]], 2); close(lam.re[0], 2.4, 1e-12); assert.ok(lci.re[0] < 2.4 && lci.re[1] > 2.4);
  const [pw] = call('wblfit', [y], 1);
  // the likelihood is maximal: small perturbations do not decrease negloglik
  const nl = (p) => sc('wbllike', p, y);
  const base = nl([pw.re[0], pw.re[1]]);
  assert.ok(nl([pw.re[0] * 1.01, pw.re[1]]) > base && nl([pw.re[0], pw.re[1] * 0.99]) > base);
  const [phat, pci] = call('binofit', [7, 20], 2); close(phat.re[0], 0.35); close(pci.re[0], 0.1539092, 1e-4); close(pci.re[1], 0.5921885, 1e-4);
  const [pm] = call('mle', [x], 1); close(pm.re[1], s * Math.sqrt(7 / 8), 1e-12);
});

test('descriptive statistics', () => {
  const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  closeArr(arr(val('prctile', x, [25, 50, 75])), [3, 5.5, 8], 1e-12);
  closeArr(arr(val('quantile', x, [0.25, 0.5])), [3, 5.5], 1e-12);
  close(sc('iqr', x), 5, 1e-12);
  close(sc('skewness', [1, 2, 3, 10]), 1.0182338);
  close(sc('kurtosis', [1, 2, 3, 10]), 2.2304, 1e-10);
  close(sc('mad', [1, 2, 3, 4, 100]), 31.2, 1e-10);
  close(sc('mad', [1, 2, 3, 4, 100], 1), 1, 1e-12);
  const [z, mu, sg] = call('zscore', [[1, 2, 3]], 3);
  closeArr(arr(z), [-1, 0, 1], 1e-12); close(mu.re[0], 2); close(sg.re[0], 1);
  close(sc('geomean', [1, 2, 4]), 2, 1e-12);
  close(sc('harmmean', [1, 2, 4]), 3 / (1 + 0.5 + 0.25), 1e-12);
  close(sc('trimmean', [1, 2, 3, 4, 100], 40), 3, 1e-12);
  close(sc('nanmean', [1, NaN, 3]), 2, 1e-12);
  close(sc('moment', [1, 2, 3, 4], 2), 1.25, 1e-12);
  const M = val('prctile', [[1, 4], [2, 5], [3, 6]], 50); assert.deepEqual(M.dims, [1, 2]); assert.deepEqual(arr(M), [2, 5]);
  assert.deepEqual(arr(val('tiedrank', [10, 20, 20, 30])), [1, 2.5, 2.5, 4]);
});

test('correlation with p-values', () => {
  const a = colVec([1, 2, 3, 4, 5, 6]), b = colVec([2, 1, 4, 3, 7, 5]);
  const [r, p] = ctx.call('corr', [a, b], 2);
  close(r.re[0], 0.7917947, 1e-6);
  const t = r.re[0] * Math.sqrt(4 / (1 - r.re[0] ** 2));
  close(p.re[0], 2 * (1 - sc('tcdf', t, 4)), 1e-6);
  const [rs] = ctx.call('corr', [a, b, str('Type'), str('Spearman')], 2); close(rs.re[0], 0.8285714, 1e-6);
  const [rk] = ctx.call('corr', [a, b, str('Type'), str('Kendall')], 2); close(rk.re[0], 0.6, 1e-12);
  const R = val('corr', [[1, 2], [2, 4.1], [3, 5.9]]); assert.deepEqual(R.dims, [2, 2]); close(R.re[0], 1);
});

test('multivariate normal', () => {
  close(sc('mvnpdf', [0, 0]), 1 / (2 * Math.PI), 1e-12);
  close(sc('mvncdf', [0, 0], [0, 0], [[1, 0.5], [0.5, 1]]), 1 / 3, 1e-8);
  close(sc('mvncdf', [1, 2], [0, 0], [[1, 0], [0, 1]]), 0.8413447 * 0.9772499, 1e-6);
  close(sc('mvncdf', [0, 0, 0], [0, 0, 0], [[1, 0.5, 0.5], [0.5, 1, 0.5], [0.5, 0.5, 1]]), 0.25, 1e-3);
  ctx.call('rng', [num(3)]);
  const R = val('mvnrnd', [1, -1], [[1, 0.8], [0.8, 1]], 5000);
  assert.deepEqual(R.dims, [5000, 2]);
  const c0 = arr(R).slice(0, 5000), c1 = arr(R).slice(5000);
  close(c0.reduce((s, x) => s + x, 0) / 5000, 1, 0.05);
  const [rr] = ctx.call('corr', [colVec(c0), colVec(c1)], 1); close(rr.re[0], 0.8, 0.03);
});

test('t, z and variance tests', () => {
  const [h, p, ci, st] = call('ttest', [[1, 2, 3, 4, 5], 2], 4);
  assert.equal(h.re[0], 0); close(p.re[0], 0.2301996, 1e-5); close(field(st, 'tstat').re[0], Math.SQRT2, 1e-12);
  close(ci.re[0], 3 - 2.7764451 * Math.sqrt(2.5 / 5), 1e-6);
  const [h2, p2] = call('ttest2', [[1, 2, 3], [4, 5, 6]], 2);
  assert.equal(h2.re[0], 1); close(p2.re[0], 0.0213116, 1e-5);
  const [, pu] = call('ttest2', [[1, 2, 3], [4, 5, 6.5], 'Vartype', 'unequal'], 2); assert.ok(pu.re[0] > 0 && pu.re[0] < 0.1);
  const [hz, pz, , zv] = call('ztest', [[1, 2, 3, 4, 5], 2, 1], 4);
  close(zv.re[0], Math.sqrt(5), 1e-12); close(pz.re[0], 2 * (1 - sc('normcdf', Math.sqrt(5))), 1e-10); assert.equal(hz.re[0], 1);
  const [, pv, , sv] = call('vartest', [[1, 2, 3, 4, 5], 1], 4); close(field(sv, 'chisqstat').re[0], 10, 1e-12); close(pv.re[0], 2 * (1 - sc('chi2cdf', 10, 4)), 1e-10);
  const [, pf, , sf] = call('vartest2', [[1, 2, 3, 4, 5], [2, 4, 6, 8, 10]], 4); close(field(sf, 'fstat').re[0], 0.25, 1e-12); close(pf.re[0], 2 * sc('fcdf', 0.25, 4, 4), 1e-10);
});

test('nonparametric tests', () => {
  const [p1] = call('ranksum', [[1, 2, 3], [4, 5, 6]], 1); close(p1.re[0], 0.1, 1e-12);
  const [p2, h2, s2] = call('signrank', [[1, 2, 3, 4, 5]], 3); close(p2.re[0], 0.0625, 1e-12); assert.equal(field(s2, 'signedrank').re[0], 15);
  assert.equal(h2.re[0], 0);
  // n = 1: P(D < d) = 2d - 1
  const [, pk, k] = call('kstest', [[1]], 3); close(k.re[0], 0.8413447, 1e-6); close(pk.re[0], 2 - 2 * 0.8413447, 1e-6);
  const [hk2, pk2, k2] = call('kstest2', [[0.1, -0.5, 1.2, 0.3, -1.1, 0.8, 2.1, -0.3], [1.1, 1.5, 2.2, 1.3, 0.9, 2.8, 3.1, 1.7]], 3);
  close(k2.re[0], 0.75, 1e-12); assert.equal(hk2.re[0], 1); assert.ok(pk2.re[0] < 0.05);
  const [ps] = call('signtest', [[1, 2, 3, -1, 4, 5, 6, 7]], 1); close(ps.re[0], 2 * 9 / 256, 1e-12);
  ctx.call('rng', [num(2)]);
  const big = val('normrnd', 0, 1, 1, 200);
  const [hb] = ctx.call('kstest', [big], 1); assert.equal(hb.re[0], 0);
});

test('chi-square goodness of fit', () => {
  ctx.call('rng', [num(7)]);
  const x = val('normrnd', 10, 2, 1, 500);
  const [h, p, st] = ctx.call('chi2gof', [x], 3);
  assert.equal(h.re[0], 0); assert.ok(p.re[0] > 0.01);
  const O = arr(field(st, 'O')); assert.equal(O.reduce((a, b) => a + b, 0), 500);
  const [h2, p2] = ctx.call('chi2gof', [rowVec([1, 2, 3, 4]), str('Ctrs'), rowVec([1, 2, 3, 4]), str('Expected'), rowVec([1, 1, 1, 1]), str('EMin'), num(0)], 2);
  close(p2.re[0], 1, 1e-12); assert.equal(h2.re[0], 0);
});

test('analysis of variance', () => {
  const [p, tbl, st] = call('anova1', [[[1, 4], [2, 5], [3, 6]], [], 'off'], 3);
  close(p.re[0], 0.0213116, 1e-5);
  assert.equal(tbl.cls, 'cell'); assert.deepEqual(tbl.dims, [4, 6]); close(tbl.data[1 + 4 * 4].re[0], 13.5, 1e-10);
  assert.deepEqual(arr(field(st, 'means')), [2, 5]);
  ctx.outText.length = 0; call('anova1', [[1, 2, 3, 4, 5, 6], [1, 1, 1, 2, 2, 2]], 1);
  assert.match(ctx.outText.join(''), /Groups/);
  const [p2] = call('anova2', [[[1, 2], [3, 4], [5, 7]], 1, 'off'], 1);
  assert.deepEqual(p2.dims, [1, 2]); assert.ok(p2.re[1] < 0.05);
  const [p3] = call('anova2', [[[1, 2], [1.5, 2.5], [5, 7], [5.5, 7.5]], 2, 'off'], 1); assert.deepEqual(p3.dims, [1, 3]);
  const [pk] = call('kruskalwallis', [[[1, 4], [2, 5], [3, 6]], [], 'off'], 1); close(pk.re[0], 1 - sc('chi2cdf', 3.857142857, 1), 1e-6);
});

test('regress and fitlm', () => {
  const xs = [1, 2, 3, 4, 5, 6], ys = [2.1, 3.9, 6.2, 7.8, 10.1, 12.2];
  const X = matrix(xs.map((x) => [1, x]));
  const [b, bint, r, rint, st] = ctx.call('regress', [colVec(ys), X], 5);
  // closed form simple regression
  const mx = 3.5, my = ys.reduce((s, v) => s + v, 0) / 6; const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), sxx = 17.5;
  close(b.re[1], sxy / sxx, 1e-12); close(b.re[0], my - (sxy / sxx) * mx, 1e-12);
  assert.deepEqual(bint.dims, [2, 2]); assert.deepEqual(rint.dims, [6, 2]); assert.ok(st.re[0] > 0.99);
  const mdl = ctx.call('fitlm', [colVec(xs), colVec(ys)], 1)[0];
  assert.equal(mdl.cls, 'LinearModel');
  close(field(mdl.props.Rsquared, 'Ordinary').re[0], st.re[0], 1e-12);
  const coef = mdl.props.Coefficients; const est = coef.cls === 'struct' ? field(coef, 'Estimate') : null;
  if (est) close(est.re[1], b.re[1], 1e-12);
  const [yp, yci] = stats.classes.LinearModel.methods.predict([mdl, colVec([7])]);
  close(yp.re[0], b.re[0] + 7 * b.re[1], 1e-12); assert.ok(yci.re[0] < yp.re[0] && yci.re[1] > yp.re[0]);
  const text = stats.classes.LinearModel.display(mdl, 'mdl');
  assert.match(text, /Linear regression model/); assert.match(text, /\(Intercept\)/); assert.match(text, /R-squared/);
});

test('pdist, squareform, linkage, cluster, cophenet', () => {
  const X = [[1, 2], [2.5, 4.5], [2, 2], [4, 1.5], [4, 2.5]];
  const Y = val('pdist', X);
  closeArr(arr(Y), [2.9155, 1.0000, 3.0414, 3.0414, 2.5495, 3.3541, 2.5000, 2.0616, 2.0616, 1.0000], 1e-4);
  const Z = val('linkage', Y);
  closeArr(arr(Z), [4, 1, 6, 2, 5, 3, 7, 8, 1, 1, 2.0616, 2.5], 1e-4);
  const T = val('cluster', Z, 'MaxClust', 2);
  const t = arr(T); assert.equal(t[0], t[2]); assert.equal(t[3], t[4]); assert.equal(t[0], t[3]); assert.notEqual(t[1], t[0]);
  const S = val('squareform', Y); assert.deepEqual(S.dims, [5, 5]); close(S.re[1], 2.9155, 1e-4);
  assert.deepEqual(arr(val('squareform', S)), arr(Y));
  closeArr(arr(val('pdist', [[0, 0], [3, 4]], 'cityblock')), [7]);
  closeArr(arr(val('pdist', [[0, 0], [3, 4]], 'chebychev')), [4]);
  closeArr(arr(val('pdist', [[1, 0], [0, 1]], 'cosine')), [1]);
  closeArr(arr(val('pdist', [[1, 2, 3], [1, 0, 3]], 'hamming')), [1 / 3]);
  const Zc = val('linkage', X, 'complete'); close(Zc.re[Zc.dims[0] * 2 + 3], 3.3541, 1e-4);
  const Zw = val('linkage', [[0], [1], [5]], 'ward'); close(Zw.re[2 * 2], 1, 1e-12); close(Zw.re[2 * 2 + 1], Math.sqrt(2 * 2 / 3) * 4.5, 1e-12);
  const [c] = call('cophenet', [Z, Y], 1); assert.ok(c.re[0] > 0.8 && c.re[0] <= 1);
  const [, Td, perm] = call('dendrogram', [Z], 3); assert.equal(perm.re.length, 5); assert.deepEqual(arr(Td), [1, 2, 3, 4, 5]);
  const [D2, I2] = call('pdist2', [X, [[1, 2]], 'euclidean', 'Smallest', 2], 2); closeArr(arr(D2), [0, 1]); closeArr(arr(I2), [1, 3]);
});

test('kmeans and kmedoids separate clear blobs', () => {
  ctx.call('rng', [num(0)]);
  const pts = [];
  for (let i = 0; i < 20; i++) pts.push([0 + 0.1 * Math.sin(i), 0 + 0.1 * Math.cos(i)]);
  for (let i = 0; i < 20; i++) pts.push([5 + 0.1 * Math.sin(i), 5 + 0.1 * Math.cos(i)]);
  for (let i = 0; i < 20; i++) pts.push([0 + 0.1 * Math.sin(i), 8 + 0.1 * Math.cos(i)]);
  const [idx, C, sumd] = call('kmeans', [pts, 3, 'Replicates', 3], 3);
  const lab = arr(idx);
  for (let g = 0; g < 3; g++) { const s = new Set(lab.slice(20 * g, 20 * g + 20)); assert.equal(s.size, 1); }
  assert.equal(new Set(lab).size, 3); assert.deepEqual(C.dims, [3, 2]);
  assert.ok(arr(sumd).every((v) => v < 1));
  const [mi] = call('kmedoids', [pts, 3], 1);
  const ml = arr(mi); for (let g = 0; g < 3; g++) assert.equal(new Set(ml.slice(20 * g, 20 * g + 20)).size, 1);
  assert.equal(new Set(ml).size, 3);
});

test('pca', () => {
  const X = [[2.5, 2.4], [0.5, 0.7], [2.2, 2.9], [1.9, 2.2], [3.1, 3.0], [2.3, 2.7], [2, 1.6], [1, 1.1], [1.5, 1.6], [1.1, 0.9]];
  const [coeff, score, latent, tsq, explained, mu] = call('pca', [X], 6);
  closeArr(arr(latent), [1.2840277, 0.0490834], 1e-5);
  closeArr(arr(coeff), [0.6778734, 0.7351787, 0.7351787, -0.6778734], 1e-5);
  close(arr(explained).reduce((a, b) => a + b, 0), 100, 1e-10);
  closeArr(arr(mu), [1.81, 1.91], 1e-12);
  // reconstruction: score * coeff' + mu = X
  const n = 10; const s = arr(score), c = arr(coeff);
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) close(s[i] * c[j] + s[i + n] * c[j + 2] + arr(mu)[j], X[i][j], 1e-10);
  assert.equal(tsq.dims[0], 10);
});

test('cvpartition, crossval and confusionmat', () => {
  ctx.call('rng', [num(0)]);
  const c = val('cvpartition', 10, 'KFold', 5);
  assert.equal(c.cls, 'cvpartition'); assert.deepEqual(arr(c.props.TestSize), [2, 2, 2, 2, 2]);
  const M = stats.classes.cvpartition.methods;
  const te = arr(M.test([c, num(1)])), tr = arr(M.training([c, num(1)]));
  te.forEach((v, i) => assert.equal(v + tr[i], 1));
  const h = val('cvpartition', 20, 'HoldOut', 0.25); assert.deepEqual(arr(h.props.TestSize), [5]);
  const X = colVec([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), y = colVec([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  const pred = jsHandle(([Xtr, ytr, Xte]) => ({ ...Xte, re: Xte.re.map((v) => 2 * v) }));
  const mse = ctx.call('crossval', [str('mse'), X, y, str('Predfun'), pred, str('KFold'), num(5)])[0];
  close(mse.re[0], 0, 1e-12);
  const vals = ctx.call('crossval', [jsHandle(([Xtr, Xte]) => num(Xte.re.length)), X, str('KFold'), num(5)])[0];
  assert.deepEqual(vals.dims, [5, 1]);
  const [C, order] = call('confusionmat', [[1, 2, 2, 3, 1], [1, 2, 3, 3, 2]], 2);
  assert.deepEqual(arr(C), [1, 0, 0, 1, 1, 0, 0, 1, 1]); assert.deepEqual(arr(order), [1, 2, 3]);
  const [C2, o2] = ctx.call('confusionmat', [{ cls: 'cell', dims: [1, 3], data: [str('a'), str('b'), str('a')] }, { cls: 'cell', dims: [1, 3], data: [str('a'), str('a'), str('a')] }], 2);
  assert.deepEqual(arr(C2), [2, 1, 0, 0]); assert.equal(toStr(o2.data[1]), 'b');
});

test('argument errors use numeric identifiers', () => {
  assert.throws(() => val('tinv', 0.5), (e) => e.identifier === 'numeric:tinv:tooFewInputs');
  assert.throws(() => val('makedist', 'NoSuchThing'), (e) => e.identifier === 'numeric:stats:unknownDistribution');
  assert.throws(() => val('prctile', [1, 2], 150), (e) => e.identifier === 'numeric:prctile:badPercents');
});
