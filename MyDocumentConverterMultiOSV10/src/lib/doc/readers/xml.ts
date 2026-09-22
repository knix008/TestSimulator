/**
 * Readers for the XML document formats: DocBook (4 and 5), JATS and BITS,
 * OPML and FictionBook 2. All are walked with the same element parser the
 * HTML reader uses; the element names differ, the shape does not.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, space, str, textToInlines } from '../ast'
import { parseHtml, textContent, type HtmlElement, type HtmlNode } from '../htmlParse'
import { readMarkdown } from './markdown'

const isEl = (node: HtmlNode, ...tags: string[]): node is HtmlElement => node.type === 'element' && (tags.length === 0 || tags.includes(node.tag))
const children = (node: HtmlElement, ...tags: string[]) => node.children.filter((child): child is HtmlElement => isEl(child, ...tags))
const child = (node: HtmlElement, ...tags: string[]) => node.children.find((c): c is HtmlElement => isEl(c, ...tags))
function findDeep(node: HtmlNode, tag: string): HtmlElement | null {
  if (node.type !== 'element') return null
  if (node.tag === tag) return node
  for (const c of node.children) {
    const found = findDeep(c, tag)
    if (found) return found
  }
  return null
}
const text = (node: HtmlElement | undefined | null) => (node ? textContent(node).replace(/\s+/g, ' ').trim() : '')

function pushText(out: Inline[], value: string, pre = false) {
  const normalized = pre ? value : value.replace(/[ \t\r\n]+/g, ' ')
  for (const part of normalized.split(/( |\n)/)) {
    if (!part) continue
    if (part === ' ') {
      const last = out[out.length - 1]
      if (last && (last.t === 'space' || last.t === 'softbreak' || last.t === 'linebreak')) continue
      out.push(space)
    } else if (part === '\n') out.push({ t: 'softbreak' })
    else {
      const last = out[out.length - 1]
      if (last && last.t === 'str') last.text += part
      else out.push(str(part))
    }
  }
}

function trim(inlines: Inline[]): Inline[] {
  while (inlines.length && (inlines[0].t === 'space' || inlines[0].t === 'softbreak')) inlines.shift()
  while (inlines.length && (inlines[inlines.length - 1].t === 'space' || inlines[inlines.length - 1].t === 'softbreak')) inlines.pop()
  return inlines
}

type Walker = {
  /** Inline elements: tag → builder. `null` means "transparent". */
  inline: (node: HtmlElement, recurse: (nodes: HtmlNode[]) => Inline[]) => Inline | Inline[] | null | undefined
  /** Block elements: tag → blocks. `undefined` means "not a block, treat as inline". */
  block: (node: HtmlElement, depth: number, self: (nodes: HtmlNode[], depth: number) => Block[]) => Block[] | undefined
  isBlock: (tag: string) => boolean
}

function makeWalker(walker: Walker) {
  const inlines = (nodes: HtmlNode[]): Inline[] => {
    const out: Inline[] = []
    for (const node of nodes) {
      if (node.type === 'text') { pushText(out, node.text); continue }
      if (node.type !== 'element') continue
      const built = walker.inline(node, inlines)
      if (built === null || built === undefined) out.push(...inlines(node.children))
      else if (Array.isArray(built)) out.push(...built)
      else out.push(built)
    }
    return out
  }
  const blocks = (nodes: HtmlNode[], depth: number): Block[] => {
    const out: Block[] = []
    let run: HtmlNode[] = []
    const flush = () => {
      const content = trim(inlines(run))
      if (content.length) out.push({ t: 'para', c: content })
      run = []
    }
    for (const node of nodes) {
      if (node.type === 'element' && walker.isBlock(node.tag)) {
        flush()
        const built = walker.block(node, depth, blocks)
        if (built) out.push(...built)
        else out.push(...blocks(node.children, depth))
      } else if (node.type === 'text' && !node.text.trim() && !run.length) {
        continue
      } else if (node.type !== 'comment') run.push(node)
    }
    flush()
    return out
  }
  return { inlines, blocks }
}

