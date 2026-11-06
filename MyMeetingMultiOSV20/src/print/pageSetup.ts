// Page setup for printing and for the Word export: paper, orientation, margins, header and footer.
// Pure, so it can be tested and read back from settings.json safely.
export const PAPERS: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  B4: [257, 364],
  B5: [182, 257],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
}

export type Orientation = 'portrait' | 'landscape'
export type Margins = { top: number; right: number; bottom: number; left: number }
export type HeadingLine = { left: string; center: string; right: string }

export type PageSetup = {
  paper: string
  orientation: Orientation
  margins: Margins
  header: HeadingLine
  footer: HeadingLine
  /** Header and footer text size, pt. */
  headingSize: number
  /** The document's text, in percent of its normal size. */
  scale: number
  /** The first page shows no header or footer. */
  skipFirst: boolean
}

export const MARGIN_MAX = 60
export const SCALE_MIN = 50
export const SCALE_MAX = 200

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: 'A4',
  orientation: 'portrait',
  margins: { top: 20, right: 18, bottom: 20, left: 18 },
  header: { left: '{title}', center: '', right: '{date}' },
  footer: { left: '', center: '{page} / {pages}', right: '' },
  headingSize: 9,
  scale: 100,
  skipFirst: false,
}

const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})
const limited = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
}
const line = (value: unknown, fallback: HeadingLine): HeadingLine => {
  const v = objectOf(value)
  const text = (x: unknown, other: string) => (typeof x === 'string' ? x.slice(0, 200) : other)
  return { left: text(v.left, fallback.left), center: text(v.center, fallback.center), right: text(v.right, fallback.right) }
}

export function sanitizePageSetup(value: unknown): PageSetup {
  const v = objectOf(value)
  const m = objectOf(v.margins)
  const d = DEFAULT_PAGE_SETUP
  return {
    paper: typeof v.paper === 'string' && PAPERS[v.paper] ? v.paper : d.paper,
    orientation: v.orientation === 'landscape' ? 'landscape' : 'portrait',
    margins: {
      top: limited(m.top, 0, MARGIN_MAX, d.margins.top),
      right: limited(m.right, 0, MARGIN_MAX, d.margins.right),
      bottom: limited(m.bottom, 0, MARGIN_MAX, d.margins.bottom),
      left: limited(m.left, 0, MARGIN_MAX, d.margins.left),
    },
    header: line(v.header, d.header),
    footer: line(v.footer, d.footer),
    headingSize: limited(v.headingSize, 6, 24, d.headingSize),
    scale: limited(v.scale, SCALE_MIN, SCALE_MAX, d.scale),
    skipFirst: v.skipFirst === true,
  }
}

/** The sheet in millimetres. */
export function sheetSize(setup: PageSetup): { width: number; height: number } {
  const [short, long] = PAPERS[setup.paper] ?? PAPERS.A4
  return setup.orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long }
}

/** The printable box of a sheet; it never collapses, whatever the margins say. */
export function contentBox(setup: PageSetup) {
  const sheet = sheetSize(setup)
  return {
    x: setup.margins.left,
    y: setup.margins.top,
    width: Math.max(30, sheet.width - setup.margins.left - setup.margins.right),
    height: Math.max(30, sheet.height - setup.margins.top - setup.margins.bottom),
  }
}

export type HeadingValues = { title: string; date: string; time: string; page: number; pages: number }

/** {title}, {date}, {time}, {page} and {pages} in a header or footer. */
export function expandHeading(text: string, values: HeadingValues): string {
  return text.replace(/\{(title|date|time|page|pages)\}/g, (_, key: keyof HeadingValues) => String(values[key]))
}

/**
 * "1-3, 5" → [1, 2, 3, 5], within 1..total, in order, each once. Null when the text cannot be read,
 * so the dialog can say so instead of printing something else.
 */
export function parsePageRange(text: string, total: number): number[] | null {
  const pages = new Set<number>()
  const parts = text.split(/[,;\s]+/).filter(Boolean)
  if (!parts.length) return null
  for (const part of parts) {
    const match = part.match(/^(\d+)?\s*-\s*(\d+)?$|^(\d+)$/)
    if (!match) return null
    const from = Number(match[3] ?? match[1] ?? 1)
    const to = Number(match[3] ?? match[2] ?? total)
    if (!from || !to || from > to) return null
    for (let page = from; page <= Math.min(to, total); page++) pages.add(page)
  }
  return pages.size ? [...pages].sort((a, b) => a - b) : null
}
