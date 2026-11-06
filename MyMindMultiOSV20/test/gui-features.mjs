// npm run test:gui, part two: every feature, used the way a user uses it. Each category starts its
// own program; each test loads a fresh diagram, so that a failure stays one failure. What a test
// says about the document it reads from a real Save As, not from the page's insides.
//   node test/gui-features.mjs             all of them
//   node test/gui-features.mjs Canvas Menu only the categories with these words in their names
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createReporter } from './reporter.mjs'
import { CTRL, SHIFT, byText, count, cssVar, edgeOf, fixture, launch, root, session, settled, shoot, sleep } from './gui-lib.mjs'

const ko = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales/ko.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales/en.json'), 'utf8'))
const near = (actual, wanted, what, tolerance = 2) => assert.ok(Math.abs(actual - wanted) <= tolerance, `${what}: ${actual}, wanted ${wanted}`)
const js = JSON.stringify
const NO_SELECTION = `document.querySelector('.panel-empty')`
const memoFixture = () => fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'B' ? { ...node, note: 'memo text' } : node)) }))

const suites = []
const suite = (name, body) => suites.push([name, body])

suite('Canvas: selecting, dragging, panning, marquee, zoom', async (test) => {
  const s = await session()
  await test('a click selects a shape: canvas, list and panel agree', async () => {
    await s.load()
    await s.clickNode('B')
    assert.deepEqual(await s.selected(), ['B'])
    assert.equal(await s.page.evaluate(`document.querySelector('.node-tree-item.selected .node-tree-text').textContent`), 'B')
    assert.equal(await s.page.evaluate(`document.querySelector('.right-panel .property-field input').value`), 'B')
    assert.ok(!(await s.title()).endsWith('*'), 'selecting is no edit')
  })
  await test('a click in the node list selects the shape', async () => {
    await s.load()
    await s.page.evaluate(`[...document.querySelectorAll('.node-tree-item')].find((e) => e.textContent.includes('C')).click()`)
    await s.until(`document.querySelector('.node-hit.selected tspan').textContent === 'C'`)
  })
  await test('the node list shows the tree: depth by depth, in order', async () => {
    await s.load()
    assert.deepEqual(await s.listed(), ['Root', 'A', 'A1', 'B', 'C'])
    assert.deepEqual(await s.page.evaluate(`[...document.querySelectorAll('.node-tree-item')].map((e) => e.getAttribute('aria-level'))`), ['1', '2', '3', '2', '2'])
  })
  await test('dragging moves a shape by what the mouse moved, its lines follow, and it counts as an edit', async () => {
    await s.load()
    const before = await s.box('B')
    const line = await s.page.evaluate(`document.querySelectorAll('.edge-hit')[1].getAttribute('d')`)
    const zoom = await s.zoom()
    await s.dragNode('B', 60, 40)
    const after = await s.box('B')
    near(after.x - before.x, 60 / zoom, 'x')
    near(after.y - before.y, 40 / zoom, 'y')
    assert.notEqual(await s.page.evaluate(`document.querySelectorAll('.edge-hit')[1].getAttribute('d')`), line, 'the line stayed behind')
    assert.ok((await s.title()).endsWith('*'))
    near(byText(await s.savedDoc(), 'B').x, after.x, 'saved x')
  })
  await test('a shape follows the mouse during the drag, before it is let go', async () => {
    await s.load()
    const before = await s.box('B')
    const at = await s.rect('B')
    await s.dragFrom(at, { x: at.x + 80, y: at.y }, { hold: async () => assert.ok((await s.box('B')).x > before.x + 20, 'no preview') })
  })
  await test('a tremble of the hand is no drag', async () => {
    await s.load()
    const before = await s.box('B')
    await s.dragNode('B', 2, 1)
    assert.deepEqual(await s.box('B'), before)
    assert.ok(!(await s.title()).endsWith('*'))
  })
  await test('a drag and Undo, Redo: back and forth', async () => {
    await s.load()
    const before = await s.box('B')
    await s.dragNode('B', 50, 50)
    const moved = await s.box('B')
    await s.click('[data-command="undo"]')
    await s.until(`${s.nodeEl('B')}.querySelector('.node-shape').getBBox().x === ${before.x}`)
    await s.click('[data-command="redo"]')
    await s.until(`${s.nodeEl('B')}.querySelector('.node-shape').getBBox().x === ${moved.x}`)
  })
  await test('several selected shapes drag together; the others stay', async () => {
    await s.load()
    const others = await s.box('C')
    const a = await s.box('A')
    const b = await s.box('B')
    await s.clickNode('A')
    await s.clickNode('B', { modifiers: CTRL })
    await s.dragNode('B', 70, 30)
    const zoom = await s.zoom()
    near((await s.box('A')).x - a.x, 70 / zoom, 'A')
    near((await s.box('B')).x - b.x, 70 / zoom, 'B')
    assert.deepEqual(await s.box('C'), others)
    assert.deepEqual((await s.selected()).sort(), ['A', 'B'])
  })
  await test('real Ctrl and Shift clicks add and take away, shapes and lines', async () => {
    await s.load()
    await s.clickNode('A')
    await s.clickNode('B', { modifiers: CTRL })
    await s.clickNode('C', { modifiers: SHIFT })
    assert.deepEqual((await s.selected()).sort(), ['A', 'B', 'C'])
    await s.clickNode('B', { modifiers: CTRL })
    assert.deepEqual((await s.selected()).sort(), ['A', 'C'])
    await s.clickEdge(0, { modifiers: SHIFT })
    await s.until(`document.querySelector('[data-line-count]')`)
    assert.equal(await s.lineAttr(0, 'stroke'), 'var(--accent)')
    await s.clickEdge(0, { modifiers: CTRL })
    await s.until(`!document.querySelector('[data-line-count]')`)
    assert.deepEqual((await s.selected()).sort(), ['A', 'C'])
  })
  await test('a plain click on a line selects it alone, and the panel turns to lines', async () => {
    await s.load()
    await s.clickNode('A')
    await s.clickEdge(1)
    assert.deepEqual(await s.selected(), [])
    await s.until(`document.querySelector('[data-memo-section="edge"]')`)
    assert.equal(await s.lineAttr(1, 'stroke'), 'var(--accent)')
    assert.equal(await s.lineAttr(0, 'stroke'), '#94a3b8')
  })
  await test('with the grid on, dragging the empty canvas pans, and changes nothing in the diagram', async () => {
    await s.load()
    const screen = await s.rect('B')
    const place = await s.box('B')
    const from = await s.emptyPoint()
    await s.dragFrom(from, { x: from.x - 90, y: from.y - 50 })
    const moved = await s.rect('B')
    near(moved.x - screen.x, -90, 'x')
    near(moved.y - screen.y, -50, 'y')
    assert.deepEqual(await s.box('B'), place)
    assert.ok(!(await s.title()).endsWith('*'), 'panning is no edit')
  })
  await test('the middle button pans, also with the grid off', async () => {
    await s.load()
    await s.setGrid(false)
    const screen = await s.rect('B')
    const from = await s.emptyPoint()
    await s.dragFrom(from, { x: from.x - 40, y: from.y - 30 }, { button: 'middle' })
    near((await s.rect('B')).x - screen.x, -40, 'x')
  })
  await test('with the grid off, a drag on the empty canvas draws a marquee that selects what it touches', async () => {
    await s.load()
    await s.setGrid(false)
    await s.clickNode('Root')
    const b = await s.rect('B')
    const c = await s.rect('C')
    await s.dragFrom({ x: b.right + 40, y: b.top - 14 }, { x: b.left - 14, y: c.bottom + 14 }, { hold: async () => assert.equal(await s.count('.marquee-rect'), 1) })
    assert.deepEqual((await s.selected()).sort(), ['B', 'C'])
    assert.equal(await s.count('.marquee-rect'), 0)
  })
  await test('Ctrl and a marquee add to what is selected', async () => {
    await s.load()
    await s.setGrid(false)
    await s.clickNode('A')
    const b = await s.rect('B')
    const c = await s.rect('C')
    await s.dragFrom({ x: b.right + 40, y: b.top - 14 }, { x: b.left - 14, y: c.bottom + 14 }, { modifiers: CTRL })
    assert.deepEqual((await s.selected()).sort(), ['A', 'B', 'C'])
  })
  await test('a click on the empty canvas with the grid off selects nothing, and the panel says so', async () => {
    await s.load()
    await s.clickNode('A')
    await s.deselect()
    assert.deepEqual(await s.selected(), [])
  })
  await test('the wheel zooms in steps, stops at 10% and at 400%, and holds the middle of the view', async () => {
    await s.load()
    const box = await s.page.evaluate(`(() => { const r = document.querySelector('.canvas-svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    const middle = async () => s.page.evaluate(`(() => { const g = document.querySelector('.node-hit').closest('g[transform]'); const m = g.getScreenCTM().inverse(); return { x: m.a * ${box.x} + m.e, y: m.d * ${box.y} + m.f } })()`)
    const before = await middle()
    await s.wheel(box.x, box.y, 100, 3)
    const out = await middle()
    near(out.x, before.x, 'held x', 3)
    await s.wheel(box.x, box.y, 100, 60)
    assert.equal(await s.zoomText(), '10%')
    await s.wheel(box.x, box.y, -100, 80)
    assert.equal(await s.zoomText(), '400%')
    await s.click('[data-command="fit"]')
  })
  await test('Fit All brings every shape into view, however large the diagram and wherever it was panned', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A1' ? { ...node, x: 6000, y: 4000 } : node)) })))
    const from = await s.emptyPoint()
    await s.dragFrom(from, { x: from.x - 200, y: from.y - 200 })
    await s.click('[data-command="fit"]')
    await sleep(60)
    const view = await s.page.evaluate(`(() => { const r = document.querySelector('.canvas-svg').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })()`)
    for (const name of ['Root', 'A', 'A1']) {
      const at = await s.rect(name)
      assert.ok(at.left >= view.left && at.right <= view.right && at.top >= view.top && at.bottom <= view.bottom, `${name} is out of view: ${js(at)}`)
    }
    assert.ok((await s.zoom()) < 1)
  })
  await test('Auto Align puts dragged shapes back, and Undo undoes it', async () => {
    await s.load()
    await s.click('[data-command="align"]')
    await sleep(40)
    const placed = await s.box('B')
    await s.dragNode('B', 80, 80)
    await s.click('[data-command="align"]')
    await sleep(40)
    assert.deepEqual(await s.box('B'), placed)
    await s.click('[data-command="undo"]')
    await sleep(40)
    assert.notDeepEqual(await s.box('B'), placed)
  })
  await s.stop()
})

suite('Editing text', async (test) => {
  const s = await session()
  const editor = '.node-editor'
  const open = async (name) => {
    const at = await s.rect(name)
    await s.clickAt(at.x, at.y)
    await s.clickAt(at.x, at.y, { clickCount: 2 })
    await s.until(`document.querySelector('${editor}')`)
  }
  await test('a double click opens an editor over the shape, with its text selected for typing', async () => {
    await s.load()
    await open('B')
    const look = await s.page.evaluate(`(() => { const e = document.querySelector('${editor}'); return { value: e.value, focused: document.activeElement === e, width: e.getBoundingClientRect().width } })()`)
    assert.equal(look.value, 'B')
    assert.ok(look.focused)
    assert.ok(look.width >= 120)
    await s.key('Escape')
  })
  await test('Enter keeps what was typed', async () => {
    await s.load()
    await open('B')
    await s.setValue(editor, 'New words')
    await s.key('Enter')
    await s.until(`!document.querySelector('${editor}')`)
    assert.equal(byText(await s.savedDoc(), 'New words').id, 'B')
  })
  await test('Escape keeps the old text', async () => {
    await s.load()
    await open('B')
    await s.setValue(editor, 'Not this')
    await s.key('Escape')
    await s.until(`!document.querySelector('${editor}')`)
    assert.ok(byText(await s.savedDoc(), 'B'))
  })
  await test('going elsewhere keeps what was typed', async () => {
    await s.load()
    await open('B')
    await s.setValue(editor, 'Left it')
    await s.page.evaluate(`document.querySelector('${editor}').blur()`)
    await s.until(`!document.querySelector('${editor}')`)
    assert.ok(byText(await s.savedDoc(), 'Left it'))
  })
  await test('an empty text does not wipe the shape', async () => {
    await s.load()
    await open('B')
    await s.setValue(editor, '   ')
    await s.key('Enter')
    await s.until(`!document.querySelector('${editor}')`)
    assert.ok(byText(await s.savedDoc(), 'B'))
  })
  await test('the panel\'s text field changes the shape as it is typed, and Undo takes it back', async () => {
    await s.load()
    await s.clickNode('B')
    await s.setValue('.right-panel .property-field input', 'Typed')
    await s.until(`[...document.querySelectorAll('.node-label tspan')].some((t) => t.textContent === 'Typed')`)
    assert.ok((await s.listed()).includes('Typed'), 'the list follows')
    await s.click('[data-command="undo"]')
    await s.until(`[...document.querySelectorAll('.node-label tspan')].some((t) => t.textContent === 'B')`)
  })
  await test('a long text is cut on the shape, whole in the list and the file', async () => {
    const long = 'A text much longer than any shape holds'
    await s.load()
    await s.clickNode('B')
    await s.setValue('.right-panel .property-field input', long)
    await s.until(`[...document.querySelectorAll('.node-label tspan')].some((t) => t.textContent.endsWith('...'))`)
    assert.ok((await s.listed()).includes(long))
    assert.ok(byText(await s.savedDoc(), long))
  })
  await test('the editor grows with the zoom', async () => {
    await s.load()
    const size = async () => {
      await open('B')
      const px = await s.page.evaluate(`Number.parseFloat(document.querySelector('${editor}').style.fontSize)`)
      await s.key('Escape')
      return px
    }
    const before = await size()
    const at = await s.rect('B')
    await s.wheel(at.x, at.y, -100, 3)
    assert.ok((await size()) > before)
  })
  await s.stop()
})

suite('Keyboard', async (test) => {
  const s = await session()
  const focusBody = () => s.page.evaluate(`document.activeElement?.blur?.()`)
  await test('Delete removes the selected shape with its branch', async () => {
    await s.load()
    await s.clickNode('A')
    await s.key('Delete')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '3'`)
    assert.deepEqual(await s.listed(), ['Root', 'B', 'C'])
    assert.equal(await s.count('.edge-hit'), 2)
  })
  await test('Backspace does the same', async () => {
    await s.load()
    await s.clickNode('C')
    await s.key('Backspace')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '4'`)
  })
  await test('the central topic is never deleted', async () => {
    await s.load()
    await s.clickNode('Root')
    await s.key('Delete')
    assert.equal(await s.nodeCount(), 5)
    assert.ok(!(await s.title()).endsWith('*'))
  })
  await test('Delete takes every selected shape; a selected line stays, as lines have no delete of their own', async () => {
    await s.load()
    await s.clickNode('B')
    await s.clickNode('C', { modifiers: CTRL })
    await s.key('Delete')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '3'`)
    await s.clickEdge(0)
    await s.key('Delete')
    assert.equal(await s.count('.edge-hit'), 2)
    assert.equal(await s.nodeCount(), 3)
  })
  await test('Delete inside a text field edits the text, not the diagram', async () => {
    await s.load()
    await s.clickNode('B')
    await s.page.evaluate(`document.querySelector('.right-panel .property-field input').focus()`)
    await s.key('Delete')
    await s.key('Backspace')
    assert.equal(await s.nodeCount(), 5)
    await focusBody()
  })
  await test('Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z', async () => {
    await s.load()
    await s.clickNode('C')
    await s.key('Delete')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '4'`)
    await focusBody()
    await s.key('z', CTRL)
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '5'`)
    await s.key('y', CTRL)
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '4'`)
    await s.key('z', CTRL)
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '5'`)
    await s.key('z', CTRL | SHIFT)
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '4'`)
  })
  await test('Undo and Redo are disabled when there is nothing to do, and history is cut by a new edit', async () => {
    await s.load()
    const disabled = (command) => s.page.evaluate(`document.querySelector('[data-command="${command}"]').disabled`)
    assert.equal(await disabled('undo'), true)
    assert.equal(await disabled('redo'), true)
    await s.clickNode('C')
    await s.key('Delete')
    await s.until(`!document.querySelector('[data-command="undo"]').disabled`)
    await s.click('[data-command="undo"]')
    await s.until(`!document.querySelector('[data-command="redo"]').disabled`)
    await s.clickNode('B')
    await s.key('Delete')
    await s.until(`document.querySelector('[data-command="redo"]').disabled`)
  })
  await test('selecting alone leaves no step in the history', async () => {
    await s.load()
    await s.clickNode('A')
    await s.clickNode('B')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-command="undo"]').disabled`), true)
  })
  await test('Ctrl+N asks about unsaved work, then starts over', async () => {
    await s.load()
    await s.clickNode('C')
    await s.key('Delete')
    await s.key('n', CTRL)
    await s.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await s.click('[data-command="unsaved-discard"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
  })
  await test('Ctrl+O opens, Ctrl+S saves to the same file, Ctrl+Shift+S asks for a name', async () => {
    const file = await s.load()
    await s.clickNode('B')
    await s.setValue('.right-panel .property-field input', 'Saved by keys')
    await s.key('s', CTRL)
    await s.until(`!document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    assert.ok(byText(JSON.parse(fs.readFileSync(file, 'utf8')), 'Saved by keys'))
    const other = s.file('keys-as.mmap')
    await s.answerDialogs({ saveDiagram: other })
    await s.key('s', CTRL | SHIFT)
    await s.until(`document.querySelector('[data-title-file]').textContent === 'keys-as.mmap'`)
    await s.answerDialogs({ open: file })
    await s.key('o', CTRL)
    await s.until(`document.querySelector('[data-title-file]').textContent === ${js(path.basename(file))}`)
  })
  await test('Ctrl+P opens printing, F1 the guide, and Escape closes each', async () => {
    await s.load()
    await s.key('p', CTRL)
    await s.until(`document.querySelector('[data-dialog="print"]')`)
    await s.key('Escape')
    await s.until(`!document.querySelector('[data-dialog="print"]')`)
    await s.key('F1')
    await s.until(`document.querySelector('[data-dialog="guide"]')`)
    await s.key('Escape')
    await s.until(`!document.querySelector('[data-dialog="guide"]')`)
  })
  await test('F11 goes to full screen and back', async () => {
    await s.load()
    await s.key('F11')
    await s.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'true'`)
    await s.key('F11')
    await s.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'false'`)
  })
  await test('while the start screen shows, the keys leave the hidden diagram alone', async () => {
    await s.load()
    await s.clickNode('C')
    await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-start-screen]')`)
    await focusBody()
    await s.key('Delete')
    await s.key('a', CTRL)
    await s.key('z', CTRL)
    assert.equal(await s.nodeCount(), 5)
    await s.click('[data-start="continue"]')
    await s.until(`!document.querySelector('[data-start-screen]')`)
  })
  for (const [name, open, dialog] of [
    ['About', '[data-command="about"]', 'about'],
    ['Export', '[data-command="export"]', 'export'],
    ['Settings', '[data-command="preferences"]', 'preferences'],
  ]) {
    await test(`Escape closes ${name}`, async () => {
      await s.click(open)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      await s.key('Escape')
      await s.until(`!document.querySelector('[data-dialog="${dialog}"]')`)
    })
  }
  await s.stop()
})

