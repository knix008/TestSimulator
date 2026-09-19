import { context2d, createCanvas, createLayerMeta } from './canvas'
import { cmykToRgb } from './colorModes'
import type { BlendMode, LayerMeta, PhotoDocument } from './types'

/**
 * Adobe Photoshop's own file format, read and written without Photoshop.
 *
 * Reading covers what a layered photo needs: 8- and 16-bit RGB, greyscale,
 * CMYK and indexed documents; every layer's pixels, mask, name, opacity,
 * blend mode, visibility and clipping; layer groups; and the flattened
 * composite for a file that carries no layers. Writing produces a version-1
 * PSD with 8-bit RGB layers (PackBits-compressed), groups, masks and a
 * composite, which Photoshop, Affinity, GIMP and Krita all open.
 *
 * What is not carried over either way: text as editable type, adjustment
 * layers' settings, smart-object originals and layer styles — those come in
 * as their rendered pixels, which is what the composite in the file holds.
 */

export type PsdLayerResult = {
  meta: LayerMeta
  canvas: HTMLCanvasElement | null
  mask: HTMLCanvasElement | null
}

export type PsdReadResult = {
  width: number
  height: number
  layers: PsdLayerResult[]
  composite: HTMLCanvasElement
  colorMode: 'rgb' | 'gray' | 'cmyk' | 'lab'
  depth: 8 | 16
}

const blendFromKey: Record<string, BlendMode> = {
  norm: 'source-over', pass: 'source-over', diss: 'source-over',
  mul: 'multiply', scrn: 'screen', over: 'overlay', dark: 'darken', lite: 'lighten',
  div: 'color-dodge', idiv: 'color-burn', hLit: 'hard-light', sLit: 'soft-light',
  diff: 'difference', smud: 'exclusion', hue: 'hue', sat: 'saturation', colr: 'color',
  lum: 'luminosity', lddg: 'lighter', dkCl: 'darken', lgCl: 'lighten', lbrn: 'color-burn',
  vLit: 'hard-light', lLit: 'soft-light', pLit: 'hard-light', hMix: 'hard-light', fsub: 'difference', fdiv: 'difference',
}

const keyFromBlend: Record<BlendMode, string> = {
  'source-over': 'norm', multiply: 'mul ', screen: 'scrn', overlay: 'over', darken: 'dark', lighten: 'lite',
  'color-dodge': 'div ', 'color-burn': 'idiv', 'hard-light': 'hLit', 'soft-light': 'sLit', difference: 'diff',
  exclusion: 'smud', hue: 'hue ', saturation: 'sat ', color: 'colr', luminosity: 'lum ', lighter: 'lddg', xor: 'norm',
}

export function isPsdSource(name: string, mime?: string) {
  return mime === 'image/vnd.adobe.photoshop' || /\.(psd|psb)$/i.test(name)
}

export function hasPsdMagic(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
  return bytes.length === 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53
}

/* ------------------------------------------------------------------ read */

class Reader {
  view: DataView
  buffer: ArrayBuffer
  at = 0
  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer
    this.view = new DataView(buffer)
  }
  u8() { const v = this.view.getUint8(this.at); this.at += 1; return v }
  u16() { const v = this.view.getUint16(this.at); this.at += 2; return v }
  i16() { const v = this.view.getInt16(this.at); this.at += 2; return v }
  u32() { const v = this.view.getUint32(this.at); this.at += 4; return v }
  i32() { const v = this.view.getInt32(this.at); this.at += 4; return v }
  /** A 64-bit length in a PSB, read as a double-precision number. */
  u64() { const hi = this.u32(); const lo = this.u32(); return hi * 4294967296 + lo }
  bytes(n: number) { const v = new Uint8Array(this.buffer, this.at, n); this.at += n; return v }
  ascii(n: number) { return String.fromCharCode(...this.bytes(n)) }
  skip(n: number) { this.at += n }
  pascal(pad: number) {
    const length = this.u8()
    const text = this.ascii(length)
    const total = length + 1
    const padded = Math.ceil(total / pad) * pad
    this.skip(padded - total)
    return text
  }
  unicode() {
    const length = this.u32()
    let text = ''
    for (let i = 0; i < length; i += 1) text += String.fromCharCode(this.u16())
    return text.replace(/\0+$/, '')
  }
}

