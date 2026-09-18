// The filters added to the gallery: the ones that move pixels (distort.ts) and
// the ones that look at a pixel's neighbours (detail.ts).
import test from 'node:test'
import assert from 'node:assert/strict'
import { pinch, radialBlur, ripple, spherize, twirl, wave } from '../src/lib/distort.ts'
import {
  boxBlur, crystallize, dustAndScratches, lensFlare, maximumFilter, medianFilter, minimumFilter,
  unsharpMask,
} from '../src/lib/detail.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertPixel, canvasFrom, canvasOf, meanDiff, px } from './helpers/pixels.mjs'

/** A checkerboard: something with edges for every filter to bite on. */
function board(size = 32, cell = 4) {
  return canvasFrom(size, size, (x, y) => (
    (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? [230, 230, 230, 255] : [25, 25, 25, 255]
  ))
}

function copyOf(canvas) {
  return canvasFrom(canvas.width, canvas.height, (x, y) => px(canvas, x, y))
}

/* ------------------------------------------------------------------ distort */

test('the distortions move pixels without punching holes in the image', () => {
  const cases = [
    ['twirl', (canvas) => twirl(canvas, 90, null)],
    ['ripple', (canvas) => ripple(canvas, 4, null)],
    ['wave', (canvas) => wave(canvas, 3, 8, null)],
    ['spherize', (canvas) => spherize(canvas, 60, null)],
    ['pinch', (canvas) => pinch(canvas, 60, null)],
  ]
  for (const [name, run] of cases) {
    const canvas = board()
    const before = copyOf(canvas)
    run(canvas)
    assert.ok(meanDiff(canvas, before) > 1, `${name} changed nothing`)
    // A forward mapping leaves gaps; a backward one cannot. Every pixel away
    // from the border must still be opaque.
    for (const [x, y] of [[16, 16], [10, 20], [22, 12]]) {
      assert.equal(px(canvas, x, y)[3], 255, `${name} left a hole at ${x},${y}`)
    }
  }
})

test('a twirl leaves the centre pixel where it was and bends the rest', () => {
  const canvas = board()
  const before = copyOf(canvas)
  twirl(canvas, 120, null)
  assertPixel(canvas, 16, 16, px(before, 16, 16), 24, 'the centre barely moves')
  assert.ok(meanDiff(canvas, before) > 2, 'the rest of the image did move')
})

test('spherize and pinch pull in opposite directions', () => {
  const out = board()
  const inward = board()
  spherize(out, 70, null)
  pinch(inward, 70, null)
  assert.ok(meanDiff(out, inward) > 1, 'the two produce different images')
})

test('radial blur smears the image both ways round', () => {
  for (const kind of ['spin', 'zoom']) {
    const canvas = board()
    const before = copyOf(canvas)
    radialBlur(canvas, 20, kind, null)
    assert.ok(meanDiff(canvas, before) > 1, `radial blur (${kind}) changed nothing`)
  }
})

test('a distortion stays inside the selection it is given', () => {
  const canvas = board()
  const before = copyOf(canvas)
  twirl(canvas, 120, rectSelection(0, 0, 16, 32))
  assert.ok(meanDiff(canvas, before) > 0.5, 'the selected half moved')
  for (let y = 4; y < 28; y += 6) {
    assertPixel(canvas, 24, y, px(before, 24, y), 1, 'the unselected half')
  }
})

/* ------------------------------------------------------------------- detail */

test('the median kills a speckle without softening the whole image', () => {
  const canvas = canvasOf(16, 16, '#303030')
  // One bright pixel in a flat field: exactly what a median is for.
  canvas.getContext('2d').fillStyle = '#ffffff'
  canvas.getContext('2d').fillRect(8, 8, 1, 1)

  medianFilter(canvas, 1, null)
  assertPixel(canvas, 8, 8, [48, 48, 48, 255], 3, 'the speckle is gone')
})

test('dust and scratches leaves detail below the threshold alone', () => {
  const gentle = canvasFrom(16, 16, (x) => [40 + (x % 2) * 10, 40, 40, 255])
  const before = copyOf(gentle)
  // A threshold of 40 is far above the 10-level ripple in this image.
  dustAndScratches(gentle, 1, 40, null)
  assert.ok(meanDiff(gentle, before) < 1, 'small variation survives a high threshold')

  const speckled = canvasOf(16, 16, '#303030')
  speckled.getContext('2d').fillStyle = '#ffffff'
  speckled.getContext('2d').fillRect(8, 8, 1, 1)
  dustAndScratches(speckled, 1, 40, null)
  assertPixel(speckled, 8, 8, [48, 48, 48, 255], 4, 'but the speckle is well over it')
})

test('minimum spreads the dark, maximum spreads the light', () => {
  const dark = canvasOf(16, 16, '#ffffff')
  dark.getContext('2d').fillStyle = '#000000'
  dark.getContext('2d').fillRect(8, 8, 1, 1)
  minimumFilter(dark, 1, null)
  assertPixel(dark, 7, 8, [0, 0, 0, 255], 2, 'the black pixel grew into its neighbour')

  const light = canvasOf(16, 16, '#000000')
  light.getContext('2d').fillStyle = '#ffffff'
  light.getContext('2d').fillRect(8, 8, 1, 1)
  maximumFilter(light, 1, null)
  assertPixel(light, 7, 8, [255, 255, 255, 255], 2, 'and the white pixel likewise')
})

test('a box blur flattens an edge', () => {
  const canvas = canvasFrom(16, 16, (x) => (x < 8 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
  boxBlur(canvas, 2, null)
  const straddling = px(canvas, 8, 8)[0]
  assert.ok(straddling > 40 && straddling < 215, `the edge became a ramp: ${straddling}`)
})

test('an unsharp mask only fires above its threshold', () => {
  const edge = canvasFrom(16, 16, (x) => (x < 8 ? [60, 60, 60, 255] : [200, 200, 200, 255]))
  const before = copyOf(edge)
  unsharpMask(edge, 2, 120, 4, null)
  assert.ok(meanDiff(edge, before) > 1, 'a real edge is sharpened')

  const flat = canvasFrom(16, 16, (x) => [120 + (x % 2), 120, 120, 255])
  const flatBefore = copyOf(flat)
  // A threshold of 60 is far above the one-level wobble in this image.
  unsharpMask(flat, 2, 120, 60, null)
  assert.ok(meanDiff(flat, flatBefore) < 0.5, 'noise under the threshold is left alone')
})

test('crystallize turns the image into flat cells', () => {
  const canvas = board(32, 2)
  const before = copyOf(canvas)
  crystallize(canvas, 8, null)
  assert.ok(meanDiff(canvas, before) > 1, 'the fine checks were averaged away')
  assert.equal(px(canvas, 16, 16)[3], 255, 'the result is still opaque')
})

test('a lens flare adds light and never takes any away', () => {
  const canvas = canvasOf(32, 32, '#202020')
  const before = copyOf(canvas)
  lensFlare(canvas, 10, 10, 100)
  assert.ok(meanDiff(canvas, before) > 1, 'the flare drew something')
  for (const [x, y] of [[10, 10], [16, 16], [30, 30]]) {
    assert.ok(px(canvas, x, y)[0] >= px(before, x, y)[0], `the flare darkened ${x},${y}`)
  }
})
