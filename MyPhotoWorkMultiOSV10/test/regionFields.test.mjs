// Typing the exact position and size of a crop box or a selection.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { featherSelection, patchRegion, rectSelection, regionRange, resizeSelection, selectionBox, selectionToMask } from '../src/lib/selection.ts'
import { optionsForTool } from '../src/toolOptions.ts'
import { t } from '../src/i18n.ts'

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const doc = { width: 100, height: 80 }

test('a typed value changes that one number', () => {
  const box = { x: 10, y: 10, width: 40, height: 30 }
  assert.deepEqual(patchRegion(box, { x: 20 }, doc), { x: 20, y: 10, width: 40, height: 30 })
  assert.deepEqual(patchRegion(box, { height: 50 }, doc), { x: 10, y: 10, width: 40, height: 50 })
})

test('a box stays inside the picture, whatever is typed', () => {
  const box = { x: 10, y: 10, width: 40, height: 30 }
  assert.deepEqual(patchRegion(box, { width: 500 }, doc), { x: 10, y: 10, width: 90, height: 30 }, 'too wide')
  assert.deepEqual(patchRegion(box, { x: 90 }, doc), { x: 60, y: 10, width: 40, height: 30 }, 'moved past the edge, it keeps its size')
  assert.deepEqual(patchRegion(box, { width: 0 }, doc).width, 1, 'a box cannot vanish')
  assert.deepEqual(patchRegion(box, { y: -5 }, doc).y, 0)
})

test('a crop ratio holds while either side is typed', () => {
  const box = { x: 0, y: 0, width: 40, height: 30 }
  assert.deepEqual(patchRegion(box, { width: 60 }, doc, 2), { x: 0, y: 0, width: 60, height: 30 })
  assert.deepEqual(patchRegion(box, { height: 20 }, doc, 2), { x: 0, y: 0, width: 40, height: 20 })
  const held = patchRegion(box, { width: 100 }, { width: 100, height: 20 }, 2)
  assert.deepEqual([held.width, held.height], [40, 20], 'the ratio survives hitting the edge of the picture')
  assert.deepEqual(patchRegion(box, { x: 5 }, doc, 2), { x: 5, y: 0, width: 40, height: 30 }, 'moving is not resizing')
})

test('a rectangular or round selection takes the new numbers and keeps its kind', () => {
  const rect = resizeSelection({ kind: 'rect', x: 0, y: 0, width: 10, height: 10 }, { x: 5, width: 20 }, doc)
  assert.deepEqual(rect, { kind: 'rect', x: 5, y: 0, width: 20, height: 10 })
  assert.equal(resizeSelection({ kind: 'ellipse', x: 0, y: 0, width: 10, height: 10 }, { width: 20 }, doc).kind, 'ellipse')
})

test('a lasso or wand selection is moved and scaled with its shape', () => {
  const mask = new Uint8Array(doc.width * doc.height)
  // An L: two arms, so a shape that was merely filled in would be noticed.
  for (let y = 10; y < 20; y += 1) for (let x = 10; x < 20; x += 1) if (x < 15 || y >= 15) mask[y * doc.width + x] = 255
  const before = { kind: 'mask', x: 10, y: 10, width: 10, height: 10, mask }
  const moved = resizeSelection(before, { x: 40, y: 30 }, doc)
  assert.deepEqual([moved.x, moved.y, moved.width, moved.height], [40, 30, 10, 10])
  const after = selectionToMask(moved, doc.width, doc.height)
  assert.equal(after[32 * doc.width + 42], 255, 'the arm moved with it')
  assert.equal(after[32 * doc.width + 47], 0, 'the corner of the L stays empty')
  assert.equal(after[12 * doc.width + 12], 0, 'the old place is cleared')
  const larger = resizeSelection(before, { width: 20, height: 20 }, doc)
  const big = selectionToMask(larger, doc.width, doc.height)
  assert.equal(big[12 * doc.width + 12], 255)
  assert.equal(big[12 * doc.width + 27], 0, 'the empty corner scales too')
  assert.equal(big[27 * doc.width + 27], 255)
  assert.equal(mask[32 * doc.width + 42], 0, 'the original is left alone, for Undo')
})