/** PackBits: the run-length scheme every RLE section in a PSD uses. */
export function unpackBits(src: Uint8Array, expected: number) {
  const out = new Uint8Array(expected)
  let i = 0
  let o = 0
  while (i < src.length && o < expected) {
    const n = src[i]
    i += 1
    if (n === 128) continue
    if (n < 128) {
      const count = n + 1
      for (let k = 0; k < count && o < expected && i < src.length; k += 1) {
        out[o] = src[i]
        o += 1
        i += 1
      }
    } else {
      const count = 257 - n
      const value = src[i]
      i += 1
      for (let k = 0; k < count && o < expected; k += 1) {
        out[o] = value
        o += 1
      }
    }
  }
  return out
}

export function packBits(src: Uint8Array) {
  const out: number[] = []
  let i = 0
  while (i < src.length) {
    // Run?
    let run = 1
    while (i + run < src.length && src[i + run] === src[i] && run < 128) run += 1
    if (run >= 2) {
      out.push(257 - run, src[i])
      i += run
      continue
    }
    // Literal until the next run of 3.
    let literal = 1
    while (i + literal < src.length && literal < 128) {
      const a = src[i + literal]
      const b = src[i + literal + 1]
      const c = src[i + literal + 2]
      if (a === b && b === c) break
      literal += 1
    }
    out.push(literal - 1)
    for (let k = 0; k < literal; k += 1) out.push(src[i + k])
    i += literal
  }
  return Uint8Array.from(out)
}

/** Reads one channel's plane of `width * height` 8-bit samples. */
function readPlane(reader: Reader, compression: number, width: number, height: number, depth: number, psb: boolean, rowCounts?: number[]) {
  const samples = width * height
  const bytesPerSample = depth === 16 ? 2 : depth === 32 ? 4 : 1
  if (compression === 0) {
    const raw = reader.bytes(samples * bytesPerSample)
    return toEightBit(raw, depth, samples)
  }
  if (compression === 1) {
    const counts = rowCounts ?? []
    if (!rowCounts) {
      for (let row = 0; row < height; row += 1) counts.push(psb ? reader.u32() : reader.u16())
    }
    const out = new Uint8Array(samples)
    const rowBytes = width * bytesPerSample
    for (let row = 0; row < height; row += 1) {
      const packed = reader.bytes(counts[row])
      const line = unpackBits(packed, rowBytes)
      out.set(toEightBit(line, depth, width), row * width)
    }
    return out
  }
  throw new Error(`Unsupported PSD compression ${compression}`)
}

function toEightBit(raw: Uint8Array, depth: number, samples: number) {
  if (depth === 8) return raw.length === samples ? raw : raw.slice(0, samples)
  const out = new Uint8Array(samples)
  if (depth === 16) {
    for (let i = 0; i < samples; i += 1) out[i] = raw[i * 2]
    return out
  }
  if (depth === 32) {
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    for (let i = 0; i < samples; i += 1) out[i] = Math.max(0, Math.min(255, Math.round(view.getFloat32(i * 4) * 255)))
    return out
  }
  if (depth === 1) {
    for (let i = 0; i < samples; i += 1) out[i] = raw[i >> 3] & (0x80 >> (i & 7)) ? 0 : 255
    return out
  }
  return out
}

type ChannelPlanes = Map<number, Uint8Array>

