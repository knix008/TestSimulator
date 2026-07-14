import { copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'node_modules', 'onnxruntime-web', 'dist')
const destDir = join(root, 'src', 'renderer', 'ort')
const legacyPublicOrt = join(root, 'src', 'renderer', 'public', 'ort')

const files = [
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm'
]

mkdirSync(destDir, { recursive: true })

for (const name of files) {
  const from = join(srcDir, name)
  const to = join(destDir, name)
  if (!existsSync(from)) {
    console.warn(`[copy-ort] missing: ${name}`)
    continue
  }
  copyFileSync(from, to)
  console.log(`[copy-ort] ${name}`)
}

// Old location caused Vite "public file import" errors — remove if present.
if (existsSync(legacyPublicOrt)) {
  rmSync(legacyPublicOrt, { recursive: true, force: true })
  console.log('[copy-ort] removed legacy public/ort')
}
