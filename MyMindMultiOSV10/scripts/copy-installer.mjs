import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const releaseDir = path.join(root, 'release')
const installerPattern = /\.(exe|dmg|AppImage|deb)$/i

function collectInstallers(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      if (name.endsWith('-unpacked') || name === 'mac') continue
      collectInstallers(full, out)
      continue
    }
    if (installerPattern.test(name) && !name.endsWith('.blockmap')) {
      out.push(full)
    }
  }
  return out
}

const installers = collectInstallers(releaseDir)
if (installers.length === 0) {
  console.warn('No installer files found in release/. Nothing to copy.')
  process.exit(0)
}

for (const src of installers) {
  const dest = path.join(root, path.basename(src))
  fs.copyFileSync(src, dest)
  console.log(`Copied -> ${path.basename(dest)}`)
}
