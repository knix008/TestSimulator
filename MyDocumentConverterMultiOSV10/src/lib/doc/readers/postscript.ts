/**
 * PostScript reader.
 *
 * Files written by this program carry each block's AST in `%%mdcv-block:`
 * comments (and the metadata in `%%mdcv-meta:`), so they come back exactly.
 * Any other PostScript is a program, not a document: the reader runs a small
 * tokenizer over it, collects what the text operators (`show` and its
 * relatives) draw and where, and rebuilds lines and paragraphs from the
 * positions — headings from font size, paragraphs from vertical gaps.
 */
import type { Block, Doc, Meta } from '../ast'
import { textToInlines } from '../ast'

export function readPostScript(source: string): Doc {
  const text = source.replace(/\r\n?/g, '\n')
  const own = readOwn(text)
  if (own) return own
  return extract(text)
}

/* ------------------------------------------------------------ our files */

function readOwn(text: string): Doc | null {
  const blocks: Block[] = []
  let meta: Meta = {}
  let found = false
  for (const line of text.split('\n')) {
    if (line.startsWith('%%mdcv-block: ')) {
      try { blocks.push(JSON.parse(line.slice('%%mdcv-block: '.length)) as Block); found = true } catch { /* a damaged line is skipped */ }
    } else if (line.startsWith('%%mdcv-meta: ')) {
      try { meta = JSON.parse(line.slice('%%mdcv-meta: '.length)) as Meta; found = true } catch { /* ignore */ }
    }
  }
  return found ? { meta, blocks } : null
}

/* ------------------------------------------------------ foreign files */

type Token = { kind: 'string' | 'number' | 'name' | 'op' | 'other'; value: string }

const SHOW_OPS = new Set(['show', 'ashow', 'widthshow', 'awidthshow', 'xshow', 'yshow', 'xyshow', 'kshow', 'cshow', 'glyphshow'])

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (ch === '%') { while (i < n && text[i] !== '\n') i += 1; continue }
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\0') { i += 1; continue }
    if (ch === '(') {
      let depth = 1
      let out = ''
      i += 1
      while (i < n && depth > 0) {
        const c = text[i]
        if (c === '\\') {
          const next = text[i + 1] ?? ''
          i += 2
          if (next === 'n') out += '\n'
          else if (next === 'r') out += '\r'
          else if (next === 't') out += '\t'
          else if (next === 'b') out += '\b'
          else if (next === 'f') out += '\f'
          else if (next === '\n') { /* line continuation */ }
          else if (/[0-7]/.test(next)) {
            let oct = next
            while (oct.length < 3 && /[0-7]/.test(text[i] ?? '')) { oct += text[i]; i += 1 }
            out += String.fromCharCode(Number.parseInt(oct, 8))
          } else out += next
          continue
        }
        if (c === '(') depth += 1
        else if (c === ')') { depth -= 1; if (depth === 0) { i += 1; break } }
        out += c
        i += 1
      }
      tokens.push({ kind: 'string', value: decodeBytes(out) })
      continue
    }
    if (ch === '<') {
      if (text[i + 1] === '<') { tokens.push({ kind: 'other', value: '<<' }); i += 2; continue }
      const end = text.indexOf('>', i)
      const hex = (end < 0 ? text.slice(i + 1) : text.slice(i + 1, end)).replace(/\s+/g, '')
      i = end < 0 ? n : end + 1
      if (/^~/.test(hex)) { tokens.push({ kind: 'other', value: '' }); continue }
      // Hex strings from unknown fonts are glyph ids, not characters; only single-byte ASCII is trusted.
      let out = ''
      let printable = true
      for (let k = 0; k + 1 < hex.length; k += 2) {
        const code = Number.parseInt(hex.slice(k, k + 2), 16)
        if (code < 32 || code > 126) printable = false
        out += String.fromCharCode(code)
      }
      tokens.push({ kind: 'string', value: printable ? out : '' })
      continue
    }
    if (ch === '[' || ch === ']' || ch === '{' || ch === '}' || ch === '>') { tokens.push({ kind: 'other', value: ch }); i += 1; continue }
    if (ch === '/') {
      let j = i + 1
      while (j < n && !/[\s()<>[\]{}/%]/.test(text[j])) j += 1
      tokens.push({ kind: 'name', value: text.slice(i + 1, j) })
      i = j
      continue
    }
    let j = i
    while (j < n && !/[\s()<>[\]{}/%]/.test(text[j])) j += 1
    const word = text.slice(i, j)
    i = j === i ? i + 1 : j
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(word)) tokens.push({ kind: 'number', value: word })
    else if (/^\d+#[0-9a-z]+$/i.test(word)) { const [radix, digits] = word.split('#'); tokens.push({ kind: 'number', value: String(Number.parseInt(digits, Number(radix))) }) }
    else if (word) tokens.push({ kind: 'op', value: word })
  }
  return tokens
}

/** PostScript strings are bytes; UTF-8 is honoured when it decodes cleanly, Latin-1 otherwise. */
function decodeBytes(raw: string): string {
  if (!/[-ÿ]/.test(raw)) return raw
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, (ch) => ch.charCodeAt(0) & 0xff))
  } catch {
    return raw
  }
}

