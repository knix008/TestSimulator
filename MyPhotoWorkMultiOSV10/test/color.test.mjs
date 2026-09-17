// Color math: every other feature (adjustments, filters, brushes, the picker)
// depends on these conversions being exact and round-tripping.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clamp, colorDistance, colorWithAlpha, hexToRgb, hslToRgb, hsvToRgb, rgbToHex, rgbToHsl, rgbToHsv,
} from '../src/lib/color.ts'
import { assertNear } from './helpers/pixels.mjs'

test('clamp holds a value inside its range', () => {
  assert.equal(clamp(5, 0, 10), 5)
  assert.equal(clamp(-1, 0, 10), 0)
  assert.equal(clamp(11, 0, 10), 10)
  assert.equal(clamp(0.5, 0, 1), 0.5)
})

test('hexToRgb reads 6-digit, 3-digit and #-less forms', () => {
  assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 })
  assert.deepEqual(hexToRgb('ff8000'), { r: 255, g: 128, b: 0 })
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(hexToRgb('#08f'), { r: 0, g: 136, b: 255 })
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 })
})

test('rgbToHex pads, rounds and clamps out-of-range channels', () => {
  assert.equal(rgbToHex(255, 128, 0), '#ff8000')
  assert.equal(rgbToHex(0, 0, 0), '#000000')
  assert.equal(rgbToHex(1, 2, 3), '#010203')
  assert.equal(rgbToHex(127.6, 127.4, 0), '#807f00')
  assert.equal(rgbToHex(-20, 300, 128), '#00ff80')
})

test('hex → rgb → hex round trips across the palette', () => {
  for (const hex of ['#000000', '#ffffff', '#1d4ed8', '#ff8000', '#7ec8ff', '#2f8a52']) {
    const { r, g, b } = hexToRgb(hex)
    assert.equal(rgbToHex(r, g, b), hex, hex)
  }
})

test('rgbToHsv reports the expected hue sextant for each primary', () => {
  assert.deepEqual(rgbToHsv(255, 0, 0), { h: 0, s: 1, v: 1 })
  assert.equal(rgbToHsv(0, 255, 0).h, 120)
  assert.equal(rgbToHsv(0, 0, 255).h, 240)
  assert.equal(rgbToHsv(255, 255, 0).h, 60)
  assert.equal(rgbToHsv(0, 255, 255).h, 180)
  assert.equal(rgbToHsv(255, 0, 255).h, 300)
})

test('rgbToHsv leaves hue at 0 for greys and reports value, not lightness', () => {
  assert.deepEqual(rgbToHsv(0, 0, 0), { h: 0, s: 0, v: 0 })
  assert.deepEqual(rgbToHsv(128, 128, 128), { h: 0, s: 0, v: 128 / 255 })
  assert.deepEqual(rgbToHsv(255, 255, 255), { h: 0, s: 0, v: 1 })
})

test('hsv → rgb → hsv survives a full hue sweep', () => {
  for (let h = 0; h < 360; h += 15) {
    const rgb = hsvToRgb(h, 0.8, 0.9)
    const back = rgbToHsv(rgb.r, rgb.g, rgb.b)
    assertNear(back.h, h, 1.5, `hue ${h}`)
    assertNear(back.s, 0.8, 0.02, `sat at hue ${h}`)
    assertNear(back.v, 0.9, 0.01, `val at hue ${h}`)
  }
})

test('hsvToRgb handles the sextant boundaries and the achromatic case', () => {
  assert.deepEqual(hsvToRgb(0, 1, 1), { r: 255, g: 0, b: 0 })
  assert.deepEqual(hsvToRgb(120, 1, 1), { r: 0, g: 255, b: 0 })
  assert.deepEqual(hsvToRgb(240, 1, 1), { r: 0, g: 0, b: 255 })
  assert.deepEqual(hsvToRgb(0, 0, 1), { r: 255, g: 255, b: 255 })
  assert.deepEqual(hsvToRgb(200, 0.5, 0), { r: 0, g: 0, b: 0 })
})

test('rgbToHsl puts lightness at the midpoint and is hue-stable for greys', () => {
  assert.deepEqual(rgbToHsl(0, 0, 0), { h: 0, s: 0, l: 0 })
  assert.deepEqual(rgbToHsl(255, 255, 255), { h: 0, s: 0, l: 1 })
  const red = rgbToHsl(255, 0, 0)
  assert.equal(red.h, 0)
  assert.equal(red.s, 1)
  assert.equal(red.l, 0.5)
  assertNear(rgbToHsl(0, 0, 255).h, 2 / 3, 1e-9, 'blue hue')
})

test('hsl → rgb → hsl round trips, including the wrapped blue/magenta hues', () => {
  for (let i = 0; i < 12; i += 1) {
    const h = i / 12
    const rgb = hslToRgb(h, 0.7, 0.45)
    const back = rgbToHsl(rgb.r, rgb.g, rgb.b)
    assertNear(back.h, h, 0.01, `hue ${h}`)
    assertNear(back.s, 0.7, 0.02, `sat at hue ${h}`)
    assertNear(back.l, 0.45, 0.01, `lightness at hue ${h}`)
  }
})

test('hslToRgb short-circuits zero saturation to a neutral grey', () => {
  assert.deepEqual(hslToRgb(0.37, 0, 0.5), { r: 128, g: 128, b: 128 })
  assert.deepEqual(hslToRgb(0.37, 0, 0), { r: 0, g: 0, b: 0 })
  assert.deepEqual(hslToRgb(0.37, 0, 1), { r: 255, g: 255, b: 255 })
})

test('colorWithAlpha emits css rgba and clamps alpha', () => {
  assert.equal(colorWithAlpha('#ff8000', 0.5), 'rgba(255, 128, 0, 0.5)')
  assert.equal(colorWithAlpha('#000', 2), 'rgba(0, 0, 0, 1)')
  assert.equal(colorWithAlpha('#000', -1), 'rgba(0, 0, 0, 0)')
})

test('colorDistance is Chebyshev over RGBA, which is what the bucket tolerance means', () => {
  assert.equal(colorDistance(0, 0, 0, 255, 0, 0, 0, 255), 0)
  assert.equal(colorDistance(10, 0, 0, 255, 0, 0, 0, 255), 10)
  // The largest single-channel gap wins, not the sum.
  assert.equal(colorDistance(10, 20, 30, 255, 0, 0, 0, 255), 30)
  // Alpha counts, so a transparent pixel is far from an opaque one of the same colour.
  assert.equal(colorDistance(0, 0, 0, 0, 0, 0, 0, 255), 255)
})
