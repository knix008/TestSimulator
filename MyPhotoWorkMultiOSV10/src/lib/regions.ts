import { clamp } from './color'
import { context2d, createCanvas } from './canvas'
import { selectionToMask } from './selection'
import type { FrameRect, Measure, Point, Selection, SliceRect } from './types'
import { createId } from './canvas'

/* ------------------------------------------------------------------ edges */

/** Sobel gradient magnitude at one pixel, used by the magnetic lasso. */
export function edgeStrength(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
    return 0
  }
  const luma = (px: number, py: number) => {
    const i = (py * width + px) * 4
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const gx =
    -luma(x - 1, y - 1) - 2 * luma(x - 1, y) - luma(x - 1, y + 1) +
    luma(x + 1, y - 1) + 2 * luma(x + 1, y) + luma(x + 1, y + 1)
  const gy =
    -luma(x - 1, y - 1) - 2 * luma(x, y - 1) - luma(x + 1, y - 1) +
    luma(x - 1, y + 1) + 2 * luma(x, y + 1) + luma(x + 1, y + 1)
  return Math.hypot(gx, gy)
}

/**
 * Snaps a cursor position onto the strongest nearby edge, which is how the
 * magnetic lasso clings to an object's outline. Ties break toward the cursor.
 */
export function snapToEdge(canvas: HTMLCanvasElement, point: Point, radius: number): Point {
  const width = canvas.width
  const height = canvas.height
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const cx = Math.round(point.x)
  const cy = Math.round(point.y)
  const reach = Math.max(1, Math.round(radius))
  let bestX = clamp(cx, 0, width - 1)
  let bestY = clamp(cy, 0, height - 1)
  let bestScore = -Infinity
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      const distance = Math.hypot(x - cx, y - cy)
      if (distance > reach) continue
      // Penalise distance so a weak edge under the cursor beats a strong one far away.
      const score = edgeStrength(data, width, height, x, y) - distance * 6
      if (score > bestScore) {
        bestScore = score
        bestX = x
        bestY = y
      }
    }
  }
  return { x: bestX, y: bestY }
}

/* ------------------------------------------------------------------- patch */

/** Pixels just outside the mask — the seam the graft has to blend into. */
function maskRing(mask: Uint8Array, width: number, height: number, band: number) {
  const ring: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) continue
      let touches = false
      for (let oy = -band; oy <= band && !touches; oy += 1) {
        for (let ox = -band; ox <= band; ox += 1) {
          const xx = x + ox
          const yy = y + oy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          if (mask[yy * width + xx]) {
            touches = true
            break
          }
        }
      }
      if (touches) ring.push(y * width + x)
    }
  }
  return ring
}

/**
 * The patch tool: replaces the selected pixels with the ones `dx, dy` away.
 *
 * The graft is colour-corrected by comparing the ring of pixels *around* the
 * selection with the matching ring around the source, so it picks up the
 * destination's lighting. Comparing against the selection's own interior would
 * just average the blemish straight back in.
 */
