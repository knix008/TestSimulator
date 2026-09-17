import * as UTIF from 'utif'
import { canvasToDataUrl, canvasFromUrl, context2d, createCanvas } from './canvas'
import { defaultEffects } from './types'
import type { ExportFormat, LayerMeta, PhotoDocument, ProjectFile, SerializedLayer } from './types'

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

export async function decodeImageSource(file: { name: string; mime?: string; text?: string; dataUrl?: string; arrayBuffer?: ArrayBuffer }) {
  if (file.text && (file.name.toLowerCase().endsWith('.mpw') || file.mime === 'application/json')) {
    return { kind: 'project' as const, project: JSON.parse(file.text) as ProjectFile }
  }
  if (file.dataUrl && (file.mime === 'image/tiff' || /\.tiff?$/i.test(file.name))) {
    const base64 = file.dataUrl.split(',')[1] ?? ''
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return { kind: 'canvas' as const, canvas: decodeTiff(bytes.buffer) }
  }
  if (file.arrayBuffer && (file.mime === 'image/tiff' || /\.tiff?$/i.test(file.name))) {
    return { kind: 'canvas' as const, canvas: decodeTiff(file.arrayBuffer) }
  }
  if (file.dataUrl) {
    return { kind: 'canvas' as const, canvas: await canvasFromUrl(file.dataUrl) }
  }
  throw new Error(`Unsupported file: ${file.name}`)
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

export async function encodeExport(canvas: HTMLCanvasElement, format: ExportFormat, quality = 0.92) {
  if (format === 'tiff') {
    const image = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
    const encoded = UTIF.encodeImage(new Uint8Array(image.data), canvas.width, canvas.height)
    const bytes = new Uint8Array(encoded)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return `data:image/tiff;base64,${btoa(binary)}`
  }
  const mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`
  if (format === 'jpg') {
    const flattened = createCanvas(canvas.width, canvas.height)
    const ctx = context2d(flattened)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(canvas, 0, 0)
    return canvasToDataUrl(flattened, mime, quality)
  }
  try {
    return canvasToDataUrl(canvas, mime, quality)
  } catch {
    return canvasToDataUrl(canvas, 'image/png')
  }
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.click()
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
  return { name: file.name, mime, dataUrl: `data:${mime};base64,${btoa(binary)}`, arrayBuffer: buffer }
}
