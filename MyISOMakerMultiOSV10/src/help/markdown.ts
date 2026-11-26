/** The Markdown subset the manuals use (doc/*.md), rendered to HTML for the Help window. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

export type Heading = { id: string; level: number; text: string }

/** The subset the manuals use: # headings, paragraphs, - / 1. lists, tables, ``` code, > notes. */
export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const headings: Heading[] = []
  let i = 0
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      flush()
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i]!.trim().startsWith('```')) code.push(lines[i++]!)
      i += 1
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`)
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed)
    if (h) {
      flush()
      const level = h[1]!.length
      const id = `h-${headings.length}`
      headings.push({ id, level, text: h[2]! })
      out.push(`<h${level} id="${id}">${inline(h[2]!)}</h${level}>`)
      i += 1
      continue
    }
    if (/^\|.*\|$/.test(trimmed)) {
      flush()
      const rows: string[][] = []
      while (i < lines.length && /^\|.*\|$/.test(lines[i]!.trim())) {
        const cells = lines[i]!.trim().slice(1, -1).split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i += 1
      }
      const [head, ...body] = rows
      out.push(
        `<table><thead><tr>${(head ?? []).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table>`,
      )
      continue
    }
    const ul = /^[-*]\s+(.*)$/.exec(trimmed)
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (ul || ol) {
      flush()
      const tag = ul ? 'ul' : 'ol'
      const items: string[] = []
      while (i < lines.length) {
        const tl = lines[i]!.trim()
        const m = ul ? /^[-*]\s+(.*)$/.exec(tl) : /^\d+[.)]\s+(.*)$/.exec(tl)
        if (!m) break
        items.push(`<li>${inline(m[1]!)}</li>`)
        i += 1
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    if (trimmed.startsWith('>')) {
      flush()
      const note: string[] = []
      while (i < lines.length && lines[i]!.trim().startsWith('>')) note.push(lines[i++]!.trim().replace(/^>\s?/, ''))
      out.push(`<blockquote>${inline(note.join(' '))}</blockquote>`)
      continue
    }
    if (!trimmed) flush()
    else para.push(trimmed)
    i += 1
  }
  flush()
  return { html: out.join('\n'), headings }
}

