/** Viewport helpers shared by the grid and the rulers. */

/** Height of the ruler strips, in screen pixels. */
export const rulerSize = 20

/**
 * A round tick spacing that stays readable at any zoom: the smallest of
 * 1 / 2 / 5 x 10^n whose on-screen width clears `minPixels`.
 */
export function tickStep(zoom: number, minPixels: number) {
  const target = minPixels / Math.max(zoom, 0.0001)
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1))))
  for (const factor of [1, 2, 5, 10]) {
    if (magnitude * factor >= target) {
      return magnitude * factor
    }
  }
  return magnitude * 10
}

/** The document-space range currently visible along one axis. */
export function visibleRange(viewSize: number, pan: number, zoom: number) {
  return { from: -pan / zoom, to: (viewSize - pan) / zoom }
}

/** The first tick at or before the start of `range`. */
export function firstTick(from: number, step: number) {
  return Math.floor(from / step) * step
}

/** A grid cell stays between these sizes on screen as the zoom changes. */
export const GRID_MIN_PX = 8
export const GRID_MAX_PX = 40
/** Five small cells to a side make one large cell: a 5x5 grid. */
export const GRID_DIVISIONS = 5

/** The spacing of the fine grid lines, in document pixels; every fifth line is a heavy one. */
export function gridStep(zoom: number) {
  const scale = Math.max(zoom, 0.0001)
  let step = 10
  while (step * scale < GRID_MIN_PX) step *= GRID_DIVISIONS
  while (step * scale >= GRID_MAX_PX) step /= GRID_DIVISIONS
  return step
}

/** Where the red marks on the rulers go for a pointer at these screen coordinates, or null past the edge. */
export function rulerMarks(x: number, y: number, view: { width: number; height: number }) {
  if (x < 0 || y < 0 || x >= view.width || y >= view.height) return null
  return { x: Math.round(x), y: Math.round(y), showX: x >= rulerSize, showY: y >= rulerSize }
}
