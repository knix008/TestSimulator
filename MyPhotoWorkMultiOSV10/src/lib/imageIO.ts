import * as UTIF from 'utif'
import type { LibHeif } from 'libheif-js/wasm-bundle.js'
import { canvasToDataUrl, canvasFromUrl, context2d, createCanvas, resizeCanvasContent } from './canvas'
import { hasDicomMagic, isDicomSource, readDicom } from './dicom'
import { describeFile, type MetaRow } from './metadata'
import { defaultEffects } from './types'
import type { ExportFormat, LayerMeta, PageOrientation, PhotoDocument, ProjectFile, SerializedLayer } from './types'

function metaFromSerialized(layer: SerializedLayer): LayerMeta {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    fillOpacity: layer.fillOpacity ?? 1,
    blendMode: layer.blendMode,
    locked: layer.locked,
    kind: layer.kind ?? 'raster',
    clipped: layer.clipped ?? false,
    maskEnabled: layer.maskEnabled ?? false,
    smart: layer.smart ?? false,
    parentId: layer.parentId,
    adjustment: layer.adjustment,
    curves: layer.curves,
    levels: layer.levels,
    fill: layer.fill,
    text: layer.text,
    shape: layer.shape,
    effects: layer.effects ?? defaultEffects(),
    collapsed: layer.collapsed ?? false,
  }
}

/** Turns the base64 payload of a data URL back into the bytes it encodes. */
function bytesFromDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/** True for the formats only UTIF can read. */
export function isTiffSource(name: string, mime?: string) {
  return mime === 'image/tiff' || /\.tiff?$/i.test(name)
}

/**
 * True for the HEIF family (Apple's HEIC photos and plain HEIF).
 *
 * No browser decodes these, so they take the libheif route rather than the
 * `<img>` one. `.hif` is Fujifilm's spelling of the same container.
 */
export function isHeifSource(name: string, mime?: string) {
  if (mime && /^image\/(heic|heif)(-sequence)?$/.test(mime)) {
    return true
  }
  return /\.(heic|heif|hif|heics|heifs)$/i.test(name)
}

export async function decodeImageSource(file: { name: string; mime?: string; text?: string; dataUrl?: string; arrayBuffer?: ArrayBuffer }) {
  if (file.text && (file.name.toLowerCase().endsWith('.mpw') || file.mime === 'application/json')) {
    return { kind: 'project' as const, project: JSON.parse(file.text) as ProjectFile }
  }
  const buffer = file.arrayBuffer ?? (file.dataUrl ? bytesFromDataUrl(file.dataUrl) : null)
  if (buffer && isTiffSource(file.name, file.mime)) {
    return { kind: 'canvas' as const, canvas: decodeTiff(buffer), details: describeFile(file.name, file.mime, buffer) }
  }
  if (buffer && isHeifSource(file.name, file.mime)) {
    const { canvas, details } = await readHeif(buffer)
    return { kind: 'canvas' as const, canvas, details }
  }
  if (buffer && (isDicomSource(file.name, file.mime) || hasDicomMagic(buffer))) {
    const { canvas, details } = await readDicom(buffer)
    return { kind: 'canvas' as const, canvas, details }
  }
  if (file.dataUrl) {
    return {
      kind: 'canvas' as const,
      canvas: await canvasFromUrl(file.dataUrl),
      details: describeFile(file.name, file.mime, buffer ?? undefined),
    }
  }
  throw new Error(`Unsupported file: ${file.name}`)
}

/**
 * libheif is a 2 MB WebAssembly build, so it is pulled in on the first HEIC the
 * user opens rather than at start-up, and kept for every one after that.
 */
let heifLibrary: Promise<LibHeif> | null = null

function loadHeif() {
  if (!heifLibrary) {
    // The explicit .js is what Node's own ESM resolver needs; the package
    // predates "exports" and so has no extensionless subpath to offer.
    heifLibrary = import('libheif-js/wasm-bundle.js').then((module) => module.default ?? (module as unknown as LibHeif))
  }
  return heifLibrary
}

