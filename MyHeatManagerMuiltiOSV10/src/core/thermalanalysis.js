// Thermal analysis data (DSC and TGA, as exported by laboratory instruments):
// reading the curves, a linear baseline, peak integration (enthalpy), onset /
// peak / endset temperatures, specific heat, calibration against a reference
// standard, decomposition temperatures, and a phase-change material made from
// a DSC melting peak. Pure functions, unit-tested in Node.

/** Reference standards for DSC calibration: melting onset (°C) and enthalpy (J/g). */
export const DSC_STANDARDS = {
  indium: { name: 'Indium', onset: 156.6, enthalpy: 28.45 },
  tin: { name: 'Tin', onset: 231.9, enthalpy: 60.5 },
  zinc: { name: 'Zinc', onset: 419.5, enthalpy: 107.5 },
  water: { name: 'Water', onset: 0.0, enthalpy: 333.6 },
};

/**
 * Parses a two- (or more) column CSV: temperature (°C) and a signal (DSC heat flow in mW, or TGA mass in % or mg),
 * optionally time (s or min). Header names are matched loosely; without a header the first column is T and the
 * second the signal. Returns { T: [], y: [], time: [] | null, columns }.
 */
export function parseCurveCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (lines.length < 3) throw new Error('need at least a few rows');
  const sep = [',', ';', '\t'].map((s) => [s, lines[0].split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const first = lines[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const hasHeader = first.some((c) => Number.isNaN(Number(c)));
  const head = hasHeader ? first.map((c) => c.toLowerCase()) : first.map((_, i) => (i === 0 ? 't' : 'y'));
  const find = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  let iT = find('temp', 't (', 't[', 't_', 't');
  let iTime = find('time', 'min', 'sec', 's (');
  if (iTime === iT) iTime = -1;
  let iY = find('heat', 'hf', 'dsc', 'mw', 'mass', 'weight', 'tg', 'signal', 'y');
  if (iT < 0) iT = 0;
  if (iY < 0 || iY === iT || iY === iTime) iY = [0, 1, 2].find((i) => i !== iT && i !== iTime && i < first.length) ?? 1;
  const T = []; const y = []; const time = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const cells = line.split(sep).map((c) => Number(c.trim().replace(/^"|"$/g, '').replace(',', '.')));
    if (!Number.isFinite(cells[iT]) || !Number.isFinite(cells[iY])) continue;
    T.push(cells[iT]);
    y.push(cells[iY]);
    if (iTime >= 0) time.push(cells[iTime]);
  }
  if (T.length < 3) throw new Error('no numeric rows');
  return { T, y, time: iTime >= 0 ? time : null, columns: head };
}

/** Linear baseline through the signal at T1 and T2 (°C), evaluated at every point. */
export function linearBaseline(T, y, T1, T2) {
  const at = (target) => {
    let best = 0;
    for (let i = 1; i < T.length; i++) if (Math.abs(T[i] - target) < Math.abs(T[best] - target)) best = i;
    return [T[best], y[best]];
  };
  const [ta, ya] = at(T1);
  const [tb, yb] = at(T2);
  const slope = tb === ta ? 0 : (yb - ya) / (tb - ta);
  return T.map((t) => ya + slope * (t - ta));
}

/**
 * Integrates a DSC peak between T1 and T2 over a linear baseline.
 * mass (mg), rate (K/min). Heat flow in mW; endothermic up is assumed unless `endoDown`.
 * Returns { enthalpy (J/g), onset, peak, endset (°C), height (mW), baseline: [] }.
 * The integral uses time: dt = dT / rate (or the time column when given).
 */
export function integratePeak(curve, { T1, T2, mass, rate = 10, endoDown = false }) {
  const { T, y } = curve;
  const sign = endoDown ? -1 : 1;
  const base = linearBaseline(T, y, T1, T2);
  let area = 0; // mJ
  let peakI = -1;
  let height = 0;
  for (let i = 1; i < T.length; i++) {
    if (T[i] < Math.min(T1, T2) || T[i] > Math.max(T1, T2)) continue;
    const d0 = sign * (y[i - 1] - base[i - 1]);
    const d1 = sign * (y[i] - base[i]);
    const dt = curve.time ? (curve.time[i] - curve.time[i - 1]) * (curve.time[curve.time.length - 1] > 300 ? 1 : 60) : ((T[i] - T[i - 1]) / rate) * 60;
    area += ((d0 + d1) / 2) * dt;
    if (d1 > height) { height = d1; peakI = i; }
  }
  if (peakI < 0) return { enthalpy: 0, onset: NaN, peak: NaN, endset: NaN, height: 0, baseline: base };
  // Onset / endset: where the tangents through the steepest points of the leading and trailing edges cross the baseline.
  const tangentCross = (from, to, step) => {
    let best = -1; let slopeBest = 0;
    for (let i = from; i !== to; i += step) {
      const j = i + step;
      if (j < 0 || j >= T.length) break;
      const s = (sign * (y[j] - base[j]) - sign * (y[i] - base[i])) / (T[j] - T[i] || 1e-12);
      if (Math.abs(s) > Math.abs(slopeBest)) { slopeBest = s; best = i; }
    }
    if (best < 0 || slopeBest === 0) return NaN;
    const d = sign * (y[best] - base[best]);
    return T[best] - d / slopeBest;
  };
  const lo = T.findIndex((t) => t >= Math.min(T1, T2));
  let hi = T.length - 1;
  while (hi > 0 && T[hi] > Math.max(T1, T2)) hi--;
  return {
    enthalpy: area / 1000 / (mass / 1000), // J/g
    onset: tangentCross(lo, peakI, 1),
    peak: T[peakI],
    endset: tangentCross(hi, peakI, -1),
    height,
    baseline: base,
  };
}

/** Apparent specific heat (J/gK) from a baseline-corrected heat flow: cp = HF / (m · β). */
export function specificHeat(hf_mW, mass_mg, rate_K_min) {
  return (hf_mW / 1000) / ((mass_mg / 1000) * (rate_K_min / 60));
}

/** Calibration from a measured standard: temperature offset (°C) and enthalpy factor. */
export function calibration(standardId, measuredOnset, measuredEnthalpy) {
  const std = DSC_STANDARDS[standardId];
  if (!std) throw new Error(`unknown standard ${standardId}`);
  return { offset: std.onset - measuredOnset, factor: measuredEnthalpy > 0 ? std.enthalpy / measuredEnthalpy : 1, standard: std };
}

export function applyCalibration(result, cal) {
  if (!cal) return result;
  return { ...result, onset: result.onset + cal.offset, peak: result.peak + cal.offset, endset: result.endset + cal.offset, enthalpy: result.enthalpy * cal.factor };
}

/**
 * TGA: mass curve (% or mg) → { start, T5, T10, T50 (°C at that % mass loss), residue (%), dtgPeak (°C of the fastest loss), steps }.
 */
export function analyseTga(curve) {
  const { T, y } = curve;
  const m0 = y[0];
  const pct = y.map((v) => (v / m0) * 100);
  const atLoss = (loss) => {
    for (let i = 1; i < pct.length; i++) {
      if (100 - pct[i] >= loss) {
        const f = (100 - loss - pct[i - 1]) / (pct[i] - pct[i - 1] || 1e-12);
        return T[i - 1] + f * (T[i] - T[i - 1]);
      }
    }
    return NaN;
  };
  // DTG: −dm/dT, smoothed over a few points.
  const dtg = pct.map((_, i) => {
    const a = Math.max(0, i - 3);
    const b = Math.min(pct.length - 1, i + 3);
    return -(pct[b] - pct[a]) / (T[b] - T[a] || 1e-12);
  });
  let peak = 0;
  for (let i = 1; i < dtg.length; i++) if (dtg[i] > dtg[peak]) peak = i;
  // Steps: local maxima of DTG above 20 % of the largest.
  const steps = [];
  for (let i = 2; i < dtg.length - 2; i++) {
    if (dtg[i] > dtg[peak] * 0.2 && dtg[i] >= dtg[i - 1] && dtg[i] >= dtg[i + 1] && dtg[i] > dtg[i - 2] && dtg[i] > dtg[i + 2]) steps.push(T[i]);
  }
  return { T5: atLoss(5), T10: atLoss(10), T50: atLoss(50), residue: pct[pct.length - 1], dtgPeak: T[peak], dtg, percent: pct, steps };
}

/** A phase-change material from a DSC melting peak (latent heat in J/kg). */
export function pcmFromDsc(result, base = {}, name = 'DSC PCM') {
  const range = Number.isFinite(result.endset - result.onset) ? Math.max(0.5, result.endset - result.onset) : 2;
  return {
    k: 0.2, kLiquid: 0.2, rho: 850, cp: 2000, emissivity: 0.9, E: 1e8, nu: 0.4, alpha: 1e-4, color: '#f2c27b',
    ...base,
    id: base.id ?? 'dscPcm', name, kind: 'pcm',
    Tmelt: Math.round(((result.onset + result.endset) / 2 || result.peak) * 10) / 10,
    meltRange: Math.round(range * 10) / 10,
    latent: Math.round(result.enthalpy * 1000),
  };
}

/** Sample DSC data: a paraffin melting at ~35 °C (180 J/g) on a sloping baseline, 10 K/min, 8 mg. */
export function sampleDscCsv() {
  const rows = ['Temperature (°C),Heat flow (mW)'];
  const mass = 8; // mg
  const rate = 10; // K/min
  const H = 180; // J/g
  const Tm = 36;
  const sigma = 2.2;
  for (let T = 0; T <= 70; T += 0.25) {
    const base = 0.9 + 0.006 * T; // cp contribution
    const gauss = Math.exp(-((T - Tm) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI)); // 1/K
    const peak = H * mass * (rate / 60) * gauss; // mW (J/g · mg · K/s · 1/K = mJ/s)
    rows.push(`${T.toFixed(2)},${(base + peak + 0.01 * Math.sin(T * 3)).toFixed(4)}`);
  }
  return `${rows.join('\n')}\n`;
}

/** Sample TGA data: a polymer losing 3 % moisture near 100 °C and decomposing near 420 °C to 8 % residue. */
export function sampleTgaCsv() {
  const rows = ['Temperature (°C),Mass (%)'];
  for (let T = 30; T <= 700; T += 2) {
    const moisture = 3 / (1 + Math.exp(-(T - 100) / 8));
    const decomp = 89 / (1 + Math.exp(-(T - 420) / 15));
    rows.push(`${T},${(100 - moisture - decomp).toFixed(3)}`);
  }
  return `${rows.join('\n')}\n`;
}

// ───────────────────────── glass transition, derivatives, kinetics, cp by the sapphire method

const R_GAS = 8.314462618; // J/(mol·K)
const KELVIN = 273.15;

/** Indices of the points with T1 ≤ T ≤ T2 (°C). */
function windowIndices(T, T1, T2) {
  const lo = Math.min(T1, T2);
  const hi = Math.max(T1, T2);
  const out = [];
  for (let i = 0; i < T.length; i++) if (T[i] >= lo && T[i] <= hi) out.push(i);
  return out;
}

/** Least-squares line y = intercept + slope·x → { slope, intercept, r2 }. */
export function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: n ? ys[0] : 0, r2: NaN };
  let sx = 0; let sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n; const my = sy / n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return { slope, intercept: my - slope * mx, r2: syy > 0 && sxx > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
}

