// Where connectors meet shapes, and the paths they take. Pure: everything comes from the shape's
// real outline, so a line ends on what is drawn and not on the box around it.
import type { DiagramNode, EdgeSide, LineType, ShapeType } from '../types'
import { polygonOutline } from './shapePolygons'

type Point = { x: number; y: number }
type Box = Pick<DiagramNode, 'x' | 'y' | 'width' | 'height' | 'shape'>

/** Which axis connectors run along. 'auto' = whichever suits the two nodes. */
export type EdgeOrient = 'h' | 'v' | 'auto'

const curve = (p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] => {
  const out: Point[] = []
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const at = (a: number, b: number, c: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
    out.push({ x: at(p0.x, p1.x, p2.x, p3.x), y: at(p0.y, p1.y, p2.y, p3.y) })
  }
  return out
}

const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Point[] => {
  const out: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const angle = from + ((to - from) * i) / steps
    out.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
  }
  return out
}

/** The outline shapePath draws, as a closed polygon. Curves are close enough at these sizes. */
export function shapeOutline(shape: ShapeType, x: number, y: number, w: number, h: number): Point[] {
  const min = Math.min
  const polygon = (...values: number[]) => values.reduce<Point[]>((list, value, index) => (index % 2 ? [...list.slice(0, -1), { x: list[list.length - 1].x, y: value }] : [...list, { x: value, y: 0 }]), [])
  const defined = polygonOutline(shape, x, y, w, h)
  if (defined) return defined
  switch (shape) {
    case 'ellipse':
      return arc(x + w / 2, y + h / 2, w / 2, h / 2, 0, Math.PI * 2, 48)
    case 'diamond':
      return polygon(x + w / 2, y, x + w, y + h / 2, x + w / 2, y + h, x, y + h / 2)
    case 'parallelogram':
      return polygon(x + 16, y, x + w, y, x + w - 16, y + h, x, y + h)
    case 'rect':
      return polygon(x, y, x + w, y, x + w, y + h, x, y + h)
    case 'hexagon': {
      const c = min(w * 0.25, h * 0.6, 26)
      return polygon(x + c, y, x + w - c, y, x + w, y + h / 2, x + w - c, y + h, x + c, y + h, x, y + h / 2)
    }
    case 'octagon': {
      const cx = min(w * 0.2, 26)
      const cy = min(h * 0.35, 16)
      return polygon(x + cx, y, x + w - cx, y, x + w, y + cy, x + w, y + h - cy, x + w - cx, y + h, x + cx, y + h, x, y + h - cy, x, y + cy)
    }
    case 'stadium': {
      const r = h / 2
      return [...arc(x + w - r, y + r, r, r, -Math.PI / 2, Math.PI / 2, 12), ...arc(x + r, y + r, r, r, Math.PI / 2, (Math.PI * 3) / 2, 12)]
    }
    case 'cylinder': {
      const ry = min(h * 0.22, 16)
      const topLeft = { x, y: y + ry }
      const topRight = { x: x + w, y: y + ry }
      const bottomRight = { x: x + w, y: y + h - ry }
      const bottomLeft = { x, y: y + h - ry }
      return [topLeft, ...curve(topLeft, { x, y }, { x: x + w, y }, topRight, 12), ...curve(bottomRight, { x: x + w, y: y + h }, { x, y: y + h }, bottomLeft, 12)]
    }
    case 'trapezoid': {
      const c = min(w * 0.22, 30)
      return polygon(x + c, y, x + w - c, y, x + w, y + h, x, y + h)
    }
    case 'chevron': {
      const c = min(w * 0.24, 28)
      return polygon(x, y, x + w - c, y, x + w, y + h / 2, x + w - c, y + h, x, y + h, x + c, y + h / 2)
    }
    case 'note': {
      const f = min(w * 0.14, h * 0.45, 18)
      return polygon(x, y, x + w - f, y, x + w, y + f, x + w, y + h, x, y + h)
    }
    case 'rounded':
    default: {
      const r = 12
      const corner = (from: Point, at: Point, to: Point) => curve(from, { x: from.x + ((at.x - from.x) * 2) / 3, y: from.y + ((at.y - from.y) * 2) / 3 }, { x: to.x + ((at.x - to.x) * 2) / 3, y: to.y + ((at.y - to.y) * 2) / 3 }, to, 4)
      return [
        { x: x + r, y },
        { x: x + w - r, y },
        ...corner({ x: x + w - r, y }, { x: x + w, y }, { x: x + w, y: y + r }),
        { x: x + w, y: y + h - r },
        ...corner({ x: x + w, y: y + h - r }, { x: x + w, y: y + h }, { x: x + w - r, y: y + h }),
        { x: x + r, y: y + h },
        ...corner({ x: x + r, y: y + h }, { x, y: y + h }, { x, y: y + h - r }),
        { x, y: y + r },
        ...corner({ x, y: y + r }, { x, y }, { x: x + r, y }),
      ]
    }
  }
}