function tableFromRows(rows: HtmlElement[], cellTags: string[], headTags: string[], cellInlines: (cell: HtmlElement) => Inline[], headerRowCount = 0): Block {
  const cellsOf = (row: HtmlElement) => children(row, ...cellTags, ...headTags)
  const allRows = rows.map((row) => cellsOf(row).map(cellInlines))
  const width = Math.max(1, ...allRows.map((row) => row.length))
  const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
  let headerCount = headerRowCount
  if (!headerCount && rows.length && cellsOf(rows[0]).length && cellsOf(rows[0]).every((cell) => headTags.includes(cell.tag))) headerCount = 1
  return { t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as Alignment), header: headerCount ? pad(allRows[0]) : [], rows: allRows.slice(headerCount).map(pad) }
}

/* ----------------------------------------------------------------- DocBook */

const DOCBOOK_BLOCKS = new Set(['article', 'book', 'chapter', 'part', 'preface', 'appendix', 'section', 'sect1', 'sect2', 'sect3', 'sect4', 'sect5', 'simplesect', 'para', 'simpara', 'formalpara', 'programlisting', 'screen', 'literallayout', 'synopsis', 'itemizedlist', 'orderedlist', 'listitem', 'variablelist', 'blockquote', 'epigraph', 'table', 'informaltable', 'figure', 'informalfigure', 'mediaobject', 'note', 'warning', 'tip', 'caution', 'important', 'sidebar', 'abstract', 'info', 'articleinfo', 'bookinfo', 'title', 'subtitle', 'bridgehead', 'equation', 'informalequation', 'example', 'glosslist', 'glossentry', 'procedure', 'step', 'bibliography', 'index', 'toc', 'attribution', 'refentry', 'refsect1', 'refsect2', 'refsynopsisdiv', 'refnamediv'])

