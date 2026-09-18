// The document model and the compositor: layer order, visibility, opacity,
// blend modes, masks, adjustment/fill/text/shape layers and the eyedropper.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneCanvas, compositeDocument, context2d, createBlankDocument, createCanvas, createId,
  createLayerMeta, clearCanvas, padCanvas, resizeCanvasContent, sampleComposite,
} from '../src/lib/canvas.ts'
import { defaultAdjustment, defaultCurves, defaultEffects, defaultLevels } from '../src/lib/types.ts'
import { assertNear, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

/** A document with `colors.length` stacked full-bleed layers, bottom first. */
function stack(colors, width = 8, height = 8) {
  const { document, canvases } = createBlankDocument('doc', width, height, 'transparent', 'base')
  const base = document.layers[0]
  context2d(canvases.get(base.id)).fillStyle = colors[0]
  context2d(canvases.get(base.id)).fillRect(0, 0, width, height)
  for (const color of colors.slice(1)) {
    const layer = createLayerMeta('layer')
    document.layers.push(layer)
    canvases.set(layer.id, canvasOf(width, height, color))
  }
  document.activeLayerId = document.layers[document.layers.length - 1].id
  return { document, canvases }
}

test('createId produces unique, prefixed ids', () => {
  const ids = new Set(Array.from({ length: 200 }, () => createId('layer')))
  assert.equal(ids.size, 200, 'no collisions in 200 draws')
  assert.ok([...ids].every((id) => id.startsWith('layer-')))
})

test('createLayerMeta gives a visible, unlocked, fully opaque normal layer', () => {
  const layer = createLayerMeta('Background')
  assert.equal(layer.name, 'Background')
  assert.equal(layer.kind, 'raster')
  assert.equal(layer.visible, true)
  assert.equal(layer.locked, false)
  assert.equal(layer.opacity, 1)
  assert.equal(layer.fillOpacity, 1)
  assert.equal(layer.blendMode, 'source-over')
  assert.equal(layer.maskEnabled, false)
  assert.deepEqual(layer.effects, defaultEffects())
  assert.equal(createLayerMeta('Type', 'text').kind, 'text')
})

test('createBlankDocument paints an opaque background and one active layer', () => {
  const { document, canvases } = createBlankDocument('Untitled', 12, 9, '#ffffff', 'Background')
  assert.equal(document.width, 12)
  assert.equal(document.height, 9)
  assert.equal(document.layers.length, 1)
  assert.equal(document.activeLayerId, document.layers[0].id)
  assert.equal(document.colorMode, 'rgb')
  assert.deepEqual(document.guides, [])
  assert.deepEqual(px(canvases.get(document.layers[0].id), 5, 5), [255, 255, 255, 255])
})

test('a transparent new document starts with an empty layer', () => {
  const { document, canvases } = createBlankDocument('Untitled', 8, 8, 'transparent', 'Layer 1')
  assert.deepEqual(px(canvases.get(document.layers[0].id), 4, 4), [0, 0, 0, 0])
})

test('cloneCanvas copies pixels into an independent buffer', () => {
  const source = canvasOf(6, 6, '#ff0000')
  const copy = cloneCanvas(source)
  assert.deepEqual(px(copy, 1, 1), [255, 0, 0, 255])
  clearCanvas(source)
  assert.deepEqual(px(copy, 1, 1), [255, 0, 0, 255], 'the copy survives clearing the original')
  assert.deepEqual(px(source, 1, 1), [0, 0, 0, 0])
})

test('resizeCanvasContent scales the whole image into the new size', () => {
  const source = canvasFrom(4, 4, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]))
  const scaled = resizeCanvasContent(source, 8, 8)
  assert.equal(scaled.width, 8)
  assert.equal(scaled.height, 8)
  assert.deepEqual(px(scaled, 1, 1), [255, 0, 0, 255], 'left half is still red')
  assert.deepEqual(px(scaled, 6, 1), [0, 0, 255, 255], 'right half is still blue')
})

test('padCanvas places the old image at an offset inside a bigger canvas', () => {
  const source = canvasOf(4, 4, '#00ff00')
  const padded = padCanvas(source, 10, 10, 3, 2)
  assert.equal(padded.width, 10)
  assert.deepEqual(px(padded, 3, 2), [0, 255, 0, 255], 'top-left of the original')
  assert.deepEqual(px(padded, 6, 5), [0, 255, 0, 255], 'bottom-right of the original')
  assert.deepEqual(px(padded, 0, 0), [0, 0, 0, 0], 'the new margin is transparent')
  assert.deepEqual(px(padded, 9, 9), [0, 0, 0, 0])
})

