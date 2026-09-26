// FreeCAD TechDraw / CATIA Drafting: 2D projections, drawing pages, dimensions.
import type { Solid, Vec3 } from './model'
import { boundingBoxOf, trianglePositions } from './primitives'

export type ProjectionDirection = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso'

export interface Segment2D {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DrawingView {
  id: string
  label: string
  direction: ProjectionDirection
  scale: number
  x: number
  y: number
  segments: Segment2D[]
}

export interface DrawingDimension {
  id: string
  kind: 'length' | 'diameter' | 'radius' | 'angle'
  text: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface DrawingPage {
  name: string
  template: 'A4-landscape' | 'A4-portrait' | 'A3-landscape' | 'Letter-landscape'
  widthMm: number
  heightMm: number
  views: DrawingView[]
  dimensions: DrawingDimension[]
  annotations: Array<{ x: number; y: number; text: string }>
  balloons: Array<{ x: number; y: number; label: string }>
  titleBlock: Record<string, string>
}

const TEMPLATES: Record<DrawingPage['template'], { widthMm: number; heightMm: number }> = {
  'A4-landscape': { widthMm: 297, heightMm: 210 },
  'A4-portrait': { widthMm: 210, heightMm: 297 },
  'A3-landscape': { widthMm: 420, heightMm: 297 },
  'Letter-landscape': { widthMm: 279, heightMm: 216 }
}

function projectPoint(point: Vec3, direction: ProjectionDirection): [number, number] {
  switch (direction) {
    case 'front':
      return [point.x, point.y]
    case 'back':
      return [-point.x, point.y]
    case 'left':
      return [point.z, point.y]
    case 'right':
      return [-point.z, point.y]
    case 'top':
      return [point.x, -point.z]
    case 'bottom':
      return [point.x, point.z]
    default: {
      const k = Math.SQRT1_2
      return [(point.x - point.z) * k, point.y + (point.x + point.z) * k * 0.5]
    }
  }
}

/** TechDraw > View: silhouette-ish wireframe projection of a solid set. */
export function projectSolids(solids: Solid[], direction: ProjectionDirection, tolerance = 0.05): Segment2D[] {
  const seen = new Map<string, Segment2D>()
  for (const solid of solids) {
    if (!solid.visible) continue
    const positions = trianglePositions(solid)
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const corners: Vec3[] = [0, 3, 6].map((offset) => ({
        x: positions[i + offset] * solid.scale.x + solid.position.x,
        y: positions[i + offset + 1] * solid.scale.y + solid.position.y,
        z: positions[i + offset + 2] * solid.scale.z + solid.position.z
      }))
      for (let e = 0; e < 3; e++) {
        const [x1, y1] = projectPoint(corners[e], direction)
        const [x2, y2] = projectPoint(corners[(e + 1) % 3], direction)
        if (Math.hypot(x2 - x1, y2 - y1) < tolerance) continue
        const round = (value: number) => Math.round(value / tolerance) * tolerance
        const a = `${round(x1)},${round(y1)}`
        const b = `${round(x2)},${round(y2)}`
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (!seen.has(key)) seen.set(key, { x1, y1, x2, y2 })
      }
    }
  }
  return [...seen.values()]
}

export function makeView(id: string, solids: Solid[], direction: ProjectionDirection, scale = 1, x = 0, y = 0): DrawingView {
  return {
    id,
    label: direction,
    direction,
    scale,
    x,
    y,
    segments: projectSolids(solids, direction).map((segment) => ({
      x1: segment.x1 * scale,
      y1: segment.y1 * scale,
      x2: segment.x2 * scale,
      y2: segment.y2 * scale
    }))
  }
}

/** TechDraw > Projection group: front / top / right / iso in first-angle layout. */
export function projectionGroup(solids: Solid[], scale = 1): DrawingView[] {
  const box = boundingBoxOf(solids)
  const gapX = Math.max(40, box.size.x * scale + 30)
  const gapY = Math.max(40, box.size.y * scale + 30)
  return [
    makeView('view-front', solids, 'front', scale, 0, 0),
    makeView('view-top', solids, 'top', scale, 0, gapY),
    makeView('view-right', solids, 'right', scale, gapX, 0),
    makeView('view-iso', solids, 'iso', scale, gapX, gapY)
  ]
}

/** TechDraw > Section view: project only the part on one side of a cut plane. */
export function sectionView(id: string, solids: Solid[], axis: 'x' | 'y' | 'z', level: number, direction: ProjectionDirection = 'front', scale = 1): DrawingView {
  const cut = solids.map((solid) => {
    const positions = trianglePositions(solid)
    const kept: number[] = []
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
      const values = [positions[i + index], positions[i + 3 + index], positions[i + 6 + index]]
      if (values.every((value) => value > level)) continue
      kept.push(...positions.slice(i, i + 9))
    }
    return { ...solid, kind: 'mesh', mesh: { positions: kept, normals: [] } } as Solid
  })
  const view = makeView(id, cut, direction, scale)
  view.label = `Section ${axis.toUpperCase()}=${level}`
  return view
}

