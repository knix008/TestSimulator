// Photoshop's own format: a layered document written out and read back.
import test from 'node:test'
import assert from 'node:assert/strict'
import { hasPsdMagic, isPsdSource, packBits, readPsd, unpackBits, writePsd } from '../src/lib/psd.ts'
import { createLayerMeta } from '../src/lib/canvas.ts'
import { canvasOf, px } from './helpers/pixels.mjs'

function square(size, x, y, w, h, color) {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  return canvas
}

test('PackBits packs runs and literals and unpacks them back', () => {
  const runs = Uint8Array.from([5, 5, 5, 5, 5, 1, 2, 3, 9, 9, 9, 9])
  const packed = packBits(runs)
  assert.ok(packed.length < runs.length, 'runs are compressed')
  assert.deepEqual([...unpackBits(packed, runs.length)], [...runs])
  const noise = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 251)
  assert.deepEqual([...unpackBits(packBits(noise), noise.length)], [...noise])
})

test('a layered document survives a PSD round trip', () => {
  const back = createLayerMeta('Background')
  const top = createLayerMeta('Red square')
  top.opacity = 0.5
  top.blendMode = 'multiply'
  top.visible = false
  const folder = createLayerMeta('Folder', 'group')
  const inFolder = createLayerMeta('In folder')
  inFolder.parentId = folder.id
  inFolder.maskEnabled = true
  const mask = canvasOf(32, 32)
  const mctx = mask.getContext('2d')
  mctx.fillStyle = '#ffffff'
  mctx.fillRect(0, 0, 16, 32)

  const bytes = writePsd({ width: 32, height: 32 }, [
    { meta: back, canvas: square(32, 0, 0, 32, 32, '#0000ff'), mask: null },
    { meta: top, canvas: square(32, 8, 8, 8, 8, '#ff0000'), mask: null },
    { meta: folder, canvas: null, mask: null },
    { meta: inFolder, canvas: square(32, 0, 0, 32, 32, '#00ff00'), mask },
  ], square(32, 0, 0, 32, 32, '#0000ff'))
  assert.ok(hasPsdMagic(bytes.buffer), 'the file starts with 8BPS')

  const read = readPsd(bytes.buffer)
  assert.equal(read.width, 32)
  assert.equal(read.height, 32)
  assert.deepEqual(read.layers.map((layer) => layer.meta.name), ['Background', 'Red square', 'Folder', 'In folder'])
  assert.deepEqual(px(read.composite, 4, 4), [0, 0, 255, 255], 'the composite is read back')

  const red = read.layers[1]
  assert.deepEqual(px(red.canvas, 10, 10), [255, 0, 0, 255], 'layer pixels land at their offset')
  assert.equal(px(red.canvas, 2, 2)[3], 0, 'and nowhere else')
  assert.equal(Math.round(red.meta.opacity * 100), 50)
  assert.equal(red.meta.blendMode, 'multiply')
  assert.equal(red.meta.visible, false)

  assert.equal(read.layers[2].meta.kind, 'group')
  assert.equal(read.layers[3].meta.parentId, read.layers[2].meta.id, 'the child belongs to the folder')
  assert.equal(read.layers[3].meta.maskEnabled, true)
  assert.equal(px(read.layers[3].mask, 4, 4)[3], 255, 'the mask shows on the left')
  assert.equal(px(read.layers[3].mask, 28, 4)[3], 0, 'and hides on the right')
})

test('PSD files are recognised by name, MIME type and magic', () => {
  assert.ok(isPsdSource('photo.psd'))
  assert.ok(isPsdSource('big.PSB'))
  assert.ok(isPsdSource('x', 'image/vnd.adobe.photoshop'))
  assert.ok(!isPsdSource('photo.png', 'image/png'))
  assert.ok(!hasPsdMagic(new Uint8Array([1, 2, 3, 4]).buffer))
})
