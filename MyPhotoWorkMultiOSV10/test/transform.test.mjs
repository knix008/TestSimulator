// Free transform: the box maths behind the drag handles and the resampling
// that commits it, plus the flip commands.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTransform, containsPoint, dragTransform, drawTransformOverlay, flipCanvas, hitTestTransform,
  identityTransform, isIdentityTransform, transformCenter, transformFromBox, transformHandles,
} from '../src/lib/transform.ts'
import { assertNear, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

const box = () => transformFromBox(10, 20, 100, 60)

test('a fresh transform is the identity for its layer', () => {
  const t = identityTransform(64, 48)
  assert.deepEqual(t, { x: 0, y: 0, width: 64, height: 48, angle: 0, flipX: false, flipY: false })
  assert.equal(isIdentityTransform(t, 64, 48), true)
  assert.equal(isIdentityTransform({ ...t, angle: 5 }, 64, 48), false)
  assert.equal(isIdentityTransform({ ...t, flipX: true }, 64, 48), false)
})

test('transformCenter is the middle of the box', () => {
  assert.deepEqual(transformCenter(box()), { x: 60, y: 50 })
})

test('an unrotated box puts its handles on the corners and edge midpoints', () => {
  const handles = transformHandles(box())
  assert.deepEqual(handles.nw, { x: 10, y: 20 })
  assert.deepEqual(handles.se, { x: 110, y: 80 })
  assert.deepEqual(handles.n, { x: 60, y: 20 })
  assert.deepEqual(handles.w, { x: 10, y: 50 })
  assert.deepEqual(handles.move, { x: 60, y: 50 })
  assert.ok(handles.rotate.y < handles.n.y, 'the rotate grip floats above the top edge')
})

test('rotating the box rotates every handle about the centre', () => {
  const handles = transformHandles({ ...box(), angle: 90 })
  // The top-left corner swings to where the bottom-left was.
  assertNear(handles.nw.x, 90, 0.001, 'nw x')
  assertNear(handles.nw.y, 0, 0.001, 'nw y')
  assert.deepEqual(handles.move, { x: 60, y: 50 }, 'the centre is the pivot')
})

test('containsPoint works in the box own frame, so rotation is respected', () => {
  assert.equal(containsPoint(box(), { x: 60, y: 50 }), true)
  assert.equal(containsPoint(box(), { x: 5, y: 50 }), false)

  const turned = { ...box(), angle: 90 }
  assert.equal(containsPoint(turned, { x: 60, y: 50 }), true, 'the centre is always inside')
  assert.equal(containsPoint(turned, { x: 60, y: 5 }), true, 'the box is now tall, not wide')
  assert.equal(containsPoint(turned, { x: 5, y: 50 }), false)
})

test('hitTestTransform prefers grips, then the body, then nothing', () => {
  assert.equal(hitTestTransform(box(), { x: 10, y: 20 }), 'nw')
  assert.equal(hitTestTransform(box(), { x: 110, y: 80 }), 'se')
  assert.equal(hitTestTransform(box(), { x: 60, y: 20 }), 'n')
  assert.equal(hitTestTransform(box(), { x: 60, y: 50 }), 'move')
  assert.equal(hitTestTransform(box(), { x: 300, y: 300 }), null)
  assert.equal(hitTestTransform(box(), transformHandles(box()).rotate), 'rotate')
})

test('dragging the body moves the box without resizing it', () => {
  const moved = dragTransform(box(), 'move', { x: 60, y: 50 }, { x: 70, y: 45 })
  assert.deepEqual(moved, { x: 20, y: 15, width: 100, height: 60, angle: 0, flipX: false, flipY: false })
})

test('dragging a side grip resizes only that edge', () => {
  const east = dragTransform(box(), 'e', { x: 110, y: 50 }, { x: 130, y: 50 })
  assert.equal(east.x, 10, 'the opposite edge is pinned')
  assert.equal(east.width, 120)
  assert.equal(east.height, 60, 'the other axis is untouched')

  const west = dragTransform(box(), 'w', { x: 10, y: 50 }, { x: 0, y: 50 })
  assert.equal(west.x, 0)
  assert.equal(west.width, 110)
})

test('dragging a corner resizes both axes', () => {
  const se = dragTransform(box(), 'se', { x: 110, y: 80 }, { x: 130, y: 100 })
  assert.equal(se.width, 120)
  assert.equal(se.height, 80)
  assert.equal(se.x, 10)
  assert.equal(se.y, 20)
})

test('shift on a corner keeps the aspect ratio', () => {
  const free = dragTransform(box(), 'se', { x: 110, y: 80 }, { x: 210, y: 85 })
  assert.ok(Math.abs(free.width / free.height - 100 / 60) > 0.2, 'without shift the ratio drifts')

  const locked = dragTransform(box(), 'se', { x: 110, y: 80 }, { x: 210, y: 85 }, { shift: true })
  assertNear(locked.width / locked.height, 100 / 60, 0.01, 'with shift it is preserved')
})

test('dragging a grip past the far edge mirrors instead of inverting the box', () => {
  const flipped = dragTransform(box(), 'e', { x: 110, y: 50 }, { x: 0, y: 50 })
  assert.ok(flipped.width > 0, 'the box keeps a positive width')
  assert.equal(flipped.flipX, true)
  assert.equal(flipped.x, 0)

  // Crossing back over the pinned edge undoes the mirror; merely widening does not.
  assert.equal(dragTransform(flipped, 'e', { x: 10, y: 50 }, { x: 200, y: 50 }).flipX, true)
  assert.equal(dragTransform(flipped, 'e', { x: 10, y: 50 }, { x: -50, y: 50 }).flipX, false)
})

test('alt-style resizing grows around the centre', () => {
  const centred = dragTransform(box(), 'e', { x: 110, y: 50 }, { x: 130, y: 50 }, { fromCenter: true })
  assert.equal(centred.width, 120)
  assert.equal(centred.x, 0, 'the box grew by 10 on each side')
  assert.deepEqual(transformCenter(centred), transformCenter(box()))
})

test('the rotate grip turns the box, and shift snaps to 15 degrees', () => {
  const centre = transformCenter(box())
  const turned = dragTransform(box(), 'rotate', { x: centre.x + 50, y: centre.y }, { x: centre.x, y: centre.y + 50 })
  assertNear(turned.angle, 90, 0.001, 'a quarter turn')

  const snapped = dragTransform(box(), 'rotate', { x: centre.x + 50, y: centre.y }, { x: centre.x + 50, y: centre.y + 9 }, { shift: true })
  assert.equal(snapped.angle % 15, 0, `snapped angle ${snapped.angle}`)
})

test('resize grips act along the box own axes when it is rotated', () => {
  const turned = { ...box(), angle: 90 }
  // In screen space the box is now tall, so its "east" grip moves along y.
  const resized = dragTransform(turned, 'e', { x: 60, y: 100 }, { x: 60, y: 120 })
  assert.equal(resized.height, 60, 'the other axis is untouched')
  assertNear(resized.width, 120, 0.001, 'the box grew along its own width')
})

test('applyTransform places the layer at the box, scaled', () => {
  const source = canvasOf(10, 10, '#ff0000')
  const out = applyTransform(source, transformFromBox(20, 10, 40, 20), 80, 60)
  assert.equal(out.width, 80)
  assert.equal(out.height, 60)
  assert.deepEqual(px(out, 40, 20), [255, 0, 0, 255], 'inside the destination box')
  assert.equal(px(out, 5, 5)[3], 0, 'outside it')
  assert.equal(px(out, 70, 50)[3], 0)
})

test('applyTransform mirrors when the flip flags are set', () => {
  const source = canvasFrom(20, 10, (x) => (x < 10 ? [255, 0, 0] : [0, 0, 255]))
  const plain = applyTransform(source, transformFromBox(0, 0, 20, 10), 20, 10)
  assert.deepEqual(px(plain, 2, 5), [255, 0, 0, 255], 'red starts on the left')

  const mirrored = applyTransform(source, { ...transformFromBox(0, 0, 20, 10), flipX: true }, 20, 10)
  assert.deepEqual(px(mirrored, 2, 5), [0, 0, 255, 255], 'and ends on the right')
  assert.deepEqual(px(mirrored, 17, 5), [255, 0, 0, 255])
})

test('applyTransform rotates about the box centre', () => {
  const source = canvasFrom(20, 20, (x, y) => (y < 10 ? [255, 0, 0] : [0, 0, 255]))
  const turned = applyTransform(source, { ...transformFromBox(0, 0, 20, 20), angle: 90 }, 20, 20)
  // The red top half swings to the right-hand side.
  assert.deepEqual(px(turned, 15, 10), [255, 0, 0, 255])
  assert.deepEqual(px(turned, 4, 10), [0, 0, 255, 255])
})

test('applyTransform on a zero-size box yields an empty canvas rather than throwing', () => {
  const out = applyTransform(canvasOf(10, 10, '#ff0000'), transformFromBox(0, 0, 0, 10), 20, 20)
  assert.equal(out.width, 20)
  assert.equal(px(out, 5, 5)[3], 0)
})

test('flipCanvas mirrors horizontally and vertically', () => {
  const source = canvasFrom(8, 8, (x, _y) => (x < 4 ? [255, 0, 0] : [0, 0, 255]))
  const h = flipCanvas(source, 'x')
  assert.deepEqual(px(h, 1, 4), [0, 0, 255, 255])
  assert.deepEqual(px(h, 6, 4), [255, 0, 0, 255])

  const vertical = canvasFrom(8, 8, (x, y) => (y < 4 ? [255, 0, 0] : [0, 0, 255]))
  const v = flipCanvas(vertical, 'y')
  assert.deepEqual(px(v, 4, 1), [0, 0, 255, 255])
  assert.deepEqual(px(v, 4, 6), [255, 0, 0, 255])
})

test('flipping twice restores the original', () => {
  const source = canvasFrom(8, 8, (x, y) => [x * 30, y * 30, 0])
  const back = flipCanvas(flipCanvas(source, 'x'), 'x')
  assert.deepEqual(px(back, 3, 5), px(source, 3, 5))
})

test('drawTransformOverlay paints the box and its grips', () => {
  const canvas = canvasOf(160, 120)
  const ctx = canvas.getContext('2d')
  drawTransformOverlay(ctx, transformFromBox(20, 30, 100, 60), 1)
  const data = ctx.getImageData(0, 0, 160, 120).data
  let painted = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) painted += 1
  }
  assert.ok(painted > 0, 'the overlay drew something')
})
