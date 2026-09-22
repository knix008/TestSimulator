/**
 * Everything a writer can be told, with the defaults Pandoc would use.
 *
 * The right-hand panel edits these per document; a saved project carries
 * them; the settings window holds the defaults for new documents.
 */

export type WrapMode = 'auto' | 'none' | 'preserve'
export type PageSize = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
export type HeadingStyle = 'atx' | 'setext'
export type MarkdownFlavor = 'pandoc' | 'gfm' | 'commonmark'
export type HtmlStyle = 'default' | 'minimal' | 'github' | 'print' | 'none'

export type WriterOptions = {
  /** A complete document (with head, preamble, package) rather than a fragment. */
  standalone: boolean
  toc: boolean
  tocDepth: number
  numberSections: boolean
  wrap: WrapMode
  columns: number
  lineEnding: 'lf' | 'crlf'
  /** Metadata overrides; empty means "take it from the source". */
  title: string
  author: string
  date: string
  // Markdown
  markdownFlavor: MarkdownFlavor
  headingStyle: HeadingStyle
  bulletMarker: '-' | '*' | '+'
  emphasisMarker: '*' | '_'
  codeFence: '```' | '~~~'
  // HTML / EPUB / PDF
  htmlStyle: HtmlStyle
  htmlMath: boolean
  htmlSectionDivs: boolean
  // Page (PDF, print, DOCX/ODT page)
  pageSize: PageSize
  landscape: boolean
  marginMm: number
  // Word processors
  bodyFont: string
  bodyFontSize: number
  monoFont: string
  // LaTeX
  documentClass: string
  fontSize: string
  // PostScript
  /** Embed the bundled Nanum fonts (subset) so Korean renders anywhere; off = the interpreter's Helvetica/Courier, Latin only. */
  psEmbedFonts: boolean
  /** Which bundled family sets the body text: Gothic (sans) or Gothic Coding (monospace everywhere). */
  psBodyFont: 'gothic' | 'coding'
  /** Draw a light rule under level-1 headings and a box behind code. */
  psDecorations: boolean
}

export const defaultWriterOptions: WriterOptions = {
  standalone: true,
  toc: false,
  tocDepth: 3,
  numberSections: false,
  wrap: 'auto',
  columns: 72,
  lineEnding: 'lf',
  title: '',
  author: '',
  date: '',
  markdownFlavor: 'pandoc',
  headingStyle: 'atx',
  bulletMarker: '-',
  emphasisMarker: '*',
  codeFence: '```',
  htmlStyle: 'default',
  htmlMath: true,
  htmlSectionDivs: false,
  pageSize: 'A4',
  landscape: false,
  marginMm: 20,
  bodyFont: 'Calibri',
  bodyFontSize: 11,
  monoFont: 'Consolas',
  documentClass: 'article',
  fontSize: '11pt',
  psEmbedFonts: true,
  psBodyFont: 'gothic',
  psDecorations: true,
}

export function normalizeOptions(partial: Partial<WriterOptions> | undefined): WriterOptions {
  return { ...defaultWriterOptions, ...(partial ?? {}) }
}

/** Applies the line ending the user asked for; writers always produce `\n`. */
export function applyLineEnding(text: string, options: WriterOptions): string {
  return options.lineEnding === 'crlf' ? text.replace(/\r?\n/g, '\r\n') : text
}

/** Word-wraps a paragraph that writers produced with soft breaks as spaces. */
export function wrapText(text: string, options: WriterOptions, indent = ''): string {
  if (options.wrap === 'preserve') return text
  if (options.wrap === 'none') return text.replace(/\n(?!\n)/g, ' ')
  const width = Math.max(20, options.columns)
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      out.push(line)
      continue
    }
    const words = line.split(' ')
    let current = ''
    for (const word of words) {
      if (!current) {
        current = word
        continue
      }
      if (current.length + 1 + word.length + indent.length > width) {
        out.push(current)
        current = word
      } else {
        current += ` ${word}`
      }
    }
    if (current) out.push(current)
  }
  return out.join('\n')
}
