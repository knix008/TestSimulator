/**
 * Readers for the lightweight markup languages: reStructuredText, Org,
 * Textile, MediaWiki, AsciiDoc and LaTeX.
 *
 * Each is a line-oriented block scanner using `parseWithRules` for inlines.
 * They cover the constructs that documents are made of — headings, paragraphs,
 * lists, code, quotes, tables, links, emphasis — and pass anything else
 * through as text rather than failing, since a converter that stops on the
 * first unknown directive is not useful.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, str, textToInlines } from '../ast'
import { delimited, parseWithRules, type InlineRule } from './inlineRules'

const blank = (line: string | undefined) => line === undefined || line.trim() === ''

/** Splits an indented run of lines off at `from`, returning them dedented. */
function takeIndented(lines: string[], from: number, minIndent = 1): { body: string[]; next: number } {
  const body: string[] = []
  let i = from
  let indent = Infinity
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) {
      body.push('')
      i += 1
      continue
    }
    const lead = line.length - line.trimStart().length
    if (lead < minIndent) break
    indent = Math.min(indent, lead)
    body.push(line)
    i += 1
  }
  while (body.length && blank(body[body.length - 1])) {
    body.pop()
    i -= 1
  }
  return { body: body.map((line) => (blank(line) ? '' : line.slice(indent === Infinity ? 0 : indent))), next: i }
}

function tightenItems(items: Block[][]): Block[][] {
  for (const item of items) if (item.length === 1 && item[0].t === 'para') item[0] = { t: 'plain', c: item[0].c }
  return items
}

/** A generic list collector: `marker(line)` returns the content column or -1. */
function collectList(lines: string[], start: number, marker: (line: string) => { content: string; column: number } | null, parse: (body: string[]) => Block[]): { items: Block[][]; next: number } {
  const items: string[][] = []
  let i = start
  while (i < lines.length) {
    const first = marker(lines[i])
    if (!first) break
    const body = [first.content]
    i += 1
    while (i < lines.length) {
      const line = lines[i]
      if (blank(line)) {
        if (i + 1 < lines.length && !blank(lines[i + 1]) && lines[i + 1].length - lines[i + 1].trimStart().length >= first.column) {
          body.push('')
          i += 1
          continue
        }
        break
      }
      const lead = line.length - line.trimStart().length
      if (lead >= first.column) {
        body.push(line.slice(first.column))
        i += 1
        continue
      }
      if (marker(line)) break
      // Lazy continuation.
      body.push(line.trim())
      i += 1
    }
    items.push(body)
    while (i < lines.length && blank(lines[i]) && i + 1 < lines.length && marker(lines[i + 1])) i += 1
  }
  return { items: tightenItems(items.map(parse)), next: i }
}

/* --------------------------------------------------------- reStructuredText */

const RST_ADORNMENT = /^([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])\1{2,}\s*$/

