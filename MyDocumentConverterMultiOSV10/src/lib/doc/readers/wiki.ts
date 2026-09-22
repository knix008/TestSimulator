/**
 * Readers for the wiki dialects: DokuWiki, TikiWiki, TWiki, Creole,
 * Vimwiki, Jira and Emacs Muse. Each is a line scanner over the rule-driven
 * inline parser; the dialects differ in their markers far more than in
 * their structure, so most of the work is the rule tables.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, str, textToInlines } from '../ast'
import { delimited, parseWithRules, type InlineRule } from './inlineRules'

const blank = (line: string | undefined) => line === undefined || line.trim() === ''

/** Builds nested lists from lines whose depth is given by `depthOf`. */
function nestedList(items: { depth: number; ordered: boolean; text: string; task?: boolean | null }[], inl: (text: string) => Inline[]): Block[] {
  const out: Block[] = []
  let k = 0
  while (k < items.length) {
    const depth = items[k].depth
    const ordered = items[k].ordered
    const listItems: Block[][] = []
    const tasks: (boolean | null)[] = []
    while (k < items.length && items[k].depth >= depth && items[k].ordered === ordered) {
      const item = items[k]
      if (item.depth > depth) {
        // Nested content without a parent item: attach to the previous item.
        const nested: typeof items = []
        while (k < items.length && items[k].depth > depth) nested.push(items[k++])
        if (listItems.length) listItems[listItems.length - 1].push(...nestedList(nested, inl))
        else listItems.push(nestedList(nested, inl))
        continue
      }
      const blocks: Block[] = [{ t: 'plain', c: inl(item.text) }]
      tasks.push(item.task === undefined ? null : item.task)
      k += 1
      const nested: typeof items = []
      while (k < items.length && items[k].depth > depth) nested.push(items[k++])
      if (nested.length) blocks.push(...nestedList(nested, inl))
      listItems.push(blocks)
    }
    out.push(ordered ? { t: 'ordered', start: 1, items: listItems, tight: true } : { t: 'bullet', items: listItems, tight: true, tasks: tasks.some((task) => task !== null) ? tasks : undefined })
  }
  return out
}

function simpleTable(rows: string[][], headerRow: string[] | null, inl: (text: string) => Inline[], aligns?: Alignment[]): Block {
  const width = Math.max(headerRow?.length ?? 0, ...rows.map((row) => row.length), 1)
  const pad = (row: string[]) => { const copy = [...row]; while (copy.length < width) copy.push(''); return copy.map((cell) => inl(cell.trim())) }
  return { t: 'table', caption: [], aligns: aligns ?? Array.from({ length: width }, () => 'default' as Alignment), header: headerRow ? pad(headerRow) : [], rows: rows.map(pad) }
}

const urlRule: InlineRule = { pattern: /(https?:\/\/[^\s<>[\]|]+[^\s<>[\]|.,;:!?)])/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) }

/* ---------------------------------------------------------------- DokuWiki */

const dokuRules: InlineRule[] = [
  { pattern: /<nowiki>([\s\S]*?)<\/nowiki>/y, build: (m) => str(m[1]) },
  { pattern: /%%([\s\S]*?)%%/y, build: (m) => str(m[1]) },
  { pattern: /''([\s\S]*?)''/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /<code(?: [\w-]+)?>([\s\S]*?)<\/code>/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /<del>([\s\S]*?)<\/del>/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /<sup>([\s\S]*?)<\/sup>/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /<sub>([\s\S]*?)<\/sub>/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /\*\*([\s\S]+?)\*\*/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /\/\/([\s\S]+?)\/\//y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /__([\s\S]+?)__/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /\[\[([^\]|]+)\|([^\]]*)\]\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1].trim() }) },
  { pattern: /\[\[([^\]|]+)\]\]/y, build: (m) => ({ t: 'link', c: [str(m[1].trim())], url: m[1].trim() }) },
  { pattern: /\{\{([^}|]+?)(?:\?\d+(?:x\d+)?)?\|([^}]*)\}\}/y, build: (m) => ({ t: 'image', c: textToInlines(m[2]), url: m[1].trim() }) },
  { pattern: /\{\{([^}|]+?)(?:\?\d+(?:x\d+)?)?\}\}/y, build: (m) => ({ t: 'image', c: [], url: m[1].trim() }) },
  { pattern: /\(\(([\s\S]+?)\)\)/y, build: (m, r) => ({ t: 'note', c: [{ t: 'para', c: r(m[1]) }] }) },
  { pattern: /\\\\(?=\s|$)/y, build: () => ({ t: 'linebreak' }) },
  urlRule,
]
const dokuInl = (text: string) => parseWithRules(text, dokuRules)

