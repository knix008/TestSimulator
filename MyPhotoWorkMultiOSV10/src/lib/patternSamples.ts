import { context2d, createCanvas } from './canvas'

/**
 * The built-in patterns: forty small tiles drawn in code, so there are no files to ship
 * and each repeats without a seam. Choosing one copies it into the document's patterns,
 * where the Pattern Stamp, Fill and fill layers already look.
 */

type Ctx = CanvasRenderingContext2D
export type PatternSample = {
  id: string
  name: { ko: string; en: string }
  /** The side of the square tile, in pixels. */
  size: number
  draw: (ctx: Ctx, s: number) => void
}

/** Runs `paint` at each neighbouring tile's offset, so a shape crossing an edge continues on the far side. */
function wrapped(ctx: Ctx, s: number, paint: () => void) {
  for (const dy of [-s, 0, s]) {
    for (const dx of [-s, 0, s]) {
      ctx.save()
      ctx.translate(dx, dy)
      paint()
      ctx.restore()
    }
  }
}

function fill(ctx: Ctx, s: number, colour: string) {
  ctx.fillStyle = colour
  ctx.fillRect(0, 0, s, s)
}

function line(ctx: Ctx, colour: string, width: number, points: number[][]) {
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.beginPath()
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
}

function shape(ctx: Ctx, colour: string, points: number[][]) {
  ctx.fillStyle = colour
  ctx.beginPath()
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

function disc(ctx: Ctx, colour: string, x: number, y: number, r: number) {
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function ring(ctx: Ctx, colour: string, width: number, x: number, y: number, r: number) {
  ctx.strokeStyle = colour
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
}

function star(ctx: Ctx, colour: string, x: number, y: number, r: number) {
  const points: number[][] = []
  for (let k = 0; k < 10; k += 1) {
    const radius = k % 2 ? r * 0.42 : r
    const angle = -Math.PI / 2 + (k * Math.PI) / 5
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius])
  }
  shape(ctx, colour, points)
}

