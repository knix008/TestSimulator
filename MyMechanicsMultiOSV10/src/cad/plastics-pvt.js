// Material state of a moulding resin (no DOM): the two-domain modified Tait equation of state (specific volume
// from temperature and pressure, with the transition between melt and solid moving with pressure and, for a
// semi-crystalline resin, the crystallisation step), and the gapwise (through-thickness) temperature of a wall
// as layers between the mid-plane and the mould, cooled by conduction, so the frozen skin grows with time.
//
// Tait (SI: v in m³/kg, T in K, p in Pa), C = 0.0894:
//   v(T, p) = v0(T) · [1 − C ln(1 + p / B(T))] + vt(T, p)
//   T > Tt(p) = b5 + b6 p (melt):  v0 = b1m + b2m (T − b5), B = b3m e^(−b4m (T − b5)), vt = 0
//   T ≤ Tt(p) (solid):              v0 = b1s + b2s (T − b5), B = b3s e^(−b4s (T − b5)), vt = b7 e^(b8 (T − b5) − b9 p)

const C_TAIT = 0.0894;

/** Specific volume (m³/kg) at T (°C) and p (Pa). */
function taitParts(t, T, p) {
  const Tk = T + 273.15; const pp = Math.max(0, p);
  const Tt = t.b5 + t.b6 * pp; const dT = Tk - t.b5;
  let v0; let B; let vt = 0;
  if (Tk > Tt) { v0 = t.b1m + t.b2m * dT; B = t.b3m * Math.exp(-t.b4m * dT); }
  else {
    // An amorphous resin's solid branch starts from the melt's state (v0 and B) at the pressure-shifted
    // transition, so volume and compressibility join there; a semi-crystalline one has its own branch plus the
    // crystallisation term.
    if (t.b7 > 0) { v0 = t.b1s + t.b2s * dT; B = t.b3s * Math.exp(-t.b4s * dT); }
    else { v0 = t.b1m + t.b2m * (Tt - t.b5) + t.b2s * (Tk - Tt); B = t.b3m * Math.exp(-t.b4m * (Tt - t.b5)) * Math.exp(-t.b4s * (Tk - Tt)); }
    vt = t.b7 * Math.exp(t.b8 * dT - t.b9 * pp);
  }
  return { v0, B, vt, pp };
}
export function taitVolume(t, T, p = 0) {
  const { v0, B, vt, pp } = taitParts(t, T, p);
  return v0 * (1 - C_TAIT * Math.log(1 + pp / B)) + vt;
}
export const taitDensity = (t, T, p = 0) => 1 / taitVolume(t, T, p);
/** Isothermal compressibility β = (1/ρ) ∂ρ/∂p (1/Pa). */
export function compressibility(t, T, p = 0) {
  // Within the branch the state is in (no difference across the transition): −(1/v) ∂v/∂p.
  const { v0, B, vt, pp } = taitParts(t, T, p);
  const v = v0 * (1 - C_TAIT * Math.log(1 + pp / B)) + vt;
  return ((v0 * C_TAIT) / (B + pp) + t.b9 * vt) / v;
}

/**
 * Tait coefficients from a resin's densities and transition: solid density at 25 °C, melt density at the melt
 * temperature, the transition temperature at 0 Pa (glass transition or crystallisation, °C), its pressure shift,
 * the bulk moduli of melt and solid at the transition, and for a semi-crystalline resin the share of the volume
 * step at the transition. The thermal expansion of each phase follows from the two densities (the solid's from
 * a typical coefficient when the transition step takes up the rest).
 */
export function fitTait({ rhoSolid, rhoMelt, melt, transition, shift = 2e-7, bulkMelt = 1.8e8, bulkSolid = 3e8, crystalline = false, solidExpansion = 2.4e-4 }) {
  const b5 = transition + 273.15;
  const vSolid25 = 1 / rhoSolid; const vMelt = 1 / rhoMelt;
  // Solid branch: v = b1s + b2s (T − b5); its expansion coefficient ~ solidExpansion (1/K).
  const b2s = vSolid25 * solidExpansion;
  const b1s = vSolid25 - b2s * (298.15 - b5);
  // Melt branch through the melt state; an amorphous resin meets the solid at the transition, a crystalline one
  // has the crystallisation step (vt) on the solid side.
  let b1m; let b2m; let b7 = 0; let b8 = 0; let b9 = 0;
  if (crystalline) {
    b2m = vMelt * 7e-4; b1m = vMelt - b2m * (melt + 273.15 - b5);
    b7 = Math.max(0, b1m - b1s); b8 = 0.05; b9 = 1e-8;
  } else { b1m = b1s; b2m = (vMelt - b1m) / (melt + 273.15 - b5); }
  return { b1m, b2m, b3m: bulkMelt, b4m: 4.5e-3, b1s, b2s, b3s: bulkSolid, b4s: 3.5e-3, b5, b6: shift, b7, b8, b9 };
}

// ───────────────────────── gapwise temperature

/**
 * One wall's temperature through its half thickness: L layers from the mid-plane (index 0) to the mould side,
 * advanced by implicit conduction (symmetry at the mid-plane, the mould temperature at the wall). In place.
 * h: wall thickness (m), alpha: diffusivity (m²/s).
 */
export function conductLayers(T, L, h, alpha, Tw, dt, scratch) {
  const dz = h / 2 / L;
  const r = (alpha * dt) / (dz * dz);
  const a = scratch.a; const b = scratch.b; const c = scratch.c; const d = scratch.d;
  for (let j = 0; j < L; j++) {
    a[j] = j === 0 ? 0 : -r;
    c[j] = j === L - 1 ? 0 : -r;
    b[j] = 1 + (j === 0 ? r : 2 * r) + (j === L - 1 ? r : 0); // the wall half a layer away: 2r in all
    d[j] = T[j] + (j === L - 1 ? 2 * r * Tw : 0);
  }
  b[L - 1] = 1 + r + 2 * r; // neighbour inside (r) and the wall at dz/2 (2r)
  if (L === 1) b[0] = 1 + 2 * r;
  // Thomas algorithm.
  for (let j = 1; j < L; j++) { const m = a[j] / b[j - 1]; b[j] -= m * c[j - 1]; d[j] -= m * d[j - 1]; }
  T[L - 1] = d[L - 1] / b[L - 1];
  for (let j = L - 2; j >= 0; j--) T[j] = (d[j] - c[j] * T[j + 1]) / b[j];
}
export const layerScratch = (L) => ({ a: new Float64Array(L), b: new Float64Array(L), c: new Float64Array(L), d: new Float64Array(L) });

/** Frozen share of a wall: the layers from the mould inwards below the no-flow temperature (0 … 1). */
export function frozenFraction(T, L, noFlow) {
  let k = 0;
  for (let j = L - 1; j >= 0; j--) { if (T[j] < noFlow) k++; else break; }
  return k / L;
}
export const meanLayers = (T, L) => { let s = 0; for (let j = 0; j < L; j++) s += T[j]; return s / L; };

/** Time for a wall at T0 between moulds at Tw until its mid-plane reaches Te (layered conduction). */
export function coolingTimeLayers(h, alpha, T0, Tw, Te, L = 20) {
  if (!(T0 > Te && Te > Tw)) return 0;
  const T = new Float64Array(L).fill(T0); const sc = layerScratch(L);
  const tau = (h * h) / (Math.PI * Math.PI * alpha);
  const dt = tau / 200; let t = 0;
  for (let i = 0; i < 200000 && T[0] > Te; i++) { conductLayers(T, L, h, alpha, Tw, dt, sc); t += dt; }
  return t;
}
