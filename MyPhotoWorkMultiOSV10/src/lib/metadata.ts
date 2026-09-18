import { context2d } from './canvas'
import { iccFromJpeg, parseIccProfile } from './colorModes'

/**
 * What the Image information window shows.
 *
 * Three kinds of fact go in it: what the file is (read out of the file's own
 * header — EXIF for a JPEG, IHDR for a PNG, the tag set for a DICOM), what the
 * document is (size, layers, colour mode), and what the pixels are (the
 * statistics below). Only the first of those needs format knowledge, and it
 * lives here so `imageIO` stays about reading and writing.
 *
 * A row either names a translated key or carries a label out of the file, which
 * is left as the format writes it: "FNumber" is what a photographer expects to
 * see, and no translation of a DICOM tag would be clearer than its own name.
 */

export type MetaRow = { key?: string; label?: string; value: string }
export type MetaSection = { key: string; rows: MetaRow[] }

/** Where the document came from, kept so the window can describe the file. */
export type SourceInfo = {
  name: string
  path?: string
  mime?: string
  byteSize?: number
  /** Rows read out of the file's own header. */
  details: MetaRow[]
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

export function aspectRatio(width: number, height: number) {
  const divisor = greatestCommonDivisor(width, height) || 1
  const w = Math.round(width / divisor)
  const h = Math.round(height / divisor)
  // 5187:3458 tells nobody anything; fall back to a decimal for odd sizes.
  if (w > 40 || h > 40) {
    return `${(width / height).toFixed(2)} : 1`
  }
  return `${w} : ${h}`
}

/* ------------------------------------------------------------------ pixels */

/** Mean, extremes and transparency, measured over the whole canvas. */
export function imageStatistics(canvas: HTMLCanvasElement): MetaRow[] {
  const { data } = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  const count = canvas.width * canvas.height
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumL = 0
  let min = 255
  let max = 0
  let clear = 0
  let partial = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    sumR += r
    sumG += g
    sumB += b
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b
    sumL += luminance
    if (luminance < min) min = luminance
    if (luminance > max) max = luminance
    if (a === 0) clear += 1
    else if (a < 255) partial += 1
  }
  const percent = (value: number) => `${((value / count) * 100).toFixed(1)}%`
  return [
    { key: 'infoMeanRgb', value: `${(sumR / count).toFixed(0)}, ${(sumG / count).toFixed(0)}, ${(sumB / count).toFixed(0)}` },
    { key: 'infoMeanLuma', value: (sumL / count).toFixed(1) },
    { key: 'infoRange', value: `${min.toFixed(0)} – ${max.toFixed(0)}` },
    { key: 'infoTransparent', value: `${percent(clear)} / ${percent(partial)}` },
  ]
}

/* ------------------------------------------------------------------- EXIF */

const orientations: Record<number, string> = {
  1: 'Normal', 2: 'Mirrored', 3: 'Rotated 180°', 4: 'Mirrored, rotated 180°',
  5: 'Mirrored, rotated 90° CW', 6: 'Rotated 90° CW', 7: 'Mirrored, rotated 90° CCW', 8: 'Rotated 90° CCW',
}

const exposurePrograms: Record<number, string> = {
  1: 'Manual', 2: 'Program', 3: 'Aperture priority', 4: 'Shutter priority',
  5: 'Creative', 6: 'Action', 7: 'Portrait', 8: 'Landscape',
}

const meteringModes: Record<number, string> = {
  1: 'Average', 2: 'Centre-weighted', 3: 'Spot', 4: 'Multi-spot', 5: 'Pattern', 6: 'Partial',
}

const whiteBalances: Record<number, string> = { 0: 'Auto', 1: 'Manual' }

type ExifValue = string | number

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    const code = bytes[offset + i]
    if (code === 0) break
    out += String.fromCharCode(code)
  }
  return out.trim()
}

const typeSizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]

/**
 * One IFD's entries. `visit` is handed every tag so the caller can pick out the
 * pointers to the Exif and GPS sub-directories as well as the values it wants.
 */
