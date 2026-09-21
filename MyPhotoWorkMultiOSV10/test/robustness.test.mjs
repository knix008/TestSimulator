/*
 * What has to hold for the editor to keep working when a piece of it is not
 * there. Two of these guard real failures:
 *
 *  - `@techstark/opencv-js` and `onnxruntime-web` were declared in package.json
 *    but missing from node_modules, and 11 commands failed on every photo. The
 *    unit tests all passed, because none of them imported those packages.
 *  - Auto-Align and Auto-Blend Layers were the only OpenCV-backed commands
 *    without a fallback: instead of degrading they opened an error window.
 *
 * The rest hold the quality of what the segmenters and the inpainter return,
 * which unit tests on flat synthetic shapes did not notice.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { autoAlignLayers, autoBlendLayers, mergeToHdr, photomerge, shiftCanvas } from '../src/lib/documentOps.ts'
import { objectSelectRect, selectSky, selectSubjectAuto, tidySubjectMask } from '../src/lib/segment.ts'
import { patchFill } from '../src/lib/inpaint.ts'
import { defaultSettings } from '../src/lib/types.ts'
import { canvasOf, withSeededRandom } from './helpers/pixels.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const appSource = readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8')

/* ------------------------------------------------------------ the packages */

test('every declared runtime dependency is actually installed', () => {
  const { dependencies } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const missing = []
  for (const name of Object.keys(dependencies)) {
    // resolve() finds the package.json even when the entry point is WASM glue
    // that cannot be loaded outside a browser.
    try { require.resolve(`${name}/package.json`) } catch {
      try { require.resolve(name) } catch { missing.push(name) }
    }
  }
  assert.deepEqual(missing, [], `declared but not installed: ${missing.join(', ')}`)
})

test('OpenCV loads and has every routine the vision code calls', async () => {
  const { loadCv } = await import('../src/lib/cv.ts')
  const cv = await loadCv()
  const needed = [
    'Mat', 'MatVector', 'Rect', 'Size', 'Scalar', 'grabCut', 'inpaint', 'ORB', 'BFMatcher', 'findHomography',
    'warpPerspective', 'perspectiveTransform', 'bilateralFilter', 'distanceTransform', 'MergeMertens',
    'minAreaRect', 'kmeans', 'findContours', 'cvtColor', 'resize', 'morphologyEx', 'getStructuringElement',
  ]
  const missing = needed.filter((name) => typeof cv[name] === 'undefined')
  assert.deepEqual(missing, [], `this OpenCV build is missing: ${missing.join(', ')}`)
})

/* ----------------------------------------------------------- the fallbacks */

test('every OpenCV-backed command has a non-OpenCV path wired into the app', () => {
  // Command -> the function that runs when OpenCV cannot be loaded.
  const fallbacks = {
    'Content-Aware Fill': 'contentAwareFill',
    'Select Subject': 'selectSubjectAuto',
    'Object Selection': 'objectSelectRect',
    Photomerge: 'photomerge',
    'Merge to HDR': 'mergeToHdr',
    'Auto-Align Layers': 'autoAlignLayers',
    'Auto-Blend Layers': 'autoBlendLayers',
  }
  for (const [command, fallback] of Object.entries(fallbacks)) {
    assert.ok(appSource.includes(fallback), `${command} has no ${fallback}() fallback in App.tsx`)
  }
})

