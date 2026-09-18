import { context2d, createCanvas } from './canvas'
import type { Point, TextWarpStyle } from './types'

/**
 * Bending pixels: the four-corner transforms behind Skew, Distort and
 * Perspective, the preset shapes behind Warp, the pin-driven deformation behind
 * Puppet Warp, and the seam carving behind Content-Aware Scale.
 *
 * Everything here reads the source and writes a new canvas; nothing is done in
 * place, so a transform can be previewed and thrown away.
 */

/* ------------------------------------------------------------- sampling */

function sample(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Uint8ClampedArray, at: number) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) {
    out[at] = 0
    out[at + 1] = 0
    out[at + 2] = 0
    out[at + 3] = 0
    return
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const corners = [
    (y0 * width + x0) * 4,
    (y0 * width + x1) * 4,
    (y1 * width + x0) * 4,
    (y1 * width + x1) * 4,
  ]
  const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
  for (let channel = 0; channel < 4; channel += 1) {
    let sum = 0
    for (let corner = 0; corner < 4; corner += 1) {
      sum += data[corners[corner] + channel] * weights[corner]
    }
    out[at + channel] = sum
  }
}

/** Runs a backward mapping: for each destination pixel, where it comes from. */
function backwardMap(source: HTMLCanvasElement, width: number, height: number, from: (x: number, y: number) => Point | null) {
  const data = context2d(source).getImageData(0, 0, source.width, source.height).data
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4
      const point = from(x + 0.5, y + 0.5)
      if (!point) {
        continue
      }
      sample(data, source.width, source.height, point.x - 0.5, point.y - 0.5, image.data, at)
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/* ------------------------------------------------- four-corner transforms */

/**
 * The projective transform that takes the source rectangle to four arbitrary
 * corners. Skew and Distort are the same maths with the corners constrained,
 * so all three menu commands come through here.
 *
 * Solves the eight unknowns of the homography directly, the standard way: each
 * corner gives two linear equations, and Gaussian elimination does the rest.
 */
export function homography(width: number, height: number, corners: Point[]) {
  const source: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i += 1) {
    const s = source[i]
    const d = corners[i]
    a.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x])
    b.push(d.x)
    a.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y])
    b.push(d.y)
  }
  const solved = solve(a, b)
  if (!solved) {
    return null
  }
  const [m0, m1, m2, m3, m4, m5, m6, m7] = solved
  return [m0, m1, m2, m3, m4, m5, m6, m7, 1]
}

/** Gaussian elimination with partial pivoting; null when the system is singular. */
function solve(a: number[][], b: number[]) {
  const n = b.length
  const matrix = a.map((row, i) => [...row, b[i]])
  for (let column = 0; column < n; column += 1) {
    let pivot = column
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
    }
    if (Math.abs(matrix[pivot][column]) < 1e-9) {
      return null
    }
    const swap = matrix[column]
    matrix[column] = matrix[pivot]
    matrix[pivot] = swap
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue
      const factor = matrix[row][column] / matrix[column][column]
      for (let k = column; k <= n; k += 1) {
        matrix[row][k] -= factor * matrix[column][k]
      }
    }
  }
  return matrix.map((row, i) => row[n] / row[i])
}

function invert3(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) {
    return null
  }
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]
}

/** Redraws the image so its corners land on `corners`. */
export function cornerTransform(source: HTMLCanvasElement, corners: Point[], width = source.width, height = source.height) {
  const forward = homography(source.width, source.height, corners)
  const inverse = forward ? invert3(forward) : null
  if (!inverse) {
    return source
  }
  return backwardMap(source, width, height, (x, y) => {
    const w = inverse[6] * x + inverse[7] * y + inverse[8]
    if (Math.abs(w) < 1e-9) return null
    return {
      x: (inverse[0] * x + inverse[1] * y + inverse[2]) / w,
      y: (inverse[3] * x + inverse[4] * y + inverse[5]) / w,
    }
  })
}

/** Slides the top and bottom (or the sides) past each other. */
export function skew(source: HTMLCanvasElement, horizontal: number, vertical: number) {
  const { width, height } = source
  return cornerTransform(source, [
    { x: horizontal, y: 0 },
    { x: width + horizontal, y: vertical },
    { x: width, y: height + vertical },
    { x: 0, y: height },
  ])
}

