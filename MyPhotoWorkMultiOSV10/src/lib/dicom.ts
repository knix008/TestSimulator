import { canvasFromUrl, context2d, createCanvas } from './canvas'
import type { MetaRow } from './metadata'

/**
 * DICOM (`.dcm`) reading.
 *
 * A DICOM file is a tagged data set with one image buried in it, so the work is
 * in turning stored values into pixels: the modality LUT (slope/intercept)
 * converts them to real units, the VOI LUT (window centre/width) picks the slice
 * of that range the screen shows, and MONOCHROME1 means white is zero. Studies
 * are commonly 16-bit, so there is no "just draw it" path — the window has to be
 * applied, and when the file names no window one is taken from the data.
 *
 * Uncompressed transfer syntaxes are decoded here; baseline JPEG is handed to
 * the browser, which already has that decoder. Anything else is reported by
 * name rather than opened as a blank image.
 */

type DicomElement = {
  dataOffset: number
  length: number
  encapsulatedPixelData?: boolean
  fragments?: unknown[]
}

type DicomDataSet = {
  byteArray: Uint8Array
  elements: Record<string, DicomElement | undefined>
  string(tag: string): string | undefined
  uint16(tag: string): number | undefined
  intString(tag: string): number | undefined
  floatString(tag: string, index?: number): number | undefined
}

type DicomParser = {
  parseDicom(bytes: Uint8Array): DicomDataSet
  readEncapsulatedImageFrame(dataSet: DicomDataSet, element: DicomElement, frame: number): Uint8Array
  readEncapsulatedPixelDataFromFragments(dataSet: DicomDataSet, element: DicomElement, frame: number): Uint8Array
}

let parser: Promise<DicomParser> | null = null

function loadParser() {
  if (!parser) {
    parser = import('dicom-parser').then((module) => (module.default ?? module) as unknown as DicomParser)
  }
  return parser
}

export function isDicomSource(name: string, mime?: string) {
  if (mime === 'application/dicom' || mime === 'image/dicom') {
    return true
  }
  return /\.(dcm|dicom)$/i.test(name)
}

/** The 132-byte preamble ending in "DICM", which is what makes a file DICOM. */
export function hasDicomMagic(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 132) {
    return false
  }
  return bytes[128] === 0x44 && bytes[129] === 0x49 && bytes[130] === 0x43 && bytes[131] === 0x4d
}

const littleEndianSyntaxes = new Set([
  '1.2.840.10008.1.2', // implicit VR little endian
  '1.2.840.10008.1.2.1', // explicit VR little endian
  '1.2.840.10008.1.2.1.99', // deflated explicit VR little endian
])

const bigEndianSyntax = '1.2.840.10008.1.2.2'

/** The encapsulated syntaxes whose frames are a file the browser can open. */
const browserDecodable: Record<string, string> = {
  '1.2.840.10008.1.2.4.50': 'image/jpeg', // JPEG baseline
}

const syntaxNames: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless (first-order prediction)',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS Lossy',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
}

