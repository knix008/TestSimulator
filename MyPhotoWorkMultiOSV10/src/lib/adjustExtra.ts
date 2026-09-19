import { clamp, hexToRgb, rgbToHsl, hslToRgb } from './color'
import { cloneCanvas, context2d, createCanvas } from './canvas'
import { gaussianBlur } from './filters'
import { pointInSelection, selectionToMask } from './selection'
import type { BlendMode, Selection } from './types'

/**
 * The Image ▸ Adjustments entries the first release lacked, and the two
 * Image-menu commands that combine pictures (Apply Image, Calculations).
 */

/* ------------------------------------------------------------ colour LUT */

/** A 3D colour lookup table, `size` samples per axis, RGB in 0..1. */
export type ColorLut = { name: string; size: number; table: Float32Array }

/** Parses an Adobe/IRIDAS .cube file (1D tables are expanded to 3D). */
export function parseCube(text: string, name = 'LUT'): ColorLut {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  let size = 0
  let oneD = 0
  let title = name
  const values: number[] = []
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^"|"$/g, '') || name
      continue
    }
    if (upper.startsWith('LUT_3D_SIZE')) { size = Number(line.split(/\s+/)[1]); continue }
    if (upper.startsWith('LUT_1D_SIZE')) { oneD = Number(line.split(/\s+/)[1]); continue }
    if (upper.startsWith('DOMAIN_') || upper.startsWith('LUT_')) continue
    const parts = line.split(/\s+/).map(Number)
    if (parts.length >= 3 && parts.every((v) => Number.isFinite(v))) values.push(parts[0], parts[1], parts[2])
  }
  if (oneD && !size) {
    // A 1D table maps each channel on its own; sample it into a small cube.
    const n = 17
    const table = new Float32Array(n * n * n * 3)
    const lookup = (v: number, channel: number) => {
      const p = clamp(v, 0, 1) * (oneD - 1)
      const i = Math.floor(p)
      const t = p - i
      const a = values[i * 3 + channel] ?? 0
      const b = values[Math.min(oneD - 1, i + 1) * 3 + channel] ?? a
      return a + (b - a) * t
    }
    for (let b = 0; b < n; b += 1) for (let g = 0; g < n; g += 1) for (let r = 0; r < n; r += 1) {
      const o = ((b * n + g) * n + r) * 3
      table[o] = lookup(r / (n - 1), 0)
      table[o + 1] = lookup(g / (n - 1), 1)
      table[o + 2] = lookup(b / (n - 1), 2)
    }
    return { name: title, size: n, table }
  }
  if (!size || values.length < size * size * size * 3) {
    throw new Error('Not a usable .cube file')
  }
  return { name: title, size, table: Float32Array.from(values.slice(0, size * size * size * 3)) }
}

/** Builds a LUT from a per-pixel function, for the built-in looks. */
export function lutFromFunction(name: string, fn: (r: number, g: number, b: number) => [number, number, number], size = 17): ColorLut {
  const table = new Float32Array(size * size * size * 3)
  for (let b = 0; b < size; b += 1) for (let g = 0; g < size; g += 1) for (let r = 0; r < size; r += 1) {
    const [rr, gg, bb] = fn(r / (size - 1), g / (size - 1), b / (size - 1))
    const o = ((b * size + g) * size + r) * 3
    table[o] = clamp(rr, 0, 1); table[o + 1] = clamp(gg, 0, 1); table[o + 2] = clamp(bb, 0, 1)
  }
  return { name, size, table }
}

const lift = (v: number, k: number) => Math.pow(v, 1 / (1 + k))

/** The looks offered without a file, in the spirit of Photoshop's presets. */
export const builtInLuts: Record<string, () => ColorLut> = {
  filmstock: () => lutFromFunction('Filmstock', (r, g, b) => [lift(r, 0.1) * 0.95 + 0.03, g * 0.93 + 0.02, b * 0.85 + 0.06]),
  crispWarm: () => lutFromFunction('Crisp Warm', (r, g, b) => [(r - 0.5) * 1.15 + 0.5 + 0.04, (g - 0.5) * 1.15 + 0.5, (b - 0.5) * 1.15 + 0.5 - 0.05]),
  crispWinter: () => lutFromFunction('Crisp Winter', (r, g, b) => [(r - 0.5) * 1.1 + 0.5 - 0.04, (g - 0.5) * 1.1 + 0.5, (b - 0.5) * 1.1 + 0.5 + 0.06]),
  fadedFilm: () => lutFromFunction('Faded Film', (r, g, b) => [r * 0.8 + 0.1, g * 0.8 + 0.1, b * 0.8 + 0.12]),
  fujiEterna: () => lutFromFunction('Cinema Green', (r, g, b) => [r * 0.9 + 0.02, g * 0.95 + 0.04, b * 0.88 + 0.03]),
  kodakFilm: () => lutFromFunction('Warm Print', (r, g, b) => [lift(r, 0.15), lift(g, 0.05), b * 0.9]),
  teal: () => lutFromFunction('Teal & Orange', (r, g, b) => {
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    return l > 0.5 ? [r + (l - 0.5) * 0.3, g, b - (l - 0.5) * 0.2] : [r - (0.5 - l) * 0.2, g + (0.5 - l) * 0.05, b + (0.5 - l) * 0.3]
  }),
  mono: () => lutFromFunction('Monochrome', (r, g, b) => { const l = 0.299 * r + 0.587 * g + 0.114 * b; return [l, l, l] }),
  sepia: () => lutFromFunction('Sepia', (r, g, b) => { const l = 0.299 * r + 0.587 * g + 0.114 * b; return [l * 1.07 + 0.05, l * 0.94 + 0.02, l * 0.78] }),
  negative: () => lutFromFunction('Negative', (r, g, b) => [1 - r, 1 - g, 1 - b]),
}

