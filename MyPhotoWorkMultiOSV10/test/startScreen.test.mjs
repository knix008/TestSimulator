// The start screen: its background, its settings, its card layout and its place in the app.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import { AnimatedBackground, cssRgb } from '../src/lib/startBackground.ts'
import { ANIMATION_KINDS, DEFAULT_START_BACKGROUND, normalizeStartBackground } from '../src/lib/startSettings.ts'
import { autoArrange, cardsOf, compact, layoutValue, overlaps, place, rowsFor, swapVertical } from '../src/lib/startLayout.ts'
import { SAMPLE_IMAGES, renderSample } from '../src/lib/sampleImages.ts'
import { defaultSettings } from '../src/lib/types.ts'
import { loadSettings } from '../src/lib/settings.ts'
import { t } from '../src/i18n.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const palette = { bg: [15, 21, 27], bg2: [26, 36, 48], accent: [110, 200, 255], text: [238, 246, 250], warm: [255, 176, 92], cool: [122, 162, 255], dark: true }

function scene(kind, speed = () => 1) {
  const canvas = createCanvas(320, 200)
  canvas.getBoundingClientRect = () => ({ width: 320, height: 200 })
  return { canvas, engine: new AnimatedBackground(canvas, { kind, colors: () => palette, speed }) }
}
const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data

/* ------------------------------------------------------------ backgrounds */

test('there are eighteen backgrounds, as many as the sibling app, each named in both languages', () => {
  assert.equal(ANIMATION_KINDS.length, 18)
  assert.equal(new Set(ANIMATION_KINDS).size, 18, 'a background is listed twice')
  for (const kind of ANIMATION_KINDS) {
    for (const language of ['ko', 'en']) {
      assert.notEqual(t(language, `anim_${kind}`), `anim_${kind}`, `${kind} has no ${language} name`)
      assert.notEqual(t(language, `anim_${kind}_d`), `anim_${kind}_d`, `${kind} has no ${language} description`)
    }
  }
})

for (const kind of ANIMATION_KINDS) {
  test(`the ${kind} background draws and moves`, () => {
    const { canvas, engine } = scene(kind)
    const background = pixels(canvas)
    const plain = [background[0], background[1], background[2]]
    for (let frame = 0; frame < 45; frame += 1) { engine.time += 1 / 15; engine.draw(1 / 15) }
    const first = pixels(canvas)
    let painted = 0
    for (let at = 0; at < first.length; at += 4) if (first[at] !== plain[0] || first[at + 1] !== plain[1] || first[at + 2] !== plain[2]) painted += 1
    assert.ok(painted > 100, `only ${painted} pixels differ from the plain background`)
    for (let frame = 0; frame < 45; frame += 1) { engine.time += 1 / 15; engine.draw(1 / 15) }
    const second = pixels(canvas)
    let moved = 0
    for (let at = 0; at < second.length; at += 4) if (second[at] !== first[at]) moved += 1
    assert.ok(moved > 50, `only ${moved} pixels changed over three seconds`)
    engine.destroy()
  })
}

test('switching background keeps to the known kinds, and shuffle always changes it', () => {
  const { engine } = scene('bokeh')
  engine.setKind('nonsense')
  assert.equal(engine.kind, 'bokeh')
  engine.setKind('mosaic')
  assert.equal(engine.kind, 'mosaic')
  for (let round = 0; round < 40; round += 1) {
    const before = engine.kind
    assert.notEqual(engine.shuffle(), before)
  }
  engine.destroy()
})

test('a speed of zero freezes the picture', () => {
  const { canvas, engine } = scene('aperture', () => 0)
  engine.draw(0)
  const first = Buffer.from(pixels(canvas))
  engine.time += 0
  engine.draw(0)
  assert.ok(Buffer.from(pixels(canvas)).equals(first), 'the picture changed with the speed at 0')
  engine.destroy()
})

test('theme colours are read whatever form the token takes', () => {
  assert.deepEqual(cssRgb('#102030', [0, 0, 0]), [16, 32, 48])
  assert.deepEqual(cssRgb('#fff', [0, 0, 0]), [255, 255, 255])
  assert.deepEqual(cssRgb('rgba(1, 2, 3, 0.5)', [0, 0, 0]), [1, 2, 3])
  assert.deepEqual(cssRgb('nonsense', [7, 8, 9]), [7, 8, 9])
})

/* --------------------------------------------------------------- settings */

test('stored background settings are cleaned up', () => {
  assert.deepEqual(normalizeStartBackground(null), DEFAULT_START_BACKGROUND)
  assert.equal(normalizeStartBackground({ kind: 'nope' }).kind, DEFAULT_START_BACKGROUND.kind)
  assert.equal(normalizeStartBackground({ speed: 9999 }).speed, 300)
  assert.equal(normalizeStartBackground({ speed: -5 }).speed, 0)
  assert.equal(normalizeStartBackground({ transparency: 140 }).transparency, 100)
  assert.equal(normalizeStartBackground({ speed: 'x' }).speed, DEFAULT_START_BACKGROUND.speed)
  assert.equal(normalizeStartBackground({ random: 'yes' }).random, false)
  assert.equal(normalizeStartBackground({ layout: 3 }).layout, null)
})

test('the settings loader keeps the start screen settings and repairs bad ones', () => {
  assert.equal(defaultSettings.showStartOnLaunch, true)
  assert.equal(defaultSettings.tutorialAskOnLaunch, true)
  localStorage.setItem('my-photo-work-v1-settings', JSON.stringify({ showStartOnLaunch: false, startBackground: { kind: 'mosaic', speed: 500 } }))
  const loaded = loadSettings()
  assert.equal(loaded.showStartOnLaunch, false)
  assert.equal(loaded.startBackground.kind, 'mosaic')
  assert.equal(loaded.startBackground.speed, 300)
  localStorage.removeItem('my-photo-work-v1-settings')
})

