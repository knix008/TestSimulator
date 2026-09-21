/*
 * The progress window, and the two buttons that should be greyed out.
 *
 * Both of these come from the same complaint: the program looked as though it
 * had stopped. Press a filter on a big photograph and nothing moved until it
 * was over; press Undo with nothing behind it and the button took the click
 * and did nothing. Neither is easy to test by driving the app — a blocked
 * thread cannot be screenshotted, and that is the whole point — so what is
 * checked here is the wiring that makes them work.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { t } from '../src/i18n.ts'

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, new URL('..', import.meta.url))), 'utf8')
const appSource = read('src/App.tsx')
const busySource = read('src/Busy.tsx')
// Busy.tsx is a component; the tests below read its rules rather than render it.
const BUSY_AFTER_MS = Number(busySource.match(/BUSY_AFTER_MS = ([0-9]+)/)[1])

/* ------------------------------------------------------- the window itself */

test('a job that finishes in a blink never puts a window on the screen', () => {
  // The job says whether its window belongs on the screen; the window does
  // not work it out for itself from a clock it cannot keep up to date.
  assert.ok(busySource.includes('if (!job || !job.visible) return null'), 'the window decides for itself again')
  assert.ok(!busySource.includes('now < job.'), 'the window is gated on a clock that a frozen job cannot advance')
  assert.ok(BUSY_AFTER_MS >= 200 && BUSY_AFTER_MS <= 1000, `${BUSY_AFTER_MS}ms is not a sensible grace period`)
})

test('a heavy job shows its window at once, a light one waits out the grace period', () => {
  const runBusy = appSource.slice(appSource.indexOf('const runBusy = useCallback'), appSource.indexOf('const computeOnLayer'))
  assert.match(runBusy, /visible: options\.heavy === true/, 'a heavy job does not ask to be shown at once')
  assert.match(runBusy, /window\.setTimeout\(\(\) => update\(\{ visible: true \}\), BUSY_AFTER_MS\)/, 'a light job no longer waits out its grace period')
  assert.match(runBusy, /window\.clearTimeout\(grace\)/, 'the grace timer outlives the job it belonged to')
})

