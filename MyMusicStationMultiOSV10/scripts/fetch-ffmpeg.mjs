import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { platform } from 'node:os'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const resourceDir = join(root, 'src-tauri', 'ffmpeg')
const minBytes = 1_000_000

const targets = {
  win32: {
    fileName: 'ffmpeg.exe',
    listCandidates: () => {
      const found = []

      try {
        const lines = execFileSync('where.exe', ['ffmpeg'], { encoding: 'utf8' })
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
        found.push(...lines)
      } catch {
        // ignore
      }

      const searchRoots = [
        join(process.env.ProgramData || 'C:\\ProgramData', 'chocolatey', 'lib'),
        join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages'),
      ]

      for (const searchRoot of searchRoots) {
        if (!searchRoot || !existsSync(searchRoot)) {
          continue
        }

        try {
          for (const entry of readdirSync(searchRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.toLowerCase().includes('ffmpeg')) {
              continue
            }

            const nested = join(searchRoot, entry.name)
            collectExe(nested, found, 4)
          }
        } catch {
          // ignore unreadable roots
        }
      }

      return [...new Set(found)]
    },
  },
  darwin: {
    fileName: 'ffmpeg',
    listCandidates: () => {
      try {
        const path = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim()
        return path ? [path] : []
      } catch {
        return []
      }
    },
  },
  linux: {
    fileName: 'ffmpeg',
    listCandidates: () => {
      try {
        const path = execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim()
        return path ? [path] : []
      } catch {
        return []
      }
    },
  },
}

const collectExe = (directory, found, depth) => {
  if (depth < 0 || !existsSync(directory)) {
    return
  }

  let entries

  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      collectExe(fullPath, found, depth - 1)
      continue
    }

    if (entry.isFile() && entry.name.toLowerCase() === 'ffmpeg.exe') {
      found.push(fullPath)
    }
  }
}

const target = targets[platform()]

if (!target) {
  console.warn(`[fetch-ffmpeg] Unsupported platform: ${platform()}`)
  process.exit(0)
}

const destination = join(resourceDir, target.fileName)

if (existsSync(destination) && statSync(destination).size >= minBytes) {
  console.log(`[fetch-ffmpeg] already present: ${destination}`)
  process.exit(0)
}

const source = target
  .listCandidates()
  .filter((path) => existsSync(path))
  .map((path) => ({ path, size: statSync(path).size }))
  .filter((item) => item.size >= minBytes)
  .sort((left, right) => right.size - left.size)[0]?.path

if (!source) {
  console.warn('[fetch-ffmpeg] Full ffmpeg binary not found for bundling.')
  console.warn('[fetch-ffmpeg] Convert/Save will use PATH ffmpeg at runtime if available.')
  process.exit(0)
}

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
console.log(`[fetch-ffmpeg] copied ${source} → ${destination} (${Math.round(statSync(destination).size / 1024 / 1024)} MB)`)
