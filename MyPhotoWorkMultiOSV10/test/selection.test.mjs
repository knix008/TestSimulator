// Selections gate almost every edit, so these check both the shapes themselves
// and the "does this pixel belong" predicate that brushes and filters consult.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clipCanvasToSelection, colSelection, ellipseSelection, emptyMask, featherSelection, floodFillMask,
  invertSelection, maskBounds, maskFromLasso, paintBucket, pointInSelection, rectSelection,
  rowSelection, selectionBounds, selectionToMask, wandSelection,
} from '../src/lib/selection.ts'
import { canvasFrom, canvasOf, countMask, px } from './helpers/pixels.mjs'

test('rectSelection normalises a drag made in any direction', () => {
  assert.deepEqual(rectSelection(10, 10, 20, 30), { kind: 'rect', x: 10, y: 10, width: 20, height: 30 })
  // Dragging up-left must produce the same box as dragging down-right.
  assert.deepEqual(rectSelection(30, 40, -20, -30), { kind: 'rect', x: 10, y: 10, width: 20, height: 30 })
  assert.deepEqual(rectSelection(5, 5, 0, 0), { kind: 'rect', x: 5, y: 5, width: 0, height: 0 })
})

test('ellipseSelection keeps the normalised box and only changes the kind', () => {
  assert.deepEqual(ellipseSelection(30, 40, -20, -30), { kind: 'ellipse', x: 10, y: 10, width: 20, height: 30 })
})

test('rowSelection and colSelection span the full document axis', () => {
  assert.deepEqual(rowSelection(7.8, 64), { kind: 'rect', x: 0, y: 7, width: 64, height: 1 })
  assert.deepEqual(colSelection(7.8, 48), { kind: 'rect', x: 7, y: 0, width: 1, height: 48 })
})

test('selectionBounds falls back to the whole document when nothing is selected', () => {
  assert.deepEqual(selectionBounds(null, { width: 40, height: 20 }), { x: 0, y: 0, width: 40, height: 20 })
  assert.deepEqual(
    selectionBounds({ kind: 'rect', x: 3.7, y: 4.2, width: 9.4, height: 0.2 }, { width: 40, height: 20 }),
    { x: 3, y: 4, width: 9, height: 1 },
  )
})

test('pointInSelection treats "no selection" as the whole canvas', () => {
  assert.equal(pointInSelection(null, 0, 0, 10, 10), true)
  assert.equal(pointInSelection(null, 9, 9, 10, 10), true)
})

test('pointInSelection uses a half-open rectangle and rejects out-of-canvas pixels', () => {
  const rect = rectSelection(2, 3, 4, 5)
  assert.equal(pointInSelection(rect, 2, 3, 20, 20), true)
  assert.equal(pointInSelection(rect, 5, 7, 20, 20), true, 'last pixel inside')
  assert.equal(pointInSelection(rect, 6, 7, 20, 20), false, 'x == right edge is outside')
  assert.equal(pointInSelection(rect, 5, 8, 20, 20), false, 'y == bottom edge is outside')
  assert.equal(pointInSelection(rect, 1, 3, 20, 20), false)
  assert.equal(pointInSelection(rect, -1, -1, 20, 20), false)
  assert.equal(pointInSelection(rect, 20, 3, 20, 20), false)
})

test('an ellipse selection includes its centre and excludes its corners', () => {
  const ellipse = ellipseSelection(0, 0, 20, 20)
  assert.equal(pointInSelection(ellipse, 10, 10, 20, 20), true, 'centre')
  assert.equal(pointInSelection(ellipse, 0, 0, 20, 20), false, 'top-left corner')
  assert.equal(pointInSelection(ellipse, 19, 19, 20, 20), false, 'bottom-right corner')
  assert.equal(pointInSelection(ellipse, 10, 1, 20, 20), true, 'top mid')
  assert.equal(pointInSelection(ellipse, 1, 10, 20, 20), true, 'left mid')
})

