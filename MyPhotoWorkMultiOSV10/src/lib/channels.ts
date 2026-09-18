import { context2d, createCanvas } from './canvas'
import { emptyMask, maskBounds, selectionToMask } from './selection'
import type { AlphaChannel, Selection } from './types'

/**
 * Channels: the three colour ones a document always has, and the alpha
 * channels a saved selection becomes.
 *
 * A saved selection is stored as a plain byte-per-pixel mask, the same shape a
 * live selection uses, so loading one back is a copy rather than a conversion.
 */

export type ColorChannel = 'r' | 'g' | 'b' | 'a' | 'luma'

const offsets: Record<Exclude<ColorChannel, 'luma'>, number> = { r: 0, g: 1, b: 2, a: 3 }

/** One channel on its own, as a grey picture — what a channels palette shows. */
export function channelCanvas(source: HTMLCanvasElement, channel: ColorChannel) {
  const { width, height } = source
  const data = context2d(source).getImageData(0, 0, width, height).data
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4
    const value = channel === 'luma'
      ? 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
      : data[p + offsets[channel]]
    image.data[p] = value
    image.data[p + 1] = value
    image.data[p + 2] = value
    image.data[p + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Writes a grey picture back into one channel, leaving the others alone. */
export function writeChannel(target: HTMLCanvasElement, channel: Exclude<ColorChannel, 'luma'>, grey: HTMLCanvasElement) {
  const { width, height } = target
  const ctx = context2d(target)
  const image = ctx.getImageData(0, 0, width, height)
  const source = context2d(grey).getImageData(0, 0, width, height).data
  for (let i = 0; i < width * height; i += 1) {
    image.data[i * 4 + offsets[channel]] = source[i * 4]
  }
  ctx.putImageData(image, 0, 0)
}

/** The image with some colour channels switched off, for looking at one of them. */
export function channelView(source: HTMLCanvasElement, show: { r: boolean; g: boolean; b: boolean }) {
  const { width, height } = source
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = context2d(source).getImageData(0, 0, width, height)
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4
    if (!show.r) image.data[p] = 0
    if (!show.g) image.data[p + 1] = 0
    if (!show.b) image.data[p + 2] = 0
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/* ----------------------------------------------------------- alpha channels */

export function maskToGreyCanvas(mask: Uint8Array, width: number, height: number) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    image.data[i * 4] = mask[i]
    image.data[i * 4 + 1] = mask[i]
    image.data[i * 4 + 2] = mask[i]
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export function greyCanvasToMask(canvas: HTMLCanvasElement) {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const mask = emptyMask(width, height)
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4]
  }
  return mask
}

/** Turns the live selection into a channel that can be kept and reloaded. */
export function selectionToChannel(id: string, name: string, selection: Selection | null, width: number, height: number): AlphaChannel {
  const mask = selectionToMask(selection, width, height)
  if (mask) {
    return { id, name, mask: Uint8Array.from(mask) }
  }
  // No selection means the whole canvas, which is what gets stored.
  return { id, name, mask: new Uint8Array(width * height).fill(255) }
}

/** Reads a stored channel back as a selection, with its bounds worked out. */
export function channelToSelection(channel: AlphaChannel, width: number, height: number): Selection {
  const mask = Uint8Array.from(channel.mask)
  const bounds = maskBounds(mask, width, height)
  return { kind: 'mask', ...bounds, mask }
}

/** Combines a loaded channel with what is already selected. */
export type ChannelCombine = 'replace' | 'add' | 'subtract' | 'intersect'

export function combineMasks(current: Uint8Array | null, incoming: Uint8Array, mode: ChannelCombine) {
  if (!current || mode === 'replace') {
    return Uint8Array.from(incoming)
  }
  const out = new Uint8Array(incoming.length)
  for (let i = 0; i < incoming.length; i += 1) {
    const a = current[i] > 0
    const b = incoming[i] > 0
    const keep = mode === 'add' ? a || b : mode === 'subtract' ? a && !b : a && b
    out[i] = keep ? 255 : 0
  }
  return out
}
