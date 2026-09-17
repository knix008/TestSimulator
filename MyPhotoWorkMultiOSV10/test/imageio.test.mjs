// Open and save. The .mpw round trip is the one that can silently lose a user's
// work, so it is exercised with a document that uses every layer kind.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decodeImageSource, decodeTiff, downloadDataUrl, encodeExport, extensionFor, restoreProject,
  serializeProject,
} from '../src/lib/imageIO.ts'
import { createBlankDocument, createLayerMeta, canvasToDataUrl, context2d } from '../src/lib/canvas.ts'
import { defaultAdjustment, defaultEffects } from '../src/lib/types.ts'
import { downloads } from './helpers/dom.mjs'
import { canvasFrom, canvasOf, px } from './helpers/pixels.mjs'

/** A document exercising raster, adjustment, fill, text and shape layers plus a mask. */
function fullDocument() {
  const { document, canvases } = createBlankDocument('Portrait', 12, 9, '#ffffff', 'Background')
  document.name = 'Portrait'
  document.colorMode = 'gray'
  document.guides = [{ id: 'g1', axis: 'x', position: 5 }]
  document.notes = [{ id: 'n1', x: 1, y: 1, text: 'retouch here' }]
  document.samplers = [{ id: 's1', x: 2, y: 2 }]
  document.counts = [{ id: 'c1', x: 3, y: 3, n: 4 }]

  const raster = createLayerMeta('Paint')
  raster.opacity = 0.6
  raster.fillOpacity = 0.8
  raster.blendMode = 'multiply'
  raster.locked = true
  raster.maskEnabled = true
  raster.effects = { ...defaultEffects(), dropShadow: true, shadowColor: '#123456' }
  canvases.set(raster.id, canvasOf(12, 9, '#ff0000'))
  canvases.set(`${raster.id}:mask`, canvasOf(12, 9, '#ffffff'))

  const adjust = createLayerMeta('Exposure', 'adjustment')
  adjust.adjustment = { ...defaultAdjustment('exposure'), exposure: 40 }

  const fill = createLayerMeta('Sky', 'fill')
  fill.fill = {
    kind: 'gradient', color: '#ff0000', gradientKind: 'radial',
    start: { x: 1, y: 2 }, end: { x: 8, y: 7 }, endColor: '#0000ff',
  }

  const text = createLayerMeta('Title', 'text')
  text.text = {
    text: '사진', x: 2, y: 3, fontFamily: 'sans-serif', fontSize: 14,
    color: '#00ff00', bold: true, italic: true, align: 'center', vertical: true,
  }

  const shape = createLayerMeta('Badge', 'shape')
  shape.shape = {
    kind: 'star', x: 1, y: 1, width: 6, height: 6,
    fill: '#ffff00', stroke: '#000000', strokeWidth: 2, sides: 7, radius: 3,
  }

  document.layers.push(raster, adjust, fill, text, shape)
  document.activeLayerId = raster.id
  return { document, canvases }
}

test('serializeProject writes the v2 header and a data URL per raster layer', () => {
  const { document, canvases } = fullDocument()
  const project = serializeProject(document, canvases)
  assert.equal(project.format, 'myphotowork')
  assert.equal(project.version, 2)
  assert.equal(project.name, 'Portrait')
  assert.equal(project.width, 12)
  assert.equal(project.height, 9)
  assert.equal(project.colorMode, 'gray')
  assert.equal(project.layers.length, 6)
  assert.ok(project.layers[1].dataUrl.startsWith('data:image/png;base64,'))
  assert.ok(project.layers[1].maskUrl.startsWith('data:image/png;base64,'))
  assert.equal(project.layers[2].dataUrl, undefined, 'an adjustment layer carries no pixels')
})

test('a project survives serialize → JSON → restore with all metadata intact', async () => {
  const { document, canvases } = fullDocument()
  const text = JSON.stringify(serializeProject(document, canvases))
  const restored = await restoreProject(JSON.parse(text))

  assert.equal(restored.document.name, 'Portrait')
  assert.equal(restored.document.width, 12)
  assert.equal(restored.document.height, 9)
  assert.equal(restored.document.background, '#ffffff')
  assert.equal(restored.document.colorMode, 'gray')
  assert.equal(restored.document.activeLayerId, document.activeLayerId)
  assert.equal(restored.document.layers.length, 6)
  assert.deepEqual(restored.document.guides, document.guides)
  assert.deepEqual(restored.document.notes, document.notes)
  assert.deepEqual(restored.document.samplers, document.samplers)
  assert.deepEqual(restored.document.counts, document.counts)
})

