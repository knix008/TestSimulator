// The text behind the error popup: everything someone would have to ask for
// when a crash is reported, in one block that can be copied in one go.
import { APP_NAME, APP_VERSION, buildInfo } from './buildInfo'

export interface ErrorContext {
  /** where it came from: a command id, 'render', 'window', 'promise' */
  source: string
  platform?: string
  /** open document, active workbench, last command - whatever is known */
  details?: Record<string, string | number | undefined>
  /** React's component stack, when the failure came from a render */
  componentStack?: string
  at?: Date
}

function stamp(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/** One line per fact, then the stack: readable in a bug report as it is. */
export function errorReport(error: unknown, context: ErrorContext): string {
  const failure = error instanceof Error ? error : new Error(String(error))
  const info = buildInfo(context.platform ?? 'web')
  const lines = [
    `${APP_NAME} ${APP_VERSION} - ${failure.name || 'Error'}`,
    '',
    `message   ${failure.message || String(error)}`,
    `source    ${context.source}`,
    `when      ${stamp(context.at ?? new Date())}`,
    `build     ${info.buildDate}`,
    `platform  ${info.platform}`
  ]
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    lines.push(`agent     ${navigator.userAgent}`)
  }
  for (const [key, value] of Object.entries(context.details ?? {})) {
    if (value === undefined || value === '') continue
    lines.push(`${key.padEnd(9)} ${value}`)
  }
  lines.push('', failure.stack ? failure.stack.trim() : '(no stack)')
  if (context.componentStack) {
    lines.push('', `component stack${context.componentStack.replace(/\n\s*/g, '\n  ')}`)
  }
  return lines.join('\n')
}

/** Short headline for the popup title bar. */
export function errorHeadline(error: unknown): string {
  const failure = error instanceof Error ? error : new Error(String(error))
  const message = failure.message || String(error)
  return message.length > 120 ? `${message.slice(0, 117)}...` : message
}