export function readDokuWiki(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^( {2,})([*-])\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^(={1,6})\s*(.*?)\s*\1\s*$/.exec(line)
    if (heading) { blocks.push(header(7 - heading[1].length, dokuInl(heading[2]))); i += 1; continue }
    if (/^-{4,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const code = /^\s*<(code|file)(?:\s+([\w-]+))?[^>]*>(.*)$/.exec(line)
    if (code) {
      const body: string[] = []
      const tag = code[1]
      const close = new RegExp(`</${tag}>`)
      let rest = code[3]
      i += 1
      if (close.test(rest)) body.push(rest.replace(close, ''))
      else {
        if (rest.trim()) body.push(rest)
        while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i += 1 }
        if (i < lines.length) { rest = lines[i].replace(close, ''); if (rest.trim()) body.push(rest); i += 1 }
      }
      blocks.push({ t: 'code', text: body.join('\n'), lang: code[2] || undefined })
      continue
    }
    if (line.startsWith('>')) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) { body.push(lines[i].replace(/^>+\s?/, '')); i += 1 }
      blocks.push({ t: 'quote', c: readDokuWiki(body.join('\n')).blocks })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: Math.floor(m[1].length / 2), ordered: m[2] === '-', text: m[3] })
        i += 1
      }
      blocks.push(...nestedList(items, dokuInl))
      continue
    }
    if (/^[|^]/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^[|^]/.test(lines[i])) {
        const entry = lines[i].trim()
        const cells = entry.slice(1, entry.length - (/[|^]$/.test(entry) ? 1 : 0)).split(/[|^]/)
        if (entry.startsWith('^') && !headerRow && !rows.length) headerRow = cells
        else rows.push(cells)
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, dokuInl))
      continue
    }
    if (line.startsWith('  ') && !listMarker(line)) {
      const body: string[] = []
      while (i < lines.length && lines[i].startsWith('  ') && !listMarker(lines[i])) { body.push(lines[i].slice(2)); i += 1 }
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(={1,6}\s|[|^]|>|-{4,}\s*$|\s*<(?:code|file))/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: dokuInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* ---------------------------------------------------------------- TikiWiki */

const tikiRules: InlineRule[] = [
  { pattern: /~np~([\s\S]*?)~\/np~/y, build: (m) => str(m[1]) },
  { pattern: /-\+([\s\S]+?)\+-/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /__([\s\S]+?)__/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /''([\s\S]+?)''/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /===([\s\S]+?)===/y, build: (m, r) => ({ t: 'underline', c: r(m[1]) }) },
  { pattern: /--([\s\S]+?)--/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /\{SUP\(\)\}([\s\S]*?)\{SUP\}/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /\{SUB\(\)\}([\s\S]*?)\{SUB\}/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /\{img\s+[^}]*src="?([^"\s}]+)"?[^}]*\}/y, build: (m) => ({ t: 'image', c: [], url: m[1] }) },
  { pattern: /\[([^\]|]+)\|([^\]]*)\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1] }) },
  { pattern: /\[([^\]|]+)\]/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /\(\(([^)|]+)\|([^)]*)\)\)/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1] }) },
  { pattern: /\(\(([^)]+)\)\)/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /%%%/y, build: () => ({ t: 'linebreak' }) },
  urlRule,
]
const tikiInl = (text: string) => parseWithRules(text, tikiRules)

