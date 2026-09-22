/**
 * Turns the flat block list into nested sections, for the formats whose
 * structure is a tree (DocBook, JATS, TEI, OPML, FB2, the slide shows).
 * A section starts at a heading and holds everything up to the next heading
 * of the same or a higher level; deeper headings open sub-sections.
 */
import type { Block, Inline } from './ast'

export type Section = {
  level: number
  title: Inline[] | null
  id: string
  /** The blocks before the first sub-section. */
  blocks: Block[]
  children: Section[]
}

export function sectionize(blocks: Block[]): Section[] {
  const root: Section = { level: 0, title: null, id: '', blocks: [], children: [] }
  const stack: Section[] = [root]
  for (const block of blocks) {
    if (block.t === 'header') {
      while (stack.length > 1 && stack[stack.length - 1].level >= block.level) stack.pop()
      const section: Section = { level: block.level, title: block.c, id: block.id, blocks: [], children: [] }
      stack[stack.length - 1].children.push(section)
      stack.push(section)
      continue
    }
    stack[stack.length - 1].blocks.push(block)
  }
  // Blocks before any heading form a title-less leading section.
  if (root.blocks.length) root.children.unshift({ level: 0, title: null, id: '', blocks: root.blocks, children: [] })
  return root.children
}

/** Splits into slides at `level`: a slide is a heading of that level plus what follows it. */
export function slidesAt(blocks: Block[], level: number): { title: Inline[] | null; id: string; blocks: Block[] }[] {
  const slides: { title: Inline[] | null; id: string; blocks: Block[] }[] = []
  let current: { title: Inline[] | null; id: string; blocks: Block[] } | null = null
  for (const block of blocks) {
    if (block.t === 'header' && block.level <= level) {
      if (current && (current.title || current.blocks.length)) slides.push(current)
      current = { title: block.c, id: block.id, blocks: block.level < level ? [block] : [] }
      if (block.level < level) current.title = block.c
      continue
    }
    if (block.t === 'hr') {
      if (current && (current.title || current.blocks.length)) slides.push(current)
      current = { title: null, id: '', blocks: [] }
      continue
    }
    if (!current) current = { title: null, id: '', blocks: [] }
    current.blocks.push(block)
  }
  if (current && (current.title || current.blocks.length)) slides.push(current)
  return slides
}

/**
 * The slide level Pandoc would pick: the highest heading level that is
 * followed by content (rather than by another heading).
 */
export function slideLevel(blocks: Block[]): number {
  let best = 0
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]
    if (block.t !== 'header') continue
    const next = blocks[i + 1]
    if (next && next.t !== 'header') best = best === 0 ? block.level : Math.min(best, block.level)
  }
  return best || 1
}
