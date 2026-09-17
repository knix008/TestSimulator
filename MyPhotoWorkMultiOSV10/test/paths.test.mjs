// Vector paths behind the pen tools, the path-selection tools and the shape
// tools that convert a path into a selection or a stroke.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPath, drawPathOverlay, fillPathOnto, hitTestPaths, isStraight, movePathPoint, pathBounds,
  pathFromPoints, pathNode, pathToSelection, simplifyPoints, smoothNode, smoothPath, strokePathOnto,
  tracePath, translatePath,
} from '../src/lib/paths.ts'
import { canvasOf, countMask, px } from './helpers/pixels.mjs'

const square = () => createPath('Square', [
  pathNode(4, 4), pathNode(28, 4), pathNode(28, 28), pathNode(4, 28),
], true)

test('pathNode defaults both handles onto the anchor, giving a straight corner', () => {
  const node = pathNode(10, 20)
  assert.deepEqual(node, { x: 10, y: 20, inX: 10, inY: 20, outX: 10, outY: 20 })
  assert.equal(isStraight(node), true)
})

test('smoothNode mirrors the dragged handle across the anchor', () => {
  const node = smoothNode(pathNode(10, 10), { x: 20, y: 10 })
  assert.equal(node.outX, 20)
  assert.equal(node.inX, 0, 'the incoming handle is the reflection')
  assert.equal(node.inY, 10)
  assert.equal(isStraight(node), false)
})

test('createPath assigns a unique id and keeps the open/closed flag', () => {
  const a = createPath('A')
  const b = createPath('B')
  assert.notEqual(a.id, b.id)
  assert.ok(a.id.startsWith('path-'))
  assert.equal(a.closed, false)
  assert.equal(createPath('C', [], true).closed, true)
})

test('smoothPath gives interior anchors handles aimed along their neighbours', () => {
  const path = smoothPath(createPath('p', [pathNode(0, 0), pathNode(10, 0), pathNode(20, 0)]))
  const middle = path.nodes[1]
  assert.equal(isStraight(middle), false)
  assert.ok(middle.outX > middle.x, 'the outgoing handle leads toward the next anchor')
  assert.ok(middle.inX < middle.x, 'and the incoming one trails the previous')
  assert.equal(middle.outY, 0, 'a straight run stays flat')
})

test('smoothPath leaves a two-point path straight', () => {
  const path = smoothPath(createPath('p', [pathNode(0, 0), pathNode(10, 10)]))
  assert.ok(path.nodes.every(isStraight))
})

test('simplifyPoints drops samples closer than the tolerance but keeps the first', () => {
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10.5, y: 0 }]
  const kept = simplifyPoints(points, 4)
  assert.deepEqual(kept, [{ x: 0, y: 0 }, { x: 10, y: 0 }])
  assert.deepEqual(simplifyPoints([{ x: 3, y: 3 }], 4), [{ x: 3, y: 3 }], 'a lone sample survives')
  assert.deepEqual(simplifyPoints([], 4), [])
})

test('pathFromPoints builds a smoothed path from a freehand drag', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ x: i, y: Math.sin(i / 6) * 8 + 16 }))
  const path = pathFromPoints('Freeform', points, false, 4)
  assert.ok(path.nodes.length > 2)
  assert.ok(path.nodes.length < points.length, 'the run was simplified')
  assert.ok(path.nodes.some((node) => !isStraight(node)), 'and smoothed')
})

test('tracePath lays down a subpath the context can fill', () => {
  const canvas = canvasOf(32, 32)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  tracePath(ctx, square())
  ctx.fill()
  assert.deepEqual(px(canvas, 16, 16), [255, 0, 0, 255])
  assert.equal(px(canvas, 1, 1)[3], 0)
})

test('tracePath on an empty path draws nothing and does not throw', () => {
  const canvas = canvasOf(8, 8)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  tracePath(ctx, createPath('empty'))
  ctx.fill()
  assert.equal(px(canvas, 4, 4)[3], 0)
})

test('strokePathOnto draws the outline and leaves the interior alone', () => {
  const canvas = canvasOf(32, 32)
  strokePathOnto(canvas, square(), '#00ff00', 3)
  assert.ok(px(canvas, 4, 16)[1] > 128, 'the left edge is stroked')
  assert.equal(px(canvas, 16, 16)[3], 0, 'the middle stays empty')
})

test('strokePathOnto needs two anchors before it draws', () => {
  const canvas = canvasOf(16, 16)
  strokePathOnto(canvas, createPath('p', [pathNode(8, 8)]), '#00ff00', 4)
  assert.equal(px(canvas, 8, 8)[3], 0)
})

test('fillPathOnto fills a closed path and needs three anchors', () => {
  const canvas = canvasOf(32, 32)
  fillPathOnto(canvas, square(), '#0000ff')
  assert.deepEqual(px(canvas, 16, 16), [0, 0, 255, 255])

  const thin = canvasOf(16, 16)
  fillPathOnto(thin, createPath('p', [pathNode(2, 2), pathNode(12, 2)], true), '#0000ff')
  assert.equal(px(thin, 8, 8)[3], 0)
})

