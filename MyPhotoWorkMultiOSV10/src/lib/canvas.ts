import type { FillData, LayerMeta, PhotoDocument, Point, SmartFilter, SmartTransform } from './types'
import { defaultEffects } from './types'
import { applyAdjustment } from './adjustments'
import { applyCurvesData, applyLevelsData } from './curves'
import { applyLayerEffects, rasterizeShape, rasterizeTextLayer } from './effects'
import { applyColorMode } from './colorModes'
import { patternKey, tileOnto } from './patterns'
import { renderExtrude } from './three'

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
      paths: [],
      slices: [],
      frames: [],
      measure: null,
      colorMode: 'rgb',
    },
    canvases: new Map([[layer.id, canvas]]),
  }
}

function paintFill(width: number, height: number, fill: FillData, canvases: Map<string, HTMLCanvasElement>) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  if (fill.kind === 'solid' || fill.kind === 'pattern') {
    ctx.fillStyle = fill.color
    ctx.fillRect(0, 0, width, height)
    if (fill.kind === 'pattern') {
      // A defined pattern is tiled; without one the layer shows the chequer
      // that says "a pattern belongs here".
      const tile = fill.patternId ? canvases.get(patternKey(fill.patternId)) : undefined
      if (tile) {
        tileOnto(canvas, tile, null)
        return canvas
      }
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

/**
 * Draws a smart object's untouched original into the document at the size and
 * angle it has been placed at. Nothing is resampled twice: scaling down and
 * back up goes through this from the original every time, which is the whole
 * reason a smart object is worth having.
 */
export function placeSmartObject(source: HTMLCanvasElement, width: number, height: number, transform?: SmartTransform) {
  const placed = transform ?? { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const w = source.width * placed.scaleX
  const h = source.height * placed.scaleY
  ctx.save()
  ctx.translate(placed.x + w / 2, placed.y + h / 2)
  ctx.rotate(placed.rotate)
  ctx.drawImage(source, -w / 2, -h / 2, w, h)
  ctx.restore()
  return canvas
}

/**
 * Smart filters are re-run on every composite, so the result is cached per
 * layer and only recomputed when the pixels it was built from, the placement
 * or the stack itself changes. Without this a blur on a smart layer would be
 * recalculated on every pointer move.
 */
let stampCounter = 0
const canvasStamps = new WeakMap<HTMLCanvasElement, number>()
const smartCache = new Map<string, { key: string; result: HTMLCanvasElement }>()

function stampOf(canvas: HTMLCanvasElement) {
  let stamp = canvasStamps.get(canvas)
  if (stamp === undefined) {
    stampCounter += 1
    stamp = stampCounter
    canvasStamps.set(canvas, stamp)
  }
  return stamp
}

/** Set by the app at start-up; the compositor has no filter knowledge itself. */
let runSmartFilter: ((canvas: HTMLCanvasElement, filter: SmartFilter) => void) | null = null

export function setSmartFilterRunner(runner: (canvas: HTMLCanvasElement, filter: SmartFilter) => void) {
  runSmartFilter = runner
}

export function applySmartFilters(layerId: string, source: HTMLCanvasElement, filters: SmartFilter[] | undefined) {
  const active = (filters ?? []).filter((filter) => filter.enabled)
  if (!active.length || !runSmartFilter) {
    return source
  }
  const key = `${stampOf(source)}:${JSON.stringify(active)}`
  const cached = smartCache.get(layerId)
  if (cached && cached.key === key) {
    return cached.result
  }
  const result = cloneCanvas(source)
  for (const filter of active) {
    runSmartFilter(result, filter)
  }
  smartCache.set(layerId, { key, result })
  return result
}

function layerSource(layer: LayerMeta, document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>) {
  if (layer.kind === 'text' && layer.text) {
    return rasterizeTextLayer(document.width, document.height, layer.text, document.paths)
  }
  if (layer.kind === 'shape' && layer.shape) {
    return rasterizeShape(document.width, document.height, layer.shape)
  }
  if (layer.kind === 'fill' && layer.fill) {
    return paintFill(document.width, document.height, layer.fill, canvases)
  }
  // A 3D layer is its own picture given depth; the flat pixels are the skin.
  if (layer.threeD) {
    const flat = canvases.get(layer.id)
    if (flat) {
      return applySmartFilters(layer.id, renderExtrude(flat, document.width, document.height, layer.threeD), layer.smartFilters)
    }
  }
  // A smart layer is drawn from its original, never from a placed copy.
  const original = layer.smart ? canvases.get(smartSourceKey(layer.id)) : undefined
  if (original) {
    return applySmartFilters(layer.id, placeSmartObject(original, document.width, document.height, layer.smartTransform), layer.smartFilters)
  }
  const pixels = canvases.get(layer.id) ?? null
  return pixels ? applySmartFilters(layer.id, pixels, layer.smartFilters) : null
}

/** Where a smart object's untouched pixels are kept in the canvas map. */
export function smartSourceKey(layerId: string) {
  return `${layerId}:source`
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
  /**
   * The layer a clipping group hangs off: the last one drawn that was not
   * itself clipped. A clipped layer is only visible where that one has pixels,
   * which is the whole point of the feature.
   */
  let clipBase: HTMLCanvasElement | null = null

  for (const layer of document.layers) {
    if (!layer.visible || layer.kind === 'group') {
      continue
    }
    if (layer.kind === 'adjustment' && (layer.adjustment || layer.curves || layer.levels)) {
      const image = ctx.getImageData(0, 0, document.width, document.height)
      // A Curves or Levels layer carries its own table; anything else runs the
      // slider pipeline.
      if (layer.curves) applyCurvesData(image.data, layer.curves)
      else if (layer.levels) applyLevelsData(image.data, layer.levels)
      else if (layer.adjustment) applyAdjustment(image.data, layer.adjustment)
      const mask = layer.maskEnabled ? canvases.get(`${layer.id}:mask`) : null
      const clip = layer.clipped ? clipBase : null
      if (mask || clip) {
        // How much of the adjustment reaches each pixel: the mask's coverage
        // and, for a clipped layer, the base layer's own coverage. A mask made
        // by the editor is white with its alpha as the value (the way raster
        // layers are cut by it); one read from a file may be opaque grey. The
        // product of the two reads either, and a soft edge stays soft.
        const maskData = mask ? context2d(mask).getImageData(0, 0, document.width, document.height).data : null
        const clipData = clip ? context2d(clip).getImageData(0, 0, document.width, document.height).data : null
        const current = ctx.getImageData(0, 0, document.width, document.height)
        for (let i = 0; i < image.data.length; i += 4) {
          const m = (maskData ? (maskData[i] * maskData[i + 3]) / 65025 : 1) * (clipData ? clipData[i + 3] / 255 : 1)
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
    let painted = applyLayerEffects(source, layer.effects ?? defaultEffects(), canvases)
    const mask = layer.maskEnabled ? canvases.get(`${layer.id}:mask`) : null
    const clip = layer.clipped ? clipBase : null
    if (mask || clip) {
      // Both are cut out the same way: keep the pixels the mask, or the base
      // layer, has something at.
      const temp = createCanvas(document.width, document.height)
      const tctx = context2d(temp)
      tctx.drawImage(painted, 0, 0)
      tctx.globalCompositeOperation = 'destination-in'
      if (mask) tctx.drawImage(mask, 0, 0)
      if (clip) tctx.drawImage(clip, 0, 0)
      painted = temp
    }
    if (!layer.clipped) {
      clipBase = painted
    }
    ctx.save()
    ctx.globalAlpha = layer.opacity * (layer.fillOpacity ?? 1)
    ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation
    ctx.drawImage(painted, 0, 0)
    ctx.restore()
  }
  // Greyscale, CMYK and Lab are applied to the finished composite, so the
  // layers themselves stay RGBA and switching back to RGB costs nothing.
  applyColorMode(canvas, document.colorMode)
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
