// Printing. The same sheets are drawn in the page setup window's preview and on paper: the diagram
// cropped to its content, in colours meant for paper, whatever the theme is. On screen the print
// sheet stays hidden; only the print style shows it (styles/global.css).
import { host } from '../host'
import { contentBox, expandHeading, pageSlices, sheetSize, type PageSetup } from '../pageSetup'
import type { DiagramNode } from '../types'
import { buildSvgString } from './exportImage'

const SHEET_ID = 'print-sheet'
const STYLE_ID = 'print-page-style'
const PAPER_COLORS = { '--spine': '#475569', '--node-stroke': 'rgba(15, 23, 42, 0.18)', '--accent': '#2563eb' }

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type PrintPages = { html: string; pages: number; width: number; height: number }

/** The sheets as HTML. Everything in it is escaped or serialized by the browser. */
export function buildPrintPages(svg: SVGSVGElement, nodes: DiagramNode[], setup: PageSetup, title: string, now = new Date()): PrintPages {
  const { svg: text, width: diagramWidth, height: diagramHeight } = buildSvgString(svg, nodes, undefined, PAPER_COLORS)
  const copy = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
  copy.removeAttribute('width')
  copy.removeAttribute('height')
  copy.removeAttribute('class')
  // What is selected on screen is not part of the drawing.
  for (const node of copy.querySelectorAll('.selected')) node.classList.remove('selected')
  const [minX, minY, viewWidth, viewHeight] = (copy.getAttribute('viewBox') ?? `0 0 ${diagramWidth} ${diagramHeight}`).split(' ').map(Number)
  const sheet = sheetSize(setup, viewWidth, viewHeight)
  const box = contentBox(setup, sheet)
  const slices = pageSlices(setup, { x: minX, y: minY, width: viewWidth, height: viewHeight })
  const align = `${setup.centerH ? 'xMid' : 'xMin'}${setup.centerV ? 'YMid' : 'YMin'} meet`
  const date = now.toLocaleDateString()
  const time = now.toLocaleTimeString()
  const heading = (line: PageSetup['header'], page: number) =>
    (['left', 'center', 'right'] as const).map((side) => `<span class="print-${side}">${escapeHtml(expandHeading(line[side], { title, date, time, page, pages: slices.length }))}</span>`).join('')
  const html = slices
    .map((slice, index) => {
      copy.setAttribute('viewBox', `${slice.x} ${slice.y} ${slice.width} ${slice.height}`)
      copy.setAttribute('preserveAspectRatio', align)
      const page = index + 1
      const rule = (at: string) => `position:absolute;left:${setup.margins.left}mm;right:${setup.margins.right}mm;${at};font-size:${setup.headingSize}pt`
      return `<div class="print-page" style="width:${sheet.width}mm;height:${sheet.height}mm">`
        + `<div class="print-heading" data-print-header style="${rule(`top:0;height:${setup.margins.top}mm`)}">${heading(setup.header, page)}</div>`
        + `<div class="print-body" style="left:${box.x}mm;top:${box.y}mm;width:${box.width}mm;height:${box.height}mm">${new XMLSerializer().serializeToString(copy)}</div>`
        + `<div class="print-heading" data-print-footer style="${rule(`bottom:0;height:${setup.margins.bottom}mm`)}">${heading(setup.footer, page)}</div>`
        + `</div>`
    })
    .join('')
  return { html, pages: slices.length, width: sheet.width, height: sheet.height }
}

/** Puts the sheets where the print style shows them, with the paper they are for. */
export function prepareSheet(pages: PrintPages) {
  let sheet = document.getElementById(SHEET_ID)
  if (!sheet) {
    sheet = document.createElement('div')
    sheet.id = SHEET_ID
    document.body.append(sheet)
  }
  sheet.innerHTML = pages.html
  let style = document.getElementById(STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.append(style)
  }
  // The margins are drawn on the sheet itself: nothing of the browser's own is added.
  style.textContent = `@page { size: ${pages.width}mm ${pages.height}mm; margin: 0 }`
}

export function printPages(pages: PrintPages) {
  prepareSheet(pages)
  return host.print()
}