/** TechDraw > Detail view: crop a circular region and blow it up. */
export function detailView(id: string, source: DrawingView, cx: number, cy: number, radius: number, magnify = 2): DrawingView {
  const segments = source.segments
    .filter((segment) => Math.hypot(segment.x1 - cx, segment.y1 - cy) <= radius || Math.hypot(segment.x2 - cx, segment.y2 - cy) <= radius)
    .map((segment) => ({
      x1: (segment.x1 - cx) * magnify,
      y1: (segment.y1 - cy) * magnify,
      x2: (segment.x2 - cx) * magnify,
      y2: (segment.y2 - cy) * magnify
    }))
  return { id, label: `Detail x${magnify}`, direction: source.direction, scale: source.scale * magnify, x: source.x, y: source.y, segments }
}

export function lengthDimension(id: string, x1: number, y1: number, x2: number, y2: number, unit = 'mm'): DrawingDimension {
  const value = Math.hypot(x2 - x1, y2 - y1)
  return { id, kind: 'length', text: `${value.toFixed(2)} ${unit}`, x1, y1, x2, y2 }
}

export function diameterDimension(id: string, cx: number, cy: number, radius: number, unit = 'mm'): DrawingDimension {
  return { id, kind: 'diameter', text: `⌀${(radius * 2).toFixed(2)} ${unit}`, x1: cx - radius, y1: cy, x2: cx + radius, y2: cy }
}

export function createPage(name: string, template: DrawingPage['template'], views: DrawingView[], titleBlock: Record<string, string> = {}): DrawingPage {
  const size = TEMPLATES[template]
  return {
    name,
    template,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    views,
    dimensions: [],
    annotations: [],
    balloons: [],
    titleBlock: { title: name, scale: '1:1', units: 'mm', ...titleBlock }
  }
}

/** Hatch pattern for a section area: parallel lines clipped to a rectangle. */
export function hatchLines(x: number, y: number, width: number, height: number, spacing = 4, angleDeg = 45): Segment2D[] {
  const step = Math.max(1, spacing)
  const angle = (angleDeg * Math.PI) / 180
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const span = Math.hypot(width, height)
  const out: Segment2D[] = []
  for (let offset = -span; offset <= span; offset += step) {
    const px = x + width / 2 - dy * offset
    const py = y + height / 2 + dx * offset
    out.push({
      x1: px - dx * span / 2,
      y1: py - dy * span / 2,
      x2: px + dx * span / 2,
      y2: py + dy * span / 2
    })
  }
  return out.filter((segment) =>
    Math.max(segment.x1, segment.x2) >= x && Math.min(segment.x1, segment.x2) <= x + width &&
    Math.max(segment.y1, segment.y2) >= y && Math.min(segment.y1, segment.y2) <= y + height)
}

