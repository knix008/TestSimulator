export type DiagramMode = 'mindmap' | 'fishbone'
export type LayoutDirection = 'radial' | 'ltr' | 'rtl'
export type ShapeType = 'rounded' | 'rect' | 'ellipse' | 'diamond' | 'parallelogram'
export type LineType = 'solid' | 'dashed' | 'dotted' | 'curve'
export type ThemeMode = 'light' | 'dark'
export type Locale = 'ko' | 'en'

export interface DiagramNode {
  id: string
  parentId: string | null
  text: string
  x: number
  y: number
  width: number
  height: number
  shape: ShapeType
  color: string
  /** Fishbone: category / cause / effect */
  role?: 'effect' | 'category' | 'cause'
}

export interface DiagramEdge {
  id: string
  from: string
  to: string
  lineType: LineType
  color: string
}

export interface DiagramDocument {
  version: 1
  mode: DiagramMode
  layout: LayoutDirection
  defaultShape: ShapeType
  defaultLine: LineType
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  selectedId: string | null
  filePath: string | null
  dirty: boolean
}

export interface AppSettings {
  locale: Locale
  theme: ThemeMode
  showGrid: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  nodeId: string | null
  visible: boolean
}