suite('Title row menus', async (test) => {
  const s = await session()
  const nodesAre = (n) => s.until(`document.querySelector('[data-status="nodes"]').textContent === '${n}'`)
  await test('File has every item, with its shortcut', async () => {
    const items = await s.menuItems('file')
    for (const word of [ko.start.newMindmap, ko.start.newFishbone, ko.toolbar.open, ko.toolbar.save, ko.toolbar.saveAs, ko.toolbar.print, ko.toolbar.export, ko.toolbar.settings, ko.start.exit]) assert.ok(items.some((item) => item.text.includes(word)), word)
    for (const hint of ['Ctrl+N', 'Ctrl+O', 'Ctrl+S', 'Ctrl+Shift+S', 'Ctrl+P']) assert.ok(items.some((item) => item.text.includes(hint)), hint)
  })
  await test('File: new mind map and new fishbone', async () => {
    await s.load()
    await s.menu('file', ko.start.newFishbone)
    await s.until(`document.querySelector('[data-command="mode-fishbone"]').getAttribute('aria-pressed') === 'true'`)
    await nodesAre(5)
    await s.menu('file', ko.start.newMindmap)
    await s.until(`document.querySelector('[data-command="mode-mindmap"]').getAttribute('aria-pressed') === 'true'`)
    await nodesAre(1)
  })
  await test('File: open, save, save as', async () => {
    const file = await s.load()
    await s.clickNode('B')
    await s.setValue('.right-panel .property-field input', 'By menu')
    await s.menu('file', ko.toolbar.save)
    await s.until(`!document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    assert.ok(byText(JSON.parse(fs.readFileSync(file, 'utf8')), 'By menu'))
    await s.answerDialogs({ saveDiagram: s.file('menu-as.mmap') })
    await s.menu('file', ko.toolbar.saveAs)
    await s.until(`document.querySelector('[data-title-file]').textContent === 'menu-as.mmap'`)
    assert.ok(fs.existsSync(s.file('menu-as.mmap')))
    await s.answerDialogs({ open: file })
    await s.menu('file', ko.toolbar.open)
    await s.until(`document.querySelector('[data-title-file]').textContent === ${js(path.basename(file))}`)
  })
  for (const [label, dialog] of [[ko.toolbar.print, 'print'], [ko.toolbar.export, 'export'], [ko.toolbar.settings, 'preferences']]) {
    await test(`File: ${dialog} opens its window`, async () => {
      await s.load()
      await s.menu('file', label)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      await s.key('Escape')
    })
  }
  await test('Edit: Undo, Redo and Delete are offered only when they can act', async () => {
    await s.load()
    const state = async () => Object.fromEntries((await s.menuItems('edit')).map((item) => [item.text.split('Ctrl')[0].replace('Del', '').trim(), item.disabled]))
    let items = await state()
    assert.equal(items[ko.toolbar.undo], true)
    assert.equal(items[ko.toolbar.redo], true)
    await s.clickNode('A')
    items = await state()
    assert.equal(items[ko.context.delete], false)
    assert.equal(items[ko.context.addChild], false)
  })
  await test('Edit: add child, add sibling, undo, redo, delete', async () => {
    await s.load()
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    await nodesAre(6)
    await s.menu('edit', ko.context.addSibling)
    await nodesAre(7)
    await s.menu('edit', ko.toolbar.undo)
    await nodesAre(6)
    await s.menu('edit', ko.toolbar.redo)
    await nodesAre(7)
    await s.menu('edit', ko.context.delete)
    await nodesAre(6)
    const doc = await s.savedDoc()
    assert.equal(doc.nodes.filter((node) => node.parentId === 'B').length, 1, 'the child is under B')
    assert.equal(doc.edges.length, 5)
  })
  await test('Edit: a sibling of the central topic is its child, as it has no parent', async () => {
    await s.load()
    await s.clickNode('Root')
    await s.menu('edit', ko.context.addSibling)
    await nodesAre(6)
    assert.equal((await s.savedDoc()).nodes.filter((node) => node.parentId === 'Root').length, 4)
  })
  await test('Edit: memo and picture', async () => {
    await s.load()
    await s.clickNode('B')
    await s.menu('edit', ko.memo.add)
    await s.until(`document.querySelector('.memo-note[data-memo="node"]')`)
    const png = s.file('menu.png')
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'))
    await s.answerDialogs({ pick: png })
    await s.menu('edit', ko.toolbar.image)
    await nodesAre(6)
  })
  await test('View: Fit All and Center', async () => {
    await s.load()
    const at = await s.rect('B')
    await s.wheel(at.x, at.y, -100, 2)
    await sleep(60)
    const zoomed = await s.zoomText()
    await s.menu('view', ko.toolbar.reset)
    await sleep(40)
    assert.equal(await s.zoomText(), zoomed, 'Center keeps the zoom')
    await s.menu('view', ko.toolbar.fit)
    await s.until(`[...document.querySelectorAll('.status-item')].find((e) => e.textContent.includes('%')).textContent.includes('100%')`)
  })
  await test('View: Auto Align', async () => {
    await s.load()
    const before = await s.box('A1')
    await s.menu('view', ko.toolbar.align)
    await sleep(40)
    assert.notDeepEqual(await s.box('A1'), before)
  })
  for (const [show, hide, shown, setting] of [
    [ko.context.showGrid, ko.context.hideGrid, '.canvas-grid', 'showGrid'],
    [ko.context.showRuler, ko.context.hideRuler, '.canvas-rulers', 'showRulers'],
  ]) {
    await test(`View: ${setting} goes off and on, and the item says which it will do`, async () => {
      await s.load()
      assert.ok((await s.menuItems('view')).some((item) => item.text.includes(hide)))
      await s.menu('view', hide)
      await s.until(`!document.querySelector('${shown}')`)
      await settled(() => s.app.settings()[setting], false)
      assert.ok((await s.menuItems('view')).some((item) => item.text.includes(show)))
      await s.menu('view', show)
      await s.until(`document.querySelector('${shown}')`)
    })
  }
  for (const [show, hide, side, setting] of [[ko.panel.showLeft, ko.panel.hideLeft, 'left', 'leftPanel'], [ko.panel.showRight, ko.panel.hideRight, 'right', 'rightPanel']]) {
    await test(`View: the ${side} panel folds and opens`, async () => {
      await s.load()
      await s.menu('view', hide)
      await s.until(`document.querySelector('[data-panel-strip="${side}"]')`)
      await settled(() => s.app.settings()[setting], false)
      await s.menu('view', show)
      await s.until(`document.querySelector('[data-panel-fold="${side}"]')`)
    })
  }
  await test('View: memos hide and show', async () => {
    await s.load(memoFixture())
    await s.until(`document.querySelector('.memo-note')`)
    await s.menu('view', ko.memo.hideAll)
    await s.until(`!document.querySelector('.memo-note')`)
    await s.menu('view', ko.memo.showAll)
    await s.until(`document.querySelector('.memo-note')`)
  })
  await test('View: full screen', async () => {
    await s.menu('view', ko.toolbar.fullscreen)
    await s.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'true'`)
    // The window is still changing size for a moment, and a resize closes an open menu.
    await sleep(600)
    await s.menu('view', ko.toolbar.fullscreen)
    await s.until(`document.querySelector('[data-command="fullscreen"]').getAttribute('aria-pressed') === 'false'`)
  })
  for (const [label, dialog] of [[ko.guide.title, 'guide'], [ko.start.tutorial, 'tutorial-choose'], [ko.toolbar.about, 'about']]) {
    await test(`Help: ${dialog} opens`, async () => {
      await s.menu('help', label)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      await s.key('Escape')
      await s.until(`!document.querySelector('[data-dialog="${dialog}"]')`)
    })
  }
  await test('a menu closes on a second press, on Escape and on a click elsewhere', async () => {
    const open = `document.querySelector('.tb-menu-floating')`
    await s.click('[data-menu="edit"] .tb-btn')
    await s.until(open)
    await s.click('[data-menu="edit"] .tb-btn')
    await s.until(`!${open}`)
    await s.click('[data-menu="edit"] .tb-btn')
    await s.until(open)
    await s.key('Escape')
    await s.until(`!${open}`)
    await s.click('[data-menu="edit"] .tb-btn')
    await s.until(open)
    const at = await s.emptyPoint()
    await s.clickAt(at.x, at.y)
    await s.until(`!${open}`)
  })
  await test('the Start button shows and hides the start screen, and says which', async () => {
    await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-command="start"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-start-screen]')`)
    await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-command="start"]').getAttribute('aria-pressed') === 'false' && !document.querySelector('[data-start-screen]')`)
  })
  await test('the status bar shows mode, layout, count, zoom, file, and turns the grid off and on', async () => {
    await s.load()
    const bar = () => s.page.evaluate(`document.querySelector('.status-bar').textContent`)
    const words = await bar()
    for (const word of [ko.toolbar.mindmap, ko.layout.ltr, '100%']) assert.ok(words.includes(word), `${word} in ${words}`)
    assert.ok((await s.text('[data-status="file"]')).includes(ko.status.saved))
    await s.clickNode('C')
    await s.key('Delete')
    await s.until(`document.querySelector('[data-status="file"]').textContent.includes(${js(ko.status.unsaved)})`)
    await s.click('.status-toggle')
    await s.until(`!document.querySelector('.canvas-grid')`)
    assert.ok((await bar()).includes(ko.status.off))
    await s.click('.status-toggle')
    await s.until(`document.querySelector('.canvas-grid')`)
  })
  await s.stop()
})

suite('Context menu', async (test) => {
  const s = await session()
  const onNode = async (name) => {
    const at = await s.rect(name)
    await s.contextAt(at.x, at.y)
  }
  const onCanvas = async () => {
    const at = await s.emptyPoint()
    await s.contextAt(at.x, at.y)
    return at
  }
  const nodesAre = (n) => s.until(`document.querySelector('[data-status="nodes"]').textContent === '${n}'`)
  await test('on a shape it selects the shape; on one of several it keeps them, and counts them', async () => {
    await s.load()
    await onNode('B')
    assert.deepEqual(await s.selected(), ['B'])
    await s.key('Escape')
    await s.clickNode('A')
    await s.clickNode('C', { modifiers: CTRL })
    await onNode('C')
    assert.deepEqual((await s.selected()).sort(), ['A', 'C'])
    assert.ok((await s.text('.context-header')).includes('2'))
    assert.ok((await s.contextItem(ko.context.deleteSelected.replace('{{count}}', '2'))).text)
    for (const label of [ko.context.addChild, ko.context.addSibling, ko.context.edit, ko.context.duplicate, ko.context.copy]) assert.equal((await s.contextItem(label)).disabled, true, `${label}, with several`)
    await s.key('Escape')
  })
  await test('on the canvas what needs a shape is off, and Add Text is on', async () => {
    await s.load()
    await onCanvas()
    for (const label of [ko.context.edit, ko.context.duplicate, ko.context.copy, ko.context.delete]) assert.equal((await s.contextItem(label)).disabled, true, label)
    assert.equal((await s.contextItem(ko.context.addText)).disabled, false)
    assert.equal((await s.contextItem(ko.context.paste)).disabled, true, 'nothing was copied yet')
    await s.key('Escape')
  })
  await test('with nothing selected, adding a child or a sibling is off', async () => {
    await s.load()
    const at = await s.deselect()
    await s.contextAt(at.x, at.y)
    assert.equal((await s.contextItem(ko.context.addChild)).disabled, true)
    assert.equal((await s.contextItem(ko.context.addSibling)).disabled, true)
    await s.key('Escape')
  })
  await test('Add Child and Add Sibling', async () => {
    await s.load()
    await onNode('B')
    await s.contextPress(ko.context.addChild)
    await nodesAre(6)
    await onNode('C')
    await s.contextPress(ko.context.addSibling)
    await nodesAre(7)
    const doc = await s.savedDoc()
    assert.equal(doc.nodes.filter((node) => node.parentId === 'B').length, 1)
    assert.equal(doc.nodes.filter((node) => node.parentId === 'Root').length, 4)
  })
  await test('Add Text asks for it and puts it where the menu opened, on its own', async () => {
    await s.load()
    const at = await onCanvas()
    const svg = await s.page.evaluate(`(() => { const m = document.querySelector('.node-hit').closest('g[transform]').getScreenCTM().inverse(); return { x: m.a * ${at.x} + m.e, y: m.d * ${at.y} + m.f } })()`)
    await s.contextPress(ko.context.addText)
    await s.until(`document.querySelector('[data-dialog="input"]')`)
    await s.setValue('[data-field="inputText"]', 'Free text')
    await s.click('[data-command="input-ok"]')
    await nodesAre(6)
    const free = byText(await s.savedDoc(), 'Free text')
    assert.equal(free.parentId, null)
    near(free.x, svg.x, 'x')
    near(free.y, svg.y, 'y')
  })
  await test('Add Text: Enter accepts, Cancel and Escape add nothing, an empty text cannot be accepted', async () => {
    await s.load()
    await onCanvas()
    await s.contextPress(ko.context.addText)
    await s.until(`document.querySelector('[data-dialog="input"]')`)
    await s.setValue('[data-field="inputText"]', '')
    await s.until(`document.querySelector('[data-command="input-ok"]').disabled`)
    await s.click('[data-command="input-cancel"]')
    await s.until(`!document.querySelector('[data-dialog="input"]')`)
    await onCanvas()
    await s.contextPress(ko.context.addText)
    await s.until(`document.querySelector('[data-dialog="input"]')`)
    await s.key('Escape')
    await s.until(`!document.querySelector('[data-dialog="input"]')`)
    assert.equal(await s.nodeCount(), 5)
    await onCanvas()
    await s.contextPress(ko.context.addText)
    await s.until(`document.activeElement?.dataset?.field === 'inputText'`)
    await s.setValue('[data-field="inputText"]', 'By Enter')
    await s.key('Enter')
    await nodesAre(6)
  })
  await test('Edit Text opens the editor', async () => {
    await s.load()
    await onNode('B')
    await s.contextPress(ko.context.edit)
    await s.until(`document.querySelector('.node-editor')?.value === 'B'`)
    await s.key('Escape')
  })
  await test('Duplicate copies the branch beside it, with fresh ids, and it keeps the look of its lines', async () => {
    await s.load(fixture((doc) => ({ ...doc, edges: doc.edges.map((edge) => ({ ...edge, color: '#ff0000', width: 5, lineType: 'elbow', linePattern: 'dashed', endCap: 'arrow' })) })))
    await onNode('A')
    await s.contextPress(ko.context.duplicate)
    await nodesAre(7)
    const doc = await s.savedDoc()
    assert.deepEqual([...new Set(doc.nodes.map((node) => node.id))].length, 7, 'ids are unique')
    const copy = doc.nodes.find((node) => node.text === 'A' && node.id !== 'A')
    assert.equal(copy.parentId, 'Root')
    const child = doc.nodes.find((node) => node.parentId === copy.id)
    assert.equal(child.text, 'A1')
    for (const edge of [edgeOf(doc, 'Root', copy.id), edgeOf(doc, copy.id, child.id)]) {
      assert.equal(edge.color, '#ff0000')
      assert.equal(edge.width, 5)
      assert.equal(edge.lineType, 'elbow')
      assert.equal(edge.linePattern, 'dashed')
      assert.equal(edge.endCap, 'arrow')
    }
  })
  await test('Copy and Paste on a shape puts the branch under it', async () => {
    await s.load()
    await onNode('A')
    await s.contextPress(ko.context.copy)
    await onNode('C')
    assert.equal((await s.contextItem(ko.context.paste)).disabled, false)
    await s.contextPress(ko.context.paste)
    await nodesAre(7)
    const doc = await s.savedDoc()
    const pasted = doc.nodes.find((node) => node.text === 'A' && node.parentId === 'C')
    assert.ok(pasted, 'under C')
    assert.ok(doc.nodes.find((node) => node.text === 'A1' && node.parentId === pasted.id), 'with its child')
    assert.ok(edgeOf(doc, 'C', pasted.id), 'with a line')
  })
  await test('Paste with nothing selected puts the branch on the canvas, on its own, where the menu opened', async () => {
    await s.load()
    await onNode('A')
    await s.contextPress(ko.context.copy)
    const at = await s.deselect()
    await s.contextAt(at.x, at.y)
    await s.contextPress(ko.context.paste)
    await nodesAre(7)
    const doc = await s.savedDoc()
    assert.ok(doc.nodes.find((node) => node.text === 'A' && node.parentId === null), 'free')
  })
  await test('Undo and Redo from the menu', async () => {
    await s.load()
    await s.clickNode('C')
    await s.key('Delete')
    await nodesAre(4)
    await onCanvas()
    await s.contextPress(ko.toolbar.undo)
    await nodesAre(5)
    await onCanvas()
    await s.contextPress(ko.toolbar.redo)
    await nodesAre(4)
  })
  await test('Delete one, and several', async () => {
    await s.load()
    await onNode('C')
    await s.contextPress(ko.context.delete)
    await nodesAre(4)
    await s.clickNode('A')
    await s.clickNode('B', { modifiers: CTRL })
    await onNode('B')
    await s.contextPress(ko.context.deleteSelected.replace('{{count}}', '2'))
    await nodesAre(1)
  })
  await test('New, Open and Save from the menu', async () => {
    const file = await s.load()
    await s.clickNode('C')
    await s.key('Delete')
    await nodesAre(4)
    await onCanvas()
    await s.contextPress(ko.toolbar.save)
    await s.until(`!document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).nodes.length, 4)
    await onCanvas()
    await s.contextPress(ko.toolbar.new)
    await nodesAre(1)
    await s.answerDialogs({ open: file })
    await onCanvas()
    await s.contextPress(ko.toolbar.open)
    await nodesAre(4)
  })
  for (const [label, dialog] of [[ko.toolbar.print, 'print'], [ko.toolbar.export, 'export']]) {
    await test(`${dialog} from the menu`, async () => {
      await s.load()
      await onCanvas()
      await s.contextPress(label)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      await s.key('Escape')
    })
  }
  await test('Memo and Picture from the menu', async () => {
    await s.load()
    await onNode('B')
    await s.contextPress(ko.memo.add)
    await s.until(`document.querySelector('.memo-note')`)
    const svg = s.file('context.svg')
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>')
    await s.answerDialogs({ pick: svg })
    await onCanvas()
    await s.contextPress(ko.toolbar.image)
    await nodesAre(6)
  })
  await test('Select All from the menu', async () => {
    await s.load()
    await onCanvas()
    await s.contextPress(ko.context.selectAll)
    assert.deepEqual((await s.selected()).sort(), ['A', 'A1', 'B', 'C', 'Root'])
    assert.ok(await s.page.evaluate(`document.querySelector('[data-selection-count]').textContent.includes('5')`))
  })
  await test('Auto Align, Center and Grid from the menu', async () => {
    await s.load()
    const before = await s.box('A1')
    await onCanvas()
    await s.contextPress(ko.toolbar.align)
    await sleep(40)
    assert.notDeepEqual(await s.box('A1'), before)
    const at = await s.rect('B')
    await s.wheel(at.x, at.y, -100, 2)
    await sleep(60)
    const zoomed = await s.zoomText()
    await onCanvas()
    await s.contextPress(ko.toolbar.reset)
    await sleep(40)
    assert.equal(await s.zoomText(), zoomed, 'Center keeps the zoom, as it does in the toolbar')
    await onCanvas()
    await s.contextPress(ko.context.hideGrid)
    await s.until(`!document.querySelector('.canvas-grid')`)
    await onCanvas()
    await s.contextPress(ko.context.showGrid)
    await s.until(`document.querySelector('.canvas-grid')`)
  })
  await test('a memo has the menu too, as its shape\'s', async () => {
    await s.load(memoFixture())
    await s.until(`document.querySelector('.memo-note')`)
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('.memo-note path').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 } })()`)
    await s.contextAt(at.x, at.y)
    assert.deepEqual(await s.selected(), ['B'])
    assert.equal((await s.contextItem(ko.context.delete)).disabled, false)
    await s.key('Escape')
  })
  await test('the menu closes on a click elsewhere, without acting', async () => {
    await s.load()
    await onCanvas()
    const at = await s.rect('B')
    await s.mouse('mousePressed', at.x, at.y, { button: 'left', buttons: 1, clickCount: 1 })
    await s.mouse('mouseReleased', at.x, at.y, { button: 'left', clickCount: 1 })
    await s.until(`!document.querySelector('.context-menu')`)
    assert.equal(await s.nodeCount(), 5)
  })
  await test('a title row menu and a drop-down close on a click on a shape, too', async () => {
    await s.load()
    await s.clickNode('A')
    const at = await s.rect('B')
    const pressShape = async () => {
      await s.mouse('mousePressed', at.x, at.y, { button: 'left', buttons: 1, clickCount: 1 })
      await s.mouse('mouseReleased', at.x, at.y, { button: 'left', clickCount: 1 })
    }
    await s.click('[data-menu="edit"] .tb-btn')
    await s.until(`document.querySelector('.tb-menu-floating')`)
    await pressShape()
    await s.until(`!document.querySelector('.tb-menu-floating')`)
    await s.page.evaluate(`document.querySelector('[data-line-theme] .tb-btn').click()`)
    await s.until(`document.querySelector('.tb-menu-floating')`)
    await pressShape()
    await s.until(`!document.querySelector('.tb-menu-floating')`)
  })
  await s.stop()
})

