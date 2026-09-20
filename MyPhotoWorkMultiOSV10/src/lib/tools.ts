import { clamp, hexToRgb } from './color'
import { context2d, createCanvas } from './canvas'
import { clipCanvasToSelection } from './selection'
import type { GradientKind, Point, Selection } from './types'

/** The shape of a brush tip beyond its size: what the Brushes panel sets. */
export type BrushShape = {
  /** Gap between dabs, as a fraction of the brush size. */
  spacing?: number
  /** The tip's rotation in degrees, which only shows on a flattened tip. */
  angle?: number
  /** 1 is round; below that the tip is squashed across its angle. */
  roundness?: number
  /** How far dabs are thrown off the line, as a fraction of the size. */
  scatter?: number
  /** A sampled tip (Define Brush Preset): drawn in the colour instead of a round dab. */
  tip?: HTMLCanvasElement | null
}

function stamp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hardness: number, color: string, opacity: number, shape?: BrushShape) {
  const radius = Math.max(0.5, size / 2)
  const inner = radius * hardness
  const { r, g, b } = hexToRgb(color)
  const roundness = clamp(shape?.roundness ?? 1, 0.05, 1)
  const angle = ((shape?.angle ?? 0) * Math.PI) / 180

  ctx.save()
  if (shape?.tip) {
    // The tip's own alpha is the dab; the colour is laid through it.
    const tip = shape.tip
    const scale = size / Math.max(tip.width, tip.height)
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.scale(scale, scale * roundness)
    ctx.globalAlpha = opacity
    ctx.drawImage(tip, -tip.width / 2, -tip.height / 2)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(-tip.width / 2, -tip.height / 2, tip.width, tip.height)
    ctx.restore()
    return
  }
  if (roundness < 1 || angle) {
    // A flattened tip is a circle drawn under a squash: turn to the brush
    // angle, scale one axis, and everything else stays the same.
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.scale(1, roundness)
    ctx.translate(-x, -y)
  }
  const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius)
  gradient.addColorStop(0, `rgba(${r},${g},${b},${opacity})`)
  gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function paintStroke(
  layer: HTMLCanvasElement,
  from: Point,
  to: Point,
  options: { size: number; hardness: number; color: string; opacity: number; erase?: boolean; pencil?: boolean; selection: Selection | null; shape?: BrushShape },
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const spacing = clamp(options.shape?.spacing ?? 0.25, 0.02, 2)
  // 0 for a single click, so a dab is stamped once and deposits exactly the
  // requested opacity rather than compositing two coincident stamps.
  const steps = Math.ceil(distance / Math.max(1, options.size * spacing))
  const scatter = (options.shape?.scatter ?? 0) * options.size
  const stroke = createCanvas(layer.width, layer.height)
  const strokeCtx = context2d(stroke)
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps
    // Scatter throws each dab off the line, which is what turns a solid stroke
    // into a spray without changing where the stroke goes.
    const jitterX = scatter ? (Math.random() - 0.5) * scatter : 0
    const jitterY = scatter ? (Math.random() - 0.5) * scatter : 0
    stamp(
      strokeCtx,
      from.x + (to.x - from.x) * t + jitterX,
      from.y + (to.y - from.y) * t + jitterY,
      options.size,
      options.pencil ? 1 : options.hardness,
      options.erase ? '#ffffff' : options.color,
      options.opacity,
      options.shape,
    )
  }
  clipCanvasToSelection(stroke, options.selection)
  const layerCtx = context2d(layer)
  layerCtx.save()
  layerCtx.globalCompositeOperation = options.erase ? 'destination-out' : 'source-over'
  layerCtx.drawImage(stroke, 0, 0)
  layerCtx.restore()
}

