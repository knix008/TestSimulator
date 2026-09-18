import { context2d } from './canvas'

/**
 * An animated GIF encoder.
 *
 * GIF carries at most 256 colours a frame, so the work is in choosing them:
 * the pixels are put through a median cut, which splits the colour cube along
 * whichever axis a box is widest until there are enough boxes, then each box
 * becomes one palette entry. After that the pixels are indexed and squeezed
 * with GIF's own LZW.
 *
 * Written here rather than pulled in because the whole editor runs offline and
 * a frame-by-frame timeline is not worth a dependency.
 */

type Box = {
  colors: number[][]
  min: number[]
  max: number[]
}

function boxOf(colors: number[][]): Box {
  const min = [255, 255, 255]
  const max = [0, 0, 0]
  for (const color of colors) {
    for (let channel = 0; channel < 3; channel += 1) {
      if (color[channel] < min[channel]) min[channel] = color[channel]
      if (color[channel] > max[channel]) max[channel] = color[channel]
    }
  }
  return { colors, min, max }
}

/** The channel a box covers the widest range of: the one worth splitting on. */
function widestChannel(box: Box) {
  const spans = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]]
  return spans[0] >= spans[1] && spans[0] >= spans[2] ? 0 : spans[1] >= spans[2] ? 1 : 2
}

/**
 * Median cut down to at most `limit` colours.
 *
 * Every pixel is sampled rather than every distinct colour, so common colours
 * pull the palette towards themselves, which is what keeps a photograph's skin
 * tones from being spent on a few bright outliers.
 */
export function medianCutPalette(data: Uint8ClampedArray, limit = 256) {
  const samples: number[][] = []
  // One sample per pixel is more than enough; stepping keeps big frames quick.
  const step = Math.max(1, Math.floor(data.length / 4 / 20000)) * 4
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 8) continue
    samples.push([data[i], data[i + 1], data[i + 2]])
  }
  if (!samples.length) {
    return [[0, 0, 0]]
  }
  let boxes = [boxOf(samples)]
  while (boxes.length < limit) {
    // Split whichever box spans the most colour; when none can be split, stop.
    let target = -1
    let widest = 0
    boxes.forEach((box, index) => {
      const span = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2])
      if (span > widest && box.colors.length > 1) {
        widest = span
        target = index
      }
    })
    if (target < 0) break
    const box = boxes[target]
    const channel = widestChannel(box)
    const sorted = [...box.colors].sort((a, b) => a[channel] - b[channel])
    const middle = sorted.length >> 1
    boxes = [
      ...boxes.slice(0, target),
      boxOf(sorted.slice(0, middle)),
      boxOf(sorted.slice(middle)),
      ...boxes.slice(target + 1),
    ]
  }
  return boxes.map((box) => {
    const total = [0, 0, 0]
    for (const color of box.colors) {
      total[0] += color[0]
      total[1] += color[1]
      total[2] += color[2]
    }
    const count = Math.max(1, box.colors.length)
    return [Math.round(total[0] / count), Math.round(total[1] / count), Math.round(total[2] / count)]
  })
}

/** The palette entry closest to a colour, by plain squared distance. */
function nearest(palette: number[][], r: number, g: number, b: number) {
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < palette.length; i += 1) {
    const dr = palette[i][0] - r
    const dg = palette[i][1] - g
    const db = palette[i][2] - b
    const distance = dr * dr + dg * dg + db * db
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }
  return best
}

/* ------------------------------------------------------------------ LZW */

class BitWriter {
  private bytes: number[] = []
  private current = 0
  private bits = 0

  write(code: number, length: number) {
    this.current |= code << this.bits
    this.bits += length
    while (this.bits >= 8) {
      this.bytes.push(this.current & 0xff)
      this.current >>= 8
      this.bits -= 8
    }
  }

  finish() {
    if (this.bits > 0) {
      this.bytes.push(this.current & 0xff)
      this.current = 0
      this.bits = 0
    }
    return this.bytes
  }
}

