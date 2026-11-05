// Mind map themes: dress a whole diagram at once with node colours, shapes, text and connectors.
// The canvas behind it keeps the program theme's colours.
import { NODE_COLORS } from './constants/colors'
import type { ShapeType } from './types'

export type DiagramTheme = {
  id: string
  ko: string
  en: string
  /** The centre's fill and text. */
  root: string
  rootText: string
  /** Each branch takes the next colour (by level when byLevel is set). */
  palette: readonly string[]
  byLevel?: boolean
  /** Node text; 'auto' is the default dark text. */
  text: string
  rootShape: ShapeType
  shape: ShapeType
  /** A line theme's id (lineThemes.ts). */
  line: string
  /** Keeps the branch colour at every depth instead of lightening it. */
  flat?: boolean
}

export const DEFAULT_DIAGRAM_THEME = 'default'

const AUTO = 'auto'
const WHITE = '#ffffff'
const INK = '#1f2937'

export const DIAGRAM_THEMES: DiagramTheme[] = [
  { id: 'default', ko: '기본', en: 'Default', root: NODE_COLORS[0], rootText: AUTO, palette: NODE_COLORS, byLevel: true, text: AUTO, rootShape: 'rounded', shape: 'rounded', line: 'default' },
  { id: 'rainbow', ko: '무지개', en: 'Rainbow', root: '#1f2937', rootText: WHITE, palette: ['#fca5a5', '#fdba74', '#fde047', '#86efac', '#93c5fd', '#c4b5fd'], text: INK, rootShape: 'stadium', shape: 'rounded', line: 'rainbow' },
  { id: 'pastel', ko: '파스텔', en: 'Pastel', root: '#f9a8d4', rootText: INK, palette: ['#fbcfe8', '#bfdbfe', '#bbf7d0', '#fef08a', '#ddd6fe'], text: INK, rootShape: 'ellipse', shape: 'stadium', line: 'pastel' },
  { id: 'forest', ko: '숲', en: 'Forest', root: '#166534', rootText: WHITE, palette: ['#86efac', '#a3e635', '#bbf7d0', '#d9f99d'], text: '#14532d', rootShape: 'hexagon', shape: 'rounded', line: 'roots' },
  { id: 'ocean', ko: '바다', en: 'Ocean', root: '#0c4a6e', rootText: WHITE, palette: ['#7dd3fc', '#67e8f9', '#99f6e4', '#bae6fd'], text: '#0c4a6e', rootShape: 'ellipse', shape: 'stadium', line: 'curveArrow' },
  { id: 'sunset', ko: '노을', en: 'Sunset', root: '#9a3412', rootText: WHITE, palette: ['#fdba74', '#fca5a5', '#f9a8d4', '#fde68a'], text: '#7c2d12', rootShape: 'rounded', shape: 'rounded', line: 'rainbow' },
  { id: 'neon', ko: '네온 밤', en: 'Neon Night', root: '#d946ef', rootText: WHITE, palette: ['#22d3ee', '#a3e635', '#f472b6', '#facc15'], text: '#0b1020', rootShape: 'hexagon', shape: 'chevron', line: 'neon', flat: true },
  { id: 'midnight', ko: '자정', en: 'Midnight', root: '#6366f1', rootText: WHITE, palette: ['#334155', '#3f3f6e', '#1e3a5f', '#44335f'], text: '#e2e8f0', rootShape: 'rounded', shape: 'rounded', line: 'mono', flat: true },
  { id: 'blueprint', ko: '청사진', en: 'Blueprint', root: '#1d4ed8', rootText: WHITE, palette: ['#dbeafe'], text: '#1e3a8a', rootShape: 'rect', shape: 'rect', line: 'blueprint' },
  { id: 'circuit', ko: '회로 기판', en: 'Circuit Board', root: '#065f46', rootText: WHITE, palette: ['#a7f3d0', '#6ee7b7'], text: '#064e3b', rootShape: 'octagon', shape: 'rect', line: 'circuit' },
  { id: 'paper', ko: '종이 스케치', en: 'Paper Sketch', root: '#fef9c3', rootText: '#44403c', palette: ['#fffbeb', '#fef3c7'], text: '#44403c', rootShape: 'note', shape: 'note', line: 'pencil' },
  { id: 'mono', ko: '흑백', en: 'Monochrome', root: '#111827', rootText: WHITE, palette: ['#e5e7eb', '#d1d5db'], text: '#111827', rootShape: 'rect', shape: 'rect', line: 'mono' },
  { id: 'candy', ko: '사탕', en: 'Candy', root: '#ec4899', rootText: WHITE, palette: ['#fbcfe8', '#a5f3fc', '#fef08a', '#c4b5fd'], text: '#831843', rootShape: 'stadium', shape: 'stadium', line: 'beads' },
  { id: 'coffee', ko: '커피', en: 'Coffee', root: '#5b3a21', rootText: WHITE, palette: ['#e7d3bd', '#d6bfa3', '#f0e4d4'], text: '#3f2a18', rootShape: 'rounded', shape: 'rounded', line: 'roots' },
  { id: 'spring', ko: '봄꽃', en: 'Spring Blossom', root: '#db2777', rootText: WHITE, palette: ['#fbcfe8', '#fecdd3', '#d9f99d', '#fef9c3'], text: '#831843', rootShape: 'ellipse', shape: 'ellipse', line: 'curveArrow' },
  { id: 'technical', ko: '기술 도면', en: 'Technical Drawing', root: '#0f766e', rootText: WHITE, palette: ['#ccfbf1', '#e2e8f0'], text: '#134e4a', rootShape: 'parallelogram', shape: 'parallelogram', line: 'technical' },
]

export const diagramThemeById = (id: string | undefined): DiagramTheme => DIAGRAM_THEMES.find((item) => item.id === id) ?? DIAGRAM_THEMES[0]
export const isDiagramThemeId = (id: unknown): id is string => DIAGRAM_THEMES.some((item) => item.id === id)
