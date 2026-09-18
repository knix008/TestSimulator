import { context2d } from './canvas'
import { pointInSelection } from './selection'
import type { Selection } from './types'

/**
 * The filters that move pixels rather than recolour them.
 *
 * Every one of them is the same shape: for each pixel in the destination, work
 * out where in the *source* it should come from, and sample there. Going that
 * way round — backwards, not forwards — is what stops the result being full of
 * holes, because every destination pixel is written exactly once.
 */

type Remap = (x: number, y: number) => { x: number; y: number }

/** Reads the source at a fractional position, blending the four pixels round it. */
function sampleBilinear(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Uint8ClampedArray, at: number) {
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

/** Runs one backward mapping over the selected pixels. */
function remap(canvas: HTMLCanvasElement, selection: Selection | null, fn: Remap) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const from = fn(x, y)
      sampleBilinear(source, width, height, from.x, from.y, image.data, (y * width + x) * 4)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** The circle the radial filters work inside: centred, touching the short side. */
function field(canvas: HTMLCanvasElement) {
  return {
    cx: canvas.width / 2,
    cy: canvas.height / 2,
    radius: Math.min(canvas.width, canvas.height) / 2,
  }
}

/** Twists the image around its centre, full strength in the middle. */
export function twirl(canvas: HTMLCanvasElement, degrees: number, selection: Selection | null) {
  const { cx, cy, radius } = field(canvas)
  const turn = (degrees * Math.PI) / 180
  remap(canvas, selection, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const distance = Math.hypot(dx, dy)
    if (distance > radius) {
      return { x, y }
    }
    const angle = Math.atan2(dy, dx) - turn * (1 - distance / radius)
    return { x: cx + Math.cos(angle) * distance, y: cy + Math.sin(angle) * distance }
  })
}

/** Short, irregular waves, the way a reflection breaks up on moving water. */
export function ripple(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  const wavelength = Math.max(2, canvas.height / 20)
  remap(canvas, selection, (x, y) => ({
    x: x + Math.sin(y / wavelength) * amount,
    y: y + Math.sin(x / wavelength) * amount * 0.5,
  }))
}

/** One long sine on each axis, which is the difference from Ripple. */
export function wave(canvas: HTMLCanvasElement, amplitude: number, wavelength: number, selection: Selection | null) {
  const period = Math.max(2, wavelength)
  remap(canvas, selection, (x, y) => ({
    x: x + Math.sin((y / period) * Math.PI * 2) * amplitude,
    y: y + Math.cos((x / period) * Math.PI * 2) * amplitude,
  }))
}

/**
 * Bends the image over a sphere. A positive amount bulges it towards the
 * viewer; a negative one is the same lens turned round, which is Pinch.
 */
export function spherize(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  const { cx, cy, radius } = field(canvas)
  const strength = amount / 100
  remap(canvas, selection, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const distance = Math.hypot(dx, dy)
    if (distance > radius || distance === 0) {
      return { x, y }
    }
    const normalised = distance / radius
    // sin() eases the displacement off to nothing at the rim, so the sphere
    // meets the flat image without a visible seam.
    const scale = 1 - strength * Math.sin(normalised * Math.PI / 2) * (1 - normalised)
    return { x: cx + dx * scale, y: cy + dy * scale }
  })
}

export function pinch(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  spherize(canvas, -amount, selection)
}

/**
 * Smears the image along circles round the centre (spin) or along the lines
 * leaving it (zoom), by averaging a handful of steps along that path.
 */
export function radialBlur(canvas: HTMLCanvasElement, amount: number, kind: 'spin' | 'zoom', selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const source = new Uint8ClampedArray(image.data)
  const { width, height } = canvas
  const cx = width / 2
  const cy = height / 2
  const steps = Math.max(2, Math.min(24, Math.round(amount)))
  const sample = new Uint8ClampedArray(4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) {
        continue
      }
      const dx = x - cx
      const dy = y - cy
      const distance = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let step = 0; step < steps; step += 1) {
        const t = step / steps
        const turn = angle + (amount / 600) * t
        const scale = 1 - (amount / 400) * t
        const sx = kind === 'spin' ? cx + Math.cos(turn) * distance : cx + dx * scale
        const sy = kind === 'spin' ? cy + Math.sin(turn) * distance : cy + dy * scale
        sampleBilinear(source, width, height, sx, sy, sample, 0)
        r += sample[0]
        g += sample[1]
        b += sample[2]
        a += sample[3]
      }
      const at = (y * width + x) * 4
      image.data[at] = r / steps
      image.data[at + 1] = g / steps
      image.data[at + 2] = b / steps
      image.data[at + 3] = a / steps
    }
  }
  ctx.putImageData(image, 0, 0)
}
