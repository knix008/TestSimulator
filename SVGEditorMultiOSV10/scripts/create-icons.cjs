// Generate all app/installer icons from a single source SVG so they always match.
// Source of truth: public/app-icon.svg (falls back to the embedded default below).
const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const pngToIco = require('png-to-ico').default

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const linuxIconDir = path.join(buildDir, 'icons', '256x256')
const publicDir = path.join(root, 'public')

fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(linuxIconDir, { recursive: true })
fs.mkdirSync(publicDir, { recursive: true })

const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
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

const svgPath = path.join(publicDir, 'app-icon.svg')
const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : defaultSvg

// Keep the in-app icon and favicon in sync with the source SVG.
fs.writeFileSync(svgPath, svg)
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)

function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } })
  return resvg.render().asPng()
}

// PNG icons (Windows/Linux/window).
const png256 = renderPng(256)
fs.writeFileSync(path.join(buildDir, 'icon.png'), png256)
fs.writeFileSync(path.join(linuxIconDir, 'icon.png'), png256)

// Multi-resolution .ico via png-to-ico, which writes standard Windows-compatible icon frames.
;(async () => {
  const icoBuffers = [16, 24, 32, 48, 64, 128, 256].map((size) => renderPng(size))
  const ico = await pngToIco(icoBuffers)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  console.log(`Icons generated from ${path.relative(root, svgPath)} (icon.png, icons/256x256/icon.png, icon.ico).`)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
