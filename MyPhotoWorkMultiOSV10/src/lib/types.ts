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
export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'polygon' | 'line' | 'star' | 'heart' | 'arrow' | 'triangle' | 'custom'
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
  | 'liquify'

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
  shadowOpacity?: number
  shadowSpread?: number
  innerShadow?: boolean
  innerShadowColor?: string
  innerShadowOpacity?: number
  innerShadowBlur?: number
  innerShadowX?: number
  innerShadowY?: number
  stroke: boolean
  strokeColor: string
  strokeWidth: number
  strokePosition?: 'outside' | 'inside' | 'center'
  strokeOpacity?: number
  colorOverlay: boolean
  overlayColor: string
  overlayOpacity: number
  overlayBlend?: BlendMode
  innerGlow: boolean
  innerGlowColor?: string
  innerGlowSize?: number
  innerGlowOpacity?: number
  outerGlow: boolean
  glowColor?: string
  glowSize?: number
  glowOpacity?: number
  bevel: boolean
  bevelStyle?: 'inner' | 'outer' | 'emboss' | 'pillow'
  bevelDepth?: number
  bevelSize?: number
  bevelAngle?: number
  bevelSoften?: number
  bevelHighlight?: string
  bevelShadow?: string
  satin?: boolean
  satinColor?: string
  satinOpacity?: number
  satinDistance?: number
  satinSize?: number
  gradientOverlay?: boolean
  gradientFrom?: string
  gradientTo?: string
  gradientAngle?: number
  gradientOpacity?: number
  gradientStyle?: 'linear' | 'radial'
  patternOverlay?: boolean
  patternId?: string
  patternOpacity?: number
  patternScale?: number
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
  underline?: boolean
  strike?: boolean
  allCaps?: boolean
  baselineShift?: number
  antiAlias?: 'none' | 'sharp' | 'crisp' | 'strong' | 'smooth'
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
  /** A defined custom shape: its outline as fractions of the box, 0..1. */
  outline?: PathNode[]
  outlineClosed?: boolean
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
  extra?: number
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
  /** Layers that move together; every member carries the same group id. */
  linkId?: string
  lockTransparent?: boolean
  lockPosition?: boolean
  /** A placed file's path, for Place Linked and Replace Contents. */
  sourcePath?: string
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
export type Artboard = { id: string; name: string; x: number; y: number; width: number; height: number }
export type MeasurementEntry = { id: string; label: string; width: number; height: number; area: number; distance?: number; angle?: number; count?: number; at: string }
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
  artboards?: Artboard[]
  measurements?: MeasurementEntry[]
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
  artboards?: Artboard[]
  measurements?: MeasurementEntry[]
}

export type Selection = {
  kind: 'rect' | 'ellipse' | 'mask'
  x: number
  y: number
  width: number
  height: number
  mask?: Uint8Array
}

export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect'
export type CropRatio = 'free' | '1:1' | '4:3' | '3:2' | '16:9' | 'original'
export type ToneRange = 'shadows' | 'midtones' | 'highlights'
export type PanelTab =
  | 'layers' | 'adjust' | 'history' | 'channels' | 'actions' | 'timeline' | 'info'
  | 'properties' | 'navigator' | 'color' | 'swatches' | 'gradients' | 'patterns' | 'styles' | 'shapes'
  | 'brushes' | 'cloneSource' | 'toolPresets' | 'character' | 'paragraph' | 'glyphs' | 'comps' | 'measurementLog' | 'notes' | 'paths'

export const panelTabs: PanelTab[] = [
  'layers', 'properties', 'adjust', 'history', 'channels', 'paths', 'navigator', 'info', 'color', 'swatches', 'gradients', 'patterns', 'styles', 'shapes',
  'brushes', 'cloneSource', 'toolPresets', 'character', 'paragraph', 'glyphs', 'actions', 'comps', 'timeline', 'measurementLog', 'notes',
]

