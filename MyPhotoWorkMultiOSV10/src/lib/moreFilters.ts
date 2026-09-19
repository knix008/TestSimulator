import { clamp, hexToRgb, hslToRgb, rgbToHsl } from './color'
import { cloneCanvas, context2d, createCanvas } from './canvas'
import { gaussianBlur, mosaic } from './filters'
import { crystallize, medianFilter } from './detail'
import { pointInSelection } from './selection'
import type { Selection } from './types'

/**
 * The rest of the Filter menu: the blurs Photoshop keeps in its Blur Gallery,
 * the distortions and pixelations the first release did not have, Lens
 * Correction, the Video and Other groups, and every effect in the Filter
 * Gallery's Artistic, Brush Strokes, Sketch and Texture folders.
 *
 * They are composed from a small kit — a source copy, a blurred copy, an edge
 * map, a luminance read, a backward remap — because that is what the effects
 * themselves are made of. Each takes the whole canvas and a selection, like
 * every other filter here, so the smart-filter stack and the gallery can run
 * any of them the same way.
 */

export type FilterParams = {
  radius: number
  amount: number
  /** A second free parameter some filters read (threshold, angle, levels). */
  extra?: number
  foreground?: string
  background?: string
}

/* ------------------------------------------------------------------- kit */

function read(canvas: HTMLCanvasElement) {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
}

function write(canvas: HTMLCanvasElement, image: ImageData) {
  context2d(canvas).putImageData(image, 0, 0)
}

function luma(data: Uint8ClampedArray, i: number) {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}

/** A blurred copy of the pixels, without touching the canvas. */
function blurredData(canvas: HTMLCanvasElement, radius: number) {
  const copy = cloneCanvas(canvas)
  gaussianBlur(copy, radius, null)
  return read(copy).data
}

/** Per-pixel work with a pristine source copy in hand. */
function mapSource(
  canvas: HTMLCanvasElement,
  selection: Selection | null,
  fn: (src: Uint8ClampedArray, out: Uint8ClampedArray, i: number, x: number, y: number, w: number, h: number) => void,
) {
  const image = read(canvas)
  const src = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      fn(src, image.data, (y * width + x) * 4, x, y, width, height)
    }
  }
  write(canvas, image)
}

/** Backward mapping with bilinear sampling; out-of-range reads clamp to the edge. */
function remap(canvas: HTMLCanvasElement, selection: Selection | null, fn: (x: number, y: number) => { x: number; y: number }, wrap = false) {
  const image = read(canvas)
  const src = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const at = (v: number, size: number) => (wrap ? ((v % size) + size) % size : clamp(v, 0, size - 1))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const from = fn(x, y)
      const sx = at(from.x, width)
      const sy = at(from.y, height)
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = wrap ? (x0 + 1) % width : Math.min(width - 1, x0 + 1)
      const y1 = wrap ? (y0 + 1) % height : Math.min(height - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const o = (y * width + x) * 4
      for (let c = 0; c < 4; c += 1) {
        const a = src[(y0 * width + x0) * 4 + c]
        const b = src[(y0 * width + x1) * 4 + c]
        const d = src[(y1 * width + x0) * 4 + c]
        const e = src[(y1 * width + x1) * 4 + c]
        image.data[o + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy
      }
    }
  }
  write(canvas, image)
}

/** Sobel edge magnitude per pixel, 0..255. */
function edgeMap(data: Uint8ClampedArray, width: number, height: number) {
  const out = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const p = (dx: number, dy: number) => luma(data, ((y + dy) * width + (x + dx)) * 4)
      const gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1)
      const gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1)
      out[i] = clamp(Math.hypot(gx, gy) / 4, 0, 255)
    }
  }
  return out
}

/** Value noise, smooth across the picture; 0..1. */
function valueNoise(width: number, height: number, cell: number, seed = 1) {
  const gw = Math.ceil(width / cell) + 2
  const gh = Math.ceil(height / cell) + 2
  const grid = new Float32Array(gw * gh)
  let s = seed
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand()
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y += 1) {
    const gy = y / cell
    const y0 = Math.floor(gy)
    const ty = gy - y0
    const sy = ty * ty * (3 - 2 * ty)
    for (let x = 0; x < width; x += 1) {
      const gx = x / cell
      const x0 = Math.floor(gx)
      const tx = gx - x0
      const sx = tx * tx * (3 - 2 * tx)
      const a = grid[y0 * gw + x0]
      const b = grid[y0 * gw + x0 + 1]
      const c = grid[(y0 + 1) * gw + x0]
      const d = grid[(y0 + 1) * gw + x0 + 1]
      out[y * width + x] = (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy
    }
  }
  return out
}

/** Several octaves of value noise: clouds. */
function fractalNoise(width: number, height: number, base: number, octaves = 4) {
  const out = new Float32Array(width * height)
  let amplitude = 1
  let total = 0
  for (let o = 0; o < octaves; o += 1) {
    const layer = valueNoise(width, height, Math.max(2, base / 2 ** o), 7 + o * 13)
    for (let i = 0; i < out.length; i += 1) out[i] += layer[i] * amplitude
    total += amplitude
    amplitude *= 0.5
  }
  for (let i = 0; i < out.length; i += 1) out[i] /= total
  return out
}

function posterizeValue(v: number, levels: number) {
  const step = 255 / Math.max(1, levels - 1)
  return Math.round(Math.round(v / step) * step)
}

function tint(data: Uint8ClampedArray, i: number, fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }, t: number) {
  data[i] = bg.r + (fg.r - bg.r) * t
  data[i + 1] = bg.g + (fg.g - bg.g) * t
  data[i + 2] = bg.b + (fg.b - bg.b) * t
}

const colors = (params: FilterParams) => ({
  fg: hexToRgb(params.foreground ?? '#000000'),
  bg: hexToRgb(params.background ?? '#ffffff'),
})

/* ------------------------------------------------------------------ blur */

export function averageFilter(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      r += image.data[i]; g += image.data[i + 1]; b += image.data[i + 2]; n += 1
    }
  }
  if (!n) return
  mapSource(canvas, selection, (_src, out, i) => {
    out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n
  })
}

export function blurMore(canvas: HTMLCanvasElement, selection: Selection | null) {
  gaussianBlur(canvas, 1.6, selection)
}

/** Bilateral: blurs flat areas, keeps anything that differs by more than `threshold`. */
export function surfaceBlur(canvas: HTMLCanvasElement, radius: number, threshold: number, selection: Selection | null) {
  const r = Math.max(1, Math.round(radius))
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0
      let weight = 0
      const centre = src[i + c]
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = clamp(x + dx, 0, w - 1)
          const yy = clamp(y + dy, 0, h - 1)
          const v = src[(yy * w + xx) * 4 + c]
          const k = Math.max(0, 1 - Math.abs(v - centre) / Math.max(1, threshold))
          sum += v * k
          weight += k
        }
      }
      out[i + c] = weight ? sum / weight : centre
    }
  })
}

export function smartBlur(canvas: HTMLCanvasElement, radius: number, threshold: number, selection: Selection | null) {
  surfaceBlur(canvas, radius, threshold, selection)
}

/** A disc blur: what a lens does to an out-of-focus point, with a bokeh lift. */
export function lensBlur(canvas: HTMLCanvasElement, radius: number, brightness: number, selection: Selection | null) {
  const r = Math.max(1, Math.round(radius))
  const lift = 1 + brightness / 100
  const offsets: [number, number][] = []
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy])
    }
  }
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    let rr = 0
    let gg = 0
    let bb = 0
    let aa = 0
    let weight = 0
    for (const [dx, dy] of offsets) {
      const xx = clamp(x + dx, 0, w - 1)
      const yy = clamp(y + dy, 0, h - 1)
      const j = (yy * w + xx) * 4
      // Bright points weigh more, which is what makes highlights bloom into discs.
      const k = 1 + (luma(src, j) / 255) ** 4 * (lift - 1) * 8
      rr += src[j] * k; gg += src[j + 1] * k; bb += src[j + 2] * k; aa += src[j + 3] * k
      weight += k
    }
    out[i] = rr / weight; out[i + 1] = gg / weight; out[i + 2] = bb / weight; out[i + 3] = aa / weight
  })
}

