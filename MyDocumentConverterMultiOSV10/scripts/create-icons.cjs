// Renders every icon the build needs from the two SVGs in public/.
//
//   public/app-icon.svg  → build/icon.ico, build/icon.png, build/icons/<n>x<n>/icon.png
//   public/file-icon.svg → build/file-icon.ico, build/file-icon.png
//
// One render drives the executable, the installer, the uninstaller, the
// taskbar, both shortcuts and the running window, so none of them can drift
// apart. The file icon is what the installer registers for .mdcv documents.
const fs = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
const pngToIco = require('png-to-ico').default

const root = path.join(__dirname, '..')
const buildDir = path.join(root, 'build')
const publicDir = path.join(root, 'public')

fs.mkdirSync(buildDir, { recursive: true })

function renderPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true } })
  return resvg.render().asPng()
}

const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512]
const icoSizes = [16, 24, 32, 48, 64, 128, 256]

async function main() {
  const appSvg = fs.readFileSync(path.join(publicDir, 'app-icon.svg'), 'utf8')
  const fileSvg = fs.readFileSync(path.join(publicDir, 'file-icon.svg'), 'utf8')
  // The favicon of the web build is the same picture.
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), appSvg)

  fs.writeFileSync(path.join(buildDir, 'icon.png'), renderPng(appSvg, 512))
  for (const size of linuxSizes) {
    const dir = path.join(buildDir, 'icons', `${size}x${size}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'icon.png'), renderPng(appSvg, size))
  }
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), await pngToIco(icoSizes.map((size) => renderPng(appSvg, size))))

  fs.writeFileSync(path.join(buildDir, 'file-icon.png'), renderPng(fileSvg, 512))
  fs.writeFileSync(path.join(buildDir, 'file-icon.ico'), await pngToIco(icoSizes.map((size) => renderPng(fileSvg, size))))

  console.log('Icons generated:')
  console.log(`  build/icon.ico, build/icon.png, build/icons/* (${linuxSizes.join(', ')})`)
  console.log('  build/file-icon.ico, build/file-icon.png')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
