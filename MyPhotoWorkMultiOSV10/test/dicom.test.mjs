// DICOM reading: the tag set, and the arithmetic that turns stored values into
// something a screen can show. A medical image that comes out blank, inverted
// or flat is still a picture, so these check the pixels, not just the size.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hasDicomMagic, isDicomSource, readDicom } from '../src/lib/dicom.ts'
import { decodeImageSource } from '../src/lib/imageIO.ts'
import { px } from './helpers/pixels.mjs'

/** The CT slice shipped in images/, read straight off disk. */
function dicomBytes() {
  const buffer = readFileSync(fileURLToPath(new URL('../images/test05.dcm', import.meta.url)))
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function rowValue(details, label) {
  return details.find((row) => row.label === label)?.value
}

test('isDicomSource recognises .dcm by name and by type', () => {
  assert.ok(isDicomSource('scan.dcm'))
  assert.ok(isDicomSource('SCAN.DICOM'))
  assert.ok(isDicomSource('anything', 'application/dicom'))
  assert.ok(!isDicomSource('photo.jpg'))
  assert.ok(!isDicomSource('photo.png', 'image/png'))
})

test('the DICM magic is read at byte 128, not at the start of the file', () => {
  const bytes = new Uint8Array(dicomBytes())
  assert.ok(hasDicomMagic(bytes.buffer), 'the sample should be recognised')
  assert.ok(!hasDicomMagic(new Uint8Array(200).buffer), 'an empty buffer is not DICOM')
  assert.ok(!hasDicomMagic(new Uint8Array(8).buffer), 'a short buffer is not DICOM')

  // The same bytes, one byte out of place, must not be taken for DICOM.
  const shifted = bytes.slice(1)
  assert.ok(!hasDicomMagic(shifted.buffer.slice(shifted.byteOffset, shifted.byteOffset + shifted.byteLength)))
})

test('a CT slice decodes to a grey image with the windowing applied', async () => {
  const { canvas } = await readDicom(dicomBytes())
  assert.equal(canvas.width, 512)
  assert.equal(canvas.height, 512)

  // MONOCHROME2 with no window in the file: windowed from the data's own range,
  // which has to produce grey, opaque pixels that are not all the same.
  const middle = px(canvas, 256, 256)
  assert.equal(middle[0], middle[1], 'a monochrome slice must be grey')
  assert.equal(middle[1], middle[2], 'a monochrome slice must be grey')
  assert.equal(middle[3], 255, 'the slice is opaque')

  const corner = px(canvas, 2, 2)
  assert.notEqual(corner[0], middle[0], 'the image is flat — the window was not applied')
  assert.ok(middle[0] > corner[0], 'the patient should be brighter than the air around them')
})

test('the tag set is read out for the image information window', async () => {
  const { details } = await readDicom(dicomBytes())
  assert.equal(rowValue(details, 'Modality'), 'CT')
  assert.equal(rowValue(details, 'Manufacturer'), 'GE MEDICAL SYSTEMS')
  assert.equal(rowValue(details, 'Transfer syntax'), 'Explicit VR Little Endian')
  assert.match(rowValue(details, 'Image'), /512 x 512, 16-bit MONOCHROME2/)
  assert.match(rowValue(details, 'Study date'), /^2004-08-26$/, 'DICOM dates are shown the way people write them')

  // Repeated values are separated with a backslash in the file itself.
  assert.match(rowValue(details, 'Pixel spacing'), / \/ /, 'a multi-valued tag should read as a list')
  assert.ok(!rowValue(details, 'Pixel spacing').includes('\\'))
})

test('decodeImageSource routes a .dcm file through the DICOM reader', async () => {
  const arrayBuffer = dicomBytes()
  const byName = await decodeImageSource({ name: 'series-1.dcm', arrayBuffer })
  assert.equal(byName.kind, 'canvas')
  assert.equal(byName.canvas.width, 512)
  assert.ok(byName.details.some((row) => row.label === 'Modality'), 'the tags travel with the image')

  // Windows has no MIME type for DICOM, and the extension is often missing
  // entirely, so the magic alone has to be enough.
  const byMagic = await decodeImageSource({ name: 'IM_0001', arrayBuffer })
  assert.equal(byMagic.canvas.height, 512)
})

test('a file that only claims to be DICOM fails with a clear message', async () => {
  const bytes = new TextEncoder().encode('no preamble, no DICM, no data set here at all')
  await assert.rejects(
    () => decodeImageSource({ name: 'scan.dcm', arrayBuffer: bytes.buffer }),
    /not a DICOM file/,
  )
})