/** Narrows one edge, the way a building leans away from the camera. */
export function perspective(source: HTMLCanvasElement, amount: number) {
  const { width, height } = source
  const inset = (width * Math.abs(amount)) / 200
  const top = amount >= 0 ? inset : 0
  const bottom = amount >= 0 ? 0 : inset
  return cornerTransform(source, [
    { x: top, y: 0 },
    { x: width - top, y: 0 },
    { x: width - bottom, y: height },
    { x: bottom, y: height },
  ])
}

/* ------------------------------------------------------------ warp shapes */

/**
 * Where a point of the image ends up under one of the warp shapes.
 *
 * `u` and `v` run 0..1 across the image. The same function drives the layer
 * Warp command and the text warp, which is why the two look identical.
 */
export function warpPoint(style: TextWarpStyle, bend: number, horizontal: number, vertical: number, u: number, v: number): Point {
  const b = bend / 100
  const h = horizontal / 100
  const w = vertical / 100
  // Centred coordinates make the symmetric shapes fall out naturally.
  const cu = u - 0.5
  const cv = v - 0.5
  let x = u
  let y = v
  switch (style) {
    case 'arc':
      y = v + b * 0.5 * (1 - 4 * cu * cu) * (1 - v)
      break
    case 'arcLower':
      y = v + b * 0.5 * (1 - 4 * cu * cu) * v
      break
    case 'arcUpper':
      y = v - b * 0.5 * (1 - 4 * cu * cu) * (1 - v)
      break
    case 'arch':
      y = v + b * 0.5 * (1 - 4 * cu * cu)
      break
    case 'bulge':
      x = 0.5 + cu * (1 + b * 0.6 * (1 - 4 * cv * cv))
      y = 0.5 + cv * (1 + b * 0.6 * (1 - 4 * cu * cu))
      break
    case 'flag':
      y = v + b * 0.25 * Math.sin(u * Math.PI * 2)
      break
    case 'wave':
      y = v + b * 0.25 * Math.sin(u * Math.PI * 2)
      x = u + b * 0.1 * Math.sin(v * Math.PI * 2)
      break
    case 'fish':
      // Pinches the middle in and pushes the ends out.
      x = 0.5 + cu * (1 - b * 0.5 * (1 - 4 * cv * cv))
      break
    case 'rise':
      y = v + b * 0.4 * u
      break
    case 'squeeze':
      y = 0.5 + cv * (1 - b * 0.6 * (1 - 4 * cu * cu))
      break
    default:
      break
  }
  // The two extra sliders lean the whole shape over.
  x += h * 0.3 * (v - 0.5)
  y += w * 0.3 * (u - 0.5)
  return { x, y }
}

/**
 * Applies a warp shape to a canvas.
 *
 * The shapes are defined forwards — where a source point goes — so the inverse
 * is found by walking a coarse grid of forward samples and searching the few
 * cells near the destination point. That is far simpler than inverting each
 * shape by hand, and at this grid density the error is well under a pixel.
 */
export function warpCanvas(source: HTMLCanvasElement, style: TextWarpStyle, bend: number, horizontal: number, vertical: number) {
  if (style === 'none' || (!bend && !horizontal && !vertical)) {
    return source
  }
  const { width, height } = source
  const steps = 24
  // Forward positions of a grid of source points, in destination pixels.
  const grid: Point[][] = []
  for (let row = 0; row <= steps; row += 1) {
    const line: Point[] = []
    for (let column = 0; column <= steps; column += 1) {
      const warped = warpPoint(style, bend, horizontal, vertical, column / steps, row / steps)
      line.push({ x: warped.x * width, y: warped.y * height })
    }
    grid.push(line)
  }
  return meshWarp(source, grid, width, height)
}

/* --------------------------------------------------------------- mesh warp */

/**
 * Draws the source through a grid of destination points: cell by cell, each
 * split into two triangles that are drawn with their own affine transform.
 * Going forwards like this needs no inverse and leaves no gaps, because the
 * triangles tile the destination exactly.
 */
export function meshWarp(source: HTMLCanvasElement, grid: Point[][], width: number, height: number) {
  const rows = grid.length - 1
  const columns = grid[0].length - 1
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const cellWidth = source.width / columns
  const cellHeight = source.height / rows

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sourceCorners: Point[] = [
        { x: column * cellWidth, y: row * cellHeight },
        { x: (column + 1) * cellWidth, y: row * cellHeight },
        { x: (column + 1) * cellWidth, y: (row + 1) * cellHeight },
        { x: column * cellWidth, y: (row + 1) * cellHeight },
      ]
      const destination = [
        grid[row][column],
        grid[row][column + 1],
        grid[row + 1][column + 1],
        grid[row + 1][column],
      ]
      drawTriangle(ctx, source, [sourceCorners[0], sourceCorners[1], sourceCorners[2]], [destination[0], destination[1], destination[2]])
      drawTriangle(ctx, source, [sourceCorners[0], sourceCorners[2], sourceCorners[3]], [destination[0], destination[2], destination[3]])
    }
  }
  return canvas
}

