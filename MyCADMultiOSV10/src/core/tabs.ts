export function tabWindow<T extends { id: string }>(tabs: T[], start: number, maxVisible: number): T[] {
  const count = Math.max(1, maxVisible)
  const from = Math.max(0, Math.min(start, Math.max(0, tabs.length - count)))
  return tabs.slice(from, from + count)
}

export function canShiftTabs(direction: 'prev' | 'next', start: number, total: number, maxVisible: number): boolean {
  if (total <= maxVisible) return false
  if (direction === 'prev') return start > 0
  return start < total - maxVisible
}

export function nextTabStart(direction: 'prev' | 'next', start: number, total: number, maxVisible: number): number {
  if (!canShiftTabs(direction, start, total, maxVisible)) return start
  return direction === 'prev' ? start - 1 : start + 1
}

export function tabsOverflow(total: number, maxVisible: number): boolean {
  return total > maxVisible
}

/** Widest a tab is allowed to get, matching `.tab { max-width }` in the CSS. */
export const TAB_WIDTH = 180

/** Room the two scroll arrows take up at the ends of the tab row. */
export const TAB_ARROW_WIDTH = 26

/**
 * How many tabs fit across the strip. Everything fits until the row runs out
 * of window: from then on the two arrows appear and take their own share of
 * the width, and the rest is whole tabs.
 */
export function visibleTabCount(available: number, total: number, tabWidth = TAB_WIDTH, arrowWidth = TAB_ARROW_WIDTH): number {
  if (!Number.isFinite(available) || available <= 0) return Math.max(1, total)
  const width = Math.max(1, tabWidth)
  if (total * width <= available) return Math.max(1, total)
  return Math.max(1, Math.floor((available - arrowWidth * 2) / width))
}

/**
 * Where the visible window has to start for a tab to be on screen: the strip
 * follows the document the user just switched to.
 */
export function tabStartFor(index: number, start: number, total: number, maxVisible: number): number {
  const count = Math.max(1, maxVisible)
  const last = Math.max(0, total - count)
  if (index < 0) return Math.min(start, last)
  if (index < start) return Math.min(index, last)
  if (index >= start + count) return Math.min(index - count + 1, last)
  return Math.min(start, last)
}
