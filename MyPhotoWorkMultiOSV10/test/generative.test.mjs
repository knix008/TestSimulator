// The on-device "generative" tools: content-aware fill, generative expand and
// upscale, Harmonize, Select Subject, Find Distractions, Liquify, skin smooth.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contentAwareFill, findDistractions, generativeExpand, generativeUpscale, harmonize, liquify,
  selectSubject, skinSmooth,
} from '../src/lib/ai.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertNear, canvasFrom, canvasOf, countMask, meanDiff, px } from './helpers/pixels.mjs'

test('content-aware fill replaces the selection with its surroundings', () => {
  // A green field with a red blotch: filling the blotch should make it green again.
  const canvas = canvasFrom(32, 32, (x, y) =>
    (x >= 12 && x < 20 && y >= 12 && y < 20 ? [255, 0, 0] : [30, 160, 60]))
  contentAwareFill(canvas, rectSelection(12, 12, 8, 8))
  const filled = px(canvas, 13, 13)
  assert.ok(filled[1] > filled[0], `the blotch should read as green now, got [${filled}]`)
  assert.deepEqual(px(canvas, 2, 2), [30, 160, 60, 255], 'the surroundings are untouched')
})

test('content-aware fill with no selection does nothing', () => {
  const canvas = canvasOf(16, 16, '#ff0000')
  contentAwareFill(canvas, null)
  assert.deepEqual(px(canvas, 8, 8), [255, 0, 0, 255])
})

test('content-aware fill leaves pixels alone when the whole canvas is selected', () => {
  // With no unselected neighbours to sample there is nothing to average, so the
  // fill must bail out rather than write zeroes.
  const canvas = canvasOf(16, 16, '#3366cc')
  contentAwareFill(canvas, rectSelection(0, 0, 16, 16))
  assert.deepEqual(px(canvas, 8, 8), [51, 102, 204, 255])
})

test('generative expand grows the canvas and keeps the original inside it', () => {
  const canvas = canvasOf(16, 16, '#3366cc')
  const expanded = generativeExpand(canvas, 32, 32, 8, 8)
  assert.equal(expanded.width, 32)
  assert.equal(expanded.height, 32)
  assert.deepEqual(px(expanded, 16, 16), [51, 102, 204, 255], 'the original is redrawn on top, unblurred')
})

test('generative expand fills the new margin instead of leaving it transparent', () => {
  const canvas = canvasOf(16, 16, '#3366cc')
  const expanded = generativeExpand(canvas, 32, 32, 8, 8)
  for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30], [16, 1]]) {
    assert.ok(px(expanded, x, y)[3] > 200, `margin pixel (${x}, ${y}) is still transparent`)
  }
})

test('generative upscale doubles the size by default and keeps the layout', () => {
  const canvas = canvasFrom(16, 16, (x) => (x < 8 ? [255, 0, 0] : [0, 0, 255]))
  const bigger = generativeUpscale(canvas)
  assert.equal(bigger.width, 32)
  assert.equal(bigger.height, 32)
  assert.ok(px(bigger, 4, 16)[0] > 180, 'the left half is still red')
  assert.ok(px(bigger, 28, 16)[2] > 180, 'the right half is still blue')
})

test('generative upscale honours an explicit scale factor', () => {
  const canvas = canvasOf(10, 20, '#ffffff')
  const bigger = generativeUpscale(canvas, 3)
  assert.equal(bigger.width, 30)
  assert.equal(bigger.height, 60)
})

test('harmonize shifts the selected region toward the surrounding average', () => {
  // A dark patch on a bright field: harmonising should lift the patch.
  const canvas = canvasFrom(32, 32, (x, y) =>
    (x >= 8 && x < 16 && y >= 8 && y < 16 ? [40, 40, 40] : [200, 200, 200]))
  harmonize(canvas, rectSelection(8, 8, 8, 8))
  const patch = px(canvas, 10, 10)
  assert.ok(patch[0] > 40, `the patch should be lifted toward the surroundings, got ${patch[0]}`)
  assert.deepEqual(px(canvas, 2, 2), [200, 200, 200, 255], 'the surroundings do not move')
})

test('harmonize is a no-op when there is nothing to compare against', () => {
  const canvas = canvasOf(16, 16, '#3366cc')
  harmonize(canvas, null)
  assert.deepEqual(px(canvas, 8, 8), [51, 102, 204, 255], 'no selection means no source region')

  harmonize(canvas, rectSelection(0, 0, 16, 16))
  assert.deepEqual(px(canvas, 8, 8), [51, 102, 204, 255], 'selecting everything leaves no target region')
})

test('select subject finds the central object and returns a full-canvas mask', () => {
  const canvas = canvasFrom(40, 40, (x, y) =>
    (Math.hypot(x - 20, y - 20) < 10 ? [240, 240, 240] : [8, 8, 8]))
  const selection = selectSubject(canvas)
  assert.equal(selection.kind, 'mask')
  assert.equal(selection.width, 40)
  assert.equal(selection.mask.length, 40 * 40)
  assert.equal(selection.mask[20 * 40 + 20], 255, 'the centre of the subject is selected')
  assert.ok(countMask(selection.mask) > 0)
})

test('select subject ignores fully transparent pixels', () => {
  const selection = selectSubject(canvasOf(20, 20))
  assert.equal(countMask(selection.mask), 0, 'an empty layer has no subject')
})

test('find distractions flags isolated outliers, not flat regions', () => {
  const canvas = canvasFrom(32, 32, (x, y) => (x === 16 && y === 16 ? [255, 255, 255] : [20, 20, 20]))
  const selection = findDistractions(canvas)
  assert.equal(selection.mask[16 * 32 + 16], 255, 'the bright speck is flagged')
  assert.equal(selection.mask[4 * 32 + 4], 0, 'the flat background is not')
})

test('find distractions finds nothing in an even image', () => {
  assert.equal(countMask(findDistractions(canvasOf(24, 24, '#557799')).mask), 0)
})

test('liquify pushes pixels along the drag and leaves distant ones alone', () => {
  const canvas = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  const before = canvasFrom(40, 40, (x) => (x < 20 ? [255, 0, 0] : [0, 0, 255]))
  liquify(canvas, { x: 18, y: 20 }, { x: 26, y: 20 }, 16)
  assert.ok(meanDiff(canvas, before) > 0, 'the warp changed pixels')
  assert.deepEqual(px(canvas, 26, 20), [255, 0, 0, 255], 'red was pushed across the seam')
  assert.deepEqual(px(canvas, 2, 2), [255, 0, 0, 255], 'far from the brush nothing moved')
  assert.deepEqual(px(canvas, 38, 38), [0, 0, 255, 255])
})

test('liquify preserves the canvas size and never leaves holes', () => {
  const canvas = canvasOf(24, 24, '#3366cc')
  liquify(canvas, { x: 6, y: 12 }, { x: 18, y: 12 }, 12)
  assert.equal(canvas.width, 24)
  for (let x = 0; x < 24; x += 1) {
    assert.equal(px(canvas, x, 12)[3], 255, `hole at x=${x}`)
  }
})

test('skin smooth blurs the layer', () => {
  const canvas = canvasFrom(24, 24, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]))
  skinSmooth(canvas, 3)
  // A checkerboard blurred hard converges toward mid-grey.
  assertNear(px(canvas, 12, 12)[0], 128, 40, 'the checkerboard was smoothed')
})