export function readDocBook(source: string): Doc {
  const root = parseHtml(source)
  const meta: Meta = {}
  const info = findDeep(root, 'info') ?? findDeep(root, 'articleinfo') ?? findDeep(root, 'bookinfo')
  const topTitle = info ? child(info, 'title') : null
  const docTitle = topTitle ?? (() => { const top = findDeep(root, 'article') ?? findDeep(root, 'book'); return top ? child(top, 'title') : null })()
  if (docTitle) meta.title = text(docTitle)
  if (info) {
    const author = findDeep(info, 'author')
    if (author) {
      const person = findDeep(author, 'personname') ?? author
      const parts = [text(child(person, 'firstname')), text(child(person, 'othername')), text(child(person, 'surname'))].filter(Boolean)
      meta.author = parts.length ? parts.join(' ') : text(author)
    }
    const date = findDeep(info, 'date') ?? findDeep(info, 'pubdate')
    if (date) meta.date = text(date)
  }
  const walker = makeWalker({
    isBlock: (tag) => DOCBOOK_BLOCKS.has(tag),
    inline: (node, recurse) => {
      switch (node.tag) {
        case 'emphasis': { const role = (node.attrs.role ?? '').toLowerCase(); return { t: role === 'bold' || role === 'strong' ? 'strong' : role === 'strikethrough' ? 'strike' : role === 'underline' ? 'underline' : 'emph', c: recurse(node.children) } as Inline }
        case 'literal': case 'code': case 'command': case 'filename': case 'varname': case 'function': case 'classname': case 'option': case 'parameter': case 'computeroutput': case 'userinput': case 'markup': case 'tag': case 'envar': case 'constant': return { t: 'code', text: textContent(node) }
        case 'link': case 'ulink': { const url = node.attrs['xlink:href'] ?? node.attrs.url ?? node.attrs.linkend ?? ''; const inner = recurse(node.children); return { t: 'link', c: inner.length ? inner : [str(url)], url: node.attrs.linkend && !node.attrs['xlink:href'] ? `#${url}` : url } }
        case 'xref': return { t: 'link', c: [str(node.attrs.linkend ?? '')], url: `#${node.attrs.linkend ?? ''}` }
        case 'inlinemediaobject': { const image = findDeep(node, 'imagedata'); return image ? { t: 'image', c: [], url: image.attrs.fileref ?? '' } : null }
        case 'footnote': return { t: 'note', c: walker.blocks(node.children, 0) }
        case 'superscript': return { t: 'sup', c: recurse(node.children) }
        case 'subscript': return { t: 'sub', c: recurse(node.children) }
        case 'inlineequation': { const math = findDeep(node, 'mathphrase') ?? findDeep(node, 'alt'); return { t: 'math', text: text(math ?? node), display: false } }
        case 'quote': return [str('“'), ...recurse(node.children), str('”')]
        case 'sbr': return linebreak
        case 'indexterm': case 'anchor': case 'remark': return []
        default: return null
      }
    },
    block: (node, depth, self) => {
      switch (node.tag) {
        case 'article': case 'book': case 'part': case 'chapter': case 'preface': case 'appendix': case 'section': case 'sect1': case 'sect2': case 'sect3': case 'sect4': case 'sect5': case 'simplesect': case 'refentry': case 'refsect1': case 'refsect2': case 'refsynopsisdiv': case 'refnamediv': {
          const title = child(node, 'title') ?? (child(node, 'info') ? child(child(node, 'info')!, 'title') : undefined)
          const isRoot = node.tag === 'article' || node.tag === 'book'
          const out: Block[] = []
          const level = isRoot ? depth : depth + 1
          if (title && !isRoot) out.push(header(level, trim(walker.inlines(title.children)), node.attrs['xml:id'] ?? node.attrs.id ?? ''))
          out.push(...self(node.children.filter((c) => c !== title && !isEl(c, 'info', 'articleinfo', 'bookinfo')), isRoot ? depth : level))
          return out
        }
        case 'title': case 'subtitle': case 'info': case 'articleinfo': case 'bookinfo': case 'index': case 'toc': return []
        case 'bridgehead': return [header(depth + 1, trim(walker.inlines(node.children)))]
        case 'para': case 'simpara': { const content = trim(walker.inlines(node.children)); return content.length ? [{ t: 'para', c: content }] : [] }
        case 'formalpara': { const title = child(node, 'title'); const para = child(node, 'para'); return [{ t: 'para', c: [...(title ? [{ t: 'strong', c: trim(walker.inlines(title.children)) } as Inline, str('.'), space] : []), ...(para ? trim(walker.inlines(para.children)) : [])] }] }
        case 'programlisting': case 'screen': case 'literallayout': case 'synopsis': return [{ t: 'code', text: textContent(node).replace(/^\n/, '').replace(/\n$/, ''), lang: node.attrs.language || undefined }]
        case 'itemizedlist': case 'orderedlist': {
          const items = children(node, 'listitem').map((item) => { const inner = self(item.children, depth); if (inner.length && inner[0].t === 'para') inner[0] = { t: 'plain', c: inner[0].c }; return inner })
          return [node.tag === 'orderedlist' ? { t: 'ordered', start: 1, items, tight: true } : { t: 'bullet', items, tight: true }]
        }
        case 'procedure': return [{ t: 'ordered', start: 1, items: children(node, 'step').map((step) => self(step.children, depth)) }]
        case 'variablelist': case 'glosslist': return [{ t: 'deflist', items: children(node, 'varlistentry', 'glossentry').map((entry) => ({ term: trim(walker.inlines((child(entry, 'term') ?? child(entry, 'glossterm'))?.children ?? [])), defs: [self((child(entry, 'listitem') ?? child(entry, 'glossdef'))?.children ?? [], depth)] })) }]
        case 'blockquote': case 'epigraph': return [{ t: 'quote', c: self(node.children.filter((c) => !isEl(c, 'attribution')), depth) }]
        case 'attribution': return [{ t: 'para', c: [str('—'), space, ...trim(walker.inlines(node.children))] }]
        case 'table': case 'informaltable': {
          const rows = [...(findDeep(node, 'thead') ? children(findDeep(node, 'thead')!, 'row', 'tr') : []), ...(findDeep(node, 'tbody') ? children(findDeep(node, 'tbody')!, 'row', 'tr') : [])]
          const headerCount = findDeep(node, 'thead') ? children(findDeep(node, 'thead')!, 'row', 'tr').length : 0
          const table = tableFromRows(rows.length ? rows : children(findDeep(node, 'tgroup') ?? node, 'row', 'tr'), ['entry', 'td'], ['th'], (cell) => trim(walker.inlines(cell.children)), headerCount)
          const title = child(node, 'title') ?? child(node, 'caption')
          if (title && table.t === 'table') table.caption = trim(walker.inlines(title.children))
          return [table]
        }
        case 'figure': case 'informalfigure': case 'mediaobject': {
          const image = findDeep(node, 'imagedata')
          const title = child(node, 'title')
          if (!image) return self(node.children, depth)
          return [{ t: 'para', c: [{ t: 'image', c: title ? trim(walker.inlines(title.children)) : [], url: image.attrs.fileref ?? '' }] }]
        }
        case 'note': case 'warning': case 'tip': case 'caution': case 'important': case 'sidebar': case 'example': {
          const title = child(node, 'title')
          const label = title ? trim(walker.inlines(title.children)) : [str(node.tag[0].toUpperCase() + node.tag.slice(1))]
          return [{ t: 'div', attrs: { classes: [node.tag] }, c: [{ t: 'para', c: [{ t: 'strong', c: label }] }, ...self(node.children.filter((c) => c !== title), depth)] }]
        }
        case 'abstract': return [{ t: 'div', attrs: { classes: ['abstract'] }, c: self(node.children.filter((c) => !isEl(c, 'title')), depth) }]
        case 'equation': case 'informalequation': { const math = findDeep(node, 'mathphrase') ?? findDeep(node, 'alt'); return [{ t: 'para', c: [{ t: 'math', text: text(math ?? node), display: true }] }] }
        case 'bibliography': return [header(depth + 1, [str('Bibliography')]), ...self(node.children.filter((c) => !isEl(c, 'title')), depth)]
        default: return undefined
      }
    },
  })
  const top = findDeep(root, 'article') ?? findDeep(root, 'book') ?? findDeep(root, 'chapter') ?? findDeep(root, 'section') ?? findDeep(root, 'refentry') ?? root
  return { meta, blocks: walker.blocks(top === root ? root.children : [top], 0) }
}

