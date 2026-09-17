// The Camera Raw-style develop pipeline. Each slider is checked on its own
// against a neutral adjustment, so a regression points at one control.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyAdjustment, applyAdjustmentCanvas, levelsStretch, mapImage } from '../src/lib/adjustments.ts'
import { defaultAdjustment } from '../src/lib/types.ts'
import { assertNear, canvasFrom, canvasOf, px, withSeededRandom } from './helpers/pixels.mjs'

/** Runs one adjustment over a single pixel and returns the result. */
function develop(rgba, overrides = {}) {
  const data = Uint8ClampedArray.from(rgba)
  applyAdjustment(data, { ...defaultAdjustment(overrides.type ?? 'brightness'), ...overrides })
  return [...data]
}

const MID = [128, 128, 128, 255]

test('mapImage rewrites every pixel and hands the byte offset to the callback', () => {
  const data = Uint8ClampedArray.from([1, 2, 3, 4, 5, 6, 7, 8])
  const offsets = []
  mapImage(data, (r, g, b, a, i) => {
    offsets.push(i)
    return [r + 1, g + 1, b + 1, a]
  })
  assert.deepEqual([...data], [2, 3, 4, 4, 6, 7, 8, 8])
  assert.deepEqual(offsets, [0, 4])
})

test('mapImage clamps writes through Uint8ClampedArray rather than wrapping', () => {
  const data = Uint8ClampedArray.from([250, 5, 0, 255])
  mapImage(data, (r, g, b, a) => [r + 50, g - 50, b, a])
  assert.deepEqual([...data], [255, 0, 0, 255])
})

test('a neutral adjustment leaves mid-grey essentially untouched', () => {
  const out = develop(MID)
  assertNear(out[0], 128, 1, 'red')
  assertNear(out[1], 128, 1, 'green')
  assertNear(out[2], 128, 1, 'blue')
  assert.equal(out[3], 255, 'alpha is never altered')
})

test('invert flips every channel and preserves alpha', () => {
  assert.deepEqual(develop([0, 64, 255, 128], { type: 'invert' }), [255, 191, 0, 128])
})

test('threshold splits on luma, not on a single channel', () => {
  // Pure blue has luma 0.114*255 ≈ 29, so it falls below a 128 threshold …
  assert.deepEqual(develop([0, 0, 255, 255], { type: 'threshold', threshold: 128 }), [0, 0, 0, 255])
  // … while pure green has luma ≈ 150 and lands above it.
  assert.deepEqual(develop([0, 255, 0, 255], { type: 'threshold', threshold: 128 }), [255, 255, 255, 255])
  assert.deepEqual(develop([0, 0, 255, 255], { type: 'threshold', threshold: 10 }), [255, 255, 255, 255])
})

test('posterize quantises to the requested number of levels', () => {
  const twoTone = develop([100, 200, 10, 255], { type: 'posterize', posterize: 2 })
  assert.deepEqual(twoTone, [0, 255, 0, 255], 'two levels means black or white per channel')

  // Three levels put the steps at 0 / 127.5 / 255.
  const three = develop([130, 20, 250, 255], { type: 'posterize', posterize: 3 })
  assert.deepEqual(three, [128, 0, 255, 255])
})

test('posterize never divides by zero when the level count is below two', () => {
  assert.deepEqual(develop([100, 200, 10, 255], { type: 'posterize', posterize: 0 }), [0, 255, 0, 255])
  assert.deepEqual(develop([100, 200, 10, 255], { type: 'posterize', posterize: 1 }), [0, 255, 0, 255])
})

test('black & white collapses to the luma value, weighted per Rec.601', () => {
  assert.deepEqual(develop([255, 0, 0, 255], { type: 'bw' }), [76, 76, 76, 255])
  assert.deepEqual(develop([0, 255, 0, 255], { type: 'bw' }), [150, 150, 150, 255])
  assert.deepEqual(develop([0, 0, 255, 255], { type: 'bw' }), [29, 29, 29, 255])
})

