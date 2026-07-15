const path = require('node:path')
const { existsSync } = require('node:fs')
const rcedit = require('rcedit')

/**
 * Force-set EXE icon after pack so NSIS-created shortcuts also use the app icon.
 * This is used because signAndEditExecutable is disabled for local build stability.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const iconPath = path.resolve(context.packager.projectDir, 'assets', 'icon.ico')
  if (!existsSync(iconPath)) {
    console.warn('[afterPack:set-win-icon] icon not found:', iconPath)
    return
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = path.join(context.appOutDir, exeName)

  if (!existsSync(exePath)) {
    console.warn('[afterPack:set-win-icon] exe not found:', exePath)
    return
  }

  await rcedit(exePath, {
    icon: iconPath
  })

  console.log(`[afterPack:set-win-icon] updated icon: ${exeName}`)
}
