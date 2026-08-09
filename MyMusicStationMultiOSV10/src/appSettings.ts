import { invoke } from '@tauri-apps/api/core'
import {
  defaultSpectrumStyle,
  isSpectrumStyle,
  type SpectrumColorOrder,
  type SpectrumStyle,
} from './spectrumModes'
import {
  builtInWallpapers,
  defaultBuiltInWallpaperId,
  findBuiltInWallpaper,
  isBuiltInWallpaperId,
} from './wallpapers'

export type Language = 'ko' | 'en'
export type { SpectrumColorOrder, SpectrumStyle }

export type AppSettings = {
  language: Language
  themeId: string
  useSystemTray: boolean
  rememberVolume: boolean
  volume: number
  showSpectrum: boolean
  spectrumColorOrder: SpectrumColorOrder
  spectrumStyle: SpectrumStyle
  reopenLastFolderOnStart: boolean
  wallpaperEnabled: boolean
  wallpaperPath: string
  wallpaperDim: number
  panelOpacity: number
}

export const appSettingsKey = 'myMusicStation.appSettings'

export const defaultAppSettings: AppSettings = {
  language: 'ko',
  themeId: 'dark',
  useSystemTray: true,
  rememberVolume: true,
  volume: 0.82,
  showSpectrum: true,
  spectrumColorOrder: 'blue-red',
  spectrumStyle: defaultSpectrumStyle,
  reopenLastFolderOnStart: false,
  wallpaperEnabled: Boolean(defaultBuiltInWallpaperId),
  wallpaperPath: defaultBuiltInWallpaperId,
  wallpaperDim: 0.55,
  panelOpacity: 0.82,
}

const isLanguage = (value: unknown): value is Language => value === 'ko' || value === 'en'

const isSpectrumColorOrder = (value: unknown): value is SpectrumColorOrder =>
  value === 'blue-red' || value === 'red-blue'

const clampDim = (value: number) => Math.min(0.9, Math.max(0.15, value))
const clampPanelOpacity = (value: number) => Math.min(1, Math.max(0.2, value))

const resolveWallpaperPath = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return defaultAppSettings.wallpaperPath
  }

  if (isBuiltInWallpaperId(value)) {
    return findBuiltInWallpaper(value)?.id || defaultAppSettings.wallpaperPath
  }

  const fileName = value.split(/[\\/]/).pop() || ''
  const builtIn = builtInWallpapers.find((item) => item.fileName === fileName)
  if (builtIn) {
    return builtIn.id
  }

  return value
}

export const normalizeAppSettings = (parsed: Partial<AppSettings> | null | undefined): AppSettings => {
  const source = parsed ?? {}
  const volume = typeof source.volume === 'number' ? Math.min(1, Math.max(0, source.volume)) : defaultAppSettings.volume
  const wallpaperDim =
    typeof source.wallpaperDim === 'number' ? clampDim(source.wallpaperDim) : defaultAppSettings.wallpaperDim
  const panelOpacity =
    typeof source.panelOpacity === 'number' ? clampPanelOpacity(source.panelOpacity) : defaultAppSettings.panelOpacity

  return {
    language: isLanguage(source.language) ? source.language : defaultAppSettings.language,
    themeId: typeof source.themeId === 'string' && source.themeId ? source.themeId : defaultAppSettings.themeId,
    useSystemTray: typeof source.useSystemTray === 'boolean' ? source.useSystemTray : defaultAppSettings.useSystemTray,
    rememberVolume: typeof source.rememberVolume === 'boolean' ? source.rememberVolume : defaultAppSettings.rememberVolume,
    volume,
    showSpectrum: typeof source.showSpectrum === 'boolean' ? source.showSpectrum : defaultAppSettings.showSpectrum,
    spectrumColorOrder: isSpectrumColorOrder(source.spectrumColorOrder)
      ? source.spectrumColorOrder
      : defaultAppSettings.spectrumColorOrder,
    spectrumStyle: isSpectrumStyle(source.spectrumStyle) ? source.spectrumStyle : defaultAppSettings.spectrumStyle,
    reopenLastFolderOnStart:
      typeof source.reopenLastFolderOnStart === 'boolean'
        ? source.reopenLastFolderOnStart
        : defaultAppSettings.reopenLastFolderOnStart,
    wallpaperEnabled:
      typeof source.wallpaperEnabled === 'boolean' ? source.wallpaperEnabled : defaultAppSettings.wallpaperEnabled,
    wallpaperPath: resolveWallpaperPath(source.wallpaperPath),
    wallpaperDim,
    panelOpacity,
  }
}

export const loadAppSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(appSettingsKey)

    if (!raw) {
      return { ...defaultAppSettings }
    }

    return normalizeAppSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    return { ...defaultAppSettings }
  }
}

export const saveAppSettings = (settings: AppSettings) => {
  localStorage.setItem(appSettingsKey, JSON.stringify(settings))
}

export const loadAppSettingsDurable = async (): Promise<AppSettings> => {
  try {
    const fromDisk = await invoke<Partial<AppSettings> | null>('load_ui_settings')
    if (fromDisk && typeof fromDisk === 'object') {
      const normalized = normalizeAppSettings(fromDisk)
      saveAppSettings(normalized)
      return normalized
    }
  } catch {
    // Browser / non-Tauri fallback
  }

  return loadAppSettings()
}

export const saveAppSettingsDurable = async (settings: AppSettings): Promise<void> => {
  const normalized = normalizeAppSettings(settings)

  try {
    saveAppSettings(normalized)
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }

  try {
    await invoke('save_ui_settings', { settings: normalized })
  } catch (error) {
    console.warn('[settings] failed to persist settings to disk', error)
    throw error instanceof Error ? error : new Error(String(error))
  }
}
