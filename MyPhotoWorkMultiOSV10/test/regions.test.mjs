// Magnetic lasso edge snapping, patch / content-aware move, perspective crop,
// and the slice, frame and ruler regions.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clipToFrame, contentMove, createFrame, createSlice, cropToRect, drawRegionOverlay, edgeStrength,
  measureInfo, patchSelection, perspectiveCrop, perspectiveSize, rectAt, snapToEdge,
} from '../src/lib/regions.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertNear, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

/** Left half dark, right half bright: one vertical edge down the middle. */
function edgeImage(width = 40, height = 40, at = 20) {
  return canvasFrom(width, height, (x) => (x < at ? [20, 20, 20] : [230, 230, 230]))
}

test('edgeStrength peaks on a boundary and is flat elsewhere', () => {
  const canvas = edgeImage()
  const data = canvas.getContext('2d').getImageData(0, 0, 40, 40).data
  assert.ok(edgeStrength(data, 40, 40, 19, 20) > 100, 'on the edge')
  assert.ok(edgeStrength(data, 40, 40, 5, 20) < 1, 'in the flat dark region')
  assert.ok(edgeStrength(data, 40, 40, 35, 20) < 1, 'in the flat bright region')
})

test('edgeStrength returns zero on the border, where the kernel does not fit', () => {
  const data = edgeImage().getContext('2d').getImageData(0, 0, 40, 40).data
  assert.equal(edgeStrength(data, 40, 40, 0, 20), 0)
  assert.equal(edgeStrength(data, 40, 40, 39, 20), 0)
  assert.equal(edgeStrength(data, 40, 40, 20, 0), 0)
})

test('snapToEdge pulls a nearby point onto the boundary', () => {
  const canvas = edgeImage()
  const snapped = snapToEdge(canvas, { x: 22, y: 20 }, 8)
  assert.ok(Math.abs(snapped.x - 19.5) <= 1.5, `snapped to x=${snapped.x}, expected the edge near 20`)
  assert.equal(snapped.y, 20, 'it stays on the same scan line')
})

test('snapToEdge leaves a point alone when no edge is within reach', () => {
  const canvas = edgeImage()
  const snapped = snapToEdge(canvas, { x: 5, y: 20 }, 3)
  assert.deepEqual(snapped, { x: 5, y: 20 })
})

test('snapToEdge clamps to the canvas instead of returning an outside point', () => {
  const canvas = edgeImage()
  const snapped = snapToEdge(canvas, { x: -10, y: -10 }, 4)
  assert.ok(snapped.x >= 0 && snapped.y >= 0 && snapped.x < 40 && snapped.y < 40, `got ${JSON.stringify(snapped)}`)
})

test('patchSelection grafts the offset region in and matches its colour back', () => {
  // A green field with a red blotch; patching from the clean area to the right.
  const canvas = canvasFrom(48, 48, (x, y) =>
    (x >= 8 && x < 20 && y >= 8 && y < 20 ? [220, 40, 40] : [40, 170, 80]))
  patchSelection(canvas, rectSelection(8, 8, 12, 12), 20, 0)
  const patched = px(canvas, 12, 12)
  assert.ok(patched[1] > patched[0], `the blotch reads as green now, got [${patched}]`)
  assert.deepEqual(px(canvas, 40, 40), [40, 170, 80, 255], 'the source area is left intact')
})

test('patchSelection does nothing without a selection or without a drag', () => {
  const canvas = canvasOf(16, 16, '#336699')
  patchSelection(canvas, null, 5, 5)
  assert.deepEqual(px(canvas, 8, 8), [51, 102, 153, 255])
  patchSelection(canvas, rectSelection(0, 0, 8, 8), 0, 0)
  assert.deepEqual(px(canvas, 4, 4), [51, 102, 153, 255])
})

test('contentMove lifts the selection to a new spot and heals the hole', () => {
  const canvas = canvasFrom(48, 48, (x, y) =>
    (x >= 8 && x < 16 && y >= 8 && y < 16 ? [220, 40, 40] : [40, 170, 80]))
  contentMove(canvas, rectSelection(8, 8, 8, 8), 20, 20)
  assert.deepEqual(px(canvas, 32, 32), [220, 40, 40, 255], 'the object arrived at the offset')
  const healed = px(canvas, 11, 11)
  assert.ok(healed[1] > healed[0], `the vacated hole was filled from around it, got [${healed}]`)
})

test('contentMove keeps pixels that would land outside the canvas from wrapping', () => {
  const canvas = canvasFrom(24, 24, (x, y) => (x < 8 && y < 8 ? [220, 40, 40] : [40, 170, 80]))
  contentMove(canvas, rectSelection(0, 0, 8, 8), -20, 0)
  assert.deepEqual(px(canvas, 20, 4), [40, 170, 80, 255], 'nothing appeared on the far side')
})

test('perspectiveCrop straightens a quad into an upright image', () => {
  // A red band across the top of a blue field, sampled through a skewed quad.
  const source = canvasFrom(64, 64, (x, y) => (y < 32 ? [220, 40, 40] : [40, 60, 220]))
  const corners = [{ x: 8, y: 4 }, { x: 56, y: 12 }, { x: 56, y: 60 }, { x: 8, y: 52 }]
  const out = perspectiveCrop(source, corners, 48, 48)
  assert.equal(out.width, 48)
  assert.equal(out.height, 48)
  assert.deepEqual(px(out, 24, 2).slice(0, 3), [220, 40, 40], 'the top row came from the red band')
  assert.deepEqual(px(out, 24, 45).slice(0, 3), [40, 60, 220], 'the bottom row from the blue field')
})

