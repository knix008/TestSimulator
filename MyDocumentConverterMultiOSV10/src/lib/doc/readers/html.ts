/**
 * HTML reader. Walks the element tree from `htmlParse` and folds it into
 * blocks and inlines; anything without a counterpart in the model (a `<div>`
 * around content, a `<span>` with a class) is transparent, so its children
 * are kept and only the wrapper is lost.
 */
import type { Alignment, Block, Doc, Inline, Meta } from '../ast'
import { header, linebreak, softbreak, space, str } from '../ast'
import { parseHtml, textContent, type HtmlElement, type HtmlNode } from '../htmlParse'

const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'body', 'center', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'html', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'math', 'svg'])
const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template', 'nav', 'button', 'input', 'select', 'textarea', 'iframe'])

export function readHtml(source: string): Doc {
  const root = parseHtml(source)
  const meta: Meta = {}
  const titleNode = findTag(root, 'title')
  if (titleNode) meta.title = textContent(titleNode).trim()
  for (const node of allElements(root)) {
    if (node.tag === 'meta') {
      const name = (node.attrs.name ?? '').toLowerCase()
      if (name === 'author') meta.author = node.attrs.content ?? ''
      if (name === 'date' || name === 'dcterms.date') meta.date = node.attrs.content ?? ''
      if (name === 'description') meta.description = node.attrs.content ?? ''
    }
  }
  const body = findTag(root, 'body') ?? root
  const blocks = blocksOf(body.children)
  return { meta, blocks }
}

function findTag(node: HtmlNode, tag: string): HtmlElement | null {
  if (node.type !== 'element') return null
  if (node.tag === tag) return node
  for (const child of node.children) {
    const found = findTag(child, tag)
    if (found) return found
  }
  return null
}

function* allElements(node: HtmlNode): Generator<HtmlElement> {
  if (node.type !== 'element') return
  yield node
  for (const child of node.children) yield* allElements(child)
}

function isBlockNode(node: HtmlNode) {
  return node.type === 'element' && BLOCK_TAGS.has(node.tag)
}

/** Turns a run of children into blocks, wrapping loose inline runs in paragraphs. */
export function blocksOf(children: HtmlNode[]): Block[] {
  const out: Block[] = []
  let run: HtmlNode[] = []
  const flushRun = () => {
    if (!run.length) return
    const inlines = trim(inlinesOf(run))
    if (inlines.length) out.push({ t: 'para', c: inlines })
    run = []
  }
  for (const child of children) {
    if (child.type === 'comment') continue
    if (child.type === 'element' && SKIP.has(child.tag)) continue
    if (isBlockNode(child)) {
      flushRun()
      out.push(...blockOf(child as HtmlElement))
    } else if (child.type === 'text' && child.text.trim() === '' && run.length === 0) {
      continue
    } else {
      run.push(child)
    }
  }
  flushRun()
  return out
}

function blockOf(node: HtmlElement): Block[] {
  const tag = node.tag
  switch (tag) {
    case 'p': {
      const inlines = trim(inlinesOf(node.children))
      return inlines.length ? [{ t: 'para', c: inlines }] : []
    }
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return [header(Number(tag[1]), trim(inlinesOf(node.children)), node.attrs.id ?? '')]
    case 'pre': {
      const codeChild = node.children.find((child): child is HtmlElement => child.type === 'element' && child.tag === 'code')
      const lang = languageOf(codeChild ?? node)
      return [{ t: 'code', text: textContent(node).replace(/^\n/, '').replace(/\n$/, ''), lang }]
    }
    case 'blockquote':
      return [{ t: 'quote', c: blocksOf(node.children) }]
    case 'ul':
    case 'ol': {
      const items = node.children.filter((child): child is HtmlElement => child.type === 'element' && child.tag === 'li')
      const tasks: (boolean | null)[] = []
      const parsed = items.map((item) => {
        const checkbox = item.children.find((child): child is HtmlElement => child.type === 'element' && child.tag === 'input' && (child.attrs.type ?? '').toLowerCase() === 'checkbox')
        tasks.push(checkbox ? 'checked' in checkbox.attrs : null)
        const children = checkbox ? item.children.filter((child) => child !== checkbox) : item.children
        const blocks = blocksOf(children)
        // A tight list item is a `plain`, which writers render without a paragraph gap.
        if (blocks.length >= 1 && blocks[0].t === 'para' && !item.children.some((child) => child.type === 'element' && child.tag === 'p')) blocks[0] = { t: 'plain', c: blocks[0].c }
        return blocks
      })
      if (tag === 'ol') {
        const start = Number(node.attrs.start) || 1
        const type = node.attrs.type
        const style = type === 'a' ? 'lower-alpha' : type === 'A' ? 'upper-alpha' : type === 'i' ? 'lower-roman' : type === 'I' ? 'upper-roman' : 'decimal'
        return [{ t: 'ordered', start, items: parsed, style }]
      }
      return [{ t: 'bullet', items: parsed, tasks: tasks.some((task) => task !== null) ? tasks : undefined }]
    }
    case 'dl': {
      const items: { term: Inline[]; defs: Block[][] }[] = []
      for (const child of node.children) {
        if (child.type !== 'element') continue
        if (child.tag === 'dt') items.push({ term: trim(inlinesOf(child.children)), defs: [] })
        if (child.tag === 'dd') {
          if (!items.length) items.push({ term: [], defs: [] })
          items[items.length - 1].defs.push(blocksOf(child.children))
        }
      }
      return [{ t: 'deflist', items }]
    }
    case 'hr':
      return [{ t: 'hr' }]
    case 'table':
      return [tableOf(node)]
    case 'figure': {
      const blocks = blocksOf(node.children.filter((child) => !(child.type === 'element' && child.tag === 'figcaption')))
      const caption = node.children.find((child): child is HtmlElement => child.type === 'element' && child.tag === 'figcaption')
      if (caption && blocks.length === 1 && blocks[0].t === 'para' && blocks[0].c.length === 1 && blocks[0].c[0].t === 'image') {
        const image = blocks[0].c[0]
        return [{ t: 'para', c: [{ ...image, c: trim(inlinesOf(caption.children)) }] }]
      }
      return blocks
    }
    case 'math':
    case 'svg':
      return [{ t: 'raw', format: 'html', text: serialize(node) }]
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'aside':
    case 'header':
    case 'footer':
    case 'body':
    case 'html':
    case 'details':
    case 'summary':
    case 'address':
    case 'center':
    case 'fieldset':
    case 'form':
    case 'dialog':
    case 'figcaption':
    case 'dt':
    case 'dd':
    case 'li':
    case 'tbody':
    case 'thead':
    case 'tfoot':
    case 'tr':
    case 'td':
    case 'th':
      return blocksOf(node.children)
    default:
      return blocksOf(node.children)
  }
}

