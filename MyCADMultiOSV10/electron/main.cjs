const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')

const APP_TITLE = 'MyCAD 1.0.0'
// Keep in sync with toolbarMinWidth() in src/core/buildInfo.ts: every toolbar
// button, the separators and the right-aligned buttons must stay visible.
const MIN_WIDTH = 980
// Keep in sync with MIN_WINDOW_HEIGHT in src/core/buildInfo.ts: the settings
// window is a fixed 1040x700 and has to fit inside the application window.
const MIN_HEIGHT = 760
// Only one MyCAD runs at a time. A second launch hands its arguments to the
// running one (see the `second-instance` handler) and exits straight away.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.setName('MyCAD')
const userData = path.join(app.getPath('appData'), 'MyCAD')
app.setPath('userData', userData)
fs.mkdirSync(userData, { recursive: true })

const settingsFile = path.join(userData, 'settings.json')

// Every extension the installer can associate with MyCAD; keep in sync with
// FILE_TYPES in src/core/fileTypes.ts (tests/filetypes.test.ts checks it).
const SUPPORTED_EXTENSIONS = [
  'mycad', 'stl', 'obj', 'dxf', 'svg', 'scad', 'ifc',
  'step', 'stp', 'igs', 'iges', 'ply', 'off', 'dae',
  'asc', 'xyz', 'nc', 'gcode', 'mycadmacro', 'mycadaddon'
]
let pendingOpenPath = null

function fileFromArgv(argv) {
  return (argv || [])
    .slice(1)
    .filter((argument) => typeof argument === 'string' && !argument.startsWith('-'))
    .find((argument) => SUPPORTED_EXTENSIONS.includes(path.extname(argument).slice(1).toLowerCase()))
}

function sendOpenPath(filePath) {
  if (!filePath) return
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-path', filePath)
    return
  }
  pendingOpenPath = filePath
}
let mainWindow = null
const children = new Set()
let allowClose = false

function iconPath() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'public', 'favicon.png')
  ]
  return candidates.find((file) => fs.existsSync(file))
}

function createWindow() {
  const icon = iconPath()
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: APP_TITLE,
    icon,
    backgroundColor: '#1b232c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.setTitle(APP_TITLE)
  mainWindow.setOpacity(1)
  if (icon) mainWindow.setIcon(nativeImage.createFromPath(icon))
  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : '')
  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.webContents.on('did-fail-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && devUrl) mainWindow.loadURL(devUrl)
    }, 500)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const initial = pendingOpenPath || fileFromArgv(process.argv)
    pendingOpenPath = null
    if (initial) mainWindow.webContents.send('open-path', initial)
  })

  mainWindow.on('close', (event) => {
    if (allowClose) return
    event.preventDefault()
    mainWindow.webContents.send('request-close')
  })
  mainWindow.on('closed', () => {
    closeChildren()
    mainWindow = null
  })
}

/** Close every popup window; the app never outlives its own dialogs. */
function closeChildren() {
  for (const child of children) {
    if (!child.isDestroyed()) child.destroy()
  }
  children.clear()
}

function openChild(options) {
  const parent = mainWindow
  const child = new BrowserWindow({
    parent,
    modal: false,
    width: options.width,
    height: options.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: options.title || APP_TITLE,
    icon: iconPath(),
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  children.add(child)
  child.on('closed', () => children.delete(child))
  const devUrl = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : '')
  const query = `?popup=${encodeURIComponent(options.kind || 'about')}`
  if (devUrl) child.loadURL(`${devUrl}${query}`)
  else child.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { search: query })
  return child
}

