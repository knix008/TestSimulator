// FreeCAD Draft workbench: 2D wires, arrays, annotations, upgrade/downgrade.
import type { Vec3 } from './model'

export interface Wire {
  id: string
  name: string
  closed: boolean
  points: Vec3[]
}

export interface Annotation {
  id: string
  kind: 'dimension' | 'angle' | 'radius' | 'label' | 'text' | 'leader'
  text: string
  a: Vec3
  b: Vec3
  value: number
}

export function makeWire(id: string, name: string, points: Vec3[], closed = false): Wire {
  return { id, name, closed, points: points.map((point) => ({ ...point })) }
}

export function draftLine(id: string, from: Vec3, to: Vec3): Wire {
  return makeWire(id, 'Line', [from, to], false)
}

export function draftRectangle(id: string, width: number, height: number, z = 0): Wire {
  const w = Math.max(0.1, width) / 2
  const h = Math.max(0.1, height) / 2
  return makeWire(id, 'Rectangle', [
    { x: -w, y: -h, z }, { x: w, y: -h, z }, { x: w, y: h, z }, { x: -w, y: h, z }
  ], true)
}

export function draftPolygon(id: string, sides: number, radius: number, z = 0): Wire {
  const n = Math.max(3, Math.min(64, Math.round(sides)))
  const r = Math.max(0.1, radius)
  const points: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z })
  }
  return makeWire(id, `Polygon${n}`, points, true)
}

export function draftCircle(id: string, radius: number, segments = 32, z = 0): Wire {
  const n = Math.max(6, Math.min(180, Math.round(segments)))
  const r = Math.max(0.1, radius)
  const points: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z })
  }
  return makeWire(id, 'Circle', points, true)
}

export function draftEllipse(id: string, rx: number, ry: number, segments = 48, z = 0): Wire {
  const n = Math.max(6, Math.min(180, Math.round(segments)))
  const points: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n
    points.push({ x: Math.cos(a) * Math.max(0.1, rx), y: Math.sin(a) * Math.max(0.1, ry), z })
  }
  return makeWire(id, 'Ellipse', points, true)
}

export function draftArc(id: string, radius: number, startDeg: number, endDeg: number, segments = 24, z = 0): Wire {
  const n = Math.max(2, Math.min(180, Math.round(segments)))
  const r = Math.max(0.1, radius)
  const from = (startDeg * Math.PI) / 180
  const to = (endDeg * Math.PI) / 180
  const points: Vec3[] = []
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n
    points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z })
  }
  return makeWire(id, 'Arc', points, false)
}

function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t
  const t3 = t2 * t
  const axis = (a: number, b: number, c: number, d: number) =>
    0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return {
    x: axis(p0.x, p1.x, p2.x, p3.x),
    y: axis(p0.y, p1.y, p2.y, p3.y),
    z: axis(p0.z, p1.z, p2.z, p3.z)
  }
}

/** Draft > BSpline: interpolating spline through the control points. */
export function draftBSpline(id: string, controls: Vec3[], perSpan = 8): Wire {
  if (controls.length < 2) throw new Error('B-스플라인: 점이 2개 이상 필요합니다.')
  const points: Vec3[] = []
  for (let i = 0; i < controls.length - 1; i++) {
    const p0 = controls[Math.max(0, i - 1)]
    const p1 = controls[i]
    const p2 = controls[i + 1]
    const p3 = controls[Math.min(controls.length - 1, i + 2)]
    for (let s = 0; s < perSpan; s++) points.push(catmull(p0, p1, p2, p3, s / perSpan))
  }
  points.push({ ...controls[controls.length - 1] })
  return makeWire(id, 'BSpline', points, false)
}

/** Draft > BezCurve: cubic Bezier chain over the control points. */
export function draftBezier(id: string, controls: Vec3[], steps = 32): Wire {
  if (controls.length < 3) throw new Error('베지어: 점이 3개 이상 필요합니다.')
  const points: Vec3[] = []
  const n = controls.length - 1
  const binom = (k: number) => {
    let result = 1
    for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1)
    return result
  }
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    let x = 0, y = 0, z = 0
    for (let k = 0; k <= n; k++) {
      const weight = binom(k) * Math.pow(1 - t, n - k) * Math.pow(t, k)
      x += controls[k].x * weight
      y += controls[k].y * weight
      z += controls[k].z * weight
    }
    points.push({ x, y, z })
  }
  return makeWire(id, 'Bezier', points, false)
}

