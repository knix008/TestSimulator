/**
 * Readers for Djot, Typst, Haddock, txt2tags and Perl POD.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, str, textToInlines } from '../ast'
import { delimited, parseWithRules, type InlineRule } from './inlineRules'
import { readMarkdown } from './markdown'

const blank = (line: string | undefined) => line === undefined || line.trim() === ''

/* -------------------------------------------------------------------- Djot */

/**
 * Djot is Markdown's close relative with the ambiguities removed: `_emph_`,
 * `*strong*`, `{-deleted-}`, `{+inserted+}`, `{=highlighted=}`, `^sup^`,
 * `~sub~`, hard breaks with a trailing backslash, and `: term` definition
 * lists. Its block structure is the same as Pandoc Markdown's, so the text
 * is rewritten into Pandoc Markdown and read by that reader.
 */
export function readDjot(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})\s*(=?\S*)/.exec(line)
    if (fence) {
      out.push(line)
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !fenceMatch[2]) fence = null
      continue
    }
    if (fenceMatch) {
      fence = fenceMatch[1]
      // ```=html raw block → pandoc raw attribute block.
      out.push(fenceMatch[2].startsWith('=') ? line.replace(fenceMatch[2], `{${fenceMatch[2]}}`) : line)
      continue
    }
    // Attribute lines `{#id .class}` on their own are dropped.
    if (/^\s*\{[^}]*\}\s*$/.test(line)) continue
    // Definition list: `: term` then indented definition.
    const term = /^: (.+)$/.exec(line)
    if (term) {
      out.push(term[1])
      let j = i + 1
      if (j < lines.length && blank(lines[j])) j += 1
      const def: string[] = []
      while (j < lines.length && (/^ {2,}/.test(lines[j]) || (blank(lines[j]) && j + 1 < lines.length && /^ {2,}/.test(lines[j + 1])))) {
        def.push(lines[j].replace(/^ {2}/, ''))
        j += 1
      }
      if (def.length) {
        out.push(`:   ${def[0]}`, ...def.slice(1).map((entry) => (entry ? `    ${entry}` : '')))
        i = j - 1
        continue
      }
      continue
    }
    out.push(djotInlineToMarkdown(line))
  }
  return readMarkdown(out.join('\n'), 'markdown')
}