/** Trilinear lookup into the cube. */
export function applyLut(canvas: HTMLCanvasElement, lut: ColorLut, selection: Selection | null, strength = 1) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  const n = lut.size
  const t = lut.table
  const sample = (ri: number, gi: number, bi: number, c: number) => t[((bi * n + gi) * n + ri) * 3 + c]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      const rp = (image.data[i] / 255) * (n - 1)
      const gp = (image.data[i + 1] / 255) * (n - 1)
      const bp = (image.data[i + 2] / 255) * (n - 1)
      const r0 = Math.floor(rp); const g0 = Math.floor(gp); const b0 = Math.floor(bp)
      const r1 = Math.min(n - 1, r0 + 1); const g1 = Math.min(n - 1, g0 + 1); const b1 = Math.min(n - 1, b0 + 1)
      const fr = rp - r0; const fg = gp - g0; const fb = bp - b0
      for (let c = 0; c < 3; c += 1) {
        const c00 = sample(r0, g0, b0, c) * (1 - fr) + sample(r1, g0, b0, c) * fr
        const c10 = sample(r0, g1, b0, c) * (1 - fr) + sample(r1, g1, b0, c) * fr
        const c01 = sample(r0, g0, b1, c) * (1 - fr) + sample(r1, g0, b1, c) * fr
        const c11 = sample(r0, g1, b1, c) * (1 - fr) + sample(r1, g1, b1, c) * fr
        const value = ((c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb) * 255
        image.data[i + c] = clamp(image.data[i + c] * (1 - strength) + value * strength, 0, 255)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------------ HDR toning */

/**
 * HDR Toning: a local tone map. Each pixel's brightness is compared with a
 * blurred copy of the picture; the difference is detail, which is boosted,
 * while the blurred base is compressed towards the middle.
 */
export function hdrToning(canvas: HTMLCanvasElement, options: { radius: number; strength: number; detail: number; gamma: number; saturation: number }, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const base = cloneCanvas(canvas)
  gaussianBlur(base, Math.max(1, options.radius), null)
  const blurred = context2d(base).getImageData(0, 0, canvas.width, canvas.height).data
  const { width, height } = canvas
  const strength = clamp(options.strength, 0, 1)
  const detail = 1 + options.detail / 100
  const gamma = 1 / Math.max(0.1, options.gamma)
  const sat = 1 + options.saturation / 100
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      const l = (0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]) / 255
      const lb = (0.299 * blurred[i] + 0.587 * blurred[i + 1] + 0.114 * blurred[i + 2]) / 255
      const compressed = lb * (1 - strength) + Math.pow(lb, 0.5) * strength * 0.85 + strength * 0.05
      const mapped = clamp(Math.pow(clamp(compressed + (l - lb) * detail, 0, 1), gamma), 0, 1)
      const gain = l > 0.002 ? mapped / l : 1
      for (let c = 0; c < 3; c += 1) {
        const v = image.data[i + c] * gain
        const grey = mapped * 255
        image.data[i + c] = clamp(grey + (v - grey) * sat, 0, 255)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ----------------------------------------------------------- match colour */

function stats(data: Uint8ClampedArray, mask: Uint8Array | null) {
  const mean = [0, 0, 0]
  const sq = [0, 0, 0]
  let n = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    if (mask && !mask[p]) continue
    if (data[i + 3] < 8) continue
    for (let c = 0; c < 3; c += 1) { mean[c] += data[i + c]; sq[c] += data[i + c] * data[i + c] }
    n += 1
  }
  if (!n) return { mean: [128, 128, 128], sd: [1, 1, 1] }
  const sd = mean.map((m, c) => Math.sqrt(Math.max(1, sq[c] / n - (m / n) ** 2)))
  return { mean: mean.map((m) => m / n), sd }
}

/**
 * Match Color: the target takes on the source's colour statistics — each
 * channel is shifted and scaled so its mean and spread agree, blended in by
 * `fade`, with luminance and intensity adjustments on top.
 */
export function matchColor(target: HTMLCanvasElement, source: HTMLCanvasElement, options: { luminance: number; intensity: number; fade: number; neutralize: boolean }, selection: Selection | null) {
  const ctx = context2d(target)
  const image = ctx.getImageData(0, 0, target.width, target.height)
  const from = stats(image.data, selectionToMask(selection, target.width, target.height))
  const to = stats(context2d(source).getImageData(0, 0, source.width, source.height).data, null)
  const blend = 1 - clamp(options.fade, 0, 100) / 100
  const lum = options.luminance / 100
  const intensity = options.intensity / 100
  const { width, height } = target
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      let r = (image.data[i] - from.mean[0]) * (to.sd[0] / from.sd[0]) + to.mean[0]
      let g = (image.data[i + 1] - from.mean[1]) * (to.sd[1] / from.sd[1]) + to.mean[1]
      let b = (image.data[i + 2] - from.mean[2]) * (to.sd[2] / from.sd[2]) + to.mean[2]
      if (options.neutralize) {
        // Pull the cast out: the matched mean is moved to grey.
        const avg = (to.mean[0] + to.mean[1] + to.mean[2]) / 3
        r += avg - to.mean[0]; g += avg - to.mean[1]; b += avg - to.mean[2]
      }
      const l = 0.299 * r + 0.587 * g + 0.114 * b
      r = l + (r - l) * intensity; g = l + (g - l) * intensity; b = l + (b - l) * intensity
      r *= lum; g *= lum; b *= lum
      image.data[i] = clamp(image.data[i] * (1 - blend) + r * blend, 0, 255)
      image.data[i + 1] = clamp(image.data[i + 1] * (1 - blend) + g * blend, 0, 255)
      image.data[i + 2] = clamp(image.data[i + 2] * (1 - blend) + b * blend, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------- auto commands */

export function desaturate(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      // Photoshop's Desaturate keeps lightness (HSL), not luminance.
      const l = (Math.max(image.data[i], image.data[i + 1], image.data[i + 2]) + Math.min(image.data[i], image.data[i + 1], image.data[i + 2])) / 2
      image.data[i] = l; image.data[i + 1] = l; image.data[i + 2] = l
    }
  }
  ctx.putImageData(image, 0, 0)
}

function channelBounds(data: Uint8ClampedArray, channels: number[], clip = 0.001) {
  const hist = new Uint32Array(256)
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue
    let v = 0
    for (const c of channels) v += data[i + c]
    hist[Math.round(v / channels.length)] += 1
    n += 1
  }
  let low = 0
  let acc = 0
  while (low < 255 && acc + hist[low] < n * clip) { acc += hist[low]; low += 1 }
  let high = 255
  acc = 0
  while (high > 0 && acc + hist[high] < n * clip) { acc += hist[high]; high -= 1 }
  return { low, high: Math.max(low + 1, high) }
}

/** Auto Contrast: one stretch for all channels, so the colour balance is kept. */
export function autoContrast(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { low, high } = channelBounds(image.data, [0, 1, 2])
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c += 1) image.data[i + c] = clamp(((image.data[i + c] - low) / (high - low)) * 255, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Auto Tone: each channel stretched on its own, the way Auto Levels does. */
export function autoTone(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = [0, 1, 2].map((c) => channelBounds(image.data, [c]))
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c += 1) {
        const { low, high } = bounds[c]
        image.data[i + c] = clamp(((image.data[i + c] - low) / (high - low)) * 255, 0, 255)
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* --------------------------------------------------------- rotation */

/** Rotates a canvas by any angle, growing it so nothing is cut off. */
export function rotateArbitrary(source: HTMLCanvasElement, degrees: number, targetWidth?: number, targetHeight?: number) {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const width = targetWidth ?? Math.ceil(source.width * cos + source.height * sin)
  const height = targetHeight ?? Math.ceil(source.width * sin + source.height * cos)
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rad)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/** The size a rotated document becomes. */
export function rotatedSize(width: number, height: number, degrees: number) {
  const rad = (degrees * Math.PI) / 180
  return {
    width: Math.ceil(width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad))),
    height: Math.ceil(width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad))),
  }
}

