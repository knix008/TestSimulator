/**
 * Writers for Djot, Typst, Haddock and ANSI terminal text, and the
 * AsciiDoc variants (asciidoctor, legacy), HTML4, chunked HTML and EPUB 2.
 */
import JSZip from 'jszip'
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { encodeEntities } from '../htmlParse'
import { applyLineEnding, wrapText, type WriterOptions } from '../options'
import { sectionize, type Section } from '../sections'
import { blks, finish, indent, inl, makeRenderer, metaOf, numbered, splitItem } from './render'
import { writeAsciiDoc, displayWidth } from './markup'
import { blocksHtml, htmlBody, htmlDocument, inlinesHtml, stylesheet, writeHtml } from './html'
import { writeEpub } from './epub'

/* -------------------------------------------------------------------- Djot */

export function writeDjot(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/([*_~^`{}[\]\\])/g, '\\$1')
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'preserve' ? '\n' : ' '
        case 'linebreak': return '\\\n'
        case 'emph': return `_${inl(inline.c, rr)}_`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `{-${inl(inline.c, rr)}-}`
        case 'underline': return `{+${inl(inline.c, rr)}+}`
        case 'sup': return `^${inl(inline.c, rr)}^`
        case 'sub': return `~${inl(inline.c, rr)}~`
        case 'smallcaps': return `[${inl(inline.c, rr)}]{.smallcaps}`
        case 'span': return `[${inl(inline.c, rr)}]`
        case 'code': return `\`${inline.text}\``
        case 'math': return inline.display ? `$$\`${inline.text}\`` : `$\`${inline.text}\``
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `<${inline.url}>` : `[${text}](${inline.url})` }
        case 'image': return `![${inl(inline.c, rr)}](${inline.url})`
        case 'raw': return inline.format === 'html' ? `\`${inline.text}\`{=html}` : inline.format === 'djot' ? inline.text : ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return `[^${rr.notes.length}]` }
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${block.id && block.id !== defaultSlug(block) ? `{#${block.id}}\n` : ''}${'#'.repeat(block.level)} ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return `\`\`\`${block.lang ? ` ${block.lang}` : ''}\n${block.text}\n\`\`\``
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n')
        case 'bullet': return block.items.map((item, index) => { const task = block.tasks?.[index]; return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), '  ', task === undefined || task === null ? '- ' : task ? '- [x] ' : '- [ ] ') }).join(block.tight === false ? '\n\n' : '\n')
        case 'ordered': return block.items.map((item, index) => { const label = `${block.start + index}. `; return indent(blks(item, rr, depth + 1, block.tight === false ? '\n\n' : '\n'), ' '.repeat(label.length), label) }).join(block.tight === false ? '\n\n' : '\n')
        case 'deflist': return block.items.map((item) => `: ${inl(item.term, rr)}\n\n${item.defs.map((def) => indent(blks(def, rr, depth + 1), '  ')).join('\n\n')}`).join('\n\n')
        case 'hr': return '* * * *'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\|/g, '\\|').replace(/\n/g, ' ')
          const header = block.header.length ? block.header.map(cell) : block.aligns.map(() => '')
          const lines = [`| ${header.join(' | ')} |`, `| ${block.aligns.map((align) => (align === 'left' ? ':--' : align === 'right' ? '--:' : align === 'center' ? ':-:' : '---')).join(' | ')} |`]
          for (const row of block.rows) lines.push(`| ${row.map(cell).join(' | ')} |`)
          if (block.caption.length) lines.push('', `^ ${inl(block.caption, rr)}`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' ? `\`\`\` =html\n${block.text}\n\`\`\`` : block.format === 'djot' ? block.text : ''
        case 'div': return `${block.attrs?.classes?.length ? `::: ${block.attrs.classes.join(' ')}` : ':::'}\n${blks(block.c, rr, depth)}\n:::`
        case 'linebl': return block.lines.map((line) => `${inl(line, rr)}\\`).join('\n')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`{title="${meta.title.replace(/"/g, '\\"')}"${meta.author ? ` author="${meta.author.replace(/"/g, '\\"')}"` : ''}${meta.date ? ` date="${meta.date}"` : ''}}\n# ${meta.title}`)
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `[^${index + 1}]: ${note.split('\n').join('\n    ')}`).join('\n\n'))
  return finish(parts, options)
}

