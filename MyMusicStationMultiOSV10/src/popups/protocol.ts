import type { Language } from '../appSettings'
import type { ThemeDefinition } from '../themes'

// Each dialog runs in its own OS window (label `popup-<kind>`). The main window
// owns all state and pushes a snapshot; the popup only renders it and sends
// user intents back as actions.
export const popupKinds = ['settings', 'convert', 'extract', 'appInfo', 'alert', 'error', 'folderProgress', 'downloadProgress', 'themePicker'] as const
export type PopupKind = (typeof popupKinds)[number]

export const isPopupKind = (value: string | null): value is PopupKind =>
  popupKinds.includes(value as PopupKind)

export const mainWindowLabel = 'main'
export const popupLabelPrefix = 'popup-'
export const popupWindowLabel = (kind: PopupKind) => `${popupLabelPrefix}${kind}`
export const isPopupWindowLabel = (label: string) => label.startsWith(popupLabelPrefix)
export const popupQueryParam = 'popup'
export const popupWindowUrl = (kind: PopupKind) => `index.html?${popupQueryParam}=${kind}`

/** popup → main: "I am mounted, send me the current state". */
export const popupReadyEvent = 'popup:ready'
/** main → popup: full state snapshot. */
export const popupStateEvent = 'popup:state'
/** popup → main: user intent. */
export const popupActionEvent = 'popup:action'
/** Rust → main: a popup window was destroyed (emitted for every close path, Alt+F4 included). */
export const popupClosedEvent = 'popup:closed'

export type ConvertFormat = 'mp3' | 'wav' | 'flac' | 'ogg' | 'm4a'
export type ExtractFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav' | 'ogg' | 'aac'
export type ExtractQuality = 'high' | 'medium' | 'low'

export type SettingsPopupData = {
  useSystemTray: boolean
  reopenLastFolderOnStart: boolean
  wallpaperEnabled: boolean
  wallpaperPath: string
  wallpaperDim: number
  panelOpacity: number
  themeId: string
  themes: ThemeDefinition[]
  themeMessage: string
}

export type ConvertPopupData = {
  title: string
  busyLabel: string
  trackTitle: string | null
  fileName: string
  isRemoteSave: boolean
  format: ConvertFormat
  formats: readonly ConvertFormat[]
  quality: ExtractQuality
  isConverting: boolean
  isProbing: boolean
  message: string
}

export type ExtractPopupData = {
  url: string
  format: ExtractFormat
  formats: readonly ExtractFormat[]
  quality: ExtractQuality
  addToPlaylist: boolean
  isExtracting: boolean
  message: string
}

export type AlertPopupData = {
  title: string
  message: string
}

export type ErrorPopupData = {
  message: string
}

export type FolderProgressPopupData = {
  phase: 'scanning' | 'loading'
  loaded: number
  total: number
}

export type DownloadProgressPopupData = {
  phase: 'preparing' | 'downloading' | 'converting' | 'finishing'
  percent: number | null
  speed?: string | null
  eta?: string | null
  title?: string
}

export type ThemePickerPopupData = {
  themeId: string
  themes: ThemeDefinition[]
  themeMessage: string
  /** Logical screen coordinates for the top-left of the dropdown OS window. */
  anchorX: number
  anchorY: number
}

export type PopupData = {
  settings: SettingsPopupData
  convert: ConvertPopupData
  extract: ExtractPopupData
  appInfo: Record<string, never>
  alert: AlertPopupData
  error: ErrorPopupData
  folderProgress: FolderProgressPopupData
  downloadProgress: DownloadProgressPopupData
  themePicker: ThemePickerPopupData
}

export type SettingsPopupAction =
  | { type: 'setUseSystemTray'; enabled: boolean }
  | { type: 'setReopenLastFolderOnStart'; enabled: boolean }
  | { type: 'setWallpaperEnabled'; enabled: boolean }
  | { type: 'selectBuiltInWallpaper'; wallpaperId: string }
  | { type: 'chooseWallpaper' }
  | { type: 'clearWallpaper' }
  | { type: 'setWallpaperDim'; value: number }
  | { type: 'setPanelOpacity'; value: number }
  | { type: 'selectTheme'; themeId: string }
  | { type: 'addTheme'; name: string; accent: string }
  | { type: 'deleteTheme' }
  | { type: 'exportTheme' }
  | { type: 'importTheme' }
  | { type: 'save' }
  | { type: 'close' }

export type ConvertPopupAction =
  | { type: 'setFormat'; format: ConvertFormat }
  | { type: 'setQuality'; quality: ExtractQuality }
  | { type: 'setFileName'; fileName: string }
  | { type: 'run' }
  | { type: 'close' }

export type ExtractPopupAction =
  | { type: 'setUrl'; url: string }
  | { type: 'setFormat'; format: ExtractFormat }
  | { type: 'setQuality'; quality: ExtractQuality }
  | { type: 'setAddToPlaylist'; enabled: boolean }
  | { type: 'run' }
  | { type: 'close' }

export type ThemePickerPopupAction =
  | { type: 'selectTheme'; themeId: string }
  | { type: 'addTheme'; name: string; accent: string }
  | { type: 'deleteTheme' }
  | { type: 'exportTheme' }
  | { type: 'importTheme' }
  | { type: 'close' }

export type CloseOnlyAction = { type: 'close' }

export type PopupAction = {
  settings: SettingsPopupAction
  convert: ConvertPopupAction
  extract: ExtractPopupAction
  appInfo: CloseOnlyAction
  alert: CloseOnlyAction
  error: CloseOnlyAction
  folderProgress: never
  downloadProgress: never
  themePicker: ThemePickerPopupAction
}

/** Everything a popup needs to look like the main window. */
export type PopupChrome = {
  language: Language
  theme: ThemeDefinition
}

export type PopupState<K extends PopupKind = PopupKind> = PopupChrome & {
  kind: K
  data: PopupData[K]
}

export type PopupReadyPayload = { kind: PopupKind }
export type PopupActionPayload<K extends PopupKind = PopupKind> = { kind: K; action: PopupAction[K] }
export type PopupClosedPayload = { label: string }

/** Logical window width per dialog; height is measured from the rendered content (never scrolls). */
export const popupWindowWidth: Record<PopupKind, number> = {
  settings: 380,
  convert: 340,
  extract: 360,
  appInfo: 340,
  alert: 340,
  error: 500,
  folderProgress: 360,
  downloadProgress: 360,
  themePicker: 300,
}
