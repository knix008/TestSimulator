// Reliability estimates from simulated temperatures (the Sherlock-style
// post-processing) and the U-factor of an envelope section (THERM-style).
// Pure functions, unit-tested in Node.

export const BOLTZMANN_EV = 8.617333262e-5; // eV/K
const K = 273.15;

/**
 * Arrhenius acceleration factor between the use temperature and the rated (reference)
 * temperature: AF = exp(Ea/k · (1/T_ref − 1/T_use)). AF > 1 when the part runs hotter.
 */
export function arrheniusFactor(Ea, TuseC, TrefC) {
  return Math.exp((Ea / BOLTZMANN_EV) * (1 / (TrefC + K) - 1 / (TuseC + K)));
}

/** Coffin–Manson cycles to failure N = C · ΔT^(−n). */
export function coffinManson(dT, C = 1e6, n = 2.0) {
  if (!(dT > 0)) return Infinity;
  return C * dT ** -n;
}

/**
 * One component: { body, Ea, Tref, mttfRef (h), cycles (per year), dTcycle (K, or null = from
 * the transient swing / junction rise), cm: { C, n } } with its simulated temperatures
 * { max, min, avg }. Returns the life figures.
 */
export function componentLife(component, temps, ambient = 25) {
  const Ea = component.Ea ?? 0.7;
  const Tref = component.Tref ?? 55;
  const mttfRef = component.mttfRef ?? 1e6;
  const Tuse = temps.max;
  const af = arrheniusFactor(Ea, Tuse, Tref);
  const mttf = mttfRef / af; // hours
  const fit = 1e9 / mttf; // failures per 10⁹ h
  // Thermal cycle: the given swing, else the transient swing of the body, else its rise over ambient
  // (power on / power off every cycle).
  const swing = component.dTcycle ?? (temps.swing > 0 ? temps.swing : Math.max(0, Tuse - ambient));
  const cyclesToFailure = coffinManson(swing, component.cm?.C ?? 1e6, component.cm?.n ?? 2.0);
  const cyclesPerYear = component.cycles ?? 3650;
  const fatigueYears = cyclesToFailure / Math.max(1e-9, cyclesPerYear);
  const arrheniusYears = mttf / 8766;
  return { Tuse, af, mttf, fit, swing, cyclesToFailure, fatigueYears, arrheniusYears, lifeYears: Math.min(fatigueYears, arrheniusYears) };
}

/** Series system: failure rates add. */
export function systemLife(lives) {
  const fit = lives.reduce((sum, life) => sum + (Number.isFinite(life.fit) ? life.fit : 0), 0);
  const mttf = fit > 0 ? 1e9 / fit : Infinity;
  return { fit, mttf, years: mttf / 8766, minLifeYears: Math.min(...lives.map((l) => l.lifeYears), Infinity) };
}

/** Probability of surviving `hours` with a constant failure rate (exponential model). */
export function survival(mttf, hours) {
  return Number.isFinite(mttf) && mttf > 0 ? Math.exp(-hours / mttf) : 1;
}

/**
 * U-factor (W/m²K) of a section from the heat through a boundary and the two film temperatures:
 * U = |Q| / (A · |T_warm − T_cold|). `heat` W and `area` m² come from the result header.
 */
export function uFactor(heat, area, Twarm, Tcold) {
  const dT = Math.abs(Twarm - Tcold);
  if (!(area > 0) || !(dT > 0)) return NaN;
  return Math.abs(heat) / (area * dT);
}

/**
 * U, R = 1/U (m²K/W) and the thermal coupling coefficient L2D of a 2D section (W/mK): the heat per
 * metre of section depth and per kelvin, the figure ISO 10077-2 / THERM report for frames.
 */
export function sectionFigures(heat, area, depthM, Twarm, Tcold) {
  const U = uFactor(heat, area, Twarm, Tcold);
  const dT = Math.abs(Twarm - Tcold);
  return { U, R: 1 / U, L2D: depthM > 0 && dT > 0 ? Math.abs(heat) / (depthM * dT) : NaN };
}

// ───────────────────────── fatigue (rainflow, Miner, Norris–Landzberg, Engelmaier), vibration (Steinberg), Weibull

/**
 * Rainflow counting (ASTM E1049, four-point method): the series is reduced to its reversals, inner ranges that do not
 * exceed both neighbouring ranges are counted as full cycles, the residue as half cycles.
 * Returns [{ range, mean, count (1 or 0.5) }] in the units of the series.
 */
