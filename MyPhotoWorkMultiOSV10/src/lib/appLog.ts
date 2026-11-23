/**
 * The bottom panel's record: what the app did (commands, files), what went wrong
 * (errors and warnings) and when. No DOM here, so it can be tested in Node.
 *
 * It keeps the last LOG_LIMIT entries in memory only; the log of one session is
 * what is useful, and an error report already carries its own copy of the details.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export type LogEntry = {
  id: number
  /** ms since the epoch */
  time: number
  level: LogLevel
  /** Where it came from: 'command', 'file', 'dialog:settings'… */
  source: string
  message: string
  /** The copyable text of an error report, when there is one. */
  details?: string
}

export const LOG_LIMIT = 500

type Listener = (entries: readonly LogEntry[]) => void

let entries: LogEntry[] = []
let nextId = 1
const listeners = new Set<Listener>()

const notify = () => {
  for (const listener of listeners) listener(entries)
}

export function addLog(level: LogLevel, source: string, message: string, details?: string) {
  const entry: LogEntry = { id: nextId++, time: Date.now(), level, source, message: String(message), details }
  entries = [...entries, entry].slice(-LOG_LIMIT)
  notify()
  return entry
}

export const logInfo = (source: string, message: string) => addLog('info', source, message)
export const logWarn = (source: string, message: string) => addLog('warn', source, message)
export const logError = (source: string, message: string, details?: string) => addLog('error', source, message, details)

export function logEntries(): readonly LogEntry[] {
  return entries
}

export function clearLog(level?: LogLevel) {
  entries = level ? entries.filter((entry) => entry.level !== level) : []
  notify()
}

export function subscribeLog(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** "14:03:07" in the viewer's clock. */
export function logTime(time: number) {
  const date = new Date(time)
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':')
}

/** The whole log as text, for the copy button. */
export function logText(list: readonly LogEntry[]) {
  return list.map((entry) => `${logTime(entry.time)} [${entry.level.toUpperCase()}] ${entry.source}: ${entry.message}${entry.details ? `\n${entry.details}` : ''}`).join('\n')
}

/** A problem the document or the app has right now: shown until it goes away. */
export type Problem = { id: string; level: 'warn' | 'info'; message: string }

export type ProblemFacts = {
  dirty: boolean
  width: number
  height: number
  hiddenLayers: number
  emptyLayers: number
  activeLocked: boolean
}

/** A problem's identity for Clear: the same kind with a different message counts as new. */
export const problemKey = (problem: Problem) => `${problem.id}|${problem.message}`

/** The Problems list as text, for the copy button. */
export function problemText(list: readonly Problem[]) {
  return list.map((problem) => `[${problem.level.toUpperCase()}] ${problem.message}`).join('\n')
}

/** What is worth pointing out about the document, worst first. */
export function documentProblems(facts: ProblemFacts, tr: (key: string) => string): Problem[] {
  const out: Problem[] = []
  if (facts.dirty) out.push({ id: 'unsaved', level: 'warn', message: tr('problemUnsaved') })
  if (facts.width * facts.height > 50_000_000) out.push({ id: 'huge', level: 'warn', message: tr('problemHuge').replace('{w}', String(facts.width)).replace('{h}', String(facts.height)) })
  if (facts.activeLocked) out.push({ id: 'locked', level: 'info', message: tr('problemLocked') })
  if (facts.hiddenLayers > 0) out.push({ id: 'hidden', level: 'info', message: tr('problemHidden').replace('{n}', String(facts.hiddenLayers)) })
  if (facts.emptyLayers > 0) out.push({ id: 'empty', level: 'info', message: tr('problemEmpty').replace('{n}', String(facts.emptyLayers)) })
  return out
}
