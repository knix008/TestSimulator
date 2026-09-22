/**
 * Readers for manual pages: the classic `man` macros and the BSD `mdoc`
 * macros. Both are macro-per-line formats; escapes (`\fB`, `\-`, `\(bu`)
 * are handled by one decoder.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, space, str } from '../ast'

const SPECIAL: Record<string, string> = { bu: '•', em: '—', en: '–', hy: '-', lq: '“', rq: '”', oq: '‘', cq: '’', aq: "'", dq: '"', ga: '`', rs: '\\', co: '©', rg: '®', tm: '™', at: '@', sh: '#', dg: '†', dd: '‡', '->': '→', '<-': '←', mu: '×', di: '÷', '+-': '±', de: '°', 'u2610': '☐', 'u2612': '☒' }

/** Decodes roff escapes and font changes into inlines. */
export function roffInlines(text: string, base: 'R' | 'B' | 'I' | 'C' = 'R'): Inline[] {
  const runs: { text: string; font: string }[] = []
  let font = base
  let buffer = ''
  const flush = () => { if (buffer) runs.push({ text: buffer, font }); buffer = '' }
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch !== '\\') { buffer += ch; continue }
    const next = text[i + 1]
    if (next === 'f') {
      flush()
      let name = text[i + 2] ?? 'R'
      let length = 3
      if (name === '[') { const close = text.indexOf(']', i + 3); name = text.slice(i + 3, close); length = close - i + 1 }
      else if (name === '(') { name = text.slice(i + 3, i + 5); length = 5 }
      font = name === 'P' ? base : name === 'BI' ? 'B' : name === 'CR' || name === 'CW' || name === 'CB' || name === 'CI' ? 'C' : (name as 'R' | 'B' | 'I' | 'C')
      i += length - 1
      continue
    }
    if (next === '(') { buffer += SPECIAL[text.slice(i + 2, i + 4)] ?? ''; i += 3; continue }
    if (next === '[') { const close = text.indexOf(']', i + 2); const name = text.slice(i + 2, close); buffer += SPECIAL[name] ?? (name.startsWith('u') ? String.fromCodePoint(Number.parseInt(name.slice(1), 16)) : ''); i = close; continue }
    if (next === '-') { buffer += '-'; i += 1; continue }
    if (next === '&' || next === '%' || next === ':') { i += 1; continue }
    if (next === '\\' || next === '.' || next === "'" || next === '`' || next === '"') { buffer += next; i += 1; continue }
    if (next === ' ' || next === '~') { buffer += ' '; i += 1; continue }
    if (next === 'e') { buffer += '\\'; i += 1; continue }
    if (next === 'c') { i += 1; continue }
    if (next === 'v' || next === 'h' || next === 's') { const close = text.indexOf("'", i + 3); i = close > 0 ? close : i + 1; continue }
    i += 1
  }
  flush()
  const out: Inline[] = []
  for (const run of runs) {
    const parts: Inline[] = []
    for (const piece of run.text.split(/( +)/)) {
      if (!piece) continue
      parts.push(/^ +$/.test(piece) ? space : str(piece))
    }
    if (run.font === 'B') out.push({ t: 'strong', c: parts })
    else if (run.font === 'I') out.push({ t: 'emph', c: parts })
    else if (run.font === 'C') out.push({ t: 'code', text: run.text })
    else out.push(...parts)
  }
  while (out.length && out[0].t === 'space') out.shift()
  while (out.length && out[out.length - 1].t === 'space') out.pop()
  return out
}

/** Splits a macro argument list, honouring double quotes. */
function args(rest: string): string[] {
  const out: string[] = []
  const re = /"((?:[^"]|"")*)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(rest))) out.push(match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2])
  return out
}

/* --------------------------------------------------------------------- man */

