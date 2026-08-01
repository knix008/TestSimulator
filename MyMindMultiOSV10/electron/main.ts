import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  shell,
} from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const isDev = !app.isPackaged
let mainWindow: BrowserWindow | null = null

// Bundled sample templates: alongside the source in dev, under resources/ when packaged.
function templatesDir(): string {
  return isDev ? path.join(__dirname, '../template') : path.join(process.resourcesPath, 'template')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1120,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1d23',
    show: false,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  Menu.setApplicationMenu(null)

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173')
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return false
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
    return false
  }
  mainWindow.maximize()
  return true
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false
})

ipcMain.handle('dialog:save', async (_event, defaultName: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Diagram',
    defaultPath: defaultName,
    filters: [{ name: 'MyMind Diagram', extensions: ['mmap', 'mymind'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('dialog:open', async () => {
  if (!mainWindow) return null
  const templates = templatesDir()
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Diagram',
    // Start in the bundled templates folder so samples are visible right away.
    defaultPath: fs.existsSync(templates) ? templates : undefined,
    filters: [
      { name: 'MyMind Diagram', extensions: ['mymind', 'mmap'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const content = fs.readFileSync(filePath, 'utf-8')
  return { filePath, content }
})

ipcMain.handle('file:write', async (_event, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return true
})

ipcMain.handle('dialog:saveImage', async (_event, defaultName: string) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Image',
    defaultPath: defaultName,
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
  })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('file:writeBinary', async (_event, filePath: string, base64: string) => {
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
  return true
})

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  await shell.openExternal(url)
})

ipcMain.handle('app:getInfo', () => ({
  name: 'MyMind',
  version: app.getVersion(),
  author: 'SHKWON',
  email: 'knix008@naver.com',
  copyright: `Copyright © ${new Date().getFullYear()} SHKWON`,
  platform: process.platform,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
}))
