/**
 * The bridge to Pandoc's own document model.
 *
 * `json` is Pandoc's JSON AST (what `pandoc -t json` prints and `-f json`
 * reads) and `native` is the same tree in Haskell syntax. Both go through the
 * conversion here, so a document written by this program can be piped into
 * Pandoc and a Pandoc AST can be read back. Our model is a subset of
 * Pandoc's; what has no counterpart (citations, spans with attributes,
 * figures, cells spanning rows) is mapped to the nearest thing rather than
 * dropped.
 */
import type { Alignment, Attrs, Block, Doc, Inline, Meta } from './ast'
import { inlinesToText, slug } from './ast'

export const PANDOC_API_VERSION = [1, 23, 1]

type PInline = { t: string; c?: unknown }
type PBlock = { t: string; c?: unknown }
type PAttr = [string, string[], [string, string][]]
type PMetaValue = { t: string; c?: unknown }

const attr = (id = '', classes: string[] = [], kv: [string, string][] = []): PAttr => [id, classes, kv]
const emptyAttr = (): PAttr => ['', [], []]

/* ------------------------------------------------------------ to Pandoc */

export function toPandoc(doc: Doc): { 'pandoc-api-version': number[]; meta: Record<string, PMetaValue>; blocks: PBlock[] } {
  const meta: Record<string, PMetaValue> = {}
  for (const [key, value] of Object.entries(doc.meta)) {
    if (value === undefined || value === '') continue
    meta[key] = { t: 'MetaInlines', c: inlinesToPandoc(textInlines(value)) }
  }
  if (doc.references?.length) {
    meta.references = { t: 'MetaList', c: doc.references.map((reference) => ({ t: 'MetaMap', c: Object.fromEntries(Object.entries(reference).filter(([, value]) => value !== undefined).map(([key, value]) => [key, { t: 'MetaString', c: String(value) }])) })) }
  }
  return { 'pandoc-api-version': PANDOC_API_VERSION, meta, blocks: blocksToPandoc(doc.blocks) }
}

function textInlines(text: string): Inline[] {
  const out: Inline[] = []
  for (const part of text.split(/( +)/)) {
    if (!part) continue
    out.push(/^ +$/.test(part) ? { t: 'space' } : { t: 'str', text: part })
  }
  return out
}

export function blocksToPandoc(blocks: Block[]): PBlock[] {
  return blocks.map(blockToPandoc)
}

function blockToPandoc(block: Block): PBlock {
  switch (block.t) {
    case 'para': return { t: 'Para', c: inlinesToPandoc(block.c) }
    case 'plain': return { t: 'Plain', c: inlinesToPandoc(block.c) }
    case 'header': return { t: 'Header', c: [block.level, attr(block.id), inlinesToPandoc(block.c)] }
    case 'code': return { t: 'CodeBlock', c: [attr('', block.lang ? [block.lang] : []), block.text] }
    case 'quote': return { t: 'BlockQuote', c: blocksToPandoc(block.c) }
    case 'bullet': return {
      t: 'BulletList',
      c: block.items.map((item, index) => {
        const task = block.tasks?.[index]
        if (task === undefined || task === null) return blocksToPandoc(item)
        // Pandoc marks a task item by a ☒/☐ Str at the start of its first inline block.
        const first = item[0]
        const box: Inline[] = [{ t: 'str', text: task ? '☒' : '☐' }, { t: 'space' }]
        if (first && (first.t === 'plain' || first.t === 'para')) return blocksToPandoc([{ ...first, c: [...box, ...first.c] }, ...item.slice(1)])
        return blocksToPandoc([{ t: 'plain', c: box }, ...item])
      }),
    }
    case 'ordered': return {
      t: 'OrderedList',
      c: [[block.start, { t: styleName(block.style) }, { t: 'Period' }], block.items.map((item) => blocksToPandoc(item))],
    }
    case 'deflist': return { t: 'DefinitionList', c: block.items.map((item) => [inlinesToPandoc(item.term), item.defs.map((def) => blocksToPandoc(def))]) }
    case 'hr': return { t: 'HorizontalRule' }
    case 'raw': return { t: 'RawBlock', c: [block.format, block.text] }
    case 'div': return { t: 'Div', c: [attrsToPandoc(block.attrs), blocksToPandoc(block.c)] }
    case 'linebl': return { t: 'LineBlock', c: block.lines.map((line) => inlinesToPandoc(line)) }
    case 'table': {
      const cell = (inlines: Inline[], align: Alignment): unknown => [emptyAttr(), { t: alignName(align) }, 1, 1, inlines.length ? [{ t: 'Plain', c: inlinesToPandoc(inlines) }] : []]
      const row = (cells: Inline[][]): unknown => [emptyAttr(), cells.map((c, k) => cell(c, block.aligns[k] ?? 'default'))]
      return {
        t: 'Table',
        c: [
          emptyAttr(),
          [null, block.caption.length ? [{ t: 'Plain', c: inlinesToPandoc(block.caption) }] : []],
          block.aligns.map((align) => [{ t: alignName(align) }, { t: 'ColWidthDefault' }]),
          [emptyAttr(), block.header.length ? [row(block.header)] : []],
          [[emptyAttr(), 0, [], block.rows.map(row)]],
          [emptyAttr(), []],
        ],
      }
    }
  }
}

