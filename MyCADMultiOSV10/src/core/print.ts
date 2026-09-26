import type { CadDocument, Solid } from './model'
import { distance, selectedSolids } from './model'
import { projectSolids, type ProjectionDirection, type Segment2D } from './techdraw'

export type PrintScope = 'all' | 'current' | 'custom'
export type PaperSize = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal'
export type Orientation = 'portrait' | 'landscape'

export interface PageSetup {
  paper: PaperSize
  orientation: Orientation
  /** page margin in mm */
  marginMm: number
  /** printed sheet title; empty falls back to the document name */
  title: string
  showTitle: boolean
  header: string
  footer: string
  showPageNumbers: boolean
  showDate: boolean
  showBorder: boolean
  /** projection used for the printed view */
  view: ProjectionDirection
  /** manual scale in percent, ignored while fitToPage is on */
  scalePercent: number
  fitToPage: boolean
  copies: number
}

export interface PrintPage {
  id: string
  title: string
  objectCount: number
  summary: string
  solids: Solid[]
}

export function defaultPageSetup(): PageSetup {
  return {
    paper: 'A4',
    orientation: 'portrait',
    marginMm: 12,
    title: '',
    showTitle: true,
    header: '',
    footer: '',
    showPageNumbers: true,
    showDate: true,
    showBorder: true,
    view: 'iso',
    scalePercent: 100,
    fitToPage: true,
    copies: 1
  }
}

export function sanitizePageSetup(input: unknown): PageSetup {
  const base = defaultPageSetup()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<PageSetup>
  const papers: PaperSize[] = ['A3', 'A4', 'A5', 'Letter', 'Legal']
  const views: ProjectionDirection[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']
  return {
    paper: papers.includes(raw.paper as PaperSize) ? (raw.paper as PaperSize) : base.paper,
    orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
    marginMm: typeof raw.marginMm === 'number' ? Math.max(0, Math.min(40, raw.marginMm)) : base.marginMm,
    title: typeof raw.title === 'string' ? raw.title : base.title,
    showTitle: typeof raw.showTitle === 'boolean' ? raw.showTitle : base.showTitle,
    header: typeof raw.header === 'string' ? raw.header : base.header,
    footer: typeof raw.footer === 'string' ? raw.footer : base.footer,
    showPageNumbers: typeof raw.showPageNumbers === 'boolean' ? raw.showPageNumbers : base.showPageNumbers,
    showDate: typeof raw.showDate === 'boolean' ? raw.showDate : base.showDate,
    showBorder: typeof raw.showBorder === 'boolean' ? raw.showBorder : base.showBorder,
    view: views.includes(raw.view as ProjectionDirection) ? (raw.view as ProjectionDirection) : base.view,
    scalePercent: typeof raw.scalePercent === 'number' ? Math.max(5, Math.min(1000, raw.scalePercent)) : base.scalePercent,
    fitToPage: typeof raw.fitToPage === 'boolean' ? raw.fitToPage : base.fitToPage,
    copies: typeof raw.copies === 'number' ? Math.max(1, Math.min(99, Math.round(raw.copies))) : base.copies
  }
}

export function buildPrintPages(docs: CadDocument[], activeId: string, scope: PrintScope, customIds: string[], selectedOnly: boolean): PrintPage[] {
  let chosen = docs
  if (scope === 'current') chosen = docs.filter((doc) => doc.id === activeId)
  if (scope === 'custom') chosen = docs.filter((doc) => customIds.includes(doc.id))
  return chosen.map((doc) => {
    const solids = selectedOnly ? selectedSolids(doc) : doc.solids.filter((solid) => solid.visible)
    return {
      id: doc.id,
      title: doc.name,
      objectCount: solids.length,
      summary: solids.map((solid) => solid.name).join(', ') || '(empty)',
      solids
    }
  })
}

const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 }
}

/** Sheet size in mm, honouring the orientation. */
export function pageSizeMm(setup: PageSetup): { width: number; height: number } {
  const base = PAPER_MM[setup.paper] ?? PAPER_MM.A4
  return setup.orientation === 'landscape'
    ? { width: base.height, height: base.width }
    : { width: base.width, height: base.height }
}

/** Sheet size in CSS pixels at 96 dpi, used for the on-screen preview. */
export function pagePixelSize(setup: PageSetup): { width: number; height: number } {
  const mm = pageSizeMm(setup)
  const toPx = (value: number) => Math.round((value / 25.4) * 96)
  return { width: toPx(mm.width), height: toPx(mm.height) }
}

export interface PrintLayout {
  widthMm: number
  heightMm: number
  marginMm: number
  /** drawing area inside the margins */
  bodyWidthMm: number
  bodyHeightMm: number
  /** mm on paper per mm of model */
  scale: number
  segments: Segment2D[]
  /** centre of the projected drawing, subtracted so it sits mid-page */
  offsetX: number
  offsetY: number
  header: string
  footer: string
  title: string
  pageLabel: string
}

