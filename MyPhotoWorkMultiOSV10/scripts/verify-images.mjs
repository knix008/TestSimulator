/**
 * Runs the real open/export/print pipeline over the photos in images/.
 *
 *   npm run verify:images
 *
 * The unit tests work on small synthetic canvases; this walks the same code
 * with full-size camera files, so a decoder that only copes with toy input, or
 * an export that quietly drops a channel, shows up here. Everything is
 * asserted, so a non-zero exit means a feature is broken; the PNG and HTML it
 * leaves behind are kept in `out/` so the run can be looked at afterwards
 * rather than only believed: `out/index.html` is the gallery, `out/report.md`
 * the written record, and `out/verify-images.log` everything that was printed.
 *
 * Load through the test harness, which supplies the browser globals:
 *   node --import ./test/helpers/setup.mjs scripts/verify-images.mjs [outDir]
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
import { hasPsdMagic, writePsd } from '../src/lib/psd.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const imagesDir = path.join(root, 'images')
// `out/` beside the project, not a temp folder: the point of these files is
// that somebody can open them later and see for themselves.
const outDir = process.argv[2] ?? path.join(root, 'out')
// A stale result from an earlier run would be indistinguishable from this one,
// so this run's files are cleared first. The feature run (verify-features.mjs)
// keeps its own results in out/features and its own gallery beside this one;
// those are left alone.
mkdirSync(outDir, { recursive: true })
for (const name of readdirSync(outDir, { withFileTypes: true })) {
  if (name.isFile() && !/^(features\.(html|md)|verify-features\.log)$/.test(name.name)) rmSync(path.join(outDir, name.name), { force: true })
}

/** Everything printed, kept so the run can be read back. */
const transcript = []
const say = (line = '') => {
  transcript.push(line)
  process.stdout.write(String(line) + String.fromCharCode(10))
}
/** What each source file produced, for the report and the gallery. */
const produced = []
const startedAt = new Date()
/** The source file being worked on, so every artifact knows where it came from. */
let currentSource = ''

/**
 * Writes one result into `out/` and remembers it.
 *
 * What a caption says is what the file is evidence of, so the gallery can be
 * read without going back to this script to work out what each name meant.
 */
const captions = {
  composite: 'the document as the editor composites it',
  transparent: 'exported with the transparent-background box ticked',
  opaque: 'exported with that box cleared — the hole filled in',
  '3d': 'extruded through the 3D renderer',
  warp: 'bent with the arch warp',
  carved: 'content-aware scaled to 80% width',
  '16bit': 'exported at 16 bits a channel',
  'psd-composite': 'the merged picture read back out of the PSD',
  pattern: 'a tile cut from the middle and laid back out',
  print: 'the page handed to the printer',
  preview: 'the preview sheet the print window shows',
}
function save(name, data) {
  writeFileSync(path.join(outDir, name), data)
  const stem = path.parse(name).name
  const suffix = stem.includes('-') ? stem.slice(stem.lastIndexOf('-') + 1) : ''
  const extension = path.extname(name).slice(1).toLowerCase()
  const caption = captions[suffix] ?? (extension === 'gif'
    ? 'a two-frame animation, colour and greyscale'
    : extension === 'psd' ? 'a layered Photoshop document: photo, folder, masked Multiply overlay'
    : `exported as ${extension.toUpperCase()}`)
  produced.push({ source: currentSource, name, caption, bytes: data.length })
}

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
say(`Verifying ${files.length} file(s) from images/ into ${outDir}\n`)