function defaultSlug(block: Extract<Block, { t: 'header' }>) {
  return inlinesToText(block.c).toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-').replace(/^[^\p{L}_]+/u, '') || 'section'
}

/* ------------------------------------------------------------------- Typst */

function typstEscape(text: string): string {
  return text.replace(/([*_`#$\\<>@\[\]~])/g, '\\$1')
}

export function writeTypst(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return typstEscape(inline.text)
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\\\n'
        case 'emph': return `_${inl(inline.c, rr)}_`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `#strike[${inl(inline.c, rr)}]`
        case 'underline': return `#underline[${inl(inline.c, rr)}]`
        case 'sup': return `#super[${inl(inline.c, rr)}]`
        case 'sub': return `#sub[${inl(inline.c, rr)}]`
        case 'smallcaps': return `#smallcaps[${inl(inline.c, rr)}]`
        case 'span': return `#box[${inl(inline.c, rr)}]`
        case 'code': return inline.text.includes('`') ? `#raw("${inline.text.replace(/["\\]/g, '\\$&')}")` : `\`${inline.text}\``
        case 'math': return inline.display ? `$ ${inline.text} $` : `$${inline.text}$`
        case 'link': { const text = inl(inline.c, rr); return text === typstEscape(inline.url) ? `#link("${inline.url}")` : `#link("${inline.url}")[${text}]` }
        case 'image': return `#image("${inline.url}"${inline.c.length ? `, alt: "${inlinesToText(inline.c).replace(/"/g, '\\"')}"` : ''})`
        case 'raw': return inline.format === 'typst' ? inline.text : ''
        case 'note': return `#footnote[${blks(inline.c, rr).replace(/\n\n/g, '\n')}]`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${'='.repeat(Math.min(block.level, 6))} ${inl(block.c, rr)}${block.id ? ` <${block.id}>` : ''}`
        case 'code': return `\`\`\`${block.lang ?? ''}\n${block.text}\n\`\`\``
        case 'quote': return `#quote(block: true)[\n${blks(block.c, rr, depth)}\n]`
        case 'bullet': return block.items.map((item, index) => { const task = block.tasks?.[index]; return indent(blks(item, rr, depth + 1, '\n'), '  ', task === undefined || task === null ? '- ' : task ? '- ☒ ' : '- ☐ ') }).join('\n')
        case 'ordered': return block.items.map((item) => indent(blks(item, rr, depth + 1, '\n'), '  ', '+ ')).join('\n')
        case 'deflist': return block.items.map((item) => `/ ${inl(item.term, rr)}: ${item.defs.map((def) => blks(def, rr, depth + 1).replace(/\n\n/g, ' ')).join(' ')}`).join('\n')
        case 'hr': return '#horizontalrule'
        case 'table': {
          const cell = (c: Inline[]) => `[${inl(c, rr).replace(/\n/g, ' ')}]`
          const lines = ['#figure(', `  align(center)[#table(`, `    columns: ${block.aligns.length},`, `    align: (${block.aligns.map((align) => (align === 'right' ? 'right' : align === 'center' ? 'center' : 'left')).join(',')},),`]
          if (block.header.length) lines.push(`    table.header(${block.header.map(cell).join(', ')},),`)
          for (const row of block.rows) lines.push(`    ${row.map(cell).join(', ')},`)
          lines.push('  )]', block.caption.length ? `  , caption: [${inl(block.caption, rr)}]` : '  , kind: table', ')')
          return lines.join('\n')
        }
        case 'raw': return block.format === 'typst' ? block.text : ''
        case 'div': return block.attrs?.classes?.includes('center') ? `#align(center)[\n${blks(block.c, rr, depth)}\n]` : `#block[\n${blks(block.c, rr, depth)}\n]`
        case 'linebl': return block.lines.map((line) => `${inl(line, rr)} \\`).join('\n')
      }
    })
  const body = blks(doc.blocks, r)
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const meta = metaOf(doc, options)
  const head = [
    '// Typst document produced by My Document Converter',
    `#let horizontalrule = [#line(start: (25%, 0%), end: (75%, 0%))]`,
    `#set document(${[meta.title ? `title: "${meta.title.replace(/"/g, '\\"')}"` : '', meta.author ? `author: "${meta.author.replace(/"/g, '\\"')}"` : ''].filter(Boolean).join(', ') || 'title: ""'})`,
    `#set page(paper: "${options.pageSize.toLowerCase()}", margin: ${options.marginMm}mm${options.landscape ? ', flipped: true' : ''}, numbering: "1")`,
    `#set text(size: ${options.fontSize}, lang: "${/[\uac00-\ud7a3]/.test(body + meta.title) ? 'ko' : 'en'}")`,
    `#set par(justify: true)`,
    ...(options.numberSections ? ['#set heading(numbering: "1.1")'] : []),
    ...(meta.title ? ['', `#align(center)[#block(inset: 2em)[`, `#text(weight: "bold", size: 1.5em)[${typstEscape(meta.title)}]`, ...(meta.author ? [`\\`, `#text(size: 1.1em)[${typstEscape(meta.author)}]`] : []), ...(meta.date ? [`\\`, `${typstEscape(meta.date)}`] : []), ']]'] : []),
    ...(options.toc ? ['', '#outline()'] : []),
  ]
  return applyLineEnding(`${head.join('\n')}\n\n${body}\n`, options)
}