export function shapeBlur(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  lensBlur(canvas, radius, 0, selection)
}

/** Blends a blurred copy in by a per-pixel weight: the Blur Gallery's shape. */
function blendBlur(canvas: HTMLCanvasElement, radius: number, selection: Selection | null, weightAt: (x: number, y: number, w: number, h: number) => number) {
  const blurred = blurredData(canvas, radius)
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    const t = clamp(weightAt(x, y, w, h), 0, 1)
    for (let c = 0; c < 4; c += 1) out[i + c] = src[i + c] * (1 - t) + blurred[i + c] * t
  })
}

export function fieldBlur(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  gaussianBlur(canvas, radius, selection)
}

/** Sharp in a centred ellipse, blurred beyond it. */
export function irisBlur(canvas: HTMLCanvasElement, radius: number, focus: number, selection: Selection | null) {
  const inner = clamp(focus, 0, 100) / 100
  blendBlur(canvas, radius, selection, (x, y, w, h) => {
    const d = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2))
    return (d - inner * 0.6) / Math.max(0.05, 1 - inner * 0.6)
  })
}

/** Sharp in a horizontal band, blurred above and below. */
export function tiltShift(canvas: HTMLCanvasElement, radius: number, band: number, selection: Selection | null) {
  const half = clamp(band, 1, 100) / 200
  blendBlur(canvas, radius, selection, (_x, y, _w, h) => {
    const d = Math.abs(y / h - 0.5)
    return (d - half) / Math.max(0.05, 0.5 - half)
  })
}

/** Motion blur along an angle: the Blur Gallery's Path Blur on a straight path. */
export function pathBlur(canvas: HTMLCanvasElement, distance: number, angle: number, selection: Selection | null) {
  const steps = Math.max(1, Math.round(distance))
  const dx = Math.cos((angle * Math.PI) / 180)
  const dy = Math.sin((angle * Math.PI) / 180)
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    let r = 0
    let g = 0
    let b = 0
    let a = 0
    for (let s = -steps; s <= steps; s += 1) {
      const xx = clamp(Math.round(x + dx * s), 0, w - 1)
      const yy = clamp(Math.round(y + dy * s), 0, h - 1)
      const j = (yy * w + xx) * 4
      r += src[j]; g += src[j + 1]; b += src[j + 2]; a += src[j + 3]
    }
    const n = steps * 2 + 1
    out[i] = r / n; out[i + 1] = g / n; out[i + 2] = b / n; out[i + 3] = a / n
  })
}

/* --------------------------------------------------------------- distort */

/** Displace: each pixel is pushed by the picture's own brightness (or clouds). */
export function displace(canvas: HTMLCanvasElement, horizontal: number, vertical: number, selection: Selection | null) {
  const { width, height } = canvas
  const map = fractalNoise(width, height, Math.max(8, Math.min(width, height) / 10), 3)
  remap(canvas, selection, (x, y) => {
    const v = map[y * width + x] - 0.5
    return { x: x + v * horizontal * 2, y: y + v * vertical * 2 }
  })
}

/** Rectangular to polar (or back): the picture wrapped round the centre. */
export function polarCoordinates(canvas: HTMLCanvasElement, toPolar: boolean, selection: Selection | null) {
  const { width, height } = canvas
  const cx = width / 2
  const cy = height / 2
  const maxR = Math.min(cx, cy)
  remap(canvas, selection, (x, y) => {
    if (toPolar) {
      // Destination pixel (x, y) on the disc reads a column of the source
      // picked by its angle, at a row picked by its radius.
      const angle = Math.atan2(y - cy, x - cx)
      const r = Math.hypot(x - cx, y - cy) / maxR
      return { x: ((angle + Math.PI) / (Math.PI * 2)) * (width - 1), y: (1 - r) * (height - 1) }
    }
    const angle = (x / (width - 1)) * Math.PI * 2 - Math.PI
    const r = (1 - y / (height - 1)) * maxR
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
  })
}

export function shear(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  const { height } = canvas
  remap(canvas, selection, (x, y) => ({ x: x + Math.sin((y / height) * Math.PI * 2) * amount, y }), true)
}

/** Ripples spreading from the centre, like a stone dropped in a pond. */
export function zigzag(canvas: HTMLCanvasElement, amount: number, ridges: number, selection: Selection | null) {
  const { width, height } = canvas
  const cx = width / 2
  const cy = height / 2
  const maxR = Math.hypot(cx, cy)
  remap(canvas, selection, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const r = Math.hypot(dx, dy)
    if (r < 0.001) return { x, y }
    const wave = Math.sin((r / maxR) * Math.PI * 2 * Math.max(1, ridges)) * amount * (1 - r / maxR)
    return { x: x + (dx / r) * wave, y: y + (dy / r) * wave }
  })
}

/** Ocean Ripple: small overlapping waves across the picture. */
export function oceanRipple(canvas: HTMLCanvasElement, size: number, magnitude: number, selection: Selection | null) {
  const { width, height } = canvas
  const a = fractalNoise(width, height, Math.max(4, size * 3), 3)
  const b = fractalNoise(width, height, Math.max(4, size * 3), 3)
  remap(canvas, selection, (x, y) => ({
    x: x + (a[y * width + x] - 0.5) * magnitude * 2,
    y: y + (b[y * width + x] - 0.5) * magnitude * 2,
  }))
}

/** Glass: seen through patterned glass — fine random refraction. */
export function glass(canvas: HTMLCanvasElement, distortion: number, smoothness: number, selection: Selection | null) {
  const { width, height } = canvas
  const cell = Math.max(2, smoothness)
  const a = valueNoise(width, height, cell, 3)
  const b = valueNoise(width, height, cell, 11)
  remap(canvas, selection, (x, y) => ({
    x: x + (a[y * width + x] - 0.5) * distortion * 2,
    y: y + (b[y * width + x] - 0.5) * distortion * 2,
  }))
}

/** Diffuse Glow: the highlights spill out as a grainy light. */
export function diffuseGlow(canvas: HTMLCanvasElement, glow: number, grain: number, selection: Selection | null) {
  const blurred = blurredData(canvas, 6)
  const k = glow / 100
  mapSource(canvas, selection, (src, out, i) => {
    const bright = clamp((luma(blurred, i) - 140) / 115, 0, 1) * k
    const n = (Math.random() - 0.5) * grain * bright
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + bright * 255 * 0.8 + n, 0, 255)
  })
}

/* ----------------------------------------------------------------- noise */

export function despeckle(canvas: HTMLCanvasElement, selection: Selection | null) {
  // A median where the picture is flat; edges are left as they are.
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const copy = cloneCanvas(canvas)
  medianFilter(copy, 1, null)
  const med = read(copy).data
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 40, 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = med[i + c] * (1 - e) + src[i + c] * e
  })
}

export function reduceNoise(canvas: HTMLCanvasElement, strength: number, preserveDetails: number, selection: Selection | null) {
  surfaceBlur(canvas, Math.max(1, Math.round(strength / 3)), 20 + (100 - preserveDetails) / 2, selection)
}

/* -------------------------------------------------------------- pixelate */

/** Colour Halftone: each channel as a screen of dots, the way print does it. */
export function colorHalftone(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  const cell = Math.max(3, Math.round(radius))
  const image = read(canvas)
  const src = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const angles = [15, 45, 75]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const o = (y * width + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const a = (angles[c] * Math.PI) / 180
        // Rotate into the screen's grid, find the dot centre, measure it.
        const rx = x * Math.cos(a) + y * Math.sin(a)
        const ry = -x * Math.sin(a) + y * Math.cos(a)
        const gx = Math.floor(rx / cell) * cell + cell / 2
        const gy = Math.floor(ry / cell) * cell + cell / 2
        const sx = clamp(Math.round(gx * Math.cos(a) - gy * Math.sin(a)), 0, width - 1)
        const sy = clamp(Math.round(gx * Math.sin(a) + gy * Math.cos(a)), 0, height - 1)
        const ink = 1 - src[(sy * width + sx) * 4 + c] / 255
        const dot = Math.sqrt(ink) * cell * 0.7
        const d = Math.hypot(rx - gx, ry - gy)
        image.data[o + c] = d < dot ? 0 : 255
      }
    }
  }
  write(canvas, image)
}