export function rainflow(series) {
  const values = Array.from(series).filter(Number.isFinite);
  const turns = [];
  for (const v of values) {
    const n = turns.length;
    if (n && v === turns[n - 1]) continue;
    if (n >= 2 && (turns[n - 1] - turns[n - 2]) * (v - turns[n - 1]) > 0) turns[n - 1] = v; // still rising / falling
    else turns.push(v);
  }
  const out = [];
  const stack = [];
  for (const v of turns) {
    stack.push(v);
    while (stack.length >= 4) {
      const n = stack.length;
      const [a, b, c, d] = stack.slice(n - 4);
      const inner = Math.abs(c - b);
      if (inner <= Math.abs(b - a) && inner <= Math.abs(d - c)) {
        out.push({ range: inner, mean: (b + c) / 2, count: 1 });
        stack.splice(n - 3, 2);
      } else break;
    }
  }
  for (let i = 1; i < stack.length; i++) out.push({ range: Math.abs(stack[i] - stack[i - 1]), mean: (stack[i] + stack[i - 1]) / 2, count: 0.5 });
  return out;
}

/** Palmgren–Miner damage D = Σ count / Nf(range, mean); failure is expected at D ≥ 1. */
export function miner(cycles, NfOf) {
  let damage = 0;
  for (const c of cycles) {
    const Nf = NfOf(c.range, c.mean);
    if (Nf > 0 && Number.isFinite(Nf)) damage += c.count / Nf;
  }
  return damage;
}

/**
 * Norris–Landzberg acceleration factor of a thermal-cycling test over field use (solder joints):
 * AF = (ΔT_test/ΔT_field)^n · (f_field/f_test)^m · exp(Ea/k · (1/Tmax_field − 1/Tmax_test)), f in cycles/day, T in °C.
 * Field cycles to failure = AF × test cycles to failure.
 */
export function norrisLandzberg({ dTtest, dTfield, fTest, fField, TmaxTest, TmaxField }, { n = 1.9, m = 1 / 3, Ea = 0.122 } = {}) {
  return (dTtest / dTfield) ** n * (fField / fTest) ** m * Math.exp((Ea / BOLTZMANN_EV) * (1 / (TmaxField + K) - 1 / (TmaxTest + K)));
}

/**
 * Engelmaier solder-joint fatigue (leadless / BGA form, IPC-SM-785): cyclic shear strain Δγ = F·LD·Δα·ΔT / h
 * (LD distance to the neutral point and h solder height in mm, Δα 1/K, ΔT K), fatigue exponent
 * c = −0.442 − 6·10⁻⁴·Tsj + 1.74·10⁻²·ln(1 + 360/td) (Tsj mean joint °C, td dwell minutes),
 * median cycles to failure Nf50 = ½·(Δγ / (2·εf))^(1/c). Returns { Nf50, c, strainRange }.
 */
export function engelmaier({ LD, dAlpha, dT, h, Tmean = 25, dwellMin = 15, ef = 0.325, F = 1 }) {
  const strainRange = (F * LD * Math.abs(dAlpha) * Math.abs(dT)) / h;
  const c = -0.442 - 6e-4 * Tmean + 1.74e-2 * Math.log(1 + 360 / Math.max(1e-9, dwellMin));
  const Nf50 = strainRange > 0 ? 0.5 * (strainRange / (2 * ef)) ** (1 / c) : Infinity;
  return { Nf50, c, strainRange };
}

/**
 * Steinberg's random-vibration check of a component on a circuit board. B board edge parallel to the component, L component
 * length, h board thickness (mm); r position factor (1 at the board centre), c component constant (1 for a DIP … 2.25 leadless).
 * Allowable 3σ board displacement for 20·10⁶ cycles Z_allow = 0.00022·B/(c·h·r·√L) (inches). Response: G_rms given as `gLevel`,
 * or by Miles from an input `psd` (g²/Hz at fn; Q = √fn unless given); `bandwidth` (Hz) with `psd` also reports the input
 * G_rms = √(psd·bandwidth). Z_1σ = 9.8·G_rms/fn² (inches), Z_resp = 3·Z_1σ. Nf = 20·10⁶·(Z_allow/Z_resp)^6.4 cycles.
 * Returns { Zallow, Zresp, Zresp1sigma (mm), Grms, GrmsInput, Q, ratio, Nf, hours (Nf / fn) }.
 */
