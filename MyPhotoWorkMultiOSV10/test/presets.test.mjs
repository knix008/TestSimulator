// What the right panel starts with, the panel itself, and the right-click menu.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PATTERN_SAMPLES, renderPatternSample } from '../src/lib/patternSamples.ts'
import { BUILTIN_BRUSHES, BUILTIN_SHAPES, BUILTIN_STYLES, BUILTIN_TOOL_PRESETS } from '../src/lib/presets.ts'
import { DEFAULT_SWATCHES, migrateSwatches } from '../src/lib/swatches.ts'
import { gradientLabel, gradientPresets, sampleGradient } from '../src/lib/gradients.ts'
import { defaultEffects, defaultSettings } from '../src/lib/types.ts'
import { traceShape } from '../src/lib/effects.ts'
import { createCanvas } from '../src/lib/canvas.ts'
import { allToolIds } from './helpers/tools.mjs'
import { canvasContextRows, contextRows, layerContextRows, placeContextMenu } from '../src/contextRows.ts'
import { findCommand } from '../src/commands.ts'
import { fieldIcon } from '../src/fieldIcons.ts'
import { t } from '../src/i18n.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const named = (list) => { for (const item of list) assert.ok(item.name.ko && item.name.en, `${item.id} is not named in both languages`) }
const unique = (list) => assert.equal(new Set(list.map((item) => item.id)).size, list.length, 'an id is used twice')

/* --------------------------------------------------------------- swatches */

test('the swatches start with forty different colours, pastels among them', () => {
  assert.equal(DEFAULT_SWATCHES.length, 40)
  assert.equal(new Set(DEFAULT_SWATCHES.map((colour) => colour.toLowerCase())).size, 40, 'two swatches are the same colour')
  for (const colour of DEFAULT_SWATCHES) assert.match(colour, /^#[0-9a-f]{6}$/i)
  assert.equal(defaultSettings.swatches, DEFAULT_SWATCHES)
  // A pastel: light, and with some colour left in it.
  const pastels = DEFAULT_SWATCHES.filter((colour) => {
    const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16))
    return Math.min(r, g, b) >= 170 && Math.max(r, g, b) - Math.min(r, g, b) >= 15
  })
  assert.ok(pastels.length >= 12, `only ${pastels.length} pastels`)
})

test('someone still on the old twelve gets the forty; a list of their own is left alone', () => {
  const old = ['#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78350f']
  assert.equal(migrateSwatches(old), DEFAULT_SWATCHES)
  const mine = ['#123456']
  assert.equal(migrateSwatches(mine), mine)
})

/* --------------------------------------------------------------- patterns */

const pixelsOf = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data

test('there are forty sample patterns, each its own picture', () => {
  assert.equal(PATTERN_SAMPLES.length, 40)
  unique(PATTERN_SAMPLES)
  named(PATTERN_SAMPLES)
  const seen = new Map()
  for (const sample of PATTERN_SAMPLES) {
    const canvas = renderPatternSample(sample)
    assert.equal(canvas.width, sample.size)
    const data = pixelsOf(canvas)
    const colours = new Set()
    for (let at = 0; at < data.length; at += 4) colours.add(`${data[at]},${data[at + 1]},${data[at + 2]}`)
    assert.ok(colours.size >= 2, `${sample.id} is a flat colour`)
    const key = Buffer.from(data).toString('base64')
    assert.ok(!seen.has(key), `${sample.id} draws the same picture as ${seen.get(key)}`)
    seen.set(key, sample.id)
  }
})

test('a sample pattern repeats without a visible seam', () => {
  for (const sample of PATTERN_SAMPLES) {
    const canvas = renderPatternSample(sample)
    const data = pixelsOf(canvas)
    const s = canvas.width
    const at = (x, y) => (y * s + x) * 4
    const between = (x1, x2) => {
      let sum = 0
      for (let y = 0; y < s; y += 1) for (let c = 0; c < 3; c += 1) sum += Math.abs(data[at(x1, y) + c] - data[at(x2, y) + c])
      return sum / s
    }
    let worst = 0
    for (let x = 0; x < s - 1; x += 1) worst = Math.max(worst, between(x, x + 1))
    const seam = between(s - 1, 0)
    assert.ok(seam <= worst + 60, `${sample.id}: the seam jumps ${seam.toFixed(0)}, the most anywhere inside is ${worst.toFixed(0)}`)
  }
})