test('restoring a project keeps every per-layer property', async () => {
  const { document, canvases } = fullDocument()
  const restored = await restoreProject(JSON.parse(JSON.stringify(serializeProject(document, canvases))))
  const [, raster, adjust, fill, text, shape] = restored.document.layers

  assert.equal(raster.opacity, 0.6)
  assert.equal(raster.fillOpacity, 0.8)
  assert.equal(raster.blendMode, 'multiply')
  assert.equal(raster.locked, true)
  assert.equal(raster.maskEnabled, true)
  assert.equal(raster.effects.dropShadow, true)
  assert.equal(raster.effects.shadowColor, '#123456')

  assert.equal(adjust.kind, 'adjustment')
  assert.equal(adjust.adjustment.exposure, 40)

  assert.equal(fill.kind, 'fill')
  assert.equal(fill.fill.gradientKind, 'radial')
  assert.deepEqual(fill.fill.start, { x: 1, y: 2 })

  assert.equal(text.kind, 'text')
  assert.equal(text.text.text, '사진', 'non-ASCII text survives the round trip')
  assert.equal(text.text.vertical, true)
  assert.equal(text.text.align, 'center')

  assert.equal(shape.kind, 'shape')
  assert.equal(shape.shape.kind, 'star')
  assert.equal(shape.shape.sides, 7)
})

test('restoring a project brings back the layer pixels and the mask', async () => {
  const { document, canvases } = fullDocument()
  const restored = await restoreProject(JSON.parse(JSON.stringify(serializeProject(document, canvases))))
  const raster = restored.document.layers[1]
  assert.deepEqual(px(restored.canvases.get(raster.id), 5, 4), [255, 0, 0, 255])
  assert.deepEqual(px(restored.canvases.get(`${raster.id}:mask`), 5, 4), [255, 255, 255, 255])
})

test('restoreProject rejects a file that is not a My Photo Work project', async () => {
  await assert.rejects(
    () => restoreProject({ format: 'photoshop', version: 2, layers: [] }),
    /Not a My Photo Work project/,
  )
})

test('a v1 project without the newer collections restores with empty defaults', async () => {
  const layer = createLayerMeta('Background')
  const restored = await restoreProject({
    format: 'myphotowork',
    version: 1,
    name: 'Old',
    width: 4,
    height: 4,
    background: 'transparent',
    activeLayerId: layer.id,
    layers: [{ ...layer, dataUrl: canvasToDataUrl(canvasOf(4, 4, '#00ff00')) }],
  })
  assert.deepEqual(restored.document.guides, [])
  assert.deepEqual(restored.document.notes, [])
  assert.deepEqual(restored.document.samplers, [])
  assert.deepEqual(restored.document.counts, [])
  assert.equal(restored.document.colorMode, 'rgb', 'colour mode defaults to RGB')
  assert.deepEqual(px(restored.canvases.get(layer.id), 2, 2), [0, 255, 0, 255])
})

test('a v1 layer without the newer flags restores with sane defaults', async () => {
  const restored = await restoreProject({
    format: 'myphotowork',
    version: 1,
    name: 'Old',
    width: 4,
    height: 4,
    background: 'transparent',
    activeLayerId: 'layer-1',
    layers: [{
      id: 'layer-1', name: 'Background', visible: true, opacity: 1,
      blendMode: 'source-over', locked: false,
      dataUrl: canvasToDataUrl(canvasOf(4, 4, '#00ff00')),
    }],
  })
  const layer = restored.document.layers[0]
  assert.equal(layer.kind, 'raster')
  assert.equal(layer.fillOpacity, 1)
  assert.equal(layer.clipped, false)
  assert.equal(layer.maskEnabled, false)
  assert.equal(layer.smart, false)
  assert.deepEqual(layer.effects, defaultEffects())
})

test('decodeImageSource recognises a .mpw file by extension and by mime type', async () => {
  const text = JSON.stringify({ format: 'myphotowork', version: 2, name: 'x', layers: [] })
  const byName = await decodeImageSource({ name: 'art.mpw', text })
  assert.equal(byName.kind, 'project')
  assert.equal(byName.project.format, 'myphotowork')

  const byMime = await decodeImageSource({ name: 'art.json', mime: 'application/json', text })
  assert.equal(byMime.kind, 'project')

  const upperCase = await decodeImageSource({ name: 'ART.MPW', text })
  assert.equal(upperCase.kind, 'project', 'the extension check is case-insensitive')
})

test('decodeImageSource decodes a raster data URL into a canvas', async () => {
  const source = canvasFrom(6, 4, (x) => (x < 3 ? [255, 0, 0] : [0, 0, 255]))
  const result = await decodeImageSource({ name: 'photo.png', mime: 'image/png', dataUrl: canvasToDataUrl(source) })
  assert.equal(result.kind, 'canvas')
  assert.equal(result.canvas.width, 6)
  assert.equal(result.canvas.height, 4)
  assert.deepEqual(px(result.canvas, 1, 1), [255, 0, 0, 255])
})

test('decodeImageSource refuses a file it cannot read', async () => {
  await assert.rejects(() => decodeImageSource({ name: 'notes.txt' }), /Unsupported file: notes.txt/)
})

