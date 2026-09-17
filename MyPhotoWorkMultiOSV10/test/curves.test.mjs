// Real Curves and Levels: the lookup tables, the adjustments built on them and
// the auto black/white point reader.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addCurvePoint, applyCurves, applyCurvesData, applyLevels, applyLevelsData, autoLevels, curveLut,
  curveTables, isIdentityCurve, levelsLut, removeCurvePoint,
} from '../src/lib/curves.ts'
import { defaultCurves, defaultLevels } from '../src/lib/types.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { assertNear, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

const diagonal = [{ x: 0, y: 0 }, { x: 255, y: 255 }]

test('the default curve is the identity, input for input', () => {
  const lut = curveLut(diagonal)
  for (let i = 0; i < 256; i += 1) {
    assert.equal(lut[i], i, `entry ${i}`)
  }
  assert.equal(isIdentityCurve(diagonal), true)
})

test('curveLut keeps the endpoints exactly and stays inside 0..255', () => {
  const lut = curveLut([{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }])
  assert.equal(lut[0], 0)
  assert.equal(lut[255], 255)
  assert.equal(lut[128], 200)
  for (let i = 0; i < 256; i += 1) {
    assert.ok(lut[i] >= 0 && lut[i] <= 255, `entry ${i} is ${lut[i]}`)
  }
})

test('a curve through monotone points never dips backwards', () => {
  // The classic S-curve: a plain spline would overshoot near the control points.
  const lut = curveLut([{ x: 0, y: 0 }, { x: 64, y: 40 }, { x: 192, y: 215 }, { x: 255, y: 255 }])
  for (let i = 1; i < 256; i += 1) {
    assert.ok(lut[i] >= lut[i - 1], `entry ${i} (${lut[i]}) dropped below ${lut[i - 1]}`)
  }
  assert.ok(lut[64] < 64, 'shadows are pulled down')
  assert.ok(lut[192] > 192, 'highlights are pushed up')
})

test('curveLut tolerates unsorted, empty and single-point inputs', () => {
  const unsorted = curveLut([{ x: 255, y: 255 }, { x: 0, y: 0 }, { x: 128, y: 64 }])
  assert.equal(unsorted[128], 64, 'points are sorted before interpolating')

  const empty = curveLut([])
  assert.equal(empty[77], 77, 'no points means identity')

  const single = curveLut([{ x: 100, y: 30 }])
  assert.equal(single[0], 30)
  assert.equal(single[255], 30, 'one point flattens the whole range')
})

test('a curve clamps outside its outermost points instead of extrapolating', () => {
  const lut = curveLut([{ x: 50, y: 10 }, { x: 200, y: 240 }])
  assert.equal(lut[0], 10)
  assert.equal(lut[49], 10)
  assert.equal(lut[255], 240)
})

test('the composite RGB curve is applied on top of each per-channel curve', () => {
  const curves = { ...defaultCurves(), rgb: [{ x: 0, y: 0 }, { x: 255, y: 128 }] }
  const { r, g, b } = curveTables(curves)
  assert.equal(r[255], 128, 'the composite halves the top end')
  assert.equal(g[255], 128)
  assert.equal(b[255], 128)

  const redOnly = { ...defaultCurves(), r: [{ x: 0, y: 255 }, { x: 255, y: 0 }] }
  const tables = curveTables(redOnly)
  assert.equal(tables.r[0], 255, 'the red channel is inverted')
  assert.equal(tables.g[0], 0, 'green is untouched')
})

test('applyCurvesData rewrites a buffer and leaves alpha alone', () => {
  const data = Uint8ClampedArray.from([10, 20, 30, 128])
  applyCurvesData(data, { ...defaultCurves(), rgb: [{ x: 0, y: 255 }, { x: 255, y: 0 }] })
  assert.deepEqual([...data], [245, 235, 225, 128])
})

test('applyCurves writes back to the canvas and honours the selection', () => {
  const canvas = canvasOf(8, 8, '#404040')
  const invert = { ...defaultCurves(), rgb: [{ x: 0, y: 255 }, { x: 255, y: 0 }] }
  applyCurves(canvas, invert, rectSelection(0, 0, 4, 8))
  assert.deepEqual(px(canvas, 1, 1), [191, 191, 191, 255], 'inside the selection')
  assert.deepEqual(px(canvas, 6, 1), [64, 64, 64, 255], 'outside it')
})

test('an identity curve leaves every pixel exactly as it was', () => {
  const canvas = canvasFrom(8, 8, (x, y) => [x * 30, y * 30, 128])
  applyCurves(canvas, defaultCurves(), null)
  assert.deepEqual(px(canvas, 3, 4), [90, 120, 128, 255])
})

