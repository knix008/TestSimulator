// Whole-layer operations: align and distribute, matting, tracing pixels into
// paths, the automation commands and the colour modes without an RGB twin.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alignOffsets, autoAlignLayers, bitmapMode, checkSpelling, contactSheet, defringe, distributeOffsets, duotone, findAlignment, fitImage,
  gamutWarning, indexedColor, layerBounds, mergeToHdr, normaliseOutline, photomerge, removeMatte, rotateLayerCanvas, shiftCanvas, traceCanvasToPaths,
} from '../src/lib/documentOps.ts'
import { canvasOf, px } from './helpers/pixels.mjs'

function blob(size, x, y, w, h, color = '#ff0000') {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  return canvas
}

test('layer bounds, shifting and quarter turns keep the pixels where they should be', () => {
  const canvas = blob(40, 10, 5, 8, 6)
  assert.deepEqual(layerBounds(canvas), { x: 10, y: 5, width: 8, height: 6 })
  assert.equal(layerBounds(canvasOf(8, 8)), null)
  const moved = shiftCanvas(canvas, 5, 5)
  assert.deepEqual(layerBounds(moved), { x: 15, y: 10, width: 8, height: 6 })
  const turned = rotateLayerCanvas(canvas, 1)
  const box = layerBounds(turned)
  assert.equal(box.width, 6)
  assert.equal(box.height, 8)
})

test('align moves layers onto the group edge, distribute spaces their centres evenly', () => {
  const a = blob(60, 5, 5, 10, 10)
  const b = blob(60, 30, 20, 10, 10)
  const left = alignOffsets([a, b], 'left', 60, 60)
  assert.equal(left[1].dx, -25, 'b moves to a\'s left edge')
  const bottom = alignOffsets([a, b], 'bottom', 60, 60)
  assert.equal(bottom[0].dy, 15, 'a moves down to b\'s bottom edge')
  const single = alignOffsets([a], 'centerH', 60, 60)
  assert.equal(single[0].dx, 20, 'a lone layer centres on the document')

  const c = blob(60, 45, 40, 10, 10)
  const spread = distributeOffsets([a, b, c], 'x')
  assert.equal(spread[1].dx, -5, 'the middle layer moves to the midpoint')
  assert.equal(spread[0].dx, 0)
  assert.equal(spread[2].dx, 0)
})

test('matting cleans a soft edge: defringe recolours it, remove matte un-blends it', () => {
  const canvas = canvasOf(10, 10)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(2, 2, 6, 6)
  const image = ctx.getImageData(0, 0, 10, 10)
  // A half-transparent black rim, as a black matte leaves behind.
  for (let x = 1; x < 9; x += 1) { const i = (1 * 10 + x) * 4; image.data[i] = 128; image.data[i + 1] = 0; image.data[i + 2] = 0; image.data[i + 3] = 128 }
  ctx.putImageData(image, 0, 0)
  removeMatte(canvas, 'black')
  assert.ok(px(canvas, 4, 1)[0] > 240, 'the rim pixel is red again once the black is un-blended')
  defringe(canvas, 1)
  assert.deepEqual(px(canvas, 4, 1).slice(0, 3), [255, 0, 0], 'defringe takes the interior colour')
})

test('tracing turns a filled square into one closed path, normalised into its box', () => {
  const canvas = blob(40, 8, 8, 16, 12)
  const paths = traceCanvasToPaths(canvas, 'Square')
  assert.equal(paths.length, 1)
  assert.equal(paths[0].closed, true)
  assert.ok(paths[0].nodes.length >= 4 && paths[0].nodes.length <= 8, `a square traces to a few corners, got ${paths[0].nodes.length}`)
  const xs = paths[0].nodes.map((n) => n.x)
  const ys = paths[0].nodes.map((n) => n.y)
  assert.equal(Math.min(...xs), 8)
  assert.equal(Math.max(...xs), 24)
  assert.equal(Math.min(...ys), 8)
  assert.equal(Math.max(...ys), 20)
  const { outline, box } = normaliseOutline(paths[0])
  assert.deepEqual(box, { x: 8, y: 8, width: 16, height: 12 })
  assert.ok(outline.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1))
})

