// Fatigue (stress-life) from a linear static study: the static stress scaled by load factors, cycle by cycle.
//
//   S-N curve   estimated from the ultimate strength and corrected by the Marin factors (surface finish ka = a·Su^b,
//               size kb, loading kc, temperature kd, reliability ke; Shigley), or a table of (N, S) points given by
//               the user (log-log interpolation; below the last point infinite life when the material has an
//               endurance limit, else the last slope continues). A fatigue notch factor Kf multiplies the stresses.
//   Stress      per surface point from its stress tensor: signed von Mises (the sign of the principal stress of
//               largest magnitude), the largest-magnitude principal stress, or Tresca (σ1 − σ3).
//   Loading     events [{ cycles, min, max }] — the stress at min × and max × the static load, `cycles` times — or a
//               load history (factors over time, repeated) counted by rainflow (ASTM E1049) into cycles.
//   Mean stress corrected to an equivalent fully reversed amplitude: none, Goodman, Gerber, Soderberg, ASME elliptic
//               (a compressive mean gets no credit).
//   Damage      Miner's sum Σ n/N per point; life = the number of load blocks to a damage of 1; the load factor of
//               safety scales all stresses until the damage of one block reaches 1 (or the endurance limit).
// Units: MPa, cycles.

export const FINISHES = { polished: [1, 0], ground: [1.58, -0.085], machined: [4.51, -0.265], hotRolled: [57.7, -0.718], forged: [272, -0.995] };
export const RELIABILITY = { 50: 1, 90: 0.897, 95: 0.868, 99: 0.814, 99.9: 0.753, 99.99: 0.702, 99.999: 0.659, 99.9999: 0.62 };
export const LOAD_TYPES = { bending: 1, axial: 0.85, torsion: 0.59 };
export const MEAN_METHODS = ['none', 'goodman', 'gerber', 'soderberg', 'asme'];
export const MEASURES = ['vonMises', 'maxPrincipal', 'tresca'];
const ENDURANCE_GROUPS = new Set(['steel', 'iron', 'titanium']);

/** Marin factors: { ka, kb, kc, kd, ke, k (their product) }. diameter in mm (0: no size effect), temperature °C. */
export function marinFactors({ su, finish = 'machined', diameter = 0, loadType = 'bending', temperature = 20, reliability = 50 } = {}) {
  const [a, b] = FINISHES[finish] ?? FINISHES.machined;
  const ka = Math.min(1, a * su ** b);
  const d = Number(diameter) || 0;
  const kb = loadType === 'axial' || !(d > 2.79) ? 1 : d <= 51 ? 1.24 * d ** -0.107 : 1.51 * Math.min(d, 254) ** -0.157;
  const kc = LOAD_TYPES[loadType] ?? 1;
  const F = (Number(temperature) * 9) / 5 + 32;             // the fit is in °F (70–1000 °F)
  const kd = F <= 70 ? 1 : Math.max(0.1, 0.975 + 0.432e-3 * F - 0.115e-5 * F ** 2 + 0.104e-8 * F ** 3 - 0.595e-12 * F ** 4);
  const ke = RELIABILITY[reliability] ?? 1;
  return { ka, kb, kc, kd, ke, k: ka * kb * kc * kd * ke };
}

/**
 * The S-N curve: { su, sy, se, points [[N, S] …] (N rising), endurance, marin, source }.
 * opts { material: { yield, ultimate?, group? }, source: 'estimate' | 'table', table: [[N, S] …], finish, diameter,
 * loadType, temperature, reliability }.
 */
export function buildCurve({ material = {}, source = 'estimate', table = null, ...marinOpts } = {}) {
  const sy = Number(material.yield) || 250;
  const su = Number(material.ultimate) > 0 ? Number(material.ultimate) : 1.25 * sy;
  const endurance = material.group ? ENDURANCE_GROUPS.has(material.group) : true;
  if (source === 'table' && Array.isArray(table) && table.length >= 2) {
    const points = table.map(([n, s]) => [Number(n), Number(s)]).filter(([n, s]) => n >= 1 && s > 0).sort((p, q) => p[0] - q[0]);
    if (points.length >= 2) return { su, sy, se: points.at(-1)[1], points, endurance, marin: null, source: 'table' };
  }
  const marin = marinFactors({ su, ...marinOpts });
  // Shigley: S'e = 0.5 Su (at most 700 MPa) for steels; 10³ cycles at f·Su (f = 0.9); Se = k · S'e at 10⁶.
  const seBase = endurance ? Math.min(0.5 * su, 700) : 0.35 * su;
  const se = Math.max(1e-3, marin.k * seBase);
  const f = 0.9;
  return { su, sy, se, points: [[1, su], [1e3, Math.max(se * 1.0001, f * su)], [1e6, se]], endurance, marin, source: 'estimate' };
}