function djotInlineToMarkdown(line: string): string {
  let text = line
  // Protect code spans.
  const codes: string[] = []
  text = text.replace(/`[^`]*`/g, (match) => { codes.push(match); return `\u0000${codes.length - 1}\u0000` })
  text = text.replace(/\{-([^}]+?)-\}/g, '~~$1~~')
  text = text.replace(/\{\+([^}]+?)\+\}/g, '[$1]{.underline}')
  text = text.replace(/\{=([^}]+?)=\}/g, '[$1]{.mark}')
  text = text.replace(/\{\*([^}]+?)\*\}/g, '**$1**')
  text = text.replace(/\{_([^}]+?)_\}/g, '*$1*')
  // *strong* → **strong**, _emph_ → *emph* (order matters: strong first, then emph).
  text = text.replace(/(^|[^*\w])\*(\S(?:[^*]*?\S)?)\*(?![*\w])/g, '$1\u0001\u0001$2\u0001\u0001')
  text = text.replace(/(^|[^_\w])_(\S(?:[^_]*?\S)?)_(?![_\w])/g, '$1*$2*')
  text = text.replace(/\u0001\u0001/g, '**')
  // Math: $`x`$ → $x$
  text = text.replace(/\$\$`([^`]*)`/g, '$$$$$1$$$$').replace(/\$`([^`]*)`/g, '$$$1$$')
  // Hard break: trailing backslash is the same in Pandoc Markdown.
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => codes[Number(index)])
  return text
}

/* ------------------------------------------------------------------- Typst */

const typstRules: InlineRule[] = [
  { pattern: /`([^`\n]+)`/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\$([^$\n]+)\$/y, build: (m) => ({ t: 'math', text: m[1].trim(), display: false }) },
  { pattern: /#link\("([^"]+)"\)\[([^\]]*)\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1] }) },
  { pattern: /#link\("([^"]+)"\)/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /#image\("([^"]+)"(?:,\s*alt:\s*"([^"]*)")?[^)]*\)/y, build: (m) => ({ t: 'image', c: m[2] ? textToInlines(m[2]) : [], url: m[1] }) },
  { pattern: /#footnote\[([^\]]*)\]/y, build: (m, r) => ({ t: 'note', c: [{ t: 'para', c: r(m[1]) }] }) },
  { pattern: /#strike\[([^\]]*)\]/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /#underline\[([^\]]*)\]/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /#super\[([^\]]*)\]/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /#sub\[([^\]]*)\]/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /#smallcaps\[([^\]]*)\]/y, build: (m, r) => ({ t: 'smallcaps', c: r(m[1]) }) },
  { pattern: /#emph\[([^\]]*)\]/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /#strong\[([^\]]*)\]/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /#raw\("([^"]*)"\)/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /#text\([^)]*\)\[([^\]]*)\]/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /#box\[([^\]]*)\]/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /#linebreak\(\)/y, build: () => linebreak },
  { pattern: /\\$/my, build: () => linebreak },
  { pattern: /\\(.)/y, build: (m) => str(m[1]) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  { pattern: /(https?:\/\/[^\s<>[\]()]+[^\s<>[\]().,;:!?])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /~/y, build: () => str(' ') },
  { pattern: /---/y, build: () => str('—') },
  { pattern: /--/y, build: () => str('–') },
]
const typstInl = (text: string) => parseWithRules(text, typstRules)

export function readTypst(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^(\s*)([-+]|\d+\.)\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    if (/^\s*\/\//.test(line)) { i += 1; continue }
    const setDoc = /^#set document\((.*)\)\s*$/.exec(line)
    if (setDoc) {
      const title = /title:\s*(?:"([^"]*)"|\[([^\]]*)\])/.exec(setDoc[1])
      const author = /author:\s*(?:"([^"]*)"|\(([^)]*)\)|\[([^\]]*)\])/.exec(setDoc[1])
      const date = /date:\s*(?:"([^"]*)"|\[([^\]]*)\])/.exec(setDoc[1])
      if (title) meta.title = title[1] ?? title[2]
      if (author) meta.author = (author[1] ?? author[2] ?? author[3] ?? '').replace(/"/g, '')
      if (date) meta.date = date[1] ?? date[2]
      i += 1
      continue
    }
    if (/^#(set|show|import|include|let)\b/.test(line) && !/^#let\s+\w+\s*=\s*\[/.test(line)) {
      // Rules and imports carry no content; a `#set` spanning lines ends at the closing paren.
      let depth = (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length
      i += 1
      while (depth > 0 && i < lines.length) { depth += (lines[i].match(/\(/g) ?? []).length - (lines[i].match(/\)/g) ?? []).length; i += 1 }
      continue
    }
    const heading = /^(=+)\s+(.*)$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, typstInl(heading[2]))); i += 1; continue }
    if (/^#horizontalrule\b|^#line\(/.test(line) || /^-{3,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const fence = /^\s*(`{3,})\s*(\S*)\s*$/.exec(line)
    if (fence) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'code', text: body.join('\n'), lang: fence[2] || undefined })
      continue
    }
    if (/^\$\s*$/.test(line.trim()) || /^\$ /.test(line)) {
      const body: string[] = []
      let rest = line.replace(/^\$\s?/, '')
      if (rest.trim().endsWith('$')) { blocks.push({ t: 'para', c: [{ t: 'math', text: rest.replace(/\$\s*$/, '').trim(), display: true }] }); i += 1; continue }
      if (rest.trim()) body.push(rest)
      i += 1
      while (i < lines.length && !lines[i].trim().endsWith('$')) { body.push(lines[i]); i += 1 }
      if (i < lines.length) { rest = lines[i].replace(/\$\s*$/, ''); if (rest.trim()) body.push(rest); i += 1 }
      blocks.push({ t: 'para', c: [{ t: 'math', text: body.join('\n').trim(), display: true }] })
      continue
    }
    const quote = /^#quote(?:\([^)]*\))?\[(.*)$/.exec(line)
    if (quote) {
      const body = collectBracket(lines, i, quote[1])
      blocks.push({ t: 'quote', c: readTypst(body.text).blocks })
      i = body.next
      continue
    }
    const table = /^#table\(\s*$/.exec(line) ?? /^#table\((.*)$/.exec(line)
    if (table) {
      const body = collectParen(lines, i, table[1] ?? '')
      blocks.push(typstTable(body.text))
      i = body.next
      continue
    }
    // #figure(align(center)[#table(...)], caption: [...]) — the table inside a figure.
    const figure = /^#figure\((.*)$/.exec(line)
    if (figure) {
      const body = collectParen(lines, i, figure[1])
      const inner = body.text
      const at = inner.indexOf('table(')
      if (at >= 0) {
        let depth = 0
        let end = inner.length
        for (let k = at + 5; k < inner.length; k += 1) { if (inner[k] === '(') depth += 1; if (inner[k] === ')') { depth -= 1; if (depth === 0) { end = k; break } } }
        const built = typstTable(inner.slice(at + 6, end))
        const caption = /caption:\s*\[([^\]]*)\]/.exec(inner.slice(end))
        if (caption && built.t === 'table') built.caption = typstInl(caption[1])
        blocks.push(built)
      } else {
        blocks.push(...readTypst(inner).blocks)
      }
      i = body.next
      continue
    }
    const align = /^#align\([^)]*\)\[(.*)$/.exec(line)
    if (align) {
      const body = collectBracket(lines, i, align[1])
      blocks.push({ t: 'div', attrs: { classes: ['center'] }, c: readTypst(body.text).blocks })
      i = body.next
      continue
    }
    if (/^\/\s+.+?:/.test(line)) {
      const items: { term: Inline[]; defs: Block[][] }[] = []
      while (i < lines.length && /^\/\s+.+?:/.test(lines[i])) {
        const m = /^\/\s+(.+?):\s*(.*)$/.exec(lines[i])!
        items.push({ term: typstInl(m[1]), defs: [[{ t: 'plain', c: typstInl(m[2]) }]] })
        i += 1
      }
      blocks.push({ t: 'deflist', items })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: Math.floor(m[1].length / 2), ordered: m[2] !== '-', text: m[3] })
        i += 1
        while (i < lines.length && !blank(lines[i]) && !listMarker(lines[i]) && /^\s{2,}/.test(lines[i])) { items[items.length - 1].text += `\n${lines[i].trim()}`; i += 1 }
      }
      blocks.push(...nestedTypstList(items))
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(=+\s|#(?:set|show|import|include|quote|table|align|horizontalrule|line)\b|```|\$\s|\/\s+.+?:)/.test(lines[i]) && !listMarker(lines[i]) && !/^\s*\/\//.test(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: typstInl(body.join('\n')) })
    else i += 1
  }
  return { meta, blocks }
}