/**
 * Pushes a triangle's corners out from its middle.
 *
 * Neighbouring triangles share an edge, and a clip is antialiased, so drawing
 * them exactly abutting leaves a hairline of half-covered pixels along every
 * shared edge. Overlapping them by under a pixel hides the seam without moving
 * the picture: the affine map still comes from the true corners.
 */
function inflate(points: Point[], by: number) {
  const cx = (points[0].x + points[1].x + points[2].x) / 3
  const cy = (points[0].y + points[1].y + points[2].y) / 3
  return points.map((point) => {
    const dx = point.x - cx
    const dy = point.y - cy
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + (dx / length) * by, y: point.y + (dy / length) * by }
  })
}

/** One triangle of the mesh, clipped and drawn under its own affine map. */
function drawTriangle(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, from: Point[], to: Point[]) {
  const [s0, s1, s2] = from
  const [d0, d1, d2] = to
  const [c0, c1, c2] = inflate(to, 0.75)
  const denominator = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y)
  if (Math.abs(denominator) < 1e-9) {
    return
  }
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denominator
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denominator
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denominator
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denominator
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(c0.x, c0.y)
  ctx.lineTo(c1.x, c1.y)
  ctx.lineTo(c2.x, c2.y)
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, d0.x - a * s0.x - c * s0.y, d0.y - b * s0.x - d * s0.y)
  ctx.drawImage(source, 0, 0)
  ctx.restore()
}

/* ------------------------------------------------------------ puppet warp */

export type Pin = { from: Point; to: Point }

/**
 * Moves the image as if it were pinned to a board: each pin drags the pixels
 * around it, and the pull falls off with distance, so pins far away hold their
 * part of the picture still.
 */
export function puppetWarp(source: HTMLCanvasElement, pins: Pin[], stiffness = 1) {
  const moving = pins.filter((pin) => pin.from.x !== pin.to.x || pin.from.y !== pin.to.y)
  if (!pins.length || !moving.length) {
    return source
  }
  const { width, height } = source
  const steps = 24
  const grid: Point[][] = []
  for (let row = 0; row <= steps; row += 1) {
    const line: Point[] = []
    for (let column = 0; column <= steps; column += 1) {
      const x = (column / steps) * width
      const y = (row / steps) * height
      let weightSum = 0
      let dx = 0
      let dy = 0
      for (const pin of pins) {
        const distance = Math.hypot(x - pin.from.x, y - pin.from.y)
        // Inverse distance, softened so a pin does not tear the mesh at zero.
        const weight = 1 / (Math.pow(distance + 1, 2 * stiffness))
        weightSum += weight
        dx += (pin.to.x - pin.from.x) * weight
        dy += (pin.to.y - pin.from.y) * weight
      }
      line.push(weightSum > 0 ? { x: x + dx / weightSum, y: y + dy / weightSum } : { x, y })
    }
    grid.push(line)
  }
  return meshWarp(source, grid, width, height)
}

/* ------------------------------------------------- content-aware scale */

/** How much each pixel differs from its neighbours: the busy parts to protect. */
function energyMap(data: Uint8ClampedArray, width: number, height: number) {
  const energy = new Float32Array(width * height)
  const at = (x: number, y: number) => {
    const i = (Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))) * 4
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      energy[y * width + x] = Math.abs(at(x - 1, y) - at(x + 1, y)) + Math.abs(at(x, y - 1) - at(x, y + 1))
    }
  }
  return energy
}

