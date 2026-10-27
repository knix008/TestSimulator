// Time and frequency responses and their characteristics (internal models).
import * as K from '../_kernels.js';
import { E } from '../_util.js';
import {
  toSS, toTF, explicitSS, expm, freqResp, evalAt, poles, tzeros, ratioAt, trimLead, isZeroPoly, hasDelay, totalDelay, zerosM, blockM, eye, cabs,
} from './lti.js';
import { feedback, identity } from './ops.js';

// ------------------------------------------------------------ discretization for simulation
/** {Phi, G1, G2} for step dt: x[k+1] = Phi x + G1 u[k] (+ G2 (u[k+1]-u[k]) for foh). */
export function discretize(s, dt, foh = false) {
  const n = s.n, nu = s.nu;
  if (s.Ts !== 0) return { Phi: s.A, G1: s.B, G2: zerosM(n, nu) };
  if (!foh) {
    const M = zerosM(n + nu, n + nu);
    for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] = s.A[i][j] * dt; for (let j = 0; j < nu; j++) M[i][n + j] = s.B[i][j] * dt; }
    const X = expm(M);
    return { Phi: X.slice(0, n).map((r) => r.slice(0, n)), G1: X.slice(0, n).map((r) => r.slice(n, n + nu)), G2: zerosM(n, nu) };
  }
  const N = n + 2 * nu; const M = zerosM(N, N);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] = s.A[i][j] * dt; for (let j = 0; j < nu; j++) M[i][n + j] = s.B[i][j] * dt; }
  for (let j = 0; j < nu; j++) M[n + j][n + nu + j] = 1;
  const X = expm(M);
  return { Phi: X.slice(0, n).map((r) => r.slice(0, n)), G1: X.slice(0, n).map((r) => r.slice(n, n + nu)), G2: X.slice(0, n).map((r) => r.slice(n + nu, n + 2 * nu)) };
}
/** Simulates x[k+1] from inputs U (nt rows × nu). Returns {Y (nt×ny), X (nt×n)}. */
export function simulate(s, U, dt, x0, method = 'zoh', ctx = null) {
  const n = s.n, ny = s.ny, nu = s.nu, nt = U.length;
  const { Phi, G1, G2 } = discretize(s, dt, method === 'foh' && s.Ts === 0);
  let x = x0 ? x0.slice() : new Array(n).fill(0);
  const Y = [], X = [];
  for (let k = 0; k < nt; k++) {
    if (ctx && (k & 1023) === 1023) ctx.checkInterrupt();
    const u = U[k];
    const y = new Array(ny).fill(0);
    for (let i = 0; i < ny; i++) { let v = 0; for (let q = 0; q < n; q++) v += s.C[i][q] * x[q]; for (let j = 0; j < nu; j++) v += s.D[i][j] * u[j]; y[i] = v; }
    Y.push(y); X.push(x.slice());
    if (k === nt - 1) break;
    const un = U[k + 1]; const xn = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let v = 0; for (let q = 0; q < n; q++) v += Phi[i][q] * x[q];
      for (let j = 0; j < nu; j++) v += G1[i][j] * u[j] + (method === 'foh' ? G2[i][j] * (un[j] - u[j]) : 0);
      xn[i] = v;
    }
    x = xn;
  }
  return { Y, X };
}

