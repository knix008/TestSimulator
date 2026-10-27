// "5×5 grid" step logic (DOM-free so Node tests can import it).
// The minor step is a nice value whose on-screen spacing stays readable at
// every zoom; a stronger major line comes every 5 minor steps.

/** Minor lines closer than this (px) are too dense; further apart than MAX they are too sparse. */
export const GRID_MIN_PX = 10;
export const GRID_MAX_PX = 50;

/**
 * Grid step for a base size and a zoom (px per unit), stepping in powers of 5
 * (the same rule as the CAD views of the sibling apps).
 */
export function gridStepFor(size, zoom) {
  let step = size > 0 ? size : 10;
  if (!(zoom > 0) || !Number.isFinite(zoom)) return step;
  for (let i = 0; i < 60 && step * zoom < GRID_MIN_PX; i++) step *= 5;
  for (let i = 0; i < 60 && step * zoom >= GRID_MAX_PX; i++) step /= 5;
  return step;
}

/** The smallest 1-2-5 × 10^n value that is at least x. */
export function niceAtLeast(x) {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const e = Math.floor(Math.log10(x));
  for (const f of [1, 2, 5, 10]) { const s = f * 10 ** e; if (s >= x * (1 - 1e-12)) return s; }
  return 10 ** (e + 1);
}

/**
 * Minor step (data units) for an axis shown with `pxPerUnit` pixels per data
 * unit: a 1-2-5 value at least GRID_MIN_PX px apart on screen.
 */
export function minorStepFor(pxPerUnit, minPx = GRID_MIN_PX) {
  if (!(pxPerUnit > 0) || !Number.isFinite(pxPerUnit)) return 1;
  return niceAtLeast(minPx / pxPerUnit);
}

/**
 * Grid lines inside [lo, hi] (data units) for an axis of `px` pixels.
 * Returns { minor, major, minorLines: number[], majorLines: number[] }.
 * major = 5 × minor; the major lines are not repeated in minorLines.
 */
export function gridLines(lo, hi, px, minPx = GRID_MIN_PX) {
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = hi - lo;
  const minor = minorStepFor(span > 0 ? px / span : 0, minPx);
  const major = minor * 5;
  const minorLines = [], majorLines = [];
  if (!(span > 0)) return { minor, major, minorLines, majorLines };
  const first = Math.ceil(lo / minor - 1e-9);
  for (let i = first; ; i++) {
    const v = i * minor;
    if (v > hi + minor * 1e-9) break;
    const c = Number(v.toPrecision(12));
    if (Math.abs(i % 5) === 0) majorLines.push(c); else minorLines.push(c);
    if (minorLines.length + majorLines.length > 4000) break;
  }
  return { minor, major, minorLines, majorLines };
}

/**
 * Log-axis grid: majors at decades, minors at 2..9 × decade (or every decade
 * as minor when many decades are shown, with a major every 5th).
 */
export function logGridLines(lo, hi) {
  const minorLines = [], majorLines = [];
  if (!(lo > 0) || !(hi > lo)) return { minorLines, majorLines };
  const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi));
  if (b - a > 25) {
    for (let e = a; e <= b; e++) { const v = 10 ** e; if (v >= lo && v <= hi) (e % 5 === 0 ? majorLines : minorLines).push(v); }
    return { minorLines, majorLines };
  }
  for (let e = a; e <= b; e++) {
    const d = 10 ** e;
    if (d >= lo && d <= hi) majorLines.push(d);
    for (let k = 2; k <= 9; k++) { const v = k * d; if (v > lo && v < hi) minorLines.push(v); }
  }
  return { minorLines, majorLines };
}

/**
 * 3D ground-grid level of detail: for a footprint of `unitsPerPx` data units
 * per screen pixel returns { step, next, fade } where step = base·5^k is the
 * smallest power-of-5 multiple at least GRID_MIN_PX px wide and fade (0..1)
 * cross-fades the finest level out as it gets denser. The shader does the
 * same per pixel; this is the reference implementation for tests.
 */
export function lodStep(base, unitsPerPx, minPx = GRID_MIN_PX) {
  const want = Math.max(1e-30, unitsPerPx * minPx) / base;
  const lod = Math.log(want) / Math.log(5);
  const k = Math.ceil(lod);
  const step = base * 5 ** k;
  return { step, next: step * 5, fade: 1 - (k - lod) };
}
