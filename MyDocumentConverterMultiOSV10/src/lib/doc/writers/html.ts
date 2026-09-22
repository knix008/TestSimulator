/**
 * HTML writer. Also the base of the preview pane, the PDF output, printing
 * and EPUB chapters, so it is careful to produce self-contained, valid
 * markup with a stylesheet that reads well on paper as on screen.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { encodeEntities } from '../htmlParse'
import { applyLineEnding, type WriterOptions } from '../options'

type State = { options: WriterOptions; notes: string[]; numbers: number[] }

const esc = encodeEntities

export function writeHtml(doc: Doc, options: WriterOptions): string {
  const body = htmlBody(doc, options)
  if (!options.standalone) return applyLineEnding(body, options)
  return applyLineEnding(htmlDocument(doc, body, options), options)
}

/** The body markup alone: the TOC, the content and the footnotes. */
export function htmlBody(doc: Doc, options: WriterOptions): string {
  const state: State = { options, notes: [], numbers: [] }
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && (meta.title || meta.author || meta.date)) {
    parts.push('<header id="title-block-header">')
    if (meta.title) parts.push(`<h1 class="title">${esc(meta.title)}</h1>`)
    if (meta.author) parts.push(`<p class="author">${esc(meta.author)}</p>`)
    if (meta.date) parts.push(`<p class="date">${esc(meta.date)}</p>`)
    parts.push('</header>')
  }
  if (options.toc) {
    const toc = tocHtml(doc, options.tocDepth)
    if (toc) parts.push(`<nav id="TOC" role="doc-toc">\n${toc}\n</nav>`)
  }
  parts.push(blocksHtml(doc.blocks, state))
  if (state.notes.length) {
    parts.push(`<section id="footnotes" class="footnotes" role="doc-endnotes">\n<hr />\n<ol>\n${state.notes.map((note, index) => `<li id="fn${index + 1}">${note} <a href="#fnref${index + 1}" class="footnote-back" role="doc-backlink">↩︎</a></li>`).join('\n')}\n</ol>\n</section>`)
  }
  return parts.join('\n')
}

export function metaOf(doc: Doc, options: WriterOptions) {
  return {
    ...doc.meta,
    title: options.title || doc.meta.title || '',
    author: options.author || doc.meta.author || '',
    date: options.date || doc.meta.date || '',
  }
}

function tocHtml(doc: Doc, depth: number): string {
  const items = doc.blocks.filter((block): block is Extract<Block, { t: 'header' }> => block.t === 'header' && block.level <= depth)
  if (!items.length) return ''
  let html = ''
  let level = 0
  for (const item of items) {
    while (level < item.level) { html += level === 0 ? '<ul>' : '<ul>'; level += 1 }
    while (level > item.level) { html += '</li></ul>'; level -= 1 }
    if (html.endsWith('</li>')) html = html.slice(0, -5)
    html += `${html.endsWith('<ul>') ? '' : '</li>'}<li><a href="#${esc(item.id)}">${esc(inlinesToText(item.c))}</a></li>`
  }
  while (level > 0) { html += '</li></ul>'; level -= 1 }
  return html.replace(/<\/li><\/li>/g, '</li>').replace(/<ul><\/li>/g, '<ul>')
}

export function htmlDocument(doc: Doc, body: string, options: WriterOptions): string {
  const meta = metaOf(doc, options)
  const head = [
    '<!DOCTYPE html>',
    '<html lang="">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="generator" content="My Document Converter" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${esc(meta.title || 'Document')}</title>`,
  ]
  if (meta.author) head.push(`<meta name="author" content="${esc(meta.author)}" />`)
  if (meta.date) head.push(`<meta name="dcterms.date" content="${esc(meta.date)}" />`)
  const css = stylesheet(options)
  if (css) head.push(`<style>\n${css}\n</style>`)
  if (options.htmlMath && /class="math/.test(body)) {
    head.push('<script>window.MathJax = { tex: { inlineMath: [["\\\\(", "\\\\)"]], displayMath: [["\\\\[", "\\\\]"]] } };</script>')
    head.push('<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>')
  }
  head.push('</head>', '<body>', body, '</body>', '</html>')
  return `${head.join('\n')}\n`
}

