// Page setup for printing: paper, margins, header and footer, and how many sheets. Pure.
export const PAPERS: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  B4: [250, 353],
  B5: [176, 250],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
  Tabloid: [279.4, 431.8],
}

export type Orientation = 'auto' | 'portrait' | 'landscape'
export type Margins = { top: number; right: number; bottom: number; left: number }
export type HeadingLine = { left: string; center: string; right: string }

export type PageSetup = {
  paper: string
  orientation: Orientation
  margins: Margins
  header: HeadingLine
  footer: HeadingLine
  headingSize: number
  /** How many sheets the diagram is spread over, across and down. */
  pagesWide: number
  pagesTall: number
  centerH: boolean
  centerV: boolean
}

export const MARGIN_MAX = 60
export const PAGES_MAX = 6

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: 'A4',
  orientation: 'auto',
  margins: { top: 16, right: 10, bottom: 14, left: 10 },
  header: { left: '', center: '{title}', right: '' },
  footer: { left: '{date}', center: '', right: '{page} / {pages}' },
  headingSize: 10,
  pagesWide: 1,
  pagesTall: 1,
  centerH: true,
  centerV: true,
}

const objectOf = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {})
const limited = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value)
  return value !== null && value !== undefined && Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
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
    orientation: v.orientation === 'portrait' || v.orientation === 'landscape' ? v.orientation : 'auto',
    margins: {
      top: limited(m.top, 0, MARGIN_MAX, d.margins.top),
      right: limited(m.right, 0, MARGIN_MAX, d.margins.right),
      bottom: limited(m.bottom, 0, MARGIN_MAX, d.margins.bottom),
      left: limited(m.left, 0, MARGIN_MAX, d.margins.left),
    },
    header: line(v.header, d.header),
    footer: line(v.footer, d.footer),
    headingSize: limited(v.headingSize, 6, 24, d.headingSize),
    pagesWide: limited(v.pagesWide, 1, PAGES_MAX, d.pagesWide),
    pagesTall: limited(v.pagesTall, 1, PAGES_MAX, d.pagesTall),
    centerH: v.centerH !== false,
    centerV: v.centerV !== false,
  }
}

/** The sheet in millimetres. On 'auto' it turns the way the diagram is shaped, leaving the least empty. */
export function sheetSize(setup: PageSetup, diagramWidth: number, diagramHeight: number): { width: number; height: number } {
  const [short, long] = PAPERS[setup.paper] ?? PAPERS.A4
  const wide = setup.orientation === 'landscape' || (setup.orientation === 'auto' && diagramWidth / Math.max(1, setup.pagesWide) >= diagramHeight / Math.max(1, setup.pagesTall))
  return wide ? { width: long, height: short } : { width: short, height: long }
}

/** The printable box of a sheet; it never collapses, whatever the margins say. */
export function contentBox(setup: PageSetup, sheet: { width: number; height: number }) {
  const width = Math.max(10, sheet.width - setup.margins.left - setup.margins.right)
  const height = Math.max(10, sheet.height - setup.margins.top - setup.margins.bottom)
  return { x: setup.margins.left, y: setup.margins.top, width, height }
}

/** What each sheet shows of the diagram: equal parts, left to right, top to bottom. */
export function pageSlices(setup: PageSetup, box: { x: number; y: number; width: number; height: number }) {
  const slices: { x: number; y: number; width: number; height: number }[] = []
  const width = box.width / setup.pagesWide
  const height = box.height / setup.pagesTall
  for (let row = 0; row < setup.pagesTall; row++) {
    for (let col = 0; col < setup.pagesWide; col++) slices.push({ x: box.x + col * width, y: box.y + row * height, width, height })
  }
  return slices
}

/** {title}, {date}, {time}, {page} and {pages} in a header or footer. */
export function expandHeading(text: string, values: { title: string; date: string; time: string; page: number; pages: number }): string {
  return text.replace(/\{(title|date|time|page|pages)\}/g, (_, key: keyof typeof values) => String(values[key]))
}
