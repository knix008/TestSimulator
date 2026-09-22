/**
 * Markdown writer. Produces Pandoc-flavoured Markdown by default, GitHub
 * flavour or plain CommonMark on request; the differences are in what may
 * be used (footnotes, definition lists, superscript) and how tables fall back.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { applyLineEnding, wrapText, type WriterOptions } from '../options'

/**
 * Every Markdown dialect Pandoc writes, and what each may use. A construct a
 * dialect lacks is written the way Pandoc falls back: raw HTML for tables and
 * strikeout, an indented block for fenced code, a parenthesis for a footnote.
 */
export type MarkdownDialect = 'pandoc' | 'gfm' | 'commonmark' | 'commonmark_x' | 'markdown_strict' | 'markdown_phpextra' | 'markdown_mmd' | 'markua'

type Caps = { fences: boolean; tables: boolean; footnotes: boolean; deflist: boolean; strike: boolean; supSub: boolean; math: boolean; yaml: boolean; tasks: boolean; divs: boolean; attrs: boolean; mmdMeta: boolean; underlineSpan: boolean; rawHtml: boolean }

const CAPS: Record<MarkdownDialect, Caps> = {
  pandoc: { fences: true, tables: true, footnotes: true, deflist: true, strike: true, supSub: true, math: true, yaml: true, tasks: true, divs: true, attrs: true, mmdMeta: false, underlineSpan: true, rawHtml: true },
  commonmark_x: { fences: true, tables: true, footnotes: true, deflist: true, strike: true, supSub: true, math: true, yaml: true, tasks: true, divs: true, attrs: true, mmdMeta: false, underlineSpan: true, rawHtml: true },
  gfm: { fences: true, tables: true, footnotes: true, deflist: false, strike: true, supSub: false, math: true, yaml: false, tasks: true, divs: false, attrs: false, mmdMeta: false, underlineSpan: false, rawHtml: true },
  commonmark: { fences: true, tables: false, footnotes: false, deflist: false, strike: false, supSub: false, math: false, yaml: false, tasks: false, divs: false, attrs: false, mmdMeta: false, underlineSpan: false, rawHtml: true },
  markdown_strict: { fences: false, tables: false, footnotes: false, deflist: false, strike: false, supSub: false, math: false, yaml: false, tasks: false, divs: false, attrs: false, mmdMeta: false, underlineSpan: false, rawHtml: true },
  markdown_phpextra: { fences: true, tables: true, footnotes: true, deflist: true, strike: false, supSub: false, math: false, yaml: false, tasks: false, divs: false, attrs: true, mmdMeta: false, underlineSpan: false, rawHtml: true },
  markdown_mmd: { fences: true, tables: true, footnotes: true, deflist: true, strike: false, supSub: true, math: true, yaml: false, tasks: false, divs: false, attrs: true, mmdMeta: true, underlineSpan: false, rawHtml: true },
  markua: { fences: true, tables: true, footnotes: true, deflist: false, strike: true, supSub: true, math: true, yaml: false, tasks: false, divs: false, attrs: false, mmdMeta: false, underlineSpan: false, rawHtml: false },
}

type State = { options: WriterOptions; notes: string[]; flavor: MarkdownDialect; caps: Caps }

