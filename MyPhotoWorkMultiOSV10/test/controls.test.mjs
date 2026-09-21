/*
 * The numeric controls, and the rule they exist to enforce: the value follows
 * the mouse, the picture does not.
 *
 * Dragging a slider used to redraw the whole picture through the filter for
 * every pixel of the drag, so the drag ran at the speed of the filter and the
 * thumb lagged behind the pointer. The values are still live — the readout
 * beside a slider has to move — but the expensive reaction now waits for the
 * drag to end.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { beginAdjust, endAdjust, isAdjusting, onAdjustEnd } from '../src/adjusting.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

test('an adjustment in progress is visible, and ends exactly once', () => {
  assert.equal(isAdjusting(), false, 'nothing is being adjusted to begin with')
  const seen = []
  const stop = onAdjustEnd(() => seen.push('end'))

  beginAdjust()
  assert.equal(isAdjusting(), true)
  assert.deepEqual(seen, [], 'the end fired while the drag was still going')
  endAdjust()
  assert.equal(isAdjusting(), false)
  assert.deepEqual(seen, ['end'], 'the end did not fire')

  // A release with nothing held must not fire anything.
  endAdjust()
  assert.deepEqual(seen, ['end'], 'a stray release fired the end again')
  stop()
})

test('two controls held at once end together, not one at a time', () => {
  let ends = 0
  const stop = onAdjustEnd(() => { ends += 1 })
  beginAdjust()
  beginAdjust()
  endAdjust()
  assert.equal(isAdjusting(), true, 'one control is still held')
  assert.equal(ends, 0, 'the end fired while a control was still held')
  endAdjust()
  assert.equal(isAdjusting(), false)
  assert.equal(ends, 1)
  stop()
})

test('a listener can be taken off again', () => {
  let ends = 0
  const stop = onAdjustEnd(() => { ends += 1 })
  stop()
  beginAdjust()
  endAdjust()
  assert.equal(ends, 0, 'a removed listener still fired')
})

test('the preview waits for the drag instead of running on every change', () => {
  const source = read('src', 'usePreview.ts')
  assert.match(source, /isAdjusting\(\)/, 'the preview no longer asks whether a drag is in progress')
  assert.match(source, /return onAdjustEnd\(send\)/, 'the preview does not wait for the drag to end')
  // And it still previews immediately when nothing is being dragged, so a
  // checkbox or a dropdown in the same window answers at once.
  assert.match(source, /if \(!isAdjusting\(\)\) \{\s*\n\s*send\(\)/, 'a change outside a drag no longer previews at once')
})

test('every slider in the editor is the one that reports its drag', () => {
  // A raw range input would send changes straight through and take the
  // preview with it, which is the behaviour this all exists to prevent.
  const files = readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.tsx'))
  for (const name of files) {
    if (name === 'controls.tsx') continue
    assert.doesNotMatch(read('src', name), /type="range"/, `${name} has a raw range input`)
  }
  const controls = read('src', 'controls.tsx')
  assert.match(controls, /onPointerDown=\{begin\}/, 'the slider does not announce the start of a drag')
  assert.match(controls, /window\.addEventListener\('pointerup', end\)/, 'a release off the track would not end the drag')
  assert.match(controls, /value=\{value\}/, 'the slider stopped following its value, so the readout beside it would stall')
})

test('a typed number commits when it is finished, not on every keystroke', () => {
  const controls = read('src', 'controls.tsx')
  const field = controls.slice(controls.indexOf('export function NumberField'))
  assert.match(field, /onChange=\{\(event\) => setTyped\(event\.target\.value\)\}/, 'typing still goes straight through')
  assert.match(field, /onBlur=\{commit\}/, 'leaving the field does not commit')
  assert.match(field, /event\.key !== 'Enter'/, 'Enter does not commit')

  const dialogs = read('src', 'dialogs.tsx')
  const stepper = dialogs.slice(dialogs.indexOf('export function NumberStepper'), dialogs.indexOf('/* ------------------------------------------------------------ curve editor */'))
  assert.match(stepper, /value=\{typed \?\? value\}/, 'the stepper still redraws on every keystroke')
  assert.match(stepper, /onBlur=\{commitTyped\}/, 'the stepper does not commit when it is left')
  // The buttons are a single step, so they stay immediate.
  assert.match(stepper, /onClick=\{\(\) => nudge\(-1\)\}/, 'the decrease button changed shape')
})

test('every raw number input in the editor is a NumberField or a stepper', () => {
  for (const name of ['App.tsx', 'panels.tsx', 'dialogsExtra.tsx']) {
    assert.doesNotMatch(read('src', name), /type="number"/, `${name} has a raw number input`)
  }
})
