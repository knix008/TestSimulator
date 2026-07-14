import { app, BrowserWindow, shell, nativeImage } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { registerModelCacheIpc } from './modelCache.js'
import { registerDepthBridge } from './depthBridge.js'

// Stable app identity / writable userData (avoids locked project folders).
app.setName('3D Space Maker')
app.setPath('userData', join(app.getPath('appData'), '3d-maker-space'))

// Chromium GPU/disk cache often fails on Windows when another Electron
// instance holds the same cache (ACCESS_DENIED / 0x5).
const chromiumCacheDir = join(app.getPath('userData'), 'chromium-cache')
mkdirSync(chromiumCacheDir, { recursive: true })
app.commandLine.appendSwitch('disk-cache-dir', chromiumCacheDir)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
}

function resolveAppIcon() {
  const candidates = [
    join(__dirname, '../../assets/icon.png'),
    join(__dirname, '../../assets/app-icon.png'),
    join(app.getAppPath(), 'assets/icon.png'),
    join(app.getAppPath(), 'assets/app-icon.png')
  ]

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

function createWindow() {
  const iconPath = resolveAppIcon()
  const icon = iconPath ? nativeImage.createFromPath(iconPath) : undefined

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: '3D Space Maker',
    backgroundColor: '#0f1419',
    ...(icon && !icon.isEmpty() ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

if (gotTheLock) {
  app.whenReady().then(() => {
    registerModelCacheIpc()
    registerDepthBridge()

    const iconPath = resolveAppIcon()
    if (iconPath && process.platform === 'darwin' && app.dock) {
      const icon = nativeImage.createFromPath(iconPath)
      if (!icon.isEmpty()) app.dock.setIcon(icon)
    }

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
