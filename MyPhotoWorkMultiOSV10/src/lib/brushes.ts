import { clamp, hexToRgb, rgbToHex } from './color'
import { context2d, createCanvas } from './canvas'
import { gaussianBlur } from './filters'
import { clipCanvasToSelection, floodFillMask, selectionToMask } from './selection'
import { paintStroke, type BrushShape } from './tools'
import { homography, invert3 } from './warp'
import { tileOnto } from './patterns'
import type { Point, Selection } from './types'

/**
 * The brush-family tools that need more than a coloured dab: the ones that
 * read from somewhere else (a history state, a pattern, a clone source), the
 * one that mixes what it touches, and the Liquify brush.
 *
 * Each works the same way: a stroke mask is painted with the ordinary brush
 * engine, so every tool here inherits size, hardness, spacing, angle,
 * roundness and scatter for free, and then the mask decides where the tool's
 * own pixels land.
 */

/** A white stroke on a clear canvas: where the dab reaches, and how strongly. */
export function strokeMask(width: number, height: number, from: Point, to: Point, size: number, hardness: number, shape?: BrushShape) {
  const mask = createCanvas(width, height)
  paintStroke(mask, from, to, { size, hardness, color: '#ffffff', opacity: 1, selection: null, shape })
  return mask
}

/** Draws `source` onto `layer` only where the stroke mask is, at `opacity`. */
function stampThrough(layer: HTMLCanvasElement, source: HTMLCanvasElement, mask: HTMLCanvasElement, opacity: number, selection: Selection | null, mode: GlobalCompositeOperation = 'source-over') {
  const cut = createCanvas(layer.width, layer.height)
  const ctx = context2d(cut)
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(mask, 0, 0)
  clipCanvasToSelection(cut, selection)
  const target = context2d(layer)
  target.save()
  target.globalAlpha = clamp(opacity, 0, 1)
  target.globalCompositeOperation = mode
  target.drawImage(cut, 0, 0)
  target.restore()
}

/* --------------------------------------------------------------- mixer */

/** What the mixer brush is carrying: the paint on the tip right now. */
export type MixerReservoir = { r: number; g: number; b: number; loaded: boolean }

export function loadMixer(color: string): MixerReservoir {
  const rgb = hexToRgb(color)
  return { ...rgb, loaded: true }
}

/** The average colour under a disc, ignoring transparent pixels. */
export function averageUnder(canvas: HTMLCanvasElement, at: Point, radius: number) {
  const ctx = context2d(canvas)
  const x0 = clamp(Math.floor(at.x - radius), 0, canvas.width - 1)
  const y0 = clamp(Math.floor(at.y - radius), 0, canvas.height - 1)
  const w = clamp(Math.ceil(radius * 2), 1, canvas.width - x0)
  const h = clamp(Math.ceil(radius * 2), 1, canvas.height - y0)
  const data = ctx.getImageData(x0, y0, w, h).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (Math.hypot(x0 + x - at.x, y0 + y - at.y) > radius) continue
      const i = (y * w + x) * 4
      if (data[i + 3] < 8) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
  }
  return n ? { r: r / n, g: g / n, b: b / n, n } : null
}

/**
 * One mixer-brush dab. `wet` is how much of the canvas the tip picks up each
 * dab, `mix` how much of what it lays down is the reservoir rather than the
 * paint already there, and `flow` the opacity of the stroke itself. The
 * reservoir is mutated so the next dab carries the colour on.
 */
export function mixerDab(
  layer: HTMLCanvasElement,
  reservoir: MixerReservoir,
  from: Point,
  to: Point,
  options: { size: number; hardness: number; wet: number; mix: number; flow: number; selection: Selection | null; shape?: BrushShape },
) {
  const under = averageUnder(layer, to, options.size / 2)
  if (under) {
    // Pick up: the tip takes on the colour it touches.
    const k = clamp(options.wet, 0, 1)
    reservoir.r = reservoir.r * (1 - k) + under.r * k
    reservoir.g = reservoir.g * (1 - k) + under.g * k
    reservoir.b = reservoir.b * (1 - k) + under.b * k
  }
  // Lay down: what lands is the reservoir blended with what is there.
  const laid = under
    ? {
      r: under.r * (1 - options.mix) + reservoir.r * options.mix,
      g: under.g * (1 - options.mix) + reservoir.g * options.mix,
      b: under.b * (1 - options.mix) + reservoir.b * options.mix,
    }
    : reservoir
  paintStroke(layer, from, to, {
    size: options.size,
    hardness: options.hardness,
    color: rgbToHex(Math.round(laid.r), Math.round(laid.g), Math.round(laid.b)),
    opacity: clamp(options.flow, 0.02, 1),
    selection: options.selection,
    shape: options.shape,
  })
}

