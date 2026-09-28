import type { Sketch } from './part'
import { makeWire, type Wire } from './draftwb'

function polygon(sketch: Sketch): Array<[number, number]> {
  if (sketch.shape === 'circle') {
    const r = Math.max(sketch.width, 1) / 2
    const points: Array<[number, number]> = []
    for (let i = 0; i < 24; i++) {
      const a = (Math.PI * 2 * i) / 24
      points.push([Math.cos(a) * r, Math.sin(a) * r])
    }
    return points
  }
  if (sketch.shape === 'polygon') {
    const r = Math.max(sketch.width, 1) / 2
    const sides = Math.max(3, sketch.sides)
    return Array.from({ length: sides }, (_, i) => {
      const a = (Math.PI * 2 * i) / sides - Math.PI / 2
      return [Math.cos(a) * r, Math.sin(a) * r] as [number, number]
    })
  }
  const w = sketch.width / 2
  const h = sketch.height / 2
  return [[-w, -h], [w, -h], [w, h], [-w, h]]
}

export function sketchesToDxf(sketches: Sketch[]): string {
  const lines = ['0', 'SECTION', '2', 'ENTITIES']
  for (const sketch of sketches) {
    const points = polygon(sketch)
    if (sketch.shape === 'circle') {
      lines.push('0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', String(Math.max(sketch.width, 1) / 2))
      continue
    }
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % points.length]
      lines.push('0', 'LINE', '8', '0', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2))
    }
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}

export function sketchesToSvg(sketches: Sketch[]): string {
  const shapes = sketches.map((sketch) => {
    const points = polygon(sketch)
    if (sketch.shape === 'circle') return `<circle cx="0" cy="0" r="${Math.max(sketch.width, 1) / 2}" />`
    return `<polygon points="${points.map(([x, y]) => `${x},${-y}`).join(' ')}" />`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400">\n${shapes.join('\n')}\n</svg>\n`
}

/** Import DXF LINE and CIRCLE entities as wires (the subset this app writes). */
export function parseDxfWires(text: string, id: string): Wire[] {
  const codes = text.split(/\r?\n/).map((line) => line.trim())
  const wires: Wire[] = []
  let index = 0
  for (let i = 0; i < codes.length - 1; i += 2) {
    const code = codes[i]
    const value = codes[i + 1]
    if (code !== '0') continue
    if (value === 'LINE' || value === 'CIRCLE') {
      const fields: Record<string, number> = {}
      for (let j = i + 2; j < codes.length - 1; j += 2) {
        if (codes[j] === '0') break
        const key = codes[j]
        const numeric = Number(codes[j + 1])
        if (Number.isFinite(numeric)) fields[key] = numeric
      }
      if (value === 'LINE') {
        wires.push(makeWire(`${id}-${index++}`, 'Line', [
          { x: fields['10'] ?? 0, y: fields['20'] ?? 0, z: 0 },
          { x: fields['11'] ?? 0, y: fields['21'] ?? 0, z: 0 }
        ], false))
      } else {
        const radius = fields['40'] ?? 1
        const cx = fields['10'] ?? 0
        const cy = fields['20'] ?? 0
        const points = Array.from({ length: 36 }, (_item, step) => {
          const angle = (Math.PI * 2 * step) / 36
          return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, z: 0 }
        })
        wires.push(makeWire(`${id}-${index++}`, 'Circle', points, true))
      }
    }
  }
  return wires
}

/** Import the polygons, polylines and circles of an SVG as wires. */
export function parseSvgWires(text: string, id: string): Wire[] {
  const wires: Wire[] = []
  let index = 0
  for (const match of text.matchAll(/<(polygon|polyline)[^>]*points="([^"]+)"/g)) {
    const points = match[2].trim().split(/\s+/).map((pair) => {
      const [x, y] = pair.split(',').map(Number)
      return { x: x || 0, y: -(y || 0), z: 0 }
    })
    if (points.length >= 2) wires.push(makeWire(`${id}-${index++}`, match[1], points, match[1] === 'polygon'))
  }
  for (const match of text.matchAll(/<circle[^>]*cx="(-?[\d.]+)"[^>]*cy="(-?[\d.]+)"[^>]*r="([\d.]+)"/g)) {
    const cx = Number(match[1])
    const cy = -Number(match[2])
    const radius = Number(match[3])
    const points = Array.from({ length: 36 }, (_item, step) => {
      const angle = (Math.PI * 2 * step) / 36
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, z: 0 }
    })
    wires.push(makeWire(`${id}-${index++}`, 'Circle', points, true))
  }
  return wires
}