test('brightness moves tones in the slider direction and saturates at the ends', () => {
  assert.ok(develop(MID, { brightness: 20 })[0] > 128)
  assert.ok(develop(MID, { brightness: -20 })[0] < 128)
  assert.equal(develop(MID, { brightness: 100 })[0], 255)
  assert.equal(develop(MID, { brightness: -100 })[0], 0)
})

test('contrast pivots around mid-grey', () => {
  assert.equal(develop(MID, { contrast: 80 })[0], develop(MID)[0], 'the pivot itself does not move')
  assert.ok(develop([200, 200, 200, 255], { contrast: 50 })[0] > 200, 'highlights push up')
  assert.ok(develop([60, 60, 60, 255], { contrast: 50 })[0] < 60, 'shadows push down')
  // Negative contrast pulls both ends toward the middle.
  assert.ok(develop([200, 200, 200, 255], { contrast: -50 })[0] < 200)
  assert.ok(develop([60, 60, 60, 255], { contrast: -50 })[0] > 60)
})

test('exposure is a multiplicative stop, so +100 is one stop brighter', () => {
  const brighter = develop([64, 64, 64, 255], { exposure: 100 })
  assertNear(brighter[0], 128, 2, 'one stop up doubles the linear value')
  const darker = develop([128, 128, 128, 255], { exposure: -100 })
  assertNear(darker[0], 64, 2, 'one stop down halves it')
})

test('gamma bends the midtones without moving pure black or white', () => {
  assert.ok(develop(MID, { gamma: 2.2 })[0] > 128, 'gamma above 1 lifts midtones')
  assert.ok(develop(MID, { gamma: 0.5 })[0] < 128, 'gamma below 1 deepens them')
  assert.equal(develop([0, 0, 0, 255], { gamma: 2.2 })[0], 0)
  assert.equal(develop([255, 255, 255, 255], { gamma: 2.2 })[0], 255)
})

test('gamma is floored so a zero never produces NaN pixels', () => {
  const out = develop(MID, { gamma: 0 })
  assert.ok(Number.isFinite(out[0]))
  assert.ok(out[0] >= 0 && out[0] <= 255)
})

test('highlights and shadows act on opposite ends of the tone curve', () => {
  const light = [220, 220, 220, 255]
  const dark = [40, 40, 40, 255]
  assert.ok(develop(light, { highlights: 60 })[0] - 220 > develop(dark, { highlights: 60 })[0] - 40,
    'highlights bite hardest in the brights')
  assert.ok(develop(dark, { shadows: 60 })[0] - 40 > develop(light, { shadows: 60 })[0] - 220,
    'shadows bite hardest in the darks')
})

test('temperature warms toward red and cools toward blue', () => {
  const warm = develop(MID, { temperature: 60 })
  assert.ok(warm[0] > warm[2], 'a positive temperature leaves red above blue')
  const cool = develop(MID, { temperature: -60 })
  assert.ok(cool[2] > cool[0], 'a negative temperature leaves blue above red')
})

test('tint trades green against magenta', () => {
  const green = develop(MID, { tint: 60 })
  assert.ok(green[1] > green[0], 'a positive tint pushes green')
  const magenta = develop(MID, { tint: -60 })
  assert.ok(magenta[1] < magenta[0], 'a negative tint pulls it back')
})

test('the per-channel red/green/blue offsets shift only their own channel', () => {
  const red = develop(MID, { red: 40 })
  assert.ok(red[0] > 128 && Math.abs(red[1] - 128) < 3 && Math.abs(red[2] - 128) < 3)
  const blue = develop(MID, { blue: 40 })
  assert.ok(blue[2] > 128 && Math.abs(blue[0] - 128) < 3)
})

test('saturation intensifies a colour and -100 drains it to grey', () => {
  const base = [200, 80, 80, 255]
  const saturated = develop(base, { saturation: 50 })
  assert.ok(saturated[0] - saturated[1] > base[0] - base[1], 'channels spread apart')

  const grey = develop(base, { saturation: -100 })
  assert.equal(grey[0], grey[1])
  assert.equal(grey[1], grey[2])
})

