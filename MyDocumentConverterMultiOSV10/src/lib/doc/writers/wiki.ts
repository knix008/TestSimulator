/**
 * Writers for the wiki dialects Pandoc writes: DokuWiki, XWiki, ZimWiki,
 * Jira and Emacs Muse. (MediaWiki lives in markup.ts.)
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import type { WriterOptions } from '../options'
import { blks, finish, indent, inl, makeRenderer, metaOf, numbered, splitItem, type Renderer } from './render'

/** Lists with prefix markers repeated per depth (`*`, `**`, `#`), Jira/Creole style. */
function markerList(block: Extract<Block, { t: 'bullet' } | { t: 'ordered' }>, r: Renderer, depth: number, bullet: string, number: string, join = '\n'): string {
  const marker = (block.t === 'bullet' ? bullet : number).repeat(depth + 1)
  return block.items.map((item, index) => {
    const { text, rest } = splitItem(item)
    const task = block.t === 'bullet' ? block.tasks?.[index] : undefined
    const box = task === undefined || task === null ? '' : task ? '☒ ' : '☐ '
    const lines = [`${marker} ${box}${text ? inl(text, r) : ''}`]
    for (const child of rest) {
      if (child.t === 'bullet' || child.t === 'ordered') lines.push(markerList(child, r, depth + 1, bullet, number, join))
      else lines.push(r.block(child, r, depth + 1))
    }
    return lines.join('\n')
  }).join(join)
}

/** Lists with indentation per depth (`  * `, `    * `), DokuWiki style. */
function indentedList(block: Extract<Block, { t: 'bullet' } | { t: 'ordered' }>, r: Renderer, depth: number, bullet: string, number: string, unit = '  '): string {
  const pad = unit.repeat(depth + 1)
  const marker = block.t === 'bullet' ? bullet : number
  return block.items.map((item, index) => {
    const { text, rest } = splitItem(item)
    const task = block.t === 'bullet' ? block.tasks?.[index] : undefined
    const box = task === undefined || task === null ? '' : task ? '☒ ' : '☐ '
    const lines = [`${pad}${marker} ${box}${text ? inl(text, r) : ''}`]
    for (const child of rest) {
      if (child.t === 'bullet' || child.t === 'ordered') lines.push(indentedList(child, r, depth + 1, bullet, number, unit))
      else lines.push(indent(r.block(child, r, depth + 1), pad + unit))
    }
    return lines.join('\n')
  }).join('\n')
}

/* ---------------------------------------------------------------- DokuWiki */

