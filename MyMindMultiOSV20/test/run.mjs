// npm test: everything that runs without a window: the document model, the layouts, settings,
// themes, the card board, the backgrounds, translations, samples, docs, types and the Rust unit tests.
// The TypeScript sources are bundled with esbuild first, as Node cannot follow their imports.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createReporter } from './reporter.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = path.join(root, 'test-results')
fs.mkdirSync(results, { recursive: true })
const { category, test, summary } = createReporter({ title: 'MyMind tests', reportFile: path.join(results, 'report.json') })

async function load(file) {
  const outfile = path.join(results, 'bundle', `${path.basename(file).replace(/\W/g, '-')}.mjs`)
  await build({ entryPoints: [path.join(root, file)], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent' })
  return import(pathToFileURL(outfile).href)
}

const doc = await load('src/store/document.ts')
const settings = await load('src/settings.ts')
const themes = await load('src/themes.ts')
const board = await load('src/start/layout.ts')
const backgrounds = await load('src/start/backgrounds.ts')
const markdown = await load('src/markdown.ts')
const grid = await load('src/canvasGrid.ts')
const lineThemes = await load('src/lineThemes.ts')
const diagramThemes = await load('src/diagramThemes.ts')
const memo = await load('src/memo.ts')
const pageSetup = await load('src/pageSetup.ts')
const nodeIcons = await load('src/nodeIcons.ts')
const tutorials = await load('src/tutorials.ts')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

await category('Document')
await test('a mind map starts with its central topic', () => {
  const d = doc.createMindmapDoc('Centre')
  assert.equal(d.mode, 'mindmap')
  assert.equal(d.nodes.length, 1)
  assert.equal(d.nodes[0].text, 'Centre')
})
await test('children, siblings and deleting a subtree', () => {
  let d = doc.createMindmapDoc('C')
  const root_ = d.nodes[0].id
  d = doc.addChild(d, root_, 'a')
  const a = d.nodes.at(-1).id
  d = doc.addChild(d, a, 'b')
  assert.equal(d.nodes.length, 3)
  assert.equal(d.edges.length, 2)
  d = doc.deleteNodes(d, [a])
  assert.equal(d.nodes.length, 1)
  assert.equal(d.edges.length, 0)
})
await test('switching mode keeps the content', () => {
  let d = doc.createMindmapDoc('C')
  d = doc.addChild(d, d.nodes[0].id, 'a')
  const fish = doc.setMode(d, 'fishbone', { central: 'C', effect: 'E', category: 'K' })
  assert.equal(fish.mode, 'fishbone')
  assert.deepEqual(fish.nodes.map((n) => n.id), d.nodes.map((n) => n.id))
  assert.equal(fish.nodes[0].role, 'effect')
})
await test('save and open return the same diagram', () => {
  let d = doc.createFishboneDoc('E', 'K')
  d = doc.updateMemo(d, { kind: 'node', id: d.nodes[0].id }, { note: 'memo' })
  const back = doc.deserialize(doc.serialize(d), 'x.mmap')
  assert.equal(back.filePath, 'x.mmap')
  assert.equal(back.dirty, false)
  assert.equal(back.nodes[0].note, 'memo')
  assert.equal(back.nodes.length, d.nodes.length)
})
await test('a file that is not a diagram is refused', () => {
  assert.throws(() => doc.deserialize('not json', 'x.mmap'))
})

await category('Layout')
for (const layout of ['radial', 'ttb', 'btt', 'ltr', 'rtl']) {
  await test(`mind map ${layout}: every node has a finite place`, () => {
    let d = { ...doc.createMindmapDoc('C'), layout }
    for (let i = 0; i < 6; i++) d = doc.addChild(d, d.nodes[0].id, `n${i}`)
    d = doc.relayout(d, 1200, 700)
    for (const n of d.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), n.text)
  })
}
for (const layout of ['ltr', 'rtl']) {
  await test(`fishbone ${layout}: the head is at its end`, () => {
    let d = { ...doc.createFishboneDoc('E', 'K'), layout }
    d = doc.relayout(d, 1200, 700)
    const head = d.nodes.find((n) => n.role === 'effect')
    const others = d.nodes.filter((n) => n !== head)
    for (const n of others) assert.ok(layout === 'ltr' ? n.x <= head.x : n.x >= head.x, n.text)
  })
}

await category('Grid and rulers')
await test('a cell stays 10 to 50 pixels at every zoom', () => {
  for (let zoom = 0.1; zoom <= 4; zoom += 0.01) {
    const px = grid.gridCell(zoom) * zoom
    assert.ok(px >= grid.CELL_MIN && px < grid.CELL_MAX, `${zoom}: ${px}`)
  }
})
await test('the grid changes level by a factor of five', () => {
  assert.equal(grid.gridCell(1), 20)
  assert.equal(grid.gridCell(0.25), 100)
  assert.equal(grid.gridCell(3), 4)
})
await test('lines follow zoom and pan, every fifth is major, all drawn alike', () => {
  const lines = grid.gridLines(100, 2, 500)
  const zero = lines.find((line) => line.value === 0)
  assert.equal(zero.px, 100.5)
  assert.ok(zero.major)
  const cell = grid.gridCell(2)
  for (const line of lines) {
    assert.equal(line.px, Math.round(100 + line.value * 2) + 0.5)
    assert.equal(line.major, Number.isInteger(line.value / (cell * 5)))
    assert.ok(line.px >= 0 && line.px <= 500)
  }
  assert.deepEqual(grid.gridLines(-5000, 1, 500).map((line) => line.px), grid.gridLines(-5000, 1, 500).map((line) => line.px).sort((a, b) => a - b))
})
await test('ruler labels are plain numbers', () => {
  assert.equal(grid.rulerLabel(-0), '0')
  assert.equal(grid.rulerLabel(100), '100')
  assert.equal(grid.rulerLabel(0.8), '0.8')
})

await category('Line themes')
await test('at least ten, each complete, with unique ids', () => {
  assert.ok(lineThemes.LINE_THEMES.length >= 10)
  assert.equal(new Set(lineThemes.LINE_THEMES.map((t) => t.id)).size, lineThemes.LINE_THEMES.length)
  for (const t of lineThemes.LINE_THEMES) {
    assert.ok(t.ko && t.en && t.palette.length > 0, t.id)
    for (const color of t.palette) assert.match(color, /^#[0-9a-f]{6}$/, t.id)
  }
})
await test('a theme styles every edge, colours follow the branches, new edges follow it', () => {
  let d = doc.createMindmapDoc('C')
  const c = d.nodes[0].id
  d = doc.addChild(d, c, 'a')
  const a = d.nodes.at(-1).id
  d = doc.addChild(d, c, 'b')
  d = doc.addChild(d, a, 'a1')
  const theme = lineThemes.lineThemeById('rainbow')
  const themed = doc.applyLineTheme(d, theme)
  assert.equal(themed.lineTheme, 'rainbow')
  assert.ok(themed.dirty)
  assert.ok(themed.edges.every((e) => e.lineType === 'curve'))
  const colorOf = (dd, text) => dd.edges.find((e) => e.to === dd.nodes.find((n) => n.text === text).id).color
  assert.equal(colorOf(themed, 'a'), theme.palette[0])
  assert.equal(colorOf(themed, 'b'), theme.palette[1])
  assert.equal(colorOf(themed, 'a1'), theme.palette[0], 'a grandchild keeps its branch')
  const more = doc.addChild(themed, c, 'n')
  assert.equal(colorOf(more, 'n'), theme.palette[2])
  const arrows = doc.addChild(doc.applyLineTheme(d, lineThemes.lineThemeById('flow')), c, 'x')
  assert.equal(arrows.edges.at(-1).endCap, 'arrow')
})
await test('the theme is saved with the diagram', () => {
  const d = doc.applyLineTheme(doc.createMindmapDoc('C'), lineThemes.lineThemeById('neon'))
  assert.equal(doc.deserialize(doc.serialize(d), null).lineTheme, 'neon')
  assert.equal(doc.deserialize(doc.serialize(doc.createMindmapDoc('C')), null).lineTheme, undefined)
})

await category('Mind map themes')
await test('at least twelve, each complete and with a real line theme', () => {
  assert.ok(diagramThemes.DIAGRAM_THEMES.length >= 12)
  assert.equal(new Set(diagramThemes.DIAGRAM_THEMES.map((t) => t.id)).size, diagramThemes.DIAGRAM_THEMES.length)
  for (const t of diagramThemes.DIAGRAM_THEMES) {
    assert.ok(t.ko && t.en && t.palette.length, t.id)
    assert.equal(lineThemes.lineThemeById(t.line).id, t.line, t.id)
  }
})
await test('text reads on a node of every theme', () => {
  for (const t of diagramThemes.DIAGRAM_THEMES) {
    const text = (c) => (c === 'auto' ? '#111827' : c)
    assert.ok(themes.contrast(text(t.rootText), t.root) >= 3, `${t.id} centre`)
    for (const color of t.palette) assert.ok(themes.contrast(text(t.text), color) >= 3, `${t.id} ${color}`)
  }
})
await test('a theme dresses nodes and lines, and new shapes follow it', () => {
  let d = doc.createMindmapDoc('C')
  const c = d.nodes[0].id
  d = doc.addChild(d, c, 'a')
  const a = d.nodes.at(-1).id
  d = doc.addChild(d, a, 'a1')
  const neon = diagramThemes.diagramThemeById('neon')
  const dressed = doc.applyDiagramTheme(d, neon)
  assert.equal(dressed.diagramTheme, 'neon')
  assert.equal(dressed.lineTheme, 'neon')
  assert.equal(dressed.nodes[0].color, neon.root)
  assert.equal(dressed.nodes[0].shape, neon.rootShape)
  assert.equal(dressed.nodes[0].textStyle.color, neon.rootText)
  assert.equal(dressed.nodes[1].shape, neon.shape)
  assert.equal(dressed.nodes[1].color, neon.palette[0])
  assert.ok(dressed.dirty)
  const more = doc.addChild(dressed, c, 'b')
  assert.equal(more.nodes.at(-1).color, neon.palette[1])
  assert.equal(more.nodes.at(-1).shape, neon.shape)
  assert.equal(more.nodes.at(-1).textStyle.color, neon.text)
  const back = doc.deserialize(doc.serialize(dressed), null)
  assert.equal(back.diagramTheme, 'neon')
  assert.equal(JSON.stringify(dressed).includes('canvasColor'), false, 'a theme leaves the canvas to the program')
})
await test('the default theme takes the dress off again', () => {
  const plain = doc.createMindmapDoc('C')
  const round = doc.applyDiagramTheme(doc.applyDiagramTheme(plain, diagramThemes.diagramThemeById('neon')), diagramThemes.diagramThemeById('default'))
  assert.equal(round.nodes[0].shape, 'rounded')
  assert.equal(round.nodes[0].textStyle.color, 'auto')
  assert.equal(round.nodes[0].color, plain.nodes[0].color)
})

await category('Selecting many')
const fan = () => {
  let d = doc.createMindmapDoc('C')
  const c = d.nodes[0].id
  for (const name of ['a', 'b', 'c']) d = doc.addChild(d, c, name)
  return d
}
await test('Shift-click adds a line and takes it off again', () => {
  const d = fan()
  const [e1, e2] = d.edges.map((e) => e.id)
  let s = doc.selectEdge(d, e1)
  s = doc.selectEdge(s, e2, true)
  assert.deepEqual(doc.targetEdgeIds(s), [e1, e2])
  s = doc.selectEdge(s, e1, true)
  assert.deepEqual(doc.targetEdgeIds(s), [e2])
  s = doc.selectEdge(s, e1)
  assert.deepEqual(doc.targetEdgeIds(s), [e1], 'a plain click starts over')
  assert.equal(doc.selectEdge(s, e1, true).selectedEdgeId, null, 'the last one off leaves nothing')
})
await test('a line edit reaches every selected line and no other', () => {
  const d = fan()
  const [e1, e2, e3] = d.edges.map((e) => e.id)
  const s = doc.selectEdge(doc.selectEdge(d, e1), e3, true)
  const done = doc.editLines(s, { width: 6, color: '#123456', linePattern: 'dashed' })
  const of = (id) => done.edges.find((e) => e.id === id)
  assert.equal(of(e1).width, 6)
  assert.equal(of(e3).color, '#123456')
  assert.equal(of(e3).linePattern, 'dashed')
  assert.equal(of(e2).width, undefined)
  assert.ok(done.dirty)
})
await test('with shapes selected, a line edit reaches the lines of all of them', () => {
  const d = fan()
  const ids = d.nodes.slice(1, 3).map((n) => n.id)
  const s = { ...d, selectedId: ids[0], selectedIds: ids, selectedEdgeId: null }
  const done = doc.editLines(s, { width: 4 })
  assert.deepEqual(done.edges.map((e) => e.width), [4, 4, undefined])
  assert.deepEqual(doc.targetNodeIds(s), ids)
  const none = { ...d, selectedId: null, selectedIds: [], selectedEdgeId: null }
  assert.equal(doc.editLines(none, { width: 4 }), none, 'nothing selected changes nothing')
})
await test('a line width is saved', () => {
  const d = fan()
  const s = doc.editLines(doc.selectEdge(d, d.edges[0].id), { width: 7 })
  assert.equal(doc.deserialize(doc.serialize(s), null).edges[0].width, 7)
})

await category('Page setup')
await test('anything read becomes valid', () => {
  for (const junk of [null, 5, [], { paper: 'Z9', orientation: 'x', margins: 3, pagesWide: 99, pagesTall: -1, header: 7 }]) {
    const s = pageSetup.sanitizePageSetup(junk)
    assert.ok(pageSetup.PAPERS[s.paper])
    assert.ok(s.pagesWide >= 1 && s.pagesWide <= pageSetup.PAGES_MAX)
    assert.ok(s.pagesTall >= 1)
    assert.equal(typeof s.header.center, 'string')
    assert.ok(Number.isFinite(s.margins.top))
  }
  assert.equal(pageSetup.sanitizePageSetup({ margins: { top: 0 } }).margins.top, 0, 'no margin is allowed')
})
await test('the sheet turns the way the diagram is shaped, unless told otherwise', () => {
  const d = pageSetup.DEFAULT_PAGE_SETUP
  assert.deepEqual(pageSetup.sheetSize(d, 1000, 400), { width: 297, height: 210 })
  assert.deepEqual(pageSetup.sheetSize(d, 400, 1000), { width: 210, height: 297 })
  assert.deepEqual(pageSetup.sheetSize({ ...d, orientation: 'portrait' }, 1000, 400), { width: 210, height: 297 })
  assert.deepEqual(pageSetup.sheetSize({ ...d, orientation: 'landscape', paper: 'A3' }, 1, 1000), { width: 420, height: 297 })
})
await test('the printable box takes off the margins and never collapses', () => {
  const d = pageSetup.DEFAULT_PAGE_SETUP
  const box = pageSetup.contentBox(d, { width: 210, height: 297 })
  assert.equal(box.width, 210 - d.margins.left - d.margins.right)
  assert.equal(box.y, d.margins.top)
  assert.ok(pageSetup.contentBox({ ...d, margins: { top: 60, right: 60, bottom: 60, left: 60 } }, { width: 100, height: 100 }).width > 0)
})
await test('several sheets divide the diagram into equal parts without gaps', () => {
  const s = { ...pageSetup.DEFAULT_PAGE_SETUP, pagesWide: 3, pagesTall: 2 }
  const slices = pageSetup.pageSlices(s, { x: 10, y: 20, width: 300, height: 200 })
  assert.equal(slices.length, 6)
  assert.deepEqual(slices[0], { x: 10, y: 20, width: 100, height: 100 })
  assert.deepEqual(slices[5], { x: 210, y: 120, width: 100, height: 100 })
})
await test('headers and footers fill in their values', () => {
  const values = { title: 'Trip', date: 'D', time: 'T', page: 2, pages: 5 }
  assert.equal(pageSetup.expandHeading('{title} - {page} / {pages} {date} {time} {x}', values), 'Trip - 2 / 5 D T {x}')
})

await category('Icons, memos and pictures')
await test('at least 40 icons, each with names and a drawing', () => {
  assert.ok(nodeIcons.NODE_ICONS.length >= 40)
  assert.equal(new Set(nodeIcons.NODE_ICONS.map((i) => i.id)).size, nodeIcons.NODE_ICONS.length)
  for (const i of nodeIcons.NODE_ICONS) {
    assert.ok(i.ko && i.en && i.body.startsWith('<'), i.id)
    assert.match(i.color, /^#[0-9a-f]{6}$/, i.id)
  }
})
await test('an icon goes on every selected shape, comes off, and is saved', () => {
  let d = doc.createMindmapDoc('C')
  const c = d.nodes[0].id
  d = doc.addChild(d, c, 'a')
  const ids = d.nodes.map((n) => n.id)
  d = doc.setNodeIcon(d, ids, 'star')
  assert.ok(d.nodes.every((n) => n.icon === 'star'))
  assert.equal(doc.deserialize(doc.serialize(d), null).nodes[1].icon, 'star')
  d = doc.setNodeIcon(d, [c], undefined)
  assert.equal(d.nodes[0].icon, undefined)
  assert.equal(d.nodes[1].icon, 'star')
})
await test('a memo on a shape and on a line: text, look, removal, saving', () => {
  let d = doc.createMindmapDoc('C')
  const c = d.nodes[0].id
  d = doc.addChild(d, c, 'a')
  const edge = d.edges[0].id
  d = doc.updateMemo(d, { kind: 'node', id: c }, { note: 'on shape', style: { color: '#112233', width: 200 } })
  d = doc.updateMemo(d, { kind: 'edge', id: edge }, { note: 'on line', style: { bold: true } })
  assert.equal(d.nodes[0].note, 'on shape')
  assert.equal(d.nodes[0].noteStyle.width, 200)
  assert.equal(d.edges[0].note, 'on line')
  d = doc.updateMemo(d, { kind: 'node', id: c }, { style: { fontSize: 20 } })
  assert.equal(d.nodes[0].noteStyle.color, '#112233', 'the rest of its look stays')
  const back = doc.deserialize(doc.serialize(d), null)
  assert.equal(back.edges[0].note, 'on line')
  assert.equal(back.edges[0].noteStyle.bold, true)
  assert.equal(back.nodes[0].noteStyle.fontSize, 20)
  d = doc.updateMemo(d, { kind: 'edge', id: edge }, { remove: true })
  assert.equal(d.edges[0].note, undefined)
  assert.equal(d.edges[0].noteStyle, undefined)
})
await test('a memo look is always valid, and an old plain note gets the default', () => {
  assert.deepEqual(memo.sanitizeMemo(undefined), memo.DEFAULT_MEMO)
  const m = memo.sanitizeMemo({ color: 'red', width: 1, height: 99999, fontSize: 'x', bold: 'yes' })
  assert.equal(m.color, memo.DEFAULT_MEMO.color)
  assert.equal(m.width, memo.MEMO_MIN_SIZE)
  assert.equal(m.height, memo.MEMO_MAX_SIZE)
  assert.equal(m.fontSize, memo.DEFAULT_MEMO.fontSize)
  assert.equal(m.bold, false)
  assert.equal(settings.sanitizeGeneral({ memo: { width: 300 } }).memo.width, 300)
  assert.deepEqual(settings.sanitizeGeneral({}).memo, memo.DEFAULT_MEMO)
  const line = memo.sanitizeMemo({ lineColor: 'x', lineWidth: 99, linePattern: 'zigzag' })
  assert.equal(line.lineColor, memo.DEFAULT_MEMO.lineColor)
  assert.equal(line.lineWidth, memo.MEMO_LINE_MAX)
  assert.equal(line.linePattern, memo.DEFAULT_MEMO.linePattern)
  assert.equal(memo.sanitizeMemo({ linePattern: 'none' }).linePattern, 'none')
  assert.equal(settings.sanitizeSettings({ showMemos: false }).showMemos, false)
})
await test('memo text wraps at spaces, inside long words, and at line breaks', () => {
  const by = (text) => text.length
  assert.deepEqual(memo.wrapMemo('one two three', 7, by), ['one two', 'three'])
  assert.deepEqual(memo.wrapMemo('abcdefghij', 4, by), ['abcd', 'efgh', 'ij'])
  assert.deepEqual(memo.wrapMemo('a\nb', 10, by), ['a', 'b'])
  assert.deepEqual(memo.wrapMemo('', 10, by), [''])
})
await test('a picture is fitted, keeps its proportions, and survives saving and layout', () => {
  let d = doc.createMindmapDoc('C')
  d = doc.addImageNode(d, 'big.png', 'data:image/png;base64,AA==', 3200, 1600)
  const p = d.nodes.at(-1)
  assert.equal(p.width, 320)
  assert.equal(p.height, 160)
  assert.equal(p.parentId, null)
  assert.equal(d.selectedId, p.id)
  d = doc.setImageWidth(d, p.id, 100)
  assert.equal(d.nodes.at(-1).height, 50)
  const back = doc.deserialize(doc.serialize(d), null)
  assert.equal(back.nodes.at(-1).image.src, p.image.src)
  const laid = doc.relayout(d, 1200, 700)
  assert.ok(laid.nodes.at(-1).image)
  assert.equal(laid.nodes[0].parentId, null)
  const small = doc.addImageNode(doc.createMindmapDoc('C'), 's.png', 'x', 40, 30).nodes.at(-1)
  assert.equal(small.width, 40, 'a small picture is not enlarged')
  const themed = doc.applyDiagramTheme(d, diagramThemes.diagramThemeById('neon'))
  assert.equal(themed.nodes.at(-1).image.src, p.image.src)
})

await category('Tutorials')
for (const tutorial of tutorials.TUTORIALS) {
  for (const language of ['ko', 'en']) {
    await test(`${tutorial.id} in ${language}: each step is undone, then done by "do it", to the end`, () => {
      let d = tutorial.mode === 'fishbone' ? doc.createFishboneDoc('E', 'K') : doc.createMindmapDoc('C')
      for (const step of tutorial.steps) {
        assert.ok(step.title[language] && step.text[language], step.id)
        if (!step.done) continue
        assert.equal(step.done(d, language), false, `${step.id} is done before it starts`)
        d = tutorials.applyStep(step, d, language)
        assert.equal(step.done(d, language), true, `${step.id} is not done by its own action`)
      }
      for (const step of tutorial.steps) if (step.id !== 'mode' && step.done) assert.ok(step.done(d, language), `${step.id} was undone by a later step`)
    })
  }
}
await test('the mind map ends as the trip plan, the fishbone as its causes', () => {
  let m = doc.createMindmapDoc('C')
  for (const step of tutorials.tutorialById('mindmap').steps) m = tutorials.applyStep(step, m, 'ko')
  assert.deepEqual(m.nodes.map((n) => n.text), ['여행 계획', '교통', '숙소', '먹거리', '기차'])
  assert.equal(m.layout, 'ltr')
  assert.equal(m.lineTheme, 'rainbow')
  let f = doc.createFishboneDoc('E', 'K')
  for (const step of tutorials.tutorialById('fishbone').steps) f = tutorials.applyStep(step, f, 'en')
  for (const word of ['Late for Work', 'Sleep', 'Traffic', 'Stayed Up Late', 'Bus Delay']) assert.ok(f.nodes.some((n) => n.text === word), word)
})

await category('Settings')
await test('anything read becomes valid', () => {
  for (const junk of [null, 5, 'x', [], { language: 'fr', theme: 'nope', showGrid: 'no', recent: 'x', startScreen: 3, general: [] }]) {
    const s = settings.sanitizeSettings(junk)
    assert.equal(s.language, 'ko')
    assert.equal(s.theme, themes.DEFAULT_THEME_ID)
    assert.deepEqual(s.recent, [])
    assert.ok(backgrounds.isBackgroundKind(s.startScreen.background))
    assert.equal(s.general.newMode, 'mindmap')
  }
  const on = settings.sanitizeSettings({})
  assert.ok(on.showGrid && on.showRulers && on.leftPanel && on.rightPanel)
  assert.equal(on.themeAreaHeight, settings.THEME_AREA_DEFAULT)
  assert.equal(settings.sanitizeSettings({ themeAreaHeight: 5 }).themeAreaHeight, settings.THEME_AREA_MIN)
  assert.equal(settings.sanitizeSettings({ themeAreaHeight: 'x' }).themeAreaHeight, settings.THEME_AREA_DEFAULT)
  const off = settings.sanitizeSettings({ showRulers: false, leftPanel: false, rightPanel: false })
  assert.ok(!off.showRulers && !off.leftPanel && !off.rightPanel)
})
await test('start screen numbers are stepped and limited', () => {
  const s = settings.sanitizeStartScreen({ speed: 999, cardOpacity: 3, background: 'gone' })
  assert.equal(s.speed, settings.SPEED_MAX)
  assert.equal(s.cardOpacity, settings.OPACITY_MIN)
  assert.equal(s.background, settings.DEFAULT_START_SCREEN.background)
  assert.equal(settings.sanitizeStartScreen({}).speed, null)
  assert.equal(settings.effectiveSpeed(null, true), settings.REDUCED_MOTION_SPEED)
})
await test('general options keep only known values', () => {
  const g = settings.sanitizeGeneral({ newMode: 'fishbone', fishboneLayout: 'radial', newShape: 'blob', reopenLast: true })
  assert.equal(g.newMode, 'fishbone')
  assert.equal(g.fishboneLayout, 'ltr')
  assert.equal(g.newShape, 'rounded')
  assert.equal(g.reopenLast, true)
})
await test('recent files: newest first, once, limited', () => {
  let list = []
  for (let i = 0; i < 20; i++) list = settings.addRecent(list, `C:/f${i}.mmap`)
  assert.equal(list.length, settings.MAX_RECENT)
  assert.equal(list[0], 'C:/f19.mmap')
  list = settings.addRecent(list, 'c:/F5.MMAP')
  list = settings.addRecent(list, 'C:/f5.mmap')
  assert.equal(list.filter((f) => f.toLowerCase() === 'c:/f5.mmap').length, 1)
  assert.equal(settings.removeRecent(['A.mmap'], 'a.MMAP').length, 0)
})
await test('user themes: bad ones dropped, bad colours replaced, ids unique', () => {
  const list = settings.sanitizeCustomThemes([{ id: 'custom-1', name: ' Mine ', mode: 'dark', colors: { bg: '#ABCDEF', ink: 'red' } }, { id: 'custom-1' }, { id: 'evil"}' }, 7])
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'Mine')
  assert.equal(list[0].colors.bg, '#abcdef')
  assert.match(list[0].colors.ink, /^#[0-9a-f]{6}$/)
  const copy = settings.customThemeFrom('dark-navy', 'New', list)
  assert.notEqual(copy.id, 'custom-1')
  assert.equal(copy.mode, 'dark')
})

await category('Themes')
await test('20 light and 20 dark', () => {
  assert.equal(themes.THEMES.filter((t) => t.mode === 'light').length, 20)
  assert.equal(themes.THEMES.filter((t) => t.mode === 'dark').length, 20)
  assert.equal(new Set(themes.THEMES.map((t) => t.id)).size, 40)
})
await test('text reads on every theme\'s surfaces', () => {
  for (const t of themes.THEMES) {
    for (const surface of ['--panel', '--bg', '--header']) {
      assert.ok(themes.contrast(t.vars['--ink'], t.vars[surface]) >= 4.5, `${t.id} ${surface}`)
    }
    assert.ok(themes.contrast(t.vars['--muted'], t.vars['--panel']) >= 4.5, `${t.id} muted`)
    assert.ok(themes.contrast(t.vars['--on-accent'], t.vars['--accent']) >= 3, `${t.id} on accent`)
  }
})
await test('what an exported SVG takes from a theme is a plain colour', () => {
  for (const t of themes.THEMES) {
    for (const key of ['--spine', '--node-stroke', '--accent', '--grid-line', '--grid-line-major']) {
      assert.match(t.vars[key], /^(#[0-9a-f]{6}|rgba\([\d, .]+\))$/, `${t.id} ${key}`)
    }
  }
})
await test('every token the stylesheets use is defined', () => {
  const css = ['global', 'chrome', 'start', 'icons'].map((name) => read(`src/styles/${name}.css`)).join('\n')
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]))
  for (const key of Object.keys(themes.THEMES[0].vars)) defined.add(key)
  for (const key of ['--start-card-alpha', '--guide-font', '--popout-max', '--left', '--right']) defined.add(key)
  const missing = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter((key) => !defined.has(key))
  assert.deepEqual(missing, [])
})

await category('Start screen board')
const span = { hero: 3, actions: 2, recent: 1, samples: 1, theme: 2, background: 3 }
const ids = settings.START_CARDS
const noOverlaps = (cards) => {
  const list = Object.values(cards)
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!board.overlaps(list[i], list[j]))
}
await test('the default arrangement has no overlaps', () => noOverlaps(board.autoArrange(ids, span)))
await test('moving a card pushes the others out of its way', () => {
  const cards = board.cardsOf(null, ids, span)
  noOverlaps(board.place(cards, 'recent', { col: 0, row: 0 }))
})
await test('a saved layout survives, and a broken one is repaired', () => {
  const cards = board.place(board.cardsOf(null, ids, span), 'recent', { col: 0, row: 0 })
  const saved = board.layoutValue(cards)
  assert.equal(board.layoutKey(board.cardsOf(JSON.parse(JSON.stringify(saved)), ids, span)), board.layoutKey(cards))
  noOverlaps(board.cardsOf({ version: board.LAYOUT_VERSION, cards: { hero: { col: 99, row: -4, w: 9, h: 0 } } }, ids, span))
  assert.equal(board.cardsOf({ version: board.LAYOUT_VERSION - 1, cards: { samples: { col: 2, row: 0, w: 1, h: 30, fit: false } } }, ids, span).samples.w, span.samples, 'an older arrangement starts over')
  assert.equal(Object.keys(board.cardsOf({ version: 99 }, ids, span)).length, ids.length)
})

await category('Backgrounds')
await test('at least 20, each with a name in both languages', () => {
  assert.ok(backgrounds.BACKGROUND_KINDS.length >= 20)
  for (const language of ['ko', 'en']) {
    const names = JSON.parse(read(`src/i18n/locales/${language}.json`)).bg
    for (const kind of backgrounds.BACKGROUND_KINDS) assert.ok(names[kind], `${language} ${kind}`)
  }
})
await test('each draws at any time and any size without failing', () => {
  // A context that accepts every call and every property, gradients included.
  const fake = () => new Proxy({}, {
    get: (target, name) => (name in target ? target[name] : (name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})),
    set: (target, name, value) => { target[name] = value; return true },
  })
  const palette = { bg: [1, 2, 3], panel: [4, 5, 6], ink: [7, 8, 9], muted: [10, 11, 12], line: [13, 14, 15], accent: [16, 17, 18] }
  for (const kind of backgrounds.BACKGROUND_KINDS) {
    for (const [w, h] of [[44, 30], [1500, 900]]) for (const t of [0, 12.5, 4000]) backgrounds.drawBackground(kind, fake(), w, h, t, palette)
  }
})