/** Local quadratic least squares around point i over `size` points (shifted at the ends) → [value, dy/dT, ½·d²y/dT²]. */
function localQuadratic(T, y, i, size) {
  const n = T.length;
  const w = Math.min(n, Math.max(3, size));
  let a = Math.max(0, i - Math.floor(w / 2));
  a = Math.min(a, n - w);
  const S = [0, 0, 0, 0, 0]; const B = [0, 0, 0];
  for (let p = a; p < a + w; p++) {
    const x = T[p] - T[i];
    let xp = 1;
    for (let q = 0; q < 5; q++) { S[q] += xp; if (q < 3) B[q] += xp * y[p]; xp *= x; }
  }
  // Solve the 3×3 normal equations [S0 S1 S2; S1 S2 S3; S2 S3 S4]·c = B (Cramer).
  const m = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(m);
  if (Math.abs(D) < 1e-30) return [y[i], 0, 0];
  return [0, 1, 2].map((c) => det(m.map((row, r) => row.map((v, k) => (k === c ? B[r] : v)))) / D);
}

/** Savitzky–Golay (quadratic) smoothed derivative dy/dT over `window` points → [{ T, y: dy/dT }] (signal units per K). */
export function derivative(curve, window = 7) {
  return curve.T.map((t, i) => ({ T: t, y: localQuadratic(curve.T, curve.y, i, window)[1] }));
}

