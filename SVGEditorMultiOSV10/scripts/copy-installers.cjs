const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const releaseDir = path.join(rootDir, 'release')
const installerExtensions = new Set(['.exe', '.dmg', '.appimage', '.deb', '.rpm', '.zip'])

function isInstaller(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  return installerExtensions.has(extension)
}

function collectInstallers(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name.endsWith('-unpacked') || entry.name === 'builder-debug.yml' ? [] : collectInstallers(fullPath)
    }
    return entry.isFile() && isInstaller(fullPath) ? [fullPath] : []
  })
}

const installers = collectInstallers(releaseDir)

if (installers.length === 0) {
  console.log('No installer files found in release directory.')
  process.exit(0)
}

for (const installer of installers) {
  const destination = path.join(rootDir, path.basename(installer))
  fs.copyFileSync(installer, destination)
  console.log(`Copied ${path.relative(rootDir, installer)} -> ${path.basename(destination)}`)
}