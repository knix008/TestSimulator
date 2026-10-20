// The map canvas's grid and rulers, from one calculation so their lines meet
// (the step rule follows MyCAD's drafting grid).
//
// The grid is made of small cells grouped in 5 × 5 blocks. A cell is
// GRID_CELL map units (20) at 100%, so a block is 100. Zooming makes them
// bigger or smaller on screen; once a cell leaves [CELL_MIN, CELL_MAX) pixels
// its size in map units is multiplied or divided by 5 — a block becomes the
// new cell (zooming out) or a cell the new block (zooming in) — so the levels
// nest exactly and the grid keeps about the same look at every zoom. The rulers
// put a labelled tick on every block line and a small tick on every cell line,
// at exactly the pixels the grid uses; the line through map 0 is the axis.

export const GRID_CELL = 20;
export const GRID_DIV = 5;
export const CELL_MIN = 10;
export const CELL_MAX = 50;
export const GRID_BASE = GRID_CELL * GRID_DIV;
export const BLOCK_MIN = CELL_MIN * GRID_DIV;
export const BLOCK_MAX = CELL_MAX * GRID_DIV;

/** Map units of one grid cell at zoom k (keeps it CELL_MIN … CELL_MAX pixels on screen). */
export function gridCell(k) {
  const kk = Math.max(1e-6, k);
  let cell = GRID_CELL;
  for (let i = 0; i < 60 && cell * kk < CELL_MIN; i++) cell *= GRID_DIV;
  for (let i = 0; i < 60 && cell * kk >= CELL_MAX; i++) cell /= GRID_DIV;
  return cell;
}

/** Map units of one 5 × 5 block at zoom k (BLOCK_MIN … BLOCK_MAX pixels on screen). */
export function gridBlock(k) {
  return gridCell(k) * GRID_DIV;
}

/**
 * The grid lines across a length of `len` pixels whose map 0 is at pixel `origin`:
 * [{ px, value, major, axis }] — px is snapped to the pixel centre (crisp 1-pixel lines),
 * value is in map units, major marks a block line (every GRID_DIV-th cell), axis the line through 0.
 */
export function gridLines(origin, k, len, from = 0) {
  const cell = gridCell(k);
  const first = Math.ceil((from - origin) / k / cell);
  const out = [];
  for (let i = first; ; i++) {
    const value = i * cell;
    const px = Math.round(origin + value * k) + 0.5;
    if (px > len) break;
    if (px < from) continue;
    out.push({ px, value: Math.round(value * 1e6) / 1e6, major: ((i % GRID_DIV) + GRID_DIV) % GRID_DIV === 0, axis: i === 0 });
    if (out.length > 4000) break;   // a guard against a degenerate size
  }
  return out;
}

/** A ruler label: the value as a plain number (no "-0"; the decimals a deep zoom needs). */
export function rulerLabel(value) {
  const r = Math.round(value * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}