/** Draft > Fillet: round the corner between two wire segments. */
export function filletWire(wire: Wire, radius: number, segments = 8): Wire {
  if (wire.points.length < 3) return wire
  const r = Math.max(0.01, radius)
  const out: Vec3[] = []
  const last = wire.points.length - 1
  for (let i = 0; i < wire.points.length; i++) {
    const current = wire.points[i]
    const previous = wire.points[i === 0 ? (wire.closed ? last : 0) : i - 1]
    const next = wire.points[i === last ? (wire.closed ? 0 : last) : i + 1]
    if ((!wire.closed && (i === 0 || i === last))) {
      out.push({ ...current })
      continue
    }
    const inDir = normalize({ x: current.x - previous.x, y: current.y - previous.y, z: current.z - previous.z })
    const outDir = normalize({ x: next.x - current.x, y: next.y - current.y, z: next.z - current.z })
    const start = { x: current.x - inDir.x * r, y: current.y - inDir.y * r, z: current.z - inDir.z * r }
    const end = { x: current.x + outDir.x * r, y: current.y + outDir.y * r, z: current.z + outDir.z * r }
    for (let s = 0; s <= segments; s++) {
      const t = s / segments
      const ax = start.x + (current.x - start.x) * t
      const ay = start.y + (current.y - start.y) * t
      const az = start.z + (current.z - start.z) * t
      const bx = current.x + (end.x - current.x) * t
      const by = current.y + (end.y - current.y) * t
      const bz = current.z + (end.z - current.z) * t
      out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, z: az + (bz - az) * t })
    }
  }
  return { ...wire, points: out }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

