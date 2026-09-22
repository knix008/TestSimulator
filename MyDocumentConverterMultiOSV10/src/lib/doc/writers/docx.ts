/**
 * DOCX writer, on the `docx` package. Headings map to Word's built-in
 * heading styles so the navigation pane and a generated table of contents
 * work; lists use real numbering definitions; footnotes are real footnotes.
 */
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, FootnoteReferenceRun, HeadingLevel, ImageRun, InternalHyperlink,
  LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType, PageOrientation,
  type IParagraphOptions, type IRunOptions, type ParagraphChild,
} from 'docx'
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { metaOf } from './html'
import type { WriterOptions } from '../options'

type Style = { bold?: boolean; italics?: boolean; strike?: boolean; underline?: boolean; superScript?: boolean; subScript?: boolean; smallCaps?: boolean; code?: boolean }

type State = {
  options: WriterOptions
  footnotes: Record<number, { children: Paragraph[] }>
  nextNote: number
  bulletInstances: number
  orderedInstances: number
  /** Ordered items carry their number as text: see writeDocx. */
  manualNumbering: boolean
}

/** Every ordered list in the document, at any depth. */
function countOrdered(blocks: Block[]): number {
  let count = 0
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.t === 'ordered') { count += 1; block.items.forEach(walk) }
      else if (block.t === 'bullet') block.items.forEach(walk)
      else if (block.t === 'quote' || block.t === 'div') walk(block.c)
      else if (block.t === 'deflist') block.items.forEach((item) => item.defs.forEach(walk))
    }
  }
  walk(blocks)
  return count
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]

export async function writeDocx(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  // Each ordered list is its own Word numbering so it restarts at 1, but the docx
  // library resolves every numbering with a pass over the whole document XML —
  // thousands of lists would take minutes. Past a few hundred, the numbers are
  // written as text with a hanging indent instead, which looks the same on the page.
  const state: State = { options, footnotes: {}, nextNote: 1, bulletInstances: 0, orderedInstances: 0, manualNumbering: countOrdered(doc.blocks) > 300 }
  const meta = metaOf(doc, options)
  const children: (Paragraph | Table)[] = []
  if (options.standalone && meta.title) children.push(new Paragraph({ text: meta.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }))
  if (options.standalone && meta.author) children.push(new Paragraph({ children: [new TextRun({ text: meta.author, size: options.bodyFontSize * 2 + 2 })], alignment: AlignmentType.CENTER }))
  if (options.standalone && meta.date) children.push(new Paragraph({ children: [new TextRun({ text: meta.date })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }))
  if (options.toc) children.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: `1-${options.tocDepth}` }))
  children.push(...blocksDocx(doc.blocks, state, 0))

  const orderedNumbering = Array.from({ length: Math.max(1, state.orderedInstances) }, (_, index) => ({
    reference: `ordered-${index}`,
    levels: [0, 1, 2, 3, 4].map((level) => ({
      level,
      format: level % 3 === 0 ? LevelFormat.DECIMAL : level % 3 === 1 ? LevelFormat.LOWER_LETTER : LevelFormat.LOWER_ROMAN,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    })),
  }))

  const document = new Document({
    creator: meta.author || 'My Document Converter',
    title: meta.title || undefined,
    description: doc.meta.description,
    features: { updateFields: options.toc },
    styles: {
      default: {
        document: { run: { font: options.bodyFont || 'Calibri', size: options.bodyFontSize * 2 } },
        heading1: { run: { size: 32, bold: true, color: '1F3864' }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading2: { run: { size: 28, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 280, after: 100 } } },
        heading3: { run: { size: 24, bold: true, color: '2F5496' }, paragraph: { spacing: { before: 240, after: 80 } } },
        heading4: { run: { size: 22, bold: true, italics: true }, paragraph: { spacing: { before: 200, after: 60 } } },
        heading5: { run: { size: 22, bold: true }, paragraph: { spacing: { before: 160, after: 60 } } },
        heading6: { run: { size: 22, italics: true }, paragraph: { spacing: { before: 160, after: 60 } } },
        title: { run: { size: 48, bold: true }, paragraph: { spacing: { after: 200 } } },
      },
      paragraphStyles: [
        { id: 'SourceCode', name: 'Source Code', basedOn: 'Normal', run: { font: options.monoFont || 'Consolas', size: Math.max(14, options.bodyFontSize * 2 - 4) }, paragraph: { spacing: { before: 0, after: 0, line: 240 }, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' } } },
        { id: 'BlockQuote', name: 'Block Quote', basedOn: 'Normal', run: { italics: true, color: '404040' }, paragraph: { indent: { left: 720, right: 720 }, spacing: { before: 120, after: 120 } } },
        { id: 'Caption', name: 'Caption', basedOn: 'Normal', run: { italics: true, size: options.bodyFontSize * 2 - 2 }, paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 200 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'bullets',
          levels: [0, 1, 2, 3, 4].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: ['•', '◦', '▪', '•', '◦'][level],
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
        ...orderedNumbering,
      ],
    },
    footnotes: state.footnotes,
    sections: [{
      properties: {
        page: {
          size: pageSize(options),
          margin: { top: mm(options.marginMm), bottom: mm(options.marginMm), left: mm(options.marginMm), right: mm(options.marginMm) },
        },
      },
      children,
    }],
  })
  const buffer = await Packer.toArrayBuffer(document)
  return new Uint8Array(buffer)
}

function mm(value: number) {
  // Twips: 1 mm = 56.69 twips.
  return Math.round(value * 56.69)
}

function pageSize(options: WriterOptions) {
  const sizes: Record<string, [number, number]> = { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] }
  const [w, h] = sizes[options.pageSize] ?? sizes.A4
  return options.landscape
    ? { width: mm(h), height: mm(w), orientation: PageOrientation.LANDSCAPE }
    : { width: mm(w), height: mm(h), orientation: PageOrientation.PORTRAIT }
}

function blocksDocx(blocks: Block[], state: State, depth: number, extra: Partial<IParagraphOptions> = {}): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  for (const block of blocks) out.push(...blockDocx(block, state, depth, extra))
  return out
}

