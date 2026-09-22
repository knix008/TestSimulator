import type { ComponentType } from 'react'
import { BarChart3, BookOpen, Files, Globe, History, Info, Keyboard, Loader, Printer, Settings, Tag, TriangleAlert, Save } from 'lucide-react'
import { t } from './i18n'
import type { AppSettings, Language, RecentFile } from './lib/settings'
import type { ErrorReport } from './lib/errors'
import type { PageSize } from './lib/doc/options'

/** Names, icons and titles for every popup, apart from the components so the dialog module exports components only. */
export type DialogName =
  | 'settings' | 'about' | 'error' | 'unsaved' | 'progress' | 'print' | 'openRecent' | 'openUrl'
  | 'shortcuts' | 'formats' | 'metadata' | 'stats' | 'batch'

export type DialogResult = { action: string; [key: string]: unknown }

export type PrintDocument = { name: string; html: string; sourceHtml: string }

export type DialogPayload = {
  language: Language
  theme: string
  settings?: AppSettings
  error?: ErrorReport
  unsaved?: { names: string[] }
  progress?: { title: string; detail: string; value: number; cancellable: boolean; done: boolean }
  print?: {
    documents: PrintDocument[]
    current: number
    printers: { name: string; displayName: string; isDefault: boolean }[]
    pageSize: PageSize
    landscape: boolean
    marginMm: number
    desktop: boolean
  }
  recentFiles?: RecentFile[]
  metadata?: { title: string; author: string; date: string }
  stats?: Record<string, number | string>
  batch?: { files: { name: string; path: string; format: string }[]; to: string; desktop: boolean }
  version: string
  creator: string
  openId?: number
}

const icons: Record<DialogName, ComponentType<{ size?: number }>> = {
  settings: Settings,
  about: Info,
  error: TriangleAlert,
  unsaved: Save,
  progress: Loader,
  print: Printer,
  openRecent: History,
  openUrl: Globe,
  shortcuts: Keyboard,
  formats: BookOpen,
  metadata: Tag,
  stats: BarChart3,
  batch: Files,
}

export function dialogIcon(name: DialogName) {
  return icons[name] ?? Info
}

export function dialogTitle(name: DialogName, language: Language, payload?: DialogPayload): string {
  if (name === 'progress' && payload?.progress?.title) return payload.progress.title
  if (name === 'error' && payload?.error?.title) return `${t(language, 'dialog.error')}: ${payload.error.title}`
  return t(language, `dialog.${name}`)
}

/**
 * Dialogs whose window keeps one size however their content changes: the
 * ones with tabs (Settings, Formats), a page preview (Print) or a growing
 * list (Batch). Their content is laid out to fit inside the fixed frame.
 * Every other dialog takes the size of its content once, when it opens.
 * No dialog is resizable and none shows a scrollbar of its own.
 */
export const FIXED_SIZE_DIALOGS: ReadonlySet<string> = new Set(['settings', 'formats', 'print', 'batch'])

export function hasFixedSize(name: string) {
  return FIXED_SIZE_DIALOGS.has(name)
}

/** Results that keep the popup open: live edits rather than a final answer. */
export function keepsWindowOpen(action: string) {
  return action === 'settings' || action === 'forget' || action === 'clear' || action === 'backgroundChanged' || action === 'preview' || action === 'batchUpdate' || action === 'batchAdd' || action === 'batchRun'
}
