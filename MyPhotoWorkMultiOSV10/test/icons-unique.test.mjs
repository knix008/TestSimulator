/*
 * No two rows of the menus wear the same icon. Anywhere.
 *
 * This started as a within-one-dropdown rule, on the reasoning that a bin
 * means delete wherever it appears and it would be perverse to draw it
 * differently in the Layer menu than in the View menu. That reasoning turned
 * out to describe almost none of the sharing that was actually there: 88 icons
 * were worn by 265 of the 410 commands, and one sparkle stood for
 * Content-Aware Fill, Auto Tone, Layer Style, Anti-Alias, Select Similar,
 * Neural Filters, 3D Effects and the Styles panel at once. An icon that means
 * eight things means none of them.
 *
 * So every command now has one of its own, picked to say what its label says.
 * The same holds for the 66 tools in the strip and for the 117 filters.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { commands, menuOrder } from '../src/commands.ts'
import { iconForTool, toolGroups } from '../src/catalog.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

test('no two commands in the same menu share an icon', () => {
  const clashes = []
  for (const menu of menuOrder) {
    const seen = new Map()
    for (const command of commands.filter((item) => item.menu === menu)) {
      const twin = seen.get(command.icon)
      if (twin) clashes.push(`${menu}: ${twin.label} and ${command.label} look the same`)
      else seen.set(command.icon, command)
    }
  }
  assert.deepEqual(clashes, [], clashes.join('\n'))
})

test('no two commands anywhere in the menus share an icon', () => {
  /*
   * This used to be a within-a-menu rule, on the reasoning that a bin means
   * delete wherever it appears. In practice the sharing was not that: 88 icons
   * were worn by 265 commands, eight of them by eight commands each — one
   * sparkle stood for Content-Aware Fill, Auto Tone, Layer Style, Anti-Alias,
   * Select Similar, Neural Filters, 3D Effects and the Styles panel at once,
   * which tells the reader nothing about any of them. Every command now has an
   * icon of its own, chosen to say what its label says.
   */
  const seen = new Map()
  const clashes = []
  for (const command of commands) {
    const twin = seen.get(command.icon)
    if (twin) clashes.push(`${twin.menu}/${twin.label} and ${command.menu}/${command.label} look the same`)
    else seen.set(command.icon, command)
  }
  assert.deepEqual(clashes, [], clashes.join('\n'))
  assert.equal(seen.size, commands.length, 'a command is missing an icon of its own')
})

test('the icons are distinct components, not two names for one drawing', () => {
  /*
   * lucide ships aliases — Trash is Trash2, Magnet is MagnetIcon, Wand2 is
   * WandSparkles — so two rows can name different icons and draw the same
   * thing. Comparing the components rather than the names is what catches it,
   * and it caught several of these while they were being assigned.
   */
  const components = new Set(commands.map((command) => command.icon))
  assert.equal(components.size, commands.length, 'two commands share a component under different names')
})

test('every command still has an icon, and they are drawable', () => {
  for (const command of commands) {
    const icon = command.icon
    // Lucide's icons come through forwardRef, so they are objects, not functions.
    assert.ok(icon && (typeof icon === 'function' || typeof icon === 'object'), `${command.id} has no icon`)
  }
})

test('the catalog draws on a wide enough vocabulary to be worth reading', () => {
  const distinct = new Set(commands.map((command) => command.icon))
  assert.equal(distinct.size, commands.length, `only ${distinct.size} different icons across ${commands.length} commands`)
})

test('no two tools in the strip share an icon', () => {
  /*
   * Sixty-six tools were drawn with thirty-two icons: Spot Healing, Healing
   * and Object Selection all wore the same sparkle, and the four erasers were
   * indistinguishable. An icon that appears three times in one strip is not
   * telling anyone which tool they are about to pick.
   */
  const seen = new Map()
  const clashes = []
  for (const group of toolGroups) {
    for (const tool of group.tools) {
      const twin = seen.get(tool.icon)
      if (twin) clashes.push(`${tool.id} and ${twin} look the same`)
      else seen.set(tool.icon, tool.id)
    }
  }
  assert.deepEqual(clashes, [], clashes.join('\n'))
  const tools = toolGroups.flatMap((group) => group.tools)
  assert.equal(seen.size, tools.length, 'a tool is missing an icon of its own')
})

test('every tool has a drawable icon', () => {
  for (const group of toolGroups) {
    for (const tool of group.tools) {
      const icon = tool.icon
      assert.ok(icon && (typeof icon === 'function' || typeof icon === 'object'), `${tool.id} has no icon`)
      assert.equal(iconForTool(tool.id), icon, `${tool.id} is not reachable through iconForTool`)
    }
  }
})

test('no button in the chrome writes its own icon instead of taking the catalog\'s', () => {
  /*
   * Four task buttons on the toolbar had their icons written out beside them,
   * so they did not follow the catalog: Select Subject still wore the Spot
   * Healing tool's sparkle after the catalog had been changed, and the change
   * looked as though it had not taken. One source per command, or they drift.
   */
  const app = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')
  const tasks = app.slice(app.indexOf('tool-bar-group tool-bar-tasks'), app.indexOf('tool-bar-group tool-bar-colors'))
  const written = [...tasks.matchAll(/<([A-Z]\w+) size=\{\d+\} \/>/g)].map((match) => match[1])
  assert.deepEqual(written, [], `these icons are written out rather than looked up: ${written.join(', ')}`)
  assert.ok(tasks.includes('<CommandIcon id={id} />'), 'the task buttons no longer look their icons up')
})

test('a toolbar button and a tool beside it do not look the same, unless they are the same thing', () => {
  /*
   * The icon toolbar runs across the top and the tool strip down the left, both
   * on screen at once, so a repeat between them reads as one thing in two
   * places. Select Subject wore the sparkle of the Spot Healing tool, which is
   * what prompted this.
   *
   * Four pairs are meant to match: the command and the tool are the same
   * action, and drawing them differently would be the confusing choice.
   */
  const sameThing = new Set(['image.rotateCW', 'type.horizontal', 'view.zoomIn', 'view.rulers'])
  const tools = new Map()
  for (const group of toolGroups) for (const tool of group.tools) tools.set(tool.icon, tool.id)

  const clashes = []
  for (const command of commands.filter((item) => item.toolbar)) {
    const twin = tools.get(command.icon)
    if (twin && !sameThing.has(command.id)) clashes.push(`${command.id} looks like the ${twin} tool`)
  }
  assert.deepEqual(clashes, [], clashes.join('\n'))

  // And the exemptions are real: each one still shares with the tool it names.
  for (const id of sameThing) {
    const command = commands.find((item) => item.id === id)
    assert.ok(command && tools.has(command.icon), `${id} is exempt but no longer matches any tool`)
  }
})

test('the commands that pick out a subject say so with a person, not a magnifier', () => {
  // A magnifying glass reads as "find" or "zoom"; this command finds a person.
  const subject = commands.find((command) => command.id === 'select.subject')
  assert.ok(subject, 'Select Subject is gone from the catalog')
  const zoomish = commands.filter((command) => command.id.startsWith('view.zoom')).map((command) => command.icon)
  assert.ok(!zoomish.includes(subject.icon), 'Select Subject wears an icon that means zoom')
})