function styleName(style: string | undefined) {
  switch (style) {
    case 'lower-alpha': return 'LowerAlpha'
    case 'upper-alpha': return 'UpperAlpha'
    case 'lower-roman': return 'LowerRoman'
    case 'upper-roman': return 'UpperRoman'
    default: return 'Decimal'
  }
}

function alignName(align: Alignment) {
  return align === 'left' ? 'AlignLeft' : align === 'right' ? 'AlignRight' : align === 'center' ? 'AlignCenter' : 'AlignDefault'
}

function attrsToPandoc(attrs: Attrs | undefined): PAttr {
  if (!attrs) return emptyAttr()
  const kv: [string, string][] = []
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'id' || key === 'classes' || value === undefined) continue
    kv.push([key, Array.isArray(value) ? value.join(' ') : value])
  }
  return attr(attrs.id ?? '', attrs.classes ?? [], kv)
}

export function inlinesToPandoc(inlines: Inline[]): PInline[] {
  return inlines.map(inlineToPandoc)
}

function inlineToPandoc(inline: Inline): PInline {
  switch (inline.t) {
    case 'str': return { t: 'Str', c: inline.text }
    case 'space': return { t: 'Space' }
    case 'softbreak': return { t: 'SoftBreak' }
    case 'linebreak': return { t: 'LineBreak' }
    case 'emph': return { t: 'Emph', c: inlinesToPandoc(inline.c) }
    case 'strong': return { t: 'Strong', c: inlinesToPandoc(inline.c) }
    case 'strike': return { t: 'Strikeout', c: inlinesToPandoc(inline.c) }
    case 'underline': return { t: 'Underline', c: inlinesToPandoc(inline.c) }
    case 'sup': return { t: 'Superscript', c: inlinesToPandoc(inline.c) }
    case 'sub': return { t: 'Subscript', c: inlinesToPandoc(inline.c) }
    case 'smallcaps': return { t: 'SmallCaps', c: inlinesToPandoc(inline.c) }
    case 'code': return { t: 'Code', c: [emptyAttr(), inline.text] }
    case 'math': return { t: 'Math', c: [{ t: inline.display ? 'DisplayMath' : 'InlineMath' }, inline.text] }
    case 'link': return { t: 'Link', c: [emptyAttr(), inlinesToPandoc(inline.c), [inline.url, inline.title ?? '']] }
    case 'image': return { t: 'Image', c: [emptyAttr(), inlinesToPandoc(inline.c), [inline.url, inline.title ?? '']] }
    case 'raw': return { t: 'RawInline', c: [inline.format, inline.text] }
    case 'note': return { t: 'Note', c: blocksToPandoc(inline.c) }
    case 'span': return { t: 'Span', c: [attrsToPandoc(inline.attrs), inlinesToPandoc(inline.c)] }
  }
}

/* ---------------------------------------------------------- from Pandoc */

export function fromPandoc(input: unknown): Doc {
  const tree = input as { meta?: Record<string, PMetaValue>; blocks?: PBlock[] }
  if (!tree || !Array.isArray(tree.blocks)) throw new Error('Not a Pandoc JSON document: expected "blocks"')
  const meta: Meta = {}
  const doc: Doc = { meta, blocks: blocksFromPandoc(tree.blocks) }
  for (const [key, value] of Object.entries(tree.meta ?? {})) {
    if (key === 'references' && value.t === 'MetaList') {
      doc.references = (value.c as PMetaValue[]).map((entry) => {
        const record: Record<string, string> = {}
        if (entry.t === 'MetaMap') for (const [field, item] of Object.entries(entry.c as Record<string, PMetaValue>)) record[field] = metaToText(item)
        return { id: record.id ?? '', type: record.type ?? 'misc', ...record }
      })
      continue
    }
    meta[key] = metaToText(value)
  }
  return doc
}

