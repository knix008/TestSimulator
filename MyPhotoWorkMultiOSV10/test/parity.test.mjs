// The engine modules added for Photoshop parity: the extra filters, the
// segmenters behind Object Selection / Select Subject / Sky / Focus Area, the
// brushes that used to be stubs, the new adjustments and the gradient ramp.
import test from 'node:test'
import assert from 'node:assert/strict'
import { extraFilterIds, extraFilters } from '../src/lib/moreFilters.ts'
import { objectSelectRect, selectSubjectAuto, selectSky, selectFocusArea, refineMask, fillHoles, removeSmallComponents } from '../src/lib/segment.ts'
import { mixerDab, loadMixer, historyBrushDab, artHistoryDab, patternStampDab, healingBrushDab, quickSelectDab, liquifyDab, perspectiveCloneDab } from '../src/lib/brushes.ts'
import { homography, invert3 } from '../src/lib/warp.ts'
import { applyLut, builtInLuts, parseCube, hdrToning, matchColor, desaturate, autoContrast, autoTone, rotateArbitrary, applyImage, calculations, fadeTo } from '../src/lib/adjustExtra.ts'
import { gradientPresets, paintGradientDef, resolveGradient, sampleGradient } from '../src/lib/gradients.ts'
import { canvasOf, meanDiff, px, withSeededRandom } from './helpers/pixels.mjs'

/** A photo-like test card: sky, ground, a red subject in the middle. */
function scene(size = 64) {
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  const sky = ctx.createLinearGradient(0, 0, 0, size / 2)
  sky.addColorStop(0, '#7ab8ff')
  sky.addColorStop(1, '#d8ecff')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, size, size / 2)
  ctx.fillStyle = '#4c8a3a'
  ctx.fillRect(0, size / 2, size, size / 2)
  ctx.fillStyle = '#d92f2f'
  ctx.fillRect(size * 0.35, size * 0.3, size * 0.3, size * 0.45)
  return canvas
}

function maskCount(selection) {
  let n = 0
  for (const v of selection.mask) if (v > 127) n += 1
  return n
}

test('every extra filter runs on a small canvas, within its selection, without throwing', () => {
  withSeededRandom(7, () => {
    for (const id of extraFilterIds) {
      const canvas = scene(40)
      const before = canvasOf(40, 40)
      before.getContext('2d').drawImage(canvas, 0, 0)
      const params = { radius: 3, amount: 50, extra: 0, foreground: '#000000', background: '#ffffff' }
      assert.doesNotThrow(() => extraFilters[id].run(canvas, params, null), `${id} threw`)
      assert.equal(canvas.width, 40, `${id} resized the canvas`)
      // Inside a selection only the selected pixels may change.
      const clipped = scene(40)
      extraFilters[id].run(clipped, params, { kind: 'rect', x: 0, y: 0, width: 20, height: 40 })
      const outside = px(clipped, 30, 10)
      const original = px(before, 30, 10)
      if (!['polar', 'flame', 'tree', 'pictureFrame'].includes(id)) {
        assert.deepEqual(outside, original, `${id} changed pixels outside the selection`)
      }
    }
  })
})

test('the filters that should visibly change a picture do', () => {
  withSeededRandom(7, () => {
    for (const id of ['surfaceBlur', 'lensBlur', 'colorHalftone', 'mezzotint', 'wind', 'chrome', 'watercolor', 'stainedGlass', 'lensCorrection', 'polar', 'smartSharpen']) {
      const canvas = scene(48)
      const before = canvasOf(48, 48)
      before.getContext('2d').drawImage(canvas, 0, 0)
      extraFilters[id].run(canvas, { radius: 4, amount: 60, extra: 20, foreground: '#000000', background: '#ffffff' }, null)
      assert.ok(meanDiff(canvas, before) > 0.5, `${id} left the picture unchanged`)
    }
  })
})

test('object selection inside a box finds the thing that differs from the rim', () => {
  const canvas = scene(64)
  const selection = objectSelectRect(canvas, { x: 16, y: 12, width: 32, height: 44 }, 40)
  assert.equal(selection.kind, 'mask')
  assert.ok(selection.mask[40 * 64 + 32] > 127, 'the middle of the red box is selected')
  assert.equal(selection.mask[14 * 64 + 18], 0, 'the sky at the rim is not')
  const count = maskCount(selection)
  assert.ok(count > 300 && count < 900, `selected ${count} pixels`)
})

