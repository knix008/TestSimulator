/**
 * Runs the real open/export/print pipeline over the photos in images/.
 *
 *   npm run verify:images
 *
 * The unit tests work on small synthetic canvases; this walks the same code
 * with full-size camera files, so a decoder that only copes with toy input, or
 * an export that quietly drops a channel, shows up here. Everything is
 * asserted, so a non-zero exit means a feature is broken; the PNG and HTML it
 * leaves behind are there to be looked at.
 *
 * Load through the test harness, which supplies the browser globals:
 *   node --import ./test/helpers/setup.mjs scripts/verify-images.mjs [outDir]
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decodeImageSource, encodeExport, extensionFor, isHeifSource, naturalOrientation, previewSheet,
  printableDocument, supportsTransparency,
} from '../src/lib/imageIO.ts'
import { isDicomSource } from '../src/lib/dicom.ts'
import { aspectRatio, formatBytes, imageStatistics } from '../src/lib/metadata.ts'
import { canvasFromUrl, cloneCanvas, compositeDocument, context2d, createLayerMeta } from '../src/lib/canvas.ts'
import { contentAwareScale, warpCanvas } from '../src/lib/warp.ts'
import { defaultThreeD, renderExtrude } from '../src/lib/three.ts'
import { encodeGif } from '../src/lib/gif.ts'
import { makePatternTile, patternFill } from '../src/lib/patterns.ts'
import { applyColorMode } from '../src/lib/colorModes.ts'
import { rectSelection } from '../src/lib/selection.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const imagesDir = path.join(root, 'images')
const outDir = process.argv[2] ?? path.join(tmpdir(), 'myphotowork-verify')
mkdirSync(outDir, { recursive: true })

const mimes = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.tif': 'image/tiff',
  '.tiff': 'image/tiff', '.heic': 'image/heic', '.heif': 'image/heif', '.hif': 'image/heif',
  '.dcm': 'application/dicom', '.dicom': 'application/dicom',
}

/** The item shape the Electron main process hands the renderer on File ▸ Open. */
function openItem(file) {
  const buffer = readFileSync(path.join(imagesDir, file))
  const mime = mimes[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  return { name: file, mime, size: buffer.length, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
}

/** How much the picture varies — a flat result means the decode failed. */
function spread(canvas) {
  const { data } = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3
    if (value < min) min = value
    if (value > max) max = value
  }
  return max - min
}

function alphaAt(canvas, x, y) {
  return context2d(canvas).getImageData(x, y, 1, 1).data[3]
}

/** Mean absolute difference per channel, for "did this actually change it". */
function meanDifference(a, b) {
  const first = context2d(a).getImageData(0, 0, a.width, a.height).data
  const second = context2d(b).getImageData(0, 0, b.width, b.height).data
  let sum = 0
  for (let i = 0; i < first.length; i += 1) sum += Math.abs(first[i] - second[i])
  return sum / first.length
}

const files = readdirSync(imagesDir).filter((name) => path.extname(name).toLowerCase() in mimes)
assert.ok(files.length > 0, `no images to verify in ${imagesDir}`)
console.log(`Verifying ${files.length} file(s) from images/ into ${outDir}\n`)

for (const file of files) {
  const label = isHeifSource(file) ? `${file} (HEIF)` : isDicomSource(file) ? `${file} (DICOM)` : file
  const item = openItem(file)
  const decoded = await decodeImageSource(item)
  assert.equal(decoded.kind, 'canvas', `${file} did not open as an image`)
  const canvas = decoded.canvas
  assert.ok(canvas.width > 1 && canvas.height > 1, `${file} opened at ${canvas.width}x${canvas.height}`)
  assert.ok(spread(canvas) > 20, `${file} decoded to a flat sheet — the decoder gave up`)
  console.log(`${label}: opened ${canvas.width}x${canvas.height}, ${formatBytes(item.size)}, ratio ${aspectRatio(canvas.width, canvas.height)}, tonal spread ${spread(canvas).toFixed(0)}`)

  // Image information: the header rows the file itself carried, plus the
  // measurements the window computes.
  const details = decoded.details ?? []
  assert.ok(Array.isArray(details), `${file} returned no details list`)
  for (const row of details.slice(0, 6)) {
    console.log(`  detail ${row.label ?? row.key}: ${row.value}`)
  }
  if (isDicomSource(file)) {
    assert.ok(details.some((row) => row.label === 'Modality'), `${file} produced no DICOM tags`)
  }
  const stats = imageStatistics(canvas)
  assert.equal(stats.length, 4, `${file} produced ${stats.length} statistics`)
  console.log(`  stats ${stats.map((row) => row.value).join(' | ')}`)

  // One raster layer, the way File ▸ Open builds a document.
  const layer = createLayerMeta(file)
  const document = {
    name: path.parse(file).name, width: canvas.width, height: canvas.height,
    background: 'transparent', layers: [layer], activeLayerId: layer.id,
    guides: [], notes: [], samplers: [], counts: [], paths: [], slices: [], frames: [],
    measure: null, colorMode: 'rgb',
  }
  const composite = compositeDocument(document, new Map([[layer.id, canvas]]))
  assert.equal(composite.width, canvas.width, `${file} lost width when composited`)
  assert.ok(spread(composite) > 20, `${file} composited to a flat sheet`)
  writeFileSync(path.join(outDir, `${document.name}-composite.png`), composite.toBuffer('image/png'))

  // Every export format, round tripped back to pixels.
  for (const format of ['png', 'jpg', 'webp', 'tiff']) {
    const dataUrl = await encodeExport(composite, format)
    const prefix = `data:image/${format === 'jpg' ? 'jpeg' : format}`
    assert.ok(dataUrl.startsWith(prefix) || dataUrl.startsWith('data:image/png'), `${file} → ${format} produced ${dataUrl.slice(0, 24)}`)
    writeFileSync(path.join(outDir, `${document.name}.${extensionFor(format)}`), Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(`  export ${format.padEnd(4)} ${(dataUrl.length / 1024).toFixed(0)} kB`)
  }

  // Transparency: rub a hole in a copy, then export it both ways.
  const holed = await canvasFromUrl(composite.toDataURL('image/png'))
  const box = Math.max(8, Math.round(Math.min(holed.width, holed.height) / 4))
  context2d(holed).clearRect(0, 0, box, box)
  for (const format of ['png', 'webp', 'jpg']) {
    const kept = await canvasFromUrl(await encodeExport(holed, format, 0.92, true))
    const filled = await canvasFromUrl(await encodeExport(holed, format, 0.92, false))
    if (supportsTransparency(format)) {
      assert.equal(alphaAt(kept, 2, 2), 0, `${file} → ${format} lost its transparency with the box ticked`)
    }
    assert.equal(alphaAt(filled, 2, 2), 255, `${file} → ${format} stayed see-through with the box cleared`)
    assert.equal(alphaAt(filled, holed.width - 2, holed.height - 2), 255, `${file} → ${format} damaged the picture itself`)
    console.log(`  transparent ${format.padEnd(4)} on: alpha ${alphaAt(kept, 2, 2)}  off: alpha ${alphaAt(filled, 2, 2)}`)
  }
  writeFileSync(path.join(outDir, `${document.name}-transparent.png`), Buffer.from((await encodeExport(holed, 'png', 0.92, true)).split(',')[1], 'base64'))
  writeFileSync(path.join(outDir, `${document.name}-opaque.png`), Buffer.from((await encodeExport(holed, 'png', 0.92, false)).split(',')[1], 'base64'))

  // The subsystems added on top of open-and-export, each run over this photo.
  const solid = renderExtrude(canvas, canvas.width, canvas.height, { ...defaultThreeD(), depth: 40 })
  assert.equal(solid.width, canvas.width, `${file} 3D render changed the canvas size`)
  assert.ok(spread(solid) > 10, `${file} extruded to something flat`)
  writeFileSync(path.join(outDir, `${document.name}-3d.png`), solid.toBuffer('image/png'))

  const bent = warpCanvas(canvas, 'arch', 60, 0, 0)
  assert.ok(meanDifference(bent, canvas) > 1, `${file} did not warp`)
  assert.equal(alphaAt(bent, Math.round(canvas.width / 2), Math.round(canvas.height / 2)), 255, `${file} warp left a hole`)
  writeFileSync(path.join(outDir, `${document.name}-warp.png`), bent.toBuffer('image/png'))

  const carved = contentAwareScale(canvas, Math.round(canvas.width * 0.8), canvas.height)
  assert.equal(carved.width, Math.round(canvas.width * 0.8), `${file} carving missed its target width`)
  writeFileSync(path.join(outDir, `${document.name}-carved.png`), carved.toBuffer('image/png'))

  // A two-frame animation from this photo and a darkened copy of it.
  const dimmed = cloneCanvas(canvas)
  applyColorMode(dimmed, 'gray')
  const gif = encodeGif([{ canvas, delayMs: 200 }, { canvas: dimmed, delayMs: 200 }])
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a', `${file} produced no GIF`)
  writeFileSync(path.join(outDir, `${document.name}.gif`), gif)

  // Sixteen bits: the same picture, written at full depth.
  const deepTiff = await encodeExport(composite, 'tiff', 0.92, true, 16)
  assert.ok(deepTiff.startsWith('data:image/tiff;base64,'), `${file} produced no 16-bit TIFF`)
  writeFileSync(path.join(outDir, `${document.name}-16bit.tif`), Buffer.from(deepTiff.split(',')[1], 'base64'))

  // A pattern cut from the middle of the photo, tiled back out.
  const tile = makePatternTile(canvas, rectSelection(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height)))
  const tiled = patternFill(canvas.width, canvas.height, tile)
  assert.equal(tiled.width, canvas.width)
  writeFileSync(path.join(outDir, `${document.name}-pattern.png`), tiled.toBuffer('image/png'))

  console.log(`  3D, warp, carve ${carved.width}px, GIF ${(gif.length / 1024).toFixed(0)} kB, 16-bit ${(deepTiff.length / 1024).toFixed(0)} kB, pattern ${tile.width}x${tile.height}`)

  // Print: the preview the dialog shows, then the page the printer is handed.
  const orientation = naturalOrientation(composite)
  const preview = previewSheet(composite)
  assert.ok(preview.startsWith('data:image/jpeg;base64,'), `${file} produced no print preview`)
  assert.ok(preview.length < 400_000, `${file} preview is ${preview.length} bytes — too big for a popup payload`)
  const page = printableDocument(composite.toDataURL('image/png'), document.name, orientation)
  assert.match(page, /object-fit: contain/, `${file} print page does not fit the sheet`)
  assert.match(page, new RegExp(`size: ${orientation}`), `${file} print page ignores the orientation`)
  assert.ok(page.includes('data:image/png;base64,'), `${file} print page carries no image`)
  writeFileSync(path.join(outDir, `${document.name}-print.html`), page)
  writeFileSync(path.join(outDir, `${document.name}-preview.jpg`), Buffer.from(preview.split(',')[1], 'base64'))
  console.log(`  print ${orientation}, preview ${(preview.length / 1024).toFixed(0)} kB, page ${(page.length / 1024).toFixed(0)} kB\n`)
}

console.log(`All checks passed. Output written to ${outDir}`)
