/**
 * Turning anything that was thrown into a report a user can read and paste.
 *
 * Failures used to surface as a one-word status in the corner, or not at all,
 * which left nothing to act on. Every report carries the action that failed,
 * the error's own message and stack, and enough environment to make a pasted
 * copy useful on its own.
 */

export type ErrorReport = {
  title: string
  message: string
  /** The full, copyable text. */
  details: string
}

export type ErrorContext = {
  /** What the user was doing, already translated. */
  action: string
  /** Where it happened: 'main', 'dialog:settings', 'menu:layer'… */
  source?: string
  /** Anything else worth pasting, such as the document size. */
  extra?: Record<string, string | number | boolean | null | undefined>
}

/** Pulls a name, message and stack out of whatever was thrown. */
export function describeError(error: unknown): { name: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack ?? '',
    }
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : safeStringify(error)
    return {
      name: typeof record.name === 'string' ? record.name : 'Error',
      message,
      stack: typeof record.stack === 'string' ? record.stack : '',
    }
  }
  return { name: 'Error', message: String(error), stack: '' }
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // Circular structures and getters that throw both land here.
    return String(value)
  }
}

function environmentLines(): string[] {
  const lines: string[] = []
  if (typeof navigator !== 'undefined') {
    if (navigator.userAgent) lines.push(`User agent: ${navigator.userAgent}`)
    if (navigator.language) lines.push(`Locale: ${navigator.language}`)
  }
  if (typeof window !== 'undefined') {
    lines.push(`Window: ${window.innerWidth}x${window.innerHeight}`)
    lines.push(`Shell: ${window.electronWindowApi ? 'desktop' : 'browser'}`)
  }
  return lines
}

/** Builds the report shown in the error popup. */
export function buildErrorReport(error: unknown, context: ErrorContext, version = '1.0.0'): ErrorReport {
  const described = describeError(error)
  const lines: string[] = [
    `My Document Converter ${version}`,
    `Time: ${new Date().toISOString()}`,
    `Action: ${context.action}`,
  ]
  if (context.source) lines.push(`Source: ${context.source}`)
  for (const [key, value] of Object.entries(context.extra ?? {})) {
    if (value !== undefined && value !== null && value !== '') lines.push(`${key}: ${value}`)
  }
  lines.push(...environmentLines())
  lines.push('', `${described.name}: ${described.message}`)
  if (described.stack) {
    lines.push('', described.stack)
  }
  return {
    title: context.action,
    message: described.message || described.name,
    details: lines.join('\n'),
  }
}

/**
 * Copies text to the clipboard.
 *
 * `navigator.clipboard` is undefined outside a secure context, and a packaged
 * popup window is loaded over `file://` — so the async API alone left the copy
 * button doing nothing there. The textarea fallback works everywhere.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the synchronous path below.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(area)
    return copied
  } catch {
    return false
  }
}
