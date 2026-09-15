// Writes asset/playlist-icon.svg's Windows ICO (Explorer .mplist icon).
// Keeps only src-tauri/playlist-icons/icon.ico — no Android/iOS/Appx leftovers.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const svg = join(root, 'asset', 'playlist-icon.svg')
const icoDir = join(root, 'src-tauri', 'playlist-icons')
const buildDir = join(icoDir, '.build')

mkdirSync(icoDir, { recursive: true })
rmSync(buildDir, { recursive: true, force: true })
mkdirSync(buildDir, { recursive: true })

const result = spawnSync(`npx tauri icon "${svg}" -o "${buildDir}"`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

copyFileSync(join(buildDir, 'icon.ico'), join(icoDir, 'icon.ico'))
rmSync(buildDir, { recursive: true, force: true })
console.log('wrote src-tauri/playlist-icons/icon.ico')