suite('Properties: shapes and text', async (test) => {
  const s = await session()
  const panel = '.right-panel'
  const SHAPES = Object.keys(ko.shape)
  await test('with nothing selected the panel says so', async () => {
    await s.load()
    await s.deselect()
    assert.equal(await s.text('.panel-empty'), ko.panel.noSelection)
  })
  await test(`all ${SHAPES.length} shapes draw differently, and are saved`, async () => {
    await s.load()
    await s.clickNode('B')
    const drawn = new Set()
    for (const shape of SHAPES) {
      await s.pickPalette('shape', shape)
      drawn.add(await s.page.evaluate(`${s.nodeEl('B')}.querySelector('.node-shape').getAttribute('d')`))
      assert.equal(byText(await s.savedDoc(), 'B').shape, shape)
    }
    assert.equal(drawn.size, SHAPES.length)
  })
  await test('a new shape takes the shape last chosen', async () => {
    await s.load()
    await s.clickNode('B')
    await s.pickPalette('shape', 'hexagon')
    await s.menu('edit', ko.context.addChild)
    const doc = await s.savedDoc()
    assert.equal(doc.nodes.find((node) => node.parentId === 'B').shape, 'hexagon')
  })
  await test('a shape colour from the chips, and from the colour field', async () => {
    await s.load()
    await s.clickNode('B')
    assert.equal(await s.count('[data-palette="shapeColor"] [data-color]'), 20)
    await s.click('[data-palette="shapeColor"] [data-color="#fca5a5"]')
    await s.until(`${s.nodeEl('B')}.querySelector('.node-shape').getAttribute('fill') === '#fca5a5'`)
    assert.equal(await s.count('[data-palette="shapeColor"] .color-chip.selected'), 1)
    await s.setValue('[data-palette="shapeColor"] input[type="color"]', '#123456')
    await s.until(`${s.nodeEl('B')}.querySelector('.node-shape').getAttribute('fill') === '#123456'`)
    assert.equal(await s.count('[data-palette="shapeColor"] .color-other.selected'), 1, 'another colour is marked as such')
    assert.equal(byText(await s.savedDoc(), 'B').color, '#123456')
  })
  await test('the text colour, and back to automatic', async () => {
    await s.load()
    await s.clickNode('B')
    const tspan = `${s.nodeEl('B')}.querySelector('tspan')`
    await s.click('[data-palette="textColor"] [data-color="#ef4444"]')
    await s.until(`${tspan}.getAttribute('fill') === '#ef4444'`)
    await s.click(`${panel} .auto-color`)
    await s.until(`${tspan}.getAttribute('fill') !== '#ef4444'`)
    assert.equal(byText(await s.savedDoc(), 'B').textStyle.color, 'auto')
  })
  await test('bold, italic, underline and strike go on and off, from the panel', async () => {
    await s.load()
    await s.clickNode('B')
    const attr = (name) => s.page.evaluate(`${s.nodeEl('B')}.querySelector('tspan').getAttribute(${js(name)})`)
    const press = (index) => s.page.evaluate(`document.querySelectorAll('${panel} .text-style-row button')[${index}].click()`)
    assert.equal(await attr('font-weight'), '700')
    await press(0)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-weight') === '500'`)
    await press(1)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-style') === 'italic'`)
    await press(2)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('text-decoration') === 'underline'`)
    await press(3)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('text-decoration') === 'underline line-through'`)
    const style = byText(await s.savedDoc(), 'B').textStyle
    assert.deepEqual([style.bold, style.italic, style.underline, style.strike], [false, true, true, true])
    await press(2)
    await press(3)
    await s.until(`!${s.nodeEl('B')}.querySelector('tspan').getAttribute('text-decoration')`)
  })
  await test('bold, italic, underline and strike from the toolbar, which shows the state', async () => {
    await s.load()
    await s.clickNode('B')
    for (const command of ['italic', 'underline', 'strike']) {
      await s.click(`[data-command="${command}"]`)
      await s.until(`document.querySelector('[data-command="${command}"]').getAttribute('aria-pressed') === 'true'`)
    }
    const style = byText(await s.savedDoc(), 'B').textStyle
    assert.deepEqual([style.italic, style.underline, style.strike], [true, true, true])
    await s.click('[data-command="bold"]')
    await s.until(`document.querySelector('[data-command="bold"]').getAttribute('aria-pressed') === 'false'`)
  })
  await test('the font tools are off with nothing selected', async () => {
    await s.load()
    await s.deselect()
    for (const command of ['bold', 'italic', 'underline', 'strike']) assert.equal(await s.page.evaluate(`document.querySelector('[data-command="${command}"]').disabled`), true, command)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-field="toolbarFontSize"] input').disabled`), true)
  })
  await test('the font size: − and + in the toolbar, stopping at its limits; typed in; on the shape', async () => {
    await s.load()
    await s.clickNode('B')
    const size = () => s.page.evaluate(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-size')`)
    await s.setValue('[data-field="toolbarFontSize"] input', '119')
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-size') === '119'`)
    await s.step('toolbarFontSize')
    await s.step('toolbarFontSize')
    await s.until(`document.querySelector('[data-field="toolbarFontSize"] input').value === '120'`)
    assert.equal(await size(), '120')
    await s.setValue('[data-field="toolbarFontSize"] input', '9')
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-size') === '9'`)
    await s.step('toolbarFontSize', false)
    await s.step('toolbarFontSize', false)
    await s.until(`document.querySelector('[data-field="toolbarFontSize"] input').value === '8'`)
  })
  await test('the panel\'s font size has the same limits', async () => {
    await s.load()
    await s.clickNode('B')
    await s.page.evaluate(`document.querySelector('[data-field="panelFontSize"] input').focus()`)
    await s.setValue('[data-field="panelFontSize"] input', '1000')
    await s.page.evaluate(`document.querySelector('[data-field="panelFontSize"] input').blur()`)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-size') === '120'`)
    await s.step('panelFontSize', false)
    await s.until(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-size') === '119'`)
  })
  await test('every preset font reaches the shape, from the panel', async () => {
    await s.load()
    await s.clickNode('B')
    const seen = new Set()
    for (const font of ['outfit', 'serif', 'mono', 'notoSansKr']) {
      await s.pickDropdown(panel, ko.panel.font, ko.font[font])
      seen.add(await s.page.evaluate(`${s.nodeEl('B')}.querySelector('tspan').getAttribute('font-family')`))
      assert.equal(byText(await s.savedDoc(), 'B').textStyle.fontFamily, font)
    }
    assert.equal(seen.size, 4)
  })
  await test('an installed font can be chosen and is saved by name', async () => {
    await s.load()
    await s.clickNode('B')
    await s.page.evaluate(`[...document.querySelectorAll('[data-font-menu] .tb-btn')][0].click()`)
    await s.until(`document.querySelectorAll('.tb-menu-floating .tb-menu-item').length > 4`, 10000)
    const name = await s.page.evaluate(`document.querySelectorAll('.tb-menu-floating .tb-menu-item')[4].textContent.replace('✓', '').trim()`)
    await s.page.evaluate(`document.querySelectorAll('.tb-menu-floating .tb-menu-item')[4].click()`)
    await s.until(`document.querySelector('[data-font-menu] .tb-dropdown').dataset.value === ${js(name)}`)
    assert.equal(byText(await s.savedDoc(), 'B').textStyle.fontFamily, name)
  })
  await test('with several shapes selected, a shape, a colour and a text style go to all of them', async () => {
    await s.load()
    await s.clickNode('A')
    await s.clickNode('B', { modifiers: CTRL })
    await s.pickPalette('shape', 'hexagon')
    await s.click('[data-command="italic"]')
    await sleep(40)
    const doc = await s.savedDoc()
    for (const name of ['A', 'B']) {
      assert.equal(byText(doc, name).shape, 'hexagon')
      assert.equal(byText(doc, name).textStyle.italic, true)
    }
    assert.equal(byText(doc, 'C').shape, 'rounded')
    assert.equal(byText(doc, 'C').textStyle.italic, false)
  })
  await s.stop()
})

suite('Properties: icons instead of lists', async (test) => {
  const s = await session()
  const SHAPE_PALETTES = ['shape', 'shapeColor', 'textColor']
  const LINE_PALETTES = ['lineTheme', 'lineShape', 'linePattern', 'startCap', 'endCap', 'lineColor', 'fromSide', 'toSide']
  await test('a shape\'s panel shows its choices as small icons; only the font is a list', async () => {
    await s.load()
    await s.clickNode('B')
    for (const id of [...SHAPE_PALETTES, ...LINE_PALETTES]) assert.equal(await s.count(`.right-panel [data-palette="${id}"]`), 1, id)
    assert.equal(await s.count('.right-panel .tb-dropdown-trigger'), 1, 'only the font')
    await s.shoot('panel-shape')
  })
  await test('a line\'s panel names the two shapes, and shows its choices as small icons', async () => {
    await s.load()
    await s.clickEdge(0)
    assert.ok((await s.text('[data-line-between]')).includes('Root → A'))
    for (const id of LINE_PALETTES) assert.equal(await s.count(`.right-panel [data-palette="${id}"]`), 1, id)
    assert.equal(await s.count('.right-panel .tb-dropdown-trigger'), 0)
    await s.shoot('panel-line')
  })
  await test('each line style stands on one row with its label, and none is cut or leaves the panel', async () => {
    await s.load()
    await s.clickEdge(0)
    const rows = await s.page.evaluate(`['lineShape', 'linePattern', 'startCap', 'endCap', 'fromSide', 'toSide'].map((id) => {
      const palette = document.querySelector('[data-palette="' + id + '"]')
      const label = palette.querySelector('.palette-label').getBoundingClientRect()
      const items = [...palette.querySelectorAll('.palette-item')].map((e) => e.getBoundingClientRect())
      const pictures = [...palette.querySelectorAll('.palette-item svg')].map((e) => e.getBoundingClientRect().width)
      const body = palette.closest('.panel-group-body').getBoundingClientRect()
      return { id, rows: new Set(items.map((r) => Math.round(r.top))).size, height: palette.getBoundingClientRect().height, labelLeft: label.right <= items[0].left, oneLine: label.height < 20, inside: items.at(-1).right <= body.right, narrowest: Math.min(...items.map((r) => r.width)), picture: Math.min(...pictures) }
    })`)
    for (const row of rows) {
      assert.equal(row.rows, 1, js(row))
      assert.ok(row.height <= 30, js(row))
      assert.ok(row.labelLeft && row.oneLine && row.inside, js(row))
      assert.ok(row.narrowest >= 20 && row.picture >= 16, js(row))
    }
    const width = await s.page.evaluate(`(() => { const f = document.querySelector('[data-field="lineWidth"]').getBoundingClientRect(); const l = document.querySelector('[data-field="lineWidth"]').previousElementSibling.getBoundingClientRect(); return { sameRow: Math.abs((f.top + f.height / 2) - (l.top + l.height / 2)) < 6, order: l.right <= f.left } })()`)
    assert.deepEqual(width, { sameRow: true, order: true })
  })
  await test('the line themes are small, and fill every row of their columns', async () => {
    await s.load()
    await s.clickEdge(0)
    const seen = await s.page.evaluate(`(() => {
      const items = [...document.querySelectorAll('[data-palette="lineTheme"] .palette-item')].map((e) => e.getBoundingClientRect())
      const rows = new Map()
      for (const r of items) rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) ?? 0) + 1)
      return { count: items.length, perRow: [...rows.values()], height: Math.max(...items.map((r) => r.height)) }
    })()`)
    assert.equal(seen.count, 15)
    assert.deepEqual(seen.perRow, [5, 5, 5], 'a row with a hole')
    assert.ok(seen.height <= 20, `${seen.height} px high`)
  })
  await test('thirty shapes', async () => {
    await s.load()
    await s.clickNode('B')
    assert.equal(await s.count('[data-palette="shape"] .palette-item'), 30)
    assert.equal(await s.page.evaluate(`[...document.querySelectorAll('[data-palette="shape"] .palette-item')].filter((b) => b.querySelector('path')?.getAttribute('d')).length`), 30)
    const drawn = await s.page.evaluate(`[...document.querySelectorAll('[data-palette="shape"] .palette-item path')].map((p) => { const r = p.getBoundingClientRect(); return [p.closest('button').dataset.value, r.width / r.height] })`)
    for (const [shape, ratio] of drawn) assert.ok(ratio < 1.7, `${shape} is spread out sideways: ${ratio}`)
  })
  await test('each icon names itself: a tooltip, in the language in use, and for the screen reader', async () => {
    await s.load()
    await s.clickNode('B')
    const names = await s.page.evaluate(`[...document.querySelectorAll('.right-panel .palette-item, .right-panel .color-chip, .right-panel .color-other, .right-panel .text-style-row button')].map((b) => [b.getAttribute('title') ?? b.getAttribute('data-tip'), b.getAttribute('aria-label') ?? b.querySelector('input')?.getAttribute('aria-label') ?? b.textContent])`)
    assert.ok(names.length > 90, String(names.length))
    for (const [tip, label] of names) {
      assert.ok(tip, 'no tooltip')
      assert.ok(label, 'no name')
    }
    assert.equal(await s.page.evaluate(`document.querySelector('[data-palette="shape"] [data-value="heart"]').getAttribute('aria-label')`), ko.shape.heart)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-palette="linePattern"] [data-value="dashed"]').getAttribute('aria-label')`), ko.linePattern.dashed)
  })
  await test('the tooltip really appears over a small icon', async () => {
    await s.load()
    await s.clickNode('B')
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('[data-palette="shape"] [data-value="star"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    for (let i = 0; i < 12 && (await s.text('.fast-tip')) !== ko.shape.star; i++) {
      await s.mouse('mouseMoved', at.x + (i % 2), at.y)
      await sleep(160)
    }
    assert.equal(await s.text('.fast-tip'), ko.shape.star)
    await s.shoot('panel-tooltip')
    await s.mouse('mouseMoved', 700, 400)
  })
  await test('the chosen one is marked, and follows the selection', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A' ? { ...node, shape: 'star', color: '#fca5a5' } : node)), edges: doc.edges.map((edge) => (edge.to === 'A' ? { ...edge, linePattern: 'dotted' } : edge)) })))
    const marked = (id) => s.page.evaluate(`[...document.querySelectorAll('[data-palette="${id}"] .palette-item.on')].map((b) => b.dataset.value)`)
    await s.clickNode('A')
    assert.deepEqual(await marked('shape'), ['star'])
    assert.equal(await s.page.evaluate(`document.querySelector('[data-palette="shapeColor"] .color-chip.selected').dataset.color`), '#fca5a5')
    await s.clickNode('B')
    assert.deepEqual(await marked('shape'), ['rounded'])
    await s.clickEdge(0)
    assert.deepEqual(await marked('linePattern'), ['dotted'])
    assert.equal(await s.page.evaluate(`document.querySelector('[data-palette="shape"] [data-value="star"]')`), null, 'a line has no shape')
  })
  await test('the icons fit the panel, are big enough to press, and nothing runs out sideways, in light and dark', async () => {
    for (const theme of ['light-classic', 'dark-midnight']) {
      await s.click('[data-command="theme"]')
      await s.click(`[data-theme-option="${theme}"]`)
      await s.load()
      await s.clickNode('B')
      await s.page.evaluate(`document.querySelector('.right-panel .panel-section').scrollTop = 0`)
      const look = await s.page.evaluate(`(() => {
        const panel = document.querySelector('.right-panel .panel-section')
        const box = panel.getBoundingClientRect()
        const items = [...panel.querySelectorAll('.palette-item, .color-chip')].map((e) => e.getBoundingClientRect())
        const pictures = [...panel.querySelectorAll('.palette-item svg')].map((e) => [e.getBoundingClientRect(), e.parentElement.getBoundingClientRect()])
        return {
          over: panel.scrollWidth - panel.clientWidth,
          smallest: Math.min(...items.map((r) => r.width)),
          lowest: Math.min(...items.map((r) => r.height)),
          out: items.filter((r) => r.left < box.left || r.right > box.right).length,
          // Inside the frame of its group, not only of the panel.
          outOfGroup: [...panel.querySelectorAll('.color-chip')].filter((e) => e.getBoundingClientRect().right > e.closest('.panel-group-body').getBoundingClientRect().right - 7).length,
          clipped: pictures.filter(([p, b]) => p.width > b.width + 0.5).length,
        }
      })()`)
      assert.ok(look.over <= 0, `${theme}: ${js(look)}`)
      assert.equal(look.out, 0, `${theme}: ${js(look)}`)
      assert.equal(look.outOfGroup, 0, `${theme}: a colour leaves its group, ${js(look)}`)
      assert.equal(look.clipped, 0, `${theme}: a picture is cut, ${js(look)}`)
      assert.ok(look.smallest >= 16 && look.lowest >= 16, `${theme}: too small, ${js(look)}`)
      await s.shoot(`panel-${theme}`)
    }
    await s.click('[data-command="theme"]')
    await s.click('[data-theme-option="light-classic"]')
  })
  await test('each group folds under its heading, and opens again', async () => {
    await s.load()
    await s.clickNode('B')
    for (const group of ['shape', 'text', 'line', 'connection', 'memo']) {
      const shown = (id) => s.page.evaluate(`document.querySelector('[data-group="${id}"]').open`)
      assert.equal(await shown(group), true, group)
      await s.click(`[data-group="${group}"] > summary`)
      assert.equal(await shown(group), false, group)
      await s.click(`[data-group="${group}"] > summary`)
      assert.equal(await shown(group), true, group)
    }
  })
  await test('a folded group stays folded while another shape is selected', async () => {
    await s.load()
    await s.clickNode('B')
    await s.click('[data-group="line"] > summary')
    await s.clickNode('C')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-group="line"]').open`), false)
    await s.click('[data-group="line"] > summary')
  })
  await test('with nothing selected, the panel says what can be done', async () => {
    await s.load()
    await s.deselect()
    assert.equal(await s.count('[data-panel-hints] li'), 5)
    assert.equal(await s.count('[data-panel-hints] li .icon'), 5)
    await s.shoot('panel-empty')
  })
  await test('each new shape: filled in its middle, lines end on what is drawn, saved and read back', async () => {
    const NEW = ['triangle', 'triangleDown', 'pentagon', 'star', 'cross', 'heart', 'cloud', 'shield', 'callout', 'document', 'tag', 'arrowRight', 'arrowLeft', 'arrowBoth', 'snip', 'folder', 'plaque', 'wave']
    for (const shape of NEW) {
      await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'B' ? { ...node, shape } : node)), edges: doc.edges.map((edge) => ({ ...edge, lineType: 'straight' })) })))
      const seen = await s.page.evaluate(`(() => {
        const path = ${s.nodeEl('B')}.querySelector('.node-shape')
        const box = path.getBBox()
        const point = path.ownerSVGElement.createSVGPoint()
        point.x = box.x + box.width / 2
        point.y = box.y + box.height / 2
        const line = document.querySelectorAll('.edge-hit')[1]
        const end = line.getPointAtLength(line.getTotalLength())
        const onOutline = (() => {
          // Close to the outline: inside it a little further in, outside it a little further out.
          const inward = path.ownerSVGElement.createSVGPoint()
          const outward = path.ownerSVGElement.createSVGPoint()
          const k = Math.hypot(point.x - end.x, point.y - end.y) || 1
          inward.x = end.x + ((point.x - end.x) / k) * 3
          inward.y = end.y + ((point.y - end.y) / k) * 3
          outward.x = end.x - ((point.x - end.x) / k) * 3
          outward.y = end.y - ((point.y - end.y) / k) * 3
          return path.isPointInFill(inward) && !path.isPointInFill(outward)
        })()
        return { filled: path.isPointInFill(point), width: box.width, height: box.height, onOutline }
      })()`)
      assert.ok(seen.filled, `${shape} has a hole in its middle`)
      near(seen.width, 140, `${shape} width`, 1)
      near(seen.height, 44, `${shape} height`, 1)
      assert.ok(seen.onOutline, `${shape}: the line does not end on the outline`)
      assert.equal(byText(await s.savedDoc(), 'B').shape, shape)
    }
  })
  await s.stop()
})

suite('The folded left panel', async (test) => {
  const s = await session()
  const fold = async () => {
    await s.load()
    if (await s.count('[data-panel-fold="left"]')) await s.click('[data-panel-fold="left"]')
    await s.until(`document.querySelector('[data-panel-strip="left"]')`)
  }
  const entries = () => s.page.evaluate(`[...document.querySelectorAll('.left-panel .panel-strip')].map((b) => ({ words: b.querySelector('span').textContent, icons: b.querySelectorAll('.icon').length, tip: b.getAttribute('title') ?? b.getAttribute('data-tip') }))`)
  await test('it lists the node list, the mind map themes and the icons, each with its icon and a tooltip', async () => {
    await fold()
    const seen = await entries()
    assert.deepEqual(seen.map((entry) => entry.words), [ko.panel.nodes, ko.toolbar.diagramTheme, ko.toolbar.icons])
    for (const entry of seen) {
      assert.ok(entry.icons >= 1, entry.words)
      assert.ok(entry.tip, entry.words)
    }
    await s.shoot('left-strip')
  })
  await test('all of it fits the strip, in the smallest window height too, in both languages', async () => {
    const fits = () => s.page.evaluate(`(() => {
      const strip = document.querySelector('.left-panel').getBoundingClientRect()
      return [...document.querySelectorAll('.left-panel .panel-strip')].every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= strip.bottom && r.right <= strip.right + 0.5 && b.querySelector('span').getBoundingClientRect().right <= strip.right + 0.5 })
    })()`)
    await s.page.send('Emulation.setDeviceMetricsOverride', { width: 1488, height: 560, deviceScaleFactor: 1, mobile: false })
    try {
      await sleep(100)
      assert.equal(await fits(), true, 'Korean')
      await s.click('[data-command="language"]')
      await s.until(`document.documentElement.lang === 'en'`)
      assert.deepEqual((await entries()).map((entry) => entry.words), [en.panel.nodes, en.toolbar.diagramTheme, en.toolbar.icons])
      assert.equal(await fits(), true, 'English')
      await s.click('[data-command="language"]')
      await s.until(`document.documentElement.lang === 'ko'`)
    } finally {
      await s.page.send('Emulation.clearDeviceMetricsOverride')
    }
  })
  await test('the node list entry opens the panel', async () => {
    await fold()
    await s.click('[data-panel-strip="left"]')
    await s.until(`document.querySelector('[data-panel-fold="left"]')`)
    assert.equal(await s.count('.node-tree'), 1)
  })
  await test('the icons entry opens the panel on the icons', async () => {
    await fold()
    await s.click('[data-panel-strip-tab="icons"]')
    await s.until(`document.querySelector('.node-icon-grid')`)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-lower-tab="icons"]').getAttribute('aria-selected')`), 'true')
    await settled(() => s.app.settings().leftPanel, true)
  })
  await test('the themes entry opens the panel on the themes, also after the icons were showing', async () => {
    await fold()
    await s.click('[data-panel-strip-tab="themes"]')
    await s.until(`document.querySelector('.diagram-theme-grid')`)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-lower-tab="themes"]').getAttribute('aria-selected')`), 'true')
  })
  await test('the tabs still change by hand, and the tab stays through folding', async () => {
    await s.click('[data-lower-tab="icons"]')
    await s.until(`document.querySelector('.node-icon-grid')`)
    await fold()
    await s.click('[data-panel-strip="left"]')
    await s.until(`document.querySelector('.node-icon-grid')`)
    await s.click('[data-lower-tab="themes"]')
  })
  await test('the right panel\'s strip stays one entry', async () => {
    await s.click('[data-panel-fold="right"]')
    await s.until(`document.querySelector('[data-panel-strip="right"]')`)
    assert.equal(await s.count('.right-panel .panel-strip'), 1)
    await s.click('[data-panel-strip="right"]')
    await s.until(`document.querySelector('[data-panel-fold="right"]')`)
  })
  await s.stop()
})

