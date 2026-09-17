// Undo/redo snapshots. The property that matters is isolation: a snapshot must
// not share any mutable object with the live document, or undo shows the edit.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cloneCanvases, cloneDocument, pushHistory, takeSnapshot } from '../src/lib/history.ts'
import { clearCanvas, createBlankDocument, createLayerMeta, context2d } from '../src/lib/canvas.ts'
import { defaultAdjustment } from '../src/lib/types.ts'
import { canvasOf, px } from './helpers/pixels.mjs'

function richDocument() {
  const { document, canvases } = createBlankDocument('doc', 8, 8, '#ffffff', 'Background')
  document.guides = [{ id: 'g1', axis: 'x', position: 4 }]
  document.notes = [{ id: 'n1', x: 1, y: 1, text: 'note' }]
  document.samplers = [{ id: 's1', x: 2, y: 2 }]
  document.counts = [{ id: 'c1', x: 3, y: 3, n: 1 }]

  const adjust = createLayerMeta('Curves', 'adjustment')
  adjust.adjustment = defaultAdjustment('brightness')
  const fill = createLayerMeta('Fill', 'fill')
  fill.fill = {
    kind: 'gradient', color: '#ff0000', gradientKind: 'linear',
    start: { x: 0, y: 0 }, end: { x: 8, y: 8 }, endColor: '#0000ff',
  }
  const text = createLayerMeta('Type', 'text')
  text.text = {
    text: 'hi', x: 0, y: 0, fontFamily: 'sans-serif', fontSize: 12,
    color: '#000000', bold: false, italic: false, align: 'left', vertical: false,
  }
  const shape = createLayerMeta('Shape', 'shape')
  shape.shape = {
    kind: 'rect', x: 0, y: 0, width: 4, height: 4,
    fill: '#000000', stroke: '#000000', strokeWidth: 1, sides: 5, radius: 2,
  }
  document.layers.push(adjust, fill, text, shape)
  return { document, canvases }
}

test('cloneDocument copies scalars and detaches the layer array', () => {
  const { document } = richDocument()
  const copy = cloneDocument(document)
  // Compared through JSON because the clone spells absent optional records out
  // as explicit `undefined` keys, which is equivalent for every consumer.
  assert.deepEqual(JSON.parse(JSON.stringify(copy)), JSON.parse(JSON.stringify(document)),
    'the clone starts out equal')
  assert.notEqual(copy.layers, document.layers)
  assert.notEqual(copy.layers[0], document.layers[0])

  document.layers.push(createLayerMeta('extra'))
  document.name = 'renamed'
  assert.equal(copy.layers.length, 5, 'the clone did not grow')
  assert.equal(copy.name, 'doc')
})

test('cloneDocument deep-copies the nested per-layer records', () => {
  const { document } = richDocument()
  const copy = cloneDocument(document)
  const [, adjust, fill, text, shape] = document.layers

  adjust.adjustment.brightness = 50
  fill.fill.color = '#00ff00'
  fill.fill.start.x = 99
  text.text.text = 'changed'
  shape.shape.width = 40
  document.layers[0].effects.dropShadow = true

  assert.equal(copy.layers[1].adjustment.brightness, 0, 'adjustment')
  assert.equal(copy.layers[2].fill.color, '#ff0000', 'fill colour')
  assert.equal(copy.layers[2].fill.start.x, 0, 'fill gradient start point')
  assert.equal(copy.layers[3].text.text, 'hi', 'text')
  assert.equal(copy.layers[4].shape.width, 4, 'shape')
  assert.equal(copy.layers[0].effects.dropShadow, false, 'layer styles')
})

test('cloneDocument detaches guides, notes, samplers and counts', () => {
  const { document } = richDocument()
  const copy = cloneDocument(document)

  document.guides[0].position = 99
  document.notes[0].text = 'edited'
  document.samplers[0].x = 99
  document.counts[0].n = 99
  document.guides.push({ id: 'g2', axis: 'y', position: 1 })

  assert.equal(copy.guides[0].position, 4)
  assert.equal(copy.notes[0].text, 'note')
  assert.equal(copy.samplers[0].x, 2)
  assert.equal(copy.counts[0].n, 1)
  assert.equal(copy.guides.length, 1)
})