test('the crop tool and every selecting tool offer the fields', () => {
  assert.ok(optionsForTool('crop').some((control) => control.id === 'regionFields'), 'the crop tool has no fields')
  for (const tool of ['marquee', 'ellipseMarquee', 'lasso', 'polyLasso', 'magneticLasso', 'wand', 'quickSelect', 'objectSelect']) {
    assert.ok(optionsForTool(tool).some((control) => control.id === 'regionFields'), `${tool} has no fields`)
  }
  assert.ok(!optionsForTool('brush').some((control) => control.id === 'regionFields'))
  const app = read('src/App.tsx')
  assert.match(app, /control\.id === 'regionFields'/, 'the options bar does not draw them')
  for (const key of ['regionX', 'regionY', 'regionWidth', 'regionHeight']) {
    assert.notEqual(t('ko', key), key)
    assert.notEqual(t('en', key), key)
  }
})

test('Enter in a number field confirms the field, and does not apply the crop', () => {
  // It used to run the crop at once, cutting the picture to the size half typed.
  const app = read('src/App.tsx')
  assert.match(app, /key === 'enter' && crop && !typing/, 'Enter in a field applies the crop')
  assert.match(app, /if \(key === 'enter' && !typing\) \{/, 'Enter in a field commits what the tool has drawn')
})

test('the numbers describe what is selected, not the whole picture', () => {
  // A feathered marquee, a lasso and the wand say x 0, y 0 and the picture's size.
  const limit = { width: 32, height: 32 }
  const feathered = featherSelection(rectSelection(8, 8, 16, 16), 32, 32, 2)
  assert.deepEqual([feathered.x, feathered.width], [0, 32], 'this test has lost its point')
  const box = selectionBox(feathered, limit)
  assert.ok(box.x > 0 && box.x <= 8 && box.width >= 16 && box.width < 32, JSON.stringify(box))
  const moved = resizeSelection(feathered, { x: box.x + 3 }, limit)
  assert.equal(selectionBox(moved, limit).x, box.x + 3, 'typing one more does not move it by one')
  assert.equal(selectionBox(moved, limit).width, box.width)
  assert.deepEqual(selectionBox({ kind: 'mask', x: 0, y: 0, width: 32, height: 32, mask: new Uint8Array(1024) }, limit), { x: 0, y: 0, width: 1, height: 1 }, 'an empty mask must not give a negative size')
  assert.deepEqual(selectionBox(rectSelection(2, 3, 4, 5), limit), { x: 2, y: 3, width: 4, height: 5 })
})

test('a stepper stops where the box meets the edge of the picture', () => {
  const range = regionRange({ x: 10, y: 20, width: 40, height: 30 }, doc)
  assert.deepEqual(range.x, { min: 0, max: 60 })
  assert.deepEqual(range.y, { min: 0, max: 50 })
  assert.deepEqual(range.width, { min: 1, max: 90 })
  assert.deepEqual(range.height, { min: 1, max: 60 })
  // These are what patchRegion lets through, so a button that is on always does something.
  const box = { x: 10, y: 20, width: 40, height: 30 }
  for (const key of Object.keys(range)) assert.equal(patchRegion(box, { [key]: range[key].max }, doc)[key], range[key].max, key)
  assert.deepEqual(regionRange({ x: 0, y: 0, ...doc }, doc).x, { min: 0, max: 0 }, 'the whole picture has nowhere to move')
})

test('the fields use the same number control as everything else, in pixels', () => {
  const fields = read('src/RegionFields.tsx')
  assert.match(fields, /<NumberStepper [^>]*unit="px"/)
  assert.match(fields, /max=\{range\[key\]\.max\}/, 'a button would stay on with nowhere to go')
})
