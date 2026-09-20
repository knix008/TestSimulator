// The tool strip: brush, pencil, eraser, gradient, type, clone, heal, smudge,
// dodge/burn, sponge, red-eye and colour replace.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cloneStamp, colorReplace, dodgeBurn, healStamp, paintGradient, paintStroke, rasterizeText,
  redEyeFix, smudge, spongeDesaturate,
} from '../src/lib/tools.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertNear, canvasFrom, canvasOf, meanDiff, px } from './helpers/pixels.mjs'

const brush = { size: 10, hardness: 1, color: '#ff0000', opacity: 1, selection: null }

test('a brush stroke paints along the drag and leaves the rest untouched', () => {
  const layer = canvasOf(40, 40)
  paintStroke(layer, { x: 5, y: 20 }, { x: 35, y: 20 }, brush)
  assert.deepEqual(px(layer, 5, 20), [255, 0, 0, 255], 'at the start')
  assert.deepEqual(px(layer, 20, 20), [255, 0, 0, 255], 'midway — the stroke is interpolated, not two dots')
  assert.deepEqual(px(layer, 35, 20), [255, 0, 0, 255], 'at the end')
  assert.equal(px(layer, 20, 35)[3], 0, 'well away from the stroke')
})

test('a zero-length drag still stamps a dab', () => {
  const layer = canvasOf(20, 20)
  paintStroke(layer, { x: 10, y: 10 }, { x: 10, y: 10 }, brush)
  assert.deepEqual(px(layer, 10, 10), [255, 0, 0, 255])
})

test('brush hardness controls how fast the edge falls off', () => {
  const hard = canvasOf(30, 30)
  paintStroke(hard, { x: 15, y: 15 }, { x: 15, y: 15 }, { ...brush, size: 16, hardness: 1 })
  const soft = canvasOf(30, 30)
  paintStroke(soft, { x: 15, y: 15 }, { x: 15, y: 15 }, { ...brush, size: 16, hardness: 0 })
  // The hard brush stays flat out to the rim; the soft one fades from the centre.
  assertNear(px(hard, 15, 15)[3], 255, 2, 'hard brush centre')
  assertNear(px(hard, 20, 15)[3], 255, 2, 'hard brush still solid near the rim')
  assert.ok(px(soft, 15, 15)[3] > 200, 'the soft brush is still strong at its centre')
  assert.ok(px(soft, 20, 15)[3] < 128, 'but has faded well before the rim')
  // Both vanish at the brush radius (size / 2 = 8).
  assert.equal(px(hard, 23, 15)[3], 0)
  assert.equal(px(soft, 23, 15)[3], 0)
})

test('the pencil ignores hardness and always paints a hard edge', () => {
  const pencil = canvasOf(30, 30)
  paintStroke(pencil, { x: 15, y: 15 }, { x: 15, y: 15 }, { ...brush, size: 16, hardness: 0, pencil: true })
  const soft = canvasOf(30, 30)
  paintStroke(soft, { x: 15, y: 15 }, { x: 15, y: 15 }, { ...brush, size: 16, hardness: 0 })
  assert.ok(px(pencil, 21, 15)[3] > px(soft, 21, 15)[3])
})

test('a single dab deposits exactly the requested opacity', () => {
  for (const [opacity, expected] of [[0.2, 51], [0.4, 102], [1, 255]]) {
    const layer = canvasOf(20, 20)
    paintStroke(layer, { x: 10, y: 10 }, { x: 10, y: 10 }, { ...brush, opacity })
    assertNear(px(layer, 10, 10)[3], expected, 2, `alpha at ${opacity} opacity`)
  }
})

test('a brush stroke is clipped to the active selection', () => {
  const layer = canvasOf(40, 40)
  paintStroke(layer, { x: 5, y: 20 }, { x: 35, y: 20 }, { ...brush, selection: rectSelection(0, 0, 20, 40) })
  assert.deepEqual(px(layer, 10, 20), [255, 0, 0, 255], 'inside the selection')
  assert.equal(px(layer, 30, 20)[3], 0, 'outside the selection')
})

