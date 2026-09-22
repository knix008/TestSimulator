/**
 * Writers for the typesetting systems: ConTeXt, GNU Texinfo, roff man and
 * roff ms, and LaTeX Beamer slides.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { applyLineEnding, wrapText, type WriterOptions } from '../options'
import { slideLevel, slidesAt } from '../sections'
import { blks, finish, inl, makeRenderer, metaOf, numbered, splitItem, type Renderer } from './render'
import { writeLatex } from './markup'

/* ----------------------------------------------------------------- ConTeXt */

function contextEscape(text: string): string {
  return text.replace(/[\\{}$&#%~|]/g, (ch) => ({ '\\': '\\letterbackslash{}', '{': '\\letteropenbrace{}', '}': '\\letterclosebrace{}', $: '\\letterdollar{}', '&': '\\letterampersand{}', '#': '\\letterhash{}', '%': '\\letterpercent{}', '~': '\\lettertilde{}', '|': '\\letterbar{}' })[ch] ?? ch)
}

export function writeContext(doc: Doc, options: WriterOptions): string {
  let urlCount = 0
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return contextEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\\crlf\n'
        case 'emph': return `{\\em ${inl(inline.c, rr)}}`
        case 'strong': return `{\\bf ${inl(inline.c, rr)}}`
        case 'strike': return `\\overstrikes{${inl(inline.c, rr)}}`
        case 'underline': return `\\underbar{${inl(inline.c, rr)}}`
        case 'sup': return `\\high{${inl(inline.c, rr)}}`
        case 'sub': return `\\low{${inl(inline.c, rr)}}`
        case 'smallcaps': return `{\\sc ${inl(inline.c, rr)}}`
        case 'span': return inl(inline.c, rr)
        case 'code': return `\\type{${inline.text.replace(/[{}]/g, '')}}`
        case 'math': return inline.display ? `\\startformula\n${inline.text}\n\\stopformula` : `$${inline.text}$`
        case 'link': { urlCount += 1; const text = inl(inline.c, rr); return inline.url.startsWith('#') ? `\\goto{${text}}[${inline.url.slice(1)}]` : `\\useURL[url${urlCount}][${inline.url}][][${text}]\\from[url${urlCount}]` }
        case 'image': return `\\externalfigure[${inline.url}]`
        case 'raw': return inline.format === 'context' || inline.format === 'tex' ? inline.text : ''
        case 'note': return `\\footnote{${blks(inline.c, rr).replace(/\n\n/g, '\\par ')}}`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': {
          // Numbered headings are sections; unnumbered ones are subjects, as Pandoc writes them.
          return `\\start${contextHeadName(block.level, options.numberSections)}[title={${inl(block.c, rr)}}${block.id ? `,reference={${block.id}}` : ''}]`
        }
        case 'code': return `\\starttyping${block.lang ? `[option=${block.lang}]` : ''}\n${block.text}\n\\stoptyping`
        case 'quote': return `\\startblockquote\n${blks(block.c, rr, depth)}\n\\stopblockquote`
        case 'bullet': return `\\startitemize[packed]\n${block.items.map((item, index) => { const task = block.tasks?.[index]; return `\\item ${task === undefined || task === null ? '' : task ? '\\boxplus ' : '\\square '}${blks(item, rr, depth + 1, '\n')}` }).join('\n')}\n\\stopitemize`
        case 'ordered': return `\\startitemize[${block.style === 'lower-alpha' ? 'a' : block.style === 'upper-alpha' ? 'A' : block.style === 'lower-roman' ? 'r' : block.style === 'upper-roman' ? 'R' : 'n'},packed]${block.start !== 1 ? `[start=${block.start}]` : ''}\n${block.items.map((item) => `\\item ${blks(item, rr, depth + 1, '\n')}`).join('\n')}\n\\stopitemize`
        case 'deflist': return block.items.map((item) => `\\startdescription{${inl(item.term, rr)}}\n${item.defs.map((def) => blks(def, rr, depth + 1)).join('\n\n')}\n\\stopdescription`).join('\n')
        case 'hr': return '\\thinrule'
        case 'table': {
          const cell = (c: Inline[], k: number, head: boolean) => `\\startxcell${block.aligns[k] !== 'default' ? `[align=${block.aligns[k] === 'left' ? 'right' : block.aligns[k] === 'right' ? 'left' : 'middle'}]` : ''} ${head ? `{\\bf ${inl(c, rr)}}` : inl(c, rr)} \\stopxcell`
          const lines = ['\\startplacetable' + (block.caption.length ? `[title={${inl(block.caption, rr)}}]` : '[location=none]'), '\\startxtable']
          if (block.header.length) lines.push('\\startxtablehead[head]', '\\startxrow', ...block.header.map((c, k) => cell(c, k, true)), '\\stopxrow', '\\stopxtablehead')
          lines.push('\\startxtablebody[body]')
          for (const row of block.rows) lines.push('\\startxrow', ...row.map((c, k) => cell(c, k, false)), '\\stopxrow')
          lines.push('\\stopxtablebody', '\\stopxtable', '\\stopplacetable')
          return lines.join('\n')
        }
        case 'raw': return block.format === 'context' || block.format === 'tex' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return `\\startlines\n${block.lines.map((line) => inl(line, rr)).join('\n')}\n\\stoplines`
      }
    })
  // Headings open sections that ConTeXt wants closed; close them by level.
  const rendered: string[] = []
  const open: number[] = []
  const closeTo = (level: number) => {
    while (open.length && open[open.length - 1] >= level) {
      const closed = open.pop()!
      rendered.push(`\\stop${contextHeadName(closed, options.numberSections)}`)
    }
  }
  for (const block of doc.blocks) {
    if (block.t === 'header') {
      closeTo(block.level)
      rendered.push(r.block(block, r, 0))
      open.push(block.level)
      void numbered
      continue
    }
    rendered.push(r.block(block, r, 0))
  }
  closeTo(1)
  const body = rendered.filter(Boolean).join('\n\n')
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const meta = metaOf(doc, options)
  const head = [
    '% ConTeXt document produced by My Document Converter',
    `\\setuppapersize[${options.pageSize}]${options.landscape ? '[landscape]' : ''}`,
    `\\setuplayout[width=middle,height=middle,backspace=${options.marginMm}mm,topspace=${options.marginMm}mm]`,
    '\\setupbodyfont[11pt]',
    '\\setupwhitespace[medium]',
    '\\setuphead[section,subsection,subsubsection][style=\\tfa\\bf]',
    '\\setupinteraction[state=start,color=blue]',
    ...(options.toc ? ['\\setupcombinedlist[content][list={section,subsection}]'] : []),
    '\\starttext',
    ...(meta.title ? ['\\startalignment[center]', '\\blank[2*big]', `{\\tfd ${contextEscape(meta.title)}}`, ...(meta.author ? ['\\blank[3*medium]', `{\\tfa ${contextEscape(meta.author)}}`] : []), ...(meta.date ? ['\\blank[2*medium]', `{\\tfa ${contextEscape(meta.date)}}`] : []), '\\blank[3*medium]', '\\stopalignment'] : []),
    ...(options.toc ? ['\\completecontent'] : []),
  ]
  return applyLineEnding(`${head.join('\n')}\n\n${body}\n\n\\stoptext\n`, options)
}

