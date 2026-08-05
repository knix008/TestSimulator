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
      <stop stop-color="#fff7c4"/>
      <stop offset="0.18" stop-color="#64d2b8"/>
      <stop offset="0.58" stop-color="#246a73"/>
      <stop offset="1" stop-color="#182129"/>
    </linearGradient>
    <radialGradient id="shine" cx="0" cy="0" r="1" gradientTransform="translate(55 48) rotate(42) scale(96 72)" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="0.32" stop-color="#fff4a2" stop-opacity="0.92"/>
      <stop offset="1" stop-color="#fff4a2" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#061016" flood-opacity="0.36"/>
    </filter>
  </defs>
  <rect x="24" y="24" width="208" height="208" rx="44" fill="url(#plate)" filter="url(#shadow)"/>
  <path d="M73 155 55 128l18-27M183 101l18 27-18 27" fill="none" stroke="#eafff8" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m116 176 29-96" fill="none" stroke="#ffe27a" stroke-width="17" stroke-linecap="round"/>
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
  const rows = []
  const center = size / 2
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0
    for (let x = 0; x < size; x += 1) {
      const nx = (x - center) / center
      const ny = (y - center) / center
      const radius = Math.sqrt(nx * nx + ny * ny)
      const corner = Math.max(Math.abs(nx), Math.abs(ny))
      const alpha = corner > 0.9 ? Math.max(0, 255 - (corner - 0.9) * 2550) : 255
      const shine = Math.max(0, 1 - Math.hypot(x - size * 0.22, y - size * 0.2) / (size * 0.32))
      const codeStroke = Math.abs(y - (size * 0.5 + Math.sin((x / size) * Math.PI * 4) * size * 0.08)) < size * 0.035
      const offset = 1 + x * 4
      row[offset] = Math.min(255, 22 + 200 * shine + 26 * (1 - radius))
      row[offset + 1] = Math.min(255, 93 + 140 * shine + (codeStroke ? 120 : 0))
      row[offset + 2] = Math.min(255, 101 + 70 * shine + (codeStroke ? 80 : 0))
      row[offset + 3] = alpha
      if (shine > 0.74 && (Math.abs(x - size * 0.2) < size * 0.012 || Math.abs(y - size * 0.2) < size * 0.012)) {
        row[offset] = 255
        row[offset + 1] = 255
        row[offset + 2] = 245
      }
    }
    rows.push(row)
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