/** DICOM dates are YYYYMMDD and times HHMMSS.frac; shown as people write them. */
function formatDate(value: string | undefined) {
  if (!value || value.length < 8) {
    return value
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
}

function formatTime(value: string | undefined) {
  if (!value || value.length < 6) {
    return value
  }
  return `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`
}

/** "Doe^Jane^^Dr" is how DICOM writes a name. */
function formatPersonName(value: string | undefined) {
  if (!value) {
    return value
  }
  const parts = value.split('^').filter(Boolean)
  if (parts.length < 2) {
    return value
  }
  return `${parts.slice(1).join(' ')} ${parts[0]}`.trim()
}

const detailTags: { tag: string; label: string; format?: (value: string) => string | undefined }[] = [
  { tag: 'x00080060', label: 'Modality' },
  { tag: 'x00081030', label: 'Study description' },
  { tag: 'x0008103e', label: 'Series description' },
  { tag: 'x00080020', label: 'Study date', format: formatDate },
  { tag: 'x00080030', label: 'Study time', format: formatTime },
  { tag: 'x00100010', label: 'Patient name', format: formatPersonName },
  { tag: 'x00100020', label: 'Patient ID' },
  { tag: 'x00100040', label: 'Patient sex' },
  { tag: 'x00100030', label: 'Patient birth date', format: formatDate },
  { tag: 'x00081090', label: 'Model' },
  { tag: 'x00080070', label: 'Manufacturer' },
  { tag: 'x00080080', label: 'Institution' },
  { tag: 'x00180015', label: 'Body part' },
  { tag: 'x00185100', label: 'Patient position' },
  { tag: 'x00180050', label: 'Slice thickness' },
  { tag: 'x00280030', label: 'Pixel spacing' },
  { tag: 'x00180060', label: 'KVP' },
  { tag: 'x00181150', label: 'Exposure time' },
  { tag: 'x00200013', label: 'Instance number' },
]

/** DICOM separates repeated values with a backslash; people read them apart. */
function readable(value: string) {
  return value.split('\\').join(' / ')
}

function tagRows(dataSet: DicomDataSet) {
  const rows: MetaRow[] = []
  for (const { tag, label, format } of detailTags) {
    const raw = text(dataSet, tag)
    const value = raw && format ? format(raw) : raw
    if (value) {
      rows.push({ label, value: readable(value) })
    }
  }
  return rows
}

function text(dataSet: DicomDataSet, tag: string) {
  try {
    return dataSet.string(tag)?.trim() || undefined
  } catch {
    return undefined
  }
}

function number(dataSet: DicomDataSet, tag: string) {
  try {
    const value = dataSet.uint16(tag)
    return typeof value === 'number' ? value : undefined
  } catch {
    return undefined
  }
}

/** DS values can be a backslash-separated pair; the first one is the one meant. */
function decimal(dataSet: DicomDataSet, tag: string) {
  const raw = text(dataSet, tag)
  if (!raw) {
    return undefined
  }
  const first = Number.parseFloat(raw.split('\\')[0])
  return Number.isFinite(first) ? first : undefined
}

/** Stored values, with the file's endianness and sign applied. */
function storedValues(dataSet: DicomDataSet, element: DicomElement, count: number, bits: number, signed: boolean, little: boolean) {
  const { byteArray } = dataSet
  const view = new DataView(byteArray.buffer, byteArray.byteOffset + element.dataOffset, Math.min(element.length, count * (bits / 8)))
  const values = new Float64Array(count)
  for (let i = 0; i < count; i += 1) {
    if (bits === 8) {
      values[i] = signed ? view.getInt8(i) : view.getUint8(i)
    } else {
      const at = i * 2
      if (at + 1 >= view.byteLength) break
      values[i] = signed ? view.getInt16(at, little) : view.getUint16(at, little)
    }
  }
  return values
}

function extremes(values: Float64Array) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 }
  }
  return { min, max: max > min ? max : min + 1 }
}

export type DicomResult = { canvas: HTMLCanvasElement; details: MetaRow[] }