const rstRules: InlineRule[] = [
  { pattern: /``([^`]+)``/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /:math:`([^`]+)`/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /:(?:sup|superscript):`([^`]+)`/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /:(?:sub|subscript):`([^`]+)`/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /:[\w-]+:`([^`]+)`/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /`([^`<]+?)\s*<([^>]+)>`_{1,2}/y, build: (m, r) => ({ t: 'link', c: r(m[1].trim()), url: m[2] }) },
  { pattern: /`([^`]+)`_{1,2}/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: m[1] }) },
  { pattern: /`([^`]+)`/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  delimited('**', (c) => ({ t: 'strong', c })),
  delimited('*', (c) => ({ t: 'emph', c })),
  { pattern: /\|([^|\s]+)\|/y, build: (m) => str(m[1]) },
  { pattern: /(https?:\/\/[^\s<>`]+[^\s<>`.,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /\\(.)/y, build: (m) => str(m[1]) },
]

export function readRst(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')
  const meta: Meta = {}
  const levels: string[] = []
  const links = new Map<string, string>()
  for (const line of lines) {
    const target = /^\.\.\s+_([^:]+):\s*(\S+)\s*$/.exec(line)
    if (target) links.set(target[1].toLowerCase(), target[2])
  }
  const rules: InlineRule[] = [
    { pattern: /`([^`]+)`_/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: links.get(m[1].toLowerCase()) ?? m[1] }) },
    { pattern: /([\w-]+)_(?![\w])/y, build: (m) => (links.has(m[1].toLowerCase()) ? { t: 'link', c: [str(m[1])], url: links.get(m[1].toLowerCase())! } : null) },
    ...rstRules,
  ]
  const inl = (text: string) => parseWithRules(text, rules)

  function parse(input: string[]): Block[] {
    const blocks: Block[] = []
    let i = 0
    while (i < input.length) {
      const line = input[i]
      if (blank(line)) { i += 1; continue }

      // Section title with overline and/or underline.
      if (RST_ADORNMENT.test(line) && i + 2 < input.length && !blank(input[i + 1]) && RST_ADORNMENT.test(input[i + 2]) && input[i + 2][0] === line[0]) {
        const key = `${line[0]}${line[0]}`
        if (!levels.includes(key)) levels.push(key)
        blocks.push(header(levels.indexOf(key) + 1, inl(input[i + 1].trim())))
        i += 3
        continue
      }
      if (!blank(line) && i + 1 < input.length && RST_ADORNMENT.test(input[i + 1]) && input[i + 1].trim().length >= line.trim().length && !line.startsWith(' ')) {
        const key = input[i + 1][0]
        if (!levels.includes(key)) levels.push(key)
        blocks.push(header(levels.indexOf(key) + 1, inl(line.trim())))
        i += 2
        continue
      }
      // Transitions.
      if (RST_ADORNMENT.test(line) && line.trim().length >= 4) {
        blocks.push({ t: 'hr' })
        i += 1
        continue
      }
      // Directives.
      const directive = /^\.\.\s+([\w-]+)::\s*(.*)$/.exec(line)
      if (directive) {
        const name = directive[1].toLowerCase()
        const arg = directive[2].trim()
        const { body, next } = takeIndented(input, i + 1, 1)
        i = next
        // Options (`:name: value`) come first.
        const options: Record<string, string> = {}
        let k = 0
        while (k < body.length && /^:[\w-]+:/.test(body[k])) {
          const option = /^:([\w-]+):\s*(.*)$/.exec(body[k])
          if (option) options[option[1]] = option[2]
          k += 1
        }
        while (k < body.length && blank(body[k])) k += 1
        const content = body.slice(k)
        if (name === 'code-block' || name === 'code' || name === 'sourcecode' || name === 'highlight') blocks.push({ t: 'code', text: content.join('\n'), lang: arg || undefined })
        else if (name === 'image' || name === 'figure') {
          const captionBlocks = name === 'figure' ? parse(content) : []
          const alt = options.alt ?? ''
          const image: Inline = { t: 'image', c: captionBlocks.length && captionBlocks[0].t === 'para' ? captionBlocks[0].c : textToInlines(alt), url: arg }
          blocks.push({ t: 'para', c: [image] })
        } else if (name === 'math') blocks.push({ t: 'para', c: [{ t: 'math', text: [arg, ...content].filter(Boolean).join('\n'), display: true }] })
        else if (name === 'note' || name === 'warning' || name === 'tip' || name === 'important' || name === 'caution' || name === 'hint' || name === 'attention' || name === 'danger' || name === 'error' || name === 'admonition') {
          const label = name === 'admonition' ? arg : name[0].toUpperCase() + name.slice(1)
          blocks.push({ t: 'div', attrs: { classes: [name] }, c: [{ t: 'para', c: [{ t: 'strong', c: [str(label)] }] }, ...parse(content)] })
        } else if (name === 'contents' || name === 'toctree' || name === 'sectnum' || name === 'header' || name === 'footer' || name === 'meta') {
          // Navigation and layout directives have no content of their own.
        } else if (name === 'raw') blocks.push({ t: 'raw', format: arg || 'html', text: content.join('\n') })
        else if (name === 'table' || name === 'csv-table' || name === 'list-table') {
          const inner = parse(content)
          const table = inner.find((block) => block.t === 'table')
          if (table && table.t === 'table' && arg) table.caption = inl(arg)
          blocks.push(...inner)
        }
        else if (name === 'title') meta.title = arg
        else blocks.push(...parse([arg, ...content].filter((entry) => entry !== undefined)))
        continue
      }
      // Comments and targets.
      if (/^\.\.(\s|$)/.test(line)) {
        i = takeIndented(input, i + 1, 1).next
        continue
      }
      // Field list at the top: title/author/date.
      const field = /^:(\w+):\s*(.*)$/.exec(line)
      if (field && blocks.length === 0) {
        const key = field[1].toLowerCase()
        if (key === 'title' || key === 'author' || key === 'date' || key === 'authors') meta[key === 'authors' ? 'author' : key] = field[2].trim()
        i += 1
        continue
      }
      // Literal block introduced by `::`.
      if (line.trim() === '::') {
        const { body, next } = takeIndented(input, i + 1, 1)
        blocks.push({ t: 'code', text: body.join('\n') })
        i = next
        continue
      }
      // Bullet and enumerated lists.
      const bulletMarker = (entry: string) => {
        const m = /^(\s*)([-*+•])\s+(.*)$/.exec(entry)
        return m ? { content: m[3], column: m[1].length + 2 } : null
      }
      const enumMarker = (entry: string) => {
        const m = /^(\s*)(\(?(?:\d+|#|[a-zA-Z]|[ivxIVX]+)[.)])\s+(.*)$/.exec(entry)
        return m ? { content: m[3], column: m[1].length + m[2].length + 1 } : null
      }
      if (bulletMarker(line)) {
        const { items, next } = collectList(input, i, bulletMarker, parse)
        blocks.push({ t: 'bullet', items })
        i = next
        continue
      }
      if (enumMarker(line) && !/^\s*[a-zA-Z]{2,}\./.test(line)) {
        const first = /^\s*\(?(\d+)/.exec(line)
        const { items, next } = collectList(input, i, enumMarker, parse)
        blocks.push({ t: 'ordered', start: first ? Number(first[1]) : 1, items })
        i = next
        continue
      }
      // Definition list: term line then indented definition.
      if (!line.startsWith(' ') && i + 1 < input.length && input[i + 1].startsWith(' ') && !blank(input[i + 1]) && !line.trim().endsWith('::')) {
        const items: { term: Inline[]; defs: Block[][] }[] = []
        while (i < input.length && !blank(input[i]) && !input[i].startsWith(' ') && i + 1 < input.length && input[i + 1].startsWith(' ') && !blank(input[i + 1])) {
          const term = input[i].split(/\s+:\s+/)[0].trim()
          const { body, next } = takeIndented(input, i + 1, 1)
          items.push({ term: inl(term), defs: [parse(body)] })
          i = next
          if (i < input.length && blank(input[i])) i += 1
        }
        blocks.push({ t: 'deflist', items })
        continue
      }
      // Simple and grid tables.
      if (/^\s*[=+][-=+ ]+$/.test(line) || (/^\s*\+-/.test(line))) {
        const result = rstTable(input, i, inl)
        if (result) {
          blocks.push(result.block)
          i = result.next
          continue
        }
      }
      // Block quote: an indented paragraph on its own.
      if (line.startsWith(' ')) {
        const { body, next } = takeIndented(input, i, 1)
        blocks.push({ t: 'quote', c: parse(body) })
        i = next
        continue
      }
      // Line block.
      if (/^\|\s/.test(line) || line === '|') {
        const rows: Inline[][] = []
        while (i < input.length && (/^\|\s/.test(input[i]) || input[i] === '|')) {
          rows.push(inl(input[i].replace(/^\|\s?/, '')))
          i += 1
        }
        blocks.push({ t: 'linebl', lines: rows })
        continue
      }
      // Paragraph; a trailing `::` starts a literal block.
      const body: string[] = []
      while (i < input.length && !blank(input[i]) && !input[i].startsWith(' ') && !(i + 1 < input.length && RST_ADORNMENT.test(input[i + 1]) && body.length)) {
        body.push(input[i].trim())
        i += 1
      }
      if (!body.length) { i += 1; continue }
      let text = body.join('\n')
      let literal = false
      if (text.endsWith('::')) {
        text = text.slice(0, -2).trimEnd()
        literal = true
        if (text.endsWith(' ') || text === '') text = text.trim()
        else text += ':'
      }
      if (text) blocks.push({ t: 'para', c: inl(text) })
      if (literal) {
        while (i < input.length && blank(input[i])) i += 1
        const { body: code, next } = takeIndented(input, i, 1)
        blocks.push({ t: 'code', text: code.join('\n') })
        i = next
      }
    }
    return blocks
  }
  const blocks = parse(lines)
  // The first title becomes the document title, as docutils does.
  if (!meta.title && blocks.length && blocks[0].t === 'header' && blocks[0].level === 1 && levels.length > 1) {
    const [first, ...rest] = blocks
    meta.title = textOf(first.c)
    return { meta, blocks: rest.map((block) => (block.t === 'header' ? { ...block, level: Math.max(1, block.level - 1) } : block)) }
  }
  return { meta, blocks }
}

function textOf(inlines: Inline[]): string {
  return inlines.map((inline) => (inline.t === 'str' ? inline.text : inline.t === 'space' ? ' ' : inline.t === 'code' ? inline.text : 'c' in inline && inline.t !== 'note' ? textOf(inline.c as Inline[]) : '')).join('')
}

function rstTable(lines: string[], start: number, inl: (text: string) => Inline[]): { block: Block; next: number } | null {
  const line = lines[start]
  if (/^\s*\+-/.test(line)) {
    // Grid table.
    const rows: string[][] = []
    let i = start
    let current: string[] | null = null
    let headerEnd = -1
    while (i < lines.length && /^\s*[+|]/.test(lines[i])) {
      const entry = lines[i].trim()
      if (entry.startsWith('+')) {
        if (current) rows.push(current)
        current = null
        if (entry.includes('=')) headerEnd = rows.length
      } else {
        const cells = entry.slice(1, -1).split('|').map((cell) => cell.trim())
        if (!current) current = cells
        else current = current.map((cell, k) => `${cell}\n${cells[k] ?? ''}`.trim())
      }
      i += 1
    }
    if (current) rows.push(current)
    if (!rows.length) return null
    const width = Math.max(...rows.map((row) => row.length))
    const header = headerEnd > 0 ? rows.slice(0, headerEnd)[0] : []
    const body = headerEnd > 0 ? rows.slice(headerEnd) : rows
    const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(inl) }
    return { block: { t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: header.length ? pad(header) : [], rows: body.map(pad) }, next: i }
  }
  // Simple table: column boundaries from the first `=====  =====` line.
  const rule = lines[start]
  if (!/^\s*=+(\s+=+)*\s*$/.test(rule)) return null
  const columns: { from: number; to: number }[] = []
  for (const match of rule.matchAll(/=+/g)) columns.push({ from: match.index, to: match.index + match[0].length })
  const split = (entry: string) => columns.map((col, k) => (k === columns.length - 1 ? entry.slice(col.from) : entry.slice(col.from, col.to)).trim())
  const rows: string[][] = []
  let header: string[] = []
  let i = start + 1
  let sawSecondRule = false
  while (i < lines.length && !blank(lines[i])) {
    if (/^\s*=+(\s+=+)*\s*$/.test(lines[i])) {
      if (!sawSecondRule && rows.length === 1) {
        header = rows.pop()!
        sawSecondRule = true
      } else if (sawSecondRule || rows.length) {
        i += 1
        break
      }
      i += 1
      continue
    }
    rows.push(split(lines[i]))
    i += 1
  }
  return { block: { t: 'table', caption: [], aligns: columns.map(() => 'default' as Alignment), header: header.map(inl), rows: rows.map((row) => row.map(inl)) }, next: i }
}

/* --------------------------------------------------------------------- Org */

const orgRules: InlineRule[] = [
  { pattern: /\[\[([^\]]+)\]\[([^\]]+)\]\]/y, build: (m, r) => (/\.(png|jpe?g|gif|svg|webp)$/i.test(m[1]) ? { t: 'image', c: r(m[2]), url: m[1].replace(/^file:/, '') } : { t: 'link', c: r(m[2]), url: m[1].replace(/^file:/, '') }) },
  { pattern: /\[\[([^\]]+)\]\]/y, build: (m) => (/\.(png|jpe?g|gif|svg|webp)$/i.test(m[1]) ? { t: 'image', c: [], url: m[1].replace(/^file:/, '') } : { t: 'link', c: [str(m[1])], url: m[1].replace(/^file:/, '') }) },
  { pattern: /=([^=\n]+)=(?![\w])/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /~([^~\n]+)~(?![\w])/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\\\(([\s\S]+?)\\\)/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /\$([^$\s][^$\n]*?)\$(?![\w$])/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('/', (c) => ({ t: 'emph', c })),
  delimited('_', (c) => ({ t: 'underline', c })),
  delimited('+', (c) => ({ t: 'strike', c })),
  { pattern: /\^\{([^}]+)\}/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /_\{([^}]+)\}/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /(https?:\/\/[^\s<>\]]+[^\s<>\].,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /\\\\$/my, build: () => ({ t: 'linebreak' }) },
]

const orgInlines = (text: string) => parseWithRules(text, orgRules)

export function readOrg(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}

  function parse(input: string[]): Block[] {
    const blocks: Block[] = []
    let i = 0
    while (i < input.length) {
      const line = input[i]
      if (blank(line)) { i += 1; continue }
      const keyword = /^#\+(\w+):\s*(.*)$/i.exec(line)
      if (keyword) {
        const key = keyword[1].toLowerCase()
        if (key === 'title' || key === 'author' || key === 'date' || key === 'email' || key === 'language') meta[key] = keyword[2].trim()
        i += 1
        continue
      }
      const heading = /^(\*+)\s+(?:(?:TODO|DONE)\s+)?(.*?)(?:\s+:[\w:@]+:)?\s*$/.exec(line)
      if (heading) {
        blocks.push(header(heading[1].length, orgInlines(heading[2])))
        i += 1
        continue
      }
      const begin = /^\s*#\+begin_(\w+)\s*(.*)$/i.exec(line)
      if (begin) {
        const kind = begin[1].toLowerCase()
        const body: string[] = []
        i += 1
        while (i < input.length && !new RegExp(`^\\s*#\\+end_${kind}\\s*$`, 'i').test(input[i])) {
          body.push(input[i])
          i += 1
        }
        i += 1
        const dedented = dedent(body)
        if (kind === 'src') blocks.push({ t: 'code', text: dedented.join('\n'), lang: begin[2].trim().split(/\s+/)[0] || undefined })
        else if (kind === 'example' || kind === 'export') blocks.push(kind === 'export' ? { t: 'raw', format: begin[2].trim() || 'html', text: dedented.join('\n') } : { t: 'code', text: dedented.join('\n') })
        else if (kind === 'quote') blocks.push({ t: 'quote', c: parse(dedented) })
        else if (kind === 'verse') blocks.push({ t: 'linebl', lines: dedented.map(orgInlines) })
        else if (kind === 'comment') { /* dropped */ }
        else blocks.push({ t: 'div', attrs: { classes: [kind] }, c: parse(dedented) })
        continue
      }
      if (/^\s*#(\s|$)/.test(line)) { i += 1; continue }
      if (/^\s*-{5,}\s*$/.test(line)) {
        blocks.push({ t: 'hr' })
        i += 1
        continue
      }
      if (/^\s*:\s/.test(line)) {
        const body: string[] = []
        while (i < input.length && /^\s*:\s?/.test(input[i])) {
          body.push(input[i].replace(/^\s*:\s?/, ''))
          i += 1
        }
        blocks.push({ t: 'code', text: body.join('\n') })
        continue
      }
      if (/^\s*\|/.test(line)) {
        const rows: string[][] = []
        let headerRow: string[] | null = null
        while (i < input.length && /^\s*\|/.test(input[i])) {
          const entry = input[i].trim()
          if (/^\|[-+]+\|?$/.test(entry)) {
            if (rows.length === 1 && !headerRow) headerRow = rows.pop()!
          } else {
            rows.push(entry.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()))
          }
          i += 1
        }
        const width = Math.max(headerRow?.length ?? 0, ...rows.map((row) => row.length), 1)
        const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(orgInlines) }
        blocks.push({ t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: rows.map(pad) })
        continue
      }
      const bulletMarker = (entry: string) => {
        const m = /^(\s*)([-+]|\*(?=\s))\s+(?:\[([ xX-])\]\s+)?(.*)$/.exec(entry)
        return m && !(m[2] === '*' && m[1].length === 0) ? { content: m[4], column: m[1].length + 2, task: m[3] } : null
      }
      const orderedMarker = (entry: string) => {
        const m = /^(\s*)(\d+[.)])\s+(.*)$/.exec(entry)
        return m ? { content: m[3], column: m[1].length + m[2].length + 1 } : null
      }
      if (bulletMarker(line)) {
        const tasks: (boolean | null)[] = []
        let k = i
        const probe = (entry: string) => {
          const m = bulletMarker(entry)
          if (m && k < input.length) tasks.push(m.task === undefined ? null : m.task.toLowerCase() === 'x')
          return m
        }
        const { items, next } = collectList(input, i, (entry) => { k += 1; return probe(entry) }, parse)
        blocks.push({ t: 'bullet', items, tasks: tasks.slice(0, items.length).some((task) => task !== null) ? tasks.slice(0, items.length) : undefined })
        i = next
        continue
      }
      if (orderedMarker(line)) {
        const start = Number(/^\s*(\d+)/.exec(line)?.[1] ?? 1)
        const { items, next } = collectList(input, i, orderedMarker, parse)
        blocks.push({ t: 'ordered', start, items })
        i = next
        continue
      }
      // Definition items inside lists: `- term :: definition`.
      const body: string[] = []
      while (i < input.length && !blank(input[i]) && !/^\*+\s/.test(input[i]) && !/^\s*#\+/.test(input[i]) && !bulletMarker(input[i]) && !orderedMarker(input[i]) && !/^\s*\|/.test(input[i])) {
        body.push(input[i].trim())
        i += 1
      }
      if (body.length) blocks.push({ t: 'para', c: orgInlines(body.join('\n')) })
      else i += 1
    }
    return blocks
  }
  return { meta, blocks: parse(lines) }
}

function dedent(lines: string[]): string[] {
  let indent = Infinity
  for (const line of lines) if (!blank(line)) indent = Math.min(indent, line.length - line.trimStart().length)
  if (!Number.isFinite(indent)) return lines
  return lines.map((line) => line.slice(indent))
}

/* ----------------------------------------------------------------- Textile */

const textileRules: InlineRule[] = [
  { pattern: /@([^@\n]+)@/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /!([^!\s]+)(?:\(([^)]*)\))?!(?::(\S+))?/y, build: (m) => (m[3] ? { t: 'link', c: [{ t: 'image', c: m[2] ? textToInlines(m[2]) : [], url: m[1] }], url: m[3] } : { t: 'image', c: m[2] ? textToInlines(m[2]) : [], url: m[1] }) },
  { pattern: /"([^"]+)":(\S+?)(?=[.,;:!?)]?(?:\s|$))/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: m[2] }) },
  { pattern: /\[([^\]]+)\]/y, build: (m) => ({ t: 'raw', format: 'textile', text: m[0] }) },
  delimited('**', (c) => ({ t: 'strong', c })),
  delimited('__', (c) => ({ t: 'emph', c })),
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  delimited('-', (c) => ({ t: 'strike', c }), { allowSpace: false }),
  delimited('+', (c) => ({ t: 'underline', c }), { allowSpace: false }),
  delimited('^', (c) => ({ t: 'sup', c }), { allowSpace: false }),
  delimited('~', (c) => ({ t: 'sub', c }), { allowSpace: false }),
  { pattern: /\?\?([^?]+)\?\?/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /%([^%\n]+)%/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /\(tm\)/iy, build: () => str('™') },
  { pattern: /\(r\)/iy, build: () => str('®') },
  { pattern: /\(c\)/iy, build: () => str('©') },
  { pattern: /--/y, build: () => str('—') },
]