function nestedTypstList(items: { depth: number; ordered: boolean; text: string }[]): Block[] {
  const out: Block[] = []
  let k = 0
  while (k < items.length) {
    const depth = items[k].depth
    const ordered = items[k].ordered
    const listItems: Block[][] = []
    while (k < items.length && items[k].depth >= depth && items[k].ordered === ordered) {
      const item = items[k]
      const blocks: Block[] = [{ t: 'plain', c: typstInl(item.text) }]
      k += 1
      const nested: typeof items = []
      while (k < items.length && items[k].depth > depth) nested.push(items[k++])
      if (nested.length) blocks.push(...nestedTypstList(nested))
      listItems.push(blocks)
    }
    out.push(ordered ? { t: 'ordered', start: 1, items: listItems, tight: true } : { t: 'bullet', items: listItems, tight: true })
  }
  return out
}

function collectBracket(lines: string[], start: number, firstRest: string): { text: string; next: number } {
  let depth = 1
  const body: string[] = []
  let text = firstRest
  let i = start
  for (;;) {
    for (let k = 0; k < text.length; k += 1) {
      if (text[k] === '[') depth += 1
      if (text[k] === ']') { depth -= 1; if (depth === 0) { body.push(text.slice(0, k)); return { text: body.join('\n'), next: i + 1 } } }
    }
    body.push(text)
    i += 1
    if (i >= lines.length) return { text: body.join('\n'), next: i }
    text = lines[i]
  }
}

