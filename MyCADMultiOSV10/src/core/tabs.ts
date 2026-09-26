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
