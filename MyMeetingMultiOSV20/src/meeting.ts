// The meeting minutes model. Pure: the lists the "+" buttons grow, reading any saved file (also
// version 1, where every list was one text with one entry per line) and the file format itself.

export type Attendance = 'present' | 'absent' | 'remote'
export type Attendee = { id: string; name: string; role: string; attendance: Attendance }
export type Entry = { id: string; text: string }
export type ActionItem = { id: string; task: string; owner: string; due: string; done: boolean }

/** The sections every meeting starts with; their contents are the meeting's own fields. */
export const BUILTIN_SECTIONS = ['info', 'attendees', 'agenda', 'discussion', 'decisions', 'actionItems'] as const
export type BuiltinSection = (typeof BUILTIN_SECTIONS)[number]
/** Sections the user adds: rich text, a bulleted or numbered list, tasks, or people. */
export const CUSTOM_KINDS = ['text', 'list', 'numbered', 'tasks', 'people'] as const
export type CustomKind = (typeof CUSTOM_KINDS)[number]
export type SectionKind = BuiltinSection | CustomKind
export const SECTION_ICON: Record<SectionKind, string> = {
  info: 'info', attendees: 'users', agenda: 'agenda', discussion: 'discussion', decisions: 'decision', actionItems: 'action',
  text: 'page', list: 'list', numbered: 'numbered', tasks: 'checklist', people: 'person',
}

/**
 * One card of the minutes, in page order. A built-in one has its kind as id and only an optional
 * title and icon; an added one also holds its contents.
 */
export type Section = { id: string; kind: SectionKind; title: string; icon: string; body: string; entries: Entry[]; tasks: ActionItem[]; people: Attendee[] }

export type Meeting = {
  sections: Section[]
  title: string
  date: string
  startTime: string
  endTime: string
  location: string
  organizer: string
  recorder: string
  attendees: Attendee[]
  agenda: Entry[]
  /** The discussion, as Markdown, edited WYSIWYG. */
  body: string
  decisions: Entry[]
  actionItems: ActionItem[]
}

export type ListKey = 'attendees' | 'agenda' | 'decisions' | 'actionItems'
export const FILE_VERSION = 2
export const ATTENDANCE: Attendance[] = ['present', 'remote', 'absent']

let counter = 0
/** Unique within a session and across saved files, which are read back with their own ids. */
export const newId = (prefix = 'i') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const newAttendee = (name = '', role = ''): Attendee => ({ id: newId('a'), name, role, attendance: 'present' })
export const newEntry = (text = ''): Entry => ({ id: newId('e'), text })
export const newAction = (task = '', owner = '', due = ''): ActionItem => ({ id: newId('t'), task, owner, due, done: false })

export const isBuiltin = (kind: string): kind is BuiltinSection => (BUILTIN_SECTIONS as readonly string[]).includes(kind)
export const isCustomKind = (kind: string): kind is CustomKind => (CUSTOM_KINDS as readonly string[]).includes(kind)

export const newSection = (kind: SectionKind, title = '', icon = ''): Section => ({
  id: isBuiltin(kind) ? kind : newId('s'),
  kind,
  title,
  icon,
  body: '',
  entries: [],
  tasks: [],
  people: [],
})

export const defaultSections = (): Section[] => BUILTIN_SECTIONS.map((kind) => newSection(kind))

export function emptyMeeting(): Meeting {
  return { sections: defaultSections(), title: '', date: '', startTime: '', endTime: '', location: '', organizer: '', recorder: '', attendees: [], agenda: [], body: '', decisions: [], actionItems: [] }
}

const sectionEmpty = (s: Section) => !s.body.trim() && !s.entries.length && !s.tasks.length && !s.people.length
const defaultLayout = (m: Meeting) => m.sections.length === BUILTIN_SECTIONS.length && m.sections.every((s, index) => s.kind === BUILTIN_SECTIONS[index] && !s.title && !s.icon)

export function isEmpty(m: Meeting) {
  const texts = [m.title, m.date, m.startTime, m.endTime, m.location, m.organizer, m.recorder, m.body]
  return texts.every((text) => !text.trim()) && !m.attendees.length && !m.agenda.length && !m.decisions.length && !m.actionItems.length && defaultLayout(m) && m.sections.every(sectionEmpty)
}

