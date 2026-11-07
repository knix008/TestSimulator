// The editor's page back to Markdown. Headings, lists (also checklists and nested ones), tables,
// quotes, code, links, pictures with their size, and bold / italic / strike / underline survive.

const attrEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Tags with a Markdown block of their own: a container holding one is walked as blocks. */
const BLOCK_TAG = /^(address|article|aside|blockquote|details|div|dl|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|ul)$/

function mediaWidth(node: Element) {
  const attr = node.getAttribute('width')
  if (attr && /^\d+$/.test(attr.trim())) return attr.trim()
  const match = (node as HTMLElement).style?.width?.match(/^(\d+(?:\.\d+)?)px$/)
  return match ? String(Math.round(Number.parseFloat(match[1]))) : ''
}

function imageMarkup(node: Element) {
  // A file beside the minutes is saved by its name, not by the address it is shown from.
  const src = node.getAttribute('data-asset') || node.getAttribute('src') || ''
  if (!src) return ''
  const alt = node.getAttribute('alt') || ''
  const width = mediaWidth(node)
  return width ? `<img src="${src}" alt="${attrEsc(alt)}" width="${width}">` : `![${alt}](${src})`
}

function mediaMarkup(node: Element) {
  const tag = node.tagName.toLowerCase()
  const source = node.querySelector('source')
  const src = node.getAttribute('data-asset') || node.getAttribute('src') || source?.getAttribute('data-asset') || source?.getAttribute('src') || ''
  if (!src) return ''
  const width = tag === 'video' ? mediaWidth(node) : ''
  return `<${tag} src="${src}" controls${width ? ` width="${width}"` : ''}></${tag}>`
}

const hasBlockChild = (node: Element) => Array.from(node.children).some((child) => BLOCK_TAG.test(child.tagName.toLowerCase()))

function blocksOf(node: Node, depth = 0): string[] {
  const out: string[] = []
  node.childNodes.forEach((child) => {
    const block = serializeBlock(child, depth)
    if (block.trim()) out.push(block)
  })
  return out
}

function container(node: Element, depth: number) {
  return hasBlockChild(node) ? blocksOf(node, depth).join('\n\n') : paragraph(node)
}

function serializeBlock(node: Node, depth: number): string {
  if (node.nodeType === 3) return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (node.nodeType !== 1) return ''
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  switch (tag) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
      return `${'#'.repeat(Number(tag[1]))} ${inline(element).replace(/\n/g, ' ')}`
    case 'blockquote':
      return blocksOf(element).join('\n\n').split('\n').map((line) => `> ${line}`).join('\n')
    case 'pre':
      return `\`\`\`\n${(element.textContent ?? '').replace(/\n+$/, '')}\n\`\`\``
    case 'ul': return list(element, false, depth)
    case 'ol': return list(element, true, depth)
    case 'hr': return '---'
    case 'table': return table(element)
    case 'img': return imageMarkup(element)
    case 'video': case 'audio': return mediaMarkup(element)
    case 'br': return ''
    default: return container(element, depth)
  }
}

function list(node: Element, ordered: boolean, depth: number): string {
  const items: string[] = []
  let n = Number(node.getAttribute('start')) || 1
  for (const li of Array.from(node.children)) {
    if (li.tagName.toLowerCase() !== 'li') continue
    let text = ''
    let check = ''
    const nested: Element[] = []
    li.childNodes.forEach((child) => {
      const el = child.nodeType === 1 ? (child as Element) : null
      if (el?.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'checkbox') check = (el as HTMLInputElement).checked || el.hasAttribute('checked') ? '[x] ' : '[ ] '
      else if (el && /^(ul|ol)$/i.test(el.tagName)) nested.push(el)
      else if (el?.tagName.toLowerCase() === 'p') text += (text ? '\n' : '') + inline(el)
      else text += inlineNode(child)
    })
    const indent = '  '.repeat(depth)
    const marker = ordered ? `${n}. ` : '- '
    const body = (check + text).replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim().replace(/\n/g, `  \n${indent}${' '.repeat(marker.length)}`)
    items.push(indent + marker + body)
    nested.forEach((inner) => items.push(list(inner, inner.tagName.toLowerCase() === 'ol', depth + 1)))
    n++
  }
  return items.join('\n')
}

function table(node: Element): string {
  const rows = Array.from(node.querySelectorAll('tr'))
  if (!rows.length) return ''
  const cells = (row: Element) => Array.from(row.querySelectorAll('th,td')).map((c) => inline(c).replace(/\|/g, '\\|').replace(/\n/g, '<br>') || ' ')
  const head = cells(rows[0])
  const cols = head.length || 1
  const lines = [`| ${head.join(' | ')} |`, `| ${Array(cols).fill('---').join(' | ')} |`]
  for (const row of rows.slice(1)) {
    const line = cells(row)
    while (line.length < cols) line.push(' ')
    lines.push(`| ${line.join(' | ')} |`)
  }
  return lines.join('\n')
}

/** Newlines here are real <br>s: only spaces and tabs are squeezed. */
function inline(node: Node) {
  let s = ''
  node.childNodes.forEach((child) => {
    s += inlineNode(child)
  })
  return s.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

/** A <br> becomes a Markdown hard break, so Shift+Enter survives. */
const paragraph = (node: Element) => inline(node).replace(/\n/g, '  \n')

function inlineNode(node: Node): string {
  if (node.nodeType === 3) return (node.textContent ?? '').replace(/\s+/g, ' ')
  if (node.nodeType !== 1) return ''
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  const inner = () => {
    let s = ''
    element.childNodes.forEach((child) => {
      s += inlineNode(child)
    })
    return s
  }
  const wrap = (mark: string, close = mark) => {
    const text = inner()
    const trimmed = text.trim()
    if (!trimmed) return text
    // The marks must touch the words, or Markdown does not see them.
    const lead = text.match(/^\s*/)![0]
    const tail = text.match(/\s*$/)![0]
    return `${lead}${mark}${trimmed}${close}${tail}`
  }
  switch (tag) {
    case 'strong': case 'b': return wrap('**')
    case 'em': case 'i': return wrap('*')
    case 'del': case 's': case 'strike': return wrap('~~')
    case 'u': case 'ins': return wrap('<u>', '</u>')
    case 'code': return `\`${element.textContent ?? ''}\``
    case 'a': return `[${inner()}](${element.getAttribute('href') || ''})`
    case 'br': return '\n'
    case 'img': return imageMarkup(element)
    case 'video': case 'audio': return mediaMarkup(element)
    case 'span': {
      // execCommand can write styles instead of tags.
      const style = (element as HTMLElement).style
      let text = inner()
      if (!text.trim()) return text
      if (style?.fontWeight === 'bold' || Number(style?.fontWeight) >= 600) text = `**${text.trim()}**`
      if (style?.fontStyle === 'italic') text = `*${text.trim()}*`
      if (style?.textDecoration?.includes('underline')) text = `<u>${text.trim()}</u>`
      if (style?.textDecoration?.includes('line-through')) text = `~~${text.trim()}~~`
      return text
    }
    default: return inner()
  }
}

export function htmlToMarkdown(root: Element): string {
  return blocksOf(root).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}