/** Turns the planes of one layer (or the composite) into RGBA pixels. */
function planesToCanvas(planes: ChannelPlanes, width: number, height: number, mode: number, palette: Uint8Array | null, alphaId = -1) {
  const canvas = createCanvas(Math.max(1, width), Math.max(1, height))
  if (width <= 0 || height <= 0) return canvas
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  const n = width * height
  const alpha = planes.get(alphaId)
  const c0 = planes.get(0)
  const c1 = planes.get(1)
  const c2 = planes.get(2)
  const c3 = planes.get(3)
  for (let i = 0; i < n; i += 1) {
    const o = i * 4
    if (mode === 3 || mode === 9) {
      image.data[o] = c0?.[i] ?? 0
      image.data[o + 1] = c1?.[i] ?? 0
      image.data[o + 2] = c2?.[i] ?? 0
      if (mode === 9) {
        // Lab in a PSD: L 0..255, a and b offset by 128.
        const l = (c0?.[i] ?? 0) / 2.55
        const a = (c1?.[i] ?? 128) - 128
        const b = (c2?.[i] ?? 128) - 128
        const y = (l + 16) / 116
        const fx = a / 500 + y
        const fz = y - b / 200
        const f = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)
        const X = 0.95047 * f(fx)
        const Y = 1 * f(y)
        const Z = 1.08883 * f(fz)
        const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z]
        for (let c = 0; c < 3; c += 1) {
          const v = lin[c]
          const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
          image.data[o + c] = Math.max(0, Math.min(255, Math.round(s * 255)))
        }
      }
    } else if (mode === 1 || mode === 0 || mode === 8) {
      const g = c0?.[i] ?? 0
      image.data[o] = g; image.data[o + 1] = g; image.data[o + 2] = g
    } else if (mode === 2 && palette) {
      const index = c0?.[i] ?? 0
      image.data[o] = palette[index]
      image.data[o + 1] = palette[256 + index]
      image.data[o + 2] = palette[512 + index]
    } else if (mode === 4) {
      // CMYK planes are stored inverted: 255 means no ink.
      const rgb = cmykToRgb(1 - (c0?.[i] ?? 255) / 255, 1 - (c1?.[i] ?? 255) / 255, 1 - (c2?.[i] ?? 255) / 255, 1 - (c3?.[i] ?? 255) / 255)
      image.data[o] = rgb.r; image.data[o + 1] = rgb.g; image.data[o + 2] = rgb.b
    } else {
      image.data[o] = c0?.[i] ?? 0; image.data[o + 1] = c1?.[i] ?? 0; image.data[o + 2] = c2?.[i] ?? 0
    }
    image.data[o + 3] = alpha ? alpha[i] : 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** Places a layer-sized canvas into a document-sized one at its offset. */
function placeInDocument(canvas: HTMLCanvasElement, left: number, top: number, width: number, height: number) {
  const out = createCanvas(width, height)
  context2d(out).drawImage(canvas, left, top)
  return out
}

