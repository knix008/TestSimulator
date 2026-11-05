// The start screen's moving backgrounds, all drawn on a 2D canvas in the colours of the current
// theme. Each one is a pure function of time, so a frame can be drawn at any moment, which is
// also how the picker draws its thumbnails. They are about ideas: branches, bones, neurons, notes.
const TAU = Math.PI * 2

type Rgb = readonly [number, number, number]
export type Palette = { bg: Rgb; panel: Rgb; ink: Rgb; muted: Rgb; line: Rgb; accent: Rgb }
type Frame = { ctx: CanvasRenderingContext2D; w: number; h: number; t: number; p: Palette; u: number }

/** A repeatable random number in 0..1 for an index. */
const rnd = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const rgba = (c: Rgb, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`
const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const wrap = (value: number, size: number) => ((value % size) + size) % size

/** How large marks are drawn: thumbnails use the same drawings at a smaller scale. */
const unit = (w: number, h: number) => Math.max(0.35, Math.min(w, h) / 700)

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function curve(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2)
  ctx.stroke()
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
}

/** One topic box with its text suggested by a bar. */
function topic(ctx: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number, u: number, fill: string, stroke: string, bar: string) {
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.4 * u
  round(ctx, x - bw / 2, y - bh / 2, bw, bh, Math.min(bh / 2, 9 * u))
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = bar
  ctx.fillRect(x - bw * 0.28, y - 1.5 * u, bw * 0.56, 3 * u)
}

const DRAW: Record<string, (frame: Frame) => void> = {
  /* A mind map growing from its centre, branch by branch, again and again. */
  mindBloom({ ctx, w, h, t, p, u }) {
    const cx = w / 2
    const cy = h / 2
    const cycle = wrap(t * 0.07, 1)
    const grown = Math.min(1, cycle * 1.5)
    const fade = cycle > 0.85 ? (1 - cycle) / 0.15 : 1
    const reach = Math.max(w, h) * 0.58
    const main = 7
    for (let i = 0; i < main; i++) {
      const a = (i / main) * TAU + t * 0.015 + 0.4
      const x1 = cx + Math.cos(a) * reach * 0.34 * grown
      const y1 = cy + Math.sin(a) * reach * 0.34 * grown
      ctx.lineWidth = 3 * u
      ctx.strokeStyle = rgba(p.accent, 0.55 * fade)
      curve(ctx, cx, cy, x1, y1)
      for (let n = 0; n < 4; n++) {
        const local = Math.max(0, Math.min(1, grown * 4 - 1 - n * 0.5))
        if (!local) continue
        const b = a + (n - 1.5) * 0.3
        const x2 = x1 + Math.cos(b) * reach * 0.3 * local
        const y2 = y1 + Math.sin(b) * reach * 0.3 * local
        ctx.lineWidth = 1.6 * u
        ctx.strokeStyle = rgba(mix(p.accent, p.muted, 0.4), 0.5 * fade)
        curve(ctx, x1, y1, x2, y2)
        topic(ctx, x2, y2, 66 * u * local, 22 * u * local, u, rgba(p.panel, 0.65 * fade), rgba(p.accent, 0.4 * fade), rgba(p.muted, 0.5 * fade))
      }
      topic(ctx, x1, y1, 92 * u, 28 * u, u, rgba(p.panel, 0.85 * fade), rgba(p.accent, 0.7 * fade), rgba(p.accent, 0.6 * fade))
    }
    topic(ctx, cx, cy, 150 * u, 46 * u, u, rgba(p.accent, 0.5), rgba(p.accent, 0.9), rgba(p.panel, 0.8))
  },
  /* Fishbone skeletons swimming across. */
  fishbones({ ctx, w, h, t, p, u }) {
    for (let f = 0; f < 6; f++) {
      const length = (300 + rnd(f) * 240) * u
      const speed = (14 + rnd(f + 10) * 16) * u
      const dir = f % 2 ? -1 : 1
      const x = wrap(rnd(f + 20) * w + dir * t * speed, w + length * 2) - length
      const y = ((f + 0.5) / 6) * h + Math.sin(t * 0.3 + f) * 14 * u
      const head = x + (dir > 0 ? length : 0)
      const tail = x + (dir > 0 ? 0 : length)
      ctx.lineWidth = 3 * u
      ctx.strokeStyle = rgba(p.accent, 0.6)
      line(ctx, tail, y, head, y)
      topic(ctx, head + dir * 34 * u, y, 68 * u, 30 * u, u, rgba(p.accent, 0.28), rgba(p.accent, 0.75), rgba(p.ink, 0.45))
      for (let n = 1; n <= 5; n++) {
        const bx = tail + ((head - tail) * n) / 6
        const swing = Math.sin(t * 0.8 + n + f) * 6 * u
        for (const side of [-1, 1]) {
          const ex = bx - dir * 44 * u + swing
          const ey = y + side * (70 + rnd(f * 7 + n) * 22) * u
          ctx.lineWidth = 1.6 * u
          ctx.strokeStyle = rgba(mix(p.accent, p.muted, 0.35), 0.55)
          line(ctx, bx, y, ex, ey)
          ctx.lineWidth = 1 * u
          ctx.strokeStyle = rgba(p.muted, 0.45)
          for (let k = 0.35; k < 0.9; k += 0.3) {
            const sx = bx + (ex - bx) * k
            const sy = y + (ey - y) * k
            line(ctx, sx, sy, sx - dir * 24 * u, sy)
          }
        }
      }
    }
  },
  /* Neurons with signals travelling along their links. */
  neurons({ ctx, w, h, t, p, u }) {
    const count = 34
    const at = (i: number): [number, number] => [
      rnd(i) * w + Math.sin(t * 0.14 + i) * 24 * u,
      rnd(i + 70) * h + Math.cos(t * 0.11 + i * 2) * 24 * u,
    ]
    for (let i = 0; i < count; i++) {
      const [x, y] = at(i)
      for (let n = 1; n <= 3; n++) {
        const j = Math.floor(rnd(i * 5 + n) * count)
        if (j === i) continue
        const [ex, ey] = at(j)
        if (Math.hypot(ex - x, ey - y) > 340 * u) continue
        ctx.lineWidth = 1.2 * u
        ctx.strokeStyle = rgba(p.line, 0.85)
        curve(ctx, x, y, ex, ey)
        const k = wrap(t * (0.1 + rnd(i + n) * 0.2) + rnd(i * n), 1)
        const e = k * k * (3 - 2 * k)
        const mx = (x + ex) / 2
        // The curve's own formula, so a signal stays on its link.
        const px = (1 - k) ** 3 * x + 3 * (1 - k) ** 2 * k * mx + 3 * (1 - k) * k * k * mx + k ** 3 * ex
        const py = (1 - k) ** 3 * y + 3 * (1 - k) ** 2 * k * y + 3 * (1 - k) * k * k * ey + k ** 3 * ey
        ctx.fillStyle = rgba(p.accent, 0.35 + 0.6 * e)
        dot(ctx, px, py, 3.2 * u)
      }
    }
    for (let i = 0; i < count; i++) {
      const [x, y] = at(i)
      const pulse = Math.sin(t * 1.3 + i) * 0.5 + 0.5
      ctx.fillStyle = rgba(p.accent, 0.12 + 0.18 * pulse)
      dot(ctx, x, y, (10 + pulse * 7) * u)
      ctx.fillStyle = rgba(p.accent, 0.8)
      dot(ctx, x, y, 3.6 * u)
    }
  },
  /* Sparks jumping between thoughts that come close. */
  synapse({ ctx, w, h, t, p, u }) {
    const points: [number, number][] = []
    for (let i = 0; i < 44; i++) {
      points.push([
        wrap(rnd(i) * w + t * (rnd(i + 80) - 0.5) * 30 * u, w),
        wrap(rnd(i + 160) * h + t * (rnd(i + 240) - 0.5) * 30 * u, h),
      ])
    }
    const reach = 190 * u
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[j]
        const d = Math.hypot(x1 - x2, y1 - y2)
        if (d > reach) continue
        const glow = 1 - d / reach
        const flicker = Math.sin(t * 7 + i * j) * 0.5 + 0.5
        ctx.lineWidth = (0.8 + glow * 1.8) * u
        ctx.strokeStyle = rgba(p.accent, glow * (0.2 + flicker * 0.5))
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        for (let s = 1; s < 4; s++) {
          const k = s / 4
          const jolt = (rnd(i + j + s + Math.floor(t * 9)) - 0.5) * 16 * u * glow
          ctx.lineTo(x1 + (x2 - x1) * k + jolt, y1 + (y2 - y1) * k - jolt)
        }
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }
    ctx.fillStyle = rgba(p.accent, 0.85)
    for (const [x, y] of points) dot(ctx, x, y, 2.8 * u)
  },
  /* A top-down tree of boxes with elbow lines, sliding along. */
  treeChart({ ctx, w, h, t, p, u }) {
    const levelGap = 104 * u
    const drift = wrap(t * 9 * u, 188 * u)
    for (let row = 0, y = 34 * u; y < h + levelGap; row++, y += levelGap) {
      const gap = (188 * u) / 2 ** (row % 3)
      const offset = row % 2 ? -drift : drift - gap
      for (let x = offset; x < w + gap; x += gap) {
        const i = Math.round(x / gap) + row * 31
        const pulse = Math.sin(t * 0.8 + i) * 0.5 + 0.5
        if (y + levelGap < h + levelGap) {
          ctx.lineWidth = 1.4 * u
          ctx.strokeStyle = rgba(p.line, 0.9)
          ctx.beginPath()
          ctx.moveTo(x, y + 13 * u)
          ctx.lineTo(x, y + levelGap / 2)
          ctx.lineTo(x + gap * 0.3 * (i % 2 ? 1 : -1), y + levelGap / 2)
          ctx.lineTo(x + gap * 0.3 * (i % 2 ? 1 : -1), y + levelGap - 13 * u)
          ctx.stroke()
        }
        topic(ctx, x, y, Math.min(84 * u, gap * 0.8), 26 * u, u, rgba(p.panel, 0.7), rgba(p.accent, 0.25 + pulse * 0.45), rgba(p.muted, 0.55))
      }
    }
  },
  /* Thought bubbles rising, each with its two small trailing bubbles. */
  ideaBubbles({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 34; i++) {
      const r = (14 + rnd(i) * 40) * u
      const y = wrap(rnd(i + 70) * h - t * (10 + rnd(i + 140) * 22) * u, h + r * 4) - r * 2
      const x = rnd(i + 210) * w + Math.sin(t * 0.5 + i) * 18 * u
      ctx.lineWidth = 1.4 * u
      ctx.strokeStyle = rgba(p.accent, 0.55)
      ctx.fillStyle = rgba(p.accent, 0.09)
      for (const [dx, dy, size] of [[0, 0, 1], [r * 0.9, r * 1.2, 0.2], [r * 1.25, r * 1.65, 0.11]]) {
        ctx.beginPath()
        ctx.arc(x + dx, y + dy, r * size, 0, TAU)
        ctx.fill()
        ctx.stroke()
      }
      ctx.fillStyle = rgba(p.accent, 0.5)
      for (let n = -1; n <= 1; n++) dot(ctx, x + n * r * 0.34, y, Math.max(1, r * 0.08))
    }
  },
  /* Sticky notes drifting past. */
  stickyNotes({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 24; i++) {
      const size = (64 + rnd(i) * 64) * u
      const x = wrap(rnd(i + 80) * w + t * (7 + rnd(i + 120) * 16) * u, w + size * 2) - size
      const y = rnd(i + 160) * (h - size * 0.5)
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rnd(i + 200) - 0.5) * 0.4 + Math.sin(t * 0.4 + i) * 0.04)
      ctx.fillStyle = rgba(mix(p.panel, p.accent, 0.08 + rnd(i + 30) * 0.28), 0.8)
      ctx.strokeStyle = rgba(p.accent, 0.45)
      ctx.lineWidth = 1.2 * u
      ctx.beginPath()
      ctx.moveTo(-size / 2, -size / 2)
      ctx.lineTo(size / 2, -size / 2)
      ctx.lineTo(size / 2, size / 2 - size * 0.18)
      ctx.lineTo(size / 2 - size * 0.18, size / 2)
      ctx.lineTo(-size / 2, size / 2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = rgba(p.muted, 0.6)
      for (let n = 0; n < 3; n++) ctx.fillRect(-size * 0.34, -size * 0.28 + n * size * 0.2, size * (0.68 - n * 0.14), 2.6 * u)
      ctx.restore()
    }
  },
  /* Topics orbiting a central one. */
  orbits({ ctx, w, h, t, p, u }) {
    const cx = w / 2
    const cy = h / 2
    const rings = 6
    for (let r = 1; r <= rings; r++) {
      const radius = r * 104 * u
      ctx.lineWidth = 1 * u
      ctx.strokeStyle = rgba(p.line, 0.8)
      ctx.beginPath()
      ctx.ellipse(cx, cy, radius * 1.3, radius * 0.86, 0, 0, TAU)
      ctx.stroke()
      const count = 2 + r
      for (let n = 0; n < count; n++) {
        const a = (n / count) * TAU + t * (0.16 / r) * (r % 2 ? 1 : -1) + r
        const x = cx + Math.cos(a) * radius * 1.3
        const y = cy + Math.sin(a) * radius * 0.86
        ctx.lineWidth = 1 * u
        ctx.strokeStyle = rgba(p.accent, 0.16)
        line(ctx, cx, cy, x, y)
        topic(ctx, x, y, 66 * u, 24 * u, u, rgba(p.panel, 0.8), rgba(p.accent, 0.6), rgba(p.muted, 0.6))
      }
    }
    topic(ctx, cx, cy, 124 * u, 42 * u, u, rgba(p.accent, 0.5), rgba(p.accent, 0.9), rgba(p.panel, 0.85))
  },
  /* A drawing grid with a selection frame moving between shapes. */
  blueprint({ ctx, w, h, t, p, u }) {
    const step = 40 * u
    const drift = wrap(t * 10 * u, step * 5)
    ctx.lineWidth = 1
    for (let x = -drift, n = 0; x < w; x += step, n++) {
      ctx.strokeStyle = rgba(p.line, n % 5 ? 0.35 : 0.9)
      line(ctx, x, 0, x, h)
    }
    for (let y = -drift, n = 0; y < h; y += step, n++) {
      ctx.strokeStyle = rgba(p.line, n % 5 ? 0.35 : 0.9)
      line(ctx, 0, y, w, y)
    }
    for (let i = 0; i < 7; i++) {
      const s = Math.floor(t * 0.25 + rnd(i) * 9)
      const x = Math.floor(rnd(s * 3 + i) * (w / step)) * step - drift
      const y = Math.floor(rnd(s * 5 + i + 9) * (h / step)) * step - drift
      const bw = (3 + Math.floor(rnd(s + i) * 6)) * step
      const bh = (2 + Math.floor(rnd(s + i + 3) * 4)) * step
      ctx.lineWidth = 1.6 * u
      ctx.strokeStyle = rgba(p.accent, 0.8)
      ctx.fillStyle = rgba(p.accent, 0.08)
      ctx.fillRect(x, y, bw, bh)
      ctx.strokeRect(x, y, bw, bh)
      ctx.fillStyle = rgba(p.accent, 0.9)
      for (const [hx, hy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.fillRect(x + hx * bw - 3 * u, y + hy * bh - 3 * u, 6 * u, 6 * u)
    }
  },
  /* Branching trees swaying in a slow wind. */
  branches({ ctx, w, h, t, p, u }) {
    const branch = (x: number, y: number, angle: number, length: number, depth: number, seed: number) => {
      const x2 = x + Math.cos(angle) * length
      const y2 = y + Math.sin(angle) * length
      ctx.lineWidth = Math.max(0.7, depth * 1.1 * u)
      ctx.strokeStyle = rgba(mix(p.line, p.accent, 1 - depth / 7), 0.8)
      line(ctx, x, y, x2, y2)
      if (depth <= 1) {
        ctx.fillStyle = rgba(p.accent, 0.5)
        dot(ctx, x2, y2, 2.6 * u)
        return
      }
      const sway = Math.sin(t * 0.6 + seed) * 0.05
      branch(x2, y2, angle - 0.38 - rnd(seed) * 0.26 + sway, length * 0.76, depth - 1, seed * 2 + 1)
      branch(x2, y2, angle + 0.38 + rnd(seed + 3) * 0.26 + sway, length * 0.72, depth - 1, seed * 2 + 2)
    }
    const trees = Math.max(2, Math.round(w / (340 * u)))
    for (let i = 0; i < trees; i++) branch(((i + 0.5) / trees) * w, h + 4, -Math.PI / 2 + (i - trees / 2) * 0.02, Math.min(h * 0.22, 120 * u) * (0.85 + rnd(i) * 0.35), 7, i + 1)
  },
  /* Long tapering lines flowing like roots. */
  flowRoots({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 26; i++) {
      const y0 = rnd(i) * h
      const amp = (30 + rnd(i + 30) * 90) * u
      const freq = 0.003 + rnd(i + 60) * 0.005
      const speed = 0.12 + rnd(i + 90) * 0.3
      const steps = 40
      for (let s = 0; s < steps; s++) {
        const x1 = (s / steps) * w
        const x2 = ((s + 1) / steps) * w
        const yAt = (x: number) => y0 + Math.sin(x * (freq / u) + t * speed + i) * amp + Math.sin(x * (freq / u) * 2.3 - t * speed * 0.7) * amp * 0.3
        ctx.lineWidth = Math.max(0.5, (5 * u * (steps - s)) / steps)
        ctx.strokeStyle = rgba(mix(p.accent, p.line, s / steps), 0.5)
        line(ctx, x1, yAt(x1), x2 + 0.5, yAt(x2))
      }
    }
  },
  /* Points that connect when close. */
  constellation({ ctx, w, h, t, p, u }) {
    const points: [number, number][] = []
    for (let i = 0; i < 64; i++) {
      points.push([
        wrap(rnd(i) * w + Math.sin(t * 0.2 + i) * 60 * u + t * (rnd(i + 80) - 0.5) * 18 * u, w),
        wrap(rnd(i + 160) * h + Math.cos(t * 0.17 + i * 2) * 60 * u + t * (rnd(i + 240) - 0.5) * 18 * u, h),
      ])
    }
    const reach = 150 * u
    ctx.lineWidth = 1 * u
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1])
        if (d < reach) {
          ctx.strokeStyle = rgba(p.accent, 0.4 * (1 - d / reach))
          line(ctx, points[i][0], points[i][1], points[j][0], points[j][1])
        }
      }
    }
    ctx.fillStyle = rgba(p.accent, 0.75)
    for (const [x, y] of points) dot(ctx, x, y, 3 * u)
  },
  /* Rings spreading from where an idea landed. */
  ripples({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 16; i++) {
      const period = 3 + rnd(i) * 4
      const n = Math.floor(t / period + rnd(i + 30))
      const age = wrap(t / period + rnd(i + 30), 1)
      const x = rnd(n * 13 + i) * w
      const y = rnd(n * 17 + i + 5) * h
      for (let ring = 0; ring < 3; ring++) {
        const k = age - ring * 0.1
        if (k <= 0) continue
        ctx.lineWidth = 2 * u
        ctx.strokeStyle = rgba(p.accent, 0.6 * (1 - k))
        ctx.beginPath()
        ctx.arc(x, y, k * 230 * u, 0, TAU)
        ctx.stroke()
      }
    }
  },
  /* Soft moving bands of colour. */
  aurora({ ctx, w, h, t, p }) {
    for (let band = 0; band < 5; band++) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h)
      const colour = mix(p.accent, p.ink, band * 0.08)
      gradient.addColorStop(0, rgba(colour, 0))
      gradient.addColorStop(0.5, rgba(colour, 0.2))
      gradient.addColorStop(1, rgba(colour, 0))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let x = 0; x <= w; x += Math.max(8, w / 60)) {
        const y = h * (0.3 + band * 0.09) + Math.sin(x * 0.004 + t * (0.3 + band * 0.08) + band) * h * 0.14 + Math.sin(x * 0.011 - t * 0.2) * h * 0.05
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fill()
    }
  },
  /* A honeycomb with light moving through it. */
  honeycomb({ ctx, w, h, t, p, u }) {
    const r = 30 * u
    const dx = r * Math.sqrt(3)
    const dy = r * 1.5
    for (let row = -1, y = -dy; y < h + r; row++, y = row * dy) {
      for (let col = -1; (col - 1) * dx < w; col++) {
        const x = col * dx + (row % 2 ? dx / 2 : 0)
        const glow = Math.sin((x * 0.006) / u + (y * 0.008) / u - t * 0.9) * 0.5 + 0.5
        ctx.beginPath()
        for (let s = 0; s < 6; s++) {
          const a = (s / 6) * TAU + Math.PI / 6
          const px = x + Math.cos(a) * r * 0.92
          const py = y + Math.sin(a) * r * 0.92
          if (s) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        }
        ctx.closePath()
        ctx.fillStyle = rgba(p.accent, glow * glow * 0.32)
        ctx.fill()
        ctx.lineWidth = 1 * u
        ctx.strokeStyle = rgba(p.line, 0.75)
        ctx.stroke()
      }
    }
  },
  /* Words on the way to becoming topics. */
  wordCloud({ ctx, w, h, t, p, u }) {
    const WORDS = ['IDEA', '아이디어', 'WHY', '왜', 'HOW', '어떻게', 'GOAL', '목표', 'PLAN', '계획', 'CAUSE', '원인', 'EFFECT', '결과', 'TOPIC', '주제', 'NOTE', '메모', 'THINK', '생각', 'MAP', '지도', 'LINK', '연결']
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < 44; i++) {
      const size = Math.max(7, (12 + rnd(i) * 34) * u)
      const x = wrap(rnd(i + 50) * w + t * (rnd(i + 100) - 0.5) * 36 * u, w)
      const y = wrap(rnd(i + 150) * h + t * (rnd(i + 200) - 0.5) * 22 * u, h)
      const pulse = Math.sin(t * 0.7 + i) * 0.5 + 0.5
      ctx.font = `600 ${size}px "Segoe UI", "Malgun Gothic", sans-serif`
      ctx.fillStyle = i % 4 ? rgba(p.muted, 0.14 + pulse * 0.22) : rgba(p.accent, 0.25 + pulse * 0.45)
      ctx.fillText(WORDS[i % WORDS.length], x, y)
    }
    ctx.textAlign = 'left'
  },
  /* Pencil lines being drawn, then fading. */
  sketch({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 22; i++) {
      const period = 5 + rnd(i) * 6
      const n = Math.floor(t / period + rnd(i + 7))
      const age = wrap(t / period + rnd(i + 7), 1)
      const seed = n * 41 + i
      const x = rnd(seed) * w
      const y = rnd(seed + 1) * h
      const size = (50 + rnd(seed + 2) * 110) * u
      const kind = i % 3
      const drawn = Math.min(1, age * 2.2)
      const alpha = age > 0.7 ? (1 - age) / 0.3 : 1
      ctx.lineWidth = 1.6 * u
      ctx.strokeStyle = rgba(i % 2 ? p.accent : p.muted, 0.65 * alpha)
      ctx.beginPath()
      const steps = 46
      for (let s = 0; s <= steps * drawn; s++) {
        const k = s / steps
        const jitter = (rnd(seed + s) - 0.5) * 2.4 * u
        let px = x
        let py = y
        if (kind === 0) {
          px += Math.cos(k * TAU) * size + jitter
          py += Math.sin(k * TAU) * size * 0.6 + jitter
        } else if (kind === 1) {
          const side = Math.floor(k * 4) % 4
          const f = k * 4 - Math.floor(k * 4)
          const corners = [[-1, -0.6], [1, -0.6], [1, 0.6], [-1, 0.6], [-1, -0.6]]
          px += (corners[side][0] + (corners[side + 1][0] - corners[side][0]) * f) * size + jitter
          py += (corners[side][1] + (corners[side + 1][1] - corners[side][1]) * f) * size + jitter
        } else {
          px += (k - 0.5) * size * 2.4 + jitter
          py += Math.sin(k * 9) * size * 0.2 + jitter
        }
        if (s === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  },
  /* 3D: topics on a turning globe, all tied to its centre. */
  globe3D({ ctx, w, h, t, p, u }) {
    const size = Math.min(w, h) * 0.46
    const cx = w / 2
    const cy = h / 2
    const yaw = t * 0.18
    const tilt = 0.35
    const items = []
    for (let i = 0; i < 90; i++) {
      const lat = Math.acos(1 - (2 * (i + 0.5)) / 90)
      const lon = Math.PI * (1 + Math.sqrt(5)) * i
      const x = Math.sin(lat) * Math.cos(lon + yaw)
      const z0 = Math.sin(lat) * Math.sin(lon + yaw)
      const y0 = Math.cos(lat)
      const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt)
      const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt)
      const d = 2.4 / (2.4 - z)
      items.push({ px: cx + x * size * d, py: cy + y * size * d, z, i })
    }
    items.sort((a, b) => a.z - b.z)
    for (const { px, py, z, i } of items) {
      const near = (z + 1) / 2
      ctx.lineWidth = (0.5 + near) * u
      ctx.strokeStyle = rgba(p.accent, 0.08 + near * 0.28)
      line(ctx, cx, cy, px, py)
      ctx.fillStyle = rgba(mix(p.line, p.accent, near), 0.35 + near * 0.6)
      dot(ctx, px, py, (2 + near * (4 + (i % 3) * 2)) * u)
    }
    ctx.fillStyle = rgba(p.accent, 0.8)
    dot(ctx, cx, cy, 12 * u)
  },
  /* 3D: a turning tree of topics. */
  tree3D({ ctx, w, h, t, p, u }) {
    const size = Math.min(w, h)
    const yaw = t * 0.22
    const project = (x: number, y: number, z: number): [number, number, number] => {
      const rx = x * Math.cos(yaw) - z * Math.sin(yaw)
      const rz = x * Math.sin(yaw) + z * Math.cos(yaw)
      const d = 3 / (3 - rz)
      return [w / 2 + rx * size * 0.42 * d, h * 0.54 + y * size * 0.42 * d, rz]
    }
    const grow = (x: number, y: number, z: number, angle: number, length: number, depth: number) => {
      const [px, py, near] = project(x, y, z)
      if (depth === 0) {
        ctx.fillStyle = rgba(p.accent, 0.35 + (near + 1) * 0.3)
        dot(ctx, px, py, (3 + (near + 1) * 2) * u)
        return
      }
      for (let n = 0; n < 3; n++) {
        const a = angle + (n / 3) * TAU
        const nx = x + Math.cos(a) * length
        const ny = y - length * 0.9
        const nz = z + Math.sin(a) * length
        const [qx, qy, depthZ] = project(nx, ny, nz)
        ctx.lineWidth = Math.max(0.6, depth * 0.8 * u)
        ctx.strokeStyle = rgba(mix(p.line, p.accent, (depthZ + 1) / 2), 0.7)
        line(ctx, px, py, qx, qy)
        grow(nx, ny, nz, a + 0.7, length * 0.6, depth - 1)
      }
    }
    grow(0, 0.9, 0, 0, 0.55, 4)
  },
  /* 3D: flying through rings. */
  tunnel3D({ ctx, w, h, t, p, u }) {
    const cx = w / 2 + Math.sin(t * 0.4) * w * 0.08
    const cy = h / 2 + Math.cos(t * 0.33) * h * 0.08
    const scale = Math.hypot(w, h) * 0.35
    const offset = wrap(t * 0.7, 1)
    for (let n = 22; n >= 1; n--) {
      const depth = n - offset
      const r = scale / depth
      ctx.lineWidth = Math.max(0.6, (5 * u) / depth)
      ctx.strokeStyle = rgba(mix(p.accent, p.line, Math.min(1, depth / 14)), Math.min(0.85, 1.6 / depth + 0.1))
      ctx.beginPath()
      for (let s = 0; s <= 8; s++) {
        const a = (s / 8) * TAU + t * 0.1
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        if (s === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    ctx.strokeStyle = rgba(p.line, 0.5)
    ctx.lineWidth = 1 * u
    for (let s = 0; s < 8; s++) {
      const a = (s / 8) * TAU + t * 0.1
      line(ctx, cx + Math.cos(a) * (scale / 22), cy + Math.sin(a) * (scale / 22), cx + Math.cos(a) * scale * 2, cy + Math.sin(a) * scale * 2)
    }
  },
  /* 3D: a landscape of lines flying by. */
  terrain3D({ ctx, w, h, t, p, u }) {
    const rows = 30
    const cols = 34
    const height = (x: number, z: number) => (Math.sin(x * 0.55 + z * 0.3) + Math.sin(x * 0.2 - z * 0.45) * 1.6 + Math.sin((x + z) * 0.9) * 0.4) * 0.55
    const project = (x: number, z: number, y: number) => {
      const d = 1 + z * 0.32
      return [w / 2 + (x * w * 0.22) / d, h * 0.28 + ((h * 1.0 - y * h * 0.2) / d) * 0.72]
    }
    ctx.lineWidth = 1.1 * u
    const shift = t * 0.8
    const offset = shift - Math.floor(shift)
    for (let r = rows; r >= 0; r--) {
      const z = r - offset
      if (z < 0) continue
      ctx.strokeStyle = rgba(mix(p.accent, p.line, r / rows), 0.75 * (1 - r / rows) + 0.1)
      ctx.beginPath()
      for (let c = -cols / 2; c <= cols / 2; c++) {
        const [px, py] = project(c, z, height(c * 0.5, r + Math.floor(shift)))
        if (c === -cols / 2) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
    }
  },
  /* 3D: topic cards rising and falling on a slowly turning board. */
  cards3D({ ctx, w, h, t, p, u }) {
    const yaw = t * 0.12
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const project = (x: number, y: number, z: number) => {
      const rx = x * cos - y * sin
      const ry = x * sin + y * cos
      const d = 5 + ry * 0.55
      return [w / 2 + (rx * w * 0.42) / (d * 0.5), h * 0.5 + ((ry * 0.5 - z) * h * 0.42) / (d * 0.5)]
    }
    const items = []
    for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) items.push({ gx, gy, order: gx * sin + gy * cos })
    items.sort((a, b) => a.order - b.order)
    for (const { gx, gy } of items) {
      const i = gx * 19 + gy * 7 + 100
      const lift = 0.1 + (Math.sin(t * 0.8 + rnd(i) * TAU) * 0.5 + 0.5) * 0.36
      const s = 0.36
      const corners = [[-s, -s], [s, -s], [s, s], [-s, s]]
      const top = corners.map(([a, b]) => project(gx + a, gy + b, lift))
      const low = corners.map(([a, b]) => project(gx + a, gy + b, 0))
      ctx.lineWidth = 1 * u
      ctx.strokeStyle = rgba(p.accent, 0.5)
      ctx.fillStyle = rgba(p.line, 0.5)
      for (let e = 0; e < 4; e++) {
        const f = (e + 1) % 4
        ctx.beginPath()
        ctx.moveTo(low[e][0], low[e][1])
        ctx.lineTo(low[f][0], low[f][1])
        ctx.lineTo(top[f][0], top[f][1])
        ctx.lineTo(top[e][0], top[e][1])
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.fillStyle = rgba(mix(p.line, p.accent, rnd(i + 9)), 0.75)
      ctx.beginPath()
      top.forEach(([x, y], e) => (e ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  },
  /* 3D: stars streaming past. */
  starfield3D({ ctx, w, h, t, p, u }) {
    for (let i = 0; i < 260; i++) {
      const z = 1 - wrap(rnd(i) + t * (0.05 + rnd(i + 300) * 0.05), 1)
      const x = (rnd(i + 600) - 0.5) * w * 1.4
      const y = (rnd(i + 900) - 0.5) * h * 1.4
      const d = z * 0.95 + 0.05
      const px = w / 2 + x / d
      const py = h / 2 + y / d
      const qx = w / 2 + x / (d + 0.03)
      const qy = h / 2 + y / (d + 0.03)
      ctx.lineWidth = Math.max(0.6, 2.4 * u * (1 - z))
      ctx.strokeStyle = rgba(i % 5 ? p.muted : p.accent, 0.85 * (1 - z))
      line(ctx, px, py, qx, qy)
    }
  },
  /* 3D: a rotating lattice of linked topics. */
  lattice3D({ ctx, w, h, t, p, u }) {
    const a = t * 0.3
    const b = t * 0.21
    const project = (x: number, y: number, z: number): [number, number, number] => {
      const x1 = x * Math.cos(a) - z * Math.sin(a)
      const z1 = x * Math.sin(a) + z * Math.cos(a)
      const y1 = y * Math.cos(b) - z1 * Math.sin(b)
      const z2 = y * Math.sin(b) + z1 * Math.cos(b)
      const d = 5.4 + z2
      return [w / 2 + (x1 * Math.min(w, h) * 1.15) / d, h / 2 + (y1 * Math.min(w, h) * 1.15) / d, d]
    }
    const n = 2
    const stroke = (from: [number, number, number], to: [number, number, number]) => {
      const depth = (from[2] + to[2]) / 2
      ctx.lineWidth = Math.max(0.6, (6 * u) / depth)
      ctx.strokeStyle = rgba(mix(p.accent, p.line, Math.min(1, (depth - 2.5) / 5)), 0.65)
      line(ctx, from[0], from[1], to[0], to[1])
    }
    for (let x = -n; x <= n; x++) {
      for (let y = -n; y <= n; y++) {
        for (let z = -n; z <= n; z++) {
          const here = project(x, y, z)
          if (x < n) stroke(here, project(x + 1, y, z))
          if (y < n) stroke(here, project(x, y + 1, z))
          if (z < n) stroke(here, project(x, y, z + 1))
        }
      }
    }
  },
}

/** Every background, in the order the picker shows them. */
export const BACKGROUND_KINDS = Object.keys(DRAW)
export const isBackgroundKind = (value: unknown): value is string => typeof value === 'string' && BACKGROUND_KINDS.includes(value)

const toRgb = (value: string, fallback: Rgb): Rgb => {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value).trim())
  if (!match) return fallback
  const n = Number.parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The colours of the current theme. */
export function themePalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: Rgb) => toRgb(style.getPropertyValue(name), fallback)
  return {
    bg: read('--bg', [243, 244, 246]),
    panel: read('--panel', [255, 255, 255]),
    ink: read('--ink', [31, 35, 40]),
    muted: read('--muted', [102, 112, 133]),
    line: read('--line', [216, 219, 226]),
    accent: read('--accent', [37, 99, 235]),
  }
}

const hsl = (h: number, s: number, l: number): Rgb => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return [f(0), f(8), f(4)]
}

/** A picker tile's own colours: each background a hue of its own, light or dark like the theme. */
export function chipPalette(kind: string, base: Palette): Palette {
  const hue = (Math.max(0, BACKGROUND_KINDS.indexOf(kind)) * 360) / BACKGROUND_KINDS.length
  const dark = base.bg[0] * 0.3 + base.bg[1] * 0.59 + base.bg[2] * 0.11 < 128
  return {
    bg: hsl(hue, 0.7, dark ? 0.16 : 0.9),
    panel: hsl(hue, 0.6, dark ? 0.24 : 0.97),
    ink: hsl(hue, 0.8, dark ? 0.9 : 0.25),
    muted: hsl((hue + 40) % 360, 0.7, dark ? 0.7 : 0.4),
    line: hsl((hue + 330) % 360, 0.65, dark ? 0.45 : 0.68),
    accent: hsl(hue, 0.9, dark ? 0.62 : 0.46),
  }
}

/** Draws one frame of a background at time `t` (seconds). */
export function drawBackground(kind: string, ctx: CanvasRenderingContext2D, w: number, h: number, t: number, palette: Palette) {
  ctx.fillStyle = rgba(palette.bg, 1)
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ;(DRAW[kind] ?? DRAW[BACKGROUND_KINDS[0]])({ ctx, w, h, t, p: palette, u: unit(w, h) })
  ctx.restore()
}
