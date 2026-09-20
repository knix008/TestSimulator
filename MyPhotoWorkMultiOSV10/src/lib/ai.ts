import { clamp } from './color'
import { context2d, createCanvas, resizeCanvasContent } from './canvas'
import { gaussianBlur, sharpen } from './filters'
import { selectionToMask } from './selection'
import type { Point, Selection } from './types'

function copyImage(canvas: HTMLCanvasElement) {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
}

export function contentAwareFill(canvas: HTMLCanvasElement, selection: Selection | null) {
  const mask = selectionToMask(selection, canvas.width, canvas.height)
  if (!mask) {
    return
  }
  const ctx = context2d(canvas)
  const src = copyImage(canvas)
  const out = new Uint8ClampedArray(src.data)
  const w = canvas.width
  const h = canvas.height
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!mask[y * w + x]) continue
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let oy = -6; oy <= 6; oy += 1) {
        for (let ox = -6; ox <= 6; ox += 1) {
          const xx = clamp(x + ox, 0, w - 1)
          const yy = clamp(y + oy, 0, h - 1)
          if (mask[yy * w + xx]) continue
          const i = (yy * w + xx) * 4
          r += src.data[i]
          g += src.data[i + 1]
          b += src.data[i + 2]
          a += src.data[i + 3]
          n += 1
        }
      }
      const i = (y * w + x) * 4
      if (n) {
        out[i] = r / n
        out[i + 1] = g / n
        out[i + 2] = b / n
        out[i + 3] = a / n
      }
    }
  }
  src.data.set(out)
  ctx.putImageData(src, 0, 0)
}

export function generativeExpand(canvas: HTMLCanvasElement, width: number, height: number, padX: number, padY: number) {
  const next = createCanvas(width, height)
  const ctx = context2d(next)
  ctx.drawImage(canvas, padX, padY)
  const image = ctx.getImageData(0, 0, width, height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (image.data[i + 3] > 8) continue
      const sx = clamp(x - padX, 0, canvas.width - 1)
      const sy = clamp(y - padY, 0, canvas.height - 1)
      const sample = context2d(canvas).getImageData(sx, sy, 1, 1).data
      image.data[i] = sample[0]
      image.data[i + 1] = sample[1]
      image.data[i + 2] = sample[2]
      image.data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  gaussianBlur(next, 1.2, null)
  ctx.drawImage(canvas, padX, padY)
  return next
}

export function generativeUpscale(canvas: HTMLCanvasElement, scale = 2) {
  const next = resizeCanvasContent(canvas, Math.round(canvas.width * scale), Math.round(canvas.height * scale))
  sharpen(next, 55, null)
  return next
}

export function harmonize(canvas: HTMLCanvasElement, selection: Selection | null) {
  const mask = selectionToMask(selection, canvas.width, canvas.height)
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let sr = 0
  let sg = 0
  let sb = 0
  let sn = 0
  let tr = 0
  let tg = 0
  let tb = 0
  let tn = 0
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    if (mask && mask[p]) {
      sr += image.data[i]; sg += image.data[i + 1]; sb += image.data[i + 2]; sn += 1
    } else {
      tr += image.data[i]; tg += image.data[i + 1]; tb += image.data[i + 2]; tn += 1
    }
  }
  if (!sn || !tn) return
  const dr = tr / tn - sr / sn
  const dg = tg / tn - sg / sn
  const db = tb / tn - sb / sn
  for (let i = 0, p = 0; i < image.data.length; i += 4, p += 1) {
    if (!mask || !mask[p]) continue
    image.data[i] = clamp(image.data[i] + dr, 0, 255)
    image.data[i + 1] = clamp(image.data[i + 1] + dg, 0, 255)
    image.data[i + 2] = clamp(image.data[i + 2] + db, 0, 255)
  }
  ctx.putImageData(image, 0, 0)
}

export function selectSubject(canvas: HTMLCanvasElement): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  const cx = width / 2
  const cy = height / 2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const edge = Math.abs(v - 128)
      const dist = Math.hypot((x - cx) / cx, (y - cy) / cy)
      if (data[i + 3] > 16 && (edge > 18 || dist < 0.42)) {
        mask[y * width + x] = 255
      }
    }
  }
  return { kind: 'mask', x: 0, y: 0, width, height, mask }
}

export function findDistractions(canvas: HTMLCanvasElement): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const i = (y * width + x) * 4
      const v = data[i] + data[i + 1] + data[i + 2]
      let sum = 0
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const j = ((y + oy) * width + (x + ox)) * 4
          sum += data[j] + data[j + 1] + data[j + 2]
        }
      }
      const avg = sum / 25
      if (Math.abs(v - avg) > 140 && data[i + 3] > 16) {
        mask[y * width + x] = 255
      }
    }
  }
  return { kind: 'mask', x: 0, y: 0, width, height, mask }
}

export function liquify(canvas: HTMLCanvasElement, from: Point, to: Point, size: number) {
  const ctx = context2d(canvas)
  const src = copyImage(canvas)
  const out = ctx.createImageData(canvas.width, canvas.height)
  out.data.set(src.data)
  const r = size / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  for (let y = Math.max(0, Math.floor(to.y - r)); y < Math.min(canvas.height, to.y + r); y += 1) {
    for (let x = Math.max(0, Math.floor(to.x - r)); x < Math.min(canvas.width, to.x + r); x += 1) {
      const d = Math.hypot(x - to.x, y - to.y)
      if (d > r) continue
      const t = 1 - d / r
      const sx = clamp(Math.round(x - dx * t), 0, canvas.width - 1)
      const sy = clamp(Math.round(y - dy * t), 0, canvas.height - 1)
      const si = (sy * canvas.width + sx) * 4
      const di = (y * canvas.width + x) * 4
      out.data[di] = src.data[si]
      out.data[di + 1] = src.data[si + 1]
      out.data[di + 2] = src.data[si + 2]
      out.data[di + 3] = src.data[si + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
}

export function skinSmooth(canvas: HTMLCanvasElement, radius = 3, selection: Selection | null = null) {
  gaussianBlur(canvas, radius, selection)
}
