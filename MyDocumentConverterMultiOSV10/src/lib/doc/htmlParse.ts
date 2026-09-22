/**
 * A small HTML parser that builds a light element tree.
 *
 * The browser's DOMParser would do, but this runs in the tests under Node and
 * inside the conversion of DOCX/ODT/EPUB where the input is machine-written
 * XHTML; one parser for all of them keeps the readers identical everywhere.
 * It handles what documents contain: nested tags, attributes in any quoting,
 * void elements, entities, comments, CDATA, `<script>`/`<style>` raw text, and
 * the implied closing of `p`, `li`, `td`, `th`, `tr`, `dt`, `dd` and `option`.
 */

export type HtmlNode =
  | { type: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] }
  | { type: 'text'; text: string }
  | { type: 'comment'; text: string }

export type HtmlElement = Extract<HtmlNode, { type: 'element' }>

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])
const CLOSES_P = new Set(['address', 'article', 'aside', 'blockquote', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul'])

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷',
  euro: '€', pound: '£', yen: '¥', cent: '¢', sect: '§', para: '¶', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', hearts: '♥', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '­', zwj: '‍', zwnj: '‌',
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body] ?? ENTITIES[body.toLowerCase()] ?? whole
  })
}

export function encodeEntities(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'))
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g

export function parseHtml(source: string): HtmlElement {
  const root: HtmlElement = { type: 'element', tag: '#root', attrs: {}, children: [] }
  const stack: HtmlElement[] = [root]
  const top = () => stack[stack.length - 1]
  const closeTo = (tag: string) => {
    for (let i = stack.length - 1; i > 0; i -= 1) {
      if (stack[i].tag === tag) {
        stack.length = i
        return true
      }
    }
    return false
  }
  const text = (value: string) => {
    if (!value) return
    top().children.push({ type: 'text', text: decodeEntities(value) })
  }
  let i = 0
  const n = source.length
  while (i < n) {
    const lt = source.indexOf('<', i)
    if (lt < 0) {
      text(source.slice(i))
      break
    }
    if (lt > i) text(source.slice(i, lt))
    i = lt
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4)
      const body = end < 0 ? source.slice(i + 4) : source.slice(i + 4, end)
      top().children.push({ type: 'comment', text: body })
      i = end < 0 ? n : end + 3
      continue
    }
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i)
      text(end < 0 ? source.slice(i + 9) : source.slice(i + 9, end))
      i = end < 0 ? n : end + 3
      continue
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) {
      const end = source.indexOf('>', i)
      i = end < 0 ? n : end + 1
      continue
    }
    const close = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(source.slice(i, i + 200))
    if (close) {
      closeTo(close[1].toLowerCase())
      i += close[0].length
      continue
    }
    const open = /^<([A-Za-z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*(\/?)>/.exec(source.slice(i))
    if (!open) {
      text('<')
      i += 1
      continue
    }
    const tag = open[1].toLowerCase()
    const attrs: Record<string, string> = {}
    for (const match of open[2].matchAll(ATTR)) {
      attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
    }
    i += open[0].length
    // Implied end tags.
    if (CLOSES_P.has(tag) && top().tag === 'p') stack.pop()
    if (tag === 'li') while (top().tag === 'li') stack.pop()
    if (tag === 'dt' || tag === 'dd') while (top().tag === 'dt' || top().tag === 'dd') stack.pop()
    if (tag === 'tr') while (top().tag === 'td' || top().tag === 'th' || top().tag === 'tr') stack.pop()
    if (tag === 'td' || tag === 'th') while (top().tag === 'td' || top().tag === 'th') stack.pop()
    if (tag === 'option') while (top().tag === 'option') stack.pop()
    const element: HtmlElement = { type: 'element', tag, attrs, children: [] }
    top().children.push(element)
    if (open[3] === '/' || VOID.has(tag)) continue
    if (RAW_TEXT.has(tag)) {
      const end = source.toLowerCase().indexOf(`</${tag}`, i)
      const body = end < 0 ? source.slice(i) : source.slice(i, end)
      element.children.push({ type: 'text', text: tag === 'textarea' || tag === 'title' ? decodeEntities(body) : body })
      const gt = end < 0 ? -1 : source.indexOf('>', end)
      i = gt < 0 ? n : gt + 1
      continue
    }
    stack.push(element)
  }
  return root
}

export function findFirst(node: HtmlNode, tag: string): HtmlElement | null {
  if (node.type !== 'element') return null
  if (node.tag === tag) return node
  for (const child of node.children) {
    const found = findFirst(child, tag)
    if (found) return found
  }
  return null
}

export function findAll(node: HtmlNode, tag: string, out: HtmlElement[] = []): HtmlElement[] {
  if (node.type !== 'element') return out
  if (node.tag === tag) out.push(node)
  for (const child of node.children) findAll(child, tag, out)
  return out
}

export function textContent(node: HtmlNode): string {
  if (node.type === 'text') return node.text
  if (node.type === 'comment') return ''
  return node.children.map(textContent).join('')
}
