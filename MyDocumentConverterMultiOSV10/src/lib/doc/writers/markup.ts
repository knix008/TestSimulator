/**
 * Writers for plain text, LaTeX, reStructuredText, Org, Textile, MediaWiki,
 * AsciiDoc, RTF, the native JSON, CSV and Jupyter notebooks.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { applyLineEnding, wrapText, type WriterOptions } from '../options'

type Renderer = {
  inline: (inline: Inline, r: Renderer) => string
  block: (block: Block, r: Renderer, depth: number) => string
  notes: string[]
  options: WriterOptions
  numbers: number[]
}

function inl(list: Inline[], r: Renderer): string {
  return list.map((inline) => r.inline(inline, r)).join('')
}

function blks(list: Block[], r: Renderer, depth = 0, sep = '\n\n'): string {
  return list.map((block) => r.block(block, r, depth)).filter((text) => text !== '').join(sep)
}

function numbered(block: Extract<Block, { t: 'header' }>, r: Renderer): string {
  if (!r.options.numberSections) return ''
  const numbers = r.numbers
  while (numbers.length < block.level) numbers.push(0)
  numbers.length = block.level
  numbers[block.level - 1] += 1
  return `${numbers.join('.')} `
}

function indent(text: string, prefix: string, first = prefix): string {
  return text.split('\n').map((line, index) => (index === 0 ? `${first}${line}` : line ? `${prefix}${line}` : '')).join('\n')
}

function finish(parts: string[], options: WriterOptions): string {
  return applyLineEnding(`${parts.filter((part) => part !== '').join('\n\n')}\n`, options)
}

/* -------------------------------------------------------------- plain text */

export function writePlain(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'preserve' ? '\n' : ' '
        case 'linebreak': return '\n'
        case 'code': return inline.text
        case 'math': return inline.text
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? text : /^#/.test(inline.url) ? text : `${text} <${inline.url}>` }
        case 'image': return `[${inl(inline.c, rr) || 'image'}: ${inline.url}]`
        case 'raw': return ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return `[${rr.notes.length}]` }
        case 'strong': return inl(inline.c, rr).toUpperCase() === inl(inline.c, rr) ? inl(inline.c, rr) : inl(inline.c, rr)
        default: return inl(inline.c, rr)
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': {
          const text = `${numbered(block, rr)}${inl(block.c, rr)}`
          if (block.level === 1) return `${text}\n${'='.repeat(text.length)}`
          if (block.level === 2) return `${text}\n${'-'.repeat(text.length)}`
          return text
        }
        case 'code': return indent(block.text, '    ')
        case 'quote': return indent(blks(block.c, rr, depth), '  ')
        case 'bullet': return block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const bullet = task === undefined || task === null ? '- ' : task ? '[x] ' : '[ ] '
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(bullet.length), bullet)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'ordered': return block.items.map((item, index) => {
          const label = `${block.start + index}. `
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(label.length), label)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'deflist': return block.items.map((item) => `${inl(item.term, rr)}\n${item.defs.map((def) => indent(blks(def, rr, depth + 1), '    ')).join('\n')}`).join('\n\n')
        case 'hr': return '-'.repeat(Math.min(72, options.columns))
        case 'table': return plainTable(block, rr)
        case 'raw': return ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\n')
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  if (options.standalone && (title || author || date)) {
    const heading: string[] = []
    if (title) heading.push(title, '='.repeat(title.length))
    if (author) heading.push(author)
    if (date) heading.push(date)
    parts.push(heading.join('\n'))
  }
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `[${index + 1}] ${note}`).join('\n\n'))
  return finish(parts, options)
}

function plainTable(block: Extract<Block, { t: 'table' }>, r: Renderer): string {
  const cell = (c: Inline[]) => inl(c, r).replace(/\n/g, ' ')
  const rows = [block.header.map(cell), ...block.rows.map((row) => row.map(cell))]
  const width = block.aligns.length
  const widths = Array.from({ length: width }, (_, k) => Math.max(1, ...rows.map((row) => displayWidth(row[k] ?? ''))))
  const pad = (text: string, k: number) => {
    const extra = widths[k] - displayWidth(text)
    if (block.aligns[k] === 'right') return ' '.repeat(extra) + text
    if (block.aligns[k] === 'center') return ' '.repeat(Math.floor(extra / 2)) + text + ' '.repeat(Math.ceil(extra / 2))
    return text + ' '.repeat(extra)
  }
  const line = (row: string[]) => row.map((text, k) => pad(text, k)).join('  ').trimEnd()
  const rule = widths.map((w) => '-'.repeat(w)).join('  ')
  const out: string[] = []
  if (block.header.length && block.header.some((c) => c.length)) out.push(line(rows[0]), rule)
  else out.push(rule)
  out.push(...rows.slice(1).map(line), rule)
  if (block.caption.length) out.push('', `Table: ${inl(block.caption, r)}`)
  return out.join('\n')
}

/** East Asian wide characters take two columns; tables line up only when that is counted. */
export function displayWidth(text: string): number {
  let width = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    width += (code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x20000 && code <= 0x3fffd))) ? 2 : 1
  }
  return width
}