export function steinberg({ fn, gLevel = null, psd = null, bandwidth = null, B, L, h, r = 1, c = 1, Q = null }) {
  const inch = 25.4;
  const q = Q ?? Math.sqrt(fn);
  const Grms = gLevel ?? Math.sqrt((Math.PI / 2) * fn * q * (psd ?? 0));
  const ZallowIn = (0.00022 * (B / inch)) / (c * (h / inch) * r * Math.sqrt(L / inch));
  const z1In = (9.8 * Grms) / (fn * fn);
  const Zresp = 3 * z1In * inch;
  const Zallow = ZallowIn * inch;
  const ratio = Zresp > 0 ? Zallow / Zresp : Infinity;
  const Nf = 20e6 * ratio ** 6.4;
  return { Zallow, Zresp, Zresp1sigma: z1In * inch, Grms, GrmsInput: psd != null && bandwidth != null ? Math.sqrt(psd * bandwidth) : null, Q: q, ratio, Nf, hours: Nf / fn / 3600 };
}

/** PSD (g²/Hz) at f from a breakpoint table [[f, g²/Hz], …], interpolated on log–log axes (straight dB/octave lines) and 0 outside. */
export function psdAt(table, f) {
  const t = table.filter(([x, y]) => x > 0 && y > 0).sort((a, b) => a[0] - b[0]);
  if (!t.length || f < t[0][0] || f > t.at(-1)[0]) return 0;
  for (let i = 1; i < t.length; i++) {
    if (f <= t[i][0]) {
      const [f0, p0] = t[i - 1];
      const [f1, p1] = t[i];
      return p0 * Math.exp((Math.log(p1 / p0) * Math.log(f / f0)) / Math.log(f1 / f0));
    }
  }
  return t.at(-1)[1];
}

/**
 * Random vibration of a board mode as a single-degree-of-freedom system on a shaken base: input PSD table
 * [[f (Hz), g²/Hz], …] (e.g. MIL-STD-810 / IEC 60068-2-64 profiles), natural frequency fn (Hz), amplification Q
 * (√fn when not given, Steinberg's rule for boards). Integrated numerically over the table's band:
 * absolute response G_rms² = ∫ PSD·|H|² df with |H|² = (1 + (2ζr)²) / ((1 − r²)² + (2ζr)²), r = f/fn, ζ = 1/(2Q), and the
 * relative displacement z_rms² = ∫ PSD·g² / ((2π)⁴·((fn² − f²)² + (2ζ·fn·f)²)) df. Returns { GrmsInput, GrmsResponse,
 * GrmsMiles (Miles' equation at fn, for comparison), zRms (mm), z3sigma (mm), Q, curve: [{ f, input, response }] }.
 */
export function randomVibration({ psd, fn, Q = null }) {
  const table = (psd ?? []).filter(([f, p]) => f > 0 && p > 0).sort((a, b) => a[0] - b[0]);
  if (table.length < 2 || !(fn > 0)) throw new Error('need a PSD table with two or more points and a natural frequency');
  const q = Q ?? Math.sqrt(fn);
  const zeta = 1 / (2 * q);
  const g = 9.80665;
  const fLo = table[0][0];
  const fHi = table.at(-1)[0];
  // Log-spaced points, with extra resolution across the resonance (its half-power width is fn/Q).
  const freqs = new Set();
  const n = 4000;
  for (let i = 0; i <= n; i++) freqs.add(fLo * (fHi / fLo) ** (i / n));
  for (let i = -400; i <= 400; i++) { const f = fn * (1 + (i / 400) * (6 / q)); if (f >= fLo && f <= fHi) freqs.add(f); }
  const fs = [...freqs].sort((a, b) => a - b);
  let gIn = 0;
  let gOut = 0;
  let z2 = 0;
  const curve = [];
  let prev = null;
  for (const f of fs) {
    const p = psdAt(table, f);
    const r = f / fn;
    const den = (1 - r * r) ** 2 + (2 * zeta * r) ** 2;
    const H2 = (1 + (2 * zeta * r) ** 2) / den;
    const Z2 = (g * g) / ((2 * Math.PI) ** 4 * ((fn * fn - f * f) ** 2 + (2 * zeta * fn * f) ** 2));
    const cur = { f, input: p, response: p * H2, z: p * Z2 };
    if (prev) {
      const df = f - prev.f;
      gIn += 0.5 * (cur.input + prev.input) * df;
      gOut += 0.5 * (cur.response + prev.response) * df;
      z2 += 0.5 * (cur.z + prev.z) * df;
    }
    prev = cur;
    if (curve.length < 600 || Math.abs(r - 1) < 0.05) curve.push({ f, input: p, response: cur.response });
  }
  const zRms = Math.sqrt(z2) * 1000;
  return { GrmsInput: Math.sqrt(gIn), GrmsResponse: Math.sqrt(gOut), GrmsMiles: Math.sqrt((Math.PI / 2) * fn * q * psdAt(table, fn)), zRms, z3sigma: 3 * zRms, Q: q, curve: curve.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 400)) === 0) };
}

