const GAP = 3
const MARGIN = 8

/** Below its button, or above when it fits better; never past the window, and as wide as the button. */
export function optionListPlace(button: { left: number; top: number; bottom: number; width: number }, height: number, view: { width: number; height: number }) {
  const width = Math.max(button.width, 120)
  const left = Math.max(MARGIN, Math.min(button.left, view.width - width - MARGIN))
  const below = view.height - button.bottom - GAP - MARGIN
  const above = button.top - GAP - MARGIN
  if (height <= below || below >= above) return { left, top: button.bottom + GAP, width, maxHeight: below }
  const fitted = Math.min(height, above)
  return { left, top: button.top - GAP - fitted, width, maxHeight: fitted }
}