function contextHeadName(level: number, numbered: boolean): string {
  const numberedNames = ['section', 'subsection', 'subsubsection', 'subsubsubsection', 'subsubsubsubsection', 'subsubsubsubsection']
  const plainNames = ['subject', 'subsubject', 'subsubsubject', 'subsubsubsubject', 'subsubsubsubsubject', 'subsubsubsubsubject']
  return (numbered ? numberedNames : plainNames)[Math.min(level, 6) - 1]
}

/* ----------------------------------------------------------------- Texinfo */

function texiEscape(text: string): string {
  return text.replace(/@/g, '@@').replace(/\{/g, '@{').replace(/\}/g, '@}')
}

export function writeTexinfo(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return texiEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '@*\n'
        case 'emph': return `@emph{${inl(inline.c, rr)}}`
        case 'strong': return `@strong{${inl(inline.c, rr)}}`
        case 'strike': return `@emph{${inl(inline.c, rr)}}`
        case 'underline': return `@emph{${inl(inline.c, rr)}}`
        case 'sup': return `@sup{${inl(inline.c, rr)}}`
        case 'sub': return `@sub{${inl(inline.c, rr)}}`
        case 'smallcaps': return `@sc{${inl(inline.c, rr)}}`
        case 'span': return inl(inline.c, rr)
        case 'code': return `@code{${texiEscape(inline.text)}}`
        case 'math': return `@math{${inline.text.replace(/[{}]/g, (ch) => `@${ch}`)}}`
        case 'link': { const text = inl(inline.c, rr); return inline.url.startsWith('#') ? `@ref{${text}}` : text === texiEscape(inline.url) ? `@url{${inline.url}}` : `@uref{${inline.url},${text}}` }
        case 'image': return `@image{${inline.url.replace(/\.[a-z]+$/i, '')},,,${texiEscape(inlinesToText(inline.c))},${inline.url.split('.').pop()}}`
        case 'raw': return inline.format === 'texinfo' ? inline.text : ''
        case 'note': return `@footnote{${blks(inline.c, rr).replace(/\n\n/g, '\n')}}`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': {
          const names = ['chapter', 'section', 'subsection', 'subsubsection']
          const unnumbered = ['unnumbered', 'unnumberedsec', 'unnumberedsubsec', 'unnumberedsubsubsec']
          const index = Math.min(block.level, 4) - 1
          const text = inl(block.c, rr)
          return `@node ${inlinesToText(block.c).replace(/[,:.]/g, '')}\n@${options.numberSections ? names[index] : unnumbered[index]} ${text}`
        }
        case 'code': return `@verbatim\n${block.text}\n@end verbatim`
        case 'quote': return `@quotation\n${blks(block.c, rr, depth)}\n@end quotation`
        case 'bullet': return `@itemize @bullet\n${block.items.map((item) => `@item\n${blks(item, rr, depth + 1)}`).join('\n')}\n@end itemize`
        case 'ordered': return `@enumerate${block.style === 'lower-alpha' ? ' a' : block.style === 'upper-alpha' ? ' A' : block.start !== 1 ? ` ${block.start}` : ''}\n${block.items.map((item) => `@item\n${blks(item, rr, depth + 1)}`).join('\n')}\n@end enumerate`
        case 'deflist': return `@table @asis\n${block.items.map((item) => `@item ${inl(item.term, rr)}\n${item.defs.map((def) => blks(def, rr, depth + 1)).join('\n\n')}`).join('\n')}\n@end table`
        case 'hr': return '@iftex\n@bigskip@hrule@bigskip\n@end iftex\n@ifnottex\n------------------------------------------------------------\n@end ifnottex'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const widths = block.aligns.map((_, k) => Math.max(1, ...[block.header, ...block.rows].map((row) => inlinesToText(row[k] ?? []).length)))
          const lines = [`@multitable ${widths.map((w) => `{${'x'.repeat(w)}}`).join(' ')}`]
          if (block.header.length) lines.push(`@headitem ${block.header.map(cell).join(' @tab ')}`)
          for (const row of block.rows) lines.push(`@item ${row.map(cell).join(' @tab ')}`)
          lines.push('@end multitable')
          return (block.caption.length ? `@float Table\n${lines.join('\n')}\n@caption{${inl(block.caption, rr)}}\n@end float` : lines.join('\n'))
        }
        case 'raw': return block.format === 'texinfo' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return `@display\n${block.lines.map((line) => inl(line, rr)).join('\n')}\n@end display`
      }
    })
  const body = blks(doc.blocks, r)
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const meta = metaOf(doc, options)
  const head = [
    '\\input texinfo',
    '@documentencoding UTF-8',
    `@settitle ${texiEscape(meta.title)}`,
    '@titlepage',
    `@title ${texiEscape(meta.title)}`,
    ...(meta.author ? [`@author ${texiEscape(meta.author)}`] : []),
    ...(meta.date ? [`@subtitle ${texiEscape(meta.date)}`] : []),
    '@end titlepage',
    '@node Top',
    `@top ${texiEscape(meta.title)}`,
    ...(options.toc ? ['@contents'] : []),
  ]
  return applyLineEnding(`${head.join('\n')}\n\n${body}\n\n@bye\n`, options)
}

