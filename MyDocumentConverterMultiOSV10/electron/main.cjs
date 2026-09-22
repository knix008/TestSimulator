const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, shell, session } = require('electron')
const fs = require('node:fs/promises')
const { spawn, execFile } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const childWindows = require('./childwindows.cjs')

const isDev = !app.isPackaged
const appId = 'com.shkwon.mydocumentconverter'
const productName = 'My Document Converter V1.0'
const runtimeIcon = path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const currentWindowSize = { width: 1560, height: 920 }
// The toolbar holds every button on one line and never scrolls, so the window
// may not be made narrower than that row needs; the renderer measures the row
// and raises this through `window:min-width` when its language makes it wider.
const minimumWindowSize = { width: 1180, height: 640 }

if (process.platform === 'win32') {
  app.setAppUserModelId(appId)
}

// Chromium's disk caches throw Access Denied on Windows when two instances
// share a userData folder. Isolate the unpackaged profile and skip the shader
// disk cache.
if (isDev && !app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', path.join(app.getPath('appData'), `${productName} Dev`))
}
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

childWindows.registerBundleScheme()

/** Files handed to us by the OS (double-clicked .mdcv, "Open with"), queued until the renderer is ready. */
let pendingOpenPaths = []
let mainWindow = null
let rendererReady = false

function fileArguments(argv) {
  return argv.slice(isDev ? 2 : 1).filter((arg) => !arg.startsWith('-') && /\.[a-z0-9]+$/i.test(arg) && !/electron/i.test(path.basename(arg)))
}

function deliverPendingFiles() {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed() || pendingOpenPaths.length === 0) return
  const paths = pendingOpenPaths
  pendingOpenPaths = []
  mainWindow.webContents.send('files:open-paths', paths)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: currentWindowSize.width,
    height: currentWindowSize.height,
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    title: productName,
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

  childWindows.setMainWindow(mainWindow)

  mainWindow.on('close', (event) => {
    if (mainWindow.forceClose) {
      childWindows.closeAllChildWindows()
      return
    }
    event.preventDefault()
    mainWindow.webContents.send('window:close-request')
  })

  mainWindow.on('closed', () => {
    childWindows.closeAllChildWindows()
    mainWindow = null
  })

  // Popups run in renderers of their own; they are started once the editor is
  // on screen so the wait falls where nobody is waiting.
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) childWindows.warmChildWindows()
    }, 1200).unref?.()
  })

  if (isDev && !process.env.MDCV_SMOKE) {
    mainWindow.loadURL('http://127.0.0.1:5174').catch(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(childWindows.bundleUrl())
    })
  } else {
    mainWindow.loadURL(childWindows.bundleUrl())
  }
}

/* ------------------------------------------------------------------ files */

// Everything is text except the packaged formats and images; a text file
// with an unknown extension must still open as text.
const binaryExtensions = new Set(['.docx', '.odt', '.epub', '.pptx', '.pdf', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.doc', '.xls', '.xlsx', '.7z', '.gz', '.exe', '.dll'])

function isTextPath(filePath) {
  return !binaryExtensions.has(path.extname(filePath).toLowerCase())
}

async function readOne(filePath) {
  const stat = await fs.stat(filePath)
  if (isTextPath(filePath)) {
    return { path: filePath, name: path.basename(filePath), size: stat.size, text: await fs.readFile(filePath, 'utf8') }
  }
  const buffer = await fs.readFile(filePath)
  return { path: filePath, name: path.basename(filePath), size: stat.size, base64: buffer.toString('base64') }
}

ipcMain.handle('files:open', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    defaultPath: options.defaultPath,
    filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }],
    properties: options.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, files: [] }
  }
  try {
    const files = await Promise.all(result.filePaths.map(readOne))
    return { canceled: false, directory: path.dirname(result.filePaths[0]), files }
  } catch (error) {
    return { canceled: true, files: [], message: String(error && error.message ? error.message : error) }
  }
})

ipcMain.handle('files:read', async (_event, options = {}) => {
  const filePath = String(options.filePath ?? '')
  if (!filePath) return { canceled: true, files: [] }
  try {
    return { canceled: false, directory: path.dirname(filePath), files: [await readOne(filePath)] }
  } catch (error) {
    return { canceled: true, files: [], message: String(error && error.message ? error.message : error) }
  }
})

ipcMain.handle('files:exists', async (_event, filePath) => {
  try {
    await fs.access(String(filePath))
    return true
  } catch {
    return false
  }
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
  try {
    if (options.base64 !== undefined) {
      await fs.writeFile(result.filePath, Buffer.from(String(options.base64), 'base64'))
    } else {
      await fs.writeFile(result.filePath, options.text ?? '', 'utf8')
    }
  } catch (error) {
    return { canceled: true, message: String(error && error.message ? error.message : error) }
  }
  return { canceled: false, filePath: result.filePath, directory: path.dirname(result.filePath) }
})

