/*
 * Choosing how a subject is found, fetching what that choice needs, and saying
 * so while a long job runs.
 *
 * Remove Background used to take whichever subject model happened to be on the
 * machine — a decision nobody saw and nobody could change, though the three
 * models differ by a factor of forty in size and visibly on hair. And a
 * command that took a minute said "working" in the status bar and nothing
 * else moved, which reads as a frozen program.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { CLASSICAL, recommendedModels, resolveSubjectMethod, subjectMethod, subjectMethods } from '../src/subjectMethods.ts'
import { modelSpecs } from '../src/lib/neural.ts'
import { defaultSettings } from '../src/lib/types.ts'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (...parts) => readFileSync(path.join(root, ...parts), 'utf8')

test('every way of finding a subject is offered, the built-in one first', () => {
  const methods = subjectMethods()
  assert.equal(methods[0].id, CLASSICAL, 'the method that needs no download is not first')
  assert.equal(methods[0].bytes, 0, 'the built-in method is being reported as a download')
  const models = modelSpecs.filter((spec) => spec.task === 'subject')
  assert.equal(methods.length, models.length + 1, 'a subject model is missing from the list')
  for (const spec of models) {
    const method = subjectMethod(spec.id)
    assert.ok(method, `${spec.id} is not offered`)
    assert.equal(method.bytes, spec.bytes, `${spec.id} reports the wrong size`)
    assert.equal(method.license, spec.license, `${spec.id} reports the wrong licence`)
  }
})

test('the choice is honoured when it can be, and degrades rather than failing', () => {
  // Asked for, and here.
  assert.equal(resolveSubjectMethod('isnet', ['isnet', 'u2netp']).id, 'isnet')
  // Asked for, but not downloaded: something still has to happen.
  assert.equal(resolveSubjectMethod('isnet', ['u2netp']).id, 'u2netp', 'a missing model did not fall back to what is here')
  assert.equal(resolveSubjectMethod('isnet', []).id, CLASSICAL, 'with nothing downloaded it did not fall back to the built-in method')
  // Asked for the built-in one: that is what runs, models or no models.
  assert.equal(resolveSubjectMethod(CLASSICAL, ['isnet']).id, CLASSICAL, 'the built-in method was overridden by a model')
  // No choice at all means the best thing here, which is what it did before.
  assert.equal(resolveSubjectMethod('', ['u2netp', 'isnet']).id, 'isnet', 'without a choice it did not take the best model')
  assert.equal(resolveSubjectMethod('', []).id, CLASSICAL)
})

test('the choice and the first-run answer are remembered', () => {
  assert.equal(defaultSettings.subjectMethod, '', 'the editor starts with an opinion it was not given')
  assert.equal(defaultSettings.modelsPrompted, false, 'the first-run offer would never be made')
  const app = read('src', 'App.tsx')
  assert.ok(app.includes('subjectMethod: method'), 'the chosen method is not saved')
  assert.ok(app.includes("openDialogRef.current('modelSetup'"), 'the first-run offer is never opened')
  assert.ok(app.includes('modelsPrompted: true'), 'the first-run offer would be made again every launch')
})

test('a missing model can be fetched from the window that needs it', () => {
  const extra = read('src', 'dialogsExtra.tsx')
  const body = extra.slice(extra.indexOf('function RemoveBackgroundDialog'), extra.indexOf('function ModelSetupDialog'))
  assert.ok(body.includes('modelStore().download(method.id)'), 'the window cannot fetch the model it needs')
  assert.ok(body.includes('store.onProgress'), 'the download reports no progress')
  assert.ok(body.includes('<progress'), 'there is no progress bar')
  assert.ok(body.includes('applyDisabled={!ready || fetching}'), 'the window would run a method it does not have')
})

test('the first-run window asks before fetching anything, and can be refused', () => {
  const extra = read('src', 'dialogsExtra.tsx')
  const body = extra.slice(extra.indexOf('function ModelSetupDialog'), extra.indexOf('/** Routes a dialog name to its body'))
  assert.ok(body.includes("onResult({ action: 'skip' })"), 'there is no way to say no')
  assert.ok(body.includes('modelStore().download(spec.id)'), 'it cannot fetch what it offers')
  assert.ok(body.includes('<progress'), 'the download reports no progress')
  assert.ok(recommendedModels.length >= 1, 'nothing is recommended')
  for (const id of recommendedModels) {
    assert.ok(modelSpecs.some((spec) => spec.id === id), `${id} is recommended but is not a model`)
  }
})

test('a long job puts a window up, and only once it has run long enough to need one', () => {
  const busySource = read('src', 'Busy.tsx')
  // The harness cannot import a .tsx module, so the threshold is read from it.
  const BUSY_AFTER_MS = Number(busySource.match(/BUSY_AFTER_MS = ([0-9]+)/)[1])
  assert.ok(BUSY_AFTER_MS >= 200, 'the busy window would flash on every quick filter')
  assert.ok(BUSY_AFTER_MS <= 1000, 'a long job would look frozen before the window appeared')
  const busy = busySource
  // The wait is carried on the job now rather than recomputed here: a job that
  // holds the thread asks to be shown at once, and the rest keep the grace
  // period. See busy.test.mjs.
  assert.ok(busy.includes('job.visible'), 'the window no longer waits before appearing')
  assert.ok(busy.includes('<progress'), 'the busy window has no progress bar')

  const app = read('src', 'App.tsx')
  assert.ok(app.includes('const runBusy = useCallback'), 'there is no way to run a job with a window in front of it')
  assert.ok(app.includes('await runBusy(label, () => compute(cloneCanvas(source)), { heavy })'), 'the layer commands no longer report themselves')
  assert.ok(app.includes('<BusyOverlay job={busy}'), 'the busy window is never drawn')
})
