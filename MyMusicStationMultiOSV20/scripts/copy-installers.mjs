import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { platform } from 'node:os'

const root = process.cwd()
const installerExtensions = new Set(['.exe', '.msi', '.dmg', '.appimage', '.deb', '.rpm'])

const bundleRoots = [
  process.env.CARGO_TARGET_DIR
    ? join(process.env.CARGO_TARGET_DIR, 'release', 'bundle')
    : null,
  join(root, 'src-tauri', 'target', 'release', 'bundle'),
].filter((path, index, paths) => path && paths.indexOf(path) === index)

const collectInstallers = (directory, found = []) => {
  if (!existsSync(directory)) {
    return found
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      collectInstallers(fullPath, found)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const extension = extname(entry.name).toLowerCase()

    if (!installerExtensions.has(extension)) {
      continue
    }

    // Skip intermediate NSIS/Electron-style helpers if they appear.
    if (entry.name.includes('__uninstaller') || entry.name.endsWith('.blockmap')) {
      continue
    }

    // Never treat the app binary itself as an installer.
    if (entry.name.toLowerCase() === 'my_music_station.exe' || entry.name.toLowerCase() === 'my_music_station') {
      continue
    }

    found.push({
      name: entry.name,
      path: fullPath,
      modifiedMs: statSync(fullPath).mtimeMs,
    })
  }

  return found
}

/** Prefer one final distributor image per platform. */
const scoreInstaller = (installer) => {
  const name = installer.name.toLowerCase()
  const extension = extname(name)

  if (platform() === 'win32') {
    if (name.includes('-setup.exe') || name.endsWith('setup.exe')) {
      return 100
    }
    if (extension === '.exe') {
      return 80
    }
    if (extension === '.msi') {
      return 40
    }
    return 0
  }

  if (platform() === 'darwin') {
    if (extension === '.dmg') {
      return 100
    }
    return 0
  }

  if (extension === '.appimage') {
    return 100
  }
  if (extension === '.deb') {
    return 60
  }
  if (extension === '.rpm') {
    return 50
  }

  return 0
}

const installersByName = new Map()

for (const bundleRoot of bundleRoots) {
  for (const installer of collectInstallers(bundleRoot)) {
    const current = installersByName.get(installer.name)

    if (!current || installer.modifiedMs > current.modifiedMs) {
      installersByName.set(installer.name, installer)
    }
  }
}

const installers = [...installersByName.values()]
  .filter((installer) => scoreInstaller(installer) > 0)
  .sort((left, right) => {
    const scoreDiff = scoreInstaller(right) - scoreInstaller(left)
    if (scoreDiff !== 0) {
      return scoreDiff
    }
    return right.modifiedMs - left.modifiedMs
  })

if (!installers.length) {
  console.warn('[copy-installers] No installer files found under release/bundle.')
  console.warn(`[copy-installers] Checked: ${bundleRoots.join(', ') || '(none)'}`)
  process.exit(0)
}

const selected = installers[0]

// Remove previous root installers so only the latest final image remains.
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) {
    continue
  }

  const extension = extname(entry.name).toLowerCase()
  if (!installerExtensions.has(extension)) {
    continue
  }

  if (entry.name.toLowerCase() === 'my_music_station.exe') {
    continue
  }

  const stalePath = join(root, entry.name)
  if (entry.name === selected.name) {
    continue
  }

  rmSync(stalePath, { force: true })
  console.log(`[copy-installers] removed old root installer: ${entry.name}`)
}

const destination = join(root, selected.name)

const copyWithRetry = () => {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      copyFileSync(selected.path, destination)
      return
    } catch (error) {
      lastError = error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400 * attempt)
    }
  }
  console.error(`[copy-installers] could not write ${selected.name} (file may be open in Explorer or the editor). Close it and retry.`)
  throw lastError
}

copyWithRetry()
const sizeMb = (statSync(destination).size / (1024 * 1024)).toFixed(1)
console.log(`[copy-installers] ${selected.name} → ./ (${sizeMb} MB)`)
console.log('[copy-installers] Copied 1 final installer to project root.')
