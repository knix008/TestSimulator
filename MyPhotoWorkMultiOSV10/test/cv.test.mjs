// The OpenCV-backed commands and the pure-TypeScript PatchMatch and Poisson
// maths: alignment finds a known shift and turn, stitching widens the frame,
// exposure fusion keeps the mid-tones, GrabCut cuts out a box, the photo
// finder cuts tilted prints off a scanner bed, and a hole is filled with the
// texture around it rather than a smear.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  alignChain, applyHomography, bilateralDenoise, blendAligned, exposureFusion, findHomography, findPhotosOnScan, grabCutSelection, inpaintCanvas, invertHomography, loadCv, stitchCanvases, warpCanvas,
} from '../src/lib/cv.ts'
import { patchFill, poissonBlend } from '../src/lib/inpaint.ts'
import { canvasOf, px } from './helpers/pixels.mjs'

/** A textured scene with two landmarks, shifted by (dx, dy) and scaled in brightness. */
function scene(width, height, dx = 0, dy = 0, gain = 1) {
  const canvas = canvasOf(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const sx = x - dx
      const sy = y - dy
      // A blocky random texture (a hash of the 4px cell), so every patch is distinct.
      const cell = (Math.floor(sx / 4) * 73856093) ^ (Math.floor(sy / 4) * 19349663)
      let v = 50 + ((cell >>> 0) % 1000) / 1000 * 160
      if (sx > 40 && sx < 80 && sy > 30 && sy < 70) v = 230
      if ((sx - 110) ** 2 + (sy - 80) ** 2 < 200) v = 20
      image.data[i] = Math.min(255, v * gain); image.data[i + 1] = Math.min(255, v * 0.8 * gain); image.data[i + 2] = Math.min(255, v * 0.6 * gain); image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

test('OpenCV loads once and is shared', async () => {
  const a = await loadCv()
  const b = await loadCv()
  assert.equal(a, b)
  assert.equal(typeof a.Mat, 'function')
})

test('alignment recovers the shift between two frames, and a turn when asked for perspective', async () => {
  const fixed = scene(160, 120)
  const moved = scene(160, 120, 12, -7)
  const h = await findHomography(fixed, moved, 'translation')
  assert.ok(h, 'no transform found')
  assert.ok(Math.abs(h[2] + 12) <= 1.5 && Math.abs(h[5] - 7) <= 1.5, `expected a shift of about (-12, 7), got (${h[2].toFixed(1)}, ${h[5].toFixed(1)})`)

  // The moving frame turned a few degrees: a perspective fit brings its corner back.
  const turned = canvasOf(160, 120)
  const tctx = turned.getContext('2d')
  tctx.translate(80, 60); tctx.rotate((4 * Math.PI) / 180); tctx.translate(-80, -60)
  tctx.drawImage(fixed, 0, 0)
  const p = await findHomography(fixed, turned, 'perspective')
  assert.ok(p, 'no perspective transform found')
  const back = applyHomography(p, applyHomography(invertHomography(p), { x: 60, y: 50 }))
  assert.ok(Math.abs(back.x - 60) < 0.01 && Math.abs(back.y - 50) < 0.01, 'the inverse does not undo the transform')
  const centre = applyHomography(p, { x: 80, y: 60 })
  assert.ok(Math.abs(centre.x - 80) < 3 && Math.abs(centre.y - 60) < 3, `the centre of a turn should stay put, got (${centre.x.toFixed(1)}, ${centre.y.toFixed(1)})`)
  const corner = applyHomography(p, { x: 80 + 50 * Math.cos((4 * Math.PI) / 180), y: 60 + 50 * Math.sin((4 * Math.PI) / 180) })
  assert.ok(Math.abs(corner.x - 130) < 3 && Math.abs(corner.y - 60) < 3, `a turned point should come back level, got (${corner.x.toFixed(1)}, ${corner.y.toFixed(1)})`)
})

test('a chain of frames is brought into the first frame, and the panorama is wider than one', async () => {
  const frames = [scene(160, 120), scene(160, 120, -50, 0), scene(160, 120, -100, 0)]
  const chain = await alignChain(frames, 'translation')
  assert.deepEqual(chain[0], [1, 0, 0, 0, 1, 0, 0, 0, 1])
  assert.ok(Math.abs(chain[2][2] - 100) <= 3, `the third frame sits about 100px along, got ${chain[2][2].toFixed(1)}`)
  const { canvas, placements } = await stitchCanvases(frames, 'translation', true)
  assert.ok(canvas.width >= 250 && canvas.width <= 270, `the panorama should be about 260 wide, got ${canvas.width}`)
  assert.equal(placements.length, 3)
  assert.ok(placements[2].x > placements[1].x && placements[1].x > placements[0].x)
  assert.equal(px(canvas, 130, 60)[3], 255, 'the overlap is left transparent')

  const warped = await warpCanvas(frames[0], [1, 0, 20, 0, 1, 0, 0, 0, 1], 200, 120)
  assert.equal(px(warped, 5, 5)[3], 0, 'the uncovered strip should be transparent')
  assert.equal(px(warped, 60, 50)[3], 255)
})

test('blending aligned frames weights each by its depth inside its own picture', async () => {
  const left = canvasOf(100, 40)
  left.getContext('2d').fillStyle = '#ff0000'
  left.getContext('2d').fillRect(0, 0, 60, 40)
  const right = canvasOf(100, 40)
  right.getContext('2d').fillStyle = '#0000ff'
  right.getContext('2d').fillRect(40, 0, 60, 40)
  const { merged, perLayer } = await blendAligned([left, right])
  assert.ok(px(merged, 10, 20)[0] > 240, 'far from the seam the left picture is untouched')
  assert.ok(px(merged, 90, 20)[2] > 240, 'far from the seam the right picture is untouched')
  const mid = px(merged, 50, 20)
  assert.ok(mid[0] > 60 && mid[2] > 60, `the middle of the overlap is a mix, got ${mid.slice(0, 3)}`)
  assert.equal(perLayer.length, 2)
  assert.ok(px(perLayer[0], 55, 20)[3] < px(perLayer[0], 10, 20)[3], 'the per-layer alpha does not fade towards the seam')
})

test('exposure fusion takes each pixel from the exposures that show it well', async () => {
  const frames = [scene(120, 90, 0, 0, 0.3), scene(120, 90), scene(120, 90, 0, 0, 3)]
  const fused = await exposureFusion(frames)
  assert.equal(fused.width, 120)
  const bright = px(fused, 60, 50)
  const dark = px(fused, 110, 80)
  assert.ok(bright[0] > 150 && bright[0] < 255, `the bright rectangle should be light but not clipped, got ${bright[0]}`)
  assert.ok(dark[0] < 110, `the dark blob should stay dark, got ${dark[0]}`)
})

test('GrabCut cuts the object out of the box that surrounds it', async () => {
  const canvas = canvasOf(120, 100)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#204060'
  ctx.fillRect(0, 0, 120, 100)
  ctx.fillStyle = '#f0c040'
  ctx.beginPath()
  ctx.ellipse(60, 50, 25, 18, 0, 0, Math.PI * 2)
  ctx.fill()
  const selection = await grabCutSelection(canvas, { x: 25, y: 22, width: 70, height: 56 }, 4)
  assert.equal(selection.kind, 'mask')
  assert.equal(selection.mask[50 * 120 + 60], 255, 'the ellipse centre is selected')
  assert.equal(selection.mask[50 * 120 + 30], 0, 'the box corner background is not')
  assert.equal(selection.mask[10 * 120 + 10], 0, 'outside the box is not')
  let area = 0
  for (const v of selection.mask) if (v) area += 1
  assert.ok(area > 1100 && area < 1700, `the mask should be about the ellipse's area (~1400), got ${area}`)
})

test('the photo finder lifts tilted prints off a scanner bed and turns them upright', async () => {
  const scan = canvasOf(240, 180)
  const ctx = scan.getContext('2d')
  ctx.fillStyle = '#f4f4f0'
  ctx.fillRect(0, 0, 240, 180)
  const print = (cx, cy, w, h, angle, color) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((angle * Math.PI) / 180)
    ctx.fillStyle = color
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.restore()
  }
  print(70, 90, 80, 60, 8, '#3060a0')
  print(175, 90, 60, 90, -5, '#a04030')
  const photos = await findPhotosOnScan(scan)
  assert.equal(photos.length, 2, `expected two prints, found ${photos.length}`)
  const first = photos.find((photo) => photo.width > photo.height)
  assert.ok(first && Math.abs(first.width - 80) <= 3 && Math.abs(first.height - 60) <= 3, `the wide print should be about 80x60, got ${photos.map((p) => `${p.width}x${p.height}`).join(', ')}`)
  const tall = photos.find((photo) => photo.height > photo.width)
  assert.ok(tall && Math.abs(tall.width - 60) <= 3 && Math.abs(tall.height - 90) <= 3, `the tall print should be about 60x90, got ${tall?.width}x${tall?.height}`)
  assert.deepEqual(px(first, 40, 30).slice(0, 3), [48, 96, 160], 'the print is not the blue one')
  const corner = px(first, 3, 3)
  assert.ok(corner[0] < 80 && corner[2] > 120, 'the corner should be print, not bed, once levelled')
})

test('Telea inpainting fills a hole from its surroundings', async () => {
  const canvas = canvasOf(60, 60)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#80a0c0'
  ctx.fillRect(0, 0, 60, 60)
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(25, 25, 10, 10)
  const mask = new Uint8Array(60 * 60)
  for (let y = 24; y < 36; y += 1) for (let x = 24; x < 36; x += 1) mask[y * 60 + x] = 255
  await inpaintCanvas(canvas, mask, 4)
  const centre = px(canvas, 30, 30)
  assert.ok(centre[0] < 140 && centre[2] > 170, `the red blot should be gone, got ${centre.slice(0, 3)}`)
  assert.equal(centre[3], 255)

  // The bilateral denoiser flattens noise and keeps an edge.
  const noisy = canvasOf(40, 40)
  const nctx = noisy.getContext('2d')
  const image = nctx.createImageData(40, 40)
  let seed = 7
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const base = (i / 4) % 40 < 20 ? 60 : 200
    const noise = (seed % 41) - 20
    image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, base + noise)); image.data[i + 3] = 255
  }
  nctx.putImageData(image, 0, 0)
  await bilateralDenoise(noisy, 80)
  const values = []
  for (let x = 2; x < 18; x += 1) values.push(px(noisy, x, 20)[0])
  const spread = Math.max(...values) - Math.min(...values)
  assert.ok(spread < 12, `the flat side should be smooth, spread ${spread}`)
  assert.ok(px(noisy, 19, 20)[0] < 110 && px(noisy, 21, 20)[0] > 150, 'the edge should survive')
})