/** Savitzky–Golay (quadratic) smoothed signal → [{ T, y }]. */
export function smoothCurve(curve, window = 7) {
  return curve.T.map((t, i) => ({ T: t, y: localQuadratic(curve.T, curve.y, i, window)[0] }));
}

/**
 * Glass transition (ASTM E1356 / ISO 11357-2) between T1 and T2 (°C): least-squares baselines on the first and last
 * 20 % of the window, the inflection tangent at the largest |dy/dT| (lightly smoothed), onset / endset where it meets
 * the baselines, midpoint at half the step height between them. opts: { rate (K/min), mass (mg), window }.
 * Returns { onset, midpoint, endset, inflection (°C), step (signal units), deltaCp, deltaCpUnit, pre, post, tangent }
 * — deltaCp in J/gK with rate and mass, mJ/K (signal mW ÷ β) with only a rate, else the step in signal units.
 */
export function glassTransition(curve, T1, T2, opts = {}) {
  const { T, y } = curve;
  const idx = windowIndices(T, T1, T2);
  if (idx.length < 10) throw new Error('need at least 10 points in the window');
  const nb = Math.max(3, Math.round(idx.length * 0.2));
  const head = idx.slice(0, nb); const tail = idx.slice(-nb);
  const pre = linearFit(head.map((i) => T[i]), head.map((i) => y[i]));
  const post = linearFit(tail.map((i) => T[i]), tail.map((i) => y[i]));
  const preAt = (t) => pre.intercept + pre.slope * t;
  const postAt = (t) => post.intercept + post.slope * t;
  const size = opts.window ?? 7;
  let best = -1; let bestS = 0;
  for (const i of idx.slice(nb, idx.length - nb)) {
    const s = localQuadratic(T, y, i, size)[1];
    if (Math.abs(s) > Math.abs(bestS)) { bestS = s; best = i; }
  }
  if (best < 0) best = idx[Math.floor(idx.length / 2)];
  const yi = localQuadratic(T, y, best, size)[0];
  const cross = (line) => (bestS === line.slope ? NaN : (line.intercept - yi + bestS * T[best]) / (bestS - line.slope));
  // Midpoint: where the smoothed signal crosses half way between the two baselines (the crossing nearest the inflection).
  let midpoint = NaN;
  const g = (i) => localQuadratic(T, y, i, size)[0] - (preAt(T[i]) + postAt(T[i])) / 2;
  for (let n = 1; n < idx.length; n++) {
    const a = g(idx[n - 1]); const b = g(idx[n]);
    if ((a < 0) !== (b < 0) || a === 0) {
      const tm = a === b ? T[idx[n - 1]] : T[idx[n - 1]] + (a / (a - b)) * (T[idx[n]] - T[idx[n - 1]]);
      if (!Number.isFinite(midpoint) || Math.abs(tm - T[best]) < Math.abs(midpoint - T[best])) midpoint = tm;
    }
  }
  const at = Number.isFinite(midpoint) ? midpoint : T[best];
  const step = postAt(at) - preAt(at);
  const rate = opts.rate ?? curve.rate;
  const mass = opts.mass ?? curve.mass;
  let deltaCp = step; let deltaCpUnit = 'signal';
  if (rate > 0 && mass > 0) { deltaCp = specificHeat(step, mass, rate); deltaCpUnit = 'J/gK'; } else if (rate > 0) { deltaCp = step / (rate / 60); deltaCpUnit = 'mJ/K'; }
  const a = cross(pre); const b = cross(post);
  return {
    onset: Math.min(a, b), midpoint, endset: Math.max(a, b), inflection: T[best],
    step, deltaCp, deltaCpUnit, pre, post, tangent: { slope: bestS, T: T[best], y: yi },
  };
}