suite('Properties: lines', async (test) => {
  const s = await session()
  const panel = '.right-panel'
  await test('all four line shapes draw differently, are saved, and the root kind is a filled ribbon', async () => {
    await s.load()
    await s.clickEdge(1)
    const drawn = new Set()
    for (const kind of ['straight', 'elbow', 'curve', 'root']) {
      await s.pickPalette('lineShape', kind)
      drawn.add(await s.page.evaluate(`document.querySelectorAll('.edge-hit')[1].getAttribute('d')`))
      assert.equal(edgeOf(await s.savedDoc(), 'Root', 'B').lineType, kind)
      if (kind !== 'root') continue
      assert.equal(await s.page.evaluate(`document.querySelectorAll('.edge-hit')[1].getAttribute('fill')`), '#94a3b8')
    }
    assert.ok(drawn.size >= 3, `${drawn.size} kinds, and B lies straight ahead so a curve may equal a straight line`)
  })
  await test('all four patterns dash differently', async () => {
    await s.load()
    await s.clickEdge(0)
    const dashes = new Set()
    for (const pattern of ['dashed', 'dotted', 'dashdot', 'solid']) {
      await s.pickPalette('linePattern', pattern)
      dashes.add(await s.lineAttr(0, 'stroke-dasharray'))
      assert.equal(edgeOf(await s.savedDoc(), 'Root', 'A').linePattern, pattern)
    }
    assert.equal(dashes.size, 4)
    assert.equal(await s.lineAttr(0, 'stroke-dasharray'), null, 'solid has no dashes')
  })
  for (const [attribute, field] of [['marker-start', 'startCap'], ['marker-end', 'endCap']]) {
    await test(`${field}: arrow, dot and diamond are drawn in the colour of the line, and none takes them off`, async () => {
      await s.load()
      await s.clickEdge(0)
      for (const cap of ['arrow', 'dot', 'diamond']) {
        await s.pickPalette(field, cap)
        const url = await s.lineAttr(0, attribute)
        assert.match(url, new RegExp(`^url\\(#cap-${cap}-`))
        assert.ok(await s.page.evaluate(`!!document.getElementById(${js(url.slice(5, -1))})`), 'the marker exists')
        assert.equal(edgeOf(await s.savedDoc(), 'Root', 'A')[field], cap)
      }
      await s.pickPalette(field, 'none')
      assert.equal(await s.lineAttr(0, attribute), null)
    })
  }
  await test('the line colour: from the chips, with the arrow in the same colour', async () => {
    await s.load()
    await s.clickEdge(0)
    await s.pickPalette('endCap', 'arrow')
    await s.click('[data-palette="lineColor"] [data-color="#ef4444"]')
    await s.until(`document.querySelector('marker[id^="cap-arrow"] path')?.getAttribute('fill') === '#ef4444'`)
    await s.clickNode('Root')
    assert.equal(await s.lineAttr(0, 'stroke'), '#ef4444')
    assert.equal(edgeOf(await s.savedDoc(), 'Root', 'A').color, '#ef4444')
  })
  await test('the line width: −, +, its limits, typed; and the root ribbon grows with it', async () => {
    await s.load()
    await s.clickEdge(1)
    await s.setValue('[data-field="lineWidth"] input', '19')
    await s.step('lineWidth')
    await s.step('lineWidth')
    await s.until(`document.querySelector('[data-field="lineWidth"] input').value === '20'`)
    await s.setValue('[data-field="lineWidth"] input', '2')
    await s.step('lineWidth', false)
    await s.step('lineWidth', false)
    await s.until(`document.querySelector('[data-field="lineWidth"] input').value === '1'`)
    assert.equal(edgeOf(await s.savedDoc(), 'Root', 'B').width, 1)
    await s.pickPalette('lineShape', 'root')
    const area = async () => s.page.evaluate(`(() => { const b = document.querySelectorAll('.edge-hit')[1].getBBox(); return b.height })()`)
    const thin = await area()
    await s.setValue('[data-field="lineWidth"] input', '10')
    await s.until(`document.querySelector('[data-field="lineWidth"] input').value === '10'`)
    assert.ok((await area()) > thin, 'the ribbon is thicker')
  })
  const end = (index, part) => s.page.evaluate(`(() => { const p = document.querySelectorAll('.edge-hit')[${index}]; const l = p.getPointAtLength(${part === 'from' ? '0' : 'p.getTotalLength()'}); return { x: l.x, y: l.y } })()`)
  const checkFace = (point, box, side) => {
    if (side === 'top') near(point.y, box.y, side)
    if (side === 'bottom') near(point.y, box.y + box.height, side)
    if (side === 'left') near(point.x, box.x, side)
    if (side === 'right') near(point.x, box.x + box.width, side)
  }
  for (const [part, owner, field] of [['from', 'Root', 'fromSide'], ['to', 'B', 'toSide']]) {
    for (const side of ['top', 'bottom', 'left', 'right']) {
      await test(`${field} ${side}: the line ends on that face of the shape`, async () => {
        await s.load()
        await s.clickEdge(1)
        await s.pickPalette(field, side)
        checkFace(await end(1, part), await s.box(owner), side)
        assert.equal(edgeOf(await s.savedDoc(), 'Root', 'B')[field], side)
      })
    }
  }
  await test('a face can be set back to automatic', async () => {
    await s.load()
    await s.clickEdge(1)
    await s.pickPalette('fromSide', 'top')
    await s.pickPalette('fromSide', 'auto')
    assert.equal(edgeOf(await s.savedDoc(), 'Root', 'B').fromSide, 'auto')
  })
  await test('with a shape selected, the panel\'s line settings go to all its lines and only those', async () => {
    await s.load()
    await s.clickNode('A')
    await s.pickPalette('linePattern', 'dashed')
    const doc = await s.savedDoc()
    assert.equal(edgeOf(doc, 'Root', 'A').linePattern, 'dashed')
    assert.equal(edgeOf(doc, 'A', 'A1').linePattern, 'dashed')
    assert.equal(edgeOf(doc, 'Root', 'B').linePattern, 'solid')
  })
  await test('a new line takes the kind and pattern last chosen', async () => {
    await s.load()
    await s.clickEdge(0)
    await s.pickPalette('lineShape', 'elbow')
    await s.pickPalette('linePattern', 'dotted')
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    const doc = await s.savedDoc()
    const line = doc.edges.find((edge) => edge.from === 'B')
    assert.equal(line.lineType, 'elbow')
    assert.equal(line.linePattern, 'dotted')
  })
  await test('the panel\'s line theme drop-down restyles the diagram', async () => {
    await s.load()
    await s.clickNode('B')
    await s.pickPalette('lineTheme', 'rainbow')
    assert.equal((await s.savedDoc()).lineTheme, 'rainbow')
  })
  await s.stop()
})

