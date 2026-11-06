// Pages, measured for real: the document is laid out in an invisible page of the paper's size and
// each block goes onto the page where it fits. Tables and lists continue on the next page row by
// row (a table repeats its header), and a heading never stays alone at the bottom of a page.
// The print preview and the paper show exactly these pages.
import { docStyleVars, type DocStyle } from '../document'
import { host } from '../host'
import { contentBox, expandHeading, sheetSize, type PageSetup } from './pageSetup'

export type PrintPages = {
  /** Every page as its own HTML, numbered from 1. */
  pages: string[]
  width: number
  height: number
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const HEADING = /^H[1-6]$/

function overflows(page: HTMLElement) {
  return page.scrollHeight > page.clientHeight + 1
}

/** A table or list split where the page ends: what fits stays on the page, the rest is returned. */
function split(block: Element, page: HTMLElement): Element | null {
  const tag = block.tagName
  if (tag === 'TABLE') {
    const body = block.querySelector('tbody') ?? block
    const rows = Array.from(body.children).filter((row) => row.tagName === 'TR')
    if (rows.length < 2) return null
    const head = block.querySelector('thead')
    const part = block.cloneNode(false) as Element
    if (head) part.appendChild(head.cloneNode(true))
    const partBody = document.createElement('tbody')
    part.appendChild(partBody)
    page.appendChild(part)
    let placed = 0
    for (const row of rows) {
      partBody.appendChild(row.cloneNode(true))
      if (overflows(page)) {
        partBody.lastChild!.remove()
        break
      }
      placed++
    }
    if (!placed) {
      part.remove()
      return null
    }
    if (placed === rows.length) return null
    const rest = block.cloneNode(false) as Element
    if (head) rest.appendChild(head.cloneNode(true))
    const restBody = document.createElement('tbody')
    rows.slice(placed).forEach((row) => restBody.appendChild(row.cloneNode(true)))
    rest.appendChild(restBody)
    return rest
  }
  if (tag === 'UL' || tag === 'OL') {
    const items = Array.from(block.children).filter((item) => item.tagName === 'LI')
    if (items.length < 2) return null
    const part = block.cloneNode(false) as Element
    page.appendChild(part)
    let placed = 0
    for (const item of items) {
      part.appendChild(item.cloneNode(true))
      if (overflows(page)) {
        part.lastChild!.remove()
        break
      }
      placed++
    }
    if (!placed) {
      part.remove()
      return null
    }
    if (placed === items.length) return null
    const rest = block.cloneNode(false) as Element
    if (tag === 'OL') rest.setAttribute('start', String(Number(block.getAttribute('start') || 1) + placed))
    items.slice(placed).forEach((item) => rest.appendChild(item.cloneNode(true)))
    return rest
  }
  return null
}

async function picturesLoaded(root: HTMLElement) {
  const waits = Array.from(root.querySelectorAll('img')).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined)))
  await Promise.race([Promise.all(waits), new Promise((resolve) => setTimeout(resolve, 3000))])
}

/** Splits the document into pages of the given paper. */
export async function paginate(bodyHtml: string, setup: PageSetup, style: DocStyle): Promise<PrintPages> {
  const box = contentBox(setup)
  const sheet = sheetSize(setup)
  const scaled: DocStyle = { ...style, fontSizePt: Math.round(style.fontSizePt * setup.scale) / 100 }
  const stage = document.createElement('div')
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none'
  const source = document.createElement('div')
  source.className = 'doc'
  source.style.cssText = `${docStyleVars(scaled)};width:${box.width}mm`
  source.innerHTML = bodyHtml
  const page = document.createElement('div')
  page.className = 'doc print-measure'
  page.style.cssText = `${docStyleVars(scaled)};width:${box.width}mm;height:${box.height}mm;overflow:hidden;display:flow-root`
  stage.append(source, page)
  document.body.append(stage)
  try {
    await picturesLoaded(source)
    const queue: Element[] = []
    for (const node of Array.from(source.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) queue.push(node as Element)
      else if (node.textContent?.trim()) {
        const paragraph = document.createElement('p')
        paragraph.textContent = node.textContent
        queue.push(paragraph)
      }
    }
    const pages: string[] = []
    const finish = () => {
      // A heading belongs with what follows it.
      const carried: Element[] = []
      while (page.children.length > 1 && HEADING.test(page.lastElementChild!.tagName)) carried.unshift(page.lastElementChild!)
      carried.forEach((element) => element.remove())
      pages.push(page.innerHTML)
      page.innerHTML = ''
      return carried
    }
    while (queue.length) {
      const block = queue.shift()!
      page.appendChild(block)
      if (!overflows(page)) continue
      block.remove()
      const rest = split(block, page)
      if (rest) {
        queue.unshift(...finish(), rest)
        continue
      }
      if (!page.children.length) {
        // Larger than a whole page by itself: it gets a page of its own and is cut there.
        page.appendChild(block)
        pages.push(page.innerHTML)
        page.innerHTML = ''
        continue
      }
      queue.unshift(...finish(), block)
    }
    if (page.children.length || !pages.length) pages.push(page.innerHTML)
    return { pages, width: sheet.width, height: sheet.height }
  } finally {
    stage.remove()
  }
}

/** The sheets as HTML, with their headers and footers, for the preview and the paper. */
export function sheetsHtml(result: PrintPages, setup: PageSetup, style: DocStyle, title: string, only?: number[], now = new Date()): string {
  const box = contentBox(setup)
  const scaled: DocStyle = { ...style, fontSizePt: Math.round(style.fontSizePt * setup.scale) / 100 }
  const date = now.toLocaleDateString()
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const total = result.pages.length
  const line = (heading: PageSetup['header'], page: number) =>
    (['left', 'center', 'right'] as const).map((side) => `<span class="print-${side}">${escapeHtml(expandHeading(heading[side], { title, date, time, page, pages: total }))}</span>`).join('')
  const numbers = only ?? result.pages.map((_, index) => index + 1)
  return numbers
    .map((number) => {
      const plain = setup.skipFirst && number === 1
      const band = (at: string, height: number) => `position:absolute;left:${setup.margins.left}mm;right:${setup.margins.right}mm;${at};height:${height}mm;font-size:${setup.headingSize}pt`
      return `<div class="print-page" data-page="${number}" style="width:${result.width}mm;height:${result.height}mm">`
        + (plain ? '' : `<div class="print-heading" data-print-header style="${band('top:0', setup.margins.top)}">${line(setup.header, number)}</div>`)
        + `<div class="print-body doc" style="${docStyleVars(scaled)};left:${box.x}mm;top:${box.y}mm;width:${box.width}mm;height:${box.height}mm">${result.pages[number - 1] ?? ''}</div>`
        + (plain ? '' : `<div class="print-heading" data-print-footer style="${band('bottom:0', setup.margins.bottom)}">${line(setup.footer, number)}</div>`)
        + '</div>'
    })
    .join('')
}

/** Puts the sheets where the print style shows them, sized for their paper, and opens the print dialog. */
export function printSheets(html: string, width: number, height: number) {
  let sheet = document.getElementById('print-sheet')
  if (!sheet) {
    sheet = document.createElement('div')
    sheet.id = 'print-sheet'
    document.body.append(sheet)
  }
  sheet.innerHTML = html
  let rule = document.getElementById('print-page-style')
  if (!rule) {
    rule = document.createElement('style')
    rule.id = 'print-page-style'
    document.head.append(rule)
  }
  rule.textContent = `@page { size: ${width}mm ${height}mm; margin: 0 }`
  return host.print()
}
