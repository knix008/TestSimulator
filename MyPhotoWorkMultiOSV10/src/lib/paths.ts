import { createCanvas, context2d, createId } from './canvas'
import { emptyMask, maskBounds } from './selection'
import type { PathNode, PathShape, Point, Selection } from './types'

/** A corner anchor: both handles sit on the point, so the segments stay straight. */
export function pathNode(x: number, y: number, inPoint?: Point, outPoint?: Point): PathNode {
  return {
    x,
    y,
    inX: inPoint?.x ?? x,
    inY: inPoint?.y ?? y,
    outX: outPoint?.x ?? x,
    outY: outPoint?.y ?? y,
  }
}

export function createPath(name: string, nodes: PathNode[] = [], closed = false): PathShape {
  return { id: createId('path'), name, nodes, closed }
}

export function isStraight(node: PathNode) {
  return node.inX === node.x && node.inY === node.y && node.outX === node.x && node.outY === node.y
}

/**
 * Mirrors the outgoing handle onto the incoming one, which is what dragging out
 * of a freshly placed anchor does in a pen tool.
 */
export function smoothNode(node: PathNode, out: Point): PathNode {
  return {
    ...node,
    outX: out.x,
    outY: out.y,
    inX: node.x - (out.x - node.x),
    inY: node.y - (out.y - node.y),
  }
}

/**
 * Rebuilds every handle from the neighbouring anchors, giving the rounded shape
 * the curvature pen draws from plain clicks.
 */
export function smoothPath(path: PathShape, tension = 0.32): PathShape {
  const { nodes, closed } = path
  if (nodes.length < 3) {
    return { ...path, nodes: nodes.map((node) => pathNode(node.x, node.y)) }
  }
  const next = nodes.map((node, index) => {
    const previous = nodes[index - 1] ?? (closed ? nodes[nodes.length - 1] : node)
    const following = nodes[index + 1] ?? (closed ? nodes[0] : node)
    const dx = (following.x - previous.x) * tension
    const dy = (following.y - previous.y) * tension
    return {
      x: node.x,
      y: node.y,
      inX: node.x - dx,
      inY: node.y - dy,
      outX: node.x + dx,
      outY: node.y + dy,
    }
  })
  return { ...path, nodes: next }
}

/** Drops points closer together than `tolerance` — the freeform pen's cleanup pass. */
export function simplifyPoints(points: Point[], tolerance = 3) {
  const kept: Point[] = []
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= tolerance) {
      kept.push(point)
    }
  }
  if (kept.length === 0 && points.length) {
    kept.push(points[0])
  }
  return kept
}

export function pathFromPoints(name: string, points: Point[], closed = false, tolerance = 3) {
  return smoothPath(createPath(name, simplifyPoints(points, tolerance).map((point) => pathNode(point.x, point.y)), closed))
}

/** Lays the path onto a 2D context. The caller decides whether to fill or stroke. */
export function tracePath(ctx: CanvasRenderingContext2D, path: PathShape) {
  const { nodes, closed } = path
  if (nodes.length === 0) {
    return
  }
  ctx.beginPath()
  ctx.moveTo(nodes[0].x, nodes[0].y)
  for (let i = 1; i < nodes.length; i += 1) {
    const from = nodes[i - 1]
    const to = nodes[i]
    ctx.bezierCurveTo(from.outX, from.outY, to.inX, to.inY, to.x, to.y)
  }
  if (closed && nodes.length > 1) {
    const from = nodes[nodes.length - 1]
    const to = nodes[0]
    ctx.bezierCurveTo(from.outX, from.outY, to.inX, to.inY, to.x, to.y)
    ctx.closePath()
  }
}

export function strokePathOnto(canvas: HTMLCanvasElement, path: PathShape, color: string, width: number) {
  if (path.nodes.length < 2) {
    return
  }
  const ctx = context2d(canvas)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(0.1, width)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  tracePath(ctx, path)
  ctx.stroke()
  ctx.restore()
}

export function fillPathOnto(canvas: HTMLCanvasElement, path: PathShape, color: string) {
  if (path.nodes.length < 3) {
    return
  }
  const ctx = context2d(canvas)
  ctx.save()
  ctx.fillStyle = color
  tracePath(ctx, path)
  ctx.fill()
  ctx.restore()
}

