import { copyFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { platform } from 'node:os'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const resourceDir = join(root, 'src-tauri', 'yt-dlp')
const minBytes = 1_000_000

const targets = {
  win32: {
    fileName: 'yt-dlp.exe',
    downloadUrl: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    listCandidates: () => {
      try {
        return execFileSync('where.exe', ['yt-dlp'], { encoding: 'utf8' })
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      } catch {
        return []
      }
    },
  },
  darwin: {
    fileName: 'yt-dlp',
    downloadUrl: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    listCandidates: () => {
      try {
        const path = execFileSync('which', ['yt-dlp'], { encoding: 'utf8' }).trim()
        return path ? [path] : []
      } catch {
        return []
      }
    },
  },
  linux: {
    fileName: 'yt-dlp',
    downloadUrl: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux',
    listCandidates: () => {
      try {
        const path = execFileSync('which', ['yt-dlp'], { encoding: 'utf8' }).trim()
        return path ? [path] : []
      } catch {
        return []
      }
    },
  },
}

const target = targets[platform()]
// Same switches as fetch-ffmpeg: SKIP_DOWNLOAD=1 never hits the network,
// --download ignores local copies and fetches the latest release.
const skipDownload = process.env.SKIP_DOWNLOAD === '1'
const forceDownload = process.argv.includes('--download')

if (!target) {
  console.warn(`[fetch-ytdlp] Unsupported platform: ${platform()}`)
  process.exit(0)
}

mkdirSync(resourceDir, { recursive: true })
const destination = join(resourceDir, target.fileName)

if (!forceDownload && existsSync(destination) && statSync(destination).size >= minBytes) {
  console.log(`[fetch-ytdlp] already present: ${destination}`)
  process.exit(0)
}

for (const candidate of forceDownload ? [] : target.listCandidates()) {
  if (!existsSync(candidate) || statSync(candidate).size < minBytes) {
    continue
  }
  copyFileSync(candidate, destination)
  if (platform() !== 'win32') {
    chmodSync(destination, 0o755)
  }
  console.log(`[fetch-ytdlp] copied ${candidate} → ${destination}`)
  process.exit(0)
}

if (skipDownload) {
  console.warn('[fetch-ytdlp] SKIP_DOWNLOAD=1 — not downloading; URL extract will use PATH yt-dlp at runtime if available.')
  process.exit(0)
}

console.log(`[fetch-ytdlp] downloading ${target.downloadUrl}`)

try {
  const response = await fetch(target.downloadUrl, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < minBytes) {
    throw new Error(`downloaded file too small (${buffer.length} bytes)`)
  }
  writeFileSync(destination, buffer)
  if (platform() !== 'win32') {
    chmodSync(destination, 0o755)
  }
  console.log(
    `[fetch-ytdlp] downloaded → ${destination} (${Math.round(statSync(destination).size / 1024 / 1024)} MB)`,
  )
} catch (error) {
  console.warn(`[fetch-ytdlp] download failed: ${error}`)
  console.warn('[fetch-ytdlp] URL extract will use PATH yt-dlp at runtime if available.')
  process.exit(0)
}