export const nodeCenter = (node: Box): Point => ({ x: node.x + node.width / 2, y: node.y + node.height / 2 })

/** Where the line from the shape's centre towards a point leaves its outline. */
export function outlinePoint(node: Box, towards: Point): Point {
  const center = nodeCenter(node)
  const dx = towards.x - center.x
  const dy = towards.y - center.y
  if (!dx && !dy) return center
  const outline = shapeOutline(node.shape, node.x, node.y, node.width, node.height)
  let nearest = Infinity
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const denominator = dx * ey - dy * ex
    if (Math.abs(denominator) < 1e-9) continue
    const t = ((a.x - center.x) * ey - (a.y - center.y) * ex) / denominator
    const s = ((a.x - center.x) * dy - (a.y - center.y) * dx) / denominator
    if (t > 0 && t < nearest && s >= -1e-9 && s <= 1 + 1e-9) nearest = t
  }
  if (!Number.isFinite(nearest)) return center
  return { x: center.x + dx * nearest, y: center.y + dy * nearest }
}

/** The point on one face of the shape, straight out from its centre. */
function facePoint(node: Box, side: Exclude<EdgeSide, 'auto'>): Point {
  const center = nodeCenter(node)
  const step = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[side]
  return outlinePoint(node, { x: center.x + step[0], y: center.y + step[1] })
}

const manual = (side?: EdgeSide): Exclude<EdgeSide, 'auto'> | null => (side && side !== 'auto' ? side : null)
const axisOf = (side: Exclude<EdgeSide, 'auto'> | null) => (side === 'left' || side === 'right' ? 'h' : side ? 'v' : null)

/**
 * The axis two nodes face each other on: the one with the wider space between them. Their centres
 * alone would send a line into the side of a node it is really above, running along its edge.
 */
export function facingAxis(from: Box, to: Box): 'h' | 'v' {
  const a = nodeCenter(from)
  const b = nodeCenter(to)
  const gapX = Math.abs(b.x - a.x) - (from.width + to.width) / 2
  const gapY = Math.abs(b.y - a.y) - (from.height + to.height) / 2
  return gapX >= gapY ? 'h' : 'v'
}

/** The two ends of a connector, and the axis it leaves and arrives along. */
export function connectorEnds(from: Box, to: Box, orient: EdgeOrient, fromSide?: EdgeSide, toSide?: EdgeSide): { p1: Point; p2: Point; horizontal: boolean } {
  const a = nodeCenter(from)
  const b = nodeCenter(to)
  const start = manual(fromSide)
  const end = manual(toSide)
  const horizontal = (axisOf(end) ?? axisOf(start) ?? (orient === 'auto' ? facingAxis(from, to) : orient)) === 'h'
  const facing = (node: Box, other: Point): Exclude<EdgeSide, 'auto'> => {
    const center = nodeCenter(node)
    return horizontal ? (other.x >= center.x ? 'right' : 'left') : other.y >= center.y ? 'bottom' : 'top'
  }
  return { p1: facePoint(from, start ?? facing(from, b)), p2: facePoint(to, end ?? facing(to, a)), horizontal }
}

const ELBOW_MIN_BEND = 12
const STRAIGHT_RUN = 10

