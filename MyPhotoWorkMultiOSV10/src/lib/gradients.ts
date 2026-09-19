import { clamp, hexToRgb } from './color'
import { context2d, createCanvas } from './canvas'
import { clipCanvasToSelection } from './selection'
import type { GradientKind, Point, Selection } from './types'

/**
 * Gradients with any number of stops, the way the Gradient Editor defines
 * them: colour stops and opacity stops on a 0..1 ramp. The five geometries
 * (linear, radial, angle, reflected, diamond) all read from the same ramp.
 */

export type GradientStop = { position: number; color: string }
export type OpacityStop = { position: number; opacity: number }
export type GradientDef = {
  id: string
  name: string
  stops: GradientStop[]
  opacityStops: OpacityStop[]
}

export const gradientPresets: GradientDef[] = [
  { id: 'fgBg', name: 'Foreground to background', stops: [{ position: 0, color: 'foreground' }, { position: 1, color: 'background' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'fgTransparent', name: 'Foreground to transparent', stops: [{ position: 0, color: 'foreground' }, { position: 1, color: 'foreground' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 0 }] },
  { id: 'blackWhite', name: 'Black to white', stops: [{ position: 0, color: '#000000' }, { position: 1, color: '#ffffff' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'spectrum', name: 'Spectrum', stops: [{ position: 0, color: '#ff0000' }, { position: 0.17, color: '#ffff00' }, { position: 0.33, color: '#00ff00' }, { position: 0.5, color: '#00ffff' }, { position: 0.67, color: '#0000ff' }, { position: 0.83, color: '#ff00ff' }, { position: 1, color: '#ff0000' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'sunset', name: 'Sunset', stops: [{ position: 0, color: '#1e1b4b' }, { position: 0.45, color: '#be123c' }, { position: 0.75, color: '#f97316' }, { position: 1, color: '#fde68a' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'ocean', name: 'Ocean', stops: [{ position: 0, color: '#0c4a6e' }, { position: 0.5, color: '#0ea5e9' }, { position: 1, color: '#e0f2fe' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'chromeRamp', name: 'Chrome', stops: [{ position: 0, color: '#e5e7eb' }, { position: 0.5, color: '#4b5563' }, { position: 0.55, color: '#f9fafb' }, { position: 1, color: '#9ca3af' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
  { id: 'copper', name: 'Copper', stops: [{ position: 0, color: '#78350f' }, { position: 0.5, color: '#fbbf24' }, { position: 1, color: '#78350f' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] },
]

/** Swaps the 'foreground'/'background' placeholders for real colours. */
export function resolveGradient(def: GradientDef, foreground: string, background: string): GradientDef {
  return {
    ...def,
    stops: def.stops.map((stop) => ({
      ...stop,
      color: stop.color === 'foreground' ? foreground : stop.color === 'background' ? background : stop.color,
    })),
  }
}

/** The colour and opacity at `t` on the ramp, 0..1. */
export function sampleGradient(def: GradientDef, t: number) {
  const at = clamp(t, 0, 1)
  const stops = [...def.stops].sort((a, b) => a.position - b.position)
  const opacities = [...def.opacityStops].sort((a, b) => a.position - b.position)
  const lerpStops = (list: GradientStop[]) => {
    if (!list.length) return { r: 0, g: 0, b: 0 }
    if (at <= list[0].position) return hexToRgb(list[0].color)
    if (at >= list[list.length - 1].position) return hexToRgb(list[list.length - 1].color)
    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i]
      const b = list[i + 1]
      if (at >= a.position && at <= b.position) {
        const k = b.position === a.position ? 0 : (at - a.position) / (b.position - a.position)
        const ca = hexToRgb(a.color)
        const cb = hexToRgb(b.color)
        return { r: ca.r + (cb.r - ca.r) * k, g: ca.g + (cb.g - ca.g) * k, b: ca.b + (cb.b - ca.b) * k }
      }
    }
    return hexToRgb(list[0].color)
  }
  const lerpOpacity = (list: OpacityStop[]) => {
    if (!list.length) return 1
    if (at <= list[0].position) return list[0].opacity
    if (at >= list[list.length - 1].position) return list[list.length - 1].opacity
    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i]
      const b = list[i + 1]
      if (at >= a.position && at <= b.position) {
        const k = b.position === a.position ? 0 : (at - a.position) / (b.position - a.position)
        return a.opacity + (b.opacity - a.opacity) * k
      }
    }
    return 1
  }
  return { ...lerpStops(stops), a: lerpOpacity(opacities) }
}

/** A 256-entry ramp, precomputed for the per-pixel geometries. */
export function gradientRamp(def: GradientDef) {
  const ramp = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i += 1) {
    const s = sampleGradient(def, i / 255)
    ramp[i * 4] = s.r; ramp[i * 4 + 1] = s.g; ramp[i * 4 + 2] = s.b; ramp[i * 4 + 3] = s.a * 255
  }
  return ramp
}

/** Paints the gradient from `from` to `to` in the chosen geometry. */
export function paintGradientDef(
  layer: HTMLCanvasElement,
  from: Point,
  to: Point,
  def: GradientDef,
  kind: GradientKind,
  selection: Selection | null,
  options: { reverse?: boolean; dither?: boolean; mode?: GlobalCompositeOperation; opacity?: number } = {},
) {
  const { width, height } = layer
  const ramp = gradientRamp(def)
  const stroke = createCanvas(width, height)
  const ctx = context2d(stroke)
  const image = ctx.createImageData(width, height)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(0.0001, Math.hypot(dx, dy))
  const ux = dx / length
  const uy = dy / length
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x - from.x
      const py = y - from.y
      let t: number
      switch (kind) {
        case 'radial': t = Math.hypot(px, py) / length; break
        case 'angle': t = (Math.atan2(py, px) - Math.atan2(dy, dx) + Math.PI * 3) % (Math.PI * 2) / (Math.PI * 2); break
        case 'reflected': t = Math.abs(px * ux + py * uy) / length; break
        case 'diamond': t = (Math.abs(px * ux + py * uy) + Math.abs(-px * uy + py * ux)) / length; break
        default: t = (px * ux + py * uy) / length
      }
      if (options.reverse) t = 1 - t
      if (options.dither) t += (Math.random() - 0.5) / 255
      const index = clamp(Math.round(clamp(t, 0, 1) * 255), 0, 255) * 4
      const o = (y * width + x) * 4
      image.data[o] = ramp[index]; image.data[o + 1] = ramp[index + 1]; image.data[o + 2] = ramp[index + 2]; image.data[o + 3] = ramp[index + 3]
    }
  }
  ctx.putImageData(image, 0, 0)
  clipCanvasToSelection(stroke, selection)
  const target = context2d(layer)
  target.save()
  target.globalAlpha = options.opacity ?? 1
  target.globalCompositeOperation = options.mode ?? 'source-over'
  target.drawImage(stroke, 0, 0)
  target.restore()
}

/** A CSS gradient string for showing a definition in the UI. */
export function gradientCss(def: GradientDef, foreground = '#000000', background = '#ffffff') {
  const resolved = resolveGradient(def, foreground, background)
  const parts = [...resolved.stops].sort((a, b) => a.position - b.position).map((stop) => {
    const rgb = hexToRgb(stop.color)
    const alpha = sampleGradient(resolved, stop.position).a
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha.toFixed(2)}) ${Math.round(stop.position * 100)}%`
  })
  return `linear-gradient(90deg, ${parts.join(', ')})`
}
