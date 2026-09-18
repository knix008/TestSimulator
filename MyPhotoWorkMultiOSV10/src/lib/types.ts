import type { Theme as ThemeId } from '../themes'
import type { SourceInfo } from './metadata'

export type Language = 'ko' | 'en'
export type Theme = ThemeId
export type LayerKind = 'raster' | 'adjustment' | 'fill' | 'text' | 'shape' | 'group'
export type AdjustmentType =
  | 'brightness'
  | 'levels'
  | 'curves'
  | 'hue'
  | 'colorBalance'
  | 'vibrance'
  | 'bw'
  | 'invert'
  | 'posterize'
  | 'threshold'
  | 'exposure'
  | 'photoFilter'
  | 'clarity'
  | 'dehaze'
  | 'grain'
  | 'colorLookup'
  | 'shadowsHighlights'
  | 'channelMixer'
  | 'selectiveColor'
  | 'gradientMap'
  | 'equalize'

export type GradientKind = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'
export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'polygon' | 'line' | 'star' | 'heart' | 'arrow'
export type FillKind = 'solid' | 'gradient' | 'pattern'

export type Tool =
  | 'move'
  | 'artboard'
  | 'puppet'
  | 'marquee'
  | 'ellipseMarquee'
  | 'rowMarquee'
  | 'colMarquee'
  | 'lasso'
  | 'polyLasso'
  | 'magneticLasso'
  | 'objectSelect'
  | 'quickSelect'
  | 'wand'
  | 'crop'
  | 'perspectiveCrop'
  | 'slice'
  | 'sliceSelect'
  | 'frame'
  | 'eyedropper'
  | 'sampler'
  | 'ruler'
  | 'note'
  | 'count'
  | 'spotHeal'
  | 'remove'
  | 'heal'
  | 'patch'
  | 'contentMove'
  | 'redEye'
  | 'brush'
  | 'pencil'
  | 'colorReplace'
  | 'mixer'
  | 'clone'
  | 'patternStamp'
  | 'historyBrush'
  | 'artHistory'
  | 'eraser'
  | 'bgEraser'
  | 'magicEraser'
  | 'gradient'
  | 'fill'
  | 'blurTool'
  | 'sharpenTool'
  | 'smudge'
  | 'dodge'
  | 'burn'
  | 'sponge'
  | 'pen'
  | 'freeformPen'
  | 'curvaturePen'
  | 'pathSelect'
  | 'directSelect'
  | 'text'
  | 'vtext'
  | 'textMask'
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'polygon'
  | 'line'
  | 'customShape'
  | 'hand'
  | 'rotateView'
  | 'zoom'

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'lighter'
  | 'xor'

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'avif' | 'gif' | 'tiff'

