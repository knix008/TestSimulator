import { clamp } from './color'
import { isTheme } from '../themes'
import { defaultSettings, exportFormats, rightPanelMaxWidth, rightPanelMinWidth, type ActionScript, type AppSettings, type BrushPreset } from './types'

const settingsStorageKey = 'my-photo-work-v1-settings'

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
      rightWidth: clamp(typeof parsed.rightWidth === 'number' ? parsed.rightWidth : defaultSettings.rightWidth, rightPanelMinWidth, rightPanelMaxWidth),
      exportFormat: parsed.exportFormat && exportFormats.includes(parsed.exportFormat) ? parsed.exportFormat : defaultSettings.exportFormat,
      exportTransparent: typeof parsed.exportTransparent === 'boolean' ? parsed.exportTransparent : defaultSettings.exportTransparent,
      // Actions come back from storage, where anything could be; only entries
      // that still look like an action are kept.
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.filter((action): action is ActionScript => (
          Boolean(action) && typeof action.id === 'string' && typeof action.name === 'string' && Array.isArray(action.steps)
        ))
        : [],
      brushes: Array.isArray(parsed.brushes)
        ? parsed.brushes.filter((brush): brush is BrushPreset => Boolean(brush) && typeof brush.id === 'string' && typeof brush.size === 'number')
        : [],
      brushSpacing: clamp(typeof parsed.brushSpacing === 'number' ? parsed.brushSpacing : defaultSettings.brushSpacing, 0.02, 2),
      brushAngle: clamp(typeof parsed.brushAngle === 'number' ? parsed.brushAngle : defaultSettings.brushAngle, -180, 180),
      brushRoundness: clamp(typeof parsed.brushRoundness === 'number' ? parsed.brushRoundness : defaultSettings.brushRoundness, 0.05, 1),
      brushScatter: clamp(typeof parsed.brushScatter === 'number' ? parsed.brushScatter : defaultSettings.brushScatter, 0, 3),
      brushSize: clamp(typeof parsed.brushSize === 'number' ? parsed.brushSize : defaultSettings.brushSize, 1, 400),
      brushHardness: clamp(typeof parsed.brushHardness === 'number' ? parsed.brushHardness : defaultSettings.brushHardness, 0, 1),
      brushOpacity: clamp(typeof parsed.brushOpacity === 'number' ? parsed.brushOpacity : defaultSettings.brushOpacity, 0.05, 1),
      fillTolerance: clamp(typeof parsed.fillTolerance === 'number' ? parsed.fillTolerance : defaultSettings.fillTolerance, 0, 255),
      foreground: typeof parsed.foreground === 'string' ? parsed.foreground : defaultSettings.foreground,
      background: typeof parsed.background === 'string' ? parsed.background : defaultSettings.background,
      gradientKind: parsed.gradientKind === 'radial' || parsed.gradientKind === 'angle' || parsed.gradientKind === 'reflected' || parsed.gradientKind === 'diamond' ? parsed.gradientKind : 'linear',
      rightTab: parsed.rightTab === 'adjust' || parsed.rightTab === 'history' || parsed.rightTab === 'channels' || parsed.rightTab === 'info' ? parsed.rightTab : 'layers',
      shapeStroke: clamp(typeof parsed.shapeStroke === 'number' ? parsed.shapeStroke : defaultSettings.shapeStroke, 0, 100),
      shapeSides: clamp(typeof parsed.shapeSides === 'number' ? Math.round(parsed.shapeSides) : defaultSettings.shapeSides, 3, 32),
      shapeCorner: clamp(typeof parsed.shapeCorner === 'number' ? parsed.shapeCorner : defaultSettings.shapeCorner, 0, 400),
      shapeFilled: typeof parsed.shapeFilled === 'boolean' ? parsed.shapeFilled : defaultSettings.shapeFilled,
      pathWidth: clamp(typeof parsed.pathWidth === 'number' ? parsed.pathWidth : defaultSettings.pathWidth, 1, 100),
      magneticWidth: clamp(typeof parsed.magneticWidth === 'number' ? Math.round(parsed.magneticWidth) : defaultSettings.magneticWidth, 1, 64),
      showPaths: typeof parsed.showPaths === 'boolean' ? parsed.showPaths : defaultSettings.showPaths,
    }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: AppSettings) {
  window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
}
