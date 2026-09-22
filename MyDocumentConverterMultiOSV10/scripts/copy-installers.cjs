const fs = require('node:fs')
const path = require('node:path')

const releaseDir = path.join(__dirname, '..', 'release')
const rootDir = path.join(__dirname, '..')
const installerExtensions = new Set(['.exe', '.dmg', '.zip', '.appimage', '.deb', '.rpm'])

if (!fs.existsSync(releaseDir)) {
  console.log('copy-installers: no release/ directory found, nothing to copy.')
  process.exit(0)
}

let newest = null
for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
  if (!entry.isFile()) {
    continue
  }
  const name = entry.name
  if (name.includes('__uninstaller') || name.endsWith('.blockmap')) {
    continue
  }
  if (!installerExtensions.has(path.extname(name).toLowerCase())) {
    continue
  }
  const stat = fs.statSync(path.join(releaseDir, name))
  if (!newest || stat.mtimeMs > newest.mtime) {
    newest = { name, mtime: stat.mtimeMs }
  }
}

if (!newest) {
  console.log('copy-installers: no installer file found in release/.')
  process.exit(0)
}

fs.copyFileSync(path.join(releaseDir, newest.name), path.join(rootDir, newest.name))
console.log(`copy-installers: copied "${newest.name}" to the project root.`)
