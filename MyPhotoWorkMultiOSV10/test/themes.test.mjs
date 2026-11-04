// Twenty dark themes, twenty light ones and the ones the user makes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { customThemeDefinition, customThemes, darkThemes, draftFrom, getTheme, isTheme, lightThemes, normalizeCustomThemes, registerCustomThemes, saveCustomTheme, themeLabel, themes } from '../src/themes.ts'
import { loadSettings } from '../src/lib/settings.ts'
import { t } from '../src/i18n.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const mine = { id: 'custom-a', name: '내 테마', kind: 'light', accent: '#112233', background: '#f0f0f0', panel: '#ffffff', text: '#101010' }

test('there are exactly twenty dark and twenty light themes', () => {
  assert.equal(darkThemes.length, 20)
  assert.equal(lightThemes.length, 20)
  assert.equal(themes.length, 40)
  assert.equal(new Set(themes.map((theme) => theme.id)).size, 40, 'two themes share an id')
  assert.equal(new Set(themes.map((theme) => theme.names.ko)).size, 40, 'two themes share a name')
})

test('a dark theme is dark and a light theme is light', () => {
  for (const theme of darkThemes) assert.ok(luminance(theme.appA) < 0.3, `${theme.id} is too bright to be dark`)
  for (const theme of lightThemes) assert.ok(luminance(theme.appA) > 0.6, `${theme.id} is too dim to be light`)
})

test('the text of every theme can be read on its background', () => {
  for (const theme of themes) {
    const [a, b] = [luminance(theme.vars['--text-primary']), luminance(theme.appA)]
    const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    assert.ok(contrast >= 4.5, `${theme.id} has a contrast of only ${contrast.toFixed(1)}`)
  }
})

test('a custom theme carries every token a built-in one does', () => {
  const built = customThemeDefinition(mine)
  assert.deepEqual(Object.keys(built.vars).sort(), Object.keys(themes[0].vars).sort())
  assert.equal(built.kind, 'light')
  assert.equal(built.names.ko, '내 테마')
  assert.equal(built.vars['--accent'], '#112233')
})

test('custom themes are found by id from any window, through shared storage', () => {
  registerCustomThemes([mine])
  assert.equal(customThemes().length, 1)
  assert.equal(getTheme('custom-a').names.en, '내 테마')
  assert.equal(themeLabel('ko', 'custom-a'), '내 테마')
  assert.equal(isTheme('custom-a'), true)
  registerCustomThemes([])
  assert.equal(getTheme('custom-a'), themes[0], 'a deleted theme should fall back')
})

test('stored custom themes are checked', () => {
  assert.deepEqual(normalizeCustomThemes('no'), [])
  assert.deepEqual(normalizeCustomThemes([null, { id: 'dark', name: 'x' }, { ...mine, accent: 'red' }, { ...mine, id: 7 }]), [])
  assert.equal(normalizeCustomThemes([{ ...mine, kind: 'odd' }])[0].kind, 'dark')
  localStorage.setItem('my-photo-work-v1-settings', JSON.stringify({ theme: 'custom-a', customThemes: [mine, { bad: 1 }] }))
  const loaded = loadSettings()
  assert.equal(loaded.customThemes.length, 1)
  assert.equal(loaded.theme, 'custom-a')
  localStorage.removeItem('my-photo-work-v1-settings')
})

test('saving adds a new theme, and saving again replaces it', () => {
  const first = saveCustomTheme([], { ...mine, id: '' }, () => 'x1')
  assert.equal(first.theme.id, 'custom-x1')
  assert.equal(first.list.length, 1)
  const second = saveCustomTheme(first.list, { ...first.theme, accent: '#445566' }, () => 'unused')
  assert.equal(second.list.length, 1)
  assert.equal(second.list[0].accent, '#445566')
  assert.equal(saveCustomTheme([], { ...mine, id: '', name: '   ' }, () => 'x').theme.name, 'Custom')
})

test('a new theme starts from the look on screen, in plain hex colours', () => {
  for (const theme of themes) {
    const draft = draftFrom(theme.id, 'n')
    assert.equal(draft.kind, theme.kind)
    for (const key of ['accent', 'background', 'panel', 'text']) assert.match(draft[key], /^#[0-9a-f]{6}$/i, `${theme.id}: ${key} cannot go in a colour input`)
  }
})

test('the drop-down opens with the two buttons, then Dark above Light, in two columns', () => {
  const app = read('src/App.tsx')
  const menu = app.slice(app.indexOf('<MenuDrop className="theme-menu"'), app.indexOf('</MenuDrop>', app.indexOf('<MenuDrop className="theme-menu"')))
  assert.ok(menu.indexOf('theme-menu-actions') < menu.indexOf('theme-menu-section'), 'the buttons are not at the top')
  assert.match(menu, /settingsTab: 'customTheme'/, 'no way to the custom themes')
  assert.match(menu, /settingsTab: 'theme'/, 'no way to the theme settings')
  assert.ok(menu.indexOf("'themeDark'") < menu.indexOf("'themeLight'"), 'Light comes before Dark')
  const css = read('src/App.css')
  assert.match(css, /\.theme-menu-list \{[^}]*grid-auto-flow: column/, 'the list does not read down its columns')
  assert.match(menu, /repeat\(\$\{Math\.ceil\(list\.length \/ 2\)\}, auto\)/, 'the list is not in two columns')
})

test('Settings has both the theme page and the custom theme page', () => {
  const dialogs = read('src/dialogs.tsx')
  assert.match(dialogs, /'theme', 'customTheme'/, 'no custom theme tab')
  assert.match(dialogs, /<CustomThemeEditor /, 'the editor is not on the page')
  assert.match(dialogs, /\['themeDark', darkThemes\], \['themeLight', lightThemes\]/, 'the theme page is not grouped')
  assert.match(dialogs, /payload\?\.settingsTab \?\? 'general'/, 'the window cannot open on a chosen page')
  for (const key of ['customThemes', 'themeSettings', 'settingsTabCustomTheme', 'customSave', 'customDelete']) {
    assert.notEqual(t('ko', key), key)
    assert.notEqual(t('en', key), key)
  }
})