test('the layer fallbacks align and blend without OpenCV', () => {
  const frames = [canvasOf(64, 64, '#203040'), canvasOf(64, 64, '#203040')]
  for (const [index, frame] of frames.entries()) {
    const ctx = frame.getContext('2d')
    ctx.fillStyle = '#e0c060'
    ctx.fillRect(20 + index * 5, 18 + index * 3, 18, 18)
  }
  const offsets = autoAlignLayers(frames)
  assert.equal(offsets.length, 2)
  assert.ok(offsets.every((o) => Number.isFinite(o.dx) && Number.isFinite(o.dy)), 'offsets are numbers')
  const shifted = frames.map((frame, i) => shiftCanvas(frame, offsets[i].dx, offsets[i].dy))
  assert.equal(shifted.length, 2)

  const blended = autoBlendLayers(frames)
  assert.equal(blended.length, 2)
  const alpha = (canvas, x, y) => canvas.getContext('2d').getImageData(x, y, 1, 1).data[3]
  assert.equal(alpha(blended[0], 32, 32), 255, 'the base layer keeps its alpha')
  assert.ok(alpha(blended[1], 32, 32) > alpha(blended[1], 1, 1), 'the layer above fades towards its edge')

  const fused = mergeToHdr(frames)
  assert.equal(fused.width, 64)
  const merged = photomerge(frames, 'horizontal', true)
  assert.ok(merged.canvas.width >= 64, 'the strip is at least one frame wide')
})

/* ------------------------------------------------------------ the quality */

/** Sky above, a pool of almost the same blue below it, a wall between them. */
function terrace(size = 96) {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  const sky = ctx.createLinearGradient(0, 0, 0, size * 0.45)
  sky.addColorStop(0, '#6aa8f0')
  sky.addColorStop(1, '#bcd8f6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, size, size * 0.45)
  ctx.fillStyle = '#f2f2f0'
  ctx.fillRect(0, size * 0.45, size, size * 0.08)
  // Pool water: bright and blue-green, the thing that used to be taken for sky.
  ctx.fillStyle = '#58c6d4'
  ctx.fillRect(0, size * 0.53, size, size * 0.47)
  return canvas
}

test('select sky stops at the horizon instead of running into the water', () => {
  const size = 96
  const selection = selectSky(terrace(size))
  const at = (x, y) => selection.mask[y * size + x]
  assert.ok(at(size / 2, 4) > 127, 'the sky at the top is selected')
  assert.ok(at(size / 2, Math.round(size * 0.35)) > 127, 'and the sky just above the wall')
  assert.equal(at(size / 2, Math.round(size * 0.75)), 0, 'the pool below the wall is not')
  assert.equal(at(4, size - 3), 0, 'nor the bottom corner')
  let low = 0
  for (let y = Math.round(size * 0.6); y < size; y += 1) for (let x = 0; x < size; x += 1) if (selection.mask[y * size + x] > 127) low += 1
  assert.equal(low, 0, `${low} pixels selected below the waterline`)
})

test('tidying a subject mask keeps one object, fills it and drops the crumbs', () => {
  const width = 64
  const height = 64
  const mask = new Uint8Array(width * height)
  const set = (x0, y0, w, h, v = 255) => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) mask[y * width + x] = v
  }
  set(16, 12, 28, 40)   // the subject
  set(26, 26, 6, 6, 0)  // a hole in it
  set(2, 2, 3, 3)       // a crumb of background in the corner
  set(58, 58, 2, 2)     // and another
  const tidy = tidySubjectMask(mask, width, height)
  assert.ok(tidy[30 * width + 30] > 127, 'the hole inside the subject is filled')
  assert.ok(tidy[20 * width + 20] > 127, 'the subject itself is kept')
  assert.equal(tidy[3 * width + 3], 0, 'the corner crumb is gone')
  assert.equal(tidy[58 * width + 58], 0, 'so is the other one')
})

test('select subject and object selection still find the subject after tidying', () => {
  const size = 64
  const canvas = canvasOf(size, size, '#9ec8f0')
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#c03030'
  ctx.fillRect(size * 0.35, size * 0.3, size * 0.3, size * 0.45)
  const subject = tidySubjectMask(selectSubjectAuto(canvas).mask, size, size)
  assert.ok(subject[Math.round(size * 0.5) * size + Math.round(size * 0.5)] > 127, 'the block is selected')
  assert.equal(subject[2 * size + 2], 0, 'the corner is not')
  const boxed = objectSelectRect(canvas, { x: 16, y: 12, width: 32, height: 44 }, 40)
  assert.ok(boxed.mask[40 * size + 32] > 127, 'and the boxed selection finds it too')
})