export function facet(canvas: HTMLCanvasElement, selection: Selection | null) {
  medianFilter(canvas, 2, selection)
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c], 24)
  })
}

export function fragment(canvas: HTMLCanvasElement, selection: Selection | null) {
  const d = 4
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    const taps = [[-d, -d], [d, -d], [-d, d], [d, d]]
    for (let c = 0; c < 4; c += 1) {
      let sum = 0
      for (const [dx, dy] of taps) sum += src[(clamp(y + dy, 0, h - 1) * w + clamp(x + dx, 0, w - 1)) * 4 + c]
      out[i + c] = sum / 4
    }
  })
}

export function mezzotint(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = Math.random() * 255 < src[i + c] ? 255 : 0
  })
}

/** Pointillize: dots of the picture's colours on the background colour. */
export function pointillize(canvas: HTMLCanvasElement, cell: number, selection: Selection | null, background = '#ffffff') {
  const size = Math.max(3, Math.round(cell))
  const { width, height } = canvas
  const src = read(canvas).data
  const paint = createCanvas(width, height)
  const ctx = context2d(paint)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  for (let gy = 0; gy < height + size; gy += size) {
    for (let gx = 0; gx < width + size; gx += size) {
      const x = clamp(Math.round(gx + (Math.random() - 0.5) * size), 0, width - 1)
      const y = clamp(Math.round(gy + (Math.random() - 0.5) * size), 0, height - 1)
      const i = (y * width + x) * 4
      ctx.fillStyle = `rgba(${src[i]},${src[i + 1]},${src[i + 2]},${src[i + 3] / 255})`
      ctx.beginPath()
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const painted = read(paint).data
  mapSource(canvas, selection, (_src, out, i) => {
    for (let c = 0; c < 4; c += 1) out[i + c] = painted[i + c]
  })
}

/* ---------------------------------------------------------------- render */

export function differenceClouds(canvas: HTMLCanvasElement, selection: Selection | null) {
  const { width, height } = canvas
  const noise = fractalNoise(width, height, Math.max(16, Math.min(width, height) / 4), 5)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const v = noise[y * w + x] * 255
    for (let c = 0; c < 3; c += 1) out[i + c] = Math.abs(src[i + c] - v)
    out[i + 3] = src[i + 3] || 255
  })
}

/** Fibers: streaks of the foreground and background colours, run vertically. */
export function fibers(canvas: HTMLCanvasElement, variance: number, strength: number, selection: Selection | null, foreground = '#000000', background = '#ffffff') {
  const fg = hexToRgb(foreground)
  const bg = hexToRgb(background)
  const { width, height } = canvas
  const noise = valueNoise(width, height, Math.max(2, variance / 4), 5)
  const along = valueNoise(width, height, Math.max(2, 40 / Math.max(1, strength / 10)), 9)
  mapSource(canvas, selection, (_src, out, i, x, y, w) => {
    const t = clamp(noise[y * w + x] * 0.5 + along[Math.floor(y / 3) * w + x] * 0.5, 0, 1)
    tint(out, i, fg, bg, t)
    out[i + 3] = 255
  })
}

/** A spotlight from above and to the left, falling off into shadow. */
export function lightingEffects(canvas: HTMLCanvasElement, intensity: number, focus: number, selection: Selection | null, lightX = 0.3, lightY = 0.25) {
  const k = intensity / 50
  const spread = Math.max(0.2, focus / 50)
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    const d = Math.hypot((x / w - lightX) / spread, (y / h - lightY) / spread)
    const light = clamp(1.25 - d, 0.15, 1.25) * k
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * light, 0, 255)
  })
}

export function flame(canvas: HTMLCanvasElement, selection: Selection | null) {
  const { width, height } = canvas
  const noise = fractalNoise(width, height, Math.max(8, width / 8), 4)
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    // Hotter at the bottom, licking upward with the noise.
    const heat = clamp((1 - y / h) * 0.5 + noise[y * w + x] * 0.9 - 0.35, 0, 1)
    const r = clamp(heat * 3 * 255, 0, 255)
    const g = clamp((heat - 0.33) * 3 * 255, 0, 255)
    const b = clamp((heat - 0.66) * 3 * 255, 0, 255)
    const a = clamp(heat * 2, 0, 1)
    out[i] = src[i] * (1 - a) + r * a
    out[i + 1] = src[i + 1] * (1 - a) + g * a
    out[i + 2] = src[i + 2] * (1 - a) + b * a
    out[i + 3] = Math.max(src[i + 3], a * 255)
  })
}

/** A bare tree drawn by recursive branching, in the foreground colour. */
export function tree(canvas: HTMLCanvasElement, selection: Selection | null, color = '#3b2f2f', depth = 9) {
  const { width, height } = canvas
  const paint = createCanvas(width, height)
  const ctx = context2d(paint)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  const branch = (x: number, y: number, length: number, angle: number, level: number) => {
    if (level <= 0 || length < 2) return
    const ex = x + Math.cos(angle) * length
    const ey = y + Math.sin(angle) * length
    ctx.lineWidth = Math.max(1, level * 1.4)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(ex, ey)
    ctx.stroke()
    const spread = 0.35 + Math.random() * 0.3
    branch(ex, ey, length * (0.66 + Math.random() * 0.1), angle - spread, level - 1)
    branch(ex, ey, length * (0.66 + Math.random() * 0.1), angle + spread, level - 1)
    if (Math.random() < 0.35) branch(ex, ey, length * 0.6, angle, level - 1)
  }
  branch(width / 2, height * 0.98, height * 0.22, -Math.PI / 2, depth)
  const painted = read(paint).data
  mapSource(canvas, selection, (src, out, i) => {
    const a = painted[i + 3] / 255
    for (let c = 0; c < 3; c += 1) out[i + c] = src[i + c] * (1 - a) + painted[i + c] * a
    out[i + 3] = Math.max(src[i + 3], painted[i + 3])
  })
}

/** Picture Frame: a bevelled border inside the edge, in the foreground colour. */
export function pictureFrame(canvas: HTMLCanvasElement, size: number, selection: Selection | null, color = '#5b3a1e') {
  const rgb = hexToRgb(color)
  const s = Math.max(4, size)
  mapSource(canvas, selection, (_src, out, i, x, y, w, h) => {
    const inset = Math.min(x, y, w - 1 - x, h - 1 - y)
    if (inset >= s) return
    // A ridge in the middle of the frame, light on one side and dark on the other.
    const shade = 0.75 + 0.5 * Math.sin((inset / s) * Math.PI)
    out[i] = clamp(rgb.r * shade, 0, 255)
    out[i + 1] = clamp(rgb.g * shade, 0, 255)
    out[i + 2] = clamp(rgb.b * shade, 0, 255)
    out[i + 3] = 255
  })
}

/* --------------------------------------------------------------- sharpen */

export function sharpenMore(canvas: HTMLCanvasElement, selection: Selection | null) {
  unsharpLike(canvas, 1.2, 160, 0, selection)
}

export function sharpenEdges(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const blurred = blurredData(canvas, 1.2)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 30, 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + (src[i + c] - blurred[i + c]) * 1.4 * e, 0, 255)
  })
}

function unsharpLike(canvas: HTMLCanvasElement, radius: number, amount: number, threshold: number, selection: Selection | null) {
  const blurred = blurredData(canvas, radius)
  const k = amount / 100
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) {
      const diff = src[i + c] - blurred[i + c]
      if (Math.abs(diff) < threshold) continue
      out[i + c] = clamp(src[i + c] + diff * k, 0, 255)
    }
  })
}