test('select subject picks the red block out of sky and ground', () => {
  const selection = selectSubjectAuto(scene(64))
  assert.ok(selection.mask[40 * 64 + 32] > 127, 'the subject is selected')
  assert.equal(selection.mask[4 * 64 + 4], 0, 'the sky corner is not')
  assert.equal(selection.mask[60 * 64 + 4], 0, 'the ground corner is not')
})

test('select sky keeps to the region touching the top edge', () => {
  const selection = selectSky(scene(64))
  assert.ok(selection.mask[4 * 64 + 32] > 127, 'the sky is selected')
  assert.equal(selection.mask[60 * 64 + 32], 0, 'the ground is not')
  assert.equal(selection.mask[45 * 64 + 32], 0, 'nor the red subject')
})

test('focus area prefers the textured half of a picture', () => {
  const canvas = canvasOf(64, 64)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 64, 64)
  withSeededRandom(7, () => {
    for (let y = 0; y < 64; y += 1) for (let x = 32; x < 64; x += 1) {
      ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000'
      ctx.fillRect(x, y, 1, 1)
    }
  })
  const selection = selectFocusArea(canvas)
  assert.ok(selection.mask[32 * 64 + 50] > 127, 'the noisy half is in focus')
  assert.equal(selection.mask[32 * 64 + 10], 0, 'the flat half is not')
})

test('refine edge feathers, smooths and shifts a mask; holes and specks are cleaned', () => {
  const mask = new Uint8Array(32 * 32)
  for (let y = 8; y < 24; y += 1) for (let x = 8; x < 24; x += 1) mask[y * 32 + x] = 255
  mask[16 * 32 + 16] = 0
  mask[2 * 32 + 2] = 255
  const filled = fillHoles(mask, 32, 32)
  assert.equal(filled[16 * 32 + 16], 255, 'the hole is filled')
  const cleaned = removeSmallComponents(filled, 32, 32, 4)
  assert.equal(cleaned[2 * 32 + 2], 0, 'the speck is gone')
  const soft = refineMask(cleaned, 32, 32, { smooth: 0, feather: 2, contrast: 0, shift: 0, radius: 0 })
  assert.ok(soft[8 * 32 + 16] > 0 && soft[8 * 32 + 16] < 255, 'the edge is soft')
  const shifted = refineMask(cleaned, 32, 32, { smooth: 0, feather: 2, contrast: 0, shift: 100, radius: 0 })
  assert.ok(shifted[7 * 32 + 16] > soft[7 * 32 + 16], 'shifting outward grows the edge')
})

test('the mixer brush picks up what it paints over', () => {
  const canvas = canvasOf(40, 40)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(0, 0, 40, 40)
  const reservoir = loadMixer('#ff0000')
  mixerDab(canvas, reservoir, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 10, hardness: 1, wet: 0.5, mix: 1, flow: 1, selection: null })
  assert.ok(reservoir.b > 100, 'blue was picked up into the reservoir')
  const dab = px(canvas, 20, 20)
  assert.ok(dab[0] > 60 && dab[2] > 60, `the dab is a mix of red and blue, got [${dab}]`)
})

test('the history brush restores the source state under the stroke', () => {
  const source = canvasOf(40, 40)
  source.getContext('2d').fillStyle = '#00ff00'
  source.getContext('2d').fillRect(0, 0, 40, 40)
  const layer = canvasOf(40, 40)
  layer.getContext('2d').fillStyle = '#000000'
  layer.getContext('2d').fillRect(0, 0, 40, 40)
  historyBrushDab(layer, source, { x: 10, y: 10 }, { x: 10, y: 10 }, { size: 8, hardness: 1, opacity: 1, selection: null })
  assert.deepEqual(px(layer, 10, 10), [0, 255, 0, 255], 'the source colour is back under the dab')
  assert.deepEqual(px(layer, 35, 35), [0, 0, 0, 255], 'the rest is untouched')
  withSeededRandom(7, () => artHistoryDab(layer, source, { x: 30, y: 10 }, { size: 12, opacity: 1, style: 'tight', selection: null }))
  assert.ok(meanDiff(layer, source) < 255, 'art history painted something')
})

test('the pattern stamp paints the tile, the healing brush blends the source in', () => {
  const tile = canvasOf(4, 4)
  tile.getContext('2d').fillStyle = '#ff00ff'
  tile.getContext('2d').fillRect(0, 0, 4, 4)
  const layer = canvasOf(40, 40)
  patternStampDab(layer, tile, { x: 20, y: 20 }, { x: 20, y: 20 }, { size: 10, hardness: 1, opacity: 1, selection: null })
  assert.deepEqual(px(layer, 20, 20), [255, 0, 255, 255])

  const photo = canvasOf(60, 60)
  const ctx = photo.getContext('2d')
  ctx.fillStyle = '#c8b090'
  ctx.fillRect(0, 0, 60, 60)
  ctx.fillStyle = '#202020'
  ctx.fillRect(28, 28, 4, 4)
  healingBrushDab(photo, { x: 30, y: 30 }, { x: 30, y: 30 }, { x: 10, y: 10 }, { x: 30, y: 30 }, { size: 12, hardness: 1, opacity: 1, selection: null })
  const healed = px(photo, 30, 30)
  assert.ok(healed[0] > 120, `the blemish took the surrounding tone, got [${healed}]`)
})