await test('each picker tile has a colour of its own, in light and dark', () => {
  const light = { bg: [250, 250, 250] }
  const dark = { bg: [15, 15, 20] }
  const of = (base) => new Set(backgrounds.BACKGROUND_KINDS.map((kind) => backgrounds.chipPalette(kind, base).accent.map(Math.round).join()))
  assert.equal(of(light).size, backgrounds.BACKGROUND_KINDS.length)
  assert.equal(of(dark).size, backgrounds.BACKGROUND_KINDS.length)
  const [r, g, b] = backgrounds.chipPalette('neurons', dark).bg
  assert.ok(r + g + b < 300, 'a dark tile on a dark theme')
})

await category('Translations')
const flat = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) => (value && typeof value === 'object' ? flat(value, `${prefix}${key}.`) : [`${prefix}${key}`]))
const ko = JSON.parse(read('src/i18n/locales/ko.json'))
const en = JSON.parse(read('src/i18n/locales/en.json'))
await test('both languages have the same keys', () => assert.deepEqual(flat(ko).sort(), flat(en).sort()))
await test('every key the code names exists', () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
  const keys = new Set(flat(ko))
  const missing = []
  for (const file of walk('src').filter((f) => /\.tsx?$/.test(f))) {
    for (const match of read(file).matchAll(/\bt\('([a-zA-Z]+\.[\w.]+)'/g)) if (!keys.has(match[1])) missing.push(`${file}: ${match[1]}`)
  }
  assert.deepEqual(missing, [])
})