/* ------------------------------------------------------------ sections */

/** Puts a section after `after` (or at the end). A built-in already on the page is not added twice. */
export function addSection(m: Meeting, section: Section, after?: string | null): Meeting {
  if (m.sections.some((s) => s.id === section.id)) return m
  const at = after ? m.sections.findIndex((s) => s.id === after) + 1 : m.sections.length
  const index = at > 0 ? at : m.sections.length
  return { ...m, sections: [...m.sections.slice(0, index), section, ...m.sections.slice(index)] }
}

export function updateSection(m: Meeting, id: string, patch: Partial<Section> | ((s: Section) => Partial<Section>)): Meeting {
  return { ...m, sections: m.sections.map((s) => (s.id === id ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)) }
}

/** A built-in section's contents stay in the meeting, so adding it again brings them back. */
export const removeSection = (m: Meeting, id: string): Meeting => ({ ...m, sections: m.sections.filter((s) => s.id !== id) })

/** Moves a section so it ends up at `to` (an index in the list without it). */
export function moveSectionTo(m: Meeting, id: string, to: number): Meeting {
  const from = m.sections.findIndex((s) => s.id === id)
  if (from < 0) return m
  const rest = m.sections.filter((s) => s.id !== id)
  const index = Math.max(0, Math.min(rest.length, to))
  if (index === from) return m
  return { ...m, sections: [...rest.slice(0, index), m.sections[from], ...rest.slice(index)] }
}

export function moveSection(m: Meeting, id: string, by: -1 | 1): Meeting {
  const from = m.sections.findIndex((s) => s.id === id)
  return from < 0 ? m : moveSectionTo(m, id, from + by)
}

/** The built-ins that are not on the page, so they can be added back. */
export const missingBuiltins = (m: Meeting) => BUILTIN_SECTIONS.filter((kind) => !m.sections.some((s) => s.kind === kind))

export const sectionIcon = (s: Section) => s.icon || SECTION_ICON[s.kind]

/* -------------------------------------------- rows of an added section */

export type SectionListKey = 'entries' | 'tasks' | 'people'
export const listKeyOf = (kind: CustomKind): SectionListKey | null => (kind === 'tasks' ? 'tasks' : kind === 'people' ? 'people' : kind === 'text' ? null : 'entries')
export const newRow = (key: SectionListKey) => (key === 'tasks' ? newAction() : key === 'people' ? newAttendee() : newEntry())

/* -------------------------------------------------------------- lists */

export function addItem(m: Meeting, key: ListKey, after?: string): { meeting: Meeting; id: string } {
  const item = key === 'attendees' ? newAttendee() : key === 'actionItems' ? newAction() : newEntry()
  const list = m[key] as { id: string }[]
  const at = after ? list.findIndex((entry) => entry.id === after) + 1 : list.length
  const next = [...list.slice(0, at || list.length), item, ...list.slice(at || list.length)]
  return { meeting: { ...m, [key]: next }, id: item.id }
}

export function updateItem<K extends ListKey>(m: Meeting, key: K, id: string, patch: Partial<Meeting[K][number]>): Meeting {
  return { ...m, [key]: (m[key] as { id: string }[]).map((item) => (item.id === id ? { ...item, ...patch } : item)) }
}

export function removeItem(m: Meeting, key: ListKey, id: string): Meeting {
  return { ...m, [key]: (m[key] as { id: string }[]).filter((item) => item.id !== id) }
}

export function moveItem(m: Meeting, key: ListKey, id: string, by: -1 | 1): Meeting {
  const list = [...(m[key] as { id: string }[])]
  const from = list.findIndex((item) => item.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= list.length) return m
  ;[list[from], list[to]] = [list[to], list[from]]
  return { ...m, [key]: list }
}

/* ------------------------------------------------------- reading files */

