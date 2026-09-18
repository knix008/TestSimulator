// Colour spaces, profiles and bit depth.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as UTIF from 'utif'
import {
  applyColorMode, builtInProfiles, cmykToRgb, convertProfile, iccFromJpeg, labToRgb, parseIccProfile,
  rgbToCmyk, rgbToLab, srgbToLinear, linearToSrgb,
} from '../src/lib/colorModes.ts'
import {
  canvasFromDeep, deepExposure, deepFromCanvas, deepFromUint16, deepLevels, encodeTiff16,
  uint16FromDeep,
} from '../src/lib/depth.ts'
import { assertNear, assertPixel, canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

/* ------------------------------------------------------------ conversions */

test('the sRGB transfer curve is its own inverse', () => {
  for (const value of [0, 12, 64, 128, 200, 255]) {
    assertNear(linearToSrgb(srgbToLinear(value)), value, 0.6, `round trip of ${value}`)
  }
})

test('Lab round trips back to the colour it came from', () => {
  for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [200, 30, 40], [20, 120, 220]]) {
    const lab = rgbToLab(r, g, b)
    const back = labToRgb(lab.l, lab.a, lab.b)
    assertNear(back.r, r, 1.2, 'red')
    assertNear(back.g, g, 1.2, 'green')
    assertNear(back.b, b, 1.2, 'blue')
  }
})

test('Lab reports the lightness and the axes the way it is defined', () => {
  const black = rgbToLab(0, 0, 0)
  const white = rgbToLab(255, 255, 255)
  assertNear(black.l, 0, 0.5, 'black is L 0')
  assertNear(white.l, 100, 0.5, 'white is L 100')
  assertNear(white.a, 0, 0.5, 'white has no colour cast')

  const red = rgbToLab(255, 0, 0)
  assert.ok(red.a > 60, `red is far along +a: ${red.a}`)
  const blue = rgbToLab(0, 0, 255)
  assert.ok(blue.b < -60, `blue is far along -b: ${blue.b}`)
})

test('CMYK round trips, and pulls out the black that all three inks share', () => {
  const ink = rgbToCmyk(0, 0, 0)
  assert.deepEqual(ink, { c: 0, m: 0, y: 0, k: 1 }, 'black is all key and no colour')

  for (const [r, g, b] of [[255, 255, 255], [200, 30, 40], [10, 90, 180]]) {
    const cmyk = rgbToCmyk(r, g, b)
    const back = cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k)
    assertNear(back.r, r, 1, 'red')
    assertNear(back.g, g, 1, 'green')
    assertNear(back.b, b, 1, 'blue')
  }
})

/* ------------------------------------------------------------ colour modes */

test('greyscale mode drains the colour and Lab mode does not', () => {
  const grey = canvasOf(4, 4, '#c83232')
  applyColorMode(grey, 'gray')
  const pixel = px(grey, 1, 1)
  assert.equal(pixel[0], pixel[1])
  assert.equal(pixel[1], pixel[2])

  const lab = canvasOf(4, 4, '#c83232')
  applyColorMode(lab, 'lab')
  assertPixel(lab, 1, 1, [200, 50, 50, 255], 2, 'Lab is a round trip, so the colour survives')
})

test('RGB mode is a no-op, and CMYK clips what ink cannot reach', () => {
  const rgb = canvasOf(4, 4, '#00ff66')
  applyColorMode(rgb, 'rgb')
  assert.deepEqual(px(rgb, 1, 1), [0, 255, 102, 255])

  const cmyk = canvasOf(4, 4, '#00ff66')
  applyColorMode(cmyk, 'cmyk')
  assert.equal(px(cmyk, 1, 1)[3], 255, 'the picture is still opaque')
})

/* --------------------------------------------------------------- profiles */

test('converting between working spaces changes the numbers to keep the colour', () => {
  const canvas = canvasOf(4, 4, '#c83232')
  convertProfile(canvas, builtInProfiles.adobeRgb, builtInProfiles.srgb)
  const pixel = px(canvas, 1, 1)
  // Adobe RGB has a wider red primary, so the same numbers mean a stronger red;
  // in sRGB that has to be written as a *higher* number.
  assert.ok(pixel[0] >= 200, `red should not be weakened: ${pixel}`)
  assert.notDeepEqual(pixel, [200, 50, 50, 255], 'something must have changed')
})

test('converting a space into itself leaves every pixel alone', () => {
  const canvas = canvasFrom(4, 4, (x, y) => [x * 60, y * 60, 120, 255])
  const before = px(canvas, 2, 2)
  convertProfile(canvas, builtInProfiles.srgb, builtInProfiles.srgb)
  assert.deepEqual(px(canvas, 2, 2), before)
})