export function readPsd(buffer: ArrayBuffer): PsdReadResult {
  const reader = new Reader(buffer)
  if (reader.ascii(4) !== '8BPS') throw new Error('Not a Photoshop file')
  const version = reader.u16()
  const psb = version === 2
  if (version !== 1 && version !== 2) throw new Error(`Unknown PSD version ${version}`)
  reader.skip(6)
  const channels = reader.u16()
  const height = reader.u32()
  const width = reader.u32()
  const depth = reader.u16()
  const mode = reader.u16()
  if (![0, 1, 2, 3, 4, 8, 9].includes(mode)) throw new Error(`Unsupported PSD colour mode ${mode}`)

  // Colour mode data: the palette of an indexed file.
  const modeLength = reader.u32()
  let palette: Uint8Array | null = null
  if (mode === 2 && modeLength >= 768) palette = reader.bytes(768).slice()
  else reader.skip(modeLength)
  if (mode === 2 && modeLength > 768) reader.skip(modeLength - 768)

  // Image resources: nothing here is needed to show the picture.
  reader.skip(reader.u32())

  // Layer and mask information.
  const layers: PsdLayerResult[] = []
  const sectionLength = psb ? reader.u64() : reader.u32()
  const sectionEnd = reader.at + sectionLength
  if (sectionLength > 0) {
    const layerInfoLength = psb ? reader.u64() : reader.u32()
    const layerInfoEnd = reader.at + layerInfoLength
    if (layerInfoLength > 0) {
      const count = Math.abs(reader.i16())
      type Record = {
        top: number; left: number; bottom: number; right: number
        channels: { id: number; length: number }[]
        blend: string; opacity: number; clipping: number; flags: number
        mask: { top: number; left: number; bottom: number; right: number; defaultColor: number } | null
        name: string
        section: number
      }
      const records: Record[] = []
      for (let i = 0; i < count; i += 1) {
        const top = reader.i32()
        const left = reader.i32()
        const bottom = reader.i32()
        const right = reader.i32()
        const channelCount = reader.u16()
        const chans: { id: number; length: number }[] = []
        for (let c = 0; c < channelCount; c += 1) {
          const id = reader.i16()
          const length = psb ? reader.u64() : reader.u32()
          chans.push({ id, length })
        }
        if (reader.ascii(4) !== '8BIM') throw new Error('Corrupt PSD layer record')
        const blend = reader.ascii(4)
        const opacity = reader.u8()
        const clipping = reader.u8()
        const flags = reader.u8()
        reader.u8()
        const extraLength = reader.u32()
        const extraEnd = reader.at + extraLength
        // Mask data.
        const maskLength = reader.u32()
        let mask: Record['mask'] = null
        if (maskLength >= 20) {
          const mTop = reader.i32()
          const mLeft = reader.i32()
          const mBottom = reader.i32()
          const mRight = reader.i32()
          const defaultColor = reader.u8()
          mask = { top: mTop, left: mLeft, bottom: mBottom, right: mRight, defaultColor }
          reader.skip(maskLength - 17)
        } else {
          reader.skip(maskLength)
        }
        // Blending ranges.
        reader.skip(reader.u32())
        let name = reader.pascal(4)
        let section = 0
        // Additional layer information: the unicode name and the group marker.
        while (reader.at + 12 <= extraEnd) {
          const signature = reader.ascii(4)
          if (signature !== '8BIM' && signature !== '8B64') break
          const key = reader.ascii(4)
          const bigKeys = ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']
          const length = psb && bigKeys.includes(key) ? reader.u64() : reader.u32()
          const blockEnd = reader.at + length + (length % 2)
          if (key === 'luni') {
            name = reader.unicode() || name
          } else if (key === 'lsct') {
            section = reader.u32()
          }
          reader.at = blockEnd
        }
        reader.at = extraEnd
        records.push({ top, left, bottom, right, channels: chans, blend, opacity, clipping, flags, mask, name, section })
      }
      // Channel image data follows, one layer at a time.
      let groupStart: number | null = null
      const pendingChildren: LayerMeta[] = []
      for (const record of records) {
        const w = record.right - record.left
        const h = record.bottom - record.top
        const planes: ChannelPlanes = new Map()
        let maskPlane: Uint8Array | null = null
        for (const channel of record.channels) {
          const start = reader.at
          const compression = reader.u16()
          if (channel.id === -2 && record.mask) {
            const mw = record.mask.right - record.mask.left
            const mh = record.mask.bottom - record.mask.top
            if (mw > 0 && mh > 0 && channel.length > 2) maskPlane = readPlane(reader, compression, mw, mh, depth, psb)
          } else if (w > 0 && h > 0 && channel.length > 2 && channel.id >= -1) {
            planes.set(channel.id, readPlane(reader, compression, w, h, depth, psb))
          }
          reader.at = start + channel.length
        }
        const meta = createLayerMeta(record.name || 'Layer')
        meta.opacity = record.opacity / 255
        meta.blendMode = blendFromKey[record.blend.trim()] ?? blendFromKey[record.blend] ?? 'source-over'
        meta.visible = (record.flags & 2) === 0
        meta.clipped = record.clipping === 1
        meta.locked = (record.flags & 1) !== 0
        if (record.section === 3) {
          // The hidden "</Layer group>" divider: children follow, folder last.
          groupStart = layers.length
          continue
        }
        if (record.section === 1 || record.section === 2) {
          meta.kind = 'group'
          meta.collapsed = record.section === 2
          const start = groupStart ?? layers.length
          for (let i = start; i < layers.length; i += 1) {
            if (!layers[i].meta.parentId) layers[i].meta.parentId = meta.id
          }
          layers.splice(start, 0, { meta, canvas: null, mask: null })
          groupStart = null
          pendingChildren.length = 0
          continue
        }
        let canvas: HTMLCanvasElement | null = null
        if (w > 0 && h > 0 && planes.size) {
          canvas = placeInDocument(planesToCanvas(planes, w, h, mode, palette), record.left, record.top, width, height)
        } else {
          canvas = createCanvas(width, height)
        }
        let mask: HTMLCanvasElement | null = null
        if (record.mask && maskPlane) {
          const mw = record.mask.right - record.mask.left
          const mh = record.mask.bottom - record.mask.top
          mask = createCanvas(width, height)
          const mctx = context2d(mask)
          mctx.fillStyle = `rgba(255,255,255,${record.mask.defaultColor / 255})`
          mctx.fillRect(0, 0, width, height)
          const local = createCanvas(mw, mh)
          const lctx = context2d(local)
          const image = lctx.createImageData(mw, mh)
          for (let i = 0; i < mw * mh; i += 1) {
            image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = maskPlane[i]
          }
          lctx.putImageData(image, 0, 0)
          mctx.clearRect(record.mask.left, record.mask.top, mw, mh)
          mctx.drawImage(local, record.mask.left, record.mask.top)
          meta.maskEnabled = true
        }
        layers.push({ meta, canvas, mask })
      }
    }
    reader.at = layerInfoEnd
  }
  reader.at = sectionEnd

  // The composite: what Photoshop showed when the file was saved.
  let composite: HTMLCanvasElement
  if (reader.at + 2 <= buffer.byteLength) {
    const compression = reader.u16()
    const planes: ChannelPlanes = new Map()
    const ids = mode === 4 ? [0, 1, 2, 3] : mode === 3 || mode === 9 ? [0, 1, 2] : [0]
    const alphaIndex = ids.length
    let rowCounts: number[][] | undefined
    if (compression === 1) {
      rowCounts = []
      for (let c = 0; c < channels; c += 1) {
        const counts: number[] = []
        for (let row = 0; row < height; row += 1) counts.push(psb ? reader.u32() : reader.u16())
        rowCounts.push(counts)
      }
    }
    try {
      for (let c = 0; c < channels; c += 1) {
        const plane = readPlane(reader, compression, width, height, depth, psb, rowCounts?.[c])
        if (c < ids.length) planes.set(ids[c], plane)
        else if (c === alphaIndex) planes.set(-1, plane)
      }
    } catch {
      // A truncated composite is not fatal: the layers carry the picture.
    }
    composite = planes.size ? planesToCanvas(planes, width, height, mode, palette) : createCanvas(width, height)
  } else {
    composite = createCanvas(width, height)
  }
  return {
    width,
    height,
    layers,
    composite,
    colorMode: mode === 4 ? 'cmyk' : mode === 9 ? 'lab' : mode === 1 || mode === 0 || mode === 8 ? 'gray' : 'rgb',
    depth: depth === 16 ? 16 : 8,
  }
}