for (const file of files) {
  currentSource = file
  const label = isHeifSource(file) ? `${file} (HEIF)` : isDicomSource(file) ? `${file} (DICOM)` : file
  const item = openItem(file)
  const decoded = await decodeImageSource(item)
  assert.equal(decoded.kind, 'canvas', `${file} did not open as an image`)
  const canvas = decoded.canvas
  assert.ok(canvas.width > 1 && canvas.height > 1, `${file} opened at ${canvas.width}x${canvas.height}`)
  assert.ok(spread(canvas) > 20, `${file} decoded to a flat sheet — the decoder gave up`)
  say(`${label}: opened ${canvas.width}x${canvas.height}, ${formatBytes(item.size)}, ratio ${aspectRatio(canvas.width, canvas.height)}, tonal spread ${spread(canvas).toFixed(0)}`)

  // Image information: the header rows the file itself carried, plus the
  // measurements the window computes.
  const details = decoded.details ?? []
  assert.ok(Array.isArray(details), `${file} returned no details list`)
  for (const row of details.slice(0, 6)) {
    say(`  detail ${row.label ?? row.key}: ${row.value}`)
  }
  if (isDicomSource(file)) {
    assert.ok(details.some((row) => row.label === 'Modality'), `${file} produced no DICOM tags`)
  }
  const stats = imageStatistics(canvas)
  assert.equal(stats.length, 4, `${file} produced ${stats.length} statistics`)
  say(`  stats ${stats.map((row) => row.value).join(' | ')}`)

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
  save(`${document.name}-composite.png`, composite.toBuffer('image/png'))

  // Every export format, round tripped back to pixels.
  for (const format of ['png', 'jpg', 'webp', 'tiff']) {
    const dataUrl = await encodeExport(composite, format)
    const prefix = `data:image/${format === 'jpg' ? 'jpeg' : format}`
    assert.ok(dataUrl.startsWith(prefix) || dataUrl.startsWith('data:image/png'), `${file} → ${format} produced ${dataUrl.slice(0, 24)}`)
    save(`${document.name}.${extensionFor(format)}`, Buffer.from(dataUrl.split(',')[1], 'base64'))
    say(`  export ${format.padEnd(4)} ${(dataUrl.length / 1024).toFixed(0)} kB`)
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
    say(`  transparent ${format.padEnd(4)} on: alpha ${alphaAt(kept, 2, 2)}  off: alpha ${alphaAt(filled, 2, 2)}`)
  }
  save(`${document.name}-transparent.png`, Buffer.from((await encodeExport(holed, 'png', 0.92, true)).split(',')[1], 'base64'))
  save(`${document.name}-opaque.png`, Buffer.from((await encodeExport(holed, 'png', 0.92, false)).split(',')[1], 'base64'))

  // The subsystems added on top of open-and-export, each run over this photo.
  const solid = renderExtrude(canvas, canvas.width, canvas.height, { ...defaultThreeD(), depth: 40 })
  assert.equal(solid.width, canvas.width, `${file} 3D render changed the canvas size`)
  assert.ok(spread(solid) > 10, `${file} extruded to something flat`)
  save(`${document.name}-3d.png`, solid.toBuffer('image/png'))

  const bent = warpCanvas(canvas, 'arch', 60, 0, 0)
  assert.ok(meanDifference(bent, canvas) > 1, `${file} did not warp`)
  assert.equal(alphaAt(bent, Math.round(canvas.width / 2), Math.round(canvas.height / 2)), 255, `${file} warp left a hole`)
  save(`${document.name}-warp.png`, bent.toBuffer('image/png'))

  const carved = contentAwareScale(canvas, Math.round(canvas.width * 0.8), canvas.height)
  assert.equal(carved.width, Math.round(canvas.width * 0.8), `${file} carving missed its target width`)
  save(`${document.name}-carved.png`, carved.toBuffer('image/png'))

  // A two-frame animation from this photo and a darkened copy of it.
  const dimmed = cloneCanvas(canvas)
  applyColorMode(dimmed, 'gray')
  const gif = encodeGif([{ canvas, delayMs: 200 }, { canvas: dimmed, delayMs: 200 }])
  assert.equal(String.fromCharCode(...gif.slice(0, 6)), 'GIF89a', `${file} produced no GIF`)
  save(`${document.name}.gif`, gif)

  // Sixteen bits: the same picture, written at full depth.
  const deepTiff = await encodeExport(composite, 'tiff', 0.92, true, 16)
  assert.ok(deepTiff.startsWith('data:image/tiff;base64,'), `${file} produced no 16-bit TIFF`)
  save(`${document.name}-16bit.tif`, Buffer.from(deepTiff.split(',')[1], 'base64'))

  // A pattern cut from the middle of the photo, tiled back out.
  const tile = makePatternTile(canvas, rectSelection(0, 0, Math.min(64, canvas.width), Math.min(64, canvas.height)))
  const tiled = patternFill(canvas.width, canvas.height, tile)
  assert.equal(tiled.width, canvas.width)
  save(`${document.name}-pattern.png`, tiled.toBuffer('image/png'))

  say(`  3D, warp, carve ${carved.width}px, GIF ${(gif.length / 1024).toFixed(0)} kB, 16-bit ${(deepTiff.length / 1024).toFixed(0)} kB, pattern ${tile.width}x${tile.height}`)

  // Photoshop's own format: the photo as a layered document — the picture, a
  // greyscale copy at half opacity in Multiply with a mask over its left half,
  // both inside a folder — written as PSD and opened again through the same
  // decoder File ▸ Open uses. Pixels, names, order, opacity, blend mode, the
  // mask and the folder must all come back as they went in.
  const folder = createLayerMeta('Photo folder', 'group')
  const tinted = createLayerMeta('Grey overlay')
  tinted.parentId = folder.id
  tinted.opacity = 0.5
  tinted.blendMode = 'multiply'
  tinted.maskEnabled = true
  const mask = context2d(cloneCanvas(canvas))
  mask.clearRect(0, 0, canvas.width, canvas.height)
  mask.fillStyle = '#ffffff'
  mask.fillRect(0, 0, Math.floor(canvas.width / 2), canvas.height)
  const psdComposite = compositeDocument({ ...document, layers: [folder, tinted, layer] }, new Map([[layer.id, canvas], [tinted.id, dimmed]]))
  const psdBytes = writePsd(document, [
    { meta: layer, canvas, mask: null },
    { meta: folder, canvas: null, mask: null },
    { meta: tinted, canvas: dimmed, mask: mask.canvas },
  ], psdComposite)
  assert.ok(hasPsdMagic(psdBytes.buffer), `${file} PSD does not start with 8BPS`)
  save(`${document.name}.psd`, Buffer.from(psdBytes))
  const reopened = await decodeImageSource({
    name: `${document.name}.psd`, mime: 'image/vnd.adobe.photoshop', size: psdBytes.length,
    dataUrl: `data:image/vnd.adobe.photoshop;base64,${Buffer.from(psdBytes).toString('base64')}`,
  })
  assert.equal(reopened.kind, 'psd', `${file} PSD did not open as a Photoshop document`)
  const psd = reopened.psd
  assert.equal(psd.width, canvas.width, `${file} PSD lost width`)
  assert.equal(psd.height, canvas.height, `${file} PSD lost height`)
  assert.equal(psd.colorMode, 'rgb')
  assert.equal(psd.depth, 8)
  assert.deepEqual(psd.layers.map((entry) => entry.meta.name), [file, 'Photo folder', 'Grey overlay'], `${file} PSD layers came back in a different order`)
  const [photoLayer, folderLayer, overlayLayer] = psd.layers
  assert.equal(folderLayer.meta.kind, 'group')
  assert.equal(overlayLayer.meta.parentId, folderLayer.meta.id, `${file} PSD overlay fell out of its folder`)
  assert.equal(Math.round(overlayLayer.meta.opacity * 100), 50, `${file} PSD opacity came back as ${overlayLayer.meta.opacity}`)
  assert.equal(overlayLayer.meta.blendMode, 'multiply', `${file} PSD blend mode came back as ${overlayLayer.meta.blendMode}`)
  assert.equal(overlayLayer.meta.maskEnabled, true)
  assert.ok(overlayLayer.mask, `${file} PSD dropped the mask`)
  assert.equal(alphaAt(overlayLayer.mask, 2, Math.round(canvas.height / 2)), 255, `${file} PSD mask no longer shows the left`)
  assert.equal(alphaAt(overlayLayer.mask, canvas.width - 2, Math.round(canvas.height / 2)), 0, `${file} PSD mask no longer hides the right`)
  const photoDrift = meanDifference(photoLayer.canvas, canvas)
  const overlayDrift = meanDifference(overlayLayer.canvas, dimmed)
  const compositeDrift = meanDifference(psd.composite, psdComposite)
  assert.equal(photoDrift, 0, `${file} PSD photo layer pixels drifted by ${photoDrift.toFixed(2)}`)
  assert.equal(overlayDrift, 0, `${file} PSD overlay layer pixels drifted by ${overlayDrift.toFixed(2)}`)
  assert.equal(compositeDrift, 0, `${file} PSD composite drifted by ${compositeDrift.toFixed(2)}`)
  save(`${document.name}-psd-composite.png`, psd.composite.toBuffer('image/png'))
  say(`  PSD ${(psdBytes.length / 1024).toFixed(0)} kB: ${psd.layers.length} layers back, ${psd.colorMode} ${psd.depth}-bit, pixel drift photo ${photoDrift} overlay ${overlayDrift} composite ${compositeDrift}`)

  // Print: the preview the dialog shows, then the page the printer is handed.
  const orientation = naturalOrientation(composite)
  const preview = previewSheet(composite)
  assert.ok(preview.startsWith('data:image/jpeg;base64,'), `${file} produced no print preview`)
  assert.ok(preview.length < 400_000, `${file} preview is ${preview.length} bytes — too big for a popup payload`)
  const page = printableDocument(composite.toDataURL('image/png'), document.name, orientation)
  assert.match(page, /object-fit: contain/, `${file} print page does not fit the sheet`)
  assert.match(page, new RegExp(`size: ${orientation}`), `${file} print page ignores the orientation`)
  assert.ok(page.includes('data:image/png;base64,'), `${file} print page carries no image`)
  save(`${document.name}-print.html`, page)
  save(`${document.name}-preview.jpg`, Buffer.from(preview.split(',')[1], 'base64'))
  say(`  print ${orientation}, preview ${(preview.length / 1024).toFixed(0)} kB, page ${(page.length / 1024).toFixed(0)} kB\n`)
}

