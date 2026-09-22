/**
 * Markdown reader: CommonMark with the GitHub and Pandoc extensions people
 * actually use — pipe tables, fenced code with info strings, task lists,
 * strikethrough, footnotes, YAML metadata, TeX math, superscript/subscript,
 * definition lists, fenced divs and raw HTML.
 *
 * It is a line-oriented block parser over a recursive inline parser, not a
 * port of the CommonMark reference algorithm: the reference's delimiter-run
 * bookkeeping buys exactness on pathological input at the cost of being
 * unreadable, and a converter's input is real documents.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, softbreak, space, str } from '../ast'

type RefMap = Map<string, { url: string; title?: string }>
type NoteMap = Map<string, Block[]>

/**
 * Which extensions a dialect switches on. Pandoc's `markdown` has all of
 * them; `markdown_strict` is the original Markdown.pl; GitHub, PHP Markdown
 * Extra and MultiMarkdown each have their own subset.
 */
export type MarkdownExtensions = {
  tables: boolean
  footnotes: boolean
  fencedCode: boolean
  taskLists: boolean
  strikeout: boolean
  math: boolean
  supSub: boolean
  definitionLists: boolean
  yaml: boolean
  divs: boolean
  headerAttributes: boolean
  autolinkBare: boolean
  /** MultiMarkdown's `key: value` metadata block at the top. */
  mmdMeta: boolean
}

export const MARKDOWN_DIALECTS: Record<string, MarkdownExtensions> = {
  markdown: { tables: true, footnotes: true, fencedCode: true, taskLists: true, strikeout: true, math: true, supSub: true, definitionLists: true, yaml: true, divs: true, headerAttributes: true, autolinkBare: true, mmdMeta: false },
  commonmark_x: { tables: true, footnotes: true, fencedCode: true, taskLists: true, strikeout: true, math: true, supSub: true, definitionLists: true, yaml: true, divs: true, headerAttributes: true, autolinkBare: true, mmdMeta: false },
  gfm: { tables: true, footnotes: true, fencedCode: true, taskLists: true, strikeout: true, math: true, supSub: false, definitionLists: false, yaml: false, divs: false, headerAttributes: false, autolinkBare: true, mmdMeta: false },
  commonmark: { tables: false, footnotes: false, fencedCode: true, taskLists: false, strikeout: false, math: false, supSub: false, definitionLists: false, yaml: false, divs: false, headerAttributes: false, autolinkBare: false, mmdMeta: false },
  markdown_strict: { tables: false, footnotes: false, fencedCode: false, taskLists: false, strikeout: false, math: false, supSub: false, definitionLists: false, yaml: false, divs: false, headerAttributes: false, autolinkBare: false, mmdMeta: false },
  markdown_phpextra: { tables: true, footnotes: true, fencedCode: true, taskLists: false, strikeout: false, math: false, supSub: false, definitionLists: true, yaml: false, divs: false, headerAttributes: true, autolinkBare: false, mmdMeta: false },
  markdown_mmd: { tables: true, footnotes: true, fencedCode: true, taskLists: false, strikeout: false, math: true, supSub: true, definitionLists: true, yaml: false, divs: false, headerAttributes: true, autolinkBare: false, mmdMeta: true },
}

type Context = { refs: RefMap; notes: NoteMap; ext: MarkdownExtensions }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)?.*$/
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const BULLET = /^( {0,3})([-*+])( {1,4}|\t)(\[([ xX])\]\s+)?(.*)$/
const ORDERED = /^( {0,3})(\d{1,9})([.)])( {1,4}|\t)(.*)$/
const QUOTE = /^ {0,3}>( ?)(.*)$/
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const REF_DEF = /^ {0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/
const NOTE_DEF = /^ {0,3}\[\^([^\]]+)\]:\s?(.*)$/
const HTML_BLOCK_START = /^ {0,3}<(?:!--|\/?(?:address|article|aside|blockquote|body|center|dd|details|dialog|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|head|header|hr|html|iframe|legend|li|main|menu|nav|ol|p|pre|script|section|style|summary|table|tbody|td|tfoot|th|thead|title|tr|ul|video|audio|img|picture|svg)\b)/i
const DIV_START = /^ {0,3}:{3,}\s*\{?\.?([\w-]*)[^}]*\}?\s*$/
const DIV_END = /^ {0,3}:{3,}\s*$/
const DISPLAY_MATH = /^ {0,3}\$\$(.*)$/
const DEF_TERM_NEXT = /^ {0,3}[:~]\s+/

