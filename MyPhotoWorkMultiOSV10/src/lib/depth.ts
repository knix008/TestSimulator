import { clamp } from './color'
import { context2d, createCanvas } from './canvas'

/**
 * Sixteen bits per channel.
 *
 * The screen, the canvas and every filter work in eight bits, so a deeper
 * document keeps a second copy of its pixels at full precision and edits *that*
 * — the 8-bit canvas is only what gets shown. The point is compounding: eight
 * bits survive one levels move and band on the third, while the deep buffer
 * still has room after a dozen.
 *
 * A deep buffer is a Float32Array of RGBA in 0..1, which holds more than the
 * 16 bits a file can carry and costs nothing extra to work in.
 */

export type DeepBuffer = {
  width: number
  height: number
  data: Float32Array
}

export function deepFromCanvas(canvas: HTMLCanvasElement): DeepBuffer {
  const { width, height } = canvas
  const source = context2d(canvas).getImageData(0, 0, width, height).data
  const data = new Float32Array(width * height * 4)
  for (let i = 0; i < data.length; i += 1) {
    data[i] = source[i] / 255
  }
  return { width, height, data }
}

/** Builds a deep buffer straight from 16-bit samples, keeping every bit. */
export function deepFromUint16(samples: Uint16Array, width: number, height: number, channels: 1 | 3 | 4) {
  const data = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const at = i * channels
    const r = samples[at] / 65535
    const g = channels === 1 ? r : samples[at + 1] / 65535
    const b = channels === 1 ? r : samples[at + 2] / 65535
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = channels === 4 ? samples[at + 3] / 65535 : 1
  }
  return { width, height, data }
}

/** The 8-bit view the screen gets. */
export function canvasFromDeep(buffer: DeepBuffer) {
  const canvas = createCanvas(buffer.width, buffer.height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(buffer.width, buffer.height)
  for (let i = 0; i < image.data.length; i += 1) {
    image.data[i] = clamp(buffer.data[i] * 255, 0, 255)
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** The 16-bit samples a file wants, interleaved RGBA. */
export function uint16FromDeep(buffer: DeepBuffer) {
  const samples = new Uint16Array(buffer.width * buffer.height * 4)
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = clamp(Math.round(buffer.data[i] * 65535), 0, 65535)
  }
  return samples
}

/**
 * Runs a tone curve over the deep buffer.
 *
 * `curve` is handed a value in 0..1 and returns one; it never sees a byte, so
 * nothing is rounded until the picture is displayed or written out.
 */
export function mapDeep(buffer: DeepBuffer, curve: (value: number, channel: 0 | 1 | 2) => number) {
  for (let i = 0; i < buffer.data.length; i += 4) {
    buffer.data[i] = curve(buffer.data[i], 0)
    buffer.data[i + 1] = curve(buffer.data[i + 1], 1)
    buffer.data[i + 2] = curve(buffer.data[i + 2], 2)
  }
}

/** Levels, in full precision: black point, gamma and white point. */
export function deepLevels(buffer: DeepBuffer, black: number, gamma: number, white: number) {
  const low = black / 255
  const high = white / 255
  const span = Math.max(1 / 65535, high - low)
  const power = 1 / Math.max(0.01, gamma)
  mapDeep(buffer, (value) => Math.pow(clamp((value - low) / span, 0, 1), power))
}

/** Exposure in stops, again without going through a byte. */
export function deepExposure(buffer: DeepBuffer, stops: number) {
  const scale = Math.pow(2, stops)
  mapDeep(buffer, (value) => clamp(value * scale, 0, 1))
}

/* ------------------------------------------------------- 16-bit TIFF out */

function writeUint16(bytes: Uint8Array, at: number, value: number) {
  bytes[at] = value & 0xff
  bytes[at + 1] = (value >> 8) & 0xff
}

function writeUint32(bytes: Uint8Array, at: number, value: number) {
  bytes[at] = value & 0xff
  bytes[at + 1] = (value >> 8) & 0xff
  bytes[at + 2] = (value >> 16) & 0xff
  bytes[at + 3] = (value >> 24) & 0xff
}

/**
 * A little-endian, uncompressed 16-bit RGBA TIFF.
 *
 * Written by hand because the TIFF encoder the 8-bit path uses only does eight
 * bits, and the whole point of a 16-bit document is being able to hand those
 * bits to something else. The layout is the simplest a reader will accept: one
 * strip, no compression, alpha declared as unassociated.
 */
export function encodeTiff16(buffer: DeepBuffer) {
  const { width, height } = buffer
  const samples = uint16FromDeep(buffer)
  const entries = 12
  const headerSize = 8
  const ifdSize = 2 + entries * 12 + 4
  // Two tags need their values out of line: bits per sample, and the pair of
  // resolution rationals.
  const extraSize = 8 + 8 + 8
  const pixelOffset = headerSize + ifdSize + extraSize
  const bytes = new Uint8Array(pixelOffset + samples.length * 2)

  bytes[0] = 0x49
  bytes[1] = 0x49
  writeUint16(bytes, 2, 42)
  writeUint32(bytes, 4, headerSize)

  let at = headerSize
  writeUint16(bytes, at, entries)
  at += 2
  const bitsOffset = headerSize + ifdSize
  const xResOffset = bitsOffset + 8
  const yResOffset = xResOffset + 8

  const tag = (id: number, type: number, count: number, value: number) => {
    writeUint16(bytes, at, id)
    writeUint16(bytes, at + 2, type)
    writeUint32(bytes, at + 4, count)
    // Values of four bytes or fewer live in the entry itself; a single SHORT
    // sits in the low half of that field.
    if (type === 3 && count === 1) writeUint16(bytes, at + 8, value)
    else writeUint32(bytes, at + 8, value)
    at += 12
  }

  tag(256, 3, 1, width) // ImageWidth
  tag(257, 3, 1, height) // ImageLength
  tag(258, 3, 4, bitsOffset) // BitsPerSample
  tag(259, 3, 1, 1) // Compression: none
  tag(262, 3, 1, 2) // PhotometricInterpretation: RGB
  tag(273, 4, 1, pixelOffset) // StripOffsets
  tag(277, 3, 1, 4) // SamplesPerPixel
  tag(278, 3, 1, height) // RowsPerStrip
  tag(279, 4, 1, samples.length * 2) // StripByteCounts
  tag(282, 5, 1, xResOffset) // XResolution
  tag(283, 5, 1, yResOffset) // YResolution
  tag(338, 3, 1, 2) // ExtraSamples: unassociated alpha
  writeUint32(bytes, at, 0) // no second IFD

  for (let i = 0; i < 4; i += 1) {
    writeUint16(bytes, bitsOffset + i * 2, 16)
  }
  writeUint32(bytes, xResOffset, 72)
  writeUint32(bytes, xResOffset + 4, 1)
  writeUint32(bytes, yResOffset, 72)
  writeUint32(bytes, yResOffset + 4, 1)

  for (let i = 0; i < samples.length; i += 1) {
    writeUint16(bytes, pixelOffset + i * 2, samples[i])
  }
  return bytes
}
