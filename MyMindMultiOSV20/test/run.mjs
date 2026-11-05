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
  d = doc.setNodeNote(d, d.nodes[0].id, 'memo')
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
  for (const key of ['--start-card-alpha', '--guide-font', '--popout-max']) defined.add(key)
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
  noOverlaps(board.cardsOf({ version: 1, cards: { hero: { col: 99, row: -4, w: 9, h: 0 } } }, ids, span))
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
