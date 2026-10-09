// Draws the application and document icons: a green circuit board with copper
// traces running out of an IC, on a rounded dark-blue/teal tile.
//
//   npm run build:icons
//
// Everything is rendered at 2-4x and box-filtered down, so edges stay smooth at
// every size. Small sizes (<= 24 px) get a simplified drawing: fewer, thicker
// traces and no vias, so the chip still reads as a chip at 16 px.
//
// Output (all in assets/):
//   icon.png (512), icon.ico (16..256), icon.icns (16..1024, PNG-based),
//   icons/<n>x<n>.png (Linux), file-icon.png (256), file-icon.ico (16..256)
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')

/* ─────────────────────────────── canvas ─────────────────────────────────── */

function createCanvas(size) {
  return { width: size, height: size, data: new Float64Array(size * size * 4) }
}

function blendPixel(canvas, x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
  const i = (canvas.width * y + x) * 4
  const sa = Math.min(1, alpha)
  const da = canvas.data[i + 3]
  const out = sa + da * (1 - sa)
  if (out <= 0) return
  canvas.data[i] = (r * sa + canvas.data[i] * da * (1 - sa)) / out
  canvas.data[i + 1] = (g * sa + canvas.data[i + 1] * da * (1 - sa)) / out
  canvas.data[i + 2] = (b * sa + canvas.data[i + 2] * da * (1 - sa)) / out
  canvas.data[i + 3] = out
}

/** Paint every pixel whose coverage function returns > 0. */
function paint(canvas, bounds, coverage, shade) {
  const x0 = Math.max(0, Math.floor(bounds[0]))
  const y0 = Math.max(0, Math.floor(bounds[1]))
  const x1 = Math.min(canvas.width - 1, Math.ceil(bounds[2]))
  const y1 = Math.min(canvas.height - 1, Math.ceil(bounds[3]))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const alpha = coverage(x + 0.5, y + 0.5)
      if (alpha <= 0) continue
      const color = shade(x + 0.5, y + 0.5)
      if (!color) continue
      blendPixel(canvas, x, y, color, alpha * (color[3] ?? 1))
    }
  }
}

const solid = (color) => () => color

function gradient(from, to, colorA, colorB) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const lengthSquared = dx * dx + dy * dy || 1
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / lengthSquared))
    return [
      colorA[0] + (colorB[0] - colorA[0]) * t,
      colorA[1] + (colorB[1] - colorA[1]) * t,
      colorA[2] + (colorB[2] - colorA[2]) * t,
      (colorA[3] ?? 1) + ((colorB[3] ?? 1) - (colorA[3] ?? 1)) * t
    ]
  }
}

/* ─────────────────────────────── shapes ─────────────────────────────────── */

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - (halfWidth - radius)
  const qy = Math.abs(y - cy) - (halfHeight - radius)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function fillRoundedRect(canvas, cx, cy, halfWidth, halfHeight, radius, shade, clip) {
  paint(
    canvas,
    [cx - halfWidth - 2, cy - halfHeight - 2, cx + halfWidth + 2, cy + halfHeight + 2],
    (x, y) => (clip && clip(x, y) > 0 ? 0 : Math.max(0, Math.min(1, 0.5 - roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius)))),
    shade
  )
}

/** A ring along the inside of a rounded rectangle (rim light / board edge). */
function strokeRoundedRect(canvas, cx, cy, halfWidth, halfHeight, radius, width, shade) {
  paint(
    canvas,
    [cx - halfWidth - 2, cy - halfHeight - 2, cx + halfWidth + 2, cy + halfHeight + 2],
    (x, y) => {
      const d = roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius)
      return Math.max(0, Math.min(1, 0.5 + width / 2 - Math.abs(d + width / 2)))
    },
    shade
  )
}

function polygonCoverage(points) {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside ? 1 : 0
  }
}

function polygonBounds(points) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2]
}

function fillPolygon(canvas, points, shade) {
  paint(canvas, polygonBounds(points), polygonCoverage(points), shade)
}