/** Smart Sharpen: unsharp masking that also holds the shadows and highlights back. */
export function smartSharpen(canvas: HTMLCanvasElement, amount: number, radius: number, reduceNoiseAmount: number, selection: Selection | null) {
  if (reduceNoiseAmount > 0) surfaceBlur(canvas, 1, reduceNoiseAmount / 2, selection)
  const blurred = blurredData(canvas, radius)
  const k = amount / 100
  mapSource(canvas, selection, (src, out, i) => {
    const l = luma(src, i) / 255
    // Fade the sharpening out in the darkest and brightest tones, where it
    // would only produce halos.
    const tone = 1 - Math.max(0, (Math.abs(l - 0.5) - 0.3) / 0.2)
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + (src[i + c] - blurred[i + c]) * k * clamp(tone, 0, 1), 0, 255)
  })
}

/** Shake Reduction: a deconvolution stand-in — sharpen along the blur's direction. */
export function shakeReduction(canvas: HTMLCanvasElement, amount: number, angle: number, selection: Selection | null) {
  const copy = cloneCanvas(canvas)
  pathBlur(copy, Math.max(1, amount / 20), angle, null)
  const smeared = read(copy).data
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + (src[i + c] - smeared[i + c]) * 1.6, 0, 255)
  })
}

/* --------------------------------------------------------------- stylize */

export function diffuse(canvas: HTMLCanvasElement, selection: Selection | null, mode: 'normal' | 'darken' | 'lighten' = 'normal') {
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    const xx = clamp(x + Math.round((Math.random() - 0.5) * 4), 0, w - 1)
    const yy = clamp(y + Math.round((Math.random() - 0.5) * 4), 0, h - 1)
    const j = (yy * w + xx) * 4
    const take = mode === 'normal' || (mode === 'darken' ? luma(src, j) < luma(src, i) : luma(src, j) > luma(src, i))
    if (!take) return
    for (let c = 0; c < 4; c += 1) out[i + c] = src[j + c]
  })
}

/** Extrude: the picture as blocks, each pushed out by its brightness. */
export function extrude(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  const cell = Math.max(4, Math.round(size))
  const { width, height } = canvas
  const src = read(canvas).data
  const paint = createCanvas(width, height)
  const ctx = context2d(paint)
  ctx.drawImage(canvas, 0, 0)
  for (let gy = 0; gy < height; gy += cell) {
    for (let gx = 0; gx < width; gx += cell) {
      const x = clamp(gx + cell / 2, 0, width - 1) | 0
      const y = clamp(gy + cell / 2, 0, height - 1) | 0
      const i = (y * width + x) * 4
      const depth = (luma(src, i) / 255) * cell * 0.8
      // The side faces, then the lit top.
      ctx.fillStyle = `rgb(${src[i] * 0.55 | 0},${src[i + 1] * 0.55 | 0},${src[i + 2] * 0.55 | 0})`
      ctx.beginPath()
      ctx.moveTo(gx, gy + cell)
      ctx.lineTo(gx - depth, gy + cell - depth)
      ctx.lineTo(gx + cell - depth, gy + cell - depth)
      ctx.lineTo(gx + cell, gy + cell)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgb(${src[i] * 0.75 | 0},${src[i + 1] * 0.75 | 0},${src[i + 2] * 0.75 | 0})`
      ctx.beginPath()
      ctx.moveTo(gx + cell, gy)
      ctx.lineTo(gx + cell - depth, gy - depth)
      ctx.lineTo(gx + cell - depth, gy + cell - depth)
      ctx.lineTo(gx + cell, gy + cell)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = `rgb(${src[i]},${src[i + 1]},${src[i + 2]})`
      ctx.fillRect(gx - depth, gy - depth, cell, cell)
    }
  }
  const painted = read(paint).data
  mapSource(canvas, selection, (_src, out, i) => {
    for (let c = 0; c < 4; c += 1) out[i + c] = painted[i + c]
  })
}

/** Tiles: the picture cut into squares, each nudged out of place. */
export function tiles(canvas: HTMLCanvasElement, count: number, offsetPercent: number, selection: Selection | null) {
  const { width, height } = canvas
  const n = Math.max(2, Math.round(count))
  const cell = Math.ceil(Math.max(width, height) / n)
  const shifts = new Map<string, [number, number]>()
  remap(canvas, selection, (x, y) => {
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`
    let shift = shifts.get(key)
    if (!shift) {
      shift = [(Math.random() - 0.5) * cell * (offsetPercent / 100), (Math.random() - 0.5) * cell * (offsetPercent / 100)]
      shifts.set(key, shift)
    }
    return { x: x - shift[0], y: y - shift[1] }
  })
}

/** Trace Contour: a line wherever a channel crosses the level. */
export function traceContour(canvas: HTMLCanvasElement, level: number, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    let hit = false
    for (let c = 0; c < 3 && !hit; c += 1) {
      const here = src[i + c] >= level
      const right = src[(y * w + Math.min(w - 1, x + 1)) * 4 + c] >= level
      const below = src[(Math.min(h - 1, y + 1) * w + x) * 4 + c] >= level
      hit = here !== right || here !== below
    }
    const v = hit ? 0 : 255
    out[i] = v; out[i + 1] = v; out[i + 2] = v
  })
}

/** Wind: bright streaks trailing off in one direction. */
export function wind(canvas: HTMLCanvasElement, strength: number, fromLeft: boolean, selection: Selection | null) {
  const reach = Math.max(2, Math.round(strength))
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    let best = luma(src, i)
    let take = i
    for (let s = 1; s <= reach; s += 1) {
      const xx = fromLeft ? x - s : x + s
      if (xx < 0 || xx >= w) break
      const j = (y * w + xx) * 4
      const l = luma(src, j) * (1 - s / (reach + 1))
      if (l > best) { best = l; take = j }
    }
    if (take === i) return
    const t = 0.7
    for (let c = 0; c < 3; c += 1) out[i + c] = src[i + c] * (1 - t) + src[take + c] * t
  })
}

/* ----------------------------------------------------------------- video */

export function deInterlace(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    if (y % 2 === 0) return
    const above = ((y - 1) * w + x) * 4
    const below = (Math.min(h - 1, y + 1) * w + x) * 4
    for (let c = 0; c < 4; c += 1) out[i + c] = (src[above + c] + src[below + c]) / 2
  })
}

/** NTSC Colors: saturation and brightness pulled inside what broadcast allows. */
export function ntscColors(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i) => {
    const hsl = rgbToHsl(src[i], src[i + 1], src[i + 2])
    const rgb = hslToRgb(hsl.h, Math.min(hsl.s, 0.8), clamp(hsl.l, 0.07, 0.93))
    out[i] = rgb.r; out[i + 1] = rgb.g; out[i + 2] = rgb.b
  })
}

/* ----------------------------------------------------------------- other */

/** Custom: a 5x5 convolution kernel the user typed in. */
export function customKernel(canvas: HTMLCanvasElement, kernel: number[], scale: number, offset: number, selection: Selection | null) {
  const size = Math.round(Math.sqrt(kernel.length))
  const half = Math.floor(size / 2)
  const div = scale || 1
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    for (let c = 0; c < 3; c += 1) {
      let sum = 0
      for (let ky = 0; ky < size; ky += 1) {
        for (let kx = 0; kx < size; kx += 1) {
          const k = kernel[ky * size + kx]
          if (!k) continue
          const xx = clamp(x + kx - half, 0, w - 1)
          const yy = clamp(y + ky - half, 0, h - 1)
          sum += src[(yy * w + xx) * 4 + c] * k
        }
      }
      out[i + c] = clamp(sum / div + offset, 0, 255)
    }
  })
}

/** HSB/HSA: the channels rewritten as hue, saturation and brightness (or alpha). */
export function hsbChannels(canvas: HTMLCanvasElement, toHsb: boolean, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i) => {
    if (toHsb) {
      const hsl = rgbToHsl(src[i], src[i + 1], src[i + 2])
      out[i] = (hsl.h / 360) * 255
      out[i + 1] = hsl.s * 255
      out[i + 2] = hsl.l * 255
    } else {
      const rgb = hslToRgb((src[i] / 255) * 360, src[i + 1] / 255, src[i + 2] / 255)
      out[i] = rgb.r; out[i + 1] = rgb.g; out[i + 2] = rgb.b
    }
  })
}