test('perspectiveCrop rejects a quad that is not four corners', () => {
  const out = perspectiveCrop(canvasOf(16, 16, '#ff0000'), [{ x: 0, y: 0 }], 8, 8)
  assert.equal(out.width, 8)
  assert.equal(px(out, 4, 4)[3], 0)
})

test('perspectiveSize averages the opposite edges of the quad', () => {
  const size = perspectiveSize([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }])
  assert.deepEqual(size, { width: 100, height: 50 })

  const skewed = perspectiveSize([{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 120, y: 60 }, { x: 0, y: 60 }])
  assertNear(skewed.width, 100, 1, 'width is the mean of 80 and 120')

  assert.deepEqual(perspectiveSize([]), { width: 1, height: 1 })
})

test('createSlice and createFrame normalise a drag made in any direction', () => {
  const slice = createSlice('Slice 1', 40, 30, -20, -10)
  assert.deepEqual({ x: slice.x, y: slice.y, width: slice.width, height: slice.height },
    { x: 20, y: 20, width: 20, height: 10 })
  assert.ok(slice.id.startsWith('slice-'))
  assert.equal(slice.name, 'Slice 1')

  const frame = createFrame('Frame 1', 5, 5, 10, 10)
  assert.ok(frame.id.startsWith('frame-'))
  assert.equal(frame.width, 10)
})

test('rectAt picks the topmost region under the cursor', () => {
  const lower = createSlice('a', 0, 0, 50, 50)
  const upper = createSlice('b', 10, 10, 20, 20)
  assert.equal(rectAt([lower, upper], { x: 15, y: 15 }), upper, 'the later region wins')
  assert.equal(rectAt([lower, upper], { x: 40, y: 40 }), lower)
  assert.equal(rectAt([lower, upper], { x: 80, y: 80 }), null)
  assert.equal(rectAt([lower], { x: 50, y: 10 }), null, 'the right edge is exclusive')
})

test('cropToRect cuts the region out at its own size', () => {
  const source = canvasFrom(32, 32, (x, y) => (x >= 8 && x < 16 ? [255, 0, 0] : [0, 0, 255]))
  const out = cropToRect(source, { x: 8, y: 4, width: 8, height: 8 })
  assert.equal(out.width, 8)
  assert.equal(out.height, 8)
  assert.deepEqual(px(out, 4, 4), [255, 0, 0, 255])
})

test('cropToRect never produces a zero-sized canvas', () => {
  const out = cropToRect(canvasOf(16, 16, '#ff0000'), { x: 0, y: 0, width: 0, height: 0 })
  assert.equal(out.width, 1)
  assert.equal(out.height, 1)
})

test('clipToFrame keeps the layer only inside the frame rectangle', () => {
  const source = canvasOf(32, 32, '#ff0000')
  const out = clipToFrame(source, createFrame('f', 8, 8, 12, 12))
  assert.deepEqual(px(out, 12, 12), [255, 0, 0, 255], 'inside the frame')
  assert.equal(px(out, 2, 2)[3], 0, 'outside it')
  assert.equal(px(out, 25, 25)[3], 0)
  assert.equal(out.width, 32, 'the canvas keeps the document size')
})

test('measureInfo reports the ruler distance and a maths-style angle', () => {
  const diagonal = measureInfo({ x1: 0, y1: 0, x2: 3, y2: 4 })
  assert.equal(diagonal.dx, 3)
  assert.equal(diagonal.dy, 4)
  assert.equal(diagonal.distance, 5, 'a 3-4-5 triangle')
  assertNear(diagonal.angle, -53.13, 0.01, 'angle')

  const flat = measureInfo({ x1: 10, y1: 10, x2: 20, y2: 10 })
  assert.equal(flat.distance, 10)
  assert.equal(flat.angle, 0, 'a horizontal measure reads zero degrees')

  // Screen y grows downward, so dragging up is a positive angle.
  assert.equal(measureInfo({ x1: 0, y1: 10, x2: 0, y2: 0 }).angle, 90)
  assert.equal(measureInfo({ x1: 0, y1: 0, x2: 0, y2: 10 }).angle, -90)
})

test('measureInfo handles a zero-length measure', () => {
  const none = measureInfo({ x1: 5, y1: 5, x2: 5, y2: 5 })
  assert.equal(none.dx, 0)
  assert.equal(none.dy, 0)
  assert.equal(none.distance, 0)
  assertNear(none.angle, 0, 0.001, 'angle')
})

test('drawRegionOverlay paints slices, frames and the ruler without throwing', () => {
  const canvas = canvasOf(64, 64)
  const ctx = canvas.getContext('2d')
  drawRegionOverlay(ctx, [createSlice('s', 4, 4, 20, 20)], [createFrame('f', 30, 30, 20, 20)],
    { x1: 2, y1: 60, x2: 60, y2: 50 }, 1)
  const data = ctx.getImageData(0, 0, 64, 64).data
  let painted = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) painted += 1
  }
  assert.ok(painted > 0)
  // Nothing to draw is also fine.
  drawRegionOverlay(ctx, [], [], null, 1)
})