export function readMarkdown(source: string, dialect: string | MarkdownExtensions = 'markdown'): Doc {
  const ext = typeof dialect === 'string' ? MARKDOWN_DIALECTS[dialect] ?? MARKDOWN_DIALECTS.markdown : dialect
  const normalized = source.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
  const { meta, body } = ext.yaml ? frontMatter(normalized) : ext.mmdMeta ? mmdMeta(normalized) : { meta: {}, body: normalized }
  const ctx: Context = { refs: new Map(), notes: new Map(), ext }
  const lines = collectDefinitions(body.split('\n'), ctx)
  const blocks = parseBlocks(lines, ctx)
  return { meta, blocks }
}

/** MultiMarkdown metadata: `Key: value` lines at the very top, ended by a blank line. */
function mmdMeta(text: string): { meta: Meta; body: string } {
  const meta: Meta = {}
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && /^[A-Za-z][\w -]*:\s+\S/.test(lines[i])) {
    const [, key, value] = /^([^:]+):\s+(.*)$/.exec(lines[i]) ?? []
    if (key) meta[key.trim().toLowerCase().replace(/\s+/g, '')] = value.trim()
    i += 1
  }
  if (i === 0 || (i < lines.length && lines[i].trim() !== '')) return { meta: {}, body: text }
  return { meta, body: lines.slice(i + 1).join('\n') }
}

/* ------------------------------------------------------------ front matter */

function frontMatter(text: string): { meta: Meta; body: string } {
  const match = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\n?/.exec(text)
  if (!match) return { meta: {}, body: text }
  const meta: Meta = {}
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!pair) continue
    let value = pair[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1).split(',').map((item) => item.trim().replace(/^["']|["']$/g, '')).join(', ')
    meta[pair[1]] = value
  }
  return { meta, body: text.slice(match[0].length) }
}

/* -------------------------------------------- reference & note definitions */

function collectDefinitions(lines: string[], ctx: Context): string[] {
  const kept: string[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceMatch = FENCE.exec(line)
    if (fence) {
      kept.push(line)
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !fenceMatch[2]) fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      kept.push(line)
      continue
    }
    const note = ctx.ext.footnotes ? NOTE_DEF.exec(line) : null
    if (note) {
      const body = [note[2]]
      while (i + 1 < lines.length && (lines[i + 1].startsWith('    ') || (lines[i + 1].trim() === '' && i + 2 < lines.length && lines[i + 2].startsWith('    ')))) {
        i += 1
        body.push(lines[i].replace(/^ {1,4}/, ''))
      }
      ctx.notes.set(note[1].toLowerCase(), parseBlocks(body, ctx))
      continue
    }
    const ref = REF_DEF.exec(line)
    if (ref) {
      ctx.refs.set(ref[1].toLowerCase().replace(/\s+/g, ' '), { url: ref[2], title: ref[3] ?? ref[4] ?? ref[5] })
      continue
    }
    kept.push(line)
  }
  return kept
}

/* ------------------------------------------------------------------ blocks */

function isBlank(line: string | undefined) {
  return line === undefined || line.trim() === ''
}

/** True when `line` could begin a block that interrupts a paragraph. */
function interruptsParagraph(line: string) {
  if (ATX.test(line) || FENCE.test(line) || HR.test(line) || QUOTE.test(line)) return true
  if (HTML_BLOCK_START.test(line)) return true
  const bullet = BULLET.exec(line)
  if (bullet && bullet[6].trim() !== '') return true
  const ordered = ORDERED.exec(line)
  if (ordered && ordered[2] === '1' && ordered[5].trim() !== '') return true
  return false
}

