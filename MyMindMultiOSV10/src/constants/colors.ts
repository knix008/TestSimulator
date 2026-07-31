export const NODE_COLORS = [
  '#3b82f6',
  '#2563eb',
  '#06b6d4',
  '#10b981',
  '#84cc16',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
  '#0f172a',
] as const

export type NodeColor = (typeof NODE_COLORS)[number]
