// The map canvas's grid and rulers: sizes in map units that stay readable at every zoom.

// The grid cell in map units at zoom k: 24, or 5× that while the cells would be too small to see.
export function gridCell(k) {
  let cell = 24;
  while (cell * k < 10) cell *= 5;
  return cell;
}

// A ruler step in map units that is at least `minPx` on screen: 1, 2 or 5 × 10ⁿ.
export function rulerStep(k, minPx = 64) {
  const raw = minPx / Math.max(1e-6, k);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
