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
/** A theme's id (see themes.ts). */
export type ThemeMode = string
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

/** How a memo looks and where it is, relative to its usual place. */
export interface MemoStyle {
  color: string
  textColor: string
  width: number
  height: number
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  dx: number
  dy: number
  /** The line that ties it to its shape or line. */
  lineColor: string
  lineWidth: number
  linePattern: LinePattern | 'none'
}

export type MemoTarget = { kind: 'node' | 'edge'; id: string }

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
  noteStyle?: Partial<MemoStyle>
  /** An icon from nodeIcons.ts, drawn before the text. */
  icon?: string
  /** A picture on the canvas: this node shows it instead of a shape. */
  image?: { src: string; width: number; height: number }
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
  /** Thickness in pixels; absent is the usual look. */
  width?: number
  /** Optional memo attached to the line. */
  note?: string
  noteStyle?: Partial<MemoStyle>
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
  /** All the selected edges, when Ctrl or Shift has added some; includes selectedEdgeId. */
  selectedEdgeIds?: string[]
  /** The line theme last applied to the whole diagram; new connectors follow it. */
  lineTheme?: string
  /** The mind map theme last applied; new shapes follow it. */
  diagramTheme?: string
  filePath: string | null
  dirty: boolean
}

export interface ContextMenuState {
  x: number
  y: number
  canvasX: number
  canvasY: number
  nodeId: string | null
  visible: boolean
}
