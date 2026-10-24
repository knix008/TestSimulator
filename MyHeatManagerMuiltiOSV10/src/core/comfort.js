// Thermal comfort (ISO 7730 / ASHRAE 55): the predicted mean vote PMV and the
// predicted percentage dissatisfied PPD for every air cell of a flow result,
// from its temperature and speed. The mean radiant temperature is taken as the
// air temperature unless given. Pure functions, unit-tested in Node.

/**
 * PMV of one point. ta, tr °C; vel m/s; rh %; met (1 met = 58.15 W/m²); clo (1 clo = 0.155 m²K/W).
 * The ISO 7730 Annex D algorithm (iterating the clothing surface temperature).
 */
export function pmv(ta, tr, vel, rh, met = 1.2, clo = 0.5, wme = 0) {
  const pa = rh * 10 * Math.exp(16.6536 - 4030.183 / (ta + 235));
  const icl = 0.155 * clo;
  const m = met * 58.15;
  const w = wme * 58.15;
  const mw = m - w;
  const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
  const hcf = 12.1 * Math.sqrt(Math.max(0, vel));
  const taa = ta + 273;
  const tra = tr + 273;
  let tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);
  const p1 = icl * fcl;
  const p2 = p1 * 3.96;
  const p3 = p1 * 100;
  const p4 = p1 * taa;
  const p5 = 308.7 - 0.028 * mw + p2 * (tra / 100) ** 4;
  let xn = tcla / 100;
  let xf = tcla / 50;
  let hc = hcf;
  for (let n = 0; n < 150 && Math.abs(xn - xf) > 0.00015; n++) {
    xf = (xf + xn) / 2;
    const hcn = 2.38 * Math.abs(100 * xf - taa) ** 0.25;
    hc = Math.max(hcf, hcn);
    xn = (p5 + p4 * hc - p2 * xf ** 4) / (100 + p3 * hc);
  }
  const tcl = 100 * xn - 273;
  const hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa);
  const hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;
  const hl3 = 1.7 * 0.00001 * m * (5867 - pa);
  const hl4 = 0.0014 * m * (34 - ta);
  const hl5 = 3.96 * fcl * (xn ** 4 - (tra / 100) ** 4);
  const hl6 = fcl * hc * (tcl - ta);
  const ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
  return ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
}

/** PPD (%) from PMV. */
export function ppd(value) {
  return 100 - 95 * Math.exp(-0.03353 * value ** 4 - 0.2179 * value ** 2);
}

/** ISO 7730 categories: A |PMV| < 0.2, B < 0.5, C < 0.7. */
export function comfortCategory(value) {
  const a = Math.abs(value);
  return a < 0.2 ? 'A' : a < 0.5 ? 'B' : a < 0.7 ? 'C' : '—';
}

/** Occupant and room inputs: metabolic rate (met), clothing (clo), relative humidity (%), mean radiant temperature (°C; null = the air temperature). */
export const COMFORT_DEFAULTS = { met: 1.2, clo: 0.5, rh: 50, tr: null };

/**
 * PMV and PPD fields over the fluid cells of a result (NaN elsewhere). `fluidIndex`: the material
 * indices (as in the result's "mat" field) that are fluids.
 */
export function comfortFields(T, u, v, mat, fluidIndex, input = COMFORT_DEFAULTS) {
  const params = { ...COMFORT_DEFAULTS, ...(input ?? {}) };
  const tr = Number.isFinite(params.tr) ? params.tr : null;
  const n = T.length;
  const pmvField = new Float32Array(n).fill(NaN);
  const ppdField = new Float32Array(n).fill(NaN);
  const fluids = new Set(fluidIndex);
  for (let i = 0; i < n; i++) {
    if (!fluids.has(mat[i])) continue;
    const speed = u && v ? Math.hypot(u[i], v[i]) : 0.1;
    const value = pmv(T[i], tr ?? T[i], Math.max(0.05, speed), params.rh, params.met, params.clo);
    pmvField[i] = value;
    ppdField[i] = ppd(value);
  }
  return { pmv: pmvField, ppd: ppdField };
}
