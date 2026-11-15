// Seeded random numbers and the probability distributions used by every
// stochastic property (inter-arrival times, process times, failures, dwell
// times …). One stream per simulation run, so a seed reproduces a run exactly.

/** mulberry32: small, fast, good enough for simulation; returns numbers in [0, 1). */
export function createRandom(seed = 1) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const r = {
    next,
    uniform: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    normal(mean = 0, sd = 1) {
      if (spare != null) { const z = spare; spare = null; return mean + sd * z; }
      let u = 0; let v = 0; let s = 0;
      do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
      const m = Math.sqrt((-2 * Math.log(s)) / s);
      spare = v * m;
      return mean + sd * u * m;
    },
    exponential: (mean) => -mean * Math.log(1 - next()),
    gamma(shape, scale) {
      if (shape <= 0 || scale <= 0) return 0;
      if (shape < 1) return r.gamma(shape + 1, scale) * next() ** (1 / shape);
      const d = shape - 1 / 3;
      const c = 1 / Math.sqrt(9 * d);
      for (;;) {
        let x; let v;
        do { x = r.normal(); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        const u = next();
        if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
      }
    },
    poisson(mean) {
      if (mean <= 0) return 0;
      if (mean > 60) return Math.max(0, Math.round(r.normal(mean, Math.sqrt(mean))));
      const L = Math.exp(-mean); let k = 0; let p = 1;
      do { k += 1; p *= next(); } while (p > L);
      return k - 1;
    },
    /** Index chosen with the given weights. */
    pick(weights) {
      const total = weights.reduce((sum, w) => sum + Math.max(0, Number(w) || 0), 0);
      if (total <= 0) return 0;
      let x = next() * total;
      for (let i = 0; i < weights.length; i++) { x -= Math.max(0, Number(weights[i]) || 0); if (x < 0) return i; }
      return weights.length - 1;
    },
  };
  return r;
}

/** Distribution kinds and their parameters (in the order the property editor shows them). */
export const DISTRIBUTIONS = {
  constant: ['value'],
  uniform: ['min', 'max'],
  triangular: ['min', 'mode', 'max'],
  normal: ['mean', 'sd'],
  exponential: ['mean'],
  lognormal: ['mean', 'sd'],
  erlang: ['mean', 'k'],
  gamma: ['shape', 'scale'],
  weibull: ['shape', 'scale'],
  beta: ['min', 'max', 'alpha', 'beta'],
  poisson: ['mean'],
  empirical: ['values', 'weights'],
  expression: ['expr'],
};
export const DIST_KINDS = Object.keys(DISTRIBUTIONS);

/** Default parameters for a distribution kind, keeping the mean near `mean`. */
export function defaultDist(kind, mean = 10) {
  const m = Number(mean) || 10;
  switch (kind) {
    case 'constant': return { type: kind, value: m };
    case 'uniform': return { type: kind, min: +(m * 0.5).toFixed(3), max: +(m * 1.5).toFixed(3) };
    case 'triangular': return { type: kind, min: +(m * 0.5).toFixed(3), mode: m, max: +(m * 1.5).toFixed(3) };
    case 'normal': return { type: kind, mean: m, sd: +(m * 0.2).toFixed(3) };
    case 'exponential': return { type: kind, mean: m };
    case 'lognormal': return { type: kind, mean: m, sd: +(m * 0.3).toFixed(3) };
    case 'erlang': return { type: kind, mean: m, k: 3 };
    case 'gamma': return { type: kind, shape: 2, scale: +(m / 2).toFixed(3) };
    case 'weibull': return { type: kind, shape: 2, scale: +(m / 0.886).toFixed(3) };
    case 'beta': return { type: kind, min: +(m * 0.5).toFixed(3), max: +(m * 1.5).toFixed(3), alpha: 2, beta: 2 };
    case 'poisson': return { type: kind, mean: m };
    case 'empirical': return { type: kind, values: `${m * 0.5}, ${m}, ${m * 2}`, weights: '1, 2, 1' };
    case 'expression': return { type: kind, expr: String(m) };
    default: return { type: 'constant', value: m };
  }
}

const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
export const listOf = (text) => String(text ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite);

/**
 * One sample of `dist` ({ type, ...params }) drawn from `r`. Times never go below 0.
 * `evaluate(expr)` serves the 'expression' kind (the simulation passes its expression evaluator).
 */