export function writeMarkdown(doc: Doc, options: WriterOptions, dialect?: MarkdownDialect): string {
  const flavor: MarkdownDialect = dialect ?? (options.markdownFlavor as MarkdownDialect)
  const caps = CAPS[flavor] ?? CAPS.pandoc
  const state: State = { options, notes: [], flavor, caps }
  const parts: string[] = []
  const meta = { ...doc.meta }
  if (options.title) meta.title = options.title
  if (options.author) meta.author = options.author
  if (options.date) meta.date = options.date
  const hasMeta = Object.keys(meta).some((key) => meta[key])
  if (options.standalone && hasMeta && caps.yaml) {
    const lines = ['---']
    for (const [key, value] of Object.entries(meta)) {
      if (!value) continue
      lines.push(`${key}: ${/[:#"'[\]{}]|^\s|\s$/.test(value) ? JSON.stringify(value) : value}`)
    }
    lines.push('---')
    parts.push(lines.join('\n'))
  } else if (options.standalone && hasMeta && caps.mmdMeta) {
    parts.push(Object.entries(meta).filter(([, value]) => value).map(([key, value]) => `${key[0].toUpperCase()}${key.slice(1)}: ${value}`).join('\n'))
  } else if (options.standalone && hasMeta && flavor === 'markua') {
    parts.push(`{title: ${JSON.stringify(meta.title ?? '')}${meta.author ? `, author: ${JSON.stringify(meta.author)}` : ''}}`)
  } else if (options.standalone && meta.title && !caps.yaml) {
    // Dialects without metadata blocks get the title as a first-level heading.
    parts.push(`# ${meta.title}`)
  }
  if (options.toc) {
    const toc = tableOfContents(doc, options.tocDepth)
    if (toc) parts.push(toc)
  }
  parts.push(...blocks(doc.blocks, state))
  if (state.notes.length) parts.push(state.notes.join('\n\n'))
  return applyLineEnding(`${parts.filter((part) => part !== '').join('\n\n')}\n`, options)
}

function tableOfContents(doc: Doc, depth: number): string {
  const lines: string[] = []
  for (const block of doc.blocks) {
    if (block.t !== 'header' || block.level > depth) continue
    lines.push(`${'    '.repeat(block.level - 1)}- [${inlinesToText(block.c)}](#${block.id})`)
  }
  return lines.join('\n')
}

export function blocks(list: Block[], state: State, sectionNumbers: number[] = []): string[] {
  const out: string[] = []
  for (const block of list) out.push(blockToMarkdown(block, state, sectionNumbers))
  return out
}

function blockToMarkdown(block: Block, state: State, numbers: number[]): string {
  const { options } = state
  switch (block.t) {
    case 'para':
      return wrapText(inlines(block.c, state), options)
    case 'plain':
      return wrapText(inlines(block.c, state), options)
    case 'header': {
      let text = inlines(block.c, state)
      if (options.numberSections) {
        while (numbers.length < block.level) numbers.push(0)
        numbers.length = block.level
        numbers[block.level - 1] += 1
        text = `${numbers.join('.')} ${text}`
      }
      const attr = block.id && state.caps.attrs && block.id !== defaultId(block) ? ` {#${block.id}}` : ''
      if (options.headingStyle === 'setext' && block.level <= 2) {
        return `${text}${attr}\n${(block.level === 1 ? '=' : '-').repeat(Math.max(3, text.length))}`
      }
      return `${'#'.repeat(block.level)} ${text}${attr}`
    }
    case 'code': {
      if (!state.caps.fences) return block.text.split('\n').map((line) => `    ${line}`).join('\n')
      let fence = state.flavor === 'markdown_phpextra' ? '~~~' : options.codeFence
      while (block.text.includes(fence)) fence += fence[0]
      const info = block.lang ? (state.flavor === 'markua' ? `{format: ${block.lang}}\n${fence}` : block.lang) : ''
      return `${fence}${info}\n${block.text}\n${fence}`
    }
    case 'quote':
      return blocks(block.c, state).join('\n\n').split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')
    case 'bullet': {
      const marker = options.bulletMarker
      return block.items.map((item, index) => {
        const task = block.tasks?.[index]
        const prefix = task === undefined || task === null ? `${marker} ` : state.caps.tasks ? `${marker} [${task ? 'x' : ' '}] ` : `${marker} ${task ? '☒' : '☐'} `
        return listItem(item, prefix, state, block.tight !== false)
      }).join(block.tight === false ? '\n\n' : '\n')
    }
    case 'ordered': {
      return block.items.map((item, index) => {
        const number = block.start + index
        const label = block.style === 'lower-alpha' ? String.fromCharCode(96 + number) : block.style === 'upper-alpha' ? String.fromCharCode(64 + number) : block.style === 'lower-roman' ? roman(number).toLowerCase() : block.style === 'upper-roman' ? roman(number) : String(number)
        return listItem(item, `${label}. `, state, block.tight !== false)
      }).join(block.tight === false ? '\n\n' : '\n')
    }
    case 'deflist':
      if (!state.caps.deflist) {
        return block.items.map((item) => `**${inlines(item.term, state)}**\n\n${item.defs.map((def) => blocks(def, state).join('\n\n').split('\n').map((line) => `    ${line}`).join('\n')).join('\n\n')}`).join('\n\n')
      }
      return block.items.map((item) => `${inlines(item.term, state)}\n${item.defs.map((def) => `:   ${blocks(def, state).join('\n\n').split('\n').join('\n    ')}`).join('\n\n')}`).join('\n\n')
    case 'hr':
      return '---'
    case 'table':
      return state.caps.tables ? table(block, state) : htmlTable(block, state)
    case 'raw':
      return (block.format === 'html' && state.caps.rawHtml) || block.format === 'markdown' ? block.text : ''
    case 'div': {
      const inner = blocks(block.c, state).join('\n\n')
      if (state.caps.divs && block.attrs?.classes?.length) return `::: ${block.attrs.classes.join(' ')}\n${inner}\n:::`
      if (state.flavor === 'markua' && block.attrs?.classes?.length) return inner.split('\n').map((line) => `A> ${line}`).join('\n')
      return inner
    }
    case 'linebl':
      return block.lines.map((line) => `| ${inlines(line, state)}`).join('\n')
  }
}

