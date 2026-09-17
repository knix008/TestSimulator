// The Filter menu. Every filter is also checked against an active selection,
// because clipping to the selection is the part that is easy to get wrong.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addNoise, adjustBrightnessContrast, adjustHueSaturation, clearSelectionPixels, clouds, emboss,
  findEdges, gaussianBlur, grayscale, highPass, histogram, invertColors, mosaic, motionBlur, offset,
  oilPaint, sharpen, solarize, threshold, vignette,
} from '../src/lib/filters.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertNear, canvasFrom, canvasOf, meanDiff, px, withSeededRandom } from './helpers/pixels.mjs'

/** A 16x16 image with a bright square in the middle — enough structure for blur/edge tests. */
function testImage() {
  return canvasFrom(16, 16, (x, y) => (x >= 6 && x < 10 && y >= 6 && y < 10 ? [240, 240, 240] : [20, 20, 20]))
}

/** A 16x16 vertical colour ramp. */
function ramp() {
  return canvasFrom(16, 16, (x) => [x * 16, 128, 255 - x * 16])
}

test('brightness/contrast lifts and lowers tones around the mid-point', () => {
  const canvas = canvasOf(8, 8, '#808080')
  adjustBrightnessContrast(canvas, 20, 0, null)
  assert.ok(px(canvas, 0, 0)[0] > 128)

  const darker = canvasOf(8, 8, '#808080')
  adjustBrightnessContrast(darker, -20, 0, null)
  assert.ok(px(darker, 0, 0)[0] < 128)

  const neutral = canvasOf(8, 8, '#808080')
  adjustBrightnessContrast(neutral, 0, 0, null)
  assertNear(px(neutral, 0, 0)[0], 128, 1, 'zeroed sliders are a no-op')
})

test('brightness/contrast only touches pixels inside the selection', () => {
  const canvas = canvasOf(8, 8, '#808080')
  adjustBrightnessContrast(canvas, 50, 0, rectSelection(0, 0, 4, 8))
  assert.ok(px(canvas, 1, 1)[0] > 128, 'inside changed')
  assert.deepEqual(px(canvas, 6, 1), [128, 128, 128, 255], 'outside untouched')
})

test('hue/saturation rotates hue and can fully desaturate', () => {
  const canvas = canvasOf(4, 4, '#ff0000')
  adjustHueSaturation(canvas, 120, 0, 0, null)
  const rotated = px(canvas, 0, 0)
  assert.ok(rotated[1] > rotated[0], 'red rotated toward green')

  const grey = canvasOf(4, 4, '#ff0000')
  adjustHueSaturation(grey, 0, -100, 0, null)
  const out = px(grey, 0, 0)
  assert.equal(out[0], out[1])
  assert.equal(out[1], out[2])
})

test('hue/saturation lightness pushes toward white and black', () => {
  const lighter = canvasOf(4, 4, '#804040')
  adjustHueSaturation(lighter, 0, 0, 40, null)
  assert.ok(px(lighter, 0, 0)[0] > 128)

  const darker = canvasOf(4, 4, '#804040')
  adjustHueSaturation(darker, 0, 0, -40, null)
  assert.ok(px(darker, 0, 0)[0] < 128)
})

test('invert is its own inverse and leaves alpha alone', () => {
  const canvas = canvasFrom(4, 4, () => [10, 200, 30, 255])
  invertColors(canvas, null)
  assert.deepEqual(px(canvas, 0, 0), [245, 55, 225, 255])
  invertColors(canvas, null)
  assert.deepEqual(px(canvas, 0, 0), [10, 200, 30, 255])
})

test('invert keeps a semi-transparent pixel at its original alpha', () => {
  // Canvas storage is premultiplied, so colour channels round by a unit here;
  // alpha is the thing under test and must come back exactly.
  const canvas = canvasFrom(4, 4, () => [10, 200, 30, 128])
  invertColors(canvas, null)
  const out = px(canvas, 0, 0)
  assert.equal(out[3], 128)
  assertNear(out[0], 245, 2, 'red')
  assertNear(out[1], 55, 2, 'green')
})

test('invert respects the selection edge exactly', () => {
  const canvas = canvasOf(8, 8, '#000000')
  invertColors(canvas, rectSelection(2, 2, 3, 3))
  assert.deepEqual(px(canvas, 4, 4), [255, 255, 255, 255], 'last pixel inside is inverted')
  assert.deepEqual(px(canvas, 5, 4), [0, 0, 0, 255], 'the pixel past the edge is not')
})

test('grayscale uses Rec.601 luma weights', () => {
  const canvas = canvasFrom(3, 1, (x) => [x === 0 ? 255 : 0, x === 1 ? 255 : 0, x === 2 ? 255 : 0])
  grayscale(canvas, null)
  assert.equal(px(canvas, 0, 0)[0], 76)
  assert.equal(px(canvas, 1, 0)[0], 150)
  assert.equal(px(canvas, 2, 0)[0], 29)
})

