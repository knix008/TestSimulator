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
  /** The Korean name of a built-in one. */
  ko?: string
}

/** Evenly spaced colours, solid all the way. */
function ramp(id: string, en: string, ko: string, colours: string[]): GradientDef {
  return {
    id,
    name: en,
    ko,
    stops: colours.map((color, index) => ({ position: index / (colours.length - 1), color })),
    opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }],
  }
}

const KOREAN_NAMES: Record<string, string> = {
  fgBg: '전경색에서 배경색으로', fgTransparent: '전경색에서 투명으로', blackWhite: '검정에서 흰색으로', spectrum: '스펙트럼',
  sunset: '노을', ocean: '바다', chromeRamp: '크롬', copper: '구리',
}

/** A preset's name in the language on screen; a gradient the user made keeps the name they gave it. */
export function gradientLabel(def: GradientDef, language: string) {
  if (language !== 'ko') return def.name
  return def.ko ?? KOREAN_NAMES[def.id] ?? def.name
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
  ramp('sunrise', 'Sunrise', '일출', ['#2c3e70', '#b5527e', '#f6a06a', '#ffe9a8']),
  ramp('dusk', 'Dusk', '해 질 녘', ['#0f0c29', '#302b63', '#7b4397', '#dc2430']),
  ramp('dawn', 'Dawn', '새벽', ['#355c7d', '#6c5b7b', '#c06c84', '#f8b195']),
  ramp('skyBlue', 'Clear sky', '맑은 하늘', ['#1e6fd9', '#6db3f2', '#d6ecff']),
  ramp('nightSky', 'Night sky', '밤하늘', ['#02040f', '#0b1f4b', '#274b8c']),
  ramp('aurora', 'Aurora', '오로라', ['#04151f', '#0f8a6d', '#57e39a', '#7a3fd1']),
  ramp('lagoon', 'Lagoon', '석호', ['#004e64', '#00a5a5', '#7ae7c7']),
  ramp('deepSea', 'Deep sea', '심해', ['#000428', '#004e92']),
  ramp('forest', 'Forest', '숲', ['#0b3d1e', '#2e7d32', '#a5d66b']),
  ramp('moss', 'Moss', '이끼', ['#2f3e1f', '#6b8e23', '#c9d68a']),
  ramp('spring', 'Spring', '봄', ['#ffd1dc', '#fff4b8', '#bff0c0']),
  ramp('autumn', 'Autumn', '가을', ['#5a1e0a', '#c1440e', '#f2a31b', '#f9dc5c']),
  ramp('desert', 'Desert', '사막', ['#7a4b24', '#d39a5c', '#f6e3b4']),
  ramp('earth', 'Earth', '대지', ['#2b1a0e', '#6f4e37', '#c2a27a']),
  ramp('fire', 'Fire', '불꽃', ['#1a0000', '#b81d13', '#f47b20', '#ffe066']),
  ramp('lava', 'Lava', '용암', ['#000000', '#7a0000', '#ff4500']),
  ramp('ice', 'Ice', '얼음', ['#0b3c5d', '#7cc6e8', '#f0fbff']),
  ramp('mint', 'Mint', '민트', ['#0f9b8e', '#a8efd7']),
  ramp('peach', 'Peach', '복숭아', ['#ff9a8b', '#ffd3a5']),
  ramp('rose', 'Rose', '장미', ['#7a0c33', '#e8467c', '#ffc1d6']),
  ramp('lavender', 'Lavender', '라벤더', ['#5b4b9a', '#b8a4e3', '#efe7fb']),
  ramp('grape', 'Grape', '포도', ['#2e0a4f', '#7b2cbf', '#c77dff']),
  ramp('candy', 'Candy', '사탕', ['#ff9ad5', '#ffe08a', '#8ee3f5']),
  ramp('pastelRainbow', 'Pastel rainbow', '파스텔 무지개', ['#ffb3ba', '#ffdfba', '#fff5ba', '#baffc9', '#bae7ff', '#d9baff']),
  ramp('neon', 'Neon', '네온', ['#ff00cc', '#3333ff', '#00ffcc']),
  ramp('electric', 'Electric', '전기', ['#000046', '#1cb5e0']),
  ramp('gold', 'Gold', '금', ['#6b4e00', '#f5d76e', '#fff4c2', '#b8860b']),
  ramp('silver', 'Silver', '은', ['#5f6368', '#e8eaed', '#9aa0a6', '#f8f9fa']),
  ramp('bronze', 'Bronze', '청동', ['#3e2312', '#a9713a', '#e0b080', '#6b3f1d']),
  ramp('steel', 'Steel', '강철', ['#232b33', '#74828f', '#c9d3db']),
  ramp('sepia', 'Sepia', '세피아', ['#2a1a0c', '#8a6239', '#efe0c4']),
  ramp('duotoneTeal', 'Teal and orange', '청록과 주황', ['#0b5563', '#f2f2f2', '#e8772e']),
  ramp('infrared', 'Infrared', '적외선', ['#10002b', '#c9184a', '#ffd60a', '#ffffff']),
  ramp('thermal', 'Thermal', '열화상', ['#000080', '#00ffff', '#00ff00', '#ffff00', '#ff0000']),
  ramp('grayscale', 'Gray steps', '회색 단계', ['#1a1a1a', '#666666', '#b3b3b3', '#f2f2f2']),
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