test('vibrance lifts muted colours more than already saturated ones', () => {
  const muted = [140, 120, 120, 255]
  const vivid = [255, 0, 0, 255]
  const mutedGain = develop(muted, { vibrance: 100 })[0] - develop(muted)[0]
  const vividGain = develop(vivid, { vibrance: 100 })[0] - develop(vivid)[0]
  assert.ok(mutedGain >= vividGain, `muted gain ${mutedGain} should exceed vivid gain ${vividGain}`)
})

test('hue rotates around the wheel and 360 degrees is a no-op', () => {
  const red = [255, 0, 0, 255]
  const rotated = develop(red, { hue: 120 })
  assert.ok(rotated[1] > rotated[0], 'a 120 degree turn takes red toward green')
  const full = develop(red, { hue: 360 })
  const none = develop(red)
  for (let i = 0; i < 3; i += 1) {
    assertNear(full[i], none[i], 2, `channel ${i} after a full turn`)
  }
})

test('lightness raises and lowers the HSL lightness', () => {
  assert.ok(develop(MID, { lightness: 30 })[0] > 128)
  assert.ok(develop(MID, { lightness: -30 })[0] < 128)
})

test('a photo filter blends the filter colour in at the chosen density', () => {
  const none = develop(MID, { type: 'photoFilter', filterColor: '#ff0000', filterDensity: 0 })
  assertNear(none[0], 128, 1, 'zero density changes nothing')

  const full = develop(MID, { type: 'photoFilter', filterColor: '#ff0000', filterDensity: 1 })
  assert.deepEqual(full.slice(0, 3), [255, 0, 0], 'full density replaces the pixel')

  const half = develop(MID, { type: 'photoFilter', filterColor: '#ff0000', filterDensity: 0.5 })
  assertNear(half[0], 191, 2, 'half density lands midway')
})

test('clarity pushes pixels away from their own luma, boosting local contrast', () => {
  const warm = [200, 120, 60, 255]
  const before = develop(warm)
  const after = develop(warm, { clarity: 100 })
  const spreadBefore = Math.max(...before.slice(0, 3)) - Math.min(...before.slice(0, 3))
  const spreadAfter = Math.max(...after.slice(0, 3)) - Math.min(...after.slice(0, 3))
  assert.ok(spreadAfter > spreadBefore, `clarity should widen the channel spread (${spreadBefore} -> ${spreadAfter})`)
})

test('dehaze lifts the black point, darkening a flat mid-grey', () => {
  const hazy = develop(MID, { dehaze: 80 })
  assert.ok(hazy[0] < 128, `dehaze should deepen a flat grey (got ${hazy[0]})`)
})

test('grain perturbs pixels, and the same seed gives the same result', () => {
  const run = () => withSeededRandom(7, () => develop(MID, { grain: 60 }))
  const first = run()
  assert.deepEqual(first, run(), 'grain is driven only by Math.random')
  assert.notDeepEqual(first.slice(0, 3), [128, 128, 128], 'grain actually moved the pixel')
  // Grain is monochrome noise, so the three channels move together.
  assert.equal(first[0], first[1])
  assert.equal(first[1], first[2])
})

test('applyAdjustmentCanvas writes the result back into the canvas', () => {
  const canvas = canvasOf(4, 4, '#404040')
  applyAdjustmentCanvas(canvas, { ...defaultAdjustment('invert'), type: 'invert' })
  assert.deepEqual(px(canvas, 1, 1), [191, 191, 191, 255])
})

test('levelsStretch maps the darkest pixel to black and the lightest to white', () => {
  // A narrow 100..160 ramp should end up spanning the full range.
  const canvas = canvasFrom(8, 1, (x) => {
    const v = 100 + x * 60 / 7
    return [v, v, v]
  })
  levelsStretch(canvas)
  assertNear(px(canvas, 0, 0)[0], 0, 2, 'darkest pixel')
  assertNear(px(canvas, 7, 0)[0], 255, 2, 'lightest pixel')
})

test('levelsStretch on a flat image does not divide by zero', () => {
  const canvas = canvasOf(4, 4, '#808080')
  levelsStretch(canvas)
  const out = px(canvas, 1, 1)
  assert.ok(Number.isFinite(out[0]) && out[0] >= 0 && out[0] <= 255, `got ${out[0]}`)
})