suite('Layouts and modes', async (test) => {
  const s = await session()
  const pick = (layout) => s.pickDropdown('.toolbar', ko.toolbar.layout, ko.layout[layout])
  const centre = async (name) => {
    const box = await s.box(name)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const noOverlap = async (names) => {
    const boxes = await Promise.all(names.map((name) => s.box(name)))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${names[i]} and ${names[j]} overlap`)
      }
    }
  }
  const NAMES = ['Root', 'A', 'B', 'C', 'A1']
  for (const [layout, check] of [
    ['ltr', (root_, child) => assert.ok(child.x > root_.x, 'to the right')],
    ['rtl', (root_, child) => assert.ok(child.x < root_.x, 'to the left')],
    ['ttb', (root_, child) => assert.ok(child.y > root_.y, 'below')],
    ['btt', (root_, child) => assert.ok(child.y < root_.y, 'above')],
    ['radial', (root_, child) => assert.ok(Math.hypot(child.x - root_.x, child.y - root_.y) > 100, 'around')],
  ]) {
    await test(`mind map ${layout}: the branches go the way it says, without overlaps; it is shown and saved`, async () => {
      await s.load()
      await pick(layout)
      await sleep(40)
      const middle = await centre('Root')
      for (const name of ['A', 'B', 'C']) check(middle, await centre(name))
      await noOverlap(NAMES)
      assert.ok((await s.page.evaluate(`document.querySelector('.status-bar').textContent`)).includes(ko.layout[layout]))
      assert.equal(await s.page.evaluate(`document.querySelector('.toolbar .tb-dropdown[data-value="${layout}"]') !== null`), true)
      assert.equal((await s.savedDoc()).layout, layout)
    })
  }
  await test('a radial layout surrounds its centre', async () => {
    await s.load()
    await pick('radial')
    await sleep(40)
    const middle = await centre('Root')
    const places = await Promise.all(['A', 'B', 'C'].map(centre))
    assert.ok(places.some((p) => p.x < middle.x) && places.some((p) => p.x > middle.x), 'on both sides')
  })
  await test('a layout can be undone', async () => {
    await s.load()
    await pick('ttb')
    await sleep(40)
    await s.click('[data-command="undo"]')
    await s.until(`document.querySelector('.toolbar .tb-dropdown[data-value="ltr"]')`)
  })
  await test('the toolbar\'s mode buttons switch the view of the same content, there and back', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'B' ? { ...node, note: 'kept', icon: 'star', shape: 'hexagon' } : node)) })))
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    assert.equal(await s.count('.edge-hit'), 0, 'bones instead of lines')
    assert.equal(await s.nodeCount(), 5)
    let doc = await s.savedDoc()
    assert.equal(doc.mode, 'fishbone')
    assert.deepEqual(doc.nodes.map((node) => node.role), ['effect', 'category', 'category', 'category', 'cause'])
    assert.equal(byText(doc, 'B').note, 'kept')
    await s.click('[data-command="mode-mindmap"]')
    await s.until(`!document.querySelector('.fishbone-skeleton')`)
    assert.equal(await s.count('.edge-hit'), 4)
    doc = await s.savedDoc()
    assert.equal(doc.mode, 'mindmap')
    assert.equal(doc.nodes.some((node) => node.role), false, 'no roles left')
    assert.equal(byText(doc, 'B').icon, 'star')
    assert.equal(byText(doc, 'B').shape, 'hexagon')
  })
  await test('switching the mode can be undone', async () => {
    await s.load()
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    await s.click('[data-command="undo"]')
    await s.until(`!document.querySelector('.fishbone-skeleton')`)
  })
  await test('a fishbone offers only left and right, and its head lies at the end it points to', async () => {
    await s.load()
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    await s.page.evaluate(`[...document.querySelectorAll('.toolbar .tb-dropdown-trigger')].find((e) => e.getAttribute('aria-label') === ${js(ko.toolbar.layout)}).click()`)
    await s.until(`document.querySelector('.tb-menu-floating')`)
    assert.equal(await s.count('.tb-menu-floating .tb-menu-item'), 2)
    await s.key('Escape')
    const others = async () => Promise.all(['A', 'B', 'C'].map(centre))
    const head = await centre('Root')
    for (const place of await others()) assert.ok(place.x < head.x, 'ltr: the head on the right')
    await noOverlap(NAMES)
    await pick('rtl')
    await sleep(40)
    const turned = await centre('Root')
    for (const place of await others()) assert.ok(place.x > turned.x, 'rtl: the head on the left')
    await noOverlap(NAMES)
  })
  await test('fishbone: a new shape under the head is a category, under a category a cause', async () => {
    await s.load()
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    await s.clickNode('Root')
    await s.menu('edit', ko.context.addChild)
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    const doc = await s.savedDoc()
    assert.equal(doc.nodes.filter((node) => node.parentId === 'Root').at(-1).role, 'category')
    assert.equal(doc.nodes.find((node) => node.parentId === 'B').role, 'cause')
  })
  await test('fishbone: the bones take the colour, width and pattern of their line', async () => {
    await s.load()
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    await s.clickNode('B')
    await s.setValue('[data-field="lineWidth"] input', '9')
    await s.pickPalette('linePattern', 'dashed')
    await s.until(`document.querySelector('.fishbone-skeleton path[stroke-dasharray]')`)
    assert.equal(await s.page.evaluate(`document.querySelector('.fishbone-skeleton path[stroke-dasharray]').getAttribute('stroke-width')`), '9')
    await s.pickPalette('linePattern', 'solid')
    await s.until(`!document.querySelector('.fishbone-skeleton path[stroke-dasharray]')`)
  })
  await test('fishbone: a shape with causes grows a side bone', async () => {
    await s.load()
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    const before = await s.count('.fishbone-skeleton path')
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    await s.click('[data-command="align"]')
    await sleep(40)
    assert.ok((await s.count('.fishbone-skeleton path')) >= before + 2, 'a bone and a side bone')
  })
  await s.stop()
})

suite('Files, saving and unsaved work', async (test) => {
  const s = await session()
  const edit = async () => {
    await s.clickNode('C')
    await s.key('Delete')
    await s.until(`document.querySelector('[data-title-file]').textContent.endsWith('*')`)
  }
  await test('a new diagram asks for a name once, then saves to it without asking', async () => {
    await s.load()
    await s.answerDialogs({ saveDiagram: null })
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    const name = s.file('first-save.mmap')
    await s.answerDialogs({ saveDiagram: name })
    await s.click('[data-command="save"]')
    await s.until(`document.querySelector('[data-title-file]').textContent === 'first-save.mmap'`)
    fs.rmSync(name)
    await s.answerDialogs({ saveDiagram: s.file('asked-again.mmap') })
    await s.click('[data-command="save"]')
    const t0 = Date.now()
    while (!fs.existsSync(name) && Date.now() - t0 < 3000) await sleep(30)
    assert.ok(fs.existsSync(name), 'it saved to the file it has')
    assert.ok(!fs.existsSync(s.file('asked-again.mmap')), 'it asked again')
  })
  await test('cancelling the name changes nothing', async () => {
    await s.load()
    await edit()
    await s.answerDialogs({ saveDiagram: null })
    await s.key('s', CTRL | SHIFT)
    await sleep(100)
    assert.ok((await s.title()).endsWith('*'))
  })
  await test('cancelling Open changes nothing', async () => {
    const file = await s.load()
    await s.answerDialogs({ open: null })
    await s.click('[data-command="open"]')
    await sleep(100)
    assert.equal(await s.title(), path.basename(file))
    assert.equal(await s.nodeCount(), 5)
  })
  await test('a save that fails is said so, and the work stays unsaved', async () => {
    await s.load()
    await edit()
    await s.answerDialogs({ saveDiagram: path.join(s.file('no-such-folder'), 'deep', '<bad>.mmap') })
    await s.key('s', CTRL | SHIFT)
    await s.until(`document.querySelector('[data-dialog="message"]')`)
    await s.click('[data-command="message-ok"]')
    assert.ok((await s.title()).endsWith('*'))
  })
  await test('what is saved opens again the same, with everything a diagram can hold', async () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
    const rich = fixture((doc) => ({
      ...doc,
      layout: 'ttb',
      diagramTheme: 'forest',
      lineTheme: 'rainbow',
      nodes: [
        ...doc.nodes.map((node) => (node.id === 'A' ? { ...node, icon: 'rocket', note: 'on a shape', noteStyle: { color: '#112233', width: 200, dx: 12, dy: -8 }, shape: 'hexagon', color: '#abcdef', textStyle: { ...node.textStyle, italic: true, fontSize: 21, fontFamily: 'mono' } } : node)),
        { ...doc.nodes[0], id: 'pic', parentId: null, text: 'pic.png', x: 900, y: 500, image: { src: PNG, width: 2, height: 2 } },
      ],
      edges: doc.edges.map((edge) => (edge.to === 'B' ? { ...edge, note: 'on a line', width: 7, color: '#ff0000', lineType: 'elbow', linePattern: 'dashdot', startCap: 'dot', endCap: 'arrow', fromSide: 'top', toSide: 'left' } : edge)),
    }))
    await s.load(rich)
    const first = await s.savedDoc()
    await s.load(first)
    const second = await s.savedDoc()
    assert.deepEqual(second, first, 'open and save change nothing')
    const a = byText(first, 'A')
    assert.equal(a.icon, 'rocket')
    assert.equal(a.note, 'on a shape')
    assert.equal(a.noteStyle.width, 200)
    assert.equal(a.textStyle.fontSize, 21)
    assert.equal(first.diagramTheme, 'forest')
    assert.equal(first.lineTheme, 'rainbow')
    assert.equal(byText(first, 'pic.png').image.src, PNG)
    const line = edgeOf(first, 'Root', 'B')
    assert.equal(line.note, 'on a line')
    assert.equal(line.fromSide, 'top')
    assert.equal(await s.count('.node-hit image'), 1)
  })
  await test('a .mymind file opens too', async () => {
    await s.load()
    const file = s.file('old-name.mymind')
    fs.writeFileSync(file, JSON.stringify(fixture()))
    await s.answerDialogs({ open: file })
    await s.click('[data-command="open"]')
    await s.until(`document.querySelector('[data-title-file]').textContent === 'old-name.mymind'`)
  })
  await test('a file that is no diagram is said so, and the diagram on screen stays', async () => {
    await s.load()
    const file = s.file('not-a-diagram.mmap')
    fs.writeFileSync(file, 'this is not json')
    await s.answerDialogs({ open: file })
    await s.click('[data-command="open"]')
    await s.until(`document.querySelector('[data-dialog="message"]')`)
    assert.ok((await s.text('[data-message]')).includes('not-a-diagram'))
    await s.click('[data-command="message-ok"]')
    assert.equal(await s.nodeCount(), 5)
  })
  await test('a JSON file of something else is refused too', async () => {
    await s.load()
    const file = s.file('other-json.mmap')
    fs.writeFileSync(file, '{"hello":"world"}')
    await s.answerDialogs({ open: file })
    await s.click('[data-command="open"]')
    await s.until(`document.querySelector('[data-dialog="message"]')`)
    await s.click('[data-command="message-ok"]')
    assert.equal(await s.nodeCount(), 5)
  })
  await test('after a save and an Undo the file keeps its name, and the change counts as unsaved', async () => {
    const file = await s.load()
    await edit()
    await s.key('s', CTRL)
    await s.until(`!document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    await s.page.evaluate(`document.activeElement?.blur?.()`)
    await s.click('[data-command="undo"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '5'`)
    assert.equal(await s.title(), `${path.basename(file)} *`)
    await s.click('[data-command="redo"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '4'`)
    assert.equal(await s.title(), path.basename(file), 'back at what the file holds')
  })
  await test('after a Save As, Undo stays with the new file', async () => {
    await s.load()
    await edit()
    const other = s.file('undo-as.mmap')
    await s.answerDialogs({ saveDiagram: other })
    await s.key('s', CTRL | SHIFT)
    await s.until(`document.querySelector('[data-title-file]').textContent === 'undo-as.mmap'`)
    await s.click('[data-command="undo"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '5'`)
    assert.equal(await s.title(), 'undo-as.mmap *')
  })
  await test('undoing back to the file\'s own content is no unsaved work', async () => {
    const file = await s.load()
    await edit()
    await s.click('[data-command="undo"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '5'`)
    assert.equal(await s.title(), path.basename(file))
  })
  await test('opening a file empties the history', async () => {
    await s.load()
    await edit()
    await s.load()
    assert.equal(await s.page.evaluate(`document.querySelector('[data-command="undo"]').disabled`), true)
  })
  await test('the unsaved question: Cancel stays, Don\'t Save goes on, Save saves and goes on', async () => {
    const file = await s.load()
    await edit()
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-dialog="unsaved"]')`)
    assert.ok((await s.text('[data-dialog="unsaved"] .dialog-message')).includes(path.basename(file)))
    await s.click('[data-command="unsaved-cancel"]')
    await s.until(`!document.querySelector('[data-dialog="unsaved"]')`)
    assert.equal(await s.nodeCount(), 4)
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await s.click('[data-command="unsaved-save"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).nodes.length, 4, 'it was saved')
    await s.page.evaluate(`document.activeElement?.blur?.()`)
    await s.answerDialogs({ saveDiagram: null })
  })
  await test('the unsaved question: Save with the name cancelled stays where it was', async () => {
    await s.load()
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    await s.setValue('.right-panel .property-field input', 'Nameless')
    await s.until(`document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    await s.answerDialogs({ saveDiagram: null })
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-dialog="unsaved"]')`)
    await s.click('[data-command="unsaved-save"]')
    await sleep(100)
    assert.equal(await s.count('[data-dialog="unsaved"]'), 1, 'still asking')
    await s.click('[data-command="unsaved-cancel"]')
    assert.ok(await s.page.evaluate(`[...document.querySelectorAll('.node-label tspan')].some((t) => t.textContent === 'Nameless')`))
  })
  for (const [name, act] of [
    ['Open', () => s.click('[data-command="open"]')],
    ['a sample', async () => { await s.click('[data-command="start"]'); await s.until(`document.querySelector('[data-sample]')`); await s.click('[data-sample]') }],
    ['a tutorial', async () => { await s.menu('help', ko.start.tutorial); await s.until(`document.querySelector('[data-tutorial="mindmap"]')`); await s.click('[data-tutorial="mindmap"]') }],
  ]) {
    await test(`${name} asks about unsaved work first`, async () => {
      await s.load()
      await edit()
      await s.answerDialogs({ open: null })
      await act()
      await s.until(`document.querySelector('[data-dialog="unsaved"]')`)
      await s.click('[data-command="unsaved-cancel"]')
      await s.until(`!document.querySelector('[data-dialog="unsaved"]')`)
      assert.equal(await s.nodeCount(), 4)
      if (await s.count('[data-start-screen]')) await s.click('[data-start="continue"]')
    })
  }
  await test('a file from the system (a second start, a double click) opens in this window', async () => {
    await s.load()
    const file = s.file('from-system.mmap')
    fs.writeFileSync(file, JSON.stringify(fixture()))
    await s.page.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'open-file', payload: ${js(file)} })`)
    await s.until(`document.querySelector('[data-title-file]').textContent === 'from-system.mmap'`)
  })
  const drop = (paths) => s.page.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: ${js(paths)}, position: { x: 200, y: 200 } } })`)
  await test('a diagram dropped on the window opens', async () => {
    await s.load()
    const file = s.file('dropped.mmap')
    fs.writeFileSync(file, JSON.stringify(fixture()))
    await drop([file])
    await s.until(`document.querySelector('[data-title-file]').textContent === 'dropped.mmap'`)
  })
  await test('a picture dropped on the window goes on the canvas; anything else is left alone', async () => {
    await s.load()
    const svg = s.file('dropped.svg')
    fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="red"/></svg>')
    const note = s.file('dropped.txt')
    fs.writeFileSync(note, 'words')
    await drop([svg, note])
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '6'`)
    assert.equal(await s.count('[data-dialog="message"]'), 0)
  })
  await s.stop()
  const ending = async (act) => {
    const app = await session()
    // The press that ends the program can end the connection before its answer arrives.
    await act(app).catch((error) => {
      if (!String(error).includes('CDP socket closed')) throw error
    })
    const code = await Promise.race([app.app.exited.then(() => 'gone'), sleep(6000).then(() => 'still there')])
    await app.stop().catch(() => {})
    return code
  }
  await test('the close button ends the program when nothing is unsaved', async () => {
    assert.equal(await ending(async (a) => { await a.load(); await a.click('[data-command="close"]') }), 'gone')
  })
  await test('after Don\'t Save too', async () => {
    assert.equal(await ending(async (a) => {
      await a.load()
      await a.clickNode('C')
      await a.key('Delete')
      await a.click('[data-command="close"]')
      await a.until(`document.querySelector('[data-dialog="unsaved"]')`)
      await a.click('[data-command="unsaved-discard"]')
    }), 'gone')
  })
  await test('File, Exit ends it', async () => {
    assert.equal(await ending(async (a) => { await a.load(); await a.menu('file', ko.start.exit) }), 'gone')
  })
  await test('Exit on the start screen ends it', async () => {
    assert.equal(await ending(async (a) => { await a.click('[data-command="start"]'); await a.until(`document.querySelector('[data-start="exit"]')`); await a.click('[data-start="exit"]') }), 'gone')
  })
  await test('with unsaved work, Cancel keeps the program running', async () => {
    assert.equal(await ending(async (a) => {
      await a.load()
      await a.clickNode('C')
      await a.key('Delete')
      await a.click('[data-command="close"]')
      await a.until(`document.querySelector('[data-dialog="unsaved"]')`)
      await a.click('[data-command="unsaved-cancel"]')
    }), 'still there')
  })
})

suite('Settings: general', async (test) => {
  const s = await session()
  const open = async (tab = 'general') => {
    await s.click('[data-command="preferences"]')
    await s.until(`document.querySelector('[data-dialog="preferences"]')`)
    await s.click(`[data-pref-tab="${tab}"]`)
  }
  const close = () => s.click('[data-command="preferences-close"]')
  const toggle = (field) => s.click(`[data-field="${field}"]`)
  const newOne = async () => {
    await close()
    await s.click('[data-command="new"]')
    await sleep(60)
    if (await s.count('[data-dialog="unsaved"]')) await s.click('[data-command="unsaved-discard"]')
    await sleep(60)
  }
  for (const [field, setting, on] of [
    ['prefGrid', 'showGrid', '.canvas-grid'],
    ['prefRuler', 'showRulers', '.canvas-rulers'],
    ['prefLeftPanel', 'leftPanel', '.left-panel:not(.folded)'],
    ['prefRightPanel', 'rightPanel', '.right-panel:not(.folded)'],
  ]) {
    await test(`${field} acts at once and is remembered, both ways`, async () => {
      await open()
      assert.equal(await s.page.evaluate(`document.querySelector('[data-field="${field}"]').getAttribute('aria-checked')`), 'true')
      await toggle(field)
      await s.until(`!document.querySelector('${on}')`)
      await settled(() => s.app.settings()[setting], false)
      await toggle(field)
      await s.until(`document.querySelector('${on}')`)
      await settled(() => s.app.settings()[setting], true)
      await close()
    })
  }
  await test('the two "show the start screen" switches and the one on the start screen are one setting', async () => {
    await open()
    await toggle('prefShowStart')
    await settled(() => s.app.settings().startScreen.showOnStartup, true)
    await s.click('[data-pref-tab="start"]')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-field="prefStartShow"]').getAttribute('aria-checked')`), 'true')
    await toggle('prefStartShow')
    await settled(() => s.app.settings().startScreen.showOnStartup, false)
    await close()
    await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-field="startShow"]')`)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-field="startShow"]').checked`), false)
    await s.click('[data-field="startShow"]')
    await settled(() => s.app.settings().startScreen.showOnStartup, true)
    await s.click('[data-field="startShow"]')
    await settled(() => s.app.settings().startScreen.showOnStartup, false)
    await s.click('[data-start="continue"]')
  })
  for (const [mode, field, setting, value, check] of [
    ['mindmap', 'prefMindmapLayout', 'mindmapLayout', 'ttb', (doc) => assert.equal(doc.layout, 'ttb')],
    ['fishbone', 'prefFishboneLayout', 'fishboneLayout', 'rtl', (doc) => assert.equal(doc.layout, 'rtl')],
    ['mindmap', 'prefNewShape', 'newShape', 'hexagon', (doc) => assert.equal(doc.defaultShape, 'hexagon')],
    ['mindmap', 'prefNewDiagramTheme', 'newDiagramTheme', 'forest', (doc) => assert.equal(doc.diagramTheme, 'forest')],
    ['mindmap', 'prefNewLineTheme', 'newLineTheme', 'rainbow', (doc) => assert.equal(doc.lineTheme, 'rainbow')],
  ]) {
    await test(`${setting} is what a new diagram gets`, async () => {
      await open()
      await s.pickSelect(field, value)
      await settled(() => s.app.settings().general[setting], value)
      await s.pickSelect('prefNewMode', mode)
      await newOne()
      check(await s.savedDoc())
      const defaults = { mindmapLayout: 'radial', fishboneLayout: 'ltr', newShape: 'rounded', newDiagramTheme: 'default', newLineTheme: 'default' }
      await open()
      await s.pickSelect(field, defaults[setting])
      await s.pickSelect('prefNewMode', 'mindmap')
      await close()
    })
  }
  await test('Clear Recent Files empties the list, and is off when it is empty', async () => {
    await s.load()
    await open()
    await settled(() => s.app.settings().recent.length > 0, true)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-command="pref-clear-recent"]').disabled`), false)
    await s.click('[data-command="pref-clear-recent"]')
    await settled(() => s.app.settings().recent.length, 0)
    await s.until(`document.querySelector('[data-command="pref-clear-recent"]').disabled`)
    await close()
  })
  await test('the settings window can land on each of its tabs', async () => {
    for (const tab of ['general', 'theme', 'lines', 'memo', 'start']) {
      await open(tab)
      assert.equal(await s.page.evaluate(`document.querySelector('.pref-page').dataset.prefPage`), tab)
      assert.equal(await s.page.evaluate(`document.querySelector('.pref-tabs .active').dataset.prefTab`), tab)
      await close()
    }
  })
  await test('every pick of the general tab shows on its button', async () => {
    await open()
    await s.pickSelect('prefNewShape', 'octagon')
    assert.equal(await s.text('[data-select="prefNewShape"] .icon-select-text'), ko.shape.octagon)
    await s.pickSelect('prefNewShape', 'rounded')
    await close()
  })
  await test('an open list closes on a click elsewhere, without choosing', async () => {
    await open()
    await s.click('[data-select="prefNewShape"] .icon-select-button')
    await s.until(`document.querySelector('[data-select="prefNewShape"] .icon-select-list')`)
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('.pref-tabs').getBoundingClientRect(); return { x: r.left + 5, y: r.bottom - 5 } })()`)
    await s.clickAt(at.x, at.y)
    await s.until(`!document.querySelector('[data-select="prefNewShape"] .icon-select-list')`)
    assert.equal(s.app.settings().general.newShape, 'rounded')
    await close()
  })
  await s.stop()
})

suite('Settings: themes, lines, memos, start', async (test) => {
  const s = await session()
  const open = async (tab) => {
    await s.click('[data-command="preferences"]')
    await s.until(`document.querySelector('[data-dialog="preferences"]')`)
    await s.click(`[data-pref-tab="${tab}"]`)
  }
  const close = () => s.click('[data-command="preferences-close"]')
  await test('each of the 40 themes in the settings window applies and is saved', async () => {
    await open('theme')
    const ids = await s.page.evaluate(`[...document.querySelectorAll('[data-theme-group="light"] [data-pref-theme], [data-theme-group="dark"] [data-pref-theme]')].map((e) => e.dataset.prefTheme)`)
    assert.equal(ids.length, 40)
    const panels = new Set()
    for (const id of ids) {
      await s.click(`[data-pref-theme="${id}"]`)
      await s.until(`document.documentElement.dataset.theme === ${js(id)}`)
      assert.equal(await s.page.evaluate(`document.documentElement.dataset.mode`), id.split('-')[0])
      panels.add(await s.page.evaluate(`getComputedStyle(document.querySelector('.status-bar')).backgroundColor`))
    }
    assert.ok(panels.size >= 30, `only ${panels.size} different panels`)
    await settled(() => s.app.settings().theme, ids.at(-1))
    await s.click('[data-pref-theme="light-classic"]')
    await close()
  })
  await test('a theme of my own: name, kind and colours take effect at once and are saved', async () => {
    await open('theme')
    await s.click('[data-command="theme-add"]')
    await s.until(`document.querySelector('[data-theme-editor]')`)
    await s.setValue('[data-field="themeName"]', 'Mine')
    await settled(() => s.app.settings().customThemes[0].name, 'Mine')
    await s.setValue('[data-field="themeColor-panel"] .color-text', '#123456')
    await s.until(`getComputedStyle(document.documentElement).getPropertyValue('--panel').trim() === '#123456'`)
    await settled(() => s.app.settings().customThemes[0].colors.panel, '#123456')
    await s.setValue('[data-field="themeColor-accent"] input[type="color"]', '#ff00aa')
    await settled(() => s.app.settings().customThemes[0].colors.accent, '#ff00aa')
    await s.pickSelect('themeMode', 'dark')
    await s.until(`document.documentElement.dataset.mode === 'dark'`)
    await settled(() => s.app.settings().customThemes[0].mode, 'dark')
  })
  await test('every colour of a theme of my own is in its editor', async () => {
    const keys = await s.page.evaluate(`[...document.querySelectorAll('[data-field^="themeColor-"]')].map((e) => e.dataset.field)`)
    assert.ok(keys.length >= 8, keys.join())
    for (const key of keys) assert.match(await s.page.evaluate(`document.querySelector('[data-field="${key}"] .color-text').value`), /^#[0-9a-f]{6}$/i)
  })
  await test('half a colour is not taken', async () => {
    await s.setValue('[data-field="themeColor-panel"] .color-text', '#12')
    await sleep(60)
    assert.equal(s.app.settings().customThemes[0].colors.panel, '#123456')
  })
  await test('asked to delete it, Cancel keeps it', async () => {
    await s.click('[data-command="theme-delete"]')
    await s.until(`document.querySelector('[data-dialog="confirm"]')`)
    await s.click('[data-command="confirm-no"]')
    await s.until(`!document.querySelector('[data-dialog="confirm"]')`)
    assert.equal(s.app.settings().customThemes.length, 1)
  })
  await test('after deleting a dark one the program goes to a dark theme', async () => {
    await s.click('[data-command="theme-delete"]')
    await s.until(`document.querySelector('[data-dialog="confirm"]')`)
    await s.click('[data-command="confirm-yes"]')
    await settled(() => s.app.settings().customThemes.length, 0)
    await s.until(`document.documentElement.dataset.theme === 'dark-midnight'`)
    await s.click('[data-pref-theme="light-classic"]')
    await close()
  })
  await test('the 24th theme of my own is the last that can be added', async () => {
    await open('theme')
    for (let i = 0; i < 24; i++) {
      await s.click('[data-command="theme-add"]')
      await sleep(15)
    }
    await s.until(`document.querySelector('[data-command="theme-add"]').disabled`)
    await settled(() => s.app.settings().customThemes.length, 24)
    await s.click('[data-pref-theme="light-classic"]')
    await close()
  })
  await test('the lines tab: all themes; a pick is for new diagrams, Apply is for this one', async () => {
    await s.load()
    await open('lines')
    const ids = await s.page.evaluate(`[...document.querySelectorAll('[data-pref-line-theme]')].map((e) => e.dataset.prefLineTheme)`)
    assert.ok(ids.length >= 13)
    for (const id of ids) {
      await s.click(`[data-pref-line-theme="${id}"]`)
      await s.until(`document.querySelector('[data-pref-line-theme="${id}"]').classList.contains('on')`)
    }
    await s.click('[data-pref-line-theme="rainbow"]')
    await settled(() => s.app.settings().general.newLineTheme, 'rainbow')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value`), 'default', 'the open diagram is not touched')
    await s.click('[data-command="line-theme-apply"]')
    await s.until(`document.querySelector('[data-line-theme] .tb-dropdown').dataset.value === 'rainbow'`)
    await s.until(`document.querySelector('[data-command="line-theme-apply"]').disabled`)
    await s.click('[data-pref-line-theme="default"]')
    await close()
  })
  await test('the memo tab: each default reaches the preview and the settings', async () => {
    await open('memo')
    const preview = (name) => s.page.evaluate(`document.querySelector('[data-memo-preview]').style[${js(name)}]`)
    await s.setValue('[data-field="prefMemoColor"] .color-text', '#aabbcc')
    await settled(() => s.app.settings().general.memo.color, '#aabbcc')
    assert.equal(await preview('background'), 'rgb(170, 187, 204)')
    await s.setValue('[data-field="prefMemoTextColor"] .color-text', '#010203')
    await settled(() => s.app.settings().general.memo.textColor, '#010203')
    assert.equal(await preview('color'), 'rgb(1, 2, 3)')
    await s.step('prefMemoWidth')
    await settled(() => s.app.settings().general.memo.width, 170)
    assert.equal(await preview('width'), '170px')
    await s.step('prefMemoHeight')
    await settled(() => s.app.settings().general.memo.height, 100)
    assert.equal(await preview('height'), '100px')
    await s.step('prefMemoFontSize')
    await settled(() => s.app.settings().general.memo.fontSize, 13)
    assert.equal(await preview('fontSize'), '13px')
    await s.step('prefMemoLineWidth')
    await settled(() => s.app.settings().general.memo.lineWidth, 2)
    await s.setValue('[data-field="prefMemoLineColor"] .color-text', '#0a0b0c')
    await settled(() => s.app.settings().general.memo.lineColor, '#0a0b0c')
    await s.pickSelect('prefMemoLinePattern', 'dotted')
    await settled(() => s.app.settings().general.memo.linePattern, 'dotted')
    await s.pickSelect('prefMemoFont', 'serif')
    await settled(() => s.app.settings().general.memo.fontFamily, 'serif')
    for (const [style, css, value] of [['bold', 'fontWeight', '700'], ['italic', 'fontStyle', 'italic'], ['underline', 'textDecoration', 'underline'], ['strike', 'textDecoration', 'underline line-through']]) {
      await s.click(`.pref-memo [data-memo-style="${style}"]`)
      await settled(() => s.app.settings().general.memo[style], true)
      assert.equal(await preview(css), value, style)
    }
    await close()
  })
  await test('a new memo has the defaults of the settings', async () => {
    await s.load()
    await s.clickNode('B')
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('.memo-note')`)
    const style = byText(await s.savedDoc(), 'B').noteStyle
    assert.equal(style.color, '#aabbcc')
    assert.equal(style.width, 170)
    assert.equal(style.bold, true)
  })
  await test('the memo tab\'s Reset goes back to the defaults; its switch hides and shows memos', async () => {
    await open('memo')
    await s.click('[data-command="memo-defaults"]')
    await settled(() => s.app.settings().general.memo.color, '#fef08a')
    await s.click('[data-field="prefShowMemos"]')
    await s.until(`!document.querySelector('.memo-note')`)
    await settled(() => s.app.settings().showMemos, false)
    await s.click('[data-field="prefShowMemos"]')
    await s.until(`document.querySelector('.memo-note')`)
    await close()
  })
  await test('the start tab: speed and opacity, by buttons, by the bar\'s keys, typed in and limited', async () => {
    await open('start')
    const opacity = () => s.app.settings().startScreen.cardOpacity
    await s.click('[data-step="startOpacity:up"]')
    await settled(opacity, 90)
    await s.page.evaluate(`document.querySelector('[data-range-bar="startOpacity"]').focus()`)
    await s.key('ArrowRight')
    await settled(opacity, 95)
    await s.key('ArrowLeft')
    await settled(opacity, 90)
    await s.page.evaluate(`document.querySelector('[data-field="startOpacity"]').focus()`)
    await s.setValue('[data-field="startOpacity"]', '500')
    await s.key('Enter')
    await settled(opacity, 100)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-step="startOpacity:up"]').disabled`), true, 'at the top + is off')
    await s.setValue('[data-field="startOpacity"]', 'not a number')
    await s.page.evaluate(`document.querySelector('[data-field="startOpacity"]').blur()`)
    await settled(opacity, 100)
    const bar = await s.page.evaluate(`(() => { const r = document.querySelector('[data-range-bar="startSpeed"]').getBoundingClientRect(); return { left: r.left, right: r.right, y: r.top + r.height / 2 } })()`)
    await s.clickAt(bar.left + (bar.right - bar.left) / 2, bar.y)
    await settled(() => s.app.settings().startScreen.speed, 150)
    await s.dragFrom({ x: bar.left + 10, y: bar.y }, { x: bar.right + 40, y: bar.y })
    await settled(() => s.app.settings().startScreen.speed, 300)
  })
  await test('the start tab: the background, the shuffle switch and Reset', async () => {
    await s.click('[data-pref-page="start"] [data-background="mindBloom"]')
    await settled(() => s.app.settings().startScreen.background, 'mindBloom')
    const other = await s.page.evaluate(`[...document.querySelectorAll('[data-pref-page="start"] [data-background]')].find((e) => e.dataset.background !== 'mindBloom').dataset.background`)
    await s.click(`[data-pref-page="start"] [data-background="${other}"]`)
    await settled(() => s.app.settings().startScreen.background, other)
    await s.click('[data-pref-page="start"] [data-background-shuffle]')
    await settled(() => s.app.settings().startScreen.shuffle, true)
    await s.click('[data-pref-page="start"] [data-background-shuffle]')
    await settled(() => s.app.settings().startScreen.shuffle, false)
    await s.click('[data-command="start-reset"]')
    await settled(() => s.app.settings().startScreen.cardOpacity, 85)
    await close()
  })
  await s.stop()
})

