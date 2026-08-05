const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const linuxIconDir = path.join(buildDir, 'icons', '256x256')
const publicDir = path.join(root, 'public')

fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(linuxIconDir, { recursive: true })
fs.mkdirSync(publicDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="shell" x1="30" y1="20" x2="226" y2="236" gradientUnits="userSpaceOnUse">
      <stop stop-color="#14b8a6"/>
      <stop offset="0.45" stop-color="#0f766e"/>
      <stop offset="0.72" stop-color="#f97316"/>
      <stop offset="1" stop-color="#be123c"/>
    </linearGradient>
    <linearGradient id="paper" x1="64" y1="48" x2="190" y2="196" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffaf0"/>
      <stop offset="1" stop-color="#ecfeff"/>
    </linearGradient>
    <linearGradient id="nib" x1="152" y1="148" x2="210" y2="213" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="1" stop-color="#fef3c7"/>
    </linearGradient>
    <filter id="drop" x="-22%" y="-20%" width="144%" height="146%">
      <feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="#111827" flood-opacity="0.30"/>
    </filter>
    <filter id="paperShadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#134e4a" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect x="21" y="21" width="214" height="214" rx="54" fill="url(#shell)" filter="url(#drop)"/>
  <path d="M39 49c41-21 108-19 151 6 26 15 41 39 45 71v86H101c-42 0-69-27-69-69V73c2-9 4-17 7-24Z" fill="#ffffff" opacity="0.13"/>
  <path d="M70 47h82l38 38v103a13 13 0 0 1-13 13H70a13 13 0 0 1-13-13V60a13 13 0 0 1 13-13Z" fill="url(#paper)" filter="url(#paperShadow)"/>
  <path d="M152 47v31a9 9 0 0 0 9 9h29" fill="#ccfbf1"/>
  <path d="M79 145C91 83 123 74 139 116c14 37 38 35 61-13" fill="none" stroke="#111827" stroke-width="22" stroke-linecap="round" opacity="0.15"/>
  <path d="M80 140C92 84 122 76 139 115c15 35 39 32 60-14" fill="none" stroke="#111827" stroke-width="8" stroke-linecap="round"/>
  <path d="M80 140C92 84 122 76 139 115c15 35 39 32 60-14" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round"/>
  <path d="M96 96l35 26M153 118l34-20" stroke="#64748b" stroke-width="3" stroke-linecap="round" opacity="0.65"/>
  <circle cx="80" cy="140" r="14" fill="#111827"/>
  <circle cx="80" cy="140" r="7" fill="#2dd4bf"/>
  <circle cx="139" cy="115" r="14" fill="#111827"/>
  <circle cx="139" cy="115" r="7" fill="#f97316"/>
  <circle cx="199" cy="101" r="14" fill="#111827"/>
  <circle cx="199" cy="101" r="7" fill="#fb7185"/>
  <path d="M151 151l62 24-29 11-12 31-21-66Z" fill="#111827" opacity="0.98"/>
  <path d="M162 163l35 13-18 7-7 18-10-38Z" fill="url(#nib)"/>
  <path d="M179 185l22 22" stroke="#111827" stroke-width="8" stroke-linecap="round"/>
  <circle cx="171" cy="174" r="5" fill="#f97316"/>
</svg>`

const svgFileIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="paper" x1="58" y1="32" x2="198" y2="226" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ffffff"/>
      <stop offset="1" stop-color="#dbeafe"/>
    </linearGradient>
    <linearGradient id="fold" x1="160" y1="40" x2="210" y2="96" gradientUnits="userSpaceOnUse">
      <stop stop-color="#eff6ff"/>
      <stop offset="1" stop-color="#93c5fd"/>
    </linearGradient>
    <linearGradient id="badge" x1="58" y1="146" x2="198" y2="216" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38bdf8"/>
      <stop offset="1" stop-color="#1d4ed8"/>
    </linearGradient>
    <filter id="shadow" x="-25%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#0f172a" flood-opacity="0.24"/>
    </filter>
  </defs>
  <path d="M62 30h100l44 44v146a8 8 0 0 1-8 8H62a12 12 0 0 1-12-12V42a12 12 0 0 1 12-12Z" fill="url(#paper)" filter="url(#shadow)"/>
  <path d="M162 30v39a8 8 0 0 0 8 8h36" fill="url(#fold)"/>
  <path d="M76 102c17-30 37-31 51-2 12 26 31 23 50-11" fill="none" stroke="#2563eb" stroke-width="11" stroke-linecap="round"/>
  <circle cx="76" cy="102" r="9" fill="#38bdf8" stroke="#eff6ff" stroke-width="4"/>
  <circle cx="127" cy="100" r="9" fill="#1d4ed8" stroke="#eff6ff" stroke-width="4"/>
  <circle cx="177" cy="89" r="9" fill="#0f172a" stroke="#93c5fd" stroke-width="4"/>
  <rect x="56" y="150" width="144" height="52" rx="14" fill="url(#badge)"/>
  <text x="128" y="184" text-anchor="middle" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="1.5">SVG</text>
</svg>`

fs.writeFileSync(path.join(publicDir, 'app-icon.svg'), svg)
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)
fs.writeFileSync(path.join(buildDir, 'svg-file-icon.svg'), svgFileIcon)

function renderSvgToPng(svgSource, size) {
  return sharp(Buffer.from(svgSource)).resize(size, size).png().toBuffer()
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

async function main() {
  const png = await renderSvgToPng(svg, 256)
  const svgFilePng = await renderSvgToPng(svgFileIcon, 256)
  fs.writeFileSync(path.join(buildDir, 'icon.png'), png)
  fs.writeFileSync(path.join(linuxIconDir, 'icon.png'), png)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), makeIco(png))
  fs.writeFileSync(path.join(buildDir, 'svg-file-icon.png'), svgFilePng)
  fs.writeFileSync(path.join(buildDir, 'svg-file-icon.ico'), makeIco(svgFilePng))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