/** Offered in the export dialog and in settings, in this order. */
export const exportFormats: ExportFormat[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff']

/** Which way round the paper goes. `auto` leaves it to the print dialog. */
export type PageOrientation = 'auto' | 'portrait' | 'landscape'
export type UnsavedChoice = 'save' | 'discard' | 'cancel'
export type Point = { x: number; y: number }
export type Size = { width: number; height: number }

export type LayerEffects = {
  dropShadow: boolean
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
  stroke: boolean
  strokeColor: string
  strokeWidth: number
  colorOverlay: boolean
  overlayColor: string
  overlayOpacity: number
  innerGlow: boolean
  outerGlow: boolean
  bevel: boolean
}

export type Adjustment = {
  type: AdjustmentType
  brightness: number
  contrast: number
  hue: number
  saturation: number
  lightness: number
  vibrance: number
  temperature: number
  tint: number
  exposure: number
  gamma: number
  shadows: number
  highlights: number
  blacks: number
  whites: number
  clarity: number
  dehaze: number
  grain: number
  posterize: number
  threshold: number
  filterColor: string
  filterDensity: number
  red: number
  green: number
  blue: number
  /** Channel mixer: how much of each input channel feeds each output one. */
  mix?: ChannelMix
  /** Selective colour: which family is being shifted, and by how much ink. */
  family?: ColorFamily
  ink?: InkShift
  /** Gradient map: the two ends of the ramp the brightness is read into. */
  mapFrom?: string
  mapTo?: string
}

/** Percentages, one row per output channel. */
export type ChannelMix = {
  red: { r: number; g: number; b: number; constant: number }
  green: { r: number; g: number; b: number; constant: number }
  blue: { r: number; g: number; b: number; constant: number }
}

export type ColorFamily = 'reds' | 'yellows' | 'greens' | 'cyans' | 'blues' | 'magentas' | 'whites' | 'neutrals' | 'blacks'

export type InkShift = { cyan: number; magenta: number; yellow: number; black: number }

/** The shapes text can be bent into, and how far. */
export type TextWarpStyle =
  | 'none' | 'arc' | 'arcLower' | 'arcUpper' | 'arch' | 'bulge' | 'flag' | 'wave' | 'fish' | 'rise' | 'squeeze'

export const warpStyles: TextWarpStyle[] = [
  'none', 'arc', 'arcLower', 'arcUpper', 'arch', 'bulge', 'flag', 'wave', 'fish', 'rise', 'squeeze',
]

export type TextWarp = {
  style: TextWarpStyle
  /** -100..100. */
  bend: number
  horizontal: number
  vertical: number
}

export type TextData = {
  text: string
  x: number
  y: number
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  vertical: boolean
  /** Paragraph settings; older projects leave them out and take the defaults. */
  lineHeight?: number
  letterSpacing?: number
  indent?: number
  paragraphSpacing?: number
  warp?: TextWarp
  /** Set when the type runs along a path instead of a straight baseline. */
  pathId?: string
  pathOffset?: number
}

export type ShapeData = {
  kind: ShapeKind
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  sides: number
  radius: number
}

export type FillData = {
  kind: FillKind
  color: string
  gradientKind: GradientKind
  start: Point
  end: Point
  endColor: string
  /** Which defined pattern a pattern fill repeats. */
  patternId?: string
}

/**
 * One filter in a layer's non-destructive stack. The pixels are never touched:
 * the stack is re-run every time the document is composited, so a filter can be
 * switched off, re-ordered or re-tuned at any point.
 */
export type SmartFilter = {
  id: string
  /** The filter's id in the gallery catalog. */
  filter: string
  enabled: boolean
  radius: number
  amount: number
}

/** What a smart object remembers so a resize can be undone without loss. */
export type SmartTransform = {
  /** The size the placed copy is drawn at, as a fraction of the original. */
  scaleX: number
  scaleY: number
  rotate: number
  x: number
  y: number
}

export type LayerMeta = {
  id: string
  name: string
  visible: boolean
  opacity: number
  fillOpacity: number
  blendMode: BlendMode
  locked: boolean
  kind: LayerKind
  clipped: boolean
  maskEnabled: boolean
  smart: boolean
  parentId?: string
  adjustment?: Adjustment
  curves?: CurveData
  levels?: LevelsData
  fill?: FillData
  text?: TextData
  shape?: ShapeData
  effects: LayerEffects
  /** Set on a group folder that is collapsed in the layers panel. */
  collapsed?: boolean
  /** Re-applied on every composite, in order, when the layer is smart. */
  smartFilters?: SmartFilter[]
  /** How the smart object's untouched source is placed into the document. */
  smartTransform?: SmartTransform
  /** Set on a 3D layer; the mesh is built from the text or shape it carries. */
  threeD?: ThreeDData
}

/** A 3D layer: a flat outline given depth, lit and turned in space. */
export type ThreeDData = {
  depth: number
  rotateX: number
  rotateY: number
  rotateZ: number
  /** Where the light comes from, in the same space as the mesh. */
  lightX: number
  lightY: number
  lightZ: number
  color: string
  /** Perspective strength, 0 for an orthographic view. */
  perspective: number
}

/** A stored selection, kept alongside the layers as Photoshop keeps channels. */
export type AlphaChannel = {
  id: string
  name: string
  /** One byte per pixel; 255 is fully selected. */
  mask: Uint8Array
}

/** A remembered arrangement of the layers, restored in one click. */
export type LayerComp = {
  id: string
  name: string
  states: { layerId: string; visible: boolean; opacity: number; blendMode: BlendMode }[]
}

/** One frame of a frame-by-frame animation: which layers it shows, and for how long. */
export type AnimationFrame = {
  id: string
  delayMs: number
  visible: Record<string, boolean>
}

/** A tile that a fill layer or the pattern stamp can repeat. */
export type PatternDef = {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
}

/** A saved brush tip, from the Brushes panel. */
export type BrushPreset = {
  id: string
  name: string
  size: number
  hardness: number
  opacity: number
  spacing: number
  angle: number
  roundness: number
  scatter: number
}

/** One recorded command, with the dialog answer it was given. */
export type ActionStep = {
  command: string
  dialog?: string
  result?: Record<string, unknown>
}

export type ActionScript = {
  id: string
  name: string
  steps: ActionStep[]
}

/** One anchor of a vector path. The handles are absolute document coordinates. */
export type PathNode = { x: number; y: number; inX: number; inY: number; outX: number; outY: number }
export type PathShape = { id: string; name: string; nodes: PathNode[]; closed: boolean }

export type SliceRect = { id: string; name: string; x: number; y: number; width: number; height: number }
export type FrameRect = { id: string; name: string; x: number; y: number; width: number; height: number; layerId?: string }
export type Measure = { x1: number; y1: number; x2: number; y2: number }

/** Free transform state: the destination box the layer's original pixels map onto. */
export type TransformBox = { x: number; y: number; width: number; height: number; angle: number; flipX: boolean; flipY: boolean }
export type TransformHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'move'

export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'
export type CurvePoint = { x: number; y: number }
export type CurveData = Record<CurveChannel, CurvePoint[]>
export type LevelsData = { black: number; gamma: number; white: number; outBlack: number; outWhite: number }

export type Guide = { id: string; axis: 'x' | 'y'; position: number }
export type NoteMarker = { id: string; x: number; y: number; text: string }
export type Sampler = { id: string; x: number; y: number }
export type CountMarker = { id: string; x: number; y: number; n: number }

export type PhotoDocument = {
  name: string
  width: number
  height: number
  background: 'transparent' | string
  layers: LayerMeta[]
  activeLayerId: string
  filePath?: string
  guides: Guide[]
  notes: NoteMarker[]
  samplers: Sampler[]
  counts: CountMarker[]
  paths: PathShape[]
  slices: SliceRect[]
  frames: FrameRect[]
  measure: Measure | null
  colorMode: ColorMode
  /** What the document was opened from, for the image information window. */
  source?: SourceInfo
  /** Saved selections, the way a channels palette keeps them. */
  channels?: AlphaChannel[]
  /** Remembered layer arrangements. */
  comps?: LayerComp[]
  /** Frame-by-frame animation, if this document has one. */
  animation?: AnimationFrame[]
  /** Tiles defined from this document, available to fills and the stamp. */
  patterns?: PatternDef[]
  /** 8 bits per channel unless the document was opened from deeper data. */
  depth?: 8 | 16
  /** The working colour space, by name; see lib/colorModes.ts. */
  profile?: string
}

/**
 * The colour space the document is edited in. RGB is the working space;
 * greyscale, CMYK and Lab are conversions applied when the document is
 * composited, so the layers themselves stay RGBA.
 */
export type ColorMode = 'rgb' | 'gray' | 'cmyk' | 'lab'

export const colorModes: ColorMode[] = ['rgb', 'gray', 'cmyk', 'lab']

export type SerializedLayer = LayerMeta & { dataUrl?: string; maskUrl?: string }

export type { MetaRow, SourceInfo } from './metadata'

export type ProjectFile = {
  format: 'myphotowork'
  version: 1 | 2
  name: string
  width: number
  height: number
  background: 'transparent' | string
  activeLayerId: string
  layers: SerializedLayer[]
  guides?: Guide[]
  notes?: NoteMarker[]
  samplers?: Sampler[]
  counts?: CountMarker[]
  paths?: PathShape[]
  slices?: SliceRect[]
  frames?: FrameRect[]
  measure?: Measure | null
  colorMode?: ColorMode
  /** Saved selections, as greyscale PNG data URLs. */
  channels?: { id: string; name: string; dataUrl: string }[]
  comps?: LayerComp[]
  animation?: AnimationFrame[]
  patterns?: PatternDef[]
  depth?: 8 | 16
  profile?: string
}

export type Selection = {
  kind: 'rect' | 'ellipse' | 'mask'
  x: number
  y: number
  width: number
  height: number
  mask?: Uint8Array
}

export type AppSettings = {
  language: Language
  theme: Theme
  zoom: number
  showGrid: boolean
  showRulers: boolean
  rightWidth: number
  exportFormat: ExportFormat
  /** Keep see-through pixels see-through when the format can store them. */
  exportTransparent: boolean
  brushSize: number
  brushHardness: number
  brushOpacity: number
  fillTolerance: number
  foreground: string
  background: string
  gradientKind: GradientKind
  rightTab: 'layers' | 'adjust' | 'history' | 'channels' | 'actions' | 'timeline' | 'info'
  /** Recorded command sequences, replayable and usable on a folder of files. */
  actions: ActionScript[]
  /** Saved brush tips, and the shape the brush is set to now. */
  brushes: BrushPreset[]
  brushSpacing: number
  brushAngle: number
  brushRoundness: number
  brushScatter: number
  /** Shape tools. */
  shapeStroke: number
  shapeSides: number
  shapeCorner: number
  shapeFilled: boolean
  /** Pen tools: width used when stroking a path. */
  pathWidth: number
  /** Magnetic lasso: how far from the cursor to look for an edge. */
  magneticWidth: number
  /** Slice/frame tools draw guides only; this is the label prefix. */
  showPaths: boolean
}

export type ErrorDetails = { title: string; message: string; details: string }

export const blendModes: BlendMode[] = [
  'source-over',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'lighter',
  'xor',
]

export const defaultEffects = (): LayerEffects => ({
  dropShadow: false,
  shadowColor: '#000000',
  shadowBlur: 12,
  shadowX: 6,
  shadowY: 8,
  stroke: false,
  strokeColor: '#ffffff',
  strokeWidth: 2,
  colorOverlay: false,
  overlayColor: '#ffffff',
  overlayOpacity: 0.35,
  innerGlow: false,
  outerGlow: false,
  bevel: false,
})

export const defaultAdjustment = (type: AdjustmentType): Adjustment => ({
  type,
  brightness: 0,
  contrast: 0,
  hue: 0,
  saturation: 0,
  lightness: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  exposure: 0,
  gamma: 1,
  shadows: 0,
  highlights: 0,
  blacks: 0,
  whites: 0,
  clarity: 0,
  dehaze: 0,
  grain: 0,
  posterize: 8,
  threshold: 128,
  filterColor: '#ff9900',
  filterDensity: 0.25,
  red: 0,
  green: 0,
  blue: 0,
  mix: {
    red: { r: 100, g: 0, b: 0, constant: 0 },
    green: { r: 0, g: 100, b: 0, constant: 0 },
    blue: { r: 0, g: 0, b: 100, constant: 0 },
  },
  family: 'reds',
  ink: { cyan: 0, magenta: 0, yellow: 0, black: 0 },
  mapFrom: '#10203a',
  mapTo: '#f2d9a0',
})

/** An identity curve per channel: two endpoints on the diagonal. */
export const defaultCurves = (): CurveData => ({
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  b: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
})

export const defaultLevels = (): LevelsData => ({ black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 })

export const shapeTools: Tool[] = ['rect', 'roundRect', 'ellipse', 'polygon', 'line', 'customShape']
export const penTools: Tool[] = ['pen', 'freeformPen', 'curvaturePen']

/** Which ShapeKind each shape tool draws. */
export const shapeKindForTool: Partial<Record<Tool, ShapeKind>> = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  polygon: 'polygon',
  line: 'line',
  customShape: 'star',
}