/* ------------------------------------------------------------------ LaTeX */

function latexEscape(text: string): string {
  return text.replace(/[\\{}$&#^_%~]/g, (ch) => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\^{}', _: '\\_', '%': '\\%', '~': '\\textasciitilde{}' })[ch] ?? ch)
    .replace(/…/g, '\\ldots{}').replace(/—/g, '---').replace(/–/g, '--').replace(/“/g, '``').replace(/”/g, "''").replace(/‘/g, '`').replace(/’/g, "'")
}

const SECTION_NAMES = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph', 'subparagraph']

export function writeLatex(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return latexEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\\\\\n'
        case 'emph': return `\\emph{${inl(inline.c, rr)}}`
        case 'strong': return `\\textbf{${inl(inline.c, rr)}}`
        case 'strike': return `\\sout{${inl(inline.c, rr)}}`
        case 'underline': return `\\underline{${inl(inline.c, rr)}}`
        case 'sup': return `\\textsuperscript{${inl(inline.c, rr)}}`
        case 'sub': return `\\textsubscript{${inl(inline.c, rr)}}`
        case 'smallcaps': return `\\textsc{${inl(inline.c, rr)}}`
        case 'span': return inl(inline.c, rr)
        case 'code': return inline.text.includes('|') ? `\\texttt{${latexEscape(inline.text)}}` : `\\verb|${inline.text}|`
        case 'math': return inline.display ? `\\[${inline.text}\\]` : `$${inline.text}$`
        case 'link': { const text = inl(inline.c, rr); return text === latexEscape(inline.url) ? `\\url{${inline.url}}` : inline.url.startsWith('#') ? `\\hyperref[${inline.url.slice(1)}]{${text}}` : `\\href{${inline.url.replace(/[%#]/g, '\\$&')}}{${text}}` }
        case 'image': return `\\includegraphics[width=\\linewidth,keepaspectratio]{${inline.url}}`
        case 'raw': return inline.format === 'latex' || inline.format === 'tex' ? inline.text : ''
        case 'note': return `\\footnote{${blks(inline.c, rr)}}`
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': {
          const name = SECTION_NAMES[Math.min(block.level, 6) - 1]
          const star = options.numberSections ? '' : '*'
          return `\\${name}${star}{${inl(block.c, rr)}}${block.id ? `\\label{${block.id}}` : ''}`
        }
        case 'code': return block.lang
          ? `\\begin{lstlisting}[language=${block.lang}]\n${block.text}\n\\end{lstlisting}`
          : `\\begin{verbatim}\n${block.text}\n\\end{verbatim}`
        case 'quote': return `\\begin{quote}\n${blks(block.c, rr, depth)}\n\\end{quote}`
        case 'bullet': return `\\begin{itemize}\n${block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const box = task === undefined || task === null ? '' : task ? '$\\boxtimes$ ' : '$\\square$ '
          return `\\item ${box}${blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n')}`
        }).join('\n')}\n\\end{itemize}`
        case 'ordered': return `\\begin{enumerate}${block.start !== 1 ? `\n\\setcounter{enumi}{${block.start - 1}}` : ''}\n${block.items.map((item) => `\\item ${blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n')}`).join('\n')}\n\\end{enumerate}`
        case 'deflist': return `\\begin{description}\n${block.items.map((item) => `\\item[${inl(item.term, rr)}] ${item.defs.map((def) => blks(def, rr, depth + 1)).join('\n\n')}`).join('\n')}\n\\end{description}`
        case 'hr': return '\\begin{center}\\rule{0.5\\linewidth}{0.5pt}\\end{center}'
        case 'table': {
          const spec = block.aligns.map((align) => (align === 'right' ? 'r' : align === 'center' ? 'c' : 'l')).join('')
          const row = (cells: Inline[][]) => `${cells.map((cell) => inl(cell, rr).replace(/\n/g, ' ')).join(' & ')} \\\\`
          const lines = ['\\begin{table}[htbp]', '\\centering', `\\begin{tabular}{${spec}}`, '\\toprule']
          if (block.header.length) lines.push(row(block.header), '\\midrule')
          lines.push(...block.rows.map(row), '\\bottomrule', '\\end{tabular}')
          if (block.caption.length) lines.push(`\\caption{${inl(block.caption, rr)}}`)
          lines.push('\\end{table}')
          return lines.join('\n')
        }
        case 'raw': return block.format === 'latex' || block.format === 'tex' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join(' \\\\\n')
      }
    },
  }
  const body = blks(doc.blocks, r)
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  const usesLstlisting = /\\begin\{lstlisting\}/.test(body)
  const preamble = [
    `\\documentclass[${options.fontSize}]{${options.documentClass || 'article'}}`,
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage{lmodern}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{booktabs}',
    '\\usepackage{ulem}',
    '\\usepackage{fixltx2e}',
    '\\usepackage[margin=' + `${options.marginMm}mm` + (options.landscape ? ',landscape' : '') + `,${options.pageSize.toLowerCase()}paper]{geometry}`,
    '\\usepackage{hyperref}',
    '\\hypersetup{colorlinks=true,linkcolor=blue,urlcolor=blue}',
    ...(usesLstlisting ? ['\\usepackage{listings}', '\\lstset{basicstyle=\\ttfamily\\small,breaklines=true}'] : []),
    ...(/[\uac00-\ud7a3\u3131-\u318e]/.test(body + title) ? ['\\usepackage{kotex}'] : []),
    title ? `\\title{${latexEscape(title)}}` : '',
    author ? `\\author{${latexEscape(author)}}` : '',
    date ? `\\date{${latexEscape(date)}}` : '\\date{}',
    '',
    '\\begin{document}',
    title ? '\\maketitle' : '',
    options.toc ? '\\tableofcontents' : '',
  ].filter((line, index, all) => line !== '' || (all[index - 1] !== '' && index !== all.length - 1))
  return applyLineEnding(`${preamble.join('\n')}\n\n${body}\n\n\\end{document}\n`, options)
}

/* ---------------------------------------------------------- reStructuredText */

const RST_ADORN = ['=', '-', '~', '^', '"', "'"]

export function writeRst(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/([*`|_\\])/g, '\\$1')
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\n'
        case 'emph': return `*${inl(inline.c, rr)}*`
        case 'strong': return `**${inl(inline.c, rr)}**`
        case 'strike': return `:strike:\`${inlinesToText(inline.c)}\``
        case 'underline': return inl(inline.c, rr)
        case 'sup': return `:sup:\`${inlinesToText(inline.c)}\``
        case 'sub': return `:sub:\`${inlinesToText(inline.c)}\``
        case 'smallcaps': return `:sc:\`${inlinesToText(inline.c)}\``
        case 'span': return inl(inline.c, rr)
        case 'code': return `\`\`${inline.text}\`\``
        case 'math': return inline.display ? `\n\n.. math::\n\n   ${inline.text}\n\n` : `:math:\`${inline.text}\``
        case 'link': { const text = inlinesText(inline.c); return text === inline.url ? inline.url : `\`${text} <${inline.url}>\`__` }
        case 'image': return `\n\n.. image:: ${inline.url}${inline.c.length ? `\n   :alt: ${inlinesText(inline.c)}` : ''}\n\n`
        case 'raw': return inline.format === 'rst' ? inline.text : ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return ` [#]_` }
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': {
          const text = `${numbered(block, rr)}${inl(block.c, rr)}`
          const adorn = RST_ADORN[Math.min(block.level, RST_ADORN.length) - 1]
          const rule = adorn.repeat(Math.max(3, displayWidth(text)))
          return block.level === 1 ? `${rule}\n${text}\n${rule}` : `${text}\n${rule}`
        }
        case 'code': return block.lang ? `.. code-block:: ${block.lang}\n\n${indent(block.text, '   ')}` : `::\n\n${indent(block.text, '   ')}`
        case 'quote': return indent(blks(block.c, rr, depth), '   ')
        case 'bullet': return block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const bullet = task === undefined || task === null ? '- ' : task ? '- ☒ ' : '- ☐ '
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(bullet.length), bullet)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'ordered': return block.items.map((item, index) => {
          const label = `${block.start + index}. `
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(label.length), label)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'deflist': return block.items.map((item) => `${inl(item.term, rr)}\n${item.defs.map((def) => indent(blks(def, rr, depth + 1), '   ')).join('\n\n')}`).join('\n\n')
        case 'hr': return '--------------'
        case 'table': return rstTable(block, rr)
        case 'raw': return block.format === 'rst' ? block.text : block.format === 'html' ? `.. raw:: html\n\n${indent(block.text, '   ')}` : ''
        case 'div': {
          const cls = block.attrs?.classes?.[0]
          if (cls && ['note', 'warning', 'tip', 'important', 'caution', 'hint', 'attention', 'danger', 'error'].includes(cls)) {
            const inner = block.c.length && block.c[0].t === 'para' && block.c[0].c.length === 1 && block.c[0].c[0].t === 'strong' ? block.c.slice(1) : block.c
            return `.. ${cls}::\n\n${indent(blks(inner, rr, depth), '   ')}`
          }
          return blks(block.c, rr, depth)
        }
        case 'linebl': return block.lines.map((line) => `| ${inl(line, rr)}`).join('\n')
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  if (options.standalone && title) parts.push(`${'='.repeat(displayWidth(title))}\n${title}\n${'='.repeat(displayWidth(title))}`)
  if (options.standalone && (author || date)) parts.push([author ? `:Author: ${author}` : '', date ? `:Date: ${date}` : ''].filter(Boolean).join('\n'))
  if (options.toc) parts.push(`.. contents::\n   :depth: ${options.tocDepth}`)
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note) => `.. [#] ${note.split('\n').join('\n   ')}`).join('\n\n'))
  return finish(parts, options)
}