suite('Start screen: every button', async (test) => {
  const s = await session()
  const toStart = async () => {
    await s.clear()
    if (!(await s.count('[data-start-screen]'))) await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-start-screen]')`)
  }
  const leave = async () => {
    await s.clear()
    if (await s.count('[data-start-screen]')) await s.click('[data-start="continue"]')
    await s.until(`!document.querySelector('[data-start-screen]')`)
  }
  for (const [button, check] of [
    ['hero-mindmap', () => s.until(`document.querySelector('[data-command="mode-mindmap"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-start-screen]')`)],
    ['hero-fishbone', () => s.until(`document.querySelector('[data-command="mode-fishbone"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-start-screen]')`)],
    ['new-mindmap', () => s.until(`document.querySelector('[data-command="mode-mindmap"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-start-screen]')`)],
    ['new-fishbone', () => s.until(`document.querySelector('[data-command="mode-fishbone"]').getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-start-screen]')`)],
  ]) {
    await test(`${button} starts a new diagram`, async () => {
      await s.load()
      await toStart()
      await s.click(`[data-start="${button}"]`)
      await check()
    })
  }
  for (const button of ['hero-open', 'open']) {
    await test(`${button} opens a file`, async () => {
      const file = s.file(`${button}.mmap`)
      fs.writeFileSync(file, JSON.stringify(fixture()))
      await s.load()
      await toStart()
      await s.answerDialogs({ open: file })
      await s.click(`[data-start="${button}"]`)
      await s.until(`document.querySelector('[data-title-file]').textContent === ${js(path.basename(file))} && !document.querySelector('[data-start-screen]')`)
    })
  }
  for (const [button, dialog, more] of [
    ['hero-tutorial', 'tutorial-choose'],
    ['tutorial', 'tutorial-choose'],
    ['guide', 'guide'],
    ['about', 'about'],
    ['preferences', 'preferences', `document.querySelector('[data-pref-page="general"]')`],
    ['theme', 'preferences', `document.querySelector('[data-pref-page="theme"]')`],
    ['start-settings', 'preferences', `document.querySelector('[data-pref-page="start"]')`],
    ['tools-settings', 'preferences', `document.querySelector('[data-pref-page="start"]')`],
    ['theme-settings', 'preferences', `document.querySelector('[data-pref-page="theme"]')`],
  ]) {
    await test(`${button} opens ${dialog}`, async () => {
      await toStart()
      await s.click(`[data-start="${button}"]`)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      if (more) await s.until(more)
      await s.key('Escape')
      await s.until(`!document.querySelector('[data-dialog="${dialog}"]')`)
    })
  }
  await test('the language tile changes the language, and back', async () => {
    await toStart()
    await s.click('[data-start="language"]')
    await s.until(`document.documentElement.lang === 'en'`)
    await settled(() => s.app.settings().language, 'en')
    await s.click('[data-start="language"]')
    await s.until(`document.documentElement.lang === 'ko'`)
  })
  await test('all 40 samples open, each with what its file holds, none counting as changed', async () => {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'template/index.json'), 'utf8'))
    const items = index.items ?? index
    assert.equal(items.length, 40)
    await s.load()
    for (const item of items) {
      await toStart()
      await s.until(`document.querySelector('[data-sample=${js(item.id)}]')`)
      await s.click(`[data-sample="${item.id}"]`)
      const held = JSON.parse(fs.readFileSync(path.join(root, 'template', item.file), 'utf8'))
      await s.until(`!document.querySelector('[data-start-screen]') && document.querySelector('[data-status="nodes"]').textContent === '${held.nodes.length}'`)
      assert.equal(await s.page.evaluate(`document.querySelector('[data-command="mode-${item.mode}"]').getAttribute('aria-pressed')`), 'true', item.id)
      assert.ok(!(await s.title()).endsWith('*'), `${item.id} counts as changed`)
      assert.equal(await s.count('.node-hit'), held.nodes.length)
    }
  })
  await test('a theme tile applies the theme', async () => {
    await toStart()
    await s.until(`document.querySelector('[data-start-theme="dark-midnight"]')`)
    assert.equal(await s.count('[data-start-theme]'), 40)
    await s.click('[data-start-theme="dark-midnight"]')
    await s.until(`document.documentElement.dataset.theme === 'dark-midnight'`)
    await s.click('[data-start-theme="light-classic"]')
    await s.until(`document.documentElement.dataset.theme === 'light-classic'`)
  })
  await test('recent files: listed newest first, one can be taken off, and all of them', async () => {
    const [one, two] = [s.file('recent-one.mmap'), s.file('recent-two.mmap')]
    for (const file of [one, two]) {
      fs.writeFileSync(file, JSON.stringify(fixture()))
      await s.answerDialogs({ open: file })
      await s.clear()
      if (await s.count('[data-start-screen]')) await s.click('[data-start="continue"]')
      await s.click('[data-command="open"]')
      await s.until(`document.querySelector('[data-title-file]').textContent === ${js(path.basename(file))}`)
    }
    await toStart()
    await s.until(`document.querySelector('[data-recent]')`)
    const recent = () => s.page.evaluate(`[...document.querySelectorAll('[data-recent]')].map((e) => e.dataset.recent)`)
    assert.deepEqual((await recent()).slice(0, 2), [two, one])
    await s.page.evaluate(`[...document.querySelectorAll('[data-recent-remove]')].find((e) => e.dataset.recentRemove === ${js(two)}).click()`)
    await s.until(`![...document.querySelectorAll('[data-recent]')].some((e) => e.dataset.recent === ${js(two)})`)
    await settled(() => s.app.settings().recent.includes(two), false)
    await s.click('[data-start="clear-recent"]')
    await s.until(`!document.querySelector('[data-recent]')`)
    await settled(() => s.app.settings().recent.length, 0)
  })
  await test('a recent file opens', async () => {
    const file = s.file('recent-open.mmap')
    fs.writeFileSync(file, JSON.stringify(fixture()))
    await s.answerDialogs({ open: file })
    await leave()
    await s.click('[data-command="open"]')
    await s.until(`document.querySelector('[data-title-file]').textContent === 'recent-open.mmap'`)
    await s.click('[data-command="new"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    await toStart()
    await s.until(`document.querySelector('[data-recent]')`)
    await s.click('[data-recent]')
    await s.until(`document.querySelector('[data-title-file]').textContent === 'recent-open.mmap' && !document.querySelector('[data-start-screen]')`)
  })
  const layout = () => s.app.settings().startScreen.layout
  await test('a card moves by its handle, and stays there', async () => {
    await toStart()
    await s.page.evaluate(`document.querySelector('.start-scroll').scrollTop = 0`)
    await s.until(`document.querySelector('[data-card-handle="recent"]')`)
    const handle = await s.page.evaluate(`(() => { const r = document.querySelector('[data-card-handle="recent"]').getBoundingClientRect(); const b = document.querySelector('.start-board').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: b.left + 20 } })()`)
    const before = layout()?.cards?.recent
    await s.dragFrom(handle, { x: handle.left, y: handle.y + 40 })
    const t0 = Date.now()
    while (Date.now() - t0 < 3000 && js(layout()?.cards?.recent) === js(before)) await sleep(40)
    assert.notEqual(js(layout()?.cards?.recent), js(before), 'the card did not move')
  })
  await test('a card is resized by its corner, and a double click on it fits the content again', async () => {
    const grip = await s.page.evaluate(`(() => { const r = document.querySelector('[data-card-resize="recent"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await s.dragFrom(grip, { x: grip.x, y: grip.y + 120 })
    await settled(() => layout().cards.recent.fit, false)
    const again = await s.page.evaluate(`(() => { const r = document.querySelector('[data-card-resize="recent"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`)
    await s.clickAt(again.x, again.y, { clickCount: 1 })
    await s.clickAt(again.x, again.y, { clickCount: 2 })
    await settled(() => layout().cards.recent.fit, true)
  })
  await test('Arrange puts the cards back, and the settings window can too', async () => {
    const moved = js(layout())
    await s.click('[data-start="arrange"]')
    const t0 = Date.now()
    while (Date.now() - t0 < 3000 && js(layout()) === moved) await sleep(40)
    await s.page.evaluate(`document.querySelector('.start-scroll').scrollTop = 0`)
    const tops = await s.page.evaluate(`Object.fromEntries([...document.querySelectorAll('.start-card')].map((c) => [c.dataset.card, c.getBoundingClientRect().top]))`)
    assert.ok(tops.hero < tops.samples && tops.samples < tops.theme, js(tops))
    await s.click('[data-start="tools-settings"]')
    await s.until(`document.querySelector('[data-command="start-layout-reset"]')`)
    await s.click('[data-command="start-layout-reset"]')
    await settled(() => layout(), null)
    await s.until(`document.querySelector('[data-command="start-layout-reset"]').disabled`)
    await s.click('[data-command="preferences-close"]')
  })
  await test('the shuffle switch changes the background by itself', async () => {
    await toStart()
    await s.until(`document.querySelector('[data-start-screen] [data-background-shuffle]')`)
    await s.click('[data-start-screen] [data-background-shuffle]')
    await settled(() => s.app.settings().startScreen.shuffle, true)
    await s.click('[data-start-screen] [data-background-shuffle]')
    await settled(() => s.app.settings().startScreen.shuffle, false)
  })
  await test('the card opacity bar on the start screen is the same setting', async () => {
    await s.click('[data-step="startOpacity:down"]')
    const value = await s.page.evaluate(`document.querySelector('[data-start-screen]').style.getPropertyValue('--start-card-alpha')`)
    await settled(() => `${s.app.settings().startScreen.cardOpacity}%`, value)
  })
  await s.stop()
})

suite('Every theme, line theme and icon in the real window', async (test) => {
  const s = await session()
  await test('all 40 program themes from the toolbar list', async () => {
    await s.click('[data-command="theme"]')
    await s.until(`document.querySelector('[data-theme-menu]')`)
    const ids = await s.page.evaluate(`[...document.querySelectorAll('[data-theme-option]')].map((e) => e.dataset.themeOption)`)
    await s.key('Escape')
    assert.equal(ids.length, 40)
    for (const id of ids) {
      await s.click('[data-command="theme"]')
      await s.until(`document.querySelector('[data-theme-option=${js(id)}]')`)
      await s.click(`[data-theme-option="${id}"]`)
      await s.until(`document.documentElement.dataset.theme === ${js(id)}`)
      assert.ok(await s.page.evaluate(`!document.querySelector('[data-theme-menu]')`), 'the list closes')
      assert.match(await cssVar(s.page, '--accent'), /^#|^rgb/)
    }
    await s.click('[data-command="theme"]')
    await s.click('[data-theme-option="light-classic"]')
  })
  await test('the theme list closes on Escape and on a click elsewhere, and the current one is marked', async () => {
    await s.click('[data-command="theme"]')
    await s.until(`document.querySelector('[data-theme-option="light-classic"].selected')`)
    await s.key('Escape')
    await s.until(`!document.querySelector('[data-theme-menu]')`)
    await s.click('[data-command="theme"]')
    await s.until(`document.querySelector('[data-theme-menu]')`)
    const at = await s.emptyPoint()
    await s.clickAt(at.x, at.y)
    await s.until(`!document.querySelector('[data-theme-menu]')`)
  })
  await test('all 40 mind map themes dress the diagram: colours, shapes by level, lines; each is saved', async () => {
    await s.load()
    const ids = await s.page.evaluate(`[...document.querySelectorAll('[data-diagram-theme]')].map((e) => e.dataset.diagramTheme)`)
    assert.equal(ids.length, 40)
    const looks = new Set()
    for (const id of ids) {
      await s.click(`[data-diagram-theme="${id}"]`)
      await s.until(`document.querySelector('[data-diagram-theme="${id}"]').classList.contains('on')`)
      assert.equal(await s.page.evaluate(`document.querySelector('[data-diagram-theme-menu] .tb-dropdown').dataset.value`), id)
      const look = await s.page.evaluate(`[...document.querySelectorAll('.node-shape')].map((p) => p.getAttribute('fill') + p.getAttribute('d')).join() + document.querySelector('.edge-hit').getAttribute('d')`)
      looks.add(look)
    }
    assert.ok(looks.size >= 30, `only ${looks.size} different looks`)
    assert.equal((await s.savedDoc()).diagramTheme, ids.at(-1))
  })
  await test('a theme leaves pictures alone, and new shapes follow it', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
    await s.load(fixture((doc) => ({ ...doc, nodes: [...doc.nodes, { ...doc.nodes[1], id: 'pic', parentId: null, text: 'pic', x: 900, y: 500, shape: 'rect', color: '#ffffff', image: { src: png, width: 2, height: 2 } }] })))
    await s.click('[data-diagram-theme="forest"]')
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    const doc = await s.savedDoc()
    assert.equal(byText(doc, 'pic').color, '#ffffff')
    assert.equal(byText(doc, 'pic').shape, 'rect')
    const child = doc.nodes.find((node) => node.parentId === 'B')
    assert.notEqual(child.color, undefined)
    assert.equal(doc.edges.find((edge) => edge.to === child.id).lineType, doc.defaultLine)
  })
  await test('all line themes from the toolbar: each restyles every line, and a new line follows', async () => {
    await s.load()
    await s.page.evaluate(`document.querySelector('[data-line-theme] .tb-btn').click()`)
    await s.until(`document.querySelector('.tb-menu-floating')`)
    const names = await s.page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].map((e) => e.textContent.replace('✓', '').trim())`)
    await s.key('Escape')
    assert.ok(names.length >= 13, names.join())
    const looks = new Set()
    for (const name of names) {
      await s.pickDropdown('[data-line-theme]', ko.toolbar.lineTheme, name)
      looks.add(await s.page.evaluate(`[...document.querySelectorAll('.edge-hit')].map((hit) => hit.getAttribute('d') + (hit.nextElementSibling?.getAttribute('stroke') ?? hit.getAttribute('fill')) + hit.nextElementSibling?.getAttribute('stroke-dasharray')).join()`))
    }
    assert.ok(looks.size >= names.length - 1, `only ${looks.size} looks of ${names.length}`)
    await s.clickNode('B')
    await s.menu('edit', ko.context.addChild)
    const doc = await s.savedDoc()
    const line = doc.edges.find((edge) => edge.from === 'B')
    assert.equal(line.lineType, doc.defaultLine)
    assert.notEqual(line.color, '#94a3b8', 'the new line has the theme\'s colour')
  })
  await test('all 100 icons go on a shape and draw something; each is saved', async () => {
    await s.load()
    await s.clickNode('B')
    await s.click('[data-lower-tab="icons"]')
    const ids = await s.page.evaluate(`[...document.querySelectorAll('.node-icon-grid [data-node-icon]')].map((e) => e.dataset.nodeIcon)`)
    assert.equal(ids.length, 100)
    for (const id of ids) {
      await s.click(`[data-node-icon="${id}"]`)
      await s.until(`document.querySelector('.node-icon[data-icon="${id}"]')`)
      const size = await s.page.evaluate(`(() => { const r = document.querySelector('.node-icon[data-icon="${id}"]').getBoundingClientRect(); return r.width * r.height })()`)
      assert.ok(size > 10, `${id} draws nothing`)
      assert.ok(await s.page.evaluate(`document.querySelector('[data-node-icon="${id}"]').classList.contains('on')`), 'its tile is marked')
    }
    assert.equal(byText(await s.savedDoc(), 'B').icon, ids.at(-1))
    await s.click('[data-lower-tab="themes"]')
  })
  await test('the icon tiles are off with nothing selected', async () => {
    await s.load()
    await s.deselect()
    await s.click('[data-lower-tab="icons"]')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-node-icon="star"]').disabled`), true)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-icon-menu] .tb-btn').disabled`), true)
    await s.click('[data-lower-tab="themes"]')
  })
  await test('the toolbar\'s icon drop-down: 101 choices, one taken shows on its button, and none takes it off', async () => {
    await s.load()
    await s.clickNode('B')
    await s.page.evaluate(`document.querySelector('[data-icon-menu] .tb-btn').click()`)
    await s.until(`document.querySelector('.tb-menu-floating')`)
    assert.equal(await s.count('.tb-menu-floating .tb-menu-item'), 101)
    await s.page.evaluate(`document.querySelectorAll('.tb-menu-floating .tb-menu-item')[1].click()`)
    await s.until(`document.querySelector('.node-icon')`)
    assert.equal(await s.count('[data-icon-menu] .tb-btn .node-icon-picture'), 1)
    await s.pickDropdown('[data-icon-menu]', ko.toolbar.icons, ko.icons.none)
    await s.until(`!document.querySelector('.node-icon')`)
  })
  await test('an icon moves the text aside to make room', async () => {
    await s.load()
    const x = () => s.page.evaluate(`Number(${s.nodeEl('B')}.querySelector('.node-label').getAttribute('x'))`)
    const before = await x()
    await s.clickNode('B')
    await s.click('[data-lower-tab="icons"]')
    await s.click('[data-node-icon="star"]')
    await s.until(`document.querySelector('.node-icon')`)
    assert.ok((await x()) > before)
    await s.click('[data-lower-tab="themes"]')
  })
  await s.stop()
})

