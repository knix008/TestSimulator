// The mouse pointer over the picture follows the chosen tool.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toolGroups } from '../src/catalog.ts'
import { CURSOR_HOTSPOT, paintsWithSize, pointerLook, toolCursor } from '../src/lib/toolCursor.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const allTools = toolGroups.flatMap((group) => group.tools.map((tool) => tool.id))
const over = { inImage: true, onRuler: false, pressed: false, alt: false, zoom: 1, brushSize: 40 }

test('every tool in the tool strip has a pointer', () => {
  assert.ok(allTools.length >= 50)
  for (const tool of allTools) assert.ok(toolCursor(tool), `${tool} has no pointer`)
})

test('tools without a well-known pointer can be told apart, and none shares its picture', () => {
  const pictures = allTools.map((tool) => toolCursor(tool)).filter((cursor) => cursor.startsWith('url('))
  assert.ok(pictures.length >= 40)
  assert.equal(new Set(pictures).size, pictures.length, 'two tools draw the same pointer')
})

test('a drawn pointer is a valid cursor: a sized image, its hotspot, and a fallback', () => {
  const cursor = toolCursor('fill')
  const match = /^url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), crosshair$/.exec(cursor)
  assert.ok(match, cursor.slice(0, 60))
  assert.equal(Number(match[2]), CURSOR_HOTSPOT)
  assert.equal(Number(match[3]), CURSOR_HOTSPOT)
  const svg = decodeURIComponent(match[1])
  assert.match(svg, /width="32" height="32"/, 'a cursor image must have a size of its own')
  assert.doesNotMatch(svg, /<svg[^>]*>[\s\S]*<svg/, 'the icon was nested with its own svg element')
  assert.match(svg, /stroke="#fff"/, 'without an outline it would vanish on a dark picture')
  assert.match(svg, /stroke="#000"/, 'without a dark line it would vanish on a light picture')
})

test('the familiar tools get the familiar pointers', () => {
  assert.equal(toolCursor('hand'), 'grab')
  assert.equal(toolCursor('hand', { pressed: true }), 'grabbing')
  assert.equal(toolCursor('zoom'), 'zoom-in')
  assert.equal(toolCursor('zoom', { alt: true }), 'zoom-out')
  assert.equal(toolCursor('move'), 'move')
  assert.equal(toolCursor('text'), 'text')
  assert.equal(toolCursor('vtext'), 'vertical-text')
  assert.equal(toolCursor('clone', { alt: true }), 'crosshair', 'Alt picks the clone source')
})

test('the pointer changes over the picture only', () => {
  assert.notEqual(pointerLook({ ...over, tool: 'fill' }).cursor, 'default')
  assert.equal(pointerLook({ ...over, tool: 'fill', inImage: false }).cursor, 'default')
  assert.equal(pointerLook({ ...over, tool: 'fill', onRuler: true }).cursor, 'default')
  // A drag keeps its pointer wherever it wanders.
  assert.notEqual(pointerLook({ ...over, tool: 'fill', inImage: false, pressed: true }).cursor, 'default')
  // Panning and zooming work beside the picture too, but not on a ruler.
  assert.equal(pointerLook({ ...over, tool: 'hand', inImage: false }).cursor, 'grab')
  assert.equal(pointerLook({ ...over, tool: 'hand', onRuler: true }).cursor, 'default')
})

test('a tool with a size shows a ring of that size on screen', () => {
  assert.equal(pointerLook({ ...over, tool: 'brush' }).ring, 40)
  assert.equal(pointerLook({ ...over, tool: 'brush', zoom: 2.5 }).ring, 100)
  assert.equal(pointerLook({ ...over, tool: 'brush', zoom: 8, brushSize: 400 }).ring, 3200, 'a ring larger than any cursor image still works')
  assert.equal(pointerLook({ ...over, tool: 'brush', inImage: false }).ring, 0)
  assert.equal(pointerLook({ ...over, tool: 'marquee' }).ring, 0)
  for (const tool of ['brush', 'pencil', 'eraser', 'clone', 'dodge', 'smudge']) assert.ok(paintsWithSize(tool), `${tool} has no ring`)
  for (const tool of ['move', 'marquee', 'fill', 'hand', 'text']) assert.ok(!paintsWithSize(tool), `${tool} should have no ring`)
})

test('the app applies it to the canvas and keeps it up to date', () => {
  const app = read('src/App.tsx')
  assert.match(app, /canvas\.style\.cursor = look\.cursor/, 'the pointer is never set')
  assert.match(app, /onPointerDownCapture=\{moveRulerMarks\}/, 'pressing would not turn the hand into a closed hand')
  assert.match(app, /event\.key !== 'Alt'/, 'holding Alt would not change the pointer until the mouse moved')
  assert.match(app, /className="brush-ring"/, 'there is no ring')
  const css = read('src/App.css')
  const ring = css.slice(css.indexOf('.brush-ring {'), css.indexOf('}', css.indexOf('.brush-ring {')))
  assert.match(ring, /pointer-events: none/, 'the ring would take the strokes meant for the canvas')
  assert.match(ring, /translate\(-50%, -50%\)/, 'the ring is not centred on the pointer')
})
