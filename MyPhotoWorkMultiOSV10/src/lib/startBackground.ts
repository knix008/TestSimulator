import { ANIMATION_KINDS, type AnimationKind } from './startSettings'

/**
 * The moving backgrounds of the start screen: one canvas, 30 frames a second times a
 * speed factor, paused while the window is hidden, soft shapes in the theme's colours.
 * All eighteen are about photographs: the lens, the film, the darkroom and the editor.
 */

type Rgb = number[]

export type Palette = {
  bg: Rgb
  bg2: Rgb
  accent: Rgb
  text: Rgb
  warm: Rgb
  cool: Rgb
  dark: boolean
}

type Item = { x: number; y: number; a: number; b: number; c: number; i: number }
type Ctx = CanvasRenderingContext2D
type Scene = Palette & { strength: number }

const FRAME_MS = 1000 / 30
const TAU = Math.PI * 2

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export function cssRgb(value: string | null | undefined, fallback: Rgb): Rgb {
  const text = String(value ?? '').trim()
  let match = /^#([0-9a-f]{6})$/i.exec(text)
  if (match) return [0, 2, 4].map((i) => Number.parseInt(match![1].slice(i, i + 2), 16))
  match = /^#([0-9a-f]{3})$/i.exec(text)
  if (match) return [0, 1, 2].map((i) => Number.parseInt(match![1][i] + match![1][i], 16))
  match = /^rgba?\(([^)]+)\)/i.exec(text)
  if (match) return match[1].split(',').slice(0, 3).map((part) => Number.parseFloat(part))
  return fallback
}