test('compositeDocument draws layers bottom-up, so index 0 is the back', () => {
  const { document, canvases } = stack(['#ff0000', '#0000ff'])
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [0, 0, 255, 255], 'the last layer wins')
})

test('compositeDocument skips hidden layers and group folders', () => {
  const { document, canvases } = stack(['#ff0000', '#0000ff'])
  document.layers[1].visible = false
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [255, 0, 0, 255])

  document.layers[1].visible = true
  document.layers[1].kind = 'group'
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [255, 0, 0, 255],
    'a group folder holds no pixels of its own')
})

test('layer opacity and fill opacity multiply together', () => {
  const { document, canvases } = stack(['#000000', '#ffffff'])
  document.layers[1].opacity = 0.5
  assertNear(px(compositeDocument(document, canvases), 4, 4)[0], 128, 2, 'half opacity')

  document.layers[1].fillOpacity = 0.5
  assertNear(px(compositeDocument(document, canvases), 4, 4)[0], 64, 2, '0.5 x 0.5')
})

test('blend modes reach the canvas compositor', () => {
  const { document, canvases } = stack(['#808080', '#808080'])

  document.layers[1].blendMode = 'multiply'
  assertNear(px(compositeDocument(document, canvases), 4, 4)[0], 64, 2, 'multiply darkens')

  document.layers[1].blendMode = 'screen'
  assertNear(px(compositeDocument(document, canvases), 4, 4)[0], 191, 2, 'screen lightens')

  document.layers[1].blendMode = 'difference'
  assertNear(px(compositeDocument(document, canvases), 4, 4)[0], 0, 2, 'a layer differenced with itself is black')
})

test('the hue/saturation/color/luminosity blend modes are wired up', () => {
  const { document, canvases } = stack(['#ff0000', '#00ff00'])
  document.layers[1].blendMode = 'luminosity'
  const out = px(compositeDocument(document, canvases), 4, 4)
  // Green's luminosity over red's hue lands on a bright red-ish tone, not plain green.
  assert.ok(out[0] > out[1], `luminosity should keep the base hue, got [${out}]`)

  document.layers[1].blendMode = 'color'
  const colored = px(compositeDocument(document, canvases), 4, 4)
  assert.ok(colored[1] > colored[0], 'color takes the blend layer hue')
})

test('a layer mask hides the masked-out part and keeps the rest', () => {
  const { document, canvases } = stack(['#ff0000', '#0000ff'])
  const top = document.layers[1]
  top.maskEnabled = true
  // White on the left half of the mask reveals; black on the right hides.
  canvases.set(`${top.id}:mask`, canvasFrom(8, 8, (x) => (x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 0])))
  const out = compositeDocument(document, canvases)
  assert.deepEqual(px(out, 1, 4), [0, 0, 255, 255], 'revealed half shows the top layer')
  assert.deepEqual(px(out, 6, 4), [255, 0, 0, 255], 'hidden half falls through to the layer below')
})

test('a mask-enabled layer with no mask canvas still draws normally', () => {
  const { document, canvases } = stack(['#ff0000', '#0000ff'])
  document.layers[1].maskEnabled = true
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [0, 0, 255, 255])
})

test('an adjustment layer transforms everything painted beneath it', () => {
  const { document, canvases } = stack(['#ff0000'])
  const adjust = createLayerMeta('Invert', 'adjustment')
  adjust.adjustment = { ...defaultAdjustment('invert'), type: 'invert' }
  document.layers.push(adjust)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [0, 255, 255, 255])
})

test('a hidden adjustment layer has no effect', () => {
  const { document, canvases } = stack(['#ff0000'])
  const adjust = createLayerMeta('Invert', 'adjustment')
  adjust.adjustment = { ...defaultAdjustment('invert'), type: 'invert' }
  adjust.visible = false
  document.layers.push(adjust)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [255, 0, 0, 255])
})

test('an adjustment layer mask limits the adjustment to the revealed area', () => {
  const { document, canvases } = stack(['#ff0000'])
  const adjust = createLayerMeta('Invert', 'adjustment')
  adjust.adjustment = { ...defaultAdjustment('invert'), type: 'invert' }
  adjust.maskEnabled = true
  document.layers.push(adjust)
  canvases.set(`${adjust.id}:mask`, canvasFrom(8, 8, (x) => (x < 4 ? [255, 255, 255, 255] : [0, 0, 0, 255])))
  const out = compositeDocument(document, canvases)
  assert.deepEqual(px(out, 1, 4), [0, 255, 255, 255], 'inverted where the mask is white')
  assert.deepEqual(px(out, 6, 4), [255, 0, 0, 255], 'untouched where the mask is black')
})

