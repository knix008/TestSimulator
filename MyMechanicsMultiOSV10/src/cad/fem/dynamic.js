// Linear dynamics by mode superposition on the tetrahedral engine (modal.js gives mass-normalised modes φ_i, ω_i and
// participation factors Γ_i = φ_iᵀ M ι). Each mode is a damped oscillator q̈ + 2ζω q̇ + ω² q = p_i(t) with
//   force excitation   p_i = φ_iᵀ F · g(t)          (F: the face loads; g the load factor over time / frequency)
//   base excitation    p_i = −Γ_i,axis · a(t)        (the fixtures shaken along an axis; motion relative to them)
// Studies:
//   harmonic   the steady response to a sine of each frequency in a range: H_i(Ω) = 1 / (ω_i² − Ω² + 2iζω_iΩ);
//              the curves (largest displacement and von Mises stress over the model) and the fields at the peak
//              (the stress the largest over one period, from its complex amplitude)
//   transient  the load factor over time (piecewise linear), each mode integrated exactly over every step
//              (the piecewise-linear recurrence, Chopra §5.2); the peak and the fields at it
//   random     a base acceleration PSD (log-log table): modal covariances C_ik = ∫ Re(H_i H̄_k) S(f) df, then per point
//              E[u²] = Σ Γ_iΓ_k C_ik φ_i φ_k and, for von Mises, E[σ_vm²] = Σ Γ_iΓ_k C_ik σ_iᵀ A σ_k (Gaussian, exact
//              mean square — the Segalman approach); 1σ and 3σ values
// Units: mm, N, MPa, t/mm³, s; accelerations mm/s² (g = 9806.65 mm/s²); PSD (mm/s²)²/Hz.
import { modalStudy } from './modal.js';
import { loadVector, elasticStresses, surfaceField } from './model.js';

export const G = 9806.65;

/** von Mises quadratic form σᵀAσ = σ_vm² for σ = [xx, yy, zz, xy, yz, zx]. */
const vmQuad = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - 0.5 * (a[0] * b[1] + a[1] * b[0] + a[1] * b[2] + a[2] * b[1] + a[2] * b[0] + a[0] * b[2]) + 3 * (a[3] * b[3] + a[4] * b[4] + a[5] * b[5]);

/** Log-log interpolation of a PSD table [[f, S] …] at f (0 outside it). */
export function psdAt(table, f) {
  if (!table?.length || f < table[0][0] || f > table.at(-1)[0]) return 0;
  for (let i = 1; i < table.length; i++) {
    const [f1, s1] = table[i - 1], [f2, s2] = table[i];
    if (f <= f2) { if (!(s1 > 0 && s2 > 0)) return s1 + ((s2 - s1) * (f - f1)) / (f2 - f1 || 1); return s1 * (f / f1) ** (Math.log(s2 / s1) / Math.log(f2 / f1)); }
  }
  return 0;
}

/** RMS of a PSD table (∫ S df, log-log segments integrated exactly). */
export function psdRms(table) {
  let s = 0;
  for (let i = 1; i < table.length; i++) {
    const [f1, s1] = table[i - 1], [f2, s2] = table[i];
    if (!(s1 > 0 && s2 > 0)) { s += 0.5 * (s1 + s2) * (f2 - f1); continue; }
    const n = Math.log(s2 / s1) / Math.log(f2 / f1);
    s += Math.abs(n + 1) < 1e-9 ? s1 * f1 * Math.log(f2 / f1) : (s1 / (n + 1)) * (f2 * (f2 / f1) ** n - f1);
  }
  return Math.sqrt(Math.max(0, s));
}

/** The frequencies to evaluate: log-spaced over [a, b] plus a dense band (±4ζ) around every natural frequency. */
function frequencyGrid(a, b, steps, naturals, zeta) {
  const out = new Set();
  const n = Math.max(2, Math.round(steps));
  for (let i = 0; i < n; i++) out.add(a * (b / a) ** (i / (n - 1)));
  for (const fn of naturals) for (let k = -20; k <= 20; k++) { const f = fn * (1 + (k / 20) * 4 * zeta); if (f >= a && f <= b) out.add(f); }
  return [...out].sort((x, y) => x - y);
}