function inlinesText(list: Inline[]): string {
  return inlinesToText(list)
}

function rstTable(block: Extract<Block, { t: 'table' }>, r: Renderer): string {
  const cell = (c: Inline[]) => inl(c, r).replace(/\n/g, ' ')
  const header = block.header.map(cell)
  const rows = block.rows.map((row) => row.map(cell))
  const width = block.aligns.length
  const widths = Array.from({ length: width }, (_, k) => Math.max(3, displayWidth(header[k] ?? ''), ...rows.map((row) => displayWidth(row[k] ?? ''))))
  const rule = (ch: string) => `+${widths.map((w) => ch.repeat(w + 2)).join('+')}+`
  const line = (cells: string[]) => `|${cells.map((text, k) => ` ${text}${' '.repeat(widths[k] - displayWidth(text))} `).join('|')}|`
  const out: string[] = []
  if (block.caption.length) out.push(`.. table:: ${inl(block.caption, r)}`, '')
  const pad = block.caption.length ? '   ' : ''
  out.push(pad + rule('-'))
  if (header.some((text) => text)) out.push(pad + line(header), pad + rule('='))
  for (const row of rows) out.push(pad + line(row), pad + rule('-'))
  return out.join('\n')
}

/* --------------------------------------------------------------------- Org */