/** GIF's variable-width LZW, with the clear and end codes it requires. */
export function lzwEncode(indices: Uint8Array, minimumCodeSize: number) {
  const clearCode = 1 << minimumCodeSize
  const endCode = clearCode + 1
  let codeSize = minimumCodeSize + 1
  let next = endCode + 1
  const table = new Map<string, number>()
  const writer = new BitWriter()

  writer.write(clearCode, codeSize)
  let prefix = String(indices[0])
  for (let i = 1; i < indices.length; i += 1) {
    const character = String(indices[i])
    const candidate = `${prefix},${character}`
    if (table.has(candidate)) {
      prefix = candidate
      continue
    }
    writer.write(table.get(prefix) ?? Number(prefix), codeSize)
    table.set(candidate, next)
    next += 1
    if (next > (1 << codeSize) && codeSize < 12) {
      codeSize += 1
    } else if (next > 4095) {
      // The table is full: start again, which every decoder expects.
      writer.write(clearCode, codeSize)
      table.clear()
      next = endCode + 1
      codeSize = minimumCodeSize + 1
    }
    prefix = character
  }
  writer.write(table.get(prefix) ?? Number(prefix), codeSize)
  writer.write(endCode, codeSize)
  return writer.finish()
}

/* ------------------------------------------------------------- assembly */

function pushString(out: number[], text: string) {
  for (let i = 0; i < text.length; i += 1) out.push(text.charCodeAt(i))
}

function pushUint16(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff)
}

/** Image data goes out in sub-blocks of at most 255 bytes. */
function pushSubBlocks(out: number[], bytes: number[]) {
  for (let at = 0; at < bytes.length; at += 255) {
    const slice = bytes.slice(at, at + 255)
    out.push(slice.length)
    out.push(...slice)
  }
  out.push(0)
}

export type GifFrame = {
  canvas: HTMLCanvasElement
  /** How long the frame is shown, in milliseconds. */
  delayMs: number
}

/**
 * Encodes the frames as one animated GIF.
 *
 * Every frame gets its own local palette, which costs a few hundred bytes and
 * saves the animation from being flattened to the colours of its first frame.
 */
export function encodeGif(frames: GifFrame[], loop = true) {
  if (!frames.length) {
    throw new Error('An animation needs at least one frame')
  }
  const width = frames[0].canvas.width
  const height = frames[0].canvas.height
  const out: number[] = []

  pushString(out, 'GIF89a')
  pushUint16(out, width)
  pushUint16(out, height)
  // No global colour table; every frame carries its own.
  out.push(0x70, 0, 0)

  if (loop) {
    // The Netscape block, which is how a GIF says "repeat for ever".
    out.push(0x21, 0xff, 11)
    pushString(out, 'NETSCAPE2.0')
    out.push(3, 1, 0, 0, 0)
  }

  for (const frame of frames) {
    const { data } = context2d(frame.canvas).getImageData(0, 0, width, height)
    const palette = medianCutPalette(data, 255)
    // One spare slot is kept for transparency, which GIF can only do by index.
    const transparentIndex = palette.length
    const indices = new Uint8Array(width * height)
    const cache = new Map<number, number>()
    for (let i = 0; i < indices.length; i += 1) {
      const at = i * 4
      if (data[at + 3] < 8) {
        indices[i] = transparentIndex
        continue
      }
      const key = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2]
      let index = cache.get(key)
      if (index === undefined) {
        index = nearest(palette, data[at], data[at + 1], data[at + 2])
        cache.set(key, index)
      }
      indices[i] = index
    }

    // The table must be a power of two, and big enough for the spare slot.
    let bits = 1
    while ((1 << bits) < palette.length + 1) bits += 1
    const tableSize = 1 << bits

    out.push(0x21, 0xf9, 4)
    // Disposal 2 (restore to background) plus the transparency flag.
    out.push(0x09)
    pushUint16(out, Math.max(1, Math.round(frame.delayMs / 10)))
    out.push(transparentIndex, 0)

    out.push(0x2c)
    pushUint16(out, 0)
    pushUint16(out, 0)
    pushUint16(out, width)
    pushUint16(out, height)
    out.push(0x80 | (bits - 1))
    for (let i = 0; i < tableSize; i += 1) {
      const color = palette[i] ?? [0, 0, 0]
      out.push(color[0], color[1], color[2])
    }

    const minimumCodeSize = Math.max(2, bits)
    out.push(minimumCodeSize)
    pushSubBlocks(out, lzwEncode(indices, minimumCodeSize))
  }

  out.push(0x3b)
  return new Uint8Array(out)
}

export function gifDataUrl(frames: GifFrame[], loop = true) {
  const bytes = encodeGif(frames, loop)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:image/gif;base64,${btoa(binary)}`
}