// ------------------------------------------------------------ time grids
function niceCeil(x) { if (!(x > 0) || !Number.isFinite(x)) return 10; const e = 10 ** Math.floor(Math.log10(x)); const f = x / e; const c = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10].find((v) => v >= f - 1e-12) || 10; return c * e; }
/** Final time and step for step/impulse responses. */
export function autoTime(m, kind = 'step') {
  const s = explicitSS(toSS(m)); const p = poles(s); const Ts = m.Ts;
  let sigMin = Infinity, unstable = 0, wosc = Infinity, fast = 0, integ = false;
  for (let k = 0; k < p.re.length; k++) {
    let re = p.re[k], im = p.im[k];
    if (Ts !== 0) { const T = Ts > 0 ? Ts : 1; const r = Math.hypot(re, im); if (r === 0) { fast = Math.max(fast, 1 / T); continue; } const a = Math.atan2(im, re); re = Math.log(r) / T; im = a / T; }
    const mag = Math.hypot(re, im); fast = Math.max(fast, mag);
    if (mag < 1e-10) { integ = true; continue; }
    if (re > 1e-9 * mag) unstable = Math.max(unstable, re);
    else if (re < -1e-9 * mag) sigMin = Math.min(sigMin, -re);
    else wosc = Math.min(wosc, Math.abs(im));
  }
  let tf = Number.isFinite(sigMin) ? 7 / sigMin : 0;
  if (Number.isFinite(wosc)) tf = Math.max(tf, 10 * 2 * Math.PI / wosc);
  if (unstable) tf = tf ? Math.min(tf, Math.max(5 / unstable, 1e-3)) : 5 / unstable;
  if (integ && !tf) tf = 10;
  if (!tf) tf = 1;
  tf = niceCeil(tf);
  if (Ts !== 0) { const T = Ts > 0 ? Ts : 1; let nk = Math.ceil(tf / T); nk = Math.max(nk, 10); nk = Math.min(nk, 2000); return { tf: nk * T, dt: T }; }
  let dt = tf / 500;
  if (fast > 0) dt = Math.min(dt, 2 * Math.PI / fast / 25);
  dt = Math.max(dt, tf / 20000);
  const npts = Math.ceil(tf / dt);
  return { tf, dt: tf / npts };
}
export function timeGrid(m, tspec, kind) {
  // tspec: undefined | number (final time) | array (time vector)
  if (Array.isArray(tspec) && tspec.length > 1) {
    const dt = tspec[1] - tspec[0];
    for (let k = 2; k < tspec.length; k++) if (Math.abs(tspec[k] - tspec[k - 1] - dt) > 1e-6 * Math.max(Math.abs(dt), 1e-12) * Math.max(1, k)) throw E('lsim:nonUniform', 'The time vector must be uniformly spaced.');
    if (m.Ts > 0 && Math.abs(dt - m.Ts) > 1e-9 * m.Ts) throw E('step:badTs', 'For discrete-time models, the time step must equal the sample time.');
    return { t: tspec.slice(), dt };
  }
  let tf, dt;
  if (typeof tspec === 'number') { tf = tspec; const a = autoTime(m, kind); dt = m.Ts !== 0 ? a.dt : Math.min(a.dt, tf / 200); if (m.Ts === 0) { const n = Math.ceil(tf / dt); dt = tf / n; } }
  else ({ tf, dt } = autoTime(m, kind));
  const n = Math.round(tf / dt);
  const t = Array.from({ length: n + 1 }, (_, k) => k * dt);
  return { t, dt };
}
/** Shifts a sampled signal by tau (zero before), linear interpolation. */
function shift(y, dt, tau) {
  if (!tau) return y;
  const out = new Array(y.length).fill(0); const s = tau / dt; const k0 = Math.floor(s), fr = s - k0;
  for (let k = 0; k < y.length; k++) { const a = k - k0; if (a < 0) continue; const ya = y[a], yb = a - 1 >= 0 ? y[a - 1] : 0; out[k] = fr ? (1 - fr) * ya + fr * yb : ya; }
  return out;
}

