// Preference persistence and the theme table. loadSettings is the app's only
// defence against a corrupted or hand-edited localStorage entry.
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadSettings, saveSettings } from '../src/lib/settings.ts'
import { defaultSettings, rightPanelMaxWidth, rightPanelMinWidth } from '../src/lib/types.ts'
import { getTheme, isTheme, themeLabel, themes } from '../src/themes.ts'

const key = 'my-photo-work-v1-settings'

function stored(partial) {
  window.localStorage.setItem(key, JSON.stringify(partial))
  return loadSettings()
}

test('an empty store yields the shipped defaults', () => {
  window.localStorage.removeItem(key)
  assert.deepEqual(loadSettings(), defaultSettings)
})

test('settings survive a save/load round trip', () => {
  const custom = {
    ...defaultSettings, language: 'en', theme: 'ocean', zoom: 2, showGrid: true, showRulers: false,
    rightWidth: 400, exportFormat: 'webp', brushSize: 80, brushHardness: 0.25, brushOpacity: 0.6,
    fillTolerance: 64, foreground: '#112233', background: '#445566', gradientKind: 'radial',
    rightTab: 'history',
  }
  saveSettings(custom)
  assert.deepEqual(loadSettings(), custom)
})

test('unparseable JSON falls back to the defaults instead of throwing', () => {
  window.localStorage.setItem(key, '{not json')
  assert.deepEqual(loadSettings(), defaultSettings)
})

test('an unknown language or theme falls back', () => {
  assert.equal(stored({ language: 'fr' }).language, defaultSettings.language)
  assert.equal(stored({ language: 'en' }).language, 'en')
  assert.equal(stored({ theme: 'chartreuse' }).theme, defaultSettings.theme)
  assert.equal(stored({ theme: 'sakura' }).theme, 'sakura')
})

test('numeric settings are clamped to their usable ranges', () => {
  assert.equal(stored({ zoom: 1000 }).zoom, 8)
  assert.equal(stored({ zoom: 0 }).zoom, 0.05)
  assert.equal(stored({ rightWidth: 10 }).rightWidth, rightPanelMinWidth)
  assert.equal(stored({ rightWidth: 9999 }).rightWidth, rightPanelMaxWidth)
  assert.equal(stored({ brushSize: 0 }).brushSize, 1)
  assert.equal(stored({ brushSize: 10000 }).brushSize, 400)
  assert.equal(stored({ brushHardness: -1 }).brushHardness, 0)
  assert.equal(stored({ brushHardness: 5 }).brushHardness, 1)
  assert.equal(stored({ brushOpacity: 0 }).brushOpacity, 0.05)
  assert.equal(stored({ brushOpacity: 9 }).brushOpacity, 1)
  assert.equal(stored({ fillTolerance: -5 }).fillTolerance, 0)
  assert.equal(stored({ fillTolerance: 999 }).fillTolerance, 255)
})

test('a number field holding a string falls back rather than producing NaN', () => {
  const settings = stored({ zoom: 'huge', brushSize: null, rightWidth: [] })
  assert.equal(settings.zoom, defaultSettings.zoom)
  assert.equal(settings.brushSize, defaultSettings.brushSize)
  assert.equal(settings.rightWidth, defaultSettings.rightWidth)
})

test('boolean toggles only accept real booleans', () => {
  assert.equal(stored({ showGrid: 'yes' }).showGrid, defaultSettings.showGrid)
  assert.equal(stored({ showGrid: true }).showGrid, true)
  assert.equal(stored({ showRulers: 0 }).showRulers, defaultSettings.showRulers)
  assert.equal(stored({ showRulers: false }).showRulers, false)
})

test('the export format must be one the app can actually encode', () => {
  for (const format of ['png', 'jpg', 'webp', 'avif', 'gif', 'tiff']) {
    assert.equal(stored({ exportFormat: format }).exportFormat, format)
  }
  assert.equal(stored({ exportFormat: 'psd' }).exportFormat, defaultSettings.exportFormat)
})

