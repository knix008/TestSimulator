import { clamp } from './color'
import { isTheme } from '../themes'
import { defaultSettings, type AppSettings, type ExportFormat } from './types'

const settingsStorageKey = 'my-photo-work-v1-settings'
const exportFormats: ExportFormat[] = ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff']

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return defaultSettings
  }
  try {
    const raw = window.localStorage.getItem(settingsStorageKey)
    if (!raw) {
      return defaultSettings
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      language: parsed.language === 'ko' || parsed.language === 'en' ? parsed.language : defaultSettings.language,
      theme: isTheme(parsed.theme) ? parsed.theme : defaultSettings.theme,
      zoom: clamp(typeof parsed.zoom === 'number' ? parsed.zoom : defaultSettings.zoom, 0.05, 8),
      showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : defaultSettings.showGrid,
      showRulers: typeof parsed.showRulers === 'boolean' ? parsed.showRulers : defaultSettings.showRulers,
      rightWidth: clamp(typeof parsed.rightWidth === 'number' ? parsed.rightWidth : defaultSettings.rightWidth, 240, 480),
      exportFormat: parsed.exportFormat && exportFormats.includes(parsed.exportFormat) ? parsed.exportFormat : defaultSettings.exportFormat,
      brushSize: clamp(typeof parsed.brushSize === 'number' ? parsed.brushSize : defaultSettings.brushSize, 1, 400),
      brushHardness: clamp(typeof parsed.brushHardness === 'number' ? parsed.brushHardness : defaultSettings.brushHardness, 0, 1),
      brushOpacity: clamp(typeof parsed.brushOpacity === 'number' ? parsed.brushOpacity : defaultSettings.brushOpacity, 0.05, 1),
      fillTolerance: clamp(typeof parsed.fillTolerance === 'number' ? parsed.fillTolerance : defaultSettings.fillTolerance, 0, 255),
      foreground: typeof parsed.foreground === 'string' ? parsed.foreground : defaultSettings.foreground,
      background: typeof parsed.background === 'string' ? parsed.background : defaultSettings.background,
      gradientKind: parsed.gradientKind === 'radial' || parsed.gradientKind === 'angle' || parsed.gradientKind === 'reflected' || parsed.gradientKind === 'diamond' ? parsed.gradientKind : 'linear',
      rightTab: parsed.rightTab === 'adjust' || parsed.rightTab === 'history' || parsed.rightTab === 'channels' || parsed.rightTab === 'info' ? parsed.rightTab : 'layers',
    }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
}
