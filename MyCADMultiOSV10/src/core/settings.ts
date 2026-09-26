export type Lang = 'ko' | 'en'
export type ThemeId = 'dark' | 'light' | 'blueprint' | 'graphite' | 'contrast'
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
    snap: 10
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
  const themes: ThemeId[] = ['dark', 'light', 'blueprint', 'graphite', 'contrast']
  const theme = themes.includes(raw.theme as ThemeId) ? (raw.theme as ThemeId) : base.theme
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
    snap: typeof raw.snap === 'number' ? Math.max(0, raw.snap) : base.snap
  }
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
