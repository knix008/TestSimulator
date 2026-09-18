// Setting type: paragraphs, letter spacing, type on a path, and the warp that
// bends a finished type layer.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  drawSpacedText, drawTextBlock, drawTextOnPath, flattenPath, lineStep, pointAtDistance, textFont,
  textLines,
} from '../src/lib/typeset.ts'
import { rasterizeTextLayer } from '../src/lib/effects.ts'
import { createCanvas, context2d } from '../src/lib/canvas.ts'
import { pathNode, createPath } from '../src/lib/paths.ts'
import { meanDiff, px } from './helpers/pixels.mjs'

function textData(patch = {}) {
  return {
    text: 'Hi',
    x: 10,
    y: 10,
    fontFamily: 'sans-serif',
    fontSize: 24,
    color: '#ffffff',
    bold: false,
    italic: false,
    align: 'left',
    vertical: false,
    ...patch,
  }
}

/** How many pixels of the canvas the type actually covers. */
function inked(canvas) {
  const { data } = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  let count = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > 16) count += 1
  return count
}

/** The bounding box of everything drawn, or null if nothing was. */
function inkBounds(canvas) {
  const { data } = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  let minX = canvas.width
  let minY = canvas.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] <= 16) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY }
}

test('the font string carries weight, slant and size', () => {
  assert.equal(textFont(textData({ bold: true, italic: true })), 'italic 700 24px sans-serif')
  assert.equal(textFont(textData()), '500 24px sans-serif')
})

test('paragraphs are split on newlines and stepped by the line height', () => {
  assert.deepEqual(textLines(textData({ text: 'one\ntwo' })), ['one', 'two'])
  assert.equal(lineStep(textData({ fontSize: 20 })), 24, 'the default line height is 1.2')
  assert.equal(lineStep(textData({ fontSize: 20, lineHeight: 2 })), 40)
})

test('letter spacing widens a line without moving where it starts', () => {
  const tight = createCanvas(200, 40)
  const loose = createCanvas(200, 40)
  for (const [canvas, spacing] of [[tight, 0], [loose, 8]]) {
    const ctx = context2d(canvas)
    ctx.font = '500 20px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'top'
    drawSpacedText(ctx, 'ABC', 10, 10, spacing, 'left')
  }
  const a = inkBounds(tight)
  const b = inkBounds(loose)
  assert.ok(b.maxX > a.maxX + 8, `spacing should push the last letter right: ${a.maxX} to ${b.maxX}`)
  assert.ok(Math.abs(b.minX - a.minX) < 3, 'the line still starts in the same place')
})

test('a second paragraph is drawn below the first', () => {
  const canvas = createCanvas(200, 120)
  const ctx = context2d(canvas)
  ctx.font = '500 20px sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  drawTextBlock(ctx, textData({ text: 'one\ntwo', fontSize: 20, x: 10, y: 10 }))
  const bounds = inkBounds(canvas)
  assert.ok(bounds.maxY > 24, `two lines should reach past the first: ${bounds.maxY}`)
})

test('a blank line opens a paragraph gap, and the indent only moves the first line', () => {
  const plain = createCanvas(240, 160)
  const spaced = createCanvas(240, 160)
  for (const [canvas, patch] of [[plain, {}], [spaced, { paragraphSpacing: 40 }]]) {
    const ctx = context2d(canvas)
    ctx.font = '500 20px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'top'
    drawTextBlock(ctx, textData({ text: 'one\n\ntwo', fontSize: 20, x: 10, y: 10, ...patch }))
  }
  assert.ok(inkBounds(spaced).maxY > inkBounds(plain).maxY + 20, 'the gap pushed the second paragraph down')

  const indented = createCanvas(240, 160)
  const ctx = context2d(indented)
  ctx.font = '500 20px sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  drawTextBlock(ctx, textData({ text: 'one\ntwo', fontSize: 20, x: 10, y: 10, indent: 30 }))
  assert.ok(inkBounds(indented).minX >= 10, 'the indent never pulls text left of the anchor')
})

