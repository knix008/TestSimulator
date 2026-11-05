// The window's minimum size follows what its two top rows need. The toolbar has two forms: with
// labels when there is room, and icons only when not (theme and language always keep theirs).
export const MIN_WINDOW_HEIGHT = 560
const WINDOW_EDGE = 2
const COMPACT = 'compact'

/** The width of a row's items as they are, gaps and padding included, whatever the row's own width is. */
function rowWidth(row: HTMLElement, flexible: (child: Element) => boolean): number {
  const style = getComputedStyle(row)
  const gap = Number.parseFloat(style.columnGap) || 0
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
  let total = padding
  let items = 0
  for (const child of row.children) {
    if (flexible(child)) continue
    const margin = getComputedStyle(child)
    const left = child.classList.contains('toolbar-end') ? 0 : Number.parseFloat(margin.marginLeft) || 0
    total += child.getBoundingClientRect().width + left + (Number.parseFloat(margin.marginRight) || 0)
    items += 1
  }
  return total + gap * Math.max(0, items - 1)
}

const titleFlexible = (child: Element) => child.classList.contains('title-file') || child.classList.contains('title-gap')

/**
 * Picks the toolbar's form for the window's width and returns the smallest width the window may
 * have. Both forms are measured in one go, so nothing of this is ever painted.
 */
export function fitToolbar(menubar: HTMLElement, toolbar: HTMLElement): number {
  const title = rowWidth(menubar, titleFlexible) + 60
  toolbar.classList.remove(COMPACT)
  const full = rowWidth(toolbar, () => false) + WINDOW_EDGE
  toolbar.classList.add(COMPACT)
  const compact = rowWidth(toolbar, () => false) + WINDOW_EDGE
  toolbar.classList.toggle(COMPACT, window.innerWidth < full)
  return Math.ceil(Math.max(title, compact))
}
