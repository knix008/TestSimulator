// Harmonic (sine-sweep) response from a modal result: modal superposition of
// single-degree-of-freedom responses H(r) = 1 / (1 − r² + 2iζr), r = f / fn.
// The engine's header.modes give each mode's frequency (Hz) and its effective
// modal mass fractions per axis (participation: [x, y(, z)]); without the
// mode shapes at a response point, √(mass fraction) stands in for the
// participation factor, so the amplitude is relative, not a physical
// transmissibility of one point. Pure functions, unit-tested in Node.

/** Weight of one mode: a number is used as given, an array of mass fractions → √(fraction on `axis`). */
function modeWeight(mode, axis) {
  const p = mode.participation ?? mode.massFraction;
  if (typeof p === 'number') return p;
  if (Array.isArray(p)) return Math.sqrt(Math.max(0, p[axis] ?? 0));
  return 1;
}

/** The axis (0 x, 1 y, 2 z) holding the most effective modal mass over all modes. */
export function dominantAxis(modes) {
  const sums = [0, 0, 0];
  for (const m of modes) if (Array.isArray(m.participation)) m.participation.forEach((v, i) => { sums[i] += Math.max(0, v ?? 0); });
  return sums.indexOf(Math.max(...sums));
}

/**
 * Sine-sweep response: modes [{ frequency (Hz), participation (number, or effective mass fractions [x, y, z]) }],
 * fMin..fMax (Hz, log-spaced when fMin > 0), damping ζ (all modes), base (input amplitude, e.g. g), axis (default: the
 * dominant one), kind 'modal' (Σ wᵢ·Hᵢ, relative amplitude) or 'baseForce' (Σ mᵢ·(1 + 2iζr)/(1 − r² + 2iζr) + the
 * residual mass 1 − Σ mᵢ: the base reaction over the rigid one, needs mass fractions).
 * Returns [{ f (Hz), amplitude, phase (degrees), re, im }].
 */
export function harmonicResponse({ modes, fMin = 1, fMax = 2000, points = 400, damping = 0.02, base = 1, axis = null, kind = 'modal' }) {
  const list = (modes ?? []).filter((m) => m.frequency > 0);
  const ax = axis ?? dominantAxis(list);
  const n = Math.max(2, points);
  const logScale = fMin > 0 && fMax > fMin;
  const z = damping;
  const out = [];
  const massSum = list.reduce((s, m) => s + (Array.isArray(m.participation) ? Math.max(0, m.participation[ax] ?? 0) : 0), 0);
  for (let p = 0; p < n; p++) {
    const t = p / (n - 1);
    const f = logScale ? fMin * (fMax / fMin) ** t : fMin + (fMax - fMin) * t;
    let re = kind === 'baseForce' ? Math.max(0, 1 - massSum) : 0;
    let im = 0;
    for (const m of list) {
      const r = f / m.frequency;
      const dr = 1 - r * r; const di = 2 * z * r;
      const den = dr * dr + di * di;
      // 1/(dr + i·di) = (dr − i·di)/den
      let hr = dr / den; let hi = -di / den;
      let w;
      if (kind === 'baseForce') {
        // (1 + i·di)·(dr − i·di)/den
        const nr = dr + di * di; const ni = di * dr - di;
        hr = nr / den; hi = ni / den;
        w = Array.isArray(m.participation) ? Math.max(0, m.participation[ax] ?? 0) : modeWeight(m, ax) ** 2;
      } else w = modeWeight(m, ax);
      re += w * hr;
      im += w * hi;
    }
    out.push({ f, amplitude: base * Math.hypot(re, im), phase: (Math.atan2(im, re) * 180) / Math.PI, re: base * re, im: base * im });
  }
  return out;
}

/**
 * Physical sine-sweep response at one point from the mode shapes (needs the engine's signed factors): modes
 * [{ frequency (Hz), factor: [Γ/m per axis] }], shapes[k] = [φx, φy, φz] of mode k at the point (as output, max |φ| = 1),
 * base acceleration along `axis`, response component `out` (default: the same axis), damping ζ.
 * With L = Γ/m the modal coordinate is q = −L·a / (ω² − Ω² + 2iζωΩ), the relative displacement z = Σ φ·q and the
 * absolute acceleration A = a·δ + Ω²·Σ φ·L·a / (ω² − Ω² + 2iζωΩ) (δ = 1 when out = axis): one mode with φ = L = 1 gives
 * the classic transmissibility (ω² + 2iζωΩ) / (ω² − Ω² + 2iζωΩ).
 * Returns [{ f, amplitude (|A|/a), phase (degrees), disp (relative displacement, mm per g of input) }].
 */
export function pointTransmissibility({ modes, shapes, fMin = 1, fMax = 2000, points = 400, damping = 0.02, axis = 1, out = null }) {
  const comp = out ?? axis;
  const list = (modes ?? []).map((m, k) => ({ w: 2 * Math.PI * m.frequency, L: m.factor?.[axis] ?? 0, phi: shapes?.[k]?.[comp] ?? 0 })).filter((m) => m.w > 0);
  const n = Math.max(2, points);
  const g = 9.80665;
  const result = [];
  for (let p = 0; p < n; p++) {
    const t = p / (n - 1);
    const f = fMin > 0 && fMax > fMin ? fMin * (fMax / fMin) ** t : fMin + (fMax - fMin) * t;
    const W = 2 * Math.PI * f;
    let zr = 0; let zi = 0;
    for (const m of list) {
      const dr = m.w * m.w - W * W; const di = 2 * damping * m.w * W;
      const den = dr * dr + di * di;
      // φ·L / (dr + i·di)
      zr += (m.phi * m.L * dr) / den;
      zi -= (m.phi * m.L * di) / den;
    }
    const ar = (comp === axis ? 1 : 0) + W * W * zr;
    const ai = W * W * zi;
    result.push({ f, amplitude: Math.hypot(ar, ai), phase: (Math.atan2(ai, ar) * 180) / Math.PI, disp: Math.hypot(zr, zi) * g * 1000 });
  }
  return result;
}

/** Local maxima of a response curve → [{ f, amplitude }] sorted by amplitude (largest first). */
export function responsePeaks(curve, count = 5) {
  const peaks = [];
  for (let i = 1; i < curve.length - 1; i++) if (curve[i].amplitude > curve[i - 1].amplitude && curve[i].amplitude >= curve[i + 1].amplitude) peaks.push({ f: curve[i].f, amplitude: curve[i].amplitude });
  return peaks.sort((a, b) => b.amplitude - a.amplitude).slice(0, count);
}
