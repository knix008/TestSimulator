import { context2d, createCanvas } from './canvas'
import type { Point, TransformBox, TransformHandle } from './types'

/** The identity transform for a layer: its pixels where they already are. */
export function transformFromBox(x: number, y: number, width: number, height: number): TransformBox {
  return { x, y, width, height, angle: 0, flipX: false, flipY: false }
}

export function identityTransform(width: number, height: number) {
  return transformFromBox(0, 0, width, height)
}

export function transformCenter(box: TransformBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export function isIdentityTransform(box: TransformBox, width: number, height: number) {
  return box.x === 0 && box.y === 0 && box.width === width && box.height === height
    && box.angle === 0 && !box.flipX && !box.flipY
}

function rotate(point: Point, origin: Point, radians: number): Point {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return { x: origin.x + dx * cos - dy * sin, y: origin.y + dx * sin + dy * cos }
}

/** The eight resize grips plus the rotation grip, in document coordinates. */
export function transformHandles(box: TransformBox): Record<TransformHandle, Point> {
  const center = transformCenter(box)
  const radians = (box.angle * Math.PI) / 180
  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  const midX = center.x
  const midY = center.y
  const raw: Record<TransformHandle, Point> = {
    nw: { x: left, y: top },
    n: { x: midX, y: top },
    ne: { x: right, y: top },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: left, y: bottom },
    w: { x: left, y: midY },
    // Floating above the top edge, the way a rotate grip sits outside the box.
    rotate: { x: midX, y: top - Math.max(18, Math.abs(box.height) * 0.16) },
    move: center,
  }
  const out = {} as Record<TransformHandle, Point>
  for (const key of Object.keys(raw) as TransformHandle[]) {
    out[key] = rotate(raw[key], center, radians)
  }
  return out
}

export function hitTestTransform(box: TransformBox, point: Point, radius = 8): TransformHandle | null {
  const handles = transformHandles(box)
  const order: TransformHandle[] = ['rotate', 'nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']
  for (const handle of order) {
    const at = handles[handle]
    if (Math.hypot(point.x - at.x, point.y - at.y) <= radius) {
      return handle
    }
  }
  return containsPoint(box, point) ? 'move' : null
}

/** Point-in-box in the box's own unrotated space. */
export function containsPoint(box: TransformBox, point: Point) {
  const center = transformCenter(box)
  const local = rotate(point, center, (-box.angle * Math.PI) / 180)
  return local.x >= box.x && local.x <= box.x + box.width && local.y >= box.y && local.y <= box.y + box.height
}

/**
 * Applies one drag to the box. `shift` keeps the aspect ratio for corner grips
 * and snaps rotation to 15 degrees, which is what the modifier is for.
 */
export function dragTransform(
  box: TransformBox,
  handle: TransformHandle,
  from: Point,
  to: Point,
  options: { shift?: boolean; fromCenter?: boolean } = {},
): TransformBox {
  if (handle === 'move') {
    return { ...box, x: box.x + (to.x - from.x), y: box.y + (to.y - from.y) }
  }
  if (handle === 'rotate') {
    const center = transformCenter(box)
    const before = Math.atan2(from.y - center.y, from.x - center.x)
    const after = Math.atan2(to.y - center.y, to.x - center.x)
    let angle = box.angle + ((after - before) * 180) / Math.PI
    if (options.shift) {
      angle = Math.round(angle / 15) * 15
    }
    return { ...box, angle }
  }

  // Resize grips work in the box's unrotated frame so a rotated box still
  // stretches along its own edges.
  const center = transformCenter(box)
  const radians = (-box.angle * Math.PI) / 180
  const localFrom = rotate(from, center, radians)
  const localTo = rotate(to, center, radians)
  const dx = localTo.x - localFrom.x
  const dy = localTo.y - localFrom.y

  let { x, y, width, height } = box
  const right = x + width
  const bottom = y + height
  if (handle.includes('w')) {
    x += dx
    width = right - x
  }
  if (handle.includes('e')) {
    width += dx
  }
  if (handle.includes('n')) {
    y += dy
    height = bottom - y
  }
  if (handle.includes('s')) {
    height += dy
  }

  const corner = handle.length === 2
  if (options.shift && corner && box.width !== 0 && box.height !== 0) {
    const ratio = Math.abs(box.width / box.height)
    const signW = Math.sign(width) || 1
    const signH = Math.sign(height) || 1
    const magnitude = Math.max(Math.abs(width), Math.abs(height) * ratio)
    const nextWidth = magnitude * signW
    const nextHeight = (magnitude / ratio) * signH
    if (handle.includes('w')) x = right - nextWidth
    if (handle.includes('n')) y = bottom - nextHeight
    width = nextWidth
    height = nextHeight
  }

  if (options.fromCenter) {
    const grownX = width - box.width
    const grownY = height - box.height
    x -= grownX / 2
    y -= grownY / 2
  }

  // A drag past the opposite edge mirrors the layer rather than inverting the box.
  let flipX = box.flipX
  let flipY = box.flipY
  if (width < 0) {
    x += width
    width = -width
    flipX = !flipX
  }
  if (height < 0) {
    y += height
    height = -height
    flipY = !flipY
  }
  return { ...box, x, y, width, height, flipX, flipY }
}

/**
 * Renders `source` into a document-sized canvas positioned, scaled, rotated and
 * mirrored by `box`. `source` is always the untouched original, so dragging the
 * handles never compounds resampling losses.
 */
export function applyTransform(source: HTMLCanvasElement, box: TransformBox, width: number, height: number) {
  const out = createCanvas(width, height)
  if (box.width === 0 || box.height === 0) {
    return out
  }
  const ctx = context2d(out)
  const center = transformCenter(box)
  ctx.save()
  ctx.translate(center.x, center.y)
  ctx.rotate((box.angle * Math.PI) / 180)
  ctx.scale(box.flipX ? -1 : 1, box.flipY ? -1 : 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, -box.width / 2, -box.height / 2, box.width, box.height)
  ctx.restore()
  return out
}

export function flipCanvas(source: HTMLCanvasElement, axis: 'x' | 'y') {
  const out = createCanvas(source.width, source.height)
  const ctx = context2d(out)
  ctx.translate(axis === 'x' ? source.width : 0, axis === 'y' ? source.height : 0)
  ctx.scale(axis === 'x' ? -1 : 1, axis === 'y' ? -1 : 1)
  ctx.drawImage(source, 0, 0)
  return out
}

/** Draws the transform box, its grips and the rotate stem over the viewport. */
export function drawTransformOverlay(ctx: CanvasRenderingContext2D, box: TransformBox, scale = 1) {
  const handles = transformHandles(box)
  const size = 4 / scale
  ctx.save()
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([5 / scale, 3 / scale])
  ctx.strokeStyle = '#38bdf8'
  ctx.beginPath()
  ctx.moveTo(handles.nw.x, handles.nw.y)
  ctx.lineTo(handles.ne.x, handles.ne.y)
  ctx.lineTo(handles.se.x, handles.se.y)
  ctx.lineTo(handles.sw.x, handles.sw.y)
  ctx.closePath()
  ctx.stroke()

  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(handles.n.x, handles.n.y)
  ctx.lineTo(handles.rotate.x, handles.rotate.y)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#0f172a'
  for (const key of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as TransformHandle[]) {
    const at = handles[key]
    ctx.beginPath()
    ctx.rect(at.x - size, at.y - size, size * 2, size * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(handles.rotate.x, handles.rotate.y, size, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}
