/**
 * Application settings: everything the program remembers between runs.
 *
 * Stored as one JSON object in localStorage, which lives in the profile
 * folder on the desktop and in the browser's storage on the web. The
 * background image is too large for that and lives in IndexedDB (see
 * `store.ts`); only its opacity, fit and a flag are kept here.
 */
import { defaultWriterOptions, type WriterOptions } from './doc/options'
import type { FormatId } from './doc/formats'
import { isFormatId } from './doc/formats'
import { isTheme, type Theme } from '../themes'

export type Language = 'ko' | 'en'
export type ViewMode = 'source' | 'split' | 'output'

export type RecentFile = { path: string; name: string; format: FormatId; at: number }

export type AppSettings = {
  language: Language
  theme: Theme
  backgroundOpacity: number
  hasBackgroundImage: boolean
  backgroundFit: 'cover' | 'contain' | 'tile' | 'center'
  fontFamily: string
  fontSize: number
  fontBold: boolean
  fontItalic: boolean
  previewFontFamily: string
  previewFontSize: number
  zoom: number
  viewMode: ViewMode
  leftPanel: boolean
  rightPanel: boolean
  leftWidth: number
  rightWidth: number
  wordWrap: boolean
  lineNumbers: boolean
  autoConvert: boolean
  autoConvertDelay: number
  defaultFrom: FormatId
  defaultTo: FormatId
  recentFiles: RecentFile[]
  lastOpenDirectory: string
  lastSaveDirectory: string
  lastExportDirectory: string
  lastBatchDirectory: string
  writerDefaults: WriterOptions
  confirmClose: boolean
  restoreSession: boolean
  showWelcome: boolean
}

export const defaultSettings: AppSettings = {
  language: 'ko',
  theme: 'dark',
  backgroundOpacity: 30,
  hasBackgroundImage: false,
  backgroundFit: 'cover',
  fontFamily: 'Consolas',
  fontSize: 14,
  fontBold: false,
  fontItalic: false,
  previewFontFamily: '',
  previewFontSize: 15,
  zoom: 100,
  viewMode: 'split',
  leftPanel: true,
  rightPanel: true,
  leftWidth: 270,
  rightWidth: 320,
  wordWrap: true,
  lineNumbers: false,
  autoConvert: true,
  autoConvertDelay: 400,
  defaultFrom: 'markdown',
  defaultTo: 'html',
  recentFiles: [],
  lastOpenDirectory: '',
  lastSaveDirectory: '',
  lastExportDirectory: '',
  lastBatchDirectory: '',
  writerDefaults: { ...defaultWriterOptions },
  confirmClose: true,
  restoreSession: true,
  showWelcome: true,
}

export const SETTINGS_KEY = 'mydocumentconverter.settings.v1'
export const MAX_RECENT = 10

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return detectDefaults()
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return sanitize({ ...detectDefaults(), ...parsed, writerDefaults: { ...defaultWriterOptions, ...(parsed.writerDefaults ?? {}) } })
  } catch {
    return detectDefaults()
  }
}

function detectDefaults(): AppSettings {
  const language: Language = typeof navigator !== 'undefined' && /^ko/i.test(navigator.language) ? 'ko' : 'en'
  const dark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  return { ...defaultSettings, language, theme: dark ? 'dark' : 'light' }
}

function sanitize(settings: AppSettings): AppSettings {
  const clamp = (value: number, min: number, max: number, fallback: number) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback)
  return {
    ...settings,
    language: settings.language === 'en' ? 'en' : 'ko',
    theme: isTheme(settings.theme) ? settings.theme : 'dark',
    backgroundOpacity: clamp(settings.backgroundOpacity, 0, 100, 30),
    fontSize: clamp(settings.fontSize, 8, 48, 14),
    previewFontSize: clamp(settings.previewFontSize, 8, 48, 15),
    zoom: clamp(settings.zoom, 50, 300, 100),
    leftWidth: clamp(settings.leftWidth, 200, 600, 270),
    rightWidth: clamp(settings.rightWidth, 220, 700, 320),
    autoConvertDelay: clamp(settings.autoConvertDelay, 100, 5000, 400),
    defaultFrom: isFormatId(settings.defaultFrom) ? settings.defaultFrom : 'markdown',
    defaultTo: isFormatId(settings.defaultTo) ? settings.defaultTo : 'html',
    viewMode: settings.viewMode === 'source' || settings.viewMode === 'output' ? settings.viewMode : 'split',
    recentFiles: Array.isArray(settings.recentFiles) ? settings.recentFiles.filter((item) => item && typeof item.path === 'string').slice(0, MAX_RECENT) : [],
  }
}

export function saveSettings(settings: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage may be full or unavailable in a private window; the session goes on.
  }
}

export function addRecent(list: RecentFile[], entry: RecentFile): RecentFile[] {
  return [entry, ...list.filter((item) => item.path !== entry.path)].slice(0, MAX_RECENT)
}

export function removeRecent(list: RecentFile[], path: string): RecentFile[] {
  return list.filter((item) => item.path !== path)
}

/** The open tabs, saved so the next start can bring them back. */
export const SESSION_KEY = 'mydocumentconverter.session.v1'

export type SessionDoc = {
  name: string
  path: string | null
  source: string
  /** The text as last saved or opened, so "modified" survives a restart. */
  savedSource?: string
  from: FormatId
  to: FormatId
  options: Partial<WriterOptions>
  dirty: boolean
}

export function loadSession(): { docs: SessionDoc[]; active: number } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { docs: SessionDoc[]; active: number }
    if (!Array.isArray(parsed.docs)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveSession(session: { docs: SessionDoc[]; active: number }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // A very large document may not fit; the files themselves are still on disk.
  }
}