/** Cycles to failure at a fully reversed amplitude `sa` (Infinity below the endurance limit). */
export function cyclesToFailure(sa, curve) {
  if (!(sa > 0)) return Infinity;
  const P = curve.points;
  if (sa >= P[0][1]) return P[0][0];
  for (let i = 1; i < P.length; i++) {
    const [n1, s1] = P[i - 1], [n2, s2] = P[i];
    if (sa >= s2) {
      if (s1 === s2) return n1;
      const t = Math.log(sa / s1) / Math.log(s2 / s1);
      return 10 ** (Math.log10(n1) + t * (Math.log10(n2) - Math.log10(n1)));
    }
  }
  if (curve.endurance) return Infinity;
  // Below the last point: the last slope continues.
  const [n1, s1] = P.at(-2), [n2, s2] = P.at(-1);
  const b = Math.log10(s2 / s1) / Math.log10(n2 / n1);
  return n2 * 10 ** (Math.log10(sa / s2) / b);
}

/** Equivalent fully reversed amplitude of (σa, σm): Infinity when the mean stress alone fails the part. */
export function equivalentAmplitude(sa, sm, curve, method = 'goodman') {
  if (!(sa > 0)) return 0;
  if (method === 'none' || !(sm > 0)) return sa;          // a compressive mean gets no credit
  const den = { goodman: 1 - sm / curve.su, gerber: 1 - (sm / curve.su) ** 2, soderberg: 1 - sm / curve.sy, asme: Math.sqrt(Math.max(0, 1 - (sm / curve.sy) ** 2)) }[method] ?? 1;
  return den > 0 ? sa / den : Infinity;
}

/** Principal stresses of a symmetric tensor [xx, yy, zz, xy, yz, zx], largest first. */
export function principals(s, o = 0) {
  const a = s[o], b = s[o + 1], c = s[o + 2], d = s[o + 3], e = s[o + 4], f = s[o + 5];
  const p1 = d * d + e * e + f * f;
  const q = (a + b + c) / 3;
  if (p1 < 1e-30 * (a * a + b * b + c * c + 1e-300)) return [a, b, c].sort((x, y) => y - x);
  const p2 = (a - q) ** 2 + (b - q) ** 2 + (c - q) ** 2 + 2 * p1, p = Math.sqrt(p2 / 6);
  const B = [(a - q) / p, d / p, f / p, d / p, (b - q) / p, e / p, f / p, e / p, (c - q) / p];
  const det = B[0] * (B[4] * B[8] - B[5] * B[7]) - B[1] * (B[3] * B[8] - B[5] * B[6]) + B[2] * (B[3] * B[7] - B[4] * B[6]);
  const r = Math.max(-1, Math.min(1, det / 2)), phi = Math.acos(r) / 3;
  const e1 = q + 2 * p * Math.cos(phi), e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3);
  return [e1, 3 * q - e1 - e3, e3];
}

/** The fatigue stress of a tensor for the measure (signed except Tresca), and its biaxiality σ_b / σ_a. */
export function measureOf(s, o, measure = 'vonMises') {
  const [p1, p2, p3] = principals(s, o);
  const big = Math.abs(p1) >= Math.abs(p3) ? p1 : p3;
  // Biaxiality: the second of the two largest-magnitude principals over the largest (−1 shear, 0 uniaxial, 1 equi-biaxial).
  const mags = [p1, p2, p3].sort((x, y) => Math.abs(y) - Math.abs(x));
  const biax = mags[0] ? mags[1] / mags[0] : 0;
  let value;
  if (measure === 'maxPrincipal') value = big;
  else if (measure === 'tresca') value = p1 - p3;
  else value = Math.sign(big || 1) * Math.sqrt(0.5 * ((p1 - p2) ** 2 + (p2 - p3) ** 2 + (p3 - p1) ** 2));
  return { value, biax };
}

/**
 * Rainflow counting (ASTM E1049-85, 4-point) of a load history: [{ range, mean, count (1 or ½) }]. The history is
 * first reduced to its reversals; a repeated block is closed (rotated to start at its largest peak) so no half
 * cycles remain.
 */
export function rainflow(history, { repeated = true } = {}) {
  let h = (history ?? []).map(Number).filter(Number.isFinite);
  if (h.length < 2) return [];
  if (repeated) { let k = 0; for (let i = 1; i < h.length; i++) if (Math.abs(h[i]) > Math.abs(h[k])) k = i; h = [...h.slice(k), ...h.slice(0, k), h[k]]; }
  const rev = [h[0]];
  for (let i = 1; i < h.length; i++) {
    const v = h[i], n = rev.length;
    if (v === rev[n - 1]) continue;
    if (n >= 2 && (rev[n - 1] - rev[n - 2]) * (v - rev[n - 1]) > 0) rev[n - 1] = v; else rev.push(v);
  }
  const out = [], stack = [];
  for (const v of rev) {
    stack.push(v);
    while (stack.length >= 3) {
      const n = stack.length, X = Math.abs(stack[n - 1] - stack[n - 2]), Y = Math.abs(stack[n - 2] - stack[n - 3]);
      if (X < Y) break;
      // A repeated block (the simplified method for repeating histories, §5.4.5): every range is a full cycle.
      if (n === 3 && !repeated) { out.push({ range: Y, mean: (stack[0] + stack[1]) / 2, count: 0.5 }); stack.shift(); }
      else { out.push({ range: Y, mean: (stack[n - 2] + stack[n - 3]) / 2, count: 1 }); stack.splice(n - 3, 2); }
    }
  }
  if (!repeated) for (let i = 0; i + 1 < stack.length; i++) out.push({ range: Math.abs(stack[i + 1] - stack[i]), mean: (stack[i + 1] + stack[i]) / 2, count: 0.5 });
  return out.filter((c) => c.range > 0);
}