function languageOf(node: HtmlElement): string | undefined {
  const classes = (node.attrs.class ?? '').split(/\s+/)
  for (const cls of classes) {
    const match = /^(?:language-|lang-|sourceCode\s+)?([\w+#-]+)$/.exec(cls)
    if (match && !['sourceCode', 'highlight', 'hljs', 'code'].includes(match[1])) return match[1]
  }
  return node.attrs['data-lang'] || undefined
}

function tableOf(node: HtmlElement): Block {
  const rows: HtmlElement[] = []
  let caption: Inline[] = []
  const collect = (element: HtmlElement) => {
    for (const child of element.children) {
      if (child.type !== 'element') continue
      if (child.tag === 'tr') rows.push(child)
      else if (child.tag === 'caption') caption = trim(inlinesOf(child.children))
      else if (child.tag === 'thead' || child.tag === 'tbody' || child.tag === 'tfoot') collect(child)
    }
  }
  collect(node)
  const cellsOf = (row: HtmlElement) => row.children.filter((child): child is HtmlElement => child.type === 'element' && (child.tag === 'td' || child.tag === 'th'))
  let header: Inline[][] = []
  let bodyRows = rows
  if (rows.length && cellsOf(rows[0]).every((cell) => cell.tag === 'th') && cellsOf(rows[0]).length) {
    header = cellsOf(rows[0]).map((cell) => cellInlines(cell))
    bodyRows = rows.slice(1)
  }
  const width = Math.max(header.length, ...bodyRows.map((row) => cellsOf(row).length), 1)
  const aligns: Alignment[] = []
  const alignOf = (cell: HtmlElement | undefined) => {
    const align = cell ? (cell.attrs.align ?? /text-align:\s*(left|center|right)/.exec(cell.attrs.style ?? '')?.[1] ?? '') : ''
    return align === 'left' || align === 'center' || align === 'right' ? align : 'default'
  }
  const headerCells = rows.length && header.length ? cellsOf(rows[0]) : []
  const sample = bodyRows[0] ? cellsOf(bodyRows[0]) : []
  for (let i = 0; i < width; i += 1) {
    const fromHeader = alignOf(headerCells[i])
    aligns.push(fromHeader !== 'default' ? fromHeader : alignOf(sample[i]))
  }
  const pad = (cells: Inline[][]) => {
    while (cells.length < width) cells.push([])
    return cells.slice(0, width)
  }
  return {
    t: 'table',
    caption,
    aligns,
    header: pad(header),
    rows: bodyRows.map((row) => pad(cellsOf(row).map(cellInlines))),
  }
}

function cellInlines(cell: HtmlElement): Inline[] {
  // A cell may hold paragraphs; they are joined with line breaks.
  const blocks = blocksOf(cell.children)
  const out: Inline[] = []
  for (const block of blocks) {
    if (out.length) out.push(linebreak)
    if (block.t === 'para' || block.t === 'plain' || block.t === 'header') out.push(...block.c)
    else if (block.t === 'code') out.push({ t: 'code', text: block.text })
    else out.push(...textToInlines(blockText(block)))
  }
  return trim(out)
}

function blockText(block: Block): string {
  if (block.t === 'para' || block.t === 'plain' || block.t === 'header') return inlinesText(block.c)
  if (block.t === 'code') return block.text
  if (block.t === 'bullet' || block.t === 'ordered') return block.items.map((item) => item.map(blockText).join(' ')).join('; ')
  if (block.t === 'quote' || block.t === 'div') return block.c.map(blockText).join(' ')
  return ''
}

function inlinesText(inlines: Inline[]): string {
  return inlines.map((inline) => (inline.t === 'str' ? inline.text : inline.t === 'space' || inline.t === 'softbreak' ? ' ' : inline.t === 'code' ? inline.text : 'c' in inline && Array.isArray(inline.c) && inline.t !== 'note' ? inlinesText(inline.c as Inline[]) : '')).join('')
}

function textToInlines(text: string): Inline[] {
  const out: Inline[] = []
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part)) out.push(space)
    else out.push(str(part))
  }
  return out
}