ipcMain.handle('files:write', async (_event, options = {}) => {
  if (!options.filePath) {
    return { canceled: true }
  }
  try {
    if (options.base64 !== undefined) {
      await fs.writeFile(options.filePath, Buffer.from(String(options.base64), 'base64'))
    } else {
      await fs.writeFile(options.filePath, options.text ?? '', 'utf8')
    }
  } catch (error) {
    return { canceled: true, message: String(error && error.message ? error.message : error) }
  }
  return { canceled: false, filePath: options.filePath, directory: path.dirname(options.filePath) }
})

ipcMain.handle('files:choose-directory', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    defaultPath: options.defaultPath,
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }
  return { canceled: false, directory: result.filePaths[0] }
})

ipcMain.handle('files:show-in-folder', (_event, filePath) => {
  if (filePath) shell.showItemInFolder(String(filePath))
})

ipcMain.handle('files:open-external', (_event, target) => {
  if (target) return shell.openExternal(String(target))
  return undefined
})

ipcMain.handle('files:open-path', (_event, target) => {
  if (target) return shell.openPath(String(target))
  return undefined
})

/* ------------------------------------------------------------------- urls */
// Fetching a document from the web, with progress reported to every window
// so the progress popup can follow it. Pandoc accepts URLs as inputs; so do we.

const activeFetches = new Map()

function broadcast(channel, message) {
  for (const contents of require('electron').webContents.getAllWebContents()) {
    if (!contents.isDestroyed()) contents.send(channel, message)
  }
}