const str = (value: unknown, max = 2000) => (typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' ? String(value) : '')
const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const linesOf = (value: unknown) => str(value, 1e6).split('\n').map((line) => line.trim()).filter(Boolean)
const idOf = (value: unknown, prefix: string) => (typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : newId(prefix))

/** "Kim Suho (Planning)" → name and role. */
export function parseAttendeeLine(line: string): Attendee {
  const match = line.match(/^(.*?)\s*[(（]([^)）]*)[)）]\s*$/)
  return match ? newAttendee(match[1].trim(), match[2].trim()) : newAttendee(line.trim())
}

/** "Owner — task (by 9/11)" → owner, task and due date, as version 1 wrote them. */
export function parseActionLine(line: string): ActionItem {
  let rest = line.trim()
  let due = ''
  const dueMatch = rest.match(/\s*[(（]([^)）]*)[)）]\s*$/)
  if (dueMatch) {
    due = dueMatch[1].replace(/^(by|until|due)\s+/i, '').replace(/\s*까지$/, '').trim()
    rest = rest.slice(0, dueMatch.index).trim()
  }
  const parts = rest.split(/\s+[—–-]\s+/)
  if (parts.length >= 2) return newAction(parts.slice(1).join(' — ').trim(), parts[0].trim(), due)
  return newAction(rest, '', due)
}

function attendeesOf(value: unknown): Attendee[] {
  if (typeof value === 'string') return linesOf(value).map(parseAttendeeLine)
  if (!Array.isArray(value)) return []
  return value.slice(0, 500).map((raw) => {
    const v = objectOf(raw)
    const attendance = ATTENDANCE.includes(v.attendance as Attendance) ? (v.attendance as Attendance) : 'present'
    return { id: idOf(v.id, 'a'), name: str(v.name, 200), role: str(v.role, 200), attendance }
  })
}

function entriesOf(value: unknown): Entry[] {
  if (typeof value === 'string') return linesOf(value).map((text) => newEntry(text))
  if (!Array.isArray(value)) return []
  return value.slice(0, 500).map((raw) => (typeof raw === 'string' ? newEntry(raw) : { id: idOf(objectOf(raw).id, 'e'), text: str(objectOf(raw).text) }))
}

function actionsOf(value: unknown): ActionItem[] {
  if (typeof value === 'string') return linesOf(value).map(parseActionLine)
  if (!Array.isArray(value)) return []
  return value.slice(0, 500).map((raw) => {
    const v = objectOf(raw)
    return { id: idOf(v.id, 't'), task: str(v.task), owner: str(v.owner, 200), due: str(v.due, 100), done: v.done === true }
  })
}

const ICON_NAME = /^[A-Za-z][\w-]{0,40}$/

function sectionsOf(value: unknown): Section[] {
  if (!Array.isArray(value)) return defaultSections()
  const seen = new Set<string>()
  const out: Section[] = []
  for (const raw of value.slice(0, 100)) {
    const v = objectOf(raw)
    const kind = typeof v.kind === 'string' && (isBuiltin(v.kind) || isCustomKind(v.kind)) ? v.kind : null
    if (!kind) continue
    const id = isBuiltin(kind) ? kind : idOf(v.id, 's')
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      kind,
      title: str(v.title, 200),
      icon: typeof v.icon === 'string' && ICON_NAME.test(v.icon) ? v.icon : '',
      body: isBuiltin(kind) ? '' : str(v.body, 50_000_000),
      entries: isBuiltin(kind) ? [] : entriesOf(v.entries),
      tasks: isBuiltin(kind) ? [] : actionsOf(v.tasks),
      people: isBuiltin(kind) ? [] : attendeesOf(v.people),
    })
  }
  return out
}

/** Anything read from a file or the draft, made valid. Version 1 files are converted. */
export function sanitizeMeeting(value: unknown): Meeting {
  const v = objectOf(objectOf(value).meeting ?? value)
  return {
    sections: sectionsOf(v.sections),
    title: str(v.title, 300),
    date: str(v.date, 100),
    startTime: str(v.startTime, 20),
    endTime: str(v.endTime, 20),
    location: str(v.location, 300),
    organizer: str(v.organizer, 200),
    recorder: str(v.recorder, 200),
    attendees: attendeesOf(v.attendees),
    agenda: entriesOf(v.agenda),
    body: str(v.body, 50_000_000),
    decisions: entriesOf(v.decisions),
    actionItems: actionsOf(v.actionItems),
  }
}