/* -------------------------------------------------------------------- JATS */

const JATS_BLOCKS = new Set(['article', 'book', 'book-part', 'book-body', 'body', 'back', 'front', 'sec', 'title', 'p', 'list', 'list-item', 'def-list', 'def-item', 'term', 'def', 'disp-quote', 'preformat', 'code', 'table-wrap', 'table', 'fig', 'boxed-text', 'disp-formula', 'ack', 'ref-list', 'app', 'app-group', 'abstract', 'caption', 'label', 'fn-group', 'notes', 'sub-article', 'book-part-meta', 'book-meta', 'article-meta', 'journal-meta', 'named-book-part-body', 'toc'])

export function readJats(source: string): Doc {
  const root = parseHtml(source)
  const meta: Meta = {}
  const articleMeta = findDeep(root, 'article-meta') ?? findDeep(root, 'book-meta') ?? findDeep(root, 'book-part-meta')
  if (articleMeta) {
    const title = findDeep(articleMeta, 'article-title') ?? findDeep(articleMeta, 'book-title') ?? findDeep(articleMeta, 'title')
    if (title) meta.title = text(title)
    const contribs = findDeep(articleMeta, 'contrib-group')
    if (contribs) {
      const names = children(contribs, 'contrib').map((contrib) => {
        const name = findDeep(contrib, 'name')
        if (name) return [text(child(name, 'given-names')), text(child(name, 'surname'))].filter(Boolean).join(' ')
        return text(findDeep(contrib, 'string-name') ?? findDeep(contrib, 'collab') ?? contrib)
      }).filter(Boolean)
      if (names.length) meta.author = names.join(', ')
    }
    const date = findDeep(articleMeta, 'pub-date')
    if (date) {
      const parts = [text(child(date, 'year')), text(child(date, 'month')), text(child(date, 'day'))].filter(Boolean)
      meta.date = parts.length ? parts.map((part, index) => (index ? part.padStart(2, '0') : part)).join('-') : text(date)
    }
  }
  const walker = makeWalker({
    isBlock: (tag) => JATS_BLOCKS.has(tag),
    inline: (node, recurse) => {
      switch (node.tag) {
        case 'bold': return { t: 'strong', c: recurse(node.children) }
        case 'italic': return { t: 'emph', c: recurse(node.children) }
        case 'underline': return { t: 'underline', c: recurse(node.children) }
        case 'strike': return { t: 'strike', c: recurse(node.children) }
        case 'sc': return { t: 'smallcaps', c: recurse(node.children) }
        case 'sup': return { t: 'sup', c: recurse(node.children) }
        case 'sub': return { t: 'sub', c: recurse(node.children) }
        case 'monospace': return { t: 'code', text: textContent(node) }
        case 'ext-link': case 'uri': { const url = node.attrs['xlink:href'] ?? textContent(node); const inner = recurse(node.children); return { t: 'link', c: inner.length ? inner : [str(url)], url } }
        case 'xref': return { t: 'link', c: recurse(node.children), url: `#${node.attrs.rid ?? ''}` }
        case 'inline-graphic': case 'graphic': return { t: 'image', c: [], url: node.attrs['xlink:href'] ?? '' }
        case 'fn': return { t: 'note', c: walker.blocks(node.children.filter((c) => !isEl(c, 'label')), 0) }
        case 'inline-formula': { const math = findDeep(node, 'tex-math'); return { t: 'math', text: text(math ?? node).replace(/^\$|\$$/g, ''), display: false } }
        case 'break': return linebreak
        case 'named-content': case 'styled-content': return null
        default: return null
      }
    },
    block: (node, depth, self) => {
      switch (node.tag) {
        case 'article': case 'book': case 'body': case 'book-body': case 'named-book-part-body': case 'sub-article': return self(node.children, depth)
        case 'front': case 'journal-meta': case 'article-meta': case 'book-meta': case 'book-part-meta': case 'toc': return []
        case 'back': return self(node.children, depth)
        case 'sec': case 'book-part': case 'app': case 'app-group': case 'ack': case 'ref-list': case 'notes': case 'fn-group': {
          const title = child(node, 'title') ?? (child(node, 'book-part-meta') ? findDeep(child(node, 'book-part-meta')!, 'title') : undefined)
          const out: Block[] = []
          if (title) out.push(header(depth + 1, trim(walker.inlines(title.children)), node.attrs.id ?? ''))
          out.push(...self(node.children.filter((c) => c !== title && !isEl(c, 'book-part-meta', 'label')), depth + 1))
          return out
        }
        case 'title': case 'label': return []
        case 'p': { const content = trim(walker.inlines(node.children)); return content.length ? [{ t: 'para', c: content }] : [] }
        case 'preformat': case 'code': return [{ t: 'code', text: textContent(node).replace(/^\n/, '').replace(/\n$/, ''), lang: node.attrs.language || undefined }]
        case 'list': {
          const items = children(node, 'list-item').map((item) => { const inner = self(item.children.filter((c) => !isEl(c, 'label')), depth); if (inner.length && inner[0].t === 'para') inner[0] = { t: 'plain', c: inner[0].c }; return inner })
          return [/order|alpha|roman/.test(node.attrs['list-type'] ?? '') ? { t: 'ordered', start: 1, items, tight: true } : { t: 'bullet', items, tight: true }]
        }
        case 'def-list': return [{ t: 'deflist', items: children(node, 'def-item').map((item) => ({ term: trim(walker.inlines(child(item, 'term')?.children ?? [])), defs: [self(child(item, 'def')?.children ?? [], depth)] })) }]
        case 'disp-quote': return [{ t: 'quote', c: self(node.children.filter((c) => !isEl(c, 'attrib')), depth) }]
        case 'table-wrap': {
          const table = findDeep(node, 'table')
          const caption = child(node, 'caption') ?? child(node, 'label')
          const built = table ? readHtmlTable(table, walker.inlines) : null
          if (!built) return self(node.children, depth)
          if (caption && built.t === 'table') built.caption = trim(walker.inlines(caption.children))
          return [built]
        }
        case 'table': return [readHtmlTable(node, walker.inlines)]
        case 'fig': {
          const graphic = findDeep(node, 'graphic')
          const caption = child(node, 'caption')
          if (!graphic) return self(node.children.filter((c) => !isEl(c, 'label')), depth)
          return [{ t: 'para', c: [{ t: 'image', c: caption ? trim(walker.inlines(caption.children)) : [], url: graphic.attrs['xlink:href'] ?? '' }] }]
        }
        case 'boxed-text': return [{ t: 'div', attrs: { classes: ['boxed-text'] }, c: self(node.children, depth) }]
        case 'abstract': return [{ t: 'div', attrs: { classes: ['abstract'] }, c: self(node.children.filter((c) => !isEl(c, 'title')), depth) }]
        case 'disp-formula': { const math = findDeep(node, 'tex-math'); return [{ t: 'para', c: [{ t: 'math', text: text(math ?? node).replace(/^\$+|\$+$/g, ''), display: true }] }] }
        case 'caption': return self(node.children, depth)
        default: return undefined
      }
    },
  })
  return { meta, blocks: walker.blocks(root.children, 0) }
}

