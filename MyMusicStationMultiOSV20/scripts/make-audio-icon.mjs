// Copies the music-file type icon SVG and generates Windows/macOS icon sets.
// Source of truth: asset/audio-icon.svg
import { copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const svg = join(root, 'asset', 'audio-icon.svg')
copyFileSync(svg, join(root, 'public', 'audio-icon.svg'))

const result = spawnSync(`npx tauri icon "${svg}" -o src-tauri/audio-icons`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

console.log('wrote public/audio-icon.svg and src-tauri/audio-icons/*')
