// The command catalog that feeds both the menu bar and the icon toolbar, and
// the chrome that renders them. A command that has no handler, or a toolbar
// button whose menu entry disagrees with it, is caught here rather than by a
// user clicking a dead button.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  commandLabelKeys, commands, commandsInMenu, findCommand, menuIcons, menuOrder, toolbarGroups,
} from '../src/commands.ts'
import { adjustmentTypes } from '../src/catalog.ts'
import { extraFilters } from '../src/lib/moreFilters.ts'
import { t } from '../src/i18n.ts'

const appSource = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')

/** The single switch every menu and toolbar click funnels into. */
function runCommandBody() {
  const start = appSource.indexOf('const runCommand = (id: string)')
  const end = appSource.indexOf('const isCommandActive = ')
  assert.ok(start > 0 && end > start, 'runCommand was not found in App.tsx')
  return appSource.slice(start, end)
}

test('every command id is unique', () => {
  const ids = commands.map((command) => command.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate command id')
})

test('every command belongs to a menu that exists and has an icon', () => {
  for (const command of commands) {
    assert.ok(menuOrder.includes(command.menu), `${command.id} is in the unknown menu "${command.menu}"`)
    assert.ok(command.icon, `${command.id} has no icon`)
  }
  for (const menu of menuOrder) {
    assert.ok(menuIcons[menu], `the ${menu} menu has no icon`)
  }
})

test('no menu in the bar is empty', () => {
  for (const menu of menuOrder) {
    assert.ok(commandsInMenu(menu).length > 0, `the ${menu} menu has no commands`)
  }
})

test('every command label and menu name is translated in both languages', () => {
  for (const language of ['ko', 'en']) {
    for (const key of commandLabelKeys()) {
      assert.notEqual(t(language, key), key, `${language} has no label for "${key}"`)
    }
  }
})

test('Korean and English command labels are genuinely different', () => {
  // Proper nouns and initialisms are the same word in both languages.
  const shared = ['cameraRaw', 'levels', 'threeD', 'photomerge', 'hsbHsa', 'zoom200']
  const identical = commandLabelKeys()
    .filter((key) => !shared.includes(key))
    .filter((key) => t('ko', key) === t('en', key))
  assert.deepEqual(identical, [], 'some chrome labels were never translated')
})

test('the toolbar is a subset of the menu commands, grouped by the same categories', () => {
  const groups = toolbarGroups()
  assert.ok(groups.length > 1, 'the toolbar has no groups')

  const flat = groups.flatMap((group) => group.commands)
  for (const command of flat) {
    assert.equal(findCommand(command.id), command, `${command.id} is not in the catalog`)
    assert.equal(command.toolbar, true)
  }
  // Every flagged command appears exactly once, under its own menu.
  assert.equal(flat.length, commands.filter((command) => command.toolbar).length)
  for (const group of groups) {
    for (const command of group.commands) {
      assert.equal(command.menu, group.menu, `${command.id} is grouped under ${group.menu}`)
    }
  }
})

test('the toolbar groups follow the menu bar order', () => {
  const order = toolbarGroups().map((group) => group.menu)
  assert.deepEqual(order, menuOrder.filter((menu) => order.includes(menu)))
})

test('the toolbar covers the categories a user reaches for constantly', () => {
  const menus = toolbarGroups().map((group) => group.menu)
  for (const menu of ['file', 'edit', 'image', 'layer', 'selectMenu', 'filter', 'view']) {
    assert.ok(menus.includes(menu), `nothing from the ${menu} menu reached the toolbar`)
  }
})

test('every command is handled by runCommand', () => {
  const body = runCommandBody()
  const unhandled = commands
    // Adjustment layers and the moreFilters.ts filters are dispatched by prefix rather than one case each.
    .filter((command) => !command.id.startsWith('adjLayer.'))
    .filter((command) => !(command.id.startsWith('filter.') && extraFilters[command.id.slice('filter.'.length)]))
    .filter((command) => !body.includes(`case '${command.id}':`))
  assert.deepEqual(unhandled, [], `these commands have no handler: ${unhandled.map((c) => c.id).join(', ')}`)
})

test('runCommand has no handler for a command that no longer exists', () => {
  const cases = [...runCommandBody().matchAll(/case '([\w.]+)':/g)].map((match) => match[1])
  const stale = cases.filter((id) => !findCommand(id))
  assert.deepEqual(stale, [], 'runCommand handles ids that are not in the catalog')
})

test('the adjustment-layer commands cover every adjustment type', () => {
  const ids = commands.filter((command) => command.id.startsWith('adjLayer.')).map((command) => command.id)
  assert.deepEqual(ids.sort(), adjustmentTypes.map((type) => `adjLayer.${type}`).sort())
  assert.ok(runCommandBody().includes("id.startsWith('adjLayer.')"), 'adjustment layers are not dispatched')
  assert.ok(runCommandBody().includes("id.startsWith('filter.')"), 'the extra filters are not dispatched')
})

test('accelerator hints only appear on commands, and the menu renders them', () => {
  const withAccel = commands.filter((command) => command.accel)
  assert.ok(withAccel.length > 5, 'no command advertises a shortcut')
  for (const command of withAccel) {
    assert.match(command.accel, /^[\w+\-. \[\]';]+$/, `${command.id} has an odd accelerator "${command.accel}"`)
  }
  const tree = readFileSync(fileURLToPath(new URL('../src/MenuTree.tsx', import.meta.url)), 'utf8')
  assert.ok(tree.includes('{command.accel && <kbd>{command.accel}</kbd>}'), 'the menu never renders the accelerator')
})

test('the shell is split into a title bar, a menu bar and a tool bar', () => {
  for (const row of ['title-bar', 'menu-bar', 'tool-bar', 'options-bar']) {
    assert.ok(appSource.includes(`className="${row}"`), `the ${row} row is missing`)
  }
  // …in that order.
  const order = ['title-bar', 'menu-bar', 'tool-bar', 'options-bar']
    .map((row) => appSource.indexOf(`className="${row}"`))
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'the chrome rows are out of order')
})

test('the window controls live in the title bar', () => {
  const titleBar = appSource.slice(appSource.indexOf('className="title-bar"'), appSource.indexOf('className="menu-bar"'))
  assert.ok(titleBar.includes('window-controls'), 'the window buttons are not in the title bar')
  for (const action of ['minimize', 'toggleMaximize', 'close']) {
    assert.ok(titleBar.includes(action), `the title bar has no ${action} button`)
  }
})

test('the menu bar builds its rows from the catalog, not from hand-written JSX', () => {
  const menuBar = appSource.slice(appSource.indexOf('className="menu-bar"'), appSource.indexOf('className="tool-bar"'))
  assert.ok(menuBar.includes('menuOrder.map'), 'the menu bar does not iterate the catalog')
  assert.ok(menuBar.includes('<MenuTree') && menuBar.includes('rows={commandsInMenu(id)}'), 'the dropdowns do not iterate the catalog')
})

test('the toolbar builds its groups from the catalog', () => {
  const toolBar = appSource.slice(appSource.indexOf('className="tool-bar"'), appSource.indexOf('className="options-bar"'))
  assert.ok(toolBar.includes('toolbarGroups().map'), 'the toolbar does not iterate the catalog')
  assert.ok(toolBar.includes('tool-bar-divider'), 'the toolbar groups are not separated')
})

test('Settings and About are the only buttons in the menu bar cluster', () => {
  const menuBar = appSource.slice(appSource.indexOf('className="menu-bar"'), appSource.indexOf('className="tool-bar"'))
  // The right-hand cluster, read left to right by each button's tooltip key.
  const cluster = [...menuBar.matchAll(/data-tooltip=\{tr\('(\w+)'\)\}/g)].map((match) => match[1])
  assert.deepEqual(cluster.slice(-2), ['settings', 'about'],
    `expected the trailing buttons to read settings, about — got ${cluster.join(', ')}`)
  assert.ok(!cluster.includes('help'), 'the Help button was asked for and removed; it is back')
})

test('the guide is on the Window menu, not a button of its own', () => {
  assert.ok(!menuOrder.includes('help'), 'help should not be one of the dropdown menus')
  const guide = commands.find((command) => command.id === 'window.guide')
  assert.ok(guide, 'nothing opens the guide any more')
  assert.equal(guide.menu, 'windowMenu', 'the guide should be reachable from the Window menu')
  assert.equal(guide.label, 'help', 'the guide row should read as Help')
  assert.ok(appSource.includes("openDialog('helpGuide')"), 'the guide command does not open the guide')
})