function readHtmlTable(table: HtmlElement, inlines: (nodes: HtmlNode[]) => Inline[]): Block {
  const rows: HtmlElement[] = []
  let headerCount = 0
  const collect = (element: HtmlElement) => {
    for (const c of element.children) {
      if (!isEl(c)) continue
      if (c.tag === 'tr') rows.push(c)
      else if (c.tag === 'thead') { const head = children(c, 'tr'); rows.push(...head); headerCount += head.length }
      else if (c.tag === 'tbody' || c.tag === 'tfoot') collect(c)
    }
  }
  collect(table)
  return tableFromRows(rows, ['td'], ['th'], (cell) => trim(inlines(cell.children)), headerCount)
}

/* -------------------------------------------------------------------- OPML */

export function readOpml(source: string): Doc {
  const root = parseHtml(source)
  const meta: Meta = {}
  const head = findDeep(root, 'head')
  if (head) {
    const title = child(head, 'title')
    if (title) meta.title = text(title)
    const created = child(head, 'datecreated') ?? child(head, 'datemodified')
    if (created) meta.date = text(created)
    const owner = child(head, 'ownername')
    if (owner) meta.author = text(owner)
  }
  const body = findDeep(root, 'body') ?? root
  const blocks: Block[] = []
  const walk = (outline: HtmlElement, level: number) => {
    const title = outline.attrs.text ?? outline.attrs.title ?? ''
    blocks.push(header(Math.min(level, 6), readMarkdown(title).blocks.flatMap((block) => ('c' in block && Array.isArray(block.c) && (block.t === 'para' || block.t === 'plain') ? block.c : [])) || textToInlines(title)))
    if (outline.attrs._note) blocks.push(...readMarkdown(outline.attrs._note.replace(/\r\n?/g, '\n')).blocks)
    for (const sub of children(outline, 'outline')) walk(sub, level + 1)
  }
  for (const outline of children(body, 'outline')) walk(outline, 1)
  return { meta, blocks }
}

