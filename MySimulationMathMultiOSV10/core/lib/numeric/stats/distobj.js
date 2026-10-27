// Probability distribution objects (makedist, fitdist) and the generic
// pdf / cdf / icdf / random / mle functions that take a distribution name or
// object. Objects are value objects of class 'prob.<Name>Distribution'.
import { tensor, num, str, bool, empty, object, isText, toStr, toNum, isObject, cell, structOf, prod } from '../../../value.js';
import { E, F, H, sizeArgs, n1, isEmptyV, nv, fmtG, cellStr } from '../_util.js';
import { globalGen } from '../random.js';
import { DIST, distByName, fitFamily, covFor, paramCI, negLogLik } from './dist.js';
import { ew, meanA } from './_s.js';

const PREFIX = 'prob.';
export const isDistObj = (v) => isObject(v) && typeof v.cls === 'string' && v.cls.startsWith(PREFIX) && v._d;

/** Builds a distribution object. fit: {x, cov, ci} for fitted objects. */
export function makeObj(D, p, opts = {}) {
  const props = {
    DistributionName: str(D.name),
    NumParameters: num(D.pnames.length),
    ParameterNames: cellStr(D.pnames),
    ParameterDescription: cellStr(D.pdesc || D.pnames),
    ParameterValues: tensor('double', [1, p.length], Float64Array.from(p)),
    Truncation: opts.trunc ? tensor('double', [1, 2], opts.trunc) : empty(),
    IsTruncated: bool(!!opts.trunc),
  };
  D.pnames.forEach((n, i) => { props[n] = num(p[i]); });
  if (opts.fit) {
    props.ParameterCovariance = tensor('double', [p.length, p.length], Float64Array.from(opts.fit.cov.flatMap((r, i) => opts.fit.cov.map((rr) => rr[i]))));
    props.ParameterIsFixed = tensor('logical', [1, p.length], (D.fixed || p.map(() => false)).map(Number));
    props.InputData = structOf({ data: tensor('double', [opts.fit.x.length, 1], Float64Array.from(opts.fit.x)), cens: empty(), freq: empty() });
  }
  return object(PREFIX + D.cls, props, { extra: { _d: D.key, _p: p.slice(), _trunc: opts.trunc || null, _fit: opts.fit || null } });
}
const Dof = (o) => DIST[o._d];

// truncated evaluation
function evalPdf(o, x) {
  const D = Dof(o); const p = o._p; const t = o._trunc;
  if (!t) return D.pdf(x, p);
  if (x < t[0] || x > t[1]) return 0;
  const lo = D.discrete ? D.cdf(t[0] - 1, p) : D.cdf(t[0], p);
  return D.pdf(x, p) / (D.cdf(t[1], p) - lo);
}
function evalCdf(o, x, up) {
  const D = Dof(o); const p = o._p; const t = o._trunc;
  if (!t) return D.cdf(x, p, up);
  const lo = D.discrete ? D.cdf(t[0] - 1, p) : D.cdf(t[0], p); const hi = D.cdf(t[1], p);
  let c = x < t[0] ? 0 : x >= t[1] ? 1 : (D.cdf(x, p) - lo) / (hi - lo);
  return up ? 1 - c : c;
}
function evalInv(o, q) {
  const D = Dof(o); const p = o._p; const t = o._trunc;
  if (Number.isNaN(q) || q < 0 || q > 1) return NaN;
  if (!t) return D.inv(q, p);
  const lo = D.discrete ? D.cdf(t[0] - 1, p) : D.cdf(t[0], p); const hi = D.cdf(t[1], p);
  return Math.min(Math.max(D.inv(lo + q * (hi - lo), p), t[0]), t[1]);
}
function objStat(o) {
  const D = Dof(o);
  if (!o._trunc) return D.stat(o._p);
  // numeric moments of the truncated distribution
  const [a, b] = o._trunc;
  if (D.discrete) { let m = 0, m2 = 0; for (let k = Math.ceil(a); k <= b && k < a + 1e6; k++) { const f = evalPdf(o, k); m += k * f; m2 += k * k * f; } return [m, m2 - m * m]; }
  const n = 2000; let m = 0, m2 = 0;
  for (let i = 0; i < n; i++) { const q = (i + 0.5) / n; const x = evalInv(o, q); m += x / n; m2 += x * x / n; }
  return [m, m2 - m * m];
}