function blockDocx(block: Block, state: State, depth: number, extra: Partial<IParagraphOptions>): (Paragraph | Table)[] {
  switch (block.t) {
    case 'para':
      return [new Paragraph({ ...extra, children: inlinesDocx(block.c, state, {}), spacing: { after: 160, ...(extra.spacing ?? {}) } })]
    case 'plain':
      return [new Paragraph({ ...extra, children: inlinesDocx(block.c, state, {}) })]
    case 'header':
      return [new Paragraph({ ...extra, heading: HEADINGS[Math.min(block.level, 6) - 1], children: inlinesDocx(block.c, state, {}) })]
    case 'code':
      return block.text.split('\n').map((line) => new Paragraph({ ...extra, style: 'SourceCode', children: [new TextRun({ text: line || ' ', font: state.options.monoFont || 'Consolas' })] }))
    case 'quote':
      return blocksDocx(block.c, state, depth, { ...extra, style: 'BlockQuote' })
    case 'bullet':
      return listDocx(block.items, state, depth, { reference: 'bullets', level: depth }, block.tasks)
    case 'ordered': {
      if (state.manualNumbering) return listDocx(block.items, state, depth, { reference: '', level: depth }, undefined, block.start)
      const reference = `ordered-${state.orderedInstances}`
      state.orderedInstances += 1
      return listDocx(block.items, state, depth, { reference, level: depth })
    }
    case 'deflist':
      return block.items.flatMap((item) => [
        new Paragraph({ ...extra, children: inlinesDocx(item.term, state, { bold: true }), spacing: { before: 120 } }),
        ...item.defs.flatMap((def) => blocksDocx(def, state, depth, { ...extra, indent: { left: 720 } })),
      ])
    case 'hr':
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } }, spacing: { after: 200 } })]
    case 'table':
      return tableDocx(block, state)
    case 'raw':
      return []
    case 'div':
      return blocksDocx(block.c, state, depth, extra)
    case 'linebl':
      return [new Paragraph({ ...extra, children: block.lines.flatMap((line, index) => [...(index ? [new TextRun({ break: 1 })] : []), ...inlinesDocx(line, state, {})]) })]
  }
}

function listDocx(items: Block[][], state: State, depth: number, numbering: { reference: string; level: number }, tasks?: (boolean | null)[], manualStart?: number): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  items.forEach((item, index) => {
    const task = tasks?.[index]
    let first = true
    const manual = manualStart !== undefined
    for (const block of item) {
      if (block.t === 'bullet' || block.t === 'ordered') {
        out.push(...blockDocx(block, state, depth + 1, {}))
        continue
      }
      if ((block.t === 'para' || block.t === 'plain') && first) {
        const prefix = task === undefined || task === null ? [] : [new TextRun({ text: task ? '☒ ' : '☐ ' })]
        if (manual) {
          out.push(new Paragraph({ indent: { left: 720 * (depth + 1), hanging: 360 }, children: [new TextRun({ text: `${manualStart + index}.	` }), ...prefix, ...inlinesDocx(block.c, state, {})], spacing: { after: 60 } }))
        } else {
          out.push(new Paragraph({ numbering, children: [...prefix, ...inlinesDocx(block.c, state, {})], spacing: { after: 60 } }))
        }
        first = false
        continue
      }
      out.push(...blockDocx(block, state, depth + 1, { indent: { left: 720 * (depth + 1) } }))
      first = false
    }
  })
  return out
}