/** One-mode response of the piecewise-linear load p over the steps (exact for p linear in each step). */
function sdofHistory(omega, zeta, p, dt) {
  const wd = omega * Math.sqrt(1 - zeta * zeta), e = Math.exp(-zeta * omega * dt), s = Math.sin(wd * dt), c = Math.cos(wd * dt);
  const z = zeta / Math.sqrt(1 - zeta * zeta), k = omega * omega;
  // Chopra Table 5.2.1 (u'' + 2ζωu' + ω²u = p/m with m = 1): u_{i+1} = A u + B v + C p_i + D p_{i+1}, v likewise.
  const A = e * (z * s + c), B = e * (s / wd);
  const C = (1 / k) * ((2 * zeta) / (omega * dt) + e * (((1 - 2 * zeta * zeta) / (wd * dt) - z) * s - (1 + (2 * zeta) / (omega * dt)) * c));
  const D = (1 / k) * (1 - (2 * zeta) / (omega * dt) + e * (((2 * zeta * zeta - 1) / (wd * dt)) * s + ((2 * zeta) / (omega * dt)) * c));
  const A2 = -e * ((omega / Math.sqrt(1 - zeta * zeta)) * s), B2 = e * (c - z * s);
  const C2 = (1 / k) * (-1 / dt + e * ((omega / Math.sqrt(1 - zeta * zeta) + zeta / (dt * Math.sqrt(1 - zeta * zeta))) * s + (1 / dt) * c));
  const D2 = (1 / (k * dt)) * (1 - e * (z * s + c));
  const u = new Float64Array(p.length);
  let x = 0, v = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const x1 = A * x + B * v + C * p[i] + D * p[i + 1], v1 = A2 * x + B2 * v + C2 * p[i] + D2 * p[i + 1];
    x = x1; v = v1; u[i + 1] = x;
  }
  return u;
}

/** Piecewise-linear factor curve [[t, g] …] at time t (held at the last value). */
const curveAt = (curve, t) => { if (!curve?.length) return 1; if (t <= curve[0][0]) return curve[0][1]; for (let i = 1; i < curve.length; i++) if (t <= curve[i][0]) { const [t1, g1] = curve[i - 1], [t2, g2] = curve[i]; return g1 + ((g2 - g1) * (t - t1)) / (t2 - t1 || 1); } return curve.at(-1)[1]; };

/**
 * A dynamic study. input: { bodies, fixtures, mesh, modes (default 10), damping (ζ, 0.02), kind: 'harmonic' |
 * 'transient' | 'random', excitation: { type: 'force', loads } | { type: 'base', axis: 'x'|'y'|'z', acceleration (mm/s²) },
 * harmonic: { from, to, steps }, transient: { duration, dt, curve }, random: { psd, from, to, steps }, onProgress }.
 */