function metaToText(value: PMetaValue): string {
  switch (value.t) {
    case 'MetaString': return String(value.c)
    case 'MetaBool': return String(value.c)
    case 'MetaInlines': return inlinesToText(inlinesFromPandoc(value.c as PInline[]))
    case 'MetaBlocks': return inlinesToText(blocksFromPandoc(value.c as PBlock[]).flatMap((block) => ('c' in block && Array.isArray(block.c) && block.t !== 'quote' && block.t !== 'div' ? (block.c as Inline[]) : [])))
    case 'MetaList': return (value.c as PMetaValue[]).map(metaToText).join(', ')
    case 'MetaMap': return Object.entries(value.c as Record<string, PMetaValue>).map(([key, item]) => `${key}: ${metaToText(item)}`).join('; ')
    default: return ''
  }
}

export function blocksFromPandoc(blocks: PBlock[]): Block[] {
  const out: Block[] = []
  for (const block of blocks) {
    const converted = blockFromPandoc(block)
    if (converted) out.push(converted)
  }
  return out
}

function attrsFromPandoc(value: unknown): Attrs | undefined {
  if (!Array.isArray(value)) return undefined
  const [id, classes, kv] = value as PAttr
  const attrs: Attrs = {}
  if (id) attrs.id = id
  if (classes?.length) attrs.classes = classes
  for (const [key, val] of kv ?? []) attrs[key] = val
  return Object.keys(attrs).length ? attrs : undefined
}

function blockFromPandoc(block: PBlock): Block | null {
  const c = block.c as never
  switch (block.t) {
    case 'Para': return { t: 'para', c: inlinesFromPandoc(c) }
    case 'Plain': return { t: 'plain', c: inlinesFromPandoc(c) }
    case 'Header': {
      const [level, a, inlines] = c as [number, PAttr, PInline[]]
      const content = inlinesFromPandoc(inlines)
      return { t: 'header', level, c: content, id: a[0] || slug(inlinesToText(content)) }
    }
    case 'CodeBlock': {
      const [a, text] = c as [PAttr, string]
      return { t: 'code', text, lang: a[1][0] || undefined }
    }
    case 'BlockQuote': return { t: 'quote', c: blocksFromPandoc(c) }
    case 'BulletList': {
      const items = (c as PBlock[][]).map((item) => blocksFromPandoc(item))
      const tasks = items.map((item) => {
        const first = item[0]
        if (first && (first.t === 'plain' || first.t === 'para') && first.c[0]?.t === 'str' && (first.c[0].text === '☒' || first.c[0].text === '☐')) {
          const checked = first.c[0].text === '☒'
          first.c = first.c.slice(first.c[1]?.t === 'space' ? 2 : 1)
          return checked
        }
        return null
      })
      return { t: 'bullet', items, tasks: tasks.some((task) => task !== null) ? tasks : undefined }
    }
    case 'OrderedList': {
      const [[start, style], items] = c as [[number, { t: string }, { t: string }], PBlock[][]]
      const styleMap: Record<string, Extract<Block, { t: 'ordered' }>['style']> = { LowerAlpha: 'lower-alpha', UpperAlpha: 'upper-alpha', LowerRoman: 'lower-roman', UpperRoman: 'upper-roman' }
      return { t: 'ordered', start, items: items.map((item) => blocksFromPandoc(item)), style: styleMap[style.t] ?? 'decimal' }
    }
    case 'DefinitionList': return { t: 'deflist', items: (c as [PInline[], PBlock[][]][]).map(([term, defs]) => ({ term: inlinesFromPandoc(term), defs: defs.map((def) => blocksFromPandoc(def)) })) }
    case 'HorizontalRule': return { t: 'hr' }
    case 'RawBlock': { const [format, text] = c as [string, string]; return { t: 'raw', format, text } }
    case 'Div': { const [a, blocks] = c as [PAttr, PBlock[]]; return { t: 'div', c: blocksFromPandoc(blocks), attrs: attrsFromPandoc(a) } }
    case 'LineBlock': return { t: 'linebl', lines: (c as PInline[][]).map((line) => inlinesFromPandoc(line)) }
    case 'Figure': {
      const [, , blocks] = c as [PAttr, unknown, PBlock[]]
      const inner = blocksFromPandoc(blocks)
      return inner.length === 1 ? inner[0] : { t: 'div', c: inner, attrs: { classes: ['figure'] } }
    }
    case 'Table': return tableFromPandoc(c)
    case 'Null': return null
    default: return null
  }
}