/** Converts a closed path into a pixel mask selection. */
export function pathToSelection(path: PathShape, width: number, height: number): Selection {
  const mask = emptyMask(width, height)
  if (path.nodes.length < 3) {
    return { kind: 'mask', x: 0, y: 0, width: 0, height: 0, mask }
  }
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.fillStyle = '#ffffff'
  tracePath(ctx, { ...path, closed: true })
  ctx.fill()
  const data = ctx.getImageData(0, 0, width, height).data
  for (let i = 0; i < mask.length; i += 1) {
    if (data[i * 4 + 3] > 8) {
      mask[i] = 255
    }
  }
  return { kind: 'mask', ...maskBounds(mask, width, height), mask }
}

export function pathBounds(path: PathShape) {
  if (path.nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of path.nodes) {
    // Handles can reach outside the anchors, and the drawn curve follows them.
    for (const [x, y] of [[node.x, node.y], [node.inX, node.inY], [node.outX, node.outY]]) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export type PathHit = { pathId: string; index: number; part: 'anchor' | 'in' | 'out' }

/** Finds the anchor or handle under the cursor, newest path first. */
export function hitTestPaths(paths: PathShape[], point: Point, radius = 6): PathHit | null {
  const near = (x: number, y: number) => Math.hypot(point.x - x, point.y - y) <= radius
  for (let p = paths.length - 1; p >= 0; p -= 1) {
    const path = paths[p]
    for (let i = path.nodes.length - 1; i >= 0; i -= 1) {
      const node = path.nodes[i]
      if (near(node.x, node.y)) return { pathId: path.id, index: i, part: 'anchor' }
      if (!isStraight(node)) {
        if (near(node.outX, node.outY)) return { pathId: path.id, index: i, part: 'out' }
        if (near(node.inX, node.inY)) return { pathId: path.id, index: i, part: 'in' }
      }
    }
  }
  return null
}

/** Moves one anchor (handles follow) or a single handle. */
export function movePathPoint(path: PathShape, hit: PathHit, to: Point): PathShape {
  const nodes = path.nodes.map((node, index) => {
    if (index !== hit.index) {
      return node
    }
    if (hit.part === 'anchor') {
      const dx = to.x - node.x
      const dy = to.y - node.y
      return {
        x: to.x, y: to.y,
        inX: node.inX + dx, inY: node.inY + dy,
        outX: node.outX + dx, outY: node.outY + dy,
      }
    }
    if (hit.part === 'out') {
      return { ...node, outX: to.x, outY: to.y, inX: node.x - (to.x - node.x), inY: node.y - (to.y - node.y) }
    }
    return { ...node, inX: to.x, inY: to.y, outX: node.x - (to.x - node.x), outY: node.y - (to.y - node.y) }
  })
  return { ...path, nodes }
}

/** Shifts a whole path, which is what the path-selection tool drags. */
export function translatePath(path: PathShape, dx: number, dy: number): PathShape {
  return {
    ...path,
    nodes: path.nodes.map((node) => ({
      x: node.x + dx, y: node.y + dy,
      inX: node.inX + dx, inY: node.inY + dy,
      outX: node.outX + dx, outY: node.outY + dy,
    })),
  }
}

/** Draws anchors, handles and the curve itself over the viewport. */
export function drawPathOverlay(ctx: CanvasRenderingContext2D, paths: PathShape[], activeId: string | null, scale = 1) {
  const r = 3.5 / scale
  for (const path of paths) {
    if (path.nodes.length === 0) continue
    ctx.save()
    ctx.lineWidth = 1 / scale
    ctx.setLineDash([])
    ctx.strokeStyle = path.id === activeId ? '#38bdf8' : 'rgba(160, 200, 240, 0.75)'
    tracePath(ctx, path)
    ctx.stroke()

    for (const node of path.nodes) {
      if (!isStraight(node)) {
        ctx.strokeStyle = 'rgba(160, 200, 240, 0.55)'
        ctx.beginPath()
        ctx.moveTo(node.inX, node.inY)
        ctx.lineTo(node.x, node.y)
        ctx.lineTo(node.outX, node.outY)
        ctx.stroke()
        ctx.fillStyle = '#93c5fd'
        for (const [hx, hy] of [[node.inX, node.inY], [node.outX, node.outY]]) {
          ctx.beginPath()
          ctx.arc(hx, hy, r * 0.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = '#0f172a'
      ctx.beginPath()
      ctx.rect(node.x - r, node.y - r, r * 2, r * 2)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
}
