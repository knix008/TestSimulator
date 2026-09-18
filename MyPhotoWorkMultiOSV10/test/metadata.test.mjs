// The facts behind the image information window: what a file's own header says
// about it, and what the pixels measure.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  aspectRatio, describeFile, formatBytes, formatName, imageStatistics, readJpegExif,
} from '../src/lib/metadata.ts'
import { canvasFrom, canvasOf } from './helpers/pixels.mjs'

/* ------------------------------------------------- a JPEG with EXIF in it */

/**
 * Builds the smallest JPEG that carries EXIF: SOI, one APP1 segment holding a
 * little-endian TIFF block, EOI. IFD0 names the camera and points at an Exif
 * sub-directory with the exposure in it, which is the layout a real camera
 * writes and the one the reader has to walk.
 */
function exifJpeg() {
  const tiff = new Uint8Array(114)
  const view = new DataView(tiff.buffer)
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) tiff[offset + i] = text.charCodeAt(i)
  }
  const entry = (at, tag, type, count, value) => {
    view.setUint16(at, tag, true)
    view.setUint16(at + 2, type, true)
    view.setUint32(at + 4, count, true)
    view.setUint32(at + 8, value, true)
  }

  ascii(0, 'II')
  view.setUint16(2, 42, true)
  view.setUint32(4, 8, true) // IFD0 starts here

  view.setUint16(8, 3, true) // three entries
  entry(10, 0x010f, 2, 6, 50) // Make, too long to sit inline
  entry(22, 0x0110, 2, 4, 0) // Model fits in the four value bytes...
  ascii(30, 'Z 6') // ...which are written over directly
  entry(34, 0x8769, 4, 1, 56) // pointer to the Exif sub-directory
  view.setUint32(46, 0, true) // no IFD1
  ascii(50, 'Nikon')

  view.setUint16(56, 3, true)
  entry(58, 0x829a, 5, 1, 98) // ExposureTime, a rational out of line
  entry(70, 0x829d, 5, 1, 106) // FNumber
  entry(82, 0x8827, 3, 1, 200) // ISO, inline
  view.setUint32(94, 0, true)
  view.setUint32(98, 1, true)
  view.setUint32(102, 125, true) // 1/125 s
  view.setUint32(106, 28, true)
  view.setUint32(110, 10, true) // f/2.8

  // SOI, the APP1 marker and its length, "Exif\0\0", the TIFF block, then EOI.
  const header = new Uint8Array(12 + tiff.length + 2)
  header[0] = 0xff
  header[1] = 0xd8 // SOI
  header[2] = 0xff
  header[3] = 0xe1 // APP1
  const segment = 2 + 6 + tiff.length
  header[4] = segment >> 8
  header[5] = segment & 0xff
  for (const [i, code] of [...'Exif'].entries()) header[6 + i] = code.charCodeAt(0)
  header.set(tiff, 12)
  header[header.length - 2] = 0xff
  header[header.length - 1] = 0xd9 // EOI
  return header
}

function value(rows, label) {
  return rows.find((row) => row.label === label)?.value
}

test('EXIF is read out of a JPEG, including the Exif sub-directory', () => {
  const rows = readJpegExif(exifJpeg())
  assert.equal(value(rows, 'Camera'), 'Nikon Z 6')
  assert.equal(value(rows, 'Exposure'), '1/125 s', 'a rational becomes the fraction photographers use')
  assert.equal(value(rows, 'Aperture'), 'f/2.8')
  assert.equal(value(rows, 'ISO'), 'ISO 200')
})

test('describeFile picks the reader from the file itself, not its name', () => {
  const jpeg = exifJpeg()
  assert.equal(value(describeFile('mystery', undefined, jpeg.buffer), 'Camera'), 'Nikon Z 6')
  assert.deepEqual(readJpegExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), [], 'a PNG has no EXIF to find')
})

test('a JPEG with no EXIF is reported as having none, not guessed at', () => {
  const plain = readFileSync(fileURLToPath(new URL('../images/test01.jpg', import.meta.url)))
  const buffer = plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength)
  assert.deepEqual(describeFile('test01.jpg', 'image/jpeg', buffer), [])
})

test('a truncated EXIF segment is ignored rather than read past its end', () => {
  const short = exifJpeg().slice(0, 40)
  assert.deepEqual(readJpegExif(short), [])
})

/* -------------------------------------------------------------- containers */

test('a PNG header gives its size, depth and colour type', () => {
  const source = canvasOf(8, 5, '#3366cc')
  const base64 = source.toDataURL('image/png').split(',')[1]
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  const rows = describeFile('swatch.png', 'image/png', bytes.buffer)
  assert.equal(value(rows, 'Pixels'), '8 x 5')
  assert.equal(value(rows, 'Bit depth'), '8 bits per channel')
  assert.match(value(rows, 'Colour type'), /Truecolour/)
})

/* ------------------------------------------------------------- formatting */

test('sizes are given in the unit that reads best', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(2048), '2.0 kB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB')
})

test('an aspect ratio is reduced, unless reducing it says nothing', () => {
  assert.equal(aspectRatio(1920, 1080), '16 : 9')
  assert.equal(aspectRatio(800, 600), '4 : 3')
  assert.equal(aspectRatio(512, 512), '1 : 1')
  // 1344:1007 is arithmetic, not information.
  assert.equal(aspectRatio(4032, 3021), '1.33 : 1')
})

test('the format is named from the extension, and falls back to the type', () => {
  assert.equal(formatName('holiday.HEIC'), 'HEIC')
  assert.equal(formatName('IM_0001', 'application/dicom'), 'application/dicom')
})

/* ------------------------------------------------------------- statistics */

test('the statistics measure the picture, not the canvas', () => {
  // Left half mid-grey and opaque, right half fully clear.
  const canvas = canvasFrom(4, 2, (x) => (x < 2 ? [100, 150, 200, 255] : [0, 0, 0, 0]))
  const rows = imageStatistics(canvas)
  const stat = (key) => rows.find((row) => row.key === key)?.value

  assert.equal(stat('infoMeanRgb'), '50, 75, 100', 'clear pixels count as zero, which is what they are')
  assert.equal(stat('infoTransparent'), '50.0% / 0.0%', 'half the canvas is see-through, none of it partly')
  assert.equal(stat('infoRange'), '0 – 141')
})

test('partial transparency is counted apart from full transparency', () => {
  const canvas = canvasFrom(2, 2, (x, y) => [255, 255, 255, y === 0 ? 128 : 255])
  const rows = imageStatistics(canvas)
  assert.equal(rows.find((row) => row.key === 'infoTransparent')?.value, '0.0% / 50.0%')
})
