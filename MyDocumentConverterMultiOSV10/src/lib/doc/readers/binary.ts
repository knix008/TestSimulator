/**
 * Readers for the zipped formats: DOCX (through mammoth's HTML), ODT (the
 * content.xml inside) and EPUB (the spine's XHTML files in order).
 */
import JSZip from 'jszip'
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, space, str } from '../ast'
import { parseHtml, textContent, type HtmlElement, type HtmlNode } from '../htmlParse'
import { blocksOf, inlinesOf, readHtml } from './html'

type Mammoth = { convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<{ value: string; messages: { type: string; message: string }[] }> }

async function loadMammoth(): Promise<Mammoth> {
  const module = (await import('mammoth/mammoth.browser.js')) as unknown as { default?: Mammoth } & Mammoth
  return module.default ?? module
}

export async function readDocx(data: ArrayBuffer): Promise<Doc> {
  const mammoth = await loadMammoth()
  const result = await mammoth.convertToHtml({ arrayBuffer: data }, {
    styleMap: [
      "p[style-name='Title'] => h1.title:fresh",
      "p[style-name='Subtitle'] => p.subtitle:fresh",
      "p[style-name='Code'] => pre:separator('\\n')",
      "p[style-name='Source Code'] => pre:separator('\\n')",
      "p[style-name='Quote'] => blockquote:fresh",
      "p[style-name='Block Text'] => blockquote:fresh",
      "r[style-name='Verbatim Char'] => code",
      "r[style-name='Code Char'] => code",
      'strike => del',
      'u => u',
    ],
    convertImage: undefined,
  })
  const doc = readHtml(result.value)
  // Title/author from the package's core properties, when present.
  try {
    const zip = await JSZip.loadAsync(data)
    const core = zip.file('docProps/core.xml')
    if (core) {
      const xml = await core.async('string')
      const title = /<dc:title>([^<]*)<\/dc:title>/.exec(xml)?.[1]
      const author = /<dc:creator>([^<]*)<\/dc:creator>/.exec(xml)?.[1]
      const date = /<dcterms:created[^>]*>([^<]*)<\/dcterms:created>/.exec(xml)?.[1]
      if (title) doc.meta.title = decode(title)
      if (author) doc.meta.author = decode(author)
      if (date) doc.meta.date = date.slice(0, 10)
    }
  } catch {
    // Metadata is a nicety; the document itself is already read.
  }
  return doc
}

function decode(text: string) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

/* -------------------------------------------------------------------- ODT */

export async function readOdt(data: ArrayBuffer): Promise<Doc> {
  const zip = await JSZip.loadAsync(data)
  const contentFile = zip.file('content.xml')
  if (!contentFile) throw new Error('Not an OpenDocument text file: content.xml is missing')
  const content = parseHtml(await contentFile.async('string'))
  const stylesXml = zip.file('styles.xml') ? await zip.file('styles.xml')!.async('string') : ''
  const styles = odtStyles(content, parseHtml(stylesXml))
  const meta: Meta = {}
  const metaFile = zip.file('meta.xml')
  if (metaFile) {
    const xml = await metaFile.async('string')
    const title = /<dc:title>([^<]*)<\/dc:title>/.exec(xml)?.[1]
    const author = /<(?:dc:creator|meta:initial-creator)>([^<]*)<\/(?:dc:creator|meta:initial-creator)>/.exec(xml)?.[1]
    const date = /<dc:date>([^<]*)<\/dc:date>/.exec(xml)?.[1]
    if (title) meta.title = decode(title)
    if (author) meta.author = decode(author)
    if (date) meta.date = date.slice(0, 10)
  }
  const body = find(content, 'office:text') ?? content
  return { meta, blocks: odtBlocks(body.children, styles) }
}

type OdtStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; mono?: boolean; sup?: boolean; sub?: boolean; parent?: string; code?: boolean }

function odtStyles(content: HtmlElement, stylesDoc: HtmlElement): Map<string, OdtStyle> {
  const map = new Map<string, OdtStyle>()
  const collect = (root: HtmlElement) => {
    for (const node of walk(root)) {
      if (node.tag !== 'style:style') continue
      const name = node.attrs['style:name']
      if (!name) continue
      const style: OdtStyle = { parent: node.attrs['style:parent-style-name'] }
      const text = node.children.find((child): child is HtmlElement => child.type === 'element' && child.tag === 'style:text-properties')
      if (text) {
        if (/bold|[6-9]00/.test(text.attrs['fo:font-weight'] ?? '')) style.bold = true
        if (text.attrs['fo:font-style'] === 'italic' || text.attrs['fo:font-style'] === 'oblique') style.italic = true
        if ((text.attrs['style:text-underline-style'] ?? 'none') !== 'none') style.underline = true
        if ((text.attrs['style:text-line-through-style'] ?? 'none') !== 'none') style.strike = true
        if (/mono|courier|consolas|menlo/i.test(text.attrs['style:font-name'] ?? text.attrs['fo:font-family'] ?? '')) style.mono = true
        const position = text.attrs['style:text-position'] ?? ''
        if (/^super|^[1-9]\d*%/.test(position) && !/^sub/.test(position)) style.sup = true
        if (/^sub|^-\d/.test(position)) style.sub = true
      }
      if (/preformatted|source|code/i.test(name) || /preformatted|source|code/i.test(style.parent ?? '')) style.code = true
      map.set(name, style)
    }
  }
  collect(stylesDoc)
  collect(content)
  // Resolve inheritance.
  const resolved = new Map<string, OdtStyle>()
  const resolve = (name: string, depth = 0): OdtStyle => {
    if (resolved.has(name)) return resolved.get(name)!
    const own = map.get(name) ?? {}
    const base = own.parent && depth < 10 ? resolve(own.parent, depth + 1) : {}
    const merged = { ...base, ...own }
    resolved.set(name, merged)
    return merged
  }
  for (const name of map.keys()) resolve(name)
  return resolved
}