export function writeOrg(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\\\\\n'
        case 'emph': return `/${inl(inline.c, rr)}/`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `+${inl(inline.c, rr)}+`
        case 'underline': return `_${inl(inline.c, rr)}_`
        case 'sup': return `^{${inl(inline.c, rr)}}`
        case 'sub': return `_{${inl(inline.c, rr)}}`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `=${inline.text}=`
        case 'math': return inline.display ? `\\[${inline.text}\\]` : `$${inline.text}$`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[[${inline.url}]]` : `[[${inline.url}][${text}]]` }
        case 'image': return `[[${inline.url}]]`
        case 'raw': return inline.format === 'org' ? inline.text : ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return `[fn:${rr.notes.length}]` }
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${'*'.repeat(block.level)} ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return `#+BEGIN_SRC${block.lang ? ` ${block.lang}` : ''}\n${block.text}\n#+END_SRC`
        case 'quote': return `#+BEGIN_QUOTE\n${blks(block.c, rr, depth)}\n#+END_QUOTE`
        case 'bullet': return block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const bullet = task === undefined || task === null ? '- ' : task ? '- [X] ' : '- [ ] '
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), '  ', bullet)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'ordered': return block.items.map((item, index) => {
          const label = `${block.start + index}. `
          return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(label.length), label)
        }).join(block.tight === false ? '\n\n' : '\n')
        case 'deflist': return block.items.map((item) => `- ${inl(item.term, rr)} :: ${item.defs.map((def) => blks(def, rr, depth + 1).split('\n').join('\n  ')).join('\n  ')}`).join('\n')
        case 'hr': return '-----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ').replace(/\|/g, '\\vert')
          const header = block.header.map(cell)
          const rows = block.rows.map((row) => row.map(cell))
          const widths = block.aligns.map((_, k) => Math.max(1, displayWidth(header[k] ?? ''), ...rows.map((row) => displayWidth(row[k] ?? ''))))
          const line = (cells: string[]) => `| ${cells.map((text, k) => text + ' '.repeat(widths[k] - displayWidth(text))).join(' | ')} |`
          const out: string[] = []
          if (block.caption.length) out.push(`#+CAPTION: ${inl(block.caption, rr)}`)
          if (header.some((text) => text)) out.push(line(header), `|${widths.map((w) => '-'.repeat(w + 2)).join('+')}|`)
          out.push(...rows.map(line))
          return out.join('\n')
        }
        case 'raw': return block.format === 'org' ? block.text : block.format === 'html' ? `#+BEGIN_EXPORT html\n${block.text}\n#+END_EXPORT` : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return `#+BEGIN_VERSE\n${block.lines.map((line) => inl(line, rr)).join('\n')}\n#+END_VERSE`
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  if (options.standalone && (title || author || date)) parts.push([title ? `#+TITLE: ${title}` : '', author ? `#+AUTHOR: ${author}` : '', date ? `#+DATE: ${date}` : ''].filter(Boolean).join('\n'))
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `[fn:${index + 1}] ${note}`).join('\n\n'))
  return finish(parts, options)
}

/* ----------------------------------------------------------------- Textile */