/* -------------------------------------------------------- history brush */

/** Paints the history source back through the stroke. */
export function historyBrushDab(
  layer: HTMLCanvasElement,
  source: HTMLCanvasElement,
  from: Point,
  to: Point,
  options: { size: number; hardness: number; opacity: number; selection: Selection | null; shape?: BrushShape },
) {
  const mask = strokeMask(layer.width, layer.height, from, to, options.size, options.hardness, options.shape)
  // Where the source is transparent the layer is cleared too, so a stroke
  // genuinely restores the state rather than only adding to it.
  const clear = createCanvas(layer.width, layer.height)
  const cctx = context2d(clear)
  cctx.drawImage(mask, 0, 0)
  const target = context2d(layer)
  target.save()
  target.globalAlpha = options.opacity
  target.globalCompositeOperation = 'destination-out'
  target.drawImage(clipCanvasToSelection(clear, options.selection), 0, 0)
  target.restore()
  stampThrough(layer, source, mask, options.opacity, options.selection)
}

/**
 * The art history brush: short stylised strokes in the colours of the source,
 * thrown around the pointer. `style` picks the stroke: 'dab' round spots,
 * 'tight' short lines along the local gradient, 'loose' longer curls.
 */
export function artHistoryDab(
  layer: HTMLCanvasElement,
  source: HTMLCanvasElement,
  at: Point,
  options: { size: number; opacity: number; style: 'dab' | 'tight' | 'loose'; selection: Selection | null; fidelity?: number },
) {
  const { width, height } = layer
  const sctx = context2d(source)
  const region = createCanvas(width, height)
  const rctx = context2d(region)
  const radius = Math.max(2, options.size / 2)
  const count = Math.max(3, Math.round(radius / 2))
  const fidelity = clamp(options.fidelity ?? 0.85, 0, 1)
  const data = sctx.getImageData(0, 0, width, height).data
  for (let n = 0; n < count; n += 1) {
    const angle = Math.random() * Math.PI * 2
    const dist = Math.sqrt(Math.random()) * radius
    const x = clamp(Math.round(at.x + Math.cos(angle) * dist), 0, width - 1)
    const y = clamp(Math.round(at.y + Math.sin(angle) * dist), 0, height - 1)
    const i = (y * width + x) * 4
    if (data[i + 3] < 8) continue
    const jitter = (1 - fidelity) * 40
    const r = clamp(data[i] + (Math.random() - 0.5) * jitter, 0, 255)
    const g = clamp(data[i + 1] + (Math.random() - 0.5) * jitter, 0, 255)
    const b = clamp(data[i + 2] + (Math.random() - 0.5) * jitter, 0, 255)
    rctx.strokeStyle = `rgb(${r | 0},${g | 0},${b | 0})`
    rctx.fillStyle = rctx.strokeStyle
    const dabSize = Math.max(1.5, radius / 5)
    if (options.style === 'dab') {
      rctx.beginPath()
      rctx.arc(x, y, dabSize, 0, Math.PI * 2)
      rctx.fill()
      continue
    }
    // Along the local gradient's tangent, so the strokes follow edges.
    const gx = data[Math.min(data.length - 4, i + 4)] - data[Math.max(0, i - 4)]
    const gy = data[Math.min(data.length - 4, i + width * 4)] - data[Math.max(0, i - width * 4)]
    const tangent = Math.atan2(gy, gx) + Math.PI / 2
    const length = options.style === 'tight' ? dabSize * 3 : dabSize * 7
    rctx.lineWidth = dabSize
    rctx.lineCap = 'round'
    rctx.beginPath()
    rctx.moveTo(x - Math.cos(tangent) * length / 2, y - Math.sin(tangent) * length / 2)
    if (options.style === 'loose') {
      rctx.quadraticCurveTo(x + Math.sin(tangent) * length / 2, y - Math.cos(tangent) * length / 2, x + Math.cos(tangent) * length / 2, y + Math.sin(tangent) * length / 2)
    } else {
      rctx.lineTo(x + Math.cos(tangent) * length / 2, y + Math.sin(tangent) * length / 2)
    }
    rctx.stroke()
  }
  clipCanvasToSelection(region, options.selection)
  const target = context2d(layer)
  target.save()
  target.globalAlpha = options.opacity
  target.drawImage(region, 0, 0)
  target.restore()
}