function readIfd(view: DataView, bytes: Uint8Array, tiff: number, ifd: number, little: boolean, visit: (tag: number, value: ExifValue | undefined) => void) {
  if (ifd + 2 > view.byteLength) {
    return
  }
  const entries = view.getUint16(ifd, little)
  for (let i = 0; i < entries; i += 1) {
    const at = ifd + 2 + i * 12
    if (at + 12 > view.byteLength) {
      return
    }
    const tag = view.getUint16(at, little)
    const type = view.getUint16(at + 2, little)
    const count = view.getUint32(at + 4, little)
    const size = (typeSizes[type] ?? 0) * count
    if (!size) {
      visit(tag, undefined)
      continue
    }
    const valueAt = size <= 4 ? at + 8 : tiff + view.getUint32(at + 8, little)
    if (valueAt + Math.min(size, 8) > view.byteLength) {
      continue
    }
    let value: ExifValue | undefined
    if (type === 2) {
      value = readAscii(bytes, valueAt, count)
    } else if (type === 3) {
      value = view.getUint16(valueAt, little)
    } else if (type === 4) {
      value = view.getUint32(valueAt, little)
    } else if (type === 9) {
      value = view.getInt32(valueAt, little)
    } else if (type === 5 || type === 10) {
      const numerator = type === 5 ? view.getUint32(valueAt, little) : view.getInt32(valueAt, little)
      const denominator = type === 5 ? view.getUint32(valueAt + 4, little) : view.getInt32(valueAt + 4, little)
      value = denominator ? numerator / denominator : 0
    } else if (type === 1 || type === 7) {
      value = view.getUint8(valueAt)
    }
    visit(tag, value)
  }
}

function formatExposure(seconds: number) {
  if (seconds >= 1) {
    return `${seconds.toFixed(1)} s`
  }
  return `1/${Math.round(1 / seconds)} s`
}

/** Reads the TIFF block an EXIF segment holds, at `tiff` bytes into `bytes`. */
function readExifBlock(bytes: Uint8Array, tiff: number): MetaRow[] {
  if (tiff + 8 > bytes.length) {
    return []
  }
  const order = String.fromCharCode(bytes[tiff], bytes[tiff + 1])
  if (order !== 'II' && order !== 'MM') {
    return []
  }
  const little = order === 'II'
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
  if (view.getUint16(tiff + 2, little) !== 42) {
    return []
  }

  const values = new Map<number, ExifValue>()
  let exifIfd = 0
  let gpsIfd = 0
  const collect = (tag: number, value: ExifValue | undefined) => {
    if (value === undefined) return
    if (tag === 0x8769) exifIfd = tiff + Number(value)
    else if (tag === 0x8825) gpsIfd = tiff + Number(value)
    else if (!values.has(tag)) values.set(tag, value)
  }
  readIfd(view, bytes, tiff, tiff + view.getUint32(tiff + 4, little), little, collect)
  if (exifIfd) readIfd(view, bytes, tiff, exifIfd, little, collect)
  if (gpsIfd) readIfd(view, bytes, tiff, gpsIfd, little, collect)

  const rows: MetaRow[] = []
  const add = (label: string, value: string | undefined | null) => {
    if (value !== undefined && value !== null && value !== '') rows.push({ label, value })
  }
  const text = (tag: number) => {
    const value = values.get(tag)
    return typeof value === 'string' && value ? value : undefined
  }
  const num = (tag: number) => {
    const value = values.get(tag)
    return typeof value === 'number' ? value : undefined
  }

  add('Camera', [text(0x010f), text(0x0110)].filter(Boolean).join(' ') || undefined)
  add('Lens', text(0xa434))
  add('Taken', text(0x9003) ?? text(0x0132))
  const exposure = num(0x829a)
  add('Exposure', exposure ? formatExposure(exposure) : undefined)
  const aperture = num(0x829d)
  add('Aperture', aperture ? `f/${aperture.toFixed(1).replace(/\.0$/, '')}` : undefined)
  const iso = num(0x8827)
  add('ISO', iso ? `ISO ${iso}` : undefined)
  const focal = num(0x920a)
  add('Focal length', focal ? `${focal.toFixed(0)} mm` : undefined)
  const program = num(0x8822)
  add('Exposure program', program ? exposurePrograms[program] : undefined)
  const metering = num(0x9207)
  add('Metering', metering ? meteringModes[metering] : undefined)
  const flash = num(0x9209)
  add('Flash', flash === undefined ? undefined : (flash & 1) === 1 ? 'Fired' : 'Did not fire')
  const balance = num(0xa403)
  add('White balance', balance === undefined ? undefined : whiteBalances[balance])
  const orientation = num(0x0112)
  add('Orientation', orientation ? orientations[orientation] : undefined)
  const colorSpace = num(0xa001)
  add('Colour space', colorSpace === 1 ? 'sRGB' : colorSpace === 0xffff ? 'Uncalibrated' : undefined)
  add('Software', text(0x0131))
  add('Artist', text(0x013b))
  add('Copyright', text(0x8298))
  return rows
}