test('alignment finds the shift between two frames of the same scene', () => {
  const size = 64
  const scene = (dx, dy) => {
    const canvas = canvasOf(size, size)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#204060'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#ffcc00'
    ctx.fillRect(20 + dx, 24 + dy, 14, 10)
    ctx.fillStyle = '#ff2040'
    ctx.fillRect(40 + dx, 10 + dy, 6, 6)
    return canvas
  }
  const shift = findAlignment(scene(0, 0), scene(6, -4))
  assert.ok(Math.abs(shift.dx + 6) <= 2 && Math.abs(shift.dy - 4) <= 2, `expected about (-6, 4), got (${shift.dx}, ${shift.dy})`)
  const offsets = autoAlignLayers([scene(0, 0), scene(6, -4)])
  assert.deepEqual(offsets[0], { dx: 0, dy: 0 })
})

test('merge to HDR favours the well-exposed frame per pixel', () => {
  const dark = blob(8, 0, 0, 8, 8, '#101010')
  const good = blob(8, 0, 0, 8, 8, '#808080')
  const bright = blob(8, 0, 0, 8, 8, '#f8f8f8')
  const merged = mergeToHdr([dark, good, bright])
  const value = px(merged, 4, 4)[0]
  assert.ok(value > 100 && value < 160, `mid-grey wins, got ${value}`)
})

test('photomerge lays frames side by side and a contact sheet grids them', () => {
  const left = blob(40, 0, 0, 40, 40, '#3366cc')
  const right = blob(40, 0, 0, 40, 40, '#3366cc')
  const { canvas, placements } = photomerge([left, right], 'horizontal', false)
  assert.ok(canvas.width > 40 && canvas.width <= 80, `the panorama is wider than one frame, got ${canvas.width}`)
  assert.equal(placements.length, 2)
  assert.ok(placements[1].x > placements[0].x)

  const sheet = contactSheet([{ name: 'a', canvas: left }, { name: 'b', canvas: right }, { name: 'c', canvas: left }], 2, 32)
  assert.ok(sheet.width > 64 && sheet.height > 64)
  assert.deepEqual(px(sheet, 1, 1).slice(0, 3), [255, 255, 255], 'the sheet is white paper')

  const fitted = fitImage(canvasOf(400, 200), 100, 100)
  assert.equal(fitted.width, 100)
  assert.equal(fitted.height, 50)
})

test('duotone, indexed colour and bitmap reduce the picture as their modes do', () => {
  const grey = canvasOf(16, 16)
  const gctx = grey.getContext('2d')
  const ramp = gctx.createLinearGradient(0, 0, 16, 0)
  ramp.addColorStop(0, '#000000')
  ramp.addColorStop(1, '#ffffff')
  gctx.fillStyle = ramp
  gctx.fillRect(0, 0, 16, 16)

  const two = canvasOf(16, 16)
  two.getContext('2d').drawImage(grey, 0, 0)
  duotone(two, '#000080', '#ffff00')
  assert.ok(px(two, 1, 8)[2] > 100 && px(two, 14, 8)[0] > 200, 'the shadows take ink 1 and the lights ink 2')

  const indexed = canvasOf(16, 16)
  indexed.getContext('2d').drawImage(grey, 0, 0)
  indexedColor(indexed, 4, false)
  const distinct = new Set()
  for (let x = 0; x < 16; x += 1) distinct.add(px(indexed, x, 8).join(','))
  assert.ok(distinct.size <= 4, `at most four colours remain, found ${distinct.size}`)

  const bits = canvasOf(16, 16)
  bits.getContext('2d').drawImage(grey, 0, 0)
  bitmapMode(bits)
  for (let x = 0; x < 16; x += 1) {
    const v = px(bits, x, 8)[0]
    assert.ok(v === 0 || v === 255, 'bitmap mode leaves only black and white')
  }
})

test('the gamut warning marks colours CMYK cannot print, and leaves greys alone', () => {
  const canvas = canvasOf(4, 4)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 2, 4)
  ctx.fillStyle = '#00ff40'
  ctx.fillRect(2, 0, 2, 4)
  gamutWarning(canvas, '#ff00ff')
  assert.deepEqual(px(canvas, 0, 0).slice(0, 3), [128, 128, 128], 'grey is in gamut')
  assert.deepEqual(px(canvas, 3, 0).slice(0, 3), [255, 0, 255], 'a vivid green is flagged')
})

test('the spelling check flags nonsense words and leaves ordinary ones', () => {
  const suspects = checkSpelling([{ layer: 'a', text: 'The quick brown fox sees the wrld and a hellllo' }])
  const words = suspects.map((item) => item.word)
  assert.ok(words.includes('wrld'), 'a vowel-less word is suspect')
  assert.ok(words.includes('hellllo'), 'a run of repeated letters is suspect')
  assert.ok(!words.includes('quick') && !words.includes('brown'), 'ordinary words pass')
})
