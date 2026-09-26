import { createCustomTheme, sanitizeTheme, themeById, themeIds, CUSTOM_THEME_ID, type Theme, type ThemeId } from './themes'
import { defaultPageSetup, sanitizePageSetup, type PageSetup } from './print'
import { sanitizeInstalled, type InstalledAddon } from './addons'
import { NAVIGATION_STYLES, type NavigationStyle } from './viewnav'
import { isUnitSchema, type UnitSchema } from './units'

export type Lang = 'ko' | 'en'
export type { ThemeId }
export type FontStyleName = 'normal' | 'italic' | 'bold' | 'bold-italic'

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

export interface Settings {
  language: Lang
  theme: ThemeId
  fontFamily: string
  fontSize: number
  fontStyle: FontStyleName
  backgroundImage: string | null
  backgroundOpacity: number
  recentFiles: RecentFile[]
  lastDirectories: {
    open: string
    save: string
    import: string
    background: string
  }
  grid: boolean
  ruler: boolean
  snap: number
  /** grow the axes and the grid with the model */
  autoScaleAxes: boolean
  /** show the origin axes in the viewport */
  showAxes: boolean
  /** default page setup used by the print dialog */
  print: PageSetup
  /** extensions installed through the addon manager */
  addons: InstalledAddon[]
  /** the user's own editable palette, selected with the id "custom" */
  customTheme: Theme
  /** viewport lighting rig */
  light: LightRig
  /** width of the tool panel in pixels; 0 means "measure it" */
  leftPanelWidth: number
  /** camera projection, as FreeCAD's View menu switches it */
  projection: Projection
  /** mouse navigation style */
  navigation: NavigationStyle
  /** unit schema used to show lengths, areas and volumes */
  units: UnitSchema
  /** section planes along each axis */
  clip: ClipPlane[]
  /** width of the property panel in pixels; 0 means "measure it" */
  rightPanelWidth: number
  /** tool panel on the left is open */
  showToolPanel: boolean
  /** property panel on the right is open */
  showPropertyPanel: boolean
}

/**
 * Kind of key light. `threePoint` is the classic key/fill/rim set, the others
 * are single sources placed at the rig angles.
 */
export type LightKind = 'directional' | 'point' | 'spot' | 'hemisphere' | 'threePoint' | 'ambientOnly'

export const LIGHT_KINDS: LightKind[] = ['directional', 'point', 'spot', 'hemisphere', 'threePoint', 'ambientOnly']

export type Projection = 'perspective' | 'orthographic'

/** One axis-aligned section plane, the equivalent of FreeCAD's clipping dialog. */
export interface ClipPlane {
  axis: 'x' | 'y' | 'z'
  enabled: boolean
  /** distance from the origin in millimetres */
  offset: number
  /** keep the other half instead */
  flip: boolean
}

export function defaultClip(): ClipPlane[] {
  return (['x', 'y', 'z'] as const).map((axis) => ({ axis, enabled: false, offset: 0, flip: false }))
}

export function sanitizeClip(input: unknown): ClipPlane[] {
  const base = defaultClip()
  if (!Array.isArray(input)) return base
  return base.map((plane) => {
    const raw = input.find((item) => item && typeof item === 'object' && (item as ClipPlane).axis === plane.axis) as
      | Partial<ClipPlane>
      | undefined
    if (!raw) return plane
    return {
      axis: plane.axis,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : plane.enabled,
      offset: typeof raw.offset === 'number' && Number.isFinite(raw.offset) ? Math.max(-100000, Math.min(100000, raw.offset)) : plane.offset,
      flip: typeof raw.flip === 'boolean' ? raw.flip : plane.flip
    }
  })
}

export interface LightRig {
  /** horizontal angle of the key light, degrees */
  azimuth: number
  /** height of the key light, degrees above the horizon */
  elevation: number
  /** key light strength */
  intensity: number
  /** fill light strength */
  ambient: number
  /** which kind of source lights the model */
  kind: LightKind
  /** key light colour, as a #rrggbb string */
  color: string
  enabled: boolean
}

export function defaultLight(): LightRig {
  return { azimuth: 135, elevation: 50, intensity: 1.1, ambient: 0.65, kind: 'directional', color: '#ffffff', enabled: true }
}

export function sanitizeLight(input: unknown): LightRig {
  const base = defaultLight()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<LightRig>
  const clamp = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
  return {
    azimuth: clamp(raw.azimuth, -180, 360, base.azimuth),
    elevation: clamp(raw.elevation, -20, 90, base.elevation),
    intensity: clamp(raw.intensity, 0, 3, base.intensity),
    ambient: clamp(raw.ambient, 0, 2, base.ambient),
    kind: LIGHT_KINDS.includes(raw.kind as LightKind) ? (raw.kind as LightKind) : base.kind,
    color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color.toLowerCase() : base.color,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled
  }
}

export const SETTINGS_KEY = 'mycad.settings.v1'

export function defaultSettings(): Settings {
  return {
    language: 'ko',
    theme: 'dark',
    fontFamily: 'Segoe UI',
    fontSize: 13,
    fontStyle: 'normal',
    backgroundImage: null,
    backgroundOpacity: 40,
    recentFiles: [],
    lastDirectories: { open: '', save: '', import: '', background: '' },
    grid: true,
    ruler: true,
    snap: 10,
    autoScaleAxes: true,
    showAxes: true,
    print: defaultPageSetup(),
    addons: [],
    customTheme: createCustomTheme(),
    light: defaultLight(),
    projection: 'perspective',
    navigation: 'cad',
    units: 'mm',
    clip: defaultClip(),
    leftPanelWidth: 0,
    rightPanelWidth: 0,
    showToolPanel: true,
    showPropertyPanel: true
  }
}