function parseBlocks(lines: string[], ctx: Context): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isBlank(line)) {
      i += 1
      continue
    }

    // Fenced code.
    const fence = ctx.ext.fencedCode ? FENCE.exec(line) : null
    if (fence) {
      const marker = fence[1]
      const info = (fence[2] ?? '').trim().replace(/^\{\.?/, '').replace(/\}$/, '')
      const indent = line.length - line.trimStart().length
      const body: string[] = []
      i += 1
      while (i < lines.length) {
        const close = FENCE.exec(lines[i])
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length && !close[2] && lines[i].trim() === close[1]) {
          i += 1
          break
        }
        body.push(indent ? lines[i].replace(new RegExp(`^ {0,${indent}}`), '') : lines[i])
        i += 1
      }
      blocks.push({ t: 'code', text: body.join('\n'), lang: info.split(/\s+/)[0] || undefined })
      continue
    }

    // Display math.
    const math = ctx.ext.math ? DISPLAY_MATH.exec(line) : null
    if (math) {
      let text = math[1]
      if (text.trimEnd().endsWith('$$') && text.trim() !== '$$') {
        blocks.push({ t: 'para', c: [{ t: 'math', text: text.trim().slice(0, -2).trim(), display: true }] })
        i += 1
        continue
      }
      const body: string[] = text ? [text] : []
      i += 1
      while (i < lines.length && !lines[i].trimEnd().endsWith('$$')) {
        body.push(lines[i])
        i += 1
      }
      if (i < lines.length) {
        const last = lines[i].trimEnd().slice(0, -2)
        if (last.trim()) body.push(last)
        i += 1
      }
      blocks.push({ t: 'para', c: [{ t: 'math', text: body.join('\n').trim(), display: true }] })
      continue
    }

    // ATX heading.
    const atx = ATX.exec(line)
    if (atx) {
      const { text, id } = ctx.ext.headerAttributes ? headingAttrs(atx[2] ?? '') : { text: (atx[2] ?? '').trim(), id: '' }
      blocks.push(header(atx[1].length, parseInlines(text, ctx), id))
      i += 1
      continue
    }

    // Horizontal rule (checked before lists: `* * *` is a rule, not a list).
    if (HR.test(line)) {
      blocks.push({ t: 'hr' })
      i += 1
      continue
    }

    // Fenced div.
    const div = ctx.ext.divs ? DIV_START.exec(line) : null
    if (div && !DIV_END.test(line)) {
      const body: string[] = []
      let depth = 1
      i += 1
      while (i < lines.length) {
        if (DIV_START.exec(lines[i]) && !DIV_END.test(lines[i])) depth += 1
        else if (DIV_END.test(lines[i])) {
          depth -= 1
          if (depth === 0) break
        }
        body.push(lines[i])
        i += 1
      }
      i += 1
      blocks.push({ t: 'div', c: parseBlocks(body, ctx), attrs: div[1] ? { classes: [div[1]] } : undefined })
      continue
    }

    // Block quote.
    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && !isBlank(lines[i])) {
        const quoted = QUOTE.exec(lines[i])
        if (quoted) body.push(quoted[2])
        else if (body.length && !interruptsParagraph(lines[i])) body.push(lines[i])
        else break
        i += 1
      }
      // A blank line followed by another `>` line continues the same quote.
      while (i < lines.length && isBlank(lines[i]) && i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        body.push('')
        i += 1
        while (i < lines.length && !isBlank(lines[i])) {
          const quoted = QUOTE.exec(lines[i])
          if (quoted) body.push(quoted[2])
          else if (!interruptsParagraph(lines[i])) body.push(lines[i])
          else break
          i += 1
        }
      }
      blocks.push({ t: 'quote', c: parseBlocks(body, ctx) })
      continue
    }

    // Lists.
    if (BULLET.test(line) || ORDERED.test(line)) {
      const result = parseList(lines, i, ctx)
      blocks.push(result.block)
      i = result.next
      continue
    }

    // Pipe table.
    if (ctx.ext.tables && line.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const result = parseTable(lines, i, ctx)
      if (result) {
        blocks.push(result.block)
        i = result.next
        continue
      }
    }

    // Raw HTML block.
    if (HTML_BLOCK_START.test(line)) {
      const body: string[] = []
      const comment = line.trimStart().startsWith('<!--')
      while (i < lines.length && (comment ? true : !isBlank(lines[i]))) {
        body.push(lines[i])
        i += 1
        if (comment && body[body.length - 1].includes('-->')) break
      }
      blocks.push({ t: 'raw', format: 'html', text: body.join('\n') })
      continue
    }

    // Indented code.
    if (line.startsWith('    ')) {
      const body: string[] = []
      while (i < lines.length && (lines[i].startsWith('    ') || isBlank(lines[i]))) {
        body.push(lines[i].replace(/^ {4}/, ''))
        i += 1
      }
      while (body.length && isBlank(body[body.length - 1])) body.pop()
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }

    // Definition list: a term line followed by `: definition`.
    if (ctx.ext.definitionLists && i + 1 < lines.length && DEF_TERM_NEXT.test(lines[i + 1]) && !line.startsWith(' ')) {
      const result = parseDefinitionList(lines, i, ctx)
      if (result) {
        blocks.push(result.block)
        i = result.next
        continue
      }
    }
    if (ctx.ext.definitionLists && i + 2 < lines.length && isBlank(lines[i + 1]) && DEF_TERM_NEXT.test(lines[i + 2]) && !line.startsWith(' ')) {
      const result = parseDefinitionList(lines, i, ctx)
      if (result) {
        blocks.push(result.block)
        i = result.next
        continue
      }
    }

    // Paragraph, or a setext heading.
    const body: string[] = [line]
    i += 1
    let setext = 0
    while (i < lines.length && !isBlank(lines[i])) {
      if (/^ {0,3}=+\s*$/.test(lines[i])) { setext = 1; i += 1; break }
      if (/^ {0,3}-+\s*$/.test(lines[i])) { setext = 2; i += 1; break }
      if (interruptsParagraph(lines[i])) break
      if (ctx.ext.tables && lines[i].includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) break
      body.push(lines[i])
      i += 1
    }
    const text = body.map((item) => item.replace(/^ +/, '')).join('\n')
    if (setext) {
      const { text: heading, id } = ctx.ext.headerAttributes ? headingAttrs(text) : { text, id: '' }
      blocks.push(header(setext, parseInlines(heading, ctx), id))
    } else {
      blocks.push({ t: 'para', c: parseInlines(text, ctx) })
    }
  }
  return blocks
}