/** Render a page to SVG (mm user units, Y up flipped for SVG). */
export function pageToSvg(page: DrawingPage): string {
  const parts: string[] = []
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${page.widthMm}mm" height="${page.heightMm}mm" viewBox="0 0 ${page.widthMm} ${page.heightMm}">`)
  parts.push(`<rect x="5" y="5" width="${page.widthMm - 10}" height="${page.heightMm - 10}" fill="none" stroke="#000" stroke-width="0.5"/>`)
  const cx = page.widthMm / 2
  const cy = page.heightMm / 2
  for (const view of page.views) {
    parts.push(`<g id="${view.id}" stroke="#000" stroke-width="0.25" fill="none">`)
    for (const segment of view.segments) {
      parts.push(`<line x1="${(cx + view.x + segment.x1).toFixed(3)}" y1="${(cy + view.y - segment.y1).toFixed(3)}" x2="${(cx + view.x + segment.x2).toFixed(3)}" y2="${(cy + view.y - segment.y2).toFixed(3)}"/>`)
    }
    parts.push('</g>')
  }
  for (const dim of page.dimensions) {
    parts.push(`<g stroke="#0a0" stroke-width="0.2" fill="#0a0" font-size="3">`)
    parts.push(`<line x1="${(cx + dim.x1).toFixed(3)}" y1="${(cy - dim.y1).toFixed(3)}" x2="${(cx + dim.x2).toFixed(3)}" y2="${(cy - dim.y2).toFixed(3)}"/>`)
    parts.push(`<text x="${(cx + (dim.x1 + dim.x2) / 2).toFixed(3)}" y="${(cy - (dim.y1 + dim.y2) / 2 - 1).toFixed(3)}">${dim.text}</text>`)
    parts.push('</g>')
  }
  for (const note of page.annotations) {
    parts.push(`<text x="${(cx + note.x).toFixed(3)}" y="${(cy - note.y).toFixed(3)}" font-size="3.5" fill="#000">${note.text}</text>`)
  }
  for (const balloon of page.balloons) {
    parts.push(`<g stroke="#000" stroke-width="0.25" fill="none"><circle cx="${(cx + balloon.x).toFixed(3)}" cy="${(cy - balloon.y).toFixed(3)}" r="3.5"/><text x="${(cx + balloon.x - 1.5).toFixed(3)}" y="${(cy - balloon.y + 1.2).toFixed(3)}" font-size="3" fill="#000" stroke="none">${balloon.label}</text></g>`)
  }
  const rows = Object.entries(page.titleBlock)
  const blockHeight = Math.max(12, rows.length * 5 + 2)
  parts.push(`<g stroke="#000" stroke-width="0.35" fill="none"><rect x="${page.widthMm - 85}" y="${page.heightMm - blockHeight - 5}" width="80" height="${blockHeight}"/></g>`)
  rows.forEach(([label, value], index) => {
    parts.push(`<text x="${page.widthMm - 82}" y="${page.heightMm - blockHeight - 0.5 + index * 5}" font-size="3" fill="#000">${label}: ${value}</text>`)
  })
  parts.push('</svg>')
  return parts.join('\n')
}

/** Export a page as a minimal DXF with LINE entities. */
export function pageToDxf(page: DrawingPage): string {
  const lines = ['0', 'SECTION', '2', 'ENTITIES']
  for (const view of page.views) {
    for (const segment of view.segments) {
      lines.push('0', 'LINE', '8', view.id,
        '10', String(view.x + segment.x1), '20', String(view.y + segment.y1),
        '11', String(view.x + segment.x2), '21', String(view.y + segment.y2))
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}

/** Bill of materials rows for a drawing or assembly. */
export function billOfMaterials(solids: Solid[]): Array<{ item: number; name: string; quantity: number; material: string }> {
  const grouped = new Map<string, number>()
  for (const solid of solids) {
    const base = solid.name.replace(/-(copy|\d+|p\d+)$/i, '')
    grouped.set(base, (grouped.get(base) ?? 0) + 1)
  }
  return [...grouped.entries()].map(([name, quantity], index) => ({ item: index + 1, name, quantity, material: 'Steel' }))
}
