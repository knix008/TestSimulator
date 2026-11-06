// Line themes: one choice that styles every connector of a diagram, separately from the colour
// theme of the program. The colours are mid-tones, which read on light and dark canvases alike.
import type { EndCap, LinePattern, LineType } from './types'

export type LineTheme = {
  id: string
  ko: string
  en: string
  lineType: LineType
  linePattern: LinePattern
  startCap: EndCap
  endCap: EndCap
  /** A branch of the diagram takes the next colour; one colour means all alike. */
  palette: string[]
}

const theme = (id: string, ko: string, en: string, lineType: LineType, linePattern: LinePattern, palette: string[], startCap: EndCap = 'none', endCap: EndCap = 'none'): LineTheme => ({ id, ko, en, lineType, linePattern, palette, startCap, endCap })

export const DEFAULT_LINE_THEME = 'default'

export const LINE_THEMES: LineTheme[] = [
  theme('default', '기본', 'Default', 'curve', 'solid', ['#94a3b8']),
  theme('rainbow', '무지개', 'Rainbow', 'curve', 'solid', ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7']),
  theme('roots', '나무 뿌리', 'Tree Roots', 'root', 'solid', ['#92602f', '#6b8e23', '#a16207']),
  theme('circuit', '회로', 'Circuit', 'elbow', 'solid', ['#0ea5e9']),
  theme('blueprint', '청사진', 'Blueprint', 'elbow', 'dashed', ['#3b82f6']),
  theme('flow', '흐름 화살표', 'Flow Arrows', 'straight', 'solid', ['#6366f1'], 'none', 'arrow'),
  theme('curveArrow', '곡선 화살표', 'Curved Arrows', 'curve', 'solid', ['#14b8a6'], 'none', 'arrow'),
  theme('pencil', '연필', 'Pencil', 'curve', 'dotted', ['#78716c']),
  theme('mono', '단색 직선', 'Plain Straight', 'straight', 'solid', ['#64748b']),
  theme('beads', '구슬', 'Beads', 'straight', 'solid', ['#ec4899'], 'dot', 'dot'),
  theme('technical', '기술 도면', 'Technical', 'straight', 'dashdot', ['#0f766e'], 'none', 'diamond'),
  theme('neon', '네온', 'Neon', 'curve', 'solid', ['#d946ef', '#06b6d4', '#84cc16']),
  theme('pastel', '파스텔', 'Pastel', 'curve', 'dashed', ['#f472b6', '#60a5fa', '#4ade80', '#fbbf24']),
  theme('steps', '계단 화살표', 'Step Arrows', 'elbow', 'solid', ['#f97316'], 'none', 'arrow'),
  theme('stitch', '바느질', 'Stitching', 'straight', 'dotted', ['#dc2626', '#2563eb'], 'dot', 'dot'),
]

export const lineThemeById = (id: string | undefined): LineTheme => LINE_THEMES.find((item) => item.id === id) ?? LINE_THEMES[0]
export const isLineThemeId = (id: unknown): id is string => LINE_THEMES.some((item) => item.id === id)