function clearPolygon(canvas, points) {
  const inside = polygonCoverage(points)
  const [bx0, by0, bx1, by1] = polygonBounds(points)
  for (let y = Math.max(0, Math.floor(by0)); y <= Math.min(canvas.height - 1, Math.ceil(by1)); y++) {
    for (let x = Math.max(0, Math.floor(bx0)); x <= Math.min(canvas.width - 1, Math.ceil(bx1)); x++) {
      if (!inside(x + 0.5, y + 0.5)) continue
      canvas.data.fill(0, (canvas.width * y + x) * 4, (canvas.width * y + x) * 4 + 4)
    }
  }
}

function fillCircle(canvas, cx, cy, radius, shade) {
  paint(
    canvas,
    [cx - radius - 2, cy - radius - 2, cx + radius + 2, cy + radius + 2],
    (x, y) => Math.max(0, Math.min(1, 0.5 + radius - Math.hypot(x - cx, y - cy))),
    shade
  )
}

function radialGlow(canvas, cx, cy, radius, color, strength, clip) {
  paint(
    canvas,
    [cx - radius, cy - radius, cx + radius, cy + radius],
    (x, y) => {
      if (clip && clip(x, y) > 0) return 0
      const d = Math.hypot(x - cx, y - cy) / radius
      return d >= 1 ? 0 : Math.pow(1 - d, 2.2) * strength
    },
    solid(color)
  )
}

/** Thick polyline with round joins and caps (a copper trace). */
function strokePolyline(canvas, points, width, color) {
  const half = width / 2
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  paint(
    canvas,
    [Math.min(...xs) - width, Math.min(...ys) - width, Math.max(...xs) + width, Math.max(...ys) + width],
    (x, y) => {
      let best = Infinity
      for (let i = 0; i + 1 < points.length; i++) {
        const [ax, ay] = points[i]
        const [bx, by] = points[i + 1]
        const dx = bx - ax
        const dy = by - ay
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)))
      }
      return Math.max(0, Math.min(1, 0.5 + half - best))
    },
    solid(color)
  )
}

/* ─────────────────────────────── artwork ────────────────────────────────── */

const INK = {
  tileTop: [26, 74, 122],
  tileBottom: [8, 52, 64],
  rim: [120, 210, 230],
  shadow: [2, 10, 18],
  boardTop: [44, 170, 92],
  boardBottom: [18, 112, 60],
  boardEdge: [130, 230, 160],
  copper: [236, 170, 74],
  copperLight: [255, 214, 140],
  hole: [20, 46, 32],
  chipTop: [56, 62, 72],
  chipBottom: [26, 29, 35],
  pin: [212, 218, 226],
  pinDark: [150, 158, 170],
  dot: [120, 128, 140]
}

const SIDES = [
  { out: [1, 0], along: [0, 1] },
  { out: [-1, 0], along: [0, 1] },
  { out: [0, -1], along: [1, 0] },
  { out: [0, 1], along: [1, 0] }
]

/**
 * A square PCB centred on (cx, cy) with half-size `half`. Coordinates below are
 * fractions of `half`, so the same drawing serves the tile and the document.
 */