export type ToolPreset = { id: string; name: string; tool: Tool; values: Record<string, unknown> }
export type StylePreset = { id: string; name: string; effects: LayerEffects }
export type CustomShapeDef = { id: string; name: string; outline: PathNode[]; closed: boolean }
export type Workspace = { id: string; name: string; rightTab: PanelTab; rightWidth: number; showRulers: boolean; showGrid: boolean }

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
  rightTab: PanelTab
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
  /* ---- added for Photoshop parity ---- */
  selectionMode: SelectionMode
  marqueeFeather: number
  antiAlias: boolean
  cropRatio: CropRatio
  mixerWet: number
  mixerMix: number
  mixerFlow: number
  artHistoryStyle: 'dab' | 'tight' | 'loose'
  liquifyMode: 'forward' | 'twirlCw' | 'twirlCcw' | 'pucker' | 'bloat' | 'reconstruct' | 'freeze' | 'thaw'
  liquifyPressure: number
  gradientId: string
  gradientReverse: boolean
  gradientDither: boolean
  gradients: { id: string; name: string; stops: { position: number; color: string }[]; opacityStops: { position: number; opacity: number }[] }[]
  swatches: string[]
  customShapeKind: string
  customShapes: CustomShapeDef[]
  historyStates: number
  recentFiles: string[]
  showGuides: boolean
  snapEnabled: boolean
  snapToGuides: boolean
  snapToGrid: boolean
  smartGuides: boolean
  lockGuides: boolean
  showPixelGrid: boolean
  showSlices: boolean
  showNotes: boolean
  extras: boolean
  proofColors: boolean
  gamutWarning: boolean
  rulerUnits: 'px' | 'in' | 'cm' | 'mm' | 'pt'
  toolPresets: ToolPreset[]
  styles: StylePreset[]
  wandContiguous: boolean
  sampleAllLayers: boolean
  toneRange: ToneRange
  eyedropperSample: 1 | 3 | 5
  cloneAligned: boolean
  patternImpressionist: boolean
  workspaces: Workspace[]
  shortcuts: Record<string, string>
  patternPreview: boolean
  paintTarget: 'layer' | 'mask'
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
  shadowOpacity: 0.75,
  shadowSpread: 0,
  innerShadow: false,
  innerShadowColor: '#000000',
  innerShadowOpacity: 0.75,
  innerShadowBlur: 8,
  innerShadowX: 4,
  innerShadowY: 4,
  stroke: false,
  strokeColor: '#ffffff',
  strokeWidth: 2,
  strokePosition: 'outside',
  strokeOpacity: 1,
  colorOverlay: false,
  overlayColor: '#ffffff',
  overlayOpacity: 0.35,
  overlayBlend: 'source-over',
  innerGlow: false,
  innerGlowColor: '#ffffbe',
  innerGlowSize: 7,
  innerGlowOpacity: 0.75,
  outerGlow: false,
  glowColor: '#7dd3fc',
  glowSize: 18,
  glowOpacity: 0.9,
  bevel: false,
  bevelStyle: 'inner',
  bevelDepth: 100,
  bevelSize: 6,
  bevelAngle: 120,
  bevelSoften: 0,
  bevelHighlight: '#ffffff',
  bevelShadow: '#000000',
  satin: false,
  satinColor: '#000000',
  satinOpacity: 0.5,
  satinDistance: 8,
  satinSize: 12,
  gradientOverlay: false,
  gradientFrom: '#000000',
  gradientTo: '#ffffff',
  gradientAngle: 90,
  gradientOpacity: 1,
  gradientStyle: 'linear',
  patternOverlay: false,
  patternId: undefined,
  patternOpacity: 1,
  patternScale: 1,
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
  selectionMode: 'new',
  marqueeFeather: 0,
  antiAlias: true,
  cropRatio: 'free',
  mixerWet: 0.5,
  mixerMix: 0.6,
  mixerFlow: 0.8,
  artHistoryStyle: 'tight',
  liquifyMode: 'forward',
  liquifyPressure: 0.6,
  gradientId: 'fgBg',
  gradientReverse: false,
  gradientDither: false,
  gradients: [],
  swatches: ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78350f'],
  customShapeKind: 'star',
  customShapes: [],
  historyStates: 50,
  recentFiles: [],
  showGuides: true,
  snapEnabled: true,
  snapToGuides: true,
  snapToGrid: false,
  smartGuides: true,
  lockGuides: false,
  showPixelGrid: false,
  showSlices: true,
  showNotes: true,
  extras: true,
  proofColors: false,
  gamutWarning: false,
  rulerUnits: 'px',
  toolPresets: [],
  styles: [],
  wandContiguous: true,
  sampleAllLayers: false,
  toneRange: 'midtones',
  eyedropperSample: 1,
  cloneAligned: true,
  patternImpressionist: false,
  workspaces: [],
  shortcuts: {},
  patternPreview: false,
  paintTarget: 'layer',
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
