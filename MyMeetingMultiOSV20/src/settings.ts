// The app's settings: what is stored, its limits and its validation. Pure, so anything read from
// settings.json is made valid here and the rules can be tested without a window.
import { BACKGROUND_KINDS, isBackgroundKind } from './start/backgrounds'
import { DEFAULT_PAGE_SETUP, sanitizePageSetup, type PageSetup } from './print/pageSetup'
import { CUSTOM_THEME_PREFIX, DEFAULT_THEME_ID, THEME_COLOR_KEYS, isThemeId, themeById, themeColors, type CustomTheme, type ThemeColors } from './themes'

export type Locale = 'ko' | 'en'

export const MAX_CUSTOM_THEMES = 24
export const MAX_RECENT = 12
export const SPEED_MIN = 0
export const SPEED_MAX = 300
export const SPEED_STEP = 10
export const DEFAULT_SPEED = 100
export const REDUCED_MOTION_SPEED = 40
export const OPACITY_MIN = 20
export const OPACITY_MAX = 100
export const OPACITY_STEP = 5
export const SHUFFLE_SECONDS = 20
export const START_CARDS = ['hero', 'actions', 'recent', 'templates', 'theme', 'background'] as const
export const FONT_SIZE_MIN = 8
export const FONT_SIZE_MAX = 20

export type StartSettings = {
  showOnStartup: boolean
  askTutorial: boolean
  background: string
  speed: number | null
  shuffle: boolean
  cardOpacity: number
  layout: unknown
}

export type GeneralSettings = {
  /** Section numbers (1, 2, 2.1 …) in the finished document. */
  numbering: boolean
  /** The document font; empty is the system's. */
  fontFamily: string
  /** The document text size, pt. */
  fontSizePt: number
  /** Reopen the last file at the start, instead of the autosaved draft only. */
  reopenLast: boolean
  /** The date of a new meeting is today. */
  dateToday: boolean
}

export type AppSettings = {
  language: Locale
  theme: string
  customThemes: CustomTheme[]
  startScreen: StartSettings
  recent: string[]
  general: GeneralSettings
  outline: boolean
  /** The finished document beside the form. */
  preview: boolean
  /** Its width in px; null is the default. */
  previewWidth: number | null
  pageSetup: PageSetup
}

export const PREVIEW_MIN = 260
export const PREVIEW_MAX = 1400

export const DEFAULT_GENERAL: GeneralSettings = { numbering: true, fontFamily: '', fontSizePt: 10.5, reopenLast: false, dateToday: true }

export const DEFAULT_START_SCREEN: StartSettings = {
  showOnStartup: true,
  askTutorial: true,
  background: BACKGROUND_KINDS[0],
  speed: null,
  shuffle: false,
  cardOpacity: 85,
  layout: null,
}

const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const stepped = (value: number, min: number, max: number, step: number) => Math.max(min, Math.min(max, Math.round(value / step) * step))

export const effectiveSpeed = (speed: number | null, reducedMotion: boolean) => speed ?? (reducedMotion ? REDUCED_MOTION_SPEED : DEFAULT_SPEED)

export function sanitizeStartScreen(value: unknown): StartSettings {
  const v = objectOf(value)
  const speed = v.speed === undefined || v.speed === null ? NaN : Number(v.speed)
  const opacity = v.cardOpacity === undefined || v.cardOpacity === null ? NaN : Number(v.cardOpacity)
  return {
    showOnStartup: v.showOnStartup !== false,
    askTutorial: v.askTutorial !== false,
    background: isBackgroundKind(v.background) && BACKGROUND_KINDS.includes(v.background) ? v.background : DEFAULT_START_SCREEN.background,
    speed: Number.isFinite(speed) ? stepped(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP) : null,
    shuffle: v.shuffle === true,
    cardOpacity: Number.isFinite(opacity) ? stepped(opacity, OPACITY_MIN, OPACITY_MAX, OPACITY_STEP) : DEFAULT_START_SCREEN.cardOpacity,
    layout: v.layout && typeof v.layout === 'object' && !Array.isArray(v.layout) ? v.layout : null,
  }
}

