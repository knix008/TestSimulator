/**
 * What a number field shows and reads back. A field always shows its unit ("120 px",
 * "45°"), so what comes back from it may or may not still have that unit on the end.
 */

/** Signs that sit against the number. Everything else is a word, and has a space before it. */
const ATTACHED_UNITS = new Set(['%', '°', '×'])

function decimalsOf(step: number): number {
  const text = String(step)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/** "120 px", "45°" or plain "3". Never a long tail of digits left by arithmetic on 0.05. */
export function formatUnitNumber(value: number, unit: string | undefined, step = 1): string {
  const shown = String(Number(value.toFixed(Math.max(decimalsOf(step), 2))))
  if (!unit) return shown
  return ATTACHED_UNITS.has(unit) ? `${shown}${unit}` : `${shown} ${unit}`
}

/** What was typed: "120", "120px" and "120 px" all mean 120. Anything else is null. */
export function parseUnitNumber(text: string, unit: string | undefined): number | null {
  let body = text.trim()
  if (unit && body.toLowerCase().endsWith(unit.toLowerCase())) body = body.slice(0, -unit.length).trim()
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(body)) return null
  return Number(body)
}

/** `count` steps on, kept on the step's grid and between the limits. */
export function stepUnitNumber(value: number, count: number, step: number, min: number, max: number): number {
  const moved = Math.round((value + count * step) / step) * step
  return Math.min(max, Math.max(min, Number(moved.toFixed(decimalsOf(step)))))
}

/** How many leading characters are the number itself, so just those can be selected. */
export function numberLength(text: string): number {
  return /^\s*[-+]?[\d.]*/.exec(text)?.[0].length ?? 0
}
