// UI rules the user set on 2026-11-23: one slider shape everywhere, one close button,
// the theme menu's action buttons, the Home button, the panel fold button's place and
// icons, and a Settings window that fits its pages without scrolling or resizing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DIALOG_SPECS } from '../src/dialogSpecs.ts'
import { t } from '../src/i18n.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (name) => readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n')
const sources = () => {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (rel.endsWith('.tsx')) out.push(rel)
    }
  }
  walk('src')
  return out
}
/** The CSS block of the first rule whose selector list contains `selector`. */
const block = (css, selector) => {
  const at = css.indexOf(selector)
  assert.ok(at >= 0, `no rule for ${selector}`)
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
}

/* ---------------------------------------------------------------- sliders */

test('every slider is the track, then decrease, the value with its unit, increase', () => {
  const controls = read('src/controls.tsx')
  const body = controls.slice(controls.indexOf('export function Slider('), controls.indexOf('function SliderTrack('))
  const order = ['<SliderTrack', 'slider-step-box', 'onClick={() => nudge(-1)}', '<output className="slider-value">', 'onClick={() => nudge(1)}']
  let last = -1
  for (const part of order) {
    const at = body.indexOf(part)
    assert.ok(at > last, `${part} is missing or out of order`)
    last = at
  }
  assert.match(body, /<Minus size=/)
  assert.match(body, /<Plus size=/)
  assert.match(body, /disabled=\{disabled \|\| value <= min\}/, 'decrease is not disabled at the minimum')
  assert.match(body, /disabled=\{disabled \|\| value >= max\}/, 'increase is not disabled at the maximum')
})

test('the value sits centred in its box, and the whole slider stays on one line', () => {
  const css = read('src/App.css')
  assert.match(block(css, '\n.slider-value {'), /text-align: center/)
  assert.match(block(css, '\n.slider-value {'), /white-space: nowrap/)
  assert.match(block(css, '\n.slider-stepper {'), /display: flex/)
  // In a dialog and in the right panel the name and the slider share one row.
  assert.match(block(css, '.dialog label:has(> .slider-stepper) {'), /grid-template-columns: minmax\(64px, max-content\) minmax\(0, 1fr\)/)
  assert.match(block(css, '.panel-body label:not(.check-row) {'), /grid-template-columns: 92px minmax\(0, 1fr\)/)
})

test('no slider keeps a value label of its own beside it, so no value shows twice', () => {
  for (const file of sources()) {
    const text = read(file)
    const loose = /<(?:Range)?Slider\b(?:[^>]|=>)*?\/>\s*<span(?: className="[^"]*")?>\{/g
    assert.equal(text.match(loose), null, `${file} has a slider followed by its own value label`)
  }
})

test('the start screen and Settings use the same slider', () => {
  const start = read('src/start/StartScreen.tsx')
  const stepper = start.slice(start.indexOf('export function RangeStepper('), start.indexOf('export function BackgroundKinds('))
  assert.match(stepper, /<Slider /)
  assert.doesNotMatch(stepper, /type="range"/)
})

/* ---------------------------------------------------------- close buttons */