export async function readDicom(buffer: ArrayBuffer): Promise<DicomResult> {
  const dicomParser = await loadParser()
  let dataSet: DicomDataSet
  try {
    dataSet = dicomParser.parseDicom(new Uint8Array(buffer))
  } catch (cause) {
    throw new Error(`This is not a DICOM file: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
  }

  const syntax = text(dataSet, 'x00020010') ?? '1.2.840.10008.1.2'
  const rows = tagRows(dataSet)
  rows.push({ label: 'Transfer syntax', value: syntaxNames[syntax] ?? syntax })

  const width = number(dataSet, 'x00280011') ?? 0
  const height = number(dataSet, 'x00280010') ?? 0
  if (!width || !height) {
    throw new Error('The DICOM file carries no image')
  }
  const samples = number(dataSet, 'x00280002') ?? 1
  const photometric = text(dataSet, 'x00280004') ?? 'MONOCHROME2'
  const bits = number(dataSet, 'x00280100') ?? 16
  const signed = (number(dataSet, 'x00280103') ?? 0) === 1
  const frames = Number.parseInt(text(dataSet, 'x00280008') ?? '1', 10) || 1
  rows.push({ label: 'Image', value: `${width} x ${height}, ${bits}-bit ${photometric}` })
  if (frames > 1) {
    rows.push({ label: 'Frames', value: `${frames} (showing the first)` })
  }

  const element = dataSet.elements.x7fe00010
  if (!element) {
    throw new Error('The DICOM file carries no image')
  }

  // Encapsulated: the frame is a complete image file of its own.
  if (element.encapsulatedPixelData) {
    const mime = browserDecodable[syntax]
    if (!mime) {
      throw new Error(`This DICOM uses ${syntaxNames[syntax] ?? syntax}, which this build cannot decompress`)
    }
    const frame = dicomParser.readEncapsulatedImageFrame(dataSet, element, 0)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < frame.length; i += chunk) {
      binary += String.fromCharCode(...frame.subarray(i, i + chunk))
    }
    return { canvas: await canvasFromUrl(`data:${mime};base64,${btoa(binary)}`), details: rows }
  }

  if (syntax !== bigEndianSyntax && !littleEndianSyntaxes.has(syntax)) {
    throw new Error(`This DICOM uses ${syntaxNames[syntax] ?? syntax}, which this build cannot decompress`)
  }
  const little = syntax !== bigEndianSyntax

  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  const pixels = width * height

  if (samples >= 3) {
    // RGB, either interleaved or one plane per channel.
    const planar = (number(dataSet, 'x00280006') ?? 0) === 1
    const bytes = dataSet.byteArray
    const base = element.dataOffset
    for (let i = 0; i < pixels; i += 1) {
      const r = planar ? bytes[base + i] : bytes[base + i * 3]
      const g = planar ? bytes[base + pixels + i] : bytes[base + i * 3 + 1]
      const b = planar ? bytes[base + pixels * 2 + i] : bytes[base + i * 3 + 2]
      image.data[i * 4] = r
      image.data[i * 4 + 1] = g
      image.data[i * 4 + 2] = b
      image.data[i * 4 + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
    return { canvas, details: rows }
  }

  const stored = storedValues(dataSet, element, pixels, bits === 8 ? 8 : 16, signed, little)
  const slope = decimal(dataSet, 'x00281053') ?? 1
  const intercept = decimal(dataSet, 'x00281052') ?? 0
  if (slope !== 1 || intercept !== 0) {
    for (let i = 0; i < stored.length; i += 1) {
      stored[i] = stored[i] * slope + intercept
    }
    rows.push({ label: 'Rescale', value: `slope ${slope}, intercept ${intercept}` })
  }

  // The window the file asks for, or the one the data itself implies.
  let center = decimal(dataSet, 'x00281050')
  let windowWidth = decimal(dataSet, 'x00281051')
  if (center === undefined || windowWidth === undefined || windowWidth <= 0) {
    const { min, max } = extremes(stored)
    center = (min + max) / 2
    windowWidth = max - min
    rows.push({ label: 'Window', value: `auto (centre ${center.toFixed(0)}, width ${windowWidth.toFixed(0)})` })
  } else {
    rows.push({ label: 'Window', value: `centre ${center}, width ${windowWidth}` })
  }

  const invert = photometric === 'MONOCHROME1'
  const low = center - 0.5 - (windowWidth - 1) / 2
  const span = windowWidth - 1 || 1
  for (let i = 0; i < pixels; i += 1) {
    let level = ((stored[i] - low) / span) * 255
    level = level < 0 ? 0 : level > 255 ? 255 : level
    const value = invert ? 255 - level : level
    image.data[i * 4] = value
    image.data[i * 4 + 1] = value
    image.data[i * 4 + 2] = value
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return { canvas, details: rows }
}

export async function decodeDicom(buffer: ArrayBuffer) {
  return (await readDicom(buffer)).canvas
}