test('selectionToMask rasterises shapes and passes an existing mask through unchanged', () => {
  assert.equal(selectionToMask(null, 8, 8), null)

  const rect = selectionToMask(rectSelection(1, 1, 2, 2), 8, 8)
  assert.equal(countMask(rect), 4)
  assert.equal(rect[1 * 8 + 1], 255)
  assert.equal(rect[0], 0)

  const existing = emptyMask(8, 8)
  existing[5] = 255
  const same = selectionToMask({ kind: 'mask', x: 0, y: 0, width: 8, height: 8, mask: existing }, 8, 8)
  assert.equal(same, existing, 'an explicit mask is reused, not re-rasterised')
})

test('an ellipse mask covers roughly pi/4 of its bounding box', () => {
  const mask = selectionToMask(ellipseSelection(0, 0, 40, 40), 40, 40)
  const ratio = countMask(mask) / (40 * 40)
  assert.ok(Math.abs(ratio - Math.PI / 4) < 0.05, `ellipse fill ratio ${ratio}`)
})

test('clipCanvasToSelection erases everything outside the selection', () => {
  const canvas = canvasOf(8, 8, '#ff0000')
  clipCanvasToSelection(canvas, rectSelection(2, 2, 3, 3))
  assert.deepEqual(px(canvas, 3, 3), [255, 0, 0, 255], 'inside kept')
  assert.equal(px(canvas, 0, 0)[3], 0, 'outside cleared')
  assert.equal(px(canvas, 5, 5)[3], 0, 'just past the edge cleared')
})

test('clipCanvasToSelection is a no-op without a selection', () => {
  const canvas = canvasOf(4, 4, '#00ff00')
  assert.equal(clipCanvasToSelection(canvas, null), canvas)
  assert.deepEqual(px(canvas, 0, 0), [0, 255, 0, 255])
})

test('floodFillMask spreads over 4-neighbours within tolerance and stops at a wall', () => {
  // Left half red, right half blue, so the fill must stop at the seam.
  const canvas = canvasFrom(10, 6, (x) => (x < 5 ? [255, 0, 0] : [0, 0, 255]))
  const data = canvas.getContext('2d').getImageData(0, 0, 10, 6).data
  const mask = floodFillMask(data, 10, 6, { x: 0, y: 0 }, 10)
  assert.equal(countMask(mask), 5 * 6)
  assert.equal(mask[0], 255)
  assert.equal(mask[5], 0, 'the blue half is untouched')
})

test('floodFillMask with a wide tolerance takes the whole canvas, and out-of-bounds seeds take none', () => {
  const canvas = canvasFrom(10, 6, (x) => (x < 5 ? [255, 0, 0] : [0, 0, 255]))
  const data = canvas.getContext('2d').getImageData(0, 0, 10, 6).data
  assert.equal(countMask(floodFillMask(data, 10, 6, { x: 0, y: 0 }, 255)), 60)
  assert.equal(countMask(floodFillMask(data, 10, 6, { x: -1, y: 0 }, 255)), 0)
  assert.equal(countMask(floodFillMask(data, 10, 6, { x: 10, y: 0 }, 255)), 0)
})

test('floodFillMask does not leak diagonally between separate regions', () => {
  // Two red quadrants touching only at a corner: a 4-connected fill must take one.
  const canvas = canvasFrom(8, 8, (x, y) => ((x < 4) === (y < 4) ? [255, 0, 0] : [0, 0, 0]))
  const data = canvas.getContext('2d').getImageData(0, 0, 8, 8).data
  const mask = floodFillMask(data, 8, 8, { x: 0, y: 0 }, 8)
  assert.equal(countMask(mask), 16, 'only the seeded quadrant')
  assert.equal(mask[5 * 8 + 5], 0, 'the diagonal quadrant is not reached')
})

