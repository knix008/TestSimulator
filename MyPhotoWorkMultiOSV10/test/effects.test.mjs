// Layer styles, plus the live text and shape rasterisers that fill/type/shape
// layers are rebuilt from on every composite.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLayerEffects, rasterizeShape, rasterizeTextLayer } from '../src/lib/effects.ts'
import { defaultEffects } from '../src/lib/types.ts'
import { canvasOf, meanDiff, px } from './helpers/pixels.mjs'

/** An opaque square in the middle of a transparent canvas — something for a style to grip. */
function badge(size = 40) {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(size / 4, size / 4, size / 2, size / 2)
  return canvas
}

function alphaCount(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  let n = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) n += 1
  }
  return n
}

const baseShape = {
  kind: 'rect', x: 8, y: 8, width: 24, height: 24,
  fill: '#3366cc', stroke: '#ff0000', strokeWidth: 2, sides: 5, radius: 6,
}

test('with every style off the source canvas is returned unchanged', () => {
  const source = badge()
  assert.equal(applyLayerEffects(source, defaultEffects()), source, 'no copy is made on the fast path')
})

test('a drop shadow adds pixels outside the original silhouette', () => {
  const source = badge()
  const out = applyLayerEffects(source, {
    ...defaultEffects(), dropShadow: true, shadowColor: '#000000', shadowBlur: 6, shadowX: 6, shadowY: 6,
  })
  assert.notEqual(out, source, 'a styled layer is drawn into a new canvas')
  assert.ok(alphaCount(out) > alphaCount(source), 'the shadow covers more area than the shape')
  assert.ok(px(out, 28, 28)[3] > 0, 'there is shadow below and right of the square')
  assert.deepEqual(px(out, 20, 20), [255, 255, 255, 255], 'the shape itself still sits on top')
})

test('an outer glow also grows the silhouette', () => {
  const source = badge()
  const out = applyLayerEffects(source, { ...defaultEffects(), outerGlow: true })
  assert.ok(alphaCount(out) > alphaCount(source))
})

test('a colour overlay tints only the opaque pixels, never the empty margin', () => {
  const source = badge()
  const out = applyLayerEffects(source, {
    ...defaultEffects(), colorOverlay: true, overlayColor: '#ff0000', overlayOpacity: 1,
  })
  assert.deepEqual(px(out, 20, 20), [255, 0, 0, 255], 'the shape is fully tinted')
  assert.equal(px(out, 2, 2)[3], 0, 'source-atop leaves the transparent margin alone')
})

test('colour overlay opacity blends rather than replaces', () => {
  const source = badge()
  const out = applyLayerEffects(source, {
    ...defaultEffects(), colorOverlay: true, overlayColor: '#000000', overlayOpacity: 0.5,
  })
  const tinted = px(out, 20, 20)
  assert.ok(tinted[0] > 100 && tinted[0] < 180, `expected a half-strength tint, got [${tinted}]`)
})

test('a stroke draws a border around the layer content, not the canvas', () => {
  const source = badge()
  const out = applyLayerEffects(source, {
    ...defaultEffects(), stroke: true, strokeColor: '#ff0000', strokeWidth: 4, strokePosition: 'outside',
  })
  // The square runs 10..30; an outside stroke of 4 sits in 6..10 and 30..34.
  assert.deepEqual(px(out, 8, 20).slice(0, 3), [255, 0, 0], 'the left border is drawn')
  assert.deepEqual(px(out, 32, 20).slice(0, 3), [255, 0, 0], 'and the right one')
  assert.equal(px(out, 1, 20)[3], 0, 'nothing is drawn at the canvas edge')
  assert.deepEqual(px(out, 20, 20), [255, 255, 255, 255], 'the shape itself is untouched')

  const inside = applyLayerEffects(source, {
    ...defaultEffects(), stroke: true, strokeColor: '#ff0000', strokeWidth: 4, strokePosition: 'inside',
  })
  assert.deepEqual(px(inside, 11, 20).slice(0, 3), [255, 0, 0], 'an inside stroke eats into the shape')
  assert.equal(px(inside, 8, 20)[3], 0, 'and adds nothing outside it')
})

test('the newer styles each change the picture and stay inside the canvas', () => {
  const source = badge()
  for (const key of ['innerShadow', 'satin', 'gradientOverlay', 'patternOverlay']) {
    const out = applyLayerEffects(source, { ...defaultEffects(), [key]: true, patternId: undefined })
    assert.equal(out.width, source.width, key)
    if (key !== 'patternOverlay') assert.ok(meanDiff(out, source) > 0, `${key} had no visible effect`)
    assert.equal(px(out, 2, 2)[3], 0, `${key} spilled outside the layer`)
  }
})

test('a style never resizes the layer canvas', () => {
  const source = badge()
  for (const key of ['dropShadow', 'outerGlow', 'colorOverlay', 'innerGlow', 'bevel', 'stroke']) {
    const out = applyLayerEffects(source, { ...defaultEffects(), [key]: true })
    assert.equal(out.width, source.width, key)
    assert.equal(out.height, source.height, key)
  }
})

test('bevel shades the layer from light at the top to dark at the bottom', () => {
  const source = badge()
  const out = applyLayerEffects(source, { ...defaultEffects(), bevel: true })
  assert.ok(meanDiff(out, source) > 0, 'bevel had no visible effect')
  assert.ok(px(out, 20, 12)[0] >= px(out, 20, 28)[0], 'the top of the shape is not darker than the bottom')
})