function drawBoard(canvas, cx, cy, half, simple) {
  const u = half
  const at = (side, o, a) => [cx + side.out[0] * o * u + side.along[0] * a * u, cy + side.out[1] * o * u + side.along[1] * a * u]

  // Board with a soft drop shadow and a light solder-mask edge.
  fillRoundedRect(canvas, cx + u * 0.04, cy + u * 0.07, u, u, u * 0.16, solid([...INK.shadow, 0.45]))
  fillRoundedRect(canvas, cx, cy, u, u, u * 0.16, gradient([cx - u, cy - u], [cx + u, cy + u], INK.boardTop, INK.boardBottom))
  strokeRoundedRect(canvas, cx, cy, u, u, u * 0.16, Math.max(1, u * 0.035), solid([...INK.boardEdge, 0.55]))

  const chipHalf = simple ? 0.42 : 0.38
  const pins = simple ? 2 : 3
  const pitch = simple ? 0.36 : 0.24
  const pinLength = simple ? 0.16 : 0.13
  const pinWidth = simple ? 0.17 : 0.11
  const traceWidth = u * (simple ? 0.15 : 0.085)
  const viaRadius = u * 0.095

  // Copper traces: out of each pin, a 45° fan-out, then straight to a via.
  for (const side of SIDES) {
    for (let i = 0; i < pins; i++) {
      const a = (i - (pins - 1) / 2) * pitch
      const spread = a * (simple ? 1.5 : 1.75)
      const start = chipHalf + pinLength * 0.5
      const bendAt = chipHalf + pinLength + 0.08
      const points = [at(side, start, a), at(side, bendAt, a), at(side, bendAt + Math.abs(spread - a), spread), at(side, 0.8, spread)]
      strokePolyline(canvas, points, traceWidth, INK.copper)
      if (!simple) {
        strokePolyline(canvas, points, traceWidth * 0.35, [...INK.copperLight, 0.55])
        const via = at(side, 0.8, spread)
        fillCircle(canvas, via[0], via[1], viaRadius, solid(INK.copper))
        fillCircle(canvas, via[0], via[1], viaRadius * 0.45, solid(INK.hole))
      }
    }
  }

  // IC pins (silver legs tucked under the package), then the package itself.
  for (const side of SIDES) {
    for (let i = 0; i < pins; i++) {
      const a = (i - (pins - 1) / 2) * pitch
      const [px, py] = at(side, chipHalf + pinLength / 2 - 0.02, a)
      const hw = (side.out[0] ? pinLength / 2 + 0.02 : pinWidth / 2) * u
      const hh = (side.out[0] ? pinWidth / 2 : pinLength / 2 + 0.02) * u
      fillRoundedRect(canvas, px, py, hw, hh, Math.min(hw, hh) * 0.3, gradient([px - hw, py - hh], [px + hw, py + hh], INK.pin, INK.pinDark))
    }
  }
  const ch = chipHalf * u
  fillRoundedRect(canvas, cx + u * 0.03, cy + u * 0.05, ch, ch, ch * 0.14, solid([...INK.shadow, 0.5]))
  fillRoundedRect(canvas, cx, cy, ch, ch, ch * 0.14, gradient([cx, cy - ch], [cx, cy + ch], INK.chipTop, INK.chipBottom))
  strokeRoundedRect(canvas, cx, cy, ch, ch, ch * 0.14, Math.max(1, u * 0.025), solid([150, 160, 176, 0.45]))
  // Pin-1 mark.
  fillCircle(canvas, cx - ch * 0.55, cy - ch * 0.55, ch * (simple ? 0.2 : 0.15), solid(INK.dot))
  if (!simple) {
    // Faint highlight across the upper half of the package.
    fillRoundedRect(canvas, cx, cy - ch * 0.45, ch * 0.86, ch * 0.4, ch * 0.12, solid([255, 255, 255, 0.06]))
  }
}

function drawAppArt(canvas, size, finalSize) {
  const c = size / 2
  const half = size * 0.44
  const radius = size * 0.2
  const inside = (x, y) => roundedRectDistance(x, y, c, c, half, half, radius)
  const simple = finalSize <= 24

  fillRoundedRect(canvas, c, c, half, half, radius, gradient([c - half, c - half], [c + half, c + half], INK.tileTop, INK.tileBottom))
  radialGlow(canvas, size * 0.26, size * 0.2, size * 0.42, [120, 200, 255], 0.35, inside)
  radialGlow(canvas, size * 0.84, size * 0.88, size * 0.38, INK.shadow, 0.4, inside)

  drawBoard(canvas, c, c, size * (simple ? 0.33 : 0.31), simple)

  // Rim light, bright along the top and fading towards the bottom.
  const rimWidth = Math.max(1, size * 0.014)
  paint(
    canvas,
    [0, 0, size, size],
    (x, y) => Math.max(0, Math.min(1, 0.5 + rimWidth / 2 - Math.abs(inside(x, y) + rimWidth / 2))),
    (x, y) => {
      const t = Math.max(0, Math.min(1, (y - (c - half)) / (half * 2)))
      return [INK.rim[0], INK.rim[1], INK.rim[2], 0.7 * (1 - t) + 0.15 * t]
    }
  )
}

