export type DiagramMode = 'mindmap' | 'fishbone'
export type LayoutDirection = 'radial' | 'ltr' | 'rtl' | 'ttb' | 'btt'
export type ShapeType =
  | 'rounded'
  | 'rect'
  | 'ellipse'
  | 'diamond'
  | 'parallelogram'
  | 'hexagon'
  | 'octagon'
  | 'stadium'
  | 'cylinder'
  | 'trapezoid'
  | 'chevron'
  | 'note'
export type LineType = 'curve' | 'straight' | 'elbow' | 'root'
export type LinePattern = 'solid' | 'dashed' | 'dotted' | 'dashdot'
export type EndCap = 'none' | 'arrow' | 'dot' | 'diamond'
export type ThemeMode = 'light' | 'dark' | 'midnight' | 'forest' | 'sunset' | 'ocean'

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'midnight', 'forest', 'sunset', 'ocean']
export type Locale = 'ko' | 'en'
export type TextFont = 'outfit' | 'notoSansKr' | 'serif' | 'mono'

export interface TextStyle {
  /** A preset keyword (see TextFont) or any installed system font family name. */
  fontFamily: string
  /** Text size in px. */
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
}

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
  textStyle?: TextStyle
  /** Optional free-form memo attached to the shape. */
  note?: string
  /** Fishbone: category / cause / effect */
  role?: 'effect' | 'category' | 'cause'
}

/** Which face of a node a connector attaches to; 'auto' picks it by geometry. */
export type EdgeSide = 'auto' | 'top' | 'bottom' | 'left' | 'right'

export interface DiagramEdge {
  id: string
  from: string
  to: string
  lineType: LineType
  linePattern: LinePattern
  color: string
  startCap?: EndCap
  endCap?: EndCap
  /** Manual override of the connection face at the from/to node. */
  fromSide?: EdgeSide
  toSide?: EdgeSide
}

export interface DiagramDocument {
  version: 1
  mode: DiagramMode
  layout: LayoutDirection
  defaultShape: ShapeType
  defaultLine: LineType
  defaultLinePattern: LinePattern
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  /** Primary selection (drives the properties panel). */
  selectedId: string | null
  /** Full selection set (marquee / multi-select); includes selectedId. */
  selectedIds: string[]
  /** Independently selected edge (mutually exclusive with node selection). */
  selectedEdgeId: string | null
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
  canvasX: number
  canvasY: number
  nodeId: string | null
  visible: boolean
}
