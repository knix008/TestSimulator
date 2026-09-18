import type { ComponentType } from 'react'
import {
  Blend, BookOpen, Box, Camera, Crop, Download, Droplets, FilePlus, Frame, Info, LayoutGrid, PaintBucket,
  Palette, Printer, Ratio, Settings2, SlidersHorizontal, Sparkles, Spline, Square, SquareDashed,
  Sun, TriangleAlert, Type,
} from 'lucide-react'
import { t } from './i18n'
import type { AppSettings, CurveData, Language, LevelsData, PageOrientation, TextData, ThreeDData } from './lib/types'
import type { MetaSection } from './lib/metadata'

/** Names, icons and titles for every popup. Kept apart from the components so
 *  the dialog module exports components only. */

export type DialogName =
  | 'new' | 'export' | 'brightness' | 'hue' | 'blur' | 'sharpen' | 'cameraRaw' | 'curves' | 'levels'
  | 'filterGallery' | 'imageSize' | 'canvasSize' | 'text' | 'unsaved' | 'settings' | 'helpGuide'
  | 'about' | 'error' | 'feather' | 'print' | 'imageInfo'
  | 'fill' | 'stroke' | 'selectModify' | 'colorRange' | 'saveSelection' | 'loadSelection'
  | 'skew' | 'distort' | 'perspective' | 'warp' | 'contentScale' | 'colorProfile' | 'threeD'
  | 'channelMixer' | 'selectiveColor' | 'gradientMap' | 'replaceColor'

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
  print: 'printPreview',
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
  return t(language, DIALOG_TITLE_KEYS[name] ?? name)
}

