// Generates the raster file-type icons from build/file-icon.svg.
//
//   build/file-icon.png   (512x512, used for Linux file associations)
//   build/file-icon.ico   (multi-size, used for Windows file associations)
//
// Requires optional dev tools that are NOT bundled by default. Install once:
//   npm i -D sharp png-to-ico
// then run:
//   node scripts/make-file-icon.mjs
//
// After generating, point the association at it by adding
//   "icon": "build/file-icon.ico"   (win)  /  "build/file-icon.png" (linux)
// inside package.json > build > fileAssociations.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svgPath = resolve(root, 'build/file-icon.svg')
const pngPath = resolve(root, 'build/file-icon.png')
const icoPath = resolve(root, 'build/file-icon.ico')

async function load(name) {
  try {
    return (await import(name)).default ?? (await import(name))
  } catch {
    return null
  }
}

const sharp = await load('sharp')
if (!sharp) {
  console.error('[make-file-icon] "sharp" is not installed. Run: npm i -D sharp png-to-ico')
  process.exit(1)
}

const svg = await readFile(svgPath)
// SVG embeds icons/256x256.png relatively; sharp resolves hrefs from the SVG's density render.
const base = await sharp(svg, { density: 384 }).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
await writeFile(pngPath, base)
console.log('[make-file-icon] wrote', pngPath)

const pngToIco = await load('png-to-ico')
if (pngToIco) {
  const sizes = await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map((s) => sharp(base).resize(s, s).png().toBuffer()),
  )
  await writeFile(icoPath, await pngToIco(sizes))
  console.log('[make-file-icon] wrote', icoPath)
} else {
  console.warn('[make-file-icon] "png-to-ico" not installed; skipped .ico. Run: npm i -D png-to-ico')
}