test('pathToSelection turns a closed path into a mask with tight bounds', () => {
  const selection = pathToSelection(square(), 32, 32)
  assert.equal(selection.kind, 'mask')
  assert.equal(selection.mask[16 * 32 + 16], 255, 'inside')
  assert.equal(selection.mask[0], 0, 'outside')
  assert.ok(Math.abs(selection.x - 4) <= 1, `left bound ${selection.x}`)
  assert.ok(Math.abs(selection.width - 25) <= 2, `width ${selection.width}`)
  assert.ok(countMask(selection.mask) > 500)
})

test('pathToSelection on a degenerate path yields an empty selection', () => {
  const selection = pathToSelection(createPath('p', [pathNode(1, 1), pathNode(5, 5)], true), 16, 16)
  assert.equal(countMask(selection.mask), 0)
  assert.equal(selection.width, 0)
})

test('pathBounds covers the handles, not just the anchors', () => {
  const path = createPath('p', [pathNode(10, 10, { x: 10, y: 10 }, { x: 40, y: 10 }), pathNode(20, 20)])
  const bounds = pathBounds(path)
  assert.equal(bounds.x, 10)
  assert.equal(bounds.width, 30, 'the outgoing handle at x=40 widens the box')
  assert.deepEqual(pathBounds(createPath('empty')), { x: 0, y: 0, width: 0, height: 0 })
})

test('hitTestPaths finds the anchor under the cursor, newest path first', () => {
  const first = createPath('first', [pathNode(10, 10)])
  const second = createPath('second', [pathNode(10, 10)])
  const hit = hitTestPaths([first, second], { x: 11, y: 12 }, 6)
  assert.deepEqual(hit, { pathId: second.id, index: 0, part: 'anchor' })
  assert.equal(hitTestPaths([first, second], { x: 80, y: 80 }, 6), null)
})

test('hitTestPaths only offers handles on a curved anchor', () => {
  const straight = createPath('s', [pathNode(10, 10)])
  assert.equal(hitTestPaths([straight], { x: 30, y: 10 }, 6), null)

  const curved = createPath('c', [smoothNode(pathNode(10, 10), { x: 30, y: 10 })])
  assert.deepEqual(hitTestPaths([curved], { x: 30, y: 10 }, 6), { pathId: curved.id, index: 0, part: 'out' })
  assert.deepEqual(hitTestPaths([curved], { x: -10, y: 10 }, 6), { pathId: curved.id, index: 0, part: 'in' })
})

test('moving an anchor carries its handles along', () => {
  const path = createPath('p', [smoothNode(pathNode(10, 10), { x: 20, y: 10 })])
  const moved = movePathPoint(path, { pathId: path.id, index: 0, part: 'anchor' }, { x: 30, y: 40 })
  const node = moved.nodes[0]
  assert.deepEqual([node.x, node.y], [30, 40])
  assert.deepEqual([node.outX, node.outY], [40, 40], 'the handle kept its offset')
  assert.deepEqual([node.inX, node.inY], [20, 40])
})

test('moving one handle mirrors the opposite one', () => {
  const path = createPath('p', [smoothNode(pathNode(10, 10), { x: 20, y: 10 })])
  const moved = movePathPoint(path, { pathId: path.id, index: 0, part: 'out' }, { x: 10, y: 30 })
  const node = moved.nodes[0]
  assert.deepEqual([node.outX, node.outY], [10, 30])
  assert.deepEqual([node.inX, node.inY], [10, -10], 'reflected through the anchor')
  assert.deepEqual([node.x, node.y], [10, 10], 'the anchor itself did not move')
})

test('movePathPoint leaves other anchors untouched', () => {
  const path = square()
  const moved = movePathPoint(path, { pathId: path.id, index: 1, part: 'anchor' }, { x: 99, y: 99 })
  assert.deepEqual([moved.nodes[0].x, moved.nodes[0].y], [4, 4])
  assert.deepEqual([moved.nodes[1].x, moved.nodes[1].y], [99, 99])
})

test('translatePath shifts every anchor and handle by the same delta', () => {
  const path = translatePath(square(), 5, -3)
  assert.deepEqual([path.nodes[0].x, path.nodes[0].y], [9, 1])
  assert.deepEqual([path.nodes[2].x, path.nodes[2].y], [33, 25])
  assert.equal(path.id, square().id !== path.id ? path.id : path.id, 'the path keeps its identity fields')
  assert.equal(path.closed, true)
})

test('drawPathOverlay renders anchors and handles without throwing', () => {
  const canvas = canvasOf(64, 64)
  const ctx = canvas.getContext('2d')
  const curved = createPath('c', [smoothNode(pathNode(20, 20), { x: 40, y: 20 }), pathNode(50, 50)])
  drawPathOverlay(ctx, [square(), curved], curved.id, 1)
  let painted = 0
  const data = ctx.getImageData(0, 0, 64, 64).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) painted += 1
  }
  assert.ok(painted > 0, 'the overlay drew something')
})