/** `# Heading {#custom-id}` → the heading text and its id. */
function headingAttrs(text: string): { text: string; id: string } {
  const match = /^(.*?)\s*\{#([\w-]+)[^}]*\}\s*$/.exec(text)
  if (match) return { text: match[1], id: match[2] }
  return { text: text.trim(), id: '' }
}

/* ------------------------------------------------------------------- lists */

function parseList(lines: string[], start: number, ctx: Context): { block: Block; next: number } {
  const first = lines[start]
  const ordered = ORDERED.exec(first)
  const bulletMatch = BULLET.exec(first)
  const isOrdered = Boolean(ordered) && !bulletMatch
  const items: string[][] = []
  const tasks: (boolean | null)[] = []
  let loose = false
  let i = start
  let sawBlank = false
  const marker = bulletMatch ? bulletMatch[2] : ordered![3]
  const startNumber = ordered && !bulletMatch ? Number(ordered[2]) : 1

  while (i < lines.length) {
    const line = lines[i]
    const b = BULLET.exec(line)
    const o = ORDERED.exec(line)
    const match = isOrdered ? (o && !b ? o : null) : b
    if (!match) break
    const sameMarker = isOrdered ? (o as RegExpExecArray)[3] === marker : (b as RegExpExecArray)[2] === marker
    if (!sameMarker && items.length) break
    if (sawBlank && items.length) loose = true
    const indent = match[1].length
    const content = isOrdered ? (o as RegExpExecArray)[5] : (b as RegExpExecArray)[6]
    const markerWidth = isOrdered ? (o as RegExpExecArray)[2].length + 1 : 1
    const spacing = isOrdered ? (o as RegExpExecArray)[4] : (b as RegExpExecArray)[3]
    // A marker followed by five or more spaces starts an indented code block
    // inside the item; the content column is then just one space after it.
    const contentIndent = indent + markerWidth + (spacing.length > 4 ? 1 : spacing.length)
    const body: string[] = [content]
    if (!isOrdered && b && b[4] && ctx.ext.taskLists) tasks.push(b[5] !== ' ')
    else tasks.push(null)
    i += 1
    sawBlank = false
    let blankRun = 0
    while (i < lines.length) {
      const next = lines[i]
      if (isBlank(next)) {
        blankRun += 1
        body.push('')
        i += 1
        continue
      }
      const nextIndent = next.length - next.trimStart().length
      if (nextIndent >= contentIndent) {
        if (blankRun > 0 && body.some((item) => item.trim() !== '')) loose = true
        body.push(next.slice(contentIndent))
        blankRun = 0
        i += 1
        continue
      }
      // A new item of this list, or of a parent.
      if (BULLET.test(next) || ORDERED.test(next)) {
        if (blankRun > 0) sawBlank = true
        break
      }
      if (blankRun > 0) {
        sawBlank = true
        break
      }
      // Lazy continuation of the item's paragraph.
      if (interruptsParagraph(next)) break
      body.push(next)
      i += 1
    }
    while (body.length && isBlank(body[body.length - 1])) {
      body.pop()
      sawBlank = true
    }
    items.push(body)
  }
  const parsed = items.map((body) => parseBlocks(body, ctx))
  if (!loose) {
    for (const item of parsed) {
      if (item.length === 1 && item[0].t === 'para') item[0] = { t: 'plain', c: item[0].c }
      else if (item.length > 1 && item[0].t === 'para' && item.slice(1).every((block) => block.t === 'bullet' || block.t === 'ordered')) item[0] = { t: 'plain', c: item[0].c }
    }
  }
  const block: Block = isOrdered
    ? { t: 'ordered', start: startNumber, items: parsed, tight: !loose }
    : { t: 'bullet', items: parsed, tight: !loose, tasks: tasks.some((task) => task !== null) ? tasks : undefined }
  return { block, next: i }
}

/* ------------------------------------------------------------------ tables */

function splitRow(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let current = ''
  let code = false
  for (let k = 0; k < text.length; k += 1) {
    const ch = text[k]
    if (ch === '\\' && text[k + 1] === '|') {
      current += '|'
      k += 1
      continue
    }
    if (ch === '`') code = !code
    if (ch === '|' && !code) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  return cells
}

function parseTable(lines: string[], start: number, ctx: Context): { block: Block; next: number } | null {
  const headerCells = splitRow(lines[start])
  const delims = splitRow(lines[start + 1])
  if (delims.length < 1 || delims.some((cell) => !/^:?-+:?$/.test(cell))) return null
  const aligns: Alignment[] = delims.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    return left && right ? 'center' : right ? 'right' : left ? 'left' : 'default'
  })
  const width = Math.max(headerCells.length, aligns.length)
  while (aligns.length < width) aligns.push('default')
  const rows: Inline[][][] = []
  let i = start + 2
  while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
    const cells = splitRow(lines[i])
    while (cells.length < width) cells.push('')
    rows.push(cells.slice(0, width).map((cell) => parseInlines(cell, ctx)))
    i += 1
  }
  while (headerCells.length < width) headerCells.push('')
  let caption: Inline[] = []
  // Pandoc's `Table: caption` or `: caption` line after the table.
  if (i < lines.length && isBlank(lines[i]) && i + 1 < lines.length && /^\s*(?:Table)?:\s*\S/.test(lines[i + 1])) {
    caption = parseInlines(lines[i + 1].replace(/^\s*(?:Table)?:\s*/, ''), ctx)
    i += 2
  }
  return {
    block: { t: 'table', caption, aligns, header: headerCells.map((cell) => parseInlines(cell, ctx)), rows },
    next: i,
  }
}

