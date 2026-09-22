/**
 * The small rendering kit the text writers share: a renderer is a pair of
 * functions (inline, block) plus the state a document needs while it is
 * written (footnotes collected so far, section numbers).
 */
import type { Block, Doc, Inline } from '../ast'
import { applyLineEnding, type WriterOptions } from '../options'

export type Renderer = {
  inline: (inline: Inline, r: Renderer) => string
  block: (block: Block, r: Renderer, depth: number) => string
  notes: string[]
  options: WriterOptions
  numbers: number[]
}

export function inl(list: Inline[], r: Renderer): string {
  return list.map((inline) => r.inline(inline, r)).join('')
}

export function blks(list: Block[], r: Renderer, depth = 0, sep = '\n\n'): string {
  return list.map((block) => r.block(block, r, depth)).filter((text) => text !== '').join(sep)
}

export function numbered(block: Extract<Block, { t: 'header' }>, r: Renderer): string {
  if (!r.options.numberSections) return ''
  const numbers = r.numbers
  while (numbers.length < block.level) numbers.push(0)
  numbers.length = block.level
  numbers[block.level - 1] += 1
  return `${numbers.join('.')} `
}

export function indent(text: string, prefix: string, first = prefix): string {
  return text.split('\n').map((line, index) => (index === 0 ? `${first}${line}` : line ? `${prefix}${line}` : '')).join('\n')
}

export function finish(parts: string[], options: WriterOptions): string {
  return applyLineEnding(`${parts.filter((part) => part !== '').join('\n\n')}\n`, options)
}

export function makeRenderer(options: WriterOptions, inline: Renderer['inline'], block: Renderer['block']): Renderer {
  return { options, notes: [], numbers: [], inline, block }
}

/** Title, author and date after the writer options have had their say. */
export function metaOf(doc: Doc, options: WriterOptions) {
  return {
    title: options.title || doc.meta.title || '',
    author: options.author || doc.meta.author || '',
    date: options.date || doc.meta.date || '',
  }
}

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The first inline block of a list item and the rest, for markers that take one line of text. */
export function splitItem(item: Block[]): { text: Inline[] | null; rest: Block[] } {
  const first = item[0]
  if (first && (first.t === 'plain' || first.t === 'para')) return { text: first.c, rest: item.slice(1) }
  return { text: null, rest: item }
}