test('addCurvePoint inserts in x order and replaces a nearby point', () => {
  const added = addCurvePoint(diagonal, { x: 128, y: 200 })
  assert.deepEqual(added, [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }])

  const replaced = addCurvePoint(added, { x: 130, y: 60 })
  assert.equal(replaced.length, 3, 'a point within 4px replaces the old one')
  assert.deepEqual(replaced[1], { x: 130, y: 60 })
})

test('addCurvePoint clamps and rounds into the 0..255 grid', () => {
  const points = addCurvePoint(diagonal, { x: -40, y: 900 })
  assert.deepEqual(points[0], { x: 0, y: 255 })
  assert.deepEqual(addCurvePoint(diagonal, { x: 77.6, y: 12.2 })[1], { x: 78, y: 12 })
})

test('removeCurvePoint drops interior points but protects the endpoints', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 120 }, { x: 255, y: 255 }]
  assert.deepEqual(removeCurvePoint(points, 1), [{ x: 0, y: 0 }, { x: 255, y: 255 }])
  assert.deepEqual(removeCurvePoint(points, 0), points, 'the first point stays')
  assert.deepEqual(removeCurvePoint(points, 2), points, 'and the last')
  assert.deepEqual(removeCurvePoint(diagonal, 1), diagonal, 'two points cannot shrink further')
})

test('the default levels are a pass-through', () => {
  const lut = levelsLut(defaultLevels())
  for (const value of [0, 1, 64, 128, 200, 255]) {
    assertNear(lut[value], value, 1, `entry ${value}`)
  }
})

test('levels clip at the input black and white points', () => {
  const lut = levelsLut({ ...defaultLevels(), black: 50, white: 200 })
  assert.equal(lut[50], 0, 'the black point maps to 0')
  assert.equal(lut[40], 0, 'anything darker is clipped')
  assert.equal(lut[200], 255, 'the white point maps to 255')
  assert.equal(lut[230], 255)
  assertNear(lut[125], 128, 3, 'the midpoint lands in the middle')
})

test('levels gamma bends the midtones without moving the endpoints', () => {
  const brighter = levelsLut({ ...defaultLevels(), gamma: 2 })
  assert.equal(brighter[0], 0)
  assert.equal(brighter[255], 255)
  assert.ok(brighter[128] > 128, 'gamma above 1 lifts')

  const darker = levelsLut({ ...defaultLevels(), gamma: 0.5 })
  assert.ok(darker[128] < 128, 'gamma below 1 deepens')
})

test('the output range compresses the result', () => {
  const lut = levelsLut({ ...defaultLevels(), outBlack: 40, outWhite: 200 })
  assert.equal(lut[0], 40)
  assert.equal(lut[255], 200)
})

test('levels never divide by zero when the white point is below the black', () => {
  const lut = levelsLut({ ...defaultLevels(), black: 200, white: 10 })
  for (let i = 0; i < 256; i += 1) {
    assert.ok(Number.isFinite(lut[i]) && lut[i] >= 0 && lut[i] <= 255, `entry ${i} is ${lut[i]}`)
  }
  const zeroGamma = levelsLut({ ...defaultLevels(), gamma: 0 })
  assert.ok(Number.isFinite(zeroGamma[128]))
})

test('applyLevelsData and applyLevels agree, and the canvas form clips to a selection', () => {
  const data = Uint8ClampedArray.from([50, 125, 200, 255])
  applyLevelsData(data, { ...defaultLevels(), black: 50, white: 200 })
  assert.deepEqual([...data].slice(0, 3), [0, 128, 255])

  const canvas = canvasOf(8, 8, '#323232')
  applyLevels(canvas, { ...defaultLevels(), black: 50, white: 200 }, rectSelection(0, 0, 4, 8))
  assert.equal(px(canvas, 1, 1)[0], 0, 'inside the selection is clipped to black')
  assert.equal(px(canvas, 6, 1)[0], 50, 'outside it keeps its value')
})

test('autoLevels finds the black and white points of a narrow ramp', () => {
  const canvas = canvasFrom(64, 1, (x) => {
    const v = 80 + Math.round((x / 63) * 60)
    return [v, v, v]
  })
  const levels = autoLevels(canvas)
  assert.ok(levels.black >= 78 && levels.black <= 84, `black ${levels.black}`)
  assert.ok(levels.white >= 136 && levels.white <= 142, `white ${levels.white}`)
  assert.equal(levels.gamma, 1)
})

test('autoLevels ignores transparent pixels and survives an empty layer', () => {
  const half = canvasFrom(32, 1, (x) => [x < 16 ? 100 : 250, x < 16 ? 100 : 250, x < 16 ? 100 : 250, x < 16 ? 255 : 0])
  assert.ok(autoLevels(half).white < 200, 'the transparent bright half is not counted')

  assert.deepEqual(autoLevels(canvasOf(8, 8)), { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 })
})