test('vertical type stacks its characters downwards', () => {
  const canvas = createCanvas(120, 200)
  const ctx = context2d(canvas)
  ctx.font = '500 20px sans-serif'
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  drawTextBlock(ctx, textData({ text: 'ABC', fontSize: 20, x: 20, y: 10, vertical: true }))
  const bounds = inkBounds(canvas)
  assert.ok(bounds.maxY - bounds.minY > 40, 'three stacked letters are taller than one')
  assert.ok(bounds.maxX - bounds.minX < 30, 'and no wider than one')
})

/* --------------------------------------------------------- type on a path */

/** A straight run from (10, 50) to (190, 50). */
function straightPath() {
  return createPath('p1', [pathNode(10, 50), pathNode(190, 50)], false)
}

test('a path flattens into points that run from one end to the other', () => {
  const points = flattenPath(straightPath())
  assert.ok(points.length > 10)
  assert.deepEqual(points[0], { x: 10, y: 50 })
  assert.deepEqual(points[points.length - 1], { x: 190, y: 50 })
})

test('a distance along the path lands between its points, and off it is refused', () => {
  const points = flattenPath(straightPath())
  const lengths = points.map((_, index) => index * (180 / (points.length - 1)))
  const middle = pointAtDistance(points, lengths, 90)
  assert.ok(middle)
  assert.ok(Math.abs(middle.x - 100) < 4, `halfway along should be near x=100: ${middle.x}`)
  // atan2 gives -0 for a run heading right, which is not strictly equal to 0.
  assert.ok(Math.abs(middle.angle) < 0.01, `a straight run heads along x: ${middle.angle}`)
  assert.equal(pointAtDistance(points, lengths, 500), null, 'past the end there is nowhere to put it')
})

test('type on a path follows the path rather than the layer anchor', () => {
  const canvas = createCanvas(200, 100)
  const ctx = context2d(canvas)
  ctx.font = '500 20px sans-serif'
  ctx.fillStyle = '#ffffff'
  drawTextOnPath(ctx, textData({ text: 'ABCDEF', fontSize: 20, x: 0, y: 0 }), straightPath())
  const bounds = inkBounds(canvas)
  assert.ok(bounds, 'something was drawn')
  assert.ok(bounds.minX >= 8, 'it starts where the path starts, not at the origin')
  assert.ok(Math.abs(bounds.minY - 30) < 25, `it sits on the path, around y=50: ${bounds.minY}`)
})

/* -------------------------------------------------------------- text warp */

test('a warped type layer is bent, and an unwarped one is not', () => {
  const plain = rasterizeTextLayer(200, 120, textData({ text: 'WARP', fontSize: 40, x: 20, y: 40 }))
  const bent = rasterizeTextLayer(200, 120, textData({
    text: 'WARP',
    fontSize: 40,
    x: 20,
    y: 40,
    warp: { style: 'arch', bend: 80, horizontal: 0, vertical: 0 },
  }))
  assert.ok(inked(plain) > 0, 'the type was drawn')
  assert.ok(meanDiff(plain, bent) > 0.5, 'the warp changed the shape')

  const unbent = rasterizeTextLayer(200, 120, textData({
    text: 'WARP',
    fontSize: 40,
    x: 20,
    y: 40,
    warp: { style: 'none', bend: 80, horizontal: 0, vertical: 0 },
  }))
  assert.equal(meanDiff(plain, unbent), 0, 'a style of none leaves the type alone')
})

test('a type layer that names a path is set along it', () => {
  const path = straightPath()
  const data = textData({ text: 'ABCDEF', fontSize: 20, x: 0, y: 0, pathId: path.id })
  const onPath = rasterizeTextLayer(200, 100, data, [path])
  const straight = rasterizeTextLayer(200, 100, { ...data, pathId: undefined })
  assert.ok(meanDiff(onPath, straight) > 0.2, 'the path moved the type')
  assert.equal(px(onPath, 0, 0)[3], 0, 'nothing is left at the layer anchor')
})
