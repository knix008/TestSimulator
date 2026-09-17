const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const pngToIco = require('png-to-ico').default

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const publicDir = path.join(root, 'public')

fs.mkdirSync(buildDir, { recursive: true })
fs.mkdirSync(publicDir, { recursive: true })

const defaultSvg = fs.readFileSync(path.join(publicDir, 'app-icon.svg'), 'utf8')
const svgPath = path.join(publicDir, 'app-icon.svg')
const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : defaultSvg

fs.writeFileSync(svgPath, svg)
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)

function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } })
  return resvg.render().asPng()
}

// Every icon Windows, macOS and Linux can ask for comes from this one render,
// so the installer, the executable, the taskbar and both shortcuts can never
// drift apart.
const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512]
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

const png512 = renderPng(512)
const png256 = renderPng(256)
// `icon.png` is what electron-builder hands macOS and what Electron shows at
// runtime on anything that is not Windows; 512 is the size macOS wants.
fs.writeFileSync(path.join(buildDir, 'icon.png'), png512)

for (const size of linuxSizes) {
  const dir = path.join(buildDir, 'icons', `${size}x${size}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'icon.png'), size === 512 ? png512 : size === 256 ? png256 : renderPng(size))
}

;(async () => {
  const ico = await pngToIco(icoSizes.map((size) => renderPng(size)))
  // One .ico drives the executable, the installer, the uninstaller, the Start
  // menu entry and the desktop shortcut.
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  console.log(`Icons generated from ${path.relative(root, svgPath)}:`)
  console.log(`  build/icon.ico   (${icoSizes.join(', ')})`)
  console.log(`  build/icon.png   (512)`)
  console.log(`  build/icons/*    (${linuxSizes.join(', ')})`)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
