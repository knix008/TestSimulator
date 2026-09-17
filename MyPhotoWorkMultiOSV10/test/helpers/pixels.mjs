// Small vocabulary for talking about canvases in assertions.
import assert from 'node:assert/strict'
import { createCanvas } from '@napi-rs/canvas'

export function canvasOf(width, height, fill) {
  const canvas = createCanvas(width, height)
  if (fill) {
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = fill
    ctx.fillRect(0, 0, width, height)
  }
  return canvas
}

/** A canvas whose pixels come from `fn(x, y)` returning [r, g, b, a]. */
export function canvasFrom(width, height, fn) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const image = ctx.createImageData(width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = fn(x, y)
      const i = (y * width + x) * 4
      image.data[i] = r
      image.data[i + 1] = g
      image.data[i + 2] = b
      image.data[i + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export function px(canvas, x, y) {
  return [...canvas.getContext('2d').getImageData(x, y, 1, 1).data]
}

export function pixels(canvas) {
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
}

export function assertPixel(canvas, x, y, expected, tolerance = 2, message = '') {
  const actual = px(canvas, x, y)
  const label = `${message} at (${x}, ${y}): got [${actual}], want [${expected}] ±${tolerance}`
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, label)
  }
}

export function assertNear(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message ?? 'value'}: got ${actual}, want ${expected} ±${tolerance}`,
  )
}

/** Mean absolute difference per channel — a blunt "did anything change" measure. */
export function meanDiff(a, b) {
  const pa = pixels(a)
  const pb = pixels(b)
  assert.equal(pa.length, pb.length, 'canvases must be the same size')
  let sum = 0
  for (let i = 0; i < pa.length; i += 1) {
    sum += Math.abs(pa[i] - pb[i])
  }
  return sum / pa.length
}

export function countMask(mask) {
  let n = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) n += 1
  }
  return n
}

/** Deterministic PRNG so noise-driven tests never flake. */
export function seededRandom(seed = 1) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** Runs `fn` with Math.random replaced by a seeded sequence. */
export function withSeededRandom(seed, fn) {
  const original = Math.random
  Math.random = seededRandom(seed)
  try {
    return fn()
  } finally {
    Math.random = original
  }
}
