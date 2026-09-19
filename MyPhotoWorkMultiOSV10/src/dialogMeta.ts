import type { ComponentType } from 'react'
import {
  Aperture, Blend, BookOpen, Box, Camera, Compass, Crop, Download, Droplets, FilePlus, Frame, Grid3x3, History, Info, Keyboard,
  LayoutGrid, Layers2, Magnet, PaintBucket, Palette, Pencil, Printer, Ratio, Ruler, Search, Settings2, SlidersHorizontal, Sparkles,
  Spline, Square, SquareDashed, StickyNote, Sun, Sunrise, TriangleAlert, Type, Move, Film, Scan, Book,
} from 'lucide-react'
import { t } from './i18n'
import type { AdjustmentType, AppSettings, CurveData, Language, LayerEffects, LevelsData, PageOrientation, TextData, ThreeDData } from './lib/types'
import type { MetaSection } from './lib/metadata'
import type { GradientDef } from './lib/gradients'

/** Names, icons and titles for every popup. Kept apart from the components so
 *  the dialog module exports components only. */

export type DialogName =
  | 'new' | 'export' | 'brightness' | 'hue' | 'blur' | 'sharpen' | 'cameraRaw' | 'curves' | 'levels'
  | 'filterGallery' | 'imageSize' | 'canvasSize' | 'text' | 'unsaved' | 'settings' | 'helpGuide'
  | 'about' | 'error' | 'feather' | 'print' | 'imageInfo'
  | 'fill' | 'stroke' | 'selectModify' | 'colorRange' | 'saveSelection' | 'loadSelection'
  | 'skew' | 'distort' | 'perspective' | 'warp' | 'contentScale' | 'colorProfile' | 'threeD'
  | 'channelMixer' | 'selectiveColor' | 'gradientMap' | 'replaceColor'
  /* added for Photoshop parity */
  | 'filterParams' | 'adjustment' | 'lut' | 'hdrToning' | 'matchColor' | 'applyImage' | 'calculations'
  | 'rotateArbitrary' | 'newGuide' | 'guideLayout' | 'selectAndMask' | 'lensCorrection' | 'blurGallery'
  | 'customFilter' | 'layerStyle' | 'gradientEditor' | 'neural' | 'note' | 'findReplace' | 'exportAs'
  | 'openRecent' | 'keyboardShortcuts' | 'contactSheet' | 'fitImage' | 'photomerge' | 'fade' | 'skyReplace'
  | 'perspectiveWarp' | 'duotone' | 'indexed' | 'checkSpelling' | 'vanishingPoint' | 'adaptiveWideAngle'
  | 'statistics' | 'namePrompt' | 'imageProcessor' | 'transformSelection'

export type DialogResult = { action: string; [key: string]: unknown }

export type DialogPayload = {
  language: Language
  theme: string
  /** Seeds for the editors, supplied by App. */
  adjust?: { brightness: number; contrast: number; hue: number; saturation: number; lightness: number; radius: number; amount: number; width: number; height: number }
  settings?: AppSettings
  curves?: CurveData
  levels?: LevelsData
  autoLevels?: LevelsData
  text?: string
  error?: { title: string; message: string; details: string }
  /** The print preview: a small opaque copy of the composite, and its shape. */
  print?: { dataUrl: string; orientation: PageOrientation; width: number; height: number }
  /** The printers the print window can send the job to. */
  printers?: { name: string; displayName: string; isDefault: boolean }[]
  /** Everything the image information window lists, already grouped. */
  info?: MetaSection[]
  /** Which Modify command the shared radius window is standing in for. */
  modify?: 'expand' | 'contract' | 'border' | 'smooth'
  /** The document's saved selections, for the load window to choose from. */
  channels?: { id: string; name: string }[]
  /** The paths type can be set along. */
  paths?: { id: string; name: string }[]
  /** The tiles Fill can repeat. */
  patterns?: { id: string; name: string }[]
  /** The type layer being edited, so the window opens on its own settings. */
  textData?: TextData
  /** The working space now in force, and any profile the file carried. */
  profile?: { current: string; embedded?: string }
  /** The 3D settings of the layer being edited. */
  threeD?: ThreeDData
  version?: string
  creator?: string
  /* ---- added for Photoshop parity ---- */
  /** Which filter the generic settings window is driving. */
  filterId?: string
  /** Which adjustment the generic sliders window is driving. */
  adjustmentType?: AdjustmentType
  /** The other layers, for Apply Image, Match Color and Calculations. */
  layers?: { id: string; name: string; active?: boolean }[]
  /** The active layer's styles, for the Layer Style window. */
  effects?: LayerEffects
  /** The gradient being edited, and the ones already saved. */
  gradient?: GradientDef
  gradients?: GradientDef[]
  /** The built-in and loaded colour lookup tables. */
  luts?: { id: string; name: string }[]
  recentFiles?: string[]
  /** The tool letter keys, for the shortcuts window. */
  shortcuts?: { tool: string; key: string; label: string }[]
  /** The note being edited. */
  note?: { id: string; text: string }
  /** A generic name prompt: what it is asking for, and a starting value. */
  promptKey?: string
  promptFor?: string
  defaultName?: string
  /** Anything the prompt should hand back with the name, untouched. */
  extra?: Record<string, unknown>
  hasSelection?: boolean
  docSize?: { width: number; height: number }
  /** Spelling suspects found in the type layers. */
  spelling?: { word: string; layer: string; suggestion?: string }[]
  /** Statistics over the layer stack. */
  stats?: { layers: number }
  /** The selection's box, for Transform Selection. */
  selectionBox?: { x: number; y: number; width: number; height: number }
}

