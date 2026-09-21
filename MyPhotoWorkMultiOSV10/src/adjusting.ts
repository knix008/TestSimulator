/*
 * Whether the user is in the middle of an adjustment, and a way to be told
 * when they stop.
 *
 * A slider fires a change for every pixel of a drag. Keeping the value up to
 * date that often is cheap and necessary — the thumb and the number beside it
 * must follow the mouse. Redrawing a preview of the whole picture that often
 * is neither: the drag runs at the speed of the filter, and each frame of that
 * work is thrown away by the next. Only the value the drag ends on matters.
 *
 * So a slider says when a drag begins and ends through this module, and the
 * expensive reactions wait for the end.
 */

let adjusting = 0
const endListeners = new Set<() => void>()

/** True while a slider is being dragged or a key is held down on one. */
export function isAdjusting() {
  return adjusting > 0
}

/** Calls `listener` the next time the last adjustment in progress finishes. */
export function onAdjustEnd(listener: () => void) {
  endListeners.add(listener)
  return () => { endListeners.delete(listener) }
}

export function beginAdjust() {
  adjusting += 1
}

export function endAdjust() {
  if (!adjusting) return
  adjusting -= 1
  if (adjusting) return
  // A listener may register another, so the set is copied before it is run.
  for (const listener of [...endListeners]) listener()
}