/** The smallest ICC profile the reader should accept: three colourants and a gamma. */
function iccProfile() {
  const tags = [
    ['rXYZ', [0.4124564, 0.2126729, 0.0193339]],
    ['gXYZ', [0.3575761, 0.7151522, 0.1191920]],
    ['bXYZ', [0.1804375, 0.0721750, 0.9503041]],
  ]
  const headerSize = 132
  const tableSize = tags.length * 12 + 12
  const xyzSize = 20
  const size = headerSize + tableSize + tags.length * xyzSize + 16
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, size)
  view.setUint32(128, tags.length + 1)

  let dataAt = headerSize + tableSize
  const signature = (at, text) => {
    for (let i = 0; i < 4; i += 1) bytes[at + i] = text.charCodeAt(i)
  }
  tags.forEach(([name, xyz], index) => {
    const entry = 132 + index * 12
    signature(entry, name)
    view.setUint32(entry + 4, dataAt)
    view.setUint32(entry + 8, xyzSize)
    signature(dataAt, 'XYZ ')
    xyz.forEach((value, axis) => view.setInt32(dataAt + 8 + axis * 4, Math.round(value * 65536)))
    dataAt += xyzSize
  })
  // The tone curve, as a single gamma of 2.2 in u8Fixed8.
  const curveEntry = 132 + tags.length * 12
  signature(curveEntry, 'rTRC')
  view.setUint32(curveEntry + 4, dataAt)
  view.setUint32(curveEntry + 8, 14)
  signature(dataAt, 'curv')
  view.setUint32(dataAt + 8, 1)
  view.setUint16(dataAt + 12, Math.round(2.2 * 256))
  return bytes
}

test('a matrix-shaper ICC profile is read back out of its bytes', () => {
  const profile = parseIccProfile(iccProfile())
  assert.ok(profile, 'the profile was understood')
  assertNear(profile.gamma, 2.2, 0.02, 'gamma')
  assertNear(profile.matrix[0], 0.4124564, 0.001, 'the red primary')
  assertNear(profile.matrix[4], 0.7151522, 0.001, 'the green primary')
})

test('rubbish is refused rather than read as a profile', () => {
  assert.equal(parseIccProfile(new Uint8Array(8)), null)
  assert.equal(parseIccProfile(new Uint8Array(200)), null, 'a profile with no colourants cannot be applied')
})

test('an ICC profile is found in a JPEG that carries one', () => {
  const profile = iccProfile()
  const segment = 2 + 12 + 2 + profile.length
  const jpeg = new Uint8Array(4 + segment + 2)
  jpeg[0] = 0xff
  jpeg[1] = 0xd8
  jpeg[2] = 0xff
  jpeg[3] = 0xe2
  jpeg[4] = (segment >> 8) & 0xff
  jpeg[5] = segment & 0xff
  for (const [i, character] of [...'ICC_PROFILE'].entries()) jpeg[6 + i] = character.charCodeAt(0)
  jpeg[17] = 0
  jpeg[18] = 1
  jpeg[19] = 1
  jpeg.set(profile, 20)
  jpeg[jpeg.length - 2] = 0xff
  jpeg[jpeg.length - 1] = 0xd9

  const found = iccFromJpeg(jpeg)
  assert.ok(found, 'the APP2 segment was found')
  assert.ok(parseIccProfile(found), 'and what it held was a profile')
  assert.equal(iccFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null, 'a JPEG without one says so')
})

/* ------------------------------------------------------------- bit depth */

test('a deep buffer keeps precision an 8-bit canvas would round away', () => {
  const buffer = deepFromCanvas(canvasOf(2, 2, '#808080'))
  // Five gentle exposure nudges: in eight bits each one rounds, and the error
  // compounds; in the deep buffer they simply multiply.
  for (let i = 0; i < 5; i += 1) deepExposure(buffer, 0.05)
  const expected = (128 / 255) * Math.pow(2, 0.25)
  assertNear(buffer.data[0], expected, 0.002, 'five nudges land where one big one would')
})

test('levels in full precision stretch without banding the midtones', () => {
  const buffer = deepFromCanvas(canvasFrom(4, 1, (x) => [100 + x * 4, 100 + x * 4, 100 + x * 4, 255]))
  // The four tones are 100, 104, 108 and 112, so those are the end points.
  deepLevels(buffer, 100, 1, 112)
  const steps = [0, 1, 2, 3].map((x) => buffer.data[x * 4])
  assert.ok(steps[0] < steps[1] && steps[1] < steps[2] && steps[2] < steps[3], 'the four tones stay distinct')
  assertNear(steps[0], 0, 0.02, 'the darkest tone reaches black')
  assertNear(steps[3], 1, 0.02, 'the lightest reaches white')
})

test('the deep buffer converts to and from 16-bit samples without loss', () => {
  const canvas = canvasFrom(4, 3, (x, y) => [x * 60, y * 80, 120, 255])
  const buffer = deepFromCanvas(canvas)
  const samples = uint16FromDeep(buffer)
  assert.equal(samples.length, 4 * 3 * 4)
  const back = deepFromUint16(samples, 4, 3, 4)
  for (let i = 0; i < buffer.data.length; i += 1) {
    assert.ok(Math.abs(back.data[i] - buffer.data[i]) < 1e-4, `sample ${i} survived`)
  }
  assertPixel(canvasFromDeep(buffer), 2, 1, px(canvas, 2, 1), 1, 'and back to an 8-bit view')
})

test('the 16-bit TIFF it writes is one a TIFF reader understands', () => {
  const canvas = canvasFrom(4, 3, (x, y) => [x * 60, y * 80, 120, 255])
  const bytes = encodeTiff16(deepFromCanvas(canvas))
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const ifds = UTIF.decode(buffer)
  UTIF.decodeImage(buffer, ifds[0])

  assert.equal(ifds[0].width, 4)
  assert.equal(ifds[0].height, 3)
  assert.deepEqual([...ifds[0].t258], [16, 16, 16, 16], 'four channels of sixteen bits')
  const rgba = UTIF.toRGBA8(ifds[0])
  assert.deepEqual([...rgba.slice(0, 3)], [0, 0, 120], 'and the pixels came back')
})