const textileInlines = (text: string) => parseWithRules(text, textileRules)

export function readTextile(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const marker = (entry: string) => /^([*#]+)\s+(.*)$/.exec(entry)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const block = /^(h[1-6]|bq|bc|pre|p|fn\d+|notextile)(?:\([^)]*\))?(?:\{[^}]*\})?[<>=]*\.(\.?)\s+(.*)$/.exec(line)
    if (block) {
      const kind = block[1]
      const extended = block[2] === '.'
      const body: string[] = [block[3]]
      i += 1
      if (extended) {
        while (i < lines.length && !/^(h[1-6]|bq|bc|pre|p|fn\d+|notextile)(?:\([^)]*\))?\.\s/.test(lines[i])) {
          body.push(lines[i])
          i += 1
        }
      } else {
        while (i < lines.length && !blank(lines[i])) {
          body.push(lines[i])
          i += 1
        }
      }
      while (body.length && blank(body[body.length - 1])) body.pop()
      const text = body.join('\n')
      if (kind.startsWith('h')) blocks.push(header(Number(kind[1]), textileInlines(text)))
      else if (kind === 'bq') blocks.push({ t: 'quote', c: [{ t: 'para', c: textileInlines(text) }] })
      else if (kind === 'bc' || kind === 'pre') blocks.push({ t: 'code', text })
      else if (kind === 'notextile') blocks.push({ t: 'raw', format: 'html', text })
      else blocks.push({ t: 'para', c: textileInlines(text) })
      continue
    }
    if (/^(?:<pre>|<code>)/i.test(line.trim())) {
      const body: string[] = []
      while (i < lines.length && !/<\/pre>/i.test(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      body.push(lines[i] ?? '')
      i += 1
      blocks.push({ t: 'code', text: body.join('\n').replace(/<\/?(?:pre|code)[^>]*>/gi, '').replace(/^\n|\n$/g, '') })
      continue
    }
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line.trim())) {
      blocks.push({ t: 'hr' })
      i += 1
      continue
    }
    if (marker(line)) {
      const result = textileList(lines, i)
      blocks.push(result.block)
      i = result.next
      continue
    }
    if (/^\|/.test(line.trim())) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        const entry = lines[i].trim().replace(/^\|\s*|\s*\|$/g, '')
        const cells = entry.split('|').map((cell) => cell.trim())
        if (cells.every((cell) => cell.startsWith('_.')) && !headerRow && !rows.length) headerRow = cells.map((cell) => cell.slice(2).trim())
        else rows.push(cells.map((cell) => cell.replace(/^(?:[<>=^~_]|\\\d|\/\d|\{[^}]*\}|\([^)]*\))+\.\s*/, '')))
        i += 1
      }
      const width = Math.max(headerRow?.length ?? 0, ...rows.map((row) => row.length), 1)
      const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(textileInlines) }
      blocks.push({ t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: rows.map(pad) })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !marker(lines[i]) && !/^\|/.test(lines[i].trim())) {
      body.push(lines[i])
      i += 1
    }
    if (body.length) blocks.push({ t: 'para', c: textileInlines(body.join('\n')) })
  }
  return { meta: {}, blocks }
}