/** Mean |Laplacian| over the pixels `pick` accepts: how much detail is there. */
function detail(canvas, pick) {
  const { width, height } = canvas
  const d = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const grey = (i) => d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114
  let sum = 0
  let n = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!pick(x, y)) continue
      const i = y * width + x
      sum += Math.abs(4 * grey(i) - grey(i - 1) - grey(i + 1) - grey(i - width) - grey(i + width))
      n += 1
    }
  }
  return n ? sum / n : 0
}

test('a content-aware fill rebuilds texture rather than smearing a flat patch', () => {
  const size = 96
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  // Foliage-like: a smooth ramp of light with fine grain over it, which is what
  // averaging every overlapping patch flattens out.
  withSeededRandom(11, () => {
    const image = ctx.createImageData(size, size)
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const ramp = 70 + (110 * (x + y)) / (2 * size)
        const grain = (Math.sin(x * 1.7) + Math.cos(y * 2.3)) * 18 + (Math.random() - 0.5) * 46
        const v = Math.max(0, Math.min(255, ramp + grain))
        const i = (y * size + x) * 4
        image.data[i] = v
        image.data[i + 1] = Math.round(v * 0.82)
        image.data[i + 2] = Math.round(v * 0.6)
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  })
  const hole = { x: 36, y: 36, w: 24, h: 24 }
  const mask = new Uint8Array(size * size)
  for (let y = hole.y; y < hole.y + hole.h; y += 1) for (let x = hole.x; x < hole.x + hole.w; x += 1) mask[y * size + x] = 255

  patchFill(canvas, mask, { randomSeed: 4242 })

  const inside = (x, y) => x >= hole.x + 4 && x < hole.x + hole.w - 4 && y >= hole.y + 4 && y < hole.y + hole.h - 4
  const outside = (x, y) => !inside(x, y) && x > 8 && y > 8 && x < size - 8 && y < size - 8
  const filled = detail(canvas, inside)
  const around = detail(canvas, outside)
  /*
   * On this texture, averaging every overlapping patch scores 0.71 and the
   * present code 1.59 — a fill of copied grain reads as slightly busier than
   * its surroundings. The band catches both regressions: back to a blur, and
   * forward into noise or patch seams.
   */
  const kept = filled / around
  assert.ok(kept > 1.1, `the fill kept only ${kept.toFixed(2)} of the detail around it — back to averaging?`)
  assert.ok(kept < 3, `the fill is ${kept.toFixed(2)}x busier than its surroundings — seams or noise?`)
})

/* ------------------------------------------------- the engine preferences */

test('the engine numbers are settings, not constants buried in the algorithms', () => {
  // Each one has to exist, be clamped on load, reach the Engine page, and be
  // handed to the function that uses it.
  const reach = {
    fillRounds: 'patchFill',
    fillIterations: 'patchFill',
    grabCutIterations: 'grabCutSelection',
    subjectKeepRatio: 'tidySubjectMask',
    skyStep: 'selectSky',
    skyDrift: 'selectSky',
    skyHorizon: 'selectSky',
  }
  const settingsSource = readFileSync(path.join(root, 'src', 'lib', 'settings.ts'), 'utf8')
  const dialogSource = readFileSync(path.join(root, 'src', 'dialogs.tsx'), 'utf8')
  const page = dialogSource.slice(dialogSource.indexOf("settingsTab === 'engine'"), dialogSource.indexOf('dialog-actions settings-actions'))
  for (const [key, user] of Object.entries(reach)) {
    assert.ok(defaultSettings[key] !== undefined, `${key} has no default`)
    assert.match(settingsSource, new RegExp(`${key}: \\[`), `${key} is not clamped when settings are loaded`)
    assert.ok(page.includes(key), `${key} has no control on the Engine page`)
    assert.ok(appSource.includes(`${user}(`), `${key} is read but ${user}() is never called`)
  }
  assert.ok(defaultSettings.subjectTidy === true, 'tidying is off by default')
  assert.ok(page.includes('subjectTidy'), 'the tidy switch is missing from the Engine page')
})