/* -------------------------------------------------------- pattern stamp */

export function patternStampDab(
  layer: HTMLCanvasElement,
  tile: HTMLCanvasElement,
  from: Point,
  to: Point,
  options: { size: number; hardness: number; opacity: number; selection: Selection | null; shape?: BrushShape; impressionist?: boolean },
) {
  const paint = createCanvas(layer.width, layer.height)
  tileOnto(paint, tile, null)
  if (options.impressionist) {
    gaussianBlur(paint, Math.max(1, options.size / 12), null)
  }
  const mask = strokeMask(layer.width, layer.height, from, to, options.size, options.hardness, options.shape)
  stampThrough(layer, paint, mask, options.opacity, options.selection)
}

/* -------------------------------------------------------- healing brush */

/**
 * The healing brush proper: texture from the clone source, colour and
 * brightness from where it lands. The source is shifted by the same offset
 * the clone stamp uses; its low frequencies are swapped for the destination's.
 */
export function healingBrushDab(
  layer: HTMLCanvasElement,
  from: Point,
  to: Point,
  source: Point,
  origin: Point,
  options: { size: number; hardness: number; opacity: number; selection: Selection | null; shape?: BrushShape },
) {
  const { width, height } = layer
  const offsetX = origin.x - source.x
  const offsetY = origin.y - source.y
  const mask = strokeMask(width, height, from, to, options.size, options.hardness, options.shape)
  // The clone as it would land — the pixel from `p - offset` under every
  // point `p` of the brush, as the clone stamp does — then split into detail
  // and tone.
  const clone = createCanvas(width, height)
  context2d(clone).drawImage(layer, offsetX, offsetY)
  const softRadius = Math.max(2, options.size / 4)
  const cloneLow = createCanvas(width, height)
  context2d(cloneLow).drawImage(clone, 0, 0)
  gaussianBlur(cloneLow, softRadius, null)
  // The destination's tone is read with the blemish already covered by the
  // clone, so what it contributes is the lighting around the stroke, not the
  // very thing being healed.
  const destLow = createCanvas(width, height)
  const dctx = context2d(destLow)
  dctx.drawImage(layer, 0, 0)
  const cover = createCanvas(width, height)
  const cctx = context2d(cover)
  cctx.drawImage(clone, 0, 0)
  cctx.globalCompositeOperation = 'destination-in'
  cctx.drawImage(mask, 0, 0)
  dctx.drawImage(cover, 0, 0)
  gaussianBlur(destLow, softRadius, null)

  const cd = context2d(clone).getImageData(0, 0, width, height)
  const cl = context2d(cloneLow).getImageData(0, 0, width, height).data
  const dl = context2d(destLow).getImageData(0, 0, width, height).data
  for (let i = 0; i < cd.data.length; i += 4) {
    if (cd.data[i + 3] === 0) continue
    cd.data[i] = clamp(cd.data[i] - cl[i] + dl[i], 0, 255)
    cd.data[i + 1] = clamp(cd.data[i + 1] - cl[i + 1] + dl[i + 1], 0, 255)
    cd.data[i + 2] = clamp(cd.data[i + 2] - cl[i + 2] + dl[i + 2], 0, 255)
  }
  const healed = createCanvas(width, height)
  context2d(healed).putImageData(cd, 0, 0)
  stampThrough(layer, healed, mask, options.opacity, options.selection)
}

/* ------------------------------------------------------ quick selection */

/**
 * One quick-selection dab: everything under the brush, grown outwards to the
 * pixels that look like it, within a reach of a few brush widths. Unioned
 * with `existing` (or subtracted from it when `subtract` is set).
 */