export function patchSelection(canvas: HTMLCanvasElement, selection: Selection | null, dx: number, dy: number) {
  const mask = selectionToMask(selection, canvas.width, canvas.height)
  if (!mask || (dx === 0 && dy === 0)) {
    return
  }
  const width = canvas.width
  const height = canvas.height
  const shiftX = Math.round(dx)
  const shiftY = Math.round(dy)
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, width, height)
  const source = new Uint8ClampedArray(image.data)

  let destR = 0, destG = 0, destB = 0
  let srcR = 0, srcG = 0, srcB = 0
  let count = 0
  for (const index of maskRing(mask, width, height, 3)) {
    const x = index % width
    const y = Math.floor(index / width)
    const sx = clamp(x + shiftX, 0, width - 1)
    const sy = clamp(y + shiftY, 0, height - 1)
    const d = index * 4
    const s = (sy * width + sx) * 4
    destR += source[d]; destG += source[d + 1]; destB += source[d + 2]
    srcR += source[s]; srcG += source[s + 1]; srcB += source[s + 2]
    count += 1
  }
  const shiftR = count ? (destR - srcR) / count : 0
  const shiftG = count ? (destG - srcG) / count : 0
  const shiftB = count ? (destB - srcB) / count : 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      const i = (y * width + x) * 4
      const sx = clamp(x + shiftX, 0, width - 1)
      const sy = clamp(y + shiftY, 0, height - 1)
      const s = (sy * width + sx) * 4
      image.data[i] = clamp(source[s] + shiftR, 0, 255)
      image.data[i + 1] = clamp(source[s + 1] + shiftG, 0, 255)
      image.data[i + 2] = clamp(source[s + 2] + shiftB, 0, 255)
      image.data[i + 3] = source[s + 3]
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Content-aware move: lifts the selection and drops it at an offset, healing the hole. */
export function contentMove(canvas: HTMLCanvasElement, selection: Selection | null, dx: number, dy: number) {
  const mask = selectionToMask(selection, canvas.width, canvas.height)
  if (!mask || (dx === 0 && dy === 0)) {
    return
  }
  const width = canvas.width
  const height = canvas.height
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, width, height)
  const source = new Uint8ClampedArray(image.data)

  // Fill the vacated area from its surroundings first.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let oy = -5; oy <= 5; oy += 1) {
        for (let ox = -5; ox <= 5; ox += 1) {
          const xx = clamp(x + ox, 0, width - 1)
          const yy = clamp(y + oy, 0, height - 1)
          if (mask[yy * width + xx]) continue
          const j = (yy * width + xx) * 4
          r += source[j]; g += source[j + 1]; b += source[j + 2]; a += source[j + 3]; n += 1
        }
      }
      const i = (y * width + x) * 4
      if (n) {
        image.data[i] = r / n
        image.data[i + 1] = g / n
        image.data[i + 2] = b / n
        image.data[i + 3] = a / n
      }
    }
  }
  // Then stamp the lifted pixels down at the new position.
  const shiftX = Math.round(dx)
  const shiftY = Math.round(dy)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      const tx = x + shiftX
      const ty = y + shiftY
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
      const from = (y * width + x) * 4
      const to = (ty * width + tx) * 4
      image.data[to] = source[from]
      image.data[to + 1] = source[from + 1]
      image.data[to + 2] = source[from + 2]
      image.data[to + 3] = source[from + 3]
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* -------------------------------------------------------- perspective crop */

/**
 * Warps the quadrilateral `corners` (clockwise from top-left) onto a straight
 * `width` x `height` image, one output row at a time. Straightens a photographed
 * page or a building facade.
 */
export function perspectiveCrop(source: HTMLCanvasElement, corners: Point[], width: number, height: number) {
  const out = createCanvas(width, height)
  if (corners.length !== 4 || width < 1 || height < 1) {
    return out
  }
  const ctx = context2d(out)
  const image = ctx.createImageData(width, height)
  const src = context2d(source).getImageData(0, 0, source.width, source.height).data
  const [tl, tr, br, bl] = corners

  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1)
    const leftX = tl.x + (bl.x - tl.x) * v
    const leftY = tl.y + (bl.y - tl.y) * v
    const rightX = tr.x + (br.x - tr.x) * v
    const rightY = tr.y + (br.y - tr.y) * v
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1)
      const sx = Math.round(leftX + (rightX - leftX) * u)
      const sy = Math.round(leftY + (rightY - leftY) * u)
      const i = (y * width + x) * 4
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) {
        continue
      }
      const s = (sy * source.width + sx) * 4
      image.data[i] = src[s]
      image.data[i + 1] = src[s + 1]
      image.data[i + 2] = src[s + 2]
      image.data[i + 3] = src[s + 3]
    }
  }
  ctx.putImageData(image, 0, 0)
  return out
}