test('a heavy job waits for the screen before it starts', () => {
  /*
   * This is the fix for the frozen window. A filter is one long loop over the
   * pixels: while it runs no timer fires and no frame is drawn, so a window
   * asked for at the start of the job would only have arrived after the job
   * had already put it away. The heavy path hands the screen a frame first.
   */
  const runBusy = appSource.slice(appSource.indexOf('const runBusy = useCallback'), appSource.indexOf('const computeOnLayer'))
  const paint = runBusy.indexOf('await nextPaint()')
  const start = runBusy.indexOf('await job(report)')
  assert.ok(paint > 0, 'a heavy job starts work before its window has been drawn')
  assert.ok(paint < start, 'the paint happens after the work, which is too late to be seen')
  assert.match(runBusy, /if \(options\.heavy\) await nextPaint\(\)/, 'every job pays for the paint, including the quick ones')

  // And nextPaint must actually wait for a frame, not just a tick.
  const helper = appSource.slice(appSource.indexOf('const nextPaint ='), appSource.indexOf('const runBusy'))
  assert.match(helper, /requestAnimationFrame\(\(\) => requestAnimationFrame/, 'one frame only commits the change; it does not draw it')
  assert.match(helper, /window\.setTimeout\(finish, \d+\)/, 'a window that is not compositing would wait forever')
})

test('one job running inside another gives the window back when it ends', () => {
  // Remove Background stops to fetch a model; when the fetch is over the
  // layer job is still running and its window has to come back.
  const runBusy = appSource.slice(appSource.indexOf('const runBusy = useCallback'), appSource.indexOf('const computeOnLayer'))
  assert.match(runBusy, /const outer = busyRef\.current/, 'a nested job does not remember what it interrupted')
  assert.match(runBusy, /busyRef\.current = outer/, 'a nested job clears the window its caller was showing')
  assert.ok(!runBusy.includes('setBusy(null)'), 'the window is cleared outright rather than restored')
})

test('a filter on a big picture is treated as heavy without being listed as such', () => {
  /*
   * Deciding by size rather than by name means a filter added tomorrow is
   * covered too, and a filter on a snapshot still costs nothing.
   */
  const compute = appSource.slice(appSource.indexOf('const computeOnLayer = useCallback'), appSource.indexOf('/* --------------------------------------------------------- neural models */'))
  assert.match(compute, /source\.width \* source\.height >= HEAVY_PIXELS/, 'heaviness is not judged by the size of the work')
  assert.match(compute, /options\.heavy === true \|\|/, 'a command cannot declare itself slow regardless of size')
  const threshold = Number(appSource.match(/const HEAVY_PIXELS = ([\d_]+)/)[1].replaceAll('_', ''))
  assert.ok(threshold >= 500_000 && threshold <= 8_000_000, `${threshold} pixels is not a sensible threshold`)
})

/* ------------------------------------------- the jobs that had no window at all */

test('every command that said it was working now says so in front of the reader', () => {
  /*
   * `setStatus('working')` is the old way of saying it: four grey letters at
   * the bottom of the screen. Each of those places now also puts the window
   * up. Listed by the line the status is set on, so a new one that forgets
   * the window fails here rather than being found by the reader.
   */
  const lines = appSource.split(/\r?\n/)
  const missing = []
  lines.forEach((line, index) => {
    if (!line.includes("setStatus('working')")) return
    // The window may be opened by this block, or by a helper it calls that
    // opens one of its own (computeOnLayer, openFiles).
    const block = lines.slice(index, index + 60).join('\n')
    if (!/runBusy\(/.test(block)) missing.push(index + 1)
  })
  assert.deepEqual(missing, [], `these long jobs still run with nothing on the screen: lines ${missing.join(', ')}`)
})

test('the slow jobs that are slow on any picture say so for themselves', () => {
  // A network, a patch search or a Poisson solve is slow on a postage stamp.
  for (const marker of [
    "tr('contentAware')",
    "tr('genFill')",
    "tr('removeBg')",
    "tr('neuralDepth')",
  ]) {
    const at = appSource.indexOf(marker)
    assert.ok(at > 0, `${marker} is gone`)
    const body = appSource.slice(at, at + 2400)
    assert.ok(body.includes('{ heavy: true }'), `${marker} does not ask for its window up front`)
  }

  /*
   * Harmonize is the exception that keeps the rule honest: with nothing under
   * the layer it is a colour shift, not a Poisson solve, and asking for the
   * window then only buys a two-frame flicker. It decides per call.
   */
  const harmonize = appSource.slice(appSource.indexOf('const harmonizeLayer'), appSource.indexOf('const harmonizeLayer') + 800)
  assert.match(harmonize, /{ heavy: index > 0 }/, 'Harmonize claims the same weight whatever it is about to do')
})

test('the automations, the selections and the video work all report', () => {
  for (const [what, label] of [
    ['Auto-Align', "runBusy(tr('autoAlign')"],
    ['Auto-Blend', "runBusy(tr('autoBlend')"],
    ['Photomerge', "runBusy(tr('photomerge')"],
    ['Merge to HDR', "runBusy(tr('mergeHdr')"],
    ['Statistics', "runBusy(tr('statistics')"],
    ['Crop and Straighten', "runBusy(tr('cropStraighten')"],
    ['Select Subject', "runBusy(tr('selectSubject')"],
    ['Select Sky', "runBusy(tr('selectSky')"],
    ['Super Zoom', "runBusy(tr('genUpscale')"],
    ['Batch', "runBusy(tr('batch')"],
    ['Import Video', "runBusy(tr('importVideo')"],
    ['Export Video', "runBusy(tr('exportVideo')"],
  ]) {
    assert.ok(appSource.includes(label), `${what} runs with no window`)
  }
})

test('every label the window can show is a real phrase in both languages', () => {
  const labels = [...appSource.matchAll(/runBusy\(tr\('([a-zA-Z]+)'\)/g)].map((match) => match[1])
  assert.ok(labels.length >= 12, `only ${labels.length} jobs report`)
  for (const key of new Set([...labels, 'busyWorking'])) {
    for (const language of ['ko', 'en']) {
      const phrase = t(language, key)
      assert.ok(phrase && phrase !== key, `${language} has no phrase for ${key}`)
    }
  }
})

test('the jobs that can count say how far along they are', () => {
  // A bar that never moves is only a little better than no bar; the two jobs
  // that know their own length pass a fraction.
  const upscale = appSource.slice(appSource.indexOf("runBusy(tr('genUpscale')"), appSource.indexOf("snapshot(tr('genUpscale'))"))
  assert.match(upscale, /report\(fraction\)/, 'Super Zoom knows its tile count but does not report it')
  const batch = appSource.slice(appSource.indexOf("runBusy(tr('batch')"), appSource.indexOf("setStatus('ready')", appSource.indexOf("runBusy(tr('batch')")))
  assert.match(batch, /report\(index \/ chosen\.files\.length, file\.name\)/, 'a batch does not say which file it is on')
})

/* ------------------------------------------------------------- undo / redo */

test('Undo and Redo are dead buttons when there is nothing behind them', () => {
  const rule = appSource.slice(appSource.indexOf('const isCommandDisabled ='), appSource.indexOf('const isCommandDisabled =') + 400)
  assert.match(rule, /'edit\.undo'\) return historyMeta\.undo\.length === 0/, 'Undo is live with an empty history')
  assert.match(rule, /'edit\.redo'\) return historyMeta\.redo\.length === 0/, 'Redo is live with nothing to put back')
})

test('the rule reaches the toolbar, the in-page menu and the menu window alike', () => {
  assert.ok(appSource.includes('disabled={isCommandDisabled(command.id)}'), 'the toolbar buttons ignore it')
  assert.ok(appSource.includes('isDisabled={isCommandDisabled}'), 'the in-page menu ignores it')

  /*
   * The dropdown is a separate OS window and knows nothing of the document,
   * so the list has to travel with the payload — this is what was missing
   * when the toolbar had already been done.
   */
  assert.match(appSource, /const disabled = commands\.filter\(\(command\) => isCommandDisabled\(command\.id\)\)/, 'no disabled list is worked out for the menu window')
  assert.match(appSource, /\{ menu: id, language, theme: settings\.theme, active, disabled,/, 'the disabled list is not sent to the menu window')

  const host = read('src/MenuHost.tsx')
  assert.match(host, /disabled\?: string\[\]/, 'the menu window has nowhere to put the list')
  assert.match(host, /isDisabled=\{\(id\) => \(payload\.disabled \?\? \[\]\)\.includes\(id\)\}/, 'the menu window drops the list on the floor')

  const css = read('src/App.css')
  assert.match(css, /.menu-tree button:disabled/, 'a disabled row in the dropdown looks exactly like a live one')

  const tree = read('src/MenuTree.tsx')
  assert.match(tree, /disabled=\{isDisabled\?\.\(command\.id\) \?\? false\}/, 'the rows never go grey')
})

test('a menu window from an older payload still opens', () => {
  // `disabled` is optional, so a pooled window that was given the old shape
  // shows every row live rather than throwing.
  const host = read('src/MenuHost.tsx')
  assert.match(host, /payload\.disabled \?\? \[\]/, 'a payload without the list would break the window')
})

test('the window is not gated on a clock the job itself has stopped', () => {
  /*
   * The bug this was written for. The window kept the time in state and
   * decided from it whether it had waited long enough to appear. State only
   * moves on a timer, and a job that holds the thread stops every timer in
   * the page — so a job beginning now looked to the window as though it had
   * not begun, and the window that existed for precisely that case was the
   * one case it could never reach. Measured on a 2000x1500 layer: twenty-nine
   * seconds of a completely unresponsive window with nothing drawn on it.
   */
  assert.ok(!busySource.includes('Date.now()) < '), 'the visibility decision is back on the clock')
  const gate = busySource.slice(busySource.indexOf('if (!job'), busySource.indexOf('const percent'))
  assert.ok(!/now/.test(gate.split('\n')[0]), 'the first thing the window checks is the time again')

  // The elapsed time may be stale; it must not be shown as though it were not.
  assert.match(busySource, /elapsed > 0 \?/, 'a stopped clock would be shown as a real elapsed time')
})