/* ------------------------------------------------------- lens correction */

/**
 * Lens Correction: barrel or pincushion distortion undone, the corners
 * brightened back up, and the colour fringes pulled back into line.
 */
export function lensCorrection(canvas: HTMLCanvasElement, distortion: number, vignetteAmount: number, fringe: number, selection: Selection | null) {
  const { width, height } = canvas
  const cx = width / 2
  const cy = height / 2
  const maxR = Math.hypot(cx, cy)
  const k = distortion / 100
  if (fringe) {
    // Red and blue scaled in opposite directions about the centre.
    const image = read(canvas)
    const src = new Uint8ClampedArray(image.data)
    const sampleChannel = (x: number, y: number, c: number, scale: number) => {
      const sx = clamp(Math.round(cx + (x - cx) * scale), 0, width - 1)
      const sy = clamp(Math.round(cy + (y - cy) * scale), 0, height - 1)
      return src[(sy * width + sx) * 4 + c]
    }
    const s = fringe / 1000
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!pointInSelection(selection, x, y, width, height)) continue
        const o = (y * width + x) * 4
        image.data[o] = sampleChannel(x, y, 0, 1 + s)
        image.data[o + 2] = sampleChannel(x, y, 2, 1 - s)
      }
    }
    write(canvas, image)
  }
  if (k) {
    remap(canvas, selection, (x, y) => {
      const dx = (x - cx) / maxR
      const dy = (y - cy) / maxR
      const r2 = dx * dx + dy * dy
      const f = 1 + k * r2
      return { x: cx + dx * f * maxR, y: cy + dy * f * maxR }
    })
  }
  if (vignetteAmount) {
    const v = vignetteAmount / 100
    mapSource(canvas, selection, (src, out, i, x, y) => {
      const d = Math.hypot(x - cx, y - cy) / maxR
      const gain = 1 + v * d * d
      for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * gain, 0, 255)
    })
  }
}

/* ----------------------------------------------------- filter gallery */

/* Artistic */

export function coloredPencil(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const { bg } = colors(params)
  const paper = params.amount / 100
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 40, 0, 1)
    // Pencil where there are edges, paper where there are not.
    for (let c = 0; c < 3; c += 1) {
      const paperColor = [bg.r, bg.g, bg.b][c]
      out[i + c] = clamp(src[i + c] * (0.55 + e * 0.45) * (1 - paper * 0.4) + paperColor * paper * 0.4 * (1 - e), 0, 255)
    }
  })
}

export function cutout(canvas: HTMLCanvasElement, levels: number, selection: Selection | null) {
  gaussianBlur(canvas, 2.5, selection)
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c], clamp(Math.round(levels), 2, 8))
  })
}

export function dryBrush(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  medianFilter(canvas, Math.max(1, Math.round(size / 2)), selection)
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c], 12)
  })
}

export function filmGrain(canvas: HTMLCanvasElement, grain: number, highlight: number, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i) => {
    const n = (Math.random() - 0.5) * grain * 2
    const lift = clamp((luma(src, i) - 128) / 127, 0, 1) * highlight
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + n + lift, 0, 255)
  })
}

export function fresco(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  medianFilter(canvas, 2, selection)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const dark = 1 - clamp(edges[y * w + x] / 90, 0, 0.7)
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c] * dark, 10)
  })
}

export function neonGlow(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const glow = hexToRgb(params.foreground ?? '#66e0ff')
  const size = Math.max(1, params.radius)
  const edgeCanvas = createCanvas(canvas.width, canvas.height)
  const ectx = context2d(edgeCanvas)
  const eimg = ectx.createImageData(canvas.width, canvas.height)
  for (let p = 0; p < edges.length; p += 1) {
    eimg.data[p * 4 + 3] = clamp(edges[p] * 2, 0, 255)
    eimg.data[p * 4] = glow.r; eimg.data[p * 4 + 1] = glow.g; eimg.data[p * 4 + 2] = glow.b
  }
  ectx.putImageData(eimg, 0, 0)
  gaussianBlur(edgeCanvas, size, null)
  const halo = read(edgeCanvas).data
  mapSource(canvas, selection, (src, out, i) => {
    const l = luma(src, i) * 0.25
    const a = halo[i + 3] / 255
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(l * (1 - a) + halo[i + c] * a + halo[i + c] * a * 0.5, 0, 255)
  })
}

export function paintDaubs(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  medianFilter(canvas, Math.max(1, Math.round(size / 2)), selection)
  unsharpLike(canvas, 1.5, 90, 0, selection)
}

export function paletteKnife(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  medianFilter(canvas, Math.max(2, Math.round(size)), selection)
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c], 7)
  })
}

export function plasticWrap(canvas: HTMLCanvasElement, strength: number, selection: Selection | null) {
  const blurred = blurredData(canvas, 3)
  const image = read(canvas)
  const edges = edgeMap(blurred, canvas.width, canvas.height)
  void image
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const sheen = clamp(edges[y * w + x] / 25, 0, 1) * (strength / 100) * 255
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * 0.85 + sheen, 0, 255)
  })
}

export function posterEdges(canvas: HTMLCanvasElement, thickness: number, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const dark = 1 - clamp((edges[y * w + x] - 20) / (60 / Math.max(1, thickness)), 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c], 6) * dark
  })
}

export function roughPastels(canvas: HTMLCanvasElement, length: number, selection: Selection | null) {
  const { width, height } = canvas
  const grain = valueNoise(width, height, 2, 21)
  const copy = cloneCanvas(canvas)
  pathBlur(copy, Math.max(1, length / 3), 45, null)
  const streaked = read(copy).data
  mapSource(canvas, selection, (_src, out, i, x, y, w) => {
    const g = (grain[y * w + x] - 0.5) * 60
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(streaked[i + c] + g, 0, 255)
  })
}

export function smudgeStick(canvas: HTMLCanvasElement, length: number, selection: Selection | null) {
  pathBlur(canvas, Math.max(1, length), -45, selection)
  mapSource(canvas, selection, (src, out, i) => {
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp((src[i + c] - 128) * 1.15 + 128, 0, 255)
  })
}

export function spongeFilter(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  const { width, height } = canvas
  const blot = valueNoise(width, height, Math.max(2, size * 2), 33)
  medianFilter(canvas, 1, selection)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const t = blot[y * w + x] > 0.55 ? 0.7 : 1
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * t, 0, 255)
  })
}

export function underpainting(canvas: HTMLCanvasElement, size: number, selection: Selection | null) {
  const { width, height } = canvas
  const texture = valueNoise(width, height, Math.max(2, size), 44)
  gaussianBlur(canvas, 2, selection)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const t = (texture[y * w + x] - 0.5) * 50
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * 0.9 + t, 0, 255)
  })
}

export function watercolor(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  medianFilter(canvas, 2, selection)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const dark = 1 - clamp(edges[y * w + x] / 120, 0, 0.5)
    for (let c = 0; c < 3; c += 1) out[i + c] = posterizeValue(src[i + c] * dark, 14)
  })
}

/* Brush strokes */

export function accentedEdges(canvas: HTMLCanvasElement, brightness: number, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const lift = (brightness - 25) / 25
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 50, 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + e * lift * 120, 0, 255)
  })
}

export function angledStrokes(canvas: HTMLCanvasElement, length: number, selection: Selection | null) {
  const a = cloneCanvas(canvas)
  const b = cloneCanvas(canvas)
  pathBlur(a, length, 45, null)
  pathBlur(b, length, -45, null)
  const da = read(a).data
  const db = read(b).data
  mapSource(canvas, selection, (src, out, i) => {
    // Light areas stroke one way, dark the other.
    const t = luma(src, i) / 255
    for (let c = 0; c < 3; c += 1) out[i + c] = da[i + c] * t + db[i + c] * (1 - t)
  })
}