ipcMain.handle('url:fetch', async (_event, id, url) => {
  if (activeFetches.has(id)) return { ok: false, message: 'already fetching' }
  const controller = new AbortController()
  activeFetches.set(id, controller)
  try {
    const response = await net.fetch(String(url), { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`)
    const total = Number(response.headers.get('content-length')) || 0
    const reader = response.body.getReader()
    const chunks = []
    let received = 0
    let lastReport = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
      received += value.length
      if (Date.now() - lastReport > 120) {
        lastReport = Date.now()
        broadcast('url:progress', { id, received, total, done: false })
      }
    }
    const buffer = Buffer.concat(chunks)
    broadcast('url:progress', { id, received, total, done: true })
    const type = response.headers.get('content-type') || ''
    const name = path.basename(new URL(String(url)).pathname) || 'document'
    const textual = /^text\/|json|xml|javascript/i.test(type) || isTextPath(name)
    return { ok: true, name, contentType: type, ...(textual ? { text: buffer.toString('utf8') } : { base64: buffer.toString('base64') }) }
  } catch (error) {
    const message = String(error && error.message ? error.message : error)
    broadcast('url:progress', { id, received: 0, total: 0, done: true, error: message })
    return { ok: false, message }
  } finally {
    activeFetches.delete(id)
  }
})

ipcMain.handle('url:cancel', (_event, id) => {
  activeFetches.get(id)?.abort()
})

/* ------------------------------------------------------------------ fonts */
// Every font installed on the machine, for the font settings. Chromium's own
// `queryLocalFonts` is asked first by the renderer; this is the fallback that
// reads the system's font list directly.

function listSystemFonts() {
  return new Promise((resolve) => {
    const finish = (names) => resolve([...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
    if (process.platform === 'win32') {
      const script = "Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }"
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
        finish(error ? [] : String(stdout).split(/\r?\n/))
      })
      return
    }
    execFile('fc-list', [':', 'family'], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        finish([])
        return
      }
      finish(String(stdout).split(/\r?\n/).flatMap((line) => line.split(',')))
    })
  })
}

ipcMain.handle('fonts:list', () => listSystemFonts())

/* --------------------------------------------------------------- printing */

function defaultPrinterName() {
  return new Promise((resolve) => {
    const done = (value) => resolve(typeof value === 'string' ? value.trim() : '')
    let command
    let args
    if (process.platform === 'win32') {
      command = 'reg'
      args = ['query', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows', '/v', 'Device']
    } else {
      command = 'lpstat'
      args = ['-d']
    }
    let child
    try {
      child = spawn(command, args, { windowsHide: true })
    } catch {
      done('')
      return
    }
    let output = ''
    child.stdout?.on('data', (chunk) => { output += String(chunk) })
    child.on('error', () => done(''))
    child.on('close', () => {
      if (process.platform === 'win32') {
        const match = /Device\s+REG_SZ\s+(.+)/i.exec(output)
        done(match ? String(match[1]).split(',')[0] : '')
        return
      }
      const match = /:\s*(.+)\s*$/.exec(output.split('\n').find((line) => line.includes(':')) ?? '')
      done(match ? match[1] : '')
    })
    setTimeout(() => { try { child.kill() } catch { /* already gone */ } done('') }, 2500)
  })
}

ipcMain.handle('print:printers', async (event) => {
  try {
    const [printers, preferred] = await Promise.all([event.sender.getPrintersAsync(), defaultPrinterName()])
    const list = printers.map((printer) => ({
      name: printer.name,
      displayName: printer.displayName || printer.name,
      isDefault: Boolean(printer.isDefault) || (preferred !== '' && printer.name === preferred),
    }))
    if (list.some((printer) => printer.isDefault && printer.name === preferred)) {
      for (const printer of list) printer.isDefault = printer.name === preferred
    }
    return list
  } catch {
    return []
  }
})

async function withSheet(html, fn) {
  const sheetPath = path.join(app.getPath('temp'), `mdcv-print-${Date.now()}.html`)
  let sheet = null
  try {
    await fs.writeFile(sheetPath, String(html ?? ''), 'utf8')
    sheet = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await sheet.loadFile(sheetPath)
    return await fn(sheet)
  } finally {
    if (sheet && !sheet.isDestroyed()) sheet.destroy()
    await fs.rm(sheetPath, { force: true }).catch(() => {})
  }
}

function pageRanges(spec) {
  const ranges = []
  for (const part of String(spec ?? '').split(',')) {
    const piece = part.trim()
    if (!piece) continue
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(piece)
    if (!match) continue
    const from = Number(match[1])
    const to = match[2] ? Number(match[2]) : from
    if (from >= 1 && to >= from) ranges.push({ from: from - 1, to: to - 1 })
  }
  return ranges
}

function pageSizeOption(size) {
  const named = { A4: 'A4', A3: 'A3', A5: 'A5', Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid' }
  return named[size] ?? 'A4'
}

ipcMain.handle('print:job', async (_event, options = {}) => {
  try {
    await withSheet(options.html, (sheet) => new Promise((resolve, reject) => {
      const job = {
        silent: true,
        deviceName: options.deviceName || undefined,
        landscape: Boolean(options.landscape),
        copies: Math.max(1, Number(options.copies) || 1),
        printBackground: true,
        pageSize: pageSizeOption(options.pageSize),
        margins: { marginType: 'none' },
      }
      const ranges = pageRanges(options.pages)
      if (ranges.length) job.pageRanges = ranges
      sheet.webContents.print(job, (success, reason) => (success ? resolve() : reject(new Error(reason || 'The printer refused the job'))))
    }))
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error.message }
  }
})

/** Renders HTML to a PDF file; the PDF writer of the converter on the desktop. */
ipcMain.handle('print:pdf', async (_event, options = {}) => {
  try {
    const data = await withSheet(options.html, (sheet) => sheet.webContents.printToPDF({
      landscape: Boolean(options.landscape),
      printBackground: true,
      pageSize: pageSizeOption(options.pageSize),
      margins: { marginType: 'none' },
      ...(pageRanges(options.pages).length ? { pageRanges: String(options.pages) } : {}),
    }))
    return { ok: true, base64: Buffer.from(data).toString('base64') }
  } catch (error) {
    return { ok: false, message: error.message }
  }
})

/* ----------------------------------------------------------------- window */

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
})

ipcMain.handle('window:is-maximized', (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)

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

ipcMain.handle('window:min-width', (event, width) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return
  const next = Math.max(minimumWindowSize.width, Math.ceil(Number(width) || 0))
  window.setMinimumSize(next, minimumWindowSize.height)
  const bounds = window.getBounds()
  if (bounds.width < next) window.setBounds({ ...bounds, width: next })
})

ipcMain.handle('window:set-title', (event, title) => {
  BrowserWindow.fromWebContents(event.sender)?.setTitle(String(title || productName))
})

ipcMain.handle('window:ready', (event) => {
  if (BrowserWindow.fromWebContents(event.sender) === mainWindow) {
    rendererReady = true
    deliverPendingFiles()
  }
})

ipcMain.handle('app:paths', () => ({
  documents: app.getPath('documents'),
  downloads: app.getPath('downloads'),
  home: app.getPath('home'),
  userData: app.getPath('userData'),
  temp: app.getPath('temp'),
}))

function focusExistingWindow() {
  const window = BrowserWindow.getAllWindows().find((item) => item === mainWindow) ?? BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

if (gotSingleInstanceLock) {
  pendingOpenPaths.push(...fileArguments(process.argv))

  app.on('second-instance', (_event, argv) => {
    pendingOpenPaths.push(...fileArguments(argv))
    focusExistingWindow()
    deliverPendingFiles()
  })

  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    pendingOpenPaths.push(filePath)
    deliverPendingFiles()
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    childWindows.serveBundle()
    // `queryLocalFonts()` in the renderer needs this permission; it is ours to grant.
    session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'local-fonts' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
    })
    session.defaultSession.setPermissionCheckHandler((_contents, permission) => permission === 'local-fonts' || permission === 'clipboard-read' || permission === 'clipboard-sanitized-write')
    childWindows.registerChildWindowHandlers()
    createWindow()
    if (process.env.MDCV_SMOKE) require('./smoke.cjs').install({ childWindows, getMainWindow: () => mainWindow })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  childWindows.closeAllChildWindows()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
