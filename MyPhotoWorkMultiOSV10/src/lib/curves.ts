import { clamp } from './color'
import { context2d } from './canvas'
import { pointInSelection } from './selection'
import type { CurveChannel, CurveData, CurvePoint, LevelsData, Selection } from './types'

/**
 * A 256-entry lookup table through the control points, using a monotone cubic
 * so the curve never overshoots between two points the way a plain spline does.
 */
export function curveLut(points: CurvePoint[]) {
  const lut = new Uint8ClampedArray(256)
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (sorted.length === 0) {
    for (let i = 0; i < 256; i += 1) lut[i] = i
    return lut
  }
  if (sorted.length === 1) {
    lut.fill(clamp(Math.round(sorted[0].y), 0, 255))
    return lut
  }

  const n = sorted.length
  const slopes: number[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const dx = sorted[i + 1].x - sorted[i].x
    slopes.push(dx === 0 ? 0 : (sorted[i + 1].y - sorted[i].y) / dx)
  }
  // Fritsch-Carlson tangents keep the interpolation monotone.
  const tangents: number[] = new Array(n)
  tangents[0] = slopes[0]
  tangents[n - 1] = slopes[n - 2]
  for (let i = 1; i < n - 1; i += 1) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0
    } else {
      tangents[i] = (slopes[i - 1] + slopes[i]) / 2
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (slopes[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / slopes[i]
    const b = tangents[i + 1] / slopes[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      tangents[i] = (3 / h) * a * slopes[i]
      tangents[i + 1] = (3 / h) * b * slopes[i]
    }
  }

  for (let x = 0; x < 256; x += 1) {
    if (x <= sorted[0].x) {
      lut[x] = clamp(Math.round(sorted[0].y), 0, 255)
      continue
    }
    if (x >= sorted[n - 1].x) {
      lut[x] = clamp(Math.round(sorted[n - 1].y), 0, 255)
      continue
    }
    let i = 0
    while (i < n - 2 && sorted[i + 1].x < x) i += 1
    const h = sorted[i + 1].x - sorted[i].x
    const t = h === 0 ? 0 : (x - sorted[i].x) / h
    const t2 = t * t
    const t3 = t2 * t
    const value =
      (2 * t3 - 3 * t2 + 1) * sorted[i].y +
      (t3 - 2 * t2 + t) * h * tangents[i] +
      (-2 * t3 + 3 * t2) * sorted[i + 1].y +
      (t3 - t2) * h * tangents[i + 1]
    lut[x] = clamp(Math.round(value), 0, 255)
  }
  return lut
}

/** The four per-channel tables, with the composite curve already folded in. */
export function curveTables(curves: CurveData) {
  const rgb = curveLut(curves.rgb)
  const build = (channel: CurveChannel) => {
    const own = curveLut(curves[channel])
    const out = new Uint8ClampedArray(256)
    for (let i = 0; i < 256; i += 1) {
      out[i] = rgb[own[i]]
    }
    return out
  }
  return { r: build('r'), g: build('g'), b: build('b') }
}

export function applyCurvesData(data: Uint8ClampedArray, curves: CurveData) {
  const { r, g, b } = curveTables(curves)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r[data[i]]
    data[i + 1] = g[data[i + 1]]
    data[i + 2] = b[data[i + 2]]
  }
}

export function applyCurves(canvas: HTMLCanvasElement, curves: CurveData, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { r, g, b } = curveTables(curves)
  const data = image.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) continue
      const i = (y * canvas.width + x) * 4
      data[i] = r[data[i]]
      data[i + 1] = g[data[i + 1]]
      data[i + 2] = b[data[i + 2]]
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Input black/white clipping, midtone gamma, then the output range. */
export function levelsLut(levels: LevelsData) {
  const lut = new Uint8ClampedArray(256)
  const black = clamp(levels.black, 0, 254)
  const white = Math.max(black + 1, clamp(levels.white, 1, 255))
  const gamma = Math.max(0.01, levels.gamma)
  const outBlack = clamp(levels.outBlack, 0, 255)
  const outWhite = clamp(levels.outWhite, 0, 255)
  for (let i = 0; i < 256; i += 1) {
    const normalized = clamp((i - black) / (white - black), 0, 1)
    const corrected = Math.pow(normalized, 1 / gamma)
    lut[i] = clamp(Math.round(outBlack + corrected * (outWhite - outBlack)), 0, 255)
  }
  return lut
}

export function applyLevelsData(data: Uint8ClampedArray, levels: LevelsData) {
  const lut = levelsLut(levels)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]]
    data[i + 1] = lut[data[i + 1]]
    data[i + 2] = lut[data[i + 2]]
  }
}

export function applyLevels(canvas: HTMLCanvasElement, levels: LevelsData, selection: Selection | null) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const lut = levelsLut(levels)
  const data = image.data
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (!pointInSelection(selection, x, y, canvas.width, canvas.height)) continue
      const i = (y * canvas.width + x) * 4
      data[i] = lut[data[i]]
      data[i + 1] = lut[data[i + 1]]
      data[i + 2] = lut[data[i + 2]]
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Reads the 0.1%/99.9% points off a layer, which is what "Auto" in the dialog sets. */
export function autoLevels(canvas: HTMLCanvasElement): LevelsData {
  const data = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data
  const counts = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue
    counts[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])] += 1
    total += 1
  }
  if (total === 0) {
    return { black: 0, gamma: 1, white: 255, outBlack: 0, outWhite: 255 }
  }
  const cut = Math.max(1, Math.floor(total * 0.001))
  let black = 0
  let seen = 0
  while (black < 255 && seen + counts[black] < cut) {
    seen += counts[black]
    black += 1
  }
  let white = 255
  seen = 0
  while (white > black + 1 && seen + counts[white] < cut) {
    seen += counts[white]
    white -= 1
  }
  return { black, gamma: 1, white, outBlack: 0, outWhite: 255 }
}

export function addCurvePoint(points: CurvePoint[], point: CurvePoint): CurvePoint[] {
  const x = clamp(Math.round(point.x), 0, 255)
  const y = clamp(Math.round(point.y), 0, 255)
  const without = points.filter((item) => Math.abs(item.x - x) > 4)
  return [...without, { x, y }].sort((a, b) => a.x - b.x)
}

export function removeCurvePoint(points: CurvePoint[], index: number): CurvePoint[] {
  // The two endpoints anchor the curve; dropping them would leave it undefined.
  if (points.length <= 2 || index <= 0 || index >= points.length - 1) {
    return points
  }
  return points.filter((_, i) => i !== index)
}

export function isIdentityCurve(points: CurvePoint[]) {
  const lut = curveLut(points)
  for (let i = 0; i < 256; i += 1) {
    if (lut[i] !== i) return false
  }
  return true
}