suite('Memos', async (test) => {
  const s = await session()
  const note = '.memo-note[data-memo="node"]'
  const start = async () => {
    await s.load()
    await s.clickNode('B')
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('${note}')`)
    // Its text field takes the focus and scrolls into view, and a scroll closes an open list.
    await s.until(`document.activeElement.classList.contains('property-memo')`)
    await sleep(80)
  }
  await test('with nothing selected, a memo says what to do first', async () => {
    await s.load()
    await s.deselect()
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('[data-dialog="message"]')`)
    assert.equal(await s.text('[data-message]'), ko.memo.pickFirst)
    await s.click('[data-command="message-ok"]')
  })
  await test('the panel\'s Add Memo button, and a folded panel opens for it', async () => {
    await s.load()
    await s.clickNode('B')
    await s.click('[data-command="memo-add"]')
    await s.until(`document.querySelector('${note}')`)
    await s.load()
    await s.clickNode('B')
    await s.click('[data-command="right-panel"]')
    await s.until(`document.querySelector('[data-panel-strip="right"]')`)
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('.property-memo')`)
    await s.until(`document.activeElement.classList.contains('property-memo')`)
  })
  await test('a memo that is hidden comes back when one is added', async () => {
    await s.load(memoFixture())
    await s.menu('view', ko.memo.hideAll)
    await s.until(`!document.querySelector('.memo-note')`)
    await s.clickNode('C')
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('.memo-note')`)
    await settled(() => s.app.settings().showMemos, true)
  })
  await test('the text on the note follows the panel, wraps, and is cut at its height', async () => {
    await start()
    await s.setValue('.property-memo', 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty')
    await s.until(`document.querySelectorAll('${note} tspan').length > 1`)
    const lines = await s.count(`${note} tspan`)
    await s.setValue('[data-field="memoHeight"] input', '60')
    await s.until(`document.querySelectorAll('${note} tspan').length < ${lines}`)
    assert.ok(await s.page.evaluate(`(() => { const r = document.querySelector('${note} text').getBBox(); return r.width <= 160 })()`), 'it stays inside the note')
  })
  for (const [name, set, read, want] of [
    ['colour', () => s.setValue('[data-field="memoColor"] .color-text', '#00ff00'), `document.querySelector('${note} path').getAttribute('fill')`, '#00ff00'],
    ['text colour', () => s.setValue('[data-field="memoTextColor"] .color-text', '#0000ff'), `document.querySelector('${note} text').getAttribute('fill')`, '#0000ff'],
    ['connector colour', () => s.setValue('[data-field="memoLineColor"] .color-text', '#ff0000'), `document.querySelector('${note} .memo-line').getAttribute('stroke')`, '#ff0000'],
    ['font', () => s.pickSelect('memoFont', 'mono'), `document.querySelector('${note} text').getAttribute('font-family').includes('monospace') || document.querySelector('${note} text').getAttribute('font-family').includes('Consolas')`, true],
    ['italic', () => s.click('[data-memo-section="node"] [data-memo-style="italic"]'), `document.querySelector('${note} text').getAttribute('font-style')`, 'italic'],
    ['underline', () => s.click('[data-memo-section="node"] [data-memo-style="underline"]'), `document.querySelector('${note} text').getAttribute('text-decoration')`, 'underline'],
    ['strike', () => s.click('[data-memo-section="node"] [data-memo-style="strike"]'), `document.querySelector('${note} text').getAttribute('text-decoration')`, 'line-through'],
    ['height', () => s.step('memoHeight'), `document.querySelector('${note}').dataset.memoBox.split(' ')[3]`, '100'],
  ]) {
    await test(`a memo's ${name} takes effect at once and is saved`, async () => {
      await start()
      await set()
      await s.until(`(${read}) === ${js(want)}`)
      assert.ok(byText(await s.savedDoc(), 'B').noteStyle, 'saved')
    })
  }
  await test('a memo\'s connector can be each pattern', async () => {
    await start()
    const dashes = new Set()
    for (const pattern of ['solid', 'dashed', 'dotted', 'dashdot']) {
      await s.pickSelect('memoLinePattern', pattern)
      await sleep(30)
      dashes.add(await s.page.evaluate(`document.querySelector('${note} .memo-line').getAttribute('stroke-dasharray')`))
    }
    assert.equal(dashes.size, 4)
  })
  await test('its size has limits', async () => {
    await start()
    await s.setValue('[data-field="memoWidth"] input', '70')
    await s.step('memoWidth', false)
    await s.step('memoWidth', false)
    await s.until(`document.querySelector('[data-field="memoWidth"] input').value === '60'`)
    await s.setValue('[data-field="memoFontSize"] input', '71')
    await s.step('memoFontSize')
    await s.step('memoFontSize')
    await s.until(`document.querySelector('[data-field="memoFontSize"] input').value === '72'`)
    await s.step('memoLineWidth', false)
    assert.equal(await s.stepped('memoLineWidth'), '1')
  })
  await test('a note can be dragged away from its shape, its line follows, and the place is saved', async () => {
    await start()
    const box = () => s.page.evaluate(`document.querySelector('${note}').dataset.memoBox.split(' ').map(Number)`)
    const line = () => s.page.evaluate(`document.querySelector('${note} .memo-line').getAttribute('x2')`)
    const before = await box()
    const end = await line()
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('${note} path').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 } })()`)
    await s.dragFrom(at, { x: at.x + 50, y: at.y + 30 })
    const zoom = await s.zoom()
    const after = await box()
    near(after[0] - before[0], 50 / zoom, 'x')
    near(after[1] - before[1], 30 / zoom, 'y')
    assert.notEqual(await line(), end)
    const style = byText(await s.savedDoc(), 'B').noteStyle
    near(style.dx, 50 / zoom, 'saved dx')
    near(style.dy, 30 / zoom, 'saved dy')
  })
  await test('a dragged note stays where it is relative to its shape when the shape moves', async () => {
    await start()
    const box = () => s.page.evaluate(`document.querySelector('${note}').dataset.memoBox.split(' ').map(Number)`)
    const before = await box()
    await s.dragNode('B', 40, 0)
    const zoom = await s.zoom()
    near((await box())[0] - before[0], 40 / zoom, 'x')
  })
  await test('a click on a note selects its owner', async () => {
    await s.load(memoFixture())
    await s.clickNode('A')
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('${note} path').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 } })()`)
    await s.clickAt(at.x, at.y)
    assert.deepEqual(await s.selected(), ['B'])
  })
  await test('a line\'s note sits at its middle and selects the line', async () => {
    await s.load()
    await s.clickEdge(0)
    await s.click('[data-command="memo-add"]')
    await s.until(`document.querySelector('.memo-note[data-memo="edge"]')`)
    await s.clickNode('C')
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('.memo-note[data-memo="edge"] path').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 20 } })()`)
    await s.clickAt(at.x, at.y)
    await s.until(`document.querySelector('[data-memo-section="edge"] .property-memo')`)
    assert.ok(edgeOf(await s.savedDoc(), 'Root', 'A').note)
  })
  await test('with a line and a shape both selected, the memo goes on the shape', async () => {
    await s.load()
    await s.clickEdge(0)
    await s.clickNode('C', { modifiers: CTRL })
    await s.click('[data-command="memo"]')
    await s.until(`document.querySelector('.memo-note')`)
    const doc = await s.savedDoc()
    assert.ok(byText(doc, 'C').note)
    assert.equal(edgeOf(doc, 'Root', 'A').note, undefined)
  })
  await test('Remove Memo takes it off, and Undo brings it back', async () => {
    await start()
    await s.click('[data-command="memo-remove"]')
    await s.until(`!document.querySelector('${note}')`)
    assert.equal(byText(await s.savedDoc(), 'B').note, undefined)
    await s.click('[data-command="undo"]')
    await s.until(`document.querySelector('${note}')`)
  })
  await test('a memo goes with its shape when the shape is deleted', async () => {
    await s.load(memoFixture())
    await s.clickNode('B')
    await s.key('Delete')
    await s.until(`!document.querySelector('.memo-note')`)
  })
  await test('an exported image holds the memos, and is large enough for them', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A1' ? { ...node, note: 'far out', noteStyle: { dx: 400, dy: 0 } } : node)) })))
    const file = s.file('with-memo.svg')
    await s.answerDialogs({ save: file })
    await s.click('[data-command="export"]')
    await s.click('[data-export-format="svg"]')
    await s.click('[data-command="export-run"]')
    await s.until(`!document.querySelector('[data-dialog="export"]')`, 20000)
    const svg = fs.readFileSync(file, 'utf8')
    assert.ok(svg.includes('far out'))
    const [, , width] = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+)/).slice(1).map(Number)
    assert.ok(width > 700, `width ${width} leaves the memo out`)
  })
  await s.stop()
})

suite('Printing, in full', async (test) => {
  const s = await session()
  const open = async () => {
    await s.click('[data-command="print"]')
    await s.until(`document.querySelector('[data-dialog="print"] .print-page svg')`)
  }
  const setup = () => s.app.settings().pageSetup
  const pageStyle = (name) => s.page.evaluate(`document.querySelector('.print-preview .print-page').style[${js(name)}]`)
  await test('all eight papers, upright and across', async () => {
    await s.load()
    await open()
    const papers = { A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] }
    for (const [paper, [short, long]] of Object.entries(papers)) {
      await s.pickSelect('printPaper', paper)
      await settled(() => setup().paper, paper)
      await s.pickSelect('printOrientation', 'portrait')
      await s.until(`document.querySelector('.print-preview .print-page').style.width === '${short}mm'`)
      assert.equal(await pageStyle('height'), `${long}mm`)
      await s.pickSelect('printOrientation', 'landscape')
      await s.until(`document.querySelector('.print-preview .print-page').style.width === '${long}mm'`)
    }
    await s.click('[data-command="print-reset"]')
    await settled(() => setup().paper, 'A4')
  })
  await test('each margin moves the printed box, and has limits', async () => {
    const body = (name) => s.page.evaluate(`document.querySelector('.print-preview .print-body').style[${js(name)}]`)
    await s.step('printMargin-top')
    await s.until(`document.querySelector('.print-preview .print-body').style.top === '17mm'`)
    await s.step('printMargin-left')
    await s.until(`document.querySelector('.print-preview .print-body').style.left === '11mm'`)
    const width = await body('width')
    await s.step('printMargin-right')
    await s.until(`document.querySelector('.print-preview .print-body').style.width !== ${js(width)}`)
    const height = await body('height')
    await s.step('printMargin-bottom')
    await s.until(`document.querySelector('.print-preview .print-body').style.height !== ${js(height)}`)
    await s.setValue('[data-field="printMargin-top"] input', '60')
    await s.step('printMargin-top')
    await s.until(`document.querySelector('[data-field="printMargin-top"] input').value === '60'`)
    await s.click('[data-command="print-reset"]')
  })
  await test('sheets across and down: the count multiplies, each is numbered, and the summary says so', async () => {
    await s.step('printPagesWide')
    await s.step('printPagesTall')
    await s.until(`document.querySelectorAll('.print-preview .print-page').length === 4`)
    assert.ok((await s.text('[data-print-summary]')).includes('4'))
    assert.ok((await s.page.evaluate(`document.querySelectorAll('.print-preview [data-print-footer]')[3].textContent`)).includes('4 / 4'))
    await s.click('[data-command="print-reset"]')
    await s.until(`document.querySelectorAll('.print-preview .print-page').length === 1`)
  })
  await test('centring: on means middle, off means the corner', async () => {
    const align = () => s.page.evaluate(`document.querySelector('.print-preview .print-body svg').getAttribute('preserveAspectRatio')`)
    assert.equal(await align(), 'xMidYMid meet')
    await s.click('[data-field="printCenterH"]')
    await s.until(`document.querySelector('.print-preview .print-body svg').getAttribute('preserveAspectRatio') === 'xMinYMid meet'`)
    await s.click('[data-field="printCenterV"]')
    await s.until(`document.querySelector('.print-preview .print-body svg').getAttribute('preserveAspectRatio') === 'xMinYMin meet'`)
    await s.click('[data-command="print-reset"]')
  })
  for (const [kind, attribute] of [['header', 'data-print-header'], ['footer', 'data-print-footer']]) {
    for (const side of ['left', 'center', 'right']) {
      await test(`${kind} ${side}: its words go in its place`, async () => {
        await s.setValue(`[data-field="print-${kind}-${side}"]`, `${kind}-${side}-words`)
        await s.until(`document.querySelector('.print-preview [${attribute}] .print-${side}').textContent === ${js(`${kind}-${side}-words`)}`)
        await settled(() => setup()[kind][side], `${kind}-${side}-words`)
        await s.click('[data-command="print-reset"]')
      })
    }
  }
  await test('the placeholders are filled in: title, date, time, page, pages', async () => {
    await s.setValue('[data-field="print-header-left"]', '{title}|{page}|{pages}')
    await s.setValue('[data-field="print-header-right"]', '{date}|{time}')
    const words = () => s.text('.print-preview [data-print-header] .print-left')
    await s.until(`document.querySelector('.print-preview [data-print-header] .print-left').textContent.includes('|1|1')`)
    assert.ok((await words()).startsWith('doc-'), await words())
    const right = await s.text('.print-preview [data-print-header] .print-right')
    assert.ok(!right.includes('{'), right)
    await s.click('[data-command="print-reset"]')
  })
  await test('text in a heading is not read as markup', async () => {
    await s.setValue('[data-field="print-header-left"]', '<b>x</b>')
    await s.until(`document.querySelector('.print-preview [data-print-header] .print-left').textContent === '<b>x</b>'`)
    assert.equal(await s.count('.print-preview [data-print-header] .print-left b'), 0)
    await s.click('[data-command="print-reset"]')
  })
  await test('the size of the headings, with limits', async () => {
    await s.step('printHeadingSize')
    await s.until(`document.querySelector('.print-preview [data-print-header]').style.fontSize === '11pt'`)
    await s.setValue('[data-field="printHeadingSize"] input', '6')
    await s.step('printHeadingSize', false)
    await settled(() => setup().headingSize, 6)
    await s.setValue('[data-field="printHeadingSize"] input', '24')
    await s.step('printHeadingSize')
    await settled(() => setup().headingSize, 24)
    await s.click('[data-command="print-reset"]')
  })
  await test('Cancel prints nothing', async () => {
    await s.answerDialogs({ printed: 0 })
    await s.click('[data-command="print-close"]')
    await s.until(`!document.querySelector('[data-dialog="print"]')`)
    await sleep(250)
    assert.equal(await s.page.evaluate(`window.__mymindTest.printed`), 0)
  })
  await test('what prints leaves out the selection, and a change of the diagram shows next time', async () => {
    await s.load()
    await s.clickNode('A')
    await open()
    assert.equal(await s.count('.print-preview .selected'), 0)
    assert.equal(await s.count('.print-preview .node-hit'), 5)
    await s.key('Escape')
    await s.clickNode('C')
    await s.key('Delete')
    await open()
    assert.equal(await s.count('.print-preview .node-hit'), 4)
    await s.key('Escape')
  })
  await s.stop()
})

suite('Export and print hold the whole diagram, not the screen', async (test) => {
  const s = await session()
  const MARGIN = 24
  const SCALE = 2
  // Far beyond any window, in all directions.
  const wide = () => fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A1' ? { ...node, x: 3000, y: 1500 } : node.id === 'C' ? { ...node, x: -900, y: -700 } : node)) }))
  let serial = 0
  const exportAs = async (format, ext) => {
    const file = s.file(`whole-${++serial}.${ext}`)
    await s.answerDialogs({ save: file })
    await s.click('[data-command="export"]')
    await s.until(`document.querySelector('[data-export-format="${format}"]')`)
    await s.click(`[data-export-format="${format}"]`)
    await s.click('[data-command="export-run"]')
    await s.until(`!document.querySelector('[data-dialog="export"]')`, 30000)
    return file
  }
  /** What of a PNG is not its background: the margins on each side, and the colour at some points. */
  const look = (file, points = []) => s.page.evaluate(`new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const g = canvas.getContext('2d', { willReadFrequently: true })
      g.drawImage(image, 0, 0)
      const { data, width, height } = g.getImageData(0, 0, canvas.width, canvas.height)
      const same = (i) => Math.abs(data[i] - data[0]) + Math.abs(data[i + 1] - data[1]) + Math.abs(data[i + 2] - data[2]) < 12
      let [left, top, right, bottom] = [width, height, -1, -1]
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (same((y * width + x) * 4)) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
      const at = (p) => { const i = (Math.round(p.y) * width + Math.round(p.x)) * 4; return '#' + [data[i], data[i + 1], data[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('') }
      resolve({ width, height, left, top, right: width - 1 - right, bottom: height - 1 - bottom, colours: ${js(points)}.map(at) })
    }
    image.src = 'data:image/png;base64,${fs.readFileSync(file).toString('base64')}'
  })`, 60000)
  const spoilTheView = async () => {
    const at = await s.rect('B')
    await s.wheel(at.x, at.y, -100, 12)
    const from = await s.emptyPoint()
    await s.dragFrom(from, { x: from.x - 300, y: from.y - 200 })
    const off = await s.page.evaluate(`(() => { const v = document.querySelector('.canvas-svg').getBoundingClientRect(); return [...document.querySelectorAll('.node-shape')].filter((p) => { const r = p.getBoundingClientRect(); return r.right < v.left || r.left > v.right || r.bottom < v.top || r.top > v.bottom }).length })()`)
    assert.ok(off >= 2, `only ${off} shapes are off the screen`)
  }
  const margins = (seen) => {
    for (const side of ['left', 'top', 'right', 'bottom']) near(seen[side], MARGIN * SCALE, `${side} margin`, 8)
  }
  await test('a PNG holds every shape with a small margin on each side, though the screen shows little of it', async () => {
    await s.load(wide())
    await spoilTheView()
    const box = { x: -900, y: -700, right: 3140, bottom: 1544 }
    const point = (node) => ({ x: (node.x + 12 - box.x + MARGIN) * SCALE, y: (node.y + 22 - box.y + MARGIN) * SCALE })
    const seen = await look(await exportAs('png', 'png'), [point({ x: 3000, y: 1500 }), point({ x: -900, y: -700 }), point({ x: 100, y: 240 })])
    assert.equal(seen.width, (box.right - box.x + MARGIN * 2) * SCALE)
    assert.equal(seen.height, (box.bottom - box.y + MARGIN * 2) * SCALE)
    margins(seen)
    assert.deepEqual(seen.colours, ['#93c5fd', '#93c5fd', '#93c5fd'], 'the shapes at the corners and the middle are drawn')
  })
  await test('the view makes no difference: fitted, zoomed or panned, the same drawing comes out', async () => {
    await s.load(wide())
    await s.click('[data-command="fit"]')
    await sleep(40)
    const fitted = fs.readFileSync(await exportAs('svg', 'svg'), 'utf8')
    await spoilTheView()
    const spoiled = fs.readFileSync(await exportAs('svg', 'svg'), 'utf8')
    assert.equal(spoiled, fitted)
    for (const name of ['Root', 'A', 'B', 'C', 'A1']) assert.ok(fitted.includes(`>${name}<`), name)
    assert.equal(fitted.includes('canvas-rulers'), false)
  })
  await test('a small diagram is cropped to itself: the image is not the size of the window', async () => {
    await s.load()
    const seen = await look(await exportAs('png', 'png'))
    assert.equal(seen.width, (840 - 100 + MARGIN * 2) * SCALE)
    assert.equal(seen.height, (404 - 120 + MARGIN * 2) * SCALE)
    margins(seen)
  })
  await test('a line that leaves the boxes of the shapes is inside the image too', async () => {
    await s.load(fixture((doc) => ({ ...doc, edges: doc.edges.map((edge) => (edge.to === 'A1' ? { ...edge, lineType: 'elbow', fromSide: 'top', toSide: 'top', width: 4 } : edge)) })))
    const seen = await look(await exportAs('png', 'png'))
    margins(seen)
  })
  await test('a memo far from its shape is inside the image, with the same margin', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A1' ? { ...node, note: 'far', noteStyle: { dx: 900, dy: 500 } } : node)) })))
    margins(await look(await exportAs('png', 'png')))
  })
  await test('a fishbone is whole, with its spine, in both directions', async () => {
    for (const layout of ['ltr', 'rtl']) {
      await s.load(fixture((doc) => ({ ...doc, mode: 'fishbone', layout, nodes: doc.nodes.map((node, index) => ({ ...node, role: index === 0 ? 'effect' : node.parentId === 'Root' ? 'category' : 'cause' })) })))
      await s.click('[data-command="align"]')
      await sleep(40)
      const at = await s.rect('B')
      await s.wheel(at.x, at.y, -100, 8)
      margins(await look(await exportAs('png', 'png')))
    }
  })
  await test('hidden memos stay out of the image, and do not widen it', async () => {
    await s.load(fixture((doc) => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === 'A1' ? { ...node, note: 'far', noteStyle: { dx: 900, dy: 500 } } : node)) })))
    await s.menu('view', ko.memo.hideAll)
    await s.until(`!document.querySelector('.memo-note')`)
    const seen = await look(await exportAs('png', 'png'))
    assert.equal(seen.width, (840 - 100 + MARGIN * 2) * SCALE)
    await s.menu('view', ko.memo.showAll)
  })
  const sheet = () => s.page.evaluate(`(() => {
    const body = document.querySelector('.print-preview .print-body').getBoundingClientRect()
    const shapes = [...document.querySelectorAll('.print-preview .node-shape')].map((p) => p.getBoundingClientRect())
    const svg = document.querySelector('.print-preview .print-body svg')
    return {
      viewBox: svg.getAttribute('viewBox').split(' ').map(Number),
      shapes: shapes.length,
      inside: shapes.every((r) => r.left >= body.left - 1 && r.right <= body.right + 1 && r.top >= body.top - 1 && r.bottom <= body.bottom + 1),
      fill: Math.max((Math.max(...shapes.map((r) => r.right)) - Math.min(...shapes.map((r) => r.left))) / body.width, (Math.max(...shapes.map((r) => r.bottom)) - Math.min(...shapes.map((r) => r.top))) / body.height),
    }
  })()`)
  await test('a printed sheet holds every shape, with a small margin, though the screen shows little of it', async () => {
    await s.load(wide())
    await spoilTheView()
    await s.click('[data-command="print"]')
    await s.until(`document.querySelector('.print-preview .print-page svg')`)
    const seen = await sheet()
    assert.equal(seen.shapes, 5)
    assert.ok(seen.inside, 'a shape is outside the printed box')
    assert.deepEqual(seen.viewBox, [-900 - MARGIN, -700 - MARGIN, 4040 + MARGIN * 2, 2244 + MARGIN * 2])
    assert.ok(seen.fill > 0.9, `the diagram fills only ${seen.fill} of the sheet`)
    await s.shoot('print-whole')
    await s.key('Escape')
  })
  await test('a small diagram fills its sheet, instead of lying small in the size of the window', async () => {
    await s.load()
    await s.click('[data-command="print"]')
    await s.until(`document.querySelector('.print-preview .print-page svg')`)
    const seen = await sheet()
    assert.deepEqual(seen.viewBox, [100 - MARGIN, 120 - MARGIN, 740 + MARGIN * 2, 284 + MARGIN * 2])
    assert.ok(seen.fill > 0.9, `the diagram fills only ${seen.fill} of the sheet`)
    await s.key('Escape')
  })
  await test('several sheets together hold all of it, without a gap', async () => {
    await s.load(wide())
    await spoilTheView()
    await s.click('[data-command="print"]')
    await s.until(`document.querySelector('.print-preview .print-page svg')`)
    await s.step('printPagesWide')
    await s.step('printPagesTall')
    await s.until(`document.querySelectorAll('.print-preview .print-page').length === 4`)
    const boxes = await s.page.evaluate(`[...document.querySelectorAll('.print-preview .print-body svg')].map((e) => e.getAttribute('viewBox').split(' ').map(Number))`)
    assert.equal(Math.min(...boxes.map((b) => b[0])), -900 - MARGIN)
    near(Math.max(...boxes.map((b) => b[0] + b[2])), 3140 + MARGIN, 'right', 0.5)
    near(Math.max(...boxes.map((b) => b[1] + b[3])), 1544 + MARGIN, 'bottom', 0.5)
    near(boxes[0][0] + boxes[0][2], boxes[1][0], 'no gap', 0.01)
    await s.click('[data-command="print-reset"]')
    await s.click('[data-command="print-close"]')
  })
  await s.stop()
})

suite('Tutorials, the guide and About', async (test) => {
  const s = await session()
  const pick = async (id) => {
    await s.load()
    await s.menu('help', ko.start.tutorial)
    await s.until(`document.querySelector('[data-tutorial="${id}"]')`)
    await s.click(`[data-tutorial="${id}"]`)
    await s.until(`document.querySelector('[data-tutorial-card="${id}"]')`)
  }
  const step = () => s.page.evaluate(`document.querySelector('[data-tutorial-card]').dataset.step`)
  await test('Back returns a step, and is off on the first', async () => {
    await pick('mindmap')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-command="tutorial-prev"]').disabled`), true)
    const first = await step()
    await s.click('[data-command="tutorial-do"]')
    await s.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
    assert.equal(await s.page.evaluate(`document.querySelector('[data-command="tutorial-do"]').disabled`), true, 'done steps cannot be done again')
    await s.click('[data-command="tutorial-next"]')
    await s.until(`document.querySelector('[data-tutorial-card]').dataset.step !== ${js(first)}`)
    assert.ok((await s.text('[data-tutorial-count]')).startsWith('2 /'))
    await s.click('[data-command="tutorial-prev"]')
    await s.until(`document.querySelector('[data-tutorial-card]').dataset.step === ${js(first)}`)
  })
  await test('the close button leaves the tutorial, keeping what was drawn', async () => {
    await pick('mindmap')
    await s.click('[data-command="tutorial-do"]')
    await s.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
    await s.click('[data-command="tutorial-close"]')
    await s.until(`!document.querySelector('[data-tutorial-card]')`)
    assert.ok((await s.title()).endsWith('*'))
  })
  await test('the card can be dragged out of the way', async () => {
    await pick('mindmap')
    const at = await s.page.evaluate(`(() => { const r = document.querySelector('[data-tutorial-card] header').getBoundingClientRect(); return { x: r.left + 40, y: r.top + r.height / 2 } })()`)
    await s.dragFrom(at, { x: at.x - 120, y: at.y + 60 })
    const place = await s.page.evaluate(`document.querySelector('[data-tutorial-card]').style.transform`)
    assert.equal(place, 'translate(-120px, 60px)')
  })
  await test('the program stays usable under the card', async () => {
    await pick('mindmap')
    await s.click('[data-command="mode-fishbone"]')
    await s.until(`document.querySelector('.fishbone-skeleton')`)
    assert.equal(await s.count('[data-tutorial-card]'), 1)
    await s.click('[data-command="tutorial-close"]')
  })
  await test('each step of both tutorials can be done for me, with its text in English too', async () => {
    await s.click('[data-command="language"]')
    await s.until(`document.documentElement.lang === 'en'`)
    for (const id of ['mindmap', 'fishbone']) {
      await s.load()
      await s.menu('help', en.start.tutorial)
      await s.until(`document.querySelector('[data-tutorial="${id}"]')`)
      await s.click(`[data-tutorial="${id}"]`)
      await s.until(`document.querySelector('[data-tutorial-card="${id}"]')`)
      for (let i = 0; i < 25; i++) {
        assert.ok(!/[가-힣]/.test(await s.text('[data-tutorial-card]')), 'Korean in the English tutorial')
        if (await s.count('[data-command="tutorial-finish"]')) break
        if (await s.page.evaluate(`document.querySelector('[data-tutorial-card]').dataset.stepDone !== 'true'`)) {
          await s.click('[data-command="tutorial-do"]')
          await s.until(`document.querySelector('[data-tutorial-card]').dataset.stepDone === 'true'`)
        }
        await s.click('[data-command="tutorial-next"]')
        await sleep(20)
      }
      await s.click('[data-command="tutorial-finish"]')
    }
    await s.click('[data-command="language"]')
    await s.until(`document.documentElement.lang === 'ko'`)
  })
  const openGuide = async () => {
    await s.key('F1')
    await s.until(`document.querySelector('.guide-body h1')`)
  }
  await test('the guide\'s chapter list goes to each chapter', async () => {
    await openGuide()
    const count_ = await s.count('[data-guide-heading]')
    assert.ok(count_ >= 5, `${count_} chapters`)
    for (const place of [Math.floor(count_ / 2), 1]) {
      const heading = await s.page.evaluate(`document.querySelectorAll('[data-guide-heading]')[${place}].dataset.guideHeading`)
      await s.click(`[data-guide-heading="${heading}"]`)
      await sleep(60)
      const top = await s.page.evaluate(`document.querySelector('[id="guide-${heading}"]').getBoundingClientRect().top - document.querySelector('.guide-body').getBoundingClientRect().top`)
      assert.ok(Math.abs(top) < 40, `chapter ${place} is ${top} px from the top`)
    }
  })
  await test('the guide\'s letter size has limits, and is kept for next time', async () => {
    await s.setValue('[data-field="guideFontSize"] input', '21')
    await s.step('guideFontSize')
    await s.step('guideFontSize')
    await s.until(`document.querySelector('[data-field="guideFontSize"] input').value === '22'`)
    assert.equal(await s.page.evaluate(`document.querySelector('.guide-window').style.getPropertyValue('--guide-font')`), '22px')
    await s.click('[data-command="guide-close"]')
    await s.until(`!document.querySelector('[data-dialog="guide"]')`)
    await openGuide()
    assert.equal(await s.stepped('guideFontSize'), '22')
    await s.setValue('[data-field="guideFontSize"] input', '12')
    await s.step('guideFontSize', false)
    await s.step('guideFontSize', false)
    await s.until(`document.querySelector('[data-field="guideFontSize"] input').value === '11'`)
    await s.setValue('[data-field="guideFontSize"] input', '14')
  })
  await test('the guide stays on the same chapter when its language changes, and keeps that language', async () => {
    const last = await s.page.evaluate(`[...document.querySelectorAll('[data-guide-heading]')].at(-1).dataset.guideHeading`)
    await s.click(`[data-guide-heading="${last}"]`)
    await s.until(`document.querySelector('.guide-body').scrollTop > 100`)
    await sleep(60)
    const language = () => s.page.evaluate(`document.querySelector('.guide-body').lang`)
    const before = await language()
    await s.click('[data-command="guide-language"]')
    await s.until(`document.querySelector('.guide-body').lang !== ${js(before)}`)
    await s.until(`document.querySelector('.guide-body').scrollTop > 100`)
    const after = await language()
    await s.click('[data-command="guide-close"]')
    await s.until(`!document.querySelector('[data-dialog="guide"]')`)
    await openGuide()
    assert.equal(await language(), after)
    await s.click('[data-command="guide-language"]')
    await s.until(`document.querySelector('.guide-body').lang === ${js(before)}`)
  })
  await test('the guide draws its tables, lists, code and pictures, and has no broken picture', async () => {
    assert.ok((await s.count('.guide-body table')) >= 1)
    assert.ok((await s.count('.guide-body ul, .guide-body ol')) >= 1)
    await s.until(`[...document.querySelectorAll('.guide-body img')].every((i) => i.complete && i.naturalWidth > 0)`, 8000)
    assert.ok(!(await s.text('.guide-body')).includes('**'), 'bold marks left in the text')
    await s.click('[data-command="guide-close"]')
  })
  await test('About tells the version of this build, the platform, the runtime and the author', async () => {
    await s.click('[data-command="about"]')
    await s.until(`document.querySelector('[data-about="about.platform"] dd')?.textContent.includes('(')`)
    const value = (key) => s.text(`[data-about="${key}"] dd`)
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    assert.equal(await value('about.version'), pkg.version)
    assert.match(await value('about.platform'), /Windows|macOS|Linux/)
    assert.match(await value('about.runtime'), /Tauri \d.*WebView \d/)
    assert.equal(await value('about.format'), '.mmap')
    assert.ok(await value('about.developer'))
    assert.match(await value('about.buildDate'), /\d{4}/)
    assert.ok((await value('about.email')).includes('@'))
    assert.equal(await s.count('.about-icon'), 1)
    await s.click('[data-command="about-close"]')
    await s.until(`!document.querySelector('[data-dialog="about"]')`)
  })
  await test('Export can be cancelled, and writes nothing', async () => {
    const file = s.file('cancelled.png')
    await s.answerDialogs({ save: file })
    await s.click('[data-command="export"]')
    await s.until(`document.querySelector('[data-dialog="export"]')`)
    await s.click('[data-command="export-cancel"]')
    await sleep(100)
    assert.ok(!fs.existsSync(file))
  })
  await test('Export offers all fifteen formats', async () => {
    await s.click('[data-command="export"]')
    await s.until(`document.querySelector('[data-export-format]')`)
    assert.equal(await s.count('[data-export-format]'), 15)
    await s.click('[data-export-format="webp"]')
    assert.equal(await s.page.evaluate(`document.querySelector('[data-export-format="webp"]').getAttribute('aria-pressed')`), 'true')
    await s.key('Escape')
  })
  await s.stop()
})