test('cloneDocument leaves undefined optional records undefined', () => {
  const { document } = createBlankDocument('doc', 4, 4, 'transparent', 'Layer 1')
  const copy = cloneDocument(document)
  assert.equal(copy.layers[0].adjustment, undefined)
  assert.equal(copy.layers[0].fill, undefined)
  assert.equal(copy.layers[0].text, undefined)
  assert.equal(copy.layers[0].shape, undefined)
})

test('cloneCanvases copies every buffer, masks included', () => {
  const canvases = new Map([
    ['a', canvasOf(4, 4, '#ff0000')],
    ['a:mask', canvasOf(4, 4, '#ffffff')],
  ])
  const copy = cloneCanvases(canvases)
  assert.deepEqual([...copy.keys()], ['a', 'a:mask'])
  assert.notEqual(copy.get('a'), canvases.get('a'))

  clearCanvas(canvases.get('a'))
  assert.deepEqual(px(copy.get('a'), 1, 1), [255, 0, 0, 255], 'the snapshot survived the edit')
})

test('a snapshot survives a later edit to the live document and its pixels', () => {
  const { document, canvases } = richDocument()
  const snapshot = takeSnapshot(document, canvases)

  // Simulate an edit: rename, hide a layer, and paint over the background.
  document.name = 'after'
  document.layers[0].visible = false
  const ctx = context2d(canvases.get(document.layers[0].id))
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 8, 8)

  assert.equal(snapshot.document.name, 'doc')
  assert.equal(snapshot.document.layers[0].visible, true)
  assert.deepEqual(px(snapshot.canvases.get(document.layers[0].id), 4, 4), [255, 255, 255, 255])
})

test('pushHistory keeps the newest 30 states and drops the oldest', () => {
  const stack = []
  for (let i = 0; i < 35; i += 1) {
    pushHistory(stack, { document: { name: `step-${i}` }, canvases: new Map() })
  }
  assert.equal(stack.length, 30)
  assert.equal(stack[0].document.name, 'step-5', 'the five oldest states were discarded')
  assert.equal(stack[29].document.name, 'step-34', 'the newest state is on top')
})

test('pushHistory below the cap keeps everything in order', () => {
  const stack = []
  for (let i = 0; i < 3; i += 1) {
    pushHistory(stack, { document: { name: `step-${i}` }, canvases: new Map() })
  }
  assert.deepEqual(stack.map((item) => item.document.name), ['step-0', 'step-1', 'step-2'])
})

test('cloneDocument detaches paths, slices, frames and the ruler measure', () => {
  const { document } = richDocument()
  document.paths = [{ id: 'p1', name: 'Path 1', closed: true, nodes: [{ x: 1, y: 2, inX: 1, inY: 2, outX: 3, outY: 4 }] }]
  document.slices = [{ id: 's1', name: 'Slice 1', x: 0, y: 0, width: 4, height: 4 }]
  document.frames = [{ id: 'f1', name: 'Frame 1', x: 1, y: 1, width: 2, height: 2 }]
  document.measure = { x1: 0, y1: 0, x2: 5, y2: 5 }
  const copy = cloneDocument(document)

  document.paths[0].nodes[0].x = 99
  document.paths[0].closed = false
  document.slices[0].width = 99
  document.frames[0].name = 'edited'
  document.measure.x2 = 99
  document.paths.push({ id: 'p2', name: 'Path 2', closed: false, nodes: [] })

  assert.equal(copy.paths[0].nodes[0].x, 1, 'path anchors are deep-copied')
  assert.equal(copy.paths[0].closed, true)
  assert.equal(copy.paths.length, 1, 'the path list is detached')
  assert.equal(copy.slices[0].width, 4)
  assert.equal(copy.frames[0].name, 'Frame 1')
  assert.equal(copy.measure.x2, 5)
})

test('cloneDocument deep-copies a layer curve and levels payload', () => {
  const { document } = richDocument()
  document.layers[1].curves = {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  }
  document.layers[1].levels = { black: 10, gamma: 1.2, white: 240, outBlack: 0, outWhite: 255 }
  const copy = cloneDocument(document)

  document.layers[1].curves.rgb[1].y = 0
  document.layers[1].levels.black = 99
  assert.equal(copy.layers[1].curves.rgb[1].y, 255)
  assert.equal(copy.layers[1].levels.black, 10)
})

test('a null measure clones as null rather than throwing', () => {
  const { document } = richDocument()
  assert.equal(cloneDocument(document).measure, null)
})