/** A repeatable random sequence; each pixel on its own, so a noise tile has no seam. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function speckle(ctx: Ctx, s: number, seed: number, base: number[], spread: number) {
  const random = seeded(seed)
  const image = ctx.createImageData(s, s)
  for (let at = 0; at < image.data.length; at += 4) {
    const shift = (random() - 0.5) * spread
    image.data[at] = base[0] + shift
    image.data[at + 1] = base[1] + shift
    image.data[at + 2] = base[2] + shift
    image.data[at + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

export const PATTERN_SAMPLES: PatternSample[] = [
  { id: 'stripesH', name: { ko: '가로 줄무늬', en: 'Horizontal stripes' }, size: 24, draw(c, s) { fill(c, s, '#f4f1ea'); c.fillStyle = '#c0392b'; c.fillRect(0, 0, s, s / 2) } },
  { id: 'stripesV', name: { ko: '세로 줄무늬', en: 'Vertical stripes' }, size: 24, draw(c, s) { fill(c, s, '#eaf2f8'); c.fillStyle = '#2471a3'; c.fillRect(0, 0, s / 2, s) } },
  { id: 'stripesThin', name: { ko: '가는 줄무늬', en: 'Pinstripe' }, size: 16, draw(c, s) { fill(c, s, '#1c2833'); c.fillStyle = '#aab7b8'; c.fillRect(0, 0, 2, s) } },
  { id: 'diagonal', name: { ko: '사선', en: 'Diagonal' }, size: 32, draw(c, s) { fill(c, s, '#fdebd0'); wrapped(c, s, () => line(c, '#d35400', 6, [[0, s], [s, 0]])) } },
  { id: 'diagonalBack', name: { ko: '역사선', en: 'Back diagonal' }, size: 32, draw(c, s) { fill(c, s, '#e8f8f5'); wrapped(c, s, () => line(c, '#148f77', 6, [[0, 0], [s, s]])) } },
  { id: 'hazard', name: { ko: '경고 줄무늬', en: 'Hazard stripes' }, size: 48, draw(c, s) { fill(c, s, '#f7dc6f'); wrapped(c, s, () => line(c, '#17202a', s / 3, [[0, s], [s, 0]])) } },
  { id: 'checker', name: { ko: '체크', en: 'Checker' }, size: 32, draw(c, s) { fill(c, s, '#ffffff'); c.fillStyle = '#212f3d'; c.fillRect(0, 0, s / 2, s / 2); c.fillRect(s / 2, s / 2, s / 2, s / 2) } },
  { id: 'checkerSmall', name: { ko: '잔 체크', en: 'Small checker' }, size: 12, draw(c, s) { fill(c, s, '#fadbd8'); c.fillStyle = '#b03a2e'; c.fillRect(0, 0, s / 2, s / 2); c.fillRect(s / 2, s / 2, s / 2, s / 2) } },
  { id: 'gingham', name: { ko: '깅엄', en: 'Gingham' }, size: 32, draw(c, s) { fill(c, s, '#ffffff'); c.fillStyle = 'rgba(41,128,185,0.45)'; c.fillRect(0, 0, s / 2, s); c.fillRect(0, 0, s, s / 2) } },
  { id: 'plaid', name: { ko: '격자무늬', en: 'Plaid' }, size: 48, draw(c, s) { fill(c, s, '#7b241c'); c.fillStyle = 'rgba(23,32,42,0.5)'; c.fillRect(0, 0, 18, s); c.fillRect(0, 0, s, 18); c.fillStyle = 'rgba(247,220,111,0.7)'; c.fillRect(30, 0, 3, s); c.fillRect(0, 30, s, 3) } },
  { id: 'tartan', name: { ko: '타탄', en: 'Tartan' }, size: 64, draw(c, s) { fill(c, s, '#145a32'); c.fillStyle = 'rgba(21,67,96,0.6)'; c.fillRect(8, 0, 22, s); c.fillRect(0, 8, s, 22); c.fillStyle = 'rgba(192,57,43,0.8)'; c.fillRect(44, 0, 4, s); c.fillRect(0, 44, s, 4); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(56, 0, 2, s); c.fillRect(0, 56, s, 2) } },
  { id: 'dots', name: { ko: '물방울', en: 'Polka dots' }, size: 32, draw(c, s) { fill(c, s, '#fef9e7'); disc(c, '#e74c3c', s / 2, s / 2, 7) } },
  { id: 'dotsStaggered', name: { ko: '엇갈린 점', en: 'Staggered dots' }, size: 24, draw(c, s) { fill(c, s, '#154360'); wrapped(c, s, () => { disc(c, '#aed6f1', 6, 6, 3.5); disc(c, '#aed6f1', 18, 18, 3.5) }) } },
  { id: 'dotsBig', name: { ko: '큰 점', en: 'Big dots' }, size: 48, draw(c, s) { fill(c, s, '#f5eef8'); disc(c, '#8e44ad', s / 2, s / 2, 17) } },
  { id: 'rings', name: { ko: '고리', en: 'Rings' }, size: 40, draw(c, s) { fill(c, s, '#eafaf1'); ring(c, '#1e8449', 4, s / 2, s / 2, 13) } },
  { id: 'concentric', name: { ko: '동심원', en: 'Concentric' }, size: 48, draw(c, s) { fill(c, s, '#212f3d'); for (const r of [6, 13, 20]) ring(c, '#f4d03f', 2, s / 2, s / 2, r) } },
  { id: 'grid', name: { ko: '격자', en: 'Grid' }, size: 24, draw(c, s) { fill(c, s, '#ffffff'); c.fillStyle = '#85929e'; c.fillRect(0, 0, 1, s); c.fillRect(0, 0, s, 1) } },
  { id: 'graphPaper', name: { ko: '모눈종이', en: 'Graph paper' }, size: 50, draw(c, s) { fill(c, s, '#fdfefe'); c.fillStyle = '#aed6f1'; for (let k = 0; k < 5; k += 1) { c.fillRect(k * 10, 0, 1, s); c.fillRect(0, k * 10, s, 1) } c.fillStyle = '#2e86c1'; c.fillRect(0, 0, 1, s); c.fillRect(0, 0, s, 1) } },
  { id: 'blueprint', name: { ko: '청사진', en: 'Blueprint' }, size: 40, draw(c, s) { fill(c, s, '#1a4e8a'); c.fillStyle = 'rgba(255,255,255,0.22)'; for (let k = 0; k < 4; k += 1) { c.fillRect(k * 10, 0, 1, s); c.fillRect(0, k * 10, s, 1) } c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(0, 0, 1, s); c.fillRect(0, 0, s, 1) } },
  { id: 'crosshatch', name: { ko: '교차 빗금', en: 'Crosshatch' }, size: 20, draw(c, s) { fill(c, s, '#f8f9f9'); wrapped(c, s, () => { line(c, '#566573', 1.5, [[0, s], [s, 0]]); line(c, '#566573', 1.5, [[0, 0], [s, s]]) }) } },
  { id: 'brick', name: { ko: '벽돌', en: 'Brick' }, size: 48, draw(c, s) { fill(c, s, '#d5d8dc'); c.fillStyle = '#a93226'; c.fillRect(1, 1, 46, 22); c.fillRect(25, 25, 46, 22); c.fillRect(-23, 25, 46, 22) } },
  { id: 'tile', name: { ko: '타일', en: 'Tile' }, size: 40, draw(c, s) { fill(c, s, '#909497'); c.fillStyle = '#e5e8e8'; c.fillRect(1, 1, s - 2, s - 2); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(3, 3, s - 14, 3) } },
  { id: 'herringbone', name: { ko: '헤링본', en: 'Herringbone' }, size: 40, draw(c, s) { fill(c, s, '#6e4b2a'); wrapped(c, s, () => { for (const y of [0, 20]) { line(c, '#d7b98e', 5, [[0, y + 20], [20, y], [40, y + 20]]) } }) } },
  { id: 'basket', name: { ko: '바구니 짜임', en: 'Basket weave' }, size: 40, draw(c, s) { fill(c, s, '#a0764a'); c.fillStyle = '#e0c097'; for (const k of [3, 11]) { c.fillRect(1, k, 18, 5); c.fillRect(21, k + 20, 18, 5); c.fillRect(k, 21, 5, 18); c.fillRect(k + 20, 1, 5, 18) } } },
  { id: 'zigzag', name: { ko: '지그재그', en: 'Zigzag' }, size: 32, draw(c, s) { fill(c, s, '#ebf5fb'); wrapped(c, s, () => line(c, '#2874a6', 5, [[0, 24], [16, 8], [32, 24]])) } },
  { id: 'chevron', name: { ko: '셰브런', en: 'Chevron' }, size: 40, draw(c, s) { fill(c, s, '#fdedec'); wrapped(c, s, () => line(c, '#cb4335', 10, [[0, 30], [20, 10], [40, 30]])) } },
  { id: 'waves', name: { ko: '물결', en: 'Waves' }, size: 40, draw(c, s) { fill(c, s, '#d6eaf8'); c.strokeStyle = '#1f618d'; c.lineWidth = 3; c.beginPath(); for (let x = 0; x <= s; x += 1) { const y = s / 2 + Math.sin((x / s) * Math.PI * 2) * 8; if (x) c.lineTo(x, y); else c.moveTo(x, y) } c.stroke() } },
  { id: 'scales', name: { ko: '물고기 비늘', en: 'Scales' }, size: 32, draw(c, s) { fill(c, s, '#117864'); wrapped(c, s, () => { for (const [x, y] of [[0, 0], [16, 16]]) { ring(c, '#a3e4d7', 2, x + 16, y, 15) } }) } },
  { id: 'hexagon', name: { ko: '벌집', en: 'Honeycomb' }, size: 48, draw(c, s) { fill(c, s, '#f9e79f'); c.lineJoin = 'round'; wrapped(c, s, () => { const h = (p: number, q: number) => line(c, '#b7950b', 2.5, [[p, q], [p + 8, q], [p + 16, q + 12], [p + 8, q + 24], [p, q + 24], [p - 8, q + 12], [p, q]]); h(8, 0); h(32, 12); h(32, -12) }) } },
  { id: 'triangles', name: { ko: '삼각형', en: 'Triangles' }, size: 32, draw(c, s) { fill(c, s, '#e8daef'); shape(c, '#7d3c98', [[0, s], [s / 2, s / 2], [s, s]]); shape(c, '#af7ac5', [[0, s / 2], [s / 2, 0], [s, s / 2]]) } },
  { id: 'diamonds', name: { ko: '마름모', en: 'Diamonds' }, size: 32, draw(c, s) { fill(c, s, '#fef5e7'); shape(c, '#ca6f1e', [[s / 2, 2], [s - 2, s / 2], [s / 2, s - 2], [2, s / 2]]) } },
  { id: 'argyle', name: { ko: '아가일', en: 'Argyle' }, size: 48, draw(c, s) { fill(c, s, '#1b2631'); shape(c, '#2e86c1', [[s / 2, 0], [s, s / 2], [s / 2, s], [0, s / 2]]); wrapped(c, s, () => { line(c, '#f4d03f', 1, [[0, 0], [s, s]]); line(c, '#f4d03f', 1, [[0, s], [s, 0]]) }) } },
  { id: 'stars', name: { ko: '별', en: 'Stars' }, size: 40, draw(c, s) { fill(c, s, '#0b1e3f'); star(c, '#f7dc6f', 20, 21, 13) } },
  { id: 'hearts', name: { ko: '하트', en: 'Hearts' }, size: 32, draw(c, s) { fill(c, s, '#fdedf3'); disc(c, '#e6396f', 12, 13, 5.5); disc(c, '#e6396f', 20, 13, 5.5); shape(c, '#e6396f', [[7, 16], [25, 16], [16, 26]]) } },
  { id: 'flowers', name: { ko: '꽃', en: 'Flowers' }, size: 40, draw(c, s) { fill(c, s, '#eafaf1'); for (let k = 0; k < 6; k += 1) { const a = (k * Math.PI) / 3; disc(c, '#ec7fa9', 20 + Math.cos(a) * 8, 20 + Math.sin(a) * 8, 5) } disc(c, '#f4d03f', 20, 20, 4.5) } },
  { id: 'crosses', name: { ko: '십자', en: 'Crosses' }, size: 24, draw(c, s) { fill(c, s, '#f2f3f4'); c.fillStyle = '#2c3e50'; c.fillRect(11, 6, 2, 12); c.fillRect(6, 11, 12, 2) } },
  { id: 'wood', name: { ko: '나뭇결', en: 'Wood grain' }, size: 64, draw(c, s) { fill(c, s, '#b9895a'); c.lineWidth = 1.5; for (let k = 0; k < 8; k += 1) { c.strokeStyle = k % 2 ? 'rgba(92,58,28,0.55)' : 'rgba(92,58,28,0.28)'; c.beginPath(); for (let x = 0; x <= s; x += 2) { const y = 4 + k * 8 + Math.sin((x / s) * Math.PI * 2 + k) * 3; if (x) c.lineTo(x, y); else c.moveTo(x, y) } c.stroke() } } },
  { id: 'linen', name: { ko: '리넨 짜임', en: 'Linen weave' }, size: 8, draw(c, s) { fill(c, s, '#e8e0d0'); c.fillStyle = 'rgba(120,100,70,0.35)'; c.fillRect(0, 0, 1, s); c.fillRect(4, 0, 1, s); c.fillRect(0, 2, s, 1); c.fillRect(0, 6, s, 1) } },
  { id: 'sand', name: { ko: '모래', en: 'Sand' }, size: 64, draw(c, s) { speckle(c, s, 7, [214, 192, 150], 46) } },
  { id: 'noise', name: { ko: '회색 노이즈', en: 'Gray noise' }, size: 64, draw(c, s) { speckle(c, s, 19, [128, 128, 128], 150) } },
]

/** One built-in tile as a canvas. */
export function renderPatternSample(sample: PatternSample) {
  const canvas = createCanvas(sample.size, sample.size)
  sample.draw(context2d(canvas), sample.size)
  return canvas
}

/** The document pattern's id for a built-in one, so choosing it twice does not add two. */
export const patternSampleId = (sampleId: string) => `sample-${sampleId}`