/**
 * Lay a page out for printing: projects the solids, centres the result on the
 * sheet, fits or scales it and resolves the header, footer and page label.
 */
export function layoutPage(page: PrintPage, setup: PageSetup, index: number, total: number, now = new Date(0)): PrintLayout {
  const size = pageSizeMm(setup)
  const bodyWidth = Math.max(10, size.width - setup.marginMm * 2)
  const bodyHeight = Math.max(10, size.height - setup.marginMm * 2 - (setup.showTitle ? 12 : 0) - 10)
  const segments = projectSolids(page.solids, setup.view)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const segment of segments) {
    minX = Math.min(minX, segment.x1, segment.x2)
    maxX = Math.max(maxX, segment.x1, segment.x2)
    minY = Math.min(minY, segment.y1, segment.y2)
    maxY = Math.max(maxY, segment.y1, segment.y2)
  }
  const hasDrawing = Number.isFinite(minX) && Number.isFinite(minY)
  const drawingWidth = hasDrawing ? Math.max(1, maxX - minX) : 1
  const drawingHeight = hasDrawing ? Math.max(1, maxY - minY) : 1
  const fit = Math.min(bodyWidth / drawingWidth, bodyHeight / drawingHeight) * 0.9
  const scale = setup.fitToPage ? fit : setup.scalePercent / 100
  const dateText = setup.showDate ? now.toISOString().slice(0, 10) : ''
  const pageLabel = setup.showPageNumbers ? `${index + 1} / ${total}` : ''
  return {
    widthMm: size.width,
    heightMm: size.height,
    marginMm: setup.marginMm,
    bodyWidthMm: bodyWidth,
    bodyHeightMm: bodyHeight,
    scale,
    segments,
    offsetX: hasDrawing ? (minX + maxX) / 2 : 0,
    offsetY: hasDrawing ? (minY + maxY) / 2 : 0,
    header: [setup.header, dateText].filter(Boolean).join('   '),
    footer: [setup.footer, page.summary].filter(Boolean).join('   '),
    title: setup.showTitle ? (setup.title.trim() || page.title) : '',
    pageLabel
  }
}

/** The printable sheet as standalone SVG (preview and print use the same output). */
export function pageToSvg(page: PrintPage, setup: PageSetup, index: number, total: number, now = new Date(0)): string {
  const layout = layoutPage(page, setup, index, total, now)
  const cx = layout.widthMm / 2
  const cy = layout.marginMm + (setup.showTitle ? 12 : 0) + layout.bodyHeightMm / 2
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.widthMm} ${layout.heightMm}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`)
  parts.push(`<rect x="0" y="0" width="${layout.widthMm}" height="${layout.heightMm}" fill="#ffffff"/>`)
  if (setup.showBorder) {
    parts.push(`<rect x="${layout.marginMm}" y="${layout.marginMm}" width="${layout.widthMm - layout.marginMm * 2}" height="${layout.heightMm - layout.marginMm * 2}" fill="none" stroke="#333333" stroke-width="0.4"/>`)
  }
  if (layout.header) {
    parts.push(`<text x="${layout.marginMm}" y="${Math.max(4, layout.marginMm - 3)}" font-size="3.6" fill="#444444">${escapeXml(layout.header)}</text>`)
  }
  if (layout.title) {
    parts.push(`<text x="${cx}" y="${layout.marginMm + 8}" font-size="6" text-anchor="middle" fill="#111111">${escapeXml(layout.title)}</text>`)
  }
  parts.push(`<g stroke="#101010" stroke-width="${Math.max(0.12, 0.25 / Math.max(0.2, layout.scale))}" fill="none" transform="translate(${cx} ${cy}) scale(${layout.scale} ${-layout.scale}) translate(${-layout.offsetX} ${-layout.offsetY})">`)
  for (const segment of layout.segments) {
    parts.push(`<line x1="${segment.x1.toFixed(3)}" y1="${segment.y1.toFixed(3)}" x2="${segment.x2.toFixed(3)}" y2="${segment.y2.toFixed(3)}"/>`)
  }
  parts.push('</g>')
  if (layout.footer) {
    parts.push(`<text x="${layout.marginMm}" y="${layout.heightMm - layout.marginMm + 6}" font-size="3.4" fill="#444444">${escapeXml(layout.footer)}</text>`)
  }
  if (layout.pageLabel) {
    parts.push(`<text x="${layout.widthMm - layout.marginMm}" y="${layout.heightMm - layout.marginMm + 6}" font-size="3.4" text-anchor="end" fill="#444444">${escapeXml(layout.pageLabel)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('')
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char] ?? char))
}

export function selectionDistance(doc: CadDocument): number | null {
  const solids = selectedSolids(doc)
  if (solids.length < 2) return null
  return distance(solids[0].position, solids[1].position)
}