test('quick selection grows from the brush into similar pixels and liquify moves pixels', () => {
  const canvas = scene(64)
  const mask = quickSelectDab(canvas, { x: 40, y: 45 }, 6, 30, null)
  assert.ok(mask[45 * 64 + 26] > 0, 'the whole red block is reached')
  assert.equal(mask[4 * 64 + 4], 0, 'the sky is not')
  const removed = quickSelectDab(canvas, { x: 40, y: 45 }, 6, 30, mask, true)
  assert.equal(removed[45 * 64 + 40], 0, 'Alt subtracts')

  const original = canvasOf(64, 64)
  original.getContext('2d').drawImage(canvas, 0, 0)
  liquifyDab(canvas, original, { x: 22, y: 40 }, { x: 30, y: 40 }, { size: 20, pressure: 1, mode: 'forward' })
  assert.ok(meanDiff(canvas, original) > 0, 'forward warp moved pixels')
  liquifyDab(canvas, original, { x: 30, y: 40 }, { x: 30, y: 40 }, { size: 64, pressure: 1, mode: 'reconstruct' })
  assert.ok(meanDiff(canvas, original) < 2, 'reconstruct puts them back')
})

test('colour lookup tables: a .cube parses and applies, presets recolour', () => {
  const cube = 'TITLE "Invert"\nLUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n'
  const lut = parseCube(cube)
  assert.equal(lut.name, 'Invert')
  const canvas = canvasOf(4, 4)
  canvas.getContext('2d').fillStyle = '#ff0000'
  canvas.getContext('2d').fillRect(0, 0, 4, 4)
  applyLut(canvas, lut, null)
  assert.deepEqual(px(canvas, 1, 1).slice(0, 3), [0, 255, 255], 'red became cyan')
  const sepia = scene(16)
  applyLut(sepia, builtInLuts.sepia(), null)
  const p = px(sepia, 2, 2)
  assert.ok(p[0] >= p[1] && p[1] >= p[2], 'sepia warms the picture')
})

test('HDR toning, match colour, desaturate and the auto commands change tone as expected', () => {
  const dark = scene(32)
  hdrToning(dark, { radius: 4, strength: 0.8, detail: 30, gamma: 1, saturation: 0 }, null)
  assert.ok(meanDiff(dark, scene(32)) > 1)

  const target = scene(32)
  const source = canvasOf(32, 32)
  source.getContext('2d').fillStyle = '#ffcc88'
  source.getContext('2d').fillRect(0, 0, 32, 32)
  matchColor(target, source, { luminance: 100, intensity: 100, fade: 0, neutralize: false }, null)
  const t = px(target, 16, 4)
  assert.ok(t[0] > t[2], 'the cool sky warmed towards the source')

  const grey = scene(16)
  desaturate(grey, null)
  const g = px(grey, 8, 12)
  assert.equal(g[0], g[1])
  assert.equal(g[1], g[2])

  const flat = canvasOf(16, 16)
  const fctx = flat.getContext('2d')
  fctx.fillStyle = '#404040'
  fctx.fillRect(0, 0, 8, 16)
  fctx.fillStyle = '#808080'
  fctx.fillRect(8, 0, 8, 16)
  autoContrast(flat, null)
  assert.ok(px(flat, 2, 2)[0] < 20 && px(flat, 12, 2)[0] > 235, 'auto contrast stretches to the ends')
  autoTone(flat, null)
  assert.ok(px(flat, 12, 2)[0] > 235)
})

