/**
 * A rule-driven inline parser shared by the lightweight markup readers.
 *
 * reStructuredText, Org, Textile, MediaWiki and AsciiDoc each mark emphasis,
 * code and links differently but in the same shape: a delimiter, content, a
 * delimiter. Each reader lists its rules as sticky regular expressions and a
 * builder; the parser tries them at every position and collects text between.
 */
import type { Inline } from '../ast'
import { linebreak, softbreak, space, str } from '../ast'

export type InlineRule = {
  pattern: RegExp
  build: (match: RegExpExecArray, recurse: (text: string) => Inline[]) => Inline | Inline[] | null
}

export function parseWithRules(text: string, rules: InlineRule[]): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) pushText(out, buffer)
    buffer = ''
  }
  const recurse = (inner: string) => parseWithRules(inner, rules)
  let i = 0
  while (i < text.length) {
    if (text[i] === '\n') {
      flush()
      out.push(softbreak)
      i += 1
      continue
    }
    let matched = false
    for (const rule of rules) {
      rule.pattern.lastIndex = i
      const match = rule.pattern.exec(text)
      if (!match || match.index !== i || match[0].length === 0) continue
      const built = rule.build(match, recurse)
      if (built === null) continue
      flush()
      if (Array.isArray(built)) out.push(...built)
      else out.push(built)
      i += match[0].length
      matched = true
      break
    }
    if (matched) continue
    buffer += text[i]
    i += 1
  }
  flush()
  return trimInlines(out)
}

export function pushText(out: Inline[], text: string) {
  for (const part of text.split(/( +)/)) {
    if (!part) continue
    if (/^ +$/.test(part)) {
      out.push(space)
      continue
    }
    const last = out[out.length - 1]
    if (last && last.t === 'str') last.text += part
    else out.push(str(part))
  }
}

export function trimInlines(inlines: Inline[]): Inline[] {
  while (inlines.length && (inlines[0].t === 'space' || inlines[0].t === 'softbreak')) inlines.shift()
  while (inlines.length && (inlines[inlines.length - 1].t === 'space' || inlines[inlines.length - 1].t === 'softbreak')) inlines.pop()
  return inlines
}

/** Word-boundary aware delimiter rule: `*text*` with the given marker. */
export function delimited(marker: string, build: (inner: Inline[]) => Inline, options: { escape?: boolean; allowSpace?: boolean } = {}): InlineRule {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = options.allowSpace === false ? `\\S(?:[^\\n]*?\\S)?` : `\\S(?:[\\s\\S]*?\\S)?|\\S`
  const pattern = new RegExp(`${escaped}(${body})${escaped}(?![\\w${escaped}])`, 'y')
  return {
    pattern,
    build: (match, recurse) => {
      if (match[1].startsWith(marker[0]) || match[1].endsWith(marker[0])) return null
      return build(recurse(match[1]))
    },
  }
}

export const lineBreakRule: InlineRule = { pattern: / {2,}\n/y, build: () => linebreak }