test('a solid fill layer paints its colour across the document', () => {
  const { document, canvases } = stack(['#000000'])
  const fill = createLayerMeta('Fill', 'fill')
  fill.fill = {
    kind: 'solid', color: '#3366cc', gradientKind: 'linear',
    start: { x: 0, y: 0 }, end: { x: 8, y: 8 }, endColor: '#000000',
  }
  document.layers.push(fill)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [51, 102, 204, 255])
})

test('a gradient fill layer runs from its start colour to its end colour', () => {
  const { document, canvases } = stack(['#000000'], 32, 8)
  const fill = createLayerMeta('Gradient', 'fill')
  fill.fill = {
    kind: 'gradient', color: '#ff0000', gradientKind: 'linear',
    start: { x: 0, y: 0 }, end: { x: 32, y: 0 }, endColor: '#0000ff',
  }
  document.layers.push(fill)
  const out = compositeDocument(document, canvases)
  assert.ok(px(out, 0, 4)[0] > 240, 'red at the start')
  assert.ok(px(out, 31, 4)[2] > 240, 'blue at the end')
  const mid = px(out, 16, 4)
  assert.ok(mid[0] > 60 && mid[2] > 60, `midway is a mix, got [${mid}]`)
})

test('a text layer rasterises into the composite', () => {
  const { document, canvases } = stack(['#000000'], 64, 32)
  const text = createLayerMeta('Type', 'text')
  text.text = {
    text: 'HELLO', x: 2, y: 2, fontFamily: 'sans-serif', fontSize: 24,
    color: '#ffffff', bold: true, italic: false, align: 'left', vertical: false,
  }
  document.layers.push(text)
  const out = compositeDocument(document, canvases)
  let lit = 0
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      if (px(out, x, y)[0] > 128) lit += 1
    }
  }
  assert.ok(lit > 40, `expected glyph pixels in the composite, found ${lit}`)
})

test('a shape layer rasterises into the composite', () => {
  const { document, canvases } = stack(['#000000'], 32, 32)
  const shape = createLayerMeta('Rect', 'shape')
  shape.shape = {
    kind: 'rect', x: 8, y: 8, width: 16, height: 16,
    fill: '#00ff00', stroke: '#00ff00', strokeWidth: 1, sides: 5, radius: 4,
  }
  document.layers.push(shape)
  const out = compositeDocument(document, canvases)
  assert.deepEqual(px(out, 16, 16), [0, 255, 0, 255], 'inside the shape')
  assert.deepEqual(px(out, 2, 2), [0, 0, 0, 255], 'outside the shape')
})

test('a grayscale document is desaturated after everything else composites', () => {
  const { document, canvases } = stack(['#ff0000'])
  document.colorMode = 'gray'
  const out = px(compositeDocument(document, canvases), 4, 4)
  assert.equal(out[0], 76)
  assert.equal(out[0], out[1])
  assert.equal(out[1], out[2])
})

test('compositeDocument reuses and resizes a supplied target canvas', () => {
  const { document, canvases } = stack(['#ff0000'], 8, 8)
  const target = createCanvas(3, 3)
  const out = compositeDocument(document, canvases, target)
  assert.equal(out, target, 'the same canvas object comes back')
  assert.equal(target.width, 8)
  assert.equal(target.height, 8)
})

test('an opaque document background shows through transparent layers', () => {
  const { document, canvases } = createBlankDocument('doc', 8, 8, '#ffffff', 'Background')
  clearCanvas(canvases.get(document.layers[0].id))
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [255, 255, 255, 255])
})

test('sampleComposite reads the flattened colour under a point', () => {
  const { document, canvases } = stack(['#ff0000', '#0000ff'])
  document.layers[1].opacity = 0.5
  const sample = sampleComposite(document, canvases, { x: 4.9, y: 4.1 })
  assertNear(sample.r, 128, 2, 'red')
  assertNear(sample.b, 128, 2, 'blue')
  assert.equal(sample.a, 255)
})

test('sampleComposite returns a transparent reading outside the canvas', () => {
  const { document, canvases } = stack(['#ff0000'])
  assert.deepEqual(sampleComposite(document, canvases, { x: -1, y: 0 }), { r: 0, g: 0, b: 0, a: 0 })
  assert.deepEqual(sampleComposite(document, canvases, { x: 8, y: 0 }), { r: 0, g: 0, b: 0, a: 0 })
  assert.deepEqual(sampleComposite(document, canvases, { x: 0, y: 8 }), { r: 0, g: 0, b: 0, a: 0 })
})

test('a Curves adjustment layer applies its own table, not the slider pipeline', () => {
  const { document, canvases } = stack(['#404040'])
  const invert = createLayerMeta('Curves', 'adjustment')
  invert.curves = { ...defaultCurves(), rgb: [{ x: 0, y: 255 }, { x: 255, y: 0 }] }
  document.layers.push(invert)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [191, 191, 191, 255])
})