/** Running fraction (0..1) of the area between y and the baseline over the window indices → Map(index → α). */
function partialFraction(T, y, base, idx) {
  const cum = [0];
  for (let n = 1; n < idx.length; n++) {
    const i = idx[n]; const p = idx[n - 1];
    cum.push(cum[n - 1] + ((y[i] - base[i] + y[p] - base[p]) / 2) * (T[i] - T[p]));
  }
  const total = cum[cum.length - 1];
  const out = new Map();
  idx.forEach((i, n) => out.set(i, total !== 0 ? Math.min(1, Math.max(0, cum[n] / total)) : 0));
  return out;
}

/**
 * Sigmoidal baseline between T1 and T2 (°C): tangents fitted on the first and last 10 % of the window, blended by the
 * running fraction of the peak area (α): B = (1 − α)·pre + α·post, repeated `iterations` times starting from the
 * linear baseline. Returns one value per point (pre tangent before T1, post tangent after T2).
 */
export function sigmoidBaseline(curve, T1, T2, iterations = 2) {
  const { T, y } = curve;
  const idx = windowIndices(T, T1, T2);
  if (idx.length < 6) return linearBaseline(T, y, T1, T2);
  const nb = Math.max(3, Math.round(idx.length * 0.1));
  const head = idx.slice(0, nb); const tail = idx.slice(-nb);
  const pre = linearFit(head.map((i) => T[i]), head.map((i) => y[i]));
  const post = linearFit(tail.map((i) => T[i]), tail.map((i) => y[i]));
  let base = linearBaseline(T, y, T1, T2);
  for (let it = 0; it < Math.max(1, iterations); it++) {
    const alpha = partialFraction(T, y, base, idx);
    base = T.map((t, i) => {
      const lineA = pre.intercept + pre.slope * t;
      const lineB = post.intercept + post.slope * t;
      if (t < Math.min(T1, T2)) return lineA;
      if (t > Math.max(T1, T2)) return lineB;
      const f = alpha.get(i) ?? 0;
      return (1 - f) * lineA + f * lineB;
    });
  }
  return base;
}