export function writeDokuWiki(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/(\*\*|\/\/|__|''|\[\[|\{\{|\\\\)/g, '%%$1%%')
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\\\\ '
        case 'emph': return `//${inl(inline.c, rr)}//`
        case 'strong': return `**${inl(inline.c, rr)}**`
        case 'strike': return `<del>${inl(inline.c, rr)}</del>`
        case 'underline': return `__${inl(inline.c, rr)}__`
        case 'sup': return `<sup>${inl(inline.c, rr)}</sup>`
        case 'sub': return `<sub>${inl(inline.c, rr)}</sub>`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `''${inline.text}''`
        case 'math': return `<latex>${inline.text}</latex>`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[[${inline.url}]]` : `[[${inline.url}|${text}]]` }
        case 'image': return `{{${inline.url}${inline.c.length ? `|${inlinesToText(inline.c)}` : ''}}}`
        case 'raw': return inline.format === 'html' ? `<html>${inline.text}</html>` : inline.format === 'dokuwiki' ? inline.text : ''
        case 'note': return `((${blks(inline.c, rr).replace(/\n/g, ' ')}))`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': { const eq = '='.repeat(Math.max(1, 7 - Math.min(block.level, 6))); return `${eq} ${numbered(block, rr)}${inl(block.c, rr)} ${eq}` }
        case 'code': return `<code${block.lang ? ` ${block.lang}` : ''}>\n${block.text}\n</code>`
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => `> ${line}`).join('\n')
        case 'bullet': case 'ordered': return indentedList(block, rr, depth, '*', '-')
        case 'deflist': return block.items.map((item) => `; ${inl(item.term, rr)}\n${item.defs.map((def) => `: ${blks(def, rr, depth + 1).replace(/\n/g, ' ')}`).join('\n')}`).join('\n')
        case 'hr': return '----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const lines: string[] = []
          if (block.header.length) lines.push(`^ ${block.header.map(cell).join(' ^ ')} ^`)
          for (const row of block.rows) lines.push(`| ${row.map(cell).join(' | ')} |`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' ? `<html>\n${block.text}\n</html>` : block.format === 'dokuwiki' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join(' \\\\ ')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`====== ${meta.title} ======`)
  parts.push(blks(doc.blocks, r))
  return finish(parts, options)
}

/* ------------------------------------------------------------------- XWiki */

export function writeXWiki(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/(\*\*|\/\/|__|--|##|\^\^|,,|\[\[|\{\{|~)/g, '~$1')
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\\\\'
        case 'emph': return `//${inl(inline.c, rr)}//`
        case 'strong': return `**${inl(inline.c, rr)}**`
        case 'strike': return `--${inl(inline.c, rr)}--`
        case 'underline': return `__${inl(inline.c, rr)}__`
        case 'sup': return `^^${inl(inline.c, rr)}^^`
        case 'sub': return `,,${inl(inline.c, rr)},,`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `##${inline.text}##`
        case 'math': return `{{formula}}${inline.text}{{/formula}}`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[[${inline.url}]]` : `[[${text}>>${inline.url}]]` }
        case 'image': return `[[image:${inline.url}]]`
        case 'raw': return inline.format === 'html' ? `{{html}}${inline.text}{{/html}}` : inline.format === 'xwiki' ? inline.text : ''
        case 'note': return `{{footnote}}${blks(inline.c, rr).replace(/\n/g, ' ')}{{/footnote}}`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': { const eq = '='.repeat(Math.min(block.level, 6)); return `${eq} ${numbered(block, rr)}${inl(block.c, rr)} ${eq}` }
        case 'code': return `{{code${block.lang ? ` language="${block.lang}"` : ''}}}\n${block.text}\n{{/code}}`
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => `> ${line}`).join('\n')
        case 'bullet': case 'ordered': return markerList(block, rr, depth, '*', '1', '\n').replace(/^(1+) /gm, (_m, ones: string) => `${'1'.repeat(ones.length)}. `)
        case 'deflist': return block.items.map((item) => `; ${inl(item.term, rr)}\n${item.defs.map((def) => `: ${blks(def, rr, depth + 1).replace(/\n/g, ' ')}`).join('\n')}`).join('\n')
        case 'hr': return '----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const lines: string[] = []
          if (block.header.length) lines.push(`|=${block.header.map(cell).join('|=')}`)
          for (const row of block.rows) lines.push(`|${row.map(cell).join('|')}`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' ? `{{html}}\n${block.text}\n{{/html}}` : block.format === 'xwiki' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\\\\\n')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`= ${meta.title} =`)
  parts.push(blks(doc.blocks, r))
  return finish(parts, options)
}

/* ----------------------------------------------------------------- ZimWiki */

export function writeZimWiki(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\n'
        case 'emph': return `//${inl(inline.c, rr)}//`
        case 'strong': return `**${inl(inline.c, rr)}**`
        case 'strike': return `~~${inl(inline.c, rr)}~~`
        case 'underline': return `__${inl(inline.c, rr)}__`
        case 'sup': return `^{${inl(inline.c, rr)}}`
        case 'sub': return `_{${inl(inline.c, rr)}}`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `''${inline.text}''`
        case 'math': return `$$${inline.text}$$`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[[${inline.url}]]` : `[[${inline.url}|${text}]]` }
        case 'image': return `{{${inline.url}}}`
        case 'raw': return inline.format === 'zimwiki' ? inline.text : ''
        case 'note': return ` (${blks(inline.c, rr).replace(/\n/g, ' ')})`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': { const eq = '='.repeat(Math.max(1, 7 - Math.min(block.level, 6))); return `${eq} ${numbered(block, rr)}${inl(block.c, rr)} ${eq}` }
        case 'code': return `'''\n${block.text}\n'''`
        case 'quote': return blks(block.c, rr, depth).split('\n').map((line) => `\t${line}`).join('\n')
        case 'bullet': return block.items.map((item, index) => {
          const { text, rest } = splitItem(item)
          const task = block.tasks?.[index]
          const box = task === undefined || task === null ? '* ' : task ? '[*] ' : '[ ] '
          const lines = [`${'\t'.repeat(depth)}${box}${text ? inl(text, rr) : ''}`]
          for (const child of rest) lines.push(child.t === 'bullet' || child.t === 'ordered' ? rr.block(child, rr, depth + 1) : indent(rr.block(child, rr, depth + 1), '\t'.repeat(depth + 1)))
          return lines.join('\n')
        }).join('\n')
        case 'ordered': return block.items.map((item, index) => {
          const { text, rest } = splitItem(item)
          const lines = [`${'\t'.repeat(depth)}${block.start + index}. ${text ? inl(text, rr) : ''}`]
          for (const child of rest) lines.push(child.t === 'bullet' || child.t === 'ordered' ? rr.block(child, rr, depth + 1) : indent(rr.block(child, rr, depth + 1), '\t'.repeat(depth + 1)))
          return lines.join('\n')
        }).join('\n')
        case 'deflist': return block.items.map((item) => `* **${inl(item.term, rr)}** ${item.defs.map((def) => blks(def, rr, depth + 1).replace(/\n/g, ' ')).join(' ')}`).join('\n')
        case 'hr': return '--------------------'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ').replace(/\|/g, '\\|')
          const header = block.header.length ? block.header.map(cell) : block.aligns.map(() => ' ')
          const lines = [`|${header.join('|')}|`, `|${block.aligns.map((align) => (align === 'right' ? '---:' : align === 'center' ? ':---:' : ':---')).join('|')}|`]
          for (const row of block.rows) lines.push(`|${row.map(cell).join('|')}|`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'zimwiki' ? block.text : ''
        case 'div': return blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\n')
      }
    })
  const parts: string[] = ['Content-Type: text/x-zim-wiki\nWiki-Format: zim 0.6']
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`====== ${meta.title} ======`)
  parts.push(blks(doc.blocks, r))
  return finish(options.standalone ? parts : parts.slice(1), options)
}

/* -------------------------------------------------------------------- Jira */

export function writeJira(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/([*_^~{}[\]!|+-])(?=\S)/g, '\\$1')
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '\\\\'
        case 'emph': return `_${inl(inline.c, rr)}_`
        case 'strong': return `*${inl(inline.c, rr)}*`
        case 'strike': return `-${inl(inline.c, rr)}-`
        case 'underline': return `+${inl(inline.c, rr)}+`
        case 'sup': return `^${inl(inline.c, rr)}^`
        case 'sub': return `~${inl(inline.c, rr)}~`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `{{${inline.text}}}`
        case 'math': return `{{${inline.text}}}`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[${inline.url}]` : `[${text}|${inline.url}]` }
        case 'image': return `!${inline.url}!`
        case 'raw': return inline.format === 'jira' ? inline.text : ''
        case 'note': return ` (${blks(inline.c, rr).replace(/\n/g, ' ')})`
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': return `h${Math.min(block.level, 6)}. ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return `{code${block.lang ? `:${block.lang}` : ''}}\n${block.text}\n{code}`
        case 'quote': return `{quote}\n${blks(block.c, rr, depth)}\n{quote}`
        case 'bullet': case 'ordered': return markerList(block, rr, depth, '*', '#')
        case 'deflist': return block.items.map((item) => `*${inl(item.term, rr)}*\n${item.defs.map((def) => `bq. ${blks(def, rr, depth + 1).replace(/\n/g, ' ')}`).join('\n')}`).join('\n\n')
        case 'hr': return '----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ') || ' '
          const lines: string[] = []
          if (block.header.length) lines.push(`||${block.header.map(cell).join('||')}||`)
          for (const row of block.rows) lines.push(`|${row.map(cell).join('|')}|`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'jira' ? block.text : block.format === 'html' ? `{noformat}\n${block.text}\n{noformat}` : ''
        case 'div': return block.attrs?.classes?.includes('panel') ? `{panel}\n${blks(block.c, rr, depth)}\n{panel}` : blks(block.c, rr, depth)
        case 'linebl': return block.lines.map((line) => inl(line, rr)).join('\\\\\n')
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && meta.title) parts.push(`h1. ${meta.title}`)
  parts.push(blks(doc.blocks, r))
  return finish(parts, options)
}

/* -------------------------------------------------------------------- Muse */

export function writeMuse(doc: Doc, options: WriterOptions): string {
  const r = makeRenderer(options,
    (inline, rr) => {
      switch (inline.t) {
        case 'str': return inline.text.replace(/(\*\*|\*|=|_|\[\[)/g, (m) => `<verbatim>${m}</verbatim>`).replace(/<verbatim>(\*|_)<\/verbatim>(?=\w)/g, '$1')
        case 'space': return ' '
        case 'softbreak': return ' '
        case 'linebreak': return '<br>'
        case 'emph': return `*${inl(inline.c, rr)}*`
        case 'strong': return `**${inl(inline.c, rr)}**`
        case 'strike': return `<del>${inl(inline.c, rr)}</del>`
        case 'underline': return `_${inl(inline.c, rr)}_`
        case 'sup': return `<sup>${inl(inline.c, rr)}</sup>`
        case 'sub': return `<sub>${inl(inline.c, rr)}</sub>`
        case 'smallcaps': case 'span': return inl(inline.c, rr)
        case 'code': return `<code>${inline.text}</code>`
        case 'math': return `<math>${inline.text}</math>`
        case 'link': { const text = inl(inline.c, rr); return text === inline.url ? `[[${inline.url}]]` : `[[${inline.url}][${text}]]` }
        case 'image': return `[[${inline.url}]${inline.c.length ? `[${inlinesToText(inline.c)}]` : ''}]`
        case 'raw': return inline.format === 'html' ? `<literal style="html">${inline.text}</literal>` : inline.format === 'muse' ? inline.text : ''
        case 'note': { rr.notes.push(blks(inline.c, rr).replace(/\n/g, ' ')); return `[${rr.notes.length}]` }
      }
    },
    (block, rr, depth) => {
      switch (block.t) {
        case 'para': case 'plain': return inl(block.c, rr)
        case 'header': return `${'*'.repeat(Math.min(block.level, 5))} ${numbered(block, rr)}${inl(block.c, rr)}`
        case 'code': return block.lang ? `<src lang="${block.lang}">\n${block.text}\n</src>` : `<example>\n${block.text}\n</example>`
        case 'quote': return `<quote>\n${blks(block.c, rr, depth)}\n</quote>`
        case 'bullet': case 'ordered': return block.items.map((item, index) => {
          const { text, rest } = splitItem(item)
          const pad = ' '.repeat(depth + 1)
          const marker = block.t === 'bullet' ? '-' : `${block.start + index}.`
          const lines = [`${pad}${marker} ${text ? inl(text, rr) : ''}`]
          for (const child of rest) lines.push(child.t === 'bullet' || child.t === 'ordered' ? rr.block(child, rr, depth + 1) : indent(rr.block(child, rr, depth + 1), pad + '  '))
          return lines.join('\n')
        }).join('\n')
        case 'deflist': return block.items.map((item) => ` ${inl(item.term, rr)} :: ${item.defs.map((def) => blks(def, rr, depth + 1).replace(/\n/g, ' ')).join(' ')}`).join('\n')
        case 'hr': return '----'
        case 'table': {
          const cell = (c: Inline[]) => inl(c, rr).replace(/\n/g, ' ')
          const lines: string[] = []
          if (block.header.length) lines.push(` ${block.header.map(cell).join(' || ')}`)
          for (const row of block.rows) lines.push(` ${row.map(cell).join(' | ')}`)
          return lines.join('\n')
        }
        case 'raw': return block.format === 'html' ? `<literal style="html">\n${block.text}\n</literal>` : block.format === 'muse' ? block.text : ''
        case 'div': return block.attrs?.classes?.includes('center') ? `<center>\n${blks(block.c, rr, depth)}\n</center>` : blks(block.c, rr, depth)
        case 'linebl': return `<verse>\n${block.lines.map((line) => inl(line, rr)).join('\n')}\n</verse>`
      }
    })
  const parts: string[] = []
  const meta = metaOf(doc, options)
  if (options.standalone && (meta.title || meta.author || meta.date)) parts.push([meta.title ? `#title ${meta.title}` : '', meta.author ? `#author ${meta.author}` : '', meta.date ? `#date ${meta.date}` : ''].filter(Boolean).join('\n'))
  parts.push(blks(doc.blocks, r))
  if (r.notes.length) parts.push(r.notes.map((note, index) => `[${index + 1}] ${note}`).join('\n\n'))
  return finish(parts, options)
}