/* --------------------------------------------------------------------- FB2 */

const FB2_BLOCKS = new Set(['body', 'section', 'title', 'subtitle', 'p', 'empty-line', 'poem', 'stanza', 'v', 'cite', 'epigraph', 'text-author', 'table', 'annotation', 'image', 'date'])

export function readFb2(source: string): Doc {
  const root = parseHtml(source)
  const meta: Meta = {}
  const titleInfo = findDeep(root, 'title-info')
  if (titleInfo) {
    const title = child(titleInfo, 'book-title')
    if (title) meta.title = text(title)
    const author = child(titleInfo, 'author')
    if (author) meta.author = [text(child(author, 'first-name')), text(child(author, 'middle-name')), text(child(author, 'last-name'))].filter(Boolean).join(' ') || text(child(author, 'nickname'))
    const date = child(titleInfo, 'date')
    if (date) meta.date = date.attrs.value ?? text(date)
  }
  const walker = makeWalker({
    isBlock: (tag) => FB2_BLOCKS.has(tag),
    inline: (node, recurse) => {
      switch (node.tag) {
        case 'emphasis': return { t: 'emph', c: recurse(node.children) }
        case 'strong': return { t: 'strong', c: recurse(node.children) }
        case 'strikethrough': return { t: 'strike', c: recurse(node.children) }
        case 'sup': return { t: 'sup', c: recurse(node.children) }
        case 'sub': return { t: 'sub', c: recurse(node.children) }
        case 'code': return { t: 'code', text: textContent(node) }
        case 'a': { const url = node.attrs['l:href'] ?? node.attrs['xlink:href'] ?? node.attrs.href ?? ''; return node.attrs.type === 'note' ? { t: 'note', c: [{ t: 'para', c: recurse(node.children) }] } : { t: 'link', c: recurse(node.children), url } }
        case 'image': return { t: 'image', c: node.attrs.alt ? textToInlines(node.attrs.alt) : [], url: (node.attrs['l:href'] ?? node.attrs['xlink:href'] ?? node.attrs.href ?? '').replace(/^#/, '') }
        case 'style': return null
        default: return null
      }
    },
    block: (node, depth, self) => {
      switch (node.tag) {
        case 'body': return node.attrs.name === 'notes' ? [] : self(node.children, depth)
        case 'section': {
          const title = child(node, 'title')
          const out: Block[] = []
          if (title) out.push(header(depth + 1, trim(walker.inlines(title.children)), node.attrs.id ?? ''))
          out.push(...self(node.children.filter((c) => c !== title), depth + 1))
          return out
        }
        case 'title': return [header(Math.max(1, depth), trim(walker.inlines(node.children)))]
        case 'subtitle': return [header(Math.min(6, depth + 2), trim(walker.inlines(node.children)))]
        case 'p': case 'text-author': { const content = trim(walker.inlines(node.children)); return content.length ? [{ t: 'para', c: content }] : [] }
        case 'empty-line': return []
        case 'poem': case 'stanza': {
          const lines = children(node, 'v').map((v) => trim(walker.inlines(v.children)))
          const rest = self(node.children.filter((c) => !isEl(c, 'v')), depth)
          return lines.length ? [...rest, { t: 'linebl', lines }] : rest
        }
        case 'v': return [{ t: 'linebl', lines: [trim(walker.inlines(node.children))] }]
        case 'cite': case 'epigraph': return [{ t: 'quote', c: self(node.children, depth) }]
        case 'annotation': return [{ t: 'div', attrs: { classes: ['abstract'] }, c: self(node.children, depth) }]
        case 'table': return [readHtmlTable(node, walker.inlines)]
        case 'image': return [{ t: 'para', c: [{ t: 'image', c: [], url: (node.attrs['l:href'] ?? node.attrs['xlink:href'] ?? '').replace(/^#/, '') }] }]
        case 'date': return []
        default: return undefined
      }
    },
  })
  const bodies = (findDeep(root, 'fictionbook') ?? root).children.filter((c) => isEl(c, 'body'))
  return { meta, blocks: walker.blocks(bodies.length ? bodies : root.children, 0) }
}