const DIALOG_ICONS: Record<DialogName, ComponentType<{ size?: number }>> = {
  new: FilePlus,
  export: Download,
  brightness: Sun,
  hue: Palette,
  blur: Droplets,
  sharpen: Sparkles,
  cameraRaw: Camera,
  curves: Spline,
  levels: SlidersHorizontal,
  filterGallery: LayoutGrid,
  imageSize: Ratio,
  canvasSize: Frame,
  text: Type,
  unsaved: TriangleAlert,
  settings: Settings2,
  helpGuide: BookOpen,
  about: Info,
  error: TriangleAlert,
  feather: Crop,
  print: Printer,
  imageInfo: Info,
  fill: PaintBucket,
  stroke: Square,
  selectModify: SquareDashed,
  colorRange: Palette,
  channelMixer: Blend,
  selectiveColor: Droplets,
  gradientMap: Blend,
  replaceColor: Palette,
  saveSelection: SquareDashed,
  loadSelection: SquareDashed,
  skew: Ratio,
  distort: Ratio,
  perspective: Ratio,
  warp: Spline,
  contentScale: Ratio,
  colorProfile: Palette,
  threeD: Box,
  filterParams: Sparkles,
  adjustment: SlidersHorizontal,
  lut: Palette,
  hdrToning: Sunrise,
  matchColor: Palette,
  applyImage: Layers2,
  calculations: Blend,
  rotateArbitrary: Compass,
  newGuide: Ruler,
  guideLayout: LayoutGrid,
  selectAndMask: Magnet,
  lensCorrection: Aperture,
  blurGallery: Aperture,
  customFilter: Grid3x3,
  layerStyle: Sparkles,
  gradientEditor: Blend,
  neural: Sparkles,
  note: StickyNote,
  findReplace: Search,
  exportAs: Download,
  openRecent: History,
  keyboardShortcuts: Keyboard,
  contactSheet: LayoutGrid,
  fitImage: Ratio,
  photomerge: Scan,
  fade: Blend,
  skyReplace: Sunrise,
  perspectiveWarp: Ratio,
  duotone: Palette,
  indexed: Grid3x3,
  checkSpelling: Book,
  vanishingPoint: Move,
  adaptiveWideAngle: Compass,
  statistics: SlidersHorizontal,
  namePrompt: Pencil,
  imageProcessor: Film,
  transformSelection: Ratio,
}