/** The straightened size a quad should map to: the average of its opposite edges. */
export function perspectiveSize(corners: Point[]) {
  if (corners.length !== 4) {
    return { width: 1, height: 1 }
  }
  const [tl, tr, br, bl] = corners
  const width = Math.round((Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2)
  const height = Math.round((Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2)
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

/* -------------------------------------------------------- slices & frames */

function normalize(x: number, y: number, width: number, height: number) {
  return {
    x: Math.round(Math.min(x, x + width)),
    y: Math.round(Math.min(y, y + height)),
    width: Math.round(Math.abs(width)),
    height: Math.round(Math.abs(height)),
  }
}

export function createSlice(name: string, x: number, y: number, width: number, height: number): SliceRect {
  return { id: createId('slice'), name, ...normalize(x, y, width, height) }
}

export function createFrame(name: string, x: number, y: number, width: number, height: number): FrameRect {
  return { id: createId('frame'), name, ...normalize(x, y, width, height) }
}

export function rectAt<T extends { x: number; y: number; width: number; height: number }>(items: T[], point: Point): T | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (point.x >= item.x && point.y >= item.y && point.x < item.x + item.width && point.y < item.y + item.height) {
      return item
    }
  }
  return null
}

/** Cuts one slice out of the flattened document, ready to export. */
export function cropToRect(source: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }) {
  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))
  const out = createCanvas(width, height)
  context2d(out).drawImage(source, Math.round(rect.x), Math.round(rect.y), width, height, 0, 0, width, height)
  return out
}

/** Frames behave like a mask: the layer shows only inside the frame rectangle. */
export function clipToFrame(source: HTMLCanvasElement, rect: FrameRect) {
  const out = createCanvas(source.width, source.height)
  const ctx = context2d(out)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  ctx.drawImage(source, 0, 0)
  ctx.restore()
  return out
}

/* -------------------------------------------------------------- ruler tool */

export function measureInfo(measure: Measure) {
  const dx = measure.x2 - measure.x1
  const dy = measure.y2 - measure.y1
  // Screen coordinates grow downward, so negate to report a maths-style angle.
  // `+ 0` folds the negative zero atan2 returns for a flat measure, which would
  // otherwise show up as "-0" in the info panel.
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI + 0
  return { dx, dy, distance: Math.hypot(dx, dy), angle: angle === 0 ? 0 : angle }
}

export function drawRegionOverlay(
  ctx: CanvasRenderingContext2D,
  slices: SliceRect[],
  frames: FrameRect[],
  measure: Measure | null,
  scale = 1,
) {
  ctx.save()
  ctx.lineWidth = 1 / scale
  for (const slice of slices) {
    ctx.setLineDash([4 / scale, 3 / scale])
    ctx.strokeStyle = '#fbbf24'
    ctx.strokeRect(slice.x + 0.5 / scale, slice.y + 0.5 / scale, slice.width, slice.height)
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(251, 191, 36, 0.10)'
    ctx.fillRect(slice.x, slice.y, slice.width, slice.height)
  }
  for (const frame of frames) {
    ctx.setLineDash([])
    ctx.strokeStyle = '#a78bfa'
    ctx.strokeRect(frame.x + 0.5 / scale, frame.y + 0.5 / scale, frame.width, frame.height)
    ctx.beginPath()
    ctx.moveTo(frame.x, frame.y)
    ctx.lineTo(frame.x + frame.width, frame.y + frame.height)
    ctx.moveTo(frame.x + frame.width, frame.y)
    ctx.lineTo(frame.x, frame.y + frame.height)
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)'
    ctx.stroke()
  }
  if (measure) {
    ctx.setLineDash([])
    ctx.strokeStyle = '#34d399'
    ctx.beginPath()
    ctx.moveTo(measure.x1, measure.y1)
    ctx.lineTo(measure.x2, measure.y2)
    ctx.stroke()
    const tick = 4 / scale
    for (const [x, y] of [[measure.x1, measure.y1], [measure.x2, measure.y2]]) {
      ctx.beginPath()
      ctx.moveTo(x - tick, y)
      ctx.lineTo(x + tick, y)
      ctx.moveTo(x, y - tick)
      ctx.lineTo(x, y + tick)
      ctx.stroke()
    }
  }
  ctx.restore()
}