test('the Engine page is a tab of its own and is named in both languages', () => {
  const dialogSource = readFileSync(path.join(root, 'src', 'dialogs.tsx'), 'utf8')
  assert.match(dialogSource, /const tabs = \[[^\]]*'engine'[^\]]*\] as const/, 'engine is not one of the settings tabs')
  const i18nSource = readFileSync(path.join(root, 'src', 'i18n.ts'), 'utf8')
  for (const key of ['settingsTabEngine', 'engineIntro', 'engineSectionFill', 'engineSectionSubject', 'engineSectionSky', 'fillRoundsHint', 'subjectKeepRatioHint', 'skyHint']) {
    assert.equal((i18nSource.match(new RegExp(`\\b${key}:`, 'g')) ?? []).length, 2, `${key} is not written in both Korean and English`)
  }
})

test('the engine settings actually change what the engine does', () => {
  const size = 96
  const sky = selectSky(terrace(size), { step: 26, drift: 96, horizon: 1.3 })
  const strict = selectSky(terrace(size), { step: 4, drift: 20, horizon: 1 })
  const count = (selection) => selection.mask.reduce((n, v) => n + (v > 127 ? 1 : 0), 0)
  assert.ok(count(strict) < count(sky), 'tightening the sky gates selected just as much')

  const width = 64
  const height = 64
  const mask = new Uint8Array(width * height)
  for (let y = 10; y < 50; y += 1) for (let x = 12; x < 40; x += 1) mask[y * width + x] = 255
  for (let y = 4; y < 14; y += 1) for (let x = 48; x < 60; x += 1) mask[y * width + x] = 255
  const loose = tidySubjectMask(mask, width, height, 0.02)
  const strictest = tidySubjectMask(mask, width, height, 1)
  assert.ok(strictest[8 * width + 52] === 0, 'keeping only the biggest piece kept the smaller one too')
  assert.ok(loose[8 * width + 52] > 127, 'a low ratio dropped a piece it should have kept')
})

/* ------------------------------------------------------------- the bundle */

test('the OpenCV node-builtin stub applies to OpenCV and to nothing else', async () => {
  const { opencvNodeBuiltins } = await import('../vite.config.ts')
  const plugin = opencvNodeBuiltins()
  const resolve = plugin.resolveId.bind(plugin)
  const fromCv = 'C:/project/node_modules/@techstark/opencv-js/dist/opencv.js'
  // Emscripten's Node branches: resolved away, so the bundler neither warns
  // nor leaves an externalised builtin that throws when something reaches it.
  for (const builtin of ['fs', 'path', 'crypto', 'node:fs']) {
    assert.equal(typeof resolve(builtin, fromCv), 'string', `${builtin} is still externalised for OpenCV`)
  }
  // Everything else is left alone, including OpenCV's own modules.
  assert.equal(resolve('fs', 'C:/project/src/App.tsx'), null, 'the stub escaped OpenCV')
  assert.equal(resolve('react', fromCv), null, 'the stub swallowed a real dependency')
  assert.equal(resolve('./opencv_js.js', fromCv), null, 'the stub swallowed an OpenCV module')
  assert.equal(plugin.load('\0opencv-node-builtin-stub'), 'export default {}')
  assert.equal(plugin.load('C:/project/src/App.tsx'), null, 'the stub loaded a real file')
})

test('the linter covers the scripts and the tests, not only the app source', () => {
  const config = readFileSync(path.join(root, 'eslint.config.js'), 'utf8')
  assert.match(config, /files: \['\*\*\/\*\.mjs'\]/, 'the .mjs files are outside the lint again')
  assert.match(config, /'no-shadow': 'error'/, 'no-shadow is off — a shadowed helper once killed a whole verification run')
})