/* ---------------------------------------------------------- definition lists */

function parseDefinitionList(lines: string[], start: number, ctx: Context): { block: Block; next: number } | null {
  const items: { term: Inline[]; defs: Block[][] }[] = []
  let i = start
  while (i < lines.length) {
    const termLine = lines[i]
    if (isBlank(termLine) || termLine.startsWith(' ') || DEF_TERM_NEXT.test(termLine)) break
    let j = i + 1
    if (j < lines.length && isBlank(lines[j])) j += 1
    if (j >= lines.length || !DEF_TERM_NEXT.test(lines[j])) break
    const defs: Block[][] = []
    while (j < lines.length && DEF_TERM_NEXT.test(lines[j])) {
      const body: string[] = [lines[j].replace(DEF_TERM_NEXT, '')]
      j += 1
      while (j < lines.length && (lines[j].startsWith('    ') || (isBlank(lines[j]) && j + 1 < lines.length && lines[j + 1].startsWith('    ')))) {
        body.push(lines[j].replace(/^ {1,4}/, ''))
        j += 1
      }
      defs.push(parseBlocks(body, ctx))
      if (j < lines.length && isBlank(lines[j]) && j + 1 < lines.length && DEF_TERM_NEXT.test(lines[j + 1])) j += 1
    }
    items.push({ term: parseInlines(termLine.trim(), ctx), defs })
    i = j
    if (i < lines.length && isBlank(lines[i]) && i + 2 < lines.length && !isBlank(lines[i + 1]) && (DEF_TERM_NEXT.test(lines[i + 2]) || (isBlank(lines[i + 2]) && i + 3 < lines.length && DEF_TERM_NEXT.test(lines[i + 3])))) i += 1
  }
  if (!items.length) return null
  return { block: { t: 'deflist', items }, next: i }
}