// ------------------------------------------------------------ makedist / fitdist
const ORDER = ['norm', 'unif', 'exp', 'gam', 'beta', 'logn', 'wbl', 'ev', 'gev', 'gp', 'rayl', 'poiss', 'bino', 'nbin', 'geo', 'hyge', 'unid', 'chi2', 'ncx2', 't', 'f', 'logistic', 'tri', 'tls', 'hn'];
const OBJ_NAME = (D) => D.cls.replace(/Distribution$/, '');
function makedist(args) {
  if (!args.length) return cell([ORDER.length, 1], ORDER.map((k) => str(OBJ_NAME(DIST[k]))));
  const D = distByName(toStr(args[0]));
  const o = nv(args, 1, D.pnames);
  const p = D.pnames.map((n, i) => {
    const v = o[n.toLowerCase()]; if (v != null) return toNum(v, n);
    const sh = D.short && o[D.short[i]]; if (sh != null) return toNum(sh, n);
    if (D.defaults[i] === undefined) {
      // reference defaults when not given
      const dflt = { gam: [1, 1], beta: [1, 1], chi2: [1], ncx2: [1, 1], t: [1], f: [1, 1], bino: [1, 0.5], poiss: [1], geo: [0.5], nbin: [1, 0.5], hyge: [100, 20, 10], unid: [10], gev: [0, 1, 0], gp: [1, 1, 0] }[D.key];
      return dflt[i];
    }
    return D.defaults[i];
  });
  if (!D.valid(p)) throw E('makedist:badParams', `Invalid parameter values for the ${D.name} distribution.`);
  return makeObj(D, p);
}
function fitdist(args) {
  if (args.length < 2) throw E('fitdist:tooFewInputs', 'fitdist requires data and a distribution name.');
  const x = Array.from(F(args[0])).filter((v) => !Number.isNaN(v));
  const D = distByName(toStr(args[1]));
  const o = nv(args, 2, ['NTrials', 'Theta', 'mu', 'Frequency', 'Options', 'Kernel', 'By']);
  let data = x;
  if (o.frequency && !isEmptyV(o.frequency)) { const f = F(o.frequency); data = []; Array.from(F(args[0])).forEach((v, i) => { for (let k = 0; k < f[i]; k++) data.push(v); }); }
  if (D.key === 'unid' || D.key === 'hyge' || D.key === 'chi2' || D.key === 'ncx2' || D.key === 't' || D.key === 'f' || D.key === 'tri') throw E('fitdist:noFit', `Fitting is not supported for the ${D.name} distribution; use makedist.`);
  const p = fitFamily(D, data, { ntrials: o.ntrials ? toNum(o.ntrials) : undefined, theta: o.theta ? toNum(o.theta) : 0, mu: o.mu ? toNum(o.mu) : 0 });
  const cov = covFor(D, data, p);
  const ci = paramCI(D, data, p, 0.05, cov);
  return makeObj(D, p, { fit: { x: data, cov, ci } });
}
function mle(args, nargout) {
  const x = Array.from(F(args[0])).filter((v) => !Number.isNaN(v));
  const o = nv(args, 1, ['distribution', 'alpha', 'ntrials', 'pdf', 'start']);
  const D = distByName(o.distribution ? toStr(o.distribution) : 'normal');
  const alpha = o.alpha ? toNum(o.alpha) : 0.05;
  let p = fitFamily(D, x, { ntrials: o.ntrials ? toNum(o.ntrials) : undefined });
  if (D.key === 'norm') p = [p[0], p[1] * Math.sqrt((x.length - 1) / x.length)]; // mle gives the biased sigma
  const [lo, hi] = paramCI(D, x, p, alpha);
  const ci = new Float64Array(2 * p.length); p.forEach((_, i) => { ci[2 * i] = lo[i]; ci[2 * i + 1] = hi[i]; });
  const keep = D.key === 'bino' ? [1] : p.map((_, i) => i);
  return [tensor('double', [1, keep.length], keep.map((i) => p[i])), tensor('double', [2, keep.length], keep.flatMap((i) => [lo[i], hi[i]]))];
}