export function crosshatch(canvas: HTMLCanvasElement, strength: number, selection: Selection | null) {
  mapSource(canvas, selection, (src, out, i, x, y) => {
    const l = luma(src, i)
    const lineA = (x + y) % 6 === 0
    const lineB = (x - y + 6000) % 6 === 0
    const ink = (l < 170 && lineA ? 1 : 0) + (l < 100 && lineB ? 1 : 0)
    const dark = 1 - ink * (strength / 100) * 0.5
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * dark, 0, 255)
  })
}

export function darkStrokes(canvas: HTMLCanvasElement, selection: Selection | null) {
  const copy = cloneCanvas(canvas)
  pathBlur(copy, 4, 30, null)
  const streaked = read(copy).data
  mapSource(canvas, selection, (src, out, i) => {
    const l = luma(src, i) / 255
    const t = 1 - l
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * (1 - t) + streaked[i + c] * t * 0.7, 0, 255)
  })
}

export function inkOutlines(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp((edges[y * w + x] - 15) / 30, 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = src[i + c] * (1 - e)
  })
}

export function spatter(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  const r = Math.max(1, radius)
  remap(canvas, selection, (x, y) => ({ x: x + (Math.random() - 0.5) * r * 2, y: y + (Math.random() - 0.5) * r * 2 }))
}

export function sprayedStrokes(canvas: HTMLCanvasElement, length: number, radius: number, selection: Selection | null) {
  const r = Math.max(1, radius)
  remap(canvas, selection, (x, y) => {
    const along = (Math.random() - 0.5) * length * 2
    return { x: x + along * 0.7 + (Math.random() - 0.5) * r, y: y + along * 0.7 + (Math.random() - 0.5) * r }
  })
}

export function sumie(canvas: HTMLCanvasElement, selection: Selection | null) {
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  gaussianBlur(canvas, 1.5, selection)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 40, 0, 1)
    const l = luma(src, i) / 255
    const ink = clamp(e + (1 - l) * 0.6, 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * (1 - ink * 0.85), 0, 255)
  })
}

/* Sketch — these draw in the foreground and background colours, as Photoshop does. */

export function basRelief(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const blurred = blurredData(canvas, Math.max(0.5, params.radius / 2))
  mapSource(canvas, selection, (_src, out, i, x, y, w, h) => {
    const j = (clamp(y - 1, 0, h - 1) * w + clamp(x - 1, 0, w - 1)) * 4
    const relief = clamp((luma(blurred, i) - luma(blurred, j)) * 3 + 128, 0, 255) / 255
    tint(out, i, fg, bg, 1 - relief)
  })
}

export function chalkCharcoal(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const blurred = blurredData(canvas, 4)
  mapSource(canvas, selection, (src, out, i) => {
    const hp = luma(src, i) - luma(blurred, i)
    const n = (Math.random() - 0.5) * 30
    const t = clamp(0.5 - (hp + n) / 60, 0, 1)
    tint(out, i, fg, bg, t)
  })
}

export function charcoal(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp(edges[y * w + x] / 30, 0, 1)
    const shade = clamp(1 - luma(src, i) / 255, 0, 1) * 0.6
    const smear = (Math.random() - 0.5) * 0.2
    tint(out, i, fg, bg, clamp(Math.max(e, shade) + smear, 0, 1))
  })
}

export function chrome(canvas: HTMLCanvasElement, selection: Selection | null) {
  const blurred = blurredData(canvas, 3)
  mapSource(canvas, selection, (_src, out, i) => {
    // A folded ramp: mid-tones go bright, which is what reads as polished metal.
    const l = luma(blurred, i) / 255
    const v = clamp(Math.abs(Math.sin(l * Math.PI * 2.5)) * 255, 0, 255)
    out[i] = v; out[i + 1] = v; out[i + 2] = clamp(v + 10, 0, 255)
  })
}

export function conteCrayon(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const { width, height } = canvas
  const texture = valueNoise(width, height, 3, 55)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const l = luma(src, i) / 255
    const grain = (texture[y * w + x] - 0.5) * 0.35
    tint(out, i, fg, bg, clamp(1 - l + grain, 0, 1))
  })
}

export function graphicPen(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const length = Math.max(2, params.radius * 3)
  mapSource(canvas, selection, (src, out, i, x, y) => {
    // Diagonal strokes, dense where the picture is dark.
    const phase = ((x + y) % length) / length
    const l = luma(src, i) / 255
    const ink = phase < (1 - l) * 0.9 && ((x - y + 4096) % 3 === 0) ? 1 : 0
    tint(out, i, fg, bg, ink)
  })
}

export function halftonePattern(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null, pattern: 'dot' | 'line' | 'circle' = 'dot') {
  const { fg, bg } = colors(params)
  const cell = Math.max(3, params.radius * 2)
  mapSource(canvas, selection, (src, out, i, x, y, w, h) => {
    const l = luma(src, i) / 255
    let t: number
    if (pattern === 'line') {
      t = (y % cell) / cell < 1 - l ? 1 : 0
    } else if (pattern === 'circle') {
      const d = Math.hypot(x - w / 2, y - h / 2) % cell
      t = d / cell < 1 - l ? 1 : 0
    } else {
      const gx = (x % cell) - cell / 2
      const gy = (y % cell) - cell / 2
      t = Math.hypot(gx, gy) < Math.sqrt(1 - l) * cell * 0.6 ? 1 : 0
    }
    tint(out, i, fg, bg, t)
  })
}

export function notePaper(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const { width, height } = canvas
  const grain = valueNoise(width, height, 2, 66)
  const blurred = blurredData(canvas, 2)
  mapSource(canvas, selection, (_src, out, i, x, y, w, h) => {
    const l = luma(blurred, i)
    const j = (clamp(y - 2, 0, h - 1) * w + clamp(x - 2, 0, w - 1)) * 4
    const cut = l < 128
    const shadow = cut && luma(blurred, j) >= 128 ? 0.35 : 0
    const g = (grain[y * w + x] - 0.5) * 0.15
    tint(out, i, fg, bg, clamp((cut ? 0.55 : 0) + shadow + g, 0, 1))
  })
}

export function photocopy(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const blurred = blurredData(canvas, Math.max(1, params.radius))
  mapSource(canvas, selection, (src, out, i) => {
    const hp = luma(src, i) - luma(blurred, i)
    const dark = luma(src, i) < 60 ? 1 : 0
    const t = clamp(Math.max(dark, -hp / 18), 0, 1)
    tint(out, i, fg, bg, t)
  })
}

export function plaster(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const blurred = blurredData(canvas, 3)
  mapSource(canvas, selection, (_src, out, i, x, y, w, h) => {
    const j = (clamp(y - 2, 0, h - 1) * w + clamp(x - 2, 0, w - 1)) * 4
    const raised = luma(blurred, i) >= 128
    const edge = (luma(blurred, i) - luma(blurred, j)) / 40
    const t = clamp((raised ? 0.15 : 0.7) - edge, 0, 1)
    tint(out, i, fg, bg, t)
  })
}

export function reticulation(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const { width, height } = canvas
  const grain = valueNoise(width, height, 2, 77)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const l = luma(src, i) / 255
    const g = grain[y * w + x]
    const t = clamp((1 - l) * 0.8 + (g - 0.5) * 0.6, 0, 1)
    tint(out, i, fg, bg, t > 0.5 ? 1 : t * 0.3)
  })
}

export function stampFilter(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const blurred = blurredData(canvas, Math.max(1, params.radius))
  mapSource(canvas, selection, (_src, out, i) => {
    tint(out, i, fg, bg, luma(blurred, i) < 128 ? 1 : 0)
  })
}

export function tornEdges(canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) {
  const { fg, bg } = colors(params)
  const { width, height } = canvas
  const rough = valueNoise(width, height, 3, 88)
  const blurred = blurredData(canvas, 2)
  mapSource(canvas, selection, (_src, out, i, x, y, w) => {
    const level = 128 + (rough[y * w + x] - 0.5) * 120
    tint(out, i, fg, bg, luma(blurred, i) < level ? 1 : 0)
  })
}