test('the panel makes one current, and fills with it on a double click', () => {
  const app = read('src/App.tsx')
  assert.match(app, /const choosePatternSample = /)
  assert.match(app, /fillWithPatternSample: \(sample\) => fillSelection\(/)
  assert.match(read('src/panels.tsx'), /onDoubleClick=\{\(\) => ctx\.fillWithPatternSample\(sample\)\}/)
})

/* -------------------------------------------------------------- gradients */

test('there are many more gradients, all named in both languages', () => {
  assert.ok(gradientPresets.length >= 40, `only ${gradientPresets.length}`)
  assert.equal(new Set(gradientPresets.map((item) => item.id)).size, gradientPresets.length)
  for (const preset of gradientPresets) {
    assert.ok(preset.stops.length >= 2, `${preset.id} has one stop`)
    assert.notEqual(gradientLabel(preset, 'ko'), gradientLabel(preset, 'en'), `${preset.id} has no Korean name`)
    if (!preset.stops.some((stop) => stop.color === 'foreground')) assert.ok(sampleGradient(preset, 0.5))
  }
  assert.equal(gradientLabel({ id: 'mine', name: 'Mine', stops: [], opacityStops: [] }, 'ko'), 'Mine', 'a name the user gave is kept')
})

/* ---------------------------------------------------------------- presets */

test('brushes, tool presets and styles each have twenty or more built in', () => {
  for (const [name, list] of [['brushes', BUILTIN_BRUSHES], ['tool presets', BUILTIN_TOOL_PRESETS], ['styles', BUILTIN_STYLES]]) {
    assert.ok(list.length >= 20, `only ${list.length} ${name}`)
    unique(list)
    named(list)
  }
})

test('built-in brushes stay inside the ranges the controls allow', () => {
  for (const brush of BUILTIN_BRUSHES) {
    assert.ok(brush.size >= 1 && brush.size <= 400, brush.id)
    assert.ok(brush.hardness >= 0 && brush.hardness <= 1, brush.id)
    assert.ok(brush.spacing >= 0.02 && brush.spacing <= 2, brush.id)
    assert.ok(brush.roundness >= 0.05 && brush.roundness <= 1, brush.id)
    assert.ok(brush.scatter >= 0 && brush.scatter <= 3, brush.id)
  }
})

test('every tool preset names a real tool and real settings', () => {
  for (const preset of BUILTIN_TOOL_PRESETS) {
    assert.ok(allToolIds.includes(preset.tool), `${preset.id} uses ${preset.tool}`)
    for (const key of Object.keys(preset.values)) assert.ok(key in defaultSettings, `${preset.id} sets ${key}, which is no setting`)
  }
})

test('every built-in style turns an effect on, using fields a layer has', () => {
  const known = defaultEffects()
  for (const style of BUILTIN_STYLES) {
    for (const key of Object.keys(style.effects)) assert.ok(key in known, `${style.id} sets ${key}`)
    assert.ok(Object.values(style.effects).includes(true), `${style.id} turns nothing on`)
  }
})

test('the app can apply a built-in preset, not only a saved one', () => {
  const app = read('src/App.tsx')
  assert.match(app, /\?\? BUILTIN_STYLES\.find\(/, 'a built-in style would do nothing')
  assert.match(app, /\?\? BUILTIN_TOOL_PRESETS\.find\(/, 'a built-in tool preset would do nothing')
})

/* ----------------------------------------------------------------- shapes */

test('every built-in shape actually draws as itself', () => {
  // Seven of the eleven used to come out as a plain rectangle.
  const app = read('src/App.tsx')
  assert.match(app, /\(BUILTIN_SHAPES as readonly string\[\]\)\.includes\(chosen\)/, 'the tool accepts only some of the shapes')
  assert.ok(BUILTIN_SHAPES.length >= 20)
  const pictures = new Map()
  const draw = (kind) => {
    const canvas = createCanvas(60, 60)
    const ctx = canvas.getContext('2d')
    ctx.beginPath()
    traceShape(ctx, { kind, x: 5, y: 5, width: 50, height: 50, radius: 0, sides: 5 })
    ctx.fillStyle = '#000'
    ctx.fill()
    return Buffer.from(pixelsOf(canvas)).toString('base64')
  }
  const rectangle = draw('rect')
  for (const kind of BUILTIN_SHAPES) {
    const picture = draw(kind)
    assert.notEqual(picture, rectangle, `${kind} draws a rectangle`)
    assert.ok(!pictures.has(picture), `${kind} draws the same as ${pictures.get(picture)}`)
    pictures.set(picture, kind)
    const key = `shape${kind.charAt(0).toUpperCase()}${kind.slice(1)}`
    assert.notEqual(t('ko', key), key, `${kind} has no Korean name`)
    assert.notEqual(t('en', key), key, `${kind} has no English name`)
  }
})

/* ------------------------------------------------------------ right panel */

test('the right panel folds away and comes back', () => {
  assert.equal(defaultSettings.rightCollapsed, false)
  const app = read('src/App.tsx')
  assert.match(app, /settings\.rightCollapsed \? ' panel-closed' : ''/)
  assert.match(app, /className="panel-collapse"/, 'there is no button')
  assert.match(app, /event\.key === 'Tab' && !typing/, 'Tab would steal the key from a text field')
  assert.ok(findCommand('window.togglePanel'), 'there is no menu row')
  const css = read('src/App.css')
  assert.match(css, /\.workspace\.panel-closed \{[^}]*grid-template-columns: 64px minmax\(0, 1fr\) 14px 0/)
  assert.match(css, /\.workspace\.panel-closed \.panel \{[^}]*display: none/)
})

test('each setting is on one line with an icon of its own', () => {
  const css = read('src/App.css')
  assert.match(css, /\.panel-body label:not\(\.check-row\) \{[^}]*grid-template-columns: 92px minmax\(0, 1fr\)/, 'the name and the control are not side by side')
  const panels = read('src/panels.tsx')
  assert.doesNotMatch(panels, /<label>\{tr\(/, 'a setting has lost its icon')
  assert.doesNotMatch(panels, /<h2>\{tr\(/, 'a panel heading has no icon')
  assert.ok(fieldIcon('size'))
  assert.ok(fieldIcon('nothing-like-this'), 'a new setting would have no icon')
})

test('the hand tool has the open hand, larger than its neighbours', () => {
  assert.match(read('src/catalog.ts'), /\{ id: 'hand', icon: Hand,/)
  assert.match(read('src/App.tsx'), /<Icon size=\{item\.id === 'hand' \? 20 : 15\} \/>/)
})

/* ----------------------------------------------------------- context menu */

test('every row of the right-click menus is a real command', () => {
  for (const rows of [canvasContextRows(true), canvasContextRows(false), layerContextRows()]) {
    for (const id of rows) if (id !== null) assert.ok(findCommand(id), `${id} is not in the catalog`)
    assert.ok(rows[0] === 'edit.undo' && rows[1] === 'edit.redo', 'Undo and Redo are not first')
    assert.ok(rows.filter(Boolean).length <= 24, `${rows.filter(Boolean).length} rows may not fit a small window`)
    assert.notEqual(rows[rows.length - 1], null, 'a menu ends on a separator')
    rows.forEach((id, index) => { if (id === null) assert.notEqual(rows[index + 1], null, 'two separators in a row') })
  }
})

test('the menu follows what was clicked', () => {
  assert.ok(canvasContextRows(true).includes('select.none'), 'nothing to clear a selection with')
  assert.ok(!canvasContextRows(false).includes('select.none'), 'Deselect with nothing selected')
  assert.ok(canvasContextRows(false).includes('select.all'))
  assert.ok(contextRows('layer', true).includes('layer.mergeDown'))
  assert.match(read('src/panels.tsx'), /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); ctx\.openLayerMenu\(layer\.id/, 'a layer row has no menu')
})

test('the menu stays inside the window', () => {
  const view = { width: 1000, height: 700 }
  assert.deepEqual(placeContextMenu(100, 100, 220, 400, view), { left: 100, top: 100 })
  assert.equal(placeContextMenu(950, 100, 220, 400, view).left, 730, 'it does not flip at the right edge')
  assert.equal(placeContextMenu(100, 650, 220, 400, view).top, 292, 'it runs off the bottom')
  assert.ok(placeContextMenu(5, 5, 220, 900, view).top >= 8)
})

test('the webview’s own menu is kept out of the app, but not out of text fields', () => {
  const bridge = read('src/host/tauriBridge.ts')
  assert.match(bridge, /addEventListener\('contextmenu'/)
  assert.match(bridge, /closest\?\.\('input, textarea, \[contenteditable\]'\)/, 'copy and paste would go from text fields')
})

/* -------------------------------------------------------- settings window */

test('the settings window keeps one size on every tab, with no scrollbar', () => {
  const dialogs = read('src/dialogs.tsx')
  assert.doesNotMatch(dialogs, /\{settingsTab === '\w+' && /, 'a page is added and removed, which resizes the window')
  assert.match(dialogs, /settings-page-cell\$\{settingsTab === 'general' \? ' on' : ''\}/)
  const css = read('src/App.css')
  assert.match(css, /\.settings-page-cell \{[^}]*grid-area: 1 \/ 1/, 'the pages do not share a cell, so the tallest does not set the height')
  assert.match(css, /\.settings-page-cell \{[^}]*visibility: hidden/, 'a hidden page must keep its space')
  assert.match(css, /\.settings-page-cell\.on \{[^}]*visibility: visible/)
})