/* ----------------------------------------------------------------- Haddock */

export function writeHaddock(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/([\\/'`"@<>])/g, '\\$1')
        case 'space': return ' '
        case 'softbreak': return options.wrap === 'none' ? ' ' : '\n'
        case 'linebreak': return '\n'
        case 'emph': return `/${inl(inline.c, rr)}/`
        case 'strong': return `__${inl(inline.c, rr)}__`
        case 'strike': case 'underline': case 'smallcaps': case 'span': case 'sup': case 'sub': return inl(inline.c, rr)
        case 'code': return `@${inline.text.replace(/@/g, '\\@')}@`
        case 'math': return `@${inline.text}@`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `<${inline.url}>` : `[${text}](${inline.url})` }
        case 'image': return `<<${inline.url}${inline.c.length ? ` ${inlinesToText(inline.c)}` : ''}>>`
        case 'raw': return inline.format === 'haddock' ? inline.text : ''
        case 'note': return ` (${blks(inline.c, rr).replace(/\n/g, ' ')})`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${'='.repeat(Math.min(block.level, 6))} ${inl(block.c, rr)}`
        case 'code': return `@\n${block.text.replace(/@/g, '\\@')}\n@`
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => `> ${line}`).join('\n')
        case 'bullet': return block.items.map((item) => indent(blks(item, rr, depth + 1, '\n'), '  ', '* ')).join('\n\n')
        case 'ordered': return block.items.map((item, index) => indent(blks(item, rr, depth + 1, '\n'), '   ', `${block.start + index}. `)).join('\n\n')
        case 'deflist': return block.items.map((item) => `[${inl(item.term, rr)}]: ${item.defs.map((def) => blks(def, rr, depth + 1).replace(/\n\n/g, '\n')).join(' ')}`).join('\n\n')
        case 'hr': return ''
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const rows = [...(block.header.length ? [block.header.map(cell)] : []), ...block.rows.map((row) => row.map(cell))]
          const widths = block.aligns.map((_, k) => Math.max(1, ...rows.map((row) => displayWidth(row[k] ?? ''))))
          const rule = (ch: string) => `+${widths.map((w) => ch.repeat(w + 2)).join('+')}+`
          const line = (cells: string[]) => `|${cells.map((text, k) => ` ${text}${' '.repeat(widths[k] - displayWidth(text))} `).join('|')}|`
          const out = [rule('-')]
          rows.forEach((row, index) => { out.push(line(row), rule(index === 0 && block.header.length ? '=' : '-')) })
          return out.join('\n')
        }
        case 'raw': return block.format === 'haddock' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\n')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`= ${meta.title}`)
  parts.push(blks(doc.blocks, r))
  return finish(parts, options)
}

/* -------------------------------------------------------------------- ANSI */

const ESC = '\u001b['

export function writeAnsi(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\n'
        case 'emph': return `${ESC}3m${inl(inline.c, rr)}${ESC}23m`
        case 'strong': return `${ESC}1m${inl(inline.c, rr)}${ESC}22m`
        case 'strike': return `${ESC}9m${inl(inline.c, rr)}${ESC}29m`
        case 'underline': return `${ESC}4m${inl(inline.c, rr)}${ESC}24m`
        case 'sup': return `^${inl(inline.c, rr)}`
        case 'sub': return `_${inl(inline.c, rr)}`
        case 'smallcaps': return inl(inline.c, rr).toUpperCase()
        case 'span': return inl(inline.c, rr)
        case 'code': return `${ESC}36m${inline.text}${ESC}39m`
        case 'math': return `${ESC}35m${inline.text}${ESC}39m`
        case 'link': { const text = inl(inline.c, rr); return `${ESC}4;34m${text}${ESC}24;39m${text === inline.url ? '' : ` (${inline.url})`}` }
        case 'image': return `${ESC}2m[image: ${inlinesToText(inline.c) || inline.url}]${ESC}22m`
        case 'raw': return ''
        case 'note': { rr.notes.push(blks(inline.c, rr)); return `${ESC}33m[${rr.notes.length}]${ESC}39m` }
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return wrapText(inl(block.c, rr), options)
        case 'header': return `${ESC}1;${block.level === 1 ? '34' : block.level === 2 ? '36' : '32'}m${numbered(block, rr)}${inl(block.c, rr)}${ESC}22;39m${block.level === 1 ? `\n${ESC}34m${'═'.repeat(Math.min(72, displayWidth(inlinesToText(block.c)) + 2))}${ESC}39m` : ''}`
        case 'code': return block.text.split('\n').map((line) => `    ${ESC}36m${line}${ESC}39m`).join('\n')
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => `${ESC}2m│${ESC}22m ${line}`).join('\n')
        case 'bullet': return block.items.map((item, index) => { const task = block.tasks?.[index]; const { text, rest } = splitItem(item); return `${'  '.repeat(depth)}${ESC}33m${task === undefined || task === null ? '•' : task ? '☒' : '☐'}${ESC}39m ${text ? inl(text, rr) : ''}${rest.length ? `\n${blks(rest, rr, depth + 1)}` : ''}` }).join('\n')
        case 'ordered': return block.items.map((item, index) => { const { text, rest } = splitItem(item); return `${'  '.repeat(depth)}${ESC}33m${block.start + index}.${ESC}39m ${text ? inl(text, rr) : ''}${rest.length ? `\n${blks(rest, rr, depth + 1)}` : ''}` }).join('\n')
        case 'deflist': return block.items.map((item) => `${ESC}1m${inl(item.term, rr)}${ESC}22m\n${item.defs.map((def) => indent(blks(def, rr, depth + 1), '    ')).join('\n')}`).join('\n')
        case 'hr': return `${ESC}2m${'─'.repeat(Math.min(72, options.columns))}${ESC}22m`
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const plain = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '')
          const rows = [...(block.header.length ? [block.header.map(cell)] : []), ...block.rows.map((row) => row.map(cell))]
          const widths = block.aligns.map((_, k) => Math.max(1, ...rows.map((row) => displayWidth(plain(row[k] ?? '')))))
          const line = (cells: string[]) => cells.map((text, k) => `${text}${' '.repeat(widths[k] - displayWidth(plain(text)))}`).join(`  ${ESC}2m│${ESC}22m  `)
          const out: string[] = []
          rows.forEach((row, index) => {
            out.push(index === 0 && block.header.length ? `${ESC}1m${line(row)}${ESC}22m` : line(row))
            if (index === 0 && block.header.length) out.push(`${ESC}2m${widths.map((w) => '─'.repeat(w)).join('──┼──')}${ESC}22m`)
          })
          if (block.caption.length) out.push(`${ESC}3m${inl(block.caption, rr)}${ESC}23m`)
          return out.join('\n')
        }
        case 'raw': return ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\n')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`${ESC}1;4m${meta.title}${ESC}22;24m${meta.author ? `\n${meta.author}` : ''}${meta.date ? `\n${meta.date}` : ''}`)
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `${ESC}33m[${index + 1}]${ESC}39m ${note}`).join('\n'))
  return finish(parts, options)
}

/* ------------------------------------------------------------ AsciiDoc */

/** Asciidoctor is the modern dialect; "legacy" is the original tool's. The differences that matter here are the strong/emph and admonition forms. */
export function writeAsciiDocVariant(doc: Doc, options: WriterOptions, variant: 'asciidoctor' | 'asciidoc_legacy'): string {
  const text = writeAsciiDoc(doc, options)
  if (variant === 'asciidoctor') return text
  // Legacy AsciiDoc: single-quoted emphasis, `+mono+` literal, no `[cols]` attribute list on tables.
  return text.replace(/(^|[^_])_([^_\n]+)_(?![_\w])/g, "$1'$2'").replace(/\[cols="[^"]*"(,options="header")?\]\n/g, '')
}

/* ----------------------------------------------------------------- HTML 4 */

export function writeHtml4(doc: Doc, options: WriterOptions): string {
  const html = writeHtml(doc, options)
  if (!options.standalone) return html
  return html
    .replace('<!DOCTYPE html>', '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">')
    .replace('<html lang="">', '<html xmlns="http://www.w3.org/1999/xhtml">')
    .replace('<meta charset="utf-8" />', '<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />')
    .replace(/<(header|nav|section|footer)( [^>]*)?>/g, '<div class="$1"$2>').replace(/<\/(header|nav|section|footer)>/g, '</div>')
    .replace(/ role="doc-[a-z]+"/g, '')
}

/* ------------------------------------------------------------ chunked HTML */

/** One HTML file per top-level section, an index with the table of contents, and prev/next/up links. */
export async function writeChunkedHtml(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  const meta = metaOf(doc, options)
  const sections = sectionize(doc.blocks)
  const zip = new JSZip()
  const esc = encodeEntities
  const chunks: { file: string; title: string; section: Section }[] = sections.map((section, index) => ({ file: `${section.id || `section-${index + 1}`}.html`, title: section.title ? inlinesToText(section.title) : meta.title || 'Untitled', section }))
  const nav = (index: number) => {
    const prev = index > 0 ? chunks[index - 1] : null
    const next = index < chunks.length - 1 ? chunks[index + 1] : null
    return `<nav class="chunk-nav"><a href="index.html">${esc(meta.title || 'Contents')}</a>${prev ? ` · <a href="${prev.file}">‹ ${esc(prev.title)}</a>` : ''}${next ? ` · <a href="${next.file}">${esc(next.title)} ›</a>` : ''}</nav>`
  }
  const css = `${stylesheet(options)}\n.chunk-nav { margin: 1em 0; padding: 0.5em 0; border-bottom: 1px solid #ccc; font-size: 0.9em; }`
  const state = { options: { ...options, standalone: false }, notes: [] as string[], numbers: [] as number[] }
  const render = (section: Section): string => {
    const parts: string[] = []
    if (section.title) parts.push(`<h${section.level} id="${esc(section.id)}">${inlinesHtml(section.title, state)}</h${section.level}>`)
    parts.push(blocksHtml(section.blocks, state))
    for (const child of section.children) parts.push(render(child))
    return parts.filter(Boolean).join('\n')
  }
  chunks.forEach((chunk, index) => {
    state.notes = []
    const body = `${nav(index)}\n${render(chunk.section)}${state.notes.length ? `\n<section class="footnotes"><hr /><ol>${state.notes.map((note, k) => `<li id="fn${k + 1}">${note}</li>`).join('')}</ol></section>` : ''}\n${nav(index)}`
    zip.file(chunk.file, htmlDocument({ meta: { title: chunk.title }, blocks: [] }, body, { ...options, standalone: true, htmlStyle: 'none' }).replace('</head>', `<style>${css}</style>\n</head>`))
  })
  const toc = `<ul>${chunks.map((chunk) => `<li><a href="${chunk.file}">${esc(chunk.title)}</a>${chunk.section.children.length ? `<ul>${chunk.section.children.map((child) => `<li><a href="${chunk.file}#${esc(child.id)}">${esc(child.title ? inlinesToText(child.title) : '')}</a></li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`
  const index = `<header id="title-block-header"><h1 class="title">${esc(meta.title || 'Untitled')}</h1>${meta.author ? `<p class="author">${esc(meta.author)}</p>` : ''}${meta.date ? `<p class="date">${esc(meta.date)}</p>` : ''}</header>\n<nav id="TOC">${toc}</nav>`
  zip.file('index.html', htmlDocument(doc, index, { ...options, standalone: true, htmlStyle: 'none' }).replace('</head>', `<style>${css}</style>\n</head>`))
  zip.file('sitemap.json', JSON.stringify({ title: meta.title, chunks: chunks.map((chunk) => ({ file: chunk.file, title: chunk.title })) }, null, 2))
  void htmlBody
  return zip.generateAsync({ type: 'uint8array' })
}

/* ------------------------------------------------------------------ EPUB 2 */

/** EPUB 2: the same package with an OPF 2.0 manifest and a toc.ncx. */
export async function writeEpub2(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  const bytes = await writeEpub(doc, options)
  const zip = await JSZip.loadAsync(bytes)
  const meta = metaOf(doc, options)
  const opf = await zip.file('EPUB/package.opf')!.async('string')
  const items = [...opf.matchAll(/<item id="([^"]+)" href="([^"]+)" media-type="([^"]+)"[^>]*\/>/g)].map((match) => ({ id: match[1], href: match[2], type: match[3] }))
  const spine = [...opf.matchAll(/<itemref idref="([^"]+)"\/>/g)].map((match) => match[1])
  const esc = encodeEntities
  const identifier = /<dc:identifier[^>]*>([^<]*)<\/dc:identifier>/.exec(opf)?.[1] ?? 'urn:uuid:0'
  zip.file('EPUB/package.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="pub-id">${esc(identifier)}</dc:identifier>
    <dc:title>${esc(meta.title || 'Untitled')}</dc:title>
    <dc:language>${/[\uac00-\ud7a3]/.test(meta.title) ? 'ko' : 'en'}</dc:language>
    ${meta.author ? `<dc:creator opf:role="aut">${esc(meta.author)}</dc:creator>` : ''}
    ${meta.date ? `<dc:date>${esc(meta.date)}</dc:date>` : ''}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${items.filter((item) => item.id !== 'nav').map((item) => `    <item id="${item.id}" href="${item.href}" media-type="${item.type}"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${spine.map((id) => `    <itemref idref="${id}"/>`).join('\n')}
  </spine>
</package>`)
  const chapters = items.filter((item) => spine.includes(item.id))
  const titles = await Promise.all(chapters.map(async (item) => { const html = await zip.file(`EPUB/${item.href}`)!.async('string'); return /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? item.id }))
  zip.file('EPUB/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${esc(identifier)}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
  <docTitle><text>${esc(meta.title || 'Untitled')}</text></docTitle>
  <navMap>
${chapters.map((item, index) => `    <navPoint id="navPoint-${index + 1}" playOrder="${index + 1}"><navLabel><text>${titles[index]}</text></navLabel><content src="${item.href}"/></navPoint>`).join('\n')}
  </navMap>
</ncx>`)
  zip.remove('EPUB/nav.xhtml')
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
}