/* ------------------------------------------------------------- roff man/ms */

function roffEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/-/g, '\\-').replace(/'/g, '\\[aq]').replace(/`/g, '\\[ga]').replace(/"/g, '\\[dq]')
}

/** A line that begins with `.` or `'` would be read as a macro; it is guarded with `\&`. */
function roffLine(text: string): string {
  return text.split('\n').map((line) => (/^[.']/.test(line) ? `\\&${line}` : line)).join('\n')
}

function roffRenderer(options: WriterOptions, flavor: 'man' | 'ms'): Renderer {
  return makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return roffEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return '\n'
        case 'linebreak': return '\n.br\n'
        case 'emph': return `\\f[I]${inl(inline.c, rr)}\\f[R]`
        case 'strong': return `\\f[B]${inl(inline.c, rr)}\\f[R]`
        case 'strike': return `[STRIKEOUT:${inl(inline.c, rr)}]`
        case 'underline': return `\\f[I]${inl(inline.c, rr)}\\f[R]`
        case 'sup': return `\\v'-.4m'${inl(inline.c, rr)}\\v'.4m'`
        case 'sub': return `\\v'.4m'${inl(inline.c, rr)}\\v'-.4m'`
        case 'smallcaps': return flavor === 'ms' ? `\\s-2${inl(inline.c, rr).toUpperCase()}\\s+2` : inl(inline.c, rr).toUpperCase()
        case 'span': return inl(inline.c, rr)
        case 'code': return `\\f[C]${roffEscape(inline.text)}\\f[R]`
        case 'math': return flavor === 'ms' ? `@${inline.text}@` : roffEscape(inline.text)
        case 'link': { const text = inl(inline.c, rr); return text === roffEscape(inline.url) ? `\\c\n.UR ${inline.url}\n.UE \\c\n` : `${text} <${inline.url}>` }
        case 'image': return `[IMAGE: ${roffEscape(inlinesToText(inline.c) || inline.url)}]`
        case 'raw': return inline.format === 'man' || inline.format === 'ms' || inline.format === 'roff' ? inline.text : ''
        case 'note': {
          if (flavor === 'ms') return `\\**\n.FS\n${blks(inline.c, rr)}\n.FE\n`
          rr.notes.push(blks(inline.c, rr))
          return `[${rr.notes.length}]`
        }
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': return `${depth ? '' : (flavor === 'ms' ? '.PP\n' : '.PP\n')}${roffLine(wrapText(inl(block.c, rr), options))}`
        case 'plain': return roffLine(wrapText(inl(block.c, rr), options))
        case 'header': {
          const text = inl(block.c, rr)
          if (flavor === 'ms') return `.NH ${Math.min(block.level, 5)}\n${text}`
          return block.level === 1 ? `.SH ${text.toUpperCase()}` : `.SS ${text}`
        }
        case 'code': return `.IP\n.nf\n\\f[C]\n${roffLine(block.text.replace(/\\/g, '\\\\'))}\n\\f[R]\n.fi`
        case 'quote': return flavor === 'ms' ? `.QS\n${blks(block.c, rr, depth)}\n.QE` : `.RS\n${blks(block.c, rr, depth)}\n.RE`
        case 'bullet': return block.items.map((item, index) => {
          const task = block.tasks?.[index]
          const bullet = task === undefined || task === null ? '\\[bu]' : task ? '\\[u2612]' : '\\[u2610]'
          const { text, rest } = splitItem(item)
          return `.IP ${bullet} 2\n${text ? roffLine(inl(text, rr)) : ''}${rest.length ? `\n.RS 2\n${blks(rest, rr, depth + 1)}\n.RE` : ''}`
        }).join('\n')
        case 'ordered': return block.items.map((item, index) => {
          const { text, rest } = splitItem(item)
          return `.IP "${block.start + index}." 4\n${text ? roffLine(inl(text, rr)) : ''}${rest.length ? `\n.RS 4\n${blks(rest, rr, depth + 1)}\n.RE` : ''}`
        }).join('\n')
        case 'deflist': return block.items.map((item) => `.TP\n\\f[B]${inl(item.term, rr)}\\f[R]\n${item.defs.map((def) => blks(def, rr, depth + 1).replace(/^\.PP\n/gm, '')).join('\n.RS\n.RE\n')}`).join('\n')
        case 'hr': return flavor === 'ms' ? '.PP\n  *  *  *  *  *' : '.PP\n  *  *  *  *  *'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ').replace(/\t/g, ' ')
          const spec = (bold: boolean) => block.aligns.map((align) => `${align === 'right' ? 'r' : align === 'center' ? 'c' : 'l'}${bold ? 'b' : ''}`).join(' ')
          const lines = ['.PP', '.TS', 'tab(@);']
          if (block.header.length) lines.push(`${spec(true)}`)
          lines.push(`${spec(false)}.`)
          if (block.header.length) lines.push(block.header.map(cell).join('@'), '_')
          for (const row of block.rows) lines.push(row.map(cell).join('@'))
          lines.push('.TE')
          if (block.caption.length) lines.push('.PP', `\\f[I]${inl(block.caption, rr)}\\f[R]`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'man' || block.format === 'ms' || block.format === 'roff' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return `.PP\n.nf\n${block.lines.map((line) => roffLine(inl(line, rr))).join('\n')}\n.fi`
      }
    })
}

export function writeMan(doc: Doc, options: WriterOptions): string {
  const r = roffRenderer(options, 'man')
  const meta = metaOf(doc, options)
  const parts: string[] = []
  if (options.standalone) {
    const [, name, section] = /^(.*?)\((\d[a-z]*)\)\s*$/.exec(meta.title) ?? [null, meta.title, '1']
    parts.push(`.\\" Automatically generated by My Document Converter\n.TH "${roffEscape((name || 'UNTITLED').toUpperCase())}" "${section || '1'}" "${roffEscape(meta.date)}" "${roffEscape(meta.author)}" ""`)
  }
  parts.push(blks(doc.blocks, r, 0, '\n'))
  if (r.notes.length) parts.push(`.SH NOTES\n${r.notes.map((note, index) => `.IP [${index + 1}]\n${note}`).join('\n')}`)
  return finish(parts, options).replace(/\n\n+/g, '\n')
}

export function writeMs(doc: Doc, options: WriterOptions): string {
  const r = roffRenderer(options, 'ms')
  const meta = metaOf(doc, options)
  const parts: string[] = []
  if (options.standalone) {
    const head = ['.\\" Automatically generated by My Document Converter', `.ds PS ${options.pageSize === 'Letter' ? '11i' : '29.7c'}`, `.nr PO ${options.marginMm}m`, `.nr LL ${options.pageSize === 'Letter' ? '6.5i' : '17c'}`]
    if (meta.title) head.push('.TL', roffEscape(meta.title))
    if (meta.author) head.push('.AU', roffEscape(meta.author))
    if (meta.date) head.push('.DA', roffEscape(meta.date))
    if (options.toc) head.push('.TC')
    parts.push(head.join('\n'))
  }
  parts.push(blks(doc.blocks, r, 0, '\n'))
  return finish(parts, options).replace(/\n\n+/g, '\n')
}

/* ------------------------------------------------------------------ Beamer */

export function writeBeamer(doc: Doc, options: WriterOptions): string {
  const level = slideLevel(doc.blocks)
  const frames: string[] = []
  const numbers = { above: 0 }
  void numbers
  const body = (blocks: Block[]) => writeLatex({ meta: {}, blocks }, { ...options, standalone: false })
  for (const slide of slidesAt(doc.blocks, level)) {
    const sectionHeaders = slide.blocks.filter((block): block is Extract<Block, { t: 'header' }> => block.t === 'header' && block.level < level)
    for (const heading of sectionHeaders) frames.push(`\\${['section', 'subsection', 'subsubsection'][Math.min(heading.level, 3) - 1]}{${body([{ t: 'plain', c: heading.c }]).trim()}}`)
    const content = slide.blocks.filter((block) => !(block.t === 'header' && block.level < level))
    if (!slide.title && !content.length) continue
    const title = slide.title && !(slide.blocks[0]?.t === 'header' && slide.blocks[0].level < level && sectionHeaders.length && !content.length) ? body([{ t: 'plain', c: slide.title }]).trim() : ''
    const fragile = content.some((block) => block.t === 'code') ? '[fragile]' : ''
    frames.push(`\\begin{frame}${fragile}{${title}}\n${body(content).trim()}\n\\end{frame}`)
  }
  const text = frames.join('\n\n')
  if (!options.standalone) return applyLineEnding(`${text}\n`, options)
  const meta = metaOf(doc, options)
  const esc = (value: string) => value.replace(/[\\{}$&#^_%~]/g, (ch) => ({ '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '&': '\\&', '#': '\\#', '^': '\\^{}', _: '\\_', '%': '\\%', '~': '\\textasciitilde{}' })[ch] ?? ch)
  const head = [
    '\\documentclass[ignorenonframetext]{beamer}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{booktabs}',
    '\\usepackage{ulem}',
    '\\usepackage{hyperref}',
    ...(/[\uac00-\ud7a3]/.test(text + meta.title) ? ['\\usepackage{kotex}'] : []),
    ...(/\\begin\{lstlisting\}/.test(text) ? ['\\usepackage{listings}', '\\lstset{basicstyle=\\ttfamily\\small,breaklines=true}'] : []),
    '\\usetheme{default}',
    '\\setbeamertemplate{navigation symbols}{}',
    meta.title ? `\\title{${esc(meta.title)}}` : '',
    meta.author ? `\\author{${esc(meta.author)}}` : '',
    meta.date ? `\\date{${esc(meta.date)}}` : '\\date{}',
    '',
    '\\begin{document}',
    ...(meta.title ? ['\\frame{\\titlepage}'] : []),
    ...(options.toc ? ['\\begin{frame}{Outline}', '\\tableofcontents', '\\end{frame}'] : []),
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '')
  return applyLineEnding(`${head.join('\n')}\n\n${text}\n\n\\end{document}\n`, options)
}
