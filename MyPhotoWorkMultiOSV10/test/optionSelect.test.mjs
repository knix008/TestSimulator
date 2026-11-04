// The options bar's drop-downs must be readable in every theme, and Cancel crop must always do what it says.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { optionListPlace } from '../src/lib/optionList.ts'
import { customThemeDefinition, readableOn, themes } from '../src/themes.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const luminance = (hex) => {
  const channel = (at) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('the chosen row can be read and told from the list in every theme', () => {
  for (const theme of themes) {
    const { '--accent': accent, '--accent-text': text, '--menu-bg': background, '--text-primary': body } = theme.vars
    // The row is semi-bold, and for a mid-tone accent neither black nor white gets further than this.
    assert.ok(contrast(accent, text) >= 4, `${theme.id}: the chosen row's text has a contrast of ${contrast(accent, text).toFixed(1)}`)
    assert.ok(contrast(body, background) >= 4.5, `${theme.id}: a row's text has a contrast of ${contrast(body, background).toFixed(1)}`)
    assert.ok(contrast(accent, background) >= 1.8, `${theme.id}: the chosen row looks like the list behind it (${contrast(accent, background).toFixed(1)})`)
  }
})

test('a custom theme gets a readable colour on its accent too', () => {
  assert.equal(readableOn('#ffffff'), '#0b0f14')
  assert.equal(readableOn('#000000'), '#ffffff')
  const theme = customThemeDefinition({ id: 'custom-a', name: 'a', kind: 'dark', accent: '#101060', background: '#101010', panel: '#202020', text: '#eeeeee' })
  assert.equal(theme.vars['--accent-text'], '#ffffff')
})

test('the options bar uses the drawn drop-down, not a native list', () => {
  const app = read('src/App.tsx')
  const bar = app.slice(app.indexOf('<div className="options-bar">'), app.indexOf('<div className={`workspace'))
  assert.doesNotMatch(bar, /<select/, 'a native list has come back to the options bar')
  assert.match(bar, /<OptionSelect/)
  const css = read('src/App.css')
  assert.match(css, /\.option-list button\.chosen,\n\.option-list button\.chosen\.cursor \{[^}]*background: var\(--accent\);[^}]*color: var\(--accent-text\)/, 'the chosen row is not the accent')
  assert.match(css, /\.option-list \{[^}]*background: var\(--menu-bg\)/, 'the list has no solid background')
})

test('the remaining native lists have solid, themed rows', () => {
  const css = read('src/App.css')
  assert.match(css, /\.panel select option:checked,\n\.dialog select option:checked \{[^}]*color: var\(--accent-text\)/)
})

test('the list keeps to the window', () => {
  const view = { width: 1000, height: 700 }
  const button = { left: 100, top: 120, bottom: 150, width: 140 }
  assert.deepEqual(optionListPlace(button, 200, view), { left: 100, top: 153, width: 140, maxHeight: 539 })
  assert.equal(optionListPlace({ ...button, left: 950 }, 200, view).left, 852, 'it runs off the right edge')
  const low = optionListPlace({ left: 100, top: 640, bottom: 670, width: 140 }, 300, view)
  assert.equal(low.top, 337, 'it should open upwards')
  assert.equal(low.maxHeight, 300)
  const tall = optionListPlace(button, 2000, view)
  assert.equal(tall.maxHeight, 539, 'a long list scrolls rather than leaving the window')
})

test('Cancel crop takes back a box, a crop just applied or a straighten, and is off when there is none', () => {
  const app = read('src/App.tsx')
  const button = app.slice(app.indexOf('data-action="cancel-crop"'), app.indexOf('<X size={15} />', app.indexOf('data-action="cancel-crop"')))
  assert.match(button, /disabled=\{!crop && cropCorners\.length === 0 && cropDone !== historyMeta\.undo\.length\}/, 'it looks usable with nothing to cancel')
  assert.match(button, /undo\(\)/, 'a crop already applied cannot be taken back')
  assert.match(app, /setCropDone\(undoRef\.current\.length\)/, 'nothing records the crop')
  assert.match(app, /ctx\.fill\('evenodd'\)/, 'a crop box looks just like a selection')
})
