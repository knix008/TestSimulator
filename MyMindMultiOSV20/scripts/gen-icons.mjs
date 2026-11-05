// Regenerates every raster icon from the SVG sources in assets/ (the sized PNGs and icon.icns: npm run tauri icon assets/icon.png).
//   assets/app-icon.svg   -> app icon (window, taskbar, installer, in-app logo)
//   assets/file-icon.svg  -> .mmap document icon (app icon composited on a sheet)
//
// Requires dev tools: npm i -D sharp png-to-ico
// Run: node scripts/gen-icons.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const p = (rel) => resolve(root, rel)

const renderSvg = (svg, size) =>
  sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

async function main() {
  const appSvg = await readFile(p('assets/app-icon.svg'))
  const fileSvg = await readFile(p('assets/file-icon.svg'))

  // --- App icon: PNG sizes for every platform + in-app logo ---
  const app512 = await renderSvg(appSvg, 512)
  await writeFile(p('assets/icon.png'), app512)
  await writeFile(p('public/icon.png'), app512)

  // Windows .ico (app + installer) — multiple sizes for crisp scaling.
  const appIcoSizes = await Promise.all([256, 128, 64, 48, 32, 16].map((s) => renderSvg(appSvg, s)))
  await writeFile(p('assets/icon.ico'), await pngToIco(appIcoSizes))

  // --- .mmap file icon: composite the app icon onto the document sheet ---
  const sheet512 = await renderSvg(fileSvg, 512)
  const overlay = await sharp(appSvg, { density: 384 }).resize(232, 232).png().toBuffer()
  const composed512 = await sharp(sheet512)
    .composite([{ input: overlay, left: (512 - 232) / 2, top: 236 }])
    .png()
    .toBuffer()
  await writeFile(p('assets/file-icon.png'), composed512)

  // File .ico: downscale the composited raster for the smaller sizes.
  const fileIcoSizes = await Promise.all(
    [256, 64, 48, 32, 16].map((s) => sharp(composed512).resize(s, s).png().toBuffer()),
  )
  await writeFile(p('assets/file-icon.ico'), await pngToIco(fileIcoSizes))

  console.log('icons generated:')
  console.log('  assets/icon.png, public/icon.png')
  console.log('  assets/icon.ico (app + installer)')
  console.log('  assets/file-icon.png, assets/file-icon.ico (.mmap)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