const DIALOG_TITLE_KEYS: Record<DialogName, string> = {
  new: 'newDocument',
  export: 'export',
  brightness: 'brightness',
  hue: 'hueSat',
  blur: 'blur',
  sharpen: 'sharpen',
  cameraRaw: 'cameraRaw',
  curves: 'curves',
  levels: 'levels',
  filterGallery: 'filterGallery',
  imageSize: 'imageSize',
  canvasSize: 'canvasSize',
  text: 'text',
  unsaved: 'unsavedTitle',
  settings: 'settings',
  helpGuide: 'helpGuide',
  about: 'about',
  error: 'error',
  feather: 'feather',
  print: 'print',
  imageInfo: 'imageInfo',
  fill: 'fillCommand',
  stroke: 'strokeCommand',
  selectModify: 'expandSel',
  colorRange: 'colorRange',
  channelMixer: 'channelMixer',
  selectiveColor: 'selectiveColor',
  gradientMap: 'gradientMap',
  replaceColor: 'replaceColor',
  saveSelection: 'saveSelection',
  loadSelection: 'loadSelection',
  skew: 'skew',
  distort: 'distort',
  perspective: 'perspective',
  warp: 'warpCommand',
  contentScale: 'contentScale',
  colorProfile: 'colorProfile',
  threeD: 'extrude',
  filterParams: 'filterParams',
  adjustment: 'adjustmentDialog',
  lut: 'lutDialog',
  hdrToning: 'hdrToning',
  matchColor: 'matchColor',
  applyImage: 'applyImage',
  calculations: 'calculations',
  rotateArbitrary: 'rotateArbitrary',
  newGuide: 'newGuide',
  guideLayout: 'guideLayout',
  selectAndMask: 'selectAndMask',
  lensCorrection: 'lensCorrection',
  blurGallery: 'blurGallery',
  customFilter: 'customFilter',
  layerStyle: 'layerStyle',
  gradientEditor: 'gradientEditor',
  neural: 'neuralFilters',
  note: 'noteText',
  findReplace: 'findReplace',
  exportAs: 'exportAs',
  openRecent: 'openRecent',
  keyboardShortcuts: 'keyboardShortcuts',
  contactSheet: 'contactSheet',
  fitImage: 'fitImage',
  photomerge: 'photomerge',
  fade: 'fade',
  skyReplace: 'skyReplace',
  perspectiveWarp: 'perspectiveWarp',
  duotone: 'modeDuotone',
  indexed: 'modeIndexed',
  checkSpelling: 'checkSpelling',
  vanishingPoint: 'vanishingPoint',
  adaptiveWideAngle: 'adaptiveWideAngle',
  statistics: 'statistics',
  namePrompt: 'presetName',
  imageProcessor: 'imageProcessor',
  transformSelection: 'transformSelection',
}

export function dialogIcon(name: DialogName) {
  return DIALOG_ICONS[name] ?? Info
}

export function dialogTitle(name: DialogName, language: Language, payload?: DialogPayload) {
  if (name === 'error') return payload?.error?.title ?? t(language, 'error')
  if (name === 'about') return t(language, 'appName')
  // One window serves all four Modify commands, under the name of whichever
  // one opened it.
  if (name === 'selectModify') return t(language, `${payload?.modify ?? 'expand'}Sel`)
  // The generic filter and adjustment windows take the name of what they drive.
  if (name === 'filterParams' && payload?.filterId) return t(language, payload.filterId)
  if (name === 'adjustment' && payload?.adjustmentType) return t(language, payload.adjustmentType)
  if (name === 'namePrompt' && payload?.promptKey) return t(language, payload.promptKey)
  return t(language, DIALOG_TITLE_KEYS[name] ?? name)
}

/** The windows that show their effect on the picture as their controls move. */
export const previewDialogs = new Set<DialogName>([
  'brightness', 'hue', 'blur', 'sharpen', 'cameraRaw', 'curves', 'levels', 'channelMixer', 'selectiveColor', 'gradientMap',
  'replaceColor', 'filterParams', 'adjustment', 'lut', 'hdrToning', 'matchColor', 'lensCorrection', 'blurGallery', 'customFilter',
  'layerStyle', 'neural', 'skew', 'perspective', 'warp', 'adaptiveWideAngle', 'duotone', 'indexed', 'fade', 'selectAndMask',
])

/** Results that are live edits: the window stays open after sending them. */
export function keepsWindowOpen(action: string) {
  return action === 'settings' || action === 'filter' || action === 'preview' || action === 'saveStyle' || action === 'load' || action === 'clear'
}
