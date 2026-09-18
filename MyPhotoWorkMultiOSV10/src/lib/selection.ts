import { colorDistance } from './color'
import { context2d } from './canvas'
import type { Point, Selection } from './types'

export function emptyMask(width: number, height: number) {
  return new Uint8Array(width * height)
}

export function rectSelection(x: number, y: number, width: number, height: number): Selection {
  const left = Math.min(x, x + width)
  const top = Math.min(y, y + height)
  return { kind: 'rect', x: left, y: top, width: Math.abs(width), height: Math.abs(height) }
}

export function ellipseSelection(x: number, y: number, width: number, height: number): Selection {
  const box = rectSelection(x, y, width, height)
  return { ...box, kind: 'ellipse' }
}

export function selectionBounds(selection: Selection | null, fallback: { width: number; height: number }) {
  if (!selection) {
    return { x: 0, y: 0, width: fallback.width, height: fallback.height }
  }
  return {
    x: Math.floor(selection.x),
    y: Math.floor(selection.y),
    width: Math.max(1, Math.round(selection.width)),
    height: Math.max(1, Math.round(selection.height)),
  }
}

export function pointInSelection(selection: Selection | null, x: number, y: number, width: number, height: number) {
  if (!selection) {
    return true
  }
  const px = Math.floor(x)
  const py = Math.floor(y)
  if (px < 0 || py < 0 || px >= width || py >= height) {
    return false
  }
  if (selection.kind === 'mask' && selection.mask) {
    return selection.mask[py * width + px] > 0
  }
  if (px < selection.x || py < selection.y || px >= selection.x + selection.width || py >= selection.y + selection.height) {
    return false
  }
  if (selection.kind === 'ellipse') {
    const nx = (px - selection.x) / Math.max(1, selection.width) * 2 - 1
    const ny = (py - selection.y) / Math.max(1, selection.height) * 2 - 1
    return nx * nx + ny * ny <= 1
  }
  return true
}

export function selectionToMask(selection: Selection | null, width: number, height: number) {
  if (!selection) {
    return null
  }
  if (selection.kind === 'mask' && selection.mask) {
    return selection.mask
  }
  const mask = emptyMask(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pointInSelection(selection, x, y, width, height)) {
        mask[y * width + x] = 255
      }
    }
  }
  return mask
}

export function clipCanvasToSelection(source: HTMLCanvasElement, selection: Selection | null) {
  if (!selection) {
    return source
  }
  const mask = selectionToMask(selection, source.width, source.height)
  if (!mask) {
    return source
  }
  const ctx = context2d(source)
  const image = ctx.getImageData(0, 0, source.width, source.height)
  const data = image.data
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] === 0) {
      data[i * 4 + 3] = 0
    }
  }
  ctx.putImageData(image, 0, 0)
  return source
}

export function floodFillMask(data: Uint8ClampedArray, width: number, height: number, start: Point, tolerance: number) {
  const sx = Math.floor(start.x)
  const sy = Math.floor(start.y)
  const mask = emptyMask(width, height)
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
    return mask
  }
  const origin = (sy * width + sx) * 4
  const tr = data[origin]
  const tg = data[origin + 1]
  const tb = data[origin + 2]
  const ta = data[origin + 3]
  const stack = [sx, sy]
  while (stack.length) {
    const y = stack.pop() as number
    const x = stack.pop() as number
    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue
    }
    const index = y * width + x
    if (mask[index]) {
      continue
    }
    const i = index * 4
    if (colorDistance(data[i], data[i + 1], data[i + 2], data[i + 3], tr, tg, tb, ta) > tolerance) {
      continue
    }
    mask[index] = 255
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1)
  }
  return mask
}

export function maskBounds(mask: Uint8Array, width: number, height: number) {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function maskFromLasso(points: Point[], width: number, height: number): Selection {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = context2d(canvas)
  if (points.length < 2) {
    return { kind: 'mask', x: 0, y: 0, width, height, mask: emptyMask(width, height) }
  }
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y)
  }
  ctx.closePath()
  ctx.fill()
  const data = ctx.getImageData(0, 0, width, height).data
  const mask = emptyMask(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    if (data[i * 4 + 3] > 0) {
      mask[i] = 255
    }
  }
  const bounds = maskBounds(mask, width, height)
  return { kind: 'mask', ...bounds, mask }
}