function textileList(lines: string[], start: number): { block: Block; next: number } {
  // Items are `* text`, `** nested`, `# ordered`; nesting is the marker length.
  type Item = { markers: string; text: string }
  const flat: Item[] = []
  let i = start
  const firstKind = lines[start][0]
  while (i < lines.length && /^[*#]+\s+/.test(lines[i])) {
    const m = /^([*#]+)\s+(.*)$/.exec(lines[i])!
    // A different marker at the top level starts another list.
    if (m[1].length === 1 && m[1] !== firstKind) break
    flat.push({ markers: m[1], text: m[2] })
    i += 1
    while (i < lines.length && !blank(lines[i]) && !/^[*#]+\s+/.test(lines[i])) {
      flat[flat.length - 1].text += `\n${lines[i]}`
      i += 1
    }
  }
  const build = (items: Item[], depth: number): Block => {
    const kind = items[0].markers[depth - 1] === '#' ? 'ordered' : 'bullet'
    const out: Block[][] = []
    let k = 0
    while (k < items.length) {
      const item = items[k]
      const blocks: Block[] = [{ t: 'plain', c: textileInlines(item.text) }]
      k += 1
      const nested: Item[] = []
      while (k < items.length && items[k].markers.length > depth) {
        nested.push(items[k])
        k += 1
      }
      if (nested.length) blocks.push(build(nested, depth + 1))
      out.push(blocks)
    }
    return kind === 'ordered' ? { t: 'ordered', start: 1, items: out, tight: true } : { t: 'bullet', items: out, tight: true }
  }
  return { block: build(flat, 1), next: i }
}

/* --------------------------------------------------------------- MediaWiki */

const wikiRules: InlineRule[] = [
  { pattern: /<nowiki>([\s\S]*?)<\/nowiki>/y, build: (m) => str(m[1]) },
  { pattern: /<code>([\s\S]*?)<\/code>/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /<tt>([\s\S]*?)<\/tt>/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /<math>([\s\S]*?)<\/math>/y, build: (m) => ({ t: 'math', text: m[1].trim(), display: false }) },
  { pattern: /<(b|strong)>([\s\S]*?)<\/\1>/y, build: (m, r) => ({ t: 'strong', c: r(m[2]) }) },
  { pattern: /<(i|em)>([\s\S]*?)<\/\1>/y, build: (m, r) => ({ t: 'emph', c: r(m[2]) }) },
  { pattern: /<(s|del|strike)>([\s\S]*?)<\/\1>/y, build: (m, r) => ({ t: 'strike', c: r(m[2]) }) },
  { pattern: /<u>([\s\S]*?)<\/u>/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /<sup>([\s\S]*?)<\/sup>/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /<sub>([\s\S]*?)<\/sub>/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /<br\s*\/?>/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /<ref[^>]*>([\s\S]*?)<\/ref>/y, build: (m, r) => ({ t: 'note', c: [{ t: 'para', c: r(m[1]) }] }) },
  { pattern: /<ref[^>]*\/>/y, build: () => null },
  { pattern: /'''''([\s\S]+?)'''''/y, build: (m, r) => ({ t: 'strong', c: [{ t: 'emph', c: r(m[1]) }] }) },
  { pattern: /'''([\s\S]+?)'''/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /''([\s\S]+?)''/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /\[\[(?:File|Image):([^\]|]+)(?:\|[^\]]*?)?(?:\|([^\]|]*))?\]\]/iy, build: (m) => ({ t: 'image', c: m[2] ? textToInlines(m[2]) : [], url: m[1] }) },
  { pattern: /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/y, build: (m, r) => ({ t: 'link', c: m[2] !== undefined ? r(m[2]) : [str(m[1])], url: m[1] }) },
  { pattern: /\[((?:https?|ftp|mailto):[^\s\]]+)(?:\s+([^\]]*))?\]/y, build: (m, r) => ({ t: 'link', c: m[2] ? r(m[2]) : [str(m[1])], url: m[1] }) },
  { pattern: /(https?:\/\/[^\s<>[\]]+[^\s<>[\].,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /&nbsp;/y, build: () => str(' ') },
]

const wikiInlines = (text: string) => parseWithRules(text, wikiRules)

export function readMediaWiki(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (entry: string) => /^([*#;:]+)\s*(.*)$/.exec(entry)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^(={1,6})\s*(.*?)\s*\1\s*$/.exec(line)
    if (heading) {
      blocks.push(header(heading[1].length, wikiInlines(heading[2])))
      i += 1
      continue
    }
    if (/^-{4,}\s*$/.test(line)) {
      blocks.push({ t: 'hr' })
      i += 1
      continue
    }
    const pre = /^<(pre|syntaxhighlight|source|code)(?:\s+lang=["']?([\w+#-]+)["']?)?[^>]*>(.*)$/i.exec(line)
    if (pre) {
      const tag = pre[1].toLowerCase()
      const body: string[] = []
      let rest = pre[3]
      i += 1
      const closer = new RegExp(`</${tag}>`, 'i')
      if (closer.test(rest)) {
        body.push(rest.replace(closer, ''))
      } else {
        if (rest) body.push(rest)
        while (i < lines.length && !closer.test(lines[i])) {
          body.push(lines[i])
          i += 1
        }
        if (i < lines.length) {
          rest = lines[i].replace(closer, '')
          if (rest.trim()) body.push(rest)
          i += 1
        }
      }
      blocks.push({ t: 'code', text: body.join('\n'), lang: pre[2] || undefined })
      continue
    }
    if (/^<blockquote>/i.test(line)) {
      const body: string[] = []
      while (i < lines.length && !/<\/blockquote>/i.test(lines[i])) {
        body.push(lines[i].replace(/<blockquote>/i, ''))
        i += 1
      }
      if (i < lines.length) body.push(lines[i].replace(/<\/?blockquote>/gi, ''))
      i += 1
      blocks.push({ t: 'quote', c: readMediaWiki(body.join('\n')).blocks })
      continue
    }
    if (line.startsWith('{|')) {
      const result = wikiTable(lines, i)
      blocks.push(result.block)
      i = result.next
      continue
    }
    if (listMarker(line)) {
      const result = wikiList(lines, i)
      blocks.push(...result.blocks)
      i = result.next
      continue
    }
    if (line.startsWith(' ')) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith(' ')) {
        body.push(lines[i].slice(1))
        i += 1
      }
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !listMarker(lines[i]) && !/^(=|\{\||----|<pre|<syntaxhighlight|<source|<blockquote| )/i.test(lines[i])) {
      body.push(lines[i])
      i += 1
    }
    if (body.length) blocks.push({ t: 'para', c: wikiInlines(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

function wikiList(lines: string[], start: number): { blocks: Block[]; next: number } {
  type Item = { markers: string; text: string }
  const flat: Item[] = []
  let i = start
  while (i < lines.length && /^[*#;:]+/.test(lines[i])) {
    const m = /^([*#;:]+)\s*(.*)$/.exec(lines[i])!
    flat.push({ markers: m[1], text: m[2] })
    i += 1
  }
  const build = (items: Item[], depth: number): Block[] => {
    const out: Block[] = []
    let k = 0
    while (k < items.length) {
      const kind = items[k].markers[depth - 1]
      const group: Item[] = []
      while (k < items.length && items[k].markers[depth - 1] === kind) {
        group.push(items[k])
        k += 1
      }
      if (kind === ';' || kind === ':') {
        const defItems: { term: Inline[]; defs: Block[][] }[] = []
        for (const item of group) {
          if (item.markers.length > depth) {
            if (!defItems.length) defItems.push({ term: [], defs: [] })
            defItems[defItems.length - 1].defs.push(build([item], depth + 1))
            continue
          }
          if (kind === ';') {
            const [term, def] = item.text.split(/\s+:\s+/)
            defItems.push({ term: wikiInlines(term), defs: def ? [[{ t: 'plain', c: wikiInlines(def) }]] : [] })
          } else {
            if (!defItems.length) defItems.push({ term: [], defs: [] })
            defItems[defItems.length - 1].defs.push([{ t: 'plain', c: wikiInlines(item.text) }])
          }
        }
        if (defItems.every((item) => !item.term.length)) out.push({ t: 'quote', c: defItems.flatMap((item) => item.defs.flat()) })
        else out.push({ t: 'deflist', items: defItems })
        continue
      }
      const listItems: Block[][] = []
      let j = 0
      while (j < group.length) {
        const item = group[j]
        const blocks: Block[] = [{ t: 'plain', c: wikiInlines(item.text) }]
        j += 1
        const nested: Item[] = []
        while (j < group.length && group[j].markers.length > depth) {
          nested.push(group[j])
          j += 1
        }
        if (nested.length) blocks.push(...build(nested, depth + 1))
        listItems.push(blocks)
      }
      out.push(kind === '#' ? { t: 'ordered', start: 1, items: listItems, tight: true } : { t: 'bullet', items: listItems, tight: true })
    }
    return out
  }
  return { blocks: build(flat, 1), next: i }
}

function wikiTable(lines: string[], start: number): { block: Block; next: number } {
  let i = start + 1
  const rows: { header: boolean; cells: string[] }[] = []
  let caption: Inline[] = []
  let current: { header: boolean; cells: string[] } | null = null
  const stripAttrs = (cell: string) => (cell.includes('|') && !cell.includes('[[') ? cell.slice(cell.indexOf('|') + 1) : cell).trim()
  while (i < lines.length && !lines[i].startsWith('|}')) {
    const line = lines[i].trim()
    if (line.startsWith('|+')) caption = wikiInlines(line.slice(2).trim())
    else if (line.startsWith('|-')) {
      if (current) rows.push(current)
      current = null
    } else if (line.startsWith('!')) {
      if (!current) current = { header: true, cells: [] }
      current.cells.push(...line.slice(1).split(/\s*!!\s*/).map(stripAttrs))
    } else if (line.startsWith('|')) {
      if (!current) current = { header: false, cells: [] }
      current.cells.push(...line.slice(1).split(/\s*\|\|\s*/).map(stripAttrs))
    } else if (current && current.cells.length) {
      current.cells[current.cells.length - 1] += `\n${line}`
    }
    i += 1
  }
  if (current) rows.push(current)
  i += 1
  const width = Math.max(1, ...rows.map((row) => row.cells.length))
  const pad = (cells: string[]) => { const copy = [...cells]; while (copy.length < width) copy.push(''); return copy.map(wikiInlines) }
  const headerRow = rows.length && rows[0].header ? rows[0] : null
  const body = headerRow ? rows.slice(1) : rows
  return {
    block: { t: 'table', caption, aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow.cells) : [], rows: body.map((row) => pad(row.cells)) },
    next: i,
  }
}

/* ---------------------------------------------------------------- AsciiDoc */

const adocRules: InlineRule[] = [
  { pattern: /`([^`\n]+)`/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\+\+([^+\n]+)\+\+/y, build: (m) => str(m[1]) },
  { pattern: /pass:\[([^\]]*)\]/y, build: (m) => ({ t: 'raw', format: 'html', text: m[1] }) },
  { pattern: /(?:link|xref):([^\s[]+)\[([^\]]*)\]/y, build: (m, r) => ({ t: 'link', c: m[2] ? r(m[2].split(',')[0]) : [str(m[1])], url: m[1] }) },
  { pattern: /image:([^\s[]+)\[([^\]]*)\]/y, build: (m) => ({ t: 'image', c: m[2] ? textToInlines(m[2].split(',')[0]) : [], url: m[1] }) },
  { pattern: /(https?:\/\/[^\s[<>]+)\[([^\]]*)\]/y, build: (m, r) => ({ t: 'link', c: m[2] ? r(m[2].split(',')[0]) : [str(m[1])], url: m[1] }) },
  { pattern: /(https?:\/\/[^\s<>[\]]+[^\s<>[\].,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /<<([^,>]+)(?:,([^>]*))?>>/y, build: (m, r) => ({ t: 'link', c: m[2] ? r(m[2]) : [str(m[1])], url: `#${m[1]}` }) },
  { pattern: /stem:\[([^\]]*)\]/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /latexmath:\[([^\]]*)\]/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /\*\*([\s\S]+?)\*\*/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /__([\s\S]+?)__/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /``([\s\S]+?)``/y, build: (m) => ({ t: 'code', text: m[1] }) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  { pattern: /\[line-through\]#([^#]+)#/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /\[underline\]#([^#]+)#/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /\[[^\]]*\]#([^#]+)#/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /#([^#\n]+)#/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /\^([^\s^]+)\^/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /~([^\s~]+)~/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /footnote:\[([^\]]*)\]/y, build: (m, r) => ({ t: 'note', c: [{ t: 'para', c: r(m[1]) }] }) },
  { pattern: / \+\n/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /\(C\)/y, build: () => str('©') },
  { pattern: /\(R\)/y, build: () => str('®') },
  { pattern: /\(TM\)/y, build: () => str('™') },
  { pattern: /--/y, build: () => str('—') },
  { pattern: /\.\.\./y, build: () => str('…') },
  { pattern: /->/y, build: () => str('→') },
  { pattern: /=>/y, build: () => str('⇒') },
]

const adocInlines = (text: string) => parseWithRules(text, adocRules)

export function readAsciiDoc(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  let i = 0
  // Document header: `= Title`, author line, revision line, attributes.
  if (i < lines.length && /^=\s+\S/.test(lines[i])) {
    meta.title = lines[i].replace(/^=\s+/, '').trim()
    i += 1
    if (i < lines.length && !blank(lines[i]) && !/^[=:\[.]/.test(lines[i])) {
      meta.author = lines[i].split(';')[0].replace(/<[^>]*>/, '').trim()
      i += 1
      if (i < lines.length && /^v?\d/.test(lines[i])) {
        meta.date = lines[i].split(',').pop()!.trim()
        i += 1
      }
    }
  }
  function parse(input: string[], from = 0): Block[] {
    const blocks: Block[] = []
    let k = from
    let pendingTitle: string | null = null
    let pendingAttrs: string | null = null
    while (k < input.length) {
      const line = input[k]
      if (blank(line)) { k += 1; continue }
      const attribute = /^:([\w-]+):\s*(.*)$/.exec(line)
      if (attribute) {
        const key = attribute[1].toLowerCase()
        if (key === 'author' || key === 'email' || key === 'date' || key === 'revdate' || key === 'description' || key === 'keywords') meta[key === 'revdate' ? 'date' : key] = attribute[2].trim()
        k += 1
        continue
      }
      if (line.startsWith('//')) {
        if (line.startsWith('////')) {
          k += 1
          while (k < input.length && !input[k].startsWith('////')) k += 1
        }
        k += 1
        continue
      }
      if (/^\.\S/.test(line) && !/^\.\.\./.test(line)) {
        pendingTitle = line.slice(1)
        k += 1
        continue
      }
      if (/^\[.*\]\s*$/.test(line)) {
        pendingAttrs = line.slice(1, -1)
        k += 1
        continue
      }
      const heading = /^(={1,6})\s+(.*?)(?:\s+\1)?\s*$/.exec(line)
      if (heading && (heading[1].length > 1 || blocks.length || meta.title)) {
        const id = /^\[\[([^\]]+)\]\]/.exec(pendingAttrs ?? '')?.[1] ?? (pendingAttrs?.startsWith('#') ? pendingAttrs.slice(1) : '')
        blocks.push(header(heading[1].length - (meta.title ? 1 : 0) || 1, adocInlines(heading[2]), id))
        pendingAttrs = null
        pendingTitle = null
        k += 1
        continue
      }
      if (/^'{3,}\s*$/.test(line) || /^-{3}\s*$/.test(line) || /^\*{3}\s*$/.test(line)) {
        blocks.push({ t: 'hr' })
        k += 1
        continue
      }
      // Delimited blocks.
      const delimiter = /^(-{4,}|\.{4,}|={4,}|_{4,}|\*{4,}|\+{4,}|\/{4,}|-{2})\s*$/.exec(line)
      if (delimiter) {
        const fence = delimiter[1]
        const body: string[] = []
        k += 1
        while (k < input.length && input[k].trimEnd() !== fence) {
          body.push(input[k])
          k += 1
        }
        k += 1
        const attrs = pendingAttrs ?? ''
        const kind = fence[0]
        if (kind === '-' || kind === '.' || kind === '+') {
          if (/^(?:example|NOTE|TIP|WARNING|IMPORTANT|CAUTION)/i.test(attrs) && kind === '-' && fence.length === 2) blocks.push({ t: 'div', attrs: { classes: [attrs.toLowerCase()] }, c: parse(body) })
          else {
            const lang = /^source(?:\s*,\s*([\w+#-]+))?/.exec(attrs)?.[1]
            blocks.push({ t: 'code', text: body.join('\n'), lang: lang || undefined })
          }
        } else if (kind === '=') blocks.push({ t: 'div', attrs: { classes: ['example'] }, c: [...(pendingTitle ? [{ t: 'para', c: [{ t: 'strong', c: [str(pendingTitle)] }] } as Block] : []), ...parse(body)] })
        else if (kind === '_') blocks.push({ t: 'quote', c: parse(body) })
        else if (kind === '*') blocks.push({ t: 'div', attrs: { classes: ['sidebar'] }, c: parse(body) })
        else if (kind === '/') { /* comment block */ }
        pendingAttrs = null
        pendingTitle = null
        continue
      }
      // Tables.
      if (/^\|={3,}\s*$/.test(line)) {
        const body: string[] = []
        k += 1
        while (k < input.length && !/^\|={3,}\s*$/.test(input[k])) {
          body.push(input[k])
          k += 1
        }
        k += 1
        const cells: string[] = []
        for (const entry of body) {
          if (blank(entry)) { cells.push('\n'); continue }
          const parts = entry.split(/\|/).slice(1)
          if (entry.startsWith('|')) cells.push(...parts.map((cell) => cell.replace(/^[^|]*?(?:[<>^]\.?|[aehlmdsv])?\|?/, '').trim()))
          else if (cells.length) cells[cells.length - 1] += ` ${entry.trim()}`
        }
        const columnsAttr = /cols="?([^",\]]+(?:,[^",\]]+)*)"?/.exec(attrs(pendingAttrs))
        const declared = columnsAttr ? columnsAttr[1].split(',').length : 0
        const rowsRaw: string[][] = []
        const explicitRows = body.filter((entry) => !blank(entry) && entry.startsWith('|'))
        const firstRowCells = explicitRows.length ? (explicitRows[0].match(/\|/g) ?? []).length : 1
        const width = declared || firstRowCells || 1
        const flat = cells.filter((cell) => cell !== '\n')
        for (let c = 0; c < flat.length; c += width) rowsRaw.push(flat.slice(c, c + width))
        const hasHeader = /header/.test(pendingAttrs ?? '') || (body.length > 1 && blank(body[1]) && !blank(body[0]))
        const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(adocInlines) }
        const headerRow = hasHeader && rowsRaw.length ? rowsRaw.shift()! : null
        blocks.push({ t: 'table', caption: pendingTitle ? adocInlines(pendingTitle) : [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: rowsRaw.map(pad) })
        pendingAttrs = null
        pendingTitle = null
        continue
      }
      // Block images and macros.
      const image = /^image::([^\s[]+)\[([^\]]*)\]\s*$/.exec(line)
      if (image) {
        blocks.push({ t: 'para', c: [{ t: 'image', c: pendingTitle ? adocInlines(pendingTitle) : image[2] ? textToInlines(image[2].split(',')[0]) : [], url: image[1] }] })
        pendingTitle = null
        k += 1
        continue
      }
      if (/^(?:toc|include)::/.test(line)) { k += 1; continue }
      // Lists.
      const bulletMarker = (entry: string) => {
        const m = /^(\s*)([-*•]+)\s+(?:\[([ x*])\]\s+)?(.*)$/.exec(entry)
        return m && !/^\*{4,}$/.test(m[2]) ? { content: m[4], column: m[1].length + m[2].length + 1, depth: m[2].length, task: m[3] } : null
      }
      const orderedMarker = (entry: string) => {
        const m = /^(\s*)(\.+|\d+\.|[a-z]\.|[ivx]+\))\s+(.*)$/.exec(entry)
        return m ? { content: m[3], column: m[1].length + m[2].length + 1, depth: m[2].startsWith('.') ? m[2].length : 1 } : null
      }
      if (bulletMarker(line) || orderedMarker(line)) {
        const result = adocList(input, k, bulletMarker, orderedMarker, parse)
        blocks.push(result.block)
        k = result.next
        continue
      }
      // Description list: `term:: definition`.
      const term = /^(\S.*?)::(?:\s+(.*))?$/.exec(line)
      if (term && !line.includes('::/') && !/^https?:/.test(line)) {
        const items: { term: Inline[]; defs: Block[][] }[] = []
        while (k < input.length) {
          const t = /^(\S.*?)::(?:\s+(.*))?$/.exec(input[k])
          if (!t) break
          const body: string[] = t[2] ? [t[2]] : []
          k += 1
          while (k < input.length && (input[k].startsWith(' ') || (!blank(input[k]) && !/^(\S.*?)::(?:\s|$)/.test(input[k]) && body.length))) {
            body.push(input[k].trim())
            k += 1
          }
          items.push({ term: adocInlines(t[1]), defs: [parse(body)] })
          while (k < input.length && blank(input[k]) && k + 1 < input.length && /^(\S.*?)::(?:\s|$)/.test(input[k + 1])) k += 1
        }
        blocks.push({ t: 'deflist', items })
        continue
      }
      // Literal paragraph (indented).
      if (line.startsWith(' ')) {
        const { body, next } = takeIndented(input, k, 1)
        blocks.push({ t: 'code', text: body.join('\n') })
        k = next
        continue
      }
      // Admonition paragraph.
      const admonition = /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION):\s+(.*)$/.exec(line)
      if (admonition) {
        const body: string[] = [admonition[2]]
        k += 1
        while (k < input.length && !blank(input[k])) { body.push(input[k]); k += 1 }
        blocks.push({ t: 'div', attrs: { classes: [admonition[1].toLowerCase()] }, c: [{ t: 'para', c: [{ t: 'strong', c: [str(admonition[1])] }, str(':'), { t: 'space' }, ...adocInlines(body.join('\n'))] }] })
        continue
      }
      // Paragraph; `[quote]` / `[source]` attributes change its kind.
      const body: string[] = []
      while (k < input.length && !blank(input[k]) && !bulletMarker(input[k]) && !/^(={1,6}\s|\[.*\]\s*$|\.\S|\|={3,}|-{4,}|\.{4,}|={4,}|_{4,}|\*{4,}|\+{4,}|\/{4,})/.test(input[k])) {
        body.push(input[k])
        k += 1
      }
      if (!body.length) { k += 1; continue }
      const text = body.join('\n')
      if (/^quote|^verse/.test(pendingAttrs ?? '')) blocks.push({ t: 'quote', c: [{ t: 'para', c: adocInlines(text) }] })
      else if (/^source|^listing/.test(pendingAttrs ?? '')) blocks.push({ t: 'code', text, lang: /^source\s*,\s*([\w+#-]+)/.exec(pendingAttrs ?? '')?.[1] })
      else if (/^(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)$/.test(pendingAttrs ?? '')) blocks.push({ t: 'div', attrs: { classes: [pendingAttrs!.toLowerCase()] }, c: [{ t: 'para', c: adocInlines(text) }] })
      else if (pendingAttrs === 'literal') blocks.push({ t: 'code', text })
      else if (pendingAttrs === 'pass') blocks.push({ t: 'raw', format: 'html', text })
      else {
        if (pendingTitle) blocks.push({ t: 'para', c: [{ t: 'strong', c: adocInlines(pendingTitle) }] })
        blocks.push({ t: 'para', c: adocInlines(text) })
      }
      pendingAttrs = null
      pendingTitle = null
    }
    return blocks
  }
  const attrs = (value: string | null) => value ?? ''
  return { meta, blocks: parse(lines, i) }
}

function adocList(
  lines: string[],
  start: number,
  bulletMarker: (entry: string) => { content: string; column: number; depth: number; task?: string } | null,
  orderedMarker: (entry: string) => { content: string; column: number; depth: number } | null,
  parse: (body: string[]) => Block[],
): { block: Block; next: number } {
  type Item = { ordered: boolean; depth: number; text: string; task: boolean | null }
  const flat: Item[] = []
  let i = start
  const firstOrdered = !bulletMarker(lines[start]) && Boolean(orderedMarker(lines[start]))
  while (i < lines.length) {
    const b = bulletMarker(lines[i])
    const o = b ? null : orderedMarker(lines[i])
    const m = b ?? o
    if (!m) {
      if (blank(lines[i]) && i + 1 < lines.length && (bulletMarker(lines[i + 1]) || orderedMarker(lines[i + 1]))) { i += 1; continue }
      break
    }
    // A top-level item of the other kind begins a separate list.
    if (m.depth === 1 && Boolean(o) !== firstOrdered) break
    flat.push({ ordered: Boolean(o), depth: m.depth, text: m.content, task: b && b.task !== undefined ? b.task !== ' ' : null })
    i += 1
    while (i < lines.length && !blank(lines[i]) && !bulletMarker(lines[i]) && !orderedMarker(lines[i])) {
      if (lines[i].trim() === '+') { i += 1; continue }
      flat[flat.length - 1].text += `\n${lines[i].trim()}`
      i += 1
    }
  }
  const build = (items: Item[]): Block => {
    const depth = items[0].depth
    const ordered = items[0].ordered
    const out: Block[][] = []
    const tasks: (boolean | null)[] = []
    let k = 0
    while (k < items.length) {
      const item = items[k]
      const blocks = parse(item.text.split('\n'))
      if (blocks.length === 1 && blocks[0].t === 'para') blocks[0] = { t: 'plain', c: blocks[0].c }
      tasks.push(item.task)
      k += 1
      const nested: Item[] = []
      while (k < items.length && items[k].depth > depth) {
        nested.push(items[k])
        k += 1
      }
      if (nested.length) blocks.push(build(nested))
      out.push(blocks)
    }
    return ordered ? { t: 'ordered', start: 1, items: out, tight: true } : { t: 'bullet', items: out, tight: true, tasks: tasks.some((task) => task !== null) ? tasks : undefined }
  }
  return { block: build(flat), next: i }
}

/* ------------------------------------------------------------------- LaTeX */

export function readLatex(source: string): Doc {
  const meta: Meta = {}
  let text = source.replace(/\r\n?/g, '\n')
  // Preamble metadata, then the body.
  const grab = (command: string) => {
    const match = new RegExp(`\\\\${command}\\s*(?:\\[[^\\]]*\\])?\\{((?:[^{}]|\\{[^{}]*\\})*)\\}`).exec(text)
    return match ? latexText(match[1]) : undefined
  }
  meta.title = grab('title')
  meta.author = grab('author')
  meta.date = grab('date')
  const body = /\\begin\{document\}([\s\S]*?)\\end\{document\}/.exec(text)
  if (body) text = body[1]
  text = text.replace(/(^|[^\\])%.*$/gm, '$1')
  const blocks = latexBlocks(text)
  return { meta: Object.fromEntries(Object.entries(meta).filter(([, value]) => value !== undefined)), blocks }
}

const SECTIONS: Record<string, number> = { part: 1, chapter: 1, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }

function latexText(input: string): string {
  return input.replace(/\\\\/g, ' ').replace(/\\(?:textbf|emph|textit|texttt)\{([^}]*)\}/g, '$1').replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, '').trim()
}

/** Splits the body into top-level chunks: environments, sectioning commands and paragraphs. */
function latexBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const chunks = splitLatex(text)
  for (const chunk of chunks) {
    if (chunk.kind === 'env') {
      const name = chunk.name
      const body = chunk.body
      if (name === 'itemize' || name === 'enumerate' || name === 'description') {
        const items = body.split(/\\item\b/).slice(1)
        if (name === 'description') {
          blocks.push({ t: 'deflist', items: items.map((item) => {
            const match = /^\s*\[([^\]]*)\]\s*([\s\S]*)$/.exec(item)
            return { term: latexInlines(match ? match[1] : ''), defs: [latexBlocks(match ? match[2] : item)] }
          }) })
        } else {
          const parsed = items.map((item) => {
            const item2 = item.replace(/^\s*\[[^\]]*\]/, '')
            const inner = latexBlocks(item2)
            if (inner.length === 1 && inner[0].t === 'para') inner[0] = { t: 'plain', c: inner[0].c }
            return inner
          })
          blocks.push(name === 'enumerate' ? { t: 'ordered', start: 1, items: parsed, tight: true } : { t: 'bullet', items: parsed, tight: true })
        }
      } else if (name === 'verbatim' || name === 'lstlisting' || name === 'minted' || name === 'Verbatim') {
        const lang = /^\s*(?:\[[^\]]*language=([\w+#-]+)[^\]]*\]|\{([\w+#-]+)\})/.exec(body)
        blocks.push({ t: 'code', text: body.replace(/^\s*(?:\[[^\]]*\]|\{[\w+#-]+\})?\n?/, '').replace(/\n$/, ''), lang: lang ? (lang[1] || lang[2]) : undefined })
      } else if (name === 'quote' || name === 'quotation' || name === 'quoting') {
        blocks.push({ t: 'quote', c: latexBlocks(body) })
      } else if (name === 'verse') {
        blocks.push({ t: 'linebl', lines: body.trim().split(/\\\\\s*/).map((line) => latexInlines(line)) })
      } else if (name === 'equation' || name === 'equation*' || name === 'align' || name === 'align*' || name === 'displaymath' || name === 'gather' || name === 'gather*') {
        blocks.push({ t: 'para', c: [{ t: 'math', text: body.trim(), display: true }] })
      } else if (name === 'tabular' || name === 'tabularx' || name === 'longtable') {
        const spec = /^\s*(?:\{[^}]*\})?\s*\{([^}]*)\}/.exec(body)
        const aligns: Alignment[] = (spec ? spec[1].replace(/[^lcr]/g, '') : '').split('').map((ch) => (ch === 'l' ? 'left' : ch === 'c' ? 'center' : 'right'))
        const rowsText = body.replace(/^\s*(?:\{[^}]*\})?\s*\{[^}]*\}/, '').replace(/\\(?:hline|toprule|midrule|bottomrule|endhead|endfirsthead|endfoot|endlastfoot)\b/g, '').replace(/\\cline\{[^}]*\}/g, '')
        const rows = rowsText.split(/\\\\/).map((row) => row.trim()).filter((row) => row !== '').map((row) => row.split('&').map((cell) => latexInlines(cell.trim())))
        const width = Math.max(aligns.length, ...rows.map((row) => row.length), 1)
        while (aligns.length < width) aligns.push('default')
        const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
        blocks.push({ t: 'table', caption: [], aligns, header: rows.length > 1 ? pad(rows[0]) : [], rows: (rows.length > 1 ? rows.slice(1) : rows).map(pad) })
      } else if (name === 'table' || name === 'figure' || name === 'center' || name === 'abstract' || name === 'minipage' || name === 'flushleft' || name === 'flushright' || name === 'document') {
        const caption = /\\caption\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(body)
        const inner = latexBlocks(body.replace(/\\caption\{(?:[^{}]|\{[^{}]*\})*\}/g, '').replace(/\\centering/g, '').replace(/\\label\{[^}]*\}/g, ''))
        if (caption) {
          const table = inner.find((block) => block.t === 'table')
          if (table && table.t === 'table') table.caption = latexInlines(caption[1])
          else if (inner.length === 1 && inner[0].t === 'para' && inner[0].c.length === 1 && inner[0].c[0].t === 'image') inner[0].c[0].c = latexInlines(caption[1])
        }
        if (name === 'abstract') blocks.push({ t: 'div', attrs: { classes: ['abstract'] }, c: inner })
        else blocks.push(...inner)
      } else if (name === 'comment') {
        // Dropped.
      } else {
        blocks.push({ t: 'div', attrs: { classes: [name] }, c: latexBlocks(body) })
      }
      continue
    }
    if (chunk.kind === 'section') {
      blocks.push(header(chunk.level, latexInlines(chunk.text), chunk.label ?? ''))
      continue
    }
    if (chunk.kind === 'command') {
      if (chunk.name === 'maketitle' || chunk.name === 'tableofcontents' || chunk.name === 'newpage' || chunk.name === 'clearpage') continue
      if (chunk.name === 'hrule' || chunk.name === 'rule') blocks.push({ t: 'hr' })
      continue
    }
    const paragraphs = chunk.text.split(/\n\s*\n/)
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim()
      if (!trimmed) continue
      const display = /^\\\[([\s\S]*)\\\]$/.exec(trimmed) ?? /^\$\$([\s\S]*)\$\$$/.exec(trimmed)
      if (display) {
        blocks.push({ t: 'para', c: [{ t: 'math', text: display[1].trim(), display: true }] })
        continue
      }
      const inlines = latexInlines(trimmed)
      if (inlines.length) blocks.push({ t: 'para', c: inlines })
    }
  }
  return blocks
}

type LatexChunk =
  | { kind: 'env'; name: string; body: string }
  | { kind: 'section'; level: number; text: string; label?: string }
  | { kind: 'command'; name: string }
  | { kind: 'text'; text: string }

function splitLatex(text: string): LatexChunk[] {
  const chunks: LatexChunk[] = []
  let buffer = ''
  let i = 0
  const flush = () => {
    if (buffer.trim()) chunks.push({ kind: 'text', text: buffer })
    buffer = ''
  }
  while (i < text.length) {
    if (text.startsWith('\\begin{', i)) {
      const nameEnd = text.indexOf('}', i)
      const name = text.slice(i + 7, nameEnd)
      const close = findEnvEnd(text, name, nameEnd + 1)
      flush()
      chunks.push({ kind: 'env', name, body: text.slice(nameEnd + 1, close.start) })
      i = close.end
      continue
    }
    const section = /^\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\])?\{/.exec(text.slice(i))
    if (section) {
      const open = i + section[0].length - 1
      const closeIndex = matchBrace(text, open)
      flush()
      const label = /^\s*\\label\{([^}]*)\}/.exec(text.slice(closeIndex + 1))
      chunks.push({ kind: 'section', level: SECTIONS[section[1]], text: text.slice(open + 1, closeIndex), label: label?.[1] })
      i = closeIndex + 1 + (label ? label[0].length : 0)
      continue
    }
    const command = /^\\(maketitle|tableofcontents|newpage|clearpage|hrule|rule\{[^}]*\}\{[^}]*\})\b/.exec(text.slice(i))
    if (command) {
      flush()
      chunks.push({ kind: 'command', name: command[1].split('{')[0] })
      i += command[0].length
      continue
    }
    buffer += text[i]
    i += 1
  }
  flush()
  return chunks
}

function findEnvEnd(text: string, name: string, from: number): { start: number; end: number } {
  const open = `\\begin{${name}}`
  const close = `\\end{${name}}`
  let depth = 1
  let i = from
  while (i < text.length) {
    if (text.startsWith(open, i)) { depth += 1; i += open.length; continue }
    if (text.startsWith(close, i)) {
      depth -= 1
      if (depth === 0) return { start: i, end: i + close.length }
      i += close.length
      continue
    }
    i += 1
  }
  return { start: text.length, end: text.length }
}

function matchBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue }
    if (text[i] === '{') depth += 1
    if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return text.length
}

const LATEX_SYMBOLS: Record<string, string> = { ldots: '…', dots: '…', textbackslash: '\\', LaTeX: 'LaTeX', TeX: 'TeX', textellipsis: '…', textendash: '–', textemdash: '—', copyright: '©', textregistered: '®', texttrademark: '™', S: '§', P: '¶', pounds: '£', euro: '€', quad: ' ', qquad: ' ', ',': ' ', ';': ' ', ' ': ' ', '&': '&', '%': '%', '$': '$', '#': '#', _: '_', '{': '{', '}': '}', textasciitilde: '~', textasciicircum: '^', textbar: '|', textless: '<', textgreater: '>' }

export function latexInlines(text: string): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  const flush = () => {
    if (buffer) {
      for (const part of buffer.split(/( +|\n)/)) {
        if (!part) continue
        if (part === '\n') out.push({ t: 'softbreak' })
        else if (/^ +$/.test(part)) out.push({ t: 'space' })
        else {
          const last = out[out.length - 1]
          if (last && last.t === 'str') last.text += part
          else out.push(str(part))
        }
      }
    }
    buffer = ''
  }
  let i = 0
  const arg = (from: number) => {
    const close = matchBrace(text, from)
    return { body: text.slice(from + 1, close), end: close + 1 }
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\') {
      if (text[i + 1] === '\\') {
        flush()
        out.push({ t: 'linebreak' })
        i += 2
        if (text[i] === '[') i = text.indexOf(']', i) + 1
        continue
      }
      if (text[i + 1] === '(') {
        const close = text.indexOf('\\)', i + 2)
        flush()
        out.push({ t: 'math', text: text.slice(i + 2, close < 0 ? text.length : close).trim(), display: false })
        i = close < 0 ? text.length : close + 2
        continue
      }
      if (text[i + 1] === '[') {
        const close = text.indexOf('\\]', i + 2)
        flush()
        out.push({ t: 'math', text: text.slice(i + 2, close < 0 ? text.length : close).trim(), display: true })
        i = close < 0 ? text.length : close + 2
        continue
      }
      const command = /^\\([a-zA-Z]+\*?|.)/.exec(text.slice(i))
      if (!command) { buffer += ch; i += 1; continue }
      const name = command[1]
      let j = i + command[0].length
      if (name === 'verb') {
        const delim = text[j]
        const close = text.indexOf(delim, j + 1)
        flush()
        out.push({ t: 'code', text: text.slice(j + 1, close < 0 ? text.length : close) })
        i = close < 0 ? text.length : close + 1
        continue
      }
      while (text[j] === ' ' && /^[a-zA-Z]/.test(name)) j += 1
      const optional = text[j] === '[' ? text.indexOf(']', j) + 1 : j
      const hasArg = text[optional] === '{'
      const wrap = (kind: 'emph' | 'strong' | 'code' | 'underline' | 'sup' | 'sub' | 'smallcaps' | 'strike') => {
        const { body, end } = arg(optional)
        flush()
        if (kind === 'code') out.push({ t: 'code', text: body })
        else out.push({ t: kind, c: latexInlines(body) })
        i = end
      }
      if (hasArg && (name === 'emph' || name === 'textit' || name === 'textsl' || name === 'itshape')) { wrap('emph'); continue }
      if (hasArg && (name === 'textbf' || name === 'bfseries')) { wrap('strong'); continue }
      if (hasArg && (name === 'texttt' || name === 'code' || name === 'lstinline')) { wrap('code'); continue }
      if (hasArg && (name === 'underline' || name === 'uline')) { wrap('underline'); continue }
      if (hasArg && name === 'textsuperscript') { wrap('sup'); continue }
      if (hasArg && name === 'textsubscript') { wrap('sub'); continue }
      if (hasArg && name === 'textsc') { wrap('smallcaps'); continue }
      if (hasArg && name === 'sout') { wrap('strike'); continue }
      if (hasArg && (name === 'href')) {
        const url = arg(optional)
        const label = text[url.end] === '{' ? arg(url.end) : { body: url.body, end: url.end }
        flush()
        out.push({ t: 'link', c: latexInlines(label.body), url: url.body })
        i = label.end
        continue
      }
      if (hasArg && name === 'url') {
        const { body, end } = arg(optional)
        flush()
        out.push({ t: 'link', c: [str(body)], url: body })
        i = end
        continue
      }
      if (hasArg && name === 'includegraphics') {
        const { body, end } = arg(optional)
        flush()
        out.push({ t: 'image', c: [], url: body })
        i = end
        continue
      }
      if (hasArg && name === 'footnote') {
        const { body, end } = arg(optional)
        flush()
        out.push({ t: 'note', c: [{ t: 'para', c: latexInlines(body) }] })
        i = end
        continue
      }
      if (hasArg && (name === 'ref' || name === 'eqref' || name === 'cite' || name === 'label' || name === 'index' || name === 'pageref' || name === 'autoref' || name === 'cref')) {
        const { body, end } = arg(optional)
        flush()
        if (name !== 'label' && name !== 'index') out.push(name === 'cite' ? str(`[${body}]`) : { t: 'link', c: [str(body)], url: `#${body}` })
        i = end
        continue
      }
      if (hasArg && (name === 'text' || name === 'textnormal' || name === 'textrm' || name === 'mbox' || name === 'hbox' || name === 'textcolor' || name === 'colorbox' || name === 'textsf' || name === 'textmd' || name === 'textup')) {
        let at = optional
        if (name === 'textcolor' || name === 'colorbox') at = arg(at).end
        const { body, end } = arg(at)
        flush()
        out.push(...latexInlines(body))
        i = end
        continue
      }
      if (name === 'newline' || name === 'linebreak') { flush(); out.push({ t: 'linebreak' }); i = j; continue }
      if (name in LATEX_SYMBOLS) {
        buffer += LATEX_SYMBOLS[name]
        i = j
        continue
      }
      // Accents: \'e → é and friends.
      const accent = /^['`^"~=.uvHcdb]$/.test(name)
      if (accent) {
        const target = text[j] === '{' ? arg(j) : { body: text[j] ?? '', end: j + 1 }
        buffer += accented(name, target.body)
        i = target.end
        continue
      }
      // Unknown command: drop it, keep any braced argument's text.
      if (hasArg) {
        const { body, end } = arg(optional)
        flush()
        out.push(...latexInlines(body))
        i = end
        continue
      }
      i = j
      continue
    }
    if (ch === '$') {
      if (text[i + 1] === '$') {
        const close = text.indexOf('$$', i + 2)
        flush()
        out.push({ t: 'math', text: text.slice(i + 2, close < 0 ? text.length : close).trim(), display: true })
        i = close < 0 ? text.length : close + 2
        continue
      }
      const close = text.indexOf('$', i + 1)
      if (close > 0) {
        flush()
        out.push({ t: 'math', text: text.slice(i + 1, close), display: false })
        i = close + 1
        continue
      }
    }
    if (ch === '{' ) {
      const close = matchBrace(text, i)
      const body = text.slice(i + 1, close)
      const font = /^\\(bfseries|itshape|ttfamily|em|bf|it|tt|scshape)\s*([\s\S]*)$/.exec(body)
      flush()
      if (font) {
        const kind = font[1] === 'bfseries' || font[1] === 'bf' ? 'strong' : font[1] === 'ttfamily' || font[1] === 'tt' ? 'code' : font[1] === 'scshape' ? 'smallcaps' : 'emph'
        if (kind === 'code') out.push({ t: 'code', text: font[2] })
        else out.push({ t: kind, c: latexInlines(font[2]) })
      } else {
        out.push(...latexInlines(body))
      }
      i = close + 1
      continue
    }
    if (ch === '}') { i += 1; continue }
    if (ch === '~') { buffer += ' '; i += 1; continue }
    if (ch === '`' && text[i + 1] === '`') { buffer += '“'; i += 2; continue }
    if (ch === "'" && text[i + 1] === "'") { buffer += '”'; i += 2; continue }
    if (ch === '-' && text[i + 1] === '-') {
      if (text[i + 2] === '-') { buffer += '—'; i += 3 } else { buffer += '–'; i += 2 }
      continue
    }
    buffer += ch
    i += 1
  }
  flush()
  while (out.length && (out[0].t === 'space' || out[0].t === 'softbreak')) out.shift()
  while (out.length && (out[out.length - 1].t === 'space' || out[out.length - 1].t === 'softbreak')) out.pop()
  return out
}

function accented(kind: string, letter: string): string {
  const marks: Record<string, string> = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇', u: '̆', v: '̌', H: '̋', c: '̧', d: '̣', b: '̱' }
  const base = letter.replace(/^\\i$/, 'i').replace(/^\\j$/, 'j')
  return (base + (marks[kind] ?? '')).normalize('NFC')
}