/** A path along the connector's axis at both ends; a free straight line runs between the two centres. */
export function connectorPath(from: Box, to: Box, lineType: LineType, orient: EdgeOrient, fromSide?: EdgeSide, toSide?: EdgeSide): string {
  if (lineType === 'straight' && orient === 'auto' && !manual(fromSide) && !manual(toSide)) {
    const p1 = outlinePoint(from, nodeCenter(to))
    const p2 = outlinePoint(to, nodeCenter(from))
    return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  }
  const { p1, p2, horizontal } = connectorEnds(from, to, orient, fromSide, toSide)
  const { x: x1, y: y1 } = p1
  const { x: x2, y: y2 } = p2
  if (lineType === 'elbow') {
    // Two nodes almost in line: a bend of a few pixels only looks like a mistake.
    if (Math.abs(horizontal ? y2 - y1 : x2 - x1) <= ELBOW_MIN_BEND) return `M ${x1} ${y1} L ${x2} ${y2}`
    if (horizontal) {
      const mx = (x1 + x2) / 2
      return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`
    }
    const my = (y1 + y2) / 2
    return `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`
  }
  if (lineType === 'curve' || lineType === 'root') {
    // A short straight run at each end: the line leaves and arrives square to the face however
    // steep the curve between, and an arrowhead sits in line with it.
    if (horizontal) {
      const run = Math.sign(x2 - x1) * Math.min(STRAIGHT_RUN, Math.abs(x2 - x1) / 4)
      const mx = (x1 + x2) / 2
      return `M ${x1} ${y1} L ${x1 + run} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - run} ${y2} L ${x2} ${y2}`
    }
    const run = Math.sign(y2 - y1) * Math.min(STRAIGHT_RUN, Math.abs(y2 - y1) / 4)
    const my = (y1 + y2) / 2
    return `M ${x1} ${y1} L ${x1} ${y1 + run} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - run} L ${x2} ${y2}`
  }
  return `M ${x1} ${y1} L ${x2} ${y2}`
}

/** How far a ribbon's end runs on under a shape, so that no corner of it shows outside the outline. */
function tuckUnder(node: DiagramNode, width: number, horizontal: boolean): number {
  if (node.image) return 0
  return Math.min(width * 2 + 2, (horizontal ? node.width : node.height) / 2)
}

/**
 * A filled "tree root" branch: wide at the parent, narrowing to the child. It leaves and arrives
 * square to the faces, and both ends continue under the shapes, which are drawn on top of it.
 */
export function ribbonPath(from: DiagramNode, to: DiagramNode, wStart: number, wEnd: number, orient: EdgeOrient, fromSide?: EdgeSide, toSide?: EdgeSide): string {
  const { p1, p2, horizontal } = connectorEnds(from, to, orient, fromSide, toSide)
  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  const c1 = horizontal ? { x: mx, y: p1.y } : { x: p1.x, y: my }
  const c2 = horizontal ? { x: mx, y: p2.y } : { x: p2.x, y: my }
  const leaving = horizontal ? { x: p2.x >= p1.x ? 1 : -1, y: 0 } : { x: 0, y: p2.y >= p1.y ? 1 : -1 }
  const steps = 22
  const left: string[] = []
  const right: string[] = []
  const add = (x: number, y: number, nx: number, ny: number, half: number) => {
    left.push(`${(x + nx * half).toFixed(2)} ${(y + ny * half).toFixed(2)}`)
    right.push(`${(x - nx * half).toFixed(2)} ${(y - ny * half).toFixed(2)}`)
  }
  const inStart = tuckUnder(from, wStart, horizontal)
  add(p1.x - leaving.x * inStart, p1.y - leaving.y * inStart, -leaving.y, leaving.x, wStart / 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const at = (a: number, b: number, c: number, d: number) => u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
    const slope = (a: number, b: number, c: number, d: number) => 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c)
    const tx = slope(p1.x, c1.x, c2.x, p2.x)
    const ty = slope(p1.y, c1.y, c2.y, p2.y)
    const length = Math.hypot(tx, ty)
    // The ends are square to the faces, whatever the curve does on the way.
    const along = i === 0 || i === steps || !length ? leaving : { x: tx / length, y: ty / length }
    add(at(p1.x, c1.x, c2.x, p2.x), at(p1.y, c1.y, c2.y, p2.y), -along.y, along.x, wEnd / 2 + (wStart / 2 - wEnd / 2) * Math.pow(u, 1.3))
  }
  const inEnd = tuckUnder(to, wEnd, horizontal)
  add(p2.x + leaving.x * inEnd, p2.y + leaving.y * inEnd, -leaving.y, leaving.x, wEnd / 2)
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`
}