function drawFileArt(canvas, size) {
  const left = size * 0.17
  const right = size * 0.83
  const top = size * 0.06
  const bottom = size * 0.94
  const fold = size * 0.22
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const halfWidth = (right - left) / 2
  const halfHeight = (bottom - top) / 2
  const radius = size * 0.06

  fillRoundedRect(canvas, cx + size * 0.02, cy + size * 0.025, halfWidth, halfHeight, radius, solid([...INK.shadow, 0.28]))
  fillRoundedRect(canvas, cx, cy, halfWidth, halfHeight, radius, gradient([0, top], [0, bottom], [252, 253, 255], [214, 228, 236]))

  // Dog-ear: the corner is cut away, then the flap is laid back on.
  const over = size * 0.2
  clearPolygon(canvas, [[right - fold, top - over], [right + over, top - over], [right + over, top + fold]])
  fillPolygon(canvas, [[right - fold, top], [right, top + fold], [right - fold, top + fold]], gradient(
    [right - fold, top], [right - fold, top + fold], [236, 244, 248], [184, 204, 214]
  ))

  // Teal band at the bottom, like a file-type label.
  fillRoundedRect(canvas, cx, bottom - size * 0.09, halfWidth - size * 0.05, size * 0.045, size * 0.02, gradient(
    [left, 0], [right, 0], INK.tileTop, [14, 110, 120]
  ))

  drawBoard(canvas, cx, cy - size * 0.01, size * 0.22, size < 40)
}

/* ─────────────────────────── render + downsample ────────────────────────── */

function render(size, draw) {
  const scale = size >= 256 ? 2 : 4
  const canvas = createCanvas(size * scale)
  draw(canvas, size * scale, size)
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = (canvas.width * (y * scale + sy) + (x * scale + sx)) * 4
          const alpha = canvas.data[i + 3]
          r += canvas.data[i] * alpha
          g += canvas.data[i + 1] * alpha
          b += canvas.data[i + 2] * alpha
          a += alpha
        }
      }
      const out = (png.width * y + x) << 2
      if (a <= 0) continue
      png.data[out] = Math.round(Math.min(255, r / a))
      png.data[out + 1] = Math.round(Math.min(255, g / a))
      png.data[out + 2] = Math.round(Math.min(255, b / a))
      png.data[out + 3] = Math.round(Math.min(255, (a / (scale * scale)) * 255))
    }
  }
  return png
}

export const drawAppIcon = (size) => render(size, drawAppArt)
export const drawFileIcon = (size) => render(size, drawFileArt)

/* ─────────────────────────────── writers ────────────────────────────────── */

/** Apple .icns made of PNG chunks (supported since OS X 10.7). */
function icns(pngBySize) {
  const types = [
    ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512],
    ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512], ['ic10', 1024]
  ]
  const chunks = types.map(([type, size]) => {
    const data = pngBySize.get(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

const assets = path.join(root, 'assets')
fs.mkdirSync(assets, { recursive: true })

const appPng = new Map()
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) appPng.set(size, PNG.sync.write(drawAppIcon(size)))

fs.writeFileSync(path.join(assets, 'icon.png'), appPng.get(512))
const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512]
fs.mkdirSync(path.join(assets, 'icons'), { recursive: true })
for (const size of linuxSizes) fs.writeFileSync(path.join(assets, 'icons', `${size}x${size}.png`), appPng.get(size))
fs.writeFileSync(path.join(assets, 'icon.ico'), await pngToIco([16, 24, 32, 48, 64, 128, 256].map((s) => appPng.get(s))))
fs.writeFileSync(path.join(assets, 'icon.icns'), icns(appPng))

// The document icon: package.json names it "assets/file-icon" and
// electron-builder picks .ico on Windows and .icns on macOS.
const filePng = new Map()
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) filePng.set(size, PNG.sync.write(drawFileIcon(size)))
fs.writeFileSync(path.join(assets, 'file-icon.png'), filePng.get(256))
fs.writeFileSync(path.join(assets, 'file-icon.ico'), await pngToIco([16, 32, 48, 64, 256].map((s) => filePng.get(s))))
fs.writeFileSync(path.join(assets, 'file-icon.icns'), icns(filePng))

console.log(`icons written to assets/: icon.png (512), icon.ico, icon.icns, file-icon.png, file-icon.ico, file-icon.icns, icons/ (${linuxSizes.length} sizes)`)