export function wireLength(wire: Wire): number {
  let total = 0
  for (let i = 1; i < wire.points.length; i++) {
    const a = wire.points[i - 1]
    const b = wire.points[i]
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  if (wire.closed && wire.points.length > 2) {
    const a = wire.points[wire.points.length - 1]
    const b = wire.points[0]
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return total
}

/** Shoelace area of a closed wire projected on XY. */
export function wireArea(wire: Wire): number {
  if (!wire.closed || wire.points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < wire.points.length; i++) {
    const a = wire.points[i]
    const b = wire.points[(i + 1) % wire.points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/** Draft > Offset of a closed wire (positive grows outwards). */
export function offsetWire(wire: Wire, distance: number): Wire {
  const center = wire.points.reduce(
    (acc, point) => ({ x: acc.x + point.x / wire.points.length, y: acc.y + point.y / wire.points.length, z: acc.z + point.z / wire.points.length }),
    { x: 0, y: 0, z: 0 }
  )
  const points = wire.points.map((point) => {
    const dir = normalize({ x: point.x - center.x, y: point.y - center.y, z: point.z - center.z })
    return { x: point.x + dir.x * distance, y: point.y + dir.y * distance, z: point.z + dir.z * distance }
  })
  return { ...wire, name: `Offset-${wire.name}`, points }
}

/** Draft > Trimex: trim or extend the last segment by a length. */
export function trimExtendWire(wire: Wire, delta: number): Wire {
  if (wire.points.length < 2) return wire
  const points = wire.points.map((point) => ({ ...point }))
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  const dir = normalize({ x: last.x - prev.x, y: last.y - prev.y, z: last.z - prev.z })
  points[points.length - 1] = { x: last.x + dir.x * delta, y: last.y + dir.y * delta, z: last.z + dir.z * delta }
  return { ...wire, points }
}

/** Draft > Join: chain wires whose endpoints touch within tolerance. */
export function joinWires(wires: Wire[], tolerance = 1e-6): Wire {
  if (wires.length === 0) throw new Error('조인: 와이어가 없습니다.')
  const points: Vec3[] = wires[0].points.map((point) => ({ ...point }))
  for (const wire of wires.slice(1)) {
    const tail = points[points.length - 1]
    const head = wire.points[0]
    const reversed = wire.points[wire.points.length - 1]
    const touchesHead = Math.hypot(tail.x - head.x, tail.y - head.y, tail.z - head.z) <= tolerance
    const touchesTail = Math.hypot(tail.x - reversed.x, tail.y - reversed.y, tail.z - reversed.z) <= tolerance
    const ordered = touchesTail && !touchesHead ? [...wire.points].reverse() : wire.points
    const skip = touchesHead || touchesTail ? 1 : 0
    for (const point of ordered.slice(skip)) points.push({ ...point })
  }
  return makeWire(`${wires[0].id}-join`, 'Join', points, false)
}

/** Draft > Split at a vertex index. */
export function splitWire(wire: Wire, index: number): [Wire, Wire] {
  const at = Math.max(1, Math.min(wire.points.length - 2, Math.round(index)))
  return [
    makeWire(`${wire.id}-a`, `${wire.name}-a`, wire.points.slice(0, at + 1), false),
    makeWire(`${wire.id}-b`, `${wire.name}-b`, wire.points.slice(at), false)
  ]
}

/** Draft > Upgrade: close open wires and merge collinear points. */
export function upgradeWire(wire: Wire): Wire {
  const points: Vec3[] = []
  for (const point of wire.points) {
    const last = points[points.length - 1]
    if (last && Math.hypot(last.x - point.x, last.y - point.y, last.z - point.z) < 1e-9) continue
    points.push({ ...point })
  }
  return { ...wire, closed: true, points }
}

/** Draft > Downgrade: explode a wire into individual segments. */
export function downgradeWire(wire: Wire): Wire[] {
  const segments: Wire[] = []
  const total = wire.closed ? wire.points.length : wire.points.length - 1
  for (let i = 0; i < total; i++) {
    const a = wire.points[i]
    const b = wire.points[(i + 1) % wire.points.length]
    segments.push(makeWire(`${wire.id}-s${i}`, `${wire.name}-s${i + 1}`, [a, b], false))
  }
  return segments
}

export function moveWire(wire: Wire, delta: Vec3): Wire {
  return { ...wire, points: wire.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z })) }
}

export function rotateWire(wire: Wire, angleDeg: number, axis: 'x' | 'y' | 'z' = 'z'): Wire {
  const a = (angleDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return {
    ...wire,
    points: wire.points.map((point) => {
      if (axis === 'z') return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos, z: point.z }
      if (axis === 'y') return { x: point.x * cos + point.z * sin, y: point.y, z: -point.x * sin + point.z * cos }
      return { x: point.x, y: point.y * cos - point.z * sin, z: point.y * sin + point.z * cos }
    })
  }
}

export function scaleWire(wire: Wire, factor: number): Wire {
  return { ...wire, points: wire.points.map((point) => ({ x: point.x * factor, y: point.y * factor, z: point.z * factor })) }
}

export function mirrorWire(wire: Wire, plane: 'xy' | 'xz' | 'yz'): Wire {
  return {
    ...wire,
    name: `Mirror-${wire.name}`,
    points: wire.points.map((point) => ({
      x: plane === 'yz' ? -point.x : point.x,
      y: plane === 'xz' ? -point.y : point.y,
      z: plane === 'xy' ? -point.z : point.z
    }))
  }
}

/** Draft > Stretch: move only the points beyond a threshold. */
export function stretchWire(wire: Wire, axis: 'x' | 'y' | 'z', threshold: number, delta: number): Wire {
  return {
    ...wire,
    points: wire.points.map((point) => {
      const value = point[axis]
      if (value < threshold) return { ...point }
      return { ...point, [axis]: value + delta } as Vec3
    })
  }
}

export type ArrayKind = 'ortho' | 'polar' | 'circular' | 'path' | 'point'

export interface ArrayPlacement {
  position: Vec3
  rotation: Vec3
}

/** Draft > Array in all five FreeCAD flavours; returns placements. */
export function draftArray(kind: ArrayKind, options: {
  countX?: number
  countY?: number
  countZ?: number
  intervalX?: Vec3
  intervalY?: Vec3
  intervalZ?: Vec3
  count?: number
  angle?: number
  radius?: number
  rings?: number
  path?: Vec3[]
  points?: Vec3[]
}): ArrayPlacement[] {
  const zero = { x: 0, y: 0, z: 0 }
  if (kind === 'ortho') {
    const nx = Math.max(1, Math.round(options.countX ?? 2))
    const ny = Math.max(1, Math.round(options.countY ?? 1))
    const nz = Math.max(1, Math.round(options.countZ ?? 1))
    const ix = options.intervalX ?? { x: 30, y: 0, z: 0 }
    const iy = options.intervalY ?? { x: 0, y: 30, z: 0 }
    const iz = options.intervalZ ?? { x: 0, y: 0, z: 30 }
    const out: ArrayPlacement[] = []
    for (let x = 0; x < nx; x++) {
      for (let y = 0; y < ny; y++) {
        for (let z = 0; z < nz; z++) {
          out.push({
            position: {
              x: ix.x * x + iy.x * y + iz.x * z,
              y: ix.y * x + iy.y * y + iz.y * z,
              z: ix.z * x + iy.z * y + iz.z * z
            },
            rotation: { ...zero }
          })
        }
      }
    }
    return out
  }
  if (kind === 'polar') {
    const count = Math.max(2, Math.round(options.count ?? 6))
    const radius = options.radius ?? 40
    const sweep = options.angle ?? 360
    return Array.from({ length: count }, (_, i) => {
      const deg = (sweep * i) / (sweep >= 360 ? count : Math.max(1, count - 1))
      const rad = (deg * Math.PI) / 180
      return {
        position: { x: Math.cos(rad) * radius, y: 0, z: Math.sin(rad) * radius },
        rotation: { x: 0, y: deg, z: 0 }
      }
    })
  }
  if (kind === 'circular') {
    const rings = Math.max(1, Math.round(options.rings ?? 2))
    const perRing = Math.max(1, Math.round(options.count ?? 6))
    const radius = options.radius ?? 30
    const out: ArrayPlacement[] = [{ position: { ...zero }, rotation: { ...zero } }]
    for (let ring = 1; ring <= rings; ring++) {
      const items = perRing * ring
      for (let i = 0; i < items; i++) {
        const rad = (Math.PI * 2 * i) / items
        out.push({
          position: { x: Math.cos(rad) * radius * ring, y: 0, z: Math.sin(rad) * radius * ring },
          rotation: { ...zero }
        })
      }
    }
    return out
  }
  if (kind === 'path') {
    const path = options.path ?? []
    const count = Math.max(2, Math.round(options.count ?? Math.max(2, path.length)))
    if (path.length < 2) throw new Error('경로 배열: 경로 점이 부족합니다.')
    const lengths: number[] = [0]
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    }
    const total = lengths[lengths.length - 1] || 1
    return Array.from({ length: count }, (_, i) => {
      const target = (total * i) / (count - 1)
      let segment = 1
      while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1
      const a = path[segment - 1]
      const b = path[segment]
      const span = lengths[segment] - lengths[segment - 1] || 1
      const t = (target - lengths[segment - 1]) / span
      return {
        position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t },
        rotation: { x: 0, y: (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI, z: 0 }
      }
    })
  }
  return (options.points ?? []).map((point) => ({ position: { ...point }, rotation: { ...zero } }))
}

/** Draft > ShapeString: outline every glyph as a rectangle wire (stroke font stand-in). */
export function shapeString(text: string, height: number, id: string): Wire[] {
  const size = Math.max(1, height)
  const advance = size * 0.7
  const wires: Wire[] = []
  Array.from(text).forEach((char, index) => {
    if (char.trim() === '') return
    const x = index * advance
    const w = advance * 0.72
    wires.push(makeWire(`${id}-${index}`, `Glyph-${char}`, [
      { x, y: 0, z: 0 },
      { x: x + w, y: 0, z: 0 },
      { x: x + w, y: size, z: 0 },
      { x, y: size, z: 0 }
    ], true))
  })
  return wires
}

export function dimensionAnnotation(id: string, a: Vec3, b: Vec3, unit = 'mm'): Annotation {
  const value = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  return { id, kind: 'dimension', text: `${value.toFixed(2)} ${unit}`, a: { ...a }, b: { ...b }, value }
}

export function angleAnnotation(id: string, center: Vec3, a: Vec3, b: Vec3): Annotation {
  const v1 = { x: a.x - center.x, y: a.y - center.y, z: a.z - center.z }
  const v2 = { x: b.x - center.x, y: b.y - center.y, z: b.z - center.z }
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z
  const l1 = Math.hypot(v1.x, v1.y, v1.z) || 1
  const l2 = Math.hypot(v2.x, v2.y, v2.z) || 1
  const value = (Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2)))) * 180) / Math.PI
  return { id, kind: 'angle', text: `${value.toFixed(1)}°`, a: { ...a }, b: { ...b }, value }
}

export function textAnnotation(id: string, at: Vec3, text: string): Annotation {
  return { id, kind: 'text', text, a: { ...at }, b: { ...at }, value: 0 }
}

export function wireToSvgPath(wire: Wire): string {
  if (wire.points.length === 0) return ''
  const head = wire.points[0]
  const parts = [`M ${head.x.toFixed(3)} ${(-head.y).toFixed(3)}`]
  for (const point of wire.points.slice(1)) parts.push(`L ${point.x.toFixed(3)} ${(-point.y).toFixed(3)}`)
  if (wire.closed) parts.push('Z')
  return parts.join(' ')
}