const BASE_CSS = `
html { color: #1a1a1a; background-color: #fdfdfd; }
body { margin: 0 auto; max-width: 40em; padding: 40px 50px; hyphens: auto; overflow-wrap: break-word; text-rendering: optimizeLegibility; font-kerning: normal; font-family: Georgia, "Noto Serif", "Malgun Gothic", serif; font-size: 16px; line-height: 1.6; }
@media (max-width: 600px) { body { font-size: 0.9em; padding: 12px; } h1 { font-size: 1.8em; } }
@media print { html { background-color: white; } body { background-color: transparent; color: black; font-size: 12pt; padding: 0; max-width: none; } p { orphans: 3; widows: 3; } h2, h3, h4 { page-break-after: avoid; } }
p { margin: 1em 0; }
a { color: #1a5fb4; } a:visited { color: #5e3a9e; }
img { max-width: 100%; }
h1, h2, h3, h4, h5, h6 { margin-top: 1.4em; line-height: 1.25; }
h5, h6 { font-size: 1em; font-style: italic; }
h6 { font-weight: normal; }
ol, ul { padding-left: 1.7em; margin-top: 1em; }
li > ol, li > ul { margin-top: 0; }
blockquote { margin: 1em 0 1em 1.7em; padding-left: 1em; border-left: 2px solid #e6e6e6; color: #606060; }
code { font-family: Menlo, Monaco, Consolas, "Lucida Console", monospace; font-size: 85%; margin: 0; hyphens: manual; }
pre { margin: 1em 0; overflow: auto; padding: 0.8em 1em; background: #f4f4f4; border-radius: 4px; }
pre code { padding: 0; overflow: visible; overflow-wrap: normal; }
.sourceCode { background-color: transparent; overflow: visible; }
hr { background-color: #1a1a1a; border: none; height: 1px; margin: 1em 0; }
table { margin: 1em 0; border-collapse: collapse; width: 100%; overflow-x: auto; display: block; font-variant-numeric: lining-nums tabular-nums; }
table caption { margin-bottom: 0.75em; }
tbody { margin-top: 0.5em; border-top: 1px solid #1a1a1a; border-bottom: 1px solid #1a1a1a; }
th { border-top: 1px solid #1a1a1a; padding: 0.25em 0.5em 0.25em 0.5em; }
td { padding: 0.125em 0.5em 0.25em 0.5em; }
header { margin-bottom: 4em; text-align: center; }
#TOC li { list-style: none; }
#TOC ul { padding-left: 1.3em; }
#TOC > ul { padding-left: 0; }
#TOC a:not(:hover) { text-decoration: none; }
div.abstract, div.note, div.warning, div.tip, div.important, div.caution, div.example, div.sidebar { border-left: 4px solid #1a5fb4; background: #f0f5fc; padding: 0.5em 1em; margin: 1em 0; }
div.warning, div.caution { border-color: #c64600; background: #fff4ec; }
.task-list-item input { margin-right: 0.5em; }
.line-block { white-space: pre-line; }
.footnotes { font-size: 0.9em; }
.footnotes ol { padding-left: 1.5em; }
dl dt { font-weight: bold; margin-top: 0.7em; }
dl dd { margin-left: 1.7em; }
sup, sub { line-height: 0; }
.smallcaps { font-variant: small-caps; }
.underline { text-decoration: underline; }
`

const GITHUB_CSS = `
html { background: #ffffff; }
body { margin: 0 auto; max-width: 980px; padding: 45px; font-family: -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #1f2328; overflow-wrap: break-word; }
h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid #d0d7de; }
h3 { font-size: 1.25em; } h4 { font-size: 1em; } h5 { font-size: 0.875em; } h6 { font-size: 0.85em; color: #59636e; }
p, blockquote, ul, ol, dl, table, pre { margin-top: 0; margin-bottom: 16px; }
a { color: #0969da; text-decoration: none; } a:hover { text-decoration: underline; }
img { max-width: 100%; }
blockquote { padding: 0 1em; color: #59636e; border-left: 0.25em solid #d0d7de; }
ul, ol { padding-left: 2em; }
code { padding: 0.2em 0.4em; margin: 0; font-size: 85%; background-color: #f6f8fa; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
pre { padding: 16px; overflow: auto; font-size: 85%; line-height: 1.45; background-color: #f6f8fa; border-radius: 6px; }
pre code { padding: 0; background: transparent; font-size: 100%; }
table { border-spacing: 0; border-collapse: collapse; display: block; width: max-content; max-width: 100%; overflow: auto; }
table th { font-weight: 600; } table th, table td { padding: 6px 13px; border: 1px solid #d0d7de; }
table tr { background-color: #ffffff; border-top: 1px solid #d0d7de; } table tr:nth-child(2n) { background-color: #f6f8fa; }
hr { height: 0.25em; padding: 0; margin: 24px 0; background-color: #d0d7de; border: 0; }
header { text-align: center; margin-bottom: 2em; } header h1 { border: none; }
#TOC li { list-style: none; } #TOC ul { padding-left: 1.3em; } #TOC > ul { padding-left: 0; }
div.note, div.warning, div.tip, div.important, div.caution, div.example, div.sidebar, div.abstract { border-left: 4px solid #0969da; background: #f6f8fa; padding: 0.5em 1em; margin: 1em 0; }
div.warning, div.caution { border-color: #bc4c00; background: #fff8f2; }
dl dt { font-weight: 600; margin-top: 16px; } dl dd { margin-left: 0; padding-left: 16px; }
.smallcaps { font-variant: small-caps; } .underline { text-decoration: underline; }
.line-block { white-space: pre-line; }
`

