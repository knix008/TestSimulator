import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')

function blend(png, x, y, r, g, b, a) {
  if (x < 1 || y < 1 || x >= png.width - 1 || y >= png.height - 1) return
  const i = (png.width * y + x) << 2
  const sa = a / 255
  const da = png.data[i + 3] / 255
  const out = sa + da * (1 - sa)
  if (out <= 0) return
  png.data[i] = Math.round((r * sa + png.data[i] * da * (1 - sa)) / out)
  png.data[i + 1] = Math.round((g * sa + png.data[i + 1] * da * (1 - sa)) / out)
  png.data[i + 2] = Math.round((b * sa + png.data[i + 2] * da * (1 - sa)) / out)
  png.data[i + 3] = Math.round(out * 255)
}

function fillTri(png, p, q, s, color) {
  const pts = [p, q, s].map(([x, y]) => [Math.round(x), Math.round(y)])
  const ys = pts.map((pt) => pt[1])
  const minY = Math.max(1, Math.min(...ys))
  const maxY = Math.min(png.height - 2, Math.max(...ys))
  for (let y = minY; y <= maxY; y++) {
    const xs = []
    for (let e = 0; e < 3; e++) {
      const a = pts[e]
      const b = pts[(e + 1) % 3]
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1])
        xs.push(a[0] + t * (b[0] - a[0]))
      }
    }
    if (xs.length < 2) continue
    const from = Math.max(1, Math.ceil(Math.min(...xs)))
    const to = Math.min(png.width - 2, Math.floor(Math.max(...xs)))
    for (let x = from; x <= to; x++) blend(png, x, y, color[0], color[1], color[2], color[3])
  }
}

function glow(png, cx, cy, radius, color) {
  const r2 = radius * radius
  const y0 = Math.max(1, Math.floor(cy - radius))
  const y1 = Math.min(png.height - 2, Math.ceil(cy + radius))
  const x0 = Math.max(1, Math.floor(cx - radius))
  const x1 = Math.min(png.width - 2, Math.ceil(cx + radius))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = (x - cx) ** 2 + (y - cy) ** 2
      if (d > r2) continue
      const alpha = Math.round(color[3] * (1 - Math.sqrt(d) / radius))
      blend(png, x, y, color[0], color[1], color[2], alpha)
    }
  }
}

const GLYPHS = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110']
}

function fillRect(png, x, y, w, h, color) {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = Math.round(x + w)
  const y1 = Math.round(y + h)
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) blend(png, xx, yy, color[0], color[1], color[2], color[3])
  }
}

function block3d(png, x, y, cell) {
  const depth = Math.max(2, cell * 0.55)
  const front = [236, 248, 255, 255]
  const top = [176, 220, 255, 255]
  const side = [28, 78, 140, 255]
  fillTri(png, [x + cell, y], [x + cell + depth, y - depth * 0.72], [x + cell + depth, y + cell - depth * 0.72], side)
  fillTri(png, [x + cell, y], [x + cell + depth, y + cell - depth * 0.72], [x + cell, y + cell], [18, 52, 102, 255])
  fillTri(png, [x, y], [x + depth, y - depth * 0.72], [x + cell + depth, y - depth * 0.72], [255, 255, 255, 255])
  fillTri(png, [x, y], [x + cell + depth, y - depth * 0.72], [x + cell, y], top)
  fillRect(png, x, y, cell, cell, front)
}

function stamp3d(png, text, originX, originY, cell) {
  const advance = cell * 5 + cell * 0.7
  text.split('').forEach((char, index) => {
    const rows = GLYPHS[char]
    rows.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] !== '1') continue
        block3d(png, originX + index * advance + gx * cell, originY + gy * cell, cell)
      }
    })
  })
}

function stampFlat(png, text, originX, originY, cell, color) {
  const advance = cell * 5 + cell * 0.55
  text.split('').forEach((char, index) => {
    const rows = GLYPHS[char]
    rows.forEach((row, gy) => {
      for (let gx = 0; gx < row.length; gx++) {
        if (row[gx] !== '1') continue
        fillRect(png, originX + index * advance + gx * cell, originY + gy * cell, cell, cell, color)
      }
    })
  })
}

export function drawAppIcon(size) {
  const png = new PNG({ width: size, height: size })
  const s = size * 0.34
  const cx = size * 0.5
  const cy = size * 0.5
  const top = [[cx, cy - s * 0.95], [cx + s, cy - s * 0.38], [cx, cy + s * 0.12], [cx - s, cy - s * 0.38]]
  const left = [[cx - s, cy - s * 0.38], [cx, cy + s * 0.12], [cx, cy + s], [cx - s, cy + s * 0.5]]
  const right = [[cx + s, cy - s * 0.38], [cx, cy + s * 0.12], [cx, cy + s], [cx + s, cy + s * 0.5]]
  fillTri(png, top[0], top[1], top[2], [168, 214, 248, 255])
  fillTri(png, top[0], top[2], top[3], [126, 184, 230, 255])
  fillTri(png, left[0], left[1], left[2], [52, 128, 198, 255])
  fillTri(png, left[0], left[2], left[3], [38, 102, 172, 255])
  fillTri(png, right[0], right[1], right[2], [20, 58, 112, 255])
  fillTri(png, right[0], right[2], right[3], [12, 40, 84, 255])
  const cell = Math.max(2, Math.round(size * 0.034))
  const textWidth = cell * 5 * 3 + cell * 0.7 * 2
  stamp3d(png, 'CAD', cx - textWidth / 2, cy - cell * 4.2, cell)
  glow(png, size * 0.24, size * 0.22, size * 0.16, [255, 246, 196, 210])
  return png
}

export function drawFileIcon(size) {
  const png = new PNG({ width: size, height: size })
  const left = size * 0.22
  const right = size * 0.78
  const top = size * 0.12
  const bottom = size * 0.9
  const fold = size * 0.16
  fillRect(png, left + size * 0.035, top + size * 0.04, right - left, bottom - top, [150, 164, 180, 180])
  fillRect(png, left, top, right - left - fold, bottom - top, [248, 250, 253, 255])
  fillRect(png, right - fold, top + fold, fold, bottom - top - fold, [248, 250, 253, 255])
  fillTri(png, [right - fold, top], [right, top + fold], [right - fold, top + fold], [186, 204, 222, 255])
  const cell = Math.max(2, Math.round(size * 0.042))
  const textWidth = cell * 5 * 3 + cell * 0.55 * 2
  const textHeight = cell * 7
  stampFlat(png, 'CAD', (left + right) / 2 - textWidth / 2, (top + bottom) / 2 - textHeight / 2, cell, [18, 52, 96, 255])
  return png
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, PNG.sync.write(png))
}

const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
const app256 = drawAppIcon(256)
const file256 = drawFileIcon(256)
writePng(path.join(root, 'build', 'icon.png'), app256)
writePng(path.join(root, 'public', 'favicon.png'), app256)
writePng(path.join(root, 'build', 'file-icon.png'), file256)
for (const size of sizes) {
  writePng(path.join(root, 'build', 'icons', `${size}x${size}.png`), drawAppIcon(size))
}
const icoBuffers = [16, 32, 48, 64, 128, 256].map((size) => PNG.sync.write(drawAppIcon(size)))
const fileIco = [16, 32, 48, 256].map((size) => PNG.sync.write(drawFileIcon(size)))
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), await pngToIco(icoBuffers))
fs.writeFileSync(path.join(root, 'build', 'file-icon.ico'), await pngToIco(fileIco))
console.log('icons written')
