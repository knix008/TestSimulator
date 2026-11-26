/**
 * The Node host as one file: host/host.ts (+ src/iso9660) → dist-sidecar/host.mjs.
 * With --release the Node runtime that runs this script is copied next to it
 * (node.exe / node), so the installed program does not need Node.js.
 *
 * tauri.conf.json runs this before `tauri dev` / `tauri build`; the release
 * bundle ships dist-sidecar/ as resources/sidecar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const release = process.argv.includes('--release')
const out = path.join(root, 'dist-sidecar')

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out, { recursive: true })
await esbuild.build({
  entryPoints: [path.join(root, 'host', 'host.ts')],
  outfile: path.join(out, 'host.mjs'),
  bundle: true,
  platform: 'node',
  target: ['node20'],
  format: 'esm',
  sourcemap: release ? false : 'inline',
  logLevel: 'warning',
})
if (release) {
  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  fs.copyFileSync(process.execPath, path.join(out, name))
  if (process.platform !== 'win32') fs.chmodSync(path.join(out, name), 0o755)
}
console.log(`host ready: ${path.relative(root, out)}${release ? ' (with Node runtime)' : ''}`)
