const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const isDev = !app.isPackaged
const appId = 'com.shkwon.svgeditormultios'
const runtimeIcon = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const currentWindowSize = { width: 1680, height: 940 }

if (process.platform === 'win32') {
  app.setAppUserModelId(appId)
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: currentWindowSize.width,
    height: currentWindowSize.height,
    minWidth: currentWindowSize.width,
    minHeight: currentWindowSize.height,
    title: 'SVG Editor V1.0',
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

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

function fileFilters() {
  return [
    { name: 'Images and SVG', extensions: ['svg', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'png', 'webp', 'avif'] },
    { name: 'SVG', extensions: ['svg'] },
    { name: 'Images', extensions: ['jpg', 'jpeg', 'gif', 'tif', 'tiff', 'png', 'webp', 'avif'] },
    { name: 'All Files', extensions: ['*'] },
  ]
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.avif') return 'image/avif'
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
    if (mime === 'image/svg+xml') {
      return { path: filePath, name: path.basename(filePath), mime, text: await fs.readFile(filePath, 'utf8') }
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})