export function paintBucket(canvas: HTMLCanvasElement, start: Point, color: { r: number; g: number; b: number }, tolerance: number, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const mask = floodFillMask(image.data, canvas.width, canvas.height, start, tolerance)
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) {
      continue
    }
    const x = i % canvas.width
    const y = Math.floor(i / canvas.width)
    if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) {
      continue
    }
    const p = i * 4
    image.data[p] = color.r
    image.data[p + 1] = color.g
    image.data[p + 2] = color.b
    image.data[p + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

export function wandSelection(canvas: HTMLCanvasElement, start: Point, tolerance: number): Selection {
  const data = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data
  const mask = floodFillMask(data, canvas.width, canvas.height, start, tolerance)
  const bounds = maskBounds(mask, canvas.width, canvas.height)
  return { kind: 'mask', ...bounds, mask }
}

export function drawSelectionOverlay(ctx: CanvasRenderingContext2D, selection: Selection | null, width: number, height: number, dashOffset: number) {
  if (!selection || selection.width <= 0 || selection.height <= 0) {
    return
  }
  ctx.save()
  ctx.fillStyle = 'rgba(80, 170, 255, 0.16)'
  if (selection.kind === 'mask' && selection.mask) {
    const overlay = document.createElement('canvas')
    overlay.width = width
    overlay.height = height
    const overlayCtx = overlay.getContext('2d')
    if (overlayCtx) {
      const image = overlayCtx.createImageData(width, height)
      for (let i = 0; i < selection.mask.length; i += 1) {
        if (selection.mask[i]) {
          image.data[i * 4] = 80
          image.data[i * 4 + 1] = 170
          image.data[i * 4 + 2] = 255
          image.data[i * 4 + 3] = 48
        }
      }
      overlayCtx.putImageData(image, 0, 0)
      ctx.drawImage(overlay, 0, 0)
    }
  } else if (selection.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(selection.x + selection.width / 2, selection.y + selection.height / 2, selection.width / 2, selection.height / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(selection.x, selection.y, selection.width, selection.height)
  }

  ctx.setLineDash([6, 4])
  ctx.lineDashOffset = -dashOffset
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1
  if (selection.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(selection.x + selection.width / 2, selection.y + selection.height / 2, selection.width / 2, selection.height / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else {
    ctx.strokeRect(selection.x + 0.5, selection.y + 0.5, Math.max(0, selection.width - 1), Math.max(0, selection.height - 1))
  }
  ctx.restore()
}

export function invertSelection(selection: Selection | null, width: number, height: number): Selection {
  // Inverting nothing selects everything, so this one starts from an empty
  // mask rather than the full-canvas one the Modify commands use.
  const mask = selectionToMask(selection, width, height) ?? emptyMask(width, height)
  const next = emptyMask(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    next[i] = mask[i] ? 0 : 255
  }
  return { kind: 'mask', x: 0, y: 0, width, height, mask: next }
}

export function featherSelection(selection: Selection | null, width: number, height: number, radius: number): Selection {
  const mask = selectionToMask(selection, width, height)
  if (!mask) {
    return { kind: 'rect', x: 0, y: 0, width, height }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    image.data[i * 4 + 3] = mask[i]
  }
  ctx.putImageData(image, 0, 0)
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(canvas, 0, 0)
  const out = ctx.getImageData(0, 0, width, height).data
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    next[i] = out[i * 4 + 3] > 16 ? 255 : 0
  }
  return { kind: 'mask', x: 0, y: 0, width, height, mask: next }
}

export function rowSelection(y: number, width: number): Selection {
  return { kind: 'rect', x: 0, y: Math.floor(y), width, height: 1 }
}

export function colSelection(x: number, height: number): Selection {
  return { kind: 'rect', x: Math.floor(x), y: 0, width: 1, height }
}

/* ------------------------------------------------------- modifying a selection */

function maskSelection(mask: Uint8Array, width: number, height: number): Selection {
  return { kind: 'mask', x: 0, y: 0, width, height, mask }
}

/**
 * The mask a modifier works on. No selection means the whole canvas — that is
 * what "nothing is selected" means everywhere else in the editor, and the
 * modifiers have to agree with it or Expand would quietly select nothing.
 */
function modifierMask(selection: Selection | null, width: number, height: number) {
  const mask = selectionToMask(selection, width, height)
  if (mask) {
    return mask
  }
  return new Uint8Array(width * height).fill(255)
}

/**
 * Distance from every pixel to the nearest one that is `inside` (or outside).
 *
 * A two-pass chamfer transform with 3-4 weights: close enough to a circle for
 * an edge a few pixels wide, and linear in the number of pixels, which a
 * per-pixel radius search is not.
 */
function distanceField(mask: Uint8Array, width: number, height: number, toward: 0 | 1) {
  const far = (width + height + 4) * 3
  const distance = new Float32Array(width * height)
  for (let i = 0; i < distance.length; i += 1) {
    const on = mask[i] ? 1 : 0
    distance[i] = on === toward ? 0 : far
  }
  // What lies beyond the canvas. Nothing is selected out there, so a selection
  // running off the edge is still treated as having an edge: Contract pulls it
  // in there too, rather than leaving a straight side untouched.
  const beyond = toward === 0 ? 0 : far
  const at = (x: number, y: number) => (
    x < 0 || y < 0 || x >= width || y >= height ? beyond : distance[y * width + x]
  )
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      distance[i] = Math.min(
        distance[i],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4,
      )
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x
      distance[i] = Math.min(
        distance[i],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4,
      )
    }
  }
  for (let i = 0; i < distance.length; i += 1) {
    distance[i] /= 3
  }
  return distance
}

/** Grows the selection outwards by `radius` pixels in every direction. */
export function expandSelection(selection: Selection | null, width: number, height: number, radius: number): Selection {
  const mask = modifierMask(selection, width, height)
  const distance = distanceField(mask, width, height, 1)
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    next[i] = distance[i] <= radius ? 255 : 0
  }
  return maskSelection(next, width, height)
}