/* ------------------------------------------------- apply image / calculations */

/** Apply Image: another layer blended onto this one at an opacity. */
export function applyImage(target: HTMLCanvasElement, source: HTMLCanvasElement, blend: BlendMode, opacity: number, invert: boolean, selection: Selection | null) {
  const paint = createCanvas(target.width, target.height)
  const pctx = context2d(paint)
  pctx.drawImage(source, 0, 0)
  if (invert) {
    const image = pctx.getImageData(0, 0, paint.width, paint.height)
    for (let i = 0; i < image.data.length; i += 4) {
      image.data[i] = 255 - image.data[i]
      image.data[i + 1] = 255 - image.data[i + 1]
      image.data[i + 2] = 255 - image.data[i + 2]
    }
    pctx.putImageData(image, 0, 0)
  }
  const mask = selectionToMask(selection, target.width, target.height)
  if (mask) {
    const image = pctx.getImageData(0, 0, paint.width, paint.height)
    for (let p = 0; p < mask.length; p += 1) if (!mask[p]) image.data[p * 4 + 3] = 0
    pctx.putImageData(image, 0, 0)
  }
  const ctx = context2d(target)
  ctx.save()
  ctx.globalAlpha = clamp(opacity, 0, 1)
  ctx.globalCompositeOperation = blend as GlobalCompositeOperation
  ctx.drawImage(paint, 0, 0)
  ctx.restore()
}

