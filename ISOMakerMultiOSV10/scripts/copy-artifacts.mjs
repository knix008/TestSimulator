/**
 * Copy packaged installers from release/ to the project root.
 * Matches Windows (.exe), macOS (.dmg), Linux (.AppImage).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = path.join(root, 'release')

if (!fs.existsSync(releaseDir)) {
  console.error(`[copy-artifacts] release folder not found: ${releaseDir}`)
  process.exit(1)
}

const patterns = [
  /^ISO Maker-Setup-.*\.exe$/i,
  /^ISO Maker-.*\.dmg$/i,
  /^ISO Maker-.*\.AppImage$/i,
]

function isArtifact(name) {
  if (name.includes('__uninstaller')) return false
  if (name.endsWith('.blockmap')) return false
  return patterns.some((re) => re.test(name))
}

const files = fs
  .readdirSync(releaseDir)
  .filter(isArtifact)
  .map((name) => {
    const full = path.join(releaseDir, name)
    return { name, full, mtime: fs.statSync(full).mtimeMs }
  })

if (!files.length) {
  console.error('[copy-artifacts] No installer artifacts found in release/')
  process.exit(1)
}

// Copy every matching artifact (latest build may include multiple platforms)
for (const file of files.sort((a, b) => a.name.localeCompare(b.name))) {
  const dest = path.join(root, file.name)
  fs.copyFileSync(file.full, dest)
  console.log(`[copy-artifacts] Copied → ${dest}`)
}