test('PatchMatch fills a hole with the texture around it, not a flat smear', () => {
  // A stripe texture with a hole in the middle: the fill must continue the stripes.
  const size = 64
  const canvas = canvasOf(size, size)
  const ctx = canvas.getContext('2d')
  for (let y = 0; y < size; y += 1) {
    ctx.fillStyle = y % 8 < 4 ? '#202020' : '#e0e0e0'
    ctx.fillRect(0, y, size, 1)
  }
  const mask = new Uint8Array(size * size)
  for (let y = 20; y < 44; y += 1) for (let x = 20; x < 44; x += 1) mask[y * size + x] = 255
  patchFill(canvas, mask, { iterations: 4 })
  // Every filled row should be close to the stripe it belongs to.
  let wrong = 0
  let total = 0
  for (let y = 20; y < 44; y += 1) {
    for (let x = 20; x < 44; x += 1) {
      const expected = y % 8 < 4 ? 32 : 224
      const got = px(canvas, x, y)[0]
      total += 1
      if (Math.abs(got - expected) > 60) wrong += 1
    }
  }
  assert.ok(wrong / total < 0.15, `${wrong} of ${total} filled pixels do not continue the stripes`)
  assert.equal(px(canvas, 10, 10)[0], 32, 'pixels outside the hole are untouched')
})

