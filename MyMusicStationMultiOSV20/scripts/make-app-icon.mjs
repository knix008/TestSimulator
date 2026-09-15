// Builds Windows/macOS app icon rasters and the tray PNG from asset SVGs.
// Keeps only the files the bundle actually references.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()

const runTauriIcon = (svgPath, outDir) => {
  mkdirSync(outDir, { recursive: true })
  const result = spawnSync(`npx tauri icon "${svgPath}" -o "${outDir}"`, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const iconsDir = join(root, 'src-tauri', 'icons')
const trayDir = join(root, 'src-tauri', 'tray-icons')
const buildDir = join(iconsDir, '.build')

mkdirSync(iconsDir, { recursive: true })
mkdirSync(trayDir, { recursive: true })
rmSync(buildDir, { recursive: true, force: true })

runTauriIcon(join(root, 'asset', 'app-icon.svg'), join(buildDir, 'app'))
for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico']) {
  copyFileSync(join(buildDir, 'app', name), join(iconsDir, name))
}

runTauriIcon(join(root, 'asset', 'tray-icon.svg'), join(buildDir, 'tray'))
copyFileSync(join(buildDir, 'tray', '32x32.png'), join(trayDir, '32x32.png'))

rmSync(buildDir, { recursive: true, force: true })
console.log('wrote src-tauri/icons/{32x32,128x128,128x128@2x,icon.icns,icon.ico} and tray-icons/32x32.png')
