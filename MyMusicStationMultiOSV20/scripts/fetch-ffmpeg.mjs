import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { platform, tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { Readable, Transform } from 'node:stream'

const root = process.cwd()
const resourceDir = join(root, 'src-tauri', 'ffmpeg')
const minBytes = 1_000_000

// Set SKIP_DOWNLOAD=1 to only look for a local ffmpeg; FFMPEG_DOWNLOAD_URL
// overrides the archive URL (must contain an ffmpeg binary somewhere inside).
const skipDownload = process.env.SKIP_DOWNLOAD === '1'
// `--download` ignores local copies and (re)downloads the bundled binary.
const forceDownload = process.argv.includes('--download')

const targets = {
  win32: {
    fileName: 'ffmpeg.exe',
    // Static GPL build; the zip holds <dir>/bin/ffmpeg.exe.
    downloadUrl: 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
    archiveName: 'ffmpeg.zip',
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
    downloadUrl: 'https://evermeet.cx/ffmpeg/getrelease/zip',
    archiveName: 'ffmpeg.zip',
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
    downloadUrl: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
    archiveName: 'ffmpeg.tar.xz',
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

// First file named like the ffmpeg binary anywhere under `directory`.
const findExtractedBinary = (directory, fileName, depth = 6) => {
  if (depth < 0) {
    return null
  }

  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase() && statSync(fullPath).size >= minBytes) {
      return fullPath
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = findExtractedBinary(join(directory, entry.name), fileName, depth - 1)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

// On Windows use the built-in bsdtar explicitly: a Git-for-Windows GNU tar
// earlier in PATH treats `C:\...` as a remote host and cannot read zip files.
const tarCommand = () => {
  if (platform() === 'win32') {
    const systemTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    if (existsSync(systemTar)) {
      return systemTar
    }
  }
  return 'tar'
}

// Download the platform archive, unpack it with the system `tar` (bsdtar on
// Windows/macOS reads zip; GNU tar on Linux reads tar.xz) and copy the binary.
const downloadFfmpeg = async (target, destination) => {
  const url = process.env.FFMPEG_DOWNLOAD_URL || target.downloadUrl
  const workDir = mkdtempSync(join(tmpdir(), 'mms-ffmpeg-'))
  const archivePath = join(workDir, target.archiveName)

  try {
    console.log(`[fetch-ffmpeg] downloading ${url}`)
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`)
    }

    const total = Number(response.headers.get('content-length') || 0)
    let received = 0
    let lastLogged = 0
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length
        if (received - lastLogged >= 20 * 1024 * 1024) {
          lastLogged = received
          console.log(`[fetch-ffmpeg]   ${formatMb(received)}${total ? ` / ${formatMb(total)}` : ''}`)
        }
        callback(null, chunk)
      },
    })

    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(archivePath))
    console.log(`[fetch-ffmpeg] downloaded ${formatMb(received)}, extracting...`)

    const extractDir = join(workDir, 'extract')
    mkdirSync(extractDir, { recursive: true })
    execFileSync(tarCommand(), ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' })

    const binary = findExtractedBinary(extractDir, target.fileName)
    if (!binary) {
      throw new Error(`${target.fileName} not found inside the archive`)
    }

    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(binary, destination)
    if (platform() !== 'win32') {
      chmodSync(destination, 0o755)
    }

    console.log(`[fetch-ffmpeg] installed → ${destination} (${formatMb(statSync(destination).size)})`)
    return true
  } catch (error) {
    console.warn(`[fetch-ffmpeg] download failed: ${error instanceof Error ? error.message : error}`)
    return false
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

const target = targets[platform()]

if (!target) {
  console.warn(`[fetch-ffmpeg] Unsupported platform: ${platform()}`)
  process.exit(0)
}

const destination = join(resourceDir, target.fileName)

if (!forceDownload && existsSync(destination) && statSync(destination).size >= minBytes) {
  console.log(`[fetch-ffmpeg] already present: ${destination}`)
  process.exit(0)
}

if (forceDownload) {
  process.exit((await downloadFfmpeg(target, destination)) ? 0 : 1)
}

const source = target
  .listCandidates()
  .filter((path) => existsSync(path))
  .map((path) => ({ path, size: statSync(path).size }))
  .filter((item) => item.size >= minBytes)
  .sort((left, right) => right.size - left.size)[0]?.path

if (source) {
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
  console.log(`[fetch-ffmpeg] copied ${source} → ${destination} (${formatMb(statSync(destination).size)})`)
  process.exit(0)
}

console.log('[fetch-ffmpeg] no local ffmpeg found.')

if (skipDownload) {
  console.warn('[fetch-ffmpeg] SKIP_DOWNLOAD=1 — not downloading; Convert/Save will use PATH ffmpeg at runtime if available.')
  process.exit(0)
}

if (!(await downloadFfmpeg(target, destination))) {
  console.warn('[fetch-ffmpeg] Convert/Save will use PATH ffmpeg at runtime if available.')
  console.warn('[fetch-ffmpeg] To bundle manually, place the binary at ' + destination)
}

process.exit(0)