test('the inner glow hugs the inside of the layer edge, not the canvas border', () => {
  // A mid-grey square so the glow has room to brighten it.
  const source = canvasOf(40, 40)
  const ctx = source.getContext('2d')
  ctx.fillStyle = '#404040'
  ctx.fillRect(10, 10, 20, 20)

  const out = applyLayerEffects(source, { ...defaultEffects(), innerGlow: true })
  assert.ok(px(out, 11, 20)[0] > px(out, 20, 20)[0], 'the rim is brighter than the middle')
  assert.ok(px(out, 11, 20)[0] > 0x40, 'the rim is brighter than the untouched fill')
  assert.equal(px(out, 2, 2)[3], 0, 'nothing spills outside the layer silhouette')
})

test('rasterizeTextLayer draws the string at the document size', () => {
  const canvas = rasterizeTextLayer(120, 40, {
    text: 'Photo', x: 4, y: 4, fontFamily: 'sans-serif', fontSize: 28,
    color: '#ffffff', bold: false, italic: false, align: 'left', vertical: false,
  })
  assert.equal(canvas.width, 120)
  assert.equal(canvas.height, 40)
  assert.ok(alphaCount(canvas) > 40, 'glyphs were drawn')
})

test('an empty text layer rasterises to a blank canvas', () => {
  const canvas = rasterizeTextLayer(60, 30, {
    text: '', x: 4, y: 4, fontFamily: 'sans-serif', fontSize: 20,
    color: '#ffffff', bold: false, italic: false, align: 'left', vertical: false,
  })
  assert.equal(alphaCount(canvas), 0)
})

test('text alignment moves the glyphs relative to the anchor point', () => {
  const make = (align) => rasterizeTextLayer(160, 40, {
    text: 'WWW', x: 80, y: 4, fontFamily: 'sans-serif', fontSize: 24,
    color: '#ffffff', bold: false, italic: false, align, vertical: false,
  })
  const leftmost = (canvas) => {
    for (let x = 0; x < 160; x += 1) {
      for (let y = 0; y < 40; y += 1) {
        if (px(canvas, x, y)[3] > 8) return x
      }
    }
    return 160
  }
  assert.ok(leftmost(make('right')) < leftmost(make('center')), 'right-aligned text starts further left')
  assert.ok(leftmost(make('center')) < leftmost(make('left')), 'centred starts left of left-aligned')
})

test('bold text covers more ink than regular text', () => {
  const make = (bold) => rasterizeTextLayer(160, 40, {
    text: 'Photo', x: 4, y: 4, fontFamily: 'sans-serif', fontSize: 28,
    color: '#ffffff', bold, italic: false, align: 'left', vertical: false,
  })
  assert.ok(alphaCount(make(true)) > alphaCount(make(false)))
})

test('every shape kind rasterises inside its box without throwing', () => {
  const kinds = ['rect', 'roundRect', 'ellipse', 'polygon', 'line', 'star', 'heart', 'arrow', 'triangle']
  for (const kind of kinds) {
    const canvas = rasterizeShape(40, 40, { ...baseShape, kind })
    assert.ok(alphaCount(canvas) > 0, `${kind} drew nothing`)
    assert.equal(px(canvas, 1, 1)[3], 0, `${kind} leaked outside its box`)
  }
})

test('a rectangle shape fills its box and a line does not', () => {
  const rect = rasterizeShape(40, 40, baseShape)
  assert.deepEqual(px(rect, 20, 20), [51, 102, 204, 255])

  // A line is stroked only, so the middle of the box stays empty either side of it.
  const line = rasterizeShape(40, 40, { ...baseShape, kind: 'line' })
  assert.equal(px(line, 30, 10)[3], 0, 'the area off the line is empty')
})

test('an ellipse shape is round: the centre is filled, the corners are not', () => {
  const canvas = rasterizeShape(40, 40, { ...baseShape, kind: 'ellipse', strokeWidth: 0 })
  assert.deepEqual(px(canvas, 20, 20), [51, 102, 204, 255], 'centre')
  assert.equal(px(canvas, 9, 9)[3], 0, 'the box corner is outside the ellipse')
})

test('a polygon honours its side count and never drops below three', () => {
  const triangle = rasterizeShape(40, 40, { ...baseShape, kind: 'polygon', sides: 3 })
  const octagon = rasterizeShape(40, 40, { ...baseShape, kind: 'polygon', sides: 8 })
  assert.ok(alphaCount(octagon) > alphaCount(triangle), 'more sides fill more of the box')

  const degenerate = rasterizeShape(40, 40, { ...baseShape, kind: 'polygon', sides: 0 })
  assert.ok(alphaCount(degenerate) > 0, 'a zero-sided polygon still falls back to a triangle')
})

test('a star is spikier than the polygon with the same side count', () => {
  const star = rasterizeShape(40, 40, { ...baseShape, kind: 'star', sides: 10 })
  const polygon = rasterizeShape(40, 40, { ...baseShape, kind: 'polygon', sides: 10 })
  assert.ok(alphaCount(star) < alphaCount(polygon), 'a star covers less of its box')
})

test('the rounded rectangle radius is clamped to half the shorter side', () => {
  // A huge radius must not throw; it just becomes a stadium/circle.
  const canvas = rasterizeShape(40, 40, { ...baseShape, kind: 'roundRect', radius: 1000, strokeWidth: 0 })
  assert.ok(alphaCount(canvas) > 0)
  assert.equal(px(canvas, 9, 9)[3], 0, 'the corners are rounded away')
})