/* ----------------------------------------------------------------- inlines */

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\p{P}]/u

function flanking(text: string, start: number, end: number) {
  const before = start > 0 ? text[start - 1] : ' '
  const after = end < text.length ? text[end] : ' '
  const wsBefore = /\s/.test(before)
  const wsAfter = /\s/.test(after)
  const pBefore = PUNCT.test(before)
  const pAfter = PUNCT.test(after)
  const left = !wsAfter && (!pAfter || wsBefore || pBefore)
  const right = !wsBefore && (!pBefore || wsAfter || pAfter)
  return { left, right }
}

export function parseInlines(text: string, ctx: Context = { refs: new Map(), notes: new Map(), ext: MARKDOWN_DIALECTS.markdown }): Inline[] {
  const out: Inline[] = []
  let buffer = ''
  const flush = () => {
    if (!buffer) return
    pushText(out, buffer)
    buffer = ''
  }
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]

    // Escapes.
    if (ch === '\\') {
      if (text[i + 1] === '\n') {
        flush()
        out.push(linebreak)
        i += 2
        continue
      }
      if (i + 1 < n && PUNCT.test(text[i + 1])) {
        buffer += text[i + 1]
        i += 2
        continue
      }
      buffer += ch
      i += 1
      continue
    }

    // Hard break: two or more spaces before a newline.
    if (ch === '\n') {
      const trailing = /( {2,})$/.exec(buffer)
      flush()
      if (trailing) {
        out.pop()
        const last = out[out.length - 1]
        if (last && last.t === 'str') last.text = last.text.replace(/ +$/, '')
        out.push(linebreak)
      } else {
        out.push(softbreak)
      }
      i += 1
      while (i < n && text[i] === ' ') i += 1
      continue
    }

    // Code spans.
    if (ch === '`') {
      let run = 0
      while (text[i + run] === '`') run += 1
      const close = findRun(text, i + run, '`', run)
      if (close >= 0) {
        flush()
        let code = text.slice(i + run, close)
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1)
        out.push({ t: 'code', text: code.replace(/\n/g, ' ') })
        i = close + run
        continue
      }
      buffer += text.slice(i, i + run)
      i += run
      continue
    }

    // Math.
    if (ch === '$' && ctx.ext.math) {
      if (text[i + 1] === '$') {
        const close = text.indexOf('$$', i + 2)
        if (close >= 0) {
          flush()
          out.push({ t: 'math', text: text.slice(i + 2, close).trim(), display: true })
          i = close + 2
          continue
        }
      } else if (i + 1 < n && !/\s/.test(text[i + 1])) {
        const close = findInlineMathClose(text, i + 1)
        if (close >= 0) {
          flush()
          out.push({ t: 'math', text: text.slice(i + 1, close), display: false })
          i = close + 1
          continue
        }
      }
      buffer += ch
      i += 1
      continue
    }

    // Autolinks and raw HTML.
    if (ch === '<') {
      const auto = /^<((?:[a-z][a-z0-9+.-]*:|www\.)[^\s<>]*)>/i.exec(text.slice(i))
      if (auto) {
        flush()
        const url = auto[1]
        out.push({ t: 'link', c: [str(url)], url: /^www\./i.test(url) ? `http://${url}` : url })
        i += auto[0].length
        continue
      }
      const mail = /^<([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>/.exec(text.slice(i))
      if (mail) {
        flush()
        out.push({ t: 'link', c: [str(mail[1])], url: `mailto:${mail[1]}` })
        i += mail[0].length
        continue
      }
      const tag = /^<(?:!--[\s\S]*?-->|\/?[A-Za-z][\w-]*(?:\s+[\w-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>)/.exec(text.slice(i))
      if (tag) {
        flush()
        const inner = tag[0]
        // <br> is a line break, not markup to carry around.
        if (/^<br\s*\/?>$/i.test(inner)) out.push(linebreak)
        else out.push({ t: 'raw', format: 'html', text: inner })
        i += inner.length
        continue
      }
      buffer += ch
      i += 1
      continue
    }

    // Images and links.
    if (ch === '!' && text[i + 1] === '[') {
      const link = parseLink(text, i + 1, ctx)
      if (link) {
        flush()
        out.push({ t: 'image', c: link.inlines, url: link.url, title: link.title })
        i = link.end
        continue
      }
      buffer += ch
      i += 1
      continue
    }
    if (ch === '[') {
      const note = /^\[\^([^\]\s]+)\]/.exec(text.slice(i))
      if (note) {
        const body = ctx.notes.get(note[1].toLowerCase())
        if (body) {
          flush()
          out.push({ t: 'note', c: body })
          i += note[0].length
          continue
        }
      }
      const link = parseLink(text, i, ctx)
      if (link) {
        flush()
        out.push({ t: 'link', c: link.inlines, url: link.url, title: link.title })
        i = link.end
        continue
      }
      buffer += ch
      i += 1
      continue
    }

    // Emphasis, strong, strikethrough, superscript, subscript.
    if (ch === '*' || ch === '_' || ch === '~' || ch === '^') {
      let run = 0
      while (text[i + run] === ch) run += 1
      const { left } = flanking(text, i, i + run)
      const intraword = ch === '_' && i > 0 && /\w/.test(text[i - 1])
      const allowed = ch === '^' ? ctx.ext.supSub : ch === '~' ? (run >= 2 ? ctx.ext.strikeout : ctx.ext.supSub) : true
      if (left && !intraword && allowed) {
        const result = matchDelimiter(text, i, ch, run)
        if (result) {
          flush()
          const inner = parseInlines(text.slice(result.contentStart, result.contentEnd), ctx)
          const kind = ch === '~' ? (result.width >= 2 ? 'strike' : 'sub') : ch === '^' ? 'sup' : result.width >= 2 ? 'strong' : 'emph'
          let node: Inline = { t: kind, c: inner }
          if ((ch === '*' || ch === '_') && result.width === 3) node = { t: 'strong', c: [{ t: 'emph', c: inner }] }
          out.push(node)
          i = result.end
          continue
        }
      }
      buffer += text.slice(i, i + run)
      i += run
      continue
    }

    // Bare URLs (GFM autolink literals).
    if (ctx.ext.autolinkBare && (ch === 'h' || ch === 'w') && (buffer === '' || /[\s(]$/.test(buffer))) {
      const bare = /^(?:https?:\/\/|www\.)[^\s<>]+/i.exec(text.slice(i))
      if (bare) {
        let url = bare[0].replace(/[.,:;!?)\]]+$/, '')
        if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1)
        flush()
        out.push({ t: 'link', c: [str(url)], url: /^www\./i.test(url) ? `http://${url}` : url })
        i += url.length
        continue
      }
    }

    buffer += ch
    i += 1
  }
  flush()
  return trimInlines(out)
}

