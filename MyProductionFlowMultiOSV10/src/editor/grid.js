// The 5 × 5 grid that keeps its on-screen size while zooming (2D editor and 3D floor).
// Minor lines are 5^k metres apart (… 0.04, 0.2, 1, 5, 25, 125 …), every 5th one is a major line.
// k is the smallest power whose minor spacing is at least `minPx` screen pixels, so the minor spacing on
// screen always stays between minPx and 5·minPx: zooming out, the major lines become the next minor lines.
// `fade` (0…1) lets the minor lines appear gradually instead of popping in at minPx.

/** Grid level for `pxPerMetre` screen pixels per metre: { minor, major, fade, minorPx }. */
export function gridLevel(pxPerMetre, minPx = 10) {
  const ppm = Number(pxPerMetre) > 0 ? Number(pxPerMetre) : 1;
  let k = Math.ceil(Math.log(minPx / ppm) / Math.log(5) - 1e-9);
  k = Math.max(-4, Math.min(6, k));
  const minor = 5 ** k;
  const minorPx = minor * ppm;
  const fade = Math.max(0, Math.min(1, (minorPx - minPx) / (minPx * 1.5)));
  return { minor, major: minor * 5, fade, minorPx, k };
}

/** Ruler / axis label for a value in metres at `step` spacing (no float noise: 0.2·3 → "0.6"). */
export function formatMetres(value, step) {
  const digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step) - 1e-9));
  const v = Number(value.toFixed(digits));
  return String(Object.is(v, -0) ? 0 : v);
}