export async function readHeif(buffer: ArrayBuffer) {
  const libheif = await loadHeif()
  // libheif reports a malformed container on the console and hands back an
  // empty list rather than throwing, so the emptiness is the error signal.
  const images = new libheif.HeifDecoder().decode(new Uint8Array(buffer))
  if (images.length === 0) {
    throw new Error('HEIF file has no image data')
  }
  try {
    // A burst or Live Photo holds several frames; the primary one is the photo.
    const image = images.find((item) => item.is_primary()) ?? images[0]
    const width = image.get_width()
    const height = image.get_height()
    if (!width || !height) {
      throw new Error('HEIF file has no image data')
    }
    const canvas = createCanvas(width, height)
    const ctx = context2d(canvas)
    const pixels = ctx.createImageData(width, height)
    await new Promise<void>((resolve, reject) => {
      image.display(pixels, (result) => {
        if (result) resolve()
        else reject(new Error('HEIF image could not be decoded'))
      })
    })
    ctx.putImageData(pixels, 0, 0)
    const details: MetaRow[] = [
      { label: 'Primary image', value: `${width} x ${height}` },
      { label: 'Alpha channel', value: image.has_alpha_channel() ? 'Yes' : 'No' },
    ]
    if (images.length > 1) {
      details.push({ label: 'Images in file', value: `${images.length} (showing the primary one)` })
    }
    return { canvas, details }
  } finally {
    // Every frame holds WASM heap memory, including the ones we skipped.
    for (const item of images) {
      item.free()
    }
  }
}

export async function decodeHeif(buffer: ArrayBuffer) {
  return (await readHeif(buffer)).canvas
}

