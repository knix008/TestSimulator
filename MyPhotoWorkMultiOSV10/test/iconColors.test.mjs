// Every icon is drawn in colour: toolbars, menus, context menus, dialogs, popups and the
// start screen cards. The colours come from src/iconColors.css, which
// scripts/build-icon-colors.mjs writes from the icons the sources import.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT, PALETTE, buildCss, colourFor, importedIcons } from '../scripts/build-icon-colors.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (name) => readFileSync(path.join(root, name), 'utf8')

test('src/iconColors.css is up to date with the icons the sources import', () => {
  assert.equal(read('src/iconColors.css'), buildCss().css, 'run npm run build:icon-colors')
  assert.equal(OUT, path.join(root, 'src', 'iconColors.css'))
})

test('every imported lucide icon has a colour rule', () => {
  const css = read('src/iconColors.css')
  const { icons } = buildCss()
  assert.ok(importedIcons().length > 300, 'the import scan found too few icons')
  assert.equal(icons.length >= 300, true)
  for (const kebab of icons) assert.match(css, new RegExp(`svg\\.lucide-${kebab}[,\\s]`), `${kebab} is still drawn in the text colour`)
})

test('the colours are on every window: main, menu popups and dialogs share main.tsx', () => {
  const main = read('src/main.tsx')
  assert.match(main, /import '\.\/iconColors\.css'/)
  assert.match(main, /MenuHost/)
  assert.match(main, /DialogHost/)
})

test('each colour has a light and a dark shade, and the dark theme switches to it', () => {
  const css = read('src/iconColors.css')
  for (const [colour, [light, dark]] of Object.entries(PALETTE)) {
    assert.match(light, /^#[0-9a-f]{6}$/)
    assert.match(dark, /^#[0-9a-f]{6}$/)
    assert.ok(css.includes(`--icon-${colour}: ${light};`))
    assert.ok(css.includes(`--icon-${colour}: ${dark};`))
  }
  assert.match(css, /:root\[data-theme="dark"\]/)
})

test('icons mean something by colour, and on an accent fill they follow the text', () => {
  assert.equal(colourFor('trash-2'), 'red')
  assert.equal(colourFor('x'), 'red')
  assert.equal(colourFor('folder-open'), 'amber')
  assert.equal(colourFor('save'), 'blue')
  assert.equal(colourFor('check'), 'green')
  assert.equal(colourFor('palette'), 'pink')
  assert.equal(colourFor('keyboard'), 'violet')
  assert.equal(colourFor('align-start-horizontal'), 'indigo')
  const css = read('src/iconColors.css')
  assert.ok(css.includes('.dialog-close:hover svg.lucide') && css.includes('.tutorial-x:hover svg.lucide'), 'a close X does not turn white on its red hover')
  for (const selector of ['.start-button.primary svg.lucide', '.bg-kind.on svg.lucide', '.option-list button.chosen svg.lucide']) {
    assert.ok(css.includes(selector), `${selector} would put a coloured icon on the accent`)
  }
})