/** Pulls the selection in by `radius` pixels, the mirror of expanding it. */
export function contractSelection(selection: Selection | null, width: number, height: number, radius: number): Selection {
  const mask = modifierMask(selection, width, height)
  const distance = distanceField(mask, width, height, 0)
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    next[i] = mask[i] && distance[i] > radius ? 255 : 0
  }
  return maskSelection(next, width, height)
}

/** Replaces the selection with a band of `width` pixels straddling its edge. */
export function borderSelection(selection: Selection | null, width: number, height: number, thickness: number): Selection {
  const mask = modifierMask(selection, width, height)
  const outward = distanceField(mask, width, height, 1)
  const inward = distanceField(mask, width, height, 0)
  const half = Math.max(0.5, thickness / 2)
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    const distance = mask[i] ? inward[i] : outward[i]
    next[i] = distance <= half ? 255 : 0
  }
  return maskSelection(next, width, height)
}

/**
 * Rounds off the selection: each pixel takes the majority vote of the square
 * around it, which fills pinholes and shaves off single-pixel spurs. The
 * running sum makes the window size free.
 */
export function smoothSelection(selection: Selection | null, width: number, height: number, radius: number): Selection {
  const mask = modifierMask(selection, width, height)
  const step = Math.max(1, Math.round(radius))
  // Summed-area table, one cell of padding so the corners need no special case.
  const sums = new Int32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y += 1) {
    let row = 0
    for (let x = 0; x < width; x += 1) {
      row += mask[y * width + x] ? 1 : 0
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row
    }
  }
  const area = (x0: number, y0: number, x1: number, y1: number) => (
    sums[(y1 + 1) * (width + 1) + x1 + 1] - sums[y0 * (width + 1) + x1 + 1]
    - sums[(y1 + 1) * (width + 1) + x0] + sums[y0 * (width + 1) + x0]
  )
  const next = emptyMask(width, height)
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - step)
    const y1 = Math.min(height - 1, y + step)
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - step)
      const x1 = Math.min(width - 1, x + step)
      const cells = (x1 - x0 + 1) * (y1 - y0 + 1)
      next[y * width + x] = area(x0, y0, x1, y1) * 2 > cells ? 255 : 0
    }
  }
  return maskSelection(next, width, height)
}