/** Conversion α (0..1) through a peak between T1 and T2 (°C) over a 'linear' or 'sigmoid' baseline → [{ T, alpha }]. */
export function conversion(curve, T1, T2, baseline = 'linear') {
  const base = baseline === 'sigmoid' ? sigmoidBaseline(curve, T1, T2) : linearBaseline(curve.T, curve.y, T1, T2);
  const idx = windowIndices(curve.T, T1, T2);
  const alpha = partialFraction(curve.T, curve.y, base, idx);
  return idx.map((i) => ({ T: curve.T[i], alpha: alpha.get(i) }));
}

/** Several peaks of one curve: ranges [{ T1, T2 }] (°C), shared opts { mass, rate, endoDown } → integratePeak results (+ T1, T2). */
export function integratePeaks(curve, ranges = [], opts = {}) {
  return ranges.map((r) => ({ ...integratePeak(curve, { ...opts, ...r }), T1: r.T1, T2: r.T2 }));
}

/**
 * Kissinger: ln(β/Tp²) against 1/Tp for runs [{ rate (K/min), Tp (°C) }] → { Ea (J/mol), Ea_kJ, A (1/s), r2, points: [{ x: 1/Tp (1/K), y }] }.
 * A = β·Ea/(R·Tp²)·exp(Ea/(R·Tp)) (first-order reaction, β in K/s), averaged over the runs.
 */
