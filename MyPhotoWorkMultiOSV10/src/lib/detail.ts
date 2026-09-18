import { clamp } from './color'
import { cloneCanvas, context2d } from './canvas'
import { gaussianBlur } from './filters'
import { pointInSelection } from './selection'
import type { Selection } from './types'

/**
 * The filters that look at the pixels around each pixel: sharpening that knows
 * what an edge is, the rank filters that clean a scan up, and the two shape
 * operators behind Minimum and Maximum.
 */

/** Every pixel in the window round (x, y), clipped to the canvas. */
function window(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number, channel: number, out: number[]) {
  let count = 0
  const y0 = Math.max(0, y - radius)
  const y1 = Math.min(height - 1, y + radius)
  const x0 = Math.max(0, x - radius)
  const x1 = Math.min(width - 1, x + radius)
  for (let wy = y0; wy <= y1; wy += 1) {
    for (let wx = x0; wx <= x1; wx += 1) {
      out[count] = data[(wy * width + wx) * 4 + channel]
      count += 1
    }
  }
  return count
}

/** Runs one rank filter — median, minimum or maximum — over the selection. */
function rankFilter(canvas: HTMLCanvasElement, radius: number, selection: Selection | null, pick: (values: number[], count: number) => number, threshold = 0) {
  const step = Math.max(1, Math.round(radius))
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const values: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const at = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const count = window(source, width, height, x, y, step, channel, values)
        const chosen = pick(values, count)
        // Dust and Scratches passes a threshold: below it the pixel is left
        // alone, which is what keeps real detail from being smeared away.
        image.data[at + channel] = Math.abs(chosen - source[at + channel]) > threshold ? chosen : source[at + channel]
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

function median(values: number[], count: number) {
  const slice = values.slice(0, count).sort((a, b) => a - b)
  return slice[count >> 1]
}

/** Replaces each pixel with the middle of its neighbours: kills speckle. */
export function medianFilter(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  rankFilter(canvas, radius, selection, median)
}

/** A median that only fires where the pixel is far enough from its neighbours. */
export function dustAndScratches(canvas: HTMLCanvasElement, radius: number, threshold: number, selection: Selection | null) {
  rankFilter(canvas, radius, selection, median, threshold)
}

/** Spreads the dark areas: erosion, and what a Minimum filter does. */
export function minimumFilter(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  rankFilter(canvas, radius, selection, (values, count) => {
    let lowest = 255
    for (let i = 0; i < count; i += 1) if (values[i] < lowest) lowest = values[i]
    return lowest
  })
}

/** Spreads the light areas — dilation, the mirror of Minimum. */
export function maximumFilter(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  rankFilter(canvas, radius, selection, (values, count) => {
    let highest = 0
    for (let i = 0; i < count; i += 1) if (values[i] > highest) highest = values[i]
    return highest
  })
}

/** A plain average of the window: softer-edged than a Gaussian, and cheaper. */
export function boxBlur(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  const step = Math.max(1, Math.round(radius))
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const values: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const at = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const count = window(source, width, height, x, y, step, channel, values)
        let sum = 0
        for (let i = 0; i < count; i += 1) sum += values[i]
        image.data[at + channel] = sum / count
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * Sharpening that can tell an edge from noise: the difference between the image
 * and a blurred copy of it is the detail, and only the detail above `threshold`
 * is added back. That threshold is the whole point — it is what lets a portrait
 * be sharpened without the skin turning to gravel.
 */
export function unsharpMask(canvas: HTMLCanvasElement, radius: number, amount: number, threshold: number, selection: Selection | null) {
  const blurred = cloneCanvas(canvas)
  gaussianBlur(blurred, radius, null)
  const soft = context2d(blurred).getImageData(0, 0, canvas.width, canvas.height).data
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const strength = amount / 100
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const at = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        const detail = image.data[at + channel] - soft[at + channel]
        if (Math.abs(detail) <= threshold) {
          continue
        }
        image.data[at + channel] = clamp(image.data[at + channel] + detail * strength, 0, 255)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * Breaks the image into flat polygons. Each pixel joins the nearest of a grid
 * of jittered cell centres and takes that cell's average colour, which is what
 * gives the crystal edges their irregular, non-square shape.
 */
export function crystallize(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  const cell = Math.max(2, Math.round(size))
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const columns = Math.ceil(width / cell) + 1
  const rows = Math.ceil(height / cell) + 1
  // One centre per grid cell, nudged off the lattice so the edges are not square.
  const centres: { x: number; y: number }[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      centres.push({
        x: column * cell + Math.random() * cell,
        y: row * cell + Math.random() * cell,
      })
    }
  }
  const sums = new Float64Array(centres.length * 5)
  const owner = new Int32Array(width * height)
  const nearest = (x: number, y: number) => {
    const column = Math.min(columns - 1, Math.floor(x / cell))
    const row = Math.min(rows - 1, Math.floor(y / cell))
    let best = -1
    let bestDistance = Infinity
    // Only the nine cells around the point can hold the closest centre.
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const c = column + dx
        const r = row + dy
        if (c < 0 || r < 0 || c >= columns || r >= rows) continue
        const index = r * columns + c
        const distance = (centres[index].x - x) ** 2 + (centres[index].y - y) ** 2
        if (distance < bestDistance) {
          bestDistance = distance
          best = index
        }
      }
    }
    return best
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = nearest(x, y)
      owner[y * width + x] = index
      const at = (y * width + x) * 4
      sums[index * 5] += source[at]
      sums[index * 5 + 1] += source[at + 1]
      sums[index * 5 + 2] += source[at + 2]
      sums[index * 5 + 3] += source[at + 3]
      sums[index * 5 + 4] += 1
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const index = owner[y * width + x]
      const count = sums[index * 5 + 4] || 1
      const at = (y * width + x) * 4
      image.data[at] = sums[index * 5] / count
      image.data[at + 1] = sums[index * 5 + 1] / count
      image.data[at + 2] = sums[index * 5 + 2] / count
      image.data[at + 3] = sums[index * 5 + 3] / count
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * A light source in the frame: the glow where it sits, and the ring of ghosts
 * a real lens throws along the line from it through the centre.
 */
export function lensFlare(canvas: HTMLCanvasElement, x: number, y: number, brightness: number) {
  const ctx = context2d(canvas)
  const { width, height } = canvas
  const reach = Math.min(width, height) * 0.45
  const strength = clamp(brightness, 0, 200) / 100

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'

  const glow = ctx.createRadialGradient(x, y, 0, x, y, reach)
  glow.addColorStop(0, `rgba(255, 255, 240, ${0.9 * strength})`)
  glow.addColorStop(0.25, `rgba(255, 220, 160, ${0.35 * strength})`)
  glow.addColorStop(1, 'rgba(255, 200, 120, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  // Streaks, then the ghosts stepping back through the centre of the frame.
  ctx.strokeStyle = `rgba(255, 240, 210, ${0.25 * strength})`
  ctx.lineWidth = 2
  for (const angle of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
    ctx.beginPath()
    ctx.moveTo(x - Math.cos(angle) * reach, y - Math.sin(angle) * reach)
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach)
    ctx.stroke()
  }

  const cx = width / 2
  const cy = height / 2
  const ghosts = [
    { at: 0.35, size: 0.10, color: `rgba(140, 255, 190, ${0.22 * strength})` },
    { at: 0.7, size: 0.06, color: `rgba(160, 190, 255, ${0.26 * strength})` },
    { at: 1.25, size: 0.13, color: `rgba(255, 170, 150, ${0.18 * strength})` },
    { at: 1.7, size: 0.05, color: `rgba(255, 240, 160, ${0.24 * strength})` },
  ]
  for (const ghost of ghosts) {
    const gx = x + (cx - x) * 2 * ghost.at
    const gy = y + (cy - y) * 2 * ghost.at
    const radius = reach * ghost.size
    const disc = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius)
    disc.addColorStop(0, ghost.color)
    disc.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = disc
    ctx.beginPath()
    ctx.arc(gx, gy, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