export function readTikiWiki(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^([*#]+)\s*(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^(!{1,6})[+-]?\s*(.*)$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, tikiInl(heading[2]))); i += 1; continue }
    if (/^-{3,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const code = /^\{CODE(?:\(([^)]*)\))?\}(.*)$/.exec(line)
    if (code) {
      const lang = /colors=([\w+#-]+)/.exec(code[1] ?? '')?.[1]
      const body: string[] = []
      let rest = code[2]
      i += 1
      if (rest.includes('{CODE}')) body.push(rest.replace('{CODE}', ''))
      else {
        if (rest.trim()) body.push(rest)
        while (i < lines.length && !lines[i].includes('{CODE}')) { body.push(lines[i]); i += 1 }
        if (i < lines.length) { rest = lines[i].replace('{CODE}', ''); if (rest.trim()) body.push(rest); i += 1 }
      }
      blocks.push({ t: 'code', text: body.join('\n'), lang })
      continue
    }
    if (line.startsWith('^')) {
      const body: string[] = []
      while (i < lines.length && !lines[i].endsWith('^')) { body.push(lines[i].replace(/^\^/, '')); i += 1 }
      if (i < lines.length) { body.push(lines[i].replace(/^\^|\^$/g, '')); i += 1 }
      blocks.push({ t: 'quote', c: readTikiWiki(body.join('\n')).blocks })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: m[1].length, ordered: m[1][m[1].length - 1] === '#', text: m[2] })
        i += 1
      }
      blocks.push(...nestedList(items, tikiInl))
      continue
    }
    if (line.startsWith('||')) {
      const body: string[] = []
      while (i < lines.length) {
        body.push(lines[i].replace(/^\|\||\|\|$/g, ''))
        const done = lines[i].endsWith('||')
        i += 1
        if (done) break
      }
      const rows = body.join('\n').split('\n').filter((row) => row.trim()).map((row) => row.split('|'))
      blocks.push(simpleTable(rows.slice(1), rows[0] ?? null, tikiInl))
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(!|-{3,}\s*$|\{CODE|\^|\|\|)/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: tikiInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* ------------------------------------------------------------------- TWiki */

const twikiRules: InlineRule[] = [
  { pattern: /<nop>/y, build: () => str('') },
  { pattern: /<verbatim>([\s\S]*?)<\/verbatim>/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /==([^=\n]+?)==/y, build: (m) => ({ t: 'strong', c: [{ t: 'code', text: m[1] }] }) },
  { pattern: /=([^=\n]+?)=/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /__([^_\n]+?)__/y, build: (m, r) => ({ t: 'strong', c: [{ t: 'emph', c: r(m[1]) }] }) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  { pattern: /<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /<(?:i|em)>([\s\S]*?)<\/(?:i|em)>/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /<(?:s|del|strike)>([\s\S]*?)<\/(?:s|del|strike)>/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /<sup>([\s\S]*?)<\/sup>/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /<sub>([\s\S]*?)<\/sub>/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /<br\s*\/?>/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /\[\[([^\]]+)\]\[([^\]]*)\]\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1] }) },
  { pattern: /\[\[([^\]]+)\]\]/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /%IMAGE\{"?([^"}]+)"?[^}]*\}%/y, build: (m) => ({ t: 'image', c: [], url: m[1] }) },
  { pattern: /%[A-Z]+(?:\{[^}]*\})?%/y, build: () => str('') },
  urlRule,
]
const twikiInl = (text: string) => parseWithRules(text, twikiRules)