export function writeTextile(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/([*_@+^~%-])(?=\w)/g, '$1')
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\n'
        case 'emph': return `_${inl(inline.c, rr)}_`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `-${inl(inline.c, rr)}-`
        case 'underline': return `+${inl(inline.c, rr)}+`
        case 'sup': return `^${inl(inline.c, rr)}^`
        case 'sub': return `~${inl(inline.c, rr)}~`
        case 'smallcaps': case 'span': return `%${inl(inline.c, rr)}%`
        case 'code': return `@${inline.text}@`
        case 'math': return inline.text
        case 'link': return `"${inl(inline.c, rr)}":${inline.url}`
        case 'image': return `!${inline.url}${inline.c.length ? `(${inlinesToText(inline.c)})` : ''}!`
        case 'raw': return inline.format === 'html' || inline.format === 'textile' ? inline.text : ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return `[${rr.notes.length}]` }
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': return `p. ${inl(block.c, rr)}`
        case 'plain': return inl(block.c, rr)
        case 'header': return `h${Math.min(block.level, 6)}. ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return `bc.. ${block.text}\n\np. `
        case 'quote': return `bq. ${blks(block.c, rr, depth).replace(/^p\. /, '')}`
        case 'bullet': return textileList(block.items, '*', rr, depth)
        case 'ordered': return textileList(block.items, '#', rr, depth)
        case 'deflist': return block.items.map((item) => `- ${inl(item.term, rr)} := ${item.defs.map((def) => blks(def, rr, depth + 1).replace(/^p\. /, '')).join(' ')}`).join('\n')
        case 'hr': return '---'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const out: string[] = []
          if (block.header.length) out.push(`|${block.header.map((c) => `_. ${cell(c)} `).join('|')}|`)
          out.push(...block.rows.map((row) => `|${row.map((c) => ` ${cell(c)} `).join('|')}|`))
          return out.join('\n')
        }
        case 'raw': return block.format === 'html' ? `notextile. ${block.text}` : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\n')
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  if (options.standalone && title) parts.push(`h1(title). ${title}`)
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `fn${index + 1}. ${note.replace(/^p\. /, '')}`).join('\n\n'))
  return finish(parts, options)
}

function textileList(items: Block[][], marker: string, r: Renderer, depth: number): string {
  const lines: string[] = []
  for (const item of items) {
    const first = item[0]
    const text = first && (first.t === 'plain' || first.t === 'para') ? inl(first.c, r) : ''
    lines.push(`${marker.repeat(depth + 1)} ${text}`)
    for (const block of item.slice(first && (first.t === 'plain' || first.t === 'para') ? 1 : 0)) {
      if (block.t === 'bullet') lines.push(textileList(block.items, marker.repeat(depth + 1) + '*', r, 0))
      else if (block.t === 'ordered') lines.push(textileList(block.items, marker.repeat(depth + 1) + '#', r, 0))
      else lines.push(r.block(block, r, depth + 1))
    }
  }
  return lines.join('\n')
}

/* --------------------------------------------------------------- MediaWiki */

export function writeMediaWiki(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/'{2,}/g, (m) => `<nowiki>${m}</nowiki>`)
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '<br />'
        case 'emph': return `''${inl(inline.c, rr)}''`
        case 'strong': return `'''${inl(inline.c, rr)}'''`
        case 'strike': return `<s>${inl(inline.c, rr)}</s>`
        case 'underline': return `<u>${inl(inline.c, rr)}</u>`
        case 'sup': return `<sup>${inl(inline.c, rr)}</sup>`
        case 'sub': return `<sub>${inl(inline.c, rr)}</sub>`
        case 'smallcaps': return `<span style="font-variant:small-caps;">${inl(inline.c, rr)}</span>`
        case 'span': return inl(inline.c, rr)
        case 'code': return `<code>${inline.text}</code>`
        case 'math': return `<math>${inline.text}</math>`
        case 'link': { const text = inl(inline.c, rr); return /^(https?|ftp|mailto):/.test(inline.url) ? (text === inline.url ? inline.url : `[${inline.url} ${text}]`) : `[[${inline.url}|${text}]]` }
        case 'image': return `[[File:${inline.url}${inline.c.length ? `|${inlinesToText(inline.c)}` : ''}]]`
        case 'raw': return inline.format === 'html' || inline.format === 'mediawiki' ? inline.text : ''
        case 'note': return `<ref>${blks(inline.c, rr)}</ref>`
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': { const eq = '='.repeat(Math.min(block.level, 6)); return `${eq} ${numbered(block, rr)}${inl(block.c, rr)} ${eq}` }
        case 'code': return block.lang ? `<syntaxhighlight lang="${block.lang}">\n${block.text}\n</syntaxhighlight>` : `<pre>\n${block.text}\n</pre>`
        case 'quote': return `<blockquote>\n${blks(block.c, rr, depth)}\n</blockquote>`
        case 'bullet': return wikiList(block.items, '*', rr)
        case 'ordered': return wikiList(block.items, '#', rr)
        case 'deflist': return block.items.map((item) => `; ${inl(item.term, rr)}\n${item.defs.map((def) => `: ${blks(def, rr, depth + 1).replace(/\n/g, ' ')}`).join('\n')}`).join('\n')
        case 'hr': return '----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const lines = ['{| class="wikitable"']
          if (block.caption.length) lines.push(`|+ ${inl(block.caption, rr)}`)
          if (block.header.length) lines.push('|-', ...block.header.map((c) => `! ${cell(c)}`))
          for (const row of block.rows) lines.push('|-', ...row.map((c) => `| ${cell(c)}`))
          lines.push('|}')
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' || block.format === 'mediawiki' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('<br />\n')
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  if (options.standalone && title) parts.push(`= ${title} =`)
  parts.push(blks(doc.blocks, r))
  if (/<ref>/.test(parts.join(''))) parts.push('== Notes ==\n<references />')
  return finish(parts, options)
}

function wikiList(items: Block[][], marker: string, r: Renderer): string {
  const lines: string[] = []
  for (const item of items) {
    const first = item[0]
    const text = first && (first.t === 'plain' || first.t === 'para') ? inl(first.c, r) : ''
    lines.push(`${marker} ${text}`)
    for (const block of item.slice(first && (first.t === 'plain' || first.t === 'para') ? 1 : 0)) {
      if (block.t === 'bullet') lines.push(wikiList(block.items, `${marker}*`, r))
      else if (block.t === 'ordered') lines.push(wikiList(block.items, `${marker}#`, r))
      else lines.push(`${marker}: ${r.block(block, r, 1).replace(/\n/g, ' ')}`)
    }
  }
  return lines.join('\n')
}

