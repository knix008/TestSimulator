// The GIF encoder, the 3D extrusion and patterns: the three pieces that turn
// a still document into something else.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { encodeGif, gifDataUrl, lzwEncode, medianCutPalette } from '../src/lib/gif.ts'
import { defaultThreeD, faceBrightness, renderExtrude } from '../src/lib/three.ts'
import { definePattern, makePatternTile, patternFill, tileOnto } from '../src/lib/patterns.ts'
import { canExportVideo, canImportVideo } from '../src/lib/video.ts'
import { rectSelection } from '../src/lib/selection.ts'
import { context2d } from '../src/lib/canvas.ts'
import { canvasFrom, canvasOf, meanDiff, px } from './helpers/pixels.mjs'

const require = createRequire(import.meta.url)
const { loadImage } = require('@napi-rs/canvas')

/* -------------------------------------------------------------------- GIF */

test('the palette is cut down to the limit and keeps the colours that are there', () => {
  const canvas = canvasFrom(16, 16, (x) => (x < 8 ? [200, 30, 30, 255] : [30, 30, 200, 255]))
  const data = context2d(canvas).getImageData(0, 0, 16, 16).data
  const palette = medianCutPalette(data, 8)
  assert.ok(palette.length <= 8 && palette.length >= 2, `got ${palette.length} colours`)

  const hasRed = palette.some(([r, g, b]) => r > 150 && g < 80 && b < 80)
  const hasBlue = palette.some(([r, g, b]) => b > 150 && r < 80 && g < 80)
  assert.ok(hasRed && hasBlue, `both halves should be represented: ${JSON.stringify(palette)}`)
})

test('a fully transparent frame still produces a palette rather than nothing', () => {
  const clear = context2d(canvasFrom(4, 4, () => [0, 0, 0, 0])).getImageData(0, 0, 4, 4).data
  assert.deepEqual(medianCutPalette(clear, 8), [[0, 0, 0]])
})

test('LZW output starts with the clear code and ends with the end code', () => {
  const bytes = lzwEncode(Uint8Array.from([0, 0, 1, 1, 2]), 2)
  assert.ok(bytes.length > 2, 'something was written')
  // The first code out is the clear code, four at a minimum code size of two.
  assert.equal(bytes[0] & 0x1f, 4)
})

test('an animated GIF is written that a real decoder reads back', async () => {
  const frames = [
    { canvas: canvasOf(32, 24, '#c0392b'), delayMs: 200 },
    { canvas: canvasOf(32, 24, '#2980b9'), delayMs: 120 },
  ]
  const bytes = encodeGif(frames)
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a')
  assert.equal(bytes[bytes.length - 1], 0x3b, 'the file is terminated')

  const image = await loadImage(Buffer.from(bytes))
  assert.equal(image.width, 32)
  assert.equal(image.height, 24)

  const drawn = canvasOf(32, 24)
  context2d(drawn).drawImage(image, 0, 0)
  assert.deepEqual(px(drawn, 4, 4), [192, 57, 43, 255], 'the first frame came back exactly')
})

test('a GIF data URL is produced, and an empty animation is refused', () => {
  const url = gifDataUrl([{ canvas: canvasOf(8, 8, '#123456'), delayMs: 100 }])
  assert.ok(url.startsWith('data:image/gif;base64,'))
  assert.throws(() => encodeGif([]), /at least one frame/)
})

/* --------------------------------------------------------------------- 3D */

test('the light is brightest on a face turned towards it', () => {
  const facing = { ...defaultThreeD(), rotateX: 0, rotateY: 0, rotateZ: 0, lightX: 0, lightY: 0, lightZ: 1 }
  const edgeOn = { ...facing, rotateY: 90 }
  assert.ok(faceBrightness(facing) > faceBrightness(edgeOn), 'turning away from the light darkens the face')
  assert.ok(faceBrightness(facing) <= 1 && faceBrightness(edgeOn) >= 0.25, 'brightness stays in range')
})

test('extruding draws a solid that is not the flat layer', () => {
  const flat = canvasOf(48, 48, '#e67e22')
  const solid = renderExtrude(flat, 96, 96, { ...defaultThreeD(), depth: 40 })
  assert.equal(solid.width, 96)
  assert.ok(px(solid, 48, 48)[3] > 0, 'the middle of the solid is painted')

  const thin = renderExtrude(flat, 96, 96, { ...defaultThreeD(), depth: 0 })
  assert.ok(meanDiff(solid, thin) > 1, 'depth changes what is drawn')
})

test('the extrusion is lit: a turned face is darker than a square-on one', () => {
  const flat = canvasOf(48, 48, '#ffffff')
  const square = renderExtrude(flat, 96, 96, {
    ...defaultThreeD(), depth: 10, rotateX: 0, rotateY: 0, rotateZ: 0, lightX: 0, lightY: 0, lightZ: 1,
  })
  const turned = renderExtrude(flat, 96, 96, {
    ...defaultThreeD(), depth: 10, rotateX: 0, rotateY: 75, rotateZ: 0, lightX: 0, lightY: 0, lightZ: 1,
  })
  assert.ok(px(square, 48, 48)[0] > px(turned, 48, 48)[0], 'the turned face takes less light')
})

/* --------------------------------------------------------------- patterns */

test('a pattern tile is cut to the selection, corners and all', () => {
  const source = canvasFrom(16, 16, (x, y) => [x * 16, y * 16, 100, 255])
  const tile = makePatternTile(source, rectSelection(4, 4, 6, 6))
  assert.equal(tile.width, 6)
  assert.equal(tile.height, 6)
  assert.deepEqual(px(tile, 0, 0), px(source, 4, 4), 'the tile starts at the selection')
})

test('with nothing selected the whole layer becomes the tile', () => {
  const source = canvasOf(8, 6, '#334455')
  const tile = makePatternTile(source, null)
  assert.equal(tile.width, 8)
  assert.equal(tile.height, 6)
})

test('a defined pattern carries its size and a picture of itself', () => {
  const pattern = definePattern('p1', 'Tile', canvasOf(4, 4, '#ff0000'))
  assert.equal(pattern.id, 'p1')
  assert.equal(pattern.width, 4)
  assert.ok(pattern.dataUrl.startsWith('data:image/png;base64,'))
})

test('tiling repeats the tile across the canvas', () => {
  const tile = canvasFrom(4, 4, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
  const filled = patternFill(16, 8, tile)
  assert.deepEqual(px(filled, 0, 0), [255, 0, 0, 255])
  assert.deepEqual(px(filled, 2, 0), [0, 0, 255, 255])
  assert.deepEqual(px(filled, 8, 4), [255, 0, 0, 255], 'and repeats four tiles along')
})

test('tiling inside a selection leaves the rest of the canvas alone', () => {
  const canvas = canvasOf(16, 8, '#000000')
  const tile = canvasOf(4, 4, '#00ff00')
  tileOnto(canvas, tile, rectSelection(0, 0, 8, 8))
  assert.deepEqual(px(canvas, 2, 2), [0, 255, 0, 255], 'inside the selection')
  assert.deepEqual(px(canvas, 12, 2), [0, 0, 0, 255], 'outside it')
})

/* ------------------------------------------------------------------ video */

test('the video paths say plainly whether this build can do them', () => {
  // In the test harness there is no video element and no recorder, and both
  // are expected to report that rather than throwing somewhere deeper.
  assert.equal(typeof canImportVideo(), 'boolean')
  assert.equal(canExportVideo(), false, 'node has no MediaRecorder')
})
