// The meeting templates in /templates: one JSON file each, in both languages. Bundled, so they need
// no file access; a new file there shows up on the start screen by itself.
import { sanitizeMeeting, type Meeting } from './meeting'
import type { Locale } from './settings'

export type Template = { id: string; order: number; name: Record<Locale, string>; description?: Record<Locale, string>; ko: unknown; en: unknown; icon?: string }

const modules = import.meta.glob<Template>('../templates/*.json', { eager: true, import: 'default' })

export const TEMPLATES: Template[] = Object.values(modules).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))

export const templateName = (template: Template, language: Locale) => template.name?.[language] || template.name?.en || template.id

/** The template as a new meeting, in the given language. Old one-per-line lists are converted. */
export const templateMeeting = (template: Template, language: Locale): Meeting => sanitizeMeeting(template[language] ?? template.en)

const ICONS: Record<string, string> = { sample: 'samples', general: 'agenda', scrum: 'clock', project: 'design', retrospective: 'sync', board: 'users', oneonone: 'person', client: 'discussion' }
export const templateIcon = (template: Template) => template.icon ?? ICONS[template.id] ?? 'file'

/** The line under the name: the file's own, or for the first templates the one in the locale. */
export const templateDescription = (template: Template, language: Locale, fallback: (key: string) => string) =>
  template.description?.[language] || template.description?.en || fallback(`template.${template.id}`)