// ------------------------------------------------------------ generic functions
function dParams(args, start, D) { return D.pnames.map((_, i) => (args[start + i] != null && !isEmptyV(args[start + i]) ? args[start + i] : (D.defaults[i] ?? NaN))); }
function stripUpper(args) { if (args.length && isText(args[args.length - 1]) && toStr(args[args.length - 1]).toLowerCase() === 'upper') return [args.slice(0, -1), true]; return [args, false]; }
function genPdf(args) {
  if (isDistObj(args[0])) return ew([args[1]], (x) => evalPdf(args[0], x));
  const D = distByName(toStr(args[0]));
  return ew([args[1], ...dParams(args, 2, D)], (x, ...p) => (D.valid(p) ? D.pdf(x, p) : NaN));
}
function genCdf(a0) {
  const [args, up] = stripUpper(a0);
  if (isDistObj(args[0])) return ew([args[1]], (x) => evalCdf(args[0], x, up));
  const D = distByName(toStr(args[0]));
  return ew([args[1], ...dParams(args, 2, D)], (x, ...p) => (D.valid(p) ? D.cdf(x, p, up) : NaN));
}
function genIcdf(args) {
  if (isDistObj(args[0])) return ew([args[1]], (q) => evalInv(args[0], q));
  const D = distByName(toStr(args[0]));
  return ew([args[1], ...dParams(args, 2, D)], (q, ...p) => (D.valid(p) && q >= 0 && q <= 1 ? D.inv(q, p) : NaN));
}
function genRandom(args, nargout, ctx) {
  const g = globalGen(ctx);
  if (isDistObj(args[0])) {
    const o = args[0]; const { dims } = sizeArgs(args.slice(1));
    const D = Dof(o); const n = prod(dims); const r = new Float64Array(n);
    for (let i = 0; i < n; i++) r[i] = o._trunc ? evalInv(o, g.rand()) : D.rnd(g, o._p);
    return tensor('double', dims, r);
  }
  const D = distByName(toStr(args[0])); const np = D.pnames.length;
  const params = dParams(args.slice(0, np + 1), 1, D);
  const target = args.length > np + 1 ? sizeArgs(args.slice(np + 1)).dims : null;
  return ew(params, (...p) => (D.valid(p) ? D.rnd(g, p) : NaN), target);
}

// ------------------------------------------------------------ object methods
const obj0 = (args, fn) => { const o = args[0]; if (!isDistObj(o)) throw E(`${fn}:badObject`, `${fn} requires a probability distribution object.`); return o; };
const methods = {
  pdf: (args) => genPdf(args),
  cdf: (args) => genCdf(args),
  icdf: (args) => genIcdf(args),
  random: (args, nargout, ctx) => genRandom(args, nargout, ctx),
  mean: (args) => num(objStat(obj0(args, 'mean'))[0]),
  var: (args) => num(objStat(obj0(args, 'var'))[1]),
  std: (args) => num(Math.sqrt(objStat(obj0(args, 'std'))[1])),
  median: (args) => num(evalInv(obj0(args, 'median'), 0.5)),
  iqr: (args) => { const o = obj0(args, 'iqr'); return num(evalInv(o, 0.75) - evalInv(o, 0.25)); },
  negloglik: (args) => { const o = obj0(args, 'negloglik'); if (!o._fit) throw E('negloglik:notFitted', 'The distribution has no data; use fitdist.'); return num(negLogLik(Dof(o), o._fit.x, o._p)); },
  paramci: (args) => {
    const o = obj0(args, 'paramci'); const opt = nv(args, 1, ['Alpha', 'Parameter']); const alpha = opt.alpha ? toNum(opt.alpha) : 0.05;
    const D = Dof(o); let lo, hi;
    if (o._fit) [lo, hi] = paramCI(D, o._fit.x, o._p, alpha, o._fit.cov); else { lo = o._p.slice(); hi = o._p.slice(); }
    return tensor('double', [2, lo.length], Float64Array.from(lo.flatMap((v, i) => [v, hi[i]])));
  },
  truncate: (args) => {
    const o = obj0(args, 'truncate'); const lo = toNum(args[1], 'lower'), hi = toNum(args[2], 'upper');
    if (!(lo < hi)) throw E('truncate:badLimits', 'The lower truncation limit must be less than the upper limit.');
    return makeObj(Dof(o), o._p, { trunc: [lo, hi], fit: o._fit });
  },
  proflik: () => { throw E('proflik:notSupported', 'Profile likelihood is not supported.'); },
};
function display(o, name) {
  const D = Dof(o); const fit = o._fit;
  const w = Math.max(...D.pnames.map((n) => n.length));
  let s = `${name} = \n  ${D.cls}\n\n  ${D.name} distribution\n`;
  D.pnames.forEach((n, i) => {
    let line = `${' '.repeat(4 + w - n.length)}${n} = ${fmtG(o._p[i], 6)}`;
    if (fit && !(D.fixed && D.fixed[i]) && !(D.key === 'bino' && i === 0)) line += `   [${fmtG(fit.ci[0][i], 6)}, ${fmtG(fit.ci[1][i], 6)}]`;
    s += line + '\n';
  });
  if (o._trunc) s += `  Truncated to the interval [${fmtG(o._trunc[0], 6)}, ${fmtG(o._trunc[1], 6)}]\n`;
  return s;
}
function subsasgn(o, subs, rhs) {
  if (subs.length === 1 && subs[0].type === '.') {
    const D = Dof(o); const i = D.pnames.findIndex((n) => n.toLowerCase() === String(subs[0].subs).toLowerCase());
    if (i < 0) throw E('prob:readOnly', `Property '${subs[0].subs}' cannot be set.`);
    const p = o._p.slice(); p[i] = toNum(rhs);
    if (!D.valid(p)) throw E('prob:badParams', `Invalid value for parameter ${D.pnames[i]}.`);
    return makeObj(D, p, { trunc: o._trunc });
  }
  throw E('prob:badAssign', 'Unsupported assignment to a probability distribution object.');
}