function tableFromPandoc(c: unknown): Block {
  const [, caption, colspecs, head, bodies, foot] = c as [PAttr, [unknown, PBlock[]], [{ t: string }, unknown][], [PAttr, unknown[]], [PAttr, number, unknown[], unknown[]][], [PAttr, unknown[]]]
  const alignMap: Record<string, Alignment> = { AlignLeft: 'left', AlignRight: 'right', AlignCenter: 'center', AlignDefault: 'default' }
  const aligns: Alignment[] = colspecs.map(([align]) => alignMap[align.t] ?? 'default')
  const cellInlines = (cell: unknown): Inline[] => {
    const [, , , , blocks] = cell as [PAttr, unknown, number, number, PBlock[]]
    const inner = blocksFromPandoc(blocks)
    const out: Inline[] = []
    for (const block of inner) {
      if (out.length) out.push({ t: 'linebreak' })
      if (block.t === 'para' || block.t === 'plain' || block.t === 'header') out.push(...block.c)
      else if (block.t === 'code') out.push({ t: 'code', text: block.text })
      else out.push({ t: 'str', text: inlinesToText(block.t === 'quote' || block.t === 'div' ? [] : []) })
    }
    return out
  }
  const rowCells = (row: unknown): Inline[][] => {
    const [, cells] = row as [PAttr, unknown[]]
    const out: Inline[][] = []
    for (const cell of cells) {
      const [, , , colspan] = cell as [PAttr, unknown, number, number, PBlock[]]
      out.push(cellInlines(cell))
      for (let k = 1; k < (colspan || 1); k += 1) out.push([])
    }
    while (out.length < aligns.length) out.push([])
    return out.slice(0, Math.max(aligns.length, out.length))
  }
  const headerRows = head[1].map(rowCells)
  const rows: Inline[][][] = []
  for (const body of bodies) {
    const [, , intermediate, cells] = body
    for (const row of [...intermediate, ...cells]) rows.push(rowCells(row))
  }
  for (const row of foot[1]) rows.push(rowCells(row))
  if (headerRows.length > 1) rows.unshift(...headerRows.slice(1))
  const captionBlocks = blocksFromPandoc(caption[1] ?? [])
  const captionInlines = captionBlocks.flatMap((block) => (block.t === 'para' || block.t === 'plain' ? block.c : []))
  return { t: 'table', caption: captionInlines, aligns, header: headerRows[0] ?? [], rows }
}

export function inlinesFromPandoc(inlines: PInline[]): Inline[] {
  const out: Inline[] = []
  for (const inline of inlines ?? []) {
    const converted = inlineFromPandoc(inline)
    if (converted) out.push(...(Array.isArray(converted) ? converted : [converted]))
  }
  return out
}

