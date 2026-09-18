import { canvasToDataUrl, context2d, createCanvas } from './canvas'
import { selectionBounds, selectionToMask } from './selection'
import type { PatternDef, Selection } from './types'

/**
 * Patterns: a piece of a document kept as a tile, and the tiling itself.
 *
 * The definition is stored as a data URL so it travels in the project file,
 * and the decoded tile is cached alongside the layer canvases so the
 * compositor can reach it without waiting for an image to load.
 */

/** Where a decoded tile is kept in the canvas map. */
export function patternKey(id: string) {
  return `pattern:${id}`
}

/**
 * Cuts a tile out of the image. With a selection, the tile is its bounding box
 * and anything outside the selection is left out, which is how a pattern made
 * from a lasso comes out with transparent corners.
 */
export function makePatternTile(source: HTMLCanvasElement, selection: Selection | null) {
  const bounds = selectionBounds(selection, source)
  const tile = createCanvas(bounds.width, bounds.height)
  const ctx = context2d(tile)
  ctx.drawImage(source, -bounds.x, -bounds.y)

  const mask = selectionToMask(selection, source.width, source.height)
  if (mask) {
    const image = ctx.getImageData(0, 0, tile.width, tile.height)
    for (let y = 0; y < tile.height; y += 1) {
      for (let x = 0; x < tile.width; x += 1) {
        const at = (y + bounds.y) * source.width + (x + bounds.x)
        if (!mask[at]) {
          image.data[(y * tile.width + x) * 4 + 3] = 0
        }
      }
    }
    ctx.putImageData(image, 0, 0)
  }
  return tile
}

export function definePattern(id: string, name: string, tile: HTMLCanvasElement): PatternDef {
  return { id, name, dataUrl: canvasToDataUrl(tile), width: tile.width, height: tile.height }
}

/** Repeats the tile across the canvas, inside the selection if there is one. */
export function tileOnto(canvas: HTMLCanvasElement, tile: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const mask = selectionToMask(selection, canvas.width, canvas.height)
  const painted = mask ? createCanvas(canvas.width, canvas.height) : canvas
  const target = context2d(painted)
  // Drawn tile by tile rather than through createPattern: a canvas pattern is
  // sampled with smoothing, which bleeds each tile's last column into the next
  // one's first and turns a hard-edged tile into a gradient at every seam.
  target.imageSmoothingEnabled = false
  for (let y = 0; y < canvas.height; y += tile.height) {
    for (let x = 0; x < canvas.width; x += tile.width) {
      target.drawImage(tile, x, y)
    }
  }
  if (!mask) {
    return
  }
  const image = target.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) image.data[i * 4 + 3] = 0
  }
  target.putImageData(image, 0, 0)
  ctx.drawImage(painted, 0, 0)
}

/** A canvas of the given size filled with the tile, for a fill layer. */
export function patternFill(width: number, height: number, tile: HTMLCanvasElement) {
  const canvas = createCanvas(width, height)
  tileOnto(canvas, tile, null)
  return canvas
}
