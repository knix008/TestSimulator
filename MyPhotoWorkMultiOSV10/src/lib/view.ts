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