/* ---------------------------------------------------------------- AsciiDoc */

export function writeAsciiDoc(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/(\*|_|`|\^|~)(?=\S)/g, (m) => `\\${m}`)
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return ' +\n'
        case 'emph': return `_${inl(inline.c, rr)}_`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `[line-through]#${inl(inline.c, rr)}#`
        case 'underline': return `[underline]#${inl(inline.c, rr)}#`
        case 'sup': return `^${inl(inline.c, rr)}^`
        case 'sub': return `~${inl(inline.c, rr)}~`
        case 'smallcaps': return `[small-caps]#${inl(inline.c, rr)}#`
        case 'span': return inl(inline.c, rr)
        case 'code': return `\`${inline.text}\``
        case 'math': return inline.display ? `\n\n[stem]\n++++\n${inline.text}\n++++\n\n` : `stem:[${inline.text}]`
        case 'link': { const text = inl(inline.c, rr); return inline.url.startsWith('#') ? `<<${inline.url.slice(1)},${text}>>` : `link:${inline.url}[${text === inline.url ? '' : text}]` }
        case 'image': return `image:${inline.url}[${inlinesToText(inline.c)}]`
        case 'raw': return inline.format === 'html' ? `pass:[${inline.text}]` : inline.format === 'asciidoc' ? inline.text : ''
        case 'note': return `footnote:[${blks(inline.c, rr).replace(/\n/g, ' ')}]`
      }
    },
    block: (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${block.id ? `[[${block.id}]]\n` : ''}${'='.repeat(Math.min(block.level + 1, 6))} ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return `[source${block.lang ? `,${block.lang}` : ''}]\n----\n${block.text}\n----`
        case 'quote': return `[quote]\n____\n${blks(block.c, rr, depth)}\n____`
        case 'bullet': return adocList(block, rr, depth)
        case 'ordered': return adocList(block, rr, depth)
        case 'deflist': return block.items.map((item) => `${inl(item.term, rr)}::\n${item.defs.map((def) => indent(blks(def, rr, depth + 1), '  ')).join('\n+\n')}`).join('\n\n')
        case 'hr': return "'''"
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ').replace(/\|/g, '\\|')
          const lines: string[] = []
          if (block.caption.length) lines.push(`.${inl(block.caption, rr)}`)
          const cols = block.aligns.map((align) => (align === 'right' ? '>' : align === 'center' ? '^' : '<') + '1').join(',')
          lines.push(`[cols="${cols}"${block.header.length ? ',options="header"' : ''}]`, '|===')
          if (block.header.length) lines.push(block.header.map((c) => `| ${cell(c)}`).join(' '), '')
          for (const row of block.rows) lines.push(row.map((c) => `| ${cell(c)}`).join(' '))
          lines.push('|===')
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' ? `++++\n${block.text}\n++++` : block.format === 'asciidoc' ? block.text : ''
        case 'div': {
          const cls = block.attrs?.classes?.[0]
          if (cls && ['note', 'tip', 'important', 'warning', 'caution'].includes(cls)) {
            const inner = block.c.length && block.c[0].t === 'para' && block.c[0].c.length === 1 && block.c[0].c[0].t === 'strong' ? block.c.slice(1) : block.c
            return `[${cls.toUpperCase()}]\n====\n${blks(inner, rr, depth)}\n====`
          }
          return blks(block.c, rr, depth)
        }
        case 'linebl': return `[verse]\n____\n${block.lines.map((line) => inl(line, rr)).join('\n')}\n____`
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  if (options.standalone && title) parts.push([`= ${title}`, author, date ? (author ? date : `:revdate: ${date}`) : '', options.toc ? ':toc:' : '', options.numberSections ? ':sectnums:' : ''].filter(Boolean).join('\n'))
  else if (options.toc) parts.push(':toc:')
  parts.push(blks(doc.blocks, r))
  return finish(parts, options)
}

function adocList(block: Extract<Block, { t: 'bullet' } | { t: 'ordered' }>, r: Renderer, depth: number): string {
  const marker = block.t === 'bullet' ? '*'.repeat(depth + 1) : '.'.repeat(depth + 1)
  return block.items.map((item, index) => {
    const task = block.t === 'bullet' ? block.tasks?.[index] : undefined
    const box = task === undefined || task === null ? '' : task ? '[x] ' : '[ ] '
    const first = item[0]
    const text = first && (first.t === 'plain' || first.t === 'para') ? inl(first.c, r) : ''
    const lines = [`${marker} ${box}${text}`]
    for (const rest of item.slice(first && (first.t === 'plain' || first.t === 'para') ? 1 : 0)) {
      if (rest.t === 'bullet' || rest.t === 'ordered') lines.push(adocList(rest, r, depth + 1))
      else lines.push('+', r.block(rest, r, depth + 1))
    }
    return lines.join('\n')
  }).join('\n')
}

