import { clamp, hslToRgb, rgbToHsl } from './color'
import { context2d, createCanvas } from './canvas'
import { pointInSelection } from './selection'
import type { Selection } from './types'

type PixelFn = (r: number, g: number, b: number, a: number, x: number, y: number) => [number, number, number, number]

function mapPixels(canvas: HTMLCanvasElement, selection: Selection | null, fn: PixelFn) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) {
        continue
      }
      const i = (y * canvas.width + x) * 4
      const [r, g, b, a] = fn(data[i], data[i + 1], data[i + 2], data[i + 3], x, y)
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function adjustBrightnessContrast(canvas: HTMLCanvasElement, brightness: number, contrast: number, selection: Selection | null) {
  const b = brightness / 100
  const c = Math.max(0.01, (contrast + 100) / 100)
  mapPixels(canvas, selection, (r, g, bl, a) => [
    clamp(((r / 255 - 0.5) * c + 0.5 + b) * 255, 0, 255),
    clamp(((g / 255 - 0.5) * c + 0.5 + b) * 255, 0, 255),
    clamp(((bl / 255 - 0.5) * c + 0.5 + b) * 255, 0, 255),
    a,
  ])
}

export function adjustHueSaturation(canvas: HTMLCanvasElement, hue: number, saturation: number, lightness: number, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => {
    const hsl = rgbToHsl(r, g, b)
    const next = hslToRgb(
      (hsl.h + hue / 360 + 1) % 1,
      clamp(hsl.s + saturation / 100, 0, 1),
      clamp(hsl.l + lightness / 100, 0, 1),
    )
    return [next.r, next.g, next.b, a]
  })
}

export function invertColors(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => [255 - r, 255 - g, 255 - b, a])
}

export function grayscale(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => {
    const v = 0.299 * r + 0.587 * g + 0.114 * b
    return [v, v, v, a]
  })
}

export function threshold(canvas: HTMLCanvasElement, value: number, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => {
    const v = 0.299 * r + 0.587 * g + 0.114 * b >= value ? 255 : 0
    return [v, v, v, a]
  })
}

function gaussianKernel(radius: number) {
  const sigma = Math.max(0.4, radius / 2)
  const size = Math.max(1, Math.ceil(radius) * 2 + 1)
  const half = Math.floor(size / 2)
  const kernel = new Float32Array(size)
  let sum = 0
  for (let i = 0; i < size; i += 1) {
    const x = i - half
    const w = Math.exp(-(x * x) / (2 * sigma * sigma))
    kernel[i] = w
    sum += w
  }
  for (let i = 0; i < size; i += 1) {
    kernel[i] /= sum
  }
  return { kernel, half }
}

export function gaussianBlur(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  if (radius <= 0) {
    return
  }
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const tmp = new Uint8ClampedArray(src.data)
  const out = new Uint8ClampedArray(src.data)
  const { kernel, half } = gaussianKernel(radius)
  const w = canvas.width
  const h = canvas.height

  const sample = (buffer: Uint8ClampedArray, x: number, y: number, c: number) => {
    const xx = clamp(x, 0, w - 1)
    const yy = clamp(y, 0, h - 1)
    return buffer[(yy * w + xx) * 4 + c]
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) {
        continue
      }
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let k = 0; k < kernel.length; k += 1) {
        const weight = kernel[k]
        const sx = x + k - half
        r += sample(src.data, sx, y, 0) * weight
        g += sample(src.data, sx, y, 1) * weight
        b += sample(src.data, sx, y, 2) * weight
        a += sample(src.data, sx, y, 3) * weight
      }
      const i = (y * w + x) * 4
      tmp[i] = r
      tmp[i + 1] = g
      tmp[i + 2] = b
      tmp[i + 3] = a
    }
  }

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) {
        continue
      }
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let k = 0; k < kernel.length; k += 1) {
        const weight = kernel[k]
        const sy = y + k - half
        r += sample(tmp, x, sy, 0) * weight
        g += sample(tmp, x, sy, 1) * weight
        b += sample(tmp, x, sy, 2) * weight
        a += sample(tmp, x, sy, 3) * weight
      }
      const i = (y * w + x) * 4
      out[i] = r
      out[i + 1] = g
      out[i + 2] = b
      out[i + 3] = a
    }
  }

  src.data.set(out)
  ctx.putImageData(src, 0, 0)
}

export function sharpen(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const copy = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  const amp = amount / 100
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) {
        continue
      }
      let r = 0
      let g = 0
      let b = 0
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const weight = kernel[(ky + 1) * 3 + (kx + 1)]
          const xx = clamp(x + kx, 0, w - 1)
          const yy = clamp(y + ky, 0, h - 1)
          const i = (yy * w + xx) * 4
          r += copy[i] * weight
          g += copy[i + 1] * weight
          b += copy[i + 2] * weight
        }
      }
      const dest = (y * w + x) * 4
      src.data[dest] = clamp(copy[dest] * (1 - amp) + r * amp, 0, 255)
      src.data[dest + 1] = clamp(copy[dest + 1] * (1 - amp) + g * amp, 0, 255)
      src.data[dest + 2] = clamp(copy[dest + 2] * (1 - amp) + b * amp, 0, 255)
    }
  }
  ctx.putImageData(src, 0, 0)
}

export function histogram(canvas: HTMLCanvasElement) {
  const data = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data
  const r = new Uint32Array(256)
  const g = new Uint32Array(256)
  const b = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) {
      continue
    }
    r[data[i]] += 1
    g[data[i + 1]] += 1
    b[data[i + 2]] += 1
  }
  return { r, g, b }
}