test('threshold produces a pure two-tone image', () => {
  const canvas = ramp()
  threshold(canvas, 128, null)
  for (let x = 0; x < 16; x += 1) {
    const [r, g, b] = px(canvas, x, 0)
    assert.ok(r === 0 || r === 255, `pixel ${x} is not pure black or white: ${r}`)
    assert.equal(r, g)
    assert.equal(g, b)
  }
})

test('gaussian blur averages a hard edge without shifting the overall brightness', () => {
  const canvas = testImage()
  const before = histogram(canvas)
  gaussianBlur(canvas, 3, null)
  // The bright square's own centre dims and its dark surround lifts.
  assert.ok(px(canvas, 8, 8)[0] < 240, 'the bright core is pulled down')
  assert.ok(px(canvas, 5, 8)[0] > 20, 'the neighbouring dark pixel is lifted')
  // Some bins moved, so the filter actually ran.
  assert.notDeepEqual([...histogram(canvas).r], [...before.r])
})

test('gaussian blur with a non-positive radius is a no-op', () => {
  const canvas = testImage()
  const reference = testImage()
  gaussianBlur(canvas, 0, null)
  assert.equal(meanDiff(canvas, reference), 0)
  gaussianBlur(canvas, -4, null)
  assert.equal(meanDiff(canvas, reference), 0)
})

test('gaussian blur leaves a flat colour flat, so edge sampling does not darken borders', () => {
  const canvas = canvasOf(12, 12, '#3366cc')
  gaussianBlur(canvas, 4, null)
  assert.deepEqual(px(canvas, 0, 0), [51, 102, 204, 255], 'corner')
  assert.deepEqual(px(canvas, 6, 6), [51, 102, 204, 255], 'centre')
})

test('gaussian blur stays inside the selection', () => {
  const canvas = testImage()
  const reference = testImage()
  gaussianBlur(canvas, 3, rectSelection(0, 0, 8, 16))
  assert.deepEqual(px(canvas, 12, 8), px(reference, 12, 8), 'right half untouched')
})

test('sharpen increases edge contrast and does nothing at zero amount', () => {
  const canvas = testImage()
  gaussianBlur(canvas, 2, null)
  const soft = px(canvas, 8, 8)[0]
  sharpen(canvas, 100, null)
  assert.ok(px(canvas, 8, 8)[0] > soft, 'the bright side of the edge gets brighter')

  const untouched = testImage()
  const reference = testImage()
  sharpen(untouched, 0, null)
  assert.equal(meanDiff(untouched, reference), 0)
})

test('motion blur smears horizontally only', () => {
  // A single bright column: the smear must widen it in x and leave y alone.
  const canvas = canvasFrom(16, 16, (x) => (x === 8 ? [255, 255, 255] : [0, 0, 0]))
  motionBlur(canvas, 3, null)
  assert.ok(px(canvas, 6, 8)[0] > 0, 'the column bled sideways')
  assert.equal(px(canvas, 8, 0)[0], px(canvas, 8, 15)[0], 'every row is affected identically')
})

test('motion blur of a flat field changes nothing', () => {
  const canvas = canvasOf(10, 10, '#40a0ff')
  motionBlur(canvas, 5, null)
  assert.deepEqual(px(canvas, 5, 5), [64, 160, 255, 255])
})

test('mosaic replaces each cell with its top-left pixel', () => {
  const canvas = canvasFrom(8, 8, (x, y) => [x * 32, y * 32, 0])
  mosaic(canvas, 4, null)
  const cell = px(canvas, 0, 0)
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      assert.deepEqual(px(canvas, x, y), cell, `cell pixel (${x}, ${y})`)
    }
  }
  assert.notDeepEqual(px(canvas, 4, 0), cell, 'the next cell is a different colour')
})

test('mosaic forces a minimum cell size of 2 instead of dividing by zero', () => {
  const canvas = canvasFrom(8, 8, (x, y) => [x * 32, y * 32, 0])
  mosaic(canvas, 0, null)
  assert.deepEqual(px(canvas, 1, 1), px(canvas, 0, 0), 'cells are at least 2x2')
})

test('add noise perturbs pixels reproducibly for a fixed seed and keeps alpha', () => {
  const run = () => withSeededRandom(11, () => {
    const canvas = canvasFrom(8, 8, () => [128, 128, 128, 200])
    addNoise(canvas, 40, null)
    return px(canvas, 3, 3)
  })
  const first = run()
  assert.deepEqual(first, run())
  assert.notDeepEqual(first.slice(0, 3), [128, 128, 128])
  assert.equal(first[3], 200, 'alpha is preserved')
})

test('find edges lights up the boundary and leaves flat areas dark', () => {
  const canvas = testImage()
  findEdges(canvas, null)
  assert.ok(px(canvas, 6, 8)[0] > 60, 'the square boundary is bright')
  assert.ok(px(canvas, 1, 1)[0] < 20, 'the flat background stays dark')
  assert.ok(px(canvas, 8, 8)[0] < 20, 'the flat interior stays dark')
})

