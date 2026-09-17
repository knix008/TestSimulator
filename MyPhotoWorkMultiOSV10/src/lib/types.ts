import type { Theme as ThemeId } from '../themes'

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

export type GradientKind = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond'
export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'polygon' | 'line' | 'star' | 'heart' | 'arrow'
export type FillKind = 'solid' | 'gradient' | 'pattern'

export type Tool =
  | 'move'
  | 'artboard'
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
  fill?: FillData
  text?: TextData
  shape?: ShapeData
  effects: LayerEffects
}

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
  colorMode: 'rgb' | 'gray'
}

export type SerializedLayer = LayerMeta & { dataUrl?: string; maskUrl?: string }

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
  colorMode?: 'rgb' | 'gray'
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
  brushSize: number
  brushHardness: number
  brushOpacity: number
  fillTolerance: number
  foreground: string
  background: string
  gradientKind: GradientKind
  rightTab: 'layers' | 'adjust' | 'history' | 'channels' | 'info'
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
})

export const defaultSettings: AppSettings = {
  language: 'ko',
  theme: 'dark',
  zoom: 1,
  showGrid: false,
  showRulers: true,
  rightWidth: 320,
  exportFormat: 'png',
  brushSize: 24,
  brushHardness: 0.75,
  brushOpacity: 1,
  fillTolerance: 32,
  foreground: '#1d4ed8',
  background: '#ffffff',
  gradientKind: 'linear',
  rightTab: 'layers',
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
