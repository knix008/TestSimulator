// Type runs across or down: both one click away, and each with an icon that says so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toolGroups } from '../src/catalog.ts'
import { findCommand } from '../src/commands.ts'
import { createBlankDocument, createLayerMeta } from '../src/lib/canvas.ts'
import { textLayerAt } from '../src/lib/textHit.ts'
import { TypeHorizontalIcon, TypeMaskIcon, TypeVerticalIcon } from '../src/lib/typeIcons.ts'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('each type tool has its own icon', () => {
  const tools = toolGroups.find((group) => group.id === 'type').tools
  assert.deepEqual(tools.map((tool) => tool.id), ['text', 'vtext', 'textMask'])
  assert.deepEqual(tools.map((tool) => tool.icon), [TypeHorizontalIcon, TypeVerticalIcon, TypeMaskIcon])
  assert.equal(new Set(tools.map((tool) => tool.icon)).size, 3)
})

test('the icons draw, at the size asked for, in the colour of the text around them', () => {
  for (const Icon of [TypeHorizontalIcon, TypeVerticalIcon, TypeMaskIcon]) {
    const markup = renderToStaticMarkup(createElement(Icon, { size: 18 }))
    assert.match(markup, /width="18"/)
    assert.match(markup, /stroke="currentColor"/)
    assert.match(markup, /<path/)
  }
  assert.notEqual(renderToStaticMarkup(createElement(TypeHorizontalIcon)), renderToStaticMarkup(createElement(TypeVerticalIcon)))
})

test('both directions are on the toolbar, in the menu and on the options bar', () => {
  for (const id of ['type.horizontal', 'type.vertical']) assert.equal(findCommand(id).toolbar, true, `${id} is not on the toolbar`)
  assert.equal(findCommand('type.horizontal').icon, TypeHorizontalIcon)
  assert.equal(findCommand('type.vertical').icon, TypeVerticalIcon)
  assert.match(app, /case 'type\.vertical': return tool === 'vtext'/, 'the toolbar button does not show it is on')
  assert.match(app, /data-type-direction=\{id\}/, 'the options bar has no direction buttons')
  assert.match(app, /aria-pressed=\{tool === id\}/)
  assert.match(app, /vertical: editing\?\.vertical \?\? toolRef\.current === 'vtext'/, 'the direction does not reach the new text')
})

test('a tool chosen anywhere shows in the strip', () => {
  // Picking vertical type from the menu used to leave the strip showing the horizontal T.
  assert.match(app, /group\.tools\.some\(\(entry\) => entry\.id === tool\) \? tool : groupTool\[group\.id\]/)
})

function withType(...blocks) {
  const { document, canvases } = createBlankDocument('doc', 200, 200, 'transparent', 'base')
  const layers = blocks.map((block) => {
    const layer = createLayerMeta('Type', 'text')
    layer.text = { text: 'AB', fontFamily: 'sans-serif', fontSize: 24, color: '#ffffff', bold: true, italic: false, align: 'left', ...block }
    document.layers.push(layer)
    return layer
  })
  return { document, canvases, layers }
}

test('a click on type finds it, whichever way it runs', () => {
  const { document, canvases, layers } = withType({ x: 20, y: 20, vertical: false }, { x: 150, y: 60, vertical: true })
  assert.equal(textLayerAt(document, canvases, { x: 30, y: 30 })?.id, layers[0].id, 'the horizontal block')
  assert.equal(textLayerAt(document, canvases, { x: 158, y: 90 })?.id, layers[1].id, 'the second character of the vertical block')
})

test('a click anywhere else finds nothing, so it starts new type', () => {
  const { document, canvases, layers } = withType({ x: 20, y: 20, vertical: true })
  assert.equal(textLayerAt(document, canvases, { x: 150, y: 150 }), null)
  layers[0].visible = false
  assert.equal(textLayerAt(document, canvases, { x: 30, y: 30 }), null, 'hidden type cannot be clicked')
})

test('the topmost of two overlapping blocks is the one found', () => {
  const { document, canvases, layers } = withType({ x: 20, y: 20, vertical: false }, { x: 20, y: 20, vertical: false })
  assert.equal(textLayerAt(document, canvases, { x: 30, y: 30 })?.id, layers[1].id)
})

test('new type takes the size on the options bar, and never rewrites the active layer', () => {
  // It used to be typed over whatever type layer was active, in that layer's direction.
  assert.match(app, /const active = newTextRef\.current \? undefined : current\.layers\.find/)
  assert.match(app, /openDialog\('text', \{ textData: undefined, fontSize \}\)/)
  const dialogs = readFileSync(new URL('../src/dialogs.tsx', import.meta.url), 'utf8')
  assert.match(dialogs, /payload\.textData\?\.fontSize \?\? payload\.fontSize \?\? 48/)
})