function findRun(text: string, from: number, ch: string, width: number) {
  let i = from
  while (i < text.length) {
    if (text[i] === ch) {
      let run = 0
      while (text[i + run] === ch) run += 1
      if (run === width) return i
      i += run
      continue
    }
    i += 1
  }
  return -1
}

function findInlineMathClose(text: string, from: number) {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue }
    if (text[i] === '\n' && text[i + 1] === '\n') return -1
    if (text[i] === '$' && !/\s/.test(text[i - 1]) && !/\d/.test(text[i + 1] ?? ' ')) return i
  }
  return -1
}

/** Finds the closer for a delimiter run at `start`; returns the content span and where to resume. */
function matchDelimiter(text: string, start: number, ch: string, run: number) {
  const width = ch === '~' || ch === '^' ? (ch === '~' && run >= 2 ? 2 : 1) : Math.min(run, 3)
  const contentStart = start + width
  let i = contentStart
  let depthCode = false
  let bracket = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') { i += 2; continue }
    if (c === '`') { depthCode = !depthCode; i += 1; continue }
    if (depthCode) { i += 1; continue }
    if (c === '[') bracket += 1
    if (c === ']') bracket = Math.max(0, bracket - 1)
    if (c === ch && bracket === 0) {
      let closeRun = 0
      while (text[i + closeRun] === ch) closeRun += 1
      const { right } = flanking(text, i, i + closeRun)
      const intraword = ch === '_' && /\w/.test(text[i + closeRun] ?? ' ')
      if (right && !intraword && closeRun >= width && i > contentStart) {
        if (ch === '^' || (ch === '~' && width === 1)) {
          // Pandoc superscript/subscript may not contain spaces.
          if (/\s/.test(text.slice(contentStart, i))) return null
        }
        // Prefer a closer of exactly the same width when one exists.
        return { contentStart, contentEnd: i, end: i + width, width }
      }
      i += closeRun
      continue
    }
    if (c === '\n' && text[i + 1] === '\n') return null
    i += 1
  }
  return null
}

