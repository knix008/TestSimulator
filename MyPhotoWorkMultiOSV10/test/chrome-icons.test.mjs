/*
 * Icons on the buttons, and labels that fit the buttons they are on.
 *
 * The right-hand panel's twenty-five tabs were bare text three to a row, so
 * "Adjustments", "Clone Source" and "Measurement Log" all came back as an
 * ellipsis; the Shapes panel put text tiles in a grid sized for colour chips
 * and ran their names together; and "Clear log" sat hard against the edge of
 * the panel because the button beside it had grown its column past half the
 * row. These hold all three closed.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { panelIcon, panelLabelKey, panelShortKey } from '../src/panelMeta.ts'
import { panelTabs } from '../src/lib/types.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')
/** Both halves of the dictionary: a key lives in whichever file had room. */
const dictionary = () => `${read('src', 'i18n.ts')}\n${read('src', 'i18nExtra.ts')}`

/** How many times `key` is defined as an object key in `source`. */
const defined = (source, key) => (source.match(new RegExp(`\\b${key}: `, 'g')) ?? []).length

test('every panel tab has an icon, a short name and the full name in both languages', () => {
  const i18n = dictionary()
  for (const tab of panelTabs) {
    assert.ok(panelIcon(tab), `${tab} has no icon`)
    assert.equal(defined(i18n, panelShortKey(tab)), 2, `${panelShortKey(tab)} is not written in both languages`)
    assert.equal(defined(i18n, panelLabelKey(tab)), 2, `${panelLabelKey(tab)} is not written in both languages`)
  }
})

test('the panel tabs draw their icon and keep the full name for the tooltip', () => {
  const app = read('src', 'App.tsx')
  const block = app.slice(app.indexOf('{panelTabs.map((tab) => ('), app.indexOf('<div className="panel-body">'))
  assert.ok(block.includes('<PanelTabIcon tab={tab} />'), 'the tabs lost their icons')
  assert.ok(block.includes('data-tooltip={tr(panelLabelKey(tab))}'), 'the tooltip no longer gives the full name')
  assert.ok(block.includes('{tr(panelShortKey(tab))}'), 'the button is not using the short name')
})

test('every built-in shape has an icon, a name in both languages and an outline to draw', () => {
  const panels = read('src', 'panels.tsx')
  const list = panels.match(/const builtIn = \[([^\]]*)\]/)
  assert.ok(list, 'the built-in shape list is gone')
  const kinds = [...list[1].matchAll(/'(\w+)'/g)].map((item) => item[1])
  assert.ok(kinds.length >= 10, `only ${kinds.length} built-in shapes`)

  const glyphs = panels.slice(panels.indexOf('const shapeGlyphs'), panels.indexOf('const ShapeGlyph'))
  const i18n = dictionary()
  const effects = read('src', 'lib', 'effects.ts')
  for (const kind of kinds) {
    assert.ok(glyphs.includes(`${kind}:`), `${kind} has no icon`)
    const key = `shape${kind[0].toUpperCase()}${kind.slice(1)}`
    assert.equal(defined(i18n, key), 2, `${key} is not named in both languages`)
    assert.ok(effects.includes(`shape.kind === '${kind}'`), `${kind} is offered but never drawn`)
  }
  assert.ok(panels.includes('<ShapeGlyph kind={kind} />'), 'the shape tiles lost their icons')
})

test('the buttons that appear on every window carry an icon', () => {
  for (const file of ['dialogs.tsx', 'dialogsExtra.tsx']) {
    const source = read('src', file)
    for (const key of ['cancel', 'apply', 'ok', 'close', 'reset']) {
      const bare = source.split(`>{tr('${key}')}</button>`).length - 1
      assert.equal(bare, 0, `${file} still has ${bare} bare ${key} button(s)`)
    }
  }
})

test('the settings window has no scrollbar, and every page is named in both languages', () => {
  const css = read('src', 'App.css')
  /*
   * This window is a set size and each page is laid out to fit it. A page that
   * outgrows the window is a page to split — a setting below the fold is a
   * setting nobody finds — so the page itself must not scroll. The Engine page
   * ran 176px past the window until its selection half became a page of its
   * own; the measurement that found that is `scratchpad/measure-settings.mjs`.
   */
  const page = css.slice(css.indexOf('.settings-page {'), css.indexOf('.settings-section {'))
  assert.equal(page.includes('overflow-y: auto'), false, 'the settings page can scroll again')
  assert.ok(page.includes('overflow: hidden'), 'the settings page no longer clips')

  const dialogs = read('src', 'dialogs.tsx')
  const list = dialogs.match(/const tabs = \[([^\]]*)\] as const/)
  assert.ok(list, 'the settings tab list is gone')
  const tabs = [...list[1].matchAll(/'(\w+)'/g)].map((item) => item[1])
  /*
   * Nine pages, because with `overflow: hidden` a page that outgrows the
   * window is silently cut off rather than scrolled. Measuring it needs the
   * last child's bottom against the page's bottom — `scrollHeight` is clamped
   * to `clientHeight` once the overflow is hidden, so it reports that
   * everything fits whether it does or not. `scratchpad/measure2.mjs` does it
   * properly; at the time of writing the widest page needed 510 of 531px.
   */
  assert.ok(tabs.length >= 9, `only ${tabs.length} settings pages — did two grow back into one?`)
  const i18n = dictionary()
  for (const tab of tabs) {
    const key = `settingsTab${tab[0].toUpperCase()}${tab.slice(1)}`
    assert.equal(defined(i18n, key), 2, `${key} is not named in both languages`)
    assert.ok(dialogs.includes(`settingsTab === '${tab}'`), `the ${tab} page has no content`)
  }
})

test('a two-column row cannot push its second button off the edge', () => {
  const css = read('src', 'App.css')
  /*
   * `1fr` is `minmax(auto, 1fr)`: a long label grows its own column past its
   * share and shoves its neighbour out of the panel. That is what put "Clear
   * log" against the edge with no margin at all.
   */
  assert.equal(css.includes('grid-template-columns: 1fr 1fr;'), false, 'a two-column grid can still overflow')
  assert.ok(/\.layer-actions \{[^}]*minmax\(0, 1fr\)/s.test(css), 'the panel action rows can still overflow')
  assert.ok(/\.layer-actions button:only-child \{\s*grid-column: 1 \/ -1;/.test(css), 'a lone button no longer takes the whole row')
  assert.ok(css.includes('.shape-grid {'), 'the shape tiles are back in the swatch grid')
  assert.ok(/\.dialog-actions \{[^}]*flex-wrap: wrap/s.test(css), 'a full row of dialog buttons can overflow again')
})
