// Guards the wiring between the catalog, the options bar and App's canvas
// dispatch. These are the checks that would have caught the tools that used to
// sit in the tool strip doing nothing at all.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { toolGroups } from '../src/catalog.ts'
import { optionLabelKeys, optionsForTool, toolOptions } from '../src/toolOptions.ts'
import { t } from '../src/i18n.ts'
import { shapeKindForTool, penTools, shapeTools } from '../src/lib/types.ts'

const appSource = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')
const allTools = toolGroups.flatMap((group) => group.tools.map((item) => item.id))

/** The three pointer handlers, where a tool either acts or is silently ignored. */
function pointerDispatch() {
  const start = appSource.indexOf('const handlePointerDown')
  const end = appSource.indexOf('const handleWheel')
  assert.ok(start > 0 && end > start, 'could not locate the pointer handlers')
  return appSource.slice(start, end)
}

test('every tool in the strip has an options row', () => {
  for (const tool of allTools) {
    const controls = optionsForTool(tool)
    assert.ok(controls.length > 0, `the "${tool}" tool has no options row`)
  }
})

test('every options row explains the tool with a hint', () => {
  for (const tool of allTools) {
    const hints = optionsForTool(tool).filter((control) => control.kind === 'hint')
    assert.equal(hints.length, 1, `the "${tool}" tool should have exactly one hint, found ${hints.length}`)
  }
})

test('the options table covers the catalog exactly, with no stale entries', () => {
  const described = Object.keys(toolOptions).sort()
  assert.deepEqual(described, [...allTools].sort())
})

test('every options label resolves in both languages', () => {
  for (const language of ['ko', 'en']) {
    for (const key of optionLabelKeys()) {
      assert.notEqual(t(language, key), key, `${language} has no label for "${key}"`)
    }
  }
})

test('Korean and English hints are actually different text', () => {
  const identical = optionLabelKeys().filter((key) => key.startsWith('hint') && t('ko', key) === t('en', key))
  assert.deepEqual(identical, [], 'some hints were never translated')
})

test('every tool is reachable from the canvas pointer dispatch', () => {
  const dispatch = pointerDispatch()
  const unreachable = allTools.filter((tool) => {
    // Shape tools are dispatched as a family through shapeKindForTool.
    if (shapeKindForTool[tool]) return false
    return !new RegExp(`'${tool}'`).test(dispatch)
  })
  assert.deepEqual(unreachable, [], 'these tools do nothing when used on the canvas')
})

test('every shape tool maps to a shape kind the rasteriser knows', () => {
  const kinds = ['rect', 'roundRect', 'ellipse', 'polygon', 'line', 'star', 'heart', 'arrow']
  for (const tool of shapeTools) {
    assert.ok(shapeKindForTool[tool], `the "${tool}" tool has no shape kind`)
    assert.ok(kinds.includes(shapeKindForTool[tool]), `"${tool}" maps to an unknown kind`)
  }
  assert.equal(shapeTools.length, 6)
})

test('the pen tools are dispatched and can commit a path', () => {
  const dispatch = pointerDispatch()
  for (const tool of penTools) {
    assert.ok(new RegExp(`'${tool}'`).test(dispatch), `the "${tool}" tool is not dispatched`)
  }
  assert.ok(appSource.includes('commitDraftPath'), 'no path is ever committed to the document')
})

test('the clone stamp actually clones instead of painting the foreground colour', () => {
  // The regression this replaces: cloneStamp existed but App never called it.
  assert.ok(appSource.includes('cloneStamp('), 'cloneStamp is never called')
  const dab = appSource.slice(appSource.indexOf('const paintDab'), appSource.indexOf('const handlePointerDown'))
  assert.ok(/case 'clone':/.test(dab), 'the clone tool has no branch of its own')
  assert.ok(/cloneStamp\(/.test(dab), 'the clone branch does not call cloneStamp')
})

test('the blur and sharpen tools run their filters rather than a paint stroke', () => {
  const dab = appSource.slice(appSource.indexOf('const paintDab'), appSource.indexOf('const handlePointerDown'))
  assert.ok(/case 'blurTool':[\s\S]{0,200}gaussianBlur\(/.test(dab), 'blurTool does not blur')
  assert.ok(/case 'sharpenTool':[\s\S]{0,200}sharpen\(/.test(dab), 'sharpenTool does not sharpen')
})

test('free transform, flips, curves, levels and groups are all reachable from the menus', () => {
  for (const command of [
    'beginTransform', 'commitTransform', 'cancelTransform',
    'flipDocument', 'flipLayer',
    'openCurves', 'openLevels',
    'groupActiveLayer', 'ungroupActiveLayer',
    'applyPerspectiveCrop', 'exportSlice',
  ]) {
    assert.ok(appSource.includes(`${command}(`), `${command} is defined but never invoked from the UI`)
  }
})

test('the new dialogs are rendered', () => {
  for (const id of ['curves', 'levels']) {
    assert.ok(appSource.includes(`dialog === '${id}'`), `the ${id} dialog is never rendered`)
  }
})

test('the viewport draws the path, region and transform overlays', () => {
  for (const call of ['drawPathOverlay(', 'drawRegionOverlay(', 'drawTransformOverlay(']) {
    assert.ok(appSource.includes(call), `${call} is never drawn`)
  }
})

test('keyboard shortcuts cover the tool families Photoshop assigns letters to', () => {
  const keys = appSource.slice(appSource.indexOf("if (key === 'v') setTool"), appSource.indexOf("if (key === '[')"))
  for (const [key, tool] of [
    ['p', 'pen'], ['u', 'rect'], ['a', 'pathSelect'], ['k', 'frame'],
    ['j', 'spotHeal'], ['s', 'clone'], ['o', 'dodge'], ['y', 'historyBrush'], ['r', 'rotateView'],
  ]) {
    assert.ok(new RegExp(`key === '${key}'`).test(keys), `no shortcut bound to "${key}"`)
    assert.ok(new RegExp(`'${tool}'`).test(keys), `"${key}" does not reach the ${tool} tool`)
  }
  assert.ok(/accel && key === 't'/.test(appSource), 'Ctrl+T does not start a free transform')
})