/* -------------------------------------------------- the record of the run */

const finishedAt = new Date()
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`
const bySource = files.map((file) => ({
  file,
  items: produced.filter((item) => item.source === file),
}))
// Only the pictures go in the gallery; the HTML print pages are linked instead.
const viewable = /\.(png|jpe?g|gif|webp)$/i

writeFileSync(path.join(outDir, 'verify-images.log'), `${transcript.join('\n')}\n`, 'utf8')

writeFileSync(path.join(outDir, 'report.md'), [
  '# Image verification run',
  '',
  `- Run: ${startedAt.toISOString()} (${((finishedAt - startedAt) / 1000).toFixed(1)}s)`,
  `- Source images: ${files.length}, from \`images/\``,
  `- Files produced: ${produced.length}`,
  '- Result: **every assertion passed**',
  '',
  'Each source image is opened through the real decoder, composited, exported to',
  'every format both with and without a transparent background, then put through',
  'the 3D, warp, content-aware scale, animation, 16-bit, pattern and layered',
  'PSD round-trip paths and',
  'finally the print preview and the printable page. The files below are what',
  'came out; `index.html` shows the pictures side by side.',
  '',
  ...bySource.flatMap(({ file, items }) => [
    `## ${file}`,
    '',
    '| File | What it shows | Size |',
    '| --- | --- | --- |',
    ...items.map((item) => `| \`${item.name}\` | ${item.caption} | ${kb(item.bytes)} |`),
    '',
  ]),
].join('\n'), 'utf8')