/* ----------------------------------------------------------------- write */

class Writer {
  parts: Uint8Array[] = []
  size = 0
  push(bytes: Uint8Array) { this.parts.push(bytes); this.size += bytes.length }
  u8(v: number) { this.push(Uint8Array.of(v & 255)) }
  u16(v: number) { this.push(Uint8Array.of((v >> 8) & 255, v & 255)) }
  i16(v: number) { this.u16(v < 0 ? v + 65536 : v) }
  u32(v: number) { this.push(Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)) }
  i32(v: number) { this.u32(v < 0 ? v + 4294967296 : v) }
  ascii(text: string) { this.push(Uint8Array.from([...text].map((ch) => ch.charCodeAt(0) & 255))) }
  pascal(text: string, pad: number) {
    const bytes = [...text].map((ch) => ch.charCodeAt(0)).filter((code) => code < 128).slice(0, 255)
    this.u8(bytes.length)
    this.push(Uint8Array.from(bytes))
    const total = bytes.length + 1
    const padded = Math.ceil(total / pad) * pad
    for (let i = total; i < padded; i += 1) this.u8(0)
  }
  unicode(text: string) {
    this.u32(text.length)
    for (const ch of text) this.u16(ch.charCodeAt(0))
  }
  bytes() {
    const out = new Uint8Array(this.size)
    let at = 0
    for (const part of this.parts) { out.set(part, at); at += part.length }
    return out
  }
}