export function clampOpacity(value: number): number {
  if (Number.isNaN(value)) return 100
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function fontCss(style: FontStyleName): { fontWeight: number; fontStyle: 'normal' | 'italic' } {
  if (style === 'bold') return { fontWeight: 700, fontStyle: 'normal' }
  if (style === 'italic') return { fontWeight: 400, fontStyle: 'italic' }
  if (style === 'bold-italic') return { fontWeight: 700, fontStyle: 'italic' }
  return { fontWeight: 400, fontStyle: 'normal' }
}

export function sanitizeSettings(input: unknown): Settings {
  const base = defaultSettings()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<Settings>
  const language: Lang = raw.language === 'en' ? 'en' : 'ko'
  const theme = raw.theme === CUSTOM_THEME_ID || themeIds().includes(raw.theme as string) ? (raw.theme as ThemeId) : base.theme
  const styles: FontStyleName[] = ['normal', 'italic', 'bold', 'bold-italic']
  const fontStyle = styles.includes(raw.fontStyle as FontStyleName) ? (raw.fontStyle as FontStyleName) : base.fontStyle
  const recent = Array.isArray(raw.recentFiles)
    ? raw.recentFiles
        .filter((item) => item && typeof item.path === 'string' && typeof item.name === 'string')
        .slice(0, 10)
        .map((item) => ({
          path: item.path,
          name: item.name,
          openedAt: typeof item.openedAt === 'number' ? item.openedAt : 0
        }))
    : []
  const dirs = raw.lastDirectories && typeof raw.lastDirectories === 'object' ? raw.lastDirectories : base.lastDirectories
  return {
    language,
    theme,
    fontFamily: typeof raw.fontFamily === 'string' && raw.fontFamily.trim() ? raw.fontFamily : base.fontFamily,
    fontSize: typeof raw.fontSize === 'number' ? Math.max(8, Math.min(72, Math.round(raw.fontSize))) : base.fontSize,
    fontStyle,
    backgroundImage: typeof raw.backgroundImage === 'string' ? raw.backgroundImage : null,
    backgroundOpacity: clampOpacity(typeof raw.backgroundOpacity === 'number' ? raw.backgroundOpacity : base.backgroundOpacity),
    recentFiles: recent,
    lastDirectories: {
      open: typeof dirs.open === 'string' ? dirs.open : '',
      save: typeof dirs.save === 'string' ? dirs.save : '',
      import: typeof dirs.import === 'string' ? dirs.import : '',
      background: typeof dirs.background === 'string' ? dirs.background : ''
    },
    grid: typeof raw.grid === 'boolean' ? raw.grid : base.grid,
    ruler: typeof raw.ruler === 'boolean' ? raw.ruler : base.ruler,
    snap: typeof raw.snap === 'number' ? Math.max(0, raw.snap) : base.snap,
    autoScaleAxes: typeof raw.autoScaleAxes === 'boolean' ? raw.autoScaleAxes : base.autoScaleAxes,
    showAxes: typeof raw.showAxes === 'boolean' ? raw.showAxes : base.showAxes,
    print: sanitizePageSetup(raw.print),
    addons: sanitizeInstalled(raw.addons),
    customTheme: sanitizeTheme(raw.customTheme),
    light: sanitizeLight(raw.light),
    projection: raw.projection === 'orthographic' ? 'orthographic' : 'perspective',
    navigation: NAVIGATION_STYLES.includes(raw.navigation as NavigationStyle) ? (raw.navigation as NavigationStyle) : base.navigation,
    units: isUnitSchema(raw.units) ? raw.units : base.units,
    clip: sanitizeClip(raw.clip),
    leftPanelWidth: typeof raw.leftPanelWidth === 'number' && Number.isFinite(raw.leftPanelWidth)
      ? Math.max(0, Math.min(640, Math.round(raw.leftPanelWidth)))
      : 0,
    rightPanelWidth: typeof raw.rightPanelWidth === 'number' && Number.isFinite(raw.rightPanelWidth)
      ? Math.max(0, Math.min(640, Math.round(raw.rightPanelWidth)))
      : 0,
    showToolPanel: typeof raw.showToolPanel === 'boolean' ? raw.showToolPanel : base.showToolPanel,
    showPropertyPanel: typeof raw.showPropertyPanel === 'boolean' ? raw.showPropertyPanel : base.showPropertyPanel
  }
}

/** The colour mode of the active theme, used for `color-scheme` and icons. */
export function themeMode(settings: Settings): 'dark' | 'light' {
  return themeById(settings.theme).mode
}

export interface SettingsStorage {
  load: () => Promise<unknown>
  save: (settings: Settings) => Promise<void>
}

export function memoryStorage(initial?: unknown): SettingsStorage & { snapshot: () => unknown } {
  let data = initial
  return {
    load: async () => data,
    save: async (settings) => {
      data = settings
    },
    snapshot: () => data
  }
}

export function browserStorage(): SettingsStorage {
  return {
    load: async () => {
      if (typeof window !== 'undefined' && window.mycad?.loadSettings) {
        const disk = await window.mycad.loadSettings()
        if (disk) return disk
      }
      try {
        const text = localStorage.getItem(SETTINGS_KEY)
        return text ? JSON.parse(text) : null
      } catch {
        return null
      }
    },
    save: async (settings) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      if (typeof window !== 'undefined' && window.mycad?.saveSettings) {
        await window.mycad.saveSettings(settings)
      }
    }
  }
}