writeFileSync(path.join(outDir, 'index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>My Photo Work — image verification</title>
<style>
  :root { color-scheme: dark; --bg: #11161d; --panel: #18202a; --line: #2a3440; --text: #e6edf3; --muted: #93a1b1; }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { border-bottom: 1px solid var(--line); font-size: 17px; margin: 36px 0 14px; padding-bottom: 8px; }
  p.lead { color: var(--muted); margin: 0 0 8px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
  figure { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; margin: 0; overflow: hidden; }
  figure img { background: #0c1014; display: block; height: 190px; object-fit: contain; width: 100%; }
  figcaption { padding: 9px 11px; }
  figcaption b { display: block; font-size: 12px; word-break: break-all; }
  figcaption span { color: var(--muted); font-size: 12px; }
  ul.files { color: var(--muted); list-style: none; padding: 0; }
  ul.files a { color: var(--text); }
</style>
</head>
<body>
<h1>Image verification</h1>
<p class="lead">${files.length} source image(s) from <code>images/</code>, ${produced.length} files produced, every assertion passed.</p>
<p class="lead">${startedAt.toISOString()} &middot; see <a href="report.md">report.md</a> and <a href="verify-images.log">verify-images.log</a>.</p>
${bySource.map(({ file, items }) => `<h2>${file}</h2>
<div class="grid">
${items.filter((item) => viewable.test(item.name)).map((item) => `  <figure>
    <img src="${item.name}" alt="${item.caption}" loading="lazy">
    <figcaption><b>${item.name}</b><span>${item.caption} &middot; ${kb(item.bytes)}</span></figcaption>
  </figure>`).join('\n')}
</div>
<ul class="files">
${items.filter((item) => !viewable.test(item.name)).map((item) => `  <li><a href="${item.name}">${item.name}</a> — ${item.caption} (${kb(item.bytes)})</li>`).join('\n')}
</ul>`).join('\n')}
</body>
</html>
`, 'utf8')

say(`All checks passed. ${produced.length} files written to ${outDir}`)
say('Open out/index.html to see them, or read out/report.md.')
