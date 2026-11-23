/**
 * Sample pictures for the start screen. Most are drawn, not shipped: no file to
 * install, the same on the web and the desktop, and small enough to redraw as
 * thumbnails. A few are real pictures (a photograph and famous paintings), all in the
 * public domain, shipped in public/samples (credits in public/samples/CREDITS.md).
 * Each has something worth doing to it.
 */

type SampleBase = {
  id: string
  name: { ko: string; en: string }
  note: { ko: string; en: string }
}
/** A picture drawn on a canvas of any size. */
export type DrawnSample = SampleBase & { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; src?: undefined }
/** A picture shipped as a file, opened at its own size. `src` is relative to the page. */
export type FileSample = SampleBase & { src: string; draw?: undefined }
export type SampleImage = DrawnSample | FileSample

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
  {
    id: 'swimsuit',
    name: { ko: '빨간 비키니의 금발 여성', en: 'Blonde woman in a red bikini' },
    note: { ko: '인물 보정·머리색·색감 복원', en: 'Retouch, hair colour, restore the colours' },
    src: './samples/swimsuit.jpg',
  },
  {
    id: 'monalisa',
    name: { ko: '모나리자 (다빈치)', en: 'Mona Lisa (Leonardo)' },
    note: { ko: '인물 보정·누렇게 바랜 색 되살리기', en: 'Retouch a portrait and fix yellowed color' },
    src: './samples/monalisa.jpg',
  },
  {
    id: 'starry',
    name: { ko: '별이 빛나는 밤 (고흐)', en: 'The Starry Night (van Gogh)' },
    note: { ko: '색조/채도로 명화 색감 바꾸기', en: 'Recolor a masterpiece with Hue/Saturation' },
    src: './samples/starry.jpg',
  },
  {
    id: 'wave',
    name: { ko: '가나가와 해변의 큰 파도 (호쿠사이)', en: 'The Great Wave (Hokusai)' },
    note: { ko: '선택 도구로 파도만 따로 떼어 내기', en: 'Cut the wave out with the selection tools' },
    src: './samples/wave.jpg',
  },
  {
    id: 'pearl',
    name: { ko: '진주 귀걸이를 한 소녀 (페르메이르)', en: 'Girl with a Pearl Earring (Vermeer)' },
    note: { ko: '배경 바꾸기·빛 효과 연습', en: 'Try a new background and lighting effects' },
    src: './samples/pearl.jpg',
  },
  {
    id: 'impression',
    name: { ko: '인상, 해돋이 (모네)', en: 'Impression, Sunrise (Monet)' },
    note: { ko: '레벨·커브로 안개 걷어 내기', en: 'Clear the haze with Levels and Curves' },
    src: './samples/impression.jpg',
  },
]

/** A drawn sample picture at the given size. A file sample cannot be drawn this way: use loadSample. */
export function renderSample(sample: SampleImage, w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  if (sample.draw) sample.draw(ctx, w, h)
  return canvas
}

/** What opening a sample hands to the file opener: a drawn one as PNG, a file one as its own bytes. */
export async function loadSample(sample: SampleImage, language: 'ko' | 'en'): Promise<{ name: string; mime: string; dataUrl: string }> {
  if (!sample.src) return { name: `${sample.name[language]}.png`, mime: 'image/png', dataUrl: renderSample(sample, SAMPLE_WIDTH, SAMPLE_HEIGHT).toDataURL('image/png') }
  const response = await fetch(sample.src)
  if (!response.ok) throw new Error(`${sample.src}: ${response.status}`)
  const blob = await response.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  const extension = sample.src.slice(sample.src.lastIndexOf('.') + 1)
  return { name: `${sample.name[language]}.${extension}`, mime: blob.type || 'image/jpeg', dataUrl }
}

export const SAMPLE_WIDTH = 1600
export const SAMPLE_HEIGHT = 1067
