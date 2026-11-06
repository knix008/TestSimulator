// The app's settings: what is stored, its limits and its validation. Pure, so anything read from
// settings.json can be made valid here and the rules can be tested without the UI.
import { BACKGROUND_KINDS, isBackgroundKind } from './start/backgrounds'
import { CUSTOM_THEME_PREFIX, DEFAULT_THEME_ID, THEME_COLOR_KEYS, isThemeId, themeById, themeColors, type CustomTheme, type ThemeColors } from './themes'
import { DEFAULT_DIAGRAM_THEME, isDiagramThemeId } from './diagramThemes'
import { DEFAULT_LINE_THEME, isLineThemeId } from './lineThemes'
import { DEFAULT_MEMO, sanitizeMemo } from './memo'
import { sanitizePageSetup, type PageSetup } from './pageSetup'
import type { DiagramMode, LayoutDirection, Locale, MemoStyle, ShapeType } from './types'

export const MAX_CUSTOM_THEMES = 24
export const MAX_RECENT = 12
export const SPEED_MIN = 0
export const SPEED_MAX = 300
export const SPEED_STEP = 10
export const DEFAULT_SPEED = 100
/** The default speed when the system asks for reduced motion: slower, never stopped. */
export const REDUCED_MOTION_SPEED = 40
export const OPACITY_MIN = 20
export const OPACITY_MAX = 100
export const OPACITY_STEP = 5
export const SHUFFLE_SECONDS = 20
export const START_CARDS = ['hero', 'actions', 'recent', 'samples', 'theme', 'background'] as const

export const MODES: DiagramMode[] = ['mindmap', 'fishbone']
export const MINDMAP_LAYOUTS: LayoutDirection[] = ['radial', 'ttb', 'btt', 'ltr', 'rtl']
export const FISHBONE_LAYOUTS: LayoutDirection[] = ['ltr', 'rtl']
export const SHAPES: ShapeType[] = ['rounded', 'rect', 'stadium', 'ellipse', 'diamond', 'parallelogram', 'trapezoid', 'hexagon', 'octagon', 'chevron', 'cylinder', 'note']

export type GeneralSettings = {
  reopenLast: boolean
  newMode: DiagramMode
  mindmapLayout: LayoutDirection
  fishboneLayout: LayoutDirection
  newShape: ShapeType
  newLineTheme: string
  newDiagramTheme: string
  /** What a new memo looks like. */
  memo: MemoStyle
}

export type StartSettings = {
  showOnStartup: boolean
  /** Asks at the start whether to take a tutorial. */
  askTutorial: boolean
  background: string
  speed: number | null
  shuffle: boolean
  cardOpacity: number
  layout: unknown
}

export type AppSettings = {
  language: Locale
  theme: string
  customThemes: CustomTheme[]
  startScreen: StartSettings
  recent: string[]
  general: GeneralSettings
  showGrid: boolean
  showRulers: boolean
  leftPanel: boolean
  rightPanel: boolean
  showMemos: boolean
  pageSetup: PageSetup
}

export const DEFAULT_GENERAL: GeneralSettings = {
  reopenLast: false,
  newMode: 'mindmap',
  mindmapLayout: 'radial',
  fishboneLayout: 'ltr',
  newShape: 'rounded',
  newLineTheme: DEFAULT_LINE_THEME,
  newDiagramTheme: DEFAULT_DIAGRAM_THEME,
  memo: DEFAULT_MEMO,
}

const oneOf = <T,>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback)
const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

/** The General tab: what a new diagram starts with, and what happens at the start. */
export function sanitizeGeneral(value: unknown): GeneralSettings {
  const v = objectOf(value)
  return {
    reopenLast: v.reopenLast === true,
    newMode: oneOf(v.newMode, MODES, DEFAULT_GENERAL.newMode),
    mindmapLayout: oneOf(v.mindmapLayout, MINDMAP_LAYOUTS, DEFAULT_GENERAL.mindmapLayout),
    fishboneLayout: oneOf(v.fishboneLayout, FISHBONE_LAYOUTS, DEFAULT_GENERAL.fishboneLayout),
    newShape: oneOf(v.newShape, SHAPES, DEFAULT_GENERAL.newShape),
    newLineTheme: isLineThemeId(v.newLineTheme) ? v.newLineTheme : DEFAULT_GENERAL.newLineTheme,
    newDiagramTheme: isDiagramThemeId(v.newDiagramTheme) ? v.newDiagramTheme : DEFAULT_GENERAL.newDiagramTheme,
    memo: sanitizeMemo(v.memo),
  }
}

export const DEFAULT_START_SCREEN: StartSettings = {
  showOnStartup: true,
  askTutorial: true,
  background: BACKGROUND_KINDS[0],
  speed: null,
  shuffle: false,
  cardOpacity: 85,
  layout: null,
}

const stepped = (value: number, min: number, max: number, step: number) => Math.max(min, Math.min(max, Math.round(value / step) * step))

export const effectiveSpeed = (speed: number | null, reducedMotion: boolean) => speed ?? (reducedMotion ? REDUCED_MOTION_SPEED : DEFAULT_SPEED)

export function sanitizeStartScreen(value: unknown): StartSettings {
  const v = objectOf(value)
  const speed = v.speed === undefined || v.speed === null ? NaN : Number(v.speed)
  const opacity = v.cardOpacity === undefined || v.cardOpacity === null ? NaN : Number(v.cardOpacity)
  return {
    showOnStartup: v.showOnStartup !== false,
    askTutorial: v.askTutorial !== false,
    background: isBackgroundKind(v.background) ? v.background : DEFAULT_START_SCREEN.background,
    speed: Number.isFinite(speed) ? stepped(speed, SPEED_MIN, SPEED_MAX, SPEED_STEP) : null,
    shuffle: v.shuffle === true,
    cardOpacity: Number.isFinite(opacity) ? stepped(opacity, OPACITY_MIN, OPACITY_MAX, OPACITY_STEP) : DEFAULT_START_SCREEN.cardOpacity,
    layout: v.layout && typeof v.layout === 'object' && !Array.isArray(v.layout) ? v.layout : null,
  }
}

const ID = /^custom-[a-z0-9][a-z0-9-]{0,39}$/
const HEX = /^#[0-9a-f]{6}$/i

/** Keeps only well-formed user themes: unique ids, #rrggbb colours, a name. */
export function sanitizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: CustomTheme[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
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

/** A new user theme copied from any theme, built-in or user. */
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

export const THEME_AREA_MIN = 90

/** Anything read from settings.json, made valid. Keys this module does not know are dropped from the state. */
export function sanitizeSettings(value: unknown): AppSettings {
  const v = objectOf(value)
  const customThemes = sanitizeCustomThemes(v.customThemes)
  return {
    language: v.language === 'en' ? 'en' : 'ko',
    theme: isThemeId(v.theme, customThemes) ? v.theme : DEFAULT_THEME_ID,
    customThemes,
    startScreen: sanitizeStartScreen(v.startScreen),
    recent: sanitizeRecent(v.recent),
    general: sanitizeGeneral(v.general),
    showGrid: v.showGrid !== false,
    showRulers: v.showRulers !== false,
    leftPanel: v.leftPanel !== false,
    rightPanel: v.rightPanel !== false,
    showMemos: v.showMemos !== false,
    pageSetup: sanitizePageSetup(v.pageSetup),
  }
}