// ------------------------------------------------------------ step / impulse / initial / lsim
/** Response to each input channel: returns {t, Y[j] (nt×ny), X[j] (nt×n)} for kind 'step'|'impulse'. */
export function stdResponse(m, tspec, kind, amp = 1, ctx = null) {
  const s = explicitSS(toSS(m)); const { t, dt } = timeGrid(m, tspec, kind); const nt = t.length;
  const Ys = [], Xs = [];
  for (let j = 0; j < s.nu; j++) {
    let r;
    if (kind === 'step') { const U = t.map(() => { const u = new Array(s.nu).fill(0); u[j] = amp; return u; }); r = simulate(s, U, dt, null, 'zoh', ctx); }
    else {
      // impulse: continuous → x(0+) = B e_j, D ignored; discrete → pulse of height 1/Ts
      const U = t.map(() => new Array(s.nu).fill(0));
      if (s.Ts === 0) { const x0 = s.B.map((row) => row[j] * amp); r = simulate({ ...s, D: s.D.map((row) => row.map(() => 0)) }, U, dt, x0, 'zoh', ctx); }
      else { const T = s.Ts > 0 ? s.Ts : 1; U[0][j] = amp / T; r = simulate(s, U, dt, null, 'zoh', ctx); }
    }
    // delays per output
    if (hasDelay(m)) for (let i = 0; i < s.ny; i++) { const col = shift(r.Y.map((y) => y[i]), dt, totalDelay(m, i, j)); col.forEach((v, k) => { r.Y[k][i] = v; }); }
    Ys.push(r.Y); Xs.push(r.X);
  }
  return { t: t.map((x) => x + (Array.isArray(tspec) ? 0 : 0)), Y: Ys, X: Xs, nt, ny: s.ny, nx: s.n };
}
export function initialResponse(m, x0, tspec, ctx) {
  const s = explicitSS(toSS(m)); if (x0.length !== s.n) throw E('initial:badX0', `The initial state must have ${s.n} elements.`);
  const { t, dt } = timeGrid(m, tspec, 'initial');
  const U = t.map(() => new Array(s.nu).fill(0));
  const r = simulate(s, U, dt, x0, 'zoh', ctx);
  return { t, Y: r.Y, X: r.X };
}
export function lsimResponse(m, U, t, x0, method, ctx) {
  const s = explicitSS(toSS(m));
  if (U.length !== t.length) throw E('lsim:badU', 'The input signal must have one row per time sample.');
  if (U.length && U[0].length !== s.nu) throw E('lsim:badU', `The input signal must have ${s.nu} column(s).`);
  let dt = t.length > 1 ? t[1] - t[0] : (s.Ts > 0 ? s.Ts : 1);
  if (t.length > 2) for (let k = 2; k < t.length; k++) if (Math.abs(t[k] - t[k - 1] - dt) > 1e-6 * Math.abs(dt) * Math.max(1, k)) throw E('lsim:nonUniform', 'The time vector must be uniformly spaced.');
  if (s.Ts > 0 && t.length > 1 && Math.abs(dt - s.Ts) > 1e-9 * s.Ts) throw E('lsim:badTs', 'For discrete-time models, the time step must equal the sample time.');
  if (!hasDelay(m)) return simulate(s, U, dt, x0, method, ctx);
  // superposition per input with delays
  const Y = t.map(() => new Array(s.ny).fill(0)); let X = null;
  for (let j = 0; j < s.nu; j++) {
    const Uj = U.map((u) => u.map((x, q) => (q === j ? x : 0)));
    const r = simulate(s, Uj, dt, j === 0 ? x0 : null, method, ctx); if (!X) X = r.X;
    for (let i = 0; i < s.ny; i++) { const col = shift(r.Y.map((y) => y[i]), dt, totalDelay(m, i, j)); col.forEach((v, k) => { Y[k][i] += v; }); }
  }
  return { Y, X };
}

// ------------------------------------------------------------ dc gain / stability
export function dcgain(m) {
  const x = m.Ts === 0 ? 0 : 1;
  if (m.type === 'frd') throw E('dcgain:frd', 'dcgain is not defined for FRD models.');
  if (m.type === 'ss') {
    const s = explicitSS(m);
    if (!s.n) return s.D.map((r) => r.slice());
    const M = s.Ts === 0 ? s.A.map((r) => r.map((v) => -v)) : s.A.map((r, i) => r.map((v, j) => (i === j ? 1 : 0) - v));
    const F = K.lu(M);
    let ok = !F.singular; if (ok) { let mn = Infinity, mx = 0; for (let i = 0; i < s.n; i++) { const a = Math.abs(F.LU[i][i]); mn = Math.min(mn, a); mx = Math.max(mx, a); } if (mn <= 1e-13 * mx) ok = false; }
    if (ok) { const X = K.T(K.T(s.B).map((c) => K.luSolve(F, c))); return s.D.map((r, i) => r.map((d, j) => { let v = d; for (let q = 0; q < s.n; q++) v += s.C[i][q] * X[q][j]; return v; })); }
  }
  const t = toTF(m);
  const zinv = t.meta.Variable === 'z^-1' || t.meta.Variable === 'q^-1';
  return t.num.map((r, i) => r.map((n, j) => { if (isZeroPoly(n)) return 0; if (zinv) { const L = Math.max(n.length, t.den[i][j].length); const pr = (p) => { const q = p.slice(); while (q.length < L) q.push(0); return q; }; return ratioAt(pr(n), pr(t.den[i][j]), x); } return ratioAt(n, t.den[i][j], x); }));
}
export function isStable(m) {
  if (m.type === 'frd') throw E('isstable:frd', 'isstable is not defined for FRD models.');
  let p;
  if (m.type === 'ss') p = poles(m);
  else { const t = m.type === 'zpk' ? null : toTF(m); const re = [], im = []; for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) { const r = m.type === 'zpk' ? m.p[i][j] : (isZeroPoly(t.num[i][j]) ? { re: [], im: [] } : K.roots(trimLead(t.den[i][j]))); re.push(...r.re); im.push(...r.im); } p = { re, im }; }
  for (let k = 0; k < p.re.length; k++) {
    if (m.Ts === 0) { if (!(p.re[k] < 0)) return false; }
    else if (!(Math.hypot(p.re[k], p.im[k]) < 1)) return false;
  }
  return true;
}