function inlineFromPandoc(inline: PInline): Inline | Inline[] | null {
  const c = inline.c as never
  switch (inline.t) {
    case 'Str': return { t: 'str', text: String(c) }
    case 'Space': return { t: 'space' }
    case 'SoftBreak': return { t: 'softbreak' }
    case 'LineBreak': return { t: 'linebreak' }
    case 'Emph': return { t: 'emph', c: inlinesFromPandoc(c) }
    case 'Strong': return { t: 'strong', c: inlinesFromPandoc(c) }
    case 'Strikeout': return { t: 'strike', c: inlinesFromPandoc(c) }
    case 'Underline': return { t: 'underline', c: inlinesFromPandoc(c) }
    case 'Superscript': return { t: 'sup', c: inlinesFromPandoc(c) }
    case 'Subscript': return { t: 'sub', c: inlinesFromPandoc(c) }
    case 'SmallCaps': return { t: 'smallcaps', c: inlinesFromPandoc(c) }
    case 'Quoted': {
      const [kind, inner] = c as [{ t: string }, PInline[]]
      const [open, close] = kind.t === 'SingleQuote' ? ['‘', '’'] : ['“', '”']
      return [{ t: 'str', text: open }, ...inlinesFromPandoc(inner), { t: 'str', text: close }]
    }
    case 'Cite': { const [, inner] = c as [unknown, PInline[]]; return inlinesFromPandoc(inner) }
    case 'Code': { const [, text] = c as [PAttr, string]; return { t: 'code', text } }
    case 'Math': { const [kind, text] = c as [{ t: string }, string]; return { t: 'math', text, display: kind.t === 'DisplayMath' } }
    case 'RawInline': { const [format, text] = c as [string, string]; return { t: 'raw', format, text } }
    case 'Link': { const [, inner, [url, title]] = c as [PAttr, PInline[], [string, string]]; return { t: 'link', c: inlinesFromPandoc(inner), url, title: title || undefined } }
    case 'Image': { const [, inner, [url, title]] = c as [PAttr, PInline[], [string, string]]; return { t: 'image', c: inlinesFromPandoc(inner), url, title: title || undefined } }
    case 'Note': return { t: 'note', c: blocksFromPandoc(c) }
    case 'Span': { const [a, inner] = c as [PAttr, PInline[]]; return { t: 'span', c: inlinesFromPandoc(inner), attrs: attrsFromPandoc(a) } }
    default: return null
  }
}

/* ------------------------------------------------------------- native */

/** Pandoc's Haskell "native" syntax, as `pandoc -t native` prints it. */
export function writeNative(doc: Doc): string {
  const tree = toPandoc(doc)
  const lines: string[] = ['Pandoc', '  Meta']
  const metaEntries = Object.entries(tree.meta)
  if (!metaEntries.length) lines.push('    { unMeta = fromList [] }')
  else {
    lines.push('    { unMeta =')
    lines.push('        fromList')
    metaEntries.forEach(([key, value], index) => {
      lines.push(`          ${index === 0 ? '[' : ','} ( ${hs(key)} , ${nativeValue(value, 12)} )`)
    })
    lines.push('          ]', '    }')
  }
  if (!tree.blocks.length) lines.push('  []')
  else {
    tree.blocks.forEach((block, index) => {
      lines.push(`  ${index === 0 ? '[' : ','} ${nativeValue(block, 4)}`)
    })
    lines.push('  ]')
  }
  return `${lines.join('\n')}\n`
}

function hs(text: string): string {
  return JSON.stringify(text)
}

/** Renders one constructor: `Str "x"`, `Para [ ... ]`, `Header 1 ( "id" , [] , [] ) [ ... ]`. */
function nativeValue(value: unknown, indent: number): string {
  if (value === null) return 'Nothing'
  if (typeof value === 'string') return hs(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return `[ ${value.map((item) => nativeValue(item, indent + 2)).join(' , ')} ]`
  }
  const node = value as { t: string; c?: unknown }
  if (node && typeof node.t === 'string') {
    if (node.t === 'MetaInlines' || node.t === 'MetaBlocks' || node.t === 'MetaList') return `${node.t} ${nativeValue(node.c, indent)}`
    if (node.t === 'MetaString' || node.t === 'MetaBool') return `${node.t} ${nativeValue(node.c, indent)}`
    if (node.t === 'MetaMap') return `MetaMap (fromList [ ${Object.entries(node.c as Record<string, unknown>).map(([key, item]) => `( ${hs(key)} , ${nativeValue(item, indent)} )`).join(' , ')} ])`
    if (node.c === undefined) return node.t
    return `${node.t} ${nativeArgs(node.t, node.c, indent)}`
  }
  return hs(String(value))
}