/** A table for a dialect without table syntax: raw HTML, as Pandoc does. */
function htmlTable(block: Extract<Block, { t: 'table' }>, state: State): string {
  const cell = (c: Inline[], tag: string) => `<${tag}>${inlines(c, { ...state, options: { ...state.options, wrap: 'none' } })}</${tag}>`
  const lines = ['<table>']
  if (block.caption.length) lines.push(`<caption>${inlines(block.caption, state)}</caption>`)
  if (block.header.length) lines.push(`<tr>${block.header.map((c) => cell(c, 'th')).join('')}</tr>`)
  for (const row of block.rows) lines.push(`<tr>${row.map((c) => cell(c, 'td')).join('')}</tr>`)
  lines.push('</table>')
  return lines.join('\n')
}

function defaultId(block: Extract<Block, { t: 'header' }>) {
  const text = inlinesToText(block.c).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-')
  return text.replace(/^[^\p{L}_]+/u, '') || 'section'
}

function listItem(item: Block[], prefix: string, state: State, tight: boolean): string {
  const rendered = blocks(item, state).join(tight ? '\n' : '\n\n')
  const indent = ' '.repeat(prefix.length)
  const lines = rendered.split('\n')
  return lines.map((line, index) => (index === 0 ? `${prefix}${line}` : line ? `${indent}${line}` : '')).join('\n')
}

function roman(value: number): string {
  const table: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  let n = value
  for (const [num, sym] of table) while (n >= num) { out += sym; n -= num }
  return out
}

function table(block: Extract<Block, { t: 'table' }>, state: State): string {
  const width = block.aligns.length
  const cell = (c: Inline[]) => inlines(c, { ...state, options: { ...state.options, wrap: 'none' } }).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  const header = block.header.length ? block.header.map(cell) : Array.from({ length: width }, () => '')
  const rows = block.rows.map((row) => row.map(cell))
  const widths = Array.from({ length: width }, (_, k) => Math.max(3, header[k]?.length ?? 0, ...rows.map((row) => row[k]?.length ?? 0)))
  const pad = (text: string, k: number) => {
    const align = block.aligns[k]
    const extra = widths[k] - text.length
    if (align === 'right') return ' '.repeat(extra) + text
    if (align === 'center') return ' '.repeat(Math.floor(extra / 2)) + text + ' '.repeat(Math.ceil(extra / 2))
    return text + ' '.repeat(extra)
  }
  const line = (cells: string[]) => `| ${cells.map((text, k) => pad(text, k)).join(' | ')} |`
  const delim = `| ${block.aligns.map((align, k) => {
    const dashes = '-'.repeat(Math.max(1, widths[k] - (align === 'center' ? 2 : align === 'default' ? 0 : 1)))
    return align === 'left' ? `:${dashes}` : align === 'right' ? `${dashes}:` : align === 'center' ? `:${dashes}:` : dashes
  }).join(' | ')} |`
  const lines = [line(header), delim, ...rows.map(line)]
  if (block.caption.length) lines.push('', `: ${inlines(block.caption, state)}`)
  return lines.join('\n')
}