export function quickSelectDab(canvas: HTMLCanvasElement, at: Point, size: number, tolerance: number, existing: Uint8Array | null, subtract = false) {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const grown = floodFillMask(data, width, height, at, tolerance)
  const reach = Math.max(size, 8) * 3
  const radius = Math.max(1, size / 2)
  const out = existing ? new Uint8Array(existing) : new Uint8Array(width * height)
  const y0 = clamp(Math.floor(at.y - reach), 0, height - 1)
  const y1 = clamp(Math.ceil(at.y + reach), 0, height - 1)
  const x0 = clamp(Math.floor(at.x - reach), 0, width - 1)
  const x1 = clamp(Math.ceil(at.x + reach), 0, width - 1)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - at.x, y - at.y)
      const index = y * width + x
      const inside = d <= radius || (grown[index] > 0 && d <= reach)
      if (!inside) continue
      out[index] = subtract ? 0 : 255
    }
  }
  return out
}

/* --------------------------------------------------------------- liquify */

export type LiquifyMode = 'forward' | 'twirlCw' | 'twirlCcw' | 'pucker' | 'bloat' | 'reconstruct' | 'freeze' | 'thaw'

/**
 * One Liquify dab: pixels inside the brush are pulled from somewhere else in
 * the same picture. Every mode is a backward mapping — each destination pixel
 * asks where in the source it comes from — so nothing tears or leaves holes.
 * `frozen` is a byte per pixel: 255 holds a pixel still whatever the brush does.
 */
export function liquifyDab(
  canvas: HTMLCanvasElement,
  original: HTMLCanvasElement,
  from: Point,
  to: Point,
  options: { size: number; pressure: number; mode: LiquifyMode; frozen?: Uint8Array | null; selection?: Selection | null },
) {
  const { width, height } = canvas
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, width, height)
  const src = new Uint8ClampedArray(image.data)
  const orig = options.mode === 'reconstruct' ? context2d(original).getImageData(0, 0, width, height).data : null
  const radius = Math.max(2, options.size / 2)
  const pressure = clamp(options.pressure, 0, 1)
  const limit = selectionToMask(options.selection ?? null, width, height)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const y0 = clamp(Math.floor(to.y - radius), 0, height - 1)
  const y1 = clamp(Math.ceil(to.y + radius), 0, height - 1)
  const x0 = clamp(Math.floor(to.x - radius), 0, width - 1)
  const x1 = clamp(Math.ceil(to.x + radius), 0, width - 1)

  const read = (sx: number, sy: number, out: Uint8ClampedArray, at: number) => {
    const cx = clamp(sx, 0, width - 1)
    const cy = clamp(sy, 0, height - 1)
    const fx = Math.floor(cx)
    const fy = Math.floor(cy)
    const tx = cx - fx
    const ty = cy - fy
    const nx = Math.min(width - 1, fx + 1)
    const ny = Math.min(height - 1, fy + 1)
    for (let c = 0; c < 4; c += 1) {
      const a = src[(fy * width + fx) * 4 + c]
      const b = src[(fy * width + nx) * 4 + c]
      const cc = src[(ny * width + fx) * 4 + c]
      const d = src[(ny * width + nx) * 4 + c]
      out[at + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty
    }
  }

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const d = Math.hypot(x - to.x, y - to.y)
      if (d > radius) continue
      const index = y * width + x
      if (limit && !limit[index]) continue
      if (options.frozen && options.frozen[index] && options.mode !== 'thaw') continue
      // Smooth falloff, full strength at the centre.
      const t = 1 - d / radius
      const w = t * t * (3 - 2 * t) * pressure
      const at = index * 4
      let sx = x
      let sy = y
      switch (options.mode) {
        case 'forward':
          sx = x - dx * w
          sy = y - dy * w
          break
        case 'twirlCw':
        case 'twirlCcw': {
          const angle = (options.mode === 'twirlCw' ? 1 : -1) * w * 0.35
          const rx = x - to.x
          const ry = y - to.y
          sx = to.x + rx * Math.cos(angle) - ry * Math.sin(angle)
          sy = to.y + rx * Math.sin(angle) + ry * Math.cos(angle)
          break
        }
        case 'pucker':
          sx = to.x + (x - to.x) * (1 + w * 0.5)
          sy = to.y + (y - to.y) * (1 + w * 0.5)
          break
        case 'bloat':
          sx = to.x + (x - to.x) * (1 - w * 0.4)
          sy = to.y + (y - to.y) * (1 - w * 0.4)
          break
        case 'reconstruct':
          if (orig) {
            for (let c = 0; c < 4; c += 1) {
              image.data[at + c] = src[at + c] * (1 - w) + orig[at + c] * w
            }
          }
          continue
        case 'freeze':
          if (options.frozen) options.frozen[index] = Math.max(options.frozen[index], Math.round(w * 255))
          continue
        case 'thaw':
          if (options.frozen) options.frozen[index] = 0
          continue
      }
      read(sx, sy, image.data, at)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------ perspective clone */

/** A point through a 3x3 projective matrix. */
function project(m: number[], p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8]
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w }
}

