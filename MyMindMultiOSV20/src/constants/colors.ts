export const NODE_COLORS = [
  '#93c5fd',
  '#a7f3d0',
  '#fde68a',
  '#fca5a5',
  '#c4b5fd',
  '#f9a8d4',
  '#67e8f9',
  '#bef264',
  '#fdba74',
  '#d8b4fe',
  '#99f6e4',
  '#fecdd3',
  '#bfdbfe',
  '#ddd6fe',
  '#bbf7d0',
  '#fed7aa',
  '#fbcfe8',
  '#bae6fd',
  '#e9d5ff',
  '#d9f99d',
] as const

export type NodeColor = (typeof NODE_COLORS)[number]

/** For lines and text, which must stand out where the fills are pale. */
export const INK_COLORS = [
  '#111827',
  '#475569',
  '#94a3b8',
  '#ffffff',
  '#b91c1c',
  '#ef4444',
  '#f97316',
  '#d97706',
  '#ca8a04',
  '#65a30d',
  '#16a34a',
  '#0d9488',
  '#0891b2',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#a21caf',
  '#db2777',
  '#92400e',
] as const

/** Sentinel meaning "use the default text color" (black, on the light node fills). */
export const AUTO_TEXT_COLOR = 'auto'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function resolveTextColor(color: string | undefined, _theme: string): string {
  // Node fills are light pastel colors in both themes, so black stays readable.
  if (!color || color === AUTO_TEXT_COLOR) return '#111827'
  return color
}

/** A line's thickness when it has none of its own, and what can be set. */
export const DEFAULT_LINE_WIDTH = 2
export const LINE_WIDTH_MIN = 1
export const LINE_WIDTH_MAX = 20