export function kissinger(runs) {
  const points = runs.map((r) => {
    const Tp = r.Tp + KELVIN;
    return { x: 1 / Tp, y: Math.log(r.rate / (Tp * Tp)), rate: r.rate, Tp: r.Tp };
  });
  if (points.length < 2) throw new Error('need at least two heating rates');
  const fit = linearFit(points.map((p) => p.x), points.map((p) => p.y));
  const Ea = -fit.slope * R_GAS;
  const A = points.reduce((s, p) => s + ((p.rate / 60) * Ea * p.x * p.x / R_GAS) * Math.exp((Ea * p.x) / R_GAS), 0) / points.length;
  return { Ea, Ea_kJ: Ea / 1000, A, r2: fit.r2, points };
}

/**
 * Ozawa–Flynn–Wall isoconversional method: runs [{ rate (K/min), T (°C at one conversion α) }] →
 * { Ea (J/mol), Ea_kJ, r2, points } from ln β = const − 1.052·Ea/(R·T) (Doyle's approximation).
 */
export function ozawaFlynnWall(runs) {
  const points = runs.map((r) => ({ x: 1 / (r.T + KELVIN), y: Math.log(r.rate) }));
  if (points.length < 2) throw new Error('need at least two heating rates');
  const fit = linearFit(points.map((p) => p.x), points.map((p) => p.y));
  const Ea = (-fit.slope * R_GAS) / 1.052;
  return { Ea, Ea_kJ: Ea / 1000, r2: fit.r2, points };
}

/**
 * TGA steps: the DTG (−d mass%/dT, smoothed) is split at its minima between peaks above `minPeak` × the largest.
 * Per step { Tstart, Tend, massLossPct, dtgPeakT, dtgPeak (%/K), extrapolatedOnset (°C, ISO 11358: the tangent at the
 * DTG peak meets the preceding plateau level), extrapolatedEnd }. opts: { minPeak = 0.05, window = 9, threshold = 0.02 }.
 */