/* ----------------------------------------------------------------- inlines */

export function inlinesOf(children: HtmlNode[], pre = false): Inline[] {
  const out: Inline[] = []
  for (const child of children) {
    if (child.type === 'comment') continue
    if (child.type === 'text') {
      pushText(out, child.text, pre)
      continue
    }
    const node = child
    if (SKIP.has(node.tag)) continue
    switch (node.tag) {
      case 'br':
        out.push(linebreak)
        break
      case 'em': case 'i': case 'cite': case 'dfn': case 'var':
        out.push({ t: 'emph', c: inlinesOf(node.children, pre) })
        break
      case 'strong': case 'b':
        out.push({ t: 'strong', c: inlinesOf(node.children, pre) })
        break
      case 'del': case 's': case 'strike':
        out.push({ t: 'strike', c: inlinesOf(node.children, pre) })
        break
      case 'u': case 'ins':
        out.push({ t: 'underline', c: inlinesOf(node.children, pre) })
        break
      case 'sup':
        out.push({ t: 'sup', c: inlinesOf(node.children, pre) })
        break
      case 'sub':
        out.push({ t: 'sub', c: inlinesOf(node.children, pre) })
        break
      case 'code': case 'kbd': case 'samp': case 'tt':
        out.push({ t: 'code', text: textContent(node) })
        break
      case 'a': {
        const inner = inlinesOf(node.children, pre)
        const href = node.attrs.href ?? ''
        if (href) out.push({ t: 'link', c: inner.length ? inner : [str(href)], url: href, title: node.attrs.title || undefined })
        else out.push(...inner)
        break
      }
      case 'img':
        out.push({ t: 'image', c: node.attrs.alt ? textToInlines(node.attrs.alt) : [], url: node.attrs.src ?? '', title: node.attrs.title || undefined })
        break
      case 'span': {
        const classes = (node.attrs.class ?? '').split(/\s+/)
        const inner = inlinesOf(node.children, pre)
        if (classes.includes('math')) out.push({ t: 'math', text: textContent(node).replace(/^\\[([]|[\\]|^\$+|\$+$/g, '').trim(), display: classes.includes('display') })
        else if (classes.includes('smallcaps') || /font-variant:\s*small-caps/.test(node.attrs.style ?? '')) out.push({ t: 'smallcaps', c: inner })
        else if (/font-weight:\s*(bold|[6-9]00)/.test(node.attrs.style ?? '')) out.push({ t: 'strong', c: inner })
        else if (/font-style:\s*italic/.test(node.attrs.style ?? '')) out.push({ t: 'emph', c: inner })
        else out.push(...inner)
        break
      }
      case 'q':
        out.push(str('“'), ...inlinesOf(node.children, pre), str('”'))
        break
      case 'math':
      case 'svg':
        out.push({ t: 'raw', format: 'html', text: serialize(node) })
        break
      case 'p':
      case 'div':
        // Block content inside an inline run: separate it with a break.
        if (out.length) out.push(linebreak)
        out.push(...inlinesOf(node.children, pre))
        break
      default:
        out.push(...inlinesOf(node.children, pre || node.tag === 'pre'))
    }
  }
  return out
}

function pushText(out: Inline[], text: string, pre: boolean) {
  const value = pre ? text : text.replace(/[ \t\r\n]+/g, ' ')
  for (const part of value.split(/( |\n)/)) {
    if (!part) continue
    if (part === ' ') {
      const last = out[out.length - 1]
      if (last && (last.t === 'space' || last.t === 'softbreak' || last.t === 'linebreak')) continue
      out.push(space)
    } else if (part === '\n') {
      out.push(softbreak)
    } else {
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

function serialize(node: HtmlNode): string {
  if (node.type === 'text') return node.text.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'))
  if (node.type === 'comment') return `<!--${node.text}-->`
  const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${key}="${value.replace(/"/g, '&quot;')}"`).join('')
  if (!node.children.length && ['br', 'img', 'hr', 'path', 'circle', 'rect', 'line', 'use'].includes(node.tag)) return `<${node.tag}${attrs}/>`
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`
}
