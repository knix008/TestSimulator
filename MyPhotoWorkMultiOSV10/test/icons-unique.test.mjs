/*
 * No two rows of the same menu wear the same icon.
 *
 * Across menus a shared icon is usually right — a bin means delete wherever it
 * appears, and it would be perverse to draw it differently in the Layer menu
 * than in the View menu. Inside one dropdown it is the opposite: two rows that
 * look identical are two rows you have to read to tell apart, which is what
 * the icon was there to save you. Fifty-three icons were in that position,
 * covering 147 rows.
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

test('every command still has an icon, and they are drawable', () => {
  for (const command of commands) {
    const icon = command.icon
    // Lucide's icons come through forwardRef, so they are objects, not functions.
    assert.ok(icon && (typeof icon === 'function' || typeof icon === 'object'), `${command.id} has no icon`)
  }
})

test('the catalog draws on a wide enough vocabulary to be worth reading', () => {
  const distinct = new Set(commands.map((command) => command.icon))
  assert.ok(distinct.size >= 120, `only ${distinct.size} different icons across ${commands.length} commands`)
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