export const classes = {};
for (const D of Object.values(DIST)) {
  classes[PREFIX + D.cls] = {
    props: ['DistributionName', 'NumParameters', 'ParameterNames', 'ParameterDescription', 'ParameterValues', 'Truncation', 'IsTruncated', ...D.pnames],
    construct(args) { return makedist([str(D.name), ...args]); },
    methods,
    display,
    subsasgn,
  };
}

export const builtins = {
  makedist, fitdist, mle,
  pdf: genPdf, cdf: genCdf, icdf: genIcdf, random: genRandom,
  paramci: methods.paramci, truncate: methods.truncate, negloglik: methods.negloglik,
};
export const help = {
  makedist: H('Creates a probability distribution object.', '확률 분포 객체를 만듭니다.', ["pd = makedist('Normal')", "pd = makedist('Normal', 'mu', 2, 'sigma', 0.5)", 'list = makedist']),
  fitdist: H('Fits a probability distribution object to data by maximum likelihood.', '최대 가능도로 데이터에 확률 분포 객체를 맞춥니다.', ["pd = fitdist(x, 'Normal')", "pd = fitdist(x, 'Binomial', 'NTrials', n)", "pd = fitdist(x, distname, 'Frequency', f)"]),
  mle: H('Maximum likelihood estimates and confidence intervals.', '최대 가능도 추정값과 신뢰 구간.', ['phat = mle(x)', "[phat, pci] = mle(x, 'Distribution', name)", "[___] = mle(___, 'Alpha', a)"]),
  pdf: H('Probability density function of a named distribution or distribution object.', '이름으로 지정한 분포나 분포 객체의 확률 밀도 함수.', ["y = pdf('Normal', x, mu, sigma)", 'y = pdf(pd, x)']),
  cdf: H('Cumulative distribution function of a named distribution or distribution object.', '이름으로 지정한 분포나 분포 객체의 누적 분포 함수.', ["p = cdf('Normal', x, mu, sigma)", 'p = cdf(pd, x)', "p = cdf(___, 'upper')"]),
  icdf: H('Inverse cumulative distribution function.', '누적 분포 함수의 역함수.', ["x = icdf('Normal', p, mu, sigma)", 'x = icdf(pd, p)']),
  random: H('Random numbers from a named distribution or distribution object.', '이름으로 지정한 분포나 분포 객체의 난수.', ["r = random('Normal', mu, sigma, m, n)", 'r = random(pd, m, n)']),
  paramci: H('Confidence intervals for the parameters of a distribution object.', '분포 객체 모수의 신뢰 구간.', ['ci = paramci(pd)', "ci = paramci(pd, 'Alpha', a)"]),
  truncate: H('Truncates a distribution object to an interval.', '분포 객체를 구간으로 절단합니다.', ['t = truncate(pd, lower, upper)']),
  negloglik: H('Negative log likelihood of a fitted distribution object.', '적합한 분포 객체의 음의 로그 가능도.', ['nlogL = negloglik(pd)']),
};
export { evalPdf, evalCdf, evalInv };