/** The cheapest top-to-bottom path through the energy map: one seam. */
function lowestSeam(energy: Float32Array, width: number, height: number) {
  const cost = Float32Array.from(energy)
  const came = new Int8Array(width * height)
  for (let y = 1; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = cost[(y - 1) * width + x]
      let direction = 0
      if (x > 0 && cost[(y - 1) * width + x - 1] < best) {
        best = cost[(y - 1) * width + x - 1]
        direction = -1
      }
      if (x + 1 < width && cost[(y - 1) * width + x + 1] < best) {
        best = cost[(y - 1) * width + x + 1]
        direction = 1
      }
      cost[y * width + x] += best
      came[y * width + x] = direction
    }
  }
  let end = 0
  for (let x = 1; x < width; x += 1) {
    if (cost[(height - 1) * width + x] < cost[(height - 1) * width + end]) end = x
  }
  const seam = new Int32Array(height)
  let x = end
  for (let y = height - 1; y >= 0; y -= 1) {
    seam[y] = x
    x -= came[y * width + x]
    x = Math.min(width - 1, Math.max(0, x))
  }
  return seam
}

/**
 * Narrows the image by removing the least interesting column of pixels over
 * and over, so the subject keeps its shape while the empty parts give way.
 * Widening repeats the cheapest seams instead.
 */
export function contentAwareScale(source: HTMLCanvasElement, targetWidth: number, targetHeight: number) {
  return contentAwareScaleLayers([source], source, targetWidth, targetHeight)[0]
}

/**
 * The same carving applied to a whole stack of layers at once.
 *
 * The seams are chosen from `energy` — normally the flattened document — and
 * then taken out of every layer, so the layers stay lined up with each other.
 * Carving each one on its own would tear the composite apart.
 */
export function contentAwareScaleLayers(sources: HTMLCanvasElement[], energy: HTMLCanvasElement, targetWidth: number, targetHeight: number) {
  const wide = Math.max(1, Math.round(targetWidth))
  const tall = Math.max(1, Math.round(targetHeight))
  let layers = sources
  let guide = energy
  if (wide !== guide.width) {
    const carved = carveAll(layers, guide, wide)
    layers = carved.layers
    guide = carved.guide
  }
  if (tall !== guide.height) {
    // Height is the same problem turned on its side.
    const turned = carveAll(layers.map((layer) => rotateQuarter(layer, 1)), rotateQuarter(guide, 1), tall)
    layers = turned.layers.map((layer) => rotateQuarter(layer, -1))
  }
  return layers
}

function carveAll(sources: HTMLCanvasElement[], energy: HTMLCanvasElement, targetWidth: number) {
  const height = energy.height
  let width = energy.width
  let guideData = context2d(energy).getImageData(0, 0, width, height).data
  let datas = sources.map((layer) => context2d(layer).getImageData(0, 0, width, height).data)
  const shrinking = targetWidth < width
  const steps = Math.abs(targetWidth - width)
  for (let step = 0; step < steps; step += 1) {
    const seam = lowestSeam(energyMap(guideData, width, height), width, height)
    const nextWidth = shrinking ? width - 1 : width + 1
    datas = datas.map((data) => applySeam(data, width, height, nextWidth, seam, shrinking))
    guideData = applySeam(guideData, width, height, nextWidth, seam, shrinking)
    width = nextWidth
  }
  return {
    layers: datas.map((data) => canvasFromData(data, width, height)),
    guide: canvasFromData(guideData, width, height),
  }
}

/** Removes the seam from every row, or duplicates it when widening. */
function applySeam(data: Uint8ClampedArray, width: number, height: number, nextWidth: number, seam: Int32Array, shrinking: boolean) {
  const next = new Uint8ClampedArray(nextWidth * height * 4)
  for (let y = 0; y < height; y += 1) {
    let write = 0
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4
      if (shrinking && x === seam[y]) {
        continue
      }
      const to = (y * nextWidth + write) * 4
      next[to] = data[from]
      next[to + 1] = data[from + 1]
      next[to + 2] = data[from + 2]
      next[to + 3] = data[from + 3]
      write += 1
      if (!shrinking && x === seam[y]) {
        // Widening repeats the cheapest seam, which is far less visible than
        // stretching the whole picture.
        const twin = (y * nextWidth + write) * 4
        next[twin] = data[from]
        next[twin + 1] = data[from + 1]
        next[twin + 2] = data[from + 2]
        next[twin + 3] = data[from + 3]
        write += 1
      }
    }
  }
  return next
}

function canvasFromData(data: Uint8ClampedArray, width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  image.data.set(data)
  ctx.putImageData(image, 0, 0)
  return canvas
}

function rotateQuarter(source: HTMLCanvasElement, direction: 1 | -1) {
  const canvas = createCanvas(source.height, source.width)
  const ctx = context2d(canvas)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((direction * Math.PI) / 2)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}