export function paintGradient(
  layer: HTMLCanvasElement,
  from: Point,
  to: Point,
  startColor: string,
  endColor: string,
  kind: GradientKind,
  selection: Selection | null,
) {
  const stroke = createCanvas(layer.width, layer.height)
  const ctx = context2d(stroke)
  let gradient: CanvasGradient
  if (kind === 'radial' || kind === 'diamond') {
    const r = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y))
    gradient = ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, r)
  } else if (kind === 'reflected') {
    gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
    gradient.addColorStop(0, endColor)
    gradient.addColorStop(0.5, startColor)
    gradient.addColorStop(1, endColor)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, layer.width, layer.height)
    clipCanvasToSelection(stroke, selection)
    context2d(layer).drawImage(stroke, 0, 0)
    return
  } else {
    gradient = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
  }
  gradient.addColorStop(0, startColor)
  gradient.addColorStop(1, endColor)
  ctx.fillStyle = gradient
  if (kind === 'angle') {
    for (let y = 0; y < layer.height; y += 1) {
      for (let x = 0; x < layer.width; x += 1) {
        const a = (Math.atan2(y - from.y, x - from.x) + Math.PI) / (Math.PI * 2)
        ctx.globalAlpha = a
        ctx.fillStyle = startColor
        ctx.fillRect(x, y, 1, 1)
      }
    }
  } else {
    ctx.fillRect(0, 0, layer.width, layer.height)
  }
  clipCanvasToSelection(stroke, selection)
  context2d(layer).drawImage(stroke, 0, 0)
}

export function rasterizeText(
  layer: HTMLCanvasElement,
  text: string,
  point: Point,
  options: { fontFamily: string; fontSize: number; color: string; selection: Selection | null; vertical?: boolean },
) {
  const stroke = createCanvas(layer.width, layer.height)
  const ctx = context2d(stroke)
  ctx.font = `600 ${options.fontSize}px ${options.fontFamily}`
  ctx.fillStyle = options.color
  ctx.textBaseline = 'top'
  if (options.vertical) {
    [...text].forEach((ch, index) => ctx.fillText(ch, point.x, point.y + index * options.fontSize * 1.15))
  } else {
    ctx.fillText(text, point.x, point.y)
  }
  clipCanvasToSelection(stroke, options.selection)
  context2d(layer).drawImage(stroke, 0, 0)
}

/**
 * One clone-stamp dab. `source` is the Alt-clicked sample point and `origin`
 * where the stroke began, so the pixel under the brush at `to` is taken from
 * `source + (to - origin)`: the sample keeps the same offset all along the
 * stroke (aligned cloning); passing `to` as the origin samples from `source`
 * itself on every dab.
 */
export function cloneStamp(
  layer: HTMLCanvasElement,
  from: Point,
  to: Point,
  source: Point,
  origin: Point,
  size: number,
  selection: Selection | null,
) {
  const offsetX = origin.x - source.x
  const offsetY = origin.y - source.y
  const stroke = createCanvas(layer.width, layer.height)
  const ctx = context2d(stroke)
  // Drawing the layer shifted by the offset puts the pixel from `p - offset`
  // under every point `p` of the brush.
  ctx.drawImage(layer, offsetX, offsetY)
  // The dab covers the whole segment from the last event, so a fast drag
  // leaves a line rather than a row of dots: a round-capped stroke from one
  // point to the other, which is a single disc when they coincide.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x + (from.x === to.x && from.y === to.y ? 0.01 : 0), to.y)
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over'
  clipCanvasToSelection(stroke, selection)
  context2d(layer).drawImage(stroke, 0, 0)
}

export function healStamp(layer: HTMLCanvasElement, at: Point, size: number, selection: Selection | null) {
  const ctx = context2d(layer)
  const r = Math.max(2, Math.round(size / 2))
  const x = clamp(Math.round(at.x - r), 0, layer.width - 1)
  const y = clamp(Math.round(at.y - r), 0, layer.height - 1)
  const w = Math.min(r * 2, layer.width - x)
  const h = Math.min(r * 2, layer.height - y)
  const sampleX = clamp(x - w, 0, layer.width - w)
  const sampleY = clamp(y - h, 0, layer.height - h)
  const stroke = createCanvas(layer.width, layer.height)
  const sctx = context2d(stroke)
  sctx.filter = 'blur(2px)'
  sctx.drawImage(layer, sampleX, sampleY, w, h, x, y, w, h)
  clipCanvasToSelection(stroke, selection)
  ctx.drawImage(stroke, 0, 0)
}