const MINIMAL_CSS = `
body { font-family: system-ui, "Malgun Gothic", sans-serif; line-height: 1.5; max-width: 45em; margin: 2em auto; padding: 0 1em; }
pre { background: #f2f2f2; padding: 0.7em; overflow: auto; }
code { font-family: Consolas, Menlo, monospace; }
table { border-collapse: collapse; } th, td { border: 1px solid #999; padding: 0.3em 0.6em; }
blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
img { max-width: 100%; }
`

const PRINT_CSS = `
body { font-family: "Times New Roman", "Batang", serif; font-size: 12pt; line-height: 1.45; max-width: none; margin: 0; padding: 0; color: #000; }
h1 { font-size: 20pt; } h2 { font-size: 16pt; } h3 { font-size: 14pt; } h4, h5, h6 { font-size: 12pt; }
h1, h2, h3, h4, h5, h6 { page-break-after: avoid; margin-top: 1.2em; }
pre { font-size: 10pt; border: 1px solid #999; padding: 0.6em; white-space: pre-wrap; page-break-inside: avoid; }
code { font-family: "Courier New", Consolas, monospace; font-size: 10pt; }
table { border-collapse: collapse; width: 100%; page-break-inside: avoid; } th, td { border: 1px solid #000; padding: 0.25em 0.5em; }
blockquote { margin-left: 2em; }
img { max-width: 100%; }
a { color: inherit; text-decoration: none; }
header { text-align: center; margin-bottom: 2em; }
`

export function stylesheet(options: WriterOptions): string {
  switch (options.htmlStyle) {
    case 'none': return ''
    case 'github': return GITHUB_CSS.trim()
    case 'minimal': return MINIMAL_CSS.trim()
    case 'print': return PRINT_CSS.trim()
    default: return BASE_CSS.trim()
  }
}

/* ------------------------------------------------------------------ blocks */

export function blocksHtml(list: Block[], state: State): string {
  if (state.options.htmlSectionDivs) return sectioned(list, state)
  return list.map((block) => blockHtml(block, state)).filter(Boolean).join('\n')
}

/** Wraps each heading and what follows it in a <section>, like Pandoc's --section-divs. */
function sectioned(list: Block[], state: State): string {
  const out: string[] = []
  const stack: number[] = []
  for (const block of list) {
    if (block.t === 'header') {
      while (stack.length && stack[stack.length - 1] >= block.level) {
        out.push('</section>')
        stack.pop()
      }
      out.push(`<section id="${esc(block.id)}" class="level${block.level}">`)
      stack.push(block.level)
      out.push(blockHtml({ ...block, id: '' }, state))
      continue
    }
    out.push(blockHtml(block, state))
  }
  while (stack.length) { out.push('</section>'); stack.pop() }
  return out.filter(Boolean).join('\n')
}

