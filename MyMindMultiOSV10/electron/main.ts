import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  session,
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

  // Intercept close while there are unsaved changes: ask the renderer to show a
  // Save / Don't Save / Cancel prompt instead of quitting immediately.
  mainWindow.on('close', (event) => {
    if (allowClose || !docDirty) return
    event.preventDefault()
    mainWindow?.webContents.send('app:requestClose')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Flush any file requested before the renderer finished loading.
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpen) {
      mainWindow?.webContents.send('file:opened', pendingOpen)
      pendingOpen = null
    }
  })
}

// A .mmap path passed on the command line (double-click / "Open with"). Skip the
// executable and any flags.
function fileArgFrom(argv: string[]): string | null {
  return (
    argv.slice(1).find((a) => !a.startsWith('-') && a.toLowerCase().endsWith('.mmap')) ?? null
  )
}

let pendingOpen: { filePath: string; content: string } | null = null
// Whether the renderer has unsaved changes, and whether a confirmed close is in
// progress (so the close handler lets it through).
let docDirty = false
let allowClose = false

// Read a .mmap and hand it to the renderer (or queue it until the window loads).
function openFilePath(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const payload = { filePath, content }
    if (mainWindow && !mainWindow.webContents.isLoading()) {
      mainWindow.webContents.send('file:opened', payload)
    } else {
      pendingOpen = payload
    }
  } catch {
    /* ignore unreadable file */
  }
}

// macOS delivers file-open via this event (can fire before the app is ready).
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  openFilePath(filePath)
})

// Single-instance: a second launch (e.g. double-clicking another file) should
// open that file in the existing window instead of starting a new process.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const f = fileArgFrom(argv)
    if (f) openFilePath(f)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // Allow the renderer to enumerate installed fonts (Local Font Access API).
  // 'local-fonts' is a valid runtime permission but missing from these typings.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback((permission as string) === 'local-fonts')
  })
  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission) => (permission as string) === 'local-fonts',
  )

  createWindow()

  // First launch via double-click / "Open with": load that file once ready.
  const initialFile = fileArgFrom(process.argv)
  if (initialFile) openFilePath(initialFile)

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

ipcMain.handle('window:setMinWidth', (_e, width: number) => {
  if (!mainWindow || !Number.isFinite(width)) return
  const [, minH] = mainWindow.getMinimumSize()
  const w = Math.ceil(width)
  mainWindow.setMinimumSize(w, minH)
  const [curW, curH] = mainWindow.getSize()
  if (curW < w) mainWindow.setSize(w, curH)
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

ipcMain.on('app:setDirty', (_e, dirty: boolean) => {
  docDirty = Boolean(dirty)
})

// The renderer resolved the unsaved-changes prompt (saved or discarded) — close.
ipcMain.on('app:confirmClose', () => {
  allowClose = true
  // destroy() force-closes without re-firing the guarded 'close' event.
  mainWindow?.destroy()
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
  const ext = path.extname(defaultName).replace('.', '').toLowerCase() || 'png'
  const names: Record<string, string> = {
    png: 'PNG Image',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    webp: 'WebP Image',
    svg: 'SVG Image',
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Image',
    defaultPath: defaultName,
    filters: [{ name: names[ext] ?? 'Image', extensions: [ext] }],
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
  // In a packaged app the executable's mtime is the build time; in dev, "now".
  buildDate: (app.isPackaged
    ? fs.statSync(app.getPath('exe')).mtime
    : new Date()
  ).toISOString(),
}))