/** Cycles as (amplitude factor, mean factor, count): from events [{ cycles, min, max }] or a history (× repeats). */
export function loadCycles({ events = null, history = null, repeats = 1 } = {}) {
  if (Array.isArray(history) && history.length >= 2) return rainflow(history).map((c) => ({ amp: c.range / 2, mean: c.mean, count: c.count * Math.max(0, Number(repeats) || 1) }));
  return (events ?? []).filter((e) => e && Number(e.cycles) > 0).map((e) => {
    const lo = Number(e.min ?? -1), hi = Number(e.max ?? 1);
    return { amp: Math.abs(hi - lo) / 2, mean: (hi + lo) / 2, count: Number(e.cycles) };
  });
}

/** Damage of one load block at a point of fatigue stress σ (static load) — Σ n / N. */
function damageAt(sigma, cycles, curve, method, kf) {
  let d = 0;
  for (const c of cycles) {
    // The cycle's stresses (σ × the factors), the larger magnitude first so a negative σ keeps its sign meaning.
    const a = Math.abs(c.amp * sigma) * kf, m = c.mean * sigma * kf;
    const seq = equivalentAmplitude(a, m, curve, method);
    if (!Number.isFinite(seq)) return Infinity;
    const N = cyclesToFailure(seq, curve);
    if (Number.isFinite(N)) d += c.count / N;
  }
  return d;
}

/**
 * Fatigue study of a static result (vertexTensor: 6 per surface vertex; else vertexStress, unsigned).
 * opts { material, curve (buildCurve options), measure, mean (correction), kf, events | history + repeats }.
 * Returns { curve, cycles, vertexDamage, vertexLife (blocks), vertexBiaxiality, maxDamage, minLife, worst (vertex),
 * factorOfSafety (load factor to a damage of 1 per block), endurance (true when every point is below the limit) }.
 */
export function fatigueStudy(staticResult, { material = {}, curve: curveOpts = {}, measure = 'vonMises', mean = 'goodman', kf = 1, events = null, history = null, repeats = 1 } = {}) {
  const curve = buildCurve({ material, ...curveOpts });
  const cycles = loadCycles({ events: events ?? [{ cycles: 1e6, min: -1, max: 1 }], history, repeats });
  const T = staticResult?.vertexTensor ?? null, vm = staticResult?.vertexStress ?? new Float32Array(0);
  const n = T ? T.length / 6 : vm.length;
  const sigma = new Float64Array(n), vertexBiaxiality = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (T) { const m = measureOf(T, 6 * i, measure); sigma[i] = m.value; vertexBiaxiality[i] = m.biax; } else sigma[i] = vm[i];
  }
  const K = Math.max(1, Number(kf) || 1);
  const vertexDamage = new Float32Array(n), vertexLife = new Float64Array(n);
  // The worst point: the largest damage, or (no damage anywhere) the largest stress.
  let maxDamage = 0, worst = -1, maxSigma = 0, peak = -1;
  for (let i = 0; i < n; i++) {
    const d = damageAt(sigma[i], cycles, curve, mean, K);
    vertexDamage[i] = Number.isFinite(d) ? d : 1e30;
    vertexLife[i] = d > 0 ? 1 / d : Infinity;
    if (d > maxDamage) { maxDamage = d; worst = i; }
    if (Math.abs(sigma[i]) > maxSigma) { maxSigma = Math.abs(sigma[i]); peak = i; }
  }
  if (worst < 0) worst = peak;
  // Load factor of safety: the factor λ on every stress at which the worst points reach a damage of 1 per block
  // (bisection, the damage rising with λ), or the endurance limit when the life is infinite.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(sigma[b]) - Math.abs(sigma[a])).slice(0, 64);
  const blockDamage = (lam) => { let w = 0; for (const i of order) w = Math.max(w, damageAt(sigma[i] * lam, cycles, curve, mean, K)); return w; };
  let factorOfSafety = Infinity;
  if (maxSigma > 0 && cycles.length) {
    let lo = 0, hi = 1;
    while (blockDamage(hi) < 1 && hi < 1e6) { lo = hi; hi *= 2; }
    if (hi < 1e6) { for (let it = 0; it < 60; it++) { const m2 = 0.5 * (lo + hi); if (blockDamage(m2) < 1) lo = m2; else hi = m2; } factorOfSafety = 0.5 * (lo + hi); }
  }
  return {
    curve, cycles, measure, mean, kf: K, vertexDamage, vertexLife, vertexBiaxiality, maxDamage, minLife: maxDamage > 0 ? 1 / maxDamage : Infinity,
    worst, factorOfSafety, endurance: maxDamage === 0, blockCycles: cycles.reduce((s, c) => s + c.count, 0),
  };
}