export function tgaSteps(curve, opts = {}) {
  const { T, y } = curve;
  const minPeak = opts.minPeak ?? 0.05;
  const threshold = opts.threshold ?? 0.02;
  const size = opts.window ?? 9;
  const pct = y.map((v) => (v / y[0]) * 100);
  const dtg = derivative({ T, y: pct }, size).map((p) => -p.y);
  const top = Math.max(...dtg);
  if (!(top > 0)) return [];
  const peaks = [];
  for (let i = 1; i < dtg.length - 1; i++) {
    if (dtg[i] < top * minPeak || dtg[i] < dtg[i - 1] || dtg[i] < dtg[i + 1]) continue;
    if (peaks.length && i - peaks[peaks.length - 1] < 3) { if (dtg[i] > dtg[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; continue; }
    peaks.push(i);
  }
  const valley = (a, b) => { let lo = a; for (let i = a; i <= b; i++) if (dtg[i] < dtg[lo]) lo = i; return lo; };
  // Keep only peaks separated by a real valley (a dip below 80 % of the smaller peak).
  const kept = [];
  for (const p of peaks) {
    const q = kept[kept.length - 1];
    if (q != null && dtg[valley(q, p)] > 0.8 * Math.min(dtg[p], dtg[q])) { if (dtg[p] > dtg[q]) kept[kept.length - 1] = p; continue; }
    kept.push(p);
  }
  return kept.map((p, n) => {
    let s;
    if (n === 0) { s = p; while (s > 0 && dtg[s] > dtg[p] * threshold) s--; } else s = valley(kept[n - 1], p);
    let e;
    if (n === kept.length - 1) { e = p; while (e < dtg.length - 1 && dtg[e] > dtg[p] * threshold) e++; } else e = valley(p, kept[n + 1]);
    const slope = -dtg[p];
    const mp = localQuadratic(T, pct, p, size)[0];
    return {
      Tstart: T[s], Tend: T[e], massLossPct: pct[s] - pct[e], dtgPeakT: T[p], dtgPeak: dtg[p],
      extrapolatedOnset: T[p] + (pct[s] - mp) / slope, extrapolatedEnd: T[p] + (pct[e] - mp) / slope,
    };
  });
}

/**
 * Specific heat of synthetic sapphire (α-Al₂O₃), J/(g·K) against °C: 0 and 25 °C from Ditmars et al. (NIST SRM 720),
 * 50–700 °C from the NIST/JANAF Shomate fit for corundum (within about 1 % of the Ditmars values).
 */
export const SAPPHIRE_CP = [[0, 0.718], [25, 0.775], [50, 0.8295], [75, 0.8757], [100, 0.9142], [125, 0.9467], [150, 0.9747], [175, 0.999], [200, 1.0204],
  [225, 1.0395], [250, 1.0566], [275, 1.0721], [300, 1.0862], [325, 1.0992], [350, 1.1111], [375, 1.1222], [400, 1.1325], [425, 1.1421], [450, 1.1512],
  [475, 1.1597], [500, 1.1677], [525, 1.1753], [550, 1.1825], [575, 1.1894], [600, 1.1959], [625, 1.2022], [650, 1.2081], [675, 1.2138], [700, 1.2193]];

/** Piecewise-linear lookup in [[x, y], …] sorted by x (clamped at the ends). */
function lookup(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1]; const [x1, y1] = table[i];
      return x1 === x0 ? y1 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

/** Sapphire cp (J/gK) at T (°C), interpolated in SAPPHIRE_CP. */
export function sapphireCpAt(T) {
  return lookup(SAPPHIRE_CP, T);
}

/** A curve's signal at temperature t (linear interpolation; T may run either way). */
function curveAt(curve, t) {
  const pairs = curve.T.map((x, i) => [x, curve.y[i]]).sort((a, b) => a[0] - b[0]);
  return lookup(pairs, t);
}

/**
 * Specific heat by the sapphire (ratio) method, ASTM E1269: cp = cp_sapphire(T) · (D_sample / D_sapphire) · (m_sapphire / m_sample),
 * D = signal − blank at the same T. Curves { T (°C), y (mW) }, masses in mg. Returns { points: [{ T, cp (J/gK) }],
 * cpT: [[T °C, cp J/kgK], …] (at most 60 rows — usable as a material's cpT table) }.
 */
export function sapphireCp({ blank, sapphire, sample, massSapphire, massSample }) {
  if (!(massSapphire > 0) || !(massSample > 0)) throw new Error('masses must be positive');
  const lo = Math.max(Math.min(...sapphire.T), Math.min(...blank.T));
  const hi = Math.min(Math.max(...sapphire.T), Math.max(...blank.T));
  const points = [];
  sample.T.forEach((t, i) => {
    if (t < lo || t > hi) return;
    const b = curveAt(blank, t);
    const dSt = curveAt(sapphire, t) - b;
    if (Math.abs(dSt) < 1e-12) return;
    points.push({ T: t, cp: sapphireCpAt(t) * ((sample.y[i] - b) / dSt) * (massSapphire / massSample) });
  });
  const step = Math.max(1, Math.ceil(points.length / 60));
  const cpT = points.filter((_, i) => i % step === 0 || i === points.length - 1).map((p) => [p.T, Math.round(p.cp * 10000) / 10]);
  return { points, cpT };
}

/**
 * Multi-point temperature calibration from standards [{ name, measured, reference }] (°C): least-squares
 * reference = slope · measured + offset (one standard: a pure offset). Returns { slope, offset, r2, apply(T) }.
 */
export function multiPointCalibration(standards) {
  const list = standards.filter((s) => Number.isFinite(s.measured) && Number.isFinite(s.reference));
  if (!list.length) throw new Error('need at least one standard');
  if (list.length === 1) {
    const offset = list[0].reference - list[0].measured;
    return { slope: 1, offset, r2: 1, apply: (T) => T + offset };
  }
  const fit = linearFit(list.map((s) => s.measured), list.map((s) => s.reference));
  return { slope: fit.slope, offset: fit.intercept, r2: fit.r2, apply: (T) => fit.slope * T + fit.intercept };
}

/** Synthetic glass-transition DSC curve: a tanh step of `step` mW (downward, endo up) at Tg with half-width `width` K on a sloping baseline → { T, y, rate, mass }. */
export function sampleTgCurve({ Tg = 105, step = 0.12, width = 3, rate = 10, mass = 10, from = 60, to = 150, dT = 0.25, noise = 0 } = {}) {
  const T = []; const y = [];
  for (let n = 0; from + n * dT <= to + 1e-9; n++) {
    const t = from + n * dT;
    T.push(t);
    y.push(-0.5 - 0.001 * (t - from) - (step / 2) * (1 + Math.tanh((t - Tg) / width)) + noise * Math.sin(t * 7.3));
  }
  return { T, y, time: null, rate, mass };
}

/**
 * Synthetic DSC runs of a first-order reaction dα/dt = A·exp(−Ea/RT)·(1 − α) at several heating rates (K/min):
 * [{ rate, curve: { T (°C), y (mW, exotherm up) }, Tp (°C), alphaAt(α) → T (°C) }]. Ea J/mol, A 1/s, H J/g, mass mg.
 */
export function sampleKineticRuns({ Ea = 80e3, A = 1e9, H = 300, mass = 5, rates = [5, 10, 20], from = 20, to = 300, dT = 0.05 } = {}) {
  return rates.map((rate) => {
    const beta = rate / 60; // K/s
    const T = []; const y = []; const alphas = [];
    let alpha = 0;
    for (let n = 0; from + n * dT <= to + 1e-9; n++) {
      const t = from + n * dT;
      const k = A * Math.exp(-Ea / (R_GAS * (t + KELVIN)));
      const next = 1 - (1 - alpha) * Math.exp(-k * (dT / beta)); // exact first-order update with k frozen over the step
      y.push(H * mass * k * (1 - (alpha + next) / 2)); // J/g · mg · 1/s = mW
      alpha = next;
      T.push(t);
      alphas.push(alpha);
    }
    let p = 0;
    for (let i = 1; i < y.length; i++) if (y[i] > y[p]) p = i;
    let Tp = T[p];
    if (p > 0 && p < y.length - 1) {
      const den = y[p - 1] - 2 * y[p] + y[p + 1];
      if (den !== 0) Tp = T[p] + (0.5 * dT * (y[p - 1] - y[p + 1])) / den; // parabolic refinement
    }
    const alphaAt = (a) => {
      const i = alphas.findIndex((v) => v >= a);
      if (i <= 0) return NaN;
      return T[i - 1] + ((a - alphas[i - 1]) / (alphas[i] - alphas[i - 1])) * dT;
    };
    return { rate, curve: { T, y, time: null, rate, mass }, Tp, alphaAt };
  });
}
