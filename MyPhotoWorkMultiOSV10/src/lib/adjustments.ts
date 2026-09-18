import { clamp, hslToRgb, rgbToHsl } from './color'
import { context2d } from './canvas'
import {
  channelMixerPixel, defaultChannelMix, defaultInkShift, equalizePixel, equalizeTable,
  gradientMapPixel, selectiveColorPixel,
} from './colorMath'
import type { Adjustment } from './types'

export function mapImage(data: Uint8ClampedArray, fn: (r: number, g: number, b: number, a: number, i: number) => [number, number, number, number]) {
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = fn(data[i], data[i + 1], data[i + 2], data[i + 3], i)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

export function applyAdjustment(data: Uint8ClampedArray, adj: Adjustment) {
  // The operations with their own settings hand the work to colorMath, which
  // is the same code the Image menu's one-off commands run.
  if (adj.type === 'channelMixer') {
    mapImage(data, channelMixerPixel(adj.mix ?? defaultChannelMix()))
    return
  }
  if (adj.type === 'selectiveColor') {
    mapImage(data, selectiveColorPixel(adj.family ?? 'reds', adj.ink ?? defaultInkShift()))
    return
  }
  if (adj.type === 'gradientMap') {
    mapImage(data, gradientMapPixel(adj.mapFrom ?? '#000000', adj.mapTo ?? '#ffffff'))
    return
  }
  if (adj.type === 'equalize') {
    // The table is read off whatever is beneath the layer at this moment, so
    // the layer keeps up as the pixels under it change.
    mapImage(data, equalizePixel(equalizeTable(data)))
    return
  }
  if (adj.type === 'invert') {
    mapImage(data, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a])
    return
  }
  if (adj.type === 'threshold') {
    mapImage(data, (r, g, b, a) => {
      const v = luma(r, g, b) >= adj.threshold ? 255 : 0
      return [v, v, v, a]
    })
    return
  }
  if (adj.type === 'posterize') {
    const steps = Math.max(2, adj.posterize)
    const q = 255 / (steps - 1)
    mapImage(data, (r, g, b, a) => [
      Math.round(r / q) * q,
      Math.round(g / q) * q,
      Math.round(b / q) * q,
      a,
    ])
    return
  }
  if (adj.type === 'bw') {
    mapImage(data, (r, g, b, a) => {
      const v = luma(r, g, b)
      return [v, v, v, a]
    })
    return
  }

  const brightness = adj.brightness / 100
  const contrast = Math.max(0.01, (adj.contrast + 100) / 100)
  const exposure = Math.pow(2, adj.exposure / 100)
  const gamma = Math.max(0.1, adj.gamma)

  mapImage(data, (r, g, b, a) => {
    let rr = r
    let gg = g
    let bb = b
    rr = ((rr / 255 - 0.5) * contrast + 0.5 + brightness) * 255 * exposure
    gg = ((gg / 255 - 0.5) * contrast + 0.5 + brightness) * 255 * exposure
    bb = ((bb / 255 - 0.5) * contrast + 0.5 + brightness) * 255 * exposure
    rr = 255 * Math.pow(clamp(rr, 0, 255) / 255, 1 / gamma)
    gg = 255 * Math.pow(clamp(gg, 0, 255) / 255, 1 / gamma)
    bb = 255 * Math.pow(clamp(bb, 0, 255) / 255, 1 / gamma)

    rr += adj.highlights * 0.35 * (rr / 255) + adj.shadows * 0.35 * (1 - rr / 255) + adj.whites * 0.2 + adj.blacks * 0.15
    gg += adj.highlights * 0.35 * (gg / 255) + adj.shadows * 0.35 * (1 - gg / 255) + adj.whites * 0.2 + adj.blacks * 0.15
    bb += adj.highlights * 0.35 * (bb / 255) + adj.shadows * 0.35 * (1 - bb / 255) + adj.whites * 0.2 + adj.blacks * 0.15

    rr += adj.temperature * 0.4 - adj.tint * 0.15 + adj.red
    gg += adj.tint * 0.25 + adj.green
    bb += -adj.temperature * 0.4 + adj.blue

    const hsl = rgbToHsl(clamp(rr, 0, 255), clamp(gg, 0, 255), clamp(bb, 0, 255))
    const satBoost = adj.saturation / 100 + adj.vibrance / 150 * (1 - hsl.s)
    const next = hslToRgb(
      (hsl.h + adj.hue / 360 + 1) % 1,
      clamp(hsl.s + satBoost, 0, 1),
      clamp(hsl.l + adj.lightness / 100, 0, 1),
    )
    rr = next.r
    gg = next.g
    bb = next.b

    if (adj.type === 'photoFilter') {
      const den = adj.filterDensity
      const cr = Number.parseInt(adj.filterColor.slice(1, 3), 16)
      const cg = Number.parseInt(adj.filterColor.slice(3, 5), 16)
      const cb = Number.parseInt(adj.filterColor.slice(5, 7), 16)
      rr = rr * (1 - den) + cr * den
      gg = gg * (1 - den) + cg * den
      bb = bb * (1 - den) + cb * den
    }

    if (adj.clarity) {
      const v = luma(rr, gg, bb)
      const c = adj.clarity / 200
      rr += (rr - v) * c
      gg += (gg - v) * c
      bb += (bb - v) * c
    }
    if (adj.dehaze) {
      const d = adj.dehaze / 200
      rr = (rr - 180 * d) / (1 - d)
      gg = (gg - 180 * d) / (1 - d)
      bb = (bb - 180 * d) / (1 - d)
    }
    if (adj.grain) {
      const n = (Math.random() - 0.5) * adj.grain
      rr += n
      gg += n
      bb += n
    }
    return [clamp(rr, 0, 255), clamp(gg, 0, 255), clamp(bb, 0, 255), a]
  })
}

export function applyAdjustmentCanvas(canvas: HTMLCanvasElement, adj: Adjustment) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  applyAdjustment(image.data, adj)
  ctx.putImageData(image, 0, 0)
}

export function levelsStretch(canvas: HTMLCanvasElement) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let min = 255
  let max = 0
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = Math.max(1, max - min)
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = clamp((image.data[i] - min) * 255 / span, 0, 255)
    image.data[i + 1] = clamp((image.data[i + 1] - min) * 255 / span, 0, 255)
    image.data[i + 2] = clamp((image.data[i + 2] - min) * 255 / span, 0, 255)
  }
  ctx.putImageData(image, 0, 0)
}