export function readTWiki(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^( {3,}|\t+)(\*|\d+\.?|[aAiI]\.)\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^---(\++)(?:!!)?\s*(.*)$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, twikiInl(heading[2]))); i += 1; continue }
    if (/^-{3,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const verbatim = /^\s*<(verbatim|literal|pre)>(.*)$/.exec(line)
    if (verbatim) {
      const tag = verbatim[1]
      const close = new RegExp(`</${tag}>`)
      const body: string[] = []
      let rest = verbatim[2]
      i += 1
      if (close.test(rest)) body.push(rest.replace(close, ''))
      else {
        if (rest.trim()) body.push(rest)
        while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i += 1 }
        if (i < lines.length) { rest = lines[i].replace(close, ''); if (rest.trim()) body.push(rest); i += 1 }
      }
      blocks.push(tag === 'literal' ? { t: 'raw', format: 'html', text: body.join('\n') } : { t: 'code', text: body.join('\n') })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        const depth = m[1].includes('\t') ? m[1].length : Math.floor(m[1].length / 3)
        items.push({ depth, ordered: m[2] !== '*', text: m[3] })
        i += 1
      }
      blocks.push(...nestedList(items, twikiInl))
      continue
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const entry = lines[i].trim().replace(/^\||\|$/g, '')
        const cells = entry.split('|')
        if (!rows.length && !headerRow && cells.every((cell) => /^\s*\*.*\*\s*$/.test(cell))) headerRow = cells.map((cell) => cell.trim().replace(/^\*|\*$/g, ''))
        else rows.push(cells)
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, twikiInl))
      continue
    }
    if (line.startsWith('   ') && !listMarker(line) && /^ {3}\S/.test(line) && lines[i - 1] !== undefined && blank(lines[i - 1])) {
      // Indented text is a definition/quote in TWiki; treated as a quote.
      const body: string[] = []
      while (i < lines.length && /^ {3,}\S/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i].trim()); i += 1 }
      blocks.push({ t: 'quote', c: [{ t: 'para', c: twikiInl(body.join('\n')) }] })
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(---\+|-{3,}\s*$|\s*\||\s*<(?:verbatim|literal|pre)>)/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: twikiInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* ------------------------------------------------------------------ Creole */

const creoleRules: InlineRule[] = [
  { pattern: /\{\{\{([\s\S]*?)\}\}\}/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /~(\S)/y, build: (m) => str(m[1]) },
  { pattern: /\*\*([\s\S]+?)\*\*/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  { pattern: /\/\/([\s\S]+?)\/\//y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  { pattern: /\[\[([^\]|]+)\|([^\]]*)\]\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1].trim() }) },
  { pattern: /\[\[([^\]|]+)\]\]/y, build: (m) => ({ t: 'link', c: [str(m[1].trim())], url: m[1].trim() }) },
  { pattern: /\{\{([^}|]+)\|([^}]*)\}\}/y, build: (m) => ({ t: 'image', c: textToInlines(m[2]), url: m[1].trim() }) },
  { pattern: /\{\{([^}|]+)\}\}/y, build: (m) => ({ t: 'image', c: [], url: m[1].trim() }) },
  { pattern: /\\\\/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /<<[^>]*>>/y, build: () => str('') },
  urlRule,
]
const creoleInl = (text: string) => parseWithRules(text, creoleRules)