/**
 * Half-sine shock on a single-degree-of-freedom board mode (Sherlock's mechanical-shock check): base acceleration
 * a(t) = peak·sin(πt/T) for 0 ≤ t ≤ T (peak in g, T = durationMs), natural frequency fn (Hz), amplification Q (ζ = 1/2Q).
 * The relative motion z'' + 2ζω z' + ω² z = −a(t) is integrated through the
 * pulse and three periods of free vibration after it. Returns { zMax (mm, peak relative displacement), aMax (g, peak
 * absolute acceleration of the mass), amplification (aMax / peak, the shock response spectrum value), residual (bool:
 * the peak comes after the pulse), history: [{ t (ms), a (g), z (mm) }] }.
 */
export function halfSineShock({ peakG, durationMs, fn, Q = 10 }) {
  if (!(peakG > 0) || !(durationMs > 0) || !(fn > 0)) throw new Error('peak, duration and natural frequency must be positive');
  const g = 9.80665;
  const T = durationMs / 1000;
  const w = 2 * Math.PI * fn;
  const zeta = 1 / (2 * Q);
  const dt = Math.min(T, 1 / fn) / 400;
  const end = T + 3 / fn;
  const base = (t) => (t <= T ? peakG * g * Math.sin((Math.PI * t) / T) : 0);
  // 4th-order Runge–Kutta on the state (z, v), about 400 steps per period or per pulse.
  const f = (t, z, v) => [v, -base(t) - 2 * zeta * w * v - w * w * z];
  let z = 0;
  let v = 0;
  let zMax = 0;
  let aMax = 0;
  let tPeak = 0;
  const history = [];
  for (let t = 0, i = 0; t <= end; t += dt, i++) {
    const absA = Math.abs(-2 * zeta * w * v - w * w * z);
    if (Math.abs(z) > zMax) zMax = Math.abs(z);
    if (absA > aMax) { aMax = absA; tPeak = t; }
    if (i % 4 === 0) history.push({ t: t * 1000, a: base(t) / g, z: z * 1000 });
    const k1 = f(t, z, v);
    const k2 = f(t + dt / 2, z + (dt / 2) * k1[0], v + (dt / 2) * k1[1]);
    const k3 = f(t + dt / 2, z + (dt / 2) * k2[0], v + (dt / 2) * k2[1]);
    const k4 = f(t + dt, z + dt * k3[0], v + dt * k3[1]);
    z += (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    v += (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  }
  return { zMax: zMax * 1000, aMax: aMax / g, amplification: aMax / g / peakG, residual: tPeak > T, history };
}

/** Γ(x) by the Lanczos approximation (g = 7, 9 terms; reflection for x < ½). */
export function gamma(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7;
  const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  const z = x - 1;
  let a = p[0];
  const t = z + g + 0.5;
  for (let i = 1; i < 9; i++) a += p[i] / (z + i);
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * a;
}

/**
 * Two-parameter Weibull life model from a shape β and the mean life (MTTF, h): η = MTTF / Γ(1 + 1/β).
 * Returns { beta, eta, mttf, reliability(t), cdf(t), hazard(t) (1/h), bLife(p) (h at failed fraction p) }.
 */
export function weibull({ beta, mttf }) {
  const eta = mttf / gamma(1 + 1 / beta);
  const reliability = (t) => (t <= 0 ? 1 : Math.exp(-((t / eta) ** beta)));
  return {
    beta, eta, mttf,
    reliability,
    cdf: (t) => 1 - reliability(t),
    hazard: (t) => (beta / eta) * (Math.max(0, t) / eta) ** (beta - 1),
    bLife: (p) => eta * (-Math.log(1 - p)) ** (1 / beta),
  };
}