export function dynamicStudy(input) {
  const { kind = 'harmonic', damping = 0.02, excitation = { type: 'force', loads: [] }, onProgress = null } = input;
  const report = (f, st) => onProgress?.(Math.min(1, Math.max(0, f)), st);
  const modal = modalStudy({ ...input, modes: Math.max(1, Math.min(20, Math.round(input.modes ?? 10))), vectors: true, onProgress: (f, st) => report(0.7 * f, st) });
  if (!modal.vectors?.length) return { ok: false, error: modal.error ?? 'no-modes' };
  const model = modal.model, nn = model.nn, m = modal.vectors.length;
  const omega = modal.frequencies.map((f) => 2 * Math.PI * f);
  const zeta = Math.min(0.5, Math.max(1e-4, Number(damping) || 0.02));
  // Modal loads per unit excitation.
  let pf;
  if (excitation.type === 'base') {
    const ax = { x: 0, y: 1, z: 2 }[excitation.axis] ?? 2;
    const a0 = Number(excitation.acceleration) || G;
    pf = modal.participation.map((g) => -g[ax] * a0);
  } else {
    const F = loadVector(model, excitation.loads ?? []);
    pf = modal.vectors.map((v) => { let s = 0; for (let d = 0; d < v.length; d++) s += v[d] * F[d]; return s; });
  }
  report(0.72, 'modes');
  // Modal stresses (6 per node per mode).
  const modeStress = modal.vectors.map((v) => elasticStresses(model, v).nodal);
  report(0.8, 'stress');
  const base = {
    ok: true, error: null, kind, model, frequencies: modal.frequencies, effectiveMass: modal.effectiveMass, damping: zeta, modes: m,
    elements: model.ne, nodeCount: nn, elementSize: model.size,
  };
  const field = (vals, d) => surfaceField(model, vals, d, 0);

  if (kind === 'random') {
    const r = input.random ?? {};
    const psd = (r.psd ?? []).map(([f, s]) => [Number(f), Number(s)]).filter(([f, s]) => f > 0 && s >= 0).sort((a, b) => a[0] - b[0]);
    if (psd.length < 2) return { ok: false, error: 'no-psd' };
    const fa = Math.max(psd[0][0], Number(r.from) || psd[0][0]), fb = Math.min(psd.at(-1)[0], Number(r.to) || psd.at(-1)[0]);
    const grid = frequencyGrid(fa, fb, r.steps ?? 200, modal.frequencies, zeta);
    // The PSD is in (acceleration)² / Hz; the modal loads above carry the acceleration amplitude a0 — normalise.
    const a0 = excitation.type === 'base' ? Number(excitation.acceleration) || G : 1;
    const C = new Float64Array(m * m);
    for (let q = 1; q < grid.length; q++) {
      const fs = [grid[q - 1], grid[q]], df = fs[1] - fs[0];
      for (const [w8, f] of [[0.5, fs[0]], [0.5, fs[1]]]) {
        const S = psdAt(psd, f) / (a0 * a0), W = 2 * Math.PI * f;
        const H = omega.map((o) => { const re = o * o - W * W, im = 2 * zeta * o * W, d = re * re + im * im; return [re / d, -im / d]; });
        for (let i = 0; i < m; i++) for (let k = i; k < m; k++) { const v = w8 * df * S * (H[i][0] * H[k][0] + H[i][1] * H[k][1]); C[i * m + k] += v; if (k !== i) C[k * m + i] += v; }
      }
    }
    // Per node: E[|u|²] and E[σ_vm²] from the modal covariance (with the modal loads).
    const P = Float64Array.from(pf);
    const uRms = new Float64Array(nn), vmRms = new Float64Array(nn);
    const si = new Float64Array(6), sk = new Float64Array(6);
    for (let n = 0; n < nn; n++) {
      let eu = 0, es = 0;
      for (let i = 0; i < m; i++) for (let k = 0; k < m; k++) {
        const c = C[i * m + k] * P[i] * P[k]; if (!c) continue;
        const vi = modal.vectors[i], vk = modal.vectors[k];
        eu += c * (vi[3 * n] * vk[3 * n] + vi[3 * n + 1] * vk[3 * n + 1] + vi[3 * n + 2] * vk[3 * n + 2]);
        for (let j = 0; j < 6; j++) { si[j] = modeStress[i][6 * n + j]; sk[j] = modeStress[k][6 * n + j]; }
        es += c * vmQuad(si, sk);
      }
      uRms[n] = Math.sqrt(Math.max(0, eu)); vmRms[n] = Math.sqrt(Math.max(0, es));
    }
    let un = 0, sn = 0, at = 0; for (let n = 0; n < nn; n++) { if (uRms[n] > un) { un = uRms[n]; at = n; } sn = Math.max(sn, vmRms[n]); }
    report(1, 'done');
    return { ...base, inputRms: psdRms(psd), maxDisplacementRms: un, maxStressRms: sn, maxAt: [model.nodes[3 * at], model.nodes[3 * at + 1], model.nodes[3 * at + 2]], nodeDisplacementRms: uRms, nodeStressRms: vmRms, vertexDisplacement: field(uRms, 1), vertexStress: field(vmRms, 1), sigma3: { displacement: 3 * un, stress: 3 * sn } };
  }

  if (kind === 'transient') {
    const tr = input.transient ?? {};
    const duration = Math.max(1e-6, Number(tr.duration) || 0.1);
    const fmax = Math.max(...modal.frequencies);
    const dt = Math.max(1e-7, Math.min(Number(tr.dt) || Infinity, 1 / (20 * Math.max(1e-9, fmax)), duration / 50));
    const steps = Math.min(200000, Math.ceil(duration / dt) + 1);
    const time = Float64Array.from({ length: steps }, (_, i) => i * dt);
    const g = Float64Array.from(time, (t) => curveAt(tr.curve, t));
    const Q = omega.map((o, i) => sdofHistory(o, zeta, Float64Array.from(g, (x) => x * pf[i]), dt));
    // The largest displacement over the model at sampled steps; the peak step refined over all of them at its node.
    const samples = Math.min(steps, 400), stride = Math.max(1, Math.floor(steps / samples));
    const uAt = (s, n) => { let x = 0, y = 0, z = 0; for (let i = 0; i < m; i++) { const q = Q[i][s], v = modal.vectors[i]; x += v[3 * n] * q; y += v[3 * n + 1] * q; z += v[3 * n + 2] * q; } return Math.hypot(x, y, z); };
    let best = 0, bs = 0, bn = 0;
    const curveT = [], curveU = [];
    for (let s = 0; s < steps; s += stride) {
      let w = 0, wn = 0; for (let n = 0; n < nn; n++) { const v = uAt(s, n); if (v > w) { w = v; wn = n; } }
      curveT.push(time[s]); curveU.push(w);
      if (w > best) { best = w; bs = s; bn = wn; }
    }
    for (let s = Math.max(0, bs - stride); s < Math.min(steps, bs + stride); s++) { const v = uAt(s, bn); if (v > best) { best = v; bs = s; } }
    const nodeHistory = Float64Array.from({ length: steps }, (_, s) => { let z = 0; for (let i = 0; i < m; i++) z += modal.vectors[i][3 * bn + 2] * Q[i][s]; return z; });
    const u = new Float64Array(3 * nn), sig = new Float64Array(6 * nn);
    for (let i = 0; i < m; i++) { const q = Q[i][bs], v = modal.vectors[i], st = modeStress[i]; for (let d = 0; d < 3 * nn; d++) u[d] += v[d] * q; for (let d = 0; d < 6 * nn; d++) sig[d] += st[d] * q; }
    const vm = new Float64Array(nn); let smax = 0; for (let n = 0; n < nn; n++) { const s6 = sig.subarray(6 * n, 6 * n + 6); vm[n] = Math.sqrt(Math.max(0, vmQuad(s6, s6))); smax = Math.max(smax, vm[n]); }
    report(1, 'done');
    return { ...base, dt, steps, peakTime: time[bs], maxDisplacement: best, maxStress: smax, history: { time: curveT, displacement: curveU }, nodeHistory: { node: bn, time: Array.from(time), uz: Array.from(nodeHistory) }, displacement: u, nodeStress: vm, vertexDisplacement: field(u, 3), vertexStress: field(vm, 1) };
  }

  // Harmonic.
  const h = input.harmonic ?? {};
  const fa = Math.max(1e-3, Number(h.from) || 0.5 * Math.min(...modal.frequencies)), fb = Math.max(fa * 1.0001, Number(h.to) || 1.5 * Math.max(...modal.frequencies));
  const grid = frequencyGrid(fa, fb, h.steps ?? 120, modal.frequencies, zeta);
  const curveU = [], curveS = [];
  const re = new Float64Array(m), im = new Float64Array(m);
  let peakF = grid[0], peakU = -1;
  for (const f of grid) {
    const W = 2 * Math.PI * f;
    for (let i = 0; i < m; i++) { const a = omega[i] ** 2 - W * W, b = 2 * zeta * omega[i] * W, d = a * a + b * b; re[i] = (pf[i] * a) / d; im[i] = (-pf[i] * b) / d; }
    let wu = 0, ws = 0;
    for (let n = 0; n < nn; n++) {
      let u2 = 0;
      for (let k = 0; k < 3; k++) { let r = 0, s = 0; for (let i = 0; i < m; i++) { const v = modal.vectors[i][3 * n + k]; r += v * re[i]; s += v * im[i]; } u2 += r * r + s * s; }
      wu = Math.max(wu, u2);
      // von Mises of the component amplitudes (an upper estimate between phases; the fields below take the true max).
      const sr = new Float64Array(6), sim = new Float64Array(6);
      for (let i = 0; i < m; i++) for (let j = 0; j < 6; j++) { const st = modeStress[i][6 * n + j]; sr[j] += st * re[i]; sim[j] += st * im[i]; }
      ws = Math.max(ws, Math.sqrt(Math.max(0, vmQuad(sr, sr) + vmQuad(sim, sim))));
    }
    curveU.push(Math.sqrt(wu)); curveS.push(ws);
    if (Math.sqrt(wu) > peakU) { peakU = Math.sqrt(wu); peakF = f; }
  }
  const at = Number(h.at) > 0 ? Number(h.at) : peakF;
  // Fields at the chosen frequency: displacement amplitude, and the von Mises stress the largest over one period.
  const W = 2 * Math.PI * at;
  for (let i = 0; i < m; i++) { const a = omega[i] ** 2 - W * W, b = 2 * zeta * omega[i] * W, d = a * a + b * b; re[i] = (pf[i] * a) / d; im[i] = (-pf[i] * b) / d; }
  const u = new Float64Array(3 * nn), vm = new Float64Array(nn);
  for (let n = 0; n < nn; n++) {
    let u2 = 0;
    for (let k = 0; k < 3; k++) { let r = 0, s = 0; for (let i = 0; i < m; i++) { const v = modal.vectors[i][3 * n + k]; r += v * re[i]; s += v * im[i]; } u[3 * n + k] = Math.hypot(r, s); u2 += r * r + s * s; }
    const sr = new Float64Array(6), si = new Float64Array(6);
    for (let i = 0; i < m; i++) for (let j = 0; j < 6; j++) { const st = modeStress[i][6 * n + j]; sr[j] += st * re[i]; si[j] += st * im[i]; }
    let best = 0;
    for (let ph = 0; ph < 24; ph++) { const t = (Math.PI * ph) / 24, c = Math.cos(t), s = Math.sin(t); const x = sr.map((v, j) => v * c - si[j] * s); best = Math.max(best, vmQuad(x, x)); }
    vm[n] = Math.sqrt(Math.max(0, best));
  }
  let smax = 0; for (let n = 0; n < nn; n++) smax = Math.max(smax, vm[n]);
  report(1, 'done');
  return { ...base, curve: { frequency: grid, displacement: curveU, stress: curveS }, peakFrequency: peakF, at, maxDisplacement: peakU, maxStress: smax, displacement: u, nodeStress: vm, vertexDisplacement: field(u, 3), vertexStress: field(vm, 1) };
}
