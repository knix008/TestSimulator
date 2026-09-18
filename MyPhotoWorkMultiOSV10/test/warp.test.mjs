// Bending pixels: the four-corner transforms, the warp shapes, puppet pins and
// seam carving. Each is checked by where a known mark ends up, not by eye.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contentAwareScale, contentAwareScaleLayers, cornerTransform, homography, meshWarp, perspective,
  puppetWarp, skew, warpCanvas, warpPoint,
} from '../src/lib/warp.ts'
import { assertPixel, canvasFrom, canvasOf, meanDiff, px } from './helpers/pixels.mjs'

/** A grid whose corners are each a different colour, so moves are traceable. */
function marked(size = 32) {
  return canvasFrom(size, size, (x, y) => {
    if (x < 4 && y < 4) return [255, 0, 0, 255]
    if (x >= size - 4 && y < 4) return [0, 255, 0, 255]
    return [40, 40, 40, 255]
  })
}

test('the identity corners leave the image where it was', () => {
  const source = marked()
  const same = cornerTransform(source, [
    { x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 32 }, { x: 0, y: 32 },
  ])
  assert.ok(meanDiff(same, source) < 1, 'an identity transform must not move anything')
})

test('the homography is the one that takes the corners where they are asked', () => {
  const matrix = homography(10, 10, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }])
  assert.ok(matrix, 'a well-formed quad has a solution')
  // A doubling: the top-right source corner (10, 0) must land on (20, 0).
  const w = matrix[6] * 10 + matrix[7] * 0 + matrix[8]
  assert.ok(Math.abs((matrix[0] * 10 + matrix[2]) / w - 20) < 0.001)
})

test('a degenerate quad is refused rather than dividing by zero', () => {
  assert.equal(homography(10, 10, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]), null)
})

test('skew slides the top across and leaves the bottom where it was', () => {
  const source = marked()
  const slid = skew(source, 8, 0)
  assert.deepEqual(px(slid, 1, 1), [0, 0, 0, 0], 'the old top-left corner is now empty')
  assertPixel(slid, 9, 1, [255, 0, 0, 255], 40, 'the red corner moved to the right')
})

test('perspective narrows one edge', () => {
  const source = canvasOf(32, 32, '#3366cc')
  const leaned = perspective(source, 60)
  assert.deepEqual(px(leaned, 1, 1), [0, 0, 0, 0], 'the top corners are pulled in')
  assert.deepEqual(px(leaned, 1, 30), [51, 102, 204, 255], 'the bottom edge is untouched')
})

/* ---------------------------------------------------------------- warping */

test('the warp shapes are the identity when there is nothing to bend', () => {
  assert.deepEqual(warpPoint('none', 80, 0, 0, 0.25, 0.75), { x: 0.25, y: 0.75 })
  assert.deepEqual(warpPoint('arc', 0, 0, 0, 0.25, 0.75), { x: 0.25, y: 0.75 })
})

test('an arc lifts the middle of the image and holds the ends', () => {
  const middle = warpPoint('arc', 100, 0, 0, 0.5, 0)
  const edge = warpPoint('arc', 100, 0, 0, 0, 0)
  assert.ok(middle.y > edge.y, `the middle should bow away from the ends: ${middle.y} vs ${edge.y}`)
})

test('warpCanvas leaves the picture alone when nothing is set', () => {
  const source = marked()
  assert.equal(warpCanvas(source, 'none', 50, 0, 0), source)
  assert.equal(warpCanvas(source, 'arc', 0, 0, 0), source)
})

test('a warp moves pixels and leaves no gaps behind', () => {
  const source = canvasOf(32, 32, '#c0392b')
  const bent = warpCanvas(source, 'arch', 60, 0, 0)
  assert.ok(meanDiff(bent, source) > 1, 'the arch changed the image')
  // The mesh tiles the destination, so the middle cannot be left unpainted.
  assert.equal(px(bent, 16, 20)[3], 255, 'a hole was left in the middle')
})

test('a mesh at its own grid positions redraws the image unchanged', () => {
  const source = marked(16)
  const steps = 4
  const grid = []
  for (let row = 0; row <= steps; row += 1) {
    const line = []
    for (let column = 0; column <= steps; column += 1) {
      line.push({ x: (column / steps) * 16, y: (row / steps) * 16 })
    }
    grid.push(line)
  }
  const redrawn = meshWarp(source, grid, 16, 16)
  assert.ok(meanDiff(redrawn, source) < 2, 'an identity mesh must be a copy')
})

/* ----------------------------------------------------------- puppet warp */

test('pins that have not moved leave the image exactly as it was', () => {
  const source = marked()
  assert.equal(puppetWarp(source, []), source)
  assert.equal(puppetWarp(source, [{ from: { x: 4, y: 4 }, to: { x: 4, y: 4 } }]), source)
})

test('dragging a pin pulls the pixels near it and leaves the far ones', () => {
  const source = canvasFrom(32, 32, (x) => (x < 16 ? [200, 30, 30, 255] : [30, 30, 200, 255]))
  const warped = puppetWarp(source, [
    { from: { x: 4, y: 16 }, to: { x: 12, y: 16 } },
    { from: { x: 28, y: 16 }, to: { x: 28, y: 16 } },
  ])
  assert.ok(meanDiff(warped, source) > 0.5, 'the moved pin dragged something')
  assertPixel(warped, 29, 16, [30, 30, 200, 255], 30, 'the held pin kept its corner still')
})

/* ----------------------------------------------------- content-aware scale */

test('carving reaches the size asked for', () => {
  const source = canvasFrom(40, 20, (x, y) => (
    // A busy stripe down the middle, flat either side: the flat parts should go.
    x > 18 && x < 22 ? [255, 255, 255, 255] : [60 + ((x + y) % 3), 60, 60, 255]
  ))
  const narrow = contentAwareScale(source, 30, 20)
  assert.equal(narrow.width, 30)
  assert.equal(narrow.height, 20)

  const wide = contentAwareScale(source, 46, 20)
  assert.equal(wide.width, 46)
})

test('carving protects the busy part and eats the flat part', () => {
  const source = canvasFrom(40, 12, (x) => (x >= 18 && x <= 21 ? [255, 255, 255, 255] : [50, 50, 50, 255]))
  const narrow = contentAwareScale(source, 28, 12)

  let white = 0
  for (let x = 0; x < narrow.width; x += 1) {
    if (px(narrow, x, 6)[0] > 200) white += 1
  }
  assert.ok(white >= 3, `the white stripe was carved away: ${white} columns left of 4`)
})

test('every layer is carved with the same seams, so they stay lined up', () => {
  const guide = canvasFrom(24, 8, (x) => (x >= 10 && x <= 13 ? [255, 255, 255, 255] : [40, 40, 40, 255]))
  const twin = canvasFrom(24, 8, (x) => (x >= 10 && x <= 13 ? [255, 255, 255, 255] : [40, 40, 40, 255]))
  const [first, second] = contentAwareScaleLayers([guide, twin], guide, 18, 8)
  assert.equal(first.width, 18)
  assert.equal(second.width, 18)
  assert.equal(meanDiff(first, second), 0, 'two identical layers must carve identically')
})

test('a scale that changes nothing hands the layers back untouched', () => {
  const source = marked(16)
  const [same] = contentAwareScaleLayers([source], source, 16, 16)
  assert.equal(same, source)
})