function collectParen(lines: string[], start: number, firstRest: string): { text: string; next: number } {
  let depth = 1
  const body: string[] = []
  let text = firstRest
  let i = start
  for (;;) {
    for (let k = 0; k < text.length; k += 1) {
      if (text[k] === '(') depth += 1
      if (text[k] === ')') { depth -= 1; if (depth === 0) { body.push(text.slice(0, k)); return { text: body.join('\n'), next: i + 1 } } }
    }
    body.push(text)
    i += 1
    if (i >= lines.length) return { text: body.join('\n'), next: i }
    text = lines[i]
  }
}

/** `#table(columns: 2, table.header([A], [B]), [1], [2], ...)`. */
function typstTable(inner: string): Block {
  const columns = /columns:\s*(\d+)/.exec(inner)
  const columnList = /columns:\s*\(([^)]*)\)/.exec(inner)
  const count = columns ? Number(columns[1]) : columnList ? columnList[1].split(',').filter((part) => part.trim()).length : 0
  const cells: string[] = []
  let headerCells: string[] | null = null
  const headerMatch = /table\.header\(([\s\S]*?)\)\s*,?/.exec(inner)
  const collect = (text: string, into: string[]) => {
    let depth = 0
    let current = ''
    let inCell = false
    for (const ch of text) {
      if (ch === '[') { depth += 1; if (depth === 1) { inCell = true; current = ''; continue } }
      if (ch === ']') { depth -= 1; if (depth === 0 && inCell) { into.push(current); inCell = false; continue } }
      if (inCell) current += ch
    }
  }
  if (headerMatch) { headerCells = []; collect(headerMatch[1], headerCells) }
  collect(headerMatch ? inner.replace(headerMatch[0], '') : inner.replace(/^[^[]*?(?=\[)/, ''), cells)
  const width = count || headerCells?.length || Math.max(1, cells.length)
  const rows: Inline[][][] = []
  for (let k = 0; k < cells.length; k += width) rows.push(cells.slice(k, k + width).map((cell) => typstInl(cell.trim())))
  const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
  return { t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerCells ? pad(headerCells.map((cell) => typstInl(cell.trim()))) : [], rows: rows.map(pad) }
}

/* ----------------------------------------------------------------- Haddock */

const haddockRules: InlineRule[] = [
  { pattern: /@([^@\n]+)@/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /'([A-Za-z_][\w.']*)'/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /"([A-Z][\w.]*)"/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: `#${m[1]}` }) },
  { pattern: /<<([^>\s]+)(?:\s+([^>]*))?>>/y, build: (m) => ({ t: 'image', c: m[2] ? textToInlines(m[2]) : [], url: m[1] }) },
  { pattern: /<([^>\s]+)(?:\s+([^>]*))?>/y, build: (m, r) => ({ t: 'link', c: m[2] ? r(m[2]) : [str(m[1])], url: m[1] }) },
  { pattern: /\[([^\]]+)\]\(([^)\s]+)\)/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: m[2] }) },
  { pattern: /#([^#\n]+)#/y, build: (m) => ({ t: 'span', c: [str(m[1])], attrs: { id: m[1] } }) },
  { pattern: /__([^_\n]+)__/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /\/([^/\n]+)\//y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /\\(.)/y, build: (m) => str(m[1]) },
  { pattern: /&#(\d+);/y, build: (m) => str(String.fromCodePoint(Number(m[1]))) },
]
const haddockInl = (text: string) => parseWithRules(text, haddockRules)

export function readHaddock(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/^\s*-- ?\|?\s?/, '').replace(/^\s*-- ?/, ''))
  const blocks: Block[] = []
  let i = 0
  const bullet = (line: string) => /^\s*[*-]\s+(.*)$/.exec(line)
  const ordered = (line: string) => /^\s*(?:\d+\.|\(\d+\))\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^(=+)\s+(.*)$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, haddockInl(heading[2]))); i += 1; continue }
    if (/^@\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^@\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    if (/^>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^>/.test(lines[i])) { body.push(lines[i].replace(/^>>?>? ?/, '')); i += 1 }
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    if (bullet(line) || ordered(line)) {
      const isOrdered = !bullet(line)
      const items: Block[][] = []
      while (i < lines.length && (isOrdered ? ordered(lines[i]) : bullet(lines[i]))) {
        const m = (isOrdered ? ordered(lines[i]) : bullet(lines[i]))!
        let text = m[1]
        i += 1
        while (i < lines.length && !blank(lines[i]) && !bullet(lines[i]) && !ordered(lines[i]) && /^\s+/.test(lines[i])) { text += `\n${lines[i].trim()}`; i += 1 }
        items.push([{ t: 'plain', c: haddockInl(text) }])
        if (i < lines.length && blank(lines[i]) && i + 1 < lines.length && (isOrdered ? ordered(lines[i + 1]) : bullet(lines[i + 1]))) i += 1
      }
      blocks.push(isOrdered ? { t: 'ordered', start: 1, items, tight: true } : { t: 'bullet', items, tight: true })
      continue
    }
    if (/^\+-/.test(line)) {
      const rows: string[][] = []
      let current: string[] | null = null
      let headerEnd = -1
      while (i < lines.length && /^[+|]/.test(lines[i])) {
        const entry = lines[i].trim()
        if (entry.startsWith('+')) {
          if (current) rows.push(current)
          current = null
          if (entry.includes('=')) headerEnd = rows.length
        } else {
          const cells = entry.slice(1, -1).split('|').map((cell) => cell.trim())
          current = current ? current.map((cell, k) => `${cell} ${cells[k] ?? ''}`.trim()) : cells
        }
        i += 1
      }
      if (current) rows.push(current)
      const width = Math.max(1, ...rows.map((row) => row.length))
      const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(haddockInl) }
      const headerRow = headerEnd > 0 ? rows[0] : null
      blocks.push({ t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: (headerEnd > 0 ? rows.slice(headerEnd) : rows).map(pad) })
      continue
    }
    if (/^\[[^\]]+\]:?\s+/.test(line)) {
      const items: { term: Inline[]; defs: Block[][] }[] = []
      while (i < lines.length && /^\[[^\]]+\]:?\s+/.test(lines[i])) {
        const m = /^\[([^\]]+)\]:?\s+(.*)$/.exec(lines[i])!
        let def = m[2]
        i += 1
        while (i < lines.length && !blank(lines[i]) && /^\s+/.test(lines[i])) { def += `\n${lines[i].trim()}`; i += 1 }
        items.push({ term: haddockInl(m[1]), defs: [[{ t: 'plain', c: haddockInl(def) }]] })
      }
      blocks.push({ t: 'deflist', items })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(=+\s|@\s*$|>|\+-)/.test(lines[i]) && !bullet(lines[i]) && !ordered(lines[i]) && !/^\[[^\]]+\]:?\s+/.test(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: haddockInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* ---------------------------------------------------------------- txt2tags */

const t2tRules: InlineRule[] = [
  { pattern: /``([^`]+)``/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\*\*([^*]+)\*\*/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /\/\/([^/]+)\/\//y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /__([^_]+)__/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /--([^-]+)--/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /''([^']+)''/y, build: (m) => ({ t: 'raw', format: 'html', text: m[1] }) },
  { pattern: /\[([^\]\s]+\.(?:png|jpe?g|gif|svg))\]/iy, build: (m) => ({ t: 'image', c: [], url: m[1] }) },
  { pattern: /\[([^\]]+?)\s+(\S+)\]/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: m[2] }) },
  { pattern: /\[(\S+)\]/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /(https?:\/\/[^\s<>[\]]+[^\s<>[\].,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
]
const t2tInl = (text: string) => parseWithRules(text, t2tRules)

export function readT2t(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  let i = 0
  // The header: up to three lines (title, author, date) before the first blank line, only when the first is non-empty.
  if (lines.length && !blank(lines[0]) && !/^[=+%\-|]/.test(lines[0])) {
    meta.title = lines[0].trim()
    if (lines[1] !== undefined && !blank(lines[1])) meta.author = lines[1].trim()
    if (lines[2] !== undefined && !blank(lines[2])) meta.date = lines[2].trim()
    i = 3
    while (i < lines.length && !blank(lines[i])) i += 1
  }
  const blocks: Block[] = []
  const listMarker = (line: string) => /^(\s*)([-+])\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    if (/^%/.test(line)) { i += 1; continue }
    const heading = /^\s*(={1,5})\s*([^=].*?)\s*\1(?:\[[\w-]+\])?\s*$/.exec(line) ?? /^\s*(\+{1,5})\s*([^+].*?)\s*\1(?:\[[\w-]+\])?\s*$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, t2tInl(heading[2]))); i += 1; continue }
    if (/^\s*-{20,}\s*$/.test(line) || /^\s*={20,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    if (/^```\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    if (/^``` /.test(line)) { blocks.push({ t: 'code', text: line.slice(4) }); i += 1; continue }
    if (/^"""\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^"""\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'raw', format: 'html', text: body.join('\n') })
      continue
    }
    if (/^'''\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^'''\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'raw', format: 'html', text: body.join('\n') })
      continue
    }
    if (/^\s*\|\|?/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const entry = lines[i].trim()
        const isHead = entry.startsWith('||')
        const cells = entry.replace(/^\|\|?\s*/, '').replace(/\s*\|$/, '').split(/\s+\|\s+/).map((cell) => cell.trim())
        if (isHead && !headerRow && !rows.length) headerRow = cells
        else rows.push(cells)
        i += 1
      }
      const width = Math.max(headerRow?.length ?? 0, ...rows.map((row) => row.length), 1)
      const pad = (row: string[]) => { while (row.length < width) row.push(''); return row.map(t2tInl) }
      blocks.push({ t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: rows.map(pad) })
      continue
    }
    if (/^:\s+/.test(line) || /^:\S/.test(line)) {
      const items: { term: Inline[]; defs: Block[][] }[] = []
      while (i < lines.length && /^:/.test(lines[i])) {
        const term = lines[i].replace(/^:\s*/, '')
        i += 1
        const def: string[] = []
        while (i < lines.length && /^\s+\S/.test(lines[i])) { def.push(lines[i].trim()); i += 1 }
        items.push({ term: t2tInl(term), defs: [[{ t: 'plain', c: t2tInl(def.join('\n')) }]] })
      }
      blocks.push({ t: 'deflist', items })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: Math.floor(m[1].length / 2), ordered: m[2] === '+', text: m[3] })
        i += 1
      }
      blocks.push(...nestedTypstList(items).map((block) => retag(block, t2tInl)))
      continue
    }
    if (/^\s+\S/.test(line)) {
      const body: string[] = []
      while (i < lines.length && /^\s+\S/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i].trim()); i += 1 }
      blocks.push({ t: 'quote', c: [{ t: 'para', c: t2tInl(body.join('\n')) }] })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(%|\s*[=+]{1,5}\s*[^=+]|```|"""|'''|\s*\||:|\s*-{20,}\s*$)/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: t2tInl(body.join('\n')) })
    else i += 1
  }
  return { meta, blocks }
}

/** The nested-list builder parses item text with the Typst rules; other readers re-parse with their own. */
function retag(block: Block, inl: (text: string) => Inline[]): Block {
  if (block.t !== 'bullet' && block.t !== 'ordered') return block
  const items = block.items.map((item) => item.map((inner) => (inner.t === 'plain' ? { t: 'plain' as const, c: inl(inner.c.map((x) => (x.t === 'str' ? x.text : x.t === 'space' ? ' ' : x.t === 'softbreak' ? '\n' : x.t === 'code' ? `\`${x.text}\`` : '')).join('')) } : retag(inner, inl))))
  return { ...block, items }
}

/* --------------------------------------------------------------------- POD */

const POD_ENTITIES: Record<string, string> = { lt: '<', gt: '>', verbar: '|', sol: '/', amp: '&', quot: '"', apos: "'" }

function podInlines(text: string): Inline[] {
  const rules: InlineRule[] = [
    { pattern: /([BICFLSXZE])<<+\s([\s\S]*?)\s>>+/y, build: (m, r) => podCode(m[1], m[2], r) },
    { pattern: /([BICFLSXZE])<([^<>]*(?:<[^<>]*>[^<>]*)*)>/y, build: (m, r) => podCode(m[1], m[2], r) },
    { pattern: /(https?:\/\/[^\s<>]+[^\s<>.,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  ]
  return parseWithRules(text, rules)
}

function podCode(code: string, inner: string, recurse: (text: string) => Inline[]): Inline | Inline[] | null {
  switch (code) {
    case 'B': return { t: 'strong', c: recurse(inner) }
    case 'I': return { t: 'emph', c: recurse(inner) }
    case 'C': return { t: 'code', text: inner }
    case 'F': return { t: 'emph', c: [str(inner)] }
    case 'S': return recurse(inner.replace(/ /g, ' '))
    case 'X': case 'Z': return []
    case 'E': return str(POD_ENTITIES[inner] ?? (/^\d+$/.test(inner) ? String.fromCodePoint(Number(inner)) : /^0x/.test(inner) ? String.fromCodePoint(Number.parseInt(inner, 16)) : inner))
    case 'L': {
      const [textPart, target] = inner.includes('|') ? inner.split('|', 2) : [null, inner]
      const [name, section] = target.split('/')
      const url = /^\w+:\/\//.test(target) ? target : section ? `#${section.replace(/"/g, '')}` : name
      return { t: 'link', c: textPart ? recurse(textPart) : [str(target)], url }
    }
    default: return null
  }
}

export function readPod(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const blocks: Block[] = []
  const stack: { blocks: Block[]; items: Block[][]; kind: 'bullet' | 'ordered' | 'deflist' | null; terms: Inline[][] }[] = [{ blocks, items: [], kind: null, terms: [] }]
  const current = () => stack[stack.length - 1]
  const push = (block: Block) => {
    const frame = current()
    if (frame.items.length) frame.items[frame.items.length - 1].push(block)
    else frame.blocks.push(block)
  }
  let inPod = true
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^=cut\b/.test(line)) { inPod = false; i += 1; continue }
    if (/^=pod\b/.test(line)) { inPod = true; i += 1; continue }
    if (!inPod) { if (/^=\w+/.test(line)) inPod = true; else { i += 1; continue } }
    if (blank(line)) { i += 1; continue }
    const command = /^=(\w+)\s*(.*)$/.exec(line)
    if (command) {
      const [, name, rest] = command
      i += 1
      if (/^head[1-6]$/.test(name)) { push(header(Number(name.slice(4)), podInlines(rest.trim()))); continue }
      if (name === 'over') { stack.push({ blocks: [], items: [], kind: null, terms: [] }); continue }
      if (name === 'item') {
        const frame = current()
        const text = rest.trim()
        if (/^\*\s*$/.test(text) || text === '') { frame.kind = frame.kind ?? 'bullet'; frame.items.push([]) }
        else if (/^\d+\.?\s*$/.test(text)) { frame.kind = frame.kind ?? 'ordered'; frame.items.push([]) }
        else if (/^\*\s+/.test(text)) { frame.kind = frame.kind ?? 'bullet'; frame.items.push([{ t: 'plain', c: podInlines(text.replace(/^\*\s+/, '')) }]) }
        else if (/^\d+\.?\s+/.test(text)) { frame.kind = frame.kind ?? 'ordered'; frame.items.push([{ t: 'plain', c: podInlines(text.replace(/^\d+\.?\s+/, '')) }]) }
        else { frame.kind = frame.kind ?? 'deflist'; frame.terms.push(podInlines(text)); frame.items.push([]) }
        continue
      }
      if (name === 'back') {
        const frame = stack.pop()
        if (!frame) continue
        const items = frame.items.map((item) => (item.length === 1 && item[0].t === 'para' ? [{ t: 'plain', c: item[0].c } as Block] : item))
        if (frame.kind === 'deflist') push({ t: 'deflist', items: frame.terms.map((term, index) => ({ term, defs: [items[index] ?? []] })) })
        else if (frame.kind === 'ordered') push({ t: 'ordered', start: 1, items, tight: items.every((item) => item.length <= 1) })
        else if (frame.kind === 'bullet') push({ t: 'bullet', items, tight: items.every((item) => item.length <= 1) })
        else push({ t: 'quote', c: frame.blocks })
        continue
      }
      if (name === 'begin') {
        const body: string[] = []
        while (i < lines.length && !/^=end\b/.test(lines[i])) { body.push(lines[i]); i += 1 }
        i += 1
        if (/^html/.test(rest)) push({ t: 'raw', format: 'html', text: body.join('\n').trim() })
        else if (/^(?:text|code|verbatim)/.test(rest)) push({ t: 'code', text: body.join('\n').trim() })
        continue
      }
      if (name === 'for') { if (/^html\s/.test(rest)) push({ t: 'raw', format: 'html', text: rest.replace(/^html\s+/, '') }); continue }
      if (name === 'encoding') continue
      continue
    }
    if (/^\s/.test(line)) {
      const body: string[] = []
      while (i < lines.length && (/^\s/.test(lines[i]) || (blank(lines[i]) && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])))) { body.push(lines[i]); i += 1 }
      const indent = Math.min(...body.filter((entry) => entry.trim()).map((entry) => entry.length - entry.trimStart().length))
      push({ t: 'code', text: body.map((entry) => entry.slice(indent)).join('\n').replace(/\n+$/, '') })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^=\w+/.test(lines[i]) && !/^\s/.test(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) push({ t: 'para', c: podInlines(body.join('\n')) })
  }
  while (stack.length > 1) { const frame = stack.pop()!; current().blocks.push(...frame.blocks) }
  const first = blocks.find((block) => block.t === 'header')
  if (first && first.t === 'header' && /^name$/i.test(first.c.map((x) => (x.t === 'str' ? x.text : '')).join(''))) {
    const next = blocks[blocks.indexOf(first) + 1]
    if (next && next.t === 'para') meta.title = next.c.map((x) => (x.t === 'str' ? x.text : x.t === 'space' ? ' ' : '')).join('').split(' - ')[0]
  }
  return { meta, blocks }
}