test('emboss produces a grey relief centred on 128', () => {
  const canvas = testImage()
  emboss(canvas, null)
  const flat = px(canvas, 3, 3)
  assert.deepEqual(flat.slice(0, 3), [128, 128, 128], 'flat areas sit at neutral grey')
  assert.notEqual(px(canvas, 6, 6)[0], 128, 'the corner of the square is lit')
})

test('solarize folds only the channels above the mid-point', () => {
  const canvas = canvasFrom(2, 1, (x) => (x === 0 ? [200, 100, 129] : [10, 128, 255]))
  solarize(canvas, null)
  assert.deepEqual(px(canvas, 0, 0), [55, 100, 126, 255])
  assert.deepEqual(px(canvas, 1, 0), [10, 128, 0, 255], '128 itself is left alone')
})

test('high pass flattens the image toward mid-grey but keeps the edges', () => {
  const canvas = testImage()
  highPass(canvas, 4, null)
  assertNear(px(canvas, 1, 1)[0], 128, 12, 'the flat background collapses to grey')
  assert.ok(Math.abs(px(canvas, 6, 6)[0] - 128) > 12, 'the edge survives')
})

test('oil paint posterises to multiples of 24', () => {
  const canvas = ramp()
  oilPaint(canvas, null)
  for (let x = 0; x < 16; x += 1) {
    assert.equal(px(canvas, x, 8)[0] % 24, 0, `pixel ${x} is not quantised`)
  }
})

test('vignette darkens the corners and leaves the centre alone', () => {
  const canvas = canvasOf(32, 32, '#ffffff')
  vignette(canvas, 1, null)
  assertNear(px(canvas, 16, 16)[0], 255, 8, 'centre stays bright')
  assert.ok(px(canvas, 0, 0)[0] < 60, `corner should be dark, got ${px(canvas, 0, 0)[0]}`)
  assert.ok(px(canvas, 31, 31)[0] < 60, 'the opposite corner too')
})

test('vignette at zero amount is a no-op', () => {
  const canvas = canvasOf(16, 16, '#ffffff')
  vignette(canvas, 0, null)
  assert.deepEqual(px(canvas, 0, 0), [255, 255, 255, 255])
})

test('clouds fills a transparent canvas with opaque noise', () => {
  const canvas = withSeededRandom(3, () => {
    const c = canvasOf(16, 16)
    clouds(c, null)
    return c
  })
  // `a || 255` in the filter means fully transparent pixels come back opaque.
  assert.equal(px(canvas, 4, 4)[3], 255)
  assert.notDeepEqual(px(canvas, 4, 4), px(canvas, 11, 11), 'the field varies across the canvas')
})

test('offset wraps the image around both axes', () => {
  // One bright pixel at the origin; offsetting by (2, 3) must move it, not lose it.
  const canvas = canvasFrom(8, 8, (x, y) => (x === 0 && y === 0 ? [255, 0, 0] : [0, 0, 255]))
  offset(canvas, 2, 3)
  assert.deepEqual(px(canvas, 2, 3), [255, 0, 0, 255], 'the pixel landed at the offset position')
  assert.deepEqual(px(canvas, 0, 0), [0, 0, 255, 255])
})

test('offset wraps negative shifts around to the far side', () => {
  const canvas = canvasFrom(8, 8, (x, y) => (x === 7 && y === 7 ? [255, 0, 0] : [0, 0, 255]))
  offset(canvas, -7, -7)
  assert.deepEqual(px(canvas, 0, 0), [255, 0, 0, 255])
})

test('clearSelectionPixels erases the selection and spares the rest', () => {
  const canvas = canvasOf(8, 8, '#ff0000')
  clearSelectionPixels(canvas, rectSelection(2, 2, 4, 4))
  assert.deepEqual(px(canvas, 3, 3), [0, 0, 0, 0], 'selected pixels are transparent')
  assert.deepEqual(px(canvas, 0, 0), [255, 0, 0, 255], 'unselected pixels remain')
})

test('clearSelectionPixels with no selection wipes the whole layer', () => {
  const canvas = canvasOf(4, 4, '#ff0000')
  clearSelectionPixels(canvas, null)
  assert.deepEqual(px(canvas, 2, 2), [0, 0, 0, 0])
})

test('histogram counts every opaque pixel once per channel', () => {
  const canvas = canvasFrom(4, 4, () => [10, 20, 30, 255])
  const { r, g, b } = histogram(canvas)
  assert.equal(r[10], 16)
  assert.equal(g[20], 16)
  assert.equal(b[30], 16)
  assert.equal(r[0], 0)
})

test('histogram skips near-transparent pixels so empty layers read as empty', () => {
  const canvas = canvasFrom(4, 4, (x) => [10, 20, 30, x < 2 ? 255 : 0])
  const { r } = histogram(canvas)
  assert.equal(r[10], 8, 'only the opaque half is counted')

  const blank = canvasOf(8, 8)
  assert.equal(histogram(blank).r.reduce((sum, n) => sum + n, 0), 0)
})