// ------------------------------------------------------------ frequency grids
export function autoFreq(m, npd = 50) {
  if (m.type === 'frd') return m.freq.slice();
  const Ts = m.Ts; const br = [];
  const add = (re, im) => { let w; if (Ts !== 0) { const T = Ts > 0 ? Ts : 1; const r = Math.hypot(re, im); if (r === 0) return; w = Math.hypot(Math.log(r), Math.atan2(im, re)) / T; } else w = Math.hypot(re, im); if (w > 1e-12 && Number.isFinite(w)) br.push(w); };
  const p = poles(m); p.re.forEach((r, k) => add(r, p.im[k]));
  if (m.ny * m.nu === 1 || m.ny === m.nu) { try { const z = tzeros(m); z.re.forEach((r, k) => add(r, z.im[k])); } catch { /* ignore */ } }
  if (hasDelay(m) && Ts === 0) { let mx = 0; for (let i = 0; i < m.ny; i++) for (let j = 0; j < m.nu; j++) mx = Math.max(mx, totalDelay(m, i, j)); if (mx) br.push(1 / mx, 10 / mx); }
  let lo, hi;
  if (!br.length) { lo = -1; hi = 1; } else { lo = Math.floor(Math.log10(Math.min(...br))) - 1; hi = Math.ceil(Math.log10(Math.max(...br))) + 1; }
  if (Ts !== 0) { const T = Ts > 0 ? Ts : 1; const ny = Math.PI / T; hi = Math.log10(ny); if (lo >= hi - 1) lo = hi - 3; }
  const n = Math.max(100, Math.round((hi - lo) * npd));
  const w = Array.from({ length: n }, (_, k) => 10 ** (lo + (hi - lo) * k / (n - 1)));
  if (Ts !== 0) w[n - 1] = Math.PI / (Ts > 0 ? Ts : 1);
  return w;
}
export function freqArg(m, spec) {
  if (spec == null) return autoFreq(m);
  if (spec.range) { const [a, b] = spec.range; const n = 200; const lo = Math.log10(a), hi = Math.log10(b); return Array.from({ length: n }, (_, k) => 10 ** (lo + (hi - lo) * k / (n - 1))); }
  return spec;
}
/** Unwrapped phase (degrees) of a complex sequence, aligned to the low-frequency asymptote for continuous SISO models. */
export function phaseDeg(re, im, m, i, j) {
  const n = re.length; const ph = new Array(n);
  for (let k = 0; k < n; k++) ph[k] = Math.atan2(im[k], re[k]) * 180 / Math.PI;
  for (let k = 1; k < n; k++) { let d = ph[k] - ph[k - 1]; d -= 360 * Math.round(d / 360); ph[k] = ph[k - 1] + d; }
  if (n && m && m.type !== 'frd') {
    let expect = null;
    try {
      if (m.Ts === 0) {
        const t = toTF(m); const nn = trimLead(t.num[i][j]), dd = trimLead(t.den[i][j]);
        let a = nn.slice(), b = dd.slice(), za = 0, pb = 0;
        while (a.length > 1 && a[a.length - 1] === 0) { a.pop(); za++; } while (b.length > 1 && b[b.length - 1] === 0) { b.pop(); pb++; }
        const g = a[a.length - 1] / b[b.length - 1];
        expect = (za - pb) * 90 + (g < 0 ? -180 : 0);
      } else {
        const g = dcgain(m)[i][j];
        if (Number.isFinite(g) && g !== 0) expect = g < 0 ? -180 : 0;
      }
    } catch { expect = null; }
    if (expect != null) { const sh = 360 * Math.round((expect - ph[0]) / 360); if (sh) for (let k = 0; k < n; k++) ph[k] += sh; }
  }
  return ph;
}

