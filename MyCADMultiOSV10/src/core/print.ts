import type { CadDocument } from './model'
import { distance, selectedSolids } from './model'

export type PrintScope = 'all' | 'current' | 'custom'
export type PaperSize = 'A4' | 'Letter'
export type Orientation = 'portrait' | 'landscape'

export interface PageSetup {
  paper: PaperSize
  orientation: Orientation
  marginMm: number
}

export interface PrintPage {
  id: string
  title: string
  objectCount: number
  summary: string
}

export function defaultPageSetup(): PageSetup {
  return { paper: 'A4', orientation: 'portrait', marginMm: 12 }
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
      summary: solids.map((solid) => solid.name).join(', ') || '(empty)'
    }
  })
}

export function pagePixelSize(setup: PageSetup): { width: number; height: number } {
  const table = { A4: { width: 794, height: 1123 }, Letter: { width: 816, height: 1056 } }
  const base = table[setup.paper]
  return setup.orientation === 'landscape' ? { width: base.height, height: base.width } : base
}

export function selectionDistance(doc: CadDocument): number | null {
  const solids = selectedSolids(doc)
  if (solids.length < 2) return null
  return distance(solids[0].position, solids[1].position)
}