export type ChannelPick = 'r' | 'g' | 'b' | 'luma' | 'a'

function readChannel(canvas: HTMLCanvasElement, channel: ChannelPick) {
  const data = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data
  const out = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    out[p] = channel === 'r' ? data[i]
      : channel === 'g' ? data[i + 1]
        : channel === 'b' ? data[i + 2]
          : channel === 'a' ? data[i + 3]
            : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return out
}

/**
 * Calculations: two channels combined into a grey result, which becomes a
 * new selection or a new alpha channel.
 */
export function calculations(a: HTMLCanvasElement, channelA: ChannelPick, b: HTMLCanvasElement, channelB: ChannelPick, blend: BlendMode, opacity: number, invertA = false, invertB = false) {
  const width = Math.min(a.width, b.width)
  const height = Math.min(a.height, b.height)
  const ca = readChannel(a, channelA)
  const cb = readChannel(b, channelB)
  const out = new Uint8Array(width * height)
  const k = clamp(opacity, 0, 1)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let va = ca[y * a.width + x] / 255
      let vb = cb[y * b.width + x] / 255
      if (invertA) va = 1 - va
      if (invertB) vb = 1 - vb
      let v: number
      switch (blend) {
        case 'multiply': v = va * vb; break
        case 'screen': v = 1 - (1 - va) * (1 - vb); break
        case 'darken': v = Math.min(va, vb); break
        case 'lighten': v = Math.max(va, vb); break
        case 'difference': v = Math.abs(va - vb); break
        case 'overlay': v = va < 0.5 ? 2 * va * vb : 1 - 2 * (1 - va) * (1 - vb); break
        case 'lighter': v = Math.min(1, va + vb); break
        case 'exclusion': v = va + vb - 2 * va * vb; break
        default: v = vb
      }
      out[y * width + x] = Math.round(clamp(va * (1 - k) + v * k, 0, 1) * 255)
    }
  }
  return { mask: out, width, height }
}

/* ----------------------------------------------------------- fade */

/** Fade: the last edit blended back towards what was there before it. */
export function fadeTo(current: HTMLCanvasElement, previous: HTMLCanvasElement, opacity: number, blend: BlendMode) {
  const result = createCanvas(current.width, current.height)
  const ctx = context2d(result)
  ctx.drawImage(previous, 0, 0)
  ctx.globalAlpha = clamp(opacity, 0, 1)
  ctx.globalCompositeOperation = blend as GlobalCompositeOperation
  ctx.drawImage(current, 0, 0)
  const target = context2d(current)
  target.globalCompositeOperation = 'copy'
  target.drawImage(result, 0, 0)
  target.globalCompositeOperation = 'source-over'
}

/* --------------------------------------------- variations / colour helpers */

/** Nudges the picture towards a colour, as the old Variations dialog did. */
export function tintTowards(canvas: HTMLCanvasElement, color: string, amount: number, selection: Selection | null) {
  const rgb = hexToRgb(color)
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  const k = clamp(amount, 0, 1)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      image.data[i] = clamp(image.data[i] + (rgb.r - 128) * k, 0, 255)
      image.data[i + 1] = clamp(image.data[i + 1] + (rgb.g - 128) * k, 0, 255)
      image.data[i + 2] = clamp(image.data[i + 2] + (rgb.b - 128) * k, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Rotates hue for every pixel, kept here for the colour tools that want it. */
export function shiftHue(canvas: HTMLCanvasElement, degrees: number, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pointInSelection(selection, x, y, width, height)) continue
      const i = (y * width + x) * 4
      const hsl = rgbToHsl(image.data[i], image.data[i + 1], image.data[i + 2])
      const rgb = hslToRgb((hsl.h + degrees + 360) % 360, hsl.s, hsl.l)
      image.data[i] = rgb.r; image.data[i + 1] = rgb.g; image.data[i + 2] = rgb.b
    }
  }
  ctx.putImageData(image, 0, 0)
}