export function waterPaper(canvas: HTMLCanvasElement, length: number, selection: Selection | null) {
  const copy = cloneCanvas(canvas)
  pathBlur(copy, Math.max(1, length), 90, null)
  const streaked = read(copy).data
  const { width, height } = canvas
  const fibre = valueNoise(width, height, 2, 99)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const f = (fibre[y * w + x] - 0.5) * 40
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * 0.5 + streaked[i + c] * 0.5 + f + 20, 0, 255)
  })
}

/* Texture */

export function craquelure(canvas: HTMLCanvasElement, spacing: number, depth: number, selection: Selection | null) {
  const { width, height } = canvas
  const cell = Math.max(6, spacing)
  const a = valueNoise(width, height, cell, 5)
  const b = valueNoise(width, height, cell * 0.7, 6)
  const k = depth / 10
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    // Cracks run where the two noise fields cross their midpoints.
    const va = Math.abs(a[y * w + x] - 0.5)
    const vb = Math.abs(b[y * w + x] - 0.5)
    const crack = Math.min(va, vb) < 0.02 ? 1 : 0
    const dark = 1 - crack * clamp(k, 0, 1) * 0.7
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * dark, 0, 255)
  })
}

export function grainFilter(canvas: HTMLCanvasElement, intensity: number, kind: 'regular' | 'soft' | 'sprinkles' | 'clumped' | 'contrasty' | 'horizontal' | 'vertical' | 'speckle', selection: Selection | null) {
  const { width, height } = canvas
  const clumps = kind === 'clumped' ? valueNoise(width, height, 3, 12) : null
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    let n = (Math.random() - 0.5) * intensity * 2
    if (kind === 'soft') n *= 0.5
    if (kind === 'contrasty') n *= 1.8
    if (kind === 'sprinkles' || kind === 'speckle') n = Math.random() < 0.08 ? (kind === 'speckle' ? -1 : 1) * intensity * 2 : 0
    if (kind === 'horizontal') n = ((Math.sin(y * 7.1) + Math.random() - 0.5) * intensity)
    if (kind === 'vertical') n = ((Math.sin(x * 7.1) + Math.random() - 0.5) * intensity)
    if (clumps) n *= clumps[y * w + x] * 2
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] + n, 0, 255)
  })
}

export function mosaicTiles(canvas: HTMLCanvasElement, size: number, grout: number, selection: Selection | null) {
  const cell = Math.max(4, Math.round(size))
  const gap = clamp(grout, 1, cell / 2)
  mosaic(canvas, cell, selection)
  mapSource(canvas, selection, (src, out, i, x, y) => {
    const inGrout = x % cell < gap || y % cell < gap
    const shade = inGrout ? 0.45 : 1
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * shade, 0, 255)
  })
}

export function patchwork(canvas: HTMLCanvasElement, size: number, relief: number, selection: Selection | null) {
  const cell = Math.max(4, Math.round(size))
  mosaic(canvas, cell, selection)
  const k = relief / 10
  mapSource(canvas, selection, (src, out, i, x, y) => {
    const fx = (x % cell) / cell
    const fy = (y % cell) / cell
    // Lit from the top-left: each square is a little pyramid.
    const light = 1 + k * 0.25 * ((fx < 0.5 ? 1 : -1) * 0.5 + (fy < 0.5 ? 1 : -1) * 0.5)
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * light, 0, 255)
  })
}

export function stainedGlass(canvas: HTMLCanvasElement, size: number, border: number, selection: Selection | null) {
  crystallize(canvas, Math.max(4, size), selection)
  const image = read(canvas)
  const edges = edgeMap(image.data, canvas.width, canvas.height)
  const thickness = Math.max(1, border)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    const e = clamp((edges[y * w + x] - 4) / (12 / thickness), 0, 1)
    for (let c = 0; c < 3; c += 1) out[i + c] = src[i + c] * (1 - e)
  })
}

export function texturizer(canvas: HTMLCanvasElement, kind: 'brick' | 'burlap' | 'canvas' | 'sandstone', scale: number, relief: number, selection: Selection | null) {
  const { width, height } = canvas
  const s = Math.max(2, scale / 25)
  const k = relief / 10
  const noise = valueNoise(width, height, Math.max(2, s * 2), 23)
  mapSource(canvas, selection, (src, out, i, x, y, w) => {
    let bump: number
    if (kind === 'brick') {
      const row = Math.floor(y / (6 * s))
      const offset = row % 2 ? 9 * s : 0
      bump = (y % (6 * s) < 1 || (x + offset) % (18 * s) < 1) ? -0.5 : 0.1
    } else if (kind === 'burlap') {
      bump = (Math.sin(x / s * 2) + Math.sin(y / s * 2)) * 0.2
    } else if (kind === 'canvas') {
      bump = ((x % Math.round(2 * s)) < s ? 0.12 : -0.12) * ((y % Math.round(2 * s)) < s ? 1 : -1)
    } else {
      bump = (noise[y * w + x] - 0.5) * 0.6
    }
    const light = 1 + bump * k * 0.4
    for (let c = 0; c < 3; c += 1) out[i + c] = clamp(src[i + c] * light, 0, 255)
  })
}

/* --------------------------------------------------------------- catalog */

/**
 * Every filter this module adds, keyed the way the gallery and the smart
 * filter stack refer to them. Each reads `radius`, `amount` and `extra` as
 * its own parameters, which is what lets one settings window drive all of
 * them.
 */