test('the eraser removes existing pixels instead of painting over them', () => {
  const layer = canvasOf(40, 40, '#0000ff')
  paintStroke(layer, { x: 20, y: 20 }, { x: 20, y: 20 }, { ...brush, size: 12, erase: true })
  assert.equal(px(layer, 20, 20)[3], 0, 'the centre is erased to transparent')
  assert.deepEqual(px(layer, 2, 2), [0, 0, 255, 255], 'the rest of the layer survives')
})

test('the eraser honours the selection, so protected pixels stay', () => {
  const layer = canvasOf(40, 40, '#0000ff')
  paintStroke(layer, { x: 5, y: 20 }, { x: 35, y: 20 }, {
    ...brush, size: 12, erase: true, selection: rectSelection(0, 0, 20, 40),
  })
  assert.equal(px(layer, 10, 20)[3], 0, 'erased inside the selection')
  assert.equal(px(layer, 30, 20)[3], 255, 'protected outside it')
})

test('a linear gradient runs from the start colour to the end colour', () => {
  const layer = canvasOf(32, 8)
  paintGradient(layer, { x: 0, y: 4 }, { x: 31, y: 4 }, '#ff0000', '#0000ff', 'linear', null)
  assert.ok(px(layer, 0, 4)[0] > 240, 'red at the start')
  assert.ok(px(layer, 31, 4)[2] > 240, 'blue at the end')
  const mid = px(layer, 16, 4)
  assert.ok(mid[0] > 60 && mid[2] > 60, `mid should be a blend, got [${mid}]`)
})

test('a radial gradient is centred on the drag origin', () => {
  const layer = canvasOf(32, 32)
  paintGradient(layer, { x: 16, y: 16 }, { x: 31, y: 16 }, '#ffffff', '#000000', 'radial', null)
  assert.ok(px(layer, 16, 16)[0] > 240, 'bright at the centre')
  assert.ok(px(layer, 30, 16)[0] < 60, 'dark at the rim')
})

test('a reflected gradient is symmetric about the drag start', () => {
  const layer = canvasOf(32, 8)
  paintGradient(layer, { x: 0, y: 4 }, { x: 31, y: 4 }, '#ffffff', '#000000', 'reflected', null)
  // Reflected puts the end colour at both extremes and the start colour in the middle.
  assert.ok(px(layer, 0, 4)[0] < 60, 'dark at the drag start')
  assert.ok(px(layer, 16, 4)[0] > 180, 'bright at the halfway point')
})

test('a diamond gradient falls off radially like the radial one', () => {
  const layer = canvasOf(32, 32)
  paintGradient(layer, { x: 16, y: 16 }, { x: 31, y: 16 }, '#ffffff', '#000000', 'diamond', null)
  assert.ok(px(layer, 16, 16)[0] > px(layer, 30, 16)[0])
})

test('an angle gradient sweeps around the origin', () => {
  const layer = canvasOf(16, 16)
  paintGradient(layer, { x: 8, y: 8 }, { x: 15, y: 8 }, '#ffffff', '#000000', 'angle', null)
  // The sweep is encoded in alpha, so opposite sides of the origin differ.
  assert.notEqual(px(layer, 1, 8)[3], px(layer, 14, 8)[3])
})

test('a gradient is clipped to the selection', () => {
  const layer = canvasOf(32, 8)
  paintGradient(layer, { x: 0, y: 4 }, { x: 31, y: 4 }, '#ff0000', '#0000ff', 'linear',
    rectSelection(0, 0, 16, 8))
  assert.ok(px(layer, 4, 4)[3] > 0, 'painted inside')
  assert.equal(px(layer, 24, 4)[3], 0, 'nothing outside')
})