/* --------------------------------------------- selecting by what the pixels are */

/**
 * Extends the selection into the pixels touching it that look like the pixel
 * they touch. Region growing, so it only ever spreads through connected colour
 * — a second patch of the same blue elsewhere is left alone.
 */
export function growSelection(canvas: HTMLCanvasElement, selection: Selection | null, tolerance: number): Selection {
  const { width, height } = canvas
  const mask = modifierMask(selection, width, height)
  const next = Uint8Array.from(mask)
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const stack: number[] = []
  for (let i = 0; i < next.length; i += 1) {
    if (next[i]) stack.push(i)
  }
  while (stack.length) {
    const index = stack.pop() as number
    const x = index % width
    const y = (index - x) / width
    const from = index * 4
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ]
    for (const neighbour of neighbours) {
      if (neighbour < 0 || next[neighbour]) {
        continue
      }
      const to = neighbour * 4
      if (colorDistance(data[to], data[to + 1], data[to + 2], data[to + 3], data[from], data[from + 1], data[from + 2], data[from + 3]) > tolerance) {
        continue
      }
      next[neighbour] = 255
      stack.push(neighbour)
    }
  }
  return maskSelection(next, width, height)
}

/** Quantises a channel into the 32 buckets the colour-set tests work in. */
function bucket(value: number) {
  return Math.min(31, value >> 3)
}

/**
 * Selects every pixel anywhere in the image that looks like something already
 * selected — the same idea as Grow, without the requirement that it be next
 * door. The colours in the selection go into a coarse 32x32x32 cube which is
 * then widened by the tolerance, so the per-pixel test is one lookup.
 */
export function similarSelection(canvas: HTMLCanvasElement, selection: Selection | null, tolerance: number): Selection {
  const { width, height } = canvas
  const mask = selectionToMask(selection, width, height)
  if (!mask) {
    return { kind: 'rect', x: 0, y: 0, width, height }
  }
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const cube = new Uint8Array(32 * 32 * 32)
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue
    const p = i * 4
    cube[(bucket(data[p]) << 10) | (bucket(data[p + 1]) << 5) | bucket(data[p + 2])] = 1
  }
  const spread = Math.round(tolerance / 8)
  const widened = spread > 0 ? new Uint8Array(cube.length) : cube
  if (spread > 0) {
    for (let r = 0; r < 32; r += 1) {
      for (let g = 0; g < 32; g += 1) {
        for (let b = 0; b < 32; b += 1) {
          if (!cube[(r << 10) | (g << 5) | b]) continue
          for (let dr = -spread; dr <= spread; dr += 1) {
            const rr = r + dr
            if (rr < 0 || rr > 31) continue
            for (let dg = -spread; dg <= spread; dg += 1) {
              const gg = g + dg
              if (gg < 0 || gg > 31) continue
              for (let db = -spread; db <= spread; db += 1) {
                const bb = b + db
                if (bb < 0 || bb > 31) continue
                widened[(rr << 10) | (gg << 5) | bb] = 1
              }
            }
          }
        }
      }
    }
  }
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    const p = i * 4
    next[i] = widened[(bucket(data[p]) << 10) | (bucket(data[p + 1]) << 5) | bucket(data[p + 2])] ? 255 : 0
  }
  return maskSelection(next, width, height)
}

/** Selects every pixel within `tolerance` of one colour, wherever it is. */
export function colorRangeSelection(canvas: HTMLCanvasElement, color: { r: number; g: number; b: number }, tolerance: number): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const next = emptyMask(width, height)
  for (let i = 0; i < next.length; i += 1) {
    const p = i * 4
    const distance = Math.max(
      Math.abs(data[p] - color.r),
      Math.abs(data[p + 1] - color.g),
      Math.abs(data[p + 2] - color.b),
    )
    next[i] = data[p + 3] > 0 && distance <= tolerance ? 255 : 0
  }
  return maskSelection(next, width, height)
}
