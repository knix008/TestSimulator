// The canvas's grid and rulers, from one calculation so their lines meet.
//
// The grid is small cells grouped in 5 × 5 blocks. A cell is GRID_CELL diagram units at 100%.
// Zooming makes them bigger or smaller on screen; once a cell leaves [CELL_MIN, CELL_MAX) pixels its
// size in diagram units is multiplied or divided by 5: a block becomes the new cell (zooming out) or
// a cell the new block (zooming in). So the levels nest exactly and the grid keeps about the same
// look at every zoom. The rulers put a labelled tick on every block line and a small tick on every
// cell line, at exactly the pixels the grid uses.
export const GRID_CELL = 20
export const GRID_DIV = 5
export const CELL_MIN = 10
export const CELL_MAX = 50
export const RULER_SIZE = 22

export type GridLine = { px: number; value: number; major: boolean }

/** Diagram units of one grid cell at this zoom: CELL_MIN to CELL_MAX pixels on screen. */
export function gridCell(zoom: number): number {
  const k = Math.max(1e-6, zoom)
  let cell = GRID_CELL
  for (let i = 0; i < 60 && cell * k < CELL_MIN; i++) cell *= GRID_DIV
  for (let i = 0; i < 60 && cell * k >= CELL_MAX; i++) cell /= GRID_DIV
  return cell
}

/**
 * The grid lines across `length` pixels whose diagram 0 is at pixel `origin`. px is snapped to the
 * pixel centre, so a line stays one crisp pixel wide at every zoom and pan.
 */
export function gridLines(origin: number, zoom: number, length: number, from = 0): GridLine[] {
  const k = Math.max(1e-6, zoom)
  const cell = gridCell(k)
  const out: GridLine[] = []
  for (let i = Math.ceil((from - origin) / k / cell); out.length < 4000; i++) {
    const value = i * cell
    const px = Math.round(origin + value * k) + 0.5
    if (px > length) break
    if (px < from) continue
    out.push({ px, value: Math.round(value * 1e6) / 1e6, major: ((i % GRID_DIV) + GRID_DIV) % GRID_DIV === 0 })
  }
  return out
}

/** A ruler label: the value as a plain number, never "-0". */
export function rulerLabel(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/** SVG path data of one kind of grid line, vertical and horizontal, in screen pixels. */
export function gridPath(xs: GridLine[], ys: GridLine[], width: number, height: number, pick: (line: GridLine) => boolean): string {
  let d = ''
  for (const line of xs) if (pick(line)) d += `M${line.px} 0V${height}`
  for (const line of ys) if (pick(line)) d += `M0 ${line.px}H${width}`
  return d
}
