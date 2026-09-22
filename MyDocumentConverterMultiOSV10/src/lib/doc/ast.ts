/**
 * The document model every reader produces and every writer consumes.
 *
 * It is a small cousin of Pandoc's: a document is metadata plus a list of
 * blocks, a block holds inlines or further blocks, and nothing here knows
 * about any particular file format. Converting from format A to format B is
 * therefore always read(A) → Doc → write(B), and adding a format means adding
 * one reader, one writer, or both — never a pair for every other format.
 */

export type Alignment = 'left' | 'center' | 'right' | 'default'

export type Inline =
  | { t: 'str'; text: string }
  | { t: 'space' }
  | { t: 'softbreak' }
  | { t: 'linebreak' }
  | { t: 'emph'; c: Inline[] }
  | { t: 'strong'; c: Inline[] }
  | { t: 'strike'; c: Inline[] }
  | { t: 'underline'; c: Inline[] }
  | { t: 'sup'; c: Inline[] }
  | { t: 'sub'; c: Inline[] }
  | { t: 'smallcaps'; c: Inline[] }
  | { t: 'code'; text: string }
  | { t: 'math'; text: string; display: boolean }
  | { t: 'link'; c: Inline[]; url: string; title?: string }
  | { t: 'image'; c: Inline[]; url: string; title?: string }
  | { t: 'raw'; format: string; text: string }
  | { t: 'note'; c: Block[] }
  | { t: 'span'; c: Inline[]; attrs?: Attrs }

export type Attrs = { id?: string; classes?: string[]; [key: string]: string | string[] | undefined }

export type ListItem = Block[]

export type Cell = Inline[]

export type Block =
  | { t: 'para'; c: Inline[] }
  | { t: 'plain'; c: Inline[] }
  | { t: 'header'; level: number; c: Inline[]; id: string }
  | { t: 'code'; text: string; lang?: string }
  | { t: 'quote'; c: Block[] }
  | { t: 'bullet'; items: ListItem[]; tasks?: (boolean | null)[]; tight?: boolean }
  | { t: 'ordered'; start: number; items: ListItem[]; style?: 'decimal' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman'; tight?: boolean }
  | { t: 'deflist'; items: { term: Inline[]; defs: Block[][] }[] }
  | { t: 'hr' }
  | { t: 'table'; caption: Inline[]; aligns: Alignment[]; header: Cell[]; rows: Cell[][] }
  | { t: 'raw'; format: string; text: string }
  | { t: 'div'; c: Block[]; attrs?: Attrs }
  | { t: 'linebl'; lines: Inline[][] }

export type Meta = {
  title?: string
  author?: string
  date?: string
  [key: string]: string | undefined
}

/** A bibliographic entry, as the bibliography formats carry it (CSL field names). */
export type Reference = {
  id: string
  type: string
  [field: string]: string | undefined
}

export type Doc = { meta: Meta; blocks: Block[]; references?: Reference[] }

/* --------------------------------------------------------------- builders */

export const str = (text: string): Inline => ({ t: 'str', text })
export const space: Inline = { t: 'space' }
export const softbreak: Inline = { t: 'softbreak' }
export const linebreak: Inline = { t: 'linebreak' }
export const para = (c: Inline[]): Block => ({ t: 'para', c })
export const plain = (c: Inline[]): Block => ({ t: 'plain', c })
export const header = (level: number, c: Inline[], id = ''): Block => ({ t: 'header', level: Math.max(1, Math.min(6, level)), c, id: id || slug(inlinesToText(c)) })
export const codeBlock = (text: string, lang?: string): Block => ({ t: 'code', text, lang: lang || undefined })
export const emptyDoc = (): Doc => ({ meta: {}, blocks: [] })

/** Splits plain text into `str` and `space` inlines the way readers do. */
export function textToInlines(text: string): Inline[] {
  const out: Inline[] = []
  const parts = text.split(/(\s+)/)
  for (const part of parts) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      if (part.includes('\n')) out.push(softbreak)
      else out.push(space)
    } else {
      out.push(str(part))
    }
  }
  return out
}

/** The text of a run of inlines, formatting dropped. */
export function inlinesToText(inlines: Inline[]): string {
  let out = ''
  for (const inline of inlines) {
    switch (inline.t) {
      case 'str': out += inline.text; break
      case 'space': out += ' '; break
      case 'softbreak': out += ' '; break
      case 'linebreak': out += '\n'; break
      case 'code': out += inline.text; break
      case 'math': out += inline.text; break
      case 'raw': break
      case 'note': out += `[${blocksToText(inline.c)}]`; break
      case 'image': out += inlinesToText(inline.c); break
      default: out += inlinesToText(inline.c)
    }
  }
  return out
}