function* walk(node: HtmlNode): Generator<HtmlElement> {
  if (node.type !== 'element') return
  yield node
  for (const child of node.children) yield* walk(child)
}

function find(node: HtmlNode, tag: string): HtmlElement | null {
  for (const element of walk(node)) if (element.tag === tag) return element
  return null
}

function odtBlocks(children: HtmlNode[], styles: Map<string, OdtStyle>): Block[] {
  const blocks: Block[] = []
  for (const child of children) {
    if (child.type !== 'element') continue
    switch (child.tag) {
      case 'text:h': {
        const level = Number(child.attrs['text:outline-level'] ?? 1)
        blocks.push(header(level, odtInlines(child.children, styles)))
        break
      }
      case 'text:p': {
        const style = styles.get(child.attrs['text:style-name'] ?? '')
        if (style?.code) {
          const text = odtText(child)
          const last = blocks[blocks.length - 1]
          if (last && last.t === 'code') last.text += `\n${text}`
          else blocks.push({ t: 'code', text })
          break
        }
        const inlines = odtInlines(child.children, styles)
        if (inlines.length) blocks.push({ t: 'para', c: inlines })
        break
      }
      case 'text:list': {
        const items = child.children.filter((item): item is HtmlElement => item.type === 'element' && item.tag === 'text:list-item').map((item) => {
          const inner = odtBlocks(item.children, styles)
          if (inner.length && inner[0].t === 'para') inner[0] = { t: 'plain', c: inner[0].c }
          return inner
        })
        const styleName = child.attrs['text:style-name'] ?? ''
        const ordered = /number|enum|ordered/i.test(styleName) || isNumberedList(child, styles)
        blocks.push(ordered ? { t: 'ordered', start: 1, items, tight: true } : { t: 'bullet', items, tight: true })
        break
      }
      case 'table:table': {
        const rows: Inline[][][] = []
        let headerRow: Inline[][] = []
        for (const element of walk(child)) {
          if (element.tag !== 'table:table-row') continue
          const cells = element.children.filter((cell): cell is HtmlElement => cell.type === 'element' && cell.tag === 'table:table-cell').map((cell) => {
            const inner = odtBlocks(cell.children, styles)
            const out: Inline[] = []
            for (const block of inner) {
              if (out.length) out.push(linebreak)
              if (block.t === 'para' || block.t === 'plain' || block.t === 'header') out.push(...block.c)
              else if (block.t === 'code') out.push({ t: 'code', text: block.text })
            }
            return out
          })
          const inHeader = element.type === 'element' && parentTag(child, element) === 'table:table-header-rows'
          if (inHeader && !headerRow.length) headerRow = cells
          else rows.push(cells)
        }
        const width = Math.max(headerRow.length, ...rows.map((row) => row.length), 1)
        const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
        blocks.push({ t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerRow.length ? pad(headerRow) : [], rows: rows.map(pad) })
        break
      }
      case 'text:section':
      case 'office:text':
      case 'draw:frame':
      case 'draw:text-box':
        blocks.push(...odtBlocks(child.children, styles))
        break
      case 'text:soft-page-break':
      case 'text:sequence-decls':
      case 'office:forms':
      case 'text:tracked-changes':
        break
      default:
        blocks.push(...odtBlocks(child.children, styles))
    }
  }
  return blocks
}

function parentTag(root: HtmlElement, target: HtmlElement): string | null {
  for (const element of walk(root)) {
    if (element.children.includes(target)) return element.tag
  }
  return null
}

function isNumberedList(list: HtmlElement, styles: Map<string, OdtStyle>): boolean {
  void styles
  const styleName = list.attrs['text:style-name'] ?? ''
  return /^L?\d*$/.test(styleName) ? false : /num/i.test(styleName)
}

function odtText(node: HtmlNode): string {
  if (node.type === 'text') return node.text
  if (node.type === 'comment') return ''
  if (node.tag === 'text:s') return ' '.repeat(Number(node.attrs['text:c'] ?? 1))
  if (node.tag === 'text:tab') return '\t'
  if (node.tag === 'text:line-break') return '\n'
  return node.children.map(odtText).join('')
}

