import { compositeDocument, context2d } from './canvas'
import { maskBounds } from './selection'
import type { LayerMeta, PhotoDocument, Point } from './types'

/**
 * The topmost type layer under a point, or null. It reads the pixels the layer draws,
 * which holds for every direction, alignment, warp and path alike. A click anywhere
 * else with a type tool starts new type instead of rewriting the layer that is active.
 */
export function textLayerAt(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, point: Point, margin = 6): LayerMeta | null {
  const { width, height } = document
  for (const layer of [...document.layers].reverse()) {
    if (layer.kind !== 'text' || !layer.visible) continue
    const flat = compositeDocument({ ...document, background: 'transparent', layers: [{ ...layer, opacity: 1 }], colorMode: 'rgb' }, canvases)
    const pixels = context2d(flat).getImageData(0, 0, width, height).data
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i += 1) mask[i] = pixels[i * 4 + 3]
    const box = maskBounds(mask, width, height)
    if (!box.width) continue
    if (point.x >= box.x - margin && point.x <= box.x + box.width + margin && point.y >= box.y - margin && point.y <= box.y + box.height + margin) return layer
  }
  return null
}