export function blocksToText(blocks: Block[]): string {
  return blocks.map(blockToText).join('\n\n')
}

function blockToText(block: Block): string {
  switch (block.t) {
    case 'para':
    case 'plain':
    case 'header':
      return inlinesToText(block.c)
    case 'code':
      return block.text
    case 'quote':
    case 'div':
      return blocksToText(block.c)
    case 'bullet':
    case 'ordered':
      return block.items.map((item) => blocksToText(item)).join('\n')
    case 'deflist':
      return block.items.map((item) => `${inlinesToText(item.term)}: ${item.defs.map(blocksToText).join(' ')}`).join('\n')
    case 'table':
      return [block.header, ...block.rows].map((row) => row.map(inlinesToText).join('\t')).join('\n')
    case 'linebl':
      return block.lines.map(inlinesToText).join('\n')
    case 'raw':
      return block.text
    case 'hr':
      return ''
  }
}

/** A URL-safe identifier for a heading, the way Pandoc derives one. */
export function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return cleaned.replace(/^[^\p{L}_]+/u, '') || 'section'
}

/** Walks every block (depth first), including those nested in lists, quotes and notes. */
export function walkBlocks(blocks: Block[], visit: (block: Block) => void) {
  for (const block of blocks) {
    visit(block)
    switch (block.t) {
      case 'quote':
      case 'div':
        walkBlocks(block.c, visit)
        break
      case 'bullet':
      case 'ordered':
        for (const item of block.items) walkBlocks(item, visit)
        break
      case 'deflist':
        for (const item of block.items) for (const def of item.defs) walkBlocks(def, visit)
        break
      default:
        break
    }
  }
}

export function walkInlines(blocks: Block[], visit: (inline: Inline) => void) {
  const inlines = (list: Inline[]) => {
    for (const inline of list) {
      visit(inline)
      if ('c' in inline && Array.isArray(inline.c)) {
        if (inline.t === 'note') walkBlocks(inline.c, (block) => blockInlines(block, inlines))
        else inlines(inline.c as Inline[])
      }
    }
  }
  walkBlocks(blocks, (block) => blockInlines(block, inlines))
}

function blockInlines(block: Block, visit: (list: Inline[]) => void) {
  switch (block.t) {
    case 'para':
    case 'plain':
    case 'header':
      visit(block.c)
      break
    case 'table':
      visit(block.caption)
      for (const cell of block.header) visit(cell)
      for (const row of block.rows) for (const cell of row) visit(cell)
      break
    case 'deflist':
      for (const item of block.items) visit(item.term)
      break
    case 'linebl':
      for (const line of block.lines) visit(line)
      break
    default:
      break
  }
}

/** The headings, for tables of contents. */
export function headings(doc: Doc, maxLevel = 3): { level: number; text: string; id: string }[] {
  const out: { level: number; text: string; id: string }[] = []
  walkBlocks(doc.blocks, (block) => {
    if (block.t === 'header' && block.level <= maxLevel) out.push({ level: block.level, text: inlinesToText(block.c), id: block.id })
  })
  return out
}

/** Gives every heading a distinct id, numbering duplicates the way Pandoc does. */
export function uniqueHeadingIds(doc: Doc): Doc {
  const seen = new Map<string, number>()
  walkBlocks(doc.blocks, (block) => {
    if (block.t !== 'header') return
    const base = block.id || slug(inlinesToText(block.c))
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    block.id = count === 0 ? base : `${base}-${count}`
  })
  return doc
}

/** Counts for the status bar and the statistics window. */
export function documentStats(doc: Doc) {
  const text = blocksToText(doc.blocks)
  const words = text.split(/\s+/).filter(Boolean).length
  let headingCount = 0
  let paragraphs = 0
  let codeBlocks = 0
  let tables = 0
  let lists = 0
  let images = 0
  let links = 0
  walkBlocks(doc.blocks, (block) => {
    if (block.t === 'header') headingCount += 1
    if (block.t === 'para') paragraphs += 1
    if (block.t === 'code') codeBlocks += 1
    if (block.t === 'table') tables += 1
    if (block.t === 'bullet' || block.t === 'ordered') lists += 1
  })
  walkInlines(doc.blocks, (inline) => {
    if (inline.t === 'image') images += 1
    if (inline.t === 'link') links += 1
  })
  return { words, characters: text.length, headings: headingCount, paragraphs, codeBlocks, tables, lists, images, links }
}
