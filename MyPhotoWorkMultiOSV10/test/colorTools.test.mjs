// The colour operations that take more than one slider, plus the two automatic
// corrections. Each is checked on pixels whose right answer can be worked out
// by hand, so a change in the maths shows up as a number, not as "looks fine".
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoColor, channelMixer, colorFamilies, defaultChannelMix, defaultInkShift, equalize,
  gradientMap, replaceColor, selectiveColor,
} from '../src/lib/colorTools.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertPixel, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

test('the default channel mix is the identity: applying it changes nothing', () => {
  const canvas = canvasFrom(4, 4, (x, y) => [x * 40, y * 40, 120, 255])
  const before = px(canvas, 2, 2)
  channelMixer(canvas, defaultChannelMix(), null)
  assertPixel(canvas, 2, 2, before, 1, 'the identity matrix')
})

test('a channel mix moves one channel into another', () => {
  const canvas = canvasOf(4, 4, '#ff0000')
  const mix = defaultChannelMix()
  // Green now takes all of its value from red, which is full.
  mix.green = { r: 100, g: 0, b: 0, constant: 0 }
  channelMixer(canvas, mix, null)
  assertPixel(canvas, 2, 2, [255, 255, 0, 255], 2, 'red fed into green makes yellow')
})

test('the channel mixer constant lifts a channel on its own', () => {
  const canvas = canvasOf(4, 4, '#000000')
  const mix = defaultChannelMix()
  mix.blue = { r: 0, g: 0, b: 0, constant: 50 }
  channelMixer(canvas, mix, null)
  assertPixel(canvas, 2, 2, [0, 0, 128, 255], 3, 'half of full blue')
})

test('selective colour moves one family and leaves the others alone', () => {
  // Left half red, right half blue.
  const canvas = canvasFrom(8, 4, (x) => (x < 4 ? [220, 20, 20, 255] : [20, 20, 220, 255]))
  const blueBefore = px(canvas, 6, 2)

  // Taking yellow out of the reds pushes them towards magenta.
  selectiveColor(canvas, 'reds', { ...defaultInkShift(), yellow: -80 }, null)
  const red = px(canvas, 1, 2)
  assert.ok(red[2] > 20, `the reds gained blue: ${red}`)
  assertPixel(canvas, 6, 2, blueBefore, 1, 'the blues were not in the family being edited')
})

test('every colour family is one the ink shift can actually reach', () => {
  for (const family of colorFamilies) {
    const canvas = canvasFrom(4, 4, (x, y) => [40 + x * 60, 120, 200 - y * 40, 255])
    const before = px(canvas, 2, 2)
    selectiveColor(canvas, family, { cyan: 40, magenta: -40, yellow: 20, black: 10 }, null)
    // Nothing is asserted about direction here; the point is that the family is
    // known, so the pixel stays a colour rather than turning into NaN.
    const after = px(canvas, 2, 2)
    assert.ok(after.every((value) => Number.isFinite(value) && value >= 0 && value <= 255), `${family} produced ${after}`)
    assert.equal(after[3], before[3], `${family} changed the alpha`)
  }
})

test('a gradient map repaints from brightness alone', () => {
  const canvas = canvasFrom(3, 1, (x) => (x === 0 ? [0, 0, 0, 255] : x === 1 ? [128, 128, 128, 255] : [255, 255, 255, 255]))
  gradientMap(canvas, '#000080', '#ffff00', null)
  assertPixel(canvas, 0, 0, [0, 0, 128, 255], 2, 'black takes the start colour')
  assertPixel(canvas, 2, 0, [255, 255, 0, 255], 2, 'white takes the end colour')
  const middle = px(canvas, 1, 0)
  assert.ok(middle[0] > 100 && middle[0] < 160, `mid grey lands in the middle: ${middle}`)
})

test('replacing a colour leaves the ones outside the tolerance alone', () => {
  const canvas = canvasFrom(8, 4, (x) => (x < 4 ? [220, 20, 20, 255] : [20, 220, 20, 255]))
  replaceColor(canvas, { r: 220, g: 20, b: 20 }, '#0000ff', 40, null)
  assertPixel(canvas, 1, 2, [0, 0, 255, 255], 3, 'the red became blue')
  assertPixel(canvas, 6, 2, [20, 220, 20, 255], 1, 'the green was too far away to touch')
})

test('a replacement fades out towards the edge of the tolerance', () => {
  const canvas = canvasFrom(2, 1, (x) => (x === 0 ? [200, 0, 0, 255] : [160, 0, 0, 255]))
  // 160 is 40 away from the target colour, which is the edge of the range.
  replaceColor(canvas, { r: 200, g: 0, b: 0 }, '#000000', 40, null)
  assertPixel(canvas, 0, 0, [0, 0, 0, 255], 2, 'dead on the colour, replaced outright')
  assertPixel(canvas, 1, 0, [160, 0, 0, 255], 2, 'at the edge of the range, untouched')
})

test('equalize spreads a flat, low-contrast image out', () => {
  // Four tones crammed into a narrow band.
  const canvas = canvasFrom(4, 4, (x) => [100 + x * 4, 100 + x * 4, 100 + x * 4, 255])
  equalize(canvas, null)
  const darkest = px(canvas, 0, 0)[0]
  const lightest = px(canvas, 3, 0)[0]
  assert.ok(lightest - darkest > 60, `the range opened up from 12 to ${lightest - darkest}`)
})

test('an adjustment honours the selection it is given', () => {
  const canvas = canvasFrom(8, 4, () => [200, 40, 40, 255])
  gradientMap(canvas, '#000000', '#ffffff', rectSelection(0, 0, 4, 4))
  const inside = px(canvas, 1, 2)
  assertPixel(canvas, 6, 2, [200, 40, 40, 255], 1, 'outside the selection')
  assert.equal(inside[0], inside[1], 'inside it, the gradient map made a grey')
})

test('auto colour pulls a cast out by stretching each channel on its own', () => {
  // A blue cast: the red channel never gets near full.
  const canvas = canvasFrom(4, 1, (x) => [60 + x * 10, 60 + x * 10, 180 + x * 20, 255])
  autoColor(canvas)
  const first = px(canvas, 0, 0)
  const last = px(canvas, 3, 0)
  assert.equal(first[0], 0, 'the darkest red became black')
  assert.equal(last[0], 255, 'the lightest red became full')
  assert.equal(last[2], 255, 'and so did blue, independently')
})