export function dodgeBurn(layer: HTMLCanvasElement, at: Point, size: number, amount: number, burn: boolean, selection: Selection | null) {
  const ctx = context2d(layer)
  const image = ctx.getImageData(0, 0, layer.width, layer.height)
  const r = size / 2
  for (let y = Math.max(0, Math.floor(at.y - r)); y < Math.min(layer.height, at.y + r); y += 1) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x < Math.min(layer.width, at.x + r); x += 1) {
      const d = Math.hypot(x - at.x, y - at.y)
      if (d > r) continue
      if (selection && selection.kind === 'mask' && selection.mask && !selection.mask[y * layer.width + x]) continue
      const i = (y * layer.width + x) * 4
      const t = (1 - d / r) * amount
      const mul = burn ? 1 - t * 0.35 : 1 + t * 0.35
      image.data[i] = clamp(image.data[i] * mul, 0, 255)
      image.data[i + 1] = clamp(image.data[i + 1] * mul, 0, 255)
      image.data[i + 2] = clamp(image.data[i + 2] * mul, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function smudge(layer: HTMLCanvasElement, from: Point, to: Point, size: number, selection: Selection | null) {
  const ctx = context2d(layer)
  const r = Math.max(2, Math.round(size / 2))
  const sx = clamp(Math.round(from.x - r), 0, layer.width - 1)
  const sy = clamp(Math.round(from.y - r), 0, layer.height - 1)
  const dx = Math.round(to.x - from.x)
  const dy = Math.round(to.y - from.y)
  const w = Math.min(r * 2, layer.width - sx)
  const h = Math.min(r * 2, layer.height - sy)
  const patch = ctx.getImageData(sx, sy, w, h)
  const stroke = createCanvas(layer.width, layer.height)
  context2d(stroke).putImageData(patch, sx + dx, sy + dy)
  clipCanvasToSelection(stroke, selection)
  ctx.globalAlpha = 0.45
  ctx.drawImage(stroke, 0, 0)
  ctx.globalAlpha = 1
}

export function redEyeFix(layer: HTMLCanvasElement, at: Point, size: number) {
  const ctx = context2d(layer)
  const image = ctx.getImageData(0, 0, layer.width, layer.height)
  const r = size / 2
  for (let y = Math.max(0, Math.floor(at.y - r)); y < Math.min(layer.height, at.y + r); y += 1) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x < Math.min(layer.width, at.x + r); x += 1) {
      if (Math.hypot(x - at.x, y - at.y) > r) continue
      const i = (y * layer.width + x) * 4
      if (image.data[i] > 90 && image.data[i] > image.data[i + 1] * 1.4 && image.data[i] > image.data[i + 2] * 1.4) {
        const v = (image.data[i + 1] + image.data[i + 2]) / 2
        image.data[i] = v
        image.data[i + 1] = v
        image.data[i + 2] = v
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function spongeDesaturate(layer: HTMLCanvasElement, at: Point, size: number, saturate: boolean) {
  const ctx = context2d(layer)
  const image = ctx.getImageData(0, 0, layer.width, layer.height)
  const r = size / 2
  for (let y = Math.max(0, Math.floor(at.y - r)); y < Math.min(layer.height, at.y + r); y += 1) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x < Math.min(layer.width, at.x + r); x += 1) {
      if (Math.hypot(x - at.x, y - at.y) > r) continue
      const i = (y * layer.width + x) * 4
      const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
      const t = saturate ? 1.2 : 0.55
      image.data[i] = clamp(v + (image.data[i] - v) * t, 0, 255)
      image.data[i + 1] = clamp(v + (image.data[i + 1] - v) * t, 0, 255)
      image.data[i + 2] = clamp(v + (image.data[i + 2] - v) * t, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function colorReplace(layer: HTMLCanvasElement, at: Point, size: number, color: string, tolerance: number) {
  const { r: tr, g: tg, b: tb } = hexToRgb(color)
  const ctx = context2d(layer)
  const image = ctx.getImageData(0, 0, layer.width, layer.height)
  const cx = Math.floor(at.x)
  const cy = Math.floor(at.y)
  const origin = (cy * layer.width + cx) * 4
  const or = image.data[origin]
  const og = image.data[origin + 1]
  const ob = image.data[origin + 2]
  const r = size / 2
  for (let y = Math.max(0, Math.floor(at.y - r)); y < Math.min(layer.height, at.y + r); y += 1) {
    for (let x = Math.max(0, Math.floor(at.x - r)); x < Math.min(layer.width, at.x + r); x += 1) {
      if (Math.hypot(x - at.x, y - at.y) > r) continue
      const i = (y * layer.width + x) * 4
      if (Math.max(Math.abs(image.data[i] - or), Math.abs(image.data[i + 1] - og), Math.abs(image.data[i + 2] - ob)) > tolerance) continue
      const v = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]
      image.data[i] = clamp(tr * (v / 128), 0, 255)
      image.data[i + 1] = clamp(tg * (v / 128), 0, 255)
      image.data[i + 2] = clamp(tb * (v / 128), 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}