test('rasterizeText draws glyphs onto the layer', () => {
  const layer = canvasOf(80, 32)
  rasterizeText(layer, 'Ag', { x: 4, y: 4 }, { fontFamily: 'sans-serif', fontSize: 24, color: '#ffffff', selection: null })
  let lit = 0
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 80; x += 1) {
      if (px(layer, x, y)[3] > 128) lit += 1
    }
  }
  assert.ok(lit > 40, `expected glyph coverage, found ${lit} pixels`)
})

test('vertical text stacks characters downward instead of across', () => {
  const horizontal = canvasOf(120, 120)
  rasterizeText(horizontal, 'ABC', { x: 4, y: 4 }, { fontFamily: 'sans-serif', fontSize: 20, color: '#ffffff', selection: null })
  const vertical = canvasOf(120, 120)
  rasterizeText(vertical, 'ABC', { x: 4, y: 4 }, { fontFamily: 'sans-serif', fontSize: 20, color: '#ffffff', selection: null, vertical: true })

  const extent = (canvas, axis) => {
    let max = 0
    for (let y = 0; y < 120; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        if (px(canvas, x, y)[3] > 128) max = Math.max(max, axis === 'x' ? x : y)
      }
    }
    return max
  }
  assert.ok(extent(vertical, 'y') > extent(horizontal, 'y'), 'vertical text runs further down')
  assert.ok(extent(horizontal, 'x') > extent(vertical, 'x'), 'horizontal text runs further across')
})

test('text is clipped to the selection', () => {
  const layer = canvasOf(120, 40)
  rasterizeText(layer, 'AAAAAA', { x: 2, y: 4 }, {
    fontFamily: 'sans-serif', fontSize: 28, color: '#ffffff', selection: rectSelection(0, 0, 40, 40),
  })
  let outside = 0
  for (let y = 0; y < 40; y += 1) {
    for (let x = 40; x < 120; x += 1) {
      if (px(layer, x, y)[3] > 0) outside += 1
    }
  }
  assert.equal(outside, 0, 'no glyph pixels escaped the selection')
})

test('the clone stamp copies pixels from the Alt-clicked source, keeping the offset along the stroke', () => {
  // Left half red, right half blue; Alt-clicked on the red side at (10, 20),
  // then painting on the blue side starting at (30, 20).
  const layer = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  cloneStamp(layer, { x: 30, y: 20 }, { x: 30, y: 20 }, { x: 10, y: 20 }, { x: 30, y: 20 }, 10, null)
  assert.deepEqual(px(layer, 30, 20), [255, 0, 0, 255], 'red was stamped onto the blue side')
  assert.deepEqual(px(layer, 38, 20), [0, 0, 255, 255], 'outside the brush the blue remains')
  // Dragging on to (30, 30) keeps sampling 20px to the left: (10, 30), still red.
  cloneStamp(layer, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 10, y: 20 }, { x: 30, y: 20 }, 10, null)
  assert.deepEqual(px(layer, 30, 30), [255, 0, 0, 255], 'the offset is kept as the stroke moves')
  assert.deepEqual(px(layer, 30, 25), [255, 0, 0, 255], 'the band between the two events is covered too')
  // Sampling from the blue side onto the red side works the other way round.
  const other = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  cloneStamp(other, { x: 10, y: 20 }, { x: 10, y: 20 }, { x: 30, y: 20 }, { x: 10, y: 20 }, 10, null)
  assert.deepEqual(px(other, 10, 20), [0, 0, 255, 255], 'blue was stamped onto the red side')
})

test('the healing brush softens the spot it is applied to', () => {
  const layer = canvasFrom(40, 40, (x, y) => (Math.hypot(x - 20, y - 20) < 3 ? [255, 0, 0] : [30, 120, 60]))
  const before = px(layer, 20, 20)
  healStamp(layer, { x: 20, y: 20 }, 12, null)
  const after = px(layer, 20, 20)
  assert.notDeepEqual(after, before, 'the blemish was touched')
  assert.ok(after[1] > before[1], 'the surrounding green bleeds in')
})

