// The neural pre- and post-processing, run against stand-in networks: a
// picture is packed the way the models want it, a saliency map becomes a
// selection, scene-parsing logits become the sky, a depth map drives the
// blur, an inpainting output lands only in the hole, and a super-resolution
// output is tiled back together without seams.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ADE_SKY, bestModelFor, depthBlur, modelSpecs, packPlanes, resizeMap, runDepth, runInpaint, runSky, runSubject, runUpscale, unpackPlanes } from '../src/lib/neural.ts'
import { formatBytes } from '../src/lib/models.ts'
import { canvasOf, px } from './helpers/pixels.mjs'

const spec = (id) => modelSpecs.find((entry) => entry.id === id)

/** A runner that computes its answer from the packed input. */
function fake(inputNames, outputNames, compute) {
  return { inputNames, outputNames, run: async (feeds) => compute(feeds) }
}

test('the model registry is consistent: unique ids, https sources, one best model per task', () => {
  const ids = modelSpecs.map((entry) => entry.id)
  assert.equal(new Set(ids).size, ids.length, 'a model id is repeated')
  for (const entry of modelSpecs) {
    assert.match(entry.url, /^https:\/\//, `${entry.id} is not fetched over https`)
    assert.ok(entry.bytes > 1e6, `${entry.id} has no size`)
    assert.ok(['subject', 'sky', 'depth', 'inpaint', 'upscale'].includes(entry.task))
    assert.equal(entry.mean.length, 3)
  }
  assert.equal(bestModelFor('subject', ['u2netp', 'silueta']).id, 'silueta', 'the better subject model should win')
  assert.equal(bestModelFor('subject', ['u2netp', 'isnet']).id, 'isnet')
  assert.equal(bestModelFor('sky', ['u2netp']), null, 'a subject model must not serve as a sky model')
  assert.equal(formatBytes(4574861), '5 MB')
  assert.equal(formatBytes(208044816), '208 MB')
})

test('a picture is packed into normalised planes and can be unpacked again', () => {
  const canvas = canvasOf(4, 2)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 2, 2)
  ctx.fillStyle = '#0000ff'
  ctx.fillRect(2, 0, 2, 2)
  const packed = packPlanes(canvas, 4, 2, [0, 0, 0], [1, 1, 1])
  assert.deepEqual(packed.dims, [1, 3, 2, 4])
  assert.equal(packed.data[0], 1, 'red plane, first pixel')
  assert.equal(packed.data[2], 0, 'red plane, third pixel is blue')
  assert.equal(packed.data[2 * 8 + 2], 1, 'blue plane, third pixel')
  const normalised = packPlanes(canvas, 4, 2, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5])
  assert.equal(normalised.data[0], 1)
  assert.equal(normalised.data[1 * 8], -1, 'green of a red pixel is (0 - 0.5) / 0.5')
  const back = unpackPlanes(packed, 255)
  assert.deepEqual(px(back, 0, 0).slice(0, 3), [255, 0, 0])
  assert.deepEqual(px(back, 3, 1).slice(0, 3), [0, 0, 255])

  const map = resizeMap(new Float32Array([0, 1, 0, 1]), 2, 2, 4, 4)
  assert.equal(map.length, 16)
  assert.ok(map[0] < 0.3 && map[3] > 0.7, 'the resized map keeps its left-to-right ramp')
})

test('Select Subject turns a saliency map into a selection, and Remove Background gets the soft alpha', async () => {
  const canvas = canvasOf(80, 60)
  const runner = fake(['input.1'], ['1959'], (feeds) => {
    const [, , h, w] = feeds['input.1'].dims
    const map = new Float32Array(w * h)
    // The network "finds" a rectangle in the middle, with a low floor elsewhere.
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) map[y * w + x] = x > w * 0.25 && x < w * 0.75 && y > h * 0.3 && y < h * 0.7 ? 0.9 : 0.1
    return { 1959: { data: map, dims: [1, 1, h, w] } }
  })
  const { selection, soft } = await runSubject(runner, spec('u2netp'), canvas)
  assert.equal(selection.kind, 'mask')
  assert.equal(selection.mask[30 * 80 + 40], 255, 'the middle is selected')
  assert.equal(selection.mask[5 * 80 + 5], 0, 'the corner is not')
  assert.equal(soft[30 * 80 + 40], 255, 'the soft alpha is stretched to full contrast')
  assert.equal(soft[5 * 80 + 5], 0)
  assert.ok(selection.width > 30 && selection.width < 50, `the box is about half the width, got ${selection.width}`)
})

