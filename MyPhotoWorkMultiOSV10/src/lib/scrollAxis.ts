/**
 * The canvas is drawn with a pan offset rather than scrolled, so these are the scrollbars
 * that go with it: one along the bottom and one down the right edge of the stage. They read
 * and set the pan. The picture may be scrolled until only KEEP pixels of it are left in view,
 * the same limit as panning with the Hand tool would give a sensible stop.
 */
export const KEEP = 48

/** The scroll model for one axis: where the thumb is and how big, as fractions of the track. */
export function scrollAxis(view: number, content: number, pan: number) {
  // pan runs from (view - KEEP), picture at the far end, down to (KEEP - content).
  const max = view - KEEP
  const min = KEEP - content
  const range = Math.max(1, max - min)
  const clamped = Math.min(max, Math.max(min, pan))
  const size = Math.min(1, view / (range + view))
  const position = (max - clamped) / range
  return { min, max, range, size, start: position * (1 - size) }
}

/** The pan for a thumb whose start is at `start` (a fraction of the track). */
export function panForStart(view: number, content: number, start: number) {
  const { max, range, size } = scrollAxis(view, content, 0)
  const free = 1 - size
  const position = free > 0 ? Math.min(1, Math.max(0, start / free)) : 0
  return max - position * range
}