test('dodge brightens and burn darkens, strongest at the brush centre', () => {
  const dodged = canvasOf(40, 40, '#808080')
  dodgeBurn(dodged, { x: 20, y: 20 }, 16, 1, false, null)
  assert.ok(px(dodged, 20, 20)[0] > 128, 'the centre is lifted')
  assert.ok(px(dodged, 20, 20)[0] > px(dodged, 26, 20)[0], 'the falloff is radial')
  assert.deepEqual(px(dodged, 2, 2), [128, 128, 128, 255], 'outside the brush nothing changed')

  const burned = canvasOf(40, 40, '#808080')
  dodgeBurn(burned, { x: 20, y: 20 }, 16, 1, true, null)
  assert.ok(px(burned, 20, 20)[0] < 128)
})

test('dodge/burn respects a mask selection', () => {
  const layer = canvasOf(40, 40, '#808080')
  const mask = new Uint8Array(40 * 40)
  for (let y = 0; y < 40; y += 1) {
    for (let x = 0; x < 20; x += 1) mask[y * 40 + x] = 255
  }
  dodgeBurn(layer, { x: 20, y: 20 }, 24, 1, false, { kind: 'mask', x: 0, y: 0, width: 40, height: 40, mask })
  assert.ok(px(layer, 14, 20)[0] > 128, 'inside the mask')
  assert.deepEqual(px(layer, 26, 20), [128, 128, 128, 255], 'outside the mask')
})

test('the sponge drains and restores saturation locally', () => {
  const desaturated = canvasOf(40, 40, '#cc3333')
  spongeDesaturate(desaturated, { x: 20, y: 20 }, 16, false)
  const drained = px(desaturated, 20, 20)
  assert.ok(drained[0] - drained[1] < 0xcc - 0x33, 'the channels moved closer together')
  assert.deepEqual(px(desaturated, 2, 2), [204, 51, 51, 255], 'outside the brush is untouched')

  const saturated = canvasOf(40, 40, '#cc3333')
  spongeDesaturate(saturated, { x: 20, y: 20 }, 16, true)
  const boosted = px(saturated, 20, 20)
  assert.ok(boosted[0] - boosted[1] > 0xcc - 0x33, 'saturating spreads them further apart')
})

test('red-eye neutralises red pixels and leaves other colours alone', () => {
  const layer = canvasFrom(40, 40, (x) => (x < 20 ? [200, 30, 30] : [30, 30, 200]))
  redEyeFix(layer, { x: 10, y: 20 }, 12)
  const fixed = px(layer, 10, 20)
  assert.ok(fixed[0] < 100, `the red cast is removed, got [${fixed}]`)
  assert.equal(fixed[0], fixed[1], 'the pixel is neutral grey')

  redEyeFix(layer, { x: 30, y: 20 }, 12)
  assert.deepEqual(px(layer, 30, 20), [30, 30, 200, 255], 'blue is not touched')
})

test('colour replace repaints matching pixels and skips ones outside the tolerance', () => {
  const layer = canvasFrom(40, 40, (x) => (x < 20 ? [128, 128, 128] : [10, 200, 10]))
  colorReplace(layer, { x: 10, y: 20 }, 40, '#0000ff', 20)
  const replaced = px(layer, 10, 20)
  assert.ok(replaced[2] > replaced[0] && replaced[2] > replaced[1], `expected a blue cast, got [${replaced}]`)
  assert.deepEqual(px(layer, 30, 20), [10, 200, 10, 255], 'the green region is outside the tolerance')
})

test('smudge drags pixels in the direction of the stroke', () => {
  const layer = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  const before = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  smudge(layer, { x: 18, y: 20 }, { x: 26, y: 20 }, 12, null)
  assert.ok(meanDiff(layer, before) > 0, 'the smudge changed pixels')
  assert.ok(px(layer, 24, 20)[0] > 0, 'red was pulled across the seam')
})