suite('Both languages, everywhere', async (test) => {
  const s = await session()
  const HANGUL = /[가-힣]/
  const RAW_KEY = /\b(toolbar|panel|start|pref|memo|print|export|about|tutorial|theme|status|context|dialog|guide|shape|line|side|cap|layout|icons|font|bg)\.[a-zA-Z]+\b/
  const allWords = (selector) => s.page.evaluate(`(() => {
    const root_ = document.querySelector(${js(selector)})
    const words = [root_.innerText]
    for (const e of root_.querySelectorAll('[title], [aria-label], [data-tip], [placeholder]')) words.push(e.getAttribute('title'), e.getAttribute('aria-label'), e.getAttribute('data-tip'), e.getAttribute('placeholder'))
    return words.filter(Boolean)
  })()`)
  const check = async (selector, where, wantEnglish) => {
    const words = await allWords(selector)
    for (const word of words) {
      assert.ok(!RAW_KEY.test(word), `${where}: a raw key in "${word}"`)
      // The way back to Korean is written in Korean, on purpose.
      if (wantEnglish) assert.ok(!HANGUL.test(word.replaceAll('한국어', '')), `${where}: Korean in "${word.slice(0, 80)}"`)
    }
  }
  const places = async (wantEnglish) => {
    await check('.app-shell', 'the workspace', wantEnglish)
    for (const [button, dialog] of [['about', 'about'], ['export', 'export'], ['print', 'print']]) {
      await s.click(`[data-command="${button}"]`)
      await s.until(`document.querySelector('[data-dialog="${dialog}"]')`)
      await sleep(40)
      await check(`[data-dialog="${dialog}"]`, dialog, wantEnglish)
      await s.key('Escape')
    }
    await s.click('[data-command="preferences"]')
    for (const tab of ['general', 'theme', 'lines', 'memo', 'start']) {
      await s.click(`[data-pref-tab="${tab}"]`)
      await sleep(40)
      await check('[data-dialog="preferences"]', `settings, ${tab}`, wantEnglish)
    }
    await s.key('Escape')
    await s.menu('help', wantEnglish ? en.start.tutorial : ko.start.tutorial)
    await s.until(`document.querySelector('[data-dialog="tutorial-choose"]')`)
    await check('[data-dialog="tutorial-choose"]', 'the tutorial chooser', wantEnglish)
    await s.key('Escape')
    await s.click('[data-command="start"]')
    await s.until(`document.querySelector('[data-sample]')`)
    await check('[data-start-screen]', 'the start screen', wantEnglish)
    await s.click('[data-start="continue"]')
    for (const name of ['file', 'edit', 'view', 'help']) {
      await s.click(`[data-menu="${name}"] .tb-btn`)
      await s.until(`document.querySelector('.tb-menu-floating')`)
      await check('.tb-menu-floating', `the ${name} menu`, wantEnglish)
      await s.key('Escape')
    }
    await s.load()
    await s.clickEdge(0)
    await check('.right-panel', 'the properties of a line', wantEnglish)
    await s.clickNode('B')
    await check('.right-panel', 'the properties of a shape', wantEnglish)
    await s.click('[data-lower-tab="icons"]')
    await check('.left-panel', 'the icon list', wantEnglish)
    await s.click('[data-lower-tab="themes"]')
    await check('.left-panel', 'the theme list', wantEnglish)
    const at = await s.emptyPoint()
    await s.contextAt(at.x, at.y)
    await check('.context-menu', 'the context menu', wantEnglish)
    await s.key('Escape')
  }
  await test('Korean: no raw translation key anywhere', () => places(false))
  await test('the language button switches the whole program and is remembered', async () => {
    await s.click('[data-command="language"]')
    await s.until(`document.documentElement.lang === 'en'`)
    await settled(() => s.app.settings().language, 'en')
    assert.equal(await s.text('[data-menu="file"] .tb-btn'), `${en.toolbar.file}▾`)
  })
  await test('English: no Korean left, and no raw translation key', () => places(true))
  await test('a new diagram is named in the language in use', async () => {
    await s.click('[data-command="new"]')
    await sleep(40)
    if (await s.count('[data-dialog="unsaved"]')) await s.click('[data-command="unsaved-discard"]')
    await s.until(`document.querySelector('[data-status="nodes"]').textContent === '1'`)
    assert.deepEqual(await s.listed(), [en.canvas.centralTopic])
  })
  await s.stop()
})

suite('What is remembered across a restart', async (test) => {
  const first = await session()
  const pictureFile = first.file('remembered.mmap')
  fs.writeFileSync(pictureFile, JSON.stringify(fixture()))
  await test('changed in one run', async () => {
    await first.click('[data-command="theme"]')
    await first.click('[data-theme-option="dark-midnight"]')
    await first.click('[data-command="language"]')
    await first.click('[data-command="grid"]')
    await first.click('[data-command="ruler"]')
    await first.click('[data-command="left-panel"]')
    await first.click('[data-command="right-panel"]')
    await first.menu('view', en.memo.hideAll).catch(() => first.menu('view', ko.memo.hideAll))
    await first.click('[data-command="preferences"]')
    await first.click('[data-pref-tab="general"]')
    await first.click('[data-field="prefReopen"]')
    await first.click('[data-command="preferences-close"]')
    await first.answerDialogs({ open: pictureFile })
    await first.click('[data-command="open"]')
    await first.until(`document.querySelector('[data-title-file]').textContent === 'remembered.mmap'`)
    await settled(() => first.app.settings().general.reopenLast, true)
    await settled(() => first.app.settings().recent[0], pictureFile)
    await sleep(150)
  })
  const work = first.app.work
  await first.stop({ keep: true })
  const again = await launch({ work })
  const { page } = again
  await test('the theme and the language', async () => {
    await page.until(`document.documentElement.dataset.theme === 'dark-midnight'`)
    await page.until(`document.documentElement.lang === 'en'`)
  })
  await test('the grid, the rulers and both panels', async () => {
    await page.until(`document.querySelector('[data-panel-strip="left"]') && document.querySelector('[data-panel-strip="right"]')`)
    assert.equal(await count(page, '.canvas-grid'), 0)
    assert.equal(await count(page, '.canvas-rulers'), 0)
    await shoot(page, 'restart-folded')
  })
  await test('the last file opens by itself when so set', async () => {
    await page.until(`document.querySelector('[data-title-file]').textContent === 'remembered.mmap'`)
    assert.equal(await count(page, '[data-start-screen]'), 0)
  })
  await test('memos stay hidden', async () => {
    assert.equal(again.settings().showMemos, false)
  })
  await again.stop()
  const broken = await launch({ settings: { theme: 'no-such-theme', language: 'xx', showGrid: 'maybe', general: 'nonsense', recent: 12, startScreen: { speed: 'fast', cardOpacity: 9999, layout: [1, 2], background: 'nope' }, pageSetup: { paper: 'Papyrus', margins: 7 }, customThemes: [{ id: 'bad id' }, 3] } })
  await test('a settings file full of nonsense still starts, with sound values', async () => {
    await broken.page.until(`document.querySelector('.toolbar')`)
    assert.equal(await broken.page.evaluate(`document.documentElement.dataset.theme`), 'light-classic')
    await click_(broken.page, '[data-command="print"]')
    await broken.page.until(`document.querySelector('[data-dialog="print"]')`)
    assert.equal(await broken.page.evaluate(`document.querySelector('[data-select="printPaper"] .icon-select-text').textContent`), 'A4')
  })
  await broken.stop()
  const garbage = await launch()
  fs.writeFileSync(path.join(garbage.settingsDir, 'settings.json'), '{{{ this is not json')
  const garbageWork = garbage.work
  await garbage.stop({ keep: true })
  const repaired = await launch({ work: garbageWork })
  await test('a settings file that is not even JSON still starts', async () => {
    await repaired.page.until(`document.querySelector('.toolbar')`)
    await repaired.page.until(`document.documentElement.dataset.theme === 'light-classic'`)
  })
  await repaired.stop()
})
const click_ = (page, selector) => page.evaluate(`document.querySelector(${js(selector)}).click()`)

suite('Real windows: every dialog, and the window itself', async (test) => {
  const started = await launch({ inline: false, settings: { startScreen: { showOnStartup: false } } })
  const { page, port } = started
  const { listTargets, connect } = await import('../scripts/cdp.mjs')
  const pop = async (selector) => {
    await sleep(500)
    const targets = await listTargets(port)
    for (const target of targets.filter((t) => t.url.startsWith('about:blank'))) {
      const window_ = await connect(target)
      if (await window_.evaluate(`!!document.querySelector(${js(selector)})`).catch(() => false)) return window_
      window_.close()
    }
    throw new Error(`no window with ${selector}`)
  }
  const close = async (window_, selector) => {
    await window_.evaluate(`document.querySelector(${js(selector)}).click()`).catch(() => {})
    window_.close()
    await sleep(350)
  }
  await test('Export is a window of its own', async () => {
    await click_(page, '[data-command="export"]')
    const window_ = await pop('[data-dialog="export"]')
    assert.ok(await window_.evaluate(`document.querySelectorAll('[data-export-format]').length`) === 15)
    assert.equal(await count(page, '[data-dialog="export"]'), 0, 'not in the page')
    await close(window_, '[data-command="export-cancel"]')
  })
  await test('the tutorial chooser is a window of its own', async () => {
    await page.evaluate(`document.querySelector('[data-menu="help"] .tb-btn').click()`)
    await page.until(`document.querySelector('.tb-menu-floating')`)
    await page.evaluate(`[...document.querySelectorAll('.tb-menu-floating .tb-menu-item')].find((b) => b.textContent.includes(${js(ko.start.tutorial)})).click()`)
    const window_ = await pop('[data-dialog="tutorial-choose"]')
    await close(window_, '[data-command="tutorial-later"]')
  })
  await test('the guide is a window of its own, with its own minimize and close, and can be resized', async () => {
    await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }))`)
    const window_ = await pop('[data-dialog="guide"]')
    await window_.until(`document.querySelector('.guide-body h1')`)
    assert.ok(await window_.evaluate(`!!document.querySelector('[data-command="window-minimize"]') && !!document.querySelector('[data-command="window-close"]') && !!document.querySelector('.dialog-grip')`))
    assert.ok(await window_.evaluate(`document.querySelector('[data-command="window-maximize"]').disabled`))
    await window_.evaluate(`document.querySelector('[data-command="window-minimize"]').click()`)
    await sleep(300)
    await close(window_, '[data-command="window-close"]')
    await page.until(`true`)
    await sleep(200)
    assert.equal((await listTargets(port)).filter((t) => t.url.startsWith('about:blank') && t.title.includes(ko.guide.title)).length, 0)
  })
  await test('the unsaved question is a window of its own', async () => {
    await page.evaluate(`document.querySelector('.right-panel .property-field input').focus()`)
    await page.send('Input.insertText', { text: ' X' })
    await page.until(`document.querySelector('[data-title-file]').textContent.endsWith('*')`)
    await click_(page, '[data-command="new"]')
    const window_ = await pop('[data-dialog="unsaved"]')
    assert.ok(await window_.evaluate(`document.querySelector('.dialog-message').textContent.length > 0`))
    await close(window_, '[data-command="unsaved-discard"]')
    await page.until(`!document.querySelector('[data-title-file]').textContent.endsWith('*')`)
  })
  await test('Escape closes a dialog in a window of its own', async () => {
    await click_(page, '[data-command="about"]')
    const window_ = await pop('[data-dialog="about"]')
    await window_.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    window_.close()
    await sleep(400)
    const left = (await listTargets(port)).filter((t) => t.url.startsWith('about:blank'))
    const still = await Promise.all(left.map(async (target) => {
      const w = await connect(target)
      const open = await w.evaluate(`!!document.querySelector('[data-dialog="about"]')`).catch(() => false)
      w.close()
      return open
    }))
    assert.ok(!still.some(Boolean), 'the window stayed')
  })
  await test('the settings window has every tab in its fixed size, without a page that overflows sideways', async () => {
    await click_(page, '[data-command="preferences"]')
    const window_ = await pop('[data-dialog="preferences"]')
    const size = await window_.evaluate(`({ w: innerWidth, h: innerHeight })`)
    for (const tab of ['general', 'theme', 'lines', 'memo', 'start']) {
      await window_.evaluate(`document.querySelector('[data-pref-tab="${tab}"]').click()`)
      await sleep(120)
      const page_ = await window_.evaluate(`(() => { const p = document.querySelector('.pref-page'); return { sw: p.scrollWidth, cw: p.clientWidth } })()`)
      assert.ok(page_.sw <= page_.cw + 1, `${tab}: ${js(page_)}`)
      assert.deepEqual(await window_.evaluate(`({ w: innerWidth, h: innerHeight })`), size, `${tab} changed the size of the window`)
    }
    await close(window_, '[data-command="preferences-close"]')
  })
  await test('the maximize button fills the screen and gives the size back', async () => {
    const before = await page.evaluate(`innerWidth`)
    const screenWidth = await page.evaluate(`screen.availWidth`)
    await click_(page, '[data-command="maximize"]')
    await page.until(`innerWidth >= ${screenWidth} - 16`, 4000)
    const big = await page.evaluate(`innerWidth`)
    await click_(page, '[data-command="maximize"]')
    await page.until(`innerWidth < ${big}`, 4000)
    await sleep(300)
    near(await page.evaluate(`innerWidth`), before, 'the width it had', 3)
  })
  await test('maximized and back, again and again; the window still has its smallest size afterwards', async () => {
    const before = await page.evaluate(`innerWidth`)
    for (let i = 0; i < 2; i++) {
      await click_(page, '[data-command="maximize"]')
      await page.until(`innerWidth > ${before} + 100`, 4000)
      assert.equal(await page.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:window|is_maximized', { label: 'main' })`), true, 'it knows it is maximized')
      await sleep(250)
      await click_(page, '[data-command="maximize"]')
      await page.until(`innerWidth < ${before} + 100`, 4000)
      await sleep(250)
    }
    near(await page.evaluate(`innerWidth`), before, 'the width it had', 3)
  })
  await test('the minimize button hides the window, and it can come back', async () => {
    await click_(page, '[data-command="minimize"]')
    await sleep(500)
    await page.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:window|unminimize', { label: 'main' }).catch(() => null)`)
    await sleep(300)
    assert.equal(await count(page, '.toolbar'), 1)
  })
  // Wider than what the toolbar needs: the window is never narrower than that.
  const box = { x: 12, y: 40, width: 1500, height: 700 }
  await started.stop()
  const placed = await launch({ inline: false, settings: { window: box, startScreen: { showOnStartup: false } } })
  await test('the window opens where and how large it last was', async () => {
    const seen = await placed.page.evaluate(`({ width: innerWidth, height: innerHeight, x: screenX, y: screenY })`)
    near(seen.width, box.width, 'width', 3)
    near(seen.height, box.height, 'height', 3)
    near(seen.x, box.x, 'x', 12)
    near(seen.y, box.y, 'y', 12)
  })
  const placedWork = placed.work
  await click_(placed.page, '[data-command="close"]')
  await Promise.race([placed.exited, sleep(5000)])
  await test('closing writes the place of the window down', async () => {
    const saved = JSON.parse(fs.readFileSync(path.join(placedWork, 'settings', 'settings.json'), 'utf8')).window
    assert.equal(saved.maximized, false)
    near(saved.width, box.width, 'width', 3)
    near(saved.x, box.x, 'x', 12)
  })
  await placed.stop()
  const off = await launch({ inline: false, settings: { window: { x: -30000, y: -30000, width: 1200, height: 700 }, startScreen: { showOnStartup: false } } })
  await test('a place that is off every screen (a monitor taken away) comes back to a screen', async () => {
    const at = await off.page.evaluate(`({ x: screenX, y: screenY })`)
    assert.ok(at.x > -2000 && at.y > -2000, js(at))
  })
  await off.stop()
})

/** Runs the suites whose names hold one of the words, or all of them. */
export async function runFeatures({ category, test }, words = []) {
  for (const [name, body] of suites) {
    if (words.length && !words.some((word) => name.toLowerCase().includes(word.toLowerCase()))) continue
    await category(name)
    await body(test)
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const reporter = createReporter({ title: 'MyMind GUI tests, features', reportFile: path.join(root, 'test-results', 'gui-features-report.json') })
  await runFeatures(reporter, process.argv.slice(2))
  process.exit(reporter.summary())
}
