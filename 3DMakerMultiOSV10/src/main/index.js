import { app, BrowserWindow, Menu, shell, nativeImage, screen } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerModelCacheIpc } from './modelCache.js'
import { registerDepthBridge } from './depthBridge.js'

// Stable app identity / writable userData (avoids locked project folders).
app.setName('3D Space Maker')
// Unique Windows AppUserModelID so taskbar does not use the shared Electron icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.3dmaker.space')
}
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

/**
 * Resolve icon under project `assets/` for window + taskbar/dock.
 * Windows prefers `.ico`; PNG fallbacks for other platforms / sizes.
 */
function resolveAppIcon() {
  const roots = [
    join(process.cwd(), 'assets'),
    join(__dirname, '../../assets'),
    join(app.getAppPath(), 'assets'),
    join(app.getAppPath(), '../assets'),
    join(dirname(fileURLToPath(import.meta.url)), '../../assets')
  ]

  const names =
    process.platform === 'win32'
      ? ['icon.ico', 'icon-256.png', 'icon.png', 'app-icon.png']
      : ['icon.png', 'app-icon.png', 'icon-256.png', 'icon.ico']

  const seen = new Set()
  for (const root of roots) {
    for (const name of names) {
      const path = join(root, name)
      if (seen.has(path)) continue
      seen.add(path)
      if (existsSync(path)) return path
    }
  }
  return null
}

function loadAppIcon() {
  const iconPath = resolveAppIcon()
  if (!iconPath) return { path: null, image: null }
  const image = nativeImage.createFromPath(iconPath)
  if (!image || image.isEmpty()) return { path: iconPath, image: null }
  return { path: iconPath, image }
}

/** Hard floor so sidebar panels remain usable; window cannot be smaller than this. */
const MIN_WINDOW_WIDTH = 1360
const MIN_WINDOW_HEIGHT = 980

function resolveDefaultWindowBounds() {
  // Preferred size fits sidebar (~360px) + viewport; never below the hard minimum.
  const preferred = { width: 1560, height: 1060 }
  const work = screen.getPrimaryDisplay().workAreaSize
  const margin = 32

  return {
    width: Math.max(MIN_WINDOW_WIDTH, Math.min(preferred.width, work.width - margin)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.min(preferred.height, work.height - margin)),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT
  }
}

function createWindow() {
  const { image: icon } = loadAppIcon()
  const bounds = resolveDefaultWindowBounds()

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: bounds.minWidth,
    minHeight: bounds.minHeight,
    title: '3D Space Maker',
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.setMenuBarVisibility(false)

  // Reinforce icon after create (Windows taskbar / title bar).
  if (icon) win.setIcon(icon)

  // Reinforce after create — some platforms ignore constructor mins until set explicitly.
  win.setMinimumSize(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)

  win.on('will-resize', (event, newBounds) => {
    if (newBounds.width < MIN_WINDOW_WIDTH || newBounds.height < MIN_WINDOW_HEIGHT) {
      event.preventDefault()
    }
  })

  win.once('ready-to-show', () => {
    win.show()
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
    Menu.setApplicationMenu(null)
    registerModelCacheIpc()
    registerDepthBridge()

    const { image: icon } = loadAppIcon()
    if (icon && process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(icon)
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