export function readCreole(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^\s*([*#]+)\s*(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^\s*(={1,6})\s*(.*?)\s*=*\s*$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, creoleInl(heading[2]))); i += 1; continue }
    if (/^\s*-{4,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    if (/^\{\{\{\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^\}\}\}\s*$/.test(lines[i])) { body.push(lines[i].replace(/^ (\}\}\})/, '$1')); i += 1 }
      i += 1
      blocks.push({ t: 'code', text: body.join('\n') })
      continue
    }
    if (listMarker(line) && !/^\s*\*\*[^*]/.test(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i]) && !(lines[i].trim().startsWith('**') && items.length === 0)) {
        const m = listMarker(lines[i])!
        items.push({ depth: m[1].length, ordered: m[1][m[1].length - 1] === '#', text: m[2] })
        i += 1
      }
      blocks.push(...nestedList(items, creoleInl))
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && lines[i].startsWith('|')) {
        const entry = lines[i].trim().replace(/^\||\|$/g, '')
        const cells = entry.split('|')
        if (!rows.length && !headerRow && cells.every((cell) => cell.startsWith('='))) headerRow = cells.map((cell) => cell.slice(1))
        else rows.push(cells)
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, creoleInl))
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^\s*(=|-{4,}\s*$|\{\{\{\s*$|\|)/.test(lines[i]) && !(listMarker(lines[i]) && !lines[i].trim().startsWith('**'))) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: creoleInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* ----------------------------------------------------------------- Vimwiki */

const vimwikiRules: InlineRule[] = [
  { pattern: /`([^`\n]+)`/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\$([^$\n]+)\$/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /~~([\s\S]+?)~~/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /\^([^\s^]+)\^/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /,,([^,\n]+),,/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  { pattern: /\[\[([^\]|]+)\|([^\]]*)\]\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1].trim() }) },
  { pattern: /\[\[([^\]|]+)\]\]/y, build: (m) => ({ t: 'link', c: [str(m[1].trim())], url: m[1].trim() }) },
  { pattern: /\{\{([^}|]+)\|?([^}]*)\}\}/y, build: (m) => ({ t: 'image', c: textToInlines(m[2]), url: m[1].trim() }) },
  { pattern: /\[(\S+)\s+([^\]]+)\]/y, build: (m, r) => ({ t: 'link', c: r(m[2]), url: m[1] }) },
  urlRule,
]
const vimwikiInl = (text: string) => parseWithRules(text, vimwikiRules)

export function readVimwiki(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^(\s*)([-*#]|\d+[.)]|[a-zA-Z][.)]|[ivx]+\))\s+(?:\[([ .oOX])\]\s+)?(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const directive = /^%(title|date|template)\s+(.*)$/.exec(line)
    if (directive) { meta[directive[1]] = directive[2].trim(); i += 1; continue }
    if (line.startsWith('%%')) { i += 1; continue }
    const heading = /^\s*(={1,6})\s*(.*?)\s*\1\s*$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, vimwikiInl(heading[2]))); i += 1; continue }
    if (/^-{4,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const code = /^\s*\{\{\{\s*(\S*)\s*$/.exec(line)
    if (code) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^\s*\}\}\}\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      const lang = code[1].replace(/^class="?|"$/g, '').replace(/^\./, '')
      blocks.push({ t: 'code', text: body.join('\n'), lang: lang || undefined })
      continue
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      const body: string[] = []
      i += 1
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) { body.push(lines[i]); i += 1 }
      i += 1
      blocks.push({ t: 'para', c: [{ t: 'math', text: body.join('\n'), display: true }] })
      continue
    }
    if (/^ {4,}\S/.test(line) && !listMarker(line)) {
      const body: string[] = []
      while (i < lines.length && /^ {4,}\S/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i].trim()); i += 1 }
      blocks.push({ t: 'quote', c: [{ t: 'para', c: vimwikiInl(body.join('\n')) }] })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string; task?: boolean | null }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: Math.floor(m[1].length / 2), ordered: !/^[-*]$/.test(m[2]), text: m[4], task: m[3] === undefined ? null : m[3] === 'X' })
        i += 1
      }
      blocks.push(...nestedList(items, vimwikiInl))
      continue
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const entry = lines[i].trim().replace(/^\||\|$/g, '')
        if (/^[-:| ]+$/.test(entry) && entry.includes('-')) { if (rows.length === 1 && !headerRow) headerRow = rows.pop()! }
        else rows.push(entry.split('|'))
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, vimwikiInl))
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^\s*(=|-{4,}\s*$|\{\{\{|\||%|\$\$)/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: vimwikiInl(body.join('\n')) })
    else i += 1
  }
  return { meta, blocks }
}

/* -------------------------------------------------------------------- Jira */

const jiraRules: InlineRule[] = [
  { pattern: /\{\{([^}]+)\}\}/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\{noformat\}([\s\S]*?)\{noformat\}/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\{color(?::[^}]*)?\}([\s\S]*?)\{color\}/y, build: (m, r) => ({ t: 'span', c: r(m[1]) }) },
  { pattern: /\\\\/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /\[([^\]|]+)\|([^\]|]+)(?:\|[^\]]*)?\]/y, build: (m, r) => ({ t: 'link', c: r(m[1]), url: m[2] }) },
  { pattern: /\[(?:mailto:)?([^\]]+@[^\]]+)\]/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: `mailto:${m[1]}` }) },
  { pattern: /\[([^\]|]+)\]/y, build: (m) => ({ t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /!([^!\s|]+)(?:\|[^!]*)?!/y, build: (m) => ({ t: 'image', c: [], url: m[1] }) },
  { pattern: /\?\?([\s\S]+?)\?\?/y, build: (m, r) => ({ t: 'emph', c: r(m[1]) }) },
  delimited('*', (c) => ({ t: 'strong', c })),
  delimited('_', (c) => ({ t: 'emph', c })),
  delimited('-', (c) => ({ t: 'strike', c }), { allowSpace: false }),
  delimited('+', (c) => ({ t: 'underline', c }), { allowSpace: false }),
  delimited('^', (c) => ({ t: 'sup', c }), { allowSpace: false }),
  delimited('~', (c) => ({ t: 'sub', c }), { allowSpace: false }),
  urlRule,
]
const jiraInl = (text: string) => parseWithRules(text, jiraRules)

export function readJira(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^([*#-]+)\s+(.*)$/.exec(line)
  while (i < lines.length) {
    const line = lines[i]
    if (blank(line)) { i += 1; continue }
    const heading = /^h([1-6])\.\s+(.*)$/.exec(line)
    if (heading) { blocks.push(header(Number(heading[1]), jiraInl(heading[2]))); i += 1; continue }
    if (/^-{4,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const block = /^\{(code|noformat|quote|panel)(?::([^}]*))?\}(.*)$/.exec(line)
    if (block) {
      const kind = block[1]
      const close = `{${kind}}`
      const body: string[] = []
      let rest = block[3]
      i += 1
      if (rest.includes(close)) body.push(rest.slice(0, rest.indexOf(close)))
      else {
        if (rest.trim()) body.push(rest)
        while (i < lines.length && !lines[i].includes(close)) { body.push(lines[i]); i += 1 }
        if (i < lines.length) { rest = lines[i].slice(0, lines[i].indexOf(close)); if (rest.trim()) body.push(rest); i += 1 }
      }
      if (kind === 'code' || kind === 'noformat') {
        const lang = kind === 'code' ? (block[2] ?? '').split('|').map((part) => part.trim()).find((part) => part && !part.includes('='))?.replace(/^lang=/, '') : undefined
        blocks.push({ t: 'code', text: body.join('\n').replace(/^\n|\n$/g, ''), lang: lang || undefined })
      } else if (kind === 'quote') blocks.push({ t: 'quote', c: readJira(body.join('\n')).blocks })
      else blocks.push({ t: 'div', attrs: { classes: ['panel'] }, c: readJira(body.join('\n')).blocks })
      continue
    }
    if (line.startsWith('bq. ')) {
      const body: string[] = [line.slice(4)]
      i += 1
      while (i < lines.length && !blank(lines[i])) { body.push(lines[i]); i += 1 }
      blocks.push({ t: 'quote', c: [{ t: 'para', c: jiraInl(body.join('\n')) }] })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < lines.length && listMarker(lines[i])) {
        const m = listMarker(lines[i])!
        items.push({ depth: m[1].length, ordered: m[1][m[1].length - 1] === '#', text: m[2] })
        i += 1
      }
      blocks.push(...nestedList(items, jiraInl))
      continue
    }
    if (/^\|/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < lines.length && /^\|/.test(lines[i])) {
        const entry = lines[i].trim()
        if (entry.startsWith('||')) headerRow = entry.replace(/^\|\||\|\|$/g, '').split('||')
        else rows.push(entry.replace(/^\||\|$/g, '').split('|'))
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, jiraInl))
      continue
    }
    const body: string[] = []
    while (i < lines.length && !blank(lines[i]) && !/^(h[1-6]\.|-{4,}\s*$|\{(?:code|noformat|quote|panel)|bq\. |\|)/.test(lines[i]) && !listMarker(lines[i])) { body.push(lines[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: jiraInl(body.join('\n')) })
    else i += 1
  }
  return { meta: {}, blocks }
}

/* -------------------------------------------------------------------- Muse */

const museRules: InlineRule[] = [
  { pattern: /<code>([\s\S]*?)<\/code>/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /<verbatim>([\s\S]*?)<\/verbatim>/y, build: (m) => str(m[1]) },
  { pattern: /<math>([\s\S]*?)<\/math>/y, build: (m) => ({ t: 'math', text: m[1], display: false }) },
  { pattern: /<sup>([\s\S]*?)<\/sup>/y, build: (m, r) => ({ t: 'sup', c: r(m[1]) }) },
  { pattern: /<sub>([\s\S]*?)<\/sub>/y, build: (m, r) => ({ t: 'sub', c: r(m[1]) }) },
  { pattern: /<del>([\s\S]*?)<\/del>/y, build: (m, r) => ({ t: 'strike', c: r(m[1]) }) },
  { pattern: /<br>/y, build: () => ({ t: 'linebreak' }) },
  { pattern: /=([^=\s][^=\n]*?)=(?![\w])/y, build: (m) => ({ t: 'code', text: m[1] }) },
  { pattern: /\*\*\*([\s\S]+?)\*\*\*/y, build: (m, r) => ({ t: 'strong', c: [{ t: 'emph', c: r(m[1]) }] }) },
  { pattern: /\*\*([\s\S]+?)\*\*/y, build: (m, r) => ({ t: 'strong', c: r(m[1]) }) },
  delimited('*', (c) => ({ t: 'emph', c })),
  delimited('_', (c) => ({ t: 'underline', c })),
  { pattern: /\[\[([^\]]+)\]\[([^\]]*)\]\]/y, build: (m, r) => (/\.(png|jpe?g|gif|svg)$/i.test(m[1]) ? { t: 'image', c: r(m[2]), url: m[1] } : { t: 'link', c: r(m[2]), url: m[1] }) },
  { pattern: /\[\[([^\]]+)\]\]/y, build: (m) => (/\.(png|jpe?g|gif|svg)$/i.test(m[1]) ? { t: 'image', c: [], url: m[1] } : { t: 'link', c: [str(m[1])], url: m[1] }) },
  { pattern: /\[(\d+)\]/y, build: (m) => ({ t: 'span', c: [str(`[${m[1]}]`)], attrs: { classes: ['muse-note-ref'], note: m[1] } }) },
  urlRule,
]
const museInl = (text: string) => parseWithRules(text, museRules)

export function readMuse(source: string): Doc {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const meta: Meta = {}
  const notes = new Map<string, Block[]>()
  // Footnote definitions: `[1] text` at line start.
  const kept: string[] = []
  for (let k = 0; k < lines.length; k += 1) {
    const def = /^\[(\d+)\]\s+(.*)$/.exec(lines[k])
    if (def) {
      const body = [def[2]]
      while (k + 1 < lines.length && /^\s+\S/.test(lines[k + 1])) { k += 1; body.push(lines[k].trim()) }
      notes.set(def[1], [{ t: 'para', c: museInl(body.join('\n')) }])
      continue
    }
    kept.push(lines[k])
  }
  const resolveNotes = (inlines: Inline[]): Inline[] => inlines.map((inline) => {
    if (inline.t === 'span' && inline.attrs?.note && notes.has(String(inline.attrs.note))) return { t: 'note', c: notes.get(String(inline.attrs.note))! }
    if ('c' in inline && Array.isArray(inline.c) && inline.t !== 'note') return { ...inline, c: resolveNotes(inline.c as Inline[]) } as Inline
    return inline
  })
  const inl = (text: string) => resolveNotes(museInl(text))
  const blocks: Block[] = []
  let i = 0
  const listMarker = (line: string) => /^( +)(-|\d+\.)\s+(.*)$/.exec(line)
  while (i < kept.length) {
    const line = kept[i]
    if (blank(line)) { i += 1; continue }
    const directive = /^#(\w+)\s+(.*)$/.exec(line)
    if (directive) { meta[directive[1]] = directive[2].trim(); i += 1; continue }
    if (line.startsWith(';')) { i += 1; continue }
    const heading = /^(\*{1,5})\s+(.*)$/.exec(line)
    if (heading) { blocks.push(header(heading[1].length, inl(heading[2]))); i += 1; continue }
    if (/^-{4,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i += 1; continue }
    const tagBlock = /^\s*<(example|verse|quote|literal|src|center|right)(?:\s+lang="([^"]+)")?[^>]*>(.*)$/.exec(line)
    if (tagBlock) {
      const tag = tagBlock[1]
      const close = new RegExp(`</${tag}>`)
      const body: string[] = []
      let rest = tagBlock[3]
      i += 1
      if (close.test(rest)) body.push(rest.replace(close, ''))
      else {
        if (rest.trim()) body.push(rest)
        while (i < kept.length && !close.test(kept[i])) { body.push(kept[i]); i += 1 }
        if (i < kept.length) { rest = kept[i].replace(close, ''); if (rest.trim()) body.push(rest); i += 1 }
      }
      if (tag === 'example' || tag === 'src') blocks.push({ t: 'code', text: body.join('\n'), lang: tagBlock[2] || undefined })
      else if (tag === 'verse') blocks.push({ t: 'linebl', lines: body.map((entry) => inl(entry)) })
      else if (tag === 'quote') blocks.push({ t: 'quote', c: readMuse(body.join('\n')).blocks })
      else if (tag === 'literal') blocks.push({ t: 'raw', format: 'html', text: body.join('\n') })
      else blocks.push({ t: 'div', attrs: { classes: [tag] }, c: readMuse(body.join('\n')).blocks })
      continue
    }
    if (listMarker(line)) {
      const items: { depth: number; ordered: boolean; text: string }[] = []
      while (i < kept.length && (listMarker(kept[i]) || (/^\s{2,}\S/.test(kept[i]) && items.length))) {
        const m = listMarker(kept[i])
        if (m) items.push({ depth: m[1].length, ordered: m[2] !== '-', text: m[3] })
        else items[items.length - 1].text += `\n${kept[i].trim()}`
        i += 1
      }
      blocks.push(...nestedList(items, inl))
      continue
    }
    const term = /^ (\S.*?)\s+::\s+(.*)$/.exec(line)
    if (term) {
      const items: { term: Inline[]; defs: Block[][] }[] = []
      while (i < kept.length) {
        const t2 = /^ (\S.*?)\s+::\s+(.*)$/.exec(kept[i])
        if (!t2) break
        items.push({ term: inl(t2[1]), defs: [[{ t: 'plain', c: inl(t2[2]) }]] })
        i += 1
      }
      blocks.push({ t: 'deflist', items })
      continue
    }
    if (/^ .*\|/.test(line) || /^ .*\|\|/.test(line)) {
      const rows: string[][] = []
      let headerRow: string[] | null = null
      while (i < kept.length && /^ .*\|/.test(kept[i])) {
        const entry = kept[i].trim()
        if (entry.includes('||') && !headerRow && !rows.length) headerRow = entry.split('||')
        else rows.push(entry.split(/\|{1,3}/))
        i += 1
      }
      blocks.push(simpleTable(rows, headerRow, inl))
      continue
    }
    if (/^ {2,}\S/.test(line) && !listMarker(line)) {
      const body: string[] = []
      while (i < kept.length && /^ +\S/.test(kept[i]) && !listMarker(kept[i])) { body.push(kept[i].trim()); i += 1 }
      blocks.push({ t: 'quote', c: [{ t: 'para', c: inl(body.join('\n')) }] })
      continue
    }
    const body: string[] = []
    while (i < kept.length && !blank(kept[i]) && !/^(\*{1,5}\s|#\w|-{4,}\s*$|\s*<(?:example|verse|quote|literal|src|center|right)|;)/.test(kept[i]) && !listMarker(kept[i]) && !/^ .*\|/.test(kept[i])) { body.push(kept[i]); i += 1 }
    if (body.length) blocks.push({ t: 'para', c: inl(body.join('\n')) })
    else i += 1
  }
  return { meta, blocks }
}