/** One channel as PackBits rows: the byte counts, then the packed rows. */
function encodePlane(plane: Uint8Array, width: number, height: number) {
  const counts = new Writer()
  const data = new Writer()
  for (let row = 0; row < height; row += 1) {
    const packed = packBits(plane.subarray(row * width, (row + 1) * width))
    counts.u16(packed.length)
    data.push(packed)
  }
  const out = new Writer()
  out.u16(1)
  out.push(counts.bytes())
  out.push(data.bytes())
  return out.bytes()
}

function planesOf(canvas: HTMLCanvasElement, rect: { left: number; top: number; width: number; height: number }) {
  const data = context2d(canvas).getImageData(rect.left, rect.top, rect.width, rect.height).data
  const n = rect.width * rect.height
  const r = new Uint8Array(n)
  const g = new Uint8Array(n)
  const b = new Uint8Array(n)
  const a = new Uint8Array(n)
  for (let i = 0; i < n; i += 1) {
    r[i] = data[i * 4]; g[i] = data[i * 4 + 1]; b[i] = data[i * 4 + 2]; a[i] = data[i * 4 + 3]
  }
  return { r, g, b, a }
}

/** The box of opaque pixels, so an empty layer is written as empty. */
function contentBounds(canvas: HTMLCanvasElement) {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return { left: 0, top: 0, width: 0, height: 0 }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export type PsdWriteLayer = {
  meta: LayerMeta
  canvas: HTMLCanvasElement | null
  mask: HTMLCanvasElement | null
}

/**
 * Writes the document as a PSD. `layers` are bottom to top, each already
 * rendered to document-sized pixels (text, shapes and smart objects are
 * handed over as what they draw).
 */
export function writePsd(document: Pick<PhotoDocument, 'width' | 'height'>, layers: PsdWriteLayer[], composite: HTMLCanvasElement) {
  const { width, height } = document
  const out = new Writer()
  out.ascii('8BPS')
  out.u16(1)
  out.push(new Uint8Array(6))
  out.u16(4)
  out.u32(height)
  out.u32(width)
  out.u16(8)
  out.u16(3)
  out.u32(0) // colour mode data
  out.u32(0) // image resources

  // Expand groups into Photoshop's order: divider, children, folder.
  type Entry = { meta: LayerMeta; canvas: HTMLCanvasElement | null; mask: HTMLCanvasElement | null; section: number }
  const entries: Entry[] = []
  const emitted = new Set<string>()
  for (const layer of layers) {
    if (emitted.has(layer.meta.id)) continue
    if (layer.meta.kind === 'group') {
      const children = layers.filter((item) => item.meta.parentId === layer.meta.id)
      entries.push({ meta: { ...layer.meta, name: '</Layer group>' }, canvas: null, mask: null, section: 3 })
      for (const child of children) {
        entries.push({ ...child, section: 0 })
        emitted.add(child.meta.id)
      }
      entries.push({ meta: layer.meta, canvas: null, mask: null, section: layer.meta.collapsed ? 2 : 1 })
      emitted.add(layer.meta.id)
      continue
    }
    if (layer.meta.parentId && layers.some((item) => item.meta.id === layer.meta.parentId)) continue
    entries.push({ ...layer, section: 0 })
    emitted.add(layer.meta.id)
  }

  const records = new Writer()
  const channelData = new Writer()
  records.i16(-entries.length)
  for (const entry of entries) {
    const bounds = entry.canvas ? contentBounds(entry.canvas) : { left: 0, top: 0, width: 0, height: 0 }
    const planes = entry.canvas && bounds.width > 0 ? planesOf(entry.canvas, bounds) : null
    const encoded: { id: number; bytes: Uint8Array }[] = []
    if (planes) {
      encoded.push({ id: -1, bytes: encodePlane(planes.a, bounds.width, bounds.height) })
      encoded.push({ id: 0, bytes: encodePlane(planes.r, bounds.width, bounds.height) })
      encoded.push({ id: 1, bytes: encodePlane(planes.g, bounds.width, bounds.height) })
      encoded.push({ id: 2, bytes: encodePlane(planes.b, bounds.width, bounds.height) })
    } else {
      for (const id of [-1, 0, 1, 2]) encoded.push({ id, bytes: Uint8Array.of(0, 0) })
    }
    let maskBytes: Uint8Array | null = null
    if (entry.mask && entry.meta.maskEnabled) {
      const m = planesOf(entry.mask, { left: 0, top: 0, width, height })
      maskBytes = encodePlane(m.a, width, height)
      encoded.push({ id: -2, bytes: maskBytes })
    }
    records.i32(bounds.top)
    records.i32(bounds.left)
    records.i32(bounds.top + bounds.height)
    records.i32(bounds.left + bounds.width)
    records.u16(encoded.length)
    for (const channel of encoded) {
      records.i16(channel.id)
      records.u32(channel.bytes.length)
      channelData.push(channel.bytes)
    }
    records.ascii('8BIM')
    records.ascii(entry.section ? 'pass' : (keyFromBlend[entry.meta.blendMode] ?? 'norm'))
    records.u8(Math.round(entry.meta.opacity * 255))
    records.u8(entry.meta.clipped ? 1 : 0)
    records.u8((entry.meta.visible ? 0 : 2) | (entry.meta.locked ? 1 : 0) | 8)
    records.u8(0)
    const extra = new Writer()
    if (maskBytes) {
      extra.u32(20)
      extra.i32(0); extra.i32(0); extra.i32(height); extra.i32(width)
      extra.u8(255)
      extra.u8(0)
      extra.u16(0)
    } else {
      extra.u32(0)
    }
    extra.u32(0) // blending ranges
    extra.pascal(entry.meta.name, 4)
    // Unicode name.
    const luni = new Writer()
    luni.unicode(entry.meta.name)
    const luniBytes = luni.bytes()
    extra.ascii('8BIM'); extra.ascii('luni'); extra.u32(luniBytes.length); extra.push(luniBytes)
    if (luniBytes.length % 2) extra.u8(0)
    if (entry.section) {
      extra.ascii('8BIM'); extra.ascii('lsct'); extra.u32(12); extra.u32(entry.section); extra.ascii('8BIM'); extra.ascii('pass')
    }
    const extraBytes = extra.bytes()
    records.u32(extraBytes.length)
    records.push(extraBytes)
  }
  const layerInfo = new Writer()
  const recordBytes = records.bytes()
  const channelBytes = channelData.bytes()
  const layerInfoLength = recordBytes.length + channelBytes.length
  layerInfo.u32(layerInfoLength + (layerInfoLength % 2))
  layerInfo.push(recordBytes)
  layerInfo.push(channelBytes)
  if (layerInfoLength % 2) layerInfo.u8(0)
  layerInfo.u32(0) // global layer mask info
  const layerInfoBytes = layerInfo.bytes()
  out.u32(layerInfoBytes.length)
  out.push(layerInfoBytes)

  // The composite, raw planes: R, G, B, then the merged alpha.
  const flat = planesOf(composite, { left: 0, top: 0, width, height })
  out.u16(0)
  out.push(flat.r); out.push(flat.g); out.push(flat.b); out.push(flat.a)
  return out.bytes()
}