function nativeArgs(kind: string, c: unknown, indent: number): string {
  const tuple = (items: unknown[]) => `( ${items.map((item) => nativeValue(item, indent)).join(' , ')} )`
  switch (kind) {
    case 'Header': { const [level, a, inlines] = c as [number, unknown, unknown]; return `${level} ${tuple(a as unknown[])} ${nativeValue(inlines, indent)}` }
    case 'CodeBlock': case 'Code': { const [a, text] = c as [unknown[], string]; return `${tuple(a)} ${hs(text)}` }
    case 'RawBlock': case 'RawInline': { const [format, text] = c as [string, string]; return `(Format ${hs(format)}) ${hs(text)}` }
    case 'Div': case 'Span': { const [a, inner] = c as [unknown[], unknown]; return `${tuple(a)} ${nativeValue(inner, indent)}` }
    case 'OrderedList': { const [[start, style, delim], items] = c as [[number, { t: string }, { t: string }], unknown]; return `( ${start} , ${style.t} , ${delim.t} ) ${nativeValue(items, indent)}` }
    case 'Math': { const [kind2, text] = c as [{ t: string }, string]; return `${kind2.t} ${hs(text)}` }
    case 'Link': case 'Image': { const [a, inner, [url, title]] = c as [unknown[], unknown, [string, string]]; return `${tuple(a)} ${nativeValue(inner, indent)} ( ${hs(url)} , ${hs(title)} )` }
    case 'Table': {
      const [a, [short, long], colspecs, head, bodies, foot] = c as [unknown[], [unknown, unknown], unknown[], [unknown[], unknown[]], unknown[], [unknown[], unknown[]]]
      const cell = (cellValue: unknown) => { const [ca, align, rs, cs, blocks] = cellValue as [unknown[], { t: string }, number, number, unknown]; return `Cell ${tuple(ca)} ${align.t} (RowSpan ${rs}) (ColSpan ${cs}) ${nativeValue(blocks, indent)}` }
      const row = (rowValue: unknown) => { const [ra, cells] = rowValue as [unknown[], unknown[]]; return `Row ${tuple(ra)} [ ${cells.map(cell).join(' , ')} ]` }
      const rows = (list: unknown[]) => (list.length ? `[ ${list.map(row).join(' , ')} ]` : '[]')
      return `${tuple(a)} (Caption ${short === null ? 'Nothing' : `(Just ${nativeValue(short, indent)})`} ${nativeValue(long, indent)}) [ ${colspecs.map((spec) => { const [align, width] = spec as [{ t: string }, { t: string }]; return `( ${align.t} , ${width.t} )` }).join(' , ')} ] (TableHead ${tuple(head[0])} ${rows(head[1])}) [ ${bodies.map((body) => { const [ba, rhc, inter, cells] = body as [unknown[], number, unknown[], unknown[]]; return `TableBody ${tuple(ba)} (RowHeadColumns ${rhc}) ${rows(inter)} ${rows(cells)}` }).join(' , ')} ] (TableFoot ${tuple(foot[0])} ${rows(foot[1])})`
    }
    default:
      return nativeValue(c, indent)
  }
}

/** Reads Pandoc's native syntax back. It is a small expression grammar: constructors, lists, tuples, strings and numbers. */
export function readNative(source: string): Doc {
  const tokens = tokenize(source)
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expect = (value: string) => { const token = next(); if (token !== value) throw new Error(`native: expected ${value}, got ${token}`) }
  function value(): unknown {
    const token = next()
    if (token === undefined) throw new Error('native: unexpected end')
    if (token === '[') {
      const items: unknown[] = []
      while (peek() !== ']') { items.push(value()); if (peek() === ',') next() }
      expect(']')
      return items
    }
    if (token === '(') {
      const items: unknown[] = []
      while (peek() !== ')') { items.push(value()); if (peek() === ',') next() }
      expect(')')
      return items.length === 1 ? items[0] : { tuple: items }
    }
    if (token.startsWith('"')) return JSON.parse(token)
    if (/^-?\d+$/.test(token)) return Number(token)
    if (token === 'Nothing') return null
    if (token === 'Just') return value()
    if (token === 'fromList') return { fromList: value() }
    // A constructor with its arguments: the arguments are whatever follows until a closing token.
    const args: unknown[] = []
    const wanted = arity(token)
    while (peek() !== undefined && ![']', ')', ','].includes(peek()) && args.length < wanted) {
      args.push(value())
    }
    return { ctor: token, args }
  }
  const tree = value() as { ctor: string; args: unknown[] }
  if (!tree || tree.ctor !== 'Pandoc') throw new Error('native: expected Pandoc')
  const [metaNode, blocks] = tree.args as [unknown, unknown[]]
  const pandoc = { meta: nativeMeta(metaNode), blocks: (blocks as unknown[]).map(toPandocJson) }
  return fromPandoc(pandoc)
}

