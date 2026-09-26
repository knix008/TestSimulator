import type { Sketch } from './part'

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