function blockHtml(block: Block, state: State): string {
  switch (block.t) {
    case 'para':
      return `<p>${inlinesHtml(block.c, state)}</p>`
    case 'plain':
      return inlinesHtml(block.c, state)
    case 'header': {
      let text = inlinesHtml(block.c, state)
      if (state.options.numberSections) {
        const numbers = state.numbers
        while (numbers.length < block.level) numbers.push(0)
        numbers.length = block.level
        numbers[block.level - 1] += 1
        text = `<span class="header-section-number">${numbers.join('.')}</span> ${text}`
      }
      return `<h${block.level}${block.id ? ` id="${esc(block.id)}"` : ''}>${text}</h${block.level}>`
    }
    case 'code':
      return `<pre class="sourceCode${block.lang ? ` ${esc(block.lang)}` : ''}"><code${block.lang ? ` class="language-${esc(block.lang)}"` : ''}>${esc(block.text)}</code></pre>`
    case 'quote':
      return `<blockquote>\n${blocksHtml(block.c, state)}\n</blockquote>`
    case 'bullet': {
      const items = block.items.map((item, index) => {
        const task = block.tasks?.[index]
        const inner = blocksHtml(item, state)
        if (task === undefined || task === null) return `<li>${inner}</li>`
        return `<li class="task-list-item"><input type="checkbox" disabled${task ? ' checked' : ''} /> ${inner}</li>`
      })
      return `<ul${block.tasks?.some((task) => task !== null) ? ' class="task-list"' : ''}>\n${items.join('\n')}\n</ul>`
    }
    case 'ordered': {
      const type = block.style === 'lower-alpha' ? ' type="a"' : block.style === 'upper-alpha' ? ' type="A"' : block.style === 'lower-roman' ? ' type="i"' : block.style === 'upper-roman' ? ' type="I"' : ''
      return `<ol${block.start !== 1 ? ` start="${block.start}"` : ''}${type}>\n${block.items.map((item) => `<li>${blocksHtml(item, state)}</li>`).join('\n')}\n</ol>`
    }
    case 'deflist':
      return `<dl>\n${block.items.map((item) => `<dt>${inlinesHtml(item.term, state)}</dt>\n${item.defs.map((def) => `<dd>${blocksHtml(def, state)}</dd>`).join('\n')}`).join('\n')}\n</dl>`
    case 'hr':
      return '<hr />'
    case 'table': {
      const align = (k: number) => (block.aligns[k] && block.aligns[k] !== 'default' ? ` style="text-align: ${block.aligns[k]};"` : '')
      const head = block.header.length && block.header.some((cell) => cell.length)
        ? `<thead>\n<tr>${block.header.map((cell, k) => `<th${align(k)}>${inlinesHtml(cell, state)}</th>`).join('')}</tr>\n</thead>\n`
        : ''
      const body = block.rows.map((row) => `<tr>${row.map((cell, k) => `<td${align(k)}>${inlinesHtml(cell, state)}</td>`).join('')}</tr>`).join('\n')
      const caption = block.caption.length ? `<caption>${inlinesHtml(block.caption, state)}</caption>\n` : ''
      return `<table>\n${caption}${head}<tbody>\n${body}\n</tbody>\n</table>`
    }
    case 'raw':
      return block.format === 'html' ? block.text : ''
    case 'div': {
      const classes = block.attrs?.classes?.length ? ` class="${esc(block.attrs.classes.join(' '))}"` : ''
      const id = block.attrs?.id ? ` id="${esc(block.attrs.id)}"` : ''
      return `<div${id}${classes}>\n${blocksHtml(block.c, state)}\n</div>`
    }
    case 'linebl':
      return `<div class="line-block">${block.lines.map((line) => inlinesHtml(line, state)).join('<br />\n')}</div>`
  }
}

/* ----------------------------------------------------------------- inlines */

export function inlinesHtml(list: Inline[], state: State): string {
  return list.map((inline) => inlineHtml(inline, state)).join('')
}

function inlineHtml(inline: Inline, state: State): string {
  switch (inline.t) {
    case 'str': return esc(inline.text)
    case 'space': return ' '
    case 'softbreak': return '\n'
    case 'linebreak': return '<br />\n'
    case 'emph': return `<em>${inlinesHtml(inline.c, state)}</em>`
    case 'strong': return `<strong>${inlinesHtml(inline.c, state)}</strong>`
    case 'strike': return `<del>${inlinesHtml(inline.c, state)}</del>`
    case 'underline': return `<u>${inlinesHtml(inline.c, state)}</u>`
    case 'sup': return `<sup>${inlinesHtml(inline.c, state)}</sup>`
    case 'sub': return `<sub>${inlinesHtml(inline.c, state)}</sub>`
    case 'smallcaps': return `<span class="smallcaps">${inlinesHtml(inline.c, state)}</span>`
    case 'span': return `<span${inline.attrs?.classes?.length ? ` class="${esc(inline.attrs.classes.join(' '))}"` : ''}>${inlinesHtml(inline.c, state)}</span>`
    case 'code': return `<code>${esc(inline.text)}</code>`
    case 'math': return inline.display
      ? `<span class="math display">\\[${esc(inline.text)}\\]</span>`
      : `<span class="math inline">\\(${esc(inline.text)}\\)</span>`
    case 'link': return `<a href="${esc(inline.url)}"${inline.title ? ` title="${esc(inline.title)}"` : ''}>${inlinesHtml(inline.c, state)}</a>`
    case 'image': return `<img src="${esc(inline.url)}" alt="${esc(inlinesToText(inline.c))}"${inline.title ? ` title="${esc(inline.title)}"` : ''} />`
    case 'raw': return inline.format === 'html' ? inline.text : ''
    case 'note': {
      const index = state.notes.length + 1
      const body = blocksHtml(inline.c, state)
      state.notes.push(body)
      return `<a href="#fn${index}" class="footnote-ref" id="fnref${index}" role="doc-noteref"><sup>${index}</sup></a>`
    }
  }
}