function odtInlines(children: HtmlNode[], styles: Map<string, OdtStyle>): Inline[] {
  const out: Inline[] = []
  const push = (inline: Inline) => {
    if (inline.t === 'str') {
      const last = out[out.length - 1]
      if (last && last.t === 'str') { last.text += inline.text; return }
    }
    out.push(inline)
  }
  const pushText = (text: string) => {
    for (const part of text.split(/( +)/)) {
      if (!part) continue
      if (/^ +$/.test(part)) push(space)
      else push(str(part))
    }
  }
  for (const child of children) {
    if (child.type === 'text') { pushText(child.text); continue }
    if (child.type !== 'element') continue
    switch (child.tag) {
      case 'text:s': pushText(' '.repeat(Number(child.attrs['text:c'] ?? 1))); break
      case 'text:tab': pushText(' '); break
      case 'text:line-break': push(linebreak); break
      case 'text:span': {
        const style = styles.get(child.attrs['text:style-name'] ?? '') ?? {}
        let inner = odtInlines(child.children, styles)
        if (style.mono) inner = [{ t: 'code', text: textContent(child) }]
        if (style.bold) inner = [{ t: 'strong', c: inner }]
        if (style.italic) inner = [{ t: 'emph', c: inner }]
        if (style.underline) inner = [{ t: 'underline', c: inner }]
        if (style.strike) inner = [{ t: 'strike', c: inner }]
        if (style.sup) inner = [{ t: 'sup', c: inner }]
        if (style.sub) inner = [{ t: 'sub', c: inner }]
        for (const inline of inner) push(inline)
        break
      }
      case 'text:a':
        push({ t: 'link', c: odtInlines(child.children, styles), url: child.attrs['xlink:href'] ?? '' })
        break
      case 'draw:frame': {
        const image = find(child, 'draw:image')
        if (image) push({ t: 'image', c: child.attrs['draw:name'] ? [str(child.attrs['draw:name'])] : [], url: image.attrs['xlink:href'] ?? '' })
        else for (const inline of odtInlines(child.children, styles)) push(inline)
        break
      }
      case 'text:note': {
        const body = find(child, 'text:note-body')
        if (body) push({ t: 'note', c: odtBlocks(body.children, styles) })
        break
      }
      case 'text:note-citation':
      case 'text:bookmark':
      case 'text:bookmark-start':
      case 'text:bookmark-end':
      case 'office:annotation':
        break
      default:
        for (const inline of odtInlines(child.children, styles)) push(inline)
    }
  }
  while (out.length && out[0].t === 'space') out.shift()
  while (out.length && out[out.length - 1].t === 'space') out.pop()
  return out
}

/* ------------------------------------------------------------------- EPUB */

export async function readEpub(data: ArrayBuffer): Promise<Doc> {
  const zip = await JSZip.loadAsync(data)
  const container = zip.file('META-INF/container.xml')
  if (!container) throw new Error('Not an EPUB: META-INF/container.xml is missing')
  const containerXml = parseHtml(await container.async('string'))
  const rootfile = find(containerXml, 'rootfile')?.attrs['full-path']
  if (!rootfile) throw new Error('Not an EPUB: no rootfile in container.xml')
  const opfFile = zip.file(rootfile)
  if (!opfFile) throw new Error(`Not an EPUB: ${rootfile} is missing`)
  const opf = parseHtml(await opfFile.async('string'))
  const base = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : ''
  const meta: Meta = {}
  const title = find(opf, 'dc:title')
  const creator = find(opf, 'dc:creator')
  const date = find(opf, 'dc:date')
  if (title) meta.title = textContent(title).trim()
  if (creator) meta.author = textContent(creator).trim()
  if (date) meta.date = textContent(date).trim().slice(0, 10)
  const manifest = new Map<string, { href: string; type: string }>()
  for (const item of walk(opf)) {
    if (item.tag === 'item' && item.attrs.id) manifest.set(item.attrs.id, { href: item.attrs.href ?? '', type: item.attrs['media-type'] ?? '' })
  }
  const spine: string[] = []
  for (const ref of walk(opf)) {
    if (ref.tag === 'itemref' && ref.attrs.idref) {
      const entry = manifest.get(ref.attrs.idref)
      if (entry && /html|xml/.test(entry.type)) spine.push(entry.href)
    }
  }
  const blocks: Block[] = []
  for (const href of spine) {
    const path = decodeURIComponent(base + href)
    const file = zip.file(path)
    if (!file) continue
    const html = await file.async('string')
    const root = parseHtml(html)
    const body = find(root, 'body') ?? root
    const chapter = blocksOf(body.children)
    // A chapter with no heading gets one from its <title>, so the structure survives.
    if (!chapter.some((block) => block.t === 'header')) {
      const chapterTitle = find(root, 'title')
      const text = chapterTitle ? textContent(chapterTitle).trim() : ''
      if (text && text !== meta.title) chapter.unshift(header(1, inlinesOf([{ type: 'text', text }])))
    }
    blocks.push(...chapter)
  }
  return { meta, blocks }
}
