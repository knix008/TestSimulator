import type { FillData, LayerMeta, PhotoDocument, Point } from './types'
import { defaultEffects } from './types'
import { applyAdjustment } from './adjustments'
import { applyLayerEffects, rasterizeShape, rasterizeTextLayer } from './effects'

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

export function context2d(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('2D canvas is not available')
  }
  return ctx
}

export function clearCanvas(canvas: HTMLCanvasElement) {
  context2d(canvas).clearRect(0, 0, canvas.width, canvas.height)
}

export function cloneCanvas(source: HTMLCanvasElement) {
  const copy = createCanvas(source.width, source.height)
  context2d(copy).drawImage(source, 0, 0)
  return copy
}

export function canvasToDataUrl(canvas: HTMLCanvasElement, type = 'image/png', quality?: number) {
  return canvas.toDataURL(type, quality)
}

export async function imageFromUrl(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to decode image'))
    image.src = src
  })
}

export async function canvasFromUrl(src: string) {
  const image = await imageFromUrl(src)
  const canvas = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height)
  context2d(canvas).drawImage(image, 0, 0)
  return canvas
}

export function resizeCanvasContent(source: HTMLCanvasElement, width: number, height: number) {
  const next = createCanvas(width, height)
  context2d(next).drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height)
  return next
}

export function padCanvas(source: HTMLCanvasElement, width: number, height: number, offsetX: number, offsetY: number) {
  const next = createCanvas(width, height)
  context2d(next).drawImage(source, offsetX, offsetY)
  return next
}

export function createLayerMeta(name: string, kind: LayerMeta['kind'] = 'raster'): LayerMeta {
  return {
    id: createId('layer'),
    name,
    visible: true,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'source-over',
    locked: false,
    kind,
    clipped: false,
    maskEnabled: false,
    smart: false,
    effects: defaultEffects(),
  }
}

export function createBlankDocument(name: string, width: number, height: number, background: PhotoDocument['background'], layerName: string): { document: PhotoDocument; canvases: Map<string, HTMLCanvasElement> } {
  const layer = createLayerMeta(layerName)
  const canvas = createCanvas(width, height)
  if (background !== 'transparent') {
    const ctx = context2d(canvas)
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  return {
    document: {
      name,
      width,
      height,
      background,
      layers: [layer],
      activeLayerId: layer.id,
      guides: [],
      notes: [],
      samplers: [],
      counts: [],
      colorMode: 'rgb',
    },
    canvases: new Map([[layer.id, canvas]]),
  }
}

function paintFill(width: number, height: number, fill: FillData) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  if (fill.kind === 'solid' || fill.kind === 'pattern') {
    ctx.fillStyle = fill.color
    ctx.fillRect(0, 0, width, height)
    if (fill.kind === 'pattern') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      for (let y = 0; y < height; y += 16) {
        for (let x = 0; x < width; x += 16) {
          if ((x + y) % 32 === 0) ctx.fillRect(x, y, 16, 16)
        }
      }
    }
    return canvas
  }
  const gradient = fill.gradientKind === 'radial'
    ? ctx.createRadialGradient(fill.start.x, fill.start.y, 0, fill.start.x, fill.start.y, Math.hypot(fill.end.x - fill.start.x, fill.end.y - fill.start.y) || 1)
    : ctx.createLinearGradient(fill.start.x, fill.start.y, fill.end.x, fill.end.y)
  gradient.addColorStop(0, fill.color)
  gradient.addColorStop(1, fill.endColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  return canvas
}

function layerSource(layer: LayerMeta, document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>) {
  if (layer.kind === 'text' && layer.text) {
    return rasterizeTextLayer(document.width, document.height, layer.text)
  }
  if (layer.kind === 'shape' && layer.shape) {
    return rasterizeShape(document.width, document.height, layer.shape)
  }
  if (layer.kind === 'fill' && layer.fill) {
    return paintFill(document.width, document.height, layer.fill)
  }
  return canvases.get(layer.id) ?? null
}

export function compositeDocument(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, target?: HTMLCanvasElement) {
  const canvas = target ?? createCanvas(document.width, document.height)
  if (canvas.width !== document.width || canvas.height !== document.height) {
    canvas.width = document.width
    canvas.height = document.height
  }
  const ctx = context2d(canvas)
  ctx.clearRect(0, 0, document.width, document.height)
  if (document.background !== 'transparent') {
    ctx.fillStyle = document.background
    ctx.fillRect(0, 0, document.width, document.height)
  }
  for (const layer of document.layers) {
    if (!layer.visible || layer.kind === 'group') {
      continue
    }
    if (layer.kind === 'adjustment' && layer.adjustment) {
      const image = ctx.getImageData(0, 0, document.width, document.height)
      applyAdjustment(image.data, layer.adjustment)
      const mask = layer.maskEnabled ? canvases.get(`${layer.id}:mask`) : null
      if (mask) {
        const maskData = context2d(mask).getImageData(0, 0, document.width, document.height).data
        const current = ctx.getImageData(0, 0, document.width, document.height)
        for (let i = 0; i < image.data.length; i += 4) {
          const m = maskData[i] / 255
          image.data[i] = current.data[i] * (1 - m) + image.data[i] * m
          image.data[i + 1] = current.data[i + 1] * (1 - m) + image.data[i + 1] * m
          image.data[i + 2] = current.data[i + 2] * (1 - m) + image.data[i + 2] * m
        }
      }
      ctx.putImageData(image, 0, 0)
      continue
    }
    const source = layerSource(layer, document, canvases)
    if (!source) {
      continue
    }
    const effected = applyLayerEffects(source, layer.effects ?? defaultEffects())
    ctx.save()
    ctx.globalAlpha = layer.opacity * (layer.fillOpacity ?? 1)
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation
    if (layer.maskEnabled) {
      const mask = canvases.get(`${layer.id}:mask`)
      if (mask) {
        ctx.globalCompositeOperation = 'source-over'
        const temp = createCanvas(document.width, document.height)
        const tctx = context2d(temp)
        tctx.drawImage(effected, 0, 0)
        tctx.globalCompositeOperation = 'destination-in'
        tctx.drawImage(mask, 0, 0)
        ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation
        ctx.drawImage(temp, 0, 0)
        ctx.restore()
        continue
      }
    }
    ctx.drawImage(effected, 0, 0)
    ctx.restore()
  }
  if (document.colorMode === 'gray') {
    const image = ctx.getImageData(0, 0, document.width, document.height)
    for (let i = 0; i < image.data.length; i += 4) {
      const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v
    }
    ctx.putImageData(image, 0, 0)
  }
  return canvas
}

export function sampleComposite(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, point: Point) {
  const x = Math.floor(point.x)
  const y = Math.floor(point.y)
  if (x < 0 || y < 0 || x >= document.width || y >= document.height) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }
  const canvas = compositeDocument(document, canvases)
  const data = context2d(canvas).getImageData(x, y, 1, 1).data
  return { r: data[0], g: data[1], b: data[2], a: data[3] }
}