/* ----------------------------------------------------------------- layout */

const IDS = ['hero', 'create', 'recent', 'side', 'help', 'samples']
const SPAN = { hero: 3, create: 2, recent: 1, side: 1, help: 2, samples: 3 }
const noOverlaps = (cards) => {
  const list = Object.values(cards)
  for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) assert.ok(!overlaps(list[a], list[b]), 'two cards overlap')
}

test('the default arrangement has no overlaps and starts with the hero', () => {
  const cards = cardsOf(null, IDS, SPAN, { hero: 6, create: 10, recent: 5, side: 20, help: 5, samples: 12 })
  noOverlaps(cards)
  assert.deepEqual([cards.hero.col, cards.hero.row, cards.hero.w], [0, 0, 3])
  assert.equal(cards.recent.col, 2, 'the narrow cards sit beside the wide one')
})

test('a dropped card keeps its column and the others make room', () => {
  const cards = cardsOf(null, IDS, SPAN, { hero: 6, create: 10, recent: 5, side: 20, help: 5, samples: 12 })
  const moved = place(cards, 'recent', { col: 0, row: 0 })
  noOverlaps(moved)
  assert.equal(moved.recent.col, 0)
  assert.equal(moved.recent.row, 0)
})

test('the layout survives being saved and read back', () => {
  const cards = cardsOf(null, IDS, SPAN, { hero: 6, create: 10, recent: 5, side: 20, help: 5, samples: 12 })
  const moved = place(cards, 'help', { col: 1, row: 40, w: 2, h: 9, fit: false })
  const again = cardsOf(JSON.parse(JSON.stringify(layoutValue(moved))), IDS, SPAN, { hero: 6, create: 10, recent: 5, side: 20, samples: 12 })
  assert.equal(again.help.fit, false)
  assert.equal(again.help.h, 9)
  noOverlaps(again)
})

test('a card the saved layout does not know goes below the others, and rubbish is ignored', () => {
  const saved = { version: 1, cards: { hero: { col: 0, row: 0, w: 3, h: 6, fit: true } } }
  const cards = cardsOf(saved, IDS, SPAN)
  for (const id of IDS) assert.ok(cards[id], `${id} is lost`)
  noOverlaps(cards)
  noOverlaps(cardsOf({ version: 99, cards: 'no' }, IDS, SPAN))
})

test('Alt+arrows swap with the neighbouring card, and Auto Arrange restores the order', () => {
  const cards = compact(autoArrange(IDS, SPAN, { hero: 6, create: 10, recent: 5, side: 20, help: 5, samples: 12 }))
  const swapped = swapVertical(cards, 'side', -1)
  assert.ok(swapped.side.row < swapped.recent.row, 'the card did not move up')
  noOverlaps(swapped)
  assert.deepEqual(swapVertical(cards, 'hero', -1), cards, 'the top card has nowhere to go')
  assert.equal(rowsFor(186), 10)
})

/* ---------------------------------------------------------------- samples */

test('every sample picture draws something and is named in both languages', () => {
  assert.ok(SAMPLE_IMAGES.length >= 6)
  for (const sample of SAMPLE_IMAGES) {
    assert.ok(sample.name.ko && sample.name.en && sample.note.ko && sample.note.en, `${sample.id} is not named`)
    const canvas = renderSample(sample, 120, 80)
    const data = canvas.getContext('2d').getImageData(0, 0, 120, 80).data
    const colours = new Set()
    for (let at = 0; at < data.length; at += 40) colours.add(`${data[at]},${data[at + 1]},${data[at + 2]}`)
    assert.ok(colours.size > 4, `${sample.id} is nearly blank`)
  }
})

/* --------------------------------------------------------------- the app */

test('the Start Screen button is the first thing in the menu bar', () => {
  const app = read('src/App.tsx')
  const bar = app.slice(app.indexOf('<nav className="menu-bar">'))
  const button = bar.indexOf('start-toggle')
  assert.ok(button > 0 && button < bar.indexOf('{menuOrder.map('), 'the button is not left of the menus')
  assert.match(app, /useState\(\(\) => settings\.showStartOnLaunch\)/, 'the start-up choice is not honoured')
  assert.equal(app.split('start-toggle').length - 1, 1, 'there is more than one Start Screen button')
})

test('Settings has a page for the start screen with the same controls as the card', () => {
  const dialogs = read('src/dialogs.tsx')
  assert.match(dialogs, /const tabs = \['general', 'start', /, 'there is no start screen tab')
  const page = dialogs.slice(dialogs.indexOf("settingsTab === 'start'"), dialogs.indexOf("settingsTab === 'theme'"))
  for (const part of ["check('showStartOnLaunch'", "check('tutorialAskOnLaunch'", '<BackgroundKinds', '<BackgroundControls', "action: 'showStart'"]) {
    assert.ok(page.includes(part), `the page is missing ${part}`)
  }
  assert.match(read('src/start/StartScreen.tsx'), /<BackgroundKinds language=\{language\}/, 'the card has other controls')
  assert.notEqual(t('ko', 'settingsTabStart'), 'settingsTabStart')
  assert.notEqual(t('en', 'settingsTabStart'), 'settingsTabStart')
})

test('a command that goes to work closes the start screen, and help does not', () => {
  const app = read('src/App.tsx')
  assert.match(app, /if \(id !== 'help\.quick' && id !== 'edit\.preferences' && id !== 'edit\.keyboardShortcuts'\) setStartOn\(false\)/)
})

test('the cards use no backdrop filter, which flickers in WebView2 over a moving canvas', () => {
  assert.doesNotMatch(read('src/start/start.css'), /backdrop-filter\s*:/)
})