test('maskBounds returns the tight box, and an empty box for an empty mask', () => {
  const mask = emptyMask(10, 10)
  assert.deepEqual(maskBounds(mask, 10, 10), { x: 0, y: 0, width: 0, height: 0 })
  mask[3 * 10 + 2] = 255
  mask[6 * 10 + 7] = 255
  assert.deepEqual(maskBounds(mask, 10, 10), { x: 2, y: 3, width: 6, height: 4 })
})

test('wandSelection picks the contiguous same-colour region and reports its bounds', () => {
  const canvas = canvasFrom(12, 12, (x, y) => (x >= 4 && x < 8 && y >= 2 && y < 6 ? [10, 200, 10] : [0, 0, 0]))
  const selection = wandSelection(canvas, { x: 5, y: 3 }, 16)
  assert.equal(selection.kind, 'mask')
  assert.deepEqual(
    { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
    { x: 4, y: 2, width: 4, height: 4 },
  )
  assert.equal(countMask(selection.mask), 16)
})

test('maskFromLasso fills the drawn polygon and degenerates safely', () => {
  const triangle = maskFromLasso([{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 0, y: 19 }], 20, 20)
  assert.equal(triangle.kind, 'mask')
  assert.equal(triangle.mask[1 * 20 + 1], 255, 'inside the triangle')
  assert.equal(triangle.mask[18 * 20 + 18], 0, 'the cut-off corner is outside')
  // Roughly half the square, allowing for antialiased edges being counted in.
  const ratio = countMask(triangle.mask) / 400
  assert.ok(ratio > 0.45 && ratio < 0.62, `triangle fill ratio ${ratio}`)

  const degenerate = maskFromLasso([{ x: 3, y: 3 }], 20, 20)
  assert.equal(countMask(degenerate.mask), 0)
})

test('invertSelection swaps inside and outside, and selects everything when nothing was selected', () => {
  const inverted = invertSelection(rectSelection(0, 0, 4, 4), 8, 8)
  assert.equal(inverted.mask[0], 0)
  assert.equal(inverted.mask[4], 255)
  assert.equal(countMask(inverted.mask), 64 - 16)

  const fromNothing = invertSelection(null, 8, 8)
  assert.equal(countMask(fromNothing.mask), 64, 'inverting an empty mask selects all')

  const twice = invertSelection(inverted, 8, 8)
  assert.equal(countMask(twice.mask), 16, 'inverting twice restores the original area')
})

test('featherSelection grows a hard-edged mask outward', () => {
  const feathered = featherSelection(rectSelection(8, 8, 8, 8), 32, 32, 4)
  assert.equal(feathered.kind, 'mask')
  const area = countMask(feathered.mask)
  assert.ok(area > 64, `feathering should spread past the original 64px (got ${area})`)
  assert.equal(feathered.mask[11 * 32 + 11], 255, 'the core stays selected')
})

test('featherSelection on an empty selection returns the full-canvas rect', () => {
  assert.deepEqual(featherSelection(null, 16, 12, 3), { kind: 'rect', x: 0, y: 0, width: 16, height: 12 })
})

test('paintBucket recolours the flooded region and respects an active selection', () => {
  const canvas = canvasOf(10, 10, '#000000')
  paintBucket(canvas, { x: 0, y: 0 }, { r: 255, g: 0, b: 0 }, 8, rectSelection(0, 0, 5, 10))
  assert.deepEqual(px(canvas, 2, 2), [255, 0, 0, 255], 'inside the selection is filled')
  assert.deepEqual(px(canvas, 7, 2), [0, 0, 0, 255], 'outside the selection is protected')
})

test('paintBucket always writes fully opaque pixels', () => {
  const canvas = canvasOf(6, 6)
  paintBucket(canvas, { x: 0, y: 0 }, { r: 1, g: 2, b: 3 }, 0, null)
  assert.deepEqual(px(canvas, 3, 3), [1, 2, 3, 255])
})