/** How many arguments each constructor takes, so the parser knows where one ends. */
function arity(ctor: string): number {
  const table: Record<string, number> = {
    Pandoc: 2, Meta: 1, unMeta: 1, MetaInlines: 1, MetaBlocks: 1, MetaList: 1, MetaMap: 1, MetaString: 1, MetaBool: 1,
    Para: 1, Plain: 1, Header: 3, CodeBlock: 2, BlockQuote: 1, BulletList: 1, OrderedList: 2, DefinitionList: 1, HorizontalRule: 0, RawBlock: 2, Div: 2, LineBlock: 1, Table: 6, Figure: 3, Null: 0,
    Str: 1, Space: 0, SoftBreak: 0, LineBreak: 0, Emph: 1, Strong: 1, Strikeout: 1, Underline: 1, Superscript: 1, Subscript: 1, SmallCaps: 1, Quoted: 2, Cite: 2, Code: 2, Math: 2, RawInline: 2, Link: 3, Image: 3, Note: 1, Span: 2,
    Format: 1, Caption: 2, TableHead: 2, TableBody: 4, TableFoot: 2, Row: 2, Cell: 5, RowSpan: 1, ColSpan: 1, RowHeadColumns: 1, ColWidth: 1,
    DisplayMath: 0, InlineMath: 0, SingleQuote: 0, DoubleQuote: 0, AlignLeft: 0, AlignRight: 0, AlignCenter: 0, AlignDefault: 0, ColWidthDefault: 0,
    Decimal: 0, LowerAlpha: 0, UpperAlpha: 0, LowerRoman: 0, UpperRoman: 0, DefaultStyle: 0, Example: 0, Period: 0, OneParen: 0, TwoParens: 0, DefaultDelim: 0,
  }
  return table[ctor] ?? 1
}

function tokenize(source: string): string[] {
  const tokens: string[] = []
  const re = /"(?:[^"\\]|\\.)*"|[[\]()=,{}]|-?\d+|[A-Za-z_][A-Za-z0-9_']*/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) tokens.push(match[0])
  return tokens.filter((token) => token !== '=' && token !== '{' && token !== '}')
}

function nativeMeta(node: unknown): Record<string, PMetaValue> {
  const meta: Record<string, PMetaValue> = {}
  // Meta (unMeta (fromList [...])) — unwrap constructors until the list appears.
  let cursor: unknown = node
  for (let depth = 0; depth < 4 && cursor && typeof cursor === 'object' && !('fromList' in (cursor as object)); depth += 1) {
    cursor = (cursor as { args?: unknown[] }).args?.[0]
  }
  const list = (cursor as { fromList?: unknown[] } | undefined)?.fromList
  for (const entry of (list as { tuple?: unknown[] }[]) ?? []) {
    const pair = (entry as { tuple?: unknown[] }).tuple
    if (!pair) continue
    const [key, value] = pair as [string, unknown]
    meta[key] = toPandocJson(value) as PMetaValue
  }
  return meta
}

/** Turns the parsed native tree into the JSON shape `fromPandoc` understands. */
function toPandocJson(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return node
  if (Array.isArray(node)) return node.map(toPandocJson)
  const record = node as { ctor?: string; args?: unknown[]; tuple?: unknown[]; fromList?: unknown[] }
  if (record.tuple) return record.tuple.map(toPandocJson)
  if (record.fromList) return Object.fromEntries((record.fromList as { tuple: unknown[] }[]).map((entry) => [entry.tuple[0] as string, toPandocJson(entry.tuple[1])]))
  if (!record.ctor) return node
  const args = (record.args ?? []).map(toPandocJson)
  switch (record.ctor) {
    case 'Format': case 'RowSpan': case 'ColSpan': case 'RowHeadColumns': case 'ColWidth': return args[0]
    case 'MetaMap': return { t: 'MetaMap', c: args[0] }
    case 'Caption': return [args[0], args[1]]
    case 'TableHead': case 'TableFoot': return [args[0], args[1]]
    case 'TableBody': return [args[0], args[1], args[2], args[3]]
    case 'Row': return [args[0], args[1]]
    case 'Cell': return [args[0], args[1], args[2], args[3], args[4]]
    case 'OrderedList': return { t: 'OrderedList', c: [args[0], args[1]] }
    default:
      if (!args.length) return { t: record.ctor }
      if (args.length === 1) return { t: record.ctor, c: args[0] }
      return { t: record.ctor, c: args }
  }
}
