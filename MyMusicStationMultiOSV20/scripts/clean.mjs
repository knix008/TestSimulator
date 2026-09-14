// Removes everything a build generates so the project can be archived small.
//
//   npm run clean          dist, src-tauri/target, *.tsbuildinfo, root installer
//                          copies, vite cache
//   npm run clean -- --all also the downloaded ffmpeg / yt-dlp binaries and node_modules
//
// Nothing here is source: `npm start` / `npm run build:*` recreate all of it
// (see scripts/ensure-toolchain.mjs for the downloads).
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { platform } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const all = process.argv.includes('--all')
const processName = platform() === 'win32' ? 'my_music_station.exe' : 'my_music_station'

// A running app holds src-tauri/target/release/*.exe open on Windows.
if (platform() === 'win32') {
  try {
    execFileSync('taskkill', ['/F', '/IM', processName, '/T'], { stdio: 'ignore', windowsHide: true })
    console.log('[clean] stopped running app')
  } catch {
    // Not running.
  }
}

const installerPattern = /\.(msi|dmg|AppImage|deb|rpm)$|-setup\.exe$/i

const targets = [
  'dist',
  join('src-tauri', 'target'),
  join('node_modules', '.vite'),
  ...readdirSync(root).filter((name) => /\.tsbuildinfo$/.test(name) || installerPattern.test(name)),
]

if (all) {
  targets.push('node_modules')
  for (const dir of [join('src-tauri', 'ffmpeg'), join('src-tauri', 'yt-dlp')]) {
    if (existsSync(join(root, dir))) {
      for (const name of readdirSync(join(root, dir))) {
        if (name !== '.gitkeep') {
          targets.push(join(dir, name))
        }
      }
    }
  }
}

const sizeOf = (path) => {
  try {
    const st = statSync(path)
    if (!st.isDirectory()) return st.size
    return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
  } catch {
    return 0
  }
}

let freed = 0
for (const relative of targets) {
  const path = join(root, relative)
  if (!existsSync(path)) {
    continue
  }
  const bytes = sizeOf(path)
  try {
    rmSync(path, { recursive: true, force: true })
    freed += bytes
    console.log(`[clean] removed ${relative} (${(bytes / 1024 / 1024).toFixed(1)} MB)`)
  } catch (error) {
    console.warn(`[clean] could not remove ${relative}: ${error instanceof Error ? error.message : error}`)
  }
}

console.log(`[clean] done — freed ${(freed / 1024 / 1024).toFixed(1)} MB${all ? '' : ' (add --all to also drop node_modules and downloaded ffmpeg/yt-dlp)'}`)
