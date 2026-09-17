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

const defaultSvg = fs.readFileSync(path.join(publicDir, 'app-icon.svg'), 'utf8')
const svgPath = path.join(publicDir, 'app-icon.svg')
const svg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, 'utf8') : defaultSvg

fs.writeFileSync(svgPath, svg)
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svg)

function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } })
  return resvg.render().asPng()
}

const png256 = renderPng(256)
fs.writeFileSync(path.join(buildDir, 'icon.png'), png256)
fs.writeFileSync(path.join(linuxIconDir, 'icon.png'), png256)

;(async () => {
  const icoBuffers = [16, 24, 32, 48, 64, 128, 256].map((size) => renderPng(size))
  const ico = await pngToIco(icoBuffers)
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  console.log(`Icons generated from ${path.relative(root, svgPath)} (icon.png, icons/256x256/icon.png, icon.ico).`)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