test('every close button looks the same: the window X, each dialog X and the tutorial X', () => {
  const css = read('src/App.css')
  const shared = css.slice(css.indexOf('/* ------------------------------------------------ one look for every close button'))
  for (const selector of ['.dialog-close', '.window-controls .window-close', '.tutorial-x']) {
    assert.ok(shared.includes(`${selector},`) || shared.includes(`${selector} {`), `${selector} is not in the shared close-button rule`)
    assert.ok(shared.includes(`${selector}:hover`), `${selector} has no shared hover`)
  }
  assert.match(shared, /background: #e11d48/)
  // A later stylesheet must not restyle one of them on its own.
  assert.doesNotMatch(read('src/start/start.css'), /^\.tutorial-x \{/m)
  const colors = read('src/iconColors.css')
  assert.match(colors, /svg\.lucide-x[,\s]/)
  assert.ok(colors.includes('.dialog-close:hover svg.lucide'))
})

test('the closing buttons at the bottom of a window all carry the X', () => {
  for (const file of ['src/dialogs.tsx', 'src/dialogsExtra.tsx']) {
    const text = read(file)
    for (const match of text.matchAll(/<button className="primary" onClick=\{onClose\}>\s*<(\w+) size=\{14\}[^>]*\/>\s*<span>\{tr\('close'\)\}/g)) {
      assert.equal(match[1], 'X', `${file}: a Close button shows ${match[1]} instead of X`)
    }
  }
})

/* ------------------------------------------------------------ the menu bar */

test('the first menu-bar button is called Home', () => {
  assert.equal(t('ko', 'homeButton'), '홈')
  assert.equal(t('en', 'homeButton'), 'Home')
  const app = read('src/App.tsx')
  const button = app.slice(app.indexOf('className={`start-toggle'), app.indexOf('</button>', app.indexOf('className={`start-toggle')))
  assert.match(button, /<House size=\{15\} \/><span>\{tr\('homeButton'\)\}<\/span>/)
})

test('the theme menu lists Custom Themes and Theme Settings flush left', () => {
  const css = read('src/App.css')
  assert.match(block(css, '.theme-menu-actions button {'), /justify-content: flex-start/)
})

test('the right panel fold button uses panel icons and sits left of the theme button', () => {
  const app = read('src/App.tsx')
  const bar = app.indexOf('data-action="toggle-panel-bar"')
  assert.ok(bar > 0 && bar < app.indexOf('className="menu-group theme-menu-group"'))
  assert.doesNotMatch(app, /<ChevronLeft size=\{15\} \/> : <ChevronRight size=\{15\} \/>/, 'the panel still folds with chevrons')
})

/* --------------------------------------------------------- settings window */

test('Settings opens short and grows to its tallest page; it does not resize or scroll', () => {
  const spec = DIALOG_SPECS.settings
  assert.equal(spec.resizable, false)
  assert.ok(spec.height <= 400, 'the opening height is a floor: a tall one leaves empty space under short pages')
  assert.ok(spec.width >= 900, 'the tabs need the width to stay on one row')
  const css = read('src/App.css')
  assert.match(block(css, '.settings-page {'), /overflow: hidden/)
  assert.match(block(css, '.settings-dialog {'), /width: 900px/)
  assert.match(block(css, '.settings-themes {'), /repeat\(5, minmax\(0, 1fr\)\)/)
})

test('every Settings tab is a menu-bar style button with an icon', () => {
  const dialogs = read('src/dialogs.tsx')
  const tabs = JSON.parse(/const tabs = (\[[^\]]*\]) as const/.exec(dialogs)[1].replace(/'/g, '"'))
  const icons = dialogs.slice(dialogs.indexOf('export const SETTINGS_TAB_ICONS'), dialogs.indexOf('}', dialogs.indexOf('export const SETTINGS_TAB_ICONS')))
  for (const tab of tabs) assert.match(icons, new RegExp(`\\b${tab}: [A-Z]\\w+`), `the ${tab} tab has no icon`)
  assert.match(dialogs, /<TabIcon size=\{14\}/)
  const css = read('src/App.css')
  // No more underline tabs: they keep the bordered button look of the main window.
  assert.doesNotMatch(block(css, '.settings-tabs button {'), /border: none/)
  assert.match(block(css, '.settings-tabs button.active {'), /border-color: var\(--accent\)/)
})

test('the start screen background controls and Random are on one line on the card', () => {
  const css = read('src/start/start.css')
  assert.match(css, /\.start-side \.bg-controls \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) auto/)
  const start = read('src/start/StartScreen.tsx')
  const controls = start.slice(start.indexOf('export function BackgroundControls('), start.indexOf('function SampleThumb'))
  assert.equal(controls.match(/className="bg-control"/g)?.length, 3)
  assert.ok(controls.indexOf('start-check') > controls.lastIndexOf('className="bg-control"'), 'Random is not in the same row')
})

test('automatic background change has its own on/off switch, and the interval is kept while off', async () => {
  const { DEFAULT_START_BACKGROUND, normalizeStartBackground } = await import('../src/lib/startSettings.ts')
  assert.equal(DEFAULT_START_BACKGROUND.shuffleOn, false)
  assert.ok(DEFAULT_START_BACKGROUND.shuffleSec > 0, 'turning it on would change nothing')
  assert.equal(normalizeStartBackground({ shuffleSec: 30 }).shuffleOn, true, 'older settings with an interval lose their automatic change')
  assert.equal(normalizeStartBackground({ shuffleSec: 0 }).shuffleOn, false)
  assert.deepEqual([normalizeStartBackground({ shuffleOn: false, shuffleSec: 45 }).shuffleOn, normalizeStartBackground({ shuffleOn: false, shuffleSec: 45 }).shuffleSec], [false, 45])
  const start = read('src/start/StartScreen.tsx')
  assert.match(start, /data-action="bg-auto" checked=\{background\.shuffleOn\}/)
  assert.match(start, /disabled=\{!background\.shuffleOn\}/, 'the interval can be changed while the switch is off')
  assert.match(start, /if \(!background\.shuffleOn \|\| !background\.shuffleSec\) return undefined/, 'the timer ignores the switch')
})

test('Settings > Brush lays its sliders out two to a row', () => {
  const dialogs = read('src/dialogs.tsx')
  assert.match(dialogs, /<section className="settings-section settings-brush-grid">\n\s*<h3>\{tr\('settingsSectionBrushDefaults'\)\}<\/h3>/)
  const css = read('src/App.css')
  assert.match(block(css, '.settings-dialog .settings-brush-grid {'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(block(css, '.settings-dialog .settings-brush-grid > h3 {'), /grid-column: 1 \/ -1/)
})
