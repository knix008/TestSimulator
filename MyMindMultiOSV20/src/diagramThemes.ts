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
  /** The main branches. */
  shape: ShapeType
  /** What grows on them, when it differs from the main branches. */
  outer?: ShapeType
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
  { id: 'pastel', ko: '파스텔', en: 'Pastel', root: '#f9a8d4', rootText: INK, palette: ['#fbcfe8', '#bfdbfe', '#bbf7d0', '#fef08a', '#ddd6fe'], text: INK, rootShape: 'ellipse', shape: 'stadium', outer: 'cloud', line: 'pastel' },
  { id: 'forest', ko: '숲', en: 'Forest', root: '#166534', rootText: WHITE, palette: ['#86efac', '#a3e635', '#bbf7d0', '#d9f99d'], text: '#14532d', rootShape: 'hexagon', shape: 'rounded', line: 'roots' },
  { id: 'ocean', ko: '바다', en: 'Ocean', root: '#0c4a6e', rootText: WHITE, palette: ['#7dd3fc', '#67e8f9', '#99f6e4', '#bae6fd'], text: '#0c4a6e', rootShape: 'ellipse', shape: 'stadium', outer: 'wave', line: 'curveArrow' },
  { id: 'sunset', ko: '노을', en: 'Sunset', root: '#9a3412', rootText: WHITE, palette: ['#fdba74', '#fca5a5', '#f9a8d4', '#fde68a'], text: '#7c2d12', rootShape: 'rounded', shape: 'rounded', line: 'rainbow' },
  { id: 'neon', ko: '네온 밤', en: 'Neon Night', root: '#d946ef', rootText: WHITE, palette: ['#22d3ee', '#a3e635', '#f472b6', '#facc15'], text: '#0b1020', rootShape: 'hexagon', shape: 'chevron', line: 'neon', flat: true },
  { id: 'midnight', ko: '자정', en: 'Midnight', root: '#6366f1', rootText: WHITE, palette: ['#334155', '#3f3f6e', '#1e3a5f', '#44335f'], text: '#e2e8f0', rootShape: 'rounded', shape: 'rounded', line: 'mono', flat: true },
  { id: 'blueprint', ko: '청사진', en: 'Blueprint', root: '#1d4ed8', rootText: WHITE, palette: ['#dbeafe'], text: '#1e3a8a', rootShape: 'rect', shape: 'rect', line: 'blueprint' },
  { id: 'circuit', ko: '회로 기판', en: 'Circuit Board', root: '#065f46', rootText: WHITE, palette: ['#a7f3d0', '#6ee7b7'], text: '#064e3b', rootShape: 'octagon', shape: 'rect', line: 'circuit' },
  { id: 'paper', ko: '종이 스케치', en: 'Paper Sketch', root: '#fef9c3', rootText: '#44403c', palette: ['#fffbeb', '#fef3c7'], text: '#44403c', rootShape: 'note', shape: 'note', line: 'pencil' },
  { id: 'mono', ko: '흑백', en: 'Monochrome', root: '#111827', rootText: WHITE, palette: ['#e5e7eb', '#d1d5db'], text: '#111827', rootShape: 'rect', shape: 'rect', line: 'mono' },
  { id: 'candy', ko: '사탕', en: 'Candy', root: '#ec4899', rootText: WHITE, palette: ['#fbcfe8', '#a5f3fc', '#fef08a', '#c4b5fd'], text: '#831843', rootShape: 'stadium', shape: 'stadium', line: 'beads' },
  { id: 'coffee', ko: '커피', en: 'Coffee', root: '#5b3a21', rootText: WHITE, palette: ['#e7d3bd', '#d6bfa3', '#f0e4d4'], text: '#3f2a18', rootShape: 'rounded', shape: 'rounded', outer: 'plaque', line: 'roots' },
  { id: 'spring', ko: '봄꽃', en: 'Spring Blossom', root: '#db2777', rootText: WHITE, palette: ['#fbcfe8', '#fecdd3', '#d9f99d', '#fef9c3'], text: '#831843', rootShape: 'ellipse', shape: 'ellipse', outer: 'heart', line: 'curveArrow' },
  { id: 'technical', ko: '기술 도면', en: 'Technical Drawing', root: '#0f766e', rootText: WHITE, palette: ['#ccfbf1', '#e2e8f0'], text: '#134e4a', rootShape: 'parallelogram', shape: 'parallelogram', outer: 'cross', line: 'technical' },
  { id: 'lavender', ko: '라벤더', en: 'Lavender', root: '#5b21b6', rootText: WHITE, palette: ['#ddd6fe', '#e9d5ff', '#c7d2fe', '#f5d0fe'], text: '#3b0764', rootShape: 'ellipse', shape: 'ellipse', outer: 'stadium', line: 'pastel' },
  { id: 'citrus', ko: '시트러스', en: 'Citrus', root: '#c2410c', rootText: WHITE, palette: ['#fed7aa', '#fef08a', '#d9f99d', '#ffedd5'], text: '#431407', rootShape: 'hexagon', shape: 'stadium', outer: 'tag', line: 'flow' },
  { id: 'mint', ko: '민트', en: 'Mint', root: '#0f766e', rootText: WHITE, palette: ['#99f6e4', '#ccfbf1', '#a7f3d0'], text: '#134e4a', rootShape: 'stadium', shape: 'stadium', outer: 'ellipse', line: 'curveArrow' },
  { id: 'royal', ko: '왕실', en: 'Royal', root: '#4c1d95', rootText: '#fde68a', palette: ['#fde68a', '#ddd6fe', '#fef3c7'], text: '#3b0764', rootShape: 'octagon', shape: 'hexagon', outer: 'shield', line: 'technical' },
  { id: 'ruby', ko: '루비', en: 'Ruby', root: '#9f1239', rootText: WHITE, palette: ['#fecdd3', '#fda4af', '#ffe4e6'], text: '#4c0519', rootShape: 'diamond', shape: 'hexagon', outer: 'rounded', line: 'curveArrow' },
  { id: 'crystal', ko: '수정', en: 'Crystal', root: '#0e7490', rootText: WHITE, palette: ['#cffafe', '#e0f2fe', '#ddd6fe'], text: '#164e63', rootShape: 'diamond', shape: 'diamond', outer: 'pentagon', line: 'beads' },
  { id: 'storage', ko: '저장소', en: 'Data Store', root: '#1e40af', rootText: WHITE, palette: ['#bfdbfe', '#c7d2fe', '#a5f3fc'], text: '#1e3a8a', rootShape: 'cylinder', shape: 'cylinder', outer: 'folder', line: 'circuit' },
  { id: 'factory', ko: '공장', en: 'Factory', root: '#44403c', rootText: WHITE, palette: ['#d6d3d1', '#fde68a', '#e7e5e4'], text: '#292524', rootShape: 'trapezoid', shape: 'trapezoid', outer: 'snip', line: 'technical' },
  { id: 'signpost', ko: '이정표', en: 'Signpost', root: '#b45309', rootText: WHITE, palette: ['#fde68a', '#fed7aa', '#fef3c7'], text: '#451a03', rootShape: 'octagon', shape: 'chevron', outer: 'arrowRight', line: 'flow' },
  { id: 'process', ko: '공정 흐름', en: 'Process Flow', root: '#0369a1', rootText: WHITE, palette: ['#bae6fd', '#bfdbfe', '#e0f2fe'], text: '#0c4a6e', rootShape: 'chevron', shape: 'chevron', outer: 'arrowBoth', line: 'flow' },
  { id: 'sticky', ko: '메모 보드', en: 'Sticky Board', root: '#ca8a04', rootText: '#1c1917', palette: ['#fef08a', '#fbcfe8', '#bfdbfe', '#bbf7d0'], text: '#1c1917', rootShape: 'rect', shape: 'note', outer: 'callout', line: 'pencil', flat: true },
  { id: 'honeycomb', ko: '벌집', en: 'Honeycomb', root: '#92400e', rootText: WHITE, palette: ['#fde047', '#fcd34d', '#fef08a'], text: '#451a03', rootShape: 'hexagon', shape: 'hexagon', line: 'beads' },
  { id: 'retro', ko: '레트로', en: 'Retro', root: '#7c2d12', rootText: '#fef3c7', palette: ['#fdba74', '#5eead4', '#fde68a'], text: '#1c1917', rootShape: 'octagon', shape: 'trapezoid', outer: 'arrowLeft', line: 'mono' },
  { id: 'cyber', ko: '사이버', en: 'Cyber', root: '#0f172a', rootText: '#22d3ee', palette: ['#164e63', '#312e81', '#4a044e'], text: '#e0f2fe', rootShape: 'octagon', shape: 'parallelogram', outer: 'rect', line: 'neon', flat: true },
  { id: 'galaxy', ko: '은하', en: 'Galaxy', root: '#312e81', rootText: WHITE, palette: ['#1e1b4b', '#3b0764', '#172554'], text: '#e9d5ff', rootShape: 'ellipse', shape: 'ellipse', outer: 'star', line: 'neon', flat: true },
  { id: 'volcano', ko: '화산', en: 'Volcano', root: '#7f1d1d', rootText: '#fef2f2', palette: ['#450a0a', '#7c2d12', '#78350f'], text: '#fed7aa', rootShape: 'diamond', shape: 'trapezoid', outer: 'triangle', line: 'roots', flat: true },
  { id: 'deepSea', ko: '심해', en: 'Deep Sea', root: '#042f2e', rootText: '#5eead4', palette: ['#134e4a', '#164e63', '#1e3a5f'], text: '#ccfbf1', rootShape: 'cylinder', shape: 'ellipse', outer: 'stadium', line: 'curveArrow', flat: true },
  { id: 'slate', ko: '슬레이트', en: 'Slate', root: '#334155', rootText: WHITE, palette: ['#e2e8f0', '#cbd5e1'], text: '#0f172a', rootShape: 'rect', shape: 'trapezoid', outer: 'rounded', line: 'circuit' },
  { id: 'autumn', ko: '단풍', en: 'Autumn Leaves', root: '#991b1b', rootText: WHITE, palette: ['#fecaca', '#fed7aa', '#fde68a', '#d9f99d'], text: '#450a0a', rootShape: 'ellipse', shape: 'hexagon', outer: 'rounded', line: 'roots' },
  { id: 'winter', ko: '겨울', en: 'Winter', root: '#1e3a8a', rootText: WHITE, palette: ['#e0f2fe', '#f1f5f9', '#dbeafe'], text: '#172554', rootShape: 'octagon', shape: 'octagon', outer: 'triangleDown', line: 'pencil' },
  { id: 'tropical', ko: '열대', en: 'Tropical', root: '#be123c', rootText: WHITE, palette: ['#fda4af', '#5eead4', '#fde047', '#7dd3fc'], text: '#042f2e', rootShape: 'stadium', shape: 'ellipse', outer: 'stadium', line: 'rainbow' },
  { id: 'chalkboard', ko: '칠판', en: 'Chalkboard', root: '#14532d', rootText: WHITE, palette: ['#1f3d2b', '#22402f', '#2b4a3a'], text: '#f0fdf4', rootShape: 'rect', shape: 'rect', outer: 'rounded', line: 'pencil', flat: true },
  { id: 'newspaper', ko: '신문', en: 'Newspaper', root: '#0c0a09', rootText: WHITE, palette: ['#f5f5f4', '#e7e5e4'], text: '#0c0a09', rootShape: 'rect', shape: 'note', outer: 'document', line: 'mono' },
  { id: 'origami', ko: '종이접기', en: 'Origami', root: '#a21caf', rootText: WHITE, palette: ['#f5d0fe', '#fbcfe8', '#bae6fd', '#fef08a'], text: '#4a044e', rootShape: 'chevron', shape: 'parallelogram', outer: 'note', line: 'beads' },
]

export const diagramThemeById = (id: string | undefined): DiagramTheme => DIAGRAM_THEMES.find((item) => item.id === id) ?? DIAGRAM_THEMES[0]
export const isDiagramThemeId = (id: unknown): id is string => DIAGRAM_THEMES.some((item) => item.id === id)
