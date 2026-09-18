// The Select menu's modifiers. A selection is a mask, so these are all checked
// by counting and locating the pixels that end up in it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  borderSelection, colorRangeSelection, contractSelection, expandSelection, growSelection,
  rectSelection, selectionToMask, similarSelection, smoothSelection,
} from '../src/lib/selection.ts'
import { canvasFrom } from './helpers/pixels.mjs'

const W = 24
const H = 24

function count(selection) {
  const mask = selectionToMask(selection, W, H)
  let total = 0
  for (const value of mask) if (value) total += 1
  return total
}

function isOn(selection, x, y) {
  return selectionToMask(selection, W, H)[y * W + x] > 0
}

/** An 8x8 square in the middle, the shape every modifier is measured against. */
const square = rectSelection(8, 8, 8, 8)

test('expanding adds a ring all the way round, and contracting takes it back', () => {
  const bigger = expandSelection(square, W, H, 2)
  assert.ok(isOn(bigger, 6, 12), 'two pixels out on the left is now inside')
  assert.ok(!isOn(bigger, 4, 12), 'four pixels out is still outside')
  assert.ok(count(bigger) > count(square), 'expanding must grow the selection')

  const smaller = contractSelection(square, W, H, 2)
  assert.ok(!isOn(smaller, 8, 12), 'the old edge is outside the smaller selection')
  assert.ok(isOn(smaller, 12, 12), 'the middle survives')
  assert.ok(count(smaller) < count(square), 'contracting must shrink the selection')
})

test('contracting past its own size leaves nothing, rather than inverting', () => {
  assert.equal(count(contractSelection(square, W, H, 20)), 0)
})

test('a border is a band on the edge, with the middle no longer selected', () => {
  const band = borderSelection(square, W, H, 4)
  assert.ok(!isOn(band, 12, 12), 'the middle is not part of a border')
  assert.ok(isOn(band, 8, 12), 'the edge itself is')
  assert.ok(isOn(band, 7, 12), 'and so is just outside it')
  // A band round an 8x8 square is bigger than the square, but nowhere near the
  // whole canvas — which is what a border that had inverted would look like.
  assert.ok(count(band) > count(square), `the band is only ${count(band)} pixels`)
  assert.ok(count(band) < W * H * 0.4, `the band covers ${count(band)} of ${W * H} pixels`)
})

test('smoothing fills a pinhole and shaves off a spur', () => {
  // A square with one pixel missing from the middle and one stray pixel outside.
  const mask = selectionToMask(square, W, H)
  mask[12 * W + 12] = 0
  mask[2 * W + 2] = 255
  const rough = { kind: 'mask', x: 0, y: 0, width: W, height: H, mask }

  const smooth = smoothSelection(rough, W, H, 2)
  assert.ok(isOn(smooth, 12, 12), 'the pinhole is filled in')
  assert.ok(!isOn(smooth, 2, 2), 'the lone pixel is voted away')
})

test('Grow spreads through touching colour, and stops at a different one', () => {
  // Left half red, right half blue; the seed sits in the red half.
  const canvas = canvasFrom(W, H, (x) => (x < 12 ? [200, 20, 20, 255] : [20, 20, 200, 255]))
  const seed = rectSelection(2, 2, 2, 2)
  const grown = growSelection(canvas, seed, 20)

  assert.ok(isOn(grown, 11, 20), 'it reaches the far corner of the red half')
  assert.ok(!isOn(grown, 12, 12), 'and stops where the colour changes')
})

test('Similar picks up the same colour anywhere, which is what Grow will not', () => {
  // Two separate red patches with blue between them.
  const canvas = canvasFrom(W, H, (x) => (x < 6 || x > 17 ? [200, 20, 20, 255] : [20, 20, 200, 255]))
  const seed = rectSelection(1, 1, 3, 3)

  assert.ok(!isOn(growSelection(canvas, seed, 20), 20, 12), 'Grow cannot cross the blue')
  assert.ok(isOn(similarSelection(canvas, seed, 20), 20, 12), 'Similar finds the far patch')
})

test('a colour range selects by colour and leaves clear pixels out', () => {
  const canvas = canvasFrom(W, H, (x, y) => {
    if (y < 4) return [0, 0, 0, 0]
    return x < 12 ? [200, 20, 20, 255] : [20, 20, 200, 255]
  })
  const reds = colorRangeSelection(canvas, { r: 200, g: 20, b: 20 }, 30)
  assert.ok(isOn(reds, 4, 12), 'the red half is in')
  assert.ok(!isOn(reds, 20, 12), 'the blue half is not')
  assert.ok(!isOn(reds, 4, 1), 'a fully transparent pixel has no colour to match')
})

test('with nothing selected the modifiers work on the whole canvas', () => {
  // Everywhere else in the editor, no selection means the whole image; the
  // modifiers have to read it the same way.
  assert.equal(count(expandSelection(null, W, H, 3)), W * H, 'there is nothing left to expand into')
  assert.equal(count(smoothSelection(null, W, H, 2)), W * H, 'a full canvas is already smooth')

  const pulled = contractSelection(null, W, H, 3)
  assert.ok(!isOn(pulled, 0, 12), 'contracting eats in from the canvas edge')
  assert.ok(isOn(pulled, 12, 12), 'and leaves the middle alone')
})