// ------------------------------------------------------------ margins
function sisoEval(m, w) { const H = freqResp(m, [w]); return [H[0][0].re[0], H[0][0].im[0]]; }
function bisect(f, a, b, it = 80) { let fa = f(a); for (let k = 0; k < it; k++) { const c = Math.sqrt(a * b) || (a + b) / 2; const fc = f(c); if (fc === 0) return c; if ((fc > 0) === (fa > 0)) { a = c; fa = fc; } else b = c; if (Math.abs(b - a) <= 1e-14 * b) break; } return Math.sqrt(a * b) || (a + b) / 2; }
export function allMargins(m) {
  if (m.ny * m.nu !== 1) throw E('margin:mimo', 'margin requires a SISO model.');
  let w;
  if (m.type === 'frd') w = m.freq.slice();
  else {
    const base = autoFreq(m, 400);
    const lo = Math.log10(base[0]) - 2, hi = m.Ts !== 0 ? Math.log10(base[base.length - 1]) : Math.log10(base[base.length - 1]) + 2;
    const n = Math.max(2000, Math.round((hi - lo) * 400));
    w = Array.from({ length: n }, (_, k) => 10 ** (lo + (hi - lo) * k / (n - 1)));
    if (m.Ts !== 0) w[n - 1] = Math.PI / (m.Ts > 0 ? m.Ts : 1);
  }
  const H = freqResp(m, w)[0][0]; const mag = Array.from(H.re, (r, k) => Math.hypot(r, H.im[k]));
  const ph = phaseDeg(H.re, H.im, m, 0, 0);
  const gm = [], gmf = [], pm = [], pmf = [];
  const refine = m.type !== 'frd';
  for (let k = 0; k + 1 < w.length; k++) {
    // gain crossover
    const a = mag[k] - 1, b = mag[k + 1] - 1;
    if (a === 0 || (a > 0) !== (b > 0)) {
      let wc = a === 0 ? w[k] : refine ? bisect((x) => Math.hypot(...sisoEval(m, x)) - 1, w[k], w[k + 1]) : w[k] + (w[k + 1] - w[k]) * a / (a - b);
      const phc = refine ? ph[k] + angDiff(sisoEval(m, wc), [H.re[k], H.im[k]]) : ph[k] + (ph[k + 1] - ph[k]) * (wc - w[k]) / (w[k + 1] - w[k]);
      let P = phc + 180; P -= 360 * Math.floor((P + 180) / 360); if (P <= -180) P += 360;
      if (!pmf.some((x) => Math.abs(x - wc) <= 1e-9 * wc)) { pm.push(P); pmf.push(wc); }
    }
    // phase crossover of -180 + 360 k
    const ka = Math.floor((ph[k] + 180) / 360), kb = Math.floor((ph[k + 1] + 180) / 360);
    if (ka !== kb) {
      const target = 360 * Math.max(ka, kb) - 180;
      let wc;
      if (refine) { const ref = [H.re[k], H.im[k]]; wc = bisect((x) => ph[k] + angDiff(sisoEval(m, x), ref) - target, w[k], w[k + 1]); }
      else wc = w[k] + (w[k + 1] - w[k]) * (target - ph[k]) / (ph[k + 1] - ph[k]);
      const g = refine ? 1 / Math.hypot(...sisoEval(m, wc)) : 1 / (mag[k] + (mag[k + 1] - mag[k]) * (wc - w[k]) / (w[k + 1] - w[k]));
      if (!gmf.some((x) => Math.abs(x - wc) <= 1e-9 * wc)) { gm.push(g); gmf.push(wc); }
    }
  }
  // zero frequency phase at -180 (e.g. negative dc gain)
  const dm = pm.map((P, k) => { let r = P * Math.PI / 180; if (r < 0) r += 2 * Math.PI; const d = r / pmf[k]; return m.Ts !== 0 ? d / (m.Ts > 0 ? m.Ts : 1) : d; });
  let stable = null;
  if (m.type !== 'frd') { try { stable = isStable(feedback(m, identity(1, m.Ts, 'tf'))); } catch { stable = null; } }
  return { gm, gmf, pm, pmf, dm, dmf: pmf.slice(), stable };
}
function angDiff([r1, i1], [r0, i0]) { const [a, b] = [r1 * r0 + i1 * i0, i1 * r0 - r1 * i0]; return Math.atan2(b, a) * 180 / Math.PI; }
export function margin(m) {
  const a = allMargins(m);
  let Gm = Infinity, Wcg = NaN, Pm = Infinity, Wcp = NaN;
  if (a.gm.length) { let best = 0; for (let k = 1; k < a.gm.length; k++) if (Math.abs(Math.log(a.gm[k])) < Math.abs(Math.log(a.gm[best]))) best = k; Gm = a.gm[best]; Wcg = a.gmf[best]; }
  if (a.pm.length) { let best = 0; for (let k = 1; k < a.pm.length; k++) if (Math.abs(a.pm[k]) < Math.abs(a.pm[best])) best = k; Pm = a.pm[best]; Wcp = a.pmf[best]; }
  return { Gm, Pm, Wcg, Wcp };
}
export function bandwidth(m, dbdrop = -3) {
  if (m.ny * m.nu !== 1) throw E('bandwidth:mimo', 'bandwidth requires a SISO model.');
  const dc = Math.abs(dcgain(m)[0][0]);
  if (!Number.isFinite(dc)) return Infinity;
  const target = dc * 10 ** (dbdrop / 20);
  const w = autoFreq(m, 200); const lo = Math.log10(w[0]) - 3;
  const ww = [...Array.from({ length: 300 }, (_, k) => 10 ** (lo + (Math.log10(w[0]) - lo) * k / 300)), ...w];
  const H = freqResp(m, ww)[0][0];
  for (let k = 0; k < ww.length; k++) {
    const g = Math.hypot(H.re[k], H.im[k]);
    if (g < target) { if (k === 0) return ww[0]; return bisect((x) => Math.hypot(...sisoEval(m, x)) - target, ww[k - 1], ww[k]); }
  }
  return Infinity;
}