test('a TIFF round trips through encodeExport and decodeTiff', async () => {
  const source = canvasFrom(8, 6, (x, y) => [x * 30, y * 40, 120, 255])
  const dataUrl = await encodeExport(source, 'tiff')
  assert.ok(dataUrl.startsWith('data:image/tiff;base64,'))

  const binary = atob(dataUrl.split(',')[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  const decoded = decodeTiff(bytes.buffer)
  assert.equal(decoded.width, 8)
  assert.equal(decoded.height, 6)
  assert.deepEqual(px(decoded, 3, 2), px(source, 3, 2), 'pixels survive the TIFF round trip')
})

test('decodeImageSource routes .tif and .tiff through the TIFF decoder', async () => {
  const source = canvasOf(4, 4, '#3366cc')
  const dataUrl = await encodeExport(source, 'tiff')
  for (const name of ['scan.tif', 'scan.TIFF']) {
    const result = await decodeImageSource({ name, dataUrl })
    assert.equal(result.kind, 'canvas')
    assert.deepEqual(px(result.canvas, 2, 2), [51, 102, 204, 255], name)
  }
})

test('decodeTiff rejects a buffer with no image in it', () => {
  assert.throws(() => decodeTiff(new Uint8Array(16).buffer), /no image data/)
})

test('every export format produces a data URL of the right type', async () => {
  const source = canvasFrom(8, 8, (x) => (x < 4 ? [255, 0, 0] : [0, 0, 255]))
  const expected = {
    png: 'data:image/png', jpg: 'data:image/jpeg', webp: 'data:image/webp',
    avif: 'data:image/avif', gif: 'data:image/gif', tiff: 'data:image/tiff',
  }
  for (const [format, prefix] of Object.entries(expected)) {
    const dataUrl = await encodeExport(source, format)
    assert.ok(dataUrl.startsWith(prefix), `${format} produced ${dataUrl.slice(0, 24)}`)
  }
})

test('a JPEG export flattens transparency onto white instead of black', async () => {
  const transparent = canvasOf(8, 8)
  const dataUrl = await encodeExport(transparent, 'jpg')
  const image = new Image()
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
    image.src = dataUrl
  })
  const check = canvasOf(8, 8)
  context2d(check).drawImage(image, 0, 0)
  const [r, g, b] = px(check, 4, 4)
  assert.ok(r > 245 && g > 245 && b > 245, `expected white, got [${r}, ${g}, ${b}]`)
})

test('extensionFor maps jpg to jpg and leaves the rest alone', () => {
  assert.equal(extensionFor('jpg'), 'jpg')
  assert.equal(extensionFor('png'), 'png')
  assert.equal(extensionFor('tiff'), 'tiff')
  assert.equal(extensionFor('webp'), 'webp')
})

test('downloadDataUrl hands the browser an anchor with the right file name', () => {
  downloads.length = 0
  downloadDataUrl('data:image/png;base64,AAAA', 'artwork.png')
  assert.deepEqual(downloads, [{ href: 'data:image/png;base64,AAAA', download: 'artwork.png' }])
})

test('paths, slices, frames and the measure survive the .mpw round trip', async () => {
  const { document, canvases } = fullDocument()
  document.paths = [{ id: 'p1', name: '패스 1', closed: true, nodes: [{ x: 1, y: 2, inX: 0, inY: 1, outX: 3, outY: 4 }] }]
  document.slices = [{ id: 's1', name: 'Slice 1', x: 2, y: 3, width: 4, height: 5 }]
  document.frames = [{ id: 'f1', name: 'Frame 1', x: 1, y: 1, width: 6, height: 6, layerId: 'layer-x' }]
  document.measure = { x1: 0, y1: 1, x2: 8, y2: 7 }

  const restored = await restoreProject(JSON.parse(JSON.stringify(serializeProject(document, canvases))))
  assert.deepEqual(restored.document.paths, document.paths)
  assert.deepEqual(restored.document.slices, document.slices)
  assert.deepEqual(restored.document.frames, document.frames)
  assert.deepEqual(restored.document.measure, document.measure)
})

test('a layer curve and levels payload survive the round trip', async () => {
  const { document, canvases } = fullDocument()
  document.layers[2].curves = {
    rgb: [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }],
    r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    b: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  }
  document.layers[2].levels = { black: 12, gamma: 1.4, white: 233, outBlack: 5, outWhite: 250 }

  const restored = await restoreProject(JSON.parse(JSON.stringify(serializeProject(document, canvases))))
  assert.deepEqual(restored.document.layers[2].curves.rgb[1], { x: 128, y: 200 })
  assert.equal(restored.document.layers[2].levels.gamma, 1.4)
})

test('a v1 project without the newer regions restores them empty', async () => {
  const restored = await restoreProject({
    format: 'myphotowork', version: 1, name: 'Old', width: 4, height: 4,
    background: 'transparent', activeLayerId: 'layer-1',
    layers: [{ id: 'layer-1', name: 'Background', visible: true, opacity: 1, blendMode: 'source-over', locked: false }],
  })
  assert.deepEqual(restored.document.paths, [])
  assert.deepEqual(restored.document.slices, [])
  assert.deepEqual(restored.document.frames, [])
  assert.equal(restored.document.measure, null)
  assert.equal(restored.document.layers[0].collapsed, false)
})
