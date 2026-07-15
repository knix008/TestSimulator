import { readdir, copyFile } from 'node:fs/promises'
import { resolve, extname, basename } from 'node:path'

const rootDir = resolve('.')
const releaseDir = resolve('release')
const installerExts = new Set([
  '.exe',
  '.msi',
  '.dmg',
  '.pkg',
  '.appimage',
  '.deb',
  '.rpm',
  '.snap'
])

async function main() {
  let entries = []
  try {
    entries = await readdir(releaseDir, { withFileTypes: true })
  } catch {
    console.log('[copy-installers] release/ not found, skipping')
    return
  }

  const installers = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => installerExts.has(extname(name).toLowerCase()))

  if (installers.length === 0) {
    console.log('[copy-installers] no installer files found in release/, skipping')
    return
  }

  for (const name of installers) {
    const source = resolve(releaseDir, name)
    const target = resolve(rootDir, basename(name))
    await copyFile(source, target)
    console.log(`[copy-installers] ${name} -> ${basename(target)}`)
  }
}

main().catch((err) => {
  console.error('[copy-installers] failed:', err)
  process.exitCode = 1
})