/* ----------------------------------------------------------------- inlines */

export function inlines(list: Inline[], state: State): string {
  let out = ''
  for (const inline of list) out += inlineToMarkdown(inline, state)
  return out
}

function escapeText(text: string): string {
  return text
    .replace(/([\\`*_{}[\]<>])/g, '\\$1')
    .replace(/^(\s*)([#+\-])(\s)/, '$1\\$2$3')
    .replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4')
    .replace(/(\s)([~^])/g, '$1\\$2')
}

function inlineToMarkdown(inline: Inline, state: State): string {
  const marker = state.options.emphasisMarker
  switch (inline.t) {
    case 'str': return escapeText(inline.text)
    case 'space': return ' '
    case 'softbreak': return state.options.wrap === 'preserve' ? '\n' : ' '
    case 'linebreak': return '\\\n'
    case 'emph': return `${marker}${inlines(inline.c, state)}${marker}`
    case 'strong': return `${marker}${marker}${inlines(inline.c, state)}${marker}${marker}`
    case 'strike': return state.caps.strike ? `~~${inlines(inline.c, state)}~~` : state.caps.rawHtml ? `<s>${inlines(inline.c, state)}</s>` : inlines(inline.c, state)
    case 'underline': return state.caps.underlineSpan ? `[${inlines(inline.c, state)}]{.underline}` : state.caps.rawHtml ? `<u>${inlines(inline.c, state)}</u>` : inlines(inline.c, state)
    case 'sup': return state.caps.supSub ? `^${inlines(inline.c, state).replace(/ /g, '\\ ')}^` : state.caps.rawHtml ? `<sup>${inlines(inline.c, state)}</sup>` : inlines(inline.c, state)
    case 'sub': return state.caps.supSub ? `~${inlines(inline.c, state).replace(/ /g, '\\ ')}~` : state.caps.rawHtml ? `<sub>${inlines(inline.c, state)}</sub>` : inlines(inline.c, state)
    case 'smallcaps': return state.caps.underlineSpan ? `[${inlines(inline.c, state)}]{.smallcaps}` : inlines(inline.c, state)
    case 'span': return inlines(inline.c, state)
    case 'code': {
      let ticks = '`'
      while (inline.text.includes(ticks)) ticks += '`'
      const pad = inline.text.startsWith('`') || inline.text.endsWith('`') ? ' ' : ''
      return `${ticks}${pad}${inline.text}${pad}${ticks}`
    }
    case 'math': return state.caps.math ? (inline.display ? `$$${inline.text}$$` : `$${inline.text}$`) : inline.display ? `\\[${inline.text}\\]` : `\\(${inline.text}\\)`
    case 'link': {
      const text = inlines(inline.c, state)
      if (text === inline.url || `mailto:${text}` === inline.url) return `<${text}>`
      return `[${text}](${inline.url}${inline.title ? ` "${inline.title.replace(/"/g, '\\"')}"` : ''})`
    }
    case 'image': return `![${inlines(inline.c, state)}](${inline.url}${inline.title ? ` "${inline.title.replace(/"/g, '\\"')}"` : ''})`
    case 'raw': return (inline.format === 'html' && state.caps.rawHtml) || inline.format === 'markdown' ? inline.text : ''
    case 'note': {
      const index = state.notes.length + 1
      if (!state.caps.footnotes) return ` (${blocks(inline.c, state).join(' ')})`
      const body = blocks(inline.c, state).join('\n\n').split('\n').map((line, k) => (k === 0 ? line : `    ${line}`)).join('\n')
      state.notes.push(`[^${index}]: ${body}`)
      return `[^${index}]`
    }
  }
}
