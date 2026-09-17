// Proves the harness itself works: the app's TypeScript loads unbundled and the
// canvas shim behaves like a browser canvas. If this fails, every other test's
// failure is meaningless.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clamp } from '../src/lib/color.ts'
import { createCanvas, context2d } from '../src/lib/canvas.ts'
import { blendModes, defaultAdjustment, defaultEffects } from '../src/lib/types.ts'

test('TypeScript sources import with their cross-module dependencies resolved', () => {
  assert.equal(clamp(5, 0, 1), 1)
  assert.equal(typeof defaultEffects().dropShadow, 'boolean')
  assert.equal(defaultAdjustment('brightness').type, 'brightness')
  assert.ok(blendModes.includes('multiply'))
})

test('document.createElement("canvas") yields a working 2D canvas', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 4
  const ctx = context2d(canvas)
  ctx.fillStyle = '#ff8000'
  ctx.fillRect(0, 0, 2, 2)
  assert.deepEqual([...ctx.getImageData(0, 0, 1, 1).data], [255, 128, 0, 255])
  assert.deepEqual([...ctx.getImageData(3, 3, 1, 1).data], [0, 0, 0, 0])
})

test('createCanvas clamps to at least 1x1 and rounds fractional sizes', () => {
  assert.equal(createCanvas(0, 0).width, 1)
  assert.equal(createCanvas(-5, 10).height, 10)
  assert.equal(createCanvas(10.4, 10.6).width, 10)
  assert.equal(createCanvas(10.4, 10.6).height, 11)
})

test('window.localStorage round trips', () => {
  window.localStorage.setItem('probe', 'value')
  assert.equal(window.localStorage.getItem('probe'), 'value')
  window.localStorage.removeItem('probe')
  assert.equal(window.localStorage.getItem('probe'), null)
})