export function readMan(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const blocks: Block[] = []
  const stack: Block[][] = [blocks]
  const current = () => stack[stack.length - 1]
  let paragraph: string[] = []
  let code: string[] | null = null
  let list: { kind: 'bullet' | 'ordered' | 'deflist'; items: Block[][]; terms: Inline[][] } | null = null
  let pendingTerm: Inline[] | null = null
  const flushParagraph = () => {
    if (!paragraph.length) return
    const text = paragraph.join('\n')
    paragraph = []
    const inlines = roffInlines(text)
    if (!inlines.length) return
    if (pendingTerm && list?.kind === 'deflist') {
      list.terms.push(pendingTerm)
      list.items.push([{ t: 'para', c: inlines }])
      pendingTerm = null
      return
    }
    if (list && list.items.length && !pendingTerm && list.kind !== 'deflist') {
      list.items[list.items.length - 1].push({ t: 'para', c: inlines })
      return
    }
    current().push({ t: 'para', c: inlines })
  }
  const flushList = () => {
    if (!list) return
    if (list.kind === 'deflist') current().push({ t: 'deflist', items: list.terms.map((term, index) => ({ term, defs: [list!.items[index] ?? []] })) })
    else current().push(list.kind === 'bullet' ? { t: 'bullet', items: list.items, tight: true } : { t: 'ordered', start: 1, items: list.items, tight: true })
    list = null
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    i += 1
    if (code) {
      if (/^\.\s*fi\b/.test(line)) {
        current().push({ t: 'code', text: code.map((entry) => entry.replace(/\\f\[[A-Z]*\]|\\f[A-Z]/g, '').replace(/\\-/g, '-').replace(/\\\\/g, '\\').replace(/\\&/, '')).join('\n').replace(/^\n+|\n+$/g, '') })
        code = null
        continue
      }
      if (!/^\.\s*(?:PP|P|LP|IP|SH|SS|TP)\b/.test(line)) { code.push(line); continue }
      current().push({ t: 'code', text: code.join('\n') })
      code = null
    }
    if (/^\.\\"/.test(line) || /^\\"/.test(line)) continue
    if (line.startsWith('.') || line.startsWith("'")) {
      const [, macro, restRaw] = /^[.'](\S*)\s*(.*)$/.exec(line) ?? []
      const rest = restRaw ?? ''
      switch (macro) {
        case 'TH': { const a = args(rest); meta.title = `${a[0] ?? ''}${a[1] ? `(${a[1]})` : ''}`; if (a[2]) meta.date = a[2]; if (a[3]) meta.author = a[3]; continue }
        case 'SH': flushParagraph(); flushList(); current().push(header(1, roffInlines(args(rest).join(' ') || lines[i++] || ''))); continue
        case 'SS': flushParagraph(); flushList(); current().push(header(2, roffInlines(args(rest).join(' ') || lines[i++] || ''))); continue
        case 'PP': case 'P': case 'LP': flushParagraph(); if (list && list.kind !== 'deflist') flushList(); continue
        case 'IP': {
          flushParagraph()
          const [marker] = args(rest)
          const ordered = /^\d+[.)]?$/.test(marker ?? '')
          const bullet = marker === undefined || /^\\\[bu\]|^\\\(bu|^[•*o-]$/.test(marker)
          if (!list || list.kind === 'deflist' || (list.kind === 'ordered') !== ordered) { flushList(); list = { kind: ordered ? 'ordered' : bullet ? 'bullet' : 'deflist', items: [], terms: [] } }
          if (list.kind === 'deflist') pendingTerm = roffInlines(marker ?? '')
          else list.items.push([])
          continue
        }
        case 'TP': {
          flushParagraph()
          if (!list || list.kind !== 'deflist') { flushList(); list = { kind: 'deflist', items: [], terms: [] } }
          pendingTerm = roffInlines(lines[i++] ?? '')
          continue
        }
        case 'RS': flushParagraph(); { const inner: Block[] = []; stack.push(inner) } continue
        case 'RE': {
          flushParagraph(); flushList()
          if (stack.length > 1) {
            const inner = stack.pop()!
            const parentList = list
            void parentList
            current().push({ t: 'quote', c: inner })
          }
          continue
        }
        case 'nf': flushParagraph(); code = []; continue
        case 'fi': continue
        case 'br': paragraph.push('\\p'); continue
        case 'sp': flushParagraph(); continue
        case 'B': paragraph.push(`\\fB${args(rest).join(' ')}\\fR`); continue
        case 'I': paragraph.push(`\\fI${args(rest).join(' ')}\\fR`); continue
        case 'BI': case 'IB': case 'BR': case 'RB': case 'IR': case 'RI': {
          const fonts = macro.split('')
          paragraph.push(args(rest).map((word, index) => { const f = fonts[index % 2]; return f === 'R' ? word : `\\f${f}${word}\\fR` }).join(''))
          continue
        }
        case 'UR': case 'MT': paragraph.push(`${macro === 'MT' ? 'mailto:' : ''}${rest.trim()}`); continue
        case 'UE': case 'ME': continue
        case 'TS': {
          flushParagraph(); flushList()
          const body: string[] = []
          while (i < lines.length && !/^\.TE/.test(lines[i])) body.push(lines[i++])
          i += 1
          current().push(tblTable(body))
          continue
        }
        default: continue
      }
    }
    if (line.trim() === '') { flushParagraph(); continue }
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  while (stack.length > 1) { const inner = stack.pop()!; current().push({ t: 'quote', c: inner }) }
  return { meta, blocks: fixBreaks(blocks) }
}

/** `.br` was recorded as a `\p` token; it becomes a line break. */
function fixBreaks(blocks: Block[]): Block[] {
  const fix = (inlines: Inline[]): Inline[] => inlines.flatMap((inline) => {
    if (inline.t === 'str' && inline.text.includes('\\p')) {
      const parts = inline.text.split('\\p')
      const out: Inline[] = []
      parts.forEach((part, index) => { if (index) out.push(linebreak); if (part) out.push(str(part)) })
      return out
    }
    if ('c' in inline && Array.isArray(inline.c) && inline.t !== 'note') return [{ ...inline, c: fix(inline.c as Inline[]) } as Inline]
    return [inline]
  })
  for (const block of blocks) {
    if (block.t === 'para' || block.t === 'plain' || block.t === 'header') block.c = fix(block.c)
    if (block.t === 'quote' || block.t === 'div') fixBreaks(block.c)
    if (block.t === 'bullet' || block.t === 'ordered') for (const item of block.items) fixBreaks(item)
    if (block.t === 'deflist') for (const item of block.items) for (const def of item.defs) fixBreaks(def)
  }
  return blocks
}

/** A tbl(1) table: an options line, format lines ending in `.`, then rows. */
function tblTable(body: string[]): Block {
  let i = 0
  let tab = '\t'
  if (i < body.length && body[i].trim().endsWith(';')) {
    const tabOption = /tab\s*\((.)\)/.exec(body[i])
    if (tabOption) tab = tabOption[1]
    i += 1
  }
  const formats: string[] = []
  while (i < body.length && !body[i].includes(tab) && /^[lrcnasb^ 0-9|]+\.?$/i.test(body[i].trim())) {
    formats.push(body[i].trim().replace(/\.$/, ''))
    const done = body[i].trim().endsWith('.')
    i += 1
    if (done) break
  }
  const lastFormat = formats[formats.length - 1] ?? 'l'
  const aligns: Alignment[] = lastFormat.split(/\s+/).map((spec) => (/^r/i.test(spec) ? 'right' : /^c/i.test(spec) ? 'center' : 'default'))
  const rows: Inline[][][] = []
  let headerRow: Inline[][] | null = null
  const headerBold = formats.length > 1 && /b/i.test(formats[0])
  while (i < body.length) {
    const line = body[i++]
    if (line.trim() === '_' || line.trim() === '=') { if (rows.length === 1 && !headerRow) headerRow = rows.pop()!; continue }
    if (line.startsWith('.')) continue
    rows.push(line.split(tab).map((cell) => roffInlines(cell.replace(/^T\{|T\}$/g, '').trim())))
  }
  if (!headerRow && headerBold && rows.length) headerRow = rows.shift()!
  const width = Math.max(aligns.length, headerRow?.length ?? 0, ...rows.map((row) => row.length), 1)
  while (aligns.length < width) aligns.push('default')
  const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
  return { t: 'table', caption: [], aligns, header: headerRow ? pad(headerRow) : [], rows: rows.map(pad) }
}

/* -------------------------------------------------------------------- mdoc */

export function readMdoc(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const blocks: Block[] = []
  const stack: { blocks: Block[]; list?: { kind: 'bullet' | 'ordered' | 'deflist'; items: Block[][]; terms: Inline[][] } }[] = [{ blocks }]
  const current = () => stack[stack.length - 1]
  let paragraph: Inline[] = []
  const pushInlines = (inlines: Inline[]) => {
    if (!inlines.length) return
    if (paragraph.length) paragraph.push(space)
    paragraph.push(...inlines)
  }
  const flushParagraph = () => {
    if (!paragraph.length) return
    const content = paragraph
    paragraph = []
    const frame = current()
    if (frame.list) {
      if (!frame.list.items.length) frame.list.items.push([])
      frame.list.items[frame.list.items.length - 1].push({ t: 'para', c: content })
    } else frame.blocks.push({ t: 'para', c: content })
  }
  /** mdoc inline macros: `.Em word` , `.Sy word`, punctuation kept outside. */
  const inlineMacro = (macro: string, rest: string): Inline[] | null => {
    const words = args(rest)
    const wrap = (kind: 'emph' | 'strong' | 'code' | 'none', items: string[]) => {
      const text = items.filter((word) => !/^[.,;:()]$/.test(word)).join(' ')
      const trailing = items.filter((word) => /^[.,;:()]$/.test(word)).join('')
      const inner: Inline = kind === 'code' ? { t: 'code', text } : kind === 'none' ? str(text) : { t: kind, c: roffInlines(text) }
      return trailing ? [inner, str(trailing)] : [inner]
    }
    switch (macro) {
      case 'Em': case 'Ar': case 'Va': case 'Fa': return wrap('emph', words)
      case 'Sy': case 'Nm': case 'Fl': case 'Cm': case 'Ic': case 'Fn': return wrap('strong', macro === 'Fl' ? words.map((word, index) => (index === 0 ? `-${word}` : word)) : words)
      case 'Li': case 'Ql': case 'Dv': case 'Ev': case 'Pa': case 'Er': return wrap('code', words)
      case 'Dq': return [str('“'), ...roffInlines(words.join(' ')), str('”')]
      case 'Sq': return [str('‘'), ...roffInlines(words.join(' ')), str('’')]
      case 'Op': return [str('['), ...roffInlines(words.join(' ')), str(']')]
      case 'Xr': return [{ t: 'strong', c: [str(`${words[0] ?? ''}(${words[1] ?? ''})`)] }]
      case 'Lk': return [{ t: 'link', c: [str(words.slice(1).join(' ') || words[0] || '')], url: words[0] ?? '' }]
      case 'Mt': return [{ t: 'link', c: [str(words[0] ?? '')], url: `mailto:${words[0] ?? ''}` }]
      case 'Ns': case 'No': return roffInlines(words.join(' '))
      case 'Bq': return [str('['), ...roffInlines(words.join(' ')), str(']')]
      case 'Pq': return [str('('), ...roffInlines(words.join(' ')), str(')')]
      default: return null
    }
  }
  let code: string[] | null = null
  let i = 0
  while (i < lines.length) {
    const line = lines[i++]
    if (code) {
      if (/^\.Ed\b/.test(line)) { current().blocks.push({ t: 'code', text: code.join('\n') }); code = null }
      else code.push(line.replace(/^\\&/, ''))
      continue
    }
    if (/^\.\\"/.test(line)) continue
    if (!line.startsWith('.')) { pushInlines(roffInlines(line)); continue }
    const [, macro, restRaw] = /^\.(\S*)\s*(.*)$/.exec(line) ?? []
    const rest = restRaw ?? ''
    switch (macro) {
      case 'Dd': meta.date = rest.trim(); continue
      case 'Dt': { const a = args(rest); meta.title = `${a[0] ?? ''}${a[1] ? `(${a[1]})` : ''}`; continue }
      case 'Os': meta.os = rest.trim(); continue
      case 'Sh': flushParagraph(); current().blocks.push(header(1, roffInlines(rest))); continue
      case 'Ss': flushParagraph(); current().blocks.push(header(2, roffInlines(rest))); continue
      case 'Pp': case 'Lp': flushParagraph(); continue
      case 'Bd': { flushParagraph(); if (/-literal|-unfilled/.test(rest)) code = []; else stack.push({ blocks: [] }); continue }
      case 'Ed': { flushParagraph(); if (stack.length > 1) { const frame = stack.pop()!; current().blocks.push({ t: 'quote', c: frame.blocks }) } continue }
      case 'Bl': {
        flushParagraph()
        const kind = /-enum/.test(rest) ? 'ordered' : /-bullet|-dash|-item|-hyphen/.test(rest) ? 'bullet' : 'deflist'
        stack.push({ blocks: [], list: { kind, items: [], terms: [] } })
        continue
      }
      case 'It': {
        flushParagraph()
        const frame = current()
        if (!frame.list) continue
        frame.list.items.push([])
        if (frame.list.kind === 'deflist') {
          const [head, ...tail] = rest.trim().split(/\s+/)
          const built = inlineMacro(head, tail.join(' ')) ?? roffInlines(rest)
          frame.list.terms.push(built)
        } else if (rest.trim()) {
          const [head, ...tail] = rest.trim().split(/\s+/)
          pushInlines(inlineMacro(head, tail.join(' ')) ?? roffInlines(rest))
        }
        continue
      }
      case 'El': {
        flushParagraph()
        const frame = stack.pop()
        if (!frame?.list) continue
        const items = frame.list.items.map((item) => (item.length === 1 && item[0].t === 'para' ? [{ t: 'plain', c: item[0].c } as Block] : item))
        if (frame.list.kind === 'deflist') current().blocks.push({ t: 'deflist', items: frame.list.terms.map((term, index) => ({ term, defs: [items[index] ?? []] })) })
        else current().blocks.push(frame.list.kind === 'bullet' ? { t: 'bullet', items, tight: true } : { t: 'ordered', start: 1, items, tight: true })
        continue
      }
      case 'Nd': pushInlines([str('—'), space, ...roffInlines(rest)]); continue
      case 'br': paragraph.push(linebreak); continue
      default: {
        const built = inlineMacro(macro, rest)
        if (built) { pushInlines(built); continue }
        // Unknown macro: keep its words as text.
        if (/^[A-Z][a-z]$/.test(macro)) pushInlines(roffInlines(rest))
        continue
      }
    }
  }
  flushParagraph()
  while (stack.length > 1) { const frame = stack.pop()!; current().blocks.push(...frame.blocks) }
  return { meta, blocks }
}
