/**
 * Sample pictures for the start screen. They are drawn, not shipped: no file to
 * install, no rights to think about, the same on the web and the desktop, and small
 * enough to redraw as thumbnails. Each has something worth doing to it.
 */

export type SampleImage = {
  id: string
  name: { ko: string; en: string }
  note: { ko: string; en: string }
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

/** A repeatable random sequence, so a sample is the same picture every time. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function vertical(ctx: CanvasRenderingContext2D, h: number, stops: [number, string][]) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  for (const [at, colour] of stops) gradient.addColorStop(at, colour)
  return gradient
}

/** A jagged ridge from one edge to the other, filled to the bottom. */
function ridge(ctx: CanvasRenderingContext2D, w: number, h: number, base: number, rough: number, colour: string, seed: number) {
  const random = seeded(seed)
  const phases = [random() * 6, random() * 6, random() * 6]
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let x = 0; x <= w; x += Math.max(2, w / 400)) {
    const f = x / w
    const y = base + rough * (Math.sin(f * 7 + phases[0]) * 0.5 + Math.sin(f * 17 + phases[1]) * 0.28 + Math.sin(f * 41 + phases[2]) * 0.12 + (random() - 0.5) * 0.05)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
}

export const SAMPLE_IMAGES: SampleImage[] = [
  {
    id: 'sunset',
    name: { ko: '노을 산맥', en: 'Sunset ridge' },
    note: { ko: '커브·색조/채도 연습', en: 'Try Curves and Hue/Saturation' },
    draw(ctx, w, h) {
      ctx.fillStyle = vertical(ctx, h, [[0, '#2a2a6e'], [0.42, '#c8537c'], [0.68, '#f6a35c'], [0.8, '#ffd98a']])
      ctx.fillRect(0, 0, w, h)
      const sun = ctx.createRadialGradient(w * 0.62, h * 0.66, 0, w * 0.62, h * 0.66, h * 0.32)
      sun.addColorStop(0, 'rgba(255,245,210,1)')
      sun.addColorStop(0.2, 'rgba(255,225,160,0.9)')
      sun.addColorStop(1, 'rgba(255,190,120,0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, w, h)
      ridge(ctx, w, h, h * 0.68, h * 0.11, '#6b4a78', 3)
      ridge(ctx, w, h, h * 0.76, h * 0.09, '#46355f', 8)
      ridge(ctx, w, h, h * 0.86, h * 0.07, '#231d38', 15)
    },
  },
  {
    id: 'lake',
    name: { ko: '호수와 하늘', en: 'Lake and sky' },
    note: { ko: '하늘 대체·반전 연습', en: 'Try Sky Replacement and Flip' },
    draw(ctx, w, h) {
      ctx.fillStyle = vertical(ctx, h, [[0, '#3f8fd8'], [0.55, '#bfe3f5']])
      ctx.fillRect(0, 0, w, h)
      const random = seeded(21)
      for (let i = 0; i < 26; i += 1) {
        const x = random() * w
        const y = random() * h * 0.4
        const r = h * (0.03 + random() * 0.06)
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.beginPath()
        ctx.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ridge(ctx, w, h, h * 0.52, h * 0.09, '#47717d', 5)
      ridge(ctx, w, h, h * 0.57, h * 0.04, '#2d5a4c', 12)
      ctx.fillStyle = vertical(ctx, h, [[0.6, '#4d94b4'], [1, '#123a4f']])
      ctx.fillRect(0, h * 0.6, w, h * 0.4)
      for (let i = 0; i < 60; i += 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)'
        const y = h * 0.6 + random() * h * 0.4
        ctx.fillRect(random() * w, y, w * (0.02 + random() * 0.1), 2)
      }
    },
  },
  {
    id: 'night',
    name: { ko: '밤거리 빛망울', en: 'Night bokeh' },
    note: { ko: '레벨·선명 효과 연습', en: 'Try Levels and Sharpen' },
    draw(ctx, w, h) {
      ctx.fillStyle = vertical(ctx, h, [[0, '#080a18'], [1, '#1b1630']])
      ctx.fillRect(0, 0, w, h)
      const random = seeded(33)
      const colours = ['255,190,90', '255,110,110', '110,200,255', '255,240,190', '190,120,255']
      for (let i = 0; i < 90; i += 1) {
        const r = h * (0.015 + random() * 0.07)
        ctx.fillStyle = `rgba(${colours[Math.floor(random() * colours.length)]},${0.18 + random() * 0.32})`
        ctx.beginPath()
        ctx.arc(random() * w, h * 0.25 + random() * h * 0.7, r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  },
  {
    id: 'chart',
    name: { ko: '색상 차트', en: 'Color chart' },
    note: { ko: '채널 혼합·색상 모드 확인', en: 'Check Channel Mixer and color modes' },
    draw(ctx, w, h) {
      ctx.fillStyle = '#26282c'
      ctx.fillRect(0, 0, w, h)
      const cols = 6
      const rows = 4
      const pad = Math.min(w, h) * 0.02
      const cw = (w - pad * (cols + 1)) / cols
      const ch = (h - pad * (rows + 1)) / rows
      const swatches = ['#735244', '#c29682', '#627a9d', '#576c43', '#8580b1', '#67bdaa', '#d67e2c', '#505ba6', '#c15a63', '#5e3c6c', '#9dbc40', '#e0a32e', '#383d96', '#469449', '#af363c', '#e7c71f', '#bb5695', '#0885a1', '#f3f3f2', '#c8c8c8', '#a0a0a0', '#7a7a79', '#555555', '#343434']
      swatches.forEach((colour, index) => {
        ctx.fillStyle = colour
        ctx.fillRect(pad + (index % cols) * (cw + pad), pad + Math.floor(index / cols) * (ch + pad), cw, ch)
      })
    },
  },
  {
    id: 'ramp',
    name: { ko: '계조 시험', en: 'Tone ramp' },
    note: { ko: '포스터화·그레이디언트 맵 확인', en: 'Check Posterize and Gradient Map' },
    draw(ctx, w, h) {
      const rows: [string, string][] = [['#000000', '#ffffff'], ['#000000', '#ff2020'], ['#000000', '#20ff40'], ['#000000', '#2040ff']]
      rows.forEach(([from, to], index) => {
        const gradient = ctx.createLinearGradient(0, 0, w, 0)
        gradient.addColorStop(0, from)
        gradient.addColorStop(1, to)
        ctx.fillStyle = gradient
        ctx.fillRect(0, (index * h) / rows.length, w, h / rows.length + 1)
      })
    },
  },
  {
    id: 'shapes',
    name: { ko: '도형 정물', en: 'Still life' },
    note: { ko: '선택 도구·피사체 선택 연습', en: 'Try the selection tools' },
    draw(ctx, w, h) {
      ctx.fillStyle = vertical(ctx, h, [[0, '#e9e4da'], [0.62, '#d9d2c3'], [0.62, '#a98f6f'], [1, '#6f5a43']])
      ctx.fillRect(0, 0, w, h)
      const shade = (x: number, y: number, r: number, light: string, dark: string) => {
        const gradient = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r)
        gradient.addColorStop(0, light)
        gradient.addColorStop(1, dark)
        ctx.fillStyle = 'rgba(40,30,20,0.28)'
        ctx.beginPath()
        ctx.ellipse(x + r * 0.2, y + r * 0.96, r, r * 0.22, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      shade(w * 0.3, h * 0.58, h * 0.2, '#ff8f7a', '#a11f1f')
      shade(w * 0.56, h * 0.63, h * 0.15, '#ffe28a', '#c07a10')
      shade(w * 0.74, h * 0.6, h * 0.18, '#9ad6ff', '#17517d')
    },
  },
]

/** A sample picture drawn at the given size. */
export function renderSample(sample: SampleImage, w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  sample.draw(ctx, w, h)
  return canvas
}

export const SAMPLE_WIDTH = 1600
export const SAMPLE_HEIGHT = 1067
