// Korean/English UI coverage and the tool catalog behind the tool strip.
// A missing key shows up as a raw identifier in the UI, so completeness is the
// thing worth asserting here.
import test from 'node:test'
import assert from 'node:assert/strict'
import { blendLabel, t, toolLabel } from '../src/i18n.ts'
import { adjustmentTypes, filterCatalog, iconForTool, toolGroups } from '../src/catalog.ts'
import { blendModes } from '../src/lib/types.ts'

const languages = ['ko', 'en']
const allTools = toolGroups.flatMap((group) => group.tools.map((item) => item.id))

test('both languages translate the core menu keys', () => {
  const keys = [
    'appName', 'file', 'edit', 'image', 'layer', 'filter', 'view', 'new', 'open', 'save', 'saveAs',
    'export', 'undo', 'redo', 'selectAll', 'deselect', 'newLayer', 'duplicateLayer', 'deleteLayer',
    'mergeDown', 'imageSize', 'canvasSize',
  ]
  for (const language of languages) {
    for (const key of keys) {
      const label = t(language, key)
      assert.ok(label && label !== key, `${language} is missing a translation for "${key}"`)
    }
  }
})

test('Korean and English give genuinely different labels, not a copied table', () => {
  const differing = ['file', 'edit', 'open', 'save', 'undo', 'redo'].filter(
    (key) => t('ko', key) !== t('en', key),
  )
  assert.equal(differing.length, 6, 'some menu labels are identical across languages')
})

test('an unknown key falls back to the key itself instead of undefined', () => {
  assert.equal(t('ko', 'thisKeyDoesNotExist'), 'thisKeyDoesNotExist')
  assert.equal(t('en', 'thisKeyDoesNotExist'), 'thisKeyDoesNotExist')
})

test('every tool in the catalog has a label in both languages', () => {
  for (const language of languages) {
    for (const tool of allTools) {
      const label = toolLabel(language, tool)
      assert.ok(label, `${language} has no label for the "${tool}" tool`)
    }
  }
})

test('every blend mode has a label in both languages', () => {
  for (const language of languages) {
    for (const mode of blendModes) {
      assert.ok(blendLabel(language, mode), `${language} has no label for blend mode "${mode}"`)
    }
  }
})

test('every adjustment and filter in the catalog has a name in both languages', () => {
  for (const language of languages) {
    for (const id of adjustmentTypes) {
      assert.notEqual(t(language, id), id, `${language} has no name for the "${id}" adjustment`)
    }
    for (const { id } of filterCatalog) {
      assert.notEqual(t(language, id), id, `${language} has no name for the "${id}" filter`)
    }
  }
})

test('every filter gallery group heading is translated too', () => {
  const groups = [...new Set(filterCatalog.map((item) => item.group))]
  for (const language of languages) {
    for (const group of groups) {
      // The dialog builds the key the same way: "blur" -> "groupBlur".
      const key = `group${group.charAt(0).toUpperCase()}${group.slice(1)}`
      assert.notEqual(t(language, key), key, `${language} has no heading for the "${group}" group`)
    }
  }
})

test('tool ids are unique across all flyout groups', () => {
  assert.equal(new Set(allTools).size, allTools.length, 'a tool appears in two groups')
})

test('the tool strip covers every group the README advertises', () => {
  const groups = toolGroups.map((group) => group.id)
  for (const id of ['move', 'marquee', 'lasso', 'select', 'crop', 'sample', 'heal', 'paint', 'stamp',
    'erase', 'fill', 'focus', 'tone', 'pen', 'type', 'shape', 'nav']) {
    assert.ok(groups.includes(id), `the "${id}" tool group is missing`)
  }
  assert.ok(allTools.length > 50, `expected a full tool strip, found ${allTools.length} tools`)
})

test('every group holds at least one tool and each tool carries an icon', () => {
  for (const group of toolGroups) {
    assert.ok(group.tools.length > 0, `the "${group.id}" group is empty`)
    for (const tool of group.tools) {
      assert.ok(tool.icon, `${tool.id} has no icon component`)
      assert.equal(typeof tool.key, 'string', `${tool.id} has no shortcut field`)
    }
  }
})

test('iconForTool finds a catalogued tool and falls back for an unknown one', () => {
  assert.equal(iconForTool('brush'), toolGroups.find((g) => g.id === 'paint').tools[0].icon)
  assert.ok(iconForTool('notATool'), 'an unknown tool still gets an icon')
})

test('the filter catalog groups every entry and has no duplicate ids', () => {
  const ids = filterCatalog.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate filter id')
  for (const item of filterCatalog) {
    assert.ok(item.group, `the "${item.id}" filter has no menu group`)
  }
})
