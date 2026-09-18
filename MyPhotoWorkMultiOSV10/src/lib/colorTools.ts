import { clamp } from './color'
import { context2d } from './canvas'
import { pointInSelection } from './selection'
import {
  channelMixerPixel, gradientMapPixel, hexToChannels, selectiveColorPixel, type PixelFn,
} from './colorMath'
import type { ChannelMix, ColorFamily, InkShift, Selection } from './types'

export type { ChannelMix, ColorFamily, InkShift } from './types'
export {
  channelMixerPixel, colorFamilies, defaultChannelMix, defaultInkShift, equalizePixel,
  equalizeTable, gradientMapPixel, selectiveColorPixel, type PixelFn,
} from './colorMath'

/**
 * The colour operations that take more than one setting, applied to a canvas
 * through a selection. The maths itself lives in `colorMath.ts`, which has no
 * canvas of its own, so the adjustment *layers* can run exactly the same code
 * over a whole image.
 */

function overSelection(canvas: HTMLCanvasElement, selection: Selection | null, fn: PixelFn) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) {
        continue
      }
      const i = (y * canvas.width + x) * 4
      const [r, g, b, a] = fn(data[i], data[i + 1], data[i + 2], data[i + 3])
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------ the canvas-side wrappers */

export function channelMixer(canvas: HTMLCanvasElement, mix: ChannelMix, selection: Selection | null) {
  overSelection(canvas, selection, channelMixerPixel(mix))
}

export function selectiveColor(canvas: HTMLCanvasElement, family: ColorFamily, shift: InkShift, selection: Selection | null) {
  overSelection(canvas, selection, selectiveColorPixel(family, shift))
}

export function gradientMap(canvas: HTMLCanvasElement, from: string, to: string, selection: Selection | null) {
  overSelection(canvas, selection, gradientMapPixel(from, to))
}

/* ---------------------------------------------------------- replace colour */

/**
 * Swaps one colour for another wherever it appears, fading out at the edge of
 * the tolerance so the replacement does not leave a hard rim behind.
 */
export function replaceColor(canvas: HTMLCanvasElement, from: { r: number; g: number; b: number }, to: string, tolerance: number, selection: Selection | null) {
  const target = hexToChannels(to)
  const limit = Math.max(1, tolerance)
  overSelection(canvas, selection, (r, g, b, a) => {
    const distance = Math.max(Math.abs(r - from.r), Math.abs(g - from.g), Math.abs(b - from.b))
    if (distance > limit) {
      return [r, g, b, a]
    }
    // Full strength at the centre of the range, nothing at its edge.
    const strength = 1 - distance / limit
    return [
      r + (target.r - r) * strength,
      g + (target.g - g) * strength,
      b + (target.b - b) * strength,
      a,
    ]
  })
}

/* ---------------------------------------------------- automatic corrections */

/** Spreads the tones out so every brightness level is equally common. */
export function equalize(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  const counts = new Uint32Array(256)
  let total = 0
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) continue
      const i = (y * canvas.width + x) * 4
      counts[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])] += 1
      total += 1
    }
  }
  if (!total) {
    return
  }
  const lut = new Uint8ClampedArray(256)
  let running = 0
  for (let level = 0; level < 256; level += 1) {
    running += counts[level]
    lut[level] = (running / total) * 255
  }
  overSelection(canvas, selection, (r, g, b, a) => {
    const before = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    // Scaling by the ratio keeps the colour and moves only the brightness.
    const ratio = before === 0 ? 0 : lut[before] / before
    return [clamp(r * ratio, 0, 255), clamp(g * ratio, 0, 255), clamp(b * ratio, 0, 255), a]
  })
}

/**
 * Stretches each channel to the full range on its own, which is what pulls a
 * colour cast out of a photo — unlike Auto Levels, which moves all three
 * together and so keeps the cast.
 */
export function autoColor(canvas: HTMLCanvasElement) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  const low = [255, 255, 255]
  const high = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      if (data[i + c] < low[c]) low[c] = data[i + c]
      if (data[i + c] > high[c]) high[c] = data[i + c]
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c += 1) {
      const span = Math.max(1, high[c] - low[c])
      data[i + c] = clamp((data[i + c] - low[c]) * 255 / span, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}