const rgba = (rgb: Rgb, alpha: number) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${Math.max(0, Math.min(1, alpha))})`
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k)

/** The colours of the current theme, as the app's stylesheet tokens give them. */
export function themeColors(): Palette {
  const css = getComputedStyle(document.documentElement)
  const bg = cssRgb(css.getPropertyValue('--app-bg-a'), [15, 21, 27])
  const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255
  return {
    bg,
    bg2: cssRgb(css.getPropertyValue('--app-bg-b'), [26, 36, 48]),
    accent: cssRgb(css.getPropertyValue('--accent'), [110, 200, 255]),
    text: cssRgb(css.getPropertyValue('--text-primary'), [238, 246, 250]),
    warm: [255, 176, 92],
    cool: [122, 162, 255],
    dark: lum < 0.5,
  }
}

function glow(ctx: Ctx, x: number, y: number, radius: number, rgb: Rgb, alpha: number) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, rgba(rgb, alpha))
  gradient.addColorStop(1, rgba(rgb, 0))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, TAU)
  ctx.fill()
}

function hsl(hue: number, saturation: number, light: number): Rgb {
  const h = ((hue % 360) + 360) % 360 / 60
  const c = (1 - Math.abs(2 * light - 1)) * saturation
  const x = c * (1 - Math.abs((h % 2) - 1))
  const m = light - c / 2
  const table: Rgb[] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]]
  return table[Math.floor(h) % 6].map((v) => (v + m) * 255)
}

export class AnimatedBackground {
  canvas: HTMLCanvasElement
  ctx: Ctx
  colors: () => Palette
  palette: Palette
  speed: () => number
  kind: AnimationKind
  frames = 0
  time = 0
  running = false
  wanted = false
  last = 0
  w = 1
  h = 1
  items: Item[] = []
  strokes: { points: number[][]; hue: number; width: number; born: number }[] = []
  rand: () => number = Math.random
  private observer: ResizeObserver | null
  private onVisibility: () => void

  constructor(canvas: HTMLCanvasElement, options: { kind?: AnimationKind; speed?: () => number; colors?: () => Palette } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d') as Ctx
    this.colors = options.colors ?? themeColors
    this.palette = this.colors()
    this.speed = options.speed ?? (() => 1)
    this.kind = options.kind && ANIMATION_KINDS.includes(options.kind) ? options.kind : 'bokeh'
    this.loop = this.loop.bind(this)
    this.onVisibility = () => {
      if (document.hidden) this.running = false
      else if (this.wanted) this.start()
    }
    document.addEventListener('visibilitychange', this.onVisibility)
    this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null
    this.observer?.observe(canvas)
    this.resize()
  }

  setKind(kind: AnimationKind) {
    if (!ANIMATION_KINDS.includes(kind) || kind === this.kind) return
    this.kind = kind
    this.seed()
    if (!this.running) this.draw(0)
  }

  /** Moves on to another kind; the chosen one in the settings stays as it is. */
  shuffle(rand: () => number = Math.random) {
    const others = ANIMATION_KINDS.filter((kind) => kind !== this.kind)
    const next = others[Math.floor(rand() * others.length) % others.length]
    this.setKind(next)
    return next
  }

  refreshColors() {
    const next = this.colors()
    if (JSON.stringify(next) === JSON.stringify(this.palette)) return
    this.palette = next
    if (!this.running) this.draw(0)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.w = Math.max(1, rect.width)
    this.h = Math.max(1, rect.height)
    this.canvas.width = Math.round(this.w * dpr)
    this.canvas.height = Math.round(this.h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.seed()
    if (!this.running) this.draw(0)
  }

  /** Items of the current kind, from a fixed seed, so a kind always starts the same way. */
  seed() {
    const random = seeded(this.kind.length * 7919 + 11)
    this.rand = random
    const count: Partial<Record<AnimationKind, number>> = { bokeh: 46, contactSheet: 60, kaleidoscope: 14, gradientMesh: 6, lightLeak: 4 }
    this.items = Array.from({ length: count[this.kind] ?? 0 }, (_, i) => ({ x: random() * this.w, y: random() * this.h, a: random(), b: random(), c: random(), i }))
    this.strokes = []
  }

  start() {
    this.wanted = true
    if (this.running || document.hidden) return
    this.running = true
    this.last = performance.now()
    requestAnimationFrame(this.loop)
  }

  stop() {
    this.wanted = false
    this.running = false
  }

  destroy() {
    this.stop()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.observer?.disconnect()
  }

  loop(now: number) {
    if (!this.running) return
    if (now - this.last >= FRAME_MS) {
      const dt = Math.min(0.1, (now - this.last) / 1000) * this.speed()
      this.last = now
      this.time += dt
      this.draw(dt)
    }
    requestAnimationFrame(this.loop)
  }

  draw(dt = 1 / 30) {
    const { ctx, w, h } = this
    const palette = this.palette
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = rgba(palette.bg, 1)
    ctx.fillRect(0, 0, w, h)
    this[this.kind](ctx, w, h, dt, { ...palette, strength: palette.dark ? 1 : 0.8 })
    ctx.globalCompositeOperation = 'source-over'
    this.frames += 1
  }

  /* --------------------------------------------------------- the backgrounds */

  /** Out-of-focus highlights drifting across the frame. */
  bokeh(ctx: Ctx, w: number, h: number, dt: number, o: Scene) {
    for (const p of this.items) {
      p.x += Math.cos(p.a * TAU + this.time * 0.15) * 12 * dt
      p.y += (Math.sin(p.b * TAU + this.time * 0.12) - 0.3) * 12 * dt
      const r = 16 + p.c * 60
      if (p.y < -r) p.y = h + r
      if (p.y > h + r) p.y = -r
      if (p.x < -r) p.x = w + r
      if (p.x > w + r) p.x = -r
      const colour = mix(mix(o.accent, o.warm, p.a), o.cool, p.b * 0.5)
      const breathe = 0.7 + 0.3 * Math.sin(this.time * 0.8 + p.i)
      ctx.fillStyle = rgba(colour, 0.09 * breathe * o.strength)
      ctx.strokeStyle = rgba(colour, 0.22 * breathe * o.strength)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }

  /** A lens iris opening and closing, with the barrel's rings around it. */
  aperture(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const blades = 7
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) * 0.42
    const open = 0.36 + 0.24 * Math.sin(this.time * 0.5)
    const turn = this.time * 0.1 + open
    for (let ring = 0; ring < 5; ring += 1) {
      ctx.strokeStyle = rgba(o.text, (0.05 + ring * 0.02) * o.strength)
      ctx.lineWidth = 1 + ring
      ctx.beginPath()
      ctx.arc(cx, cy, R * (1.05 + ring * 0.14), 0, TAU)
      ctx.stroke()
    }
    const inner = R * open
    const corners = Array.from({ length: blades }, (_, i) => {
      const angle = turn + (i / blades) * TAU
      return [cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner, angle]
    })
    corners.forEach(([x, y, angle], i) => {
      const next = corners[(i + 1) % blades]
      ctx.fillStyle = rgba(mix(o.accent, o.bg2, 0.35 + 0.08 * (i % 3)), 0.32 * o.strength)
      ctx.strokeStyle = rgba(o.accent, 0.42 * o.strength)
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(next[0], next[1])
      ctx.lineTo(cx + Math.cos(next[2] + 0.55) * R, cy + Math.sin(next[2] + 0.55) * R)
      ctx.lineTo(cx + Math.cos(angle + 0.55) * R, cy + Math.sin(angle + 0.55) * R)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
    glow(ctx, cx, cy, inner * 1.1, o.warm, 0.32 * o.strength)
  }

  /** Strips of film running past, each frame a small landscape. */
  filmStrip(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const strips = Math.max(2, Math.floor(h / 210))
    for (let s = 0; s < strips; s += 1) {
      const sh = 150
      const y = (h / strips) * (s + 0.5) - sh / 2
      const frame = 200
      const shift = ((this.time * (s % 2 ? 36 : -28)) % frame + frame) % frame
      ctx.fillStyle = rgba(mix(o.bg2, o.text, 0.06), 0.8 * o.strength)
      ctx.fillRect(0, y, w, sh)
      for (let x = -frame * 2 + shift, k = 0; x < w + frame; x += frame, k += 1) {
        const hue = (k * 53 + s * 90) % 360
        const sky = ctx.createLinearGradient(0, y + 22, 0, y + sh - 22)
        sky.addColorStop(0, rgba(hsl(hue, 0.5, 0.55), 0.5 * o.strength))
        sky.addColorStop(1, rgba(hsl(hue + 40, 0.55, 0.3), 0.5 * o.strength))
        ctx.fillStyle = sky
        ctx.fillRect(x + 8, y + 22, frame - 16, sh - 44)
        ctx.fillStyle = rgba(hsl(hue + 180, 0.25, 0.2), 0.5 * o.strength)
        ctx.beginPath()
        ctx.moveTo(x + 8, y + sh - 22)
        ctx.lineTo(x + 60, y + sh - 70)
        ctx.lineTo(x + 104, y + sh - 44)
        ctx.lineTo(x + 146, y + sh - 84)
        ctx.lineTo(x + frame - 8, y + sh - 22)
        ctx.fill()
        ctx.fillStyle = rgba(o.bg, 0.85)
        for (let hole = 0; hole < 6; hole += 1) {
          const hx = x + 10 + hole * (frame / 6)
          ctx.fillRect(hx, y + 6, 14, 10)
          ctx.fillRect(hx, y + sh - 16, 14, 10)
        }
      }
    }
  }

  /** The three channels of a histogram, breathing as if the exposure were changing. */
  histogram(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const t = this.time * 0.5
    const curves: [Rgb, number, number][] = [[[255, 80, 90], 0.28, 0.1], [[90, 220, 120], 0.5, 0.13], [[90, 140, 255], 0.72, 0.09]]
    ctx.globalCompositeOperation = o.dark ? 'lighter' : 'multiply'
    curves.forEach(([colour, centre, width], index) => {
      const middle = centre + 0.09 * Math.sin(t + index * 2)
      ctx.fillStyle = rgba(colour, 0.34 * o.strength)
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w; x += 6) {
        const f = x / w
        const value = Math.exp(-(((f - middle) / width) ** 2)) + 0.32 * Math.exp(-(((f - middle - 0.2) / (width * 0.55)) ** 2))
          + 0.05 * Math.sin(f * 90 + t * 3 + index) + 0.07
        ctx.lineTo(x, h - Math.max(0, value) * h * 0.66)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    })
  }

  /** A tone curve being adjusted over its grid. */
  toneCurve(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const size = Math.min(w, h) * 0.76
    const x0 = (w - size) / 2
    const y0 = (h - size) / 2
    ctx.lineWidth = 1
    for (let k = 0; k <= 8; k += 1) {
      ctx.strokeStyle = rgba(o.text, (k % 4 ? 0.06 : 0.13) * o.strength)
      ctx.beginPath()
      ctx.moveTo(x0 + (size * k) / 8, y0)
      ctx.lineTo(x0 + (size * k) / 8, y0 + size)
      ctx.moveTo(x0, y0 + (size * k) / 8)
      ctx.lineTo(x0 + size, y0 + (size * k) / 8)
      ctx.stroke()
    }
    ctx.strokeStyle = rgba(o.text, 0.16 * o.strength)
    ctx.beginPath()
    ctx.moveTo(x0, y0 + size)
    ctx.lineTo(x0 + size, y0)
    ctx.stroke()
    const t = this.time * 0.6
    const lift = 0.14 * Math.sin(t)
    const point = (f: number) => {
      const y = f + lift * Math.sin(f * TAU) + 0.05 * Math.sin(f * TAU * 2 + t * 0.7)
      return [x0 + f * size, y0 + size - Math.max(0, Math.min(1, y)) * size]
    }
    ([[255, 90, 100], [90, 220, 130], [110, 150, 255]] as Rgb[]).forEach((colour, index) => {
      ctx.strokeStyle = rgba(colour, 0.24 * o.strength)
      ctx.lineWidth = 1.4
      ctx.beginPath()
      for (let k = 0; k <= 80; k += 1) {
        const [x, y] = point(k / 80)
        const shift = (index - 1) * 10 * Math.sin((k / 80) * Math.PI)
        if (k) ctx.lineTo(x, y + shift)
        else ctx.moveTo(x, y + shift)
      }
      ctx.stroke()
    })
    ctx.strokeStyle = rgba(o.accent, 0.72 * o.strength)
    ctx.lineWidth = 2.4
    ctx.beginPath()
    for (let k = 0; k <= 80; k += 1) {
      const [x, y] = point(k / 80)
      if (k) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.stroke()
    for (const f of [0, 0.25, 0.75, 1]) {
      const [x, y] = point(f)
      ctx.fillStyle = rgba(o.bg, 1)
      ctx.strokeStyle = rgba(o.accent, 0.9 * o.strength)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }

  /** The hue wheel, turning, with rings of falling saturation. */
  colorWheel(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cx = w / 2
    const cy = h / 2
    const R = Math.min(w, h) * 0.46
    const segments = 60
    for (let ring = 0; ring < 5; ring += 1) {
      const outer = R * (1 - ring * 0.17)
      const inner = outer - R * 0.15
      const spin = this.time * (ring % 2 ? -0.07 : 0.09)
      for (let i = 0; i < segments; i += 1) {
        const from = spin + (i / segments) * TAU
        ctx.fillStyle = rgba(hsl((i / segments) * 360, 0.85 - ring * 0.12, 0.55), 0.34 * o.strength)
        ctx.beginPath()
        ctx.arc(cx, cy, outer, from, from + TAU / segments + 0.004)
        ctx.arc(cx, cy, inner, from + TAU / segments + 0.004, from, true)
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  /** Layers in a stack, floating apart and back, as the Layers panel would draw them in 3D. */
  layerStack(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cx = w / 2
    const cy = h / 2
    const size = Math.min(w, h) * 0.5
    const count = 7
    const spread = 34 + 22 * Math.sin(this.time * 0.5)
    for (let i = 0; i < count; i += 1) {
      const y = cy + ((count - 1) / 2 - i) * spread
      const wobble = Math.sin(this.time * 0.7 + i) * 10
      const colour = hsl(this.time * 8 + i * 40, 0.6, 0.55)
      ctx.fillStyle = rgba(colour, 0.2 * o.strength)
      ctx.strokeStyle = rgba(mix(colour, o.text, 0.3), 0.55 * o.strength)
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(cx - size + wobble, y)
      ctx.lineTo(cx + wobble, y - size * 0.42)
      ctx.lineTo(cx + size + wobble, y)
      ctx.lineTo(cx + wobble, y + size * 0.42)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  /** A halftone screen: dots swelling and shrinking under a moving light. */
  halftone(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const step = 20
    const t = this.time * 0.5
    ctx.fillStyle = rgba(o.accent, 0.42 * o.strength)
    ctx.beginPath()
    for (let row = 0, y = 0; y <= h + step; y += step * 0.87, row += 1) {
      for (let x = row % 2 ? step / 2 : 0; x <= w + step; x += step) {
        const value = 0.5 + 0.28 * Math.sin(x * 0.011 + t) + 0.22 * Math.cos(y * 0.014 - t * 0.8)
        const radius = Math.max(0, value) * step * 0.52
        ctx.moveTo(x + radius, y)
        ctx.arc(x, y, radius, 0, TAU)
      }
    }
    ctx.fill()
  }

  /** The picture as pixels: a slow colour field broken into tiles. */
  mosaic(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cell = 36
    const t = this.time * 0.25
    for (let y = 0, j = 0; y < h; y += cell, j += 1) {
      for (let x = 0, i = 0; x < w; x += cell, i += 1) {
        const field = Math.sin(i * 0.22 + t) + Math.cos(j * 0.27 - t * 0.8) + Math.sin((i + j) * 0.13 + t * 0.6)
        const flicker = Math.sin(i * 12.9 + j * 78.2 + t * 2)
        ctx.fillStyle = rgba(hsl(200 + field * 55, 0.55, 0.5), (0.13 + 0.09 * flicker + 0.05 * field) * o.strength)
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
      }
    }
  }

  /** Warm light leaking in from the edges of the film. */
  lightLeak(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    ctx.globalCompositeOperation = o.dark ? 'lighter' : 'source-over'
    const colours: Rgb[] = [[255, 120, 60], [255, 190, 90], [255, 70, 120], [o.accent[0], o.accent[1], o.accent[2]]]
    this.items.forEach((p, i) => {
      const x = w * (0.5 + 0.62 * Math.sin(this.time * (0.13 + p.a * 0.1) + i * 1.7))
      const y = h * (0.5 + 0.58 * Math.cos(this.time * (0.11 + p.b * 0.1) + i))
      glow(ctx, x, y, Math.max(w, h) * (0.32 + p.c * 0.24), colours[i % colours.length], 0.34 * o.strength)
    })
  }

  /** A light passing behind the lens, with the row of ghosts it makes. */
  lensFlare(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cx = w / 2
    const cy = h / 2
    const a = this.time * 0.22
    const lx = cx + Math.cos(a) * w * 0.38
    const ly = cy + Math.sin(a * 1.3) * h * 0.34
    ctx.globalCompositeOperation = o.dark ? 'lighter' : 'source-over'
    glow(ctx, lx, ly, Math.min(w, h) * 0.5, o.warm, 0.42 * o.strength)
    glow(ctx, lx, ly, 70, o.text, 0.72 * o.strength)
    ctx.fillStyle = rgba(o.text, 0.3 * o.strength)
    ctx.fillRect(lx - w * 0.4, ly - 1, w * 0.8, 2)
    const ghosts: [number, number, Rgb][] = [[0.35, 26, o.accent], [0.62, 50, [120, 220, 170]], [1.1, 18, o.warm], [1.45, 74, o.cool], [1.8, 38, [255, 120, 170]]]
    for (const [t, radius, colour] of ghosts) {
      const x = lx + (cx - lx) * t * 1.15
      const y = ly + (cy - ly) * t * 1.15
      ctx.fillStyle = rgba(colour, 0.13 * o.strength)
      ctx.strokeStyle = rgba(colour, 0.26 * o.strength)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, TAU)
      ctx.fill()
      ctx.stroke()
    }
  }

  /** Brush strokes laid down one after another and slowly fading. */
  brushStrokes(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const last = this.strokes[this.strokes.length - 1]
    if (!last || this.time - last.born > 0.7) {
      const x = this.rand() * w
      const y = this.rand() * h
      const angle = this.rand() * TAU
      const curve = (this.rand() - 0.5) * 0.04
      const points: number[][] = []
      for (let k = 0, a = angle, px = x, py = y; k < 44; k += 1) {
        points.push([px, py])
        a += curve
        px += Math.cos(a) * 16
        py += Math.sin(a) * 16
      }
      this.strokes.push({ points, hue: this.rand() * 360, width: 12 + this.rand() * 34, born: this.time })
      if (this.strokes.length > 26) this.strokes.shift()
    }
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const stroke of this.strokes) {
      const age = this.time - stroke.born
      const upto = Math.min(stroke.points.length, Math.ceil(age * 40) + 1)
      const fade = Math.max(0, 1 - age / 19)
      ctx.strokeStyle = rgba(hsl(stroke.hue, 0.6, 0.55), 0.3 * fade * o.strength)
      ctx.lineWidth = stroke.width
      ctx.beginPath()
      for (let k = 0; k < upto; k += 1) {
        const [x, y] = stroke.points[k]
        if (k) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
  }

  /** Red, green and blue discs orbiting: where they meet, they add up to white. */
  rgbChannels(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cx = w / 2
    const cy = h / 2
    const unit = Math.min(w, h)
    const orbit = unit * (0.15 + 0.03 * Math.sin(this.time * 0.4))
    const colours: Rgb[] = [[255, 40, 60], [40, 240, 90], [60, 90, 255]]
    ctx.globalCompositeOperation = o.dark ? 'lighter' : 'multiply'
    colours.forEach((colour, i) => {
      const angle = this.time * 0.25 + (i / 3) * TAU
      ctx.fillStyle = rgba(colour, 0.36 * o.strength)
      ctx.beginPath()
      ctx.arc(cx + Math.cos(angle) * orbit, cy + Math.sin(angle) * orbit, unit * 0.28, 0, TAU)
      ctx.fill()
    })
  }

  /** Film grain, with the band of a slow scan passing over it. */
  filmGrain(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const random = seeded(Math.floor(this.time * 14) + 1)
    const count = Math.min(5000, Math.floor((w * h) / 320))
    ctx.fillStyle = rgba(o.text, 0.22 * o.strength)
    for (let i = 0; i < count; i += 1) {
      const size = 1 + random() * 1.8
      ctx.fillRect(random() * w, random() * h, size, size)
    }
    const band = ((this.time * 0.07) % 1) * (h + 320) - 160
    const gradient = ctx.createLinearGradient(0, band - 160, 0, band + 160)
    gradient.addColorStop(0, rgba(o.accent, 0))
    gradient.addColorStop(0.5, rgba(o.accent, 0.2 * o.strength))
    gradient.addColorStop(1, rgba(o.accent, 0))
    ctx.fillStyle = gradient
    ctx.fillRect(0, band - 160, w, 320)
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72)
    vignette.addColorStop(0, rgba(o.bg, 0))
    vignette.addColorStop(1, rgba(o.bg, 0.9))
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, w, h)
  }

  /** A contact sheet scrolling past, with one picture picked out at a time. */
  contactSheet(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const cols = Math.max(4, Math.floor(w / 190))
    const tw = w / cols
    const th = tw * 0.72
    const rows = Math.ceil(h / th) + 1
    const shift = (this.time * 14) % th
    const picked = Math.floor(this.time / 2.2) % this.items.length
    for (let row = -1; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = ((row + 1000) * cols + col) % this.items.length
        const p = this.items[index]
        const x = col * tw + 6
        const y = row * th + shift + 6
        const hue = p.a * 360
        const sky = ctx.createLinearGradient(0, y, 0, y + th - 12)
        sky.addColorStop(0, rgba(hsl(hue, 0.5, 0.6), 0.3 * o.strength))
        sky.addColorStop(1, rgba(hsl(hue + 50, 0.5, 0.28), 0.3 * o.strength))
        ctx.fillStyle = sky
        ctx.fillRect(x, y, tw - 12, th - 12)
        ctx.fillStyle = rgba(hsl(hue + 190, 0.3, 0.2), 0.32 * o.strength)
        ctx.beginPath()
        ctx.moveTo(x, y + th - 12)
        ctx.lineTo(x + (tw - 12) * p.b, y + (th - 12) * (0.35 + p.c * 0.3))
        ctx.lineTo(x + tw - 12, y + th - 12)
        ctx.fill()
        if (index === picked) {
          ctx.strokeStyle = rgba(o.accent, 0.85 * o.strength)
          ctx.lineWidth = 3
          ctx.strokeRect(x - 1, y - 1, tw - 10, th - 10)
        }
      }
    }
  }

  /** Selections with their marching ants. */
  marchingAnts(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const t = this.time
    ctx.setLineDash([8, 7])
    ctx.lineDashOffset = -t * 26
    ctx.lineWidth = 1.6
    const shapes = 8
    for (let i = 0; i < shapes; i += 1) {
      const x = w * (0.5 + 0.38 * Math.sin(t * 0.13 + i * 1.9))
      const y = h * (0.5 + 0.36 * Math.cos(t * 0.11 + i * 2.7))
      const size = Math.min(w, h) * (0.1 + 0.04 * (i % 4))
      ctx.fillStyle = rgba(o.accent, 0.05 * o.strength)
      ctx.strokeStyle = rgba(i % 2 ? o.text : o.accent, 0.6 * o.strength)
      ctx.beginPath()
      if (i % 3 === 0) {
        ctx.rect(x - size, y - size * 0.7, size * 2, size * 1.4)
      } else if (i % 3 === 1) {
        ctx.ellipse(x, y, size, size * 0.72, 0, 0, TAU)
      } else {
        for (let k = 0; k <= 26; k += 1) {
          const angle = (k / 26) * TAU
          const radius = size * (0.8 + 0.28 * Math.sin(angle * 5 + i + t * 0.3))
          const px = x + Math.cos(angle) * radius
          const py = y + Math.sin(angle) * radius
          if (k) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        }
      }
      ctx.fill()
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
  }

  /** The theme's colours flowing into each other, like a gradient mesh. */
  gradientMesh(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const colours = [o.accent, o.warm, o.cool, mix(o.accent, o.warm, 0.5), o.bg2, mix(o.cool, o.text, 0.3)]
    this.items.forEach((p, i) => {
      const x = w * (0.5 + 0.5 * Math.sin(this.time * (0.09 + p.a * 0.08) + i * 1.3))
      const y = h * (0.5 + 0.5 * Math.cos(this.time * (0.08 + p.b * 0.08) + i * 2.1))
      glow(ctx, x, y, Math.max(w, h) * 0.46, colours[i], 0.42 * o.strength)
    })
  }

  /** Coloured shards in twelve mirrored wedges. */
  kaleidoscope(ctx: Ctx, w: number, h: number, _dt: number, o: Scene) {
    const R = Math.max(w, h) * 0.62
    const wedges = 12
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(this.time * 0.05)
    for (let wedge = 0; wedge < wedges; wedge += 1) {
      ctx.save()
      ctx.rotate((wedge / wedges) * TAU)
      if (wedge % 2) ctx.scale(1, -1)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, R, 0, TAU / wedges)
      ctx.closePath()
      ctx.clip()
      for (const p of this.items) {
        const distance = R * ((p.a + this.time * 0.02 * (0.4 + p.b)) % 1)
        const angle = p.b * (TAU / wedges)
        const x = Math.cos(angle) * distance
        const y = Math.sin(angle) * distance
        const size = 30 + p.c * 76
        ctx.fillStyle = rgba(hsl(p.c * 360 + this.time * 6, 0.65, 0.55), 0.22 * o.strength)
        ctx.beginPath()
        ctx.moveTo(x, y - size)
        ctx.lineTo(x + size, y + size * 0.6)
        ctx.lineTo(x - size, y + size * 0.6)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }
    ctx.restore()
  }
}
