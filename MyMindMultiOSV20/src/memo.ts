// Memos: a note on a shape or a line, drawn as a sticky note beside it. Pure.
import type { MemoStyle } from './types'

export const MEMO_MIN_SIZE = 60
export const MEMO_MAX_SIZE = 800
export const MEMO_FONT_MIN = 8
export const MEMO_FONT_MAX = 72
export const MEMO_LINE_MIN = 1
export const MEMO_LINE_MAX = 10
export const MEMO_LINE_PATTERNS: MemoStyle['linePattern'][] = ['none', 'solid', 'dashed', 'dotted', 'dashdot']

export const DEFAULT_MEMO: MemoStyle = {
  color: '#fef08a',
  textColor: '#422006',
  width: 160,
  height: 90,
  fontFamily: 'notoSansKr',
  fontSize: 12,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  dx: 0,
  dy: 0,
  lineColor: '#ca8a04',
  lineWidth: 1,
  linePattern: 'dashed',
}

const HEX = /^#[0-9a-f]{6}$/i
const limited = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n))) : fallback
}

/** Anything read, made valid; what is missing takes the default, as an old file's plain notes do. */
export function sanitizeMemo(value: unknown, base: MemoStyle = DEFAULT_MEMO): MemoStyle {
  const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const finite = (x: unknown, fallback: number) => (Number.isFinite(Number(x)) && x !== null && x !== undefined ? Number(x) : fallback)
  return {
    color: typeof v.color === 'string' && HEX.test(v.color) ? v.color.toLowerCase() : base.color,
    textColor: typeof v.textColor === 'string' && HEX.test(v.textColor) ? v.textColor.toLowerCase() : base.textColor,
    width: limited(v.width, MEMO_MIN_SIZE, MEMO_MAX_SIZE, base.width),
    height: limited(v.height, MEMO_MIN_SIZE, MEMO_MAX_SIZE, base.height),
    fontFamily: typeof v.fontFamily === 'string' && v.fontFamily ? v.fontFamily : base.fontFamily,
    fontSize: limited(v.fontSize, MEMO_FONT_MIN, MEMO_FONT_MAX, base.fontSize),
    bold: typeof v.bold === 'boolean' ? v.bold : base.bold,
    italic: typeof v.italic === 'boolean' ? v.italic : base.italic,
    underline: typeof v.underline === 'boolean' ? v.underline : base.underline,
    strike: typeof v.strike === 'boolean' ? v.strike : base.strike,
    dx: finite(v.dx, base.dx),
    dy: finite(v.dy, base.dy),
    lineColor: typeof v.lineColor === 'string' && HEX.test(v.lineColor) ? v.lineColor.toLowerCase() : base.lineColor,
    lineWidth: limited(v.lineWidth, MEMO_LINE_MIN, MEMO_LINE_MAX, base.lineWidth),
    linePattern: MEMO_LINE_PATTERNS.includes(v.linePattern as MemoStyle['linePattern']) ? (v.linePattern as MemoStyle['linePattern']) : base.linePattern,
  }
}

/** Lines that fit `width`, breaking at spaces, and inside a word when one word is too long. */
export function wrapMemo(text: string, width: number, measure: (text: string) => number): string[] {
  const out: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue
      if (measure(line + word) <= width) {
        line += word
        continue
      }
      if (line.trim()) out.push(line.trimEnd())
      line = word.trim() ? '' : ''
      if (!word.trim()) continue
      for (const char of word) {
        if (line && measure(line + char) > width) {
          out.push(line)
          line = ''
        }
        line += char
      }
    }
    out.push(line.trimEnd())
  }
  return out
}
