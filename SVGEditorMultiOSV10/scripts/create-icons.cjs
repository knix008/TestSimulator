const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const linuxIconDir = path.join(buildDir, 'icons', '256x256')
const publicDir = path.join(root, 'public')

fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(linuxIconDir, { recursive: true })
fs.mkdirSync(publicDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="plate" x1="34" y1="28" x2="222" y2="230" gradientUnits="userSpaceOnUse">
      <stop stop-color="#effbff"/>
      <stop offset="0.35" stop-color="#8bdcff"/>
      <stop offset="0.72" stop-color="#3aa6f2"/>
      <stop offset="1" stop-color="#1976d2"/>
    </linearGradient>
    <radialGradient id="shine" cx="0" cy="0" r="1" gradientTransform="translate(55 48) rotate(42) scale(96 72)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="0.32" stop-color="#dff7ff" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#dff7ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#061016" flood-opacity="0.36"/>
    </filter>
  </defs>
  <rect x="24" y="24" width="208" height="208" rx="44" fill="url(#plate)" filter="url(#shadow)"/>
  <path d="M70 148 54 128l16-20M186 108l16 20-16 20" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>
  <text x="128" y="147" text-anchor="middle" fill="#ffffff" stroke="#0b4f96" stroke-width="5" paint-order="stroke" font-family="Segoe UI, Arial, sans-serif" font-size="58" font-weight="800" letter-spacing="-2">SVG</text>
  <circle cx="57" cy="49" r="53" fill="url(#shine)"/>
  <path d="M51 30v38M32 49h38" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity="0.95"/>
</svg>`

fs.writeFileSync(path.join(publicDir, 'app-icon.svg'), svg)
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function makePng(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const center = size / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - center) / center
      const ny = (y - center) / center
      const radius = Math.sqrt(nx * nx + ny * ny)
      const corner = Math.max(Math.abs(nx), Math.abs(ny))
      const alpha = corner > 0.9 ? Math.max(0, 255 - (corner - 0.9) * 2550) : 255
      const shine = Math.max(0, 1 - Math.hypot(x - size * 0.22, y - size * 0.2) / (size * 0.32))
      const offset = (y * size + x) * 4
      pixels[offset] = Math.min(255, 42 + 210 * shine + 42 * (1 - radius))
      pixels[offset + 1] = Math.min(255, 134 + 104 * shine + 50 * (1 - radius))
      pixels[offset + 2] = Math.min(255, 214 + 36 * shine + 30 * (1 - radius))
      pixels[offset + 3] = alpha
      if (shine > 0.74 && (Math.abs(x - size * 0.2) < size * 0.012 || Math.abs(y - size * 0.2) < size * 0.012)) {
        pixels[offset] = 255
        pixels[offset + 1] = 255
        pixels[offset + 2] = 255
      }
    }
  }

  const drawRect = (left, top, width, height, color) => {
    const x0 = Math.max(0, Math.round(left * size))
    const y0 = Math.max(0, Math.round(top * size))
    const x1 = Math.min(size, Math.round((left + width) * size))
    const y1 = Math.min(size, Math.round((top + height) * size))
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const offset = (y * size + x) * 4
        pixels[offset] = color[0]
        pixels[offset + 1] = color[1]
        pixels[offset + 2] = color[2]
        pixels[offset + 3] = color[3]
      }
    }
  }

  const stroke = [7, 70, 136, 255]
  const fill = [255, 255, 255, 255]
  const letter = (rects, color) => rects.forEach((rect) => drawRect(...rect, color))
  const s = [[0.24, 0.35, 0.16, 0.07], [0.24, 0.35, 0.06, 0.17], [0.24, 0.49, 0.16, 0.07], [0.34, 0.49, 0.06, 0.17], [0.24, 0.63, 0.16, 0.07]]
  const v = [[0.43, 0.35, 0.055, 0.24], [0.56, 0.35, 0.055, 0.24], [0.48, 0.59, 0.08, 0.07]]
  const g = [[0.65, 0.35, 0.17, 0.07], [0.65, 0.35, 0.06, 0.35], [0.65, 0.63, 0.17, 0.07], [0.76, 0.51, 0.06, 0.19], [0.72, 0.51, 0.10, 0.06]]
  ;[s, v, g].forEach((rects) => letter(rects.map(([left, top, width, height]) => [left - 0.015, top - 0.015, width + 0.03, height + 0.03]), stroke))
  ;[s, v, g].forEach((rects) => letter(rects, fill))

  const rows = []
  for (let y = 0; y < size; y += 1) {
    rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]))
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const data = zlib.deflateSync(Buffer.concat(rows))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', data),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIco(png) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = 0
  header[7] = 0
  header[8] = 0
  header[9] = 0
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

const png = makePng(256)
fs.writeFileSync(path.join(buildDir, 'icon.png'), png)
fs.writeFileSync(path.join(linuxIconDir, 'icon.png'), png)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco(png))
