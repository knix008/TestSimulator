import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

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

    found.push({
      name: entry.name,
      path: fullPath,
      modifiedMs: statSync(fullPath).mtimeMs,
    })
  }

  return found
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

const installers = [...installersByName.values()].sort((left, right) => right.modifiedMs - left.modifiedMs)

if (!installers.length) {
  console.warn('[copy-installers] No installer files found under release/bundle.')
  console.warn(`[copy-installers] Checked: ${bundleRoots.join(', ') || '(none)'}`)
  process.exit(0)
}

for (const installer of installers) {
  const destination = join(root, installer.name)
  copyFileSync(installer.path, destination)
  const sizeMb = (statSync(destination).size / (1024 * 1024)).toFixed(1)
  console.log(`[copy-installers] ${installer.name} → ./ (${sizeMb} MB)`)
}

console.log(`[copy-installers] Copied ${installers.length} installer(s) to project root.`)