export function clearSelectionPixels(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapPixels(canvas, selection, () => [0, 0, 0, 0])
}

export function motionBlur(canvas: HTMLCanvasElement, distance: number, selection: Selection | null) {
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const copy = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  const span = Math.max(1, Math.round(distance))
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) continue
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let k = -span; k <= span; k += 1) {
        const xx = clamp(x + k, 0, w - 1)
        const i = (y * w + xx) * 4
        r += copy[i]; g += copy[i + 1]; b += copy[i + 2]; a += copy[i + 3]; n += 1
      }
      const i = (y * w + x) * 4
      src.data[i] = r / n; src.data[i + 1] = g / n; src.data[i + 2] = b / n; src.data[i + 3] = a / n
    }
  }
  ctx.putImageData(src, 0, 0)
}

export function mosaic(canvas: HTMLCanvasElement, cell: number, selection: Selection | null) {
  const size = Math.max(2, Math.round(cell))
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const copy = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) continue
      const sx = Math.floor(x / size) * size
      const sy = Math.floor(y / size) * size
      const si = (sy * w + sx) * 4
      const i = (y * w + x) * 4
      src.data[i] = copy[si]
      src.data[i + 1] = copy[si + 1]
      src.data[i + 2] = copy[si + 2]
      src.data[i + 3] = copy[si + 3]
    }
  }
  ctx.putImageData(src, 0, 0)
}

export function addNoise(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => {
    const n = (Math.random() - 0.5) * amount * 2
    return [clamp(r + n, 0, 255), clamp(g + n, 0, 255), clamp(b + n, 0, 255), a]
  })
}

export function emboss(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const copy = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  for (let y = 1; y < h; y += 1) {
    for (let x = 1; x < w; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) continue
      const i = (y * w + x) * 4
      const j = ((y - 1) * w + (x - 1)) * 4
      const v = clamp(copy[i] - copy[j] + 128, 0, 255)
      src.data[i] = v; src.data[i + 1] = v; src.data[i + 2] = v
    }
  }
  ctx.putImageData(src, 0, 0)
}

export function findEdges(canvas: HTMLCanvasElement, selection: Selection | null) {
  const ctx = context2d(canvas)
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const copy = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      if (!pointInSelection(selection, x, y, w, h)) continue
      const i = (y * w + x) * 4
      const gx = copy[i + 4] - copy[i - 4]
      const gy = copy[i + w * 4] - copy[i - w * 4]
      const v = clamp(Math.hypot(gx, gy), 0, 255)
      src.data[i] = v; src.data[i + 1] = v; src.data[i + 2] = v
    }
  }
  ctx.putImageData(src, 0, 0)
}

export function oilPaint(canvas: HTMLCanvasElement, selection: Selection | null) {
  gaussianBlur(canvas, 2.2, selection)
  mapPixels(canvas, selection, (r, g, b, a) => [
    Math.round(r / 24) * 24,
    Math.round(g / 24) * 24,
    Math.round(b / 24) * 24,
    a,
  ])
}

export function clouds(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a, x, y) => {
    const n = (Math.sin(x * 0.04 + r) + Math.cos(y * 0.05 + g) + Math.random() * (b / 255)) * 70 + 128
    const v = clamp(n, 0, 255)
    return [v, v, clamp(v + 8, 0, 255), a || 255]
  })
}

export function vignette(canvas: HTMLCanvasElement, amount: number, selection: Selection | null) {
  const cx = canvas.width / 2
  const cy = canvas.height / 2
  const max = Math.hypot(cx, cy)
  mapPixels(canvas, selection, (r, g, b, a, x, y) => {
    const t = Math.pow(Math.hypot(x - cx, y - cy) / max, 1.6) * amount
    return [clamp(r * (1 - t), 0, 255), clamp(g * (1 - t), 0, 255), clamp(b * (1 - t), 0, 255), a]
  })
}

export function highPass(canvas: HTMLCanvasElement, radius: number, selection: Selection | null) {
  const ctx = context2d(canvas)
  const original = ctx.getImageData(0, 0, canvas.width, canvas.height)
  gaussianBlur(canvas, radius, selection)
  const blurred = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < original.data.length; i += 4) {
    original.data[i] = clamp(original.data[i] - blurred.data[i] + 128, 0, 255)
    original.data[i + 1] = clamp(original.data[i + 1] - blurred.data[i + 1] + 128, 0, 255)
    original.data[i + 2] = clamp(original.data[i + 2] - blurred.data[i + 2] + 128, 0, 255)
  }
  ctx.putImageData(original, 0, 0)
}

export function solarize(canvas: HTMLCanvasElement, selection: Selection | null) {
  mapPixels(canvas, selection, (r, g, b, a) => [
    r > 128 ? 255 - r : r,
    g > 128 ? 255 - g : g,
    b > 128 ? 255 - b : b,
    a,
  ])
}

export function offset(canvas: HTMLCanvasElement, dx: number, dy: number) {
  const next = createCanvas(canvas.width, canvas.height)
  const ctx = context2d(next)
  ctx.drawImage(canvas, dx, dy)
  ctx.drawImage(canvas, dx - canvas.width, dy)
  ctx.drawImage(canvas, dx, dy - canvas.height)
  ctx.drawImage(canvas, dx - canvas.width, dy - canvas.height)
  context2d(canvas).clearRect(0, 0, canvas.width, canvas.height)
  context2d(canvas).drawImage(next, 0, 0)
}