/* --------------------------------------------------------------------- RTF */

function rtfEscape(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`
    else if (code < 0x80) out += ch
    else if (code <= 0xffff) out += `\\u${code > 0x7fff ? code - 0x10000 : code}?`
    else {
      // Surrogate pair for the astral plane.
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      out += `\\u${high - 0x10000}?\\u${low - 0x10000}?`
    }
  }
  return out
}

export function writeRtf(doc: Doc, options: WriterOptions): string {
  const r: Renderer = {
    options, notes: [], numbers: [],
    inline: (inline, rr) => {
      switch (inline.t) {
        case 'str': return rtfEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\\line '
        case 'emph': return `{\\i ${inl(inline.c, rr)}}`
        case 'strong': return `{\\b ${inl(inline.c, rr)}}`
        case 'strike': return `{\\strike ${inl(inline.c, rr)}}`
        case 'underline': return `{\\ul ${inl(inline.c, rr)}}`
        case 'sup': return `{\\super ${inl(inline.c, rr)}}`
        case 'sub': return `{\\sub ${inl(inline.c, rr)}}`
        case 'smallcaps': return `{\\scaps ${inl(inline.c, rr)}}`
        case 'span': return inl(inline.c, rr)
        case 'code': return `{\\f1 ${rtfEscape(inline.text)}}`
        case 'math': return rtfEscape(inline.text)
        case 'link': return `{\\field{\\*\\fldinst{HYPERLINK "${rtfEscape(inline.url)}"}}{\\fldrslt{\\ul\\cf1 ${inl(inline.c, rr)}}}}`
        case 'image': return `[${rtfEscape(inlinesToText(inline.c) || inline.url)}]`
        case 'raw': return inline.format === 'rtf' ? inline.text : ''
        case 'note': return `{\\super\\chftn}{\\footnote\\pard\\plain\\fs20 {\\super\\chftn} ${blks(inline.c, rr)}}`
      }
    },
    block: (block, rr, depth) => {
      const left = depth * 720
      const para = (text: string, extra = '') => `{\\pard\\sa200\\sl276\\slmult1\\li${left}${extra} ${text}\\par}`
      switch (block.t) {
        case 'para': case 'plain': return para(inl(block.c, rr))
        case 'header': {
          const size = [36, 30, 26, 24, 22, 22][Math.min(block.level, 6) - 1]
          return `{\\pard\\sb240\\sa120\\keepn\\li${left}\\b\\fs${size} ${numbered(block, rr)}${inl(block.c, rr)}\\par}`
        }
        case 'code': return block.text.split('\n').map((line) => `{\\pard\\li${left + 360}\\f1\\fs18 ${rtfEscape(line)}\\par}`).join('\n')
        case 'quote': return `{\\pard\\li${left + 720}\\ri720\\i ${blks(block.c, rr, depth).replace(/\\li\d+/g, `\\li${left + 720}`)}}`
        case 'bullet': return block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const bullet = task === undefined || task === null ? '\\bullet' : task ? '\\u9746?' : '\\u9744?'
          return `{\\pard\\fi-360\\li${left + 720}\\sa100 ${bullet}\\tab ${blockRtfInner(item, rr, depth + 1)}\\par}`
        }).join('\n')
        case 'ordered': return block.items.map((item, index) => `{\\pard\\fi-360\\li${left + 720}\\sa100 ${block.start + index}.\\tab ${blockRtfInner(item, rr, depth + 1)}\\par}`).join('\n')
        case 'deflist': return block.items.map((item) => `${para(`{\\b ${inl(item.term, rr)}}`)}\n${item.defs.map((def) => blks(def, rr, depth + 1)).join('\n')}`).join('\n')
        case 'hr': return '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20\\sa200 \\par}'
        case 'table': {
          const width = block.aligns.length
          const cellWidth = Math.floor(9000 / Math.max(1, width))
          const row = (cells: Inline[][], bold: boolean) => {
            const defs = cells.map((_, k) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${cellWidth * (k + 1)}`).join('')
            const content = cells.map((cell, k) => `\\pard\\intbl${block.aligns[k] === 'right' ? '\\qr' : block.aligns[k] === 'center' ? '\\qc' : '\\ql'} ${bold ? '{\\b ' : ''}${inl(cell, rr)}${bold ? '}' : ''}\\cell`).join('')
            return `{\\trowd\\trgaph108\\trleft-108${defs}${content}\\row}`
          }
          const lines: string[] = []
          if (block.header.length) lines.push(row(block.header, true))
          lines.push(...block.rows.map((cells) => row(cells, false)))
          if (block.caption.length) lines.push(para(`{\\i ${inl(block.caption, rr)}}`, '\\qc'))
          return lines.join('\n')
        }
        case 'raw': return block.format === 'rtf' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return para(block.lines.map((line) => inl(line, rr)).join('\\line '))
      }
    },
  }
  const parts: string[] = []
  const title = options.title || doc.meta.title
  const author = options.author || doc.meta.author
  const date = options.date || doc.meta.date
  if (options.standalone && title) parts.push(`{\\pard\\qc\\sa240\\b\\fs40 ${rtfEscape(title)}\\par}`)
  if (options.standalone && author) parts.push(`{\\pard\\qc\\sa120\\fs24 ${rtfEscape(author)}\\par}`)
  if (options.standalone && date) parts.push(`{\\pard\\qc\\sa240\\fs24 ${rtfEscape(date)}\\par}`)
  parts.push(blks(doc.blocks, r, 0, '\n'))
  const body = parts.join('\n')
  const header = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\deflang1033{\\fonttbl{\\f0\\fswiss\\fcharset0 ${options.bodyFont || 'Calibri'};}{\\f1\\fmodern\\fcharset0 ${options.monoFont || 'Consolas'};}}{\\colortbl;\\red0\\green0\\blue238;}${title ? `{\\info{\\title ${rtfEscape(title)}}${author ? `{\\author ${rtfEscape(author)}}` : ''}}` : ''}\\viewkind4\\uc1\\paperw${options.landscape ? 16838 : 11906}\\paperh${options.landscape ? 11906 : 16838}\\margl${options.marginMm * 56.7 | 0}\\margr${options.marginMm * 56.7 | 0}\\margt${options.marginMm * 56.7 | 0}\\margb${options.marginMm * 56.7 | 0}\\fs${options.bodyFontSize * 2}\n`
  return `${header}${body}\n}\n`
}

function blockRtfInner(item: Block[], r: Renderer, depth: number): string {
  const first = item[0]
  const text = first && (first.t === 'plain' || first.t === 'para') ? inl(first.c, r) : ''
  const rest = item.slice(first && (first.t === 'plain' || first.t === 'para') ? 1 : 0)
  return rest.length ? `${text}\\par}\n${blks(rest, r, depth, '\n')}\n{\\pard` : text
}

/* --------------------------------------------------------------- JSON etc. */

export function writeJson(doc: Doc, options: WriterOptions): string {
  const meta = { ...doc.meta }
  if (options.title) meta.title = options.title
  if (options.author) meta.author = options.author
  if (options.date) meta.date = options.date
  return applyLineEnding(`${JSON.stringify({ 'mdcv-document': 1, meta, blocks: doc.blocks }, null, 2)}\n`, options)
}

/** Every table in the document, as CSV; a document without tables becomes one table of paragraphs. */
export function writeCsv(doc: Doc, options: WriterOptions, delimiter = ','): string {
  const quote = (text: string) => (/[",\n\r\t]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text)
  const lines: string[] = []
  const tables = doc.blocks.filter((block): block is Extract<Block, { t: 'table' }> => block.t === 'table')
  if (!tables.length) {
    lines.push('text')
    for (const block of doc.blocks) {
      if (block.t === 'para' || block.t === 'plain' || block.t === 'header') lines.push(quote(inlinesToText(block.c)))
      else if (block.t === 'code') lines.push(quote(block.text))
    }
    return applyLineEnding(`${lines.join('\n')}\n`, options)
  }
  for (const table of tables) {
    if (lines.length) lines.push('')
    if (table.header.length) lines.push(table.header.map((cell) => quote(inlinesToText(cell))).join(delimiter))
    for (const row of table.rows) lines.push(row.map((cell) => quote(inlinesToText(cell))).join(delimiter))
  }
  return applyLineEnding(`${lines.join('\n')}\n`, options)
}

/** A notebook: code blocks become code cells, everything between them markdown cells. */
export function writeIpynb(doc: Doc, options: WriterOptions, markdown: (blocks: Block[]) => string): string {
  const cells: { cell_type: string; metadata: Record<string, unknown>; source: string[]; outputs?: unknown[]; execution_count?: null }[] = []
  let run: Block[] = []
  const flush = () => {
    if (!run.length) return
    cells.push({ cell_type: 'markdown', metadata: {}, source: toLines(markdown(run)) })
    run = []
  }
  const toLines = (text: string) => text.replace(/\n$/, '').split('\n').map((line, index, all) => (index < all.length - 1 ? `${line}\n` : line))
  let language = ''
  for (const block of doc.blocks) {
    if (block.t === 'code') {
      flush()
      if (!language && block.lang) language = block.lang
      cells.push({ cell_type: 'code', metadata: block.lang ? { language: block.lang } : {}, source: toLines(block.text), outputs: [], execution_count: null })
    } else run.push(block)
  }
  flush()
  const kernel = language === 'js' || language === 'javascript' ? { display_name: 'JavaScript (Node.js)', language: 'javascript', name: 'javascript' } : { display_name: 'Python 3', language: 'python', name: 'python3' }
  const notebook = {
    cells,
    metadata: { kernelspec: kernel, language_info: { name: kernel.language } },
    nbformat: 4,
    nbformat_minor: 5,
  }
  return applyLineEnding(`${JSON.stringify(notebook, null, 1)}\n`, options)
}