await category('Samples and documents')
const index = JSON.parse(read('template/index.json'))
await test('every sample in the list opens, in the mode it claims', () => {
  for (const sample of index) {
    const d = doc.deserialize(read(`template/${sample.file}`), null)
    assert.equal(d.mode, sample.mode, sample.id)
    assert.ok(d.nodes.length > 0)
    assert.ok(sample.ko[0] && sample.ko[1] && sample.en[0] && sample.en[1], sample.id)
  }
})
await test('20 mind map samples and 20 fishbone samples', () => {
  assert.equal(index.filter((s) => s.mode === 'mindmap').length, 20)
  assert.equal(index.filter((s) => s.mode === 'fishbone').length, 20)
  assert.equal(new Set(index.map((s) => s.id)).size, index.length)
})
await test('a sample with a line theme names one that exists', () => {
  for (const sample of index) {
    const d = doc.deserialize(read(`template/${sample.file}`), null)
    if (d.lineTheme) assert.equal(lineThemes.lineThemeById(d.lineTheme).id, d.lineTheme, sample.id)
  }
})
await test('every sample file is in the list', () => {
  const listed = index.map((s) => s.file).sort()
  assert.deepEqual(fs.readdirSync(path.join(root, 'template')).filter((f) => f.endsWith('.mmap')).sort(), listed)
})
await test('the guide has the same headings in both languages', () => {
  const outline = (file) => markdown.parseMarkdown(read(file)).filter((b) => b.type === 'heading').map((b) => b.level)
  assert.deepEqual(outline('doc/UsersGuide.md'), outline('doc/UsersGuide.en.md'))
})
await test('markdown: blocks and inline pieces', () => {
  const blocks = markdown.parseMarkdown('# T\n\ntext\n\n- a\n- b\n\n| x |\n|---|\n| y |\n\n```\ncode\n```\n')
  assert.deepEqual(blocks.map((b) => b.type), ['heading', 'paragraph', 'list', 'table', 'code'])
  assert.deepEqual(markdown.inlinePieces('a **b** `c`'), [{ text: 'a ' }, { bold: 'b' }, { text: ' ' }, { code: 'c' }])
})

await category('Build')
await test('nothing of Electron is left', () => {
  const pkg = JSON.parse(read('package.json'))
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  assert.ok(!names.some((name) => name.includes('electron')))
  assert.ok(!fs.existsSync(path.join(root, 'electron')))
})
await test('the TypeScript types check', () => {
  const run = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], { cwd: root, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stdout)
})
await test('the Rust unit tests pass', () => {
  const run = spawnSync('cargo', ['test', '--quiet'], { cwd: path.join(root, 'src-tauri'), encoding: 'utf8', env: { ...process.env, CARGO_TARGET_DIR: path.join(root, 'src-tauri', 'target', 'e2e') } })
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`)
})

fs.rmSync(path.join(results, 'bundle'), { recursive: true, force: true })
process.exit(summary())