export function sample(dist, r, evaluate = null) {
  if (dist == null) return 0;
  if (typeof dist === 'number') return Math.max(0, dist);
  const d = dist;
  let x = 0;
  switch (d.type) {
    case 'constant': x = num(d.value); break;
    case 'uniform': x = r.uniform(num(d.min), num(d.max)); break;
    case 'triangular': {
      const a = num(d.min); const c = num(d.mode); const b = num(d.max);
      if (b <= a) { x = a; break; }
      const u = r.next(); const f = (c - a) / (b - a);
      x = u < f ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
      break;
    }
    case 'normal': x = r.normal(num(d.mean), Math.max(0, num(d.sd))); break;
    case 'exponential': x = r.exponential(Math.max(0, num(d.mean))); break;
    case 'lognormal': {
      const m = Math.max(1e-9, num(d.mean)); const s = Math.max(0, num(d.sd));
      const sigma2 = Math.log(1 + (s * s) / (m * m));
      x = Math.exp(r.normal(Math.log(m) - sigma2 / 2, Math.sqrt(sigma2)));
      break;
    }
    case 'erlang': { const k = Math.max(1, Math.round(num(d.k, 1))); x = r.gamma(k, num(d.mean) / k); break; }
    case 'gamma': x = r.gamma(num(d.shape, 1), num(d.scale, 1)); break;
    case 'weibull': x = num(d.scale, 1) * (-Math.log(1 - r.next())) ** (1 / Math.max(1e-6, num(d.shape, 1))); break;
    case 'beta': {
      const g1 = r.gamma(Math.max(1e-3, num(d.alpha, 2)), 1); const g2 = r.gamma(Math.max(1e-3, num(d.beta, 2)), 1);
      x = num(d.min) + (num(d.max, 1) - num(d.min)) * (g1 / (g1 + g2 || 1));
      break;
    }
    case 'poisson': x = r.poisson(num(d.mean)); break;
    case 'empirical': {
      const values = listOf(d.values); const weights = listOf(d.weights);
      if (!values.length) { x = 0; break; }
      x = values[r.pick(values.map((_, i) => weights[i] ?? 1))];
      break;
    }
    case 'expression': x = evaluate ? num(evaluate(d.expr)) : 0; break;
    default: x = num(d.value);
  }
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

/** Expected value of a distribution (for previews, validation and the report). */
export function distMean(d) {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  switch (d.type) {
    case 'constant': return num(d.value);
    case 'uniform': return (num(d.min) + num(d.max)) / 2;
    case 'triangular': return (num(d.min) + num(d.mode) + num(d.max)) / 3;
    case 'normal': case 'exponential': case 'lognormal': case 'erlang': case 'poisson': return num(d.mean);
    case 'gamma': return num(d.shape) * num(d.scale);
    case 'weibull': { const k = Math.max(1e-6, num(d.shape, 1)); return num(d.scale) * gammaFn(1 + 1 / k); }
    case 'beta': { const a = num(d.alpha, 2); const b = num(d.beta, 2); return num(d.min) + (num(d.max, 1) - num(d.min)) * (a / (a + b)); }
    case 'empirical': {
      const values = listOf(d.values); const weights = values.map((_, i) => listOf(d.weights)[i] ?? 1);
      const total = weights.reduce((s, w) => s + w, 0) || 1;
      return values.reduce((s, v, i) => s + v * weights[i], 0) / total;
    }
    default: return NaN;
  }
}

/** Lanczos approximation of Γ(x). */
export function gammaFn(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return Math.sqrt(2 * Math.PI) * t ** (x + 0.5) * Math.exp(-t) * a;
}

/** "Exponential(60)", "Triangular(5, 8, 12)" — how a distribution reads in panels and reports. */
export function formatDist(d, digits = 3) {
  if (d == null) return '—';
  if (typeof d === 'number') return String(d);
  const f = (v) => { const n = Number(v); return Number.isFinite(n) ? String(+n.toFixed(digits)) : String(v ?? ''); };
  const name = d.type[0].toUpperCase() + d.type.slice(1);
  if (d.type === 'constant') return f(d.value);
  if (d.type === 'expression') return String(d.expr ?? '');
  if (d.type === 'empirical') return `Empirical(${d.values ?? ''} | ${d.weights ?? ''})`;
  return `${name}(${(DISTRIBUTIONS[d.type] ?? []).map((k) => f(d[k])).join(', ')})`;
}

/** n samples for a histogram preview (property editor, distribution popup). */
export function sampleMany(d, n = 2000, seed = 7, evaluate = null) {
  const r = createRandom(seed);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = sample(d, r, evaluate);
  return out;
}

/** Bins for a histogram: { min, max, counts }. */
export function histogram(values, bins = 24) {
  let min = Infinity; let max = -Infinity;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
  if (!Number.isFinite(min)) return { min: 0, max: 1, counts: new Array(bins).fill(0) };
  if (max - min < 1e-9) { max = min + 1; }
  const counts = new Array(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins))] += 1;
  return { min, max, counts };
}