export function sanitizeGeneral(value: unknown): GeneralSettings {
  const v = objectOf(value)
  const size = Number(v.fontSizePt)
  return {
    numbering: v.numbering !== false,
    fontFamily: typeof v.fontFamily === 'string' ? v.fontFamily.slice(0, 120).replace(/['";{}]/g, '') : '',
    fontSizePt: Number.isFinite(size) ? Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(size * 2) / 2)) : DEFAULT_GENERAL.fontSizePt,
    reopenLast: v.reopenLast === true,
    dateToday: v.dateToday !== false,
  }
}

const ID = /^custom-[a-z0-9][a-z0-9-]{0,39}$/
const HEX = /^#[0-9a-f]{6}$/i

export function sanitizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: CustomTheme[] = []
  for (const entry of value) {
    const raw = objectOf(entry)
    const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : ''
    if (!ID.test(id) || seen.has(id)) continue
    const mode = raw.mode === 'dark' ? 'dark' : 'light'
    const fallback = themeColors(themeById(mode === 'dark' ? 'dark-midnight' : 'light-classic'))
    const given = objectOf(raw.colors)
    const colors = {} as ThemeColors
    for (const key of THEME_COLOR_KEYS) {
      const color = given[key]
      colors[key] = typeof color === 'string' && HEX.test(color) ? color.toLowerCase() : fallback[key]
    }
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 40) : id
    seen.add(id)
    result.push({ id, name, mode, colors })
    if (result.length >= MAX_CUSTOM_THEMES) break
  }
  return result
}

export function newCustomThemeId(existing: { id: string }[]) {
  for (let index = existing.length + 1; ; index++) {
    const id = `${CUSTOM_THEME_PREFIX}${index}`
    if (!existing.some((item) => item.id === id)) return id
  }
}

export function customThemeFrom(baseId: string, name: string, existing: { id: string }[]): CustomTheme {
  const base = themeById(baseId)
  return { id: newCustomThemeId(existing), name: String(name).trim().slice(0, 40) || base.nameEn, mode: base.mode, colors: themeColors(base) }
}

export function sanitizeRecent(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
    if (result.length >= MAX_RECENT) break
  }
  return result
}

/** The newest first; the same file (in any case) appears once. */
export const addRecent = (list: string[], file: string) => sanitizeRecent([file, ...list])
export const removeRecent = (list: string[], file: string) => list.filter((item) => item.toLowerCase() !== file.toLowerCase())

/** The first start's custom theme, so the theme menu has one to show and edit. */
export const defaultCustomThemes = (language: Locale): CustomTheme[] => [customThemeFrom('light-classic', language === 'en' ? 'My Theme' : '내 테마', [])]

export function sanitizeSettings(value: unknown): AppSettings {
  const v = objectOf(value)
  const language: Locale = v.language === 'en' ? 'en' : 'ko'
  // Missing only before the first save: an emptied list stays empty.
  const customThemes = Array.isArray(v.customThemes) ? sanitizeCustomThemes(v.customThemes) : defaultCustomThemes(language)
  return {
    language,
    theme: isThemeId(v.theme, customThemes) ? v.theme : DEFAULT_THEME_ID,
    customThemes,
    startScreen: sanitizeStartScreen(v.startScreen),
    recent: sanitizeRecent(v.recent),
    general: sanitizeGeneral(v.general),
    outline: v.outline !== false,
    preview: v.preview === true,
    previewWidth: Number.isFinite(Number(v.previewWidth)) && v.previewWidth !== null ? Math.max(PREVIEW_MIN, Math.min(PREVIEW_MAX, Math.round(Number(v.previewWidth)))) : null,
    pageSetup: v.pageSetup ? sanitizePageSetup(v.pageSetup) : DEFAULT_PAGE_SETUP,
  }
}
