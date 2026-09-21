// Smart objects and smart filters: the two things that have to leave the
// layer's own pixels alone no matter what the document ends up looking like.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applySmartFilters, compositeDocument, createBlankDocument, placeSmartObject,
  setSmartFilterRunner, smartSourceKey,
} from '../src/lib/canvas.ts'
import { applyGalleryFilter } from '../src/lib/gallery.ts'
import { channelCanvas, channelToSelection, channelView, combineMasks } from '../src/lib/channels.ts'
import { restoreProject, serializeProject } from '../src/lib/imageIO.ts'
import { assertPixel, canvasFrom, canvasOf, meanDiff, px } from './helpers/pixels.mjs'

// The same wiring the app does when it loads.
setSmartFilterRunner((canvas, filter) => {
  applyGalleryFilter(canvas, filter.filter, { radius: filter.radius, amount: filter.amount }, null)
})

function board(width = 16, height = 16) {
  return canvasFrom(width, height, (x, y) => (
    (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? [240, 240, 240, 255] : [20, 20, 20, 255]
  ))
}

/** A one-layer document whose layer carries `filters`. */
function docWithFilters(filters) {
  const { document, canvases } = createBlankDocument('doc', 16, 16, 'transparent', 'base')
  const layer = document.layers[0]
  layer.smartFilters = filters
  canvases.set(layer.id, board())
  return { document, canvases, layer }
}

test('a smart filter changes the composite and leaves the layer untouched', () => {
  const { document, canvases, layer } = docWithFilters([
    { id: 'f1', filter: 'gaussian', enabled: true, radius: 3, amount: 60 },
  ])
  const before = canvasFrom(16, 16, (x, y) => px(canvases.get(layer.id), x, y))

  const flat = compositeDocument(document, canvases)
  assert.ok(meanDiff(flat, before) > 1, 'the blur reached the composite')
  assert.equal(meanDiff(canvases.get(layer.id), before), 0, 'the layer pixels were not touched')
})

test('switching a smart filter off brings the original back exactly', () => {
  const { document, canvases } = docWithFilters([
    { id: 'f1', filter: 'gaussian', enabled: false, radius: 3, amount: 60 },
  ])
  const flat = compositeDocument(document, canvases)
  assert.deepEqual(px(flat, 1, 1), [20, 20, 20, 255], 'a disabled filter does nothing at all')
})

test('the stack runs in order, and the result is cached until something changes', () => {
  const { document, canvases, layer } = docWithFilters([
    { id: 'f1', filter: 'gaussian', enabled: true, radius: 2, amount: 60 },
    { id: 'f2', filter: 'findEdges', enabled: true, radius: 2, amount: 60 },
  ])
  const once = compositeDocument(document, canvases)
  const twice = compositeDocument(document, canvases)
  assert.equal(meanDiff(once, twice), 0, 'the same stack gives the same pixels')

  // Re-tuning one entry has to invalidate what was cached.
  layer.smartFilters[0].radius = 8
  const retuned = compositeDocument(document, canvases)
  assert.ok(meanDiff(once, retuned) > 0.5, 'a changed radius was not picked up')
})

test('applySmartFilters hands the source straight back when nothing is on', () => {
  const source = board()
  assert.equal(applySmartFilters('layer-1', source, []), source)
  assert.equal(applySmartFilters('layer-1', source, undefined), source)
  assert.equal(applySmartFilters('layer-1', source, [{ id: 'f', filter: 'gaussian', enabled: false, radius: 2, amount: 1 }]), source)
})

/* ----------------------------------------------------------- smart objects */

test('a smart object is placed from its original, so scaling loses nothing', () => {
  const { document, canvases } = createBlankDocument('doc', 32, 32, 'transparent', 'base')
  const layer = document.layers[0]
  layer.smart = true
  // The original is a crisp 32x32 square of colour.
  canvases.set(smartSourceKey(layer.id), canvasOf(32, 32, '#2060c0'))

  // Placed at a quarter size, and then back at full size.
  layer.smartTransform = { scaleX: 0.25, scaleY: 0.25, rotate: 0, x: 0, y: 0 }
  const small = compositeDocument(document, canvases)
  assert.deepEqual(px(small, 20, 20), [0, 0, 0, 0], 'most of the canvas is now empty')

  layer.smartTransform = { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }
  const restored = compositeDocument(document, canvases)
  assertPixel(restored, 20, 20, [32, 96, 192, 255], 2, 'the full-size colour came back')
})

test('placeSmartObject honours the offset it is given', () => {
  const source = canvasOf(8, 8, '#ff0000')
  const placed = placeSmartObject(source, 24, 24, { scaleX: 1, scaleY: 1, rotate: 0, x: 8, y: 8 })
  assert.deepEqual(px(placed, 2, 2), [0, 0, 0, 0], 'nothing before the offset')
  assert.deepEqual(px(placed, 10, 10), [255, 0, 0, 255], 'the original sits at the offset')
})

/* --------------------------------------------------------- alpha channels */

test('a saved selection survives the project round trip', async () => {
  const { document, canvases } = createBlankDocument('doc', 8, 4, 'transparent', 'base')
  const mask = new Uint8Array(8 * 4)
  for (let x = 0; x < 4; x += 1) {
    for (let y = 0; y < 4; y += 1) mask[y * 8 + x] = 255
  }
  document.channels = [{ id: 'chan-1', name: 'Alpha 1', mask }]

  const restored = await restoreProject(JSON.parse(JSON.stringify(serializeProject(document, canvases))))
  assert.equal(restored.document.channels.length, 1)
  assert.equal(restored.document.channels[0].name, 'Alpha 1')
  assert.equal(restored.document.channels[0].mask[0], 255, 'the left half came back selected')
  assert.equal(restored.document.channels[0].mask[6], 0, 'and the right half did not')
})

test('a channel becomes a selection again with its bounds worked out', () => {
  const mask = new Uint8Array(8 * 4)
  mask[2 * 8 + 3] = 255
  const selection = channelToSelection({ id: 'c', name: 'n', mask }, 8, 4)
  assert.equal(selection.kind, 'mask')
  assert.deepEqual([selection.x, selection.y, selection.width, selection.height], [3, 2, 1, 1])
})

test('loading a channel can add to, subtract from or intersect what is selected', () => {
  const current = Uint8Array.from([255, 255, 0, 0])
  const incoming = Uint8Array.from([0, 255, 255, 0])
  assert.deepEqual([...combineMasks(current, incoming, 'replace')], [0, 255, 255, 0])
  assert.deepEqual([...combineMasks(current, incoming, 'add')], [255, 255, 255, 0])
  assert.deepEqual([...combineMasks(current, incoming, 'subtract')], [255, 0, 0, 0])
  assert.deepEqual([...combineMasks(current, incoming, 'intersect')], [0, 255, 0, 0])
  assert.deepEqual([...combineMasks(null, incoming, 'add')], [0, 255, 255, 0], 'with nothing selected the channel is the selection')
})

test('one colour channel can be looked at on its own', () => {
  const canvas = canvasFrom(4, 1, () => [200, 40, 10, 255])
  assert.deepEqual(px(channelCanvas(canvas, 'r'), 1, 0), [200, 200, 200, 255])
  assert.deepEqual(px(channelCanvas(canvas, 'g'), 1, 0), [40, 40, 40, 255])
  assert.deepEqual(px(channelView(canvas, { r: false, g: true, b: true }), 1, 0), [0, 40, 10, 255])
})