function parseLink(text: string, start: number, ctx: Context): { inlines: Inline[]; url: string; title?: string; end: number } | null {
  // The bracketed label, allowing nested brackets.
  let depth = 0
  let i = start
  let labelEnd = -1
  while (i < text.length) {
    const c = text[i]
    if (c === '\\') { i += 2; continue }
    if (c === '`') {
      const close = text.indexOf('`', i + 1)
      if (close > 0) { i = close + 1; continue }
    }
    if (c === '[') depth += 1
    if (c === ']') {
      depth -= 1
      if (depth === 0) { labelEnd = i; break }
    }
    i += 1
  }
  if (labelEnd < 0) return null
  const label = text.slice(start + 1, labelEnd)
  const after = text.slice(labelEnd + 1)

  // Inline form: (url "title")
  const inline = /^\(\s*(?:<([^>]*)>|((?:\([^()\s]*\)|[^\s()])*))(?:\s+(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\(((?:[^()\\]|\\.)*)\)))?\s*\)/.exec(after)
  if (inline) {
    return {
      inlines: parseInlines(label, ctx),
      url: unescapeUrl(inline[1] ?? inline[2] ?? ''),
      title: inline[3] ?? inline[4] ?? inline[5],
      end: labelEnd + 1 + inline[0].length,
    }
  }
  // Reference forms: [text][ref], [text][], [ref]
  const full = /^\[([^\]]*)\]/.exec(after)
  const key = ((full && full[1]) || label).toLowerCase().replace(/\s+/g, ' ')
  const ref = ctx.refs.get(key)
  if (ref) {
    return { inlines: parseInlines(label, ctx), url: ref.url, title: ref.title, end: labelEnd + 1 + (full ? full[0].length : 0) }
  }
  return null
}

function unescapeUrl(url: string) {
  return url.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1')
}

function pushText(out: Inline[], text: string) {
  const parts = text.split(/( +)/)
  for (const part of parts) {
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

function trimInlines(inlines: Inline[]): Inline[] {
  while (inlines.length && (inlines[0].t === 'space' || inlines[0].t === 'softbreak')) inlines.shift()
  while (inlines.length && (inlines[inlines.length - 1].t === 'space' || inlines[inlines.length - 1].t === 'softbreak')) inlines.pop()
  return inlines
}
