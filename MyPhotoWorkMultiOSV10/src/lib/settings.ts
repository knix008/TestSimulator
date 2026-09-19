import { clamp } from './color'
import { isTheme } from '../themes'
import { defaultSettings, exportFormats, panelTabs, rightPanelMaxWidth, rightPanelMinWidth, type ActionScript, type AppSettings, type BrushPreset } from './types'

const settingsStorageKey = 'my-photo-work-v1-settings'

/** The numeric settings and the range each is held to. */
const ranges: Partial<Record<keyof AppSettings, [number, number]>> = {
  zoom: [0.05, 8],
  rightWidth: [rightPanelMinWidth, rightPanelMaxWidth],
  brushSpacing: [0.02, 2],
  brushAngle: [-180, 180],
  brushRoundness: [0.05, 1],
  brushScatter: [0, 3],
  brushSize: [1, 400],
  brushHardness: [0, 1],
  brushOpacity: [0.05, 1],
  fillTolerance: [0, 255],
  shapeStroke: [0, 100],
  shapeSides: [3, 32],
  shapeCorner: [0, 400],
  pathWidth: [1, 100],
  magneticWidth: [1, 64],
  marqueeFeather: [0, 250],
  mixerWet: [0, 1],
  mixerMix: [0, 1],
  mixerFlow: [0.02, 1],
  liquifyPressure: [0.05, 1],
  historyStates: [5, 500],
}

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
    // Anything stored under a key the defaults know, of the same shape, is
    // taken; anything else — an old key, a corrupted value — falls back.
    const next: Record<string, unknown> = { ...defaultSettings }
    for (const key of Object.keys(defaultSettings) as (keyof AppSettings)[]) {
      const fallback = defaultSettings[key]
      const value = parsed[key]
      if (value === undefined || value === null) continue
      if (Array.isArray(fallback)) {
        if (Array.isArray(value)) next[key] = value
        continue
      }
      if (typeof value !== typeof fallback) continue
      next[key] = value
    }
    const settings = next as AppSettings
    settings.language = parsed.language === 'ko' || parsed.language === 'en' ? parsed.language : defaultSettings.language
    settings.theme = isTheme(parsed.theme) ? parsed.theme : defaultSettings.theme
    settings.exportFormat = parsed.exportFormat && exportFormats.includes(parsed.exportFormat) ? parsed.exportFormat : defaultSettings.exportFormat
    for (const [key, [low, high]] of Object.entries(ranges) as [keyof AppSettings, [number, number]][]) {
      const value = settings[key]
      if (typeof value === 'number') (settings as unknown as Record<string, number>)[key] = clamp(value, low, high)
    }
    settings.shapeSides = Math.round(settings.shapeSides)
    settings.magneticWidth = Math.round(settings.magneticWidth)
    // Actions and brushes come back from storage, where anything could be;
    // only entries that still look like the real thing are kept.
    settings.actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((action): action is ActionScript => (
        Boolean(action) && typeof action.id === 'string' && typeof action.name === 'string' && Array.isArray(action.steps)
      ))
      : []
    settings.brushes = Array.isArray(parsed.brushes)
      ? parsed.brushes.filter((brush): brush is BrushPreset => Boolean(brush) && typeof brush.id === 'string' && typeof brush.size === 'number')
      : []
    settings.gradientKind = ['linear', 'radial', 'angle', 'reflected', 'diamond'].includes(String(parsed.gradientKind)) ? parsed.gradientKind! : 'linear'
    settings.rightTab = panelTabs.includes(parsed.rightTab as AppSettings['rightTab']) ? parsed.rightTab! : 'layers'
    settings.selectionMode = ['new', 'add', 'subtract', 'intersect'].includes(String(parsed.selectionMode)) ? parsed.selectionMode! : 'new'
    settings.swatches = settings.swatches.filter((item) => typeof item === 'string')
    settings.recentFiles = settings.recentFiles.filter((item) => typeof item === 'string').slice(0, 20)
    settings.shortcuts = typeof parsed.shortcuts === 'object' && parsed.shortcuts ? parsed.shortcuts : {}
    settings.paintTarget = 'layer'
    return settings
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
}