// ------------------------------------------------------------ damping / root locus
export function dampData(m) {
  const p = poles(m); const T = m.Ts > 0 ? m.Ts : (m.Ts === -1 ? 1 : 0);
  const rows = p.re.map((re, k) => {
    const im = p.im[k];
    let sr = re, si = im;
    if (m.Ts !== 0) { const r = Math.hypot(re, im); sr = Math.log(r) / T; si = Math.atan2(im, re) / T; }
    const wn = Math.hypot(sr, si); const z = wn === 0 ? -1 : -sr / wn;
    return { re, im, wn, z, tau: sr === 0 ? Infinity : -1 / sr };
  });
  rows.sort((a, b) => a.wn - b.wn || a.im - b.im);
  return rows;
}
export function rlocusData(m, gains) {
  if (m.ny * m.nu !== 1) throw E('rlocus:mimo', 'rlocus requires a SISO model.');
  const t = toTF(m); const n = trimLead(t.num[0][0]), d = trimLead(t.den[0][0]);
  if (!gains) {
    const k0 = Math.abs(d[0] / (n[0] || 1)) || 1;
    const ks = [0]; const lo = Math.log10(k0) - 3, hi = Math.log10(k0) + 3;
    for (let q = 0; q <= 200; q++) ks.push(10 ** (lo + (hi - lo) * q / 200));
    gains = ks;
  }
  const L = Math.max(n.length, d.length); const np = d.length - 1;
  const cols = [];
  let prev = null;
  for (const k of gains) {
    const p = d.map((x, i) => x + k * ((n[i - (d.length - n.length)]) || 0));
    const pp = n.length > d.length ? K.conv([1], n).map((x, i) => x * k + (d[i - (n.length - d.length)] || 0)) : p;
    let r = K.roots(trimLead(pp)); let pts = r.re.map((x, i) => [x, r.im[i]]);
    while (pts.length < np) pts.push([Infinity, 0]);
    pts = pts.slice(0, Math.max(np, pts.length));
    if (prev) {
      // nearest-neighbour matching to keep branches continuous
      const out = new Array(prev.length); const used = new Array(pts.length).fill(false);
      for (let a = 0; a < prev.length; a++) { let best = -1, bd = Infinity; for (let b = 0; b < pts.length; b++) if (!used[b]) { const dd = Math.hypot(pts[b][0] - prev[a][0], pts[b][1] - prev[a][1]); const v = Number.isFinite(dd) ? dd : 1e300; if (v < bd) { bd = v; best = b; } } used[best] = true; out[a] = pts[best]; }
      pts = out;
    }
    cols.push(pts); prev = pts;
  }
  return { r: cols, k: gains };
}
export { evalAt, freqResp, poles, tzeros };
