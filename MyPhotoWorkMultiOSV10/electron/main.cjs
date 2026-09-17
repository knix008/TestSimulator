const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDev = !app.isPackaged
const appId = 'com.shkwon.myphotoworkmultios'
const runtimeIcon = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const currentWindowSize = { width: 1680, height: 940 }

if (process.platform === 'win32') {
  app.setAppUserModelId(appId)
}

// Chromium GPU/HTTP disk cache throws Access Denied (0x5) on Windows when two
// instances share the same userData folder, or when a leftover GPUCache lock
// remains. Isolate the unpackaged profile and skip the shader disk cache.
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'My Photo Work V1.0 Dev'))
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: currentWindowSize.width,
    height: currentWindowSize.height,
    minWidth: currentWindowSize.width,
    minHeight: currentWindowSize.height,
    title: 'My Photo Work V1.0',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#11161d' : '#f4f7f5',
    icon: runtimeIcon,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (mainWindow.forceClose) {
      return
    }
    event.preventDefault()
    mainWindow.webContents.send('window:close-request')
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function fileFilters() {
  return [
    { name: 'Photo Work and Images', extensions: ['mpw', 'png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'avif', 'bmp'] },
    { name: 'Photo Work Project', extensions: ['mpw'] },
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'webp', 'avif', 'bmp'] },
    { name: 'All Files', extensions: ['*'] },
  ]
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.mpw') return 'application/json'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
  return 'application/octet-stream'
}

ipcMain.handle('files:open', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    defaultPath: options.defaultPath,
    filters: fileFilters(),
    properties: ['openFile', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, files: [] }
  }

  const files = await Promise.all(result.filePaths.map(async (filePath) => {
    const mime = mimeFor(filePath)
    if (mime === 'application/json' || path.extname(filePath).toLowerCase() === '.mpw') {
      return { path: filePath, name: path.basename(filePath), mime: 'application/json', text: await fs.readFile(filePath, 'utf8') }
    }
    const buffer = await fs.readFile(filePath)
    return { path: filePath, name: path.basename(filePath), mime, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
  }))

  return { canceled: false, directory: path.dirname(result.filePaths[0]), files }
})

ipcMain.handle('files:save', async (_event, options = {}) => {
  const defaultPath = options.defaultDirectory ? path.join(options.defaultDirectory, options.fileName) : options.fileName
  const result = await dialog.showSaveDialog({
    defaultPath,
    filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
  })
  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  if (options.dataUrl) {
    const base64 = String(options.dataUrl).split(',')[1] ?? ''
    await fs.writeFile(result.filePath, Buffer.from(base64, 'base64'))
  } else {
    await fs.writeFile(result.filePath, options.text ?? '', 'utf8')
  }

  return { canceled: false, filePath: result.filePath, directory: path.dirname(result.filePath) }
})

ipcMain.handle('files:write', async (_event, options = {}) => {
  if (!options.filePath) {
    return { canceled: true }
  }
  if (options.dataUrl) {
    const base64 = String(options.dataUrl).split(',')[1] ?? ''
    await fs.writeFile(options.filePath, Buffer.from(base64, 'base64'))
  } else {
    await fs.writeFile(options.filePath, options.text ?? '', 'utf8')
  }
  return { canceled: false, filePath: options.filePath }
})

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) {
    return
  }
  if (window.isMaximized()) {
    window.unmaximize()
  } else {
    window.maximize()
  }
})

ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window:force-close', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (window) {
    window.forceClose = true
    window.close()
  }
})

function focusExistingWindow() {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    focusExistingWindow()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
