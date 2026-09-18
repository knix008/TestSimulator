import { clamp } from './color'
import type { ChannelMix, ColorFamily, InkShift } from './types'

/**
 * The per-pixel maths behind the multi-setting colour operations.
 *
 * This module knows nothing about canvases or selections, which is what lets
 * both callers use it: `colorTools.ts` walks a selection with these, and
 * `adjustments.ts` runs them over a whole image for an adjustment *layer*.
 * Keeping the maths in one place is what stops the layer and the menu command
 * drifting apart.
 */

export type PixelFn = (r: number, g: number, b: number, a: number) => [number, number, number, number]

export const colorFamilies: ColorFamily[] = [
  'reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks',
]

export function defaultChannelMix(): ChannelMix {
  return {
    red: { r: 100, g: 0, b: 0, constant: 0 },
    green: { r: 0, g: 100, b: 0, constant: 0 },
    blue: { r: 0, g: 0, b: 100, constant: 0 },
  }
}

export function defaultInkShift(): InkShift {
  return { cyan: 0, magenta: 0, yellow: 0, black: 0 }
}

export function hexToChannels(hex: string) {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16) || 0,
    g: Number.parseInt(hex.slice(3, 5), 16) || 0,
    b: Number.parseInt(hex.slice(5, 7), 16) || 0,
  }
}

/* ------------------------------------------------------------ channel mixer */

export function channelMixerPixel(mix: ChannelMix): PixelFn {
  const row = (source: { r: number; g: number; b: number; constant: number }, r: number, g: number, b: number) => (
    (source.r * r + source.g * g + source.b * b) / 100 + source.constant * 2.55
  )
  return (r, g, b, a) => [
    clamp(row(mix.red, r, g, b), 0, 255),
    clamp(row(mix.green, r, g, b), 0, 255),
    clamp(row(mix.blue, r, g, b), 0, 255),
    a,
  ]
}

/* --------------------------------------------------------- selective colour */

/** How strongly a pixel belongs to one colour family, from 0 to 1. */
function membership(family: ColorFamily, r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = (max - min) / 255
  switch (family) {
    // The six hue families: strongest where that hue is purest.
    case 'reds': return chroma * Math.max(0, (r - Math.max(g, b)) / 255)
    case 'greens': return chroma * Math.max(0, (g - Math.max(r, b)) / 255)
    case 'blues': return chroma * Math.max(0, (b - Math.max(r, g)) / 255)
    case 'yellows': return chroma * Math.max(0, (Math.min(r, g) - b) / 255)
    case 'cyans': return chroma * Math.max(0, (Math.min(g, b) - r) / 255)
    case 'magentas': return chroma * Math.max(0, (Math.min(r, b) - g) / 255)
    // The three tonal families, which ignore hue entirely.
    case 'whites': return Math.max(0, (min - 128) / 127)
    case 'blacks': return Math.max(0, (128 - max) / 128)
    case 'neutrals': return Math.max(0, 1 - chroma * 3)
    default: return 0
  }
}

/**
 * Shifts the ink balance of one colour family. Working in CMY mirrors how the
 * control is meant to be read — take cyan out of the reds — and the result
 * comes back through the same inversion that took it there.
 */
export function selectiveColorPixel(family: ColorFamily, shift: InkShift): PixelFn {
  return (r, g, b, a) => {
    const weight = clamp(membership(family, r, g, b), 0, 1)
    if (weight <= 0) {
      return [r, g, b, a]
    }
    let c = 1 - r / 255
    let m = 1 - g / 255
    let y = 1 - b / 255
    const k = Math.min(c, m, y)
    const room = 1 - k
    c += (shift.cyan / 100) * weight * room
    m += (shift.magenta / 100) * weight * room
    y += (shift.yellow / 100) * weight * room
    const black = (shift.black / 100) * weight
    c += black * room
    m += black * room
    y += black * room
    return [
      clamp((1 - clamp(c, 0, 1)) * 255, 0, 255),
      clamp((1 - clamp(m, 0, 1)) * 255, 0, 255),
      clamp((1 - clamp(y, 0, 1)) * 255, 0, 255),
      a,
    ]
  }
}

/* ------------------------------------------------------------ gradient map */

/** Repaints from brightness alone, reading a two-stop gradient. */
export function gradientMapPixel(from: string, to: string): PixelFn {
  const start = hexToChannels(from)
  const end = hexToChannels(to)
  return (r, g, b, a) => {
    const t = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return [
      start.r + (end.r - start.r) * t,
      start.g + (end.g - start.g) * t,
      start.b + (end.b - start.b) * t,
      a,
    ]
  }
}

/* ---------------------------------------------------------------- equalize */

/**
 * The equalization table for one image: what every brightness level becomes
 * once the tones are spread evenly. Split out so an adjustment layer can build
 * the table from the pixels beneath it and then apply it.
 */
export function equalizeTable(data: Uint8ClampedArray) {
  const counts = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    counts[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])] += 1
    total += 1
  }
  const lut = new Uint8ClampedArray(256)
  if (!total) {
    for (let level = 0; level < 256; level += 1) lut[level] = level
    return lut
  }
  let running = 0
  for (let level = 0; level < 256; level += 1) {
    running += counts[level]
    lut[level] = (running / total) * 255
  }
  return lut
}

/** Applies an equalization table, moving brightness and keeping colour. */
export function equalizePixel(lut: Uint8ClampedArray): PixelFn {
  return (r, g, b, a) => {
    const before = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    const ratio = before === 0 ? 0 : lut[before] / before
    return [clamp(r * ratio, 0, 255), clamp(g * ratio, 0, 255), clamp(b * ratio, 0, 255), a]
  }
}
