// Stress linearisation along a stress classification line (SCL) through a wall — the pressure-vessel check of
// ASME VIII Div. 2 Annex 5-A: the stress tensor sampled across the thickness t (x from −t/2 to t/2) splits into
//   membrane   σm = (1/t) ∫ σ dx                     (the average)
//   bending    σb = (6/t²) ∫ σ x dx                  (the linear part; ±σb at the two surfaces)
//   peak       σF = σ − (σm ± σb)                    (what is left: the non-linear part at a surface)
// each reported as stress intensity (Tresca, σ1 − σ3) and von Mises, at both surfaces. The design limits:
// Pm ≤ S, Pm + Pb ≤ 1.5 S, total (Pm + Pb + Q + F) range ≤ 3 S (with S the allowable stress).
import { principals } from '../fatigue.js';
import { probeStatic } from './static.js';

const tresca = (s) => { const p = principals(s); return p[0] - p[2]; };
const mises = (s) => Math.sqrt(Math.max(0, 0.5 * ((s[0] - s[1]) ** 2 + (s[1] - s[2]) ** 2 + (s[2] - s[0]) ** 2) + 3 * (s[3] ** 2 + s[4] ** 2 + s[5] ** 2)));

/**
 * Linearisation of tensors sampled at equal steps along the SCL (an odd count; Simpson's rule), thickness t.
 * Returns { thickness, membrane (tensor), bending (tensor at the first surface), categories: { membrane, bending,
 * membraneBending, peak, total } each { intensity, mises } (the larger of the two surfaces where it applies) }.
 */
export function linearizeSamples(tensors, t) {
  const n = tensors.length;
  if (n < 3) throw new Error('at least three samples');
  const m = n % 2 ? n : n - 1;                       // Simpson on an odd number of points
  const h = t / (m - 1);
  const w = (i) => (i === 0 || i === m - 1 ? 1 : i % 2 ? 4 : 2) * (h / 3);
  const mem = new Array(6).fill(0), ben = new Array(6).fill(0);
  for (let i = 0; i < m; i++) {
    const x = -t / 2 + i * h;
    for (let k = 0; k < 6; k++) { mem[k] += w(i) * tensors[i][k]; ben[k] += w(i) * tensors[i][k] * x; }
  }
  for (let k = 0; k < 6; k++) { mem[k] /= t; ben[k] *= -6 / (t * t); }
  // The bending tensor as at the first surface (x = −t/2): σb(−t/2) = −(6/t²)∫σ x dx · … sign kept so m + b is the first surface.
  const surfaces = [0, m - 1].map((i, j) => {
    const sgn = j === 0 ? 1 : -1;
    const mb = mem.map((v, k) => v + sgn * ben[k]);
    const total = tensors[i];
    const peak = total.map((v, k) => v - mb[k]);
    return { mb, total, peak, b: ben.map((v) => sgn * v) };
  });
  const pick = (f) => Math.max(...surfaces.map(f));
  const cat = (f) => ({ intensity: pick((s) => tresca(f(s))), mises: pick((s) => mises(f(s))) });
  // The total over the whole line (the largest anywhere).
  let tI = 0, tM = 0; for (let i = 0; i < m; i++) { tI = Math.max(tI, tresca(tensors[i])); tM = Math.max(tM, mises(tensors[i])); }
  return {
    thickness: t, membrane: mem, bending: ben,
    categories: {
      membrane: { intensity: tresca(mem), mises: mises(mem) },
      bending: cat((s) => s.b),
      membraneBending: cat((s) => s.mb),
      peak: cat((s) => s.peak),
      total: { intensity: tI, mises: tM },
    },
  };
}

/** The design checks for an allowable stress S (stress intensity): [{ name, value, limit, ok }]. */
export function linearizationChecks(lin, S) {
  const c = lin.categories;
  return [
    { name: 'Pm', value: c.membrane.intensity, limit: S },
    { name: 'Pm+Pb', value: c.membraneBending.intensity, limit: 1.5 * S },
    { name: 'Pm+Pb+Q+F', value: c.total.intensity, limit: 3 * S },
  ].map((x) => ({ ...x, ok: x.value <= x.limit }));
}

/** Linearisation of a static result between points a and b (n samples; points outside the mesh fail). */
export function linearizeStatic(result, a, b, n = 21) {
  const t = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (!(t > 0)) return { ok: false, error: 'same-point' };
  const tensors = [];
  for (let i = 0; i < n; i++) {
    const s = i / (n - 1), p = [a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])];
    const q = probeStatic(result, p);
    if (!q) return { ok: false, error: 'outside', at: i };
    tensors.push(Array.from(q.stress));
  }
  return { ok: true, ...linearizeSamples(tensors, t), samples: tensors };
}