type Fragment = { x: number; y: number; size: number; text: string; page: number }

function extract(text: string): Doc {
  const tokens = tokenize(text)
  const fragments: Fragment[] = []
  const numbers: number[] = []
  const strings: string[] = []
  let x = 0
  let y = 0
  let size = 10
  let page = 0
  const procs = new Map<string, Token[]>()

  // A first pass records `/name { ... } def` procedures whose body shows text, so `(hi) T` style
  // helpers (common in driver output) are followed; only one level deep.
  for (let i = 0; i + 3 < tokens.length; i += 1) {
    if (tokens[i].kind === 'name' && tokens[i + 1].value === '{') {
      let depth = 0
      let j = i + 1
      for (; j < tokens.length; j += 1) {
        if (tokens[j].value === '{') depth += 1
        else if (tokens[j].value === '}') { depth -= 1; if (depth === 0) break }
      }
      if (tokens[j + 1]?.value === 'def') {
        const body = tokens.slice(i + 2, j)
        if (body.some((token) => SHOW_OPS.has(token.value))) procs.set(tokens[i].value, body)
        i = j + 1
      }
    }
  }

  const run = (list: Token[], depthLeft: number) => {
    let inProc = 0
    for (let i = 0; i < list.length; i += 1) {
      const token = list[i]
      if (token.value === '{' && token.kind === 'other') { inProc += 1; continue }
      if (token.value === '}' && token.kind === 'other') { inProc = Math.max(0, inProc - 1); continue }
      if (inProc) continue
      if (token.kind === 'number') { numbers.push(Number(token.value)); if (numbers.length > 8) numbers.shift(); continue }
      if (token.kind === 'string') { strings.push(token.value); if (strings.length > 4) strings.shift(); continue }
      if (token.kind !== 'op') continue
      const op = token.value
      const take = (count: number) => numbers.splice(Math.max(0, numbers.length - count), count)
      if (op === 'moveto') { const [nx, ny] = take(2); if (nx !== undefined && ny !== undefined) { x = nx; y = ny } continue }
      if (op === 'rmoveto') { const [dx, dy] = take(2); x += dx ?? 0; y += dy ?? 0; continue }
      if (op === 'scalefont' || op === 'selectfont') { const [s] = take(1); if (s && s > 0 && s < 400) size = s; continue }
      if (op === 'makefont') { const s = numbers[numbers.length - 3] ?? numbers[numbers.length - 6]; if (s && s > 0 && s < 400) size = s; continue }
      if (op === 'showpage') { page += 1; numbers.length = 0; continue }
      if (SHOW_OPS.has(op)) {
        const value = strings.pop()
        if (value && value.trim()) {
          fragments.push({ x, y, size, text: value, page })
          x += value.length * size * 0.5
        }
        continue
      }
      const proc = procs.get(op)
      if (proc && depthLeft > 0) { run(proc, depthLeft - 1); continue }
      if (op === 'def' || op === 'pop') numbers.length = 0
    }
  }
  run(tokens, 2)

  return { meta: {}, blocks: fragmentsToBlocks(fragments) }
}

/** Groups fragments into lines (same baseline) and paragraphs (baselines close together); big text becomes headings. */
function fragmentsToBlocks(fragments: Fragment[]): Block[] {
  if (!fragments.length) return []
  const lines: { y: number; size: number; page: number; parts: Fragment[] }[] = []
  for (const fragment of fragments) {
    const last = lines[lines.length - 1]
    if (last && last.page === fragment.page && Math.abs(last.y - fragment.y) < Math.max(1.5, fragment.size * 0.25)) last.parts.push(fragment)
    else lines.push({ y: fragment.y, size: fragment.size, page: fragment.page, parts: [fragment] })
  }
  const sizes = fragments.map((fragment) => fragment.size)
  const body = median(sizes)
  const distinct = [...new Set(sizes.filter((s) => s > body * 1.15))].sort((a, b) => b - a)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let paragraphSize = body
  let previous: { y: number; page: number; size: number } | null = null
  const flush = () => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
    paragraph = []
    if (!text) return
    const level = distinct.indexOf(paragraphSize)
    if (level >= 0 && level < 6 && text.length < 200) blocks.push({ t: 'header', level: level + 1, c: textToInlines(text), id: '' })
    else blocks.push({ t: 'para', c: textToInlines(text) })
  }
  for (const line of lines) {
    const parts = [...line.parts].sort((a, b) => a.x - b.x)
    let text = ''
    let cursor = parts[0].x
    for (const part of parts) {
      if (text && part.x - cursor > part.size * 0.2 && !text.endsWith(' ') && !part.text.startsWith(' ')) text += ' '
      text += part.text
      cursor = part.x + part.text.length * part.size * 0.5
    }
    const gap = previous ? previous.y - line.y : 0
    const newParagraph = !previous || previous.page !== line.page || gap > line.size * 1.9 || gap < -line.size || Math.abs(previous.size - line.size) > 0.5
    if (newParagraph) { flush(); paragraphSize = line.size }
    paragraph.push(text)
    previous = { y: line.y, page: line.page, size: line.size }
  }
  flush()
  return blocks
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 10
}