function tableDocx(block: Extract<Block, { t: 'table' }>, state: State): (Paragraph | Table)[] {
  // A table with no rows at all has nothing Word could lay out; it is dropped rather than crashing the library.
  if (!block.header.length && !block.rows.length) return []
  const width = block.aligns.length
  const align = (k: number) => (block.aligns[k] === 'right' ? AlignmentType.RIGHT : block.aligns[k] === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT)
  const cell = (inlines: Inline[], k: number, header: boolean) => new TableCell({
    children: [new Paragraph({ alignment: align(k), children: inlinesDocx(inlines, state, header ? { bold: true } : {}) })],
    shading: header ? { type: ShadingType.CLEAR, fill: 'E7E6E6' } : undefined,
    width: { size: Math.floor(100 / Math.max(1, width)), type: WidthType.PERCENTAGE },
  })
  const rows: TableRow[] = []
  if (block.header.length) rows.push(new TableRow({ tableHeader: true, children: block.header.map((c, k) => cell(c, k, true)) }))
  for (const row of block.rows) rows.push(new TableRow({ children: row.map((c, k) => cell(c, k, false)) }))
  const out: (Paragraph | Table)[] = []
  if (block.caption.length) out.push(new Paragraph({ style: 'Caption', children: inlinesDocx(block.caption, state, {}) }))
  out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
  out.push(new Paragraph({ spacing: { after: 120 } }))
  return out
}

function runOptions(style: Style, options: WriterOptions): Partial<IRunOptions> {
  return {
    bold: style.bold,
    italics: style.italics,
    strike: style.strike,
    underline: style.underline ? {} : undefined,
    superScript: style.superScript,
    subScript: style.subScript,
    smallCaps: style.smallCaps,
    font: style.code ? options.monoFont || 'Consolas' : undefined,
    shading: style.code ? { type: ShadingType.CLEAR, fill: 'F2F2F2' } : undefined,
  }
}

function inlinesDocx(inlines: Inline[], state: State, style: Style): ParagraphChild[] {
  const out: ParagraphChild[] = []
  // Adjacent words and spaces become one run, so a phrase is one <w:t> and
  // Word's own search finds it.
  let text = ''
  const flush = () => {
    if (text) out.push(new TextRun({ text, ...runOptions(style, state.options) }))
    text = ''
  }
  for (const inline of inlines) {
    if (inline.t === 'str') { text += inline.text; continue }
    if (inline.t === 'space' || inline.t === 'softbreak') { text += ' '; continue }
    flush()
    out.push(...inlineDocx(inline, state, style))
  }
  flush()
  return out
}

function inlineDocx(inline: Inline, state: State, style: Style): ParagraphChild[] {
  const run = (text: string, more: Style = {}) => new TextRun({ text, ...runOptions({ ...style, ...more }, state.options) })
  switch (inline.t) {
    case 'str': return [run(inline.text)]
    case 'space': case 'softbreak': return [run(' ')]
    case 'linebreak': return [new TextRun({ break: 1 })]
    case 'emph': return inlinesDocx(inline.c, state, { ...style, italics: true })
    case 'strong': return inlinesDocx(inline.c, state, { ...style, bold: true })
    case 'strike': return inlinesDocx(inline.c, state, { ...style, strike: true })
    case 'underline': return inlinesDocx(inline.c, state, { ...style, underline: true })
    case 'sup': return inlinesDocx(inline.c, state, { ...style, superScript: true })
    case 'sub': return inlinesDocx(inline.c, state, { ...style, subScript: true })
    case 'smallcaps': return inlinesDocx(inline.c, state, { ...style, smallCaps: true })
    case 'span': return inlinesDocx(inline.c, state, style)
    case 'code': return [run(inline.text, { code: true })]
    case 'math': return [run(inline.text, { italics: true })]
    case 'link': {
      const children = inlinesDocx(inline.c, state, { ...style, underline: true }).map((child) => child)
      if (inline.url.startsWith('#')) return [new InternalHyperlink({ anchor: inline.url.slice(1), children: children as TextRun[] })]
      return [new ExternalHyperlink({ link: inline.url, children: children.map((child) => (child instanceof TextRun ? new TextRun({ ...(child as unknown as { options: IRunOptions }).options, style: 'Hyperlink', color: '0563C1' }) : child)) as TextRun[] })]
    }
    case 'image': {
      const data = dataUrlBytes(inline.url)
      if (data) {
        const type = /^data:image\/(png|jpe?g|gif|bmp)/i.exec(inline.url)?.[1].toLowerCase()
        const kind = type === 'jpeg' || type === 'jpg' ? 'jpg' : type === 'gif' ? 'gif' : type === 'bmp' ? 'bmp' : 'png'
        return [new ImageRun({ type: kind, data, transformation: { width: 480, height: 320 }, altText: { title: '', description: inlinesToText(inline.c), name: 'image' } })]
      }
      return [run(`[${inlinesToText(inline.c) || 'image'}: ${inline.url}]`, { italics: true })]
    }
    case 'raw': return []
    case 'note': {
      const id = state.nextNote
      state.nextNote += 1
      state.footnotes[id] = { children: blocksDocx(inline.c, state, 0).filter((child): child is Paragraph => child instanceof Paragraph) }
      return [new FootnoteReferenceRun(id)]
    }
  }
}

function dataUrlBytes(url: string): Uint8Array | null {
  const match = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(url)
  if (!match) return null
  try {
    const binary = atob(match[1])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}
