import { createCustomTheme, sanitizeTheme, themeById, themeIds, CUSTOM_THEME_ID, type Theme, type ThemeId } from './themes'
import { defaultPageSetup, sanitizePageSetup, type PageSetup } from './print'
import { sanitizeInstalled, type InstalledAddon } from './addons'
import { NAVIGATION_STYLES, type NavigationStyle } from './viewnav'
import { isUnitSchema, type UnitSchema } from './units'

export type Lang = 'ko' | 'en'

/** Every language the interface ships with. */
export const LANGUAGES: Lang[] = ['ko', 'en']
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
  /** show the origin axes in the viewport: all three at once */
  showAxes: boolean
  /** default page setup used by the print dialog */
  print: PageSetup
  /** extensions installed through the addon manager */
  addons: InstalledAddon[]
  /** the user's own editable palette, selected with the id "custom" */
  customTheme: Theme
  /** viewport lighting rig */
  light: LightRig
  /** every light in the scene; `light` is the one being edited */
  lights: LightRig[]
  /** which light the toolbar, the settings window and the gizmo work on */
  activeLight: number
  /** camera projection, as FreeCAD's View menu switches it */
  projection: Projection
  /** mouse navigation style */
  navigation: NavigationStyle
  /** unit schema used to show lengths, areas and volumes */
  units: UnitSchema
  /** where the scale marker sits on the canvas, null for its usual corner */
  scaleMarker: { x: number; y: number } | null
  /** section planes along each axis */
  clip: ClipPlane[]
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

/** How many lights one scene may hold. */
export const MAX_LIGHTS = 8

/** A second, third … light: same rig, a different colour to tell them apart. */
export const LIGHT_COLORS = ['#ffffff', '#ffd9a0', '#a8d8ff', '#ffc4d6', '#c9f7c0', '#e3c9ff', '#fff1a8', '#b9f2ef']

/** A new light for the scene, placed where the one before it is not. */
export function newLight(existing: LightRig[]): LightRig {
  const base = defaultLight()
  const index = existing.length
  return {
    ...base,
    kind: index % 2 === 1 ? 'point' : base.kind,
    color: LIGHT_COLORS[index % LIGHT_COLORS.length],
    azimuth: (base.azimuth + index * 95) % 360,
    elevation: Math.max(-20, Math.min(90, base.elevation - index * 12)),
    intensity: index === 0 ? base.intensity : Math.max(0.3, base.intensity * 0.6)
  }
}

/**
 * Keep `light`, `lights` and `activeLight` telling the same story: whatever
 * was edited wins, the active index stays inside the list, and the fill light
 * is shared by the whole rig because there is only one scene to fill.
 */
export function syncLights(
  settings: { light: LightRig; lights?: LightRig[]; activeLight?: number },
  edited: 'light' | 'list' = 'light'
): { light: LightRig; lights: LightRig[]; activeLight: number } {
  const list = (settings.lights?.length ? settings.lights : [settings.light]).slice(0, MAX_LIGHTS).map(sanitizeLight)
  const active = Math.max(0, Math.min(list.length - 1, settings.activeLight ?? 0))
  if (edited === 'list') {
    return { light: { ...list[active] }, lights: list, activeLight: active }
  }
  const light = sanitizeLight(settings.light)
  // The ambient fill belongs to the scene, not to one lamp.
  const lights = list.map((item, index) => (index === active ? { ...light } : { ...item, ambient: light.ambient }))
  return { light, lights, activeLight: active }
}

/** The scale marker's place on the canvas, or null for the default corner. */
function sanitizeMarker(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as { x?: unknown; y?: unknown }
  if (typeof value.x !== 'number' || typeof value.y !== 'number') return null
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null
  return { x: value.x, y: value.y }
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
    lights: [defaultLight()],
    activeLight: 0,
    projection: 'perspective',
    navigation: 'cad',
    units: 'mm',
    scaleMarker: null,
    clip: defaultClip(),
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
    ...syncLights(
      {
        light: sanitizeLight(raw.light),
        lights: Array.isArray(raw.lights) ? raw.lights.map(sanitizeLight) : undefined,
        activeLight: typeof raw.activeLight === 'number' ? raw.activeLight : 0
      },
      // A file written before lights were a list has only `light` to go on.
      Array.isArray(raw.lights) && raw.lights.length > 0 ? 'list' : 'light'
    ),
    projection: raw.projection === 'orthographic' ? 'orthographic' : 'perspective',
    navigation: NAVIGATION_STYLES.includes(raw.navigation as NavigationStyle) ? (raw.navigation as NavigationStyle) : base.navigation,
    units: isUnitSchema(raw.units) ? raw.units : base.units,
    scaleMarker: sanitizeMarker(raw.scaleMarker),
    clip: sanitizeClip(raw.clip),
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