/** The .mtg file: JSON, so other tools can read it too. */
export function serializeMeeting(m: Meeting): string {
  return JSON.stringify({ app: 'MyMeeting', version: FILE_VERSION, meeting: m }, null, 2)
}

export function parseMeetingFile(text: string): Meeting {
  const data = JSON.parse(text.replace(/^\uFEFF/, '')) as unknown
  if (!data || typeof data !== 'object') throw new Error('not a MyMeeting file')
  return sanitizeMeeting(data)
}

export function meetingBaseName(m: Meeting, fallback: string) {
  return (m.title.trim() || fallback).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback
}

export const timeRange = (m: Meeting) => {
  const a = normalizeTime(m.startTime) ?? m.startTime.trim()
  const b = normalizeTime(m.endTime) ?? m.endTime.trim()
  return a && b ? `${a} – ${b}` : a || b
}

export const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/
export const toMinutes = (text: string) => {
  const match = text.trim().match(TIME_PATTERN)
  return match ? Number(text.split(':')[0]) * 60 + Number(text.split(':')[1]) : null
}

const DAY_MINUTES = 24 * 60
/** Minutes as HH:MM; past midnight it carries on from 00:00. */
export const minutesToTime = (minutes: number) => {
  const inDay = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES
  return `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`
}
/** How long from one time to the next; an end before the start is on the next day. */
export const minutesBetween = (from: number, to: number) => (to - from + DAY_MINUTES) % DAY_MINUTES

const MERIDIEM = '(오전|오후|a\\.?m\\.?|p\\.?m\\.?|a|p)'
const TIME_TEXT = new RegExp(`^(?:${MERIDIEM}\\s*)?(\\d{1,2})(?:\\s*(?:시|:|\\.|\\s)\\s*(\\d{1,2}|반)?\\s*분?)?(?:\\s*${MERIDIEM})?$`)

/**
 * A time however it was typed, as HH:MM: 9 / 930 / 9.30 / 9시 반 / 오후 3시 / 3:30pm. Empty stays empty;
 * null means it can't be read as a time. A bare hour is taken literally: 3 is 03:00.
 */
export function normalizeTime(text: string): string | null {
  const typed = text.trim().toLowerCase().replace(/：/g, ':')
  if (!typed) return ''
  // Three or four digits in a row are hours and minutes.
  const match = typed.replace(/^(\D*)(\d{1,2})(\d{2})(\D*)$/, '$1$2:$3$4').match(TIME_TEXT)
  if (!match) return null
  const [, before, hourText, minuteText, after] = match
  if (before && after) return null
  const meridiem = before ?? after
  const minute = minuteText === '반' ? 30 : Number(minuteText ?? 0)
  let hour = Number(hourText)
  if (meridiem) {
    const pm = meridiem === '오후' || meridiem.startsWith('p')
    if (hour === 0 || (!pm && hour > 12)) return null
    if (hour < 12 && pm) hour += 12
    else if (hour === 12 && !pm) hour = 0
  }
  return hour < 24 && minute < 60 ? minutesToTime(hour * 60 + minute) : null
}

/**
 * The start set to a finished time. The meeting keeps its length: `before` is the start it had, and
 * an end not set yet becomes an hour later.
 */
export function withStartTime(m: Meeting, start: string, before: string): Meeting {
  const next = toMinutes(start)
  if (next === null) return { ...m, startTime: start }
  const was = toMinutes(before)
  const end = toMinutes(m.endTime)
  const length = !m.endTime.trim() ? 60 : was !== null && end !== null ? minutesBetween(was, end) : null
  return { ...m, startTime: start, endTime: length === null ? m.endTime : minutesToTime(next + length) }
}

export function todayText(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Counts for the status bar and the outline. */
export function stats(m: Meeting) {
  const words = m.body.replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)|[#*_`>|~-]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  return {
    attendees: m.attendees.length,
    agenda: m.agenda.length,
    decisions: m.decisions.length,
    actions: m.actionItems.length,
    actionsDone: m.actionItems.filter((item) => item.done).length,
    words,
  }
}