export const rightPanelMinWidth = 280
export const rightPanelMaxWidth = 480

export const defaultSettings: AppSettings = {
  language: 'ko',
  theme: 'dark',
  zoom: 1,
  showGrid: false,
  showRulers: true,
  rightWidth: 320,
  exportFormat: 'png',
  exportTransparent: true,
  actions: [],
  brushes: [],
  brushSpacing: 0.25,
  brushAngle: 0,
  brushRoundness: 1,
  brushScatter: 0,
  brushSize: 24,
  brushHardness: 0.75,
  brushOpacity: 1,
  fillTolerance: 32,
  foreground: '#1d4ed8',
  background: '#ffffff',
  gradientKind: 'linear',
  rightTab: 'layers',
  shapeStroke: 2,
  shapeSides: 5,
  shapeCorner: 12,
  shapeFilled: true,
  pathWidth: 2,
  magneticWidth: 12,
  showPaths: true,
}

export const documentPresets: { id: string; width: number; height: number }[] = [
  { id: 'webHd', width: 1280, height: 720 },
  { id: 'fullHd', width: 1920, height: 1080 },
  { id: 'square', width: 1080, height: 1080 },
  { id: 'story', width: 1080, height: 1920 },
  { id: 'photo', width: 1600, height: 1200 },
  { id: 'a4', width: 2480, height: 3508 },
  { id: 'print4k', width: 3840, height: 2160 },
  { id: 'instagram', width: 1080, height: 1350 },
]