test('the gradient kind and right-hand tab fall back to their base values', () => {
  for (const kind of ['linear', 'radial', 'angle', 'reflected', 'diamond']) {
    assert.equal(stored({ gradientKind: kind }).gradientKind, kind)
  }
  assert.equal(stored({ gradientKind: 'spiral' }).gradientKind, 'linear')

  for (const tab of ['layers', 'adjust', 'history', 'channels', 'info']) {
    assert.equal(stored({ rightTab: tab }).rightTab, tab)
  }
  assert.equal(stored({ rightTab: 'nope' }).rightTab, 'layers')
})

test('a partial stored object is filled in from the defaults', () => {
  const settings = stored({ zoom: 2 })
  assert.equal(settings.zoom, 2)
  assert.equal(settings.brushSize, defaultSettings.brushSize)
  assert.equal(settings.theme, defaultSettings.theme)
})

test('every theme id is unique and carries both language names', () => {
  const ids = themes.map((theme) => theme.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate theme id')
  for (const theme of themes) {
    assert.ok(theme.names.ko, `${theme.id} has no Korean name`)
    assert.ok(theme.names.en, `${theme.id} has no English name`)
    assert.ok(theme.kind === 'dark' || theme.kind === 'light', `${theme.id} has an odd kind`)
    assert.ok(/^#[0-9a-f]{6}$/i.test(theme.accent), `${theme.id} accent is not a hex colour`)
  }
})

test('the theme list offers both dark and light options', () => {
  assert.ok(themes.some((theme) => theme.kind === 'dark'))
  assert.ok(themes.some((theme) => theme.kind === 'light'))
})

test('every theme defines the same set of CSS variables', () => {
  const expected = Object.keys(themes[0].vars).sort()
  for (const theme of themes) {
    assert.deepEqual(Object.keys(theme.vars).sort(), expected, `${theme.id} has a different variable set`)
  }
})

test('isTheme and getTheme guard against unknown ids', () => {
  assert.equal(isTheme('dark'), true)
  assert.equal(isTheme('chartreuse'), false)
  assert.equal(isTheme(undefined), false)
  assert.equal(isTheme(7), false)
  assert.equal(getTheme('chartreuse'), themes[0], 'an unknown id falls back to the first theme')
  assert.equal(getTheme('ocean').id, 'ocean')
})

test('themeLabel returns the name in the requested language', () => {
  assert.equal(themeLabel('en', 'dark'), 'Dark')
  assert.equal(themeLabel('ko', 'dark'), '다크')
})

test('the shape, pen and magnetic tool settings are clamped on load', () => {
  assert.equal(stored({ shapeStroke: -5 }).shapeStroke, 0)
  assert.equal(stored({ shapeStroke: 999 }).shapeStroke, 100)
  assert.equal(stored({ shapeSides: 1 }).shapeSides, 3)
  assert.equal(stored({ shapeSides: 999 }).shapeSides, 32)
  assert.equal(stored({ shapeSides: 6.7 }).shapeSides, 7, 'side counts are whole numbers')
  assert.equal(stored({ shapeCorner: -1 }).shapeCorner, 0)
  assert.equal(stored({ pathWidth: 0 }).pathWidth, 1)
  assert.equal(stored({ pathWidth: 999 }).pathWidth, 100)
  assert.equal(stored({ magneticWidth: 0 }).magneticWidth, 1)
  assert.equal(stored({ magneticWidth: 999 }).magneticWidth, 64)
})

test('the shape fill and path visibility toggles only accept booleans', () => {
  assert.equal(stored({ shapeFilled: 'yes' }).shapeFilled, defaultSettings.shapeFilled)
  assert.equal(stored({ shapeFilled: false }).shapeFilled, false)
  assert.equal(stored({ showPaths: 1 }).showPaths, defaultSettings.showPaths)
  assert.equal(stored({ showPaths: false }).showPaths, false)
})