/** Walks a JPEG's markers to its EXIF segment, if it has one. */
export function readJpegExif(bytes: Uint8Array): MetaRow[] {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return []
  }
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return []
    }
    const marker = bytes[offset + 1]
    // Start of scan, end of image: the metadata is all behind us.
    if (marker === 0xda || marker === 0xd9) {
      return []
    }
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (size < 2) {
      return []
    }
    if (marker === 0xe1 && readAscii(bytes, offset + 4, 4) === 'Exif') {
      return readExifBlock(bytes, offset + 10)
    }
    offset += 2 + size
  }
  return []
}

/* ------------------------------------------------------------- containers */

const pngColorTypes: Record<number, string> = {
  0: 'Greyscale', 2: 'Truecolour', 3: 'Indexed', 4: 'Greyscale with alpha', 6: 'Truecolour with alpha',
}

function readPng(bytes: Uint8Array): MetaRow[] {
  if (bytes.length < 26) {
    return []
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length)
  const rows: MetaRow[] = [
    { label: 'Bit depth', value: `${bytes[24]} bits per channel` },
    { label: 'Colour type', value: pngColorTypes[bytes[25]] ?? String(bytes[25]) },
  ]
  if (bytes[28] === 1) {
    rows.push({ label: 'Interlaced', value: 'Adam7' })
  }
  rows.unshift({ label: 'Pixels', value: `${view.getUint32(16)} x ${view.getUint32(20)}` })
  return rows
}

function readGif(bytes: Uint8Array): MetaRow[] {
  if (bytes.length < 13) {
    return []
  }
  const flags = bytes[10]
  return [
    { label: 'Version', value: readAscii(bytes, 0, 6) },
    { label: 'Colour table', value: `${2 ** ((flags & 0x07) + 1)} colours` },
  ]
}

/** The name people use for a file of this type, and its rows of detail. */
export function describeFile(name: string, mime: string | undefined, buffer: ArrayBuffer | undefined): MetaRow[] {
  if (!buffer || buffer.byteLength < 16) {
    return []
  }
  const bytes = new Uint8Array(buffer)
  const lower = name.toLowerCase()
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const rows = readJpegExif(bytes)
    // A tagged photo says which space its numbers are in; without this an
    // Adobe RGB file opens looking flat and nothing explains why.
    const profile = embeddedProfileName(bytes)
    if (profile) rows.push({ label: 'Colour profile', value: profile })
    return rows
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return readPng(bytes)
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return readGif(bytes)
  }
  // A TIFF is an EXIF block with no JPEG wrapper around it.
  if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) {
    if (/\.tiff?$/i.test(lower) || mime === 'image/tiff') {
      return readExifBlock(bytes, 0)
    }
  }
  return []
}

/** The name of the ICC profile a JPEG carries, if it carries one we can read. */
export function embeddedProfileName(bytes: Uint8Array) {
  const icc = iccFromJpeg(bytes)
  if (!icc) {
    return null
  }
  return parseIccProfile(icc)?.name ?? 'Embedded profile'
}

export function formatName(name: string, mime?: string) {
  const extension = name.includes('.') ? name.split('.').pop()?.toUpperCase() : undefined
  return extension ?? mime ?? 'Unknown'
}