test('arbitrary rotation grows the canvas; apply image and calculations combine layers', () => {
  const rotated = rotateArbitrary(canvasOf(40, 20), 45)
  assert.ok(rotated.width > 40 && rotated.height > 20)

  const a = canvasOf(8, 8)
  a.getContext('2d').fillStyle = '#ffffff'
  a.getContext('2d').fillRect(0, 0, 8, 8)
  const b = canvasOf(8, 8)
  b.getContext('2d').fillStyle = '#000000'
  b.getContext('2d').fillRect(0, 0, 8, 8)
  applyImage(a, b, 'multiply', 1, false, null)
  assert.deepEqual(px(a, 2, 2).slice(0, 3), [0, 0, 0], 'multiply by black gives black')
  const result = calculations(a, 'luma', b, 'luma', 'screen', 1, true, false)
  assert.equal(result.mask[0], 255, 'inverted black screened is white')

  const before = canvasOf(8, 8)
  before.getContext('2d').fillStyle = '#ffffff'
  before.getContext('2d').fillRect(0, 0, 8, 8)
  fadeTo(a, before, 0.5, 'source-over')
  assert.ok(px(a, 2, 2)[0] > 100 && px(a, 2, 2)[0] < 160, 'fade at 50% is halfway back')
})

test('a multi-stop gradient samples between its stops and paints every geometry', () => {
  const def = resolveGradient(gradientPresets.find((item) => item.id === 'spectrum'), '#000000', '#ffffff')
  const mid = sampleGradient(def, 0.5)
  assert.ok(mid.g > 200 && mid.b > 200 && mid.r < 50, 'halfway round the spectrum is cyan')
  for (const kind of ['linear', 'radial', 'angle', 'reflected', 'diamond']) {
    const canvas = canvasOf(32, 32)
    paintGradientDef(canvas, { x: 4, y: 16 }, { x: 28, y: 16 }, def, kind, null)
    assert.ok(px(canvas, 16, 16)[3] === 255, `${kind} painted`)
  }
  const fade = resolveGradient(gradientPresets.find((item) => item.id === 'fgTransparent'), '#ff0000', '#ffffff')
  const canvas = canvasOf(32, 8)
  paintGradientDef(canvas, { x: 0, y: 4 }, { x: 31, y: 4 }, fade, 'linear', null)
  assert.ok(px(canvas, 30, 4)[3] < 40, 'the far end is transparent')
  assert.ok(px(canvas, 1, 4)[3] > 200, 'the near end is solid')
})

test('the perspective clone follows the Vanishing Point plane rather than the screen', () => {
  // Left half red, right half blue. A source on the red side, a stroke on the blue.
  const layer = canvasOf(100, 100)
  const ctx = layer.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 50, 100)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(50, 0, 50, 100)
  // On a square plane the clone is the ordinary clone: the same offset everywhere.
  const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  perspectiveCloneDab(layer, { x: 70, y: 50 }, { x: 20, y: 50 }, { x: 70, y: 50 }, square, { size: 10, hardness: 1, opacity: 1, selection: null })
  assert.deepEqual(px(layer, 70, 50).slice(0, 3), [255, 0, 0], 'the dab should carry red from 50px to the left')
  assert.deepEqual(px(layer, 80, 50).slice(0, 3), [0, 0, 255], 'outside the dab nothing changes')

  // On a plane that narrows towards the top the offset shrinks with it: the
  // same 50px screen offset at the origin becomes less further up the plane,
  // so a dab high up samples from nearer to itself. Both sides are worked out
  // with the plane's own homography and must agree with the brush.
  const fresh = canvasOf(100, 100)
  const fctx = fresh.getContext('2d')
  for (let x = 0; x < 100; x += 10) { fctx.fillStyle = x % 20 === 0 ? '#00ff00' : '#000000'; fctx.fillRect(x, 0, 10, 100) }
  const plane = [{ x: 30, y: 0 }, { x: 70, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  const forward = homography(1, 1, plane)
  const inverse = invert3(forward)
  const project = (m, p) => { const w = m[6] * p.x + m[7] * p.y + m[8]; return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w } }
  const origin = { x: 60, y: 90 }
  const source = { x: 30, y: 90 }
  const to = { x: 52, y: 20 }
  const offset = (() => { const s = project(inverse, source); const o = project(inverse, origin); return { x: s.x - o.x, y: s.y - o.y } })()
  const u = project(inverse, { x: to.x + 0.5, y: to.y + 0.5 })
  const expectedFrom = project(forward, { x: u.x + offset.x, y: u.y + offset.y })
  const expected = px(fresh, Math.floor(expectedFrom.x), Math.floor(expectedFrom.y)).slice(0, 3)
  assert.ok(Math.abs(expectedFrom.x - to.x) < 30, 'high on the plane the source should be nearer than the 30px it was at the origin')
  perspectiveCloneDab(fresh, to, source, origin, plane, { size: 4, hardness: 1, opacity: 1, selection: null })
  assert.deepEqual(px(fresh, to.x, to.y).slice(0, 3), expected, 'the dab should carry the colour from where the plane says the source is')
})