test('a Levels adjustment layer clips to its black and white points', () => {
  const { document, canvases } = stack(['#323232'])
  const levels = createLayerMeta('Levels', 'adjustment')
  levels.levels = { ...defaultLevels(), black: 50, white: 200 }
  document.layers.push(levels)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [0, 0, 0, 255])
})

test('a Curves layer takes precedence over a slider adjustment on the same layer', () => {
  const { document, canvases } = stack(['#404040'])
  const layer = createLayerMeta('Curves', 'adjustment')
  layer.adjustment = { ...defaultAdjustment('brightness'), brightness: 100 }
  layer.curves = { ...defaultCurves(), rgb: [{ x: 0, y: 0 }, { x: 255, y: 0 }] }
  document.layers.push(layer)
  assert.deepEqual(px(compositeDocument(document, canvases), 4, 4), [0, 0, 0, 255], 'the curve wins')
})

test('a new document carries the empty path, slice, frame and measure collections', () => {
  const { document } = createBlankDocument('doc', 8, 8, 'transparent', 'Layer')
  assert.deepEqual(document.paths, [])
  assert.deepEqual(document.slices, [])
  assert.deepEqual(document.frames, [])
  assert.equal(document.measure, null)
})

test('padCanvas crops what leaves the canvas, which is why a move must keep the original', () => {
  // The bug this documents: re-padding an already-shifted canvas loses whatever
  // went past the edge, so dragging a layer out and back came back clipped.
  const source = canvasFrom(8, 8, (x, y) => (x < 2 ? [255, 0, 0] : [0, 0, 255]))

  const stepped = padCanvas(padCanvas(source, 8, 8, -4, 0), 8, 8, 4, 0)
  assert.equal(px(stepped, 0, 4)[3], 0, 'shifting out and back in two steps loses the red band')

  const fromOriginal = padCanvas(source, 8, 8, 0, 0)
  assert.deepEqual(px(fromOriginal, 0, 4), [255, 0, 0, 255], 'redrawing from the original keeps it')
})

/* --------------------------------------------------------- clipping masks */

/** A base layer covering only the left half, with a full-bleed layer above it. */
function clipPair(clipped) {
  const { document, canvases } = createBlankDocument('doc', 8, 4, 'transparent', 'base')
  const base = document.layers[0]
  const half = canvasFrom(8, 4, (x) => (x < 4 ? [0, 0, 255, 255] : [0, 0, 0, 0]))
  canvases.set(base.id, half)

  const top = createLayerMeta('top')
  top.clipped = clipped
  canvases.set(top.id, canvasOf(8, 4, '#ff0000'))
  document.layers.push(top)
  return { document, canvases }
}

test('a clipped layer only shows where the layer below it has pixels', () => {
  const { document, canvases } = clipPair(true)
  const flat = compositeDocument(document, canvases)
  assert.deepEqual(px(flat, 1, 2), [255, 0, 0, 255], 'over the base, the clipped layer shows')
  assert.deepEqual(px(flat, 6, 2), [0, 0, 0, 0], 'past its edge, it is cut away')
})

test('the same pair with the clip off covers everything, as before', () => {
  const { document, canvases } = clipPair(false)
  const flat = compositeDocument(document, canvases)
  assert.deepEqual(px(flat, 6, 2), [255, 0, 0, 255], 'an unclipped layer is not cut back')
})

test('a clipped adjustment layer only adjusts what the base layer covers', () => {
  const { document, canvases } = createBlankDocument('doc', 8, 4, 'transparent', 'base')
  const base = document.layers[0]
  canvases.set(base.id, canvasFrom(8, 4, (x) => (x < 4 ? [120, 120, 120, 255] : [0, 0, 0, 0])))

  const mid = createLayerMeta('mid')
  canvases.set(mid.id, canvasFrom(8, 4, (x) => (x < 4 ? [0, 0, 0, 0] : [120, 120, 120, 255])))
  document.layers.push(mid)

  const invert = createLayerMeta('invert', 'adjustment')
  invert.clipped = true
  invert.adjustment = { ...defaultAdjustment(), type: 'invert' }
  document.layers.push(invert)

  // The adjustment is clipped to `mid`, which covers only the right-hand half.
  const flat = compositeDocument(document, canvases)
  assert.deepEqual(px(flat, 1, 2).slice(0, 3), [120, 120, 120], 'the left half is untouched')
  assert.deepEqual(px(flat, 6, 2).slice(0, 3), [135, 135, 135], 'the right half was inverted')
})