test('Select Sky keeps the pixels the scene parser labels as sky', async () => {
  const canvas = canvasOf(64, 64)
  const runner = fake(['pixel_values'], ['logits'], () => {
    const classes = 150
    const side = 16
    const logits = new Float32Array(classes * side * side).fill(-10)
    for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) {
      // The top half is sky (class 2), the bottom half is class 4.
      const winner = y < side / 2 ? ADE_SKY : 4
      logits[winner * side * side + y * side + x] = 5
    }
    return { logits: { data: logits, dims: [1, classes, side, side] } }
  })
  const sky = await runSky(runner, spec('segformer'), canvas)
  assert.equal(sky.mask[5 * 64 + 32], 255, 'the top is sky')
  assert.equal(sky.mask[58 * 64 + 32], 0, 'the bottom is not')
})

test('the depth map is stretched to 0..1 and Depth Blur blurs the far side only', async () => {
  const canvas = canvasOf(64, 32)
  const ctx = canvas.getContext('2d')
  // Fine stripes everywhere: blur flattens them, sharpness keeps them.
  for (let x = 0; x < 64; x += 1) { ctx.fillStyle = x % 2 ? '#000000' : '#ffffff'; ctx.fillRect(x, 0, 1, 32) }
  const runner = fake(['pixel_values'], ['predicted_depth'], () => {
    const side = 8
    const depth = new Float32Array(side * side)
    // Left half near (large inverse depth), right half far.
    for (let y = 0; y < side; y += 1) for (let x = 0; x < side; x += 1) depth[y * side + x] = x < side / 2 ? 20 : 2
    return { predicted_depth: { data: depth, dims: [1, side, side] } }
  })
  const depth = await runDepth(runner, spec('depthAnything'), canvas)
  assert.equal(depth.length, 64 * 32)
  assert.ok(depth[16] > 0.9 && depth[50] < 0.1, `near should be 1 and far 0, got ${depth[16].toFixed(2)} / ${depth[50].toFixed(2)}`)
  depthBlur(canvas, depth, 4, 1)
  const contrast = (x) => Math.abs(px(canvas, x, 16)[0] - px(canvas, x + 1, 16)[0])
  assert.ok(contrast(10) > 200, 'the near side keeps its stripes')
  assert.ok(contrast(52) < 60, `the far side is blurred, contrast ${contrast(52)}`)
})

test('inpainting writes the network\'s answer into the hole and nowhere else', async () => {
  const canvas = canvasOf(100, 80)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#4080c0'
  ctx.fillRect(0, 0, 100, 80)
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(40, 30, 20, 20)
  const mask = new Uint8Array(100 * 80)
  for (let y = 30; y < 50; y += 1) for (let x = 40; x < 60; x += 1) mask[y * 100 + x] = 255
  let seenMask = null
  const runner = fake(['image', 'mask'], ['output'], (feeds) => {
    seenMask = feeds.mask
    const image = feeds.image
    const [, , h, w] = image.dims
    // The stand-in paints the hole green and hands everything else back, in 0..255.
    const out = new Float32Array(image.data.length)
    const area = w * h
    for (let i = 0; i < area; i += 1) {
      const hole = feeds.mask.data[i] > 0.5
      out[i] = hole ? 0 : image.data[i] * 255
      out[area + i] = hole ? 255 : image.data[area + i] * 255
      out[2 * area + i] = hole ? 0 : image.data[2 * area + i] * 255
    }
    return { output: { data: out, dims: [1, 3, h, w] } }
  })
  await runInpaint(runner, spec('lama'), canvas, mask)
  assert.deepEqual(seenMask.dims, [1, 1, 512, 512], 'the network is fed its fixed square')
  assert.deepEqual(px(canvas, 50, 40).slice(0, 3), [0, 255, 0], 'the hole takes the answer')
  assert.deepEqual(px(canvas, 10, 10).slice(0, 3), [64, 128, 192], 'outside the hole nothing changes')
  assert.deepEqual(px(canvas, 39, 40).slice(0, 3), [64, 128, 192], 'the pixel just outside the hole is untouched even though the network saw a grown hole')
})