export function decodeTiff(buffer: ArrayBuffer) {
  const ifds = UTIF.decode(buffer)
  if (!ifds[0]) {
    throw new Error('TIFF file has no image data')
  }
  UTIF.decodeImage(buffer, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const width = ifds[0].width ?? 0
  const height = ifds[0].height ?? 0
  // A truncated or non-TIFF buffer still parses into an IFD, just one with no
  // dimensions. Report that rather than handing back a blank 1x1 document.
  if (!width || !height) {
    throw new Error('TIFF file has no image data')
  }
  const canvas = createCanvas(width, height)
  const image = context2d(canvas).createImageData(width, height)
  image.data.set(rgba)
  context2d(canvas).putImageData(image, 0, 0)
  return canvas
}

export function serializeProject(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>): ProjectFile {
  const layers: SerializedLayer[] = document.layers.map((layer) => {
    const canvas = canvases.get(layer.id)
    const mask = canvases.get(`${layer.id}:mask`)
    return {
      ...layer,
      dataUrl: canvas ? canvasToDataUrl(canvas) : undefined,
      maskUrl: mask ? canvasToDataUrl(mask) : undefined,
    }
  })
  return {
    format: 'myphotowork',
    version: 2,
    name: document.name,
    width: document.width,
    height: document.height,
    background: document.background,
    activeLayerId: document.activeLayerId,
    layers,
    guides: document.guides,
    notes: document.notes,
    samplers: document.samplers,
    counts: document.counts,
    paths: document.paths,
    slices: document.slices,
    frames: document.frames,
    measure: document.measure,
    colorMode: document.colorMode,
  }
}

export async function restoreProject(project: ProjectFile) {
  if (project.format !== 'myphotowork') {
    throw new Error('Not a My Photo Work project')
  }
  const canvases = new Map<string, HTMLCanvasElement>()
  for (const layer of project.layers) {
    if (layer.dataUrl) {
      canvases.set(layer.id, await canvasFromUrl(layer.dataUrl))
    }
    if (layer.maskUrl) {
      canvases.set(`${layer.id}:mask`, await canvasFromUrl(layer.maskUrl))
    }
  }
  const document: PhotoDocument = {
    name: project.name,
    width: project.width,
    height: project.height,
    background: project.background,
    layers: project.layers.map(metaFromSerialized),
    activeLayerId: project.activeLayerId,
    guides: project.guides ?? [],
    notes: project.notes ?? [],
    samplers: project.samplers ?? [],
    counts: project.counts ?? [],
    paths: project.paths ?? [],
    slices: project.slices ?? [],
    frames: project.frames ?? [],
    measure: project.measure ?? null,
    colorMode: project.colorMode ?? 'rgb',
  }
  return { document, canvases }
}

/** The export formats whose files can carry an alpha channel; JPEG cannot. */
const transparentFormats: ExportFormat[] = ['png', 'webp', 'avif', 'gif', 'tiff']

export function supportsTransparency(format: ExportFormat) {
  return transparentFormats.includes(format)
}

/**
 * A small opaque copy of the composite, for the print preview: full-size data
 * URLs are megabytes, and a popup window is handed its payload over IPC.
 */
export function previewSheet(canvas: HTMLCanvasElement, maxSide = 900) {
  const sheet = flattenOnto(canvas)
  const scale = Math.min(1, maxSide / Math.max(sheet.width, sheet.height))
  const scaled = scale < 1 ? resizeCanvasContent(sheet, Math.round(sheet.width * scale), Math.round(sheet.height * scale)) : sheet
  // JPEG, not PNG: the sheet is already opaque, and a photo-sized PNG data URL
  // runs to the best part of a megabyte for a picture nobody prints from.
  return canvasToDataUrl(scaled, 'image/jpeg', 0.85)
}

/** The way round the paper goes if the user does not say: follow the picture. */
export function naturalOrientation(canvas: { width: number; height: number }): PageOrientation {
  return canvas.width > canvas.height ? 'landscape' : 'portrait'
}

/** Lays the image on an opaque sheet, the way paper or a JPEG would show it. */
export function flattenOnto(canvas: HTMLCanvasElement, color = '#ffffff') {
  const flattened = createCanvas(canvas.width, canvas.height)
  const ctx = context2d(flattened)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(canvas, 0, 0)
  return flattened
}

/**
 * `transparent` is the user's choice from the export dialog. It only reaches
 * the file for the formats that can store alpha; JPEG is flattened regardless,
 * because the encoder would otherwise turn see-through pixels black.
 */
export async function encodeExport(canvas: HTMLCanvasElement, format: ExportFormat, quality = 0.92, transparent = true) {
  const source = transparent && supportsTransparency(format) ? canvas : flattenOnto(canvas)
  if (format === 'tiff') {
    const image = context2d(source).getImageData(0, 0, source.width, source.height)
    const encoded = UTIF.encodeImage(new Uint8Array(image.data), source.width, source.height)
    const bytes = new Uint8Array(encoded)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return `data:image/tiff;base64,${btoa(binary)}`
  }
  const mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`
  try {
    return canvasToDataUrl(source, mime, quality)
  } catch {
    return canvasToDataUrl(source, 'image/png')
  }
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character] ?? character
  ))
}

/**
 * The one-page document the printer is handed: the flattened image, scaled to
 * fit the sheet without cropping and without stretching. Built as markup so the
 * page carries none of the editor's own chrome.
 */
export function printableDocument(dataUrl: string, title: string, orientation: PageOrientation = 'auto') {
  // `size` takes an orientation on its own, which keeps whatever paper the
  // print dialog is set to and only turns it round.
  const page = orientation === 'auto' ? '@page { margin: 10mm; }' : `@page { size: ${orientation}; margin: 10mm; }`
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    page,
    'html, body { height: 100%; margin: 0; padding: 0; background: #ffffff; }',
    'img { display: block; width: 100%; height: 100%; object-fit: contain; }',
    '</style></head><body>',
    `<img alt="${escapeHtml(title)}" src="${dataUrl}">`,
    '</body></html>',
  ].join('')
}

/**
 * Prints an image through an off-screen frame, so the browser's own print
 * dialog does the work on every platform and the editor window is never what
 * lands on paper. Resolves once the dialog has been dismissed.
 */
export function printDataUrl(dataUrl: string, title: string, orientation: PageOrientation = 'auto') {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.setAttribute('tabindex', '-1')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0'
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      // Removing the frame while the dialog is still tearing down cancels the
      // job on some engines, so the cleanup trails it.
      window.setTimeout(() => frame.parentNode?.removeChild(frame), 1000)
      resolve()
    }
    frame.onload = () => {
      const view = frame.contentWindow
      if (!view) {
        frame.parentNode?.removeChild(frame)
        reject(new Error('The print preview could not be opened'))
        return
      }
      view.addEventListener('afterprint', done)
      try {
        view.focus()
        view.print()
      } catch (cause) {
        settled = true
        frame.parentNode?.removeChild(frame)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
        return
      }
      // Not every engine fires afterprint; the frame still has to go away.
      window.setTimeout(done, 60_000)
    }
    frame.srcdoc = printableDocument(dataUrl, title, orientation)
    document.body.appendChild(frame)
  })
}

export function extensionFor(format: ExportFormat) {
  return format === 'jpg' ? 'jpg' : format
}

export async function fileToOpenItem(file: File) {
  if (file.name.toLowerCase().endsWith('.mpw')) {
    return { name: file.name, mime: 'application/json', text: await file.text() }
  }
  const buffer = await file.arrayBuffer()
  const mime = file.type || 'application/octet-stream'
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return { name: file.name, mime, dataUrl: `data:${mime};base64,${btoa(binary)}`, arrayBuffer: buffer, size: file.size }
}