/**
 * The clone stamp inside a Vanishing Point plane. The plane's four corners
 * map a unit square onto the picture; the source and the stroke are related
 * by a fixed offset in that square, not on the screen, so what is cloned
 * shrinks and leans with the plane as the stroke moves towards the horizon.
 * `origin` is where the stroke began (the point the source is aligned to).
 */
export function perspectiveCloneDab(
  layer: HTMLCanvasElement,
  to: Point,
  source: Point,
  origin: Point,
  plane: Point[],
  options: { size: number; hardness: number; opacity: number; selection: Selection | null },
) {
  const forward = homography(1, 1, plane)
  const inverse = forward ? invert3(forward) : null
  if (!forward || !inverse) return
  const sourceU = project(inverse, source)
  const originU = project(inverse, origin)
  const offset = { x: sourceU.x - originU.x, y: sourceU.y - originU.y }
  const radius = Math.max(1, options.size / 2)
  const x0 = Math.max(0, Math.floor(to.x - radius))
  const y0 = Math.max(0, Math.floor(to.y - radius))
  const x1 = Math.min(layer.width - 1, Math.ceil(to.x + radius))
  const y1 = Math.min(layer.height - 1, Math.ceil(to.y + radius))
  if (x1 <= x0 || y1 <= y0) return
  const ctx = context2d(layer)
  const whole = ctx.getImageData(0, 0, layer.width, layer.height)
  const data = whole.data
  const width = layer.width
  const sample = (x: number, y: number, out: number[]) => {
    const fx = Math.floor(x)
    const fy = Math.floor(y)
    if (fx < 0 || fy < 0 || fx >= width - 1 || fy >= layer.height - 1) { out[3] = 0; return }
    const tx = x - fx
    const ty = y - fy
    for (let c = 0; c < 4; c += 1) {
      const a = data[(fy * width + fx) * 4 + c]
      const b = data[(fy * width + fx + 1) * 4 + c]
      const d = data[((fy + 1) * width + fx) * 4 + c]
      const e = data[((fy + 1) * width + fx + 1) * 4 + c]
      out[c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty
    }
  }
  const stroke = createCanvas(layer.width, layer.height)
  const sctx = context2d(stroke)
  const patch = sctx.createImageData(x1 - x0 + 1, y1 - y0 + 1)
  const pixel = [0, 0, 0, 0]
  const hard = clamp(options.hardness, 0, 1)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const distance = Math.hypot(x + 0.5 - to.x, y + 0.5 - to.y) / radius
      if (distance > 1) continue
      // The same falloff as the round brush: solid to `hardness`, then fading.
      const cover = distance <= hard ? 1 : 1 - (distance - hard) / Math.max(1e-6, 1 - hard)
      const u = project(inverse, { x: x + 0.5, y: y + 0.5 })
      const s = project(forward, { x: u.x + offset.x, y: u.y + offset.y })
      sample(s.x, s.y, pixel)
      const i = ((y - y0) * patch.width + (x - x0)) * 4
      patch.data[i] = pixel[0]
      patch.data[i + 1] = pixel[1]
      patch.data[i + 2] = pixel[2]
      patch.data[i + 3] = pixel[3] * cover
    }
  }
  sctx.putImageData(patch, x0, y0)
  clipCanvasToSelection(stroke, options.selection)
  ctx.save()
  ctx.globalAlpha = clamp(options.opacity, 0, 1)
  ctx.drawImage(stroke, 0, 0)
  ctx.restore()
}
