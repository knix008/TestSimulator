import type { ComponentType } from 'react'
import {
  BookOpen, Camera, Crop, Download, Droplets, FilePlus, Frame, Info, LayoutGrid, Palette, Printer,
  Ratio, Settings2, SlidersHorizontal, Sparkles, Spline, Sun, TriangleAlert, Type,
} from 'lucide-react'
import { t } from './i18n'
import type { AppSettings, CurveData, Language, LevelsData, PageOrientation } from './lib/types'
import type { MetaSection } from './lib/metadata'

/** Names, icons and titles for every popup. Kept apart from the components so
 *  the dialog module exports components only. */

export type DialogName =
  | 'new' | 'export' | 'brightness' | 'hue' | 'blur' | 'sharpen' | 'cameraRaw' | 'curves' | 'levels'
  | 'filterGallery' | 'imageSize' | 'canvasSize' | 'text' | 'unsaved' | 'settings' | 'helpGuide'
  | 'about' | 'error' | 'feather' | 'print' | 'imageInfo'

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
}

export function dialogIcon(name: DialogName) {
  return DIALOG_ICONS[name] ?? Info
}

export function dialogTitle(name: DialogName, language: Language, payload?: DialogPayload) {
  if (name === 'error') return payload?.error?.title ?? t(language, 'error')
  if (name === 'about') return t(language, 'appName')
  return t(language, DIALOG_TITLE_KEYS[name] ?? name)
}