test('Poisson blending makes a pasted patch meet its background at the edge', () => {
  const size = 48
  const background = canvasOf(size, size)
  const bctx = background.getContext('2d')
  const ramp = bctx.createLinearGradient(0, 0, size, 0)
  ramp.addColorStop(0, '#202020')
  ramp.addColorStop(1, '#e0e0e0')
  bctx.fillStyle = ramp
  bctx.fillRect(0, 0, size, size)
  const layer = canvasOf(size, size)
  const lctx = layer.getContext('2d')
  lctx.fillStyle = '#ff0000'
  lctx.fillRect(12, 12, 24, 24)
  lctx.fillStyle = '#ffffff'
  lctx.fillRect(22, 22, 4, 4)
  const blended = poissonBlend(layer, background)
  assert.equal(px(blended, 5, 5)[3], 0, 'outside the patch stays transparent')
  const edge = px(blended, 13, 24)
  const behind = px(background, 12, 24)
  assert.ok(Math.abs(edge[0] - behind[0]) < 40 && Math.abs(edge[2] - behind[2]) < 40, `the edge should match the background, got ${edge.slice(0, 3)} against ${behind.slice(0, 3)}`)
  const inner = px(blended, 24, 24)
  const around = px(blended, 24, 18)
  assert.ok(inner[1] - around[1] > 40, 'the patch keeps its own detail (the white spot stays brighter than its surround)')
  const leftIn = px(blended, 14, 30)[0]
  const rightIn = px(blended, 34, 30)[0]
  assert.ok(rightIn > leftIn + 40, 'the background ramp flows across the patch')
})

test('the OpenCV chunk is loaded lazily, never in the editor\'s own bundle', () => {
  const cvSource = readFileSync(fileURLToPath(new URL('../src/lib/cv.ts', import.meta.url)), 'utf8')
  assert.match(cvSource, /import\('@techstark\/opencv-js'\)/, 'OpenCV is imported statically, which puts 13MB in the first paint')
  assert.ok(!/^import .* from '@techstark\/opencv-js'/m.test(cvSource))
  assert.match(cvSource, /for \(const mat of owned\.reverse\(\)\) mat\.delete\(\)/, 'Mats are not freed')
})