export const extraFilters: Record<string, { group: string; run: (canvas: HTMLCanvasElement, params: FilterParams, selection: Selection | null) => void }> = {
  average: { group: 'blur', run: (c, _p, s) => averageFilter(c, s) },
  blurMore: { group: 'blur', run: (c, _p, s) => blurMore(c, s) },
  surfaceBlur: { group: 'blur', run: (c, p, s) => surfaceBlur(c, p.radius, p.amount, s) },
  lensBlur: { group: 'blur', run: (c, p, s) => lensBlur(c, p.radius, p.amount, s) },
  shapeBlur: { group: 'blur', run: (c, p, s) => shapeBlur(c, p.radius, s) },
  smartBlur: { group: 'blur', run: (c, p, s) => smartBlur(c, p.radius, p.amount, s) },
  fieldBlur: { group: 'blurGallery', run: (c, p, s) => fieldBlur(c, p.radius, s) },
  irisBlur: { group: 'blurGallery', run: (c, p, s) => irisBlur(c, p.radius, p.amount, s) },
  tiltShift: { group: 'blurGallery', run: (c, p, s) => tiltShift(c, p.radius, p.amount, s) },
  pathBlur: { group: 'blurGallery', run: (c, p, s) => pathBlur(c, p.radius * 2, p.extra ?? 0, s) },
  displace: { group: 'distort', run: (c, p, s) => displace(c, p.radius * 3, p.radius * 3, s) },
  polar: { group: 'distort', run: (c, p, s) => polarCoordinates(c, (p.extra ?? 0) === 0, s) },
  shear: { group: 'distort', run: (c, p, s) => shear(c, p.radius * 4, s) },
  zigzag: { group: 'distort', run: (c, p, s) => zigzag(c, p.radius * 2, Math.max(1, p.amount / 10), s) },
  oceanRipple: { group: 'distort', run: (c, p, s) => oceanRipple(c, p.radius, p.amount / 5, s) },
  glass: { group: 'distort', run: (c, p, s) => glass(c, p.radius, p.amount / 10, s) },
  diffuseGlow: { group: 'distort', run: (c, p, s) => diffuseGlow(c, p.amount, p.radius * 4, s) },
  despeckle: { group: 'noise', run: (c, _p, s) => despeckle(c, s) },
  reduceNoise: { group: 'noise', run: (c, p, s) => reduceNoise(c, p.amount, p.radius * 5, s) },
  colorHalftone: { group: 'pixelate', run: (c, p, s) => colorHalftone(c, Math.max(3, p.radius * 2), s) },
  facet: { group: 'pixelate', run: (c, _p, s) => facet(c, s) },
  fragment: { group: 'pixelate', run: (c, _p, s) => fragment(c, s) },
  mezzotint: { group: 'pixelate', run: (c, _p, s) => mezzotint(c, s) },
  pointillize: { group: 'pixelate', run: (c, p, s) => pointillize(c, Math.max(3, p.radius * 2), s, p.background) },
  differenceClouds: { group: 'render', run: (c, _p, s) => differenceClouds(c, s) },
  fibers: { group: 'render', run: (c, p, s) => fibers(c, p.radius * 4, p.amount, s, p.foreground, p.background) },
  lightingEffects: { group: 'render', run: (c, p, s) => lightingEffects(c, p.amount, p.radius * 10, s) },
  flame: { group: 'render', run: (c, _p, s) => flame(c, s) },
  tree: { group: 'render', run: (c, p, s) => tree(c, s, p.foreground) },
  pictureFrame: { group: 'render', run: (c, p, s) => pictureFrame(c, p.radius * 6, s, p.foreground) },
  sharpenMore: { group: 'sharpen', run: (c, _p, s) => sharpenMore(c, s) },
  sharpenEdges: { group: 'sharpen', run: (c, _p, s) => sharpenEdges(c, s) },
  smartSharpen: { group: 'sharpen', run: (c, p, s) => smartSharpen(c, p.amount * 2, p.radius / 2, p.extra ?? 0, s) },
  shakeReduction: { group: 'sharpen', run: (c, p, s) => shakeReduction(c, p.amount, p.extra ?? 0, s) },
  diffuse: { group: 'stylize', run: (c, _p, s) => diffuse(c, s) },
  extrude: { group: 'stylize', run: (c, p, s) => extrude(c, Math.max(6, p.radius * 4), s) },
  tiles: { group: 'stylize', run: (c, p, s) => tiles(c, Math.max(2, p.radius * 2), p.amount, s) },
  traceContour: { group: 'stylize', run: (c, p, s) => traceContour(c, clamp(p.amount * 2.55, 1, 254), s) },
  wind: { group: 'stylize', run: (c, p, s) => wind(c, p.radius * 3, (p.extra ?? 0) === 0, s) },
  deInterlace: { group: 'video', run: (c, _p, s) => deInterlace(c, s) },
  ntscColors: { group: 'video', run: (c, _p, s) => ntscColors(c, s) },
  hsbHsa: { group: 'other', run: (c, p, s) => hsbChannels(c, (p.extra ?? 0) === 0, s) },
  lensCorrection: { group: 'other', run: (c, p, s) => lensCorrection(c, (p.extra ?? 0), p.amount - 60, p.radius, s) },
  coloredPencil: { group: 'artistic', run: (c, p, s) => coloredPencil(c, p, s) },
  cutout: { group: 'artistic', run: (c, p, s) => cutout(c, Math.max(2, Math.round(p.radius)), s) },
  dryBrush: { group: 'artistic', run: (c, p, s) => dryBrush(c, p.radius, s) },
  filmGrain: { group: 'artistic', run: (c, p, s) => filmGrain(c, p.radius * 4, p.amount / 4, s) },
  fresco: { group: 'artistic', run: (c, _p, s) => fresco(c, s) },
  neonGlow: { group: 'artistic', run: (c, p, s) => neonGlow(c, p, s) },
  paintDaubs: { group: 'artistic', run: (c, p, s) => paintDaubs(c, p.radius, s) },
  paletteKnife: { group: 'artistic', run: (c, p, s) => paletteKnife(c, p.radius, s) },
  plasticWrap: { group: 'artistic', run: (c, p, s) => plasticWrap(c, p.amount, s) },
  posterEdges: { group: 'artistic', run: (c, p, s) => posterEdges(c, Math.max(1, p.radius / 2), s) },
  roughPastels: { group: 'artistic', run: (c, p, s) => roughPastels(c, p.radius * 3, s) },
  smudgeStick: { group: 'artistic', run: (c, p, s) => smudgeStick(c, p.radius, s) },
  spongeFilter: { group: 'artistic', run: (c, p, s) => spongeFilter(c, p.radius, s) },
  underpainting: { group: 'artistic', run: (c, p, s) => underpainting(c, p.radius * 2, s) },
  watercolor: { group: 'artistic', run: (c, _p, s) => watercolor(c, s) },
  accentedEdges: { group: 'brushStrokes', run: (c, p, s) => accentedEdges(c, p.amount / 2, s) },
  angledStrokes: { group: 'brushStrokes', run: (c, p, s) => angledStrokes(c, p.radius * 2, s) },
  crosshatch: { group: 'brushStrokes', run: (c, p, s) => crosshatch(c, p.amount, s) },
  darkStrokes: { group: 'brushStrokes', run: (c, _p, s) => darkStrokes(c, s) },
  inkOutlines: { group: 'brushStrokes', run: (c, _p, s) => inkOutlines(c, s) },
  spatter: { group: 'brushStrokes', run: (c, p, s) => spatter(c, p.radius, s) },
  sprayedStrokes: { group: 'brushStrokes', run: (c, p, s) => sprayedStrokes(c, p.radius * 2, p.radius, s) },
  sumie: { group: 'brushStrokes', run: (c, _p, s) => sumie(c, s) },
  basRelief: { group: 'sketch', run: (c, p, s) => basRelief(c, p, s) },
  chalkCharcoal: { group: 'sketch', run: (c, p, s) => chalkCharcoal(c, p, s) },
  charcoal: { group: 'sketch', run: (c, p, s) => charcoal(c, p, s) },
  chrome: { group: 'sketch', run: (c, _p, s) => chrome(c, s) },
  conteCrayon: { group: 'sketch', run: (c, p, s) => conteCrayon(c, p, s) },
  graphicPen: { group: 'sketch', run: (c, p, s) => graphicPen(c, p, s) },
  halftonePattern: { group: 'sketch', run: (c, p, s) => halftonePattern(c, p, s, (p.extra ?? 0) === 1 ? 'line' : (p.extra ?? 0) === 2 ? 'circle' : 'dot') },
  notePaper: { group: 'sketch', run: (c, p, s) => notePaper(c, p, s) },
  photocopy: { group: 'sketch', run: (c, p, s) => photocopy(c, p, s) },
  plaster: { group: 'sketch', run: (c, p, s) => plaster(c, p, s) },
  reticulation: { group: 'sketch', run: (c, p, s) => reticulation(c, p, s) },
  stamp: { group: 'sketch', run: (c, p, s) => stampFilter(c, p, s) },
  tornEdges: { group: 'sketch', run: (c, p, s) => tornEdges(c, p, s) },
  waterPaper: { group: 'sketch', run: (c, p, s) => waterPaper(c, p.radius * 3, s) },
  craquelure: { group: 'texture', run: (c, p, s) => craquelure(c, p.radius * 4, p.amount / 10, s) },
  grain: { group: 'texture', run: (c, p, s) => grainFilter(c, p.amount / 2, (['regular', 'soft', 'sprinkles', 'clumped', 'contrasty', 'horizontal', 'vertical', 'speckle'] as const)[clamp(Math.round(p.extra ?? 0), 0, 7)], s) },
  mosaicTiles: { group: 'texture', run: (c, p, s) => mosaicTiles(c, p.radius * 4, Math.max(1, p.radius / 2), s) },
  patchwork: { group: 'texture', run: (c, p, s) => patchwork(c, p.radius * 3, p.amount / 10, s) },
  stainedGlass: { group: 'texture', run: (c, p, s) => stainedGlass(c, p.radius * 4, Math.max(1, p.amount / 30), s) },
  texturizer: { group: 'texture', run: (c, p, s) => texturizer(c, (['canvas', 'brick', 'burlap', 'sandstone'] as const)[clamp(Math.round(p.extra ?? 0), 0, 3)], p.radius * 25, p.amount / 10, s) },
}

export const extraFilterIds = Object.keys(extraFilters)