test('upscaling tiles the picture through the network and reassembles it at twice the size', async () => {
  const canvas = canvasOf(200, 150)
  const ctx = canvas.getContext('2d')
  const ramp = ctx.createLinearGradient(0, 0, 200, 0)
  ramp.addColorStop(0, '#000000')
  ramp.addColorStop(1, '#ffffff')
  ctx.fillStyle = ramp
  ctx.fillRect(0, 0, 200, 150)
  let calls = 0
  const runner = fake(['pixel_values'], ['reconstruction'], (feeds) => {
    calls += 1
    const input = feeds.pixel_values
    const [, , h, w] = input.dims
    assert.equal(w % 8, 0, 'a tile width is not a multiple of 8')
    assert.equal(h % 8, 0)
    // Nearest-neighbour doubling stands in for the network.
    const out = new Float32Array(3 * 4 * w * h)
    for (let c = 0; c < 3; c += 1) for (let y = 0; y < 2 * h; y += 1) for (let x = 0; x < 2 * w; x += 1) out[c * 4 * w * h + y * 2 * w + x] = input.data[c * w * h + (y >> 1) * w + (x >> 1)]
    return { reconstruction: { data: out, dims: [1, 3, 2 * h, 2 * w] } }
  })
  const big = await runUpscale(runner, spec('swin2sr'), canvas)
  assert.equal(big.width, 400)
  assert.equal(big.height, 300)
  assert.ok(calls >= 4, 'the picture should be tiled')
  // The ramp is continuous across the tile seams.
  for (let x = 2; x < 398; x += 1) {
    const step = Math.abs(px(big, x, 100)[0] - px(big, x + 1, 100)[0])
    assert.ok(step <= 3, `a seam shows at x=${x}: step ${step}`)
  }
  assert.ok(px(big, 2, 100)[0] < 10 && px(big, 397, 100)[0] > 245)
})

test('the runtime is reached only by dynamic import, and the app never downloads a model on its own', () => {
  const app = readFileSync(fileURLToPath(new URL('../src/App.tsx', import.meta.url)), 'utf8')
  assert.match(app, /await import\('\.\/lib\/ort'\)/, 'ONNX Runtime is not loaded lazily')
  assert.ok(!/^import .*from '\.\/lib\/ort'/m.test(app), 'ONNX Runtime is imported statically')
  assert.ok(!/modelStore\(\)\.download/.test(app), 'the editor downloads without asking')
  const dialogs = readFileSync(fileURLToPath(new URL('../src/dialogsExtra.tsx', import.meta.url)), 'utf8')
  assert.match(dialogs, /modelStore\(\)\.download\(id\)/, 'the Neural Models window has no download button')
  const main = readFileSync(fileURLToPath(new URL('../electron/main.cjs', import.meta.url)), 'utf8')
  assert.match(main, /ipcMain\.handle\('models:download'/, 'the main process cannot fetch weights')
  assert.match(main, /\.part\.onnx/, 'a half-downloaded model could be mistaken for a whole one')
  assert.match(main, /if \(!\/\^\[a-zA-Z0-9_-\]\+\$\/\.test\(String\(id\)\)\) throw/, 'a model id is not validated before it becomes a path')
})