app.on('before-quit', closeChildren)
app.whenReady().then(createWindow)
app.on('second-instance', (_event, argv) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  sendOpenPath(fileFromArgv(argv))
})
// macOS hands over documents through this event instead of argv.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  sendOpenPath(filePath)
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('get-version', () => '1.0.0')
ipcMain.handle('read-path', async (_event, filePath) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8')
    return { ok: true, content, filePath }
  } catch (error) {
    return { ok: false, error: String(error && error.message ? error.message : error) }
  }
})
ipcMain.handle('supported-extensions', () => SUPPORTED_EXTENSIONS)
// The renderer measures its own menu bar and toolbar and asks for a window
// minimum that keeps every button reachable.
ipcMain.handle('set-min-size', (event, width, height) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
  if (!win || win.isDestroyed()) return false
  const minWidth = Math.max(MIN_WIDTH, Math.min(2400, Math.round(Number(width) || MIN_WIDTH)))
  const minHeight = Math.max(MIN_HEIGHT, Math.min(1600, Math.round(Number(height) || MIN_HEIGHT)))
  // setMinimumSize works on the frame, the renderer measures its content, so
  // the border and title bar have to be added on top.
  const [frameWidth, frameHeight] = win.getSize()
  const [contentWidth, contentHeight] = win.getContentSize()
  const chromeWidth = Math.max(0, frameWidth - contentWidth)
  const chromeHeight = Math.max(0, frameHeight - contentHeight)
  win.setMinimumSize(minWidth + chromeWidth, minHeight + chromeHeight)
  if (contentWidth < minWidth || contentHeight < minHeight) {
    win.setContentSize(Math.max(contentWidth, minWidth), Math.max(contentHeight, minHeight))
  }
  return true
})
ipcMain.handle('list-fonts', async () => {
  try {
    const { getFonts } = require('font-list')
    const fonts = await getFonts()
    return fonts.map((font) => String(font).replace(/^"|"$/g, ''))
  } catch (error) {
    return ['Segoe UI', 'Malgun Gothic', 'Arial']
  }
})
ipcMain.handle('load-settings', async () => {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  } catch {
    return null
  }
})
ipcMain.handle('save-settings', async (_event, settings) => {
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
})
ipcMain.handle('open-file', async (_event, opts) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: opts.title,
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters,
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths[0]) return { canceled: true }
  const filePath = result.filePaths[0]
  return { canceled: false, filePath, content: fs.readFileSync(filePath, 'utf8'), directory: path.dirname(filePath) }
})
ipcMain.handle('save-file', async (_event, opts) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: opts.title,
    defaultPath: opts.defaultPath || undefined,
    filters: opts.filters
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  fs.writeFileSync(result.filePath, opts.content ?? '')
  return { canceled: false, filePath: result.filePath, directory: path.dirname(result.filePath) }
})
ipcMain.handle('show-menu', async (event, payload) => {
  const child = openChild({ kind: 'menu', width: 280, height: Math.min(720, 36 + payload.items.length * 28), title: 'Menu' })
  child.setPosition(Math.round(payload.x), Math.round(payload.y))
  return new Promise((resolve) => {
    const onPick = (_evt, id) => {
      resolve(id)
      if (!child.isDestroyed()) child.close()
    }
    ipcMain.once('menu-pick', onPick)
    child.on('closed', () => resolve(null))
    child.webContents.once('did-finish-load', () => child.webContents.send('menu-data', payload))
  })
})
// One window per kind: asking again focuses the window that is already open.
const popupWindows = new Map()
ipcMain.handle('open-popup', async (_event, payload) => {
  const kind = payload.kind || 'about'
  const existing = popupWindows.get(kind)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return
  }
  const child = openChild(payload)
  popupWindows.set(kind, child)
  child.on('closed', () => popupWindows.delete(kind))
})

// A popup edits the same settings as the main window, so whatever it changes is
// forwarded to every other window straight away.
ipcMain.on('sync-state', (event, payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents === event.sender) continue
    win.webContents.send('sync-state', payload)
  }
})
ipcMain.handle('print', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow
  await win.webContents.print({ silent: false, printBackground: true })
})
ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url)
})
ipcMain.handle('download', async (event, url) => {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        resolve({ ok: false, error: `${response.statusCode} ${url}` })
        return
      }
      const total = Number(response.headers['content-length'] || 0)
      const chunks = []
      let received = 0
      response.on('data', (chunk) => {
        chunks.push(chunk)
        received += chunk.length
        const percent = total ? Math.round((received / total) * 100) : 50
        event.sender.send('download-progress', { percent, message: url })
      })
      response.on('end', () => resolve({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', (error) => resolve({ ok: false, error: error.message }))
  })
})
ipcMain.on('resize-by', (_event, dx, dy) => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [width, height] = mainWindow.getSize()
  mainWindow.setSize(Math.max(MIN_WIDTH, Math.round(width + Number(dx) || 0)), Math.max(MIN_HEIGHT, Math.round(height + Number(dy) || 0)))
})
ipcMain.on('confirm-close', (_event, allow) => {
  if (allow && mainWindow) {
    allowClose = true
    mainWindow.close()
  }
})
